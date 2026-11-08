/* Banc de « Mes stages » et du lien du maître de stage (3.5.213). node test/mesStages.mjs */
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { createHash } from 'node:crypto';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucie-messtages-'));
process.env.DB_PATH = path.join(dir, 'test.db');
const db = (await import('../src/db/index.js')).default;
const { migrerStages } = await import('../src/routes/stages.js');
const { migrerFiches } = await import('../src/routes/fichesEvaluation.js');
const mod = await import('../src/routes/mesStages.js');
const r = mod.default, pub = mod.publique;
let ok = 0, ko = 0;
const t = (nom, c, d = '') => { if (c) { ok++; console.log('  ok   ' + nom); } else { ko++; console.log('  FAUX ' + nom + (d ? '  → ' + JSON.stringify(d) : '')); } };
for (const s of [
  'CREATE TABLE IF NOT EXISTS professeur (id INTEGER PRIMARY KEY, nom TEXT, prenom TEXT)',
  'CREATE TABLE IF NOT EXISTS utilisateur (id INTEGER PRIMARY KEY, email TEXT, nom TEXT, nom_complet TEXT, role TEXT, professeur_id INTEGER, actif INTEGER DEFAULT 1)',
  'CREATE TABLE IF NOT EXISTS etudiant (id INTEGER PRIMARY KEY, nom TEXT, prenom TEXT, email_ecole TEXT, section_rattachement TEXT, actif INTEGER DEFAULT 1)',
  'CREATE TABLE IF NOT EXISTS ue (ue_num INTEGER, annee_scolaire TEXT, ue_nom TEXT, section TEXT)',
  'CREATE TABLE IF NOT EXISTS aa (aa_code TEXT PRIMARY KEY, ue_num INTEGER, cours_code TEXT, aa_num INTEGER, description TEXT)',
  'CREATE TABLE IF NOT EXISTS aa_ponderation (annee_scolaire TEXT, ue_num INTEGER, cours_code TEXT, aa_code TEXT, poids REAL)',
  "CREATE TABLE IF NOT EXISTS lucie_notification (id INTEGER PRIMARY KEY, type TEXT, titre TEXT, corps TEXT, lien TEXT, cible_role TEXT, cible_user_id INTEGER, cree_par TEXT, section TEXT, cree_le TEXT DEFAULT (datetime('now')), lue_par TEXT DEFAULT '[]')",
]) { try { db.exec(s); } catch { /* existe */ } }
migrerStages(db); migrerFiches(db);
const A = '2026-2027';
db.prepare("INSERT INTO professeur (id, nom, prenom) VALUES (1,'Dupont','Anne'),(2,'Martin','Paul')").run();
db.prepare("INSERT INTO utilisateur (id, email, role, professeur_id) VALUES (10,'anne@x','professeur',1),(20,'paul@x','professeur',2)").run();
db.prepare("INSERT INTO etudiant (id, nom, prenom, section_rattachement) VALUES (7,'Lambert','Marie','TIM')").run();
db.prepare(`INSERT INTO ue (ue_num, annee_scolaire, ue_nom, section) VALUES (77, ?, 'Stage d’imagerie', 'TIM')`).run(A);
db.prepare("INSERT INTO aa (aa_code, ue_num, cours_code, aa_num, description) VALUES ('AA77.1',77,'77.1',1,'Positionner le patient'),('AA77.2',77,'77.1',2,'Communiquer')").run();
const lieu = db.prepare("INSERT INTO stage_lieu (nom, service) VALUES ('CHU Saint-Pierre', 'Radiologie')").run().lastInsertRowid;
const st = db.prepare(`INSERT INTO stage (etudiant_id, annee_scolaire, ue_num, section, lieu_id, maitre_stage, professeur_id, date_debut, date_fin)
  VALUES (7, ?, 77, 'TIM', ?, 'Dr Peeters', 1, '2026-11-02', '2026-12-18')`).run(A, lieu).lastInsertRowid;
const ev = db.prepare(`INSERT INTO carnet_evaluation (annee_scolaire, cours_code, ue_num, intitule, sur, poids, session, ordre, par_acquis) VALUES (?, '77.1', 77, 'Lieu', 20, 1, 1, 1, 1)`).run(A).lastInsertRowid;
db.prepare("INSERT INTO carnet_evaluation_aa (evaluation_id, aa_code, poids) VALUES (?, 'AA77.1', 1), (?, 'AA77.2', 1)").run(ev, ev);
const ins = db.prepare(`INSERT INTO fiche_modele (annee_scolaire, domaine, ue_num, cours_code, intitule, rempli_par, sur, evaluation_id) VALUES (?, 'stage', 77, '77.1', ?, ?, 20, ?)`);
const fm = ins.run(A, 'Fiche du lieu de stage', 'maitre_stage', ev).lastInsertRowid;
const fe = ins.run(A, 'Auto-évaluation', 'etudiant', ev).lastInsertRowid;
db.prepare("INSERT INTO fiche_critere (fiche_id, aa_code, poids, consigne, ordre) VALUES (?, 'AA77.1', 1, 'Sécurité', 0), (?, 'AA77.2', 1, NULL, 1)").run(fm, fm);

const appel = (routeur, methode, chemin, user, { query = {}, body = {}, params = {} } = {}) => new Promise(res => {
  const couche = routeur.stack.find(l => l.route?.path === chemin && l.route.methods[methode]);
  const h = couche.route.stack.at(-1).handle;
  const rep = { code: 200, status(c) { this.code = c; return this; }, json(j) { res({ code: this.code, j }); }, setHeader() {} };
  h({ user, query: { annee: A, ...query }, body, params, headers: {} }, rep);
});
const anne = { id: 10, email: 'anne@x', role: 'professeur' }, paul = { id: 20, email: 'paul@x', role: 'professeur' };

console.log('\nLe superviseur');
let x = await appel(r, 'get', '/', anne);
t('Anne voit son stage', x.j.stages.length === 1 && x.j.stages[0].lieu.nom === 'CHU Saint-Pierre', x.j);
t('fiche du maître : à elle (encodage à sa place), auto-évaluation : non', x.j.stages[0].fiches.find(f => f.id === fm).a_moi && !x.j.stages[0].fiches.find(f => f.id === fe).a_moi);
x = await appel(r, 'get', '/', paul);
t('Paul ne voit pas le stage d’Anne', x.j.stages.length === 0);
x = await appel(r, 'put', '/:stageId/fiche/:ficheId', paul, { params: { stageId: st, ficheId: fm }, body: { notes: [] } });
t('un autre professeur : introuvable', x.code === 404);
x = await appel(r, 'put', '/:stageId/fiche/:ficheId', anne, { params: { stageId: st, ficheId: fe }, body: { notes: [] } });
t('l’auto-évaluation ne se remplit pas par le superviseur', x.code === 403);
x = await appel(r, 'put', '/:stageId/fiche/:ficheId', anne, { params: { stageId: st, ficheId: fm }, body: { notes: [{ aa_code: 'AA77.1', valeur: '14' }] } });
t('le superviseur encode à la place du maître', x.code === 200 && x.j.ecrites === 1, x);

console.log('\nLe lien du maître de stage');
x = await appel(r, 'post', '/:stageId/fiche/:ficheId/lien', anne, { params: { stageId: st, ficheId: fm }, body: {} });
t('sans adresse : refusé', x.code === 400, x);
x = await appel(r, 'post', '/:stageId/fiche/:ficheId/lien', anne, { params: { stageId: st, ficheId: fe }, body: { email: 'm@lieu.be' } });
t('pas pour une fiche qui n’est pas celle du maître', x.code === 404);
x = await appel(r, 'post', '/:stageId/fiche/:ficheId/lien', anne, { params: { stageId: st, ficheId: fm }, body: { email: 'm@lieu.be' } });
t('lien envoyé', x.code === 200 && x.j.email === 'm@lieu.be', x);
t('l’adresse est retenue sur le stage', db.prepare('SELECT maitre_email FROM stage WHERE id = ?').get(st).maitre_email === 'm@lieu.be');
x = await appel(r, 'post', '/:stageId/fiche/:ficheId/lien', anne, { params: { stageId: st, ficheId: fm }, body: { email: 'm@lieu.be' } });
t('un second lien révoque le premier', db.prepare('SELECT COUNT(*) n FROM stage_lien_maitre WHERE revoque_le IS NULL').get().n === 1);
// un jeton connu, pour la page publique
db.prepare("UPDATE stage_lien_maitre SET revoque_le = datetime('now')").run();
const J = 'jeton-de-test-0123456789';
db.prepare(`INSERT INTO stage_lien_maitre (stage_id, fiche_id, empreinte, email, expire_le) VALUES (?, ?, ?, 'm@lieu.be', '2099-01-01')`)
  .run(st, fm, createHash('sha256').update(J).digest('hex'));
x = await appel(pub, 'get', '/:jeton', null, { params: { jeton: 'faux' } });
t('jeton faux : 404', x.code === 404);
x = await appel(pub, 'get', '/:jeton', null, { params: { jeton: J } });
t('la page montre l’étudiant et les critères', x.code === 200 && x.j.etudiant === 'LAMBERT Marie' && x.j.fiche.criteres.length === 2, x.j);
t('elle ne montre pas les codes internes… mais les libellés', x.j.fiche.criteres[0].description === 'Positionner le patient');
t('elle reprend la note déjà encodée', x.j.fiche.criteres[0].note?.points === 14);
x = await appel(pub, 'put', '/:jeton', null, { params: { jeton: J }, body: { nom: 'Dr Peeters', notes: [{ aa_code: 'AA77.1', valeur: '15' }, { aa_code: 'AA77.2', valeur: '17' }] } });
t('le maître enregistre', x.code === 200 && x.j.ecrites === 2, x);
const n = db.prepare('SELECT points, saisi_par FROM carnet_note WHERE evaluation_id = ? AND etudiant_id = 7').get(ev);
t('la note d’ensemble est dans le carnet, à son nom', n && n.points === 16 && /maître de stage, par lien/.test(n.saisi_par), n);
t('le superviseur est prévenu, lui seul', db.prepare("SELECT cible_user_id, cible_role FROM lucie_notification WHERE type = 'stage_maitre'").all().every(z => z.cible_user_id === 10));
db.prepare("UPDATE stage_lien_maitre SET expire_le = '2020-01-01'").run();
x = await appel(pub, 'get', '/:jeton', null, { params: { jeton: J } });
t('lien expiré : 404', x.code === 404);
x = await appel(r, 'get', '/', anne);
t('le superviseur lit que le maître a rempli', !!x.j.stages[0].fiches.find(f => f.id === fm).lien?.rempli_le, x.j.stages[0].fiches);
console.log(`\n${ok} ok, ${ko} faux`);
process.exit(ko ? 1 : 0);
