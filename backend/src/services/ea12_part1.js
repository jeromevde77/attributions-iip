/* Générateur EA12 bis (SUPÉRIEUR) — reconstruction Word ultra-fidèle.
 * Reproduit la mise en page officielle (circulaire FWB 53089, annexe 1bis PS).
 * Tableaux natifs : largeurs de colonnes exactes, word-wrap et hauteur de ligne
 * automatiques, police fixe. Produit un .docx (convertible PDF).
 */
import fs from 'fs';
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
  AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign, HeightRule,
} from 'docx';

// ---------- Constantes de style ----------
const FONT = 'Arial';
const NAVY = '1F3864';      // bandeau titre
const BANDBLUE = 'D9E1F2';  // bandeaux de section bleu clair
const CHK = '☐';            // case à cocher vide
const CHKD = '☒';           // case cochée

// Largeur utile en DXA (A4, marges 0.7cm) : 595pt - 2*~20pt ≈ 555pt → 555*20 = 11100 DXA
// On travaille en DXA (1 pt = 20 DXA). Largeur contenu ≈ 551 pt.
const PT = 20; // 1 pt = 20 DXA
const CONTENT_PT = 551;

const NB = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const TB = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const noBorders = { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB };
const allBorders = { top: TB, bottom: TB, left: TB, right: TB, insideHorizontal: TB, insideVertical: TB };

function run(text, o = {}) {
  return new TextRun({ text: String(text ?? ''), font: FONT, size: o.size ?? 15, bold: o.bold, italics: o.italics, color: o.color, superScript: o.sup });
}
function par(children, o = {}) {
  return new Paragraph({
    children: (Array.isArray(children) ? children : [children]).map(ch => typeof ch === 'string' ? run(ch, o) : ch),
    alignment: o.align, spacing: o.spacing ?? { before: 0, after: 0, line: 200, lineRule: 'atLeast' },
    indent: o.indent,
  });
}
// raccourci case à cocher + label
function chk(label, checked = false, o = {}) {
  return [run((checked ? CHKD : CHK) + ' ', { size: o.size ?? 15 }), run(label, { size: o.size ?? 14, bold: o.bold })];
}
function cell(content, o = {}) {
  const children = Array.isArray(content) ? content : [content];
  return new TableCell({
    children: children.map(c => c instanceof Paragraph ? c : par(c, o)),
    width: o.w ? { size: o.w * PT, type: WidthType.DXA } : undefined,
    columnSpan: o.span, rowSpan: o.rowSpan,
    borders: o.borders,
    shading: o.fill ? { fill: o.fill, type: ShadingType.CLEAR, color: 'auto' } : undefined,
    verticalAlign: o.valign ?? VerticalAlign.CENTER,
    margins: { top: o.mt ?? 10, bottom: o.mb ?? 10, left: o.ml ?? 40, right: o.mr ?? 40 },
  });
}
function table(rows, widthsPt, o = {}) {
  return new Table({
    width: { size: (o.totalPt ?? CONTENT_PT) * PT, type: WidthType.DXA },
    columnWidths: widthsPt.map(w => Math.round(w * PT)),
    borders: o.borders ?? allBorders,
    rows,
  });
}

// ======================= EN-TÊTE =======================
function enTete(d, logoBuf) {
  const annee = (d.annee || '2025-2026').replace(/[^0-9]/g, '');
  const a = annee.padEnd(8).slice(0, 8).split('');
  // Cases année : 2 0 _ _ / 2 0 _ _  (4+4 chiffres avec / au milieu)
  const caseDigit = (ch) => cell([par([run(ch || '', { size: 16, bold: true })], { align: AlignmentType.CENTER })], { w: 16, borders: allBorders });
  const anneeCases = new Table({
    width: { size: 150 * PT, type: WidthType.DXA },
    columnWidths: [16, 16, 16, 16, 10, 16, 16, 16, 16].map(w => w * PT),
    borders: noBorders,
    rows: [new TableRow({ children: [
      caseDigit(a[0]), caseDigit(a[1]), caseDigit(a[2]), caseDigit(a[3]),
      cell([par([run('/', { size: 16, bold: true })], { align: AlignmentType.CENTER })], { w: 10, borders: noBorders }),
      caseDigit(a[4]), caseDigit(a[5]), caseDigit(a[6]), caseDigit(a[7]),
    ]})],
  });
  // Ligne logo (gauche) + bloc année/document/doc12 (droite)
  const headerTable = new Table({
    width: { size: CONTENT_PT * PT, type: WidthType.DXA },
    columnWidths: [330 * PT, 221 * PT],
    borders: noBorders,
    rows: [new TableRow({ children: [
      cell([
        logoBuf ? new Paragraph({ children: [new ImageRun({ data: logoBuf, transformation: { width: 230, height: 31 }, type: 'png' })] }) : par(''),
        par([run('Administration générale de l’Enseignement', { bold: true, size: 15 })], { spacing: { before: 60 } }),
        par([run('Direction générale des Personnels de l’Enseignement', { bold: true, size: 15 })]),
      ], { borders: noBorders, valign: VerticalAlign.TOP }),
      cell([
        new Table({
          width: { size: 221 * PT, type: WidthType.DXA }, columnWidths: [70 * PT, 151 * PT], borders: noBorders,
          rows: [
            new TableRow({ children: [
              cell([par([run('Année', { bold: true, size: 14 })]), par([run('académique', { bold: true, size: 14 })])], { borders: noBorders, w: 70 }),
              cell([anneeCases], { borders: noBorders, w: 151 }),
            ]}),
            new TableRow({ children: [
              cell([par([run('Document n°', { bold: true, size: 14 })])], { borders: noBorders, w: 70 }),
              cell([new Table({ width: { size: 40 * PT, type: WidthType.DXA }, columnWidths: [20 * PT, 20 * PT], borders: noBorders,
                rows: [new TableRow({ children: [cell([par(d.doc_num || '', { align: AlignmentType.CENTER, size: 16, bold: true })], { w: 20, borders: allBorders }), cell([par('')], { w: 20, borders: allBorders })] })] })], { borders: noBorders, w: 151 }),
            ]}),
            new TableRow({ children: [
              cell([par([run('Dernier Doc12 transmis le : ', { bold: true, size: 13 }), run(d.dernier_doc12 || '__/__/20__', { size: 13 })], { spacing: { before: 40 } })], { borders: noBorders, w: 221, span: 2 }),
            ]}),
          ],
        }),
      ], { borders: noBorders, valign: VerticalAlign.TOP }),
    ]})],
  });
  // Bandeau titre
  const titre = table([
    new TableRow({ children: [cell([par([
      run('EA12', { bold: true, size: 22, color: 'FFFFFF' }),
      run(' - Enseignement pour Adultes - ', { size: 15, color: 'FFFFFF' }),
      run('SUPERIEUR', { bold: true, size: 20, color: 'FFFFFF' }),
      run(' – Demande de mise en liquidation', { bold: true, size: 16, color: 'FFFFFF' }),
    ], { align: AlignmentType.CENTER, spacing: { before: 40, after: 40 } })], { fill: NAVY, span: 1 })] }),
  ], [CONTENT_PT]);
  return [headerTable, par('', { spacing: { after: 60 } }), titre, par('', { spacing: { after: 80 } })];
}

export { enTete, run, par, chk, cell, table, Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign, allBorders, noBorders, NB, TB,
  FONT, NAVY, BANDBLUE, CHK, CHKD, PT, CONTENT_PT, ImageRun };
