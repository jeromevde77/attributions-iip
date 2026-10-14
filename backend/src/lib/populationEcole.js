// ─────────────────────────────────────────────────────────────────────────────
// Lucie — GESTION → POPULATION (3.1.334)
//
// Charles, 14 octobre 2026 : « centraliser les données de pilotage » — sexe, région d'origine,
// nombre par section, nouveaux étudiants, inscrits en année diplômante, « avec de beaux graphes ».
// Tranché le même jour : l'origine = le DOMICILE (code postal) et la NATIONALITÉ ; l'année
// diplômante = le BLOC 3, niveau PRINCIPAL de l'étudiant (celui où il a le plus d'unités).
// Rien n'est recalculé à côté : le profil est celui des chiffres clés (`profil`), la région celle
// du personnel (`regionDuCp`), le primo celui de `lib/primo.js`, le niveau celui de la population
// réelle. L'inscrit est celui des chiffres clés : une inscription dans l'année, hors archivés.
// ─────────────────────────────────────────────────────────────────────────────
import db from '../db/index.js';
import { profil, regionDuCp } from './chiffresCles.js';
import { anciensAvant } from './primo.js';
import { niveauEtudiant } from '../routes/etudiants.js';

const RANG_NIV = { BA1: 1, BA2: 2, BA3: 3 };
function niveauPrincipal(n) {
  if (!n?.niveau) return null;
  if (n.niveau !== 'MIXTE') return n.niveau;
  return Object.entries(n.detail || {})
    .sort((a, b) => b[1] - a[1] || (RANG_NIV[a[0]] || 9) - (RANG_NIV[b[0]] || 9))[0]?.[0] || null;
}

/** Les inscrits d'une année, avec leur section (rattachement, sinon l'unité — hors cursus exclu). */
function inscrits(annee) {
  return db.prepare(`
    SELECT DISTINCT i.etudiant_id AS id,
           COALESCE(e.section_rattachement, (SELECT u.section FROM ue u WHERE u.ue_num = i.ue_num
             AND u.annee_scolaire = i.annee_scolaire AND COALESCE(u.hors_cursus, 0) = 0 LIMIT 1)) AS section
      FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
     WHERE i.annee_scolaire = ? AND COALESCE(e.sortie_statut, '') <> 'archive'`).all(annee);
}
// Un étudiant inscrit dans deux sections compte dans chacune ; l'ensemble le compte une fois.
const premiereSection = lignes => {
  const m = new Map();
  for (const l of lignes) if (!m.has(l.id) || (!m.get(l.id) && l.section)) m.set(l.id, l.section || null);
  return m;
};

const casse = t => String(t || '').trim().toLowerCase().replace(/(^|[\s-])\S/g, c => c.toUpperCase());

function domicile(fiches) {
  const r = { bruxelles: 0, wallonie: 0, flandre: 0, inconnu: 0, communes: {} };
  for (const f of fiches) {
    const cp = String(f.cp || '').replace(/\D/g, '');
    const reg = regionDuCp(cp);
    if (!reg) { r.inconnu++; continue; }
    r[reg]++;
    const nom = `${cp} ${casse(f.localite) || ''}`.trim();
    r.communes[cp] = r.communes[cp] || { cp, nom, n: 0 };
    r.communes[cp].n++;
  }
  r.communes = Object.values(r.communes).sort((a, b) => b.n - a.n);
  return r;
}

export function donneesPopulation(annee, { sections: perim = null, ref = new Date() } = {}) {
  const voit = s => !perim || (s && perim.includes(s));
  const lignes = inscrits(annee).filter(l => voit(l.section));
  const ids = [...new Set(lignes.map(l => l.id))];
  const fiches = new Map(ids.length ? db.prepare(`
    SELECT id, sexe, date_naissance, nationalite, cp, localite FROM etudiant
     WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids).map(f => [f.id, f]) : []);
  const anciens = anciensAvant(annee);
  const niveauDe = id => { try { return niveauPrincipal(niveauEtudiant(id, annee)) || 'sans niveau'; } catch { return 'sans niveau'; } };
  const niveaux = new Map(ids.map(id => [id, niveauDe(id)]));

  const resume = idsGroupe => {
    const fs = idsGroupe.map(id => fiches.get(id)).filter(Boolean);
    const parNiveau = {};
    for (const id of idsGroupe) parNiveau[niveaux.get(id)] = (parNiveau[niveaux.get(id)] || 0) + 1;
    return {
      ...profil(fs, ref),
      primo: idsGroupe.filter(id => !anciens.has(id)).length,
      ba3: idsGroupe.filter(id => niveaux.get(id) === 'BA3').length,
      par_niveau: parNiveau,
      domicile: domicile(fs),
    };
  };

  const parSection = new Map();
  for (const l of lignes) {
    const s = l.section || '(sans section)';
    if (!parSection.has(s)) parSection.set(s, new Set());
    parSection.get(s).add(l.id);
  }
  const sections = [...parSection.entries()]
    .map(([section, set]) => ({ section, ...resume([...set]) }))
    .sort((a, b) => b.n - a.n || a.section.localeCompare(b.section, 'fr'));

  // L'ÉVOLUTION — les inscrits par section sur les cinq dernières années (l'AEQES les demande sur
  // cinq ans), et les primo de chaque année.
  const annees = db.prepare(`SELECT DISTINCT annee_scolaire AS a FROM etudiant_inscription
    WHERE annee_scolaire <= ? ORDER BY 1 DESC LIMIT 5`).all(annee).map(x => x.a).reverse();
  const evolution = annees.map(a => {
    const ls = inscrits(a).filter(l => voit(l.section));
    const ps = premiereSection(ls);
    const anc = anciensAvant(a);
    const parS = {};
    for (const l of ls) { const s = l.section || '(sans section)'; parS[s] = (parS[s] || new Set()).add(l.id); }
    return { annee: a, total: ps.size, primo: [...ps.keys()].filter(id => !anc.has(id)).length,
      par_section: Object.fromEntries(Object.entries(parS).map(([s, set]) => [s, set.size])) };
  });

  return { annee, ref: ref.toISOString().slice(0, 10), ensemble: resume(ids), sections, evolution };
}
