/**
 * parametres.js — CRUD pour la table parametre
 * Les paramètres sont des clés-valeurs configurables depuis l'UI Configuration.
 */
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';

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
  return [ligne1, ligne2].filter(Boolean).join('<br>');
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
