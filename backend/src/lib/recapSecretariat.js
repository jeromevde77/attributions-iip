// ─────────────────────────────────────────────────────────────────────────────
// LE RÉCAPITULATIF DES COMPTES ÉTUDIANTS, AU TABLEAU DE BORD DU SECRÉTARIAT (3.5.666, Charles, 24 novembre 2026 : « il n'est
// pas nécessaire que nous recevions une notif à chaque fois qu'un étudiant demande un document ; mais une notif qui arrive sur le
// tableau de bord de Mati, Flo et Mélina avec un récapitulatif des mouvements sur les comptes étudiants serait bien » ; tranché :
// un récapitulatif par jour).
//
// Chaque matin, après 7 h (heure de Bruxelles), UNE notification au rôle secrétariat (`cible_role 'secretariat'`, lue par le fil
// de l'Accueil) : ce qui a bougé HIER dans les espaces des étudiants — demandes de pièces (et celles qui attendent encore), pièces
// téléchargées au centre de documents, connexions et premières connexions, photos et justificatifs déposés (et ceux qui attendent
// une décision), PAE confirmés et contestés, messages, demandes de VA en ligne. Une ligne n'existe que si son nombre n'est pas nul ;
// sans aucun mouvement hier, pas de récapitulatif (ce qui attend encore ne suffit pas : le même rappel chaque matin ne se lirait
// plus). Des nombres et des natures de pièces, jamais un nom d'étudiant. Une fois par jour : `lucie_config`
// « recap_secretariat_jour » garde le jour publié — un redémarrage ne republie rien. Ce n'est pas un courriel : dev comprise.
// Une table absente (base ancienne, portail non installé) compte zéro, elle ne casse rien.
// ─────────────────────────────────────────────────────────────────────────────
import db from '../db/index.js';
import { PIECES } from './codesPieces.js';

const essai = (f, d) => { try { return f(); } catch { return d; } };
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const nb = (sql, ...p) => essai(() => Number(db.prepare(sql).get(...p)?.n) || 0, 0);
const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;
const CLE_JOUR = 'recap_secretariat_jour';
const NOM_PIECE = new Map(PIECES.map(p => [p.code, p.nom]));

/** Bruxelles : le jour (AAAA-MM-JJ) et l'heure d'un instant. */
export function bruxelles(instant = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('fr-BE', { timeZone: 'Europe/Brussels',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    .formatToParts(instant).map(x => [x.type, x.value]));
  return { jour: `${p.year}-${p.month}-${p.day}`, heure: Number(p.hour) % 24, parts: p };
}

/** Minuit de Bruxelles d'un jour, en temps universel au format de SQLite (« AAAA-MM-JJ HH:MM:SS ») — les dates de ces tables. */
function minuitUTC(jour) {
  const [y, m, d] = jour.split('-').map(Number);
  const essaiUtc = Date.UTC(y, m - 1, d, 0, 0, 0);
  const p = bruxelles(new Date(essaiUtc)).parts;
  const vuLocal = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return new Date(essaiUtc - (vuLocal - essaiUtc)).toISOString().slice(0, 19).replace('T', ' ');
}
const veille = jour => new Date(Date.parse(`${jour}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);

/** Les bornes d'un jour de Bruxelles, en temps universel : [depuis, jusqua[. */
export function bornesJour(jour) {
  const lendemain = new Date(Date.parse(`${jour}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
  return { depuis: minuitUTC(jour), jusqua: minuitUTC(lendemain) };
}

/**
 * Ce qui a bougé entre `depuis` et `jusqua` (temps universel, format SQLite), et ce qui attend encore.
 * Rend null si rien n'a bougé ; sinon { titre, corps (HTML court), lien, lignes, chiffres }.
 */
export function composerRecap(depuis, jusqua, { jour = String(depuis).slice(0, 10) } = {}) {
  const fin = jusqua; // borne haute exclue
  const c = {};
  // Les demandes de pièces : celles d'hier, et toutes celles qui attendent le secrétariat.
  c.demandes_hier = nb(`SELECT COUNT(*) n FROM piece_demande WHERE demande_le >= ? AND demande_le < ?`, depuis, fin);
  c.demandes_attente = nb(`SELECT COUNT(*) n FROM piece_demande WHERE statut = 'recue'`);
  // Les pièces que les étudiants ont tirées eux-mêmes du centre de documents.
  const pieces = essai(() => db.prepare(`SELECT code FROM centre_delivrance WHERE le >= ? AND le < ?`).all(depuis, fin), []);
  c.pieces_hier = pieces.length;
  const parCode = new Map();
  for (const { code } of pieces) { const k = String(code || '').slice(0, 4); parCode.set(k, (parCode.get(k) || 0) + 1); }
  const natures = [...parCode].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3)
    .map(([k, n]) => `${NOM_PIECE.get(k) || k} (${n})`);
  // Les connexions : les étudiants entrés hier, et parmi eux ceux qui n'étaient jamais entrés avant.
  c.connectes_hier = nb(`SELECT COUNT(DISTINCT etudiant_id) n FROM portail_connexion WHERE le >= ? AND le < ?`, depuis, fin);
  c.premieres_hier = nb(`SELECT COUNT(DISTINCT x.etudiant_id) n FROM portail_connexion x WHERE x.le >= ? AND x.le < ?
    AND NOT EXISTS (SELECT 1 FROM portail_connexion y WHERE y.etudiant_id = x.etudiant_id AND y.le <> '' AND y.le < ?)`, depuis, fin, depuis);
  // Photos et justificatifs : déposés hier, et ceux qui attendent une décision.
  c.photos_hier = nb(`SELECT COUNT(*) n FROM etudiant_photo WHERE depose_le >= ? AND depose_le < ? AND source = 'espace'`, depuis, fin);
  c.photos_attente = nb(`SELECT COUNT(*) n FROM etudiant_photo WHERE statut = 'a_valider'`);
  c.justif_hier = nb(`SELECT COUNT(*) n FROM certificat_medical WHERE cree_le >= ? AND cree_le < ? AND depose_par = 'etudiant'`, depuis, fin);
  c.justif_attente = nb(`SELECT COUNT(*) n FROM certificat_medical WHERE statut = 'a_decider'`);
  // Le PAE : confirmé ou contesté depuis l'espace (une notification de désaccord par contestation et par rôle).
  c.pae_confirmes = nb(`SELECT COUNT(*) n FROM pae_signature_etudiant WHERE recu_le >= ? AND recu_le < ?`, depuis, fin);
  c.pae_contestes = nb(`SELECT COUNT(*) n FROM lucie_notification WHERE type = 'pae_desaccord' AND cible_role = 'secretariat'
    AND cree_le >= ? AND cree_le < ?`, depuis, fin);
  // Les messages écrits par les étudiants (réponses et messages à la direction).
  c.messages_hier = nb(`SELECT COUNT(*) n FROM message_etudiant_fil WHERE de = 'etudiant' AND le >= ? AND le < ?`, depuis, fin);
  // Les demandes de VA introduites en ligne (date de réception = le jour).
  c.va_hier = nb(`SELECT COUNT(*) n FROM etudiant_valorisation WHERE mode_introduction = 'en ligne' AND date_reception = ?`, jour);

  const mouvements = c.demandes_hier + c.pieces_hier + c.connectes_hier + c.photos_hier + c.justif_hier
    + c.pae_confirmes + c.pae_contestes + c.messages_hier + c.va_hier;
  if (!mouvements) return null;

  const lignes = [];
  if (c.demandes_attente || c.demandes_hier) {
    lignes.push(`Demandes de pièces à traiter : <b>${c.demandes_attente}</b>${c.demandes_hier ? ` (dont ${c.demandes_hier} reçue${c.demandes_hier > 1 ? 's' : ''} hier)` : ''}`);
  }
  if (c.pieces_hier) lignes.push(`${pluriel(c.pieces_hier, 'pièce téléchargée', 'pièces téléchargées')} par les étudiants${natures.length ? ` — ${natures.map(esc).join(', ')}` : ''}`);
  if (c.connectes_hier) lignes.push(`${pluriel(c.connectes_hier, 'étudiant connecté', 'étudiants connectés')}${c.premieres_hier ? `, dont ${c.premieres_hier} pour la première fois` : ''}`);
  if (c.photos_hier || c.photos_attente) lignes.push(`Photos : ${c.photos_hier ? `${c.photos_hier} déposée${c.photos_hier > 1 ? 's' : ''} hier · ` : ''}<b>${c.photos_attente}</b> à valider`);
  if (c.justif_hier || c.justif_attente) lignes.push(`Justificatifs d’absence : ${c.justif_hier ? `${c.justif_hier} reçu${c.justif_hier > 1 ? 's' : ''} hier · ` : ''}<b>${c.justif_attente}</b> à décider`);
  if (c.pae_confirmes) lignes.push(`${pluriel(c.pae_confirmes, 'PAE confirmé', 'PAE confirmés')} par l’étudiant`);
  if (c.pae_contestes) lignes.push(`${pluriel(c.pae_contestes, 'PAE contesté', 'PAE contestés')} (voir les notifications de la coordination)`);
  if (c.messages_hier) lignes.push(`${pluriel(c.messages_hier, 'message reçu', 'messages reçus')} des étudiants`);
  if (c.va_hier) lignes.push(`${pluriel(c.va_hier, 'demande de VA introduite', 'demandes de VA introduites')} en ligne`);

  // Le titre : les trois mouvements d'hier les plus nombreux.
  const enTete = [[c.pieces_hier, 'pièce', 'pièces'], [c.demandes_hier, 'demande', 'demandes'], [c.connectes_hier, 'connexion', 'connexions'],
    [c.messages_hier, 'message', 'messages'], [c.justif_hier, 'justificatif', 'justificatifs'], [c.photos_hier, 'photo', 'photos'],
    [c.pae_confirmes + c.pae_contestes, 'PAE', 'PAE'], [c.va_hier, 'VA', 'VA']]
    .filter(([n]) => n).sort((a, b) => b[0] - a[0]).slice(0, 3).map(([n, u, p]) => pluriel(n, u, p));
  const titre = `Comptes étudiants — hier : ${enTete.join(' · ')}`;
  // Le lien : là où le secrétariat a quelque chose à faire, dans cet ordre.
  const lien = c.demandes_attente ? '/etudiants?outil=demandes-pieces'
    : c.justif_attente ? '/etudiants?outil=suivi-presences&face=certificats'
      : c.photos_attente ? '/etudiants?outil=photos' : '/etudiants?outil=demandes-pieces';
  return { titre, corps: lignes.join('<br>'), lien, lignes, chiffres: c };
}

/**
 * Publie le récapitulatif du jour : après 7 h à Bruxelles, une fois par jour, sur les mouvements de la veille.
 * `maintenant` pour le banc. Rend { publie, jour, raison? }.
 */
export function publierRecap({ maintenant = new Date() } = {}) {
  const { jour, heure } = bruxelles(maintenant);
  if (heure < 7) return { publie: false, jour, raison: 'avant 7 h' };
  const deja = essai(() => db.prepare('SELECT valeur FROM lucie_config WHERE cle = ?').get(CLE_JOUR)?.valeur, null);
  if (deja === jour) return { publie: false, jour, raison: 'déjà fait aujourd’hui' };
  const hier = veille(jour);
  const { depuis, jusqua } = bornesJour(hier);
  const r = composerRecap(depuis, jusqua, { jour: hier });
  db.transaction(() => {
    db.prepare(`INSERT INTO lucie_config (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur`).run(CLE_JOUR, jour);
    if (r) db.prepare(`INSERT INTO lucie_notification (type, titre, corps, lien, cible_role, cree_par)
      VALUES ('recap_comptes_etudiants', ?, ?, ?, 'secretariat', 'Lucie')`).run(r.titre, r.corps, r.lien);
  })();
  return r ? { publie: true, jour, titre: r.titre, corps: r.corps } : { publie: false, jour, raison: 'aucun mouvement hier' };
}

/** Toutes les 30 minutes (la première fois une minute après le démarrage) : publie dès qu'il est 7 h passées. */
export function planifierRecapSecretariat() {
  const tour = () => { try { const r = publierRecap(); if (r.publie) console.log('[récap secrétariat]', r.titre); } catch (e) { console.error('[récap secrétariat]', e.message); } };
  setTimeout(tour, 70_000).unref?.();
  setInterval(tour, 30 * 60 * 1000).unref?.();
}
