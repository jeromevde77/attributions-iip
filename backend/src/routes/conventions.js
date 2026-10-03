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
// LES MODÈLES IIP (3 octobre 2026) : trois familles se composent dans Lucie —
// convention-cadre de stage, partenariat pédagogique, convention entre
// établissements — depuis un texte versionné que la direction corrige
// (lib/modelesConvention.js) ; la quatrième, le document du partenaire, se
// dépose. Le PDF composé devient le fichier de la convention (origine 'iip'),
// déposée, et part à la signature comme une autre — la griffe se pose alors
// dans la case réservée de la colonne de l'Institut.
//
// LE REGISTRE EST UNE FACE DE DOCUMENTATION, ET SON ACCÈS SE GARDE ICI : lire
// et préparer = direction, secrétariat, coordination (ses sections) ;
// signer = le signataire seul ; enseignants et étudiants : le serveur refuse
// (gestes « conventions.* », lib/gestes.js) — cacher la face ne suffit pas.
//
// LA MISE À DISPOSITION DE LOCAUX N'EST PAS UNE AFFAIRE DE LUCIE : la HELB en
// est le référent (Charles, 3 octobre 2026). Le type reste lisible pour ce
// qui aurait été déposé, il ne se dépose plus.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import multer from 'multer';
import { createHash } from 'crypto';
import { mkdirSync, openSync, readSync, closeSync, unlinkSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import db from '../db/index.js';
import { authRequired, roleRequired, getUserSections, NIVEAU_DIRECTION } from '../middleware/auth.js';
import { identiteEtablissement } from './config.js';
import { piedDocument } from './parametres.js';
import { signatureFiligranee } from '../services/filigrane.js';
import { SIGNATURE_SOHET } from '../services/assets/signature_sohet.js';
import { LOGO_IIP_JPEG } from '../services/assets/logo_iip_jpeg.js';
import { capacitePdf, rendrePdf } from '../services/pdf.js';
import { envelopperDocument, piedGabaritPdf, BANDE_PIED_MM } from '../lib/document.js';
import { gesteRequis, gesteAutorise } from '../lib/gestes.js';
import { assainir, estVide } from '../lib/texteCorpus.js';
import {
  FAMILLES, CHAMPS, REQUIS, LIBELLE_CHAMP, SEMENCES, MARQUE_CACHET, STYLES_CONVENTION,
  jetonsInconnus, remplirModele, blocSignatures,
} from '../lib/modelesConvention.js';

const r = Router();
const DATA_DIR = process.env.DATA_DIR || '/app/data';

/* Lire le registre et PRÉPARER (déposer, composer, retirer avant signature,
 * déposer l'exemplaire contresigné) : direction, secrétariat, coordination dans
 * ses sections — gestes « conventions.lire » et « conventions.preparer ».
 * Corriger un modèle : la direction — « conventions.modeles ». */

export const TYPES = {
  stage:              'Convention de stage',
  partenariat:        'Convention de partenariat',
  collaboration:      'Convention de collaboration',
  mise_a_disposition: 'Convention de mise à disposition',   // héritage : la HELB est le référent
};
/** Ce qu'un document du partenaire peut être. */
const TYPES_DEPOT = ['stage', 'partenariat', 'collaboration'];

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

  -- LES PARTENAIRES qui ne sont pas des lieux de stage (une école, une unité de
  -- formation continue…). Un lieu de stage reste dans stage_lieu.
  CREATE TABLE IF NOT EXISTS convention_partenaire (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    nom             TEXT NOT NULL,
    sigle           TEXT,
    adresse         TEXT,
    representant    TEXT,
    fonction        TEXT,
    tel             TEXT,
    email           TEXT,
    po              TEXT,
    num_entreprise  TEXT,
    cree_par        TEXT,
    cree_le         TEXT DEFAULT (datetime('now')),
    maj_le          TEXT
  );

  -- LES MODÈLES, EN AJOUT SEUL : une version publiée ne se modifie plus ;
  -- corriger, c'est publier la suivante en disant ce qui change.
  CREATE TABLE IF NOT EXISTS convention_modele (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    famille       TEXT NOT NULL,
    version       INTEGER NOT NULL,
    texte_html    TEXT NOT NULL,
    publie_le     TEXT NOT NULL DEFAULT (datetime('now')),
    publie_par    TEXT,
    publie_par_id INTEGER,
    note          TEXT,
    UNIQUE (famille, version)
  );
  `);
  const cols = new Set(dbx.prepare('PRAGMA table_info(convention)').all().map(c => c.name));
  const ajouter = (nom, def) => { if (!cols.has(nom)) dbx.exec(`ALTER TABLE convention ADD COLUMN ${nom} ${def}`); };
  ajouter('famille', 'TEXT');                    // cadre_stage | partenariat | etablissements | partenaire
  ajouter('partenaire_id', 'INTEGER');           // convention_partenaire
  ajouter('sections', 'TEXT');                   // '|TIM|Optométrie|' — la convention-cadre en porte plusieurs
  ajouter('periode_debut', 'TEXT');
  ajouter('periode_fin', 'TEXT');
  ajouter('tacite', 'INTEGER NOT NULL DEFAULT 0');
  ajouter('donnees', 'TEXT');                    // ce que le formulaire a saisi (JSON)
  ajouter('modele_version_id', 'INTEGER');       // la version du modèle qui l'a composée
  ajouter('cachet', 'TEXT');                     // la case de la griffe dans le PDF composé (JSON)
  ajouter('contresigne_le', 'TEXT');
  ajouter('contresigne_par_id', 'INTEGER');
  ajouter('contresigne_par_nom', 'TEXT');
  ajouter('fichier_contresigne_chemin', 'TEXT');
  ajouter('fichier_contresigne_nom', 'TEXT');
  // Ce qui a été déposé avant les familles était un document du partenaire.
  dbx.exec("UPDATE convention SET famille = 'partenaire' WHERE famille IS NULL");
  // Le représentant d'un lieu de stage n'est pas toujours son contact.
  try {
    const cl = new Set(dbx.prepare('PRAGMA table_info(stage_lieu)').all().map(c => c.name));
    if (cl.size && !cl.has('representant')) dbx.exec('ALTER TABLE stage_lieu ADD COLUMN representant TEXT');
    if (cl.size && !cl.has('representant_fonction')) dbx.exec('ALTER TABLE stage_lieu ADD COLUMN representant_fonction TEXT');
  } catch { /* stage_lieu absente : migrerStages la crée avant */ }
  // Les textes de départ, une fois.
  for (const [famille, s] of Object.entries(SEMENCES)) {
    const deja = dbx.prepare('SELECT 1 FROM convention_modele WHERE famille = ?').get(famille);
    if (!deja) {
      dbx.prepare(`INSERT INTO convention_modele (famille, version, texte_html, publie_par, note)
        VALUES (?, 1, ?, 'Lucie — reprise du modèle Word', ?)`).run(famille, assainir(s.texte), s.note);
    }
  }
  console.log('[migration] conventions : dépôt, signature, journal, modèles, partenaires');
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

/** L'état se lit des traces, dans l'ordre inverse du circuit. */
export function etatConvention(c) {
  if (c.retire_le) return 'retiree';
  if (c.contresigne_le) return 'contresignee';
  if (c.signe_le) return 'signee';
  return 'deposee';
}

/**
 * L'ÉCHÉANCE SE DÉDUIT. Une date de fin écrite fait foi ; une convention
 * renouvelée tacitement chaque année (la convention-cadre de stage) arrive à
 * son terme annuel le 31 août de son année académique — elle se renouvelle,
 * mais c'est le moment de la relire. Sans l'une ni l'autre : pas d'échéance.
 */
export function echeanceConvention(c) {
  if (c.periode_fin) return String(c.periode_fin).slice(0, 10);
  const m = /^(\d{4})-(\d{4})$/.exec(c.annee_scolaire || '');
  if (c.tacite && m) return `${m[2]}-08-31`;
  return null;
}
const aujourdhuiIso = () => new Date().toISOString().slice(0, 10);

const SELECT_CONVENTION = `
  SELECT c.*, e.nom AS etud_nom, e.prenom AS etud_prenom,
         l.nom AS lieu_nom, l.localite AS lieu_localite,
         pt.nom AS partenaire_nom, pt.sigle AS partenaire_sigle,
         s.date_debut, s.date_fin, s.ue_num,
         s.convention_le AS stage_convention_le, s.convention_ref AS stage_convention_ref
  FROM convention c
  LEFT JOIN etudiant e ON e.id = c.etudiant_id
  LEFT JOIN stage_lieu l ON l.id = c.lieu_id
  LEFT JOIN convention_partenaire pt ON pt.id = c.partenaire_id
  LEFT JOIN stage s ON s.id = c.stage_id`;

function habiller(c) {
  const { fichier_chemin, fichier_signe_chemin, fichier_contresigne_chemin, cachet, donnees, ...reste } = c;
  const echeance = echeanceConvention(c);
  let d = null;
  try { d = donnees ? JSON.parse(donnees) : null; } catch { /* */ }
  return {
    ...reste,
    famille: c.famille || 'partenaire',
    partenaire: c.partenaire_nom || c.lieu_nom || null,
    sections_liste: String(c.sections || '').split('|').filter(Boolean),
    donnees: d,
    etat: etatConvention(c),
    echeance,
    echue: !c.retire_le && !!echeance && echeance < aujourdhuiIso(),
    a_original: !!fichier_chemin, a_signe: !!fichier_signe_chemin, a_contresigne: !!fichier_contresigne_chemin,
  };
}

function charger(id) {
  return db.prepare(`${SELECT_CONVENTION} WHERE c.id = ?`).get(Number(id));
}

const sectionsDe = c => [c.section, ...String(c.sections || '').split('|')].filter(Boolean);

/** La convention est-elle dans le périmètre du demandeur ? (404 sinon, jamais 403)
 *  Une convention-cadre porte plusieurs cursus : une seule section suffit. */
function permise(req, c) {
  const perim = getUserSections(req.user);
  if (perim === null) return true;
  return sectionsDe(c).some(x => perim.includes(x));
}

/** La même règle, en SQL, pour les listes. */
function clausePerimetre(perim) {
  if (perim === null) return null;
  if (!perim.length) return { sql: '0', params: [] };
  return {
    sql: `(c.section IN (${perim.map(() => '?').join(',')}) OR ${perim.map(() => "c.sections LIKE ?").join(' OR ')})`,
    params: [...perim, ...perim.map(x => `%|${x}|%`)],
  };
}

/** Section d'un stage : celle du stage, sinon le rattachement de l'étudiant. */
function sectionDuStage(s) {
  if (s.section) return s.section;
  try {
    return db.prepare('SELECT section_rattachement FROM etudiant WHERE id = ?').get(s.etudiant_id)?.section_rattachement || null;
  } catch { return null; }
}

// ── Dépôt ──────────────────────────────────────────────────────────────────
/* LE NOM DU FICHIER, EN UTF-8. Multer rend le nom d'origine décodé en latin-1 :
   « Pôle » devenait « PÃ´le » au registre et au journal. */
function nomOrigine(file, defaut) {
  let n = String(file?.originalname || defaut);
  try { const u = Buffer.from(n, 'latin1').toString('utf8'); if (!u.includes('\uFFFD') && u !== n) n = u; } catch { /* */ }
  return n.replace(/[\\/]+/g, '_').slice(0, 180);
}

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

// ── Petites écritures ──────────────────────────────────────────────────────
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
              'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const isoValide = t => /^\d{4}-\d{2}-\d{2}$/.test(String(t || '').slice(0, 10));
/** « 2026-12-01 » → « 1er décembre 2026 » */
function dateLongue(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  if (!m) return '';
  const j = Number(m[3]);
  return `${j === 1 ? '1er' : j} ${MOIS[Number(m[2]) - 1]} ${m[1]}`;
}
/** « 2026-12-08 » → « mardi 8 décembre 2026 » */
function jourLong(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  if (!m) return '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return `${JOURS[d.getUTCDay()]} ${dateLongue(iso)}`;
}
/** « +3225602959 » → « 02 560 29 59 » ; le reste tel quel. */
function telFr(t) {
  const brut = String(t || '').trim();
  const ch = brut.replace(/[^\d+]/g, '');
  if (!/^(\+32|0032|0)\d{8,9}$/.test(ch)) return brut;
  const n = '0' + ch.replace(/^(\+32|0032|0)/, '');
  if (n.length === 9) return `${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5, 7)} ${n.slice(7)}`;
  return `${n.slice(0, 4)} ${n.slice(4, 6)} ${n.slice(6, 8)} ${n.slice(8)}`;
}
const listeFr = l => (l.length <= 1 ? (l[0] || '') : `${l.slice(0, -1).join(', ')} et ${l[l.length - 1]}`);
const sansAccents = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const nomDeFichier = t => sansAccents(t).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
const estVideValeur = v => v == null || (Array.isArray(v) ? !v.length : !String(v).trim());
const net = v => (v == null ? '' : String(v).trim());

/** Le libellé d'un cursus : « Bachelier technologue en imagerie médicale (TIM) ». */
function libelleSection(s) {
  const lib = net(s.libelle) || s.code;
  if (lib.toLowerCase() === String(s.code).toLowerCase()) return s.code;
  return lib.toLowerCase().includes(String(s.code).toLowerCase()) ? lib : `${lib} (${s.code})`;
}

function anneeActive() {
  try { return db.prepare('SELECT code FROM annee_scolaire WHERE active = 1 ORDER BY code DESC LIMIT 1').get()?.code || null; }
  catch { return null; }
}

// ── Les modèles ────────────────────────────────────────────────────────────
const dernierModele = famille => db.prepare(
  'SELECT * FROM convention_modele WHERE famille = ? ORDER BY version DESC LIMIT 1').get(famille);

r.get('/modeles', authRequired, gesteRequis('conventions.lire'), (req, res) => {
  const familles = Object.entries(FAMILLES).map(([cle, f]) => {
    const courant = f.modele ? dernierModele(cle) : null;
    return {
      cle, libelle: f.libelle, modele: f.modele, tacite: !!f.tacite,
      champs: (CHAMPS[cle] || []).map(([c, l, bloc]) => ({ cle: c, libelle: l, bloc: !!bloc,
        requis: (REQUIS[cle] || []).includes(c) })),
      courant: courant ? { id: courant.id, version: courant.version, texte_html: courant.texte_html,
        publie_le: courant.publie_le, publie_par: courant.publie_par, note: courant.note } : null,
      versions: f.modele ? db.prepare(`SELECT id, version, publie_le, publie_par, note FROM convention_modele
        WHERE famille = ? ORDER BY version DESC`).all(cle) : [],
    };
  });
  res.json({ familles, types_depot: TYPES_DEPOT.map(t => ({ cle: t, libelle: TYPES[t] })) });
});

r.get('/modeles/version/:id', authRequired, gesteRequis('conventions.lire'), (req, res) => {
  const v = db.prepare('SELECT * FROM convention_modele WHERE id = ?').get(Number(req.params.id));
  if (!v) return res.status(404).json({ error: 'Version introuvable.' });
  res.json({ version: v });
});

/**
 * PUBLIER UNE VERSION — jamais réécrire la précédente. Une convention déjà
 * composée garde le texte qui l'a produite ; elle a pu être signée sur lui.
 */
r.post('/modeles/:famille', authRequired, gesteRequis('conventions.modeles'), (req, res) => {
  const famille = req.params.famille;
  if (!FAMILLES[famille]?.modele) return res.status(404).json({ error: 'Cette famille n’a pas de modèle : ses conventions se déposent.' });
  const texte = assainir(req.body?.texte_html);
  if (estVide(texte)) return res.status(400).json({ error: 'Le texte est vide.' });
  const note = net(req.body?.note);
  if (note.length < 5) return res.status(400).json({ error: 'Dites ce qui change : la note accompagne la version.' });
  const inconnus = jetonsInconnus(famille, texte);
  if (inconnus.length) {
    return res.status(400).json({ error: `Champ(s) inconnu(s) dans le texte : ${inconnus.map(j => `{{${j}}}`).join(', ')}. `
      + 'Ils s’imprimeraient tels quels sur la convention.' });
  }
  const courant = dernierModele(famille);
  if (courant && courant.texte_html === texte) return res.status(409).json({ error: 'Le texte est identique à la version publiée.' });
  const version = (courant?.version || 0) + 1;
  db.prepare(`INSERT INTO convention_modele (famille, version, texte_html, publie_par, publie_par_id, note)
    VALUES (?,?,?,?,?,?)`).run(famille, version, texte, nomConnecte(req), req.user?.id ?? null, note);
  res.json({ ok: true, version });
});

r.get('/partenaires', authRequired, gesteRequis('conventions.lire'), (req, res) => {
  res.json({ partenaires: db.prepare('SELECT * FROM convention_partenaire ORDER BY nom').all() });
});

// ── Composer ───────────────────────────────────────────────────────────────
const TITRES = {
  cadre_stage: 'Convention-cadre de stage',
  partenariat: 'Convention de partenariat',
  etablissements: 'Convention-cadre',
};

/**
 * Tout ce qu'il faut pour composer, ou ce qui l'empêche. La même fonction sert
 * l'aperçu et la composition : ce qu'on voit est ce qui s'écrira.
 */
function preparerComposition(b, req) {
  const famille = b.famille;
  const F = FAMILLES[famille];
  if (!F?.modele) return { status: 400, error: 'Famille inconnue, ou qui se dépose (document du partenaire).' };
  const modele = dernierModele(famille);
  if (!modele) return { status: 409, error: 'Aucun modèle publié pour cette famille.' };
  const inconnus = jetonsInconnus(famille, modele.texte_html);
  if (inconnus.length) return { status: 409, error: `Le modèle cite des champs inconnus : ${inconnus.join(', ')}.` };

  const annee = net(b.annee_scolaire) || net(req.headers['x-annee']) || anneeActive();
  if (!/^\d{4}-\d{4}$/.test(annee || '')) return { status: 400, error: 'Année académique attendue (2026-2027).' };
  const d = b.donnees || {};
  const p = {};
  for (const k of ['nom', 'sigle', 'adresse', 'representant', 'fonction', 'tel', 'email', 'po']) p[k] = net(b.partenaire?.[k]);

  let lieu = null;
  if (famille === 'cadre_stage') {
    lieu = db.prepare('SELECT * FROM stage_lieu WHERE id = ?').get(Number(b.lieu_id));
    if (!lieu) return { status: 400, error: 'Choisissez le lieu de stage dans la liste.' };
    if (!p.nom) p.nom = lieu.nom;
  }
  if (!p.sigle) p.sigle = p.nom;

  // L'INSTITUT : Configuration → Établissement, jamais le texte.
  const identite = identiteEtablissement();
  let etab = {};
  try { etab = db.prepare('SELECT * FROM etablissement LIMIT 1').get() || {}; } catch { /* */ }
  const iip = {
    'iip.nom': identite.nom,
    'iip.adresse': identite.adresse,
    'iip.representant': prenomNom(identite.directeur),
    'iip.qualite': 'Directeur',
    'iip.tel': telFr(identite.tel),
    'iip.email': etab.email_contact || etab.gest_email || '',
    'iip.po': [etab.po_nom, etab.num_entreprise ? `n° d’entreprise ${etab.num_entreprise}` : null].filter(Boolean).join(', '),
    'iip.ville': identite.ville,
  };

  const periodeDebut = isoValide(b.periode_debut) ? String(b.periode_debut).slice(0, 10) : null;
  const periodeFin = isoValide(b.periode_fin) ? String(b.periode_fin).slice(0, 10) : null;
  if (periodeDebut && periodeFin && periodeFin < periodeDebut) {
    return { status: 400, error: 'La fin de la convention précède son début.' };
  }

  const valeurs = {
    ...iip,
    'partenaire.nom': p.nom, 'partenaire.adresse': p.adresse, 'partenaire.representant': p.representant,
    'partenaire.fonction': p.fonction, 'partenaire.tel': telFr(p.tel), 'partenaire.email': p.email,
    'partenaire.po': p.po, 'partenaire.sigle': p.sigle,
    annee, 'periode.debut': dateLongue(periodeDebut), 'periode.fin': dateLongue(periodeFin),
  };

  let sections = [], section = null, objet = null;
  if (famille === 'cadre_stage') {
    const codes = [...new Set((Array.isArray(d.cursus) ? d.cursus : []).map(net).filter(Boolean))];
    const rows = codes.map(c => db.prepare('SELECT * FROM section WHERE code = ?').get(c)).filter(Boolean);
    sections = rows.map(s => s.code);
    valeurs.cursus = rows.map(libelleSection);
    objet = `Convention-cadre de stage — ${p.nom}`;
  } else if (famille === 'partenariat') {
    const ueNum = Number(d.ue_num) || null;
    const ue = ueNum ? (db.prepare('SELECT * FROM ue WHERE ue_num = ? AND annee_scolaire = ? LIMIT 1').get(ueNum, annee)
      || db.prepare('SELECT * FROM ue WHERE ue_num = ? ORDER BY annee_scolaire DESC LIMIT 1').get(ueNum)) : null;
    if (ueNum && !ue) return { status: 400, error: `L’unité ${ueNum} est inconnue du référentiel.` };
    section = net(d.section) || ue?.section || null;
    sections = section ? [section] : [];
    const codes = [...new Set((Array.isArray(d.cours) ? d.cours : []).map(net).filter(Boolean))];
    const noms = codes.map(c => (db.prepare('SELECT cours_nom FROM cours WHERE cours_code = ? AND annee_scolaire = ? LIMIT 1').get(c, annee)
      || db.prepare('SELECT cours_nom FROM cours WHERE cours_code = ? ORDER BY annee_scolaire DESC LIMIT 1').get(c))?.cours_nom)
      .filter(Boolean).map(n => `« ${n} »`);
    let enseignant = '';
    if (d.enseignant_id) {
      const pr = db.prepare('SELECT * FROM professeur WHERE id = ?').get(Number(d.enseignant_id));
      if (pr) {
        const civ = /^f/i.test(pr.sexe || '') ? 'Mme ' : /^m/i.test(pr.sexe || '') ? 'M. ' : '';
        enseignant = `${civ}${pr.prenom || ''} ${String(pr.nom || '').toUpperCase()}`.trim();
      }
    }
    if (enseignant && net(d.enseignant_tel)) enseignant += ` (${telFr(d.enseignant_tel)})`;
    objet = net(d.objet);
    Object.assign(valeurs, {
      objet,
      cursus: net(d.cursus),
      ue: ue ? `${ue.ue_num} « ${ue.ue_nom} »` : '',
      cours: noms.length ? (noms.length === 1 ? `le cours ${noms[0]}` : `les cours ${listeFr(noms)}`) : '',
      enseignant_referent: enseignant,
      seances: [...new Set((Array.isArray(d.seances) ? d.seances : []).filter(isoValide))].sort().map(jourLong),
      horaires: net(d.horaires),
      organisation: net(d.organisation),
      locaux: net(d.locaux),
      'partenaire.interlocuteurs': net(d.interlocuteurs) || `les représentants de ${p.sigle || p.nom}`,
      annexes: net(d.annexes),
    });
  } else {
    objet = `Convention-cadre ${p.sigle || p.nom} – IIP`;
  }

  // LE PÉRIMÈTRE : une coordination prépare pour ses sections.
  const perim = getUserSections(req.user);
  if (perim !== null && !sections.some(x => perim.includes(x))) {
    return { status: 403, error: sections.length ? 'Ces cursus sont hors de votre périmètre.'
      : 'Une convention sans section se prépare par la direction ou le secrétariat.' };
  }

  const manquants = (REQUIS[famille] || []).filter(k => estVideValeur(valeurs[k])).map(k => LIBELLE_CHAMP[k] || k);
  if (estVideValeur(valeurs['iip.representant'])) manquants.push('Signataire de l’établissement (Configuration)');
  if (manquants.length) {
    return { status: 409, error: `Rien n’est composé : il manque ${manquants.join(' ; ')}.`, manquants };
  }

  const corps = remplirModele(modele.texte_html, valeurs, blocSignatures({
    iipNom: identite.nom, iipSignataire: valeurs['iip.representant'], iipQualite: valeurs['iip.qualite'],
    partNom: p.nom, partRepresentant: p.representant, partFonction: p.fonction,
  }));
  const titre = TITRES[famille];
  const html = envelopperDocument({
    html: `<div class="conv">${corps}</div>`,
    titre: `${titre} — ${p.nom}`,
    styles: STYLES_CONVENTION,
    entete: { titre, sous: `${identite.nom} — ${p.nom}`, ligne: `Année académique ${annee}` },
  });
  return { famille, modele, annee, valeurs, html, lieu, partenaire: p, sections, section, objet,
           periodeDebut, periodeFin, donnees: d, titre };
}

const OPTIONS_PDF = () => ({
  pagination: 'si-plusieurs',
  pied: avecNum => piedGabaritPdf(LOGO_IIP_JPEG, piedDocument(), avecNum),
  marges: { top: '12mm', right: '15mm', bottom: `${BANDE_PIED_MM}mm`, left: '15mm' },
});

/**
 * La case réservée à la griffe, retrouvée dans le PDF rendu : le marqueur
 * blanc posé dans son coin haut gauche (MARQUE_CACHET). Coordonnées PDF
 * (origine en bas à gauche) ; null si introuvable — la signature retombe
 * alors sur l'emplacement par défaut, en bas à droite de la dernière page.
 */
async function trouverCase(buf) {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true,
      isEvalSupported: false, disableFontFace: true }).promise;
    for (let p = doc.numPages; p >= 1; p--) {
      const page = await doc.getPage(p);
      const it = (await page.getTextContent()).items.find(i => String(i.str || '').includes(MARQUE_CACHET));
      if (it) {
        const taille = Math.abs(it.transform[3]) || 4;
        const res = { page: p - 1, x: it.transform[4], y_haut: it.transform[5] + taille * 0.8 };
        try { await doc.cleanup(); } catch { /* */ }
        return res;
      }
    }
    try { await doc.cleanup(); } catch { /* */ }
  } catch (e) { console.error('[conventions] case de la griffe :', e.message); }
  return null;
}

/** Le modèle IIP rendu : { pdf, cachet }. */
export async function composerConventionIIP(composition) {
  const pdf = await rendrePdf(composition.html, OPTIONS_PDF());
  return { pdf, cachet: await trouverCase(pdf) };
}

/** RIEN NE S'ÉCRIT SANS QU'ON AIT VU CE QUI SERA ÉCRIT : l'aperçu, d'abord. */
r.post('/apercu', authRequired, gesteRequis('conventions.preparer'), (req, res) => {
  const c = preparerComposition(req.body || {}, req);
  if (c.error) return res.status(c.status).json({ error: c.error, manquants: c.manquants });
  res.json({ html: c.html, modele_version: c.modele.version });
});

/** Le répertoire des partenaires : on complète, on ne duplique pas. */
function enregistrerPartenaire(p, id, nom) {
  const champs = ['sigle', 'adresse', 'representant', 'fonction', 'tel', 'email', 'po'];
  let cible = id ? db.prepare('SELECT id FROM convention_partenaire WHERE id = ?').get(Number(id)) : null;
  if (!cible) cible = db.prepare('SELECT id FROM convention_partenaire WHERE lower(nom) = lower(?)').get(p.nom);
  if (cible) {
    db.prepare(`UPDATE convention_partenaire SET nom = ?, ${champs.map(k => `${k} = COALESCE(NULLIF(?, ''), ${k})`).join(', ')},
      maj_le = datetime('now') WHERE id = ?`).run(p.nom, ...champs.map(k => p[k] || ''), cible.id);
    return cible.id;
  }
  return Number(db.prepare(`INSERT INTO convention_partenaire (nom, ${champs.join(', ')}, cree_par)
    VALUES (?, ${champs.map(() => '?').join(', ')}, ?)`).run(p.nom, ...champs.map(k => p[k] || null), nom).lastInsertRowid);
}

r.post('/composer', authRequired, gesteRequis('conventions.preparer'), async (req, res) => {
  const b = req.body || {};
  const c = preparerComposition(b, req);
  if (c.error) return res.status(c.status).json({ error: c.error, manquants: c.manquants });
  if (c.famille === 'cadre_stage') {
    const deja = db.prepare(`SELECT id FROM convention WHERE famille = 'cadre_stage' AND lieu_id = ?
      AND annee_scolaire = ? AND retire_le IS NULL`).get(c.lieu.id, c.annee);
    if (deja) {
      return res.status(409).json({ error: `${c.lieu.nom} a déjà une convention-cadre pour ${c.annee} (n° ${deja.id}). `
        + 'Supprimez-la (avant signature) ou faites-la retirer (après) pour en composer une autre.' });
    }
  }
  const cap = await capacitePdf();
  if (!cap.disponible) return res.status(503).json({ error: 'Ce serveur ne sait pas produire de PDF : la convention ne peut pas être composée.' });

  let rendu;
  try { rendu = await composerConventionIIP(c); }
  catch (e) {
    console.error('[conventions/composer]', e);
    return res.status(500).json({ error: `La composition a échoué : ${e.message}` });
  }
  const dir = join(DATA_DIR, 'conventions');
  try { mkdirSync(dir, { recursive: true }); } catch { /* */ }
  const chemin = join(dir, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_iip.pdf`);
  writeFileSync(chemin, rendu.pdf);
  const nomFichier = `${nomDeFichier(c.titre)}_${nomDeFichier(c.partenaire.sigle || c.partenaire.nom)}_${c.annee}.pdf`;
  const nom = nomConnecte(req);
  const empreinte = createHash('sha256').update(rendu.pdf).digest('hex');

  let id;
  try {
    db.transaction(() => {
      let partenaireId = null;
      if (c.famille !== 'cadre_stage') partenaireId = enregistrerPartenaire(c.partenaire, b.partenaire_id, nom);
      else {
        // Le représentant complété sur le formulaire rejoint la fiche du lieu.
        const l = c.lieu;
        const maj = [];
        if (c.partenaire.representant && c.partenaire.representant !== (l.representant || '')) maj.push(['representant', c.partenaire.representant]);
        if (c.partenaire.fonction && c.partenaire.fonction !== (l.representant_fonction || '')) maj.push(['representant_fonction', c.partenaire.fonction]);
        if (c.partenaire.tel && !l.contact_tel) maj.push(['contact_tel', c.partenaire.tel]);
        if (c.partenaire.email && !l.contact_email) maj.push(['contact_email', c.partenaire.email]);
        if (maj.length) {
          db.prepare(`UPDATE stage_lieu SET ${maj.map(m => `${m[0]} = ?`).join(', ')} WHERE id = ?`).run(...maj.map(m => m[1]), l.id);
        }
      }
      id = Number(db.prepare(`INSERT INTO convention
        (type, famille, annee_scolaire, section, sections, lieu_id, partenaire_id, objet, origine,
         fichier_nom, fichier_chemin, fichier_taille, depose_par_id, depose_par_nom,
         periode_debut, periode_fin, tacite, donnees, modele_version_id, cachet)
        VALUES (?,?,?,?,?,?,?,?, 'iip', ?,?,?,?,?, ?,?,?,?,?,?)`).run(
        FAMILLES[c.famille].type, c.famille, c.annee, c.section || (c.sections.length === 1 ? c.sections[0] : null),
        c.sections.length ? `|${c.sections.join('|')}|` : null,
        c.lieu?.id ?? null, partenaireId, c.objet || null,
        nomFichier, chemin, rendu.pdf.length, req.user?.id ?? null, nom,
        c.periodeDebut, c.periodeFin, FAMILLES[c.famille].tacite ? 1 : 0,
        JSON.stringify({ partenaire: c.partenaire, ...c.donnees }), c.modele.id,
        rendu.cachet ? JSON.stringify(rendu.cachet) : null).lastInsertRowid);
      journaliser(id, 'composition', req, `${TITRES[c.famille]} composée sur le modèle v${c.modele.version} : ${nomFichier}, `
        + `sha256 ${empreinte.slice(0, 16)}…${rendu.cachet ? '' : ' — case de la griffe introuvable : signature en bas à droite de la dernière page'}`);
    })();
  } catch (e) {
    try { unlinkSync(chemin); } catch { /* */ }
    return res.status(500).json({ error: `Rien n’a été enregistré : ${e.message}` });
  }
  res.json({ ok: true, id, convention: habiller(charger(id)), case_griffe: !!rendu.cachet });
});

// ── Déposer un document du partenaire ─────────────────────────────────────
r.post('/', authRequired, gesteRequis('conventions.preparer'), (req, res) => {
  envoi.single('fichier')(req, res, err => {
    const jeter = () => { if (req.file) try { unlinkSync(req.file.path); } catch { /* */ } };
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop lourd (15 Mo au plus).' : err.message });
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });
    if (!estPdf(req.file.path)) { jeter(); return res.status(400).json({ error: "Ce fichier n'est pas un PDF valable." }); }

    const b = req.body || {};
    const type = b.type || (b.stage_id ? 'stage' : '');
    if (type === 'mise_a_disposition') {
      jeter();
      return res.status(400).json({ error: 'La mise à disposition de locaux relève de la HELB, qui en est le référent : elle n’entre pas dans Lucie.' });
    }
    if (!TYPES_DEPOT.includes(type)) { jeter(); return res.status(400).json({ error: 'Type de convention inconnu.' }); }
    const origine = b.origine === 'iip' ? 'iip' : 'lieu';

    let stage = null, section = net(b.section) || null, lieuId = b.lieu_id ? Number(b.lieu_id) : null,
        etudiantId = null, annee = net(b.annee_scolaire) || net(req.headers['x-annee']) || null;
    const partenaireId = b.partenaire_id ? Number(b.partenaire_id) : null;
    const partenaireNom = net(b.partenaire_nom);
    if (b.stage_id) {
      stage = db.prepare('SELECT * FROM stage WHERE id = ?').get(Number(b.stage_id));
      if (!stage) { jeter(); return res.status(404).json({ error: 'Stage introuvable.' }); }
      section = sectionDuStage(stage);
      lieuId = stage.lieu_id;
      etudiantId = stage.etudiant_id;
      annee = stage.annee_scolaire;
      if (!lieuId) {
        jeter();
        return res.status(400).json({ error: "Le lieu de ce stage n'est pas encore choisi : la convention se signe avec un lieu." });
      }
    } else if (!lieuId && !partenaireId && !partenaireNom) {
      jeter();
      return res.status(400).json({ error: 'Choisissez le partenaire (ou le lieu de stage) avec lequel la convention est passée.' });
    }
    if (lieuId && !stage && !db.prepare('SELECT 1 FROM stage_lieu WHERE id = ?').get(lieuId)) {
      jeter(); return res.status(400).json({ error: 'Lieu de stage inconnu.' });
    }
    if (partenaireId && !db.prepare('SELECT 1 FROM convention_partenaire WHERE id = ?').get(partenaireId)) {
      jeter(); return res.status(400).json({ error: 'Partenaire inconnu.' });
    }
    const perim = getUserSections(req.user);
    if (perim !== null && (!section || !perim.includes(section))) {
      jeter();
      return res.status(403).json({ error: section ? 'Section hors de votre périmètre.'
        : (stage ? "Ce stage n'a pas de section : la direction ou le secrétariat dépose sa convention."
                 : 'Indiquez la section concernée : une coordination dépose pour ses sections.') });
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
    const periodeDebut = isoValide(b.periode_debut) ? String(b.periode_debut).slice(0, 10) : null;
    const periodeFin = isoValide(b.periode_fin) ? String(b.periode_fin).slice(0, 10) : null;
    if (periodeDebut && periodeFin && periodeFin < periodeDebut) {
      jeter(); return res.status(400).json({ error: 'La fin de la convention précède son début.' });
    }

    const nom = nomConnecte(req);
    const nomFichier = nomOrigine(req.file, 'convention.pdf');
    let id;
    db.transaction(() => {
      // Un partenaire choisi dans le répertoire reste tel quel ; un nom nouveau y entre.
      const pid = stage || lieuId ? null
        : (partenaireNom ? enregistrerPartenaire({ nom: partenaireNom }, partenaireId, nom) : partenaireId);
      id = Number(db.prepare(`INSERT INTO convention
        (type, famille, annee_scolaire, section, sections, stage_id, lieu_id, partenaire_id, etudiant_id, objet, origine,
         fichier_nom, fichier_chemin, fichier_taille, depose_par_id, depose_par_nom, periode_debut, periode_fin, tacite)
        VALUES (?, 'partenaire', ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(type, annee, section, section ? `|${section}|` : null, stage?.id ?? null, lieuId, pid, etudiantId,
             net(b.objet) || null, origine, nomFichier, req.file.path, req.file.size, req.user?.id ?? null, nom,
             periodeDebut, periodeFin, b.tacite === '1' || b.tacite === 'true' ? 1 : 0).lastInsertRowid);
      const empreinte = createHash('sha256').update(readFileSync(req.file.path)).digest('hex');
      journaliser(id, 'depot', req, `${TYPES[type]} déposée (${origine === 'iip' ? 'modèle IIP' : 'document du partenaire'}) : ${nomFichier}, sha256 ${empreinte.slice(0, 16)}…`);
    })();
    res.json({ ok: true, id, convention: habiller(charger(id)) });
  });
});

// ── L'exemplaire contresigné par le partenaire ─────────────────────────────
r.post('/:id/contresigne', authRequired, gesteRequis('conventions.preparer'), (req, res) => {
  envoi.single('fichier')(req, res, err => {
    const jeter = () => { if (req.file) try { unlinkSync(req.file.path); } catch { /* */ } };
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop lourd (15 Mo au plus).' : err.message });
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });
    if (!estPdf(req.file.path)) { jeter(); return res.status(400).json({ error: "Ce fichier n'est pas un PDF valable." }); }
    const c = charger(req.params.id);
    if (!c || !permise(req, c)) { jeter(); return res.status(404).json({ error: 'Convention introuvable.' }); }
    if (c.retire_le) { jeter(); return res.status(409).json({ error: 'Cette convention est retirée.' }); }
    if (!c.signe_le) { jeter(); return res.status(409).json({ error: 'L’exemplaire contresigné se dépose après la signature de l’Institut.' }); }
    if (c.contresigne_le) { jeter(); return res.status(409).json({ error: `L’exemplaire contresigné est déjà déposé (le ${String(c.contresigne_le).slice(0, 10)}).` }); }
    const nomFichier = nomOrigine(req.file, 'contresigne.pdf');
    const empreinte = createHash('sha256').update(readFileSync(req.file.path)).digest('hex');
    db.transaction(() => {
      db.prepare(`UPDATE convention SET contresigne_le = datetime('now'), contresigne_par_id = ?, contresigne_par_nom = ?,
        fichier_contresigne_chemin = ?, fichier_contresigne_nom = ? WHERE id = ?`)
        .run(req.user?.id ?? null, nomConnecte(req), req.file.path, nomFichier, c.id);
      journaliser(c.id, 'contresigne', req, `exemplaire contresigné par ${c.partenaire_nom || c.lieu_nom || 'le partenaire'} déposé : ${nomFichier}, sha256 ${empreinte.slice(0, 16)}…`);
    })();
    res.json({ ok: true, convention: habiller(charger(c.id)) });
  });
});

// ── Listes ────────────────────────────────────────────────────────────────
r.get('/', authRequired, gesteRequis('conventions.lire'), (req, res) => {
  const q = req.query;
  const clauses = [], params = [];
  if (q.annee) { clauses.push('c.annee_scolaire = ?'); params.push(q.annee); }
  if (q.section) { clauses.push('(c.section = ? OR c.sections LIKE ?)'); params.push(q.section, `%|${q.section}|%`); }
  if (q.stage_id) { clauses.push('c.stage_id = ?'); params.push(Number(q.stage_id)); }
  if (q.etudiant_id) { clauses.push('c.etudiant_id = ?'); params.push(Number(q.etudiant_id)); }
  if (q.famille) {
    clauses.push("COALESCE(c.famille, 'partenaire') = ?"); params.push(q.famille);
  }
  if (q.q) {
    const like = `%${String(q.q).trim()}%`;
    clauses.push('(pt.nom LIKE ? OR pt.sigle LIKE ? OR l.nom LIKE ? OR c.objet LIKE ? OR e.nom LIKE ? OR c.fichier_nom LIKE ?)');
    params.push(like, like, like, like, like, like);
  }
  const perim = getUserSections(req.user);
  if (perim !== null) {
    if (q.section && !perim.includes(q.section)) return res.status(403).json({ error: 'Section hors de votre périmètre.' });
    const cl = clausePerimetre(perim);
    clauses.push(cl.sql); params.push(...cl.params);
  }
  let rows = db.prepare(`${SELECT_CONVENTION} ${clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''}
    ORDER BY c.depose_le DESC`).all(...params).map(habiller);
  if (q.etat === 'echue') rows = rows.filter(c => c.echue);
  else if (q.etat) rows = rows.filter(c => c.etat === q.etat);
  res.json({ conventions: rows, types: TYPES, familles: Object.fromEntries(Object.entries(FAMILLES).map(([k, f]) => [k, f.libelle])) });
});

/** Ce qui attend la griffe — vide pour qui n'est pas le signataire. */
r.get('/a-signer', authRequired, (req, res) => {
  const signataire = estSignataire(req.user);
  if (!signataire) return res.json({ signataire: false, conventions: [] });
  const rows = db.prepare(`${SELECT_CONVENTION} WHERE c.signe_le IS NULL AND c.retire_le IS NULL
    ORDER BY c.depose_le`).all();
  res.json({ signataire: true, directeur: identiteEtablissement().directeur, conventions: rows.map(habiller) });
});

r.get('/:id/journal', authRequired, gesteRequis('conventions.lire'), (req, res) => {
  const c = charger(req.params.id);
  if (!c || !permise(req, c)) return res.status(404).json({ error: 'Convention introuvable.' });
  res.json({ journal: db.prepare('SELECT * FROM convention_journal WHERE convention_id = ? ORDER BY id').all(c.id) });
});

/* Le signataire lit ce qu'on lui demande de signer, même hors registre : la
   porte du fichier s'ouvre au lecteur du registre ET à lui. */
r.get('/:id/fichier', authRequired, (req, res) => {
  const c = charger(req.params.id);
  const lecteur = gesteAutorise(req, 'conventions.lire') === 'oui';
  if (!c || !(lecteur ? permise(req, c) : estSignataire(req.user))) return res.status(404).json({ error: 'Convention introuvable.' });
  const version = ['signe', 'contresigne'].includes(req.query.version) ? req.query.version : 'original';
  const chemin = version === 'signe' ? c.fichier_signe_chemin
    : version === 'contresigne' ? c.fichier_contresigne_chemin : c.fichier_chemin;
  if (!chemin || !existsSync(chemin)) {
    return res.status(404).json({ error: version === 'signe' ? 'Pas encore de version signée.'
      : version === 'contresigne' ? 'Pas encore d’exemplaire contresigné.' : 'Fichier introuvable.' });
  }
  const base = String(c.fichier_nom || 'convention.pdf').replace(/\.pdf$/i, '');
  const nom = version === 'signe' ? `${base}_signe_${c.reference || ''}.pdf`
    : version === 'contresigne' ? `${base}_contresigne.pdf` : `${base}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(nom)}`);
  res.send(readFileSync(chemin));
});

// ── Retirer : avant signature, on efface ; après, la direction retire ──────
r.delete('/:id', authRequired, gesteRequis('conventions.preparer'), (req, res) => {
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
 * Pose le cartouche (70 × 32 mm). Sur une convention COMPOSÉE par Lucie, dans
 * la case réservée de la colonne de l'Institut (`boite`, retrouvée à la
 * composition) ; sinon en bas à droite de la DERNIÈRE page, au-dessus de la
 * marge basse — si la page est pleine, il s'y pose quand même : c'est le
 * défaut convenu, l'original reste intact à côté.
 */
async function apposer(pdfOriginal, { filigranePng, signataire, qualite, jour, reference, etablissement, boite = null }) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.load(pdfOriginal, { ignoreEncryption: false, updateMetadata: false });
  const pages = doc.getPages();
  const dansCase = boite && Number.isInteger(boite.page) && pages[boite.page]
    && Number.isFinite(boite.x) && Number.isFinite(boite.y_haut);
  const page = dansCase ? pages[boite.page] : pages[pages.length - 1];
  const crop = page.getCropBox();
  const fN = await doc.embedFont(StandardFonts.Helvetica);
  const fB = await doc.embedFont(StandardFonts.HelveticaBold);
  const img = await doc.embedPng(filigranePng);

  const L = 70 * MM, H = 32 * MM;
  // La case fait 72 × 34 mm : le cartouche s'y pose à un millimètre du bord.
  const x = dansCase ? boite.x + 1 * MM : crop.x + crop.width - L - 15 * MM;
  const y = dansCase ? boite.y_haut - 1 * MM - H : crop.y + 14 * MM;
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
        piece: TYPES[c.type] || 'Convention', destinataire: c.partenaire_nom || c.lieu_nom || null, date: jour, reference });
      let boite = null;
      if (c.origine === 'iip' && c.cachet) { try { boite = JSON.parse(c.cachet); } catch { /* défaut */ } }
      if (!fil) throw new Error('le fac-similé protégé n’a pas pu être dessiné (moteur de rendu indisponible) — une signature ne sort jamais nue');
      let signe;
      try {
        signe = await apposer(readFileSync(c.fichier_chemin), { filigranePng: fil, signataire, qualite: 'Directeur',
          jour, reference, etablissement: identite.nom || 'Institut Ilya Prigogine', boite });
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
