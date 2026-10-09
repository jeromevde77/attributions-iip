// ─────────────────────────────────────────────────────────────────────────────
// Lucie — LES PIÈCES DES RECOURS ET DE LA DISCIPLINE (RDE 2026-2027)
//
// Six pièces, composées dans l'enveloppe des pièces nominatives (celle des
// attestations et des aménagements raisonnables) — plus d'enveloppe maison, de
// logo recopié ni d'adresse en dur :
//   recours       : accusé de réception · décision d'irrecevabilité ·
//                   décision motivée du CDE restreint ;
//   disciplinaire : convocation · procès-verbal d'audition · décision motivée.
// Une pièce ne sort pas tant que manque ce qu'elle doit dire (le serveur nomme
// ce qui manque) : un document à trous se complète à la main, et c'est cette
// main qu'on ne retrouve plus un an après.
// ─────────────────────────────────────────────────────────────────────────────
import { envelopper } from '../routes/attestations.js';
import { enteteDocument } from './document.js';
import { identiteEtablissement } from '../routes/config.js';
import { SANCTIONS, TYPES_FRAUDE } from './procedures.js';
import { composerModele, declarerModele, blocModele } from './modelesPieces.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const multi = s => esc(s).replace(/\n/g, '<br>');
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
function jour(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${Number(m[3])} ${MOIS[Number(m[2]) - 1]} ${m[1]}` : '……………';
}
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const MODE = { recommande: 'par courrier recommandé avec accusé de réception', main_propre: 'par remise en main propre contre accusé de réception' };

export const PIECES = {
  accuse_reception:       { type: 'recours',       titre: 'Accusé de réception d’une plainte', etape: 'plainte' },
  irrecevabilite:         { type: 'recours',       titre: 'Décision d’irrecevabilité d’une plainte', etape: 'recevabilite' },
  decision_recours:       { type: 'recours',       titre: 'Décision motivée sur recours interne', etape: 'decision' },
  convocation:            { type: 'disciplinaire', titre: 'Convocation à une audition', etape: 'convocation' },
  pv_audition:            { type: 'disciplinaire', titre: 'Procès-verbal d’audition', etape: 'audition' },
  decision_disciplinaire: { type: 'disciplinaire', titre: 'Décision motivée', etape: 'decision' },
};

/** Ce qui manque pour produire la pièce. */
export function manquesPiece(piece, d) {
  const p = PIECES[piece];
  if (!p) return ['une pièce connue'];
  if (p.type !== d.type) return ['une pièce de ce type de dossier'];
  const m = [];
  if (!d.etapes?.[p.etape]) m.push(`l'étape « ${p.etape} »`);
  if (piece === 'irrecevabilite' && d.etapes?.recevabilite?.recevable !== false) m.push('une plainte déclarée irrecevable');
  if (piece === 'decision_recours' && !d.etapes?.cde) m.push('la réunion du CDE restreint');
  return m;
}

const nomEtud = e => `${esc(String(e.nom || '').toUpperCase())} ${esc(e.prenom || '')}`.trim();
const madame = e => (/^(mme|madame|mlle)/i.test(String(e.titre || '')) ? 'Madame' : 'Madame, Monsieur');
function blocEtudiant(d) {
  const e = d.etudiant;
  return `<div class="etudiant"><div class="nom">${nomEtud(e)}</div>
    <div class="naissance">Matricule ${esc(e.id_ecampus || '—')}${e.adresse
      ? ` · ${esc([e.adresse, [e.cp, e.localite].filter(Boolean).join(' ')].filter(Boolean).join(', '))}` : ''}</div></div>`;
}
function ligne(d, art) {
  return [`Année ${String(d.annee_scolaire).replace('-', '/')}`, d.section,
    d.ue_num ? `UE ${d.ue_num}${d.ue_nom ? ` — ${esc(d.ue_nom)}` : ''}` : null, art].filter(Boolean).join(' · ');
}
function cloture(date, qualite, nom) {
  return `<div class="cloture sans-paraphe"><div class="sceau"></div><div class="paraphe"></div>
    <div class="lieu">Fait à ${esc((identiteEtablissement() || {}).ville || 'Bruxelles')}, le ${jour(date)}</div>
    <div class="legende"><div class="qualite">${qualite}</div><div class="nom">${esc(nom)}</div></div></div>`;
}
const directeur = () => (identiteEtablissement() || {}).directeur || '……………………';
const membresDe = (d, roles) => (d.membres || []).filter(m => roles.includes(m.role) && m.present);
const sanctionLib = c => (SANCTIONS.find(s => s[0] === c) || [null, c || '—', ''])[1];
const sanctionArt = c => (SANCTIONS.find(s => s[0] === c) || [null, null, ''])[2];

/* LES TEXTES DES SIX PIÈCES SE CORRIGENT DANS LUCIE (Galerie des pièces →
   Modifier le modèle ; lib/modelesPieces.js). Les faits, griefs, motifs,
   motivations, voies de recours et signatures restent des blocs verrouillés. */
const B = blocModele;
const CHAMPS_PROC = {
  nom_prenom: "Nom et prénom de l'étudiant", civilite: 'Madame / Madame, Monsieur', annee: 'Année académique',
  unite: "« pour l'unité d'enseignement … » (si une UE)", session: '« , en première / seconde session »',
  mode: 'Mode d’introduction de la plainte', recue_le: 'Plainte reçue le', publie: '« (publiés le …) »',
  issue: 'ACCUEILLE / REJETTE le recours', suite: 'Conséquence de la décision', audition_le: "Date de l'audition",
  heure: '« à HH:MM »', lieu: "Lieu de l'audition", annonce_exclusion: 'Annonce d’une procédure d’exclusion (si renvoi)',
  du_audition: '« du … » (date de l’audition)', sanction: 'Sanction prononcée', sanction_art: 'Article de la sanction',
  directeur: 'Directeur', ville: 'Ville',
};
const DEF_PROC = {
  accuse_reception: { blocs: { identite: "Identité de l'étudiant", griefs: 'Irrégularités invoquées', signature: 'Lieu, date et signature' },
    oblig: ['identite', 'griefs', 'signature'],
    defaut: `${B('identite')}
<p>La Direction de l'Institut accuse réception de la plainte introduite {{mode}} et reçue le <b>{{recue_le}}</b>, contre la décision de refus prise par le Conseil des études{{unite}}{{session}}.</p>
${B('griefs')}
<p>La recevabilité de la plainte est examinée au regard de l'article 88 §3 du règlement des études. Si elle est recevable, le Conseil des études se réunit en composition restreinte, et sa décision motivée vous est adressée par pli recommandé dans les sept jours calendrier, hors congés scolaires, qui suivent la publication des résultats{{publie}} (art. 89).</p>
${B('signature')}` },
  irrecevabilite: { blocs: { identite: "Identité de l'étudiant", motif: "Motif de l'irrecevabilité", recours: 'Voies de recours', signature: 'Lieu, date et signature' },
    oblig: ['identite', 'motif', 'recours', 'signature'],
    defaut: `${B('identite')}
<p>{{civilite}},</p>
<p>La plainte que vous avez introduite et que la Direction a reçue le <b>{{recue_le}}</b> est <b>déclarée irrecevable</b>, pour le motif suivant (art. 88 §4) :</p>
${B('motif')}
<p>À peine d'irrecevabilité, la plainte doit être écrite, respecter les mesures de forme, parvenir à la Direction dans les quatre jours calendrier suivant la publication des résultats, porter sur une décision de refus et mentionner les irrégularités procédurales précises qui la motivent (art. 88 §3).</p>
${B('recours')}
${B('signature')}` },
  decision_recours: { blocs: { identite: "Identité de l'étudiant", caracteristiques: 'Dates, président et membres du CDE restreint',
      griefs: 'Irrégularités invoquées', motivation: 'Motivation', recours: 'Voies de recours (si rejeté)', signature: 'Lieu, date et signature' },
    oblig: ['identite', 'caracteristiques', 'griefs', 'motivation', 'recours', 'signature'],
    defaut: `${B('identite')}
${B('caracteristiques')}
${B('griefs')}
<p>Après examen des griefs, le Conseil des études en composition restreinte <b>{{issue}}</b>{{suite}}</p>
${B('motivation')}
${B('recours')}
${B('signature')}` },
  convocation: { blocs: { identite: "Identité de l'étudiant", faits: 'Faits reprochés', sanction: 'Sanction envisagée', signature: 'Lieu, date et signature' },
    oblig: ['identite', 'faits', 'sanction', 'signature'],
    defaut: `${B('identite')}
<p>{{civilite}},</p>
<p>{{annonce_exclusion}}Vous êtes convoqué(e) à une audition le <b>{{audition_le}}</b>{{heure}}, <b>{{lieu}}</b>, au sujet des faits suivants :</p>
${B('faits')}
${B('sanction')}
<p>Vous pouvez vous faire assister de la personne de votre choix tout au long de la procédure, faire entendre toute personne utile à votre défense et consulter votre dossier, sans déplacement de pièces, en présence de la Direction (art. 115 ter).</p>
${B('signature')}` },
  pv_audition: { blocs: { identite: "Identité de l'étudiant", caracteristiques: "Date, présence et rédacteur de l'audition",
      faits: 'Faits reprochés', conteste: 'Mention : faits contestés (si c’est le cas)', declarations: 'Déclarations',
      mention_pv: 'Signature ou refus de signer de l’étudiant', signatures: 'Cases de signature' },
    oblig: ['identite', 'caracteristiques', 'faits', 'declarations', 'mention_pv', 'signatures'],
    defaut: `${B('identite')}
${B('caracteristiques')}
${B('faits')}
${B('conteste')}
${B('declarations')}
${B('mention_pv')}
${B('signatures')}` },
  decision_disciplinaire: { blocs: { identite: "Identité de l'étudiant", faits: 'Faits reprochés', avis: 'Avis du Conseil des études',
      academique: 'Sanction académique (fraude, art. 75)', motivation: 'Motivation (art. 119)', recours: 'Voies de recours', signature: 'Lieu, date et signature' },
    oblig: ['identite', 'faits', 'academique', 'motivation', 'recours', 'signature'],
    defaut: `${B('identite')}
${B('faits')}
${B('avis')}
<p>Vu le procès-verbal d'audition{{du_audition}}, la sanction suivante est prononcée : <b>{{sanction}}</b> (art. {{sanction_art}}).</p>
${B('academique')}
${B('motivation')}
${B('recours')}
${B('signature')}` },
};
for (const [k, v] of Object.entries(DEF_PROC)) {
  declarerModele(`proc_${k}`, { libelle: `Procédure — ${PIECES[k].titre}`, galerie: `procedure_${k}`, champs: CHAMPS_PROC,
    blocs: v.blocs, obligatoires: { blocs: v.oblig }, defaut: v.defaut });
}
const RECOURS_EXTERNE = `<div class="info recours"><div class="titre">Voies de recours</div><div class="ligne">Vous pouvez introduire
    un recours externe par pli recommandé auprès de la Direction générale du Service général de
    l'Enseignement tout au long de la vie, rue Adolphe Lavallée 1, 1080 Bruxelles, avec copie à la
    Direction de l'Institut, dans les sept jours calendrier à compter du troisième jour ouvrable qui
    suit l'envoi de la présente (art. 90).</div></div>`;

/** Les champs communs, et la composition par le modèle. */
function parModele(piece, d, blocs) {
  const p = d.etapes.plainte || {}, c = d.etapes.convocation || {}, x = d.etapes.decision || {};
  const accueilli = x.issue === 'accueilli';
  return composerModele(`proc_${piece}`, { blocs, champs: {
    nom_prenom: nomEtud(d.etudiant), civilite: madame(d.etudiant), annee: esc(String(d.annee_scolaire).replace('-', '/')),
    unite: d.ue_num ? ` pour l'unité d'enseignement <b>${d.ue_num}${d.ue_nom ? ` — ${esc(d.ue_nom)}` : ''}</b>` : '',
    session: d.session ? `, en ${d.session === 2 ? 'seconde' : 'première'} session` : '',
    mode: esc(MODE[p.mode] || ''), recue_le: jour(p.recue_le),
    publie: d.publie_le ? ` (publiés le ${jour(d.publie_le)})` : '',
    issue: accueilli ? 'ACCUEILLE le recours' : 'REJETTE le recours',
    suite: accueilli ? ' : la délibération de l’unité est rouverte pour l’étudiant, et une nouvelle décision lui sera notifiée.'
      : ' : la décision de refus est maintenue.',
    audition_le: jour(c.audition_le), heure: c.heure ? ` à <b>${esc(c.heure)}</b>` : '', lieu: esc(c.lieu || ''),
    annonce_exclusion: c.sanction_envisagee === 'renvoi_definitif' ? 'La présente vous informe de la <b>mise en œuvre d’une procédure d’exclusion définitive</b>. ' : '',
    du_audition: d.etapes.audition ? ` du ${jour(d.etapes.audition.tenue_le)}` : '',
    sanction: esc(sanctionLib(x.sanction)), sanction_art: esc(sanctionArt(x.sanction)),
    directeur: esc(directeur()), ville: esc((identiteEtablissement() || {}).ville || 'Bruxelles'),
  } });
}

// ── Recours ─────────────────────────────────────────────────────────────────
function accuseReception(d) {
  const p = d.etapes.plainte;
  return `<div class="attestation piece">
  ${enteteDocument({ titre: PIECES.accuse_reception.titre, sous: 'La Direction', ligne: ligne(d, 'RDE art. 88') })}
  ${parModele('accuse_reception', d, {
    identite: blocEtudiant(d),
    griefs: `<div class="info"><div class="titre">Irrégularités invoquées</div><div class="ligne">${multi(p.griefs)}</div></div>`,
    signature: cloture(p.recue_le, 'Pour la Direction,', directeur()),
  })}
</div>`;
}

function irrecevabilite(d) {
  const r = d.etapes.recevabilite;
  return `<div class="attestation piece">
  ${enteteDocument({ titre: PIECES.irrecevabilite.titre, sous: 'La Direction', ligne: ligne(d, 'RDE art. 88 §3-4') })}
  ${parModele('irrecevabilite', d, {
    identite: blocEtudiant(d),
    motif: `<div class="info"><div class="titre">Motif</div><div class="ligne">${multi(r.motif)}</div></div>`,
    recours: RECOURS_EXTERNE,
    signature: cloture(String(d.traces?.recevabilite?.le || aujourdhui()).slice(0, 10), 'Pour la Direction,', directeur()),
  })}
</div>`;
}

function decisionRecours(d) {
  const c = d.etapes.cde, x = d.etapes.decision, p = d.etapes.plainte;
  const pres = membresDe(d, ['president']), mem = membresDe(d, ['membre']);
  const accueilli = x.issue === 'accueilli';
  return `<div class="attestation piece">
  ${enteteDocument({ titre: PIECES.decision_recours.titre, sous: 'Conseil des études en composition restreinte', ligne: ligne(d, 'RDE art. 89') })}
  ${parModele('decision_recours', d, {
    identite: blocEtudiant(d),
    caracteristiques: `<div class="carac">
    <div>Plainte reçue le <b>${jour(p?.recue_le)}</b></div>
    <div>CDE restreint réuni le <b>${jour(c.date)}</b></div>
    <div class="large">Président : <b>${esc(pres.map(m => m.nom).join(', ') || '—')}</b> ·
      membres : <b>${esc(mem.map(m => m.nom).join(', ') || '—')}</b></div>
  </div>`,
    griefs: `<div class="info"><div class="titre">Irrégularités invoquées</div><div class="ligne">${multi(p?.griefs)}</div></div>`,
    motivation: `<div class="info"><div class="titre">Motivation</div><div class="ligne">${multi(x.motivation)}</div></div>`,
    recours: accueilli ? '' : `<div class="info recours"><div class="titre">Voies de recours</div><div class="ligne">
    Vous pouvez introduire un recours externe par pli recommandé auprès de la Direction générale du
    Service général de l'Enseignement tout au long de la vie, rue Adolphe Lavallée 1, 1080 Bruxelles,
    avec copie à la Direction de l'Institut, dans les sept jours calendrier à compter du troisième jour
    ouvrable qui suit l'envoi de la présente décision. Y joindre la motivation du refus et la présente
    décision (art. 90).</div></div>`,
    signature: cloture(c.date, 'Pour le Conseil des études,<br>le Président', pres[0]?.nom || directeur()),
  })}
</div>`;
}

// ── Discipline ──────────────────────────────────────────────────────────────
function faitsTexte(d) {
  const f = d.etapes.faits || {};
  const t = d.nature === 'fraude'
    ? `Fraude constatée ${f.moment === 'correction' ? 'lors de la correction' : 'pendant l’épreuve'} du ${jour(f.date)} — ${
      esc((TYPES_FRAUDE.find(x => x[0] === f.type_fraude) || [])[1] || '')} (art. 72).`
    : `Faits du ${jour(f.date)}.`;
  return `<div class="info"><div class="titre">Faits reprochés</div><div class="ligne">${t}<br>${multi(f.description)}</div></div>`;
}
function convocation(d) {
  const c = d.etapes.convocation;
  return `<div class="attestation piece">
  ${enteteDocument({ titre: PIECES.convocation.titre, sous: 'La Direction', ligne: ligne(d, 'RDE art. 115 ter-quater') })}
  ${parModele('convocation', d, {
    identite: blocEtudiant(d),
    faits: faitsTexte(d),
    sanction: `<div class="champ"><span class="lab">Sanction envisagée :</span> ${esc(sanctionLib(c.sanction_envisagee))}
    <span class="ref">(art. ${esc(sanctionArt(c.sanction_envisagee))})</span></div>`,
    signature: cloture(c.envoyee_le, 'Pour la Direction,', directeur()),
  })}
</div>`;
}
function pvAudition(d) {
  const a = d.etapes.audition;
  const red = membresDe(d, ['redacteur']);
  const PV = { signe: 'Le présent procès-verbal est signé par l’étudiant(e).',
    refus_constate: 'L’étudiant(e) refuse de signer ; le refus est constaté par deux membres du personnel (art. 115 quinquies).',
    absent: 'L’étudiant(e), régulièrement convoqué(e), ne s’est pas présenté(e).' };
  return `<div class="attestation piece">
  ${enteteDocument({ titre: PIECES.pv_audition.titre, sous: 'La Direction', ligne: ligne(d, 'RDE art. 115 quinquies') })}
  ${parModele('pv_audition', d, {
    identite: blocEtudiant(d),
    caracteristiques: `<div class="carac">
    <div>Audition du <b>${jour(a.tenue_le)}</b></div>
    <div>Étudiant(e) ${a.etudiant_present ? '<b>présent(e)</b>' : '<b>absent(e)</b>'}${a.assiste_par ? `, assisté(e) de <b>${esc(a.assiste_par)}</b>` : ''}</div>
    <div class="large">Procès-verbal rédigé par <b>${esc(red.map(m => m.nom).join(', ') || '—')}</b></div>
  </div>`,
    faits: faitsTexte(d),
    conteste: a.conteste ? '<p class="corps">L’étudiant(e) conteste les faits : les parties ont été entendues séparément, puis contradictoirement (art. 73 §3).</p>' : '',
    declarations: `<div class="info"><div class="titre">Déclarations</div><div class="ligne">${multi(a.declarations || '—')}</div></div>`,
    mention_pv: `<p class="corps">${PV[a.pv] || ''}</p>`,
    signatures: `<div class="sig" style="display:flex;gap:20mm;margin-top:14mm">
    <div style="flex:1;border-top:0.25mm solid #94a3b8;padding-top:1.5mm;font-size:9pt">L'étudiant(e)</div>
    <div style="flex:1;border-top:0.25mm solid #94a3b8;padding-top:1.5mm;font-size:9pt">La Direction ou son délégué</div>
    <div style="flex:1;border-top:0.25mm solid #94a3b8;padding-top:1.5mm;font-size:9pt">Le membre du personnel</div>
  </div>`,
  })}
</div>`;
}
function decisionDisciplinaire(d) {
  const x = d.etapes.decision, av = d.etapes.avis;
  const acad = d.nature === 'fraude'
    ? (x.academique === 'refuse'
      ? `<p class="corps">En application de l'article 75 §1, l'étudiant(e) est <b>refusé(e)</b> pour l'unité d'enseignement
          ${d.ue_num}${d.recidive?.length ? ' (récidive)' : ''}.</p>`
      : `<p class="corps">En application de l'article 75 §1, l'étudiant(e) est <b>ajourné(e)</b> pour les acquis
          d'apprentissage visés par l'épreuve : <b>${esc((d.acquis || []).map(a => a.aa_code).join(', '))}</b>.</p>`)
    : '';
  return `<div class="attestation piece">
  ${enteteDocument({ titre: PIECES.decision_disciplinaire.titre, sous: 'La Direction', ligne: ligne(d, d.nature === 'fraude' ? 'RDE art. 75 · 115 · 119' : 'RDE art. 115 · 118 · 119') })}
  ${parModele('decision_disciplinaire', d, {
    identite: blocEtudiant(d),
    faits: faitsTexte(d),
    avis: av ? `<div class="champ"><span class="lab">Avis du Conseil des études (${jour(av.rendu_le)}) :</span> ${multi(av.avis)}</div>` : '',
    academique: acad,
    motivation: `<div class="info"><div class="titre">Motivation — faits, dispositions appliquées, gravité (art. 119)</div>
    <div class="ligne">${multi(x.motivation)}</div></div>`,
    recours: `<div class="info recours"><div class="titre">Voies de recours</div><div class="ligne">${
    x.sanction === 'renvoi_definitif'
      ? 'Un recours interne peut être introduit auprès du Pouvoir organisateur, par lettre recommandée dûment motivée, dans les quatre jours ouvrables qui suivent la notification ; il n’est pas suspensif (art. 119 bis). Les voies de droit commun restent ouvertes (art. 119 ter).'
      : d.nature === 'fraude'
        ? 'La sanction académique (ajournement ou refus) relève du recours prévu aux articles 87 à 91 du règlement des études (art. 119 quater).'
        : 'Les voies de recours de droit commun restent ouvertes devant les juridictions compétentes (art. 119 ter).'}</div></div>`,
    signature: cloture(d.etapes.notification?.envoyee_le || aujourdhui(), 'Pour la Direction,', directeur()),
  })}
</div>`;
}

const CORPS = { accuse_reception: accuseReception, irrecevabilite, decision_recours: decisionRecours,
  convocation, pv_audition: pvAudition, decision_disciplinaire: decisionDisciplinaire };

/** Compose une pièce : { html, nom } ou { code, erreur, manques }. */
export function composerPieceProcedure(piece, d) {
  const manques = manquesPiece(piece, d);
  if (manques.length) return { code: 409, manques, erreur: `La pièce ne peut pas sortir : il manque ${manques.join(', ')}.` };
  const e = d.etudiant;
  const nom = `${piece}_${String(e.nom || '').toUpperCase()}_${e.prenom || ''}_${d.annee_scolaire}`.replace(/[^A-Za-z0-9_-]+/g, '-');
  return { html: envelopper(CORPS[piece](d), PIECES[piece].titre), nom };
}
