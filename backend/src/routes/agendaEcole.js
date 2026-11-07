// Lucie — L'AGENDA DE L'ÉCOLE (3.5.058). Moteur : lib/agendaEcole.js.
// Lire : tout compte. Peindre l'établissement (cours, fermeture, jours fermés) : direction et direction adjointe.
// Forcer une section : la direction, et la coordination pour ses sections.
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { nomEcranDuCompte } from '../lib/nom.js';
import { anneeDeTravail } from '../helpers/annee.js';
import {
  migrerAgenda, agenda, peindreFermeture, peindreCours, poserJourFerme, retirerJourFerme, forcerSection, journalAgenda,
  reprendreCongesModule, PEINT_ETABLISSEMENT, plus, aligner,
} from '../lib/agendaEcole.js';
import { reglage, feriesDe } from '../lib/tempsTravail.js';
import { moments, chaleur, TYPES_MOMENT, NATURES, NATURE_DU_TYPE, DOMAINES, POUR, ecrireMoment, retirerMoment, ecrireSerie, retirerSerie, exceptionSerie } from '../lib/ligneTemps.js';

try { migrerAgenda(); } catch (e) { console.error('[agenda] migration', e.message); }

const r = Router();
// Une année lisible, sinon celle de travail (3.5.190 : « null » venu d'un navigateur faisait tomber la route en « Invalid time value »).
const annee = req => { const a = String(req.query.annee || req.body?.annee || ''); return /^\d{4}-\d{4}$/.test(a) ? a : anneeDeTravail(req); };
const nomDe = u => { const x = db.prepare('SELECT nom_complet, email FROM utilisateur WHERE id = ?').get(u.id); return nomEcranDuCompte(x?.nom_complet, x?.email) || u.email; };
const faute = (res, e) => res.status(e.status || 500).json({ error: e.message });
const direction = (req, res) => { if (PEINT_ETABLISSEMENT.includes(req.user.role)) return true; res.status(403).json({ error: 'Réservé à la direction et à la direction adjointe.' }); return false; };

r.get('/', authRequired, (req, res) => {
  const an = annee(req);
  try { reprendreCongesModule(an); } catch (e) { console.error('[agenda] reprise', e.message); }
  const ag = agenda(an, { user: req.user, presentsMin: reglage(an).presents_min });
  const f = feriesDe(an);
  res.json({ ...ag, moments: moments(an, { user: req.user }), chaleur: chaleur(an), types_moment: TYPES_MOMENT, natures: NATURES, nature_du_type: NATURE_DU_TYPE, domaines: DOMAINES, pour: POUR,
    feries: Object.fromEntries([...f].filter(([d]) => d >= ag.semaines[0] && d <= plus(ag.semaines[51], 6))) });
});
r.put('/fermeture', authRequired, (req, res) => {
  if (!direction(req, res)) return;
  try { peindreFermeture(annee(req), req.body?.lundis, req.body?.fermeture || null, req.body?.libelle, nomDe(req.user)); res.json({ ok: true }); } catch (e) { faute(res, e); }
});
r.put('/cours', authRequired, (req, res) => {
  if (!direction(req, res)) return;
  try { res.json(peindreCours(annee(req), req.body?.lundis, req.body?.type, req.body?.label, nomDe(req.user))); } catch (e) { faute(res, e); }
});
// ALIGNER LES COURS SUR LA FERMETURE (3.5.148) : simulation d'abord (`ecrire: false`), la direction confirme.
r.post('/aligner', authRequired, (req, res) => {
  if (!direction(req, res)) return;
  try { res.json(aligner(annee(req), nomDe(req.user), req.body?.ecrire === true)); } catch (e) { faute(res, e); }
});
r.put('/jour-ferme/:date', authRequired, (req, res) => {
  if (!direction(req, res)) return;
  try { poserJourFerme(annee(req), req.params.date, req.body?.libelle, nomDe(req.user)); res.json({ ok: true }); } catch (e) { faute(res, e); }
});
r.delete('/jour-ferme/:date', authRequired, (req, res) => {
  if (!direction(req, res)) return;
  try { retirerJourFerme(annee(req), req.params.date, nomDe(req.user)); res.json({ ok: true }); } catch (e) { faute(res, e); }
});
r.put('/section', authRequired, (req, res) => {
  try { forcerSection(annee(req), String(req.body?.section || ''), req.body?.lundis, req.body?.etat || null, req.user, nomDe(req.user)); res.json({ ok: true }); } catch (e) { faute(res, e); }
});
// LES ÉLÉMENTS (3.5.062) : un moment daté, ou une série qui revient ; la direction les pose.
r.post('/moments', authRequired, (req, res) => {
  if (!direction(req, res)) return;
  try { res.json({ id: ecrireMoment(annee(req), req.body || {}, nomDe(req.user)) }); } catch (e) { faute(res, e); }
});
r.delete('/moments/:id', authRequired, (req, res) => {
  if (!direction(req, res)) return;
  try { retirerMoment(req.params.id); res.json({ ok: true }); } catch (e) { faute(res, e); }
});
r.post('/series', authRequired, (req, res) => {
  if (!direction(req, res)) return;
  try { res.json({ id: ecrireSerie(annee(req), req.body || {}, nomDe(req.user)) }); } catch (e) { faute(res, e); }
});
r.delete('/series/:id', authRequired, (req, res) => {
  if (!direction(req, res)) return;
  try { retirerSerie(req.params.id); res.json({ ok: true }); } catch (e) { faute(res, e); }
});
r.put('/series/:id/exception', authRequired, (req, res) => {
  if (!direction(req, res)) return;
  try { exceptionSerie(req.params.id, String(req.body?.date || ''), req.body?.nouvelle || null, nomDe(req.user)); res.json({ ok: true }); } catch (e) { faute(res, e); }
});
r.get('/journal', authRequired, (req, res) => {
  if (!direction(req, res)) return;
  res.json(journalAgenda(annee(req)));
});

export default r;
