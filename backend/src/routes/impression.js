/**
 * impression.js — Centre d'impression.
 *
 * Point d'entrée unique de tous les documents. Il lit le catalogue, sélectionne
 * les destinataires, appelle la production existante et rend soit un document
 * unique, soit une archive de pièces séparées, soit un PDF là où le serveur
 * sait en produire.
 *
 * Le centre n'écrit AUCUN document lui-même : il délègue aux routes qui les
 * produisaient déjà. Une correction de mise en page continue donc de se faire
 * à un seul endroit, celui du document.
 */
import express from 'express';
import db from '../db/index.js';
import { authRequired, getUserSections } from '../middleware/auth.js';
import { documentsPour, documentParCle, valeursParametre } from '../lib/documents.js';
import { capacitePdf, rendrePdf, rendrePdfs } from '../services/pdf.js';
import { piedGabaritPdf, BANDE_PIED_MM } from '../lib/document.js';
import { LOGO_IIP_JPEG } from '../services/assets/logo_iip_jpeg.js';
import { piedDocument } from './parametres.js';
import { protegerSignature } from '../lib/protectionSignature.js';

const r = express.Router();

// ── Ce que le centre sait produire ──────────────────────────────────────────
r.get('/catalogue', authRequired, async (req, res) => {
  const pdf = await capacitePdf();
  res.json({ documents: documentsPour(req.user), pdf: pdf.disponible });
});

// ── Les valeurs proposées pour un paramètre ─────────────────────────────────
r.get('/valeurs/:parametre', authRequired, (req, res) => {
  try {
    const perim = getUserSections(req.user);
    let valeurs = valeursParametre(req.params.parametre, req.query);
    // Le périmètre s'applique aussi aux listes proposées : une coordination
    // ne doit pas même voir les sections qui ne sont pas les siennes.
    if (req.params.parametre === 'section' && perim) {
      valeurs = valeurs.filter(v => perim.includes(v.valeur));
    }
    res.json(valeurs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Les destinataires d'un document, selon les filtres.
 *
 * On renvoie de quoi les afficher ET de quoi nommer les fichiers : c'est la
 * même requête, autant ne pas la refaire au moment de produire.
 */
r.get('/destinataires', authRequired, (req, res) => {
  const { document, annee, section, ue, ues } = req.query;
  const doc = documentParCle(document);
  if (!doc) return res.status(400).json({ error: 'document inconnu' });

  const perim = getUserSections(req.user);

  if (doc.portee === 'etudiant') {
    if (!annee) return res.status(400).json({ error: 'année requise' });

    // Une pièce d'aménagement ne concerne que les étudiants qui ont un dossier
    // cette année : les proposer tous inviterait à produire des pièces vides.
    if (doc.cle.startsWith('amenagement_')) {
      const lignes = db.prepare(`SELECT d.id AS dossier_id, e.id AS etudiant_id, e.nom, e.prenom,
          d.annee_scolaire FROM amenagement_dossier d JOIN etudiant e ON e.id = d.etudiant_id
        WHERE d.annee_scolaire = ? ORDER BY e.nom, e.prenom`).all(annee);
      return res.json({ destinataires: lignes, total: lignes.length,
                        personnes: lignes.length, maille: 'etudiant' });
    }

    // Pour l'attestation, la maille est le couple étudiant × unité réussie ;
    // pour les autres, c'est l'étudiant.
    const parUE = doc.cle === 'attestation_reussite' || doc.cle === 'motivation_decision';
    // La motivation ne concerne QUE les unités en échec ; l'attestation, que
    // les réussites. Les confondre délivrerait une attestation de réussite à un
    // étudiant refusé — ce qui engagerait l'établissement.
    const enEchec = doc.cle === 'motivation_decision';

    const clauses = ['i.annee_scolaire = ?'];
    const params = [annee];
    if (parUE) {
      clauses.push(enEchec ? "i.resultat IN ('refuse','ajourne')" : "i.resultat = 'reussi'");
    }
    // Plusieurs unités possibles : « ues » l'emporte, « ue » reste accepté
    // pour ne pas casser les appels existants.
    const listeUe = (ues || ue || '').split(',').map(Number).filter(Boolean);
    if (listeUe.length) {
      clauses.push(`i.ue_num IN (${listeUe.map(() => '?').join(',')})`);
      params.push(...listeUe);
    }

    const lignes = db.prepare(`
      SELECT DISTINCT e.id AS etudiant_id, e.nom, e.prenom,
             ${parUE ? 'i.ue_num,' : ''} i.annee_scolaire,
             -- La section DU DOSSIER (30 septembre 2026) : celle de l'étudiant
             -- quand l'UE est rattachée à sa section déclarée (lib/sectionDossier.js).
             (CASE WHEN e.section_rattachement IS NOT NULL AND EXISTS (SELECT 1 FROM ue_section us
                     WHERE us.ue_num = i.ue_num AND us.section_code = e.section_rattachement)
                   THEN e.section_rattachement
                   ELSE (SELECT u.section FROM ue u WHERE u.ue_num = i.ue_num
               AND u.section IS NOT NULL
               ORDER BY u.annee_scolaire DESC LIMIT 1) END) AS section
      FROM etudiant_inscription i
      JOIN etudiant e ON e.id = i.etudiant_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY e.nom, e.prenom${parUE ? ', i.ue_num' : ''}
    `).all(...params);

    const retenus = lignes.filter(l => {
      if (perim && l.section && !perim.includes(l.section)) return false;
      if (section && l.section !== section) return false;
      return true;
    });

    // Sans la maille UE, un étudiant apparaîtrait une fois par inscription.
    const vus = new Set();
    const uniques = parUE ? retenus : retenus.filter(l => {
      if (vus.has(l.etudiant_id)) return false;
      vus.add(l.etudiant_id); return true;
    });

    return res.json({
      destinataires: uniques,
      total: uniques.length,
      personnes: new Set(uniques.map(l => l.etudiant_id)).size,
      maille: parUE ? 'etudiant_ue' : 'etudiant',
    });
  }

  if (doc.portee === 'professeur') {
    const profs = db.prepare(`
      SELECT id AS professeur_id, nom, prenom FROM professeur ORDER BY nom, prenom
    `).all();
    return res.json({ destinataires: profs, total: profs.length,
                      personnes: profs.length, maille: 'professeur' });
  }

  res.status(400).json({ error: `portée « ${doc.portee} » non gérée` });
});

/* LES PIÈCES SÉPARÉES, EN UNE ARCHIVE (29 septembre 2026 : « l'impression par
   unité est terriblement lente »). L'écran demandait les PDF un par un, puis
   les téléchargeait un par un, une pause entre chaque : soixante attestations,
   des minutes, et un navigateur qui bloque les téléchargements en rafale. Une
   seule requête, les pièces rendues en parallèle, une seule archive. Les
   options de chaque pièce sont celles de /pdf — même pied, même marge. */
function optionsPiece({ pagination, pied = true, orientation, page_css } = {}) {
  const pageCss = !!page_css && !pied;
  return {
    pagination: pageCss ? 'jamais' : (pagination || 'si-plusieurs'),
    pied: pied ? (avecNum => piedGabaritPdf(LOGO_IIP_JPEG, piedDocument(), avecNum)) : null,
    orientation: orientation === 'paysage' ? 'paysage' : 'portrait',
    pageCss,
    ...(pied ? { marges: { top: '12mm', right: '15mm', bottom: `${BANDE_PIED_MM}mm`, left: '15mm' } } : {}),
  };
}
r.post('/pdfs', authRequired, async (req, res) => {
  const cap = await capacitePdf();
  if (!cap.disponible) return res.status(503).json({ error: 'Ce serveur ne sait pas produire de PDF.', capacite_absente: 'pdf', detail: cap.raison });
  const docs = Array.isArray(req.body?.documents) ? req.body.documents.filter(d => d?.html) : [];
  if (!docs.length) return res.status(400).json({ error: 'documents requis' });
  if (docs.length > 400) return res.status(413).json({ error: 'Plus de 400 pièces : scindez la sélection.' });
  try {
    const signes = [];
    for (const d of docs) signes.push((await protegerSignature(d.html, { piece: d.nom || d.titre || 'Document', destinataire: d.destinataire?.nom || d.etudiant || null })).htmlSigne);
    const pdfs = await rendrePdfs(docs.map((d, i) => ({ html: signes[i], ...optionsPiece(d) })));
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const vus = new Map();
    docs.forEach((d, i) => {
      let nom = String(d.nom || `piece_${i + 1}`).replace(/[^A-Za-z0-9_.-]/g, '_');
      const n = (vus.get(nom) || 0) + 1; vus.set(nom, n);
      if (n > 1) nom += `_${n}`;                       // deux pièces du même nom ne s'écrasent pas
      zip.file(`${nom}.pdf`, pdfs[i]);
    });
    const out = await zip.generateAsync({ type: 'nodebuffer' });
    const fichier = String(req.body?.nom || 'pieces').replace(/[^A-Za-z0-9_.-]/g, '_');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${fichier}.zip"`);
    res.setHeader('Content-Length', out.length);
    res.end(out);
  } catch (e) {
    console.error('[impression/pdfs]', e);
    res.status(500).json({ error: e.message });
  }
});

// ── Rendu PDF d'un document déjà composé ────────────────────────────────────
// Le centre ne compose pas : l'écran lui remet le HTML produit par la route
// du document, et le centre le rend en PDF. C'est ce qui évite de dupliquer
// la composition, source de nos régressions.
/* L'APERÇU AUSSI (1er octobre 2026) : ce qu'on imprime depuis le navigateur
   porte la signature protégée, comme le PDF et le courriel. */
r.post('/proteger', authRequired, async (req, res) => {
  const { html, piece, destinataire_nom } = req.body || {};
  if (!html) return res.status(400).json({ error: 'document requis' });
  const { htmlSigne, reference } = await protegerSignature(html, { piece: piece || 'Document', destinataire: destinataire_nom || null });
  res.json({ html: htmlSigne, reference });
});

r.post('/pdf', authRequired, async (req, res) => {
  const cap = await capacitePdf();
  if (!cap.disponible) {
    return res.status(503).json({
      error: "Ce serveur ne sait pas produire de PDF. L'impression depuis le "
           + 'navigateur reste disponible.',
      capacite_absente: 'pdf', detail: cap.raison,
    });
  }
  const { nom, pagination, pied = true, orientation, page_css, destinataire_nom } = req.body || {};
  if (!req.body?.html) return res.status(400).json({ error: 'document requis' });
  // LA SIGNATURE NE SORT JAMAIS NUE (lib/protectionSignature.js) : le PDF
  // porte le même fac-similé que le courriel.
  const { htmlSigne: html } = await protegerSignature(req.body.html, { piece: nom || 'Document', destinataire: destinataire_nom || null });

  try {
    // LE PIED SUR CHAQUE FEUILLE. En HTML il ne peut être qu'à la fin du
    // document — d'où des lots « en continu », un seul pied pour cinquante
    // pages. Le PDF, lui, dispose d'un vrai gabarit : on le lui donne, et la
    // marge basse lui réserve sa hauteur.
    const gabarit = pied
      ? (avecNum => piedGabaritPdf(LOGO_IIP_JPEG, piedDocument(), avecNum))
      : null;
    // Une pièce qui porte sa propre page (le diplôme) n'a ni pied ni marge :
    // c'est son @page qui décide, pas le centre.
    const pageCss = !!page_css && !pied;
    const pdf = await rendrePdf(html, {
      pagination: pageCss ? 'jamais' : (pagination || 'si-plusieurs'),
      pied: gabarit,
      orientation: orientation === 'paysage' ? 'paysage' : 'portrait',
      pageCss,
      ...(pied ? { marges: { top: '12mm', right: '15mm',
                             bottom: `${BANDE_PIED_MM}mm`, left: '15mm' } } : {}),
    });
    const fichier = String(nom || 'document').replace(/[^A-Za-z0-9_.-]/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fichier}.pdf"`);
    res.setHeader('Content-Length', pdf.length);
    res.end(pdf);
  } catch (e) {
    console.error('[impression/pdf]', e);
    // « Timed out after waiting 30000ms » ne dit rien à l'utilisateur : on
    // explique ce qui s'est passé et ce qu'il peut faire.
    const expire = /timed out|timeout/i.test(String(e.message));
    res.status(expire ? 504 : 500).json({
      error: expire
        ? "Le rendu a dépassé le temps imparti. Ce lot est trop volumineux pour "
          + "être produit d'un seul tenant : restreignez la sélection, par unité "
          + "ou par section, et reprenez en plusieurs fois."
        : e.message,
    });
  }
});

export default r;
