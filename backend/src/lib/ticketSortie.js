/**
 * LE TICKET DE SORTIE (Charles, 28 octobre 2026 : « fais le ticket de sortie par le
 * QR »). En fin de séance, le professeur projette un QR ; l'étudiant, dont le
 * téléphone est déjà lié pour la présence, répond à deux ou trois questions — « j'ai
 * compris », « ce qui reste flou », un QCM. C'est l'évaluation formative la plus
 * simple qui soit : le professeur sait, avant la séance suivante, ce qui n'est pas
 * passé.
 *
 * ANONYME PAR DÉFAUT : le serveur garde l'étudiant (une réponse par personne, et
 * seulement les inscrits de la séance), le professeur ne voit que les totaux et les
 * textes, sans nom. Nominatif sur choix du professeur : il voit qui a répondu quoi,
 * et le QCM peut se verser dans le carnet de cotes.
 *
 * Les jetons sont ceux de la présence (`signerJeton`) avec leurs propres préfixes :
 *   x  le QR projeté du ticket (même durée qu'un QR de présence) ;
 *   y  la preuve qu'un QR valable a été scanné — le temps de répondre (20 min).
 */
import db from '../db/index.js';
import { signerJeton, verifierSigne, reglagesPresenceQr, appareilDe, attendusDeLaSeance, lireSeance, aujourdhuiBruxelles, modeEssai } from './presenceQr.js';

export const MAX_QUESTIONS = 4;
export const TYPES = { echelle: 'Échelle de 1 à 5', texte: 'Réponse courte', choix: 'Choix (QCM)' };
export const QUESTIONS_DEFAUT = [
  { type: 'echelle', texte: 'Aujourd’hui, j’ai compris…', bornes: ['pas du tout', 'tout'] },
  { type: 'texte', texte: 'Ce qui reste flou pour moi :' },
];
const REPONSE_S = 20 * 60;
const APRES_FIN_MIN = 60;      // le ticket reste ouvert une heure après la fin du cours

export function migrerTicket(base = db) {
  base.exec(`
    CREATE TABLE IF NOT EXISTS ticket_sortie (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seance_id INTEGER NOT NULL UNIQUE,
      cours_code TEXT, annee_scolaire TEXT,
      questions TEXT NOT NULL,
      anonyme INTEGER NOT NULL DEFAULT 1,
      cree_par TEXT, cree_le TEXT DEFAULT (datetime('now')),
      ferme_le TEXT);
    CREATE TABLE IF NOT EXISTS ticket_reponse (
      ticket_id INTEGER NOT NULL REFERENCES ticket_sortie(id) ON DELETE CASCADE,
      etudiant_id INTEGER NOT NULL,
      reponses TEXT NOT NULL,
      le TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (ticket_id, etudiant_id));`);
}

const refus = (erreur, message) => ({ erreur, message });
const lire = id => {
  const t = db.prepare('SELECT * FROM ticket_sortie WHERE id = ?').get(Number(id));
  return t ? { ...t, questions: JSON.parse(t.questions || '[]') } : null;
};
export const ticketDeLaSeance = seanceId => {
  const t = db.prepare('SELECT id FROM ticket_sortie WHERE seance_id = ?').get(Number(seanceId));
  return t ? lire(t.id) : null;
};
const nbReponses = id => db.prepare('SELECT COUNT(*) n FROM ticket_reponse WHERE ticket_id = ?').get(id).n;

/** Les questions proposées par l'écran, vérifiées. */
export function lireQuestions(qs) {
  if (!Array.isArray(qs) || !qs.length) return refus('questions', 'Au moins une question.');
  if (qs.length > MAX_QUESTIONS) return refus('questions', `${MAX_QUESTIONS} questions au plus : un ticket de sortie se remplit en une minute.`);
  const out = [];
  for (const q of qs) {
    const type = String(q?.type || ''); const texte = String(q?.texte || '').trim();
    if (!TYPES[type]) return refus('questions', `Type de question inconnu : ${type}.`);
    if (!texte || texte.length > 200) return refus('questions', 'Chaque question a un texte (200 caractères au plus).');
    if (type === 'choix') {
      const options = (Array.isArray(q.options) ? q.options : []).map(o => String(o || '').trim()).filter(Boolean);
      if (options.length < 2 || options.length > 6) return refus('questions', `« ${texte} » : de 2 à 6 réponses possibles.`);
      const bonne = q.bonne === null || q.bonne === undefined || q.bonne === '' ? null : Number(q.bonne);
      if (bonne !== null && !(bonne >= 0 && bonne < options.length)) return refus('questions', `« ${texte} » : la bonne réponse n’est pas dans la liste.`);
      out.push({ type, texte, options, bonne });
    } else if (type === 'echelle') {
      out.push({ type, texte, bornes: Array.isArray(q.bornes) && q.bornes.length === 2 ? q.bornes.map(b => String(b).slice(0, 30)) : ['pas du tout', 'tout'] });
    } else out.push({ type, texte });
  }
  return { questions: out };
}

/** Composer (ou recomposer, tant que personne n'a répondu) le ticket d'une séance. */
export function poserTicket(seance, { questions, anonyme = true }, par) {
  const q = lireQuestions(questions);
  if (q.erreur) return q;
  const t = ticketDeLaSeance(seance.id);
  if (t && nbReponses(t.id)) return refus('repondu', 'Des étudiants ont déjà répondu : les questions ne changent plus.');
  if (t) db.prepare('UPDATE ticket_sortie SET questions = ?, anonyme = ?, ferme_le = NULL WHERE id = ?').run(JSON.stringify(q.questions), anonyme ? 1 : 0, t.id);
  else db.prepare('INSERT INTO ticket_sortie (seance_id, cours_code, annee_scolaire, questions, anonyme, cree_par) VALUES (?,?,?,?,?,?)')
    .run(seance.id, seance.cours_code, seance.annee_scolaire, JSON.stringify(q.questions), anonyme ? 1 : 0, par);
  return { ok: true, ticket: ticketDeLaSeance(seance.id) };
}

const hm = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
/** Ouvert : pas fermé à la main, le jour de la séance, jusqu'à une heure après la fin. */
export function ticketOuvert(t, s, maintenant = new Date()) {
  if (t.ferme_le) return false;
  if (modeEssai()) return true;
  if (s.date !== aujourdhuiBruxelles(maintenant)) return false;
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Brussels', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(maintenant);
  return hm(f) <= hm(s.heure_fin || s.heure_debut) + APRES_FIN_MIN;
}

/** Le QR à projeter (rotation de la présence). */
export function qrDuTicket(t, maintenant = new Date()) {
  const s = lireSeance(t.seance_id);
  if (!s || !ticketOuvert(t, s, maintenant)) return refus('ferme', 'Ce ticket est fermé.');
  return { ok: true, jeton: signerJeton('x', t.id, Math.floor(maintenant.getTime() / 1000)), rotation_s: reglagesPresenceQr().rotation_s };
}

function etudiantDuTicket(t, appareilBrut, maintenant) {
  const s = lireSeance(t.seance_id);
  if (!s) return refus('seance', 'Cette séance n’existe plus.');
  if (!ticketOuvert(t, s, maintenant)) return refus('ferme', 'Ce ticket de sortie est fermé.');
  const app = appareilDe(appareilBrut, maintenant);
  if (!app) return refus('appareil_absent', 'Ce téléphone n’est pas encore lié : scannez d’abord le QR de présence d’un cours, puis revenez au ticket.');
  if (!attendusDeLaSeance(s).some(e => e.id === app.etudiant_id)) return refus('non_inscrit', 'Vous n’êtes pas inscrit(e) à cette séance.');
  return { s, etudiant_id: app.etudiant_id };
}
const libelle = s => `${s.cours_nom || s.matiere || s.cours_code || 'Cours'}${s.ue_num != null ? ` (UE ${s.ue_num})` : ''}`;

/** Le QR scanné : les questions, et la preuve du scan pour y répondre. */
export function ouvrirTicket(jeton, appareilBrut, maintenant = new Date()) {
  const v = verifierSigne(jeton, 'x', reglagesPresenceQr().validite_s, Math.floor(maintenant.getTime() / 1000));
  if (!v.ok) return refus(v.erreur === 'expire' ? 'qr_expire' : 'qr_invalide', v.erreur === 'expire' ? 'Ce QR a expiré : scannez celui qui est projeté maintenant.' : 'Ce QR n’est pas valable.');
  const t = lire(v.seanceId);
  if (!t) return refus('inconnu', 'Ce ticket n’existe plus.');
  const x = etudiantDuTicket(t, appareilBrut, maintenant);
  if (x.erreur) return x;
  const deja = db.prepare('SELECT 1 FROM ticket_reponse WHERE ticket_id = ? AND etudiant_id = ?').get(t.id, x.etudiant_id);
  if (deja) return { ok: true, deja: true, message: 'Vous avez déjà répondu à ce ticket. Merci !' };
  return { ok: true, ticket: signerJeton('y', t.id, Math.floor(maintenant.getTime() / 1000)), cours: libelle(x.s), anonyme: !!t.anonyme,
    questions: t.questions.map(q => ({ type: q.type, texte: q.texte, options: q.options, bornes: q.bornes })) };   // la bonne réponse ne sort pas
}

/** Les réponses : une par question, dans l'ordre. */
export function repondreTicket(ticket, appareilBrut, reponses, maintenant = new Date()) {
  const v = verifierSigne(ticket, 'y', REPONSE_S, Math.floor(maintenant.getTime() / 1000));
  if (!v.ok) return refus('ticket_expire', 'Le temps de réponse est écoulé : scannez de nouveau le QR projeté.');
  const t = lire(v.seanceId);
  if (!t) return refus('inconnu', 'Ce ticket n’existe plus.');
  const x = etudiantDuTicket(t, appareilBrut, maintenant);
  if (x.erreur) return x;
  const r = Array.isArray(reponses) ? reponses : [];
  const propres = t.questions.map((q, i) => {
    const a = r[i];
    if (q.type === 'echelle') { const n = Number(a); return n >= 1 && n <= 5 ? Math.round(n) : null; }
    if (q.type === 'choix') { const n = Number(a); return a !== null && a !== '' && n >= 0 && n < q.options.length ? Math.round(n) : null; }
    const s = String(a ?? '').trim(); return s ? s.slice(0, 500) : null;
  });
  if (propres.every(a => a === null)) return refus('vide', 'Répondez au moins à une question.');
  const n = db.prepare('INSERT OR IGNORE INTO ticket_reponse (ticket_id, etudiant_id, reponses) VALUES (?,?,?)').run(t.id, x.etudiant_id, JSON.stringify(propres)).changes;
  return n ? { ok: true, message: 'Merci ! Votre réponse est enregistrée.' } : { ok: true, deja: true, message: 'Vous aviez déjà répondu à ce ticket.' };
}

/** Les résultats pour le professeur : totaux, textes ; les noms seulement si le ticket est nominatif. */
export function resultatsTicket(t) {
  const s = lireSeance(t.seance_id);
  const rep = db.prepare(`SELECT r.etudiant_id, r.reponses, r.le, e.nom, e.prenom FROM ticket_reponse r
    LEFT JOIN etudiant e ON e.id = r.etudiant_id WHERE r.ticket_id = ? ORDER BY r.le`).all(t.id)
    .map(x => ({ ...x, reponses: JSON.parse(x.reponses || '[]') }));
  const questions = t.questions.map((q, i) => {
    const vals = rep.map(x => x.reponses[i]).filter(v => v !== null && v !== undefined);
    if (q.type === 'echelle') {
      const dist = [1, 2, 3, 4, 5].map(k => vals.filter(v => v === k).length);
      return { ...q, n: vals.length, distribution: dist, moyenne: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 : null };
    }
    if (q.type === 'choix') {
      const dist = q.options.map((_, k) => vals.filter(v => v === k).length);
      return { ...q, n: vals.length, distribution: dist, reussite: q.bonne == null || !vals.length ? null : Math.round(dist[q.bonne] / vals.length * 100) };
    }
    return { ...q, n: vals.length, textes: rep.filter(x => x.reponses[i]).map(x => ({ texte: x.reponses[i], ...(t.anonyme ? {} : { nom: `${String(x.nom || '').toUpperCase()} ${x.prenom || ''}`.trim() }) })) };
  });
  return { id: t.id, anonyme: !!t.anonyme, ferme: !!t.ferme_le, ouvert: s ? ticketOuvert(t, s) : false, attendus: s ? attendusDeLaSeance(s).length : 0,
    reponses: rep.length, questions,
    ...(t.anonyme ? {} : { par_etudiant: rep.map(x => ({ etudiant_id: x.etudiant_id, nom: `${String(x.nom || '').toUpperCase()} ${x.prenom || ''}`.trim(), reponses: x.reponses })) }) };
}

export function fermerTicket(t) {
  db.prepare("UPDATE ticket_sortie SET ferme_le = datetime('now') WHERE id = ? AND ferme_le IS NULL").run(t.id);
  return { ok: true };
}
