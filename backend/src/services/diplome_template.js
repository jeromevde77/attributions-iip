// Modèle de diplôme (Institut Ilya Prigogine — co-diplomation HELB)
// Mise en page A4 paysage. Variables {{...}} remplacées à la génération, avec
// les mêmes données que l'attestation de réussite + données propres au diplôme.
// Éditable dans Lucie : module Attestation → onglet « Modèle de diplôme ».
export function genererTemplateDiplome() {
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;}
  body{margin:0;font-family:"Segoe UI","Helvetica Neue",Arial,sans-serif;color:#333;}
  .page{width:297mm;min-height:210mm;padding:14mm 16mm 10mm;position:relative;background:#fff;}
  .head{display:flex;justify-content:space-between;align-items:flex-start;}
  .logo-zone{display:flex;align-items:center;gap:16px;}
  .logo-img{height:52px;width:auto;display:block;}
  .cf{text-align:right;line-height:1.25;}
  .cf .l1{color:#8a99ad;font-size:11px;}
  .cf .l2{color:#1B2B4B;font-weight:700;font-size:13px;}
  .cf .l3{color:#8a99ad;font-size:10px;margin-top:2px;}
  .etab{margin-top:9mm;font-size:11px;line-height:1.4;}
  .etab strong{color:#1B2B4B;font-size:12.5px;}
  .domaine{margin-top:6mm;font-size:12px;}
  .domaine .sec{font-weight:800;color:#1B2B4B;font-size:15px;margin-top:1mm;}
  .corps{margin-top:6mm;background:#f4f7fb;border-radius:6px;padding:7mm 8mm;font-size:12px;line-height:1.55;}
  .corps p{margin:0 0 3mm 0;}
  .vu{color:#4a5568;font-size:11px;}
  .nom-etu{font-size:16px;color:#1B2B4B;margin:3mm 0 0 0;}
  .naiss{font-size:11px;color:#4a5568;margin:0 0 3mm 0;}
  .grade{font-size:16px;font-weight:800;color:#1B2B4B;margin:2mm 0 0 0;}
  .mention{font-size:12.5px;color:#1B2B4B;margin:0 0 3mm 0;}
  .lieu-date{margin-top:5mm;font-size:11px;}
  .signatures{margin-top:8mm;display:flex;justify-content:space-between;align-items:flex-end;}
  .sig-col{text-align:center;font-size:10.5px;color:#4a5568;min-width:150px;}
  .sig-col .role{margin-bottom:14mm;}
  .sig-col .sig-img{height:16mm;margin-bottom:1mm;}
  .sig-col .nom{font-weight:700;color:#1B2B4B;border-top:1px solid #b9c2ce;padding-top:2px;}
  .gouv{font-size:9.5px;color:#7a8699;text-align:center;line-height:1.4;}
  .sceau{width:80px;height:80px;object-fit:contain;}
  .pied{margin-top:7mm;border-top:1px solid #dfe4ea;padding-top:2.5mm;font-size:8.5px;color:#8a94a3;line-height:1.4;}
  @page{size:A4 landscape;margin:0;}
  @media print{.page{width:297mm;min-height:210mm;}}
</style></head><body>
<div class="page">
  <div class="head">
    <div class="logo-zone">
      <img src="{{logo_helb}}" class="logo-img" alt="HELB Ilya Prigogine" />
      <img src="{{logo_iip}}" class="logo-img" alt="Institut Ilya Prigogine" />
    </div>
    <div class="cf">
      <div class="l1">Communauté française de Belgique</div>
      <div class="l2">Enseignement pour adultes</div>
      <div class="l3">Enseignement supérieur pour adultes de type court</div>
    </div>
  </div>

  <div class="etab">
    <strong>{{nom_etab}}</strong><br>
    Adresse : {{adresse_etab}}<br>
    Numéro de matricule : {{matricule_etab}} &nbsp;·&nbsp; Numéro FASE : {{fase_etab}} &nbsp;·&nbsp; Année académique : {{annee}}
  </div>

  <div class="domaine">
    Domaine : {{domaine}}
    <div class="sec">Section : {{intitule_section}}</div>
  </div>

  <div class="corps">
    <p class="vu">Vu le décret du 16 avril 1991 organisant l'Enseignement pour Adultes ;</p>
    <p class="vu">Vu le décret du 7 novembre 2013 définissant le paysage de l'enseignement supérieur et l'organisation académique des études ;</p>
    <p>Nous, Président·e et Membres du jury d'épreuve intégrée chargé de conférer le grade académique concerné, déclarons que</p>
    <p class="nom-etu"><strong>{{nom_etudiant}}</strong> {{prenom_etudiant}} ({{genre}})</p>
    <p class="naiss">Né·e à {{lieu_naissance}}, le {{date_naissance}} (n° de registre national {{registre_national}}),</p>
    <p>a suivi les activités d'apprentissage correspondant au document de référence <strong>{{code_section}}</strong> approuvé le {{date_approbation}}, totalisant <strong>{{total_ects}} crédits</strong> et organisées sur une durée de {{duree_annees}} années au moins, et a obtenu en l'année académique {{annee}}</p>
    <p class="grade">le grade académique de {{grade_academique}}.</p>
    <p class="mention">Attendu qu'il·elle a subi l'épreuve avec <strong>{{mention}}</strong>.</p>
    <p>En foi de quoi, nous lui avons délivré le présent diplôme, attestant que les prescriptions légales relatives aux conditions d'accès, aux programmes, au nombre de crédits y associés et à la publicité des examens ont été observées.</p>
  </div>

  <p class="lieu-date">Fait à {{ville_etab}}, le {{date_deliberation}}.</p>

  <div class="signatures">
    <div class="sig-col">
      <div class="role">Le Directeur,</div>
      <img class="sig-img" src="{{signature_directeur}}" alt="" />
      <div class="nom">{{directeur}}</div>
    </div>
    <div class="sig-col">
      <div class="role">Le/La Président·e<br>du jury d'épreuve intégrée,</div>
      <div class="nom">{{president_jury}}</div>
    </div>
    <div class="gouv" style="align-self:center;">Au nom du Gouvernement<br>de la Communauté française,<br>Pour le Ministre,</div>
    <div class="sig-col">
      <div class="role">Le·La titulaire,</div>
      <div class="nom">{{nom_etudiant}} {{prenom_etudiant}}</div>
    </div>
    <img class="sceau" src="{{sceau}}" alt="Sceau" />
  </div>

  <div class="pied">Un supplément est annexé au présent diplôme. Il atteste notamment la liste des enseignements du programme d'études suivi par l'étudiant·e, les conditions d'accès aux études et les évaluations sanctionnées par le grade académique ou le titre conféré.</div>
</div>
</body></html>`;
}
