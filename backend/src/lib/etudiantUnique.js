/**
 * UN ÉTUDIANT, UN DOSSIER — QUELLE QUE SOIT LA PORTE (3.1.435).
 *
 * Six portes créent un étudiant (fiche, liste eCampus, Excel eCampus, HELB, signalétique,
 * classeur de suivi). Deux ne cherchaient que le matricule DE L'ANNÉE : un étudiant revenu
 * avec un nouveau matricule devenait un second dossier, et son parcours se coupait en deux
 * — ce qu'on a passé une journée à réparer pour TIM. L'import Excel, lui, écrasait les
 * adresses d'un dossier existant par un vide.
 *
 * `trouverOuCreerEtudiant()` cherche par `rapprocher()` (numéro national, puis TOUS les
 * matricules connus, puis nom + prénom + date de naissance) ; trouvé, il complète la fiche
 * sans jamais remplacer une valeur par un vide et rattache le nouveau matricule au dossier
 * (`etudiant_matricule`, il ne remplace pas l'ancien : celui-là figure sur des pièces
 * déjà délivrées) ; sinon, il crée.
 *
 * `poserNormalisationRN()` : `rn_norm` (le numéro national en chiffres seuls, sur lequel
 * le doublon se cherche) n'était écrit que par certaines portes. Un déclencheur le
 * calcule désormais à chaque écriture du numéro national.
 */
import db from '../db/index.js';
import { rapprocher } from '../routes/importHistorique.js';

const CHAMPS = ['email_ecole', 'email_perso', 'date_naissance', 'num_national', 'gsm', 'adresse',
  'localite', 'cp', 'titre', 'lieu_naissance', 'sexe', 'nationalite'];
const vide = v => v == null || String(v).trim() === '';

/** Rend { id, cree, methode }. `p` : id_ecampus, nom, prenom, et les champs de CHAMPS. */
export function trouverOuCreerEtudiant(p, { annee = null, source = 'import' } = {}) {
  const cols = new Set(db.prepare('PRAGMA table_info(etudiant)').all().map(c => c.name));
  const mat = String(p.id_ecampus || '').trim() || null;
  const trouve = rapprocher({ num_national: p.num_national, id_ecampus: mat, nom: p.nom,
    prenom: p.prenom, date_naissance: p.date_naissance });
  if (trouve) {
    const actuel = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(trouve.id);
    const maj = {};
    // Le nom et le prénom suivent la source quand elle en donne ; le reste ne fait que COMPLÉTER.
    for (const c of ['nom', 'prenom']) if (!vide(p[c]) && p[c] !== actuel[c]) maj[c] = String(p[c]).trim();
    for (const c of CHAMPS) if (cols.has(c) && !vide(p[c]) && vide(actuel[c])) maj[c] = p[c];
    if (mat && vide(actuel.id_ecampus)
        && !db.prepare('SELECT 1 FROM etudiant WHERE id_ecampus = ? AND id <> ?').get(mat, trouve.id)) maj.id_ecampus = mat;
    if (Object.keys(maj).length) {
      db.prepare(`UPDATE etudiant SET ${Object.keys(maj).map(c => `${c} = @${c}`).join(', ')} WHERE id = @id`)
        .run({ ...maj, id: trouve.id });
    }
    if (mat && actuel.id_ecampus !== mat) {
      try {
        db.prepare(`INSERT OR IGNORE INTO etudiant_matricule (etudiant_id, id_ecampus, annee, source)
          VALUES (?,?,?,?)`).run(trouve.id, mat, annee, source);
      } catch { /* table absente : rien à rattacher */ }
    }
    return { id: trouve.id, cree: false, methode: trouve.methode };
  }
  const valeurs = { id_ecampus: mat, nom: String(p.nom || '').trim(), prenom: String(p.prenom || '').trim() };
  for (const c of CHAMPS) if (cols.has(c) && !vide(p[c])) valeurs[c] = p[c];
  const k = Object.keys(valeurs);
  const id = db.prepare(`INSERT INTO etudiant (${k.join(', ')}) VALUES (${k.map(c => '@' + c).join(', ')})`)
    .run(valeurs).lastInsertRowid;
  return { id: Number(id), cree: true, methode: null };
}

/** `rn_norm` = les chiffres du numéro national, à chaque écriture, par toutes les portes. */
export function poserNormalisationRN(dbx = db) {
  const cols = new Set(dbx.prepare('PRAGMA table_info(etudiant)').all().map(c => c.name));
  if (!cols.has('rn_norm') || !cols.has('num_national')) return false;
  const chiffres = x => `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${x}, '.', ''), '-', ''), ' ', ''), '/', ''), CHAR(160), ''), ',', '')`;
  dbx.exec(`
    DROP TRIGGER IF EXISTS etudiant_rn_norm_ins;
    DROP TRIGGER IF EXISTS etudiant_rn_norm_maj;
    CREATE TRIGGER etudiant_rn_norm_ins AFTER INSERT ON etudiant
      WHEN NEW.num_national IS NOT NULL AND TRIM(NEW.num_national) <> ''
       AND COALESCE(NEW.rn_norm, '') <> ${chiffres('NEW.num_national')}
      BEGIN UPDATE etudiant SET rn_norm = ${chiffres('NEW.num_national')} WHERE id = NEW.id; END;
    CREATE TRIGGER etudiant_rn_norm_maj AFTER UPDATE OF num_national ON etudiant
      WHEN NEW.num_national IS NOT NULL AND TRIM(NEW.num_national) <> ''
       AND COALESCE(NEW.rn_norm, '') <> ${chiffres('NEW.num_national')}
      BEGIN UPDATE etudiant SET rn_norm = ${chiffres('NEW.num_national')} WHERE id = NEW.id; END;`);
  // Les dossiers d'avant le déclencheur : le numéro sans rn_norm.
  dbx.prepare(`UPDATE etudiant SET rn_norm = ${chiffres('num_national')}
    WHERE num_national IS NOT NULL AND TRIM(num_national) <> '' AND (rn_norm IS NULL OR rn_norm = '')`).run();
  return true;
}
