// ─────────────────────────────────────────────────────────────────────────────
// QUI EST DISPENSÉ DE QUOI, DANS UNE UNITÉ — une seule réponse pour tout Lucie.
//
// Charles, 9 octobre 2026 : « Dethier a une VAP, mais il doit présenter le
// cours 250.1 ; quand je sors une liste il n'y est pas, et dans les groupes il
// est cliquable dans le cours dont il est dispensé — tous les liens ne se font
// pas ». Le générateur de listes rangeait TOUTE valorisation de l'unité parmi
// les dispensés, partielle comprise ; la répartition en groupes n'en lisait
// aucune. Deux écrans, deux réponses, aucune juste.
//
// Une dispense vaut :
//   · pour l'UNITÉ ENTIÈRE — valorisation complète (VA, VAE) ;
//   · pour un COURS — valorisation partielle par cours (VAP, VAEP), ou report
//     de note accordé (le cours réussi une année antérieure).
// Une valorisation partielle par ACQUIS ne dispense d'aucun cours : le cours
// se suit, seuls des acquis sont reconnus.
// ─────────────────────────────────────────────────────────────────────────────

import db from '../db/index.js';
import { vaRetenue } from './valorisation.js';

/**
 * Les dispenses d'une unité pour une année.
 * Rend Map<etudiant_id, { ue: libellé|null, cours: Map<cours_code, libellé> }>.
 */
export function dispensesDeLUE(ueNum, annee) {
  const m = new Map();
  const de = id => { if (!m.has(id)) m.set(id, { ue: null, cours: new Map() }); return m.get(id); };
  try {
    for (const v of db.prepare(`SELECT etudiant_id, type, cible, cible_detail, porte FROM etudiant_valorisation
        WHERE ue_num = ? AND annee_scolaire = ? AND ${vaRetenue()}`).all(Number(ueNum), annee)) {
      const vae = v.porte === 'vae';
      if (v.type === 'complete') de(v.etudiant_id).ue = vae ? 'VAE' : 'VA';
      else if (v.type === 'partielle' && v.cible === 'cours') {
        for (const c of String(v.cible_detail || '').split(',').map(x => x.trim()).filter(Boolean)) {
          de(v.etudiant_id).cours.set(c, vae ? 'VAEP' : 'VAP');
        }
      }
    }
  } catch { /* table absente */ }
  try {
    for (const r of db.prepare(`SELECT etudiant_id, cours_code, annee_origine, nature FROM etudiant_report_note
        WHERE ue_num = ? AND annee_scolaire = ? AND COALESCE(statut, 'accorde') = 'accorde'
          AND COALESCE(cible, 'cours') = 'cours' AND cours_code IS NOT NULL`).all(Number(ueNum), annee)) {
      const lib = r.nature && r.nature !== 'Report' ? r.nature : `report${r.annee_origine ? ` ${r.annee_origine}` : ''}`;
      if (!de(r.etudiant_id).cours.has(r.cours_code)) de(r.etudiant_id).cours.set(r.cours_code, lib);
    }
  } catch { /* table absente */ }
  return m;
}

/** Le libellé de la dispense d'un étudiant pour un cours (ou toute l'unité), sinon null. */
export function dispenseDuCours(dispenses, etudiantId, coursCode) {
  const d = dispenses.get(etudiantId);
  if (!d) return null;
  return d.ue || d.cours.get(coursCode) || null;
}
