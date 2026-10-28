import { Router } from 'express';
import { dispensesDeLUE, dispenseDuCours } from '../lib/dispenses.js';
import db from '../db/index.js';
import { authRequired, roleRequired, getUserSections } from '../middleware/auth.js';
import { anneeDeTravail } from '../helpers/annee.js';
import { PEUT_INSTRUIRE } from '../lib/valorisation.js';
import { existsSync } from 'fs';
import { profConcerne, rendreAvis } from '../lib/avisVA.js';
import { chargerDossier, chargesDeCours } from '../lib/piecesAmenagement.js';
import { DECIDE } from '../lib/circuitAR.js';
import { ecrirePresences, minutesDe, STATUTS_PRESENCE, MOTIFS_JUSTIFIES } from '../lib/cep.js';
import { envelopperDocument, piedGabaritPdf, BANDE_PIED_MM } from '../lib/document.js';
import { capacitePdf, rendrePdf } from '../services/pdf.js';
import { LOGO_IIP_JPEG } from '../services/assets/logo_iip_jpeg.js';
import { piedDocument } from './parametres.js';
import { aRepresenterParCours } from './acquis.js';
import { attributionsDe, etudiantsDuCours } from '../lib/etudiantsCours.js';
import { donneesGrille, htmlGrille, excelGrille, premierDixieme } from '../lib/grillePresence.js';
import { archiverDocument } from '../services/document-archive.js';
import { lireSeance, qrDeLaSeance, compteurSeance, seancesACompleter, fenetreSeance, aujourdhuiBruxelles, migrerPresenceQr, modeEssai } from '../lib/presenceQr.js';

/**
 * MES COURS — la porte du professeur (25 septembre 2026).
 *
 * Un professeur qui se connecte trouve SES cours de l'année — tels que les
 * attributions les lui donnent — et, pour chacun, LA LISTE DE SES ÉTUDIANTS :
 * ceux de ses groupes quand la répartition existe, tous les inscrits de
 * l'unité sinon.
 *
 * IL PROPOSE, IL N'ÉCRIT PAS AU DOSSIER. La règle de la maison — la
 * coordination encode, la direction valide — ne change pas : la note saisie
 * ici est une PROPOSITION (`note_proposee`), que la coordination reprend
 * dans l'encodage officiel. C'est aussi ce qui permet d'ouvrir cette porte
 * sans toucher aux plafonds de rôles.
 *
 * La porte est SANS MODULE (carteModules) : chaque route vérifie elle-même
 * que le cours appartient au professeur connecté — comme « demandes », ce
 * qui appartient à chacun ne se ferme pas à celui qu'il concerne.
 */
const r = Router();

(function migrerNotesProposees() {
  try {
    /* LA PROPOSITION SE FAIT PAR ACQUIS D'APPRENTISSAGE (Jérôme, 29 septembre
     * 2026 : « tu n'as pas pris en compte les AA — tu fais encoder une note
     * par cours »). C'est la règle de la maison : l'évaluation est par AA, la
     * feuille officielle note par AA. aa_code entre donc dans la clé ;
     * '' (vide) reste la note de cours, pour les cours sans AA rattachés. */
    db.exec(`CREATE TABLE IF NOT EXISTS note_proposee (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      etudiant_id    INTEGER NOT NULL,
      annee_scolaire TEXT NOT NULL,
      cours_code     TEXT NOT NULL,
      aa_code        TEXT NOT NULL DEFAULT '',
      note           REAL,
      propose_par    TEXT,
      propose_le     TEXT,
      UNIQUE(etudiant_id, annee_scolaire, cours_code, aa_code)
    )`);
    const cols = db.prepare('PRAGMA table_info(note_proposee)').all().map(c => c.name);
    if (!cols.includes('aa_code')) {
      // Table d'avant la 2.12.150 : on la rebâtit, les notes de cours
      // existantes deviennent des lignes aa_code '' — rien ne se perd.
      db.exec(`
        ALTER TABLE note_proposee RENAME TO note_proposee_v1;
        CREATE TABLE note_proposee (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          etudiant_id    INTEGER NOT NULL,
          annee_scolaire TEXT NOT NULL,
          cours_code     TEXT NOT NULL,
          aa_code        TEXT NOT NULL DEFAULT '',
          note           REAL,
          propose_par    TEXT,
          propose_le     TEXT,
          UNIQUE(etudiant_id, annee_scolaire, cours_code, aa_code)
        );
        INSERT INTO note_proposee (etudiant_id, annee_scolaire, cours_code, aa_code,
                                   note, propose_par, propose_le)
          SELECT etudiant_id, annee_scolaire, cours_code, '', note, propose_par, propose_le
          FROM note_proposee_v1;
        DROP TABLE note_proposee_v1;
      `);
      console.log('[migration] note_proposee : passage par acquis (aa_code)');
    }
    /* PP ET NP (Charles, 26 septembre 2026) : « pas présenté » et « note de
     * présence ». Ce ne sont pas des notes : la note reste vide et la MENTION
     * dit pourquoi — une case vide, elle, veut dire « rien de proposé ». */
    if (!db.prepare('PRAGMA table_info(note_proposee)').all().some(c => c.name === 'mention')) {
      db.exec('ALTER TABLE note_proposee ADD COLUMN mention TEXT');
    }
    // Le justificatif d'un acquis sous le seuil (27 septembre 2026).
    if (!db.prepare('PRAGMA table_info(note_proposee)').all().some(c => c.name === 'justification')) {
      db.exec('ALTER TABLE note_proposee ADD COLUMN justification TEXT');
    }
    // La reprise dans l'encodage officiel laisse sa trace sur la proposition.
    for (const [c, t] of [['reprise_le', 'TEXT'], ['reprise_par', 'TEXT']]) {
      if (!db.prepare('PRAGMA table_info(note_proposee)').all().some(x => x.name === c)) db.exec(`ALTER TABLE note_proposee ADD COLUMN ${c} ${t}`);
    }
    /* LA SESSION ENTRE DANS LA CLÉ (22 octobre 2026, Charles, UE 333 : « les
     * professeurs ne savent pas encoder les points de la seconde session, ce
     * n'est pas prévu »). Une seule case par étudiant et par acquis pour toute
     * l'année : pour noter la seconde session, il fallait écraser la première. La table se
     * rebâtit (une contrainte UNIQUE ne se modifie pas) ; tout ce qui existe
     * devient session 1, les identifiants sont gardés, et une colonne que ce
     * code ne connaît pas est recopiée telle quelle. */
    const avant = db.prepare('PRAGMA table_info(note_proposee)').all();
    if (!avant.some(c => c.name === 'session')) {
      const connues = ['id', 'etudiant_id', 'annee_scolaire', 'cours_code', 'aa_code', 'note', 'propose_par',
        'propose_le', 'mention', 'justification', 'reprise_le', 'reprise_par'];
      const autres = avant.filter(c => !connues.includes(c.name));
      const copiees = avant.map(c => c.name);
      /* Le renommage ne doit pas dépendre du reste du schéma : sans le mode
         ancien, SQLite revalide TOUTES les vues, et une seule vue cassée ailleurs
         ferait échouer la migration — Mes cours entier tomberait, faute de la
         colonne. La table rebâtie n'a ni vue ni déclencheur à suivre (ceux de
         l'« Annuler » se reposent au démarrage). */
      db.pragma('legacy_alter_table = ON');
      try { db.transaction(() => {
        db.exec(`
          ALTER TABLE note_proposee RENAME TO note_proposee_v2;
          CREATE TABLE note_proposee (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            etudiant_id    INTEGER NOT NULL,
            annee_scolaire TEXT NOT NULL,
            cours_code     TEXT NOT NULL,
            aa_code        TEXT NOT NULL DEFAULT '',
            session        INTEGER NOT NULL DEFAULT 1,
            note           REAL,
            propose_par    TEXT,
            propose_le     TEXT,
            mention        TEXT,
            justification  TEXT,
            reprise_le     TEXT,
            reprise_par    TEXT${autres.map(c => `,\n            ${c.name} ${c.type || ''}`).join('')},
            UNIQUE(etudiant_id, annee_scolaire, cours_code, aa_code, session)
          );
          INSERT INTO note_proposee (${copiees.join(', ')}, session)
            SELECT ${copiees.join(', ')}, 1 FROM note_proposee_v2;
          DROP TABLE note_proposee_v2;
        `);
      })(); } finally { db.pragma('legacy_alter_table = OFF'); }
      console.log('[migration] note_proposee : la session entre dans la clé');
    }
  } catch (e) { console.error('[migration] note_proposee :', e.message); }
})();

/* Les acquis évalués par CE cours — la pondération seule en tient le compte,
 * comme pour la DUE. Sans lignes de pondération : repli sur le rattachement
 * direct aa.cours_code, puis, à défaut, la note de cours. */
function acquisDuCours(coursCode, ueNum, annee) {
  try {
    const lies = db.prepare(`
      SELECT p.aa_code, COALESCE(a.description, '') AS description,
             COALESCE(a.aa_num, 999) AS aa_num, p.poids
      FROM aa_ponderation p LEFT JOIN aa a ON a.aa_code = p.aa_code
      WHERE p.ue_num = ? AND p.annee_scolaire = ? AND p.cours_code = ?
      ORDER BY aa_num, p.aa_code`).all(ueNum, annee, coursCode);
    if (lies.length) return lies.map(x => ({ aa_code: x.aa_code, description: x.description, poids: x.poids ?? null }));
    return db.prepare(`
      SELECT aa_code, COALESCE(description, '') AS description
      FROM aa WHERE ue_num = ? AND cours_code = ?
      ORDER BY aa_num, aa_code`).all(ueNum, coursCode);
  } catch { return []; }
}

// Le dossier professeur du compte connecté — sans lui, pas de porte.
function profDe(req) {
  try {
    return db.prepare('SELECT professeur_id FROM utilisateur WHERE id = ?')
      .get(req.user?.id)?.professeur_id || null;
  } catch { return null; }
}


/* LA COORDINATION VOIT TOUS LES COURS DE SA SECTION (Charles, 26 septembre
 * 2026 : « comme elle a un rôle de coordination, elle doit pouvoir encoder les
 * notes dans Mes cours de tous les cours de TIM ; idem pour les autres
 * coordinations dans leur section »). Ses propres attributions d'abord, puis
 * les autres cours des sections de son périmètre — `getUserSections`, le même
 * que partout : `null` veut dire toutes. Pour un cours qui n'est pas le sien,
 * ses étudiants sont tous les inscrits de l'unité. Cela reste une PROPOSITION
 * de notes (`note_proposee`), reprise ensuite dans l'encodage officiel. */
function sectionsCoordination(req) {
  /* LA DIRECTION VOIT TOUT (Charles, 3 octobre 2026 : « la direction doit
     avoir accès à Mes cours, et tout voir — ça semble logique »). */
  if (['admin', 'directeur', 'directeur_adjoint'].includes(req.user?.role)) return null;
  if (req.user?.role !== 'coordination') return [];
  const s = getUserSections(req.user);
  return s === null ? null : s;        // null : toutes les sections
}
/* QUI DONNE CE COURS (Charles, 30 septembre 2026 : « il faudrait que le nom et
   le prénom du MP apparaissent »). Les titulaires de l'année, d'après les
   attributions : Prénom NOM, dans l'ordre des périodes. */
function enseignantsParCours(annee) {
  const m = new Map();
  for (const x of db.prepare(`SELECT a.code_cours, p.nom, p.prenom, SUM(COALESCE(a.periodes_attribuees, 0)) per
      FROM attribution a JOIN professeur p ON p.id = a.professeur_id
      WHERE a.annee_scolaire = ? AND a.code_cours IS NOT NULL
      GROUP BY a.code_cours, p.id ORDER BY per DESC`).all(annee)) {
    const nom = [String(x.prenom || '').trim(), String(x.nom || '').trim().toLocaleUpperCase('fr')].filter(Boolean).join(' ');
    if (!m.has(x.code_cours)) m.set(x.code_cours, []);
    if (nom && !m.get(x.code_cours).includes(nom)) m.get(x.code_cours).push(nom);
  }
  return m;
}

function coursDesSections(sections, annee) {
  if (Array.isArray(sections) && !sections.length) return [];
  const ph = Array.isArray(sections) ? sections.map(() => '?').join(',') : null;
  // Un agrégat ne se passe pas à une sous-requête corrélée (SQLite refuse
  // « misuse of aggregate ») : on regroupe d'abord, on nomme l'unité ensuite.
  return db.prepare(`
    SELECT g.*, (SELECT x.ue_nom FROM ue x WHERE x.ue_num = g.ue_num AND x.ue_nom IS NOT NULL
                  ORDER BY x.annee_scolaire DESC LIMIT 1) AS ue_nom,
                (SELECT x.ue_niv FROM ue x WHERE x.ue_num = g.ue_num AND x.ue_niv IS NOT NULL
                  AND (g.section IS NULL OR x.section = g.section)
                  ORDER BY x.annee_scolaire DESC LIMIT 1) AS ue_niv
    FROM (
      SELECT c.cours_code, MIN(c.cours_nom) AS cours_nom, MIN(c.ue_num) AS ue_num, MIN(c.section) AS section
      FROM cours c
      WHERE c.annee_scolaire = ? AND c.cours_code IS NOT NULL
        ${ph ? `AND c.section IN (${ph})` : ''}
      GROUP BY c.cours_code
    ) g
    ORDER BY g.ue_num, g.cours_code`).all(annee, ...(ph ? sections : []));
}
/** Qui peut ouvrir ce cours, et avec quels étudiants : ses attributions
 *  d'abord ; à défaut, la coordination de la section. `null` : personne. */
function accesCours(req, coursCode, annee) {
  const profId = profDe(req);
  const mien = profId ? etudiantsDuCours(profId, coursCode, annee) : null;
  if (mien) return { ...mien, portee: 'attribution' };
  const secs = sectionsCoordination(req);
  if (secs !== null && !secs.length) return null;
  const c = coursDesSections(secs, annee).find(x => x.cours_code === coursCode);
  if (!c) return null;
  const groupes = new Map();
  for (const g of db.prepare(`SELECT etudiant_id, num_organisation, groupe_code FROM etudiant_cours_groupe
      WHERE annee_scolaire = ? AND cours_code = ?`).all(annee, coursCode)) {
    const l = `Org ${g.num_organisation ?? 1}${g.groupe_code ? ` · Gr. ${g.groupe_code}` : ''}`;
    groupes.set(g.etudiant_id, groupes.has(g.etudiant_id) ? `${groupes.get(g.etudiant_id)} + ${l}` : l);
  }
  const etudiants = db.prepare(`
    SELECT e.id, e.nom, e.prenom, e.id_ecampus
    FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
    WHERE i.annee_scolaire = ? AND i.ue_num = ? AND e.actif = 1
    ORDER BY e.nom, e.prenom`).all(annee, c.ue_num)
    .map(e => ({ ...e, groupe: groupes.get(e.id) || '' }));
  return { miennes: [], ueNum: c.ue_num, etudiants, repartition: groupes.size > 0, portee: 'coordination' };
}

/* LA SÉANCE QUI COMPTE, ÉTUDIANT PAR ÉTUDIANT (23 octobre 2026, Charles, UE 333 :
 * « je ne vois pas où introduire la seconde session »). La première version
 * ouvrait la seconde session pour l'UNITÉ entière — toutes les décisions de première session
 * encodées, toutes les séances closes. Or l'UE 333 délibère PAR ORGANISATION :
 * tant qu'une organisation n'a pas tenu sa séance, aucune n'ouvrait la sienne,
 * et l'écran ne disait même pas pourquoi. Un étudiant suit désormais la séance
 * de SON organisation (`etudiant_inscription.num_organisation`) ; sans séance
 * par organisation, c'est la séance de l'unité. */
function clotures(ueNum, annee) {
  let seances = [];
  try {
    seances = db.prepare(`SELECT session, num_organisation AS org, cloturee FROM deliberation_seance
      WHERE ue_num = ? AND annee_scolaire = ?`).all(ueNum, annee);
  } catch { seances = []; }
  const orgDe = new Map();
  try {
    for (const x of db.prepare(`SELECT etudiant_id, num_organisation FROM etudiant_inscription
        WHERE ue_num = ? AND annee_scolaire = ?`).all(ueNum, annee)) orgDe.set(x.etudiant_id, Number(x.num_organisation) || 0);
  } catch { /* colonne absente : l'unité entière */ }
  return (session, etudiantId) => {
    const s = seances.filter(x => x.session === session);
    const parOrg = s.filter(x => x.org > 0);
    if (parOrg.length) {
      const o = orgDe.get(etudiantId) || 0;
      // Sans organisation, l'étudiant attend que toutes les séances soient closes.
      if (o > 0) return !!parOrg.find(x => x.org === o)?.cloturee;
      return parOrg.every(x => x.cloturee);
    }
    // La ligne « unité entière » ne compte que s'il n'y a pas de séance par organisation.
    return !!s.find(x => x.org === 0)?.cloturee;
  };
}

/* LA FEUILLE DE SECONDE SESSION : les seuls ajournés qui représentent CE cours,
 * et pour chacun les seuls acquis rouverts — la règle de la liste imprimée des
 * ajournés par cours (`aRepresenterParCours`), pour que la feuille et la liste
 * nomment les mêmes étudiants. Restreinte aux étudiants de l'enseignant, et à
 * ceux dont la séance de première session est close. Un cours sans acquis rattachés garde sa
 * note de cours (clé ''). */
function etatSeconde(d, coursCode, annee, acquis, close) {
  let liste = [];
  try { liste = aRepresenterParCours(d.ueNum, annee, 1)[coursCode] || []; } catch (e) { console.error('[seconde session]', e.message); }
  const tous = acquis.length ? acquis.map(a => a.aa_code) : [''];
  const miens = new Set(d.etudiants.map(e => e.id));
  const ajournes = liste.filter(x => miens.has(x.id));
  const ouverts = new Map(ajournes.filter(x => close(1, x.id)).map(x => [x.id, (x.aas || []).filter(a => tous.includes(a))]));
  return {
    ajournes: ajournes.length,
    en_attente: ajournes.length - ouverts.size,
    etudiants: d.etudiants.filter(e => ouverts.has(e.id)).map(e => ({ ...e,
      aa_ouverts: ouverts.get(e.id).length ? ouverts.get(e.id) : tous,
      clos: close(2, e.id) })),
  };
}

/* LES DEUX SESSIONS D'UN COURS. Une session close ne se propose plus : la note
 * n'entrerait nulle part, et l'enseignant croirait l'avoir donnée. Et quand la
 * seconde n'est pas ouverte, l'écran dit POURQUOI — c'est l'absence de toute
 * phrase qui a fait chercher le bouton. */
function sessionsDuCours(d, coursCode, annee, acquis) {
  const close = clotures(d.ueNum, annee);
  const sec = etatSeconde(d, coursCode, annee, acquis, close);
  const possible = sec.etudiants.length > 0;
  const raison = possible ? null
    : sec.en_attente > 0
      ? `${sec.en_attente} étudiant(s) ajourné(s) dans ce cours : la seconde session s'ouvrira ici à la clôture de la séance de première session de leur organisation.`
      : d.etudiants.length && d.etudiants.every(e => close(1, e.id))
        ? "Aucun de vos étudiants n'a été ajourné dans ce cours en première session : il n'y a pas de note de seconde session à encoder."
        : "La seconde session s'ouvrira ici, pour les étudiants ajournés, à la clôture de la séance de première session.";
  return {
    close, seconde: sec,
    public: {
      seconde_possible: possible,
      seconde_raison: raison,
      // Les ajournés dont l'organisation n'a pas encore clos sa séance de première session.
      seconde_en_attente: possible ? sec.en_attente : 0,
    },
  };
}

// ── Mes cours de l'année ─────────────────────────────────────────────────────
/* ══ LES AVIS DE VALORISATION, DANS L'ESPACE DU CHARGÉ DE COURS ══════════════
 * (Charles, 2 octobre 2026.) Le chargé de cours attribué aux cours visés voit
 * la demande dès qu'elle est recevable, ouvre les pièces déposées, et rend SON
 * avis — sens et motivation, obligatoires. Il le corrige tant que le Conseil
 * n'a pas décidé ; ensuite il le relit. Celui qui clique est celui qui signe :
 * l'avis porte le nom du dossier professeur du compte connecté. */
function dossierVA(vid) {
  return db.prepare(`SELECT v.*, e.nom AS e_nom, e.prenom AS e_prenom, e.id_ecampus,
      (SELECT ue_nom FROM ue u WHERE u.ue_num = v.ue_num AND u.ue_nom IS NOT NULL ORDER BY u.annee_scolaire DESC LIMIT 1) AS ue_nom,
      (SELECT section FROM ue u WHERE u.ue_num = v.ue_num AND u.section IS NOT NULL ORDER BY u.annee_scolaire DESC LIMIT 1) AS section
      FROM etudiant_valorisation v JOIN etudiant e ON e.id = v.etudiant_id WHERE v.id = ?`).get(vid);
}

/* CE QUI A ÉTÉ SOUMIS AUX ENSEIGNANTS AVANT LEUR ARRIVÉE NE LES ATTEND PAS (Charles, 12 octobre 2026 :
   « les aménagements raisonnables et les VA encodés avant ce jour ne doivent plus être visibles pour
   les profs ; tout ce qui se fait à partir d'aujourd'hui et qui les concerne, si »). Une date de
   départ (`lucie_config` « mes_cours_depuis », 12 octobre 2026 par défaut) : une demande d'avis
   posée avant elle ne paraît plus dans Mes cours. Rien n'est effacé ; le dossier reste entier. */
function depuisMesCours() {
  try { return db.prepare("SELECT valeur FROM lucie_config WHERE cle = 'mes_cours_depuis'").get()?.valeur || '2026-10-12'; }
  catch { return '2026-10-12'; }
}
const avantDepart = date => !!date && String(date).slice(0, 10) < depuisMesCours();

r.get('/valorisations', authRequired, (req, res) => {
  const pid = profDe(req);
  if (!pid) return res.json({ dossiers: [], sans_dossier_professeur: true });
  const annee = req.query.annee || anneeDeTravail(req);
  const ids = db.prepare(`SELECT id FROM etudiant_valorisation WHERE recevable = 1 AND ue_num > 0
      AND annee_scolaire = ?`).all(annee).map(x => x.id);
  const dossiers = [];
  for (const id of ids) {
    const v = dossierVA(id);
    if (!v || !profConcerne(v, pid)) continue;
    if (avantDepart(v.recevabilite_le)) continue;          // soumis avant la date de départ
    const avis = db.prepare('SELECT professeur_id, auteur, sens, texte, rendu_le FROM valorisation_avis WHERE valorisation_id = ? ORDER BY rendu_le').all(id);
    const mien = avis.find(a => a.professeur_id === pid) || null;
    dossiers.push({
      id, annee: v.annee_scolaire, etudiant: `${(v.e_nom || '').toUpperCase()} ${v.e_prenom || ''}`.trim(), id_ecampus: v.id_ecampus,
      section: v.section, ue_num: v.ue_num, ue_nom: v.ue_nom, porte: v.porte,
      cours_demandes: v.cible === 'cours' ? String(v.cible_detail || '').split(',').map(x => x.trim()).filter(Boolean) : [],
      recevable_le: v.recevabilite_le, decision_le: v.decision_le, valide_le: v.valide_le,
      mon_avis: mien ? { sens: mien.sens, texte: mien.texte, rendu_le: mien.rendu_le } : null,
      autres_avis: avis.filter(a => a.professeur_id !== pid).map(a => ({ auteur: a.auteur, sens: a.sens, texte: a.texte, rendu_le: a.rendu_le })),
      // L'avis déjà saisi par la coordination, s'il n'est pas encore dans la liste.
      avis_dossier: !avis.length && v.avis_le ? { auteur: v.avis_par, sens: v.avis_sens, texte: v.avis_texte, rendu_le: v.avis_le } : null,
      fichiers: db.prepare('SELECT id, nom, nature, taille FROM etudiant_valorisation_fichier WHERE valorisation_id = ? ORDER BY id').all(id),
    });
  }
  dossiers.sort((a, b) => (!!a.mon_avis - !!b.mon_avis) || (!!a.decision_le - !!b.decision_le) || a.etudiant.localeCompare(b.etudiant, 'fr'));
  res.json({ annee, dossiers });
});

r.get('/valorisations/fichiers/:fid', authRequired, (req, res) => {
  const pid = profDe(req);
  const f = db.prepare('SELECT * FROM etudiant_valorisation_fichier WHERE id = ?').get(Number(req.params.fid));
  if (!f || !existsSync(f.chemin)) return res.status(404).json({ error: 'Pièce introuvable' });
  const v = dossierVA(f.valorisation_id);
  // 404 et non 403 : « interdit » confirmerait que la pièce existe.
  if (!v || v.recevable !== 1 || !profConcerne(v, pid)) return res.status(404).json({ error: 'Pièce introuvable' });
  res.download(f.chemin, f.nom);
});

r.put('/valorisations/:vid/avis', authRequired, (req, res) => {
  const pid = profDe(req);
  if (!pid) return res.status(403).json({ error: 'Votre compte n’est relié à aucun dossier professeur : l’avis ne peut pas porter votre nom.' });
  const v = dossierVA(Number(req.params.vid));
  if (!v || !profConcerne(v, pid)) return res.status(404).json({ error: 'Demande introuvable.' });
  if (v.recevable !== 1) return res.status(409).json({ error: 'La demande n’est pas (ou plus) déclarée recevable.' });
  if (v.decision_le || v.valide_le) return res.status(409).json({ error: 'Le Conseil a déjà décidé : l’avis ne se modifie plus.' });
  const sens = String(req.body?.sens || '');
  if (!['favorable', 'partiel', 'defavorable'].includes(sens)) return res.status(400).json({ error: 'Le sens de l’avis est requis : favorable, partiel ou défavorable.' });
  const texte = String(req.body?.texte || '').trim();
  if (texte.length < 15) return res.status(400).json({ error: 'Un avis se motive par écrit : ce que vous avez comparé au dossier pédagogique, et ce que vous en concluez. Il n’y a pas de recours ensuite.' });
  rendreAvis(req, v, pid, sens, texte);
  res.json({ ok: true });
});

/* ══ LES AMÉNAGEMENTS RAISONNABLES, DANS L'ESPACE DU CHARGÉ DE COURS ══════
 * (Charles, 2 octobre 2026.) Quand le rapport (volet B) est validé, les
 * chargés de cours des unités concernées voient la demande et rendent leur
 * avis, MESURE PAR MESURE : réalisable, avec adaptation, pas réalisable — motivé
 * dès que ce n'est pas « réalisable ». SECRET PROFESSIONNEL (art. 5) : ils ne
 * voient que les mesures et leurs précisions, jamais la pièce, les soins, le
 * diagnostic ni la motivation. */
function arDuProf(pid, annee) {
  const out = [];
  for (const x of db.prepare(`SELECT id FROM amenagement_dossier WHERE annee_scolaire = ? AND valide_b_le IS NOT NULL`).all(annee)) {
    const d = chargerDossier(x.id);
    if (!d) continue;
    const moi = chargesDeCours(d).find(p => p.id === pid);
    if (!moi) continue;
    out.push({ d, ues: moi.ues });
  }
  return out;
}
r.get('/amenagements', authRequired, (req, res) => {
  const pid = profDe(req);
  if (!pid) return res.json({ dossiers: [] });
  const annee = req.query.annee || anneeDeTravail(req);
  const dossiers = arDuProf(pid, annee).filter(({ d }) => !avantDepart(d.avis_demande_le || d.valide_b_le)).map(({ d, ues }) => {
    const mesures = d.mesures.filter(m => !m.ue_num || ues.includes(m.ue_num));
    const avis = db.prepare('SELECT mesure_id, professeur_id, auteur, sens, motif, rendu_le FROM amenagement_avis WHERE dossier_id = ?').all(d.id);
    return {
      id: d.id, etudiant: `${String(d.etudiant?.nom || '').toUpperCase()} ${d.etudiant?.prenom || ''}`.trim(),
      id_ecampus: d.etudiant?.id_ecampus || null, section: d.section, ues,
      appele_le: d.avis_demande_le || d.valide_b_le,
      decide: DECIDE.includes(d.statut) || !!d.cde_date,
      mesures: mesures.map(m => ({ id: m.id, libelle: m.libelle, precisions: m.precisions, portee: m.portee, nature: m.nature,
        ue_num: m.ue_num, accorde: DECIDE.includes(d.statut) ? !!m.accorde : null,
        mon_avis: avis.find(a => a.mesure_id === m.id && a.professeur_id === pid) || null,
        autres: avis.filter(a => a.mesure_id === m.id && a.professeur_id !== pid).map(a => ({ auteur: a.auteur, sens: a.sens, motif: a.motif })) })),
    };
  });
  res.json({ annee, dossiers });
});
r.put('/amenagements/:id/avis', authRequired, (req, res) => {
  const pid = profDe(req);
  if (!pid) return res.status(403).json({ error: 'Votre compte n’est relié à aucun dossier professeur : l’avis ne peut pas porter votre nom.' });
  const d = chargerDossier(Number(req.params.id));
  if (!d || !d.valide_b_le || !chargesDeCours(d).some(p => p.id === pid)) return res.status(404).json({ error: 'Demande introuvable.' });
  if (DECIDE.includes(d.statut) || d.cde_date) return res.status(409).json({ error: 'Le Conseil a décidé : l’avis ne se modifie plus.' });
  const lignes = Array.isArray(req.body?.avis) ? req.body.avis : [];
  const ids = new Set(d.mesures.map(m => m.id));
  for (const l of lignes) {
    if (!ids.has(Number(l.mesure_id))) return res.status(400).json({ error: 'Mesure inconnue pour ce dossier.' });
    if (!['realisable', 'adaptation', 'impossible'].includes(l.sens)) return res.status(400).json({ error: 'Le sens de l’avis est requis pour chaque mesure.' });
    if (l.sens !== 'realisable' && String(l.motif || '').trim().length < 5) return res.status(400).json({ error: 'Un avis « avec adaptation » ou « pas réalisable » se motive.' });
  }
  const p = db.prepare('SELECT nom, prenom FROM professeur WHERE id = ?').get(pid);
  const auteur = p ? `${String(p.nom || '').toUpperCase()} ${p.prenom || ''}`.trim() : (req.user?.nom || null);
  const ecr = db.prepare(`INSERT INTO amenagement_avis (dossier_id, mesure_id, professeur_id, auteur, sens, motif)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(mesure_id, professeur_id) DO UPDATE SET sens = excluded.sens,
    motif = excluded.motif, auteur = excluded.auteur, rendu_le = datetime('now')`);
  db.transaction(() => { for (const l of lignes) ecr.run(d.id, Number(l.mesure_id), pid, auteur, l.sens, String(l.motif || '').trim() || null); })();
  res.json({ ok: true, ecrits: lignes.length });
});

r.get('/', authRequired, (req, res) => {
  const annee = req.query.annee || anneeDeTravail(req);
  const profId = profDe(req);
  const secs = sectionsCoordination(req);
  const coordination = secs === null || secs.length > 0;
  if (!profId && !coordination) {
    return res.status(403).json({ error: "Ce compte n'est lié à aucun dossier professeur." });
  }
  const attrs = profId ? attributionsDe(profId, annee) : [];
  const parCours = new Map();
  for (const a of attrs) {
    const c = parCours.get(a.code_cours) || {
      cours_code: a.code_cours, cours_nom: a.cours_nom, ue_num: a.ue_num,
      ue_nom: a.ue_nom, section: a.section || null, ue_niv: a.ue_niv || null, groupes: [],
    };
    c.groupes.push(`${a.activite_libelle ? `${a.activite_libelle} · ` : ''}Org ${a.org}${a.groupe ? ` · Gr. ${a.groupe}` : ''}`);
    parCours.set(a.code_cours, c);
  }
  const cours = [...parCours.values()].map(c => {
    const d = etudiantsDuCours(profId, c.cours_code, annee);
    return { ...c, a_moi: true, nb_etudiants: d ? d.etudiants.length : 0,
      repartition: d ? d.repartition : false };
  });
  // Les autres cours de la section, pour la coordination.
  let section = [];
  if (coordination) {
    const nbInscrits = new Map(db.prepare(`SELECT ue_num, COUNT(DISTINCT etudiant_id) AS n
      FROM etudiant_inscription WHERE annee_scolaire = ? GROUP BY ue_num`).all(annee).map(x => [x.ue_num, x.n]));
    section = coursDesSections(secs, annee)
      .filter(c => !parCours.has(c.cours_code))
      .map(c => ({ ...c, a_moi: false, groupes: [], nb_etudiants: nbInscrits.get(c.ue_num) || 0 }));
  }
  const ens = enseignantsParCours(annee);
  for (const c of [...cours, ...section]) c.enseignants = ens.get(c.cours_code) || [];
  res.json({ annee, cours: [...cours, ...section],
    sections_coordination: coordination ? (secs === null ? 'toutes' : secs) : null });
});

// ── LA GRILLE DE PRÉSENCE (28 octobre 2026) ─────────────────────────────────
/* Les étudiants en lignes, les séances en colonnes : par cours (le professeur,
 * depuis Mes cours) et par UE (la vérificatrice contrôle les présences dans
 * l'UE). Produite ICI, comme les listes par groupe : un professeur n'entre pas
 * dans le centre d'impression, et c'est l'appartenance du cours qui l'autorise.
 * ?format=html : l'aperçu commun ; xlsx : le classeur ; sinon le PDF, archivé.
 * ?du=&au= bornent la période (toute l'année par défaut). */
const ROLES_GRILLE_UE = ['admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat', 'coordination'];
const dateOk = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
const periode = q => {
  const du = dateOk(q.du), au = dateOk(q.au);
  return { du, au, ligne: du || au ? `Période : ${du ? du.split('-').reverse().join('/') : 'début'} – ${au ? au.split('-').reverse().join('/') : 'aujourd’hui'}` : 'Toute l’année' };
};
/** La grille de l'UE est-elle permise ? Direction, secrétariat, et la coordination de SA section. */
function grilleUEPermise(req, ueNum) {
  if (!ROLES_GRILLE_UE.includes(req.user?.role)) return false;
  const perim = getUserSections(req.user);
  if (!perim) return true;
  return db.prepare('SELECT DISTINCT section FROM ue WHERE ue_num = ? AND section IS NOT NULL').all(ueNum)
    .some(x => perim.includes(x.section));
}
/** Toutes les séances de l'UE, tous ses cours : la grille de l'UE, et son premier dixième. */
function seancesDeLUE(ueNum, annee) {
  const coursUE = db.prepare('SELECT cours_code, MIN(cours_nom) AS nom FROM cours WHERE ue_num = ? AND annee_scolaire = ? GROUP BY cours_code').all(ueNum, annee);
  const codes = coursUE.map(c => c.cours_code);
  const seances = db.prepare(`SELECT id, date, heure_debut, heure_fin, minutes, cours_code, sous_groupe, COALESCE(annule, 0) AS annule
    FROM horaire_seance WHERE annee_scolaire = ? AND (ue_num = ?${codes.length ? ` OR cours_code IN (${codes.map(() => '?').join(',')})` : ''})`).all(annee, ueNum, ...codes);
  return { coursUE, seances };
}
async function repondreGrille(req, res, g, { titre, sous, ligne, ue = false, cours = {}, nom, annee }) {
  const fichier = nom.replace(/[^A-Za-z0-9_.-]+/g, '_');
  if (req.query.format === 'xlsx') {
    const buf = await excelGrille(g, { titre: `${titre} — ${sous} — ${ligne}`, ue, cours });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fichier}.xlsx"`);
    return res.end(Buffer.from(buf));
  }
  const html = htmlGrille(g, { titre, sous, ligne, ue, cours });
  if (req.query.format === 'html') return res.json({ html, nom: fichier });
  const cap = await capacitePdf();
  if (!cap.disponible) return res.json({ html, nom: fichier });
  try {
    const pdf = await rendrePdf(html, { pagination: 'si-plusieurs', orientation: 'paysage',
      pied: avecNum => piedGabaritPdf(LOGO_IIP_JPEG, piedDocument(), avecNum),
      marges: { top: '12mm', right: '12mm', bottom: `${BANDE_PIED_MM}mm`, left: '12mm' } });
    archiverDocument({ type_doc: ue ? 'grille_presence_ue' : 'grille_presence_cours', annee_scolaire: annee,
      nom_fichier: `${fichier}.pdf`, pdf, genere_par: req.user?.email || req.user?.nom || null });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fichier}.pdf"`);
    res.end(pdf);
  } catch (e) { res.json({ html, nom: fichier, avertissement: e.message }); }
}

r.get('/ue/:ueNum/grille-presences', authRequired, async (req, res) => {
  const ueNum = Number(req.params.ueNum);
  const annee = String(req.query.annee || anneeDeTravail(req));
  if (!grilleUEPermise(req, ueNum)) return res.status(403).json({ error: 'La grille de l’UE se sort au secrétariat, à la direction ou par la coordination de la section.' });
  const { coursUE, seances } = seancesDeLUE(ueNum, annee);
  const etudiants = db.prepare(`SELECT DISTINCT e.id, e.nom, e.prenom, e.id_ecampus FROM etudiant_inscription i
    JOIN etudiant e ON e.id = i.etudiant_id WHERE i.annee_scolaire = ? AND i.ue_num = ? AND e.actif = 1`).all(annee, ueNum);
  const ueNom = db.prepare('SELECT MIN(ue_nom) n FROM ue WHERE ue_num = ? AND annee_scolaire = ?').get(ueNum, annee)?.n || '';
  const p = periode(req.query);
  const g = donneesGrille({ seances, etudiants, du: p.du, au: p.au, dixieme: premierDixieme(seances) });
  await repondreGrille(req, res, g, { titre: `Grille de présence — UE ${ueNum}${ueNom ? ` · ${ueNom}` : ''}`,
    sous: `${coursUE.length} cours · ${etudiants.length} inscrits · ${annee}`, ligne: p.ligne, ue: true,
    cours: Object.fromEntries(coursUE.map(c => [c.cours_code, c.nom])), nom: `Presences_UE${ueNum}_${annee}`, annee });
});

r.get('/:coursCode/grille-presences', authRequired, async (req, res) => {
  const annee = String(req.query.annee || anneeDeTravail(req));
  const code = req.params.coursCode;
  const d = accesCours(req, code, annee);
  if (!d) return res.status(403).json({ error: "Ce cours n'est ni dans vos attributions, ni dans votre section." });
  const nom = db.prepare('SELECT cours_nom FROM cours WHERE cours_code = ? ORDER BY (annee_scolaire = ?) DESC LIMIT 1').get(code, annee)?.cours_nom || '';
  const p = periode(req.query);
  // Le premier dixième est celui de l'UE, pas du cours : il se calcule sur toutes ses séances.
  const g = donneesGrille({ seances: seancesDuCours(req, d, code, annee), etudiants: d.etudiants, du: p.du, au: p.au,
    dixieme: premierDixieme(seancesDeLUE(d.ueNum, annee).seances) });
  const profs = enseignantsParCours(annee).get(code) || [];
  await repondreGrille(req, res, g, { titre: `Grille de présence — ${code}${nom ? ` · ${nom}` : ''}`,
    sous: `UE ${d.ueNum}${profs.length ? ` · ${profs.join(', ')}` : ''} · ${annee}`, ligne: p.ligne,
    nom: `Presences_${code}_${annee}`, annee });
});

// ── LA PRÉSENCE PAR QR, CÔTÉ ENSEIGNANT (28 octobre 2026) ──────────────────
/* « LA CHOSE LA PLUS SIMPLE POSSIBLE POUR LE PROF » (Charles) : il n'a pas à
 * chercher sa séance — Lucie lui propose celles du jour, celle dont la fenêtre
 * est ouverte en tête. Les droits sont ceux des présences manuelles : le
 * professeur pour SES séances, la coordination et la direction pour celles du cours. */
try { migrerPresenceQr(); } catch (e) { console.error('[migration] présence QR :', e.message); }

function seanceAccessible(req, coursCode, seanceId) {
  const s = lireSeance(seanceId);
  if (!s || s.cours_code !== coursCode) return null;
  const d = accesCours(req, coursCode, s.annee_scolaire);
  if (!d) return null;
  return seancesDuCours(req, d, coursCode, s.annee_scolaire).some(x => x.id === s.id) ? s : null;
}

/* MA JOURNÉE (Charles, 28 octobre 2026 : « un aperçu de ses cours du jour sous la
 * forme d'un mini calendrier ; s'il clique dessus, il peut prendre les présences,
 * encoder une note, avoir la liste des étudiants »). Les séances du professeur
 * pour une date (aujourd'hui par défaut), avec ce qu'il faut pour agir dessus :
 * la fenêtre du QR, et où en sont les présences. */
r.get('/journee', authRequired, (req, res) => {
  const aujourdhui = aujourdhuiBruxelles();
  const jour = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || '')) ? String(req.query.date) : aujourdhui;
  const profId = profDe(req);
  /* L'ANNÉE EST CELLE DES SÉANCES DU JOUR, pas celle que Mes cours affiche : un
     professeur qui relit l'an passé doit quand même trouver le QR de ce matin. */
  const annees = db.prepare('SELECT DISTINCT annee_scolaire a FROM horaire_seance WHERE date = ?').all(jour).map(x => x.a);
  const encodees = db.prepare('SELECT COUNT(*) n FROM presence WHERE seance_id = ?');
  const out = [];
  for (const annee of annees) {
    const attrs = profId ? attributionsDe(profId, annee) : [];
    for (const code of [...new Set(attrs.map(a => a.code_cours))]) {
      const d = accesCours(req, code, annee);
      if (!d) continue;
      const a = attrs.find(x => x.code_cours === code);
      for (const s of seancesDuCours(req, d, code, annee).filter(x => x.date === jour)) {
        out.push({ id: s.id, annee, cours_code: code, cours_nom: a?.cours_nom || '', ue_num: a?.ue_num ?? null,
          matiere: s.matiere, heure_debut: s.heure_debut, heure_fin: s.heure_fin, local: s.local_texte || '',
          sous_groupe: s.sous_groupe, annule: !!s.annule,
          fenetre: jour === aujourdhui ? fenetreSeance({ ...s }, new Date()) : null,
          presences: { encodees: encodees.get(s.id).n, attendus: d.etudiants.length } });
      }
    }
  }
  out.sort((x, y) => String(x.heure_debut).localeCompare(String(y.heure_debut)));
  res.json({ jour, aujourdhui, seances: out, essai: modeEssai() });
});

/* LE TABLEAU DE BORD DEMANDE CE QU'IL EN EST DES ABSENTS (Charles : « une fenêtre
 * dans Lucie qui dit au prof : les étudiants suivants n'ont pas noté leur
 * présence — présents, absents ou autre »). Les séances qu'il a projetées, la
 * fenêtre fermée ; il complète par la route des présences, une fois qu'il a vu. */
r.get('/qr/a-completer', authRequired, (req, res) => {
  res.json({ seances: seancesACompleter(req.user?.id), statuts: STATUTS_PRESENCE, motifs: MOTIFS_JUSTIFIES });
});

r.get('/:coursCode/qr/:seanceId', authRequired, (req, res) => {
  const s = seanceAccessible(req, req.params.coursCode, req.params.seanceId);
  if (!s) return res.status(404).json({ error: 'Séance introuvable dans vos séances de ce cours.' });
  const x = qrDeLaSeance(s, req.user);
  if (x.erreur) return res.status(409).json({ ...x, error: x.message });
  res.json({ ...x, compteur: compteurSeance(s) });
});

r.get('/:coursCode/qr/:seanceId/compteur', authRequired, (req, res) => {
  const s = seanceAccessible(req, req.params.coursCode, req.params.seanceId);
  if (!s) return res.status(404).json({ error: 'Séance introuvable dans vos séances de ce cours.' });
  res.json(compteurSeance(s));
});

// ── La feuille d'un cours : mes étudiants et mes propositions ────────────────
r.get('/:coursCode/etudiants', authRequired, (req, res) => {
  const annee = req.query.annee || anneeDeTravail(req);
  const d = accesCours(req, req.params.coursCode, annee);
  if (!d) return res.status(403).json({ error: "Ce cours n'est ni dans vos attributions, ni dans votre section." });

  const acquis = acquisDuCours(req.params.coursCode, d.ueNum, annee);
  const etat = sessionsDuCours(d, req.params.coursCode, annee, acquis);
  const sessions = etat.public;
  // Sans demande explicite, la feuille s'ouvre sur la session en cours : la
  // seconde dès qu'elle est ouverte — c'est elle que l'enseignant vient remplir.
  const session = req.query.session ? (Number(req.query.session) === 2 ? 2 : 1)
    : (sessions.seconde_possible ? 2 : 1);
  if (session === 2 && !sessions.seconde_possible) return res.status(409).json({ error: sessions.seconde_raison });
  // En seconde session, la feuille ne porte que les ajournés de ce cours ; en
  // première, chaque ligne dit si la séance de l'étudiant est close.
  d.etudiants = session === 2 ? etat.seconde.etudiants
    : d.etudiants.map(e => ({ ...e, clos: etat.close(1, e.id) }));
  const props = {}, justifs = {}, propsS1 = {};
  for (const x of db.prepare(`
    SELECT etudiant_id, aa_code, note, mention, justification, session FROM note_proposee
    WHERE annee_scolaire = ? AND cours_code = ? AND session <= ?`).all(annee, req.params.coursCode, session)) {
    if (x.session !== session) { (propsS1[x.etudiant_id] ||= {})[x.aa_code || ''] = x.mention || x.note; continue; }
    (props[x.etudiant_id] ||= {})[x.aa_code || ''] = x.mention || x.note;
    if (x.justification) (justifs[x.etudiant_id] ||= {})[x.aa_code || ''] = x.justification;
  }

  /* LES COURS REPORTÉS SE VOIENT, ET NE SE NOTENT PAS (27 septembre 2026) :
     l'étudiant a maîtrisé tous les acquis de ce cours l'an passé ; ses notes
     sont reprises d'office. Le professeur les lit, il ne les propose pas. */
  const reportes = {};
  try {
    for (const x of db.prepare(`
      SELECT r.etudiant_id, r.annee_origine, n.code, n.points
      FROM etudiant_report_note r
      LEFT JOIN etudiant_note_detail n ON n.etudiant_id = r.etudiant_id AND n.annee_scolaire = r.annee_scolaire
        AND n.ue_num = r.ue_num AND n.cours_code = r.cours_code AND n.origine LIKE 'report:%'
      WHERE r.annee_scolaire = ? AND r.cours_code = ? AND r.statut = 'accorde'`).all(annee, req.params.coursCode)) {
      const o = (reportes[x.etudiant_id] ||= { annee_origine: x.annee_origine, notes: {} });
      if (x.code) o.notes[String(x.code).split('|').pop()] = x.points;
    }
  } catch { /* tables absentes */ }

  /* LES AMÉNAGEMENTS RAISONNABLES SE VOIENT LÀ OÙ L'ON ENSEIGNE (Charles,
     29 septembre 2026). Seules les MESURES accordées, pour une décision
     rendue, et pour cette unité — jamais la nature de la situation, la pièce
     ni la motivation : le secret professionnel s'applique (décret du 30 juin
     2016, art. 5). Aucune unité cochée au dossier veut dire toutes. */
  const amenagements = {};
  try {
    for (const x of db.prepare(`
      SELECT d.etudiant_id, m.libelle, m.precisions, m.portee
      FROM amenagement_dossier d JOIN amenagement_mesure m ON m.dossier_id = d.id
      WHERE d.annee_scolaire = ? AND d.statut IN ('accepte','partiel','recours') AND m.accorde = 1
        AND (m.ue_num IS NULL OR m.ue_num = ?)
        AND (NOT EXISTS (SELECT 1 FROM amenagement_ue u WHERE u.dossier_id = d.id)
             OR EXISTS (SELECT 1 FROM amenagement_ue u WHERE u.dossier_id = d.id AND u.ue_num = ?))
      ORDER BY m.libelle`).all(annee, d.ueNum, d.ueNum)) {
      (amenagements[x.etudiant_id] ||= []).push({ libelle: x.libelle, precisions: x.precisions, portee: x.portee });
    }
  } catch { /* module absent */ }

  const dispensesCours = dispensesDeLUE(d.ueNum, annee);
  res.json({
    annee, cours_code: req.params.coursCode, ue_num: d.ueNum,
    repartition: d.repartition, portee: d.portee,
    session, sessions,
    grille_ue: grilleUEPermise(req, d.ueNum),
    lecture_seule: d.etudiants.length > 0 && d.etudiants.every(e => e.clos),
    enseignants: enseignantsParCours(annee).get(req.params.coursCode) || [],
    // La feuille du professeur note PAR ACQUIS ; sans AA rattachés au cours,
    // elle retombe sur une note de cours (clé '').
    acquis,
    etudiants: d.etudiants.map(e => ({ ...e,
      notes: props[e.id] || {}, note: (props[e.id] || {})[''] ?? null,
      // Seconde session : les acquis rouverts, et la proposition de première session à côté.
      ...(session === 2 ? { aa_ouverts: e.aa_ouverts, notes_s1: propsS1[e.id] || {} } : {}),
      justifications: justifs[e.id] || {},
      report: reportes[e.id] || null,
      /* DISPENSÉ DE CE COURS PAR VALORISATION (Charles, 9 octobre 2026, cas
         Dethier) : il ne se note pas ici — VAP, VAEP, ou l'unité entière. */
      dispense: reportes[e.id] ? null : dispenseDuCours(dispensesCours, e.id, req.params.coursCode),
      amenagements: amenagements[e.id] || [] })),
  });
});

// ── Proposer ses notes — rien n'entre au dossier ─────────────────────────────
/**
 * LES LISTES PAR GROUPE (1er octobre 2026, UE 333 AESI : « il ne sait pas
 * imprimer les listes de groupes différents »). Une feuille par groupe — ou
 * celle du seul groupe demandé —, avec une colonne de signature : la liste
 * qu'on emporte en classe. Produite ICI et non par le centre d'impression : un
 * professeur n'a pas accès aux listes ni aux rapports, et c'est l'appartenance
 * du cours (accesCours) qui l'autorise.
 */
r.get('/:coursCode/listes', authRequired, async (req, res) => {
  const annee = req.query.annee || anneeDeTravail(req);
  const code = req.params.coursCode;
  const d = accesCours(req, code, annee);
  if (!d) return res.status(403).json({ error: "Ce cours n'est ni dans vos attributions, ni dans votre section." });
  const groupesDe = e => String(e.groupe || '').split(' + ').map(x => x.trim()).filter(Boolean);
  const demande = String(req.query.groupe || '').trim();
  const tous = [...new Set(d.etudiants.flatMap(groupesDe))].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
  const gs = demande ? [demande] : (tous.length ? tous : ['']);
  const nom = db.prepare('SELECT cours_nom FROM cours WHERE cours_code = ? ORDER BY (annee_scolaire = ?) DESC LIMIT 1')
    .get(code, annee)?.cours_nom || '';
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const corps = gs.map((g, i) => {
    const lot = d.etudiants.filter(e => !g || groupesDe(e).includes(g));
    return `<div${i ? ' style="break-before:page;page-break-before:always"' : ''}>
      <div class="tg">${esc(g || 'Tous les étudiants')} <span>— ${lot.length} étudiant(s)</span></div>
      <table><thead><tr><th style="width:8mm">N°</th><th>Nom</th><th>Prénom</th><th style="width:26mm">Matricule</th><th style="width:45mm">Signature</th></tr></thead>
      <tbody>${lot.map((e, k) => `<tr><td>${k + 1}</td><td><b>${esc(String(e.nom || '').toUpperCase())}</b></td><td>${esc(e.prenom)}</td><td>${esc(e.id_ecampus || '')}</td><td></td></tr>`).join('')
        || '<tr><td colspan="5" style="text-align:center;color:#94a3b8">Aucun étudiant dans ce groupe.</td></tr>'}</tbody></table></div>`;
  }).join('');
  const html = envelopperDocument({
    html: corps, titre: `Liste — ${code}`,
    entete: { titre: `${code} — ${nom}`.trim(), sous: `UE ${d.ueNum} · année ${annee}`,
      ligne: demande ? `Groupe ${demande}` : (tous.length > 1 ? `${tous.length} groupes, une feuille par groupe` : null) },
    styles: `
.tg{font-size:11pt;font-weight:700;color:#1B2B4B;margin:0 0 2.5mm;border-left:1.2mm solid #C9A84C;padding-left:2.5mm}
.tg span{font-weight:400;font-size:9pt;color:#64748b}
table{width:100%;border-collapse:collapse;font-size:9pt}
th{text-align:left;font-size:7.5pt;text-transform:uppercase;letter-spacing:.04em;color:#475569;background:#F1F4F9;padding:1.4mm 2mm;border-bottom:.3mm solid #D8DCE4}
td{padding:2.2mm 2mm;border-bottom:.2mm solid #E4E7EC}
tr{break-inside:avoid}`,
  });
  // ?format=html : la pièce elle-même, pour l'aperçu commun (galerie, Mes cours).
  if (req.query.format === 'html') return res.json({ html, nom: `Liste_${code}${demande ? `_${demande}` : ''}` });
  const cap = await capacitePdf();
  if (!cap.disponible) return res.json({ html });
  try {
    const pdf = await rendrePdf(html, { pagination: 'si-plusieurs', orientation: 'portrait',
      pied: avecNum => piedGabaritPdf(LOGO_IIP_JPEG, piedDocument(), avecNum),
      marges: { top: '12mm', right: '15mm', bottom: `${BANDE_PIED_MM}mm`, left: '15mm' } });
    const fichier = `Liste_${code}${demande ? `_${demande}` : ''}`.replace(/[^A-Za-z0-9_.-]+/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fichier}.pdf"`);
    res.end(pdf);
  } catch (e) { res.json({ html, avertissement: e.message }); }
});

r.post('/:coursCode/notes', authRequired, (req, res) => {
  const annee = String(req.body?.annee || anneeDeTravail(req));
  const d = accesCours(req, req.params.coursCode, annee);
  if (!d) return res.status(403).json({ error: "Ce cours n'est ni dans vos attributions, ni dans votre section." });

  const session = Number(req.body?.session) === 2 ? 2 : 1;
  const acquisCours = acquisDuCours(req.params.coursCode, d.ueNum, annee);
  // Les acquis admis pour ce cours — plus la clé '' (note de cours).
  const aaPermis = new Set(['', ...acquisCours.map(a => a.aa_code)]);
  const etat = sessionsDuCours(d, req.params.coursCode, annee, acquisCours);
  if (session === 2 && !etat.public.seconde_possible) return res.status(409).json({ error: etat.public.seconde_raison });
  /* En seconde session : les seuls ajournés de ce cours, sur leurs seuls acquis
     rouverts — un acquis réussi en première session ne se réévalue pas. Dans l'une comme
     dans l'autre, un étudiant dont la séance est close ne reçoit plus rien. */
  d.etudiants = session === 2 ? etat.seconde.etudiants
    : d.etudiants.map(e => ({ ...e, clos: etat.close(1, e.id) }));
  if (d.etudiants.length && d.etudiants.every(e => e.clos)) {
    return res.status(409).json({ error: `La séance de ${session === 2 ? 'seconde' : 'première'} session est close : ses notes ne se proposent plus.`
      + (session === 1 && etat.public.seconde_possible ? ' Les notes des ajournés se saisissent dans « 2ᵉ session ».' : '') });
  }
  const permis = new Set(d.etudiants.filter(e => !e.clos).map(e => e.id));
  const ouvertsDe = new Map(session === 2 ? d.etudiants.map(e => [e.id, new Set(e.aa_ouverts)]) : []);
  // PP pas présenté · NP note de présence · CM certificat médical (2.12.215).
  const MENTIONS = ['PP', 'NP', 'CM'];
  const notes = (Array.isArray(req.body?.notes) ? req.body.notes : [])
    .map(x => {
      const brut = String(x?.note ?? '').trim().toUpperCase();
      const mention = MENTIONS.includes(brut) ? brut : null;
      return { etudiant_id: Number(x?.etudiant_id), aa_code: String(x?.aa_code ?? ''), mention,
        note: mention || brut === '' ? null : Number(brut.replace(',', '.')),
        justification: String(x?.justification ?? '').trim() || null };
    })
    .filter(x => permis.has(x.etudiant_id) && aaPermis.has(x.aa_code)
      && (session === 1 || ouvertsDe.get(x.etudiant_id)?.has(x.aa_code))
      // DES ENTIERS, DE 0 À 20 (Charles, 26 septembre 2026) : ni décimale, ni
      // valeur hors de l'échelle ; le serveur le refuse comme l'écran.
      && (x.mention || x.note === null || (Number.isInteger(x.note) && x.note >= 0 && x.note <= 20)));
  if (!notes.length) return res.status(400).json({ error: 'Aucune note valable.' });
  /* UN ÉCHEC SE JUSTIFIE, ACQUIS PAR ACQUIS (RDE art. 88 §3) — et c'est au
     moment de corriger que l'enseignant sait pourquoi. Une note sous 10 ne
     s'enregistre pas sans son justificatif ; le refus nomme ce qui manque. */
  const manquants = notes.filter(x => x.aa_code && x.note != null && x.note < 10 && !x.justification);
  if (manquants.length) {
    const noms = new Map(d.etudiants.map(e => [e.id, `${String(e.nom || '').toUpperCase()} ${e.prenom || ''}`.trim()]));
    return res.status(400).json({
      error: `${manquants.length} note(s) sous 10 sans justificatif : chaque acquis non maîtrisé se justifie.`,
      manquants: manquants.map(x => ({ etudiant_id: x.etudiant_id, aa_code: x.aa_code, nom: noms.get(x.etudiant_id) || '' })),
    });
  }

  const poser = db.prepare(`
    INSERT INTO note_proposee (etudiant_id, annee_scolaire, cours_code, aa_code, session, note, mention, justification, propose_par, propose_le)
    VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(etudiant_id, annee_scolaire, cours_code, aa_code, session) DO UPDATE SET
      note = excluded.note, mention = excluded.mention, justification = excluded.justification,
      propose_par = excluded.propose_par, propose_le = datetime('now'),
      -- une proposition MODIFIÉE redevient en attente de reprise
      reprise_le = CASE WHEN note_proposee.note IS excluded.note AND note_proposee.mention IS excluded.mention THEN note_proposee.reprise_le END,
      reprise_par = CASE WHEN note_proposee.note IS excluded.note AND note_proposee.mention IS excluded.mention THEN note_proposee.reprise_par END`);
  const oter = db.prepare(
    'DELETE FROM note_proposee WHERE etudiant_id = ? AND annee_scolaire = ? AND cours_code = ? AND aa_code = ? AND session = ?');
  let n = 0;
  db.transaction(() => {
    for (const x of notes) {
      if (x.note === null && !x.mention) { n += oter.run(x.etudiant_id, annee, req.params.coursCode, x.aa_code, session).changes; }
      else { poser.run(x.etudiant_id, annee, req.params.coursCode, x.aa_code, session, x.note, x.mention,
        x.note != null && x.note < 10 ? x.justification : null, req.user?.email || null); n++; }
    }
  })();
  let complet = false, reprise = null;
  try { reprise = repriseAutomatique(req.params.coursCode, annee, req.user?.email || 'reprise automatique'); } catch (e) { console.error('[reprise auto]', e.message); }
  try { complet = signalerSiComplet(req, d, req.params.coursCode, annee, aaPermis, session); } catch (e) { console.error('[notes complètes]', e.message); }
  if (!complet) {
    try { signalerEncodage(req.params.coursCode, annee, req.user?.email || null, d.etudiants.length, nomDuProf(req.user?.email, req.user), session); }
    catch (e) { console.error('[notes encodées]', e.message); }
  }
  res.json({ ok: true, session, proposees: n, complet, reprise });
});

/* LE SECRÉTARIAT EST PRÉVENU QUAND UN COURS EST COMPLET (Charles, 8 octobre 2026 :
 * « une notification sur l'écran d'accueil pour le secrétariat quand un prof a
 * complété les notes d'un cours »). Complet = chaque étudiant de l'enseignant
 * (hors cours reporté) a une note ou une mention (PP, NP, CM) pour chaque acquis
 * du cours — ou la note de cours, si le cours n'a pas d'acquis. Une fois par
 * enseignant, cours et année ; si le cours redevient incomplet, la marque tombe
 * et la complétion suivante prévient de nouveau. */
function signalerSiComplet(req, d, coursCode, annee, aaPermis, session = 1) {
  db.exec(`CREATE TABLE IF NOT EXISTS notes_cours_completes (
    annee_scolaire TEXT NOT NULL, cours_code TEXT NOT NULL, propose_par TEXT NOT NULL,
    complet_le TEXT DEFAULT (datetime('now')), PRIMARY KEY (annee_scolaire, cours_code, propose_par))`);
  const qui = req.user?.email || String(req.user?.id || '');
  const acquis = [...aaPermis].filter(Boolean);
  const cles = acquis.length ? acquis : [''];
  const reporte = db.prepare(`SELECT 1 FROM etudiant_report_note WHERE etudiant_id = ? AND annee_scolaire = ?
    AND cours_code = ? AND statut = 'accorde'`);
  const dispCours = dispensesDeLUE(d.ueNum, annee);
  const etus = d.etudiants.filter(e => { try { return !reporte.get(e.id, annee, coursCode) && !dispenseDuCours(dispCours, e.id, coursCode); } catch { return true; } });
  if (!etus.length) return false;
  const poses = new Set(db.prepare(`SELECT etudiant_id || '|' || aa_code k FROM note_proposee
      WHERE annee_scolaire = ? AND cours_code = ? AND session = ? AND (note IS NOT NULL OR mention IS NOT NULL)`).all(annee, coursCode, session).map(x => x.k));
  // En seconde session, chaque ajourné n'a que ses acquis rouverts à remplir.
  const complet = etus.every(e => (session === 2 && e.aa_ouverts ? e.aa_ouverts : cles).every(a => poses.has(`${e.id}|${a}`)));
  // La marque de la seconde session vit à côté de celle de première session, sous « code|s2 ».
  const cleCours = session === 2 ? `${coursCode}|s2` : coursCode;
  const deja = db.prepare('SELECT 1 FROM notes_cours_completes WHERE annee_scolaire = ? AND cours_code = ? AND propose_par = ?').get(annee, cleCours, qui);
  if (!complet) {
    if (deja) db.prepare('DELETE FROM notes_cours_completes WHERE annee_scolaire = ? AND cours_code = ? AND propose_par = ?').run(annee, cleCours, qui);
    return false;
  }
  if (deja) return true;
  db.prepare('INSERT INTO notes_cours_completes (annee_scolaire, cours_code, propose_par) VALUES (?,?,?)').run(annee, cleCours, qui);
  const c = db.prepare('SELECT cours_nom, ue_num FROM cours WHERE cours_code = ? ORDER BY (annee_scolaire = ?) DESC LIMIT 1').get(coursCode, annee) || {};
  const p = db.prepare(`SELECT p.nom, p.prenom FROM professeur p JOIN utilisateur u ON u.professeur_id = p.id WHERE u.id = ?`).get(req.user?.id)
    || { nom: req.user?.nom || qui, prenom: '' };
  const nomProf = `${String(p.nom || '').toUpperCase()} ${p.prenom || ''}`.trim();
  const titre = `Notes ${session === 2 ? 'de 2ᵉ session ' : ''}complètes — ${c.cours_nom || coursCode} (${coursCode}${c.ue_num ? `, UE ${c.ue_num}` : ''})`;
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const corps = `<strong>${esc(nomProf)}</strong> a encodé toutes les notes de ses ${etus.length} étudiant(s)`
    + `${session === 2 ? ' ajourné(s), sur leurs acquis à représenter' : acquis.length ? `, ${acquis.length} acquis chacun` : ''} — ${annee}. À reprendre dans l'encodage officiel (Mes cours → « Reprendre les propositions »).`;
  const ins = db.prepare(`INSERT INTO lucie_notification (type, titre, corps, lien, cible_role, cree_par) VALUES ('notes_completes', ?, ?, ?, ?, ?)`);
  for (const role of ROLES_PREVENUS) ins.run(titre, corps, `/mes-cours?cours=${encodeURIComponent(coursCode)}${session === 2 ? '&session=2' : ''}`, role, nomProf || qui);
  return true;
}

/* QUI EST PRÉVENU DES NOTES : le secrétariat et la direction adjointe (Charles,
 * 8 octobre 2026 : « en mode Mati, Mélina, Florian ou Nicolas »). */
const ROLES_PREVENUS = ['secretariat', 'editeur', 'directeur_adjoint'];

/* LES NOTES ENCODÉES SE VOIENT DÈS QU'ELLES ARRIVENT (Charles, 8 octobre 2026 :
 * « je ne vois pas la notification qui dit que les notes ont été encodées pour
 * certains cours en 333 »). La seule notification attendait qu'un cours soit
 * COMPLET — or un cours de 84 inscrits dont 3 n'ont pas encore de note ne l'est
 * jamais : aucune n'était partie, sur aucun cours. Désormais, chaque
 * enregistrement prévient, avec l'avancement (« 81 / 84 étudiants ») ; une seule
 * notification par cours et par professeur et par jour, mise à jour au fil des
 * enregistrements, plutôt que dix lignes pour dix clics. La complétude garde la
 * sienne. */
export function signalerEncodage(coursCode, annee, proposePar, totalEtudiants, nomProf, session = 1) {
  const c = db.prepare('SELECT cours_nom, ue_num FROM cours WHERE cours_code = ? ORDER BY (annee_scolaire = ?) DESC LIMIT 1').get(coursCode, annee) || {};
  const n = db.prepare(`SELECT count(DISTINCT etudiant_id) n, count(*) notes, max(propose_le) le FROM note_proposee
      WHERE annee_scolaire = ? AND cours_code = ? AND propose_par = ? AND session = ? AND (note IS NOT NULL OR mention IS NOT NULL)`).get(annee, coursCode, proposePar, session);
  if (!n?.notes) return false;
  const titre = `Notes ${session === 2 ? 'de 2ᵉ session ' : ''}encodées — ${c.cours_nom || coursCode} (${coursCode}${c.ue_num ? `, UE ${c.ue_num}` : ''})`;
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const avancement = totalEtudiants ? `${n.n} / ${totalEtudiants} étudiants` : `${n.n} étudiant(s)`;
  const corps = `<strong>${esc(nomProf)}</strong> a encodé ${n.notes} note(s) — ${avancement} — ${annee}.`
    + ` Elles passent dans l'encodage officiel (Mes cours).`;
  // Une notification par session : celle de la seconde ne recouvre pas celle de la première.
  const lien = `/mes-cours?cours=${encodeURIComponent(coursCode)}${session === 2 ? '&session=2' : ''}`;
  const existe = db.prepare(`SELECT id FROM lucie_notification WHERE type = 'notes_encodees' AND lien = ? AND cree_par = ?
      AND cible_role = ? AND date(cree_le) = date('now')`);
  const maj = db.prepare(`UPDATE lucie_notification SET titre = ?, corps = ?, cree_le = datetime('now'), lue_par = '[]' WHERE id = ?`);
  const ins = db.prepare(`INSERT INTO lucie_notification (type, titre, corps, lien, cible_role, cree_par, cree_le)
      VALUES ('notes_encodees', ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))`);
  for (const role of ROLES_PREVENUS) {
    const e = existe.get(lien, nomProf, role);
    if (e) maj.run(titre, corps, e.id); else ins.run(titre, corps, lien, role, nomProf, null);
  }
  return true;
}

/** Le nom du professeur derrière une adresse — « NOM Prénom ». */
function nomDuProf(email, user = null) {
  const p = db.prepare(`SELECT p.nom, p.prenom FROM professeur p JOIN utilisateur u ON u.professeur_id = p.id
      WHERE lower(u.email) = lower(?) LIMIT 1`).get(email || '')
    || (user ? { nom: user.nom || email, prenom: '' } : { nom: email, prenom: '' });
  return `${String(p.nom || '').toUpperCase()} ${p.prenom || ''}`.trim();
}

/* LE RATTRAPAGE : les cours déjà encodés avant cette version n'ont jamais
 * prévenu personne. Une notification par cours et par professeur, datée du
 * dernier enregistrement, s'il n'y en a pas déjà une. */
export function rattraperNotificationsNotes() {
  const annees = db.prepare("SELECT DISTINCT annee_scolaire a FROM note_proposee WHERE propose_le >= datetime('now', '-30 days')").all().map(x => x.a);
  let n = 0;
  for (const annee of annees) {
    for (const x of db.prepare(`SELECT cours_code, propose_par, max(propose_le) le FROM note_proposee
        WHERE annee_scolaire = ? AND propose_par IS NOT NULL GROUP BY cours_code, propose_par`).all(annee)) {
      const lien = `/mes-cours?cours=${encodeURIComponent(x.cours_code)}`;
      const nomProf = nomDuProf(x.propose_par);
      if (db.prepare(`SELECT 1 FROM lucie_notification WHERE type IN ('notes_encodees', 'notes_completes') AND lien = ? AND cree_par = ? LIMIT 1`)
        .get(lien, nomProf)) continue;
      const c = db.prepare('SELECT ue_num FROM cours WHERE cours_code = ? AND annee_scolaire = ?').get(x.cours_code, annee);
      const total = c ? db.prepare(`SELECT count(DISTINCT i.etudiant_id) n FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
          WHERE i.ue_num = ? AND i.annee_scolaire = ? AND e.actif = 1`).get(c.ue_num, annee).n : 0;
      if (signalerEncodage(x.cours_code, annee, x.propose_par, total, nomProf)) {
        db.prepare(`UPDATE lucie_notification SET cree_le = ? WHERE type = 'notes_encodees' AND lien = ? AND cree_par = ?`).run(x.le, lien, nomProf);
        n++;
      }
    }
  }
  if (n) console.log(`[notes] ${n} notification(s) d'encodage rattrapée(s)`);
}

// ── Ce que la coordination reprend dans l'encodage officiel ──────────────────
r.get('/:coursCode/propositions', authRequired, roleRequired(...PEUT_INSTRUIRE), (req, res) => {
  const annee = req.query.annee || anneeDeTravail(req);
  const lignes = db.prepare(`
    SELECT p.etudiant_id, p.aa_code, p.note, p.mention, p.justification, p.propose_par, p.propose_le, e.nom, e.prenom
    FROM note_proposee p JOIN etudiant e ON e.id = p.etudiant_id
    WHERE p.annee_scolaire = ? AND p.cours_code = ? AND p.session = ?
    ORDER BY e.nom, e.prenom, p.aa_code`).all(annee, req.params.coursCode, Number(req.query.session) === 2 ? 2 : 1);
  res.json({ annee, cours_code: req.params.coursCode, propositions: lignes });
});

/* ── REPRENDRE LES PROPOSITIONS DANS L'ENCODAGE OFFICIEL (Charles, 28
 * septembre 2026 : « Madame Moiny a encodé ses points, je les vois en voir
 * comme, mais ils ne sont pas dans Lucie »). Jusqu'ici, la coordination les
 * RETAPAIT, case par case — 130 notes pour un cours. Simulation d'abord :
 *   · une case officielle vide reçoit la proposition ;
 *   · une case identique est seulement pointée ;
 *   · une case qui DIFFÈRE n'est remplacée que si on l'a cochée ;
 *   · une note de cours sans acquis, un CM, un cours reporté ne se reprennent
 *     pas d'office : ils sont nommés.
 * Chaque note reprise porte son origine (`proposition:<qui>`), et la
 * proposition sa date de reprise et son auteur. */
/** L'ANALYSE D'UNE REPRISE — une seule règle pour le bouton et pour la reprise
 *  automatique. `etudiantsPermis` (Set) restreint ; `session` choisit les
 *  propositions de CETTE session et dit où les écrire (22 octobre 2026 : une
 *  proposition de première session ne va jamais en seconde, ni l'inverse).
 *  En enseignement pour adultes, la seconde session suit la délibération de
 *  CHAQUE unité, à n'importe quel moment de l'année : aucune date n'entre ici,
 *  seule la clôture de la séance compte. */
function analyserReprise(coursCode, annee, session, remplacer = new Set(), { etudiantsPermis = null, enAttente = false, suivreProposition = false } = {}) {
  const ue = db.prepare('SELECT ue_num FROM cours WHERE cours_code = ? AND annee_scolaire = ? LIMIT 1').get(coursCode, annee)?.ue_num
    ?? db.prepare('SELECT ue_num FROM cours WHERE cours_code = ? ORDER BY annee_scolaire DESC LIMIT 1').get(coursCode)?.ue_num;
  if (ue == null) return null;
  const props = db.prepare(`SELECT p.*, e.nom, e.prenom FROM note_proposee p JOIN etudiant e ON e.id = p.etudiant_id
    WHERE p.annee_scolaire = ? AND p.cours_code = ? AND p.session = ? ${enAttente ? 'AND p.reprise_le IS NULL' : ''} ORDER BY e.nom, e.prenom, p.aa_code`).all(annee, coursCode, session)
    .filter(p => !etudiantsPermis || etudiantsPermis.has(p.etudiant_id));
  const lire = db.prepare(`SELECT points, mention, origine FROM etudiant_note_detail
    WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ? AND type = 'aa' AND code = ?`);
  const reporte = db.prepare(`SELECT 1 FROM etudiant_report_note WHERE etudiant_id = ? AND annee_scolaire = ?
    AND cours_code = ? AND statut = 'accorde'`);
  const nomDe = p => `${String(p.nom || '').toUpperCase()} ${p.prenom || ''}`.trim();
  const r0 = { a_poser: [], identiques: 0, differentes: [], ignorees: [], remplacees: 0 };
  const faire = [];
  for (const p of props) {
    const base = { etudiant_id: p.etudiant_id, etudiant: nomDe(p), aa_code: p.aa_code };
    if (!p.aa_code) { r0.ignorees.push({ ...base, raison: 'note de cours sans acquis : elle se reporte par acquis dans la feuille' }); continue; }
    if (p.mention === 'CM') { r0.ignorees.push({ ...base, raison: 'certificat médical : à trancher par le Conseil' }); continue; }
    if (p.mention && !['NP', 'PP'].includes(p.mention)) { r0.ignorees.push({ ...base, raison: `mention « ${p.mention} » : l'encodage officiel ne connaît que NP et PP` }); continue; }
    try { if (reporte.get(p.etudiant_id, annee, coursCode)) { r0.ignorees.push({ ...base, raison: 'cours reporté : ses notes sont reprises d’office' }); continue; } } catch { /* */ }
    const code = `s${session}|${coursCode}|${p.aa_code}`;
    const val = p.mention ? 0 : p.note;
    const off = lire.get(p.etudiant_id, annee, ue, code);
    const pr = p.mention || (p.note != null ? Math.round(p.note) : null);
    if (off) {
      const o = off.mention || (off.points != null ? Math.round(off.points) : null);
      if (String(o) === String(pr)) { r0.identiques++; faire.push(['pointer', p]); continue; }
      const cle = `${p.etudiant_id}|${p.aa_code}`;
      // La note officielle VIENT d'une proposition : l'enseignant la corrige, elle suit.
      if (suivreProposition && String(off.origine || '').startsWith('proposition')) { faire.push(['ecrire', p, code, val]); r0.remplacees++; continue; }
      r0.differentes.push({ ...base, officiel: o, propose: pr, remplacer: remplacer.has(cle) });
      if (remplacer.has(cle)) { faire.push(['ecrire', p, code, val]); r0.remplacees++; }
      continue;
    }
    r0.a_poser.push({ ...base, propose: pr });
    faire.push(['ecrire', p, code, val]);
  }
  return { ue, props, r0, faire };
}

function appliquerReprise(an, annee, coursCode, qui, origine = null) {
  const ecrire = db.prepare(`INSERT INTO etudiant_note_detail (etudiant_id, annee_scolaire, ue_num, type, code, points, mention, origine, cours_code)
    VALUES (?,?,?, 'aa', ?, ?, ?, ?, ?)
    ON CONFLICT(etudiant_id, annee_scolaire, ue_num, type, code) DO UPDATE SET
      points = excluded.points, mention = excluded.mention, origine = excluded.origine`);
  const pointer = db.prepare(`UPDATE note_proposee SET reprise_le = datetime('now'), reprise_par = ? WHERE id = ?`);
  db.transaction(() => {
    for (const [g, p, code, val] of an.faire) {
      if (g === 'ecrire') ecrire.run(p.etudiant_id, annee, an.ue, code, val, p.mention || null, origine || `proposition:${p.propose_par || ''}`, coursCode);
      pointer.run(qui, p.id);
    }
  })();
}

/* LA REPRISE AUTOMATIQUE (Charles, 8 octobre 2026 : « les notes des carnets de
 * notes n'apparaissent pas en délibération » — choix : « reprise auto »). Ce que
 * l'enseignant enregistre dans Mes cours entre dans l'encodage officiel :
 *   · seulement dans une case officielle VIDE (ou identique, simplement pointée) ;
 *     une case qui DIFFÈRE attend la coordination (« Reprendre les propositions ») ;
 *   · jamais dans une séance close : chaque proposition va dans SA session
 *     (22 octobre 2026) — celles de première session tant que leur séance n'est pas close,
 *     celles de seconde session, pour les seuls ajournés, tant que la seconde ne l'est
 *     pas. Jusque-là, une note retapée après la clôture de la première séance partait
 *     en seconde session : la seule façon de noter la seconde était d'écraser la première ;
 *   · CM, note de cours sans acquis, cours reporté : comme au bouton, nommés, non repris.
 * Chaque note porte son origine `proposition:auto:<qui>`. */
export function repriseAutomatique(coursCode, annee, qui = 'reprise automatique') {
  const ue = db.prepare('SELECT ue_num FROM cours WHERE cours_code = ? ORDER BY (annee_scolaire = ?) DESC LIMIT 1').get(coursCode, annee)?.ue_num;
  if (ue == null) return null;
  // La séance qui compte est celle de l'organisation de chaque étudiant.
  const close = clotures(ue, annee);
  const inscrits = db.prepare(`SELECT etudiant_id, resultat FROM etudiant_inscription WHERE ue_num = ? AND annee_scolaire = ?`).all(ue, annee);
  const bilan = { session: null, ecrites: 0, identiques: 0, differentes: 0 };
  for (const session of [1, 2]) {
    const permis = new Set(inscrits.filter(x => session === 1 ? !close(1, x.etudiant_id)
      : x.resultat === 'ajourne' && close(1, x.etudiant_id) && !close(2, x.etudiant_id)).map(x => x.etudiant_id));
    if (!permis.size) continue;
    const an = analyserReprise(coursCode, annee, session, new Set(), { etudiantsPermis: permis, enAttente: true, suivreProposition: true });
    if (!an) continue;
    bilan.session = session;
    bilan.differentes += an.r0.differentes.length;
    if (!an.faire.length) continue;
    appliquerReprise(an, annee, coursCode, qui, `proposition:auto:${qui}`);
    bilan.ecrites += an.r0.a_poser.length + an.r0.remplacees;
    bilan.identiques += an.r0.identiques;
  }
  return bilan;
}

/** Les propositions en attente, reprises au démarrage (celles d'avant la reprise
 *  automatique). Mêmes règles ; idempotent : une case remplie n'est plus vide. */
export function rattraperPropositions() {
  let total = 0;
  try {
    for (const { cours_code, annee_scolaire } of db.prepare(`SELECT DISTINCT cours_code, annee_scolaire FROM note_proposee WHERE reprise_le IS NULL`).all()) {
      try { total += repriseAutomatique(cours_code, annee_scolaire)?.ecrites || 0; } catch (e) { console.error('[reprise auto]', cours_code, e.message); }
    }
  } catch { /* table absente */ }
  if (total) console.log(`[reprise auto] ${total} note(s) proposée(s) reprise(s) dans l'encodage officiel`);
  return total;
}

/* LES STATISTIQUES DE L'UNITÉ (Charles, 8 octobre 2026 : « il faut prévoir les
 * statistiques au niveau de l'UE aussi »). La note d'unité de chaque inscrit,
 * calculée par la délibération elle-même (delibererUE) sur l'encodage officiel —
 * ANONYME : l'enseignant voit la forme de l'unité, pas les notes des autres
 * cours étudiant par étudiant. Et la moyenne de chaque cours de l'unité. */
r.get('/:coursCode/stats-ue', authRequired, async (req, res) => {
  const annee = String(req.query.annee || anneeDeTravail(req));
  const session = Number(req.query.session) === 2 ? 2 : 1;
  const d = accesCours(req, req.params.coursCode, annee);
  if (!d) return res.status(403).json({ error: "Ce cours n'est ni dans vos attributions, ni dans votre section." });
  const { delibererUE } = await import('./acquis.js');
  const ue = d.ueNum;
  const nomUE = db.prepare('SELECT MIN(ue_nom) n FROM ue WHERE ue_num = ? AND annee_scolaire = ?').get(ue, annee)?.n || '';
  const etus = db.prepare(`SELECT DISTINCT i.etudiant_id id FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
      WHERE i.annee_scolaire = ? AND i.ue_num = ? AND COALESCE(e.sortie_statut, '') <> 'archive'`).all(annee, ue);
  const notes = []; let ajournes = 0, sansNote = 0;
  const parCours = new Map();
  for (const { id } of etus) {
    let r = null; try { r = delibererUE(id, ue, annee, session); } catch { r = null; }
    if (!r) { sansNote++; continue; }
    const n = r.ue?.note_calculee;
    if (n == null) sansNote++; else notes.push(n);
    if (r.ue?.na) ajournes++;
    for (const c of r.cours || []) {
      if (c.note == null) continue;
      const x = parCours.get(c.cours_code) || { cours_code: c.cours_code, cours_nom: c.cours_nom || '', notes: [] };
      x.notes.push(Number(c.note)); parCours.set(c.cours_code, x);
    }
  }
  const moy = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
  /* PP, NP, CM COMPTÉS (Charles, 8 octobre 2026) : un étudiant par mention, par
     cours et pour l'unité — tels que les enseignants les ont encodés. */
  const inscrits = new Set(etus.map(x => x.id));
  const lignesM = db.prepare(`SELECT p.etudiant_id, p.cours_code, p.mention FROM note_proposee p
      JOIN cours c ON c.cours_code = p.cours_code AND c.annee_scolaire = p.annee_scolaire
      WHERE p.annee_scolaire = ? AND c.ue_num = ? AND p.session = ? AND p.mention IN ('PP', 'NP', 'CM')`).all(annee, ue, session)
    .filter(x => inscrits.has(x.etudiant_id));
  const compter = l => Object.fromEntries(['PP', 'NP', 'CM'].map(m => [m, new Set(l.filter(x => x.mention === m).map(x => x.etudiant_id)).size]));
  const mentions = compter(lignesM);
  for (const x of lignesM) if (!parCours.has(x.cours_code)) parCours.set(x.cours_code, { cours_code: x.cours_code, cours_nom: '', notes: [] });
  res.json({ ue_num: ue, ue_nom: nomUE, annee, session, inscrits: etus.length, notes, ajournes, sans_note: sansNote, mentions,
    cours: [...parCours.values()].map(c => ({ cours_code: c.cours_code, cours_nom: c.cours_nom, n: c.notes.length,
      mentions: compter(lignesM.filter(x => x.cours_code === c.cours_code)),
      moyenne: moy(c.notes), reussites: c.notes.filter(v => Math.round(v) >= 10).length,
      ce_cours: c.cours_code === req.params.coursCode })).sort((a, b) => a.cours_code.localeCompare(b.cours_code, 'fr', { numeric: true })) });
});

r.post('/:coursCode/reprendre', authRequired, roleRequired(...PEUT_INSTRUIRE), (req, res) => {
  const coursCode = req.params.coursCode;
  const annee = String(req.body?.annee || anneeDeTravail(req));
  const session = Number(req.body?.session) === 2 ? 2 : 1;
  const simulation = req.body?.simulation !== false;
  const remplacer = new Set((Array.isArray(req.body?.remplacer) ? req.body.remplacer : []).map(x => `${x.etudiant_id}|${x.aa_code}`));
  const ue0 = db.prepare('SELECT ue_num FROM cours WHERE cours_code = ? AND annee_scolaire = ? LIMIT 1').get(coursCode, annee)?.ue_num
    ?? db.prepare('SELECT ue_num FROM cours WHERE cours_code = ? ORDER BY annee_scolaire DESC LIMIT 1').get(coursCode)?.ue_num;
  if (ue0 == null) return res.status(404).json({ error: 'Cours inconnu.' });
  const perim = getUserSections(req.user);
  if (perim) {
    const sec = db.prepare('SELECT section FROM ue WHERE ue_num = ? AND section IS NOT NULL LIMIT 1').get(ue0)?.section;
    if (sec && !perim.includes(sec)) return res.status(403).json({ error: 'Cours hors de votre périmètre.' });
  }
  const an = analyserReprise(coursCode, annee, session, remplacer);
  const qui = req.user?.nom || req.user?.email || null;
  if (!simulation) appliquerReprise(an, annee, coursCode, qui);
  const { ue, props, r0 } = an;
  res.json({ ok: true, simulation, cours_code: coursCode, ue_num: ue, annee, session,
    propositions: props.length, ...r0, a_poser: r0.a_poser.length, a_poser_liste: r0.a_poser.slice(0, 300) });
});

/* LES PRÉSENCES SE PRENNENT OÙ L'ON ENSEIGNE (Charles, 29 septembre 2026 :
 * « idéalement depuis Mes cours, encodé par le prof »). Séance par séance, sur
 * l'horaire de Lucie — c'est de là que partent les attestations d'assiduité du
 * congé-éducation payé, et un total tapé à la main ne se vérifie pas. Le
 * professeur voit les séances qu'il donne ; la coordination, toutes celles du
 * cours. Une séance à venir ne s'encode pas : on n'atteste pas une présence qui
 * n'a pas encore eu lieu. */
function seancesDuCours(req, d, coursCode, annee) {
  const toutes = db.prepare(`SELECT id, date, heure_debut, heure_fin, minutes, sous_groupe, matiere, local_texte,
      professeur_id, COALESCE(annule, 0) AS annule
    FROM horaire_seance WHERE annee_scolaire = ? AND cours_code = ?
    ORDER BY date, heure_debut`).all(annee, coursCode);
  if (d.portee !== 'attribution') return toutes;
  const profId = profDe(req);
  const miennes = toutes.filter(x => x.professeur_id === profId);
  if (miennes.length) return miennes;
  // Un horaire importé sans professeur reconnu : toutes les séances du cours.
  return toutes.some(x => x.professeur_id) ? [] : toutes;
}

r.get('/:coursCode/presences', authRequired, (req, res) => {
  const annee = req.query.annee || anneeDeTravail(req);
  const d = accesCours(req, req.params.coursCode, annee);
  if (!d) return res.status(403).json({ error: "Ce cours n'est ni dans vos attributions, ni dans votre section." });
  const seances = seancesDuCours(req, d, req.params.coursCode, annee);
  const ids = seances.map(x => x.id);
  const pres = {};
  if (ids.length) {
    for (const p of db.prepare(`SELECT seance_id, etudiant_id, statut, motif, encode_par, encode_le FROM presence
        WHERE seance_id IN (${ids.map(() => '?').join(',')})`).all(...ids)) {
      (pres[p.seance_id] ||= {})[p.etudiant_id] = { statut: p.statut, motif: p.motif, par: p.encode_par, le: p.encode_le };
    }
  }
  let cep = new Set();
  try { cep = new Set(db.prepare('SELECT etudiant_id FROM etudiant_cep WHERE annee_scolaire = ?').all(annee).map(x => x.etudiant_id)); }
  catch { /* table absente */ }
  res.json({
    annee, cours_code: req.params.coursCode, statuts: STATUTS_PRESENCE, motifs: MOTIFS_JUSTIFIES,
    aujourdhui: new Date().toISOString().slice(0, 10),
    seances: seances.map(x => ({ ...x, min: minutesDe(x),
      encodees: Object.keys(pres[x.id] || {}).length })),
    etudiants: d.etudiants.map(e => ({ id: e.id, nom: e.nom, prenom: e.prenom, id_ecampus: e.id_ecampus,
      groupe: e.groupe || '', cep: cep.has(e.id) })),
    presences: pres,
  });
});

r.post('/:coursCode/presences/:seanceId', authRequired, (req, res) => {
  const annee = req.body?.annee || anneeDeTravail(req);
  const d = accesCours(req, req.params.coursCode, annee);
  if (!d) return res.status(403).json({ error: "Ce cours n'est ni dans vos attributions, ni dans votre section." });
  const s = seancesDuCours(req, d, req.params.coursCode, annee).find(x => x.id === Number(req.params.seanceId));
  if (!s) return res.status(404).json({ error: 'Cette séance ne fait pas partie de vos séances de ce cours.' });
  if (s.annule) return res.status(409).json({ error: 'Séance annulée : il n\'y a pas de présence à prendre.' });
  if (s.date > new Date().toISOString().slice(0, 10)) {
    return res.status(409).json({ error: "Cette séance n'a pas encore eu lieu : ses présences se prennent le jour même ou après." });
  }
  const miens = new Set(d.etudiants.map(e => e.id));
  const lignes = (req.body?.presences || []).map(p => ({ seance_id: s.id, etudiant_id: Number(p.etudiant_id),
    statut: p.statut || null, motif: p.motif || null }));
  const etrangers = lignes.filter(l => !miens.has(l.etudiant_id));
  if (etrangers.length) return res.status(400).json({ error: `${etrangers.length} étudiant(s) hors de la liste de ce cours.` });
  const out = ecrirePresences(lignes, req.user?.email || req.user?.nom || null);
  if (out.erreur) return res.status(400).json({ error: out.erreur });
  res.json({ ok: true, ...out });
});

export default r;
