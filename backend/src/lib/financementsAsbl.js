/* LES FINANCEMENTS PAR SECTION ET PAR DÉPARTEMENT DE L'ASBL (3.5.511, Charles, 17 novembre 2026 : « un tableau des financements de
   chaque section et département de l'ASBL : salaires, financements, nombre d'étudiants » ; tranché : dans Gestion, étudiants,
   financement, salaires et ETP, ratios ; la dernière année et l'évolution).
   Une ligne par poste de la synthèse des budgets et comptes de l'ASBL (blocs, départements de la HELB et leurs cursus, sections de
   l'IIP), par exercice RÉALISÉ complet (année civile) :
   — charges, produits, résultat : les comptes, tels quels ;
   — étudiants et ETP enseignants de l'année académique qui finit dans l'exercice (2024-2025 pour 2025, 8/12 de l'année civile) :
     HELB = ratios par département (étudiants finançables) et comparaison ETP par cursus ; IIP = inscrits et ETP de Lucie ;
   — enseignants : HELB = ETP × coût moyen d'un ETP statutaire du COR (une ESTIMATION, déjà comprise dans les charges) ; IIP = le coût
     des enseignants payés par la Fédération (convention), HORS des comptes de l'ASBL — le coût complet les ajoute.
   Rien d'une personne : des totaux. */
import db from '../db/index.js';
import { syntheseAsbl, realiseComplet } from './sourcesReference.js';
import { departementsHe, COMPARAISON_HE, prixHelb, coutMemo, enseignantsIipCivil } from './rapportIipHelb.js';

const DEPT = { 'Technologies et Economie': 'Technoeco', 'Santé': 'Santé', 'Social': 'Social', 'Communication et Médias audiovisuels': 'COMAV' };
// Le cursus des comptes → celui de la comparaison ETP de la HELB (les intitulés diffèrent).
const CURSUS = {
  'Informatique : Développement d\'applications': 'Informatique de gestion', 'Informatique de gestion': 'Informatique de gestion', 'Cyber sécurité': 'Cybersécurité', 'Electronique': 'Électronique appliquée',
  'Facility management': 'Facility management', 'Ergothérapie': 'Ergothérapie (CEB)', 'Podologie': 'Podologie', 'Sage-femme': 'Sage-femme',
  'Soins infirmiers': 'Soins infirmiers', 'Hygiéniste bucco-dentaire': 'Hygiéniste bucco-dentaire', 'Orthoptie': 'Orthoptie',
  'Technologue en imagerie médicale': 'Technologue en imagerie médicale', 'Accueil et éducation du jeune enfant': 'AEJE', 'Kinésithérapie': 'Kinésithérapie',
  'Master en Sciences infirmières': 'MSI', 'Cinématographie': 'Cinéma', 'Photographie': 'Photographie', 'Relations publiques': 'Relations publiques',
  'Assistant social': 'Assistant social', 'Ecologie sociale': 'Écologie sociale',
};
// Les sections de l'IIP dans les comptes → leur code dans Lucie.
const SECTION_IIP = { 'Optométrie': 'Optométrie', 'Psychomotricité': 'Psychomotricité', 'Orthoptie': 'Orthoptie', 'Technologue en imagerie médicale': 'TIM' };
const r0 = v => (v == null || !Number.isFinite(v) ? null : Math.round(v));
const r2 = v => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);

let MEMO = null;
export function viderFinancements() { MEMO = null; }
/** Le calcul s'il est déjà fait (sinon null) : la route ne bloque pas. Sans synthèse, un tableau vide. */
export function financementsPret() { if (MEMO && Date.now() - MEMO.t < 600e3) return MEMO.d; return syntheseAsbl() ? null : { annees: [], lignes: [] }; }

export function financementsAsbl() {
  if (MEMO && Date.now() - MEMO.t < 600e3) return MEMO.d;
  const S = syntheseAsbl();
  if (!S) return null;
  const annees = [...new Set(S.totaux.exercices.filter(e => e.nature === 'realise').map(e => e.annee))].filter(a => realiseComplet(S.totaux, a)).sort();
  const D = departementsHe();
  const prix = prixHelb().moyen;
  const acad = A => `${Number(A) - 1}-${A}`;
  // Les chiffres de Lucie, par année académique (lourds : une fois chacun).
  const lucie = new Map();
  const anneesLucie = new Set(db.prepare('SELECT DISTINCT annee_scolaire a FROM attribution').all().map(r => r.a));
  const deLucie = a => {
    if (lucie.has(a)) return lucie.get(a);
    if (!anneesLucie.has(a)) { lucie.set(a, null); return null; }   // pas d'attributions cette année-là : rien à calculer
    let c = null; try { c = coutMemo(a); } catch { c = null; }
    const secs = new Map();
    for (const x of c?.sections || []) {
      let e = null; try { e = enseignantsIipCivil(x.section, a); } catch { e = null; }
      secs.set(x.section, { inscrits: x.inscrits || 0, etp: e?.etp ?? null, cout: e?.cout ?? null });
    }
    const v = secs.size ? secs : null; lucie.set(a, v); return v;
  };
  const cursusHe = new Map(COMPARAISON_HE.cursus.map(c => [c.cursus, c]));

  const lignes = [];
  const ajouter = (p, niveau, extra) => {
    const par = {};
    for (const A of annees) { const r = p.ex[`${A}|realise`]; if (r) par[A] = { charges: r.charges, produits: r.produits, resultat: r.resultat, ...(extra ? extra(A) : {}) }; }
    lignes.push({ cle: `${p.bloc}|${p.dept || ''}|${p.poste}`, bloc: p.bloc, dept: p.dept || null, libelle: p.poste, niveau, par });
    return lignes[lignes.length - 1];
  };
  // Les postes de l'exercice le plus récent seulement (les anciens classeurs rangeaient autrement : « Catégorie paramédicale »…),
  // dans l'ordre des blocs, chaque département suivi de ses cursus.
  const der = annees[annees.length - 1];
  const ORDRE = ['ASBL', 'HELB', 'Institut Ilya Prigogine', 'ASBL Administration', 'CREA Formations continues', 'International Relations Office (IRO)', 'Unité de Recherches (UDR)', 'HELB Conseil social'];
  const brut = S.totaux.postes.filter(p => p.ex[`${der}|realise`]);
  const rang = p => { const b = ORDRE.indexOf(p.bloc); return b < 0 ? 99 : b; };
  const deptDe = p => (p.niveau === 1 && /^Département /.test(p.poste) ? p.poste.replace(/^Département /, '') : p.dept);
  const ordreDept = [...new Set(brut.filter(p => p.bloc === 'HELB').map(deptDe).filter(Boolean))];
  const P = brut.map((p, i) => ({ p, i })).sort((x, y) => rang(x.p) - rang(y.p)
    || (ordreDept.indexOf(deptDe(x.p)) + 1 || 0) - (ordreDept.indexOf(deptDe(y.p)) + 1 || 0)
    || x.p.niveau - y.p.niveau || x.i - y.i).map(x => x.p);
  const helbDept = A => {   // { dept: [étudiants, ETP] } de l'année académique
    const o = {}; for (const [d, s] of Object.entries(D.departements)) if (s[acad(A)]) o[d] = s[acad(A)]; return o;
  };
  const ens = etp => (etp ? r0(etp * prix) : null);

  // L'ASBL, toutes lignes : le total d'abord (règle des totaux en tête), puis les blocs dans l'ordre du classeur.
  const tot = P.find(p => p.bloc === 'ASBL');
  const ligneTotal = tot ? ajouter(tot, 0) : null;
  for (const p of P) {
    if (p === tot) continue;
    if (p.bloc === 'HELB') {
      if (p.niveau === 0) {
        ajouter(p, 0, A => { const h = helbDept(A); const e = Object.values(h).reduce((t, v) => t + v[0], 0), t = Object.values(h).reduce((s, v) => s + v[1], 0);
          return e ? { etudiants: r0(e), etp: r2(t), enseignants: ens(t), estime: true } : {}; });
      } else if (p.niveau === 1 && /^Département /.test(p.poste)) {
        const d = DEPT[p.poste.replace(/^Département /, '')];
        ajouter(p, 1, A => { const v = d && helbDept(A)[d]; return v ? { etudiants: r0(v[0]), etp: r2(v[1]), enseignants: ens(v[1]), estime: true } : {}; });
      } else if (p.niveau === 2 && p.dept) {
        const c = cursusHe.get(CURSUS[p.poste]);
        // Un cursus sans charge ni produit au dernier exercice (pas encore ouvert) ne s'affiche pas.
        if (!(p.ex[`${der}|realise`]?.charges || p.ex[`${der}|realise`]?.produits)) continue;
        ajouter(p, 2, A => { const v = c?.series?.[acad(A)]; return v ? { etudiants: r0(v[0]), etp: r2(v[1]), enseignants: ens(v[1]), estime: true } : {}; });
      } else ajouter(p, 1);   // l'administration de la HELB
    } else if (p.bloc === 'Institut Ilya Prigogine') {
      if (p.niveau === 0) {
        ajouter(p, 0, A => { const L = deLucie(acad(A)); if (!L) return {};
          const v = [...L.values()]; return { etudiants: v.reduce((t, x) => t + x.inscrits, 0), etp: r2(v.reduce((t, x) => t + (x.etp || 0), 0)), enseignants: r0(v.reduce((t, x) => t + (x.cout || 0), 0)), federation: true }; });
      } else {
        const code = SECTION_IIP[p.poste];
        ajouter(p, 1, A => { const x = code && deLucie(acad(A))?.get(code); return x ? { etudiants: x.inscrits, etp: x.etp, enseignants: x.cout, federation: true } : {}; });
      }
    } else ajouter(p, p.niveau === 0 ? 0 : 1);
  }
  // Les formations de l'IIP qui n'ont pas de poste dans les comptes (AeSI, ATNUP, FID…) : leurs étudiants et leurs enseignants.
  const iip = lignes.find(l => l.bloc === 'Institut Ilya Prigogine' && l.niveau === 0);
  if (iip) {
    const par = {};
    for (const A of annees) {
      const L = deLucie(acad(A)); if (!L) continue;
      const autres = [...L.entries()].filter(([k]) => !Object.values(SECTION_IIP).includes(k));
      if (autres.length) par[A] = { etudiants: autres.reduce((t, [, x]) => t + x.inscrits, 0), etp: r2(autres.reduce((t, [, x]) => t + (x.etp || 0), 0)),
        enseignants: r0(autres.reduce((t, [, x]) => t + (x.cout || 0), 0)), federation: true, sans_comptes: true, sections: autres.map(([k]) => k) };
    }
    if (Object.keys(par).length) {
      const i = lignes.reduce((k, l, j) => (l.bloc === 'Institut Ilya Prigogine' ? j : k), -1);
      lignes.splice(i + 1, 0, { cle: 'IIP|autres', bloc: 'Institut Ilya Prigogine', dept: null, libelle: 'Autres formations (sans poste dans les comptes)', niveau: 1, par });
    }
  }
  // Le total de l'ASBL : les étudiants et les enseignants des deux écoles.
  if (ligneTotal) for (const A of annees) {
    const h = lignes.find(l => l.bloc === 'HELB' && l.niveau === 0)?.par[A], i = iip?.par[A];
    if (!ligneTotal.par[A]) continue;
    if (h?.etudiants || i?.etudiants) Object.assign(ligneTotal.par[A], { etudiants: (h?.etudiants || 0) + (i?.etudiants || 0), etp: r2((h?.etp || 0) + (i?.etp || 0)),
      enseignants: (h?.enseignants || 0) + (i?.enseignants || 0), federation_part: i?.enseignants || 0 });
  }
  // Le coût complet : les charges des comptes + les enseignants payés par la Fédération (hors comptes).
  for (const l of lignes) for (const v of Object.values(l.par)) {
    const fed = v.federation ? (v.enseignants || 0) : (v.federation_part || 0);
    v.cout_complet = (v.charges || 0) + fed;
  }
  const d = { annees, dernier: annees[annees.length - 1] || null, prix_etp_helb: prix, fichier: S.fichier, source_he: D.source, lignes };
  MEMO = { t: Date.now(), d };
  return d;
}
