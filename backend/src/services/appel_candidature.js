/**
 * appel_candidature.js — Génère l'appel à candidature IIP (.docx)
 * Format exact du modèle officiel : Arial, marine #1F3864, encadrés, footer institutionnel.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  Document, Packer, Paragraph, TextRun, Footer,
  AlignmentType, BorderStyle, WidthType, TabStopType, TabStopPosition,
} = require('docx');

// ── Couleurs et styles ────────────────────────────────────────────────────────
const MARINE   = '1F3864';  // bleu marine IIP
const GRIS     = '7F7F7F';  // gris pour les valeurs placeholder
const NOIR     = '000000';

// Bordure encadrée (chaque ligne de champ est encadrée comme dans le modèle)
const BDR_BOX = {
  top:    { style: BorderStyle.SINGLE, size: 4, color: 'auto', space: 1 },
  left:   { style: BorderStyle.SINGLE, size: 4, color: 'auto', space: 4 },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: 'auto', space: 1 },
  right:  { style: BorderStyle.SINGLE, size: 4, color: 'auto', space: 4 },
};

function tr(text, { bold = false, color = NOIR, size = 20 } = {}) {
  return new TextRun({
    text: String(text ?? ''),
    font: 'Arial',
    size,
    bold,
    color,
  });
}

/** Ligne de champ encadrée : [Label en gras marine] [valeur] */
function ligneChamp(label, valeur, valueColor = NOIR) {
  return new Paragraph({
    border: BDR_BOX,
    spacing: { after: 0, before: 0 },
    children: [
      tr(label, { bold: true, color: MARINE }),
      tr(valeur || '', { color: valueColor }),
    ],
  });
}

/** Bloc titre + valeur multiligne (pour contenu synthétique et profil) */
function ligneMulti(label, lignes = []) {
  const children = [tr(label, { bold: true, color: MARINE })];
  if (lignes.length === 0 || (lignes.length === 1 && !lignes[0])) {
    children.push(tr('', { color: GRIS }));
  } else {
    children.push(tr(lignes[0] || '', { color: NOIR }));
  }
  const paras = [
    new Paragraph({ border: BDR_BOX, spacing: { after: 0, before: 0 }, children }),
  ];
  // Lignes supplémentaires (même encadré visuel)
  for (let i = 1; i < lignes.length; i++) {
    paras.push(new Paragraph({
      border: BDR_BOX,
      spacing: { after: 0, before: 0 },
      children: [tr(lignes[i] || '', { color: NOIR })],
    }));
  }
  return paras;
}

function sp(after = 80) {
  return new Paragraph({ children: [], spacing: { after } });
}

// ── Génération principale ─────────────────────────────────────────────────────
export async function genererAppelCandidature({
  section,
  fonction,
  chargePeriodes,
  coursNom,
  contenuSynthetique,
  profil,
  priseDeFonction,
  intitule,
}) {
  const titres = `La possession d'un titre pédagogique (CAPAES), de même qu'une expérience pédagogique seront appréciées.`;

  // Découper le contenu synthétique et le profil en lignes pour l'encadré multiligne
  const contenuLignes = contenuSynthetique
    ? contenuSynthetique.split('\n').map(l => l.trim()).filter(Boolean)
    : [''];
  const profilLignes = profil
    ? profil.split('\n').map(l => l.trim()).filter(Boolean)
    : [''];

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: 'Arial', size: 20 } },
      },
      paragraphStyles: [
        {
          id: 'Titre',
          name: 'Titre',
          basedOn: 'Normal',
          run: { size: 48, bold: true, font: 'Arial', color: MARINE },
          paragraph: { spacing: { before: 0, after: 200 }, alignment: AlignmentType.LEFT },
        },
      ],
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
        },
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              spacing: { before: 80, after: 40 },
              border: { top: { style: BorderStyle.SINGLE, size: 6, color: MARINE, space: 4 } },
              children: [
                tr('Institut Ilya Prigogine • PO Asbl Ilya Prigogine • N° entreprise 458.339.252', { size: 16, color: MARINE }),
              ],
            }),
            new Paragraph({
              spacing: { after: 20 },
              children: [
                tr('Matricule N° 2.132.070 • Fase 292 • Campus Erasme • Bâtiment P • Route de Lennik 808, 1070 Bruxelles', { size: 16, color: MARINE }),
              ],
            }),
            new Paragraph({
              spacing: { after: 20 },
              children: [
                tr('T. + 32 (0)2 560 29 59 • www.institut-prigogine.be', { size: 16, color: MARINE }),
              ],
            }),
          ],
        }),
      },
      children: [
        // ── Titre ──────────────────────────────────────────────────────────
        new Paragraph({
          style: 'Titre',
          children: [tr('APPEL À CANDIDATURE', { bold: true, size: 48, color: MARINE })],
        }),

        // ── Sous-titre : IIP – section ─────────────────────────────────────
        new Paragraph({
          border: BDR_BOX,
          spacing: { after: 0, before: 0 },
          children: [
            tr('IIP – Enseignement pour adultes – ', { bold: true, color: MARINE }),
            tr(section || 'Section', { bold: true, color: MARINE }),
          ],
        }),

        sp(40),

        // ── Fonction ───────────────────────────────────────────────────────
        ligneChamp('Fonction : ', fonction || 'Expert / Chargé de cours (choisir)', fonction ? NOIR : GRIS),

        sp(40),

        // ── Charge totale ──────────────────────────────────────────────────
        ligneChamp('Charge totale : ', chargePeriodes ? `${chargePeriodes} périodes` : '(en périodes)', chargePeriodes ? NOIR : GRIS),

        sp(40),

        // ── Cours à conférer ───────────────────────────────────────────────
        ligneChamp('Cours à conférer : ', coursNom || '(cours tel qu\'indiqué dans le DP)', coursNom ? NOIR : GRIS),

        sp(40),

        // ── Contenu synthétique ────────────────────────────────────────────
        ...ligneMulti('Contenu synthétique : ', contenuLignes),

        sp(40),

        // ── Profil du/de la candidat.e ─────────────────────────────────────
        ...ligneMulti('Profil du/ de la candidat.e : ', profilLignes),

        sp(40),

        // ── Titres ─────────────────────────────────────────────────────────
        new Paragraph({
          border: BDR_BOX,
          spacing: { after: 0, before: 0 },
          children: [
            tr('Titres : ', { bold: true, color: MARINE }),
          ],
        }),
        new Paragraph({
          border: BDR_BOX,
          spacing: { after: 0, before: 0 },
          children: [tr(titres, { color: NOIR })],
        }),

        sp(40),

        // ── Prise de fonction ──────────────────────────────────────────────
        ligneChamp('Prise de fonction : ', priseDeFonction || 'Date du début de l\'activité', priseDeFonction ? NOIR : GRIS),

        sp(80),

        // ── Modalités de candidature ───────────────────────────────────────
        new Paragraph({
          border: BDR_BOX,
          spacing: { after: 0, before: 0 },
          children: [
            tr('Les candidatures accompagnées d\'une lettre de motivation et d\'un CV à jour (et copie du diplôme) sont à adresser à la direction de l\'Institut, Monsieur Charles Sohet via l\'adresse mail suivante : '),
            tr('service.rh@institut-prigogine.be', { bold: true, color: MARINE }),
            tr(', dans les 6 jours ouvrables suivant la parution de la présente annonce au Prigoginews.'),
          ],
        }),
      ],
    }],
  });

  return await Packer.toBuffer(doc);
}
