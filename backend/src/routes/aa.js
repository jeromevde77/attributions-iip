/**
 * aa.js — Routes des Acquis d'Apprentissage (AA)
 * Consultation, création, modification et suppression des AA liés aux UE.
 */
import { Router } from 'express';
import db from '../db/index.js';
import { anneeDeTravail } from '../helpers/annee.js';
import { authRequired, roleRequired, NIVEAU_DIRECTION } from '../middleware/auth.js';

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
function recoder(ancien, nouveau) {
  db.prepare('UPDATE aa SET aa_code = ? WHERE aa_code = ?').run(nouveau, ancien);
  for (const t of tablesAvecAA()) {
    db.prepare(`UPDATE ${t} SET aa_code = ? WHERE aa_code = ?`).run(nouveau, ancien);
  }
  try {
    db.prepare("UPDATE etudiant_note_detail SET code = ? WHERE code = ? AND type = 'aa'").run(nouveau, ancien);
  } catch { /* table absente */ }
}
const estDirection = u => NIVEAU_DIRECTION.includes(u?.role);

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

  res.json({
    ue_num: ueNum, annee, acquis, cours,
    non_rattaches: acquis.filter(a => !a.cours_code).length,
  });
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
r.delete('/:code', roleRequired('admin'), (req, res) => {
  db.prepare('DELETE FROM aa WHERE aa_code = ?').run(req.params.code);
  res.json({ ok: true });
});

export default r;
