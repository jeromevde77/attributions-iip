/**
 * MON HORAIRE DANS MON AGENDA (Charles, 28 octobre 2026 : après le carnet de
 * cotes, « l'horaire dans l'agenda »). Un lien d'abonnement iCalendar : l'agenda
 * du téléphone (iPhone, Google, Outlook) relit l'horaire de Lucie de lui-même —
 * une séance déplacée ou annulée suit, sans application à installer.
 *
 * UN AGENDA NE SE CONNECTE PAS : il ne sait pas ouvrir une session. Le lien porte
 * donc un JETON SECRET, propre à la personne ; la base n'en garde que l'empreinte
 * (SHA-256), comme le téléphone de la présence par QR. Qui a le lien lit
 * l'horaire, et rien d'autre : ni étudiant, ni note, ni présence — des cours, des
 * heures, des locaux. Un lien perdu se remplace : l'ancien cesse aussitôt.
 *
 * Les séances : celles qui portent le professeur dans l'horaire, et celles des
 * cours qui lui sont attribués quand l'horaire de ce cours ne nomme personne — la
 * règle de Mes cours. De soixante jours en arrière à la fin de l'horaire connu.
 */
import crypto from 'crypto';
import db from '../db/index.js';
import { attributionsDe } from './etudiantsCours.js';

export function migrerAgenda(base = db) {
  base.exec(`CREATE TABLE IF NOT EXISTS agenda_lien (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    utilisateur_id INTEGER NOT NULL,
    jeton_hash TEXT NOT NULL UNIQUE,
    cree_le TEXT DEFAULT (datetime('now')),
    revoque_le TEXT,
    dernier_acces TEXT,
    acces INTEGER NOT NULL DEFAULT 0);
  CREATE INDEX IF NOT EXISTS idx_agenda_user ON agenda_lien(utilisateur_id);`);
}

const empreinte = j => crypto.createHash('sha256').update(String(j)).digest('hex');

/** Le lien en vigueur ? (on ne peut pas le relire : seule l'empreinte est gardée). */
export function lienActif(userId) {
  return db.prepare('SELECT id, cree_le, dernier_acces, acces FROM agenda_lien WHERE utilisateur_id = ? AND revoque_le IS NULL ORDER BY id DESC LIMIT 1').get(Number(userId)) || null;
}

/** Un nouveau lien : l'ancien est révoqué. Rend le jeton en clair — une seule fois. */
export function nouveauLien(userId) {
  const jeton = crypto.randomBytes(24).toString('base64url');
  db.transaction(() => {
    db.prepare("UPDATE agenda_lien SET revoque_le = datetime('now') WHERE utilisateur_id = ? AND revoque_le IS NULL").run(Number(userId));
    db.prepare('INSERT INTO agenda_lien (utilisateur_id, jeton_hash) VALUES (?, ?)').run(Number(userId), empreinte(jeton));
  })();
  return jeton;
}

export function revoquerLien(userId) {
  return db.prepare("UPDATE agenda_lien SET revoque_le = datetime('now') WHERE utilisateur_id = ? AND revoque_le IS NULL").run(Number(userId)).changes;
}

/** Le jeton d'une requête d'agenda → l'utilisateur, ou null. Compte l'accès. */
export function utilisateurDuJeton(jeton) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(String(jeton || ''))) return null;
  const l = db.prepare('SELECT id, utilisateur_id FROM agenda_lien WHERE jeton_hash = ? AND revoque_le IS NULL').get(empreinte(jeton));
  if (!l) return null;
  db.prepare("UPDATE agenda_lien SET dernier_acces = datetime('now'), acces = acces + 1 WHERE id = ?").run(l.id);
  return db.prepare('SELECT id, nom_complet, professeur_id FROM utilisateur WHERE id = ?').get(l.utilisateur_id) || null;
}

/** Les séances d'un professeur, de `depuis` à la fin de l'horaire connu. */
export function seancesDuProf(profId, depuis) {
  if (!profId) return [];
  const annees = db.prepare('SELECT DISTINCT annee_scolaire a FROM horaire_seance WHERE date >= ?').all(depuis).map(x => x.a);
  const lire = db.prepare(`SELECT s.id, s.annee_scolaire, s.date, s.heure_debut, s.heure_fin, s.cours_code, s.ue_num, s.matiere,
      s.local_texte, s.sous_groupe, s.professeur_id, COALESCE(s.annule, 0) AS annule, COALESCE(s.modifie_le, s.cree_le) AS modifie_le,
      -- SQLite ne voit pas « s » dans l'ORDER BY d'une sous-requête : l'année exacte, puis la plus récente.
      COALESCE((SELECT c.cours_nom FROM cours c WHERE c.cours_code = s.cours_code AND c.annee_scolaire = s.annee_scolaire LIMIT 1),
        (SELECT c.cours_nom FROM cours c WHERE c.cours_code = s.cours_code ORDER BY c.annee_scolaire DESC LIMIT 1)) AS cours_nom
    FROM horaire_seance s WHERE s.annee_scolaire = ? AND s.date >= ? AND (s.professeur_id = ? OR s.cours_code = ?)`);
  const vus = new Map();
  for (const annee of annees) {
    for (const s of lire.all(annee, depuis, profId, '\u0000')) vus.set(s.id, s);
    for (const code of new Set(attributionsDe(profId, annee).map(a => a.code_cours))) {
      const toutes = lire.all(annee, depuis, -1, code);
      // L'horaire de ce cours ne nomme personne : toutes ses séances (règle de Mes cours).
      if (!toutes.some(x => x.professeur_id)) for (const s of toutes) vus.set(s.id, s);
    }
  }
  return [...vus.values()].sort((a, b) => `${a.date} ${a.heure_debut}`.localeCompare(`${b.date} ${b.heure_debut}`));
}

// ── L'écriture iCalendar (RFC 5545) ─────────────────────────────────────────
const echap = v => String(v ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
/** Une ligne de plus de 75 octets se plie : CRLF puis une espace. */
function plier(ligne) {
  const b = Buffer.from(ligne, 'utf8');
  if (b.length <= 75) return ligne;
  const out = []; let i = 0, max = 75;
  while (i < b.length) {
    let fin = Math.min(b.length, i + max);
    while (fin < b.length && (b[fin] & 0xc0) === 0x80) fin--;   // ne pas couper un caractère
    out.push(b.slice(i, fin).toString('utf8')); i = fin; max = 74;
  }
  return out.join('\r\n ');
}
const hhmm = t => String(t || '00:00').slice(0, 5).replace(':', '') + '00';
const quand = (date, heure) => `${String(date).slice(0, 10).replace(/-/g, '')}T${hhmm(heure)}`;
const utc = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

// Le fuseau de l'horaire : Bruxelles, heure d'été comprise.
const VTIMEZONE = ['BEGIN:VTIMEZONE', 'TZID:Europe/Brussels',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'END:VTIMEZONE'];

export function icsDesSeances(seances, { nom = 'Lucie — mon horaire', domaine = 'lucie-iip.be', maintenant = new Date() } = {}) {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Institut Ilya Prigogine//Lucie//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${echap(nom)}`, 'X-WR-TIMEZONE:Europe/Brussels', 'REFRESH-INTERVAL;VALUE=DURATION:PT4H', 'X-PUBLISHED-TTL:PT4H', ...VTIMEZONE];
  for (const s of seances) {
    const titre = `${s.cours_code || ''}${s.cours_nom ? ` · ${s.cours_nom}` : s.matiere ? ` · ${s.matiere}` : ''}`.trim() || 'Cours';
    const details = [s.ue_num != null ? `UE ${s.ue_num}` : null, s.matiere && s.cours_nom ? s.matiere : null,
      s.sous_groupe ? `sous-groupe ${s.sous_groupe}` : null, 'Horaire de Lucie — ce qui fait foi est l’horaire de l’école.'].filter(Boolean).join('\n');
    const modif = s.modifie_le ? new Date(String(s.modifie_le).replace(' ', 'T') + 'Z') : null;
    L.push('BEGIN:VEVENT', `UID:seance-${s.id}@${domaine}`, `DTSTAMP:${utc(maintenant)}`,
      ...(modif && !isNaN(modif) ? [`LAST-MODIFIED:${utc(modif)}`] : []),
      `DTSTART;TZID=Europe/Brussels:${quand(s.date, s.heure_debut)}`, `DTEND;TZID=Europe/Brussels:${quand(s.date, s.heure_fin || s.heure_debut)}`,
      `SUMMARY:${echap((s.annule ? 'Annulé — ' : '') + titre)}`,
      ...(s.local_texte ? [`LOCATION:${echap(s.local_texte)}`] : []),
      `DESCRIPTION:${echap(details)}`,
      `STATUS:${s.annule ? 'CANCELLED' : 'CONFIRMED'}`, 'TRANSP:OPAQUE', 'END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(plier).join('\r\n') + '\r\n';
}
