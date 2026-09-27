/**
 * parametres.js — CRUD pour la table parametre
 * Les paramètres sont des clés-valeurs configurables depuis l'UI Configuration.
 */
import { Router } from 'express';
import { mentionProduction } from '../lib/contexteRequete.js';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';
import { capacitePdf } from '../services/pdf.js';

const r = Router();

// Helper : lire un paramètre avec fallback
export function getParam(cle, fallback = null) {
  try {
    const row = db.prepare('SELECT valeur FROM parametre WHERE cle = ?').get(cle);
    return row ? row.valeur : fallback;
  } catch { return fallback; }
}
export function getParamNum(cle, fallback = 0) {
  return parseFloat(getParam(cle, String(fallback))) || fallback;
}

// Construit le pied de page commun à tous les documents, selon les cases cochées
// dans Configuration > Mise en page, à partir des champs de l'établissement.
export function piedDocument() {
  let etab = {};
  try { etab = db.prepare('SELECT * FROM etablissement WHERE id = 1').get() || {}; } catch {}
  const on = (cle) => getParam(cle, '1') === '1';
  const ligne1 = [
    on('miseenpage.pied_etab_nom')       ? etab.etab_nom : null,
    on('miseenpage.pied_po') && etab.po_nom ? 'PO ' + etab.po_nom : null,
    on('miseenpage.pied_num_entreprise') && etab.num_entreprise ? 'N° entreprise ' + etab.num_entreprise : null,
  ].filter(Boolean).join(' • ');
  const ligne2 = [
    on('miseenpage.pied_num_fase') && etab.num_fase ? 'Fase ' + etab.num_fase : null,
    on('miseenpage.pied_adresse')  ? etab.adresse : null,
    on('miseenpage.pied_tel') && etab.gest_tel ? 'T. ' + etab.gest_tel : null,
    on('miseenpage.pied_email')    ? etab.email_contact : null,
    on('miseenpage.pied_site_web') ? etab.site_web : null,
  ].filter(Boolean).join(' • ');
  /* LA TRACE DE PRODUCTION — SUR TOUTES LES PIÈCES, SANS EXCEPTION.
   *
   * « Si je sors une attestation, on doit avoir un produit par… le… à… heure.
   * Je veux des traces. » Elle est écrite ICI, dans le pied commun, et non
   * pièce par pièce : quarante et une pièces, c'est quarante et une occasions
   * d'oublier — et ce serait justement celle qu'on a oubliée qui circulerait
   * sans qu'on sache d'où elle vient.
   *
   * Elle se lit sur le document lui-même, pas seulement dans un registre :
   * une pièce imprimée quitte Lucie, et c'est hors de Lucie qu'on se demande
   * qui l'a sortie. */
  const trace = getParam('miseenpage.pied_production', '1') === '1'
    ? mentionProduction() : null;
  /* LE BAS DE PAGE, TROIS PLACES (Charles, 27 septembre 2026) :
   *   · « Produit par… » AU-DESSUS du filet doré, calé à droite sur lui ;
   *   · sous le filet, l'identité, puis l'adresse — et le NUMÉRO DE PAGE sur
   *     la même ligne que l'adresse, collé à droite ;
   *   · tout en gris anthracite, trace et numéro compris.
   * Le numéro n'existe que dans le PDF serveur (gabarit Chromium) : le HTML ne
   * sait pas compter ses pages. On lui réserve sa place, `pied-page`, que
   * piedGabaritPdf() remplit. */
  const ANTHRACITE = '#3F4652';
  const traceHtml = trace
    ? `<div class="pied-trace" style="text-align:right;font-size:5.5pt;color:${ANTHRACITE};line-height:1.3;margin:-4.3mm 0 1.7mm">${trace}</div>`
    : '';
  const l1 = ligne1 ? `<div>${ligne1}</div>` : '';
  const l2 = `<div style="position:relative">${ligne2 || '&nbsp;'}<span class="pied-page" style="position:absolute;right:0;top:0"></span></div>`;
  return traceHtml + l1 + l2;
}

// Indique si le logo doit apparaître en en-tête
export function enteteLogoActif() {
  return getParam('miseenpage.entete_logo', '1') === '1';
}

// GET /parametres — tous les paramètres, groupés
r.get('/', authRequired, (req, res) => {
  const rows = db.prepare('SELECT * FROM parametre ORDER BY groupe, cle').all();
  // Grouper par groupe
  const grouped = {};
  for (const p of rows) {
    const g = p.groupe || 'autre';
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(p);
  }
  res.json(grouped);
});

// L'interface n'affiche le bouton PDF que si le serveur sait le produire :
// mieux vaut pas de bouton qu'un bouton qui échoue.
r.get('/capacites', authRequired, async (req, res) => {
  const pdf = await capacitePdf();
  res.json({ pdf: pdf.disponible, pdf_raison: pdf.raison });
});

// GET /parametres/:cle
r.get('/:cle', authRequired, (req, res) => {
  const row = db.prepare('SELECT * FROM parametre WHERE cle = ?').get(req.params.cle);
  if (!row) return res.status(404).json({ error: 'Paramètre introuvable' });
  res.json(row);
});

// PATCH /parametres/:cle — modifier la valeur
r.patch('/:cle', authRequired, roleRequired('admin'), (req, res) => {
  const { valeur } = req.body;
  if (valeur === undefined || valeur === null)
    return res.status(400).json({ error: 'valeur requis' });
  const row = db.prepare('SELECT cle FROM parametre WHERE cle = ?').get(req.params.cle);
  if (!row) return res.status(404).json({ error: 'Paramètre introuvable' });
  db.prepare('UPDATE parametre SET valeur = ? WHERE cle = ?').run(String(valeur), req.params.cle);
  res.json({ ok: true });
});

// PUT /parametres/bulk — modifier plusieurs paramètres d'un coup
// body: { 'planning.ev1_heures': '2', 'etab.nom': 'Mon école', ... }
r.put('/bulk', authRequired, roleRequired('admin'), (req, res) => {
  const updates = req.body;
  if (typeof updates !== 'object' || Array.isArray(updates))
    return res.status(400).json({ error: 'body doit être un objet { cle: valeur }' });
  const upsert = db.prepare(`
    INSERT INTO parametre (cle, valeur) VALUES (?, ?)
    ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur
  `);
  const update = db.transaction(() => {
    for (const [cle, valeur] of Object.entries(updates)) {
      upsert.run(cle, String(valeur));
    }
  });
  update();
  res.json({ ok: true, updated: Object.keys(updates).length });
});

export default r;
