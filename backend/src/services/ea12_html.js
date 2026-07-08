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
    td, th { border: 1px solid #555; padding: 2px 3px; vertical-align: top; font-size: 7.5pt; word-break: break-word; background: #DEEAF6; }
    .nb td, .nb th, .attr-table td, .attr-table th, .sig-table td, .sig-table th { background: #fff; }
    .hdr-mid.hdr-mid { background: #9CC2E5; }
    .hdr-dark  { background: #2E74B5; color: #fff; font-weight: bold; text-align: center; font-size: 10pt; padding: 4px; }
    .hdr-mid   { background: #9CC2E5; font-weight: bold; text-align: center; font-size: 8pt; padding: 3px; }
    .hdr-attr  { background: #fff; color: #000; font-weight: bold; text-align: center; font-size: 7pt; padding: 2px; }
    .bold      { font-weight: bold; }
    .center    { text-align: center; }
    .box { display: inline-block; width: 13px; height: 15px; border: 1px solid #444;
           text-align: center; line-height: 15px; margin: 0 1.5px; font-size: 8pt; background: #fff; }
    .boxgrid { display: inline-table; border-collapse: collapse; width: auto; border: 1.5px solid #000; vertical-align: middle; }
    .boxgrid td { border: 1px solid #000; border-top: none; border-bottom: none; padding: 0;
                  width: 11px; height: 13px; min-width: 11px; text-align: center; vertical-align: middle;
                  font-size: 8pt; font-weight: bold; background: #fff; }
    .boxgrid td:first-child { border-left: none; }
    .boxgrid td:last-child { border-right: none; }
    .boxgrid.nodiv td { border: none; }
    .chk { display: inline-flex; align-items: center; gap: 3px; margin: 1px 5px 1px 0;
           font-size: 7.5pt; white-space: nowrap; cursor: pointer; }
    .chk input { -webkit-appearance: none; appearance: none; width: 9px; height: 9px; margin: 0;
                 border: 1.75px solid #000; background: #fff; position: relative; flex-shrink: 0; }
    .chk input:checked { background: #fff; }
    .chk input:checked::after { content: ''; position: absolute; left: 0.5px; top: 0.5px; right: 0.5px; bottom: 0.5px; background: #000; }
    .chk-col { display: flex; flex-direction: column; gap: 2px; }
    .nb { border: none; }
    .nb td, .nb th { border: none; padding: 1px 3px; }
    .page-break { break-after: page; page-break-after: always; }
    .sig-area { min-height: 25mm; }
    input[type=text] { border: none; border-bottom: 1px solid #555;
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

  // ── PAGE 1 ─────────────────────────────────────────────────────────────────
  const logoHtml = LOGO_FWB
    ? `<img src="${LOGO_FWB}" style="height:13mm;width:auto;display:block;max-width:100%;object-fit:contain" alt="Logo FWB">`
    : `<b style="font-size:9pt">F\u00e9d\u00e9ration Wallonie-Bruxelles</b>`;

  const statuts = ['T','TPr','St','D','ACS','APE','PTP'];

  const page1 = `
<div class="page">
${btnPrint}
<table class="nb" style="margin-bottom:3px">
  <tr>
    <td style="width:30%;vertical-align:middle;padding-right:4px">${logoHtml}</td>
    <td style="width:42%;vertical-align:top;font-size:7.5pt;line-height:1.5">
      <b>Administration g\u00e9n\u00e9rale de l\u2019Enseignement</b><br>
      Direction g\u00e9n\u00e9rale des Personnels de l\u2019Enseignement
    </td>
    <td style="width:28%;padding:3px;vertical-align:top;font-size:7pt">
      <div style="white-space:nowrap;display:flex;align-items:center;gap:5px">
        <b style="text-decoration:underline">Ann\u00e9e acad\u00e9mique</b> ${anneeBoxes(data.annee)}
      </div>
      <div style="white-space:nowrap;display:flex;align-items:center;gap:5px;margin-top:4px">
        <b style="text-decoration:underline">Document n\u00b0</b> ${boxes(data.doc_num, 2)}
      </div>
      <div style="font-size:6pt;margin-top:4px">Dernier Doc12 transmis le :<br>${dateFr(data.dernier_doc12)}</div>
    </td>
  </tr>
</table>

<table style="margin-bottom:3px">
  <tr><td class="hdr-dark">EA12 \u2013 Enseignement pour Adultes \u2013 SUP\u00c9RIEUR \u2013 Demande de mise en liquidation</td></tr>
</table>

<table style="margin-bottom:3px">
  <tr><td colspan="3" class="hdr-mid">Identification de l\u2019\u00e9tablissement</td></tr>
  <tr>
    <td style="width:34%"><b>Niveau : ENSEIGNEMENT POUR ADULTES (20)</b></td>
    <td style="width:25%">${chk(isWBE)} <b>Organis\u00e9 WBE (33)</b></td>
    <td style="width:41%">
      ${chk(isSubv)} <b>Subventionn\u00e9 par la FWB (22)</b><br>
      ${chk(isOfficiel)} Officiel &nbsp; ${chk(isLibre)} Libre
    </td>
  </tr>
  <tr>
    <td colspan="2"><b>N\u00b0 ECOT (10 derniers chiffres) :</b> ${boxes(etab.num_ecot, 10)}</td>
    <td><b>N\u00b0 FASE :</b> ${boxes(etab.num_fase, 6)}</td>
  </tr>
  <tr>
    <td style="vertical-align:top;padding:0">
      <table class="nb">
        <tr><td style="white-space:nowrap;font-size:7pt;background:#DEEAF6"><b>Nom du PO</b></td><td style="font-size:7pt;background:#fff">${etab.po_nom || ''}</td></tr>
        <tr><td style="white-space:nowrap;font-size:7pt;background:#DEEAF6"><b>Nom de l\u2019\u00e9tablissement</b></td><td style="font-size:7pt;background:#fff">${etab.etab_nom || ''}</td></tr>
        <tr><td style="white-space:nowrap;font-size:7pt;vertical-align:top;background:#DEEAF6"><b>Adresse compl\u00e8te</b></td>
            <td style="font-size:7pt;max-width:55mm;word-break:break-word;background:#fff">${(etab.adresse||'').replace(/,/g,',<br>')}</td></tr>
        <tr><td style="white-space:nowrap;font-size:7pt;vertical-align:top;background:#DEEAF6"><b>E-mails officiels</b></td>
          <td style="font-size:7pt;background:#fff">ec ${etab.email_ec||'@ adm.cfwb.be'}<br>po ${etab.email_po||'@ adm.cfwb.be'}</td></tr>
      </table>
    </td>
    <td colspan="2" style="vertical-align:top;background:#DEEAF6;padding:3px">
      <b>Gestionnaire du dossier</b>
      <i style="font-size:6.5pt">(joignable facilement par l\u2019Administration)</i>
      <table class="nb" style="margin-top:2px">
        <tr><td style="white-space:nowrap;background:#DEEAF6">Nom :</td><td style="background:#fff">${etab.gest_nom || ''}</td></tr>
        <tr><td style="white-space:nowrap;background:#DEEAF6">Pr\u00e9nom :</td><td style="background:#fff">${etab.gest_prenom || ''}</td></tr>
        <tr><td style="white-space:nowrap;background:#DEEAF6">Qualit\u00e9 :</td><td style="background:#fff">${etab.gest_qualite || ''}</td></tr>
        <tr><td style="white-space:nowrap;background:#DEEAF6">T\u00e9l. direct :</td><td style="background:#fff">${etab.gest_tel || ''}</td></tr>
        <tr><td style="white-space:nowrap;background:#DEEAF6">E-mail :</td><td style="background:#fff">${etab.gest_email || ''}</td></tr>
      </table>
    </td>
  </tr>
</table>

<table style="margin-bottom:3px">
  <tr><td colspan="3" class="hdr-mid">Identification du membre du personnel (MDP)</td></tr>
  <tr>
    <td style="width:28%;vertical-align:top">
      <b>Matricule enseignant</b><br>
      <div style="margin:4px 0">${boxes(data.matricule, 11)}</div>
      <br><b>NOM :</b> ${data.prof_nom || ''}<br>
      <b>Pr\u00e9nom :</b> ${data.prof_prenom || ''}
    </td>
    <td style="width:48%;vertical-align:top">
      <b>Titres de capacit\u00e9s</b>
      <span style="font-size:6.5pt">(une copie de chacun d\u2019eux doit \u00eatre en possession de la Direction de gestion)</span><br><br>
      1) ${data.titre1 || '&nbsp;'.repeat(40)}<br>
      2) ${data.titre2 || '&nbsp;'.repeat(40)}<br>
      <label class="chk" style="margin-top:4px"><input type="checkbox"${data.derogation_titre ? ' checked' : ''}>
        <span style="font-size:6.5pt">D\u00e9rogation de titre requis par l\u2019AR du 22/4/1969 telle que pr\u00e9vue par l\u2019alin\u00e9a 2 de art 17\u00a74 de la Loi du 7/7/1970.</span>
      </label>
    </td>
    <td style="width:24%;vertical-align:top">
      <b>Statut</b><br>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px;margin-top:4px">
        ${chk(statut==='T','T')} ${chk(statut==='ACS','ACS')}
        ${chk(statut==='TPr','TPr')} ${chk(statut==='APE','APE')}
        ${chk(statut==='St','St')} ${chk(statut==='PTP','PTP')}
        ${chk(statut==='D','D')}
      </div>
    </td>
  </tr>
</table>

<table style="margin-bottom:3px">
  <tr>
    <td style="width:50%;vertical-align:top">
      <b>Cumul</b><br>
      ${chk(data.pas_cumul, 'Pas de cumul interne')}<br>
      <b>Prestations dans cet \u00e9tablissement :</b><br>
      ${chk(data.prest_sec,'Secondaire')}
      ${chk(data.prest_sup ?? true,'Sup\u00e9rieur')}
      ${chk(data.prest_exp,'Expert')}
      ${chk(false,'ACS/APE/PTP')}<br>
      <b>Prestations dans un autre \u00e9tablissement :</b><br>
      ${chk(false,'Cumul interne A2 (enseignement organis\u00e9 ou subventionn\u00e9 par la FWB)')}
    </td>
    <td style="width:50%;vertical-align:top">
      <b>Transmission tardive du document par la faute du MDP</b><br>
      ${chk(false,'En application de la Circulaire 6930 du 10/01/2019 \u00ab FICHES FISCALES \u00bb')}<br><br>
      <b>Nombre de jours de fonctionnement/semaine :</b>
      ${chk(data.jours==4,'4')}
      ${chk(data.jours==5,'5')}
      ${chk(data.jours==6,'6')}
    </td>
  </tr>
</table>

<table style="margin-bottom:3px">
  <tr><td colspan="3" class="hdr-mid">\u00c9v\u00e9nement</td></tr>
  <tr>
    <td colspan="2" style="width:55%"><b>Date de l\u2019\u00e9v\u00e9nement <i>(JJ/MM/AAAA)</i> :</b> ${dateFr(data.date_evenement)}</td>
    <td style="width:45%"><b>Semaines de fonctionnement :</b> ${data.semaines || ''}</td>
  </tr>
  <tr>
    <td colspan="2" style="width:55%;font-size:7.5pt;padding:1px 3px"><b>Type d\u2019\u00e9v\u00e9nement</b></td>
    <td style="width:45%;font-size:7.5pt;padding:1px 3px"><b>Justification(s)</b></td>
  </tr>
  <tr>
    <!-- Barre verticale "Mouvement" -->
    <td style="width:12px;background:#D6DCE4;text-align:center;vertical-align:middle;padding:2px;border-right:none">
      <div style="writing-mode:vertical-lr;transform:rotate(180deg);font-weight:bold;font-size:7pt;white-space:nowrap">Mouvement</div>
    </td>
    <td style="width:calc(55% - 12px);vertical-align:top;border-left:none">
      <div class="chk-col">
        ${MOUVEMENTS.map(t => chk(typeEv===t, t)).join('')}
      </div>
      <div style="border-top:1px solid #ccc;margin:2px 0;padding-top:2px">
        <div class="chk-col">
          ${MOUVEMENTS2.slice(0,-1).map(t => chk(typeEv===t, t)).join('')}
          ${chk(typeEv===MOUVEMENTS2[MOUVEMENTS2.length-1], MOUVEMENTS2[MOUVEMENTS2.length-1])}
          <input type="text" style="margin-left:14px;width:75%">
        </div>
      </div>
    </td>
    <td style="width:45%;vertical-align:top">
      <div class="chk-col">
        ${JUSTIFS.slice(0,-1).map(j => chk((data.justifs||[]).includes(j), j)).join('')}
        ${chk((data.justifs||[]).includes(JUSTIFS[JUSTIFS.length-1]), JUSTIFS[JUSTIFS.length-1])}
        ${(data.justifs||[]).includes('Autres') && data.justif_autres ? `<div style="margin-left:14px;font-style:italic;font-size:7pt">${data.justif_autres}</div>` : ''}
        <input type="text" style="margin-left:14px;width:75%">
      </div>
      <div style="border-top:1px solid #ccc;margin:4px 0 2px">
        <b>Absence</b>
        <div class="chk-col" style="margin-top:2px">
          ${chk(data.type_absence==="Absence d\u2019un jour","Absence d\u2019un jour")}
          ${chk(data.type_absence==="D\u00e9but absence de plus d\u20191 jour","D\u00e9but absence de plus d\u20191 jour")}
          ${chk(data.type_absence==="Reprise apr\u00e8s absence de plus d\u20191 jour","Reprise apr\u00e8s absence de plus d\u20191 jour")}
        </div>
        <div style="font-size:7pt;margin-top:2px">
          Motif de l\u2019absence (Pr\u00e9cisez : intitul\u00e9 CAD + Code DI)<br>
          <span style="display:inline-block;width:100%;border-bottom:1px solid #555;min-height:10px">${data.motif_absence||''}</span><br>
          Date de d\u00e9but : ${data.date_debut_absence||'__ / __ / 20__'} &nbsp; Date de fin : ${data.date_fin_absence||'__ / __ / 20__'}
        </div>
      </div>
    </td>
  </tr>
</table>

<table>
  <tr>
    <td>
      <b>Situation ancienne-nouvelle / Observations / Remarques compl\u00e9mentaires \u00e9ventuelles :</b>
      <div style="min-height:12mm;padding:2px">${data.observations || '&nbsp;'}</div>
    </td>
  </tr>
</table>

<div style="margin-top:4px;text-align:center;font-size:6pt;color:#555">
  Annexe 1 bis PS \u2014 A envoyer \u00e0 la Direction de gestion \u2014 Page 1 | 2
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
<div class="page">

<table style="margin-bottom:4px">
  <tr>
    <td style="width:55%"><b>N\u00b0 ECOT (10 derniers chiffres) :</b> ${boxes(etab.num_ecot,10)}</td>
    <td style="width:45%"><b>N\u00b0 FASE :</b> ${boxes(etab.num_fase,6)}</td>
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
