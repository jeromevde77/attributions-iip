// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Droit d'inscription (DI) et droit d'inscription spécifique (DIS)
//
// DI — circulaire n° 9731 du 27/05/2026, applicable dès le 24/08/2026 :
//   un forfait par étudiant et par année académique, plus un montant par
//   période de cours, plafonné à 800 périodes. Le tarif diffère selon que
//   l'UE relève du secondaire ou du supérieur ; le plafond, lui, est GLOBAL
//   et s'épuise en comptant d'abord les périodes du secondaire — c'est ce que
//   montre l'exemple 5.1 de la circulaire (500 secondaire + 400 supérieur
//   donnent 500 × 0,30 + 300 × 0,47).
//   Les UE en dispense complète ne donnent lieu à aucun droit d'inscription.
//
// DIS — A.E. du 25/09/1991, art. 2, 4° : dû par les étudiants de nationalité
//   étrangère non exemptés, à raison d'un montant par période hebdomadaire
//   prévue à l'horaire, plafonné. Les exemptions sont énumérées à l'article 1er.
//
// Les montants sont indexés chaque année : ils sont donc paramétrés, non codés.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';

const r = Router();

// Barème 2026-2027 — circulaire 9731 et A.E. 25-09-1991
const BAREME_DEFAUT = {
  forfait: 34,
  tarif_secondaire: 0.30,
  tarif_superieur: 0.47,
  plafond_periodes: 800,
  dis_par_periode_hebdo: 30,
  dis_plafond: 238,
  dis_courte_courte: 119,     // formation courte ≤ 240 h
  dis_courte_longue: 238,     // formation courte > 240 h
};

// Motifs d'exonération du DI — circulaire 9731, § 3 (art. 12 §3 du Pacte scolaire)
export const MOTIFS_DI = [
  { code: 'mineur',        libelle: "Mineur soumis à l'obligation scolaire" },
  { code: 'chomeur',       libelle: 'Chômeur complet indemnisé ou AGR à temps partiel' },
  { code: 'chomeur_form',  libelle: 'Chômeur complet indemnisé en formation professionnelle' },
  { code: 'demandeur',     libelle: "Demandeur d'emploi inoccupé inscrit, stage d'insertion" },
  { code: 'aide_emploi',   libelle: "Programme d'aide à l'emploi (hors ACS et APE)" },
  { code: 'handicap',      libelle: 'Personne en situation de handicap (document probant)' },
  { code: 'ris',           libelle: "Revenu d'intégration sociale (RIS) ou aide équivalente (ERIS)" },
  { code: 'milicien',      libelle: 'Milicien' },
  { code: 'bes_aesi',      libelle: 'BES assistant en soins infirmiers, boursier' },
  { code: 'personnel_fc',  libelle: 'Personnel enseignant — formation continuée ou recyclage' },
  { code: 'obligation',    libelle: "Obligation imposée par une autorité publique" },
  { code: 'fle_a2',        libelle: 'Français langue étrangère, niveau A2 au plus' },
  { code: 'alpha',         libelle: 'Alphabétisation ou secondaire inférieur sans CEB requis' },
];

// Motifs d'exemption du DIS — A.E. 25-09-1991, article 1er
export const MOTIFS_DIS = [
  { code: 'ue_membre',     libelle: "Ressortissant d'un État membre de l'Union européenne" },
  { code: 'conjoint',      libelle: 'Conjoint ou cohabitant légal résidant et travaillant en Belgique' },
  { code: 'tutelle',       libelle: 'Bénéficiaire de la tutelle officieuse' },
  { code: 'refugie',       libelle: 'Réfugié ou candidat-réfugié, ou enfant de' },
  { code: 'regularisation',libelle: 'Demande de régularisation introduite (loi du 22/12/1999)' },
  { code: 'protection',    libelle: 'Protection subsidiaire ou temporaire' },
  { code: 'cpas',          libelle: "Pris en charge par un CPAS" },
  { code: 'activite',      libelle: 'Réside en Belgique et y exerce une activité ou perçoit des revenus de remplacement' },
  { code: 'bourse_coop',   libelle: "Boursier de la coopération au développement" },
  { code: 'bourse_accord', libelle: "Boursier dans le cadre d'un accord culturel" },
  { code: 'convention',    libelle: "Ressortissant d'un État ayant ratifié la convention européenne d'établissement" },
  { code: 'juge',          libelle: 'Placé par le juge de la jeunesse' },
];

export function migrerDroitInscription(dbx) {
  try {
    dbx.exec(`
    CREATE TABLE IF NOT EXISTS di_bareme (
      annee_scolaire        TEXT PRIMARY KEY,
      forfait               REAL NOT NULL DEFAULT 34,
      tarif_secondaire      REAL NOT NULL DEFAULT 0.30,
      tarif_superieur       REAL NOT NULL DEFAULT 0.47,
      plafond_periodes      INTEGER NOT NULL DEFAULT 800,
      dis_par_periode_hebdo REAL NOT NULL DEFAULT 30,
      dis_plafond           REAL NOT NULL DEFAULT 238,
      base_legale           TEXT,
      maj_le                TEXT DEFAULT (datetime('now'))
    );`);

    const addCol = def => { try { dbx.exec('ALTER TABLE etudiant ADD COLUMN ' + def); } catch {} };
    addCol('di_exonere INTEGER NOT NULL DEFAULT 0');
    addCol('di_motif TEXT');
    addCol('dis_soumis INTEGER NOT NULL DEFAULT 0');     // nationalité étrangère hors exemption
    addCol('dis_motif_exemption TEXT');
    addCol('dis_periodes_hebdo REAL');
    console.log('[migration] di_bareme + champs droit d\u2019inscription');
  } catch (e) { console.error('[migration] droit inscription :', e.message); }
}

export function bareme(annee) {
  const row = db.prepare('SELECT * FROM di_bareme WHERE annee_scolaire = ?').get(annee);
  return row || { annee_scolaire: annee, ...BAREME_DEFAUT, defaut: true };
}

/**
 * Calcule le droit d'inscription d'un étudiant pour une année.
 * Les périodes retenues sont celles des UE inscrites, hors dispense complète.
 */
export function calculerDI(etudId, annee) {
  const b = bareme(annee);

  const e = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(etudId);
  if (!e) return null;

  // UE inscrites, avec leurs périodes et leur niveau d'enseignement
  const lignes = db.prepare(`
    SELECT i.ue_num, i.dispense_complete,
           (SELECT ue_per_cours FROM ue x WHERE x.ue_num = i.ue_num
             ORDER BY CASE WHEN x.annee_scolaire = i.annee_scolaire THEN 0 ELSE 1 END,
                      x.annee_scolaire DESC LIMIT 1) AS periodes,
           (SELECT ue_niveau FROM ue x WHERE x.ue_num = i.ue_num
             ORDER BY CASE WHEN x.annee_scolaire = i.annee_scolaire THEN 0 ELSE 1 END,
                      x.annee_scolaire DESC LIMIT 1) AS niveau,
           (SELECT ue_nom FROM ue x WHERE x.ue_num = i.ue_num
             ORDER BY x.annee_scolaire DESC LIMIT 1) AS ue_nom
    FROM etudiant_inscription i
    WHERE i.etudiant_id = ? AND i.annee_scolaire = ?
    ORDER BY i.ue_num
  `).all(etudId, annee);

  // Les UE valorisées en dispense complète ne donnent lieu à aucun droit
  const vaCompletes = new Set(
    db.prepare("SELECT ue_num FROM etudiant_valorisation WHERE etudiant_id = ? AND type = 'complete'")
      .all(etudId).map(v => v.ue_num));

  const detail = lignes.map(l => {
    const dispensee = !!l.dispense_complete || vaCompletes.has(l.ue_num);
    const sup = String(l.niveau || '').toUpperCase().startsWith('SUP');
    return {
      ue_num: l.ue_num, ue_nom: l.ue_nom,
      periodes: dispensee ? 0 : Number(l.periodes || 0),
      periodes_brutes: Number(l.periodes || 0),
      niveau: sup ? 'superieur' : 'secondaire',
      dispensee,
    };
  });

  const perSec = detail.filter(d => d.niveau === 'secondaire').reduce((s, d) => s + d.periodes, 0);
  const perSup = detail.filter(d => d.niveau === 'superieur').reduce((s, d) => s + d.periodes, 0);

  // Plafond global, les périodes du secondaire comptées en premier (ex. 5.1)
  const secRetenues = Math.min(perSec, b.plafond_periodes);
  const supRetenues = Math.max(0, Math.min(perSup, b.plafond_periodes - secRetenues));

  const montantSec = secRetenues * b.tarif_secondaire;
  const montantSup = supRetenues * b.tarif_superieur;
  const brut = detail.length ? b.forfait + montantSec + montantSup : 0;

  const exonere = !!e.di_exonere;
  const du = exonere ? 0 : Math.round(brut * 100) / 100;

  // Arrondi aux 5 cents les plus proches — uniquement sur le montant perçu
  const percu = Math.round(du * 20) / 20;

  return {
    annee, bareme: b,
    detail,
    periodes: { secondaire: perSec, superieur: perSup, total: perSec + perSup },
    retenues: { secondaire: secRetenues, superieur: supRetenues },
    plafond_atteint: (perSec + perSup) > b.plafond_periodes,
    forfait: detail.length ? b.forfait : 0,
    montant_secondaire: Math.round(montantSec * 100) / 100,
    montant_superieur: Math.round(montantSup * 100) / 100,
    montant_constate: Math.round(brut * 100) / 100,
    montant_du: du,
    montant_arrondi: percu,
    exonere,
    motif: e.di_motif || null,
  };
}

/** Droit d'inscription spécifique — A.E. 25-09-1991, art. 2, 4° a). */
export function calculerDIS(etudId, annee) {
  const b = bareme(annee);
  const e = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(etudId);
  if (!e) return null;

  const soumis = !!e.dis_soumis && !e.dis_motif_exemption;
  const hebdo = Number(e.dis_periodes_hebdo || 0);
  const brut = Math.min(hebdo * b.dis_par_periode_hebdo, b.dis_plafond);

  return {
    soumis,
    exempte: !!e.dis_motif_exemption,
    motif_exemption: e.dis_motif_exemption || null,
    periodes_hebdo: hebdo,
    montant_du: soumis ? Math.round(brut * 100) / 100 : 0,
    plafond: b.dis_plafond,
    plafond_atteint: soumis && hebdo * b.dis_par_periode_hebdo > b.dis_plafond,
  };
}

// ── Consultation ────────────────────────────────────────────────────────────
r.get('/etudiant/:id', authRequired, (req, res) => {
  const annee = req.query.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  const di = calculerDI(Number(req.params.id), annee);
  if (!di) return res.status(404).json({ error: 'étudiant introuvable' });
  res.json({ di, dis: calculerDIS(Number(req.params.id), annee), motifs_di: MOTIFS_DI, motifs_dis: MOTIFS_DIS });
});

// ── Situation de l'étudiant au regard des deux droits ──────────────────────
r.put('/etudiant/:id', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { di_exonere, di_motif, dis_soumis, dis_motif_exemption, dis_periodes_hebdo } = req.body;
  db.prepare(`
    UPDATE etudiant SET
      di_exonere = ?, di_motif = ?,
      dis_soumis = ?, dis_motif_exemption = ?, dis_periodes_hebdo = ?
    WHERE id = ?
  `).run(
    di_exonere ? 1 : 0, di_exonere ? (di_motif || null) : null,
    dis_soumis ? 1 : 0, dis_motif_exemption || null,
    dis_periodes_hebdo != null && dis_periodes_hebdo !== '' ? Number(dis_periodes_hebdo) : null,
    Number(req.params.id));
  res.json({ ok: true });
});

// ── Barème de l'année ───────────────────────────────────────────────────────
r.get('/bareme', authRequired, (req, res) => {
  const annee = req.query.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  res.json(bareme(annee));
});

r.put('/bareme', authRequired, roleRequired('admin'), (req, res) => {
  const { annee_scolaire, forfait, tarif_secondaire, tarif_superieur,
          plafond_periodes, dis_par_periode_hebdo, dis_plafond, base_legale } = req.body;
  if (!annee_scolaire) return res.status(400).json({ error: 'annee_scolaire requise' });
  db.prepare(`
    INSERT INTO di_bareme (annee_scolaire, forfait, tarif_secondaire, tarif_superieur,
                           plafond_periodes, dis_par_periode_hebdo, dis_plafond, base_legale, maj_le)
    VALUES (?,?,?,?,?,?,?,?, datetime('now'))
    ON CONFLICT(annee_scolaire) DO UPDATE SET
      forfait = excluded.forfait, tarif_secondaire = excluded.tarif_secondaire,
      tarif_superieur = excluded.tarif_superieur, plafond_periodes = excluded.plafond_periodes,
      dis_par_periode_hebdo = excluded.dis_par_periode_hebdo, dis_plafond = excluded.dis_plafond,
      base_legale = excluded.base_legale, maj_le = datetime('now')
  `).run(annee_scolaire,
    Number(forfait ?? 34), Number(tarif_secondaire ?? 0.30), Number(tarif_superieur ?? 0.47),
    Number(plafond_periodes ?? 800), Number(dis_par_periode_hebdo ?? 30), Number(dis_plafond ?? 238),
    base_legale || 'Circulaire 9731 du 27/05/2026 · A.E. 25-09-1991 art. 2');
  res.json({ ok: true });
});

export default r;
