// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Le mot de passe : le changer, et le retrouver quand on l'a perdu
//
// Personne ne pouvait changer son propre mot de passe. Le seul chemin passait
// par un administrateur (`PATCH /api/users/:id`) ou par `seed-admin.js` sur le
// serveur : un mot de passe oublié un samedi attendait le lundi, et surtout
// il transitait par une TROISIÈME personne, qui le lisait. Un mot de passe que
// quelqu'un d'autre connaît n'est plus un mot de passe.
//
// LE LIEN NE CONNECTE PAS, IL PERMET DE CHOISIR UN MOT DE PASSE. C'est toute
// la sûreté du dispositif : qui accède à une boîte mail peut changer le mot de
// passe, mais il lui faudra encore le code à six chiffres pour entrer, comme à
// n'importe quelle connexion. Délivrer une session au bout du lien ferait de
// la messagerie un contournement du second facteur — et le second facteur ne
// vaut que ce que vaut le chemin le plus faible qui l'évite.
// ─────────────────────────────────────────────────────────────────────────────
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import db from '../db/index.js';

/** Une heure : le temps de lire son courrier, pas celui d'un week-end. */
export const VALIDITE_MINUTES = 60;

/**
 * Trois demandes par heure et par compte. Au-delà, on cesse d'envoyer sans
 * rien dire de plus : le but n'est pas de protéger le compte — le jeton
 * expire seul — mais d'empêcher qu'on inonde la boîte de quelqu'un depuis un
 * écran public.
 */
export const DEMANDES_MAX_PAR_HEURE = 3;

export function migrerMotDePasse(dbx) {
  try {
    dbx.exec(`
    CREATE TABLE IF NOT EXISTS mot_de_passe_jeton (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      utilisateur_id INTEGER NOT NULL,
      -- LE JETON N'EST JAMAIS ÉCRIT EN CLAIR. Qui lit la base pourrait sinon
      -- prendre n'importe quel compte sans connaître aucun mot de passe — une
      -- sauvegarde qui traîne suffirait. On garde son empreinte, et l'on
      -- compare des empreintes.
      jeton_hash     TEXT NOT NULL UNIQUE,
      cree_le        TEXT DEFAULT (datetime('now')),
      expire_le      TEXT NOT NULL,
      utilise_le     TEXT,
      demande_par_ip TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_mdp_jeton_user ON mot_de_passe_jeton(utilisateur_id, cree_le DESC);`);
    console.log('[migration] mot_de_passe_jeton : réinitialisation en libre-service');
  } catch (e) { console.error('[migration] mot_de_passe_jeton :', e.message); }
}

/*
 * SHA-256 ET NON BCRYPT, ET C'EST UN CHOIX, NON UN OUBLI.
 *
 * Les codes de récupération passent par bcrypt parce qu'ils sont COURTS — huit
 * caractères qu'un humain recopie —, donc devinables : il faut rendre chaque
 * essai coûteux. Un jeton de 32 octets tirés au hasard ne se devine pas ; le
 * hacher lentement ne protégerait de rien et obligerait à parcourir toute la
 * table pour retrouver la ligne, faute de pouvoir l'indexer.
 */
const empreinte = jeton => crypto.createHash('sha256').update(String(jeton)).digest('hex');

/**
 * LA POLITIQUE TIENT EN DEUX RÈGLES, ET C'EST VOLONTAIRE.
 *
 * Douze caractères, et rien qui ressemble au compte. Exiger une majuscule, un
 * chiffre et un caractère spécial produit « Prenom2026! » — long en apparence,
 * deviné en trois essais — et pousse à écrire le mot de passe sur un papier.
 * La longueur est ce qui protège réellement ; le reste est du rituel.
 */
export const LONGUEUR_MIN = 12;

export function verifierNouveauMotDePasse(mdp, user) {
  const m = String(mdp || '');
  if (m.length < LONGUEUR_MIN) {
    return { ok: false, erreur: `Le mot de passe doit faire au moins ${LONGUEUR_MIN} caractères. `
      + `Une phrase dont vous vous souvenez vaut mieux qu'un mot compliqué.` };
  }
  if (m.length > 200) return { ok: false, erreur: 'Mot de passe trop long (200 caractères au plus).' };

  const bas = m.toLowerCase();
  const morceaux = [
    (user?.email || '').split('@')[0],
    ...String(user?.nom_complet || '').split(/[\s,.-]+/),
  ].map(x => String(x).toLowerCase()).filter(x => x.length >= 4);
  if (morceaux.some(x => bas.includes(x))) {
    return { ok: false, erreur: 'Le mot de passe ne peut pas contenir votre nom ni votre adresse.' };
  }
  return { ok: true, erreur: null };
}

/** Le compte peut-il se voir poser un mot de passe ? */
export function comptePeutMotDePasse(user) {
  if (!user || !user.actif) return false;
  return (user.methode_auth || 'local') === 'local';
}

/**
 * Fabrique un jeton et rend sa forme EN CLAIR — la seule fois où elle existe.
 * Les jetons antérieurs du compte sont annulés : deux liens valides pour un
 * même compte, c'est un lien de trop qui traîne dans une boîte.
 */
export function creerJeton(utilisateurId, ip = null) {
  const jeton = crypto.randomBytes(32).toString('base64url');
  const tx = db.transaction(() => {
    db.prepare(`UPDATE mot_de_passe_jeton SET utilise_le = datetime('now')
                WHERE utilisateur_id = ? AND utilise_le IS NULL`).run(utilisateurId);
    db.prepare(`INSERT INTO mot_de_passe_jeton (utilisateur_id, jeton_hash, expire_le, demande_par_ip)
                VALUES (?, ?, datetime('now', ?), ?)`)
      .run(utilisateurId, empreinte(jeton), `+${VALIDITE_MINUTES} minutes`, ip);
  });
  tx();
  return jeton;
}

/** Combien de demandes pour ce compte dans la dernière heure. */
export function demandesRecentes(utilisateurId) {
  return db.prepare(`SELECT COUNT(*) n FROM mot_de_passe_jeton
                     WHERE utilisateur_id = ? AND cree_le > datetime('now', '-1 hour')`)
    .get(utilisateurId).n;
}

/**
 * Relit un jeton SANS le consommer : l'écran doit pouvoir dire « ce lien a
 * expiré » avant de faire saisir deux fois un mot de passe pour rien.
 */
export function lireJeton(jeton) {
  if (!jeton) return null;
  const l = db.prepare(`SELECT * FROM mot_de_passe_jeton
                        WHERE jeton_hash = ? AND utilise_le IS NULL
                          AND expire_le > datetime('now')`).get(empreinte(jeton));
  if (!l) return null;
  const user = db.prepare('SELECT * FROM utilisateur WHERE id = ?').get(l.utilisateur_id);
  return comptePeutMotDePasse(user) ? { ligne: l, user } : null;
}

/**
 * Pose le mot de passe et brûle le jeton, dans la MÊME transaction : entre les
 * deux, un lien encore valide permettrait de recommencer.
 */
export function poserMotDePasse(utilisateurId, mdp, jetonLigneId = null) {
  const hash = bcrypt.hashSync(mdp, 10);
  const tx = db.transaction(() => {
    db.prepare('UPDATE utilisateur SET password_hash = ? WHERE id = ?').run(hash, utilisateurId);
    // Tous les liens en cours tombent, pas seulement celui qu'on vient
    // d'employer : si un second traînait dans une boîte, il ne vaut plus rien.
    db.prepare(`UPDATE mot_de_passe_jeton SET utilise_le = datetime('now')
                WHERE utilisateur_id = ? AND utilise_le IS NULL`).run(utilisateurId);
    if (jetonLigneId) {
      db.prepare(`UPDATE mot_de_passe_jeton SET utilise_le = datetime('now') WHERE id = ?`)
        .run(jetonLigneId);
    }
  });
  tx();
}

/** Ménage : les jetons morts ne servent qu'à faire grossir la table. */
export function purgerJetons() {
  try {
    return db.prepare(`DELETE FROM mot_de_passe_jeton
                       WHERE expire_le < datetime('now', '-7 days')`).run().changes;
  } catch { return 0; }
}
