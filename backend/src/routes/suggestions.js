/**
 * LES IDÉES DE CEUX QUI SE SERVENT DE LUCIE.
 *
 * Les rubriques « à venir » tenaient lieu de carnet d'idées : une place
 * réservée dans un menu, annonçant un écran qui n'existe pas. C'est une
 * promesse faite à quelqu'un qui n'a rien demandé, et elle parasite le rail de
 * ceux qui travaillent — on vise une entrée, on tombe sur « à venir ».
 *
 * Une demande ne vit pas dans un menu. Elle vit là où on peut l'écrire quand
 * elle vient — au moment où l'on bute sur quelque chose, pas trois jours après
 * en réunion —, et là où le développeur la retrouve. D'où ce registre : une
 * ligne par idée, son auteur, son état, et la réponse qu'on lui a faite.
 *
 * ON RÉPOND, MÊME POUR DIRE NON. Une idée déposée et jamais commentée
 * n'apprend qu'une chose à son auteur : que cela ne sert à rien d'écrire. Le
 * statut « écartée » existe donc, et il porte un motif comme les autres.
 */
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired } from '../middleware/auth.js';

const r = Router();

export const ETATS = [
  { cle: 'nouvelle', libelle: 'Nouvelle' },
  { cle: 'retenue', libelle: 'Retenue' },
  { cle: 'en_cours', libelle: 'En cours' },
  { cle: 'faite', libelle: 'Faite' },
  { cle: 'ecartee', libelle: 'Écartée' },
];
const CLES_ETAT = new Set(ETATS.map(e => e.cle));

export function migrerSuggestions(dbx) {
  try {
    dbx.exec(`
      CREATE TABLE IF NOT EXISTS suggestion (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        titre         TEXT NOT NULL,
        detail        TEXT,
        ecran         TEXT,
        auteur_id     INTEGER REFERENCES utilisateur(id),
        auteur_nom    TEXT,
        etat          TEXT NOT NULL DEFAULT 'nouvelle',
        reponse       TEXT,
        cree_le       TEXT DEFAULT (datetime('now')),
        maj_le        TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_suggestion_etat ON suggestion(etat, cree_le);
    `);
  } catch (e) { console.error('[migration] suggestion :', e.message); }
}

/** La direction et l'administrateur voient tout ; chacun voit les siennes. */
function voitTout(user) {
  return ['admin', 'directeur', 'directeur_adjoint'].includes(user?.role);
}

r.get('/', authRequired, (req, res) => {
  const tout = voitTout(req.user);
  const lignes = tout
    ? db.prepare('SELECT * FROM suggestion ORDER BY cree_le DESC').all()
    : db.prepare('SELECT * FROM suggestion WHERE auteur_id = ? ORDER BY cree_le DESC')
      .all(req.user.id);
  res.json({ lignes, tout, etats: ETATS });
});

r.post('/', authRequired, (req, res) => {
  const titre = String(req.body?.titre || '').trim();
  if (!titre) {
    return res.status(400).json({ error: 'Une idée sans intitulé ne se retrouve pas.' });
  }
  const info = db.prepare(`
    INSERT INTO suggestion (titre, detail, ecran, auteur_id, auteur_nom)
    VALUES (?,?,?,?,?)
  `).run(titre, String(req.body?.detail || '').trim() || null,
    String(req.body?.ecran || '').trim() || null,
    req.user.id, req.user.nom_complet || req.user.email || null);
  res.json({ ok: true, id: info.lastInsertRowid });
});

/**
 * L'ÉTAT ET LA RÉPONSE SE CHANGENT ; L'IDÉE, NON.
 * Réécrire l'idée de quelqu'un et lui répondre ensuite sur son propre texte
 * n'est pas une conversation, c'est un monologue. Seul l'auteur corrige le
 * sien, et seulement tant que personne n'y a répondu.
 */
r.patch('/:id', authRequired, (req, res) => {
  const s = db.prepare('SELECT * FROM suggestion WHERE id = ?').get(Number(req.params.id));
  if (!s) return res.status(404).json({ error: 'Idée introuvable.' });

  const b = req.body || {};
  const champs = [];
  const vals = [];

  if (b.etat !== undefined || b.reponse !== undefined) {
    if (!voitTout(req.user)) {
      return res.status(403).json({ error: "Répondre à une idée revient à la direction." });
    }
    if (b.etat !== undefined) {
      if (!CLES_ETAT.has(b.etat)) return res.status(400).json({ error: 'État inconnu.' });
      champs.push('etat = ?'); vals.push(b.etat);
    }
    if (b.reponse !== undefined) {
      champs.push('reponse = ?'); vals.push(String(b.reponse || '').trim() || null);
    }
  }

  if (b.titre !== undefined || b.detail !== undefined) {
    const sien = s.auteur_id === req.user.id;
    if (!sien && !voitTout(req.user)) {
      return res.status(403).json({ error: "On ne réécrit pas l'idée d'un autre." });
    }
    if (s.reponse && !voitTout(req.user)) {
      return res.status(409).json({
        error: 'Une réponse a déjà été faite : corriger le texte la rendrait incompréhensible.' });
    }
    if (b.titre !== undefined) {
      const t = String(b.titre).trim();
      if (!t) return res.status(400).json({ error: 'Un intitulé vide ne se retrouve pas.' });
      champs.push('titre = ?'); vals.push(t);
    }
    if (b.detail !== undefined) {
      champs.push('detail = ?'); vals.push(String(b.detail || '').trim() || null);
    }
  }

  if (!champs.length) return res.status(400).json({ error: 'Rien à modifier.' });
  db.prepare(`UPDATE suggestion SET ${champs.join(', ')}, maj_le = datetime('now')
              WHERE id = ?`).run(...vals, s.id);
  res.json(db.prepare('SELECT * FROM suggestion WHERE id = ?').get(s.id));
});

// Une idée retirée par son auteur, ou écartée pour de bon par la direction.
// « Écartée » reste préférable : elle garde la trace qu'on y a pensé.
r.delete('/:id', authRequired, (req, res) => {
  const s = db.prepare('SELECT auteur_id FROM suggestion WHERE id = ?').get(Number(req.params.id));
  if (!s) return res.status(404).json({ error: 'Idée introuvable.' });
  if (s.auteur_id !== req.user.id && !voitTout(req.user)) {
    return res.status(403).json({ error: 'Seul son auteur peut la retirer.' });
  }
  db.prepare('DELETE FROM suggestion WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

export default r;
