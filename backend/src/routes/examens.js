// ─────────────────────────────────────────────────────────────────────────────
// EXAMENS : PRÉPARER ET IMPRIMER (3.5.226). Organisation → L'année → « Examens : préparer et imprimer ».
// Lire : direction, secrétariat, coordination (ses sections). Écrire le détail d'une épreuve : les mêmes (la coordination pour ses
// sections). Le moteur et les pièces : lib/examens.js.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express';
import { authRequired, getUserSections } from '../middleware/auth.js';
import { anneeDeTravail } from '../helpers/annee.js';
import { envelopperDocument } from '../lib/document.js';
import { epreuves, ecrireDetail, composer, PIECES, STYLES_EXAMENS, delaiQuestionnaire } from '../lib/examens.js';
import db from '../db/index.js';

const r = Router();
const ROLES = ['admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat', 'coordination'];
const garde = (req, res, next) => (ROLES.includes(req.user?.role) ? next() : res.status(403).json({ error: 'Réservé au secrétariat, à la coordination et à la direction.' }));
const perimetre = req => getUserSections(req.user);   // null = tout
const params = (q) => ({ annee: q.annee || null, session: Number(q.session) === 2 ? 2 : 1, section: q.section || null, du: q.du || null, au: q.au || null });

r.get('/', authRequired, garde, (req, res) => {
  const p = params(req.query); p.annee ||= anneeDeTravail(req);
  const l = epreuves({ ...p, sections: perimetre(req) }).map(e => ({ ...e, etudiants: e.etudiants.length, ar: e.ar.length, delai_questionnaire: e.session === 1 ? delaiQuestionnaire(e.date) : null }));
  const personnes = db.prepare(`SELECT nom, prenom FROM professeur ORDER BY nom, prenom`).all()
    .map(x => `${String(x.nom || '').toUpperCase()} ${x.prenom || ''}`.trim());
  res.json({ ...p, epreuves: l, pieces: PIECES, personnes });
});

r.put('/detail', authRequired, garde, (req, res) => {
  const b = req.body || {};
  const annee = b.annee || anneeDeTravail(req);
  const secs = perimetre(req);
  if (secs) {
    const s = db.prepare('SELECT section FROM ue WHERE ue_num = ? AND annee_scolaire = ? LIMIT 1').get(Number(b.ue_num), annee)?.section;
    if (!s || !secs.includes(s)) return res.status(403).json({ error: 'Unité hors de votre périmètre.' });
  }
  try { res.json({ ok: true, detail: ecrireDetail({ ...b, annee }, req.user.nom || req.user.email) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

r.post('/documents', authRequired, garde, (req, res) => {
  const b = req.body || {};
  const p = params(b); p.annee ||= anneeDeTravail(req);
  const pieces = (Array.isArray(b.pieces) ? b.pieces : []).filter(x => PIECES.some(y => y.id === x));
  if (!pieces.length) return res.status(400).json({ error: 'Choisissez au moins une pièce.' });
  const liste = epreuves({ ...p, sections: perimetre(req), cles: Array.isArray(b.cles) && b.cles.length ? b.cles : null });
  if (!liste.length) return res.status(409).json({ error: 'Aucune épreuve datée pour cette sélection (Organisation → Sessions : épreuves et délibérations).' });
  const libelle = pieces.length === 1 ? PIECES.find(x => x.id === pieces[0]).libelle : 'Pièces d’examen';
  const sous = `${p.session === 2 ? 'Seconde' : 'Première'} session · ${p.annee}${p.section ? ` · ${p.section}` : ''} · ${liste.length} épreuve(s)`;
  res.json({
    html: envelopperDocument({ html: composer(liste, pieces), titre: libelle, styles: STYLES_EXAMENS, entete: { titre: libelle, sous } }),
    titre: libelle, sous,
    nom: `Examens-${pieces.join('-')}-s${p.session}-${p.section || 'toutes'}-${p.annee}.html`,
  });
});

export default r;
