/**
 * aa.js — Routes des Acquis d'Apprentissage (AA)
 * Consultation, création, modification et suppression des AA liés aux UE.
 */
import { Router } from 'express';
import db from '../db/index.js';
import { anneeDeTravail } from '../helpers/annee.js';
import { authRequired, roleRequired, NIVEAU_DIRECTION } from '../middleware/auth.js';
import { estEpreuveIntegree } from './acquis.js';

const r = Router();
r.use(authRequired);

/* RENOMMER UN ACQUIS, C'EST LE RENOMMER PARTOUT.
 *
 * Le code d'un acquis est la clé de tout ce qui l'évalue : pondérations,
 * notes, motivations, propositions des professeurs, valorisations, reports.
 * Changer la seule ligne du référentiel orphelinerait ces traces — une note
 * posée sur « AA264.1a » ne se retrouverait plus sous « AA264.2 ».
 *
 * On parcourt donc les tables qui portent une colonne `aa_code`, telles que la
 * base les déclare (une table ajoutée demain suivra sans qu'on y pense), plus
 * les notes détaillées, où le code vit dans `code` pour le type « aa ». */
function tablesAvecAA() {
  return db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all().map(t => t.name)
    .filter(n => n !== 'aa' && db.prepare(`PRAGMA table_info(${n})`).all().some(c => c.name === 'aa_code'));
}
/* UNE NOTE NE CITE PAS L'ACQUIS SEUL. Son code est composé — « AA264.1 »,
 * « 264.1|AA264.1 », « s1|264.1|AA264.1 », « s2|AA264.1 » pour une épreuve
 * intégrée — et l'acquis en est TOUJOURS le dernier segment. Comparer le code
 * entier ne trouvait que les notes les plus anciennes : les vraies notes
 * encodées, préfixées de leur session et de leur cours, ne suivaient pas.
 * La condition se pose donc sur la fin du code, sans LIKE — un « _ » dans un
 * code en ferait un joker. */
const FIN_AA = `(code = @aa OR (length(code) > length(@aa)
  AND substr(code, length(code) - length(@aa)) = '|' || @aa))`;

function recoder(ancien, nouveau) {
  db.prepare('UPDATE aa SET aa_code = ? WHERE aa_code = ?').run(nouveau, ancien);
  for (const t of tablesAvecAA()) {
    db.prepare(`UPDATE ${t} SET aa_code = ? WHERE aa_code = ?`).run(nouveau, ancien);
  }
  try {
    db.prepare(`UPDATE etudiant_note_detail
      SET code = substr(code, 1, length(code) - length(@aa)) || @nouveau
      WHERE type = 'aa' AND ${FIN_AA}`).run({ aa: ancien, nouveau });
  } catch { /* table absente */ }
  try {
    db.prepare(`UPDATE deliberation_ajustement SET code = ? WHERE portee = 'aa' AND code = ?`)
      .run(nouveau, ancien);
  } catch { /* table absente */ }
}

/** Ce qui cite un acquis, table par table — pour le dire AVANT de supprimer. */
function inventaireAA(code) {
  const inv = {};
  const compter = (lib, sql, arg) => {
    try { const n = db.prepare(sql).get(arg)?.n || 0; if (n) inv[lib] = (inv[lib] || 0) + n; }
    catch { /* table absente */ }
  };
  compter('notes', `SELECT COUNT(*) AS n FROM etudiant_note_detail WHERE type = 'aa' AND ${FIN_AA}`, { aa: code });
  compter('ajustements de délibération', "SELECT COUNT(*) AS n FROM deliberation_ajustement WHERE portee = 'aa' AND code = ?", code);
  const LIB = { aa_ponderation: 'pondérations', decision_motivation: 'motivations',
    note_proposee: 'propositions des professeurs', etudiant_valorisation_aa: 'valorisations',
    etudiant_report_note: 'reports' };
  for (const t of tablesAvecAA()) compter(LIB[t] || t, `SELECT COUNT(*) AS n FROM ${t} WHERE aa_code = ?`, code);
  return inv;
}
const estDirection = u => NIVEAU_DIRECTION.includes(u?.role);

/* LA PHRASE QUI INTRODUIT LES ACQUIS (Charles, 25 septembre 2026 — « des
 * phrases introductives, pas seulement à l'AA mais globale, comme dans le
 * dossier pédagogique »). Le dossier énonce ses acquis sur trois niveaux :
 * une phrase pour toute l'unité (« Pour atteindre le seuil de réussite,
 * l'étudiant sera capable : »), des chapeaux qui ouvrent chacun un groupe
 * (« face à des situations appliquées à l'imagerie médicale, »), puis les
 * acquis. Lucie ne connaissait que les deux derniers : la première ne tenait
 * sur aucun acquis, puisqu'elle les introduit tous.
 *
 * Elle vit à l'UNITÉ, sans année, comme les acquis. Tant qu'elle n'est pas
 * saisie, Lucie PROPOSE celle du dossier pédagogique importé — sans l'écrire :
 * une proposition qui s'enregistre toute seule ne se distingue plus d'un
 * choix. */
try {
  db.exec(`CREATE TABLE IF NOT EXISTS ue_acquis_intro (
    ue_num  INTEGER PRIMARY KEY,
    texte   TEXT NOT NULL,
    maj_le  TEXT DEFAULT (datetime('now')),
    maj_par TEXT)`);
} catch (e) { console.error('[migration] ue_acquis_intro :', e.message); }

export const PHRASE_USAGE_ACQUIS = "Pour atteindre le seuil de réussite, l'étudiant sera capable :";

/** La phrase du dossier pédagogique : la première ligne de la section des
 *  acquis qui se termine par deux-points. */
function introductionDuDP(ueNum) {
  const det = db.prepare(`SELECT ue_det FROM ue WHERE ue_num = ? AND ue_det IS NOT NULL
    ORDER BY annee_scolaire DESC LIMIT 1`).get(ueNum)?.ue_det;
  if (!det) return null;
  const m = String(det).match(/##\s*acquis d.apprentissage\s*\n([\s\S]*?)(\n##|$)/i);
  if (!m) return null;
  const ligne = m[1].split('\n').map(l => l.trim()).find(Boolean);
  return ligne && /:\s*$/.test(ligne) && ligne.length <= 200 ? ligne : null;
}

/** La phrase retenue pour l'unité, et d'où elle vient. */
export function introductionAcquis(ueNum) {
  const x = db.prepare('SELECT texte FROM ue_acquis_intro WHERE ue_num = ?').get(Number(ueNum));
  if (x?.texte) return { texte: x.texte, proposee: false };
  return { texte: introductionDuDP(Number(ueNum)) || PHRASE_USAGE_ACQUIS, proposee: true };
}

// ── Liste des AA d'une UE ────────────────────────────────────────────────────
// GET /api/aa?ue_num=246
r.get('/', (req, res) => {
  const { ue_num } = req.query;
  let sql = 'SELECT aa.*, u.ue_nom, u.section FROM aa LEFT JOIN ue u ON u.ue_num = aa.ue_num WHERE 1=1';
  const args = [];
  if (ue_num) { sql += ' AND aa.ue_num = ?'; args.push(ue_num); }
  sql += ' ORDER BY aa.ue_num, aa.aa_num';
  res.json(db.prepare(sql).all(...args));
});

// ── Acquis d'une UE + cours disponibles pour le rattachement ────────────────
// GET /api/aa/ue/246?annee=2026-2027
r.get('/ue/:ueNum', (req, res) => {
  const ueNum = Number(req.params.ueNum);
  const annee = req.query.annee
    || anneeDeTravail(req);

  const acquis = db.prepare(`
    SELECT a.*, c.cours_nom
      FROM aa a
      LEFT JOIN cours c ON c.cours_code = a.cours_code AND c.annee_scolaire = ?
     WHERE a.ue_num = ?
     ORDER BY a.aa_num, a.aa_code
  `).all(annee, ueNum);

  const cours = db.prepare(`
    SELECT cours_code, cours_nom, ct_pp, cours_per
      FROM cours WHERE ue_num = ? AND annee_scolaire = ?
     ORDER BY cours_code
  `).all(ueNum, annee);

  // En épreuve intégrée, les acquis ne se rattachent pas aux cours : l'écran
  // ne doit ni le proposer, ni signaler des « non rattachés ».
  const integree = estEpreuveIntegree(ueNum, annee);
  const intro = introductionAcquis(ueNum);
  res.json({
    ue_num: ueNum, annee, acquis, cours, epreuve_integree: integree,
    non_rattaches: integree ? 0 : acquis.filter(a => !a.cours_code).length,
    introduction: intro.texte, introduction_proposee: intro.proposee,
  });
});

/* LA MISE EN FORME DES ACQUIS, EN UN SEUL GESTE : la phrase de l'unité,
 * l'ordre des acquis et leurs chapeaux. L'écran la compose par glisser-
 * déposer ; l'enregistrer morceau par morceau laisserait, au premier refus,
 * un ordre nouveau sous des chapeaux anciens. Tout ou rien. Les codes ne
 * changent pas ici (« Renuméroter » le fait, et le dit). Réservé à la
 * direction, comme tout ce qui touche au référentiel du dossier. */
r.put('/ue/:ueNum/presentation', (req, res) => {
  if (!estDirection(req.user)) return res.status(403).json({ error: 'Réservé à la direction' });
  const ueNum = Number(req.params.ueNum);
  const { introduction, ordre, chapeaux } = req.body || {};
  const actuels = db.prepare('SELECT aa_code FROM aa WHERE ue_num = ?').all(ueNum).map(a => a.aa_code);
  if (!Array.isArray(ordre) || ordre.length !== actuels.length
      || new Set(ordre).size !== ordre.length || ordre.some(c => !actuels.includes(c))) {
    return res.status(400).json({ error: "L'ordre doit reprendre exactement les acquis de l'unité." });
  }
  const intro = String(introduction ?? '').trim();
  if (!intro) return res.status(400).json({ error: "La phrase qui introduit les acquis ne peut pas être vide." });
  const ch = chapeaux && typeof chapeaux === 'object' ? chapeaux : {};
  const qui = req.user?.nom || req.user?.email || null;
  db.transaction(() => {
    const num = db.prepare('UPDATE aa SET aa_num = ?, chapeau = ? WHERE aa_code = ? AND ue_num = ?');
    ordre.forEach((c, i) => num.run(i + 1, String(ch[c] ?? '').trim() || null, c, ueNum));
    db.prepare(`INSERT INTO ue_acquis_intro (ue_num, texte, maj_le, maj_par) VALUES (?,?,datetime('now'),?)
      ON CONFLICT(ue_num) DO UPDATE SET texte = excluded.texte, maj_le = excluded.maj_le, maj_par = excluded.maj_par`)
      .run(ueNum, intro, qui);
  })();
  res.json({ ok: true, ...introductionAcquis(ueNum),
    acquis: db.prepare('SELECT aa_code, aa_num, description, chapeau FROM aa WHERE ue_num = ? ORDER BY aa_num').all(ueNum) });
});

// ── Détail d'un AA ───────────────────────────────────────────────────────────
r.get('/:code', (req, res) => {
  const aa = db.prepare('SELECT * FROM aa WHERE aa_code = ?').get(req.params.code);
  if (!aa) return res.status(404).json({ error: 'AA introuvable' });
  res.json(aa);
});

// ── Créer un AA ──────────────────────────────────────────────────────────────
r.post('/', roleRequired('admin'), (req, res) => {
  const { aa_code, aa_num, ue_num, cours_code, description } = req.body;
  if (!aa_code || !ue_num || !description) return res.status(400).json({ error: 'aa_code, ue_num et description requis' });
  try {
    db.prepare('INSERT INTO aa (aa_code, aa_num, ue_num, cours_code, description) VALUES (?, ?, ?, ?, ?)')
      .run(aa_code, aa_num || null, ue_num, cours_code || null, description);
    res.json({ ok: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Ce code AA existe déjà' });
    throw e;
  }
});

// ── Modifier un AA ───────────────────────────────────────────────────────────
// Le rattachement d'un acquis à un cours est du travail pédagogique courant
// (admin ou éditeur) ; la modification du libellé touche au référentiel légal
// issu du dossier pédagogique et reste réservée à l'administrateur.
r.patch('/:code', roleRequired('admin', 'editeur'), (req, res) => {
  const existing = db.prepare('SELECT * FROM aa WHERE aa_code = ?').get(req.params.code);
  if (!existing) return res.status(404).json({ error: 'AA introuvable' });

  const champs = [], vals = [];
  // cours_code : seule l'absence de la clé laisse la valeur inchangée ;
  // une valeur nulle explicite détache l'acquis du cours.
  if ('cours_code' in req.body) {
    champs.push('cours_code = ?');
    vals.push(req.body.cours_code || null);
  }
  // LE RÉFÉRENTIEL LÉGAL SE CORRIGE PAR LA DIRECTION. Réservé au seul compte
  // administrateur technique, un import maladroit du dossier pédagogique ne
  // pouvait être réparé par personne de la maison.
  if ('description' in req.body) {
    if (!estDirection(req.user)) {
      return res.status(403).json({ error: "Le libellé d'un acquis provient du dossier pédagogique : modification réservée à la direction" });
    }
    if (!req.body.description) return res.status(400).json({ error: 'description vide' });
    champs.push('description = ?');
    vals.push(req.body.description);
  }
  // LE CHAPEAU vient du dossier pédagogique, comme le libellé : même main.
  // Vide, il s'efface — l'acquis rejoint alors le groupe qui le précède.
  if ('chapeau' in req.body) {
    if (!estDirection(req.user)) {
      return res.status(403).json({ error: "Le chapeau d'un groupe d'acquis provient du dossier pédagogique : modification réservée à la direction" });
    }
    champs.push('chapeau = ?');
    vals.push(String(req.body.chapeau || '').trim() || null);
  }
  if ('aa_num' in req.body) {
    if (!estDirection(req.user)) return res.status(403).json({ error: 'Renuméroter un acquis est réservé à la direction' });
    champs.push('aa_num = ?');
    vals.push(req.body.aa_num === '' || req.body.aa_num == null ? null : Number(req.body.aa_num));
  }
  const nouveau = String(req.body.nouveau_code || '').trim();
  if (nouveau && nouveau !== req.params.code) {
    if (!estDirection(req.user)) return res.status(403).json({ error: 'Renommer un acquis est réservé à la direction' });
    if (db.prepare('SELECT 1 FROM aa WHERE aa_code = ?').get(nouveau)) {
      return res.status(409).json({ error: `Le code ${nouveau} existe déjà.` });
    }
  }
  if (!champs.length && !(nouveau && nouveau !== req.params.code)) {
    return res.status(400).json({ error: 'rien à modifier' });
  }

  let code = req.params.code;
  db.transaction(() => {
    if (champs.length) {
      db.prepare(`UPDATE aa SET ${champs.join(', ')} WHERE aa_code = ?`).run(...vals, code);
    }
    if (nouveau && nouveau !== code) { recoder(code, nouveau); code = nouveau; }
  })();
  res.json(db.prepare('SELECT * FROM aa WHERE aa_code = ?').get(code));
});

// ── Renuméroter les acquis d'une UE ──────────────────────────────────────────
// POST /api/aa/ue/264/renumeroter { ordre: ['AA264.3', 'AA264.1', …], recoder: true }
// Pose aa_num = 1…n dans l'ordre donné ; avec `recoder`, les codes deviennent
// AA264.1…n — en deux temps, par des codes provisoires, pour qu'un échange
// (AA264.1 ↔ AA264.2) ne se heurte pas à lui-même.
r.post('/ue/:ueNum/renumeroter', (req, res) => {
  if (!estDirection(req.user)) return res.status(403).json({ error: 'Réservé à la direction' });
  const ueNum = Number(req.params.ueNum);
  const actuels = db.prepare('SELECT aa_code FROM aa WHERE ue_num = ? ORDER BY aa_num, aa_code')
    .all(ueNum).map(a => a.aa_code);
  const ordre = Array.isArray(req.body?.ordre) && req.body.ordre.length ? req.body.ordre : actuels;
  if (ordre.length !== actuels.length || ordre.some(c => !actuels.includes(c))) {
    return res.status(400).json({ error: "L'ordre doit reprendre exactement les acquis de l'unité." });
  }
  const cibles = ordre.map((_, i) => `AA${ueNum}.${i + 1}`);
  if (req.body?.recoder) {
    const etrangers = db.prepare(`SELECT aa_code FROM aa WHERE aa_code IN (${cibles.map(() => '?').join(',')})
      AND ue_num <> ?`).all(...cibles, ueNum);
    if (etrangers.length) {
      return res.status(409).json({ error: `Code déjà pris par une autre unité : ${etrangers.map(x => x.aa_code).join(', ')}` });
    }
  }
  const renommes = [];
  db.transaction(() => {
    ordre.forEach((c, i) => db.prepare('UPDATE aa SET aa_num = ? WHERE aa_code = ?').run(i + 1, c));
    if (req.body?.recoder) {
      ordre.forEach((c, i) => { if (c !== cibles[i]) recoder(c, `__renum__${ueNum}__${i}`); });
      ordre.forEach((c, i) => {
        if (c !== cibles[i]) { recoder(`__renum__${ueNum}__${i}`, cibles[i]); renommes.push(`${c} → ${cibles[i]}`); }
      });
    }
  })();
  res.json({ ok: true, renommes,
    acquis: db.prepare('SELECT aa_code, aa_num, description FROM aa WHERE ue_num = ? ORDER BY aa_num').all(ueNum) });
});

// ── Supprimer un AA ──────────────────────────────────────────────────────────
// La suppression effaçait la seule ligne du référentiel : notes, pondérations,
// motivations restaient accrochées à un acquis disparu — des notes qu'aucune
// feuille ne montre plus, mais qu'un calcul peut encore lire. Elle se fait
// désormais en deux temps : l'inventaire de ce qui serait emporté (409), puis,
// confirmé (?force=1), la suppression de tout, en transaction.
r.delete('/:code', (req, res) => {
  if (!estDirection(req.user)) return res.status(403).json({ error: 'Supprimer un acquis est réservé à la direction' });
  const code = req.params.code;
  const aa = db.prepare('SELECT * FROM aa WHERE aa_code = ?').get(code);
  if (!aa) return res.status(404).json({ error: 'AA introuvable' });
  const inventaire = inventaireAA(code);
  const total = Object.values(inventaire).reduce((a, b) => a + b, 0);
  if (total > 0 && req.query.force !== '1') {
    return res.status(409).json({ confirmation_requise: true, aa_code: code, inventaire, total });
  }
  db.transaction(() => {
    try { db.prepare(`DELETE FROM etudiant_note_detail WHERE type = 'aa' AND ${FIN_AA}`).run({ aa: code }); } catch { /* */ }
    try { db.prepare("DELETE FROM deliberation_ajustement WHERE portee = 'aa' AND code = ?").run(code); } catch { /* */ }
    for (const t of tablesAvecAA()) db.prepare(`DELETE FROM ${t} WHERE aa_code = ?`).run(code);
    db.prepare('DELETE FROM aa WHERE aa_code = ?').run(code);
  })();
  res.json({ ok: true, supprime: code, emportes: total });
});

export default r;
