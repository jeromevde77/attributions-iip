/* (CS) LES NOTIFICATIONS SUR LE TÉLÉPHONE — L'ENVOI (3.5.767, Charles, 26 novembre 2026 : « une app Lucie pour avoir les notifs
   sur iPhone » ; tranché : Lucie installée sur l'écran d'accueil, avec notifications, pour tous). Le Web Push des navigateurs
   (iPhone à partir d'iOS 16.4, une fois Lucie ajoutée à l'écran d'accueil ; Android ; ordinateur), écrit ici avec le seul module
   `crypto` de Node — aucune dépendance de plus dans l'image :
   • RFC 8292 (VAPID) : un jeton ES256 signé de la clé de Lucie, qui dit au service de notification QUI envoie ;
   • RFC 8291 (aes128gcm) : le message chiffré pour CE téléphone (sa clé p256dh et son secret d'authentification) — le service
     d'Apple ou de Google transporte un message qu'il ne peut pas lire.
   Les clés de Lucie naissent au premier usage et vivent dans `lucie_config` (« push_vapid »). */
import crypto from 'node:crypto';
import db from '../db/index.js';

const b64u = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64u = s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/** Les clés VAPID de Lucie : { public (65 octets, base64url), prive (JWK) }. Créées une fois. */
export function clesVapid() {
  try {
    const l = db.prepare("SELECT valeur FROM lucie_config WHERE cle = 'push_vapid'").get();
    if (l?.valeur) { const k = JSON.parse(l.valeur); if (k.public && k.prive) return k; }
  } catch { /* table absente : on crée */ }
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' });
  const pub = publicKey.export({ format: 'jwk' });
  const brut = Buffer.concat([Buffer.from([4]), deB64u(pub.x), deB64u(pub.y)]);
  const k = { public: b64u(brut), prive: jwk };
  db.prepare(`INSERT INTO lucie_config (cle, valeur) VALUES ('push_vapid', ?)
    ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur`).run(JSON.stringify(k));
  return k;
}

function jetonVapid(endpoint, k, sujet) {
  const aud = new URL(endpoint).origin;
  const entete = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const corps = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: sujet }));
  const cle = crypto.createPrivateKey({ key: k.prive, format: 'jwk' });
  const sig = crypto.sign('sha256', Buffer.from(`${entete}.${corps}`), { key: cle, dsaEncoding: 'ieee-p1363' });
  return `${entete}.${corps}.${b64u(sig)}`;
}

const hmac = (cle, data) => crypto.createHmac('sha256', cle).update(data).digest();

/** Chiffre `texte` pour l'abonnement { endpoint, keys: { p256dh, auth } } (RFC 8291, aes128gcm). */
function chiffrer(abonnement, texte) {
  const uaPublic = deB64u(abonnement.keys.p256dh);
  const auth = deB64u(abonnement.keys.auth);
  const ecdh = crypto.createECDH('prime256v1');
  const asPublic = ecdh.generateKeys();
  const secret = ecdh.computeSecret(uaPublic);
  const prkKey = hmac(auth, secret);
  const info = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = hmac(prkKey, Buffer.concat([info, Buffer.from([1])]));
  const sel = crypto.randomBytes(16);
  const prk = hmac(sel, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const chiffre = Buffer.concat([c.update(Buffer.concat([Buffer.from(texte, 'utf8'), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([sel, rs, Buffer.from([asPublic.length]), asPublic, chiffre]);
}

/**
 * Envoie un message (objet JSON) à un abonnement. Rend { ok, statut } ; statut 404 ou 410 = abonnement mort (téléphone
 * réinitialisé, notifications retirées) : l'appelant l'oublie.
 */
export async function envoyerPush(abonnement, message, { ttl = 86400, urgence = 'normal' } = {}) {
  const k = clesVapid();
  const corps = chiffrer(abonnement, JSON.stringify(message));
  const sujet = process.env.LUCIE_PUSH_SUJET || 'mailto:secretariat@institut-prigogine.be';
  const r = await fetch(abonnement.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${jetonVapid(abonnement.endpoint, k, sujet)}, k=${k.public}`,
      'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
      TTL: String(ttl), Urgency: urgence,
    },
    body: corps,
  });
  return { ok: r.status >= 200 && r.status < 300, statut: r.status };
}
