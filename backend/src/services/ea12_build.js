/* EA12 bis ultra-fidèle — corps du document + assemblage final. */
import fs from 'fs';
import * as P from './ea12_part1.js';
import * as S2 from './ea12_part2.js';
const {
  enTete, run, par, chk, cell, table, Packer, Document, Paragraph, Table, TableRow, TableCell,
  AlignmentType, VerticalAlign, allBorders, noBorders, NB, TB, BANDBLUE, CHK, PT, CONTENT_PT, WidthType, ShadingType,
} = P;
import { PageBreak } from 'docx';

// Bandeau de section (pleine largeur, fond bleu clair)
function bande(titre, totalPt = CONTENT_PT) {
  return table([new TableRow({ children: [cell([par([run(titre, { bold: true, size: 15 })], { align: AlignmentType.CENTER, spacing: { before: 20, after: 20 } })], { fill: BANDBLUE })] })], [totalPt]);
}

// ===== Identification de l'établissement =====
function identEtab(d) {
  const e = d.etab || {};
  const wbe = e.type_po === 'WBE', fwb = e.type_po === 'FWB';
  const off = e.sous_type === 'officiel', lib = e.sous_type === 'libre';
  const ecot = (e.num_ecot || '').padEnd(10).slice(0, 10).split('');
  const fase = (e.num_fase || '').padEnd(5).slice(0, 5).split('');
  const miniCases = (arr, wEach) => new Table({
    width: { size: arr.length * wEach * PT, type: WidthType.DXA }, columnWidths: arr.map(() => wEach * PT), borders: noBorders,
    rows: [new TableRow({ children: arr.map(ch => cell([par([run(ch.trim(), { size: 13, bold: true })], { align: AlignmentType.CENTER })], { w: wEach, borders: allBorders, mt: 4, mb: 4, ml: 4, mr: 4 })) })],
  });
  // Ligne 1 : niveau + organisé/subventionné
  const ligneNiveau = new TableRow({ children: [
    cell([par([run('Niveau : ENSEIGNEMENT', { bold: true, size: 14 })]), par([run('POUR ADULTES ', { bold: true, size: 14 }), run('(20)', { size: 13 })])], { w: 200, borders: noBorders }),
    cell([par([run((wbe ? '☒' : CHK) + ' ', { size: 14 }), run('Organisé WBE ', { size: 13 }), run('(33)', { size: 12 })])], { w: 160, borders: noBorders, valign: VerticalAlign.CENTER }),
    cell([
      par([run((fwb ? '☒' : CHK) + ' ', { size: 14 }), run('Subventionné par la FWB ', { size: 13 }), run('(22)', { size: 12 })]),
      par([run((off ? '☒' : CHK) + ' ', { size: 13 }), run('Officiel   ', { size: 13 }), run((lib ? '☒' : CHK) + ' ', { size: 13 }), run('Libre', { size: 13 })], { align: AlignmentType.CENTER }),
    ], { w: 191, borders: noBorders }),
  ]});
  // Ligne 2 : ECOT + FASE (cases)
  const ligneNum = new TableRow({ children: [
    cell([par([run('N° ECOT ', { bold: true, size: 13 }), run('(10 derniers chiffres) :', { size: 11 })]), miniCases(ecot, 15.5)], { w: 360, borders: noBorders, span: 2 }),
    cell([par([run('N° FASE :', { bold: true, size: 13 })]), miniCases(fase, 15.5)], { w: 191, borders: noBorders }),
  ]});
  // Bloc identité (gauche) + gestionnaire (droite) en 2 colonnes
  const champ = (lib, val, wl = 95, wv = 160) => new TableRow({ children: [
    cell([par([run(lib, { bold: true, size: 13 })])], { w: wl, borders: allBorders, fill: 'F2F2F2' }),
    cell([par([run(val || '', { size: 13 })])], { w: wv, borders: allBorders }),
  ]});
  const blocGauche = new Table({ width: { size: 300 * PT, type: WidthType.DXA }, columnWidths: [95 * PT, 205 * PT], borders: allBorders, rows: [
    champ('Nom du PO', e.po_nom, 95, 205),
    champ('Nom de l’établissement', e.etab_nom, 95, 205),
    champ('Adresse complète', e.adresse, 95, 205),
    new TableRow({ children: [
      cell([par([run('E-mails officiels', { bold: true, size: 13 })])], { w: 95, borders: allBorders, fill: 'F2F2F2' }),
      cell([par([run('ec  ', { size: 12 }), run(e.email_ec || '', { size: 12 })]), par([run('po  ', { size: 12 }), run(e.email_po || '', { size: 12 })])], { w: 205, borders: allBorders }),
    ]}),
  ]});
  const blocDroite = new Table({ width: { size: 251 * PT, type: WidthType.DXA }, columnWidths: [70 * PT, 181 * PT], borders: allBorders, rows: [
    new TableRow({ children: [cell([par([run('Gestionnaire du dossier', { bold: true, size: 13 })]), par([run('(joignable facilement par l’Administration)', { italics: true, size: 11 })])], { w: 251, borders: allBorders, span: 2, fill: 'F2F2F2' })] }),
    champ('Nom :', e.gest_nom, 70, 181),
    champ('Prénom :', e.gest_prenom, 70, 181),
    champ('Qualité :', e.gest_qualite, 70, 181),
    champ('Tél. direct :', e.gest_tel, 70, 181),
    champ('E-mail :', e.gest_email, 70, 181),
  ]});
  const corps = new TableRow({ children: [
    cell([blocGauche], { w: 300, borders: { ...allBorders }, span: 2 }),
    cell([blocDroite], { w: 251, borders: { ...allBorders } }),
  ]});
  return new Table({ width: { size: CONTENT_PT * PT, type: WidthType.DXA }, columnWidths: [200 * PT, 160 * PT, 191 * PT], borders: allBorders,
    rows: [ligneNiveau, ligneNum, corps] });
}

// ===== Identification du MDP =====
function identMDP(d) {
  const mat = (d.matricule || '').padEnd(11).slice(0, 11).split('');
  const matCases = new Table({ width: { size: 200 * PT, type: WidthType.DXA }, columnWidths: mat.map(() => 16 * PT), borders: noBorders,
    rows: [new TableRow({ children: mat.map(ch => cell([par([run(ch.trim(), { size: 13, bold: true })], { align: AlignmentType.CENTER })], { w: 16, borders: allBorders, mt: 4, mb: 4, ml: 2, mr: 2 })) })] });
  return table([
    new TableRow({ children: [cell([par([run('Identification du membre du personnel (MDP)', { bold: true, size: 14 })], { align: AlignmentType.CENTER, spacing: { before: 15, after: 15 } })], { fill: BANDBLUE, span: 3 })] }),
    new TableRow({ children: [
      cell([
        par([run('Matricule enseignant', { bold: true, size: 13 })], { align: AlignmentType.CENTER }),
        matCases,
        par([run('NOM : ', { bold: true, size: 13 }), run(d.prof_nom || '', { size: 13 })], { spacing: { before: 60 } }),
        par([run('Prénom : ', { bold: true, size: 13 }), run(d.prof_prenom || '', { size: 13 })]),
      ], { w: 208, valign: VerticalAlign.TOP }),
      cell([
        par([run('Titres de capacités', { bold: true, size: 13 })], { align: AlignmentType.CENTER }),
        par([run('(une copie de chacun d’eux doit être en possession de la Direction de gestion)', { italics: true, size: 10 })], { align: AlignmentType.CENTER }),
        par([run('1) ' + (d.titre1 || ''), { size: 12 })], { spacing: { before: 40 } }),
        par([run('2) ' + (d.titre2 || ''), { size: 12 })]),
        par([run((d.titre3 ? '☒ ' : CHK + ' '), { size: 12 }), run('Dérogation de titre requis par l’AR du 22/4/1969 telle que prévue par l’alinéa 2 de art 17§4 de la Loi du 7/7/1970.', { bold: true, size: 11 })], { spacing: { before: 40 } }),
      ], { w: 224, valign: VerticalAlign.TOP }),
      cell([
        par([run('Statut', { bold: true, size: 13 })], { align: AlignmentType.CENTER }),
        new Table({ width: { size: 119 * PT, type: WidthType.DXA }, columnWidths: [62 * PT, 57 * PT], borders: noBorders, rows: [
          new TableRow({ children: [cell([par(chk('T', d.statut === 'T'))], { w: 55, borders: noBorders }), cell([par(chk('ACS', d.statut === 'ACS'))], { w: 51, borders: noBorders })] }),
          new TableRow({ children: [cell([par(chk('TPr', d.statut === 'TPr'))], { w: 55, borders: noBorders }), cell([par(chk('APE', d.statut === 'APE'))], { w: 51, borders: noBorders })] }),
          new TableRow({ children: [cell([par(chk('St', d.statut === 'St'))], { w: 55, borders: noBorders }), cell([par(chk('PTP', d.statut === 'PTP'))], { w: 51, borders: noBorders })] }),
          new TableRow({ children: [cell([par(chk('D', d.statut === 'D'))], { w: 55, borders: noBorders }), cell([par('')], { w: 51, borders: noBorders })] }),
        ]}),
      ], { w: 119, valign: VerticalAlign.TOP }),
    ]}),
  ], [208, 224, 119]);
}

// ===== Tableau d'attributions (cœur) =====
function tableauAttributions(d) {
  // Largeurs colonnes (pt) reprises de la mesure du formulaire officiel, mises à l'échelle sur CONTENT_PT.
  // Officiel (pt) : UE40 F21 Den130 CLA28 PerOcc113 TCTL42 Nb50 Titre35 Sit35 DI28 OE27 = 549
  const wpt = [52, 18, 130, 26, 104, 42, 50, 35, 35, 28, 31];
  const heads = ['U.E.', 'F', 'Dénomination du Cours', 'CLA', 'Périodes d’occupation', 'TC / TL', 'Nb de périodes', 'Titre', 'Sit. adm.', 'DI', 'N° OE*'];
  const headRow = new TableRow({ tableHeader: true, children: heads.map((h, i) =>
    cell([par([run(h, { bold: true, size: 12 })], { align: AlignmentType.CENTER })], { w: wpt[i], fill: BANDBLUE, mt: 6, mb: 6, ml: 10, mr: 10 })) });
  const mkRow = (a) => new TableRow({ children: [
    cell([par([run(a.ue || '', { size: 12 })])], { w: wpt[0], mt: 8, mb: 8 }),
    cell([par([run(a.f || '', { size: 12 })], { align: AlignmentType.CENTER })], { w: wpt[1] }),
    cell([par([run(a.denomination || '', { size: 12 })])], { w: wpt[2], ml: 30, mr: 30 }),
    cell([par([run(a.cla || '', { size: 12 })], { align: AlignmentType.CENTER })], { w: wpt[3] }),
    cell([par([run(a.periode_occ || '', { size: 12 })], { align: AlignmentType.CENTER })], { w: wpt[4] }),
    cell([par([run(a.tctl || '', { size: 12 })], { align: AlignmentType.CENTER })], { w: wpt[5] }),
    cell([par([run(a.nb_periodes || '', { size: 12 })], { align: AlignmentType.CENTER })], { w: wpt[6] }),
    cell([par([run(a.titre || '', { size: 12 })], { align: AlignmentType.CENTER })], { w: wpt[7] }),
    cell([par([run(a.sit_adm || '', { size: 12 })], { align: AlignmentType.CENTER })], { w: wpt[8] }),
    cell([par([run(a.di || '', { size: 12 })], { align: AlignmentType.CENTER })], { w: wpt[9] }),
    cell([par([run(a.oe || '', { size: 12 })], { align: AlignmentType.CENTER })], { w: wpt[10] }),
  ]});
  const dataRows = (d.attributions || []).map(mkRow);
  return table([headRow, ...dataRows], wpt);
}

// ===== Assemblage =====
function buildEA12bis(d) {
  let logoBuf = null;
  try { logoBuf = fs.readFileSync(import.meta.dirname + '/ea12-assets/logo_fwb.png'); } catch {}
  const children = [
    ...enTete(d, logoBuf),
    bande('Identification de l’établissement'),
    identEtab(d),
    par('', { spacing: { after: 60 } }),
    identMDP(d),
    par('', { spacing: { after: 60 } }),
    S2.cumul(d),
    par('', { spacing: { after: 60 } }),
    S2.evenement(d),
    par('', { spacing: { after: 40 } }),
    S2.observations(d),
    // ---- PAGE 2 ----
    new Paragraph({ children: [new PageBreak()] }),
    S2.rappelNum(d),
    par([run('Attributions', { bold: true, size: 16 })], { spacing: { before: 60, after: 40 } }),
    tableauAttributions(d),
    par('', { spacing: { after: 60 } }),
    S2.attributionsResume(d),
    ...S2.origineEvenement(),
    par('', { spacing: { after: 60 } }),
    S2.signatures(d),
  ];
  return new Document({
    styles: { default: { document: { run: { font: P.FONT, size: 15 } } } },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 400, right: 360, bottom: 360, left: 360 } } },
      children,
    }],
  });
}

export { buildEA12bis };
