/**
 * contrat_expert.js — LE CONTRAT D'EMPLOI D'UN EXPERT (Charles, 27 septembre
 * 2026 : « à mettre en page comme notre contrat de travail ; c'est le contrat
 * pour l'expert ; il doit toujours accompagner le document 12 »).
 *
 * Deux modèles de l'IIP, identiques mot pour mot à une chose près : le montant
 * de la période — supérieur et secondaire. Le texte est repris tel quel ; la
 * mise en page est celle du contrat CC (contrat_preview.js) : même en-tête,
 * mêmes cadres de parties, mêmes articles au filet doré, mêmes signatures, même
 * pied. Le modèle se règle dans Configuration → Éditeur (`contrat_expert_template`),
 * comme celui du contrat CC.
 *
 * UN CONTRAT PAR NIVEAU. Un expert qui preste au supérieur ET au secondaire
 * reçoit deux contrats : la rétribution de la période n'est pas la même, et un
 * contrat qui mêlerait les deux engagerait l'école sur un montant faux.
 */
import { LOGO_IIP_JPEG } from './assets/logo_iip_jpeg.js';
import { tauxExpertBase, typeExpert, LIB_TYPE_EXPERT } from '../lib/tauxExperts.js';
import { SIGNATURE_SOHET } from './assets/signature_sohet.js';
import { piedDocument } from '../routes/parametres.js';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function dateLongue(s) {
  if (!s) return '__________';
  const d = new Date(String(s).slice(0, 10) + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return String(s);
  return `${d.getDate() === 1 ? '1er' : d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Le niveau d'une section, tel que le référentiel le dit. */
export function niveauSection(niveauBrut) {
  return /secondaire|^\s*DS\s*$/i.test(String(niveauBrut || '')) ? 'secondaire' : 'superieur';
}

/** Taux par défaut des deux modèles de l'IIP (indice du 1er juillet 1991). */
export const TAUX_DEFAUT = { superieur: 28.44, secondaire: 24.69 };

export function genererTemplateExpert() {
  return `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="utf-8">
<title>Contrat d'emploi d'un expert</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, sans-serif; font-size: 9pt; color: #1a1a2e; background: white; }
  .page-table { width: 100%; border-collapse: collapse; }
  .page-table > tfoot { display: table-footer-group; }
  .page-table > tbody { display: table-row-group; }
  .page { max-width: 178mm; margin: 0 auto; padding: 0; }
  .header { border-bottom: 2.5pt solid #1F3864; margin-bottom: 6mm; padding-bottom: 4mm; display: flex; justify-content: space-between; align-items: flex-end; }
  .header-left .etab-nom { font-size: 11pt; font-weight: bold; color: #1F3864; }
  .header-left .etab-sub { font-size: 8pt; color: #555; margin-top: 1mm; }
  .header-right { text-align: right; font-size: 8pt; color: #555; }
  .header-right .annee { font-weight: bold; color: #1F3864; }
  .titre-principal { text-align: center; margin-bottom: 5mm; }
  .titre-principal h1 { font-size: 12pt; font-weight: bold; color: #1F3864; text-transform: uppercase; letter-spacing: 0.5pt; }
  .titre-principal .sous-titre { font-size: 9pt; font-style: italic; color: #555; margin-top: 1.5mm; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; margin-bottom: 4mm; }
  .partie-box { border: 0.5pt solid #ccc; border-radius: 2pt; padding: 3mm 4mm; background: #f8f9fa; }
  .partie-box .partie-label { font-size: 7.5pt; font-weight: bold; color: #888; text-transform: uppercase; letter-spacing: 0.5pt; margin-bottom: 1.5mm; }
  .partie-box .partie-nom { font-weight: bold; font-size: 10pt; color: #1F3864; }
  .partie-box .partie-detail { font-size: 8pt; color: #444; margin-top: 0.5mm; line-height: 1.4; }
  .article { margin-bottom: 4mm; }
  .article-titre { font-weight: bold; font-size: 9.5pt; color: #1F3864; margin-bottom: 1.5mm; border-left: 3pt solid #C9A84C; padding-left: 3mm; }
  .article-corps { padding-left: 6mm; }
  .article-corps p { margin-bottom: 1.5mm; line-height: 1.45; }
  .cours-ligne { display: grid; grid-template-columns: 1fr auto; column-gap: 3mm; align-items: start; margin-bottom: 1.5mm; font-size: 9pt; }
  .cours-ue { font-weight: bold; color: #1F3864; }
  .cours-per { color: #444; line-height: 1.4; }
  .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; margin-top: 8mm; padding-top: 4mm; border-top: 0.5pt solid #ccc; }
  .sig-bloc .sig-titre { font-weight: bold; font-size: 9pt; margin-bottom: 3mm; }
  .sig-bloc .sig-zone { height: 18mm; display: flex; align-items: flex-end; }
  .sig-bloc .sig-mention { font-style: italic; font-size: 8pt; color: #666; }
  .sig-bloc .sig-img img { max-height: 18mm; max-width: 55mm; }
  .sig-bloc .sig-nom { font-size: 9pt; border-top: 0.5pt solid #888; padding-top: 1mm; margin-top: 1mm; }
  .mention-date { font-size: 9pt; margin: 3mm 0; }
  .note { font-size: 7.5pt; color: #666; font-style: italic; margin-top: 3mm; }
  .footer-iip { margin-top: 8mm; flex-shrink: 0; }
  .footer-iip .logo { height: 10mm; width: auto; opacity: 0.9; display: block; margin-bottom: 2.5mm; }
  .footer-iip .txt { border-top: 0.5pt solid #C9A84C; padding-top: 2.5mm; font-size: 6pt; color: #3F4652; text-align: center; line-height: 1.4; }
  @media print {
    @page { size: A4 portrait; margin: 12mm 16mm; }
    body { margin: 0; }
  }
</style>
</head><body><table class="page-table"><tbody><tr><td><div class="page">

  <div class="header">
    <div class="header-left">
      <div class="etab-nom">{{nom_etab}}</div>
      <div class="etab-sub">{{adresse_etab}}</div>
      <div class="etab-sub">Enseignement pour adultes · {{libelle_niveau}}</div>
    </div>
    <div class="header-right">
      <div class="annee">Année académique {{annee}}</div>
      <div>Établi le {{date_contrat}}</div>
    </div>
  </div>

  <div class="titre-principal">
    <h1>Contrat d'emploi d'un expert</h1>
    <div class="sous-titre">engagé par l'enseignement pour adultes subventionné par le Ministère de la Fédération Wallonie-Bruxelles, pour un travail défini</div>
  </div>

  <div class="parties">
    <div class="partie-box">
      <div class="partie-label">Le Pouvoir organisateur</div>
      <div class="partie-nom">{{po_nom}}</div>
      <div class="partie-detail">
        N° d'entreprise {{num_entreprise}}<br>
        Siège social : Bâtiment HA du Campus de la Plaine, boulevard du Triomphe, accès 2 – CP 220/01, 1050 Bruxelles<br>
        Représenté par <b>{{representant}}</b>, ayant reçu délégation de signature du Conseil d'administration,
        ci-après dénommé « le Pouvoir organisateur »
      </div>
    </div>
    <div class="partie-box">
      <div class="partie-label">L'expert</div>
      <div class="partie-nom">{{civilite}} {{nom_prof}}</div>
      <div class="partie-detail">
        Domicilié·e : {{adresse_prof}}<br>
        {{telephone}}
      </div>
    </div>
  </div>

  <div class="article">
    <div class="article-titre">Article 1er</div>
    <div class="article-corps">
      <p>{{civilite}} {{nom_prof}} entre en service auprès de l'établissement scolaire d'enseignement pour adultes dénommé {{nom_etab}}, {{adresse_etab}}, afin d'y exercer la ou les fonctions d'expert dans les conditions fixées par la circulaire PS 260/92 du 3 novembre 1992 dont le texte est joint au présent contrat.</p>
    </div>
  </div>

  <div class="article">
    <div class="article-titre">Article 2</div>
    <div class="article-corps">
      <p>Il/elle prestera dans l'(les) unité(s) d'enseignement :</p>
      <div style="margin: 2mm 0 2mm 4mm;">{{prestations}}</div>
      <p>suivant l'(les) horaire(s) établi(s) par la Direction de l'établissement.</p>
    </div>
  </div>

  <div class="article">
    <div class="article-titre">Article 3</div>
    <div class="article-corps">
      <p>Il/elle s'engage à se conformer à l'horaire fixé et à respecter le programme de l'unité d'enseignement. En cas de maladie ou d'incapacité de travail, il/elle est tenu·e de faire parvenir au chef d'établissement un certificat médical établi par le médecin de son choix. S'il échet, et selon ses possibilités, il/elle convient avec le chef d'établissement d'un horaire de récupération admis.</p>
    </div>
  </div>

  <div class="article">
    <div class="article-titre">Article 4</div>
    <div class="article-corps">
      <p>Le montant de la rétribution est liquidé par la Communauté française, soit :</p>
      <p>{{remuneration}}, montants à indexer à l'indice des prix à la consommation tel qu'il était au 1er juillet 1991.</p>
      <p>{{civilite}} {{nom_prof}} marque expressément son accord pour que chaque rétribution soit payée au compte n° {{iban}}.</p>
    </div>
  </div>

  <div class="article">
    <div class="article-titre">Article 5</div>
    <div class="article-corps"><p>Ce contrat ne comporte pas de période d'essai.</p></div>
  </div>

  <div class="article">
    <div class="article-titre">Article 6</div>
    <div class="article-corps">
      <p>Pour chacune des charges de cours visées à l'article 2, le contrat sera résilié de plein droit et sans indemnité à l'expiration du terme prévu à l'article 2 et au plus tard au terme de la dernière prestation effectuée dans le cadre de cette charge de cours. Par dérogation à ce qui précède, le contrat sera résilié de plein droit et sans indemnité à partir de la notification à {{civilite}} {{nom_prof}} du refus de la Communauté française d'admettre l'unité d'enseignement aux subventions.</p>
      <p>Il en sera de même à partir du premier jour du mois qui suit la notification de la Communauté française du constat que {{civilite}} {{nom_prof}} ne possède pas les compétences particulières requises.</p>
    </div>
  </div>

  <div class="article">
    <div class="article-titre">Article 7</div>
    <div class="article-corps">
      <p>Ce contrat étant conclu pour un travail nettement défini, les parties conviennent expressément qu'aucune disposition collective ayant valeur supplétive et qu'aucune disposition ayant valeur d'usage dans l'enseignement n'est applicable au présent contrat.</p>
      <p>Dès lors, les parties déclarent explicitement exclure l'application des conventions collectives de travail conclues les 11, 22 et 26 avril 1968 en vertu de l'article 45, paragraphe 9, alinéa 1er de la loi du 29 mai 1959 dite « Pacte scolaire ».</p>
    </div>
  </div>

  <div class="article">
    <div class="article-titre">Article 8</div>
    <div class="article-corps">
      <p>{{civilite}} {{nom_prof}} s'engage, dans l'exercice de ses fonctions, à respecter le règlement d'ordre intérieur de l'établissement et les obligations résultant du règlement organique des services ; à se conformer aux directives du chef d'établissement et de la Direction générale.</p>
    </div>
  </div>

  <div class="article">
    <div class="article-titre">Article 9</div>
    <div class="article-corps"><p>Les litiges pouvant naître du présent contrat seront soumis au tribunal du travail de Bruxelles.</p></div>
  </div>

  <div class="mention-date">Fait en cinq exemplaires originaux, chaque partie ayant reçu le sien, à Anderlecht, le {{date_contrat}}.</div>
  <div class="signatures">
    <div class="sig-bloc">
      <div class="sig-titre">L'expert (*),</div>
      <div class="sig-zone"><span class="sig-mention">Pour accord, le</span></div>
      <div class="sig-nom">{{nom_prof}}</div>
    </div>
    <div class="sig-bloc">
      <div class="sig-titre">Le représentant du Pouvoir organisateur,</div>
      <div class="sig-zone sig-img">{{signature_representant}}</div>
      <div class="sig-nom">{{representant}}</div>
    </div>
  </div>
  <div class="note">(*) La signature de l'expert doit être précédée de la mention manuscrite « lu et approuvé ».</div>

  </div></td></tr></tbody>
  <tfoot><tr><td>
  <div class="page">
  <div class="footer-iip">
    <img class="logo" src="{{logo_iip}}" alt="Institut Ilya Prigogine">
    <div class="txt">{{pied_page}}</div>
  </div>
  </div>
  </td></tr></tfoot>
</table></body></html>`;
}

/**
 * @param lignes  [{ ue_num, ue_nom, section, periodes, cla, debut, fin }]
 * @param niveau  'superieur' | 'secondaire'
 */
export function genererContratExpert({ etab, prof, lignes, annee, date_contrat, representant, niveau, taux, templateHtml }) {
  const rep = representant || 'Charles Sohet, Directeur';
  const nom = `${prof.prenom || ''} ${String(prof.nom || '').toUpperCase()}`.trim();
  const civ = /^f/i.test(prof.sexe || '') ? 'Madame' : /^m|^h/i.test(prof.sexe || '') ? 'Monsieur' : 'Madame, Monsieur';
  const adresseProf = [prof.adresse_rue, [prof.code_postal, prof.commune].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '—';
  const total = lignes.reduce((n, l) => n + Math.round(Number(l.periodes) || 0), 0);
  const typeCours = cla => (String(cla || '').toUpperCase() === 'PP' ? 'de pratique professionnelle' : 'de cours techniques');
  // Une ligne par unité : « n° adm. : 75 — Psychomotricité : intitulé », puis
  // les périodes et la période d'occupation, comme dans le modèle.
  const parUE = {};
  for (const l of lignes) {
    const k = `${l.section}|${l.ue_num}`;
    const g = (parUE[k] ||= { ...l, periodes: 0, types: new Set() });
    g.periodes += Math.round(Number(l.periodes) || 0);
    g.types.add(typeCours(l.cla));
    if (l.debut && (!g.debut || l.debut < g.debut)) g.debut = l.debut;
    if (l.fin && (!g.fin || l.fin > g.fin)) g.fin = l.fin;
  }
  const prestations = Object.values(parUE).map(g => `<div class="cours-ligne">
      <div><div class="cours-ue">n° adm. : ${esc(g.ue_num)} — ${esc(g.section || '')} : ${esc(g.ue_nom || '')}</div>
      <div class="cours-per">${g.periodes} périodes ${[...g.types].join(' et ')}${g.debut || g.fin ? ` entre le ${dateLongue(g.debut)} et le ${dateLongue(g.fin)}` : ''}</div></div>
    </div>`).join('') || '<p><i>Aucune prestation d’expert attribuée pour cette année.</i></p>';
  /* LE TAUX DÉPEND DU TYPE DE COURS (A.E. 26-01-1993, art. 8 — Charles, 6
     octobre 2026). Un seul taux par niveau faisait payer la pratique
     professionnelle au prix des cours généraux. Les périodes se groupent par
     type ; chaque groupe a son taux de base. */
  const parType = {};
  for (const l of lignes) {
    const ty = typeExpert(l.cla);
    parType[ty] = (parType[ty] || 0) + Math.round(Number(l.periodes) || 0);
  }
  const groupes = Object.entries(parType).filter(([, n]) => n > 0)
    .map(([ty, n]) => ({ ty, n, t: tauxExpertBase(niveau, ty === 'pp' ? 'PP' : ty === 'spec' ? 'CS' : 'CT') }));
  const fr2 = x => Number(x).toFixed(2).replace('.', ',');
  const remuneration = groupes.length > 1
    ? groupes.map(g => `<b>${g.n} périodes</b> de ${LIB_TYPE_EXPERT[g.ty]} à raison de <b>${fr2(g.t)} €/période</b>`).join(' et ')
    : `<b>${total} périodes</b> à raison de <b>${fr2(groupes[0]?.t ?? taux ?? TAUX_DEFAUT[niveau] ?? 0)} €/période</b>`;
  const t = Number(groupes[0]?.t ?? taux ?? TAUX_DEFAUT[niveau] ?? 0);
  const vars = {
    '{{nom_etab}}': esc(etab.etab_nom || 'Institut Ilya Prigogine'),
    '{{adresse_etab}}': esc(etab.adresse || 'Campus Erasme, Bât. P, route de Lennik 808, 1070 Anderlecht'),
    '{{po_nom}}': esc(etab.po_nom || 'ASBL Ilya Prigogine'),
    '{{num_entreprise}}': esc(etab.num_entreprise || '458.339.252'),
    '{{libelle_niveau}}': niveau === 'secondaire' ? 'Enseignement secondaire' : 'Enseignement supérieur',
    '{{annee}}': esc(annee || ''),
    '{{date_contrat}}': dateLongue(date_contrat),
    '{{representant}}': esc(rep),
    '{{civilite}}': civ,
    '{{nom_prof}}': esc(nom),
    '{{adresse_prof}}': esc(adresseProf),
    '{{telephone}}': prof.tel_gsm ? `Tél. : ${esc(prof.tel_gsm)}` : '',
    '{{prestations}}': prestations,
    '{{total_periodes}}': String(total),
    '{{taux}}': t.toFixed(2).replace('.', ','),
    '{{remuneration}}': remuneration,
    '{{iban}}': prof.iban ? `IBAN ${esc(prof.iban)}` : '<i>(IBAN à compléter)</i>',
    '{{signature_representant}}': /sohet/i.test(rep) ? `<img src="${SIGNATURE_SOHET}" alt="signature">` : '',
    '{{logo_iip}}': LOGO_IIP_JPEG,
    '{{pied_page}}': piedDocument(),
  };
  let html = templateHtml || genererTemplateExpert();
  for (const [k, v] of Object.entries(vars)) html = html.split(k).join(v);
  return html;
}
