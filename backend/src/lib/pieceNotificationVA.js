// ─────────────────────────────────────────────────────────────────────────────
// LA NOTIFICATION DES DÉCISIONS DE VALORISATION, PAR ÉTUDIANT (Charles,
// 7 octobre 2026 : « quand est-ce que l'étudiant est prévenu ? peut-on sortir
// un document PAR étudiant des VA acceptées ou refusées et la justification ? »).
//
// Le portail promettait « la décision vous est notifiée par écrit » et aucune
// pièce ne le faisait. Celle-ci porte, pour une année, TOUTES les demandes de
// l'étudiant dont la décision est validée par la direction (et ses demandes
// irrecevables) : unité, demande, décision, base, et la MOTIVATION DU CONSEIL —
// jamais l'avis du chargé de cours, qui est une pièce d'instruction. Les
// demandes encore à l'examen sont nommées, pour qu'aucune ne paraisse oubliée.
//
// Rien ne sort si une décision défavorable n'est pas motivée : le serveur
// nomme ce qui manque (RDE art. 88 §3). Les décisions de VA ne sont pas
// susceptibles de recours (RDE art. 30 et 87 §2) : la pièce le dit.
// ─────────────────────────────────────────────────────────────────────────────

import db from '../db/index.js';
import { envelopper, frDate } from '../routes/attestations.js';
import { enteteDocument } from './document.js';
import { identiteEtablissement } from '../routes/config.js';
import { BASES, POURCENTAGE_DISPENSE } from './valorisation.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const multi = s => esc(s).replace(/\n/g, '<br>');
const jour = d => (d ? frDate(String(d).slice(0, 10)) : '……………');
const PORTE = { va: 'VA', vae: 'VAE', admission: 'Admission' };

/** Les dossiers d'un étudiant pour une année, rangés : notifiables / en cours. */
export function dossiersNotifiables(etudId, annee) {
  const tous = db.prepare(`SELECT v.*,
      (SELECT ue_nom FROM ue u WHERE u.ue_num = v.ue_num AND u.ue_nom IS NOT NULL
        ORDER BY (u.annee_scolaire = ?) DESC, u.annee_scolaire DESC LIMIT 1) AS ue_nom
    FROM etudiant_valorisation v WHERE v.etudiant_id = ? AND v.annee_scolaire = ? AND v.ue_num > 0
    ORDER BY v.ue_num`).all(annee, etudId, annee);
  /* L'ANNÉE EST PASSÉE EN PARAMÈTRE, ET NON LUE SUR v (9 octobre 2026) : le
     SQLite du serveur refuse qu'un ORDER BY de sous-requête désigne la requête
     englobante (« no such column: v.annee_scolaire ») — le banc local, plus
     récent, l'acceptait. */
  const irrecevable = v => v.recevable === 0 && !v.decision_le;
  return {
    pretes: tous.filter(v => (v.decision_le && v.valide_le) || irrecevable(v)),
    en_cours: tous.filter(v => !((v.decision_le && v.valide_le) || irrecevable(v))),
  };
}

function coursDe(ue, annee) {
  return Object.fromEntries(db.prepare(`SELECT cours_code, cours_nom FROM cours
    WHERE ue_num = ? AND annee_scolaire = ?`).all(ue, annee).map(c => [c.cours_code, c.cours_nom]));
}

/** Ce que le Conseil a décidé, en mots, et pourquoi. */
function ligne(v) {
  const base = BASES.find(b => b.code === v.base_code);
  if (v.recevable === 0 && !v.decision_le) {
    return { decision: 'Demande irrecevable', note: '—',
      motif: v.motif_irrecevabilite ? multi(v.motif_irrecevabilite) : '' };
  }
  if (v.decision === 'refusee') {
    return { decision: '<b>Refusée</b>', note: '—', motif: multi(v.motif_refus || '') };
  }
  const equiv = db.prepare('SELECT aa_code, texte FROM etudiant_valorisation_aa WHERE valorisation_id = ? ORDER BY aa_code').all(v.id);
  const parts = [];
  if (base) parts.push(`Base : ${esc(base.code)} — ${esc(base.libelle)}.`);
  if (v.type === 'partielle') {
    const cibles = String(v.cible_detail || '').split(',').map(x => x.trim()).filter(Boolean);
    const noms = v.cible === 'cours' ? coursDe(v.ue_num, v.annee_scolaire) : {};
    if (cibles.length) {
      parts.push(`${v.cible === 'aa' ? 'Acquis reconnus' : 'Activités dispensées'} : ${cibles.map(c => esc(noms[c] ? `${c} ${noms[c]}` : c)).join(', ')}.`);
    }
    parts.push("Les autres activités de l'unité restent à suivre et à évaluer.");
  }
  if (equiv.length) parts.push(equiv.map(x => `${esc(x.aa_code)} : ${esc(x.texte || '')}`).join('<br>'));
  if (v.commentaire) parts.push(`<i>Remarque du Conseil :</i> ${multi(v.commentaire)}`);
  return {
    decision: v.type === 'partielle' ? '<b>Accordée — dispense partielle</b>' : '<b>Accordée — dispense de l’unité</b>',
    // Sur la pièce, la forme du décret : le pourcentage (Charles, 7 octobre 2026).
    note: v.type === 'partielle' ? `${POURCENTAGE_DISPENSE} % sur les activités dispensées` : `${POURCENTAGE_DISPENSE} %`,
    motif: parts.join('<br>'),
  };
}

/** Ce qui manque pour que la pièce sorte. */
export function manquesNotification(pretes) {
  const m = [];
  if (!pretes.length) m.push('aucune décision validée par la direction pour cette année');
  for (const v of pretes) {
    if (v.decision === 'refusee' && !String(v.motif_refus || '').trim()) m.push(`le motif du refus (UE ${v.ue_num})`);
    if (v.recevable === 0 && !v.decision_le && !String(v.motif_irrecevabilite || '').trim()) m.push(`le motif de l'irrecevabilité (UE ${v.ue_num})`);
  }
  return m;
}

/** Compose la pièce. Rend { html, nom, ids } ou { erreur, manques, code }. */
export function composerNotificationVA(etudId, annee) {
  const e = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(etudId);
  if (!e) return { code: 404, erreur: 'Étudiant introuvable.' };
  const { pretes, en_cours } = dossiersNotifiables(etudId, annee);
  const manques = manquesNotification(pretes);
  if (manques.length) {
    return { code: 409, manques, erreur: `La notification ne peut pas sortir : il manque ${manques.join(', ')}.` };
  }
  const ident = identiteEtablissement() || {};
  const dates = [...new Set(pretes.map(v => v.decision_ce_date).filter(Boolean))].sort();
  const feminin = /^(mme|madame|mlle|mademoiselle)\b/i.test(String(e.titre || '').trim()) || e.sexe === 'F';
  const nom = `${esc(e.prenom || '')} ${esc(String(e.nom || '').toUpperCase())}`.trim();
  const lignes = pretes.map(v => { const l = ligne(v); return `<tr>
      <td><b>UE ${v.ue_num}</b><br><span class="ref">${esc(v.ue_nom || '')}</span></td>
      <td>${esc(PORTE[v.porte] || 'VA')}</td>
      <td>${l.decision}</td>
      <td>${l.note}</td>
      <td>${l.motif || '—'}</td>
    </tr>`; }).join('');
  const corps = `<div class="attestation piece">
  ${enteteDocument({
    titre: 'Notification des décisions — valorisation des acquis',
    sous: 'La Direction',
    ligne: `Année ${String(annee).replace('-', '/')} · RDE art. 27 à 30`,
  })}
  <div class="etudiant">
    <div class="nom">${nom}</div>
    <div class="naissance">Matricule ${esc(e.id_ecampus || e.matricule_helb || '—')}${e.date_naissance
      ? ` · né${feminin ? 'e' : ''} le ${jour(e.date_naissance)}` : ''}</div>
  </div>
  <p class="corps">${feminin ? 'Madame' : 'Madame, Monsieur'},</p>
  <p class="corps">Par la présente, nous vous notifions les décisions prises par le Conseil des études
    ${dates.length ? `en sa séance du <b>${dates.map(jour).join('</b>, du <b>')}</b>` : ''} sur vos demandes de
    valorisation des acquis pour l'année ${esc(String(annee).replace('-', '/'))}.</p>
  <table class="doc">
    <thead><tr><th style="width:24%">Unité d'enseignement</th><th style="width:7%">Demande</th>
      <th style="width:17%">Décision</th><th style="width:12%">Résultat</th><th>Motivation du Conseil des études</th></tr></thead>
    <tbody>${lignes}</tbody>
  </table>
  ${en_cours.length ? `<p class="corps">Vos demandes portant sur ${en_cours.map(v => `l'UE ${v.ue_num}`).join(', ')}
    sont encore à l'examen : leur décision vous sera notifiée séparément.</p>` : ''}
  <p class="corps">Une unité dont vous êtes dispensé(e) n'est plus à suivre ; une dispense partielle
    vous dispense des seules activités citées, et l'unité reste à présenter. Votre programme annuel
    (PAE) est adapté en conséquence.</p>
  <div class="info"><div class="titre">Voies de recours</div>
    <div class="ligne">Les décisions de valorisation des acquis ne sont pas susceptibles de recours
    (règlement des études, art. 30 et 87 § 2). Elles sont motivées ci-dessus.</div></div>
  <div class="cloture sans-paraphe">
    <div class="sceau"></div><div class="paraphe"></div>
    <div class="lieu">Fait à ${esc(ident.ville || 'Bruxelles')}, le ${jour(new Date().toISOString())}</div>
    <div class="legende"><div class="qualite">Pour la Direction,<br>le Directeur</div><div class="nom">${esc(ident.directeur || '……………………')}</div></div>
  </div>
</div>`;
  const base = `${String(e.nom || '').toUpperCase()}_${e.prenom || ''}_${annee}`.replace(/[^A-Za-z0-9_-]+/g, '-');
  return { html: envelopper(corps, 'Notification des décisions de valorisation'), nom: `VA_Notification_${base}`,
           ids: pretes.map(v => v.id), en_cours: en_cours.map(v => v.ue_num) };
}
