import { effectifsAnnee, gelerSiTemps } from '../lib/effectifs.js';
import { donneesPopulation, inscrits, corrigerReference } from '../lib/populationEcole.js';
import { anneeDeTravail } from '../helpers/annee.js';
import { sectionRattachement } from './etudiants.js';
import { getParamNum } from './parametres.js';
import { placementsSection } from '../lib/placement.js';
import { donneesPersonnel } from '../lib/chiffresCles.js';
import { Router } from 'express';
import { donneesIipHelb, viderMemoCout, coutMemo, COMPARAISON_HE, PARAM_HELB, COR_HELB, enseignantsHelbCivil, estimationAnnee } from '../lib/rapportIipHelb.js';
import { reussiteParSection } from './statsDeliberation.js';
import { lireSource, enregistrerSource, listerSources, retirerSource, sourcesEnVigueur, dernierRealise, realiseComplet, syntheseAsbl, NATURES } from '../lib/sourcesReference.js';
import db from '../db/index.js';
import { sectionsCodiplomation } from '../lib/grillePresence.js';
import { authRequired, roleRequired, getUserSections} from '../middleware/auth.js';

const r = Router();

// ── Expressions SQL réutilisables ────────────────────────────────────────────
// pot_code effectif : colonne explicite ou auto-détecté depuis ue_code_fwb
const POT = `COALESCE(u.pot_code,
  CASE WHEN u.ue_code_fwb LIKE '980302%' THEN 'QUAL'
       WHEN u.ue_code_fwb LIKE '980301%' THEN 'CF'
       WHEN u.ue_code_fwb LIKE '980303%' THEN 'INCL'
       ELSE 'organique' END)`;

/* UNE LIGNE EN CONGÉ NE COÛTE RIEN (12 octobre 2026, Charles : « un prof en congé ne compte pas
 * dans la dotation ; il est remplacé — sinon on paierait deux fois »). La vue v_attribution_complete
 * l'écartait déjà ; le Pilotage, qui recalcule sur la table brute, ne le faisait pas : le titulaire
 * en congé et son remplaçant étaient comptés tous deux. Toute formule de coût d'ici commence donc
 * par ce garde. */
const HORS_CONGE = `COALESCE(a.en_conge, 0) = 1`;

// Coût dotation Q1 (périodes B pondérées, IIP uniquement)
const CQ1 = `CASE WHEN ${HORS_CONGE} THEN 0
     WHEN COALESCE(a.quadrimestre_attribue, u.ue_quad)='Q1' THEN
       CASE WHEN u.ue_niveau='SUP' THEN a.total_attribue_professeur*1.5
            WHEN u.ue_niveau='DS'  THEN a.total_attribue_professeur*1.25
            ELSE 0 END
     WHEN COALESCE(a.quadrimestre_attribue, u.ue_quad)='Q1/Q2' THEN
       CASE WHEN u.ue_niveau='SUP' THEN a.total_attribue_professeur*1.5*0.4
            WHEN u.ue_niveau='DS'  THEN a.total_attribue_professeur*1.25*0.4
            ELSE 0 END
     ELSE 0 END`;

// Coût dotation Q2
const CQ2 = `CASE WHEN ${HORS_CONGE} THEN 0
     WHEN COALESCE(a.quadrimestre_attribue, u.ue_quad)='Q2' THEN
       CASE WHEN u.ue_niveau='SUP' THEN a.total_attribue_professeur*1.5
            WHEN u.ue_niveau='DS'  THEN a.total_attribue_professeur*1.25
            ELSE 0 END
     WHEN COALESCE(a.quadrimestre_attribue, u.ue_quad)='Q1/Q2' THEN
       CASE WHEN u.ue_niveau='SUP' THEN a.total_attribue_professeur*1.5*0.6
            WHEN u.ue_niveau='DS'  THEN a.total_attribue_professeur*1.25*0.6
            ELSE 0 END
     ELSE 0 END`;

// ── Helper année civile ───────────────────────────────────────────────────────
function anneesCivile(y) {
  return {
    q2: `${y - 1}-${y}`,     // Jan-Jun → Q2 de l'année scolaire précédente
    q1: `${y}-${y + 1}`,     // Sep-Déc → Q1 de l'année scolaire suivante
  };
}

// Calcule usage par pot pour une liste d'années civiles depuis la DB
function computeUsageDB(anneesCiviles) {
  if (!anneesCiviles.length) return {};
  const anneesScolaires = new Set();
  for (const y of anneesCiviles) {
    const { q2, q1 } = anneesCivile(y);
    anneesScolaires.add(q2);
    anneesScolaires.add(q1);
  }
  const inClause = [...anneesScolaires].map(a => `'${a}'`).join(',');
  const rows = db.prepare(`
    SELECT
      a.annee_scolaire,
      ${POT} AS pot,
      ROUND(SUM(${CQ1}), 2) AS q1,
      ROUND(SUM(${CQ2}), 2) AS q2
    FROM attribution a
    LEFT JOIN ue u ON u.ue_num = a.ue_num AND u.annee_scolaire = a.annee_scolaire
    WHERE a.annee_scolaire IN (${inClause}) AND a.contrat_mdp = 'IIP'
    GROUP BY a.annee_scolaire, pot
  `).all();
  // { annee_scolaire → { pot → { q1, q2 } } }
  const byAnnee = {};
  for (const row of rows) {
    if (!byAnnee[row.annee_scolaire]) byAnnee[row.annee_scolaire] = {};
    byAnnee[row.annee_scolaire][row.pot] = { q1: row.q1 || 0, q2: row.q2 || 0 };
  }
  return byAnnee;
}

// Usage d'une enveloppe externe pour une année civile :
// L'enveloppe correspond à l'année scolaire YYYY-1 → YYYY (ex: civile 2026 = scolaire 2025-2026)
// On prend la totalité des périodes B pondérées de cette année scolaire pour ce pot
function usageEnveloppe(anneeCivile) {
  const annee_scolaire = `${anneeCivile - 1}-${anneeCivile}`;
  return db.prepare(`
    SELECT ${POT} AS pot,
      ROUND(SUM(
        CASE WHEN ${HORS_CONGE} THEN 0
             WHEN u.ue_niveau='SUP' THEN a.total_attribue_professeur * 1.5
             WHEN u.ue_niveau='DS'  THEN a.total_attribue_professeur * 1.25
             ELSE a.total_attribue_professeur END
      ), 2) AS periodes_b
    FROM attribution a
    LEFT JOIN ue u ON u.ue_num = a.ue_num AND u.annee_scolaire = a.annee_scolaire
    WHERE a.annee_scolaire = ? AND a.contrat_mdp = 'IIP'
      AND ${POT} NOT IN ('organique')
    GROUP BY pot
  `).all(annee_scolaire).reduce((acc, r) => { acc[r.pot] = r.periodes_b || 0; return acc; }, {});
}

// Calcul usage d'un pot pour une année civile depuis usageDB
function usagePot(usageDB, y, potKey) {
  const d = usagePotDetail(usageDB, y, potKey);
  return Math.round((d.jan_juin + d.sep_dec) * 100) / 100;
}

/**
 * L'ANNÉE CIVILE SE LIT EN DEUX MOITIÉS, ET ELLES N'ONT PAS LE MÊME STATUT.
 *
 * Une année civile chevauche deux années scolaires : janvier-juin est le
 * second quadrimestre de l'année scolaire qui s'achève, septembre-décembre le
 * premier de celle qui commence. En cours d'année civile, la première moitié
 * est donc CONSOMMÉE — l'année scolaire est close, plus rien n'y bougera —
 * tandis que la seconde est seulement ENGAGÉE, et se complétera encore.
 *
 * Les additionner en un seul « utilisé » cache la question que la direction
 * se pose en juillet : « la première moitié est jouée, combien me reste-t-il
 * pour la rentrée ? » Le total ne la dit pas ; les deux moitiés, si.
 */
function usagePotDetail(usageDB, y, potKey) {
  const { q2, q1 } = anneesCivile(y);
  const q2val = usageDB[q2]?.[potKey] || { q1: 0, q2: 0 };
  const q1val = usageDB[q1]?.[potKey] || { q1: 0, q2: 0 };
  return {
    jan_juin: Math.round(q2val.q2 * 100) / 100,   // Q2 de l'année scolaire close
    sep_dec: Math.round(q1val.q1 * 100) / 100,    // Q1 de l'année scolaire ouverte
    scolaire_jan_juin: q2,
    scolaire_sep_dec: q1,
    // LA MOITIÉ QUI VIENT — et qui manquait. L'année scolaire OUVERTE a deux
    // quadrimestres : son Q1 tombe en septembre-décembre de cette année civile,
    // son Q2 en janvier-juin de la SUIVANTE. Le tableau ne montrait que les
    // deux moitiés de l'année civile : de l'année académique en cours, on ne
    // voyait donc que le premier quadrimestre, et l'engagement déjà pris pour
    // janvier n'apparaissait nulle part — alors qu'il est attribué, connu, et
    // qu'il pèsera sur la dotation de l'année civile suivante.
    jan_juin_suivant: Math.round(q1val.q2 * 100) / 100,
  };
}

// ── Routes existantes (par année scolaire) ───────────────────────────────────
/**
 * Périmètre de l'utilisateur, ajouté au filtre d'année.
 *
 * Le pilotage n'était pas cloisonné : un coordinateur y voyait la dotation de
 * tout l'établissement. Il doit pouvoir suivre SES sections, pas les autres.
 */
function perimetreSection(req, alias = '') {
  const s = getUserSections(req.user);
  if (s === null) return { clause: '', params: {} };
  if (!s.length) return { clause: ` AND 1 = 0`, params: {} };
  const col = alias ? `${alias}.section` : 'section';
  const params = {};
  s.forEach((sec, i) => { params[`perim${i}`] = sec; });
  return {
    clause: ` AND ${col} IN (${s.map((_, i) => '@perim' + i).join(',')})`,
    params,
  };
}

function anneeFilter(req) {
  const annee = req.query.annee || '2025-2026';
  return { where: 'annee_scolaire = @annee', params: { annee } };
}

r.get('/section-niveau', authRequired, (req, res) => {
  const { where, params } = anneeFilter(req);
  const perim = perimetreSection(req);
  res.json(db.prepare(`
    SELECT section, bloc,
      SUM(total_attribue_professeur) AS periodes_att,
      SUM(CASE WHEN contrat_mdp='IIP'  THEN total_attribue_professeur ELSE 0 END) AS iip,
      SUM(CASE WHEN contrat_mdp='HELB' THEN total_attribue_professeur ELSE 0 END) AS helb,
      SUM(cout_dotation)   AS per_b,
      SUM(cout_dotation_q1) AS sd,
      SUM(cout_dotation_q2) AS jj
    FROM v_attribution_complete WHERE ${where}${perim.clause}
    GROUP BY section, bloc ORDER BY section, bloc
  `).all({ ...params, ...perim.params }));
});

r.get('/section-statut', authRequired, (req, res) => {
  const { where, params } = anneeFilter(req);
  const perim = perimetreSection(req);
  res.json(db.prepare(`
    SELECT section,
      SUM(CASE WHEN contrat='CC'  THEN total_attribue_professeur ELSE 0 END) AS cc,
      SUM(CASE WHEN contrat='EXP' THEN total_attribue_professeur ELSE 0 END) AS exp,
      SUM(total_attribue_professeur) AS total
    FROM v_attribution_complete WHERE ${where}${perim.clause}
    GROUP BY section ORDER BY section
  `).all({ ...params, ...perim.params }));
});

r.get('/section-detail', authRequired, (req, res) => {
  const { where, params } = anneeFilter(req);
  const perim = perimetreSection(req);
  res.json(db.prepare(`
    SELECT section, bloc,
      SUM(total_attribue_professeur) AS periodes_att,
      SUM(CASE WHEN contrat_mdp='IIP'  THEN total_attribue_professeur ELSE 0 END) AS iip,
      SUM(CASE WHEN contrat_mdp='IIP' AND type_cours='CT' THEN total_attribue_professeur ELSE 0 END) AS ct,
      SUM(CASE WHEN contrat_mdp='IIP' AND type_cours='PP' THEN total_attribue_professeur ELSE 0 END) AS pp,
      (SUM(CASE WHEN contrat_mdp='IIP' AND type_cours='CT' THEN total_attribue_professeur ELSE 0 END)/800.0
       + SUM(CASE WHEN contrat_mdp='IIP' AND type_cours='PP' THEN total_attribue_professeur ELSE 0 END)/1000.0) AS etp_iip,
      SUM(CASE WHEN contrat_mdp='HELB' THEN total_attribue_professeur ELSE 0 END) AS helb,
      (SUM(CASE WHEN contrat_mdp='HELB' AND type_cours='CT' THEN total_attribue_professeur ELSE 0 END)/800.0
       + SUM(CASE WHEN contrat_mdp='HELB' AND type_cours='PP' THEN total_attribue_professeur ELSE 0 END)/1000.0) AS etp_helb
    FROM v_attribution_complete WHERE ${where}${perim.clause}
    GROUP BY section, bloc ORDER BY section, bloc
  `).all({ ...params, ...perim.params }));
});

/* L'ETP SUR PLUSIEURS ANNÉES (3.5.427, Charles, 13 novembre 2026 : « un bilan comparatif des ETP par section sur plusieurs années à
   cocher — pour TIM, la répartition des charges sur les trois dernières années et celle-ci, avec la HELB »). Les attributions
   regroupées par année, section, bloc, contrat (IIP / HELB), CT/PP, nature et professeur ; l'écran fait les sommes. Même barème que
   le reste du Pilotage : CT/800 + PP/1000 (un type absent compte en CT). Périmètre de section posé. */
r.get('/etp-annees', authRequired, (req, res) => {
  const annees = String(req.query.annees || '').split(',').map(a => a.trim()).filter(a => /^\d{4}-\d{4}$/.test(a)).slice(0, 12);
  if (!annees.length) return res.status(400).json({ error: 'annees requises (ex. 2025-2026,2026-2027)' });
  const perim = perimetreSection(req);
  const params = { ...perim.params };
  annees.forEach((a, i) => { params['a' + i] = a; });
  let filtreSection = '';
  if (req.query.section) { filtreSection = ' AND section = @section'; params.section = String(req.query.section); }
  const lignes = db.prepare(`
    SELECT annee_scolaire AS annee, section, COALESCE(bloc, '—') AS bloc, COALESCE(contrat_mdp, 'IIP') AS contrat,
      CASE WHEN UPPER(COALESCE(type_cours, 'CT')) = 'PP' THEN 'PP' ELSE 'CT' END AS type,
      COALESCE(NULLIF(coordination_encadrement, ''), 'Cours') AS nature, professeur_id, professeur,
      SUM(total_attribue_professeur) AS periodes, COUNT(*) AS n
    FROM v_attribution_complete
    WHERE annee_scolaire IN (${annees.map((_, i) => '@a' + i).join(',')})${filtreSection}${perim.clause}
    GROUP BY 1,2,3,4,5,6,7,8
  `).all(params);
  res.json({ annees, lignes: lignes.map(l => ({ ...l, etp: (l.periodes || 0) / (l.type === 'PP' ? 1000 : 800) })) });
});

// L'IIP ET LA HELB, LES DONNÉES DE LA PAGE (3.5.432) : direction seulement, comme la pièce.
r.get('/iip-helb', authRequired, (req, res) => {
  if (!['admin', 'directeur', 'directeur_adjoint'].includes(req.user?.role)) return res.status(403).json({ error: 'Réservé à la direction.' });
  const annees = String(req.query.annees || '').split(',').map(a => a.trim()).filter(a => /^\d{4}-\d{4}$/.test(a)).slice(0, 10);
  if (req.query.recalculer) viderMemoCout();
  const unite = req.query.unite_helb === 'heures' ? 'heures' : 'periodes';
  try { res.json(donneesIipHelb(String(req.query.section || 'TIM'), annees, { unite, cor: sourcesEnVigueur().helb_cor?.totaux || null })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

/* LIRE ET COMPARER (3.5.447, Charles, 14 novembre 2026, maquette validée : « choisir la manière de consulter : par établissement,
   par section avec toutes les données combinées, ou juste les résultats, ou les finances — modulable » ; « des référentiels : HELB,
   IIP, ASBL… telle section coûte autant par étudiant en comparaison avec la moyenne ; positionner la section ; voir ce qu'on peut
   améliorer »). UNE route rend, pour chaque section ET pour l'établissement, les mêmes indicateurs, lus aux sources de Gestion :
   population (donneesPopulation), décisions (reussiteParSection, comme Décisions et taux), coûts et ETP (donneesCout, gardé en
   mémoire comme IIP et HELB : CT ÷ 800 + PP ÷ 1000), inscrits de référence (l'évolution de Population). L'année d'avant pour
   « années passées » ; la HELB pour ce qu'elle publie (étudiants par ETP). La coordination ne voit que ses sections ; l'IIP, un
   agrégat, reste la référence de tous. */
const anneePrec = a => `${Number(a.slice(0, 4)) - 1}-${Number(a.slice(5, 9)) - 1}`;
function indicateursLecture(annee) {
  const pop = donneesPopulation(annee, {});
  const evo = new Map((pop.evolution || []).map(e => [e.annee, e]));
  const reussiteAnnee = (() => {
    // Les résultats de l'année la plus récente qui en a de complets (la seconde session faite pour l'essentiel).
    for (const a of [annee, anneePrec(annee), anneePrec(anneePrec(annee))]) {
      try { const r = reussiteParSection(a); const t = r.total; if (t && t.s1.decides > 0 && (t.final.en_attente || 0) / Math.max(1, t.inscrits) < 0.2) return { annee: a, ...r }; } catch { /* */ }
    }
    return { annee: null, par: {}, total: null };
  })();
  let cout = null; try { cout = coutMemo(annee); } catch { cout = null; }
  const coutSec = new Map((cout?.sections || []).map(x => [x.section, x]));
  const etpDe = x => (x?.per_ct || 0) / 800 + (x?.per_pp || 0) / 1000;
  const e = evo.get(annee), ep = evo.get(anneePrec(annee));
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
  const ind = (code, s, inscritsRef, inscritsPrec, R, C) => {
    const sexe = (s?.F || 0) + (s?.M || 0) + (s?.X || 0);
    const n = inscritsRef || s?.n || 0;
    const etp = C ? etpDe(C) : null;
    const coutTot = C ? (C.cout_complet ?? C.cout) : null;
    const rec = C?.recettes ? (C.recettes.di || 0) + (C.recettes.dis || 0) + (C.recettes.frais || 0) : null;
    const nCout = C?.inscrits || n;
    return { section: code, inscrits: n, inscrits_prec: inscritsPrec || null, croissance: inscritsPrec ? pct(n - inscritsPrec, inscritsPrec) : null,
      reussite_finale: R?.final?.taux_reussite ?? null, reussite_s1: R?.s1?.taux_reussite ?? null, reussite_s2: R?.s2?.taux_reussite ?? null, decisions: R?.inscrits || 0,
      femmes: s ? pct(s.F || 0, sexe) : null, primo: s ? pct(s.primo || 0, s.n) : null, age: s?.age_moyen ?? null, hors_ue: s ? pct(s.hors_ue || 0, s.n) : null,
      bruxelles: s?.domicile ? pct(s.domicile.bruxelles || 0, s.n) : null,
      etp: etp != null ? Math.round(etp * 100) / 100 : null, etu_etp: etp ? Math.round((nCout / etp) * 10) / 10 : null,
      cout_etudiant: coutTot != null && nCout ? Math.round(coutTot / nCout) : null, cout_total: coutTot, recettes_etudiant: rec != null && nCout ? Math.round(rec / nCout) : null };
  };
  /* L'EFFICIENCE, MESURÉE SUR CE QUE CHACUN SUIT (3.5.448, Charles : « soins de plaies… ça n'a pas de sens » — 30 inscrits à un
     module de 38 périodes donnaient 500 inscrits par ETP). Deux mesures, tranchées : la TAILLE MOYENNE DES GROUPES = Σ (inscriptions ×
     périodes de cours de l'UE) ÷ périodes attribuées ; les ÉTUDIANTS ÉQUIVALENT TEMPS PLEIN (crédits ÷ 60) par ETP, la façon de
     compter de la HELB. L'UE se lit une fois par numéro (un numéro peut exister sous plusieurs sections). */
  const efficience = (() => {
    const ues = new Map();
    for (const u of db.prepare(`SELECT u.ue_num, u.section, u.ects, u.ue_per_etudiants AS per_etu, COALESCE(NULLIF(u.ue_per_cours, 0),
        (SELECT SUM(c.cours_per) FROM cours c WHERE c.ue_num = u.ue_num AND c.annee_scolaire = u.annee_scolaire)) AS per
      FROM ue u WHERE u.annee_scolaire = ?`).all(annee)) if (!ues.has(u.ue_num)) ues.set(u.ue_num, u);
    const par = {}, tot = { pe: 0, pee: 0, ects: 0, per_att: 0 };
    const de = k => (par[k] ||= { pe: 0, pee: 0, ects: 0, per_att: 0 });
    for (const x of db.prepare('SELECT ue_num, COUNT(*) n FROM etudiant_inscription WHERE annee_scolaire = ? GROUP BY ue_num').all(annee)) {
      const u = ues.get(x.ue_num); if (!u) continue;
      const c = de(u.section); c.pe += x.n * (u.per || 0); c.pee += x.n * (u.per_etu || u.per || 0); c.ects += x.n * (u.ects || 0);
      tot.pe += x.n * (u.per || 0); tot.pee += x.n * (u.per_etu || u.per || 0); tot.ects += x.n * (u.ects || 0);
    }
    for (const x of db.prepare('SELECT section, SUM(COALESCE(periodes_attribuees, 0)) per FROM attribution WHERE annee_scolaire = ? AND ue_num IS NOT NULL GROUP BY section').all(annee)) {
      de(x.section).per_att += x.per || 0; tot.per_att += x.per || 0;
    }
    return { par, tot };
  })();
  const ajouterEfficience = (o, E) => {
    if (!o) return o;
    o.taille_groupes = E && E.per_att ? Math.round((E.pe / E.per_att) * 10) / 10 : null;
    o.periodes_etudiants = E ? Math.round(E.pe) : null; o.periodes_grille = E ? Math.round(E.pee) : null; o.periodes_donnees = E ? Math.round(E.per_att) : null;
    o.etc = E && E.ects ? Math.round((E.ects / 60) * 10) / 10 : null;
    o.etc_etp = E && E.ects && o.etp ? Math.round((E.ects / 60 / o.etp) * 10) / 10 : null;
    o.cout_etc = E && E.ects && o.cout_total ? Math.round(o.cout_total / (E.ects / 60)) : null;
    // LE COÛT PAR CRÉDIT, ET PAR PÉRIODE DE LA GRILLE HORAIRE DE L'ÉTUDIANT (3.5.448, Charles : « une formation de 180 ECTS coûte
    // autant… » ; « ramener à la grille horaire étudiants ») : la seconde vaut aussi pour les formations sans crédits.
    o.cout_credit = E && E.ects && o.cout_total ? Math.round((o.cout_total / E.ects) * 10) / 10 : null;
    o.cout_180 = o.cout_credit ? Math.round(o.cout_credit * 180) : null;
    o.cout_periode = E && E.pee && o.cout_total ? Math.round((o.cout_total / E.pee) * 100) / 100 : null;
    return o;
  };
  const codes = [...new Set([...(pop.sections || []).map(s => s.section), ...Object.keys(e?.par_section || {})])].filter(Boolean);
  const sections = codes.map(c => ind(c, (pop.sections || []).find(s => s.section === c), e?.par_section?.[c], ep?.par_section?.[c], reussiteAnnee.par[c], coutSec.get(c)))
    .map(o => ajouterEfficience(o, efficience.par[o.section]))
    .sort((a, b) => (b.inscrits || 0) - (a.inscrits || 0));
  const totC = cout ? { per_ct: cout.sections.reduce((t, x) => t + (x.per_ct || 0), 0), per_pp: cout.sections.reduce((t, x) => t + (x.per_pp || 0), 0),
    cout_complet: cout.total?.cout_complet ?? cout.total?.cout, inscrits: cout.sections.reduce((t, x) => t + (x.inscrits || 0), 0),
    recettes: cout.recettes } : null;
  const iip = ajouterEfficience(ind('IIP', pop.ensemble, e?.total, ep?.total, reussiteAnnee.total, totC), efficience.tot);
  return { annee, resultats_annee: reussiteAnnee.annee, sections, iip };
}
const MEMO_LECTURE = new Map();
r.get('/lecture', authRequired, (req, res) => {
  try {
    const annee = req.query.annee || anneeDeTravail(req);
    const k = annee; const m = MEMO_LECTURE.get(k);
    let d;
    if (m && Date.now() - m.t < 600e3 && !req.query.recalculer) d = m.d;
    else {
      let prec = null; try { prec = indicateursLecture(anneePrec(annee)); } catch { prec = null; }
      d = { ...indicateursLecture(annee), prec };
      MEMO_LECTURE.set(k, { t: Date.now(), d });
    }
    const perim = getUserSections(req.user);
    const garde = l => (perim ? l.filter(x => perim.includes(x.section)) : l);
    const moy = COMPARAISON_HE.moyennes || {};
    // LES CODIPLOMATIONS (3.5.461) : la section choisie dans Lire et comparer porte alors ses données IIP / HELB, année par année.
    res.json({ ...d, codiplomation: sectionsCodiplomation(), sections: garde(d.sections), prec: d.prec ? { ...d.prec, sections: garde(d.prec.sections) } : null,
      helb: { source: COMPARAISON_HE.source, annee: COMPARAISON_HE.annee, etu_etp: moy['Moyenne HELB'] ?? null, etu_etp_sante: moy['Santé'] ?? null,
        // LE COÛT PAR CRÉDIT DE LA HELB, ENCADREMENT COMPRIS (3.5.449) : les rémunérations de son COR ÷ ses étudiants comptés ÷ 60 —
        // comparable à notre coût complet ; à côté, l'enseignement seul, et les proportions qui l'expliquent.
        ...(() => {
          // LES SOURCES DÉPOSÉES PRIMENT (3.5.450) ; à défaut, les totaux repris le 14 novembre 2026 (COR_HELB).
          const V = sourcesEnVigueur(), cor = V.helb_cor?.totaux, att = V.helb_attributions?.totaux, ins = V.helb_inscrits?.totaux;
          const COR = { ...COR_HELB, ...(cor ? { total: cor.total, enseignement: cor.enseignement, encadrement: cor.encadrement, etp_enseignants: cor.etp_enseignants, invites: cor.invites } : {}),
            ...(att ? { etp_cursus: att.etp_cursus, fonctions_sur_enseignement: att.fonctions_sur_enseignement } : {}),
            ...(ins ? { inscrits: ins.total, inscrits_le: ins.date_feuille || V.helb_inscrits.date_donnee } : {}) };
          // Les inscrits de la même année que le COR (2026-2027), à défaut les étudiants comptés publiés (2025-2026).
          const etu = COR.inscrits || COMPARAISON_HE.cursus.reduce((t, c) => t + (c.etu || 0), 0);
          const parCredit = v => (etu ? Math.round((v / etu / 60) * 10) / 10 : null);
          return { etudiants: Math.round(etu), cout_credit: parCredit(COR.total), cout_credit_enseignement: parCredit(COR.enseignement),
            cout_etudiant: etu ? Math.round(COR.total / etu) : null, encadrement_pct: Math.round((COR.encadrement / COR.enseignement) * 100),
            cout_etp: Math.round((COR.enseignement - (COR.invites ?? 1800490)) / COR.etp_enseignants), fonctions_pct: Math.round(COR.fonctions_sur_enseignement * 100),
            source_cor: COR.source, inscrits_le: COR.inscrits_le,
            etu_etp_2627: COR.inscrits && COR.etp_cursus ? Math.round((COR.inscrits / COR.etp_cursus) * 10) / 10 : null };
        })(),
        cmbp: PARAM_HELB.cmbp,
        cursus: COMPARAISON_HE.cursus.map(c => ({ dept: c.dept, cursus: c.cursus, etu_etp: c.ratio ? Math.round(c.ratio * 10) / 10 : null })) },
      asbl: (() => {
        /* L'ASBL (3.5.450, Charles : « tu as les données de l'ASBL puisque tu as les rapports financiers ») : le pouvoir organisateur
           entier — HELB et IIP. Son coût par étudiant = ses charges d'exploitation ÷ (inscrits de la HELB + inscrits de l'IIP) ; le
           fonctionnement (services et biens divers, amortissements, autres charges) à part. Les professeurs de l'IIP, payés par la
           Fédération, n'y sont pas : c'est le coût que porte l'ASBL. */
        const V = sourcesEnVigueur(), S = syntheseAsbl(), A = V.asbl_comptes;
        const insH = V.helb_inscrits?.totaux?.total || COR_HELB.inscrits || 0, insI = d.iip?.inscrits || 0, n = insH + insI;
        if (!n || (!S && !A)) return null;
        // La synthèse des budgets et comptes d'abord (dernier exercice réalisé complet) ; à défaut les comptes annuels déposés.
        const ex = S ? dernierRealise(S.totaux) : null;
        const tot = ex ? S.totaux.postes.find(p => p.bloc === 'ASBL')?.ex[`${ex}|realise`] : null;
        const charges = tot?.charges || A?.totaux?.charges; if (!charges) return null;
        const de = (bloc, re) => { const p = S?.totaux?.postes?.find(x => x.bloc === bloc && re.test(x.poste)); return p && ex ? p.ex[`${ex}|realise`] : null; };
        const helbTot = de('HELB', /^HELB$/), iipTot = de('Institut Ilya Prigogine', /^Institut/), infra = de('ASBL Administration', /^ASBL Administration$/);
        /* L'ASBL = LE CUMUL DES DEUX ÉTABLISSEMENTS (3.5.454, Charles : « pas de comparaison à la HELB mais à l'ASBL, donc les données
           cumulées des deux, pour ne froisser personne ; comparer chaque section à l'IIP et à l'ASBL »). Coût = charges de l'ASBL
           (HELB, services communs, fonctionnement de l'IIP) + le coût complet de l'IIP calculé par Lucie (ses enseignants, payés par
           la Fédération, ne sont pas dans les comptes de l'ASBL). Étudiants et crédits = HELB (60 crédits par inscrit) + IIP (crédits
           réellement suivis). ETP = cursus de la HELB + enseignants de l'IIP. */
        const I = d.iip || {}, att = V.helb_attributions?.totaux;
        const coutCumul = charges + (I.cout_total || 0);
        const credits = insH * 60 + (I.etc || 0) * 60, etc = insH + (I.etc || 0);
        const etpH = att?.etp_cursus || COR_HELB.etp_cursus || 0, etp = etpH + (I.etp || 0);
        /* LA TAILLE DES GROUPES DE L'ASBL (3.5.457, Charles : « tu as les données pour le faire ») : périodes suivies ÷ périodes
           données, les deux établissements réunis. L'IIP : ses chiffres. La HELB : ses heures données (attributions, converties en
           périodes de 50 minutes) ; ses périodes suivies ne sont pas dans ses fichiers — on suppose qu'un de ses étudiants suit autant
           de périodes qu'un étudiant temps plein de l'IIP. L'hypothèse est dite à l'écran. */
        const heuresH = att?.heures_enseignement || COR_HELB.heures_enseignement || 0;
        const parEtc = I.etc ? (I.periodes_etudiants || 0) / I.etc : 0;
        const donnees = (I.periodes_donnees || 0) + heuresH * 1.2;
        const tailleGroupes = donnees && parEtc ? Math.round((((I.periodes_etudiants || 0) + insH * parEtc) / donnees) * 10) / 10 : null;
        /* CE QUE L'ASBL PEUT ENCORE DIRE (3.5.460, Charles : « je ne comprends pas pourquoi tu ne parviens pas à comparer avec
           l'ASBL ; tu as tous les nombres dans la comparaison ETP et les bilans comptables »).
           — Croissance : la HELB d'après ses étudiants comptés, d'une année à l'autre (comparaison ETP, mêmes cursus les deux années,
             hors TIM inscrit à l'IIP), appliquée à ses inscrits ; l'IIP, ses inscrits de l'année d'avant.
           — Primo-inscrits : les débutants de la HELB (cohorte START) + les primo-inscrits de l'IIP.
           — Coût par étudiant temps plein, par période de la grille étudiant (même hypothèse que la taille des groupes).
           — Recettes par étudiant : le chiffre d'affaires des comptes annuels (droits, frais, prestations) ÷ étudiants.
           Restent sans référence : la réussite, le sexe, l'âge, la nationalité, le domicile — absents des fichiers de la HELB. */
        const helbCursus = COMPARAISON_HE.cursus.filter(c => c.dept !== 'IIP' && !c.tim);
        const ans = [...new Set(helbCursus.flatMap(c => Object.keys(c.series || {})))].sort();
        const [aP, aD] = ans.slice(-2);
        const deux = helbCursus.filter(c => c.series?.[aP] && c.series?.[aD]);
        const sP = deux.reduce((t, c) => t + c.series[aP][0], 0), sD = deux.reduce((t, c) => t + c.series[aD][0], 0);
        const gH = sP ? sD / sP - 1 : null;
        const precI = d.iip?.inscrits_prec || null;
        const croissance = gH != null && precI ? Math.round(((n / (insH / (1 + gH) + precI)) - 1) * 1000) / 10 : null;
        const debH = V.helb_inscrits?.totaux?.debutants ?? COR_HELB.debutants ?? null;
        const primo = debH != null && I.primo != null ? Math.round(((debH + (I.primo / 100) * insI) / n) * 1000) / 10 : null;
        const grilleEtc = I.etc ? (I.periodes_grille || 0) / I.etc : 0;
        const grille = (I.periodes_grille || 0) + insH * grilleEtc;
        const ca = A?.totaux?.chiffre_affaires ?? null;
        return { croissance, croissance_helb: gH != null ? Math.round(gH * 1000) / 10 : null, croissance_annees: aP && aD ? `${aP} → ${aD}` : null,
          primo, debutants_helb: debH, cout_etc: etc ? Math.round(coutCumul / etc) : null,
          cout_periode: grille ? Math.round((coutCumul / grille) * 100) / 100 : null,
          recettes_etudiant: ca ? Math.round(ca / n) : null, chiffre_affaires: ca, exercice_comptes: A?.totaux?.exercice ?? null,
          exercice: ex || A?.totaux?.exercice, charges, cout_iip: Math.round(I.cout_total || 0), cout_total: Math.round(coutCumul),
          etudiants: n, etudiants_helb: insH, etudiants_iip: insI,
          cout_etudiant: Math.round(coutCumul / n), cout_credit: credits ? Math.round((coutCumul / credits) * 10) / 10 : null,
          cout_180: credits ? Math.round((coutCumul / credits) * 180) : null,
          etc_etp: etp ? Math.round((etc / etp) * 10) / 10 : null, etp: Math.round(etp * 10) / 10,
          taille_groupes: tailleGroupes, periodes_par_etudiant: Math.round(parEtc), heures_helb: Math.round(heuresH),
          fonctionnement_etudiant: A?.totaux?.fonctionnement ? Math.round(A.totaux.fonctionnement / n) : null,
          helb: helbTot, iip: iipTot, administration: infra, fichier: (S || A).fichier };
      })(),
      /* LA COMPTABILITÉ RÉELLE DES SECTIONS (3.5.450) : ce que la synthèse de l'ASBL porte pour une section, côté HELB et côté IIP,
         exercice par exercice (réalisé, à défaut budget). */
      compta: (() => {
        const S = syntheseAsbl(); if (!S) return null;
        const RE = { TIM: /imagerie/i, Optométrie: /^Optom/i, Psychomotricité: /^Psychomot/i, Orthoptie: /^Orthoptie/i };
        const annees = [...new Set(S.totaux.exercices.map(e => e.annee))].sort();
        const serie = p => annees.map(a => { const r = p.ex[`${a}|realise`], b = p.ex[`${a}|ajuste`] || p.ex[`${a}|budget`] || p.ex[`${a}|initial`];
          const v = r && realiseComplet(S.totaux, a) && (r.charges || r.produits) ? r : (b && (b.charges || b.produits) ? b : null);
          return v ? { annee: a, nature: v === r ? 'réalisé' : 'budget', ...v } : null; }).filter(Boolean);
        const par = {};
        for (const [code, re] of Object.entries(RE)) {
          if (perim && !perim.includes(code)) continue;
          const h = S.totaux.postes.find(p => p.bloc === 'HELB' && p.niveau === 2 && re.test(p.poste)), i = S.totaux.postes.find(p => p.bloc === 'Institut Ilya Prigogine' && re.test(p.poste));
          /* LE RÉSULTAT RÉEL D'UNE CODIPLOMATION (3.5.467) : les comptes imputent à la section à peine une partie de ses enseignants
             HELB (TIM 2025 : 30 164 € de personnel pour 2 ETP environ). Lucie ajoute le coût des enseignants HELB que les comptes
             imputent ailleurs : coût (ETP de Lucie, coordinations comprises, au prix du titre) − personnel déjà imputé (salaires et
             professeurs invités du code analytique de la section). Sans code analytique connu, le personnel imputé reste inconnu. */
          const codip = sectionsCodiplomation().includes(code.toLowerCase());
          const reelle = s => s.map(v => {
            if (!codip) return v;
            let ens = null; try { ens = enseignantsHelbCivil(code, v.annee); } catch { ens = null; }
            if (!ens) return v;
            // Repli : le personnel de TIM relevé le 15 novembre 2026 dans les classeurs (code 111066), tant que le classeur déposé
            // n'a pas été relu par la version qui garde ce détail.
            const RELEVE = { TIM: { 2023: { code: '111066', salaires: 0, invites: 0 }, 2024: { code: '111066', salaires: 14173, invites: 3220 },
              2025: { code: '111066', salaires: 16873, invites: 13291 }, 2026: { code: '111066', salaires: 12039, invites: 14077 } } };
            const imp = h?.personnel?.[v.annee] || (v.nature === 'réalisé' ? RELEVE[code]?.[v.annee] : null);
            const deja = imp ? (imp.salaires || 0) + (imp.invites || 0) : null;
            const ajout = Math.max(0, ens.cout - (deja || 0));
            return { ...v, enseignants_helb: ens.cout, etp_helb: ens.etp, deja_impute: deja, code_analytique: imp?.code || null,
              non_impute: ajout, charges_reelles: v.charges + ajout, resultat_reel: v.resultat - ajout };
          });
          let helb = h ? reelle(serie(h)) : null, iip = i ? serie(i) : null;
          /* UN BUDGET NE DIT PAS LE RÉEL ; LUCIE ESTIME (3.5.468, Charles : « une estimation sur 2026 et 26-27 en fonction des inscrits ;
             tu sais combien ils paient ; les attributions tu les as »). Pour une codiplomation, un exercice seulement budgété est remplacé
             par l'estimation de Lucie, pour toute l'ASBL (côté HELB et côté IIP réunis) : une année civile = 8/12 de l'année scolaire qui
             finit + 4/12 de celle qui commence (`estimationAnnee`). S'y ajoutent les autres charges que les comptes imputent à la section
             (quote-part des frais généraux…), au niveau du dernier exercice réalisé, personnel déjà imputé retiré. L'année scolaire en
             cours suit, en ligne propre. */
          if (codip && helb) {
            /* CE QUE DISENT LES COMPTES DE TIM CÔTÉ HELB (relu le 15 novembre 2026, classeur « 2023 à 2027 », compte analytique 111066) :
               deux produits. (1) Une quote-part des frais généraux (compte 737000), du MÊME montant que la charge de frais généraux
               imputée à la section (626000) : 152 707 € en 2025, neutre. (2) Des subsides (737100) : 248 372 € en 2025 — la part de
               l'allocation de la HELB déjà attribuée à TIM. L'estimation laisse donc de côté la paire frais généraux / quote-part
               (neutre), et, pour une année scolaire où le calcul ne prévoit pas encore d'allocation, reprend le niveau réel des subsides
               du dernier exercice réalisé (produits − charges hors personnel). */
            const real = helb.filter(v => v.nature === 'réalisé' && v.deja_impute != null);
            const dernier = real[real.length - 1];
            const fraisGeneraux = dernier ? Math.max(0, dernier.charges - dernier.deja_impute) : 0;
            const subsidesReels = dernier ? Math.max(0, dernier.produits - fraisGeneraux) : 0;
            /* DEUX LECTURES DU FINANCEMENT DE LA HELB (3.5.469, Charles : « montre-moi les deux ») : (1) les UCE — 50 % des inscrits ×
               MUCE × 1,5, lissé sur 3 ans (le calcul de la page IIP et HELB) ; (2) les subsides réels — ceux que les comptes attribuent à
               la section au dernier exercice réalisé (TIM 2025 : 248 372 €), ajustés au nombre d'inscrits. */
            const inscritsDe = a => { try { return estimationAnnee(code, a)?.inscrits || 0; } catch { return 0; } };
            const Yd = dernier ? Number(dernier.annee) : null;
            const inscritsDernier = Yd ? inscritsDe(`${Yd - 1}-${Yd}`) * 8 / 12 + inscritsDe(`${Yd}-${Yd + 1}`) * 4 / 12 : 0;
            const parInscrit = inscritsDernier ? subsidesReels / inscritsDernier : 0;
            const est = a => { let e = null; try { e = estimationAnnee(code, a); } catch { e = null; }
              if (!e) return null;
              const reelle = Math.round(parInscrit * (e.inscrits || 0));
              const uce = e.allocation || reelle;   // avant 2026-2027, pas d'UCE dans le calcul : le niveau réel
              return { ...e, allocation: uce, produits: e.droits + uce, allocation_subsides: reelle, produits_subsides: e.droits + reelle, allocation_reelle: !e.allocation }; };
            const ligne = (base, e) => ({ ...base, nature: 'estimation', estimation: true, charges: e.cout, produits: e.produits, resultat: e.produits - e.cout,
              allocation_subsides: e.allocation_subsides, produits_subsides: e.produits_subsides, resultat_subsides: e.produits_subsides - e.cout, par_inscrit: Math.round(parInscrit),
              resultat_reel: e.produits - e.cout, charges_reelles: e.cout, non_impute: null, allocation: e.allocation, droits: e.droits, salaires: e.salaires,
              materiel: e.materiel, etp_helb: e.etp_helb, allocation_reelle: !!e.allocation_reelle, subsides_de: dernier?.annee || null });
            const civil = Y => {
              const e1 = est(`${Y - 1}-${Y}`), e2 = est(`${Y}-${Y + 1}`); if (!e1 && !e2) return null;
              const m = k => Math.round((e1?.[k] || 0) * 8 / 12 + (e2?.[k] || 0) * 4 / 12);
              return ligne({ annee: String(Y) }, { cout: m('cout'), produits: m('produits'), allocation: m('allocation'), droits: m('droits'), salaires: m('salaires'),
                materiel: m('materiel'), allocation_subsides: m('allocation_subsides'), produits_subsides: m('produits_subsides'), etp_helb: Math.round(((e1?.etp_helb || 0) * 8 / 12 + (e2?.etp_helb || 0) * 4 / 12) * 100) / 100, allocation_reelle: !!(e1?.allocation_reelle || e2?.allocation_reelle) });
            };
            helb = helb.map(v => (v.nature === 'réalisé' ? v : civil(Number(v.annee)) || v));
            const eS = est(annee);
            if (eS) helb.push(ligne({ annee, scolaire: true, inscrits: eS.inscrits }, eS));
            // Une année estimée porte déjà les droits des étudiants (côté IIP) : sa ligne IIP budgétée ne s'additionne plus.
            const estimees = new Set(helb.filter(v => v.estimation).map(v => v.annee));
            if (iip) iip = iip.filter(v => !estimees.has(v.annee));
          }
          if (h || i) par[code] = { helb, iip };
        }
        return { fichier: S.fichier, date: S.date_donnee, sections: par };
      })(),
      sources: Object.fromEntries(Object.entries(sourcesEnVigueur()).map(([k, v]) => [k, { fichier: v.fichier, date: v.date_donnee, depose_le: v.depose_le, depose_par: v.depose_par }])) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* LES SOURCES DES RÉFÉRENTIELS (3.5.450) : la direction dépose, Lucie lit et ne garde que les totaux (lib/sourcesReference.js). */
const estDirection = req => ['admin', 'directeur', 'directeur_adjoint'].includes(req.user?.role);
const contenuDe = body => { const b = String(body?.contenu || '').replace(/^data:[^,]*,/, ''); return Buffer.from(b, 'base64'); };
r.get('/sources', authRequired, (req, res) => {
  if (!estDirection(req)) return res.status(403).json({ error: 'Réservé à la direction.' });
  res.json({ natures: NATURES, sources: listerSources(), synthese: syntheseAsbl(), integrees: [
    { libelle: 'Étudiants et ETP publiés par cursus de la HELB', source: COMPARAISON_HE.source, annee: COMPARAISON_HE.annee },
    { libelle: 'Totaux repris du COR, des attributions et des inscrits de la HELB (à défaut de source déposée)', source: COR_HELB.source, annee: '2026-2027' },
    { libelle: 'Coût moyen d’un ETP de la HELB (paramètre de la page IIP et HELB)', source: 'réglé par la direction', annee: null },
  ] });
});
r.post('/sources/lire', authRequired, async (req, res) => {
  if (!estDirection(req)) return res.status(403).json({ error: 'Réservé à la direction.' });
  try { res.json(await lireSource(String(req.body?.nom || ''), contenuDe(req.body))); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
r.post('/sources', authRequired, async (req, res) => {
  if (!estDirection(req)) return res.status(403).json({ error: 'Réservé à la direction.' });
  try {
    const lu = await lireSource(String(req.body?.nom || ''), contenuDe(req.body));
    const id = enregistrerSource(lu, { par: req.user?.nom || req.user?.email, fourni_par: req.body?.fourni_par || null, remarque: req.body?.remarque || null });
    MEMO_LECTURE.clear();
    res.json({ ok: true, id, nature: lu.nature });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
r.delete('/sources/:id', authRequired, (req, res) => {
  if (!estDirection(req)) return res.status(403).json({ error: 'Réservé à la direction.' });
  const motif = String(req.body?.motif || req.query.motif || '').trim();
  if (!motif) return res.status(400).json({ error: 'Le motif est obligatoire.' });
  const n = retirerSource(Number(req.params.id), motif); MEMO_LECTURE.clear();
  res.json({ ok: n > 0 });
});

/* LA PRÉSENTATION D'UNE SECTION (3.5.446, Charles, 14 novembre 2026 : « jeudi je présente la section imagerie médicale au CA,
   sous tous les axes… une présentation grandiose » ; « dans Lucie, avec un export en PowerPoint »). Les chiffres viennent des routes
   existantes (population, délibérations, IIP et HELB) ; ici, seulement les TEXTES de la direction — forces, faiblesses, opportunités,
   menaces, ce qu'on demande au CA, titres retouchés —, gardés par section dans lucie_config « presentation:<section> ». Direction. */
const DIRECTION = ['admin', 'directeur', 'directeur_adjoint'];
const clePresentation = s => `presentation:${String(s || '').slice(0, 40)}`;
r.get('/presentation/:section', authRequired, (req, res) => {
  if (!DIRECTION.includes(req.user?.role)) return res.status(403).json({ error: 'Réservé à la direction.' });
  let v = null;
  try { v = JSON.parse(db.prepare('SELECT valeur FROM lucie_config WHERE cle = ?').get(clePresentation(req.params.section))?.valeur || 'null'); } catch { v = null; }
  res.json({ textes: v?.textes || {}, maj_le: v?.maj_le || null, maj_par: v?.maj_par || null });
});
r.put('/presentation/:section', authRequired, (req, res) => {
  if (!DIRECTION.includes(req.user?.role)) return res.status(403).json({ error: 'Réservé à la direction.' });
  const t = req.body?.textes;
  if (!t || typeof t !== 'object' || Array.isArray(t)) return res.status(400).json({ error: 'Textes attendus.' });
  const textes = {};
  for (const [k, v] of Object.entries(t).slice(0, 200)) {
    if (!/^[a-z0-9_.-]{1,60}$/i.test(k)) continue;
    if (v === null || v === undefined) continue;
    textes[k] = String(v).slice(0, 4000);
  }
  const val = JSON.stringify({ textes, maj_le: new Date().toISOString(), maj_par: req.user?.nom || req.user?.email || null });
  db.prepare('INSERT INTO lucie_config (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur').run(clePresentation(req.params.section), val);
  res.json({ ok: true });
});

r.get('/totaux', authRequired, (req, res) => {
  const { where, params } = anneeFilter(req);
  const k = db.prepare(`
    SELECT
      COUNT(*)                               AS nb_attributions,
      COUNT(DISTINCT professeur_id)          AS nb_professeurs,
      COUNT(DISTINCT ue_num)                 AS nb_ue,
      COUNT(DISTINCT section)                AS nb_sections,
      ROUND(SUM(total_attribue_professeur),2) AS total_periodes,
      ROUND(SUM(CASE WHEN contrat_mdp='IIP'  THEN total_attribue_professeur ELSE 0 END),2) AS total_iip,
      ROUND(SUM(CASE WHEN contrat_mdp='HELB' THEN total_attribue_professeur ELSE 0 END),2) AS total_helb,
      ROUND(SUM(cout_dotation),2)            AS cout_dotation_total,
      ROUND(SUM(cout_dotation_q1),2)         AS cout_sd,
      ROUND(SUM(cout_dotation_q2),2)         AS cout_jj
    FROM v_attribution_complete WHERE ${where}
  `).get(params);
  // Dotation : préférer dotation_civile si disponible, fallback parametre_financier
  const annee = params.annee;
  const ySuffix = annee ? annee.split('-')[1]?.slice(-2) : '25';
  const dc = db.prepare(`SELECT dotation_organique FROM dotation_civile WHERE annee_civile = ?`).get(2000 + parseInt(ySuffix));
  const dispo = dc?.dotation_organique ?? db.prepare(`SELECT valeur_num FROM parametre_financier WHERE cle = 'PERIODES_DISPO_${ySuffix}'`).get()?.valeur_num ?? null;
  k.periodes_disponibles = dispo;
  k.solde = dispo ? (dispo - (k.total_iip ?? 0)) : null;
  res.json(k);
});

// ── Nouvelles routes : pilotage par ANNÉE CIVILE ──────────────────────────────

// GET /civil — résumé de toutes les années civiles (organique + enveloppes)
// GESTION → POPULATION (3.1.334) : qui sont nos étudiants — voir lib/populationEcole.js.
// Le périmètre de section s'applique : une coordination ne lit que ses sections.
// Corriger un chiffre de référence des années passées : la direction (3.1.340).
r.put('/inscrits-reference', authRequired, roleRequired('admin', 'directeur', 'directeur_adjoint'), (req, res) => {
  try { corrigerReference(req.body || {}, req.user?.email || req.user?.nom || null); res.json({ ok: true }); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// LES EFFECTIFS DE L'ANNÉE (3.5.196) : au 15/10, réguliers au 1/10 et au 5/10, en parcours — la source de Gestion ET de la liste.
r.get('/effectifs', authRequired, (req, res) => {
  try {
    const annee = req.query.annee || anneeDeTravail(req);
    try { gelerSiTemps(annee); } catch { /* */ }
    res.json(effectifsAnnee(annee, { avecReguliers: req.query.reguliers !== '0' }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/population-ecole', authRequired, (req, res) => {
  try {
    const annee = req.query.annee || anneeDeTravail(req);
    res.json({ ...donneesPopulation(annee, { sections: getUserSections(req.user), sle: req.query.sle === 'exclus' ? 'exclus' : 'compris', nouveaux: req.query.nouveaux === '1', section: req.query.section || null }),
      peut_corriger: ['admin', 'directeur', 'directeur_adjoint'].includes(req.user?.role) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* GESTION → POPULATION → LE PERSONNEL (3.1.376, Charles, 15 octobre 2026 : « je n'ai plus les statistiques
   liées aux enseignants : sexe, âge… »). Les chiffres de la pièce « Statistiques du personnel »
   (donneesPersonnel), servis à l'écran. Des agrégats, mais sur le personnel de toute l'école : la
   coordination n'y entre pas. */
r.get('/population-personnel', authRequired, (req, res) => {
  if (req.user?.role === 'coordination') return res.status(403).json({ error: 'Réservé à la direction et au secrétariat.' });
  try { res.json(donneesPersonnel(req.query.annee || anneeDeTravail(req))); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

/** Le résumé de toutes les années civiles (organique + enveloppes) : l'écran de Pilotage et la pièce « tableau FELSI » le lisent. */
export function syntheseCivile() {
  const years = db.prepare('SELECT * FROM dotation_civile ORDER BY annee_civile').all();
  if (!years.length) return [];

  const toCompute = years.filter(y => y.usage_historique_organique == null).map(y => y.annee_civile);
  const usageDB = toCompute.length ? computeUsageDB(toCompute) : {};
  const enveloppes = db.prepare('SELECT * FROM enveloppe_externe ORDER BY code, annee_civile').all();

  // Pré-calculer l'usage pondéré des enveloppes par année civile
  const usageEnvByAnnee = {};
  for (const y of toCompute) {
    usageEnvByAnnee[y] = usageEnveloppe(y);
  }

  const result = years.map(yr => {
    const y = yr.annee_civile;

    const envYear = enveloppes.filter(e => e.annee_civile === y).map(e => {
      const usage = e.usage_historique != null
        ? e.usage_historique
        : (usageEnvByAnnee[y]?.[e.code] ?? 0);
      // Enveloppe illimitée : ne déborde jamais sur l'organique
      const dot = e.illimite ? 0 : Math.max(0, Math.round((usage - e.periodes_b) * 100) / 100);
      return {
        ...e,
        usage,
        dot,  // dépassement à imputer sur l'organique (0 si illimitée)
        illimite: !!e.illimite,
        solde: e.illimite ? null : Math.round((e.periodes_b - usage) * 100) / 100,
        pct: e.illimite ? null : (e.periodes_b ? Math.round((usage / e.periodes_b) * 1000) / 10 : null),
      };
    });

    // Organique = usage direct sur UEs organiques + dépassements DOT des enveloppes
    const orgUsageDirect = yr.usage_historique_organique != null
      ? yr.usage_historique_organique
      : usagePot(usageDB, y, 'organique');
    const dotTotal = envYear.reduce((s, e) => s + (e.dot || 0), 0);
    const orgUsage = Math.round((orgUsageDirect + dotTotal) * 100) / 100;

    return {
      annee_civile: y,
      dotation_organique: yr.dotation_organique,
      usage_organique: orgUsage,
      usage_organique_direct: orgUsageDirect,
      dot_total: Math.round(dotTotal * 100) / 100,
      solde_organique: Math.round((yr.dotation_organique - orgUsage) * 100) / 100,
      pct_organique: yr.dotation_organique ? Math.round((orgUsage / yr.dotation_organique) * 1000) / 10 : null,
      source: yr.usage_historique_organique != null ? 'historique' : 'calcule',
      // ── CE QUE LA DIRECTION CONSTATE, à côté de ce que Lucie calcule ────
      //
      // Le solde constaté ne corrige pas le calcul : il le CONFRONTE. L'écart
      // entre les deux n'est pas une erreur à masquer, c'est la mesure de ce
      // qui n'est pas encore encodé dans la base — et il se referme à mesure
      // qu'on encode. Le fondre dans le solde calculé ferait disparaître
      // précisément l'information qu'on cherche.
      // Les deux moitiés de l'année civile, et ce qu'elles laissent.
      ...(() => {
        const det = usagePotDetail(usageDB, y, 'organique');
        const base = yr.dotation_utilisable ?? yr.dotation_organique;
        return {
          usage_jan_juin: det.jan_juin,
          usage_sep_dec: det.sep_dec,
          // Le second quadrimestre de l'année scolaire EN COURS : il tombe en
          // janvier-juin de l'année civile suivante.
          usage_jan_juin_suivant: det.jan_juin_suivant,
          scolaire_jan_juin: det.scolaire_jan_juin,
          scolaire_sep_dec: det.scolaire_sep_dec,
          // Ce qui reste UNE FOIS LA PREMIÈRE MOITIÉ DÉCOMPTÉE : le budget de
          // la rentrée, avant qu'elle ne soit encodée. Les dépassements
          // d'enveloppes sont imputés là où ils tombent, donc au total.
          solde_apres_jan_juin: Math.round((base - det.jan_juin - dotTotal) * 100) / 100,
        };
      })(),
      solde_constate: yr.solde_constate ?? null,
      solde_constate_note: yr.solde_constate_note || null,
      // La consommation qu'implique le solde déclaré, pour la comparer à
      // celle que la base établit.
      usage_implique: yr.solde_constate == null ? null
        : Math.round(((yr.dotation_utilisable ?? yr.dotation_organique) - yr.solde_constate) * 100) / 100,
      ecart_encodage: yr.solde_constate == null ? null
        : Math.round((((yr.dotation_utilisable ?? yr.dotation_organique) - yr.solde_constate)
                      - orgUsage) * 100) / 100,
      notes: yr.notes,
      enveloppes: envYear,
    };
  });

  return result;
}

r.get('/civil', authRequired, (req, res) => {
  res.json(syntheseCivile());
});

// GET /civil/:annee — détail par section pour une année civile
r.get('/civil/:annee', authRequired, (req, res) => {
  const y = parseInt(req.params.annee);
  if (!y || y < 2000) return res.status(400).json({ error: 'Année civile invalide' });
  const { q2, q1 } = anneesCivile(y);

  // Vérifier si année dans la DB
  const dc = db.prepare('SELECT * FROM dotation_civile WHERE annee_civile = ?').get(y);
  if (!dc) return res.status(404).json({ error: 'Année civile non configurée' });

  // Si données historiques : retourner ce qu'on a
  if (dc.usage_historique_organique != null) {
    return res.json({
      annee_civile: y, source: 'historique',
      dotation_organique: dc.dotation_organique,
      usage_organique: dc.usage_historique_organique,
      sections: [],
    });
  }

  const inClause = `'${q2}', '${q1}'`;
  const sections = db.prepare(`
    SELECT
      a.section,
      ${POT} AS pot,
      ROUND(SUM(CASE WHEN a.annee_scolaire='${q2}' THEN ${CQ2} ELSE 0 END) +
            SUM(CASE WHEN a.annee_scolaire='${q1}' THEN ${CQ1} ELSE 0 END), 2) AS usage
    FROM attribution a
    LEFT JOIN ue u ON u.ue_num = a.ue_num AND u.annee_scolaire = a.annee_scolaire
    WHERE a.annee_scolaire IN (${inClause}) AND a.contrat_mdp = 'IIP'
    GROUP BY a.section, pot
    ORDER BY a.section, pot
  `).all();

  res.json({ annee_civile: y, source: 'calcule', dotation_organique: dc.dotation_organique, sections });
});

// PUT /dotation-civile/:annee — créer ou mettre à jour une année civile
r.put('/dotation-civile/:annee', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const y = parseInt(req.params.annee);
  if (!y || y < 2000 || y > 2100) return res.status(400).json({ error: 'Année civile invalide' });
  const { dotation_organique, usage_historique_organique, notes, periodes_eleves,
          pep_reference, pep_annee_utilisee, pep_calculee, dotation_utilisable,
          solde_constate, solde_constate_note } = req.body;
  if (dotation_organique == null) return res.status(400).json({ error: 'dotation_organique requis' });
  db.prepare(`
    INSERT INTO dotation_civile (annee_civile, dotation_organique, usage_historique_organique, notes,
      periodes_eleves, pep_reference, pep_annee_utilisee, pep_calculee, dotation_utilisable,
      solde_constate, solde_constate_note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(annee_civile) DO UPDATE SET
      dotation_organique            = excluded.dotation_organique,
      usage_historique_organique    = excluded.usage_historique_organique,
      notes                         = excluded.notes,
      periodes_eleves               = excluded.periodes_eleves,
      pep_reference                 = excluded.pep_reference,
      pep_annee_utilisee            = excluded.pep_annee_utilisee,
      pep_calculee                  = excluded.pep_calculee,
      dotation_utilisable           = excluded.dotation_utilisable,
      solde_constate                = excluded.solde_constate,
      solde_constate_note           = excluded.solde_constate_note
  `).run(y, dotation_organique, usage_historique_organique ?? null, notes ?? null,
         periodes_eleves ?? null, pep_reference ?? null, pep_annee_utilisee ?? null,
         pep_calculee ?? null, dotation_utilisable ?? null,
         solde_constate === '' || solde_constate == null ? null : Number(solde_constate),
         solde_constate_note ?? null);
  res.json({ ok: true });
});

// DELETE /dotation-civile/:annee — supprimer une année civile (et ses enveloppes)
r.delete('/dotation-civile/:annee', authRequired, roleRequired('admin'), (req, res) => {
  const y = parseInt(req.params.annee);
  db.prepare('DELETE FROM enveloppe_externe WHERE annee_civile = ?').run(y);
  db.prepare('DELETE FROM dotation_civile WHERE annee_civile = ?').run(y);
  res.json({ ok: true });
});

// GET /enveloppes — liste des enveloppes
r.get('/enveloppes', authRequired, (req, res) => {
  res.json(db.prepare('SELECT * FROM enveloppe_externe ORDER BY annee_civile, code').all());
});

// POST /enveloppes — créer une enveloppe
r.post('/enveloppes', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { code, label, annee_civile, periodes_b, usage_historique, notes } = req.body;
  if (!code || !annee_civile || periodes_b == null) return res.status(400).json({ error: 'code, annee_civile et periodes_b requis' });
  try {
    const info = db.prepare(`
      INSERT INTO enveloppe_externe (code, label, annee_civile, periodes_b, usage_historique, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(code.toUpperCase(), label || code, parseInt(annee_civile), periodes_b, usage_historique ?? null, notes ?? null);
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Enveloppe déjà existante pour ce code et cette année' });
    throw e;
  }
});

// PUT /enveloppes/:id — modifier une enveloppe
r.put('/enveloppes/:id', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { label, periodes_b, usage_historique, notes } = req.body;
  const result = db.prepare(`
    UPDATE enveloppe_externe SET
      label = COALESCE(@label, label),
      periodes_b = COALESCE(@periodes_b, periodes_b),
      usage_historique = @usage_historique,
      notes = @notes
    WHERE id = @id
  `).run({ id: req.params.id, label: label ?? null, periodes_b: periodes_b ?? null, usage_historique: usage_historique ?? null, notes: notes ?? null });
  if (!result.changes) return res.status(404).json({ error: 'Enveloppe introuvable' });
  res.json({ ok: true });
});

// DELETE /enveloppes/:id
r.delete('/enveloppes/:id', authRequired, roleRequired('admin'), (req, res) => {
  db.prepare('DELETE FROM enveloppe_externe WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// GET /ue-pot — liste des UEs avec leur pot_code (pour configuration)
r.get('/ue-pot', authRequired, (req, res) => {
  const annee   = req.query.annee    || '2025-2026';
  const section = req.query.section  || null;
  const tous    = req.query.tous === '1';

  let sql = `
    SELECT ue_num, ue_nom, section, ue_code_fwb, pot_code,
      COALESCE(pot_code,
        CASE WHEN ue_code_fwb LIKE '980302%' THEN 'QUAL'
             WHEN ue_code_fwb LIKE '980301%' THEN 'CF'
             WHEN ue_code_fwb LIKE '980303%' THEN 'INCL'
             ELSE 'organique' END) AS pot_effectif
    FROM ue WHERE annee_scolaire = ?`;
  const params = [annee];
  if (section) { sql += ' AND section = ?'; params.push(section); }
  if (!tous) sql += ` AND (pot_code IS NOT NULL OR ue_code_fwb LIKE '9803%'
      OR ue_nom LIKE '%Qualit%' OR ue_nom LIKE '%Conseiller%'
      OR ue_nom LIKE '%inclusif%' OR ue_nom LIKE '%Inclusif%')`;
  sql += ' ORDER BY section, ue_nom';
  res.json(db.prepare(sql).all(...params));
});
// PATCH /ue-pot — assigner un pot_code à une UE
r.patch('/ue-pot', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { ue_num, annee_scolaire, pot_code } = req.body;
  if (!ue_num || !annee_scolaire) return res.status(400).json({ error: 'ue_num et annee_scolaire requis' });
  const result = db.prepare('UPDATE ue SET pot_code = ? WHERE ue_num = ? AND annee_scolaire = ?').run(pot_code || null, ue_num, annee_scolaire);
  if (!result.changes) return res.status(404).json({ error: 'UE introuvable' });
  res.json({ ok: true });
});

// GET /pilotage/efficience?annee= — encadrement par section et UE
// Deux ratios (élevé = performant) : étudiants/période payée, et étudiants/ETP.
// Agrégation : Σ(étudiants) ÷ Σ(périodes) et Σ(étudiants) ÷ Σ(ETP) à chaque maille.
r.get('/efficience', authRequired, (req, res) => {
  const { annee } = req.query;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  // IIP : périodes + ETP (CT/800 + PP/1000) par section/UE
  const lignesIIP = db.prepare(`
    SELECT v.section, v.ue_num,
      u.ue_nom, u.nb_etudiants,
      SUM(v.total_attribue_professeur) AS periodes,
      (SUM(CASE WHEN v.type_cours='CT' THEN v.total_attribue_professeur ELSE 0 END)/800.0
       + SUM(CASE WHEN v.type_cours='PP' THEN v.total_attribue_professeur ELSE 0 END)/1000.0) AS etp
    FROM v_attribution_complete v
    LEFT JOIN ue u ON u.ue_num = v.ue_num AND u.annee_scolaire = v.annee_scolaire
    WHERE v.annee_scolaire = ? AND COALESCE(v.contrat_mdp,'IIP')='IIP'
    GROUP BY v.section, v.ue_num, u.ue_nom, u.nb_etudiants
    ORDER BY v.section, v.ue_num
  `).all(annee);

  // HELB : ETP par statut (MA/PI: TH 480, TP 750 ; MFP: 750 ; COORD: 1400)
  // diviseur appliqué par ligne selon le statut HELB du prof et la nature TH/TP.
  const lignesHELB = db.prepare(`
    SELECT v.section, v.ue_num,
      v.charge_en_heures AS heures,
      COALESCE(p.statut_helb,'') AS statut,
      COALESCE(v.helb_nature,'CT') AS nature
    FROM v_attribution_complete v
    LEFT JOIN professeur p ON p.id = v.professeur_id
    WHERE v.annee_scolaire = ? AND v.contrat_mdp='HELB'
  `).all(annee);

  // Diviseur HELB
  const divHelb = (statut, nature) => {
    if (statut === 'COORD') return 1400;
    if (statut === 'MFP') return 750;
    return nature === 'TP' ? 750 : 480; // MA, PI, ou défaut
  };
  // ETP HELB agrégé par section + par UE
  const helbSec = {}, helbUE = {};
  for (const l of lignesHELB) {
    const e = (l.heures || 0) / divHelb(l.statut, l.nature);
    helbSec[l.section] = (helbSec[l.section] || 0) + e;
    const k = `${l.section}|${l.ue_num}`;
    helbUE[k] = (helbUE[k] || 0) + e;
  }

  const r1 = x => Math.round(x * 10) / 10;
  const r2 = x => Math.round(x * 100) / 100;

  const sections = {};
  for (const l of lignesIIP) {
    if ((l.periodes || 0) <= 0 && !(helbUE[`${l.section}|${l.ue_num}`])) continue;
    const s = (sections[l.section] ||= { section: l.section, etp: 0, periodes: 0, etudiants: 0, ues_sans_effectif: 0, ues: [] });
    const etpHelbUE = helbUE[`${l.section}|${l.ue_num}`] || 0;
    const etpUE = (l.etp || 0) + etpHelbUE;
    s.etp += etpUE;
    s.periodes += l.periodes || 0;
    if (l.nb_etudiants != null) s.etudiants += l.nb_etudiants; else if (l.periodes > 0) s.ues_sans_effectif++;
    s.ues.push({
      ue_num: l.ue_num, ue_nom: l.ue_nom, nb_etudiants: l.nb_etudiants,
      periodes: r1(l.periodes || 0),
      etp: Math.round(etpUE * 10000) / 10000,
      etud_par_periode: (l.nb_etudiants != null && l.periodes > 0) ? r2(l.nb_etudiants / l.periodes) : null,
      etud_par_etp: (l.nb_etudiants != null && etpUE > 0) ? r1(l.nb_etudiants / etpUE) : null,
    });
  }
  // Ajouter l'ETP HELB des sections qui n'ont pas de ligne IIP correspondante
  for (const sec of Object.keys(helbSec)) {
    if (!sections[sec]) sections[sec] = { section: sec, etp: helbSec[sec], periodes: 0, etudiants: 0, ues_sans_effectif: 0, ues: [] };
  }

  const out = Object.values(sections).map(s => ({
    section: s.section,
    etp: Math.round(s.etp * 10000) / 10000,
    periodes: r1(s.periodes),
    etudiants: s.etudiants,
    etud_par_periode: s.periodes > 0 ? r2(s.etudiants / s.periodes) : null,
    etud_par_etp: s.etp > 0 ? r1(s.etudiants / s.etp) : null,
    ues_sans_effectif: s.ues_sans_effectif,
    ues: s.ues,
  }));

  const tEtp = out.reduce((a, s) => a + s.etp, 0);
  const tPer = out.reduce((a, s) => a + s.periodes, 0);
  const tEtu = out.reduce((a, s) => a + s.etudiants, 0);
  res.json({
    annee, sections: out,
    total: {
      etp: Math.round(tEtp * 10000) / 10000,
      periodes: r1(tPer),
      etudiants: tEtu,
      etud_par_periode: tPer > 0 ? r2(tEtu / tPer) : null,
      etud_par_etp: tEtp > 0 ? r1(tEtu / tEtp) : null,
    },
  });
});

/**
 * LA RÉPARTITION ETP, CALCULÉE UNE FOIS POUR TOUS CEUX QUI EN ONT BESOIN.
 *
 * Ce calcul ne vivait que dans une route : l'écran l'appelait, et le document
 * du COPIL était fabriqué dans le navigateur à partir de la réponse. Un
 * rapport qui n'existe que si un écran est ouvert n'est pas un rapport — il ne
 * peut ni s'imprimer depuis le catalogue, ni se programmer, ni se vérifier.
 *
 * La fonction rend exactement ce que la route rendait ; la route l'appelle.
 * UN SEUL CALCUL, DEUX PORTES — et aucune chance qu'ils divergent.
 */
export function calculerEtp(annee) {

  // IIP : périodes CT et PP par section/UE (autonomie incluse dans total_attribue_professeur)
  //
  // TOUTES LES ORGANISATIONS COMPTENT — ce qui va sans dire tant que chaque
  // ligne porte sa section et son contrat. Or les lignes d'une organisation 2
  // rouverte ou retouchée peuvent arriver avec section NULL ou contrat vide :
  // groupées sous une section que le rapport ne peut pas choisir, ou exclues
  // des DEUX requêtes (COALESCE ne rattrape pas ''), leurs périodes
  // disparaissaient du rapport ETP sans un mot. D'où : la section retombe sur
  // celle de l'UE, et tout contrat qui n'est pas explicitement HELB est IIP.
  const lignesIIP = db.prepare(`
    SELECT COALESCE(NULLIF(v.section,''), u.section) AS section,
      v.ue_num, u.ue_nom, u.ue_niv, u.ects, u.ue_tc,
      SUM(CASE WHEN v.type_cours='CT' THEN v.total_attribue_professeur ELSE 0 END) AS per_ct,
      SUM(CASE WHEN v.type_cours='PP' THEN v.total_attribue_professeur ELSE 0 END) AS per_pp,
      SUM(CASE WHEN v.type_cours IS NULL OR v.type_cours NOT IN ('CT','PP') THEN v.total_attribue_professeur ELSE 0 END) AS per_autre
    FROM v_attribution_complete v
    LEFT JOIN ue u ON u.ue_num = v.ue_num AND u.annee_scolaire = v.annee_scolaire
    WHERE v.annee_scolaire = ? AND COALESCE(NULLIF(v.contrat_mdp,''),'IIP') <> 'HELB'
    GROUP BY COALESCE(NULLIF(v.section,''), u.section), v.ue_num, u.ue_nom, u.ue_niv, u.ects, u.ue_tc
    ORDER BY 1, v.ue_num
  `).all(annee);

  // HELB : MÊME logique que IIP — périodes CT/800 + PP/1000 (tout est déjà en périodes).
  // Le TH/TP (480/750) n'est qu'un affichage de saisie, pas une base de calcul ETP.
  const lignesHELB = db.prepare(`
    SELECT COALESCE(NULLIF(v.section,''), u.section) AS section, v.ue_num,
      SUM(CASE WHEN v.type_cours='CT' THEN v.total_attribue_professeur ELSE 0 END) AS per_ct,
      SUM(CASE WHEN v.type_cours='PP' THEN v.total_attribue_professeur ELSE 0 END) AS per_pp,
      SUM(CASE WHEN v.type_cours IS NULL OR v.type_cours NOT IN ('CT','PP') THEN v.total_attribue_professeur ELSE 0 END) AS per_autre
    FROM v_attribution_complete v
    LEFT JOIN ue u ON u.ue_num = v.ue_num AND u.annee_scolaire = v.annee_scolaire
    WHERE v.annee_scolaire = ? AND v.contrat_mdp='HELB'
    GROUP BY COALESCE(NULLIF(v.section,''), u.section), v.ue_num
  `).all(annee);
  const helbUE = {};
  for (const l of lignesHELB) {
    const e = (l.per_ct || 0) / 800 + (l.per_pp || 0) / 1000 + (l.per_autre || 0) / 800;
    helbUE[`${l.section}|${l.ue_num}`] = {
      etp: e,
      per_ct: Math.round((l.per_ct || 0) + (l.per_autre || 0)),
      per_pp: Math.round(l.per_pp || 0),
    };
  }

  const r4 = x => Math.round(x * 10000) / 10000;
  const sections = {};
  for (const l of lignesIIP) {
    const etpCt = (l.per_ct || 0) / 800;
    const etpPp = (l.per_pp || 0) / 1000;
    const etpAutre = (l.per_autre || 0) / 800; // fallback CT pour types inconnus
    const etpIip = etpCt + etpPp + etpAutre;
    const helbInfo = helbUE[`${l.section}|${l.ue_num}`];
    const etpHelb = helbInfo ? helbInfo.etp : 0;
    if (etpIip <= 0 && etpHelb <= 0) continue;
    const s = (sections[l.section] ||= { section: l.section, etp_iip: 0, etp_helb: 0, etp_ct: 0, etp_pp: 0, ues: [] });
    s.etp_iip += etpIip; s.etp_helb += etpHelb; s.etp_ct += etpCt + etpAutre; s.etp_pp += etpPp;
    s.ues.push({
      ue_num: l.ue_num, ue_nom: l.ue_nom, ue_niv: l.ue_niv || null, ects: l.ects || null,
      // La marque de tronc commun descend jusqu'ici : c'est sur cette clé que
      // le centre d'impression restreint une pièce d'ETP.
      ue_tc: l.ue_tc || null,
      per_ct: Math.round((l.per_ct || 0) + (l.per_autre || 0)), per_pp: Math.round(l.per_pp || 0),
      per_ct_helb: helbInfo ? helbInfo.per_ct : 0, per_pp_helb: helbInfo ? helbInfo.per_pp : 0,
      etp_ct: r4(etpCt + etpAutre), etp_pp: r4(etpPp),
      etp_iip: r4(etpIip), etp_helb: r4(etpHelb), etp_total: r4(etpIip + etpHelb),
    });
  }
  // Sections HELB sans ligne IIP — récupérer nom/niveau depuis la table ue
  const ueInfo = db.prepare(`SELECT ue_num, ue_nom, ue_niv, ects, ue_tc FROM ue WHERE annee_scolaire = ?`).all(annee);
  const ueInfoMap = {};
  for (const u of ueInfo) ueInfoMap[String(u.ue_num)] = u;
  for (const k of Object.keys(helbUE)) {
    const [sec, ueNum] = k.split('|');
    if (sections[sec] && sections[sec].ues.some(u => String(u.ue_num) === ueNum)) continue;
    const info = helbUE[k];
    if (!info || info.etp <= 0) continue;
    const ui = ueInfoMap[ueNum] || {};
    const s = (sections[sec] ||= { section: sec, etp_iip: 0, etp_helb: 0, etp_ct: 0, etp_pp: 0, ues: [] });
    s.etp_helb += info.etp;
    s.ues.push({
      ue_num: Number(ueNum), ue_nom: ui.ue_nom || null, ue_niv: ui.ue_niv || null, ects: ui.ects || null,
      ue_tc: ui.ue_tc || null,
      per_ct: 0, per_pp: 0, per_ct_helb: info.per_ct, per_pp_helb: info.per_pp,
      etp_ct: 0, etp_pp: 0, etp_iip: 0, etp_helb: r4(info.etp), etp_total: r4(info.etp),
    });
  }

  // Effectifs par UE pour le ratio étu./ETP
  const effectifs = db.prepare(`
    SELECT ue_num, nb_etudiants, section FROM ue WHERE annee_scolaire = ? AND nb_etudiants IS NOT NULL AND nb_etudiants > 0
  `).all(annee);
  const effMap = {}; // section -> total nb_etudiants
  for (const e of effectifs) {
    if (!effMap[e.section]) effMap[e.section] = 0;
    effMap[e.section] += (e.nb_etudiants || 0);
  }
  /* LES ÉTUDIANTS RÉELLEMENT INSCRITS (Charles, 3 octobre 2026 : « tu ne
     calcules pas les ETP/étudiants, pourtant tu as les données »). Le ratio
     lisait les effectifs ESTIMÉS par UE, additionnés : un étudiant inscrit à
     huit UE comptait huit fois, et une année sans estimation donnait zéro.
     Il compte désormais les personnes — inscrites cette année, dans leur
     section de rattachement. L'estimation par UE ne sert plus qu'à défaut. */
  const inscritsMap = {};
  /* ET PAR UNITÉ (Charles, 3 octobre 2026 : « le nombre d'inscrits dans une
     colonne — un rapport ETP à remettre à la HELB et au CA »). Les inscrits
     d'une UE dans une section sont ceux qui y sont rattachés : une UE du tronc
     commun compte ses optométristes chez Optométrie et ses orthoptistes chez
     Orthoptie. */
  const inscritsUE = {};                 // `${section}|${ue_num}` → nombre
  const secDe = new Map();
  for (const x of db.prepare('SELECT DISTINCT etudiant_id FROM etudiant_inscription WHERE annee_scolaire = ?').all(annee)) {
    const sec = sectionRattachement(x.etudiant_id, annee).section;
    secDe.set(x.etudiant_id, sec);
    if (sec) inscritsMap[sec] = (inscritsMap[sec] || 0) + 1;
  }
  for (const x of db.prepare('SELECT DISTINCT etudiant_id, ue_num FROM etudiant_inscription WHERE annee_scolaire = ?').all(annee)) {
    const sec = secDe.get(x.etudiant_id);
    if (sec) inscritsUE[`${sec}|${x.ue_num}`] = (inscritsUE[`${sec}|${x.ue_num}`] || 0) + 1;
  }
  for (const s of Object.values(sections)) for (const u of s.ues) u.nb_inscrits = inscritsUE[`${s.section}|${u.ue_num}`] || 0;

  const out = Object.values(sections)
    .map(s => ({
      section: s.section,
      etp_ct: r4(s.etp_ct), etp_pp: r4(s.etp_pp),
      etp_iip: r4(s.etp_iip), etp_helb: r4(s.etp_helb), etp_total: r4(s.etp_iip + s.etp_helb),
      nb_etudiants: inscritsMap[s.section] || effMap[s.section] || 0,
      nb_etudiants_source: inscritsMap[s.section] ? 'inscrits' : effMap[s.section] ? 'estimation' : null,
      ues: s.ues.sort((a, b) => String(a.ue_num).localeCompare(String(b.ue_num), 'fr', { numeric: true })),
    }))
    .sort((a, b) => a.section.localeCompare(b.section, 'fr'));

  const total = out.reduce((a, s) => ({
    etp_ct: a.etp_ct + s.etp_ct, etp_pp: a.etp_pp + s.etp_pp,
    etp_iip: a.etp_iip + s.etp_iip, etp_helb: a.etp_helb + s.etp_helb, etp_total: a.etp_total + s.etp_total,
  }), { etp_ct: 0, etp_pp: 0, etp_iip: 0, etp_helb: 0, etp_total: 0 });
  for (const k of Object.keys(total)) total[k] = r4(total[k]);

  // ── Postes de coordination HELB directs (etp_helb sur personnel_mission) ────
  const coordHelb = db.prepare(`
    SELECT pm.section_code AS section, pm.fonction, pm.etp_helb,
           p.nom AS prof_nom, p.prenom AS prof_prenom
    FROM personnel_mission pm
    JOIN professeur p ON p.id = pm.professeur_id
    WHERE pm.annee_scolaire = ? AND COALESCE(pm.etp_helb, 0) > 0
    ORDER BY pm.section_code, p.nom, pm.fonction
  `).all(annee);

  // Ajouter etp_coordination_helb à chaque section + total
  const coordBySec = {};
  for (const m of coordHelb) {
    if (!coordBySec[m.section]) coordBySec[m.section] = [];
    coordBySec[m.section].push(m);
  }
  const outWithCoord = out.map(s => ({
    ...s,
    coord_helb: coordBySec[s.section] || [],
    etp_coord_helb: r4((coordBySec[s.section] || []).reduce((sum, m) => sum + (m.etp_helb || 0), 0)),
  }));
  const totalCoordHelb = r4(coordHelb.reduce((sum, m) => sum + (m.etp_helb || 0), 0));

  // ── Postes PNCC (secrétariat étudiant proratisé, etc.) ─────────────────────
  const pnccAll = db.prepare(`
    SELECT id, categorie, libelle_fonction, nom_personne, etp, notes
    FROM poste_pncc WHERE annee_scolaire = ? ORDER BY categorie, libelle_fonction
  `).all(annee);

  // Nb sections actives (pour prorata)
  const nbSections = outWithCoord.length || 1;

  // ETP secrétariat étudiant total + proratisé
  const etpSecEtu = pnccAll
    .filter(p => p.categorie === 'secretariat_etudiant')
    .reduce((s, p) => s + (p.etp || 0), 0);
  const etpSecEtuProrata = r4(etpSecEtu / nbSections);

  // Ajouter etp_secretariat à chaque section
  const outFinal = outWithCoord.map(s => ({
    ...s,
    etp_secretariat: etpSecEtuProrata,
  }));

  return {
    annee,
    sections: outFinal,
    total: { ...total, etp_coord_helb: totalCoordHelb },
    coord_helb: coordHelb,
    pncc: pnccAll,
    nb_sections: nbSections,
    etp_sec_etu_total: r4(etpSecEtu),
    etp_sec_etu_prorata: etpSecEtuProrata,
  };
}

// GET /etp?annee= — la même chose, par la porte de l'écran.
r.get('/etp', authRequired, (req, res) => {
  const { annee } = req.query;
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  res.json({ ...calculerEtp(annee), ratios: ratiosEtp(annee) });
});

// GET /ratios?annee= — les seuls ratios étudiants par ETP (Gestion → Dotation, graphe par section).
r.get('/ratios', authRequired, (req, res) => {
  const annee = req.query.annee || anneeDeTravail(req);
  res.json(ratiosEtp(annee));
});

/* LE RATIO ETP PAR ÉTUDIANT (Charles, 14 octobre 2026 : « le ratio ETP/étudiant — cours, puis
 * admin, direction comprise, puis total, tout le monde compris »). Les ETP de cours sont ceux de ce
 * calcul ; les ETP administratifs, les fonctions d'ÉTABLISSEMENT de l'année (direction, direction
 * adjointe, secrétariat — personnel_mission) ; les coordinations sont des attributions, déjà
 * comptées dans les cours. L'étudiant est l'inscrit de Population (hors archivés) ; par section,
 * un étudiant de deux sections compte dans chacune, l'école le compte une fois. */
function ratiosEtp(annee) {
  const lignes = inscrits(annee);
  const parSection = {};
  for (const l of lignes) (parSection[l.section || '(sans section)'] ||= new Set()).add(l.id);
  let admin = [];
  try {
    admin = db.prepare(`SELECT pm.fonction, COALESCE(SUM(COALESCE(pm.etp, 0) + COALESCE(pm.etp_helb, 0)), 0) AS etp, COUNT(*) AS n
      FROM personnel_mission pm JOIN fonction_type ft ON ft.libelle = pm.fonction
      WHERE pm.annee_scolaire = ? AND ft.portee = 'etablissement' GROUP BY pm.fonction ORDER BY ft.ordre`).all(annee);
  } catch { admin = []; }
  const etpAdmin = admin.reduce((t, a) => t + a.etp, 0);
  let sections = [];
  try { sections = ratiosParSection(annee, etpAdmin); } catch (e) { console.error('[ratios ETP]', e.message); }
  const tronc = troncsCommuns;
  return {
    inscrits: new Set(lignes.map(l => l.id)).size,
    inscrits_par_section: Object.fromEntries(Object.entries(parSection).map(([s, set]) => [s, set.size])),
    etp_admin: etpAdmin,
    admin,
    periodes_temps_plein: periodesTempsPlein(),
    sections,
    troncs_communs: tronc,
  };
}

/* LE RATIO PAR SECTION SE CALCULE À ARMES ÉGALES (Charles, 14 octobre 2026 : « Orthoptie et soins de
 * plaies n'ont aucun sens — soins de plaies, c'est 48 périodes pour 30 étudiants ; l'orthoptie utilise
 * proportionnellement, pour le tronc commun, les heures d'opto »). Deux corrections :
 *  1. LES ETP D'UNE UE SE PARTAGENT entre les sections de ses étudiants, au prorata de leurs inscrits —
 *     le tronc commun optométrie / orthoptie, mais aussi toute UE suivie par plusieurs sections. Une UE
 *     sans inscrit garde ses ETP dans la section de ses attributions.
 *  2. L'ÉTUDIANT COMPTE AU PRORATA DES PÉRIODES QU'IL SUIT : un équivalent temps plein étudiant (ETE)
 *     vaut `ratio.periodes_temps_plein` périodes étudiant (750 par défaut, ≈ 60 crédits), réglable.
 * La coordination (lignes d'attribution COCUR, COSTA, COTFE… et missions de section payées en ETP) se
 * lit à part des cours ; l'administration (fonctions d'établissement) se partage au prorata des ETE. */
const CODES_COORD = ['COSEC', 'COCUR', 'COSTA', 'COTFE', 'CREF', 'COQUAL', 'COINCL', 'COPEDA'];
function periodesTempsPlein() {
  try {
    db.prepare(`INSERT OR IGNORE INTO parametre (cle, valeur, label, section, groupe) VALUES (?,?,?,?,?)`)
      .run('ratio.periodes_temps_plein', '750', "Périodes étudiant d'un temps plein — ratio étudiants par ETP (≈ 60 crédits)", null, 'couts');
  } catch { /* */ }
  return getParamNum('ratio.periodes_temps_plein', 750) || 750;
}
/* LE DÉTAIL D'UNE FORMATION (3.1.392, Charles, 16 octobre 2026 : « savoir quelle formation coûte peu et
   laquelle coûte cher en encadrement — le nombre d'étudiants ÷ les ETP, puis BA1, BA2, BA3, puis UE par UE »).
   Le bloc d'une UE est celui du schéma de la section (lib/placement.js), jamais ue_niv en direct. Un
   étudiant compte dans chaque bloc où il suit une UE. */
function detailSection(o, annee) {
  let place = {};
  try { place = placementsSection(o.section, annee); } catch { place = {}; }
  const noms = new Map(db.prepare('SELECT ue_num, MAX(ue_nom) n FROM ue WHERE annee_scolaire = ? GROUP BY ue_num').all(annee).map(x => [x.ue_num, x.n]));
  const r3 = x => Math.round(x * 1000) / 1000;
  const ues = [...o.ues.entries()].map(([u, x]) => ({ ue_num: u, ue_nom: noms.get(u) || '', bloc: place[u]?.bloc || '—', inscrits: x.ids.size, etp: r3(x.etp) }))
    .filter(x => x.inscrits || x.etp).sort((a, b) => String(a.bloc).localeCompare(String(b.bloc), 'fr', { numeric: true }) || a.ue_num - b.ue_num);
  const blocs = {};
  for (const [u, x] of o.ues) {
    const b = place[u]?.bloc || '—';
    const B = blocs[b] ||= { bloc: b, ids: new Set(), etp: 0 };
    x.ids.forEach(i => B.ids.add(i)); B.etp += x.etp;
  }
  return { ues, blocs: Object.values(blocs).map(B => ({ bloc: B.bloc, inscrits: B.ids.size, etp: r3(B.etp) }))
    .sort((a, b) => String(a.bloc).localeCompare(String(b.bloc), 'fr', { numeric: true })) };
}
let troncsCommuns = [];   // le dernier calcul : les blocs d'UE partagées, pour l'écran
function ratiosParSection(annee, etpAdmin) {
  const ref = periodesTempsPlein();
  const etpDe = l => (String(l.type_cours || '').toUpperCase() === 'PP' ? (l.per || 0) / 1000 : (l.per || 0) / 800);
  // Les attributions, comme calculerEtp : toutes organisations, IIP et HELB.
  const att = db.prepare(`
    SELECT COALESCE(NULLIF(v.section,''), (SELECT u.section FROM ue u WHERE u.ue_num = v.ue_num AND u.annee_scolaire = v.annee_scolaire LIMIT 1)) AS section,
      v.ue_num, v.type_cours, v.coordination_encadrement AS ce, v.professeur_id, SUM(v.total_attribue_professeur) AS per
    FROM v_attribution_complete v WHERE v.annee_scolaire = ?
    GROUP BY 1, v.ue_num, v.type_cours, v.coordination_encadrement, v.professeur_id`).all(annee);
  // Les inscriptions, et la section de chaque étudiant DANS CETTE UE : son rattachement si l'UE est de
  // sa section (tronc commun compris, ue_section), sinon la section de l'UE (le second cursus).
  const secsUE = new Map();
  for (const u of db.prepare('SELECT ue_num, section FROM ue WHERE annee_scolaire = ?').all(annee)) (secsUE.get(u.ue_num) || secsUE.set(u.ue_num, new Set()).get(u.ue_num)).add(u.section);
  try { for (const u of db.prepare('SELECT ue_num, section_code FROM ue_section WHERE annee_scolaire = ?').all(annee)) (secsUE.get(u.ue_num) || secsUE.set(u.ue_num, new Set()).get(u.ue_num)).add(u.section_code); } catch { /* */ }
  const perUE = new Map(db.prepare('SELECT ue_num, MAX(COALESCE(ue_per_etudiants, 0)) AS p FROM ue WHERE annee_scolaire = ? GROUP BY ue_num').all(annee).map(x => [x.ue_num, x.p]));
  const ins = db.prepare(`SELECT DISTINCT i.etudiant_id AS id, i.ue_num, e.section_rattachement AS ratt FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
     WHERE i.annee_scolaire = ? AND COALESCE(e.sortie_statut, '') <> 'archive'`).all(annee);
  const S = {};
  const sec = s => (S[s] ||= { section: s, ids: new Set(), periodes: 0, etp_cours: 0, etp_coord: 0, etp_cours_attribue: 0, per_cours: 0, ues: new Map() });
  const ueDe = (s, u) => { const o = sec(s); return o.ues.get(u) || o.ues.set(u, { ids: new Set(), etp: 0 }).get(u); };
  const inscritsUE = new Map();                       // ue → Map(section → n)
  for (const x of ins) {
    const ss = secsUE.get(x.ue_num) || new Set();
    const s = x.ratt && ss.has(x.ratt) ? x.ratt : ([...ss][0] || x.ratt);
    if (!s) continue;
    const o = sec(s); o.ids.add(x.id); o.periodes += perUE.get(x.ue_num) || 0; ueDe(s, x.ue_num).ids.add(x.id);
    const m = inscritsUE.get(x.ue_num) || inscritsUE.set(x.ue_num, new Map()).get(x.ue_num);
    m.set(s, (m.get(s) || 0) + 1);
  }
  // Les cours : partagés au prorata des inscrits de l'UE. La coordination : dans sa section.
  const coursUE = new Map(); const coordAtt = new Set();
  for (const l of att) {
    if (!l.section) continue;
    if (CODES_COORD.includes(String(l.ce || '').toUpperCase())) { sec(l.section).etp_coord += etpDe(l); coordAtt.add(`${l.professeur_id}|${String(l.ce).toUpperCase()}`); continue; }
    sec(l.section).etp_cours_attribue += etpDe(l);
    const c = coursUE.get(l.ue_num) || coursUE.set(l.ue_num, { etp: 0, per: 0, secs: new Map(), persecs: new Map() }).get(l.ue_num);
    c.etp += etpDe(l); c.secs.set(l.section, (c.secs.get(l.section) || 0) + etpDe(l));
    c.per += l.per || 0; c.persecs.set(l.section, (c.persecs.get(l.section) || 0) + (l.per || 0));
  }
  /* LE TRONC COMMUN SE COMPTE ENSEMBLE, PUIS SE RÉPARTIT (3.1.395, Charles, 16 octobre 2026 : « tu dois faire
     un calcul pour les étudiants du tronc commun — Orthoptie et Opto —, puis répartir proportionnellement au
     nombre d'inscrits »). Les UE suivies par plusieurs sections forment un bloc par groupe de sections : ses
     ETP s'additionnent, ses étudiants se comptent une fois par section, et chaque section reçoit la part de
     ces ETP qui revient à SES étudiants du bloc. Orthoptie, qui ne suit que le tronc commun, a donc
     exactement le ratio du tronc commun. Une UE d'une seule section reste à sa section. */
  const groupes = new Map();   // clé « secA|secB » → { ues: [], etp, per }
  for (const [ue, c] of coursUE) {
    const m = inscritsUE.get(ue); const n = m ? [...m.values()].reduce((a, b) => a + b, 0) : 0;
    if (m && m.size > 1) {
      const cle = [...m.keys()].sort().join('|');
      const g = groupes.get(cle) || groupes.set(cle, { ues: [], etp: 0, per: 0 }).get(cle);
      g.ues.push(ue); g.etp += c.etp; g.per += c.per;
      continue;
    }
    if (n) for (const [s] of m) { sec(s).etp_cours += c.etp; sec(s).per_cours += c.per; ueDe(s, ue).etp += c.etp; }
    else { for (const [s, e] of c.secs) { sec(s).etp_cours += e; ueDe(s, ue).etp += e; } for (const [s, p] of c.persecs) sec(s).per_cours += p; }
  }
  const tronc = [];
  for (const [cle, g] of groupes) {
    const secsG = cle.split('|');
    const parSec = Object.fromEntries(secsG.map(s => [s, new Set(g.ues.flatMap(u => [...(S[s]?.ues.get(u)?.ids || [])]))]));
    const total = secsG.reduce((t, s) => t + parSec[s].size, 0);
    if (!total) continue;
    for (const s of secsG) {
      const q = parSec[s].size / total;
      sec(s).etp_cours += g.etp * q; sec(s).per_cours += g.per * q;
      for (const u of g.ues) ueDe(s, u).etp += (coursUE.get(u)?.etp || 0) * q;
    }
    tronc.push({ sections: secsG, ues: g.ues.sort((a, b) => a - b), etudiants: total, par_section: Object.fromEntries(secsG.map(s => [s, parSec[s].size])),
      etp: Math.round(g.etp * 1000) / 1000 });
  }
  troncsCommuns = tronc;
  // Les missions de section payées en ETP (pas par des lignes d'attribution déjà lues ci-dessus).
  try {
    const CODE = [[/cursus/i, 'COCUR'], [/stage/i, 'COSTA'], [/tfe|fin d.[ée]tudes/i, 'COTFE'], [/section/i, 'COSEC'],
      [/qualit/i, 'COQUAL'], [/inclusi/i, 'COINCL'], [/r[ée]f[ée]rent/i, 'CREF'], [/p[ée]dagog/i, 'COPEDA']];
    for (const m of db.prepare(`SELECT pm.fonction, pm.section_code, pm.professeur_id, COALESCE(pm.etp, 0) + COALESCE(pm.etp_helb, 0) AS etp
        FROM personnel_mission pm JOIN fonction_type ft ON ft.libelle = pm.fonction
        WHERE pm.annee_scolaire = ? AND ft.portee = 'section'`).all(annee)) {
      if (!m.etp || !m.section_code) continue;
      const code = CODE.find(([re]) => re.test(m.fonction || ''))?.[1];
      if (code && coordAtt.has(`${m.professeur_id}|${code}`)) continue;
      sec(m.section_code).etp_coord += m.etp;
    }
  } catch { /* */ }
  const r3 = x => Math.round(x * 1000) / 1000;
  const liste = Object.values(S).map(o => ({ section: o.section, inscrits: o.ids.size, periodes: Math.round(o.periodes),
    ete: r3(o.periodes / ref), etp_cours: r3(o.etp_cours), etp_cours_attribue: r3(o.etp_cours_attribue), etp_coord: r3(o.etp_coord),
    /* LA TAILLE MOYENNE DU GROUPE (3.1.385, Charles : « le nombre d'étudiants moyen que chaque prof a devant
       lui ») : périodes suivies par les étudiants ÷ périodes données par les enseignants. Une heure devant
       quarante pèse plus qu'une heure devant huit. */
    per_cours: Math.round(o.per_cours), groupe_moyen: o.per_cours ? Math.round(o.periodes / o.per_cours * 10) / 10 : null,
    ...detailSection(o, annee) }));
  const eteTotal = liste.reduce((t, o) => t + o.ete, 0);
  for (const o of liste) o.etp_admin = r3(eteTotal ? etpAdmin * o.ete / eteTotal : 0);
  return liste.filter(o => o.inscrits || o.etp_cours || o.etp_coord).sort((a, b) => a.section.localeCompare(b.section, 'fr'));
}

// ── CRUD poste_pncc ──────────────────────────────────────────────────────────
r.get('/pncc', authRequired, (req, res) => {
  const { annee } = req.query;
  if (!annee) return res.status(400).json({ error: 'annee requis' });
  res.json(db.prepare('SELECT * FROM poste_pncc WHERE annee_scolaire = ? ORDER BY categorie, libelle_fonction').all(annee));
});

r.post('/pncc', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { annee_scolaire, categorie, libelle_fonction, nom_personne, etp, notes } = req.body;
  if (!annee_scolaire || !categorie || !libelle_fonction) return res.status(400).json({ error: 'Paramètres manquants' });
  const r2 = db.prepare('INSERT INTO poste_pncc (annee_scolaire, categorie, libelle_fonction, nom_personne, etp, notes) VALUES (?,?,?,?,?,?)')
    .run(annee_scolaire, categorie, libelle_fonction, nom_personne || null, etp || 1.0, notes || null);
  res.json({ id: r2.lastInsertRowid });
});

r.put('/pncc/:id', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { categorie, libelle_fonction, nom_personne, etp, notes } = req.body;
  db.prepare('UPDATE poste_pncc SET categorie=?, libelle_fonction=?, nom_personne=?, etp=?, notes=? WHERE id=?')
    .run(categorie, libelle_fonction, nom_personne || null, etp || 1.0, notes || null, req.params.id);
  res.json({ ok: true });
});

r.delete('/pncc/:id', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  db.prepare('DELETE FROM poste_pncc WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

export default r;

// GET /dotation-ue?section=&annee=&mode=scolaire|civile
// Tableau de détail du coût en dotation par UE
r.get('/dotation-ue', authRequired, (req, res) => {
  const { section, annee, mode = 'scolaire' } = req.query;
  if (!section || !annee) return res.status(400).json({ error: 'section et annee requis' });

  let anneeQ1, anneeQ2;
  if (mode === 'civile') {
    const y = parseInt(annee);
    anneeQ2 = `${y - 1}-${y}`;   // Jan-Jun : Q2 année scolaire précédente
    anneeQ1 = `${y}-${y + 1}`;   // Sep-Déc : Q1 année scolaire suivante
  } else {
    anneeQ1 = annee;
    anneeQ2 = annee;
  }

  // Toutes les UE de la section (référentiel)
  const ues = db.prepare(`
    SELECT u.ue_num, u.ue_nom, u.ue_niv, u.ue_niveau, u.ue_quad, u.pot_code,
      COALESCE(u.pot_code,
        CASE WHEN u.ue_code_fwb LIKE '980302%' THEN 'QUAL'
             WHEN u.ue_code_fwb LIKE '980301%' THEN 'CF'
             WHEN u.ue_code_fwb LIKE '980303%' THEN 'INCL'
             ELSE 'organique' END) AS pot
    FROM ue u
    WHERE u.section = ? AND u.annee_scolaire = ?
    ORDER BY u.ue_num
  `).all(section, mode === 'civile' ? anneeQ1 : annee);

  // Coûts Q1 par UE
  const costsQ1 = db.prepare(`
    SELECT a.ue_num,
      ROUND(SUM(${CQ1}), 2) AS cout_q1
    FROM attribution a
    LEFT JOIN ue u ON u.ue_num = a.ue_num AND u.annee_scolaire = a.annee_scolaire
    WHERE a.section = ? AND a.annee_scolaire = ? AND a.contrat_mdp = 'IIP'
    GROUP BY a.ue_num
  `).all(section, anneeQ1).reduce((m, r) => { m[r.ue_num] = r.cout_q1; return m; }, {});

  // Coûts Q2 par UE
  const costsQ2 = db.prepare(`
    SELECT a.ue_num,
      ROUND(SUM(${CQ2}), 2) AS cout_q2
    FROM attribution a
    LEFT JOIN ue u ON u.ue_num = a.ue_num AND u.annee_scolaire = a.annee_scolaire
    WHERE a.section = ? AND a.annee_scolaire = ? AND a.contrat_mdp = 'IIP'
    GROUP BY a.ue_num
  `).all(section, anneeQ2).reduce((m, r) => { m[r.ue_num] = r.cout_q2; return m; }, {});

  const lignes = ues.map(u => {
    const q1 = costsQ1[u.ue_num] || 0;
    const q2 = costsQ2[u.ue_num] || 0;
    return { ...u, cout_q1: q1, cout_q2: q2, cout_total: Math.round((q1 + q2) * 100) / 100 };
  });

  const total_q1 = Math.round(lignes.reduce((s, l) => s + l.cout_q1, 0) * 100) / 100;
  const total_q2 = Math.round(lignes.reduce((s, l) => s + l.cout_q2, 0) * 100) / 100;
  const total    = Math.round((total_q1 + total_q2) * 100) / 100;

  res.json({ section, annee, mode, lignes, total_q1, total_q2, total });
});

// GET /dotation-comparaison?annee1=2025-2026&annee2=2026-2027
// Tableau comparatif toutes sections × UE pour deux années scolaires
r.get('/dotation-comparaison', authRequired, (req, res) => {
  const { annee1, annee2 } = req.query;
  if (!annee1 || !annee2) return res.status(400).json({ error: 'annee1 et annee2 requis' });

  const potFilter = req.query.pot || null;
  const isHelb = potFilter === 'HELB';
  const isTout = potFilter === 'TOUT';
  const pondere = req.query.pondere !== '0'; // true par défaut, false = brut
  const mode = req.query.mode === 'civil' ? 'civil' : 'scolaire';

  // Coûts bruts Q1/Q2 (sans pondération) — total_attribue_professeur = périodes + autonomie
  const RQ1 = `CASE WHEN ${HORS_CONGE} THEN 0
    WHEN COALESCE(a.quadrimestre_attribue, u.ue_quad) IN ('Q1','Q1/Q2')
    THEN a.total_attribue_professeur * CASE WHEN COALESCE(a.quadrimestre_attribue, u.ue_quad)='Q1/Q2' THEN 0.4 ELSE 1 END
    ELSE 0 END`;
  const RQ2 = `CASE WHEN ${HORS_CONGE} THEN 0
    WHEN COALESCE(a.quadrimestre_attribue, u.ue_quad) IN ('Q2','Q1/Q2')
    THEN a.total_attribue_professeur * CASE WHEN COALESCE(a.quadrimestre_attribue, u.ue_quad)='Q1/Q2' THEN 0.6 ELSE 1 END
    ELSE 0 END`;

  function getCoutsAnnee(annee) {
    if (isTout) {
      const q1iip = pondere ? CQ1 : RQ1;
      const q2iip = pondere ? CQ2 : RQ2;
      const sql = `
        SELECT a.section, a.ue_num,
          ROUND(SUM(CASE WHEN a.contrat_mdp='IIP' THEN (${q1iip}) ELSE (${RQ1}) END), 2) AS q1,
          ROUND(SUM(CASE WHEN a.contrat_mdp='IIP' THEN (${q2iip}) ELSE (${RQ2}) END), 2) AS q2
        FROM attribution a
        LEFT JOIN ue u ON u.ue_num = a.ue_num AND u.annee_scolaire = a.annee_scolaire
        WHERE a.annee_scolaire = ?
        GROUP BY a.section, a.ue_num`;
      return db.prepare(sql).all(annee).reduce((m, r) => {
        if (!m[r.section]) m[r.section] = {};
        m[r.section][r.ue_num] = { q1: r.q1 || 0, q2: r.q2 || 0 };
        return m;
      }, {});
    }

    const q1expr = pondere && !isHelb ? CQ1 : RQ1;
    const q2expr = pondere && !isHelb ? CQ2 : RQ2;
    let sql = `
      SELECT a.section, a.ue_num,
        ROUND(SUM(${q1expr}), 2) AS q1,
        ROUND(SUM(${q2expr}), 2) AS q2
      FROM attribution a
      LEFT JOIN ue u ON u.ue_num = a.ue_num AND u.annee_scolaire = a.annee_scolaire
      WHERE a.annee_scolaire = ? AND a.contrat_mdp = ?`;
    const params = [annee, isHelb ? 'HELB' : 'IIP'];
    if (!isHelb && potFilter) {
      sql += ` AND ${POT} = ?`;
      params.push(potFilter);
    }
    sql += ` GROUP BY a.section, a.ue_num`;
    return db.prepare(sql).all(...params).reduce((m, r) => {
      if (!m[r.section]) m[r.section] = {};
      m[r.section][r.ue_num] = { q1: r.q1 || 0, q2: r.q2 || 0 };
      return m;
    }, {});
  }

  // En mode civil : année civile Y = Q2 de (Y-1)-(Y) + Q1 de (Y)-(Y+1)
  function getCouts(annee) {
    if (mode === 'scolaire') return getCoutsAnnee(annee);
    // annee est ici une année civile (ex: "2026")
    const y = parseInt(annee);
    const scoPrec = `${y-1}-${y}`;     // fournit le Q2
    const scoSuiv = `${y}-${y+1}`;     // fournit le Q1
    const cPrec = getCoutsAnnee(scoPrec);
    const cSuiv = getCoutsAnnee(scoSuiv);
    const merged = {};
    // Q2 vient de l'année scolaire précédente
    for (const [sec, ues] of Object.entries(cPrec)) {
      for (const [ue, v] of Object.entries(ues)) {
        merged[sec] ??= {};
        merged[sec][ue] = { q1: 0, q2: v.q2 || 0 };
      }
    }
    // Q1 vient de l'année scolaire suivante
    for (const [sec, ues] of Object.entries(cSuiv)) {
      for (const [ue, v] of Object.entries(ues)) {
        merged[sec] ??= {};
        merged[sec][ue] ??= { q1: 0, q2: 0 };
        merged[sec][ue].q1 = v.q1 || 0;
      }
    }
    return merged;
  }

  const couts1 = getCouts(annee1);
  const couts2 = getCouts(annee2);

  // Années scolaires effectives pour récupérer les métadonnées des UE
  // En civil : pour annéeY on regarde (Y-1)-(Y) et (Y)-(Y+1) → on prend la plus récente
  const scoFor = (a) => mode === 'civil' ? `${parseInt(a)}-${parseInt(a)+1}` : a;
  const sco1 = scoFor(annee1);
  const sco2 = scoFor(annee2);

  // Toutes les UE des deux années — une seule ligne par (section, ue_num)
  // Priorité à annee2 pour les métadonnées, fallback sur annee1.
  // On part des ATTRIBUTIONS réelles (source de vérité : quelle section utilise quelle UE,
  // y compris les UE partagées comme l'UE 95 utilisée par SAR mais déclarée sous RESTART),
  // et on récupère les métadonnées de l'UE par jointure sur ue_num+année SANS critère de section.
  const ues = db.prepare(`
    SELECT a.section, a.ue_num,
      COALESCE(MAX(CASE WHEN u.annee_scolaire = ? THEN u.ue_nom END),
               MAX(CASE WHEN u.annee_scolaire = ? THEN u.ue_nom END)) AS ue_nom,
      COALESCE(MAX(CASE WHEN u.annee_scolaire = ? THEN u.ue_niv END),
               MAX(CASE WHEN u.annee_scolaire = ? THEN u.ue_niv END)) AS ue_niv,
      COALESCE(MAX(CASE WHEN u.annee_scolaire = ? THEN u.ue_niveau END),
               MAX(CASE WHEN u.annee_scolaire = ? THEN u.ue_niveau END)) AS ue_niveau,
      COALESCE(MAX(CASE WHEN u.annee_scolaire = ? THEN u.ue_quad END),
               MAX(CASE WHEN u.annee_scolaire = ? THEN u.ue_quad END)) AS ue_quad,
      MAX(COALESCE(u.pot_code,
        CASE WHEN u.ue_code_fwb LIKE '980302%' THEN 'QUAL'
             WHEN u.ue_code_fwb LIKE '980301%' THEN 'CF'
             WHEN u.ue_code_fwb LIKE '980303%' THEN 'INCL'
             ELSE 'organique' END)) AS pot
    FROM attribution a
    LEFT JOIN ue u ON u.ue_num = a.ue_num AND u.annee_scolaire = a.annee_scolaire
    WHERE a.annee_scolaire IN (?, ?)
    GROUP BY a.section, a.ue_num
    ORDER BY a.section, a.ue_num
  `).all(sco2, sco1, sco2, sco1, sco2, sco1, sco2, sco1, sco1, sco2);

  // Grouper par section
  const sections = {};
  for (const u of ues) {
    if (!sections[u.section]) sections[u.section] = { section: u.section, ues: [], tot1: {q1:0,q2:0}, tot2: {q1:0,q2:0} };
    const c1 = couts1[u.section]?.[u.ue_num] || { q1: 0, q2: 0 };
    const c2 = couts2[u.section]?.[u.ue_num] || { q1: 0, q2: 0 };
    const t1 = Math.round((c1.q1 + c1.q2) * 100) / 100;
    const t2 = Math.round((c2.q1 + c2.q2) * 100) / 100;
    sections[u.section].ues.push({ ...u, c1, c2, t1, t2, delta: Math.round((t2 - t1) * 100) / 100 });
    sections[u.section].tot1.q1 = Math.round((sections[u.section].tot1.q1 + c1.q1) * 100) / 100;
    sections[u.section].tot1.q2 = Math.round((sections[u.section].tot1.q2 + c1.q2) * 100) / 100;
    sections[u.section].tot2.q1 = Math.round((sections[u.section].tot2.q1 + c2.q1) * 100) / 100;
    sections[u.section].tot2.q2 = Math.round((sections[u.section].tot2.q2 + c2.q2) * 100) / 100;
  }

  const result = Object.values(sections).map(s => {
    const tot1 = Math.round((s.tot1.q1 + s.tot1.q2) * 100) / 100;
    const tot2 = Math.round((s.tot2.q1 + s.tot2.q2) * 100) / 100;
    return { ...s, tot1_total: tot1, tot2_total: tot2, delta: Math.round((tot2 - tot1) * 100) / 100 };
  }).sort((a, b) => a.section.localeCompare(b.section));

  res.json({ annee1, annee2, sections: result });
});

// ── Badges EXT / DOT par pot_code ────────────────────────────────────────────
// GET /ext-dot?annee=2026-2027
// Retourne pour chaque pot_code cofinancé :
//   - plafond EXT (pér. B depuis enveloppe_externe)
//   - total pér. B attribué
//   - part EXT (dans le plafond) et part DOT (au-delà)
//   - liste des attributions avec leur badge EXT ou DOT
r.get('/ext-dot', authRequired, (req, res) => {
  const annee = req.query.annee || db.prepare("SELECT code FROM annee_scolaire WHERE active=1 LIMIT 1").get()?.code || '2026-2027';
  const anneeCivile = 2000 + parseInt(annee.split('-')[1]?.slice(-2) || '27');

  const POTS_EXT = ['QUAL', 'CF', 'INCL', 'AESI'];

  // Plafonds EXT par pot_code — fallback sur l'année civile précédente si absente
  // Enveloppe « illimitée » (ex. AeSI) → tout reste EXT (jamais DOT)
  const plafonds = {};
  const illimite = {};
  for (const pot of POTS_EXT) {
    const env = db.prepare("SELECT periodes_b, illimite FROM enveloppe_externe WHERE code=? AND annee_civile=?").get(pot, anneeCivile)
              || db.prepare("SELECT periodes_b, illimite FROM enveloppe_externe WHERE code=? AND annee_civile=?").get(pot, anneeCivile - 1);
    if (env?.illimite) { illimite[pot] = true; plafonds[pot] = Infinity; }
    else plafonds[pot] = env?.periodes_b ?? 0;
  }

  // Toutes les attributions sur des UEs à enveloppe externe
  const attrs = db.prepare(`
    SELECT a.id, a.ue_num, a.section, a.code_cours, a.professeur_id,
           p.nom || ' ' || p.prenom AS prof_nom,
           a.periodes_attribuees, a.autonomie_attribuee,
           a.type_cours, a.num_groupe, a.code AS groupe_code,
           u.pot_code, u.ue_niveau,
           ROUND(
             (a.periodes_attribuees + a.autonomie_attribuee) *
             CASE WHEN u.ue_niveau='SUP' THEN 1.5
                  WHEN u.ue_niveau='DS'  THEN 1.25
                  ELSE 1.0 END
           , 2) AS cout_b
    FROM attribution a
    JOIN ue u ON u.ue_num = a.ue_num AND u.annee_scolaire = a.annee_scolaire
    LEFT JOIN professeur p ON p.id = a.professeur_id
    WHERE a.annee_scolaire = ?
      AND u.pot_code IN (${POTS_EXT.map(()=>'?').join(',')})
      AND COALESCE(a.en_conge, 0) = 0
      AND (a.type_cours IS NULL OR a.type_cours != 'Z')
      AND (a.coordination_encadrement IS NULL OR a.coordination_encadrement NOT IN ('95','96','97','98','99'))
    ORDER BY u.pot_code, a.ue_num, a.id
  `).all(annee, ...POTS_EXT);

  // Répartir EXT/DOT par pot_code en consommant le plafond séquentiellement
  const consomme = {};
  const result = [];
  for (const a of attrs) {
    const pot = a.pot_code;
    if (!consomme[pot]) consomme[pot] = 0;
    const plafond = plafonds[pot] || 0;
    const cout = a.cout_b || 0;
    const restePlafond = Math.max(0, plafond - consomme[pot]);

    let badge, ext_b, dot_b;
    if (cout <= restePlafond) {
      badge = 'EXT'; ext_b = cout; dot_b = 0;
    } else if (consomme[pot] >= plafond) {
      badge = 'DOT'; ext_b = 0; dot_b = cout;
    } else {
      // Ligne mixte : partiellement EXT, partiellement DOT
      ext_b = restePlafond; dot_b = cout - restePlafond;
      badge = 'EXT+DOT';
    }
    consomme[pot] += cout;
    result.push({ ...a, badge, ext_b: Math.round(ext_b*100)/100, dot_b: Math.round(dot_b*100)/100 });
  }

  // Résumé par pot_code
  const resume = {};
  for (const pot of POTS_EXT) {
    const ill = illimite[pot];
    resume[pot] = {
      plafond: ill ? null : plafonds[pot],
      illimite: !!ill,
      consomme: Math.round((consomme[pot]||0)*100)/100,
      dot: ill ? 0 : Math.round(Math.max(0, (consomme[pot]||0) - plafonds[pot])*100)/100,
    };
  }

  const plafondsOut = {};
  for (const pot of POTS_EXT) plafondsOut[pot] = illimite[pot] ? null : plafonds[pot];

  res.json({ annee, anneeCivile, plafonds: plafondsOut, resume, attrs: result });
});
