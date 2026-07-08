/**
 * ea12_html.js — Génération du formulaire EA12 en HTML pur, prêt pour window.print().
 * Reproduit fidèlement la mise en page officielle FWB (Annexe 1 bis PS, 2 pages A4).
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let LOGO_FWB = '';
try {
  const buf = readFileSync(resolve(__dirname, 'ea12-assets/logo_fwb.png'));
  LOGO_FWB = 'data:image/png;base64,' + buf.toString('base64');
} catch { /* logo absent — on laisse vide */ }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function boxes(val, count) {
  const chars = String(val || '').replace(/\s/g, '').split('').slice(0, count);
  while (chars.length < count) chars.push('');
  return `<table class="boxgrid"><tr>${chars.map(c => `<td>${c}</td>`).join('')}</tr></table>`;
}

function anneeBoxes(annee) {
  const m = String(annee || '').match(/(\d{4})[-/](\d{4})/);
  const y1 = m ? m[1].slice(-2) : '__';
  const y2 = m ? m[2].slice(-2) : '__';
  const grp = (deux) => `<table class="boxgrid nodiv" style="display:inline-table"><tr><td>2</td><td>0</td><td>${deux[0]||''}</td><td>${deux[1]||''}</td></tr></table>`;
  return `${grp(y1)}&nbsp;/&nbsp;${grp(y2)}`;
}

function chk(checked, label) {
  const c = checked ? ' checked' : '';
  const lbl = label ? `&nbsp;${label}` : '';
  return `<label class="chk"><input type="checkbox"${c}>${lbl}</label>`;
}

function dateFr(val) {
  if (!val) return '__ / __ / 20__';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) return val;
  const m = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : val;
}

// ─── Constantes formulaire ─────────────────────────────────────────────────────

const MOUVEMENTS = [
  "Entr\u00e9e en fonction",
  "Rentr\u00e9e en fonction",
  "Maintien d\u2019attributions",
  "Augmentation d\u2019attributions",
  "Prolongation d\u2019attributions",
  "R\u00e9duction d\u2019attributions",
  "Fin de fonctions (dernier jour prest\u00e9)",
];
const MOUVEMENTS2 = [
  "Nomination ou engagement \u00e0 titre d\u00e9finitif",
  "Extension nomination/engagement \u00e0 titre d\u00e9finitif",
  "Passerelle / Changement d\u2019affectation / Mutation",
  "Autres (mouvement \u2014 \u00e0 pr\u00e9ciser) :",
];
const JUSTIFS = [
  "Cr\u00e9ation d\u2019emploi",
  "Remplacement",
  "Changement d\u2019affectation",
  "Modification d\u2019organisation interne",
  "Cong\u00e9 / Absence / Disponibilit\u00e9",
  "Perte partielle de charge",
  "DPPR",
  "Suppression d\u2019emploi",
  "Fin de remplacement",
  "D\u00e9mission",
  "Mise \u00e0 la retraite",
  "D\u00e9c\u00e8s",
  "Autres (justif. \u2014 \u00e0 pr\u00e9ciser) :",
];

// ─── Générateur principal ──────────────────────────────────────────────────────

export function buildEA12Html(data) {
  const etab = data.etab || {};
  const attributions = data.attributions || [];
  const statut = String(data.statut || '');
  const typeEv = data.type_evenement || '';
  const justif = data.justif || '';

  const isWBE      = etab.type_po === 'wbe';
  const isSubv     = !isWBE;
  const isOfficiel = etab.sous_type === 'officiel';
  const isLibre    = !isOfficiel && !isWBE;

  const attrRows = [...attributions];
  while (attrRows.length < 8) attrRows.push(null);

  const css = `
    @page { size: A4 portrait; margin: 7mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 7.5pt; margin: 0; padding: 0; color: #000; }
    @media screen { body { padding: 8mm; max-width: 210mm; margin: 0 auto; background: #eee; }
                    .page { background: #fff; padding: 8mm; margin-bottom: 8mm; box-shadow: 0 2px 8px rgba(0,0,0,.2); } }
    @media print  { .no-print { display: none !important; } .page { margin: 0; padding: 0; } }
    table { border-collapse: collapse; width: 100%; }
    .p2 td, .p2 th { border: 1px solid #555; padding: 2px 3px; vertical-align: top; font-size: 7.5pt; word-break: break-word; background: #DEEAF6; }
    .p2 .nb td, .p2 .nb th, .p2 .attr-table td, .p2 .attr-table th, .p2 .sig-table td, .p2 .sig-table th { background: #fff; }
    .p2 .hdr-mid.hdr-mid { background: #9CC2E5; }
    .p2 .hdr-dark  { background: #2E74B5; color: #fff; font-weight: bold; text-align: center; font-size: 10pt; padding: 4px; }
    .p2 .hdr-mid   { background: #9CC2E5; font-weight: bold; text-align: center; font-size: 8pt; padding: 3px; }
    .p2 .hdr-attr  { background: #fff; color: #000; font-weight: bold; text-align: center; font-size: 7pt; padding: 2px; }
    .bold      { font-weight: bold; }
    .center    { text-align: center; }
    .p2 .box { display: inline-block; width: 13px; height: 15px; border: 1px solid #444;
           text-align: center; line-height: 15px; margin: 0 1.5px; font-size: 8pt; background: #fff; }
    .p2 .boxgrid { display: inline-table; border-collapse: collapse; width: auto; border: 1.5px solid #000; vertical-align: middle; }
    .p2 .boxgrid td { border: 1px solid #000; border-top: none; border-bottom: none; padding: 0;
                  width: 11px; height: 13px; min-width: 11px; text-align: center; vertical-align: middle;
                  font-size: 8pt; font-weight: bold; background: transparent; }
    .p2 .boxgrid td:first-child { border-left: none; }
    .p2 .boxgrid td:last-child { border-right: none; }
    .p2 .boxgrid.nodiv td { border: none; }
    .p2 .chk { display: inline-flex; align-items: center; gap: 3px; margin: 1px 5px 1px 0;
           font-size: 7.5pt; white-space: nowrap; cursor: pointer; }
    .p2 .chk input { -webkit-appearance: none; appearance: none; width: 9px; height: 9px; margin: 0;
                 border: 1.75px solid #000; background: #fff; position: relative; flex-shrink: 0; }
    .p2 .chk input:checked { background: #fff; }
    .p2 .chk input:checked::after { content: ''; position: absolute; left: 0.5px; top: 0.5px; right: 0.5px; bottom: 0.5px; background: #000; }
    .p2 .chk-col { display: flex; flex-direction: column; gap: 2px; }
    .p2 .nb { border: none; }
    .p2 .nb td, .p2 .nb th { border: none; padding: 1px 3px; }
    .page-break { break-after: page; page-break-after: always; }
    .p2 .sig-area { min-height: 25mm; }

    /* ── Page 1 : styles par bloc (maquettes validées) ── */
    .bloc-sep { height: 3mm; }
.k0 .boxgrid { display:inline-table; border-collapse:collapse; border:1.5px solid #000; vertical-align:middle; width:auto; }
.k0 .boxgrid td { border:none; border-right:1px solid #000; width:15px; height:24px; min-width:15px;
                  padding:0; text-align:center; vertical-align:middle; font-size:10pt; font-weight:bold; background:#fff; }
.k0 .boxgrid td:last-child { border-right:none; }
.k0 .boxgrid.nodiv td { border:none; }
.k1 table { border-collapse: collapse; width: 100%; }
.k1 td { padding: 3px 5px; vertical-align: top; }
.k1 .hdr { background:#9CC2E5; font-weight:bold; text-align:center; font-size:8pt; padding:3px; border:1.5px solid #000; }
.k1 .cellwhite { background:#fff; text-align:center; vertical-align:middle;
               border-left:1.5px solid #000; border-right:0.5px solid #555; border-bottom:1.5px solid #000; }
.k1 .cellwhite.last { border-right:1.5px solid #000; }
.k1 .cellblue { background:#DEEAF6; text-align:center;
              border-left:1.5px solid #000; border-right:0.5px solid #555; border-bottom:1.5px solid #000; }
.k1 .cellblue.last { border-right:1.5px solid #000; }
.k1 .boxgrid { display:inline-table; border-collapse:collapse; border:1.5px solid #000; vertical-align:middle; width:auto; }
.k1 .boxgrid td { border:none; border-right:1px solid #000; width:13px; height:15px; min-width:13px;
                padding:0; text-align:center; vertical-align:middle; font-size:8pt; font-weight:bold; background:transparent; }
.k1 .boxgrid td:last-child { border-right:none; }
.k1 .chk { display:inline-flex; align-items:center; gap:3px; margin-right:6px; }
.k1 .chk .sq { width:9px; height:9px; border:1.75px solid #000; display:inline-block; }
.k1 .chk .sq.on { background:#000; }
.k1 /* Bloc PO + Gestionnaire : UNE seule table à 4 colonnes, .k1 5 lignes partagées -> alignement garanti */
  .infoblock { border:1.5px solid #000; }
.k1 .infoblock td { border:0.75px solid #555; font-size:7pt; }
.k1 .infoblock td.lbl { background:#DEEAF6; font-weight:bold; white-space:nowrap; }
.k1 .infoblock td.val { background:#fff; }
.k1 .infoblock td.gestlbl { background:#DEEAF6; vertical-align:middle; text-align:left; }
.k2 table { border-collapse: collapse; width: 100%; }
.k2 td { padding: 4px 6px; vertical-align: top; }
.k2 .hdr { background:#9CC2E5; font-weight:bold; text-align:center; font-size:9pt; padding:4px; border:1.5px solid #000; }
.k2 .subhdr { background:#DEEAF6; font-weight:bold; text-align:center; font-size:8pt; }
.k2 .boxgrid { display:inline-table; border-collapse:collapse; border:1.5px solid #000; vertical-align:middle; width:auto; }
.k2 .boxgrid td { border:none; border-right:1px solid #000; width:16px; height:18px; min-width:16px;
                padding:0; text-align:center; vertical-align:middle; font-size:9pt; font-weight:bold; background:transparent; }
.k2 .boxgrid td:last-child { border-right:none; }
.k2 .chk { display:flex; align-items:center; gap:5px; margin:3px 0; }
.k2 .chk .sq { width:9px; height:9px; border:1.75px solid #000; display:inline-block; flex-shrink:0; }
.k2 .mdp { border:1.5px solid #000; }
.k2 .mdp td { border:0.75px solid #555; }
.k2 .matricule-cell { background:#DEEAF6; text-align:center; }
.k3 table { border-collapse: collapse; width: 100%; }
.k3 td { padding: 3px 6px; vertical-align: top; }
.k3 .b3 { border:1.5px solid #000; }
.k3 .b3 td { border:0.75px solid #555; }
.k3 .hdrmid { background:#9CC2E5; font-weight:bold; text-align:center; font-size:8pt; padding:3px; }
.k3 .chk { display:inline-flex; align-items:center; gap:4px; margin-right:8px; }
.k3 .chk .sq { width:9px; height:9px; border:1.75px solid #000; display:inline-block; flex-shrink:0; }
.k3 .chk .sq.on { background:#000; }
.k4 table { border-collapse: collapse; width: 100%; }
.k4 td { padding: 3px 6px; vertical-align: top; }
.k4 .b4 { border:1.5px solid #000; table-layout:fixed; }
.k4 .b4 td { border:0.75px solid #555; }
.k4 .hdrmid { background:#9CC2E5; font-weight:bold; text-align:center; font-size:8pt; padding:3px; }
.k4 .subhdr { background:#DEEAF6; font-weight:bold; font-size:7.5pt; text-align:center; }
.k4 .chk { display:flex; align-items:center; gap:4px; margin:2px 0; }
.k4 .chk .sq { width:9px; height:9px; border:1.75px solid #000; display:inline-block; flex-shrink:0; }
.k4 .chk .sq.on { background:#000; }
.k4 .vlabel { background:#DEEAF6; text-align:center; vertical-align:middle; padding:2px 0; }
.k4 .vlabel div { writing-mode:vertical-lr; transform:rotate(180deg); font-weight:bold; font-size:7pt; white-space:nowrap; margin:0 auto; }

    .p2 input[type=text] { border: none; border-bottom: 1px solid #555;
                       font-size: 7pt; font-family: Arial; width: 95%; background: transparent; }
  `;

  const btnPrint = `
    <div class="no-print" style="margin-bottom:8mm;display:flex;gap:8px;justify-content:flex-end">
      <button onclick="window.print()"
        style="padding:8px 20px;background:#1F3864;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold">
        &#128438; Imprimer / Enregistrer en PDF
      </button>
      <button onclick="window.close()"
        style="padding:8px 16px;background:#666;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px">
        &#10005; Fermer
      </button>
    </div>`;

  // ── PAGE 1 (structure validée bloc par bloc sur maquettes, juillet 2026) ────
  const y = String(data.annee || '').match(/(\d{4})[-/](\d{4})/);
  const y1 = y ? y[1].slice(-2) : '  ';
  const y2 = y ? y[2].slice(-2) : '  ';
  const anneeGrp = (yy) => `<table class="boxgrid" style="display:inline-table"><tr><td>2</td><td>0</td><td>${yy[0]||''}</td><td>${yy[1]||''}</td></tr></table>`;
  const grille = (val, n) => {
    const chars = String(val || '').replace(/\s/g, '').split('').slice(0, n);
    while (chars.length < n) chars.push('');
    return `<table class="boxgrid"><tr>${chars.map(c => `<td>${c}</td>`).join('')}</tr></table>`;
  };

  const page1 = `
<div class="page">
${btnPrint}
<div class="k0">
<table style="border:none;border-collapse:collapse;width:100%">
  <tr>
    <td style="border:none;width:68%;vertical-align:top;padding:0">
      <img src="${LOGO_FWB}" style="height:9.5mm;width:auto;display:block" alt="Fédération Wallonie-Bruxelles">
      <div style="margin-top:3mm;font-size:8pt;line-height:1.5">
        <b>Administration générale de l'Enseignement</b><br>
        Direction générale des Personnels de l'Enseignement
      </div>
    </td>
    <td style="border:none;width:32%;vertical-align:top;padding:0;font-size:7.5pt">
      <div style="white-space:nowrap;display:flex;align-items:center;gap:5px">
        <b style="text-decoration:underline">Année<br>académique</b>
        ${anneeGrp(y1)}
        /
        ${anneeGrp(y2)}
      </div>
      <div style="white-space:nowrap;display:flex;align-items:center;gap:5px;margin-top:4px">
        <b style="text-decoration:underline">Document n°</b>
        ${grille(data.doc_num, 2)}
      </div>
      <div style="font-size:6.5pt;margin-top:4px;white-space:nowrap"><b>Dernier Doc12 transmis le :</b> ${dateFr(data.dernier_doc12)}</div>
    </td>
  </tr>
</table>
<div style="margin-top:3mm;border:2.5px solid #000;background:#2E74B5;color:#fff;text-align:center;padding:4px;font-size:11pt">
  <b>EA12</b> <span style="font-size:9pt">- Enseignement pour Adultes -</span> <b style="font-size:10.5pt">SUPERIEUR</b> <span style="font-size:9pt">– Demande de mise en liquidation</span>
</div>
</div>
<div class="bloc-sep"></div>
<div class="k1">
<table style="margin-bottom:0">
  <tr><td colspan="3" class="hdr">Identification de l'établissement</td></tr>
  <tr>
    <td class="cellwhite" style="width:34%"><b>Niveau : ENSEIGNEMENT POUR ADULTES (20)</b></td>
    <td class="cellwhite" style="width:25%"><span class="chk"><span class="sq${isWBE ? " on" : ""}"></span></span> <b>Organisé WBE (33)</b></td>
    <td class="cellwhite last" style="width:41%">
      <span class="chk"><span class="sq${isSubv ? " on" : ""}"></span></span> <b>Subventionné par la FWB (22)</b><br>
      <span class="chk"><span class="sq${isOfficiel ? " on" : ""}"></span></span> Officiel &nbsp;
      <span class="chk"><span class="sq${isLibre ? " on" : ""}"></span></span> Libre
    </td>
  </tr>
</table>

<table style="margin-bottom:0">
  <tr>
    <td class="cellblue" style="width:50%">
      <b>N° ECOT (10 derniers chiffres) :</b><br>
      <div style="margin-top:3px">${grille(etab.num_ecot, 10)}</div>
    </td>
    <td class="cellblue last" style="width:50%">
      <b>N° FASE :</b><br>
      <div style="margin-top:3px">${grille(etab.num_fase, 5)}</div>
    </td>
  </tr>
</table>

<table class="infoblock" style="margin-bottom:2mm">
  <tr>
    <td class="lbl" style="width:17%">Nom du PO</td>
    <td class="val" style="width:33%">${etab.po_nom || ''}</td>
    <td class="gestlbl" rowspan="5" style="width:19%"><b>Gestionnaire du dossier</b><div style="font-size:6.5pt;font-style:italic;margin-top:2px;font-weight:normal">(joignable facilement par l'Administration)</div></td>
    <td class="val" style="width:31%;border-left:1.5px solid #000">Nom : ${etab.gest_nom || ''}</td>
  </tr>
  <tr>
    <td class="lbl">Nom de l'établissement</td>
    <td class="val">${etab.etab_nom || ''}</td>
    <td class="val" style="border-left:1.5px solid #000">Prénom : ${etab.gest_prenom || ''}</td>
  </tr>
  <tr>
    <td class="lbl" style="vertical-align:top">Adresse complète</td>
    <td class="val" style="vertical-align:top">${(etab.adresse || '').replace(/,\s*/g, ',<br>')}</td>
    <td class="val" style="border-left:1.5px solid #000">Qualité : ${etab.gest_qualite || ''}</td>
  </tr>
  <tr>
    <td class="lbl" rowspan="2" style="vertical-align:top">E-mails officiels</td>
    <td class="val">ec ${etab.email_ec || '@ adm.cfwb.be'}</td>
    <td class="val" style="border-left:1.5px solid #000">Tél. direct : ${etab.gest_tel || ''}</td>
  </tr>
  <tr>
    <td class="val">po ${etab.email_po || '@ adm.cfwb.be'}</td>
    <td class="val" style="border-left:1.5px solid #000">E-mail : ${etab.gest_email || ''}</td>
  </tr>
</table>
</div>
<div class="bloc-sep"></div>
<div class="k2">
<table class="mdp">
  <tr><td colspan="3" class="hdr">Identification du membre du personnel (MDP)</td></tr>
  <tr>
    <td rowspan="2" class="matricule-cell" style="width:28%">
      <b style="font-size:8.5pt">Matricule enseignant</b>
      <div style="margin:8px 0">
        ${grille(data.matricule, 11)}</div>
      <div style="text-align:left;margin-top:14px">
        <b>NOM :</b> ${data.prof_nom || ''}<br><br>
        <b>Prénom :</b> ${data.prof_prenom || ''}
      </div>
    </td>
    <td class="subhdr" style="width:46%">
      Titres de capacités
      <div style="font-weight:normal;font-size:6.5pt;margin-top:2px">(une copie de chacun d'eux doit être en possession de la Direction de gestion)</div>
    </td>
    <td class="subhdr" style="width:26%">Statut</td>
  </tr>
  <tr>
    <td style="background:#fff">
      1) ${data.titre1 || ''}<br><br>
      2) ${data.titre2 || ''}<br><br>
      <span class="chk"><span class="sq${data.derogation_titre ? " on" : ""}"></span> <span>Dérogation de titre requis par l'AR du 22/4/1969 telle que prévue par l'alinéa 2 de art 17§4 de la Loi du 7/7/1970.</span></span>
    </td>
    <td style="background:linear-gradient(#555,#555) 50% 0/1px 100% no-repeat, #fff">
      <div style="display:flex;align-items:stretch;height:100%">
        <div style="flex:1;padding-right:8px">
          <div class="chk"><span class="sq${statut === "T" ? " on" : ""}"></span> T</div>
          <div class="chk"><span class="sq${statut === "TPr" ? " on" : ""}"></span> TPr</div>
          <div class="chk"><span class="sq${statut === "St" ? " on" : ""}"></span> St</div>
          <div class="chk"><span class="sq${statut === "D" ? " on" : ""}"></span> D</div>
        </div>
        <div style="flex:1;padding-left:8px">
          <div class="chk"><span class="sq${statut === "ACS" ? " on" : ""}"></span> ACS</div>
          <div class="chk"><span class="sq${statut === "APE" ? " on" : ""}"></span> APE</div>
          <div class="chk"><span class="sq${statut === "PTP" ? " on" : ""}"></span> PTP</div>
        </div>
      </div>
    </td>
  </tr>
</table>
</div>
<div class="bloc-sep"></div>
<div class="k3">
<table class="b3">
  <tr>
    <td class="hdrmid" style="width:50%">Cumul</td>
    <td class="hdrmid" style="width:50%">Transmission tardive du document par la faute du MDP</td>
  </tr>
  <tr>
    <td style="background:#fff">
      <span class="chk"><span class="sq${data.pas_cumul ? " on" : ""}"></span></span> <b>Pas de cumul interne</b>
    </td>
    <td rowspan="2" style="background:#fff;vertical-align:top">
      <span class="chk"><span class="sq${data.transmission_tardive ? " on" : ""}"></span></span> En application de la Circulaire 6930 du 10/01/2019 : <i>« FICHES FISCALES : Déclarations du paiement des arriérés - Responsabilités et incidences fiscales »</i>
    </td>
  </tr>
  <tr>
    <td style="background:#fff">
      <b>Prestations dans cet établissement</b> :<br>
      <span class="chk"><span class="sq${data.prest_sec ? " on" : ""}"></span></span> Secondaire
      <span class="chk"><span class="sq${(data.prest_sup ?? true) ? " on" : ""}"></span></span> Supérieur
      <span class="chk"><span class="sq${data.prest_exp ? " on" : ""}"></span></span> Expert
      <span class="chk"><span class="sq"></span></span> ACS/APE/PTP
    </td>
  </tr>
  <tr>
    <td style="background:#fff">
      <b>Prestations dans un autre établissement</b> :<br>
      <span class="chk"><span class="sq"></span></span> <b>Cumul interne A2</b> (enseignement organisé ou subventionné par la FWB)
    </td>
    <td style="background:#fff">
      <b>Nombre de jours de fonctionnement/semaine :</b>
      <span class="chk"><span class="sq${data.jours == 4 ? " on" : ""}"></span></span> 4
      <span class="chk"><span class="sq${data.jours == 5 ? " on" : ""}"></span></span> 5
      <span class="chk"><span class="sq${data.jours == 6 ? " on" : ""}"></span></span> 6
    </td>
  </tr>
</table>
</div>
<div class="bloc-sep"></div>
<div class="k4">
<table class="b4">
  <colgroup>
    <col style="width:0.55cm">
    <col style="width:26%">
    <col style="width:19%">
    <col style="width:22%">
    <col style="width:28%">
  </colgroup>

  <!-- Ligne 1 : titre -->
  <tr><td colspan="5" class="hdrmid">Événement</td></tr>

  <!-- Ligne 2 : date (bleu) + semaines (blanc), sans séparateur -->
  <tr>
    <td colspan="3" style="background:#DEEAF6;border-right:none">
      <b>Date de l'événement <i>(JJ/MM/AAAA)</i> :</b> &nbsp; ${dateFr(data.date_evenement)}
    </td>
    <td colspan="2" style="background:#fff;border-left:none">
      <b>Semaines de fonctionnement :</b> <span style="display:inline-block;border:1px solid #2E74B5;background:#fff;min-width:36px;padding:1px 4px;text-align:center">${data.semaines || ''}</span>
    </td>
  </tr>

  <!-- Ligne 3 : en-têtes -->
  <tr>
    <td colspan="3" class="subhdr">Type d'événement</td>
    <td colspan="2" class="subhdr">Justification(s)</td>
  </tr>

  <!-- Ligne 4 : Mouvement (vertical) + listes -->
  <tr>
    <td class="vlabel"><div>Mouvement</div></td>
    <td colspan="2" style="background:#fff">
      <div style="display:flex;gap:8px">
        <div style="flex:1">
          <div class="chk"><span class="sq${typeEv === "Entrée en fonction" ? " on" : ""}"></span> Entrée en fonction</div>
          <div class="chk"><span class="sq${typeEv === "Rentrée en fonction" ? " on" : ""}"></span> Rentrée en fonction</div>
          <div class="chk"><span class="sq${typeEv === "Maintien d'attributions" ? " on" : ""}"></span> Maintien d'attributions</div>
          <div class="chk"><span class="sq${typeEv === "Augmentation d'attributions" ? " on" : ""}"></span> Augmentation d'attributions</div>
          <div class="chk"><span class="sq${typeEv === "Prolongation d'attributions" ? " on" : ""}"></span> Prolongation d'attributions</div>
          <div class="chk"><span class="sq${typeEv === "Réduction d'attributions" ? " on" : ""}"></span> Réduction d'attributions</div>
          <div class="chk"><span class="sq${typeEv === "Fin de fonctions (dernier jour presté)" ? " on" : ""}"></span> Fin de fonctions (dernier jour presté)</div>
        </div>
        <div style="flex:1">
          <div class="chk"><span class="sq${typeEv === "Nomination ou engagement à titre définitif" ? " on" : ""}"></span> Nomination ou engagement à titre définitif</div>
          <div class="chk"><span class="sq${typeEv === "Extension nomination/engagement à titre définitif" ? " on" : ""}"></span> Extension nomination/engagement à titre définitif</div>
          <div class="chk"><span class="sq${typeEv === "Passerelle / Changement d'affectation / Mutation" ? " on" : ""}"></span> Passerelle / Changement d'affectation / Mutation</div>
          <div class="chk"><span class="sq${typeEv === "Autres" ? " on" : ""}"></span> Autres (à préciser) :</div>
          <div style="border-bottom:1px dotted #555;margin-left:14px;min-height:9px"></div>
          <div style="border-bottom:1px dotted #555;margin-left:14px;min-height:9px;margin-top:4px"></div>
        </div>
      </div>
    </td>
    <td colspan="2" style="background:#fff">
      <div style="display:flex;gap:8px">
        <div style="flex:1">
          <div class="chk"><span class="sq${(data.justifs || []).includes("Création d'emploi") ? " on" : ""}"></span> Création d'emploi</div>
          <div class="chk"><span class="sq${(data.justifs || []).includes("Remplacement") ? " on" : ""}"></span> Remplacement <span style="background:#0000d0;color:#fff;font-size:6.5pt;padding:0 2px">*Voir encadré à la page 2</span></div>
          <div class="chk"><span class="sq${(data.justifs || []).includes("Changement d'affectation") ? " on" : ""}"></span> Changement d'affectation</div>
          <div class="chk"><span class="sq${(data.justifs || []).includes("Modification d'organisation interne") ? " on" : ""}"></span> Modification d'organisation interne</div>
          <div class="chk"><span class="sq${(data.justifs || []).includes("Congé / Absence / Disponibilité") ? " on" : ""}"></span> Congé / Absence / Disponibilité</div>
          <div class="chk"><span class="sq${(data.justifs || []).includes("Perte partielle de charge") ? " on" : ""}"></span> Perte partielle de charge</div>
          <div class="chk"><span class="sq${(data.justifs || []).includes("DPPR") ? " on" : ""}"></span> DPPR</div>
        </div>
        <div style="flex:1">
          <div class="chk"><span class="sq${(data.justifs || []).includes("Suppression d'emploi") ? " on" : ""}"></span> Suppression d'emploi</div>
          <div class="chk"><span class="sq${(data.justifs || []).includes("Fin de remplacement") ? " on" : ""}"></span> Fin de remplacement</div>
          <div class="chk"><span class="sq${(data.justifs || []).includes("Démission") ? " on" : ""}"></span> Démission</div>
          <div class="chk"><span class="sq${(data.justifs || []).includes("Mise à la retraite") ? " on" : ""}"></span> Mise à la retraite</div>
          <div class="chk"><span class="sq${(data.justifs || []).includes("Décès") ? " on" : ""}"></span> Décès</div>
          <div class="chk"><span class="sq${(data.justifs || []).includes("Autres") ? " on" : ""}"></span> Autres (à préciser) :</div>
          <div style="border-bottom:1px dotted #555;margin-left:14px;min-height:9px"></div>
          <div style="border-bottom:1px dotted #555;margin-left:14px;min-height:9px;margin-top:4px"></div>
        </div>
      </div>
    </td>
  </tr>

  <!-- Ligne 5 : Absence (vertical) + cases + motif + dates -->
  <tr>
    <td class="vlabel"><div>Absence</div></td>
    <td style="background:#fff">
      <div class="chk"><span class="sq${data.type_absence === "Absence d'un jour" ? " on" : ""}"></span> Absence d'un jour</div>
      <div class="chk"><span class="sq${data.type_absence === "Début absence de plus d'1 jour" ? " on" : ""}"></span> Début absence de plus d'1 jour</div>
      <div class="chk"><span class="sq${data.type_absence === "Reprise après absence de plus d'1 jour" ? " on" : ""}"></span> Reprise après absence de plus d'1 jour</div>
    </td>
    <td colspan="2" style="background:#fff;border-right:none">
      <b><span style="background:#DEEAF6">Motif de l'absence</span> (Précisez : intitulé CAD + Code DI)</b>
      <div style="border-bottom:1px dotted #555;min-height:10px;margin-top:6px">${data.motif_absence || ''}</div>
      <div style="border-bottom:1px dotted #555;min-height:10px;margin-top:6px"></div>
    </td>
    <td style="background:#fff;border-left:none">
      <b><span style="background:#DEEAF6">Date de début</span></b> <i>(JJ/MM/AAAA)</i> : ${dateFr(data.date_debut_absence)}<br><br>
      <b><span style="background:#DEEAF6">Date de fin</span></b> <i>(JJ/MM/AAAA)</i> : &nbsp;&nbsp; ${dateFr(data.date_fin_absence)}
    </td>
  </tr>
</table>
</div>
<div class="bloc-sep"></div>
<div class="k5">
<table style="border:1.5px solid #000;border-collapse:collapse;width:100%">
  <tr>
    <td style="background:#fff;padding:4px 6px;border:none;font-size:7.5pt">
      <b style="text-decoration:underline">Situation ancienne-nouvelle / Observations / Remarques compl\u00e9mentaires \u00e9ventuelles :</b>
      <div style="min-height:14mm">${data.observations || ''}</div>
    </td>
  </tr>
</table>
</div>
<div style="margin-top:3mm;display:flex;justify-content:space-between;font-size:6.5pt;letter-spacing:2px">
  <span><b>A n n e x e &nbsp; 1 b i s &nbsp; P S</b> &nbsp; - &nbsp; <i style="letter-spacing:normal">A envoyer \u00e0 la Direction de gestion</i></span>
  <span style="letter-spacing:normal">P a g e &nbsp; 1 | 2</span>
</div>
</div>`;

  // ── PAGE 2 ─────────────────────────────────────────────────────────────────
  const attrHtml = attrRows.map(a => {
    if (!a) return `<tr>${Array(11).fill('<td>&nbsp;</td>').join('')}</tr>`;
    return `<tr>
      <td class="center" style="font-size:6.5pt">${a.ue||''}</td>
      <td class="center">${a.f||''}</td>
      <td>${a.denomination||''}</td>
      <td class="center">${a.cla||''}</td>
      <td class="center">${a.periode_occ||''}</td>
      <td class="center">${a.tctl||''}</td>
      <td class="center">${a.nb_periodes||''}</td>
      <td>${a.titre||''}</td>
      <td class="center">${a.sit_adm||''}</td>
      <td class="center">${a.di||''}</td>
      <td class="center">${a.oe||''}</td>
    </tr>`;
  }).join('');

  const oeSlots = (data.oe_slots && data.oe_slots.length ? data.oe_slots : [{},{},{},{}]).slice(0,4);
  const oeRows = oeSlots.map((slot, idx) => {
    const num = idx + 1;
    const hasData = slot.num_mat || slot.nom_prenom || slot.motif;
    const dateDebut = slot.date_debut ? dateFr(slot.date_debut) : '__ /__ /20__';
    const dateFin   = slot.date_fin   ? dateFr(slot.date_fin)   : '__ /__ /20__';
    return `
    <tr>
      <td class="center">${num}</td>
      <td>N\u00b0 Mat : ${hasData && slot.num_mat ? `<b>${slot.num_mat}</b>` : boxes('',11)}</td>
      <td colspan="2">Nom, pr\u00e9nom : ${slot.nom_prenom ? `<b>${slot.nom_prenom}</b>` : '&nbsp;'.repeat(30)}</td>
      <td>${chk(slot.type==='D','D')} ${chk(slot.type==='T','T')}</td>
    </tr>
    <tr>
      <td></td>
      <td colspan="2" style="font-size:6.5pt">Motif : ${slot.motif || '&nbsp;'.repeat(40)}</td>
      <td colspan="2" style="font-size:6.5pt">P\u00e9riode : du ${dateDebut} au ${dateFin}</td>
    </tr>`;
  }).join('');

  const page2 = `
<div class="page p2">

<table style="margin-bottom:4px">
  <tr>
    <td style="width:55%"><b>N\u00b0 ECOT (10 derniers chiffres) :</b> ${boxes(etab.num_ecot,10)}</td>
    <td style="width:45%"><b>N\u00b0 FASE :</b> ${boxes(etab.num_fase,5)}</td>
  </tr>
</table>

<table class="attr-table" style="margin-bottom:4px;font-size:7pt">
  <tr><td colspan="11" class="hdr-mid" style="font-size:8pt">Attributions</td></tr>
  <thead>
    <tr>
      <th class="hdr-attr" style="width:7%">U.E.</th>
      <th class="hdr-attr" style="width:3%">F</th>
      <th class="hdr-attr" style="width:26%">D\u00e9nomination du Cours</th>
      <th class="hdr-attr" style="width:5%">CLA</th>
      <th class="hdr-attr" style="width:9%">P\u00e9riodes d\u2019occupation</th>
      <th class="hdr-attr" style="width:6%">TC / TL</th>
      <th class="hdr-attr" style="width:7%">Nb p\u00e9riodes</th>
      <th class="hdr-attr" style="width:10%">Titre</th>
      <th class="hdr-attr" style="width:7%">Sit. adm.</th>
      <th class="hdr-attr" style="width:5%">DI</th>
      <th class="hdr-attr" style="width:5%">N\u00b0 OE*</th>
    </tr>
  </thead>
  <tbody>${attrHtml}</tbody>
</table>

<table style="margin-bottom:4px;font-size:7pt">
  <tr>
    <td colspan="3" class="hdr-mid">Attributions actuelles</td>
    <td colspan="3" class="hdr-mid">Attributions du PS12 pr\u00e9c\u00e9dent : ${dateFr(data.date_ps12_precedent)}</td>
  </tr>
  <tr>
    <th class="hdr-attr">Classification</th>
    <th class="hdr-attr">TC / TL</th>
    <th class="hdr-attr">P\u00e9riodes</th>
    <th class="hdr-attr">Classification</th>
    <th class="hdr-attr">TC / TL</th>
    <th class="hdr-attr">P\u00e9riodes</th>
  </tr>
  <tr>
    <td>&nbsp;${data.classif_actuelle||''}</td>
    <td class="center">${data.tctl_actuel||''}</td>
    <td class="center">${data.periodes_actuelles||''}</td>
    <td>&nbsp;${data.classif_precedente||''}</td>
    <td class="center">${data.tctl_precedent||''}</td>
    <td class="center">${data.periodes_precedentes||''}</td>
  </tr>
</table>

<table class="attr-table" style="margin-bottom:4px;font-size:7pt">
  <tr><td colspan="5" class="hdr-mid">Origine de l\u2019\u00e9v\u00e9nement (OE)</td></tr>
  <tr><td colspan="5" style="font-size:6.5pt;padding:2px 4px">
    *Si vous avez coch\u00e9 \u00ab remplacement \u00bb dans le cadre \u00ab justification(s) \u00bb, indiquez les coordonn\u00e9es du/des MDP remplac\u00e9(s) :
  </td></tr>
  ${oeRows}
</table>

<table class="sig-table" style="margin-bottom:4px">
  <tr>
    <td style="font-size:7pt;line-height:1.5;padding:4px">
      Le PO ou son d\u00e9l\u00e9gu\u00e9 demande l\u2019octroi ou l\u2019ajustement du traitement/de la subvention-traitement du MDP, sur la base du
      pr\u00e9sent Doc12. Il s\u2019engage \u00e0 rembourser soit la totalit\u00e9 des r\u00e9mun\u00e9rations si la fonction du MDP ne respecte pas les
      conditions r\u00e9glementaires, soit la diff\u00e9rence entre le montant liquid\u00e9 et la r\u00e9mun\u00e9ration prom\u00e9rit\u00e9e.<br><br>
      Si ce Doc12 concerne un MDP temporaire, il est valable jusqu\u2019\u00e0 la fin de l\u2019ann\u00e9e scolaire en cours, au plus tard.<br><br>
      La transmission de ce document par GEDI-PRO ou une application locale
      <b>ne requiert plus les signatures</b> ni du membre du personnel, ni, gr\u00e2ce \u00e0 l\u2019authentification via
      l\u2019application, du chef d\u2019\u00e9tablissement et/ou du Pouvoir Organisateur.
    </td>
  </tr>
</table>

<table class="sig-table">
  <tr><td colspan="2" class="hdr-mid">SIGNATURES OPTIONNELLES</td></tr>
  <tr>
    <td style="width:50%;vertical-align:top">
      <b>Le membre du personnel (MDP)</b><br><br>
      NOM : ___________________________<br>
      Pr\u00e9nom : ___________________________<br>
      Date : __ / __ / 20__<br>
      <div class="sig-area"></div>
    </td>
    <td style="width:50%;vertical-align:top">
      <b>Le Pouvoir Organisateur (ou son d\u00e9l\u00e9gu\u00e9)</b><br><br>
      NOM : ___________________________<br>
      Pr\u00e9nom : ___________________________<br>
      Qualit\u00e9 : ___________________________<br>
      Date : __ / __ / 20__<br>
      <div class="sig-area"></div>
    </td>
  </tr>
</table>

<div style="margin-top:4px;text-align:center;font-size:6pt;color:#555">
  Annexe 1 bis PS \u2014 A envoyer \u00e0 la Direction de gestion \u2014 Page 2 | 2
</div>
</div>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>EA12 \u2014 ${data.prof_nom||''} ${data.prof_prenom||''} \u2014 ${data.annee||''}</title>
  <style>${css}</style>
</head>
<body>
${page1}
<div class="page-break"></div>
${page2}
</body>
</html>`;
}
