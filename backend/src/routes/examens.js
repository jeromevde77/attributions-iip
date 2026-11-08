// ─────────────────────────────────────────────────────────────────────────────
// EXAMENS : PRÉPARER ET IMPRIMER (3.5.226). Organisation → L'année → « Examens : préparer et imprimer ».
// Lire : direction, secrétariat, coordination (ses sections). Écrire le détail d'une épreuve : les mêmes (la coordination pour ses
// sections). Le moteur et les pièces : lib/examens.js.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express';
import { authRequired, getUserSections } from '../middleware/auth.js';
import { anneeDeTravail } from '../helpers/annee.js';
import { envelopperDocument } from '../lib/document.js';
import { epreuves, ecrireDetail, composer, PIECES, STYLES_EXAMENS, delaiQuestionnaire, acquisDe, garde as pageDeGarde, nettoyerGrille, lireGrille, ecrireGrille } from '../lib/examens.js';
import { accesCours } from './mesCours.js';
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

/* LA PAGE DE GARDE DE L'ENSEIGNANT (3.5.234, Charles, 8 novembre 2026 : « depuis l'espace prof, l'enseignant doit pouvoir générer
   sa page de garde, avec les données de Lucie : son nom, l'année, l'UE, le cours, les AA qui seront évalués »). Mes cours → un cours →
   Examen (donc aussi l'espace enseignant, par le relais). Accès : la règle de Mes cours (`accesCours`). L'épreuve vient du calendrier
   des sessions quand elle est datée ; les acquis, de la pondération du cours ; l'enseignant coche ceux qu'il évalue, y met ses
   questions et ses points, et imprime une page vierge ou une page par étudiant. Rien ne s'écrit. */
function epreuveDuCours(req, cours, session) {
  const annee = anneeDeTravail(req);
  const acces = accesCours(req, cours, annee);
  if (!acces) return null;
  const c = db.prepare(`SELECT c.cours_code, c.cours_nom, c.ue_num, (SELECT u.ue_nom FROM ue u WHERE u.ue_num = c.ue_num AND u.annee_scolaire = c.annee_scolaire LIMIT 1) AS ue_nom,
      (SELECT u.section FROM ue u WHERE u.ue_num = c.ue_num AND u.annee_scolaire = c.annee_scolaire LIMIT 1) AS section,
      (SELECT u.ue_niv FROM ue u WHERE u.ue_num = c.ue_num AND u.annee_scolaire = c.annee_scolaire LIMIT 1) AS niveau
    FROM cours c WHERE c.cours_code = ? AND c.annee_scolaire = ? LIMIT 1`).get(cours, annee);
  if (!c) return null;
  const datee = epreuves({ annee, session, cles: [`${session}|${c.ue_num}|${cours}`, `${session}|${c.ue_num}|`] })[0] || null;
  const profId = db.prepare('SELECT professeur_id FROM utilisateur WHERE id = ?').get(req.user.id)?.professeur_id || null;
  const moi = profId ? db.prepare('SELECT nom, prenom FROM professeur WHERE id = ?').get(profId) : null;
  const nom = x => `${String(x.nom || '').toUpperCase()} ${x.prenom || ''}`.trim();
  const etudiants = (datee?.etudiants?.length ? datee.etudiants : (acces.etudiants || []).map(x => ({ id: x.id, nom: nom(x), matricule: x.id_ecampus || '' })));
  return { annee, session, ...c, cours_code: cours, date: datee?.date || null, heure: datee?.heure || null, heure_fin: datee?.heure_fin || '',
    duree_min: datee?.duree_min || 120, local: datee?.local || null, materiel: datee?.materiel || '', consignes: datee?.consignes || '',
    professeurs: moi ? nom(moi) : (datee?.professeurs || ''), etudiants, acquis: acquisDe({ annee, ue_num: c.ue_num, cours_code: cours }), datee: !!datee };
}
// Mes examens : les cours de l'enseignant (ses attributions de l'année) et leurs épreuves datées.
r.get('/mes-epreuves', authRequired, (req, res) => {
  const annee = anneeDeTravail(req);
  const profId = db.prepare('SELECT professeur_id FROM utilisateur WHERE id = ?').get(req.user.id)?.professeur_id || null;
  if (!profId) return res.json({ annee, relie: false, cours: [] });
  const cours = db.prepare(`SELECT DISTINCT a.code_cours AS cours_code, a.ue_num,
      (SELECT c.cours_nom FROM cours c WHERE c.cours_code = a.code_cours AND c.annee_scolaire = a.annee_scolaire LIMIT 1) AS cours_nom,
      (SELECT u.ue_nom FROM ue u WHERE u.ue_num = a.ue_num AND u.annee_scolaire = a.annee_scolaire LIMIT 1) AS ue_nom
    FROM attribution a WHERE a.professeur_id = ? AND a.annee_scolaire = ? AND a.code_cours IS NOT NULL ORDER BY a.ue_num, a.code_cours`).all(profId, annee);
  const date = (t, k, ue, c) => { try { return db.prepare(`SELECT ${k}_date AS d, ${k}_heure AS h, ${k}_local AS l FROM ${t} WHERE annee_scolaire = ? AND ue_num = ? AND COALESCE(cours_code, '') IN (?, '') ORDER BY cours_code DESC LIMIT 1`).get(annee, ue, c) || null; } catch { return null; } };
  res.json({ annee, relie: true, cours: cours.map(c => ({ ...c, s1: date('epreuve_session1', 's1', c.ue_num, c.cours_code), s2: date('deliberation_session2', 's2', c.ue_num, c.cours_code) })) });
});
r.get('/cours/:cours', authRequired, (req, res) => {
  const e = epreuveDuCours(req, req.params.cours, Number(req.query.session) === 2 ? 2 : 1);
  if (!e) return res.status(404).json({ error: 'Cours introuvable dans vos cours.' });
  res.json({ ...e, etudiants: e.etudiants.length, grille: lireGrille(e) || [] });
});
// La grille de l'examen se garde sans produire la page (3.5.240).
r.put('/cours/:cours/grille', authRequired, (req, res) => {
  const b = req.body || {};
  const e = epreuveDuCours(req, req.params.cours, Number(b.session) === 2 ? 2 : 1);
  if (!e) return res.status(404).json({ error: 'Cours introuvable dans vos cours.' });
  const g = nettoyerGrille(b.questions, new Set(e.acquis.map(a => a.aa_code)));
  ecrireGrille(e, g, req.user?.nom_complet || req.user?.email);
  res.json({ ok: true, grille: g });
});
r.post('/cours/:cours/page-de-garde', authRequired, (req, res) => {
  const b = req.body || {};
  const session = Number(b.session) === 2 ? 2 : 1;
  const e = epreuveDuCours(req, req.params.cours, session);
  if (!e) return res.status(404).json({ error: 'Cours introuvable dans vos cours.' });
  // La grille de questions (3.5.240) : elle se garde, et elle fait les acquis évalués.
  if (Array.isArray(b.questions)) {
    const g = nettoyerGrille(b.questions, new Set(e.acquis.map(a => a.aa_code)));
    if (!g.length) return res.status(400).json({ error: 'Ajoutez au moins une question.' });
    if (g.some(q => !q.aa_code)) return res.status(400).json({ error: `Chaque question se rattache à un acquis (${g.filter(q => !q.aa_code).map(q => q.num).join(', ')}).` });
    if (g.some(q => !q.points)) return res.status(400).json({ error: `Chaque question porte ses points (${g.filter(q => !q.points).map(q => q.num).join(', ')}).` });
    ecrireGrille(e, g, req.user?.nom_complet || req.user?.email);
    b.acquis = null; e.grille = g;
  }
  const choisis = Array.isArray(b.acquis) ? b.acquis : null;
  const parCode = new Map(e.acquis.map(a => [a.aa_code, a]));
  const aa = choisis ? choisis.filter(x => parCode.has(x.aa_code)).map(x => ({ ...parCode.get(x.aa_code), questions: String(x.questions || '').slice(0, 60), points: Number(x.points) > 0 ? Number(x.points) : null })) : e.acquis;
  if (!aa.length && !e.grille) return res.status(400).json({ error: 'Cochez au moins un acquis évalué.' });
  const ep = { ...e, aa_choisis: e.grille ? null : aa, grille: e.grille || undefined, date: b.date || e.date, heure: b.heure || e.heure, materiel: b.materiel ?? e.materiel, consignes: b.consignes ?? e.consignes,
    pages: Number(b.pages) > 0 ? Math.round(Number(b.pages)) : null, etudiants: b.nominatif ? e.etudiants : [] };
  if (b.heure && !b.heure_fin) { const [h, m] = String(b.heure).split(':').map(Number); const t = h * 60 + (m || 0) + (ep.duree_min || 120); ep.heure_fin = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; }
  const titre = `Page de garde — ${e.cours_code}`;
  res.json({ html: envelopperDocument({ html: pageDeGarde(ep), titre, styles: STYLES_EXAMENS, entete: false }), titre,
    nom: `Page-de-garde-${e.cours_code}-s${session}-${e.annee}.html` });
});

export default r;
