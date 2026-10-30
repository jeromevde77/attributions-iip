/**
 * L'ESPACE DE L'ÉTUDIANT (3.1.475, Charles, 30 octobre 2026 : « un mini espace ultra sécurisé auquel l'étudiant
 * se connecte et peut récupérer ses documents, voir ses notes, et signer les accusés de réception » ; tranché :
 * lien + code, résultats délibérés seulement, accusé sur les notifications, les règlements et toute pièce).
 *
 * QUI ENTRE — LA PORTE DE LA DEMANDE DE VA, EN PLUS STRICT. Le matricule déclenche un lien à usage unique,
 * 30 minutes, envoyé à l'adresse D'ÉCOLE du dossier, et à elle seule (des notes et des décisions ne partent pas
 * vers une adresse privée) ; même réponse pour un matricule inconnu ; plafonds par étudiant et par adresse IP.
 * La session (2 h) est signée d'une clé DÉRIVÉE, portée `espace_etudiant` : elle n'ouvre aucune autre route.
 *
 * CE QU'IL VOIT, ET RIEN D'AUTRE :
 *   · ses RÉSULTATS DÉLIBÉRÉS — une unité ne paraît qu'une fois sa séance close (ou l'année reprise) : décision
 *     et note d'unité, « NA » sous 10 (circulaire Sanction des études), 10 pour une faveur, « VA » pour une
 *     unité valorisée. Jamais une note de travail.
 *   · ses DOCUMENTS — les pièces que l'école lui a envoyées par Lucie (registre des envois), telles qu'elles
 *     sont parties, avec leur référence.
 *   · les RÈGLEMENTS que la direction destine aux étudiants (Documentation, destinataire « Étudiants »).
 *
 * L'ACCUSÉ DE RÉCEPTION — DEUX TRACES, COMME POUR LE PERSONNEL. `presente_le` est posé par la route qui REND la
 * pièce, jamais par l'écran ; on ne signe que ce qui a été présenté. La signature demande un CODE à six chiffres,
 * envoyé à l'adresse d'école au moment de signer (10 minutes, 5 essais) : la session prouve qu'on a eu le lien,
 * le code qu'on tient la boîte à cet instant. Une signature ne se retire pas. L'école la lit sur la fiche.
 */
import { Router } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import db from '../db/index.js';
import { envoyerEmail, templateNotif } from '../services/mailer.js';
import { authRequired } from '../middleware/auth.js';
import { copieDeLEnvoi } from './envois.js';
import { derniereVersion, versionReference } from './documentation.js';

const r = Router();
const SECRET = crypto.createHmac('sha256', process.env.JWT_SECRET || 'change-me-in-prod').update('espace-etudiant').digest('hex');
const VALIDITE_LIEN_MIN = 30, DUREE_SESSION = '2h', LIENS_MAX_PAR_HEURE = 3, ESSAIS_MAX_PAR_HEURE = 30;
const CODE_MIN = 10, CODE_ESSAIS = 5;
const BASE_URL = () => process.env.LUCIE_URL || 'https://www.lucie-iip.be';
const empreinte = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const maintenant = () => db.prepare("SELECT datetime('now') n").get().n;

let migre = false;
export function migrerEspace() {
  if (migre) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS espace_jeton (
      id INTEGER PRIMARY KEY AUTOINCREMENT, etudiant_id INTEGER NOT NULL, jeton_hash TEXT NOT NULL UNIQUE,
      cree_le TEXT NOT NULL DEFAULT (datetime('now')), expire_le TEXT NOT NULL, utilise_le TEXT, ip TEXT);
    CREATE TABLE IF NOT EXISTS espace_code (
      id INTEGER PRIMARY KEY AUTOINCREMENT, etudiant_id INTEGER NOT NULL, objet_type TEXT NOT NULL, objet_id INTEGER NOT NULL,
      code_hash TEXT NOT NULL, cree_le TEXT NOT NULL DEFAULT (datetime('now')), expire_le TEXT NOT NULL,
      essais INTEGER NOT NULL DEFAULT 0, utilise_le TEXT);
    -- Une ligne par pièce et par étudiant : présentée, puis signée. Rien ne l'efface.
    CREATE TABLE IF NOT EXISTS espace_accuse (
      id INTEGER PRIMARY KEY AUTOINCREMENT, etudiant_id INTEGER NOT NULL,
      objet_type TEXT NOT NULL CHECK (objet_type IN ('envoi','reglement')), objet_id INTEGER NOT NULL,
      presente_le TEXT, signe_le TEXT, ip TEXT, agent TEXT,
      UNIQUE (etudiant_id, objet_type, objet_id));
    CREATE TRIGGER IF NOT EXISTS espace_accuse_signe_fige BEFORE UPDATE ON espace_accuse
      WHEN OLD.signe_le IS NOT NULL BEGIN SELECT RAISE(ABORT, 'Un accusé signé ne se modifie pas.'); END;
    CREATE TRIGGER IF NOT EXISTS espace_accuse_sans_effacement BEFORE DELETE ON espace_accuse
      WHEN OLD.signe_le IS NOT NULL BEGIN SELECT RAISE(ABORT, 'Un accusé signé ne s''efface pas.'); END;
  `);
  migre = true;
}

const essais = new Map();
function ipDe(req) {
  const p = String(req.headers['x-forwarded-for'] || '').split(',').map(x => x.trim()).filter(Boolean);
  return p.length >= 2 ? p[p.length - 2] : p[0] || req.ip || '?';
}
function tropDEssais(ip) {
  const t = Date.now();
  const l = (essais.get(ip) || []).filter(x => t - x < 3600e3);
  l.push(t); essais.set(ip, l);
  return l.length > ESSAIS_MAX_PAR_HEURE;
}
function anneeActive() {
  return db.prepare('SELECT code FROM annee_scolaire WHERE active = 1').get()?.code
    || db.prepare('SELECT code FROM annee_scolaire ORDER BY code DESC LIMIT 1').get()?.code;
}
function etudiantDuMatricule(m) {
  const mat = String(m || '').trim();
  if (!mat || mat.length > 40) return null;
  let e = db.prepare('SELECT * FROM etudiant WHERE id_ecampus = ? AND COALESCE(actif, 1) = 1').get(mat);
  if (!e) {
    try {
      e = db.prepare(`SELECT e.* FROM etudiant e JOIN etudiant_matricule m ON m.etudiant_id = e.id
        WHERE m.id_ecampus = ? AND COALESCE(e.actif, 1) = 1`).get(mat);
    } catch { /* table absente */ }
  }
  return e || null;
}

// ── 1. Le lien ─────────────────────────────────────────────────────────────
r.post('/lien', async (req, res) => {
  migrerEspace();
  const reponse = { ok: true, message: "Si ce matricule est connu, un lien d'accès vient d'être envoyé à votre adresse d'école. Il est valable 30 minutes et ne sert qu'une fois." };
  if (tropDEssais(ipDe(req))) return res.status(429).json({ error: 'Trop de demandes. Réessayez dans une heure.' });
  const e = etudiantDuMatricule(req.body?.matricule);
  if (!e || !String(e.email_ecole || '').includes('@')) return res.json(reponse);
  const recents = db.prepare(`SELECT COUNT(*) n FROM espace_jeton WHERE etudiant_id = ? AND cree_le > datetime('now', '-1 hour')`).get(e.id).n;
  if (recents >= LIENS_MAX_PAR_HEURE) return res.json(reponse);
  const jeton = crypto.randomBytes(32).toString('base64url');
  db.prepare(`INSERT INTO espace_jeton (etudiant_id, jeton_hash, expire_le, ip) VALUES (?, ?, datetime('now', ?), ?)`)
    .run(e.id, empreinte(jeton), `+${VALIDITE_LIEN_MIN} minutes`, ipDe(req));
  const lien = `${BASE_URL()}/espace?jeton=${encodeURIComponent(jeton)}`;
  const html = templateNotif({
    titre: 'Votre espace étudiant',
    corps: `<p>Bonjour ${esc(e.prenom || '')},</p>
      <p>Voici votre lien d'accès à votre espace à l'Institut Ilya Prigogine : vos résultats délibérés, vos documents et vos accusés de réception.
      Il est valable ${VALIDITE_LIEN_MIN} minutes et ne sert qu'une fois.</p>
      <p><a href="${lien}" style="display:inline-block;background:#16406A;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Ouvrir mon espace</a></p>
      <p style="color:#64748b;font-size:12px">Vous n'avez rien demandé ? Ignorez ce message : sans ce lien, personne n'accède à votre espace.</p>`,
  });
  const envoi = await envoyerEmail({ to: e.email_ecole, subject: 'Institut Ilya Prigogine — votre lien d’accès à votre espace', html })
    .catch(err => ({ ok: false, erreur: err.message }));
  if (envoi?.simule && process.env.NODE_ENV !== 'production') console.log(`[espace] lien (courriel simulé) : ${lien}`);
  if (!envoi?.ok) console.error('[espace] courriel non parti :', envoi?.erreur);
  res.json(reponse);
});

// ── 2. La session ──────────────────────────────────────────────────────────
r.post('/session', (req, res) => {
  migrerEspace();
  if (tropDEssais(ipDe(req))) return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans une heure.' });
  const jeton = String(req.body?.jeton || '');
  const l = jeton && db.prepare('SELECT * FROM espace_jeton WHERE jeton_hash = ?').get(empreinte(jeton));
  if (!l || l.utilise_le || l.expire_le < maintenant()) {
    return res.status(401).json({ error: 'Ce lien a expiré ou a déjà servi. Demandez-en un nouveau avec votre matricule.' });
  }
  db.prepare("UPDATE espace_jeton SET utilise_le = datetime('now'), ip = ? WHERE id = ?").run(ipDe(req), l.id);
  res.json({ token: jwt.sign({ scope: 'espace_etudiant', etudiant_id: l.etudiant_id }, SECRET, { expiresIn: DUREE_SESSION }) });
});

function etudiantConnecte(req, res, next) {
  migrerEspace();
  try {
    const p = jwt.verify(String(req.headers.authorization || '').replace(/^Bearer /, ''), SECRET);
    if (p.scope !== 'espace_etudiant' || !p.etudiant_id) throw new Error('portée');
    const e = db.prepare('SELECT * FROM etudiant WHERE id = ? AND COALESCE(actif, 1) = 1').get(p.etudiant_id);
    if (!e) throw new Error('inconnu');
    req.etudiant = e;
    next();
  } catch {
    res.status(401).json({ error: 'Session expirée. Redemandez un lien avec votre matricule.' });
  }
}

// ── Ce que l'étudiant voit ─────────────────────────────────────────────────
const colonnes = t => { try { return db.prepare(`PRAGMA table_info("${t}")`).all().map(c => c.name); } catch { return []; } };

/** Les résultats publiés : séance close (de l'organisation de l'étudiant ou « toute l'unité »), ou année reprise. */
function resultats(e) {
  const annee = anneeActive();
  const cs = colonnes('deliberation_seance');
  const orgSql = cs.includes('num_organisation')
    ? 'AND (COALESCE(s.num_organisation, 0) = 0 OR s.num_organisation = COALESCE(i.num_organisation, 0))' : '';
  const ci = colonnes('etudiant_inscription');
  const lignes = db.prepare(`SELECT i.annee_scolaire, i.ue_num, i.resultat, i.points${ci.includes('num_organisation') ? ', i.num_organisation' : ''},
      (SELECT ue_nom FROM ue WHERE ue_num = i.ue_num AND annee_scolaire = i.annee_scolaire LIMIT 1) ue_nom,
      (SELECT ects FROM ue WHERE ue_num = i.ue_num AND annee_scolaire = i.annee_scolaire LIMIT 1) ects,
      EXISTS (SELECT 1 FROM deliberation_seance s WHERE s.ue_num = i.ue_num AND s.annee_scolaire = i.annee_scolaire
              AND s.cloturee = 1 ${orgSql}) AS close
    FROM etudiant_inscription i WHERE i.etudiant_id = ? AND i.resultat IS NOT NULL
    ORDER BY i.annee_scolaire DESC, i.ue_num`).all(e.id);
  const parAnnee = new Map();
  for (const l of lignes) {
    if (!(l.close || l.annee_scolaire < annee)) continue;     // pas encore publié
    const reussi = l.resultat === 'reussi';
    const note = reussi && l.points != null ? Math.max(10, Math.round(Number(l.points))) : null;
    const decision = { reussi: 'Réussi', ajourne: 'Ajourné', refuse: 'Refusé' }[l.resultat] || l.resultat;
    if (!parAnnee.has(l.annee_scolaire)) parAnnee.set(l.annee_scolaire, []);
    parAnnee.get(l.annee_scolaire).push({ ue_num: l.ue_num, ue_nom: l.ue_nom, ects: l.ects, decision,
      note: reussi ? (note ?? '—') : 'NA', etat: reussi ? 'reussi' : l.resultat === 'ajourne' ? 'surveiller' : 'corriger' });
  }
  // Les unités valorisées en entier, décidées.
  try {
    for (const v of db.prepare(`SELECT annee_scolaire, ue_num,
        (SELECT ue_nom FROM ue WHERE ue_num = v.ue_num ORDER BY annee_scolaire DESC LIMIT 1) ue_nom
      FROM etudiant_valorisation v WHERE etudiant_id = ? AND type = 'complete' AND ue_num > 0
        AND decision_le IS NOT NULL AND COALESCE(decision, 'accordee') <> 'refusee'`).all(e.id)) {
      if (!parAnnee.has(v.annee_scolaire)) parAnnee.set(v.annee_scolaire, []);
      parAnnee.get(v.annee_scolaire).push({ ue_num: v.ue_num, ue_nom: v.ue_nom, decision: 'Valorisé (VA)', note: 'VA', etat: 'reussi' });
    }
  } catch { /* pas de valorisations */ }
  return [...parAnnee].sort((a, b) => b[0].localeCompare(a[0])).map(([a, ues]) => ({ annee: a, ues }));
}

const accuseDe = (e, type, id) => db.prepare('SELECT presente_le, signe_le FROM espace_accuse WHERE etudiant_id = ? AND objet_type = ? AND objet_id = ?')
  .get(e.id, type, id) || {};

function documents(e) {
  try {
    return db.prepare(`SELECT m.id, m.sujet, m.nom_fichier, m.type_doc, m.envoye_le, m.reference, m.contenu
        FROM envoi_mail m JOIN envoi_copie c ON c.envoi_id = m.id
       WHERE m.destinataire_type = 'etudiant' AND m.destinataire_id = ? AND m.statut IN ('envoye','simule')
       ORDER BY m.envoye_le DESC, m.id DESC`).all(e.id)
      .map(d => ({ ...d, ...accuseDe(e, 'envoi', d.id) }));
  } catch { return []; }
}

function reglements(e) {
  try {
    return db.prepare(`SELECT d.id, d.cle, d.titre, d.nature, d.resume FROM corpus_document d
        JOIN corpus_destinataire t ON t.document_id = d.id AND t.role = 'etudiant'
       WHERE d.retire_le IS NULL ORDER BY d.titre`).all()
      .map(d => {
        const v = derniereVersion(d.id); const ref = versionReference(d.id);
        if (!v) return null;
        // Signé sur une version au moins égale à la référence : la confirmation tient (règle du personnel).
        const signe = db.prepare(`SELECT a.signe_le, cv.numero FROM espace_accuse a JOIN corpus_version cv ON cv.id = a.objet_id
            WHERE a.etudiant_id = ? AND a.objet_type = 'reglement' AND cv.document_id = ? AND a.signe_le IS NOT NULL
              AND cv.numero >= ? ORDER BY cv.numero DESC LIMIT 1`).get(e.id, d.id, ref?.numero || v.numero);
        return { cle: d.cle, titre: d.titre, nature: d.nature, resume: d.resume, version_id: v.id, numero: v.numero,
          publiee_le: v.publiee_le, signe_le: signe?.signe_le || null, ...(signe ? {} : { presente_le: accuseDe(e, 'reglement', v.id).presente_le || null }) };
      }).filter(Boolean);
  } catch { return []; }
}

r.get('/moi', etudiantConnecte, (req, res) => {
  const e = req.etudiant;
  res.json({
    etudiant: { nom: e.nom, prenom: e.prenom, matricule: e.id_ecampus, email: e.email_ecole },
    resultats: resultats(e), documents: documents(e), reglements: reglements(e),
  });
});

function presenter(e, type, id, req) {
  db.prepare(`INSERT INTO espace_accuse (etudiant_id, objet_type, objet_id, presente_le, ip, agent)
      VALUES (?,?,?, datetime('now'), ?, ?)
    ON CONFLICT(etudiant_id, objet_type, objet_id) DO UPDATE SET presente_le = COALESCE(espace_accuse.presente_le, excluded.presente_le)
    WHERE espace_accuse.signe_le IS NULL`).run(e.id, type, id, ipDe(req), String(req.headers['user-agent'] || '').slice(0, 200));
}

// ── 3. Ouvrir une pièce : c'est ici, et seulement ici, qu'elle est « présentée ». ──
r.get('/documents/:id', etudiantConnecte, async (req, res) => {
  const e = req.etudiant;
  const m = db.prepare(`SELECT id FROM envoi_mail WHERE id = ? AND destinataire_type = 'etudiant' AND destinataire_id = ?
    AND statut IN ('envoye','simule')`).get(Number(req.params.id), e.id);
  if (!m) return res.status(404).json({ error: 'Document introuvable.' });
  const c = await copieDeLEnvoi(m.id);
  if (c.erreur) return res.status(c.code).json({ error: c.erreur });
  presenter(e, 'envoi', m.id, req);
  res.setHeader('Content-Type', c.type);
  res.setHeader('Cache-Control', 'no-store');
  if (c.type === 'application/pdf') res.setHeader('Content-Disposition', `inline; filename="${c.nom}"`);
  res.send(c.corps);
});

r.get('/reglements/:cle', etudiantConnecte, (req, res) => {
  const e = req.etudiant;
  const d = db.prepare(`SELECT d.* FROM corpus_document d JOIN corpus_destinataire t ON t.document_id = d.id AND t.role = 'etudiant'
    WHERE d.cle = ? AND d.retire_le IS NULL`).get(req.params.cle);
  const v = d && derniereVersion(d.id);
  if (!v) return res.status(404).json({ error: 'Texte introuvable.' });
  presenter(e, 'reglement', v.id, req);
  res.json({ titre: d.titre, numero: v.numero, publiee_le: v.publiee_le, contenu: v.contenu, source_url: d.source_url || null });
});

// ── 4. Signer : un code à l'adresse d'école, puis la signature ─────────────
function objetValide(e, type, id) {
  if (type === 'envoi') return !!db.prepare(`SELECT 1 FROM envoi_mail WHERE id = ? AND destinataire_type = 'etudiant' AND destinataire_id = ?`).get(id, e.id);
  if (type === 'reglement') return !!db.prepare(`SELECT 1 FROM corpus_version v JOIN corpus_destinataire t ON t.document_id = v.document_id AND t.role = 'etudiant' WHERE v.id = ?`).get(id);
  return false;
}

r.post('/code', etudiantConnecte, async (req, res) => {
  const e = req.etudiant;
  const type = String(req.body?.objet_type || ''), id = Number(req.body?.objet_id);
  if (!objetValide(e, type, id)) return res.status(404).json({ error: 'Pièce introuvable.' });
  const a = accuseDe(e, type, id);
  if (!a.presente_le) return res.status(409).json({ error: 'Ouvrez d’abord la pièce : on ne signe que ce qu’on a lu.' });
  if (a.signe_le) return res.status(409).json({ error: 'Déjà signé.' });
  const recents = db.prepare(`SELECT COUNT(*) n FROM espace_code WHERE etudiant_id = ? AND cree_le > datetime('now', '-1 hour')`).get(e.id).n;
  if (recents >= 10) return res.status(429).json({ error: 'Trop de codes demandés. Réessayez dans une heure.' });
  const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
  db.prepare(`UPDATE espace_code SET utilise_le = datetime('now') WHERE etudiant_id = ? AND objet_type = ? AND objet_id = ? AND utilise_le IS NULL`).run(e.id, type, id);
  db.prepare(`INSERT INTO espace_code (etudiant_id, objet_type, objet_id, code_hash, expire_le) VALUES (?,?,?,?, datetime('now', ?))`)
    .run(e.id, type, id, empreinte(`${e.id}:${code}`), `+${CODE_MIN} minutes`);
  const envoi = await envoyerEmail({ to: e.email_ecole, subject: `Institut Ilya Prigogine — code de signature ${code}`,
    html: templateNotif({ titre: 'Votre code de signature', corps: `<p>Votre code pour signer l'accusé de réception dans votre espace :</p>
      <p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p><p>Il est valable ${CODE_MIN} minutes.</p>
      <p style="color:#64748b;font-size:12px">Vous n'êtes pas en train de signer ? Ne communiquez ce code à personne.</p>` }) })
    .catch(err => ({ ok: false, erreur: err.message }));
  if (envoi?.simule && process.env.NODE_ENV !== 'production') console.log(`[espace] code (courriel simulé) : ${code}`);
  if (!envoi?.ok) return res.status(502).json({ error: 'Le code n’a pas pu être envoyé. Réessayez dans un instant.' });
  res.json({ ok: true, message: `Un code à six chiffres vient d'être envoyé à ${e.email_ecole}.` });
});

r.post('/accuser', etudiantConnecte, (req, res) => {
  const e = req.etudiant;
  const type = String(req.body?.objet_type || ''), id = Number(req.body?.objet_id);
  const code = String(req.body?.code || '').replace(/\D/g, '');
  if (!objetValide(e, type, id)) return res.status(404).json({ error: 'Pièce introuvable.' });
  const c = db.prepare(`SELECT * FROM espace_code WHERE etudiant_id = ? AND objet_type = ? AND objet_id = ? AND utilise_le IS NULL
    ORDER BY id DESC LIMIT 1`).get(e.id, type, id);
  if (!c || c.expire_le < maintenant()) return res.status(401).json({ error: 'Ce code a expiré. Demandez-en un nouveau.' });
  if (c.essais >= CODE_ESSAIS) return res.status(429).json({ error: 'Trop d’essais. Demandez un nouveau code.' });
  if (empreinte(`${e.id}:${code}`) !== c.code_hash) {
    db.prepare('UPDATE espace_code SET essais = essais + 1 WHERE id = ?').run(c.id);
    return res.status(401).json({ error: 'Code incorrect.' });
  }
  db.prepare("UPDATE espace_code SET utilise_le = datetime('now') WHERE id = ?").run(c.id);
  db.prepare(`UPDATE espace_accuse SET signe_le = datetime('now'), ip = ?, agent = ?
    WHERE etudiant_id = ? AND objet_type = ? AND objet_id = ? AND signe_le IS NULL AND presente_le IS NOT NULL`)
    .run(ipDe(req), String(req.headers['user-agent'] || '').slice(0, 200), e.id, type, id);
  res.json({ ok: true, ...accuseDe(e, type, id) });
});

// ── 5. Ce que l'école en lit : sur la fiche de l'étudiant ──────────────────
r.get('/suivi/:etudiantId', authRequired, (req, res) => {
  migrerEspace();
  const id = Number(req.params.etudiantId);
  const connexions = db.prepare(`SELECT utilise_le, ip FROM espace_jeton WHERE etudiant_id = ? AND utilise_le IS NOT NULL ORDER BY utilise_le DESC LIMIT 5`).all(id);
  const accuses = db.prepare(`SELECT a.objet_type, a.objet_id, a.presente_le, a.signe_le,
      CASE a.objet_type WHEN 'envoi' THEN (SELECT COALESCE(m.nom_fichier, m.sujet) || ' · ' || COALESCE(m.reference, '') FROM envoi_mail m WHERE m.id = a.objet_id)
        ELSE (SELECT d.titre || ' (version ' || v.numero || ')' FROM corpus_version v JOIN corpus_document d ON d.id = v.document_id WHERE v.id = a.objet_id) END AS piece
    FROM espace_accuse a WHERE a.etudiant_id = ? ORDER BY COALESCE(a.signe_le, a.presente_le) DESC`).all(id);
  res.json({ connexions, accuses });
});

export default r;
