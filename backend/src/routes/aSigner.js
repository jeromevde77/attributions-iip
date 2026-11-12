// Lucie — CE QUI ATTEND LA DIRECTION (3.5.383, Charles, 12 novembre 2026 : « je ne vois pas les demandes de VA ou d'AR que je
// devrais signer comme directeur »). Les dossiers existaient, chacun dans son écran, mais rien ne les portait au tableau de bord :
// 38 VA décidées attendaient la validation de la direction et 21 AR, le rapport validé, attendaient la décision. Lecture seule ;
// le geste se pose dans l'écran de la valorisation (« Instruire en série » → validation) ou des aménagements.
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { PEUT_VALIDER } from '../lib/valorisation.js';

const r = Router();
const essai = (f, d) => { try { return f(); } catch { return d; } };
const DECIDE = ['accepte', 'partiel', 'refuse', 'recours'];

r.get('/', authRequired, (req, res) => {
  if (!PEUT_VALIDER.includes(req.user.role)) return res.json({ direction: false, va: [], ar: 0 });
  // VA : décision posée, pas encore validée, non archivée — par année (les reprises d'avant restent visibles, comptées à part).
  const va = essai(() => db.prepare(`SELECT annee_scolaire AS annee, COUNT(*) AS n FROM etudiant_valorisation
    WHERE decision_le IS NOT NULL AND valide_le IS NULL AND archive_le IS NULL GROUP BY annee_scolaire ORDER BY annee_scolaire DESC`).all(), []);
  // AR : le rapport (volet B) est validé, le Conseil n'a pas encore décidé.
  const ar = essai(() => db.prepare(`SELECT COUNT(*) n FROM amenagement_dossier WHERE valide_b_le IS NOT NULL AND cde_date IS NULL
    AND COALESCE(statut, '') NOT IN (${DECIDE.map(() => '?').join(',')})`).get(...DECIDE).n, 0);
  res.json({ direction: true, va, ar });
});

export default r;
