// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Les chiffres clés par section (conseil d'entreprise, AEQES)
//
// (Charles, 6 octobre 2026 : « je dois donner des infos au conseil
// d'entreprise sur les ETP, le nombre d'étudiants, les UE… par nationalité ».)
// L'année en cours, au jour de l'impression. Chaque donnée PERSONNELLE dit son
// taux de remplissage : une répartition calculée sur un cinquième des fiches
// ne se présente pas comme celle de tous — elle dit d'abord combien elle en
// connaît. Les ETP sont ceux de Pilotage (calculerEtp), repris et non
// recalculés : deux formules pour une même grandeur donneraient deux chiffres.
// ─────────────────────────────────────────────────────────────────────────────
import db from '../db/index.js';
import { versDate } from './versDate.js';
import { calculerEtp } from '../routes/pilotage.js';

const nu = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
// Les vingt-sept, tels que la liste des pays (lib/pays.js) les écrit.
const UE27 = new Set(['allemagne', 'autriche', 'belgique', 'bulgarie', 'chypre', 'croatie', 'danemark',
  'espagne', 'estonie', 'finlande', 'france', 'grece', 'hongrie', 'irlande', 'italie', 'lettonie',
  'lituanie', 'luxembourg', 'malte', 'paysbas', 'pologne', 'portugal', 'tchequie', 'republiquetcheque',
  'roumanie', 'slovaquie', 'slovenie', 'suede'].map(nu));
export function zoneNationalite(n) {
  const v = nu(n);
  if (!v) return null;
  if (v.startsWith('belg')) return 'be';
  return UE27.has(v) ? 'ue' : 'hors_ue';
}

function age(dateNaissance, ref) {
  const d = versDate(dateNaissance);
  if (!d) return null;
  const [a, m, j] = d.split('-').map(Number);
  let n = ref.getFullYear() - a;
  if (ref.getMonth() + 1 < m || (ref.getMonth() + 1 === m && ref.getDate() < j)) n--;
  return n >= 14 && n <= 100 ? n : null;
}
const tranche = n => (n < 25 ? 'm25' : n < 35 ? 'm35' : n < 45 ? 'm45' : 'p45');

/** Un profil (sexe, âge, nationalité) compté sur une liste de personnes. */
export function profil(personnes, ref) {
  const r = { n: personnes.length, F: 0, M: 0, X: 0, sexe_inconnu: 0,
    ages: [], m25: 0, m35: 0, m45: 0, p45: 0, age_inconnu: 0,
    be: 0, ue: 0, hors_ue: 0, nat_inconnue: 0, pays: {} };
  for (const p of personnes) {
    const s = String(p.sexe || '').toUpperCase();
    if (s === 'F' || s === 'M' || s === 'X') r[s]++; else r.sexe_inconnu++;
    const a = age(p.date_naissance, ref);
    if (a == null) r.age_inconnu++; else { r.ages.push(a); r[tranche(a)]++; }
    const z = zoneNationalite(p.nationalite);
    if (!z) r.nat_inconnue++;
    else {
      r[z]++;
      const nom = /^belg/i.test(String(p.nationalite).trim()) ? 'Belgique' : String(p.nationalite).trim();
      r.pays[nom] = (r.pays[nom] || 0) + 1;
    }
  }
  r.age_moyen = r.ages.length ? r.ages.reduce((a, b) => a + b, 0) / r.ages.length : null;
  delete r.ages;
  return r;
}

export function donneesChiffresCles(annee, ref = new Date()) {
  // ── Les étudiants : la section se lit comme partout (rattachement, sinon
  //    l'unité, les unités hors cursus n'en donnant aucune).
  const ins = db.prepare(`
    SELECT DISTINCT i.etudiant_id AS id,
           COALESCE(e.section_rattachement, (SELECT u.section FROM ue u WHERE u.ue_num = i.ue_num
             AND u.annee_scolaire = i.annee_scolaire AND COALESCE(u.hors_cursus, 0) = 0 LIMIT 1)) AS section
      FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
     WHERE i.annee_scolaire = ?`).all(annee);
  const fiches = new Map(db.prepare(`
    SELECT e.id, e.sexe, e.date_naissance, e.nationalite, e.titre_acces, e.diplome_max,
           COALESCE(e.sejour_limite_etudes, 0) AS sle
      FROM etudiant e WHERE e.id IN (SELECT etudiant_id FROM etudiant_inscription WHERE annee_scolaire = ?)`)
    .all(annee).map(f => [f.id, f]));
  const etuParSection = new Map();
  for (const l of ins) {
    const s = l.section || '(sans section)';
    if (!etuParSection.has(s)) etuParSection.set(s, new Map());
    const f = fiches.get(l.id); if (f) etuParSection.get(s).set(l.id, f);
  }

  // ── Le personnel : qui porte une attribution dans la section cette année.
  const attr = db.prepare(`
    SELECT DISTINCT a.section, a.professeur_id AS id, a.contrat_mdp AS contrat
      FROM attribution a WHERE a.annee_scolaire = ? AND a.professeur_id IS NOT NULL`).all(annee);
  const profs = new Map(db.prepare(`SELECT id, statut, sexe, date_naissance, nationalite,
      (SELECT COUNT(*) FROM titre_capacite t WHERE t.professeur_id = professeur.id) AS nb_titres FROM professeur`)
    .all().map(p => [p.id, p]));
  const persParSection = new Map();
  for (const a of attr) {
    const s = a.section || '(sans section)';
    if (!persParSection.has(s)) persParSection.set(s, new Map());
    const m = persParSection.get(s);
    const p = profs.get(a.id); if (!p) continue;
    const deja = m.get(a.id);
    m.set(a.id, { ...p, iip: (deja?.iip || false) || a.contrat !== 'HELB', helb: (deja?.helb || false) || a.contrat === 'HELB' });
  }

  // ── Les ETP de Pilotage.
  let etp = {};
  try { for (const x of calculerEtp(annee).sections || []) etp[x.section] = x; } catch { etp = {}; }

  // ── L'offre : unités et périodes (activités Z exclues — sans enseignant).
  const offre = new Map(db.prepare(`
    SELECT u.section, COUNT(DISTINCT u.ue_num) AS ues,
           (SELECT COUNT(*) FROM cours c WHERE c.annee_scolaire = u.annee_scolaire AND c.ue_num IN
              (SELECT ue_num FROM ue u2 WHERE u2.section = u.section AND u2.annee_scolaire = u.annee_scolaire)) AS cours,
           (SELECT COALESCE(SUM(CASE WHEN c.ct_pp = 'Z' THEN 0 ELSE c.cours_per END), 0) FROM cours c
             WHERE c.annee_scolaire = u.annee_scolaire AND c.ue_num IN
              (SELECT ue_num FROM ue u2 WHERE u2.section = u.section AND u2.annee_scolaire = u.annee_scolaire)) AS periodes
      FROM ue u WHERE u.annee_scolaire = ? GROUP BY u.section`).all(annee).map(o => [o.section, o]));

  const sections = [...new Set([...etuParSection.keys(), ...persParSection.keys()])]
    .sort((a, b) => (etuParSection.get(b)?.size || 0) - (etuParSection.get(a)?.size || 0) || a.localeCompare(b, 'fr'));

  const diplomes = list => {
    const r = { acces: {}, max: {}, acces_connu: 0, max_connu: 0 };
    for (const f of list) {
      if (f.titre_acces) { r.acces[f.titre_acces] = (r.acces[f.titre_acces] || 0) + 1; r.acces_connu++; }
      if (f.diplome_max) { r.max[f.diplome_max] = (r.max[f.diplome_max] || 0) + 1; r.max_connu++; }
    }
    return r;
  };

  const lignes = sections.map(section => {
    const etus = [...(etuParSection.get(section)?.values() || [])];
    const pers = [...(persParSection.get(section)?.values() || [])];
    const e = etp[section] || {};
    const o = offre.get(section) || {};
    return {
      section,
      etudiants: { ...profil(etus, ref), sle: etus.filter(f => f.sle).length, ...diplomes(etus) },
      personnel: { ...profil(pers, ref),
        cc: pers.filter(p => p.statut === 'CC').length, exp: pers.filter(p => p.statut === 'EXP').length,
        iip: pers.filter(p => p.iip).length, helb: pers.filter(p => p.helb).length,
        avec_titres: pers.filter(p => p.nb_titres > 0).length },
      etp: e.etp_total ?? null, etp_iip: e.etp_iip ?? null, etp_helb: e.etp_helb ?? null,
      ues: o.ues || 0, cours: o.cours || 0, periodes: o.periodes || 0,
    };
  });

  // L'ensemble : chaque personne une fois, même inscrite ou attribuée dans deux sections.
  const tousEtus = [...new Map(ins.map(l => [l.id, fiches.get(l.id)])).values()].filter(Boolean);
  const tousPers = [...new Map(attr.map(a => [a.id, profs.get(a.id)])).values()].filter(Boolean);
  let etpTotal = null;
  try { etpTotal = calculerEtp(annee).total?.etp_total ?? null; } catch { /* */ }
  return {
    annee, ref: ref.toISOString().slice(0, 10), lignes,
    ensemble: {
      etudiants: { ...profil(tousEtus, ref), sle: tousEtus.filter(f => f.sle).length, ...diplomes(tousEtus) },
      personnel: { ...profil(tousPers, ref), cc: tousPers.filter(p => p.statut === 'CC').length,
        exp: tousPers.filter(p => p.statut === 'EXP').length,
        avec_titres: tousPers.filter(p => p.nb_titres > 0).length },
      etp: etpTotal,
      ues: lignes.reduce((s, l) => s + l.ues, 0), periodes: lignes.reduce((s, l) => s + l.periodes, 0),
    },
  };
}

/* ─── LE PERSONNEL (Charles, 6 octobre 2026 : « je veux les statistiques pour
   les profs »). Une ligne par membre attribué cette année ; sa charge est la
   somme de ses attributions, au barème de Pilotage (CT/800 + PP/1000), lue
   dans la même vue que la synthèse de charge. ─── */
const regionDuCp = cp => {
  const n = Number(String(cp || '').replace(/\D/g, ''));
  if (!n || String(cp).replace(/\D/g, '').length !== 4) return null;
  if (n >= 1000 && n <= 1299) return 'bruxelles';
  if ((n >= 1300 && n <= 1499) || (n >= 4000 && n <= 7999)) return 'wallonie';
  return 'flandre';
};
export const TRANCHES_ETP = [
  ['t1', 'moins de 0,10', 0, 0.1], ['t2', '0,10 à 0,25', 0.1, 0.25], ['t3', '0,25 à 0,50', 0.25, 0.5],
  ['t4', '0,50 à 0,75', 0.5, 0.75], ['t5', '0,75 et plus', 0.75, Infinity],
];

export function donneesPersonnel(annee, ref = new Date()) {
  const lignes = db.prepare(`
    SELECT professeur_id AS id, section, contrat_mdp AS contrat,
           SUM(CASE WHEN type_cours = 'PP' THEN total_attribue_professeur / 1000.0
                    ELSE total_attribue_professeur / 800.0 END) AS etp
      FROM v_attribution_complete
     WHERE annee_scolaire = ? AND professeur_id IS NOT NULL
     GROUP BY professeur_id, section, contrat_mdp`).all(annee);
  const fiches = new Map(db.prepare(`SELECT id, statut, statut_nomination, type_personnel, sexe, date_naissance,
      nationalite, code_postal, capaes, (SELECT COUNT(*) FROM titre_capacite t WHERE t.professeur_id = professeur.id) AS nb_titres
      FROM professeur`).all().map(p => [p.id, p]));
  const parPersonne = new Map();
  for (const l of lignes) {
    const f = fiches.get(l.id); if (!f) continue;
    const x = parPersonne.get(l.id) || { ...f, etp: 0, sections: new Set(), iip: false, helb: false };
    x.etp += Number(l.etp) || 0;
    if (l.section) x.sections.add(l.section);
    if (l.contrat === 'HELB') x.helb = true; else x.iip = true;
    parPersonne.set(l.id, x);
  }
  const tous = [...parPersonne.values()];
  const compter = (liste) => {
    const r = profil(liste, ref);
    r.etp = liste.reduce((t, x) => t + x.etp, 0);
    r.cc = liste.filter(x => x.statut === 'CC').length;
    r.exp = liste.filter(x => x.statut === 'EXP').length;
    r.autre_statut = r.n - r.cc - r.exp;
    r.definitif = liste.filter(x => /^defin|^défin/i.test(x.statut_nomination || '')).length;
    r.temporaire = liste.filter(x => /^tempo/i.test(x.statut_nomination || '')).length;
    r.iip = liste.filter(x => x.iip).length; r.helb = liste.filter(x => x.helb).length;
    r.enseignant = liste.filter(x => (x.type_personnel || 'enseignant') === 'enseignant').length;
    r.capaes = liste.filter(x => String(x.capaes || '').trim() && !/^(non|0|n)$/i.test(String(x.capaes).trim())).length;
    r.avec_titres = liste.filter(x => x.nb_titres > 0).length;
    r.bruxelles = 0; r.wallonie = 0; r.flandre = 0; r.domicile_inconnu = 0;
    for (const x of liste) { const g = regionDuCp(x.code_postal); if (g) r[g]++; else r.domicile_inconnu++; }
    for (const [k, , min, max] of TRANCHES_ETP) {
      const dans = liste.filter(x => x.etp >= min && x.etp < max);
      r[k] = dans.length; r[k + '_etp'] = dans.reduce((t, x) => t + x.etp, 0);
    }
    return r;
  };
  const sections = [...new Set(tous.flatMap(x => [...x.sections]))].sort((a, b) => a.localeCompare(b, 'fr'));
  return {
    annee, ref: ref.toISOString().slice(0, 10),
    ensemble: compter(tous),
    sections: sections.map(s => ({ section: s, ...compter(tous.filter(x => x.sections.has(s))),
      // La charge DANS la section, et non la charge totale de ceux qui y passent.
      etp_section: lignes.filter(l => l.section === s).reduce((t, l) => t + (Number(l.etp) || 0), 0) })),
  };
}
