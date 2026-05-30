import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';
import { parse as parseHtml } from 'node-html-parser';
import { LOGO_IIP_HTML } from '../services/assets/logo_iip.js';

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
  if (!db.prepare('SELECT 1 FROM document_template WHERE id = ?').get(req.params.id))
    return res.status(404).json({ error: 'Template introuvable' });
  const updates = []; const params = {};
  if (nom        !== undefined) { updates.push('nom=@nom');           params.nom     = nom; }
  if (description!== undefined) { updates.push('description=@desc'); params.desc    = description; }
  if (contenu    !== undefined) { updates.push('contenu=@contenu');   params.contenu = contenu; }
  if (entites    !== undefined) { updates.push('entites=@entites');   params.entites = JSON.stringify(entites); }
  if (!updates.length) return res.status(400).json({ error: 'Rien à modifier' });
  updates.push("modifie_le=datetime('now')");
  db.prepare(`UPDATE document_template SET ${updates.join(',')} WHERE id=@id`).run({...params,id:req.params.id});
  res.json({ ok: true });
});
r.delete('/:id', authRequired, roleRequired('admin'), (req, res) => {
  db.prepare('DELETE FROM document_template WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── Génération du tableau hiérarchique section (resume_section) ───────────
function genererResumeSection(section, annee) {
  if (!section) return '<p style="color:red;font-style:italic">⚠ Sélectionnez une section avant de générer.</p>';

  // UEs de la section (via ue_section ou section principale)
  const ues = db.prepare(`
    SELECT DISTINCT u.ue_num, u.ue_nom, u.ue_per_etudiants, u.ue_aut, u.ue_per_z,
                    u.ue_quad, u.ue_niv, u.ue_niveau, u.ects
    FROM ue u
    LEFT JOIN ue_section us ON us.ue_num = u.ue_num AND us.annee_scolaire = u.annee_scolaire
    WHERE u.annee_scolaire = ?
      AND (us.section_code = ? OR u.section = ?)
    ORDER BY u.ue_num
  `).all(annee, section, section);

  if (!ues.length) return `<p style="color:#888;font-style:italic">Aucune UE pour la section ${section} (${annee}).</p>`;

  let totalUesPerProf = 0, totalUesPerEtud = 0;

  let rows = '';
  for (const ue of ues) {
    const cours = db.prepare(`
      SELECT cours_code, cours_nom, ct_pp, cours_per, cours_autonomie, dedouble, quadrimestre_cours
      FROM cours WHERE ue_num = ? AND annee_scolaire = ?
      ORDER BY cours_code
    `).all(ue.ue_num, annee);

    // Calcul totaux prof (avec dédoublement)
    let totalProfUe = 0;
    for (const c of cours) {
      const fac = c.dedouble === 'O' ? 2 : 1;
      totalProfUe += (Number(c.cours_per) || 0) * fac;
      totalProfUe += (Number(c.cours_autonomie) || 0) * fac;
    }
    const perEtudUe = Number(ue.ue_per_etudiants) || 0;
    totalUesPerProf += totalProfUe;
    totalUesPerEtud += perEtudUe;

    // Ligne UE
    rows += `
      <tr style="background:#d6eaf8;">
        <td style="padding:6px 8px;border:1px solid #bbb;font-weight:bold;color:#154360">
          <strong>UE ${ue.ue_num}</strong> — ${ue.ue_nom}
          ${ue.ue_niv ? `<span style="font-size:9pt;color:#555;font-weight:normal"> · Bloc ${ue.ue_niv}</span>` : ''}
        </td>
        <td style="padding:6px;border:1px solid #bbb;text-align:center;color:#555">${ue.ue_quad || '—'}</td>
        <td style="padding:6px;border:1px solid #bbb;text-align:center;color:#555">${ue.ects ? ue.ects + ' ECTS' : '—'}</td>
        <td style="padding:6px;border:1px solid #bbb;text-align:right;font-weight:bold;color:#154360">${totalProfUe || '—'}</td>
        <td style="padding:6px;border:1px solid #bbb;text-align:right;font-weight:bold;color:#7d6608">${perEtudUe || '—'}</td>
      </tr>`;

    // Lignes cours
    for (const c of cours) {
      const fac = c.dedouble === 'O' ? 2 : 1;
      const perProf = ((Number(c.cours_per) || 0) * fac) + ((Number(c.cours_autonomie) || 0) * fac);
      const perEtud = (Number(c.cours_per) || 0) * fac; // périodes étudiant = périodes de cours
      rows += `
        <tr style="background:#ffffff;">
          <td style="padding:4px 8px 4px 28px;border:1px solid #ddd;color:#444;font-size:9.5pt">
            ↳ <span style="color:#888">${c.cours_code}</span> — ${c.cours_nom}
            ${c.ct_pp ? `<span style="background:#eee;border-radius:3px;padding:1px 4px;font-size:8pt;margin-left:4px">${c.ct_pp}</span>` : ''}
            ${c.dedouble === 'O' ? '<span style="background:#fff3cd;border-radius:3px;padding:1px 4px;font-size:8pt;margin-left:4px">×2</span>' : ''}
          </td>
          <td style="padding:4px;border:1px solid #ddd;text-align:center;color:#888;font-size:9pt">${c.quadrimestre_cours || '—'}</td>
          <td style="padding:4px;border:1px solid #ddd;text-align:center;color:#888;font-size:9pt"></td>
          <td style="padding:4px;border:1px solid #ddd;text-align:right;color:#555">${perProf || '—'}</td>
          <td style="padding:4px;border:1px solid #ddd;text-align:right;color:#666">${perEtud || '—'}</td>
        </tr>`;
    }

    // Ligne autonomie si ue_aut
    if (ue.ue_aut) {
      rows += `
        <tr style="background:#fdfefe;">
          <td style="padding:4px 8px 4px 28px;border:1px solid #ddd;color:#888;font-size:9pt;font-style:italic">
            ↳ Part d'autonomie (7.2)
          </td>
          <td style="border:1px solid #ddd"></td>
          <td style="border:1px solid #ddd"></td>
          <td style="padding:4px;border:1px solid #ddd;text-align:right;color:#888;font-style:italic">${ue.ue_aut}</td>
          <td style="padding:4px;border:1px solid #ddd;text-align:right;color:#888;font-style:italic">${ue.ue_aut}</td>
        </tr>`;
    }
    if (ue.ue_per_z) {
      rows += `
        <tr style="background:#fdfefe;">
          <td style="padding:4px 8px 4px 28px;border:1px solid #ddd;color:#9b59b6;font-size:9pt;font-style:italic">
            ↳ Activités Z (7.3)
          </td>
          <td style="border:1px solid #ddd"></td>
          <td style="border:1px solid #ddd"></td>
          <td style="padding:4px;border:1px solid #ddd;text-align:right;color:#9b59b6">0</td>
          <td style="padding:4px;border:1px solid #ddd;text-align:right;color:#9b59b6">${ue.ue_per_z}</td>
        </tr>`;
    }
  }

  // Ligne total général
  const ligneTotal = `
    <tr style="background:#1a5276;color:white;font-weight:bold">
      <td style="padding:8px;border:1px solid #444" colspan="3">TOTAL SECTION ${section}</td>
      <td style="padding:8px;border:1px solid #444;text-align:right">${totalUesPerProf}</td>
      <td style="padding:8px;border:1px solid #444;text-align:right">${totalUesPerEtud}</td>
    </tr>`;

  return `
    <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:10pt">
      <thead>
        <tr style="background:#1a5276;color:white">
          <th style="text-align:left;padding:8px;border:1px solid #ccc">Unité d'enseignement / Cours</th>
          <th style="padding:8px;border:1px solid #ccc;text-align:center;white-space:nowrap">Quadri</th>
          <th style="padding:8px;border:1px solid #ccc;text-align:center;white-space:nowrap">ECTS</th>
          <th style="padding:8px;border:1px solid #ccc;text-align:right;white-space:nowrap">Pér. Prof.</th>
          <th style="padding:8px;border:1px solid #ccc;text-align:right;white-space:nowrap">Pér. Étud. DP</th>
        </tr>
      </thead>
      <tbody>${rows}${ligneTotal}</tbody>
    </table>`;
}

// ─── Données des autres boucles ────────────────────────────────────────────
function fetchBoucleData(boucleType, ctx) {
  const { prof_id, ue_num, section, annee } = ctx;
  switch (boucleType) {
    case 'profs_ue': {
      if (!ue_num || !annee) return [];
      return db.prepare(`
        SELECT a.professeur_id, p.nom, p.prenom, (p.nom||' '||p.prenom) AS professeur,
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
      if (!ue_num || !annee) return [];
      return db.prepare(`SELECT cours_code, cours_nom, ct_pp, cours_per, cours_autonomie,
               quadrimestre_cours, dedouble, heures FROM cours
        WHERE ue_num = ? AND annee_scolaire = ? ORDER BY cours_code`).all(ue_num, annee);
    }
    case 'attributions_prof': {
      if (!prof_id || !annee) return [];
      return db.prepare(`
        SELECT a.ue_num, u.ue_nom, a.code_cours, c.cours_nom AS nom_cours, a.type_cours,
               a.periodes_attribuees, a.autonomie_attribuee,
               (COALESCE(a.periodes_attribuees,0)+COALESCE(a.autonomie_attribuee,0)) AS total_attribue_professeur,
               a.section, a.quadrimestre_attribue
        FROM attribution a
        LEFT JOIN ue u ON u.ue_num = a.ue_num AND u.annee_scolaire = a.annee_scolaire
        LEFT JOIN cours c ON c.cours_code = a.code_cours AND c.annee_scolaire = a.annee_scolaire
        WHERE a.professeur_id = ? AND a.annee_scolaire = ?
        ORDER BY a.section, a.ue_num, a.code_cours
      `).all(prof_id, annee);
    }
    default: return [];
  }
}

// ─── Génération ────────────────────────────────────────────────────────────
r.post('/:id/generer', authRequired, async (req, res) => {
  const t = db.prepare('SELECT * FROM document_template WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Template introuvable' });

  const { prof_id, ue_num, section, annee } = req.body;
  const ctx = { prof_id, ue_num, section, annee: annee || '2025-2026' };

  // ── 1. Variables simples ─────────────────────────────────────────────────
  const vars = {};
  const etab = db.prepare('SELECT * FROM etablissement WHERE id = 1').get() || {};
  Object.entries(etab).forEach(([k,v]) => { vars[`etab.${k}`] = v ?? ''; });
  if (prof_id) {
    const p = db.prepare('SELECT * FROM professeur WHERE id = ?').get(prof_id) || {};
    Object.entries(p).forEach(([k,v]) => { vars[`prof.${k}`] = v ?? ''; });
    vars['prof.lieu_naissance'] = [p.lieu_naissance_ville, p.lieu_naissance_pays].filter(Boolean).join(', ');
    vars['prof.domicile'] = [p.adresse_rue, [p.code_postal, p.commune].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    vars['prof.nom_prenom'] = `${p.nom||''} ${p.prenom||''}`.trim();
    // Date formatée JJ/MM/AAAA pour le contrat
    if (p.date_naissance) {
      const [y,m,d] = String(p.date_naissance).split('-');
      vars['prof.date_naissance_fr'] = y ? `${d}/${m}/${y}` : p.date_naissance;
    } else {
      vars['prof.date_naissance_fr'] = '';
    }
    // Champs additionnels etab utiles pour le contrat
    vars['etab.gest_nom_prenom'] = `${etab.gest_prenom||''} ${etab.gest_nom||''}`.trim();
  }
  if (ue_num && ctx.annee) {
    const u = db.prepare('SELECT * FROM ue WHERE ue_num = ? AND annee_scolaire = ?').get(ue_num, ctx.annee) || {};
    Object.entries(u).forEach(([k,v]) => { vars[`ue.${k}`] = v ?? ''; });
  }
  // Logo IIP
  vars['etab.logo']    = LOGO_IIP_HTML;
  vars['etab.logo_sm'] = LOGO_IIP_HTML.replace('height:60px', 'height:40px');
  vars['sys.annee']    = ctx.annee;
  vars['sys.date_iso'] = now.toISOString().split('T')[0];
  vars['sys.section']  = section || '';

  let html = t.contenu;
  for (const [key, val] of Object.entries(vars)) html = html.replaceAll(`{{${key}}}`, String(val));

  // ── 2a. Champ spécial : tableau des attributions du prof (pour le contrat) ─
  if (prof_id && html.includes('{{contrat.table_attributions}}')) {
    const rows = db.prepare(`
      SELECT a.ue_num, a.code_cours, a.section, a.periodes_attribuees, a.autonomie_attribuee,
             u.ue_nom, c.cours_nom, c.ct_pp
      FROM attribution a
      LEFT JOIN ue   u ON u.ue_num     = a.ue_num     AND u.annee_scolaire = a.annee_scolaire
      LEFT JOIN cours c ON c.cours_code = a.code_cours AND c.annee_scolaire = a.annee_scolaire
      WHERE a.professeur_id = ? AND a.annee_scolaire = ?
        AND (a.type_cours IS NULL OR a.type_cours != 'Z')
      ORDER BY a.section, a.ue_num, a.code_cours
    `).all(prof_id, ctx.annee);
    const total = rows.reduce((s,r) => s+(r.periodes_attribuees||0)+(r.autonomie_attribuee||0), 0);
    const lignes = rows.map((r,i) => `
      <tr style="background:${i%2===0?'#f9f9f9':'white'}">
        <td style="padding:4px 8px;border:1px solid #ccc">${r.section||''}</td>
        <td style="padding:4px 8px;border:1px solid #ccc;text-align:center">${r.ue_num||''}</td>
        <td style="padding:4px 8px;border:1px solid #ccc">${r.ue_nom||''}</td>
        <td style="padding:4px 8px;border:1px solid #ccc;text-align:center">${r.ct_pp||''}</td>
        <td style="padding:4px 8px;border:1px solid #ccc">${r.cours_nom||''}</td>
        <td style="padding:4px 8px;border:1px solid #ccc;text-align:right">${r.periodes_attribuees||0}</td>
        <td style="padding:4px 8px;border:1px solid #ccc;text-align:right">${r.autonomie_attribuee||0}</td>
        <td style="padding:4px 8px;border:1px solid #ccc;text-align:right;font-weight:bold">${(r.periodes_attribuees||0)+(r.autonomie_attribuee||0)}</td>
      </tr>`).join('');
    const tableau = `<table style="width:100%;border-collapse:collapse;font-size:10pt;margin:8px 0">
      <thead><tr style="background:#1F3864;color:white">
        <th style="padding:5px 8px;border:1px solid #ccc;text-align:left">Section</th>
        <th style="padding:5px 8px;border:1px solid #ccc">N° UE</th>
        <th style="padding:5px 8px;border:1px solid #ccc;text-align:left">Nom de l'UE</th>
        <th style="padding:5px 8px;border:1px solid #ccc">Type</th>
        <th style="padding:5px 8px;border:1px solid #ccc;text-align:left">Cours</th>
        <th style="padding:5px 8px;border:1px solid #ccc">Pér.</th>
        <th style="padding:5px 8px;border:1px solid #ccc">Aut.</th>
        <th style="padding:5px 8px;border:1px solid #ccc">Total</th>
      </tr></thead>
      <tbody>${lignes || '<tr><td colspan="8" style="padding:6px;font-style:italic;text-align:center">Aucune attribution pour cette année</td></tr>'}</tbody>
      <tfoot><tr style="background:#e8e8e8">
        <td colspan="7" style="padding:5px 8px;border:1px solid #ccc;text-align:right;font-weight:bold">TOTAL PÉRIODES</td>
        <td style="padding:5px 8px;border:1px solid #ccc;text-align:right;font-weight:bold">${total}</td>
      </tr></tfoot>
    </table>`;
    html = html.replaceAll('{{contrat.table_attributions}}', tableau);
  }
  // TipTap génère par ex. : <p><strong>{{#profs_ue}}</strong>  ← Pour chaque prof...</p>
  // Le regex les trouve dans le HTML et les expande.
  try {
    const marqueurRe = /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
    html = html.replace(marqueurRe, (_, type, templateBrut) => {
      if (type === 'resume_section') return genererResumeSection(section, ctx.annee);
      const rows = fetchBoucleData(type, ctx);
      if (!rows.length) return '<p style="color:#999;font-style:italic">(aucune donnée pour cette boucle)</p>';
      return rows.map(row => {
        let rh = templateBrut;
        for (const [k, v] of Object.entries(row)) rh = rh.replaceAll(`{{item.${k}}}`, String(v ?? ''));
        return rh.replace(/\{\{item\.[^}]+\}\}/g, '');
      }).join('');
    });
  } catch (e) { console.error('[generer] marqueurs texte :', e.message); }

  // ── 2b. Blocs data-boucle (ancienne approche TipTap node) ────────────────
  try {
    const root = parseHtml(html, { lowerCaseTagName: false });
    const blocks = root.querySelectorAll('[data-boucle]');

    for (const block of blocks) {
      const type = block.getAttribute('data-boucle');

      if (type === 'resume_section') {
        // Bloc spécial : génère le tableau hiérarchique complet
        block.replaceWith(genererResumeSection(section, ctx.annee));
        continue;
      }

      // Boucles standards (profs_ue, cours_ue, attributions_prof)
      const template = block.innerHTML;
      const rows = fetchBoucleData(type, ctx);
      if (!rows.length) {
        block.replaceWith('<p style="color:#999;font-style:italic">(aucune donnée)</p>');
        continue;
      }
      const expanded = rows.map(row => {
        let rh = template;
        for (const [k,v] of Object.entries(row)) rh = rh.replaceAll(`{{item.${k}}}`, String(v ?? ''));
        return rh.replace(/\{\{item\.[^}]+\}\}/g, '');
      }).join('\n');
      block.replaceWith(expanded);
    }
    html = root.toString();
  } catch (e) { console.error('[generer] boucles :', e.message); }

  html = html.replace(/\{\{[^}]+\}\}/g, '<span style="background:#fff3cd;padding:0 2px">___</span>');

  // ── Extraire les blocs en-tête et bas de page ──────────────────────────────
  let headerHtml = '', footerHtml = '', bodyHtml = html;
  const headerMatch = html.match(/<div[^>]*data-entete[^>]*>([\s\S]*?)<\/div>/);
  const footerMatch = html.match(/<div[^>]*data-pied[^>]*>([\s\S]*?)<\/div>/);
  if (headerMatch) {
    headerHtml = headerMatch[1];
    bodyHtml   = bodyHtml.replace(headerMatch[0], '');
  }
  if (footerMatch) {
    footerHtml = footerMatch[1];
    bodyHtml   = bodyHtml.replace(footerMatch[0], '');
  }

  res.json({ html: bodyHtml, headerHtml, footerHtml, nom: t.nom });
});

export default r;
