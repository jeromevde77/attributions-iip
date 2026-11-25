/**
 * LES MESSAGES AUX ÉTUDIANTS (3.1.516, Charles, 30 octobre 2026 : « les messages qu'il reçoit des services
 * administratifs » ; tranché : secrétariat et direction écrivent à tous, la coordination à ses sections, les enseignants
 * aux étudiants de leurs UE ; l'étudiant répond, la réponse revient à l'AUTEUR du message — la direction lit tout ; un
 * courriel « un nouveau message vous attend dans votre espace », sans le contenu, un par jour au plus).
 *
 * Le message vit dans Lucie (registre : qui, à qui, quand, retiré par qui) ; le portail en reçoit la copie à lire. Ce
 * que fait l'étudiant — ouvrir (✓ lu), répondre — Lucie le relève. L'auteur est prévenu d'une réponse sur son tableau
 * de bord. Rien n'y est jamais effacé : un message envoyé par erreur se RETIRE (il quitte l'espace des étudiants).
 */
import db from '../db/index.js';
import { getUserSections, professeurDe } from '../middleware/auth.js';
import { sectionPropre } from '../routes/etudiants.js';
import { envoyerEmail, templateNotif } from '../services/mailer.js';
import { fonctionPour } from './fonctions.js';
import fs from 'fs';
import path from 'path';

export const IMPORTANCES = ['info', 'important', 'urgent', 'positif'];
export const ICONES = ['porte-voix', 'info', 'calendrier', 'examen', 'document', 'alerte', 'fete', 'reunion', 'horaire', 'lucie'];
const DATA_DIR = () => process.env.DATA_DIR || '/app/data';
const fichierPiece = p => path.join(DATA_DIR(), 'messages-etudiants', String(p.message_id), String(p.id));
const MIMES = { '25504446': 'application/pdf', '89504e47': 'image/png', '504b0304': 'application/zip' };
function mimePiece(buf, nom) {
  const h = buf.toString('hex', 0, 4);
  if (h.startsWith('ffd8ff')) return 'image/jpeg';
  const m = MIMES[h]; if (!m) return null;
  if (m !== 'application/zip') return m;
  const ext = String(nom || '').toLowerCase().split('.').pop();
  return { docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }[ext] || null;
}
export const piecesDe = id => db.prepare('SELECT id, message_id, nom, mime, taille FROM message_etudiant_piece WHERE message_id = ? ORDER BY id').all(Number(id));
export const lirePiece = p => { try { return fs.readFileSync(fichierPiece(p)); } catch { return null; } };

export function migrerMessages(dbx = db) {
  dbx.exec(`
    CREATE TABLE IF NOT EXISTS message_etudiant (id INTEGER PRIMARY KEY AUTOINCREMENT, objet TEXT NOT NULL, corps TEXT NOT NULL,
      auteur_id INTEGER, auteur_nom TEXT, auteur_role TEXT, annee_scolaire TEXT, resume TEXT,
      envoye_le TEXT NOT NULL DEFAULT (datetime('now')), retire_le TEXT, retire_par TEXT);
    CREATE TABLE IF NOT EXISTS message_etudiant_dest (message_id INTEGER NOT NULL, etudiant_id INTEGER NOT NULL, lu_le TEXT,
      PRIMARY KEY (message_id, etudiant_id));
    -- Le fil d'un message avec UN étudiant : ses réponses, et celles de l'école. En ajout seul.
    CREATE TABLE IF NOT EXISTS message_etudiant_fil (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id INTEGER NOT NULL,
      etudiant_id INTEGER NOT NULL, de TEXT NOT NULL CHECK (de IN ('etudiant','ecole')), auteur TEXT, corps TEXT NOT NULL,
      le TEXT NOT NULL DEFAULT (datetime('now')), lu_le TEXT, ref_portail INTEGER UNIQUE);
    CREATE TABLE IF NOT EXISTS message_etudiant_avis (etudiant_id INTEGER PRIMARY KEY, depuis TEXT, avise_le TEXT);
    CREATE TRIGGER IF NOT EXISTS message_fil_sans_effacement BEFORE DELETE ON message_etudiant_fil
      BEGIN SELECT RAISE(ABORT, 'Le fil d''un message ne s''efface pas.'); END;
    CREATE TABLE IF NOT EXISTS message_etudiant_piece (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id INTEGER NOT NULL, nom TEXT NOT NULL,
      mime TEXT NOT NULL, taille INTEGER);
  `);
  /* COMME LA COMMUNICATION DU PERSONNEL (3.5.607, Charles : « il doit ressembler à celui pour les profs ; les pictogrammes ; les accusés de
     réception, la copie mail ») : importance, pictogramme, accusé demandé, copie par courriel, documents joints. */
  for (const [t, c] of [['message_etudiant', "importance TEXT DEFAULT 'info'"], ['message_etudiant', "icone TEXT DEFAULT 'porte-voix'"],
    ['message_etudiant', 'accuse_demande INTEGER DEFAULT 0'], ['message_etudiant', 'canal_email INTEGER DEFAULT 0'],
    ['message_etudiant_dest', 'accuse_le TEXT'], ['message_etudiant_dest', 'courriel_le TEXT']]) {
    try { dbx.exec(`ALTER TABLE ${t} ADD COLUMN ${c}`); } catch { /* déjà là */ }
  }
}

const TOUT = ['admin', 'directeur', 'directeur_adjoint', 'secretariat', 'editeur'];
export const peutEcrire = u => TOUT.includes(u?.role) || u?.role === 'coordination' || (u?.role === 'professeur' && !!professeurDe(u));
/** Envoyer un nouveau message : le secrétariat et la direction toujours ; professeurs et coordinations seulement si la fonction
 *  « Écrire aux étudiants — professeurs et coordinations » leur est ouverte (Mise en service, 3.5.650). Lire ses envoyés reste permis. */
export const peutEnvoyer = u => TOUT.includes(u?.role) || (peutEcrire(u) && fonctionPour('messages.personnel', { userId: u?.id }));
export const litTout = u => ['admin', 'directeur', 'directeur_adjoint'].includes(u?.role);

/** Les étudiants qu'on peut atteindre : actifs, non archivés, avec un espace (adresse d'institut, ou code de candidat). */
function joignables() {
  let cand = new Set();
  try { cand = new Set(db.prepare("SELECT etudiant_id FROM portail_candidat WHERE jusqu_au >= date('now')").all().map(x => x.etudiant_id)); } catch { /* */ }
  return db.prepare(`SELECT id, nom, prenom, email_ecole, email_perso FROM etudiant WHERE COALESCE(actif, 1) = 1
    AND COALESCE(sortie_statut, '') <> 'archive'`).all().map(e => ({ ...e,
    // L'espace ET la fonction « messages » ouverte pour lui (3.5.001, Configuration → Fonctions).
    espace: (String(e.email_ecole || '').includes('@') || (cand.has(e.id) && fonctionPour('espace.candidats', { etudiantId: e.id })))
      && fonctionPour('espace.messages', { etudiantId: e.id }) }));
}

/** Le périmètre de celui qui écrit : sections, UE, et l'ensemble des étudiants qu'il peut viser (null = tous). */
export function perimetre(user, annee) {
  const nomsUE = db.prepare('SELECT ue_num, MAX(ue_nom) ue_nom, MIN(section) section FROM ue WHERE annee_scolaire = ? GROUP BY ue_num ORDER BY ue_num').all(annee);
  if (TOUT.includes(user?.role)) {
    return { sections: db.prepare('SELECT DISTINCT code FROM section ORDER BY code').all().map(s => s.code), ues: nomsUE, etudiants: null };
  }
  if (user?.role === 'coordination') {
    const secs = getUserSections(user) || [];
    const ids = new Set(joignables().filter(e => secs.includes(sectionPropre(e.id))).map(e => e.id));
    return { sections: secs, ues: nomsUE.filter(u => secs.includes(u.section)), etudiants: ids };
  }
  const prof = professeurDe(user);
  if (!prof) return { sections: [], ues: [], etudiants: new Set() };
  const mesUE = new Set(db.prepare('SELECT DISTINCT ue_num FROM attribution WHERE annee_scolaire = ? AND professeur_id = ?').all(annee, prof).map(x => Number(x.ue_num)));
  const ues = nomsUE.filter(u => mesUE.has(Number(u.ue_num)));
  const ids = new Set(ues.length ? db.prepare(`SELECT DISTINCT etudiant_id FROM etudiant_inscription WHERE annee_scolaire = ?
    AND ue_num IN (${ues.map(() => '?').join(',')})`).all(annee, ...ues.map(u => u.ue_num)).map(x => x.etudiant_id) : []);
  return { sections: [], ues, etudiants: ids };
}

/** Les destinataires d'un critère { sections, ues, etudiants }, dans le périmètre. */
export function resoudre(critere, user, annee) {
  const p = perimetre(user, annee);
  const c = critere || {};
  const tous = joignables();
  const parId = new Map(tous.map(e => [e.id, e]));
  const ids = new Set();
  const secs = (c.sections || []).filter(s => p.sections.includes(s));
  if (secs.length) for (const e of tous) if (secs.includes(sectionPropre(e.id))) ids.add(e.id);
  const ues = (c.ues || []).map(Number).filter(n => p.ues.some(u => Number(u.ue_num) === n));
  if (ues.length) for (const x of db.prepare(`SELECT DISTINCT etudiant_id FROM etudiant_inscription WHERE annee_scolaire = ?
    AND ue_num IN (${ues.map(() => '?').join(',')})`).all(annee, ...ues)) ids.add(x.etudiant_id);
  for (const id of (c.etudiants || []).map(Number)) if (parId.has(id)) ids.add(id);
  return [...ids].filter(id => parId.has(id) && (!p.etudiants || p.etudiants.has(id))).map(id => parId.get(id))
    .map(e => ({ id: e.id, nom: `${String(e.nom || '').toUpperCase()} ${e.prenom || ''}`.trim(), espace: e.espace }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

export function resume(c) {
  const l = [];
  if ((c.sections || []).length) l.push(`section${c.sections.length > 1 ? 's' : ''} ${c.sections.join(', ')}`);
  if ((c.ues || []).length) l.push(`inscrits de l'UE ${c.ues.join(', ')}`);
  if ((c.etudiants || []).length) l.push(`${c.etudiants.length} étudiant${c.etudiants.length > 1 ? 's' : ''} choisi${c.etudiants.length > 1 ? 's' : ''}`);
  return l.join(' + ') || '—';
}

const aviser = db => ids => {
  const s = db.prepare(`INSERT INTO message_etudiant_avis (etudiant_id, depuis) VALUES (?, datetime('now'))
    ON CONFLICT(etudiant_id) DO UPDATE SET depuis = COALESCE(message_etudiant_avis.depuis, excluded.depuis)`);
  for (const id of ids) s.run(id);
};

/** Envoyer : le message, ses destinataires (ceux qui ont un espace), ses documents ; l'avis par courriel à venir, ou la copie entière. */
export function envoyer({ objet, corps, critere, importance, icone, accuse_demande, canal_email, pieces }, user, nomAuteur, annee) {
  migrerMessages();
  if (!String(objet || '').trim() || !String(corps || '').trim()) return { erreur: 'Un objet et un texte.' };
  const dest = resoudre(critere, user, annee).filter(d => d.espace);
  if (!dest.length) return { erreur: 'Aucun destinataire avec un espace étudiant.' };
  // Les documents : 5 au plus, 10 Mo chacun, 20 Mo en tout, reconnus à leurs premiers octets.
  const docs = [];
  for (const p of (Array.isArray(pieces) ? pieces : []).slice(0, 5)) {
    const m = String(p?.contenu || '').match(/^data:[^;]*;base64,(.+)$/);
    if (!m) return { erreur: `Document illisible : ${p?.nom || '?'}.` };
    const buf = Buffer.from(m[1], 'base64');
    const mime = mimePiece(buf, p.nom);
    if (!mime) return { erreur: `Format non accepté : ${p.nom} (PDF, image, Word, Excel ou PowerPoint).` };
    if (buf.length > 10 * 1024 * 1024) return { erreur: `${p.nom} dépasse 10 Mo.` };
    docs.push({ nom: String(p.nom || 'document').replace(/[\\/]/g, '_').slice(0, 150), mime, buf });
  }
  if (docs.reduce((t, d) => t + d.buf.length, 0) > 20 * 1024 * 1024) return { erreur: 'Les documents dépassent 20 Mo en tout.' };
  const id = db.transaction(() => {
    const m = db.prepare(`INSERT INTO message_etudiant (objet, corps, auteur_id, auteur_nom, auteur_role, annee_scolaire, resume, importance, icone, accuse_demande, canal_email)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(String(objet).trim().slice(0, 200), String(corps).trim().slice(0, 10000), user?.id || null, nomAuteur, user?.role || null, annee,
        resume(critere || {}), IMPORTANCES.includes(importance) ? importance : 'info', ICONES.includes(icone) ? icone : 'porte-voix', accuse_demande ? 1 : 0, canal_email ? 1 : 0);
    const ins = db.prepare('INSERT OR IGNORE INTO message_etudiant_dest (message_id, etudiant_id) VALUES (?,?)');
    for (const d of dest) ins.run(m.lastInsertRowid, d.id);
    // Avec la copie par courriel, l'avis « un message vous attend » ne part pas en plus.
    if (!canal_email) aviser(db)(dest.map(d => d.id));
    for (const d of docs) {
      const p = db.prepare('INSERT INTO message_etudiant_piece (message_id, nom, mime, taille) VALUES (?,?,?,?)').run(m.lastInsertRowid, d.nom, d.mime, d.buf.length);
      const f = fichierPiece({ message_id: m.lastInsertRowid, id: p.lastInsertRowid });
      fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, d.buf);
    }
    return m.lastInsertRowid;
  })();
  if (canal_email) envoyerCopies(id, nomAuteur).catch(e => console.error('[messages] copie courriel :', e.message));
  return { ok: true, id, n: dest.length };
}

/** LA COPIE PAR COURRIEL : le message entier, ses documents joints, à l'adresse d'institut (le candidat : son adresse privée). */
/* Les places de l'heure qui restent pour les courriels aux étudiants (avis + copies), sous le quota de 200 du serveur. */
const placesHeure = () => Math.max(0, 120
  - db.prepare("SELECT COUNT(*) n FROM message_etudiant_avis WHERE avise_le >= datetime('now', '-1 hour')").get().n
  - db.prepare("SELECT COUNT(*) n FROM message_etudiant_dest WHERE courriel_le >= datetime('now', '-1 hour')").get().n);
/** Les copies qui n'ont pas pu partir (quota) : reprises au passage suivant. */
export async function envoyerCopiesEnAttente() {
  migrerMessages();
  for (const m of db.prepare(`SELECT DISTINCT m.id, m.auteur_nom FROM message_etudiant m JOIN message_etudiant_dest d ON d.message_id = m.id
      WHERE m.canal_email = 1 AND m.retire_le IS NULL AND d.courriel_le IS NULL AND m.envoye_le >= datetime('now', '-7 days')`).all()) {
    if (!placesHeure()) return;
    await envoyerCopies(m.id, m.auteur_nom);
  }
}
async function envoyerCopies(id, nomAuteur) {
  const m = db.prepare('SELECT * FROM message_etudiant WHERE id = ?').get(Number(id));
  const docs = piecesDe(id).map(p => ({ filename: p.nom, content: lirePiece(p), contentType: p.mime })).filter(x => x.content);
  const esc = t => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  for (const d of db.prepare(`SELECT d.etudiant_id, e.prenom, e.email_ecole, e.email_perso FROM message_etudiant_dest d JOIN etudiant e ON e.id = d.etudiant_id
      WHERE d.message_id = ? AND d.courriel_le IS NULL LIMIT ?`).all(id, placesHeure())) {
    const to = String(d.email_ecole || '').includes('@') ? d.email_ecole : d.email_perso;
    if (!to) continue;
    const html = templateNotif({ titre: m.objet, corps: `<p>Bonjour ${esc(d.prenom)},</p>${esc(m.corps).split(/\n{2,}/).map(x => `<p>${x.replace(/\n/g, '<br>')}</p>`).join('')}
      <p style="color:#555">${esc(nomAuteur)}</p>${m.accuse_demande ? '<p><b>Merci de confirmer que vous en avez pris connaissance, dans votre espace étudiant (Messages).</b></p>' : ''}
      <p style="color:#888;font-size:12px">Ce message est aussi dans votre espace étudiant, où vous pouvez y répondre.</p>` });
    const r = await envoyerEmail({ to, subject: `Institut Ilya Prigogine — ${m.objet}`, html, attachments: docs }).catch(e => ({ ok: false, erreur: e.message }));
    if (r?.ok !== false) db.prepare("UPDATE message_etudiant_dest SET courriel_le = datetime('now') WHERE message_id = ? AND etudiant_id = ?").run(id, d.etudiant_id);
  }
}

/** Ce que l'auteur peut voir : les siens (la direction : tous). */
export function messageVisible(m, user) {
  return !!m && (litTout(user) || (m.auteur_id && m.auteur_id === user?.id));
}

export function envoyes(user) {
  migrerMessages();
  const l = db.prepare(`SELECT m.*, (SELECT COUNT(*) FROM message_etudiant_dest d WHERE d.message_id = m.id) n,
      (SELECT COUNT(*) FROM message_etudiant_dest d WHERE d.message_id = m.id AND d.lu_le IS NOT NULL) lus,
      (SELECT COUNT(*) FROM message_etudiant_dest d WHERE d.message_id = m.id AND d.accuse_le IS NOT NULL) accuses,
      (SELECT COUNT(*) FROM message_etudiant_piece p WHERE p.message_id = m.id) nb_pieces,
      (SELECT COUNT(*) FROM message_etudiant_fil f WHERE f.message_id = m.id AND f.de = 'etudiant' AND f.lu_le IS NULL) reponses_non_lues,
      (SELECT COUNT(*) FROM message_etudiant_fil f WHERE f.message_id = m.id AND f.de = 'etudiant') reponses
    FROM message_etudiant m ORDER BY m.envoye_le DESC LIMIT 300`).all();
  return l.filter(m => messageVisible(m, user));
}

export function detail(id) {
  migrerMessages();
  const m = db.prepare('SELECT * FROM message_etudiant WHERE id = ?').get(Number(id));
  if (!m) return null;
  const dest = db.prepare(`SELECT d.etudiant_id, d.lu_le, d.accuse_le, d.courriel_le, e.nom, e.prenom FROM message_etudiant_dest d JOIN etudiant e ON e.id = d.etudiant_id
    WHERE d.message_id = ? ORDER BY e.nom, e.prenom`).all(m.id);
  const fil = db.prepare('SELECT id, etudiant_id, de, auteur, corps, le, lu_le FROM message_etudiant_fil WHERE message_id = ? ORDER BY id').all(m.id);
  return { ...m, pieces: piecesDe(m.id), destinataires: dest.map(d => ({ ...d, nom: `${String(d.nom || '').toUpperCase()} ${d.prenom || ''}`.trim(),
    fil: fil.filter(f => f.etudiant_id === d.etudiant_id) })) };
}

export function marquerReponsesLues(id) {
  db.prepare("UPDATE message_etudiant_fil SET lu_le = datetime('now') WHERE message_id = ? AND de = 'etudiant' AND lu_le IS NULL").run(Number(id));
}

export function repondre(id, etudiantId, corps, nomAuteur) {
  migrerMessages();
  if (!String(corps || '').trim()) return { erreur: 'Un texte.' };
  if (!db.prepare('SELECT 1 FROM message_etudiant_dest WHERE message_id = ? AND etudiant_id = ?').get(Number(id), Number(etudiantId))) return { erreur: 'Cet étudiant n’a pas reçu ce message.' };
  db.prepare("INSERT INTO message_etudiant_fil (message_id, etudiant_id, de, auteur, corps) VALUES (?,?, 'ecole', ?, ?)")
    .run(Number(id), Number(etudiantId), nomAuteur, String(corps).trim().slice(0, 10000));
  aviser(db)([Number(etudiantId)]);
  return { ok: true };
}

export function retirer(id, par) {
  const r = db.prepare("UPDATE message_etudiant SET retire_le = datetime('now'), retire_par = ? WHERE id = ? AND retire_le IS NULL").run(par, Number(id));
  return r.changes ? { ok: true } : { erreur: 'Déjà retiré.' };
}

// ── LE PASSAGE DU MUR ──────────────────────────────────────────────────────
/** Ce qui part au portail : les messages non retirés, leurs destinataires (ceux qu'il connaît), le fil. */
export function aDeposer(idsConnus) {
  migrerMessages();
  const connus = new Set(idsConnus);
  const messages = db.prepare(`SELECT id, objet, corps, auteur_nom AS auteur, envoye_le, importance, icone, accuse_demande FROM message_etudiant WHERE retire_le IS NULL
    AND envoye_le >= datetime('now', '-400 days')`).all().map(m => ({ ...m, pieces: piecesDe(m.id).map(p => ({ id: p.id, nom: p.nom, mime: p.mime, taille: p.taille })) }));
  const ids = new Set(messages.map(m => m.id));
  const destinations = db.prepare('SELECT message_id, etudiant_id, lu_le, accuse_le FROM message_etudiant_dest').all()
    .filter(d => ids.has(d.message_id) && connus.has(d.etudiant_id));
  const fils = db.prepare('SELECT id, message_id, etudiant_id, de, auteur, corps, le FROM message_etudiant_fil ORDER BY id').all()
    .filter(f => ids.has(f.message_id) && connus.has(f.etudiant_id));
  const utiles = new Set(destinations.map(d => d.message_id));
  return { messages: messages.filter(m => utiles.has(m.id)), destinations, fils };
}

/** Le compte qui reçoit les messages « à la direction » : celui réglé, sinon le premier compte actif de direction. */
export function directionDestinataire() {
  try {
    const id = Number(db.prepare("SELECT valeur FROM lucie_config WHERE cle = 'messages_direction'").get()?.valeur || 0);
    if (id) { const u = db.prepare('SELECT id, role FROM utilisateur WHERE id = ? AND actif = 1').get(id); if (u) return u; }
    return db.prepare(`SELECT id, role FROM utilisateur WHERE actif = 1 AND role IN ('directeur', 'admin')
      ORDER BY CASE role WHEN 'directeur' THEN 0 ELSE 1 END, id LIMIT 1`).get() || null;
  } catch { return null; }
}

/** Relevé : un message ouvert (✓ lu), une réponse de l'étudiant (au fil, et l'auteur prévenu). */
export function recevoir({ lus = [], reponses = [], accuses = [] }) {
  migrerMessages();
  const ok = { lus: [], reponses: [], accuses: [] };
  // L'ACCUSÉ (3.5.607) : « J'en ai pris connaissance », depuis l'espace. Il vaut aussi lecture.
  for (const a of accuses) {
    db.prepare('UPDATE message_etudiant_dest SET accuse_le = COALESCE(accuse_le, ?), lu_le = COALESCE(lu_le, ?) WHERE message_id = ? AND etudiant_id = ?')
      .run(String(a.accuse_le || ''), String(a.accuse_le || ''), Number(a.message_id), Number(a.etudiant_id));
    ok.accuses.push(a.id);
  }
  for (const l of lus) {
    db.prepare('UPDATE message_etudiant_dest SET lu_le = COALESCE(lu_le, ?) WHERE message_id = ? AND etudiant_id = ?')
      .run(String(l.lu_le || ''), Number(l.message_id), Number(l.etudiant_id));
    ok.lus.push(l.id);
  }
  for (const r of reponses) {
    ok.reponses.push(r.id);
    /* UN MESSAGE DE L'ÉTUDIANT À LA DIRECTION (3.5.538) : sans message de départ (message_id = 0). Lucie ouvre un fil adressé à la
       direction — le compte réglé (lucie_config « messages_direction »), sinon le premier compte actif de direction — dont le message de
       départ dit qu'il vient de l'étudiant ; sa phrase entre au fil. La direction le lit comme une réponse, et répond dans le même fil. */
    if (!Number(r.message_id)) {
      const e = db.prepare('SELECT id, nom, prenom FROM etudiant WHERE id = ?').get(Number(r.etudiant_id));
      if (!e || db.prepare('SELECT 1 FROM message_etudiant_fil WHERE ref_portail = ?').get(Number(r.id))) continue;
      const nom = `${String(e.nom || '').toUpperCase()} ${e.prenom || ''}`.trim();
      const dir = directionDestinataire();
      const annee = db.prepare("SELECT valeur FROM lucie_config WHERE cle = 'annee_active'").get()?.valeur || null;
      db.transaction(() => {
        const m = db.prepare(`INSERT INTO message_etudiant (objet, corps, auteur_id, auteur_nom, auteur_role, annee_scolaire, resume)
          VALUES (?,?,?,?,?,?,?)`).run(`${String(r.objet || 'Message à la direction').slice(0, 150)}`, `Message de ${nom} à la direction, écrit depuis son espace.`,
            dir?.id || null, 'La direction', dir?.role || null, annee, `${nom} → la direction`);
        db.prepare('INSERT OR IGNORE INTO message_etudiant_dest (message_id, etudiant_id, lu_le) VALUES (?,?, datetime(\'now\'))').run(m.lastInsertRowid, e.id);
        db.prepare(`INSERT OR IGNORE INTO message_etudiant_fil (message_id, etudiant_id, de, auteur, corps, le, ref_portail)
          VALUES (?,?, 'etudiant', ?, ?, ?, ?)`).run(m.lastInsertRowid, e.id, nom, String(r.corps || '').slice(0, 10000), String(r.le || ''), Number(r.id));
        if (dir?.id) db.prepare(`INSERT INTO lucie_notification (type, titre, corps, lien, cible_user_id, cree_par)
          VALUES ('reponse_etudiant', ?, ?, NULL, ?, 'Lucie')`).run(`Message de ${nom}`, `« ${String(r.objet || 'Message à la direction').slice(0, 100)} » — écrit depuis son espace étudiant : ${String(r.corps || r.texte || '').replace(/\s+/g, ' ').trim().slice(0, 400)}`, dir.id);
      })();
      continue;
    }
    const m = db.prepare('SELECT * FROM message_etudiant WHERE id = ?').get(Number(r.message_id));
    const e = db.prepare('SELECT nom, prenom FROM etudiant WHERE id = ?').get(Number(r.etudiant_id));
    if (!m || !e || !db.prepare('SELECT 1 FROM message_etudiant_dest WHERE message_id = ? AND etudiant_id = ?').get(m.id, Number(r.etudiant_id))) continue;
    const nom = `${String(e.nom || '').toUpperCase()} ${e.prenom || ''}`.trim();
    const n = db.prepare(`INSERT OR IGNORE INTO message_etudiant_fil (message_id, etudiant_id, de, auteur, corps, le, ref_portail)
      VALUES (?,?, 'etudiant', ?, ?, ?, ?)`).run(m.id, Number(r.etudiant_id), nom, String(r.corps || '').slice(0, 10000), String(r.le || ''), Number(r.id));
    if (n.changes && m.auteur_id) {
      try {
        db.prepare(`INSERT INTO lucie_notification (type, titre, corps, lien, cible_user_id, cree_par)
          VALUES ('reponse_etudiant', ?, ?, NULL, ?, 'Lucie')`).run(`Réponse de ${nom}`, `À votre message « ${m.objet} » — Messages aux étudiants.`, m.auteur_id);
      } catch (x) { console.error('[messages] notification :', x.message); }
    }
  }
  return ok;
}

/** L'avis par courriel : un par étudiant et par jour au plus, sans le contenu. */
export async function aviserParCourriel(urlPortail) {
  migrerMessages();
  /* LE QUOTA DU SERVEUR DE COURRIEL (3.5.610) : noreply@lucie-iip.be n'a droit qu'à 200 messages par heure. Le 21 novembre 2026, le
     message de bienvenue (751 étudiants) a fait partir 551 avis d'affilée : plus aucun autre courriel ne passait (codes des évaluations,
     réinitialisations…). Les avis prennent au plus 120 places par heure ; le reste part à l'heure suivante. */
  await envoyerCopiesEnAttente().catch(e => console.error('[messages] copies :', e.message));
  const place = placesHeure();
  if (!place) return;
  const l = db.prepare(`SELECT a.etudiant_id, e.prenom, e.email_ecole, e.email_perso FROM message_etudiant_avis a JOIN etudiant e ON e.id = a.etudiant_id
    WHERE a.depuis IS NOT NULL AND (a.avise_le IS NULL OR date(a.avise_le) < date('now')) LIMIT ?`).all(place);
  for (const x of l) {
    const adresse = String(x.email_ecole || '').includes('@') ? x.email_ecole : x.email_perso;
    if (adresse) {
      const html = templateNotif({ titre: 'Votre espace étudiant', corps: `<p>Bonjour ${String(x.prenom || '').replace(/[<>&]/g, '')},</p>
        <p>Un nouveau message de l'Institut Ilya Prigogine vous attend dans votre espace personnel.</p>
        <p><a href="${urlPortail}" style="display:inline-block;background:#16406A;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Ouvrir mon espace</a></p>` });
      const r = await envoyerEmail({ to: adresse, subject: 'Institut Ilya Prigogine — un nouveau message dans votre espace', html }).catch(e => ({ ok: false, erreur: e.message }));
      if (!r?.ok) { console.error('[messages] avis non parti :', r?.erreur); continue; }
    }
    db.prepare("UPDATE message_etudiant_avis SET depuis = NULL, avise_le = datetime('now') WHERE etudiant_id = ?").run(x.etudiant_id);
  }
}
