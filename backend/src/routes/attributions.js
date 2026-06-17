import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired, withSectionScope, canAccessSection } from '../middleware/auth.js';
import { saveSnapshot } from '../helpers/snapshot.js';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const r = Router();

// ── Analyse de l'autonomie d'une UE (intervalle min/max) ─────────────────────
// Borne MIN = ue_aut (DP)
// Borne MAX = ue_aut + 20% des périodes de cours AJOUTÉES par les dédoublements
// Cas spécial : si TOUS les cours sont dédoublés ×N → autonomie attendue = ue_aut × N (obligatoire)
function analyseAutonomieUE(ue_num, section, annee, ueRow) {
  const ue = ueRow || db.prepare('SELECT ue_per_cours, ue_aut FROM ue WHERE ue_num = ? AND annee_scolaire = ?').get(ue_num, annee);
  if (!ue) return null;

  const ueAut = ue.ue_aut || 0;
  const perCoursDP = ue.ue_per_cours || 0; // périodes de cours prévues au DP (hors autonomie)

  // Cours de l'UE (hors Z) avec leurs périodes DP
  const cours = db.prepare(
    "SELECT cours_code, cours_per FROM cours WHERE ue_num = ? AND section = ? AND annee_scolaire = ? AND (ct_pp IS NULL OR ct_pp != 'Z')"
  ).all(ue_num, section, annee);

  // Périodes de cours réellement attribuées (somme des lignes, hors autonomie, hors EPT/Z)
  const perOuvertes = db.prepare(`
    SELECT COALESCE(SUM(periodes_attribuees), 0) AS total
    FROM attribution
    WHERE ue_num = ? AND section = ? AND annee_scolaire = ? AND contrat_mdp = 'IIP'
      AND (coordination_encadrement IS NULL OR coordination_encadrement NOT IN ('91','92','93','94','95','96','97','98','99'))
      AND (type_cours IS NULL OR type_cours != 'Z')
  `).get(ue_num, section, annee)?.total || 0;

  // Autonomie déjà attribuée
  const autAttribuee = db.prepare(
    "SELECT COALESCE(SUM(autonomie_attribuee), 0) AS total FROM attribution WHERE ue_num = ? AND section = ? AND annee_scolaire = ? AND contrat_mdp = 'IIP'"
  ).get(ue_num, section, annee)?.total || 0;

  // Périodes de cours ajoutées par dédoublement = ouvertes − DP
  const perAjoutees = Math.max(0, perOuvertes - perCoursDP);

  // Détection "tous dédoublés ×N" : chaque cours attribué exactement N fois ses périodes DP
  let multipleObligatoire = null;
  if (perCoursDP > 0 && perOuvertes > 0 && perOuvertes % perCoursDP === 0) {
    const ratio = perOuvertes / perCoursDP;
    if (ratio >= 2 && Number.isInteger(ratio)) multipleObligatoire = ratio;
  }

  const min = ueAut;
  const max = Math.round((ueAut + 0.20 * perAjoutees) * 10) / 10;

  let attendu = null, ok;
  if (multipleObligatoire) {
    // Tous dédoublés → autonomie DOIT être ue_aut × N
    attendu = ueAut * multipleObligatoire;
    ok = Math.abs(autAttribuee - attendu) < 0.5;
  } else {
    // Doit rester dans l'intervalle [min ; max]
    ok = autAttribuee >= min - 0.5 && autAttribuee <= max + 0.5;
  }

  // Détail par cours : multiple du DP atteint
  const attribParCours = db.prepare(
    "SELECT code_cours, COALESCE(SUM(periodes_attribuees),0) AS per FROM attribution WHERE ue_num = ? AND section = ? AND annee_scolaire = ? GROUP BY code_cours"
  ).all(ue_num, section, annee);
  const perParCours = {};
  for (const a of attribParCours) perParCours[a.code_cours] = a.per || 0;
  const coursDetail = cours.map(c => {
    const per = perParCours[c.cours_code] || 0;
    const dp = c.cours_per || 0;
    const ratio = dp > 0 ? per / dp : 0;
    const estMultiple = dp > 0 && per > 0 && Math.abs(per - Math.round(ratio) * dp) < 0.01;
    return {
      code_cours: c.cours_code, dp, per,
      multiple: estMultiple ? Math.round(ratio) : null,
      ratio: dp > 0 ? Math.round(ratio * 100) / 100 : null,
      est_multiple: estMultiple,
      attendu: estMultiple || dp === 0 ? null
        : `${Math.max(1, Math.floor(ratio)) * dp} (×${Math.max(1, Math.floor(ratio))}) ou ${(Math.floor(ratio) + 1) * dp} (×${Math.floor(ratio) + 1})`,
    };
  });
  const tousMultiples = coursDetail.every(c => c.est_multiple || c.dp === 0);

  // Message de conseil
  const r2 = x => Math.round(x * 100) / 100;
  let etat, message;
  if (!tousMultiples) {
    etat = 'cours';
    message = `Certains cours ne sont pas un multiple de leur DP — corrigez-les d'abord (voir les ✗).`;
  } else if (multipleObligatoire && Math.abs(autAttribuee - attendu) >= 0.5) {
    etat = autAttribuee < attendu ? 'sous' : 'dépassement';
    message = autAttribuee < attendu
      ? `Tous les cours sont dédoublés ×${multipleObligatoire} : l'autonomie DOIT être ${attendu} (il manque ${r2(attendu - autAttribuee)}).`
      : `Autonomie trop élevée : attendu ${attendu} pour un dédoublement ×${multipleObligatoire} (retirez ${r2(autAttribuee - attendu)}).`;
  } else if (autAttribuee < min - 0.5) {
    etat = 'sous';
    message = `Il reste ${r2(min - autAttribuee)} période(s) d'autonomie à placer (minimum obligatoire : ${min}).`
      + (max > min ? ` Vous pouvez monter jusqu'à ${max} (bonus 20% des dédoublements).` : '');
  } else if (!multipleObligatoire && autAttribuee > max + 0.5) {
    etat = 'dépassement';
    message = `Dépassement de ${r2(autAttribuee - max)} période(s) d'autonomie (maximum ${max}). Retirez de l'autonomie ou ajoutez un dédoublement de cours.`;
  } else {
    etat = 'ok';
    message = `Autonomie correcte : ${r2(autAttribuee)} (entre ${min} et ${max}).`
      + (autAttribuee < max - 0.5 ? ` Marge possible : encore ${r2(max - autAttribuee)} si besoin.` : '');
  }

  return {
    ue_aut: ueAut,
    per_cours_dp: perCoursDP,
    per_ouvertes: perOuvertes,
    per_ajoutees: perAjoutees,
    aut_attribuee: autAttribuee,
    min, max,
    multiple_obligatoire: multipleObligatoire,
    attendu,
    ok,
    nb_cours: cours.length,
    depasse_max: !multipleObligatoire && autAttribuee > max + 0.5,
    cours: coursDetail,
    tous_multiples: tousMultiples,
    etat, message,
  };
}


// Liste avec filtres : ?section=...&prof_id=...&contrat=...&ue=...&q=...
r.get('/', authRequired, withSectionScope, (req, res) => {
  const { section, prof_id, contrat, ue, ue_num, q, type_cours, annee } = req.query;
  const where = [];
  const params = {};
  const anneeVal = annee || '2025-2026';
  where.push('a.annee_scolaire = @annee'); params.annee = anneeVal;
  if (section)   { where.push('a.section = @section');         params.section = section; }
  if (prof_id)   { where.push('a.professeur_id = @prof_id');   params.prof_id = prof_id; }
  if (contrat)   { where.push('a.contrat_mdp = @contrat');     params.contrat = contrat; }
  if (ue || ue_num) { where.push('a.ue_num = @ue');            params.ue = ue || ue_num; }
  if (type_cours){ where.push('a.type_cours = @type_cours');   params.type_cours = type_cours; }
  if (q) {
    where.push('(a.ue_nom LIKE @q OR a.nom_cours LIKE @q OR a.professeur LIKE @q)');
    params.q = `%${q}%`;
  }
  // Périmètre : une coordination ne voit que ses sections
  if (req.allowedSections !== null) {
    if (req.allowedSections.length === 0) return res.json([]); // aucune section autorisée
    const placeholders = req.allowedSections.map((_, i) => `@sec${i}`).join(', ');
    where.push(`a.section IN (${placeholders})`);
    req.allowedSections.forEach((s, i) => { params[`sec${i}`] = s; });
  }
  const sql = `
    SELECT a.*,
           COALESCE(co.conforme, 1) AS cours_conforme,
           co.total_attribue       AS cours_total_attribue,
           co.cours_per            AS cours_per,
           co.multiple_attendu     AS cours_multiple_attendu,
           ue.ue_tc                AS ue_tc,
           cg.heures               AS grille_heures,
           cg.cours_ev1            AS grille_ev1,
           cg.cours_vc1            AS grille_vc1,
           att.activite_id         AS activite_id,
           act.libelle             AS activite_nom
    FROM v_attribution_complete a
    LEFT JOIN v_cours_conformite co
      ON co.section = a.section AND co.code_cours = a.code_cours
     AND co.annee_scolaire = a.annee_scolaire
    LEFT JOIN ue
      ON ue.ue_num = a.ue_num AND ue.annee_scolaire = a.annee_scolaire
    LEFT JOIN cours cg
      ON cg.cours_code = a.code_cours AND cg.annee_scolaire = a.annee_scolaire
     AND (cg.section = a.section OR cg.section IS NULL OR cg.section = '')
    LEFT JOIN attribution att ON att.id = a.id
    LEFT JOIN activite_type act ON act.id = att.activite_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY a.section, a.bloc, a.ue_num, a.code_cours
    LIMIT 1000
  `;
  const lignes = db.prepare(sql).all(params);

  // Lignes Z synthétiques : une par cours de type Z pour la section/année filtrée.
  // Affichées à titre informatif (périodes étudiants uniquement, sans prof, sans charge).
  // Exclues du calcul de conformité et de dotation.
  try {
    const whereZ = [`co.ct_pp = 'Z'`, `co.annee_scolaire = @annee`];
    if (section) whereZ.push(`co.section = @section`);
    if (ue || ue_num) whereZ.push(`co.ue_num = @ue`);
    if (req.allowedSections !== null && req.allowedSections.length > 0) {
      const ph = req.allowedSections.map((_, i) => `@zsec${i}`).join(', ');
      whereZ.push(`co.section IN (${ph})`);
      req.allowedSections.forEach((s, i) => { params[`zsec${i}`] = s; });
    }
    // Exclure les sections masquées de la vue Attributions pour cette année
    whereZ.push(`co.section NOT IN (SELECT section FROM section_masquee WHERE annee_scolaire = @annee)`);
    const coursZ = db.prepare(`
      SELECT co.cours_code, co.cours_nom, co.ue_num, co.section, co.per_etudiant,
             ue.ue_nom
      FROM cours co
      LEFT JOIN ue ON ue.ue_num = co.ue_num AND ue.annee_scolaire = co.annee_scolaire
      WHERE ${whereZ.join(' AND ')}
      ORDER BY co.section, co.ue_num, co.cours_code
    `).all(params);
    for (const c of coursZ) {
      lignes.push({
        id: `z-${c.cours_code}`,
        is_z: true,
        section: c.section,
        ue_num: c.ue_num,
        ue_nom: c.ue_nom,
        code_cours: c.cours_code,
        nom_cours: c.cours_nom || 'Activités de développement professionnel (Z)',
        type_cours: 'Z',
        professeur_id: null,
        professeur: null,
        per_etudiant_total_dp: c.per_etudiant,
        periodes_attribuees: 0,
        autonomie_attribuee: 0,
        total_attribue_professeur: 0,
      });
    }
  } catch (e) { console.error('[grille] lignes Z :', e.message); }

  res.json(lignes);
});

// Conformité par cours (utile pour récap rapide)
r.get('/conformite', authRequired, (req, res) => {
  const { section, only_non_conforme, annee } = req.query;
  const where = ['annee_scolaire = @annee'];
  const params = { annee: annee || '2025-2026' };
  if (section) { where.push('section = @section'); params.section = section; }
  if (only_non_conforme === '1') where.push('conforme = 0');
  res.json(db.prepare(`
    SELECT * FROM v_cours_conformite
    WHERE ${where.join(' AND ')}
    ORDER BY conforme ASC, section, code_cours
  `).all(params));
});

// Toutes les attributions d'un cours (un cours = section + code_cours)
// Utilisé par la modale d'édition multi-lignes
r.get('/by-cours', authRequired, (req, res) => {
  const { section, code_cours, annee } = req.query;
  if (!section || !code_cours) {
    return res.status(400).json({ error: 'section et code_cours requis' });
  }
  const anneeVal = annee || '2025-2026';
  const rows = db.prepare(`
    SELECT * FROM v_attribution_complete
    WHERE section = ? AND code_cours = ? AND annee_scolaire = ?
    ORDER BY code, activite_id
  `).all(section, code_cours, anneeVal);

  // Récupérer le cours_per et calculer la conformité (pour cette année)
  const conf = db.prepare(`
    SELECT * FROM v_cours_conformite WHERE section = ? AND code_cours = ? AND annee_scolaire = ?
  `).get(section, code_cours, anneeVal);

  // Infos du cours depuis la table cours
  const coursInfo = db.prepare(`
    SELECT cours_code, cours_nom, ue_num, ct_pp AS type_cours, cours_per, quadrimestre_cours, heures
    FROM cours WHERE cours_code = ? AND section = ? AND annee_scolaire = ?
  `).get(code_cours, section, anneeVal)
    || db.prepare(`SELECT cours_code, cours_nom, ue_num, ct_pp AS type_cours, cours_per, quadrimestre_cours, heures
                   FROM cours WHERE cours_code = ? AND annee_scolaire = ?`).get(code_cours, anneeVal);

  // Nom et données de l'UE
  let ueNom = null;
  let ueAnalyse = null;
  if (coursInfo?.ue_num) {
    const ue = db.prepare('SELECT ue_nom, ue_per_cours, ue_aut FROM ue WHERE ue_num = ? AND annee_scolaire = ?').get(coursInfo.ue_num, anneeVal);
    ueNom = ue?.ue_nom || null;

    if (ue) {
      ueAnalyse = analyseAutonomieUE(coursInfo.ue_num, section, anneeVal, ue);
    }
  }

  res.json({
    attributions: rows,
    conformite: conf || null,
    cours_info: coursInfo ? { ...coursInfo, ue_nom: ueNom } : null,
    ue_analyse: ueAnalyse,
  });
});

// Détail
// ─── GET /attributions/annees-par-section ────────────────────────────────────
// Retourne les années scolaires qui ont des attributions, par section.
// IMPORTANT : doit être déclarée AVANT /:id sinon Express capture "annees-par-section" comme un id.
r.get('/annees-par-section', authRequired, (req, res) => {
  const rows = db.prepare(`
    SELECT section, annee_scolaire, COUNT(*) as n
    FROM attribution
    GROUP BY section, annee_scolaire
    ORDER BY section, annee_scolaire DESC
  `).all();
  const map = {};
  for (const row of rows) {
    if (!map[row.section]) map[row.section] = [];
    map[row.section].push({ annee: row.annee_scolaire, n: row.n });
  }
  res.json(map);
});

// GET /rapport-attributions?section=&annee=
// Retourne les données structurées pour le rapport d'attributions par UE/cours
const _numToLettreRapport = n => {
  if (!n || n <= 1) return 'A';
  if (n <= 26) return String.fromCharCode(64 + n);
  return String.fromCharCode(64 + Math.floor((n - 1) / 26)) + String.fromCharCode(65 + ((n - 1) % 26));
};

r.get('/rapport-attributions', authRequired, (req, res) => {
  const { section, annee } = req.query;
  if (!annee) return res.status(400).json({ error: 'annee requis' });

  // Si pas de section → toutes les sections ; sinon accepte une liste séparée par des virgules
  const sections = section
    ? String(section).split(',').map(s => s.trim()).filter(Boolean)
    : db.prepare(`SELECT DISTINCT section FROM attribution WHERE annee_scolaire = ? ORDER BY section`).all(annee).map(r => r.section);

  // Construire le résultat multi-sections
  const allUes = [];
  let grand_total_per = 0, grand_total_aut = 0;

  for (const sec of sections) {

  const rows = db.prepare(`
    SELECT DISTINCT
      a.id, a.ue_num, a.code_cours,
      a.num_groupe, a.code AS groupe_code, a.num_organisation,
      a.professeur_id, p.nom AS prof_nom, p.prenom AS prof_prenom,
      a.periodes_attribuees, a.autonomie_attribuee,
      a.activite_id, at.libelle AS activite_nom, at.ordre AS activite_ordre,
      a.type_cours, a.contrat_mdp, a.helb_nature
    FROM attribution a
    LEFT JOIN professeur p ON p.id = a.professeur_id
    LEFT JOIN activite_type at ON at.id = a.activite_id
    WHERE a.section = ? AND a.annee_scolaire = ?
      AND (a.type_cours IS NULL OR a.type_cours != 'Z')
      AND COALESCE(a.periodes_attribuees, 0) + COALESCE(a.autonomie_attribuee, 0) > 0
    ORDER BY a.ue_num, a.num_organisation, a.code_cours, a.num_groupe
  `).all(sec, annee);

  // Charger les infos UE séparément (sans jointure pour éviter les doublons)
  const ueInfos = {};
  db.prepare(`SELECT ue_num, ue_nom, ue_niv, ue_quad, ue_tc FROM ue WHERE annee_scolaire = ? ORDER BY ue_num`).all(annee).forEach(u => {
    if (!ueInfos[u.ue_num]) ueInfos[u.ue_num] = u;
  });

  // Charger les noms de cours séparément
  const coursInfos = {};
  db.prepare(`SELECT cours_code, cours_nom FROM cours WHERE annee_scolaire = ? AND section = ?`).all(annee, sec).forEach(c => {
    coursInfos[c.cours_code] = c.cours_nom;
  });

  // Trier : 1.niveau 2.ue_num 3.code_cours 4.type d'activité 5.numéro de groupe dans l'activité
  rows.sort((a, b) => {
    const ua = ueInfos[a.ue_num], ub = ueInfos[b.ue_num];
    const na = parseInt((ua?.ue_niv || '').match(/\d+$/)?.[0] ?? 99);
    const nb = parseInt((ub?.ue_niv || '').match(/\d+$/)?.[0] ?? 99);
    if (na !== nb) return na - nb;                                   // 1. niveau
    if (a.ue_num !== b.ue_num) return a.ue_num - b.ue_num;           // 2. UE
    const cc = (a.code_cours||'').localeCompare(b.code_cours||'', 'fr', {numeric:true});
    if (cc !== 0) return cc;                                         // 3. cours
    // 4. activité : par ordre défini, puis libellé ; les lignes sans activité d'abord
    const oa = a.activite_ordre ?? 9999, ob = b.activite_ordre ?? 9999;
    if (oa !== ob) return oa - ob;
    const an = (a.activite_nom||'').localeCompare(b.activite_nom||'', 'fr', {numeric:true});
    if (an !== 0) return an;
    return (a.num_groupe||0) - (b.num_groupe||0);                    // 5. groupe dans l'activité
  });

  // Structurer par UE → cours → lignes
  const ues = [];
  const ueMap = {};
  for (const row of rows) {
    const uInfo = ueInfos[row.ue_num] || {};
    const org = row.num_organisation || 1;
    const uKey = row.ue_num + '/' + org;
    if (!ueMap[uKey]) {
      const ue = {
        ue_num: row.ue_num,
        num_organisation: org,
        ue_nom: uInfo.ue_nom,
        ue_niv: uInfo.ue_niv,
        ue_quad: uInfo.ue_quad,
        ue_tc: uInfo.ue_tc,
        cours: [], total_per: 0, total_aut: 0
      };
      ueMap[uKey] = ue;
      ues.push(ue);
    }
    const ue = ueMap[uKey];
    const per = row.periodes_attribuees || 0;
    const aut = row.autonomie_attribuee || 0;
    ue.cours.push({
      code_cours:   row.code_cours,
      cours_nom:    coursInfos[row.code_cours] || row.code_cours,
      groupe_code:  row.groupe_code || _numToLettreRapport(row.num_groupe || 1),
      prof_nom:     row.prof_nom
        ? `${row.prof_nom}${row.prof_prenom ? '\u00a0' + row.prof_prenom[0] + '.' : ''}`.trim()
        : '\u2014',
      activite_nom: row.activite_nom,
      contrat:      row.contrat_mdp || 'IIP',
      type_cours:   row.type_cours || null,
      helb_nature:  row.helb_nature || null,
      periodes:     per,
      autonomie:    aut,
      total:        per + aut,
    });
    ue.total_per += per;
    ue.total_aut += aut;
  }

  const secTotalPer = ues.reduce((s, u) => s + u.total_per, 0);
  const secTotalAut = ues.reduce((s, u) => s + u.total_aut, 0);

  // Ajouter les UEs de cette section avec label section
  ues.forEach(u => allUes.push({ ...u, section: sec }));
  grand_total_per += secTotalPer;
  grand_total_aut += secTotalAut;
  } // fin boucle sections

  res.json({
    section: sections.length === 1 ? sections[0] : 'Toutes sections',
    annee,
    ues: allUes,
    total_per: grand_total_per,
    total_aut: grand_total_aut,
    total: grand_total_per + grand_total_aut,
  });
});


// ── Lignes EPT (95-99) par UE ────────────────────────────────────────────────

// GET /ept?section=&ue_num=&annee=
// Récupère les lignes EPT d'une UE (org >= 2, coordination_encadrement IN 95..99)
r.get('/ept', authRequired, (req, res) => {
  const { section, ue_num, annee } = req.query;
  if (!section || !ue_num || !annee) return res.status(400).json({ error: 'section, ue_num et annee requis' });

  const lignes = db.prepare(`
    SELECT a.id, a.num_organisation, a.coordination_encadrement AS code_ept,
      te.libelle AS libelle_ept,
      a.professeur_id, p.nom || ' ' || p.prenom AS prof_nom,
      a.periodes_attribuees AS periodes, a.annee_scolaire,
      a.activite_id, at.libelle AS activite_nom
    FROM attribution a
    LEFT JOIN type_encadrement te ON te.code = a.coordination_encadrement
    LEFT JOIN professeur p ON p.id = a.professeur_id
    LEFT JOIN activite_type at ON at.id = a.activite_id
    WHERE a.section = ? AND a.ue_num = ? AND a.annee_scolaire = ?
      AND a.coordination_encadrement IN ('95','96','97','98','99')
    ORDER BY a.num_organisation, a.coordination_encadrement
  `).all(section, ue_num, annee);

  res.json(lignes);
});

// POST /ept — Ajouter une ligne EPT à une UE
r.post('/ept', authRequired, roleRequired('admin', 'editeur', 'coordination'), (req, res) => {
  const { section, ue_num, annee, code_ept, professeur_id, periodes, num_organisation, activite_id } = req.body;
  if (!section || !ue_num || !annee || !code_ept || !professeur_id)
    return res.status(400).json({ error: 'section, ue_num, annee, code_ept, professeur_id requis' });

  const CODES_EPT = ['95','96','97','98','99'];
  if (!CODES_EPT.includes(String(code_ept)))
    return res.status(400).json({ error: 'code_ept invalide (95-99 uniquement)' });

  // Numéro d'organisation : max existant + 1, ou fourni
  let numOrg = num_organisation;
  if (!numOrg) {
    const maxOrg = db.prepare(
      `SELECT MAX(num_organisation) AS m FROM attribution WHERE section = ? AND ue_num = ? AND annee_scolaire = ?`
    ).get(section, ue_num, annee);
    numOrg = (maxOrg?.m || 1) + 1;
  }

  const info = db.prepare(`
    INSERT INTO attribution
      (section, ue_num, annee_scolaire, coordination_encadrement,
       professeur_id, periodes_attribuees, autonomie_attribuee,
       num_organisation, organisation, contrat_mdp, etablissement_referent,
       type_cours, code_cours, nb_groupes, split_groupe, code, num_groupe, activite_id)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'x', 'IIP', 'IIP', NULL, NULL, 1, 'N', 'A', 1, ?)
  `).run(section, ue_num, annee, String(code_ept), professeur_id, periodes || 0, numOrg, activite_id || null);

  res.json({ ok: true, id: info.lastInsertRowid, num_organisation: numOrg });
});

// DELETE /ept/:id — Supprimer une ligne EPT
r.delete('/ept/:id', authRequired, roleRequired('admin', 'editeur', 'coordination'), (req, res) => {
  const id = parseInt(req.params.id);
  // Vérifier que c'est bien une ligne EPT
  const ligne = db.prepare(
    "SELECT id FROM attribution WHERE id = ? AND coordination_encadrement IN ('95','96','97','98','99')"
  ).get(id);
  if (!ligne) return res.status(404).json({ error: 'Ligne EPT introuvable' });
  db.prepare('DELETE FROM attribution WHERE id = ?').run(id);
  res.json({ ok: true });
});

// PATCH /attributions/:id/desattribuer — remplace le prof par "À DÉSIGNER"
r.patch('/:id/desattribuer', authRequired, roleRequired('admin', 'editeur', 'coordination'), (req, res) => {
  const id = parseInt(req.params.id);
  const aDesigner = db.prepare(`SELECT id FROM professeur WHERE nom = 'À DÉSIGNER' LIMIT 1`).get();
  if (!aDesigner) return res.status(500).json({ error: 'Professeur "À DÉSIGNER" introuvable' });
  const r2 = db.prepare(
    'UPDATE attribution SET professeur_id = ?, periodes_attribuees = 0, autonomie_attribuee = 0 WHERE id = ?'
  ).run(aDesigner.id, id);
  if (r2.changes === 0) return res.status(404).json({ error: 'Attribution introuvable' });
  res.json({ ok: true });
});

// GET /autonomie-ue?section=&annee= — analyse autonomie pour toutes les UEs d'une section
r.get('/autonomie-ue', authRequired, (req, res) => {
  const { section, annee } = req.query;
  if (!section || !annee) return res.status(400).json({ error: 'section et annee requis' });

  const ues = db.prepare(`
    SELECT DISTINCT u.ue_num, u.ue_per_cours, u.ue_aut
    FROM ue u WHERE u.section = ? AND u.annee_scolaire = ?
  `).all(section, annee);

  const map = {};
  for (const ue of ues) {
    const a = analyseAutonomieUE(ue.ue_num, section, annee, ue);
    // N'afficher le badge que si l'UE a des cours ouverts (attribution en cours)
    if (a && a.per_ouvertes > 0) map[ue.ue_num] = a;
  }
  res.json(map);
});

r.get('/:id', authRequired, (req, res) => {
  const row = db.prepare('SELECT * FROM v_attribution_complete WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Attribution introuvable' });
  res.json(row);
});

// Création
r.post('/', authRequired, roleRequired('admin', 'editeur', 'coordination'), (req, res) => {
  const a = req.body || {};
  // Périmètre : une coordination ne peut créer que dans ses sections
  if (!canAccessSection(req.user, a.section)) {
    return res.status(403).json({ error: 'Vous n\'avez pas accès à cette section.' });
  }
  // Une ligne avec 0 période mais de l'autonomie doit avoir une activité
  const per = Number(a.periodes_attribuees) || 0;
  const aut = Number(a.autonomie_attribuee) || 0;
  if (per === 0 && aut > 0 && !a.activite_id) {
    return res.status(400).json({ error: 'Une ligne sans période de cours (autonomie seule) doit être rattachée à une activité.' });
  }
  const stmt = db.prepare(`
    INSERT INTO attribution
      (section, etablissement_referent, contrat_mdp, organisation,
       ue_num, num_organisation, quadrimestre_attribue,
       code_cours, type_cours, type_cours_helb, code, nb_groupes,
       split_groupe, num_split, num_groupe, activite_id,
       professeur_id, cours_ept_ad, coordination_encadrement,
       modification_attribution, commentaire, commentaire_2,
       per_etudiant_total_dp, periodes_attribuees, autonomie_attribuee,
       annee_scolaire, created_by, updated_by)
    VALUES (@section, @etablissement_referent, @contrat_mdp, @organisation,
            @ue_num, @num_organisation, @quadrimestre_attribue,
            @code_cours, @type_cours, @type_cours_helb, @code, @nb_groupes,
            @split_groupe, @num_split, @num_groupe, @activite_id,
            @professeur_id, @cours_ept_ad, @coordination_encadrement,
            @modification_attribution, @commentaire, @commentaire_2,
            @per_etudiant_total_dp, @periodes_attribuees, @autonomie_attribuee,
            @annee_scolaire, @uid, @uid)
  `);

  // ── Defaults intelligents ────────────────────────────────────────────────
  // contrat_mdp par défaut = et_ref de l'UE (IIP ou HELB)
  let defaultContrat = a.contrat_mdp ?? null;
  if (!defaultContrat && a.ue_num) {
    const ue = db.prepare('SELECT et_ref FROM ue WHERE ue_num = ? AND annee_scolaire = ?').get(a.ue_num, a.annee_scolaire || '2025-2026')
           || db.prepare('SELECT et_ref FROM ue WHERE ue_num = ? ORDER BY annee_scolaire DESC LIMIT 1').get(a.ue_num);
    if (ue?.et_ref) defaultContrat = ue.et_ref;
  }
  // professeur_id par défaut = "À DÉSIGNER" si non renseigné
  let defaultProfId = a.professeur_id ?? null;
  if (!defaultProfId) {
    const aDesigner = db.prepare(`SELECT id FROM professeur WHERE nom = 'À DÉSIGNER' LIMIT 1`).get();
    if (aDesigner) defaultProfId = aDesigner.id;
  }

  const result = stmt.run({
    section: a.section ?? null,
    etablissement_referent: a.etablissement_referent ?? defaultContrat ?? null,
    contrat_mdp: defaultContrat,
    organisation: a.organisation ?? null,
    ue_num: a.ue_num,
    num_organisation: a.num_organisation ?? 1,
    quadrimestre_attribue: a.quadrimestre_attribue ?? null,
    code_cours: a.code_cours ?? null,
    type_cours: a.type_cours ?? null,
    type_cours_helb: a.type_cours_helb ?? null,
    code: a.code ?? null,
    nb_groupes: a.nb_groupes ?? 1,
    split_groupe: a.split_groupe ?? 'N',
    num_split: a.num_split ?? null,
    num_groupe: a.num_groupe ?? null,
    activite_id: a.activite_id ?? null,
    professeur_id: defaultProfId,
    cours_ept_ad: a.cours_ept_ad ?? null,
    coordination_encadrement: a.coordination_encadrement ?? null,
    modification_attribution: a.modification_attribution ?? null,
    commentaire: a.commentaire ?? null,
    commentaire_2: a.commentaire_2 ?? null,
    per_etudiant_total_dp: a.per_etudiant_total_dp ?? null,
    periodes_attribuees: a.periodes_attribuees ?? 0,
    autonomie_attribuee: a.autonomie_attribuee ?? 0,
    annee_scolaire: a.annee_scolaire ?? '2025-2026',
    uid: req.user.id
  });
  db.prepare(`INSERT INTO modification_log (attribution_id, utilisateur_id, action) VALUES (?,?,?)`).run(
    result.lastInsertRowid, req.user.id, 'create'
  );
  saveSnapshot(result.lastInsertRowid, 'create', req.user);
  res.status(201).json({ id: result.lastInsertRowid });
});

// Update (PATCH partiel)
r.patch('/:id', authRequired, roleRequired('admin', 'editeur', 'coordination'), (req, res) => {
  // Périmètre : vérifier que l'attribution existante est dans une section autorisée
  const existing = db.prepare('SELECT section FROM attribution WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Attribution introuvable' });
  if (!canAccessSection(req.user, existing.section)) {
    return res.status(403).json({ error: 'Vous n\'avez pas accès à cette section.' });
  }
  // Si on tente de changer la section, la nouvelle doit aussi être autorisée
  if ('section' in req.body && !canAccessSection(req.user, req.body.section)) {
    return res.status(403).json({ error: 'Vous ne pouvez pas déplacer cette attribution vers cette section.' });
  }
  const allowed = [
    'section','etablissement_referent','contrat_mdp','organisation','ue_num',
    'num_organisation','quadrimestre_attribue','code_cours','type_cours',
    'type_cours_helb','code','nb_groupes','split_groupe','num_split','num_groupe',
    'activite_id', 'titre_rtf',
    'professeur_id','cours_ept_ad','coordination_encadrement',
    'modification_attribution','commentaire','commentaire_2',
    'per_etudiant_total_dp','periodes_attribuees','autonomie_attribuee','helb_nature'
  ];
  const updates = [];
  const params = { id: req.params.id, uid: req.user.id };
  for (const k of allowed) {
    if (k in req.body) {
      updates.push(`${k} = @${k}`);
      params[k] = req.body[k];
    }
  }
  if (!updates.length) return res.status(400).json({ error: 'Aucun champ à modifier' });
  updates.push('updated_by = @uid');

  // Snapshot AVANT modification
  saveSnapshot(Number(req.params.id), 'update', req.user);

  const result = db.prepare(`UPDATE attribution SET ${updates.join(', ')} WHERE id = @id`).run(params);
  if (result.changes === 0) return res.status(404).json({ error: 'Attribution introuvable' });

  db.prepare(`INSERT INTO modification_log (attribution_id, utilisateur_id, action) VALUES (?,?,?)`).run(
    req.params.id, req.user.id, 'update'
  );
  res.json({ ok: true });
});

// Modifier le statut d'un professeur depuis la grille d'attributions
r.patch('/professeur/:id/statut', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { statut } = req.body || {};
  if (!['CC', 'EXP', null, ''].includes(statut)) {
    return res.status(400).json({ error: 'Statut doit être CC, EXP ou vide' });
  }
  const result = db.prepare('UPDATE professeur SET statut = ? WHERE id = ?').run(statut || null, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Professeur introuvable' });
  res.json({ ok: true });
});

// Suppression
r.delete('/:id', authRequired, roleRequired('admin', 'coordination'), (req, res) => {
  // Périmètre : vérifier que l'attribution est dans une section autorisée
  const existing = db.prepare('SELECT section FROM attribution WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Attribution introuvable' });
  if (!canAccessSection(req.user, existing.section)) {
    return res.status(403).json({ error: 'Vous n\'avez pas accès à cette section.' });
  }
  // Snapshot AVANT suppression
  saveSnapshot(Number(req.params.id), 'delete', req.user);
  db.prepare('DELETE FROM planning_hebdo WHERE attribution_id = ?').run(req.params.id);
  const result = db.prepare('DELETE FROM attribution WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Attribution introuvable' });
  res.json({ ok: true });
});

// =========================================================
// SUPPRESSION EN MASSE — admin only
// =========================================================

// Suppression par liste d'IDs (cases à cocher dans l'UI)
r.post('/bulk-delete', authRequired, roleRequired('admin'), (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Liste d\'IDs requise' });
  }
  const placeholders = ids.map(() => '?').join(',');
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM planning_hebdo WHERE attribution_id IN (${placeholders})`).run(...ids);
    const result = db.prepare(`DELETE FROM attribution WHERE id IN (${placeholders})`).run(...ids);
    return result.changes;
  });
  const deleted = tx();
  res.json({ deleted });
});

// Compter ce qui serait supprimé selon les filtres (pour l'aperçu)
r.post('/bulk-delete-preview', authRequired, roleRequired('admin'), (req, res) => {
  const { section, professeur_id, contrat, annee_scolaire } = req.body || {};
  const where = [];
  const params = [];
  if (annee_scolaire) { where.push('annee_scolaire = ?'); params.push(annee_scolaire); }
  if (section)        { where.push('section = ?');        params.push(section); }
  if (professeur_id)  { where.push('professeur_id = ?');  params.push(Number(professeur_id)); }
  if (contrat)        { where.push('contrat_mdp = ?');    params.push(contrat); }
  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const row = db.prepare(`SELECT COUNT(*) AS n FROM attribution ${whereClause}`).get(...params);
  res.json({ count: row.n });
});

// Suppression par filtres (= filtres actifs de la grille, ou aucun = TOUT)
r.post('/bulk-delete-filtered', authRequired, roleRequired('admin'), (req, res) => {
  const { confirm, section, professeur_id, contrat, annee_scolaire } = req.body || {};
  if (confirm !== 'OUI-SUPPRIMER') {
    return res.status(400).json({ error: 'Confirmation requise (confirm = "OUI-SUPPRIMER")' });
  }
  const where = [];
  const params = [];
  if (annee_scolaire) { where.push('annee_scolaire = ?'); params.push(annee_scolaire); }
  if (section)        { where.push('section = ?');        params.push(section); }
  if (professeur_id)  { where.push('professeur_id = ?');  params.push(Number(professeur_id)); }
  if (contrat)        { where.push('contrat_mdp = ?');    params.push(contrat); }
  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const tx = db.transaction(() => {
    const ids = db.prepare(`SELECT id FROM attribution ${whereClause}`).all(...params).map(r => r.id);
    if (ids.length === 0) return 0;
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`DELETE FROM planning_hebdo WHERE attribution_id IN (${placeholders})`).run(...ids);
    const result = db.prepare(`DELETE FROM attribution WHERE id IN (${placeholders})`).run(...ids);
    return result.changes;
  });
  const deleted = tx();
  res.json({ deleted });
});

/**
 * Création en masse d'attributions à partir d'une sélection d'UE d'une section.
 * Pour chaque cours des UE sélectionnées :
 *   - si aucune attribution n'existe (section + code_cours), créer une attribution
 *     squelette avec les infos issues de BD_UE_COURS (type_cours, quadrimestre)
 *   - sinon, sauter (idempotent)
 *
 * Body : { section: "TIM", ue_nums: [250, 251, ...] }
 */
r.post('/bulk-create-from-section', authRequired, roleRequired('admin', 'editeur', 'coordination'), (req, res) => {
  const { section, ue_nums, annee_scolaire } = req.body || {};
  if (!section || !Array.isArray(ue_nums) || ue_nums.length === 0) {
    return res.status(400).json({ error: 'section et ue_nums (tableau non vide) requis' });
  }
  // Périmètre : une coordination ne peut créer que dans ses sections
  if (!canAccessSection(req.user, section)) {
    return res.status(403).json({ error: 'Vous n\'avez pas accès à cette section.' });
  }
  const annee = annee_scolaire || '2025-2026';

  // Une attribution réelle va être créée → retirer le masque éventuel pour cette année
  db.prepare('DELETE FROM section_masquee WHERE section = ? AND annee_scolaire = ?').run(section, annee);

  // Professeur "À DÉSIGNER" pour les lignes squelettes
  const aDesigner = db.prepare(`SELECT id FROM professeur WHERE nom = 'À DÉSIGNER' LIMIT 1`).get();
  const defaultProfId = aDesigner?.id ?? null;

  // Contrat par défaut = et_ref de chaque UE (IIP ou HELB), pré-chargé en map
  const phUe = ue_nums.map(() => '?').join(',');
  const ueEtRefMap = {};
  const ueRows = db.prepare(
    `SELECT ue_num, et_ref FROM ue WHERE annee_scolaire = ? AND ue_num IN (${phUe})`
  ).all(annee, ...ue_nums);
  for (const row of ueRows) ueEtRefMap[row.ue_num] = row.et_ref || 'IIP';

  const placeholders = ue_nums.map(() => '?').join(',');
  // Récupérer tous les cours des UE sélectionnées — les cours Z (activités étudiants, sans prof) sont exclus
  const coursList = db.prepare(`
    SELECT cours_code, ue_num, ct_pp, quadrimestre_cours
    FROM cours
    WHERE section = ? AND annee_scolaire = ? AND ue_num IN (${placeholders})
      AND ct_pp != 'Z'
    ORDER BY cours_code
  `).all(section, annee, ...ue_nums);

  // Vérifie l'existence d'une attribution pour ce cours dans cette section ET cette année
  const checkStmt = db.prepare(
    'SELECT COUNT(*) AS n FROM attribution WHERE section = ? AND code_cours = ? AND annee_scolaire = ?'
  );
  const insertStmt = db.prepare(`
    INSERT INTO attribution
      (section, ue_num, code_cours, type_cours, quadrimestre_attribue,
       contrat_mdp, etablissement_referent, organisation,
       num_organisation, code, nb_groupes, split_groupe,
       professeur_id, periodes_attribuees, autonomie_attribuee, annee_scolaire)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'x', 1, 'A', 1, 'N', ?, 0, 0, ?)
  `);

  let created = 0;
  let skipped = 0;
  const tx = db.transaction(() => {
    for (const c of coursList) {
      const exists = checkStmt.get(section, c.cours_code, annee).n;
      if (exists > 0) { skipped++; continue; }
      const contrat = ueEtRefMap[c.ue_num] || 'IIP';
      // Sanitiser quadrimestre_cours — évite [object Object] et chaînes vides
      const quad = (typeof c.quadrimestre_cours === 'string'
        && c.quadrimestre_cours !== '[object Object]'
        && c.quadrimestre_cours !== '')
        ? c.quadrimestre_cours : null;
      insertStmt.run(
        section, c.ue_num, c.cours_code,
        c.ct_pp, quad,
        contrat, contrat,   // contrat_mdp, etablissement_referent
        defaultProfId,
        annee
      );
      created++;
    }
  });
  tx();

  res.json({ created, skipped, total: coursList.length });
});

// ─── Réouvrir une UE : crée une nouvelle organisation (numéro suivant) ───
// Démultiplication : duplique les lignes d'une organisation existante de l'UE
// dans une section donnée, avec le prochain num_organisation libre (max+1
// toutes sections confondues pour cette UE).
r.post('/reouvrir', authRequired, roleRequired('admin', 'editeur', 'coordination'), (req, res) => {
  const { ue_num, section, annee_scolaire, source_organisation } = req.body || {};
  if (!ue_num || !section) return res.status(400).json({ error: 'ue_num et section requis' });
  if (!canAccessSection(req.user, section)) {
    return res.status(403).json({ error: "Vous n'avez pas accès à cette section." });
  }
  const annee = annee_scolaire || '2025-2026';

  // Prochain numéro d'organisation : max+1 pour cette UE, toutes sections confondues
  const maxOrg = db.prepare(
    'SELECT COALESCE(MAX(num_organisation), 0) AS m FROM attribution WHERE ue_num = ? AND annee_scolaire = ?'
  ).get(ue_num, annee).m;
  const nouvelleOrg = maxOrg + 1;

  // Source : les attributions d'une organisation existante à dupliquer (structure des cours)
  const srcOrg = source_organisation || 1;
  const sources = db.prepare(`
    SELECT code_cours, type_cours, ue_num
    FROM attribution
    WHERE ue_num = ? AND annee_scolaire = ?
      AND type_cours != 'Z'
    GROUP BY code_cours
  `).all(ue_num, annee);

  if (sources.length === 0) {
    return res.status(404).json({ error: 'Aucun cours à réouvrir pour cette UE.' });
  }

  // Defaults : contrat_mdp depuis et_ref de l'UE, prof "À DÉSIGNER"
  const ueRef = db.prepare('SELECT et_ref FROM ue WHERE ue_num = ? AND annee_scolaire = ?').get(ue_num, annee)
             || db.prepare('SELECT et_ref FROM ue WHERE ue_num = ? ORDER BY annee_scolaire DESC LIMIT 1').get(ue_num);
  const defaultContrat = ueRef?.et_ref || 'IIP';
  const aDesigner = db.prepare(`SELECT id FROM professeur WHERE nom = 'À DÉSIGNER' LIMIT 1`).get();
  const defaultProfId = aDesigner?.id ?? null;

  const insertStmt = db.prepare(`
    INSERT INTO attribution
      (section, ue_num, code_cours, type_cours, quadrimestre_attribue,
       contrat_mdp, etablissement_referent, organisation,
       num_organisation, code, nb_groupes, split_groupe,
       professeur_id, periodes_attribuees, autonomie_attribuee, annee_scolaire)
    VALUES (?, ?, ?, ?, NULL, ?, ?, 'x', ?, 'A', 1, 'N', ?, 0, 0, ?)
  `);

  let created = 0;
  const tx = db.transaction(() => {
    for (const c of sources) {
      insertStmt.run(section, c.ue_num, c.code_cours, c.type_cours, defaultContrat, defaultContrat, nouvelleOrg, defaultProfId, annee);
      created++;
    }
  });
  tx();

  res.status(201).json({ ok: true, num_organisation: nouvelleOrg, created });
});

// ─── Mettre à jour le quadrimestre de toute une organisation d'UE ───
// Le quadrimestre est une propriété de l'organisation (UE ouverte), pas du
// cours : on l'applique à toutes les attributions de (UE, organisation, section).
r.patch('/organisation/quadrimestre', authRequired, roleRequired('admin', 'editeur', 'coordination'), (req, res) => {
  const { ue_num, num_organisation, section, quadrimestre, annee_scolaire } = req.body || {};
  if (!ue_num || num_organisation == null || !section) {
    return res.status(400).json({ error: 'ue_num, num_organisation et section requis' });
  }
  if (!canAccessSection(req.user, section)) {
    return res.status(403).json({ error: "Vous n'avez pas accès à cette section." });
  }
  const annee = annee_scolaire || '2025-2026';
  const q = (quadrimestre === 'Q1' || quadrimestre === 'Q2' || quadrimestre === 'Q1/Q2') ? quadrimestre : null;
  const result = db.prepare(`
    UPDATE attribution SET quadrimestre_attribue = ?
    WHERE ue_num = ? AND num_organisation = ? AND section = ? AND annee_scolaire = ?
  `).run(q, ue_num, num_organisation, section, annee);
  res.json({ ok: true, updated: result.changes, quadrimestre: q });
});

// ─── Copier les attributions d'une section d'une année vers une autre ────────
// Les professeurs et toutes les données métier sont conservés.
// Si force=true, les attributions existantes en destination sont supprimées avant copie.
r.post('/copier-section', authRequired, roleRequired('admin'), (req, res) => {
  const { section, annee_source, annee_dest, force } = req.body || {};
  if (!section || !annee_source || !annee_dest)
    return res.status(400).json({ error: 'section, annee_source et annee_dest sont requis' });
  if (annee_source === annee_dest)
    return res.status(400).json({ error: 'L\'année source et la destination doivent être différentes' });
  if (!canAccessSection(req.user, section))
    return res.status(403).json({ error: "Vous n'avez pas accès à cette section." });

  // Attributions source
  const sources = db.prepare(
    `SELECT * FROM attribution WHERE section = ? AND annee_scolaire = ?`
  ).all(section, annee_source);

  if (!sources.length)
    return res.status(404).json({ error: `Aucune attribution trouvée pour ${section} en ${annee_source}` });

  // Conflits en destination
  const existantes = db.prepare(
    `SELECT COUNT(*) AS n FROM attribution WHERE section = ? AND annee_scolaire = ?`
  ).get(section, annee_dest).n;

  if (existantes > 0 && !force)
    return res.status(409).json({
      error: `${existantes} attribution(s) existent déjà en ${annee_dest} pour ${section}. Forcez pour écraser.`,
      count: existantes, canForce: true
    });

  // Colonnes disponibles (sauf id qui est auto-increment)
  const cols = db.prepare('PRAGMA table_info(attribution)').all()
    .map(c => c.name).filter(c => c !== 'id');

  const tx = db.transaction(() => {
    if (force) {
      db.prepare(`DELETE FROM attribution WHERE section = ? AND annee_scolaire = ?`).run(section, annee_dest);
    }
    const placeholders = cols.map(() => '?').join(',');
    const stmt = db.prepare(`INSERT INTO attribution (${cols.join(',')}) VALUES (${placeholders})`);
    for (const row of sources) {
      const vals = cols.map(c => c === 'annee_scolaire' ? annee_dest : row[c]);
      stmt.run(...vals);
    }
  });
  tx();

  res.json({ ok: true, copied: sources.length, section, annee_source, annee_dest });
});

// ─── Remplissage automatique des périodes prof (baguette magique) ───────────
// Pour toutes les lignes d'une section où periodes_attribuees = 0,
// applique la valeur cours_per du cours correspondant.
// Ne touche pas l'autonomie.
r.post('/auto-fill-periodes', authRequired, roleRequired('admin', 'editeur', 'coordination'), (req, res) => {
  const { section, annee_scolaire } = req.body || {};
  if (!section) return res.status(400).json({ error: 'section requis' });
  if (!canAccessSection(req.user, section)) {
    return res.status(403).json({ error: "Vous n'avez pas accès à cette section." });
  }
  const annee = annee_scolaire || '2025-2026';

  const result = db.prepare(`
    UPDATE attribution
    SET periodes_attribuees = (
      SELECT c.cours_per
      FROM cours c
      WHERE c.cours_code = attribution.code_cours
        AND c.annee_scolaire = attribution.annee_scolaire
    )
    WHERE section = ?
      AND annee_scolaire = ?
      AND periodes_attribuees = 0
      AND (
        SELECT c.cours_per
        FROM cours c
        WHERE c.cours_code = attribution.code_cours
          AND c.annee_scolaire = attribution.annee_scolaire
      ) > 0
  `).run(section, annee);

  res.json({ ok: true, updated: result.changes });
});

// ─── POST /attributions/copier-section ───────────────────────────────────────
// Copie toutes les attributions d'une section/année source vers une autre année.
// - Si des attributions existent déjà en destination : bloque (sauf force=true admin)
r.post('/copier-section', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { section, annee_source, annee_dest, force } = req.body;
  if (!section || !annee_source || !annee_dest)
    return res.status(400).json({ error: 'section, annee_source et annee_dest sont requis' });
  if (annee_source === annee_dest)
    return res.status(400).json({ error: 'Source et destination identiques' });
  if (force && req.user.role !== 'admin')
    return res.status(403).json({ error: 'Seul un admin peut forcer la copie' });

  const existantes = db.prepare(
    'SELECT COUNT(*) AS n FROM attribution WHERE section = ? AND annee_scolaire = ?'
  ).get(section, annee_dest);

  if (existantes.n > 0 && !force)
    return res.status(409).json({
      error: `${existantes.n} attribution(s) existent déjà pour ${section} en ${annee_dest}.`,
      count: existantes.n,
      canForce: req.user.role === 'admin'
    });

  const sources = db.prepare(`
    SELECT section, etablissement_referent, contrat_mdp, organisation,
           ue_num, num_organisation, quadrimestre_attribue,
           code_cours, type_cours, type_cours_helb, code, nb_groupes,
           split_groupe, num_split, num_groupe, activite_id,
           professeur_id, cours_ept_ad, coordination_encadrement,
           modification_attribution, commentaire, commentaire_2,
           charge_perdue_84plus, periodes_transferees, per_etudiant_total_dp,
           periodes_attribuees, autonomie_attribuee, titre_rtf
    FROM attribution WHERE section = ? AND annee_scolaire = ?
    ORDER BY ue_num, num_organisation, code_cours
  `).all(section, annee_source);

  if (sources.length === 0)
    return res.status(404).json({ error: `Aucune attribution trouvée pour ${section} en ${annee_source}` });

  if (force && existantes.n > 0)
    db.prepare('DELETE FROM attribution WHERE section = ? AND annee_scolaire = ?').run(section, annee_dest);

  const insert = db.prepare(`
    INSERT INTO attribution (
      section, etablissement_referent, contrat_mdp, organisation,
      ue_num, num_organisation, quadrimestre_attribue,
      code_cours, type_cours, type_cours_helb, code, nb_groupes,
      split_groupe, num_split, num_groupe, activite_id,
      professeur_id, cours_ept_ad, coordination_encadrement,
      modification_attribution, commentaire, commentaire_2,
      charge_perdue_84plus, periodes_transferees, per_etudiant_total_dp,
      periodes_attribuees, autonomie_attribuee, titre_rtf,
      annee_scolaire, created_by, updated_by
    ) VALUES (
      @section, @etablissement_referent, @contrat_mdp, @organisation,
      @ue_num, @num_organisation, @quadrimestre_attribue,
      @code_cours, @type_cours, @type_cours_helb, @code, @nb_groupes,
      @split_groupe, @num_split, @num_groupe, @activite_id,
      @professeur_id, @cours_ept_ad, @coordination_encadrement,
      @modification_attribution, @commentaire, @commentaire_2,
      @charge_perdue_84plus, @periodes_transferees, @per_etudiant_total_dp,
      @periodes_attribuees, @autonomie_attribuee, @titre_rtf,
      @annee_dest, @uid, @uid
    )
  `);

  db.transaction(() => {
    for (const row of sources) insert.run({ ...row, annee_dest, uid: req.user.id });
  })();

  res.json({ ok: true, copied: sources.length });
});

// GET /attributions/cours-manquants?annee=&ue_num=&section= — cours du DP sans ligne d'attribution
// Permet de re-proposer les cours du référentiel qui n'ont aucune attribution (ex. ligne supprimée).
r.get('/cours-manquants', authRequired, (req, res) => {
  const { annee, ue_num, section } = req.query;
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  let sql = `
    SELECT c.cours_code, c.cours_nom, c.ue_num, c.section, c.ct_pp, c.cours_per, c.quadrimestre_cours
    FROM cours c
    WHERE c.annee_scolaire = ?
      AND NOT EXISTS (
        SELECT 1 FROM attribution a
        WHERE a.code_cours = c.cours_code AND a.annee_scolaire = c.annee_scolaire
          AND a.section = c.section AND a.ue_num = c.ue_num
      )`;
  const params = [annee];
  if (ue_num) { sql += ' AND c.ue_num = ?'; params.push(ue_num); }
  if (section) { sql += ' AND c.section = ?'; params.push(section); }
  sql += ' ORDER BY c.ue_num, c.cours_code';
  res.json(db.prepare(sql).all(...params));
});

// POST /attributions/creer-depuis-cours — recrée une ligne d'attribution depuis le DP
// Body : { annee, cours_code, ue_num, section }. Le prof = À DÉSIGNER.
r.post('/creer-depuis-cours', authRequired, roleRequired('admin', 'editeur', 'coordination'), (req, res) => {
  const { annee, cours_code, ue_num, section } = req.body;
  if (!annee || !cours_code || !ue_num || !section) {
    return res.status(400).json({ error: 'annee, cours_code, ue_num et section requis' });
  }
  // Le cours doit exister dans le DP
  const cours = db.prepare(`SELECT * FROM cours WHERE cours_code = ? AND annee_scolaire = ? AND section = ? AND ue_num = ?`)
    .get(cours_code, annee, section, ue_num);
  if (!cours) return res.status(404).json({ error: 'Cours introuvable dans le référentiel.' });
  // Ne pas créer de doublon
  const exist = db.prepare(`SELECT COUNT(*) n FROM attribution WHERE code_cours = ? AND annee_scolaire = ? AND section = ? AND ue_num = ?`)
    .get(cours_code, annee, section, ue_num).n;
  if (exist > 0) return res.status(409).json({ error: 'Une attribution existe déjà pour ce cours.' });

  // contrat par défaut = et_ref de l'UE
  const ue = db.prepare('SELECT et_ref FROM ue WHERE ue_num = ? AND annee_scolaire = ? AND section = ?').get(ue_num, annee, section);
  const contrat = ue?.et_ref || 'IIP';
  const aDesigner = db.prepare(`SELECT id FROM professeur WHERE nom = 'À DÉSIGNER' LIMIT 1`).get();

  const info = db.prepare(`
    INSERT INTO attribution
      (section, etablissement_referent, contrat_mdp, organisation, annee_scolaire,
       ue_num, num_organisation, code_cours, type_cours, nb_groupes, split_groupe,
       cours_ept_ad, coordination_encadrement, per_etudiant_total_dp,
       periodes_attribuees, autonomie_attribuee, professeur_id, created_by, updated_by)
    VALUES (?, ?, ?, 'x', ?, ?, 1, ?, ?, 1, 'N', 'C', 'Cours', ?, ?, 0, ?, ?, ?)
  `).run(section, contrat, contrat, annee, ue_num, cours_code, cours.ct_pp || 'CT',
         cours.cours_per || 0, cours.cours_per || 0, aDesigner?.id || null,
         req.user?.id || null, req.user?.id || null);
  res.json({ ok: true, id: info.lastInsertRowid });
});

// POST /attributions/:id/conge — bascule le congé d'un titulaire
// Active : grise la ligne (en_conge=1) et crée une ligne de remplacement (mêmes périodes, prof À DÉSIGNER)
// Désactive : réactive la ligne (en_conge=0). Ne supprime pas la ligne de remplacement.
r.post('/:id/conge', authRequired, roleRequired('admin', 'editeur', 'coordination'), (req, res) => {
  const orig = db.prepare('SELECT * FROM attribution WHERE id = ?').get(req.params.id);
  if (!orig) return res.status(404).json({ error: 'Attribution introuvable' });

  if (orig.en_conge) {
    // Désactiver le congé
    db.prepare('UPDATE attribution SET en_conge = 0 WHERE id = ?').run(orig.id);
    return res.json({ ok: true, en_conge: false });
  }

  // Activer le congé : marquer + dupliquer pour le remplaçant
  const aDesigner = db.prepare(`SELECT id FROM professeur WHERE nom = 'À DÉSIGNER' LIMIT 1`).get();
  const tx = db.transaction(() => {
    db.prepare('UPDATE attribution SET en_conge = 1 WHERE id = ?').run(orig.id);
    // Dupliquer la ligne pour le remplacement (mêmes périodes, prof à désigner, lien vers l'originale)
    const info = db.prepare(`
      INSERT INTO attribution
        (section, etablissement_referent, contrat_mdp, organisation, annee_scolaire,
         ue_num, num_organisation, quadrimestre_attribue, code_cours, type_cours, type_cours_helb,
         code, nb_groupes, split_groupe, num_split, num_groupe, activite_id,
         professeur_id, cours_ept_ad, coordination_encadrement,
         per_etudiant_total_dp, periodes_attribuees, autonomie_attribuee,
         remplace_attribution_id, created_by, updated_by)
      SELECT section, etablissement_referent, contrat_mdp, organisation, annee_scolaire,
         ue_num, num_organisation, quadrimestre_attribue, code_cours, type_cours, type_cours_helb,
         code, nb_groupes, split_groupe, num_split, num_groupe, activite_id,
         ?, cours_ept_ad, coordination_encadrement,
         per_etudiant_total_dp, periodes_attribuees, autonomie_attribuee,
         ?, ?, ?
      FROM attribution WHERE id = ?
    `).run(aDesigner?.id || null, orig.id, req.user?.id || null, req.user?.id || null, orig.id);
    return info.lastInsertRowid;
  });
  const newId = tx();
  res.json({ ok: true, en_conge: true, remplacement_id: newId });
});

// GET /attributions/section/:section/apercu-suppression?annee= — liste ce qui serait supprimé
// (preview avant suppression massive, admin uniquement)
r.get('/section/:section/apercu-suppression', authRequired, roleRequired('admin'), (req, res) => {
  const { section } = req.params;
  const { annee } = req.query;
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  const lignes = db.prepare(`
    SELECT a.id, a.ue_num, a.code_cours, c.cours_nom, a.type_cours,
           COALESCE(a.periodes_attribuees,0) AS per, COALESCE(a.autonomie_attribuee,0) AS aut,
           p.nom AS prof_nom, p.prenom AS prof_prenom
    FROM attribution a
    LEFT JOIN cours c ON c.cours_code = a.code_cours AND c.annee_scolaire = a.annee_scolaire AND c.section = a.section
    LEFT JOIN professeur p ON p.id = a.professeur_id
    WHERE a.section = ? AND a.annee_scolaire = ?
    ORDER BY a.ue_num, a.code_cours
  `).all(section, annee);
  res.json({ section, annee, count: lignes.length, lignes });
});

// DELETE /attributions/section/:section/tout?annee= — supprime TOUTES les attributions de la section
// (année active). Réservé admin. Fait une copie de sauvegarde auto avant suppression.
r.delete('/section/:section/tout', authRequired, roleRequired('admin'), (req, res) => {
  const { section } = req.params;
  const { annee } = req.query;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const nb = db.prepare('SELECT COUNT(*) AS c FROM attribution WHERE section = ? AND annee_scolaire = ?').get(section, annee).c;
  if (nb === 0) return res.json({ ok: true, supprimees: 0, backup: null });

  // 1. Backup auto de la base avant suppression
  let backupName = null;
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const dbPath = resolve(__dirname, '../../data/attributions.db');
    const backupsDir = resolve(__dirname, '../../data/backups-auto');
    if (!existsSync(backupsDir)) mkdirSync(backupsDir, { recursive: true });
    const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    const safeSection = String(section).replace(/[^a-zA-Z0-9-_]/g, '_');
    backupName = `avant-suppression-section-${safeSection}-${ts}.db`;
    try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch { /* ignore */ }
    copyFileSync(dbPath, resolve(backupsDir, backupName));
  } catch (e) {
    return res.status(500).json({ error: 'Sauvegarde préalable échouée, suppression annulée : ' + e.message });
  }

  // 2. Suppression (transaction)
  const tx = db.transaction(() => {
    return db.prepare('DELETE FROM attribution WHERE section = ? AND annee_scolaire = ?').run(section, annee).changes;
  });
  const supprimees = tx();
  res.json({ ok: true, supprimees, backup: backupName });
});

// GET /controle?section=&annee= — contrôle des multiples du DP par cours et de l'autonomie par UE
r.get('/controle', authRequired, (req, res) => {
  const { section, annee } = req.query;
  if (!section || !annee) return res.status(400).json({ error: 'section et annee requis' });
  const r2 = x => Math.round(x * 100) / 100;

  // Cours de la section (hors Z), avec DP (cours_per) et autonomie de base de l'UE (ue_autonomie)
  const cours = db.prepare(
    `SELECT cours_code, ue_num, cours_per, ue_autonomie
     FROM cours
     WHERE section = ? AND annee_scolaire = ? AND (ct_pp IS NULL OR ct_pp != 'Z')
     ORDER BY ue_num, cours_code`
  ).all(section, annee);

  // Périodes et autonomie attribuées par cours (IIP — l'autonomie est une notion IIP)
  const attribRows = db.prepare(
    `SELECT code_cours,
            COALESCE(SUM(periodes_attribuees),0) AS per,
            COALESCE(SUM(autonomie_attribuee),0) AS aut
     FROM attribution
     WHERE section = ? AND annee_scolaire = ?
     GROUP BY code_cours`
  ).all(section, annee);
  const attrib = {};
  for (const a of attribRows) attrib[a.code_cours] = { per: a.per || 0, aut: a.aut || 0 };

  // Regrouper par UE
  const ues = {};
  for (const c of cours) {
    (ues[c.ue_num] ||= { ue_num: c.ue_num, ue_autonomie: c.ue_autonomie || 0, cours: [] }).cours.push(c);
  }

  const out = [];
  for (const ue of Object.values(ues)) {
    let sommeDP = 0, sommePer = 0, sommeAut = 0;
    const multiplesPlein = []; // multiples nets (option 2 : seulement si exact)
    const coursControle = [];
    for (const c of ue.cours) {
      const a = attrib[c.cours_code] || { per: 0, aut: 0 };
      const per = a.per || 0, dp = c.cours_per || 0;
      sommeDP += dp; sommePer += per; sommeAut += (a.aut || 0);
      const ratio = dp > 0 ? per / dp : 0;
      const multipleEntier = Math.floor(ratio + 1e-9);
      const estMultiple = dp > 0 && per > 0 && Math.abs(per - Math.round(ratio) * dp) < 0.01;
      // Option 2 : un cours non-multiple net ne fait pas grimper le palier → on retient son multiple entier inférieur
      multiplesPlein.push(estMultiple ? Math.round(ratio) : multipleEntier);
      coursControle.push({
        code_cours: c.cours_code, dp, per,
        multiple: estMultiple ? Math.round(ratio) : null,    // multiple net si exact
        multiple_actuel: dp > 0 ? r2(ratio) : null,          // ratio réel (pour affichage ×2,96…)
        est_multiple: estMultiple,
        attendu: estMultiple || dp === 0 ? null
          : `${Math.max(1, Math.round(ratio)) * dp} (×${Math.max(1, Math.round(ratio))}) ou ${(Math.max(1, Math.floor(ratio)) + 1) * dp} (×${Math.max(1, Math.floor(ratio)) + 1})`,
      });
    }
    // Plancher : ue_autonomie × min(multiples nets entiers) ; min des paliers atteints par TOUS les cours
    const minMult = multiplesPlein.length ? Math.min(...multiplesPlein) : 1;
    const palier = Math.max(1, minMult);
    const plancher = (ue.ue_autonomie || 0) * palier;
    // Bonus 20% : sur les périodes de cours ajoutées au-delà des DP de base
    const ajouts = Math.max(0, sommePer - sommeDP);
    const plafond = plancher + 0.20 * ajouts;

    let etat, message;
    const tousMultiples = coursControle.every(c => c.est_multiple || c.dp === 0);
    if (!tousMultiples) {
      etat = 'cours'; message = `Certains cours ne sont pas un multiple de leur DP — corrigez-les d'abord.`;
    } else if (sommeAut < plancher) {
      etat = 'sous';
      message = `Il reste ${r2(plancher - sommeAut)} période(s) d'autonomie à placer (minimum obligatoire : ${r2(plancher)}).`
        + (plafond > plancher ? ` Vous pouvez monter jusqu'à ${r2(plafond)} (bonus 20% des dédoublements).` : '');
    } else if (sommeAut > plafond) {
      etat = 'dépassement';
      message = `Dépassement de ${r2(sommeAut - plafond)} période(s) d'autonomie (maximum autorisé : ${r2(plafond)}). Supprimez de l'autonomie ou ajoutez un dédoublement de cours.`;
    } else {
      etat = 'ok';
      message = `Autonomie correcte : ${r2(sommeAut)} (entre ${r2(plancher)} et ${r2(plafond)}).`
        + (sommeAut < plafond ? ` Vous pouvez encore placer jusqu'à ${r2(plafond - sommeAut)} période(s) si besoin.` : '');
    }

    out.push({
      ue_num: ue.ue_num,
      ue_autonomie: ue.ue_autonomie || 0,
      palier, plancher: r2(plancher), plafond: r2(plafond),
      autonomie_attribuee: r2(sommeAut),
      somme_periodes: r2(sommePer), somme_dp: r2(sommeDP),
      etat, message,
      cours: coursControle,
    });
  }

  res.json({ section, annee, ues: out });
});

export default r;
