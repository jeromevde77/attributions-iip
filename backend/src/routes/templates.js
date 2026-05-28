import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';
import { parse as parseHtml } from 'node-html-parser';

const r = Router();

// ─── CRUD templates ────────────────────────────────────────────────────────

r.get('/', authRequired, (req, res) => {
  res.json(db.prepare(`SELECT id, nom, description, entites, cree_par, cree_le, modifie_le
    FROM document_template ORDER BY modifie_le DESC`).all());
});

r.get('/:id', authRequired, (req, res) => {
  const t = db.prepare('SELECT * FROM document_template WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Template introuvable' });
  res.json(t);
});

r.post('/', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { nom, description, contenu, entites } = req.body;
  if (!nom) return res.status(400).json({ error: 'Nom requis' });
  const info = db.prepare(`INSERT INTO document_template (nom, description, contenu, entites, cree_par)
    VALUES (?,?,?,?,?)`).run(nom, description || null, contenu || '', JSON.stringify(entites || []),
    req.user?.email || req.user?.identifiant || null);
  res.status(201).json({ id: info.lastInsertRowid });
});

r.patch('/:id', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { nom, description, contenu, entites } = req.body;
  const t = db.prepare('SELECT 1 FROM document_template WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Template introuvable' });
  const updates = []; const params = {};
  if (nom        !== undefined) { updates.push('nom = @nom');           params.nom     = nom; }
  if (description!== undefined) { updates.push('description = @desc'); params.desc    = description; }
  if (contenu    !== undefined) { updates.push('contenu = @contenu');   params.contenu = contenu; }
  if (entites    !== undefined) { updates.push('entites = @entites');   params.entites = JSON.stringify(entites); }
  if (!updates.length) return res.status(400).json({ error: 'Rien à modifier' });
  updates.push("modifie_le = datetime('now')");
  db.prepare(`UPDATE document_template SET ${updates.join(', ')} WHERE id = @id`)
    .run({ ...params, id: req.params.id });
  res.json({ ok: true });
});

r.delete('/:id', authRequired, roleRequired('admin'), (req, res) => {
  db.prepare('DELETE FROM document_template WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── Données disponibles dans les boucles ─────────────────────────────────

function fetchBoucleData(boucleType, { prof_id, ue_num, annee }) {
  switch (boucleType) {

    case 'profs_ue': {
      // Tous les profs attribués à une UE (avec leurs cours)
      if (!ue_num || !annee) return [];
      return db.prepare(`
        SELECT a.professeur_id, p.nom, p.prenom,
               (p.nom || ' ' || p.prenom) AS professeur,
               a.code_cours, c.cours_nom, a.type_cours,
               a.periodes_attribuees, a.autonomie_attribuee,
               (COALESCE(a.periodes_attribuees,0)+COALESCE(a.autonomie_attribuee,0)) AS total_attribue_professeur,
               a.section
        FROM attribution a
        LEFT JOIN professeur p ON p.id = a.professeur_id
        LEFT JOIN cours c ON c.cours_code = a.code_cours AND c.annee_scolaire = a.annee_scolaire
        WHERE a.ue_num = ? AND a.annee_scolaire = ? AND a.professeur_id IS NOT NULL
        ORDER BY p.nom, p.prenom, a.code_cours
      `).all(ue_num, annee);
    }

    case 'cours_ue': {
      // Tous les cours d'une UE
      if (!ue_num || !annee) return [];
      return db.prepare(`
        SELECT cours_code, cours_nom, ct_pp, cours_per, cours_autonomie,
               quadrimestre_cours, dedouble, heures
        FROM cours WHERE ue_num = ? AND annee_scolaire = ?
        ORDER BY cours_code
      `).all(ue_num, annee);
    }

    case 'attributions_prof': {
      // Toutes les attributions d'un prof (toutes UE)
      if (!prof_id || !annee) return [];
      return db.prepare(`
        SELECT a.ue_num, u.ue_nom, a.code_cours, c.cours_nom AS nom_cours,
               a.type_cours, a.periodes_attribuees, a.autonomie_attribuee,
               (COALESCE(a.periodes_attribuees,0)+COALESCE(a.autonomie_attribuee,0)) AS total_attribue_professeur,
               a.section, a.quadrimestre_attribue
        FROM attribution a
        LEFT JOIN ue u ON u.ue_num = a.ue_num AND u.annee_scolaire = a.annee_scolaire
        LEFT JOIN cours c ON c.cours_code = a.code_cours AND c.annee_scolaire = a.annee_scolaire
        WHERE a.professeur_id = ? AND a.annee_scolaire = ?
        ORDER BY a.section, a.ue_num, a.code_cours
      `).all(prof_id, annee);
    }

    case 'profs_section': {
      // Tous les profs d'une section (unique, triés)
      if (!annee) return [];
      const section = ue_num; // réutilisation du paramètre pour la section
      return db.prepare(`
        SELECT DISTINCT p.id, p.nom, p.prenom, (p.nom||' '||p.prenom) AS professeur,
               p.statut, p.adresse_mail
        FROM attribution a
        JOIN professeur p ON p.id = a.professeur_id
        WHERE a.annee_scolaire = ? ${section ? 'AND a.section = ?' : ''}
        ORDER BY p.nom, p.prenom
      `).all(...(section ? [annee, section] : [annee]));
    }

    default:
      return [];
  }
}

// ─── Génération : substitution des champs + expansion des boucles ───────────
r.post('/:id/generer', authRequired, async (req, res) => {
  const t = db.prepare('SELECT * FROM document_template WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Template introuvable' });

  const { prof_id, ue_num, annee } = req.body;
  const ctx = { prof_id, ue_num, annee: annee || '2025-2026' };

  // ── 1. Construire le dictionnaire de substitution simple ─────────────────
  const vars = {};

  const etab = db.prepare('SELECT * FROM etablissement WHERE id = 1').get() || {};
  Object.entries(etab).forEach(([k, v]) => { vars[`etab.${k}`] = v ?? ''; });

  if (prof_id) {
    const p = db.prepare('SELECT * FROM professeur WHERE id = ?').get(prof_id) || {};
    Object.entries(p).forEach(([k, v]) => { vars[`prof.${k}`] = v ?? ''; });
    vars['prof.lieu_naissance'] = [p.lieu_naissance_ville, p.lieu_naissance_pays].filter(Boolean).join(', ');
    vars['prof.domicile'] = [p.adresse_rue, [p.code_postal, p.commune].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    vars['prof.nom_prenom'] = `${p.nom || ''} ${p.prenom || ''}`.trim();
  }

  if (ue_num && ctx.annee) {
    const u = db.prepare('SELECT * FROM ue WHERE ue_num = ? AND annee_scolaire = ?').get(ue_num, ctx.annee) || {};
    Object.entries(u).forEach(([k, v]) => { vars[`ue.${k}`] = v ?? ''; });
  }

  const now = new Date();
  vars['sys.date']     = now.toLocaleDateString('fr-BE');
  vars['sys.annee']    = ctx.annee;
  vars['sys.date_iso'] = now.toISOString().split('T')[0];

  // ── 2. Substitution des champs simples ───────────────────────────────────
  let html = t.contenu;
  for (const [key, val] of Object.entries(vars)) {
    html = html.replaceAll(`{{${key}}}`, String(val));
  }

  // ── 3. Expansion des blocs de boucle ─────────────────────────────────────
  try {
    const root = parseHtml(html, { lowerCaseTagName: false, comment: true });
    const boucleBlocks = root.querySelectorAll('[data-boucle]');

    for (const block of boucleBlocks) {
      const boucleType = block.getAttribute('data-boucle');
      const template   = block.innerHTML;                      // contenu d'une itération
      const rows       = fetchBoucleData(boucleType, ctx);

      if (!rows.length) {
        // Aucune donnée → message vide
        block.replaceWith('<p style="color:#999;font-style:italic">(aucune donnée)</p>');
        continue;
      }

      // Pour chaque ligne, substituer {{item.xxx}} par la valeur réelle
      const expanded = rows.map(row => {
        let rowHtml = template;
        for (const [key, val] of Object.entries(row)) {
          rowHtml = rowHtml.replaceAll(`{{item.${key}}}`, String(val ?? ''));
        }
        // Champs item non résolus → vide
        rowHtml = rowHtml.replace(/\{\{item\.[^}]+\}\}/g, '');
        return rowHtml;
      }).join('\n');

      block.replaceWith(expanded);
    }

    html = root.toString();
  } catch (parseErr) {
    console.error('[generer] erreur expansion boucles :', parseErr.message);
  }

  // ── 4. Champs simples non résolus → placeholder jaune ────────────────────
  html = html.replace(/\{\{[^}]+\}\}/g, '<span style="background:#fff3cd;padding:0 2px">___</span>');

  res.json({ html, nom: t.nom });
});

export default r;
