/* Banc de « Mes TFE » (3.5.210) : le professeur lit ses TFE et remplit la fiche de SON rôle ; la note va dans le carnet.
   node test/mesTfe.mjs — code de sortie non nul au premier faux. */
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucie-mestfe-'));
process.env.DB_PATH = path.join(dir, 'test.db');
const db = (await import('../src/db/index.js')).default;
const { migrerTfe } = await import('../src/routes/tfe.js');
const { migrerTfeEspace } = await import('../src/lib/portailTfeStage.js');
const { migrerFiches } = await import('../src/routes/fichesEvaluation.js');
const r = (await import('../src/routes/mesTfe.js')).default;
let ok = 0, ko = 0;
const t = (nom, c, d = '') => { if (c) { ok++; console.log('  ok   ' + nom); } else { ko++; console.log('  FAUX ' + nom + (d ? '  → ' + JSON.stringify(d) : '')); } };
for (const s of [
  'CREATE TABLE IF NOT EXISTS professeur (id INTEGER PRIMARY KEY, nom TEXT, prenom TEXT)',
  'CREATE TABLE IF NOT EXISTS utilisateur (id INTEGER PRIMARY KEY, email TEXT, nom TEXT, nom_complet TEXT, role TEXT, professeur_id INTEGER)',
  'CREATE TABLE IF NOT EXISTS etudiant (id INTEGER PRIMARY KEY, nom TEXT, prenom TEXT, email_ecole TEXT, section_rattachement TEXT, actif INTEGER DEFAULT 1)',
  'CREATE TABLE IF NOT EXISTS ue (ue_num INTEGER, annee_scolaire TEXT, ue_nom TEXT, section TEXT)',
  'CREATE TABLE IF NOT EXISTS aa (aa_code TEXT PRIMARY KEY, ue_num INTEGER, cours_code TEXT, aa_num INTEGER, description TEXT)',
  'CREATE TABLE IF NOT EXISTS aa_ponderation (annee_scolaire TEXT, ue_num INTEGER, cours_code TEXT, aa_code TEXT, poids REAL)',
]) { try { db.exec(s); } catch { /* existe */ } }
migrerTfe(db); migrerTfeEspace(db); migrerFiches(db);
const A = '2026-2027';
db.prepare("INSERT INTO professeur (id, nom, prenom) VALUES (1,'Dupont','Anne'),(2,'Martin','Paul')").run();
db.prepare("INSERT INTO utilisateur (id, email, role, professeur_id) VALUES (10,'anne@x','professeur',1),(20,'paul@x','professeur',2),(30,'sans@x','professeur',NULL)").run();
db.prepare("INSERT INTO etudiant (id, nom, prenom, section_rattachement) VALUES (7,'Lambert','Marie','TIM')").run();
db.prepare(`INSERT INTO ue (ue_num, annee_scolaire, ue_nom, section) VALUES (264, ?, 'Épreuve intégrée', 'TIM')`).run(A);
db.prepare("INSERT INTO aa (aa_code, ue_num, cours_code, aa_num, description) VALUES ('AA264.1',264,'264.1',1,'Rédiger'),('AA264.2',264,'264.1',2,'Défendre')").run();
const tfe = db.prepare(`INSERT INTO tfe (etudiant_id, annee_scolaire, ue_num, titre, section) VALUES (7, ?, 264, 'Mon TFE', 'TIM')`).run(A).lastInsertRowid;
db.prepare("INSERT INTO tfe_membre (tfe_id, role, professeur_id) VALUES (?, 'promoteur', 1), (?, 'lecteur', 2)").run(tfe, tfe);
const ev = db.prepare(`INSERT INTO carnet_evaluation (annee_scolaire, cours_code, ue_num, intitule, sur, poids, session, ordre, par_acquis) VALUES (?, '264.1', 264, 'Écrit', 20, 1, 1, 1, 1)`).run(A).lastInsertRowid;
db.prepare("INSERT INTO carnet_evaluation_aa (evaluation_id, aa_code, poids) VALUES (?, 'AA264.1', 1), (?, 'AA264.2', 1)").run(ev, ev);
const fp = db.prepare(`INSERT INTO fiche_modele (annee_scolaire, domaine, ue_num, cours_code, intitule, rempli_par, sur, evaluation_id) VALUES (?, 'tfe', 264, '264.1', 'Écrit', 'promoteur', 20, ?)`).run(A, ev).lastInsertRowid;
db.prepare("INSERT INTO fiche_critere (fiche_id, aa_code, poids, consigne, ordre) VALUES (?, 'AA264.1', 1, 'Clarté', 0), (?, 'AA264.2', 1, NULL, 1)").run(fp, fp);
const fl = db.prepare(`INSERT INTO fiche_modele (annee_scolaire, domaine, ue_num, cours_code, intitule, rempli_par, sur, evaluation_id) VALUES (?, 'tfe', 264, '264.1', 'Lecture', 'lecteur', 20, ?)`).run(A, ev).lastInsertRowid;

// Appeler une route du routeur sans serveur : le dernier gestionnaire de la couche (après authRequired).
const appel = (methode, chemin, user, { query = {}, body = {}, params = {} } = {}) => new Promise(res => {
  const couche = r.stack.find(l => l.route?.path === chemin && l.route.methods[methode]);
  const h = couche.route.stack.at(-1).handle;
  const rep = { code: 200, status(c) { this.code = c; return this; }, json(j) { res({ code: this.code, j }); }, setHeader() {} };
  h({ user, query: { annee: A, ...query }, body, params, headers: {} }, rep);
});
const anne = { id: 10, email: 'anne@x', role: 'professeur' }, paul = { id: 20, email: 'paul@x', role: 'professeur' };

console.log('\nLire ses TFE');
let x = await appel('get', '/', anne);
t('Anne voit son TFE', x.j.tfes.length === 1 && x.j.tfes[0].roles_libelles[0] === 'Promoteur', x.j);
const fa = x.j.tfes[0].fiches;
t('deux fiches, une à elle', fa.length === 2 && fa.filter(f => f.a_moi).length === 1 && fa.find(f => f.a_moi).intitule === 'Écrit');
t('le critère porte le libellé de l’acquis', fa[0].criteres[0].description === 'Rédiger', fa[0].criteres[0]);
x = await appel('get', '/', { id: 30, role: 'professeur' });
t('compte non relié : dit, sans erreur', x.j.relie === false && x.j.tfes.length === 0);

console.log('\nRemplir la fiche');
x = await appel('put', '/:tfeId/fiche/:ficheId', paul, { params: { tfeId: tfe, ficheId: fp }, body: { notes: [{ aa_code: 'AA264.1', valeur: '12' }] } });
t('le lecteur ne remplit pas la fiche du promoteur', x.code === 403, x);
x = await appel('put', '/:tfeId/fiche/:ficheId', anne, { params: { tfeId: tfe, ficheId: fp }, body: { notes: [{ aa_code: 'AA264.1', valeur: '25' }] } });
t('au-delà du maximum : refusé', x.code === 400, x);
x = await appel('put', '/:tfeId/fiche/:ficheId', anne, { params: { tfeId: tfe, ficheId: fp }, body: { notes: [{ aa_code: 'AA264.1', valeur: '12' }, { aa_code: 'AA264.2', valeur: '16,5' }] } });
t('le promoteur remplit sa fiche', x.code === 200 && x.j.ecrites === 2, x);
const aa = db.prepare('SELECT aa_code, points FROM carnet_note_aa WHERE evaluation_id = ? ORDER BY aa_code').all(ev);
t('les notes par acquis sont dans le carnet', aa.length === 2 && aa[1].points === 16.5, aa);
const ens = db.prepare('SELECT points FROM carnet_note WHERE evaluation_id = ? AND etudiant_id = 7').get(ev);
t('la note d’ensemble est recalculée', ens && Math.abs(ens.points - 14.25) < 0.01, ens);
x = await appel('put', '/:tfeId/fiche/:ficheId', anne, { params: { tfeId: tfe, ficheId: fp }, body: { notes: [{ aa_code: 'AA999', valeur: '10' }] } });
t('un acquis hors fiche : refusé', x.code === 400);
x = await appel('put', '/:tfeId/fiche/:ficheId', { id: 30, role: 'professeur' }, { params: { tfeId: tfe, ficheId: fp }, body: { notes: [] } });
t('hors jury : introuvable', x.code === 404);
x = await appel('get', '/', anne);
t('relue, la fiche porte ses notes', x.j.tfes[0].fiches.find(f => f.a_moi).criteres.every(c => c.note));
console.log(`\n${ok} ok, ${ko} faux`);
process.exit(ko ? 1 : 0);
