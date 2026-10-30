/**
 * LES FRAIS ESTIMÉS À CÔTÉ DU PAE EN LIGNE (3.1.526, Charles, 30 octobre 2026). Pendant qu'il coche ses unités,
 * l'étudiant voit ce que son programme lui coûterait — une ESTIMATION : ce qui fait foi reste la note de frais.
 *
 * Le portail ne calcule rien de lui-même : Lucie y dépose, avec l'offre du PAE, le TARIF de l'étudiant pour l'année
 * du PAE — les barèmes, ses exonérations, et pour chaque unité offerte ses périodes et son niveau —, et la même
 * formule (`estimerFrais`, ci-dessous, recopiée telle quelle dans l'espace de l'étudiant) additionne les unités
 * cochées. C'est la formule de `calculerDI` et de `calculerFrais` : forfait une fois, périodes professeur au tarif
 * du niveau sous le plafond global (le secondaire compté d'abord), droit spécifique, frais fixes et périodes
 * étudiant. Le forfait d'analyse des VA et les dispenses n'y entrent pas : une unité dispensée n'est pas cochable.
 */
import db from '../db/index.js';
import { bareme as baremeDI, calculerDIS, payeurTiers } from '../routes/droitInscription.js';
import { bareme as baremeFrais, sectionsSansFrais } from '../routes/fraisScolarite.js';
import { sectionRattachement } from '../routes/etudiants.js';
import { periodesDI, periodesEtudiantUE } from './periodesUE.js';

const arrondi = n => Math.round((Number(n) || 0) * 100) / 100;

/** Le tarif de l'étudiant pour une année, et les périodes de chaque unité demandée. */
export function tarifPAE(etudId, annee, ueNums) {
  const e = db.prepare('SELECT di_exonere FROM etudiant WHERE id = ?').get(etudId);
  if (!e) return null;
  const bd = baremeDI(annee), bf = baremeFrais(annee);
  let sec = null; try { sec = sectionRattachement(etudId, annee).section || null; } catch { /* */ }
  let tiers = null; try { tiers = payeurTiers(etudId, annee); } catch { /* */ }
  let dis = null; try { dis = calculerDIS(etudId, annee); } catch { /* */ }
  const annuelle = db.prepare(`SELECT ue_tot_prf tot_prf, ue_per_etudiants per_etud, ue_per_cours per_cours, ue_aut aut, ue_niveau niveau
    FROM ue WHERE ue_num = ? AND annee_scolaire = ? LIMIT 1`);
  const recente = db.prepare(`SELECT ue_tot_prf tot_prf, ue_per_etudiants per_etud, ue_per_cours per_cours, ue_aut aut, ue_niveau niveau
    FROM ue WHERE ue_num = ? ORDER BY annee_scolaire DESC LIMIT 1`);
  const unites = {};
  for (const n of ueNums) {
    const u = annuelle.get(Number(n), annee) || recente.get(Number(n));
    if (!u) continue;
    unites[Number(n)] = { per_di: periodesDI(u), per_etud: periodesEtudiantUE(u),
      niveau: String(u.niveau || '').toUpperCase().startsWith('SUP') ? 'superieur' : 'secondaire' };
  }
  return {
    annee, forfait: bd.forfait, tarif_secondaire: bd.tarif_secondaire, tarif_superieur: bd.tarif_superieur,
    plafond: bd.plafond_periodes, frais_fixes: bf.frais_fixes, par_periode: bf.par_periode,
    exonere_di: !!e.di_exonere, sans_frais: !!tiers || (!!sec && sectionsSansFrais().has(sec)),
    tiers: tiers?.payeur || null, dis: dis?.soumis ? arrondi(dis.montant_du) : 0, unites,
  };
}

/** L'estimation pour une liste d'unités. Recopiée telle quelle dans le portail (frontend/src/portail/EspaceEtudiant.jsx). */
export function estimerFrais(t, ues) {
  const l = ues.map(n => t.unites[Number(n)]).filter(Boolean);
  if (!l.length) return null;
  const somme = (niv, k) => l.filter(u => !niv || u.niveau === niv).reduce((s, u) => s + (Number(u[k]) || 0), 0);
  const sec = Math.min(somme('secondaire', 'per_di'), t.plafond);
  const sup = Math.max(0, Math.min(somme('superieur', 'per_di'), t.plafond - sec));
  const droit = t.exonere_di ? 0 : Math.round((t.forfait + sec * t.tarif_secondaire + sup * t.tarif_superieur) * 20) / 20;
  const fixes = t.sans_frais ? 0 : t.frais_fixes;
  const variables = t.sans_frais ? 0 : arrondi(somme(null, 'per_etud') * t.par_periode);
  const total = arrondi(droit + t.dis + fixes + variables);
  return { droit: arrondi(droit), dis: t.dis, fixes: arrondi(fixes), variables, total, acompte: arrondi(droit + t.dis + fixes),
    periodes: somme(null, 'per_etud') };
}
