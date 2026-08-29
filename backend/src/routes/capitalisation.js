// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Schéma de capitalisation
//
// Les prérequis (ue_prerequis) sont la structure stable d'une section : ils ne
// changent pas d'une année à l'autre. En revanche, l'année d'études dans
// laquelle une UE est placée (BA1, BA2, BA3) relève de l'organisation et peut
// évoluer, du moment que les prérequis restent respectés.
//
// Ce module stocke cette affectation par section et par année scolaire, en
// surcharge du niveau porté par le référentiel UE (ue.ue_niv), et expose la
// structure de la section sous forme de graphe (nœuds + arêtes).
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import db from '../db/index.js';
import { anneeDeTravail, anneeActiveEnBase } from '../helpers/annee.js';
import { authRequired, roleRequired } from '../middleware/auth.js';

const r = Router();

export function migrerCapitalisation(dbx) {
  try {
    dbx.exec(`
    CREATE TABLE IF NOT EXISTS ue_niveau_section (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      section        TEXT NOT NULL,
      annee_scolaire TEXT NOT NULL,
      ue_num         INTEGER NOT NULL,
      niveau         TEXT NOT NULL,
      maj_le         TEXT DEFAULT (datetime('now')),
      UNIQUE(section, annee_scolaire, ue_num)
    );
    CREATE INDEX IF NOT EXISTS idx_ue_niveau_section
      ON ue_niveau_section(section, annee_scolaire);
    `);
    console.log('[migration] ue_niveau_section créée');
  } catch (e) { console.error('[migration] ue_niveau_section :', e.message); }
}

// Niveau effectif d'une UE dans une section : surcharge si elle existe,
// sinon le niveau du référentiel UE.
export function niveauxEffectifs(sections, annee) {
  const map = {};
  if (!sections?.length) return map;
  const ph = sections.map(() => '?').join(',');
  const anneeRef = anneeActiveEnBase() || annee;

  for (const u of db.prepare(`
    SELECT ue_num, MIN(ue_niv) AS ue_niv FROM ue
    WHERE annee_scolaire = ? AND section IN (${ph}) GROUP BY ue_num
  `).all(anneeRef, ...sections)) {
    map[u.ue_num] = (u.ue_niv || '').toUpperCase();
  }
  for (const o of db.prepare(`
    SELECT ue_num, niveau FROM ue_niveau_section
    WHERE annee_scolaire = ? AND section IN (${ph})
  `).all(annee, ...sections)) {
    map[o.ue_num] = (o.niveau || '').toUpperCase();
  }
  return map;
}

// Rang d'un niveau pour le tri des colonnes : BA1 < BA2 < BA3 < autres < sans
export function rangNiveau(v) {
  const m = /^BA(\d+)$/.exec((v || '').toUpperCase());
  if (m) return Number(m[1]);
  return v ? 900 : 999;
}

// Construit le graphe d'une section : nœuds (UE), arêtes (prérequis),
// colonnes (niveaux). `etat` permet d'y superposer la situation d'un étudiant.
export function construireGraphe({ sections, annee, etat }) {
  const ph = sections.map(() => '?').join(',');
  const anneeRef = anneeActiveEnBase() || annee;

  const ues = db.prepare(`
    SELECT ue_num, MIN(ue_nom) AS ue_nom, MIN(section) AS section,
           MAX(COALESCE(is_epreuve_integree, 0)) AS is_epreuve_integree
    FROM ue WHERE annee_scolaire = ? AND section IN (${ph})
    GROUP BY ue_num
  `).all(anneeRef, ...sections);
  if (!ues.length) return { nodes: [], edges: [], colonnes: [] };

  const ueSet = new Set(ues.map(u => u.ue_num));
  const niveaux = niveauxEffectifs(sections, annee);

  const edges = db.prepare('SELECT ue_num, prerequis_num FROM ue_prerequis').all()
    .filter(p => ueSet.has(p.ue_num) && ueSet.has(p.prerequis_num))
    .map(p => ({ from: p.prerequis_num, to: p.ue_num }));

  const prereqDe = {};
  for (const eg of edges) (prereqDe[eg.to] = prereqDe[eg.to] || []).push(eg.from);

  // Profondeur dans le graphe — ordonne les lignes à l'intérieur d'une colonne
  const profondeur = {};
  const calcul = (n, vus = new Set()) => {
    if (profondeur[n] !== undefined) return profondeur[n];
    if (vus.has(n)) return 0;
    vus.add(n);
    const ps = prereqDe[n] || [];
    const d = ps.length ? 1 + Math.max(...ps.map(p => calcul(p, vus))) : 0;
    profondeur[n] = d;
    return d;
  };
  for (const u of ues) calcul(u.ue_num);

  // Colonnes = niveaux d'études. L'épreuve intégrée est l'aboutissement du
  // cursus : elle obtient une colonne à part, en fin de schéma, tout en
  // restant rattachée à son année d'études (BA3 en général).
  const estEI = {};
  for (const u of ues) estEI[u.ue_num] = !!u.is_epreuve_integree;
  const ilYADesEI = ues.some(u => u.is_epreuve_integree);

  const listeNiveaux = [...new Set(ues.filter(u => !estEI[u.ue_num]).map(u => niveaux[u.ue_num] || ''))]
    .sort((a, b) => rangNiveau(a) - rangNiveau(b) || a.localeCompare(b));

  // Une année d'études peut contenir des UE qui dépendent les unes des autres
  // (l'épreuve intégrée et ses déterminantes, une chaîne de stages…). Plutôt
  // que de les empiler dans une seule colonne, on découpe l'année en autant de
  // sous-colonnes que la plus longue chaîne interne : la progression se lit.
  const prereqIntra = {};
  for (const eg of edges) {
    if (estEI[eg.to] || estEI[eg.from]) continue;
    if ((niveaux[eg.from] || '') === (niveaux[eg.to] || '')) {
      (prereqIntra[eg.to] = prereqIntra[eg.to] || []).push(eg.from);
    }
  }
  const profIntra = {};
  const calculIntra = (n, vus = new Set()) => {
    if (profIntra[n] !== undefined) return profIntra[n];
    if (vus.has(n)) return 0;
    vus.add(n);
    const ps = prereqIntra[n] || [];
    const d = ps.length ? 1 + Math.max(...ps.map(p => calculIntra(p, vus))) : 0;
    profIntra[n] = d;
    return d;
  };
  for (const u of ues) if (!estEI[u.ue_num]) calculIntra(u.ue_num);

  // Largeur de chaque année = plus longue chaîne interne + 1
  const largeurDe = {};
  for (const v of listeNiveaux) {
    largeurDe[v] = 1 + Math.max(0, ...ues
      .filter(u => !estEI[u.ue_num] && (niveaux[u.ue_num] || '') === v)
      .map(u => profIntra[u.ue_num] || 0));
  }
  const departDe = {};
  let curseur = 0;
  for (const v of listeNiveaux) { departDe[v] = curseur; curseur += largeurDe[v]; }
  const colonneEI = curseur;

  const colonneNoeud = n => estEI[n]
    ? colonneEI
    : (departDe[niveaux[n] || ''] || 0) + (profIntra[n] || 0);

  const nodes = ues.map(u => {
    const n = u.ue_num;
    const niv = niveaux[n] || '';
    return {
      ue_num: n,
      ue_nom: u.ue_nom,
      ue_niv: niv,
      section: u.section,
      couche: colonneNoeud(n),
      ordre: profondeur[n] || 0,
      epreuve_integree: estEI[n],
      prerequis: prereqDe[n] || [],
      ...(etat ? etat(n) : { statut: 'structure' }),
    };
  }).sort((a, b) => a.couche - b.couche || a.ordre - b.ordre || a.ue_num - b.ue_num);

  // Une entrée par colonne (le libellé n'est porté que par la première de
  // chaque année), plus la description des groupes pour le titre centré.
  const colonnes = [];
  const groupes = [];
  for (const v of listeNiveaux) {
    const debut = departDe[v], fin = debut + largeurDe[v] - 1;
    groupes.push({ label: v || '—', debut, fin });
    for (let i = debut; i <= fin; i++) {
      colonnes.push({ index: i, label: i === debut ? (v || '—') : '', groupe: v || '—' });
    }
  }
  if (ilYADesEI) {
    const nivEI = [...new Set(ues.filter(u => estEI[u.ue_num]).map(u => niveaux[u.ue_num] || ''))]
      .sort((a, b) => rangNiveau(b) - rangNiveau(a))[0] || '';
    colonnes.push({ index: colonneEI, label: nivEI || '—', sous_titre: 'Épreuve intégrée' });
    groupes.push({ label: nivEI || '—', debut: colonneEI, fin: colonneEI, sous_titre: 'Épreuve intégrée' });
  }
  return { nodes, edges, colonnes, groupes };
}

// ── Structure d'une section (sans étudiant) ─────────────────────────────────
r.get('/structure', authRequired, (req, res) => {
  const { section, annee } = req.query;
  if (!section || !annee) return res.status(400).json({ error: 'section et annee requises' });

  const g = construireGraphe({ sections: [section], annee });

  // Cohérence : une UE ne doit pas dépendre d'une UE placée dans une année
  // ultérieure. On signale les incohérences sans les corriger d'autorité.
  const nivDe = Object.fromEntries(g.nodes.map(n => [n.ue_num, n.ue_niv]));
  const alertes = [];
  for (const eg of g.edges) {
    const rFrom = rangNiveau(nivDe[eg.from]), rTo = rangNiveau(nivDe[eg.to]);
    if (rFrom > rTo) {
      alertes.push({
        ue_num: eg.to, prerequis_num: eg.from,
        message: `L'UE ${eg.to} (${nivDe[eg.to] || '—'}) a pour prérequis l'UE ${eg.from} (${nivDe[eg.from] || '—'}), placée plus tard dans le cursus.`,
      });
    }
  }

  res.json({ ...g, section, annee, alertes });
});

// ── Modifier l'année d'études d'une UE dans une section ─────────────────────
r.put('/niveau', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { section, annee, ue_num, niveau } = req.body;
  if (!section || !annee || !ue_num) {
    return res.status(400).json({ error: 'section, annee et ue_num requis' });
  }
  const val = (niveau || '').toUpperCase().trim();

  if (!val) {
    // Retour au niveau du référentiel UE
    db.prepare('DELETE FROM ue_niveau_section WHERE section=? AND annee_scolaire=? AND ue_num=?')
      .run(section, annee, Number(ue_num));
    return res.json({ ok: true, niveau: null });
  }
  if (!/^BA\d+$/.test(val)) {
    return res.status(400).json({ error: 'niveau attendu au format BA1, BA2, BA3…' });
  }
  db.prepare(`
    INSERT INTO ue_niveau_section (section, annee_scolaire, ue_num, niveau, maj_le)
    VALUES (?,?,?,?, datetime('now'))
    ON CONFLICT(section, annee_scolaire, ue_num) DO UPDATE SET
      niveau = excluded.niveau, maj_le = datetime('now')
  `).run(section, annee, Number(ue_num), val);
  res.json({ ok: true, niveau: val });
});

// ── Reprendre les niveaux de l'année précédente ─────────────────────────────
r.post('/reprendre', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { section, annee, annee_source } = req.body;
  if (!section || !annee || !annee_source) {
    return res.status(400).json({ error: 'section, annee et annee_source requises' });
  }
  const src = db.prepare(
    'SELECT ue_num, niveau FROM ue_niveau_section WHERE section=? AND annee_scolaire=?'
  ).all(section, annee_source);

  const ins = db.prepare(`
    INSERT INTO ue_niveau_section (section, annee_scolaire, ue_num, niveau, maj_le)
    VALUES (?,?,?,?, datetime('now'))
    ON CONFLICT(section, annee_scolaire, ue_num) DO UPDATE SET
      niveau = excluded.niveau, maj_le = datetime('now')
  `);
  let n = 0;
  db.transaction(() => {
    for (const s of src) { ins.run(section, annee, s.ue_num, s.niveau); n++; }
  })();
  res.json({ ok: true, reprises: n });
});

export default r;
