/* LE CERTIFICAT D'AMBULANCIER DE TRANSPORT NON URGENT DE PATIENTS (3.5.514, Charles, 17 novembre 2026 : « créer un diplôme » ; tranché :
   « dans Lucie, sur ton modèle »). Le modèle Word du secrétariat (Modèle_Diplôme_ATNUP), recopié tel quel : A4 portrait, enseignement
   secondaire, sans logo. Il devient le modèle PROPRE de la section ATNUP (lucie_config « diplome_template_section ») ; les autres
   sections gardent le diplôme commun. Les variables {{…}} sont celles du centre de diplomation (routes/diplomes.js). */
export function certificatAtnup() {
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;}
  body{margin:0;font-family:"Times New Roman",Times,serif;font-size:11pt;line-height:1.35;color:#111;}
  .page{width:210mm;height:297mm;padding:22mm 20mm 20mm;position:relative;}
  .centre{text-align:center;}
  .tete div{margin:0 0 2.5mm;}
  .etab{margin:9mm 0 7mm;}
  .titre{font-weight:700;font-size:13pt;text-align:center;margin:0;}
  .soustitre{text-align:center;margin:1mm 0 0;}
  .code{text-align:center;margin:3mm 0 7mm;}
  p{margin:0 0 2.2mm;text-align:justify;}
  .nom{font-weight:700;margin-top:3mm;}
  .sig{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6mm;margin-top:10mm;}
  .sig2{display:grid;grid-template-columns:1fr 1fr;gap:6mm;margin-top:34mm;}
  .droite{text-align:right;}
  @page{size:A4 portrait;margin:0;}
  @media print{.page{width:210mm;height:297mm;}}
</style></head><body>
<div class="page">
  <div class="tete centre">
    <div>COMMUNAUTÉ FRANÇAISE DE BELGIQUE</div>
    <div>ENSEIGNEMENT POUR ADULTES</div>
    <div>ANNÉE SCOLAIRE : {{annee_slash}}</div>
    <div>ENSEIGNEMENT SECONDAIRE</div>
  </div>
  <div class="etab">
    <div><b>INSTITUT ILYA PRIGOGINE</b></div>
    <div>Adresse : Campus Erasme, Bât. P, route de Lennik 808 - 1070 Anderlecht</div>
    <div>Numéro de matricule : 2.132.070</div>
    <div>Numéro FASE : 292</div>
  </div>
  <div class="titre">CERTIFICAT D'AMBULANCIER DE TRANSPORT NON URGENT DE PATIENTS<br>(CONVENTION)</div>
  <div class="soustitre">spécifique à l’enseignement secondaire supérieur pour adultes</div>
  <div class="code">Section approuvée par le Gouvernement sous le numéro de code : 824125S20V2</div>

  <p>Le Jury d’épreuve intégrée chargé de délivrer le certificat de la section :<br>
  AMBULANCIER DE TRANSPORT NON URGENT DE PATIENTS (CONVENTION) ;</p>
  <p>Vu le décret du 16 avril 1991 organisant l’Enseignement pour Adultes, notamment l’article 38 ;</p>
  <p>Attendu que les unités d’enseignement constitutives de la section comportent au total 288 périodes et comprennent les activités
  d’enseignement suivantes :<br>
  Communication professionnelle appliquée au transport ambulancier (20), Contextes généraux d'intervention (14), Contextes spécifiques
  d'intervention (22), Eléments d'anatomie et de physiopathologie (24), Ergonomie et manutention de charges et de personnes (20), Hygiène,
  prévention des infections et sécurité en ambulance (14), Législation, déontologie et éthique (16), Premiers secours et réanimation
  cardiopulmonaire (32), Transport non urgent de patients (28), Transport non urgent de patients : travaux pratiques (32), Usage et
  fonctionnement d'une ambulance (16), Stages (14), Epreuve intégrée (36).</p>

  <p>Attendu que</p>
  <p class="nom">{{nom_majuscules}} {{prenom_etudiant}} ({{genre}})</p>
  <p>{{ne_e}} à {{lieu_naissance}}, le {{date_naissance}},</p>
  <p>a réussi chacune des unités d’enseignement requises pour participer à l’épreuve intégrée;</p>
  <p>Attendu {{qu_il_elle}} a présenté, avec succès, cette épreuve intégrée;</p>
  <p>Attendu {{qu_il_elle}} termine ses études avec succès et {{qu_il_elle}} obtient en outre, {{pourcent}} pourcent du total général des points;</p>
  <p>Lui délivre le présent certificat avec la mention : <b>{{mention}}</b>.</p>

  <div class="sig">
    <div>Le Directeur,<br>{{directeur_nom}}</div>
    <div>Le Jury d’épreuve intégrée,</div>
    <div class="droite">Fait à {{ville_etab}},<br>le {{date_deliberation}}</div>
  </div>
  <div class="sig2">
    <div>{{article_titulaire}} titulaire,</div>
    <div class="droite">Au nom du Gouvernement de la<br>Communauté française,<br>Pour le Ministre,</div>
  </div>
</div>
</body></html>`;
}
