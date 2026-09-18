#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// essai-mfa.js — Contrôle de bout en bout du second facteur.
//
// Lucie n'a pas de cadre de tests, et l'on n'en installe pas un pour une
// fonctionnalité. Mais ce chemin-ci n'est pas comme les autres : c'est celui
// de la CONNEXION, il n'a pas d'écran où l'on verrait qu'il s'est cassé, et
// une régression n'y donne pas un affichage bizarre — elle donne soit tout le
// monde dehors, soit tout le monde dedans.
//
// Ce script monte les vraies routes sur une base JETABLE et vérifie une
// trentaine de points : le secret chiffré au repos, les codes de secours
// hachés, l'anti-rejeu, l'usage unique, le jeton intermédiaire qui n'ouvre
// aucune porte, la réinitialisation interdite sur soi.
//
//   DB_PATH=/tmp/essai.db MFA_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))") \
//     node scripts/essai-mfa.js
//
// LA BASE INDIQUÉE PAR DB_PATH EST ÉCRITE : ne jamais la faire pointer vers
// attributions.db.
// ─────────────────────────────────────────────────────────────────────────────
import express from 'express';
import bcrypt from 'bcryptjs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const B = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
const { default: db }         = await import(B + '/db/index.js');
const { default: authRoutes } = await import(B + '/routes/auth.js');
const { default: mfaRoutes, migrerMfa } = await import(B + '/routes/mfa.js');
const totp = await import(B + '/lib/totp.js');
const { dechiffrer } = await import(B + '/lib/secret-box.js');

db.exec(`CREATE TABLE IF NOT EXISTS utilisateur (
  id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, nom_complet TEXT, role TEXT NOT NULL DEFAULT 'consultation',
  actif INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, last_login_at DATETIME,
  acces_recrutement INTEGER DEFAULT 0, permissions_json TEXT, professeur_id INTEGER)`);
migrerMfa(db);

const mdp = bcrypt.hashSync('secret-de-jerome', 10);
db.prepare("INSERT OR IGNORE INTO utilisateur (id,email,password_hash,nom_complet,role) VALUES (1,'jerome@iip.be',?,'Jérôme','admin')").run(mdp);
db.prepare("INSERT OR IGNORE INTO utilisateur (id,email,password_hash,nom_complet,role) VALUES (2,'charles@iip.be',?,'Charles Sohet','directeur')").run(mdp);

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/mfa', mfaRoutes);
const srv = app.listen(0);
const port = srv.address().port;
const U = p => `http://127.0.0.1:${port}${p}`;

let ko = 0;
const ok = (cond, libelle, extra = '') => {
  if (!cond) ko++;
  console.log(`${cond ? '  ok  ' : ' ÉCHEC'} ${libelle}${extra ? '  — ' + extra : ''}`);
};
async function appel(p, { method = 'GET', body, token } = {}) {
  const r = await fetch(U(p), { method, headers: {
    'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  return { statut: r.status, corps: await r.json().catch(() => ({})) };
}

console.log('\n── Sans second facteur : rien ne change ──');
let r = await appel('/api/auth/login', { method: 'POST', body: { email: 'jerome@iip.be', password: 'secret-de-jerome' } });
ok(r.statut === 200 && !!r.corps.token && !r.corps.mfa_requis, 'connexion ordinaire : jeton délivré');
const jeton = r.corps.token;
r = await appel('/api/auth/login', { method: 'POST', body: { email: 'jerome@iip.be', password: 'faux' } });
ok(r.statut === 401, 'mot de passe faux : 401');

console.log('\n── Enrôlement ──');
r = await appel('/api/mfa/enroler', { method: 'POST', token: jeton });
ok(r.statut === 200 && r.corps.uri?.startsWith('otpauth://totp/'), 'enrôlement : URI otpauth rendue');
const secret = r.corps.secret;
const enBase = db.prepare('SELECT totp_secret_chiffre, mfa_actif FROM utilisateur WHERE id = 1').get();
ok(!enBase.totp_secret_chiffre.includes(secret), 'le secret est CHIFFRÉ en base (jamais en clair)');
ok(dechiffrer(enBase.totp_secret_chiffre) === secret, 'et se relit correctement');
ok(enBase.mfa_actif === 0, "mfa_actif reste à 0 tant qu'aucun code n'a été prouvé");

r = await appel('/api/mfa/activer', { method: 'POST', token: jeton, body: { code: '000000' } });
ok(r.statut === 401, 'activation avec un code faux : refusée');
r = await appel('/api/mfa/activer', { method: 'POST', token: jeton, body: { code: totp.codeTotp(secret, totp.pasCourant()) } });
ok(r.statut === 200 && r.corps.codes?.length === 10, 'activation : 10 codes de récupération rendus');
const codesSecours = r.corps.codes;
const hach = db.prepare('SELECT code_hash FROM mfa_recuperation WHERE utilisateur_id = 1').all();
ok(hach.every(h => h.code_hash.startsWith('$2')), 'les codes de récupération sont hachés en bcrypt');

console.log('\n── Connexion en deux temps ──');
r = await appel('/api/auth/login', { method: 'POST', body: { email: 'jerome@iip.be', password: 'secret-de-jerome' } });
ok(r.statut === 200 && r.corps.mfa_requis === true && !r.corps.token, '/login : mfa_requis, AUCUN jeton de session');
const intermediaire = r.corps.token_intermediaire;
ok(!!intermediaire, 'jeton intermédiaire délivré');

const jetonLu = JSON.parse(Buffer.from(intermediaire.split('.')[1], 'base64url'));
ok(jetonLu.scope === 'mfa_pending', 'portée du jeton intermédiaire = mfa_pending');
ok(!jetonLu.role && !jetonLu.permissions_json, 'il ne porte ni rôle ni permissions');
ok(jetonLu.exp - jetonLu.iat === 300, 'il dure exactement 5 minutes');

console.log('\n── Le jeton intermédiaire n\'ouvre AUCUNE route métier ──');
for (const [chemin, methode] of [['/api/auth/me','GET'], ['/api/auth/profils-acces','GET'],
                                 ['/api/mfa/etat','GET'], ['/api/auth/impersonate','POST']]) {
  r = await appel(chemin, { method: methode, token: intermediaire,
                            body: methode === 'GET' ? undefined : { user_id: 2 } });
  ok(r.statut === 401 && r.corps.mfa_requis === true, `${methode} ${chemin} : refusé (401)`);
}

console.log('\n── /login/mfa ──');
r = await appel('/api/auth/login/mfa', { method: 'POST', body: { token_intermediaire: intermediaire, code: '111111' } });
ok(r.statut === 401, 'code faux : refusé');
r = await appel('/api/auth/login/mfa', { method: 'POST', body: { token_intermediaire: jeton, code: totp.codeTotp(secret, totp.pasCourant()) } });
ok(r.statut === 401 && r.corps.recommencer, "un jeton de SESSION présenté ici n'est pas accepté");
// L'activation vient de consommer le pas courant : le code de CE pas-ci est
// donc déjà mort, ce qui est exactement voulu. On prend le pas suivant, qui
// tombe dans la tolérance de +1.
r = await appel('/api/auth/login/mfa', { method: 'POST', body: { token_intermediaire: intermediaire, code: totp.codeTotp(secret, totp.pasCourant()) } });
ok(r.statut === 401 && /déjà servi/.test(r.corps.error || ''), "le code consommé par l'activation ne resert pas");
const pas = totp.pasCourant() + 1;
r = await appel('/api/auth/login/mfa', { method: 'POST', body: { token_intermediaire: intermediaire, code: totp.codeTotp(secret, pas) } });
ok(r.statut === 200 && !!r.corps.token, 'code juste (pas suivant, tolérance +1) : vrai jeton délivré', JSON.stringify(r.corps.error||''));
const jetonMfa = r.corps.token;
ok(JSON.parse(Buffer.from(jetonMfa.split('.')[1],'base64url')).role === 'admin', 'et il porte le rôle');
r = await appel('/api/auth/login/mfa', { method: 'POST', body: { token_intermediaire: intermediaire, code: totp.codeTotp(secret, pas) } });
ok(r.statut === 401, 'REJEU du même code : refusé');

console.log('\n── Plafond d\'essais par laissez-passer ──');
r = await appel('/api/auth/login', { method: 'POST', body: { email: 'jerome@iip.be', password: 'secret-de-jerome' } });
const interEssais = r.corps.token_intermediaire;
let statuts = [];
for (let i = 0; i < 7; i++) {
  const x = await appel('/api/auth/login/mfa', { method: 'POST', body: { token_intermediaire: interEssais, code: '000000' } });
  statuts.push(x.statut);
}
ok(statuts.slice(0, 5).every(s => s === 401), 'cinq premiers essais : 401 ordinaire', statuts.join(','));
ok(statuts[5] === 429 && statuts[6] === 429, 'au-delà : 429, il faut reprendre au mot de passe');
// LE COMPTE N'EST PAS VERROUILLÉ : le mot de passe rouvre la porte, et le
// compteur du nouveau laissez-passer repart à zéro — un mauvais code y reçoit
// un 401 ordinaire, pas le 429 du précédent.
r = await appel('/api/auth/login', { method: 'POST', body: { email: 'jerome@iip.be', password: 'secret-de-jerome' } });
const neuf = r.corps.token_intermediaire;
ok(r.statut === 200 && !!neuf, "le compte n'est PAS verrouillé : un nouveau laissez-passer est délivré");
r = await appel('/api/auth/login/mfa', { method: 'POST', body: { token_intermediaire: neuf, code: '000000' } });
ok(r.statut === 401, 'et son compteur repart à zéro (401, non 429)');

console.log('\n── Codes de récupération ──');
r = await appel('/api/auth/login', { method: 'POST', body: { email: 'jerome@iip.be', password: 'secret-de-jerome' } });
const inter2 = r.corps.token_intermediaire;
r = await appel('/api/auth/login/mfa', { method: 'POST', body: { token_intermediaire: inter2, code_recuperation: codesSecours[3].toLowerCase().replace('-',' ') } });
ok(r.statut === 200 && !!r.corps.token, 'code de secours accepté (casse et tiret tolérés)');
r = await appel('/api/auth/login', { method: 'POST', body: { email: 'jerome@iip.be', password: 'secret-de-jerome' } });
r = await appel('/api/auth/login/mfa', { method: 'POST', body: { token_intermediaire: r.corps.token_intermediaire, code_recuperation: codesSecours[3] } });
ok(r.statut === 401, 'le même code de secours une seconde fois : refusé (usage unique)');

console.log('\n── Réinitialisation par la direction ──');
r = await appel('/api/mfa/1/reinitialiser', { method: 'POST', token: jetonMfa, body: { motif: 'essai' } });
ok(r.statut === 403, 'sur SON PROPRE compte : interdite');
const jetonCharles = (await appel('/api/auth/login', { method: 'POST', body: { email: 'charles@iip.be', password: 'secret-de-jerome' } })).corps.token;
r = await appel('/api/mfa/1/reinitialiser', { method: 'POST', token: jetonCharles, body: { motif: 'téléphone perdu' } });
ok(r.statut === 200, 'par un directeur (NIVEAU_DIRECTION, pas seulement admin) : acceptée');
const apres = db.prepare('SELECT mfa_actif, totp_secret_chiffre FROM utilisateur WHERE id = 1').get();
ok(apres.mfa_actif === 0 && !apres.totp_secret_chiffre, 'le secret et les codes sont effacés');
const j = db.prepare("SELECT * FROM mfa_journal WHERE utilisateur_id = 1 AND evenement = 'reinitialise'").get();
ok(!!j && j.acteur_nom === 'Charles Sohet' && j.detail === 'téléphone perdu', 'journalisée : qui, sur qui, pourquoi');
r = await appel('/api/auth/login', { method: 'POST', body: { email: 'jerome@iip.be', password: 'secret-de-jerome' } });
ok(r.statut === 200 && !!r.corps.token, 'le compte se reconnecte au seul mot de passe');

console.log('\n── methode_auth ──');
db.prepare("UPDATE utilisateur SET methode_auth = 'sso' WHERE id = 2").run();
r = await appel('/api/auth/login', { method: 'POST', body: { email: 'charles@iip.be', password: 'secret-de-jerome' } });
ok(r.statut === 403, "methode_auth ≠ 'local' : la porte du mot de passe est fermée");
db.prepare("UPDATE utilisateur SET methode_auth = 'local' WHERE id = 2").run();

console.log('\n── Contournements ──');
r = await appel('/api/auth/demo-login', { method: 'POST' });
ok(r.statut === 403, '/demo-login hors DEMO_MODE : 403');

srv.close();
console.log(ko === 0 ? '\n✓ tout passe\n' : `\n✗ ${ko} échec(s)\n`);
process.exit(ko ? 1 : 0);
