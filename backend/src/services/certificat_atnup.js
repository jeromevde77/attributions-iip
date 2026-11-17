/* LE CERTIFICAT D'AMBULANCIER DE TRANSPORT NON URGENT DE PATIENTS (3.5.514, Charles, 17 novembre 2026 : « créer un diplôme » ; tranché :
   « dans Lucie, sur ton modèle »). Le dessin du diplôme de l'Institut (A4 paysage, logo, exergue, signatures réglées — 3.5.519, Charles : « une version Institut mais
   avec toutes les données ») et toutes les données du modèle Word du secrétariat : code, 288 périodes, activités, pourcentage, mention. Il devient le modèle PROPRE de la section ATNUP (lucie_config « diplome_template_section ») ; les autres
   sections gardent le diplôme commun. Les variables {{…}} sont celles du centre de diplomation (routes/diplomes.js). */
export function certificatAtnup() {
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;}
  body{margin:0;font-family:"Segoe UI","Helvetica Neue",Arial,sans-serif;font-size:10.5px;line-height:1.45;color:#374151;}
  strong{color:#1B2B4B;font-weight:700;}
  .page{width:297mm;height:210mm;padding:12mm 16mm 20mm;background:#fff;display:flex;flex-direction:column;position:relative;}
  .head{display:flex;justify-content:space-between;align-items:center;}
  .logo-img{height:58px;width:auto;display:block;margin:0;}
  .cf{text-align:right;line-height:1.5;}
  .middle{flex:1;display:flex;flex-direction:column;justify-content:center;padding-bottom:30mm;}
  .corps p{margin:0 0 2mm 0;}
  .activites{font-size:9.5px;color:#4B5563;}
  .exergue{margin:2.5mm 0;}
  .exergue .grade{font-size:15px;font-weight:700;color:#1B2B4B;line-height:1.2;}
  .exergue .code{font-size:10px;color:#6B7280;}
  .exergue .filet{width:26mm;height:0;border-top:1px solid #1B2B4B;margin:1mm 0 1.5mm 0;}
  .lieu-date{margin-top:3mm;}
  .signatures{display:flex;justify-content:space-between;align-items:flex-start;gap:5mm;position:absolute;left:16mm;right:16mm;bottom:20mm;}
  .sig-col{text-align:center;flex:1;min-width:0;}
  .sig-col .role{min-height:9mm;margin-bottom:16mm;}
  .sig-col .nom{font-weight:700;color:#1B2B4B;border-top:1px solid #b9c2ce;padding-top:2px;}
  .gouv{flex:1;text-align:center;align-self:flex-start;}
  @page{size:A4 landscape;margin:0;}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  @media print{.page{width:297mm;height:210mm;}}
</style></head><body>
<div class="page">
  <div class="head">
    {{logos}}
    <div class="cf">
      Communauté française de Belgique<br>
      <strong>Enseignement pour adultes</strong><br>
      Enseignement secondaire supérieur — année scolaire {{annee_slash}}
    </div>
  </div>

  <div class="middle">
    <div class="corps">
      <p>Vu le décret du 16 avril 1991 organisant l'Enseignement pour Adultes, notamment l'article 38 ;</p>
      <p>Attendu que les unités d'enseignement constitutives de la section comportent au total <strong>288 périodes</strong> et comprennent les activités d'enseignement suivantes :</p>
      <p class="activites">Communication professionnelle appliquée au transport ambulancier (20), Contextes généraux d'intervention (14), Contextes spécifiques d'intervention (22), Eléments d'anatomie et de physiopathologie (24), Ergonomie et manutention de charges et de personnes (20), Hygiène, prévention des infections et sécurité en ambulance (14), Législation, déontologie et éthique (16), Premiers secours et réanimation cardiopulmonaire (32), Transport non urgent de patients (28), Transport non urgent de patients : travaux pratiques (32), Usage et fonctionnement d'une ambulance (16), Stages (14), Epreuve intégrée (36).</p>
      <p>Nous, Président·e et Membres du jury d'épreuve intégrée chargé de délivrer le certificat de la section, déclarons que</p>
      <p><strong>{{nom_majuscules}} {{prenom_etudiant}}</strong> ({{genre}}), {{ne_e}} à {{lieu_naissance}}, le {{date_naissance}},</p>
      <p>a réussi chacune des unités d'enseignement requises pour participer à l'épreuve intégrée, a présenté cette épreuve avec succès et termine ses études avec succès, en obtenant <strong>{{pourcent}} %</strong> du total général des points. Nous lui délivrons le</p>
    </div>

    <div class="exergue">
      <div class="grade">Certificat d'ambulancier de transport non urgent de patients (convention)</div>
      <div class="code">spécifique à l'enseignement secondaire supérieur pour adultes — section approuvée par le Gouvernement sous le numéro de code 824125S20V2</div>
      <div class="filet"></div>
      <div class="mention">avec la mention <strong>{{mention}}</strong>.</div>
    </div>

    <p class="lieu-date">Fait à {{ville_etab}}, le {{date_deliberation}}.</p>
  </div>

  <div class="signatures">
    {{signatures}}
    <div class="gouv">Au nom du Gouvernement<br>de la Communauté française,<br>Pour le Ministre,</div>
    <div class="sig-col">
      <div class="role">{{article_titulaire}} titulaire,</div>
      <div class="nom">{{titulaire_nom}}</div>
    </div>
  </div>
</div>
</body></html>`;
}
