import db from '../db/index.js';

/**
 * Sauvegarde un snapshot JSON complet d'une attribution dans attribution_snapshot.
 * Ne fait rien si HISTORIQUE_ACTIF = 0.
 *
 * @param {number} attributionId
 * @param {'create'|'update'|'delete'} action
 * @param {object} user  — req.user ({id, nom, email})
 * @param {object|null} snapshotData  — si null, relit depuis la BD
 */
export function saveSnapshot(attributionId, action, user, snapshotData = null) {
  try {
    const actif = db.prepare(`SELECT valeur_num FROM parametre_financier WHERE cle = 'HISTORIQUE_ACTIF'`).get();
    if (!actif || Number(actif.valeur_num) !== 1) return;

    const data = snapshotData ?? db.prepare('SELECT * FROM attribution WHERE id = ?').get(attributionId);
    if (!data && action !== 'delete') return;

    db.prepare(`
      INSERT INTO attribution_snapshot (attribution_id, action, snapshot, utilisateur_id, utilisateur_nom)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      attributionId,
      action,
      JSON.stringify(data ?? { id: attributionId, _deleted: true }),
      user?.id ?? null,
      user ? (user.nom || user.email || String(user.id)) : null
    );
  } catch (e) {
    console.warn('[snapshot] Erreur :', e.message);
  }
}
