// ─────────────────────────────────────────────────────────────────────────────
// totp.js — Codes à usage unique fondés sur le temps (RFC 6238)
//
// Écrit avec le module `crypto` de Node, sans dépendance : l'algorithme tient
// en trente lignes — un HMAC-SHA1 sur le numéro de pas, tronqué à six chiffres —
// et une dépendance de plus sur le chemin de la CONNEXION est une dépendance
// qu'il faudra suivre, auditer et mettre à jour pour toujours.
//
// SHA-1, 6 chiffres, pas de 30 secondes : ce ne sont pas des choix, c'est ce
// que lisent Google Authenticator, Microsoft Authenticator, Aegis et les
// gestionnaires de mots de passe. Un autre réglage marche en théorie et
// échoue chez l'utilisateur, ce qui est la pire des deux issues.
//
// DEUX GARDE-FOUS qui ne sont pas dans la RFC et sans lesquels le dispositif
// ne vaudrait pas grand-chose :
//   · la comparaison est à TEMPS CONSTANT — comparer deux chaînes avec `===`
//     s'arrête au premier caractère faux et laisse mesurer où l'on s'est
//     trompé ;
//   · le pas accepté est RENDU à l'appelant, qui doit refuser tout pas déjà
//     employé (`utilisateur.totp_dernier_pas`). Sans cela, un code capturé
//     reste valable trente secondes de plus — c'est-à-dire assez.
// ─────────────────────────────────────────────────────────────────────────────
import crypto from 'crypto';

export const PAS_SECONDES = 30;
export const NB_CHIFFRES  = 6;
const ALPHABET_B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';   // RFC 4648

// ── Base32 ───────────────────────────────────────────────────────────────────
// Les applications d'authentification ne lisent que cela, et l'utilisateur doit
// pouvoir le recopier à la main quand la caméra refuse le QR.

export function versBase32(buf) {
  let bits = 0, valeur = 0, sortie = '';
  for (const octet of buf) {
    valeur = (valeur << 8) | octet; bits += 8;
    while (bits >= 5) { sortie += ALPHABET_B32[(valeur >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) sortie += ALPHABET_B32[(valeur << (5 - bits)) & 31];
  return sortie;                                   // sans '=' : personne n'en veut
}

export function depuisBase32(s) {
  const propre = String(s || '').toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');
  let bits = 0, valeur = 0;
  const octets = [];
  for (const c of propre) {
    const i = ALPHABET_B32.indexOf(c);
    if (i < 0) throw new Error('Secret base32 invalide.');
    valeur = (valeur << 5) | i; bits += 5;
    if (bits >= 8) { octets.push((valeur >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(octets);
}

/**
 * Un secret neuf. 20 octets = 160 bits, la taille que la RFC 4226 recommande
 * pour HMAC-SHA1 ; en base32 cela fait 32 caractères, recopiables.
 */
export function genererSecret(octets = 20) {
  return versBase32(crypto.randomBytes(octets));
}

// ── Le code lui-même ─────────────────────────────────────────────────────────

/** Numéro de pas pour un instant donné (défaut : maintenant). */
export function pasCourant(dateMs = Date.now()) {
  return Math.floor(dateMs / 1000 / PAS_SECONDES);
}

/** Le code à six chiffres attendu pour ce secret à ce pas. */
export function codeTotp(secretBase32, pas) {
  const compteur = Buffer.alloc(8);
  // Le compteur est un entier 64 bits gros-boutiste. Écrit en deux moitiés
  // parce que `writeUInt32BE` ne dépasse pas 32 bits — et un décalage de bits
  // en JavaScript retomberait silencieusement sur 32 bits, donc sur un code
  // faux à partir de 2038.
  compteur.writeUInt32BE(Math.floor(pas / 2 ** 32), 0);
  compteur.writeUInt32BE(pas >>> 0, 4);

  const hmac = crypto.createHmac('sha1', depuisBase32(secretBase32)).update(compteur).digest();
  const d    = hmac[hmac.length - 1] & 0x0f;                       // troncature dynamique
  const bin  = ((hmac[d] & 0x7f) << 24) | (hmac[d + 1] << 16) | (hmac[d + 2] << 8) | hmac[d + 3];
  return String(bin % 10 ** NB_CHIFFRES).padStart(NB_CHIFFRES, '0');
}

/** Comparaison à temps constant de deux codes de même forme. */
function memeCode(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

/**
 * Vérifie un code saisi.
 *
 * @param {string} secretBase32
 * @param {string} saisi           — les six chiffres, espaces tolérés
 * @param {object} opts
 *        · tolerance   nombre de pas acceptés de part et d'autre (défaut 1,
 *                      soit ±30 s : de quoi absorber une horloge de téléphone
 *                      qui dérive, sans ouvrir une minute et demie) ;
 *        · dernierPas  dernier pas déjà consommé par ce compte — tout pas
 *                      inférieur ou égal est REFUSÉ (anti-rejeu) ;
 *        · dateMs      l'instant, pour les essais.
 * @returns {{ ok: boolean, pas: number|null, raison: string|null }}
 *          `pas` est le pas à écrire dans totp_dernier_pas. L'appelant DOIT
 *          l'enregistrer : la fonction ne touche pas à la base, elle ne sait
 *          rien d'elle.
 */
export function verifierTotp(secretBase32, saisi, {
  tolerance = 1, dernierPas = null, dateMs = Date.now(),
} = {}) {
  const code = String(saisi || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) return { ok: false, pas: null, raison: 'format' };

  const ici = pasCourant(dateMs);
  for (let ecart = -tolerance; ecart <= tolerance; ecart++) {
    const pas = ici + ecart;
    if (!memeCode(code, codeTotp(secretBase32, pas))) continue;
    // Le code est juste — mais a-t-il déjà servi ? Un code réutilisé est soit
    // un double-clic, soit quelqu'un qui rejoue ce qu'il a intercepté. On ne
    // sait pas lequel, donc on refuse les deux.
    if (dernierPas != null && pas <= Number(dernierPas)) {
      return { ok: false, pas: null, raison: 'deja_utilise' };
    }
    return { ok: true, pas, raison: null };
  }
  return { ok: false, pas: null, raison: 'invalide' };
}

/**
 * L'URI que lit le QR code. L'émetteur est répété dans le chemin ET dans le
 * paramètre `issuer` : les applications anciennes ne lisent que le premier, les
 * récentes que le second, et celle qui n'en lit aucun range le compte sous un
 * nom qui ne dit rien le jour où l'on en a trois.
 *
 * SURTOUT PAS `URLSearchParams` ICI, ET C'EST TOUT LE PROPOS DE CE COMMENTAIRE.
 *
 * Il encode l'espace en « + », convention des FORMULAIRES HTML et non des URI.
 * Le chemin portait donc « Lucie%20IIP » et le paramètre « Lucie+IIP » : deux
 * noms pour un seul émetteur. Les applications indulgentes — Google, Microsoft —
 * devinent et acceptent ; celles qui appliquent la spécification REFUSENT, car
 * elle demande de rejeter l'URI quand le préfixe du label et `issuer` ne
 * concordent pas. Le trousseau d'Apple refusait ainsi un QR que les autres
 * lisaient, ce qui est la pire des pannes : elle ne se voit que chez certains.
 *
 * `encodeURIComponent` produit « %20 ». Les deux écritures concordent enfin.
 */
export function uriOtpauth({ secret, compte, emetteur = 'Lucie IIP' }) {
  const e = encodeURIComponent(emetteur);
  const c = encodeURIComponent(compte);
  const parametres = [
    `secret=${encodeURIComponent(secret)}`,
    `issuer=${e}`,
    `algorithm=SHA1`,
    `digits=${NB_CHIFFRES}`,
    `period=${PAS_SECONDES}`,
  ].join('&');
  return `otpauth://totp/${e}:${c}?${parametres}`;
}
