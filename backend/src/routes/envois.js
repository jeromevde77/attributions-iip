/**
 * envois.js — Envoi d'un document généré à l'intéressé, par courriel.
 *
 * Le principe est celui du centre d'impression : cette route ne COMPOSE
 * aucun document. L'écran lui remet le HTML produit par la route du document
 * (attestation, fiche d'attributions, décision de recours…), elle le rend en
 * PDF, le joint au courriel et consigne l'envoi. Un document continue donc
 * d'avoir une seule adresse de production.
 *
 * Chaque pièce va à UNE personne : pas de copie collective, pas de Cci. Le
 * destinataire reçoit son document, et lui seul.
 */
import express from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';
import { capacitePdf, rendrePdf } from '../services/pdf.js';
import { envoyerEmail, mailerConfigure, lireConfigSmtp, ecrireConfigSmtp, verifierSmtp } from '../services/mailer.js';

const r = express.Router();

function ensureTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS envoi_mail (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      lot                TEXT,
      type_doc           TEXT,
      destinataire_type  TEXT,
      destinataire_id    INTEGER,
      destinataire_nom   TEXT,
      email              TEXT NOT NULL,
      sujet              TEXT NOT NULL,
      nom_fichier        TEXT,
      taille             INTEGER,
      statut             TEXT NOT NULL,
      erreur             TEXT,
      envoye_par         TEXT,
      envoye_le          TEXT DEFAULT (datetime('now'))
    );
  `);
}

const ADRESSE_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * L'interrupteur : Configuration → Courriels, clé `envoi_mail_actif` de
 * lucie_config. ÉTEINT par défaut : sur un serveur où personne ne l'a allumé
 * (la prod, par exemple), les boutons n'apparaissent pas et la route refuse.
 */
export function envoiActif() {
  try {
    const row = db.prepare("SELECT valeur FROM lucie_config WHERE cle = 'envoi_mail_actif'").get();
    return row?.valeur === '1';
  } catch { return false; }
}
function actifRequis(req, res, next) {
  if (!envoiActif()) {
    return res.status(403).json({
      error: "L'envoi de documents par courriel est désactivé (Configuration → Courriels).",
    });
  }
  next();
}

// ── État du service : l'écran cache la fonction ou prévient des simulations ──
r.get('/etat', authRequired, async (req, res) => {
  const actif = envoiActif();
  // Éteint, on ne lance pas Chromium pour rien.
  const pdf = actif ? await capacitePdf() : { disponible: false, raison: null };
  res.json({ actif, smtp: mailerConfigure(), pdf: pdf.disponible, pdf_raison: pdf.raison });
});

// ── Réglages (admin) : interrupteur et serveur SMTP ─────────────────────────
r.put('/actif', authRequired, roleRequired('admin'), (req, res) => {
  const v = req.body?.actif ? '1' : '0';
  db.prepare(`INSERT OR REPLACE INTO lucie_config (cle, valeur, description)
              VALUES ('envoi_mail_actif', ?, 'Envoi de documents par courriel')`).run(v);
  res.json({ actif: v === '1' });
});

// Le mot de passe ne SORT jamais : on dit seulement s'il est défini.
function sansSecrets({ pass, graph, ...cfg }) {
  const { client_secret, ...g } = graph || {};
  return { ...cfg, pass_defini: !!pass, graph: { ...g, secret_defini: !!client_secret } };
}
r.get('/smtp', authRequired, roleRequired('admin'), (req, res) => {
  res.json(sansSecrets(lireConfigSmtp()));
});
r.put('/smtp', authRequired, roleRequired('admin'), (req, res) => {
  res.json(sansSecrets(ecrireConfigSmtp(req.body || {})));
});

// Vérifie la connexion avec ce qui est à l'écran, sans l'enregistrer.
r.post('/smtp/verifier', authRequired, roleRequired('admin'), async (req, res) => {
  res.json(await verifierSmtp(req.body || {}));
});

// Envoie un courriel d'essai avec la configuration ENREGISTRÉE.
r.post('/smtp/test', authRequired, roleRequired('admin'), async (req, res) => {
  const to = String(req.body?.to || req.user?.email || '').trim();
  if (!ADRESSE_RE.test(to)) return res.status(400).json({ error: 'adresse invalide' });
  if (!mailerConfigure()) return res.status(400).json({ error: 'aucun serveur SMTP enregistré' });
  const r2 = await envoyerEmail({
    to, subject: '[Lucie] Courriel d\'essai',
    html: corpsCourriel('Ceci est un courriel d\'essai envoyé depuis Lucie. Si vous le lisez, le serveur SMTP est correctement configuré.', req.user?.nom),
  });
  res.json(r2);
});

/**
 * Les adresses connues pour des personnes.
 *   ?type=etudiant|professeur&ids=1,2,3
 * On renvoie TOUTES les adresses (école et privée) : l'écran laisse choisir,
 * c'est l'utilisateur qui sait laquelle est lue.
 */
r.get('/adresses', authRequired, actifRequis, (req, res) => {
  const { type, ids } = req.query;
  const liste = String(ids || '').split(',').map(Number).filter(Boolean);
  if (!liste.length) return res.json([]);
  const marks = liste.map(() => '?').join(',');

  if (type === 'etudiant') {
    const rows = db.prepare(`
      SELECT id, nom, prenom, email_ecole, email_perso FROM etudiant WHERE id IN (${marks})
    `).all(...liste);
    return res.json(rows.map(e => ({
      id: e.id, nom: e.nom, prenom: e.prenom,
      adresses: [
        e.email_ecole && { email: e.email_ecole, libelle: 'école' },
        e.email_perso && { email: e.email_perso, libelle: 'privée' },
      ].filter(Boolean),
    })));
  }
  if (type === 'professeur') {
    const rows = db.prepare(`
      SELECT id, nom, prenom, adresse_mail, mail_prive FROM professeur WHERE id IN (${marks})
    `).all(...liste);
    return res.json(rows.map(p => ({
      id: p.id, nom: p.nom, prenom: p.prenom,
      adresses: [
        p.adresse_mail && { email: p.adresse_mail, libelle: 'institut' },
        p.mail_prive && { email: p.mail_prive, libelle: 'privée' },
      ].filter(Boolean),
    })));
  }
  res.status(400).json({ error: 'type inconnu' });
});

/**
 * L'envoi.
 * body : {
 *   sujet, message (texte ou HTML simple), type_doc,
 *   pieces: [{ destinataire_type, destinataire_id, nom, email, html, nom_fichier }]
 * }
 * Réponse : un résultat par pièce, jamais un échec global — dix envois dont
 * un rate doivent rendre neuf « envoyé » et un « échec » nommé.
 */
r.post('/', authRequired, actifRequis, async (req, res) => {
  const { sujet, message, type_doc, pieces } = req.body || {};
  if (!sujet?.trim()) return res.status(400).json({ error: 'sujet requis' });
  if (!Array.isArray(pieces) || !pieces.length) {
    return res.status(400).json({ error: 'aucune pièce à envoyer' });
  }
  if (pieces.length > 200) {
    return res.status(400).json({ error: 'au plus 200 envois par lot' });
  }
  const cap = await capacitePdf();
  if (!cap.disponible) {
    return res.status(503).json({
      error: "Ce serveur ne sait pas produire de PDF : l'envoi par courriel "
           + 'exige une pièce jointe PDF.', detail: cap.raison,
    });
  }

  ensureTable();
  const lot = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const par = req.user?.nom || req.user?.email || null;
  const corpsHtml = corpsCourriel(message, par);
  const journal = db.prepare(`
    INSERT INTO envoi_mail (lot, type_doc, destinataire_type, destinataire_id,
      destinataire_nom, email, sujet, nom_fichier, taille, statut, erreur, envoye_par)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  const resultats = [];
  for (const p of pieces) {
    const email = String(p.email || '').trim();
    const base = {
      destinataire_type: p.destinataire_type || null,
      destinataire_id: p.destinataire_id || null,
      nom: p.nom || email,
      email,
    };
    if (!ADRESSE_RE.test(email)) {
      resultats.push({ ...base, statut: 'echec', erreur: 'adresse invalide' });
      journal.run(lot, type_doc || null, base.destinataire_type, base.destinataire_id,
        base.nom, email || '(vide)', sujet, null, null, 'echec', 'adresse invalide', par);
      continue;
    }
    if (!p.html) {
      resultats.push({ ...base, statut: 'echec', erreur: 'document absent' });
      journal.run(lot, type_doc || null, base.destinataire_type, base.destinataire_id,
        base.nom, email, sujet, null, null, 'echec', 'document absent', par);
      continue;
    }
    let pdf;
    try {
      pdf = await rendrePdf(p.html, { pagination: 'si-plusieurs' });
    } catch (e) {
      const err = `rendu PDF : ${String(e.message).slice(0, 200)}`;
      resultats.push({ ...base, statut: 'echec', erreur: err });
      journal.run(lot, type_doc || null, base.destinataire_type, base.destinataire_id,
        base.nom, email, sujet, null, null, 'echec', err, par);
      continue;
    }
    const fichier = String(p.nom_fichier || 'document')
      .replace(/\.(html?|pdf)$/i, '').replace(/[^A-Za-z0-9_.-]/g, '_') + '.pdf';
    const envoi = await envoyerEmail({
      to: email, subject: sujet, html: corpsHtml,
      attachments: [{ filename: fichier, content: pdf, contentType: 'application/pdf' }],
    });
    const statut = !envoi.ok ? 'echec' : envoi.simule ? 'simule' : 'envoye';
    resultats.push({ ...base, statut, erreur: envoi.erreur || null, nom_fichier: fichier });
    journal.run(lot, type_doc || null, base.destinataire_type, base.destinataire_id,
      base.nom, email, sujet, fichier, pdf.length, statut, envoi.erreur || null, par);
  }

  res.json({
    lot,
    total: resultats.length,
    envoyes: resultats.filter(x => x.statut === 'envoye').length,
    simules: resultats.filter(x => x.statut === 'simule').length,
    echecs: resultats.filter(x => x.statut === 'echec').length,
    resultats,
  });
});

// ── Le journal : qui a reçu quoi, quand, et si c'est parti ──────────────────
r.get('/journal', authRequired, (req, res) => {
  ensureTable();
  const { type_doc, destinataire_type, destinataire_id, limite } = req.query;
  const clauses = ['1=1']; const params = [];
  if (type_doc) { clauses.push('type_doc = ?'); params.push(type_doc); }
  if (destinataire_type) { clauses.push('destinataire_type = ?'); params.push(destinataire_type); }
  if (destinataire_id) { clauses.push('destinataire_id = ?'); params.push(Number(destinataire_id)); }
  const n = Math.min(500, Number(limite) || 100);
  res.json(db.prepare(`
    SELECT id, lot, type_doc, destinataire_type, destinataire_id, destinataire_nom,
           email, sujet, nom_fichier, taille, statut, erreur, envoye_par, envoye_le
    FROM envoi_mail WHERE ${clauses.join(' AND ')}
    ORDER BY envoye_le DESC, id DESC LIMIT ${n}
  `).all(...params));
});

/** Le corps du courriel : le message de l'expéditeur, dans l'enveloppe Lucie. */
function corpsCourriel(message, signataire) {
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Un message tapé au clavier : on garde les retours à la ligne.
  const texte = /<[a-z][\s\S]*>/i.test(message || '')
    ? message
    : esc(message || 'Veuillez trouver ci-joint votre document.').replace(/\n/g, '<br>');
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;color:#222;max-width:640px;margin:0 auto;padding:20px">
  <div style="background:#1B2B4B;color:white;padding:14px 20px;border-radius:8px 8px 0 0">
    <strong>Institut Ilya Prigogine</strong>
  </div>
  <div style="border:1px solid #e2e8f0;border-top:none;padding:20px;border-radius:0 0 8px 8px;line-height:1.6">
    ${texte}
    ${signataire ? `<p style="margin-top:20px;color:#475569">${esc(signataire)}</p>` : ''}
  </div>
  <p style="color:#94A3B8;font-size:11px;text-align:center;margin-top:12px">
    Le document est joint à ce courriel au format PDF.
  </p>
</body></html>`;
}

export default r;
