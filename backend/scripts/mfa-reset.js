#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// mfa-reset.js — Déblocage du second facteur en ligne de commande.
//
// DERNIER RECOURS, et il en faut un. L'écran de la direction suffit dans tous
// les cas sauf un : celui où c'est la direction elle-même qui a perdu son
// téléphone, et où personne ne peut plus entrer pour débloquer personne. Sans
// cette porte, l'Institut resterait dehors jusqu'à une restauration de
// sauvegarde.
//
// Elle n'est pas un contournement : elle exige un accès au serveur, donc à la
// machine qui porte la base — quelqu'un qui l'a n'avait pas besoin du second
// facteur pour lire les données. Et elle écrit au journal comme les autres.
//
//   docker exec -it attributions-backend node scripts/mfa-reset.js <email>
//   docker exec -it attributions-backend node scripts/mfa-reset.js --liste
//
// Volontairement, elle ne demande NI ne change de mot de passe : une commande
// qui fait deux choses finit par en faire une de trop.
// ─────────────────────────────────────────────────────────────────────────────
import 'dotenv/config';
import db from '../src/db/index.js';
import { migrerMfa, reinitialiserMfa, journaliser } from '../src/routes/mfa.js';

const arg = (process.argv[2] || '').trim();

// La migration est rejouable et protégée par contrôle d'existence : la lancer
// ici permet d'employer le script sur une base qui n'a pas encore vu le
// serveur — c'est-à-dire exactement le jour où l'on en a besoin.
migrerMfa(db);

if (!arg || arg === '--aide' || arg === '-h') {
  console.log(`
Usage :
  node scripts/mfa-reset.js <email>     réinitialise le second facteur de ce compte
  node scripts/mfa-reset.js --liste     liste les comptes dont le second facteur est actif
`);
  process.exit(arg ? 0 : 1);
}

if (arg === '--liste') {
  const lignes = db.prepare(`
    SELECT u.email, u.nom_complet, u.role, u.last_login_at,
           (SELECT COUNT(*) FROM mfa_recuperation m
             WHERE m.utilisateur_id = u.id AND m.utilise_le IS NULL) AS codes
      FROM utilisateur u
     WHERE u.mfa_actif = 1 AND u.actif = 1
     ORDER BY u.nom_complet
  `).all();
  if (!lignes.length) { console.log('Aucun compte avec second facteur actif.'); process.exit(0); }
  for (const l of lignes) {
    console.log(`  ${l.email.padEnd(34)} ${String(l.role).padEnd(18)} `
              + `${l.codes} code(s) de secours  · dernière connexion : ${l.last_login_at || 'jamais'}`);
  }
  process.exit(0);
}

const u = db.prepare('SELECT * FROM utilisateur WHERE email = ?').get(arg);
if (!u) {
  console.error(`Aucun compte avec l'adresse « ${arg} ».`);
  process.exit(1);
}
if (!u.mfa_actif && !u.totp_secret_chiffre) {
  console.log(`Le second facteur n'était pas actif sur ${u.email} : rien à faire.`);
  process.exit(0);
}

reinitialiserMfa(u.id);
journaliser({
  utilisateur_id: u.id, acteur: null, evenement: 'reinitialise',
  detail: `ligne de commande (${process.env.USER || process.env.USERNAME || 'inconnu'})`,
});

console.log(`Second facteur réinitialisé pour ${u.email}.`);
console.log('Cette personne se connecte à nouveau avec son seul mot de passe ;');
console.log("elle doit reconfigurer son application depuis « Mon compte ».");
console.log("PRÉVENEZ-LA : l'écran de la direction envoie un courriel, pas ce script.");
