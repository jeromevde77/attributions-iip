// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Attestations de réussite d'unité d'enseignement
//
// Une attestation PAR UNITÉ RÉUSSIE, conformément aux articles 52, 53 et 58
// alinéa 1er du décret du 16 avril 1991. Ce n'est pas le diplôme ni le
// certificat de section : c'est la pièce qui atteste qu'un étudiant a suivi
// avec fruit une unité déterminée.
//
// Le modèle impose des mentions dont l'absence rendrait l'attestation
// irrégulière : le numéro de code approuvé par le Gouvernement, le nombre
// d'ECTS, le total des périodes et leur répartition par activité, la liste des
// acquis d'apprentissage, et le pourcentage obtenu. Ce module refuse de
// produire une pièce incomplète en silence : il signale ce qui manque.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { LOGO_IIP_JPEG } from '../services/assets/logo_iip_jpeg.js';
import { piedBalisage, piedStyles, reglesDePage,
  BANDE_PIED_MM, MARGE_SOUS_PIED_MM } from '../lib/document.js';
import db from '../db/index.js';
import { authRequired, getUserSections } from '../middleware/auth.js';
import { capacitePdf, rendrePdf } from '../services/pdf.js';
import { SIGNATURE_SOHET, SCEAU_IIP } from '../services/assets/signature_sohet.js';
import { piedDocument } from './parametres.js';
import { identiteEtablissement } from './config.js';

const r = Router();

export function migrerAttestations(dbx) {
  try {
    // Le lieu de naissance figure sur l'attestation et manquait à la fiche.
    const cols = dbx.prepare('PRAGMA table_info(etudiant)').all().map(c => c.name);
    if (!cols.includes('lieu_naissance')) {
      dbx.exec('ALTER TABLE etudiant ADD COLUMN lieu_naissance TEXT');
      console.log('[migration] etudiant.lieu_naissance ajoutée');
    }
    // Le domaine d'études, propre à l'UE, apparaît sous son intitulé.
    const colsUe = dbx.prepare('PRAGMA table_info(ue)').all().map(c => c.name);
    if (!colsUe.includes('domaine')) {
      dbx.exec('ALTER TABLE ue ADD COLUMN domaine TEXT');
      console.log('[migration] ue.domaine ajoutée');
    }
    if (!colsUe.includes('type_enseignement')) {
      dbx.exec("ALTER TABLE ue ADD COLUMN type_enseignement TEXT");
    }

    // Le domaine et le type d'enseignement relèvent d'abord de la SECTION :
    // « Sciences de la santé publique » vaut pour toutes ses unités. Les porter
    // uniquement sur l'UE obligerait à les ressaisir dix-neuf fois.
    const colsSection = dbx.prepare('PRAGMA table_info(section)').all().map(c => c.name);
    if (!colsSection.includes('domaine')) {
      dbx.exec('ALTER TABLE section ADD COLUMN domaine TEXT');
      console.log('[migration] section.domaine ajoutée');
    }
    if (!colsSection.includes('type_enseignement')) {
      dbx.exec('ALTER TABLE section ADD COLUMN type_enseignement TEXT');
    }
  } catch (e) { console.error('[migration] attestations :', e.message); }
}

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
                'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/**
 * UNE DATE EN TOUTES LETTRES — quelle que soit la forme où elle est rangée.
 *
 * L'attestation affichait « le NaN 13 août 20 ». Le formatage supposait une
 * date ISO et découpait sur les tirets ; or certains dossiers portent la date
 * DÉJÀ écrite en français — « 13 août 2004 », reprise telle quelle d'un
 * classeur. Le découpage rendait alors un jour introuvable (NaN), un mois vide,
 * et l'année tronquée à dix caractères : la date tenait sur le document, fausse
 * et illisible, sur une pièce que l'étudiant garde à vie.
 *
 * On accepte donc les quatre formes qui existent dans les dossiers — ISO,
 * jour/mois/année, jour-mois-année, et le texte français déjà formé — et l'on
 * n'imprime JAMAIS « NaN » : une date qu'on ne sait pas lire s'affiche en
 * pointillés, ce qui se voit et se corrige, plutôt qu'en charabia qui se signe.
 */
export const frDate = d => {
  if (d == null || String(d).trim() === '') return '………';
  const t = String(d).trim();

  const enLettres = (j, m, a) => `${Number(j)}${Number(j) === 1 ? 'er' : ''} `
    + `${MOIS_FR[Number(m) - 1]} ${a}`;

  // 2004-08-13, éventuellement suivi d'une heure.
  let x = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (x && Number(x[2]) >= 1 && Number(x[2]) <= 12) return enLettres(x[3], x[2], x[1]);

  // 13/08/2004 ou 13-08-2004 — l'ordre belge.
  x = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (x && Number(x[2]) >= 1 && Number(x[2]) <= 12) return enLettres(x[1], x[2], x[3]);

  // « 13 août 2004 » : déjà en toutes lettres, on la laisse telle quelle.
  x = t.match(/^(\d{1,2})(?:er)?\s+([^\s]+)\s+(\d{4})$/i);
  if (x && MOIS_FR.some(m => m.localeCompare(x[2], 'fr', { sensitivity: 'base' }) === 0)) {
    return t;
  }

  // Illisible : des pointillés, jamais « NaN ».
  return '………';
};

/** Les UE réussies par un étudiant pour une année, avec ce qu'exige le modèle. */
/**
 * @param {object} [surcharge] points arrêtés pour UNE session, par ue_num.
 *   Le dossier ne retient qu'un résultat par unité et par année : celui de la
 *   session la plus avancée. Une attestation de première session y puiserait
 *   donc les points de la seconde, et inversement une réussite prononcée en
 *   juin reparaîtrait à l'identique sur les pièces de septembre. La grille de
 *   délibération, elle, calcule par session — d'où l'écart constaté.
 */
export function unitesReussies(etudId, annee, surcharge = null) {
  const insc = db.prepare(`
    SELECT i.ue_num, i.points, i.annee_scolaire
    FROM etudiant_inscription i
    WHERE i.etudiant_id = ? AND i.annee_scolaire = ? AND i.resultat = 'reussi'
    ORDER BY i.ue_num
  `).all(etudId, annee).map(i => (surcharge && surcharge[i.ue_num] !== undefined
    ? { ...i, points: surcharge[i.ue_num] } : i));

  return insc.map(i => {
    // Le référentiel de l'année de l'inscription, à défaut le plus récent.
    const ue = db.prepare(`
      SELECT * FROM ue WHERE ue_num = ?
      ORDER BY (annee_scolaire = ?) DESC, annee_scolaire DESC LIMIT 1
    `).get(i.ue_num, i.annee_scolaire) || {};

    // Domaine et type d'enseignement : ceux de l'UE s'ils sont renseignés,
    // sinon ceux de sa section.
    const sec = ue.section
      ? db.prepare('SELECT domaine, type_enseignement FROM section WHERE code = ?').get(ue.section)
      : null;

    const cours = db.prepare(`
      SELECT cours_nom, cours_per FROM cours
      WHERE ue_num = ? AND cours_code IS NOT NULL
      ORDER BY (annee_scolaire = ?) DESC, annee_scolaire DESC, cours_code
    `).all(i.ue_num, i.annee_scolaire);

    // Un même cours peut figurer sous plusieurs millésimes : on n'en garde qu'un.
    const vus = new Set();
    const activites = cours.filter(c => !vus.has(c.cours_nom) && vus.add(c.cours_nom));

    // Les acquis d'apprentissage, que le modèle exige d'énumérer.
    let acquis = [];
    try {
      acquis = db.prepare(
        'SELECT aa_code, aa_num, description FROM aa WHERE ue_num = ? ORDER BY aa_num, aa_code'
      ).all(i.ue_num);
    } catch { /* table absente ou colonnes différentes : on le signalera */ }

    // Les périodes de COURS, telles que le dossier pédagogique les liste.
    const periodesCours = ue.ue_per_etudiants
      || activites.reduce((s, c) => s + (Number(c.cours_per) || 0), 0);
    // L'AUTONOMIE s'y ajoute : le dossier pédagogique la donne à part, et la
    // somme des deux fait le total de l'unité pour l'étudiant.
    const autonomie = Number(ue.ue_aut) || 0;
    const totalPeriodes = (Number(periodesCours) || 0) + autonomie;

    /**
     * SECONDAIRE ET SUPÉRIEUR N'ONT PAS LE MÊME MODÈLE.
     *
     * L'attestation visait « les articles 52, 53 et 58 » et affichait un nombre
     * d'ECTS : ce sont les mentions du SUPÉRIEUR. Les modèles du secondaire —
     * annexes 10, 12 et 17 — visent les articles 31, 32 et 37, ne portent aucun
     * ECTS, et annoncent le classement (inférieur ou supérieur, de
     * qualification ou de transition) là où le supérieur annonce le type court
     * ou long. Une section secondaire recevait donc une attestation fondée sur
     * les mauvais articles du décret.
     */
    const niv = String(ue.ue_niv || '').toUpperCase();
    const superieur = /SUP|BES|BAC|ESTC|ESTL/.test(niv)
      ? true
      : /SEC|ESI|ESS/.test(niv) ? false
      : !!(ue.ects || sec?.domaine);   // à défaut, l'ECTS et le domaine trahissent le supérieur

    // Ce qui manque rendrait l'attestation irrégulière : on l'annonce.
    const manques = [];
    if (!ue.ue_code_fwb) manques.push("le numéro de code approuvé par le Gouvernement");
    if (superieur && !ue.ects) manques.push("le nombre d'ECTS");
    if (superieur && !(ue.domaine || sec?.domaine)) manques.push("le domaine d'études");
    if (!periodesCours) manques.push("le total des périodes");
    if (!activites.length) manques.push("la répartition par activité d'enseignement");
    if (i.points == null) manques.push("le pourcentage obtenu");

    return {
      ue_num: i.ue_num,
      ue_nom: ue.ue_nom || `UE ${i.ue_num}`,
      code_fwb: ue.ue_code_fwb || null,
      superieur,
      ects: superieur ? (ue.ects || null) : null,
      domaine: superieur ? (ue.domaine || sec?.domaine || null) : null,
      type_enseignement: ue.type_enseignement || sec?.type_enseignement
        || (superieur ? 'Enseignement supérieur de type court'
                      : 'Enseignement secondaire de promotion sociale'),
      section: ue.section || null,
      periodes: totalPeriodes || null,
      periodes_cours: periodesCours || null,
      autonomie: autonomie || null,
      // Le modèle diffère selon la nature de l'unité : épreuve intégrée, stage
      // ou unité déterminante ordinaire.
      epreuve_integree: !!ue.is_epreuve_integree,
      est_stage: /\bstage\b|activit[ée]s? professionnelles?/i.test(ue.ue_nom || ''),
      activites,
      acquis,
      // Le modèle demande un pourcentage ; les résultats sont sur 20.
      //
      // UNE UNITÉ RÉUSSIE NE PORTE JAMAIS MOINS DE CINQUANTE POUR CENT sur
      // l'attestation. Deux situations y mènent, et toutes deux appellent la
      // même réponse : l'unité a été OCTROYÉE EN FAVEUR — le Conseil a décidé
      // qu'elle était acquise au seuil, et l'attestation doit dire dix, non la
      // moyenne qui l'avait fait échouer —, ou une reprise d'historique a
      // laissé une cote incohérente avec sa décision. Dans les deux cas,
      // délivrer une attestation de réussite portant 40 % serait un document
      // qui se contredit lui-même, et la circulaire Sanction des études ne
      // l'admet pas.
      pourcentage: i.points != null
        ? Math.max(50, Math.round(Number(i.points) * 5)) : null,
      points: i.points != null ? Math.max(10, Number(i.points)) : null,
      manques,
    };
  });
}

/**
 * Enveloppe commune des attestations : mêmes styles, que le document porte une
 * pièce ou cinquante. Elle sert aussi aux pièces séparées d'une archive, pour
 * que chacune reste imprimable seule.
 */
export function envelopper(corps, titre = 'Attestations de réussite') {
  // Les images sont posées UNE fois par document, en variables CSS. Répétées
  // par page, un lot de cinq cents attestations pèserait plus de 300 Mo.
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<title>${esc(titre)}</title>
<style>
:root{--sceau:url("${SCEAU_IIP}");--paraphe:url("${SIGNATURE_SOHET}")}
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  /* Une attestation tient sur UNE page : les corps sont resserrés et les
     interlignes calculés pour qu'une unité à six acquis et quatre activités
     ne déborde pas. */
  /* Le pied est ancré au bas de la ZONE DE CONTENU : une marge basse
     généreuse le repoussait à 22 mm du bord, d'où le blanc sous lui. La marge
     est réduite, et la place du pied réservée par un padding pour que le texte
     ne passe pas dessous. */
  ${reglesDePage({ haut: 12, cote: 15 })}

  body { font-family: 'Segoe UI', Arial, Helvetica, sans-serif; font-size: 9pt;
         color: #1B2B4B; margin: 0; line-height: 1.35; }

  /* Surtout PAS de break-inside: avoid ici : un procès-verbal de trois pages
     ne peut pas tenir d'un bloc, et le navigateur le tronquait au lieu de le
     paginer. Ce sont les petits blocs qui refusent d'être coupés. */
  .saut { break-after: page; page-break-after: always; height: 0; }

  /* Bandeau marine et filet doré, comme les autres documents de la maison. */
  /* Mention encadrée de deux filets dorés, plutôt qu'en réserve sur marine :
     c'est la présentation des attestations de réussite. */
  /* Filets dorés FINS : à 0,9 mm ils faisaient bandeau et écrasaient le titre.
     Un filet doit se voir sans peser. */
  .entete { text-align: center; padding: 3.5mm 6mm;
    border-top: 0.3mm solid #C9A84C; border-bottom: 0.3mm solid #C9A84C; }
  .entete .cf { font-size: 8pt; letter-spacing: .7pt; color: #1B2B4B; font-weight: 600; }
  .entete .epa { font-size: 10.5pt; font-weight: 700; letter-spacing: .5pt;
    color: #1B2B4B; margin-top: 1mm; }
  .entete .annee { font-size: 8.5pt; margin-top: 1.2mm; color: #475569; }

  .etab { display: flex; justify-content: space-between; gap: 6mm;
          padding: 3mm 0 2.5mm; border-bottom: 0.4pt solid #cbd5e1; font-size: 8pt;
          color: #475569; }
  .etab .nom { font-weight: 600; color: #1B2B4B; font-size: 9pt; }
  .etab .ident { text-align: right; white-space: nowrap; }

  h1 { font-size: 10.5pt; text-align: center; margin: 5mm 0 1mm; font-weight: 600;
       letter-spacing: .3pt; color: #1B2B4B; }
  h2 { font-size: 12pt; text-align: center; margin: 0 0 1.5mm; font-weight: 700;
       color: #1B2B4B; }
  .filet { width: 40mm; height: 0.3mm; background: #C9A84C; margin: 0 auto 4mm; }

  /* Caractéristiques de l'unité, en deux colonnes pour gagner de la hauteur. */
  .carac { display: grid; grid-template-columns: 1fr 1fr; gap: 1mm 6mm;
           background: #f8fafc; border: 0.4pt solid #e2e8f0; border-radius: 1.5mm;
           padding: 2.5mm 3.5mm; font-size: 8.5pt; margin-bottom: 4mm; }
  .carac .large { grid-column: 1 / -1; }
  .carac b { color: #1B2B4B; }

  .corps { text-align: justify; margin: 2.5mm 0; font-size: 9pt; }
  .indente { margin-left: 8mm; }

  /* La personne, en évidence sans excès. */
  .etudiant { background: #eff6ff; border-left: 0.6mm solid #1B2B4B;
              padding: 2.5mm 3.5mm; margin: 3mm 0; font-size: 9.5pt; }
  .etudiant .nom { font-weight: 700; font-size: 10.5pt; }
  .etudiant .naissance { font-size: 8.5pt; color: #475569; margin-top: 0.8mm; }

  .activites { margin: 1.5mm 0 3mm 8mm; font-size: 8.5pt; }
  /* L'autonomie se distingue des cours : elle vient du dossier pédagogique et
     s'ajoute à eux pour faire le total de l'unité. */
  .activites .autonomie { font-style: italic; color: #475569;
                          border-top: .3pt solid #cbd5e1; margin-top: .8mm;
                          padding-top: .8mm; }
  .carac .detail { font-size: 7.5pt; color: #64748b; font-weight: 400; }
  ul.acquis { margin: 1.5mm 0 3mm 8mm; padding-left: 4mm; font-size: 8.5pt; }
  ul.acquis li { margin: 0.5mm 0; }

  .resultat { text-align: center; background: #f8fafc; border: 0.4pt solid #e2e8f0;
              border-radius: 1.5mm; padding: 2.5mm; margin: 3mm 0; font-size: 9pt; }
  .resultat .pct { font-size: 13pt; font-weight: 700; color: #1B2B4B; }

  .manque { color: #b45309; font-style: italic; }

  /* Les enseignants de l'unité, sous la mention du Conseil. */
  .resultat .session2 { margin-top: 1.5mm; font-size: 8.5pt; font-style: italic;
                        color: #5b6577; font-weight: 400; }
  .profs { margin: 2.5mm 0 0; font-size: 8pt; }
  .profs .titre { font-size: 7.5pt; font-weight: 700; color: #64748b;
                  text-transform: uppercase; letter-spacing: .2pt; margin-bottom: 1mm; }
  .profs .liste { display: flex; flex-wrap: wrap; gap: 1mm 5mm; }
  .profs .p b { color: #1B2B4B; font-weight: 600; }
  .profs .p .c { color: #64748b; font-size: 7pt; }

  .cloture{display:grid;grid-template-columns:auto 1fr auto;
    grid-template-rows:auto auto;column-gap:14mm;align-items:end;
    margin-top:14mm;page-break-inside:avoid}
  .cloture .lieu{grid-column:2;grid-row:2;font-size:8.5pt;color:#334;
    text-align:center;padding-bottom:1mm}
  /* Les deux images occupent la même ligne et la même hauteur, calées sur
     leur bas : c'est ce qui les met au même niveau quelles que soient
     leurs proportions. */
  .cloture .sceau,
  .cloture .paraphe{grid-row:1;height:22mm;background-repeat:no-repeat;
    background-position:center bottom;background-size:contain}
  .cloture .sceau{grid-column:1;width:22mm;opacity:.92;
    background-image:var(--sceau)}
  .cloture .paraphe{grid-column:3;width:46mm;
    background-image:var(--paraphe)}
  /* LE FAC-SIMILÉ NE SUIT PAS LA FONCTION, IL SUIT LA PERSONNE. La signature
     enregistrée est celle du titulaire : l'apposer sous le nom d'un suppléant
     ou d'un désigné serait un faux. Ces pièces-là se signent à la main. */
  .cloture.sans-paraphe .paraphe{background-image:none;
    border-bottom:0.3mm solid #94a3b8;height:16mm;align-self:end}
  .cloture .legende{grid-column:3;grid-row:2;text-align:center;
    border-top:.4pt solid #94a3b8;padding-top:1mm;width:46mm}
  .cloture .qualite{font-size:8.5pt;color:#334}
  .cloture .nom{font-size:9.5pt;font-weight:700;color:#1B2B4B;letter-spacing:.3px}
  .signatures { width: 100%; border-collapse: collapse; margin-top: 5mm; font-size: 8pt; }
  table.signatures td { border: 0.4pt solid #94a3b8; padding: 1.5mm 2.5mm;
                        vertical-align: top; width: 33.33%; }
  table.signatures tr.hauteur td { height: 16mm; }
  table.signatures .role { color: #475569; font-size: 7.5pt; }
  /* ── LA DÉCISION, en cartouche coloré ──────────────────────────────────
     Une motivation d'ajournement ou de refus a la forme d'une attestation :
     sans marque, on les confond sur un bureau. Le cartouche porte la nature
     de la pièce, à la couleur de nos badges. */
  .decision { border-radius: 2.5mm; padding: 3mm 4mm; margin: 4mm 0 3mm;
              text-align: center; }
  .decision .quoi { font-size: 11pt; font-weight: 700; letter-spacing: .3pt; }
  .decision .sous { font-size: 8pt; margin-top: .8mm; }
  .decision.ajourne { background: #FFF7ED; border: .3mm solid #F59E0B; color: #7C2D12; }
  .decision.refus   { background: #FEF2F2; border: .3mm solid #DC2626; color: #7F1D1D; }

  /* UNE PIÈCE DE DÉLIBÉRATION TIENT SUR UNE PAGE. Motivation et procès-verbal
     portent plus de blocs qu'une attestation : avec la marge de signature de
     14 mm, le bloc de clôture passait à la page suivante et chaque pièce en
     laissait une presque vide derrière elle. */
  /* Le bloc de signature, resserré pour ces pièces : elles portent plus de
     blocs qu'une attestation, et il basculait à la page suivante — laissant
     derrière lui une page où ne figuraient qu'un sceau et un paraphe. */
  .piece .cloture { margin-top: 2mm; }
  .piece .cloture .sceau, .piece .cloture .paraphe { height: 14mm; }
  .piece .cloture .qualite { font-size: 7.5pt; }
  .piece .cloture .nom { font-size: 9pt; }
  .piece .cloture .lieu { font-size: 8pt; }
  .piece .cloture .paraphe, .piece .cloture .legende { width: 40mm; }
  .piece .cloture .sceau { width: 16mm; }
  .piece .info { margin: 1.5mm 0; padding: 2mm 3mm; }
  .piece table.doc { margin: 1.2mm 0 2mm; }
  .piece table.doc th, .piece table.doc td { padding: 1.1mm 2.2mm; }
  .piece h2 { margin-top: 1mm; }
  .piece .filet { margin-bottom: 2.5mm; }
  .piece .decision { margin: 3mm 0 2.5mm; padding: 2.2mm 4mm; }
  .piece .carac { margin-bottom: 3mm; padding: 2mm 3.5mm; }
  .piece .corps { margin: 2mm 0; }
  .piece .etudiant { margin: 2.5mm 0; padding: 2mm 3.5mm; }

  /* Un bloc d'information encadré — seconde session, visite des copies. */
  .info { background: #f8fafc; border: 0.4pt solid #e2e8f0; border-radius: 1.5mm;
          padding: 2.5mm 3.5mm; margin: 3mm 0; font-size: 8.5pt; }
  .info .titre { font-weight: 700; color: #1B2B4B; font-size: 8.5pt;
                 margin-bottom: 1.2mm; }
  .info .ligne { margin: .6mm 0; }
  .info b { color: #1B2B4B; }
  .info.orange { background: #FFFBEB; border-color: #FCD34D; }
  /* Les voies de recours tiennent en deux paragraphes serrés : elles sont
     longues par nature, et une pièce qui déborde passe sous le pied. */
  .info.recours { font-size: 7.5pt; }
  .info.recours .ligne { margin: .8mm 0; text-align: justify; line-height: 1.3; }
  .info.recours .ref2 { display: block; color: #64748b; font-size: 6.8pt; }

  /* Les tableaux de pièce : acquis et motivation, décisions du PV. */
  table.doc { width: 100%; border-collapse: collapse; margin: 2mm 0 3mm;
              font-size: 8.5pt; }
  table.doc th, table.doc td { border: 0.4pt solid #cbd5e1; padding: 1.5mm 2.5mm;
                               vertical-align: top; text-align: left; }
  table.doc th { background: #1B2B4B; color: #fff; font-size: 7.5pt;
                 font-weight: 600; letter-spacing: .2pt; text-transform: uppercase; }
  table.doc tbody tr:nth-child(even) td { background: #f8fafc; }
  table.doc td.c { text-align: center; }
  table.doc .code { font-weight: 700; color: #1B2B4B; }
  table.doc .vide { color: #b45309; font-style: italic; }
  /* Le code de l'acquis n'est qu'une référence : c'est son intitulé qui dit
     ce qui n'est pas maîtrisé, et c'est lui que l'étudiant doit lire. */
  table.doc .ref { font-size: 7pt; color: #64748b; letter-spacing: .2pt; }

  .champ { font-size: 8.5pt; margin: 2mm 0; }
  .champ .lab { font-weight: 700; color: #1B2B4B; }

  /* Le PV liste ses membres en colonnes. */
  .membres { display: grid; grid-template-columns: 1fr 1fr; gap: .8mm 6mm;
             font-size: 8pt; margin-top: 1.5mm; }
  .membres .m b { color: #1B2B4B; }
  .membres .m span { color: #475569; font-size: 7.5pt; }

  ${piedStyles()}

  /* LA PAGINATION.
     Le pied vit dans la MARGE BASSE de la feuille, réservée par reglesDePage :
     il se répète alors sur chaque page imprimée, y compris au milieu d'un
     procès-verbal qui en occupe trois.
     La version précédente réduisait cette marge à 8 mm et réservait la place du
     pied par un padding sur la pièce. Cela tenait tant qu'une pièce tenait sur
     une page : dès qu'elle débordait, la première page courait jusqu'au bord et
     le pied, en position fixe, se posait par-dessus le texte. */

  /* Chaque pièce commence sur une nouvelle feuille. La précédente s'arrête où
     elle veut : une attestation courte ne pousse plus la suivante contre elle,
     et un procès-verbal long se pagine au lieu d'être coupé.

     LE COMBINATEUR EST « ~ », NON « + ». Avec « + », il suffisait qu'un
     <style> se glisse entre deux pièces — c'est ce que faisait le bloc des
     listes d'ajournés — pour qu'elles ne soient plus sœurs IMMÉDIATES : le
     saut ne s'appliquait pas, et la liste des ajournés commençait sur la page
     de la signature de la dernière notification. « ~ » vise toute sœur qui
     suit, quoi qu'il y ait entre les deux. */
  .attestation ~ .attestation { break-before: page; page-break-before: always; }

  /* LE PIED : EN FLUX, À LA FIN DU DOCUMENT.
     Trois réglages ont été essayés avant celui-ci ; autant les consigner pour
     ne pas y revenir.
       — « position: fixed ; bottom: 0 » se répète bien sur chaque page, mais
         le pied s'y pose AU BAS DE LA ZONE DE CONTENU. Étant hors flux, le
         tableau lui passe dessous et s'y fait recouvrir : c'est ce qui coupait
         les dernières lignes du procès-verbal de l'UE 71.
       — un « bottom » NÉGATIF le descend dans la marge, où rien ne le
         recouvre — mais le navigateur le remonte en HAUT des pages suivantes.
       — une translation vers le bas depuis « bottom: 0 » fait de même.
     Aucune marge de page ne peut empêcher le contenu d'atteindre l'endroit où
     un élément fixe s'ancre, puisque les deux visent le même bord.
     Le pied revient donc DANS LE FLUX, en fin de document : il ne recouvre
     plus rien, et aucune ligne n'est perdue. Un pied répété sur chaque page
     demanderait de produire le PDF côté serveur, où l'on dispose d'un vrai
     gabarit de pied de page. */
  .pied-lucie { position: static; margin-top: 12mm; break-inside: avoid; }

  @media screen {
    html { background: #e5e5e5; }
    body { max-width: 210mm; margin: 16px auto; padding: 12mm 15mm; background: #fff;
           box-shadow: 0 2px 14px rgba(0,0,0,.18); }
  }
</style></head><body>
${corps}
${piedBalisage(LOGO_IIP_JPEG)}
</body></html>`;
}

r.get('/etudiant/:id', authRequired, (req, res) => {
  const annee = req.query.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  const e = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(Number(req.params.id));
  if (!e) return res.status(404).json({ error: 'étudiant introuvable' });
  res.json({ etudiant: e, annee, unites: unitesReussies(e.id, annee) });
});

// ── Document ────────────────────────────────────────────────────────────────
/**
 * @param {string} [dateDoc] date portée par le document, au format ISO. Par
 *   défaut le jour même — mais une attestation se signe souvent à une date
 *   décidée (délibération, courrier), non le jour où on l'imprime.
 */
// `ident` était utilisé dans le corps de cette fonction sans y être défini
// ni transmis : les deux routes appelantes le calculaient et le gardaient
// pour elles. Toute production d'attestation levait donc « ident is not
// defined ». Il devient un paramètre, avec repli sur l'identité de
// l'établissement pour tout appel qui l'oublierait.
/**
 * Les enseignants qui donnent les cours de l'unité, d'après les attributions
 * de l'année. L'attestation nomme le Conseil des études ; elle doit aussi dire
 * QUI l'a composé — ce sont eux qui ont évalué.
 */
export function enseignantsDeLUE(ueNum, annee) {
  try {
    return db.prepare(`
      SELECT DISTINCT p.nom, p.prenom,
        (SELECT GROUP_CONCAT(DISTINCT a2.code_cours) FROM attribution a2
          WHERE a2.professeur_id = p.id AND a2.ue_num = a.ue_num
            AND a2.annee_scolaire = a.annee_scolaire
            AND a2.code_cours IS NOT NULL) AS cours
      FROM attribution a JOIN professeur p ON p.id = a.professeur_id
      WHERE a.ue_num = ? AND a.annee_scolaire = ? AND a.professeur_id IS NOT NULL
      ORDER BY p.nom, p.prenom
    `).all(ueNum, annee);
  } catch { return []; }
}


/**
 * ANNEXES 14 ET 15 — L'ATTESTATION DE RÉUSSITE PAR VALORISATION DES ACQUIS.
 *
 * Ce n'est pas l'attestation ordinaire à laquelle on aurait changé un mot. Le
 * modèle est distinct : il s'intitule « Attestation de réussite VALORISATION de
 * l'unité d'enseignement », vise l'article 8 du décret et son article 37
 * alinéa 2 en secondaire, 58 alinéa 2 en supérieur, et dit que le Conseil a été
 * « chargé de procéder à la valorisation de capacités, ACQUISES EN DEHORS de
 * l'unité d'enseignement ». Il ne dit pas que l'étudiant « a suivi avec fruit »
 * — il n'a pas suivi —, ni qu'il « termine ses études avec succès ».
 *
 * Une attestation ordinaire délivrée sur une valorisation affirmerait donc
 * deux faits faux sur une pièce que l'étudiant garde à vie.
 */
export function pageAttestationValorisation(e, u, annee, etab, va,
                                            dateDoc = null,
                                            ident = identiteEtablissement()) {
  const genre = /^(mme|madame|mlle|mademoiselle|m\.?me)\b/i.test((e.titre || '').trim())
    ? 'F' : 'H';
  const acquis = u.acquis?.length
    ? `<ul class="acquis">${u.acquis.map(a => `<li>${esc(a.description || a.aa_code)}</li>`).join('')}</ul>`
    : '<i style="color:#b45309">acquis d\'apprentissage à compléter au référentiel</i>';
  const activites = u.activites?.length
    ? u.activites.map(c => `${esc(c.cours_nom)} (${c.cours_per} périodes)`).join(' ;<br>')
    : '<i style="color:#b45309">répartition par activité à compléter</i>';

  return `<div class="attestation">
  <div class="entete">
    <div class="cf">COMMUNAUTÉ FRANÇAISE DE BELGIQUE</div>
    <div class="epa">ENSEIGNEMENT DE PROMOTION SOCIALE</div>
    <div class="annee">Année ${u.superieur ? 'académique' : 'scolaire'}
      ${esc(String(annee).replace('-', '/'))}</div>
  </div>

  <div class="etab">
    <div>
      <div class="nom">${esc(ident.nom || 'Institut Ilya Prigogine')}</div>
      <div>${esc(ident.adresse || '')}</div>
    </div>
    <div class="ident">
      Matricule ${esc(ident.matricule || etab.num_ecot || '……………')}<br>
      FASE ${esc(ident.fase || etab.num_fase || '……………')}
    </div>
  </div>

  <h1>ATTESTATION DE RÉUSSITE VALORISATION DE L'UNITÉ D'ENSEIGNEMENT</h1>
  <h2>${esc((u.ue_nom || '').toUpperCase())}</h2>
  <div class="filet"></div>

  <div class="carac">
    <div>${esc(u.type_enseignement)}</div>
    ${u.superieur ? `<div>${u.domaine ? 'Domaine : ' + esc(u.domaine) : ''}</div>` : ''}
    <div class="large">Code approuvé par le Gouvernement :
      ${u.code_fwb ? `<b>${esc(u.code_fwb)}</b>`
                   : '<span class="manque">à compléter au référentiel</span>'}</div>
    ${u.superieur && u.ects ? `<div>Elle comprend <b>${u.ects}</b> E.C.T.S.</div>` : ''}
  </div>

  <p class="corps">
    Conformément à l'article 8 et à l'article ${u.superieur ? '58' : '37'}
    alinéa 2 du décret du 16 avril 1991 organisant l'enseignement de promotion
    sociale, le Conseil des études, chargé de procéder à la valorisation de
    capacités, acquises en dehors de l'unité d'enseignement, pour l'unité
    d'enseignement susvisée, atteste que
  </p>

  <div class="etudiant">
    <div class="nom">${esc((e.nom || '').toUpperCase())} ${esc(e.prenom || '')}</div>
    <div class="naissance">
      Né${genre === 'F' ? 'e' : ''} à ${esc(e.lieu_naissance) || '………'},
      le ${frDate(e.date_naissance)}
    </div>
  </div>

  <p class="corps">maîtrise les acquis d'apprentissage de l'unité d'enseignement
    susvisée, soit :</p>
  ${acquis}

  <p class="corps">comportant au total <b>${u.periodes || '………'}</b> périodes
    d'activités d'enseignement réparties comme suit :</p>
  <div class="activites">${activites}</div>

  <p class="corps">
    Le Conseil des études lui délivre la présente attestation pour laquelle
    ${genre === 'F' ? 'elle obtient' : 'il obtient'}
    <b>${va?.pourcentage != null ? `${Math.round(Number(va.pourcentage))} %`
                                 : '………'}</b> du total des points.
  </p>

  <div class="cloture">
    <div class="sceau"></div>
    <div class="paraphe"></div>
    <div class="lieu">Fait à ${esc(ident.ville || 'Anderlecht')},
      le ${frDate(dateDoc || va?.decision_ce_date || new Date().toISOString())}</div>
    <div class="legende">
      <div class="qualite">Pour le Conseil des études,<br>le Directeur</div>
      <div class="nom">${esc(ident.directeur || 'Charles SOHET')}</div>
    </div>
  </div>
</div>`;
}

/**
 * LA SESSION OÙ LA RÉUSSITE A ÉTÉ ACQUISE.
 *
 * Deux écrans délivrent des attestations sans passer par le lot d'une séance :
 * la fiche d'un étudiant et l'envoi groupé. Sans cette lecture, leurs pièces
 * tairaient la seconde session que celles du lot mentionnent — deux documents
 * contradictoires pour une même réussite.
 */
function sessionDeReussite(etudId, ueNum, annee) {
  try {
    const l = db.prepare(`
      SELECT session FROM deliberation_resultat
      WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ? AND resultat = 'reussi'
      ORDER BY session DESC LIMIT 1`).get(Number(etudId), annee, Number(ueNum));
    return l ? l.session : null;
  } catch { return null; }
}

export function pageAttestation(e, u, annee, etab, dateDoc = null,
                                ident = identiteEtablissement(), session = null) {
  // Le titre s'écrit tantôt « Mme », tantôt « Madame » : chercher la seule
  // abréviation produisait une attestation au masculin pour une étudiante.
  const genre = /^(mme|madame|mlle|mademoiselle|m\.?me)\b/i.test((e.titre || '').trim())
    ? 'F' : 'H';
  const accord = genre === 'F' ? 'elle maîtrise' : 'il maîtrise';

  const activites = u.activites.length
    ? u.activites.map(c => `${esc(c.cours_nom)} (${c.cours_per} périodes)`).join(' ;<br>')
    : '<i style="color:#b45309">répartition par activité à compléter</i>';

  const acquis = u.acquis.length
    ? `<ul class="acquis">${u.acquis.map(a => `<li>${esc(a.description || a.aa_code)}</li>`).join('')}</ul>`
    : '<p class="manque">Les acquis d\'apprentissage de cette unité ne sont pas encodés.</p>';

  return `
<div class="attestation">
  <div class="entete">
    <div class="cf">COMMUNAUTÉ FRANÇAISE DE BELGIQUE</div>
    <div class="epa">ENSEIGNEMENT POUR ADULTES</div>
    <div class="annee">Année académique ${esc(annee.replace('-', '/'))}</div>
  </div>

  <div class="etab">
    <div>
      <div class="nom">${esc(ident.nom || 'Institut Ilya Prigogine')}</div>
      <div>${esc(ident.adresse || '')}</div>
    </div>
    <div class="ident">
      Matricule ${esc(etab.num_matricule || '2.132.070')}<br>
      FASE ${esc(ident.fase || '292')}
    </div>
  </div>

  <h1>ATTESTATION DE RÉUSSITE DE L'UNITÉ D'ENSEIGNEMENT${
    u.epreuve_integree ? ' « ÉPREUVE INTÉGRÉE »' : ''}</h1>
  <h2>${esc((u.ue_nom || '').toUpperCase())}</h2>
  <div class="filet"></div>

  <div class="carac">
    <div>${esc(u.type_enseignement)}</div>
    ${u.superieur
      ? `<div>${u.domaine ? 'Domaine : ' + esc(u.domaine)
                          : '<span class="manque">Domaine à compléter</span>'}</div>`
      : ''}
    <div class="large">Code approuvé par le Gouvernement :
      ${u.code_fwb ? `<b>${esc(u.code_fwb)}</b>`
                   : '<span class="manque">à compléter au référentiel</span>'}</div>
    ${u.superieur
      ? `<div>${u.ects ? `<b>${u.ects}</b> E.C.T.S.`
                       : '<span class="manque">ECTS à compléter</span>'}</div>`
      : ''}
    <div>${u.periodes
      ? `<b>${u.periodes}</b> périodes`
        + (u.autonomie ? ` <span class="detail">(${u.periodes_cours} + ${u.autonomie} aut.)</span>` : '')
      : '<span class="manque">périodes à compléter</span>'}</div>
  </div>

  <p class="corps">
    Conformément aux articles ${u.superieur ? '52, 53 et 58' : '31, 32 et 37'}
    alinéa 1<sup>er</sup> du décret du 16 avril 1991
    organisant l'enseignement de promotion sociale, ${u.epreuve_integree
      ? "le Jury d'épreuve intégrée" : 'le Conseil des études'}, chargé de procéder
    à l'évaluation de l'unité d'enseignement susvisée, atteste que
  </p>

  <div class="etudiant">
    <div class="nom">${esc((e.nom || '').toUpperCase())} ${esc(e.prenom || '')}</div>
    <div class="naissance">
      Né${genre === 'F' ? 'e' : ''} à ${esc(e.lieu_naissance) || '………'},
      le ${frDate(e.date_naissance)}
    </div>
  </div>

  <p class="corps indente">
    a suivi avec fruit, dans l'établissement précité, l'unité d'enseignement${
      u.epreuve_integree ? ' « épreuve intégrée »' : ''} susvisée,
    ${u.est_stage || u.epreuve_integree
      // Annexes 12, 13, 17 et 18 : « comportant, pour l'étudiant, X périodes »,
      // SANS répartition par activité.
      ? `comportant, pour l'étudiant, <b>${u.periodes || '………'}</b> périodes
         d'activités d'enseignement ;`
      // Annexe 11 : la répartition par activité y figure.
      : `comportant au total <b>${u.periodes || '………'}</b> périodes d'activités
         d'enseignement réparties comme suit :`}
  </p>
  ${u.est_stage || u.epreuve_integree ? '' : `<div class="activites">${activites}${u.autonomie
    ? `<div class="ligne autonomie"><span>Activités d'enseignement en autonomie</span>`
      + `<span><b>${u.autonomie}</b> pér.</span></div>`
    : ''}</div>`}

  <p class="corps">Attendu qu'${accord} tous les acquis d'apprentissage de l'unité
    d'enseignement, soit :</p>
  ${acquis}

  ${u.est_stage || u.epreuve_integree
    // Le modèle de stage porte « termine ses études avec succès », mais un
    // stage n'est pas la fin du cursus : l'affirmer serait inexact. On s'en
    // tient au stage. L'épreuve intégrée, elle, clôt bien les études.
    ? `<p class="corps">Attendu qu'${genre === 'F' ? 'elle termine' : 'il termine'}
       ${u.est_stage && !u.epreuve_integree ? 'son stage' : 'ses études'} avec succès ;</p>`
    : ''}

  <div class="resultat">
    ${u.epreuve_integree ? "Le Jury d'épreuve intégrée" : 'Le Conseil des études'} lui délivre
    la présente attestation, pour laquelle
    ${genre === 'F' ? 'elle obtient' : 'il obtient'}
    <span class="pct">${u.pourcentage != null ? u.pourcentage + ' %' : '………'}</span>
    du total des points.
    ${Number(session) === 2 ? `
    <!-- MENTION AJOUTÉE AU MODÈLE, à la demande de l'établissement.
         Les annexes 10 à 18 ne portent aucune mention de session : c'est le
         procès-verbal qui l'établit. Un fait vrai ajouté n'est pas une mention
         obligatoire omise, mais c'est un écart — il se retire en supprimant ce
         seul bloc. -->
    <div class="session2">Résultat obtenu à l'issue de la seconde session.</div>`
    : ''}
  </div>

  <!-- AUCUN NOM DE MEMBRE ICI. Les modèles d'attestation — annexes 10 à 18 —
       ne portent que la formule « Le Conseil des études » ou « Le Jury
       d'épreuve intégrée », le sceau, la date et la signature du Directeur.
       Lucie y ajoutait la liste des enseignants de l'unité : un ajout au
       modèle, et de surcroît une liste fausse pour un jury d'épreuve intégrée,
       qui comprend des chargés de cours de la section et des personnes
       étrangères à l'établissement. La composition se dit sur sa propre
       pièce — l'annexe 2. -->

  <!-- Sceau et signature. Le tableau à trois cases (conseil des études,
       sceau, direction) est remplacé par les pièces réelles. -->
  <div class="cloture">
    <div class="sceau"></div>
    <div class="paraphe"></div>
    <div class="lieu">Fait en un exemplaire à ${esc(ident.ville || 'Anderlecht')},
      le ${frDate(dateDoc || new Date().toISOString())}</div>
    <div class="legende">
      <div class="qualite">Pour ${u.epreuve_integree
        ? "le Jury d'épreuve intégrée" : 'le Conseil des études'},<br>le Directeur</div>
      <div class="nom">${esc(ident.directeur || 'Charles SOHET')}</div>
    </div>
  </div>
</div>`;
}

r.get('/etudiant/:id/document', authRequired, (req, res) => {
  const annee = req.query.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  const e = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(Number(req.params.id));
  if (!e) return res.status(404).json({ error: 'étudiant introuvable' });

  let unites = unitesReussies(e.id, annee);
  const filtre = (req.query.ue || '').split(',').filter(Boolean).map(Number);
  if (filtre.length) unites = unites.filter(u => filtre.includes(u.ue_num));
  if (!unites.length) {
    return res.status(404).json({ error: `Aucune unité réussie en ${annee} pour cet étudiant.` });
  }

  const etab = db.prepare('SELECT * FROM etablissement LIMIT 1').get() || {};
  const ident = identiteEtablissement();

  // Une attestation par unité, chacune sur sa propre page : ce sont des pièces
  // distinctes, remises séparément.
  const pages = unites.map(u => pageAttestation(e, u, annee, etab, req.query.date_document,
      ident, sessionDeReussite(e.id, u.ue_num, annee)))
    .join('<div class="saut"></div>');

  const html = envelopper(pages, `Attestations — ${e.nom} ${e.prenom}`);

  res.json({
    html,
    nom: `attestations_${(e.nom || '').replace(/\W/g, '_')}_${annee}.html`,
    unites: unites.length,
    manques: unites.filter(u => u.manques.length)
      .map(u => ({ ue_num: u.ue_num, manques: u.manques })),
  });
});

// ── Sélection pour une génération groupée ───────────────────────────────────
// On croise librement années, sections, unités et étudiants. Chaque couple
// « étudiant × unité réussie » donne une attestation : ce sont des pièces
// distinctes, et c'est à cette maille que la sélection se raisonne.
r.get('/candidats', authRequired, (req, res) => {
  const annees = (req.query.annees || '').split(',').filter(Boolean);
  const sections = (req.query.sections || '').split(',').filter(Boolean);
  const ues = (req.query.ues || '').split(',').filter(Boolean).map(Number);
  const etudiants = (req.query.etudiants || '').split(',').filter(Boolean).map(Number);

  if (!annees.length) return res.status(400).json({ error: 'au moins une année requise' });

  const perim = getUserSections(req.user);

  const clauses = [`i.resultat = 'reussi'`,
                   `i.annee_scolaire IN (${annees.map(() => '?').join(',')})`];
  const params = [...annees];

  if (ues.length) {
    clauses.push(`i.ue_num IN (${ues.map(() => '?').join(',')})`);
    params.push(...ues);
  }
  if (etudiants.length) {
    clauses.push(`i.etudiant_id IN (${etudiants.map(() => '?').join(',')})`);
    params.push(...etudiants);
  }

  const lignes = db.prepare(`
    SELECT i.etudiant_id, i.ue_num, i.annee_scolaire, i.points,
           e.nom, e.prenom, e.id_ecampus,
           -- SQLite n'admet pas de référence à l'alias externe « i » dans le
           -- ORDER BY d'une sous-requête : on prend simplement le millésime le
           -- plus récent, l'intitulé et la section d'une unité ne variant pas
           -- d'une année à l'autre.
           (SELECT ue_nom FROM ue u WHERE u.ue_num = i.ue_num
             ORDER BY u.annee_scolaire DESC LIMIT 1) AS ue_nom,
           (SELECT section FROM ue u WHERE u.ue_num = i.ue_num AND u.section IS NOT NULL
             ORDER BY u.annee_scolaire DESC LIMIT 1) AS section
    FROM etudiant_inscription i
    JOIN etudiant e ON e.id = i.etudiant_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY e.nom, e.prenom, i.annee_scolaire, i.ue_num
  `).all(...params);

  // Le filtre par section s'applique après coup : la section vient d'une
  // sous-requête, elle n'est pas disponible dans la clause WHERE.
  const retenues = lignes.filter(l => {
    if (perim && l.section && !perim.includes(l.section)) return false;
    if (sections.length && !sections.includes(l.section)) return false;
    return true;
  });

  res.json({
    candidats: retenues,
    total: retenues.length,
    etudiants: new Set(retenues.map(l => l.etudiant_id)).size,
  });
});

// ── Génération groupée ──────────────────────────────────────────────────────
r.post('/lot', authRequired, (req, res) => {
  const { paires, separes, date_document } = req.body || {};
  if (!Array.isArray(paires) || !paires.length) {
    return res.status(400).json({ error: 'aucune attestation demandée' });
  }
  // En un seul document, les images du sceau et de la signature ne sont posées
  // qu'une fois. En pièces séparées, CHACUNE les porte pour rester imprimable
  // seule — d'où un plafond plus bas : cinq cents pièces feraient 300 Mo dans
  // le navigateur.
  // Les images pesaient 632 Ko par pièce, ce qui plafonnait l'archive à 120.
  // Redimensionnées à 56 Ko, neuf cents pièces tiennent en 49 Mo.
  const plafond = separes ? 900 : 900;
  if (paires.length > plafond) {
    return res.status(400).json({
      error: `${paires.length} attestations demandées, maximum ${plafond} `
           + (separes
              ? `en pièces séparées. Restreignez la sélection, par unité ou par `
              + `section, et reprenez en plusieurs fois.`
              : `: restreignez la sélection, par section ou par année.`),
    });
  }

  const etab = db.prepare('SELECT * FROM etablissement LIMIT 1').get() || {};
  const ident = identiteEtablissement();
  const cacheEtud = {};
  const cacheUnites = {};

  const documents = [];
  const manquants = [];
  // Deux homonymes dans la même unité produiraient le même nom de fichier, et
  // l'un écraserait l'autre dans l'archive. On suffixe alors le matricule.
  const nomsVus = new Map();

  for (const p of paires) {
    const etudId = Number(p.etudiant_id);
    const e = cacheEtud[etudId]
      || (cacheEtud[etudId] = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(etudId));
    if (!e) continue;

    const cle = `${etudId}|${p.annee_scolaire}`;
    const unites = cacheUnites[cle]
      || (cacheUnites[cle] = unitesReussies(etudId, p.annee_scolaire));
    const u = unites.find(x => x.ue_num === Number(p.ue_num));
    if (!u) continue;

    if (u.manques.length) manquants.push({ etudiant: `${e.nom} ${e.prenom}`, ue_num: u.ue_num, manques: u.manques });

    // Nom de fichier demandé : nom_prénom, numéro d'UE, année académique.
    const propre = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
    documents.push({
      // Format demandé : UE65_Sohet_Charles_2526. L'unité vient en tête pour
      // que l'archive se range par UE, et le millésime est abrégé.
      nom_fichier: (() => {
        const base = `UE${u.ue_num}_${propre(e.nom)}_${propre(e.prenom)}`
          + `_${String(p.annee_scolaire).replace(/^(\d{2})(\d{2})-(\d{2})(\d{2})$/, '$2$4')
               .replace(/-/g, '')}`;
        const n = (nomsVus.get(base) || 0) + 1;
        nomsVus.set(base, n);
        return (n === 1 ? base : `${base}_${e.id_ecampus || e.id}`) + '.html';
      })(),
      etudiant: `${e.nom} ${e.prenom}`,
      etudiant_id: e.id,
      ue_num: u.ue_num,
      annee: p.annee_scolaire,
      corps: pageAttestation(e, u, p.annee_scolaire, etab, date_document, ident,
        sessionDeReussite(e.id, u.ue_num, p.annee_scolaire)),
    });
  }

  if (!documents.length) {
    return res.status(404).json({ error: 'Aucune attestation n\'a pu être produite.' });
  }

  res.json({
    documents: separes ? documents : undefined,
    // En un seul document, les attestations s'enchaînent, chacune sur sa page.
    html: separes ? undefined : envelopper(
      documents.map(d => d.corps).join('<div class="saut"></div>')),
    // Chaque pièce séparée porte la même enveloppe, pour rester imprimable seule.
    enveloppe: separes ? envelopper('__CORPS__') : undefined,
    total: documents.length,
    manquants: manquants.slice(0, 40),
    nb_manquants: manquants.length,
  });
});

// ── Rendu PDF, si le serveur en est capable ─────────────────────────────────
// N'intervient pas dans la mise en page : reçoit le document déjà produit et
// le rend tel quel, sans les en-têtes que le navigateur ajouterait.
r.post('/pdf', authRequired, async (req, res) => {
  const cap = await capacitePdf();
  if (!cap.disponible) {
    return res.status(503).json({
      error: "Ce serveur ne sait pas produire de PDF. L'impression depuis le "
           + "navigateur reste disponible.",
      capacite_absente: 'pdf', detail: cap.raison,
    });
  }
  const { html, nom } = req.body || {};
  if (!html) return res.status(400).json({ error: 'document requis' });

  try {
    // Marges reprises de l'enveloppe des attestations, pour que le PDF rende
    // exactement ce que l'impression rend.
    const pdf = await rendrePdf(html, {
      marges: { top: '12mm', right: '15mm', bottom: '22mm', left: '15mm' },
      pagination: 'si-plusieurs',
    });
    const fichier = String(nom || 'attestations').replace(/[^A-Za-z0-9_.-]/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fichier}.pdf"`);
    res.setHeader('Content-Length', pdf.length);
    res.end(pdf);
  } catch (e) {
    console.error('[attestations/pdf]', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * ANNEXE 4 — le procès-verbal de délibération de valorisation des acquis, et
 * les attestations qui en découlent, pour une unité.
 *
 * Le tableau du modèle porte une colonne DISPENSE(S) : c'est la seule pièce où
 * l'on dit ce qui a été dispensé, cours par cours ou acquis par acquis. Sans
 * elle, une valorisation partielle serait indistinguable d'une complète.
 */
r.post('/valorisation/ue/:ueNum/documents', authRequired, (req, res) => {
  const ueNum = Number(req.params.ueNum);
  const annee = req.body?.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  const ident = identiteEtablissement();
  const etab = db.prepare('SELECT * FROM etablissement LIMIT 1').get() || {};

  const vas = db.prepare(`
    SELECT v.*, e.nom, e.prenom, e.titre, e.date_naissance, e.lieu_naissance
    FROM etudiant_valorisation v JOIN etudiant e ON e.id = v.etudiant_id
    WHERE v.ue_num = ? AND v.annee_scolaire = ?
    ORDER BY e.nom, e.prenom`).all(ueNum, annee);
  if (!vas.length) {
    return res.status(400).json({
      error: "Aucune valorisation enregistrée pour cette unité cette année." });
  }

  const ue = db.prepare(`SELECT * FROM ue WHERE ue_num = ?
    ORDER BY (annee_scolaire = ?) DESC, annee_scolaire DESC LIMIT 1`).get(ueNum, annee) || {};
  const niv = String(ue.ue_niv || '').toUpperCase();
  const superieur = /SUP|BES|BAC|ESTC|ESTL/.test(niv) ? true
    : /SEC|ESI|ESS/.test(niv) ? false : !!ue.ects;

  const dit = v => v.type === 'complete' ? "Unité entière"
    : v.cible_detail ? `${v.cible === 'aa' ? 'Acquis' : 'Cours'} : ${v.cible_detail}`
      : v.type === 'admission' ? 'Admission' : 'Dispense partielle';

  const lignes = vas.map(v => `<tr>
    <td><b>${esc((v.nom || '').toUpperCase())} ${esc(v.prenom || '')}</b><br>
      <span class="ref">${esc(v.lieu_naissance || '')}${
        v.date_naissance ? `, ${frDate(v.date_naissance)}` : ''}</span></td>
    <td class="c">${v.pourcentage != null ? 'Réussite' : 'Refus'}</td>
    <td>${esc(dit(v))}</td>
    <td class="c">${v.pourcentage != null
      ? `${Math.round(Number(v.pourcentage))} %` : ''}</td>
  </tr>`).join('');

  const pv = `<div class="attestation">
  <div class="entete">
    <div class="cf">COMMUNAUTÉ FRANÇAISE DE BELGIQUE</div>
    <div class="epa">ENSEIGNEMENT DE PROMOTION SOCIALE</div>
    <div class="annee">Année scolaire / académique ${esc(String(annee).replace('-', '/'))}
      · ${superieur ? 'Enseignement supérieur' : 'Enseignement secondaire'}</div>
  </div>
  <div class="etab">
    <div><div class="nom">${esc(ident.nom || '')}</div><div>${esc(ident.adresse || '')}</div></div>
    <div class="ident">Matricule ${esc(ident.matricule || '……')}<br>
      FASE ${esc(ident.fase || '……')}</div>
  </div>

  <h1>PROCÈS-VERBAL DE DÉLIBÉRATION DE VALORISATION DES ACQUIS</h1>
  <div class="filet"></div>

  <p class="corps">
    Nous, soussignés, Président-e et Membres du Conseil des études constitué en
    vue d'évaluer la maîtrise des acquis d'apprentissage lorsque ceux-ci ont été
    obtenus en dehors de l'unité d'enseignement :
  </p>

  <div class="carac">
    <div class="large">Intitulé de l'unité d'enseignement :
      <b>${esc(ue.ue_nom || `UE ${ueNum}`)}</b></div>
    <div>${ue.ue_per_etudiants ? `<b>${ue.ue_per_etudiants}</b> périodes` : '…… périodes'}</div>
    <div>Numéro de code : ${ue.ue_code_fwb ? `<b>${esc(ue.ue_code_fwb)}</b>`
      : '<span class="manque">à compléter</span>'}</div>
  </div>

  <p class="corps">Après en avoir délibéré, avons pris les décisions suivantes :</p>

  <table class="doc">
    <thead><tr>
      <th style="width:34%">Nom, prénom et initiales des autres prénoms,<br>
        lieu et date de naissance (pays si pas la Belgique)</th>
      <th style="width:14%">Réussite / Refus</th>
      <th>Dispense(s)</th>
      <th style="width:14%">Total des points en %<sup>1</sup></th>
    </tr></thead>
    <tbody>${lignes}</tbody>
  </table>
  <p style="font-size:7.5pt;color:#64748b"><sup>1</sup> À ne compléter qu'en cas
    de « Réussite ».</p>

  <div class="info">
    <div class="ligne">Le présent procès-verbal comporte …… page(s).</div>
    <div class="ligne">Le Conseil des études a délibéré le
      <b>${esc(vas.find(v => v.decision_ce_date)
        ? frDate(vas.find(v => v.decision_ce_date).decision_ce_date) : '……………')}</b>.</div>
    <div class="ligne">Les résultats sont communiqués conformément au ROI de
      l'établissement le ……………………</div>
  </div>

  <div class="cloture sans-paraphe">
    <div class="sceau"></div>
    <div class="paraphe"></div>
    <div class="lieu">Fait en un exemplaire à ${esc(ident.ville || 'Anderlecht')},
      le ${frDate(new Date().toISOString())}</div>
    <div class="legende">
      <div class="qualite">Pour le Conseil des études,<br>le Directeur</div>
      <div class="nom">${esc(ident.directeur || '……………………')}</div>
    </div>
  </div>
</div>`;

  // Les attestations : seules les valorisations COMPLÈTES en produisent une.
  // Une dispense partielle ne fait pas réussir l'unité — elle allège son
  // évaluation, et l'attestation viendra de la délibération ordinaire.
  const completes = vas.filter(v => v.type === 'complete' && v.pourcentage != null);
  const unites = completes.length
    ? Object.fromEntries(completes.map(v => [v.etudiant_id,
        (unitesReussies(v.etudiant_id, annee) || []).find(x => Number(x.ue_num) === ueNum)]))
    : {};
  const attestations = completes
    .filter(v => unites[v.etudiant_id])
    .map(v => ({
      etudiant_id: v.etudiant_id,
      etudiant: `${v.nom} ${v.prenom || ''}`.trim(),
      html: pageAttestationValorisation(v, { ...unites[v.etudiant_id], superieur },
        annee, etab, v, req.body?.date_document || null, ident),
    }));

  res.json({
    html: envelopper(pv, `Valorisation — UE ${ueNum}`),
    nom: `Valorisation_UE${ueNum}_${String(annee).replace(/\W/g, '')}.html`,
    annexe: 4,
    attestations,
    nb: vas.length,
    manques: vas.filter(v => !v.date_naissance || !v.lieu_naissance)
      .map(v => `${v.nom} ${v.prenom} : identité incomplète`),
  });
});

export default r;
