/* Banc de la ligne EPT de l'EA12 et du renouvellement de l'A18 (3.5.232). node test/ept_a18.mjs */
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucie-ept-'));
process.env.DB_PATH = path.join(dir, 'test.db');
const db = (await import('../src/db/index.js')).default;
const { migrerEcheancier } = await import('../src/db/migrations_echeancier.js').catch(() => ({}));
for (const s of ['CREATE TABLE IF NOT EXISTS professeur (id INTEGER PRIMARY KEY, nom TEXT, prenom TEXT, matricule TEXT, statut TEXT, statut_ea12 TEXT, titre1 TEXT, titre2 TEXT)',
  'CREATE TABLE IF NOT EXISTS attribution (id INTEGER PRIMARY KEY, statut_exception TEXT)',
  `CREATE TABLE IF NOT EXISTS v_attribution_complete (id INTEGER, professeur_id INTEGER, annee_scolaire TEXT, codification_unite TEXT, nom_cours TEXT, type_cours TEXT,
     niveau TEXT, section TEXT, cours_ept_ad TEXT, total_attribue_professeur REAL, periodes_attribuees REAL, ue_num INTEGER, num_organisation INTEGER)`,
  'CREATE TABLE IF NOT EXISTS organisation_ue (ue_num INTEGER, annee_scolaire TEXT, num_organisation INTEGER, date_debut TEXT, date_fin TEXT)',
  'CREATE TABLE IF NOT EXISTS etablissement (id INTEGER PRIMARY KEY, etab_nom TEXT)', 'CREATE TABLE IF NOT EXISTS titre_capacite (id INTEGER PRIMARY KEY)', 'CREATE TABLE IF NOT EXISTS utilisateur (id INTEGER PRIMARY KEY, email TEXT, role TEXT)', 'CREATE TABLE IF NOT EXISTS annee_calendrier (annee_scolaire TEXT, date_debut TEXT, date_fin TEXT, type TEXT)', 'CREATE TABLE IF NOT EXISTS document_archive (id INTEGER PRIMARY KEY)',
  'CREATE TABLE IF NOT EXISTS ea12 (id INTEGER PRIMARY KEY, professeur_id INTEGER, annee_scolaire TEXT, variante TEXT, statut_doc TEXT, donnees_json TEXT, num_doc INTEGER, modifie_le TEXT, cree_le TEXT, cree_par INTEGER)'])
  db.exec(s);
if (migrerEcheancier) migrerEcheancier(db);
const A = '2026-2027';
db.prepare("INSERT INTO professeur (id, nom, prenom, statut) VALUES (1,'Dupont','Anne','CC')").run();
db.prepare(`INSERT INTO v_attribution_complete VALUES (1,1,?,'UE1','Optique','CT','SU','OPTO',NULL,200,NULL,282,1),(2,1,?,'UE1','Optique','CT','SU','OPTO','EPT',100,NULL,282,1)`).run(A, A);
db.prepare(`INSERT INTO organisation_ue VALUES (282, ?, 1, '2026-09-21', '2027-06-25')`).run(A);
db.prepare("INSERT INTO ea12 (id, professeur_id, annee_scolaire, num_doc, donnees_json) VALUES (1, 1, ?, 1, '{}')").run(A);
const { construireDataEA12 } = await import('../src/routes/ea12.js');
let ok = 0, ko = 0;
const t = (nom, c, d = '') => { if (c) { ok++; console.log('  ok   ' + nom); } else { ko++; console.log('  FAUX ' + nom + (d ? '  → ' + JSON.stringify(d).slice(0, 300) : '')); } };
const d = construireDataEA12(db.prepare('SELECT * FROM ea12 WHERE id = 1').get(), {});
t('deux lignes : la fonction et l’EPT', d.attributions.length === 2, d.attributions);
t('la ligne EPT est préfixée « EPT »', d.attributions.some(a => a.denomination === 'EPT Optique' && a.nb_periodes === '100') && d.attributions.some(a => a.denomination === 'Optique' && a.nb_periodes === '200'), d.attributions);
const E = await import('../src/services/echeancier.js');
db.prepare("INSERT INTO piece_dossier (professeur_id, code_piece, statut, date_reception) VALUES (1, 'A18', 'recue', '2025-10-01')").run();
const n = E.renouvelerA18(db, A);
const p = db.prepare("SELECT * FROM piece_dossier WHERE code_piece = 'A18'").get();
t('l’A18 de l’an dernier repasse « à demander »', p.statut === 'a_demander' && p.date_expiration === '2026-08-31' && /renouveler/.test(p.notes), p);
const e = db.prepare("SELECT e.date_due FROM echeance e JOIN echeance_type t ON t.id = e.type_id WHERE t.code = 'cumul_a18'").all();
t('l’échéance tombe 30 jours après la rentrée en fonction (21/09)', n >= 1 && e.some(x => x.date_due === '2026-10-21'), e);
t('une seconde fois : rien de plus', E.renouvelerA18(db, A) === 0);
db.prepare("UPDATE piece_dossier SET statut = 'recue', date_reception = '2026-10-05'").run();
t('reçue cette année : rien à renouveler', E.renouvelerA18(db, A) === 0 && db.prepare("SELECT statut FROM piece_dossier").get().statut === 'recue');
console.log(`\n${ok} ok, ${ko} faux`);
process.exit(ko ? 1 : 0);
