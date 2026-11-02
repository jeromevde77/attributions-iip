// ─────────────────────────────────────────────────────────────────────────────
// L'ESPACE ENSEIGNANT — DE L'AUTRE CÔTÉ DU MUR (3.5.076, Charles, 2 novembre 2026 : « pour les profs, il faut penser les
// menus autrement… ou leur prévoir comme pour étudiant un module à part » ; tranché : un site à part derrière le mur, dans
// le portail existant, à son adresse — enseignants.lucie-iip.be ; mot de passe propre + code sur un nouvel appareil ;
// étape 1 = l'entrée, Ma journée, les présences et l'horaire).
//
// Les mêmes règles que l'espace de l'étudiant, sur des tables à part (`ens_*`) : un enseignant n'est jamais un
// étudiant, et rien ne se mêle. Lucie DÉPOSE ses séances (30 jours derrière, 3 semaines devant), leurs inscrits et les
// présences déjà prises ; elle RELÈVE les demandes (lien, code) et les présences qu'il encode — qu'elle juge et écrit
// par sa seule porte (`ecrirePresences`). Ici, rien ne s'écrit dans Lucie : on note un geste, Lucie le reprend.
// ─────────────────────────────────────────────────────────────────────────────
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const COOKIE = 'ens_appareil';
const MAX_APPAREILS = 3;
const JOURS_APPAREIL = 90;
const STATUTS = ['present', 'absent', 'justifie', 'non_concerne'];

export function monterEnseignants(pub, int, o) {
  const { db, SECRET, empreinte, maintenant, egal, tropDEssais, ipDe, hacher, verifierMdp, mdpRefuse, autorise, nomAppareil } = o;
  const URL_ENS = (process.env.ENSEIGNANTS_URL_PUBLIQUE || 'https://enseignants.lucie-iip.be').replace(/\/$/, '');

  db.exec(`
    CREATE TABLE IF NOT EXISTS ens (id INTEGER PRIMARY KEY, nom TEXT, prenom TEXT, email TEXT NOT NULL, maj_le TEXT);
    CREATE TABLE IF NOT EXISTS ens_compte (ens_id INTEGER PRIMARY KEY, mdp TEXT NOT NULL, maj_le TEXT NOT NULL DEFAULT (datetime('now')),
      echecs INTEGER NOT NULL DEFAULT 0, bloque_jusqu_a TEXT);
    CREATE TABLE IF NOT EXISTS ens_jeton (id INTEGER PRIMARY KEY AUTOINCREMENT, ens_id INTEGER NOT NULL, jeton_hash TEXT NOT NULL UNIQUE,
      cree_le TEXT NOT NULL DEFAULT (datetime('now')), expire_le TEXT NOT NULL, utilise_le TEXT, ip TEXT);
    CREATE TABLE IF NOT EXISTS ens_code (id INTEGER PRIMARY KEY AUTOINCREMENT, ens_id INTEGER NOT NULL, code_hash TEXT NOT NULL,
      cree_le TEXT NOT NULL DEFAULT (datetime('now')), expire_le TEXT NOT NULL, essais INTEGER NOT NULL DEFAULT 0, utilise_le TEXT);
    CREATE TABLE IF NOT EXISTS ens_demande (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL CHECK (type IN ('lien','code')),
      ens_id INTEGER NOT NULL, valeur TEXT, cree_le TEXT NOT NULL DEFAULT (datetime('now')), releve_le TEXT);
    CREATE TABLE IF NOT EXISTS ens_appareil (id INTEGER PRIMARY KEY AUTOINCREMENT, ens_id INTEGER NOT NULL, jeton_hash TEXT NOT NULL UNIQUE,
      nom TEXT, cree_le TEXT NOT NULL DEFAULT (datetime('now')), vu_le TEXT, expire_le TEXT NOT NULL, retire_le TEXT, ip TEXT);
    CREATE TABLE IF NOT EXISTS ens_entree (id INTEGER PRIMARY KEY AUTOINCREMENT, ens_id INTEGER NOT NULL, le TEXT NOT NULL DEFAULT (datetime('now')),
      ip TEXT, releve_le TEXT);
    CREATE TABLE IF NOT EXISTS ens_seance (id INTEGER PRIMARY KEY, ens_id INTEGER NOT NULL, date TEXT NOT NULL, heure_debut TEXT, heure_fin TEXT,
      cours_code TEXT, cours_nom TEXT, ue_num INTEGER, matiere TEXT, local TEXT, annule INTEGER NOT NULL DEFAULT 0, visite INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS idx_ens_seance ON ens_seance(ens_id, date);
    CREATE TABLE IF NOT EXISTS ens_inscrit (seance_id INTEGER NOT NULL, etudiant_id INTEGER NOT NULL, PRIMARY KEY (seance_id, etudiant_id));
    CREATE TABLE IF NOT EXISTS ens_etudiant (id INTEGER PRIMARY KEY, nom TEXT, prenom TEXT, groupe TEXT);
    CREATE TABLE IF NOT EXISTS ens_presence (seance_id INTEGER NOT NULL, etudiant_id INTEGER NOT NULL, statut TEXT, retard INTEGER NOT NULL DEFAULT 0,
      motif TEXT, PRIMARY KEY (seance_id, etudiant_id));
    CREATE TABLE IF NOT EXISTS ens_attente (ens_id INTEGER PRIMARY KEY, contenu TEXT);
    CREATE TABLE IF NOT EXISTS ens_reglage (cle TEXT PRIMARY KEY, valeur TEXT);
    CREATE TABLE IF NOT EXISTS ens_apercu_jeton (jeton_hash TEXT PRIMARY KEY, ens_id INTEGER NOT NULL, par TEXT,
      expire_le TEXT NOT NULL, utilise_le TEXT);
    CREATE TABLE IF NOT EXISTS ens_geste (id INTEGER PRIMARY KEY AUTOINCREMENT, ens_id INTEGER NOT NULL, type TEXT NOT NULL,
      seance_id INTEGER, contenu TEXT, cree_le TEXT NOT NULL DEFAULT (datetime('now')), releve_le TEXT, erreur TEXT);
  `);

  // L'APERÇU DE LA DIRECTION (3.5.084) : un professeur déposé pour le seul aperçu n'existe pour aucune porte de l'espace.
  try { db.exec('ALTER TABLE ens ADD COLUMN apercu_seul INTEGER NOT NULL DEFAULT 0'); } catch { /* déjà là */ }
  const HORS = "Votre espace ne s'ouvre que depuis la Belgique, et pas au travers d'un VPN.";
  const permis = req => autorise(ipDe(req), false);
  const refuserHors = res => res.status(403).json({ hors_belgique: true, error: HORS });
  const trouver = ident => { const i = String(ident || '').trim(); return i && i.length <= 120 && i.includes('@')
    ? db.prepare('SELECT * FROM ens WHERE lower(email) = lower(?) AND COALESCE(apercu_seul, 0) = 0').get(i) : null; };
  const session = (id, definir = false) => jwt.sign({ scope: 'enseignant', ens_id: id, ...(definir ? { definir: true } : {}) }, SECRET,
    { expiresIn: definir ? '30m' : '8h' });

  // ── L'appareil reconnu (son propre cookie, sur son propre chemin) ──
  const lireCookie = req => { for (const p of String(req.headers.cookie || '').split(';')) { const [k, ...v] = p.trim().split('='); if (k === COOKIE) return decodeURIComponent(v.join('=')); } return ''; };
  const sur = req => URL_ENS.startsWith('https://') && !/^(localhost|127\.)/.test(req.hostname || '');
  const poserCookie = (req, res, valeur, secondes) => res.append('Set-Cookie',
    `${COOKIE}=${encodeURIComponent(valeur)}; Path=/api/enseignant; HttpOnly; SameSite=Strict; Max-Age=${secondes}${sur(req) ? '; Secure' : ''}`);
  const actifs = id => db.prepare(`SELECT id, nom, cree_le, vu_le FROM ens_appareil WHERE ens_id = ? AND retire_le IS NULL
    AND expire_le > datetime('now') ORDER BY COALESCE(vu_le, cree_le) DESC`).all(id);
  const courant = req => { const v = lireCookie(req); return v ? db.prepare(`SELECT * FROM ens_appareil WHERE jeton_hash = ? AND retire_le IS NULL AND expire_le > datetime('now')`).get(empreinte(v)) : null; };
  function reconnaitre(req, res, id) {
    if (req.body?.retenir === false || courant(req)?.ens_id === id) return true;
    const a = actifs(id); const remplacer = Number(req.body?.remplacer) || null;
    if (a.length >= MAX_APPAREILS && !a.some(x => x.id === remplacer)) {
      res.status(409).json({ choix: true, max: MAX_APPAREILS, appareils: a, error: `Vous avez déjà ${MAX_APPAREILS} appareils reconnus. Choisissez celui que celui-ci remplace.` });
      return false;
    }
    if (remplacer) db.prepare("UPDATE ens_appareil SET retire_le = datetime('now') WHERE id = ? AND ens_id = ?").run(remplacer, id);
    const valeur = crypto.randomBytes(32).toString('base64url');
    db.prepare(`INSERT INTO ens_appareil (ens_id, jeton_hash, nom, vu_le, expire_le, ip) VALUES (?,?,?, datetime('now'), datetime('now', '+${JOURS_APPAREIL} days'), ?)`)
      .run(id, empreinte(valeur), nomAppareil(req.headers['user-agent']), ipDe(req));
    poserCookie(req, res, valeur, JOURS_APPAREIL * 86400);
    return true;
  }

  function connecte(req, res, next) {
    try {
      const p = jwt.verify(String(req.headers.authorization || '').replace(/^Bearer /, ''), SECRET);
      const e = p.scope === 'enseignant' && db.prepare('SELECT * FROM ens WHERE id = ?').get(p.ens_id);
      if (!e) throw new Error('inconnu');
      // L'aperçu de la direction : lecture seule, d'où qu'il vienne ; rien ne s'écrit.
      if (p.apercu) {
        if (req.method !== 'GET') return res.status(403).json({ error: 'Aperçu de la direction : lecture seule, rien ne s’enregistre.' });
        req.ens = e; req.apercu = { par: p.par || '' }; return next();
      }
      if (e.apercu_seul) throw new Error('aperçu seul');
      if (!permis(req)) return refuserHors(res);
      if (p.definir && req.path !== '/api/enseignant/mot-de-passe') return res.status(403).json({ definir: true, error: 'Choisissez d’abord votre mot de passe.' });
      req.ens = e; req.peutDefinir = !!p.definir; next();
    } catch { res.status(401).json({ error: 'Session expirée. Reconnectez-vous.' }); }
  }

  // ── L'ENTRÉE ──
  pub.get('/api/enseignant/appareil', (req, res) => {
    const a = courant(req); const e = a && db.prepare('SELECT email FROM ens WHERE id = ?').get(a.ens_id);
    res.json(e ? { reconnu: true, identifiant: e.email } : { reconnu: false });
  });
  pub.post('/api/enseignant/lien', (req, res) => {
    const reponse = { ok: true, message: "Si cette adresse est connue, un lien part dans la minute vers votre adresse de l'institut. Il vaut 30 minutes et ne sert qu'une fois." };
    if (tropDEssais(ipDe(req))) return res.status(429).json({ error: 'Trop de demandes. Réessayez dans une heure.' });
    if (!permis(req)) return refuserHors(res);
    const e = trouver(req.body?.identifiant);
    if (!e) return res.json(reponse);
    if (db.prepare(`SELECT COUNT(*) n FROM ens_jeton WHERE ens_id = ? AND cree_le > datetime('now', '-1 hour')`).get(e.id).n >= 3) return res.json(reponse);
    const jeton = crypto.randomBytes(32).toString('base64url');
    db.prepare(`INSERT INTO ens_jeton (ens_id, jeton_hash, expire_le, ip) VALUES (?,?, datetime('now', '+30 minutes'), ?)`).run(e.id, empreinte(jeton), ipDe(req));
    db.prepare(`INSERT INTO ens_demande (type, ens_id, valeur) VALUES ('lien', ?, ?)`).run(e.id, `${URL_ENS}/?jeton=${jeton}`);
    res.json(reponse);
  });
  pub.post('/api/enseignant/session', (req, res) => {
    if (tropDEssais(ipDe(req))) return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans une heure.' });
    const l = db.prepare('SELECT * FROM ens_jeton WHERE jeton_hash = ?').get(empreinte(String(req.body?.jeton || '')));
    if (!l || l.utilise_le || l.expire_le < maintenant() || !db.prepare('SELECT 1 FROM ens WHERE id = ?').get(l.ens_id)) {
      return res.status(401).json({ error: 'Ce lien a expiré ou a déjà servi. Demandez-en un nouveau.' });
    }
    if (!permis(req)) return refuserHors(res);
    if (!reconnaitre(req, res, l.ens_id)) return;
    db.prepare("UPDATE ens_jeton SET utilise_le = datetime('now'), ip = ? WHERE id = ?").run(ipDe(req), l.id);
    res.json({ token: session(l.ens_id, true), definir: true });
  });
  pub.post('/api/enseignant/connexion', (req, res) => {
    if (tropDEssais(ipDe(req), 60)) return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans une heure.' });
    if (!permis(req)) return refuserHors(res);
    const e = trouver(req.body?.identifiant);
    const c = e && db.prepare('SELECT * FROM ens_compte WHERE ens_id = ?').get(e.id);
    if (c?.bloque_jusqu_a && c.bloque_jusqu_a > maintenant()) return res.status(429).json({ error: 'Trop d’essais : réessayez dans un quart d’heure, ou demandez un lien.' });
    const bon = verifierMdp(req.body?.mot_de_passe, c?.mdp);
    if (!e || !c || !bon) {
      if (c) db.prepare(`UPDATE ens_compte SET echecs = echecs + 1, bloque_jusqu_a = CASE WHEN echecs + 1 >= 10 THEN datetime('now', '+15 minutes') END WHERE ens_id = ?`).run(e.id);
      if (e && !c) return res.status(401).json({ premiere: true, error: 'Vous n’avez pas encore choisi de mot de passe : demandez votre lien de première visite.' });
      return res.status(401).json({ error: 'Adresse ou mot de passe incorrect.' });
    }
    db.prepare('UPDATE ens_compte SET echecs = 0, bloque_jusqu_a = NULL WHERE ens_id = ?').run(e.id);
    const a = courant(req);
    if (a && a.ens_id === e.id) {
      db.prepare(`UPDATE ens_appareil SET vu_le = datetime('now'), expire_le = datetime('now', '+${JOURS_APPAREIL} days'), ip = ? WHERE id = ?`).run(ipDe(req), a.id);
      db.prepare('INSERT INTO ens_entree (ens_id, ip) VALUES (?, ?)').run(e.id, ipDe(req));
      poserCookie(req, res, lireCookie(req), JOURS_APPAREIL * 86400);
      return res.json({ token: session(e.id) });
    }
    if (db.prepare(`SELECT COUNT(*) n FROM ens_code WHERE ens_id = ? AND cree_le > datetime('now', '-1 hour')`).get(e.id).n >= 10) {
      return res.status(429).json({ error: 'Trop de codes demandés. Réessayez dans une heure.' });
    }
    const valeur = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
    db.prepare(`UPDATE ens_code SET utilise_le = datetime('now') WHERE ens_id = ? AND utilise_le IS NULL`).run(e.id);
    db.prepare(`INSERT INTO ens_code (ens_id, code_hash, expire_le) VALUES (?, ?, datetime('now', '+10 minutes'))`).run(e.id, empreinte(`${e.id}:${valeur}`));
    db.prepare(`INSERT INTO ens_demande (type, ens_id, valeur) VALUES ('code', ?, ?)`).run(e.id, valeur);
    const [u, dom] = String(e.email).split('@');
    res.json({ code_requis: true, defi: jwt.sign({ scope: 'ens_defi', ens_id: e.id }, SECRET, { expiresIn: '10m' }), adresse: `${u.slice(0, 2)}•••@${dom}` });
  });
  pub.post('/api/enseignant/connexion/code', (req, res) => {
    if (tropDEssais(ipDe(req), 60)) return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans une heure.' });
    let p; try { p = jwt.verify(String(req.body?.defi || ''), SECRET); } catch { p = null; }
    const e = p?.scope === 'ens_defi' && db.prepare('SELECT * FROM ens WHERE id = ?').get(p.ens_id);
    if (!e) return res.status(401).json({ error: 'Délai dépassé : reconnectez-vous.' });
    if (!permis(req)) return refuserHors(res);
    const c = db.prepare(`SELECT * FROM ens_code WHERE ens_id = ? AND utilise_le IS NULL ORDER BY id DESC LIMIT 1`).get(e.id);
    if (!c || c.expire_le < maintenant()) return res.status(400).json({ error: 'Ce code a expiré. Reconnectez-vous pour en recevoir un autre.' });
    if (c.essais >= 5) return res.status(429).json({ error: 'Trop d’essais. Reconnectez-vous pour recevoir un nouveau code.' });
    if (!egal(empreinte(`${e.id}:${String(req.body?.code || '').replace(/\D/g, '')}`), c.code_hash)) {
      db.prepare('UPDATE ens_code SET essais = essais + 1 WHERE id = ?').run(c.id);
      return res.status(400).json({ error: 'Code incorrect.' });
    }
    if (!reconnaitre(req, res, e.id)) return;
    db.prepare("UPDATE ens_code SET utilise_le = datetime('now') WHERE id = ?").run(c.id);
    db.prepare('INSERT INTO ens_entree (ens_id, ip) VALUES (?, ?)').run(e.id, ipDe(req));
    res.json({ token: session(e.id) });
  });
  pub.post('/api/enseignant/mot-de-passe', connecte, (req, res) => {
    const e = req.ens;
    const c = db.prepare('SELECT * FROM ens_compte WHERE ens_id = ?').get(e.id);
    if (!req.peutDefinir && !(c && verifierMdp(req.body?.actuel, c.mdp))) return res.status(400).json({ error: 'Mot de passe actuel incorrect.' });
    const refus = mdpRefuse(req.body?.nouveau, { nom: e.nom, prenom: e.prenom, email_ecole: e.email });
    if (refus) return res.status(400).json({ error: refus });
    db.prepare(`INSERT INTO ens_compte (ens_id, mdp) VALUES (?, ?) ON CONFLICT(ens_id) DO UPDATE SET mdp = excluded.mdp,
      maj_le = datetime('now'), echecs = 0, bloque_jusqu_a = NULL`).run(e.id, hacher(req.body.nouveau));
    if (c) { const a = courant(req); db.prepare("UPDATE ens_appareil SET retire_le = datetime('now') WHERE ens_id = ? AND retire_le IS NULL AND id <> ?").run(e.id, a?.id || 0); }
    if (req.peutDefinir) db.prepare('INSERT INTO ens_entree (ens_id, ip) VALUES (?, ?)').run(e.id, ipDe(req));
    res.json({ ok: true, token: session(e.id) });
  });
  pub.get('/api/enseignant/appareils', connecte, (req, res) => {
    const c = courant(req);
    res.json({ max: MAX_APPAREILS, appareils: actifs(req.ens.id).map(a => ({ ...a, courant: !!c && c.id === a.id })) });
  });
  pub.post('/api/enseignant/appareils/:id/oublier', connecte, (req, res) => {
    const r = db.prepare("UPDATE ens_appareil SET retire_le = datetime('now') WHERE id = ? AND ens_id = ? AND retire_le IS NULL").run(Number(req.params.id), req.ens.id);
    if (!r.changes) return res.status(404).json({ error: 'Appareil introuvable.' });
    res.json({ ok: true });
  });

  // ── CE QU'IL VOIT ──
  const aujourdhui = () => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Brussels' }).format(new Date());
  const enAttente = id => db.prepare('SELECT COUNT(*) n FROM ens_geste WHERE ens_id = ? AND releve_le IS NULL').get(id).n;
  const etatPresences = s => {
    const attendus = db.prepare('SELECT COUNT(*) n FROM ens_inscrit WHERE seance_id = ?').get(s.id).n;
    const prises = db.prepare('SELECT COUNT(*) n FROM ens_presence WHERE seance_id = ? AND statut IS NOT NULL').get(s.id).n;
    return { attendus, prises };
  };
  pub.get('/api/enseignant/moi', connecte, (req, res) => {
    const e = req.ens;
    let attente = []; try { attente = JSON.parse(db.prepare('SELECT contenu FROM ens_attente WHERE ens_id = ?').get(e.id)?.contenu || '[]'); } catch { attente = []; }
    let motifs = []; try { motifs = JSON.parse(db.prepare("SELECT valeur FROM ens_reglage WHERE cle = 'motifs'").get()?.valeur || '[]'); } catch { motifs = []; }
    res.json({ id: e.id, nom: e.nom, prenom: e.prenom, email: e.email, aujourdhui: aujourdhui(), apercu: req.apercu || null, attente, en_route: enAttente(e.id), motifs,
      depose_le: db.prepare("SELECT valeur FROM ens_reglage WHERE cle = 'depose_le'").get()?.valeur || null });
  });
  pub.get('/api/enseignant/journee', connecte, (req, res) => {
    const jour = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || '')) ? String(req.query.date) : aujourdhui();
    const l = db.prepare('SELECT * FROM ens_seance WHERE ens_id = ? AND date = ? ORDER BY heure_debut').all(req.ens.id, jour)
      .map(s => ({ ...s, annule: !!s.annule, visite: !!s.visite, presences: s.visite ? null : etatPresences(s) }));
    // Les séances passées dont les présences manquent (30 jours) : ce qu'il a encore à faire.
    const manquantes = db.prepare(`SELECT s.* FROM ens_seance s WHERE s.ens_id = ? AND s.date < ? AND s.annule = 0 AND s.visite = 0
      AND EXISTS (SELECT 1 FROM ens_inscrit i WHERE i.seance_id = s.id)
      AND NOT EXISTS (SELECT 1 FROM ens_presence p WHERE p.seance_id = s.id AND p.statut IS NOT NULL) ORDER BY s.date DESC, s.heure_debut`).all(req.ens.id, aujourdhui());
    res.json({ jour, aujourdhui: aujourdhui(), seances: l, sans_presences: manquantes });
  });
  pub.get('/api/enseignant/semaine', connecte, (req, res) => {
    const ref = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || '')) ? String(req.query.date) : aujourdhui();
    const d0 = new Date(`${ref}T12:00:00Z`); const lundi = new Date(d0); lundi.setUTCDate(d0.getUTCDate() - ((d0.getUTCDay() + 6) % 7));
    const jours = Array.from({ length: 7 }, (_, i) => { const x = new Date(lundi); x.setUTCDate(lundi.getUTCDate() + i); return x.toISOString().slice(0, 10); });
    res.json({ jours, aujourdhui: aujourdhui(),
      seances: db.prepare('SELECT * FROM ens_seance WHERE ens_id = ? AND date BETWEEN ? AND ? ORDER BY date, heure_debut').all(req.ens.id, jours[0], jours[6])
        .map(s => ({ ...s, annule: !!s.annule, visite: !!s.visite })) });
  });
  const maSeance = (req, res) => {
    const s = db.prepare('SELECT * FROM ens_seance WHERE id = ? AND ens_id = ? AND visite = 0').get(Number(req.params.id), req.ens.id);
    if (!s) { res.status(404).json({ error: 'Séance introuvable dans vos séances.' }); return null; }
    return s;
  };
  pub.get('/api/enseignant/seance/:id', connecte, (req, res) => {
    const s = maSeance(req, res); if (!s) return;
    const etudiants = db.prepare(`SELECT e.id, e.nom, e.prenom, e.groupe, p.statut, p.retard, p.motif FROM ens_inscrit i
      JOIN ens_etudiant e ON e.id = i.etudiant_id LEFT JOIN ens_presence p ON p.seance_id = i.seance_id AND p.etudiant_id = e.id
      WHERE i.seance_id = ? ORDER BY e.nom, e.prenom`).all(s.id).map(x => ({ ...x, retard: !!x.retard }));
    const enRoute = db.prepare(`SELECT id, cree_le, erreur, releve_le FROM ens_geste WHERE ens_id = ? AND seance_id = ? ORDER BY id DESC LIMIT 1`).get(req.ens.id, s.id) || null;
    res.json({ seance: { ...s, annule: !!s.annule }, etudiants, aujourdhui: aujourdhui(), dernier_envoi: enRoute });
  });
  /** Les présences d'une séance : notées ici, reprises par Lucie au relevé suivant (dix secondes). */
  pub.post('/api/enseignant/seance/:id/presences', connecte, (req, res) => {
    const s = maSeance(req, res); if (!s) return;
    if (s.annule) return res.status(409).json({ error: 'Séance annulée : il n’y a pas de présence à prendre.' });
    if (s.date > aujourdhui()) return res.status(409).json({ error: 'Cette séance n’a pas encore eu lieu.' });
    const inscrits = new Set(db.prepare('SELECT etudiant_id FROM ens_inscrit WHERE seance_id = ?').all(s.id).map(x => x.etudiant_id));
    const lignes = (Array.isArray(req.body?.presences) ? req.body.presences : []).slice(0, 400).map(p => ({
      etudiant_id: Number(p.etudiant_id), statut: STATUTS.includes(p.statut) ? p.statut : null,
      retard: p.statut === 'present' && !!p.retard, motif: p.statut === 'justifie' ? String(p.motif || '').slice(0, 30) : null }))
      .filter(l => inscrits.has(l.etudiant_id));
    if (!lignes.length) return res.status(400).json({ error: 'Aucune présence à enregistrer.' });
    db.transaction(() => {
      db.prepare('INSERT INTO ens_geste (ens_id, type, seance_id, contenu) VALUES (?,?,?,?)').run(req.ens.id, 'presences', s.id, JSON.stringify(lignes));
      // Montré aussitôt comme pris ; Lucie confirme (ou refuse) au relevé.
      const up = db.prepare(`INSERT INTO ens_presence (seance_id, etudiant_id, statut, retard, motif) VALUES (?,?,?,?,?)
        ON CONFLICT(seance_id, etudiant_id) DO UPDATE SET statut = excluded.statut, retard = excluded.retard, motif = excluded.motif`);
      for (const l of lignes) up.run(s.id, l.etudiant_id, l.statut, l.retard ? 1 : 0, l.motif);
    })();
    res.json({ ok: true, n: lignes.length });
  });

  pub.post('/api/enseignant/apercu', (req, res) => {
    const j = db.prepare('SELECT * FROM ens_apercu_jeton WHERE jeton_hash = ?').get(empreinte(String(req.body?.jeton || '')));
    if (!j || j.utilise_le || j.expire_le < maintenant()) return res.status(400).json({ error: 'Lien d’aperçu expiré : rouvrez-le depuis la fiche dans Lucie.' });
    if (!db.prepare('SELECT 1 FROM ens WHERE id = ?').get(j.ens_id)) return res.status(404).json({ error: 'Cet espace n’existe plus.' });
    db.prepare("UPDATE ens_apercu_jeton SET utilise_le = datetime('now') WHERE jeton_hash = ?").run(j.jeton_hash);
    res.json({ token: jwt.sign({ scope: 'enseignant', ens_id: j.ens_id, apercu: true, par: j.par }, SECRET, { expiresIn: '30m' }) });
  });

  // ══ LE PORT INTERNE : Lucie dépose et relève ══
  int.post('/interne/ens/apercu', (req, res) => {
    const id = Number(req.body?.ens_id);
    if (!db.prepare('SELECT 1 FROM ens WHERE id = ?').get(id)) return res.status(404).json({ error: 'Cet enseignant n’a pas d’espace.' });
    const jeton = crypto.randomBytes(32).toString('base64url');
    db.prepare("DELETE FROM ens_apercu_jeton WHERE expire_le < datetime('now', '-1 day')").run();
    db.prepare("INSERT INTO ens_apercu_jeton (jeton_hash, ens_id, par, expire_le) VALUES (?,?,?, datetime('now', '+1 minute'))")
      .run(empreinte(jeton), id, String(req.body?.par || '').slice(0, 120));
    res.json({ url: `${URL_ENS}/?apercu=${jeton}` });
  });
  int.post('/interne/ens/depot', (req, res) => {
    const b = req.body || {};
    db.transaction(() => {
      db.exec('DELETE FROM ens; DELETE FROM ens_seance; DELETE FROM ens_inscrit; DELETE FROM ens_etudiant; DELETE FROM ens_attente;');
      const ie = db.prepare("INSERT INTO ens (id, nom, prenom, email, maj_le, apercu_seul) VALUES (?,?,?,?, datetime('now'), ?)");
      for (const e of b.enseignants || []) if (Number(e.id) && String(e.email || '').includes('@')) ie.run(Number(e.id), String(e.nom || ''), String(e.prenom || ''), String(e.email), e.apercu_seul ? 1 : 0);
      const is = db.prepare(`INSERT OR REPLACE INTO ens_seance (id, ens_id, date, heure_debut, heure_fin, cours_code, cours_nom, ue_num, matiere, local, annule, visite)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
      const ii = db.prepare('INSERT OR IGNORE INTO ens_inscrit (seance_id, etudiant_id) VALUES (?,?)');
      for (const s of b.seances || []) {
        is.run(Number(s.id), Number(s.ens_id), String(s.date), s.heure_debut || null, s.heure_fin || null, s.cours_code || null, s.cours_nom || null,
          s.ue_num ?? null, s.matiere || null, s.local || null, s.annule ? 1 : 0, s.visite ? 1 : 0);
        for (const id of s.inscrits || []) ii.run(Number(s.id), Number(id));
      }
      const iet = db.prepare('INSERT OR REPLACE INTO ens_etudiant (id, nom, prenom, groupe) VALUES (?,?,?,?)');
      for (const e of b.etudiants || []) iet.run(Number(e.id), String(e.nom || ''), String(e.prenom || ''), e.groupe || null);
      // Les présences de Lucie font foi, sauf celles qu'un geste non encore relevé vient de poser.
      const pendants = new Set(db.prepare('SELECT seance_id FROM ens_geste WHERE releve_le IS NULL').all().map(x => x.seance_id));
      db.exec('DELETE FROM ens_presence WHERE seance_id NOT IN (SELECT seance_id FROM ens_geste WHERE releve_le IS NULL)');
      const ip = db.prepare(`INSERT OR REPLACE INTO ens_presence (seance_id, etudiant_id, statut, retard, motif) VALUES (?,?,?,?,?)`);
      for (const p of b.presences || []) if (!pendants.has(Number(p.seance_id))) ip.run(Number(p.seance_id), Number(p.etudiant_id), p.statut || null, p.retard ? 1 : 0, p.motif || null);
      const ia = db.prepare('INSERT INTO ens_attente (ens_id, contenu) VALUES (?,?)');
      for (const a of b.attentes || []) ia.run(Number(a.ens_id), JSON.stringify(a.lignes || []));
      db.prepare("INSERT INTO ens_reglage (cle, valeur) VALUES ('depose_le', datetime('now')) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur").run();
      db.prepare("INSERT INTO ens_reglage (cle, valeur) VALUES ('motifs', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur")
        .run(JSON.stringify((b.motifs || []).filter(m => /^[a-z_]{2,30}$/.test(String(m.k))).map(m => ({ k: String(m.k), l: String(m.l || '').slice(0, 120) }))));
    })();
    res.json({ ok: true });
  });
  int.get('/interne/ens/releve', (req, res) => {
    res.json({
      demandes: db.prepare('SELECT id, type, ens_id, valeur FROM ens_demande WHERE releve_le IS NULL ORDER BY id LIMIT 200').all(),
      gestes: db.prepare('SELECT id, ens_id, type, seance_id, contenu FROM ens_geste WHERE releve_le IS NULL ORDER BY id LIMIT 100').all(),
      entrees: db.prepare('SELECT id, ens_id, le, ip FROM ens_entree WHERE releve_le IS NULL LIMIT 500').all(),
    });
  });
  int.post('/interne/ens/acquitter', (req, res) => {
    const ids = k => (req.body?.[k] || []).map(Number).filter(Boolean);
    db.transaction(() => {
      for (const id of ids('demandes')) db.prepare("UPDATE ens_demande SET releve_le = datetime('now'), valeur = NULL WHERE id = ?").run(id);
      for (const id of ids('entrees')) db.prepare("UPDATE ens_entree SET releve_le = datetime('now') WHERE id = ?").run(id);
      for (const g of Array.isArray(req.body?.gestes) ? req.body.gestes : []) {
        db.prepare("UPDATE ens_geste SET releve_le = datetime('now'), erreur = ? WHERE id = ?").run(g.erreur ? String(g.erreur).slice(0, 300) : null, Number(g.id));
      }
      db.prepare("DELETE FROM ens_geste WHERE releve_le < datetime('now', '-30 days')").run();
    })();
    res.json({ ok: true });
  });
}
