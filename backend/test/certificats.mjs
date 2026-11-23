/* Banc des justificatifs d'absence (3.5.661). node test/certificats.mjs */
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucie-cm-'));
process.env.DB_PATH = path.join(dir, 'test.db'); process.env.DATA_DIR = dir;
const db = (await import('../src/db/index.js')).default;
for (const s of ['CREATE TABLE IF NOT EXISTS etudiant (id INTEGER PRIMARY KEY, nom TEXT, prenom TEXT, id_ecampus TEXT, section_rattachement TEXT)',
  'CREATE TABLE IF NOT EXISTS etudiant_inscription (etudiant_id INTEGER, annee_scolaire TEXT, ue_num INTEGER)',
  'CREATE TABLE IF NOT EXISTS cours (cours_code TEXT, annee_scolaire TEXT, ue_num INTEGER)', 'CREATE TABLE IF NOT EXISTS lucie_notification (id INTEGER PRIMARY KEY, type TEXT, titre TEXT, corps TEXT, lien TEXT, cible_user_id INTEGER, cible_role TEXT, cree_par TEXT, cree_le TEXT)', 'CREATE TABLE IF NOT EXISTS utilisateur (id INTEGER PRIMARY KEY, professeur_id INTEGER, actif INTEGER)',
  'CREATE TABLE IF NOT EXISTS horaire_seance (id INTEGER PRIMARY KEY, annee_scolaire TEXT, date TEXT, heure_debut TEXT, cours_code TEXT, ue_num INTEGER, annule INTEGER DEFAULT 0, professeur_id INTEGER)']) db.exec(s);
const C = await import('../src/lib/cep.js'); C.migrerCep(db);
const M = await import('../src/lib/certificatMedical.js');
const A = '2026-2027';
db.prepare("INSERT INTO etudiant (id, nom, prenom) VALUES (1,'Un','A'),(2,'Deux','B'),(3,'Trois','C')").run();
for (const e of [1, 2, 3]) db.prepare('INSERT INTO etudiant_inscription (etudiant_id, annee_scolaire, ue_num) VALUES (?,?,300)').run(e, A);
db.prepare("INSERT INTO horaire_seance (id, annee_scolaire, date, heure_debut, cours_code, ue_num) VALUES (1,?,'2026-11-23','18:00','300.1',300),(2,?,'2026-11-24','18:00','300.1',300)").run(A, A);
C.ecrirePresences([{ seance_id: 1, etudiant_id: 1, statut: 'absent' }, { seance_id: 1, etudiant_id: 2, statut: 'absent' }], 'test');
let ok = 0, ko = 0;
const t = (nom, c, d = '') => { if (c) { ok++; console.log('  ok   ' + nom); } else { ko++; console.log('  FAUX ' + nom + (d ? '  → ' + JSON.stringify(d) : '')); } };
const pr = (s, e) => db.prepare('SELECT statut, motif FROM presence WHERE seance_id = ? AND etudiant_id = ?').get(s, e);

const a = M.deposer({ etudiantId: 1, du: '2026-11-23', au: '2026-11-23', recuLe: '2026-11-23', par: 't', annee: A });
t('certificat médical dans le délai : accepté d’office', !a.a_decider && pr(1, 1)?.motif === 'medical', [a, pr(1, 1)]);
const b = M.deposer({ etudiantId: 2, du: '2026-11-23', au: '2026-11-24', recuLe: '2026-11-23', par: 't', annee: A, motif: 'greve' });
t('attestation de grève : à décider, rien de justifié', b.a_decider && pr(1, 2)?.statut === 'absent', [b, pr(1, 2)]);
C.ecrirePresences([{ seance_id: 2, etudiant_id: 2, statut: 'absent' }], 'test');
t('à décider : une absence encodée ensuite reste absente', pr(2, 2)?.statut === 'absent', pr(2, 2));
M.decider(b.id, 'accepte', null, 't');
t('acceptée : les absences prennent le motif grève', pr(1, 2)?.motif === 'greve' && pr(2, 2)?.motif === 'greve', [pr(1, 2), pr(2, 2)]);
C.ecrirePresences([{ seance_id: 2, etudiant_id: 2, statut: 'absent' }], 'test');
t('acceptée : une absence réencodée devient « grève »', pr(2, 2)?.motif === 'greve', pr(2, 2));
t('type inconnu refusé', !!M.deposer({ etudiantId: 3, du: '2026-11-23', au: '2026-11-23', par: 't', motif: 'vacances' }).erreur);
db.prepare(`INSERT INTO certificat_medical (etudiant_id, du, au, recu_le, nom_fichier, statut, motif) VALUES (3,'2026-11-23','2026-11-23','2026-11-23','attestationdeperturbation_20261123.pdf','accepte','medical')`).run();
M.migrerCertificats();
const r = db.prepare('SELECT motif, statut FROM certificat_medical WHERE etudiant_id = 3').get();
t('attestation de perturbation déposée avant : reclassée grève, à décider', r.motif === 'greve' && r.statut === 'a_decider', r);
console.log(`\n${ok} ok, ${ko} faux`); process.exit(ko ? 1 : 0);
