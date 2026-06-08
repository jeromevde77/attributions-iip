/**
 * nominations.js — Engagement à titre définitif (ETD) et remise au travail (RT).
 * Le code FWB du dossier pédagogique est la clé métier unique de la nomination.
 */
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';

const r = Router();

// ─── Nominations d'un prof ────────────────────────────────────────────────────

// GET /nominations/prof/:id — nominations définitives d'un prof
r.get('/prof/:id', authRequired, (req, res) => {
  const rows = db.prepare(`
    SELECT n.*, u.ue_nom, u.ue_code_fwb
    FROM nomination_definitive n
    LEFT JOIN ue u ON u.ue_num = n.ue_num
    WHERE n.professeur_id = ? AND n.actif = 1
    GROUP BY n.id
    ORDER BY n.code_fwb
  `).all(req.params.id);
  res.json(rows);
});

// POST /nominations — créer une nomination
r.post('/', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { professeur_id, code_fwb, ue_num, cours_code, cours_libre, periodes, type_charge, notes } = req.body;
  if (!professeur_id) return res.status(400).json({ error: 'professeur_id requis' });
  // Une nomination est valide soit avec un code FWB + UE, soit en mode "UE absente" (cours_libre)
  const codeFinal = code_fwb || 'INCONNU';
  if (!ue_num && !cours_libre) return res.status(400).json({ error: 'UE ou nom de cours requis' });
  const info = db.prepare(`
    INSERT INTO nomination_definitive (professeur_id, code_fwb, ue_num, cours_code, cours_libre, periodes, type_charge, notes)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(professeur_id, codeFinal, ue_num || null, cours_code || null, cours_libre || null, periodes || 0, type_charge || null, notes || null);
  db.prepare(`UPDATE professeur SET statut_nomination = 'definitif' WHERE id = ? AND (statut_nomination IS NULL OR statut_nomination != 'definitif')`).run(professeur_id);
  res.json({ id: info.lastInsertRowid });
});

// PATCH /nominations/:id
r.patch('/:id', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const allowed = ['code_fwb', 'ue_num', 'cours_code', 'cours_libre', 'periodes', 'type_charge', 'actif', 'notes'];
  const updates = [], params = { id: req.params.id };
  for (const k of allowed) if (k in req.body) { updates.push(`${k} = @${k}`); params[k] = req.body[k]; }
  if (!updates.length) return res.status(400).json({ error: 'Rien à modifier' });
  db.prepare(`UPDATE nomination_definitive SET ${updates.join(', ')} WHERE id = @id`).run(params);
  res.json({ ok: true });
});

// DELETE /nominations/:id
r.delete('/:id', authRequired, roleRequired('admin'), (req, res) => {
  db.prepare('UPDATE nomination_definitive SET actif = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── Verrous : attributions verrouillées par une nomination ───────────────────
// GET /nominations/verrous?annee= — liste les attributions verrouillées (prof définitif sur son cours)
// Une attribution est verrouillée si le prof a une nomination active sur le même cours.
r.get('/verrous', authRequired, (req, res) => {
  const { annee } = req.query;
  const rows = db.prepare(`
    SELECT a.id AS attribution_id, a.professeur_id, a.code_cours, a.ue_num,
           n.id AS nomination_id, n.code_fwb, n.periodes AS periodes_nommees, n.type_charge
    FROM attribution a
    JOIN nomination_definitive n
      ON n.professeur_id = a.professeur_id
     AND n.actif = 1
     AND (n.cours_code = a.code_cours OR (n.cours_code IS NULL AND n.ue_num = a.ue_num))
    WHERE a.annee_scolaire = ?
  `).all(annee);
  res.json(rows);
});

// ─── Remise au travail ────────────────────────────────────────────────────────

// GET /nominations/rt/prof/:id
r.get('/rt/prof/:id', authRequired, (req, res) => {
  const rows = db.prepare(`
    SELECT rt.*, u.ue_nom FROM remise_travail rt
    LEFT JOIN ue u ON u.ue_num = rt.ue_num
    WHERE rt.professeur_id = ? ORDER BY rt.id DESC
  `).all(req.params.id);
  res.json(rows);
});

// POST /nominations/rt — créer une remise au travail
// Crée la RT + une ligne d'attribution (le prof y est placé, marquée RT).
// Body : { nomination_id, professeur_id, charge_perdue, ue_num, cours_code, periodes,
//          annee_scolaire, notes, mode: 'cours'|'autonomie' }
r.post('/rt', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { nomination_id, professeur_id, charge_perdue, ue_num, cours_code, periodes, annee_scolaire, notes, mode } = req.body;
  if (!professeur_id) return res.status(400).json({ error: 'professeur_id requis' });
  if (!ue_num || !cours_code) return res.status(400).json({ error: 'ue_num et cours_code requis pour créer la ligne RT' });

  const annee = annee_scolaire || '2025-2026';
  // Récupérer la section/type depuis le cours du DP
  const cours = db.prepare(`SELECT * FROM cours WHERE cours_code = ? AND annee_scolaire = ? AND ue_num = ? LIMIT 1`).get(cours_code, annee, ue_num);
  const section = cours?.section || null;
  const ue = db.prepare('SELECT et_ref FROM ue WHERE ue_num = ? AND annee_scolaire = ? AND section = ?').get(ue_num, annee, section);
  const contrat = ue?.et_ref || 'IIP';
  const perRT = Number(periodes) || 0;
  // mode 'autonomie' : les périodes RT vont dans autonomie_attribuee ; sinon en periodes_attribuees
  const enAuto = mode === 'autonomie';

  const tx = db.transaction(() => {
    const rt = db.prepare(`
      INSERT INTO remise_travail (nomination_id, professeur_id, charge_perdue, ue_num, cours_code, periodes, annee_scolaire, notes)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(nomination_id || null, professeur_id, charge_perdue || 0, ue_num, cours_code, perRT, annee, notes || null);

    const attr = db.prepare(`
      INSERT INTO attribution
        (section, etablissement_referent, contrat_mdp, organisation, annee_scolaire,
         ue_num, num_organisation, code_cours, type_cours, nb_groupes, split_groupe,
         cours_ept_ad, coordination_encadrement, per_etudiant_total_dp,
         periodes_attribuees, autonomie_attribuee, professeur_id,
         est_rt, rt_nomination_id, created_by, updated_by)
      VALUES (?, ?, ?, 'x', ?, ?, 1, ?, ?, 1, 'N', 'C', 'Cours', ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(section, contrat, contrat, annee, ue_num, cours_code, cours?.ct_pp || 'CT',
           cours?.cours_per || 0,
           enAuto ? 0 : perRT,           // periodes_attribuees
           enAuto ? perRT : 0,           // autonomie_attribuee
           professeur_id, nomination_id || null,
           req.user?.id || null, req.user?.id || null);

    return { rt_id: rt.lastInsertRowid, attribution_id: attr.lastInsertRowid };
  });
  const r2 = tx();
  res.json({ id: r2.rt_id, attribution_id: r2.attribution_id });
});

// DELETE /nominations/rt/:id
r.delete('/rt/:id', authRequired, roleRequired('admin'), (req, res) => {
  db.prepare('DELETE FROM remise_travail WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// GET /nominations/pertes-charge?annee= — profs définitifs dont l'ETP nommé n'est pas couvert
// Calcul GLOBAL en ETP par prof : ETP nommé total vs ETP couvert (cours nommés + lignes RT).
// CT/PP interchangeables (CT/800, PP/1000).
r.get('/pertes-charge', authRequired, (req, res) => {
  const { annee } = req.query;
  const etp = (per, type) => (type === 'PP' ? (per || 0) / 1000 : (per || 0) / 800);

  const noms = db.prepare(`
    SELECT n.*, p.nom AS prof_nom, p.prenom AS prof_prenom
    FROM nomination_definitive n
    JOIN professeur p ON p.id = n.professeur_id
    WHERE n.actif = 1
  `).all();

  // Regrouper les nominations par prof
  const parProf = {};
  for (const n of noms) {
    (parProf[n.professeur_id] ||= { prof: `${n.prof_prenom || ''} ${n.prof_nom}`.trim(), noms: [] }).noms.push(n);
  }

  const pertes = [];
  for (const [profId, info] of Object.entries(parProf)) {
    const attributions = db.prepare(`
      SELECT code_cours, ue_num, type_cours, est_rt,
             COALESCE(periodes_attribuees,0)+COALESCE(autonomie_attribuee,0) AS total
      FROM attribution
      WHERE annee_scolaire = ? AND professeur_id = ?
    `).all(annee, profId);

    const coursNommes = new Set(info.noms.filter(n => n.cours_code).map(n => n.cours_code));
    const ueNommees = new Set(info.noms.filter(n => !n.cours_code && n.ue_num).map(n => n.ue_num));

    let etpNomme = 0;
    for (const n of info.noms) etpNomme += etp(n.periodes, n.type_charge);

    let etpCouvert = 0;
    for (const a of attributions) {
      const e = etp(a.total, a.type_cours);
      if (a.est_rt) etpCouvert += e;
      else if (coursNommes.has(a.code_cours) || ueNommees.has(a.ue_num)) etpCouvert += e;
    }

    const manque = etpNomme - etpCouvert;
    if (manque > 1e-9) {
      pertes.push({
        professeur_id: Number(profId),
        prof: info.prof,
        etp_nomme: Math.round(etpNomme * 10000) / 10000,
        etp_couvert: Math.round(etpCouvert * 10000) / 10000,
        etp_manque: Math.round(manque * 10000) / 10000,
        // équivalent en périodes CT pour lisibilité (manque × 800)
        equiv_periodes_ct: Math.round(manque * 800),
      });
    }
  }
  res.json(pertes);
});

// GET /nominations/alertes-cours?annee= — alerte "un définitif est engagé sur ce cours"
// Matche par COURS (code FWB de l'UE ou code_cours), indépendamment du prof attribué.
// Permet d'avertir quand on (re)crée une UE/section où un cours a un titulaire définitif,
// même si l'attribution est vide ou confiée à quelqu'un d'autre.
r.get('/alertes-cours', authRequired, (req, res) => {
  const { annee } = req.query;
  const rows = db.prepare(`
    SELECT a.id AS attribution_id, a.professeur_id AS prof_attribue_id, a.code_cours, a.ue_num,
           n.id AS nomination_id, n.code_fwb, n.periodes AS periodes_nommees, n.type_charge,
           n.professeur_id AS definitif_id,
           p.nom AS definitif_nom, p.prenom AS definitif_prenom
    FROM attribution a
    JOIN ue u ON u.ue_num = a.ue_num AND u.annee_scolaire = a.annee_scolaire AND u.section = a.section
    JOIN nomination_definitive n
      ON n.actif = 1
     AND (
          -- Nomination sur un cours précis : matche UNIQUEMENT ce cours
          (n.cours_code IS NOT NULL AND n.cours_code = a.code_cours)
          -- Nomination sur toute l'UE (pas de cours précis) : matche les cours de l'UE
          OR (n.cours_code IS NULL AND n.ue_num = a.ue_num)
          -- Nomination sur toute l'UE via code FWB (pas de cours ni d'UE précis)
          OR (n.cours_code IS NULL AND n.ue_num IS NULL AND n.code_fwb IS NOT NULL AND n.code_fwb != 'INCONNU' AND n.code_fwb = u.ue_code_fwb)
         )
    JOIN professeur p ON p.id = n.professeur_id
    WHERE a.annee_scolaire = ?
  `).all(annee);
  // Indexé par attribution + si le définitif est déjà celui attribué (pas d'alerte dans ce cas)
  const alertes = rows
    .filter(r => r.definitif_id !== r.prof_attribue_id) // alerte seulement si le définitif n'est PAS le prof attribué
    .map(r => ({
      attribution_id: r.attribution_id,
      code_cours: r.code_cours,
      ue_num: r.ue_num,
      code_fwb: r.code_fwb,
      definitif: `${r.definitif_prenom || ''} ${r.definitif_nom}`.trim(),
      periodes_nommees: r.periodes_nommees,
      type_charge: r.type_charge,
    }));
  res.json(alertes);
});

// POST /nominations/appliquer — place les profs définitifs sur leurs cours
// Body : { annee, ue_num (optionnel), section (optionnel) }
// Pour chaque nomination active avec un cours précis, place le définitif sur les
// attributions correspondantes qui sont vides ou "À DÉSIGNER", à concurrence des
// périodes nommées. Renvoie un rapport (placés + alertes de dépassement).
r.post('/appliquer', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { annee, ue_num, section } = req.body;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const aDesigner = db.prepare(`SELECT id FROM professeur WHERE nom = 'À DÉSIGNER' LIMIT 1`).get();
  const aDesignerId = aDesigner?.id || null;

  let sql = `SELECT * FROM nomination_definitive WHERE actif = 1 AND cours_code IS NOT NULL`;
  const params = [];
  if (ue_num) { sql += ' AND ue_num = ?'; params.push(ue_num); }
  const noms = db.prepare(sql).all(...params);

  const places = [], alertes = [];
  const tx = db.transaction(() => {
    for (const n of noms) {
      // Attributions de ce cours (vides ou À DÉSIGNER), dans l'année (et section si fournie)
      let aSql = `
        SELECT a.id, a.professeur_id, a.periodes_attribuees, a.code_cours, a.section,
               c.cours_per
        FROM attribution a
        LEFT JOIN cours c ON c.cours_code = a.code_cours AND c.annee_scolaire = a.annee_scolaire AND c.section = a.section
        WHERE a.annee_scolaire = ? AND a.code_cours = ?
          AND (a.professeur_id IS NULL OR a.professeur_id = ?)`;
      const aParams = [annee, n.cours_code, aDesignerId];
      if (section) { aSql += ' AND a.section = ?'; aParams.push(section); }
      const lignes = db.prepare(aSql).all(...aParams);
      if (!lignes.length) continue;

      // Placer le définitif sur la première ligne disponible
      const ligne = lignes[0];
      const coursPerLigne = ligne.cours_per || ligne.periodes_attribuees || 0;
      const perNommees = n.periodes || 0;

      db.prepare(`UPDATE attribution SET professeur_id = ? WHERE id = ?`).run(n.professeur_id, ligne.id);
      places.push({ attribution_id: ligne.id, cours_code: n.cours_code, professeur_id: n.professeur_id, periodes_nommees: perNommees });

      // Contrôle de volume : périodes attribuées (cours) >= périodes nommées ?
      if (perNommees > coursPerLigne) {
        alertes.push({
          cours_code: n.cours_code,
          professeur_id: n.professeur_id,
          periodes_nommees: perNommees,
          periodes_cours: coursPerLigne,
          manque: Math.round((perNommees - coursPerLigne) * 10) / 10,
          message: `Nommé pour ${perNommees} pér. mais le cours ${n.cours_code} n'en fait que ${coursPerLigne}. Ajouter ${Math.round((perNommees - coursPerLigne)*10)/10} pér. (autonomie ou autre cours).`,
        });
      }
    }
  });
  tx();
  res.json({ ok: true, places: places.length, alertes });
});

// GET /nominations/prof/:id/situation?annee= — tableau de bord ETD d'un prof (calcul ETP global)
// L'ETP nommé total doit être couvert par l'ETP des cours nommés + des lignes cochées RT.
// CT et PP sont interchangeables (équivalence en ETP : CT/800, PP/1000).
r.get('/prof/:id/situation', authRequired, (req, res) => {
  const { annee } = req.query;
  const profId = req.params.id;
  const etp = (per, type) => (type === 'PP' ? (per || 0) / 1000 : (per || 0) / 800);

  const noms = db.prepare(`
    SELECT n.*, u.ue_nom FROM nomination_definitive n
    LEFT JOIN ue u ON u.ue_num = n.ue_num
    WHERE n.professeur_id = ? AND n.actif = 1
    ORDER BY n.code_fwb
  `).all(profId);

  const attributions = db.prepare(`
    SELECT a.id, a.ue_num, a.code_cours, a.section, a.type_cours,
           a.periodes_attribuees, a.autonomie_attribuee,
           COALESCE(a.periodes_attribuees,0)+COALESCE(a.autonomie_attribuee,0) AS total,
           a.est_rt, a.rt_nomination_id, a.en_conge,
           c.cours_nom
    FROM attribution a
    LEFT JOIN cours c ON c.cours_code = a.code_cours AND c.annee_scolaire = a.annee_scolaire AND c.section = a.section
    WHERE a.annee_scolaire = ? AND a.professeur_id = ?
    ORDER BY a.ue_num, a.code_cours
  `).all(annee, profId);

  // Liste des cours nommés (pour repérer la couverture directe)
  const coursNommes = new Set(noms.filter(n => n.cours_code).map(n => n.cours_code));
  const ueNommees = new Set(noms.filter(n => !n.cours_code && n.ue_num).map(n => n.ue_num));

  // ── Bilan ETP global ──
  let etpNomme = 0;
  for (const n of noms) etpNomme += etp(n.periodes, n.type_charge);

  let etpDirect = 0, etpRT = 0;
  for (const a of attributions) {
    const e = etp(a.total, a.type_cours);
    if (a.est_rt) { etpRT += e; continue; }
    // couverture directe : la ligne est sur un cours (ou UE) nommé
    if (coursNommes.has(a.code_cours) || ueNommees.has(a.ue_num)) etpDirect += e;
  }
  const etpCouvert = etpDirect + etpRT;
  const r4 = x => Math.round(x * 10000) / 10000;
  const bilan = {
    etp_nomme: r4(etpNomme),
    etp_direct: r4(etpDirect),
    etp_rt: r4(etpRT),
    etp_couvert: r4(etpCouvert),
    etp_manque: r4(Math.max(0, etpNomme - etpCouvert)),
    couvert: etpCouvert + 1e-9 >= etpNomme,
  };

  // Détail par nomination (informatif : nommé + ETP de cette nomination)
  const situation = noms.map(n => ({
    nomination_id: n.id, code_fwb: n.code_fwb, ue_num: n.ue_num, ue_nom: n.ue_nom,
    cours_code: n.cours_code, cours_libre: n.cours_libre, type_charge: n.type_charge,
    periodes_nommees: n.periodes || 0,
    etp: r4(etp(n.periodes, n.type_charge)),
  }));

  res.json({ situation, attributions, bilan });
});

// PATCH /nominations/attribution/:attrId/rt — coche/décoche une attribution comme RT
// Calcul global ETP : pas de rattachement à une nomination précise (Option 1).
r.patch('/attribution/:attrId/rt', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { est_rt } = req.body;
  db.prepare(`UPDATE attribution SET est_rt = ?, rt_nomination_id = NULL WHERE id = ?`)
    .run(est_rt ? 1 : 0, req.params.attrId);
  res.json({ ok: true });
});

export default r;
