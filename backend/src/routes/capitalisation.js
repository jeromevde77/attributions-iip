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
import { authRequired, roleRequired, getUserSections} from '../middleware/auth.js';
import { envelopperDocument } from '../lib/document.js';
import { couleurs } from '../lib/couleurs.js';

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

  /* LE NIVEAU DE L'ANNÉE CONSULTÉE D'ABORD (28 septembre 2026). La base se
     lisait dans l'année ACTIVE et la surcharge dans l'année consultée : deux
     années mêlées dans un même niveau. L'année active ne sert plus que de
     repli pour une unité que l'année consultée ne décrit pas. */
  // Une unité RATTACHÉE à la section (ue_section) garde le niveau de son
  // référentiel : le tronc commun lu par les orthoptistes (30 septembre 2026).
  const lire = an => db.prepare(`
    SELECT ue_num, MIN(ue_niv) AS ue_niv FROM ue
    WHERE annee_scolaire = ? AND (section IN (${ph})
      OR ue_num IN (SELECT ue_num FROM ue_section WHERE annee_scolaire = ? AND section_code IN (${ph})))
    GROUP BY ue_num
  `).all(an, ...sections, an, ...sections);
  for (const u of lire(annee)) map[u.ue_num] = (u.ue_niv || '').toUpperCase();
  if (anneeRef && anneeRef !== annee) {
    for (const u of lire(anneeRef)) if (!(u.ue_num in map)) map[u.ue_num] = (u.ue_niv || '').toUpperCase();
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
           MAX(COALESCE(is_epreuve_integree, 0)) AS is_epreuve_integree,
           -- Une UE DÉTERMINANTE pèse double dans la mention du diplôme
           -- (décret de 1991) : elle mérite d'être signalée sur le schéma.
           MAX(CASE WHEN ue_det = 'x' THEN 1 ELSE 0 END) AS determinante
    FROM ue WHERE annee_scolaire = ? AND (section IN (${ph})
      -- les unités RATTACHÉES à la section : le tronc commun des orthoptistes
      -- (30 septembre 2026 — sans elles, ni schéma ni frise pour l'Orthoptie).
      OR ue_num IN (SELECT ue_num FROM ue_section WHERE annee_scolaire IN (?, ?) AND section_code IN (${ph})))
    GROUP BY ue_num
  `).all(anneeRef, ...sections, anneeRef, annee || anneeRef, ...sections);
  if (!ues.length) return { nodes: [], edges: [], colonnes: [] };

  const ueSet = new Set(ues.map(u => u.ue_num));
  const niveaux = niveauxEffectifs(sections, annee);

  const edges = db.prepare("SELECT ue_num, prerequis_num, COALESCE(type,'legal') AS type, motif FROM ue_prerequis").all()
    .filter(p => ueSet.has(p.ue_num) && ueSet.has(p.prerequis_num))
    .map(p => ({ from: p.prerequis_num, to: p.ue_num, type: p.type, motif: p.motif }));

  // Le calcul des verrous ne retient que les prérequis légaux ; les internes
  // sont dessinés et signalés, mais n'empêchent rien.
  const prereqDe = {};
  for (const eg of edges) {
    if (eg.type !== 'legal') continue;
    (prereqDe[eg.to] = prereqDe[eg.to] || []).push(eg.from);
  }

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
      determinante: !!u.determinante,
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
  // La structure d'une section ne se consulte que dans son périmètre.
  const perim = getUserSections(req.user);
  if (perim && req.query.section && !perim.includes(req.query.section)) {
    return res.status(403).json({ error: 'Section hors de votre périmètre' });
  }
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

// ── LA PIÈCE IMPRIMÉE DU SCHÉMA (3.1.35, Charles, 4 octobre 2026) ──────────
// « une impression des schémas de capitalisation, sans que les lignes ne
// passent derrière les cases ». Le schéma est celui de l'ÉCRAN, flèches en
// couloirs comprises (frontend/src/lib/routage.js) : l'écran envoie son dessin,
// le serveur l'habille de l'enveloppe commune, en A4 paysage, sur une page.
// Deux tracés — un pour l'écran, un pour le papier — finiraient par diverger.
r.post('/document', authRequired, (req, res) => {
  const { section, annee } = req.body || {};
  const perim = getUserSections(req.user);
  if (perim && section && !perim.includes(section)) return res.status(403).json({ error: 'Section hors de votre périmètre' });
  let svg = String(req.body?.svg || '');
  if (!/^\s*<svg[\s>]/i.test(svg) || svg.length > 3_000_000) return res.status(400).json({ error: 'Schéma absent.' });
  // Un dessin, rien d'autre : ni script, ni gestionnaire d'événement, ni lien.
  svg = svg.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/(href|xlink:href)\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi, '');
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  /* LA PIÈCE A4 PAYSAGE (Charles, 5 octobre 2026 : « une impression A4 paysage
     avec mise en page, depuis Éditions »). Le schéma prend toute la largeur et
     la hauteur que laisse l'en-tête ; une légende le suit, dans les couleurs
     RÉGLÉES — celles que le schéma porte —, jamais dans des teintes écrites ici.
     L'architecture prend les couleurs du LOGO (or, bleu, marine), et non les
     repères de bloc du reste de Lucie : SchemaCapitalisation, mode structure. */
  const c = couleurs();
  const pastille = (teinte, libelle) =>
    `<span class="lg"><i style="background:${teinte}"></i>${esc(libelle)}</span>`;
  const legende = `<div class="legende">
      ${pastille(c.iip_or, 'BA1')}${pastille(c.iip_bleu, 'BA2')}${pastille(c.principal, 'BA3')}
      <span class="lg"><i class="ei" style="border-color:${c.epreuve}"></i>Épreuve intégrée</span>
      <span class="lg"><b class="d">D</b>Unité déterminante</span>
      <span class="lg"><svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke="#475569" stroke-width="1.2"/></svg>Prérequis du dossier pédagogique</span>
      <span class="lg"><svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke="#475569" stroke-width="1.2" stroke-dasharray="4 3"/></svg>Règle interne</span>
    </div>`;
  const nomSection = (() => {
    try { return db.prepare('SELECT libelle FROM section WHERE code = ?').get(section)?.libelle || null; } catch { return null; }
  })();
  const html = envelopperDocument({
    titre: `Schéma de capitalisation — ${section || ''}`,
    orientation: 'paysage',
    entete: { titre: 'Schéma de capitalisation', sous: `${nomSection && nomSection !== section ? `${nomSection} (${section})` : (section || '')} · ${annee || ''}`,
      mention: 'Une unité ne s’ouvre que lorsque ses prérequis sont acquis. La flèche prend la couleur du bloc où elle arrive.' },
    styles: `.schema-cap { page-break-inside: avoid; break-inside: avoid; }
             .schema-cap svg { width: 100% !important; height: auto !important; max-height: 86mm; display: block; margin: 0 auto; }
             .legende { display: flex; flex-wrap: wrap; gap: 2mm 6mm; margin-top: 3mm; padding-top: 2mm;
               border-top: 0.3mm solid #D8DCE4; font-size: 8pt; color: #16406A; }
             .legende .lg { display: inline-flex; align-items: center; gap: 1.6mm; }
             .legende i { display: inline-block; width: 7mm; height: 2.2mm; border-radius: 0.6mm; }
             .legende i.ei { width: 4.5mm; height: 3.5mm; background: #fff; border: 0.5mm solid; border-left-width: 1.2mm; border-radius: 0.8mm; }
             .legende b.d { display: inline-grid; place-items: center; width: 3.6mm; height: 3.6mm; border-radius: 50%;
               background: #16406A; color: #fff; font-size: 6.5pt; }`,
    html: `<div class="schema-cap">${svg}</div>${legende}`,
  });
  res.json({ html, nom: `Schema_capitalisation_${String(section || '').replace(/[^A-Za-z0-9]+/g, '_')}_${annee || ''}` });
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
