/* (CS) LES DEMANDES DE PIÈCES DES ÉTUDIANTS (3.5.645, Charles, 22 novembre 2026 : « un étudiant peut-il faire une demande de document
   qu'il n'aurait pas ? » ; tranché : au secrétariat). L'étudiant choisit une pièce dans une liste fermée (ou « autre », avec une phrase)
   depuis Mes documents ; le portail la note, Lucie la relève, la range ici et prévient le secrétariat au tableau de bord. Le secrétariat
   la produit (Éditions, fiche) puis la dit traitée, ou la refuse avec un mot ; l'étudiant lit l'état dans son espace. Rien ne sort sans
   un geste du secrétariat. */
import db from '../db/index.js';

export const TYPES_PIECE = {
  inscription_autre: 'Attestation d’inscription (une autre année)',
  frequentation: 'Attestation de fréquentation (présences)',
  releve: 'Relevé de notes détaillé',
  reussite: 'Attestation de réussite',
  duplicata: 'Duplicata de diplôme ou de titre',
  employeur: 'Document pour un employeur (congé-éducation…)',
  organisme: 'Document pour un organisme (CPAS, ONEM, allocations…)',
  autre: 'Autre document',
};
export const ADMIN = ['admin', 'directeur', 'directeur_adjoint', 'secretariat', 'editeur'];

export function migrerDemandesPieces() {
  db.exec(`CREATE TABLE IF NOT EXISTS piece_demande (
    id INTEGER PRIMARY KEY AUTOINCREMENT, portail_id INTEGER UNIQUE, etudiant_id INTEGER NOT NULL, type TEXT NOT NULL, texte TEXT,
    demande_le TEXT NOT NULL DEFAULT (datetime('now')), statut TEXT NOT NULL DEFAULT 'recue', reponse TEXT,
    traite_par TEXT, traite_le TEXT, etat_envoye INTEGER NOT NULL DEFAULT 1)`);
}

/** Une demande relevée du portail : rangée une fois, le secrétariat prévenu. */
export function recevoirDemande(e, g) {
  if (!TYPES_PIECE[g.type]) return { erreur: 'Pièce inconnue : choisissez-la dans la liste.' };
  if (g.type === 'autre' && !String(g.texte || '').trim()) return { erreur: 'Dites quel document vous demandez.' };
  const r = db.prepare(`INSERT OR IGNORE INTO piece_demande (portail_id, etudiant_id, type, texte, demande_le) VALUES (?,?,?,?, COALESCE(?, datetime('now')))`)
    .run(Number(g.id), e.id, g.type, String(g.texte || '').trim().slice(0, 500) || null, g.cree_le || null);
  if (r.changes) {
    try {
      db.prepare(`INSERT INTO lucie_notification (type, titre, corps, lien, cible_role, cree_par) VALUES ('demande_piece', ?, ?, '/etudiants?outil=demandes-pieces', 'secretariat', 'Espace de l’étudiant')`)
        .run(`Pièce demandée — ${String(e.nom || '').toUpperCase()} ${e.prenom || ''}`.trim(),
          `${TYPES_PIECE[g.type]}${g.texte ? ` : « ${String(g.texte).slice(0, 300)} »` : ''}`);
    } catch { /* sans notification, la demande reste dans la liste */ }
  }
  return { resultat: 'Reçue : le secrétariat la traite.' };
}

export function demandes({ statut = null } = {}) {
  return db.prepare(`SELECT d.*, e.nom, e.prenom, e.id_ecampus FROM piece_demande d LEFT JOIN etudiant e ON e.id = d.etudiant_id
    ${statut === 'a_traiter' ? "WHERE d.statut = 'recue'" : ''} ORDER BY (d.statut = 'recue') DESC, d.demande_le DESC LIMIT 500`).all()
    .map(d => ({ ...d, libelle: TYPES_PIECE[d.type] || d.type }));
}

export function traiter(id, { statut, reponse }, par) {
  if (!['traitee', 'refusee', 'recue'].includes(statut)) return { erreur: 'État inconnu.' };
  const mot = String(reponse || '').trim().slice(0, 600);
  if (statut === 'refusee' && !mot) return { erreur: 'Dites à l’étudiant pourquoi la demande est refusée.' };
  const d = db.prepare('SELECT * FROM piece_demande WHERE id = ?').get(Number(id));
  if (!d) return { erreur: 'Demande introuvable.' };
  db.prepare(`UPDATE piece_demande SET statut = ?, reponse = ?, traite_par = ?, traite_le = CASE WHEN ? = 'recue' THEN NULL ELSE datetime('now') END,
    etat_envoye = 0 WHERE id = ?`).run(statut, mot || null, statut === 'recue' ? null : par, statut, d.id);
  return { ok: true, etudiant_id: d.etudiant_id };
}

/** Les états changés, à redonner au portail (l'étudiant les lit), puis marqués envoyés. */
export function etatsAEnvoyer() {
  return db.prepare('SELECT id, portail_id, statut, reponse FROM piece_demande WHERE etat_envoye = 0 AND portail_id IS NOT NULL LIMIT 200').all();
}
export function marquerEnvoyes(ids) {
  const u = db.prepare('UPDATE piece_demande SET etat_envoye = 1 WHERE id = ?');
  for (const id of ids) u.run(id);
}
