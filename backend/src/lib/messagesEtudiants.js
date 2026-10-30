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
  `);
}

const TOUT = ['admin', 'directeur', 'directeur_adjoint', 'secretariat', 'editeur'];
export const peutEcrire = u => TOUT.includes(u?.role) || u?.role === 'coordination' || (u?.role === 'professeur' && !!professeurDe(u));
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

/** Envoyer : le message, ses destinataires (ceux qui ont un espace), l'avis par courriel à venir. */
export function envoyer({ objet, corps, critere }, user, nomAuteur, annee) {
  migrerMessages();
  if (!String(objet || '').trim() || !String(corps || '').trim()) return { erreur: 'Un objet et un texte.' };
  const dest = resoudre(critere, user, annee).filter(d => d.espace);
  if (!dest.length) return { erreur: 'Aucun destinataire avec un espace étudiant.' };
  const id = db.transaction(() => {
    const m = db.prepare(`INSERT INTO message_etudiant (objet, corps, auteur_id, auteur_nom, auteur_role, annee_scolaire, resume)
      VALUES (?,?,?,?,?,?,?)`).run(String(objet).trim().slice(0, 200), String(corps).trim().slice(0, 10000), user?.id || null, nomAuteur, user?.role || null, annee, resume(critere || {}));
    const ins = db.prepare('INSERT OR IGNORE INTO message_etudiant_dest (message_id, etudiant_id) VALUES (?,?)');
    for (const d of dest) ins.run(m.lastInsertRowid, d.id);
    aviser(db)(dest.map(d => d.id));
    return m.lastInsertRowid;
  })();
  return { ok: true, id, n: dest.length };
}

/** Ce que l'auteur peut voir : les siens (la direction : tous). */
export function messageVisible(m, user) {
  return !!m && (litTout(user) || (m.auteur_id && m.auteur_id === user?.id));
}

export function envoyes(user) {
  migrerMessages();
  const l = db.prepare(`SELECT m.*, (SELECT COUNT(*) FROM message_etudiant_dest d WHERE d.message_id = m.id) n,
      (SELECT COUNT(*) FROM message_etudiant_dest d WHERE d.message_id = m.id AND d.lu_le IS NOT NULL) lus,
      (SELECT COUNT(*) FROM message_etudiant_fil f WHERE f.message_id = m.id AND f.de = 'etudiant' AND f.lu_le IS NULL) reponses_non_lues,
      (SELECT COUNT(*) FROM message_etudiant_fil f WHERE f.message_id = m.id AND f.de = 'etudiant') reponses
    FROM message_etudiant m ORDER BY m.envoye_le DESC LIMIT 300`).all();
  return l.filter(m => messageVisible(m, user));
}

export function detail(id) {
  migrerMessages();
  const m = db.prepare('SELECT * FROM message_etudiant WHERE id = ?').get(Number(id));
  if (!m) return null;
  const dest = db.prepare(`SELECT d.etudiant_id, d.lu_le, e.nom, e.prenom FROM message_etudiant_dest d JOIN etudiant e ON e.id = d.etudiant_id
    WHERE d.message_id = ? ORDER BY e.nom, e.prenom`).all(m.id);
  const fil = db.prepare('SELECT id, etudiant_id, de, auteur, corps, le, lu_le FROM message_etudiant_fil WHERE message_id = ? ORDER BY id').all(m.id);
  return { ...m, destinataires: dest.map(d => ({ ...d, nom: `${String(d.nom || '').toUpperCase()} ${d.prenom || ''}`.trim(),
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
  const messages = db.prepare(`SELECT id, objet, corps, auteur_nom AS auteur, envoye_le FROM message_etudiant WHERE retire_le IS NULL
    AND envoye_le >= datetime('now', '-400 days')`).all();
  const ids = new Set(messages.map(m => m.id));
  const destinations = db.prepare('SELECT message_id, etudiant_id, lu_le FROM message_etudiant_dest').all()
    .filter(d => ids.has(d.message_id) && connus.has(d.etudiant_id));
  const fils = db.prepare('SELECT id, message_id, etudiant_id, de, auteur, corps, le FROM message_etudiant_fil ORDER BY id').all()
    .filter(f => ids.has(f.message_id) && connus.has(f.etudiant_id));
  const utiles = new Set(destinations.map(d => d.message_id));
  return { messages: messages.filter(m => utiles.has(m.id)), destinations, fils };
}

/** Relevé : un message ouvert (✓ lu), une réponse de l'étudiant (au fil, et l'auteur prévenu). */
export function recevoir({ lus = [], reponses = [] }) {
  migrerMessages();
  const ok = { lus: [], reponses: [] };
  for (const l of lus) {
    db.prepare('UPDATE message_etudiant_dest SET lu_le = COALESCE(lu_le, ?) WHERE message_id = ? AND etudiant_id = ?')
      .run(String(l.lu_le || ''), Number(l.message_id), Number(l.etudiant_id));
    ok.lus.push(l.id);
  }
  for (const r of reponses) {
    ok.reponses.push(r.id);
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
  const l = db.prepare(`SELECT a.etudiant_id, e.prenom, e.email_ecole, e.email_perso FROM message_etudiant_avis a JOIN etudiant e ON e.id = a.etudiant_id
    WHERE a.depuis IS NOT NULL AND (a.avise_le IS NULL OR date(a.avise_le) < date('now')) LIMIT 200`).all();
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
