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

// ── Recours ─────────────────────────────────────────────────────────────────
function accuseReception(d) {
  const p = d.etapes.plainte;
  return `<div class="attestation piece">
  ${enteteDocument({ titre: PIECES.accuse_reception.titre, sous: 'La Direction', ligne: ligne(d, 'RDE art. 88') })}
  ${blocEtudiant(d)}
  <p class="corps">La Direction de l'Institut accuse réception de la plainte introduite ${esc(MODE[p.mode] || '')}
    et reçue le <b>${jour(p.recue_le)}</b>, contre la décision de refus prise par le Conseil des études
    ${d.ue_num ? `pour l'unité d'enseignement <b>${d.ue_num}${d.ue_nom ? ` — ${esc(d.ue_nom)}` : ''}</b>` : ''}${
    d.session ? `, en ${d.session === 2 ? 'seconde' : 'première'} session` : ''}.</p>
  <div class="info"><div class="titre">Irrégularités invoquées</div><div class="ligne">${multi(p.griefs)}</div></div>
  <p class="corps">La recevabilité de la plainte est examinée au regard de l'article 88 §3 du règlement
    des études. Si elle est recevable, le Conseil des études se réunit en composition restreinte, et sa
    décision motivée vous est adressée par pli recommandé dans les sept jours calendrier, hors congés
    scolaires, qui suivent la publication des résultats${d.publie_le ? ` (publiés le ${jour(d.publie_le)})` : ''}
    (art. 89).</p>
  ${cloture(p.recue_le, 'Pour la Direction,', directeur())}
</div>`;
}

function irrecevabilite(d) {
  const r = d.etapes.recevabilite, p = d.etapes.plainte;
  return `<div class="attestation piece">
  ${enteteDocument({ titre: PIECES.irrecevabilite.titre, sous: 'La Direction', ligne: ligne(d, 'RDE art. 88 §3-4') })}
  ${blocEtudiant(d)}
  <p class="corps">${madame(d.etudiant)},</p>
  <p class="corps">La plainte que vous avez introduite et que la Direction a reçue le <b>${jour(p?.recue_le)}</b>
    est <b>déclarée irrecevable</b>, pour le motif suivant (art. 88 §4) :</p>
  <div class="info"><div class="titre">Motif</div><div class="ligne">${multi(r.motif)}</div></div>
  <p class="corps">À peine d'irrecevabilité, la plainte doit être écrite, respecter les mesures de forme,
    parvenir à la Direction dans les quatre jours calendrier suivant la publication des résultats,
    porter sur une décision de refus et mentionner les irrégularités procédurales précises qui la
    motivent (art. 88 §3).</p>
  <div class="info recours"><div class="titre">Voies de recours</div><div class="ligne">Vous pouvez introduire
    un recours externe par pli recommandé auprès de la Direction générale du Service général de
    l'Enseignement tout au long de la vie, rue Adolphe Lavallée 1, 1080 Bruxelles, avec copie à la
    Direction de l'Institut, dans les sept jours calendrier à compter du troisième jour ouvrable qui
    suit l'envoi de la présente (art. 90).</div></div>
  ${cloture(String(d.traces?.recevabilite?.le || aujourdhui()).slice(0, 10), 'Pour la Direction,', directeur())}
</div>`;
}

function decisionRecours(d) {
  const c = d.etapes.cde, x = d.etapes.decision, p = d.etapes.plainte;
  const pres = membresDe(d, ['president']), mem = membresDe(d, ['membre']);
  const accueilli = x.issue === 'accueilli';
  return `<div class="attestation piece">
  ${enteteDocument({ titre: PIECES.decision_recours.titre, sous: 'Conseil des études en composition restreinte', ligne: ligne(d, 'RDE art. 89') })}
  ${blocEtudiant(d)}
  <div class="carac">
    <div>Plainte reçue le <b>${jour(p?.recue_le)}</b></div>
    <div>CDE restreint réuni le <b>${jour(c.date)}</b></div>
    <div class="large">Président : <b>${esc(pres.map(m => m.nom).join(', ') || '—')}</b> ·
      membres : <b>${esc(mem.map(m => m.nom).join(', ') || '—')}</b></div>
  </div>
  <div class="info"><div class="titre">Irrégularités invoquées</div><div class="ligne">${multi(p?.griefs)}</div></div>
  <p class="corps">Après examen des griefs, le Conseil des études en composition restreinte
    <b>${accueilli ? 'ACCUEILLE le recours' : 'REJETTE le recours'}</b>${accueilli
      ? ' : la délibération de l’unité est rouverte pour l’étudiant, et une nouvelle décision lui sera notifiée.'
      : ' : la décision de refus est maintenue.'}</p>
  <div class="info"><div class="titre">Motivation</div><div class="ligne">${multi(x.motivation)}</div></div>
  ${accueilli ? '' : `<div class="info recours"><div class="titre">Voies de recours</div><div class="ligne">
    Vous pouvez introduire un recours externe par pli recommandé auprès de la Direction générale du
    Service général de l'Enseignement tout au long de la vie, rue Adolphe Lavallée 1, 1080 Bruxelles,
    avec copie à la Direction de l'Institut, dans les sept jours calendrier à compter du troisième jour
    ouvrable qui suit l'envoi de la présente décision. Y joindre la motivation du refus et la présente
    décision (art. 90).</div></div>`}
  ${cloture(c.date, 'Pour le Conseil des études,<br>le Président', pres[0]?.nom || directeur())}
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
  const rd = c.sanction_envisagee === 'renvoi_definitif';
  return `<div class="attestation piece">
  ${enteteDocument({ titre: PIECES.convocation.titre, sous: 'La Direction', ligne: ligne(d, 'RDE art. 115 ter-quater') })}
  ${blocEtudiant(d)}
  <p class="corps">${madame(d.etudiant)},</p>
  <p class="corps">${rd ? 'La présente vous informe de la <b>mise en œuvre d’une procédure d’exclusion définitive</b>. ' : ''}Vous
    êtes convoqué(e) à une audition le <b>${jour(c.audition_le)}</b>${c.heure ? ` à <b>${esc(c.heure)}</b>` : ''},
    <b>${esc(c.lieu)}</b>, au sujet des faits suivants :</p>
  ${faitsTexte(d)}
  <div class="champ"><span class="lab">Sanction envisagée :</span> ${esc(sanctionLib(c.sanction_envisagee))}
    <span class="ref">(art. ${esc(sanctionArt(c.sanction_envisagee))})</span></div>
  <p class="corps">Vous pouvez vous faire assister de la personne de votre choix tout au long de la
    procédure, faire entendre toute personne utile à votre défense et consulter votre dossier, sans
    déplacement de pièces, en présence de la Direction (art. 115 ter).</p>
  ${cloture(c.envoyee_le, 'Pour la Direction,', directeur())}
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
  ${blocEtudiant(d)}
  <div class="carac">
    <div>Audition du <b>${jour(a.tenue_le)}</b></div>
    <div>Étudiant(e) ${a.etudiant_present ? '<b>présent(e)</b>' : '<b>absent(e)</b>'}${a.assiste_par ? `, assisté(e) de <b>${esc(a.assiste_par)}</b>` : ''}</div>
    <div class="large">Procès-verbal rédigé par <b>${esc(red.map(m => m.nom).join(', ') || '—')}</b></div>
  </div>
  ${faitsTexte(d)}
  ${a.conteste ? '<p class="corps">L’étudiant(e) conteste les faits : les parties ont été entendues séparément, puis contradictoirement (art. 73 §3).</p>' : ''}
  <div class="info"><div class="titre">Déclarations</div><div class="ligne">${multi(a.declarations || '—')}</div></div>
  <p class="corps">${PV[a.pv] || ''}</p>
  <div class="sig" style="display:flex;gap:20mm;margin-top:14mm">
    <div style="flex:1;border-top:0.25mm solid #94a3b8;padding-top:1.5mm;font-size:9pt">L'étudiant(e)</div>
    <div style="flex:1;border-top:0.25mm solid #94a3b8;padding-top:1.5mm;font-size:9pt">La Direction ou son délégué</div>
    <div style="flex:1;border-top:0.25mm solid #94a3b8;padding-top:1.5mm;font-size:9pt">Le membre du personnel</div>
  </div>
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
  ${blocEtudiant(d)}
  ${faitsTexte(d)}
  ${av ? `<div class="champ"><span class="lab">Avis du Conseil des études (${jour(av.rendu_le)}) :</span> ${multi(av.avis)}</div>` : ''}
  <p class="corps">Vu le procès-verbal d'audition${d.etapes.audition ? ` du ${jour(d.etapes.audition.tenue_le)}` : ''}, la
    sanction suivante est prononcée : <b>${esc(sanctionLib(x.sanction))}</b> (art. ${esc(sanctionArt(x.sanction))}).</p>
  ${acad}
  <div class="info"><div class="titre">Motivation — faits, dispositions appliquées, gravité (art. 119)</div>
    <div class="ligne">${multi(x.motivation)}</div></div>
  <div class="info recours"><div class="titre">Voies de recours</div><div class="ligne">${
    x.sanction === 'renvoi_definitif'
      ? 'Un recours interne peut être introduit auprès du Pouvoir organisateur, par lettre recommandée dûment motivée, dans les quatre jours ouvrables qui suivent la notification ; il n’est pas suspensif (art. 119 bis). Les voies de droit commun restent ouvertes (art. 119 ter).'
      : d.nature === 'fraude'
        ? 'La sanction académique (ajournement ou refus) relève du recours prévu aux articles 87 à 91 du règlement des études (art. 119 quater).'
        : 'Les voies de recours de droit commun restent ouvertes devant les juridictions compétentes (art. 119 ter).'}</div></div>
  ${cloture(d.etapes.notification?.envoyee_le || aujourdhui(), 'Pour la Direction,', directeur())}
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
