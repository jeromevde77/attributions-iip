/* LES DÉLAIS DES PROCÉDURES DE L'IIP, PAR UE (3.5.338, Charles, 11 novembre 2026 : « cela ne respecte pas nos procédures » ;
 * tranché : remplacer la chaîne rétroactive « dernier jour admin » par les délais des procédures, comptés depuis la délibération
 * de chaque UE). Sources : Procédure pour l'organisation des examens 2026-2027 (visite J+1, au plus J+3 après publication ; seconde
 * session au moins 7 jours après la visite ; notes 48 h et motivations 24 h avant la délibération), Procédure du Conseil des études
 * (publication sous 2 jours ouvrables), Procédure de recours (4 jours calendrier après la publication : `procedures.delai_recours_jours`).
 * Réglables dans Organisation → Règles du calendrier ; Lucie PROPOSE les dates et AVERTIT, elle n'interdit pas. */
import { getParamNum } from '../routes/parametres.js';

export function delaisSessions() {
  const n = (cle, d) => { const v = getParamNum(cle, d); return Number.isFinite(v) ? v : d; };
  return {
    visite_apres_delib: n('session.p_visite_apres_delib', 1),
    visite_max_publication: n('session.p_visite_max_publication', 3),
    ev2_apres_visite: n('session.p_ev2_apres_visite', 7),
    notes_avant_delib_h: n('session.p_notes_avant_delib_h', 48),
    motifs_avant_delib_h: n('session.p_motifs_avant_delib_h', 24),
    publication_ouvr: n('session.p_publication_ouvr', 2),
    recours_apres_publication: n('procedures.delai_recours_jours', 4),
  };
}
