/**
 * LE CIRCUIT D'UN AMÉNAGEMENT RAISONNABLE (Charles, 2 octobre 2026).
 *
 *   A  la demande — encodée, puis VALIDÉE par qui écrit les AR : elle passe
 *      au vert, et seulement alors le reste s'ouvre ;
 *   B  le rapport, qui porte les mesures demandées — modifiable, puis VALIDÉ
 *      par la PERSONNE DE RÉFÉRENCE du dossier (ou la direction à sa place) ;
 *   →  la validation de B appelle les chargés de cours des UE : chacun rend
 *      son avis dans Mes cours, mesure par mesure ;
 *   CE le Conseil des études voit pièces et avis, et tranche.
 *
 * LE CIRCUIT SE DÉDUIT. Un dossier décidé avant l'existence du circuit (statut
 * de décision, aucune validation A) est « hors circuit » : rien ne s'y verrouille
 * — on ne l'enferme pas dans des étapes qui n'existaient pas.
 *
 * SECRET PROFESSIONNEL (art. 5) : le chargé de cours ne voit que les mesures
 * demandées et leurs précisions — jamais la pièce, les soins, le diagnostic ni
 * la motivation.
 */
import db from '../db/index.js';

export const DIRECTION = ['admin', 'directeur', 'directeur_adjoint'];
export const DECIDE = ['accepte', 'partiel', 'refuse', 'recours'];
export const SENS_AVIS = { realisable: 'réalisable', adaptation: 'avec adaptation', impossible: 'pas réalisable' };

export function migrerCircuitAR() {
  const cols = db.prepare('PRAGMA table_info(amenagement_dossier)').all().map(c => c.name);
  for (const [nom, type] of [['valide_a_le', 'TEXT'], ['valide_a_par', 'TEXT'],
    ['valide_b_le', 'TEXT'], ['valide_b_par', 'TEXT'], ['avis_demande_le', 'TEXT']]) {
    if (!cols.includes(nom)) db.exec(`ALTER TABLE amenagement_dossier ADD COLUMN ${nom} ${type}`);
  }
  db.exec(`CREATE TABLE IF NOT EXISTS amenagement_avis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dossier_id INTEGER NOT NULL,
    mesure_id INTEGER NOT NULL,
    professeur_id INTEGER NOT NULL,
    auteur TEXT,
    sens TEXT NOT NULL CHECK (sens IN ('realisable','adaptation','impossible')),
    motif TEXT,
    rendu_le TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (mesure_id, professeur_id)
  )`);
  try {
    db.prepare('INSERT OR IGNORE INTO parametre (cle, valeur, label, groupe) VALUES (?, ?, ?, ?)')
      .run('ar_catalogue', CATALOGUE_DEFAUT,
        'Aménagements raisonnables — catalogue des mesures (« # Moment » ouvre un groupe ; « M · » matériel, « P · » pédagogique)',
        'procedures');
  } catch { /* table absente */ }
}

/* LE CATALOGUE, RANGÉ PAR MOMENT, RÉGLABLE PAR LA DIRECTION. Une ligne par
   mesure ; « M · » matérielle, « P · » pédagogique (art. 7 § 1er). */
const CATALOGUE_DEFAUT = [
  '# Évaluations',
  'P · Temps supplémentaire lors des évaluations',
  'M · Local isolé ou à effectif réduit',
  'P · Pauses aménagées durant les épreuves',
  'P · Passage d’une épreuve écrite à l’oral, ou l’inverse',
  'P · Consignes reformulées ou lues',
  'P · Étalement des épreuves sur plusieurs séances',
  'M · Questionnaire en police adaptée ou en format numérique',
  'M · Usage d’un ordinateur avec correcteur',
  'P · Calendrier d’examens aménagé (pas deux épreuves le même jour)',
  '# Cours',
  'M · Supports de cours en format numérique accessible',
  'M · Supports transmis avant le cours',
  'M · Documents en gros caractères ou police adaptée',
  'M · Autorisation d’enregistrer les cours',
  'M · Aide à la prise de notes',
  'M · Place réservée dans le local',
  'M · Interprète en langue des signes',
  'P · Souplesse sur les absences liées aux soins',
  'P · Sorties de cours autorisées (soins, pauses)',
  '# Stage',
  'P · Adaptation des horaires ou de la durée du stage',
  'P · Étalement du stage',
  'P · Choix d’un lieu de stage adapté',
  'P · Information du maître de stage (avec l’accord de l’étudiant)',
  '# Accompagnement',
  'P · Personne de référence désignée',
  'P · Rencontre de suivi à mi-parcours',
  'P · Tutorat par un pair',
  'P · Autre — à décrire',
].join('\n');

const slug = t => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
  .replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);

/** Le catalogue : [{ code, nature, libelle, moment }]. */
export function catalogueAR() {
  let v = CATALOGUE_DEFAUT;
  try { v = db.prepare("SELECT valeur FROM parametre WHERE cle = 'ar_catalogue'").get()?.valeur || v; } catch { /* */ }
  const out = []; let moment = 'Autres';
  for (const l of String(v).split(/\r?\n/).map(x => x.trim()).filter(Boolean)) {
    if (l.startsWith('#')) { moment = l.replace(/^#+\s*/, ''); continue; }
    const m = l.match(/^([MP])\s*[·:-]\s*(.+)$/i);
    const nature = m && m[1].toUpperCase() === 'M' ? 'materiel' : 'pedagogique';
    const libelle = m ? m[2].trim() : l;
    out.push({ code: slug(libelle), nature, libelle, moment });
  }
  return out;
}

export const horsCircuit = d => !d.valide_a_le && DECIDE.includes(d.statut);

export function manquesA(d) {
  return [
    !d.date_demande && 'la date de la demande',
    !d.soins_specifiques && 'la nature des soins et aménagements demandés',
    !d.signe_etudiant_le && "la signature de l'étudiant",
  ].filter(Boolean);
}
export function manquesB(d, nbMesures) {
  return [
    !d.personne_reference && 'la personne de référence',
    !nbMesures && 'au moins une mesure demandée',
  ].filter(Boolean);
}

/* LA PERSONNE DE RÉFÉRENCE est un nom écrit sur le dossier : on la reconnaît
   à son nom et à son prénom, dans n'importe quel ordre, casse et accents
   ignorés. Celui qui clique est celui qui signe. */
const mots = t => new Set(String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().split(/[^a-z0-9]+/).filter(x => x.length > 1));
export function estPersonneReference(user, d) {
  if (!d.personne_reference) return false;
  const ref = mots(d.personne_reference);
  if (!ref.size) return false;
  const lui = mots(`${user?.nom || ''} ${user?.nom_complet || ''}`);
  let prof = null;
  try {
    prof = db.prepare('SELECT p.nom, p.prenom FROM utilisateur u JOIN professeur p ON p.id = u.professeur_id WHERE u.id = ?').get(user?.id);
  } catch { /* */ }
  if (prof) for (const x of mots(`${prof.nom} ${prof.prenom}`)) lui.add(x);
  return [...ref].every(x => lui.has(x));
}

/** Les avis rendus sur un dossier : [{ mesure_id, professeur_id, auteur, sens, motif, rendu_le }]. */
export function avisDuDossier(dossierId) {
  return db.prepare('SELECT mesure_id, professeur_id, auteur, sens, motif, rendu_le FROM amenagement_avis WHERE dossier_id = ? ORDER BY rendu_le').all(dossierId);
}
