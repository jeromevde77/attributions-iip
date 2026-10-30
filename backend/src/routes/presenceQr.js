/**
 * LA PORTE DE L'ÉTUDIANT POUR LA PRÉSENCE PAR QR (28 octobre 2026).
 *
 * Publique : l'étudiant n'a pas de compte Lucie. Ce qui l'identifie, c'est son
 * appareil appairé (cookie httpOnly, dont la base ne garde que l'empreinte) ;
 * la première fois, un code envoyé à son adresse d'école. Tout le métier est
 * dans `lib/presenceQr.js` ; ici, seulement la porte : débit, cookie, réponses.
 */
import { Router } from 'express';
import { scanner, demanderCode, validerCode, migrerPresenceQr } from '../lib/presenceQr.js';
import { ouvrirTicket, repondreTicket, migrerTicket } from '../lib/ticketSortie.js';
import { migrerCep } from '../lib/cep.js';
import { envoyerEmail } from '../services/mailer.js';

const r = Router();
try { migrerCep(); migrerPresenceQr(); migrerTicket(); } catch (e) { console.error('[migration] présence QR :', e.message); }

const COOKIE = 'lucie_presence';

/* LE DÉBIT, EN MÉMOIRE ET POUR UN QUART D'HEURE : une porte publique se protège
   des robots sans garder d'adresse IP en base (RGPD). Un redémarrage remet les
   compteurs à zéro — les limites qui comptent (codes, essais, appairages) sont
   en base, par étudiant. */
const LIMITES = { scan: 40, code: 6, valider: 15, ticket: 40 };     // par IP et par 15 minutes
const compteurs = new Map();
function ipDe(req) {
  // Derrière Caddy puis nginx : l'adresse du visiteur est l'avant-dernière entrée.
  const p = String(req.headers['x-forwarded-for'] || '').split(',').map(x => x.trim()).filter(Boolean);
  return p.length >= 2 ? p[p.length - 2] : p[0] || req.ip || '?';
}
function limiter(quoi) {
  return (req, res, next) => {
    const cle = `${quoi}|${ipDe(req)}`;
    const t = Date.now();
    const l = (compteurs.get(cle) || []).filter(x => t - x < 15 * 60e3);
    l.push(t);
    compteurs.set(cle, l);
    if (l.length > LIMITES[quoi]) return res.status(429).json({ erreur: 'debit', error: 'Trop de tentatives. Réessayez dans un quart d’heure.' });
    next();
  };
}
setInterval(() => {
  const t = Date.now();
  for (const [k, l] of compteurs) if (!l.some(x => t - x < 15 * 60e3)) compteurs.delete(k);
}, 10 * 60e3).unref?.();

function lireCookie(req) {
  for (const morceau of String(req.headers.cookie || '').split(';')) {
    const [k, ...v] = morceau.trim().split('=');
    if (k === COOKIE) return decodeURIComponent(v.join('='));
  }
  return null;
}
function poserCookie(req, res, jeton, expire) {
  const https = req.secure || String(req.headers['x-forwarded-proto'] || '').startsWith('https');
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(jeton)}; Path=/api/presence-qr; HttpOnly; SameSite=Lax;`
    + ` Expires=${expire.toUTCString()}${https ? '; Secure' : ''}`);
}

// Un refus est une réponse 4xx qui porte son message ; `error` pour les écrans existants.
const STATUT = { qr_expire: 410, ticket_expire: 410, appareil_absent: 409, ferme: 409, vide: 400, hors_fenetre: 409, non_inscrit: 403, appareil_autre: 409,
  limite_appairage: 429, trop_de_codes: 429, secret: 503, courriel: 502 };
function repondre(res, x) {
  if (x?.erreur) return res.status(STATUT[x.erreur] || 400).json({ ...x, error: x.message });
  const { appareil, expire, ...public_ } = x;   // le jeton d'appareil ne sort que par le cookie
  return res.json(public_);
}

r.post('/scan', limiter('scan'), (req, res) => {
  try { repondre(res, scanner(req.body?.jeton, lireCookie(req))); }
  catch (e) { console.error('[presence-qr] scan :', e.message); res.status(500).json({ error: 'Erreur du serveur.' }); }
});

r.post('/code', limiter('code'), async (req, res) => {
  try {
    repondre(res, await demanderCode({ ticket: req.body?.ticket, email: req.body?.email,
      appareilBrut: lireCookie(req), envoyer: envoyerEmail }));
  } catch (e) { console.error('[presence-qr] code :', e.message); res.status(500).json({ error: 'Erreur du serveur.' }); }
});

r.post('/valider', limiter('valider'), (req, res) => {
  try {
    const x = validerCode({ ticket: req.body?.ticket, email: req.body?.email, code: req.body?.code,
      appareilBrut: lireCookie(req), userAgent: req.headers['user-agent'] });
    if (x?.appareil) poserCookie(req, res, x.appareil, x.expire);
    repondre(res, x);
  } catch (e) { console.error('[presence-qr] valider :', e.message); res.status(500).json({ error: 'Erreur du serveur.' }); }
});

/* LE TICKET DE SORTIE, CÔTÉ ÉTUDIANT : le QR projeté (« x ») ouvre les questions, la
   réponse porte la preuve du scan (« y »). Le téléphone doit être déjà lié. */
r.post('/ticket/ouvrir', limiter('ticket'), (req, res) => {
  try { repondre(res, ouvrirTicket(req.body?.jeton, lireCookie(req))); }
  catch (e) { console.error('[presence-qr] ticket :', e.message); res.status(500).json({ error: 'Erreur du serveur.' }); }
});
r.post('/ticket/repondre', limiter('ticket'), (req, res) => {
  try { repondre(res, repondreTicket(req.body?.ticket, lireCookie(req), req.body?.reponses)); }
  catch (e) { console.error('[presence-qr] ticket :', e.message); res.status(500).json({ error: 'Erreur du serveur.' }); }
});

export default r;
