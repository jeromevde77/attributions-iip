// ─────────────────────────────────────────────────────────────────────────────
// LES SUPPORTS DE COURS (3.5.211, Charles, 7 novembre 2026 : « supports de cours » ; tranché : PAR COURS, DANS L'ESPACE DE
// L'ÉTUDIANT — le professeur dépose des fichiers par cours, les inscrits les trouvent dans Mon parcours sous le cours, un
// nouveau dépôt leur est signalé ; fonction de la Mise en service, née éteinte).
//
// Le professeur dépose (Mes cours → le cours → Supports, ou son espace par le relais) : PDF, Word, Excel, PowerPoint, image ;
// 15 Mo chacun, le type lu aux premiers octets. Le fichier vit sous DATA_DIR/supports/<id>. Un support se RETIRE (il sort de
// l'espace des étudiants) ; la ligne reste, avec qui l'a retiré. Le passage vers le portail suit celui de la DUE : Lucie dépose
// ce qui manque (empreinte), puis la liste des supports actifs — le portail efface les autres.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import db from '../db/index.js';

const dossier = () => path.join(process.env.DATA_DIR || '/app/data', 'supports');
export const MAX_OCTETS = 15 * 1024 * 1024;   // 15 Mo : en base64, il passe le relais de l'espace enseignant (25 Mo)

export function migrerSupports(dbx = db) {
  dbx.exec(`
    CREATE TABLE IF NOT EXISTS support_cours (id INTEGER PRIMARY KEY AUTOINCREMENT, annee_scolaire TEXT NOT NULL, cours_code TEXT NOT NULL,
      ue_num INTEGER, titre TEXT NOT NULL, nom TEXT NOT NULL, mime TEXT, taille INTEGER, empreinte TEXT, chemin TEXT,
      depose_par_id INTEGER, depose_par TEXT, depose_le TEXT DEFAULT (datetime('now')), retire_le TEXT, retire_par TEXT);
    CREATE INDEX IF NOT EXISTS idx_support_cours ON support_cours(annee_scolaire, cours_code);
  `);
}

/** Le type réel, lu aux premiers octets (et, pour un Office, au nom). */
export function typeDe(buf, nom) {
  const ext = String(nom || '').toLowerCase().split('.').pop();
  if (buf.slice(0, 5).toString() === '%PDF-') return 'application/pdf';
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'image/png';
  if (buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04) {
    return { docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }[ext] || null;
  }
  return null;
}

const vue = s => ({ id: s.id, titre: s.titre, nom: s.nom, mime: s.mime, taille: s.taille, depose_par: s.depose_par, depose_le: s.depose_le,
  retire_le: s.retire_le, retire_par: s.retire_par });

export function supportsDuCours(coursCode, annee, { retires = false } = {}) {
  migrerSupports();
  return db.prepare(`SELECT * FROM support_cours WHERE annee_scolaire = ? AND cours_code = ? ${retires ? '' : 'AND retire_le IS NULL'} ORDER BY depose_le DESC, id DESC`)
    .all(annee, coursCode).map(vue);
}

/** Déposer : { titre, nom, contenu (data URL ou base64) }. Rend { ok, id } ou { erreur }. */
export function deposerSupport({ coursCode, ueNum, annee, user, nomAuteur }, { titre, nom, contenu }) {
  migrerSupports();
  const b64 = String(contenu || '').replace(/^data:[^,]*,/, '');
  if (!b64) return { erreur: 'Choisissez un fichier.' };
  const buf = Buffer.from(b64, 'base64');
  if (!buf.length) return { erreur: 'Le fichier est vide.' };
  if (buf.length > MAX_OCTETS) return { erreur: 'Le fichier dépasse 15 Mo.' };
  const mime = typeDe(buf, nom);
  if (!mime) return { erreur: 'Type de fichier non accepté : PDF, Word, Excel, PowerPoint, JPEG ou PNG.' };
  const t = String(titre || '').trim().slice(0, 200) || String(nom || 'Support').replace(/\.[^.]+$/, '');
  const n = String(nom || 'support').replace(/[\\/]/g, '_').slice(0, 200);
  fs.mkdirSync(dossier(), { recursive: true });
  const empreinte = createHash('sha256').update(buf).digest('hex').slice(0, 32);
  const id = db.prepare(`INSERT INTO support_cours (annee_scolaire, cours_code, ue_num, titre, nom, mime, taille, empreinte, depose_par_id, depose_par)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(annee, coursCode, ueNum ?? null, t, n, mime, buf.length, empreinte, user?.id || null, nomAuteur).lastInsertRowid;
  const chemin = path.join(dossier(), String(id));
  fs.writeFileSync(chemin, buf);
  db.prepare('UPDATE support_cours SET chemin = ? WHERE id = ?').run(chemin, id);
  return { ok: true, id };
}

export function supportParId(id) { migrerSupports(); return db.prepare('SELECT * FROM support_cours WHERE id = ?').get(Number(id)); }

export function retirerSupport(id, nomAuteur) {
  db.prepare("UPDATE support_cours SET retire_le = datetime('now'), retire_par = ? WHERE id = ? AND retire_le IS NULL").run(nomAuteur, Number(id));
}

/** Pour le portail : les supports actifs de l'année (sans contenu). */
export function supportsActifs(annee) {
  migrerSupports();
  return db.prepare(`SELECT s.*, (SELECT MAX(cours_nom) FROM cours c WHERE c.cours_code = s.cours_code AND c.annee_scolaire = s.annee_scolaire) AS cours_nom
    FROM support_cours s WHERE s.annee_scolaire = ? AND s.retire_le IS NULL`).all(annee);
}
export const contenuDe = s => (s?.chemin && fs.existsSync(s.chemin) ? fs.readFileSync(s.chemin) : null);
