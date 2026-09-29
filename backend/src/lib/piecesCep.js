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

import db from '../db/index.js';
import { envelopper, frDate } from '../routes/attestations.js';
import { enteteDocument } from './document.js';
import { identiteEtablissement } from '../routes/config.js';
import { sectionRattachement } from '../routes/etudiants.js';
import { cepDe, dossierCepUE, unitesInscrites, congesDe, heures, REGIONS } from './cep.js';

export const TYPES_PIECE_CEP = {
  inscription: "Attestation d'inscription régulière — congé-éducation payé",
  assiduite: "Attestation d'assiduité — congé-éducation payé",
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
  return { etudiant: e, cep, annee, section, section_libelle: sectionLib, unites, conges: congesDe(annee) };
}

/** Ce qui manque pour qu'une pièce parte — vide quand tout y est. */
export function manquesCep(type, d) {
  const m = [];
  const e = d.etudiant;
  if (!e.date_naissance) m.push('la date de naissance');
  if (!e.lieu_naissance) m.push('le lieu de naissance');
  if (!e.adresse || !e.localite) m.push("l'adresse de domicile");
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

function blocIdentite(d, ident) {
  const e = d.etudiant;
  const f = feminin(e);
  return `
  <p class="corps">Je soussigné, <b>${esc(ident.directeur || '……………')}</b>, agissant en qualité de
    <b>Directeur</b> de l'établissement d'enseignement dont la dénomination et l'adresse figurent
    ci-dessus, atteste que</p>
  <div class="etudiant">
    <div class="nom">${esc(String(e.nom || '').toUpperCase())} ${esc(e.prenom || '')}</div>
    <div class="naissance">né${f ? 'e' : ''} à ${esc(e.lieu_naissance || '……')} le ${jour(e.date_naissance)}
      · domicilié${f ? 'e' : ''} ${esc(e.adresse || '……')}, ${esc(e.cp || '')} ${esc(e.localite || '')}</div>
  </div>
  <p class="corps">est inscrit${f ? 'e' : ''} régulièrement — à l'exclusion des élèves libres — aux cours
    ci-après décrits :</p>`;
}

function blocUnite(d, u) {
  return `<div class="carac">
    <div>Catégorie : <b>Formation professionnelle</b></div>
    <div>Niveau : <b>${esc(NIVEAUX[u.ue_niveau] || u.ue_niveau || '—')}</b> · Section : <b>${esc(d.section_libelle || '—')}</b></div>
    <div class="large">Unité d'enseignement : <b>UE ${u.ue_num}${u.ue_nom ? ` — ${esc(u.ue_nom)}` : ''}</b>${
      u.code_fwb ? ` <span class="detail">(code ${esc(u.code_fwb)})</span>` : ''} · durée normale : 1 année</div>
    <div>Date de l'inscription : <b>${jour(u.inscription)}</b></div>
    <div>Cours du <b>${jour(u.debut)}</b> au <b>${jour(u.fin)}</b></div>
  </div>`;
}

function tableHeures(u) {
  const ligne = (lettre, lib, val) => `<tr><td style="width:8mm"><b>(${lettre})</b></td><td>${lib}</td>
    <td style="width:26mm;text-align:right"><b>${h(val)}</b></td></tr>`;
  return `<table class="doc" style="font-size:8pt"><tbody>
    ${ligne('a', "Nombre théorique d'heures de cours de l'unité <span class=\"ref\">(hors activités de développement professionnel, stage et épreuve intégrée)</span>", u.a)}
    ${ligne('b', "Heures que l'étudiant est dispensé de suivre en raison d'études antérieures ou en cours", u.b)}
    ${ligne('c', "Nombre théorique d'heures de cours pour l'étudiant <span class=\"ref\">(c) = (a) − (b)</span>", u.c)}
    ${ligne('d', "Heures auxquelles l'étudiant n'a pas assisté en raison d'une inscription tardive <span class=\"ref\">(hors dispense)</span>", u.d)}
  </tbody></table>`;
}

function tableHoraire(u) {
  const ordre = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  const jours = ordre.filter(j => u.horaire[j]).map(j => `${j} <b>${hh(u.horaire[j].de)} – ${hh(u.horaire[j].a)}</b>`);
  return `<div style="font-size:8pt;margin:1.5mm 0 1mm"><b>Horaire des cours suivis :</b> ${jours.length ? jours.join(' · ') : '—'}
    <span style="color:#475569">— première et dernière heure de chaque jour ; horaire détaillé en annexe.</span></div>`;
}

function blocConges(d) {
  const v = d.conges.vacances.map(x => `${esc(x.label)} : du ${jour(x.du)} au ${jour(x.au)} inclus`);
  const f = d.conges.feries.map(x => `${frDate(x.date)} (${esc(x.label)})`);
  return `<div style="font-size:7.5pt;line-height:1.3;margin:1mm 0 2mm"><b>Vacances :</b> ${v.length ? v.join(' ; ') : '—'}<br>
    <b>Autres congés :</b> ${f.length ? f.join(' ; ') : '—'}</div>`;
}

function tableAssiduite(u) {
  const ps = u.periodes.filter(p => p.commencee).slice(0, 4);
  if (!ps.length) return '<p class="corps">Aucune période de cours n\'a encore commencé.</p>';
  const lignes = [
    ["Nombre théorique d'heures de cours", p => p.theorique],
    ["Nombre d'heures de cours effectivement données", p => p.donnees],
    ["Nombre d'heures de présence", p => p.presence],
    ["Nombre d'heures d'absences justifiées", p => p.justifiees],
    ["Nombre d'heures d'absences injustifiées", p => p.injustifiees],
    ["Nombre d'heures de dispense de cours", p => p.dispense],
    ["Nombre d'heures (inscription tardive)", p => p.tardive],
  ];
  return `<table class="doc" style="font-size:8pt"><thead><tr><th>L'étudiant a suivi les cours de la façon suivante</th>${
    ps.map(p => `<th style="text-align:center">Période ${p.num}<br><span class="ref">${frDate(p.du)} – ${frDate(p.au)}${
      p.terminee ? '' : ' · en cours'}</span></th>`).join('')}</tr></thead>
    <tbody>${lignes.map(([lib, f]) => `<tr><td>${lib}</td>${
      ps.map(p => `<td style="text-align:right">${h(f(p))}</td>`).join('')}</tr>`).join('')}</tbody></table>
    <p style="margin:0.5mm 0 1mm;font-size:7.5pt;color:#475569">Périodes de trois mois à compter du début de l'unité (enseignement
      modulaire). Une période en cours n'est comptée que jusqu'à la date de la présente.</p>`;
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

function page(type, d, u) {
  const ident = identiteEtablissement() || {};
  const titre = type === 'inscription' ? "Attestation d'inscription régulière" : "Attestation d'assiduité";
  const cadre = d.cep.region === 'bruxelles'
    ? " (loi de redressement du 22 janvier 1985 ; arrêté du Gouvernement de la Région de Bruxelles-Capitale du 29 juin 2023)"
    : '';
  const abandon = d.etudiant.sortie_statut === 'sorti' && d.etudiant.sortie_le
    ? `<div class="champ"><span class="lab">Date d'abandon des cours :</span> <b>${jour(d.etudiant.sortie_le)}</b></div>` : '';
  return `<div class="attestation piece">
  ${enteteDocument({ titre, sous: 'Congé-éducation payé — enseignement pour adultes',
    ligne: [`Année ${String(d.annee).replace('-', '/')}`, d.section_libelle,
      `Lieu de travail : ${REGIONS[d.cep.region] || d.cep.region}`].filter(Boolean).join(' · ') })}
  <p style="margin:0 0 1.5mm;font-size:7.5pt;color:#475569">Document délivré en application de la législation relative à l'octroi
    du congé-éducation payé dans le cadre de la formation permanente des travailleurs${cadre}.</p>
  ${blocIdentite(d, ident)}
  ${blocUnite(d, u)}
  ${tableHeures(u)}
  ${tableHoraire(u)}
  ${blocConges(d)}
  ${type === 'assiduite' ? tableAssiduite(u) : ''}
  ${abandon}
  <div class="cloture sans-paraphe">
    <div class="sceau"></div><div class="paraphe"></div>
    <div class="lieu">Fait à ${esc(ident.ville || 'Bruxelles')}, le ${jour(new Date().toISOString().slice(0, 10))}</div>
    <div class="legende"><div class="qualite">Date et signature (en original)<br>le Directeur</div>
      <div class="nom">${esc(ident.directeur || '……………')}</div></div>
  </div>
</div>`;
}

/** Compose une pièce. Rend { html, nom } ou { erreur, manques, code }. */
export function composerPieceCep(type, d, { ue = null } = {}) {
  if (!TYPES_PIECE_CEP[type]) return { code: 400, erreur: 'pièce inconnue' };
  const vue = ue ? { ...d, unites: d.unites.filter(u => Number(u.ue_num) === Number(ue)) } : d;
  const manques = manquesCep(type, vue);
  if (manques.length) {
    return { code: 409, manques, erreur: `La pièce ne peut pas sortir : il manque ${manques.join(', ')}.` };
  }
  const saut = '<div class="saut"></div>';
  const titre = type === 'inscription' ? "Attestation d'inscription régulière" : "Attestation d'assiduité";
  const corps = vue.unites.map(u => page(type, vue, u) + saut + annexe(vue, u, titre)).join(saut);
  const e = vue.etudiant;
  const nom = `CEP_${type === 'inscription' ? 'Inscription' : 'Assiduite'}_${String(e.nom || '').toUpperCase()}_${
    e.prenom || ''}_${vue.annee}${ue ? `_UE${ue}` : ''}`.replace(/[^A-Za-z0-9_-]+/g, '-');
  return { html: envelopper(corps, TYPES_PIECE_CEP[type]), nom };
}
