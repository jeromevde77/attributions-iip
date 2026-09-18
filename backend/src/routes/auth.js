import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db/index.js';
import { signToken, authRequired, roleRequired, peutValiderAttributions, signPreviewToken,
         signPendingToken, verifyPendingToken } from '../middleware/auth.js';
import { dechiffrer } from '../lib/secret-box.js';
import { verifierTotp } from '../lib/totp.js';
import { consommerCodeRecuperation, journaliser } from './mfa.js';

const r = Router();

// ── Route demo-login (DEMO_MODE uniquement) ───────────────────────────────────
r.post('/demo-login', (req, res) => {
  if (process.env.DEMO_MODE !== 'true')
    return res.status(403).json({ error: 'Mode démo non activé' });

  // DEUXIÈME VERROU, ET IL EST VOLONTAIRE.
  //
  // Cette route signe un jeton d'administrateur sans mot de passe et sans
  // second facteur : c'est, par construction, le contournement le plus complet
  // qui existe dans Lucie. Elle ne tenait qu'à une variable d'environnement —
  // c'est-à-dire à un fichier .env que personne ne relit, sur un serveur où
  // dev et prod cohabitent depuis le déménagement. Une variable recopiée d'un
  // bloc à l'autre suffirait à ouvrir la production.
  //
  // NODE_ENV ne se recopie pas par distraction : la démo tourne avec son
  // propre compose. Deux conditions valent mieux qu'une quand la seconde ne
  // coûte rien.
  if (process.env.NODE_ENV === 'production')
    return res.status(403).json({ error: 'Mode démo indisponible en production' });

  const secret = process.env.JWT_SECRET || 'change-me';
  const token = jwt.sign(
    { id: 9999, email: 'demo@lucie-app.be', role: 'admin', nom: 'Visiteur Démo', is_demo: true },
    secret, { expiresIn: '24h' }
  );
  res.json({
    token,
    user: { id: 9999, email: 'demo@lucie-app.be', role: 'admin', nom: 'Visiteur Démo', is_demo: true },
  });
});

// ── SIX CHIFFRES SE DEVINENT, SI ON LAISSE ESSAYER ──────────────────────────
//
// Un code vaut un million de possibilités, mais la tolérance de ±1 pas en rend
// TROIS valables à tout instant : une machine qui essaierait sans relâche
// pendant les cinq minutes du laissez-passer aurait une chance réelle. Lucie
// n'a aucune limitation de débit, nulle part — la poser globalement est un
// autre chantier, et un mauvais réglage y enfermerait le secrétariat dehors un
// matin de délibération.
//
// Le compteur porte donc sur LE LAISSEZ-PASSER, pas sur le compte. Cinq essais
// par mot de passe correctement saisi : l'attaquant doit repasser par le mot
// de passe à chaque fois, et l'utilisateur légitime qui se trompe cinq fois
// retape simplement son mot de passe. PERSONNE N'EST JAMAIS VERROUILLÉ — un
// verrou sur le compte serait une panne à distance offerte à qui connaît une
// adresse de courriel.
//
// En mémoire, et c'est assez : le laissez-passer meurt en cinq minutes, et un
// redémarrage du serveur les tue tous de toute façon.
const ESSAIS_MAX = 5;
const essais = new Map();                      // jti → { n, expire }

function compterEssai(jeton) {
  const maintenant = Date.now();
  for (const [k, v] of essais) if (v.expire < maintenant) essais.delete(k);
  const cle = jeton.jti || `${jeton.id}|${jeton.iat}`;
  const e = essais.get(cle) || { n: 0, expire: (jeton.exp || 0) * 1000 };
  e.n++;
  essais.set(cle, e);
  return e.n;
}

function oublierEssais(jeton) {
  essais.delete(jeton.jti || `${jeton.id}|${jeton.iat}`);
}

/** La charge utile « user » de la réponse, écrite une seule fois. */
function profilPublic(user) {
  return { id: user.id, email: user.email, role: user.role, nom: user.nom_complet,
    acces_recrutement: user.acces_recrutement ? 1 : 0, peut_valider: peutValiderAttributions(user) };
}

r.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });

  const user = db.prepare('SELECT * FROM utilisateur WHERE email = ? AND actif = 1').get(email);
  if (!user) return res.status(401).json({ error: 'Identifiants invalides' });

  // Le compte s'authentifie-t-il encore ici ? Aucune autre valeur que 'local'
  // n'existe aujourd'hui ; le garde-fou est posé maintenant pour que le jour
  // où un raccordement extérieur écrira cette colonne, la porte du mot de
  // passe se ferme d'elle-même au lieu de rester ouverte en doublon.
  const methode = user.methode_auth || 'local';
  if (methode !== 'local') {
    return res.status(403).json({
      error: `Ce compte s'authentifie par ${methode} : la connexion par mot de passe lui est fermée.`,
    });
  }

  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Identifiants invalides' });

  // SECOND FACTEUR ACTIF : LE MOT DE PASSE NE SUFFIT PLUS.
  //
  // Ce qui part ici n'est pas une session : c'est un laissez-passer de cinq
  // minutes qui ne sert qu'à revenir avec le code. `last_login_at` n'est PAS
  // mis à jour — une connexion qui n'est pas allée à son terme n'est pas une
  // connexion, et cette date se lit dans l'écran des accès pour repérer les
  // comptes dormants.
  if (user.mfa_actif) {
    return res.json({ mfa_requis: true, token_intermediaire: signPendingToken(user) });
  }

  db.prepare('UPDATE utilisateur SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
  res.json({ token: signToken(user), user: profilPublic(user) });
});

/**
 * Seconde étape : le code à six chiffres, ou un code de récupération.
 *
 * C'est le seul endroit où un jeton intermédiaire se change en vrai jeton.
 * Le jeton intermédiaire est relu par `verifyPendingToken`, qui refuse tout
 * ce qui n'est pas de cette portée : on ne peut donc pas présenter ici un
 * jeton de session ordinaire pour s'en faire délivrer un autre.
 */
r.post('/login/mfa', (req, res) => {
  const { token_intermediaire, code, code_recuperation } = req.body || {};
  const enAttente = verifyPendingToken(token_intermediaire);
  if (!enAttente) {
    return res.status(401).json({
      error: 'Connexion expirée ou interrompue. Reprenez depuis votre mot de passe.',
      recommencer: true,
    });
  }

  const user = db.prepare('SELECT * FROM utilisateur WHERE id = ? AND actif = 1').get(enAttente.id);
  if (!user || !user.mfa_actif) {
    return res.status(401).json({ error: 'Connexion expirée ou interrompue.', recommencer: true });
  }

  // LE COMPTEUR NE SE REMET PAS À ZÉRO SUR UN REFUS — il l'a fait, et c'était
  // le bug : chaque 429 rendait ses cinq essais au suivant, si bien que le
  // plafond ne plafonnait rien. L'entrée vit jusqu'à l'expiration du
  // laissez-passer, et c'est le balayage qui l'efface.
  if (compterEssai(enAttente) > ESSAIS_MAX) {
    return res.status(429).json({
      error: 'Trop de codes erronés. Reprenez depuis votre mot de passe.',
      recommencer: true,
    });
  }

  const delivrer = () => {
    oublierEssais(enAttente);
    db.prepare('UPDATE utilisateur SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
    return res.json({ token: signToken(user), user: profilPublic(user) });
  };

  // Voie de secours : un code de récupération, à usage unique. Elle est
  // examinée en premier parce qu'elle ne se confond pas avec l'autre — six
  // chiffres d'un côté, deux groupes de quatre caractères de l'autre.
  if (code_recuperation) {
    if (!consommerCodeRecuperation(user.id, code_recuperation)) {
      return res.status(401).json({ error: 'Code de récupération invalide ou déjà utilisé.' });
    }
    const restants = db.prepare(
      'SELECT COUNT(*) n FROM mfa_recuperation WHERE utilisateur_id = ? AND utilise_le IS NULL'
    ).get(user.id).n;
    journaliser({ utilisateur_id: user.id, acteur: null, evenement: 'recuperation_utilisee',
                  detail: `${restants} code(s) restant(s)` });
    return delivrer();
  }

  let secret;
  try { secret = dechiffrer(user.totp_secret_chiffre); }
  catch (e) {
    // La clé du serveur manque ou a changé : le dire, plutôt que de laisser
    // croire à un code faux que l'utilisateur retapera dix fois.
    console.error('[mfa] secret illisible pour', user.email, ':', e.message);
    return res.status(503).json({
      error: "Le second facteur est indisponible côté serveur. Prévenez la direction.",
    });
  }

  const v = verifierTotp(secret, code, { dernierPas: user.totp_dernier_pas });
  if (!v.ok) {
    return res.status(401).json({
      error: v.raison === 'deja_utilise'
        ? 'Ce code a déjà servi. Attendez le suivant.'
        : 'Code incorrect.',
    });
  }
  // Le pas consommé s'écrit AVANT de délivrer le jeton : l'anti-rejeu ne vaut
  // que s'il est enregistré, et une réponse partie n'attend personne.
  db.prepare('UPDATE utilisateur SET totp_dernier_pas = ? WHERE id = ?').run(v.pas, user.id);
  return delivrer();
});

r.get('/me', authRequired, (req, res) => {
  res.json({ user: req.user });
});

// Liste des comptes ayant un accès Lucie (admin uniquement) — pour le mode "voir comme"
r.get('/profils-acces', authRequired, roleRequired('admin'), (req, res) => {
  const rows = db.prepare(
    "SELECT id, email, nom_complet, role FROM utilisateur WHERE actif = 1 ORDER BY nom_complet"
  ).all();
  res.json(rows);
});

// "Voir comme" : génère un token aperçu (lecture seule) pour un autre profil (admin uniquement)
r.post('/impersonate', authRequired, roleRequired('admin'), (req, res) => {
  // PAS D'IMPERSONATION EN CHAÎNE. Le jeton aperçu est déjà refusé plus haut
  // pour toute méthode autre que GET, donc pour ce POST — on le redit ici
  // parce que cette route-ci fabrique des jetons, et que la protection d'une
  // fabrique de jetons ne doit pas dépendre d'une règle écrite ailleurs pour
  // une autre raison.
  //
  // Le jeton intermédiaire du second facteur, lui, n'arrive jamais jusqu'ici :
  // `authRequired` le refuse. Un mot de passe volé ne donne donc pas accès à
  // « voir comme », qui ouvre tous les profils de l'Institut.
  if (req.user.preview) {
    return res.status(403).json({ error: "On ne visite pas un profil depuis un autre profil visité." });
  }

  const { user_id } = req.body || {};
  const target = db.prepare('SELECT * FROM utilisateur WHERE id = ? AND actif = 1').get(user_id);
  if (!target) return res.status(404).json({ error: 'Profil introuvable ou inactif' });
  const token = signPreviewToken(target, { id: req.user.id, nom: req.user.nom });
  res.json({ token, user: {
    id: target.id, email: target.email, role: target.role, nom: target.nom_complet,
    acces_recrutement: target.acces_recrutement ? 1 : 0,
    peut_valider: peutValiderAttributions(target),
    preview: true, imp_by_nom: req.user.nom,
  } });
});

export default r;
