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
 *   { mode: 'smtp'|'graph', host, port, securite, user, pass, from,
 *     graph: { tenant, client_id, client_secret, expediteur } }
 *
 * Deux façons d'expédier :
 *  - 'smtp'  : n'importe quel serveur SMTP (nodemailer).
 *  - 'graph' : Microsoft 365 par l'API Graph, avec une application Entra
 *              (OAuth « client credentials »). C'est la voie que Microsoft
 *              impose : l'authentification SMTP par mot de passe est bloquée
 *              par les security defaults et retirée fin 2026.
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
    mode: cfg.mode === 'graph' ? 'graph' : 'smtp',
    graph: {
      tenant:        (cfg.graph?.tenant        ?? '').trim(),
      client_id:     (cfg.graph?.client_id     ?? '').trim(),
      client_secret:  cfg.graph?.client_secret ?? '',
      expediteur:    (cfg.graph?.expediteur    ?? '').trim(),
    },
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
    mode: patch.mode === 'graph' ? 'graph' : patch.mode === 'smtp' ? 'smtp' : actuel.mode,
    graph: {
      tenant:    String(patch.graph?.tenant    ?? actuel.graph.tenant).trim(),
      client_id: String(patch.graph?.client_id ?? actuel.graph.client_id).trim(),
      client_secret: patch.graph?.client_secret ? String(patch.graph.client_secret) : actuel.graph.client_secret,
      expediteur: String(patch.graph?.expediteur ?? actuel.graph.expediteur).trim(),
    },
  };
  jetonGraph = null;
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

// ── Microsoft Graph ─────────────────────────────────────────────────────────
let jetonGraph = null;   // { valeur, expire, cle }

function graphComplet(g) {
  return !!(g.tenant && g.client_id && g.client_secret && g.expediteur);
}

/** Jeton d'application (client credentials), mis en cache jusqu'à expiration. */
async function obtenirJetonGraph(g) {
  const cle = `${g.tenant}|${g.client_id}|${g.client_secret}`;
  if (jetonGraph && jetonGraph.cle === cle && Date.now() < jetonGraph.expire - 60000) {
    return jetonGraph.valeur;
  }
  const corps = new URLSearchParams({
    client_id: g.client_id, client_secret: g.client_secret,
    scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials',
  });
  const rep = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(g.tenant)}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: corps, signal: AbortSignal.timeout(15000),
  });
  const j = await rep.json().catch(() => ({}));
  if (!rep.ok || !j.access_token) {
    // Le message Entra traîne un Trace ID et un horodatage : on garde l'explication.
    const msg = String(j.error_description || j.error || '').split(/\s+Trace ID/)[0].split('\n')[0];
    throw new Error(msg || `jeton refusé (${rep.status})`);
  }
  jetonGraph = { valeur: j.access_token, expire: Date.now() + (j.expires_in || 3600) * 1000, cle };
  return j.access_token;
}

/** Envoi par POST /users/{expéditeur}/sendMail. */
async function envoyerParGraph(g, { to, subject, html, attachments }) {
  const jeton = await obtenirJetonGraph(g);
  const dests = (Array.isArray(to) ? to : String(to).split(',')).map(s => s.trim()).filter(Boolean);
  const message = {
    subject,
    body: { contentType: 'HTML', content: html },
    toRecipients: dests.map(a => ({ emailAddress: { address: a } })),
    attachments: (attachments || []).map(a => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: a.filename,
      contentType: a.contentType || 'application/octet-stream',
      contentBytes: Buffer.from(a.content).toString('base64'),
    })),
  };
  const rep = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(g.expediteur)}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, saveToSentItems: true }),
    signal: AbortSignal.timeout(60000),
  });
  if (rep.status === 202) return;
  const j = await rep.json().catch(() => ({}));
  throw new Error(j.error?.message || `Graph a répondu ${rep.status}`);
}

/**
 * Vérifie la configuration fournie (non enregistrée).
 * SMTP : connexion + authentification. Graph : obtention d'un jeton, puis
 * lecture de la boîte expéditrice — ce qui prouve que l'application a le droit
 * de la voir, sans rien envoyer.
 */
export async function verifierSmtp(cfgEssai = {}) {
  const base = lireConfigSmtp();
  const mode = cfgEssai.mode || base.mode;
  if (mode === 'graph') {
    const g = { ...base.graph, ...(cfgEssai.graph || {}) };
    if (!cfgEssai.graph?.client_secret) g.client_secret = base.graph.client_secret;
    if (!graphComplet(g)) return { ok: false, erreur: 'tenant, application, secret et expéditeur sont requis' };
    try {
      jetonGraph = null;
      const jeton = await obtenirJetonGraph(g);
      const rep = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(g.expediteur)}?$select=mail`, {
        headers: { Authorization: `Bearer ${jeton}` }, signal: AbortSignal.timeout(15000),
      });
      if (rep.ok) return { ok: true };
      // Mail.Send seul ne permet pas de lire l'utilisateur : le jeton est
      // valable, le reste se vérifie par le courriel d'essai.
      if (rep.status === 403) return { ok: true, remarque: "Jeton obtenu ; l'accès à la boîte se confirmera par le courriel d'essai." };
      const j = await rep.json().catch(() => ({}));
      return { ok: false, erreur: j.error?.message || `Graph a répondu ${rep.status}` };
    } catch (e) {
      return { ok: false, erreur: e.message };
    }
  }
  const cfg = { ...base, ...cfgEssai, pass: cfgEssai?.pass ? cfgEssai.pass : base.pass };
  if (!cfg.host) return { ok: false, erreur: 'serveur non renseigné' };
  try {
    await construire(cfg).verify();
    return { ok: true };
  } catch (e) {
    return { ok: false, erreur: e.message };
  }
}

/** Un expéditeur est-il configuré ? Sinon, les envois sont simulés (console). */
export function mailerConfigure() {
  const cfg = lireConfigSmtp();
  return cfg.mode === 'graph' ? graphComplet(cfg.graph) : !!cfg.host;
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
  const cfg = lireConfigSmtp();
  const dest = Array.isArray(to) ? to.join(', ') : to;
  if (cfg.mode === 'graph' && graphComplet(cfg.graph)) {
    try {
      await envoyerParGraph(cfg.graph, { to, subject, html, attachments });
      console.log(`[MAILER/graph] Email envoyé à ${dest}`);
      return { ok: true, simule: false };
    } catch (e) {
      console.error('[MAILER/graph] Erreur envoi:', e.message);
      return { ok: false, simule: false, erreur: e.message };
    }
  }
  const t = cfg.mode === 'graph' ? null : getTransporter();
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
