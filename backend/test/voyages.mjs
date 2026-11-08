/* Banc des voyages d'études (3.5.230). node test/voyages.mjs */
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucie-voy-'));
process.env.DB_PATH = path.join(dir, 'test.db');
const db = (await import('../src/db/index.js')).default;
for (const s of ['CREATE TABLE IF NOT EXISTS professeur (id INTEGER PRIMARY KEY, nom TEXT, prenom TEXT, matricule TEXT, statut TEXT)',
  'CREATE TABLE IF NOT EXISTS utilisateur (id INTEGER PRIMARY KEY, email TEXT, nom_complet TEXT, role TEXT, professeur_id INTEGER, actif INTEGER DEFAULT 1, perimetre_toutes INTEGER)',
  'CREATE TABLE IF NOT EXISTS utilisateur_section (utilisateur_id INTEGER, section_code TEXT)',
  'CREATE TABLE IF NOT EXISTS lucie_config (cle TEXT PRIMARY KEY, valeur TEXT)',
  'CREATE TABLE IF NOT EXISTS lucie_notification (id INTEGER PRIMARY KEY, type TEXT, titre TEXT, corps TEXT, lien TEXT, cible_role TEXT, cible_user_id INTEGER, cree_par TEXT)',
  'CREATE TABLE IF NOT EXISTS cours (cours_code TEXT, annee_scolaire TEXT, cours_nom TEXT, ue_num INTEGER, cours_per INTEGER)',
  'CREATE TABLE IF NOT EXISTS etudiant (id INTEGER PRIMARY KEY, nom TEXT, prenom TEXT, section_rattachement TEXT)', 'CREATE TABLE IF NOT EXISTS etudiant_inscription (etudiant_id INTEGER, annee_scolaire TEXT, ue_num INTEGER)', 'CREATE TABLE IF NOT EXISTS section (code TEXT, libelle TEXT)', 'CREATE TABLE IF NOT EXISTS ue (ue_num INTEGER, annee_scolaire TEXT, ue_nom TEXT, section TEXT)', 'CREATE TABLE IF NOT EXISTS annee_scolaire (code TEXT, active INTEGER)']) { try { db.exec(s); } catch { /* */ } }
db.prepare("INSERT INTO annee_scolaire VALUES ('2026-2027', 1)").run();
db.prepare("INSERT INTO professeur VALUES (1,'Dupont','Anne','M1','CC')").run();
db.prepare("INSERT INTO utilisateur (id,email,role,professeur_id) VALUES (10,'anne@x','professeur',1),(20,'dir@x','directeur',NULL),(30,'coo@x','coordination',NULL)").run();
db.prepare("INSERT INTO utilisateur_section VALUES (30,'TIM')").run();
db.prepare("INSERT INTO ue VALUES (256,'2026-2027','Imagerie','TIM')").run();
db.prepare("INSERT INTO cours VALUES ('256.2','2026-2027','Scanner',256,40)").run();
const { default: express } = await import('express');
const { signToken } = await import('../src/middleware/auth.js');
const route = (await import('../src/routes/voyages.js')).default;
const app = express(); app.use(express.json()); app.use((req, _r, n) => { req.headers['x-annee'] = '2026-2027'; n(); }); app.use('/api/voyages', route);
const srv = app.listen(0); const port = srv.address().port;
const tok = id => signToken(db.prepare('SELECT * FROM utilisateur WHERE id = ?').get(id));
const appel = async (id, m, u, b) => { const r = await fetch(`http://127.0.0.1:${port}/api/voyages${u}`, { method: m, headers: { Authorization: `Bearer ${tok(id)}`, 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); return { s: r.status, j: await r.json().catch(() => null) }; };
let ok = 0, ko = 0;
const t = (nom, c, d = '') => { if (c) { ok++; console.log('  ok   ' + nom); } else { ko++; console.log('  FAUX ' + nom + (d ? '  → ' + JSON.stringify(d).slice(0, 300) : '')); } };
db.prepare("INSERT INTO etudiant VALUES (5,'Bernard','Léa','TIM'),(6,'Durand','Tom','OPTO')").run();
db.prepare("INSERT INTO etudiant_inscription VALUES (5,'2026-2027',256),(6,'2026-2027',300)").run();
let r = await appel(10, 'POST', '/', { titre: 'Visite du CHU de Lille' });
const id = r.j.id;
t('le professeur crée une demande, il en est le référent', r.s === 200 && r.j.referent_user_id === 10, r);
t('soumettre incomplet : refusé, en nommant ce qui manque', /destination/.test((await appel(10, 'POST', `/${id}/soumettre`)).j?.error || ''));
r = await appel(10, 'PUT', `/${id}`, { section: 'TIM', du: '2027-03-10', au: '2027-03-11', destination: 'Lille', nb_etudiants: 20,
  lignes: [{ partie: 'etudiants', rubrique: 'transport', montant: 25, nombre: 20 }, { partie: 'accompagnateurs', rubrique: 'logement', montant: 80, nombre: 2 }, { partie: 'x', rubrique: 'transport' }],
  financement: { etudiants: { oui: true, montant: 200 } } });
t('le devis se totalise (ligne invalide écartée)', r.j.total_etudiants === 500 && r.j.total_accompagnateurs === 160 && r.j.total === 660 && r.j.lignes.length === 2, r.j);
t('la coordination de TIM lit la demande', (await appel(30, 'GET', '/')).j.voyages.length === 1);
t('soumettre', (await appel(10, 'POST', `/${id}/soumettre`)).j?.statut === 'soumis');
t('soumise : le référent ne modifie plus', (await appel(10, 'PUT', `/${id}`, { destination: 'Paris' })).s === 409);
t('le professeur ne valide pas', (await appel(10, 'POST', `/${id}/decider`, { decision: 'valide' })).s === 403);
t('renvoyer sans mot : refusé', (await appel(20, 'POST', `/${id}/decider`, { decision: 'renvoye' })).s === 400);
t('la direction valide', (await appel(20, 'POST', `/${id}/decider`, { decision: 'valide' })).j?.statut === 'valide');
const e = await appel(10, 'GET', `/${id}/etudiants`);
t('les étudiants proposés sont ceux de la section', e.j.length === 1 && e.j[0].nom === 'BERNARD Léa', e.j);
r = await appel(10, 'POST', `/${id}/participants`, { participants: [{ role: 'etudiant', etudiant_id: 5 }, { role: 'etudiant', etudiant_id: 5 }, { role: 'accompagnateur', nom: 'MARTIN Paul' }] });
t('participants ajoutés après validation, sans doublon', r.j.ajoutes === 2 && r.j.participants.length === 2, r.j);
t('la pièce porte devis, financement et participants', /Coût global/.test((await appel(10, 'GET', `/${id}/document`)).j?.html || ''));
srv.close();
console.log(`\n${ok} ok, ${ko} faux`);
process.exit(ko ? 1 : 0);
