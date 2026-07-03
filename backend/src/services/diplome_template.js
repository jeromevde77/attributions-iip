// Modèle de diplôme (Institut Ilya Prigogine — co-diplomation HELB)
// Mise en page A4 paysage, impression sur papier à diplôme pré-imprimé.
// En-tête : bloc logo (gauche) et bloc Communauté française (droite) alignés sur
// la même ligne médiane, même hauteur visuelle. Corps recentré verticalement.
// Pas de cadre : le grade est mis en exergue (aligné à gauche, filet marine).
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
  .head{display:flex;justify-content:space-between;align-items:center;}
  .logo-img{height:58px;width:auto;display:block;margin:0;}
  .cf{text-align:right;line-height:1.5;}
  .middle{flex:1;display:flex;flex-direction:column;justify-content:center;}
  .domaine{margin-bottom:5mm;}
  .corps p{margin:0 0 2.5mm 0;}
  .exergue{margin:4mm 0;}
  .exergue .grade{font-size:16px;font-weight:700;color:#1B2B4B;line-height:1.25;}
  .exergue .filet{width:26mm;height:0;border-top:2px solid #1B2B4B;margin:2mm 0 2mm 0;}
  .exergue .mention{color:#374151;}
  .lieu-date{margin-top:4mm;}
  .signatures{display:flex;justify-content:space-between;align-items:flex-end;gap:5mm;}
  .sig-col{text-align:center;flex:1;min-width:0;}
  .sig-col .role{margin-bottom:12mm;}
  .sig-col .nom{font-weight:700;color:#1B2B4B;border-top:1px solid #b9c2ce;padding-top:2px;}
  .gouv{flex:1;text-align:center;align-self:center;}
  @page{size:A4 landscape;margin:0;}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
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

  <div class="middle">
    <div class="corps">
      <p>Vu le décret du 16 avril 1991 organisant l'Enseignement pour Adultes ;</p>
      <p>Vu le décret du 7 novembre 2013 définissant le paysage de l'enseignement supérieur et l'organisation académique des études ;</p>
      <p>Nous, Président·e et Membres du jury d'épreuve intégrée chargé de conférer le grade académique concerné, déclarons que</p>
      <p><strong>{{nom_etudiant}} {{prenom_etudiant}}</strong> ({{genre}}), né·e à {{lieu_naissance}}, le {{date_naissance}},</p>
      <p>a suivi les activités d'apprentissage correspondant au document de référence <strong>{{code_section}}</strong> pour la section <span style="text-transform:lowercase">{{intitule_section}}</span>, domaine de {{domaine}} approuvé le {{date_approbation}}, totalisant <strong>{{total_ects}} crédits</strong> et organisées sur une durée de {{duree_annees}} années au moins, et a obtenu, en l'année académique {{annee}}, le grade académique de :</p>
    </div>

    <div class="exergue">
      <div class="grade">{{grade_academique}}</div>
      <div class="filet"></div>
      <div class="mention">Épreuve subie avec <strong>{{mention}}</strong>.</div>
    </div>

    <div class="corps">
      <p>En foi de quoi, nous lui avons délivré le présent diplôme, attestant que les prescriptions légales relatives aux conditions d'accès, aux programmes, au nombre de crédits y associés et à la publicité des examens ont été observées.</p>
    </div>

    <p class="lieu-date">Fait à {{ville_etab}}, le {{date_deliberation}}.</p>
  </div>

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
