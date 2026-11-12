// ─────────────────────────────────────────────────────────────────────────────
// LES ATTESTATIONS DES ANNÉES PASSÉES QUITTENT LES ESPACES (3.5.384, Charles, 12 novembre 2026 : « cette partie ne doit plus être
// disponible, on va gagner de l'espace » ; tranché : tout supprimer). Le dépôt du 1er novembre (3.5.027 : 5 497 pièces, 561 étudiants,
// 118 Mo de copies, aucune ouverte ni signée) est remplacé par le centre de documents (3.5.382), qui compose à la demande.
// Une seule fois (`lucie_config` « purge_hist_depot ») : copies, lignes du registre des envois, dépôts, références d'authenticité lues
// dans les copies — puis la base est compactée. Une pièce déjà ouverte ou signée n'est jamais touchée. Le passage suivant du portail
// retire les documents des espaces (ils n'ont plus de copie).
// ─────────────────────────────────────────────────────────────────────────────
import { gunzipSync } from 'zlib';
import db from '../db/index.js';

export function purgerDepotHistorique() {
  try {
    if (db.prepare("SELECT 1 FROM lucie_config WHERE cle = 'purge_hist_depot'").get()) return null;
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'portail_depot'").get()) return null;
  } catch { return null; }
  const touche = id => {
    try {
      return !!db.prepare("SELECT 1 FROM portail_accuse WHERE objet_type = 'envoi' AND objet_id = ? AND (presente_le IS NOT NULL OR signe_le IS NOT NULL)").get(id);
    } catch { return false; }
  };
  const ids = db.prepare("SELECT DISTINCT envoi_id FROM portail_depot WHERE nature LIKE 'hist%' AND envoi_id IS NOT NULL").all()
    .map(x => x.envoi_id).filter(id => !touche(id));
  const refs = new Set();
  for (const id of ids) {
    const m = db.prepare('SELECT reference FROM envoi_mail WHERE id = ?').get(id);
    if (m?.reference) refs.add(m.reference);
    const c = db.prepare('SELECT html_gz FROM envoi_copie WHERE envoi_id = ?').get(id);
    if (c?.html_gz) { try { for (const r of gunzipSync(c.html_gz).toString('utf8').match(/IIP-[A-Z0-9]{4}-[A-Z0-9]{4}/g) || []) refs.add(r); } catch { /* copie illisible */ } }
  }
  const garder = new Set(ids);
  const tx = db.transaction(() => {
    for (const id of ids) {
      db.prepare('DELETE FROM envoi_copie WHERE envoi_id = ?').run(id);
      db.prepare('DELETE FROM envoi_mail WHERE id = ?').run(id);
    }
    db.prepare(`DELETE FROM portail_depot WHERE nature LIKE 'hist%' AND (envoi_id IS NULL OR envoi_id IN (${[...garder].map(() => '?').join(',') || 'NULL'}))`).run(...garder);
    for (const r of refs) { try { db.prepare('DELETE FROM piece_authentique WHERE reference = ?').run(r); } catch { /* */ } }
    db.prepare("INSERT INTO lucie_config (cle, valeur) VALUES ('purge_hist_depot', ?)")
      .run(JSON.stringify({ le: new Date().toISOString(), envois: ids.length, references: refs.size }));
  });
  tx();
  try { db.exec('VACUUM'); } catch (e) { console.error('[purge années passées] compactage :', e.message); }
  console.log(`[purge années passées] ${ids.length} pièce(s) retirée(s), ${refs.size} référence(s) effacée(s), base compactée`);
  return { envois: ids.length, references: refs.size };
}
