/**
 * LES NOTES EN DOUBLE — la grille d'unité et la forme lue (3 octobre 2026).
 *
 * Une note d'épreuve encodée dans la colonne « unité entière » s'écrivait sous
 * un code technique (`sN|__ue__|AA`) que le calcul ne lisait pas ; depuis le
 * correctif, la note s'écrit sans cours (`sN|AA`), la forme que tout Lucie lit.
 * Là où les deux formes existent avec des valeurs DIFFÉRENTES, Lucie ne
 * tranche pas : elle montre les deux, la direction choisit, et la forme lue
 * reçoit la valeur choisie — les deux s'alignent. Constaté en production sur
 * l'UE 80 (16,5 / 16 ; 11,5 / 11) et l'UE 307 (10 / 5).
 *
 * Simulation d'abord (GET), écriture sur clic (POST), journal en ajout seul.
 * La cote de décision ne change pas ici : elle se corrige ensuite, avec un
 * motif, dans le contrôle des notes de décision, qui montrera l'écart.
 */
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';

const r = Router();
const DIRECTION = ['admin', 'directeur', 'directeur_adjoint'];

let migre = false;
function migrer() {
  if (migre) return;
  db.exec(`CREATE TABLE IF NOT EXISTS note_doublon_journal (
    id INTEGER PRIMARY KEY AUTOINCREMENT, horodatage TEXT DEFAULT (datetime('now')),
    etudiant_id INTEGER NOT NULL, annee_scolaire TEXT NOT NULL, ue_num INTEGER NOT NULL,
    code_lu TEXT NOT NULL, avant TEXT, apres TEXT, choix TEXT NOT NULL, motif TEXT,
    acteur_id INTEGER, acteur_nom TEXT)`);
  db.exec(`CREATE TRIGGER IF NOT EXISTS note_doublon_journal_fige_maj BEFORE UPDATE ON note_doublon_journal
    BEGIN SELECT RAISE(ABORT, 'journal en ajout seul'); END;
    CREATE TRIGGER IF NOT EXISTS note_doublon_journal_fige_supp BEFORE DELETE ON note_doublon_journal
    BEGIN SELECT RAISE(ABORT, 'journal en ajout seul'); END;`);
  migre = true;
}

const valeur = l => (l.mention != null && l.mention !== '' ? l.mention : l.points);

/** Les paires en désaccord : { etudiant, ue, annee, code_lu, grille, lue }. */
function ecarts(annee) {
  const lignes = db.prepare(`
    SELECT a.etudiant_id, a.annee_scolaire, a.ue_num, a.code code_grille, a.points p_grille, a.mention m_grille,
           b.code code_lu, b.points p_lu, b.mention m_lu, e.nom, e.prenom
    FROM etudiant_note_detail a
    JOIN etudiant_note_detail b ON b.etudiant_id = a.etudiant_id AND b.ue_num = a.ue_num
      AND b.annee_scolaire = a.annee_scolaire AND b.type = 'aa'
      AND b.code = substr(a.code, 1, 3) || substr(a.code, 11)
    JOIN etudiant e ON e.id = a.etudiant_id
    WHERE a.type = 'aa' AND instr(a.code, '|__ue__|') = 3 ${annee ? 'AND a.annee_scolaire = ?' : ''}
    ORDER BY a.annee_scolaire, a.ue_num, e.nom, e.prenom, b.code`).all(...(annee ? [annee] : []));
  return lignes.filter(l => String(valeur({ points: l.p_grille, mention: l.m_grille }))
      !== String(valeur({ points: l.p_lu, mention: l.m_lu })))
    .map(l => ({
      etudiant_id: l.etudiant_id, etudiant: `${String(l.nom || '').toUpperCase()} ${l.prenom || ''}`.trim(),
      annee: l.annee_scolaire, ue_num: l.ue_num, session: Number(String(l.code_lu)[1]) || 1,
      acquis: String(l.code_lu).split('|').pop(), code_lu: l.code_lu, code_grille: l.code_grille,
      grille: valeur({ points: l.p_grille, mention: l.m_grille }), lue: valeur({ points: l.p_lu, mention: l.m_lu }),
    }));
}

r.get('/', authRequired, roleRequired(...DIRECTION), (req, res) => {
  migrer();
  res.json({ ecarts: ecarts(req.query.annee || null) });
});

/* body: { choix: [{ etudiant_id, annee, ue_num, code_lu, garder: 'grille'|'lue' }], motif } */
r.post('/', authRequired, roleRequired(...DIRECTION), (req, res) => {
  migrer();
  const choix = Array.isArray(req.body?.choix) ? req.body.choix : [];
  const motif = String(req.body?.motif || '').trim();
  if (!choix.length) return res.status(400).json({ error: 'Aucun choix.' });
  if (motif.length < 5) return res.status(400).json({ error: 'Un motif est requis : il reste au journal.' });
  const tous = ecarts(null);
  const qui = req.user?.nom || req.user?.email || null;
  const lire = db.prepare(`SELECT points, mention FROM etudiant_note_detail
    WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ? AND type = 'aa' AND code = ?`);
  const ecrire = db.prepare(`UPDATE etudiant_note_detail SET points = ?, mention = ?
    WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ? AND type = 'aa' AND code = ?`);
  const journal = db.prepare(`INSERT INTO note_doublon_journal
    (etudiant_id, annee_scolaire, ue_num, code_lu, avant, apres, choix, motif, acteur_id, acteur_nom)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  let n = 0;
  const refus = [];
  db.transaction(() => {
    for (const c of choix) {
      const e = tous.find(x => x.etudiant_id === Number(c.etudiant_id) && x.annee === c.annee
        && x.ue_num === Number(c.ue_num) && x.code_lu === c.code_lu);
      if (!e) { refus.push(c); continue; }
      const source = c.garder === 'grille' ? e.code_grille : e.code_lu;
      const cible = c.garder === 'grille' ? e.code_lu : e.code_grille;
      const v = lire.get(e.etudiant_id, e.annee, e.ue_num, source);
      const avant = c.garder === 'grille' ? e.lue : e.grille;
      ecrire.run(v.points, v.mention, e.etudiant_id, e.annee, e.ue_num, cible);
      journal.run(e.etudiant_id, e.annee, e.ue_num, e.code_lu, String(avant), String(valeur(v)),
        c.garder === 'grille' ? 'grille' : 'lue', motif, req.user?.id ?? null, qui);
      n++;
    }
  })();
  console.log(`[notes-doubles] ${n} note(s) alignée(s) par ${qui || '?'}`);
  res.json({ ok: true, alignees: n, ignores: refus.length });
});

r.get('/journal', authRequired, roleRequired(...DIRECTION), (req, res) => {
  migrer();
  res.json(db.prepare(`SELECT j.*, e.nom, e.prenom FROM note_doublon_journal j LEFT JOIN etudiant e ON e.id = j.etudiant_id
    ORDER BY j.id DESC LIMIT 200`).all());
});

export default r;
