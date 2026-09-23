// ─────────────────────────────────────────────────────────────────────────────
// Lucie — DOCUMENTATION : le corpus, ses versions, et la prise de connaissance
//
// Demandé par Charles le 20 septembre 2026 : « Une circulaire examens doit être
// consultée par les MDP en début d'année. Ce sont les règles du jeu, donc elles
// doivent être maîtrisées. Le professeur DOIT cocher "je confirme avoir pris
// connaissance du document". Ceci est tracé. Si elle a coché sans lire, cela
// devient son problème. »
//
// ── POURQUOI CE MODULE PLUTÔT QU'UN DOSSIER PARTAGÉ ─────────────────────────
//
// Parce qu'un dossier partagé ne prouve rien. Ce qui est demandé ici n'est pas
// de RANGER des textes, c'est de rendre une règle OPPOSABLE à quelqu'un : de
// pouvoir dire, un an après, « ce document vous a été présenté le 12 septembre
// et vous en avez accusé réception ».
//
// L'écran d'aide de Lucie en est la démonstration involontaire : son contenu
// vit dans un tableau JavaScript compilé dans l'application. Le modifier exige
// un commit, une construction et un déploiement — si bien qu'au 20 septembre
// 2026 il ne disait pas un mot de la valorisation, de la délibération, des
// diplômes, de l'échéancier ni du suivi d'équipe. UN TEXTE QUI COÛTE UN
// DÉPLOIEMENT NE SE MET JAMAIS À JOUR. Le corpus vit donc en base.
//
// ── DEUX TRACES, PAS UNE ────────────────────────────────────────────────────
//
// Ce qui s'oppose à quelqu'un, ce n'est pas qu'il ait cliqué sur une case :
// c'est que LE DOCUMENT LUI AIT ÉTÉ PRÉSENTÉ et qu'il en ait accusé réception.
// Si le texte n'a pas chargé et que la personne coche quand même, l'accusé ne
// vaut rien devant qui le contestera.
//
//     ouvert_le    — le document a réellement été servi à cette personne
//     confirme_le  — elle a confirmé en avoir pris connaissance
//
// La case reste donc inactive tant que le serveur n'a pas servi le texte. Cela
// ne prétend pas prouver la LECTURE — Charles l'a dit lui-même : coché sans
// lire, c'est le problème de celui qui a coché. Cela prouve la PRÉSENTATION,
// et c'est la seule chose qu'un logiciel puisse honnêtement établir.
//
// ── LA VERSION EST EN AJOUT SEUL ────────────────────────────────────────────
//
// Une personne s'engage sur UN TEXTE PRÉCIS. Si ce texte peut être retouché
// après coup, l'engagement ne prouve plus rien — et c'est justement une pièce
// opposable au membre du personnel. On publie une nouvelle version ; l'ancienne
// reste lisible, et chacun peut retrouver celle qu'il a acceptée. C'est la même
// raison qui rend le journal de valorisation immodifiable, administrateur
// compris.
//
// ── CE QUI DEMANDE UNE NOUVELLE CONFIRMATION, ET CE QUI N'EN DEMANDE PAS ────
//
// La règle d'origine disait : TOUTE nouvelle version remet le compteur à zéro.
// Tranché autrement par Charles le 21 septembre 2026, au moment où les textes
// deviennent modifiables dans Lucie « année après année » : corriger une date
// ou une adresse ne doit pas remettre tout le personnel en devoir de relire.
// Celui qui publie COCHE donc si les membres du personnel doivent relire et
// confirmer à nouveau — et c'est un geste écrit dans la version
// (`reconfirmer`), pas une impression.
//
// Ce qui ne change pas : rien ne se réécrit. Une correction, même mineure, est
// une VERSION, avec son auteur, sa date et ce qui change. On peut donc toujours
// dire quel texte exact quelqu'un a confirmé, et ce qui a changé depuis sans
// qu'on le lui redemande. La confirmation d'une version couvre les suivantes
// TANT QU'AUCUNE ne demande de reconfirmer — cela se DÉDUIT des versions, on
// ne recopie aucune confirmation (voir `etatLecture`).
//
// Qui publie : administrateur (le directeur, Charles Sohet, a ce rôle),
// directeur et direction adjointe — « accès niveau 1 », pour Charles.
// ─────────────────────────────────────────────────────────────────────────────

import express from 'express';
import db from '../db/index.js';
import multer from 'multer';
import { authRequired, roleRequired } from '../middleware/auth.js';
import { analyserFichier, assainir, estVide } from '../lib/texteCorpus.js';

const r = express.Router();

/* QUI DÉPOSE ET PUBLIE — la direction, et personne d'autre.
 * Tranché par Charles le 20 septembre : le corpus est un acte de direction.
 * Une procédure que chacun peut réécrire n'est plus une règle, c'est un avis. */
const PEUT_PUBLIER = ['admin', 'directeur', 'directeur_adjoint'];

/* LES NATURES — et elles ne se valent pas devant un litige.
 * Un décret s'impose à l'Institut ; une procédure est ce que l'Institut en
 * fait. Les mélanger ferait croire qu'on peut amender l'un comme l'autre. */
export const NATURES = [
  { cle: 'decret', libelle: 'Décret', externe: true },
  { cle: 'circulaire', libelle: 'Circulaire', externe: true },
  { cle: 'reglement', libelle: 'Règlement (RDE, ROI)', externe: true },
  { cle: 'procedure', libelle: 'Procédure interne', externe: false },
  { cle: 'note', libelle: 'Note de service', externe: false },
  { cle: 'aide', libelle: 'Mode d’emploi de Lucie', externe: false },
];

export function migrerDocumentation(dbx) {
  try {
    dbx.exec(`
    CREATE TABLE IF NOT EXISTS corpus_document (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      cle         TEXT UNIQUE NOT NULL,      -- stable : les liens la citent
      titre       TEXT NOT NULL,
      nature      TEXT NOT NULL,
      domaine     TEXT,                      -- l'axe de Lucie que le texte concerne
      resume      TEXT,
      retire_le   TEXT,                      -- retiré ≠ supprimé : il reste lisible
      retire_par  TEXT,
      cree_le     TEXT DEFAULT (datetime('now'))
    );

    -- EN AJOUT SEUL : aucune route ne modifie ni n'efface une version publiée.
    CREATE TABLE IF NOT EXISTS corpus_version (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id  INTEGER NOT NULL REFERENCES corpus_document(id) ON DELETE CASCADE,
      numero       INTEGER NOT NULL,
      contenu      TEXT NOT NULL,
      resume_changement TEXT,
      publiee_le   TEXT DEFAULT (datetime('now')),
      publiee_par  TEXT,
      publiee_par_role TEXT,
      UNIQUE (document_id, numero)
    );

    -- À QUI LE TEXTE S'IMPOSE. Par RÔLE, jamais par personne : nommer les gens
    -- un à un, c'est oublier celui qui arrive en octobre.
    CREATE TABLE IF NOT EXISTS corpus_destinataire (
      document_id INTEGER NOT NULL REFERENCES corpus_document(id) ON DELETE CASCADE,
      role        TEXT NOT NULL,
      PRIMARY KEY (document_id, role)
    );

    -- LES DEUX TRACES. La clé porte la VERSION, non le document : c'est ce qui
    -- remet le compteur à zéro à chaque publication, sans rien effacer.
    CREATE TABLE IF NOT EXISTS corpus_lecture (
      version_id     INTEGER NOT NULL REFERENCES corpus_version(id) ON DELETE CASCADE,
      utilisateur_id INTEGER NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
      ouvert_le      TEXT,
      confirme_le    TEXT,
      PRIMARY KEY (version_id, utilisateur_id)
    );
    CREATE INDEX IF NOT EXISTS idx_corpus_lecture_u ON corpus_lecture(utilisateur_id);
    `);
  } catch (e) { console.error('[migration] documentation :', e.message); }

  /* 2.12.91 — LE TEXTE DEVIENT MIS EN FORME, ET LA RECONFIRMATION UN CHOIX.
   * Additif et gardé : une colonne qui existe déjà ne se rajoute pas.
   *   format       'texte' (les versions d'avant, du texte brut) ou 'html'
   *   reconfirmer  1 = cette version demande une nouvelle confirmation. Vaut 1
   *                par défaut : c'était la règle pour tout ce qui est déjà
   *                publié, et le passé ne change pas de sens.
   *   source_url   le texte officiel en ligne (un décret) — le PDF, lui, n'est
   *                pas conservé. */
  const colonnes = t => dbx.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
  try {
    const v = colonnes('corpus_version');
    if (!v.includes('format')) dbx.exec(`ALTER TABLE corpus_version ADD COLUMN format TEXT NOT NULL DEFAULT 'texte'`);
    if (!v.includes('reconfirmer')) dbx.exec(`ALTER TABLE corpus_version ADD COLUMN reconfirmer INTEGER NOT NULL DEFAULT 1`);
    if (!colonnes('corpus_document').includes('source_url')) {
      dbx.exec(`ALTER TABLE corpus_document ADD COLUMN source_url TEXT`);
    }
  } catch (e) { console.error('[migration] documentation (mise en forme) :', e.message); }
}

/* LA VERSION QU'IL FAUT AVOIR CONFIRMÉE — la dernière qui l'a DEMANDÉ.
 * Une version 3 publiée « sans reconfirmation » ne déplace pas la référence :
 * avoir confirmé la version 2 suffit toujours. */
function versionReference(documentId) {
  return db.prepare(`SELECT * FROM corpus_version
    WHERE document_id = ? AND (reconfirmer = 1 OR numero = 1)
    ORDER BY numero DESC LIMIT 1`).get(documentId) || null;
}

/**
 * OÙ EN EST CETTE PERSONNE AVEC CE TEXTE — la seule fonction qui en décide.
 *
 * Cinq routes posaient la question chacune à sa façon (« a-t-il confirmé la
 * dernière version ? »). Avec la reconfirmation facultative, la bonne question
 * devient « a-t-il confirmé une version postérieure ou égale à la référence ? »
 * — et une question posée cinq fois finit par recevoir cinq réponses.
 *
 * `confirme_le` et `version_confirmee` disent QUELLE version a été confirmée :
 * la personne a accepté un texte précis, pas « le document ».
 */
function etatLecture(documentId, utilisateurId) {
  const ref = versionReference(documentId);
  const derniere = derniereVersion(documentId);
  if (!ref || !derniere || !utilisateurId) {
    return { confirme_le: null, version_confirmee: null, ouvert_le: null, reference: ref?.numero || null };
  }
  const c = db.prepare(`SELECT v.numero, l.confirme_le FROM corpus_lecture l
      JOIN corpus_version v ON v.id = l.version_id
     WHERE v.document_id = ? AND l.utilisateur_id = ? AND l.confirme_le IS NOT NULL
       AND v.numero >= ?
     ORDER BY v.numero DESC LIMIT 1`).get(documentId, utilisateurId, ref.numero);
  const o = db.prepare(`SELECT ouvert_le FROM corpus_lecture
     WHERE version_id = ? AND utilisateur_id = ?`).get(derniere.id, utilisateurId);
  return {
    confirme_le: c?.confirme_le || null,
    version_confirmee: c?.numero || null,
    ouvert_le: o?.ouvert_le || null,
    reference: ref.numero,
  };
}

/** Le nom de celui qui publie ou retire — son NOM, pas son adresse. Le jeton
 *  porte `nom` ; `nom_complet` n'y a jamais été, si bien que les versions
 *  s'affichaient « publiée par jerome@… ». */
const auteur = u => u?.nom || u?.nom_complet || u?.email || null;

/** La dernière version publiée d'un document — celle qui fait foi. */
function derniereVersion(documentId) {
  return db.prepare(`SELECT * FROM corpus_version WHERE document_id = ?
    ORDER BY numero DESC LIMIT 1`).get(documentId) || null;
}

/* CE QUI CONCERNE QUELQU'UN. Un document sans destinataire déclaré ne s'impose
 * à personne : il est consultable, il n'est pas opposable. C'est volontaire —
 * un mode d'emploi n'a pas à être accusé réception. */
function concerne(doc, user) {
  if (!user?.role) return false;
  const roles = db.prepare('SELECT role FROM corpus_destinataire WHERE document_id = ?')
    .all(doc.id).map(l => l.role);
  return roles.includes(user.role);
}

/* DÉCLARÉE AVANT `/:cle`, et ce n'est pas une coquetterie : les routes
 * spécifiques passent devant les paramétriques. Aujourd'hui `/:cle` ne
 * prend qu'un segment et ne l'avalerait pas — mais le jour où quelqu'un
 * écrira `/moi`, c'est `/:cle` qui répondra « document introuvable ». */
// ── CE QUI M'ATTEND — la lecture « par personne » du tableau de bord ────────
r.get('/moi/attente', authRequired, (req, res) => {
  const docs = db.prepare(`
    SELECT d.id, d.cle, d.titre, d.nature FROM corpus_document d
      JOIN corpus_destinataire t ON t.document_id = d.id AND t.role = ?
     WHERE d.retire_le IS NULL ORDER BY d.titre`).all(req.user?.role || '');
  const attente = [];
  for (const d of docs) {
    const v = derniereVersion(d.id);
    if (!v) continue;
    if (!etatLecture(d.id, req.user.id).confirme_le) {
      attente.push({ cle: d.cle, titre: d.titre, nature: d.nature,
                     numero: v.numero, publiee_le: v.publiee_le });
    }
  }
  res.json({ attente });
});

// ── LE CORPUS, VU PAR CELUI QUI LE CONSULTE ─────────────────────────────────
r.get('/', authRequired, (req, res) => {
  const tout = req.query.retires === '1';
  const docs = db.prepare(`SELECT * FROM corpus_document
    ${tout ? '' : 'WHERE retire_le IS NULL'} ORDER BY nature, titre`).all();

  const sortie = [];
  for (const d of docs) {
    const v = derniereVersion(d.id);
    // Un document sans version publiée est un brouillon : il ne se lit pas.
    if (!v && !PEUT_PUBLIER.includes(req.user?.role)) continue;
    const lecture = v ? etatLecture(d.id, req.user?.id) : null;
    const pourMoi = concerne(d, req.user);
    sortie.push({
      id: d.id, cle: d.cle, titre: d.titre, nature: d.nature,
      domaine: d.domaine, resume: d.resume, retire_le: d.retire_le,
      source_url: d.source_url || null,
      version: v ? { id: v.id, numero: v.numero, publiee_le: v.publiee_le,
                     publiee_par: v.publiee_par,
                     resume_changement: v.resume_changement } : null,
      /* CE QUE JE DOIS FAIRE AVEC CE TEXTE — calculé ici, pas à l'écran :
       * deux déductions pour un même fait finiraient par différer. */
      me_concerne: pourMoi,
      ouvert_le: lecture?.ouvert_le || null,
      confirme_le: lecture?.confirme_le || null,
      a_confirmer: !!(pourMoi && v && !lecture?.confirme_le),
    });
  }
  res.json({ documents: sortie, natures: NATURES });
});

/* LE TEXTE LUI-MÊME — ET C'EST CETTE ROUTE QUI POSE `ouvert_le`.
 *
 * Elle le pose ICI, au moment où le serveur remet effectivement le contenu, et
 * non sur un clic de l'écran : un écran peut prétendre avoir affiché ce qu'il
 * n'a pas reçu. La trace dit « le document a été servi à cette personne », et
 * elle ne peut le dire que depuis l'endroit qui le sert. */
r.get('/:cle', authRequired, (req, res) => {
  const d = db.prepare('SELECT * FROM corpus_document WHERE cle = ?').get(req.params.cle);
  if (!d) return res.status(404).json({ error: 'Document introuvable.' });
  const v = req.query.version
    ? db.prepare('SELECT * FROM corpus_version WHERE document_id = ? AND numero = ?')
      .get(d.id, Number(req.query.version))
    : derniereVersion(d.id);
  if (!v) return res.status(404).json({ error: 'Aucune version publiée.' });

  if (req.user?.id) {
    db.prepare(`INSERT INTO corpus_lecture (version_id, utilisateur_id, ouvert_le)
      VALUES (?,?,datetime('now'))
      ON CONFLICT(version_id, utilisateur_id) DO UPDATE SET
        ouvert_le = COALESCE(corpus_lecture.ouvert_le, excluded.ouvert_le)`)
      .run(v.id, req.user.id);
  }

  const lecture = etatLecture(d.id, req.user?.id);
  const versions = db.prepare(`SELECT numero, publiee_le, publiee_par,
    resume_changement, reconfirmer FROM corpus_version WHERE document_id = ?
    ORDER BY numero DESC`).all(d.id);

  res.json({
    ...d, version: v, versions,
    /* À QUI IL S'IMPOSE — rendu avec le texte : sans cela, la fenêtre de
     * lecture ne pouvait ni le montrer ni le corriger, et les destinataires
     * choisis au dépôt devenaient définitifs par oubli, non par décision. */
    destinataires: db.prepare('SELECT role FROM corpus_destinataire WHERE document_id = ?')
      .all(d.id).map(l => l.role),
    me_concerne: concerne(d, req.user),
    ouvert_le: lecture.ouvert_le,
    confirme_le: lecture.confirme_le,
    version_confirmee: lecture.version_confirmee,
  });
});

/* LA CONFIRMATION — et le serveur REFUSE si le texte n'a pas été servi.
 *
 * « Il a coché » et « le document lui a été présenté, et il a confirmé » ne se
 * défendent pas pareil. Sans cette barrière, une requête suffirait à confirmer
 * cent documents jamais ouverts, et tout le registre tomberait avec le premier
 * qui le démontrerait. */
r.post('/:cle/confirmer', authRequired, (req, res) => {
  const d = db.prepare('SELECT * FROM corpus_document WHERE cle = ?').get(req.params.cle);
  if (!d) return res.status(404).json({ error: 'Document introuvable.' });
  const v = derniereVersion(d.id);
  if (!v) return res.status(400).json({ error: 'Aucune version publiée.' });

  /* DÉJÀ COUVERT ? Une confirmation posée sur une version antérieure vaut pour
   * celle-ci si rien depuis n'a demandé de relire : on ne la réécrit pas, elle
   * porte une date, et c'est cette date qui s'oppose. */
  const etat = etatLecture(d.id, req.user.id);
  if (etat.confirme_le) return res.json({ ok: true, confirme_le: etat.confirme_le });

  const l = db.prepare(`SELECT * FROM corpus_lecture
    WHERE version_id = ? AND utilisateur_id = ?`).get(v.id, req.user.id);
  if (!l?.ouvert_le) {
    return res.status(409).json({
      error: 'Le document doit vous avoir été présenté avant que vous puissiez '
           + 'en accuser réception. Ouvrez-le, puis confirmez.' });
  }
  db.prepare(`UPDATE corpus_lecture SET confirme_le = datetime('now')
    WHERE version_id = ? AND utilisateur_id = ?`).run(v.id, req.user.id);
  const apres = db.prepare(`SELECT confirme_le FROM corpus_lecture
    WHERE version_id = ? AND utilisateur_id = ?`).get(v.id, req.user.id);
  res.json({ ok: true, confirme_le: apres.confirme_le });
});

/* LE REGISTRE — la lecture « par document », pour la direction.
 *
 * « 9 des 12 personnes concernées ont confirmé » ne sert à rien : ce sont les
 * TROIS AUTRES qu'il faut pouvoir nommer, puisque c'est à elles qu'on ira
 * parler. Un compteur sans noms est un compteur qu'on regarde et qu'on oublie. */
r.get('/:cle/registre', authRequired, roleRequired(...PEUT_PUBLIER), (req, res) => {
  const d = db.prepare('SELECT * FROM corpus_document WHERE cle = ?').get(req.params.cle);
  if (!d) return res.status(404).json({ error: 'Document introuvable.' });
  const v = derniereVersion(d.id);
  if (!v) return res.json({ document: d, version: null, lignes: [] });

  const roles = db.prepare('SELECT role FROM corpus_destinataire WHERE document_id = ?')
    .all(d.id).map(l => l.role);
  if (!roles.length) return res.json({ document: d, version: v, lignes: [], sans_destinataire: true });

  const marques = roles.map(() => '?').join(',');
  const lignes = db.prepare(`
    SELECT u.id, u.nom_complet, u.email, u.role
      FROM utilisateur u
     WHERE u.actif = 1 AND u.role IN (${marques})
     ORDER BY u.nom_complet`).all(...roles)
    // La même règle que partout : etatLecture, et non une jointure sur la
    // seule dernière version, qui ignorerait les versions sans reconfirmation.
    .map(u => ({ ...u, ...etatLecture(d.id, u.id) }))
    .sort((a, b) => (!!a.confirme_le - !!b.confirme_le));

  res.json({ document: d, version: v, roles, lignes });
});

/** Un lien vers le texte officiel — http(s) seulement, ou rien. `false` = refusé.
 *
 * « www.gallilex.cfwb.be/… » est évidemment une adresse : la refuser parce
 * qu'elle ne commence pas par https:// bloquait une publication pour un champ
 * FACULTATIF (constaté par Charles le 21 septembre, en publiant la procédure
 * VA). Une adresse sans protocole reçoit https:// ; ce qui n'a pas la forme
 * d'une adresse reste refusé — un « javascript: » ne doit pas devenir un lien. */
function lienSource(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (/^https?:\/\/\S+$/i.test(s)) return s;
  if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/\S*)?$/i.test(s)) return `https://${s}`;
  return false;
}
const refusLien = v => `« ${String(v).trim().slice(0, 80)} » n’est pas une adresse web. `
  + 'Ce champ est facultatif : videz-le, ou indiquez une adresse (https://…).';

/* ANALYSER UN FICHIER — Word ou PDF — ET NE RIEN ÉCRIRE.
 *
 * Le même geste que l'import d'un dossier pédagogique : on dépose, Lucie
 * analyse, on VOIT le résultat, et rien n'est enregistré avant la publication.
 * Le fichier reste en mémoire le temps de l'analyse et n'est conservé nulle
 * part — le PDF d'un décret est en ligne, Charles ne veut pas qu'il alourdisse
 * la base. */
const televersement = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});
r.post('/importer', authRequired, roleRequired(...PEUT_PUBLIER),
  televersement.single('fichier'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });
    try {
      res.json(await analyserFichier(req.file.buffer, req.file.originalname));
    } catch (e) {
      res.status(e.status || 422).json({ error: e.message || 'Analyse impossible.' });
    }
  });

// ── DÉPOSER ET PUBLIER — direction seule ────────────────────────────────────
r.post('/', authRequired, roleRequired(...PEUT_PUBLIER), (req, res) => {
  const titre = String(req.body?.titre || '').trim();
  const nature = String(req.body?.nature || '').trim();
  if (!titre) return res.status(400).json({ error: 'Titre obligatoire.' });
  if (!NATURES.some(n => n.cle === nature)) {
    return res.status(400).json({ error: 'Nature inconnue.' });
  }
  /* LA CLÉ SE FABRIQUE, ELLE NE SE TAPE PAS. Tapée, elle porte des espaces et
   * des accents, et c'est elle que les liens citeront pour toujours. */
  const base = (req.body?.cle || titre).toString().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'document';
  let cle = base, n = 2;
  while (db.prepare('SELECT 1 FROM corpus_document WHERE cle = ?').get(cle)) {
    cle = `${base}-${n++}`;
  }
  const source = lienSource(req.body?.source_url);
  if (source === false) return res.status(400).json({ error: refusLien(req.body.source_url) });
  const info = db.prepare(`INSERT INTO corpus_document
    (cle, titre, nature, domaine, resume, source_url) VALUES (?,?,?,?,?,?)`)
    .run(cle, titre, nature, req.body?.domaine || null, req.body?.resume || null, source);
  res.json({ ok: true, id: info.lastInsertRowid, cle });
});

/* PUBLIER UNE VERSION — l'acte central, et il est IRRÉVERSIBLE.
 *
 * Il n'existe aucune route pour modifier ni supprimer une version publiée, et
 * ce n'est pas un oubli : une personne s'est engagée sur ce texte-là. Corriger
 * une coquille se fait en publiant la version suivante, avec son résumé de
 * changement — ce qui remet, à dessein, le compteur de confirmations à zéro. */
r.post('/:cle/versions', authRequired, roleRequired(...PEUT_PUBLIER), (req, res) => {
  const d = db.prepare('SELECT * FROM corpus_document WHERE cle = ?').get(req.params.cle);
  if (!d) return res.status(404).json({ error: 'Document introuvable.' });
  /* LE TEXTE MIS EN FORME PASSE PAR LA LISTE DE CE QUI EST PERMIS, ICI, AVANT
   * D'ÊTRE ÉCRIT. Le texte brut d'avant (format 'texte') reste accepté : il
   * s'affiche tel quel, sans rien interpréter. */
  const format = req.body?.format === 'html' ? 'html' : 'texte';
  const contenu = format === 'html'
    ? assainir(req.body?.contenu)
    : String(req.body?.contenu || '').trim();
  if (!contenu || (format === 'html' && estVide(contenu))) {
    return res.status(400).json({ error: 'Le texte est vide.' });
  }

  const derniere = derniereVersion(d.id);
  /* ON NE PUBLIE PAS DEUX FOIS LE MÊME TEXTE. Sans ce contrôle, un clic de
   * trop remettrait tout le personnel en devoir de reconfirmer un document
   * qui n'a pas changé d'une virgule — et c'est ainsi qu'un signal devient
   * du bruit qu'on apprend à ignorer. */
  if (derniere && derniere.contenu.trim() === contenu) {
    return res.status(409).json({
      error: `Le texte est identique à la version ${derniere.numero} : rien à `
           + 'publier. Une nouvelle version obligerait chacun à reconfirmer '
           + 'un document inchangé.' });
  }
  if (derniere && !String(req.body?.resume_changement || '').trim()) {
    return res.status(400).json({
      error: 'Dites ce qui change : la version suivante reste au dossier, et '
           + 'celui qui la lira a le droit de savoir ce qui la distingue.' });
  }
  /* LA CASE SE COCHE, ELLE NE SE DEVINE PAS. Sur une version 2 et au-delà, le
   * serveur exige de savoir si le personnel doit relire : un champ absent
   * voudrait dire qu'un écran a oublié de poser la question, et l'on ne
   * tranche pas à sa place une obligation faite à quarante personnes. La
   * version 1 demande toujours confirmation — c'est ce qu'être publié veut
   * dire. */
  if (derniere && typeof req.body?.reconfirmer !== 'boolean') {
    return res.status(400).json({
      error: 'Indiquez si les membres du personnel doivent relire et confirmer '
           + 'à nouveau cette version.' });
  }
  const reconfirmer = derniere ? (req.body.reconfirmer ? 1 : 0) : 1;

  if (req.body?.source_url !== undefined) {
    const source = lienSource(req.body.source_url);
    if (source === false) return res.status(400).json({ error: refusLien(req.body.source_url) });
    db.prepare('UPDATE corpus_document SET source_url = ? WHERE id = ?').run(source, d.id);
  }

  const numero = (derniere?.numero || 0) + 1;
  const info = db.prepare(`INSERT INTO corpus_version
    (document_id, numero, contenu, format, reconfirmer, resume_changement,
     publiee_par, publiee_par_role)
    VALUES (?,?,?,?,?,?,?,?)`).run(d.id, numero, contenu, format, reconfirmer,
      req.body?.resume_changement || null,
      auteur(req.user), req.user?.role || null);
  res.json({ ok: true, id: info.lastInsertRowid, numero, reconfirmer: !!reconfirmer });
});

/* RENOMMER N'EST PAS RÉÉCRIRE. Le titre et la nature sont des métadonnées :
 * les changer ne touche ni les versions publiées ni les confirmations données
 * — chacun s'est engagé sur un TEXTE, pas sur un intitulé. La clé, elle, ne
 * bouge jamais : les liens la citent pour toujours. */
r.patch('/:cle', authRequired, roleRequired(...PEUT_PUBLIER), (req, res) => {
  const d = db.prepare('SELECT id FROM corpus_document WHERE cle = ?').get(req.params.cle);
  if (!d) return res.status(404).json({ error: 'Document introuvable.' });
  const sets = [], vals = [];
  if (req.body?.titre !== undefined) {
    const titre = String(req.body.titre).trim();
    if (!titre) return res.status(400).json({ error: 'Le titre ne peut pas être vide.' });
    sets.push('titre = ?'); vals.push(titre);
  }
  if (req.body?.nature !== undefined) {
    const nature = String(req.body.nature).trim();
    if (!NATURES.some(n => n.cle === nature)) {
      return res.status(400).json({ error: 'Nature inconnue.' });
    }
    sets.push('nature = ?'); vals.push(nature);
  }
  if (!sets.length) return res.status(400).json({ error: 'Rien à modifier.' });
  db.prepare(`UPDATE corpus_document SET ${sets.join(', ')} WHERE id = ?`).run(...vals, d.id);
  res.json({ ok: true });
});

/** À QUI CE TEXTE S'IMPOSE — remplacé en bloc, comme une composition. */
r.put('/:cle/destinataires', authRequired, roleRequired(...PEUT_PUBLIER), (req, res) => {
  const d = db.prepare('SELECT * FROM corpus_document WHERE cle = ?').get(req.params.cle);
  if (!d) return res.status(404).json({ error: 'Document introuvable.' });
  const roles = Array.isArray(req.body?.roles) ? req.body.roles.filter(Boolean) : [];
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM corpus_destinataire WHERE document_id = ?').run(d.id);
    const ins = db.prepare('INSERT INTO corpus_destinataire (document_id, role) VALUES (?,?)');
    for (const role of [...new Set(roles)]) ins.run(d.id, role);
  });
  tx();
  res.json({ ok: true, roles: [...new Set(roles)] });
});

/* RETIRER N'EST PAS SUPPRIMER. Un texte retiré cesse de s'imposer et sort des
 * listes, mais il reste lisible : les confirmations posées dessus doivent
 * continuer de pouvoir se justifier. */
r.post('/:cle/retirer', authRequired, roleRequired(...PEUT_PUBLIER), (req, res) => {
  const d = db.prepare('SELECT * FROM corpus_document WHERE cle = ?').get(req.params.cle);
  if (!d) return res.status(404).json({ error: 'Document introuvable.' });
  db.prepare(`UPDATE corpus_document SET retire_le = datetime('now'), retire_par = ?
    WHERE id = ?`).run(auteur(req.user), d.id);
  res.json({ ok: true });
});

export default r;
