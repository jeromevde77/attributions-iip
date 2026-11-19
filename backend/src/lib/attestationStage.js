// ─────────────────────────────────────────────────────────────────────────────
// L'ATTESTATION DE STAGES (3.5.588, Charles, 19 novembre 2026 : la maquette « Stages — une seule porte », étape 6, « on garde
// tout »). Code R-06. Une pièce par étudiant : les stages EFFECTUÉS (terminés, ou dont les heures sont encodées ; jamais un stage
// rompu ou annulé), toutes années — intitulé et UE, lieu (nom, service, adresse : celle du supplément au diplôme), période,
// heures effectuées, maître de stage —, le total face au minimum de la section, la signature et le cachet (bloc de clôture :
// référence et QR d'authenticité, `filigraner`). Les heures confirmées par le superviseur ne se distinguent pas sur la pièce :
// c'est l'école qui atteste.
// ─────────────────────────────────────────────────────────────────────────────
import db from '../db/index.js';
import { envelopper, frDate } from '../routes/attestations.js';
import { enteteDocument } from './document.js';
import { identiteEtablissement } from '../routes/config.js';
import { sectionRattachement } from '../routes/etudiants.js';
import { donneesSectionDiplome } from '../routes/diplomes.js';
import { getParam } from '../routes/parametres.js';
import { etatDuStage } from '../routes/stages.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const jour = d => (d ? frDate(String(d).slice(0, 10)) : '—');
const essai = (f, d) => { try { return f(); } catch { return d; } };
const feminin = e => /^(mme|madame|mlle|mademoiselle|m\.?me|f)\b/i.test(String(e.titre || e.sexe || '').trim());
const h = v => String(Math.round(Number(v) * 100) / 100).replace('.', ',');

export function chargerAttestationStage(etudId) {
  const e = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(Number(etudId));
  if (!e) return { code: 404, erreur: 'étudiant introuvable' };
  const tous = db.prepare(`SELECT s.*, l.nom lieu_nom, l.service lieu_service, l.adresse, l.cp, l.localite, l.pays,
      (SELECT ue_nom FROM ue u WHERE u.ue_num = s.ue_num ORDER BY u.annee_scolaire DESC LIMIT 1) ue_nom
    FROM stage s LEFT JOIN stage_lieu l ON l.id = s.lieu_id WHERE s.etudiant_id = ? ORDER BY s.date_debut, s.id`).all(e.id);
  const stages = tous.filter(s => !['rompu', 'annule'].includes(s.statut) && (etatDuStage(s) === 'termine' || s.heures_effectuees != null));
  if (!stages.length) return { code: 409, erreur: `${String(e.nom || '').toUpperCase()} ${e.prenom || ''} n’a encore aucun stage effectué à attester (terminé, ou dont les heures sont encodées).` };
  let section = essai(() => sectionRattachement(e.id).section, null) || stages.find(s => s.section)?.section || null;
  const d = essai(() => donneesSectionDiplome(section), null) || {};
  const libelle = section ? (d.intitule_section || essai(() => db.prepare('SELECT libelle FROM section WHERE code = ?').get(section)?.libelle, null) || section) : null;
  let minimum = null;
  try { const m = { TIM: 600, ...JSON.parse(getParam('stages_heures_min', '{}') || '{}') }; minimum = section ? (m[section] ?? null) : null; } catch { /* */ }
  const total = stages.reduce((t, s) => t + Number(s.heures_effectuees || 0), 0);
  const sansHeures = stages.filter(s => s.heures_effectuees == null).length;
  return { etudiant: e, section, section_libelle: libelle, stages, total, minimum, sans_heures: sansHeures };
}

export function composerAttestationStage(d) {
  const ident = essai(() => identiteEtablissement(), null) || {};
  const e = d.etudiant, f = feminin(e);
  const nomEtud = `${esc(String(e.nom || '').toUpperCase())} ${esc(e.prenom || '')}`;
  const adresse = s => [s.adresse, [s.cp, s.localite].filter(Boolean).join(' '), s.pays && !/^belgique$/i.test(s.pays) ? s.pays : ''].filter(Boolean).join(', ');
  const lignes = d.stages.map(s => `<tr>
      <td>${esc(s.annee_scolaire)}</td>
      <td>${esc(s.intitule || s.ue_nom || '')}${s.ue_num ? `<div class="petit">UE ${esc(s.ue_num)}${s.domaine ? ` · ${esc(s.domaine)}` : ''}</div>` : ''}</td>
      <td><b>${esc(s.lieu_nom || '—')}</b>${s.lieu_service ? ` — ${esc(s.lieu_service)}` : ''}${adresse(s) ? `<div class="petit">${esc(adresse(s))}</div>` : ''}${s.maitre_stage ? `<div class="petit">Maître de stage : ${esc(s.maitre_stage)}</div>` : ''}</td>
      <td class="nowrap">du ${jour(s.date_debut)}<br>au ${jour(s.date_fin)}</td>
      <td class="droite">${s.heures_effectuees != null ? `${h(s.heures_effectuees)} h` : '—'}</td></tr>`).join('');
  const atteint = d.minimum ? d.total >= d.minimum : null;
  const tenue = `<style>.att-stg table{width:100%;border-collapse:collapse;font-size:8.5pt;margin:2mm 0 3mm}
    .att-stg th{background:#F1F6FB;color:#0E2A4F;text-align:left;font-weight:700;padding:1.4mm 1.6mm;border-bottom:0.3mm solid #C9D6E8}
    .att-stg td{padding:1.4mm 1.6mm;border-bottom:0.2mm solid #E3E8EF;vertical-align:top}
    .att-stg tr{break-inside:avoid;page-break-inside:avoid} .att-stg .petit{font-size:7.5pt;color:#5B6B82}
    .att-stg .droite{text-align:right;white-space:nowrap} .att-stg .nowrap{white-space:nowrap}
    .att-stg tr.total td{font-weight:700;border-bottom:0;background:#F7F9FC}
    .att-stg p, .att-stg .tenir{break-inside:avoid;page-break-inside:avoid}</style>`;
  const corps = `${tenue}<div class="attestation piece att-stg">
  ${enteteDocument({ titre: 'Attestation de stages', nature: 'Stages', sous: d.section_libelle || null,
    ligne: `${ident.matricule ? `N° ECOT ${esc(ident.matricule)}` : ''}` || null })}
  <p class="corps">Je soussigné, ${esc(ident.directeur || '……………')}, directeur de l’${esc(ident.nom || 'Institut Ilya Prigogine')},
    certifie que <b>${f ? 'Madame' : 'Monsieur'} ${nomEtud}</b>, ${f ? 'née' : 'né'} le ${jour(e.date_naissance)}${e.id_ecampus ? `, matricule ${esc(e.id_ecampus)}` : ''},
    ${f ? 'étudiante' : 'étudiant'}${d.section_libelle ? ` de la section <b>${esc(d.section_libelle)}</b>` : ''}, a effectué les stages suivants :</p>
  <table><thead><tr><th>Année</th><th>Stage</th><th>Lieu</th><th>Période</th><th class="droite">Heures</th></tr></thead>
    <tbody>${lignes}<tr class="total"><td colspan="4">Total des heures de stage effectuées${d.minimum ? ` — minimum de la section : ${h(d.minimum)} h` : ''}</td><td class="droite">${h(d.total)} h</td></tr></tbody></table>
  ${atteint === true ? `<p class="corps">Le minimum d’heures de stage de la section est atteint.</p>` : ''}
  <div class="tenir">
  <p class="corps">La présente attestation est délivrée pour servir et valoir ce que de droit.</p>
  <div style="display:none"><div class="nom">${nomEtud}</div></div>
  <div class="cloture">
    <div class="sceau"></div><div class="paraphe"></div>
    <div class="lieu">Fait à ${esc(ident.ville || 'Bruxelles')}, le ${jour(new Date().toISOString().slice(0, 10))}</div>
    <div class="legende"><div class="qualite">Le chef d’établissement</div>
      <div class="nom">${esc(ident.directeur || '……………')}</div></div>
  </div>
  </div>
</div>`;
  const nom = `Attestation-stages_${String(e.nom || '').toUpperCase()}_${e.prenom || ''}`.replace(/[^A-Za-z0-9_-]+/g, '-');
  return { html: envelopper(corps, 'Attestation de stages'), nom };
}
