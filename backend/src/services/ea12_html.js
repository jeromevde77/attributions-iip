/**
 * ea12_html.js — Génération du formulaire EA12 en HTML pur, prêt pour window.print().
 * Reproduit fidèlement la mise en page officielle FWB (Annexe 1 bis PS, 2 pages A4).
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Logo FWB en base64 (embarqué pour que la fenêtre d'impression soit autonome)
let LOGO_FWB = '';
try {
  const buf = readFileSync(resolve(__dirname, 'ea12-assets/logo_fwb.png'));
  LOGO_FWB = 'data:image/png;base64,' + buf.toString('base64');
} catch { /* si absent, on laisse vide */ }

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Affiche une valeur en cases individuelles (ECOT, FASE, Matricule). */
function boxes(val, count) {
  const chars = String(val || '').replace(/\s/g, '').split('').slice(0, count);
  while (chars.length < count) chars.push('');
  return chars.map(c =>
    `<span class="box">${c}</span>`
  ).join('');
}

/** Année académique "2025-2026" → cases 20|_|_|/20|_|_ */
function anneeBoxes(annee) {
  const m = String(annee || '').match(/(\d{4})[-/](\d{4})/);
  const y1 = m ? m[1].slice(-2) : '__';
  const y2 = m ? m[2].slice(-2) : '__';
  const b = c => `<span class="box">${c}</span>`;
  return `20${b(y1[0]||'')}${b(y1[1]||'')} / 20${b(y2[0]||'')}${b(y2[1]||'')}`;
}

/** Case à cocher HTML interactive avec label optionnel. */
function chk(checked, label = '') {
  const c = checked ? ' checked' : '';
  return `<label class="chk"><input type="checkbox"${c}>${label ? `&nbsp;${label}` : ''}</label>`;
}

/** Date JJ/MM/AAAA ou champ vide. */
function dateFr(val) {
  if (!val) return '__ / __ / 20__';
  // Déjà au format JJ/MM/AAAA
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) return val;
  // Format ISO AAAA-MM-JJ
  const m = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : val;
}

/** Ligne de tableau vide (pour les zones à remplir à la main). */
function emptyRow(cols) {
  return `<tr>${Array(cols).fill('<td>&nbsp;</td>').join('')}</tr>`;
}

// ─── Générateur principal ─────────────────────────────────────────────────────

export function buildEA12Html(data) {
  const { etab = {}, attributions = [] } = data;

  // Statuts
  const STATUTS = ['T', 'TPr', 'St', 'D', 'ACS', 'APE', 'PTP'];
  const statut = String(data.statut || '');

  // Type PO / sous-type
  const isWBE      = etab.type_po === 'wbe';
  const isSubv     = etab.type_po === 'subventionne' || (!isWBE);
  const isOfficiel = etab.sous_type === 'officiel';
  const isLibre    = etab.sous_type === 'libre' || (!isOfficiel && !isWBE);

  // Types d'événement (Mouvement)
  const TYPES_EV = [
    'Entrée en fonction', 'Rentrée en fonction', 'Maintien d'attributions',
    'Augmentation d'attributions', 'Prolongation d'attributions', 'Réduction d'attributions',
    'Fin de fonctions (dernier jour presté)',
    'Nomination ou engagement à titre définitif',
    'Extension nomination/engagement à titre définitif',
    'Passerelle / Changement d'affectation / Mutation', 'Autres (mouvement)',
  ];
  // Justifications
  const JUSTIFS = [
    'Création d'emploi', 'Remplacement', 'Changement d'affectation',
    'Modification d'organisation interne', 'Congé / Absence / Disponibilité',
    'Perte partielle de charge', 'DPPR', 'Suppression d'emploi',
    'Fin de remplacement', 'Démission', 'Mise à la retraite', 'Décès', 'Autres (justif.)',
  ];

  const typeEv  = data.type_evenement || '';
  const justif  = data.justif || '';

  // Lignes d'attributions (min 8 lignes)
  const attrRows = [...attributions];
  while (attrRows.length < 8) attrRows.push(null);

  const css = `
    @page { size: A4 portrait; margin: 8mm; }
    *  { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 7.5pt; margin: 0; padding: 0; color: #000; }
    @media screen { body { padding: 8mm; max-width: 210mm; margin: 0 auto; background:#f0f0f0; }
                    .page { background:#fff; padding: 8mm; margin-bottom:8mm; box-shadow:0 2px 8px rgba(0,0,0,.2); } }
    @media print  { .no-print { display:none !important; } .page { margin:0; padding:0; } }
    table { border-collapse: collapse; width: 100%; table-layout: fixed; }
    td, th { border: 1px solid #555; padding: 2px 3px; vertical-align: top; font-size: 7.5pt; word-break: break-word; }
    .hdr-dark  { background: #1F3864; color: #fff; font-weight: bold; text-align: center; font-size: 8.5pt; padding: 3px; }
    .hdr-light { background: #BDD7EE; font-weight: bold; text-align: center; font-size: 8pt; padding: 2px; }
    .hdr-mid   { background: #D6DCE4; font-weight: bold; text-align: center; font-size: 8pt; padding: 2px; }
    .bold { font-weight: bold; }
    .center { text-align: center; }
    .box { display:inline-block; width:13px; height:15px; border:1px solid #444; text-align:center;
           line-height:15px; margin:0 0.5px; font-size:8pt; }
    .chk { display:inline-flex; align-items:center; gap:2px; margin:1px 4px 1px 0; font-size:7.5pt; white-space:nowrap; cursor:pointer; }
    .chk input { width:11px; height:11px; margin:0; accent-color:#1F3864; }
    .chk-block { display:flex; flex-direction:column; gap:2px; }
    .page-break { break-after: page; page-break-after: always; }
    .title-bar td { background:#1F3864; color:#fff; font-weight:bold; text-align:center; font-size:10pt; padding:5px; }
    .sig-area { min-height: 30mm; }
    .no-border td, .no-border th { border:none; }
    .attr-head th { background:#1F3864; color:#fff; font-size:7pt; text-align:center; padding:2px; }
    input[type=checkbox] { cursor:pointer; }
  `;

  const btnPrint = `
    <div class="no-print" style="margin-bottom:8mm;display:flex;gap:8px;justify-content:flex-end">
      <button onclick="window.print()"
        style="padding:8px 20px;background:#1F3864;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold">
        🖨 Imprimer / Enregistrer en PDF
      </button>
      <button onclick="window.close()"
        style="padding:8px 16px;background:#666;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px">
        ✕ Fermer
      </button>
    </div>`;

  // ── PAGE 1 ──────────────────────────────────────────────────────────────────
  const page1 = `
<div class="page">
${btnPrint}

<!-- En-tête -->
<table style="margin-bottom:3px">
  <tr style="border:none">
    <td style="border:none;width:40%;vertical-align:middle">
      ${LOGO_FWB ? `<img src="${LOGO_FWB}" style="height:20mm;max-width:100%" alt="Logo FWB">` : '<b>Fédération Wallonie-Bruxelles</b>'}
    </td>
    <td style="border:none;width:35%;vertical-align:top;font-size:7.5pt;line-height:1.4">
      <b>Administration générale de l'Enseignement</b><br>
      Direction générale des Personnels de l'Enseignement
    </td>
    <td style="border:1px solid #555;width:25%;padding:3px;vertical-align:top;font-size:7.5pt">
      <b>Année académique</b> : ${anneeBoxes(data.annee)}<br>
      <b>Document n°</b> : ${boxes(data.doc_num, 2)}<br>
      <span style="font-size:7pt">Dernier Doc12 transmis le :</span><br>
      <span style="font-size:7pt">${dateFr(data.dernier_doc12)}</span>
    </td>
  </tr>
</table>

<!-- Titre -->
<table style="margin-bottom:3px">
  <tr class="title-bar"><td>EA12 - Enseignement pour Adultes - SUPÉRIEUR – Demande de mise en liquidation</td></tr>
</table>

<!-- Section établissement -->
<table style="margin-bottom:3px">
  <tr><td colspan="2" class="hdr-mid">Identification de l'établissement</td></tr>
  <tr>
    <td style="width:35%"><b>Niveau : ENSEIGNEMENT POUR ADULTES (20)</b></td>
    <td style="width:25%">${chk(isWBE)} <b>Organisé WBE (33)</b></td>
    <td style="width:40%">
      ${chk(isSubv)} <b>Subventionné par la FWB (22)</b><br>
      ${chk(isOfficiel)} Officiel &nbsp; ${chk(isLibre)} Libre
    </td>
  </tr>
  <tr>
    <td colspan="2"><b>N° ECOT (10 derniers chiffres) :</b> ${boxes(etab.num_ecot, 10)}</td>
    <td><b>N° FASE :</b> ${boxes(etab.num_fase, 6)}</td>
  </tr>
  <tr>
    <td rowspan="5" style="width:35%;vertical-align:top">
      <table style="border:none">
        <tr class="no-border"><td style="border:none;white-space:nowrap"><b>Nom du PO</b></td><td style="border:none">${etab.po_nom || ''}</td></tr>
        <tr class="no-border"><td style="border:none;white-space:nowrap"><b>Nom de l'établissement</b></td><td style="border:none">${etab.etab_nom || ''}</td></tr>
        <tr class="no-border"><td style="border:none;white-space:nowrap"><b>Adresse complète</b></td><td style="border:none">${etab.adresse || ''}</td></tr>
        <tr class="no-border"><td style="border:none;white-space:nowrap"><b>E-mails officiels</b></td>
          <td style="border:none">ec ${etab.email_ec ? `<b>${etab.email_ec}</b>` : '@ adm.cfwb.be'}<br>po ${etab.email_po ? `<b>${etab.email_po}</b>` : '@ adm.cfwb.be'}</td></tr>
      </table>
    </td>
    <td colspan="2" rowspan="5" style="vertical-align:top">
      <table style="border:none">
        <tr class="no-border"><td colspan="2" style="border:none"><b>Gestionnaire du dossier</b><br><i style="font-size:6.5pt">(joignable facilement par l'Administration)</i></td></tr>
        <tr class="no-border"><td style="border:none;white-space:nowrap">Nom :</td><td style="border:none">${etab.gest_nom || ''}</td></tr>
        <tr class="no-border"><td style="border:none;white-space:nowrap">Prénom :</td><td style="border:none">${etab.gest_prenom || ''}</td></tr>
        <tr class="no-border"><td style="border:none;white-space:nowrap">Qualité :</td><td style="border:none">${etab.gest_qualite || ''}</td></tr>
        <tr class="no-border"><td style="border:none;white-space:nowrap">Tél. direct :</td><td style="border:none">${etab.gest_tel || ''}</td></tr>
        <tr class="no-border"><td style="border:none;white-space:nowrap">E-mail :</td><td style="border:none">${etab.gest_email || ''}</td></tr>
      </table>
    </td>
  </tr>
  <tr><td style="height:6px;border:none"></td></tr>
  <tr><td style="border:none"></td></tr>
  <tr><td style="border:none"></td></tr>
  <tr><td style="border:none"></td></tr>
</table>

<!-- Section MDP -->
<table style="margin-bottom:3px">
  <tr><td colspan="3" class="hdr-mid">Identification du membre du personnel (MDP)</td></tr>
  <tr>
    <td style="width:28%;vertical-align:top">
      <b>Matricule enseignant</b><br>
      <div style="margin:4px 0">${boxes(data.matricule, 11)}</div>
      <br><b>NOM :</b> ${data.prof_nom || ''}<br>
      <b>Prénom :</b> ${data.prof_prenom || ''}
    </td>
    <td style="width:48%;vertical-align:top">
      <b>Titres de capacités</b><br>
      <span style="font-size:6.5pt">(une copie de chacun d'eux doit être en possession de la Direction de gestion)</span><br><br>
      1) ${data.titre1 || '&nbsp;'}<br>
      2) ${data.titre2 || '&nbsp;'}<br>
      ${chk(false)} <span style="font-size:7pt">Dérogation de titre requis par l'AR du 22/4/1969 telle que prévue par l'alinéa 2 de art 17§4 de la Loi du 7/7/1970.</span>
    </td>
    <td style="width:24%;vertical-align:top">
      <b>Statut</b><br>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px;margin-top:3px">
        ${chk(statut==='T',   'T')}&nbsp;&nbsp;${chk(statut==='ACS', 'ACS')}<br>
        ${chk(statut==='TPr', 'TPr')}&nbsp;${chk(statut==='APE', 'APE')}<br>
        ${chk(statut==='St',  'St')}&nbsp;&nbsp;${chk(statut==='PTP', 'PTP')}<br>
        ${chk(statut==='D',   'D')}
      </div>
    </td>
  </tr>
</table>

<!-- Section Cumul / Transmission tardive -->
<table style="margin-bottom:3px">
  <tr>
    <td style="width:50%;vertical-align:top">
      <b>Cumul</b><br>
      ${chk(data.pas_cumul)} Pas de cumul interne<br>
      <b>Prestations dans cet établissement :</b><br>
      ${chk(data.prest_sec)} Secondaire &nbsp;
      ${chk(data.prest_sup ?? true)} Supérieur &nbsp;
      ${chk(data.prest_exp)} Expert &nbsp;
      ${chk(false)} ACS/APE/PTP<br>
      <b>Prestations dans un autre établissement :</b><br>
      ${chk(false)} Cumul interne A2 (enseignement organisé ou subventionné par la FWB)
    </td>
    <td style="width:50%;vertical-align:top">
      <b>Transmission tardive du document par la faute du MDP</b><br>
      ${chk(false)} En application de la Circulaire 6930 du 10/01/2019 : <i>« FICHES FISCALES : Déclarations du paiement des arriérés - Responsabilités et incidences fiscales »</i><br><br>
      <b>Nombre de jours de fonctionnement/semaine :</b>
      ${chk(data.jours==4,'4')} ${chk(data.jours==5,'5')} ${chk(data.jours==6,'6')}
    </td>
  </tr>
</table>

<!-- Section Événement -->
<table style="margin-bottom:3px">
  <tr><td colspan="2" class="hdr-mid">Événement</td></tr>
  <tr>
    <td style="width:50%"><b>Date de l'événement (JJ/MM/AAAA) :</b> ${dateFr(data.date_evenement)}</td>
    <td style="width:50%"><b>Semaines de fonctionnement :</b> ${data.semaines || ''}</td>
  </tr>
  <tr>
    <td style="vertical-align:top">
      <b>Type d'événement — Mouvement</b>
      <div class="chk-block" style="margin-top:3px">
        ${['Entrée en fonction','Rentrée en fonction','Maintien d'attributions',
           'Augmentation d'attributions','Prolongation d'attributions','Réduction d'attributions',
           'Fin de fonctions (dernier jour presté)']
          .map(t => chk(typeEv===t, t)).join('')}
        <div style="border-top:1px solid #aaa;margin:3px 0;padding-top:3px">
        ${['Nomination ou engagement à titre définitif',
           'Extension nomination/engagement à titre définitif',
           'Passerelle / Changement d'affectation / Mutation',
           'Autres (à préciser) :']
          .map(t => chk(typeEv===t, t)).join('')}
        <input type="text" style="width:90%;border:none;border-bottom:1px solid #333;font-size:7pt;margin-left:16px" placeholder="">
        </div>
      </div>
    </td>
    <td style="vertical-align:top">
      <b>Justification(s)</b>
      <div class="chk-block" style="margin-top:3px">
        ${['Création d'emploi','Remplacement','Changement d'affectation',
           'Modification d'organisation interne','Congé / Absence / Disponibilité',
           'Perte partielle de charge','DPPR','Suppression d'emploi',
           'Fin de remplacement','Démission','Mise à la retraite','Décès',
           'Autres (à préciser) :']
          .map(j => chk(justif===j, j)).join('')}
        <input type="text" style="width:90%;border:none;border-bottom:1px solid #333;font-size:7pt;margin-left:16px" placeholder="">
      </div>
      <div style="margin-top:6px">
        <b>Absence</b>
        <div class="chk-block" style="margin-top:2px">
          ${chk(false,'Absence d'un jour')}
          ${chk(false,'Début absence de plus d'1 jour')}
          ${chk(false,'Reprise après absence de plus d'1 jour')}
        </div>
        <div style="font-size:7pt;margin-top:2px">
          Motif de l'absence (Précisez : intitulé CAD + Code DI)<br>
          <input type="text" style="width:100%;border:none;border-bottom:1px solid #333;font-size:7pt"><br>
          Date de début : __ / __ / 20__ &nbsp; Date de fin : __ / __ / 20__
        </div>
      </div>
    </td>
  </tr>
</table>

<!-- Observations -->
<table>
  <tr>
    <td>
      <b>Situation ancienne-nouvelle / Observations / Remarques complémentaires éventuelles :</b><br>
      <div style="min-height:14mm;padding:2px">${data.observations || '&nbsp;'}</div>
    </td>
  </tr>
</table>

<div style="margin-top:4px;text-align:center;font-size:6.5pt;color:#555">
  <b>Annexe 1 bis PS</b> - A envoyer à la Direction de gestion &nbsp;&nbsp;&nbsp; Page 1 | 2
</div>
</div>
<!-- FIN PAGE 1 -->`;

  // ── PAGE 2 ──────────────────────────────────────────────────────────────────
  const attrRowsHtml = attrRows.map(a => {
    if (!a) return `<tr>${['','','','','','','','','','','','',''].map(() => '<td>&nbsp;</td>').join('')}</tr>`;
    return `<tr>
      <td class="center">${a.ue || ''}</td>
      <td class="center">${a.f || ''}</td>
      <td>${a.denomination || ''}</td>
      <td class="center">${a.cla || ''}</td>
      <td class="center">${a.periode_occ || ''}</td>
      <td class="center">${a.tctl || ''}</td>
      <td class="center">${a.nb_periodes || ''}</td>
      <td>${a.titre || ''}</td>
      <td class="center">${a.sit_adm || ''}</td>
      <td class="center">${a.di || ''}</td>
      <td class="center">${a.oe || ''}</td>
      <td class="center">${a.tctl || ''}</td>
      <td class="center">${a.nb_periodes || ''}</td>
      <td class="center"></td>
      <td class="center"></td>
    </tr>`;
  }).join('');

  const page2 = `
<div class="page">

<!-- Répétition ECOT / FASE en haut de page 2 -->
<table style="margin-bottom:4px">
  <tr>
    <td style="width:55%"><b>N° ECOT (10 derniers chiffres) :</b> ${boxes(etab.num_ecot, 10)}</td>
    <td style="width:45%"><b>N° FASE :</b> ${boxes(etab.num_fase, 6)}</td>
  </tr>
</table>

<!-- Table des attributions -->
<table style="margin-bottom:4px;font-size:7pt">
  <thead class="attr-head">
    <tr>
      <th rowspan="2" style="width:5%">U.E.</th>
      <th rowspan="2" style="width:3%">F</th>
      <th rowspan="2" style="width:22%">Dénomination du Cours</th>
      <th rowspan="2" style="width:4%">CLA</th>
      <th rowspan="2" style="width:8%">Périodes d'occupation</th>
      <th rowspan="2" style="width:5%">TC / TL</th>
      <th rowspan="2" style="width:7%">Nb de périodes</th>
      <th rowspan="2" style="width:8%">Titre</th>
      <th rowspan="2" style="width:5%">Sit. adm.</th>
      <th rowspan="2" style="width:4%">DI</th>
      <th rowspan="2" style="width:4%">N° OE*</th>
      <th colspan="2" style="width:18%">Attributions actuelles</th>
      <th colspan="2" style="width:15%">Attrib. PS12 précédent</th>
    </tr>
    <tr>
      <th>Class. TC/TL</th><th>Périodes</th>
      <th>Class. TC/TL</th><th>Périodes</th>
    </tr>
  </thead>
  <tbody>
    ${attrRowsHtml}
  </tbody>
</table>

<!-- Origine de l'événement -->
<table style="margin-bottom:4px;font-size:7pt">
  <tr><td colspan="5" class="hdr-mid" style="font-size:7.5pt">Origine de l'événement (OE)</td></tr>
  <tr><td colspan="5" style="font-size:7pt;padding:2px 4px">
    *Si vous avez coché « remplacement » dans le cadre « justification(s) », indiquez les coordonnées du/des MDP remplacé(s) :
  </td></tr>
  ${[1,2,3,4].map(i => `
  <tr>
    <td style="width:4%;text-align:center">${i}</td>
    <td style="width:28%">N° Mat : <span class="box"></span><span class="box"></span><span class="box"></span><span class="box"></span><span class="box"></span><span class="box"></span><span class="box"></span><span class="box"></span><span class="box"></span><span class="box"></span><span class="box"></span></td>
    <td style="width:46%">Nom, prénom : &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</td>
    <td style="width:10%">${chk(false,'D')} ${chk(false,'T')}</td>
    <td style="width:12%">&nbsp;</td>
  </tr>
  <tr>
    <td></td>
    <td colspan="2" style="font-size:6.5pt">Motif de remplacement : &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</td>
    <td colspan="2" style="font-size:6.5pt">Période : du __ /__ /20__ au __ /__ /20__</td>
  </tr>`).join('')}
</table>

<!-- Déclaration PO -->
<table style="margin-bottom:4px">
  <tr>
    <td style="font-size:7pt;padding:4px">
      Le PO ou son délégué demande l'octroi ou l'ajustement du traitement/de la subvention-traitement du MDP, sur la base du
      présent Doc12. Il s'engage à rembourser soit la totalité des rémunérations si la fonction du MDP ne respecte pas les
      conditions réglementaires, soit la différence entre le montant liquidé et la rémunération proméritée.<br><br>
      Si ce Doc12 concerne un MDP temporaire, il est valable jusqu'à la fin de l'année scolaire en cours, au plus tard.<br><br>
      La transmission de ce document par GEDI-PRO ou une application locale
      <b>ne requiert plus les signatures</b> ni du membre du personnel, ni, grâce à l'authentification via
      l'application, du chef d'établissement et/ou du Pouvoir Organisateur.
    </td>
  </tr>
</table>

<!-- Signatures optionnelles -->
<table>
  <tr><td colspan="2" class="hdr-mid">SIGNATURES OPTIONNELLES</td></tr>
  <tr>
    <td style="width:50%;vertical-align:top">
      <b>Le membre du personnel (MDP)</b><br><br>
      NOM : ……………………………<br>
      Prénom : ……………………………<br>
      Date : __ / __ / 20__<br>
      <div class="sig-area"></div>
    </td>
    <td style="width:50%;vertical-align:top">
      <b>Le Pouvoir Organisateur (ou son délégué)</b><br><br>
      NOM : ……………………………<br>
      Prénom : ……………………………<br>
      Qualité : ……………………………<br>
      Date : __ / __ / 20__<br>
      <div class="sig-area"></div>
    </td>
  </tr>
</table>

<div style="margin-top:4px;text-align:center;font-size:6.5pt;color:#555">
  <b>Annexe 1 bis PS</b> - A envoyer à la Direction de gestion &nbsp;&nbsp;&nbsp; Page 2 | 2
</div>
</div>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>EA12 — ${data.prof_nom || ''} ${data.prof_prenom || ''} — ${data.annee || ''}</title>
  <style>${css}</style>
</head>
<body>
${page1}
<div class="page-break"></div>
${page2}
</body>
</html>`;
}
