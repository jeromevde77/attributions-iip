/* Banc : un PAE validé ne se modifie pas sans le dire (3.5.233). node test/paeValide.mjs */
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucie-paev-'));
process.env.DB_PATH = path.join(dir, 'test.db');
const db = (await import('../src/db/index.js')).default;
for (const s of ['CREATE TABLE IF NOT EXISTS etudiant (id INTEGER PRIMARY KEY, nom TEXT, prenom TEXT, section_rattachement TEXT)',
  'CREATE TABLE IF NOT EXISTS etudiant_inscription (id INTEGER PRIMARY KEY, etudiant_id INTEGER, annee_scolaire TEXT, ue_num INTEGER, resultat TEXT, date_inscription TEXT, derogation INTEGER, derogation_par TEXT, derogation_le TEXT, UNIQUE(etudiant_id, annee_scolaire, ue_num))',
  'CREATE TABLE IF NOT EXISTS etudiant_note_detail (etudiant_id INTEGER, annee_scolaire TEXT, ue_num INTEGER)',
  'CREATE TABLE IF NOT EXISTS etudiant_report_note (etudiant_id INTEGER, annee_scolaire TEXT, ue_num INTEGER)',
  'CREATE TABLE IF NOT EXISTS ue (id INTEGER PRIMARY KEY, ue_num INTEGER, annee_scolaire TEXT, section TEXT, ue_nom TEXT, ue_niv TEXT, ue_niveau TEXT, is_epreuve_integree INTEGER, hors_cursus INTEGER, ue_tc TEXT, ects REAL, ue_code_fwb TEXT, valorisation_exclue INTEGER, ue_per_etudiants REAL, ue_aut REAL, domaine TEXT, type_enseignement TEXT)',
  'CREATE TABLE IF NOT EXISTS section (code TEXT, libelle TEXT, niveau TEXT)',
  'CREATE TABLE IF NOT EXISTS parametre (cle TEXT, valeur TEXT, annee_scolaire TEXT)',
  'CREATE TABLE IF NOT EXISTS ue_prerequis (id INTEGER PRIMARY KEY, ue_num INTEGER, annee_scolaire TEXT, section TEXT, etudiant_id INTEGER, prerequis_num INTEGER, niveau TEXT)',
  'CREATE TABLE IF NOT EXISTS pae_derogation (id INTEGER PRIMARY KEY, etudiant_id INTEGER, annee_scolaire TEXT, ue_num INTEGER, regle TEXT, detail TEXT, motif TEXT, origine TEXT, par TEXT)',
  'CREATE TABLE IF NOT EXISTS etudiant_pae (etudiant_id INTEGER, annee_scolaire TEXT, confirme_le TEXT, confirme_par TEXT, PRIMARY KEY (etudiant_id, annee_scolaire))'])
  db.exec(s);
const E = await import('../src/routes/etudiants.js');
const { porterContexte } = await import('../src/lib/contexteRequete.js');
const dans = (req, f) => new Promise((ok, ko) => porterContexte(req, {}, () => { try { ok(f()); } catch (e) { ko(e); } }));
db.prepare("INSERT INTO etudiant (id, nom, prenom) VALUES (1,'Dupont','Anne')").run();
db.prepare("INSERT INTO etudiant_inscription (etudiant_id, annee_scolaire, ue_num) VALUES (1,'2026-2027',256)").run();
db.prepare("INSERT INTO etudiant_pae VALUES (1,'2026-2027','2026-10-01 10:00:00','dir@x')").run();
let ok = 0, ko = 0;
const t = (nom, c, d = '') => { if (c) { ok++; console.log('  ok   ' + nom); } else { ko++; console.log('  FAUX ' + nom + (d ? '  → ' + String(d).slice(0, 300) : '')); } };
const ecrire = () => E.ecrireProgramme({ etudId: 1, annee: '2026-2027', retirer: [256], origine: 'pae', par: 'sec' });
let err = null; try { await dans({ method: 'PUT', headers: {} }, ecrire); } catch (e) { err = e; }
t('depuis un écran : refus 409 « pae_valide »', err?.status === 409 && err?.code === 'pae_valide' && /validé le 01\/10\/2026/.test(err.message), err?.message);
t('rien n’est écrit', db.prepare('SELECT COUNT(*) n FROM etudiant_inscription').get().n === 1);
const sim = await dans({ method: 'PUT', headers: {} }, () => E.ecrireProgramme({ etudId: 1, annee: '2026-2027', retirer: [256], origine: 'pae', simulation: true }));
t('une simulation passe', sim.simulation === true);
const imp = await dans({ method: 'POST', headers: {} }, () => E.ecrireProgramme({ etudId: 1, annee: '2026-2027', retirer: [256], origine: 'import', mode: 'signaler' }));
t('un import (signaler) passe', imp.retirees.length === 1);
db.prepare("INSERT INTO etudiant_inscription (etudiant_id, annee_scolaire, ue_num) VALUES (1,'2026-2027',256)").run();
db.prepare("INSERT OR REPLACE INTO etudiant_pae VALUES (1,'2026-2027','2026-10-01 10:00:00','dir@x')").run();
const b = await dans({ method: 'PUT', headers: { 'x-lucie-modifier-pae': '1' } }, ecrire);
t('avec l’accord : écrit, et la validation tombe', b.retirees.length === 1 && b.confirmation_retiree === true);
// Après le 1/10 (3.5.238) : retirer est refusé sans accord, l'accord écrit.
db.exec("CREATE TABLE IF NOT EXISTS organisation_ue (ue_num INTEGER, annee_scolaire TEXT, section TEXT, num_organisation INTEGER, date_debut TEXT, date_fin TEXT, hybride INTEGER)");
db.exec("CREATE TABLE IF NOT EXISTS horaire_seance (id INTEGER PRIMARY KEY, annee_scolaire TEXT, date TEXT, ue_num INTEGER, cours_code TEXT, annule INTEGER, section TEXT)");
db.exec("CREATE TABLE IF NOT EXISTS cours (cours_code TEXT, ue_num INTEGER, annee_scolaire TEXT)");
db.prepare("INSERT INTO organisation_ue VALUES (256,'2026-2027','TIM',1,'2026-09-01','2026-10-31',0)").run();
db.prepare("INSERT INTO etudiant_inscription (etudiant_id, annee_scolaire, ue_num) VALUES (1,'2026-2027',256)").run();
let e2 = null; try { await dans({ method: 'PUT', headers: {} }, ecrire); } catch (e) { e2 = e; }
t('après le 1/10 : refus 409 « apres_dixieme »', e2?.code === 'apres_dixieme' && /abandon/.test(e2.message), e2?.message);
const c = await dans({ method: 'PUT', headers: { 'x-lucie-apres-dixieme': '1' } }, ecrire);
t('avec l’accord : retirée', c.retirees.length === 1);
console.log(`\n${ok} ok, ${ko} faux`);
process.exit(ko ? 1 : 0);
