// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Configuration → Transferts (3.1.332). Voir lib/transferts.js.
// Lire : tout compte connecté (les écrans savent ainsi quoi cacher). Fermer, rouvrir : admin.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';
import { PORTES, portesFermees, poserPorte } from '../lib/transferts.js';

const r = Router();

// Les portes fermées d'une année — pour que chaque écran cache ce qui ne s'ouvre plus.
r.get('/etat', authRequired, (req, res) => {
  const annee = req.query.annee || req.annee || null;
  res.json({ annee, fermees: portesFermees(annee) });
});

// Le registre : chaque porte × chaque année, et le journal.
r.get('/', authRequired, roleRequired('admin'), (req, res) => {
  let annees = [];
  try { annees = db.prepare('SELECT code FROM annee_scolaire ORDER BY code DESC').all().map(a => a.code); }
  catch { annees = db.prepare('SELECT DISTINCT annee_scolaire AS code FROM transfert_porte ORDER BY 1 DESC').all().map(a => a.code); }
  const etats = {};
  for (const l of db.prepare('SELECT * FROM transfert_porte').all()) etats[`${l.cle}|${l.annee_scolaire}`] = l;
  const journal = db.prepare('SELECT * FROM transfert_journal ORDER BY id DESC LIMIT 200').all();
  res.json({
    annees,
    portes: PORTES.map(p => ({
      ...p,
      annees: Object.fromEntries(annees.map(a => {
        const e = etats[`${p.cle}|${a}`];
        return [a, { ferme: !!e?.ferme, maj_le: e?.maj_le || null, maj_par: e?.maj_par || null }];
      })),
    })),
    journal,
  });
});

r.put('/:cle/:annee', authRequired, roleRequired('admin'), (req, res) => {
  try {
    poserPorte(req.params.cle, req.params.annee, !!req.body?.ferme, req.body?.motif,
      req.user?.email || req.user?.nom || null);
    res.json({ ok: true });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

export default r;
