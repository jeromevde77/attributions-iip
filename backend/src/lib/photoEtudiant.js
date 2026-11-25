/* (CS) LA PHOTO D'IDENTITÉ DE L'ÉTUDIANT (3.5.606, demande du secrétariat par Charles, 21 novembre 2026 : « qu'il soit demandé aux
   étudiants de fournir une photo de type identité, sur fond blanc, pour leur dossier ; ils la chargent et c'est mis dans Lucie » ;
   tranché : l'étudiant la dépose depuis son espace, le secrétariat valide (ou refuse avec un motif) ; demandée avec rappel, jamais
   bloquante ; elle sert à la fiche, aux listes du professeur (trombinoscope), à la carte d'étudiant ; la lecture de la carte eID au
   secrétariat la reprend aussi).

   Une ligne par photo reçue (`etudiant_photo`), jamais effacée par un dépôt suivant : l'acceptée en vigueur est la plus récente
   « acceptee ». Le fichier vit sous DATA_DIR/photos/<étudiant>/<id>. Une photo déposée par le secrétariat (ou lue sur la carte eID)
   est acceptée d'emblée. Qui la voit : direction et secrétariat ; la coordination pour les étudiants de ses sections ; un professeur
   pour les étudiants de ses cours de l'année. */
import fs from 'fs';
import path from 'path';
import db from '../db/index.js';

const DATA_DIR = () => process.env.DATA_DIR || '/app/data';
export const TAILLE_MAX = 5 * 1024 * 1024;
export const ADMIN = ['admin', 'directeur', 'directeur_adjoint', 'secretariat', 'editeur'];

export function migrerPhotos() {
  db.exec(`CREATE TABLE IF NOT EXISTS etudiant_photo (id INTEGER PRIMARY KEY AUTOINCREMENT, etudiant_id INTEGER NOT NULL,
    mime TEXT NOT NULL, taille INTEGER, source TEXT NOT NULL, statut TEXT NOT NULL DEFAULT 'a_valider', motif TEXT,
    depose_par TEXT, depose_le TEXT NOT NULL DEFAULT (datetime('now')), decide_par TEXT, decide_le TEXT);
    CREATE INDEX IF NOT EXISTS idx_etudiant_photo ON etudiant_photo(etudiant_id, statut);`);
}

export function mimeDe(buf) {
  if (!buf || buf.length < 4) return null;
  const h = buf.toString('hex', 0, 4);
  return h.startsWith('ffd8ff') ? 'image/jpeg' : h === '89504e47' ? 'image/png' : null;
}

const fichierDe = p => path.join(DATA_DIR(), 'photos', String(p.etudiant_id), String(p.id));

/** Enregistre une photo. `source` : espace · secretariat · eid. Du secrétariat ou de l'eID : acceptée d'emblée. */
export function deposerPhoto({ etudiantId, buffer, source, par }) {
  migrerPhotos();
  const mime = mimeDe(buffer);
  if (!mime) return { erreur: 'La photo doit être une image JPEG ou PNG.' };
  if (buffer.length > TAILLE_MAX) return { erreur: 'Photo trop lourde (5 Mo au plus).' };
  if (!db.prepare('SELECT 1 FROM etudiant WHERE id = ?').get(Number(etudiantId))) return { erreur: 'Étudiant introuvable.' };
  const directe = source !== 'espace';
  const id = db.transaction(() => {
    // Un nouveau dépôt de l'étudiant remplace celui qui attendait encore : le secrétariat ne valide que le dernier.
    if (!directe) db.prepare("UPDATE etudiant_photo SET statut = 'remplacee' WHERE etudiant_id = ? AND statut = 'a_valider'").run(Number(etudiantId));
    return db.prepare(`INSERT INTO etudiant_photo (etudiant_id, mime, taille, source, statut, depose_par, decide_par, decide_le)
      VALUES (?,?,?,?,?,?,?,?)`).run(Number(etudiantId), mime, buffer.length, source, directe ? 'acceptee' : 'a_valider', par || null,
      directe ? par || null : null, directe ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null).lastInsertRowid;
  })();
  const p = { id, etudiant_id: Number(etudiantId) };
  fs.mkdirSync(path.dirname(fichierDe(p)), { recursive: true });
  fs.writeFileSync(fichierDe(p), buffer);
  return { id, statut: directe ? 'acceptee' : 'a_valider' };
}

export function decider(photoId, { accepter, motif }, par) {
  migrerPhotos();
  const p = db.prepare('SELECT * FROM etudiant_photo WHERE id = ?').get(Number(photoId));
  if (!p) return { erreur: 'Photo introuvable.' };
  if (p.statut !== 'a_valider') return { erreur: 'Cette photo a déjà été traitée.' };
  if (!accepter && String(motif || '').trim().length < 3) return { erreur: 'Dites pourquoi la photo est refusée : l’étudiant le lira.' };
  db.prepare("UPDATE etudiant_photo SET statut = ?, motif = ?, decide_par = ?, decide_le = datetime('now') WHERE id = ?")
    .run(accepter ? 'acceptee' : 'refusee', accepter ? null : String(motif).trim().slice(0, 300), par || null, p.id);
  return { ok: true };
}

export const photoCourante = etudId => {
  migrerPhotos();
  return db.prepare("SELECT * FROM etudiant_photo WHERE etudiant_id = ? AND statut = 'acceptee' ORDER BY id DESC LIMIT 1").get(Number(etudId)) || null;
};
export const photoEnAttente = etudId =>
  db.prepare("SELECT * FROM etudiant_photo WHERE etudiant_id = ? AND statut = 'a_valider' ORDER BY id DESC LIMIT 1").get(Number(etudId)) || null;
export const lirePhoto = p => { try { return fs.readFileSync(fichierDe(p)); } catch { return null; } };
export const photoParId = id => db.prepare('SELECT * FROM etudiant_photo WHERE id = ?').get(Number(id)) || null;

export function aValider() {
  migrerPhotos();
  return db.prepare(`SELECT p.id, p.etudiant_id, p.depose_le, p.taille, e.nom, e.prenom, e.id_ecampus,
      (SELECT COUNT(*) FROM etudiant_photo x WHERE x.etudiant_id = p.etudiant_id AND x.statut = 'acceptee') a_deja
    FROM etudiant_photo p JOIN etudiant e ON e.id = p.etudiant_id WHERE p.statut = 'a_valider' ORDER BY p.depose_le`).all();
}

/** L'état que voit l'étudiant dans son espace (déposé avec son lot). */
export function photoPortail(etudId) {
  migrerPhotos();
  const derniere = db.prepare("SELECT statut, motif, depose_le, decide_le, source FROM etudiant_photo WHERE etudiant_id = ? AND statut != 'remplacee' ORDER BY id DESC LIMIT 1").get(Number(etudId));
  const acceptee = photoCourante(etudId);
  return { a_photo: !!acceptee, acceptee_le: acceptee?.decide_le || acceptee?.depose_le || null,
    derniere: derniere ? { statut: derniere.statut, motif: derniere.motif, depose_le: derniere.depose_le, decide_le: derniere.decide_le } : null };
}

/* RETIRER LA PHOTO EN VIGUEUR (3.5.712, Charles : « pouvoir retirer une photo d'étudiant ») : elle n'est pas effacée — statut
   « retiree », motif, qui et quand ; l'étudiant n'a plus de photo, et son espace le lui dit. */
export function retirerPhoto(etudId, motif, par) {
  migrerPhotos();
  const c = photoCourante(etudId);
  if (!c) return { erreur: 'Cet étudiant n’a pas de photo en vigueur.' };
  db.prepare("UPDATE etudiant_photo SET statut = 'retiree', motif = ?, decide_par = ?, decide_le = datetime('now') WHERE id = ?")
    .run(String(motif || '').trim().slice(0, 500) || null, par, c.id);
  return { ok: true, id: c.id };
}

/** Qui peut voir la photo d'un étudiant. */
export async function peutVoir(user, etudId) {
  if (!user) return false;
  if (ADMIN.includes(String(user.role))) return true;
  const { sectionPropre } = await import('../routes/etudiants.js');
  if (user.role === 'coordination') {
    try {
      const { getUserSections } = await import('../middleware/auth.js');
      const secs = getUserSections(user);
      if (secs === null || secs === undefined) return true;
      if (Array.isArray(secs) && secs.includes(sectionPropre(etudId))) return true;
    } catch { /* */ }
  }
  const profId = user.professeur_id || db.prepare('SELECT professeur_id FROM utilisateur WHERE id = ?').get(user.id)?.professeur_id;
  if (profId) {
    const { etudiantsDuProf } = await import('./invitationEspace.js');
    if (etudiantsDuProf(profId).includes(Number(etudId))) return true;
  }
  return false;
}
