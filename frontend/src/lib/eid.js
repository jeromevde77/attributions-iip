// ─────────────────────────────────────────────────────────────────────────────
// Lecture OPTIONNELLE de la carte d'identité belge (eID) via l'app locale
// « eID Reader » qui expose une API HTTPS sur https://localhost:9140.
//
// ⚠️ L'app eID Reader doit être lancée séparément par l'utilisateur (icône dans
//    la barre système). Elle sert en HTTPS avec un certificat AUTO-SIGNÉ ; au
//    premier usage le certificat doit être approuvé (ajout au Keychain macOS,
//    ou menu tray « Approuver le certificat » côté Safari). Tant qu'il n'est pas
//    approuvé, le navigateur rejette l'appel TLS → ces helpers renvoient « non
//    joignable » et l'UI invite à approuver / lancer l'app. La saisie manuelle
//    reste toujours possible.
//
// ⚠️ CORS / origine : l'eID Reader autorise localhost, 127.0.0.1, file:// et
//    https://server.domobel.be. Une origine = scheme + host + PORT : le dev est
//    servi sur https://server.domobel.be:10801 (port 10801), donc cette origine
//    avec son port doit figurer dans l'allowlist de l'eID Reader, sinon le
//    navigateur bloque l'appel même quand le service tourne.
// ─────────────────────────────────────────────────────────────────────────────

const EID_BASE = 'https://localhost:9140';

/** Interroge l'état du service. Renvoie l'objet JSON, ou null si injoignable. */
export async function eidStatus() {
  try {
    const r = await fetch(`${EID_BASE}/status`, { cache: 'no-store' });
    return await r.json(); // { ok, state, ... }
  } catch {
    return null; // service non lancé / origine bloquée
  }
}

/** Lit identité + adresse. Renvoie { ok:true, data } ou { ok:false, code, message }. */
export async function eidReadAll() {
  try {
    const r = await fetch(`${EID_BASE}/all`, { cache: 'no-store' });
    const j = await r.json();
    if (!j?.ok) return { ok: false, code: j?.code || 'READ_ERROR', message: j?.message || 'Erreur de lecture' };
    return { ok: true, data: j.data };
  } catch {
    return { ok: false, code: 'UNREACHABLE', message: 'Service eID non joignable' };
  }
}

// ── Helpers de conversion eID → champs de la fiche ───────────────────────────

const _norm = (s) => (s || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // retire les accents (AOÛT → AOUT)
  .replace(/\./g, '').trim().toUpperCase();

// Abréviations de mois rencontrées sur l'eID belge (FR / NL / EN confondus)
const MOIS = {
  JAN: '01', JANV: '01',
  FEV: '02', FEVR: '02', FEB: '02',
  MAR: '03', MARS: '03', MAA: '03', MRT: '03', MAART: '03',
  AVR: '04', AVRIL: '04', APR: '04',
  MAI: '05', MEI: '05', MAY: '05',
  JUIN: '06', JUN: '06',
  JUIL: '07', JUILL: '07', JUL: '07',
  AOU: '08', AOUT: '08', AUG: '08',
  SEP: '09', SEPT: '09',
  OCT: '10', OKT: '10',
  NOV: '11',
  DEC: '12',
};

/**
 * Convertit une date eID en ISO (YYYY-MM-DD) pour un <input type="date">.
 * Gère « 22 SEPT 1977 » (abréviations FR/NL/EN), « 22.04.2017 », « 22/04/2017 »
 * et une date déjà ISO. Renvoie '' si non interprétable (l'utilisateur complète).
 */
export function eidDateToISO(s) {
  if (!s) return '';
  const t = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t; // déjà ISO
  let m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/); // 22.04.2017 / 22/04/2017
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})\s+(\S+)\s+(\d{4})$/); // 22 SEPT 1977
  if (m) {
    const k = _norm(m[2]);
    const mois = MOIS[k] || MOIS[k.slice(0, 4)] || MOIS[k.slice(0, 3)];
    if (mois) return `${m[3]}-${mois}-${m[1].padStart(2, '0')}`;
  }
  return '';
}

/** Formate le numéro national belge (11 chiffres) en YY.MM.DD-NNN.CC. */
export function formatNiss(n) {
  const d = String(n || '').replace(/\D/g, '');
  if (d.length !== 11) return String(n || '').trim();
  return `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4, 6)}-${d.slice(6, 9)}.${d.slice(9, 11)}`;
}

/**
 * Mappe le payload eID ({ identity, address }) vers un sous-ensemble des champs
 * de la fiche prof. Ne renvoie QUE les champs réellement fournis par la carte ;
 * les autres champs du formulaire restent inchangés.
 */
export function eidToProf(data) {
  const id = data?.identity || {};
  const ad = data?.address || {};
  const out = {};
  if (id.lastName) out.nom = id.lastName.trim();
  if (id.firstName) out.prenom = id.firstName.trim();
  if (id.sex) {
    const s = id.sex.trim().toUpperCase();
    if (s === 'M' || s === 'F') out.sexe = s;
  }
  if (id.nationalNumber) out.niss = formatNiss(id.nationalNumber);
  if (id.nationality) out.nationalite = id.nationality.trim();
  const dn = eidDateToISO(id.birthDate);
  if (dn) out.date_naissance = dn;
  if (id.birthLocation) out.lieu_naissance_ville = id.birthLocation.trim();
  if (ad.streetAndNumber) out.adresse_rue = ad.streetAndNumber.trim();
  if (ad.zip) out.code_postal = String(ad.zip).trim();
  if (ad.municipality) out.commune = ad.municipality.trim();
  if (data?.photo) out.photo = data.photo; // data-URI JPEG base64
  return out;
}

/** Libellés lisibles des champs pré-remplis (pour le message de confirmation). */
export function eidChamps(mapped) {
  const labels = {
    nom: 'Nom', prenom: 'Prénom', sexe: 'Sexe', niss: 'NISS',
    nationalite: 'Nationalité', date_naissance: 'Date de naissance',
    lieu_naissance_ville: 'Lieu de naissance', adresse_rue: 'Adresse',
    code_postal: 'Code postal', commune: 'Localité', photo: 'Photo',
  };
  return Object.keys(mapped).map((k) => labels[k] || k);
}
