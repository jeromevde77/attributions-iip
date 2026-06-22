/**
 * recrutement.js — Module recrutement
 * Postes à pourvoir, candidats, grille de questions par poste, évaluations d'entretien.
 * Toutes les routes nécessitent authRequired.
 */
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import multer from 'multer';
import { mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { genererAppelCandidature } from '../services/appel_candidature.js';

const DATA_DIR = process.env.DATA_DIR || '/app/data';

// Multer : stockage des CV sous DATA_DIR/recrutement/<poste|candidat>/
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

// ═══════════════════════ POSTES ═══════════════════════

// Liste des postes (avec compteur de candidats)
r.get('/postes', (req, res) => {
  const { annee, statut } = req.query;
  let sql = `
    SELECT p.*,
      (SELECT COUNT(*) FROM recrutement_candidature c WHERE c.poste_id = p.id) AS nb_candidats
    FROM recrutement_poste p WHERE 1=1`;
  const args = [];
  if (annee)  { sql += ' AND p.annee_scolaire = ?'; args.push(annee); }
  if (statut) { sql += ' AND p.statut = ?'; args.push(statut); }
  sql += ' ORDER BY p.cree_le DESC';
  res.json(db.prepare(sql).all(...args));
});

// Détail d'un poste : poste + questions + candidatures (avec infos candidat)
r.get('/postes/:id', (req, res) => {
  try {
    const poste = db.prepare('SELECT * FROM recrutement_poste WHERE id = ?').get(req.params.id);
    if (!poste) return res.status(404).json({ error: 'Poste introuvable' });
    const questions = db.prepare('SELECT * FROM recrutement_question WHERE poste_id = ? ORDER BY ordre, id').all(poste.id);
    const candidatures = db.prepare(`
      SELECT c.*, cand.nom, cand.email, cand.telephone, cand.cv_path, cand.cv_nom, cand.cv_url
      FROM recrutement_candidature c
      JOIN recrutement_candidat cand ON cand.id = c.candidat_id
      WHERE c.poste_id = ?
      ORDER BY (c.note_globale IS NULL), c.note_globale DESC, cand.nom
    `).all(poste.id);
    res.json({ ...poste, questions, candidatures });
  } catch (e) {
    console.error('[recrutement GET /postes/:id]', e.message);
    res.status(500).json({ error: e.message });
  }
});

r.post('/postes', (req, res) => {
  const { intitule, section, contrat, ue_num, cours_nom, description, statut, annee_scolaire,
          fonction, charge_periodes, prise_de_fonction } = req.body;
  if (!intitule) return res.status(400).json({ error: 'Intitulé requis' });
  const info = db.prepare(`
    INSERT INTO recrutement_poste
      (intitule, section, contrat, ue_num, cours_nom, description, statut, annee_scolaire, cree_par,
       fonction, charge_periodes, prise_de_fonction)
    VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, 'ouvert'), ?, ?, ?, ?, ?)
  `).run(intitule, section || null, contrat || null, ue_num || null, cours_nom || null,
         description || null, statut || null, annee_scolaire || null, req.user?.email || null,
         fonction || null, charge_periodes || null, prise_de_fonction || null);
  res.json({ id: info.lastInsertRowid });
});

r.patch('/postes/:id', (req, res) => {
  const p = db.prepare('SELECT id FROM recrutement_poste WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Poste introuvable' });
  const { intitule, section, contrat, ue_num, cours_nom, description, statut, annee_scolaire,
          fonction, charge_periodes, prise_de_fonction } = req.body;
  db.prepare(`UPDATE recrutement_poste SET
    intitule = COALESCE(?, intitule), section = ?, contrat = ?, ue_num = ?, cours_nom = ?,
    description = ?, statut = COALESCE(?, statut), annee_scolaire = ?,
    fonction = ?, charge_periodes = ?, prise_de_fonction = ?
    WHERE id = ?`).run(intitule ?? null, section ?? null, contrat ?? null, ue_num ?? null, cours_nom ?? null,
       description ?? null, statut ?? null, annee_scolaire ?? null,
       fonction ?? null, charge_periodes ?? null, prise_de_fonction ?? null, p.id);
  res.json({ ok: true });
});

r.delete('/postes/:id', (req, res) => {
  db.prepare('DELETE FROM recrutement_poste WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Génération du document "Appel à candidature" (docx) ──────────────────────
r.post('/postes/:id/appel', async (req, res) => {
  const poste = db.prepare('SELECT * FROM recrutement_poste WHERE id = ?').get(req.params.id);
  if (!poste) return res.status(404).json({ error: 'Poste introuvable' });

  const { contenuSynthetique, profil } = req.body; // textes générés par l'IA (optionnels)

  // Si ue_num, récupérer le nom complet de l'UE depuis la DB
  let coursNom = poste.cours_nom;
  if (!coursNom && poste.ue_num && poste.annee_scolaire) {
    const ue = db.prepare('SELECT ue_nom FROM ue WHERE ue_num = ? AND annee_scolaire = ?')
                 .get(poste.ue_num, poste.annee_scolaire);
    if (ue) coursNom = ue.ue_nom;
  }

  try {
    const buffer = await genererAppelCandidature({
      section:            poste.section,
      fonction:           poste.fonction,
      chargePeriodes:     poste.charge_periodes,
      coursNom:           coursNom,
      contenuSynthetique: contenuSynthetique || null,
      profil:             profil || null,
      priseDeFonction:    poste.prise_de_fonction,
      intitule:           poste.intitule,
    });

    const section = (poste.section || 'IIP').replace(/[^\w]/g, '_');
    const today   = new Date().toISOString().slice(0, 10);
    const nom     = `Appel_candidature_${section}_${today}.docx`;

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${nom}"`,
    });
    res.send(buffer);
  } catch (e) {
    console.error('[appel candidature]', e);
    res.status(500).json({ error: 'Erreur génération document : ' + e.message });
  }
});

// ═══════════════════════ QUESTIONS (grille par poste) ═══════════════════════

// Remplace toute la grille de questions d'un poste (envoi du tableau complet)
r.put('/postes/:id/questions', (req, res) => {
  const p = db.prepare('SELECT id FROM recrutement_poste WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Poste introuvable' });
  const questions = Array.isArray(req.body.questions) ? req.body.questions : [];
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM recrutement_question WHERE poste_id = ?').run(p.id);
    const ins = db.prepare('INSERT INTO recrutement_question (poste_id, libelle, ordre, ponderation) VALUES (?, ?, ?, ?)');
    questions.forEach((q, i) => {
      if (q && q.libelle && q.libelle.trim()) ins.run(p.id, q.libelle.trim(), q.ordre ?? i, q.ponderation ?? 1.0);
    });
  });
  tx();
  res.json(db.prepare('SELECT * FROM recrutement_question WHERE poste_id = ? ORDER BY ordre, id').all(p.id));
});

// ═══════════════════════ CANDIDATS ═══════════════════════

// Liste de tous les candidats (avec leurs candidatures résumées)
r.get('/candidats', (req, res) => {
  const candidats = db.prepare('SELECT * FROM recrutement_candidat ORDER BY nom').all();
  const cands = db.prepare(`
    SELECT c.candidat_id, c.poste_id, c.statut, c.note_globale, p.intitule AS poste_intitule
    FROM recrutement_candidature c JOIN recrutement_poste p ON p.id = c.poste_id
  `).all();
  const parCand = {};
  for (const c of cands) (parCand[c.candidat_id] ||= []).push(c);
  res.json(candidats.map(cd => ({ ...cd, candidatures: parCand[cd.id] || [] })));
});

r.post('/candidats', (req, res) => {
  const { nom, email, telephone, cv_url, notes } = req.body;
  if (!nom) return res.status(400).json({ error: 'Nom requis' });
  const info = db.prepare(`
    INSERT INTO recrutement_candidat (nom, email, telephone, cv_url, notes)
    VALUES (?, ?, ?, ?, ?)`).run(nom, email || null, telephone || null, cv_url || null, notes || null);
  res.json({ id: info.lastInsertRowid });
});

r.patch('/candidats/:id', (req, res) => {
  const c = db.prepare('SELECT id FROM recrutement_candidat WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Candidat introuvable' });
  const { nom, email, telephone, cv_url, notes } = req.body;
  db.prepare(`UPDATE recrutement_candidat SET
    nom = COALESCE(?, nom), email = ?, telephone = ?, cv_url = ?, notes = ?
    WHERE id = ?`).run(nom ?? null, email ?? null, telephone ?? null, cv_url ?? null, notes ?? null, c.id);
  res.json({ ok: true });
});

r.delete('/candidats/:id', (req, res) => {
  const c = db.prepare('SELECT cv_path FROM recrutement_candidat WHERE id = ?').get(req.params.id);
  if (c?.cv_path && existsSync(c.cv_path)) { try { unlinkSync(c.cv_path); } catch {} }
  db.prepare('DELETE FROM recrutement_candidat WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Upload du CV (PDF) d'un candidat
r.post('/candidats/:id/cv', upload.single('fichier'), (req, res) => {
  const c = db.prepare('SELECT id, cv_path FROM recrutement_candidat WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Candidat introuvable' });
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });
  // Supprimer l'ancien CV si présent
  if (c.cv_path && existsSync(c.cv_path)) { try { unlinkSync(c.cv_path); } catch {} }
  db.prepare('UPDATE recrutement_candidat SET cv_path = ?, cv_nom = ? WHERE id = ?')
    .run(req.file.path, req.file.originalname, c.id);
  res.json({ ok: true, cv_nom: req.file.originalname });
});

// Téléchargement du CV
r.get('/candidats/:id/cv', (req, res) => {
  const c = db.prepare('SELECT cv_path, cv_nom FROM recrutement_candidat WHERE id = ?').get(req.params.id);
  if (!c || !c.cv_path || !existsSync(c.cv_path)) return res.status(404).json({ error: 'CV introuvable' });
  res.download(c.cv_path, c.cv_nom || 'cv.pdf');
});

// ═══════════════════════ CANDIDATURES (lien candidat ↔ poste + évaluation) ═══════════════════════

// Rattacher un candidat à un poste
r.post('/candidatures', (req, res) => {
  const { candidat_id, poste_id } = req.body;
  if (!candidat_id || !poste_id) return res.status(400).json({ error: 'candidat_id et poste_id requis' });
  try {
    const info = db.prepare(`
      INSERT INTO recrutement_candidature (candidat_id, poste_id) VALUES (?, ?)`).run(candidat_id, poste_id);
    res.json({ id: info.lastInsertRowid });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Ce candidat est déjà rattaché à ce poste' });
    throw e;
  }
});

// Mettre à jour l'évaluation d'une candidature
r.patch('/candidatures/:id', (req, res) => {
  const c = db.prepare('SELECT id FROM recrutement_candidature WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Candidature introuvable' });
  const { statut, note_globale, commentaire, date_entretien, reponses } = req.body;
  db.prepare(`UPDATE recrutement_candidature SET
    statut = COALESCE(?, statut),
    note_globale = ?,
    commentaire = ?,
    date_entretien = ?,
    reponses_json = ?,
    modifie_le = datetime('now')
    WHERE id = ?`).run(
      statut ?? null,
      note_globale ?? null,
      commentaire ?? null,
      date_entretien ?? null,
      reponses != null ? JSON.stringify(reponses) : null,
      c.id);
  res.json({ ok: true });
});

r.delete('/candidatures/:id', (req, res) => {
  db.prepare('DELETE FROM recrutement_candidature WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Attributions "À désigner" — source naturelle des postes à recruter ────────
r.get('/a-designer', (req, res) => {
  const { annee } = req.query;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const lignes = db.prepare(`
    SELECT
      v.section, v.ue_num, v.ue_nom, v.contrat_mdp,
      v.code_cours, v.nom_cours, v.type_cours,
      u.ue_per_cours, u.ue_aut, u.ue_tot_prf, u.ects,
      COUNT(*) AS nb_groupes_adesigner
    FROM v_attribution_complete v
    LEFT JOIN ue u ON u.ue_num = v.ue_num AND u.annee_scolaire = v.annee_scolaire
    WHERE v.annee_scolaire = ? AND v.professeur_id IS NULL
      AND (v.type_cours IS NULL OR v.type_cours != 'Z')
    GROUP BY v.section, v.ue_num, v.code_cours, v.contrat_mdp
    ORDER BY v.section, v.ue_num, v.code_cours
  `).all(annee);

  res.json(lignes);
});
r.get('/suggestions/contexte', (req, res) => {
  const { annee, section, ue_num } = req.query;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const ue = ue_num
    ? db.prepare('SELECT ue_num, ue_nom, ue_niv, ects, ue_quad, et_ref FROM ue WHERE ue_num = ? AND annee_scolaire = ?').get(ue_num, annee)
    : null;

  let cours = [];
  if (ue_num) {
    cours = db.prepare('SELECT cours_nom, ct_pp, cours_per FROM cours WHERE ue_num = ? AND annee_scolaire = ? ORDER BY cours_nom').all(ue_num, annee);
  } else if (section) {
    cours = db.prepare('SELECT cours_nom, ct_pp, cours_per FROM cours WHERE section = ? AND annee_scolaire = ? ORDER BY cours_nom LIMIT 40').all(section, annee);
  }

  const ues = section
    ? db.prepare('SELECT ue_num, ue_nom, ue_niv, ects FROM ue WHERE section = ? AND annee_scolaire = ? ORDER BY ue_num').all(section, annee)
    : [];

  // Acquis d'apprentissage de l'UE ciblée (ou de toutes les UE de la section si pas d'UE précisée)
  let aa = [];
  if (ue_num) {
    aa = db.prepare('SELECT aa_code, aa_num, description FROM aa WHERE ue_num = ? ORDER BY aa_num').all(ue_num);
  } else if (section && ues.length) {
    const ids = ues.map(u => u.ue_num);
    const placeholders = ids.map(() => '?').join(',');
    aa = db.prepare(`SELECT aa.aa_code, aa.aa_num, aa.ue_num, aa.description FROM aa WHERE aa.ue_num IN (${placeholders}) ORDER BY aa.ue_num, aa.aa_num LIMIT 60`).all(...ids);
  }

  res.json({ ue, cours, ues, aa, section: section || null, annee });
});

export default r;
