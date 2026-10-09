// ─────────────────────────────────────────────────────────────────────────────
// Les pièces d'un dossier d'aménagements raisonnables (décret du 30 juin 2016).
//
// Quatre pièces, une seule enveloppe — celle des pièces nominatives
// (`envelopper` d'attestations.js), la même que la motivation d'une décision :
//
//   · le FORMULAIRE, cadres A et B, recomposé depuis ce qui est encodé ;
//   · la DÉCISION MOTIVÉE du Conseil des études (art. 6 § 2) ;
//   · la NOTIFICATION par la direction, suivie de la décision elle-même ;
//   · la FICHE « MESURES » destinée aux chargés de cours.
//
// LE SECRET PROFESSIONNEL DÉCIDE DE CE QUI VA OÙ (art. 5). Le formulaire et la
// décision restent au dossier et chez l'étudiant ; la fiche des chargés de
// cours ne porte QUE les mesures retenues — jamais la nature de la situation,
// ni la pièce, ni les soins demandés, ni la motivation, ni les conditions
// particulières, qui peuvent la laisser deviner.
//
// AUCUNE PIÈCE QUI ENGAGE L'ÉTABLISSEMENT NE SORT SI LA DÉCISION N'EST PAS
// COMPLÈTE : le serveur nomme ce qui manque plutôt que de sortir une pièce à
// trous, qu'on complète ensuite à la main — et c'est cette main qu'on ne
// retrouve plus un an après.
// ─────────────────────────────────────────────────────────────────────────────

import db from '../db/index.js';
import { envelopper, frDate } from '../routes/attestations.js';
import { enteteDocument } from './document.js';
import { identiteEtablissement } from '../routes/config.js';
import { composerModele, declarerModele, blocModele } from './modelesPieces.js';
import { getParam } from '../routes/parametres.js';
import { sectionRattachement } from '../routes/etudiants.js';

/* LA MENTION DES VOIES DE RECOURS, RÉGLABLE ET NON ÉCRITE EN DUR.
 * Rédigée d'après le décret du 30 juin 2016 et la circulaire qui l'applique,
 * sans que le texte consolidé ait pu être relu à la rédaction : elle se relit
 * et se corrige dans Configuration → Procédures (`amenagement_recours`), où
 * elle vit désormais. Un texte réglementaire qui coûte un déploiement ne se
 * met jamais à jour. */
export const RECOURS_DEFAUT =
  "En cas de refus, total ou partiel, l'étudiant peut introduire un recours auprès de la "
  + "Commission de l'enseignement pour adultes inclusif, par lettre recommandée, dans les "
  + "10 jours ouvrables qui suivent la réception de la présente décision. Les jours "
  + "ouvrables s'entendent de tous les jours de la semaine, à l'exception du dimanche et "
  + "des jours fériés légaux. L'absence de réponse de l'établissement dans les délais "
  + "fixés vaut refus ; le recours peut alors être introduit à tout moment. La Commission "
  + "notifie sa décision motivée par recommandé dans les 30 jours calendrier, hors congés "
  + "scolaires, à compter de la réception du recours ; pour un recours introduit entre le "
  + "1er juin et le 30 juillet, au plus tard le 31 août. — Décret du 30 juin 2016 relatif "
  + "à l'enseignement de promotion sociale inclusif.";

export const TYPES_PIECE = {
  formulaire: 'Demande — cadres A et B',
  decision: 'Décision du Conseil des études',
  notification: 'Notification de la décision',
  mesures: 'Fiche « mesures » — chargés de cours',
};

const PORTEES = { toutes: 'Toutes activités', cours: 'Cours', epreuves: 'Épreuves', stage: 'Stage' };
const NATURES = { materiel: 'Matériel', pedagogique: 'Pédagogique' };
const MODES = { recommande: 'lettre recommandée', courriel: 'courriel',
                main_propre: 'remise en mains propres contre accusé de réception' };
const DECIDES = ['accepte', 'partiel', 'refuse', 'recours'];

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const jour = d => (d ? frDate(d) : '……………');
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const multi = s => esc(s).replace(/\n/g, '<br>');
/* LES MESURES COCHÉES, telles que la demande les porte (2 octobre 2026) : la
   liste remplace le texte libre des cadres A et B. */
const listeMesures = (ms, vide = '……………') => (ms && ms.length
  ? ms.map(m => `• ${esc(m.libelle)}${m.precisions ? ` — ${esc(m.precisions)}` : ''}`).join('<br>') : vide);

/** Le dossier et tout ce que les pièces en lisent. */
export function chargerDossier(id) {
  const d = db.prepare('SELECT * FROM amenagement_dossier WHERE id = ?').get(Number(id));
  if (!d) return null;
  d.etudiant = db.prepare(`SELECT id, nom, prenom, id_ecampus, titre, date_naissance,
      lieu_naissance FROM etudiant WHERE id = ?`).get(d.etudiant_id) || {};
  d.mesures = db.prepare(`SELECT * FROM amenagement_mesure WHERE dossier_id = ?
      ORDER BY accorde DESC, nature, libelle`).all(d.id);
  // Un même numéro d'unité vit sous plusieurs sections : sous-requête, jamais
  // de jointure sur `ue`, sans quoi une unité s'écrirait trois fois.
  d.ues = db.prepare(`SELECT a.ue_num,
      (SELECT u.ue_nom FROM ue u WHERE u.ue_num = a.ue_num AND u.ue_nom IS NOT NULL
        ORDER BY (u.annee_scolaire = ?) DESC, u.annee_scolaire DESC LIMIT 1) AS ue_nom
    FROM amenagement_ue a WHERE a.dossier_id = ? ORDER BY a.ue_num`).all(d.annee_scolaire, d.id);
  try { d.section = sectionRattachement(d.etudiant_id, d.annee_scolaire).section || null; }
  catch { d.section = null; }
  d.section_libelle = d.section
    ? (db.prepare('SELECT libelle FROM section WHERE code = ?').get(d.section)?.libelle || d.section)
    : null;
  d.accordees = d.mesures.filter(m => m.accorde);
  d.refusees = d.mesures.filter(m => !m.accorde);
  // « En recours » remplace le statut de la décision : son SENS se déduit des
  // mesures, il ne se déclare pas.
  d.sens = d.statut === 'recours' ? (d.accordees.length ? 'partiel' : 'refuse') : d.statut;
  return d;
}

/** Ce qui manque pour qu'une pièce parte — vide quand tout y est. */
export function manquesPiece(type, d) {
  const m = [];
  if (type === 'formulaire') return m;           // il se remplit au fil du dossier
  if (!DECIDES.includes(d.statut)) {
    m.push("la décision du Conseil (statut « Accordé », « Partiellement accordé » ou « Refusé »)");
  }
  if (!d.cde_date) m.push('la date de la décision');
  if (!(d.cde_motivation || '').trim()) m.push('la motivation — obligatoire, art. 6 § 2');
  if (['accepte', 'partiel'].includes(d.sens) && !d.accordees.length) {
    m.push('au moins une mesure accordée');
  }
  for (const x of d.refusees) {
    if (!(x.motif_refus || '').trim()) m.push(`le motif du refus de « ${x.libelle} »`);
  }
  if (type === 'mesures' && !d.accordees.length) {
    // Aucune mesure accordée : il n'y a rien à communiquer, et une fiche vide
    // laisserait croire à un oubli.
    if (!m.includes('au moins une mesure accordée')) m.push('au moins une mesure accordée');
  }
  return m;
}

function nomEtudiant(e) {
  return `${esc(String(e.nom || '').toUpperCase())} ${esc(e.prenom || '')}`.trim();
}
function feminin(e) {
  return /^(mme|madame|mlle|mademoiselle|m\.?me)\b/i.test(String(e.titre || '').trim());
}
function unitesConcernees(d) {
  return d.ues.length
    ? d.ues.map(u => `UE ${u.ue_num}${u.ue_nom ? ` — ${esc(u.ue_nom)}` : ''}`).join('<br>')
    : "toutes les unités du programme de l'année";
}
function ligneEntete(d, extra = null) {
  return [`Année ${String(d.annee_scolaire).replace('-', '/')}`, d.section_libelle, extra]
    .filter(Boolean).join(' · ');
}
function blocEtudiant(d) {
  const e = d.etudiant;
  return `<div class="etudiant">
    <div class="nom">${nomEtudiant(e)}</div>
    <div class="naissance">Matricule ${esc(e.id_ecampus || '—')}${e.date_naissance
      ? ` · né${feminin(e) ? 'e' : ''} le ${jour(e.date_naissance)}` : ''}</div>
  </div>`;
}
function tableMesures(liste, { avecMotif = false } = {}) {
  if (!liste.length) return '';
  return `<table class="doc">
    <thead><tr>
      <th style="width:40%">Aménagement</th><th style="width:14%">Nature</th>
      <th style="width:16%">Portée</th><th>${avecMotif ? 'Motif du refus' : 'Modalités'}</th>
    </tr></thead>
    <tbody>${liste.map(x => `<tr>
      <td><b>${esc(x.libelle)}</b></td>
      <td>${esc(NATURES[x.nature] || x.nature || '—')}</td>
      <td>${esc(PORTEES[x.portee] || x.portee || '—')}${x.ue_num ? `<br><span class="ref">UE ${x.ue_num}</span>` : ''}</td>
      <td>${avecMotif ? multi(x.motif_refus) : (x.precisions ? multi(x.precisions) : '—')}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}
function cloture(lieuDate, qualite, nom) {
  // Une décision et sa notification se signent à la main : aucun fac-similé
  // pré-imprimé ne laisse croire qu'elles l'ont été.
  return `<div class="cloture sans-paraphe">
    <div class="sceau"></div><div class="paraphe"></div>
    <div class="lieu">${lieuDate}</div>
    <div class="legende"><div class="qualite">${qualite}</div><div class="nom">${esc(nom)}</div></div>
  </div>`;
}
function recours() {
  const t = getParam('amenagement_recours', RECOURS_DEFAUT) || RECOURS_DEFAUT;
  return `<div class="info recours"><div class="titre">Voies de recours</div>
    <div class="ligne">${multi(t)}</div></div>`;
}
const SENS = {
  accepte: 'ACCORDE les aménagements raisonnables suivants',
  partiel: 'ACCORDE PARTIELLEMENT la demande',
  refuse: 'REFUSE la demande',
};

/* LES TEXTES DES QUATRE PIÈCES SE CORRIGENT DANS LUCIE (Galerie des pièces →
   Modifier le modèle ; lib/modelesPieces.js). Ce qui suit est le texte
   d'origine ; ce qui se calcule — tableaux des mesures, motivation, voies de
   recours, signature — reste en blocs verrouillés. */
const B = blocModele;
const CHAMPS_AR = {
  nom_prenom: "Nom et prénom de l'étudiant", civilite: 'Madame / Madame, Monsieur', annee: 'Année académique',
  section: 'Section', date_demande: 'Date de la demande', date_cde: 'Date de la décision du Conseil',
  date_recu: 'Reçue par le Conseil le', reference: 'Personne de référence (entre parenthèses)',
  sens: 'Décision (accorde / accorde partiellement / refuse)', ponctuation: '« : » ou « . » selon la décision',
  phrase_decision: 'Phrase de la décision (selon le sens)', delai: 'Délai de mise en œuvre',
  unites: 'Unités concernées', ville: 'Ville', directeur: 'Directeur', date_lettre: 'Date de la lettre',
};
declarerModele('ar_decision', {
  libelle: "Aménagement raisonnable — décision du Conseil des études", galerie: 'amenagement_decision', champs: CHAMPS_AR,
  blocs: { caracteristiques: 'Dates de la demande et unités concernées', identite: "Identité de l'étudiant",
    mesures_accordees: 'Tableau des mesures accordées', mesures_refusees: 'Mesures non accordées et leurs motifs',
    motivation: 'Motivation du Conseil', modalites: 'Délai de mise en œuvre et conditions particulières',
    mention_art7: 'Mention : un aménagement ne remet pas en cause les acquis (art. 7)',
    recours: 'Voies de recours (si la demande n’est pas entièrement accordée)', signature: 'Lieu, date et signature' },
  obligatoires: { blocs: ['identite', 'mesures_accordees', 'mesures_refusees', 'motivation', 'recours', 'signature'] },
  defaut: `${B('caracteristiques')}
<p>Le Conseil des études, réuni le <b>{{date_cde}}</b>, a examiné la demande d'aménagements raisonnables introduite par</p>
${B('identite')}
<p>ainsi que le rapport de la personne de référence{{reference}}. Il <b>{{sens}}</b>{{ponctuation}}</p>
${B('mesures_accordees')}
${B('mesures_refusees')}
${B('motivation')}
${B('modalites')}
${B('mention_art7')}
${B('recours')}
${B('signature')}`,
});
declarerModele('ar_notification', {
  libelle: "Aménagement raisonnable — notification de la décision", galerie: 'amenagement_notification', champs: CHAMPS_AR,
  blocs: { identite: "Identité de l'étudiant", mise_en_oeuvre: 'Mise en œuvre et secret professionnel (si accordé)',
    recours: 'Voies de recours (si la demande n’est pas entièrement accordée)',
    mode: 'Mode de notification et copie', signature: 'Lieu, date et signature' },
  obligatoires: { blocs: ['identite', 'recours', 'mode', 'signature'], champs: ['phrase_decision'] },
  defaut: `${B('identite')}
<p>{{civilite}},</p>
<p>Par la présente, nous vous notifions la décision prise le <b>{{date_cde}}</b> par le Conseil des études sur votre demande d'aménagements raisonnables introduite le <b>{{date_demande}}</b>.</p>
<p>{{phrase_decision}}</p>
${B('mise_en_oeuvre')}
${B('recours')}
${B('mode')}
${B('signature')}`,
});
declarerModele('ar_mesures', {
  libelle: "Aménagement raisonnable — fiche « mesures » pour les chargés de cours", galerie: 'amenagement_mesures', champs: CHAMPS_AR,
  blocs: { confidentiel: 'Encadré « document confidentiel » (secret professionnel)', identite: "Identité de l'étudiant",
    caracteristiques: 'Date de la décision, mise en œuvre, unités', mesures_accordees: 'Tableau des mesures retenues' },
  obligatoires: { blocs: ['confidentiel', 'identite', 'mesures_accordees'] },
  defaut: `${B('confidentiel')}
${B('identite')}
${B('caracteristiques')}
${B('mesures_accordees')}
<p>Un aménagement porte sur la manière d'accéder aux acquis d'apprentissage et de les évaluer, jamais sur les acquis eux-mêmes (art. 7, § 1er). Une question sur sa mise en œuvre s'adresse au secrétariat ou à la personne de référence{{reference}}.</p>`,
});
declarerModele('ar_formulaire', {
  libelle: "Aménagement raisonnable — demande (cadres A et B)", galerie: 'amenagement_formulaire', champs: CHAMPS_AR,
  blocs: { cadre_a: 'Cadre A — tableau de la demande', cadre_b: 'Cadre B — tableau du rapport', signatures: 'Cases de signature' },
  obligatoires: { blocs: ['cadre_a', 'cadre_b', 'signatures'] },
  defaut: `<h3>Cadre A — la demande de l'étudiant</h3>
${B('cadre_a')}
<h3>Cadre B — le rapport de la personne de référence</h3>
${B('cadre_b')}
${B('signatures')}`,
});

/** Les champs communs aux quatre pièces. */
function champsAR(d) {
  const ident = identiteEtablissement() || {};
  const e = d.etudiant;
  return {
    nom_prenom: nomEtudiant(e), civilite: feminin(e) ? 'Madame' : 'Madame, Monsieur',
    annee: esc(String(d.annee_scolaire).replace('-', '/')), section: esc(d.section_libelle || ''),
    date_demande: jour(d.date_demande), date_cde: jour(d.cde_date), date_recu: jour(d.cde_recu_le || d.transmis_cde_le),
    reference: d.personne_reference ? ` (${esc(d.personne_reference)})` : '',
    sens: SENS[d.sens] || 'statue sur la demande', ponctuation: d.sens === 'refuse' ? '.' : ' :',
    phrase_decision: d.sens === 'accepte'
      ? "Le Conseil des études a <b>accordé</b> les aménagements raisonnables décrits dans la décision ci-jointe."
      : d.sens === 'partiel'
        ? "Le Conseil des études a <b>accordé partiellement</b> votre demande : les mesures accordées et celles qui ne le sont pas, avec leurs motifs, figurent dans la décision ci-jointe."
        : "Le Conseil des études a <b>refusé</b> votre demande, pour les motifs exposés dans la décision ci-jointe.",
    delai: d.delai_mise_oeuvre ? esc(d.delai_mise_oeuvre) : 'dès réception',
    unites: unitesConcernees(d), ville: esc(ident.ville || 'Bruxelles'), directeur: esc(ident.directeur || '……………………'),
    date_lettre: jour(d.notifie_le || aujourdhui()),
  };
}

function corpsDecision(d) {
  const ident = identiteEtablissement() || {};
  return `<div class="attestation piece">
  ${enteteDocument({
    titre: "Décision relative à une demande d'aménagements raisonnables",
    sous: 'Conseil des études',
    ligne: ligneEntete(d, 'Décret du 30 juin 2016, art. 6'),
  })}
  ${composerModele('ar_decision', { champs: champsAR(d), blocs: {
    caracteristiques: `<div class="carac">
    <div>Demande introduite le <b>${jour(d.date_demande)}</b></div>
    <div>Reçue par le Conseil le <b>${jour(d.cde_recu_le || d.transmis_cde_le)}</b></div>
    <div class="large">Unités concernées : <b>${unitesConcernees(d)}</b></div>
  </div>`,
    identite: blocEtudiant(d),
    mesures_accordees: d.sens !== 'refuse' ? tableMesures(d.accordees) : '',
    mesures_refusees: d.refusees.length ? `<p class="corps">Les mesures suivantes ne sont pas accordées :</p>
    ${tableMesures(d.refusees, { avecMotif: true })}` : '',
    motivation: `<div class="info"><div class="titre">Motivation</div>
    <div class="ligne">${multi(d.cde_motivation)}</div></div>`,
    modalites: d.sens !== 'refuse' ? `<div class="champ"><span class="lab">Délai de mise en œuvre :</span>
      ${d.delai_mise_oeuvre ? esc(d.delai_mise_oeuvre) : 'dès la notification'}</div>
    ${d.conditions_particulieres ? `<div class="champ"><span class="lab">Conditions particulières :</span>
      ${multi(d.conditions_particulieres)}</div>` : ''}` : '',
    mention_art7: `<p class="corps" style="font-size:8pt;color:#475569">Un aménagement raisonnable ne remet
    pas en cause les acquis d'apprentissage définis dans les dossiers pédagogiques ; il porte
    sur la manière d'y accéder et de les évaluer (art. 7, § 1er).</p>`,
    recours: d.sens === 'accepte' ? '' : recours(),
    signature: cloture(`Fait à ${esc(ident.ville || 'Bruxelles')}, le ${jour(d.cde_date)}`,
      'Pour le Conseil des études,<br>le Directeur', ident.directeur || '……………………'),
  } })}
</div>`;
}

function corpsNotification(d) {
  const ident = identiteEtablissement() || {};
  const dateLettre = d.notifie_le || aujourdhui();
  return `<div class="attestation piece">
  ${enteteDocument({
    titre: "Notification d'une décision — aménagements raisonnables",
    sous: 'La Direction',
    ligne: ligneEntete(d, 'Décret du 30 juin 2016, art. 6, § 2'),
  })}
  ${composerModele('ar_notification', { champs: champsAR(d), blocs: {
    identite: blocEtudiant(d),
    mise_en_oeuvre: d.sens !== 'refuse' ? `<p class="corps">Ces aménagements sont mis en œuvre ${
      d.delai_mise_oeuvre ? esc(d.delai_mise_oeuvre) : 'dès réception de la présente'}. Seules
    les mesures retenues sont communiquées aux chargés de cours concernés ; la nature de votre
    situation reste couverte par le secret professionnel.</p>` : '',
    recours: d.sens === 'accepte' ? '' : recours(),
    mode: `<div class="champ"><span class="lab">Mode de notification :</span>
    ${d.notifie_par ? esc(MODES[d.notifie_par] || d.notifie_par) : '……………'}
    · <span class="lab">Copie :</span> la personne de référence${d.personne_reference
      ? ` (${esc(d.personne_reference)})` : ''}</div>`,
    signature: cloture(`Fait à ${esc(ident.ville || 'Bruxelles')}, le ${jour(dateLettre)}`,
      'Pour la Direction,<br>le Directeur', ident.directeur || '……………………'),
  } })}
</div>`;
}

function corpsMesures(d) {
  return `<div class="attestation piece">
  ${enteteDocument({
    titre: 'Aménagements raisonnables — mesures à mettre en œuvre',
    sous: 'À l’attention des chargés de cours',
    ligne: ligneEntete(d),
  })}
  ${composerModele('ar_mesures', { champs: champsAR(d), blocs: {
    confidentiel: `<div class="info orange"><div class="titre">Document confidentiel</div>
    <div class="ligne">Cette fiche ne porte que les mesures retenues par le Conseil des études.
      La situation de l'étudiant est couverte par le secret professionnel (décret du 30 juin
      2016, art. 5) : elle n'a pas à être recherchée ni évoquée.</div></div>`,
    identite: blocEtudiant(d),
    caracteristiques: `<div class="carac">
    <div>Décision du <b>${jour(d.cde_date)}</b></div>
    <div>Mise en œuvre : <b>${d.delai_mise_oeuvre ? esc(d.delai_mise_oeuvre) : 'dès réception'}</b></div>
    <div class="large">Unités concernées : <b>${unitesConcernees(d)}</b></div>
  </div>`,
    mesures_accordees: tableMesures(d.accordees),
  } })}
</div>`;
}

function corpsFormulaire(d) {
  const e = d.etudiant;
  const piece = { probant: 'Document probant (art. 7, § 2, 1°)',
                  rapport_specialiste: 'Rapport de spécialiste (art. 7, § 2, 2°)' }[d.piece_type];
  const ligne = (lab, val) => `<tr><td style="width:34%"><b>${lab}</b></td><td>${val || '<span class="vide">—</span>'}</td></tr>`;
  return `<div class="attestation piece">
  ${enteteDocument({
    titre: "Demande d'aménagements raisonnables",
    sous: 'Cadre A — l’étudiant · Cadre B — la personne de référence',
    ligne: ligneEntete(d, 'Pièce confidentielle — secret professionnel (art. 5)'),
  })}
  ${composerModele('ar_formulaire', { champs: champsAR(d), blocs: {
    cadre_a: `<table class="doc"><tbody>
    ${ligne('Étudiant', `${nomEtudiant(e)} · matricule ${esc(e.id_ecampus || '—')}`)}
    ${ligne('Date de la demande', jour(d.date_demande))}
    ${ligne('Unités concernées', unitesConcernees(d))}
    ${ligne('Aménagements demandés', listeMesures(d.mesures))}
    ${d.soins_specifiques ? ligne('Soins spécifiques', multi(d.soins_specifiques)) : ''}
    ${ligne('Difficultés entravant le parcours', multi(d.besoins))}
    ${ligne('Pièce produite', piece ? `${piece}${d.piece_date ? ` — ${jour(d.piece_date)}` : ''}${
      d.piece_auteur ? ` — ${esc(d.piece_auteur)}` : ''}${d.piece_reference ? ` — réf. ${esc(d.piece_reference)}` : ''}` : '')}
    ${ligne('Annexes', d.annexes_nb != null ? `${d.annexes_nb}${d.annexes_desc ? ` — ${esc(d.annexes_desc)}` : ''}` : esc(d.annexes_desc))}
    ${ligne("Signé par l'étudiant le", d.signe_etudiant_le ? jour(d.signe_etudiant_le) : '')}
    ${ligne('Reçu et signé le', d.signe_reference_le ? jour(d.signe_reference_le) : '')}
  </tbody></table>`,
    cadre_b: `<table class="doc"><tbody>
    ${ligne('Personne de référence', esc(d.personne_reference))}
    ${ligne('Aménagements matériels', listeMesures(d.mesures.filter(m => m.nature === 'materiel'), 'Non demandés'))}
    ${ligne('Aménagements pédagogiques', listeMesures(d.mesures.filter(m => m.nature !== 'materiel'), 'Non demandés'))}
    ${ligne('Annexes', d.rapport_annexes_nb != null ? `${d.rapport_annexes_nb}${d.rapport_annexes_desc ? ` — ${esc(d.rapport_annexes_desc)}` : ''}` : esc(d.rapport_annexes_desc))}
    ${ligne('Transmis au Conseil des études le', d.transmis_cde_le ? jour(d.transmis_cde_le) : '')}
    ${ligne('Reçu par le Conseil le', d.cde_recu_le ? jour(d.cde_recu_le) : '')}
  </tbody></table>`,
    signatures: `<table class="doc" style="margin-top:6mm"><tbody><tr>
    <td style="width:50%;height:24mm;vertical-align:top"><b>Signature de l'étudiant</b></td>
    <td style="vertical-align:top"><b>Signature de la personne de référence</b></td>
  </tr></tbody></table>`,
  } })}
</div>`;
}

/** Compose une pièce. Rend { html, nom } ou { erreur, manques, code }. */
export function composerPiece(type, d) {
  if (!TYPES_PIECE[type]) return { code: 400, erreur: 'pièce inconnue' };
  const manques = manquesPiece(type, d);
  if (manques.length) {
    return { code: 409, manques,
      erreur: `La pièce ne peut pas sortir : il manque ${manques.join(', ')}.` };
  }
  const e = d.etudiant;
  const base = `${String(e.nom || '').toUpperCase()}_${e.prenom || ''}_${d.annee_scolaire}`
    .replace(/[^A-Za-z0-9_-]+/g, '-');
  const saut = '<div class="saut"></div>';
  const corps = type === 'formulaire' ? corpsFormulaire(d)
    : type === 'decision' ? corpsDecision(d)
      // Une pièce par onglet, c'est une pièce tout court : la décision part
      // DANS la même enveloppe que la lettre qui la notifie.
      : type === 'notification' ? corpsNotification(d) + saut + corpsDecision(d)
        : corpsMesures(d);
  const nom = { formulaire: 'AR_Demande', decision: 'AR_Decision',
                notification: 'AR_Notification', mesures: 'AR_Mesures' }[type] + '_' + base;
  return { html: envelopper(corps, TYPES_PIECE[type]), nom };
}

/** Les chargés de cours des unités concernées, pour l'année du dossier. */
export function chargesDeCours(d) {
  let ues = d.ues.map(u => u.ue_num);
  if (!ues.length) {
    // Aucune unité cochée veut dire toutes : celles du programme de l'année.
    ues = db.prepare(`SELECT DISTINCT ue_num FROM etudiant_inscription
      WHERE etudiant_id = ? AND annee_scolaire = ?`).all(d.etudiant_id, d.annee_scolaire)
      .map(x => x.ue_num);
  }
  if (!ues.length) return [];
  const ph = ues.map(() => '?').join(',');
  return db.prepare(`
    SELECT p.id, p.nom, p.prenom, p.adresse_mail,
           GROUP_CONCAT(DISTINCT a.ue_num) AS ues
    FROM attribution a JOIN professeur p ON p.id = a.professeur_id
    WHERE a.annee_scolaire = ? AND a.ue_num IN (${ph})
    GROUP BY p.id ORDER BY p.nom, p.prenom
  `).all(d.annee_scolaire, ...ues).map(p => ({
    ...p, ues: String(p.ues || '').split(',').map(Number).filter(Boolean).sort((a, b) => a - b),
  }));
}
