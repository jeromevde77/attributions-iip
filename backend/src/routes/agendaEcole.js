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
  reprendreCongesModule, PEINT_ETABLISSEMENT, plus,
} from '../lib/agendaEcole.js';
import { reglage, feriesDe } from '../lib/tempsTravail.js';
import { moments, chaleur, TYPES_MOMENT } from '../lib/ligneTemps.js';

try { migrerAgenda(); } catch (e) { console.error('[agenda] migration', e.message); }

const r = Router();
const annee = req => String(req.query.annee || req.body?.annee || anneeDeTravail(req));
const nomDe = u => { const x = db.prepare('SELECT nom_complet, email FROM utilisateur WHERE id = ?').get(u.id); return nomEcranDuCompte(x?.nom_complet, x?.email) || u.email; };
const faute = (res, e) => res.status(e.status || 500).json({ error: e.message });
const direction = (req, res) => { if (PEINT_ETABLISSEMENT.includes(req.user.role)) return true; res.status(403).json({ error: 'Réservé à la direction et à la direction adjointe.' }); return false; };

r.get('/', authRequired, (req, res) => {
  const an = annee(req);
  try { reprendreCongesModule(an); } catch (e) { console.error('[agenda] reprise', e.message); }
  const ag = agenda(an, { user: req.user, presentsMin: reglage(an).presents_min });
  const f = feriesDe(an);
  res.json({ ...ag, moments: moments(an), chaleur: chaleur(an), types_moment: TYPES_MOMENT,
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
r.get('/journal', authRequired, (req, res) => {
  if (!direction(req, res)) return;
  res.json(journalAgenda(annee(req)));
});

export default r;
