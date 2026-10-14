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


/* LES CHIFFRES DE RÉFÉRENCE DES ANNÉES PASSÉES (Charles, 14 octobre 2026 : « pour les années
 * antérieures, voici les données que j'ai — il faudrait les intégrer pour avoir des comparaisons »).
 * Lucie n'a qu'une partie de l'historique : compter ses inscriptions de 2023-2024 donnerait 79
 * étudiants là où l'école en avait 398. Pour une année qui a ses chiffres de référence, ce sont eux
 * qui font foi ; l'année que Lucie porte entière se compte dans Lucie. Repris UNE FOIS du classeur
 * de la direction (Evolution_chiffres.xlsx) — [année, section, BA1, suite, total, note] —, dans
 * une table qui se corrige ensuite sans déploiement. */
const REPRISE_EVOLUTION = [
  ["2019-2020", "Optométrie", 41, 23, 64, null],
  ["2020-2021", "Optométrie", 42, 36, 78, null],
  ["2021-2022", "Optométrie", null, null, 63, null],
  ["2022-2023", "Optométrie", 45, 44, 89, null],
  ["2023-2024", "Optométrie", 32, 33, 65, null],
  ["2024-2025", "Optométrie", 50, 27, 77, null],
  ["2025-2026", "Optométrie", 49, 39, 88, null],
  ["2019-2020", "Optique", null, null, 64, "astérisque dans le classeur"],
  ["2020-2021", "Optique", null, null, 1, null],
  ["2021-2022", "Optique", null, null, 4, null],
  ["2022-2023", "Optique", null, null, 22, null],
  ["2023-2024", "Optique", null, null, 34, null],
  ["2024-2025", "Optique", null, null, 28, null],
  ["2025-2026", "Optique", null, null, 18, null],
  ["2019-2020", "Orthoptie", 17, null, 17, null],
  ["2020-2021", "Orthoptie", 18, 18, 36, null],
  ["2021-2022", "Orthoptie", null, null, 90, null],
  ["2022-2023", "Orthoptie", 51, 69, 120, null],
  ["2023-2024", "Orthoptie", 57, 54, 111, null],
  ["2024-2025", "Orthoptie", 74, 51, 125, null],
  ["2025-2026", "Orthoptie", 60, 50, 110, null],
  ["2019-2020", "Psychomotricité", 55, 30, 85, null],
  ["2020-2021", "Psychomotricité", 37, 36, 73, null],
  ["2021-2022", "Psychomotricité", null, null, 89, null],
  ["2022-2023", "Psychomotricité", 38, 32, 70, null],
  ["2023-2024", "Psychomotricité", 48, 24, 72, null],
  ["2024-2025", "Psychomotricité", 55, 33, 88, null],
  ["2025-2026", "Psychomotricité", 52, 54, 106, null],
  ["2023-2024", "TIM", 116, null, 116, null],
  ["2024-2025", "TIM", 106, 94, 200, null],
  ["2025-2026", "TIM", 133, 133, 266, null],
  ["2021-2022", "ATNUP", null, null, 16, null],
  ["2022-2023", "ATNUP", null, null, 43, null],
  ["2023-2024", "ATNUP", null, null, 45, null],
  ["2021-2022", "Aide-soignants", null, null, 17, null],
  ["2022-2023", "Aide-soignants", null, null, 15, null],
  ["2023-2024", "Aide-soignants", null, null, 14, null],
  ["2021-2022", "RESTART", null, null, 5, null],
  ["2022-2023", "RESTART", null, null, 7, null],
  ["2023-2024", "RESTART", null, null, 11, null],
  ["2022-2023", "Soins_plaies", null, null, 30, null],
  ["2023-2024", "Soins_plaies", null, null, 35, null],
  ["2021-2022", "FID", null, null, 22, null],
  ["2022-2023", "FID", null, null, 21, null],
  ["2023-2024", "FID", null, null, 59, null]
];
try {
  db.exec(`CREATE TABLE IF NOT EXISTS inscrits_reference (
    annee_scolaire TEXT NOT NULL, section TEXT NOT NULL,
    ba1 INTEGER, suite INTEGER, total INTEGER NOT NULL, note TEXT, source TEXT,
    maj_le TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (annee_scolaire, section))`);
  if (!db.prepare('SELECT 1 FROM inscrits_reference LIMIT 1').get()) {
    const ins = db.prepare(`INSERT OR IGNORE INTO inscrits_reference (annee_scolaire, section, ba1, suite, total, note, source)
      VALUES (?, ?, ?, ?, ?, ?, 'Evolution_chiffres.xlsx (direction)')`);
    db.transaction(() => { for (const l of REPRISE_EVOLUTION) ins.run(...l); })();
    console.log(`[migration] inscrits_reference : ${REPRISE_EVOLUTION.length} lignes reprises`);
  }
} catch (e) { console.error('[migration] inscrits_reference :', e.message); }

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

  // L'ÉVOLUTION — une année qui a ses chiffres de référence se lit dans eux ; les autres, dans les
  // inscriptions de Lucie (avec les nouveaux de chaque année).
  let reference = [];
  try { reference = db.prepare('SELECT * FROM inscrits_reference WHERE annee_scolaire <= ?').all(annee); } catch { /* table absente */ }
  const anneesRef = new Set(reference.map(r => r.annee_scolaire));
  const anneesLucie = db.prepare(`SELECT DISTINCT annee_scolaire AS a FROM etudiant_inscription
    WHERE annee_scolaire <= ? ORDER BY 1`).all(annee).map(x => x.a).filter(a => !anneesRef.has(a));
  const evolution = [...anneesRef, ...anneesLucie].sort().map(a => {
    if (anneesRef.has(a)) {
      const rs = reference.filter(r => r.annee_scolaire === a && voit(r.section));
      const ba1 = rs.reduce((t, r) => t + (r.ba1 || 0), 0);
      return { annee: a, source: 'reference', total: rs.reduce((t, r) => t + r.total, 0),
        primo: null, ba1: rs.some(r => r.ba1 != null) ? ba1 : null,
        par_section: Object.fromEntries(rs.map(r => [r.section, r.total])),
        notes: rs.filter(r => r.note).map(r => `${r.section} : ${r.note}`) };
    }
    const ls = inscrits(a).filter(l => voit(l.section));
    const ps = premiereSection(ls);
    const anc = anciensAvant(a);
    const parS = {};
    for (const l of ls) { const s = l.section || '(sans section)'; parS[s] = (parS[s] || new Set()).add(l.id); }
    return { annee: a, source: 'lucie', total: ps.size, primo: [...ps.keys()].filter(id => !anc.has(id)).length, ba1: null,
      par_section: Object.fromEntries(Object.entries(parS).map(([s, set]) => [s, set.size])) };
  });

  return { annee, ref: ref.toISOString().slice(0, 10), ensemble: resume(ids), sections, evolution };
}
