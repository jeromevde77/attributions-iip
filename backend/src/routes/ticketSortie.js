/**
 * LE TICKET DE SORTIE, CÔTÉ PROFESSEUR — routes (`/api/mes-cours/ticket`). Métier :
 * `lib/ticketSortie.js`. L'accès est celui de Mes cours (`accesCours`) et la séance
 * doit être de ce cours. Le côté étudiant vit dans `routes/presenceQr.js` (le cookie
 * du téléphone n'est envoyé que là).
 */
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { accesCours } from './mesCours.js';
import { lireSeance } from '../lib/presenceQr.js';
import { migrerTicket, ticketDeLaSeance, poserTicket, qrDuTicket, resultatsTicket, fermerTicket, QUESTIONS_DEFAUT, TYPES, MAX_QUESTIONS } from '../lib/ticketSortie.js';
import { migrerCarnet } from '../lib/carnet.js';

try { migrerTicket(); migrerCarnet(); } catch (e) { console.error('[migration] ticket de sortie :', e.message); }

const r = Router();
const qui = req => req.user?.email || req.user?.nom || null;

function contexte(req, res) {
  const s = lireSeance(req.params.seanceId);
  if (!s || s.cours_code !== req.params.coursCode) { res.status(404).json({ error: 'Séance introuvable pour ce cours.' }); return null; }
  const d = accesCours(req, s.cours_code, s.annee_scolaire);
  if (!d) { res.status(403).json({ error: "Ce cours n'est ni dans vos attributions, ni dans votre section." }); return null; }
  return { s, d };
}

r.get('/:coursCode/:seanceId', authRequired, (req, res) => {
  const c = contexte(req, res); if (!c) return;
  const t = ticketDeLaSeance(c.s.id);
  res.json({ types: TYPES, max: MAX_QUESTIONS, defaut: QUESTIONS_DEFAUT, ticket: t ? { questions: t.questions, anonyme: !!t.anonyme } : null,
    resultats: t ? resultatsTicket(t) : null });
});

r.put('/:coursCode/:seanceId', authRequired, (req, res) => {
  const c = contexte(req, res); if (!c) return;
  if (c.s.annule) return res.status(409).json({ error: 'Séance annulée.' });
  const x = poserTicket(c.s, { questions: req.body?.questions, anonyme: req.body?.anonyme !== false }, qui(req));
  if (x.erreur) return res.status(x.erreur === 'repondu' ? 409 : 400).json({ error: x.message });
  res.json({ ok: true, resultats: resultatsTicket(x.ticket) });
});

r.get('/:coursCode/:seanceId/qr', authRequired, (req, res) => {
  const c = contexte(req, res); if (!c) return;
  const t = ticketDeLaSeance(c.s.id);
  if (!t) return res.status(404).json({ error: 'Aucun ticket pour cette séance.' });
  try {
    const x = qrDuTicket(t);
    if (x.erreur) return res.status(409).json({ error: x.message });
    res.json({ ...x, resultats: resultatsTicket(t) });
  } catch (e) { res.status(503).json({ error: e.message }); }
});

r.get('/:coursCode/:seanceId/resultats', authRequired, (req, res) => {
  const c = contexte(req, res); if (!c) return;
  const t = ticketDeLaSeance(c.s.id);
  res.json(t ? resultatsTicket(t) : null);
});

r.post('/:coursCode/:seanceId/fermer', authRequired, (req, res) => {
  const c = contexte(req, res); if (!c) return;
  const t = ticketDeLaSeance(c.s.id);
  if (!t) return res.status(404).json({ error: 'Aucun ticket pour cette séance.' });
  fermerTicket(t);
  res.json({ ok: true, resultats: resultatsTicket(ticketDeLaSeance(c.s.id)) });
});

/* VERSER LE QCM DANS LE CARNET : un ticket NOMINATIF dont les QCM portent leur bonne
   réponse devient une évaluation du carnet (« carnet seul », sans acquis) — un point
   par bonne réponse. Une seule fois par ticket. */
r.post('/:coursCode/:seanceId/carnet', authRequired, (req, res) => {
  const c = contexte(req, res); if (!c) return;
  const t = ticketDeLaSeance(c.s.id);
  if (!t) return res.status(404).json({ error: 'Aucun ticket pour cette séance.' });
  if (t.anonyme) return res.status(409).json({ error: 'Ce ticket est anonyme : ses réponses ne se versent pas au carnet.' });
  const qcm = t.questions.map((q, i) => ({ q, i })).filter(x => x.q.type === 'choix' && x.q.bonne != null);
  if (!qcm.length) return res.status(409).json({ error: 'Aucune question à choix n’a de bonne réponse indiquée.' });
  const intitule = `Ticket du ${String(c.s.date).slice(8, 10)}/${String(c.s.date).slice(5, 7)}`;
  if (db.prepare('SELECT 1 FROM carnet_evaluation WHERE annee_scolaire = ? AND cours_code = ? AND intitule = ?').get(c.s.annee_scolaire, c.s.cours_code, intitule)) {
    return res.status(409).json({ error: `« ${intitule} » est déjà dans le carnet.` });
  }
  const rep = db.prepare('SELECT etudiant_id, reponses FROM ticket_reponse WHERE ticket_id = ?').all(t.id);
  const miens = new Set(c.d.etudiants.map(e => e.id));
  let n = 0;
  db.transaction(() => {
    const id = db.prepare(`INSERT INTO carnet_evaluation (annee_scolaire, cours_code, ue_num, intitule, date, sur, poids, session, ordre, cree_par)
      VALUES (?,?,?,?,?,?,1,1,0,?)`).run(c.s.annee_scolaire, c.s.cours_code, c.d.ueNum, intitule, c.s.date, qcm.length, qui(req)).lastInsertRowid;
    const poser = db.prepare('INSERT INTO carnet_note (evaluation_id, etudiant_id, points, saisi_par) VALUES (?,?,?,?)');
    for (const x of rep) {
      if (!miens.has(x.etudiant_id)) continue;
      const a = JSON.parse(x.reponses || '[]');
      poser.run(id, x.etudiant_id, qcm.filter(({ q, i }) => a[i] === q.bonne).length, `${qui(req)} (ticket)`); n++;
    }
  })();
  res.json({ ok: true, intitule, notes: n, sur: qcm.length });
});

export default r;
