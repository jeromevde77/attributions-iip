/**
 * mailer.js — Service d'envoi d'e-mail pour Lucie
 * Configuration via variables d'environnement :
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 * Si SMTP_HOST n'est pas défini, les e-mails sont loggués en console (dev).
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || 'Lucie IIP <lucie@institut-prigogine.be>';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!SMTP_HOST) {
    // Mode dev : log console uniquement
    return null;
  }
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    tls: { rejectUnauthorized: false },
  });
  return transporter;
}

/**
 * Envoie un e-mail.
 * @param {{ to: string|string[], subject: string, html: string, text?: string }} opts
 */
export async function envoyerEmail({ to, subject, html, text }) {
  const t = getTransporter();
  if (!t) {
    console.log(`[MAILER DEV] À: ${Array.isArray(to) ? to.join(', ') : to}`);
    console.log(`[MAILER DEV] Sujet: ${subject}`);
    console.log(`[MAILER DEV] ${text || '(html uniquement)'}`);
    return;
  }
  try {
    await t.sendMail({
      from: SMTP_FROM,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, ''),
    });
    console.log(`[MAILER] Email envoyé à ${Array.isArray(to) ? to.join(', ') : to}`);
  } catch (e) {
    console.error('[MAILER] Erreur envoi:', e.message);
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
