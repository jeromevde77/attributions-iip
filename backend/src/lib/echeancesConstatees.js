// ─────────────────────────────────────────────────────────────────────────────
// Lucie — LES ÉCHÉANCES QUE LUCIE VOIT FAITES (3.5.066)
//
// Charles, 2 novembre 2026, devant l'analyse « qui fait quoi » : 114 échéances passées non cochées, dont aucune par le
// secrétariat — sans doute faites, mais personne ne coche, et Lucie ne fait pas la différence. Tranché : « des échéances
// qui se cochent seules ». Quand Lucie VOIT le fait dans ses propres données, elle coche l'échéance, au nom de
// « Lucie (constaté) », et écrit en commentaire ce qu'elle a vu. Elle ne décoche jamais : un constat ne se reprend pas
// en silence ; ce qu'elle ne voit pas reste à cocher à la main.
//   · ue_preparation        — chaque cours de l'UE a un enseignant attribué, et l'horaire porte ses séances (les locaux ne
//                             sont pas lus : l'horaire importé ne les porte pas) ;
//   · ue_ouverture          — la première séance de l'UE a ses présences ;
//   · ue_comptage_dixieme   — les présences sont encodées pour toutes les séances jusqu'au premier dixième ;
//   · ue_conseil_etudes     — la séance de délibération de l'UE (son organisation, ou « toute l'unité ») est close ;
//   · ue_publication_resultats — la séance porte sa date de publication.
// ─────────────────────────────────────────────────────────────────────────────
import db from '../db/index.js';
import { premierDixiemeUE } from './datesReelles.js';

const essai = (f, d) => { try { return f(); } catch { return d; } };
const AUJ = () => new Date().toISOString().slice(0, 10);

function seancesDeLUE(ue, annee) {
  return essai(() => db.prepare(`SELECT id, date, local_texte FROM horaire_seance
    WHERE annee_scolaire = ? AND COALESCE(annule, 0) = 0
      AND (ue_num = ? OR cours_code IN (SELECT cours_code FROM cours WHERE ue_num = ? AND annee_scolaire = ?)) ORDER BY date, heure_debut`)
    .all(annee, ue, ue, annee), []);
}
const aDesPresences = id => !!essai(() => db.prepare('SELECT 1 FROM presence WHERE seance_id = ? LIMIT 1').get(id), null);

/** Ce que Lucie voit pour une échéance ; null si elle ne voit rien. */
function constat(e, annee) {
  const auj = AUJ();
  if (e.source_type === 'deliberation_seance') {
    const s = essai(() => db.prepare('SELECT publie_le, cloturee FROM deliberation_seance WHERE id = ?').get(e.source_id), null);
    if (e.code === 'ue_publication_resultats' && s?.publie_le) return `résultats publiés le ${String(s.publie_le).slice(0, 10)}`;
    return null;
  }
  if (e.source_type !== 'organisation_ue') return null;
  const o = essai(() => db.prepare('SELECT ue_num, num_organisation, section FROM organisation_ue WHERE id = ?').get(e.source_id), null);
  if (!o) return null;
  if (e.code === 'ue_conseil_etudes') {
    const s = essai(() => db.prepare(`SELECT date_seance FROM deliberation_seance WHERE ue_num = ? AND annee_scolaire = ? AND COALESCE(cloturee, 0) = 1
      AND (COALESCE(num_organisation, 0) IN (0, ?)) ORDER BY date_seance LIMIT 1`).get(o.ue_num, annee, o.num_organisation || 1), null);
    return s ? `séance de délibération close${s.date_seance ? ` (${s.date_seance})` : ''}` : null;
  }
  const seances = seancesDeLUE(o.ue_num, annee);
  if (e.code === 'ue_ouverture') {
    const p = seances.find(x => x.date <= auj);
    return p && aDesPresences(p.id) ? `présences de la première séance (${p.date}) encodées` : null;
  }
  if (e.code === 'ue_comptage_dixieme') {
    const d = essai(() => premierDixiemeUE(o.ue_num, annee, { numOrganisation: o.num_organisation }), null);
    if (!d?.date || d.date > auj) return null;
    const avant = seances.filter(x => x.date <= d.date);
    return avant.length && avant.every(x => aDesPresences(x.id)) ? `présences encodées pour les ${avant.length} séance(s) jusqu'au 1/10 (${d.date})` : null;
  }
  if (e.code === 'ue_preparation') {
    const cours = essai(() => db.prepare("SELECT DISTINCT cours_code FROM cours WHERE ue_num = ? AND annee_scolaire = ? AND cours_code IS NOT NULL AND COALESCE(is_stage, 0) = 0").all(o.ue_num, annee).map(x => x.cours_code), []);
    if (!cours.length) return null;
    const attribues = new Set(essai(() => db.prepare('SELECT DISTINCT code_cours FROM attribution WHERE ue_num = ? AND annee_scolaire = ? AND professeur_id IS NOT NULL').all(o.ue_num, annee).map(x => x.code_cours), []));
    const tous = cours.every(c => attribues.has(c));
    return tous && seances.length ? `chaque cours a son enseignant attribué et l’horaire porte ${seances.length} séance(s)` : null;
  }
  return null;
}

/** Coche ce que Lucie voit fait. Rend le nombre d'échéances cochées, par type. */
export function constaterEcheances(annee) {
  const ouvertes = essai(() => db.prepare(`SELECT e.id, ty.code, e.source_type, e.source_id FROM echeance e JOIN echeance_type ty ON ty.id = e.type_id
    WHERE e.annee_scolaire = ? AND e.statut IN ('a_faire', 'en_retard')
      AND ty.code IN ('ue_preparation', 'ue_ouverture', 'ue_comptage_dixieme', 'ue_conseil_etudes', 'ue_publication_resultats')`).all(annee), []);
  const coche = db.prepare(`UPDATE echeance SET statut = 'fait', fait_par = 'Lucie (constaté)', fait_le = datetime('now'),
    commentaire = TRIM(COALESCE(commentaire, '') || CASE WHEN COALESCE(commentaire, '') = '' THEN '' ELSE ' · ' END || ?)
    WHERE id = ? AND statut IN ('a_faire', 'en_retard')`);
  const n = {};
  for (const e of ouvertes) {
    const c = constat(e, annee); if (!c) continue;
    if (coche.run(`Constaté par Lucie : ${c}.`, e.id).changes) n[e.code] = (n[e.code] || 0) + 1;
  }
  return n;
}
