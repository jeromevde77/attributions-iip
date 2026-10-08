// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Description d'unité d'enseignement (DUE)
//
// La DUE était un document Word recopié d'année en année. Le volume horaire y
// divergeait du référentiel, les acquis d'apprentissage n'étaient plus ceux du
// dossier pédagogique, et personne ne savait quelle version faisait foi.
//
// Ici, la DUE se scinde en deux :
//
//   — ce que Lucie SAIT déjà : numéro et nom de l'unité, section, ECTS,
//     périodes, quadrimestre, prérequis, niveau, la liste des cours et celle
//     des acquis avec leur libellé, les titulaires tirés des attributions.
//     Ces champs ne se stockent jamais : ils sont relus à chaque ouverture, de
//     sorte qu'une correction du référentiel se propage d'elle-même ;
//
//   — ce que l'enseignant RÉDIGE : finalités particulières, programme,
//     méthodes, supports, modalités d'évaluation, critères, degré de maîtrise.
//     Cela seul est conservé, dans `contenu`.
//
// Qui écrit : les titulaires d'un cours de l'unité, tant que la DUE est en
// préparation. La direction valide ; la DUE passe alors en lecture seule et
// devient la version officielle. Elle peut la rouvrir.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, getUserSections } from '../middleware/auth.js';
import { anneeDeTravail } from '../helpers/annee.js';
import { envelopper } from './attestations.js';
import { identiteEtablissement } from './config.js';
import { getParam } from './parametres.js';
import { introductionAcquis } from './aa.js';
import { construireGraphe } from './capitalisation.js';
import { schemaSvg } from '../lib/schemaSvg.js';
import { assainir } from '../lib/texteCorpus.js';
import { gesteAutorise } from '../lib/gestes.js';

const r = Router();

const NIVEAU_DIRECTION = ['admin', 'directeur', 'directeur_adjoint'];

export function migrerDUE(dbx) {
  try {
    dbx.exec(`
      CREATE TABLE IF NOT EXISTS due (
        ue_num         INTEGER NOT NULL,
        annee_scolaire TEXT    NOT NULL,
        contenu        TEXT    NOT NULL DEFAULT '{}',
        statut         TEXT    NOT NULL DEFAULT 'preparation',
        maj_le         TEXT,
        maj_par        TEXT,
        valide_le      TEXT,
        valide_par     TEXT,
        PRIMARY KEY (ue_num, annee_scolaire)
      );
    `);
    console.log('[migration] due créée');
    seedParametresDUE(dbx);
  } catch (e) { console.error('[migration] due :', e.message); }
}

// ── Qui peut quoi ────────────────────────────────────────────────────────────

// Un professeur accède à la DUE des unités où il a une attribution. La
// coordination et le secrétariat lisent tout ; seule la direction valide.
function droitsSurLUE(user, ueNum, annee) {
  const direction = NIVEAU_DIRECTION.includes(user?.role);
  // LES GESTES DE LA DUE se règlent dans Configuration → Accès (lib/gestes.js).
  const peutRediger = gesteAutorise(user, 'due.rediger') === 'oui';
  const peutValider = gesteAutorise(user, 'due.valider') === 'oui';
  if (direction) return { lire: true, ecrire: peutRediger, valider: peutValider, titulaire: false };

  let titulaire = false;
  const u = db.prepare('SELECT professeur_id FROM utilisateur WHERE id = ?').get(user.id);
  if (u?.professeur_id) {
    titulaire = !!db.prepare(`
      SELECT 1 FROM attribution
      WHERE professeur_id = ? AND ue_num = ? AND annee_scolaire = ? LIMIT 1
    `).get(u.professeur_id, ueNum, annee);
  }
  if (user?.role === 'professeur') {
    const coord = estCoordinationDe(user, ueNum, annee);
    return { lire: titulaire || coord, ecrire: peutRediger && (titulaire || coord), valider: peutValider, titulaire, coordination: coord };
  }

  /* Les autres lisent selon leur périmètre : la gestion de la section OU une
   * attribution dans l'unité — la même règle que la liste, sans quoi une URL
   * connue montrerait ce que la liste cache. */
  const perim = getUserSections(user);              // null = toutes
  const ueRow = db.prepare('SELECT section FROM ue WHERE ue_num = ? AND annee_scolaire = ?')
    .get(ueNum, annee);
  const lire = titulaire || perim === null
    || (ueRow?.section ? perim.includes(ueRow.section) : false);
  /* LA COORDINATION ÉCRIT LA DUE (Charles, 8 octobre 2026 : « la personne qui a
   * un rôle de coordination doit pouvoir modifier tous les éléments du DUE ») —
   * la coordination de la section, et les fonctions de coordination de la fiche
   * du personnel (cursus pour sa section, pédagogique et qualité partout) :
   * la même règle que le mode d'évaluation. */
  const coordination = estCoordinationDe(user, ueNum, annee);
  return { lire: lire || coordination, ecrire: peutRediger && (titulaire || coordination), valider: peutValider, titulaire, coordination };
}

// ── L'évaluation de l'unité : globale ou par activité ────────────────────────
//
// (Charles, 30 septembre 2026.) Le tableau des critères d'évaluation prend
// l'une de deux formes : GLOBAL, si l'unité est évaluée d'une seule épreuve
// — un tableau pour l'unité —, ou PAR ACTIVITÉ, un tableau par cours. Ce fait
// existait déjà : c'est le réglage « évaluation unique » (ue_evaluation_unique),
// que la délibération lit pour étendre la note d'un acquis à tous les cours qui
// le portent. La case du DUE l'écrit ; il n'y a pas de seconde source.
// NB : ce n'est PAS l'épreuve intégrée du décret (ue_epreuve_integree).
function evaluationUnique(ueNum, annee) {
  try {
    return !!db.prepare('SELECT actif FROM ue_evaluation_unique WHERE ue_num = ? AND annee_scolaire = ?').get(ueNum, annee)?.actif;
  } catch { return false; }
}
// Qui coche : la direction, une coordination de la section, et les fonctions
// de coordination de la fiche du personnel (cursus pour sa section ;
// pédagogique et qualité partout).
const FONCTIONS_MODE = ['Coordinateur de cursus', 'Coordinateur pédagogique', 'Conseiller qualité'];
function peutReglerMode(user, ueNum, annee) {
  if (NIVEAU_DIRECTION.includes(user?.role)) return true;
  if (user?.role === 'coordination' && gesteAutorise(user, 'due.mode_evaluation') !== 'oui') return false;
  return estCoordinationDe(user, ueNum, annee);
}
/** La coordination de l'unité : rôle coordination dans le périmètre, ou fonction
 *  de coordination sur la fiche (cursus pour sa section, pédagogique, qualité). */
function estCoordinationDe(user, ueNum, annee) {
  if (NIVEAU_DIRECTION.includes(user?.role)) return true;
  const section = db.prepare('SELECT section FROM ue WHERE ue_num = ? AND annee_scolaire = ?').get(ueNum, annee)?.section || null;
  if (user?.role === 'coordination') {
    const perim = getUserSections(user);
    if (perim === null || (section && perim.includes(section))) return true;
  }
  const profId = db.prepare('SELECT professeur_id FROM utilisateur WHERE id = ?').get(user?.id)?.professeur_id;
  if (!profId) return false;
  try {
    const f = db.prepare(`SELECT fonction, section_code FROM personnel_mission
      WHERE professeur_id = ? AND annee_scolaire = ?`).all(profId, annee);
    return f.some(x => FONCTIONS_MODE.includes(x.fonction)
      && (x.fonction !== 'Coordinateur de cursus' || !x.section_code || x.section_code === '__ETAB__' || x.section_code === section));
  } catch { return false; }
}

/** Les points du programme du dossier pédagogique, un par ligne : ce qu'on
 *  propose dans la colonne « Point du programme ». */
function pointsDuProgramme(programme) {
  return String(programme || '').split('\n').map(l => l.replace(/^[\s•\-–*]+/, '').trim())
    .filter(l => l.length > 3).slice(0, 200);
}

// ── La part automatique ──────────────────────────────────────────────────────

// Le référentiel exprime le volume en périodes ; la DUE l'annonce aussi en
// heures. Une période vaut 50 minutes : les heures s'en déduisent à 1,2 près,
// la même constante que partout ailleurs dans Lucie.
const enHeures = per => (per == null ? null : Math.round(Number(per) / 1.2));

/**
 * LE DOSSIER PÉDAGOGIQUE, DÉCOUPÉ.
 *
 * Le modèle Word disait, à trois endroits, « copier le contenu du DP » — et
 * c'est exactement ce que chacun faisait, à la main, en recopiant un texte
 * officiel qui figure déjà dans Lucie. L'import du dossier pédagogique dépose
 * ses sections dans `ue.ue_det`, sous des titres « ## ». On les redonne ici
 * telles quelles, à charge pour l'écran de les proposer d'un clic.
 *
 * Le degré de maîtrise n'est pas une section à lui seul : le dossier le loge à
 * la fin des acquis, après la phrase « Pour la détermination du degré de
 * maîtrise… ». On coupe donc là.
 */
function sectionsDuDP(ueDet) {
  if (!ueDet) return null;
  const parts = {};
  let titre = null, corps = [];
  const poser = () => { if (titre) parts[titre] = corps.join('\n').trim(); };
  for (const l of String(ueDet).split('\n')) {
    const m = l.match(/^##\s+(.*)$/);
    if (m) { poser(); titre = m[1].trim().toLowerCase(); corps = []; }
    else if (titre) corps.push(l);
  }
  poser();

  const acquisBrut = parts["acquis d'apprentissage"] || '';
  // Les dossiers en PDF isolent déjà le degré de maîtrise ; les anciens
  // imports .docx le laissaient à la queue des acquis, après « Pour la
  // détermination / Pour déterminer le degré de maîtrise ». On coupe alors là.
  const coupe = parts['degré de maîtrise'] ? -1
    : acquisBrut.search(/pour (la d[ée]termination du|d[ée]terminer le) degr[ée] de ma[îi]trise/i);
  const fin = couperFinalites(parts['finalités']);
  const dp = {
    finalites: fin.particulieres,
    finalites_generales: fin.generales,
    capacites: parts['capacités préalables'] || null,
    acquis: (coupe > 0 ? acquisBrut.slice(0, coupe) : acquisBrut).trim() || null,
    degre_maitrise: parts['degré de maîtrise']
      || (coupe > 0 ? acquisBrut.slice(coupe).trim() : null),
    programme: parts['programme'] || null,
  };
  return Object.values(dp).some(Boolean) ? dp : null;
}

/**
 * L'UNITÉ DANS SA SECTION (Charles, 8 octobre 2026 : « indiquer où se trouve l'UE
 * dans la section : si elle est prérequise d'une autre et la suite d'une autre ;
 * un mini schéma de capitalisation »). Les prérequis du référentiel
 * (ue_prerequis), et le schéma de la section — le même dessin que la fiche de
 * l'étudiant (construireGraphe, schemaSvg) — où l'unité est en bleu plein, ses
 * prérequis et ses suites en bleu clair, le reste en gris.
 */
function situationDansLaSection(ue, annee) {
  try {
    const nom = db.prepare('SELECT MIN(ue_nom) n FROM ue WHERE ue_num = ? AND annee_scolaire = ?');
    const lien = l => ({ ue_num: l.n, ue_nom: nom.get(l.n, annee)?.n || null, type: l.type || 'legal' });
    const prerequis = db.prepare("SELECT DISTINCT prerequis_num n, COALESCE(type,'legal') type FROM ue_prerequis WHERE ue_num = ? AND (annee_scolaire IS NULL OR annee_scolaire = ?)")
      .all(ue.ue_num, annee).map(lien).sort((a, b) => a.ue_num - b.ue_num);
    const suites = db.prepare("SELECT DISTINCT ue_num n, COALESCE(type,'legal') type FROM ue_prerequis WHERE prerequis_num = ? AND (annee_scolaire IS NULL OR annee_scolaire = ?)")
      .all(ue.ue_num, annee).map(lien).sort((a, b) => a.ue_num - b.ue_num);
    const proches = new Set([...prerequis, ...suites].map(x => x.ue_num));
    let schema = null;
    if (ue.section) {
      const g = construireGraphe({ sections: [ue.section], annee,
        // construireGraphe passe le NUMÉRO de l'unité, pas le nœud.
        etat: num => (num === ue.ue_num ? { statut: 'accessible', inscrite: true }
          : proches.has(num) ? { statut: 'accessible' } : { statut: 'bloquee' }) });
      if (g.nodes?.length) schema = schemaSvg(g);
    }
    return { prerequis, suites, schema };
  } catch (e) { console.error('[due] situation :', e.message); return { prerequis: [], suites: [], schema: null }; }
}

/** LES FINALITÉS EN DEUX (Charles, 8 octobre 2026) : le dossier pédagogique les
 *  écrit d'un tenant — générales, puis particulières. On coupe au titre
 *  « particulières » ; sans lui, tout reste aux particulières. */
function couperFinalites(t) {
  const txt = String(t || '').trim();
  if (!txt) return { generales: null, particulieres: null };
  const i = txt.search(/finalit[ée]s?\s+particuli[èe]res?/i);
  if (i < 0) return { generales: null, particulieres: txt };
  const avant = txt.slice(0, i).replace(/^\s*\d*[.)]?\s*finalit[ée]s?\s+g[ée]n[ée]rales?\s*:?\s*/i, '').replace(/\s*\d+(\.\d+)*[.)]?\s*$/, '').trim();
  const apres = txt.slice(i).replace(/^finalit[ée]s?\s+particuli[èe]res?\s*:?\s*/i, '').trim();
  return { generales: avant || null, particulieres: apres || null };
}

function partieAutomatique(ueNum, annee) {
  const ue = db.prepare('SELECT * FROM ue WHERE ue_num = ? AND annee_scolaire = ?')
    .get(ueNum, annee);
  if (!ue) return null;

  const cours = db.prepare(`
    SELECT cours_code, cours_nom, cours_per, heures, ct_pp, quadrimestre_cours
    FROM cours WHERE ue_num = ? AND annee_scolaire = ?
    ORDER BY cours_num, cours_code
  `).all(ueNum, annee);

  const acquis = db.prepare(
    'SELECT aa_code, aa_num, description, chapeau FROM aa WHERE ue_num = ? ORDER BY aa_num, aa_code')
    .all(ueNum);
  const introduction_acquis = introductionAcquis(ueNum).texte;

  // Le rattachement acquis ↔ cours vient de la pondération : c'est la somme
  // des acquis qui fait le cours, et cette table seule en tient le compte.
  const liens = db.prepare(
    'SELECT cours_code, aa_code, poids FROM aa_ponderation WHERE ue_num = ? AND annee_scolaire = ?').all(ueNum, annee);
  const parCours = {};
  for (const l of liens) (parCours[l.cours_code] = parCours[l.cours_code] || []).push(l.aa_code);

  const periodes = ue.ue_per_etudiants ?? cours.reduce((n, c) => n + (c.cours_per || 0), 0);

  // LE RESPONSABLE DE L'UNITÉ.
  //
  // Le champ était libre : chacun y écrivait ce qu'il voulait, et rien ne
  // garantissait que la personne citée enseignât seulement dans l'unité. Il se
  // choisit désormais parmi les titulaires, et Lucie propose d'office celui
  // qui y porte le plus de périodes — c'est en général lui qui répond de
  // l'unité. La proposition n'est qu'un défaut : le choix reste ouvert.
  const enseignants = db.prepare(`
    SELECT p.id, p.nom, p.prenom,
           SUM(COALESCE(a.periodes_attribuees, 0)) AS periodes,
           COUNT(DISTINCT a.code_cours)            AS nb_cours,
           GROUP_CONCAT(DISTINCT a.code_cours)     AS cours
    FROM attribution a JOIN professeur p ON p.id = a.professeur_id
    WHERE a.ue_num = ? AND a.annee_scolaire = ? AND a.professeur_id IS NOT NULL
    GROUP BY p.id, p.nom, p.prenom
    ORDER BY periodes DESC, nb_cours DESC, p.nom
  `).all(ueNum, annee);

  /* DANS L'ORDRE DES NUMÉROS (Charles, 8 octobre 2026) : 333.2 avant 333.10, AA333.2
     avant AA333.10 — le tri alphabétique les mélangeait. */
  const naturel = (a, b) => String(a).localeCompare(String(b), 'fr', { numeric: true });
  cours.sort((a, b) => naturel(a.cours_code, b.cours_code));
  acquis.sort((a, b) => naturel(a.aa_code, b.aa_code));
  // LE CONTEXTE D'UN ACQUIS : le chapeau sous lequel il se range (le dernier posé).
  { let ch = null; for (const a of acquis) { if (a.chapeau) ch = a.chapeau; a.contexte = ch; } }

  return {
    responsable_propose: enseignants[0]?.id ?? null,
    situation: situationDansLaSection(ue, annee),
    dp: sectionsDuDP(ue.ue_det),
    ue: {
      ue_num: ue.ue_num, ue_nom: ue.ue_nom, ue_code_fwb: ue.ue_code_fwb,
      section: ue.section, ects: ue.ects, niveau: ue.ue_niveau, niv: ue.ue_niv,
      tc: String(ue.ue_tc || '').trim().toLowerCase() === 'x',
      quadrimestre: ue.ue_quad, prerequise: ue.ue_prerequise,
      et_ref: ue.et_ref, periodes, heures: enHeures(periodes),
    },
    cours: cours.map(c => ({
      ...c, heures: c.heures ?? enHeures(c.cours_per),
      acquis: parCours[c.cours_code] || [],
    })),
    acquis,
    introduction_acquis,
    enseignants,
    etablissement: identiteEtablissement(),
  };
}

function lireDUE(ueNum, annee) {
  const l = db.prepare('SELECT * FROM due WHERE ue_num = ? AND annee_scolaire = ?')
    .get(ueNum, annee);
  let contenu = {};
  if (l?.contenu) { try { contenu = JSON.parse(l.contenu); } catch { /* illisible */ } }
  return {
    contenu,
    statut: l?.statut || 'preparation',
    maj_le: l?.maj_le || null, maj_par: l?.maj_par || null,
    valide_le: l?.valide_le || null, valide_par: l?.valide_par || null,
  };
}

// ── Les unités auxquelles j'ai accès ─────────────────────────────────────────

r.get('/', authRequired, (req, res) => {
  const annee = anneeDeTravail(req);
  const direction = NIVEAU_DIRECTION.includes(req.user.role);
  const filtreSection = String(req.query.section || '').trim() || null;

  /* CHACUN VOIT LES DUE QUI LE REGARDENT (Jérôme, 29 septembre 2026) : celles
   * des sections dont il a la GESTION (le périmètre de sa fiche), et celles
   * des unités où il porte une ATTRIBUTION — quel que soit son rôle : une
   * coordination qui enseigne hors de sa section voit aussi cette DUE-là.
   * La direction voit tout. */
  const parSection = new Map();
  if (direction) {
    for (const u of db.prepare(`
      SELECT ue_num, ue_nom, section, ects, ue_quad, ue_tc FROM ue
      WHERE annee_scolaire = ? ORDER BY ue_num`).all(annee)) {
      parSection.set(u.ue_num, u);
    }
  } else {
    const perim = getUserSections(req.user);          // null = toutes
    if (perim === null) {
      for (const u of db.prepare(`
        SELECT ue_num, ue_nom, section, ects, ue_quad, ue_tc FROM ue
        WHERE annee_scolaire = ? ORDER BY ue_num`).all(annee)) {
        parSection.set(u.ue_num, u);
      }
    } else if (perim.length) {
      const marks = perim.map(() => '?').join(',');
      for (const u of db.prepare(`
        SELECT ue_num, ue_nom, section, ects, ue_quad, ue_tc FROM ue
        WHERE annee_scolaire = ? AND section IN (${marks}) ORDER BY ue_num`)
        .all(annee, ...perim)) {
        parSection.set(u.ue_num, u);
      }
    }
    const profId = db.prepare('SELECT professeur_id FROM utilisateur WHERE id = ?')
      .get(req.user.id)?.professeur_id || null;
    if (profId) {
      for (const u of db.prepare(`
        SELECT DISTINCT u.ue_num, u.ue_nom, u.section, u.ects, u.ue_quad, u.ue_tc
        FROM ue u JOIN attribution a
          ON a.ue_num = u.ue_num AND a.annee_scolaire = u.annee_scolaire
        WHERE a.professeur_id = ? AND u.annee_scolaire = ?`).all(profId, annee)) {
        parSection.set(u.ue_num, u);
      }
    }
  }
  let ues = [...parSection.values()].sort((a, b) => a.ue_num - b.ue_num);
  if (filtreSection) ues = ues.filter(u => u.section === filtreSection);

  const etats = {};
  for (const d of db.prepare(
    'SELECT ue_num, statut, maj_le, valide_le FROM due WHERE annee_scolaire = ?').all(annee)) {
    etats[d.ue_num] = d;
  }

  res.json({
    annee, peut_valider: direction,
    sections: [...new Set([...parSection.values()].map(u => u.section).filter(Boolean))].sort(),
    ues: ues.map(u => ({
      ...u,
      statut: etats[u.ue_num]?.statut || 'preparation',
      maj_le: etats[u.ue_num]?.maj_le || null,
      valide_le: etats[u.ue_num]?.valide_le || null,
    })),
  });
});

// ── Une DUE ──────────────────────────────────────────────────────────────────

r.get('/:ueNum', authRequired, (req, res) => {
  const annee = anneeDeTravail(req);
  const ueNum = Number(req.params.ueNum);
  const droits = droitsSurLUE(req.user, ueNum, annee);
  if (!droits.lire) {
    return res.status(403).json({ error: "Cette unité d'enseignement ne figure pas dans vos attributions." });
  }
  const auto = partieAutomatique(ueNum, annee);
  if (!auto) return res.status(404).json({ error: `L'unité ${ueNum} n'existe pas en ${annee}` });

  const d = lireDUE(ueNum, annee);
  // Le tableau de l'an dernier, proposé tant que celui de l'année est vide.
  let grille_precedente = null;
  if (!d.contenu?.grille_criteres) {
    const m = /^(\d{4})-(\d{4})$/.exec(annee);
    if (m) {
      const prec = lireDUE(ueNum, `${+m[1] - 1}-${+m[2] - 1}`);
      if (prec.contenu?.grille_criteres) grille_precedente = { annee: `${+m[1] - 1}-${+m[2] - 1}`, grille: prec.contenu.grille_criteres };
    }
  }
  res.json({
    annee, ...auto, ...d,
    evaluation_unique: evaluationUnique(ueNum, annee),
    finalites_generales_defaut: getParam('due_finalites_generales', FINALITES_GENERALES_DEFAUT),
    note_supports: getParam('due_note_supports', NOTE_SUPPORTS_DEFAUT),
    points_programme: (Array.isArray(d.contenu?.points) && d.contenu.points.length)
      ? d.contenu.points.map(p => p.texte).filter(Boolean)
      : pointsDuProgramme(String(d.contenu?.programme || auto.dp?.programme || '').replace(/<[^>]+>/g, '\n')),
    grille_precedente,
    droits: { ...droits, ecrire: droits.ecrire && d.statut !== 'validee',
      regler_mode: peutReglerMode(req.user, ueNum, annee) && (d.statut !== 'validee' || droits.valider) },
  });
});

r.put('/:ueNum', authRequired, (req, res) => {
  const annee = anneeDeTravail(req);
  const ueNum = Number(req.params.ueNum);
  const droits = droitsSurLUE(req.user, ueNum, annee);
  if (!droits.ecrire) {
    return res.status(403).json({ error: "Vous n'êtes pas titulaire d'un cours de cette unité." });
  }
  const actuel = lireDUE(ueNum, annee);
  if (actuel.statut === 'validee' && !droits.valider) {
    return res.status(409).json({
      error: 'Cette DUE a été validée par la direction : elle est en lecture seule. '
           + 'Demandez sa réouverture pour la modifier.',
    });
  }

  const contenu = req.body?.contenu;
  if (!contenu || typeof contenu !== 'object') {
    return res.status(400).json({ error: 'contenu requis' });
  }
  // LA MISE EN PAGE SE FILTRE À L'ÉCRITURE (liste fermée, lib/texteCorpus.js) :
  // la base ne garde que du texte sûr, le document peut l'afficher tel quel.
  for (const k of CHAMPS_RICHES) if (typeof contenu[k] === 'string' && estHtml(contenu[k])) contenu[k] = assainir(contenu[k]);
  if (Array.isArray(contenu.points)) {
    contenu.points = contenu.points.filter(p => p && typeof p === 'object').slice(0, 300)
      .map(p => ({ texte: String(p.texte || '').slice(0, 2000), cours: (Array.isArray(p.cours) ? p.cours : []).map(String).slice(0, 20) }));
  }

  db.prepare(`
    INSERT INTO due (ue_num, annee_scolaire, contenu, statut, maj_le, maj_par)
    VALUES (?,?,?,?,datetime('now'),?)
    ON CONFLICT(ue_num, annee_scolaire) DO UPDATE SET
      contenu = excluded.contenu, maj_le = excluded.maj_le, maj_par = excluded.maj_par
  `).run(ueNum, annee, JSON.stringify(contenu), actuel.statut, req.user.nom || req.user.email);

  res.json({ ok: true, ...lireDUE(ueNum, annee) });
});

r.put('/:ueNum/mode-evaluation', authRequired, (req, res) => {
  const annee = anneeDeTravail(req);
  const ueNum = Number(req.params.ueNum);
  if (!peutReglerMode(req.user, ueNum, annee)) {
    return res.status(403).json({ error: "Le mode d'évaluation se règle par la coordination (de cursus, pédagogique, qualité) ou la direction." });
  }
  const d = lireDUE(ueNum, annee);
  if (d.statut === 'validee' && !NIVEAU_DIRECTION.includes(req.user.role)) {
    return res.status(409).json({ error: 'Cette DUE est validée : demandez sa réouverture à la direction.' });
  }
  const unique = !!req.body?.unique;
  db.exec(`CREATE TABLE IF NOT EXISTS ue_evaluation_unique (
    ue_num INTEGER NOT NULL, annee_scolaire TEXT NOT NULL, actif INTEGER NOT NULL DEFAULT 1,
    maj_le TEXT DEFAULT CURRENT_TIMESTAMP, maj_par TEXT, PRIMARY KEY (ue_num, annee_scolaire))`);
  db.prepare(`INSERT INTO ue_evaluation_unique (ue_num, annee_scolaire, actif, maj_le, maj_par)
    VALUES (?,?,?, datetime('now'), ?)
    ON CONFLICT(ue_num, annee_scolaire) DO UPDATE SET actif = excluded.actif, maj_le = excluded.maj_le, maj_par = excluded.maj_par`)
    .run(ueNum, annee, unique ? 1 : 0, req.user?.email || req.user?.nom || null);
  console.log(`[due] UE ${ueNum} ${annee} : évaluation ${unique ? 'globale' : 'par activité'} (${req.user?.email || '?'})`);
  res.json({ ok: true, evaluation_unique: unique });
});

// La validation fige. La réouverture la défait — les deux sont réservées à la
// direction, et l'une comme l'autre laissent la trace de qui a agi.
r.post('/:ueNum/valider', authRequired, (req, res) => {
  const annee = anneeDeTravail(req);
  const ueNum = Number(req.params.ueNum);
  if (!droitsSurLUE(req.user, ueNum, annee).valider) {
    return res.status(403).json({ error: 'Seule la direction valide une DUE.' });
  }
  const rouvrir = !!req.body?.rouvrir;
  const qui = req.user.nom || req.user.email;

  db.prepare(`
    INSERT INTO due (ue_num, annee_scolaire, contenu, statut, valide_le, valide_par)
    VALUES (?,?,'{}',?,?,?)
    ON CONFLICT(ue_num, annee_scolaire) DO UPDATE SET
      statut = excluded.statut, valide_le = excluded.valide_le, valide_par = excluded.valide_par
  `).run(ueNum, annee, rouvrir ? 'preparation' : 'validee',
    rouvrir ? null : new Date().toISOString().slice(0, 10), rouvrir ? null : qui);

  res.json({ ok: true, ...lireDUE(ueNum, annee) });
});

// ── Le document ──────────────────────────────────────────────────────────────

const esc = s => String(s ?? '').replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const METHODES = [
  ['ex_cathedra', 'Cours ex cathedra'], ['exercices', "Réalisation d'exercices"],
  ['etude_cas', 'Étude de cas'], ['problemes', 'Apprentissage par problèmes'],
  ['classe_inversee', 'Classe inversée'], ['groupe', 'Collaboration en groupe'],
  ['pairs', 'Apprentissage par les pairs'], ['situation', 'Mise en situation'],
  ['pratique', 'Pratique'], ['debats', 'Débats'], ['jeux_roles', 'Jeux de rôles'],
  ['simulation', 'Simulation'], ['hybridation', 'Hybridation'],
];
// Travail individuel et travail de groupe (Charles, 8 octobre 2026) ; « travail » garde sa clé.
const EPREUVES = [['ecrit', 'Écrit'], ['oral', 'Oral'], ['pratique', 'Pratique'],
  ['travail', 'Travail individuel'], ['travail_groupe', 'Travail de groupe'], ['continue', 'Évaluation continue']];

const NOTE_UE_DEFAUT =
  "Les notes de chaque activité d'apprentissage de l'UE s'additionnent en une moyenne "
  + "pondérée, mais uniquement si chaque activité et chaque acquis atteint 10/20. "
  + "Si une seule note est inférieure à 10/20, l'unité est considérée comme non acquise (NA) "
  + "et ne génère aucune moyenne, sauf décision de délibération du Conseil des études.";

/* LA FEUILLE DUE SE PARAMÈTRE, ELLE NE SE RECOMPILE PLUS (Jérôme, 29 septembre
 * 2026 : « je voudrais pouvoir paramétrer la feuille DUE dans paramètres car
 * ici elle est codée en dur »). Les trois textes fixes du document vivent dans
 * la table parametre (Configuration → Paramètres, groupe « due ») ; les
 * valeurs ci-dessous ne servent qu'à AMORCER et de repli. */
const FINALITES_GENERALES_DEFAUT =
  "Conformément à l'article 7 du décret de la Communauté française du 16 avril 1991 "
  + "organisant l'enseignement pour adultes, cette unité d'enseignement doit concourir à "
  + "l'épanouissement individuel en promouvant une meilleure insertion professionnelle, "
  + "sociale, culturelle et scolaire, et répondre aux besoins et demandes en formation "
  + "émanant des entreprises, des administrations, de l'enseignement et, d'une manière "
  + "générale, des milieux socio-économiques et culturels.";
/* (Charles, 8 octobre 2026.) La phrase sous les supports de cours. */
const NOTE_SUPPORTS_ANCIENNE =
  "L'existence d'un support de cours obligatoire ne dispense pas l'étudiant de la prise "
  + "de notes.";
const NOTE_SUPPORTS_DEFAUT =
  "L'existence d'un support de cours obligatoire ne dispense pas de la prise de note de "
  + "l'étudiant. Toute matière vue aux cours est matière d'évaluation.";

export function seedParametresDUE(dbx) {
  try {
    const ins = dbx.prepare(
      'INSERT OR IGNORE INTO parametre (cle, valeur, label, groupe) VALUES (?,?,?,?)');
    ins.run('due_finalites_generales', FINALITES_GENERALES_DEFAUT,
      'DUE — texte des finalités générales', 'due');
    ins.run('due_note_supports', NOTE_SUPPORTS_DEFAUT,
      'DUE — mention sous les supports de cours', 'due');
    // La nouvelle phrase remplace l'ancienne — jamais un texte qu'on a déjà retouché.
    dbx.prepare("UPDATE parametre SET valeur = ? WHERE cle = 'due_note_supports' AND valeur = ?")
      .run(NOTE_SUPPORTS_DEFAUT, NOTE_SUPPORTS_ANCIENNE);
    ins.run('due_note_evaluation', NOTE_UE_DEFAUT,
      "DUE — règle d'évaluation par défaut (modifiable par UE)", 'due');
  } catch (e) { console.error('[migration] parametres DUE :', e.message); }
}

function bloc(titre, corps) {
  return `<div class="bloc"><div class="bloc-t">${esc(titre)}</div>
    <div class="bloc-c">${corps}</div></div>`;
}
const para = t => String(t || '').split(/\n+/).filter(Boolean)
  .map(l => `<p>${esc(l)}</p>`).join('') || '<p class="vide">à compléter</p>';
// Les champs que la coordination met en page (gras, couleurs, listes, tableaux).
const CHAMPS_RICHES = ['finalites_generales', 'finalites', 'programme', 'criteres', 'degre_maitrise', 'note_ue'];
const estHtml = t => /<\/?(p|br|b|strong|i|em|u|ul|ol|li|span|h[1-4]|table|mark|sub|sup|a)\b/i.test(String(t || ''));
/** Un texte riche (HTML filtré) tel quel ; un texte simple, en paragraphes. */
const riche = t => (estHtml(t) ? `<div class="riche">${assainir(t)}</div>` : para(t));

/**
 * LE TABLEAU DES CRITÈRES (Charles, 30 septembre 2026 ; le modèle : UE 333,
 * « 4.1 Introduction à l'anatomie »). Pour chaque acquis, les points du
 * programme qui le composent, et pour chacun : l'indicateur (seuil = 50 %),
 * le signe de non-réussite, un exemple de question — la chaîne du Guide pour
 * l'évaluation par acquis d'apprentissage. Un tableau pour l'unité si elle est
 * évaluée d'une seule épreuve, un par activité sinon. La case de l'acquis
 * couvre les lignes de ses points.
 */
function grillesCriteres(auto, c, unique) {
  const g = c.grille_criteres || {};
  const aaDe = Object.fromEntries((auto.acquis || []).map(a => [a.aa_code, a]));
  // **gras** dans une case : le seul balisage admis, comme sur le modèle de la direction.
  const cellule = t => esc(t || '').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
  /* LE MODÈLE DU 8 OCTOBRE 2026 (Charles) : Contexte = chapeau · AA · Critère (l'AA
     contextualisée par le point du programme) · Indicateurs (l'échelle, seuil 50 %,
     composée des degrés de maîtrise du DP) · Signe de non-réussite · Exemples. */
  const tableau = lignes => {
    const ls = (lignes || []).filter(l => l && (l.aa_code || l.point || l.indicateur));
    if (!ls.length) return '<p class="vide">à compléter</p>';
    let html = '<table class="doc crit"><tr><th style="width:15%">Contexte (chapeau)</th><th style="width:17%">Acquis d’apprentissage</th>'
      + '<th>Critère<div class="def">l’AA contextualisée par le point du programme : l’étudiant est capable concrètement de…</div></th>'
      + '<th>Indicateurs<div class="def">l’échelle : quand j’observe que c’est réussi (seuil = 50 %) — composé des degrés de maîtrise du DP</div></th>'
      + '</tr>';   // signe de non-réussite et exemples : donnés en classe, hors DUE (8 octobre 2026)
    for (let i = 0; i < ls.length; i++) {
      const l = ls[i];
      let span = 1;
      if (i === 0 || ls[i - 1].aa_code !== l.aa_code) { while (i + span < ls.length && ls[i + span].aa_code === l.aa_code) span++; }
      else span = 0;
      const a = aaDe[l.aa_code] || {};
      html += '<tr>' + (span ? `<td rowspan="${span}">${cellule(a.contexte || '')}</td><td rowspan="${span}"><b>${esc(l.aa_code || '')}</b>${a.description ? `<br>${esc(a.description)}` : ''}</td>` : '')
        + ['point', 'indicateur'].map(k => `<td>${cellule(l[k])}</td>`).join('') + '</tr>';
    }
    return html + '</table>';
  };
  if (unique) {
    if (!(g.__ue__ || []).length) return '';
    return '<div class="crit-t">Épreuve de l’unité — évaluation globale</div>' + tableau(g.__ue__);
  }
  const avec = (auto.cours || []).filter(co => (g[co.cours_code] || []).length);
  return avec.map(co => `<div class="crit-t">${esc(co.cours_code)} — ${esc(co.cours_nom || '')}</div>${tableau(g[co.cours_code])}`).join('');
}

/** La situation : prérequis, suites, et le mini schéma de la section. */
function situationHtml(auto) {
  const S = auto.situation || {};
  const n = auto.ue.ue_num;
  const liste = l => l.map(x => `UE ${x.ue_num}${x.ue_nom ? ` (${esc(x.ue_nom)})` : ''}${x.type === 'interne' ? ' — prérequis interne' : ''}`).join(', ');
  const phrases = [
    S.prerequis?.length ? `<p>L'UE ${n} fait suite à ${liste(S.prerequis)} : ${S.prerequis.length > 1 ? 'elles en sont' : 'elle en est'} le prérequis.</p>`
      : `<p>L'UE ${n} n'a pas de prérequis dans la section.</p>`,
    S.suites?.length ? `<p>L'UE ${n} est prérequise à ${liste(S.suites)}.</p>` : `<p>L'UE ${n} n'est prérequise à aucune autre unité.</p>`,
  ].join('');
  return phrases + (S.schema ? `<div class="schema-due">${S.schema}</div>
    <p class="fin">En bleu plein, cette unité ; en bleu clair, ses prérequis et ses suites.</p>` : '');
}

/** LE PROGRAMME, POINT PAR POINT, AVEC LES CODES DE COURS (Charles, 8 octobre 2026). */
function programmeHtml(c, texte, auto) {
  const pts = (Array.isArray(c.points) ? c.points : []).filter(p => String(p.texte || '').trim());
  if (!pts.length) return riche(texte);
  const noms = Object.fromEntries((auto.cours || []).map(x => [x.cours_code, x.cours_nom]));
  return `${texte && estHtml(texte) ? riche(texte) : ''}<table class="doc"><tr><th>Point du programme</th><th style="width:30%">Activités d'apprentissage</th></tr>${pts.map(p =>
    `<tr><td>${esc(p.texte)}</td><td>${(p.cours || []).map(k => `<span class="puce" title="${esc(noms[k] || '')}">${esc(k)}</span>`).join(' ') || '<span class="vide">—</span>'}</td></tr>`).join('')}</table>`;
}

export function documentDUE(ueNum, annee) {
  const auto = partieAutomatique(ueNum, annee);
  if (!auto) return null;
  const { contenu, statut, valide_le } = lireDUE(ueNum, annee);
  const u = auto.ue;
  const c = contenu || {};

  // Le responsable est enregistré par son identifiant : le document doit donc
  // le renommer. Un ancien texte libre est conservé tel quel.
  // Ce que l'enseignant n'a pas encore rédigé est repris du dossier
  // pédagogique : c'est le texte officiel, et une DUE qui l'affiche vaut
  // mieux qu'une DUE vide. Dès qu'il écrit, c'est son texte qui vaut.
  const dp = auto.dp || {};
  const rediges = {
    finalites_generales: c.finalites_generales || dp.finalites_generales,
    finalites:      c.finalites      || dp.finalites,
    programme:      c.programme      || dp.programme,
    degre_maitrise: c.degre_maitrise || dp.degre_maitrise,
    criteres:       c.criteres,
  };

  const idResp = c.responsable ?? auto.responsable_propose;
  const resp = auto.enseignants.find(e => String(e.id) === String(idResp));
  const nomResp = resp ? `${resp.prenom} ${resp.nom}`
    : (typeof c.responsable === 'string' && !/^\d+$/.test(c.responsable) ? c.responsable : null);

  const ident = [
    ['Cursus', c.cursus || auto.ue.section],
    ['Section', u.section],
    ["Bloc d'études", c.bloc ? `Bloc ${c.bloc}` : null],
    ['Situation dans la formation', u.quadrimestre],
    ['Unité prérequise', u.prerequise || 'Aucune'],
    ['Tronc commun', u.tc ? 'Oui' : null],
    ['Volume horaire / an', u.periodes ? `${u.periodes} périodes — soit ${u.heures} h` : null],
    ['Crédits ECTS', u.ects],
    ["Langue d'enseignement", c.langue_ens || 'Français'],
    ["Langue d'évaluation", c.langue_eval || 'Français'],
    ['Niveau du cadre européen des certifications', c.niveau_cec
      || (u.niveau === 'SUP' ? 'Niveau 6 (TC)' : null)],
    ["Responsable de l'unité", nomResp],
    ['Co-diplomation HELB', c.codiplomation ? 'Oui' : 'Non'],
  ].filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');

  const titulaires = auto.enseignants.length
    ? auto.enseignants.map(e =>
      `<li>${esc(e.prenom)} ${esc(e.nom)}${e.cours ? ` — ${esc(e.cours)}` : ''}</li>`).join('')
    : '<li class="vide">aucune attribution encodée pour cette unité</li>';

  const listeCours = auto.cours.length ? auto.cours.map(x => `
    <tr><td>${esc(x.cours_code)}</td><td>${esc(x.cours_nom)}</td>
        <td class="n">${x.cours_per ?? ''}</td><td class="n">${x.heures ?? ''}</td>
        <td>${esc((x.acquis || []).join(', '))}</td></tr>`).join('')
    : '<tr><td colspan="5" class="vide">aucun cours rattaché</td></tr>';

  const ligneAA = a => `
    <li><b>${esc(a.aa_code)}</b> — ${esc(a.description || 'libellé à encoder dans le référentiel')}</li>`;
  // LES CHAPEAUX DU DOSSIER, quand il y en a : chacun ouvre sa liste.
  // TROIS NIVEAUX, COMME LE DOSSIER : la phrase de l'unité une fois, puis
  // chaque groupe sous son chapeau (routes/aa.js, introductionAcquis).
  const groupesAA = [];
  for (const a of auto.acquis) {
    if (a.chapeau || !groupesAA.length) groupesAA.push({ chapeau: a.chapeau || null, aa: [] });
    groupesAA[groupesAA.length - 1].aa.push(a);
  }
  const blocAA = auto.acquis.length
    ? `<p>${esc(auto.introduction_acquis)}</p>` + groupesAA.map(g => `${g.chapeau
        ? `<p class="chapeau">${esc(g.chapeau).replace(/\n/g, '<br>')}</p>` : ''}
      <ul class="serre">${g.aa.map(ligneAA).join('')}</ul>`).join('')
    : `<p>${esc(auto.introduction_acquis)}</p><ul class="serre">
      <li class="vide">aucun acquis encodé pour cette unité</li></ul>`;

  const methodes = METHODES
    .filter(([k]) => c.methodes?.[k])
    .map(([, l]) => `<span class="puce">${esc(l)}</span>`).join(' ')
    + (c.methode_autre ? ` <span class="puce">${esc(c.methode_autre)}</span>` : '');

  const supports = auto.cours.map(x => {
    const s = c.supports?.[x.cours_code] || {};
    return `<tr><td><b>${esc(x.cours_code)}</b> — ${esc(x.cours_nom)}</td><td>${esc(s.type || '')}</td>
      <td class="n">${s.obligatoire ? 'Obligatoire' : '—'}</td></tr>`;
  }).join('');

  const evaluation = ['s1', 's2'].map(sess => `
    <tr class="sess"><td colspan="${EPREUVES.length + 1}">
      ${sess === 's1' ? 'Première session' : 'Seconde session'}</td></tr>
    ${auto.cours.map(x => {
    const e = c.evaluation?.[x.cours_code]?.[sess] || {};
    return `<tr><td><b>${esc(x.cours_code)}</b> — ${esc(x.cours_nom)}</td>${EPREUVES
      .map(([k]) => `<td class="n">${e[k] ? '✔' : ''}</td>`).join('')}</tr>`;
  }).join('')}`).join('');

  const corps = `
  <div class="attestation">
    <div class="entete">
      <div class="nom">${esc(auto.etablissement.nom)}</div>
      <div class="sous">Description d'unité d'enseignement</div>
    </div>

    <div class="titre-ue">UE ${u.ue_num} — ${esc(u.ue_nom)}
      <span class="millesime">${esc(annee)}</span></div>
    <div class="etat ${statut === 'validee' ? 'ok' : 'brouillon'}">
      ${statut === 'validee'
    ? `Validée par la direction le ${esc(valide_le || '')}`
    : 'En préparation — document non encore validé par la direction'}
    </div>

    <table class="doc ident">${ident}</table>

    ${bloc("Titulaires des activités d'apprentissage", `<ul class="serre">${titulaires}</ul>`)}

    ${bloc("Situation dans la section", situationHtml(auto))}

    ${bloc('Finalités générales',
      rediges.finalites_generales ? riche(rediges.finalites_generales)
        : para(getParam('due_finalites_generales', FINALITES_GENERALES_DEFAUT)))}

    ${bloc('Finalités particulières', riche(rediges.finalites))}

    ${bloc("Acquis d'apprentissage", blocAA)}

    ${bloc("Activités d'apprentissage de l'unité", `<table class="doc">
      <tr><th>Code</th><th>Intitulé</th><th class="n">Périodes</th><th class="n">Heures</th>
          <th>Acquis évalués</th></tr>${listeCours}</table>`)}

    ${bloc('Programme', programmeHtml(c, rediges.programme, auto))}

    ${bloc("Méthodes d'apprentissage", (methodes || '<p class="vide">à compléter</p>')
      + (rediges.criteres ? `<div class="sous-t">Contrat pédagogique</div>${riche(rediges.criteres)}` : ''))}

    ${bloc('Supports de cours', `<table class="doc">
      <tr><th>Activité</th><th>Type de support</th><th class="n">Statut</th></tr>${supports}</table>
      <p class="fin">${esc(getParam('due_note_supports', NOTE_SUPPORTS_DEFAUT))}</p>`)}

    ${bloc("Modalités d'évaluation", `<table class="doc">
      <tr><th>Activité</th>${EPREUVES.map(([, l]) => `<th class="n">${esc(l)}</th>`).join('')}</tr>
      ${evaluation}</table>
      <div class="fin">${c.note_ue ? riche(c.note_ue) : esc(getParam('due_note_evaluation', NOTE_UE_DEFAUT))}</div>`)}

    ${bloc("Critères d'évaluation", grillesCriteres(auto, c, evaluationUnique(ueNum, annee)) || '<p class="vide">à compléter</p>')}

    ${bloc('Degré de maîtrise', riche(rediges.degre_maitrise))}
  </div>`;

  // LA FEUILLE DANS LE <head>, PAS APRÈS </html> : ajoutée à la fin, elle
  // cassait le saut de page (catalogue des erreurs, CLAUDE.md). Elle vient
  // après celle de l'enveloppe, donc ses règles l'emportent toujours.
  const doc = envelopper(corps, `DUE ${ueNum} — ${annee}`);
  return doc.includes('</head>') ? doc.replace('</head>', `${STYLE_DUE}</head>`) : doc + STYLE_DUE;
}

// Le gabarit commun porte l'en-tête, les filets dorés et le pied ; la DUE y
// ajoute ses propres blocs. La feuille est concaténée après coup pour que ces
// règles l'emportent sur celles de l'enveloppe.
const STYLE_DUE = `<style>
  .titre-ue { font-size: 13pt; font-weight: 700; color:#1B2B4B; margin: 4mm 0 1mm; }
  .titre-ue .millesime { font-weight: 400; color:#7a8699; font-size: 10pt; }
  .etat { display:inline-block; padding:1mm 3mm; border-radius:2mm; font-size:8pt;
          margin-bottom:3mm; }
  .etat.ok { background:#ecfdf5; border:0.3mm solid #6ee7b7; color:#065f46; }
  .etat.brouillon { background:#fff7ed; border:0.3mm solid #fdba74; color:#9a3412; }
  .bloc { margin: 3mm 0; break-inside: avoid; }
  .bloc-t { background:#1B2B4B; color:#fff; font-size:8.5pt; font-weight:700;
            text-transform:uppercase; letter-spacing:.04em; padding:1.2mm 3mm; }
  .bloc-c { border:0.25mm solid #d8dde6; border-top:0; padding:2.5mm 3mm; font-size:9pt; }
  .bloc-c p { margin: 0 0 1.5mm; }
  table.doc.ident th { width: 52mm; text-align:left; }
  .serre { margin:0; padding-left:5mm; }
  .chapeau { font-style: italic; margin: 1.5mm 0 0.8mm; }
  .serre li { margin-bottom:0.8mm; }
  .puce { display:inline-block; border:0.25mm solid #C9A227; border-radius:2mm;
          padding:0.5mm 2mm; margin:0.5mm 0.5mm 0 0; font-size:8pt; }
  .vide { color:#9aa3b2; font-style:italic; }
  .fin { font-size:8pt; color:#4b5563; margin-top:1.5mm; }
  tr.sess td { background:#f1f4f9; font-weight:700; font-size:8pt; }
  .crit-t { font-weight:700; color:#1B2B4B; font-size:9pt; margin: 2.5mm 0 1mm; }
  table.doc.crit td, table.doc.crit th { vertical-align: top; font-size: 8pt; }
  table.doc.crit tr { break-inside: avoid; }
  table.doc.crit th .def { font-weight: 400; font-style: italic; font-size: 7pt; color: #4b5563; margin-top: 0.5mm; }
  .riche p { margin: 0 0 1.5mm; } .riche ul, .riche ol { margin: 0 0 1.5mm; padding-left: 5mm; }
  .riche table { border-collapse: collapse; width: 100%; } .riche td, .riche th { border: 0.25mm solid #d8dde6; padding: 1mm 1.5mm; }
  .sous-t { font-weight: 700; color:#1B2B4B; font-size: 8.5pt; margin: 2.5mm 0 1mm; }
  .schema-due { margin: 2mm 0 0; } .schema-due svg { max-width: 120mm; max-height: 70mm; height: auto; }
</style>`;

r.get('/:ueNum/document', authRequired, (req, res) => {
  const annee = anneeDeTravail(req);
  const ueNum = Number(req.params.ueNum);
  if (!droitsSurLUE(req.user, ueNum, annee).lire) {
    return res.status(403).json({ error: "Cette unité ne figure pas dans vos attributions." });
  }
  const html = documentDUE(ueNum, annee);
  if (!html) return res.status(404).json({ error: `L'unité ${ueNum} n'existe pas en ${annee}` });
  res.json({ html });
});

export default r;
