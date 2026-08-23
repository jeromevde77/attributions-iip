// ─────────────────────────────────────────────────────────────────────────────
// Lucie V3++ — Ouverture du parcours d'un membre du personnel
//
// Appelé au moment où un candidat devient membre du personnel. Un seul endroit
// pour toutes les conséquences d'un engagement, quel que soit le chemin emprunté
// dans le module de recrutement :
//   · création de la checklist des pièces attendues (piece_type → piece_dossier)
//   · déclenchement des échéances d'entrée en fonction (dossier J+5, A18 J+30)
//
// Idempotent : réappelé sur la même personne, il n'ajoute ni doublon de pièce
// ni doublon d'échéance.
// ─────────────────────────────────────────────────────────────────────────────

import { declencher, anneeActive } from './echeancier.js';

/**
 * @param db            instance better-sqlite3
 * @param professeurId  identifiant du membre du personnel
 * @param options.dateEngagement  'YYYY-MM-DD' (défaut : aujourd'hui)
 * @param options.statut          statut du MDP, conditionne les pièces requises
 * @returns { pieces_creees, echeances_creees }
 */
export function ouvrirParcoursPersonnel(db, professeurId, options = {}) {
  const resultat = { pieces_creees: 0, echeances_creees: 0, erreurs: [] };
  if (!professeurId) return resultat;

  const prof = db.prepare(
    'SELECT id, nom, prenom, statut, date_engagement FROM professeur WHERE id = ?'
  ).get(professeurId);
  if (!prof) return resultat;

  const dateEngagement = options.dateEngagement
    || prof.date_engagement
    || new Date().toISOString().slice(0, 10);
  const statut = options.statut || prof.statut || 'MDP';
  const annee = options.anneeScolaire || anneeActive(db);

  // ── 1. Checklist des pièces attendues ─────────────────────────────────────
  try {
    const types = db.prepare(
      'SELECT code, obligatoire FROM piece_type WHERE actif = 1 ORDER BY ordre, code'
    ).all();

    const ins = db.prepare(`
      INSERT INTO piece_dossier (professeur_id, code_piece, statut, modifie_le)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(professeur_id, code_piece) DO NOTHING
    `);

    for (const t of types) {
      // Une pièce facultative reste « non requise » tant qu'on ne l'active pas ;
      // une pièce propre aux temporaires ne s'impose qu'à eux.
      let statutInitial = 'manquante';
      if (t.obligatoire === 'jamais') statutInitial = 'non_requise';
      else if (t.obligatoire === 'temporaire' && statut !== 'MDP') statutInitial = 'non_requise';

      const r = ins.run(professeurId, t.code, statutInitial);
      if (r.changes) resultat.pieces_creees++;
    }
  } catch (e) {
    resultat.erreurs.push(`pièces : ${e.message}`);
  }

  // ── 2. Échéances d'entrée en fonction ─────────────────────────────────────
  try {
    resultat.echeances_creees = declencher(db, {
      ancre: 'engagement',
      dateRef: dateEngagement,
      anneeScolaire: annee,
      sourceType: 'professeur',
      sourceId: professeurId,
      libelle: [prof.nom, prof.prenom].filter(Boolean).join(' '),
    });
  } catch (e) {
    resultat.erreurs.push(`échéances : ${e.message}`);
  }

  return resultat;
}

export default ouvrirParcoursPersonnel;
