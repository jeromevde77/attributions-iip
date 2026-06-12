import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired, getUserSections } from '../middleware/auth.js';

const r = Router();

/**
 * Plafond d'autonomie d'une UE, avec dédoublement (modèle simple, par cours).
 * Le plafond = ue.ue_aut × facteur de dédoublement moyen pondéré ? Non :
 * règle métier de Jérôme — l'autonomie suit le cours. Le plafond effectif est
 * donc ue_aut multiplié selon le dédoublement. En pratique : sans dédoublement
 * le plafond = ue_aut ; si des cours sont dédoublés, chaque cours dédoublé
 * "ouvre" le double de sa propre part. Le plus simple et fidèle : plafond de
 * base = ue_aut, et on autorise en plus une part doublée au prorata des cours
 * dédoublés. Pour rester sûr et lisible, on calcule :
 *   plafond = ue_aut + (somme des cours_autonomie des cours dédoublés)
 * c.-à-d. un cours dédoublé peut compter son autonomie une 2e fois.
 * @returns {{ plafond:number, consomme:number, ue_aut:number }}
 */
function autonomieUE(ueNum, annee, { exclureCours = null, ajoutCours = null } = {}) {
  const ue = db.prepare('SELECT ue_aut FROM ue WHERE ue_num = ? AND annee_scolaire = ?').get(ueNum, annee) || {};
  const ueAut = Number(ue.ue_aut) || 0;
  const cours = db.prepare(
    'SELECT cours_code, cours_autonomie, dedouble FROM cours WHERE ue_num = ? AND annee_scolaire = ?'
  ).all(ueNum, annee);

  let consomme = 0, bonusDedouble = 0;
  for (const c of cours) {
    if (exclureCours && c.cours_code === exclureCours) continue;
    const aut = Number(c.cours_autonomie) || 0;
    consomme += aut;
    if (c.dedouble === 'O') bonusDedouble += aut; // le dédoublement double la part d'autonomie de ce cours
  }
  // Prise en compte du cours en cours d'ajout/modif (non encore en base)
  if (ajoutCours) {
    const aut = Number(ajoutCours.cours_autonomie) || 0;
    consomme += aut;
    if (ajoutCours.dedouble === 'O') bonusDedouble += aut;
  }
  const plafond = ueAut + bonusDedouble;
  return { plafond, consomme, ue_aut: ueAut };
}


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

  // Ajouter les UE orphelines : ue_num présents dans les attributions
  // mais absents de la table ue (ex. UE 95 — attributions sans fiche)
  const ueNums = new Set(ues.map(u => u.ue_num));
  const orphelines = db.prepare(`
    SELECT DISTINCT a.ue_num, a.section,
           v.ue_nom, v.nom_cours
    FROM attribution a
    LEFT JOIN v_attribution_complete v ON v.id = a.id
    WHERE a.annee_scolaire = ? AND a.ue_num IS NOT NULL
  `).all(annee);
  for (const o of orphelines) {
    if (ueNums.has(o.ue_num)) continue;
    // Créer une fiche minimale pour l'UE orpheline
    ues.push({
      ue_num: o.ue_num,
      ue_nom: o.ue_nom || `UE ${o.ue_num} (fiche manquante)`,
      annee_scolaire: annee,
      section: o.section,
      ue_niv: null, ue_niveau: null, ue_quad: null,
      ue_per_cours: null, ue_aut: null, ue_per_z: null,
      ue_per_etudiants: null, ue_tot_prf: null, ects: null,
      _orpheline: true,  // flag pour l'affichage
    });
    ueNums.add(o.ue_num);
  }
  // Trier l'ensemble (UE fichas + orphelines) par numéro
  ues.sort((a, b) => (a.ue_num || 0) - (b.ue_num || 0));

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
    const coursUe = coursParUe[ue.ue_num] || [];
    // Totaux CALCULÉS à partir des cours (× dédoublement pour cours et autonomie).
    let calcPerCours = 0, calcAutonomie = 0;
    for (const c of coursUe) {
      const fac = c.dedouble === 'O' ? 2 : 1;
      calcPerCours += (Number(c.cours_per) || 0) * fac;
      calcAutonomie += (Number(c.cours_autonomie) || 0) * fac;
    }
    const calcTotProf = calcPerCours + calcAutonomie;        // périodes attribuables (charge prof)
    const perZ = Number(ue.ue_per_z) || 0;                   // activités Z (périodes étudiant, hors charge)
    const ueData = {
      ...ue,
      nb_attributions: ueAttrMap[ue.ue_num] || 0,
      cours: coursUe,
      // Totaux calculés (le frontend peut les afficher en priorité sur les champs saisis)
      calc_per_cours: calcPerCours,
      calc_autonomie: calcAutonomie,
      calc_tot_prof: calcTotProf,
      calc_per_z: perZ,
      calc_total_ue: calcTotProf + perZ,                     // total UE = cours + autonomie + Z
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
          ue_code_fwb, et_ref, ue_tc, ue_det, ue_per_etudiants, ue_tot_prf, ects, ue_prerequise, ue_per_z } = req.body;
  if (!ue_num || !ue_nom) return res.status(400).json({ error: 'Numéro et nom d\'UE requis' });
  const exists = db.prepare('SELECT 1 FROM ue WHERE ue_num = ? AND annee_scolaire = ?').get(ue_num, annee);
  if (exists) return res.status(409).json({ error: `L'UE ${ue_num} existe déjà pour ${annee}` });
  db.prepare(`
    INSERT INTO ue (ue_num, annee_scolaire, ue_nom, section, ue_niv, ue_niveau, ue_quad,
      ue_per_cours, ue_aut, ue_code_fwb, et_ref, ue_tc, ue_det, ue_per_etudiants, ue_tot_prf, ects, ue_prerequise, ue_per_z)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(ue_num, annee, ue_nom, section || null, ue_niv || null, ue_niveau || null,
         ue_quad || null, ue_per_cours || null, ue_aut || null, ue_code_fwb || null, et_ref || null,
         ue_tc || null, ue_det || null, ue_per_etudiants || null, ue_tot_prf || null, ects || null, ue_prerequise || null,
         ue_per_z || null);
  res.status(201).json({ ok: true });
});

r.patch('/ue/:num', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const annee = req.body.annee_scolaire || req.query.annee || '2025-2026';
  const allowed = ['ue_nom','section','ue_niv','ue_niveau','ue_quad','ue_per_cours','ue_aut',
                   'ue_code_fwb','et_ref','ects','ue_tc','ue_det','ue_per_etudiants','ue_tot_prf','ue_prerequise','ue_per_z','pot_code','nb_etudiants'];
  const updates = []; const params = { num: req.params.num, annee };
  for (const k of allowed) if (k in req.body) { updates.push(`${k} = @${k}`); params[k] = req.body[k]; }
  if (!updates.length) return res.status(400).json({ error: 'Aucun champ à modifier' });
  const result = db.prepare(`UPDATE ue SET ${updates.join(', ')} WHERE ue_num = @num AND annee_scolaire = @annee`).run(params);
  if (result.changes === 0) return res.status(404).json({ error: 'UE introuvable' });
  res.json({ ok: true });
});

// Forçage du N° UE (admin) : renomme ue_num en vérifiant l'unicité et en
// propageant dans toutes les tables (ue, cours, attribution, ue_section).
r.patch('/ue/:num/rename', authRequired, roleRequired('admin'), (req, res) => {
  const annee = req.body.annee_scolaire || req.query.annee || '2025-2026';
  const ancien = req.params.num;
  const nouveau = String(req.body.nouveau_num || '').trim();
  if (!nouveau) return res.status(400).json({ error: 'Nouveau numéro requis' });
  if (nouveau === ancien) return res.json({ ok: true });
  const exists = db.prepare('SELECT 1 FROM ue WHERE ue_num = ? AND annee_scolaire = ?').get(nouveau, annee);
  if (exists) return res.status(409).json({ error: `L'UE ${nouveau} existe déjà pour ${annee}.` });
  const src = db.prepare('SELECT 1 FROM ue WHERE ue_num = ? AND annee_scolaire = ?').get(ancien, annee);
  if (!src) return res.status(404).json({ error: 'UE introuvable' });
  const tx = db.transaction(() => {
    db.prepare('UPDATE ue SET ue_num = ? WHERE ue_num = ? AND annee_scolaire = ?').run(nouveau, ancien, annee);
    db.prepare('UPDATE cours SET ue_num = ? WHERE ue_num = ? AND annee_scolaire = ?').run(nouveau, ancien, annee);
    db.prepare('UPDATE attribution SET ue_num = ? WHERE ue_num = ? AND annee_scolaire = ?').run(nouveau, ancien, annee);
    db.prepare('UPDATE ue_section SET ue_num = ? WHERE ue_num = ? AND annee_scolaire = ?').run(nouveau, ancien, annee);
  });
  tx();
  res.json({ ok: true, ancien, nouveau });
});

// Dédouble tous les cours d'une UE en un clic (demande Nicolas).
// Met dedouble='O' sur tous les cours de l'UE pour l'année donnée.
// L'autonomie de chaque cours compte alors ×2 (règle DP validée).
r.patch('/ue/:num/dedoubler', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const annee = req.body.annee_scolaire || req.query.annee || '2025-2026';
  const ueNum = req.params.num;
  // Colonnes à copier pour la nouvelle ligne (groupe B), hors code/num_groupe/split qu'on fixe nous-mêmes
  const COLS = [
    'section','etablissement_referent','contrat_mdp','organisation','annee_scolaire',
    'ue_num','num_organisation','quadrimestre_attribue','code_cours','type_cours',
    'type_cours_helb','nb_groupes','num_split',
    'activite_id','cours_ept_ad','coordination_encadrement',
    'modification_attribution','commentaire','commentaire_2','charge_perdue_84plus',
    'periodes_transferees','per_etudiant_total_dp','periodes_attribuees',
    'autonomie_attribuee','titre_rtf',
  ];
  const colList = COLS.join(', ');
  const aDesigner = db.prepare(`SELECT id FROM professeur WHERE nom = 'À DÉSIGNER' LIMIT 1`).get();
  // Garde-fou : si l'UE a déjà plusieurs groupes (B, C…), ne pas re-dédoubler aveuglément
  const groupes = db.prepare(`SELECT DISTINCT code FROM attribution WHERE ue_num = ? AND annee_scolaire = ?`).all(ueNum, annee).map(r => r.code);
  const aDejaPlusieurs = groupes.some(c => c && c !== 'A' && c !== 'Ts' && c !== null);
  if (aDejaPlusieurs) {
    return res.status(409).json({ error: 'Cette UE a déjà plusieurs groupes. Utilisez la fenêtre « Organiser les groupes » pour ajuster.' });
  }
  const tx = db.transaction(() => {
    // Marquer les cours comme dédoublés dans le DP
    db.prepare(`UPDATE cours SET dedouble = 'O' WHERE ue_num = ? AND annee_scolaire = ?`).run(ueNum, annee);
    // Les lignes existantes (Ts ou A ou NULL) deviennent le groupe A / num_groupe 1
    db.prepare(`UPDATE attribution SET code='A', num_groupe=1, split_groupe='O'
                WHERE ue_num = ? AND annee_scolaire = ?`).run(ueNum, annee);
    // Insérer une copie en groupe B / num_groupe 2, prof À DÉSIGNER
    const r = db.prepare(`
      INSERT INTO attribution (${colList}, code, num_groupe, split_groupe, professeur_id)
      SELECT ${colList}, 'B', 2, 'O', ?
      FROM attribution
      WHERE ue_num = ? AND annee_scolaire = ? AND code = 'A'
    `).run(aDesigner?.id ?? null, ueNum, annee);
    return r.changes;
  });
  const nb = tx();
  res.json({ ok: true, lignes_dupliquees: nb });
});

// PATCH /ref/ue/:num/organiser-groupes
// Body : { annee_scolaire, section, num_organisation, creer_orga_2, cours: [{ code_cours, nb_groupes }] }
// Définit le nombre de groupes de chaque cours d'une UE.
//   1 groupe  => code 'Ts' (tous ensemble)
//   N>1       => 'A','B','C'… (N lignes)
// creer_orga_2 = true  -> crée une nouvelle organisation (max+1) à partir de l'orga source,
//                         puis applique les groupes (profs « À DÉSIGNER »).
// creer_orga_2 = false -> modifie l'organisation courante (profs existants préservés par position).
r.patch('/ue/:num/organiser-groupes', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const annee = req.body.annee_scolaire || '2025-2026';
  const ueNum = req.params.num;
  const { section, num_organisation, creer_orga_2, cours } = req.body || {};
  if (!section || !Array.isArray(cours)) return res.status(400).json({ error: 'section et cours requis' });
  const lettre = (i) => String.fromCharCode(65 + i); // 0->A, 1->B…
  const aDesigner = db.prepare(`SELECT id FROM professeur WHERE nom = 'À DÉSIGNER' LIMIT 1`).get();
  const aDesId = aDesigner?.id ?? null;
  const orgSource = num_organisation || 1;

  const COPY = [
    'section','etablissement_referent','contrat_mdp','organisation','annee_scolaire',
    'ue_num','quadrimestre_attribue','code_cours','type_cours',
    'type_cours_helb','activite_id','cours_ept_ad','coordination_encadrement',
    'per_etudiant_total_dp','periodes_attribuees','autonomie_attribuee','titre_rtf',
  ];
  const copyList = COPY.join(', ');

  let crees = 0, supprimes = 0, maj = 0, orgCible = orgSource;

  const tx = db.transaction(() => {
    // Si création d'orga 2 : déterminer le prochain numéro d'organisation
    if (creer_orga_2) {
      const maxOrg = db.prepare('SELECT COALESCE(MAX(num_organisation),0) m FROM attribution WHERE ue_num=? AND annee_scolaire=?').get(ueNum, annee).m;
      orgCible = maxOrg + 1;
    }

    for (const c of cours) {
      const codeCours = c.code_cours;
      const m = Math.min(100, Math.max(1, parseInt(c.nb_groupes) || 1));
      const cible = m === 1 ? ['Ts'] : Array.from({ length: m }, (_, i) => lettre(i));
      const dedouble = m > 1 ? 'O' : 'N';

      // Lignes modèles = celles de l'organisation SOURCE pour ce cours
      const modeles = db.prepare(`
        SELECT id, professeur_id FROM attribution
        WHERE ue_num=? AND annee_scolaire=? AND section=? AND num_organisation=? AND code_cours=?
        ORDER BY num_groupe, code, id
      `).all(ueNum, annee, section, orgSource, codeCours);
      if (modeles.length === 0) continue;

      if (creer_orga_2) {
        // Créer de nouvelles lignes dans l'orga cible (profs à désigner)
        for (let i = 0; i < cible.length; i++) {
          db.prepare(`
            INSERT INTO attribution (${copyList}, num_organisation, code, num_groupe, nb_groupes, split_groupe, professeur_id)
            SELECT ${copyList}, ?, ?, ?, ?, ?, ?
            FROM attribution WHERE id=?
          `).run(orgCible, cible[i], m === 1 ? 1 : i + 1, m, dedouble, aDesId, modeles[0].id);
          crees++;
        }
      } else {
        // Modifier l'orga courante : réutiliser les lignes, créer/supprimer le surplus
        for (let i = 0; i < cible.length; i++) {
          const numG = m === 1 ? 1 : i + 1;
          if (i < modeles.length) {
            db.prepare(`UPDATE attribution SET code=?, num_groupe=?, nb_groupes=?, split_groupe=? WHERE id=?`)
              .run(cible[i], numG, m, dedouble, modeles[i].id);
            maj++;
          } else {
            db.prepare(`
              INSERT INTO attribution (${copyList}, num_organisation, code, num_groupe, nb_groupes, split_groupe, professeur_id)
              SELECT ${copyList}, ?, ?, ?, ?, ?, ?
              FROM attribution WHERE id=?
            `).run(orgSource, cible[i], numG, m, dedouble, aDesId, modeles[0].id);
            crees++;
          }
        }
        if (modeles.length > cible.length) {
          const surplus = modeles.slice(cible.length).map(l => l.id);
          const ph = surplus.map(() => '?').join(',');
          db.prepare(`DELETE FROM attribution WHERE id IN (${ph})`).run(...surplus);
          supprimes += surplus.length;
        }
      }
      // Refléter dédoublement dans le DP
      db.prepare(`UPDATE cours SET dedouble=? WHERE cours_code=? AND ue_num=? AND annee_scolaire=?`)
        .run(dedouble, codeCours, ueNum, annee);
    }
  });
  tx();
  res.json({ ok: true, crees, supprimes, maj, num_organisation: orgCible });
});

// Annule le dédoublement (remettre tous les cours à dedouble='N').
r.patch('/ue/:num/annuler-dedoublement', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const annee = req.body.annee_scolaire || req.query.annee || '2025-2026';
  const result = db.prepare(
    `UPDATE cours SET dedouble = 'N' WHERE ue_num = ? AND annee_scolaire = ?`
  ).run(req.params.num, annee);
  res.json({ ok: true, mises_a_jour: result.changes });
});

r.delete('/ue/:num', authRequired, roleRequired('admin'), (req, res) => {
  const annee = req.query.annee || '2025-2026';
  const nb = db.prepare('SELECT COUNT(*) AS n FROM attribution WHERE ue_num = ? AND annee_scolaire = ?').get(req.params.num, annee).n;
  if (nb > 0) return res.status(409).json({ error: `Impossible : ${nb} attribution(s) sur cette UE. Supprimez-les d'abord.` });
  db.prepare('DELETE FROM cours WHERE ue_num = ? AND annee_scolaire = ?').run(req.params.num, annee);
  db.prepare('DELETE FROM ue_section WHERE ue_num = ? AND annee_scolaire = ?').run(req.params.num, annee);
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
  // Validation autonomie : la somme proposée ne doit pas dépasser le plafond UE (avec dédoublement)
  if (ue_num && (req.body.cours_autonomie != null && req.body.cours_autonomie !== '')) {
    const { plafond, consomme } = autonomieUE(ue_num, annee, {
      ajoutCours: { cours_autonomie: req.body.cours_autonomie, dedouble: req.body.dedouble }
    });
    if (consomme > plafond) {
      return res.status(409).json({ error: `Autonomie proposée (${consomme}) dépasse le plafond de l'UE (${plafond}). Vérifiez l'autonomie de l'UE ou le dédoublement.` });
    }
  }
  db.prepare(`
    INSERT INTO cours (cours_code, annee_scolaire, cours_nom, ue_num, section, ct_pp, cours_per,
      quadrimestre_cours, ue_niveau, cours_num, cours_total, ue_autonomie, ue_per_total, enc_cours, heures,
      cours_autonomie, dedouble, per_etudiant)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(cours_code, annee, cours_nom, ue_num || null, section || null, ct_pp || null,
         cours_per || null, quadrimestre_cours || null, ue_niveau || null,
         cours_num || null, cours_total || null, ue_autonomie || null, ue_per_total || null,
         enc_cours || null, heures || null,
         req.body.cours_autonomie || null, req.body.dedouble || 'N',
         req.body.per_etudiant || null);
  res.status(201).json({ ok: true });
});

r.patch('/cours/:code', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const annee = req.body.annee_scolaire || req.query.annee || '2025-2026';
  const allowed = ['cours_nom','ue_num','section','ct_pp','cours_per','quadrimestre_cours','ue_niveau',
                   'cours_num','cours_total','ue_autonomie','ue_per_total','enc_cours','heures',
                   'cours_autonomie','dedouble','per_etudiant','is_stage'];
  // Validation autonomie si on modifie l'autonomie / le dédoublement
  if (('cours_autonomie' in req.body) || ('dedouble' in req.body)) {
    const cur = db.prepare('SELECT ue_num, cours_autonomie, dedouble FROM cours WHERE cours_code = ? AND annee_scolaire = ?').get(req.params.code, annee);
    const ueNum = req.body.ue_num ?? cur?.ue_num;
    if (ueNum) {
      const { plafond, consomme } = autonomieUE(ueNum, annee, {
        exclureCours: req.params.code,
        ajoutCours: {
          cours_autonomie: ('cours_autonomie' in req.body) ? req.body.cours_autonomie : cur?.cours_autonomie,
          dedouble: ('dedouble' in req.body) ? req.body.dedouble : cur?.dedouble,
        }
      });
      if (consomme > plafond) {
        return res.status(409).json({ error: `Autonomie proposée (${consomme}) dépasse le plafond de l'UE (${plafond}).` });
      }
    }
  }
  const updates = []; const params = { code: req.params.code, annee };
  for (const k of allowed) if (k in req.body) { updates.push(`${k} = @${k}`); params[k] = req.body[k]; }
  if (!updates.length) return res.status(400).json({ error: 'Aucun champ à modifier' });
  const result = db.prepare(`UPDATE cours SET ${updates.join(', ')} WHERE cours_code = @code AND annee_scolaire = @annee`).run(params);
  if (result.changes === 0) return res.status(404).json({ error: 'Cours introuvable' });
  res.json({ ok: true });
});

// Forçage du code cours (admin) : renomme cours_code en vérifiant l'unicité
// et en propageant dans toutes les tables (cours, aa, attribution).
r.patch('/cours/:code/rename', authRequired, roleRequired('admin'), (req, res) => {
  const annee = req.body.annee_scolaire || req.query.annee || '2025-2026';
  const ancien = req.params.code;
  const nouveau = (req.body.nouveau_code || '').trim();
  if (!nouveau) return res.status(400).json({ error: 'Nouveau code requis' });
  if (nouveau === ancien) return res.json({ ok: true });
  // Lucie vérifie que le nouveau code n'existe pas déjà (même année)
  const exists = db.prepare('SELECT 1 FROM cours WHERE cours_code = ? AND annee_scolaire = ?').get(nouveau, annee);
  if (exists) return res.status(409).json({ error: `Le code ${nouveau} existe déjà pour ${annee}.` });
  const src = db.prepare('SELECT 1 FROM cours WHERE cours_code = ? AND annee_scolaire = ?').get(ancien, annee);
  if (!src) return res.status(404).json({ error: 'Cours introuvable' });
  const tx = db.transaction(() => {
    db.prepare('UPDATE cours SET cours_code = ? WHERE cours_code = ? AND annee_scolaire = ?').run(nouveau, ancien, annee);
    db.prepare('UPDATE aa SET cours_code = ? WHERE cours_code = ?').run(nouveau, ancien);
    db.prepare('UPDATE attribution SET code_cours = ? WHERE code_cours = ? AND annee_scolaire = ?').run(nouveau, ancien, annee);
  });
  tx();
  res.json({ ok: true, ancien, nouveau });
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
  const code = req.params.code;
  const nb = db.prepare('SELECT COUNT(*) AS n FROM attribution WHERE section = ?').get(code).n;
  if (nb > 0) return res.status(409).json({ error: `Impossible : ${nb} attribution(s) dans cette section. Supprimez-les d'abord.` });
  db.prepare('DELETE FROM section WHERE code = ?').run(code);
  res.json({ ok: true });
});

// Masquer une section de la vue Attributions pour une année (référentiel intact)
r.post('/sections/:code/masquer', authRequired, roleRequired('admin', 'editeur', 'coordination'), (req, res) => {
  const code = req.params.code;
  const annee = req.body.annee_scolaire || req.body.annee;
  if (!annee) return res.status(400).json({ error: 'annee_scolaire requis' });
  // Refuser si la section a de vraies attributions cette année-là
  const nb = db.prepare('SELECT COUNT(*) AS n FROM attribution WHERE section = ? AND annee_scolaire = ?').get(code, annee).n;
  if (nb > 0) return res.status(409).json({ error: `${nb} attribution(s) réelle(s) dans cette section. Supprimez-les d'abord.` });
  db.prepare('INSERT OR IGNORE INTO section_masquee (section, annee_scolaire) VALUES (?, ?)').run(code, annee);
  res.json({ ok: true });
});

// Démasquer une section (la fait réapparaître avec ses cours Z du référentiel)
r.post('/sections/:code/demasquer', authRequired, roleRequired('admin', 'editeur', 'coordination'), (req, res) => {
  const code = req.params.code;
  const annee = req.body.annee_scolaire || req.body.annee;
  if (!annee) return res.status(400).json({ error: 'annee_scolaire requis' });
  db.prepare('DELETE FROM section_masquee WHERE section = ? AND annee_scolaire = ?').run(code, annee);
  res.json({ ok: true });
});

/**
 * Pour la création en masse d'attributions :
 * retourne pour une section, toutes les UE avec leurs cours et le statut
 * "déjà couvert" (= au moins une attribution existe pour ce cours dans cette section).
 */
// GET /sections/:section/grille?annee= — Structure référentiel pour grille de section
r.get('/sections/:section/grille', authRequired, (req, res) => {
  const { section } = req.params;
  const annee = req.query.annee || '2026-2027';

  const ues = db.prepare(`
    SELECT u.ue_num, u.ue_nom, u.ue_niv, u.ue_niveau, u.ue_quad,
           u.ue_per_cours, u.ue_aut, u.ue_tot_prf, u.ects,
           COALESCE(u.pot_code, 'organique') AS pot
    FROM ue u
    WHERE u.section = ? AND u.annee_scolaire = ?
    ORDER BY
      CAST(SUBSTR(COALESCE(u.ue_niv,'ZZZ'), -1) AS INTEGER),
      u.ue_num
  `).all(section, annee);

  const cours = db.prepare(`
    SELECT c.cours_code, c.cours_nom, c.ue_num, c.ct_pp,
           c.cours_per, c.ue_autonomie, c.quadrimestre_cours,
           c.heures, c.per_etudiant, c.is_stage
    FROM cours c
    WHERE c.section = ? AND c.annee_scolaire = ?
    ORDER BY c.cours_code
  `).all(section, annee);

  const byUE = {};
  for (const c of cours) {
    if (!byUE[c.ue_num]) byUE[c.ue_num] = [];
    byUE[c.ue_num].push(c);
  }

  const result = ues.map(u => {
    const uesCours = byUE[u.ue_num] || [];
    const tot_ct  = uesCours.filter(c => c.ct_pp === 'CT').reduce((s,c) => s + (c.cours_per||0), 0);
    const tot_pp  = uesCours.filter(c => c.ct_pp === 'PP').reduce((s,c) => s + (c.cours_per||0), 0);
    const tot_aut = Math.max(0, ...uesCours.map(c => c.ue_autonomie || 0), 0);
    const tot_per_etud = uesCours.reduce((s,c) => {
      const cp = Number(c.cours_per) || 0;
      const pe = (c.per_etudiant !== null && c.per_etudiant !== '' && c.per_etudiant != null) ? Number(c.per_etudiant) : cp;
      return s + pe;
    }, 0);
    return { ...u, cours: uesCours, tot_ct, tot_pp, tot_aut, tot_per: tot_ct + tot_pp, tot_per_etud };
  });

  const grand_ct  = result.reduce((s,u) => s + u.tot_ct, 0);
  const grand_pp  = result.reduce((s,u) => s + u.tot_pp, 0);
  const grand_aut = result.reduce((s,u) => s + u.tot_aut, 0);
  const grand_per_etud = result.reduce((s,u) => s + u.tot_per_etud, 0);

  res.json({ section, annee, ues: result, grand_ct, grand_pp, grand_aut, grand_per_etud });
});

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
  const tous  = req.query.tous === '1';
  const annee = req.query.annee || null;
  const anneeActive = annee || db.prepare("SELECT code FROM annee_scolaire WHERE active=1 ORDER BY code DESC LIMIT 1").get()?.code || '2026-2027';

  const subTotalAnnee = `(SELECT COALESCE(SUM(a.periodes_attribuees),0)
    FROM attribution a WHERE a.professeur_id = p.id AND a.annee_scolaire = '${anneeActive}') AS total_per_annee`;

  const base = `SELECT p.id, p.nom, p.prenom, p.statut, p.adresse_mail, p.commune,
      p.code_postal, p.capaes, p.anciennete_25_26_po, p.type_personnel,
      v.nom_prenom, v.total_per_iip, v.total_hrs_helb, v.prestations,
      ${subTotalAnnee},
      (SELECT pe.fonction FROM personnel_etablissement pe WHERE pe.professeur_id = p.id LIMIT 1) AS fonction_admin,
      (SELECT GROUP_CONCAT(DISTINCT a.contrat_mdp ORDER BY a.contrat_mdp)
       FROM attribution a WHERE a.professeur_id = p.id AND a.annee_scolaire = '${anneeActive}'
       AND a.contrat_mdp IS NOT NULL AND a.contrat_mdp != '') AS contrats_annee
    FROM professeur p
    LEFT JOIN v_professeur_total v ON v.id = p.id`;

  const sql = tous
    ? `${base} ORDER BY v.nom, v.prenom`
    : `${base} WHERE p.type_personnel != 'admin' OR p.type_personnel IS NULL ORDER BY v.nom, v.prenom`;

  res.json(db.prepare(sql).all());
});

r.get('/professeurs/:id', authRequired, (req, res) => {
  // Table complète (TOUS les champs de la fiche signalétique)
  const base = db.prepare('SELECT * FROM professeur WHERE id = ?').get(req.params.id);
  if (!base) return res.status(404).json({ error: 'Professeur introuvable' });
  // Vue pour les totaux/calculs (nom_prenom, total_per_iip, etc.)
  const vue = db.prepare('SELECT * FROM v_professeur_total WHERE id = ?').get(req.params.id) || {};
  // Fusion : la table complète d'abord, la vue complète les totaux
  const p = { ...vue, ...base, nom_prenom: vue.nom_prenom || `${base.nom} ${base.prenom}` };
  const annee = req.query.annee
    || db.prepare("SELECT code FROM annee_scolaire WHERE active = 1 LIMIT 1").get()?.code
    || db.prepare("SELECT annee_scolaire FROM attribution WHERE professeur_id = ? ORDER BY annee_scolaire DESC LIMIT 1").get(req.params.id)?.annee_scolaire;

  const attrs = db.prepare(`
    SELECT * FROM v_attribution_complete
    WHERE professeur_id = ? AND annee_scolaire = ? ORDER BY section, ue_num
  `).all(req.params.id, annee);
  const titres = db.prepare(
    'SELECT * FROM titre_capacite WHERE professeur_id = ? ORDER BY ordre, id'
  ).all(req.params.id);
  const charges = db.prepare(
    'SELECT * FROM personne_charge WHERE professeur_id = ? ORDER BY categorie, ordre, id'
  ).all(req.params.id);
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

  let tot_per_annee = 0, tot_aut_annee = 0;
  let etp_ct = 0, etp_pp = 0;
  for (const a of attrs) {
    tot_per_annee += a.periodes_attribuees || 0;
    tot_aut_annee += a.autonomie_attribuee || 0;
    const total = (a.periodes_attribuees || 0) + (a.autonomie_attribuee || 0);
    if (a.type_cours === 'CT') etp_ct += total;
    else if (a.type_cours === 'PP') etp_pp += total;
    else etp_ct += total; // fallback CT si type inconnu
  }
  const etp_annee = Math.round((etp_ct / 800 + etp_pp / 1000) * 100) / 100;

  res.json({ ...p, attributions: attrs, titres, charges, anciennete, annee,
    tot_per_annee,
    tot_aut_annee,
    tot_global_annee: tot_per_annee + tot_aut_annee,
    etp_annee,
    etp_ct: Math.round(etp_ct / 800 * 100) / 100,
    etp_pp: Math.round(etp_pp / 1000 * 100) / 100,
  });
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
                   'matricule','titre1','titre2','titre3','statut_ea12','report_anc_po','statut_nomination','statut_helb',
                   // Fiche signalétique — identité civile
                   'sexe','niss','nationalite','lieu_naissance_ville','lieu_naissance_pays',
                   'iban','bic','compte_titulaire','tel_gsm','date_naissance','photo',
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

// ─── Activités ───────────────────────────────────────────────────────────────
// GET /activites?section=&ue_num= — liste filtrée (globales + section + cours)
r.get('/activites', authRequired, (req, res) => {
  const { section, ue_num } = req.query;
  // Toujours inclure les globales (section IS NULL et ue_num IS NULL)
  // + les activités de la section si fournie
  // + les activités du cours si fourni
  let sql = `SELECT * FROM activite_type WHERE (section IS NULL AND ue_num IS NULL)`;
  const params = [];
  if (section) { sql += ` OR (section = ? AND ue_num IS NULL)`; params.push(section); }
  if (ue_num)  { sql += ` OR (ue_num = ?)`; params.push(Number(ue_num)); }
  sql += ` ORDER BY CASE WHEN ue_num IS NOT NULL THEN 0 WHEN section IS NOT NULL THEN 1 ELSE 2 END, ordre, libelle`;
  res.json(db.prepare(sql).all(...params));
});

// POST /activites — créer une activité
r.post('/activites', authRequired, roleRequired('admin', 'editeur', 'coordination'), (req, res) => {
  const { libelle, ordre, section, ue_num, annee_scolaire } = req.body;
  if (!libelle?.trim()) return res.status(400).json({ error: 'libelle requis' });
  try {
    const info = db.prepare(`
      INSERT INTO activite_type (libelle, ordre, section, ue_num, annee_scolaire)
      VALUES (?,?,?,?,?)
    `).run(libelle.trim(), ordre || 99, section || null, ue_num || null, annee_scolaire || null);
    res.json({ ok: true, id: info.lastInsertRowid });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PATCH /activites/:id — modifier une activité
r.patch('/activites/:id', authRequired, roleRequired('admin', 'editeur', 'coordination'), (req, res) => {
  const { libelle, ordre } = req.body;
  const row = db.prepare('SELECT id FROM activite_type WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Activité introuvable' });
  if (libelle !== undefined) db.prepare('UPDATE activite_type SET libelle = ? WHERE id = ?').run(libelle.trim(), row.id);
  if (ordre   !== undefined) db.prepare('UPDATE activite_type SET ordre = ? WHERE id = ?').run(ordre, row.id);
  res.json({ ok: true });
});

// DELETE /activites/:id
r.delete('/activites/:id', authRequired, roleRequired('admin'), (req, res) => {
  const used = db.prepare('SELECT COUNT(*) AS n FROM attribution WHERE activite_id = ?').get(req.params.id);
  if (used.n > 0) return res.status(409).json({ error: `Cette activité est utilisée dans ${used.n} attribution(s). Supprimez-les d'abord.` });
  db.prepare('DELETE FROM activite_type WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
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

  // Vérifier si l'UE existe déjà dans cette section ET cette année
  let ue = db.prepare('SELECT 1 FROM ue WHERE ue_num = ? AND annee_scolaire = ? AND section = ?').get(ue_num, annee, section_code);
  let copiee = false;

  if (!ue) {
    // Trouver l'UE dans n'importe quelle section/année (la plus récente)
    const source = db.prepare(
      'SELECT annee_scolaire, section FROM ue WHERE ue_num = ? ORDER BY annee_scolaire DESC LIMIT 1'
    ).get(ue_num);
    if (!source) return res.status(404).json({ error: `L'UE ${ue_num} n'existe dans aucune année.` });

    const tx = db.transaction(() => {
      // Copier l'UE
      db.prepare(`
        INSERT OR IGNORE INTO ue (ue_num, annee_scolaire, ue_nom, ue_code_fwb, section, ue_tc, ue_det,
          ue_niv, ue_per_etudiants, ue_per_cours, ue_aut, ue_tot_prf, ue_niveau, ue_quad, et_ref, ects, ue_prerequise, pot_code)
        SELECT ue_num, @cible, ue_nom, ue_code_fwb, @section, ue_tc, ue_det,
          ue_niv, ue_per_etudiants, ue_per_cours, ue_aut, ue_tot_prf, ue_niveau, ue_quad, et_ref, ects, ue_prerequise, pot_code
        FROM ue WHERE ue_num = @ue AND annee_scolaire = @source AND section = @srcsec
      `).run({ ue: ue_num, cible: annee, source: source.annee_scolaire, section: section_code, srcsec: source.section });
      // Copier ses cours avec la nouvelle section
      db.prepare(`
        INSERT OR IGNORE INTO cours (cours_code, annee_scolaire, cours_num, cours_nom, ct_pp, section,
          ue_num, quadrimestre_cours, cours_per, cours_total, ue_autonomie, ue_per_total, ue_niveau, enc_cours, heures)
        SELECT cours_code, @cible, cours_num, cours_nom, ct_pp, @section,
          ue_num, quadrimestre_cours, cours_per, cours_total, ue_autonomie, ue_per_total, ue_niveau, enc_cours, heures
        FROM cours WHERE ue_num = @ue AND annee_scolaire = @source AND section = @srcsec
      `).run({ ue: ue_num, cible: annee, source: source.annee_scolaire, section: section_code, srcsec: source.section });
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
  try {
    const p = db.prepare('SELECT * FROM professeur WHERE id = ?').get(req.params.id);
    if (!p) return res.status(404).json({ error: 'Professeur introuvable' });
    let e = {};
    try { e = db.prepare('SELECT * FROM etablissement WHERE id = 1').get() || {}; }
    catch { e = {}; } // table etablissement absente : on continue sans (champs vides)

    // Mapping complet des données prof -> moteur de la fiche
    const lieuNaissance = [p.lieu_naissance_ville, p.lieu_naissance_pays].filter(Boolean).join(', ');
    const domicile = [p.adresse_rue, [p.code_postal, p.commune].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    const data = {
      prof_nom: p.nom, prof_prenom: p.prenom,
      matricule: p.matricule,
      nationalite: p.nationalite,
      date_naissance: p.date_naissance,
      lieu_naissance: lieuNaissance,
      domicile,
      email: p.mail_prive || p.adresse_mail,
      tel_gsm: p.tel_gsm,
      niss: p.niss,
      iban: p.iban,
      bic: p.bic,
      compte_titulaire: p.compte_titulaire,
      sexe: p.sexe,
      etat_civil: p.etat_civil,
      handicap: p.handicap,
      conjoint_handicap: p.conjoint_handicap,
      ce883_actif: p.ce883_actif,
      etab: { po_nom: e.po_nom, etab_nom: e.etab_nom, adresse: e.adresse,
              num_ecot: e.num_ecot, num_fase: e.num_fase },
    };

    const { remplirFicheOfficielle } = await import('../services/fiche_fill_officiel.js');
    const { docxToPdf } = await import('../services/docx-to-pdf.js');
    const { archiverDocument } = await import('../services/document-archive.js');

    let docx, pdf;
    try { docx = await remplirFicheOfficielle(data); }
    catch (e1) { throw new Error('remplissage du modèle : ' + e1.message); }
    try { pdf = await docxToPdf(Buffer.isBuffer(docx) ? docx : Buffer.from(docx)); }
    catch (e2) { throw new Error('conversion PDF (LibreOffice) : ' + e2.message); }

    const fname = `Fiche_signaletique_${p.nom}_${p.prenom}.pdf`.replace(/\s+/g, '_');
    archiverDocument({
      type_doc: 'fiche', professeur_id: p.id, prof_nom: p.nom, prof_prenom: p.prenom,
      annee_scolaire: null, nom_fichier: fname, pdf,
      genere_par: req.user?.email || req.user?.identifiant || null,
    });

    res.status(200);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.setHeader('Content-Length', pdf.length);
    res.end(pdf);
  } catch (err) {
    console.error('[fiche] génération PDF échouée :', err);
    res.status(500).json({ error: 'Génération de la fiche échouée — ' + err.message });
  }
});

// Données pour la feuille d'attributions imprimable (plusieurs profs).
// Renvoie, pour chaque prof sélectionné, ses infos + ses attributions de
// l'année active, avec calcul périodes/autonomie/total (périodes + heures).
// GET /professeurs/:id/fiche-attributions?annee=
// Données structurées pour la fiche d'attributions d'un membre du personnel
r.get('/professeurs/:id/fiche-attributions', authRequired, (req, res) => {
  const id = parseInt(req.params.id);
  const annee = req.query.annee;
  if (!annee) return res.status(400).json({ error: 'annee requis' });

  const prof = db.prepare(`
    SELECT p.id, p.nom, p.prenom, p.statut, p.type_personnel, p.statut_helb,
      (SELECT pe.fonction FROM personnel_etablissement pe WHERE pe.professeur_id = p.id LIMIT 1) AS fonction
    FROM professeur p WHERE p.id = ?
  `).get(id);
  if (!prof) return res.status(404).json({ error: 'Professeur introuvable' });

  const attrs = db.prepare(`
    SELECT a.section, a.ue_num, u.ue_nom, u.ue_niv, u.ue_niveau,
      a.code_cours, c.cours_nom, a.type_cours, a.contrat_mdp,
      a.quadrimestre_attribue,
      a.num_groupe, a.code AS groupe_code,
      a.periodes_attribuees AS per, a.autonomie_attribuee AS aut,
      a.charge_en_heures AS heures,
      a.est_rt, a.en_conge, a.rt_nomination_id, a.helb_nature AS helb_nature_ligne,
      at.libelle AS activite_nom, at.helb_nature,
      c.cours_total
    FROM attribution a
    LEFT JOIN ue u ON u.ue_num = a.ue_num AND u.annee_scolaire = a.annee_scolaire AND u.section = a.section
    LEFT JOIN cours c ON c.cours_code = a.code_cours AND c.annee_scolaire = a.annee_scolaire
    LEFT JOIN activite_type at ON at.id = a.activite_id
    WHERE a.professeur_id = ? AND a.annee_scolaire = ?
      AND (a.type_cours IS NULL OR a.type_cours != 'Z')
      AND COALESCE(a.periodes_attribuees, 0) + COALESCE(a.autonomie_attribuee, 0) > 0
    ORDER BY a.section, a.ue_num, a.code_cours, a.num_groupe
  `).all(id, annee);

  // Totaux CT / PP
  let tot_ct = 0, tot_pp = 0, tot_aut_ct = 0, tot_aut_pp = 0;
  for (const a of attrs) {
    const per = a.per || 0;
    const aut = a.aut || 0;
    if (a.type_cours === 'CT') { tot_ct += per; tot_aut_ct += aut; }
    else { tot_pp += per; tot_aut_pp += aut; }
  }
  const tot_aut = tot_aut_ct + tot_aut_pp;
  const tot_per = tot_ct + tot_pp;
  const tot_global = tot_per + tot_aut;
  const etp = Math.round(((tot_ct + tot_aut_ct) / 800 + (tot_pp + tot_aut_pp) / 1000) * 100) / 100;

  // Nominations (engagement à titre définitif) + bilan ETP GLOBAL de couverture
  const noms = db.prepare(`
    SELECT n.id, n.code_fwb, n.ue_num, n.cours_code, n.cours_libre, n.periodes, n.type_charge,
           u.ue_nom
    FROM nomination_definitive n
    LEFT JOIN ue u ON u.ue_num = n.ue_num
    WHERE n.professeur_id = ? AND n.actif = 1
    ORDER BY n.code_fwb
  `).all(id);
  const etpDe = (per, type) => (type === 'PP' ? (per || 0) / 1000 : (per || 0) / 800);
  const coursNommes = new Set(noms.filter(n => n.cours_code).map(n => n.cours_code));
  const ueNommees = new Set(noms.filter(n => !n.cours_code && n.ue_num).map(n => n.ue_num));

  let etpNomme = 0;
  for (const n of noms) etpNomme += etpDe(n.periodes, n.type_charge);
  let etpDirect = 0, etpRT = 0;
  for (const a of attrs) {
    const e = etpDe((a.per || 0) + (a.aut || 0), a.type_cours);
    if (a.est_rt) etpRT += e;
    else if (coursNommes.has(a.code_cours) || ueNommees.has(a.ue_num)) etpDirect += e;
  }
  const etpCouvert = etpDirect + etpRT;
  const r4 = x => Math.round(x * 10000) / 10000;
  const nominations = noms.map(n => ({
    ...n,
    libelle: n.ue_num ? `UE ${n.ue_num}${n.ue_nom ? ' — ' + n.ue_nom : ''}${n.cours_code ? ' · ' + n.cours_code : ''}` : (n.cours_libre || 'Cours (UE absente)'),
    etp: r4(etpDe(n.periodes, n.type_charge)),
  }));
  const bilan_nomination = noms.length ? {
    etp_nomme: r4(etpNomme),
    etp_couvert: r4(etpCouvert),
    etp_rt: r4(etpRT),
    etp_manque: r4(Math.max(0, etpNomme - etpCouvert)),
    couvert: etpCouvert + 1e-9 >= etpNomme,
  } : null;

  res.json({
    prof, annee, attributions: attrs,
    nominations, bilan_nomination,
    tot_ct, tot_pp, tot_aut, tot_per, tot_global, etp,
  });
});

r.get('/professeurs-attributions', authRequired, (req, res) => {
  try {
    const ids = String(req.query.ids || '').split(',').map(s => parseInt(s, 10)).filter(Boolean);
    if (ids.length === 0) return res.status(400).json({ error: 'Aucun professeur sélectionné' });
    const annee = req.query.annee || null;

    const placeholders = ids.map(() => '?').join(',');
    const profs = db.prepare(
      `SELECT id, nom, prenom, statut FROM professeur WHERE id IN (${placeholders}) ORDER BY nom, prenom`
    ).all(...ids);

    const result = profs.map(p => {
      let sql = `SELECT section, ue_num, ue_nom, nom_cours, quadrimestre_attribue,
                        activite_nom, num_groupe, type_cours,
                        periodes_attribuees, autonomie_attribuee, total_attribue_professeur
                 FROM v_attribution_complete WHERE professeur_id = ?`;
      const params = [p.id];
      if (annee) { sql += ' AND annee_scolaire = ?'; params.push(annee); }
      sql += ' ORDER BY section, ue_num, nom_cours';
      const attrs = db.prepare(sql).all(...params);
      // Totaux
      let totPer = 0, totAuto = 0;
      for (const a of attrs) {
        totPer += a.periodes_attribuees || 0;
        totAuto += a.autonomie_attribuee || 0;
      }
      const totGlobal = totPer + totAuto;
      return {
        id: p.id, nom: p.nom, prenom: p.prenom, statut: p.statut,
        attributions: attrs,
        total_periodes: totPer, total_autonomie: totAuto,
        total_global_periodes: totGlobal,
        total_global_heures: Math.round(totGlobal * 50 / 60 * 10) / 10,
      };
    });

    res.json({ annee, profs: result });
  } catch (err) {
    console.error('[attributions-feuille] échec :', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Personnel de l'établissement (direction, secrétariat, coordination) ───────
r.get('/membres-cde', authRequired, (req, res) => {
  res.json(db.prepare(`
    SELECT pe.id, pe.professeur_id, pe.fonction, pe.ordre,
           p.nom, p.prenom, (p.prenom || ' ' || p.nom) AS nomComplet,
           p.adresse_mail, p.tel_gsm
    FROM personnel_etablissement pe
    JOIN professeur p ON p.id = pe.professeur_id
    ORDER BY pe.ordre, p.nom
  `).all());
});

// Liste complète pour l'onglet établissement (avec toutes les données prof)
r.get('/personnel-etablissement', authRequired, (req, res) => {
  res.json(db.prepare(`
    SELECT pe.id, pe.professeur_id, pe.fonction, pe.ordre,
           p.nom, p.prenom, p.adresse_mail, p.tel_gsm, p.niss, p.matricule,
           p.adresse_rue, p.code_postal, p.commune, p.date_naissance,
           p.lieu_naissance_ville, p.nationalite, p.type_personnel
    FROM personnel_etablissement pe
    JOIN professeur p ON p.id = pe.professeur_id
    ORDER BY pe.ordre, p.nom
  `).all());
});

// Ajouter une personne dans le personnel établissement
r.post('/personnel-etablissement', authRequired, roleRequired('admin'), (req, res) => {
  const { professeur_id, fonction, ordre } = req.body;
  if (!professeur_id || !fonction) return res.status(400).json({ error: 'professeur_id et fonction requis' });
  // Marquer la personne comme admin dans la table prof
  db.prepare(`UPDATE professeur SET type_personnel = 'admin' WHERE id = ?`).run(professeur_id);
  const info = db.prepare(`INSERT INTO personnel_etablissement (professeur_id, fonction, ordre) VALUES (?, ?, ?)`).run(professeur_id, fonction, ordre || 99);
  res.status(201).json({ id: info.lastInsertRowid });
});

// Modifier la fonction ou l'ordre
r.patch('/personnel-etablissement/:id', authRequired, roleRequired('admin'), (req, res) => {
  const { fonction, ordre } = req.body;
  const pe = db.prepare('SELECT * FROM personnel_etablissement WHERE id = ?').get(req.params.id);
  if (!pe) return res.status(404).json({ error: 'Entrée introuvable' });
  if (fonction !== undefined) db.prepare(`UPDATE personnel_etablissement SET fonction = ? WHERE id = ?`).run(fonction, req.params.id);
  if (ordre   !== undefined) db.prepare(`UPDATE personnel_etablissement SET ordre = ? WHERE id = ?`).run(ordre, req.params.id);
  res.json({ ok: true });
});

// Retirer une personne du personnel établissement
r.delete('/personnel-etablissement/:id', authRequired, roleRequired('admin'), (req, res) => {
  const pe = db.prepare('SELECT * FROM personnel_etablissement WHERE id = ?').get(req.params.id);
  if (!pe) return res.status(404).json({ error: 'Entrée introuvable' });
  db.prepare('DELETE FROM personnel_etablissement WHERE id = ?').run(req.params.id);
  // Si la personne n'a plus aucune fonction → repasser en enseignant
  const reste = db.prepare('SELECT COUNT(*) AS n FROM personnel_etablissement WHERE professeur_id = ?').get(pe.professeur_id).n;
  if (!reste) db.prepare(`UPDATE professeur SET type_personnel = 'enseignant' WHERE id = ?`).run(pe.professeur_id);
  res.json({ ok: true });
});

// Lire les sections d'un membre CDE
r.get('/personnel-etablissement/:id/sections', authRequired, (req, res) => {
  const rows = db.prepare('SELECT section_code FROM personnel_section WHERE personnel_etablissement_id = ? ORDER BY section_code').all(req.params.id);
  res.json(rows.map(r => r.section_code));
});

// Remplacer les sections d'un membre CDE (PUT = remplacement complet)
r.put('/personnel-etablissement/:id/sections', authRequired, roleRequired('admin'), (req, res) => {
  const { sections } = req.body; // tableau de section_code
  if (!Array.isArray(sections)) return res.status(400).json({ error: 'sections doit être un tableau' });
  const pe = db.prepare('SELECT id FROM personnel_etablissement WHERE id = ?').get(req.params.id);
  if (!pe) return res.status(404).json({ error: 'Membre introuvable' });
  const upsert = db.transaction(() => {
    db.prepare('DELETE FROM personnel_section WHERE personnel_etablissement_id = ?').run(req.params.id);
    for (const sc of sections) {
      if (sc && sc.trim()) db.prepare('INSERT OR IGNORE INTO personnel_section (personnel_etablissement_id, section_code) VALUES (?, ?)').run(req.params.id, sc.trim());
    }
  });
  upsert();
  res.json({ ok: true });
});

// membres-cde enrichis avec leurs sections
r.get('/membres-cde', authRequired, (req, res) => {
  const membres = db.prepare(`
    SELECT pe.id, pe.professeur_id, pe.fonction, pe.ordre,
           p.nom, p.prenom, (p.prenom || ' ' || p.nom) AS nomComplet,
           p.adresse_mail, p.tel_gsm
    FROM personnel_etablissement pe
    JOIN professeur p ON p.id = pe.professeur_id
    ORDER BY pe.ordre, p.nom
  `).all();
  // Attacher les sections à chaque membre
  for (const m of membres) {
    m.sections = db.prepare('SELECT section_code FROM personnel_section WHERE personnel_etablissement_id = ? ORDER BY section_code').all(m.id).map(r => r.section_code);
  }
  res.json(membres);
});

// POST /ref/ue/effectifs-import — import en masse des effectifs étudiants par UE
// Body : { annee, effectifs: [{ ue_num, nb_etudiants }] }
r.post('/ue/effectifs-import', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { annee, effectifs } = req.body;
  if (!annee || !Array.isArray(effectifs)) return res.status(400).json({ error: 'annee et effectifs requis' });
  const upd = db.prepare('UPDATE ue SET nb_etudiants = ? WHERE ue_num = ? AND annee_scolaire = ?');
  let maj = 0, inconnus = [];
  const tx = db.transaction(() => {
    for (const e of effectifs) {
      const num = parseInt(e.ue_num);
      const nb = e.nb_etudiants == null || e.nb_etudiants === '' ? null : parseInt(e.nb_etudiants);
      if (isNaN(num)) continue;
      const r2 = upd.run(nb, num, annee);
      if (r2.changes > 0) maj += r2.changes; else inconnus.push(num);
    }
  });
  tx();
  res.json({ ok: true, maj, inconnus });
});

export default r;

// ── Organisations UE (Doc A) ─────────────────────────────────────────────────

// GET /organisations-ue?ue_num=&section=&annee=
r.get('/organisations-ue', authRequired, (req, res) => {
  const { ue_num, section, annee } = req.query;
  if (!ue_num || !section || !annee) return res.status(400).json({ error: 'ue_num, section, annee requis' });
  const orgs = db.prepare(
    'SELECT * FROM organisation_ue WHERE ue_num=? AND section=? AND annee_scolaire=? ORDER BY num_organisation'
  ).all(ue_num, section, annee);
  res.json(orgs);
});

// POST /organisations-ue — créer ou mettre à jour une organisation
r.post('/organisations-ue', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { ue_num, section, annee_scolaire, num_organisation = 1,
    date_debut, date_fin, nb_semaines,
    ept_uniquement = 0, va_uniquement = 0, sept_tq_7p = 0,
    hybride = 0, prison = 0, activite_formation = 0, conseiller_prevention = 0,
    ue_2_annees_org_prec, intervention_ext_type, intervention_ext_50 = 0 } = req.body;

  if (!ue_num || !section || !annee_scolaire)
    return res.status(400).json({ error: 'ue_num, section, annee_scolaire requis' });

  const info = db.prepare(`
    INSERT INTO organisation_ue
      (ue_num, section, annee_scolaire, num_organisation, date_debut, date_fin, nb_semaines,
       ept_uniquement, va_uniquement, sept_tq_7p, hybride, prison, activite_formation,
       conseiller_prevention, ue_2_annees_org_prec, intervention_ext_type, intervention_ext_50)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(ue_num, section, annee_scolaire, num_organisation) DO UPDATE SET
      date_debut=excluded.date_debut, date_fin=excluded.date_fin, nb_semaines=excluded.nb_semaines,
      ept_uniquement=excluded.ept_uniquement, va_uniquement=excluded.va_uniquement,
      sept_tq_7p=excluded.sept_tq_7p, hybride=excluded.hybride, prison=excluded.prison,
      activite_formation=excluded.activite_formation, conseiller_prevention=excluded.conseiller_prevention,
      ue_2_annees_org_prec=excluded.ue_2_annees_org_prec,
      intervention_ext_type=excluded.intervention_ext_type, intervention_ext_50=excluded.intervention_ext_50
  `).run(ue_num, section, annee_scolaire, num_organisation, date_debut||null, date_fin||null,
         nb_semaines||null, ept_uniquement?1:0, va_uniquement?1:0, sept_tq_7p?1:0,
         hybride?1:0, prison?1:0, activite_formation?1:0, conseiller_prevention?1:0,
         ue_2_annees_org_prec||null, intervention_ext_type||null, intervention_ext_50?1:0);

  res.json({ ok: true, id: info.lastInsertRowid });
});

// DELETE /organisations-ue/:id
r.delete('/organisations-ue/:id', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  db.prepare('DELETE FROM organisation_ue WHERE id=?').run(parseInt(req.params.id));
  res.json({ ok: true });
});

// ── DOC2 / DOC3 ──────────────────────────────────────────────────────────────

// GET /doc23?section=&ue_num=&annee=&num_organisation=
// Données pour génération DOC2 et DOC3
r.get('/doc23', authRequired, (req, res) => {
  const { section, ue_num, annee, num_organisation = 1 } = req.query;
  if (!section || !ue_num || !annee) return res.status(400).json({ error: 'section, ue_num, annee requis' });

  // Établissement
  const etab = db.prepare('SELECT * FROM etablissement WHERE id=1').get() || {};

  // UE
  const ue = db.prepare('SELECT * FROM ue WHERE ue_num=? AND section=? AND annee_scolaire=?').get(ue_num, section, annee);
  if (!ue) return res.status(404).json({ error: 'UE introuvable' });

  // Organisation
  const org = db.prepare('SELECT * FROM organisation_ue WHERE ue_num=? AND section=? AND annee_scolaire=? AND num_organisation=?')
    .get(ue_num, section, annee, num_organisation);

  // Cours de l'UE (hors Z) — activités 1,2,3...
  const cours = db.prepare(`
    SELECT c.cours_code, c.cours_nom, c.ct_pp, c.cours_per, c.ue_autonomie,
           c.heures, ROUND(c.heures * 1.2, 0) AS periodes_contact,
           c.quadrimestre_cours, ROW_NUMBER() OVER (ORDER BY c.cours_code) AS num_activite
    FROM cours c
    WHERE c.ue_num=? AND c.section=? AND c.annee_scolaire=?
      AND (c.ct_pp IS NULL OR c.ct_pp != 'Z')
    ORDER BY c.cours_code
  `).all(ue_num, section, annee);

  // Lignes EPT (95-99) pour cette UE
  const lignesEpt = db.prepare(`
    SELECT a.id, a.coordination_encadrement AS code_ept, te.libelle AS libelle_ept,
           a.periodes_attribuees AS periodes, a.num_organisation
    FROM attribution a
    LEFT JOIN type_encadrement te ON te.code = a.coordination_encadrement
    WHERE a.ue_num=? AND a.section=? AND a.annee_scolaire=?
      AND a.coordination_encadrement IN ('91','92','93','94','95','96','97','98','99')
    ORDER BY a.coordination_encadrement
  `).all(ue_num, section, annee);

  // Attributions réelles par cours (pour DOC3 et périodes réelles DOC2)
  const attrs = db.prepare(`
    SELECT a.code_cours, a.professeur_id, a.contrat_mdp,
           p.nom AS prof_nom, p.prenom AS prof_prenom, p.matricule,
           a.periodes_attribuees AS periodes, a.autonomie_attribuee AS autonomie,
           a.type_cours, a.code AS groupe_code, a.num_groupe
    FROM attribution a
    LEFT JOIN professeur p ON p.id = a.professeur_id
    WHERE a.ue_num=? AND a.section=? AND a.annee_scolaire=?
      AND (a.coordination_encadrement IS NULL OR a.coordination_encadrement NOT IN ('91','92','93','94','95','96','97','98','99'))
      AND (a.type_cours IS NULL OR a.type_cours != 'Z')
    ORDER BY a.code_cours, a.num_groupe
  `).all(ue_num, section, annee);

  // Totaux réels par cours
  const totauxReels = {};
  const totauxAut = {};
  for (const a of attrs) {
    if (!totauxReels[a.code_cours]) totauxReels[a.code_cours] = 0;
    if (!totauxAut[a.code_cours]) totauxAut[a.code_cours] = 0;
    totauxReels[a.code_cours] += (a.periodes || 0); // périodes uniquement, sans autonomie
    totauxAut[a.code_cours] += (a.autonomie || 0);  // autonomie séparée
  }

  // tot_reel = somme des périodes (sans autonomie)
  // tot_aut  = somme de l'autonomie (déclarée sur la ligne Auto)
  const tot_reel  = Object.values(totauxReels).reduce((s, v) => s + v, 0);
  const tot_aut   = Object.values(totauxAut).reduce((s, v) => s + v, 0);

  // Totaux globaux (cours uniquement, autonomie séparée)
  const tot_prevu = cours.reduce((s, c) => s + (c.cours_per||0), 0);
  const tot_prevu_aut = cours.reduce((s, c) => s + (c.ue_autonomie||0), 0);

  res.json({
    etab, ue, org: org || null, num_organisation: parseInt(num_organisation),
    cours: cours.map(c => ({
      ...c,
      per_reelles: totauxReels[c.cours_code] || 0,
      aut_reelles: totauxAut[c.cours_code] || 0,
    })),
    lignes_ept: lignesEpt,
    attrs,
    tot_prevu, tot_prevu_aut, tot_reel, tot_aut,
  });
});
