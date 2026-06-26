import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';
import { genererContrat } from '../services/contrat_fill.js';
import { genererApercu } from '../services/contrat_preview.js';

const r = Router();

// ── GET /apercu — prévisualisation HTML ───────────────────────────────────────
r.post('/apercu', authRequired, roleRequired('admin', 'editeur'), async (req, res) => {
  try {
    const { prof_id, date_contrat, annee, representant } = req.body;
    const anneeActive = annee || db.prepare("SELECT code FROM annee_scolaire WHERE active=1").get()?.code || '';
    const prof  = db.prepare('SELECT * FROM professeur WHERE id = ?').get(prof_id);
    if (!prof) return res.status(404).json({ error: 'Professeur introuvable' });
    const etab  = db.prepare('SELECT * FROM etablissement LIMIT 1').get() || {};
    const attributions = db.prepare(`
      SELECT a.periodes_attribuees, a.autonomie_attribuee, a.section, a.code_cours,
             u.ue_nom, c.cours_nom, c.ct_pp, a.type_cours,
             a.en_conge,
             (SELECT p2.nom || ' ' || p2.prenom FROM attribution a2
              JOIN professeur p2 ON p2.id = a2.professeur_id
              WHERE a2.code_cours = a.code_cours AND a2.section = a.section
              AND a2.annee_scolaire = a.annee_scolaire AND a2.en_conge = 1
              LIMIT 1) AS titulaire_en_conge
      FROM attribution a
      LEFT JOIN ue u ON u.ue_num = a.ue_num
      LEFT JOIN cours c ON c.cours_code = a.code_cours AND c.annee_scolaire = a.annee_scolaire
      WHERE a.professeur_id = ? AND a.annee_scolaire = ?
      AND (a.type_cours IS NULL OR a.type_cours != 'Z')
      ORDER BY a.section, a.code_cours
    `).all(prof_id, anneeActive);

    const html = genererApercu({ etab, prof, attributions, annee: anneeActive, date_contrat, representant,
      templateHtml: db.prepare("SELECT valeur FROM lucie_config WHERE cle = 'contrat_template'").get()?.valeur || null,
    });
    res.json({ html, nom: `Contrat_${prof.nom}_${prof.prenom}_${date_contrat||''}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


r.post('/generer', authRequired, roleRequired('admin', 'editeur'), async (req, res) => {
  const { prof_id, date_contrat, annee, representant } = req.body;
  if (!prof_id) return res.status(400).json({ error: 'prof_id requis' });

  const prof = db.prepare('SELECT * FROM professeur WHERE id = ?').get(prof_id);
  if (!prof) return res.status(404).json({ error: 'Professeur introuvable' });

  const etab = db.prepare('SELECT * FROM etablissement WHERE id = 1').get() || {};
  const anneeActive = annee || db.prepare(`SELECT code FROM annee_scolaire WHERE active = 1 LIMIT 1`).get()?.code || '2026-2027';

  // Récupérer les attributions du prof pour l'année
  const attributions = db.prepare(`
    SELECT a.ue_num, a.code_cours, a.section, a.periodes_attribuees, a.autonomie_attribuee,
           u.ue_nom, c.cours_nom, c.ct_pp, a.type_cours
    FROM attribution a
    LEFT JOIN ue   u ON u.ue_num    = a.ue_num    AND u.annee_scolaire = a.annee_scolaire
    LEFT JOIN cours c ON c.cours_code = a.code_cours AND c.annee_scolaire = a.annee_scolaire
    WHERE a.professeur_id = ? AND a.annee_scolaire = ?
      AND (a.type_cours IS NULL OR a.type_cours != 'Z')
    ORDER BY a.section, a.ue_num, a.code_cours
  `).all(prof_id, anneeActive);

  try {
    const docx = await genererContrat({
      etab: { ...etab, etab_abrev: 'IIP' },
      prof,
      attributions,
      annee: anneeActive,
      date_contrat: date_contrat || new Date().toISOString().split('T')[0],
      representant,
    });

    const fn = `Contrat_${prof.nom}_${prof.prenom}_${date_contrat || 'draft'}.docx`
      .replace(/[^a-zA-Z0-9_.-]/g, '_');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${fn}"`);
    res.send(docx);
  } catch (err) {
    console.error('[contrats]', err);
    res.status(500).json({ error: err.message });
  }
});

export default r;
