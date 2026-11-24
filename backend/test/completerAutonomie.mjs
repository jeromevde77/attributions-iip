/* Banc de « Compléter l'autonomie » (Charles, 24 novembre 2026). node test/completerAutonomie.mjs
   L'UE 333 du constat : 34 p. d'autonomie pour 136 p. de cours, soit 25 % de chaque ligne. */
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucie-aut-'));
process.env.DB_PATH = path.join(dir, 'test.db');
const { default: db, runSchema } = await import('../src/db/index.js');
runSchema();
for (const s of ['ALTER TABLE attribution ADD COLUMN en_conge INTEGER DEFAULT 0', 'ALTER TABLE utilisateur ADD COLUMN perimetre_toutes INTEGER',
  'CREATE TABLE IF NOT EXISTS utilisateur_section (utilisateur_id INTEGER, section_code TEXT)']) { try { db.exec(s); } catch { /* déjà là */ } }
try { db.exec("INSERT INTO section (code) VALUES ('AESI'), ('TIM')"); } catch { /* */ }
try { db.exec("INSERT INTO annee_scolaire (code, active) VALUES ('2026-2027', 1)"); } catch { /* */ }
const A = '2026-2027';
const cours = db.prepare('INSERT INTO cours (cours_code, annee_scolaire, cours_nom, ct_pp, section, ue_num, cours_per, ue_autonomie) VALUES (?,?,?,?,?,?,?,?)');
cours.run('333.1', A, 'Cours 1', 'CT', 'AESI', 333, 10, 34);
cours.run('333.2', A, 'Cours 2', 'CT', 'AESI', 333, 32, 34);
cours.run('333.3', A, 'Cours 3', 'PP', 'AESI', 333, 64, 34);
cours.run('333.4', A, 'Cours 4', 'CT', 'AESI', 333, 30, 34);
cours.run('333.9', A, 'Développement professionnel', 'Z', 'AESI', 333, 40, 34);
cours.run('337.1', A, 'Sans autonomie', 'CT', 'AESI', 337, 20, null);
db.prepare("INSERT INTO professeur (id, nom, prenom) VALUES (1, 'Dupont', 'Anne')").run();
const att = db.prepare(`INSERT INTO attribution (section, contrat_mdp, annee_scolaire, ue_num, num_organisation, code_cours, type_cours, code,
  professeur_id, periodes_attribuees, autonomie_attribuee, en_conge, valide) VALUES ('AESI','IIP',?,?,1,?,?,?,1,?,?,?,1)`);
const id = (...a) => att.run(A, ...a).lastInsertRowid;
const l = {};
l.a1 = id(333, '333.1', 'CT', 'A', 20, 2, 0);
l.b1 = id(333, '333.1', 'CT', 'B', 20, 2, 0);
l.ts1 = id(333, '333.1', 'CT', 'Ts', 20, 4, 0);
l.a2 = id(333, '333.2', 'CT', 'A', 32, 3, 0);
l.b2 = id(333, '333.2', 'CT', 'B', 32, 3, 0);
l.c2 = id(333, '333.2', 'CT', 'C', 0, 0, 0);
for (const [g, a] of [['A', 12], ['B', 12], ['C', 12], ['D', 14], ['E', 12], ['F', 14]]) l['g3' + g] = id(333, '333.3', 'PP', g, 64, a, 0);
l.a4 = id(333, '333.4', 'CT', 'A', 20, 2, 0);
l.b4 = id(333, '333.4', 'CT', 'B', 20, 2, 0);
l.ts4 = id(333, '333.4', 'CT', 'Ts', 20, 2, 0);
l.conge = id(333, '333.3', 'PP', 'G', 64, 0, 1);
l.z = id(333, '333.9', 'Z', 'A', 40, 0, 0);
l.dessus = id(333, '333.1', 'CT', 'C', 10, 9, 0);
db.prepare(`INSERT INTO utilisateur (id, email, nom_complet, role, actif, password_hash) VALUES
  (20, 'dir@x', 'Direction', 'directeur', 1, 'x'), (30, 'coo@x', 'Coordination AESI', 'coordination', 1, 'x'),
  (31, 'coo2@x', 'Coordination TIM', 'coordination', 1, 'x')`).run();
db.prepare("INSERT INTO utilisateur_section VALUES (30, 'AESI'), (31, 'TIM')").run();

const { proposerAutonomie } = await import('../src/lib/completerAutonomie.js');
let ok = 0, ko = 0;
const t = (nom, c, d = '') => { if (c) { ok++; console.log('  ok   ' + nom); } else { ko++; console.log('  FAUX ' + nom + (d ? '  → ' + JSON.stringify(d).slice(0, 300) : '')); } };
const ligne = (p, k) => p.lignes.find(x => x.id === l[k]);

console.log('\nLe calcul');
const p = proposerAutonomie({ annee: A, ueNum: 333 });
t('taux = 34 ÷ 136 (Z hors des périodes du dossier)', p.taux === 0.25 && p.periodes_dossier === 136 && p.autonomie_dossier === 34, p);
t('20 p. → 5', ligne(p, 'a1').apres === 5 && ligne(p, 'ts1').apres === 5);
t('32 p. → 8, 64 p. → 16', ligne(p, 'a2').apres === 8 && ligne(p, 'g3D').apres === 16);
t('une ligne à 0 p. n’est pas touchée', !ligne(p, 'c2').change && ligne(p, 'c2').apres === 0);
t('une ligne en congé reste à 0', !ligne(p, 'conge').change && ligne(p, 'conge').apres === 0 && ligne(p, 'conge').raison === 'en congé');
t('une activité Z est exclue', !ligne(p, 'z').change && ligne(p, 'z').raison === 'activité Z');
t('une ligne déjà au-dessus du proposé n’est pas touchée (on ne retire jamais)', !ligne(p, 'dessus').change && ligne(p, 'dessus').apres === 9);
t('total : 96 + 9 → 142 + 9', p.total_avant === 105 && p.total_apres === 151, { a: p.total_avant, b: p.total_apres });
const pDemi = proposerAutonomie({ annee: A, ueNum: 333, arrondi: 0.5 });
db.prepare('UPDATE attribution SET periodes_attribuees = 22 WHERE id = ?').run(l.a4);
const p3 = proposerAutonomie({ annee: A, ueNum: 333 });
const p3d = proposerAutonomie({ annee: A, ueNum: 333, arrondi: 0.5 });
t('arrondi à l’entier : 22 × 25 % = 5,5 → 6', ligne(p3, 'a4').apres === 6, ligne(p3, 'a4'));
t('arrondi au demi : 22 × 25 % = 5,5', ligne(p3d, 'a4').apres === 5.5 && pDemi.arrondi === 0.5, ligne(p3d, 'a4'));
db.prepare('UPDATE attribution SET periodes_attribuees = 20 WHERE id = ?').run(l.a4);
t('UE sans autonomie au dossier : refusée', /rien à compléter/.test(proposerAutonomie({ annee: A, ueNum: 337 }).erreur || ''));
t('à défaut de cours.ue_autonomie, ue.ue_aut', (() => {
  db.prepare("INSERT INTO ue (ue_num, annee_scolaire, ue_nom, section, ue_aut) VALUES (337, ?, 'UE 337', 'AESI', 5)").run(A);
  return proposerAutonomie({ annee: A, ueNum: 337 }).autonomie_dossier === 5;
})());

console.log('\nLa route');
const { default: express } = await import('express');
const { signToken } = await import('../src/middleware/auth.js');
const route = (await import('../src/routes/attributions.js')).default;
const app = express(); app.use(express.json()); app.use('/api/attributions', route);
const srv = app.listen(0); const port = srv.address().port;
const tok = uid => signToken(db.prepare('SELECT * FROM utilisateur WHERE id = ?').get(uid));
const appel = async (uid, b) => { const r = await fetch(`http://127.0.0.1:${port}/api/attributions/autonomie/completer`, { method: 'POST',
  headers: { Authorization: `Bearer ${tok(uid)}`, 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return { s: r.status, j: await r.json().catch(() => null) }; };
const etat = () => JSON.stringify(db.prepare('SELECT id, autonomie_attribuee, valide FROM attribution ORDER BY id').all());
const avant = etat();
let r = await appel(20, { annee: A, ue_num: 333, section: 'AESI' });
t('simulation par défaut', r.s === 200 && r.j.simulation === true && r.j.a_changer === 14, r);
t('la simulation n’écrit rien', etat() === avant);
t('une coordination d’une autre section : 403', (await appel(31, { annee: A, ue_num: 333, section: 'AESI', simulation: false })).s === 403);
t('UE sans autonomie : 409', (await appel(20, { annee: A, ue_num: 9999, section: 'AESI' })).s === 409);
r = await appel(30, { annee: A, ue_num: 333, section: 'AESI', simulation: false });
const apres = db.prepare('SELECT id, autonomie_attribuee a, valide v FROM attribution').all();
const de = k => apres.find(x => x.id === l[k]);
t('écriture : 14 lignes complétées', r.s === 200 && r.j.ecrites === 14, r);
t('la ligne est écrite au proposé', de('a1').a === 5 && de('g3F').a === 16);
t('écrite par une coordination : repassée « à valider »', de('a1').v === 0);
t('les lignes non touchées gardent leur validation', de('conge').v === 1 && de('dessus').v === 1 && de('dessus').a === 9);
t('journal modification_log', db.prepare("SELECT COUNT(*) n FROM modification_log WHERE action = 'update' AND utilisateur_id = 30").get().n === 14);
r = await appel(20, { annee: A, ue_num: 333, section: 'AESI', simulation: false });
t('une seconde fois : plus rien à compléter', r.s === 200 && r.j.ecrites === 0);
srv.close();
console.log(`\n${ok} ok, ${ko} faux`);
process.exit(ko ? 1 : 0);
