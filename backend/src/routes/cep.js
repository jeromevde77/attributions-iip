/**
 * LE CONGÉ-ÉDUCATION PAYÉ — la case sur la fiche, le bilan d'assiduité, les
 * pièces, la justification d'une absence par le secrétariat, le registre.
 * Cadre et calculs : lib/cep.js ; pièces : lib/piecesCep.js.
 *
 * CELUI QUI COCHE EST CELUI QUI SIGNE : la case CEP, une justification, une
 * présence portent le nom de la personne connectée et l'heure.
 */
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, getUserSections } from '../middleware/auth.js';
import { sectionRattachement } from './etudiants.js';
import { anneeDeTravail } from '../helpers/annee.js';
import {
  migrerCep, cepDe, REGIONS, MOTIFS_JUSTIFIES, STATUTS_PRESENCE, unitesInscrites, dossierCepUE, ecrirePresences,
} from '../lib/cep.js';
import { chargerCep, composerPieceCep, manquesCep, TYPES_PIECE_CEP } from '../lib/piecesCep.js';

const ROLES = ['admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat'];
const qui = req => req.user?.email || req.user?.nom || null;
const r = Router();

function peutCep(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
  if (ROLES.includes(req.user.role)) return next();
  return res.status(403).json({ error: 'Le congé-éducation payé se gère au secrétariat et à la direction.' });
}
/** L'étudiant, s'il est dans le périmètre du demandeur — 404 sinon. */
function etudiantLisible(req, res, annee) {
  const e = db.prepare('SELECT id FROM etudiant WHERE id = ?').get(Number(req.params.id));
  const perim = getUserSections(req.user);
  let section = null;
  try { section = sectionRattachement(Number(req.params.id), annee).section || null; } catch { /* */ }
  if (!e || (perim && section && !perim.includes(section))) {
    res.status(404).json({ error: 'étudiant introuvable' }); return null;
  }
  return e;
}

r.get('/references', authRequired, (req, res) => {
  res.json({ regions: REGIONS, motifs: MOTIFS_JUSTIFIES, statuts: STATUTS_PRESENCE, pieces: TYPES_PIECE_CEP });
});

/* LE REGISTRE : qui est au CEP cette année, et où en est son assiduité. Le
   seuil de 10 % d'absences injustifiées se voit ici avant d'être découvert
   par l'employeur. */
r.get('/registre', authRequired, peutCep, (req, res) => {
  const annee = req.query.annee || anneeDeTravail(req);
  const perim = getUserSections(req.user);
  const lignes = [];
  for (const c of db.prepare(`SELECT c.*, e.nom, e.prenom, e.id_ecampus FROM etudiant_cep c
      JOIN etudiant e ON e.id = c.etudiant_id WHERE c.annee_scolaire = ? ORDER BY e.nom, e.prenom`).all(annee)) {
    let section = null;
    try { section = sectionRattachement(c.etudiant_id, annee).section || null; } catch { /* */ }
    if (perim && section && !perim.includes(section)) continue;
    const ues = unitesInscrites(c.etudiant_id, annee).filter(u => !u.epreuve_integree)
      .map(u => { const d = dossierCepUE(c.etudiant_id, u.ue_num, annee);
        const ps = d.periodes.filter(p => p.commencee);
        return { ue_num: u.ue_num, nb_seances: d.nb_seances,
          non_encodees: ps.reduce((t, p) => t + p.non_encodees.length, 0),
          alerte: ps.some(p => p.taux_injustifie > 0.1),
          taux_max: ps.reduce((t, p) => Math.max(t, p.taux_injustifie), 0) }; });
    lignes.push({ ...c, section, ues });
  }
  res.json({ annee, lignes });
});

// ── La case et le bilan d'un étudiant ───────────────────────────────────────
r.get('/etudiant/:id', authRequired, peutCep, (req, res) => {
  const annee = req.query.annee || anneeDeTravail(req);
  if (!etudiantLisible(req, res, annee)) return;
  const id = Number(req.params.id);
  const cep = cepDe(id, annee);
  const ues = cep ? unitesInscrites(id, annee).map(u => {
    if (u.epreuve_integree) return { ...u, exclue: "épreuve intégrée — n'ouvre pas le droit" };
    const d = dossierCepUE(id, u.ue_num, annee);
    return { ...u, ...d, periodes: d.periodes.map(p => ({ ...p,
      non_encodees: p.non_encodees.map(s => ({ id: s.id, date: s.date, heure_debut: s.heure_debut, intitule: s.intitule })) })) };
  }) : [];
  // Les absences de l'année, pour que le secrétariat les justifie sur pièce.
  const absences = cep ? db.prepare(`SELECT p.seance_id, p.statut, p.motif, p.encode_par, p.encode_le,
      s.date, s.heure_debut, s.heure_fin, s.cours_code, s.ue_num, s.matiere
    FROM presence p JOIN horaire_seance s ON s.id = p.seance_id
    WHERE p.etudiant_id = ? AND s.annee_scolaire = ? AND p.statut IN ('absent','justifie')
    ORDER BY s.date, s.heure_debut`).all(id, annee) : [];
  let manques = {};
  if (cep && cep.region !== 'flandre') {
    const d = chargerCep(id, annee);
    if (!d.erreur) manques = { inscription: manquesCep('inscription', d), assiduite: manquesCep('assiduite', d) };
  }
  const e = db.prepare('SELECT date_naissance, lieu_naissance, adresse, localite FROM etudiant WHERE id = ?').get(id) || {};
  const identite = [!e.date_naissance && 'la date de naissance', !e.lieu_naissance && 'le lieu de naissance',
    !(e.adresse && e.localite) && "l'adresse de domicile"].filter(Boolean);
  res.json({ annee, cep, ues, absences, manques, identite });
});

r.put('/etudiant/:id', authRequired, peutCep, (req, res) => {
  const annee = req.body?.annee || anneeDeTravail(req);
  if (!etudiantLisible(req, res, annee)) return;
  const id = Number(req.params.id);
  if (req.body?.cep === false) {
    db.prepare('DELETE FROM etudiant_cep WHERE etudiant_id = ? AND annee_scolaire = ?').run(id, annee);
    return res.json({ ok: true, cep: null });
  }
  const region = req.body?.region || 'bruxelles';
  if (!REGIONS[region]) return res.status(400).json({ error: 'Région inconnue.' });
  const employeur = String(req.body?.employeur || '').trim() || null;
  db.prepare(`INSERT INTO etudiant_cep (etudiant_id, annee_scolaire, region, employeur, pose_par)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (etudiant_id, annee_scolaire) DO UPDATE SET region = excluded.region,
        employeur = excluded.employeur, modifie_par = ?, modifie_le = datetime('now')`)
    .run(id, annee, region, employeur, qui(req), qui(req));
  res.json({ ok: true, cep: cepDe(id, annee) });
});

// ── Justifier une absence sur pièce (secrétariat) ───────────────────────────
r.put('/presence', authRequired, peutCep, (req, res) => {
  const { seance_id, etudiant_id, statut, motif } = req.body || {};
  const s = db.prepare('SELECT id, annee_scolaire FROM horaire_seance WHERE id = ?').get(Number(seance_id));
  if (!s) return res.status(404).json({ error: 'séance introuvable' });
  req.params.id = etudiant_id;
  if (!etudiantLisible(req, res, s.annee_scolaire)) return;
  const out = ecrirePresences([{ seance_id: s.id, etudiant_id: Number(etudiant_id), statut, motif }], qui(req));
  if (out.erreur) return res.status(400).json({ error: out.erreur });
  res.json({ ok: true, ...out });
});

// ── Les pièces ──────────────────────────────────────────────────────────────
r.get('/etudiant/:id/piece/:type', authRequired, peutCep, (req, res) => {
  const annee = req.query.annee || anneeDeTravail(req);
  if (!etudiantLisible(req, res, annee)) return;
  if (!TYPES_PIECE_CEP[req.params.type]) return res.status(400).json({ error: 'pièce inconnue' });
  const d = chargerCep(Number(req.params.id), annee);
  if (d.erreur) return res.status(d.code || 400).json({ error: d.erreur });
  const p = composerPieceCep(req.params.type, d, { ue: req.query.ue || null });
  if (p.erreur) return res.status(p.code || 400).json({ error: p.erreur, manques: p.manques || [] });
  res.json({ html: p.html, nom: p.nom, titre: TYPES_PIECE_CEP[req.params.type], etudiant_id: d.etudiant.id });
});

export default r;
