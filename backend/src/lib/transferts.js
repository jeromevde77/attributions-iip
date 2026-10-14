// ─────────────────────────────────────────────────────────────────────────────
// Lucie — LES TRANSFERTS (3.1.332)
//
// Charles, 13-14 octobre 2026 : « pour éviter tout souci, ce qui a permis de transférer dans
// Lucie doit maintenant être caché ». Les portes qui ont fait entrer le PASSÉ — classeurs de
// suivi, historique, décisions délibérées dans Excel — servent une fois, puis deviennent un
// danger : « Reprendre l'encodage » réécrirait les décisions du classeur par-dessus celles que
// le Conseil a prises dans Lucie. Tranché le 14 octobre :
//   · le module ne porte que les TRANSFERTS ; les imports courants (eCampus, signalétique,
//     HELB, dossier pédagogique…) restent là où l'on s'en sert — de même l'import des notes
//     d'une unité, qui est aussi le retour de la grille Excel envoyée aux professeurs ;
//   · l'ADMINISTRATEUR seul ouvre et ferme ; rouvrir se motive ;
//   · une porte se ferme PAR ANNÉE SCOLAIRE : 2026-2027 naît dans Lucie, 2025-2026 peut
//     encore recevoir une correction.
// Une porte fermée disparaît des écrans ET le serveur la refuse : un bouton caché n'est pas une
// protection. Ce qui est entré reste intact et lisible — on ferme la porte, on n'efface rien.
// ─────────────────────────────────────────────────────────────────────────────
import db from '../db/index.js';

export const PORTES = [
  { cle: 'classeur_suivi', libelle: 'Classeur de suivi et tableau plat',
    ou: 'Étudiants · Délibération → Importer le classeur de suivi',
    quoi: "Pondérations, notes et décisions d'une année, lues dans le classeur Excel de suivi." },
  { cle: 'reprise_decisions', libelle: 'Décisions délibérées dans le classeur',
    ou: "Délibération → bandeau « Délibérée dans le classeur » · Reprendre tout un classeur",
    quoi: "Reprend comme décisions de Lucie celles qu'un classeur portait déjà." },
  { cle: 'historique', libelle: 'Historique depuis les classeurs',
    ou: "Étudiants → Reconstruire l'historique",
    quoi: 'Plusieurs classeurs, plusieurs années : inscriptions, notes et résultats passés.' },
  { cle: 'pae_classeur', libelle: 'Classeur de PAE de la coordination',
    ou: 'Étudiants → Importer le classeur de PAE',
    quoi: 'Un étudiant par ligne, un cours par colonne : le PAE tel que la coordination le tenait dans Excel.' },
  { cle: 'cloture_reprise', libelle: "Clôturer une année reprise d'archives",
    ou: 'Délibération → Contrôles → Clôturer une année reprise',
    quoi: "Clôt d'un coup les séances d'une année reprise d'Excel, sous la provenance « reprise »." },
];
const CLES = new Set(PORTES.map(p => p.cle));

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS transfert_porte (
      cle            TEXT NOT NULL,
      annee_scolaire TEXT NOT NULL,
      ferme          INTEGER NOT NULL DEFAULT 0,
      maj_le         TEXT DEFAULT CURRENT_TIMESTAMP,
      maj_par        TEXT,
      PRIMARY KEY (cle, annee_scolaire)
    );
    CREATE TABLE IF NOT EXISTS transfert_journal (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      cle            TEXT NOT NULL,
      annee_scolaire TEXT NOT NULL,
      geste          TEXT NOT NULL CHECK (geste IN ('fermer', 'rouvrir')),
      motif          TEXT,
      fait_le        TEXT DEFAULT CURRENT_TIMESTAMP,
      fait_par       TEXT
    );
  `);
} catch (e) { console.error('[transferts] migration :', e.message); }

/** La porte est-elle fermée pour cette année ? Sans ligne : ouverte (rien ne change pour qui n'a rien réglé). */
export function porteFermee(cle, annee) {
  if (!annee) return false;
  try {
    return !!db.prepare('SELECT ferme FROM transfert_porte WHERE cle = ? AND annee_scolaire = ?').get(cle, String(annee))?.ferme;
  } catch { return false; }
}

/** Les portes fermées d'une année : { cle: true }. */
export function portesFermees(annee) {
  const out = {};
  try {
    for (const l of db.prepare('SELECT cle FROM transfert_porte WHERE annee_scolaire = ? AND ferme = 1').all(String(annee || '')))
      out[l.cle] = true;
  } catch { /* table absente */ }
  return out;
}

const libelleDe = cle => PORTES.find(p => p.cle === cle)?.libelle || cle;

/** Le refus, en mots : il dit quelle porte, quelle année, et où la rouvrir. */
export function refusPorte(res, cle, annee) {
  return res.status(423).json({
    error: `« ${libelleDe(cle)} » est fermé pour ${annee}.`,
    detail: `Ce transfert a été fermé pour ${annee} : les données de cette année vivent désormais dans Lucie. `
      + "L'administrateur peut le rouvrir, avec un motif, dans Configuration → Transferts.",
    porte_fermee: cle, annee,
  });
}

/**
 * Le garde d'une route de transfert. `anneeDe(req)` dit sur quelle année elle écrit ; à défaut,
 * le corps, les paramètres, la requête, puis l'année de travail (en-tête X-Annee).
 */
export function garderTransfert(cle, anneeDe = null) {
  if (!CLES.has(cle)) throw new Error(`porte de transfert inconnue : ${cle}`);
  return (req, res, next) => {
    const annee = (anneeDe && anneeDe(req))
      || req.body?.annee || req.params?.annee || req.query?.annee || req.annee || null;
    if (annee && porteFermee(cle, annee)) return refusPorte(res, cle, annee);
    next();
  };
}

/** Fermer ou rouvrir, avec la trace en ajout seul. Rouvrir exige un motif. */
export function poserPorte(cle, annee, ferme, motif, par) {
  if (!CLES.has(cle)) throw Object.assign(new Error('Porte inconnue.'), { status: 400 });
  if (!/^\d{4}-\d{4}$/.test(String(annee || ''))) throw Object.assign(new Error('Année scolaire attendue (AAAA-AAAA).'), { status: 400 });
  const m = String(motif || '').trim();
  if (!ferme && m.length < 5) throw Object.assign(new Error('Rouvrir un transfert se motive.'), { status: 400 });
  db.transaction(() => {
    db.prepare(`INSERT INTO transfert_porte (cle, annee_scolaire, ferme, maj_le, maj_par)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)
      ON CONFLICT(cle, annee_scolaire) DO UPDATE SET ferme = excluded.ferme,
        maj_le = CURRENT_TIMESTAMP, maj_par = excluded.maj_par`).run(cle, annee, ferme ? 1 : 0, par);
    db.prepare(`INSERT INTO transfert_journal (cle, annee_scolaire, geste, motif, fait_par)
      VALUES (?, ?, ?, ?, ?)`).run(cle, annee, ferme ? 'fermer' : 'rouvrir', m || null, par);
  })();
}
