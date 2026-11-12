// Lucie — LES SÉANCES CLOSES SANS DATE (3.5.386, Charles : « date de délibération ! » ; tranché : la fin de l'UE en attendant, et une
// liste à dater). L'attestation de réussite signe à la date de la séance qui a délibéré ; 75 séances closes des années reprises n'en
// avaient pas. Ici on les liste et on pose la date, une fois — rien d'autre ne change (ni décision, ni clôture).
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';

const r = Router();
const garde = [authRequired, roleRequired('admin', 'editeur')];

r.get('/', ...garde, (req, res) => {
  const l = db.prepare(`SELECT s.id, s.ue_num, s.annee_scolaire AS annee, s.session, COALESCE(s.num_organisation, 0) AS org,
      (SELECT ue_nom FROM ue WHERE ue_num = s.ue_num LIMIT 1) AS ue_nom,
      (SELECT MAX(o.date_fin) FROM organisation_ue o WHERE o.ue_num = s.ue_num AND o.annee_scolaire = s.annee_scolaire
        AND (COALESCE(s.num_organisation, 0) = 0 OR o.num_organisation = s.num_organisation)) AS fin_ue,
      (SELECT COUNT(*) FROM deliberation_resultat d WHERE d.ue_num = s.ue_num AND d.annee_scolaire = s.annee_scolaire AND d.session = s.session) AS decisions
    FROM deliberation_seance s WHERE s.cloturee = 1 AND (s.date_seance IS NULL OR s.date_seance = '')
    ORDER BY s.annee_scolaire DESC, s.ue_num, s.session, org`).all();
  res.json(l);
});

r.put('/:id', ...garde, (req, res) => {
  const d = String(req.body?.date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return res.status(400).json({ error: 'Date attendue (jj/mm/aaaa).' });
  const s = db.prepare('SELECT id, cloturee, date_seance FROM deliberation_seance WHERE id = ?').get(Number(req.params.id));
  if (!s) return res.status(404).json({ error: 'Séance inconnue.' });
  if (s.date_seance) return res.status(409).json({ error: 'Cette séance a déjà une date.' });
  db.prepare('UPDATE deliberation_seance SET date_seance = ? WHERE id = ?').run(d, s.id);
  res.json({ ok: true });
});

export default r;
