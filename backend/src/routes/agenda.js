/**
 * MON HORAIRE DANS MON AGENDA — routes (`/api/agenda`). Métier : `lib/agendaIcs.js`.
 * `GET /flux/:jeton.ics` est PUBLIC (un agenda ne se connecte pas) : le jeton fait
 * foi, il ne rend que l'horaire. Le reste se gère avec la session : voir si un lien
 * existe, en créer un (l'ancien cesse), le révoquer.
 */
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { migrerAgenda, lienActif, nouveauLien, revoquerLien, utilisateurDuJeton, seancesDuProf, icsDesSeances } from '../lib/agendaIcs.js';

try { migrerAgenda(); } catch (e) { console.error('[migration] agenda :', e.message); }

const r = Router();
const base = () => (process.env.LUCIE_URL || 'https://www.lucie-iip.be').replace(/\/+$/, '');
const profDe = id => db.prepare('SELECT professeur_id FROM utilisateur WHERE id = ?').get(Number(id))?.professeur_id || null;

r.get('/flux/:fichier', (req, res) => {
  const jeton = String(req.params.fichier || '').replace(/\.ics$/, '');
  const u = utilisateurDuJeton(jeton);
  // Même réponse pour un jeton faux ou révoqué : rien ne se devine.
  if (!u) return res.status(404).type('text/plain').send('Lien inconnu ou remplacé.');
  const depuis = new Date(Date.now() - 60 * 86400e3).toISOString().slice(0, 10);
  const ics = icsDesSeances(seancesDuProf(u.professeur_id, depuis), { domaine: new URL(base()).hostname });
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="lucie-horaire.ics"');
  res.setHeader('Cache-Control', 'private, max-age=900');
  res.send(ics);
});

r.get('/lien', authRequired, (req, res) => {
  const pid = profDe(req.user?.id);
  const l = lienActif(req.user?.id);
  const n = pid ? seancesDuProf(pid, new Date(Date.now() - 60 * 86400e3).toISOString().slice(0, 10)).length : 0;
  res.json({ professeur: !!pid, seances: n, lien: l ? { cree_le: l.cree_le, dernier_acces: l.dernier_acces, acces: l.acces } : null });
});

r.post('/lien', authRequired, (req, res) => {
  if (!profDe(req.user?.id)) return res.status(409).json({ error: 'Ce compte n’est relié à aucun dossier d’enseignant : il n’a pas d’horaire à publier.' });
  const jeton = nouveauLien(req.user.id);
  const https = `${base()}/api/agenda/flux/${jeton}.ics`;
  res.json({ ok: true, url: https, webcal: https.replace(/^https?:/, 'webcal:') });
});

r.delete('/lien', authRequired, (req, res) => {
  res.json({ ok: true, revoques: revoquerLien(req.user?.id) });
});

export default r;
