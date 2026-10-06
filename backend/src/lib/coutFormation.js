// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Le coût réel d'une formation
//
// (Charles, 6 octobre 2026.) Chaque période attribuée, au montant de la
// circulaire des conventions (n° 9789 au 1er septembre 2026), selon le NIVEAU
// de l'unité et le TYPE du cours. Les montants vivent dans les paramètres
// (groupe « couts », Configuration → Coût des périodes) : quand la circulaire
// change, on les corrige là, sans déploiement. Une ligne en congé ne coûte
// rien — son remplaçant est compté, comme dans la dotation.
// ─────────────────────────────────────────────────────────────────────────────
import db from '../db/index.js';
import { getParam, getParamNum } from '../routes/parametres.js';
import { donneesChiffresCles } from './chiffresCles.js';

/** Un coût annuel d'un temps plein par fonction (table fonction_type), amorcé
 *  à zéro : le montant est à régler, Lucie ne l'invente pas. */
export function semerCoutsFonctions(dbx = db) {
  const ins = dbx.prepare(`INSERT OR IGNORE INTO parametre (cle, valeur, label, section, groupe) VALUES (?,?,?,?,?)`);
  for (const t of dbx.prepare('SELECT id, libelle FROM fonction_type ORDER BY ordre, libelle').all()) {
    ins.run(`cout.fonction.${t.id}`, '0', `Coût annuel d'un temps plein — ${t.libelle} (€)`, null, 'couts');
  }
}

export function tarifs() {
  return {
    reference: getParam('cout.reference', ''), date_effet: getParam('cout.date_effet', ''),
    SUP: { CT: getParamNum('cout.sup_gen', 0), PP: getParamNum('cout.sup_pp', 0), CS: getParamNum('cout.sup_spec', 0) },
    DS: { CT: getParamNum('cout.ds_gen', 0), PP: getParamNum('cout.ds_pp', 0), CS: getParamNum('cout.ds_spec', 0) },
    DI: { CT: getParamNum('cout.di_gen', 0), PP: getParamNum('cout.di_pp', 0), CS: getParamNum('cout.di_gen', 0) },
  };
}

export function donneesCout(annee) {
  const T = tarifs();
  // Le type manque sur quelques attributions : on le reprend du cours ; à
  // défaut, CT — et la pièce dit combien de périodes sont dans ce cas.
  const lignes = db.prepare(`
    SELECT v.section, v.ue_num, MIN(v.ue_nom) AS ue_nom, v.niveau, v.contrat_mdp AS contrat,
           COALESCE(v.type_cours, (SELECT c.ct_pp FROM cours c WHERE c.cours_code = v.code_cours
             AND c.annee_scolaire = v.annee_scolaire LIMIT 1)) AS type,
           (v.type_cours IS NULL) AS type_deduit,
           SUM(v.total_attribue_professeur) AS periodes
      FROM v_attribution_complete v
     WHERE v.annee_scolaire = ? AND COALESCE(v.en_conge, 0) = 0 AND COALESCE(v.total_attribue_professeur, 0) > 0
     GROUP BY v.section, v.ue_num, v.niveau, v.contrat_mdp, type, type_deduit`).all(annee);
  let sansTarif = 0, typeDefaut = 0;
  const parSection = new Map();
  for (const l of lignes) {
    const niv = ['SUP', 'DS', 'DI'].includes(l.niveau) ? l.niveau : null;
    let type = String(l.type || '').toUpperCase();
    if (type === 'Z') continue;                                   // aucun enseignant
    if (type !== 'PP' && type !== 'CS') { if (type !== 'CT') typeDefaut += l.periodes; type = 'CT'; }
    const t = niv ? T[niv][type] : 0;
    if (!niv || !t) { sansTarif += l.periodes; }
    const cout = (l.periodes || 0) * (t || 0);
    const sec = l.section || '(sans section)';
    const S = parSection.get(sec) || { section: sec, per_ct: 0, per_pp: 0, cout_ct: 0, cout_pp: 0, cout: 0,
      cout_iip: 0, cout_helb: 0, periodes: 0, ues: new Map() };
    const k = type === 'PP' ? 'pp' : 'ct';
    S['per_' + k] += l.periodes; S['cout_' + k] += cout; S.cout += cout; S.periodes += l.periodes;
    if (l.contrat === 'HELB') S.cout_helb += cout; else S.cout_iip += cout;
    const U = S.ues.get(l.ue_num) || { ue_num: l.ue_num, ue_nom: l.ue_nom, niveau: niv, periodes: 0, cout: 0,
      per_ct: 0, per_pp: 0, cout_ct: 0, cout_pp: 0, tarif_ct: niv ? T[niv].CT : 0, tarif_pp: niv ? T[niv].PP : 0 };
    U.periodes += l.periodes; U.cout += cout; U['per_' + k] += l.periodes; U['cout_' + k] += cout; S.ues.set(l.ue_num, U);
    parSection.set(sec, S);
  }
  // Les inscrits par section : ceux des chiffres clés, comptés de la même façon.
  let inscrits = {};
  try { for (const l of donneesChiffresCles(annee).lignes) inscrits[l.section] = l.etudiants.n; } catch { inscrits = {}; }
  const sections = [...parSection.values()].map(S => ({ ...S, ues: [...S.ues.values()].sort((a, b) => a.ue_num - b.ue_num),
    inscrits: inscrits[S.section] || 0 })).sort((a, b) => b.cout - a.cout);
  const total = sections.reduce((t, S) => ({ cout: t.cout + S.cout, periodes: t.periodes + S.periodes,
    cout_iip: t.cout_iip + S.cout_iip, cout_helb: t.cout_helb + S.cout_helb }), { cout: 0, periodes: 0, cout_iip: 0, cout_helb: 0 });

  // ── Les fonctions (direction, secrétariat, coordinations…) : coût annuel
  //    d'un temps plein × ETP de la personne dans la fonction, cette année.
  try { semerCoutsFonctions(); } catch { /* table absente */ }
  let missions = [];
  try {
    missions = db.prepare(`
      SELECT pm.fonction, pm.section_code, pm.etp, p.nom, p.prenom, ft.id AS type_id
        FROM personnel_mission pm JOIN professeur p ON p.id = pm.professeur_id
        LEFT JOIN fonction_type ft ON ft.libelle = pm.fonction
       WHERE pm.annee_scolaire = ?
       ORDER BY ft.ordre, pm.fonction, p.nom`).all(annee)
      .map(m => {
        const annuel = m.type_id ? getParamNum(`cout.fonction.${m.type_id}`, 0) : 0;
        const etp = Number(m.etp) || 0;
        return { ...m, portee: m.section_code === '__ETAB__' ? 'établissement' : m.section_code, etp, annuel, cout: etp * annuel };
      });
  } catch { missions = []; }
  const coutFonctions = missions.reduce((t, m) => t + m.cout, 0);
  // Réparti au prorata des inscrits (Charles, 6 octobre 2026) : c'est le
  // nombre de dossiers qui fait le travail du secrétariat et de la direction.
  const baseInscrits = sections.reduce((t, S) => t + S.inscrits, 0);
  for (const S of sections) {
    S.part_fonctions = baseInscrits ? coutFonctions * S.inscrits / baseInscrits : 0;
    S.cout_complet = S.cout + S.part_fonctions;
  }
  return { annee, tarifs: T, sections, total: { ...total, cout_fonctions: coutFonctions, cout_complet: total.cout + coutFonctions },
    missions, base_inscrits: baseInscrits,
    sans_etp: missions.filter(m => !m.etp).length, sans_cout: missions.filter(m => m.etp && !m.annuel).length,
    sans_tarif: sansTarif, type_defaut: typeDefaut };
}
