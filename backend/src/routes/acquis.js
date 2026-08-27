// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Acquis d'apprentissage : pondérations et calcul de la note d'UE
//
// En enseignement pour adultes, la note d'une UE se détermine à partir des
// acquis d'apprentissage, pas des cours pris globalement. Chaque AA porte deux
// poids :
//
//   · sa pondération DANS son cours (0 à 100 ; la somme fait 100 par cours) ;
//   · le poids de son cours, égal aux périodes prévues au dossier pédagogique,
//     part d'autonomie exclue.
//
//   note UE (%) =  Σ ( note_AA × pondération_AA × périodes_cours )
//                 ─────────────────────────────────────────────────
//                  Σ ( 100     × pondération_AA × périodes_cours )
//
// Un même AA peut figurer dans deux cours : il compte alors deux fois, avec la
// pondération et les périodes propres à chaque cours. Sa note est donc stockée
// PAR COURS, jamais globalement.
//
// Un AA non évalué (dispense accordée, activité non organisée) sort du
// numérateur ET du dénominateur : il ne pénalise pas l'étudiant.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';

const r = Router();

export function migrerAA(dbx) {
  try {
    dbx.exec(`
    CREATE TABLE IF NOT EXISTS aa_ponderation (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ue_num      INTEGER NOT NULL,
      cours_code  TEXT NOT NULL,
      aa_code     TEXT NOT NULL,
      poids       REAL NOT NULL DEFAULT 0,
      maj_le      TEXT DEFAULT (datetime('now')),
      UNIQUE(cours_code, aa_code)
    );
    CREATE INDEX IF NOT EXISTS idx_aa_pond_ue ON aa_ponderation(ue_num);

    CREATE TABLE IF NOT EXISTS etudiant_report_note (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      etudiant_id    INTEGER NOT NULL,
      annee_scolaire TEXT NOT NULL,        -- année où le report s'applique
      ue_num         INTEGER NOT NULL,
      cours_code     TEXT NOT NULL,
      note           REAL NOT NULL,        -- note reportée, sur 20
      annee_origine  TEXT,                 -- année où le cours a été validé
      decision_ce    TEXT,
      cree_le        TEXT DEFAULT (datetime('now')),
      UNIQUE(etudiant_id, annee_scolaire, ue_num, cours_code)
    );

    CREATE TABLE IF NOT EXISTS cours_ponderation (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ue_num      INTEGER NOT NULL,
      cours_code  TEXT NOT NULL,
      poids       REAL NOT NULL DEFAULT 0,
      maj_le      TEXT DEFAULT (datetime('now')),
      UNIQUE(ue_num, cours_code)
    );
    `);

    // La note d'un AA se rattache au cours dans lequel il est évalué.
    const cols = dbx.prepare('PRAGMA table_info(etudiant_note_detail)').all().map(c => c.name);
    if (!cols.includes('cours_code')) {
      dbx.exec('ALTER TABLE etudiant_note_detail ADD COLUMN cours_code TEXT');
      console.log('[migration] etudiant_note_detail.cours_code ajoutée');
    }
    if (!cols.includes('non_evalue')) {
      dbx.exec('ALTER TABLE etudiant_note_detail ADD COLUMN non_evalue INTEGER NOT NULL DEFAULT 0');
      console.log('[migration] etudiant_note_detail.non_evalue ajoutée');
    }
    console.log('[migration] aa_ponderation créée');
  } catch (e) { console.error('[migration] aa :', e.message); }
}

// Le poids d'un cours dans son UE est un pourcentage explicite : les poids
// des cours d'une UE totalisent 100. Il découle des périodes du dossier
// pédagogique, mais reste saisi — l'arrondi retenu par le Conseil des études
// n'est pas toujours celui d'un calcul (42 / 31 / 27, par exemple).

/**
 * Structure d'évaluation d'une UE : ses cours, leurs AA, les pondérations et
 * les périodes. Sert au calcul comme à l'écran de paramétrage.
 */
export function structureUE(ueNum, annee) {
  const anneeRef = annee
    || db.prepare('SELECT code FROM annee_scolaire WHERE active = 1').get()?.code;

  let cours = db.prepare(`
    SELECT cours_code, cours_nom, cours_per FROM cours
    WHERE ue_num = ? AND annee_scolaire = ? ORDER BY cours_code
  `).all(ueNum, anneeRef);
  if (!cours.length) {
    cours = db.prepare(`
      SELECT cours_code, MIN(cours_nom) AS cours_nom, MAX(cours_per) AS cours_per
      FROM cours WHERE ue_num = ? GROUP BY cours_code ORDER BY cours_code
    `).all(ueNum);
  }

  const aas = db.prepare(
    'SELECT aa_code, aa_num, cours_code, description FROM aa WHERE ue_num = ? ORDER BY aa_num'
  ).all(ueNum);

  const pond = {};
  for (const p of db.prepare('SELECT cours_code, aa_code, poids FROM aa_ponderation WHERE ue_num = ?').all(ueNum)) {
    pond[p.cours_code + '|' + p.aa_code] = Number(p.poids);
  }
  // Le poids d'un cours dans son UE se DÉDUIT de ses périodes, part
  // d'autonomie exclue : poids = périodes du cours ÷ périodes de l'UE.
  // Il n'est jamais saisi. Les décimales sont conservées pour le calcul ;
  // seul l'affichage arrondit à l'unité.
  const totalPeriodes = cours.reduce((s, x) => s + Number(x.cours_per || 0), 0);
  const poidsCours = {};
  for (const x of cours) {
    poidsCours[x.cours_code] = totalPeriodes
      ? (Number(x.cours_per || 0) / totalPeriodes) * 100
      : null;
  }

  return cours.map(c => {
    const siens = aas.filter(a => a.cours_code === c.cours_code).map(a => ({
      ...a, poids: pond[c.cours_code + '|' + a.aa_code] ?? null,
    }));
    const somme = siens.reduce((s, a) => s + (a.poids || 0), 0);
    return {
      ...c,
      periodes: Number(c.cours_per || 0),
      poids_cours: poidsCours[c.cours_code] ?? null,
      poids_cours_affiche: poidsCours[c.cours_code] != null
        ? Math.round(poidsCours[c.cours_code]) : null,
      aas: siens,
      somme_poids: Math.round(somme * 100) / 100,
      complet: siens.length > 0 && Math.abs(somme - 100) < 0.01,
    };
  });
}

/**
 * Note d'une UE pour un étudiant, calculée depuis ses notes d'AA.
 * notes : { 'cours_code|aa_code': { points, non_evalue } }
 */
export function calculerNoteUE(ueNum, annee, notes, reports = {}) {
  const structure = structureUE(ueNum, annee);
  let numerateur = 0, maximum = 0;
  let evalues = 0, attendus = 0;

  for (const c of structure) {
    const pc = c.poids_cours;
    if (!pc) continue;                              // poids du cours non encodé

    // Report de note : le cours a été validé lors d'une session antérieure
    // alors que l'UE échouait. Sa note est reprise telle quelle et ses acquis
    // ne sont pas réévalués.
    const rn = reports[c.cours_code];
    if (rn != null) {
      attendus++; evalues++;
      numerateur += Number(rn) * pc;
      maximum    += 20 * pc;
      continue;
    }

    for (const a of c.aas) {
      if (!a.poids) continue;                       // pondération de l'AA non encodée
      attendus++;
      const n = notes[c.cours_code + '|' + a.aa_code];
      if (!n || n.non_evalue || n.points == null || n.points === '') continue;
      evalues++;
      const facteur = a.poids * pc;                 // pondération dans le cours × poids du cours
      numerateur += Number(n.points) * facteur;
      maximum    += 20 * facteur;                   // les acquis sont cotés sur 20
    }
  }

  if (!maximum) return { sur20: null, sur20_exact: null, pourcentage: null, evalues, attendus, complet: false };
  // Le calcul garde toutes ses décimales ; l'affichage arrondit à l'unité.
  const exact = (numerateur / maximum) * 20;
  return {
    sur20: Math.round(exact),
    sur20_exact: Math.round(exact * 1000) / 1000,
    pourcentage: Math.round(exact * 5),
    evalues, attendus,
    complet: evalues === attendus && attendus > 0,
  };
}

// Note d'un cours pour un étudiant — utile à l'affichage et aux dispenses.
export function calculerNoteCours(cours, notes) {
  let num = 0, max = 0, evalues = 0;
  for (const a of cours.aas) {
    if (!a.poids) continue;
    const n = notes[cours.cours_code + '|' + a.aa_code];
    if (!n || n.non_evalue || n.points == null || n.points === '') continue;
    evalues++;
    num += Number(n.points) * a.poids;
    max += 20 * a.poids;
  }
  if (!max) return { sur20: null, sur20_exact: null, evalues };
  const exact = (num / max) * 20;
  return { sur20: Math.round(exact), sur20_exact: Math.round(exact * 1000) / 1000, evalues };
}

/**
 * Notes de cours d'un étudiant pour une UE, année par année.
 * Sert à repérer les cours validés dans une UE non réussie : ce sont eux qui
 * ouvrent droit à un report de note.
 */
export function coursValidesAnterieurs(etudId, ueNum, anneeCible) {
  const lignes = db.prepare(`
    SELECT annee_scolaire, code, cours_code, points, non_evalue
    FROM etudiant_note_detail
    WHERE etudiant_id = ? AND ue_num = ? AND type = 'aa' AND annee_scolaire < ?
  `).all(etudId, ueNum, anneeCible);
  if (!lignes.length) return [];

  // Résultat de l'UE par année : un report ne se justifie que si l'UE a échoué
  const resultats = {};
  for (const i of db.prepare(`
    SELECT annee_scolaire, resultat FROM etudiant_inscription
    WHERE etudiant_id = ? AND ue_num = ?
  `).all(etudId, ueNum)) {
    resultats[i.annee_scolaire] = i.resultat;
  }

  const parAnnee = {};
  for (const l of lignes) (parAnnee[l.annee_scolaire] = parAnnee[l.annee_scolaire] || []).push(l);

  const candidats = [];
  for (const [an, lg] of Object.entries(parAnnee)) {
    if (resultats[an] === 'reussi') continue;          // UE réussie : rien à reporter
    const structure = structureUE(ueNum, an);
    const notes = {};
    for (const l of lg) {
      const brut = String(l.code).includes('|') ? String(l.code).split('|')[1] : l.code;
      const cc = l.cours_code
        || structure.find(c => c.aas.some(a => a.aa_code === brut))?.cours_code;
      if (cc) notes[cc + '|' + brut] = { points: l.points, non_evalue: l.non_evalue };
    }
    for (const co of structure) {
      const n = calculerNoteCours(co, notes);
      if (n.sur20_exact != null && n.sur20_exact >= 10) {
        candidats.push({
          annee_origine: an, cours_code: co.cours_code, cours_nom: co.cours_nom,
          note: n.sur20_exact, note_affichee: n.sur20,
        });
      }
    }
  }
  // La session la plus récente prime pour un même cours
  const parCours = {};
  for (const c0 of candidats.sort((a, b) => a.annee_origine.localeCompare(b.annee_origine))) {
    parCours[c0.cours_code] = c0;
  }
  return Object.values(parCours);
}

// ── Reports de note d'un étudiant pour une UE et une année ─────────────────
r.get('/reports/:etudId/:ueNum', authRequired, (req, res) => {
  const { etudId, ueNum } = req.params;
  const annee = req.query.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const actifs = db.prepare(`
    SELECT cours_code, note, annee_origine, decision_ce FROM etudiant_report_note
    WHERE etudiant_id = ? AND ue_num = ? AND annee_scolaire = ?
  `).all(Number(etudId), Number(ueNum), annee);

  const dejaReportes = new Set(actifs.map(a => a.cours_code));
  const candidats = coursValidesAnterieurs(Number(etudId), Number(ueNum), annee)
    .filter(c0 => !dejaReportes.has(c0.cours_code));

  res.json({ actifs, candidats });
});

r.put('/reports', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { etudiant_id, annee_scolaire, ue_num, cours_code, note, annee_origine, decision_ce } = req.body;
  if (!etudiant_id || !annee_scolaire || !ue_num || !cours_code || note == null) {
    return res.status(400).json({ error: 'etudiant_id, annee_scolaire, ue_num, cours_code et note requis' });
  }
  db.prepare(`
    INSERT INTO etudiant_report_note
      (etudiant_id, annee_scolaire, ue_num, cours_code, note, annee_origine, decision_ce)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(etudiant_id, annee_scolaire, ue_num, cours_code) DO UPDATE SET
      note = excluded.note, annee_origine = excluded.annee_origine,
      decision_ce = excluded.decision_ce
  `).run(Number(etudiant_id), annee_scolaire, Number(ue_num), cours_code,
         Number(note), annee_origine || null, decision_ce || null);
  res.json({ ok: true });
});

r.delete('/reports/:etudId/:ueNum/:coursCode', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const annee = req.query.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  db.prepare(`
    DELETE FROM etudiant_report_note
    WHERE etudiant_id = ? AND ue_num = ? AND cours_code = ? AND annee_scolaire = ?
  `).run(Number(req.params.etudId), Number(req.params.ueNum), req.params.coursCode, annee);
  res.json({ ok: true });
});

// ── Structure d'évaluation d'une UE ─────────────────────────────────────────
r.get('/ue/:ueNum/structure', authRequired, (req, res) => {
  const cours = structureUE(Number(req.params.ueNum), req.query.annee);
  const sommeCours = cours.reduce((s, c) => s + (c.poids_cours || 0), 0);   // 100 si les périodes sont renseignées
  res.json({
    ue_num: Number(req.params.ueNum),
    cours,
    somme_poids_cours: Math.round(sommeCours * 100) / 100,
    poids_cours_complet: cours.length > 0 && Math.abs(sommeCours - 100) < 0.01,
    pret: cours.length > 0 && cours.every(c => c.complet) && Math.abs(sommeCours - 100) < 0.01,
  });
});

// ── Enregistrer les pondérations d'un cours ─────────────────────────────────
r.put('/ponderations', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { ue_num, cours_code, ponderations } = req.body;
  if (!ue_num || !cours_code || !Array.isArray(ponderations)) {
    return res.status(400).json({ error: 'ue_num, cours_code et ponderations requis' });
  }
  const somme = ponderations.reduce((s, p) => s + Number(p.poids || 0), 0);
  if (ponderations.length && Math.abs(somme - 100) > 0.01) {
    return res.status(400).json({
      error: `La somme des pondérations de ce cours vaut ${Math.round(somme * 100) / 100} au lieu de 100.`,
    });
  }

  const up = db.prepare(`
    INSERT INTO aa_ponderation (ue_num, cours_code, aa_code, poids, maj_le)
    VALUES (?,?,?,?, datetime('now'))
    ON CONFLICT(cours_code, aa_code) DO UPDATE SET
      poids = excluded.poids, ue_num = excluded.ue_num, maj_le = datetime('now')
  `);
  db.transaction(() => {
    for (const p of ponderations) {
      up.run(Number(ue_num), cours_code, p.aa_code, Number(p.poids || 0));
    }
  })();
  res.json({ ok: true, cours_code, somme: Math.round(somme * 100) / 100 });
});

// ── Répartition égale, pour amorcer ─────────────────────────────────────────
r.post('/ponderations/repartir', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { ue_num, cours_code } = req.body;
  if (!ue_num || !cours_code) return res.status(400).json({ error: 'ue_num et cours_code requis' });

  const aas = db.prepare(
    'SELECT aa_code FROM aa WHERE ue_num = ? AND cours_code = ? ORDER BY aa_num'
  ).all(Number(ue_num), cours_code);
  if (!aas.length) return res.status(400).json({ error: 'Aucun AA rattaché à ce cours' });

  // Réparti à parts égales ; le reliquat va au premier pour que le total fasse 100
  const base = Math.floor((100 / aas.length) * 100) / 100;
  const poids = aas.map(() => base);
  poids[0] = Math.round((100 - base * (aas.length - 1)) * 100) / 100;

  const up = db.prepare(`
    INSERT INTO aa_ponderation (ue_num, cours_code, aa_code, poids, maj_le)
    VALUES (?,?,?,?, datetime('now'))
    ON CONFLICT(cours_code, aa_code) DO UPDATE SET
      poids = excluded.poids, maj_le = datetime('now')
  `);
  db.transaction(() => {
    aas.forEach((a, i) => up.run(Number(ue_num), cours_code, a.aa_code, poids[i]));
  })();
  res.json({ ok: true, reparti: aas.length });
});

// ── UE d'une section, avec l'état de leur paramétrage ───────────────────────
r.get('/sections/:section/ues', authRequired, (req, res) => {
  const annee = req.query.annee
    || db.prepare('SELECT code FROM annee_scolaire WHERE active = 1').get()?.code;

  const ues = db.prepare(`
    SELECT DISTINCT ue_num, MIN(ue_nom) AS ue_nom, MIN(ue_niv) AS ue_niv
    FROM ue WHERE section = ? AND annee_scolaire = ?
    GROUP BY ue_num ORDER BY ue_num
  `).all(req.params.section, annee);

  res.json(ues.map(u => {
    const st = structureUE(u.ue_num, annee);
    const nbAA = st.reduce((s, c) => s + c.aas.length, 0);
    const sommeC = st.reduce((s, c) => s + (c.poids_cours || 0), 0);
    return {
      ...u,
      nb_cours: st.length,
      nb_aa: nbAA,
      pret: st.length > 0 && st.every(c => c.complet) && Math.abs(sommeC - 100) < 0.01,
      cours_incomplets: st.filter(c => !c.complet).map(c => c.cours_code),
      somme_poids_cours: Math.round(sommeC * 100) / 100,
    };
  }));
});

export default r;
