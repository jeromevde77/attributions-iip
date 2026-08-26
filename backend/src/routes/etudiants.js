// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Module Étudiants : base étudiants, inscriptions, résultats et PAE
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';

import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';

const r = Router();

export function migrerEtudiants(dbx) {
  try {
    dbx.exec(`
    CREATE TABLE IF NOT EXISTS etudiant (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      id_ecampus     TEXT UNIQUE,
      nom            TEXT NOT NULL,
      prenom         TEXT NOT NULL,
      date_naissance TEXT,
      email_ecole    TEXT,
      email_perso    TEXT,
      num_national   TEXT,
      gsm            TEXT,
      adresse        TEXT,
      localite       TEXT,
      cp             TEXT,
      titre          TEXT,
      actif          INTEGER NOT NULL DEFAULT 1,
      cree_le        TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_etudiant_nom ON etudiant(nom, prenom);

    CREATE TABLE IF NOT EXISTS etudiant_inscription (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      etudiant_id    INTEGER NOT NULL REFERENCES etudiant(id) ON DELETE CASCADE,
      annee_scolaire TEXT NOT NULL,
      ue_num         INTEGER NOT NULL,
      groupe         TEXT,
      statut         TEXT DEFAULT 'inscrit',
      resultat       TEXT,        -- 'reussi' | 'ajourne' | 'absent' | null
      mention        TEXT,        -- A, B, C, D, E
      points         REAL,
      cree_le        TEXT DEFAULT (datetime('now')),
      UNIQUE(etudiant_id, annee_scolaire, ue_num)
    );
    CREATE INDEX IF NOT EXISTS idx_inscription_etud
      ON etudiant_inscription(etudiant_id, annee_scolaire);
    `);
    console.log('[migration] Tables etudiant + etudiant_inscription créées');

    // Pièces du dossier individuel de l'apprenant (circulaire n° 9764 du 13/07/2026)
    dbx.exec(`
    CREATE TABLE IF NOT EXISTS etudiant_piece (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      etudiant_id  INTEGER NOT NULL REFERENCES etudiant(id) ON DELETE CASCADE,
      type_piece   TEXT NOT NULL,
      statut       TEXT NOT NULL DEFAULT 'manquant',   -- manquant | recu | na
      commentaire  TEXT,
      maj_le       TEXT DEFAULT (datetime('now')),
      UNIQUE(etudiant_id, type_piece)
    );`);

    // Colonnes réglementaires sur l'inscription (fiche d'inscription/reçu)
    const addCol = (t, def) => { try { dbx.exec('ALTER TABLE ' + t + ' ADD COLUMN ' + def); } catch {} };
    addCol('etudiant_inscription', "date_inscription TEXT");
    addCol('etudiant_inscription', "admission_type TEXT"); // 'titre' | 'test' | null
    addCol('etudiant_inscription', "dispense_complete INTEGER NOT NULL DEFAULT 0");
    addCol('etudiant_inscription', "codiplomation_ch INTEGER NOT NULL DEFAULT 0");
    addCol('etudiant_inscription', "di_specifique REAL");
    addCol('etudiant_inscription', "ects REAL");
    addCol('etudiant_inscription', "derogation INTEGER NOT NULL DEFAULT 0");
    console.log('[migration] etudiant_piece + colonnes fiche inscription');

    // Valorisation des acquis — AGCF 13-12-2024 (art. 3 partielle, art. 4 complète)
    dbx.exec(`
    CREATE TABLE IF NOT EXISTS etudiant_valorisation (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      etudiant_id    INTEGER NOT NULL REFERENCES etudiant(id) ON DELETE CASCADE,
      annee_scolaire TEXT NOT NULL,
      ue_num         INTEGER NOT NULL,
      type           TEXT NOT NULL CHECK (type IN ('complete','partielle','admission')),
      cible          TEXT CHECK (cible IN ('aa','cours') OR cible IS NULL),
      cible_detail   TEXT,          -- codes AA ou codes cours dispensés (séparés par virgule)
      pourcentage    REAL,          -- note attribuée (pratique : 50 par défaut)
      decision_ce_date TEXT,        -- date de la décision du Conseil des études
      commentaire    TEXT,
      cree_le        TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_valo_etud ON etudiant_valorisation(etudiant_id);
    `);
    console.log('[migration] etudiant_valorisation créée');

    // Notes détaillées par cours et par acquis d'apprentissage
    dbx.exec(`
    CREATE TABLE IF NOT EXISTS etudiant_note_detail (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      etudiant_id    INTEGER NOT NULL REFERENCES etudiant(id) ON DELETE CASCADE,
      annee_scolaire TEXT NOT NULL,
      ue_num         INTEGER NOT NULL,
      type           TEXT NOT NULL CHECK (type IN ('cours','aa')),
      code           TEXT NOT NULL,
      points         REAL,
      va             INTEGER NOT NULL DEFAULT 0,
      commentaire    TEXT,
      UNIQUE(etudiant_id, annee_scolaire, ue_num, type, code)
    );
    CREATE INDEX IF NOT EXISTS idx_note_detail
      ON etudiant_note_detail(etudiant_id, annee_scolaire, ue_num);
    `);
    console.log('[migration] etudiant_note_detail créée');
  } catch (e) { console.error('[migration] etudiants :', e.message); }
}

// Les 5 pièces réglementaires (circulaire dossiers apprenants EA)
export const PIECES_APPRENANT = [
  { type: 'identite',          libelle: "Copie du document d'identité" },
  { type: 'titre_cpr',         libelle: 'Titre correspondant aux capacités préalables requises (ou valorisation des acquis)' },
  { type: 'fiche_inscription', libelle: "Fiche d'inscription / reçu" },
  { type: 'decision_ce',       libelle: 'Décision favorable du Conseil des études (réinscription UE déjà réussie)' },
  { type: 'exoneration_di',    libelle: "Documents d'exonération du droit d'inscription" },
];

// Sections d'un étudiant, pondérées par le nombre d'UE inscrites.
// Certaines UE sont partagées entre sections : une seule UE commune ne doit
// pas faire entrer tout le catalogue d'une autre section. On ne retient donc
// que la (ou les) section(s) dominante(s).
function sectionsDeLEtudiant(etudId, forcee) {
  if (forcee) return { sections: [forcee], scores: [] };
  const scores = db.prepare(`
    SELECT u.section, COUNT(DISTINCT i.ue_num) AS n
    FROM etudiant_inscription i
    JOIN ue u ON u.ue_num = i.ue_num AND u.annee_scolaire = i.annee_scolaire
    WHERE i.etudiant_id = ? AND u.section IS NOT NULL
    GROUP BY u.section
    ORDER BY n DESC
  `).all(etudId);
  if (!scores.length) return { sections: [], scores };
  const max = scores[0].n;
  // Seuil : une section n'est retenue que si elle couvre au moins 60 % des UE
  // de la section dominante (une UE partagée isolée reste sous le seuil).
  const sections = scores.filter(s => s.n >= Math.max(2, max * 0.6)).map(s => s.section);
  return { sections: sections.length ? sections : [scores[0].section], scores };
}

// ── Liste des étudiants ───────────────────────────────────────────────────────
r.get('/', authRequired, (req, res) => {
  const { section, q } = req.query;

  // Tous les étudiants actifs, avec leurs inscriptions toutes années confondues.
  // La section affichée vient des UE de leurs inscriptions (dernière année connue).
  let sql = `
    SELECT e.id, e.nom, e.prenom, e.email_ecole, e.id_ecampus,
           GROUP_CONCAT(DISTINCT u.section) AS sections,
           COUNT(DISTINCT i.ue_num) AS nb_ue,
           MAX(i.annee_scolaire) AS derniere_annee
    FROM etudiant e
    JOIN etudiant_inscription i ON i.etudiant_id = e.id
    LEFT JOIN ue u ON u.ue_num = i.ue_num AND u.annee_scolaire = i.annee_scolaire
    WHERE e.actif = 1
  `;
  const params = [];

  if (section) { sql += ` AND u.section = ?`; params.push(section); }
  if (q) {
    sql += ` AND (e.nom LIKE ? OR e.prenom LIKE ? OR e.id_ecampus LIKE ?)`;
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  sql += ` GROUP BY e.id ORDER BY e.nom, e.prenom`;

  res.json(db.prepare(sql).all(...params));
});

// ── Rapport croisé : étudiants × UE d'une section, pour une année ────────────
r.get('/rapport', authRequired, (req, res) => {
  const { section, annee } = req.query;
  if (!section || !annee) return res.status(400).json({ error: 'section et annee requises' });

  const anneeActive = db.prepare('SELECT code FROM annee_scolaire WHERE active = 1').get()?.code;

  // UE de la section (référentiel de l'année demandée, sinon année active), BA1→BA3
  let ues = db.prepare(`
    SELECT DISTINCT ue_num, ue_nom, ue_niv FROM ue
    WHERE annee_scolaire = ? AND section = ?
    ORDER BY CASE UPPER(COALESCE(ue_niv,'')) WHEN 'BA1' THEN 1 WHEN 'BA2' THEN 2 WHEN 'BA3' THEN 3 ELSE 4 END, ue_num
  `).all(annee, section);
  if (!ues.length) ues = db.prepare(`
    SELECT DISTINCT ue_num, ue_nom, ue_niv FROM ue
    WHERE annee_scolaire = ? AND section = ?
    ORDER BY CASE UPPER(COALESCE(ue_niv,'')) WHEN 'BA1' THEN 1 WHEN 'BA2' THEN 2 WHEN 'BA3' THEN 3 ELSE 4 END, ue_num
  `).all(anneeActive, section);
  const ueNums = new Set(ues.map(u => u.ue_num));

  // Étudiants avec inscriptions ou VA cette année dans ces UE
  const inscriptions = db.prepare(`
    SELECT i.etudiant_id, i.ue_num, i.resultat, i.points, e.nom, e.prenom, e.id_ecampus
    FROM etudiant_inscription i
    JOIN etudiant e ON e.id = i.etudiant_id
    WHERE i.annee_scolaire = ?
  `).all(annee).filter(i => ueNums.has(i.ue_num));
  const vas = db.prepare(`
    SELECT v.etudiant_id, v.ue_num, v.pourcentage, e.nom, e.prenom, e.id_ecampus
    FROM etudiant_valorisation v
    JOIN etudiant e ON e.id = v.etudiant_id
    WHERE v.annee_scolaire = ? AND v.type = 'complete'
  `).all(annee).filter(v => ueNums.has(v.ue_num));

  // Regrouper par étudiant
  const etudiants = new Map();
  const cle = r0 => r0.etudiant_id;
  for (const i of inscriptions) {
    if (!etudiants.has(cle(i))) etudiants.set(cle(i), { nom: i.nom, prenom: i.prenom, id_ecampus: i.id_ecampus, cells: {} });
    const marque = i.resultat === 'reussi' ? 'C' : i.resultat === 'ajourne' ? 'R' : i.resultat === 'absent' ? 'A' : '•';
    etudiants.get(cle(i)).cells[i.ue_num] = { m: marque, pts: i.points };
  }
  for (const v of vas) {
    if (!etudiants.has(cle(v))) etudiants.set(cle(v), { nom: v.nom, prenom: v.prenom, id_ecampus: v.id_ecampus, cells: {} });
    etudiants.get(cle(v)).cells[v.ue_num] = { m: 'VA', pts: v.pourcentage };
  }
  const lignes = [...etudiants.values()].sort((a, b) =>
    (a.nom || '').localeCompare(b.nom || '') || (a.prenom || '').localeCompare(b.prenom || ''));

  const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const cellHtml = c0 => {
    if (!c0) return '<td></td>';
    const cls = c0.m === 'C' ? 'c' : c0.m === 'R' ? 'r' : c0.m === 'A' ? 'a' : c0.m === 'VA' ? 'va' : 'i';
    const titre = c0.pts != null ? ' title="' + c0.pts + ' %"' : '';
    return '<td class="' + cls + '"' + titre + '>' + c0.m + '</td>';
  };

  const enTetes = ues.map(u =>
    '<th class="ue" title="' + esc(u.ue_nom || '') + '">' + u.ue_num + '<span class="niv">' + esc(u.ue_niv || '') + '</span></th>').join('');
  const corps = lignes.map((l, i) => '<tr>' +
    '<td class="num">' + (i + 1) + '</td>' +
    '<td class="nom">' + esc(l.nom) + ' ' + esc(l.prenom) + '<span class="mat">' + esc(l.id_ecampus || '') + '</span></td>' +
    ues.map(u => cellHtml(l.cells[u.ue_num])).join('') + '</tr>').join('');

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<title>Parcours ${esc(section)} — ${esc(annee)}</title>
<style>
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1B2B4B; margin: 24px; }
  h1 { font-size: 16px; margin: 0 0 2px; }
  .meta { color: #64748b; margin-bottom: 12px; font-size: 11px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #cbd5e1; padding: 3px 5px; text-align: center; }
  th { background: #f1f5f9; font-size: 10px; }
  th.ue .niv { display: block; font-weight: normal; color: #94a3b8; font-size: 8.5px; }
  td.num { color: #94a3b8; width: 24px; }
  td.nom { text-align: left; white-space: nowrap; font-weight: 500; }
  td.nom .mat { display: block; color: #94a3b8; font-weight: normal; font-size: 9px; }
  td.c  { background: #d1fae5; color: #065f46; font-weight: 700; }
  td.r  { background: #fee2e2; color: #991b1b; font-weight: 700; }
  td.a  { background: #fef3c7; color: #92400e; font-weight: 700; }
  td.va { background: #ede9fe; color: #5b21b6; font-weight: 700; }
  td.i  { color: #64748b; }
  .legende { margin-top: 10px; font-size: 10px; color: #64748b; }
  @media print { body { margin: 8mm; } @page { size: landscape; } }
</style></head><body>
<h1>Parcours des étudiants — ${esc(section)}</h1>
<div class="meta">Année académique ${esc(annee)} · ${lignes.length} étudiant(s) · ${ues.length} UE · imprimé le ${new Date().toLocaleDateString('fr-BE')}</div>
<table>
  <thead><tr><th></th><th style="text-align:left">Étudiant</th>${enTetes}</tr></thead>
  <tbody>${corps || '<tr><td colspan="' + (ues.length + 2) + '" style="color:#94a3b8">Aucune donnée pour ces critères</td></tr>'}</tbody>
</table>
<div class="legende"><b>C</b> réussite · <b>R</b> refus · <b>A</b> absent · <b>VA</b> valorisation des acquis · <b>•</b> inscrit (non délibéré) · survolez une case pour les points</div>
</body></html>`;

  res.json({ html, nom: 'parcours_' + section + '_' + annee + '.html' });
});

// ── Fiche étudiant avec inscriptions ─────────────────────────────────────────
r.get('/:id', authRequired, (req, res) => {
  const etudiant = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(Number(req.params.id));
  if (!etudiant) return res.status(404).json({ error: 'étudiant introuvable' });

  // Toutes les inscriptions, toutes années — le front groupe par année.
  const inscriptions = db.prepare(`
    SELECT i.*, u.ue_nom, u.ue_niv, u.ue_quad, u.section
    FROM etudiant_inscription i
    LEFT JOIN ue u ON u.ue_num = i.ue_num AND u.annee_scolaire = i.annee_scolaire
    WHERE i.etudiant_id = ?
    ORDER BY i.annee_scolaire DESC, u.section, i.ue_num
  `).all(etudiant.id);

  res.json({ ...etudiant, inscriptions });
});

// ── Encoder un résultat ───────────────────────────────────────────────────────
r.patch('/inscription/:id', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { resultat, mention, points } = req.body;
  const RESULTATS = ['reussi', 'ajourne', 'absent', null];
  if (resultat !== undefined && !RESULTATS.includes(resultat)) {
    return res.status(400).json({ error: 'resultat invalide' });
  }
  db.prepare(`
    UPDATE etudiant_inscription SET resultat = ?, mention = ?, points = ? WHERE id = ?
  `).run(resultat ?? null, mention ?? null, points ?? null, Number(req.params.id));
  res.json({ ok: true });
});

// ── Générer le PAE pour une année ─────────────────────────────────────────────
// Logique : UEs organisées cette année dont les prérequis sont satisfaits
// (l'étudiant les a réussies l'année précédente ou elles n'ont pas de prérequis)
r.get('/:id/pae', authRequired, (req, res) => {
  const profId = Number(req.params.id);
  const annee = req.query.annee;
  const anneePrecedente = req.query.annee_precedente;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const etudiant = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(profId);
  if (!etudiant) return res.status(404).json({ error: 'étudiant introuvable' });

  // UEs réussies explicitement (toutes années — un résultat encodé n'expire pas)
  const reussiesExplicites = new Set(
    db.prepare(`
      SELECT DISTINCT ue_num FROM etudiant_inscription
      WHERE etudiant_id = ? AND resultat = 'reussi'
    `).all(profId).map(r => r.ue_num)
  );

  // UEs déjà inscrites pour l'année du PAE (état courant)
  const dejaInscritesAnnee = new Set(
    db.prepare(`
      SELECT ue_num FROM etudiant_inscription
      WHERE etudiant_id = ? AND annee_scolaire = ?
    `).all(profId, annee).map(r => r.ue_num)
  );

  // UEs déjà suivies (toutes années confondues)
  const dejaSuivies = new Set(
    db.prepare(`
      SELECT DISTINCT ue_num FROM etudiant_inscription WHERE etudiant_id = ?
    `).all(profId).map(r => r.ue_num)
  );

  // VA en dispense complète : l'UE est acquise (AGCF art. 4)
  const vaCompletes = new Set(
    db.prepare(`
      SELECT DISTINCT ue_num FROM etudiant_valorisation
      WHERE etudiant_id = ? AND type = 'complete'
    `).all(profId).map(r => r.ue_num)
  );

  // Acquis = réussites explicites ∪ VA complètes.
  // (L'inférence par prérequis n'est plus un acquis automatique : elle est
  //  devenue une suggestion visuelle dans la grille de parcours, où le
  //  secrétariat encode explicitement l'historique.)
  const reussies = new Set([...reussiesExplicites, ...vaCompletes]);

  // Sections de l'étudiant (dominantes) — override possible via ?section=
  const { sections: sectionsEtudiant, scores: sectionsScores } =
    sectionsDeLEtudiant(profId, req.query.section);

  // UEs organisées cette année dans ces sections — UNE ligne par UE
  // (une UE peut avoir plusieurs organisations : on ne la propose qu'une fois)
  let organisees = [];
  if (sectionsEtudiant.length) {
    const placeholders = sectionsEtudiant.map(() => '?').join(',');
    organisees = db.prepare(`
      SELECT o.ue_num,
             MIN(o.section) AS section,
             MIN(o.num_organisation) AS num_organisation,
             MIN(o.date_debut) AS date_debut,
             MAX(o.date_fin) AS date_fin,
             MIN(u.ue_nom) AS ue_nom,
             MIN(u.ue_niv) AS ue_niv,
             MIN(u.ue_quad) AS ue_quad
      FROM organisation_ue o
      LEFT JOIN ue u ON u.ue_num = o.ue_num AND u.annee_scolaire = ?
                    AND u.section = o.section
      WHERE o.annee_scolaire = ? AND o.section IN (${placeholders})
      GROUP BY o.ue_num
      ORDER BY
        CASE UPPER(COALESCE(MIN(u.ue_niv),'')) WHEN 'BA1' THEN 1 WHEN 'BA2' THEN 2 WHEN 'BA3' THEN 3 ELSE 4 END,
        o.ue_num
    `).all(annee, annee, ...sectionsEtudiant);
  }

  // Pour chaque UE organisée, vérifier les prérequis
  const pae = [];
  for (const ue of organisees) {
    const prerequis = db.prepare(`
      SELECT p.prerequis_num AS ue_num_requis, u.ue_nom
      FROM ue_prerequis p
      LEFT JOIN ue u ON u.ue_num = p.prerequis_num AND u.annee_scolaire = ?
      WHERE p.ue_num = ?
    `).all(annee, ue.ue_num);

    const prerequis_ok = prerequis.every(p => reussies.has(p.ue_num_requis));
    const deja_reussie = reussies.has(ue.ue_num);

    // Sous réserve : les prérequis manquants sont organisés la même année
    // ET du même niveau que l'UE (cas type : épreuve intégrée et ses
    // déterminantes). Un prérequis manquant de niveau inférieur bloque.
    const prereqManquants = prerequis.filter(p => !reussies.has(p.ue_num_requis));
    const organiseesSet = new Set(organisees.map(o => o.ue_num));
    const nivDeUe = (organisees.find(o => o.ue_num === ue.ue_num)?.ue_niv || ue.ue_niv || '').toUpperCase();
    const nivMap = {};
    for (const o of organisees) nivMap[o.ue_num] = (o.ue_niv || '').toUpperCase();
    const sous_reserve = !prerequis_ok && prereqManquants.length > 0 &&
      prereqManquants.every(p => organiseesSet.has(p.ue_num_requis) &&
                                 nivMap[p.ue_num_requis] === nivDeUe);

    pae.push({
      ...ue,
      prerequis,
      prerequis_ok,
      deja_reussie,
      va_complete: vaCompletes.has(ue.ue_num),
      deja_suivie: dejaSuivies.has(ue.ue_num),
      inscrite: dejaInscritesAnnee.has(ue.ue_num),
      accessible: prerequis_ok && !deja_reussie,
      sous_reserve: sous_reserve && !deja_reussie,
      prereq_manquants: prereqManquants.map(p => p.ue_num_requis),
      // Circulaire 9764 : la réinscription dans une UE déjà réussie est possible
      // avec décision favorable du Conseil des études (pièce au dossier).
      reinscriptible_ce: prerequis_ok && deja_reussie,
    });
  }

  // ── Proposition de PAE : point fixe intra-niveau (même règle que PAE auto) ──
  // Les UE accessibles d'abord, puis celles débloquées par ces inscriptions
  // à condition d'être du MÊME niveau (épreuve intégrée et ses déterminantes).
  const nivParUe = {};
  for (const u of pae) nivParUe[u.ue_num] = (u.ue_niv || '').toUpperCase();
  const proposees = new Set();
  let stableProp = false;
  while (!stableProp) {
    stableProp = true;
    for (const u of pae) {
      if (u.deja_reussie || proposees.has(u.ue_num)) continue;
      const manquants = u.prereq_manquants || [];
      const ok = manquants.every(p => proposees.has(p) && nivParUe[p] === nivParUe[u.ue_num]);
      if (ok) { proposees.add(u.ue_num); stableProp = false; }
    }
  }
  for (const u of pae) {
    u.propose = proposees.has(u.ue_num);
    u.propose_sous_reserve = u.propose && (u.prereq_manquants || []).length > 0;
  }

  res.json({
    etudiant,
    annee,
    annee_precedente: anneePrecedente,
    sections: sectionsEtudiant,
    sections_scores: sectionsScores,
    pae,
    proposition: pae.filter(u => u.propose).map(u => u.ue_num),
    accessibles: pae.filter(u => u.accessible).length,
    reference: 'PAE — Plan Annuel de l\'Étudiant. Basé sur les prérequis de la section et les UE organisées.'
  });
});

// ── Valider le PAE : synchroniser les inscriptions de l'année ────────────────
// Reçoit la liste retenue par le secrétariat. Insère les manquantes, retire
// celles décochées qui n'ont PAS de résultat encodé (jamais destructif).
r.post('/:id/pae-valider', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const etudId = Number(req.params.id);
  const { annee, ue_nums, derogations } = req.body;
  if (!annee || !Array.isArray(ue_nums)) {
    return res.status(400).json({ error: 'annee et ue_nums requis' });
  }
  const e = db.prepare('SELECT id FROM etudiant WHERE id = ?').get(etudId);
  if (!e) return res.status(404).json({ error: 'étudiant introuvable' });

  const retenues = new Set(ue_nums.map(Number));
  const derog = new Set((derogations || []).map(Number));
  const dateInsc = new Date().toISOString().slice(0, 10);

  const existantes = db.prepare(
    'SELECT ue_num, resultat FROM etudiant_inscription WHERE etudiant_id = ? AND annee_scolaire = ?'
  ).all(etudId, annee);

  const ins = db.prepare(`
    INSERT OR IGNORE INTO etudiant_inscription
      (etudiant_id, annee_scolaire, ue_num, date_inscription, derogation)
    VALUES (?,?,?,?,?)
  `);
  const del = db.prepare(`
    DELETE FROM etudiant_inscription
    WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ? AND resultat IS NULL
  `);

  let ajoutees = 0, retirees = 0;
  const tx = db.transaction(() => {
    for (const ue of retenues) {
      if (ins.run(etudId, annee, ue, dateInsc, derog.has(ue) ? 1 : 0).changes) ajoutees++;
    }
    for (const ex of existantes) {
      if (!retenues.has(ex.ue_num) && ex.resultat == null) {
        if (del.run(etudId, annee, ex.ue_num).changes) retirees++;
      }
    }
  });
  tx();

  res.json({ ok: true, annee, ajoutees, retirees, total: retenues.size });
});

// ── PAE auto : inscrire d'un clic tout ce que l'étudiant peut avoir ──────────
// Point fixe : accessibles directes, puis celles débloquées par ces
// inscriptions (sous réserve — cas épreuve intégrée), jusqu'à stabilité.
r.post('/:id/pae-auto', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const etudId = Number(req.params.id);
  const annee = req.body.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  const e = db.prepare('SELECT id FROM etudiant WHERE id = ?').get(etudId);
  if (!e) return res.status(404).json({ error: 'étudiant introuvable' });

  // Acquis : réussites encodées + VA complètes
  const acquis = new Set([
    ...db.prepare("SELECT DISTINCT ue_num FROM etudiant_inscription WHERE etudiant_id = ? AND resultat = 'reussi'").all(etudId).map(r => r.ue_num),
    ...db.prepare("SELECT DISTINCT ue_num FROM etudiant_valorisation WHERE etudiant_id = ? AND type = 'complete'").all(etudId).map(r => r.ue_num),
  ]);

  // Sections de l'étudiant
  const { sections } = sectionsDeLEtudiant(etudId, req.body.section);
  if (!sections.length) return res.status(400).json({ error: 'sections de l\'étudiant inconnues' });

  // UE organisées cette année dans ces sections, non acquises
  const ph = sections.map(() => '?').join(',');
  const candidates = db.prepare(`
    SELECT DISTINCT o.ue_num FROM organisation_ue o
    WHERE o.annee_scolaire = ? AND o.section IN (${ph})
  `).all(annee, ...sections).map(r => r.ue_num).filter(u => !acquis.has(u));

  // Prérequis
  const prereqs = db.prepare('SELECT ue_num, prerequis_num FROM ue_prerequis').all();
  const prereqDe = {};
  for (const p of prereqs) (prereqDe[p.ue_num] = prereqDe[p.ue_num] || []).push(p.prerequis_num);

  // Niveaux (BA1/BA2/BA3) — le « sous réserve » ne vaut qu'ENTRE UE DU MÊME
  // NIVEAU (épreuve intégrée et ses déterminantes). Une UE dont le prérequis
  // manquant est d'un niveau inférieur n'est pas inscriptible : il faut
  // d'abord réussir ce prérequis (cas UE de BA1 ratée → la suite attend).
  const anneeRefNiv = db.prepare('SELECT code FROM annee_scolaire WHERE active = 1').get()?.code || annee;
  const nivRows = db.prepare('SELECT DISTINCT ue_num, ue_niv FROM ue WHERE annee_scolaire = ?').all(anneeRefNiv);
  const nivDe = {};
  for (const n of nivRows) nivDe[n.ue_num] = (n.ue_niv || '').toUpperCase();

  // Point fixe intra-niveau : la cascade inter-niveaux est bloquée
  const inscrites = new Set();
  const sousReserve = {};
  let stable = false;
  while (!stable) {
    stable = true;
    for (const ue of candidates) {
      if (inscrites.has(ue)) continue;
      const manquants = (prereqDe[ue] || []).filter(p => !acquis.has(p));
      const ok = manquants.every(p => inscrites.has(p) && nivDe[p] === nivDe[ue]);
      if (ok) {
        inscrites.add(ue);
        if (manquants.length) sousReserve[ue] = manquants;
        stable = false;
      }
    }
  }

  // Insertion (sans écraser un éventuel résultat déjà encodé cette année)
  const dateInsc = new Date().toISOString().slice(0, 10);
  const ins = db.prepare(`
    INSERT OR IGNORE INTO etudiant_inscription
      (etudiant_id, annee_scolaire, ue_num, date_inscription)
    VALUES (?,?,?,?)
  `);
  let creees = 0;
  const tx = db.transaction(() => {
    for (const ue of inscrites) {
      if (ins.run(etudId, annee, ue, dateInsc).changes) creees++;
    }
  });
  tx();

  res.json({
    ok: true, annee, creees,
    inscrites: [...inscrites].sort((a, b) => a - b),
    sous_reserve: Object.fromEntries(Object.entries(sousReserve)),
  });
});

// ── Import des résultats depuis le classeur de suivi (.xlsm) ─────────────────
// Le frontend lit les onglets par UE et envoie { annee, resultats: [...] }.
r.post('/import-resultats', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { annee, resultats } = req.body;
  if (!annee || !Array.isArray(resultats)) {
    return res.status(400).json({ error: 'annee et resultats requis' });
  }

  const findEtud = db.prepare('SELECT id FROM etudiant WHERE id_ecampus = ?');
  const upsert = db.prepare(`
    INSERT INTO etudiant_inscription (etudiant_id, annee_scolaire, ue_num, resultat, points)
    VALUES (?,?,?,?,?)
    ON CONFLICT(etudiant_id, annee_scolaire, ue_num) DO UPDATE SET
      resultat = excluded.resultat,
      points = COALESCE(excluded.points, points)
  `);

  let maj = 0, inconnus = [];
  const tx = db.transaction(() => {
    for (const r0 of resultats) {
      const e = findEtud.get(String(r0.id_ecampus || '').trim());
      if (!e) { inconnus.push(r0.id_ecampus); continue; }
      const resultat = ['reussi','ajourne','absent'].includes(r0.resultat) ? r0.resultat : null;
      const points = r0.points != null && !isNaN(Number(r0.points)) ? Number(r0.points) : null;
      upsert.run(e.id, annee, Number(r0.ue_num), resultat, points);
      maj++;
    }
  });
  tx();

  res.json({ ok: true, maj, inconnus: [...new Set(inconnus)].slice(0, 20) });
});

// ── Schéma de capitalisation : graphe des UE et de leurs prérequis ───────────
// Généré depuis ue_prerequis — fonctionne pour toutes les sections sans
// dessin manuel. Les UE sont réparties en couches (profondeur = plus long
// chemin depuis une UE sans prérequis) et colorées selon l'état de l'étudiant.
r.get('/:id/capitalisation', authRequired, (req, res) => {
  const etudId = Number(req.params.id);
  const annee = req.query.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  const e = db.prepare('SELECT id FROM etudiant WHERE id = ?').get(etudId);
  if (!e) return res.status(404).json({ error: 'étudiant introuvable' });

  const { sections } = sectionsDeLEtudiant(etudId, req.query.section);
  if (!sections.length) return res.json({ nodes: [], edges: [], sections: [] });

  const anneeRef = db.prepare('SELECT code FROM annee_scolaire WHERE active = 1').get()?.code || annee;
  const ph = sections.map(() => '?').join(',');

  const ues = db.prepare(`
    SELECT ue_num, MIN(ue_nom) AS ue_nom, MIN(ue_niv) AS ue_niv, MIN(section) AS section
    FROM ue WHERE annee_scolaire = ? AND section IN (${ph})
    GROUP BY ue_num
  `).all(anneeRef, ...sections);
  if (!ues.length) return res.json({ nodes: [], edges: [], sections });
  const ueSet = new Set(ues.map(u => u.ue_num));

  // Arêtes limitées aux UE de la ou des sections retenues
  const edges = db.prepare('SELECT ue_num, prerequis_num FROM ue_prerequis').all()
    .filter(p => ueSet.has(p.ue_num) && ueSet.has(p.prerequis_num))
    .map(p => ({ from: p.prerequis_num, to: p.ue_num }));
  const prereqDe = {};
  for (const eg of edges) (prereqDe[eg.to] = prereqDe[eg.to] || []).push(eg.from);

  // État de l'étudiant
  const acquis = new Set([
    ...db.prepare("SELECT DISTINCT ue_num FROM etudiant_inscription WHERE etudiant_id = ? AND resultat = 'reussi'").all(etudId).map(r => r.ue_num),
    ...db.prepare("SELECT DISTINCT ue_num FROM etudiant_valorisation WHERE etudiant_id = ? AND type = 'complete'").all(etudId).map(r => r.ue_num),
  ]);
  const inscrites = new Set(
    db.prepare('SELECT ue_num FROM etudiant_inscription WHERE etudiant_id = ? AND annee_scolaire = ?')
      .all(etudId, annee).map(r => r.ue_num));
  const organisees = new Set(
    db.prepare(`SELECT DISTINCT ue_num FROM organisation_ue WHERE annee_scolaire = ? AND section IN (${ph})`)
      .all(annee, ...sections).map(r => r.ue_num));

  const niv = {};
  for (const u of ues) niv[u.ue_num] = (u.ue_niv || '').toUpperCase();

  // Proposition : point fixe intra-niveau, sur les UE organisées non acquises
  const proposees = new Set();
  const sousReserve = new Set();
  let stable = false;
  while (!stable) {
    stable = true;
    for (const u of ues) {
      const n = u.ue_num;
      if (acquis.has(n) || proposees.has(n) || !organisees.has(n)) continue;
      const manquants = (prereqDe[n] || []).filter(p => !acquis.has(p));
      if (manquants.every(p => proposees.has(p) && niv[p] === niv[n])) {
        proposees.add(n);
        if (manquants.length) sousReserve.add(n);
        stable = false;
      }
    }
  }

  // Couches : profondeur = plus long chemin depuis une UE sans prérequis
  const profondeur = {};
  const calcul = (n, vus = new Set()) => {
    if (profondeur[n] !== undefined) return profondeur[n];
    if (vus.has(n)) return 0;                      // garde-fou anti-cycle
    vus.add(n);
    const ps = prereqDe[n] || [];
    const d = ps.length ? 1 + Math.max(...ps.map(p => calcul(p, vus))) : 0;
    profondeur[n] = d;
    return d;
  };
  for (const u of ues) calcul(u.ue_num);

  const nodes = ues.map(u => {
    const n = u.ue_num;
    const statut = acquis.has(n) ? 'acquise'
      : sousReserve.has(n) ? 'sous_reserve'
      : proposees.has(n) ? 'accessible'
      : 'bloquee';
    return {
      ue_num: n,
      ue_nom: u.ue_nom,
      ue_niv: u.ue_niv,
      couche: profondeur[n] || 0,
      statut,
      inscrite: inscrites.has(n),
      organisee: organisees.has(n),
      prereq_manquants: (prereqDe[n] || []).filter(p => !acquis.has(p)),
    };
  }).sort((a, b) => a.couche - b.couche || a.ue_num - b.ue_num);

  res.json({ nodes, edges, sections, annee });
});

// ── Grille de parcours : UE (lignes, BA1→BA3) × années (colonnes) ────────────
r.get('/:id/grille', authRequired, (req, res) => {
  const etudId = Number(req.params.id);
  const e = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(etudId);
  if (!e) return res.status(404).json({ error: 'étudiant introuvable' });

  // Sections de l'étudiant (dominantes) — paramètre ?section= prioritaire
  const { sections, scores: sectionsScores } = sectionsDeLEtudiant(etudId, req.query.section);

  // Année active pour le référentiel UE
  const anneeActive = db.prepare('SELECT code FROM annee_scolaire WHERE active = 1').get()?.code;

  // Les UE de la section (référentiel année active), triées BA1→BA3 puis numéro
  let ues = [];
  if (sections.length) {
    const ph = sections.map(() => '?').join(',');
    ues = db.prepare(`
      SELECT DISTINCT ue_num, ue_nom, ue_niv, section FROM ue
      WHERE annee_scolaire = ? AND section IN (${ph})
      ORDER BY
        CASE UPPER(COALESCE(ue_niv,'')) WHEN 'BA1' THEN 1 WHEN 'BA2' THEN 2 WHEN 'BA3' THEN 3 ELSE 4 END,
        ue_num
    `).all(anneeActive, ...sections);
  }

  // Prérequis par UE
  const prereqs = db.prepare('SELECT ue_num, prerequis_num FROM ue_prerequis').all();
  const prereqDe = {};
  for (const p of prereqs) {
    (prereqDe[p.ue_num] = prereqDe[p.ue_num] || []).push(p.prerequis_num);
  }

  // Cellules : inscriptions + VA complètes
  const inscriptions = db.prepare(
    'SELECT * FROM etudiant_inscription WHERE etudiant_id = ?').all(etudId);
  const vas = db.prepare(
    "SELECT * FROM etudiant_valorisation WHERE etudiant_id = ? AND type = 'complete'").all(etudId);

  const cellules = {};
  for (const i of inscriptions) {
    (cellules[i.annee_scolaire] = cellules[i.annee_scolaire] || {})[i.ue_num] = {
      kind: i.resultat || 'inscrit', points: i.points, derogation: !!i.derogation, id: i.id,
    };
  }
  for (const v of vas) {
    (cellules[v.annee_scolaire] = cellules[v.annee_scolaire] || {})[v.ue_num] = {
      kind: 'va', points: v.pourcentage, derogation: false, vid: v.id,
    };
  }

  // Années : celles des données + année active, triées
  const annees = [...new Set([...Object.keys(cellules), anneeActive].filter(Boolean))].sort();

  // Acquis explicites (réussite ou VA, toutes années)
  const acquis = new Set();
  for (const [, parUe] of Object.entries(cellules)) {
    for (const [ueNum, cell] of Object.entries(parUe)) {
      if (cell.kind === 'reussi' || cell.kind === 'va') acquis.add(Number(ueNum));
    }
  }

  // Suggestion (inférence) : prérequis transitifs des UE inscrites — aide à l'encodage
  const inscritesToutes = new Set(inscriptions.map(i => i.ue_num));
  const suggerees = new Set();
  const pile = [...inscritesToutes];
  const prereqMap = new Map(Object.entries(prereqDe).map(([k, v]) => [Number(k), v]));
  while (pile.length) {
    const ue = pile.pop();
    for (const pr of (prereqMap.get(ue) || [])) {
      if (!suggerees.has(pr)) { suggerees.add(pr); pile.push(pr); }
    }
  }

  // Cellules avec notes détaillées (pour l'indicateur visuel)
  const detailSet = db.prepare(`
    SELECT DISTINCT annee_scolaire, ue_num FROM etudiant_note_detail WHERE etudiant_id = ?
  `).all(etudId).map(d => d.annee_scolaire + ':' + d.ue_num);

  res.json({
    etudiant: { id: e.id, nom: e.nom, prenom: e.prenom },
    sections, sections_scores: sectionsScores, annees, anneeActive, detail: detailSet,
    ues: ues.map(u => ({
      ...u,
      prerequis: prereqDe[u.ue_num] || [],
      deverrouillee: (prereqDe[u.ue_num] || []).every(p => acquis.has(p)),
      acquise: acquis.has(u.ue_num),
      suggeree: suggerees.has(u.ue_num) && !acquis.has(u.ue_num),
    })),
    cellules,
  });
});

// ── Écrire une cellule de la grille ──────────────────────────────────────────
r.put('/:id/grille', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const etudId = Number(req.params.id);
  const { annee, ue_num, kind, points, derogation } = req.body;
  if (!annee || !ue_num || !kind) {
    return res.status(400).json({ error: 'annee, ue_num et kind requis' });
  }
  const KINDS = ['inscrit', 'reussi', 'ajourne', 'absent', 'va', 'effacer'];
  if (!KINDS.includes(kind)) return res.status(400).json({ error: 'kind invalide' });

  const ueN = Number(ue_num);

  // Toujours nettoyer les deux sources pour cette cellule
  const delInsc = () => db.prepare(
    'DELETE FROM etudiant_inscription WHERE etudiant_id=? AND annee_scolaire=? AND ue_num=?'
  ).run(etudId, annee, ueN);
  const delVa = () => db.prepare(
    "DELETE FROM etudiant_valorisation WHERE etudiant_id=? AND annee_scolaire=? AND ue_num=? AND type='complete'"
  ).run(etudId, annee, ueN);

  if (kind === 'effacer') {
    delInsc(); delVa();
    return res.json({ ok: true });
  }

  if (kind === 'va') {
    delInsc(); delVa();
    db.prepare(`
      INSERT INTO etudiant_valorisation
        (etudiant_id, annee_scolaire, ue_num, type, pourcentage)
      VALUES (?,?,?,'complete',?)
    `).run(etudId, annee, ueN, points != null ? Number(points) : 50);
    return res.json({ ok: true });
  }

  // inscrit / reussi / ajourne / absent → etudiant_inscription
  delVa();
  db.prepare(`
    INSERT INTO etudiant_inscription (etudiant_id, annee_scolaire, ue_num, resultat, points, derogation)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(etudiant_id, annee_scolaire, ue_num) DO UPDATE SET
      resultat = excluded.resultat, points = excluded.points, derogation = excluded.derogation
  `).run(etudId, annee, ueN, kind === 'inscrit' ? null : kind,
         points != null ? Number(points) : null, derogation ? 1 : 0);
  res.json({ ok: true });
});

// ── Détail des notes par cours et par AA (cellule UE × année) ────────────────
r.get('/:id/grille/detail', authRequired, (req, res) => {
  const etudId = Number(req.params.id);
  const { annee, ue_num } = req.query;
  if (!annee || !ue_num) return res.status(400).json({ error: 'annee et ue_num requis' });
  const ueN = Number(ue_num);

  const cours = db.prepare(`
    SELECT cours_code, cours_nom FROM cours
    WHERE ue_num = ? AND annee_scolaire = ? ORDER BY cours_code
  `).all(ueN, annee);
  // Fallback : si le référentiel de cette année-là n'existe pas, prendre l'année active
  let coursFinal = cours;
  if (!cours.length) {
    const aAct = db.prepare('SELECT code FROM annee_scolaire WHERE active = 1').get()?.code;
    coursFinal = db.prepare(`
      SELECT cours_code, cours_nom FROM cours
      WHERE ue_num = ? AND annee_scolaire = ? ORDER BY cours_code
    `).all(ueN, aAct);
  }
  const aas = db.prepare(`
    SELECT aa_code, aa_num, cours_code, description FROM aa
    WHERE ue_num = ? ORDER BY aa_num
  `).all(ueN);

  const notes = db.prepare(`
    SELECT type, code, points, va, commentaire FROM etudiant_note_detail
    WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?
  `).all(etudId, annee, ueN);
  const notesMap = {};
  for (const n of notes) notesMap[n.type + ':' + n.code] = n;

  res.json({ cours: coursFinal, aas, notes: notesMap });
});

r.put('/:id/grille/detail', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const etudId = Number(req.params.id);
  const { annee, ue_num, type, code, points, va } = req.body;
  if (!annee || !ue_num || !type || !code) {
    return res.status(400).json({ error: 'annee, ue_num, type et code requis' });
  }
  if (!['cours', 'aa'].includes(type)) return res.status(400).json({ error: 'type invalide' });

  const vide = (points == null || points === '') && !va;
  if (vide) {
    db.prepare(`
      DELETE FROM etudiant_note_detail
      WHERE etudiant_id=? AND annee_scolaire=? AND ue_num=? AND type=? AND code=?
    `).run(etudId, annee, Number(ue_num), type, code);
  } else {
    db.prepare(`
      INSERT INTO etudiant_note_detail (etudiant_id, annee_scolaire, ue_num, type, code, points, va)
      VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(etudiant_id, annee_scolaire, ue_num, type, code) DO UPDATE SET
        points = excluded.points, va = excluded.va
    `).run(etudId, annee, Number(ue_num), type, code,
           points != null && points !== '' ? Number(points) : (va ? 50 : null), va ? 1 : 0);
  }
  res.json({ ok: true });
});

// ── Valorisation des acquis (VA/VAE) — AGCF 13-12-2024 ──────────────────────
r.get('/:id/valorisations', authRequired, (req, res) => {
  const rows = db.prepare(`
    SELECT v.*, u.ue_nom, u.section
    FROM etudiant_valorisation v
    LEFT JOIN ue u ON u.ue_num = v.ue_num AND u.annee_scolaire = v.annee_scolaire
    WHERE v.etudiant_id = ?
    ORDER BY v.annee_scolaire DESC, v.ue_num
  `).all(Number(req.params.id));
  res.json(rows);
});

r.post('/:id/valorisations', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { annee_scolaire, ue_num, type, cible, cible_detail, pourcentage,
          decision_ce_date, commentaire } = req.body;
  if (!annee_scolaire || !ue_num || !type) {
    return res.status(400).json({ error: 'annee_scolaire, ue_num et type requis' });
  }
  if (!['complete','partielle','admission'].includes(type)) {
    return res.status(400).json({ error: 'type invalide' });
  }
  if (type === 'partielle' && !['aa','cours'].includes(cible)) {
    return res.status(400).json({ error: 'dispense partielle : cible aa ou cours requise' });
  }
  db.prepare(`
    INSERT INTO etudiant_valorisation
      (etudiant_id, annee_scolaire, ue_num, type, cible, cible_detail,
       pourcentage, decision_ce_date, commentaire)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(Number(req.params.id), annee_scolaire, Number(ue_num), type,
         type === 'partielle' ? cible : null,
         type === 'partielle' ? (cible_detail || null) : null,
         pourcentage != null ? Number(pourcentage) : (type !== 'admission' ? 50 : null),
         decision_ce_date || null, commentaire || null);
  res.json({ ok: true });
});

r.delete('/valorisations/:vid', authRequired, roleRequired('admin'), (req, res) => {
  db.prepare('DELETE FROM etudiant_valorisation WHERE id = ?').run(Number(req.params.vid));
  res.json({ ok: true });
});

// Cibles disponibles pour une dispense partielle : les cours et AA d'une UE
r.get('/ue/:ueNum/composantes', authRequired, (req, res) => {
  const ueNum = Number(req.params.ueNum);
  const annee = req.query.annee;
  const cours = db.prepare(`
    SELECT cours_code, cours_nom FROM cours
    WHERE ue_num = ? ${annee ? 'AND annee_scolaire = ?' : ''}
    ORDER BY cours_code
  `).all(...(annee ? [ueNum, annee] : [ueNum]));
  const aas = db.prepare(`
    SELECT aa_code, aa_num, cours_code, description FROM aa
    WHERE ue_num = ? ORDER BY aa_num
  `).all(ueNum);
  res.json({ cours, aas });
});

// ── Dossier individuel : les 5 pièces réglementaires ─────────────────────────
r.get('/:id/pieces', authRequired, (req, res) => {
  const etudId = Number(req.params.id);
  const existantes = db.prepare(
    'SELECT type_piece, statut, commentaire, maj_le FROM etudiant_piece WHERE etudiant_id = ?'
  ).all(etudId);
  const map = Object.fromEntries(existantes.map(p => [p.type_piece, p]));
  res.json(PIECES_APPRENANT.map(p => ({
    ...p,
    statut: map[p.type]?.statut || 'manquant',
    commentaire: map[p.type]?.commentaire || null,
    maj_le: map[p.type]?.maj_le || null,
  })));
});

r.put('/:id/pieces/:type', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { statut, commentaire } = req.body;
  if (!['manquant', 'recu', 'na'].includes(statut)) {
    return res.status(400).json({ error: 'statut invalide (manquant|recu|na)' });
  }
  if (!PIECES_APPRENANT.some(p => p.type === req.params.type)) {
    return res.status(400).json({ error: 'type de pièce inconnu' });
  }
  db.prepare(`
    INSERT INTO etudiant_piece (etudiant_id, type_piece, statut, commentaire, maj_le)
    VALUES (?,?,?,?, datetime('now'))
    ON CONFLICT(etudiant_id, type_piece) DO UPDATE SET
      statut = excluded.statut, commentaire = excluded.commentaire, maj_le = datetime('now')
  `).run(Number(req.params.id), req.params.type, statut, commentaire || null);
  res.json({ ok: true });
});

// ── Fiche d'inscription / reçu (HTML imprimable, contenu circulaire 9764) ────
// Structure : acquis antérieurs EN HAUT (réussites + VA), puis les UE de
// l'inscription de l'année avec mentions réglementaires et sous réserve.
r.get('/:id/fiche-inscription', authRequired, (req, res) => {
  const etudId = Number(req.params.id);
  const annee = req.query.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const e = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(etudId);
  if (!e) return res.status(404).json({ error: 'étudiant introuvable' });

  const etab = (() => {
    try {
      return db.prepare("SELECT valeur FROM lucie_config WHERE cle = 'etablissement_nom'").get()?.valeur
        || 'Institut Ilya Prigogine';
    } catch { return 'Institut Ilya Prigogine'; }
  })();

  // 1. Acquis antérieurs : réussites encodées + VA complètes
  const reussites = db.prepare(`
    SELECT i.annee_scolaire, i.ue_num, i.points, u.ue_nom, 'reussi' AS kind
    FROM etudiant_inscription i
    LEFT JOIN ue u ON u.ue_num = i.ue_num AND u.annee_scolaire = i.annee_scolaire
    WHERE i.etudiant_id = ? AND i.annee_scolaire < ? AND i.resultat = 'reussi'
  `).all(etudId, annee);
  const vasAcq = db.prepare(`
    SELECT v.annee_scolaire, v.ue_num, v.pourcentage AS points, u.ue_nom, 'va' AS kind
    FROM etudiant_valorisation v
    LEFT JOIN ue u ON u.ue_num = v.ue_num AND u.annee_scolaire = v.annee_scolaire
    WHERE v.etudiant_id = ? AND v.type = 'complete'
  `).all(etudId);
  const acquisRows = [...reussites, ...vasAcq].sort((a, b) =>
    String(a.annee_scolaire || '').localeCompare(String(b.annee_scolaire || '')) || a.ue_num - b.ue_num);
  const acquisSet = new Set(acquisRows.map(a => a.ue_num));

  // Historique complet exigé : ajournés / absents antérieurs
  const autres = db.prepare(`
    SELECT i.annee_scolaire, i.ue_num, i.resultat, u.ue_nom
    FROM etudiant_inscription i
    LEFT JOIN ue u ON u.ue_num = i.ue_num AND u.annee_scolaire = i.annee_scolaire
    WHERE i.etudiant_id = ? AND i.annee_scolaire < ? AND i.resultat IN ('ajourne','absent')
    ORDER BY i.annee_scolaire, i.ue_num
  `).all(etudId, annee);

  // 2. UE de l'inscription de l'année
  const inscriptions = db.prepare(`
    SELECT i.*, u.ue_nom, u.section
    FROM etudiant_inscription i
    LEFT JOIN ue u ON u.ue_num = i.ue_num AND u.annee_scolaire = i.annee_scolaire
    WHERE i.etudiant_id = ? AND i.annee_scolaire = ?
    ORDER BY u.section, i.ue_num
  `).all(etudId, annee);

  // Sous réserve : prérequis non acquis mais inscrits la même année
  const prereqs = db.prepare('SELECT ue_num, prerequis_num FROM ue_prerequis').all();
  const prereqDe = {};
  for (const p of prereqs) (prereqDe[p.ue_num] = prereqDe[p.ue_num] || []).push(p.prerequis_num);
  const inscritesAnnee = new Set(inscriptions.map(i => i.ue_num));
  const anneeRefNiv2 = db.prepare('SELECT code FROM annee_scolaire WHERE active = 1').get()?.code || annee;
  const nivRows2 = db.prepare('SELECT DISTINCT ue_num, ue_niv FROM ue WHERE annee_scolaire = ?').all(anneeRefNiv2);
  const nivDe2 = {};
  for (const n of nivRows2) nivDe2[n.ue_num] = (n.ue_niv || '').toUpperCase();
  const sousReserveDe = ueNum => {
    const manquants = (prereqDe[ueNum] || []).filter(p => !acquisSet.has(p));
    return manquants.length && manquants.every(p =>
      inscritesAnnee.has(p) && nivDe2[p] === nivDe2[ueNum]) ? manquants : null;
  };

  const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;');

  const lignesAcquis = acquisRows.map(a => `
    <tr>
      <td>${esc(a.annee_scolaire || '—')}</td>
      <td>${a.ue_num}</td>
      <td>${esc(a.ue_nom || '')}</td>
      <td>${a.kind === 'va' ? '<b>Valorisation des acquis</b>' : 'Réussite'}</td>
      <td style="text-align:right">${a.points != null ? a.points + ' %' : '—'}</td>
    </tr>`).join('');

  const lignesAutres = autres.map(h => `
    <tr>
      <td>${esc(h.annee_scolaire)}</td><td>${h.ue_num}</td>
      <td>${esc(h.ue_nom || '')}</td>
      <td colspan="2">${h.resultat === 'ajourne' ? 'Ajourné' : 'Absent'}</td>
    </tr>`).join('');

  const lignesInsc = inscriptions.map(i => {
    const sr = sousReserveDe(i.ue_num);
    return `
    <tr>
      <td>${i.ue_num}</td>
      <td>${esc(i.ue_nom || '')}${i.codiplomation_ch ? ' <b>(CH)</b>' : ''}${sr ? ' <i>(sous réserve de la réussite de l\u2019UE ' + sr.join(', ') + ')</i>' : ''}</td>
      <td>${esc(i.section || '')}</td>
      <td>${esc(i.date_inscription || '')}</td>
      <td>${i.admission_type === 'titre' ? 'Titre' : i.admission_type === 'test' ? 'Test' : '—'}</td>
      <td>${i.dispense_complete ? 'Dispense complète' : '—'}</td>
      <td style="text-align:right">${i.di_specifique != null ? Number(i.di_specifique).toFixed(2) + ' €' : '—'}</td>
      <td style="text-align:right">${i.ects != null ? i.ects : '—'}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<title>Fiche d'inscription — ${esc(e.nom)} ${esc(e.prenom)}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1B2B4B; margin: 32px; }
  h1 { font-size: 17px; margin: 0 0 2px; } h2 { font-size: 13px; margin: 18px 0 6px; }
  .etab { font-size: 13px; font-weight: 600; }
  .meta { color: #556; margin-bottom: 14px; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 10px; }
  th, td { border: 1px solid #cbd5e1; padding: 4px 7px; text-align: left; }
  th { background: #f1f5f9; font-size: 10.5px; text-transform: uppercase; letter-spacing: .4px; }
  .sig { margin-top: 34px; display: flex; gap: 60px; }
  .sig div { flex: 1; border-top: 1px solid #94a3b8; padding-top: 5px; font-size: 11px; }
  .footer { margin-top: 22px; font-size: 10px; color: #64748b; }
  @media print { body { margin: 12mm; } }
</style></head><body>
<div class="etab">${esc(etab)} — Enseignement pour Adultes</div>
<h1>Fiche d'inscription / reçu — ${esc(annee)}</h1>
<div class="meta">
  ${esc(e.titre || '')} <b>${esc(e.nom)} ${esc(e.prenom)}</b>
  ${e.date_naissance ? ' · né(e) le ' + esc(e.date_naissance) : ''}
  ${e.num_national ? ' · RN ' + esc(e.num_national) : ''}<br>
  ${esc([e.adresse, e.cp, e.localite].filter(Boolean).join(', '))}
  ${e.email_ecole ? ' · ' + esc(e.email_ecole) : ''}
</div>

${acquisRows.length || autres.length ? `
<h2>Parcours antérieur au sein de l'établissement</h2>
<table>
  <thead><tr><th>Année</th><th>UE</th><th>Intitulé</th><th>Mode d'acquisition</th><th>Points</th></tr></thead>
  <tbody>${lignesAcquis}${lignesAutres}</tbody>
</table>` : ''}

<h2>Unités d'enseignement — inscription ${esc(annee)}</h2>
<table>
  <thead><tr>
    <th>UE</th><th>Intitulé</th><th>Section</th><th>Date d'inscription</th>
    <th>Admission</th><th>Valorisation</th><th>DI spécifique</th><th>ECTS</th>
  </tr></thead>
  <tbody>${lignesInsc || '<tr><td colspan="8" style="text-align:center;color:#94a3b8">Aucune UE inscrite pour cette année — encodez les inscriptions dans la grille de parcours</td></tr>'}</tbody>
</table>

<div class="sig">
  <div>Signature de l'apprenant</div>
  <div>Pour l'établissement</div>
</div>
<div class="footer">
  Mention « CH » : UE suivie dans le cadre d'un programme d'études en codiplômation.
  « Sous réserve » : l'accès effectif dépend de la réussite de l'UE prérequise organisée la même année.
  Document imprimé le ${new Date().toLocaleDateString('fr-BE')} — ${esc(etab)}.
</div>
</body></html>`;

  res.json({ html, nom: 'fiche_inscription_' + (e.nom || 'etudiant') + '_' + annee + '.html' });
});

// ── Ajouter un étudiant manuellement ─────────────────────────────────────────
r.post('/', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { nom, prenom, annee, ue_nums, ...rest } = req.body;
  if (!nom || !prenom) return res.status(400).json({ error: 'nom et prenom requis' });

  const info = db.prepare(`
    INSERT INTO etudiant (nom, prenom, email_ecole, email_perso, date_naissance,
                         num_national, gsm, adresse, localite, cp, titre)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(nom, prenom, rest.email_ecole||null, rest.email_perso||null,
         rest.date_naissance||null, rest.num_national||null, rest.gsm||null,
         rest.adresse||null, rest.localite||null, rest.cp||null, rest.titre||null);

  const id = Number(info.lastInsertRowid);

  // Inscriptions initiales
  if (annee && Array.isArray(ue_nums)) {
    const ins = db.prepare(
      'INSERT OR IGNORE INTO etudiant_inscription (etudiant_id,annee_scolaire,ue_num) VALUES (?,?,?)'
    );
    for (const n of ue_nums) ins.run(id, annee, Number(n));
  }

  res.json({ ok: true, id });
});

// ── Import depuis le fichier eCampus Excel ───────────────────────────────────
// Le frontend lit le fichier XLS/XLSX avec SheetJS et envoie les données en JSON.
// La colonne Code_UE contient directement le ue_num Lucie.
r.post('/import-excel', authRequired, roleRequired('admin', 'editeur'), async (req, res) => {
  const { annee, etudiants: etudiantsData, inscriptions: inscriptionsData } = req.body;
  if (!annee || !Array.isArray(etudiantsData)) {
    return res.status(400).json({ error: 'annee et etudiants requis' });
  }

  try {
    const insEtud = db.prepare(`
      INSERT INTO etudiant (id_ecampus,nom,prenom,email_ecole,email_perso,
        date_naissance,num_national,gsm,adresse,localite,cp,titre)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id_ecampus) DO UPDATE SET
        nom=excluded.nom, prenom=excluded.prenom,
        email_ecole=excluded.email_ecole, email_perso=excluded.email_perso
    `);
    const insInsc = db.prepare(`
      INSERT OR IGNORE INTO etudiant_inscription (etudiant_id,annee_scolaire,ue_num,groupe)
      SELECT id,?,?,? FROM etudiant WHERE id_ecampus=? LIMIT 1
    `);

    let etudiants_crees=0, inscriptions_creees=0;
    const tx = db.transaction(() => {
      for (const e of etudiantsData) {
        const r = insEtud.run(e.id_ecampus||null, e.nom||'', e.prenom||'',
          e.email_ecole||null, e.email_perso||null, e.date_naissance||null,
          e.num_national||null, e.gsm||null, e.adresse||null,
          e.localite||null, e.cp||null, e.titre||null);
        if (r.changes) etudiants_crees++;
      }
      for (const i of inscriptionsData) {
        if (!i.ue_num || isNaN(Number(i.ue_num))) continue;
        const r = insInsc.run(annee, Number(i.ue_num), i.groupe||null, i.id_ecampus);
        if (r.changes) inscriptions_creees++;
      }
    });
    tx();

    res.json({ ok:true, etudiants: etudiantsData.length, etudiants_crees,
               inscriptions: inscriptionsData.length, inscriptions_creees, annee });
  } catch(e) {
    console.error('Import étudiants:', e);
    res.status(500).json({ error: e.message });
  }
});


export default r;
