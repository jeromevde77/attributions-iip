/* Banc du registre matricule et de l'exemption par année (3.5.238). node test/registreMatricule.mjs */
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucie-rm-'));
process.env.DB_PATH = path.join(dir, 'test.db');
const db = (await import('../src/db/index.js')).default;
for (const s of ['CREATE TABLE IF NOT EXISTS etudiant (id INTEGER PRIMARY KEY, nom TEXT, prenom TEXT, date_naissance TEXT, matricule TEXT, actif INTEGER DEFAULT 1, di_exonere INTEGER DEFAULT 0, di_motif TEXT, dis_soumis INTEGER DEFAULT 0, dis_motif_exemption TEXT, dis_periodes_hebdo REAL, di_tiers TEXT, di_tiers_motif TEXT)',
  'CREATE TABLE IF NOT EXISTS etudiant_inscription (etudiant_id INTEGER, annee_scolaire TEXT, ue_num INTEGER, date_inscription TEXT, num_organisation INTEGER, resultat TEXT, dispense_complete INTEGER DEFAULT 0, codiplomation_ch INTEGER DEFAULT 0, admission_type TEXT)',
  'CREATE TABLE IF NOT EXISTS ue (ue_num INTEGER, annee_scolaire TEXT, ue_nom TEXT, ue_code_fwb TEXT, section TEXT, ue_niveau TEXT, ue_tot_prf REAL, ue_per_etudiants REAL, ue_per_cours REAL, ue_aut REAL, ects REAL, ue_niv TEXT)',
  'CREATE TABLE IF NOT EXISTS cours (cours_code TEXT, annee_scolaire TEXT, cours_nom TEXT, ue_num INTEGER)',
  'CREATE TABLE IF NOT EXISTS organisation_ue (ue_num INTEGER, annee_scolaire TEXT, num_organisation INTEGER, date_debut TEXT, date_fin TEXT, hybride INTEGER, section TEXT)',
  'CREATE TABLE IF NOT EXISTS horaire_seance (id INTEGER PRIMARY KEY, annee_scolaire TEXT, date TEXT, cours_code TEXT, ue_num INTEGER, annule INTEGER DEFAULT 0, section TEXT)']) db.exec(s);
const DI = await import('../src/routes/droitInscription.js');
DI.migrerDroitInscription(db);
const A = '2026-2027';
db.prepare("INSERT INTO ue (ue_num, annee_scolaire, ue_nom, ue_code_fwb, section) VALUES (300, ?, 'Anatomie', '7531U32D1', 'TIM'), (301, ?, 'Physique', '7531U32D2', 'TIM'), (299, '2025-2026', 'Ancienne', 'X', 'TIM')").run(A, A);
db.prepare("INSERT INTO organisation_ue VALUES (300, ?, 1, '2026-09-01', '2026-12-10', 0, 'TIM'), (301, ?, 1, '2027-02-01', '2027-06-10', 0, 'TIM'), (299, '2025-2026', 1, '2025-09-01', '2025-12-10', 0, 'TIM')").run(A, A);
db.prepare("INSERT INTO etudiant (id, nom, prenom, date_naissance, matricule, di_exonere, di_motif) VALUES (1,'Zeller','Ana','2000-01-02','M1',1,'ris'),(2,'Bernard','Léa','1999-05-06','M2',0,null),(3,'Ancien','Paul','1990-01-01','M3',0,null)").run();
db.prepare("INSERT INTO etudiant_inscription (etudiant_id, annee_scolaire, ue_num, num_organisation) VALUES (1,?,300,1),(1,?,301,1),(2,?,300,1),(3,'2025-2026',299,1)").run(A, A, A);
let ok = 0, ko = 0;
const t = (nom, c, d = '') => { if (c) { ok++; console.log('  ok   ' + nom); } else { ko++; console.log('  FAUX ' + nom + (d ? '  → ' + JSON.stringify(d).slice(0, 300) : '')); } };
// L'exemption par année
t('sans ligne d’année : la fiche fait foi', DI.exemptionDI(1, A).exonere && DI.exemptionDI(1, A).source === 'fiche');
db.prepare("INSERT INTO di_exemption (etudiant_id, annee_scolaire, exonere, motif, justif_date, organisme) VALUES (1, ?, 1, 'fedasil', '2026-10-01', 'FEDASIL')").run(A);
const ex = DI.exemptionDI(1, A);
t('avec ligne d’année : elle l’emporte', ex.source === 'annee' && ex.motif === 'fedasil' && ex.justif_date === '2026-10-01');
t('les nouveaux motifs ont leur libellé', /FEDASIL/.test(DI.libelleMotifDI('fedasil')) && /codiplômation/.test(DI.libelleMotifDI('codiplomation')));
db.prepare("INSERT INTO di_exemption (etudiant_id, annee_scolaire, exonere) VALUES (2, ?, 0)").run(A);
t('une année non exemptée ne reprend pas la fiche', !DI.exemptionDI(2, A).exonere);
// Le registre
const R = await import('../src/routes/rapports.js');
const l = R.registreMatricule({ annee: A });
t('ordre alphabétique, l’ancien exclu', l.map(x => x.nom).join() === 'BERNARD,ZELLER', l.map(x => x.nom));
const z = l.find(x => x.nom === 'ZELLER');
t('codes des UE suivies', z.ues === '300 (7531U32D1), 301 (7531U32D2)', z.ues);
t('motif d’exemption en clair', /Exempté — .*FEDASIL/.test(z.di), z.di);
const b = l.find(x => x.nom === 'BERNARD');
t('date de naissance et matricule', b.date_naissance === '1999-05-06' && b.matricule === 'M2');
const prec = R.registreMatricule({ annee: '2025-2026' });
t('l’année précédente le porte', prec.length === 1 && prec[0].nom === 'ANCIEN', prec.map(x => x.nom));
// Évaluations et dates des UE (3.5.239)
db.exec("CREATE TABLE IF NOT EXISTS attribution (id INTEGER PRIMARY KEY, annee_scolaire TEXT, ue_num INTEGER, code_cours TEXT, professeur_id INTEGER)");
db.exec("CREATE TABLE IF NOT EXISTS professeur (id INTEGER PRIMARY KEY, nom TEXT, prenom TEXT)");
db.exec("CREATE TABLE IF NOT EXISTS epreuve_session1 (ue_num INTEGER, annee_scolaire TEXT, cours_code TEXT, s1_date TEXT, s1_heure TEXT, s1_local TEXT)");
db.exec("CREATE TABLE IF NOT EXISTS deliberation_seance (ue_num INTEGER, annee_scolaire TEXT, session INTEGER, num_organisation INTEGER, date_seance TEXT, heure_seance TEXT)");
try { db.exec("ALTER TABLE cours ADD COLUMN is_stage INTEGER"); } catch {}
for (const c of ["session INTEGER", "num_organisation INTEGER", "date_seance TEXT", "heure_seance TEXT"]) try { db.exec("ALTER TABLE deliberation_seance ADD COLUMN " + c); } catch {}
db.prepare("INSERT INTO cours (cours_code, annee_scolaire, cours_nom, ue_num) VALUES ('300.1', ?, 'Anatomie 1', 300), ('300.2', ?, 'Anatomie 2', 300), ('301.1', ?, 'Physique', 301)").run(A, A, A);
db.prepare("INSERT INTO professeur (id, nom, prenom) VALUES (1, 'Martin', 'Paul')").run();
db.prepare("INSERT INTO attribution (id, annee_scolaire, ue_num, code_cours, professeur_id) VALUES (1, ?, 300, '300.1', 1)").run(A);
db.prepare("INSERT INTO epreuve_session1 (ue_num, annee_scolaire, cours_code, s1_date, s1_heure, s1_local) VALUES (300, ?, '300.1', '2027-01-10', '09:00', NULL), (301, ?, '', '2027-06-20', '13:00', 'P.12')").run(A, A);
db.prepare("INSERT INTO deliberation_seance (ue_num, annee_scolaire, session, num_organisation, date_seance, heure_seance) VALUES (301, ?, 1, 0, '2027-06-28', '17:00')").run(A);
db.prepare("UPDATE organisation_ue SET date_fin = NULL WHERE ue_num = 300 AND annee_scolaire = ?").run(A);
const M = R.evaluationsManquantes({ annee: A });
const E = c => M.evaluations.find(x => x.cours === c);
t('cours avec épreuve sans local : à compléter', E('300.1').manque === 'local' && E('300.1').etat === 'surveiller', E('300.1'));
t('cours sans épreuve : à dater', /épreuve non datée/.test(E('300.2').manque) && E('300.2').etat === 'corriger');
t('l’épreuve de l’UE entière couvre son cours', E('301.1').portee === 'UE entière' && E('301.1').date === '2027-06-20');
const D = u => M.dates.find(x => x.ue_num === u);
t('date de fin manquante, délibération non datée', /date de fin/.test(D(300).manque) && /délibération/.test(D(300).manque) && D(300).etat === 'corriger');
t('UE complète', D(301).manque === 'complet', D(301));
t('synthèse', M.synthese[0].sans_epreuve === 1 && M.synthese[0].sans_dates === 1, M.synthese);
const doc = R.documentEvaluationsManquantes({ annee: A });
t('le PDF : tuiles, ce qui manque seulement', /Cours sans épreuve datée/.test(doc.corps) && /300\.2/.test(doc.corps) && /aucun professeur/.test(doc.corps));
const x = await R.excelEvaluationsManquantes({ annee: A });
t('le tableur', x.buffer && x.buffer.byteLength > 2000);
console.log(`\n${ok} ok, ${ko} faux`);
process.exit(ko ? 1 : 0);
