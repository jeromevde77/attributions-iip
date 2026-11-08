/* Banc de la demande d'aménagement en ligne (3.5.235). node test/arEnLigne.mjs */
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucie-ar-'));
process.env.DB_PATH = path.join(dir, 'test.db'); process.env.DATA_DIR = dir;
const db = (await import('../src/db/index.js')).default;
for (const s of ['CREATE TABLE IF NOT EXISTS etudiant (id INTEGER PRIMARY KEY, nom TEXT, prenom TEXT)',
  'CREATE TABLE IF NOT EXISTS etudiant_inscription (etudiant_id INTEGER, annee_scolaire TEXT, ue_num INTEGER, num_organisation INTEGER, resultat TEXT)',
  'CREATE TABLE IF NOT EXISTS ue (ue_num INTEGER, annee_scolaire TEXT, ue_nom TEXT)',
  'CREATE TABLE IF NOT EXISTS organisation_ue (ue_num INTEGER, annee_scolaire TEXT, num_organisation INTEGER, date_debut TEXT)',
  'CREATE TABLE IF NOT EXISTS utilisateur (id INTEGER PRIMARY KEY, nom_complet TEXT, email TEXT, actif INTEGER DEFAULT 1)',
  'CREATE TABLE IF NOT EXISTS lucie_config (cle TEXT PRIMARY KEY, valeur TEXT)', 'CREATE TABLE IF NOT EXISTS parametre (cle TEXT PRIMARY KEY, valeur TEXT, label TEXT, groupe TEXT)',
  'CREATE TABLE IF NOT EXISTS lucie_notification (id INTEGER PRIMARY KEY, type TEXT, titre TEXT, corps TEXT, lien TEXT, cible_user_id INTEGER, cible_role TEXT, cree_par TEXT)']) db.exec(s);
const { migrer } = await import('../src/routes/amenagements.js').then(m => ({ migrer: m.migrerAmenagements })).catch(() => ({}));
if (migrer) migrer(db);
const X = await import('../src/lib/portailAmenagements.js');
let ok = 0, ko = 0;
const t = (nom, c, d = '') => { if (c) { ok++; console.log('  ok   ' + nom); } else { ko++; console.log('  FAUX ' + nom + (d ? '  → ' + JSON.stringify(d).slice(0, 300) : '')); } };
t('exemple 1 de la circulaire : ouverture ven. 9/11/2018 → 27/10', X.limiteAR('2018-11-09') === '2018-10-27', X.limiteAR('2018-11-09'));
t('exemple 2 : ouverture lun. 24/12/2018 → 12/12', X.limiteAR('2018-12-24') === '2018-12-12', X.limiteAR('2018-12-24'));
db.prepare("INSERT INTO utilisateur (id, nom_complet, email) VALUES (7, 'PEREZ Audrey', 'audrey.perez@x')").run();
db.prepare("INSERT INTO etudiant (id, nom, prenom) VALUES (1, 'Dupont', 'Anne')").run();
const A = '2099-2100';
db.prepare("INSERT INTO etudiant_inscription (etudiant_id, annee_scolaire, ue_num, num_organisation, resultat) VALUES (1, ?, 300, 1, NULL), (1, ?, 301, 1, NULL)").run(A, A);
db.prepare("INSERT INTO ue (ue_num, annee_scolaire, ue_nom) VALUES (300, ?, 'Anatomie'), (301, ?, 'Physique')").run(A, A);
db.prepare("INSERT INTO organisation_ue (ue_num, annee_scolaire, num_organisation, date_debut) VALUES (300, ?, 1, '2099-12-01'), (301, ?, 1, '2000-01-10')").run(A, A);
const e = db.prepare('SELECT * FROM etudiant WHERE id = 1').get();
const o = X.offreAR(e, A);
t('la référente : Audrey Perez', o.referente.nom === 'Madame Audrey Perez' && X.referente().user_id === 7);
t('une UE dans le délai, une hors délai', o.ues.find(u => u.ue_num === 300).dans_delai && !o.ues.find(u => u.ue_num === 301).dans_delai, o.ues);
t('hors délai : refusé, renvoi vers Audrey Perez', /Audrey Perez/.test(X.demandeEnLigne(e, A, { ues: [301] }).erreur || ''));
const pdf = { nom: 'rapport.pdf', mime: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') };
const code = o.mesures[0]?.code;
t('sans pièce : refusé', /pièce/.test(X.demandeEnLigne(e, A, { ues: [300], mesures: [code], besoins: 'x', piece_type: 'probant' }, null).erreur || ''));
const r = X.demandeEnLigne(e, A, { ues: [300], mesures: [code], besoins: 'Dyslexie', piece_type: 'rapport_specialiste', piece_date: '2099-01-01', piece_auteur: 'Dr X' }, pdf);
t('demande reçue', r.ok, r);
const d = db.prepare('SELECT * FROM amenagement_dossier WHERE etudiant_id = 1').get();
t('le dossier : demande, signé, en ligne', d.statut === 'demande' && d.signe_etudiant_le && /en ligne/.test(d.cree_par) && d.piece_type === 'rapport_specialiste');
t('l’unité et la mesure', db.prepare('SELECT COUNT(*) n FROM amenagement_ue WHERE dossier_id = ?').get(d.id).n === 1 && db.prepare('SELECT COUNT(*) n FROM amenagement_mesure WHERE dossier_id = ?').get(d.id).n === 1);
const f = db.prepare('SELECT * FROM amenagement_fichier WHERE dossier_id = ?').get(d.id);
t('la pièce est gardée', f && fs.existsSync(f.chemin));
t('Audrey Perez est prévenue', db.prepare("SELECT COUNT(*) n FROM lucie_notification WHERE cible_user_id = 7").get().n === 1);
t('une seconde demande : refusée', /existe déjà/.test(X.demandeEnLigne(e, A, { ues: [300] }, pdf).erreur || ''));
t('le message arrive', X.messageAR(e, A, 'Bonjour').ok && db.prepare('SELECT COUNT(*) n FROM amenagement_message').get().n === 1);
console.log(`\n${ok} ok, ${ko} faux`);
process.exit(ko ? 1 : 0);
