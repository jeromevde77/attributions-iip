/**
 * document-archive.js — Archivage des documents officiels générés (EA12, fiche).
 * Option B : chaque génération est conservée et horodatée (traçabilité FWB).
 */
import db from '../db/index.js';

// Garantit l'existence de la table (au cas où la migration n'aurait pas tourné).
function ensureTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS document_archive (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      type_doc        TEXT NOT NULL,
      professeur_id   INTEGER,
      prof_nom        TEXT,
      prof_prenom     TEXT,
      annee_scolaire  TEXT,
      nom_fichier     TEXT NOT NULL,
      pdf             BLOB NOT NULL,
      taille          INTEGER,
      genere_par      TEXT,
      genere_le       TEXT DEFAULT (datetime('now'))
    );
  `);
}

/** Archive un PDF généré. Renvoie l'id, ou null en cas d'échec (non bloquant). */
export function archiverDocument({ type_doc, professeur_id, prof_nom, prof_prenom, annee_scolaire, nom_fichier, pdf, genere_par }) {
  try {
    ensureTable();
    const blob = Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
    const info = db.prepare(`
      INSERT INTO document_archive
        (type_doc, professeur_id, prof_nom, prof_prenom, annee_scolaire, nom_fichier, pdf, taille, genere_par)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(type_doc, professeur_id ?? null, prof_nom ?? null, prof_prenom ?? null,
           annee_scolaire ?? null, nom_fichier, blob, blob.length, genere_par ?? null);
    return info.lastInsertRowid;
  } catch (e) {
    console.error('[archive] échec (non bloquant) :', e.message);
    return null;
  }
}

/** Liste l'historique (sans le BLOB pdf). */
export function listerArchives({ type_doc, professeur_id } = {}) {
  try {
    ensureTable();
    let sql = `SELECT id, type_doc, professeur_id, prof_nom, prof_prenom, annee_scolaire,
                      nom_fichier, taille, genere_par, genere_le
               FROM document_archive WHERE 1=1`;
    const params = [];
    if (type_doc) { sql += ' AND type_doc = ?'; params.push(type_doc); }
    if (professeur_id) { sql += ' AND professeur_id = ?'; params.push(professeur_id); }
    sql += ' ORDER BY genere_le DESC';
    return db.prepare(sql).all(...params);
  } catch { return []; }
}

/** Récupère un PDF archivé par son id (avec le BLOB). */
export function getArchive(id) {
  try { ensureTable(); return db.prepare('SELECT * FROM document_archive WHERE id = ?').get(id); }
  catch { return null; }
}
