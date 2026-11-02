// Lucie — QUI FAIT QUOI (3.5.066, Charles, 2 novembre 2026 : « analyse qui fait quoi, ce qui n'est pas fait et la demande de
// charge… et à qui »). La direction lit, d'un écran, ce que chacun a fait dans Lucie (sur une période) et ce qui attend, par
// personne et par section, avec « Confier » sur chaque ligne. Rien ne s'écrit ici : les tâches se confient par la porte
// habituelle (Suivi d'équipe). Les chiffres viennent des traces : journal des modifications, revues de PAE, décisions de VA,
// tâches et échéances cochées ; une trace absente n'est pas un travail absent — l'écran le dit.
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { anneeDeTravail } from '../helpers/annee.js';

const r = Router();
const DIRECTION = ['admin', 'directeur', 'directeur_adjoint'];
const essai = (f, d) => { try { return f(); } catch { return d; } };

r.get('/', authRequired, (req, res) => {
  if (!DIRECTION.includes(req.user.role)) return res.status(403).json({ error: 'Réservé à la direction.' });
  const annee = String(req.query.annee || anneeDeTravail(req));
  const jours = Math.max(7, Math.min(365, Number(req.query.jours) || 30));
  const depuis = new Date(Date.now() - jours * 864e5).toISOString().slice(0, 10);
  const comptes = essai(() => db.prepare("SELECT id, email, role, lucie_nom_compte(nom_complet, email) AS nom, TRIM(nom_complet) AS brut FROM utilisateur WHERE actif = 1").all(), []);
  const parEmail = new Map(comptes.map(c => [String(c.email).toLowerCase(), c]));
  const parNom = new Map(comptes.map(c => [String(c.brut || '').toLowerCase(), c]));
  const qui = x => { const k = String(x || '').trim(); if (!k) return { nom: '(sans auteur)', role: null };
    const c = k.includes('@') ? parEmail.get(k.toLowerCase()) : parNom.get(k.toLowerCase()); return c ? { nom: c.nom, role: c.role, id: c.id } : { nom: k, role: null }; };

  // ── L'activité ──
  const act = new Map();
  const ajouter = (auteur, cle, n, etudiants = 0) => {
    const q = qui(auteur); const a = act.get(q.nom) || { nom: q.nom, role: q.role, id: q.id || null, fiche: 0, pae: 0, resultat: 0, note: 0, revues: 0, va: 0, taches: 0, echeances: 0, etudiants: 0 };
    a[cle] = (a[cle] || 0) + n; a.etudiants += etudiants; act.set(q.nom, a);
  };
  for (const x of essai(() => db.prepare(`SELECT par, objet, COUNT(*) n, COUNT(DISTINCT etudiant_id) e FROM journal_modification WHERE le >= ? GROUP BY par, objet`).all(depuis), []))
    if (['fiche', 'pae', 'resultat', 'note'].includes(x.objet)) ajouter(x.par, x.objet, x.n, x.e);
  for (const x of essai(() => db.prepare('SELECT revu_par p, COUNT(*) n FROM pae_revue WHERE revu_le >= ? GROUP BY revu_par').all(depuis), [])) ajouter(x.p, 'revues', x.n);
  for (const x of essai(() => db.prepare('SELECT decision_par p, COUNT(*) n FROM etudiant_valorisation WHERE decision_le >= ? GROUP BY decision_par').all(depuis), [])) ajouter(x.p, 'va', x.n);
  for (const x of essai(() => db.prepare("SELECT fait_par p, COUNT(*) n FROM tache WHERE statut = 'fait' AND fait_le >= ? GROUP BY fait_par").all(depuis), [])) ajouter(x.p, 'taches', x.n);
  for (const x of essai(() => db.prepare("SELECT fait_par p, COUNT(*) n FROM echeance WHERE statut = 'fait' AND fait_le >= ? AND COALESCE(fait_par, '') <> 'Lucie (constaté)' GROUP BY fait_par").all(depuis), [])) ajouter(x.p, 'echeances', x.n);
  const activite = [...act.values()].map(a => ({ ...a, total: a.fiche + a.pae + a.resultat + a.note + a.revues + a.va + a.taches + a.echeances })).sort((x, y) => y.total - x.total);

  // ── Ce qui attend ──
  const secUE = "(SELECT u.section FROM ue u WHERE u.ue_num = v.ue_num LIMIT 1)";
  const va = essai(() => db.prepare(`SELECT COALESCE(${secUE}, 'Admission') section,
      SUM(decision_le IS NOT NULL AND valide_le IS NULL) a_valider, SUM(valide_le IS NOT NULL AND notifie_le IS NULL) a_notifier,
      SUM(notifie_le IS NOT NULL AND eprom_le IS NULL) a_eprom, SUM(decision_le IS NULL) en_instruction
    FROM etudiant_valorisation v WHERE annee_scolaire = ? AND archive_le IS NULL GROUP BY section ORDER BY a_valider DESC`).all(annee), []);
  const presences = essai(() => db.prepare(`SELECT h.professeur_id, COALESCE(TRIM(p.nom || ' ' || p.prenom), h.professeur_texte, '(aucun enseignant nommé)') enseignant,
      h.section, COUNT(*) n, MIN(h.date) premiere FROM horaire_seance h LEFT JOIN professeur p ON p.id = h.professeur_id
    WHERE h.annee_scolaire = ? AND h.date < date('now') AND COALESCE(h.annule, 0) = 0 AND NOT EXISTS (SELECT 1 FROM presence x WHERE x.seance_id = h.id)
    GROUP BY enseignant, h.section ORDER BY n DESC`).all(annee), []);
  const pae = essai(() => db.prepare(`SELECT COALESCE(e.section_rattachement, '(section non posée)') section, COUNT(*) n FROM etudiant e
    WHERE e.id IN (SELECT DISTINCT etudiant_id FROM etudiant_inscription WHERE annee_scolaire = ?)
      AND e.id NOT IN (SELECT etudiant_id FROM pae_revue WHERE annee_scolaire = ? AND revu_le IS NOT NULL) GROUP BY section ORDER BY n DESC`).all(annee, annee), []);
  const seances = essai(() => db.prepare(`SELECT s.ue_num, s.num_organisation org, s.session, s.date_seance, (SELECT u.section FROM ue u WHERE u.ue_num = s.ue_num LIMIT 1) section
    FROM deliberation_seance s WHERE s.annee_scolaire = ? AND s.date_seance < date('now') AND COALESCE(s.cloturee, 0) = 0 ORDER BY s.date_seance`).all(annee), []);
  const echeances = essai(() => db.prepare(`SELECT COALESCE(lucie_nom_compte(u.nom_complet, u.email), e.responsable_role, '(personne)') responsable, e.responsable_user_id uid,
      ty.libelle, COUNT(*) n, MIN(e.date_due) premiere FROM echeance e JOIN echeance_type ty ON ty.id = e.type_id LEFT JOIN utilisateur u ON u.id = e.responsable_user_id
    WHERE e.annee_scolaire = ? AND e.statut = 'en_retard' GROUP BY responsable, ty.libelle ORDER BY n DESC`).all(annee), []);
  const taches = essai(() => db.prepare(`SELECT COALESCE(lucie_nom_compte(u.nom_complet, u.email), t.responsable_role, '(personne)') responsable, COUNT(*) ouvertes,
      SUM(t.echeance < date('now')) en_retard FROM tache t LEFT JOIN utilisateur u ON u.id = t.responsable_user_id
    WHERE t.statut NOT IN ('fait', 'abandonne') GROUP BY responsable ORDER BY en_retard DESC, ouvertes DESC`).all(), []);

  // ── Le périmètre : qui coordonne quelle section ; les sections que personne ne coordonne ──
  const coord = essai(() => db.prepare(`SELECT s.section_code section, lucie_nom_compte(u.nom_complet, u.email) nom, u.last_login_at derniere FROM utilisateur_section s
    JOIN utilisateur u ON u.id = s.utilisateur_id WHERE u.actif = 1 AND u.role = 'coordination' ORDER BY s.section_code, nom`).all(), []);
  const actives = new Set([...pae.map(x => x.section), ...presences.map(x => x.section), ...va.map(x => x.section)].filter(Boolean));
  const sections = essai(() => db.prepare('SELECT code FROM section ORDER BY code').all().map(x => x.code), []);
  const sansCoordination = sections.filter(s => actives.has(s) && !coord.some(c => c.section === s));
  res.json({ annee, jours, depuis, activite, attente: { va, presences, pae, seances, echeances, taches }, coordinations: coord, sans_coordination: sansCoordination });
});

export default r;
