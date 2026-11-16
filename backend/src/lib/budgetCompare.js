/* LE BUDGET COMPARÉ (3.5.501, Charles, 16 novembre 2026 : « pour le budget, toujours un indicateur par rapport aux autres sections et
   l'ASBL, sur base de données historiques mais aussi actualisées sur base des bilans et de la gestion interne dans Lucie — par exemple le
   coût par étudiant du budget de la section » ; maquette validée : quatre indicateurs). Par section et par année civile :
   — PRÉVU PAR ÉTUDIANT : lignes du module Budget non refusées (HTVA) ÷ effectif du budget (figé au 01/11 de l'année précédente).
   — RÉALISÉ PAR ÉTUDIANT (bilans) : charges de la section dans la synthèse des budgets et comptes de l'ASBL, côté HELB et côté IIP, du
     dernier exercice réalisé complet ÷ effectif de cet exercice. L'exercice en cours n'a pas de réalisé : l'engagé de Lucie le dit.
   — EXÉCUTION : engagé (dépenses encodées dans Lucie) ÷ prévu.
   — INVESTISSEMENTS PAR ÉTUDIANT : lignes d'investissement non refusées ÷ effectif.
   Références : la moyenne des sections (Σ ÷ Σ, pas une moyenne de moyennes) et l'ASBL (toutes ses charges ÷ étudiants HELB + IIP). */
import db from '../db/index.js';
import { syntheseBudget, effectifsLucie } from './budgetSections.js';
import { syntheseAsbl, dernierRealise, sourcesEnVigueur } from './sourcesReference.js';
import { COR_HELB } from './rapportIipHelb.js';

// Les postes de la synthèse de l'ASBL qui portent une section (les mêmes que Gestion → Lire et comparer).
const POSTES = { TIM: /imagerie/i, Optométrie: /^Optom/i, Psychomotricité: /^Psychomot/i, Orthoptie: /^Orthoptie/i };
const r0 = v => (v == null || !Number.isFinite(v) ? null : Math.round(v));

function effectifDe(section, annee) {
  const p = db.prepare('SELECT effectif FROM budget_section_param WHERE annee_civile = ? AND section = ?').get(annee, section);
  if (p?.effectif > 0) return p.effectif;
  try { return effectifsLucie(`${annee - 1}-11-01`)[section] || null; } catch { return null; }
}

/** Les charges réalisées de chaque section et de l'ASBL, exercice par exercice (exercices réalisés complets seulement). */
export function realisesParSection() {
  const S = syntheseAsbl(); if (!S) return null;
  const annees = [...new Set((S.totaux.exercices || []).filter(e => e.nature === 'realise').map(e => e.annee))].sort();
  const der = dernierRealise(S.totaux);
  const garde = annees.filter(a => a <= der);
  const par = {};
  for (const [sec, re] of Object.entries(POSTES)) {
    const h = S.totaux.postes.find(p => p.bloc === 'HELB' && p.niveau === 2 && re.test(p.poste));
    const i = S.totaux.postes.find(p => p.bloc === 'Institut Ilya Prigogine' && re.test(p.poste));
    par[sec] = Object.fromEntries(garde.map(a => [a, (h?.ex?.[`${a}|realise`]?.charges || 0) + (i?.ex?.[`${a}|realise`]?.charges || 0)]).filter(([, v]) => v > 0));
  }
  const asbl = Object.fromEntries(garde.map(a => [a, S.totaux.postes.find(p => p.bloc === 'ASBL')?.ex?.[`${a}|realise`]?.charges || 0]).filter(([, v]) => v > 0));
  return { par, asbl, dernier: der, fichier: S.fichier };
}

export function budgetCompare(annee) {
  annee = Number(annee);
  const SB = syntheseBudget(annee);
  const R = realisesParSection();
  const exR = R?.dernier ? Number(R.dernier) : null;
  const lignes = db.prepare("SELECT section, prix_unitaire, quantite, statut FROM budget_ligne WHERE annee_civile = ? AND statut != 'refuse'").all(annee);
  const seuil = SB.parametres?.seuil_invest ?? 500;
  const engageDe = new Map(db.prepare('SELECT section, SUM(montant_htva) t FROM budget_depense WHERE annee_civile = ? GROUP BY section').all(annee).map(x => [x.section, x.t || 0]));
  const sections = SB.sections.filter(x => x.effectif > 0 || lignes.some(l => l.section === x.section)).map(x => {
    const ls = lignes.filter(l => l.section === x.section);
    const fonct = ls.filter(l => l.prix_unitaire < seuil).reduce((t, l) => t + l.prix_unitaire * l.quantite, 0);
    const inv = ls.filter(l => l.prix_unitaire >= seuil).reduce((t, l) => t + l.prix_unitaire * l.quantite, 0);
    const prevu = fonct + inv, engage = engageDe.get(x.section) || 0, eff = x.effectif || null;
    const realise = exR ? R.par[x.section]?.[String(exR)] ?? null : null;
    const effR = realise != null ? effectifDe(x.section, exR) : null;
    return { section: x.section, effectif: eff, enveloppe: x.enveloppe, prevu: r0(prevu), fonctionnement: r0(fonct), investissements: r0(inv), engage: r0(engage),
      prevu_etudiant: eff ? r0(fonct / eff) : null, investissements_etudiant: eff ? r0(inv / eff) : null,
      execution: prevu ? Math.round((engage / prevu) * 100) : null,
      realise, effectif_realise: effR, realise_etudiant: realise != null && effR ? r0(realise / effR) : null,
      historique: R?.par[x.section] ? Object.entries(R.par[x.section]).map(([a, v]) => ({ annee: a, charges: r0(v), effectif: effectifDe(x.section, Number(a)), par_etudiant: effectifDe(x.section, Number(a)) ? r0(v / effectifDe(x.section, Number(a))) : null })) : [] };
  });
  // La moyenne des sections : Σ ÷ Σ, sur les sections qui ont la donnée.
  const somme = (k, kd) => { const s = sections.filter(x => x[k] != null && x[kd] > 0); const n = s.reduce((t, x) => t + x[kd], 0); return n ? r0(s.reduce((t, x) => t + x[k], 0) / n) : null; };
  const avecPrevu = sections.filter(x => x.prevu > 0);
  const moyenne = {
    prevu_etudiant: somme('fonctionnement', 'effectif'), investissements_etudiant: somme('investissements', 'effectif'),
    realise_etudiant: somme('realise', 'effectif_realise'),
    execution: avecPrevu.length ? Math.round((avecPrevu.reduce((t, x) => t + x.engage, 0) / avecPrevu.reduce((t, x) => t + x.prevu, 0)) * 100) : null,
  };
  // L'ASBL : ses charges du dernier exercice réalisé ÷ (inscrits de la HELB + effectifs de l'IIP au 01/11 précédent).
  let asbl = null;
  if (exR && R.asbl[String(exR)]) {
    const V = sourcesEnVigueur();
    const insH = V.helb_inscrits?.totaux?.total || COR_HELB.inscrits || 0;
    let insI = 0; try { insI = Object.values(effectifsLucie(`${exR - 1}-11-01`)).reduce((t, v) => t + v, 0); } catch { insI = 0; }
    const n = insH + insI;
    asbl = { exercice: exR, charges: r0(R.asbl[String(exR)]), etudiants: n, realise_etudiant: n ? r0(R.asbl[String(exR)] / n) : null, etudiants_helb: insH, etudiants_iip: insI };
  }
  return { annee, seuil, exercice_realise: exR, source_comptes: R?.fichier || null, sections, moyenne, asbl };
}
