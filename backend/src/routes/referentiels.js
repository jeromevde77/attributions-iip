import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired, getUserSections } from '../middleware/auth.js';

const r = Router();

r.get('/sections', authRequired, (req, res) => {
  const allowed = getUserSections(req.user);
  let rows = db.prepare('SELECT * FROM section ORDER BY code').all();
  if (allowed !== null) rows = rows.filter(s => allowed.includes(s.code));
  res.json(rows);
});

r.get('/ue', authRequired, (req, res) => {
  const { section, annee } = req.query;
  const anneeVal = annee || '2025-2026';
  let sql = 'SELECT * FROM ue WHERE annee_scolaire = ?';
  const params = [anneeVal];
  if (section) { sql += ' AND section = ?'; params.push(section); }
  sql += ' ORDER BY ue_num';
  res.json(db.prepare(sql).all(...params));
});

r.get('/ue/:num', authRequired, (req, res) => {
  const anneeVal = req.query.annee || '2025-2026';
  const ue = db.prepare('SELECT * FROM ue WHERE ue_num = ? AND annee_scolaire = ?').get(req.params.num, anneeVal);
  if (!ue) return res.status(404).json({ error: 'UE introuvable' });
  const cours = db.prepare('SELECT * FROM cours WHERE ue_num = ? AND annee_scolaire = ?').all(req.params.num, anneeVal);
  res.json({ ...ue, cours });
});

r.get('/cours', authRequired, (req, res) => {
  const { ue_num, section, annee } = req.query;
  const anneeVal = annee || '2025-2026';
  let sql = 'SELECT * FROM cours WHERE annee_scolaire = ?';
  const params = [anneeVal];
  if (ue_num)  { sql += ' AND ue_num = ?'; params.push(ue_num); }
  if (section) { sql += ' AND section = ?'; params.push(section); }
  sql += ' ORDER BY cours_code';
  res.json(db.prepare(sql).all(...params));
});

// ─── Structure complète (Section → UE → Cours) pour le module Référentiels ───
// Une UE est rattachée à une section via les sections de ses attributions
// (l'UE elle-même n'a plus de section "propriétaire" significative).
// Une même UE peut donc apparaître sous plusieurs sections (ex. UE de remédiation).
r.get('/structure', authRequired, (req, res) => {
  const annee = req.query.annee || '2025-2026';
  const ues = db.prepare('SELECT * FROM ue WHERE annee_scolaire = ? ORDER BY ue_num').all(annee);
  const cours = db.prepare('SELECT * FROM cours WHERE annee_scolaire = ? ORDER BY cours_code').all(annee);
  const attrParUe = db.prepare('SELECT ue_num, COUNT(*) AS n FROM attribution WHERE annee_scolaire = ? GROUP BY ue_num').all(annee);
  const attrParCours = db.prepare('SELECT code_cours, COUNT(*) AS n FROM attribution WHERE annee_scolaire = ? GROUP BY code_cours').all(annee);
  const ueAttrMap = Object.fromEntries(attrParUe.map(r => [r.ue_num, r.n]));
  const coursAttrMap = Object.fromEntries(attrParCours.map(r => [r.code_cours, r.n]));

  // Sections de référence (casse canonique)
  const refSections = db.prepare('SELECT code FROM section ORDER BY code').all().map(r => r.code);
  const canon = (s) => {
    if (!s) return null;
    const up = String(s).trim().toUpperCase();
    const match = refSections.find(c => c.toUpperCase() === up);
    return match || String(s).trim(); // garde la casse de référence si trouvée
  };

  // Pour chaque UE, déterminer ses sections via ses attributions (sinon sa section propre)
  const secParUe = {};   // ue_num -> Set de sections (casse canonique)
  const attrSecRows = db.prepare(
    'SELECT DISTINCT ue_num, section FROM attribution WHERE annee_scolaire = ? AND section IS NOT NULL'
  ).all(annee);
  for (const r of attrSecRows) {
    const c = canon(r.section);
    if (!c) continue;
    (secParUe[r.ue_num] ||= new Set()).add(c);
  }

  // Rattachements explicites via ue_section (même sans attribution)
  const liens = db.prepare('SELECT ue_num, section_code FROM ue_section WHERE annee_scolaire = ?').all(annee);
  for (const l of liens) {
    const c = canon(l.section_code);
    if (!c) continue;
    (secParUe[l.ue_num] ||= new Set()).add(c);
  }

  const coursParUe = {};
  for (const c of cours) {
    (coursParUe[c.ue_num] ||= []).push({ ...c, nb_attributions: coursAttrMap[c.cours_code] || 0 });
  }

  // Grouper par section : une UE apparaît sous chacune de ses sections d'attributions.
  // Si l'UE n'a aucune attribution, on la range sous sa section propre (repli).
  const sections = {};
  for (const ue of ues) {
    let secs = secParUe[ue.ue_num] ? [...secParUe[ue.ue_num]] : [];
    if (secs.length === 0) secs = [canon(ue.section) || '(sans section)'];
    const ueData = {
      ...ue,
      nb_attributions: ueAttrMap[ue.ue_num] || 0,
      cours: coursParUe[ue.ue_num] || [],
      sections_partagees: secs.length > 1 ? secs : null  // info de partage
    };
    for (const sec of secs) {
      (sections[sec] ||= []).push(ueData);
    }
  }
  // Trier les sections par nom et les UE par numéro
  const refSecInfo = Object.fromEntries(
    db.prepare('SELECT code, niveau FROM section').all().map(s => [s.code, s.niveau])
  );
  const result = Object.entries(sections)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([section, ues]) => ({
      section,
      section_niveau: refSecInfo[section] || null,
      ues: ues.sort((x, y) => (x.ue_num || 0) - (y.ue_num || 0))
    }));
  res.json(result);
});

// ─── CRUD UE ───
r.post('/ue', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const annee = req.body.annee_scolaire || '2025-2026';
  const { ue_num, ue_nom, section, ue_niv, ue_niveau, ue_quad, ue_per_cours, ue_aut,
          ue_code_fwb, et_ref, ue_tc, ue_det, ue_per_etudiants, ue_tot_prf, ects, ue_prerequise } = req.body;
  if (!ue_num || !ue_nom) return res.status(400).json({ error: 'Numéro et nom d\'UE requis' });
  const exists = db.prepare('SELECT 1 FROM ue WHERE ue_num = ? AND annee_scolaire = ?').get(ue_num, annee);
  if (exists) return res.status(409).json({ error: `L'UE ${ue_num} existe déjà pour ${annee}` });
  db.prepare(`
    INSERT INTO ue (ue_num, annee_scolaire, ue_nom, section, ue_niv, ue_niveau, ue_quad,
      ue_per_cours, ue_aut, ue_code_fwb, et_ref, ue_tc, ue_det, ue_per_etudiants, ue_tot_prf, ects, ue_prerequise)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(ue_num, annee, ue_nom, section || null, ue_niv || null, ue_niveau || null,
         ue_quad || null, ue_per_cours || null, ue_aut || null, ue_code_fwb || null, et_ref || null,
         ue_tc || null, ue_det || null, ue_per_etudiants || null, ue_tot_prf || null, ects || null, ue_prerequise || null);
  res.status(201).json({ ok: true });
});

r.patch('/ue/:num', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const annee = req.body.annee_scolaire || req.query.annee || '2025-2026';
  const allowed = ['ue_nom','section','ue_niv','ue_niveau','ue_quad','ue_per_cours','ue_aut',
                   'ue_code_fwb','et_ref','ects','ue_tc','ue_det','ue_per_etudiants','ue_tot_prf','ue_prerequise'];
  const updates = []; const params = { num: req.params.num, annee };
  for (const k of allowed) if (k in req.body) { updates.push(`${k} = @${k}`); params[k] = req.body[k]; }
  if (!updates.length) return res.status(400).json({ error: 'Aucun champ à modifier' });
  const result = db.prepare(`UPDATE ue SET ${updates.join(', ')} WHERE ue_num = @num AND annee_scolaire = @annee`).run(params);
  if (result.changes === 0) return res.status(404).json({ error: 'UE introuvable' });
  res.json({ ok: true });
});

r.delete('/ue/:num', authRequired, roleRequired('admin'), (req, res) => {
  const annee = req.query.annee || '2025-2026';
  const nb = db.prepare('SELECT COUNT(*) AS n FROM attribution WHERE ue_num = ? AND annee_scolaire = ?').get(req.params.num, annee).n;
  if (nb > 0) return res.status(409).json({ error: `Impossible : ${nb} attribution(s) sur cette UE. Supprimez-les d'abord.` });
  db.prepare('DELETE FROM cours WHERE ue_num = ? AND annee_scolaire = ?').run(req.params.num, annee);
  db.prepare('DELETE FROM ue WHERE ue_num = ? AND annee_scolaire = ?').run(req.params.num, annee);
  res.json({ ok: true });
});

// ─── CRUD Cours ───
r.post('/cours', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const annee = req.body.annee_scolaire || '2025-2026';
  const { cours_code, cours_nom, ue_num, section, ct_pp, cours_per, quadrimestre_cours, ue_niveau,
          cours_num, cours_total, ue_autonomie, ue_per_total, enc_cours, heures } = req.body;
  if (!cours_code || !cours_nom) return res.status(400).json({ error: 'Code et nom de cours requis' });
  const exists = db.prepare('SELECT 1 FROM cours WHERE cours_code = ? AND annee_scolaire = ?').get(cours_code, annee);
  if (exists) return res.status(409).json({ error: `Le cours ${cours_code} existe déjà pour ${annee}` });
  db.prepare(`
    INSERT INTO cours (cours_code, annee_scolaire, cours_nom, ue_num, section, ct_pp, cours_per,
      quadrimestre_cours, ue_niveau, cours_num, cours_total, ue_autonomie, ue_per_total, enc_cours, heures)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(cours_code, annee, cours_nom, ue_num || null, section || null, ct_pp || null,
         cours_per || null, quadrimestre_cours || null, ue_niveau || null,
         cours_num || null, cours_total || null, ue_autonomie || null, ue_per_total || null,
         enc_cours || null, heures || null);
  res.status(201).json({ ok: true });
});

r.patch('/cours/:code', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const annee = req.body.annee_scolaire || req.query.annee || '2025-2026';
  const allowed = ['cours_nom','ue_num','section','ct_pp','cours_per','quadrimestre_cours','ue_niveau',
                   'cours_num','cours_total','ue_autonomie','ue_per_total','enc_cours','heures'];
  const updates = []; const params = { code: req.params.code, annee };
  for (const k of allowed) if (k in req.body) { updates.push(`${k} = @${k}`); params[k] = req.body[k]; }
  if (!updates.length) return res.status(400).json({ error: 'Aucun champ à modifier' });
  const result = db.prepare(`UPDATE cours SET ${updates.join(', ')} WHERE cours_code = @code AND annee_scolaire = @annee`).run(params);
  if (result.changes === 0) return res.status(404).json({ error: 'Cours introuvable' });
  res.json({ ok: true });
});

r.delete('/cours/:code', authRequired, roleRequired('admin'), (req, res) => {
  const annee = req.query.annee || '2025-2026';
  const nb = db.prepare('SELECT COUNT(*) AS n FROM attribution WHERE code_cours = ? AND annee_scolaire = ?').get(req.params.code, annee).n;
  if (nb > 0) return res.status(409).json({ error: `Impossible : ${nb} attribution(s) sur ce cours. Supprimez-les d'abord.` });
  db.prepare('DELETE FROM cours WHERE cours_code = ? AND annee_scolaire = ?').run(req.params.code, annee);
  res.json({ ok: true });
});

// ─── CRUD Section ───
r.post('/sections', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { code, libelle, niveau, type_horaire, responsable, code_fwb } = req.body;
  if (!code) return res.status(400).json({ error: 'Code de section requis' });
  const exists = db.prepare('SELECT 1 FROM section WHERE code = ?').get(code);
  if (exists) return res.status(409).json({ error: 'Cette section existe déjà' });
  db.prepare(`INSERT INTO section (code, libelle, niveau, type_horaire, responsable, code_fwb)
              VALUES (?, ?, ?, ?, ?, ?)`)
    .run(code, libelle || code, niveau || null, type_horaire || null, responsable || null, code_fwb || null);
  res.status(201).json({ ok: true });
});

r.patch('/sections/:code', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const allowed = ['libelle', 'niveau', 'type_horaire', 'responsable', 'code_fwb'];
  const updates = []; const params = { code: req.params.code };
  for (const k of allowed) if (k in req.body) { updates.push(`${k} = @${k}`); params[k] = req.body[k] || null; }
  if (!updates.length) return res.status(400).json({ error: 'Aucun champ à modifier' });
  const result = db.prepare(`UPDATE section SET ${updates.join(', ')} WHERE code = @code`).run(params);
  if (result.changes === 0) return res.status(404).json({ error: 'Section introuvable' });
  res.json({ ok: true });
});

// ─── Renommer le CODE d'une section (propagation dans toutes les tables) ───
// Le code est la clé de référence (stockée en texte dans attribution, cours,
// ue, ue_section). Renommer doit propager partout, en une transaction.
// Comparaison insensible à la casse pour uniformiser (RESTART -> Restart).
r.patch('/sections/:code/code', authRequired, roleRequired('admin'), (req, res) => {
  const ancien = req.params.code;
  const nouveau = (req.body.nouveau_code || '').trim();
  if (!nouveau) return res.status(400).json({ error: 'Nouveau code requis' });

  const section = db.prepare('SELECT code FROM section WHERE code = ?').get(ancien);
  if (!section) return res.status(404).json({ error: 'Section introuvable' });

  // Si le nouveau code existe déjà (et que ce n'est pas un simple changement de
  // casse du même code), on refuse pour éviter une collision/fusion accidentelle.
  if (nouveau.toUpperCase() !== ancien.toUpperCase()) {
    const collision = db.prepare('SELECT 1 FROM section WHERE code = ?').get(nouveau);
    if (collision) return res.status(409).json({ error: `La section "${nouveau}" existe déjà.` });
  }

  const tx = db.transaction(() => {
    // 1) La table section (clé primaire). Si seul la casse change, SQLite
    //    considère 'RESTART' = 'Restart' pour une PK TEXT ? Non, la PK est
    //    sensible à la casse par défaut (BINARY), donc UPDATE direct OK.
    db.prepare('UPDATE section SET code = ? WHERE code = ?').run(nouveau, ancien);
    // 2) Propager dans toutes les tables qui référencent le code en texte,
    //    en attrapant toutes les variantes de casse de l'ancien code.
    db.prepare('UPDATE attribution SET section = ? WHERE UPPER(section) = UPPER(?)').run(nouveau, ancien);
    db.prepare('UPDATE cours SET section = ? WHERE UPPER(section) = UPPER(?)').run(nouveau, ancien);
    db.prepare('UPDATE ue SET section = ? WHERE UPPER(section) = UPPER(?)').run(nouveau, ancien);
    db.prepare('UPDATE ue_section SET section_code = ? WHERE UPPER(section_code) = UPPER(?)').run(nouveau, ancien);
    db.prepare('UPDATE utilisateur_section SET section_code = ? WHERE UPPER(section_code) = UPPER(?)').run(nouveau, ancien);
  });
  tx();
  res.json({ ok: true, ancien, nouveau });
});


r.delete('/sections/:code', authRequired, roleRequired('admin'), (req, res) => {
  const nb = db.prepare('SELECT COUNT(*) AS n FROM attribution WHERE section = ?').get(req.params.code).n;
  if (nb > 0) return res.status(409).json({ error: `Impossible : ${nb} attribution(s) dans cette section.` });
  db.prepare('DELETE FROM section WHERE code = ?').run(req.params.code);
  res.json({ ok: true });
});

/**
 * Pour la création en masse d'attributions :
 * retourne pour une section, toutes les UE avec leurs cours et le statut
 * "déjà couvert" (= au moins une attribution existe pour ce cours dans cette section).
 */
r.get('/sections/:section/ue-cours', authRequired, (req, res) => {
  const { section } = req.params;
  const annee = req.query.annee || '2025-2026';
  const ues = db.prepare(`
    SELECT DISTINCT u.ue_num, u.ue_nom, u.ue_niv AS bloc
    FROM cours c
    LEFT JOIN ue u ON u.ue_num = c.ue_num AND u.annee_scolaire = c.annee_scolaire
    WHERE c.section = ? AND c.annee_scolaire = ?
    ORDER BY u.ue_niv, u.ue_num
  `).all(section, annee);

  const cours = db.prepare(`
    SELECT c.cours_code, c.cours_nom, c.ue_num, c.ct_pp AS type_cours,
           c.quadrimestre_cours, c.cours_per,
           (SELECT COUNT(*) FROM attribution a
            WHERE a.section = ? AND a.code_cours = c.cours_code AND a.annee_scolaire = ?) AS nb_attributions
    FROM cours c
    WHERE c.section = ? AND c.annee_scolaire = ?
    ORDER BY c.cours_code
  `).all(section, annee, section, annee);

  // Grouper les cours par UE
  const byUE = {};
  for (const c of cours) {
    if (!byUE[c.ue_num]) byUE[c.ue_num] = [];
    byUE[c.ue_num].push(c);
  }
  for (const u of ues) {
    u.cours = byUE[u.ue_num] || [];
    u.cours_total = u.cours.length;
    u.cours_couverts = u.cours.filter(c => c.nb_attributions > 0).length;
    u.cours_manquants = u.cours_total - u.cours_couverts;
  }
  res.json(ues);
});

r.get('/professeurs', authRequired, (req, res) => {
  res.json(db.prepare('SELECT * FROM v_professeur_total ORDER BY nom, prenom').all());
});

r.get('/professeurs/:id', authRequired, (req, res) => {
  // Table complète (TOUS les champs de la fiche signalétique)
  const base = db.prepare('SELECT * FROM professeur WHERE id = ?').get(req.params.id);
  if (!base) return res.status(404).json({ error: 'Professeur introuvable' });
  // Vue pour les totaux/calculs (nom_prenom, total_per_iip, etc.)
  const vue = db.prepare('SELECT * FROM v_professeur_total WHERE id = ?').get(req.params.id) || {};
  // Fusion : la table complète d'abord, la vue complète les totaux
  const p = { ...vue, ...base, nom_prenom: vue.nom_prenom || `${base.nom} ${base.prenom}` };
  const attrs = db.prepare(`
    SELECT * FROM v_attribution_complete
    WHERE professeur_id = ? ORDER BY section, ue_num
  `).all(req.params.id);
  const titres = db.prepare(
    'SELECT * FROM titre_capacite WHERE professeur_id = ? ORDER BY ordre, id'
  ).all(req.params.id);
  const charges = db.prepare(
    'SELECT * FROM personne_charge WHERE professeur_id = ? ORDER BY categorie, ordre, id'
  ).all(req.params.id);

  // Ancienneté (CC sous IIP) : report historique + acquis de l'année courante
  const annee = req.query.annee || db.prepare("SELECT code FROM annee_scolaire WHERE active = 1 LIMIT 1").get()?.code;
  let anciennete = null;
  if (p.statut === 'CC') {
    const reportPo = p.report_anc_po || 0;
    const acquisPo = db.prepare(
      'SELECT jours_acquis FROM v_anc_po_annee WHERE professeur_id = ? AND annee_scolaire = ?'
    ).get(req.params.id, annee)?.jours_acquis || 0;

    const reportsCours = db.prepare(
      'SELECT cours_nom, jours FROM report_anc_cours WHERE professeur_id = ?'
    ).all(req.params.id);
    const reportCoursMap = {};
    reportsCours.forEach(r => { reportCoursMap[r.cours_nom] = r.jours; });

    const acquisCours = db.prepare(
      'SELECT cours_nom, jours_acquis, total_periodes FROM v_anc_cours_annee WHERE professeur_id = ? AND annee_scolaire = ?'
    ).all(req.params.id, annee);

    // Fusionner reports + acquis par cours
    const coursNoms = new Set([...Object.keys(reportCoursMap), ...acquisCours.map(c => c.cours_nom)]);
    const parCours = [...coursNoms].filter(Boolean).map(nom => {
      const acq = acquisCours.find(c => c.cours_nom === nom);
      return {
        cours_nom: nom,
        report: reportCoursMap[nom] || 0,
        acquis_annee: acq?.jours_acquis || 0,
        periodes_annee: acq?.total_periodes || 0,
        total: (reportCoursMap[nom] || 0) + (acq?.jours_acquis || 0),
      };
    });

    anciennete = {
      po: { report: reportPo, acquis_annee: acquisPo, total: reportPo + acquisPo },
      cours: parCours,
      annee,
    };
  }

  res.json({ ...p, attributions: attrs, titres, charges, anciennete });
});

// ── Titres de capacité (liste liée au prof) ──
r.put('/professeurs/:id/titres', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const profId = Number(req.params.id);
  const titres = Array.isArray(req.body?.titres) ? req.body.titres : [];
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM titre_capacite WHERE professeur_id = ?').run(profId);
    const ins = db.prepare(
      'INSERT INTO titre_capacite (professeur_id, date_obtention, intitule, delivre_par, ordre) VALUES (?,?,?,?,?)'
    );
    titres.forEach((t, i) => {
      if ((t.intitule && t.intitule.trim()) || (t.delivre_par && t.delivre_par.trim()) || t.date_obtention) {
        ins.run(profId, t.date_obtention || null, (t.intitule||'').trim() || null, (t.delivre_par||'').trim() || null, i);
      }
    });
  });
  tx();
  res.json({ ok: true });
});

// ── Personnes à charge (liste liée au prof) ──
r.put('/professeurs/:id/charges', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const profId = Number(req.params.id);
  const charges = Array.isArray(req.body?.charges) ? req.body.charges : [];
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM personne_charge WHERE professeur_id = ?').run(profId);
    const ins = db.prepare(
      'INSERT INTO personne_charge (professeur_id, categorie, date_naissance, handicap, ordre) VALUES (?,?,?,?,?)'
    );
    charges.forEach((c, i) => {
      if (c.date_naissance || c.categorie) {
        ins.run(profId, c.categorie || 'enfant', c.date_naissance || null, c.handicap || 'non', i);
      }
    });
  });
  tx();
  res.json({ ok: true });
});

// ── Reports d'ancienneté par cours (saisis par le personnel administratif) ──
r.put('/professeurs/:id/anciennete-cours', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const profId = Number(req.params.id);
  const reports = Array.isArray(req.body?.reports) ? req.body.reports : [];
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM report_anc_cours WHERE professeur_id = ?').run(profId);
    const ins = db.prepare(
      'INSERT INTO report_anc_cours (professeur_id, cours_nom, jours) VALUES (?,?,?)'
    );
    reports.forEach(r => {
      if (r.cours_nom && r.cours_nom.trim()) {
        ins.run(profId, r.cours_nom.trim(), Number(r.jours) || 0);
      }
    });
  });
  tx();
  res.json({ ok: true });
});

// Créer un nouveau professeur
r.post('/professeurs', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { nom, prenom, adresse_mail, mail_prive, statut, adresse_rue, code_postal,
          commune, capaes, anciennete_25_26_po } = req.body;
  if (!nom || !prenom) return res.status(400).json({ error: 'Nom et prénom requis' });
  try {
    const result = db.prepare(`
      INSERT INTO professeur (nom, prenom, adresse_mail, mail_prive, statut,
        adresse_rue, code_postal, commune, capaes, anciennete_25_26_po)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(nom.trim(), prenom.trim(), adresse_mail||null, mail_prive||null,
           statut||null, adresse_rue||null, code_postal||null, commune||null,
           capaes||null, anciennete_25_26_po||0);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Ce professeur existe déjà' });
    throw e;
  }
});

// Modifier un professeur
r.patch('/professeurs/:id', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const allowed = ['nom','prenom','adresse_mail','mail_prive','statut',
                   'adresse_rue','code_postal','commune','capaes','anciennete_25_26_po',
                   'matricule','titre1','titre2','titre3','statut_ea12','report_anc_po',
                   // Fiche signalétique — identité civile
                   'sexe','niss','nationalite','lieu_naissance_ville','lieu_naissance_pays',
                   'iban','bic','compte_titulaire','tel_gsm','date_naissance',
                   // Fiche signalétique — situation fiscale
                   'etat_civil','handicap',
                   'conjoint_nom','conjoint_prenom','conjoint_handicap',
                   'conjoint_alloc_foyer','conjoint_revenus',
                   // Règlement CE 883/2004
                   'ce883_actif','ce883_date_debut','ce883_caisse','ce883_num_inscription'];
  const updates = [];
  const params = { id: req.params.id };
  for (const k of allowed) {
    if (k in req.body) { updates.push(`${k} = @${k}`); params[k] = req.body[k]; }
  }
  if (!updates.length) return res.status(400).json({ error: 'Aucun champ à modifier' });
  const result = db.prepare(`UPDATE professeur SET ${updates.join(', ')} WHERE id = @id`).run(params);
  if (result.changes === 0) return res.status(404).json({ error: 'Professeur introuvable' });
  res.json({ ok: true });
});

// Supprimer un professeur (seulement si aucune attribution active)
r.delete('/professeurs/:id', authRequired, roleRequired('admin'), (req, res) => {
  const nb = db.prepare('SELECT COUNT(*) AS n FROM attribution WHERE professeur_id = ?').get(req.params.id).n;
  if (nb > 0) return res.status(409).json({ error: `Impossible : ${nb} attribution(s) référencent ce professeur` });
  const result = db.prepare('DELETE FROM professeur WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Professeur introuvable' });
  res.json({ ok: true });
});

r.get('/locaux', authRequired, (req, res) => {
  res.json(db.prepare('SELECT * FROM local ORDER BY nom').all());
});

r.get('/parametres', authRequired, (req, res) => {
  res.json(db.prepare('SELECT * FROM parametre_financier').all());
});

r.get('/types-encadrement', authRequired, (req, res) => {
  res.json(db.prepare('SELECT * FROM type_encadrement').all());
});

r.get('/activites', authRequired, (req, res) => {
  res.json(db.prepare('SELECT * FROM activite_type ORDER BY ordre, libelle').all());
});

// ─── Catalogue des UE (toutes années, dédupliquées par numéro) ───
// Pour rattachement à une section. Une UE absente de l'année active sera
// copiée automatiquement au moment du rattachement.
r.get('/catalogue-ue', authRequired, (req, res) => {
  const annee = req.query.annee || '2025-2026';

  // Toutes les UE, toutes années — on déduplique par ue_num en préférant
  // la version de l'année active, sinon la plus récente.
  const toutes = db.prepare('SELECT ue_num, ue_nom, ue_niv, et_ref, annee_scolaire FROM ue ORDER BY ue_num, annee_scolaire DESC').all();
  const parNum = {};
  for (const ue of toutes) {
    if (!parNum[ue.ue_num]) parNum[ue.ue_num] = ue;            // 1re vue = plus récente (DESC)
    if (ue.annee_scolaire === annee) parNum[ue.ue_num] = ue;   // préfère l'année active
  }
  const ues = Object.values(parNum).sort((a, b) => (a.ue_num || 0) - (b.ue_num || 0));

  // Sections de référence pour normaliser la casse
  const refSections = db.prepare('SELECT code FROM section').all().map(r => r.code);
  const canon = (s) => {
    if (!s) return null;
    const up = String(s).trim().toUpperCase();
    return refSections.find(c => c.toUpperCase() === up) || String(s).trim();
  };

  // Sections par UE dans l'année ACTIVE (attributions + liens explicites)
  const secParUe = {};
  for (const r of db.prepare('SELECT DISTINCT ue_num, section FROM attribution WHERE annee_scolaire = ? AND section IS NOT NULL').all(annee)) {
    const c = canon(r.section); if (c) (secParUe[r.ue_num] ||= new Set()).add(c);
  }
  for (const l of db.prepare('SELECT ue_num, section_code FROM ue_section WHERE annee_scolaire = ?').all(annee)) {
    const c = canon(l.section_code); if (c) (secParUe[l.ue_num] ||= new Set()).add(c);
  }

  // UE présentes dans l'année active (pour info "à copier")
  const presentes = new Set(db.prepare('SELECT ue_num FROM ue WHERE annee_scolaire = ?').all(annee).map(r => r.ue_num));

  res.json(ues.map(ue => ({
    ...ue,
    sections: secParUe[ue.ue_num] ? [...secParUe[ue.ue_num]] : [],
    presente_annee_active: presentes.has(ue.ue_num)
  })));
});

// Rattacher une UE existante à une section.
// Si l'UE n'existe pas dans l'année active, elle est copiée (avec ses cours)
// depuis l'année la plus récente où elle existe.
r.post('/ue-section', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const annee = req.body.annee_scolaire || '2025-2026';
  const { ue_num, section_code } = req.body;
  if (!ue_num || !section_code) return res.status(400).json({ error: 'ue_num et section_code requis' });

  let ue = db.prepare('SELECT 1 FROM ue WHERE ue_num = ? AND annee_scolaire = ?').get(ue_num, annee);
  let copiee = false;

  if (!ue) {
    // Trouver l'UE dans une autre année (la plus récente)
    const source = db.prepare(
      'SELECT annee_scolaire FROM ue WHERE ue_num = ? ORDER BY annee_scolaire DESC LIMIT 1'
    ).get(ue_num);
    if (!source) return res.status(404).json({ error: `L'UE ${ue_num} n'existe dans aucune année.` });

    const tx = db.transaction(() => {
      // Copier l'UE
      db.prepare(`
        INSERT OR IGNORE INTO ue (ue_num, annee_scolaire, ue_nom, ue_code_fwb, section, ue_tc, ue_det,
          ue_niv, ue_per_etudiants, ue_per_cours, ue_aut, ue_tot_prf, ue_niveau, ue_quad, et_ref, ects, ue_prerequise)
        SELECT ue_num, @cible, ue_nom, ue_code_fwb, section, ue_tc, ue_det,
          ue_niv, ue_per_etudiants, ue_per_cours, ue_aut, ue_tot_prf, ue_niveau, ue_quad, et_ref, ects, ue_prerequise
        FROM ue WHERE ue_num = @ue AND annee_scolaire = @source
      `).run({ ue: ue_num, cible: annee, source: source.annee_scolaire });
      // Copier ses cours
      db.prepare(`
        INSERT OR IGNORE INTO cours (cours_code, annee_scolaire, cours_num, cours_nom, ct_pp, section,
          ue_num, quadrimestre_cours, cours_per, cours_total, ue_autonomie, ue_per_total, ue_niveau, enc_cours, heures)
        SELECT cours_code, @cible, cours_num, cours_nom, ct_pp, section,
          ue_num, quadrimestre_cours, cours_per, cours_total, ue_autonomie, ue_per_total, ue_niveau, enc_cours, heures
        FROM cours WHERE ue_num = @ue AND annee_scolaire = @source
      `).run({ ue: ue_num, cible: annee, source: source.annee_scolaire });
    });
    tx();
    copiee = true;
  }

  db.prepare(`INSERT OR IGNORE INTO ue_section (ue_num, section_code, annee_scolaire) VALUES (?, ?, ?)`)
    .run(ue_num, section_code, annee);
  res.status(201).json({ ok: true, copiee });
});

// Détacher une UE d'une section (supprime le lien, pas l'UE)
r.delete('/ue-section/:ue_num/:section_code', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const annee = req.query.annee || '2025-2026';
  const { ue_num, section_code } = req.params;
  // Refuser le détachement s'il existe des attributions de cette UE dans cette section
  const nb = db.prepare(
    'SELECT COUNT(*) AS n FROM attribution WHERE ue_num = ? AND UPPER(section) = UPPER(?) AND annee_scolaire = ?'
  ).get(ue_num, section_code, annee).n;
  if (nb > 0) return res.status(409).json({ error: `Impossible : ${nb} attribution(s) de cette UE dans cette section. Le rattachement vient des attributions.` });
  db.prepare('DELETE FROM ue_section WHERE ue_num = ? AND section_code = ? AND annee_scolaire = ?')
    .run(ue_num, section_code, annee);
  res.json({ ok: true });
});

// Génère la fiche signalétique (PDF) d'un prof à partir du modèle officiel,
// l'archive (traçabilité Option B) et la renvoie.
r.get('/professeurs/:id/fiche-pdf', authRequired, async (req, res) => {
  const p = db.prepare('SELECT * FROM professeur WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Professeur introuvable' });
  const e = db.prepare('SELECT * FROM etablissement WHERE id = 1').get() || {};

  // Mapping des données prof -> format attendu par le moteur de la fiche
  const lieuNaissance = [p.lieu_naissance_ville, p.lieu_naissance_pays].filter(Boolean).join(', ');
  const domicile = [p.adresse_rue, [p.code_postal, p.commune].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const data = {
    prof_nom: p.nom, prof_prenom: p.prenom,
    nationalite: p.nationalite, lieu_naissance: lieuNaissance,
    domicile, tel_gsm: p.tel_gsm,
    etab: { po_nom: e.po_nom, etab_nom: e.etab_nom, adresse: e.adresse,
            num_ecot: e.num_ecot, num_fase: e.num_fase },
  };

  try {
    const { remplirFicheOfficielle } = await import('../services/fiche_fill_officiel.js');
    const { docxToPdf } = await import('../services/docx-to-pdf.js');
    const { archiverDocument } = await import('../services/document-archive.js');

    const docx = await remplirFicheOfficielle(data);
    const pdf = await docxToPdf(Buffer.isBuffer(docx) ? docx : Buffer.from(docx));
    const fname = `Fiche_signaletique_${p.nom}_${p.prenom}.pdf`.replace(/\s+/g, '_');

    // Archivage (traçabilité)
    try {
      archiverDocument({
        type_doc: 'fiche', professeur_id: p.id, prof_nom: p.nom, prof_prenom: p.prenom,
        annee_scolaire: null, nom_fichier: fname, pdf,
        genere_par: req.user?.email || req.user?.identifiant || null,
      });
    } catch (archErr) { console.error('[fiche] archivage échoué (non bloquant) :', archErr.message); }

    res.status(200);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.setHeader('Content-Length', pdf.length);
    res.end(pdf);
  } catch (err) {
    console.error('[fiche] génération PDF échouée :', err);
    res.status(500).json({ error: 'Génération de la fiche échouée : ' + err.message });
  }
});

export default r;
