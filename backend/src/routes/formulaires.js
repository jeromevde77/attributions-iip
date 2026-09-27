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
function attributions(profId, annee, { expert = null } = {}) {
  let l = [];
  // expert : true → les seules lignes d'expert (A1 ter, A27) ; false → les
  // autres ; null → toutes. Le statut d'une ligne est celui de son exception,
  // sinon celui du membre.
  const filtre = expert == null ? '' : `AND UPPER(COALESCE((SELECT a.statut_exception FROM attribution a WHERE a.id = v.id),
      (SELECT p.statut FROM professeur p WHERE p.id = v.professeur_id), '')) ${expert ? "= 'EXP'" : "<> 'EXP'"}`;
  try {
    l = db.prepare(`
      SELECT codification_unite, ue_num, MIN(ue_nom) AS ue_nom, nom_cours, type_cours, MIN(section) AS section,
             SUM(COALESCE(total_attribue_professeur, periodes_attribuees, 0)) AS periodes
      FROM v_attribution_complete v
      WHERE professeur_id = ? AND annee_scolaire = ? ${filtre}
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
  const attrs = attributions(profId, annee, { expert: (cle === 'A1ter' || cle === 'A27') ? true : null });
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

/* EN SÉRIE : plusieurs annexes pour plusieurs membres, dans une archive ZIP —
   un Word par personne et par annexe. L'EA12 (A1 bis) reprend le dernier de
   l'année, et n'en ouvre un (n° 01) que s'il n'y en a aucun. */
// Périodes CC et d'expert d'un membre pour l'année — le statut d'une ligne est
// celui de son exception, sinon celui du membre (même règle que les contrats).
function statutsLignes(id, annee) {
  try {
    return db.prepare(`SELECT
        SUM(CASE WHEN UPPER(COALESCE(a.statut_exception, p.statut, '')) = 'EXP' THEN 0 ELSE 1 END) cc,
        SUM(CASE WHEN UPPER(COALESCE(a.statut_exception, p.statut, '')) = 'EXP' THEN 1 ELSE 0 END) exp
      FROM attribution a JOIN professeur p ON p.id = a.professeur_id
      WHERE a.professeur_id = ? AND a.annee_scolaire = ? AND (a.type_cours IS NULL OR a.type_cours != 'Z')`).get(id, annee) || {};
  } catch { return { cc: 1, exp: 1 }; }
}
r.post('/lot', authRequired, PEUT, async (req, res) => {
  const { professeurs = [], cles = [], annee, mois } = req.body || {};
  if (!professeurs.length || !cles.length) return res.status(400).json({ error: 'Cochez au moins un membre et une pièce.' });
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  let n = 0; const erreurs = [], sansObjet = [];
  for (const id of professeurs.map(Number)) {
    for (const cle of cles) {
      try {
        let buf, nomF;
        const m = membre(id); if (!m) continue;
        /* CHACUN SES PIÈCES : l'EA12 bis porte les périodes CC, l'A1 ter et
           l'A27 celles d'expert. Un Word vide d'attributions ne sert à rien —
           on le dit plutôt que de le glisser dans l'archive. */
        const st = statutsLignes(id, annee);
        if (cle === 'A1bis' && !st.cc) { sansObjet.push(`${m.nom} ${m.prenom} : pas d'EA12 bis (aucune période CC)`); continue; }
        if ((cle === 'A1ter' || cle === 'A27') && !st.exp) { sansObjet.push(`${m.nom} ${m.prenom} : pas de ${cle} (aucune période d'expert)`); continue; }
        if (cle === 'A1bis') {
          const { remplirModeleOfficiel } = await import('../services/ea12_fill_officiel.js');
          const { construireDataEA12 } = await import('./ea12.js');
          // Le dernier EA12 de l'année s'il existe ; sinon on en ouvre un,
          // numéroté comme le ferait « Nouvel EA12 ». Relancer la série ne
          // multiplie donc pas les numéros.
          let row = db.prepare('SELECT * FROM ea12 WHERE professeur_id = ? AND annee_scolaire = ? ORDER BY num_doc DESC LIMIT 1').get(id, annee);
          if (!row) {
            const info = db.prepare(`INSERT INTO ea12 (professeur_id, annee_scolaire, variante, num_doc, donnees_json, cree_par)
              VALUES (?, ?, 'bis', 1, '{}', ?)`).run(id, annee, req.user?.id || null);
            row = db.prepare('SELECT * FROM ea12 WHERE id = ?').get(info.lastInsertRowid);
          }
          const num = row.num_doc;
          buf = await remplirModeleOfficiel(construireDataEA12(row, JSON.parse(row.donnees_json || '{}')));
          nomF = `EA12_${m.nom}_${m.prenom}_${annee}_n${String(num).padStart(2, '0')}.docx`;
        } else {
          const a = ANNEXES.find(z => z.cle === cle); if (!a) continue;
          if (a.mois && !mois) { erreurs.push(`${cle} : choisissez le mois`); continue; }
          buf = await remplirAnnexe(cle, donnees(cle, id, annee, mois));
          nomF = `${cle}_${m.nom}_${m.prenom}_${annee}${a.mois ? '_' + String(mois).padStart(2, '0') : ''}.docx`;
        }
        zip.file(`${m.nom}_${m.prenom}/${nomF}`.replace(/\s+/g, '_'), buf); n++;
      } catch (e) { const m = membre(id); erreurs.push(`${m ? `${m.nom} ${m.prenom}` : id} — ${cle} : ${e.message}`); }
    }
  }
  if (!n) return res.status(400).json({ error: 'Aucune pièce produite.', erreurs: [...sansObjet, ...erreurs] });
  const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const nom = `Pieces_personnel_${annee}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${nom}"`);
  if (erreurs.length || sansObjet.length) res.setHeader('X-Lucie-Erreurs', encodeURIComponent([...sansObjet, ...erreurs].join(' | ')).slice(0, 1500));
  res.end(out);
});

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
