/**
 * L'ÉTUDIANT TEST, SUR LA DEV SEULEMENT (Charles, 28 octobre 2026 : « crée
 * l'étudiant test dans tous les cours en dev »).
 *
 * Crée (ou retrouve) l'étudiant « TEST QR », lui donne l'adresse d'école
 * passée en argument — celle où l'on veut recevoir le code de la présence par
 * QR —, et l'inscrit à TOUTES les UE de l'année par la porte du PAE
 * (`ecrireProgramme`, mode « signaler », comme un import). Dans chaque cours
 * réparti en groupes, il rejoint le premier groupe de chaque activité : il ne
 * peut être que dans un groupe par activité.
 *
 * Refuse de tourner hors développement : la production n'a pas d'étudiant test.
 * Relançable sans dégât (rien ne se double). La base de dev étant recopiée de
 * la production de temps en temps, il faut le relancer après chaque recopie.
 *
 *   sudo docker exec attributions-backend-dev node scripts/etudiant-test.js prenom.nom@institut-prigogine.be
 */
import db from '../src/db/index.js';
import { ecrireProgramme } from '../src/routes/etudiants.js';

if (process.env.NODE_ENV !== 'development') {
  console.error('Refusé : ce script ne tourne que sur la dev (NODE_ENV=development).');
  process.exit(1);
}
const email = String(process.argv[2] || '').trim().toLowerCase();
if (!/^[^@\s]+@(institut-prigogine\.be|helb-prigogine\.be)$/.test(email)) {
  console.error("Donnez une adresse d'école : node scripts/etudiant-test.js prenom.nom@institut-prigogine.be");
  process.exit(1);
}
const annee = process.argv[3]
  || db.prepare('SELECT code FROM annee_scolaire WHERE active = 1').get()?.code
  || db.prepare('SELECT code FROM annee_scolaire ORDER BY code DESC LIMIT 1').get()?.code;
if (!annee) { console.error('Aucune année scolaire en base.'); process.exit(1); }

// Une adresse ne doit désigner qu'un dossier : la présence par QR refuse une adresse ambiguë.
const autres = db.prepare(`SELECT id, nom, prenom FROM etudiant WHERE lower(trim(email_ecole)) = ?
  AND NOT (nom = 'TEST' AND prenom = 'QR')`).all(email);
if (autres.length) {
  console.error(`Refusé : ${email} est déjà l'adresse de ${autres.map(e => `${e.nom} ${e.prenom}`).join(', ')}.`);
  process.exit(1);
}

let e = db.prepare("SELECT id FROM etudiant WHERE nom = 'TEST' AND prenom = 'QR'").get();
if (!e) {
  const id = db.prepare("INSERT INTO etudiant (nom, prenom, email_ecole, actif) VALUES ('TEST', 'QR', ?, 1)").run(email).lastInsertRowid;
  e = { id };
  console.log(`Étudiant TEST QR créé (n° ${id}).`);
} else {
  db.prepare('UPDATE etudiant SET email_ecole = ?, actif = 1 WHERE id = ?').run(email, e.id);
  console.log(`Étudiant TEST QR retrouvé (n° ${e.id}), adresse mise à ${email}.`);
}

const ues = db.prepare('SELECT DISTINCT ue_num FROM cours WHERE annee_scolaire = ? AND ue_num IS NOT NULL').all(annee).map(x => x.ue_num);
const bilan = ecrireProgramme({ etudId: e.id, annee, ajouter: ues, origine: 'étudiant test (dev)',
  par: 'script étudiant test (dev)', mode: 'signaler' });
console.log(`${annee} : ${bilan.ajoutees.length} UE ajoutée(s), ${ues.length - bilan.ajoutees.length} déjà au programme.`);

// Les cours répartis en groupes : le premier groupe de chaque activité.
const groupes = db.prepare(`SELECT cours_code, activite_id, MIN(COALESCE(num_organisation, 1)) AS org,
    MIN(COALESCE(groupe_code, '')) AS groupe
  FROM etudiant_cours_groupe WHERE annee_scolaire = ? GROUP BY cours_code, activite_id`).all(annee);
const placer = db.prepare(`INSERT INTO etudiant_cours_groupe (etudiant_id, annee_scolaire, cours_code, activite_id,
    num_organisation, groupe_code, maj_le, maj_par) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), 'script étudiant test (dev)')
  ON CONFLICT(etudiant_id, annee_scolaire, cours_code, activite_id) DO NOTHING`);
let places = 0;
db.transaction(() => {
  for (const g of groupes) places += placer.run(e.id, annee, g.cours_code, g.activite_id, g.org, g.groupe || null).changes;
})();
console.log(`${places} placement(s) en groupe ajouté(s) (${groupes.length} activités réparties).`);
console.log(`Prêt : scannez un QR et tapez ${email}.`);
