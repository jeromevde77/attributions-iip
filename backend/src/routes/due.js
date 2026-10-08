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
import { envelopperDocument } from '../lib/document.js';
import { identiteEtablissement } from './config.js';
import { getParam } from './parametres.js';
import { introductionAcquis } from './aa.js';
import { construireGraphe } from './capitalisation.js';
import sanitizeHtml from 'sanitize-html';
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

/** Les points d'un programme rédigé par bloc de cours : ses puces, à défaut
 *  ses paragraphes — ce que propose le tableau des critères. */
function pointsDesBlocs(blocs) {
  if (!blocs || typeof blocs !== 'object') return [];
  const txt = h => h.replace(/<\/(p|li|div)>|<br ?\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
  const out = [];
  for (const [k, h] of Object.entries(blocs)) {
    if (k === '_intro') continue;
    const lis = [...String(h || '').matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map(m => txt(m[1]));
    const items = lis.length ? lis : [...String(h || '').matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(m => txt(m[1]));
    out.push(...items.filter(t => t.length > 3));
  }
  return out.slice(0, 300);
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
      if (g.nodes?.length) schema = miniSchema(g, ue.ue_num, proches);
    }
    return { prerequis, suites, schema };
  } catch (e) { console.error('[due] situation :', e.message); return { prerequis: [], suites: [], schema: null }; }
}

/* LE MINI SCHÉMA (Charles, 8 octobre 2026 : « trop grand ; pas un énorme schéma,
   juste le numéro de l'UE »). Les colonnes et l'ordre du schéma de capitalisation
   (construireGraphe), en petites pastilles : l'unité en bleu IIP plein, ses
   prérequis et ses suites cerclés de bleu, le reste en gris ; les flèches du
   référentiel. Titres de colonne : le bloc (BA1, BE1…). */
function miniSchema(g, num, proches) {
  const W = 40, H = 18, GX = 22, GY = 6, TETE = 14, PAD = 4;
  const cols = [...new Set(g.nodes.map(n => n.couche))].sort((a, b) => a - b);
  const ix = Object.fromEntries(cols.map((c, i) => [c, i]));
  const pos = {}; const rang = {};
  for (const n of [...g.nodes].sort((a, b) => a.couche - b.couche || a.ordre - b.ordre || a.ue_num - b.ue_num)) {
    const r = rang[n.couche] = (rang[n.couche] ?? -1) + 1;
    pos[n.ue_num] = { x: PAD + ix[n.couche] * (W + GX), y: PAD + TETE + r * (H + GY) };
  }
  const largeur = PAD * 2 + cols.length * W + (cols.length - 1) * GX;
  const hauteur = PAD * 2 + TETE + Math.max(...Object.values(rang)) * (H + GY) + H;
  const titres = (g.colonnes || []).filter(c => c.label && ix[c.index] != null)
    .map(c => `<text x="${PAD + ix[c.index] * (W + GX) + W / 2}" y="${PAD + 9}" text-anchor="middle" font-size="8" font-weight="700" fill="#94A3B8">${esc(c.label)}</text>`).join('');
  const fleches = (g.edges || []).filter(e => pos[e.from] && pos[e.to]).map(e => {
    const a = pos[e.from], b = pos[e.to];
    const fort = e.from === num || e.to === num;
    return `<path d="M${a.x + W},${a.y + H / 2} C${a.x + W + GX / 2},${a.y + H / 2} ${b.x - GX / 2},${b.y + H / 2} ${b.x - 2},${b.y + H / 2}" fill="none" stroke="${fort ? '#19537E' : '#CBD5E1'}" stroke-width="${fort ? 1.2 : 0.8}" marker-end="url(#f${fort ? 'f' : 'g'})"/>`;
  }).join('');
  const boites = g.nodes.map(n => {
    const p = pos[n.ue_num]; const moi = n.ue_num === num; const proche = proches.has(n.ue_num);
    const fond = moi ? '#19537E' : '#FFFFFF', bord = moi ? '#19537E' : proche ? '#19537E' : '#D8DCE4', texte = moi ? '#FFFFFF' : proche ? '#19537E' : '#94A3B8';
    return `<rect x="${p.x}" y="${p.y}" width="${W}" height="${H}" rx="4" fill="${fond}" stroke="${bord}" stroke-width="${proche || moi ? 1.2 : 0.8}"/>
      <text x="${p.x + W / 2}" y="${p.y + 12.5}" text-anchor="middle" font-size="9" font-weight="${moi || proche ? 700 : 500}" fill="${texte}">${n.ue_num}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${largeur} ${hauteur}" width="${largeur}" height="${hauteur}" font-family="Inter, Arial, sans-serif">
    <defs><marker id="ff" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#19537E"/></marker>
    <marker id="fg" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#CBD5E1"/></marker></defs>
    ${titres}${fleches}${boites}</svg>`;
}

/* LE NIVEAU DU CADRE EUROPÉEN, DÉDUIT DE LA SECTION (Charles, 8 octobre 2026 : « ce
   n'est pas niveau 6 mais 5 ici, BES ») : bachelier 6, BES 5, secondaire supérieur 4 ;
   une formation continue n'en porte pas. Une valeur saisie l'emporte. */
function cecDe(section) {
  const n = String(db.prepare('SELECT niveau FROM section WHERE code = ?').get(section)?.niveau || '').toLowerCase();
  if (/^fc|formation continue/.test(n)) return null;
  if (/bachelier/.test(n)) return 'Niveau 6';
  if (/\bbes\b|brevet/.test(n)) return 'Niveau 5';
  if (/\bds\b|secondaire/.test(n)) return 'Niveau 4';
  return null;
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
    cec_defaut: cecDe(auto.ue.section),
    note_supports: getParam('due_note_supports', NOTE_SUPPORTS_DEFAUT),
    points_programme: pointsDesBlocs(d.contenu?.programme_blocs).length ? pointsDesBlocs(d.contenu.programme_blocs)
      : (Array.isArray(d.contenu?.points) && d.contenu.points.length)
      ? d.contenu.points.filter(p => (p.type || 'point') === 'point').map(p => p.texte).filter(Boolean)
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
  for (const k of CHAMPS_RICHES) if (typeof contenu[k] === 'string' && estHtml(contenu[k])) contenu[k] = assainirDUE(contenu[k]);
  // Le programme par bloc de cours : une clé par cours (et _intro), chacune filtrée.
  if (contenu.programme_blocs && typeof contenu.programme_blocs === 'object') {
    contenu.programme_blocs = Object.fromEntries(Object.entries(contenu.programme_blocs).slice(0, 60)
      .map(([k, v]) => [String(k).slice(0, 30), assainirDUE(String(v || '').slice(0, 60000))]));
  } else delete contenu.programme_blocs;
  // Le croisement acquis × programme : cours → point → acquis cochés.
  if (contenu.croisement && typeof contenu.croisement === 'object') {
    contenu.croisement = Object.fromEntries(Object.entries(contenu.croisement).slice(0, 60).map(([co, pts]) => [
      String(co).slice(0, 30),
      Object.fromEntries(Object.entries(pts && typeof pts === 'object' ? pts : {}).slice(0, 300)
        .map(([pt, aa]) => [String(pt).slice(0, 2000), (Array.isArray(aa) ? aa : []).map(String).filter(Boolean).slice(0, 60)])
        .filter(([, aa]) => aa.length)),
    ]));
  } else delete contenu.croisement;
  if (Array.isArray(contenu.points)) {
    contenu.points = contenu.points.filter(p => p && typeof p === 'object').slice(0, 300)
      .map(p => ({ type: ['intro', 'chapeau', 'point'].includes(p.type) ? p.type : 'point',
        texte: String(p.texte || '').slice(0, 2000), cours: (Array.isArray(p.cours) ? p.cours : []).map(String).slice(0, 20) }));
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
/* LE FILTRE DE LA DUE (Charles, 8 octobre 2026 : « pas trop de choix ») : gras,
   italique, souligné, puces, cadre, ligne, et cinq couleurs — rien d'autre. */
const COULEURS_DUE = ['#19537E', '#05B7E6', '#F9B619', '#3E7D5E', '#D2335C'];
function assainirDUE(html) {
  return sanitizeHtml(String(html || ''), {
    allowedTags: ['p', 'br', 'hr', 'blockquote', 'strong', 'b', 'em', 'i', 'u', 'span', 'ul', 'li'],
    allowedAttributes: { span: ['style'] },
    allowedStyles: { span: { color: [new RegExp(`^(${COULEURS_DUE.join('|')})$`, 'i'), /^rgb\(\s*(25,\s*83,\s*126|5,\s*183,\s*230|249,\s*182,\s*25|62,\s*125,\s*94|210,\s*51,\s*92)\s*\)$/] } },
    transformTags: { ol: 'ul', h1: 'p', h2: 'p', h3: 'p', h4: 'p' },
  }).trim();
}
// Les champs que la coordination met en page.
const CHAMPS_RICHES = ['finalites_generales', 'finalites', 'programme', 'criteres', 'degre_maitrise', 'note_ue'];
const estHtml = t => /<\/?(p|br|b|strong|i|em|u|ul|ol|li|span|h[1-4]|table|mark|sub|sup|a)\b/i.test(String(t || ''));
/** Un texte riche (HTML filtré) tel quel ; un texte simple, en paragraphes. */
const riche = t => (estHtml(t) ? `<div class="riche">${assainirDUE(t)}</div>` : para(t));

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
  // UN BLOC PAR COURS (Charles, 8 octobre 2026) : l'introduction, puis chaque cours
  // sous son intitulé, mis en page comme à l'écran.
  const B = c.programme_blocs;
  const plein = h => String(h || '').replace(/<[^>]+>/g, '').trim();
  if (B && typeof B === 'object' && Object.values(B).some(plein)) {
    return (plein(B._intro) ? riche(B._intro) : '')
      + (auto.cours || []).filter(x => plein(B[x.cours_code]))
        .map(x => `<div class="sous-t">${esc(`${x.cours_code} — ${x.cours_nom || ''}`)}</div>${riche(B[x.cours_code])}`).join('');
  }
  const pts = (Array.isArray(c.points) ? c.points : []).filter(p => String(p.texte || '').trim());
  if (!pts.length) return riche(texte);
  // RANGÉ PAR ACTIVITÉ, comme à l'écran : l'introduction, puis chaque cours avec ses
  // chapeaux (contexte, en italique) et ses points ; un point vu aussi ailleurs le dit.
  const premier = p => (p.cours || [])[0] || '';
  const groupes = [...(auto.cours || []).map(x => ({ cle: x.cours_code, titre: `${x.cours_code} — ${x.cours_nom || ''}` })), { cle: '', titre: '' }];
  const intro = pts.filter(p => p.type === 'intro').map(p => `<p class="intro-prog">${esc(p.texte)}</p>`).join('');
  const corps = groupes.map(g => {
    const items = pts.filter(p => p.type !== 'intro' && (g.cle ? premier(p) === g.cle : !(auto.cours || []).some(x => x.cours_code === premier(p))));
    if (!items.length) return '';
    let html = g.titre ? `<div class="sous-t">${esc(g.titre)}</div>` : '';
    let liste = [];
    const vider = () => { if (liste.length) { html += `<ul class="serre">${liste.join('')}</ul>`; liste = []; } };
    for (const p of items) {
      if (p.type === 'chapeau') { vider(); html += `<p class="chapeau">${esc(p.texte)}</p>`; }
      else liste.push(`<li>${esc(p.texte)}${(p.cours || []).slice(1).map(k => ` <span class="puce">${esc(k)}</span>`).join('')}</li>`);
    }
    vider();
    return html;
  }).join('');
  return `${texte && estHtml(texte) ? riche(texte) : ''}${intro}${corps}`;
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
    ['Section', u.section],
    ["Bloc d'études", c.bloc ? `Bloc ${c.bloc}` : null],
    // Le niveau ET le quadrimestre (Charles, 8 octobre 2026 : « BE1 · Q1 »).
    ['Situation dans la formation', [u.niv, u.quadrimestre].filter(Boolean).join(' · ') || null],
    ['Unité prérequise', u.prerequise || 'Aucune'],
    ['Tronc commun', u.tc ? 'Oui' : null],
    ['Volume horaire / an', u.periodes ? `${u.periodes} périodes — soit ${u.heures} h` : null],
    ['Crédits ECTS', u.ects],
    ["Langue d'enseignement", c.langue_ens || 'Français'],
    ["Langue d'évaluation", c.langue_eval || 'Français'],
    ['Niveau du cadre européen des certifications', c.niveau_cec || cecDe(u.section)],
    ["Responsable de l'unité", nomResp],
    // Rien à dire quand il n'y en a pas (Charles, 8 octobre 2026).
    ['Co-diplomation HELB', c.codiplomation ? 'Oui' : null],
  ].filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `<div class="id-c"><div class="id-l">${esc(k)}</div><div class="id-v">${esc(v)}</div></div>`).join('');

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

  /* DES CASES COCHÉES, PAS UN TABLEAU (Charles, 8 octobre 2026) : par session, une
     ligne par activité, ses six modes d'évaluation en cases ☑ / ☐. */
  const evaluation = ['s1', 's2'].map(sess => `
    <div class="sous-t">${sess === 's1' ? 'Première session' : 'Seconde session'}</div>
    ${auto.cours.map(x => {
    const e = c.evaluation?.[x.cours_code]?.[sess] || {};
    return `<div class="eval-l"><span class="eval-c"><b>${esc(x.cours_code)}</b> — ${esc(x.cours_nom)}</span>${EPREUVES
      .map(([k, l]) => `<span class="case${e[k] ? ' on' : ''}">${e[k] ? '☑' : '☐'} ${esc(l)}</span>`).join('')}</div>`;
  }).join('')}`).join('');

  const corps = `
  <div class="attestation">
    <div class="tete-due">
      <div class="reperes">${[u.section, [u.niv, u.quadrimestre].filter(Boolean).join(' · '), u.ects ? `${u.ects} ECTS` : null,
        u.periodes ? `${u.periodes} périodes` : null].filter(Boolean).map(esc).join('<span class="pt">·</span>')}
        <span class="etat ${statut === 'validee' ? 'ok' : 'brouillon'}">${statut === 'validee'
    ? `Validée par la direction le ${esc(valide_le || '')}` : 'En préparation — non validée'}</span></div>
    </div>

    <div class="ident">${ident}</div>

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

    ${bloc("Modalités d'évaluation", `${evaluation}
      <div class="fin">${c.note_ue ? riche(c.note_ue) : esc(getParam('due_note_evaluation', NOTE_UE_DEFAUT))}</div>`)}

    ${bloc("Critères d'évaluation", grillesCriteres(auto, c, evaluationUnique(ueNum, annee)) || '<p class="vide">à compléter</p>')}

    ${bloc('Degré de maîtrise', riche(rediges.degre_maitrise))}
  </div>`;

  // LA FEUILLE DANS LE <head>, PAS APRÈS </html> : ajoutée à la fin, elle
  // cassait le saut de page (catalogue des erreurs, CLAUDE.md). Elle vient
  // après celle de l'enveloppe, donc ses règles l'emportent toujours.
  /* L'ENVELOPPE COMMUNE (Charles, 8 octobre 2026 : « dans le style des documents
     envoyés aux étudiants, et bas de page ») : en-tête de la Fédération, identité de
     l'établissement, cadre de titre, pied sur chaque feuille — lib/document.js. */
  return envelopperDocument({
    html: corps, titre: `DUE ${ueNum} — ${annee}`,
    styles: STYLE_DUE.replace(/<\/?style>/g, ''),
    entete: { titre: "Description d'unité d'enseignement", sous: `UE ${u.ue_num} — ${u.ue_nom}`, ligne: `${u.section || ''} · ${annee}` },
  });
}

// Le gabarit commun porte l'en-tête, les filets dorés et le pied ; la DUE y
// ajoute ses propres blocs. La feuille est concaténée après coup pour que ces
// règles l'emportent sur celles de l'enveloppe.
const STYLE_DUE = `<style>
  /* UNE MISE EN PAGE D'AUJOURD'HUI (Charles, 8 octobre 2026 : « un peu datée ») : la
     hiérarchie par la graisse et par l'air — titres marine soulignés d'un filet or,
     plus de bandeaux pleins ni de cadres autour des blocs, tableaux légers. */
  .tete-due { margin: 0 0 4mm; }
  .tete-due .nature { font-size: 7.5pt; letter-spacing: .08em; text-transform: uppercase; color: #7a8699; }
  .titre-ue { font-size: 16pt; font-weight: 700; color:#16406A; margin: 1.5mm 0 1.5mm; line-height: 1.2; }
  .titre-ue .num { color: #19537E; margin-right: 1.5mm; }
  .reperes { font-size: 10pt; color: #334155; display: flex; flex-wrap: wrap; align-items: center; gap: 1.5mm; }
  .reperes .pt { color: #C9A84C; }
  .etat { margin-left: auto; display:inline-block; padding:0.6mm 2.5mm; border-radius:3mm; font-size:7.5pt; font-weight: 600; }
  .etat.ok { background:#3E7D5E; color:#fff; }
  .etat.brouillon { background:#B45309; color:#fff; }
  .ident { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2.5mm 6mm; margin: 0 0 5mm; }
  .id-l { font-size: 8pt; text-transform: uppercase; letter-spacing: .05em; color: #7a8699; }
  .id-v { font-size: 10pt; color: #16406A; font-weight: 600; }
  .bloc { margin: 0 0 5mm; break-inside: avoid; }
  .bloc-t { color:#16406A; font-size:11pt; font-weight:700; padding: 0 0 1.2mm; margin-bottom: 2mm;
            border-bottom: 0.3mm solid #C9A84C; }
  .bloc-c { font-size:10pt; line-height: 1.45; color: #1f2937; }
  .bloc-c p { margin: 0 0 1.5mm; }
  .attestation table.doc { border-collapse: collapse; width: 100%; font-size: 10pt; }
  .attestation table.doc td { font-size: 10pt; }
  .attestation table.doc th { background: #EEF2F7; color: #16406A; font-weight: 600; text-transform: none; font-size: 10pt;
            border: 0; border-bottom: 0.3mm solid #C9D3E1; padding: 1.5mm 2mm; text-align: left; }
  .attestation table.doc td { border: 0; border-bottom: 0.2mm solid #E4E8EF; padding: 1.5mm 2mm; background: #fff; }
  .serre { margin:0; padding-left:5mm; }
  .chapeau { font-style: italic; margin: 1.5mm 0 0.8mm; }
  .serre li { margin-bottom:0.8mm; }
  .puce { display:inline-block; border:0.25mm solid #C9A227; border-radius:2mm;
          padding:0.5mm 2mm; margin:0.5mm 0.5mm 0 0; font-size:8pt; }
  .vide { color:#9aa3b2; font-style:italic; }
  .fin { font-size:10pt; color:#4b5563; margin-top:1.5mm; }
  tr.sess td { background:#f1f4f9; font-weight:700; font-size:10pt; }
  .crit-t { font-weight:700; color:#1B2B4B; font-size:10pt; margin: 2.5mm 0 1mm; }
  table.doc.crit td, table.doc.crit th { vertical-align: top; font-size: 10pt; }
  table.doc.crit tr { break-inside: avoid; }
  table.doc.crit th .def { font-weight: 400; font-style: italic; font-size: 7pt; color: #4b5563; margin-top: 0.5mm; }
  .riche p { margin: 0 0 1.5mm; } .riche ul, .riche ol { margin: 0 0 1.5mm; padding-left: 5mm; list-style: disc; }
  .riche blockquote { border: 0.25mm solid #C9D3E1; border-radius: 1.5mm; padding: 1.5mm 2.5mm; margin: 1.5mm 0; }
  .riche hr { border: 0; border-top: 0.3mm solid #C9A84C; margin: 2mm 0; }
  /* PAS DE TABLEAU DANS UN TABLEAU (Charles, 8 octobre 2026) : un bloc qui porte un
     tableau perd son propre cadre ; le tableau s'aligne sous le titre. */

  .riche table { border-collapse: collapse; width: 100%; } .riche td, .riche th { border: 0.25mm solid #d8dde6; padding: 1mm 1.5mm; }
  .eval-l { display: grid; grid-template-columns: 50mm repeat(6, auto); align-items: baseline; column-gap: 2.5mm; padding: 1mm 0; border-bottom: 0.2mm solid #eef1f5; break-inside: avoid; }
  .eval-c { font-size: 10pt; }
  .case { font-size: 7.5pt; color: #94a3b8; white-space: nowrap; }
  .case.on { color: #1B2B4B; font-weight: 700; }
  .intro-prog { font-style: italic; color: #4b5563; margin: 0 0 1mm; }
  .sous-t { font-weight: 700; color:#1B2B4B; font-size: 10pt; margin: 2.5mm 0 1mm; }
  .schema-due { margin: 2mm 0 0; } .schema-due svg { max-width: 90mm; height: auto; }
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
