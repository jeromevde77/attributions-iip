/* Banc du registre de présence selon la circulaire 9764 (3.5.237). node test/registre9764.mjs */
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucie-reg-'));
process.env.DB_PATH = path.join(dir, 'test.db');
const db = (await import('../src/db/index.js')).default;
for (const s of ['CREATE TABLE IF NOT EXISTS etudiant (id INTEGER PRIMARY KEY, nom TEXT, prenom TEXT, id_ecampus TEXT, actif INTEGER DEFAULT 1)',
  'CREATE TABLE IF NOT EXISTS etudiant_inscription (etudiant_id INTEGER, annee_scolaire TEXT, ue_num INTEGER, date_inscription TEXT, statut TEXT, num_organisation INTEGER)',
  'CREATE TABLE IF NOT EXISTS etudiant_piece (etudiant_id INTEGER, type_piece TEXT, statut TEXT)',
  'CREATE TABLE IF NOT EXISTS ue (ue_num INTEGER, annee_scolaire TEXT, ue_nom TEXT, ue_code_fwb TEXT, section TEXT)',
  'CREATE TABLE IF NOT EXISTS cours (cours_code TEXT, annee_scolaire TEXT, cours_nom TEXT, ue_num INTEGER)',
  'CREATE TABLE IF NOT EXISTS organisation_ue (ue_num INTEGER, annee_scolaire TEXT, num_organisation INTEGER, date_debut TEXT, date_fin TEXT, hybride INTEGER, section TEXT)',
  'CREATE TABLE IF NOT EXISTS horaire_seance (id INTEGER PRIMARY KEY, annee_scolaire TEXT, date TEXT, heure_debut TEXT, heure_fin TEXT, minutes INTEGER, cours_code TEXT, ue_num INTEGER, sous_groupe TEXT, annule INTEGER DEFAULT 0, professeur_id INTEGER, section TEXT)',
  'CREATE TABLE IF NOT EXISTS professeur (id INTEGER PRIMARY KEY, nom TEXT, prenom TEXT)',
  'CREATE TABLE IF NOT EXISTS attribution (id INTEGER PRIMARY KEY, annee_scolaire TEXT, ue_num INTEGER, code_cours TEXT, professeur_id INTEGER)']) db.exec(s);
const C = await import('../src/lib/cep.js'); C.migrerCep(db);
const A = '2026-2027';
db.prepare("INSERT INTO ue VALUES (300, ?, 'Anatomie', '7531U32D1', 'TIM')").run(A);
db.prepare("INSERT INTO cours VALUES ('300.1', ?, 'Anatomie générale', 300)").run(A);
db.prepare("INSERT INTO organisation_ue VALUES (300, ?, 1, '2026-09-01', '2026-12-10', 1, 'TIM')").run(A);
// Séances : le 1/10 théorique tombe le 11/09 (100 jours / 10) ; séances les 07/09, 14/09, 21/09, 19/10, 02/11.
let id = 1; for (const d of ['2026-09-07', '2026-09-14', '2026-09-21', '2026-10-19', '2026-11-02']) db.prepare("INSERT INTO horaire_seance (id, annee_scolaire, date, heure_debut, heure_fin, minutes, cours_code, ue_num) VALUES (?,?,?, '18:00','21:00',180,'300.1',300)").run(id++, A, d);
db.prepare("INSERT INTO professeur VALUES (1, 'Martin', 'Paul')").run();
db.prepare("INSERT INTO attribution VALUES (1, ?, 300, '300.1', 1)").run(A);
db.prepare("INSERT INTO etudiant (id, nom, prenom, id_ecampus) VALUES (1,'Zeller','Ana','M1'),(2,'Bernard','Léa','M2'),(3,'Albert','Tom','M3'),(4,'Durand','Max','M4')").run();
db.prepare("INSERT INTO etudiant_inscription (etudiant_id, annee_scolaire, ue_num, date_inscription) VALUES (1,?,300,'2026-08-30'),(2,?,300,'2026-08-30'),(3,?,300,'2026-10-01'),(4,?,300,'2026-08-30')").run(A, A, A, A);
db.prepare("UPDATE etudiant_inscription SET sortie_le = '2026-10-01' WHERE etudiant_id = 2").run();
db.prepare("INSERT INTO etudiant_piece VALUES (1, 'identite', 'manquant')").run();
C.ecrirePresences([{ seance_id: 1, etudiant_id: 1, statut: 'justifie', motif: 'medical' }, { seance_id: 1, etudiant_id: 2, statut: 'present', distance: true },
  { seance_id: 1, etudiant_id: 3, statut: 'justifie', motif: 'medical_proche' }, { seance_id: 2, etudiant_id: 1, statut: 'non_concerne' }], 'test');
const G = await import('../src/lib/grillePresence.js');
const { g, opts } = G.grilleUE(300, A);
let ok = 0, ko = 0;
const t = (nom, c, d = '') => { if (c) { ok++; console.log('  ok   ' + nom); } else { ko++; console.log('  FAUX ' + nom + (d ? '  → ' + JSON.stringify(d).slice(0, 300) : '')); } };
t('1/10 des dates de l’UE : théorique 11/09, séance la plus proche 14/09', g.dixieme?.theorique === '2026-09-11' && g.dixieme?.date === '2026-09-14' && g.dixieme?.source === 'dates', g.dixieme);
t('5/10 : théorique 21/10, séance 19/10', g.cinquieme?.theorique === '2026-10-21' && g.cinquieme?.date === '2026-10-19', g.cinquieme);
t('ordre : inscrits au 1/10 (alpha), puis le tardif', g.lignes.map(l => l.etudiant.nom).join() === 'Bernard,Durand,Zeller,Albert', g.lignes.map(l => l.etudiant.nom));
const L = n => g.lignes.find(l => l.etudiant.nom === n);
t('CM pour le certificat de l’apprenant', L('Zeller').cases[0].code === 'CM');
t('J pour le certificat d’un proche', L('Albert').cases[0].code === 'J');
t('M à distance', L('Bernard').cases[0].code === 'M');
t('NC, plus de « — »', L('Zeller').cases[1].code === 'NC');
t('NE pour une séance passée non encodée', L('Durand').cases[0].code === 'NE');
t('après l’abandon : trait, plus rien de dû', L('Bernard').cases[3].statut === 'sortie' && L('Bernard').sortie_le === '2026-10-01');
t('dossier incomplet marqué', L('Zeller').incomplet && !L('Durand').incomplet);
const html = G.htmlGrille(g, opts);
t('en-tête : code, dates, hybridation', /7531U32D1/.test(html) && /organisation 1 du 01\/09\/2026 au 10\/12\/2026/.test(html) && /hybridation/.test(html));
t('les deux dixièmes et le séparateur', /1\/10/.test(html) && /5\/10/.test(html) && /Inscriptions après le premier dixième/.test(html));
t('signature du chargé de cours', /MARTIN Paul/.test(html) && /Signature/.test(html));
t('avertissement des NE', /ne sont pas encodées/.test(html));
db.prepare("INSERT INTO etudiant (id, nom, prenom) VALUES (5,'Vasseur','Eva')").run();
db.prepare("INSERT INTO etudiant_inscription (etudiant_id, annee_scolaire, ue_num, date_inscription) VALUES (5,?,300,'2026-08-30')").run(A);
const disp = new Map([[5, { complete: true, cours: new Set() }]]);
const g2 = G.donneesGrille({ seances: G.seancesDeLUE(300, A).seances, etudiants: [{ id: 5, nom: 'Vasseur', prenom: 'Eva' }], dispensesParEtudiant: disp });
t('dispense complète : hors de la liste', g2.lignes.length === 0);
console.log(`\n${ok} ok, ${ko} faux`);
process.exit(ko ? 1 : 0);
