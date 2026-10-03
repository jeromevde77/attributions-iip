/**
 * LA PORTE DES ÉTUDIANTS — DEMANDE DE VALORISATION EN LIGNE
 * (Charles, 2 et 3 octobre 2026 : « que les étudiants fassent leur demande de
 * VA en ligne depuis le site, mais avec sécurisation » ; « avec le numéro de
 * matricule » ; le lien peut partir sur l'adresse privée ; l'étudiant peut
 * revenir compléter.)
 *
 * QUI ENTRE. L'étudiant tape son matricule ; Lucie envoie un lien valable
 * 30 minutes, à usage unique, à l'adresse DE SON DOSSIER (école, sinon privée)
 * — jamais à une adresse tapée sur la page. Celui qui n'a pas la boîte n'entre
 * pas. La réponse est la même que le matricule existe ou non : la porte ne
 * sert pas à essayer des numéros.
 *
 * CE QU'IL PEUT FAIRE, ET RIEN D'AUTRE. Ouvrir une demande par unité de sa
 * section (AD n'est pas offert : l'admission se traite au secrétariat), y
 * déposer ses pièces, et revenir compléter TANT QUE LE SECRÉTARIAT N'A PAS
 * CONTRÔLÉ LA RECEVABILITÉ de l'unité. Il ne lit rien d'autre de Lucie.
 *
 * LE JETON N'EST PAS CELUI DU PERSONNEL : signé d'une clé dérivée, portée
 * `portail_va`, il échoue sur toute autre route (middleware/auth.js le
 * refuse aussi par sa portée).
 *
 * LE CIRCUIT NE CHANGE PAS. Chaque unité devient un dossier à l'étape
 * « introduite », daté par le serveur (RDE art. 28 : la date d'envoi fait
 * foi), journalisé « en ligne par l'étudiant ». La suite se fait à l'école.
 */
import { Router } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { mkdirSync, unlinkSync, openSync, readSync, closeSync } from 'fs';
import { join } from 'path';
import db from '../db/index.js';
import { envoyerEmail, templateNotif } from '../services/mailer.js';
import { uniteValorisable, journaliser, rafraichirEtat, controleDelai } from '../lib/valorisation.js';
import { sectionRattachement, nommerPreuve, nomLibre, NATURES_PREUVE } from './etudiants.js';

const r = Router();

const SECRET = crypto.createHmac('sha256', process.env.JWT_SECRET || 'change-me-in-prod')
  .update('portail-va').digest('hex');
const VALIDITE_LIEN_MIN = 30;
const DUREE_SESSION = '3h';
const LIENS_MAX_PAR_HEURE = 3;      // par étudiant
const ESSAIS_MAX_PAR_HEURE = 20;    // par adresse IP
const DATA_DIR = process.env.DATA_DIR || '/app/data';
const BASE_URL = () => process.env.LUCIE_URL || 'https://www.lucie-iip.be';

let migre = false;
function migrer() {
  if (migre) return;
  db.exec(`CREATE TABLE IF NOT EXISTS portail_va_jeton (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    etudiant_id INTEGER NOT NULL,
    jeton_hash TEXT NOT NULL UNIQUE,
    cree_le TEXT NOT NULL DEFAULT (datetime('now')),
    expire_le TEXT NOT NULL,
    utilise_le TEXT,
    ip TEXT
  )`);
  migre = true;
}

const empreinte = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const aujourdHui = () => new Date().toISOString().slice(0, 10);
const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* Les essais par adresse IP, en mémoire : une porte publique se protège des
   robots sans table de plus. Un redémarrage remet les compteurs à zéro, et ce
   n'est pas grave — le plafond par étudiant, lui, est en base. */
const essais = new Map();
/* L'ADRESSE DU VISITEUR. Lucie est derrière Caddy puis nginx : chacun ajoute
   une entrée à X-Forwarded-For ; celle du visiteur est l'avant-dernière (la
   dernière est Caddy, vue par nginx). */
function ipDe(req) {
  const p = String(req.headers['x-forwarded-for'] || '').split(',').map(x => x.trim()).filter(Boolean);
  return p.length >= 2 ? p[p.length - 2] : p[0] || req.ip || '?';
}
function tropDEssais(ip) {
  const maintenant = Date.now();
  const l = (essais.get(ip) || []).filter(t => maintenant - t < 3600e3);
  l.push(maintenant);
  essais.set(ip, l);
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

// ── 1. Demander le lien ────────────────────────────────────────────────────
r.post('/lien', async (req, res) => {
  migrer();
  const reponse = { ok: true, message: "Si ce matricule est connu, un lien d'accès vient d'être envoyé à l'adresse de votre dossier. Il est valable 30 minutes." };
  if (tropDEssais(ipDe(req))) return res.status(429).json({ error: 'Trop de demandes. Réessayez dans une heure.' });
  const e = etudiantDuMatricule(req.body?.matricule);
  const adresse = e && (e.email_ecole || e.email_perso);
  if (!e || !adresse) return res.json(reponse);
  const recents = db.prepare(`SELECT COUNT(*) n FROM portail_va_jeton
    WHERE etudiant_id = ? AND cree_le > datetime('now', '-1 hour')`).get(e.id).n;
  if (recents >= LIENS_MAX_PAR_HEURE) return res.json(reponse);

  const jeton = crypto.randomBytes(32).toString('base64url');
  db.prepare(`INSERT INTO portail_va_jeton (etudiant_id, jeton_hash, expire_le, ip)
    VALUES (?, ?, datetime('now', ?), ?)`).run(e.id, empreinte(jeton), `+${VALIDITE_LIEN_MIN} minutes`, ipDe(req));
  const lien = `${BASE_URL()}/demande-va?jeton=${encodeURIComponent(jeton)}`;
  const html = templateNotif({
    titre: 'Votre demande de valorisation des acquis',
    corps: `<p>Bonjour ${esc(e.prenom || '')},</p>
      <p>Voici votre lien pour introduire ou compléter votre demande de valorisation des acquis à l'Institut Ilya Prigogine.
      Il est valable ${VALIDITE_LIEN_MIN} minutes et ne sert qu'une fois.</p>
      <p><a href="${lien}" style="display:inline-block;background:#16406A;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Ouvrir ma demande</a></p>
      <p style="color:#64748b;font-size:12px">Vous n'avez rien demandé ? Ignorez ce message : sans ce lien, personne n'accède à votre dossier.</p>`,
  });
  const envoi = await envoyerEmail({ to: adresse, subject: 'Institut Ilya Prigogine — votre lien de demande de valorisation', html })
    .catch(err => ({ ok: false, erreur: err.message }));
  if (envoi?.simule && process.env.NODE_ENV !== 'production') console.log(`[portail-va] lien (courriel simulé) : ${lien}`);
  if (!envoi?.ok) console.error('[portail-va] courriel non parti :', envoi?.erreur);
  res.json(reponse);
});

// ── 2. Échanger le lien contre une session ─────────────────────────────────
r.post('/session', (req, res) => {
  migrer();
  if (tropDEssais(ipDe(req))) return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans une heure.' });
  const jeton = String(req.body?.jeton || '');
  const ligne = jeton && db.prepare(`SELECT * FROM portail_va_jeton WHERE jeton_hash = ?`).get(empreinte(jeton));
  if (!ligne || ligne.utilise_le || ligne.expire_le < db.prepare("SELECT datetime('now') n").get().n) {
    return res.status(401).json({ error: 'Ce lien a expiré ou a déjà servi. Demandez-en un nouveau avec votre matricule.' });
  }
  db.prepare("UPDATE portail_va_jeton SET utilise_le = datetime('now') WHERE id = ?").run(ligne.id);
  const token = jwt.sign({ scope: 'portail_va', etudiant_id: ligne.etudiant_id }, SECRET, { expiresIn: DUREE_SESSION });
  res.json({ token });
});

// ── La session de l'étudiant ───────────────────────────────────────────────
function etudiantConnecte(req, res, next) {
  const a = req.headers.authorization || '';
  try {
    const p = jwt.verify(a.replace(/^Bearer /, ''), SECRET);
    if (p.scope !== 'portail_va' || !p.etudiant_id) throw new Error('portée');
    const e = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(p.etudiant_id);
    if (!e) throw new Error('inconnu');
    req.etudiant = e;
    // Ce que le journal de la valorisation inscrira comme auteur du geste.
    req.user = { id: null, nom: `${String(e.nom || '').toUpperCase()} ${e.prenom || ''} (étudiant, en ligne)`.trim(), role: 'etudiant' };
    next();
  } catch {
    res.status(401).json({ error: 'Session expirée. Redemandez un lien avec votre matricule.' });
  }
}

/** Les unités que l'étudiant peut demander : celles de sa section, cette année. */
function unitesOffertes(e, annee) {
  const sec = sectionRattachement(e.id, annee).section;
  if (!sec) return { section: null, unites: [] };
  let lignes = [];
  try {
    lignes = db.prepare(`SELECT u.ue_num, MIN(u.ue_nom) ue_nom, MIN(u.ue_niv) ue_niv FROM ue u
      WHERE u.annee_scolaire = ? AND (u.section = ? OR u.ue_num IN (SELECT ue_num FROM ue_section WHERE section_code = ?))
      GROUP BY u.ue_num ORDER BY u.ue_num`).all(annee, sec, sec);
  } catch {
    lignes = db.prepare(`SELECT ue_num, MIN(ue_nom) ue_nom, MIN(ue_niv) ue_niv FROM ue
      WHERE annee_scolaire = ? AND section = ? GROUP BY ue_num ORDER BY ue_num`).all(annee, sec);
  }
  const auPAE = new Set(db.prepare('SELECT ue_num FROM etudiant_inscription WHERE etudiant_id = ? AND annee_scolaire = ?')
    .all(e.id, annee).map(x => x.ue_num));
  const unites = lignes.filter(u => uniteValorisable(u.ue_num, annee).ok)
    .map(u => ({ ...u, au_pae: auPAE.has(u.ue_num) }))
    .sort((a, b) => (b.au_pae - a.au_pae) || a.ue_num - b.ue_num);
  return { section: sec, unites };
}

function demandesDe(e, annee) {
  const v = db.prepare(`SELECT id, ue_num, porte, mode_introduction, date_reception, recevable, decision_le, etat,
      (SELECT ue_nom FROM ue WHERE ue_num = v.ue_num ORDER BY annee_scolaire DESC LIMIT 1) ue_nom
    FROM etudiant_valorisation v WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num > 0 ORDER BY ue_num`).all(e.id, annee);
  const fic = db.prepare('SELECT id, nom, nature, taille, cree_par, cree_le FROM etudiant_valorisation_fichier WHERE valorisation_id = ? ORDER BY id');
  return v.map(x => ({
    id: x.id, ue_num: x.ue_num, ue_nom: x.ue_nom, porte: x.porte, recue_le: x.date_reception,
    en_ligne: x.mode_introduction === 'en ligne',
    // TANT QUE LE SECRÉTARIAT N'A PAS CONTRÔLÉ, L'ÉTUDIANT COMPLÈTE.
    modifiable: x.recevable == null && !x.decision_le,
    etape: x.decision_le ? 'décision' : x.recevable === 1 ? 'en examen' : x.recevable === 0 ? 'irrecevable' : 'reçue',
    pieces: fic.all(x.id).map(f => ({ id: f.id, nom: f.nom, nature: f.nature, taille: f.taille,
      a_moi: String(f.cree_par || '') === `etudiant:${e.id}` })),
  }));
}

r.get('/moi', etudiantConnecte, (req, res) => {
  const e = req.etudiant;
  const annee = anneeActive();
  const { section, unites } = unitesOffertes(e, annee);
  res.json({
    etudiant: { nom: e.nom, prenom: e.prenom, matricule: e.id_ecampus, section },
    annee, unites,
    demandes: demandesDe(e, annee),
    natures: NATURES_PREUVE.filter(n => n.cle !== 'TEST'),
  });
});

// ── 3. Ouvrir une demande pour une unité ───────────────────────────────────
r.post('/demandes', etudiantConnecte, (req, res) => {
  const e = req.etudiant;
  const annee = anneeActive();
  const ue = Number(req.body?.ue_num);
  const porte = String(req.body?.porte || '');
  if (!['va', 'vae'].includes(porte)) return res.status(400).json({ error: 'Choisissez VA ou VAE.' });
  if (!unitesOffertes(e, annee).unites.some(u => u.ue_num === ue)) {
    return res.status(400).json({ error: "Cette unité ne peut pas être demandée ici." });
  }
  const deja = db.prepare('SELECT id FROM etudiant_valorisation WHERE etudiant_id = ? AND ue_num = ? AND annee_scolaire = ? LIMIT 1')
    .get(e.id, ue, annee);
  if (deja) return res.status(409).json({ error: 'Une demande existe déjà pour cette unité.' });
  const jour = aujourdHui();
  const info = db.prepare(`INSERT INTO etudiant_valorisation
      (etudiant_id, annee_scolaire, ue_num, type, porte, decision, date_demande, date_reception, mode_introduction)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(e.id, annee, ue, 'partielle', porte, 'accordee', jour, jour, 'en ligne');
  journaliser(info.lastInsertRowid, 'introduction', req, `demande introduite en ligne par l'étudiant · ${porte}`);
  rafraichirEtat(info.lastInsertRowid);
  const delai = controleDelai({ ueNum: ue, annee, date_demande: jour, date_reception: jour });
  res.json({ ok: true, id: info.lastInsertRowid, hors_delai: !!delai?.hors_delai });
});

function maDemande(req, res) {
  const v = db.prepare('SELECT * FROM etudiant_valorisation WHERE id = ? AND etudiant_id = ?')
    .get(Number(req.params.vid), req.etudiant.id);
  if (!v) { res.status(404).json({ error: 'Demande introuvable.' }); return null; }
  if (v.recevable != null || v.decision_le) {
    res.status(409).json({ error: "Le secrétariat a déjà examiné cette demande : pour la compléter, adressez-vous à lui." });
    return null;
  }
  return v;
}

r.delete('/demandes/:vid', etudiantConnecte, (req, res) => {
  const v = maDemande(req, res); if (!v) return;
  if (v.mode_introduction !== 'en ligne') return res.status(409).json({ error: 'Cette demande a été encodée par le secrétariat.' });
  const fics = db.prepare('SELECT chemin FROM etudiant_valorisation_fichier WHERE valorisation_id = ?').all(v.id);
  journaliser(v.id, 'introduction', req, "demande retirée en ligne par l'étudiant, avant tout examen");
  db.prepare('DELETE FROM etudiant_valorisation_fichier WHERE valorisation_id = ?').run(v.id);
  db.prepare('DELETE FROM etudiant_valorisation WHERE id = ?').run(v.id);
  for (const f of fics) { try { unlinkSync(f.chemin); } catch { /* déjà parti */ } }
  res.json({ ok: true });
});

/* LE TYPE RÉEL DU FICHIER, PAS CELUI QU'IL ANNONCE. Une porte publique ne se
   fie ni à l'extension ni à l'en-tête envoyé par le navigateur : on lit les
   premiers octets. PDF, images, Word et OpenDocument texte — rien d'autre. */
function typeReel(chemin) {
  const b = Buffer.alloc(16);
  let n = 0;
  try { const fd = openSync(chemin, 'r'); n = readSync(fd, b, 0, 16, 0); closeSync(fd); } catch { return null; }
  if (n < 4) return null;
  const hex = b.toString('hex', 0, 8);
  if (b.toString('latin1', 0, 4) === '%PDF') return 'pdf';
  if (hex.startsWith('ffd8ff')) return 'jpeg';
  if (hex.startsWith('89504e47')) return 'png';
  if (b.toString('latin1', 0, 4) === 'GIF8') return 'gif';
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  if (b.toString('latin1', 4, 8) === 'ftyp') return 'heic';
  if (hex.startsWith('49492a00') || hex.startsWith('4d4d002a')) return 'tiff';
  if (hex.startsWith('504b0304')) return 'zip';           // docx, odt (conteneurs zip)
  if (hex.startsWith('d0cf11e0')) return 'doc';
  return null;
}
const MIMES_PORTAIL = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/tiff',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text']);
const envoi = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      const dir = join(DATA_DIR, 'valorisations', String(req.params.vid));
      try { mkdirSync(dir, { recursive: true }); } catch { /* déjà là */ }
      cb(null, dir);
    },
    filename(req, file, cb) { cb(null, `${Date.now()}_${file.originalname.replace(/[^\w.\-]+/g, '_')}`); },
  }),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter(req, file, cb) {
    if (MIMES_PORTAIL.has(file.mimetype)) return cb(null, true);
    cb(new Error('Déposez un PDF, une image ou un document Word.'));
  },
});

r.post('/demandes/:vid/fichiers', etudiantConnecte, (req, res) => {
  const v = maDemande(req, res); if (!v) return;
  envoi.single('fichier')(req, res, err => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop lourd (25 Mo au plus).' : err.message });
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });
    if (!typeReel(req.file.path)) {
      try { unlinkSync(req.file.path); } catch { /* */ }
      return res.status(400).json({ error: "Ce fichier n'est pas un PDF, une image ou un document Word valable." });
    }
    const nature = String(req.body?.nature || 'AUT').toUpperCase();
    const nom = nomLibre(v.id, nommerPreuve(nature, req.etudiant, v, req.file.originalname));
    const info = db.prepare(`INSERT INTO etudiant_valorisation_fichier
      (valorisation_id, nom, chemin, taille, type_mime, nature, cree_par) VALUES (?,?,?,?,?,?,?)`)
      .run(v.id, nom, req.file.path, req.file.size, req.file.mimetype, nature, `etudiant:${req.etudiant.id}`);
    journaliser(v.id, 'introduction', req, `pièce déposée en ligne : ${nom}`);
    res.json({ ok: true, id: info.lastInsertRowid, nom });
  });
});

r.delete('/fichiers/:fid', etudiantConnecte, (req, res) => {
  const f = db.prepare(`SELECT f.*, v.etudiant_id FROM etudiant_valorisation_fichier f
    JOIN etudiant_valorisation v ON v.id = f.valorisation_id WHERE f.id = ?`).get(Number(req.params.fid));
  if (!f || f.etudiant_id !== req.etudiant.id || f.cree_par !== `etudiant:${req.etudiant.id}`) {
    return res.status(404).json({ error: 'Pièce introuvable.' });
  }
  req.params.vid = f.valorisation_id;
  if (!maDemande(req, res)) return;
  db.prepare('DELETE FROM etudiant_valorisation_fichier WHERE id = ?').run(f.id);
  try { unlinkSync(f.chemin); } catch { /* */ }
  journaliser(f.valorisation_id, 'introduction', req, `pièce retirée en ligne : ${f.nom}`);
  res.json({ ok: true });
});

// ── 4. L'accusé de réception ───────────────────────────────────────────────
r.post('/terminer', etudiantConnecte, async (req, res) => {
  const e = req.etudiant;
  const annee = anneeActive();
  const d = demandesDe(e, annee);
  if (!d.length) return res.status(400).json({ error: "Aucune demande à confirmer." });
  const reference = `VA-${String(annee).replace(/^20(\d\d)-20(\d\d)$/, '$1$2')}-${e.id_ecampus || e.id}`;
  const quand = new Date().toLocaleString('fr-BE', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Brussels' });
  const lignes = d.map(x => `<li><b>UE ${x.ue_num}</b> ${esc(x.ue_nom || '')} — ${x.porte === 'vae' ? 'VAE' : 'VA'} — ${x.pieces.length} pièce(s)</li>`).join('');
  const adresse = e.email_ecole || e.email_perso;
  if (adresse) {
    const html = templateNotif({
      titre: `Accusé de réception — ${reference}`,
      corps: `<p>Bonjour ${esc(e.prenom || '')},</p>
        <p>Votre demande de valorisation des acquis est enregistrée (${esc(quand)}) :</p><ul>${lignes}</ul>
        <p>La suite se fait à l'école : le secrétariat vérifie que le dossier est complet et dans les délais, les chargés de cours
        rendent leur avis, le Conseil des études décide. La décision vous est notifiée par écrit.</p>
        <p>Tant que le secrétariat n'a pas examiné une unité, vous pouvez la compléter en redemandant un lien avec votre matricule.</p>`,
    });
    await envoyerEmail({ to: adresse, subject: `Institut Ilya Prigogine — accusé de réception ${reference}`, html }).catch(() => {});
  }
  res.json({ ok: true, reference, quand, demandes: d });
});

export default r;
