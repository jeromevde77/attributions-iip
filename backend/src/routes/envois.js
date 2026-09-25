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
import { preparerPourCourriel } from '../lib/courrielPiece.js';
import { getParam } from './parametres.js';
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
 * QUI PEUT ENVOYER. Une impression se jette ; un courriel parti ne revient
 * pas. Le secrétariat, la direction adjointe et la direction — ceux qui
 * expédient déjà le courrier de l'établissement —, plus l'administrateur
 * technique, qui ne s'exclut d'aucune route.
 */
const PEUT_ENVOYER = ['admin', 'directeur', 'directeur_adjoint', 'secretariat'];

/**
 * LE MOT D'ACCOMPAGNEMENT — UN SEUL, POUR TOUTES LES PIÈCES.
 *
 * Un texte par type de document serait une bibliothèque à tenir à jour, et
 * surtout : la phrase d'une notification de refus ne s'écrit pas à la légère.
 * Le courriel ne redit donc pas ce que la pièce contient — il annonce qu'elle
 * est jointe. Ce qui fait foi est le document, pas le message qui l'apporte.
 * Il reste modifiable avant chaque envoi.
 */
export const MESSAGE_ACCOMPAGNEMENT =
  'Madame, Monsieur,\n\n'
  + "Vous trouverez le document vous concernant, émis par l'Institut Ilya Prigogine.\n\n"
  + 'Ce courriel est envoyé automatiquement : merci de ne pas y répondre. '
  + "Pour toute question, adressez-vous au secrétariat de l'établissement.\n\n"
  + 'Cordialement,';

/* LE MOT D'ACCOMPAGNEMENT ET SA SIGNATURE SE RÈGLENT À L'ÉCRAN (Charles, 25
 * septembre 2026 : « où puis-je changer le texte ? Je souhaiterais signer :
 * Le service administratif »). Ils étaient écrits dans le code : les changer
 * demandait un déploiement. Configuration → Paramètres, groupe « Envois ».
 * La SIGNATURE du courriel n'efface pas QUI a envoyé : le registre des envois
 * garde le nom de la personne connectée. */
try {
  const ins = db.prepare('INSERT OR IGNORE INTO parametre (cle, valeur, label, groupe) VALUES (?,?,?,?)');
  ins.run('envoi_message', MESSAGE_ACCOMPAGNEMENT, "Envois — texte d'accompagnement du courriel", 'envois');
  ins.run('envoi_signature', 'Le service administratif',
    'Envois — signature du courriel (vide : le nom de la personne qui envoie)', 'envois');
} catch (e) { console.error('[migration] paramètres des envois :', e.message); }

const messageAccompagnement = () => getParam('envoi_message', MESSAGE_ACCOMPAGNEMENT) || MESSAGE_ACCOMPAGNEMENT;
const signatureCourriel = (qui) => (getParam('envoi_signature', '') || '').trim() || qui;

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
  res.json({ actif, smtp: mailerConfigure(), pdf: pdf.disponible, pdf_raison: pdf.raison,
             redirection: lireConfigSmtp().redirection || null,
             // Le mot d'accompagnement vient du serveur : un second exemplaire
             // dans l'écran finirait par ne plus dire la même chose.
             message_defaut: messageAccompagnement(),
             // L'écran cache le bouton à qui n'a pas le droit ; la route le
             // refuse quand même — un bouton caché n'est pas une protection.
             peut_envoyer: PEUT_ENVOYER.includes(req.user?.role) });
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
/**
 * À QUI CETTE PIÈCE S'ENVOIE — ET CE N'EST PAS UN CHOIX.
 *
 * Une attestation part à l'étudiant qu'elle nomme ; un procès-verbal, à ceux
 * qui composaient le Conseil. Laisser l'écran choisir, c'est rouvrir la porte
 * à l'erreur que la règle referme : on sélectionne un étudiant, on produit la
 * pièce d'un autre, et personne ne s'en aperçoit avant la réclamation.
 *
 * L'écran affiche donc une liste DÉJÀ CALCULÉE, où l'on peut retirer quelqu'un
 * — jamais en ajouter un que la pièce ne concerne pas.
 *
 * GET /api/envois/destinataires?regle=etudiant|professeur|conseil
 *      &ids=1,2,3            (pour etudiant / professeur)
 *      &ue=95&annee=2025-2026 (pour conseil)
 */
r.get('/destinataires', authRequired, actifRequis, async (req, res) => {
  const regle = String(req.query.regle || '');
  const ids = String(req.query.ids || '').split(',').map(Number).filter(Boolean);

  // L'ADRESSE DE L'ÉCOLE, ET ELLE SEULE. Une pièce de l'institution part à
  // l'adresse de l'institution : l'adresse privée n'est pas un repli, c'est
  // une autre destination. Sans adresse d'école, la pièce ne part pas — et on
  // le dit, plutôt que de la faire disparaître d'une liste.
  if (regle === 'etudiant') {
    if (!ids.length) return res.json([]);
    const marks = ids.map(() => '?').join(',');
    return res.json(db.prepare(`SELECT id, nom, prenom, email_ecole
      FROM etudiant WHERE id IN (${marks})`).all(...ids)
      .map(e => ({
        type: 'etudiant', id: e.id,
        nom: `${e.nom} ${e.prenom || ''}`.trim(),
        email: (e.email_ecole || '').trim() || null,
        motif: 'destinataire de la pièce',
        manque: (e.email_ecole || '').trim() ? null : "pas d'adresse école",
      })));
  }

  if (regle === 'professeur') {
    if (!ids.length) return res.json([]);
    const marks = ids.map(() => '?').join(',');
    return res.json(db.prepare(`SELECT id, nom, prenom, adresse_mail
      FROM professeur WHERE id IN (${marks})`).all(...ids)
      .map(p => ({
        type: 'professeur', id: p.id,
        nom: `${p.nom} ${p.prenom || ''}`.trim(),
        email: (p.adresse_mail || '').trim() || null,
        motif: 'destinataire de la pièce',
        manque: (p.adresse_mail || '').trim() ? null : "pas d'adresse d'institut",
      })));
  }

  if (regle === 'conseil') {
    const ueNum = Number(req.query.ue);
    const annee = req.query.annee;
    if (!ueNum || !annee) return res.status(400).json({ error: 'ue et annee requises' });

    // TOUTE LA COMPOSITION, présents ET absents : un membre empêché doit
    // connaître ce qui a été décidé, même s'il ne le signe pas.
    const { membresDuConseil } = await import('./acquis.js');
    const membres = membresDuConseil(ueNum, annee);

    const liste = [];
    for (const m of membres) {
      if (m.cle?.startsWith('prof:')) {
        const p = db.prepare('SELECT id, nom, prenom, adresse_mail FROM professeur WHERE id = ?')
          .get(Number(m.cle.slice(5)));
        liste.push({ type: 'professeur', id: p?.id || null, nom: m.nom,
          email: (p?.adresse_mail || '').trim() || null,
          motif: m.qualite || 'membre du Conseil',
          manque: (p?.adresse_mail || '').trim() ? null : "pas d'adresse d'institut" });
      } else {
        // La coordination et la direction sont des utilisateurs de Lucie : on
        // les retrouve par leur nom, faute d'identifiant dans la composition.
        const u = db.prepare(`SELECT id, email, nom_complet FROM utilisateur
          WHERE actif = 1 AND UPPER(REPLACE(nom_complet,' ','')) = UPPER(REPLACE(?,' ',''))`)
          .get(m.nom || '');
        liste.push({ type: 'utilisateur', id: u?.id || null, nom: m.nom,
          email: (u?.email || '').trim() || null,
          motif: m.qualite || 'membre du Conseil',
          manque: (u?.email || '').trim() ? null : 'aucun compte Lucie à ce nom' });
      }
    }

    // La boîte de service : elle reçoit toutes les pièces du Conseil.
    const service = lireConfigSmtp().service_examens;
    if (service) {
      liste.push({ type: 'service', id: null, nom: 'Secrétariat des examens',
        email: service, motif: 'boîte de service', manque: null });
    }

    // LA DIRECTION ADJOINTE, PAR RÔLE ET NON PAR SON NOM : le jour où ce n'est
    // plus la même personne, la règle tient toujours. La direction, elle, ne
    // figure pas ici — elle reçoit le procès-verbal parce qu'elle est membre
    // du Conseil, pas parce qu'elle est la direction.
    for (const u of db.prepare(`SELECT id, email, nom_complet FROM utilisateur
      WHERE actif = 1 AND role = 'directeur_adjoint'`).all()) {
      if (liste.some(x => x.email && x.email === u.email)) continue;
      liste.push({ type: 'utilisateur', id: u.id, nom: u.nom_complet || 'Direction adjointe',
        email: (u.email || '').trim() || null, motif: 'direction adjointe',
        manque: (u.email || '').trim() ? null : 'aucune adresse enregistrée' });
    }
    return res.json(liste);
  }

  res.status(400).json({ error: 'règle de destination inconnue' });
});

r.get('/adresses', authRequired, actifRequis, (req, res) => {
  const { type, ids } = req.query;
  const liste = String(ids || '').split(',').map(Number).filter(Boolean);
  if (!liste.length) return res.json([]);
  const marks = liste.map(() => '?').join(',');

  if (type === 'etudiant') {
    const rows = db.prepare(`
      SELECT id, nom, prenom, email_ecole FROM etudiant WHERE id IN (${marks})
    `).all(...liste);
    // ADRESSE ÉCOLE UNIQUEMENT. L'adresse privée existe en base pour d'autres
    // usages ; elle n'est pas un repli quand l'école manque, c'est une autre
    // destination. La proposer ici ferait partir une pièce officielle sur une
    // boîte personnelle sans que personne n'ait décidé de le faire.
    return res.json(rows.map(e => ({
      id: e.id, nom: e.nom, prenom: e.prenom,
      adresses: [e.email_ecole && { email: e.email_ecole, libelle: 'école' }].filter(Boolean),
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
r.post('/', authRequired, roleRequired(...PEUT_ENVOYER), actifRequis, async (req, res) => {
  const { sujet, message, type_doc, pieces, mode } = req.body || {};
  if (!sujet?.trim()) return res.status(400).json({ error: 'sujet requis' });
  if (!Array.isArray(pieces) || !pieces.length) {
    return res.status(400).json({ error: 'aucune pièce à envoyer' });
  }
  if (pieces.length > 200) {
    return res.status(400).json({ error: 'au plus 200 envois par lot' });
  }
  /* DEUX FAÇONS DE PARTIR (Jérôme, 29 septembre 2026) : la pièce jointe PDF,
     ou LE DOCUMENT DANS LE CORPS DU COURRIEL — mis en page, léger, sans
     Chromium. Le corps n'exige donc pas la capacité PDF : c'est même son
     intérêt sur un serveur qui ne sait pas en produire. */
  const enCorps = mode === 'corps';
  if (!enCorps) {
    const cap = await capacitePdf();
    if (!cap.disponible) {
      return res.status(503).json({
        error: "Ce serveur ne sait pas produire de PDF : choisissez l'envoi "
             + 'dans le corps du courriel, ou installez le rendu PDF.', detail: cap.raison,
      });
    }
  }

  ensureTable();
  const lot = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const par = req.user?.nom || req.user?.email || null;
  // Le courriel est signé par le service ; le registre, lui, garde `par`.
  const signe = signatureCourriel(par);
  const corpsHtml = corpsCourriel(message, signe);
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
    if (enCorps) {
      // Le bloc de signature se reconstruit pour la messagerie : sans cela,
      // ni le sceau ni la signature ne s'affichent (lib/courrielPiece.js).
      const { html: docCourriel, pieces } = preparerPourCourriel(p.html);
      const emailHtml = corpsAvecDocument(message, signe, docCourriel);
      const envoi = await envoyerEmail({ to: email, subject: sujet, html: emailHtml,
        attachments: pieces.length ? pieces : undefined });
      const statut = !envoi.ok ? 'echec' : envoi.simule ? 'simule' : 'envoye';
      const redir = lireConfigSmtp().redirection;
      const note = envoi.erreur || (redir ? `redirigé vers ${redir}` : null);
      resultats.push({ ...base, statut, erreur: envoi.erreur || null, redirige: redir || null });
      journal.run(lot, type_doc || null, base.destinataire_type, base.destinataire_id,
        base.nom, email, sujet, null, Buffer.byteLength(emailHtml), statut, note, par);
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
    const redir = lireConfigSmtp().redirection;
    const note = envoi.erreur || (redir ? `redirigé vers ${redir}` : null);
    resultats.push({ ...base, statut, erreur: envoi.erreur || null, redirige: redir || null, nom_fichier: fichier });
    journal.run(lot, type_doc || null, base.destinataire_type, base.destinataire_id,
      base.nom, email, sujet, fichier, pdf.length, statut, note, par);
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

/**
 * EN CORPS DE COURRIEL : le document lui-même, précédé du mot
 * d'accompagnement. Le HTML du document part tel quel, ses styles avec lui —
 * c'est la mise en page de la pièce, sans pièce jointe.
 */
function corpsAvecDocument(message, signataire, htmlDoc) {
  const esc = s2 => String(s2 ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const texte = /<[a-z][\s\S]*>/i.test(message || '')
    ? message
    : esc(message || '').replace(/\n/g, '<br>');
  const mot = texte.trim()
    ? `<div style="font-family:Arial,sans-serif;color:#222;max-width:760px;margin:0 auto 16px;`
      + `padding:14px 20px;line-height:1.6;border-bottom:2px solid #1B2B4B">`
      + texte
      + (signataire ? `<p style="margin-top:14px;color:#475569">${esc(signataire)}</p>` : '')
      + '</div>'
    : '';
  const doc = String(htmlDoc || '');
  const i = doc.search(/<body[^>]*>/i);
  if (i >= 0) {
    const fin = doc.indexOf('>', i) + 1;
    return doc.slice(0, fin) + mot + doc.slice(fin);
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${mot}${doc}</body></html>`;
}

export default r;
