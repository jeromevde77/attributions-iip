// L'ABSENCE D'UN ENSEIGNANT (3.5.210) — deux portes sur le même registre (`lib/absencesEnseignant.js`).
//   /api/mes-cours/absence     : le professeur signale, lit, retire (Mes cours, et son espace par le relais).
//   /api/absences-enseignants  : le secrétariat et la direction décident séance par séance et préviennent les étudiants ;
//                                la coordination lit celles de ses sections.
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, getUserSections } from '../middleware/auth.js';
import { signaler, mesAbsences, retirer, registre, decider, texteEtudiant, inscritsDe, aviserProfesseur, migrerAbsences, MOTIFS, DECISIONS } from '../lib/absencesEnseignant.js';
import { envoyer, resoudre } from '../lib/messagesEtudiants.js';
import { envoyerEmail, templateNotif } from '../services/mailer.js';

const DECIDENT = ['admin', 'directeur', 'directeur_adjoint', 'secretariat', 'editeur'];
const nomDe = req => req.user?.nom || req.user?.email || 'Lucie';

export const prof = Router();
prof.get('/', authRequired, (req, res) => res.json(mesAbsences(req.user)));
prof.post('/', authRequired, (req, res) => {
  const x = signaler(req.user, req.body || {}, nomDe(req));
  if (x.erreur) return res.status(400).json({ error: x.erreur });
  res.json(x);
});
prof.delete('/:id', authRequired, (req, res) => {
  const x = retirer(req.user, req.params.id);
  if (x.erreur) return res.status(x.code || 400).json({ error: x.erreur });
  res.json(x);
});

export const admin = Router();
const lit = req => DECIDENT.includes(req.user?.role) || req.user?.role === 'coordination';
admin.get('/', authRequired, (req, res) => {
  if (!lit(req)) return res.status(403).json({ error: 'Réservé au secrétariat, à la coordination et à la direction.' });
  const sections = DECIDENT.includes(req.user.role) ? null : (getUserSections(req.user) || null);
  res.json({ decide: DECIDENT.includes(req.user.role), motifs: MOTIFS, decisions: DECISIONS,
    absences: registre({ sections, tout: req.query.tout === '1' }) });
});
admin.get('/professeurs', authRequired, (req, res) => {
  if (!DECIDENT.includes(req.user?.role)) return res.status(403).json({ error: 'Réservé au secrétariat et à la direction.' });
  res.json(db.prepare(`SELECT id, UPPER(nom) || ' ' || COALESCE(prenom, '') AS nom FROM professeur ORDER BY nom, prenom`).all());
});
admin.put('/:id/seance/:sid', authRequired, (req, res) => {
  if (!DECIDENT.includes(req.user?.role)) return res.status(403).json({ error: 'Le secrétariat décide.' });
  const x = decider(req.params.id, req.params.sid, req.body || {}, nomDe(req));
  if (x.erreur) return res.status(x.code || 400).json({ error: x.erreur });
  res.json(x);
});
// PRÉVENIR LES ÉTUDIANTS : un message par séance décidée (pas « maintenue ») et pas encore annoncée — dans l'espace de ceux
// qui en ont un, par courriel à l'adresse d'école des autres. Le professeur reçoit la décision dans son fil.
admin.post('/:id/prevenir', authRequired, async (req, res) => {
  if (!DECIDENT.includes(req.user?.role)) return res.status(403).json({ error: 'Le secrétariat prévient.' });
  migrerAbsences();
  const a = db.prepare('SELECT * FROM absence_prof WHERE id = ? AND retiree_le IS NULL').get(Number(req.params.id));
  if (!a) return res.status(404).json({ error: 'Absence introuvable.' });
  const seances = db.prepare(`SELECT * FROM absence_prof_seance WHERE absence_id = ? AND decision IS NOT NULL AND decision <> 'maintenue' AND prevenus_le IS NULL`).all(a.id);
  if (!seances.length) return res.status(409).json({ error: 'Rien à annoncer : aucune séance décidée qui ne l’ait déjà été.' });
  const bilan = { seances: seances.length, espace: 0, courriel: 0, sans_adresse: [] };
  for (const s of seances) {
    const texte = texteEtudiant(s);
    const inscrits = inscritsDe(s);
    if (!texte || !inscrits.length) { db.prepare("UPDATE absence_prof_seance SET prevenus_le = datetime('now'), prevenus_n = 0 WHERE absence_id = ? AND seance_id = ?").run(a.id, s.seance_id); continue; }
    const annee = inscrits[0].annee;
    const ids = inscrits.map(e => e.id);
    const joints = new Set(resoudre({ etudiants: ids }, req.user, annee).filter(d => d.espace).map(d => d.id));
    const objet = s.decision === 'annulee' ? `Séance annulée — ${s.cours_nom || s.cours_code}` : s.decision === 'remplacee' ? `Remplacement — ${s.cours_nom || s.cours_code}` : `Séance déplacée — ${s.cours_nom || s.cours_code}`;
    if (joints.size) { const m = envoyer({ objet, corps: texte, critere: { etudiants: [...joints] } }, req.user, nomDe(req), annee); if (m.ok) bilan.espace += m.n; }
    for (const e of inscrits.filter(x => !joints.has(x.id))) {
      if (!e.email_ecole) { bilan.sans_adresse.push(`${String(e.nom || '').toUpperCase()} ${e.prenom || ''}`.trim()); continue; }
      try { await envoyerEmail({ to: e.email_ecole, subject: objet, html: templateNotif({ titre: objet, corps: texte }), text: texte }); bilan.courriel++; }
      catch (x) { bilan.sans_adresse.push(`${String(e.nom || '').toUpperCase()} ${e.prenom || ''} (courriel refusé)`); console.error('[absence prof] courriel :', x.message); }
    }
    db.prepare("UPDATE absence_prof_seance SET prevenus_le = datetime('now'), prevenus_n = ? WHERE absence_id = ? AND seance_id = ?").run(inscrits.length, a.id, s.seance_id);
  }
  aviserProfesseur(a.id);
  res.json({ ok: true, ...bilan });
});
