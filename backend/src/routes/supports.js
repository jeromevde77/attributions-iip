// LES SUPPORTS DE COURS (3.5.211) — monté sur /api/mes-cours/supports AVANT les routes paramétriques de Mes cours. L'accès est
// celui de Mes cours (`accesCours`) : le professeur attribué, la coordination de la section.
import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { anneeDeTravail } from '../helpers/annee.js';
import { accesCours } from './mesCours.js';
import { supportsDuCours, deposerSupport, supportParId, retirerSupport, contenuDe, MAX_OCTETS } from '../lib/supportsCours.js';
import { fonctionOuverte } from '../lib/fonctions.js';

const r = Router();
const nomDe = req => req.user?.nom || req.user?.email || null;

r.get('/fichier/:id', authRequired, (req, res) => {
  const s = supportParId(req.params.id);
  if (!s || !accesCours(req, s.cours_code, s.annee_scolaire)) return res.status(404).json({ error: 'Support introuvable.' });
  const buf = contenuDe(s);
  if (!buf) return res.status(410).json({ error: 'Le fichier n’est plus sur le serveur.' });
  res.setHeader('Content-Type', s.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(s.nom)}`);
  res.send(buf);
});
r.get('/:coursCode', authRequired, (req, res) => {
  const annee = String(req.query.annee || anneeDeTravail(req));
  if (!accesCours(req, req.params.coursCode, annee)) return res.status(403).json({ error: 'Ce cours n’est pas dans vos cours.' });
  res.json({ annee, max_mo: MAX_OCTETS / 1024 / 1024, ouvert: fonctionOuverte('espace.supports'),
    supports: supportsDuCours(req.params.coursCode, annee, { retires: req.query.retires === '1' }) });
});
r.post('/:coursCode', authRequired, (req, res) => {
  const annee = String(req.body?.annee || anneeDeTravail(req));
  const d = accesCours(req, req.params.coursCode, annee);
  if (!d) return res.status(403).json({ error: 'Ce cours n’est pas dans vos cours.' });
  const x = deposerSupport({ coursCode: req.params.coursCode, ueNum: d.ueNum ?? null, annee, user: req.user, nomAuteur: nomDe(req) }, req.body || {});
  if (x.erreur) return res.status(400).json({ error: x.erreur });
  res.json(x);
});
r.delete('/:id', authRequired, (req, res) => {
  const s = supportParId(req.params.id);
  if (!s || !accesCours(req, s.cours_code, s.annee_scolaire)) return res.status(404).json({ error: 'Support introuvable.' });
  retirerSupport(s.id, nomDe(req));
  res.json({ ok: true });
});
export default r;
