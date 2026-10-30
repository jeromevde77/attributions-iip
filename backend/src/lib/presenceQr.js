/**
 * LA PRÉSENCE PAR QR CODE (Charles, 28 octobre 2026).
 *
 * Le professeur projette un QR qui change toutes les 15 secondes ; l'étudiant
 * le scanne avec son téléphone, sans appli ni compte. La première fois, il
 * donne son adresse d'école et un code à six chiffres lui arrive par courriel :
 * son téléphone est alors APPAIRÉ — un jeton aléatoire en cookie, dont la base
 * ne garde que l'empreinte. Ensuite, un scan suffit.
 *
 * Trois jetons, trois usages, et aucun ne vaut pour un autre (préfixe signé) :
 *   q  le QR projeté : séance + seconde ; valable `validite_s` (30 s) ;
 *   t  le ticket : la preuve qu'un QR valable a été scanné À CET INSTANT ; il
 *      laisse le temps de recevoir le code (15 min) sans rallonger le QR ;
 *   l'appareil : aléatoire, pas signé — seule son empreinte est en base.
 *
 * Ce qui s'écrit passe par `ecrirePresences()` (source 'qr') : la présence par
 * QR est une présence comme une autre, dans la même table, au même journal.
 *
 * Données gardées (RGPD, voir docs/rgpd-presences-qr.md) : l'étudiant,
 * l'empreinte du jeton d'appareil, un navigateur simplifié (« iPhone · Safari »),
 * des dates. Aucune adresse IP : la limite de débit vit en mémoire.
 */
import crypto from 'crypto';
import db from '../db/index.js';
import { ecrirePresences } from './cep.js';
import { etudiantsDuCours } from './etudiantsCours.js';

export const MENTION_PROPOSEE = 'Selon l’article 6 du règlement général des études de l’enseignement supérieur de promotion sociale (arrêté du Gouvernement de la Communauté française du 2 septembre 2015), l’étudiant satisfait à la condition d’assiduité s’il ne s’absente pas, sans motif valable, de plus de quatre dixièmes des activités d’enseignement dont il n’est pas dispensé ; à défaut, il ne peut être considéré comme étudiant régulier (article 5). La validité d’un motif d’absence est appréciée par la direction : prenez contact avec le secrétariat.';
export const REGLAGES_DEFAUT = {
  rotation_s: 15,          // le QR change toutes les…
  validite_s: 30,          // un QR scanné reste valable… (marge réseau)
  avant_min: 10,           // la fenêtre s'ouvre … minutes avant le début
  apres_min: 20,           // … et se ferme … minutes après le début
  appairages_semaine: 1,   // au-delà : le secrétariat
  // LE RETARD AU SCAN (Charles, 28 octobre 2026 : « P* ») : un scan plus de … minutes
  // après le début marque « en retard ». 0 = jamais d'office (choix de l'école).
  retard_apres_min: 0,
  seuil_absence_pct: 10,   // au-delà, l'étudiant est signalé (10 % : seuil du congé-éducation payé)
  // LE SEUIL GLOBAL (Charles, 28 octobre 2026 : « il faut aussi le seuil de 40 % ») :
  // TOUTES les absences, justifiées ou non, sur les heures tenues.
  seuil_global_pct: 40,
  // SUR QUOI SE COMPTE-T-IL ? Le RGE du supérieur de promotion sociale (A.Gt du
  // 2 septembre 2015, art. 6 § 1er, mis à jour le 13 juin 2024) : « sans motif
  // valable, plus de quatre dixièmes des activités d'enseignement dont il n'est
  // pas dispensé » — donc les absences INJUSTIFIÉES, hors dispenses (la grille sort
  // les activités dispensées des heures dues). « toutes » reste possible.
  seuil_global_base: 'injustifiees',
  // Sa mention : les articles 5 et 6 du RGE, cités ; la direction peut la réécrire.
  mention_seuil_global: MENTION_PROPOSEE,
  // LES DEUX DOMAINES DE L'ÉCOLE (Charles : « les deux, car on a des étudiants
  // des deux ; ce qui fait foi, c'est que ça colle avec le compte dans Lucie »).
  domaines: ['institut-prigogine.be', 'helb-prigogine.be'],
};
const BORNES = { rotation_s: [5, 120], validite_s: [10, 300], avant_min: [0, 120], apres_min: [0, 240], appairages_semaine: [1, 10], retard_apres_min: [0, 240], seuil_absence_pct: [1, 100], seuil_global_pct: [1, 100] };
const TICKET_S = 15 * 60;
const CODE_MIN = 10;
const CODE_ESSAIS = 5;
const CODES_PAR_HEURE = 3;

export function migrerPresenceQr(base = db) {
  base.exec(`
    CREATE TABLE IF NOT EXISTS presence_appareil (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      etudiant_id INTEGER NOT NULL,
      jeton_hash TEXT NOT NULL UNIQUE,
      appareil TEXT,
      annee_scolaire TEXT,
      cree_le TEXT NOT NULL DEFAULT (datetime('now')),
      expire_le TEXT NOT NULL,
      dernier_usage_le TEXT,
      revoque_le TEXT, revoque_par TEXT, revoque_motif TEXT);
    CREATE INDEX IF NOT EXISTS idx_presence_appareil_etu ON presence_appareil(etudiant_id);
    CREATE TABLE IF NOT EXISTS presence_code (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      etudiant_id INTEGER NOT NULL,
      code_hash TEXT NOT NULL,
      cree_le TEXT NOT NULL DEFAULT (datetime('now')),
      expire_le TEXT NOT NULL,
      essais INTEGER NOT NULL DEFAULT 0,
      utilise_le TEXT);
    CREATE INDEX IF NOT EXISTS idx_presence_code_etu ON presence_code(etudiant_id);
    /* LES SÉANCES OÙ LE QR A ÉTÉ PROJETÉ : c'est d'elles que le tableau de bord
       du professeur demande, la fenêtre fermée, ce qu'il en est des absents. */
    CREATE TABLE IF NOT EXISTS presence_qr_seance (
      seance_id INTEGER PRIMARY KEY,
      ouvert_le TEXT NOT NULL DEFAULT (datetime('now')),
      ouvert_par_id INTEGER, ouvert_par TEXT,
      complete_le TEXT);
    /* EN AJOUT SEUL : appairages, désactivations, révocations, refus. Aucune
       route ne le modifie ni ne l'efface — une trace qu'on corrige ne prouve rien. */
    CREATE TABLE IF NOT EXISTS presence_qr_journal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      le TEXT NOT NULL DEFAULT (datetime('now')),
      type TEXT NOT NULL,
      etudiant_id INTEGER, seance_id INTEGER, appareil_id INTEGER,
      raison TEXT, par TEXT);
    CREATE INDEX IF NOT EXISTS idx_presence_qr_journal_le ON presence_qr_journal(le);
  `);
}

// ── Réglages ──────────────────────────────────────────────────────────────
export function reglagesPresenceQr() {
  let lu = {};
  try { lu = JSON.parse(db.prepare("SELECT valeur FROM lucie_config WHERE cle = 'presence_qr'").get()?.valeur || '{}'); }
  catch { lu = {}; }
  const r = { ...REGLAGES_DEFAUT };
  for (const [k, [mini, maxi]] of Object.entries(BORNES)) {
    const v = Number(lu[k]);
    if (Number.isFinite(v)) r[k] = Math.min(maxi, Math.max(mini, Math.round(v)));
  }
  if (typeof lu.mention_seuil_global === 'string') r.mention_seuil_global = lu.mention_seuil_global.slice(0, 800);
  if (lu.seuil_global_base === 'injustifiees' || lu.seuil_global_base === 'toutes') r.seuil_global_base = lu.seuil_global_base;
  if (Array.isArray(lu.domaines)) {
    const d = lu.domaines.map(x => String(x).trim().toLowerCase().replace(/^@/, '')).filter(x => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(x));
    if (d.length) r.domaines = d;
  }
  // Le QR ne peut pas mourir avant d'avoir été remplacé.
  if (r.validite_s < r.rotation_s) r.validite_s = r.rotation_s;
  return r;
}

// ── La clé ────────────────────────────────────────────────────────────────
/* `PRESENCE_QR_SECRET` si on l'a posé ; sinon une clé DÉRIVÉE de JWT_SECRET,
   que le serveur exige déjà (docker-compose refuse de démarrer sans) — rien à
   ajouter sur le VPS. Jamais de valeur par défaut en production : sans secret,
   la fonction se refuse plutôt que de signer avec une clé connue de tous. */
function cle() {
  const propre = process.env.PRESENCE_QR_SECRET;
  if (propre && propre.length >= 32) return Buffer.from(propre);
  const base = process.env.JWT_SECRET;
  if (!base || (base === 'change-me-in-prod' && process.env.NODE_ENV === 'production')) return null;
  return crypto.createHmac('sha256', base).update('presence-qr').digest();
}
export const secretDisponible = () => !!cle();

/* LE MODE ESSAI (Charles, 28 octobre 2026 : « fais un mode essai ») : sur la
   DEV seulement, le QR se projette pour n'importe quelle séance, quel que soit
   le jour, et la fenêtre de scan est ignorée — pour essayer sans attendre
   qu'un cours commence. Verrouillé par NODE_ENV, comme la restauration de
   sauvegarde : en production, ni l'écran ni une requête ne l'allument. */
export const modeEssai = () => process.env.NODE_ENV === 'development';

const signature = (k, texte) => crypto.createHmac('sha256', k).update(texte).digest('base64url');

function signer(type, seanceId, secondes) {
  const k = cle();
  if (!k) throw Object.assign(new Error('Secret de signature absent : la présence par QR est désactivée.'), { code: 'secret' });
  const corps = `${type}.${Number(seanceId)}.${Number(secondes)}`;
  return `${corps}.${signature(k, corps)}`;
}

/** Vérifie un jeton signé. Rend { ok, seanceId, t } ou { erreur: 'format'|'falsifie'|'expire'|'secret' }. */
export function verifierSigne(jeton, type, dureeS, maintenantS = Math.floor(Date.now() / 1000)) {
  const k = cle();
  if (!k) return { erreur: 'secret' };
  const p = String(jeton || '').split('.');
  if (p.length !== 4 || p[0] !== type || !/^\d{1,10}$/.test(p[1]) || !/^\d{1,12}$/.test(p[2])) return { erreur: 'format' };
  const attendu = Buffer.from(signature(k, `${p[0]}.${p[1]}.${p[2]}`));
  const recu = Buffer.from(p[3]);
  if (attendu.length !== recu.length || !crypto.timingSafeEqual(attendu, recu)) return { erreur: 'falsifie' };
  const t = Number(p[2]);
  // Cinq secondes d'avance tolérées : deux horloges ne s'accordent jamais tout à fait.
  if (t > maintenantS + 5 || maintenantS - t > dureeS) return { erreur: 'expire' };
  return { ok: true, seanceId: Number(p[1]), t };
}

export const jetonQr = (seanceId, maintenantS = Math.floor(Date.now() / 1000)) => signer('q', seanceId, maintenantS);
/** La même signature pour d'autres jetons (le ticket de sortie : « x », « y ») — un préfixe ne vaut jamais pour un autre. */
export const signerJeton = (type, id, maintenantS = Math.floor(Date.now() / 1000)) => signer(type, id, maintenantS);

// ── L'heure de Bruxelles ──────────────────────────────────────────────────
/* Le serveur tourne en UTC ; l'horaire est écrit à l'heure de Bruxelles. Les
   deux se comparent en minutes absolues (jour × 1440 + minute), heure d'été comprise. */
const FMT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit',
  day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function bruxelles(date) {
  const p = Object.fromEntries(FMT.formatToParts(date).map(x => [x.type, x.value]));
  return { jour: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) };
}
const absolu = (jour, min) => {
  const [a, m, j] = String(jour).slice(0, 10).split('-').map(Number);
  return Date.UTC(a, m - 1, j) / 60000 + min;
};
const hm = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
export const aujourdhuiBruxelles = (date = new Date()) => bruxelles(date).jour;

/** La fenêtre de scan d'une séance : { ouverte, avant, apres, ouvre, ferme } (heures « HH:MM »). */
export function fenetreSeance(seance, maintenant = new Date(), r = reglagesPresenceQr()) {
  const debut = absolu(seance.date, hm(seance.heure_debut));
  const b = bruxelles(maintenant);
  const n = absolu(b.jour, b.min);
  const fmt = m => { const x = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
  const ouvre = debut - r.avant_min, ferme = debut + r.apres_min;
  return { ouverte: n >= ouvre && n <= ferme, avant: n < ouvre, apres: n > ferme,
    ouvre: fmt(hm(seance.heure_debut) - r.avant_min), ferme: fmt(hm(seance.heure_debut) + r.apres_min) };
}

// ── Séances et étudiants attendus ─────────────────────────────────────────
export function lireSeance(id) {
  const s = db.prepare(`SELECT id, annee_scolaire, date, heure_debut, heure_fin, cours_code, ue_num,
      matiere, professeur_id, COALESCE(annule, 0) AS annule
    FROM horaire_seance WHERE id = ?`).get(Number(id));
  if (!s) return null;
  // Le cours de l'année d'abord (un même code vit sur plusieurs millésimes).
  const c = s.cours_code ? db.prepare(`SELECT cours_nom, ue_num FROM cours WHERE cours_code = ?
    ORDER BY (annee_scolaire = ?) DESC, annee_scolaire DESC LIMIT 1`).get(s.cours_code, s.annee_scolaire) : null;
  return { ...s, ue_num: s.ue_num ?? c?.ue_num ?? null, cours_nom: c?.cours_nom || null };
}

/** Les étudiants attendus à une séance : ceux du professeur de la séance pour ce
 *  cours (la liste de Mes cours), sinon tous les inscrits de l'unité. */
export function attendusDeLaSeance(s) {
  if (s.professeur_id && s.cours_code) {
    try {
      const d = etudiantsDuCours(s.professeur_id, s.cours_code, s.annee_scolaire);
      if (d) return d.etudiants;
    } catch { /* attributions illisibles : l'unité entière */ }
  }
  if (s.ue_num == null) return [];
  return db.prepare(`SELECT e.id, e.nom, e.prenom, e.id_ecampus, e.email_ecole
    FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
    WHERE i.annee_scolaire = ? AND i.ue_num = ? AND COALESCE(e.actif, 1) = 1
    GROUP BY e.id ORDER BY e.nom, e.prenom`).all(s.annee_scolaire, s.ue_num);
}

// ── Journal ───────────────────────────────────────────────────────────────
function journaliser(type, { etudiant_id = null, seance_id = null, appareil_id = null, raison = null, par = null } = {}) {
  try {
    db.prepare(`INSERT INTO presence_qr_journal (type, etudiant_id, seance_id, appareil_id, raison, par)
      VALUES (?, ?, ?, ?, ?, ?)`).run(type, etudiant_id, seance_id, appareil_id, raison, par);
  } catch (e) { console.error('[presence-qr] journal :', e.message); }
}

// ── Appareils ─────────────────────────────────────────────────────────────
const empreinte = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const sqlDate = d => d.toISOString().slice(0, 19).replace('T', ' ');

/** « iPhone · Safari » — assez pour que le secrétariat reconnaisse l'appareil, rien de plus. */
export function appareilSimple(ua) {
  const u = String(ua || '');
  const os = /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Android/.test(u) ? 'Android'
    : /Windows/.test(u) ? 'Windows' : /Mac OS X/.test(u) ? 'Mac' : /Linux/.test(u) ? 'Linux' : 'Appareil';
  const nav = /Edg\//.test(u) ? 'Edge' : /SamsungBrowser/.test(u) ? 'Samsung' : /Firefox|FxiOS/.test(u) ? 'Firefox'
    : /Chrome|CriOS/.test(u) ? 'Chrome' : /Safari/.test(u) ? 'Safari' : 'navigateur';
  return `${os} · ${nav}`;
}

/** L'appareil d'un jeton brut, s'il est valable (ni révoqué, ni expiré). */
export function appareilDe(jetonBrut, maintenant = new Date()) {
  if (!jetonBrut || String(jetonBrut).length < 20) return null;
  return db.prepare(`SELECT * FROM presence_appareil WHERE jeton_hash = ? AND revoque_le IS NULL AND expire_le > ?`)
    .get(empreinte(jetonBrut), sqlDate(maintenant)) || null;
}

/** La fin de validité d'un appairage : le 15 septembre qui suit l'année académique. */
export function finAnnee(annee) {
  const fin = Number(String(annee || '').slice(5, 9)) || (new Date().getUTCFullYear() + 1);
  return new Date(Date.UTC(fin, 8, 15, 0, 0, 0));
}

/** Révoque un appareil (secrétariat) — motif obligatoire, au journal. */
export function revoquerAppareil(id, par, motif) {
  const a = db.prepare('SELECT * FROM presence_appareil WHERE id = ?').get(Number(id));
  if (!a) return { erreur: 'introuvable', message: 'Appareil introuvable.' };
  if (a.revoque_le) return { erreur: 'deja', message: 'Cet appareil est déjà révoqué.' };
  if (String(motif || '').trim().length < 3) return { erreur: 'motif', message: 'Une révocation se motive.' };
  db.prepare("UPDATE presence_appareil SET revoque_le = datetime('now'), revoque_par = ?, revoque_motif = ? WHERE id = ?")
    .run(par, String(motif).trim(), a.id);
  journaliser('revocation', { etudiant_id: a.etudiant_id, appareil_id: a.id, raison: String(motif).trim(), par });
  return { ok: true };
}

// ── Messages ──────────────────────────────────────────────────────────────
const nomDe = e => `${String(e?.nom || '').toLocaleUpperCase('fr')} ${e?.prenom || ''}`.trim();
const libelleSeance = s => `${s.cours_nom || s.matiere || s.cours_code || 'Cours'}${s.ue_num != null ? ` (UE ${s.ue_num})` : ''}, ${String(s.heure_debut || '').slice(0, 5)}`;
const MESSAGES = {
  format: 'Ce QR code n’est pas reconnu. Scannez celui qui est projeté en classe.',
  falsifie: 'Ce QR code n’est pas valable. Scannez celui qui est projeté en classe.',
  expire: 'Ce QR code a expiré. Scannez à nouveau le QR projeté : il change toutes les quelques secondes.',
  secret: 'La présence par QR code est momentanément indisponible. Signalez-le à votre enseignant.',
  ticket: 'Le délai pour terminer est dépassé. Scannez à nouveau le QR projeté.',
};
const refus = (erreur, message, extra = {}) => ({ erreur, message, ...extra });

/** Le ticket d'un scan : vérifié, et la séance qu'il désigne. */
function seanceDuTicket(ticket, maintenant) {
  const v = verifierSigne(ticket, 't', TICKET_S, Math.floor(maintenant.getTime() / 1000));
  if (!v.ok) return refus(v.erreur === 'expire' ? 'ticket_expire' : v.erreur, v.erreur === 'expire' ? MESSAGES.ticket : MESSAGES[v.erreur]);
  const s = lireSeance(v.seanceId);
  if (!s) return refus('seance_inconnue', 'Cette séance n’existe plus dans l’horaire.');
  return { ok: true, seance: s, scanne: new Date(v.t * 1000) };
}

// ── 1. Le scan ────────────────────────────────────────────────────────────
/**
 * Un QR scanné. Rend :
 *   { ok, enregistre: true, message, deja? }       appareil reconnu, présence posée ;
 *   { ok, appairage: true, ticket, seance }        premier passage : l'adresse d'école ;
 *   { erreur, message }                            refus, toujours expliqué.
 */
export function scanner(jetonBrut, appareilBrut, maintenant = new Date()) {
  const r = reglagesPresenceQr();
  const v = verifierSigne(jetonBrut, 'q', r.validite_s, Math.floor(maintenant.getTime() / 1000));
  const app = appareilDe(appareilBrut, maintenant);
  if (!v.ok) {
    journaliser('scan_refuse', { etudiant_id: app?.etudiant_id, appareil_id: app?.id, raison: `qr ${v.erreur}` });
    return refus(v.erreur === 'expire' ? 'qr_expire' : v.erreur === 'secret' ? 'secret' : 'qr_invalide', MESSAGES[v.erreur]);
  }
  const s = lireSeance(v.seanceId);
  if (!s) return refus('seance_inconnue', 'Cette séance n’existe plus dans l’horaire.');
  if (s.annule) return refus('seance_annulee', 'Cette séance a été annulée.');
  const f = fenetreSeance(s, maintenant, r);
  if (!f.ouverte && !modeEssai()) {
    journaliser('scan_refuse', { etudiant_id: app?.etudiant_id, seance_id: s.id, appareil_id: app?.id, raison: 'hors fenêtre' });
    return refus('hors_fenetre', `La présence pour ${libelleSeance(s)} se prend entre ${f.ouvre} et ${f.ferme}.`
      + (f.apres ? ' Voyez votre enseignant : il peut la noter à la main.' : ''));
  }
  if (app) return enregistrer(s, app, maintenant);
  return { ok: true, appairage: true, ticket: signer('t', s.id, Math.floor(maintenant.getTime() / 1000)),
    seance: libelleSeance(s), domaines: r.domaines };
}

/** LE RETARD AU SCAN : scanné plus de `retard_apres_min` minutes après le début
 *  (0 = jamais marqué d'office ; le professeur peut toujours le poser à la main). */
export function enRetard(s, scanne, r = reglagesPresenceQr()) {
  if (!(r.retard_apres_min > 0)) return false;
  const b = bruxelles(scanne);
  return absolu(b.jour, b.min) > absolu(s.date, hm(s.heure_debut)) + r.retard_apres_min;
}

/** Pose la présence d'un appareil appairé — un appareil n'enregistre que SON étudiant. */
function enregistrer(s, app, maintenant, scanne = maintenant) {
  const e = db.prepare('SELECT id, nom, prenom FROM etudiant WHERE id = ?').get(app.etudiant_id);
  if (!attendusDeLaSeance(s).some(x => x.id === app.etudiant_id)) {
    journaliser('scan_refuse', { etudiant_id: app.etudiant_id, seance_id: s.id, appareil_id: app.id, raison: 'non inscrit' });
    return refus('non_inscrit', `${nomDe(e)}, vous n’êtes pas inscrit(e) à cette séance (${libelleSeance(s)}). Voyez votre enseignant.`);
  }
  db.prepare('UPDATE presence_appareil SET dernier_usage_le = ? WHERE id = ?').run(sqlDate(maintenant), app.id);
  const avant = db.prepare('SELECT statut FROM presence WHERE seance_id = ? AND etudiant_id = ?').get(s.id, app.etudiant_id);
  if (avant?.statut === 'present') {
    return { ok: true, enregistre: true, deja: true, message: `Votre présence était déjà enregistrée – ${libelleSeance(s)}.`, etudiant: nomDe(e) };
  }
  const retard = enRetard(s, scanne);
  const w = ecrirePresences([{ seance_id: s.id, etudiant_id: app.etudiant_id, statut: 'present', retard }], `${nomDe(e)} (QR)`, 'qr');
  if (w.erreur) return refus('ecriture', w.erreur);
  return { ok: true, enregistre: true, retard,
    message: `Présence enregistrée${retard ? ' (arrivée en retard)' : ''} – ${libelleSeance(s)}.`, etudiant: nomDe(e) };
}

// ── 2. Le code par courriel ───────────────────────────────────────────────
function etudiantDeLAdresse(email, r) {
  const a = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(a) || a.length > 200) return refus('adresse', 'Cette adresse n’est pas valable.');
  if (!r.domaines.includes(a.split('@')[1])) {
    return refus('domaine', `Utilisez votre adresse d’école (${r.domaines.map(d => `@${d}`).join(' ou ')}).`);
  }
  const l = db.prepare(`SELECT id, nom, prenom, email_ecole FROM etudiant
    WHERE lower(trim(email_ecole)) = ? AND COALESCE(actif, 1) = 1`).all(a);
  if (!l.length) return refus('adresse_inconnue', 'Cette adresse ne correspond à aucun étudiant inscrit dans Lucie. Adressez-vous au secrétariat.');
  if (l.length > 1) return refus('adresse_ambigue', 'Cette adresse est portée par plusieurs dossiers. Adressez-vous au secrétariat.');
  return { ok: true, etudiant: l[0], adresse: a };
}

/** Avant d'envoyer quoi que ce soit : l'appareil, l'inscription, la limite d'appairage. */
function controlerAppairage(ticket, email, appareilBrut, maintenant) {
  const r = reglagesPresenceQr();
  const t = seanceDuTicket(ticket, maintenant);
  if (!t.ok) return t;
  const x = etudiantDeLAdresse(email, r);
  if (!x.ok) return x;
  const app = appareilDe(appareilBrut, maintenant);
  if (app && app.etudiant_id !== x.etudiant.id) {
    journaliser('appairage_refuse', { etudiant_id: x.etudiant.id, seance_id: t.seance.id, appareil_id: app.id, raison: 'appareil lié à un autre étudiant' });
    return refus('appareil_autre', 'Ce téléphone est déjà lié à un autre étudiant. Un appareil ne sert qu’à une personne : adressez-vous au secrétariat.');
  }
  if (!attendusDeLaSeance(t.seance).some(e => e.id === x.etudiant.id)) {
    journaliser('scan_refuse', { etudiant_id: x.etudiant.id, seance_id: t.seance.id, raison: 'non inscrit' });
    return refus('non_inscrit', `Vous n’êtes pas inscrit(e) à cette séance (${libelleSeance(t.seance)}). Voyez votre enseignant.`);
  }
  return { ok: true, r, seance: t.seance, scanne: t.scanne, etudiant: x.etudiant, adresse: x.adresse, app };
}

/**
 * Envoie le code à six chiffres à l'adresse d'école. `envoyer({ to, subject, html, text })`
 * rend une promesse { ok } — le service de courriel de Lucie, ou un double en essai.
 */
export async function demanderCode({ ticket, email, appareilBrut, envoyer, maintenant = new Date() }) {
  const c = controlerAppairage(ticket, email, appareilBrut, maintenant);
  if (!c.ok) return c;
  const { r, etudiant } = c;
  const semaine = sqlDate(new Date(maintenant.getTime() - 7 * 86400e3));
  const deja = db.prepare('SELECT COUNT(*) n FROM presence_appareil WHERE etudiant_id = ? AND cree_le > ?').get(etudiant.id, semaine).n;
  // LE SECRÉTARIAT LÈVE LA LIMITE, UNE FOIS : une autorisation (journal en ajout
  // seul, `autoriserAppareil`) vaut pour le PROCHAIN téléphone lié — elle est
  // consommée par l'appairage qui la suit.
  const autorise = !!db.prepare(`SELECT 1 FROM presence_qr_journal WHERE type = 'autorisation' AND etudiant_id = ?
    AND id > COALESCE((SELECT MAX(id) FROM presence_qr_journal WHERE type = 'appairage' AND etudiant_id = ?), 0)`).get(etudiant.id, etudiant.id);
  // Un appareil DÉJÀ lié à cet étudiant ne compte pas : il n'appaire rien de neuf.
  if (!c.app && deja >= r.appairages_semaine && !autorise) {
    journaliser('appairage_refuse', { etudiant_id: etudiant.id, seance_id: c.seance.id, raison: 'limite hebdomadaire' });
    return refus('limite_appairage', `Vous avez déjà lié un téléphone cette semaine. Pour en changer, adressez-vous au secrétariat.`);
  }
  const heure = sqlDate(new Date(maintenant.getTime() - 3600e3));
  if (db.prepare('SELECT COUNT(*) n FROM presence_code WHERE etudiant_id = ? AND cree_le > ?').get(etudiant.id, heure).n >= CODES_PAR_HEURE) {
    return refus('trop_de_codes', 'Trop de codes demandés. Réessayez dans une heure, ou voyez votre enseignant.');
  }
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  db.transaction(() => {
    // Un nouveau code remplace le précédent : un seul code vivant à la fois.
    db.prepare("UPDATE presence_code SET utilise_le = 'remplace' WHERE etudiant_id = ? AND utilise_le IS NULL").run(etudiant.id);
    db.prepare('INSERT INTO presence_code (etudiant_id, code_hash, cree_le, expire_le) VALUES (?, ?, ?, ?)')
      .run(etudiant.id, empreinte(`${etudiant.id}:${code}`), sqlDate(maintenant), sqlDate(new Date(maintenant.getTime() + CODE_MIN * 60e3)));
  })();
  const envoi = await envoyer({
    to: c.adresse,
    subject: `Votre code Lucie : ${code}`,
    text: `Bonjour ${etudiant.prenom || ''},\n\nVotre code pour enregistrer votre présence : ${code}\nIl est valable ${CODE_MIN} minutes.\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
    html: `<p>Bonjour ${String(etudiant.prenom || '').replace(/</g, '&lt;')},</p><p>Votre code pour enregistrer votre présence :</p>`
      + `<p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>Il est valable ${CODE_MIN} minutes.</p>`
      + `<p style="color:#64748b">Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.</p>`,
  });
  if (!envoi?.ok) return refus('courriel', 'Le courriel n’a pas pu partir. Réessayez, ou voyez votre enseignant.');
  const [u, d] = c.adresse.split('@');
  return { ok: true, envoye_a: `${u.slice(0, 2)}${'•'.repeat(Math.max(1, u.length - 2))}@${d}`, minutes: CODE_MIN };
}

// ── 3. Le code saisi : l'appairage, puis la présence ──────────────────────
/** Rend { ok, appareil (jeton brut, pour le cookie), expire, ...présence } ou { erreur, message }. */
export function validerCode({ ticket, email, code, appareilBrut, userAgent, maintenant = new Date() }) {
  const c = controlerAppairage(ticket, email, appareilBrut, maintenant);
  if (!c.ok) return c;
  const { etudiant, seance } = c;
  const ligne = db.prepare('SELECT * FROM presence_code WHERE etudiant_id = ? AND utilise_le IS NULL ORDER BY id DESC LIMIT 1').get(etudiant.id);
  if (!ligne) return refus('code_absent', 'Aucun code en cours : demandez-en un nouveau.');
  if (ligne.expire_le <= sqlDate(maintenant)) return refus('code_expire', 'Ce code a expiré : demandez-en un nouveau.');
  if (ligne.essais >= CODE_ESSAIS) return refus('code_bloque', 'Trop d’essais sur ce code : demandez-en un nouveau.');
  const saisi = String(code || '').replace(/\D/g, '');
  if (saisi.length !== 6 || empreinte(`${etudiant.id}:${saisi}`) !== ligne.code_hash) {
    db.prepare('UPDATE presence_code SET essais = essais + 1 WHERE id = ?').run(ligne.id);
    const reste = CODE_ESSAIS - ligne.essais - 1;
    journaliser('code_refuse', { etudiant_id: etudiant.id, seance_id: seance.id, raison: `code erroné (${reste} essai(s) restant(s))` });
    return refus('code_errone', reste > 0 ? `Code incorrect. Il vous reste ${reste} essai(s).` : 'Code incorrect. Demandez un nouveau code.');
  }
  let appareil = c.app;
  let jetonBrut = null;
  db.transaction(() => {
    db.prepare("UPDATE presence_code SET utilise_le = datetime('now') WHERE id = ?").run(ligne.id);
    if (appareil) return;   // déjà lié à cet étudiant : rien à appairer
    // UN NOUVEL APPAIRAGE DÉSACTIVE LE PRÉCÉDENT : un étudiant, un appareil.
    for (const a of db.prepare('SELECT id FROM presence_appareil WHERE etudiant_id = ? AND revoque_le IS NULL').all(etudiant.id)) {
      db.prepare("UPDATE presence_appareil SET revoque_le = datetime('now'), revoque_par = 'nouvel appairage', revoque_motif = 'remplacé par un autre appareil' WHERE id = ?").run(a.id);
      journaliser('desactivation', { etudiant_id: etudiant.id, appareil_id: a.id, raison: 'remplacé par un nouvel appairage', par: nomDe(etudiant) });
    }
    jetonBrut = crypto.randomBytes(32).toString('base64url');
    const id = db.prepare(`INSERT INTO presence_appareil (etudiant_id, jeton_hash, appareil, annee_scolaire, cree_le, expire_le)
        VALUES (?, ?, ?, ?, ?, ?)`).run(etudiant.id, empreinte(jetonBrut), appareilSimple(userAgent), seance.annee_scolaire,
        sqlDate(maintenant), sqlDate(finAnnee(seance.annee_scolaire))).lastInsertRowid;
    appareil = db.prepare('SELECT * FROM presence_appareil WHERE id = ?').get(id);
    journaliser('appairage', { etudiant_id: etudiant.id, seance_id: seance.id, appareil_id: id, raison: appareil.appareil, par: nomDe(etudiant) });
  })();
  /* LA PRÉSENCE VAUT POUR L'INSTANT DU SCAN, pas pour celui du code : le ticket
     n'a été délivré que si le QR était valable et la fenêtre ouverte. */
  const p = enregistrer(seance, appareil, maintenant, c.scanne);
  return { ...p, appareil: jetonBrut, expire: jetonBrut ? finAnnee(seance.annee_scolaire) : null };
}

// ── Côté enseignant ───────────────────────────────────────────────────────
/** Le QR à projeter : le jeton, et quand le redemander. Marque la séance comme « projetée ». */
export function qrDeLaSeance(s, user, maintenant = new Date()) {
  const r = reglagesPresenceQr();
  if (s.annule) return refus('seance_annulee', 'Cette séance a été annulée.');
  if (s.date !== aujourdhuiBruxelles(maintenant) && !modeEssai()) return refus('pas_aujourdhui', 'Le QR ne se projette que le jour de la séance.');
  const jeton = jetonQr(s.id, Math.floor(maintenant.getTime() / 1000));
  db.prepare(`INSERT INTO presence_qr_seance (seance_id, ouvert_par_id, ouvert_par) VALUES (?, ?, ?)
    ON CONFLICT(seance_id) DO NOTHING`).run(s.id, user?.id ?? null, user?.nom || user?.email || null);
  return { ok: true, jeton, rotation_s: r.rotation_s, fenetre: fenetreSeance(s, maintenant, r), essai: modeEssai() };
}

/** « X / Y présents », et qui l'est — le compteur de l'écran projeté. */
export function compteurSeance(s) {
  const attendus = attendusDeLaSeance(s);
  const pres = new Map(db.prepare('SELECT etudiant_id, statut, source FROM presence WHERE seance_id = ?').all(s.id)
    .map(x => [x.etudiant_id, x]));
  const presents = attendus.filter(e => pres.get(e.id)?.statut === 'present');
  return { attendus: attendus.length, presents: presents.length,
    par_qr: presents.filter(e => pres.get(e.id)?.source === 'qr').length };
}

/** Les séances projetées par cet utilisateur, fenêtre fermée, où des étudiants n'ont pas de présence. */
export function seancesACompleter(userId, maintenant = new Date()) {
  const out = [];
  for (const q of db.prepare('SELECT seance_id FROM presence_qr_seance WHERE ouvert_par_id = ? AND complete_le IS NULL').all(userId)) {
    const s = lireSeance(q.seance_id);
    if (!s || s.annule) continue;
    if (!fenetreSeance(s, maintenant).apres) continue;
    const poses = new Set(db.prepare('SELECT etudiant_id FROM presence WHERE seance_id = ?').all(s.id).map(x => x.etudiant_id));
    const manquants = attendusDeLaSeance(s).filter(e => !poses.has(e.id)).map(e => ({ id: e.id, nom: e.nom, prenom: e.prenom }));
    if (!manquants.length) {
      db.prepare("UPDATE presence_qr_seance SET complete_le = datetime('now') WHERE seance_id = ?").run(s.id);
      continue;
    }
    out.push({ seance_id: s.id, cours_code: s.cours_code, annee: s.annee_scolaire, libelle: libelleSeance(s), date: s.date, manquants });
  }
  return out;
}

// ── Le suivi, côté secrétariat (lot 4) ──────────────────────────────────────
/* Ce que le secrétariat doit pouvoir faire sans ligne de commande : voir quel
 * téléphone est lié à quel étudiant, en désactiver un (motivé), lever la limite
 * d'un changement par semaine, et lire le journal. Rien ne s'efface : une
 * révocation et une autorisation s'écrivent au journal, avec leur auteur. */
export const TYPES_JOURNAL = {
  appairage: 'Téléphone lié',
  desactivation: 'Ancien téléphone désactivé (nouveau lien)',
  revocation: 'Téléphone désactivé par le secrétariat',
  autorisation: 'Nouveau téléphone autorisé par le secrétariat',
  appairage_refuse: 'Lien refusé',
  code_refuse: 'Code refusé',
  scan_refuse: 'Scan refusé',
  avis_absence: 'Avis d’absences envoyé à l’étudiant',
};
/** Le journal, pour les modules voisins (l'avis d'absences). */
export const journaliserPresenceQr = (type, detail) => journaliser(type, detail);

/** Les téléphones liés, du plus récent au plus ancien ; `q` filtre sur le nom, le matricule ou l'adresse. */
export function suiviAppareils({ q = '', tous = false } = {}, maintenant = new Date()) {
  const lignes = db.prepare(`SELECT a.id, a.etudiant_id, a.appareil, a.annee_scolaire, a.cree_le, a.expire_le, a.dernier_usage_le,
      a.revoque_le, a.revoque_par, a.revoque_motif, e.nom, e.prenom, e.id_ecampus, e.email_ecole,
      (SELECT COUNT(*) FROM presence p WHERE p.etudiant_id = a.etudiant_id AND p.source = 'qr') AS scans
    FROM presence_appareil a JOIN etudiant e ON e.id = a.etudiant_id
    ORDER BY COALESCE(a.dernier_usage_le, a.cree_le) DESC`).all();
  const maint = sqlDate(maintenant);
  const etat = a => (a.revoque_le ? 'desactive' : a.expire_le < maint ? 'expire' : 'actif');
  const n = String(q || '').trim().toLowerCase();
  return lignes.map(a => ({ ...a, etat: etat(a) }))
    .filter(a => tous || a.etat === 'actif' || (a.revoque_le && a.revoque_le > sqlDate(new Date(maintenant.getTime() - 30 * 86400e3))))
    .filter(a => !n || `${a.nom} ${a.prenom} ${a.id_ecampus || ''} ${a.email_ecole || ''}`.toLowerCase().includes(n));
}

/** Le journal, du plus récent ; `etudiant_id` et `type` le restreignent. */
export function journalSuivi({ etudiant_id = null, type = null, limite = 300 } = {}) {
  const w = []; const v = [];
  if (etudiant_id) { w.push('j.etudiant_id = ?'); v.push(Number(etudiant_id)); }
  if (type && TYPES_JOURNAL[type]) { w.push('j.type = ?'); v.push(type); }
  return db.prepare(`SELECT j.*, e.nom, e.prenom, e.id_ecampus,
      (SELECT COALESCE(s.cours_code, '') || ' · ' || s.date || ' ' || substr(s.heure_debut, 1, 5) FROM horaire_seance s WHERE s.id = j.seance_id) AS seance
    FROM presence_qr_journal j LEFT JOIN etudiant e ON e.id = j.etudiant_id
    ${w.length ? `WHERE ${w.join(' AND ')}` : ''} ORDER BY j.id DESC LIMIT ?`).all(...v, Math.min(1000, Math.max(1, Number(limite) || 300)))
    .map(x => ({ ...x, libelle: TYPES_JOURNAL[x.type] || x.type }));
}

/** Lever la limite hebdomadaire pour UN nouveau téléphone (le prochain lié). Motivé, journalisé. */
export function autoriserAppareil(etudiantId, par, motif) {
  const e = db.prepare('SELECT id FROM etudiant WHERE id = ?').get(Number(etudiantId));
  if (!e) return { erreur: 'introuvable', message: 'Étudiant introuvable.' };
  if (String(motif || '').trim().length < 3) return { erreur: 'motif', message: 'Une autorisation se motive.' };
  journaliser('autorisation', { etudiant_id: e.id, raison: String(motif).trim(), par });
  return { ok: true };
}

const NOMS_REGLAGES = { rotation_s: 'Durée d’un QR (secondes)', validite_s: 'Validité d’un QR scanné (secondes)',
  avant_min: 'Ouverture avant le cours (minutes)', apres_min: 'Fermeture après le début (minutes)',
  appairages_semaine: 'Téléphones par semaine', retard_apres_min: 'Retard au-delà de (minutes après le début, 0 = jamais)', seuil_absence_pct: 'Seuil d’absences injustifiées (%)',
  seuil_global_pct: 'Seuil de toutes les absences (%)' };

/** Écrit les réglages (bornés, domaines vérifiés) et rend ceux qui s'appliquent désormais. */
export function ecrireReglagesPresenceQr(entree = {}) {
  const v = {};
  for (const [k, [mini, maxi]] of Object.entries(BORNES)) {
    if (entree[k] === undefined || entree[k] === null || entree[k] === '') continue;
    const n = Number(entree[k]);
    if (!Number.isFinite(n) || n < mini || n > maxi) return { erreur: 'borne', message: `${NOMS_REGLAGES[k] || k} : entre ${mini} et ${maxi}.` };
    v[k] = Math.round(n);
  }
  if (entree.seuil_global_base !== undefined) {
    if (!['toutes', 'injustifiees'].includes(entree.seuil_global_base)) return { erreur: 'base', message: 'Base du seuil global : toutes les absences, ou les absences sans motif valable.' };
    v.seuil_global_base = entree.seuil_global_base;
  }
  if (entree.mention_seuil_global !== undefined) {
    const m = String(entree.mention_seuil_global || '').trim();
    if (m.length > 800) return { erreur: 'mention', message: 'La mention réglementaire tient en 800 caractères au plus.' };
    v.mention_seuil_global = m;
  }
  if (entree.domaines !== undefined) {
    const brut = Array.isArray(entree.domaines) ? entree.domaines : String(entree.domaines || '').split(/[\s,;]+/);
    const d = brut.map(x => String(x).trim().toLowerCase().replace(/^@/, '')).filter(Boolean);
    const faux = d.filter(x => !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(x));
    if (!d.length) return { erreur: 'domaines', message: 'Au moins un domaine d’adresse d’école.' };
    if (faux.length) return { erreur: 'domaines', message: `Domaine non valable : ${faux.join(', ')}.` };
    v.domaines = [...new Set(d)];
  }
  if ((v.validite_s ?? reglagesPresenceQr().validite_s) < (v.rotation_s ?? reglagesPresenceQr().rotation_s)) {
    return { erreur: 'validite', message: 'Un QR doit rester valable au moins le temps de sa rotation.' };
  }
  let lu = {};
  try { lu = JSON.parse(db.prepare("SELECT valeur FROM lucie_config WHERE cle = 'presence_qr'").get()?.valeur || '{}'); } catch { lu = {}; }
  const valeur = JSON.stringify({ ...lu, ...v });
  db.prepare(`INSERT INTO lucie_config (cle, valeur) VALUES ('presence_qr', ?)
    ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur`).run(valeur);
  return { ok: true, reglages: reglagesPresenceQr() };
}

export const BORNES_REGLAGES = BORNES;
