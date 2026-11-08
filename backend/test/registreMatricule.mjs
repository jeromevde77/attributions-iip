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
console.log(`\n${ok} ok, ${ko} faux`);
process.exit(ko ? 1 : 0);
