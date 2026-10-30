// ─────────────────────────────────────────────────────────────────────────────
// LE PORTAIL DES ÉTUDIANTS — DE L'AUTRE CÔTÉ DU MUR (3.1.477, Charles, 30 octobre 2026 : « il est impératif
// qu'un mur de Berlin infranchissable soit mis entre la version de Lucie pour les MDP et la version accessible
// aux étudiants » ; tranché : une base étudiante à part, etudiants.lucie-iip.be).
//
// CE PROGRAMME NE CONTIENT RIEN DE LUCIE. Pas une ligne de son code, pas sa base, pas ses clés (ni JWT_SECRET,
// ni MFA_KEY), pas son serveur de courriel, et il ne l'appelle jamais : il n'est pas sur son réseau. Il a SA
// base (`portail.db`), qui ne contient que ce que Lucie a décidé de montrer — les étudiants qui ont une adresse
// d'école, leurs résultats PUBLIÉS, les pièces qu'on leur a envoyées, les règlements qu'on leur destine — et ce
// que les étudiants y font : connexions, accusés de réception.
//
// LE SENS UNIQUE. C'est Lucie qui vient, par le port INTERNE (jamais publié, réseau Docker seul, jeton partagé) :
// elle DÉPOSE (POST /interne/…) et RELÈVE (GET /interne/releve). Le portail n'envoie aucun courriel : il inscrit
// une demande (« lien pour tel étudiant », « code pour tel étudiant ») que Lucie relève, VÉRIFIE et compose
// elle-même. Un portail compromis ne livre donc que ce qu'il contient, et ne peut faire écrire à Lucie ni un autre
// texte, ni à une autre adresse.
//
// L'ÉTUDIANT : son adresse d'institut (ou son matricule) → lien à usage unique (30 min) à son adresse d'école →
// session de 2 h signée de la clé du portail. L'APPAREIL RECONNU (Charles, 30 octobre 2026 : « pas que sur
// téléphone ; trois dispositifs au maximum ; une fois l'accès obtenu, il entre directement ») : un cookie httpOnly
// (la base n'en garde que l'empreinte), 90 jours glissants, trois appareils au plus — au quatrième, l'étudiant,
// qui vient de prouver sa boîte d'école, choisit lequel remplacer. Signer un accusé : avoir ouvert la pièce (posé par la route qui la rend) + un code à six chiffres
// reçu à l'adresse d'école (10 min, 5 essais). Un accusé signé ne se modifie ni ne s'efface.
//
// LE MOT DE PASSE (3.1.513, Charles : « son mot de passe qu'il a choisi lui, comme pour les MDP »). Le lien reçu par
// courriel ne sert plus qu'à la PREMIÈRE visite et au mot de passe OUBLIÉ : il mène à « choisir mon mot de passe ».
// Ensuite : adresse d'institut (ou matricule) + mot de passe ; sur un appareil reconnu, c'est tout ; sur un autre,
// un code à six chiffres reçu à l'adresse d'école en plus. Et l'espace ne s'ouvre que DEPUIS LA BELGIQUE, hors VPN
// connus (`geo.js`), sauf ouverture accordée par le secrétariat dans Lucie (stage, Erasmus) — déposée ici.
// ─────────────────────────────────────────────────────────────────────────────
import express from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import Database from 'better-sqlite3';
import { autorise, etatGeo } from './geo.js';

const PORT_PUBLIC = Number(process.env.PORT_PUBLIC || 3101);
const PORT_INTERNE = Number(process.env.PORT_INTERNE || 3102);
const SECRET = process.env.PORTAIL_SECRET || '';
const JETON_INTERNE = process.env.PORTAIL_JETON || '';
const URL_PUBLIQUE = (process.env.PORTAIL_URL_PUBLIQUE || 'https://etudiants.lucie-iip.be').replace(/\/$/, '');
if (SECRET.length < 32 || JETON_INTERNE.length < 32) {
  console.error('[portail] PORTAIL_SECRET et PORTAIL_JETON (32 caractères au moins) sont requis : refus de démarrer.');
  process.exit(1);
}
if (SECRET === JETON_INTERNE) { console.error('[portail] PORTAIL_SECRET et PORTAIL_JETON doivent différer.'); process.exit(1); }

const db = new Database(process.env.PORTAIL_DB || '/app/data/portail.db');
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS etudiant (id INTEGER PRIMARY KEY, nom TEXT, prenom TEXT, email_ecole TEXT NOT NULL, maj_le TEXT);
  CREATE TABLE IF NOT EXISTS matricule (code TEXT PRIMARY KEY, etudiant_id INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS resultat (etudiant_id INTEGER NOT NULL, annee TEXT NOT NULL, ue_num INTEGER, ue_nom TEXT,
    decision TEXT, note TEXT, etat TEXT);
  CREATE INDEX IF NOT EXISTS idx_resultat ON resultat(etudiant_id);
  CREATE TABLE IF NOT EXISTS document (id INTEGER PRIMARY KEY, etudiant_id INTEGER NOT NULL, sujet TEXT, nom_fichier TEXT,
    envoye_le TEXT, reference TEXT, mime TEXT, contenu BLOB);
  CREATE TABLE IF NOT EXISTS reglement (version_id INTEGER PRIMARY KEY, cle TEXT NOT NULL, titre TEXT, numero INTEGER,
    publiee_le TEXT, contenu TEXT, source_url TEXT, valables TEXT);
  CREATE TABLE IF NOT EXISTS jeton (id INTEGER PRIMARY KEY AUTOINCREMENT, etudiant_id INTEGER NOT NULL, jeton_hash TEXT NOT NULL UNIQUE,
    cree_le TEXT NOT NULL DEFAULT (datetime('now')), expire_le TEXT NOT NULL, utilise_le TEXT, ip TEXT, releve_le TEXT);
  CREATE TABLE IF NOT EXISTS code (id INTEGER PRIMARY KEY AUTOINCREMENT, etudiant_id INTEGER NOT NULL, objet_type TEXT NOT NULL,
    objet_id INTEGER NOT NULL, code_hash TEXT NOT NULL, cree_le TEXT NOT NULL DEFAULT (datetime('now')), expire_le TEXT NOT NULL,
    essais INTEGER NOT NULL DEFAULT 0, utilise_le TEXT);
  -- Ce que Lucie doit envoyer : la valeur (lien, code) n'y vit que jusqu'au relevé.
  CREATE TABLE IF NOT EXISTS demande (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL CHECK (type IN ('lien','code')),
    etudiant_id INTEGER NOT NULL, valeur TEXT, cree_le TEXT NOT NULL DEFAULT (datetime('now')), releve_le TEXT);
  CREATE TABLE IF NOT EXISTS accuse (id INTEGER PRIMARY KEY AUTOINCREMENT, etudiant_id INTEGER NOT NULL,
    objet_type TEXT NOT NULL CHECK (objet_type IN ('envoi','reglement')), objet_id INTEGER NOT NULL,
    presente_le TEXT, signe_le TEXT, ip TEXT, agent TEXT, releve_le TEXT, UNIQUE (etudiant_id, objet_type, objet_id));
  CREATE TABLE IF NOT EXISTS appareil (id INTEGER PRIMARY KEY AUTOINCREMENT, etudiant_id INTEGER NOT NULL,
    jeton_hash TEXT NOT NULL UNIQUE, nom TEXT, cree_le TEXT NOT NULL DEFAULT (datetime('now')), vu_le TEXT,
    expire_le TEXT NOT NULL, retire_le TEXT, ip TEXT);
  -- Au-delà de 90 jours, un document ne se télécharge qu'après un code (Charles, 30 octobre 2026 : « pour éviter la
  -- fraude ») ; le code ouvre le téléchargement de CE document pour une heure.
  CREATE TABLE IF NOT EXISTS deverrou (etudiant_id INTEGER NOT NULL, document_id INTEGER NOT NULL, jusqu_a TEXT NOT NULL,
    PRIMARY KEY (etudiant_id, document_id));
  -- Le registre d'authenticité, déposé par Lucie : ce qu'un QR retrouve. En ajout seul.
  CREATE TABLE IF NOT EXISTS authentique (reference TEXT PRIMARY KEY, nature TEXT, objet TEXT, personne TEXT, emise_le TEXT);
  CREATE TABLE IF NOT EXISTS entree (id INTEGER PRIMARY KEY AUTOINCREMENT, etudiant_id INTEGER NOT NULL,
    le TEXT NOT NULL DEFAULT (datetime('now')), ip TEXT, releve_le TEXT);
  -- Le mot de passe choisi par l'étudiant (empreinte scrypt salée) : il survit aux dépôts de Lucie, qui remplacent
  -- la table « etudiant ».
  CREATE TABLE IF NOT EXISTS compte (etudiant_id INTEGER PRIMARY KEY, mdp TEXT NOT NULL, maj_le TEXT NOT NULL DEFAULT (datetime('now')),
    echecs INTEGER NOT NULL DEFAULT 0, bloque_jusqu_a TEXT);
  -- Les ouvertures hors de Belgique, déposées par Lucie (remplacées à chaque dépôt).
  CREATE TABLE IF NOT EXISTS exception (etudiant_id INTEGER PRIMARY KEY, jusqu_au TEXT NOT NULL);
  CREATE TRIGGER IF NOT EXISTS accuse_signe_fige BEFORE UPDATE OF presente_le, signe_le, objet_id, etudiant_id ON accuse
    WHEN OLD.signe_le IS NOT NULL BEGIN SELECT RAISE(ABORT, 'Un accusé signé ne se modifie pas.'); END;
  CREATE TRIGGER IF NOT EXISTS accuse_sans_effacement BEFORE DELETE ON accuse
    WHEN OLD.signe_le IS NOT NULL BEGIN SELECT RAISE(ABORT, 'Un accusé signé ne s''efface pas.'); END;
`);

const empreinte = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const maintenant = () => db.prepare("SELECT datetime('now') n").get().n;
const egal = (a, b) => { const h = x => crypto.createHash('sha256').update(String(x)).digest(); return crypto.timingSafeEqual(h(a), h(b)); };

// ══ LE CÔTÉ PUBLIC ═════════════════════════════════════════════════════════
const pub = express();
pub.disable('x-powered-by');
pub.set('trust proxy', 2);
pub.use(express.json({ limit: '50kb' }));
pub.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

const essais = new Map();
const ipDe = req => req.ip || '?';
function tropDEssais(ip, plafond = 30) {
  const t = Date.now();
  const l = (essais.get(ip) || []).filter(x => t - x < 3600e3);
  l.push(t); essais.set(ip, l);
  return l.length > plafond;
}

pub.get('/api/portail/sante', (req, res) => res.json({ ok: true, geo: etatGeo() }));

// ── Le mot de passe ──
const hacher = mdp => { const sel = crypto.randomBytes(16); return `scrypt$${sel.toString('base64')}$${crypto.scryptSync(String(mdp), sel, 64).toString('base64')}`; };
const verifierMdp = (mdp, h) => {
  const [, sel, emp] = String(h || 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$').split('$');
  const calc = crypto.scryptSync(String(mdp), Buffer.from(sel || '', 'base64'), 64);
  const attendu = Buffer.from(emp || '', 'base64');
  return attendu.length === calc.length && crypto.timingSafeEqual(calc, attendu);
};
const BANALS = ['motdepasse', 'password', 'azerty', 'qwerty', '123456', 'institut', 'prigogine', 'bonjour', 'soleil'];
function mdpRefuse(mdp, e) {
  const m = String(mdp || '');
  if (m.length < 10) return 'Dix caractères au moins.';
  if (m.length > 200) return 'Deux cents caractères au plus.';
  const bas = m.toLowerCase();
  if (BANALS.some(b => bas.includes(b)) || /^(.)\1+$/.test(m) || /^\d+$/.test(m)) return 'Trop facile à deviner : mélangez des mots, des chiffres, des signes.';
  const parties = [e?.nom, e?.prenom, String(e?.email_ecole || '').split('@')[0]].filter(x => x && x.length >= 3).map(x => String(x).toLowerCase());
  if (parties.some(x => bas.includes(x))) return 'Votre nom ou votre adresse ne peuvent pas faire partie du mot de passe.';
  return null;
}

// ── Depuis la Belgique ──
const HORS_BELGIQUE = "Votre espace ne s'ouvre que depuis la Belgique, et pas au travers d'un VPN. En stage ou en Erasmus à l'étranger ? Le secrétariat peut vous ouvrir l'accès pour la durée du séjour.";
const exceptionDe = id => !!(id && db.prepare("SELECT 1 FROM exception WHERE etudiant_id = ? AND jusqu_au >= date('now')").get(id));
const permis = (req, etudiantId) => autorise(ipDe(req), exceptionDe(etudiantId));
const refuserHorsBelgique = res => res.status(403).json({ hors_belgique: true, error: HORS_BELGIQUE });
const trouver = ident => {
  const i = String(ident || '').trim();
  if (!i || i.length > 120) return null;
  return i.includes('@') ? db.prepare('SELECT * FROM etudiant WHERE lower(email_ecole) = lower(?)').get(i)
    : db.prepare('SELECT e.* FROM matricule m JOIN etudiant e ON e.id = m.etudiant_id WHERE m.code = ?').get(i);
};

// ── L'appareil reconnu ──
const COOKIE = 'portail_appareil';
const MAX_APPAREILS = 3;
const JOURS_APPAREIL = 90;
const lireCookie = req => {
  for (const p of String(req.headers.cookie || '').split(';')) {
    const [k, ...v] = p.trim().split('=');
    if (k === COOKIE) return decodeURIComponent(v.join('='));
  }
  return '';
};
const sur = req => URL_PUBLIQUE.startsWith('https://') && !/^(localhost|127\.)/.test(req.hostname || '');
const poserCookie = (req, res, valeur, secondes) => res.append('Set-Cookie',
  `${COOKIE}=${encodeURIComponent(valeur)}; Path=/api/portail; HttpOnly; SameSite=Strict; Max-Age=${secondes}${sur(req) ? '; Secure' : ''}`);
const oublierCookie = (req, res) => poserCookie(req, res, '', 0);
function nomAppareil(ua) {
  const u = String(ua || '');
  const sys = /iPad/.test(u) ? 'iPad' : /iPhone/.test(u) ? 'iPhone' : /Android/.test(u) ? 'Android'
    : /Macintosh|Mac OS X/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : /Linux/.test(u) ? 'Linux' : 'Appareil';
  const nav = /Edg\//.test(u) ? 'Edge' : /Firefox\//.test(u) ? 'Firefox' : /Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : '';
  return nav ? `${sys} · ${nav}` : sys;
}
const appareilsActifs = id => db.prepare(`SELECT id, nom, cree_le, vu_le FROM appareil WHERE etudiant_id = ? AND retire_le IS NULL
  AND expire_le > datetime('now') ORDER BY COALESCE(vu_le, cree_le) DESC`).all(id);
const appareilCourant = req => {
  const v = lireCookie(req);
  return v ? db.prepare(`SELECT * FROM appareil WHERE jeton_hash = ? AND retire_le IS NULL AND expire_le > datetime('now')`).get(empreinte(v)) : null;
};
const session = (id, definir = false) => jwt.sign({ scope: 'portail', etudiant_id: id, ...(definir ? { definir: true } : {}) }, SECRET, { expiresIn: definir ? '30m' : '2h' });
const aUnMotDePasse = id => !!db.prepare('SELECT 1 FROM compte WHERE etudiant_id = ?').get(id);

/** Reconnaître l'appareil (après le lien ou le code) : trois au plus ; au quatrième, l'étudiant choisit lequel remplacer. */
function reconnaitre(req, res, etudiantId) {
  if (req.body?.retenir === false || appareilCourant(req)?.etudiant_id === etudiantId) return true;
  const actifs = appareilsActifs(etudiantId);
  const remplacer = Number(req.body?.remplacer) || null;
  if (actifs.length >= MAX_APPAREILS && !actifs.some(a => a.id === remplacer)) {
    res.status(409).json({ choix: true, max: MAX_APPAREILS, appareils: actifs,
      error: `Vous avez déjà ${MAX_APPAREILS} appareils reconnus. Choisissez celui que celui-ci remplace.` });
    return false;
  }
  if (remplacer) db.prepare("UPDATE appareil SET retire_le = datetime('now') WHERE id = ? AND etudiant_id = ?").run(remplacer, etudiantId);
  const valeur = crypto.randomBytes(32).toString('base64url');
  db.prepare(`INSERT INTO appareil (etudiant_id, jeton_hash, nom, vu_le, expire_le, ip) VALUES (?,?,?, datetime('now'), datetime('now', '+${JOURS_APPAREIL} days'), ?)`)
    .run(etudiantId, empreinte(valeur), nomAppareil(req.headers['user-agent']), ipDe(req));
  poserCookie(req, res, valeur, JOURS_APPAREIL * 86400);
  return true;
}

/** L'appareil est-il reconnu ? Il pré-remplit l'adresse : seul l'appareil qui porte le cookie la reçoit. */
pub.get('/api/portail/appareil', (req, res) => {
  const a = appareilCourant(req);
  const e = a && db.prepare('SELECT email_ecole FROM etudiant WHERE id = ?').get(a.etudiant_id);
  res.json(e ? { reconnu: true, identifiant: e.email_ecole } : { reconnu: false });
});
/* Avant 3.1.513, un appareil reconnu entrait sans rien : il demande désormais le mot de passe. */
pub.post('/api/portail/entrer', (req, res) => res.status(410).json({ error: 'Entrez avec votre mot de passe.' }));

/** ENTRER : adresse (ou matricule) + mot de passe ; un appareil non reconnu reçoit en plus un code à l'adresse d'école. */
pub.post('/api/portail/connexion', (req, res) => {
  if (tropDEssais(ipDe(req), 60)) return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans une heure.' });
  const e = trouver(req.body?.identifiant);
  if (!permis(req, e?.id)) return refuserHorsBelgique(res);
  const c = e && db.prepare('SELECT * FROM compte WHERE etudiant_id = ?').get(e.id);
  if (c?.bloque_jusqu_a && c.bloque_jusqu_a > maintenant()) {
    return res.status(429).json({ error: 'Trop d’essais sur ce compte : réessayez dans un quart d’heure, ou demandez un lien (mot de passe oublié).' });
  }
  const bon = verifierMdp(req.body?.mot_de_passe, c?.mdp);   // calculé même sans compte : même durée de réponse
  if (!e || !c || !bon) {
    if (c) db.prepare(`UPDATE compte SET echecs = echecs + 1, bloque_jusqu_a = CASE WHEN echecs + 1 >= 10
      THEN datetime('now', '+15 minutes') END WHERE etudiant_id = ?`).run(e.id);
    if (e && !c) return res.status(401).json({ premiere: true, error: 'Vous n’avez pas encore choisi de mot de passe : demandez votre lien de première visite.' });
    return res.status(401).json({ error: 'Adresse ou mot de passe incorrect.' });
  }
  db.prepare('UPDATE compte SET echecs = 0, bloque_jusqu_a = NULL WHERE etudiant_id = ?').run(e.id);
  const a = appareilCourant(req);
  if (a && a.etudiant_id === e.id) {
    db.prepare(`UPDATE appareil SET vu_le = datetime('now'), expire_le = datetime('now', '+${JOURS_APPAREIL} days'), ip = ? WHERE id = ?`).run(ipDe(req), a.id);
    db.prepare('INSERT INTO entree (etudiant_id, ip) VALUES (?, ?)').run(e.id, ipDe(req));
    poserCookie(req, res, lireCookie(req), JOURS_APPAREIL * 86400);
    return res.json({ token: session(e.id) });
  }
  // UN AUTRE APPAREIL : un code à l'adresse d'école, que Lucie compose et envoie.
  if (db.prepare(`SELECT COUNT(*) n FROM code WHERE etudiant_id = ? AND cree_le > datetime('now', '-1 hour')`).get(e.id).n >= 10) {
    return res.status(429).json({ error: 'Trop de codes demandés. Réessayez dans une heure.' });
  }
  const valeur = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
  db.prepare(`UPDATE code SET utilise_le = datetime('now') WHERE etudiant_id = ? AND objet_type = 'connexion' AND utilise_le IS NULL`).run(e.id);
  db.prepare(`INSERT INTO code (etudiant_id, objet_type, objet_id, code_hash, expire_le) VALUES (?, 'connexion', 0, ?, datetime('now', '+10 minutes'))`)
    .run(e.id, empreinte(`${e.id}:${valeur}`));
  db.prepare(`INSERT INTO demande (type, etudiant_id, valeur) VALUES ('code', ?, ?)`).run(e.id, valeur);
  const defi = jwt.sign({ scope: 'defi', etudiant_id: e.id }, SECRET, { expiresIn: '10m' });
  const [u, dom] = String(e.email_ecole).split('@');
  res.json({ code_requis: true, defi, adresse: `${u.slice(0, 2)}•••@${dom}` });
});

pub.post('/api/portail/connexion/code', (req, res) => {
  if (tropDEssais(ipDe(req), 60)) return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans une heure.' });
  let p; try { p = jwt.verify(String(req.body?.defi || ''), SECRET); } catch { p = null; }
  if (!p || p.scope !== 'defi') return res.status(401).json({ error: 'Délai dépassé : reconnectez-vous.' });
  const e = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(p.etudiant_id);
  if (!e) return res.status(401).json({ error: 'Délai dépassé : reconnectez-vous.' });
  if (!permis(req, e.id)) return refuserHorsBelgique(res);
  const c = db.prepare(`SELECT * FROM code WHERE etudiant_id = ? AND objet_type = 'connexion' AND utilise_le IS NULL ORDER BY id DESC LIMIT 1`).get(e.id);
  if (!c || c.expire_le < maintenant()) return res.status(400).json({ error: 'Ce code a expiré. Reconnectez-vous pour en recevoir un autre.' });
  if (c.essais >= 5) return res.status(429).json({ error: 'Trop d’essais. Reconnectez-vous pour recevoir un nouveau code.' });
  if (!egal(empreinte(`${e.id}:${String(req.body?.code || '').replace(/\D/g, '')}`), c.code_hash)) {
    db.prepare('UPDATE code SET essais = essais + 1 WHERE id = ?').run(c.id);
    return res.status(400).json({ error: 'Code incorrect.' });
  }
  if (!reconnaitre(req, res, e.id)) return;
  db.prepare("UPDATE code SET utilise_le = datetime('now') WHERE id = ?").run(c.id);
  db.prepare('INSERT INTO entree (etudiant_id, ip) VALUES (?, ?)').run(e.id, ipDe(req));
  res.json({ token: session(e.id) });
});

pub.post('/api/portail/lien', (req, res) => {
  const reponse = { ok: true, message: "Si cette adresse ou ce matricule est connu, un lien d'accès part dans la minute vers votre adresse de l'institut. Il est valable 30 minutes et ne sert qu'une fois." };
  if (tropDEssais(ipDe(req))) return res.status(429).json({ error: 'Trop de demandes. Réessayez dans une heure.' });
  const ident = String(req.body?.identifiant || req.body?.matricule || '').trim();
  const m = ident && ident.length <= 120 && (ident.includes('@')
    ? db.prepare('SELECT id AS etudiant_id FROM etudiant WHERE lower(email_ecole) = lower(?)').get(ident)
    : db.prepare('SELECT etudiant_id FROM matricule WHERE code = ?').get(ident));
  if (!permis(req, m?.etudiant_id)) return refuserHorsBelgique(res);
  if (!m) return res.json(reponse);
  const recents = db.prepare(`SELECT COUNT(*) n FROM jeton WHERE etudiant_id = ? AND cree_le > datetime('now', '-1 hour')`).get(m.etudiant_id).n;
  if (recents >= 3) return res.json(reponse);
  const jeton = crypto.randomBytes(32).toString('base64url');
  db.prepare(`INSERT INTO jeton (etudiant_id, jeton_hash, expire_le, ip) VALUES (?,?, datetime('now', '+30 minutes'), ?)`)
    .run(m.etudiant_id, empreinte(jeton), ipDe(req));
  db.prepare(`INSERT INTO demande (type, etudiant_id, valeur) VALUES ('lien', ?, ?)`).run(m.etudiant_id, `${URL_PUBLIQUE}/?jeton=${jeton}`);
  res.json(reponse);
});

pub.post('/api/portail/session', (req, res) => {
  if (tropDEssais(ipDe(req))) return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans une heure.' });
  const jeton = String(req.body?.jeton || '');
  const l = jeton && db.prepare('SELECT * FROM jeton WHERE jeton_hash = ?').get(empreinte(jeton));
  if (!l || l.utilise_le || l.expire_le < maintenant() || !db.prepare('SELECT 1 FROM etudiant WHERE id = ?').get(l.etudiant_id)) {
    return res.status(401).json({ error: 'Ce lien a expiré ou a déjà servi. Demandez-en un nouveau.' });
  }
  if (!permis(req, l.etudiant_id)) return refuserHorsBelgique(res);
  if (!reconnaitre(req, res, l.etudiant_id)) return;
  db.prepare("UPDATE jeton SET utilise_le = datetime('now'), ip = ? WHERE id = ?").run(ipDe(req), l.id);
  // LE LIEN MÈNE À « CHOISIR MON MOT DE PASSE » : première visite, ou mot de passe oublié.
  res.json({ token: session(l.etudiant_id, true), definir: true, a_un_mot_de_passe: aUnMotDePasse(l.etudiant_id) });
});

function connecte(req, res, next) {
  try {
    const p = jwt.verify(String(req.headers.authorization || '').replace(/^Bearer /, ''), SECRET);
    const e = p.scope === 'portail' && db.prepare('SELECT * FROM etudiant WHERE id = ?').get(p.etudiant_id);
    if (!e) throw new Error('inconnu');
    if (!permis(req, e.id)) return refuserHorsBelgique(res);
    // Un jeton venu du lien ne sert qu'à choisir le mot de passe.
    if (p.definir && req.path !== '/api/portail/mot-de-passe') return res.status(403).json({ definir: true, error: 'Choisissez d’abord votre mot de passe.' });
    req.etudiant = e; req.peutDefinir = !!p.definir; next();
  } catch { res.status(401).json({ error: 'Session expirée. Reconnectez-vous.' }); }
}

/** Choisir (après le lien) ou changer (avec l'actuel) son mot de passe. */
pub.post('/api/portail/mot-de-passe', connecte, (req, res) => {
  const e = req.etudiant;
  const c = db.prepare('SELECT * FROM compte WHERE etudiant_id = ?').get(e.id);
  if (!req.peutDefinir && !(c && verifierMdp(req.body?.actuel, c.mdp))) return res.status(400).json({ error: 'Mot de passe actuel incorrect.' });
  const refus = mdpRefuse(req.body?.nouveau, e);
  if (refus) return res.status(400).json({ error: refus });
  db.prepare(`INSERT INTO compte (etudiant_id, mdp) VALUES (?, ?) ON CONFLICT(etudiant_id) DO UPDATE SET mdp = excluded.mdp,
    maj_le = datetime('now'), echecs = 0, bloque_jusqu_a = NULL`).run(e.id, hacher(req.body.nouveau));
  // Un mot de passe REMPLACÉ : les autres appareils devront refaire le code.
  if (c) {
    const courant = appareilCourant(req);
    db.prepare("UPDATE appareil SET retire_le = datetime('now') WHERE etudiant_id = ? AND retire_le IS NULL AND id <> ?").run(e.id, courant?.id || 0);
  }
  if (req.peutDefinir) db.prepare('INSERT INTO entree (etudiant_id, ip) VALUES (?, ?)').run(e.id, ipDe(req));
  res.json({ ok: true, token: session(e.id) });
});

/** Mes appareils : les voir, en oublier un (celui-ci compris). */
pub.get('/api/portail/appareils', connecte, (req, res) => {
  const c = appareilCourant(req);
  res.json({ max: MAX_APPAREILS, jours: JOURS_APPAREIL,
    appareils: appareilsActifs(req.etudiant.id).map(a => ({ ...a, courant: !!c && c.id === a.id })) });
});
pub.post('/api/portail/appareils/:id/oublier', connecte, (req, res) => {
  const id = Number(req.params.id);
  const r = db.prepare("UPDATE appareil SET retire_le = datetime('now') WHERE id = ? AND etudiant_id = ? AND retire_le IS NULL").run(id, req.etudiant.id);
  if (!r.changes) return res.status(404).json({ error: 'Appareil introuvable.' });
  const c = lireCookie(req);
  if (c && db.prepare('SELECT 1 FROM appareil WHERE id = ? AND jeton_hash = ?').get(id, empreinte(c))) oublierCookie(req, res);
  res.json({ ok: true });
});
const accuseDe = (e, type, id) => db.prepare('SELECT presente_le, signe_le FROM accuse WHERE etudiant_id = ? AND objet_type = ? AND objet_id = ?').get(e.id, type, id) || {};

pub.get('/api/portail/moi', connecte, (req, res) => {
  const e = req.etudiant;
  const parAnnee = new Map();
  for (const r of db.prepare('SELECT * FROM resultat WHERE etudiant_id = ? ORDER BY annee DESC, ue_num').all(e.id)) {
    if (!parAnnee.has(r.annee)) parAnnee.set(r.annee, []);
    parAnnee.get(r.annee).push({ ue_num: r.ue_num, ue_nom: r.ue_nom, decision: r.decision, note: /^\d+$/.test(r.note || '') ? Number(r.note) : r.note, etat: r.etat });
  }
  const documents = db.prepare(`SELECT id, sujet, nom_fichier, envoye_le, reference,
      (envoye_le >= datetime('now', '-${JOURS_LIBRES} days')) AS libre,
      date(envoye_le, '+${JOURS_LIBRES} days') AS libre_jusqu_au FROM document WHERE etudiant_id = ? ORDER BY envoye_le DESC, id DESC`)
    .all(e.id).map(d => ({ ...d, libre_jusqu_au: d.libre ? d.libre_jusqu_au : null, libre: !!d.libre || deverrouille(e.id, d.id), ...accuseDe(e, 'envoi', d.id) }));
  const reglements = db.prepare('SELECT * FROM reglement ORDER BY titre').all().map(r => {
    // Signé sur une version dont la signature vaut encore (Lucie en donne la liste : la règle de reconfirmation du personnel).
    const s = db.prepare(`SELECT signe_le FROM accuse WHERE etudiant_id = ? AND objet_type = 'reglement' AND signe_le IS NOT NULL
      AND objet_id IN (SELECT value FROM json_each(?)) ORDER BY signe_le DESC LIMIT 1`).get(e.id, r.valables || JSON.stringify([r.version_id]));
    return { cle: r.cle, titre: r.titre, numero: r.numero, publiee_le: r.publiee_le, version_id: r.version_id,
      signe_le: s?.signe_le || null, presente_le: accuseDe(e, 'reglement', r.version_id).presente_le || null };
  });
  res.json({ etudiant: { nom: e.nom, prenom: e.prenom, email: e.email_ecole,
    matricule: db.prepare('SELECT code FROM matricule WHERE etudiant_id = ? LIMIT 1').get(e.id)?.code || '' },
    resultats: [...parAnnee].map(([annee, ues]) => ({ annee, ues })), documents, reglements });
});

function presenter(e, type, id, req) {
  db.prepare(`INSERT INTO accuse (etudiant_id, objet_type, objet_id, presente_le, ip, agent) VALUES (?,?,?, datetime('now'), ?, ?)
    ON CONFLICT(etudiant_id, objet_type, objet_id) DO UPDATE SET presente_le = COALESCE(accuse.presente_le, excluded.presente_le), releve_le = NULL
    WHERE accuse.signe_le IS NULL AND accuse.presente_le IS NULL`).run(e.id, type, id, ipDe(req), String(req.headers['user-agent'] || '').slice(0, 200));
}

const JOURS_LIBRES = 90;
const deverrouille = (etudiantId, docId) => !!db.prepare(`SELECT 1 FROM deverrou WHERE etudiant_id = ? AND document_id = ? AND jusqu_a > datetime('now')`).get(etudiantId, docId);
const libre = d => !!db.prepare(`SELECT 1 WHERE ? >= datetime('now', '-${JOURS_LIBRES} days')`).get(String(d.envoye_le || ''));

pub.get('/api/portail/documents/:id', connecte, (req, res) => {
  const d = db.prepare('SELECT * FROM document WHERE id = ? AND etudiant_id = ?').get(Number(req.params.id), req.etudiant.id);
  if (!d || !d.contenu) return res.status(404).json({ error: 'Document introuvable.' });
  if (!libre(d) && !deverrouille(req.etudiant.id, d.id)) {
    return res.status(403).json({ code_requis: true, error: `Ce document a plus de ${JOURS_LIBRES} jours : demandez un code pour le télécharger.` });
  }
  presenter(req.etudiant, 'envoi', d.id, req);
  res.setHeader('Content-Type', d.mime || 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${String(d.nom_fichier || 'document').replace(/[^A-Za-z0-9_.-]/g, '_')}"`);
  res.send(d.contenu);
});

pub.get('/api/portail/reglements/:cle', connecte, (req, res) => {
  const r = db.prepare('SELECT * FROM reglement WHERE cle = ? ORDER BY numero DESC LIMIT 1').get(String(req.params.cle));
  if (!r) return res.status(404).json({ error: 'Texte introuvable.' });
  presenter(req.etudiant, 'reglement', r.version_id, req);
  res.json({ titre: r.titre, numero: r.numero, publiee_le: r.publiee_le, contenu: r.contenu, source_url: r.source_url });
});

function objetValide(e, type, id) {
  if (type === 'telechargement') return !!db.prepare('SELECT 1 FROM document WHERE id = ? AND etudiant_id = ?').get(id, e.id);
  if (type === 'envoi') return !!db.prepare('SELECT 1 FROM document WHERE id = ? AND etudiant_id = ?').get(id, e.id);
  if (type === 'reglement') return !!db.prepare('SELECT 1 FROM reglement WHERE version_id = ?').get(id);   // la version en vigueur
  return false;
}

pub.post('/api/portail/code', connecte, (req, res) => {
  const e = req.etudiant;
  const type = String(req.body?.objet_type || ''), id = Number(req.body?.objet_id);
  if (!objetValide(e, type, id)) return res.status(404).json({ error: 'Pièce introuvable.' });
  if (type !== 'telechargement') {
    const a = accuseDe(e, type, id);
    if (!a.presente_le) return res.status(409).json({ error: 'Ouvrez d’abord la pièce : on ne signe que ce qu’on a lu.' });
    if (a.signe_le) return res.status(409).json({ error: 'Déjà signé.' });
  }
  if (db.prepare(`SELECT COUNT(*) n FROM code WHERE etudiant_id = ? AND cree_le > datetime('now', '-1 hour')`).get(e.id).n >= 10) {
    return res.status(429).json({ error: 'Trop de codes demandés. Réessayez dans une heure.' });
  }
  const valeur = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
  db.prepare(`UPDATE code SET utilise_le = datetime('now') WHERE etudiant_id = ? AND objet_type = ? AND objet_id = ? AND utilise_le IS NULL`).run(e.id, type, id);
  db.prepare(`INSERT INTO code (etudiant_id, objet_type, objet_id, code_hash, expire_le) VALUES (?,?,?,?, datetime('now', '+10 minutes'))`)
    .run(e.id, type, id, empreinte(`${e.id}:${valeur}`));
  db.prepare(`INSERT INTO demande (type, etudiant_id, valeur) VALUES ('code', ?, ?)`).run(e.id, valeur);
  res.json({ ok: true, message: `Un code à six chiffres part dans la minute vers ${e.email_ecole}.` });
});

/** Au-delà de 90 jours : le code reçu à l'adresse d'école ouvre le téléchargement de ce document pour une heure. */
pub.post('/api/portail/documents/:id/deverrouiller', connecte, (req, res) => {
  const e = req.etudiant, id = Number(req.params.id);
  const valeur = String(req.body?.code || '').replace(/\D/g, '');
  if (!objetValide(e, 'telechargement', id)) return res.status(404).json({ error: 'Document introuvable.' });
  const c = db.prepare(`SELECT * FROM code WHERE etudiant_id = ? AND objet_type = 'telechargement' AND objet_id = ? AND utilise_le IS NULL ORDER BY id DESC LIMIT 1`).get(e.id, id);
  if (!c || c.expire_le < maintenant()) return res.status(400).json({ error: 'Ce code a expiré. Demandez-en un nouveau.' });
  if (c.essais >= 5) return res.status(429).json({ error: 'Trop d’essais. Demandez un nouveau code.' });
  if (!egal(empreinte(`${e.id}:${valeur}`), c.code_hash)) {
    db.prepare('UPDATE code SET essais = essais + 1 WHERE id = ?').run(c.id);
    return res.status(400).json({ error: 'Code incorrect.' });
  }
  db.prepare("UPDATE code SET utilise_le = datetime('now') WHERE id = ?").run(c.id);
  db.prepare(`INSERT INTO deverrou (etudiant_id, document_id, jusqu_a) VALUES (?,?, datetime('now', '+1 hour'))
    ON CONFLICT(etudiant_id, document_id) DO UPDATE SET jusqu_a = excluded.jusqu_a`).run(e.id, id);
  res.json({ ok: true });
});

pub.post('/api/portail/accuser', connecte, (req, res) => {
  const e = req.etudiant;
  const type = String(req.body?.objet_type || ''), id = Number(req.body?.objet_id);
  const valeur = String(req.body?.code || '').replace(/\D/g, '');
  if (!objetValide(e, type, id)) return res.status(404).json({ error: 'Pièce introuvable.' });
  const c = db.prepare(`SELECT * FROM code WHERE etudiant_id = ? AND objet_type = ? AND objet_id = ? AND utilise_le IS NULL ORDER BY id DESC LIMIT 1`).get(e.id, type, id);
  if (!c || c.expire_le < maintenant()) return res.status(400).json({ error: 'Ce code a expiré. Demandez-en un nouveau.' });
  if (c.essais >= 5) return res.status(429).json({ error: 'Trop d’essais. Demandez un nouveau code.' });
  if (!egal(empreinte(`${e.id}:${valeur}`), c.code_hash)) {
    db.prepare('UPDATE code SET essais = essais + 1 WHERE id = ?').run(c.id);
    return res.status(400).json({ error: 'Code incorrect.' });
  }
  db.prepare("UPDATE code SET utilise_le = datetime('now') WHERE id = ?").run(c.id);
  db.prepare(`UPDATE accuse SET signe_le = datetime('now'), ip = ?, agent = ?, releve_le = NULL
    WHERE etudiant_id = ? AND objet_type = ? AND objet_id = ? AND signe_le IS NULL AND presente_le IS NOT NULL`)
    .run(ipDe(req), String(req.headers['user-agent'] || '').slice(0, 200), e.id, type, id);
  res.json({ ok: true, ...accuseDe(e, type, id) });
});

/* LA VÉRIFICATION D'UNE PIÈCE (3.1.511) — publique, sans compte : qui scanne le QR voit ce que l'Institut a émis sous
   cette référence, pour le comparer au papier qu'il a en main. Une référence inconnue : l'Institut ne l'a jamais émise. */
pub.get('/api/portail/verifier/:ref', (req, res) => {
  if (tropDEssais(ipDe(req), 120)) return res.status(429).json({ error: 'Trop de vérifications. Réessayez dans une heure.' });
  const ref = String(req.params.ref || '').trim().toUpperCase();
  if (!/^[A-Z0-9-]{6,40}$/.test(ref)) return res.json({ trouve: false });
  const p = db.prepare('SELECT reference, nature, objet, personne, emise_le FROM authentique WHERE reference = ?').get(ref);
  res.json(p ? { trouve: true, ...p, etablissement: 'Institut Ilya Prigogine' } : { trouve: false, reference: ref });
});

pub.use((req, res) => res.status(404).json({ error: 'Introuvable.' }));

// ══ LE CÔTÉ INTERNE — Lucie seule, par le réseau Docker ════════════════════
const int = express();
int.disable('x-powered-by');
int.use(express.json({ limit: '60mb' }));
int.use((req, res, next) => {
  if (!egal(String(req.get('X-Portail-Jeton') || ''), JETON_INTERNE)) return res.status(404).end();
  next();
});

/* LE DÉPÔT EST UN REMPLACEMENT : ce que Lucie ne montre plus disparaît (un étudiant archivé, un résultat retiré). */
int.post('/interne/etudiants', (req, res) => {
  const l = Array.isArray(req.body?.etudiants) ? req.body.etudiants : [];
  db.transaction(() => {
    db.exec('DELETE FROM matricule; DELETE FROM etudiant;');
    const ie = db.prepare("INSERT INTO etudiant (id, nom, prenom, email_ecole, maj_le) VALUES (?,?,?,?, datetime('now'))");
    const im = db.prepare('INSERT OR IGNORE INTO matricule (code, etudiant_id) VALUES (?,?)');
    for (const e of l) {
      if (!Number(e.id) || !String(e.email_ecole || '').includes('@')) continue;
      ie.run(Number(e.id), String(e.nom || ''), String(e.prenom || ''), String(e.email_ecole));
      for (const m of e.matricules || []) if (m) im.run(String(m).trim(), Number(e.id));
    }
  })();
  res.json({ ok: true, n: l.length });
});

int.post('/interne/resultats', (req, res) => {
  const l = Array.isArray(req.body?.resultats) ? req.body.resultats : [];
  db.transaction(() => {
    db.exec('DELETE FROM resultat');
    const i = db.prepare('INSERT INTO resultat (etudiant_id, annee, ue_num, ue_nom, decision, note, etat) VALUES (?,?,?,?,?,?,?)');
    for (const r of l) i.run(Number(r.etudiant_id), String(r.annee), Number(r.ue_num) || null, String(r.ue_nom || ''), String(r.decision || ''), String(r.note ?? ''), String(r.etat || ''));
  })();
  res.json({ ok: true, n: l.length });
});

int.post('/interne/reglements', (req, res) => {
  const l = Array.isArray(req.body?.reglements) ? req.body.reglements : [];
  db.transaction(() => {
    db.exec('DELETE FROM reglement');
    const i = db.prepare(`INSERT INTO reglement (version_id, cle, titre, numero, publiee_le, contenu, source_url, valables)
      VALUES (?,?,?,?,?,?,?,?)`);
    for (const r of l) i.run(Number(r.version_id), String(r.cle), String(r.titre || ''), Number(r.numero), String(r.publiee_le || ''),
      String(r.contenu || ''), r.source_url || null, JSON.stringify((r.valables || [r.version_id]).map(Number)));
  })();
  res.json({ ok: true, n: l.length });
});

int.post('/interne/authentiques', (req, res) => {
  const l = Array.isArray(req.body?.pieces) ? req.body.pieces : [];
  const i = db.prepare('INSERT OR IGNORE INTO authentique (reference, nature, objet, personne, emise_le) VALUES (?,?,?,?,?)');
  db.transaction(() => { for (const x of l) if (x?.reference) i.run(String(x.reference).toUpperCase(), String(x.nature || ''),
    x.objet ? String(x.objet) : null, x.personne ? String(x.personne) : null, String(x.emise_le || '')); })();
  res.json({ ok: true, n: l.length });
});

int.post('/interne/exceptions', (req, res) => {
  const l = Array.isArray(req.body?.exceptions) ? req.body.exceptions : [];
  db.transaction(() => {
    db.exec('DELETE FROM exception');
    const i = db.prepare('INSERT OR REPLACE INTO exception (etudiant_id, jusqu_au) VALUES (?,?)');
    for (const x of l) if (Number(x.etudiant_id) && /^\d{4}-\d{2}-\d{2}$/.test(String(x.jusqu_au || ''))) i.run(Number(x.etudiant_id), String(x.jusqu_au));
  })();
  res.json({ ok: true, n: l.length });
});

int.get('/interne/documents/connus', (req, res) => res.json({ ids: db.prepare('SELECT id FROM document').all().map(x => x.id) }));
int.post('/interne/documents', (req, res) => {
  const l = Array.isArray(req.body?.documents) ? req.body.documents : [];
  const i = db.prepare(`INSERT OR REPLACE INTO document (id, etudiant_id, sujet, nom_fichier, envoye_le, reference, mime, contenu) VALUES (?,?,?,?,?,?,?,?)`);
  db.transaction(() => { for (const d of l) i.run(Number(d.id), Number(d.etudiant_id), String(d.sujet || ''), String(d.nom_fichier || ''),
    String(d.envoye_le || ''), String(d.reference || ''), String(d.mime || 'application/pdf'), Buffer.from(String(d.contenu_b64 || ''), 'base64')); })();
  res.json({ ok: true, n: l.length });
});
int.post('/interne/documents/retirer', (req, res) => {
  const ids = (req.body?.ids || []).map(Number).filter(Boolean);
  for (const id of ids) db.prepare('DELETE FROM document WHERE id = ?').run(id);
  res.json({ ok: true });
});

int.get('/interne/releve', (req, res) => {
  res.json({
    demandes: db.prepare('SELECT id, type, etudiant_id, valeur, cree_le FROM demande WHERE releve_le IS NULL ORDER BY id LIMIT 200').all(),
    accuses: db.prepare('SELECT id, etudiant_id, objet_type, objet_id, presente_le, signe_le, ip, agent FROM accuse WHERE releve_le IS NULL LIMIT 500').all(),
    connexions: db.prepare('SELECT id, etudiant_id, utilise_le, ip FROM jeton WHERE utilise_le IS NOT NULL AND releve_le IS NULL LIMIT 500').all(),
    // Les entrées depuis un appareil reconnu : des connexions aussi, que la fiche doit voir.
    entrees: db.prepare('SELECT id, etudiant_id, le AS utilise_le, ip FROM entree WHERE releve_le IS NULL LIMIT 500').all(),
  });
});
int.post('/interne/acquitter', (req, res) => {
  const ids = k => (req.body?.[k] || []).map(Number).filter(Boolean);
  db.transaction(() => {
    // Une fois relevée, la valeur (lien, code) n'a plus à vivre ici.
    for (const id of ids('demandes')) db.prepare("UPDATE demande SET releve_le = datetime('now'), valeur = NULL WHERE id = ?").run(id);
    for (const id of ids('accuses')) db.prepare("UPDATE accuse SET releve_le = datetime('now') WHERE id = ?").run(id);
    for (const id of ids('connexions')) db.prepare("UPDATE jeton SET releve_le = datetime('now') WHERE id = ?").run(id);
    for (const id of ids('entrees')) db.prepare("UPDATE entree SET releve_le = datetime('now') WHERE id = ?").run(id);
  })();
  res.json({ ok: true });
});
int.use((req, res) => res.status(404).end());

pub.listen(PORT_PUBLIC, () => console.log(`[portail] public ${PORT_PUBLIC}`));
int.listen(PORT_INTERNE, () => console.log(`[portail] interne ${PORT_INTERNE} (réseau Docker seul)`));
