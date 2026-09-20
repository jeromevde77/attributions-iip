#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// deblocage.js — Rouvrir un compte fermé par le plafond des tentatives.
//
// DERNIER RECOURS, ET IL EN FAUT UN. Le blocage s'aggrave — quinze minutes,
// une heure, puis une journée entière : c'est ce qui le rend dissuasif, et
// c'est aussi ce qui le rend insupportable le jour où il tombe sur la
// mauvaise personne. Un secrétariat bloqué vingt-quatre heures un matin de
// rentrée ne peut pas « attendre demain », et la direction elle-même peut se
// retrouver dehors.
//
// Il n'est pas un contournement : il exige un accès au SERVEUR, donc à la
// machine qui porte la base — quelqu'un qui l'a n'avait pas besoin de forcer
// un mot de passe pour lire les données. Et il écrit au journal, comme le
// reste.
//
//   docker exec -it attributions-backend-dev node scripts/deblocage.js <email>
//   docker exec -it attributions-backend-dev node scripts/deblocage.js --liste
//   docker exec -it attributions-backend-dev node scripts/deblocage.js --tous
//
// Volontairement, il ne touche NI au mot de passe NI au second facteur : une
// commande qui fait deux choses finit par en faire une de trop. Pour le
// second facteur, c'est `mfa-reset.js` ; pour le mot de passe, l'écran.
// ─────────────────────────────────────────────────────────────────────────────
import 'dotenv/config';
import db from '../src/db/index.js';
import { migrerTentatives, direDelai } from '../src/lib/tentatives.js';
import { journaliser } from '../src/routes/mfa.js';

const arg = (process.argv[2] || '').trim();

// Rejouable et protégée par contrôle d'existence : la lancer ici permet
// d'employer le script sur une base que le serveur n'a pas encore vue — donc
// exactement le jour où l'on en a besoin.
migrerTentatives(db);

if (!arg || arg === '--aide' || arg === '-h') {
  console.log(`
Usage :
  node scripts/deblocage.js <email>    rouvre ce compte (compteur et palier remis à zéro)
  node scripts/deblocage.js --liste    montre les comptes bloqués ou en cours de série
  node scripts/deblocage.js --tous     rouvre TOUS les comptes bloqués
`);
  process.exit(arg ? 0 : 1);
}

/** Ce que la base sait, mis en mots — « bloqué encore 43 minutes ». */
function etatLisible(l) {
  if (!l.bloque_jusqu) return `${l.echecs} échec(s) en cours, pas encore bloqué`;
  const reste = db.prepare(
    `SELECT CAST((julianday(?) - julianday('now')) * 24 * 60 AS REAL) AS m`).get(l.bloque_jusqu).m;
  if (!(reste > 0)) return `blocage expiré (palier ${l.palier})`;
  return `BLOQUÉ encore ${direDelai(Math.max(1, Math.ceil(reste)))} (palier ${l.palier})`;
}

if (arg === '--liste') {
  const lignes = db.prepare(`
    SELECT b.*, u.email, u.nom_complet, u.role
    FROM connexion_blocage b JOIN utilisateur u ON u.id = b.utilisateur_id
    ORDER BY b.bloque_jusqu DESC NULLS LAST, b.dernier_echec DESC`).all();
  if (!lignes.length) { console.log('Aucun compte bloqué ni en série d’échecs.'); process.exit(0); }
  console.log(`\n${lignes.length} compte(s) :\n`);
  for (const l of lignes) {
    console.log(`  ${String(l.email).padEnd(42)} ${String(l.role || '').padEnd(18)} ${etatLisible(l)}`);
  }
  console.log('');
  process.exit(0);
}

if (arg === '--tous') {
  const lignes = db.prepare(`
    SELECT b.utilisateur_id, u.email FROM connexion_blocage b
    JOIN utilisateur u ON u.id = b.utilisateur_id
    WHERE b.bloque_jusqu IS NOT NULL AND datetime(b.bloque_jusqu) > datetime('now')`).all();
  if (!lignes.length) { console.log('Aucun compte n’est bloqué en ce moment.'); process.exit(0); }
  for (const l of lignes) {
    db.prepare('DELETE FROM connexion_blocage WHERE utilisateur_id = ?').run(l.utilisateur_id);
    journaliser({ utilisateur_id: l.utilisateur_id, acteur: null,
      evenement: 'connexion_debloquee', detail: 'ligne de commande — --tous' });
    console.log(`✅ ${l.email}`);
  }
  console.log(`\n${lignes.length} compte(s) rouvert(s).`);
  process.exit(0);
}

const u = db.prepare('SELECT id, email, nom_complet FROM utilisateur WHERE lower(email) = lower(?)')
  .get(arg);
if (!u) {
  console.error(`❌ Aucun compte pour « ${arg} ».`);
  console.error('   `--liste` montre les comptes bloqués.');
  process.exit(1);
}

const avant = db.prepare('SELECT * FROM connexion_blocage WHERE utilisateur_id = ?').get(u.id);
if (!avant) {
  console.log(`ℹ️  ${u.email} n'est ni bloqué ni en série d'échecs — rien à faire.`);
  process.exit(0);
}

console.log(`État : ${etatLisible(avant)}`);
db.prepare('DELETE FROM connexion_blocage WHERE utilisateur_id = ?').run(u.id);
journaliser({ utilisateur_id: u.id, acteur: null,
  evenement: 'connexion_debloquee', detail: 'ligne de commande' });
console.log(`✅ ${u.email} peut de nouveau se connecter. Compteur ET palier remis à zéro.`);
