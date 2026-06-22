/**
 * recrutement.js — Module recrutement (v2 simplifié)
 * Les postes à pourvoir = attributions "À désigner" dans Lucie.
 * Pas de table recrutement_poste — source de vérité = les attributions.
 * Seule table additionnelle : recrutement_candidat + recrutement_candidature.
 */
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';
import multer from 'multer';
import { mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';

const DATA_DIR = process.env.DATA_DIR || '/app/data';

const uploadStorage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = join(DATA_DIR, 'recrutement', 'cv');
    mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safe = (file.originalname || 'cv.pdf').replace(/[^\w.\-]/g, '_');
    cb(null, `${ts}_${safe}`);
  }
});
const upload = multer({ storage: uploadStorage, limits: { fileSize: 20 * 1024 * 1024 } });

const r = Router();
r.use(authRequired);
r.use(roleRequired('admin'));

// ═══════════════════════════════════════════════════════════════════════════════
// POSTES À POURVOIR — directement depuis les attributions "À désigner"
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/recrutement/postes?annee=
// Retourne la liste des cours à pourvoir (groupés par UE+cours+section)
r.get('/postes', (req, res) => {
  const { annee } = req.query;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const aDesignerIds = db.prepare(
    "SELECT id FROM professeur WHERE UPPER(nom) LIKE '%SIGN%'"
  ).all().map(p => p.id);

  const placeholders = aDesignerIds.length
    ? `OR v.professeur_id IN (${aDesignerIds.map(() => '?').join(',')})`
    : '';

  const postes = db.prepare(`
    SELECT
      v.section,
      v.ue_num,
      v.ue_nom,
      v.contrat_mdp,
      v.code_cours,
      v.nom_cours,
      v.type_cours,
      v.bloc,
      u.ue_quad,
      u.ue_per_cours,
      u.ue_aut,
      u.ects,
      u.ue_niv,
      COUNT(*) AS nb_groupes,
      (SELECT COUNT(*) FROM recrutement_candidature rc
       WHERE rc.annee_scolaire = v.annee_scolaire
         AND rc.ue_num = v.ue_num
         AND rc.code_cours = v.code_cours
         AND rc.section = v.section) AS nb_candidats
    FROM v_attribution_complete v
    LEFT JOIN ue u ON u.ue_num = v.ue_num AND u.annee_scolaire = v.annee_scolaire
    WHERE v.annee_scolaire = ?
      AND (v.professeur_id IS NULL ${placeholders})
      AND (v.type_cours IS NULL OR v.type_cours != 'Z')
    GROUP BY v.section, v.ue_num, v.code_cours, v.contrat_mdp
    ORDER BY v.section, v.ue_num, v.code_cours
  `).all(annee, ...aDesignerIds);

  res.json(postes);
});

// GET /api/recrutement/postes/:ue_num/:code_cours/:section?annee=
// Détail d'un poste : infos UE + AA + candidats
r.get('/postes/:ue_num/:code_cours/:section', (req, res) => {
  const { annee } = req.query;
  const { ue_num, code_cours, section } = req.params;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  // Infos UE
  const ue = db.prepare(`
    SELECT u.*, c.cours_nom, c.ct_pp, c.cours_per
    FROM ue u
    LEFT JOIN cours c ON c.ue_num = u.ue_num AND c.annee_scolaire = u.annee_scolaire
                      AND c.cours_code = ?
    WHERE u.ue_num = ? AND u.annee_scolaire = ?
  `).get(code_cours, ue_num, annee);

  // AA de l'UE
  const aa = db.prepare(
    'SELECT aa_code, aa_num, description FROM aa WHERE ue_num = ? ORDER BY aa_num'
  ).all(ue_num);

  // Candidats rattachés
  const candidats = db.prepare(`
    SELECT rc.*, c.nom, c.email, c.telephone, c.cv_path, c.cv_nom, c.cv_url, c.notes
    FROM recrutement_candidature rc
    JOIN recrutement_candidat c ON c.id = rc.candidat_id
    WHERE rc.annee_scolaire = ? AND rc.ue_num = ? AND rc.code_cours = ? AND rc.section = ?
    ORDER BY rc.cree_le DESC
  `).all(annee, ue_num, code_cours, section);

  res.json({ ue, aa, candidats, ue_num, code_cours, section, annee });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CANDIDATS
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/recrutement/candidats — créer un candidat et le rattacher à un poste
r.post('/candidats', (req, res) => {
  const { nom, email, telephone, cv_url, notes, annee, ue_num, code_cours, section } = req.body;
  if (!nom) return res.status(400).json({ error: 'Nom requis' });

  const tx = db.transaction(() => {
    // Créer ou réutiliser le candidat (par email si fourni)
    let cand = email
      ? db.prepare('SELECT id FROM recrutement_candidat WHERE email = ?').get(email)
      : null;
    if (!cand) {
      const info = db.prepare(
        'INSERT INTO recrutement_candidat (nom, email, telephone, cv_url, notes) VALUES (?, ?, ?, ?, ?)'
      ).run(nom, email || null, telephone || null, cv_url || null, notes || null);
      cand = { id: info.lastInsertRowid };
    } else {
      db.prepare('UPDATE recrutement_candidat SET nom=?, telephone=COALESCE(?,telephone), notes=COALESCE(?,notes) WHERE id=?')
        .run(nom, telephone || null, notes || null, cand.id);
    }

    // Rattacher au poste
    if (annee && ue_num && code_cours && section) {
      try {
        db.prepare(`INSERT INTO recrutement_candidature
          (candidat_id, annee_scolaire, ue_num, code_cours, section, statut)
          VALUES (?, ?, ?, ?, ?, 'a_voir')`
        ).run(cand.id, annee, ue_num, code_cours, section);
      } catch (e) {
        if (!String(e.message).includes('UNIQUE')) throw e;
      }
    }
    return cand.id;
  });

  const id = tx();
  res.json({ id });
});

// POST /api/recrutement/candidats/:id/cv — upload CV
r.post('/candidats/:id/cv', upload.single('fichier'), (req, res) => {
  const c = db.prepare('SELECT id, cv_path FROM recrutement_candidat WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Candidat introuvable' });
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });
  if (c.cv_path && existsSync(c.cv_path)) { try { unlinkSync(c.cv_path); } catch {} }
  db.prepare('UPDATE recrutement_candidat SET cv_path = ?, cv_nom = ? WHERE id = ?')
    .run(req.file.path, req.file.originalname, c.id);
  res.json({ ok: true, cv_nom: req.file.originalname });
});

// GET /api/recrutement/candidats/:id/cv — télécharger le CV
r.get('/candidats/:id/cv', (req, res) => {
  const c = db.prepare('SELECT cv_path, cv_nom FROM recrutement_candidat WHERE id = ?').get(req.params.id);
  if (!c || !c.cv_path || !existsSync(c.cv_path)) return res.status(404).json({ error: 'CV introuvable' });
  res.download(c.cv_path, c.cv_nom || 'cv.pdf');
});

// PATCH /api/recrutement/candidatures/:id — mettre à jour statut/notes
r.patch('/candidatures/:id', (req, res) => {
  const { statut, commentaire, note_globale } = req.body;
  db.prepare(`UPDATE recrutement_candidature SET
    statut = COALESCE(?, statut),
    commentaire = ?,
    note_globale = ?,
    modifie_le = datetime('now')
    WHERE id = ?`).run(statut || null, commentaire ?? null, note_globale ?? null, req.params.id);
  res.json({ ok: true });
});

// DELETE /api/recrutement/candidatures/:id
r.delete('/candidatures/:id', (req, res) => {
  db.prepare('DELETE FROM recrutement_candidature WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONTEXTE POUR L'IA (suggestions + annonce)
// ═══════════════════════════════════════════════════════════════════════════════
r.get('/contexte', (req, res) => {
  const { annee, ue_num, section } = req.query;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const ue = ue_num
    ? db.prepare('SELECT * FROM ue WHERE ue_num = ? AND annee_scolaire = ?').get(ue_num, annee)
    : null;
  const cours = ue_num
    ? db.prepare('SELECT cours_nom, ct_pp, cours_per FROM cours WHERE ue_num = ? AND annee_scolaire = ?').all(ue_num, annee)
    : [];
  const aa = ue_num
    ? db.prepare('SELECT aa_code, description FROM aa WHERE ue_num = ? ORDER BY aa_num').all(ue_num)
    : [];

  res.json({ ue, cours, aa, section, annee });
});

export default r;
