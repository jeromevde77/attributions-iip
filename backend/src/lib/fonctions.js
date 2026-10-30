/**
 * LES FONCTIONS QU'ON ALLUME UNE À UNE (3.5.001, Charles, 30 octobre 2026 : « tout l'espace étudiant en ligne, mais pas
 * encore communiqué ; on activera petit à petit — d'abord la mise à disposition des documents, puis le reste ; tout comme
 * les présences, on va d'abord faire des tests » ; tranché : trois états, la présence par QR éteinte au départ).
 *
 * Chaque fonction est ÉTEINTE, en ESSAI ou ALLUMÉE. En essai, elle ne vaut que pour les étudiants d'essai (fonctions de
 * l'espace) ou les comptes d'essai (fonctions du personnel) que la direction désigne ; les autres ne la voient pas et ne
 * reçoivent rien. Tout naît éteint. Configuration → Fonctions (direction).
 *
 * La règle se lit ICI, et nulle part ailleurs : `fonctionPour(cle, { etudiantId | userId })`. Lucie ne dépose dans
 * l'espace que ce qui est ouvert pour CET étudiant, et refuse au relevé un geste d'une fonction fermée ; l'espace,
 * lui, ne montre que les onglets que Lucie lui nomme.
 */
import db from '../db/index.js';

export const ETATS = ['eteinte', 'essai', 'allumee'];

export const CATALOGUE = [
  { cle: 'espace.documents', famille: 'espace', titre: 'Mes documents',
    quoi: "Les pièces que l'école envoie à l'étudiant se retrouvent dans son espace, avec l'accusé de réception à signer." },
  { cle: 'espace.depot_office', famille: 'espace', titre: "Le dépôt d'office à la clôture",
    quoi: "À chaque séance close et publiée, l'attestation de réussite ou la motivation d'échec est déposée dans l'espace, puis un courriel prévient l'étudiant. Demande aussi « Mes documents »." },
  { cle: 'espace.resultats', famille: 'espace', titre: 'Mes résultats',
    quoi: 'Les résultats délibérés et publiés, unité par unité (NA sous 10).' },
  { cle: 'espace.reglements', famille: 'espace', titre: 'Les règlements',
    quoi: "Les textes que la Documentation destine aux étudiants, à lire et à accuser." },
  { cle: 'espace.messages', famille: 'espace', titre: 'Les messages',
    quoi: "Les messages de l'école (secrétariat, coordination, professeurs) et les réponses de l'étudiant ; un courriel d'avis par jour au plus." },
  { cle: 'espace.parcours', famille: 'espace', titre: 'Mon parcours',
    quoi: 'Le schéma de son programme : acquis, au programme, accessible, pas encore.' },
  { cle: 'espace.frais', famille: 'espace', titre: 'Mes frais',
    quoi: 'La note de frais, les versements, le virement et son QR de paiement.' },
  { cle: 'espace.va', famille: 'espace', titre: 'La demande de valorisation en ligne',
    quoi: "L'étudiant introduit sa demande de VA ou de VAE, dépose ses pièces et reçoit l'accusé de réception avec les frais d'analyse." },
  { cle: 'espace.pae', famille: 'espace', titre: 'Le PAE en ligne',
    quoi: "Pendant la fenêtre fixée par la direction, l'étudiant propose son programme (avec les frais estimés) et le confirme par code." },
  { cle: 'espace.candidats', famille: 'espace', titre: "Le code d'accès des candidats",
    quoi: "Un candidat sans adresse d'institut reçoit à son adresse privée un code pour entrer dans l'espace (demande de VA, documents, frais, messages)." },
  { cle: 'presence.qr', famille: 'personnel', titre: 'La présence par QR et le ticket de sortie',
    quoi: "Dans Mes cours → Ma journée, le professeur projette le QR de présence et le ticket de sortie. Éteinte, la présence s'encode à la main comme avant." },
];
const CLES = new Set(CATALOGUE.map(c => c.cle));

function lire() {
  let r = null;
  try { r = JSON.parse(db.prepare(`SELECT valeur FROM lucie_config WHERE cle = 'fonctions'`).get()?.valeur || 'null'); } catch { r = null; }
  const etats = Object.fromEntries(CATALOGUE.map(c => [c.cle, ETATS.includes(r?.etats?.[c.cle]) ? r.etats[c.cle] : 'eteinte']));
  return { etats, etudiants_essai: (r?.etudiants_essai || []).map(Number).filter(Boolean),
    comptes_essai: (r?.comptes_essai || []).map(Number).filter(Boolean) };
}

/** Les réglages, avec les noms des personnes d'essai (pour l'écran). */
export function reglagesFonctions() {
  const r = lire();
  const nomsE = r.etudiants_essai.length ? db.prepare(`SELECT id, nom, prenom, email_ecole FROM etudiant WHERE id IN (${r.etudiants_essai.map(() => '?').join(',')})`).all(...r.etudiants_essai) : [];
  const nomsC = r.comptes_essai.length ? db.prepare(`SELECT id, nom_complet, email, role FROM utilisateur WHERE id IN (${r.comptes_essai.map(() => '?').join(',')})`).all(...r.comptes_essai) : [];
  return { ...r, catalogue: CATALOGUE, etudiants: nomsE, comptes: nomsC };
}

export function reglerFonctions({ etats, etudiants_essai, comptes_essai } = {}) {
  const cur = lire();
  const n = {
    etats: { ...cur.etats, ...Object.fromEntries(Object.entries(etats || {}).filter(([k, v]) => CLES.has(k) && ETATS.includes(v))) },
    etudiants_essai: Array.isArray(etudiants_essai) ? [...new Set(etudiants_essai.map(Number).filter(Boolean))] : cur.etudiants_essai,
    comptes_essai: Array.isArray(comptes_essai) ? [...new Set(comptes_essai.map(Number).filter(Boolean))] : cur.comptes_essai,
  };
  db.prepare(`INSERT INTO lucie_config (cle, valeur) VALUES ('fonctions', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur`)
    .run(JSON.stringify(n));
  return reglagesFonctions();
}

/** La fonction vaut-elle pour cet étudiant, ou pour ce compte ? Sans personne : allumée pour tous. */
export function fonctionPour(cle, { etudiantId = null, userId = null } = {}) {
  const r = lire();
  const etat = r.etats[cle] || 'eteinte';
  if (etat === 'allumee') return true;
  if (etat !== 'essai') return false;
  if (etudiantId != null) return r.etudiants_essai.includes(Number(etudiantId));
  if (userId != null) return r.comptes_essai.includes(Number(userId));
  return false;
}

/** Les fonctions de l'espace ouvertes pour un étudiant (le nom court : « documents », « va »…). Vide = pas d'espace. */
export function fonctionsEspace(etudiantId) {
  const r = lire();
  return CATALOGUE.filter(c => c.famille === 'espace').filter(c => {
    const etat = r.etats[c.cle];
    return etat === 'allumee' || (etat === 'essai' && r.etudiants_essai.includes(Number(etudiantId)));
  }).map(c => c.cle.slice('espace.'.length));
}

/** Une fonction de l'espace est-elle ouverte pour au moins un étudiant ? (ce qui tourne en arrière-plan) */
export function fonctionOuverte(cle) {
  const r = lire();
  return r.etats[cle] === 'allumee' || (r.etats[cle] === 'essai' && r.etudiants_essai.length > 0);
}
