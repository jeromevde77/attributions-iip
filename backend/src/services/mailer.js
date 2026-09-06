/**
 * mailer.js — Service d'envoi d'e-mail pour Lucie
 * Configuration en base (Configuration → Courriels), variables d'environnement
 * SMTP_* en repli. Sans serveur renseigné, les e-mails sont loggués en console.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const nodemailer = require('nodemailer');

import db from '../db/index.js';

/**
 * La configuration SMTP vit en base (lucie_config, clé `smtp_config`, JSON)
 * et se règle depuis Configuration → Courriels. Les variables d'environnement
 * ne servent plus que de repli si rien n'est enregistré.
 *   { host, port, secure, user, pass, from }
 */
export function lireConfigSmtp() {
  let cfg = {};
  try {
    const row = db.prepare("SELECT valeur FROM lucie_config WHERE cle = 'smtp_config'").get();
    if (row?.valeur) cfg = JSON.parse(row.valeur) || {};
  } catch { cfg = {}; }
  const port = parseInt(cfg.port || process.env.SMTP_PORT || '587');
  return {
    host:   (cfg.host   ?? process.env.SMTP_HOST ?? '').trim(),
    port,
    // 'ssl' = TLS implicite (465) ; 'starttls' = clair puis STARTTLS (587) ; 'aucun'
    securite: cfg.securite || (port === 465 ? 'ssl' : 'starttls'),
    user:   (cfg.user   ?? process.env.SMTP_USER ?? '').trim(),
    pass:    cfg.pass   ?? process.env.SMTP_PASS ?? '',
    from:   (cfg.from   ?? process.env.SMTP_FROM ?? '').trim() || 'Lucie IIP <lucie@institut-prigogine.be>',
    // Certificat auto-signé toléré ? Faux par défaut : un relais légitime a un vrai certificat.
    tolerer_certificat: !!cfg.tolerer_certificat,
  };
}

/** Enregistre la configuration ; un mot de passe absent est conservé. */
export function ecrireConfigSmtp(patch) {
  const actuel = lireConfigSmtp();
  const cfg = {
    host: String(patch.host ?? actuel.host).trim(),
    port: parseInt(patch.port ?? actuel.port) || 587,
    securite: ['ssl', 'starttls', 'aucun'].includes(patch.securite) ? patch.securite : actuel.securite,
    user: String(patch.user ?? actuel.user).trim(),
    pass: patch.pass != null && patch.pass !== '' ? String(patch.pass) : actuel.pass,
    from: String(patch.from ?? actuel.from).trim(),
    tolerer_certificat: patch.tolerer_certificat != null ? !!patch.tolerer_certificat : actuel.tolerer_certificat,
  };
  db.prepare(`INSERT OR REPLACE INTO lucie_config (cle, valeur, description)
              VALUES ('smtp_config', ?, 'Serveur SMTP pour l''envoi de courriels')`)
    .run(JSON.stringify(cfg));
  transporter = null; transporterCle = null;
  return cfg;
}

let transporter = null;
let transporterCle = null;

function construire(cfg) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.securite === 'ssl',
    ignoreTLS: cfg.securite === 'aucun',
    requireTLS: cfg.securite === 'starttls',
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    tls: { rejectUnauthorized: !cfg.tolerer_certificat },
    // Un serveur injoignable doit répondre « injoignable », pas faire attendre
    // l'écran indéfiniment.
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 60000,
  });
}

function getTransporter() {
  const cfg = lireConfigSmtp();
  if (!cfg.host) return null;             // rien de configuré : mode simulation
  const cle = JSON.stringify(cfg);
  if (transporter && transporterCle === cle) return transporter;
  transporter = construire(cfg);
  transporterCle = cle;
  return transporter;
}

/** Vérifie la connexion au serveur avec la configuration fournie (non enregistrée). */
export async function verifierSmtp(cfgEssai) {
  const base = lireConfigSmtp();
  const cfg = { ...base, ...cfgEssai, pass: cfgEssai?.pass ? cfgEssai.pass : base.pass };
  if (!cfg.host) return { ok: false, erreur: 'serveur non renseigné' };
  try {
    await construire(cfg).verify();
    return { ok: true };
  } catch (e) {
    return { ok: false, erreur: e.message };
  }
}

/** Le SMTP est-il configuré ? Sinon, les envois sont simulés (console). */
export function mailerConfigure() {
  return !!lireConfigSmtp().host;
}

/**
 * Envoie un e-mail.
 * @param {{ to: string|string[], subject: string, html: string, text?: string,
 *           attachments?: Array<{ filename: string, content: Buffer, contentType?: string }> }} opts
 * @returns {Promise<{ ok: boolean, simule: boolean, erreur?: string }>}
 *   L'échec est RENVOYÉ, pas seulement loggué : un envoi de document officiel
 *   doit pouvoir dire à l'utilisateur qu'il n'est pas parti.
 */
export async function envoyerEmail({ to, subject, html, text, attachments }) {
  const t = getTransporter();
  const dest = Array.isArray(to) ? to.join(', ') : to;
  if (!t) {
    console.log(`[MAILER DEV] À: ${dest}`);
    console.log(`[MAILER DEV] Sujet: ${subject}`);
    console.log(`[MAILER DEV] ${text || '(html uniquement)'}`);
    if (attachments?.length) {
      console.log(`[MAILER DEV] Pièces jointes: ${attachments.map(a => `${a.filename} (${a.content?.length || 0} o)`).join(', ')}`);
    }
    return { ok: true, simule: true };
  }
  try {
    await t.sendMail({
      from: lireConfigSmtp().from,
      to: dest,
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, ''),
      attachments: attachments || [],
    });
    console.log(`[MAILER] Email envoyé à ${dest}`);
    return { ok: true, simule: false };
  } catch (e) {
    console.error('[MAILER] Erreur envoi:', e.message);
    return { ok: false, simule: false, erreur: e.message };
  }
}

/**
 * Template HTML de base pour les notifications Lucie.
 */
export function templateNotif({ titre, corps, lien, lienTexte = 'Voir dans Lucie' }) {
  const BASE_URL = process.env.LUCIE_URL || 'https://server.domobel.be:10800';
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;color:#222;max-width:600px;margin:0 auto;padding:20px">
  <div style="background:#1B2B4B;color:white;padding:16px 20px;border-radius:8px 8px 0 0">
    <img src="${BASE_URL}/favicon.svg" style="height:20px;vertical-align:middle;margin-right:8px" alt="Lucie">
    <strong>Lucie — Institut Ilya Prigogine</strong>
  </div>
  <div style="border:1px solid #e2e8f0;border-top:none;padding:20px;border-radius:0 0 8px 8px">
    <h2 style="color:#1B2B4B;margin-top:0">${titre}</h2>
    <div style="line-height:1.6">${corps}</div>
    ${lien ? `<p><a href="${BASE_URL}${lien}" style="display:inline-block;background:#00AACC;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold">${lienTexte}</a></p>` : ''}
  </div>
  <p style="color:#94A3B8;font-size:11px;text-align:center;margin-top:12px">Lucie · Institut Ilya Prigogine · Bruxelles</p>
</body></html>`;
}
