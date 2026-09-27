/**
 * /api/formulaires — les annexes Word de la circulaire 9760, remplies par Lucie.
 *
 * Réservé à qui produit les pièces du personnel : direction, direction adjointe
 * et secrétariat (`admin` et `editeur` dans roleRequired), derrière le module
 * Personnel. Chaque pièce porte l'identité d'un membre du personnel — NISS,
 * matricule, date de naissance.
 */
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';
import { ANNEXES, remplirAnnexe } from '../services/formulairesFWB.js';

const r = Router();
const PEUT = roleRequired('admin', 'editeur');

const premierPrenom = p => String(p || '').trim().split(/\s+/)[0] || '';

function etablissement() {
  try { return db.prepare('SELECT * FROM etablissement WHERE id = 1').get() || {}; } catch { return {}; }
}

function membre(profId) {
  const p = db.prepare('SELECT * FROM professeur WHERE id = ?').get(profId);
  if (!p) return null;
  return {
    id: p.id,
    nom: String(p.nom || '').toUpperCase(),
    prenom: premierPrenom(p.prenom),
    matricule: p.matricule || '',
    niss: p.niss || '',
    sexe: p.sexe || '',
    date_naissance: p.date_naissance || '',
    lieu_naissance: [p.lieu_naissance_ville, p.lieu_naissance_pays].filter(Boolean).join(', '),
    statut: p.statut || '',
    statut_nomination: p.statut_nomination || '',
    date_engagement: p.date_engagement || '',
  };
}

/** Les attributions de l'année, agrégées comme pour l'EA12. */
function attributions(profId, annee) {
  let l = [];
  try {
    l = db.prepare(`
      SELECT codification_unite, ue_num, MIN(ue_nom) AS ue_nom, nom_cours, type_cours, MIN(section) AS section,
             SUM(COALESCE(total_attribue_professeur, periodes_attribuees, 0)) AS periodes
      FROM v_attribution_complete
      WHERE professeur_id = ? AND annee_scolaire = ?
      GROUP BY codification_unite, nom_cours, type_cours
      ORDER BY codification_unite, nom_cours`).all(profId, annee);
  } catch { l = []; }
  return l.filter(x => Number(x.periodes) > 0);
}

/** Le directeur de l'année, tel que les fonctions le disent. */
function directeur(annee) {
  try {
    const d = db.prepare(`SELECT p.prenom, p.nom FROM personnel_mission m JOIN professeur p ON p.id = m.professeur_id
      WHERE m.annee_scolaire = ? AND m.fonction LIKE 'Directeur%' AND m.fonction NOT LIKE '%adjoint%' LIMIT 1`).get(annee);
    if (d) return `${premierPrenom(d.prenom)} ${String(d.nom || '').toUpperCase()}`;
  } catch { /* table absente */ }
  return '';
}

function absences(profId, annee, types, mois = null) {
  let l = [];
  try {
    l = db.prepare(`SELECT * FROM absence_personnel WHERE professeur_id = ? AND annee_scolaire = ?
      AND type IN (${types.map(() => '?').join(',')}) ORDER BY date_debut`).all(profId, annee, ...types);
  } catch { l = []; }
  if (mois) l = l.filter(a => Number(String(a.date_debut || '').slice(5, 7)) === Number(mois));
  return l;
}
const jours = (a, b) => (a && b ? Math.round((new Date(b) - new Date(a)) / 864e5) + 1 : '');
const STATUT_RELEVE = { definitif: 'D', stagiaire: 'St', temporaire: 'T', contractuel: 'C', D: 'D', St: 'St', T: 'T', C: 'C' };

function donnees(cle, profId, annee, mois) {
  const etab = etablissement();
  const m = profId ? membre(profId) : null;
  const d = { etab, membre: m, annee, mois: mois ? Number(mois) : null };
  if (!m) return d;
  const attrs = attributions(profId, annee);
  const F = a => (a.section === 'AeSI' ? 'BAESI' : 'D');
  if (cle === 'A4') d.date_entree = m.date_engagement;
  if (cle === 'A1ter') {
    d.attributions = attrs.map(a => ({ ue: a.codification_unite || '', f: F(a), denomination: a.nom_cours || '',
      cla: a.type_cours || '', sous_niveau: 'SU', periode_occ: '', nb_periodes: String(Math.round(a.periodes)), di: '' }));
  }
  if (cle === 'A6') {
    d.directeur = directeur(annee);
    // Une ligne par section, datée par les organisations des unités confiées.
    const parSection = {};
    for (const a of attrs) (parSection[a.section || '—'] ||= []).push(a);
    d.services = Object.entries(parSection).map(([sec, l]) => {
      let deb = null, fin = null;
      try {
        const ues = [...new Set(l.map(x => x.ue_num).filter(Boolean))];
        if (ues.length) {
          const o = db.prepare(`SELECT MIN(date_debut) d, MAX(date_fin) f FROM organisation_ue
            WHERE annee_scolaire = ? AND ue_num IN (${ues.map(() => '?').join(',')})`).get(annee, ...ues);
          deb = o?.d || null; fin = o?.f || null;
        }
      } catch { /* */ }
      const per = l.reduce((n, x) => n + Number(x.periodes || 0), 0);
      return { debut: deb, fin, niveau: `Supérieur — ${sec}`, fonction: m.statut === 'EXP' ? 'Expert' : 'Chargé de cours',
        situation: m.statut_nomination || 'Temporaire', horaire: `${Math.round(per)} périodes`, observations: '' };
    });
    const ab = absences(profId, annee, ['maladie_1j', 'maladie', 'maternite', 'accident_travail', 'accident_hors_service', 'anrj', 'greve', 'cad', 'autre']);
    const conv = a => ({ debut: a.date_debut, fin: a.date_fin || a.date_debut, jours: jours(a.date_debut, a.date_fin || a.date_debut), type: a.motif || a.type });
    d.maladies = ab.filter(a => /^maladie/.test(a.type)).map(conv);
    d.maternites = ab.filter(a => a.type === 'maternite').map(conv);
    d.interruptions = ab.filter(a => !/^maladie/.test(a.type) && a.type !== 'maternite').map(conv);
  }
  if (cle === 'A14' || cle === 'A15') {
    const l = absences(profId, annee, [cle === 'A14' ? 'anrj' : 'greve'], mois);
    d.absences = l.map(a => ({ date: a.date_debut, motif: a.motif || '' }));
    d.statut = STATUT_RELEVE[m.statut_nomination] || '';
    d.lieu = 'Anderlecht';
  }
  if (cle === 'A27') {
    const parUE = {};
    for (const a of attrs) (parUE[a.codification_unite || a.ue_num] ||= { intitule: `${a.codification_unite || ''} — ${a.ue_nom || ''}`.replace(/^ — /, ''), cours: [] })
      .cours.push({ denomination: a.nom_cours || '', cla: a.type_cours || '', niveau: 'SU', f: F(a) });
    d.ues = Object.values(parUE);
  }
  return d;
}

r.get('/', authRequired, PEUT, (_req, res) => {
  res.json(ANNEXES.map(({ cle, titre, usage, mois, ea12 }) => ({ cle, titre, usage, mois: !!mois, ea12: !!ea12 })));
});

r.get('/:cle', authRequired, PEUT, async (req, res) => {
  const a = ANNEXES.find(z => z.cle === req.params.cle);
  if (!a) return res.status(404).json({ error: 'Annexe inconnue.' });
  const profId = req.query.professeur_id ? Number(req.query.professeur_id) : null;
  const annee = String(req.query.annee || '');
  if (a.usage === 'membre' && !profId) return res.status(400).json({ error: 'Choisissez un membre du personnel.' });
  if (a.mois && !req.query.mois) return res.status(400).json({ error: 'Choisissez le mois.' });
  try {
    const d = donnees(a.cle, profId, annee, req.query.mois);
    if (a.usage === 'membre' && !d.membre) return res.status(404).json({ error: 'Membre du personnel introuvable.' });
    const buf = await remplirAnnexe(a.cle, d);
    const qui = d.membre ? `_${d.membre.nom}_${d.membre.prenom}` : '';
    const nom = `${a.cle}${qui}_${annee}${d.mois ? '_' + String(d.mois).padStart(2, '0') : ''}.docx`.replace(/\s+/g, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(nom)}"; filename*=UTF-8''${encodeURIComponent(nom)}`);
    res.end(buf);
  } catch (e) {
    console.error('[formulaires]', a.cle, e);
    res.status(500).json({ error: `Le formulaire n'a pas pu être rempli : ${e.message}` });
  }
});

export default r;
