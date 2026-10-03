// ─────────────────────────────────────────────────────────────────────────────
// Lucie — LES CONVENTIONS SE PRÉPARENT À UN ENDROIT ET SE SIGNENT D'UN CLIC
//
// (Charles, 3 octobre 2026 : « les conventions avec les lieux de stage, je dois
// les signer en manuel… c'est long. Un clic sur une case vaudrait mon accord et
// permettrait de mettre ma griffe. »)
//
// DEUX MAINS, DEUX GESTES. La coordination ou le secrétariat PRÉPARE : dépose le
// PDF de la convention (celui du lieu, ou plus tard le nôtre), rattaché à un
// stage — d'où l'étudiant, le lieu, la section et l'année se déduisent. La
// direction SIGNE : un clic, et le fac-similé PROTÉGÉ (services/filigrane.js —
// la signature traversée par l'Institut, la pièce, le destinataire, la date et
// la référence) se pose en bas de la dernière page. La signature ne sort
// jamais nue : faute de fac-similé, on REFUSE de signer.
//
// CELUI QUI CLIQUE EST CELUI QUI SIGNE. Seul le signataire de l'établissement
// (identiteEtablissement().directeur) peut signer, et il signe en son nom :
// un rôle de direction ne suffit pas — la direction adjointe ne pose pas la
// griffe du directeur. Le compte connecté doit ÊTRE cette personne.
//
// L'ÉTAT SE DÉDUIT DES TRACES : déposée (depose_le) → signée par l'IIP
// (signe_le) → retirée (retire_le). Le journal est en ajout seul ; l'original
// reçu n'est jamais modifié, la version signée est un second fichier.
//
// LE MODÈLE IIP : les modèles de convention par section ne sont pas encore
// fournis. Le chemin est prêt (composerConventionIIP), il ne compose rien —
// on n'invente pas le texte d'une convention.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import multer from 'multer';
import { createHash } from 'crypto';
import { mkdirSync, openSync, readSync, closeSync, unlinkSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import db from '../db/index.js';
import { authRequired, roleRequired, getUserSections, NIVEAU_DIRECTION } from '../middleware/auth.js';
import { identiteEtablissement } from './config.js';
import { signatureFiligranee } from '../services/filigrane.js';
import { SIGNATURE_SOHET } from '../services/assets/signature_sohet.js';

const r = Router();
const DATA_DIR = process.env.DATA_DIR || '/app/data';

/** Préparer : déposer, retirer avant signature. Coordination dans ses sections. */
const PREPARER = ['admin', 'directeur', 'directeur_adjoint', 'secretariat', 'editeur', 'coordination'];

export const TYPES = {
  stage:              'Convention de stage',
  partenariat:        'Convention de partenariat',
  collaboration:      'Convention de collaboration',
  mise_a_disposition: 'Convention de mise à disposition',
};

export function migrerConventions(dbx = db) {
  dbx.exec(`
  CREATE TABLE IF NOT EXISTS convention (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    type                TEXT NOT NULL DEFAULT 'stage'
                          CHECK (type IN ('stage','partenariat','collaboration','mise_a_disposition')),
    annee_scolaire      TEXT,
    section             TEXT,
    stage_id            INTEGER,
    lieu_id             INTEGER,
    etudiant_id         INTEGER,
    objet               TEXT,
    origine             TEXT NOT NULL DEFAULT 'lieu' CHECK (origine IN ('lieu','iip')),
    fichier_nom         TEXT,
    fichier_chemin      TEXT,
    fichier_taille      INTEGER,
    depose_par_id       INTEGER,
    depose_par_nom      TEXT,
    depose_le           TEXT DEFAULT (datetime('now')),
    signe_le            TEXT,
    signe_par_id        INTEGER,
    signe_par_nom       TEXT,
    reference           TEXT,
    fichier_signe_chemin TEXT,
    retire_le           TEXT,
    retire_par          TEXT,
    motif_retrait       TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_convention_stage ON convention(stage_id);
  CREATE INDEX IF NOT EXISTS idx_convention_etudiant ON convention(etudiant_id);
  CREATE INDEX IF NOT EXISTS idx_convention_annee ON convention(annee_scolaire, section);

  -- EN AJOUT SEUL : aucune route ne modifie ni n'efface une ligne de ce journal.
  CREATE TABLE IF NOT EXISTS convention_journal (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    convention_id  INTEGER NOT NULL,
    horodatage     TEXT NOT NULL DEFAULT (datetime('now')),
    geste          TEXT NOT NULL,
    acteur_id      INTEGER,
    acteur_nom     TEXT,
    detail         TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_convention_journal ON convention_journal(convention_id);
  `);
  console.log('[migration] conventions : dépôt, signature, journal');
}

// ── Qui est connecté, et est-il le signataire ? ────────────────────────────
const mots = t => new Set(String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().split(/[^a-z0-9]+/).filter(x => x.length > 1));

function nomConnecte(req) {
  let nom = req.user?.nom || null;
  try {
    const u = db.prepare('SELECT nom_complet FROM utilisateur WHERE id = ?').get(req.user?.id);
    if (u?.nom_complet) nom = u.nom_complet;
  } catch { /* */ }
  return nom || req.user?.email || 'inconnu';
}

/**
 * LE SIGNATAIRE EST UNE PERSONNE, PAS UN RÔLE. Le compte doit porter le rôle
 * de direction ou d'administration (le compte de Charles est administrateur),
 * ET son nom doit contenir chacun des mots du signataire réglé dans
 * Configuration → Établissement (même lecture que estPersonneReference,
 * lib/circuitAR.js) — le nom du compte, ou celui de la fiche du personnel
 * qui lui est liée.
 */
export function estSignataire(user) {
  if (!user || !['admin', 'directeur'].includes(user.role) || user.preview) return false;
  const ref = mots(identiteEtablissement().directeur);
  if (!ref.size) return false;
  const lui = mots(user.nom || '');
  try {
    const u = db.prepare('SELECT nom_complet FROM utilisateur WHERE id = ?').get(user.id);
    for (const x of mots(u?.nom_complet)) lui.add(x);
    const p = db.prepare('SELECT p.nom, p.prenom FROM utilisateur u JOIN professeur p ON p.id = u.professeur_id WHERE u.id = ?').get(user.id);
    if (p) for (const x of mots(`${p.nom} ${p.prenom}`)) lui.add(x);
  } catch { /* colonne absente : le nom du jeton suffit */ }
  return [...ref].every(x => lui.has(x));
}

/** « SOHET Charles » (réglage, NOM d'abord) → « Charles SOHET » (pièce). */
function prenomNom(identite) {
  const t = String(identite || '').trim().split(/\s+/);
  const nom = t.filter(x => x === x.toUpperCase() && /[A-Z]/.test(x));
  const prenom = t.filter(x => !nom.includes(x));
  return nom.length && prenom.length ? `${prenom.join(' ')} ${nom.join(' ')}` : String(identite || '');
}

/**
 * La griffe du signataire. Lucie ne connaît aujourd'hui QU'UNE signature, celle
 * de Charles Sohet (services/assets/signature_sohet.js) — même règle que le
 * contrat (`/sohet/i`). Un autre signataire réglé sans image : pas de griffe,
 * donc pas de signature — jamais celle d'un autre.
 */
function parapheDuSignataire(directeur) {
  return /sohet/i.test(directeur || '') ? SIGNATURE_SOHET : null;
}

// ── Lectures ───────────────────────────────────────────────────────────────
function journaliser(cid, geste, req, detail) {
  db.prepare('INSERT INTO convention_journal (convention_id, geste, acteur_id, acteur_nom, detail) VALUES (?,?,?,?,?)')
    .run(cid, geste, req.user?.id ?? null, nomConnecte(req), detail ?? null);
}

export function etatConvention(c) {
  if (c.retire_le) return 'retiree';
  if (c.signe_le) return 'signee';
  return 'deposee';
}

const SELECT_CONVENTION = `
  SELECT c.*, e.nom AS etud_nom, e.prenom AS etud_prenom,
         l.nom AS lieu_nom, l.localite AS lieu_localite,
         s.date_debut, s.date_fin, s.ue_num,
         s.convention_le AS stage_convention_le, s.convention_ref AS stage_convention_ref
  FROM convention c
  LEFT JOIN etudiant e ON e.id = c.etudiant_id
  LEFT JOIN stage_lieu l ON l.id = c.lieu_id
  LEFT JOIN stage s ON s.id = c.stage_id`;

function habiller(c) {
  const { fichier_chemin, fichier_signe_chemin, ...reste } = c;
  return { ...reste, etat: etatConvention(c), a_original: !!fichier_chemin, a_signe: !!fichier_signe_chemin };
}

function charger(id) {
  return db.prepare(`${SELECT_CONVENTION} WHERE c.id = ?`).get(Number(id));
}

/** La convention est-elle dans le périmètre du demandeur ? (404 sinon, jamais 403) */
function permise(req, c) {
  const perim = getUserSections(req.user);
  if (perim === null) return true;
  return !!c.section && perim.includes(c.section);
}

/** Section d'un stage : celle du stage, sinon le rattachement de l'étudiant. */
function sectionDuStage(s) {
  if (s.section) return s.section;
  try {
    return db.prepare('SELECT section_rattachement FROM etudiant WHERE id = ?').get(s.etudiant_id)?.section_rattachement || null;
  } catch { return null; }
}

// ── Dépôt ──────────────────────────────────────────────────────────────────
function estPdf(chemin) {
  const b = Buffer.alloc(5);
  try { const fd = openSync(chemin, 'r'); const n = readSync(fd, b, 0, 5, 0); closeSync(fd); if (n < 5) return false; }
  catch { return false; }
  return b.toString('latin1', 0, 5) === '%PDF-';
}

const envoi = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      const dir = join(DATA_DIR, 'conventions');
      try { mkdirSync(dir, { recursive: true }); } catch { /* déjà là */ }
      cb(null, dir);
    },
    filename(req, file, cb) { cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.pdf`); },
  }),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter(req, file, cb) {
    if (file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname || '')) return cb(null, true);
    cb(new Error('La convention se dépose en PDF.'));
  },
});

/** Le modèle IIP, quand il sera fourni : rend un Buffer PDF, ou null. */
export function composerConventionIIP(/* stage */) {
  return null;   // modèles par section non fournis — rien n'est inventé
}

r.post('/composer', authRequired, roleRequired(...PREPARER), (req, res) => {
  const stage = db.prepare('SELECT * FROM stage WHERE id = ?').get(Number(req.body?.stage_id));
  if (!stage) return res.status(404).json({ error: 'Stage introuvable.' });
  const pdf = composerConventionIIP(stage);
  if (!pdf) {
    return res.status(501).json({
      error: "Le modèle IIP de convention n'est pas encore fourni pour cette section : "
           + "déposez la convention du lieu (PDF), ou celle que vous avez préparée vous-même.",
    });
  }
  return res.status(501).json({ error: 'Composition du modèle IIP non branchée.' });
});

r.post('/', authRequired, roleRequired(...PREPARER), (req, res) => {
  envoi.single('fichier')(req, res, err => {
    const jeter = () => { if (req.file) try { unlinkSync(req.file.path); } catch { /* */ } };
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop lourd (15 Mo au plus).' : err.message });
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });
    if (!estPdf(req.file.path)) { jeter(); return res.status(400).json({ error: "Ce fichier n'est pas un PDF valable." }); }

    const b = req.body || {};
    const type = b.type || 'stage';
    if (!TYPES[type]) { jeter(); return res.status(400).json({ error: 'Type de convention inconnu.' }); }
    const origine = b.origine === 'iip' ? 'iip' : 'lieu';

    let stage = null, section = b.section || null, lieuId = b.lieu_id ? Number(b.lieu_id) : null,
        etudiantId = null, annee = b.annee_scolaire || req.headers['x-annee'] || null;
    if (b.stage_id) {
      stage = db.prepare('SELECT * FROM stage WHERE id = ?').get(Number(b.stage_id));
      if (!stage) { jeter(); return res.status(404).json({ error: 'Stage introuvable.' }); }
      section = sectionDuStage(stage);
      lieuId = stage.lieu_id;
      etudiantId = stage.etudiant_id;
      annee = stage.annee_scolaire;
    } else if (type === 'stage') {
      jeter(); return res.status(400).json({ error: 'Une convention de stage se rattache à un stage.' });
    }
    if (!lieuId) {
      jeter();
      return res.status(400).json({ error: stage
        ? "Le lieu de ce stage n'est pas encore choisi : la convention se signe avec un lieu."
        : 'Choisissez le lieu avec lequel la convention est passée.' });
    }
    const perim = getUserSections(req.user);
    if (perim !== null && (!section || !perim.includes(section))) {
      jeter();
      return res.status(403).json({ error: section ? 'Section hors de votre périmètre.'
        : "Ce stage n'a pas de section : la direction ou le secrétariat dépose sa convention." });
    }
    // Une convention de stage en attente ou signée par stage : on ne superpose pas deux versions.
    if (stage) {
      const deja = db.prepare('SELECT id, signe_le FROM convention WHERE stage_id = ? AND retire_le IS NULL').get(stage.id);
      if (deja) {
        jeter();
        return res.status(409).json({ error: deja.signe_le
          ? 'Ce stage a déjà une convention signée. La direction peut la retirer (motif écrit) avant d’en déposer une autre.'
          : 'Ce stage a déjà une convention en attente de signature : retirez-la d’abord pour la remplacer.' });
      }
    }

    const nom = nomConnecte(req);
    const nomFichier = String(req.file.originalname || 'convention.pdf').replace(/[\\/]+/g, '_').slice(0, 180);
    const info = db.prepare(`INSERT INTO convention
      (type, annee_scolaire, section, stage_id, lieu_id, etudiant_id, objet, origine,
       fichier_nom, fichier_chemin, fichier_taille, depose_par_id, depose_par_nom)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(type, annee, section, stage?.id ?? null, lieuId, etudiantId, b.objet || null, origine,
           nomFichier, req.file.path, req.file.size, req.user?.id ?? null, nom);
    const id = Number(info.lastInsertRowid);
    const empreinte = createHash('sha256').update(readFileSync(req.file.path)).digest('hex');
    journaliser(id, 'depot', req, `${TYPES[type]} déposée (${origine === 'iip' ? 'modèle IIP' : 'document du lieu'}) : ${nomFichier}, sha256 ${empreinte.slice(0, 16)}…`);
    res.json({ ok: true, id, convention: habiller(charger(id)) });
  });
});

// ── Listes ────────────────────────────────────────────────────────────────
r.get('/', authRequired, (req, res) => {
  const q = req.query;
  const clauses = [], params = [];
  if (q.annee) { clauses.push('c.annee_scolaire = ?'); params.push(q.annee); }
  if (q.section) { clauses.push('c.section = ?'); params.push(q.section); }
  if (q.stage_id) { clauses.push('c.stage_id = ?'); params.push(Number(q.stage_id)); }
  if (q.etudiant_id) { clauses.push('c.etudiant_id = ?'); params.push(Number(q.etudiant_id)); }
  if (q.etat === 'deposee') clauses.push('c.signe_le IS NULL AND c.retire_le IS NULL');
  if (q.etat === 'signee') clauses.push('c.signe_le IS NOT NULL AND c.retire_le IS NULL');
  if (q.etat === 'retiree') clauses.push('c.retire_le IS NOT NULL');
  const perim = getUserSections(req.user);
  if (perim !== null) {
    if (q.section && !perim.includes(q.section)) return res.status(403).json({ error: 'Section hors de votre périmètre.' });
    clauses.push(perim.length ? `c.section IN (${perim.map(() => '?').join(',')})` : '0');
    params.push(...perim);
  }
  const rows = db.prepare(`${SELECT_CONVENTION} ${clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''}
    ORDER BY c.depose_le DESC`).all(...params);
  res.json({ conventions: rows.map(habiller), types: TYPES });
});

/** Ce qui attend la griffe — vide pour qui n'est pas le signataire. */
r.get('/a-signer', authRequired, (req, res) => {
  const signataire = estSignataire(req.user);
  if (!signataire) return res.json({ signataire: false, conventions: [] });
  const rows = db.prepare(`${SELECT_CONVENTION} WHERE c.signe_le IS NULL AND c.retire_le IS NULL
    ORDER BY c.depose_le`).all();
  res.json({ signataire: true, directeur: identiteEtablissement().directeur, conventions: rows.map(habiller) });
});

r.get('/:id/journal', authRequired, (req, res) => {
  const c = charger(req.params.id);
  if (!c || !permise(req, c)) return res.status(404).json({ error: 'Convention introuvable.' });
  res.json({ journal: db.prepare('SELECT * FROM convention_journal WHERE convention_id = ? ORDER BY id').all(c.id) });
});

r.get('/:id/fichier', authRequired, (req, res) => {
  const c = charger(req.params.id);
  if (!c || !permise(req, c)) return res.status(404).json({ error: 'Convention introuvable.' });
  const signe = req.query.version === 'signe';
  const chemin = signe ? c.fichier_signe_chemin : c.fichier_chemin;
  if (!chemin || !existsSync(chemin)) return res.status(404).json({ error: signe ? 'Pas encore de version signée.' : 'Fichier introuvable.' });
  const base = String(c.fichier_nom || 'convention.pdf').replace(/\.pdf$/i, '');
  const nom = signe ? `${base}_signe_${c.reference || ''}.pdf` : `${base}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(nom)}`);
  res.send(readFileSync(chemin));
});

// ── Retirer : avant signature, on efface ; après, la direction retire ──────
r.delete('/:id', authRequired, roleRequired(...PREPARER), (req, res) => {
  const c = charger(req.params.id);
  if (!c || !permise(req, c)) return res.status(404).json({ error: 'Convention introuvable.' });
  if (c.signe_le) {
    return res.status(409).json({ error: 'Une convention signée ne se supprime pas : la direction peut la retirer, avec un motif écrit.' });
  }
  const qui = [c.etud_nom && `${String(c.etud_nom).toUpperCase()} ${c.etud_prenom || ''}`.trim(), c.lieu_nom].filter(Boolean).join(' · ');
  journaliser(c.id, 'suppression', req, `supprimée avant signature : ${c.fichier_nom}${qui ? ` (${qui})` : ''}`);
  db.prepare('DELETE FROM convention WHERE id = ?').run(c.id);
  try { unlinkSync(c.fichier_chemin); } catch { /* déjà parti */ }
  res.json({ ok: true });
});

r.post('/:id/retirer', authRequired, roleRequired(...NIVEAU_DIRECTION), (req, res) => {
  const c = charger(req.params.id);
  if (!c) return res.status(404).json({ error: 'Convention introuvable.' });
  if (!c.signe_le) return res.status(409).json({ error: 'Une convention non signée se supprime simplement.' });
  if (c.retire_le) return res.status(409).json({ error: 'Cette convention est déjà retirée.' });
  const motif = String(req.body?.motif || '').trim();
  if (motif.length < 5) return res.status(400).json({ error: 'Le retrait d’une convention signée se motive par écrit.' });
  const nom = nomConnecte(req);
  db.transaction(() => {
    db.prepare("UPDATE convention SET retire_le = datetime('now'), retire_par = ?, motif_retrait = ? WHERE id = ?").run(nom, motif, c.id);
    journaliser(c.id, 'retrait', req, motif);
    // La date de convention que NOUS avions portée au stage tombe avec elle.
    if (c.stage_id && c.stage_convention_ref && c.stage_convention_ref === c.reference) {
      db.prepare("UPDATE stage SET convention_le = NULL, convention_ref = NULL, maj_le = datetime('now') WHERE id = ?").run(c.stage_id);
      journaliser(c.id, 'stage', req, `date de convention retirée du stage ${c.stage_id}`);
    }
  })();
  res.json({ ok: true });
});

// ── Signer ─────────────────────────────────────────────────────────────────
const MM = 72 / 25.4;
const dateFr = d => d.toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const anneeCourte = a => { const m = /^(\d{4})-(\d{4})$/.exec(a || ''); return m ? m[1].slice(2) + m[2].slice(2) : 'XXXX'; };
export const referenceConvention = c => `CONV-${anneeCourte(c.annee_scolaire)}-${c.id}`;

/**
 * Pose le cartouche en bas à droite de la DERNIÈRE page (70 × 32 mm, au-dessus
 * de la marge basse). Si la page est pleine, il s'y pose quand même : c'est le
 * défaut convenu, l'original reste intact à côté.
 */
async function apposer(pdfOriginal, { filigranePng, signataire, qualite, jour, reference, etablissement }) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.load(pdfOriginal, { ignoreEncryption: false, updateMetadata: false });
  const pages = doc.getPages();
  const page = pages[pages.length - 1];
  const crop = page.getCropBox();
  const fN = await doc.embedFont(StandardFonts.Helvetica);
  const fB = await doc.embedFont(StandardFonts.HelveticaBold);
  const img = await doc.embedPng(filigranePng);

  const L = 70 * MM, H = 32 * MM;
  const x = crop.x + crop.width - L - 15 * MM;
  const y = crop.y + 14 * MM;
  const marine = rgb(0x16 / 255, 0x40 / 255, 0x6A / 255);
  page.drawRectangle({ x, y, width: L, height: H, color: rgb(1, 1, 1), opacity: 0.92,
    borderColor: marine, borderWidth: 0.6 });
  let ty = y + H - 3 * MM - 6;
  const ligne = (t, f, s, c = marine) => { page.drawText(t, { x: x + 2.5 * MM, y: ty, size: s, font: f, color: c }); ty -= s + 1.6; };
  ligne(`Pour l'${etablissement}`, fB, 6.8);
  ligne(`${signataire}, ${qualite}`, fN, 6.8);
  ligne(`Lu et approuvé le ${jour}`, fN, 6.8);
  // Le fac-similé, à proportion (600 × 280), dans ce qui reste du cadre.
  const hImg = ty - (y + 4 * MM) + 4;
  const wImg = Math.min(L - 5 * MM, hImg * 600 / 280);
  page.drawImage(img, { x: x + (L - wImg) / 2, y: y + 3.6 * MM, width: wImg, height: wImg * 280 / 600 });
  page.drawText(`réf. ${reference}`, { x: x + 2.5 * MM, y: y + 1.4 * MM, size: 5.2, font: fN, color: rgb(0.45, 0.48, 0.53) });
  doc.setModificationDate(new Date());
  return Buffer.from(await doc.save());
}

r.post('/signer', authRequired, async (req, res) => {
  const identite = identiteEtablissement();
  if (!estSignataire(req.user)) {
    return res.status(403).json({
      error: `Seul le signataire de l'établissement (${identite.directeur}) signe les conventions, `
           + 'depuis son propre compte : la griffe engage une personne, pas un rôle.',
    });
  }
  const ids = [...new Set((Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter(Boolean))];
  if (!ids.length) return res.status(400).json({ error: 'Cochez au moins une convention.' });

  const conventions = ids.map(id => charger(id));
  const bloquants = [];
  conventions.forEach((c, i) => {
    if (!c) bloquants.push(`n° ${ids[i]} introuvable`);
    else if (c.retire_le) bloquants.push(`n° ${c.id} retirée`);
    else if (c.signe_le) bloquants.push(`n° ${c.id} déjà signée le ${String(c.signe_le).slice(0, 10)}`);
    else if (!c.fichier_chemin || !existsSync(c.fichier_chemin)) bloquants.push(`n° ${c.id} : fichier introuvable`);
  });
  if (bloquants.length) return res.status(409).json({ error: `Rien n'a été signé : ${bloquants.join(' ; ')}.`, bloquants });

  const paraphe = parapheDuSignataire(identite.directeur);
  if (!paraphe) {
    return res.status(409).json({ error: `Aucune signature n'est enregistrée pour ${identite.directeur} : rien n'a été signé.` });
  }

  const maintenant = new Date();
  const jour = dateFr(maintenant);
  const iso = maintenant.toISOString().slice(0, 10);
  const signataire = prenomNom(identite.directeur);
  const nomSignataire = nomConnecte(req);

  // TOUT OU RIEN : les fichiers signés se composent d'abord, la base s'écrit
  // ensuite d'un seul geste. Un fac-similé impossible arrête tout.
  const prets = [];
  try {
    for (const c of conventions) {
      const reference = referenceConvention(c);
      const fil = await signatureFiligranee(paraphe, {
        piece: TYPES[c.type] || 'Convention', destinataire: c.lieu_nom || null, date: jour, reference });
      if (!fil) throw new Error('le fac-similé protégé n’a pas pu être dessiné (moteur de rendu indisponible) — une signature ne sort jamais nue');
      let signe;
      try {
        signe = await apposer(readFileSync(c.fichier_chemin), { filigranePng: fil, signataire, qualite: 'Directeur',
          jour, reference, etablissement: identite.nom || 'Institut Ilya Prigogine' });
      } catch (e) {
        throw new Error(`n° ${c.id} (${c.fichier_nom}) : PDF illisible ou protégé — ${e.message}`);
      }
      const chemin = c.fichier_chemin.replace(/\.pdf$/i, '') + `_signe_${reference}.pdf`;
      writeFileSync(chemin, signe);
      prets.push({ c, reference, chemin, empreinte: createHash('sha256').update(signe).digest('hex') });
    }
  } catch (e) {
    for (const p of prets) { try { unlinkSync(p.chemin); } catch { /* */ } }
    return res.status(409).json({ error: `Rien n'a été signé : ${e.message}.` });
  }

  try {
    db.transaction(() => {
      for (const { c, reference, chemin, empreinte } of prets) {
        const n = db.prepare(`UPDATE convention SET signe_le = datetime('now'), signe_par_id = ?, signe_par_nom = ?,
          reference = ?, fichier_signe_chemin = ? WHERE id = ? AND signe_le IS NULL AND retire_le IS NULL`)
          .run(req.user.id ?? null, nomSignataire, reference, chemin, c.id).changes;
        if (!n) throw new Error(`n° ${c.id} a changé pendant la signature`);
        journaliser(c.id, 'signature', req, `signée pour l'IIP par ${nomSignataire} (fac-similé protégé), réf. ${reference}, sha256 ${empreinte.slice(0, 16)}…`);
        if (c.stage_id) {
          const s = db.prepare('SELECT convention_le, convention_ref FROM stage WHERE id = ?').get(c.stage_id);
          if (s && !s.convention_le) {
            db.prepare("UPDATE stage SET convention_le = ?, convention_ref = COALESCE(convention_ref, ?), maj_le = datetime('now') WHERE id = ?")
              .run(iso, reference, c.stage_id);
            journaliser(c.id, 'stage', req, `stage ${c.stage_id} : convention signée le ${jour}, réf. ${reference}`);
          } else if (s) {
            journaliser(c.id, 'stage', req, `stage ${c.stage_id} : date de convention déjà portée (${s.convention_le}${s.convention_ref ? `, réf. ${s.convention_ref}` : ''}) — laissée telle quelle`);
          }
        }
      }
    })();
  } catch (e) {
    for (const p of prets) { try { unlinkSync(p.chemin); } catch { /* */ } }
    return res.status(409).json({ error: `Rien n'a été signé : ${e.message}.` });
  }

  res.json({ ok: true, signees: prets.length, references: prets.map(p => p.reference) });
});

export default r;
