/* Sections complémentaires EA12 bis : Cumul, Événement, Observations, Page 2. */
import * as P from './ea12_part1.js';
const {
  run, par, chk, cell, table, Paragraph, Table, TableRow, TableCell,
  AlignmentType, VerticalAlign, WidthType, TextDirection, allBorders, noBorders, fineBorders, NB, TB, BANDBLUE, CHK, PT, CONTENT_PT,
} = P;

const halfBorders = allBorders;

// ===== Cumul / Transmission tardive =====
function cumul(d) {
  return table([
    new TableRow({ children: [
      cell([par([run('Cumul', { bold: true, size: 14 })], { align: AlignmentType.CENTER, spacing: { before: 12, after: 12 } })], { fill: BANDBLUE, w: 275 }),
      cell([par([run('Transmission tardive du document par la faute du MDP', { bold: true, size: 13 })], { align: AlignmentType.CENTER, spacing: { before: 12, after: 12 } })], { fill: BANDBLUE, w: 276 }),
    ]}),
    new TableRow({ children: [
      cell([
        par(chk('Pas de cumul interne', d.pas_cumul, { bold: true }), { spacing: { before: 20, after: 40 } }),
        par([run('Prestations dans cet établissement', { bold: true, size: 13 }), run(' :', { size: 13 })], { spacing: { before: 30 } }),
        par([run((d.prest_sec ? '☒' : CHK) + ' ', { size: 13 }), run('Secondaire   ', { size: 12 }),
             run((d.prest_sup ? '☒' : CHK) + ' ', { size: 13 }), run('Supérieur   ', { size: 12 }),
             run((d.prest_exp ? '☒' : CHK) + ' ', { size: 13 }), run('Expert   ', { size: 12 }),
             run(CHK + ' ', { size: 13 }), run('ACS/APE/PTP', { size: 12 })], { spacing: { after: 40 } }),
        par([run('Prestations dans un autre établissement', { bold: true, size: 13 }), run(' :', { size: 13 })], { spacing: { before: 30 } }),
        par([run(CHK + ' ', { size: 13 }), run('Cumul interne A2 ', { bold: true, size: 12 }), run('(enseignement organisé ou subventionné par la FWB)', { size: 11 })]),
      ], { w: 275, valign: VerticalAlign.TOP }),
      cell([
        par([run(CHK + ' ', { size: 13 }), run('En application de la Circulaire 6930 du 10/01/2019 : ', { size: 11 }), run('« FICHES FISCALES : Déclarations du paiement des arriérés - Responsabilités et incidences fiscales »', { italics: true, size: 11 })], { spacing: { before: 20 } }),
        par([run('Nombre de jours de fonctionnement/semaine : ', { bold: true, size: 12 }),
             run((d.jours === 4 ? '☒' : CHK) + ' ', { size: 13 }), run('4  ', { size: 12 }),
             run((d.jours === 5 ? '☒' : CHK) + ' ', { size: 13 }), run('5  ', { size: 12 }),
             run((d.jours === 6 ? '☒' : CHK) + ' ', { size: 13 }), run('6', { size: 12 })], { spacing: { before: 80 } }),
      ], { w: 276, valign: VerticalAlign.TOP }),
    ]}),
  ], [275, 276]);
}

// ===== Événement =====
function evenement(d) {
  const colJust = (items) => items.map(it => par([run((it.checked ? '☒' : CHK) + ' ', { size: 12 }), run(it.label, { size: 11 })], { spacing: { before: 8, after: 8 } }));
  return table([
    new TableRow({ children: [cell([par([run('Événement', { bold: true, size: 14 })], { align: AlignmentType.CENTER, spacing: { before: 12, after: 12 } })], { fill: BANDBLUE, span: 2 })] }),
    new TableRow({ children: [
      cell([par([run('Date de l’événement ', { bold: true, size: 12 }), run('(JJ/MM/AAAA) : ', { italics: true, size: 11 }), run(d.date_evenement || '__/__/20__', { bold: true, size: 13 })], { spacing: { before: 20, after: 20 } })], { w: 264 }),
      cell([par([run('Semaines de fonctionnement : ', { bold: true, size: 12 }), run(d.semaines || '', { size: 12 })], { spacing: { before: 20, after: 20 } })], { w: 287 }),
    ]}),
    new TableRow({ children: [
      cell([par([run('Type d’événement', { bold: true, size: 13 })], { align: AlignmentType.CENTER, spacing: { before: 8, after: 8 } })], { fill: BANDBLUE, w: 264 }),
      cell([par([run('Justification(s)', { bold: true, size: 13 })], { align: AlignmentType.CENTER, spacing: { before: 8, after: 8 } })], { fill: BANDBLUE, w: 287 }),
    ]}),
    // Mouvement : sous-tableau gauche (2 colonnes : événements / nominations) + droite (3 colonnes justifs)
    new TableRow({ children: [
      cell([new Table({ width: { size: 262 * PT, type: WidthType.DXA }, columnWidths: [18 * PT, 122 * PT, 122 * PT], borders: noBorders, rows: [
        new TableRow({ children: [
          cell([par([run('Mouvement', { bold: true, size: 13 })], { align: AlignmentType.CENTER })], { w: 18, borders: noBorders, valign: VerticalAlign.CENTER, textDir: TextDirection.BOTTOM_TO_TOP_LEFT_TO_RIGHT }),
          cell([
            par(chk('Entrée en fonction', false, { size: 11 }), { spacing: { before: 6, after: 6 } }),
            par(chk('Rentrée en fonction', false, { size: 11 }), { spacing: { after: 6 } }),
            par(chk('Maintien d’attributions', false, { size: 11 }), { spacing: { after: 6 } }),
            par(chk('Augmentation d’attributions', false, { size: 11 }), { spacing: { after: 6 } }),
            par(chk('Prolongation d’attributions', false, { size: 11 }), { spacing: { after: 6 } }),
            par(chk('Réduction d’attributions', false, { size: 11 }), { spacing: { after: 6 } }),
            par(chk('Fin de fonctions (dernier jour presté)', false, { size: 11 }), { spacing: { after: 6 } }),
          ], { w: 122, borders: noBorders, valign: VerticalAlign.TOP }),
          cell([
            par(chk('Nomination ou engagement à titre définitif', d.justif === 'nomination', { size: 11 }), { spacing: { before: 6, after: 6 } }),
            par(chk('Extension nomination/engagement à titre définitif', false, { size: 11 }), { spacing: { after: 6 } }),
            par(chk('Passerelle / Changement d’affectation / Mutation', false, { size: 11 }), { spacing: { after: 6 } }),
            par(chk('Autres (à préciser) :', false, { size: 11 }), { spacing: { after: 6 } }),
          ], { w: 122, borders: noBorders, valign: VerticalAlign.TOP }),
        ]}),
      ]})], { w: 264, valign: VerticalAlign.TOP, ml: 6, mr: 6 }),
      cell([new Table({ width: { size: 285 * PT, type: WidthType.DXA }, columnWidths: [12 * PT, 273 * PT], borders: noBorders, rows: [
        new TableRow({ children: [
          cell([par('')], { w: 12, borders: noBorders }),
          cell(colJust([
            { label: 'Création d’emploi' }, { label: 'Remplacement *Voir encadré à la page 2' },
            { label: 'Changement d’affectation' }, { label: 'Modification d’organisation interne' },
            { label: 'Congé / Absence / Disponibilité' }, { label: 'Perte partielle de charge' }, { label: 'DPPR' },
            { label: 'Suppression d’emploi' }, { label: 'Fin de remplacement' }, { label: 'Démission' },
            { label: 'Mise à la retraite' }, { label: 'Décès' }, { label: 'Autres (à préciser) :' },
          ]), { w: 273, borders: noBorders }),
        ]}),
      ]})], { w: 287, valign: VerticalAlign.TOP }),
    ]}),
    // Ligne Absence (sur toute la largeur, structurée en sous-tableau)
    new TableRow({ children: [
      cell([new Table({ width: { size: 549 * PT, type: WidthType.DXA }, columnWidths: [18 * PT, 175 * PT, 200 * PT, 156 * PT], borders: noBorders, rows: [
        new TableRow({ children: [
          cell([par([run('Absence', { bold: true, size: 13 })], { align: AlignmentType.CENTER })], { w: 18, borders: noBorders, valign: VerticalAlign.CENTER, textDir: TextDirection.BOTTOM_TO_TOP_LEFT_TO_RIGHT }),
          cell([
            par(chk('Absence d’un jour', false, { size: 11 }), { spacing: { before: 6, after: 6 } }),
            par(chk('Début absence de plus d’1 jour', false, { size: 11 }), { spacing: { after: 6 } }),
            par(chk('Reprise après absence de plus d’1 jour', false, { size: 11 }), { spacing: { after: 6 } }),
          ], { w: 175, borders: noBorders, valign: VerticalAlign.TOP }),
          cell([
            par([run('Motif de l’absence ', { bold: true, size: 11 }), run('(Précisez : intitulé CAD + Code DI)', { size: 10 })], { spacing: { before: 6 } }),
            par([run('………………………………………………', { size: 10 })], { spacing: { before: 6 } }),
            par([run('………………………………………………', { size: 10 })], { spacing: { after: 6 } }),
          ], { w: 200, borders: noBorders, valign: VerticalAlign.TOP }),
          cell([
            par([run('Date de début ', { bold: true, size: 10 }), run('(JJ/MM/AAAA) :', { italics: true, size: 9 })], { spacing: { before: 6 } }),
            par([run('_ _ / _ _ / 20_ _', { size: 10 })], { spacing: { after: 6 } }),
            par([run('Date de fin ', { bold: true, size: 10 }), run('(JJ/MM/AAAA) :', { italics: true, size: 9 })], { spacing: { before: 4 } }),
            par([run('_ _ / _ _ / 20_ _', { size: 10 })], { spacing: { after: 6 } }),
          ], { w: 156, borders: noBorders, valign: VerticalAlign.TOP }),
        ]}),
      ]})], { span: 2, mt: 0, mb: 0, ml: 0, mr: 0 }),
    ]}),
  ], [264, 287]);
}

// ===== Observations =====
function observations(d) {
  return table([
    new TableRow({ children: [cell([par([run('Situation ancienne-nouvelle / Observations / Remarques complémentaires éventuelles : ', { bold: true, size: 12 }), run(d.observations || '', { size: 12 })], { spacing: { before: 20, after: 60 } })], {})] }),
  ], [CONTENT_PT]);
}

// ===== Page 2 : rappel ECOT/FASE =====
function rappelNum(d) {
  const e = d.etab || {};
  const ecot = (e.num_ecot || '').padEnd(10).slice(0, 10).split('');
  const fase = (e.num_fase || '').padEnd(5).slice(0, 5).split('');
  const miniCases = (arr, wEach) => new Table({ width: { size: arr.length * wEach * PT, type: WidthType.DXA }, columnWidths: arr.map(() => wEach * PT), borders: noBorders,
    rows: [new TableRow({ children: arr.map(ch => cell([par([run(ch.trim(), { size: 12, bold: true })], { align: AlignmentType.CENTER })], { w: wEach, borders: allBorders, mt: 3, mb: 3, ml: 2, mr: 2 })) })] });
  return table([new TableRow({ children: [
    cell([par([run('N° ECOT ', { bold: true, size: 12 }), run('(10 derniers chiffres) :', { size: 10 })]), miniCases(ecot, 15)], { w: 360 }),
    cell([par([run('N° FASE :', { bold: true, size: 12 })]), miniCases(fase, 15)], { w: 191 }),
  ]})], [360, 191]);
}

// ===== Page 2 : Attributions actuelles / précédent =====
function attributionsResume(d) {
  const r = d.resume || {};
  const head = (t) => cell([par([run(t, { bold: true, size: 12 })], { align: AlignmentType.CENTER, spacing: { before: 6, after: 6 } })], { fill: BANDBLUE });
  const ligne = (o = {}) => new TableRow({ children: [
    cell([par(o.cla1 || '', { align: AlignmentType.CENTER, size: 12 })], {}), cell([par(o.tc1 || '', { align: AlignmentType.CENTER, size: 12 })], {}), cell([par(o.per1 || '', { align: AlignmentType.CENTER, size: 12 })], {}),
    cell([par(o.cla2 || '', { align: AlignmentType.CENTER, size: 12 })], {}), cell([par(o.tc2 || '', { align: AlignmentType.CENTER, size: 12 })], {}), cell([par(o.per2 || '', { align: AlignmentType.CENTER, size: 12 })], {}),
  ]});
  return table([
    new TableRow({ children: [
      cell([par([run('Attributions actuelles', { bold: true, size: 13 })], { align: AlignmentType.CENTER, spacing: { before: 6, after: 6 } })], { fill: BANDBLUE, span: 3 }),
      cell([par([run('Attributions du PS12 précédent : ', { bold: true, size: 12 }), run(r.date_prec || '__/__/20__', { size: 11 })], { align: AlignmentType.CENTER, spacing: { before: 6, after: 6 } })], { fill: BANDBLUE, span: 3 }),
    ]}),
    new TableRow({ children: [head('Classification'), head('TC / TL'), head('Périodes'), head('Classification'), head('TC / TL'), head('Périodes')] }),
    ...(r.lignes && r.lignes.length ? r.lignes.map(ligne) : [ligne(), ligne(), ligne()]),
  ], [110, 75, 90, 110, 75, 91]);
}

// ===== Page 2 : Origine de l'événement (remplacements) =====
function origineEvenement() {
  const ligneRemp = (n) => new TableRow({ children: [
    cell([par([run(String(n), { bold: true, size: 12 })], { align: AlignmentType.CENTER })], { w: 20, valign: VerticalAlign.TOP }),
    cell([
      par([run('N° Mat : ', { bold: true, size: 11 }), run('_ _ _ _ _ _ _ _ _ _ _   ', { size: 11 }), run('Nom, prénom : ', { bold: true, size: 11 }), run('………………………………………………………   ', { size: 10 }), run(CHK + ' D  ' + CHK + ' T', { size: 11 })], { spacing: { before: 10 } }),
      par([run('Motif de remplacement : ', { bold: true, size: 11 }), run('………………………………………………………………………………', { size: 10 })], { spacing: { before: 6 } }),
      par([run('Période ', { bold: true, size: 11 }), run('(JJ/MM/AAAA) : du _ _ /_ _ /20_ _ au _ _ /_ _ /20_ _', { size: 10 })], { spacing: { before: 6, after: 10 } }),
    ], { w: 531 }),
  ]});
  return [
    par([run('Origine de l’événement ', { bold: true, size: 14 }), run('(OE)', { bold: true, size: 11, color: 'FFFFFF' })], { spacing: { before: 80, after: 20 } }),
    par([run('*Si vous avez coché « remplacement » ', { bold: true, size: 11, color: '1F4E79' }), run('dans le cadre ', { size: 10 }), run('« justification(s) »', { italics: true, size: 10 }), run(', indiquez les ', { size: 10 }), run('coordonnées du/des MDP remplacé(s) :', { bold: true, size: 10 })], { spacing: { after: 20 } }),
    table([ligneRemp(1), ligneRemp(2), ligneRemp(3), ligneRemp(4)], [20, 531]),
  ];
}

// ===== Page 2 : Signatures =====
function signatures(d) {
  return table([
    new TableRow({ children: [
      cell([par([run('Le PO ou son délégué demande l\'octroi ou l\'ajustement du traitement/de la subvention-traitement du MDP, sur la base du présent Doc12. Il s\'engage à rembourser soit la totalité des rémunérations si la fonction du MDP ne respecte pas les conditions réglementaires, soit la différence entre le montant liquidé et la rémunération proméritée. Si ce Doc12 concerne un MDP temporaire, il est valable jusqu\'à la fin de l\'année scolaire en cours, au plus tard. ', { size: 10 }), run('La transmission de ce document par GEDI-PRO ou une application locale ne requiert plus les signatures ni du membre du personnel, ni, grâce à l’authentification via l’application, du chef d’établissement et/ou du Pouvoir Organisateur.', { bold: true, italics: true, size: 10 })], { spacing: { before: 20, after: 20 } })], { w: 300, valign: VerticalAlign.TOP }),
      cell([
        par([run('SIGNATURES OPTIONNELLES', { bold: true, size: 12 })], { align: AlignmentType.CENTER, spacing: { before: 10, after: 10 } }),
        new Table({ width: { size: 245 * PT, type: WidthType.DXA }, columnWidths: [122 * PT, 123 * PT], borders: { ...allBorders }, rows: [
          new TableRow({ children: [
            cell([par([run('Le membre du personnel (MDP)', { bold: true, size: 11 })], { align: AlignmentType.CENTER })], { w: 122, fill: BANDBLUE }),
            cell([par([run('Le Pouvoir Organisateur (ou son délégué)', { bold: true, size: 11 })], { align: AlignmentType.CENTER })], { w: 123, fill: BANDBLUE }),
          ]}),
          new TableRow({ children: [
            cell([par([run('NOM : ', { size: 11 }), run(d.prof_nom || '', { size: 11 })]), par([run('Prénom : ', { size: 11 }), run(d.prof_prenom || '', { size: 11 })]), par([run('Date : __/__/20__', { size: 11 })]), par([run('Signature :', { size: 11 })], { spacing: { after: 60 } })], { w: 122, valign: VerticalAlign.TOP }),
            cell([par([run('Nom, Prénom : ', { size: 11 })]), par([run('Qualité : ', { size: 11 })]), par([run('Date : __/__/20__', { size: 11 })]), par([run('Signature :', { size: 11 })], { spacing: { after: 60 } })], { w: 123, valign: VerticalAlign.TOP }),
          ]}),
        ]}),
      ], { w: 251, valign: VerticalAlign.TOP }),
    ]}),
  ], [300, 251]);
}

export { cumul, evenement, observations, rappelNum, attributionsResume, origineEvenement, signatures };
