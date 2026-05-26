/**
 * document-archive.js — Archivage des documents officiels générés (EA12, fiche).
 * Option B : chaque génération est conservée et horodatée (traçabilité FWB).
 */
import { db } from '../db/index.js';

/** Archive un PDF généré. Renvoie l'id de l'archive. */
export function archiverDocument({ type_doc, professeur_id, prof_nom, prof_prenom, annee_scolaire, nom_fichier, pdf, genere_par }) {
  const info = db.prepare(`
    INSERT INTO document_archive
      (type_doc, professeur_id, prof_nom, prof_prenom, annee_scolaire, nom_fichier, pdf, taille, genere_par)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(type_doc, professeur_id ?? null, prof_nom ?? null, prof_prenom ?? null,
         annee_scolaire ?? null, nom_fichier, pdf, pdf.length, genere_par ?? null);
  return info.lastInsertRowid;
}

/** Liste l'historique (sans le BLOB pdf, pour rester léger). */
export function listerArchives({ type_doc, professeur_id } = {}) {
  let sql = `SELECT id, type_doc, professeur_id, prof_nom, prof_prenom, annee_scolaire,
                    nom_fichier, taille, genere_par, genere_le
             FROM document_archive WHERE 1=1`;
  const params = [];
  if (type_doc) { sql += ' AND type_doc = ?'; params.push(type_doc); }
  if (professeur_id) { sql += ' AND professeur_id = ?'; params.push(professeur_id); }
  sql += ' ORDER BY genere_le DESC';
  return db.prepare(sql).all(...params);
}

/** Récupère un PDF archivé par son id (avec le BLOB). */
export function getArchive(id) {
  return db.prepare('SELECT * FROM document_archive WHERE id = ?').get(id);
}
