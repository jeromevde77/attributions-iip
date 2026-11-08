/* Banc des candidatures des enseignants (3.5.229). node test/candidatures.mjs */
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucie-cand-'));
process.env.DB_PATH = path.join(dir, 'test.db');
const db = (await import('../src/db/index.js')).default;
for (const s of ['CREATE TABLE IF NOT EXISTS professeur (id INTEGER PRIMARY KEY, nom TEXT, prenom TEXT, matricule TEXT, statut TEXT)',
  'CREATE TABLE IF NOT EXISTS utilisateur (id INTEGER PRIMARY KEY, email TEXT, nom_complet TEXT, role TEXT, professeur_id INTEGER, actif INTEGER DEFAULT 1, perimetre_toutes INTEGER)',
  'CREATE TABLE IF NOT EXISTS utilisateur_section (utilisateur_id INTEGER, section_code TEXT)',
  'CREATE TABLE IF NOT EXISTS lucie_config (cle TEXT PRIMARY KEY, valeur TEXT)',
  'CREATE TABLE IF NOT EXISTS lucie_notification (id INTEGER PRIMARY KEY, type TEXT, titre TEXT, corps TEXT, lien TEXT, cible_role TEXT, cible_user_id INTEGER, cree_par TEXT)',
  'CREATE TABLE IF NOT EXISTS cours (cours_code TEXT, annee_scolaire TEXT, cours_nom TEXT, ue_num INTEGER, cours_per INTEGER)',
  'CREATE TABLE IF NOT EXISTS ue (ue_num INTEGER, annee_scolaire TEXT, ue_nom TEXT, section TEXT)', 'CREATE TABLE IF NOT EXISTS annee_scolaire (code TEXT, active INTEGER)']) { try { db.exec(s); } catch { /* */ } }
db.prepare("INSERT INTO annee_scolaire VALUES ('2026-2027', 1)").run();
db.prepare("INSERT INTO professeur VALUES (1,'Dupont','Anne','M1','CC')").run();
db.prepare("INSERT INTO utilisateur (id,email,role,professeur_id) VALUES (10,'anne@x','professeur',1),(20,'dir@x','directeur',NULL),(30,'coo@x','coordination',NULL)").run();
db.prepare("INSERT INTO utilisateur_section VALUES (30,'TIM')").run();
db.prepare("INSERT INTO ue VALUES (256,'2026-2027','Imagerie','TIM')").run();
db.prepare("INSERT INTO cours VALUES ('256.2','2026-2027','Scanner',256,40)").run();
const { default: express } = await import('express');
const { signToken } = await import('../src/middleware/auth.js');
const route = (await import('../src/routes/candidatures.js')).default;
const app = express(); app.use(express.json()); app.use((req, _r, n) => { req.headers['x-annee'] = '2026-2027'; n(); }); app.use('/api/candidatures', route);
const srv = app.listen(0); const port = srv.address().port;
const tok = id => signToken(db.prepare('SELECT * FROM utilisateur WHERE id = ?').get(id));
const appel = async (id, m, u, b) => { const r = await fetch(`http://127.0.0.1:${port}/api/candidatures${u}`, { method: m, headers: { Authorization: `Bearer ${tok(id)}`, 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); return { s: r.status, j: await r.json().catch(() => null) }; };
let ok = 0, ko = 0;
const t = (nom, c, d = '') => { if (c) { ok++; console.log('  ok   ' + nom); } else { ko++; console.log('  FAUX ' + nom + (d ? '  → ' + JSON.stringify(d).slice(0, 300) : '')); } };
t('campagne fermée : dépôt refusé', (await appel(10, 'POST', '/moi', { maintien: true, conditions: true })).s === 409);
t('le professeur ne règle pas la campagne', (await appel(10, 'PUT', '/reglage', { annee_cible: '2027-2028', du: '2026-01-01', au: '2030-01-01' })).s === 403);
t('la direction ouvre la campagne', (await appel(20, 'PUT', '/reglage', { annee_cible: '2027-2028', du: '2026-01-01', au: '2030-01-01' })).j?.ouverte === true);
t('rien coché : refusé', (await appel(10, 'POST', '/moi', { conditions: true })).s === 400);
t('sans les conditions légales : refusé', (await appel(10, 'POST', '/moi', { maintien: true })).s === 400);
t('renoncer + maintien : refusé', (await appel(10, 'POST', '/moi', { maintien: true, renonce: true })).s === 400);
t('définitif sans unité : refusé', (await appel(10, 'POST', '/moi', { definitif: true, conditions: true })).s === 400);
let r = await appel(10, 'POST', '/moi', { maintien: true, definitif: true, conditions: true, lignes: [{ nature: 'definitif', section: 'TIM', ue_num: 256, cours_code: '256.2', cours_nom: 'Scanner', periodes: 40 }] });
t('dépôt : accusé de réception', r.s === 200 && /reçue le/.test(r.j.accuse), r);
const r2 = await appel(10, 'POST', '/moi', { maintien: true, conditions: true });
t('un second dépôt remplace le premier', r2.s === 200 && db.prepare('SELECT statut FROM candidature_mdp WHERE id = ?').get(r.j.id).statut === 'remplacee');
const l = await appel(30, 'GET', '/');
t('la coordination ne voit pas une candidature hors de ses sections', l.s === 200 && l.j.candidatures.length === 0, l.j);
r = await appel(10, 'POST', '/moi', { temporaire: true, conditions: true, lignes: [{ section: 'TIM', ue_num: 256, cours_code: '256.2' }] });
t('… et voit celle qui vise TIM', (await appel(30, 'GET', '/')).j.candidatures.length === 1);
t('la coordination analyse', (await appel(30, 'PUT', `/${r.j.id}/statut`, { statut: 'analysee' })).s === 200);
t('… mais ne décide pas', (await appel(30, 'PUT', `/${r.j.id}/statut`, { statut: 'retenue' })).s === 403);
t('en analyse : l’enseignant ne remplace plus', (await appel(10, 'POST', '/moi', { maintien: true, conditions: true })).s === 409);
t('non retenue sans mot : refusé', (await appel(20, 'PUT', `/${r.j.id}/statut`, { statut: 'non_retenue' })).s === 400);
t('la pièce se lit par son auteur', (await appel(10, 'GET', `/${r.j.id}/document`)).j?.html?.includes('Candidature à titre temporaire'));
t('la direction a été prévenue', db.prepare("SELECT COUNT(*) n FROM lucie_notification WHERE type='candidature'").get().n >= 3);
srv.close();
console.log(`\n${ok} ok, ${ko} faux`);
process.exit(ko ? 1 : 0);
