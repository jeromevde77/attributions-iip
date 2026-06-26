/**
 * contrat_preview.js — Génère un aperçu HTML fidèle du contrat
 * Même données que contrat_fill.js mais rendu en HTML/CSS pour PreviewModal
 */

const JOURS_FR = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
const MOIS_FR  = ['janvier','février','mars','avril','mai','juin',
                  'juillet','août','septembre','octobre','novembre','décembre'];

function dateLongue(s) {
  if (!s) return '__________';
  const d = new Date(s + 'T12:00:00');
  return `${JOURS_FR[d.getDay()]} ${d.getDate()} ${MOIS_FR[d.getMonth()]} ${d.getFullYear()}`;
}

export function genererApercu({ etab, prof, attributions, annee, date_contrat, representant }) {
  let totalCT = 0, totalPP = 0;
  for (const a of attributions) {
    const per = (a.periodes_attribuees||0) + (a.autonomie_attribuee||0);
    if ((a.ct_pp || a.type_cours || '') === 'PP') totalPP += per;
    else totalCT += per;
  }
  const total = totalCT + totalPP;
  const etp   = Math.round((totalCT / 800 + totalPP / 1000) * 100) / 100;
  const estETP = etp >= 1;

  const rep = representant
    || (etab.gest_prenom || etab.gest_nom ? `${etab.gest_prenom||''} ${etab.gest_nom||''}`.trim() + (etab.gest_qualite ? `, ${etab.gest_qualite}` : '') : null)
    || 'Charles Sohet, Directeur a.i.';

  const nomProf = `${prof.prenom||''} ${prof.nom||''}`.trim();
  const adresseProf = [prof.adresse_rue, prof.code_postal, prof.commune].filter(Boolean).join(', ') || '—';

  const lignesCours = attributions.map(a => {
    const per = (a.periodes_attribuees||0) + (a.autonomie_attribuee||0);
    return `<div class="cours-ligne">
      <span class="cours-section">${a.section||''}</span>
      <span class="cours-sep">–</span>
      <span class="cours-code">${a.code_cours||''}</span>
      <span class="cours-nom">${a.cours_nom||a.ue_nom||''}</span>
      <span class="cours-per">(${per} période${per>1?'s':''})</span>
    </div>`;
  }).join('');

  const phraseETP = estETP
    ? `Ces emplois constituent un <strong>temps plein</strong> pour l'année académique <strong>${annee||''}</strong>.`
    : `Ces emplois constituent des <strong>prestations incomplètes (${etp} ETP)</strong> pour l'année académique <strong>${annee||''}</strong>.`;

  return `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="utf-8">
<title>Contrat — ${nomProf}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, sans-serif; font-size: 9pt; color: #1a1a2e; background: white; }
  @media print { @page { size: A4 portrait; margin: 15mm 18mm; } }
  .page { max-width: 170mm; margin: 0 auto; padding: 12mm 0; }

  /* En-tête */
  .header { border-bottom: 2.5pt solid #1F3864; margin-bottom: 6mm; padding-bottom: 4mm; display: flex; justify-content: space-between; align-items: flex-end; }
  .header-left .etab-nom { font-size: 11pt; font-weight: bold; color: #1F3864; }
  .header-left .etab-sub { font-size: 8pt; color: #555; margin-top: 1mm; }
  .header-right { text-align: right; font-size: 8pt; color: #555; }
  .header-right .annee { font-weight: bold; color: #1F3864; }

  /* Titre principal */
  .titre-principal { text-align: center; margin-bottom: 5mm; }
  .titre-principal h1 { font-size: 12pt; font-weight: bold; color: #1F3864; text-transform: uppercase; letter-spacing: 0.5pt; }
  .titre-principal .sous-titre { font-size: 9pt; font-style: italic; color: #555; margin-top: 1.5mm; }

  /* Articles */
  .article { margin-bottom: 4mm; }
  .article-titre { font-weight: bold; font-size: 9.5pt; color: #1F3864; margin-bottom: 1.5mm; border-left: 3pt solid #C9A84C; padding-left: 3mm; }
  .article-corps { padding-left: 6mm; }
  .article-corps p { margin-bottom: 1.5mm; line-height: 1.45; }

  /* Parties */
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; margin-bottom: 4mm; }
  .partie-box { border: 0.5pt solid #ccc; border-radius: 2pt; padding: 3mm 4mm; background: #f8f9fa; }
  .partie-box .partie-label { font-size: 7.5pt; font-weight: bold; color: #888; text-transform: uppercase; letter-spacing: 0.5pt; margin-bottom: 1.5mm; }
  .partie-box .partie-nom { font-weight: bold; font-size: 10pt; color: #1F3864; }
  .partie-box .partie-detail { font-size: 8pt; color: #444; margin-top: 0.5mm; line-height: 1.4; }

  /* Cours */
  .cours-ligne { display: flex; align-items: baseline; gap: 2mm; margin-bottom: 1mm; font-size: 9pt; }
  .cours-section { font-weight: bold; color: #1F3864; min-width: 22mm; }
  .cours-sep { color: #999; }
  .cours-code { font-family: monospace; font-size: 8.5pt; color: #555; min-width: 12mm; }
  .cours-nom { flex: 1; }
  .cours-per { color: #666; font-style: italic; white-space: nowrap; }
  .cours-total { font-weight: bold; margin-top: 1.5mm; padding-top: 1.5mm; border-top: 0.5pt solid #ccc; font-size: 9.5pt; }

  /* Bullets */
  ul.refs { padding-left: 5mm; margin: 1mm 0; }
  ul.refs li { margin-bottom: 1mm; line-height: 1.4; }

  /* Signatures */
  .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; margin-top: 8mm; padding-top: 4mm; border-top: 0.5pt solid #ccc; }
  .sig-bloc .sig-titre { font-weight: bold; font-size: 9pt; margin-bottom: 6mm; }
  .sig-bloc .sig-mention { font-style: italic; font-size: 8pt; color: #666; margin-bottom: 18mm; }
  .sig-bloc .sig-nom { font-size: 9pt; border-top: 0.5pt solid #888; padding-top: 1mm; }

  /* Utilitaires */
  b { font-weight: bold; }
  .mention-date { font-size: 9pt; margin: 3mm 0; }
  .confidential { font-size: 7.5pt; color: #aaa; text-align: center; margin-top: 4mm; }
</style>
</head><body><div class="page">

  <!-- En-tête -->
  <div class="header">
    <div class="header-left">
      <div class="etab-nom">${etab.nom||'Institut Ilya Prigogine'}</div>
      <div class="etab-sub">${etab.adresse||''} ${etab.cp||''} ${etab.ville||''}</div>
      <div class="etab-sub">FELSI · Enseignement de promotion sociale</div>
    </div>
    <div class="header-right">
      <div class="annee">Année académique ${annee||''}</div>
      <div>Établi le ${dateLongue(date_contrat)}</div>
    </div>
  </div>

  <!-- Titre -->
  <div class="titre-principal">
    <h1>Contrat de travail à durée déterminée</h1>
    <div class="sous-titre">Dans l'Enseignement pour adultes (personnel enseignant)</div>
  </div>

  <!-- Parties -->
  <div class="parties">
    <div class="partie-box">
      <div class="partie-label">Le Pouvoir organisateur</div>
      <div class="partie-nom">${etab.nom||'Institut Ilya Prigogine'}</div>
      <div class="partie-detail">
        Représenté par <b>${rep}</b><br>
        ${etab.adresse||''} — ${etab.cp||''} ${etab.ville||'Bruxelles'}<br>
        ${etab.num_entreprise ? `N° entreprise : ${etab.num_entreprise}` : ''}
      </div>
    </div>
    <div class="partie-box">
      <div class="partie-label">Le membre du personnel</div>
      <div class="partie-nom">${nomProf}</div>
      <div class="partie-detail">
        ${adresseProf}<br>
        ${prof.date_naissance ? `Né·e le ${dateLongue(prof.date_naissance)}<br>` : ''}
        ${prof.niss ? `NISS : ${prof.niss}<br>` : ''}
        ${prof.matricule ? `Matricule : ${prof.matricule}` : ''}
      </div>
    </div>
  </div>

  <!-- Article 1 -->
  <div class="article">
    <div class="article-titre">Article 1 — Emploi(s) vacant(s)</div>
    <div class="article-corps">
      <p>Le membre du personnel est engagé dans un emploi / des emplois vacant(s) au sens de l'article 3 §1er, §1er bis et §1er ter du Décret du 1er février 1993 comportant :</p>
      <div style="margin: 2mm 0 2mm 4mm;">
        ${lignesCours}
        <div class="cours-total">Total : ${total} période${total>1?'s':''}</div>
      </div>
      <p>${phraseETP}</p>
    </div>
  </div>

  <!-- Article 2 -->
  <div class="article">
    <div class="article-titre">Article 2 — Durée et prise de cours</div>
    <div class="article-corps">
      <p>Le présent contrat est conclu pour une durée déterminée correspondant à l'année scolaire <b>${annee||''}</b>.</p>
      <p>Le contrat prend cours à la date de la première prestation effective du membre du personnel dans la fonction concernée.</p>
    </div>
  </div>

  <!-- Article 3 -->
  <div class="article">
    <div class="article-titre">Article 3 — Rémunération</div>
    <div class="article-corps">
      <p>Le membre du personnel est rémunéré conformément aux barèmes applicables dans l'enseignement subventionné par la Communauté française de Belgique, en fonction de son ancienneté de service et de ses titres et qualifications.</p>
    </div>
  </div>

  <!-- Article 4 -->
  <div class="article">
    <div class="article-titre">Article 4 — Dispositions applicables</div>
    <div class="article-corps">
      <p>Le présent contrat est régi par :</p>
      <ul class="refs">
        <li>le Décret du 1er février 1993 fixant le statut des membres du personnel subsidiés de l'enseignement libre subventionné ;</li>
        <li>la législation en vigueur dans l'enseignement subventionné par la Communauté française.</li>
      </ul>
    </div>
  </div>

  <!-- Article 5 -->
  <div class="article">
    <div class="article-titre">Article 5 — Données personnelles</div>
    <div class="article-corps">
      <p>Les données personnelles du membre du personnel sont traitées conformément au Règlement (UE) 2016/679 (RGPD) et à la loi du 30 juillet 2018 relative à la protection des personnes physiques à l'égard des traitements de données à caractère personnel.</p>
    </div>
  </div>

  <!-- Signatures -->
  <div class="mention-date">Ainsi établi en double exemplaire, à Bruxelles, le ${dateLongue(date_contrat)}.</div>
  <div class="signatures">
    <div class="sig-bloc">
      <div class="sig-titre">Le travailleur·se,</div>
      <div class="sig-mention">précédé de la mention « lu et approuvé »</div>
      <div class="sig-nom">${nomProf}</div>
    </div>
    <div class="sig-bloc">
      <div class="sig-titre">Le représentant·e du Pouvoir organisateur,</div>
      <div class="sig-mention">&nbsp;</div>
      <div class="sig-nom">${rep}</div>
    </div>
  </div>

  <div class="confidential">Document confidentiel — généré par Lucie · Institut Ilya Prigogine</div>
</div></body></html>`;
}
