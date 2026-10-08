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
import { calculerFrais, bareme as baremeFrais, sectionsSansFrais } from '../routes/fraisScolarite.js';
import { bareme as baremeDI, sectionsTiers } from '../routes/droitInscription.js';
import { periodesDI, periodesEtudiantUE } from './periodesUE.js';
import { effectifsPrevus } from '../routes/effectifsPrevus.js';
import { indiceExpert } from './tauxExperts.js';

/** Un coût annuel d'un temps plein par fonction (table fonction_type), amorcé
 *  à zéro : le montant est à régler, Lucie ne l'invente pas. */
/* LES EMPLOIS PNCC EN PÉRIODES B (circulaire 7949 du 2 février 2021, § 1.1 —
   Charles, 7 octobre 2026 : « pour les admins »). Un temps plein de directeur
   vaut 1 200 périodes B, de directeur adjoint 1 000, de secrétaire de direction,
   comptable ou éducateur-économe 900, de chef d'atelier 1 000, d'éducateur-
   secrétaire, rédacteur ou commis 800. « Secrétaire » est posé à 800
   (éducateur-secrétaire) : 900 si c'est un emploi de secrétaire de direction. */
const EQUIV_PERIODES_B = [
  [/directeur adjoint|direction adjointe/i, 1000], [/directeur|direction/i, 1200],
  [/secr[ée]taire de direction|comptable|[ée]conome/i, 900], [/chef d.atelier/i, 1000],
  [/[ée]ducateur|r[ée]dacteur|commis|secr[ée]tai/i, 800],
];
/** La fonction et le code de ses lignes d'attribution (table type_encadrement). */
const CODE_COORDINATION = [[/cursus/i, 'COCUR'], [/stage/i, 'COSTA'], [/tfe|fin d.[ée]tudes/i, 'COTFE'],
  [/section/i, 'COSEC'], [/qualit/i, 'COQUAL'], [/inclusi/i, 'COINCL'], [/r[ée]f[ée]rent/i, 'CREF']];
export function semerCoutsFonctions(dbx = db) {
  const ins = dbx.prepare(`INSERT OR IGNORE INTO parametre (cle, valeur, label, section, groupe) VALUES (?,?,?,?,?)`);
  for (const t of dbx.prepare('SELECT id, libelle, portee FROM fonction_type ORDER BY ordre, libelle').all()) {
    ins.run(`cout.fonction.${t.id}`, '0', `Coût annuel d'un temps plein — ${t.libelle} (€)`, null, 'couts');
    if (t.portee === 'etablissement') {
      const eq = EQUIV_PERIODES_B.find(([re]) => re.test(t.libelle))?.[1] || 0;
      ins.run(`pncc.periodes_b.${t.id}`, String(eq), `Périodes B d'un temps plein — ${t.libelle} (circ. 7949)`, null, 'couts');
    }
  }
  ins.run('cout.remplacement_jours', '10', "Remplacement sans coût supplémentaire à partir de … jours ouvrables d'absence (circ. 9760, III.2.8)", null, 'couts');
  ins.run('pncc.cout_periode_b', '0', "Coût d'une période B (€) — vide : le montant d'une période CT du secondaire inférieur", null, 'couts');
  try { dbx.prepare("UPDATE parametre SET label = ? WHERE cle = 'pncc.cout_periode_b'").run("Coût d'une période B (€) — vide : le montant d'une période CT du secondaire inférieur"); } catch { /* */ }
}

/** Le niveau de tarif d'une section : SUP, DS ou DI, d'après son niveau déclaré. */
function niveauDeSection(code) {
  const n = String(db.prepare('SELECT niveau FROM section WHERE code = ?').get(code)?.niveau || '').toLowerCase();
  if (/secondaire inf|\bdi\b/.test(n)) return 'DI';
  if (/secondaire|\bds\b/.test(n)) return 'DS';
  return 'SUP';   // bachelier, BES, formation continue du supérieur
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
  let lignes = db.prepare(`
    SELECT v.section, v.ue_num, MIN(v.ue_nom) AS ue_nom, v.niveau, v.contrat_mdp AS contrat,
           COALESCE(v.type_cours, (SELECT c.ct_pp FROM cours c WHERE c.cours_code = v.code_cours
             AND c.annee_scolaire = v.annee_scolaire LIMIT 1)) AS type,
           (v.type_cours IS NULL) AS type_deduit,
           CASE WHEN v.statut_mdp IN ('CC', 'EXP') THEN v.statut_mdp ELSE 'AUTRE' END AS statut,
           COALESCE((SELECT CASE WHEN upper(p.sexe) IN ('F', 'M', 'X') THEN upper(p.sexe) END
             FROM professeur p WHERE p.id = v.professeur_id), 'NR') AS sexe,
           SUM(v.total_attribue_professeur) AS periodes
      FROM v_attribution_complete v
     WHERE v.annee_scolaire = ? AND COALESCE(v.en_conge, 0) = 0 AND COALESCE(v.total_attribue_professeur, 0) > 0
     GROUP BY v.section, v.ue_num, v.niveau, v.contrat_mdp, type, type_deduit, statut, sexe`).all(annee);
  /* UNE UNITÉ PARTAGÉE SE RÉPARTIT ENTRE SES SECTIONS AU PRORATA DE LEURS
     ÉTUDIANTS (Charles, 7 octobre 2026 : « comment distingues-tu opto d'ortho ?
     par étudiant ? »). Les attributions du tronc commun portent toutes la
     section Optométrie : sans cette répartition, Orthoptie et ses 115 étudiants
     n'auraient coûté aucun cours. Le coût de l'unité (toutes organisations
     confondues) se partage entre les sections qui la portent, selon le nombre
     d'étudiants de chacune inscrits à l'unité. */
  const sectionsUE = new Map();
  for (const r of db.prepare(`SELECT ue_num, section s FROM ue WHERE annee_scolaire = ? AND section IS NOT NULL
      UNION SELECT ue_num, section_code FROM ue_section WHERE annee_scolaire = ?`).all(annee, annee)) {
    if (!sectionsUE.has(r.ue_num)) sectionsUE.set(r.ue_num, new Set());
    sectionsUE.get(r.ue_num).add(r.s);
  }
  // La section de l'étudiant se lit comme dans les chiffres clés : son
  // rattachement, sinon celle de l'unité (hors cursus exclues).
  const etuParSection = db.prepare(`SELECT s, COUNT(DISTINCT id) n FROM (SELECT e.id,
         COALESCE(e.section_rattachement, (SELECT u.section FROM ue u WHERE u.ue_num = i.ue_num
           AND u.annee_scolaire = i.annee_scolaire AND COALESCE(u.hors_cursus, 0) = 0 LIMIT 1)) AS s
      FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id WHERE i.annee_scolaire = ? AND i.ue_num = ?
       AND COALESCE(e.sortie_statut, '') <> 'archive') GROUP BY s`);
  const partsUE = new Map();   // ue_num → [[section, part]]
  for (const [ue, secs] of sectionsUE) {
    if (secs.size < 2) continue;
    const comptes = etuParSection.all(annee, ue).filter(r => secs.has(r.s));
    const t = comptes.reduce((a, r) => a + r.n, 0);
    if (comptes.length > 1 && t) partsUE.set(ue, comptes.map(r => [r.s, r.n / t, r.n]));
  }
  if (partsUE.size) {
    lignes = lignes.flatMap(l => (partsUE.has(l.ue_num)
      ? partsUE.get(l.ue_num).map(([s, q, n]) => ({ ...l, section: s, periodes: l.periodes * q, part: q, etudiants_part: n }))
      : [l]));
  }
  let sansTarif = 0, typeDefaut = 0, expertsBase = 0;
  const indice = indiceExpert();
  const nouveauxStatuts = () => Object.fromEntries(['CC', 'EXP', 'AUTRE'].map(k => [k,
    { periodes: 0, cout: 0, per_ct: 0, per_pp: 0, cout_ct: 0, cout_pp: 0 }]));
  const totStatuts = nouveauxStatuts();
  const nouveauxSexes = () => Object.fromEntries(['F', 'M', 'X', 'NR'].map(k => [k, { periodes: 0, cout: 0 }]));
  const totSexes = nouveauxSexes();
  const parSection = new Map();
  /* LES PÉRIODES PAR NIVEAU, pour la lecture en coût moyen brut (Charles,
     8 octobre 2026 : « la haute école parle en coût moyen brut » — 106 € la
     période du supérieur, au total des heures). Les mêmes périodes que le coût
     détaillé : hors congé, hors Z, IIP et HELB séparés. */
  const parNiveau = {};
  for (const l of lignes) {
    const niv = ['SUP', 'DS', 'DI'].includes(l.niveau) ? l.niveau : null;
    let type = String(l.type || '').toUpperCase();
    if (type === 'Z') continue;                                   // aucun enseignant
    if (type !== 'PP' && type !== 'CS') { if (type !== 'CT') typeDefaut += l.periodes; type = 'CT'; }
    /* UN EXPERT EST PAYÉ EN PÉRIODES, COMME UN CHARGÉ DE COURS (Charles,
       7 octobre 2026 : « 800 CT, c'est donc 800 × 106 € en supérieur ») : le
       même montant de période ; les experts restent sur leurs propres lignes. */
    const estExpert = l.statut === 'EXP';
    const t = !niv ? 0 : T[niv][type];
    if (estExpert) expertsBase += l.periodes;
    if (!niv || !t) { sansTarif += l.periodes; }
    const cout = (l.periodes || 0) * (t || 0);
    const N = parNiveau[niv || '?'] ||= { niveau: niv, per_iip: 0, per_helb: 0, cout_detaille: 0 };
    if (l.contrat === 'HELB') N.per_helb += l.periodes || 0; else N.per_iip += l.periodes || 0;
    N.cout_detaille += cout;
    const sec = l.section || '(sans section)';
    const S = parSection.get(sec) || { section: sec, per_ct: 0, per_pp: 0, cout_ct: 0, cout_pp: 0, cout: 0,
      cout_iip: 0, cout_helb: 0, periodes: 0, ues: new Map(), statuts: nouveauxStatuts(), sexes: nouveauxSexes() };
    const k = type === 'PP' ? 'pp' : 'ct';
    S['per_' + k] += l.periodes; S['cout_' + k] += cout; S.cout += cout; S.periodes += l.periodes;
    if (l.contrat === 'HELB') S.cout_helb += cout; else S.cout_iip += cout;
    const U = S.ues.get(l.ue_num) || { ue_num: l.ue_num, ue_nom: l.ue_nom, niveau: niv, periodes: 0, cout: 0, part: l.part || null, etudiants_part: l.etudiants_part || null,
      per_ct: 0, per_pp: 0, cout_ct: 0, cout_pp: 0, tarif_ct: niv ? T[niv].CT : 0, tarif_pp: niv ? T[niv].PP : 0,
      statuts: nouveauxStatuts(), sexes: nouveauxSexes() };
    U.periodes += l.periodes; U.cout += cout; U['per_' + k] += l.periodes; U['cout_' + k] += cout; S.ues.set(l.ue_num, U);
    // CHARGÉS DE COURS ET EXPERTS (Charles, 6 octobre 2026 : « des lignes
    // différentes, et des % CC et EXP par UE, section… ») — même calcul.
    for (const X of [U.statuts[l.statut], S.statuts[l.statut], totStatuts[l.statut]]) {
      X.periodes += l.periodes; X.cout += cout; X['per_' + k] += l.periodes; X['cout_' + k] += cout;
    }
    U.statuts[l.statut]['tarif_' + k] = t;   // le montant d'une période, par statut, pour le détail
    // Hommes / femmes : le sexe de l'enseignant, « NR » quand la fiche ne le dit pas.
    for (const X of [U.sexes[l.sexe], S.sexes[l.sexe], totSexes[l.sexe]]) { X.periodes += l.periodes; X.cout += cout; }
    parSection.set(sec, S);
  }
  // Les inscrits par section : ceux des chiffres clés, comptés de la même façon.
  let inscrits = {};
  let humains = null;   // les personnes, pour « Femmes et hommes » (chiffres clés)
  try { humains = donneesChiffresCles(annee); for (const l of humains.lignes) inscrits[l.section] = l.etudiants.n; } catch { inscrits = {}; }
  // Une section qui a des inscrits mais aucune attribution figure aussi : elle
  // reçoit sa part des fonctions et ses droits, même sans coût de cours.
  const prevus = effectifsPrevus(annee);
  for (const sec of [...Object.keys(inscrits), ...[...prevus.keys()].filter(k => k.endsWith('|0')).map(k => k.slice(0, -2))]) {
    if (!parSection.has(sec) && (inscrits[sec] || prevus.has(`${sec}|0`))) parSection.set(sec, { section: sec, per_ct: 0, per_pp: 0, cout_ct: 0, cout_pp: 0,
      cout: 0, cout_iip: 0, cout_helb: 0, periodes: 0, ues: new Map(), statuts: nouveauxStatuts(), sexes: nouveauxSexes() });
  }
  const sections = [...parSection.values()].map(S => ({ ...S, ues: [...S.ues.values()].sort((a, b) => a.ue_num - b.ue_num),
    inscrits: inscrits[S.section] || 0 })).sort((a, b) => b.cout - a.cout);
  /* LES INSCRITS PRÉVUS, LÀ OÙ L'ON N'EN COMPTE AUCUN (7 octobre 2026) —
     Configuration → Coût des périodes. Jamais à la place d'un inscrit réel. */
  for (const S of sections) {
    if (!S.inscrits && prevus.has(`${S.section}|0`)) { S.inscrits = prevus.get(`${S.section}|0`); S.inscrits_prevus = true; }
  }
  /* LE DROIT ET LES FRAIS, UNITÉ PAR UNITÉ, AVEC LEUR FORMULE (Charles,
     7 octobre 2026 : « pour chaque UE, le calcul du DI et des frais, avec la
     formule appliquée »). Par étudiant : périodes professeur du dossier
     (autonomie comprise, hors Z) × tarif du niveau, et × le montant par
     période des frais. Les forfaits (DI, frais fixes) se paient une fois par
     étudiant : ils vont à la section, pas à l'unité. Ce calcul est THÉORIQUE —
     ni plafond, ni exonération, ni dispense — ; le perçu réel vient des fiches. */
  const BD = baremeDI(annee), BF = baremeFrais(annee);
  const refUE = db.prepare(`SELECT MAX(ue_tot_prf) tot_prf, MAX(ue_per_etudiants) per_etud, MAX(ue_per_cours) per_cours, MAX(ue_aut) aut, MAX(ue_niveau) niveau
      FROM ue WHERE annee_scolaire = ? AND ue_num = ?`);
  const nSections = db.prepare(`SELECT COUNT(DISTINCT s) n FROM (SELECT section s FROM ue WHERE annee_scolaire = ? AND ue_num = ? AND section IS NOT NULL
      UNION SELECT section_code FROM ue_section WHERE annee_scolaire = ? AND ue_num = ?)`);
  const inscritsUE = db.prepare(`SELECT COUNT(DISTINCT i.etudiant_id) n FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
      WHERE i.annee_scolaire = ? AND i.ue_num = ? AND (? = 0 OR e.section_rattachement = ?)
        AND COALESCE(e.sortie_statut, '') <> 'archive'`);
  const uesDeSection = db.prepare(`SELECT ue_num, MIN(ue_nom) AS ue_nom FROM ue WHERE annee_scolaire = ? AND (section = ? OR ue_num IN
      (SELECT ue_num FROM ue_section WHERE section_code = ? AND annee_scolaire = ?)) GROUP BY ue_num ORDER BY ue_num`);
  const exemptes = sectionsSansFrais();
  const tiersDe = sectionsTiers();
  for (const S of sections) {
    S.tiers = tiersDe.get(S.section) || null;   // droits perçus par un tiers (Orthoptie : HELB)
    const sansFrais = exemptes.has(S.section) || !!S.tiers;   // un tiers perçoit : pas de frais pour l'IIP
    // LES UNITÉS DU RÉFÉRENTIEL, pas seulement celles qui portent une attribution :
    // une unité sans professeur encore attribué fait payer ses étudiants quand même.
    S.droits_ues = uesDeSection.all(annee, S.section, S.section, annee).map(U => {
      const r = refUE.get(annee, U.ue_num) || {};
      const per = periodesDI(r);
      const sup = String(r.niveau || '').toUpperCase().startsWith('SUP');
      const partagee = (nSections.get(annee, U.ue_num, annee, U.ue_num)?.n || 0) > 1;
      let ins = inscritsUE.get(annee, U.ue_num, partagee ? 1 : 0, S.section)?.n || 0;
      let prevu = false;
      if (!ins && prevus.has(`${S.section}|${U.ue_num}`)) { ins = prevus.get(`${S.section}|${U.ue_num}`); prevu = true; }
      const tarif = sup ? BD.tarif_superieur : BD.tarif_secondaire;
      const perEtud = periodesEtudiantUE(r);   // les frais : périodes de l'étudiant
      const di = per * tarif, frais = sansFrais ? 0 : perEtud * BF.par_periode;
      return { ...U, droits: { periodes: per, periodes_etudiant: perEtud, niveau: sup ? 'supérieur' : 'secondaire', tarif_di: tarif, par_periode: sansFrais ? 0 : BF.par_periode, sans_frais: sansFrais,
        di_etudiant: di, frais_etudiant: frais, inscrits: ins, prevu, recette: S.tiers ? 0 : ins * (di + frais) } };
    });
    S.sans_frais = sansFrais;
    S.forfaits = { di: BD.forfait, frais: sansFrais ? 0 : BF.frais_fixes, etudiants: S.inscrits, montant: S.tiers ? 0 : S.inscrits * (BD.forfait + (sansFrais ? 0 : BF.frais_fixes)) };
  }
  const total = sections.reduce((t, S) => ({ cout: t.cout + S.cout, periodes: t.periodes + S.periodes,
    cout_iip: t.cout_iip + S.cout_iip, cout_helb: t.cout_helb + S.cout_helb }), { cout: 0, periodes: 0, cout_iip: 0, cout_helb: 0 });

  // ── Les fonctions (direction, secrétariat, coordinations…) : coût annuel
  //    d'un temps plein × ETP de la personne dans la fonction, cette année.
  try { semerCoutsFonctions(); } catch { /* table absente */ }
  const lignesCoordination = db.prepare(`SELECT v.section, v.niveau, COALESCE(v.type_cours, 'CT') AS type,
      SUM(v.total_attribue_professeur) AS periodes FROM v_attribution_complete v
     WHERE v.professeur_id = ? AND v.annee_scolaire = ? AND v.coordination_encadrement = ?
       AND COALESCE(v.en_conge, 0) = 0 GROUP BY v.section, v.niveau, type`);
  let missions = [];
  try {
    missions = db.prepare(`
      SELECT pm.fonction, pm.section_code, pm.etp, pm.etp_helb, pm.professeur_id, p.nom, p.prenom, ft.id AS type_id, ft.portee AS type_portee,
        (SELECT COALESCE(SUM(a.periodes_attribuees), 0) FROM attribution a
          WHERE a.professeur_id = pm.professeur_id AND a.annee_scolaire = pm.annee_scolaire) AS per_attribuees
        FROM personnel_mission pm JOIN professeur p ON p.id = pm.professeur_id
        LEFT JOIN fonction_type ft ON ft.libelle = pm.fonction
       WHERE pm.annee_scolaire = ?
       ORDER BY ft.ordre, pm.fonction, p.nom`).all(annee)
      .map(m => {
        /* LES ADMINISTRATIFS SONT DES EMPLOIS PNCC ; LES COORDINATIONS, NON
           (Charles, 6 octobre 2026 : « leur coût est mal calculé »). Direction
           et secrétariat — fonctions d'établissement — sont des emplois de
           personnel non chargé de cours (circulaire 6992) : emploi × coût
           annuel. Une coordination est tenue par un enseignant déjà payé par
           ses périodes attribuées : la compter en plus serait la compter deux
           fois. Elle reste listée, sans montant. */
        const pncc = m.type_portee === 'etablissement' || m.section_code === '__ETAB__';
        const annuel = pncc && m.type_id ? getParamNum(`cout.fonction.${m.type_id}`, 0) : 0;
        const etp = Number(m.etp) || 0;
        const portee = m.section_code === '__ETAB__' ? 'établissement' : m.section_code;
        if (pncc) {
          /* EN PÉRIODES B (circ. 7949) quand l'équivalence est réglée ; sinon le
             coût annuel saisi. ETP × périodes B × coût d'une période B. */
          const perB = m.type_id ? getParamNum(`pncc.periodes_b.${m.type_id}`, 0) : 0;
          // UNE PÉRIODE B EST UNE PÉRIODE CT DU SECONDAIRE INFÉRIEUR (Charles,
          // 7 octobre 2026 : « tu les paies en périodes C ») : à défaut de réglage,
          // le montant de la circulaire des conventions pour le secondaire inférieur.
          const coutB = getParamNum('pncc.cout_periode_b', 0) || T.DI.CT;
          if (perB) return { ...m, pncc, portee, etp, annuel, periodes_b: perB, cout_b: coutB, mode: 'periodes_b',
            calcul: `${etp} ETP × ${perB} pér. B × ${coutB.toFixed(2).replace('.', ',')} €`, cout: etp * perB * coutB };
          return { ...m, pncc, portee, etp, annuel, mode: 'annuel', calcul: `${etp} ETP × ${Math.round(annuel)} €`, cout: etp * annuel };
        }
        /* UNE COORDINATION, OU UNE FONCTION HELB, SANS PÉRIODE ATTRIBUÉE (Charles,
           7 octobre 2026) : « il faut alors compter les ETP en 800e » — ETP × 800 ×
           le montant d'une période CT du niveau de la section (SUP si SUP, DS si
           DS). Avec des périodes attribuées, elle est déjà payée : rien de plus. */
        /* LA PART HELB COMPTE TOUJOURS (Charles, 7 octobre 2026 : « tu ne comptes ni
           Moiny, ni Carly, ni Delvosal ») : elle n'est pas payée par les périodes
           de cours de la personne. La part IIP (ETP − HELB) ne compte que si la
           personne n'a aucune période attribuée — sinon ce sont elles qui la paient.
           « ETP » et « dont HELB » : la part HELB est comprise dans l'ETP. */
        const per = Number(m.per_attribuees) || 0;
        const etpHelb = Number(m.etp_helb) || 0;
        const etpTotal = Math.max(etp, etpHelb);
        const partIIP = per ? 0 : Math.max(0, etpTotal - etpHelb);
        const etpCompte = etpHelb + partIIP;
        if (etpCompte) {
          const niv = niveauDeSection(m.section_code);
          const tCT = T[niv]?.CT || 0;
          const quoi = etpHelb && partIIP ? `${etpCompte} ETP (dont ${etpHelb} HELB)` : etpHelb ? `${etpHelb} ETP HELB` : `${partIIP} ETP`;
          return { ...m, pncc, portee, etp: etpCompte, annuel: 0, mode: 'etp800', niveau: niv, tarif_ct: tCT,
            etp_helb_compte: etpHelb, etp_iip_compte: partIIP,
            calcul: `${quoi} × 800 × ${tCT.toFixed(2).replace('.', ',')} € (CT ${niv})${per && etpHelb ? ' — hors ses périodes' : ''}`, cout: etpCompte * 800 * tCT };
        }
        /* PAYÉE PAR SES PÉRIODES, MAIS CHIFFRÉE (Charles, 8 octobre 2026 : « j'aimerais
           quand même avoir les montants, même si payé en périodes — avec un * »). Les
           lignes d'attribution de la coordination (COCUR, COSTA, COTFE…) au montant de
           leur période ; déjà dans le coût des cours, elles ne s'ajoutent pas au total
           des fonctions. */
        if (per) {
          const code = CODE_COORDINATION.find(([re]) => re.test(m.fonction || ''))?.[1];
          const lignesC = code ? lignesCoordination.all(m.professeur_id, annee, code) : [];
          const dansSection = lignesC.filter(l => l.section === m.section_code);
          let perC = 0, coutC = 0; const parts = [];
          for (const l of (dansSection.length ? dansSection : lignesC)) {
            const niv = ['SUP', 'DS', 'DI'].includes(l.niveau) ? l.niveau : niveauDeSection(l.section);
            const ty = ['PP', 'CS'].includes(String(l.type || '').toUpperCase()) ? String(l.type).toUpperCase() : 'CT';
            const t = T[niv]?.[ty] || 0;
            perC += l.periodes; coutC += l.periodes * t;
            parts.push(`${Math.round(l.periodes)} pér. × ${t.toFixed(2).replace('.', ',')} € (${ty} ${niv})`);
          }
          return { ...m, pncc, portee, etp, annuel: 0, mode: 'periodes', cout: 0,
            periodes_coord: perC, cout_periodes: coutC, code_coord: code || null, calcul: parts.join(' + ') };
        }
        return { ...m, pncc, portee, etp, annuel: 0, mode: 'sans_etp', cout: 0 };
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
  // ── LES DROITS ET LES FRAIS (Charles, 6 octobre 2026 : « ajoute les
  //    finances : DI et frais d'inscription »). Repris du calcul de la fiche
  //    de l'étudiant (calculerFrais : DI, DIS, frais administratifs, versé) —
  //    un second calcul donnerait un second chiffre. Le DI et les frais
  //    administratifs RESTENT À L'ÉTABLISSEMENT (Charles, 6 octobre 2026 : à
  //    l'IIP, le DI est conservé) ; le DIS revient à la Fédération. Un étudiant inscrit dans deux sections est réparti
  //    entre elles au prorata des périodes de ses UE.
  const recettes = { di: 0, dis: 0, frais: 0, verse: 0, etudiants: 0, exoneres: 0 };
  const recSec = new Map();
  const recTiers = new Map();   // section → ce que doit un tiers (Orthoptie : HELB)
  try {
    const secUe = new Map(db.prepare(`SELECT ue_num, MIN(section) AS section, MAX(COALESCE(hors_cursus, 0)) AS hc
        FROM ue WHERE annee_scolaire = ? GROUP BY ue_num`).all(annee).map(u => [u.ue_num, u]));
    const etus = db.prepare(`SELECT DISTINCT i.etudiant_id AS id, e.section_rattachement AS rat
        FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id WHERE i.annee_scolaire = ?
          AND COALESCE(e.sortie_statut, '') <> 'archive'`).all(annee);   // les archivés ne paient rien
    for (const e of etus) {
      const f = calculerFrais(e.id, annee);
      if (!f) continue;
      /* PERÇU PAR UN TIERS (Orthoptie : HELB) : rien pour l'établissement ;
         compté à part, pour dire d'où vient le DI. */
      if (f.tiers) {
        /* DÛ PAR LE TIERS (Charles, 7 octobre 2026 : « il faut mettre le total du
           DI, mais il sera négatif et dû par la HE »). Le montant reste dans le
           total du DI, à la section de l'étudiant, et se lit comme dû par la HELB. */
        const cle = f.tiers.payeur;
        recettes.tiers = recettes.tiers || {};
        recettes.tiers[cle] = (recettes.tiers[cle] || 0) + f.droit_inscription + f.droit_specifique + f.frais_administratifs;
        recettes.etudiants_tiers = (recettes.etudiants_tiers || 0) + 1;
        const tx = recettes.tiers_detail = recettes.tiers_detail || { di: 0, dis: 0, frais: 0, verse: 0 };
        tx.di += f.droit_inscription; tx.dis += f.droit_specifique; tx.frais += f.frais_administratifs; tx.verse += f.verse;
        const sec = e.rat || '(sans section)';
        const T2 = recTiers.get(sec) || { di: 0, dis: 0, frais: 0, verse: 0, payeur: cle, etudiants: 0 };
        T2.di += f.droit_inscription; T2.dis += f.droit_specifique; T2.frais += f.frais_administratifs; T2.verse += f.verse; T2.etudiants++;
        recTiers.set(sec, T2);
        continue;
      }
      recettes.etudiants++; if (f.exonere_di) recettes.exoneres++;
      const parts = new Map();
      for (const d of f.detail_ue || []) {
        const u = secUe.get(d.ue_num) || {};
        // Une unité partagée (tronc commun) compte dans la section de l'étudiant.
        const partagee = e.rat && sectionsUE.get(d.ue_num)?.has(e.rat);
        const sec = (u.hc || partagee ? e.rat : u.section) || e.rat || '(sans section)';
        parts.set(sec, (parts.get(sec) || 0) + (Number(d.periodes) || 0));
      }
      const totalPer = [...parts.values()].reduce((a, b) => a + b, 0);
      if (!parts.size) parts.set(e.rat || '(sans section)', 1);
      for (const [sec, per] of parts) {
        const q = totalPer ? per / totalPer : 1 / parts.size;
        const R = recSec.get(sec) || { di: 0, dis: 0, frais: 0, verse: 0 };
        R.di += f.droit_inscription * q; R.dis += f.droit_specifique * q;
        R.frais += f.frais_administratifs * q; R.verse += f.verse * q;
        recSec.set(sec, R);
      }
      recettes.di += f.droit_inscription; recettes.dis += f.droit_specifique;
      recettes.frais += f.frais_administratifs; recettes.verse += f.verse;
    }
  } catch (e) { recettes.erreur = e.message; }
  for (const S of sections) {
    S.recettes = recSec.get(S.section) || { di: 0, dis: 0, frais: 0, verse: 0 };
    if (recTiers.has(S.section)) S.recettes_tiers = recTiers.get(S.section);
  }
  // Des droits rattachés à une section absente de la liste (UE d'une section
  // sans attribution ni inscrit compté) : on la montre plutôt que de les perdre.
  for (const [sec, Rx] of [...recSec, ...[...recTiers.keys()].filter(k => !recSec.has(k)).map(k => [k, { di: 0, dis: 0, frais: 0, verse: 0 }])]) {
    if (!sections.some(S => S.section === sec)) sections.push({ recettes_tiers: recTiers.get(sec), section: sec, per_ct: 0, per_pp: 0, cout_ct: 0, cout_pp: 0,
      cout: 0, cout_iip: 0, cout_helb: 0, periodes: 0, ues: [], statuts: nouveauxStatuts(), sexes: nouveauxSexes(),
      inscrits: 0, part_fonctions: 0, cout_complet: 0, recettes: Rx });
  }

  return { annee, tarifs: T, sections, statuts: totStatuts, sexes: totSexes, recettes,
    total: { ...total, cout_fonctions: coutFonctions, cout_complet: total.cout + coutFonctions },
    missions, base_inscrits: baseInscrits, baremes: { di: BD, frais: BF }, humains,
    sans_etp: missions.filter(m => m.pncc && !m.etp).length, sans_cout: missions.filter(m => m.pncc && m.etp && !m.annuel).length,
    sans_tarif: sansTarif, type_defaut: typeDefaut, niveaux: parNiveau,
    experts: { indice, periodes: expertsBase } };
}

/* LA SYNTHÈSE, COMMUNE À L'OUTIL ET À LA PIÈCE (Charles, 8 octobre 2026 : « ce
 * ne doit pas être une feuille mise en page mais un outil, avec ensuite un print
 * ou un envoi »). Les fonctions regroupées sans les noms, les postes du coût
 * complet, les ETP par section : calculés UNE fois ici — l'écran de Pilotage et
 * la pièce imprimée les lisent tous deux, et ne peuvent donc pas différer. */
export function syntheseCout(d) {
  const e1 = n => (Math.round((n || 0) * 100) / 100).toString().replace('.', ',');
  const n0 = n => Math.round(n || 0).toLocaleString('fr-BE');
  const m2 = n => (n || 0).toFixed(2).replace('.', ',');
  const eur = n => `${Math.round(n || 0).toLocaleString('fr-BE')} €`;
  const morceaux = d.missions.flatMap(m => {
    const base = { fonction: m.fonction || '(sans libellé)', portee: m.portee, personne: `${m.nom}|${m.prenom}` };
    if (m.mode === 'periodes_b') return [{ ...base, helb: false, mode: m.mode, etp: m.etp, cout: m.cout,
      cle: `${m.periodes_b}|${m.cout_b}`, formule: e => `${e1(e)} ETP × ${n0(m.periodes_b)} pér. B × ${m2(m.cout_b)} €` }];
    if (m.mode === 'annuel') return [{ ...base, helb: false, mode: m.mode, etp: m.etp, cout: m.cout,
      cle: `${m.annuel}`, formule: e => `${e1(e)} ETP × ${eur(m.annuel)}` }];
    if (m.mode === 'etp800') return [[false, m.etp_iip_compte], [true, m.etp_helb_compte]].filter(([, e]) => e).map(([helb, e]) => ({
      ...base, helb, mode: m.mode, etp: e, cout: e * 800 * m.tarif_ct, cle: `${m.tarif_ct}|${m.niveau}`,
      formule: x => `${e1(x)} ETP × 800 × ${m2(m.tarif_ct)} € (CT ${m.niveau})` }));
    return [{ ...base, helb: false, mode: m.mode, etp: m.etp, cout: 0, cle: '', per: m.periodes_coord || 0, coutP: m.cout_periodes || 0, code: m.code_coord }];
  });
  const groupes = [];
  for (const x of morceaux) {
    const k = `${x.fonction}|${x.helb}|${x.mode}|${x.cle}`;
    let g = groupes.find(y => y.k === k);
    if (!g) groupes.push(g = { k, fonction: x.fonction, helb: x.helb, mode: x.mode, f: x.formule, etp: 0, cout: 0, per: 0, coutP: 0, code: x.code || null, personnes: new Set(), portees: new Set() });
    g.etp += x.etp || 0; g.cout += x.cout || 0; g.per += x.per || 0; g.coutP += x.coutP || 0; g.personnes.add(x.personne); if (x.portee) g.portees.add(x.portee);
  }
  const fonctions = groupes.map(g => ({ fonction: g.fonction, helb: g.helb, mode: g.mode, etp: g.etp, cout: g.cout,
    periodes_coord: g.per, cout_periodes: g.coutP, code: g.code, personnes: g.personnes.size, portees: [...g.portees],
    calcul: g.mode === 'periodes' ? (g.per ? `${n0(g.per)} pér. de coordination (${g.code || ''}) × la période de leur unité *` : null)
      : g.mode === 'sans_etp' || !g.etp ? null : g.f(g.etp) }));
  const coutEnPeriodes = fonctions.reduce((a, g) => a + (g.cout_periodes || 0), 0);
  const tot = d.total;
  const postes = [{ nom: 'Cours — IIP', valeur: tot.cout - (tot.cout_helb || 0), helb: false }, { nom: 'Cours — HELB', valeur: tot.cout_helb || 0, helb: true }];
  for (const g of fonctions) {
    if (!g.cout_periodes) continue;
    postes[0].valeur -= g.cout_periodes;
    const nom = `${g.fonction} (en périodes) *`;
    const p0 = postes.find(x => x.nom === nom);
    if (p0) p0.valeur += g.cout_periodes; else postes.push({ nom, valeur: g.cout_periodes, helb: false });
  }
  for (const g of fonctions) {
    if (!g.cout) continue;
    const nom = `${g.fonction}${g.helb ? ' — HELB' : ''}`;
    const p0 = postes.find(x => x.nom === nom);
    if (p0) p0.valeur += g.cout; else postes.push({ nom, valeur: g.cout, helb: g.helb });
  }
  // UNE TEINTE PAR POSTE : la HELB en nuances de rose, l'établissement en teintes franches.
  const TEINTES_IIP = ['#19537E', '#F9B619', '#05B7E6', '#3E7D5E', '#B45309', '#8FA3B8', '#0F2A44', '#C9A227', '#5E9C8B'];
  const TEINTES_HELB = ['#97266D', '#D53F8C', '#F687B3', '#702459', '#ED64A6', '#B83280', '#FBB6CE'];
  let iI = 0, iH = 0;
  for (const p of postes) p.couleur = p.helb || /HELB/.test(p.nom) ? TEINTES_HELB[iH++ % TEINTES_HELB.length] : TEINTES_IIP[iI++ % TEINTES_IIP.length];
  // LES ETP PAR SECTION : CT ÷ 800 + PP ÷ 1 000, comme Pilotage.
  const etpDe = x => (x?.per_ct || 0) / 800 + (x?.per_pp || 0) / 1000;
  const etp = d.sections.filter(S => S.periodes).map(S => ({ section: S.section, total: etpDe(S),
    cc: etpDe(S.statuts.CC), exp: etpDe(S.statuts.EXP), autre: etpDe(S.statuts.AUTRE) }));
  const etpTotal = etp.reduce((t, x) => ({ total: t.total + x.total, cc: t.cc + x.cc, exp: t.exp + x.exp, autre: t.autre + x.autre }),
    { total: 0, cc: 0, exp: 0, autre: 0 });
  return { fonctions, cout_en_periodes: coutEnPeriodes, postes: postes.filter(p => p.valeur > 0), etp, etp_total: etpTotal,
    cmb: coutMoyenBrut(d),
    cout_helb_total: (tot.cout_helb || 0) + fonctions.filter(g => g.helb).reduce((a, g) => a + g.cout, 0) };
}

/* LE COÛT MOYEN BRUT PONDÉRÉ, PAR NIVEAU (Charles, 8 octobre 2026 : « une
 * période d'enseignement supérieur coûte 106 € ; la haute école parle en coût
 * moyen brut »). Une seule valeur par niveau, appliquée au total des périodes
 * attribuées — la lecture de la Haute École, à côté du calcul détaillé de la
 * circulaire (CT, PP, cours spéciaux), qu'elle ne remplace pas. Les montants se
 * règlent dans Configuration → Coût des périodes ; un niveau sans montant
 * montre ses périodes et le dit, il ne vaut pas zéro euro. */
export const NIVEAUX_CMB = [['SUP', 'Enseignement supérieur'], ['DS', 'Secondaire supérieur'], ['DI', 'Secondaire inférieur']];
export function coutMoyenBrut(d) {
  const lignes = [];
  for (const [niv, libelle] of NIVEAUX_CMB) {
    const N = d.niveaux?.[niv];
    if (!N || !(N.per_iip + N.per_helb)) continue;
    const taux = getParamNum(`cout.cmb_${niv.toLowerCase()}`, 0);
    const per = N.per_iip + N.per_helb;
    lignes.push({ niveau: niv, libelle, taux, per_iip: N.per_iip, per_helb: N.per_helb, periodes: per,
      montant_iip: taux ? N.per_iip * taux : null, montant_helb: taux ? N.per_helb * taux : null,
      montant: taux ? per * taux : null, cout_detaille: N.cout_detaille });
  }
  const sansNiveau = d.niveaux?.['?'] ? d.niveaux['?'].per_iip + d.niveaux['?'].per_helb : 0;
  const chiffres = lignes.filter(l => l.taux);
  const somme = k => chiffres.reduce((a, l) => a + (l[k] || 0), 0);
  return { lignes, sans_niveau: sansNiveau, a_regler: lignes.filter(l => !l.taux).map(l => l.libelle),
    total: { periodes: lignes.reduce((a, l) => a + l.periodes, 0), montant: somme('montant'),
      montant_iip: somme('montant_iip'), montant_helb: somme('montant_helb'), cout_detaille: somme('cout_detaille') } };
}
