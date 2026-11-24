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
/* L'UE 334 du constat (3.5.679) : 14 p. d'autonomie pour 56 p. de cours (334.1 : 16, 334.2 : 40), la règle du contrôle. */
const cours = db.prepare('INSERT INTO cours (cours_code, annee_scolaire, cours_nom, ct_pp, section, ue_num, cours_per, ue_autonomie) VALUES (?,?,?,?,?,?,?,?)');
cours.run('334.1', A, 'Communication', 'CT', 'AESI', 334, 16, 14);
cours.run('334.2', A, 'Psychologie', 'CT', 'AESI', 334, 40, 14);
cours.run('334.3', A, 'Développement professionnel', 'Z', 'AESI', 334, 40, 14);
cours.run('337.1', A, 'Sans autonomie', 'CT', 'AESI', 337, 20, null);
db.prepare("INSERT INTO ue (ue_num, annee_scolaire, ue_nom, section, ue_aut, ue_per_cours) VALUES (334, ?, 'UE 334', 'AESI', 14, 56)").run(A);
db.prepare("INSERT INTO professeur (id, nom, prenom) VALUES (1, 'Dupont', 'Anne')").run();
const att = db.prepare(`INSERT INTO attribution (section, contrat_mdp, annee_scolaire, ue_num, num_organisation, code_cours, type_cours, code,
  professeur_id, periodes_attribuees, autonomie_attribuee, en_conge, valide) VALUES ('AESI','IIP',?,?,?,?,?,?,1,?,?,?,1)`);
const id = (...a) => att.run(A, ...a).lastInsertRowid;
const l = {};
// Organisation 1 : tout dédoublé ×2 → 28 exactement ; elle en porte 30.
l.a1 = id(334, 1, '334.1', 'CT', 'A', 16, 5, 0);
l.b1 = id(334, 1, '334.1', 'CT', 'B', 16, 5, 0);
l.a2 = id(334, 1, '334.2', 'CT', 'A', 40, 10, 0);
l.c2 = id(334, 1, '334.2', 'CT', 'C', 40, 10, 0);
l.conge = id(334, 1, '334.2', 'CT', 'G', 40, 0, 1);
l.z = id(334, 1, '334.3', 'Z', 'A', 40, 0, 0);
// Organisation 2 : non dédoublée → entre 14 et 14 ; elle en porte 15.
l.ts1 = id(334, 2, '334.1', 'CT', 'Ts', 16, 5, 0);
l.ts2 = id(334, 2, '334.2', 'CT', 'Ts', 40, 10, 0);
// Organisation 3 : dédoublement partiel (72 p.) → entre 14 et 17,2 ; elle en porte 2.
l.x1 = id(334, 3, '334.1', 'CT', 'X', 32, 0, 0);
l.x2 = id(334, 3, '334.2', 'CT', 'X', 40, 2, 0);
// Organisation 4 : dans l'intervalle → rien ne bouge.
l.y1 = id(334, 4, '334.1', 'CT', 'Y', 32, 3, 0);
l.y2 = id(334, 4, '334.2', 'CT', 'Y', 40, 12, 0);
db.prepare(`INSERT INTO utilisateur (id, email, nom_complet, role, actif, password_hash) VALUES
  (20, 'dir@x', 'Direction', 'directeur', 1, 'x'), (30, 'coo@x', 'Coordination AESI', 'coordination', 1, 'x'),
  (31, 'coo2@x', 'Coordination TIM', 'coordination', 1, 'x')`).run();
db.prepare("INSERT INTO utilisateur_section VALUES (30, 'AESI'), (31, 'TIM')").run();

const { proposerAutonomie } = await import('../src/lib/completerAutonomie.js');
let ok = 0, ko = 0;
const t = (nom, c, d = '') => { if (c) { ok++; console.log('  ok   ' + nom); } else { ko++; console.log('  FAUX ' + nom + (d ? '  → ' + JSON.stringify(d).slice(0, 300) : '')); } };
const ligne = (p, k) => p.lignes.find(x => x.id === l[k]);

console.log('\nLa règle du contrôle, organisation par organisation');
const p = proposerAutonomie({ annee: A, ueNum: 334 });
const org = n => p.organisations.find(o => o.organisation === n);
t('org. 1 dédoublée ×2 : cible 14 × 2 = 28', org(1).multiple === 2 && org(1).cible === 28, org(1));
t('org. 1 : 334.1 → 4 et 4, 334.2 reste à 10 et 10 (on retire 2)', ligne(p, 'a1').apres === 4 && ligne(p, 'b1').apres === 4 && ligne(p, 'a2').apres === 10 && !ligne(p, 'a2').change, [ligne(p, 'a1'), ligne(p, 'a2')]);
t('org. 2 non dédoublée : cible 14 → 4 et 10', org(2).cible === 14 && ligne(p, 'ts1').apres === 4 && ligne(p, 'ts2').apres === 10, org(2));
t('org. 3 sous le minimum : monte à 14, au prorata (6 et 8)', org(3).cible === 14 && ligne(p, 'x1').apres === 6 && ligne(p, 'x2').apres === 8, [org(3), ligne(p, 'x1'), ligne(p, 'x2')]);
t('org. 4 dans l’intervalle : rien ne bouge', org(4).cible === 15 && !ligne(p, 'y1').change && !ligne(p, 'y2').change, org(4));
t('une ligne en congé reste à 0', !ligne(p, 'conge').change && ligne(p, 'conge').raison === 'en congé');
t('une activité Z est exclue', !ligne(p, 'z').change && ligne(p, 'z').raison === 'activité Z');
t('lignes changées : 2 + 1 + 2 = 5', p.a_changer === 5, p.a_changer);
t('UE sans autonomie au dossier : refusée', /rien à compléter/.test(proposerAutonomie({ annee: A, ueNum: 337 }).erreur || ''));

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
let r = await appel(20, { annee: A, ue_num: 334, section: 'AESI' });
t('simulation par défaut', r.s === 200 && r.j.simulation === true && r.j.a_changer === 5, r);
t('la simulation n’écrit rien', etat() === avant);
t('une coordination d’une autre section : 403', (await appel(31, { annee: A, ue_num: 334, section: 'AESI', simulation: false })).s === 403);
t('UE sans autonomie : 409', (await appel(20, { annee: A, ue_num: 9999, section: 'AESI' })).s === 409);
r = await appel(30, { annee: A, ue_num: 334, section: 'AESI', simulation: false });
const apres = db.prepare('SELECT id, autonomie_attribuee a, valide v FROM attribution').all();
const de = k => apres.find(x => x.id === l[k]);
t('écriture : 5 lignes ajustées', r.s === 200 && r.j.ecrites === 5, r);
t('la ligne est écrite à sa part', de('a1').a === 4 && de('x2').a === 8);
t('écrite par une coordination : repassée « à valider »', de('a1').v === 0);
t('les lignes non touchées gardent leur validation', de('conge').v === 1 && de('y1').v === 1 && de('a2').v === 1);
t('journal modification_log', db.prepare("SELECT COUNT(*) n FROM modification_log WHERE action = 'update' AND utilisateur_id = 30").get().n === 5);
r = await appel(20, { annee: A, ue_num: 334, section: 'AESI', simulation: false });
t('une seconde fois : plus rien à ajuster', r.s === 200 && r.j.ecrites === 0);
srv.close();
console.log(`\n${ok} ok, ${ko} faux`);
process.exit(ko ? 1 : 0);
