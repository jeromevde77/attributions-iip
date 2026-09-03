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
import { capacitePdf, rendrePdf } from '../services/pdf.js';

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
             (SELECT u.section FROM ue u WHERE u.ue_num = i.ue_num
               AND u.section IS NOT NULL
               ORDER BY u.annee_scolaire DESC LIMIT 1) AS section
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

// ── Rendu PDF d'un document déjà composé ────────────────────────────────────
// Le centre ne compose pas : l'écran lui remet le HTML produit par la route
// du document, et le centre le rend en PDF. C'est ce qui évite de dupliquer
// la composition, source de nos régressions.
r.post('/pdf', authRequired, async (req, res) => {
  const cap = await capacitePdf();
  if (!cap.disponible) {
    return res.status(503).json({
      error: "Ce serveur ne sait pas produire de PDF. L'impression depuis le "
           + 'navigateur reste disponible.',
      capacite_absente: 'pdf', detail: cap.raison,
    });
  }
  const { html, nom, pagination } = req.body || {};
  if (!html) return res.status(400).json({ error: 'document requis' });

  try {
    const pdf = await rendrePdf(html, { pagination: pagination || 'si-plusieurs' });
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
