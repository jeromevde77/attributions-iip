// ─────────────────────────────────────────────────────────────────────────────
// secret-box.js — Chiffrement des secrets au repos (AES-256-GCM)
//
// UN SECRET TOTP EN CLAIR DANS LA BASE N'EST PAS UN SECRET. La base part
// chaque nuit vers le NAS et se télécharge depuis Configuration → Sauvegardes :
// une copie qui circule contient tout ce qu'il faut pour fabriquer les codes de
// n'importe qui. Le secret est donc chiffré par une clé qui, elle, ne vit pas
// dans la base — sans quoi on aurait rangé la clé à côté de la serrure.
//
// GCM et non CBC : il authentifie ce qu'il chiffre. Un octet modifié dans la
// colonne fait échouer le déchiffrement au lieu de rendre un secret faux avec
// lequel plus aucun code ne tomberait juste, sans qu'on sache pourquoi.
//
// Format écrit en base : « v1.<iv>.<étiquette>.<chiffré> », chaque partie en
// base64url. Le numéro de version n'est pas une politesse : le jour où l'on
// change d'algorithme, il faut pouvoir lire l'ancien.
// ─────────────────────────────────────────────────────────────────────────────
import crypto from 'crypto';

const ALGO    = 'aes-256-gcm';
const VERSION = 'v1';

/**
 * Lit MFA_KEY et rend une clé de 32 octets, ou null si elle est absente ou
 * inutilisable. Deux écritures acceptées — 64 caractères hexadécimaux, ou
 * base64 — parce qu'on ne saura plus, dans six mois, laquelle a été employée.
 */
function lireCle() {
  const brut = (process.env.MFA_KEY || '').trim();
  if (!brut) return null;
  if (/^[0-9a-fA-F]{64}$/.test(brut)) return Buffer.from(brut, 'hex');
  try {
    const b = Buffer.from(brut, 'base64');
    if (b.length === 32) return b;
  } catch { /* pas du base64 */ }
  return null;
}

/** Comment fabriquer la clé — le message d'erreur doit porter le remède. */
const REMEDE =
  "MFA_KEY doit valoir 32 octets, en hexadécimal (64 caractères) ou en base64.\n"
+ "  Fabriquer une clé :  node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"\n"
+ "  puis la déclarer dans le .env du serveur (MFA_KEY) AVANT de relancer.\n"
+ "  ELLE NE SE REGÉNÈRE PAS : changer la clé rend illisibles tous les secrets\n"
+ "  déjà enrôlés, et chacun devra reconfigurer son application.";

/**
 * Échec EXPLICITE au démarrage. Appelée par server.js : un serveur qui démarre
 * sans clé accepterait des enrôlements qu'il ne saurait pas relire, et l'on ne
 * s'en apercevrait qu'à la première connexion — c'est-à-dire trop tard.
 */
export function verifierCleMfa() {
  if (!lireCle()) {
    throw new Error(
      "MFA_KEY absente ou invalide : Lucie refuse de démarrer.\n" + REMEDE
    );
  }
}

/** La clé est-elle disponible ? (pour dire à l'écran pourquoi le MFA est gris) */
export function cleMfaPresente() { return !!lireCle(); }

function exigerCle() {
  const cle = lireCle();
  if (!cle) throw new Error('MFA_KEY absente ou invalide.\n' + REMEDE);
  return cle;
}

export function chiffrer(texte) {
  const cle = exigerCle();
  const iv  = crypto.randomBytes(12);                   // 96 bits : la taille prévue pour GCM
  const c   = crypto.createCipheriv(ALGO, cle, iv);
  const ct  = Buffer.concat([c.update(String(texte), 'utf8'), c.final()]);
  return [VERSION, iv.toString('base64url'),
          c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}

export function dechiffrer(paquet) {
  const cle = exigerCle();
  const [v, iv, tag, ct] = String(paquet || '').split('.');
  if (v !== VERSION || !iv || !tag || !ct) {
    throw new Error('Secret chiffré illisible (format inattendu).');
  }
  const d = crypto.createDecipheriv(ALGO, cle, Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}
