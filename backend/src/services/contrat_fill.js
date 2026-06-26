/**
 * contrat_fill.js — Génère un contrat CDD complet (docx-js)
 * Données : professeur + établissement + attributions depuis la DB Lucie
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, VerticalAlign, PageBreak, LevelFormat,
} = require('docx');

// ─── Helpers ─────────────────────────────────────────────────────────────────
const JOURS_FR = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
const MOIS_FR  = ['janvier','février','mars','avril','mai','juin',
                  'juillet','août','septembre','octobre','novembre','décembre'];

function dateLongue(s) {
  if (!s) return '__________';
  const d = new Date(s + 'T12:00:00');
  return `${JOURS_FR[d.getDay()]} ${d.getDate()} ${MOIS_FR[d.getMonth()]} ${d.getFullYear()}`;
}
function dateCourte(s) {
  if (!s) return '__/__/____';
  const [y,m,dd] = s.split('-');
  return `${dd}/${m}/${y}`;
}

const BDR  = { style: BorderStyle.SINGLE, size: 4,  color: '333333' };
const BDRS = { top: BDR, bottom: BDR, left: BDR, right: BDR };
const BL   = { style: BorderStyle.SINGLE, size: 1,  color: 'BBBBBB' };
const BLS  = { top: BL, bottom: BL, left: BL, right: BL };
const BNONE = { style: BorderStyle.NONE };

function tr(text, opts = {}) {
  return new TextRun({ text: String(text ?? ''), font: 'Arial', size: 22, ...opts });
}
function pp(children, opts = {}) {
  const runs = children.map(c => typeof c === 'string' ? tr(c) : c);
  return new Paragraph({ children: runs, spacing: { after: 80 }, ...opts });
}
function sp() { return new Paragraph({ children: [], spacing: { after: 120 } }); }

function cell(text, opts = {}) {
  const run = typeof text === 'string' ? tr(text) : text;
  return new TableCell({
    borders: BLS,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ children: [run], spacing: { after: 0 }, ...((opts.align) ? { alignment: opts.align } : {}) })],
    ...opts,
  });
}

function cellH(text) {
  return new TableCell({
    borders: BLS,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    shading: { fill: '1F3864', type: 'clear' },
    children: [new Paragraph({ children: [tr(text, { bold: true, size: 18, color: 'FFFFFF' })], spacing: { after: 0 } })],
  });
}

function art(num, paragraphs) {
  return [
    new Paragraph({ children: [tr(`Article ${num}`, { bold: true })], spacing: { before: 200, after: 80 } }),
    ...paragraphs,
    sp(),
  ];
}

// ─── Export ───────────────────────────────────────────────────────────────────
export async function genererContrat({ etab, prof, attributions, annee, date_contrat, representant }) {
  // Calcul ETP selon règle : CT=800°, PP=1000° par ETP
  let totalCT = 0, totalPP = 0;
  for (const a of attributions) {
    const per = (a.periodes_attribuees||0) + (a.autonomie_attribuee||0);
    if ((a.ct_pp || a.type_cours || '') === 'PP') totalPP += per;
    else totalCT += per; // CT ou inconnu → 800°
  }
  const total = totalCT + totalPP;
  const etp   = Math.round((totalCT / 800 + totalPP / 1000) * 100) / 100;
  const estETP = etp >= 1;
  const rep   = representant
    || (etab.gest_prenom || etab.gest_nom ? `${etab.gest_prenom || ''} ${etab.gest_nom || ''}`.trim() + (etab.gest_qualite ? `, ${etab.gest_qualite}` : '') : null)
    || 'Charles Sohet, Directeur a.i.';

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Arial', size: 22 } } } },
    numbering: {
      config: [
        { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '\u2022',
            alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 480, hanging: 300 } } } }] },
        { reference: 'annexes', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.',
            alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 520, hanging: 520 } } } }] },
      ],
    },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } } },
      children: [
        // ── Titre ──────────────────────────────────────────────────────────
        new Paragraph({ children: [tr('CONTRAT DE TRAVAIL POUR UNE DURÉE DÉTERMINÉE', { bold: true, size: 28 })], alignment: AlignmentType.CENTER, spacing: { after: 80 } }),
        new Paragraph({ children: [tr('Dans l\u2019Enseignement pour adultes (personnel enseignant)', { italics: true })], alignment: AlignmentType.CENTER, spacing: { after: 200 } }),

        // ── Pouvoir Organisateur ───────────────────────────────────────────
        pp([tr('Entre, d\u2019une part, le Pouvoir Organisateur\u00a0: '), tr(etab.po_nom || 'ASBL Ilya Prigogine', { bold: true })]),
        pp([tr(`(pour l\u2019${etab.etab_nom || 'Institut Supérieur de Promotion Sociale Libre de Bruxelles Ilya Prigogine'} (en abrégé ${etab.etab_abrev || 'IIP'}))`, { italics: true, size: 20 })]),
        pp([tr(`Dont le siège social est situé\u00a0: ${etab.adresse || ''}, ${etab.code_postal || ''} ${etab.commune || ''}`.trim())]),
        pp([tr(`Numéro matricule FASE\u00a0: ${etab.num_fase || ''}  |  Matricule ETNIC\u00a0: ${etab.num_ecot || ''}`)]),
        pp([tr('Représenté par\u00a0: '), tr(rep, { bold: true })]),
        sp(),

        // ── Membre du personnel ────────────────────────────────────────────
        pp([tr('Et,')]),
        pp([tr('D\u2019autre part,')]),
        sp(),
        pp([tr(`${prof.nom || ''} ${prof.prenom || ''}`, { bold: true, size: 24 })]),
        pp([tr(`Né(e) le\u00a0: ${dateCourte(prof.date_naissance)}  |  à ${[prof.lieu_naissance_ville, prof.lieu_naissance_pays].filter(Boolean).join(', ')}`)]),
        pp([tr(`Nationalité\u00a0: ${prof.nationalite || '___________'}`)]),
        pp([tr(`Numéro de registre national\u00a0: ${prof.niss || '___.___.___-__.___ '}`)]),
        pp([tr(`Matricule enseignant\u00a0: ${prof.matricule || '_____________'}`)]),
        pp([tr(`Domicilié(e)\u00a0: ${[prof.adresse_rue, [prof.code_postal, prof.commune].filter(Boolean).join(' ')].filter(Boolean).join(', ')}`)]),
        sp(),

        // ── Convenu ────────────────────────────────────────────────────────
        pp([tr('Il est convenu ce qui suit\u00a0:', { bold: true })]),
        sp(),

        // ── Article 1 — Prestations ────────────────────────────────────────
        ...art(1, [
          pp([tr('Le membre du personnel est engagé dans un emploi\u00a0/ des emplois vacant(s) au sens de l\u2019article 3 § 1er, § 1er bis et § 1er ter du Décret du 1er février 1993 comportant\u00a0:')]),
          sp(),
          // Lignes de cours (sans tableau)
          ...(attributions.length ? [
            ...attributions.map(a => {
              const per = (a.periodes_attribuees||0) + (a.autonomie_attribuee||0);
              return pp([
                tr(`${a.section || ''}\u00a0\u2013\u00a0`, { bold: true }),
                tr(`${a.code_cours || ''} ${a.cours_nom || ''}`),
                tr(`\u00a0(${per} période${per > 1 ? 's' : ''})`),
              ]);
            }),
            sp(),
            pp([
              tr('Total\u00a0: '),
              tr(`${total} période${total > 1 ? 's' : ''}`, { bold: true }),
            ]),
          ] : [pp([tr('Voir document EA12 joint au présent contrat.', { italics: true })])]),
          sp(),
          // Phrase ETP ou incomplète
          (() => {
            if (estETP) {
              return pp([tr('Ces emplois constituent un temps plein pour l\u2019année académique '), tr(annee || '', { bold: true }), tr('.')]);
            } else {
              return pp([tr('Ces emplois constituent des prestations incomplètes ('), tr(`${etp} ETP`, { bold: true }), tr(') pour l\u2019année académique '), tr(annee || '', { bold: true }), tr('.')]);
            }
          })(),
        ]),

        // ── Article 2 ──────────────────────────────────────────────────────
        ...art(2, [
          pp([tr('Le présent contrat d\u2019engagement est conclu conformément\u00a0:')]),
          new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [tr('au Décret du 1er février 1993 fixant le statut des membres du personnel subsidiés de l\u2019enseignement libre subventionné,')], spacing: { after: 60 } }),
          new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [tr('à la législation en vigueur dans l\u2019enseignement subventionné par la Communauté Française.')], spacing: { after: 80 } }),
          pp([tr('Le Pouvoir organisateur, d\u2019une part, et le membre du personnel, d\u2019autre part, déclarent expressément que le présent contrat, les règles complémentaires éventuellement établies par les Commissions Paritaires compétentes et le règlement de travail constituent un tout indivisible.')]),
        ]),

        // ── Article 3 ──────────────────────────────────────────────────────
        ...art(3, [
          pp([tr('Conformément à l\u2019article 3 § 5 du Décret du 1er février 1993, le Pouvoir organisateur déclare avoir opté pour le réseau libre non confessionnel et conformément à l\u2019article 3 § 6 se déclare de caractère non confessionnel.')]),
        ]),

        // ── Article 4 ──────────────────────────────────────────────────────
        ...art(4, [
          pp([tr('Conformément à l\u2019article 21 du Décret du 1er février 1993, le membre du personnel s\u2019engage à respecter les obligations qui découlent du caractère spécifique du projet éducatif et du projet pédagogique du pouvoir organisateur (voir annexe).')]),
        ]),

        // ── Article 5 ──────────────────────────────────────────────────────
        ...art(5, [
          pp([tr('Conformément aux articles 24 et 25 du 1er février 1993 est déclarée incompatible avec le caractère spécifique du projet éducatif et du projet pédagogique toute occupation qui serait de nature à leur nuire (voir annexe).')]),
        ]),

        // ── Article 6 ──────────────────────────────────────────────────────
        ...art(6, [
          pp([tr('Le membre du personnel certifie que sa situation professionnelle correspond à celle décrite dans le document \u00ab\u00a0fonctions actuelles\u00a0\u00bb ci-annexé. Il s\u2019engage à avertir le Pouvoir organisateur de toute modification affectant sa situation professionnelle, par écrit dans les trois jours ouvrables. Le Pouvoir organisateur ne peut en aucun cas être tenu responsable d\u2019éventuelles nouvelles modalités de rémunération entraînées par la/les dite(s) modification(s), conformément au statut pécuniaire.')]),
        ]),

        // ── Article 7 ──────────────────────────────────────────────────────
        ...art(7, [
          pp([tr('Les prestations de travail sont fournies selon l\u2019horaire ci-annexé. Le Pouvoir organisateur se réserve le droit de fixer et/ou de modifier l\u2019horaire d\u2019enseignement ou de travail en fonction des besoins et conformément au règlement de travail. De même, les lieux de cours ou de travail pourront être transférés si nécessaire. Le Pouvoir organisateur veillera à se concerter avec les intéressés préalablement à toute modification. Les mesures à prendre seront appliquées en fonction de l\u2019intérêt tant de l\u2019institution et des étudiants (élèves) que des membres du personnel.')]),
        ]),

        // ── Article 8 ──────────────────────────────────────────────────────
        ...art(8, [
          pp([tr('Sans préjudice de la responsabilité contractuelle du Pouvoir organisateur et des dispositions légales relatives au paiement de la rémunération, le montant de celle-ci est égal à la subvention-traitement afférente à l\u2019emploi ou aux emplois exercé(s) par le membre du personnel, dont le(s) barème(s) est/sont déterminé(s) par la Communauté française.')]),
          sp(),
          pp([tr('Cette rémunération sera versée directement au membre du personnel par la Communauté française.')]),
          sp(),
          pp([tr('Toute modification de la subvention-traitement décidée par l\u2019autorité publique à la hausse ou à la baisse lie les parties sans que le membre du personnel puisse faire valoir quelque droit que ce soit à l\u2019égard du Pouvoir organisateur.')]),
        ]),

        // ── Article 9 ──────────────────────────────────────────────────────
        ...art(9, [
          pp([tr('Le présent contrat prend fin dans les conditions et selon les modalités définies par les articles 71 à 71nonies du Décret du 1er février 1993 fixant le statut des membres du personnel subsidiés de l\u2019enseignement libre subventionné et/ou selon la législation en vigueur dans l\u2019enseignement subventionné par la Communauté française.')]),
        ]),

        // ── Article 10 ─────────────────────────────────────────────────────
        ...art(10, [
          pp([tr('Est annexé à ce contrat le document \u00ab\u00a0contenu des prestations\u00a0\u00bb qui décrit les attendus de l\u2019établissement en termes de charge de travail pour les enseignants. Le membre du personnel accepte la charge de travail qui lui est confiée dans et en dehors de la classe, dans le respect du décret du 1er février 1993.')]),
        ]),

        // ── Article 11 ─────────────────────────────────────────────────────
        ...art(11, [
          pp([tr('En cas de litige, seuls les tribunaux du lieu où s\u2019exécute le présent contrat sont compétents.')]),
        ]),

        // ── Signatures ─────────────────────────────────────────────────────
        pp([tr(`Ainsi établi en double exemplaire, à Bruxelles, le ${dateLongue(date_contrat)}`)], { spacing: { before: 200, after: 80 } }),
        pp([tr('Chaque partie reconnaissant avoir reçu le sien.')]),
        sp(),

        new Table({
          width: { size: 9638, type: WidthType.DXA },
          columnWidths: [4819, 4819],
          rows: [new TableRow({ children: [
            new TableCell({ borders: { top: BNONE, bottom: BNONE, left: BNONE, right: BL }, children: [
              new Paragraph({ children: [tr('Le travailleur,', { bold: true })], spacing: { after: 60 } }),
              new Paragraph({ children: [tr('précédé de la mention \u00ab\u00a0lu et approuvé\u00a0\u00bb', { italics: true, size: 20 })], spacing: { after: 800 } }),
              new Paragraph({ children: [tr(`${prof.nom || ''} ${prof.prenom || ''}`)], spacing: { after: 0 } }),
            ]}),
            new TableCell({ borders: { top: BNONE, bottom: BNONE, right: BNONE, left: BL }, children: [
              new Paragraph({ children: [tr('Le représentant du Pouvoir organisateur,', { bold: true })], spacing: { after: 860 } }),
              new Paragraph({ children: [tr(`${etab.gest_prenom || ''} ${etab.gest_nom || ''}`)], spacing: { after: 40 } }),
              new Paragraph({ children: [tr(etab.gest_qualite || '', { italics: true })], spacing: { after: 0 } }),
            ]}),
          ]})],
        }),

        // ── Annexes ────────────────────────────────────────────────────────
        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph({ children: [tr('Annexes   : 12', { bold: true })], spacing: { before: 200, after: 200 } }),
        ...[
          'un exemplaire du Statut (Décret du 1er février 1993) disponible sur le drive',
          'un exemplaire du règlement de travail tel qu\u2019approuvé conformément à la loi du 08-04-65',
          'un exemplaire du projet éducatif du pouvoir organisateur (disponible sur le site)',
          'un exemplaire du projet pédagogique et du projet d\u2019établissement (disponible sur le site)',
          'le document administratif précisant les fonctions actuelles du membre du personnel signataire du contrat de travail (document EA12)',
          'l\u2019horaire de travail applicable au membre du personnel (disponible en ligne via hyperplanning)',
          'un règlement d\u2019ordre intérieur (disponible en ligne)',
          'un règlement des études (disponible en ligne)',
          'un exemplaire des programmes et/ou des référentiels à utiliser (disponible sur le drive)',
          'un document précisant l\u2019endroit où le membre du personnel peut consulter les textes importants régissant l\u2019enseignement en Communauté française (p.\u00a0ex. décret \u00ab\u00a0mission\u00a0\u00bb)',
          'un exemplaire des décisions éventuelles de la ou des commissions paritaires compétentes',
          'Le document intitulé \u00ab\u00a0contenu des prestations\u00a0\u00bb.',
        ].map(txt => new Paragraph({ numbering: { reference: 'annexes', level: 0 }, children: [tr(txt)], spacing: { after: 60 } })),

        // ── Pied de page ───────────────────────────────────────────────────
        sp(),
        new Paragraph({
          children: [tr('Institut Supérieur de Promotion Sociale Libre Ilya Prigogine  \u2022  PO ASBL Ilya Prigogine  \u2022  Matricule N° 2.132.070  \u2022  FASE 292', { size: 18, color: '666666' })],
          alignment: AlignmentType.CENTER,
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB', space: 4 } },
          spacing: { before: 200, after: 40 },
        }),
        new Paragraph({
          children: [tr('Campus Erasme  \u2022  Bâtiment P  \u2022  Route de Lennik 808, 1070 Bruxelles  \u2022  T. +32 (0)2 560 29 59  \u2022  www.institut-prigogine.be', { size: 18, color: '666666' })],
          alignment: AlignmentType.CENTER,
        }),
      ],
    }],
  });

  return await Packer.toBuffer(doc);
}
