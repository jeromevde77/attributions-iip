// ─────────────────────────────────────────────────────────────────────────────
// mfa.js — Deuxième facteur local (TOTP), enrôlement et déblocage
//
// Ce qui se règle ici : on s'enrôle, on active, on désactive, on régénère ses
// codes de récupération. Et, pour la direction, on DÉBLOQUE quelqu'un qui a
// perdu son téléphone — la seule opération de ce fichier qui touche au compte
// d'un autre, donc la seule qui laisse une trace et prévient l'intéressé.
//
// La vérification à la connexion n'est PAS ici : elle vit dans routes/auth.js,
// avec le reste de la connexion. Un code juste ne donne un jeton qu'à un seul
// endroit.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import db from '../db/index.js';
import { authRequired, niveauDirection } from '../middleware/auth.js';
import { chiffrer, dechiffrer, cleMfaPresente } from '../lib/secret-box.js';
import { genererSecret, verifierTotp, uriOtpauth } from '../lib/totp.js';
import { envoyerEmail, templateNotif } from '../services/mailer.js';

const r = Router();

// ── Migration ────────────────────────────────────────────────────────────────
// Additive et protégée par contrôle d'existence, comme toutes les autres.
export function migrerMfa(db) {
  try {
    const cols = db.prepare('PRAGMA table_info(utilisateur)').all().map(c => c.name);
    for (const [nom, decl] of [
      // Préparée pour le jour où un compte s'authentifiera ailleurs (SSO) :
      // /login REFUSE déjà le mot de passe si la valeur n'est pas 'local',
      // plutôt que de laisser deux portes ouvertes en parallèle le jour venu.
      ['methode_auth',        "TEXT DEFAULT 'local'"],
      ['mfa_actif',           'INTEGER DEFAULT 0'],
      // DÉLIBÉRÉMENT DORMANTE, ET ÇA SE DIT ICI. Rien ne l'applique encore, et
      // aucune case ne l'offre à l'écran : une case qui ne fait rien en silence
      // est l'erreur que le catalogue de CLAUDE.md nous reproche déjà. Elle
      // attend que le MFA volontaire ait été éprouvé.
      ['mfa_obligatoire',     'INTEGER DEFAULT 0'],
      ['totp_secret_chiffre', 'TEXT'],
      ['totp_dernier_pas',    'INTEGER'],
    ]) {
      if (!cols.includes(nom)) {
        db.exec(`ALTER TABLE utilisateur ADD COLUMN ${nom} ${decl}`);
        console.log(`[migration] utilisateur : colonne ${nom} ajoutée`);
      }
    }
  } catch (e) { console.error('[migration] colonnes MFA :', e.message); }

  try {
    db.exec(`
      -- Codes de récupération : HACHÉS, comme des mots de passe, parce que
      -- c'en sont. Une colonne en clair ferait de la sauvegarde nocturne un
      -- trousseau de secours pour tout l'Institut.
      CREATE TABLE IF NOT EXISTS mfa_recuperation (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        utilisateur_id INTEGER NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
        code_hash      TEXT NOT NULL,
        cree_le        TEXT DEFAULT (datetime('now')),
        utilise_le     TEXT                       -- usage unique : rempli, le code est mort
      );
      CREATE INDEX IF NOT EXISTS idx_mfa_recup_user ON mfa_recuperation(utilisateur_id);

      -- Journal des événements du second facteur. Séparé du fil d'activité,
      -- qui ne parle que des attributions : une réinitialisation par la
      -- direction doit se retrouver un an après, sans dépendre d'un réglage
      -- (HISTORIQUE_ACTIF) qui peut être à zéro.
      CREATE TABLE IF NOT EXISTS mfa_journal (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        utilisateur_id INTEGER,                   -- le compte concerné
        acteur_id      INTEGER,                   -- qui a agi (null = ligne de commande)
        acteur_nom     TEXT,
        evenement      TEXT NOT NULL,             -- active / desactive / reinitialise / codes_regeneres / recuperation_utilisee
        detail         TEXT,
        cree_le        TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_mfa_journal_user ON mfa_journal(utilisateur_id, cree_le DESC);
    `);
  } catch (e) { console.error('[migration] tables MFA :', e.message); }
}

// ── Aides partagées avec routes/auth.js ──────────────────────────────────────

export function journaliser({ utilisateur_id, acteur, evenement, detail = null }) {
  try {
    db.prepare(`INSERT INTO mfa_journal (utilisateur_id, acteur_id, acteur_nom, evenement, detail)
                VALUES (?, ?, ?, ?, ?)`)
      .run(utilisateur_id ?? null, acteur?.id ?? null,
           acteur ? (acteur.nom || acteur.email || String(acteur.id)) : null, evenement, detail);
  } catch (e) { console.error('[mfa] journal :', e.message); }
}

/**
 * Dix codes de secours. Rendus UNE SEULE FOIS, en clair, à la personne : ils
 * ne se relisent jamais ensuite, puisque seul le haché reste. Le format
 * « xxxx-xxxx » se recopie sans erreur ; l'alphabet exclut I, O, 0 et 1, qui
 * se confondent sur un papier plié dans un portefeuille.
 */
const ALPHABET_CODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function genererCodesRecuperation(utilisateurId, nb = 10) {
  const tirer = n => Array.from(crypto.randomBytes(n))
    .map(o => ALPHABET_CODE[o % ALPHABET_CODE.length]).join('');
  const codes = Array.from({ length: nb }, () => `${tirer(4)}-${tirer(4)}`);
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM mfa_recuperation WHERE utilisateur_id = ?').run(utilisateurId);
    const ins = db.prepare('INSERT INTO mfa_recuperation (utilisateur_id, code_hash) VALUES (?, ?)');
    for (const c of codes) ins.run(utilisateurId, bcrypt.hashSync(normaliserCode(c), 10));
  });
  tx();
  return codes;
}

/** Saisie tolérante : minuscules, espaces et tiret oubliés ne doivent pas coûter un code. */
export function normaliserCode(c) {
  return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Consomme un code de récupération. Rend true s'il était valide et inemployé.
 * Le parcours est ENTIER — tous les hachés sont comparés même après une
 * correspondance — pour ne pas laisser mesurer la position du bon code.
 */
export function consommerCodeRecuperation(utilisateurId, saisi) {
  const propre = normaliserCode(saisi);
  if (propre.length < 6) return false;
  const lignes = db.prepare(
    'SELECT id, code_hash FROM mfa_recuperation WHERE utilisateur_id = ? AND utilise_le IS NULL'
  ).all(utilisateurId);
  let trouve = null;
  for (const l of lignes) {
    if (bcrypt.compareSync(propre, l.code_hash) && trouve === null) trouve = l.id;
  }
  if (trouve === null) return false;
  db.prepare("UPDATE mfa_recuperation SET utilise_le = datetime('now') WHERE id = ? AND utilise_le IS NULL")
    .run(trouve);
  return true;
}

/** Remet un compte à zéro côté MFA. Employée par la direction ET par le script. */
export function reinitialiserMfa(utilisateurId) {
  const tx = db.transaction(() => {
    db.prepare(`UPDATE utilisateur
                   SET mfa_actif = 0, totp_secret_chiffre = NULL, totp_dernier_pas = NULL
                 WHERE id = ?`).run(utilisateurId);
    db.prepare('DELETE FROM mfa_recuperation WHERE utilisateur_id = ?').run(utilisateurId);
  });
  tx();
}

function etatDe(u) {
  return {
    mfa_actif: u?.mfa_actif ? 1 : 0,
    methode_auth: u?.methode_auth || 'local',
    codes_restants: u?.mfa_actif
      ? db.prepare('SELECT COUNT(*) n FROM mfa_recuperation WHERE utilisateur_id = ? AND utilise_le IS NULL')
          .get(u.id).n
      : 0,
    cle_serveur: cleMfaPresente(),
  };
}

// ── Mon propre second facteur ────────────────────────────────────────────────

r.get('/etat', authRequired, (req, res) => {
  const u = db.prepare('SELECT * FROM utilisateur WHERE id = ?').get(req.user.id);
  if (!u) return res.status(404).json({ error: 'Compte introuvable' });
  res.json(etatDe(u));
});

/**
 * Enrôlement : fabrique un secret et rend l'URI otpauth. LE SECRET N'EST PAS
 * ENCORE ACTIF — il est écrit chiffré, `mfa_actif` reste à 0, et seule une
 * preuve de lecture (un code juste, à l'étape suivante) l'allume. Activer
 * d'emblée enfermerait dehors quiconque scanne mal son QR.
 */
r.post('/enroler', authRequired, (req, res) => {
  const u = db.prepare('SELECT * FROM utilisateur WHERE id = ?').get(req.user.id);
  if (!u) return res.status(404).json({ error: 'Compte introuvable' });
  if (u.mfa_actif) {
    return res.status(409).json({ error: 'Le second facteur est déjà actif. Désactivez-le d\'abord.' });
  }
  const secret = genererSecret();
  try {
    db.prepare('UPDATE utilisateur SET totp_secret_chiffre = ?, totp_dernier_pas = NULL WHERE id = ?')
      .run(chiffrer(secret), u.id);
  } catch (e) {
    return res.status(503).json({ error: `Second facteur indisponible : ${e.message}` });
  }
  res.json({ secret, uri: uriOtpauth({ secret, compte: u.email }) });
});

/** Activation : un code juste, et seulement alors. */
r.post('/activer', authRequired, (req, res) => {
  const { code } = req.body || {};
  const u = db.prepare('SELECT * FROM utilisateur WHERE id = ?').get(req.user.id);
  if (!u?.totp_secret_chiffre) {
    return res.status(409).json({ error: 'Aucun enrôlement en cours.' });
  }
  let secret;
  try { secret = dechiffrer(u.totp_secret_chiffre); }
  catch (e) { return res.status(503).json({ error: `Secret illisible : ${e.message}` }); }

  const v = verifierTotp(secret, code, { dernierPas: u.totp_dernier_pas });
  if (!v.ok) return res.status(401).json({ error: 'Code incorrect.' });

  db.prepare('UPDATE utilisateur SET mfa_actif = 1, totp_dernier_pas = ? WHERE id = ?').run(v.pas, u.id);
  const codes = genererCodesRecuperation(u.id);
  journaliser({ utilisateur_id: u.id, acteur: req.user, evenement: 'active' });
  // Les codes ne repasseront plus : c'est écrit à l'écran, c'est rappelé ici.
  res.json({ ok: true, codes });
});

/**
 * Désactivation. LE MOT DE PASSE EST EXIGÉ : sans lui, un poste laissé ouvert
 * deux minutes suffit à retirer le second facteur du compte — c'est-à-dire à
 * défaire précisément ce qu'il protège.
 */
r.post('/desactiver', authRequired, (req, res) => {
  const { password } = req.body || {};
  const u = db.prepare('SELECT * FROM utilisateur WHERE id = ?').get(req.user.id);
  if (!u) return res.status(404).json({ error: 'Compte introuvable' });
  if (!password || !bcrypt.compareSync(password, u.password_hash)) {
    return res.status(401).json({ error: 'Mot de passe incorrect.' });
  }
  reinitialiserMfa(u.id);
  journaliser({ utilisateur_id: u.id, acteur: req.user, evenement: 'desactive' });
  res.json({ ok: true });
});

/** Régénérer les codes : un code TOTP en cours, pour prouver qu'on est bien là. */
r.post('/codes', authRequired, (req, res) => {
  const { code } = req.body || {};
  const u = db.prepare('SELECT * FROM utilisateur WHERE id = ?').get(req.user.id);
  if (!u?.mfa_actif) return res.status(409).json({ error: 'Le second facteur n\'est pas actif.' });
  let secret;
  try { secret = dechiffrer(u.totp_secret_chiffre); }
  catch (e) { return res.status(503).json({ error: `Secret illisible : ${e.message}` }); }

  const v = verifierTotp(secret, code, { dernierPas: u.totp_dernier_pas });
  if (!v.ok) return res.status(401).json({ error: 'Code incorrect.' });
  db.prepare('UPDATE utilisateur SET totp_dernier_pas = ? WHERE id = ?').run(v.pas, u.id);

  const codes = genererCodesRecuperation(u.id);
  journaliser({ utilisateur_id: u.id, acteur: req.user, evenement: 'codes_regeneres' });
  res.json({ ok: true, codes });
});

// ── Déblocage par la direction ───────────────────────────────────────────────

/**
 * NIVEAU_DIRECTION, et non roleRequired('admin') : c'est une décision
 * d'établissement — rendre son accès à quelqu'un qui a perdu son téléphone —
 * et non un geste technique. Le directeur et son adjoint la prennent.
 *
 * Trois garde-fous, et aucun n'est décoratif :
 *   · INTERDITE SUR SON PROPRE COMPTE. Sans cela, le second facteur de la
 *     direction se retire d'un clic depuis un poste laissé ouvert : ce n'est
 *     plus un facteur, c'est un bouton.
 *   · JOURNALISÉE, avec qui a agi et sur qui.
 *   · NOTIFIÉE à l'intéressé, qui est le seul à savoir s'il l'avait demandé.
 *     Un déblocage silencieux ne se découvre jamais.
 */
r.post('/:id/reinitialiser', authRequired, niveauDirection, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Compte non identifié' });
  if (id === req.user.id) {
    return res.status(403).json({
      error: "Vous ne pouvez pas réinitialiser votre propre second facteur. "
           + "Demandez-le à un autre membre de la direction, ou employez "
           + "scripts/mfa-reset.js sur le serveur.",
    });
  }
  const u = db.prepare('SELECT * FROM utilisateur WHERE id = ?').get(id);
  if (!u) return res.status(404).json({ error: 'Compte introuvable' });

  const motif = String(req.body?.motif || '').trim();
  reinitialiserMfa(id);
  journaliser({
    utilisateur_id: id, acteur: req.user, evenement: 'reinitialise',
    detail: motif || null,
  });

  // Le courriel ne doit pas faire échouer la réinitialisation : elle est déjà
  // faite et journalisée. On dit simplement si l'avis est parti.
  let avise = false, raisonAvis = null;
  try {
    const envoi = await envoyerEmail({
      to: u.email,
      subject: 'Lucie — votre second facteur a été réinitialisé',
      html: templateNotif({
        titre: 'Second facteur réinitialisé',
        corps: `<p>Le second facteur de connexion de votre compte Lucie (<strong>${u.email}</strong>) `
             + `a été réinitialisé par ${req.user.nom || req.user.email}.</p>`
             + (motif ? `<p>Motif indiqué : <em>${motif}</em></p>` : '')
             + `<p>Vous pouvez à nouveau vous connecter avec votre seul mot de passe, `
             + `puis reconfigurer votre application d'authentification depuis « Mon compte ».</p>`
             + `<p><strong>Si vous n'avez rien demandé, prévenez la direction immédiatement.</strong></p>`,
        lien: '/login', lienTexte: 'Se connecter',
      }),
    });
    // `avise` DIT QUE LA PERSONNE A REÇU QUELQUE CHOSE, et non que l'appel
    // n'a pas levé d'exception. Sans serveur de courriel, `envoyerEmail`
    // SIMULE : il journalise « [MAILER DEV] » et rend { ok: true, simule: true }.
    // On posait `avise` sur la seule absence d'erreur, si bien que l'écran
    // annonçait « la personne en a été avisée par courriel » alors que rien
    // n'était parti — et cela sur une action de sécurité dont le message dit
    // précisément « si vous n'avez rien demandé, prévenez la direction
    // immédiatement ». Personne n'aurait rien eu à prévenir.
    //
    // L'écran savait déjà dire « PRÉVENEZ LA PERSONNE » quand l'avis n'est pas
    // parti : ce chemin existait et n'était jamais emprunté.
    avise = !!envoi?.ok && !envoi?.simule;
    if (!avise) {
      raisonAvis = envoi?.erreur
        || (envoi?.simule
              ? "aucun serveur de courriel n'est configuré"
              : "l'envoi n'a pas abouti");
    }
  } catch (e) { raisonAvis = e.message; }

  res.json({ ok: true, avise, raison_avis: raisonAvis });
});

/** Ce que la direction voit sur une fiche : l'état, et le journal du compte. */
r.get('/:id/etat', authRequired, niveauDirection, (req, res) => {
  const u = db.prepare('SELECT * FROM utilisateur WHERE id = ?').get(Number(req.params.id));
  if (!u) return res.status(404).json({ error: 'Compte introuvable' });
  res.json({
    ...etatDe(u),
    journal: db.prepare(
      'SELECT evenement, acteur_nom, detail, cree_le FROM mfa_journal WHERE utilisateur_id = ? ORDER BY cree_le DESC LIMIT 20'
    ).all(u.id),
  });
});

export default r;
