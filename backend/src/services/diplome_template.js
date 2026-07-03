// Modèle de diplôme (Institut Ilya Prigogine — co-diplomation HELB)
// Mise en page A4 paysage, impression sur papier à diplôme pré-imprimé.
// Typographie unifiée : une seule taille ; gras = bleu marine, reste = gris foncé.
// Marge basse de 2 cm réservée au pied de page du papier pré-imprimé.
// Variables {{...}} remplacées à la génération (mêmes données que l'attestation).
// Éditable dans Lucie : module Attestation → onglet « Modèle de diplôme ».
export function genererTemplateDiplome() {
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;}
  body{margin:0;font-family:"Segoe UI","Helvetica Neue",Arial,sans-serif;font-size:11.5px;line-height:1.5;color:#374151;}
  strong{color:#1B2B4B;font-weight:700;}
  .page{width:297mm;height:210mm;padding:12mm 16mm 20mm;background:#fff;display:flex;flex-direction:column;}
  .head{display:flex;justify-content:space-between;align-items:flex-start;}
  .logo-img{height:72px;width:auto;display:block;margin:0;}
  .cf{text-align:right;}
  .etab{margin-top:6mm;}
  .domaine{margin-top:4mm;}
  .corps{margin-top:4mm;background:#f4f7fb;border-radius:6px;padding:5mm 7mm;}
  .corps p{margin:0 0 2.5mm 0;}
  .corps p:last-child{margin-bottom:0;}
  .lieu-date{margin-top:4mm;}
  .signatures{margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;gap:5mm;}
  .sig-col{text-align:center;flex:1;min-width:0;}
  .sig-col .role{margin-bottom:12mm;}
  .sig-col .nom{font-weight:700;color:#1B2B4B;border-top:1px solid #b9c2ce;padding-top:2px;}
  .gouv{flex:1;text-align:center;align-self:center;}
  @page{size:A4 landscape;margin:0;}
  @media print{.page{width:297mm;height:210mm;}}
</style></head><body>
<div class="page">
  <div class="head">
    <img src="{{logo_helb}}" class="logo-img" alt="HELB — Institut Ilya Prigogine" />
    <div class="cf">
      Communauté française de Belgique<br>
      <strong>Enseignement pour adultes</strong><br>
      Enseignement supérieur pour adultes de type court
    </div>
  </div>

  <div class="etab">
    <strong>{{nom_etab}}</strong><br>
    Adresse : {{adresse_etab}}<br>
    Année académique : {{annee}}
  </div>

  <div class="domaine">
    Domaine : {{domaine}}<br>
    <strong>Section : {{intitule_section}}</strong>
  </div>

  <div class="corps">
    <p>Vu le décret du 16 avril 1991 organisant l'Enseignement pour Adultes ;</p>
    <p>Vu le décret du 7 novembre 2013 définissant le paysage de l'enseignement supérieur et l'organisation académique des études ;</p>
    <p>Nous, Président·e et Membres du jury d'épreuve intégrée chargé de conférer le grade académique concerné, déclarons que</p>
    <p><strong>{{nom_etudiant}} {{prenom_etudiant}}</strong> ({{genre}}), né·e à {{lieu_naissance}}, le {{date_naissance}} (n° de registre national {{registre_national}}),</p>
    <p>a suivi les activités d'apprentissage correspondant au document de référence <strong>{{code_section}}</strong> approuvé le {{date_approbation}}, totalisant <strong>{{total_ects}} crédits</strong> et organisées sur une durée de {{duree_annees}} années au moins, et a obtenu en l'année académique {{annee}}</p>
    <p><strong>le grade académique de {{grade_academique}}.</strong></p>
    <p>Attendu qu'il·elle a subi l'épreuve avec <strong>{{mention}}</strong>.</p>
    <p>En foi de quoi, nous lui avons délivré le présent diplôme, attestant que les prescriptions légales relatives aux conditions d'accès, aux programmes, au nombre de crédits y associés et à la publicité des examens ont été observées.</p>
  </div>

  <p class="lieu-date">Fait à {{ville_etab}}, le {{date_deliberation}}.</p>

  <div class="signatures">
    <div class="sig-col">
      <div class="role">La Présidente du jury<br>d'épreuve intégrée,</div>
      <div class="nom">{{president_jury}}</div>
    </div>
    <div class="sig-col">
      <div class="role">La Directrice du département<br>santé de la HELB,</div>
      <div class="nom">Catherine Romanus</div>
    </div>
    <div class="sig-col">
      <div class="role">La Directrice-Présidente<br>de la HELB,</div>
      <div class="nom">Annick Vandeuren</div>
    </div>
    <div class="sig-col">
      <div class="role">Le Directeur,</div>
      <div class="nom">{{directeur}}</div>
    </div>
    <div class="gouv">Au nom du Gouvernement<br>de la Communauté française,<br>Pour le Ministre,</div>
    <div class="sig-col">
      <div class="role">Le·La titulaire,</div>
      <div class="nom">{{nom_etudiant}} {{prenom_etudiant}}</div>
    </div>
  </div>
</div>
</body></html>`;
}
