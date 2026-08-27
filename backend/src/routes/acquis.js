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
  const poidsCours = {};
  for (const p of db.prepare('SELECT cours_code, poids FROM cours_ponderation WHERE ue_num = ?').all(ueNum)) {
    poidsCours[p.cours_code] = Number(p.poids);
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
export function calculerNoteUE(ueNum, annee, notes) {
  const structure = structureUE(ueNum, annee);
  let numerateur = 0, maximum = 0;
  let evalues = 0, attendus = 0;

  for (const c of structure) {
    const pc = c.poids_cours;
    if (!pc) continue;                              // poids du cours non encodé
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

  if (!maximum) return { sur20: null, pourcentage: null, evalues, attendus, complet: false };
  const sur20 = Math.round((numerateur / maximum) * 20 * 10) / 10;
  return {
    sur20,
    pourcentage: Math.round(sur20 * 5 * 10) / 10,
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
  if (!max) return { sur20: null, evalues };
  return { sur20: Math.round((num / max) * 20 * 10) / 10, evalues };
}

// ── Structure d'évaluation d'une UE ─────────────────────────────────────────
r.get('/ue/:ueNum/structure', authRequired, (req, res) => {
  const cours = structureUE(Number(req.params.ueNum), req.query.annee);
  const sommeCours = cours.reduce((s, c) => s + (c.poids_cours || 0), 0);
  res.json({
    ue_num: Number(req.params.ueNum),
    cours,
    somme_poids_cours: Math.round(sommeCours * 100) / 100,
    poids_cours_complet: cours.length > 0 && Math.abs(sommeCours - 100) < 0.01,
    pret: cours.length > 0 && cours.every(c => c.complet) && Math.abs(sommeCours - 100) < 0.01,
  });
});

// ── Poids des cours dans l'UE (somme 100) ──────────────────────────────────
r.put('/ponderations-cours', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { ue_num, poids } = req.body;   // poids : [{ cours_code, poids }]
  if (!ue_num || !Array.isArray(poids)) {
    return res.status(400).json({ error: 'ue_num et poids requis' });
  }
  const somme = poids.reduce((s, p) => s + Number(p.poids || 0), 0);
  if (poids.length && Math.abs(somme - 100) > 0.01) {
    return res.status(400).json({
      error: `La somme des poids des cours vaut ${Math.round(somme * 100) / 100} au lieu de 100.`,
    });
  }
  const up = db.prepare(`
    INSERT INTO cours_ponderation (ue_num, cours_code, poids, maj_le)
    VALUES (?,?,?, datetime('now'))
    ON CONFLICT(ue_num, cours_code) DO UPDATE SET
      poids = excluded.poids, maj_le = datetime('now')
  `);
  db.transaction(() => {
    for (const p of poids) up.run(Number(ue_num), p.cours_code, Number(p.poids || 0));
  })();
  res.json({ ok: true, somme: Math.round(somme * 100) / 100 });
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
