// ─────────────────────────────────────────────────────────────────────────────
// Les pièces du congé-éducation payé (voir lib/cep.js pour le cadre).
//
// Une page par UNITÉ, suivie de son horaire détaillé : c'est ainsi que
// l'employeur les reçoit et que le service régional les contrôle — une unité
// est une formation, avec son début, sa fin et ses heures. Toutes les pages
// partent dans UNE enveloppe : une pièce par onglet, c'est une pièce tout court.
//
// AUCUNE ATTESTATION D'ASSIDUITÉ NE SORT AVEC DES SÉANCES PASSÉES NON
// ENCODÉES. Une heure « ni présente ni absente » ne peut pas s'attester, et
// c'est sur ce document que l'employeur se fait rembourser : le serveur nomme
// les séances qui manquent plutôt que de sortir une pièce fausse.
// ─────────────────────────────────────────────────────────────────────────────

import { composerModele, declarerModele, blocModele } from './modelesPieces.js';
import db from '../db/index.js';
import { envelopper, frDate } from '../routes/attestations.js';
import { enteteDocument } from './document.js';
import { identiteEtablissement } from '../routes/config.js';
import { sectionRattachement } from '../routes/etudiants.js';
import { cepDe, dossierCepUE, unitesInscrites, congesDe, heures, REGIONS } from './cep.js';

export const TYPES_PIECE_CEP = {
  inscription: "Attestation d'inscription régulière — congé-éducation payé",
  assiduite: "Attestation d'assiduité — congé-éducation payé",
  seconde_session: "Attestation de seconde session d'examens — congé-éducation payé",
};

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const jour = d => (d ? frDate(d) : '……………');
const h = min => `${heures(min)} h`;
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const hh = t => String(t || '').slice(0, 5);
const court = d => String(d || '').slice(0, 10).split('-').reverse().join('/');
const NIVEAUX = { DS: 'Secondaire supérieur', SUP: 'Supérieur de type court' };

function feminin(e) {
  return /^(mme|madame|mlle|mademoiselle|m\.?me)\b/i.test(String(e.titre || '').trim());
}

/** Tout ce que les pièces lisent d'un étudiant, ou l'erreur qui les arrête. */
export function chargerCep(etudId, annee, { jusquau } = {}) {
  const e = db.prepare(`SELECT id, nom, prenom, id_ecampus, titre, date_naissance, lieu_naissance,
      adresse, cp, localite, sortie_statut, sortie_le FROM etudiant WHERE id = ?`).get(Number(etudId));
  if (!e) return { code: 404, erreur: 'étudiant introuvable' };
  const cep = cepDe(e.id, annee);
  if (!cep) return { code: 409, erreur: `L'étudiant n'est pas marqué « congé-éducation payé » pour ${annee} (fiche de l'étudiant).` };
  if (cep.region === 'flandre') {
    return { code: 409, erreur: "Employeur en Flandre : le Vlaams opleidingsverlof ne passe pas par ces attestations. "
      + "L'inscription et les présences s'encodent sur la plateforme de l'autorité flamande." };
  }
  let section = null;
  try { section = sectionRattachement(e.id, annee).section || null; } catch { /* */ }
  const sectionLib = section ? (db.prepare('SELECT libelle FROM section WHERE code = ?').get(section)?.libelle || section) : null;
  const unites = unitesInscrites(e.id, annee)
    .filter(u => !u.epreuve_integree)
    .map(u => ({ ...u, ...dossierCepUE(e.id, u.ue_num, annee, jusquau) }));
  return { etudiant: e, cep, annee, section, section_libelle: sectionLib, unites, conges: congesDe(annee),
    session2: secondeSession(e.id, annee) };
}

/** Ce qui manque pour qu'une pièce parte — vide quand tout y est. */
export function manquesCep(type, d) {
  const m = [];
  const e = d.etudiant;
  if (!e.date_naissance) m.push('la date de naissance');
  if (!e.lieu_naissance) m.push('le lieu de naissance');
  if (!e.adresse || !e.localite) m.push("l'adresse de domicile");
  if (type === 'seconde_session') {
    if (!d.session2?.length) m.push("une unité ajournée en première session cette année, avec la date de sa seconde session (feuille de délibération)");
    return m;
  }
  if (!d.unites.length) m.push("une unité inscrite cette année (l'épreuve intégrée n'ouvre pas le droit)");
  const sansHoraire = d.unites.filter(u => !u.nb_seances);
  if (sansHoraire.length) {
    m.push(`l'horaire de ${sansHoraire.map(u => `l'UE ${u.ue_num}`).join(', ')} (Organisation → Horaires)`);
  }
  if (type === 'assiduite') {
    for (const u of d.unites) {
      const nonEnc = u.periodes.filter(p => p.commencee).flatMap(p => p.non_encodees);
      if (nonEnc.length) {
        const dates = [...new Set(nonEnc.map(s => frDate(s.date)))].slice(0, 4).join(', ');
        m.push(`les présences de ${nonEnc.length} séance(s) de l'UE ${u.ue_num} (${dates}${nonEnc.length > 4 ? '…' : ''}) — Mes cours → Présences`);
      }
    }
  }
  return m;
}

/* LA SECONDE SESSION (annexe II de l'A.M. du 20 août 1985) : chaque unité où l'étudiant est AJOURNÉ en première session
   de l'année. Les dates viennent de la feuille de délibération (dates d'épreuve par cours, à défaut celle de la séance) ;
   une décision de seconde session prise vaut confirmation de la participation, avec la date du dernier examen. */
function secondeSession(etudId, annee) {
  try {
    const l = db.prepare(`SELECT r.ue_num, (SELECT ue_nom FROM ue WHERE ue_num = r.ue_num ORDER BY (annee_scolaire = ?) DESC LIMIT 1) ue_nom
      FROM deliberation_resultat r WHERE r.etudiant_id = ? AND r.annee_scolaire = ? AND r.session = 1 AND r.resultat = 'ajourne'
      ORDER BY r.ue_num`).all(annee, etudId, annee);
    return l.map(u => {
      const dates = db.prepare(`SELECT MIN(s2_date) du, MAX(s2_date) au FROM deliberation_session2
        WHERE ue_num = ? AND annee_scolaire = ? AND COALESCE(s2_date, '') <> ''`).get(u.ue_num, annee) || {};
      const seance = db.prepare(`SELECT MIN(session2_date) d FROM deliberation_seance WHERE ue_num = ? AND annee_scolaire = ?
        AND session = 1 AND COALESCE(session2_date, '') <> ''`).get(u.ue_num, annee)?.d || null;
      const s2 = db.prepare(`SELECT resultat FROM deliberation_resultat WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?
        AND session = 2 AND COALESCE(resultat, '') <> ''`).get(etudId, annee, u.ue_num);
      const du = dates.du || seance, au = dates.au || seance;
      return { ue_num: u.ue_num, ue_nom: u.ue_nom, du, au, participe: !!s2 };
    }).filter(u => u.du);
  } catch { return []; }
}

/* ─────────────────────────────────────────────────────────────────────────────
   LE MODÈLE OFFICIEL, DANS LA CHARTE DE LUCIE (Charles, 1er novembre 2026 : « copie du modèle officiel, mais dans la police
   de Lucie, avec la base de page de Lucie, ma signature et le QR, dans les couleurs de Lucie »).
   Les rubriques, leur ordre et leurs intitulés sont ceux de l'annexe I bis de l'arrêté ministériel du 20 août 1985
   (« conforme au modèle ») — formation modulaire : des périodes de trois mois à compter du début de l'unité — et de son
   annexe II pour la seconde session. L'enveloppe (en-tête, pied « produit par »), la signature, le cachet et le QR
   d'authenticité sont ceux de toutes les pièces de Lucie.
   ───────────────────────────────────────────────────────────────────────────── */
const MARINE = '#1B2B4B', OR = '#C9A84C', FILET = '#D8DCE4', GRIS = '#5B6B82';
const LAB = `font-size:7pt;letter-spacing:.06em;text-transform:uppercase;color:${GRIS}`;
const lab = t => `<span style="${LAB}">${t}</span>`;
const val = t => `<b style="color:${MARINE}">${t}</b>`;
const boite = t => `<span style="display:inline-block;min-width:24mm;padding:0.6mm 2.5mm;border:0.3mm solid ${MARINE};border-radius:1mm;text-align:center;font-weight:700;color:${MARINE}">${t}</span>`;

const BASES = {
  bruxelles: "loi de redressement du 22 janvier 1985, art. 107 à 136 ; arrêté du Gouvernement de la Région de Bruxelles-Capitale du 29 juin 2023",
  wallonie: "loi de redressement du 22 janvier 1985, art. 107 à 136 ; arrêté royal du 23 juillet 1985 d'exécution, art. 21, tel que modifié par le Gouvernement wallon",
};
function blocCadre(d, annexe) {
  return `<div style="border:0.3mm solid ${MARINE};border-left:1mm solid ${OR};border-radius:0 1.5mm 1.5mm 0;padding:1.2mm 3mm;margin:0 0 2mm;font-size:7.8pt;color:${MARINE}">
    <b>Ce document est délivré en application de la législation relative à l'octroi du congé-éducation payé dans le cadre de la formation permanente des travailleurs.</b>
    <div style="font-size:7pt;color:${GRIS};margin-top:0.6mm">${esc(BASES[d.cep.region] || BASES.bruxelles)}. Modèle : annexe ${annexe} de l'arrêté ministériel du 20 août 1985.</div>
  </div>`;
}
function blocSoussigne(ident) {
  return `<table style="width:100%;border-collapse:collapse;margin:0 0 1.5mm;font-size:8.5pt;line-height:1.35"><tr>
    <td style="vertical-align:top;padding:0;border:none">
      <div>Je, soussigné, ${val(esc(ident.directeur || '……………'))}, agissant en qualité de ${val('Directeur')} de l'établissement
        d'enseignement dont la dénomination et l'adresse sont mentionnées dans le cadre ci-contre,</div>
      <div style="margin-top:1mm;font-weight:700;color:${MARINE}">ATTESTE QUE :</div></td>
    <td style="width:60mm;vertical-align:top;padding:1.2mm 2.5mm;border:0.3mm solid ${FILET};border-radius:1.5mm;font-size:7.3pt;line-height:1.3">
      <b style="color:${MARINE}">${esc(ident.nom || 'Institut Ilya Prigogine')}</b><br>Enseignement pour adultes<br>${esc(ident.adresse || '')}${
        ident.matricule ? `<br>N° ECOT ${esc(ident.matricule)}` : ''}${ident.fase ? ` · FASE ${esc(ident.fase)}` : ''}</td></tr></table>`;
}
function blocEtudiant(d) {
  const e = d.etudiant, f = feminin(e);
  return `<div style="font-size:8.5pt;line-height:1.45">
    <div>${lab('Nom et prénoms')} &nbsp;${val(`${f ? 'Mme' : 'M.'} ${esc(String(e.nom || '').toUpperCase())} ${esc(e.prenom || '')}`)}</div>
    <div>${lab(f ? 'née à' : 'né à')} &nbsp;${val(esc(e.lieu_naissance || '……'))}, ${lab('le')} ${val(jour(e.date_naissance))} &nbsp;·&nbsp;
      ${lab(f ? 'domiciliée à' : 'domicilié à')} &nbsp;${val(`${esc(e.adresse || '……')}, ${esc(e.cp || '')} ${esc(e.localite || '')}`)}</div>
  </div>`;
}
function blocUnite(d, u) {
  return `<div style="font-size:8.5pt;line-height:1.45;margin:0.5mm 0 1.5mm">
    <div>${lab('Catégorie')} &nbsp;${val('Formation professionnelle')} &nbsp;&nbsp; ${lab('Niveau')} &nbsp;${val(esc(NIVEAUX[u.ue_niveau] || u.ue_niveau || '—'))}
      &nbsp;&nbsp; ${lab("Date de l'inscription")} &nbsp;${val(jour(u.inscription))}</div>
    <div>${lab('Intitulé')} &nbsp;${val(`UE ${u.ue_num}${u.ue_nom ? ` — ${esc(u.ue_nom)}` : ''}`)}${u.code_fwb ? ` <span style="color:${GRIS}">(code ${esc(u.code_fwb)})</span>` : ''}${
      d.section_libelle ? ` · ${esc(d.section_libelle)}` : ''}</div>
  </div>`;
}
function tableHeures(u) {
  const ligne = (lettre, lib, v, note = '') => `<tr><td style="padding:0.6mm 2mm 0.6mm 0;border:none;border-bottom:0.2mm solid ${FILET}">${lib}</td>
    <td style="width:8mm;text-align:center;color:${GRIS};border:none">[${lettre}]</td>
    <td style="width:26mm;padding:0.6mm 2.5mm;border:0.3mm solid ${MARINE};text-align:right;font-weight:700;color:${MARINE}">${h(v)}eures${
      note ? `<div style="font-size:6.5pt;font-weight:400;color:${GRIS}">${note}</div>` : ''}</td></tr>`;
  return `<table style="width:100%;border-collapse:collapse;font-size:8pt;margin:0.5mm 0 1.5mm"><tbody>
    ${ligne('a', "Nombre d'heures théorique total de la formation <span style=\"color:" + GRIS + "\">(hors stage et épreuve intégrée)</span>", u.a)}
    ${ligne('b', "Nombre théorique d'heures de formation que l'intéressé est dispensé de suivre en raison d'une formation antérieure ou en cours", u.b)}
    ${ligne('c', "Nombre théorique d'heures de formation pour l'intéressé", u.c, '[c] = [a] − [b]')}
    ${ligne('d', "Nombre théorique d'heures de formation auxquelles l'intéressé n'a pas assisté en raison d'une inscription tardive (déduction faite des heures de dispense)", u.d)}
  </tbody></table>`;
}
function blocDates(u) {
  return `<div style="font-size:8.5pt;margin:0.5mm 0 1.5mm">${lab('Date du début de la formation')} &nbsp;${boite(court(u.debut))}
    &nbsp;&nbsp;&nbsp; ${lab('Date de fin de la formation')} &nbsp;${boite(court(u.fin))}</div>`;
}
function blocCalendrier(d, u) {
  const ordre = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  const jours = ordre.filter(j => u.horaire[j]).map(j => `les ${j}s de ${hh(u.horaire[j].de)} à ${hh(u.horaire[j].a)}`);
  const v = d.conges.vacances.map(x => `${esc(x.label)} du ${court(x.du)} au ${court(x.au)}`);
  const f = d.conges.feries.map(x => `${court(x.date)}`);
  return `<div style="font-size:8pt;margin:0.5mm 0 1.5mm;line-height:1.4">${lab('Calendrier de la formation (dates et horaire journalier)')}<br>
    ${val(jours.length ? jours.join(' ; ') : '—')} — du ${court(u.debut)} au ${court(u.fin)} ; horaire détaillé en annexe.
    <div style="color:${GRIS};font-size:7pt">Hors congés : ${v.length ? v.join(' ; ') : '—'}${f.length ? ` ; jours fériés : ${f.join(', ')}` : ''}.</div></div>`;
}
function tableAssiduite(u, remplir) {
  const ps = remplir ? u.periodes.filter(p => p.commencee).slice(0, 4) : [];
  const cols = [0, 1, 2, 3].map(i => ps[i] || null);
  const nom = ['1<sup>er</sup>', '2<sup>e</sup>', '3<sup>e</sup>', '4<sup>e</sup>'];
  const lignes = [
    ["Nombre théorique d'heures de formation <span style=\"color:" + GRIS + "\">[y]</span>", p => p.theorique],
    ["Nombre d'heures de formation effectivement données", p => p.donnees],
    ["Nombre d'heures de présence", p => p.presence],
    ["Nombre d'heures d'absences justifiées", p => p.justifiees],
    ["Nombre d'heures d'absences injustifiées <span style=\"color:" + GRIS + "\">[z]</span>", p => p.injustifiees],
  ];
  const th = `padding:0.7mm 1.5mm;border:0.3mm solid ${MARINE};background:${MARINE};color:#fff;font-weight:600;text-align:center;font-size:7.5pt`;
  const td = `padding:0.3mm 2mm;border:0.3mm solid ${FILET};text-align:right;font-weight:700;color:${MARINE}`;
  return `<div style="font-size:8.5pt;margin:1mm 0 0.8mm">L'intéressé a suivi la formation susdécrite de la façon suivante :</div>
  <table style="width:100%;border-collapse:collapse;font-size:8pt"><thead><tr><th style="border:none;background:none"></th>${
    cols.map((p, i) => `<th style="${th}">${nom[i]} trimestre*${p ? `<br><span style="font-weight:400;opacity:.85;white-space:nowrap">${court(p.du).slice(0, 5)} – ${court(p.au)}${p.terminee ? '' : ' (en cours)'}</span>` : ''}</th>`).join('')}</tr></thead>
    <tbody>${lignes.map(([lib, f]) => `<tr><td style="padding:0.3mm 2mm 0.3mm 0;border:none;border-bottom:0.2mm solid ${FILET}">${lib}</td>${
      cols.map(p => `<td style="${td};width:24mm">${p ? h(f(p)) : 'h'}</td>`).join('')}</tr>`).join('')}</tbody></table>
  <div style="font-size:6.8pt;color:${GRIS};margin:0.6mm 0 1.2mm">(*) Par trimestre, on entend des périodes successives de trois mois, dont la première prend cours avec le début de la formation.${
    remplir && cols.some(p => p && !p.terminee) ? " Une période en cours n'est comptée que jusqu'à la date de la présente." : ''}</div>`;
}
function blocAbandon(e) {
  const date = e.sortie_statut === 'sorti' && e.sortie_le ? jour(e.sortie_le) : '—';
  return `<div style="font-size:8.5pt;margin:0.5mm 0 1mm">${lab("Date d'abandon de la formation (le cas échéant)")} &nbsp;${val(date)}</div>`;
}
function blocSignature(ident) {
  return `<div style="border-top:0.3mm solid ${OR};margin-top:1mm"></div>
  <div class="cloture">
    <div class="sceau"></div><div class="paraphe"></div>
    <div class="lieu">Fait à ${esc(ident.ville || 'Bruxelles')}, le ${jour(new Date().toISOString().slice(0, 10))}</div>
    <div class="legende"><div class="qualite">Date et signature (en original)<br>le Directeur</div>
      <div class="nom">${esc(ident.directeur || '……………')}</div></div>
  </div>`;
}
function blocCorrection(correction) {
  // Une ligne, pas un encadré de plus : l'attestation tient sur sa page (le titre porte déjà « correction »).
  if (!correction) return '';
  return `<div style="font-size:8pt;color:#9D4A38;margin:0 0 1mm"><b>CORRECTION</b> — remplace l'attestation délivrée le ${jour(correction)} ; signée et datée à nouveau.</div>`;
}

function annexe(d, u, titre) {
  return `<div class="attestation piece">
  ${enteteDocument({ titre: `${titre} — annexe : horaire détaillé`,
    sous: 'Congé-éducation payé', ligne: `Année ${String(d.annee).replace('-', '/')} · UE ${u.ue_num}` })}
  <p class="corps">Concerne : <b>${esc(String(d.etudiant.nom || '').toUpperCase())} ${esc(d.etudiant.prenom || '')}</b>
    — UE ${u.ue_num}${u.ue_nom ? ` — ${esc(u.ue_nom)}` : ''}</p>
  <table class="doc" style="font-size:8pt"><thead><tr><th>Du</th><th>Au</th><th>Jour</th><th>De</th><th>À</th></tr></thead>
    <tbody>${u.detail.map(l => `<tr><td>${court(l.du)}</td><td>${court(l.au)}</td>
      <td>${JOURS[l.jour]}</td><td>${hh(l.de)}</td><td>${hh(l.a)}</td></tr>`).join('')}</tbody></table>
  <p style="font-size:7.5pt;color:#475569">Chaque semaine entre les deux dates, hors congés. Source : l'horaire de l'établissement.</p>
</div>`;
}

/* LE TEXTE DES ATTESTATIONS SE CORRIGE DANS LUCIE (Galerie des pièces → Modifier le modèle). Les rubriques du modèle
   officiel sont des blocs verrouillés : ils viennent de l'horaire, des présences et de la délibération. */
declarerModele('cep', {
  libelle: "Congé-éducation payé — attestations d'inscription, d'assiduité et de seconde session", galerie: ['cep_inscription', 'cep_assiduite'],
  champs: { directeur: 'Directeur', nom_prenom: "Nom et prénom de l'étudiant", inscrit_e: 'inscrit / inscrite',
    annee: 'Année', ville: 'Ville' },
  blocs: { correction: 'Mention « correction » (s\'il y a lieu)', cadre_legal: 'Cadre légal (encadré du modèle officiel)',
    soussigne: 'Je, soussigné… (et le cadre de l\'établissement)', identite: "Nom, naissance et domicile de l'étudiant",
    unite: 'Catégorie, niveau, intitulé, date de l\'inscription', heures: 'Heures [a] à [d]', dates: 'Début et fin de la formation',
    calendrier: 'Calendrier de la formation', assiduite: 'Tableau trimestriel d\'assiduité', abandon: "Date d'abandon",
    signature: 'Lieu, date, signature et cachet' },
  obligatoires: { blocs: ['cadre_legal', 'soussigne', 'identite', 'unite', 'heures', 'dates', 'calendrier', 'assiduite', 'abandon', 'signature'] },
  defaut: `${blocModele('correction')}
${blocModele('cadre_legal')}
${blocModele('soussigne')}
${blocModele('identite')}
<p style="margin:1mm 0">est {{inscrit_e}} régulièrement — à l'exclusion des élèves libres — à la formation ci-après décrite :</p>
${blocModele('unite')}
${blocModele('heures')}
${blocModele('dates')}
${blocModele('calendrier')}
${blocModele('assiduite')}
${blocModele('abandon')}
${blocModele('signature')}`,
});

function page(type, d, u, { correction = null } = {}) {
  const ident = identiteEtablissement() || {};
  const e = d.etudiant;
  const f = feminin(e);
  const titre = type === 'inscription' ? "Attestation d'inscription régulière" : 'Attestation trimestrielle d’assiduité';
  return `<div class="attestation piece">
  ${enteteDocument({ titre: `${titre}${correction ? ' (correction)' : ''}`, sous: 'Congé-éducation payé — formation permanente des travailleurs',
    ligne: [`Année ${String(d.annee).replace('-', '/')}`, `UE ${u.ue_num}`, `Lieu de travail : ${REGIONS[d.cep.region] || d.cep.region}`].join(' · ') })}
  ${composerModele('cep', {
    champs: { directeur: esc(ident.directeur || '……………'), nom_prenom: `${esc(String(e.nom || '').toUpperCase())} ${esc(e.prenom || '')}`,
      inscrit_e: f ? 'inscrite' : 'inscrit', annee: esc(String(d.annee).replace('-', '/')), ville: esc(ident.ville || 'Bruxelles') },
    blocs: {
      correction: blocCorrection(correction), cadre_legal: blocCadre(d, 'I bis'), soussigne: blocSoussigne(ident),
      identite: blocEtudiant(d), unite: blocUnite(d, u), heures: tableHeures(u), dates: blocDates(u),
      calendrier: blocCalendrier(d, u), assiduite: tableAssiduite(u, type === 'assiduite'), abandon: blocAbandon(e),
      signature: blocSignature(ident),
    },
  })}
</div>`;
}

/** L'attestation de seconde session (annexe II) : une page, toutes les unités ajournées de l'année. */
function pageSecondeSession(d, { correction = null } = {}) {
  const ident = identiteEtablissement() || {};
  const e = d.etudiant, f = feminin(e);
  const lignes = d.session2.map(u => `<tr><td style="padding:1.2mm 2mm;border-bottom:0.2mm solid ${FILET}">${val(`UE ${u.ue_num}`)} — ${esc(u.ue_nom || '')}</td>
    <td style="padding:1.2mm 2mm;border-bottom:0.2mm solid ${FILET};white-space:nowrap">du ${boite(court(u.du))} au ${boite(court(u.au))}</td>
    <td style="padding:1.2mm 2mm;border-bottom:0.2mm solid ${FILET};font-size:8pt">${u.participe
      ? `<b style="color:#3E7D5E">A participé</b> — dernier examen le ${court(u.au)}` : '<span style="color:' + GRIS + '">à venir</span>'}</td></tr>`).join('');
  const tous = d.session2.every(u => u.participe);
  return `<div class="attestation piece">
  ${enteteDocument({ titre: `Attestation de seconde session d'examens${correction ? ' — correction' : ''}`, sous: 'Congé-éducation payé — formation permanente des travailleurs',
    ligne: [`Année ${String(d.annee).replace('-', '/')}`, d.section_libelle, `Lieu de travail : ${REGIONS[d.cep.region] || d.cep.region}`].filter(Boolean).join(' · ') })}
  ${blocCorrection(correction)}
  ${blocCadre(d, 'II')}
  ${blocSoussigne(ident)}
  ${blocEtudiant(d)}
  <p style="font-size:9pt">${f ? 'régulièrement inscrite' : 'régulièrement inscrit'} aux cours ci-dessous${d.section_libelle ? ` (${esc(d.section_libelle)})` : ''},
    est ${f ? 'tenue' : 'tenu'} de présenter des examens en seconde session. Cette session se déroulera aux dates suivantes :</p>
  <table style="width:100%;border-collapse:collapse;font-size:8.5pt;margin:1mm 0 2mm"><thead><tr>
    <th style="text-align:left;${LAB};padding:1mm 2mm">Unité d'enseignement</th><th style="text-align:left;${LAB};padding:1mm 2mm">Seconde session</th>
    <th style="text-align:left;${LAB};padding:1mm 2mm">Participation</th></tr></thead><tbody>${lignes}</tbody></table>
  ${tous ? `<p style="font-size:8.5pt">L'école confirme la participation effective à la seconde session ; date du dernier examen : ${val(court(d.session2.reduce((m, u) => (u.au > m ? u.au : m), '')))}.</p>` : ''}
  ${blocSignature(ident)}
</div>`;
}

/** Compose une pièce. Rend { html, nom } ou { erreur, manques, code }. */
export function composerPieceCep(type, d, { ue = null, correction = null } = {}) {
  if (!TYPES_PIECE_CEP[type]) return { code: 400, erreur: 'pièce inconnue' };
  if (correction && !/^\d{4}-\d{2}-\d{2}$/.test(String(correction))) return { code: 400, erreur: "La date de l'attestation corrigée est au format AAAA-MM-JJ." };
  const vue = ue ? { ...d, unites: d.unites.filter(u => Number(u.ue_num) === Number(ue)), session2: (d.session2 || []).filter(u => Number(u.ue_num) === Number(ue)) } : d;
  const manques = manquesCep(type, vue);
  if (manques.length) {
    return { code: 409, manques, erreur: `La pièce ne peut pas sortir : il manque ${manques.join(', ')}.` };
  }
  const saut = '<div class="saut"></div>';
  let corps;
  if (type === 'seconde_session') corps = pageSecondeSession(vue, { correction });
  else {
    const titre = type === 'inscription' ? "Attestation d'inscription régulière" : "Attestation d'assiduité";
    corps = vue.unites.map(u => page(type, vue, u, { correction }) + saut + annexe(vue, u, titre)).join(saut);
  }
  const e = vue.etudiant;
  const genre = { inscription: 'Inscription', assiduite: 'Assiduite', seconde_session: 'Seconde-session' }[type];
  const nom = `CEP_${genre}_${String(e.nom || '').toUpperCase()}_${e.prenom || ''}_${vue.annee}${ue ? `_UE${ue}` : ''}${correction ? '_correction' : ''}`
    .replace(/[^A-Za-z0-9_-]+/g, '-');
  return { html: envelopper(corps, TYPES_PIECE_CEP[type]), nom };
}
