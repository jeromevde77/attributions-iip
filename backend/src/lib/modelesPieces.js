// ─────────────────────────────────────────────────────────────────────────────
// LES MODÈLES DES PIÈCES SE CORRIGENT DANS LUCIE (Charles, 9 octobre 2026 :
// « comme tu as un modèle de tous les documents dans Gestion, est-ce qu'il
// serait possible de les modifier avec un petit éditeur — un peu de polices,
// de contenu, bouger les champs de données »).
//
// Une pièce se compose désormais de deux couches :
//   · LE TEXTE, modifiable : phrases, mise en forme, place des CHAMPS (le nom
//     de l'étudiant, l'unité, la date…), ordre des BLOCS ;
//   · LES BLOCS, verrouillés : ce que le calcul produit (tableaux de notes,
//     caractéristiques de l'unité, signature et son micro-texte, voies de
//     recours). On les déplace, on n'en change pas le contenu.
// L'en-tête, le pied et les marges restent ceux de l'enveloppe commune : la
// règle « une seule enveloppe » ne se négocie pas pièce par pièce.
//
// UNE MENTION OBLIGATOIRE NE SE PERD PAS PAR MÉGARDE. Chaque modèle déclare
// les blocs et les champs sans lesquels la pièce ne vaut plus rien ; le
// serveur refuse d'enregistrer un texte qui les a perdus, et les nomme.
//
// LES VERSIONS SONT EN AJOUT SEUL (`modele_piece_version`) : un an après, on
// sait quel texte portait la pièce remise à tel étudiant, et qui l'a écrit.
// « Revenir au modèle d'origine » écrit une version de plus, au contenu nul.
//
// L'APERÇU N'ÉCRIT RIEN. Le brouillon de l'éditeur se dépose en mémoire, dix
// minutes, sous un numéro ; l'écran rappelle la route qui produit la pièce en
// le citant (en-tête `X-Modele-Brouillon`), et la pièce se compose avec lui.
// Ce qu'on voit est donc ce qui sortira, par la même route.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import sanitizeHtml from 'sanitize-html';
import db from '../db/index.js';
import { requeteCourante } from './contexteRequete.js';

/* Les modèles livrés. `{{champ}}` dans le texte ; `<div data-bloc="…"></div>`
 * pour un bloc. Ce sont les textes des pièces telles qu'elles sortaient avant
 * l'éditeur, mot pour mot. */
const B = k => `<div data-bloc="${k}"></div>`;

export const MODELES = {
  attestation_reussite: {
    libelle: "Attestation de réussite d'unité (annexes 10 à 13, 17, 18)",
    galerie: 'attestation_reussite',
    champs: {
      nom_prenom: "Nom et prénom de l'étudiant", ne_e: 'Né / Née', lieu_naissance: 'Lieu de naissance',
      date_naissance: 'Date de naissance', il_elle: 'il / elle', ue_num: "N° de l'unité", ue_nom: "Intitulé de l'unité",
      section: 'Section', annee: 'Année académique', articles: 'Articles du décret (selon le niveau)',
      organe: 'le Conseil des études / le Jury', organe_maj: 'Le Conseil des études / Le Jury',
      ei_mention: '« épreuve intégrée » (si EI)', periodes: 'Total des périodes',
      comportant: 'Phrase des périodes (selon unité, stage, EI)', pourcentage: 'Pourcentage obtenu',
      date_doc: 'Date de la pièce', ville: 'Ville', directeur: 'Directeur',
    },
    blocs: {
      caracteristiques: "Caractéristiques de l'unité (section, code, ECTS, périodes)",
      identite: "Identité de l'étudiant", activites: 'Répartition par activité (unité ordinaire)',
      acquis: "Liste des acquis d'apprentissage", fin_etudes: '« Attendu qu’il termine… » (stage, EI)',
      resultat: 'Cadre du résultat (pourcentage, session)', signature: 'Lieu, date, sceau et signature',
    },
    obligatoires: { blocs: ['caracteristiques', 'identite', 'acquis', 'resultat', 'signature'],
                    champs: ['articles'], textes: ['16 avril 1991'] },
    defaut: `${B('caracteristiques')}
<p>Conformément aux articles {{articles}} alinéa 1<sup>er</sup> du décret du 16 avril 1991 organisant l'enseignement de promotion sociale, {{organe}}, chargé de procéder à l'évaluation de l'unité d'enseignement susvisée, atteste que</p>
${B('identite')}
<p>a suivi avec fruit, dans l'établissement précité, l'unité d'enseignement{{ei_mention}} susvisée, {{comportant}}</p>
${B('activites')}
<p>Attendu qu'{{il_elle}} maîtrise tous les acquis d'apprentissage de l'unité d'enseignement, soit :</p>
${B('acquis')}
${B('fin_etudes')}
${B('resultat')}
${B('signature')}`,
  },

  motivation_ajournement: {
    libelle: "Motivation d'ajournement (annexe 8)",
    galerie: 'motivation_decision',
    champs: {
      nom_prenom: "Nom et prénom de l'étudiant", ne_e: 'Né / Née', lieu_naissance: 'Lieu de naissance',
      date_naissance: 'Date de naissance', organe: 'Conseil des études / Jury', ue_num: "N° de l'unité",
      ue_nom: "Intitulé de l'unité", annee: 'Année académique', date_seance: 'Date de la séance', ville: 'Ville',
    },
    blocs: {
      caracteristiques: "Caractéristiques de l'unité", identite: "Identité de l'étudiant",
      acquis_en_echec: 'Tableau des acquis non maîtrisés et justifications',
      origine: 'Mention de reprise d’archives (si reprise)',
      a_representer: 'Ce qui est à représenter et quand (seconde session)',
      recours: 'Voies de recours', visite: 'Consultation de la copie', signature: 'Lieu, date, sceau et signatures',
    },
    obligatoires: { blocs: ['caracteristiques', 'identite', 'acquis_en_echec', 'origine', 'a_representer', 'recours', 'visite', 'signature'],
                    champs: [], textes: [] },
    defaut: `${B('caracteristiques')}
<p>Nous, soussignés, Président-e et Membres du {{organe}} constitué par le Pouvoir organisateur de l'établissement précité en vue de la délivrance de l'attestation de réussite de l'unité d'enseignement susvisée, attestons que</p>
${B('identite')}
<p>ne maîtrise pas les acquis d'apprentissage suivants :</p>
${B('acquis_en_echec')}
${B('origine')}
${B('a_representer')}
${B('recours')}
${B('visite')}
${B('signature')}`,
  },

  motivation_refus: {
    libelle: 'Motivation de refus (annexe 9)',
    galerie: 'motivation_decision',
    champs: null,                 // ceux de l'annexe 8 (ci-dessous)
    blocs: {
      caracteristiques: "Caractéristiques de l'unité", identite: "Identité de l'étudiant",
      acquis_en_echec: 'Tableau des acquis non maîtrisés et motivations',
      origine: 'Mention de reprise d’archives (si reprise)',
      recours: 'Base légale et voies de recours', visite: 'Consultation de la copie',
      signature: 'Lieu, date, sceau et signatures',
    },
    obligatoires: { blocs: ['caracteristiques', 'identite', 'acquis_en_echec', 'origine', 'recours', 'visite', 'signature'],
                    champs: [], textes: [] },
    defaut: `${B('caracteristiques')}
<p>Nous, soussignés, Président-e et Membres du {{organe}} constitué par le Pouvoir organisateur de l'établissement précité en vue de la délivrance de l'attestation de réussite de l'unité d'enseignement susvisée, attestons que</p>
${B('identite')}
<p>ne maîtrise pas les acquis d'apprentissage suivants :</p>
${B('acquis_en_echec')}
${B('origine')}
${B('recours')}
${B('visite')}
${B('signature')}`,
  },

  notification_va: {
    libelle: 'Notification des décisions de valorisation',
    galerie: 'va_notification',
    champs: {
      nom_prenom: "Nom et prénom de l'étudiant", civilite: 'Madame / Madame, Monsieur', annee: 'Année académique',
      seances: '« en sa séance du … » (dates des décisions)', date_doc: 'Date de la pièce', ville: 'Ville',
      directeur: 'Directeur',
    },
    blocs: {
      identite: "Identité de l'étudiant (nom, matricule, naissance)",
      tableau: 'Tableau des décisions et de leurs motivations',
      en_cours: 'Demandes encore à l’examen (s’il y en a)',
      recours: 'Voies de recours', signature: 'Lieu, date, sceau et signature',
    },
    obligatoires: { blocs: ['identite', 'tableau', 'en_cours', 'recours', 'signature'], champs: [], textes: [] },
    defaut: `${B('identite')}
<p>{{civilite}},</p>
<p>Par la présente, nous vous notifions les décisions prises par le Conseil des études {{seances}} sur vos demandes de valorisation des acquis pour l'année {{annee}}.</p>
${B('tableau')}
${B('en_cours')}
<p>Une unité dont vous êtes dispensé(e) n'est plus à suivre ; une dispense partielle vous dispense des seules activités citées, et l'unité reste à présenter. Votre programme annuel (PAE) est adapté en conséquence.</p>
${B('recours')}
${B('signature')}`,
  },
};
MODELES.motivation_refus.champs = MODELES.motivation_ajournement.champs;

export const POLICES = ['Arial', 'Helvetica', 'Calibri', 'Georgia', 'Times New Roman', 'Garamond'];
export const TAILLES = ['8pt', '8.5pt', '9pt', '9.5pt', '10pt', '10.5pt', '11pt'];

export function migrerModelesPieces(dbx = db) {
  dbx.exec(`CREATE TABLE IF NOT EXISTS modele_piece_version (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cle TEXT NOT NULL,
    version INTEGER NOT NULL,
    contenu TEXT,                 -- NULL : le modèle d'origine
    police TEXT, taille TEXT,
    commentaire TEXT,
    cree_par TEXT, cree_par_id INTEGER,
    cree_le TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    UNIQUE (cle, version))`);
}

/* LE HTML SE FILTRE À L'ÉCRITURE — liste fermée, comme le corpus : rien qui
 * s'exécute, rien qui positionne. S'y ajoutent les deux marques du modèle
 * (data-bloc, data-champ) et la police et la taille d'un passage. */
const PERMIS = {
  allowedTags: ['p', 'br', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'span', 'div',
                'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
  allowedAttributes: {
    div: ['data-bloc'], span: ['data-champ', 'style'],
    p: ['style'], h2: ['style'], h3: ['style'], h4: ['style'], td: ['colspan', 'rowspan', 'style'], th: ['colspan', 'rowspan', 'style'],
  },
  allowedStyles: { '*': {
    'text-align': [/^(left|right|center|justify)$/],
    color: [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i],
    'background-color': [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i],
    'font-size': [/^\d+(\.\d+)?(pt|px|em|%)$/],
    'font-family': [/^[\w\s,'"-]+$/],
  } },
};
export const assainirModele = html => sanitizeHtml(String(html || ''), PERMIS).trim();

const RE_BLOC = /<div[^>]*\bdata-bloc="([a-z0-9_]+)"[^>]*>[\s\S]*?<\/div>/g;
const RE_CHAMP = /<span[^>]*\bdata-champ="([a-z0-9_]+)"[^>]*>[\s\S]*?<\/span>/g;
const RE_ACCOLADES = /\{\{\s*([a-z0-9_]+)\s*\}\}/g;

/** Ce qui manque à un texte pour faire une pièce valable. */
export function verifierModele(cle, contenu) {
  const m = MODELES[cle];
  if (!m) return ['modèle inconnu'];
  const html = String(contenu || '');
  const blocs = new Set([...html.matchAll(RE_BLOC)].map(x => x[1]));
  const champs = new Set([...html.matchAll(RE_CHAMP), ...html.matchAll(RE_ACCOLADES)].map(x => x[1]));
  const texte = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
  const manques = [];
  for (const b of m.obligatoires.blocs) if (!blocs.has(b)) manques.push(`le bloc « ${m.blocs[b]} »`);
  for (const c of m.obligatoires.champs) if (!champs.has(c)) manques.push(`le champ « ${m.champs[c]} »`);
  for (const t of m.obligatoires.textes) if (!texte.includes(t)) manques.push(`la mention « ${t} »`);
  const doubles = [...html.matchAll(RE_BLOC)].map(x => x[1]).filter((b, i, a) => a.indexOf(b) !== i);
  for (const b of new Set(doubles)) manques.push(`le bloc « ${m.blocs[b] || b} » figure deux fois`);
  for (const b of blocs) if (!m.blocs[b]) manques.push(`un bloc inconnu (${b})`);
  for (const c of champs) if (!m.champs[c]) manques.push(`un champ inconnu (${c})`);
  return manques;
}

/** La version en vigueur : { version, contenu (jamais nul), police, taille, d_origine }. */
export function modeleEnVigueur(cle) {
  const m = MODELES[cle];
  let v = null;
  try {
    v = db.prepare('SELECT * FROM modele_piece_version WHERE cle = ? ORDER BY version DESC LIMIT 1').get(cle);
  } catch { /* table absente : le modèle d'origine */ }
  return {
    version: v?.version || 0,
    contenu: v?.contenu || m.defaut,
    police: v?.police || null,
    taille: v?.taille || null,
    d_origine: !v?.contenu,
    cree_par: v?.cree_par || null, cree_le: v?.cree_le || null,
  };
}

// ── Les brouillons de l'aperçu, en mémoire ────────────────────────────────
const BROUILLONS = new Map();
export function deposerBrouillon(cle, { contenu, police, taille }, userId) {
  const id = crypto.randomBytes(9).toString('hex');
  const maintenant = Date.now();
  for (const [k, b] of BROUILLONS) if (maintenant - b.le > 10 * 60_000) BROUILLONS.delete(k);
  BROUILLONS.set(id, { cle, contenu: assainirModele(contenu), police, taille, userId, le: maintenant });
  return id;
}
function brouillonDeLaRequete(cle) {
  const req = requeteCourante();
  const id = req?.headers?.['x-modele-brouillon'];
  if (!id) return null;
  const b = BROUILLONS.get(String(id));
  // Le brouillon n'est lu que par celui qui l'a déposé, et pour SA pièce.
  if (!b || b.cle !== cle || (req.user && b.userId !== req.user.id)) return null;
  return b;
}

/* Les règles du texte modifiable. Elles vivent dans la feuille de l'enveloppe
 * (routes/attestations.js) : un <style> posé au milieu du corps casse le saut
 * de page — c'est au catalogue des erreurs. */
export const STYLE_MODELE = `
.modele-piece > p:not([class]), .modele-piece > ul:not([class]), .modele-piece > ol:not([class]),
.modele-piece > table:not([class]), .modele-piece > h2:not([class]), .modele-piece > h3:not([class]),
.modele-piece > h4:not([class]) { font-family: var(--mp-police, inherit); font-size: var(--mp-taille, 9pt); }
.modele-piece > p:not([class]) { text-align: justify; margin: 2.5mm 0; }
.piece .modele-piece > p:not([class]) { margin: 2mm 0; }
.modele-piece > h2:not([class]), .modele-piece > h3:not([class]) { font-weight: 700; color: #1B2B4B; margin: 3mm 0 1.5mm; }
.modele-piece > ul:not([class]), .modele-piece > ol:not([class]) { margin: 1.5mm 0 2.5mm 8mm; }
.modele-piece > table:not([class]) { width: 100%; border-collapse: collapse; margin: 2mm 0; }
.modele-piece > table:not([class]) td, .modele-piece > table:not([class]) th { border: 0.3mm solid #D8DCE4; padding: 1.2mm 2mm; vertical-align: top; }
`;

/**
 * COMPOSE LE CORPS D'UNE PIÈCE à partir de son modèle.
 *   champs : { cle: html déjà échappé par l'appelant }
 *   blocs  : { cle: html }  — un bloc absent ou vide ne laisse rien.
 * Un champ inconnu du calcul reste visible, entre crochets : une pièce qui
 * dit « [date à compléter] » se corrige ; un blanc passe inaperçu.
 */
export function composerModele(cle, { champs = {}, blocs = {} }) {
  const m = MODELES[cle];
  const b = brouillonDeLaRequete(cle);
  const v = b ? { contenu: b.contenu || m.defaut, police: b.police, taille: b.taille } : modeleEnVigueur(cle);
  const valeur = k => {
    const x = champs[k];
    return x === undefined || x === null ? `<span style="color:#b45309">[${m.champs[k] || k} à compléter]</span>` : String(x);
  };
  // Les blocs se posent EN DERNIER : un texte calculé (une motivation, un
  // intitulé d'acquis) qui contiendrait des accolades ne doit pas être lu
  // comme un champ.
  const html = String(v.contenu)
    .replace(RE_BLOC, (_, k) => `\u0000${k}\u0000`)
    .replace(RE_CHAMP, (_, k) => valeur(k))
    .replace(RE_ACCOLADES, (_, k) => valeur(k))
    .replace(/\u0000([a-z0-9_]+)\u0000/g, (_, k) => blocs[k] || '');
  // La police et la taille ne valent que pour le TEXTE du modèle : les blocs
  // gardent la leur, qui est celle de la charte.
  const style = [v.police && POLICES.includes(v.police) ? `--mp-police:'${v.police}', Arial, sans-serif` : '',
                 v.taille && TAILLES.includes(v.taille) ? `--mp-taille:${v.taille}` : ''].filter(Boolean).join(';');
  return `<div class="modele-piece" style="${style}">${html}</div>`;
}

/** Le texte tel que l'éditeur le reçoit : les champs en étiquettes. */
export function versEditeur(cle, contenu) {
  const m = MODELES[cle];
  return String(contenu || '').replace(RE_ACCOLADES, (_, k) =>
    `<span data-champ="${k}">${(m.champs[k] || k).replace(/[<>&"]/g, '')}</span>`);
}

/** Les modèles d'une entrée de la galerie. */
export function modelesDeLaGalerie(idGalerie) {
  return Object.entries(MODELES).filter(([, m]) => m.galerie === idGalerie).map(([cle]) => cle);
}
