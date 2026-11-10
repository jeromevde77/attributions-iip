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
import { readFileSync } from 'node:fs';
import db from '../db/index.js';
import { situationsDeLAnnee } from './situationPro.js';
import { TITRES_ACCES, SITUATIONS_PRO } from './profilEtudiant.js';
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
  // LE CHIFFRE SE CORRIGE, ET L'ORIGINAL RESTE (Charles, 14 octobre 2026 : « je veux pouvoir éditer
  // ces données ; si c'est le cas, on mettrait en italique, pour raison scientifique »). La valeur
  // de la source est gardée à côté ; tout changement s'écrit au journal, en ajout seul.
  const cols = db.prepare('PRAGMA table_info(inscrits_reference)').all().map(c => c.name);
  if (!cols.includes('total_origine')) {
    db.exec('ALTER TABLE inscrits_reference ADD COLUMN total_origine INTEGER');
    db.exec('ALTER TABLE inscrits_reference ADD COLUMN modifie_par TEXT');
    db.exec('ALTER TABLE inscrits_reference ADD COLUMN modifie_le TEXT');
    db.exec('UPDATE inscrits_reference SET total_origine = total');
  }
  db.exec(`CREATE TABLE IF NOT EXISTS inscrits_reference_journal (
    id INTEGER PRIMARY KEY AUTOINCREMENT, annee_scolaire TEXT NOT NULL, section TEXT NOT NULL,
    avant INTEGER, apres INTEGER, motif TEXT, fait_par TEXT, fait_le TEXT DEFAULT CURRENT_TIMESTAMP)`);
} catch (e) { console.error('[migration] inscrits_reference :', e.message); }

/** Corriger (ou ajouter) un chiffre de référence. `total` vide efface une case ajoutée à la main. */
export function corrigerReference({ annee, section, total, motif }, par) {
  if (!/^\d{4}-\d{4}$/.test(String(annee || ''))) throw Object.assign(new Error('Année scolaire attendue.'), { status: 400 });
  const sec = String(section || '').trim();
  if (!sec) throw Object.assign(new Error('Section attendue.'), { status: 400 });
  const vide = total === '' || total == null;
  const n = vide ? null : Number(total);
  if (!vide && (!Number.isInteger(n) || n < 0)) throw Object.assign(new Error('Un nombre entier d’inscrits, zéro ou plus.'), { status: 400 });
  const avant = db.prepare('SELECT * FROM inscrits_reference WHERE annee_scolaire = ? AND section = ?').get(annee, sec);
  db.transaction(() => {
    if (vide) {
      if (avant && avant.total_origine != null) throw Object.assign(new Error('Un chiffre de la source ne s’efface pas : corrigez-le.'), { status: 400 });
      db.prepare('DELETE FROM inscrits_reference WHERE annee_scolaire = ? AND section = ?').run(annee, sec);
    } else if (avant) {
      db.prepare(`UPDATE inscrits_reference SET total = ?, modifie_par = ?, modifie_le = CURRENT_TIMESTAMP
        WHERE annee_scolaire = ? AND section = ?`).run(n, par, annee, sec);
    } else {
      db.prepare(`INSERT INTO inscrits_reference (annee_scolaire, section, total, total_origine, source, modifie_par, modifie_le)
        VALUES (?, ?, ?, NULL, 'ajouté dans Lucie', ?, CURRENT_TIMESTAMP)`).run(annee, sec, n, par);
    }
    db.prepare(`INSERT INTO inscrits_reference_journal (annee_scolaire, section, avant, apres, motif, fait_par)
      VALUES (?, ?, ?, ?, ?, ?)`).run(annee, sec, avant?.total ?? null, n, String(motif || '').trim() || null, par);
  })();
}

const RANG_NIV = { BA1: 1, BA2: 2, BA3: 3 };
function niveauPrincipal(n) {
  if (!n?.niveau) return null;
  if (n.niveau !== 'MIXTE') return n.niveau;
  return Object.entries(n.detail || {})
    .sort((a, b) => b[1] - a[1] || (RANG_NIV[a[0]] || 9) - (RANG_NIV[b[0]] || 9))[0]?.[0] || null;
}

/** Les inscrits d'une année, avec leur section (rattachement, sinon l'unité — hors cursus exclu). */
/* LE SECOND CURSUS COMPTE AUSSI (3.1.390, Charles, 16 octobre 2026 : « tu ne les comptes pas » — Optique
   « — » en 2026-2027 pour 59 opticiens). Une inscription compte dans la section de rattachement quand l'UE
   en fait partie (tronc commun compris, ou UE hors cursus) ; sinon dans la section de l'UE — l'opticien
   rattaché à Optométrie compte donc dans les deux. L'école le compte toujours une fois. */
export function inscrits(annee) {
  return db.prepare(`
    SELECT DISTINCT x.id, x.section FROM (
      SELECT i.etudiant_id AS id,
        CASE WHEN e.section_rattachement IS NOT NULL AND (
               EXISTS (SELECT 1 FROM ue u WHERE u.ue_num = i.ue_num AND u.annee_scolaire = i.annee_scolaire
                        AND (u.section = e.section_rattachement OR COALESCE(u.hors_cursus, 0) = 1))
            OR EXISTS (SELECT 1 FROM ue_section us WHERE us.ue_num = i.ue_num AND us.annee_scolaire = i.annee_scolaire
                        AND us.section_code = e.section_rattachement)
            OR NOT EXISTS (SELECT 1 FROM ue u WHERE u.ue_num = i.ue_num AND u.annee_scolaire = i.annee_scolaire AND u.section IS NOT NULL))
          THEN e.section_rattachement
          ELSE COALESCE((SELECT u.section FROM ue u WHERE u.ue_num = i.ue_num AND u.annee_scolaire = i.annee_scolaire
                 AND COALESCE(u.hors_cursus, 0) = 0 LIMIT 1), e.section_rattachement) END AS section
        FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
       WHERE i.annee_scolaire = ? AND COALESCE(e.sortie_statut, '') <> 'archive') x`).all(annee);
}
// Un étudiant inscrit dans deux sections compte dans chacune ; l'ensemble le compte une fois.
const premiereSection = lignes => {
  const m = new Map();
  for (const l of lignes) if (!m.has(l.id) || (!m.get(l.id) && l.section)) m.set(l.id, l.section || null);
  return m;
};

const casse = t => String(t || '').trim().toLowerCase().replace(/(^|[\s-])\S/g, c => c.toUpperCase());

/* LA CARTE DES COMMUNES (3.5.289, Charles : « une carte des communes concernées avec des couleurs en dégradé en fonction des
   chiffres ») : chaque code postal belge se rattache à SA commune (code REFNIS de Statbel) par la liste des codes postaux de bpost
   (donnees/cp-nis.json) ; l'écran dessine les communes (public/carte/communes-be.json, contours Statbel 2026). */
let CP_NIS = null;
function cpNis() {
  if (CP_NIS) return CP_NIS;
  try { CP_NIS = JSON.parse(readFileSync(new URL('../donnees/cp-nis.json', import.meta.url), 'utf-8')); } catch (e) { console.error('[carte] codes postaux :', e.message); CP_NIS = {}; }
  return CP_NIS;
}
function domicile(fiches) {
  const r = { bruxelles: 0, wallonie: 0, flandre: 0, inconnu: 0, communes: {}, par_nis: {} };
  for (const f of fiches) {
    const cp = String(f.cp || '').replace(/\D/g, '');
    const reg = regionDuCp(cp);
    if (!reg) { r.inconnu++; continue; }
    r[reg]++;
    // « 1020 1020 Bruxelles » : la localité porte parfois déjà le code postal (import) — on ne l'écrit qu'une fois.
    const nom = `${cp} ${casse(String(f.localite || '').replace(new RegExp(`^\\s*${cp}\\s*`), '')) || ''}`.trim();
    r.communes[cp] = r.communes[cp] || { cp, nom, n: 0 };
    r.communes[cp].n++;
    const nis = cpNis()[cp.padStart(4, '0')];
    if (nis) r.par_nis[nis] = (r.par_nis[nis] || 0) + 1;
  }
  r.communes = Object.values(r.communes).sort((a, b) => b.n - a.n);
  return r;
}

export function donneesPopulation(annee, { sections: perim = null, ref = new Date(), sle = 'compris', nouveaux = false, section = null } = {}) {
  const voit = s => !perim || (s && perim.includes(s));
  // SLE COMPRIS OU EXCLUS (3.5.290, Charles : « s'ils sont SLE, ils sont dedans ? il faudrait pouvoir faire SLE compris et
  // exclus ») : le choix vaut pour toute la page de l'année (pas pour l'évolution, faite de chiffres de référence).
  let sles = new Set();
  try { sles = new Set(db.prepare('SELECT id FROM etudiant WHERE COALESCE(sejour_limite_etudes, 0) = 1').all().map(x => x.id)); } catch { /* colonne absente */ }
  const tousLesInscrits = inscrits(annee).filter(l => voit(l.section));
  const nbSle = new Set(tousLesInscrits.filter(l => sles.has(l.id)).map(l => l.id)).size;
  // TOUS OU NOUVEAUX (3.5.292, d'après la page de la HELB) : les nouveaux = aucune inscription ni valorisation avant l'année.
  const anciensAnnee = anciensAvant(annee);
  const garder = (l, anc) => (sle !== 'exclus' || !sles.has(l.id)) && (!nouveaux || !anc.has(l.id));
  const lignes = tousLesInscrits.filter(l => garder(l, anciensAnnee));
  const ids = [...new Set(lignes.map(l => l.id))];
  const fiches = new Map(ids.length ? db.prepare(`
    SELECT id, sexe, date_naissance, nationalite, cp, localite, titre_acces FROM etudiant
     WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids).map(f => [f.id, f]) : []);
  const anciens = anciensAvant(annee);
  const niveauDe = id => { try { return niveauPrincipal(niveauEtudiant(id, annee)) || 'sans niveau'; } catch { return 'sans niveau'; } };
  const niveaux = new Map(ids.map(id => [id, niveauDe(id)]));

  // LE TITRE D'ACCÈS ET LA SITUATION PROFESSIONNELLE (3.5.287, Charles : « le type de titre d'entrée par section, et aussi si
  // chômeur, travailleur… ») : le titre se lit sur la fiche, la situation dans celle de L'ANNÉE.
  const situations = situationsDeLAnnee(annee);
  const repartir = (idsG, de) => { const r = {}; let connu = 0; for (const id of idsG) { const v = de(id); if (v) { r[v] = (r[v] || 0) + 1; connu++; } } return { r, connu }; };
  const resume = idsGroupe => {
    const fs = idsGroupe.map(id => fiches.get(id)).filter(Boolean);
    const ac = repartir(idsGroupe, id => fiches.get(id)?.titre_acces || null);
    const si = repartir(idsGroupe, id => situations[id] || null);
    const parNiveau = {};
    for (const id of idsGroupe) parNiveau[niveaux.get(id)] = (parNiveau[niveaux.get(id)] || 0) + 1;
    return {
      ...profil(fs, ref),
      primo: idsGroupe.filter(id => !anciens.has(id)).length,
      ba3: idsGroupe.filter(id => niveaux.get(id) === 'BA3').length,
      par_niveau: parNiveau,
      domicile: domicile(fs),
      acces: ac.r, acces_connu: ac.connu, situation: si.r, situation_connue: si.connu,
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
        // Ce qui n'est plus le chiffre de la source : en italique à l'écran.
        modifies: Object.fromEntries(rs.filter(r => r.total_origine == null || r.total !== r.total_origine)
          .map(r => [r.section, { origine: r.total_origine, par: r.modifie_par, le: r.modifie_le }])),
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

  /* TROIS ANNÉES CÔTE À CÔTE (3.5.292, d'après la page de la HELB « Domicile à Bruxelles des nouveaux étudiants ») : le domicile par
     commune des inscrits de chacune des trois années — les mêmes filtres (section, SLE, nouveaux). L'adresse est celle de la fiche
     AUJOURD'HUI : Lucie ne garde pas l'adresse de chaque année. */
  const [a0] = String(annee).split('-').map(Number);
  const par_annee = [a0 - 2, a0 - 1, a0].map(y => {
    const a = `${y}-${y + 1}`;
    const ls = (a === annee ? lignes : inscrits(a).filter(l => voit(l.section) && garder(l, anciensAvant(a)))).filter(l => !section || l.section === section);
    const idsA = [...new Set(ls.map(l => l.id))];
    if (!idsA.length) return { annee: a, n: 0, domicile: null };
    const fsA = db.prepare(`SELECT id, cp, localite FROM etudiant WHERE id IN (${idsA.map(() => '?').join(',')})`).all(...idsA);
    return { annee: a, n: idsA.length, domicile: domicile(fsA) };
  });
  return { annee, ref: ref.toISOString().slice(0, 10), ensemble: resume(ids), sections, evolution, par_annee, nouveaux,
    sle, sle_nombre: nbSle,
    listes: { acces: TITRES_ACCES, situations: SITUATIONS_PRO } };
}
