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

  /* UNE RÉPONSE APPELLE UNE RÉPONSE (Charles, 3 octobre 2026 : « quand je
     réponds, il faut que sur le tableau de bord de la personne qui a écrit, ma
     réponse y soit et qu'elle puisse répondre »). Un seul champ `reponse` ne
     fait pas une conversation : la seconde réponse écrasait la première, et
     l'auteur n'avait nulle part où répondre. D'où un fil, en AJOUT SEUL —
     aucune route ne modifie ni n'efface un message : on ne réécrit pas ce que
     l'autre a déjà lu. La colonne `reponse` reste (rien ne se supprime), et
     elle est reprise comme premier message de la direction. */
  try {
    dbx.exec(`
      CREATE TABLE IF NOT EXISTS suggestion_message (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        suggestion_id  INTEGER NOT NULL REFERENCES suggestion(id),
        auteur_id      INTEGER REFERENCES utilisateur(id),
        auteur_nom     TEXT,
        auteur_role    TEXT,
        cote           TEXT NOT NULL CHECK (cote IN ('auteur','direction')),
        texte          TEXT NOT NULL,
        origine        TEXT,
        cree_le        TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%f','now'))
      );
      CREATE INDEX IF NOT EXISTS idx_suggestion_message ON suggestion_message(suggestion_id, cree_le);
    `);
    const cols = dbx.prepare('PRAGMA table_info(suggestion)').all().map(c => c.name);
    // CHAQUE CÔTÉ A SON « VU » : un message plus récent que le « vu » de
    // l'autre côté est nouveau pour lui.
    if (!cols.includes('vu_auteur_le')) dbx.exec('ALTER TABLE suggestion ADD COLUMN vu_auteur_le TEXT');
    if (!cols.includes('vu_direction_le')) dbx.exec('ALTER TABLE suggestion ADD COLUMN vu_direction_le TEXT');
    // La réponse unique d'avant devient le premier message de la direction.
    // On ignore qui l'a écrite : on ne l'invente pas, elle porte « Direction ».
    // Elle reste « nouvelle » pour l'auteur : il ne la voyait que s'il
    // rouvrait la fenêtre des idées.
    dbx.exec(`
      INSERT INTO suggestion_message (suggestion_id, auteur_nom, cote, texte, origine, cree_le)
      SELECT s.id, 'Direction', 'direction', s.reponse, 'reponse',
             COALESCE(s.maj_le, s.cree_le, datetime('now'))
        FROM suggestion s
       WHERE s.reponse IS NOT NULL AND TRIM(s.reponse) <> ''
         AND NOT EXISTS (SELECT 1 FROM suggestion_message m
                          WHERE m.suggestion_id = s.id AND m.origine = 'reponse')
    `);
  } catch (e) { console.error('[migration] suggestion_message :', e.message); }
}

const MAINTENANT = "strftime('%Y-%m-%d %H:%M:%f','now')";
const FERMES = ['faite', 'ecartee'];

/** Le nom de celui qui écrit : LA PERSONNE CONNECTÉE, lue en base — jamais
    un nom tapé. Le jeton porte `nom`, pas `nom_complet`. */
function nomDe(user) {
  const u = db.prepare('SELECT nom_complet, email FROM utilisateur WHERE id = ?').get(user?.id);
  return u?.nom_complet || user?.nom || u?.email || user?.email || null;
}

/** Le côté depuis lequel `user` regarde cette idée, ou null s'il n'a rien à y voir. */
function coteDe(user, s) {
  if (s.auteur_id === user?.id) return 'auteur';
  if (voitTout(user)) return 'direction';
  return null;
}

/* Les colonnes calculées d'une idée : dernier message de chaque côté, nombre
   de messages. Le « nouveau » se déduit ensuite selon qui regarde. */
const COLONNES_FIL = `
  (SELECT COUNT(*) FROM suggestion_message m WHERE m.suggestion_id = s.id) AS nb_messages,
  (SELECT MAX(cree_le) FROM suggestion_message m WHERE m.suggestion_id = s.id AND m.cote = 'direction') AS dernier_direction_le,
  (SELECT MAX(cree_le) FROM suggestion_message m WHERE m.suggestion_id = s.id AND m.cote = 'auteur') AS dernier_auteur_le`;

function enrichir(s, user) {
  const cote = coteDe(user, s);
  const derniere = [s.cree_le, s.maj_le, s.dernier_direction_le, s.dernier_auteur_le]
    .filter(Boolean).sort().pop() || null;
  let nouveau = false;
  if (cote === 'auteur') nouveau = !!s.dernier_direction_le && s.dernier_direction_le > (s.vu_auteur_le || '');
  if (cote === 'direction') nouveau = !!s.dernier_auteur_le && s.dernier_auteur_le > (s.vu_direction_le || '');
  return { ...s, cote, nouveau, derniere_activite: derniere };
}

function fil(id) {
  return db.prepare(`SELECT id, auteur_nom, auteur_role, cote, texte, origine, cree_le
                       FROM suggestion_message WHERE suggestion_id = ?
                      ORDER BY cree_le, id`).all(id);
}

/** Ajoute un message au fil — la seule écriture possible sur un message. */
function ajouterMessage(s, user, texte) {
  const cote = coteDe(user, s);
  db.prepare(`INSERT INTO suggestion_message
                (suggestion_id, auteur_id, auteur_nom, auteur_role, cote, texte, cree_le)
              VALUES (?,?,?,?,?,?, ${MAINTENANT})`)
    .run(s.id, user.id, nomDe(user), user.role || null, cote, texte);
  // Écrire, c'est avoir lu ce qui précède.
  const col = cote === 'auteur' ? 'vu_auteur_le' : 'vu_direction_le';
  db.prepare(`UPDATE suggestion SET ${col} = ${MAINTENANT}, maj_le = datetime('now') WHERE id = ?`).run(s.id);
  // La colonne d'origine garde la dernière réponse de la direction, pour qui
  // la lirait encore.
  if (cote === 'direction') db.prepare('UPDATE suggestion SET reponse = ? WHERE id = ?').run(texte, s.id);
  return cote;
}

/** La direction et l'administrateur voient tout ; chacun voit les siennes. */
function voitTout(user) {
  return ['admin', 'directeur', 'directeur_adjoint'].includes(user?.role);
}

/* LA LISTE NE MARQUE RIEN COMME VU : elle ne sert pas le fil. Ce qui est
   nouveau passe devant — une réponse en attente de lecture ne se cherche pas
   au fond d'une liste de cent idées. */
r.get('/', authRequired, (req, res) => {
  const tout = voitTout(req.user);
  const brutes = tout
    ? db.prepare(`SELECT s.*, ${COLONNES_FIL} FROM suggestion s`).all()
    : db.prepare(`SELECT s.*, ${COLONNES_FIL} FROM suggestion s WHERE s.auteur_id = ?`)
      .all(req.user.id);
  const lignes = brutes.map(s => enrichir(s, req.user))
    .sort((a, b) => (b.nouveau - a.nouveau)
      || String(b.derniere_activite || '').localeCompare(String(a.derniere_activite || '')));
  res.json({ lignes, tout, etats: ETATS, nouveaux: lignes.filter(l => l.nouveau).length });
});

/**
 * MES PROPOSITIONS — pour l'Accueil de celui qui a écrit : celles auxquelles
 * la direction a répondu. Une idée close (faite, écartée) dont le dernier
 * échange a été lu il y a plus de trente jours sort du bloc : elle reste dans
 * la fenêtre des idées, elle n'attend plus rien.
 */
r.get('/miennes', authRequired, (req, res) => {
  const lignes = db.prepare(`SELECT s.*, ${COLONNES_FIL} FROM suggestion s WHERE s.auteur_id = ?`)
    .all(req.user.id)
    .map(s => enrichir(s, req.user))
    .filter(s => s.dernier_direction_le)
    .filter(s => s.nouveau || !FERMES.includes(s.etat)
      || !s.vu_auteur_le || s.vu_auteur_le > new Date(Date.now() - 30 * 86400000)
        .toISOString().replace('T', ' ').slice(0, 23))
    .sort((a, b) => (b.nouveau - a.nouveau)
      || String(b.derniere_activite || '').localeCompare(String(a.derniere_activite || '')));
  res.json({ lignes, etats: ETATS, nouveaux: lignes.filter(l => l.nouveau).length });
});

/**
 * LE FIL D'UNE IDÉE. C'est LA ROUTE QUI SERT LE FIL qui le marque vu, pour le
 * côté qui le lit — jamais un clic de l'écran : un écran peut prétendre avoir
 * affiché ce qu'il n'a pas reçu (la règle des deux traces). Le « nouveau » est
 * rendu tel qu'il était AVANT cette lecture, pour que l'écran puisse encore
 * dire ce qui vient d'arriver.
 */
r.get('/:id/fil', authRequired, (req, res) => {
  const s0 = db.prepare(`SELECT s.*, ${COLONNES_FIL} FROM suggestion s WHERE s.id = ?`)
    .get(Number(req.params.id));
  const cote = s0 && coteDe(req.user, s0);
  // 404 et non 403 : « interdit » confirmerait que l'idée existe.
  if (!s0 || !cote) return res.status(404).json({ error: 'Idée introuvable.' });
  const s = enrichir(s0, req.user);
  const vuAvant = cote === 'auteur' ? s0.vu_auteur_le : s0.vu_direction_le;
  const col = cote === 'auteur' ? 'vu_auteur_le' : 'vu_direction_le';
  db.prepare(`UPDATE suggestion SET ${col} = ${MAINTENANT} WHERE id = ?`).run(s0.id);
  const autre = cote === 'auteur' ? 'direction' : 'auteur';
  const messages = fil(s0.id).map(m => ({
    ...m, nouveau: m.cote === autre && m.cree_le > (vuAvant || ''),
  }));
  res.json({ suggestion: s, messages, etats: ETATS });
});

/**
 * RÉPONDRE. L'auteur répond sur la sienne, la direction sur toutes. Le nom
 * est celui de la personne connectée. Un message ne se modifie ni ne
 * s'efface — par personne : la réponse qu'on a lue ne doit pas changer après.
 */
r.post('/:id/messages', authRequired, (req, res) => {
  const s = db.prepare('SELECT * FROM suggestion WHERE id = ?').get(Number(req.params.id));
  if (!s || !coteDe(req.user, s)) return res.status(404).json({ error: 'Idée introuvable.' });
  const texte = String(req.body?.texte || '').trim();
  if (!texte) return res.status(400).json({ error: 'Un message vide ne dit rien.' });
  if (texte.length > 5000) return res.status(400).json({ error: 'Message trop long (5 000 caractères au plus).' });
  ajouterMessage(s, req.user, texte);
  const s2 = db.prepare(`SELECT s.*, ${COLONNES_FIL} FROM suggestion s WHERE s.id = ?`).get(s.id);
  res.json({ ok: true, suggestion: enrichir(s2, req.user), messages: fil(s.id) });
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
    req.user.id, nomDe(req.user));
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
  }
  // L'ANCIEN CHAMP « réponse » N'ÉCRASE PLUS : il ajoute un message au fil.
  // Un champ vidé n'efface rien — on ne retire pas une réponse déjà lue.
  let message = null;
  if (b.reponse !== undefined && voitTout(req.user)) {
    const t = String(b.reponse || '').trim();
    if (t) message = t;
  }

  if (b.titre !== undefined || b.detail !== undefined) {
    const sien = s.auteur_id === req.user.id;
    if (!sien && !voitTout(req.user)) {
      return res.status(403).json({ error: "On ne réécrit pas l'idée d'un autre." });
    }
    const repondue = s.reponse || db.prepare(`SELECT 1 FROM suggestion_message
      WHERE suggestion_id = ? AND cote = 'direction' LIMIT 1`).get(s.id);
    if (repondue && !voitTout(req.user)) {
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

  if (!champs.length && !message) return res.status(400).json({ error: 'Rien à modifier.' });
  if (champs.length) {
    db.prepare(`UPDATE suggestion SET ${champs.join(', ')}, maj_le = datetime('now')
                WHERE id = ?`).run(...vals, s.id);
  }
  if (message) ajouterMessage(s, req.user, message);
  res.json(db.prepare('SELECT * FROM suggestion WHERE id = ?').get(s.id));
});

// Une idée retirée par son auteur, ou écartée pour de bon par la direction.
// « Écartée » reste préférable : elle garde la trace qu'on y a pensé.
r.delete('/:id', authRequired, (req, res) => {
  const s = db.prepare('SELECT id, auteur_id FROM suggestion WHERE id = ?').get(Number(req.params.id));
  if (!s) return res.status(404).json({ error: 'Idée introuvable.' });
  if (s.auteur_id !== req.user.id && !voitTout(req.user)) {
    return res.status(403).json({ error: 'Seul son auteur peut la retirer.' });
  }
  // UNE CONVERSATION ENGAGÉE NE SE RETIRE PAS PAR UN SEUL DES DEUX : la
  // direction y a répondu, sa réponse disparaîtrait avec. L'auteur demande
  // plutôt, dans le fil, qu'on l'écarte.
  const repondue = db.prepare(`SELECT 1 FROM suggestion_message
    WHERE suggestion_id = ? AND cote = 'direction' LIMIT 1`).get(s.id);
  if (repondue && !voitTout(req.user)) {
    return res.status(409).json({ error: 'La direction y a répondu : écrivez-le dans le fil plutôt que de la retirer.' });
  }
  db.prepare('DELETE FROM suggestion_message WHERE suggestion_id = ?').run(s.id);
  db.prepare('DELETE FROM suggestion WHERE id = ?').run(s.id);
  res.json({ ok: true });
});

export default r;
