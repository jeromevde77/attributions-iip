/* Banc du récapitulatif des comptes étudiants au secrétariat (3.5.666). node test/recapSecretariat.mjs */
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucie-recap-secr-'));
process.env.DB_PATH = path.join(dir, 'test.db'); process.env.DATA_DIR = dir;
const db = (await import('../src/db/index.js')).default;
for (const s of [
  'CREATE TABLE IF NOT EXISTS lucie_config (cle TEXT PRIMARY KEY, valeur TEXT)',
  "CREATE TABLE IF NOT EXISTS lucie_notification (id INTEGER PRIMARY KEY, type TEXT, titre TEXT, corps TEXT, lien TEXT, cible_user_id INTEGER, cible_role TEXT, cree_par TEXT, cree_le TEXT DEFAULT (datetime('now')), section TEXT)",
  'CREATE TABLE IF NOT EXISTS etudiant (id INTEGER PRIMARY KEY, nom TEXT, prenom TEXT, id_ecampus TEXT)',
  'CREATE TABLE IF NOT EXISTS centre_delivrance (id INTEGER PRIMARY KEY, etudiant_id INTEGER, code TEXT, annee_scolaire TEXT, reference TEXT, le TEXT)',
  'CREATE TABLE IF NOT EXISTS portail_connexion (id INTEGER PRIMARY KEY, etudiant_id INTEGER, le TEXT, ip TEXT, ref_portail INTEGER)',
  "CREATE TABLE IF NOT EXISTS certificat_medical (id INTEGER PRIMARY KEY, etudiant_id INTEGER, depose_par TEXT, statut TEXT, cree_le TEXT)",
  // etudiant_photo, pae_signature_etudiant, message_etudiant_fil, etudiant_valorisation : ABSENTES — elles doivent compter zéro.
]) db.exec(s);
const D = await import('../src/lib/demandesPieces.js'); D.migrerDemandesPieces();
const R = await import('../src/lib/recapSecretariat.js');
let ok = 0, ko = 0;
const t = (nom, c, d = '') => { if (c) { ok++; console.log('  ok   ' + nom); } else { ko++; console.log('  FAUX ' + nom + (d ? '  → ' + JSON.stringify(d) : '')); } };
const notifs = type => db.prepare('SELECT * FROM lucie_notification WHERE type = ? ORDER BY id').all(type);

// Bornes : le 23/11/2026 à Bruxelles (heure d'hiver, UTC+1) = 22/11 23:00 → 23/11 23:00 en temps universel.
const b = R.bornesJour('2026-11-23');
t('bornes d’un jour d’hiver', b.depuis === '2026-11-22 23:00:00' && b.jusqua === '2026-11-23 23:00:00', b);
const e = R.bornesJour('2026-07-01');
t('bornes d’un jour d’été (UTC+2)', e.depuis === '2026-06-30 22:00:00', e);

db.prepare("INSERT INTO etudiant (id, nom, prenom) VALUES (1,'Un','A'),(2,'Deux','B'),(3,'Trois','C')").run();
// Une demande relevée : plus de notification par demande.
D.recevoirDemande({ id: 1, nom: 'Un', prenom: 'A' }, { id: 11, type: 'releve', cree_le: '2026-11-23 09:00:00' });
D.recevoirDemande({ id: 2, nom: 'Deux', prenom: 'B' }, { id: 12, type: 'frequentation', cree_le: '2026-11-20 09:00:00' });
t('une demande de pièce ne crée plus de notification', notifs('demande_piece').length === 0 && db.prepare('SELECT COUNT(*) n FROM piece_demande').get().n === 2);

// Les mouvements du 23/11.
const ins = db.prepare('INSERT INTO centre_delivrance (etudiant_id, code, annee_scolaire, le) VALUES (?,?,?,?)');
ins.run(1, 'I-02', '2026-2027', '2026-11-23 08:00:00'); ins.run(2, 'I-02', '2026-2027', '2026-11-23 10:00:00');
ins.run(3, 'R-02-256-S1', '2026-2027', '2026-11-23 22:30:00'); ins.run(3, 'I-06', '2026-2027', '2026-11-22 22:30:00'); // la dernière : le 22 à Bruxelles
db.prepare("INSERT INTO portail_connexion (etudiant_id, le) VALUES (1,'2026-11-10 10:00:00'),(1,'2026-11-23 10:00:00'),(2,'2026-11-23 11:00:00'),(2,'2026-11-23 12:00:00')").run();
db.prepare("INSERT INTO certificat_medical (etudiant_id, depose_par, statut, cree_le) VALUES (1,'etudiant','a_decider','2026-11-23 09:00:00'),(2,'secretariat','accepte','2026-11-23 09:00:00')").run();

const r = R.composerRecap(b.depuis, b.jusqua, { jour: '2026-11-23' });
t('demandes : 2 à traiter, 1 d’hier', r?.chiffres.demandes_attente === 2 && r.chiffres.demandes_hier === 1, r?.chiffres);
t('pièces téléchargées : 3, la nature la plus fréquente d’abord', r.chiffres.pieces_hier === 3 && /pièces téléchargées.*Attestation d’inscription \(2\)/.test(r.corps), r.corps);
t('connexions : 2 étudiants, 1 première', r.chiffres.connectes_hier === 2 && r.chiffres.premieres_hier === 1, r.chiffres);
t('justificatifs : celui de l’espace seul, 1 à décider', r.chiffres.justif_hier === 1 && r.chiffres.justif_attente === 1);
t('tables absentes : zéro, sans erreur', r.chiffres.photos_hier === 0 && r.chiffres.messages_hier === 0 && r.chiffres.va_hier === 0 && r.chiffres.pae_confirmes === 0);
t('une ligne nulle n’apparaît pas', !/Photos|message|PAE|VA/.test(r.corps), r.corps);
t('titre en nombres', r.titre === 'Comptes étudiants — hier : 3 pièces · 2 connexions · 1 demande', r.titre);
t('lien vers les demandes à traiter', r.lien === '/etudiants?outil=demandes-pieces');
t('aucun nom d’étudiant dans le texte', !/Un|Deux|Trois/.test(r.titre + r.corps));
t('rien ne bouge : pas de récapitulatif', R.composerRecap('2026-10-01 00:00:00', '2026-10-02 00:00:00', { jour: '2026-10-01' }) === null);

// La publication : le 24/11 à 6 h 30 de Bruxelles, rien ; à 7 h 10, une fois.
t('avant 7 h : rien', R.publierRecap({ maintenant: new Date('2026-11-24T05:30:00Z') }).publie === false && notifs('recap_comptes_etudiants').length === 0);
const p = R.publierRecap({ maintenant: new Date('2026-11-24T06:10:00Z') });
const n = notifs('recap_comptes_etudiants');
t('après 7 h : une notification au secrétariat', p.publie && n.length === 1 && n[0].cible_role === 'secretariat' && n[0].cible_user_id === null, n);
t('une seule fois par jour', R.publierRecap({ maintenant: new Date('2026-11-24T10:00:00Z') }).publie === false && notifs('recap_comptes_etudiants').length === 1);
t('le lendemain sans mouvement : rien', R.publierRecap({ maintenant: new Date('2026-11-25T08:00:00Z') }).publie === false && notifs('recap_comptes_etudiants').length === 1);

console.log('\nExemple :\n  ' + n[0].titre + '\n  ' + n[0].corps.split('<br>').join('\n  '));
console.log(`\n${ok} ok, ${ko} faux`); process.exit(ko ? 1 : 0);
