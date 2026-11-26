/* (CS) LES NOTIFICATIONS SUR LE TÉLÉPHONE — CE QUI PART, ET À QUI (3.5.767, Charles : « une app Lucie pour avoir les notifs sur
   iPhone » ; tranché : pour tous — personnel, professeurs, étudiants). Ici, le personnel de Lucie :
   • un téléphone s'abonne depuis Mon compte (`push_abonnement`, un par appareil, au nom du compte) ;
   • toutes les 30 secondes, ce que la cloche de Lucie annonce (`lucie_notification`, la règle du fil : à sa personne, ou à son
     rôle et dans ses sections) et les messages de la Communication (`communication_destinataire`) partent vers ses téléphones ;
   • en PRODUCTION SEULEMENT : la dev est une copie de la production, ses abonnements sont ceux de vrais téléphones.
   Un abonnement que le service refuse (404, 410) est oublié. Ce qui était déjà là au premier passage ne part pas. */
import db from '../db/index.js';
import { envoyerPush } from './pushWeb.js';
import { notificationVisible } from './perimetreSection.js';

export function migrerPush(base = db) {
  base.exec(`CREATE TABLE IF NOT EXISTS push_abonnement (
    id INTEGER PRIMARY KEY AUTOINCREMENT, espace TEXT NOT NULL DEFAULT 'lucie', user_id INTEGER, endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL, auth TEXT NOT NULL, appareil TEXT, cree_le TEXT DEFAULT (datetime('now')), dernier_le TEXT, echecs INTEGER DEFAULT 0)`);
}
try { migrerPush(); } catch (e) { console.error('[push] migration', e.message); }

export function abonner(userId, ab, appareil) {
  if (!ab?.endpoint || !ab?.keys?.p256dh || !ab?.keys?.auth) throw Object.assign(new Error('Abonnement incomplet.'), { status: 400 });
  if (!/^https:\/\//.test(ab.endpoint)) throw Object.assign(new Error('Adresse de notification refusée.'), { status: 400 });
  db.prepare(`INSERT INTO push_abonnement (espace, user_id, endpoint, p256dh, auth, appareil) VALUES ('lucie', ?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
      appareil = excluded.appareil, echecs = 0`).run(userId, ab.endpoint, ab.keys.p256dh, ab.keys.auth, String(appareil || '').slice(0, 200));
}
export function desabonner(userId, endpoint) {
  return db.prepare("DELETE FROM push_abonnement WHERE espace = 'lucie' AND user_id = ? AND endpoint = ?").run(userId, String(endpoint || '')).changes;
}
export function abonnementsDe(userId) {
  return db.prepare("SELECT id, appareil, cree_le, dernier_le FROM push_abonnement WHERE espace = 'lucie' AND user_id = ? ORDER BY cree_le").all(userId);
}

/** Envoie un message à tous les téléphones d'un compte ; rend le nombre de téléphones atteints. */
export async function pousserAuCompte(userId, message) {
  let n = 0;
  for (const a of db.prepare("SELECT * FROM push_abonnement WHERE espace = 'lucie' AND user_id = ?").all(userId)) {
    try {
      const r = await envoyerPush({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, message);
      if (r.ok) { n++; db.prepare("UPDATE push_abonnement SET dernier_le = datetime('now'), echecs = 0 WHERE id = ?").run(a.id); }
      else if (r.statut === 404 || r.statut === 410) db.prepare('DELETE FROM push_abonnement WHERE id = ?').run(a.id);
      else db.prepare('UPDATE push_abonnement SET echecs = echecs + 1 WHERE id = ?').run(a.id);
    } catch (e) { console.error('[push]', e.message); }
  }
  return n;
}

const texte = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
function lireCurseur(cle) { try { return Number(db.prepare('SELECT valeur FROM lucie_config WHERE cle = ?').get(cle)?.valeur) || null; } catch { return null; } }
function poserCurseur(cle, v) {
  db.prepare('INSERT INTO lucie_config (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur').run(cle, String(v));
}

let enCours = false;
/** Un passage : les notifications et messages nouveaux depuis le dernier, vers les téléphones abonnés. */
export async function passagePush() {
  if (enCours) return; enCours = true;
  try {
    const abonnes = db.prepare(`SELECT DISTINCT u.id, u.role FROM push_abonnement a JOIN utilisateur u ON u.id = a.user_id
      WHERE a.espace = 'lucie' AND u.actif = 1`).all();
    // Les curseurs d'abord : au premier passage, ce qui existe déjà ne part pas.
    const maxN = db.prepare('SELECT COALESCE(MAX(id), 0) m FROM lucie_notification').get().m;
    let curN = lireCurseur('push_curseur_notif');
    if (curN === null) { poserCurseur('push_curseur_notif', maxN); curN = maxN; }
    let maxC = 0, curC = 0;
    try {
      maxC = db.prepare('SELECT COALESCE(MAX(id), 0) m FROM communication_destinataire').get().m;
      curC = lireCurseur('push_curseur_comm');
      if (curC === null) { poserCurseur('push_curseur_comm', maxC); curC = maxC; }
    } catch { /* pas de communication */ }
    if (!abonnes.length) { poserCurseur('push_curseur_notif', maxN); if (maxC) poserCurseur('push_curseur_comm', maxC); return; }

    const notifs = db.prepare('SELECT * FROM lucie_notification WHERE id > ? ORDER BY id LIMIT 200').all(curN);
    for (const n of notifs) {
      for (const u of abonnes) {
        const pour = n.cible_user_id ? n.cible_user_id === u.id : (!n.cible_role || n.cible_role === u.role);
        if (!pour || !notificationVisible(u, n.section)) continue;
        await pousserAuCompte(u.id, { titre: n.titre, corps: texte(n.corps), lien: n.lien || '/', tag: `notif-${n.id}` });
      }
      poserCurseur('push_curseur_notif', n.id);
    }
    if (maxC) {
      const msgs = db.prepare(`SELECT d.id, d.utilisateur_id, c.titre, c.corps_html FROM communication_destinataire d
        JOIN communication c ON c.id = d.communication_id
        WHERE d.id > ? AND d.utilisateur_id IS NOT NULL AND c.retire_le IS NULL AND COALESCE(c.canal_inapp, 1) = 1 ORDER BY d.id LIMIT 500`).all(curC);
      const ids = new Set(abonnes.map(u => u.id));
      for (const m of msgs) {
        if (ids.has(m.utilisateur_id)) await pousserAuCompte(m.utilisateur_id, { titre: m.titre, corps: texte(m.corps_html), lien: '/', tag: `comm-${m.id}` });
        poserCurseur('push_curseur_comm', m.id);
      }
    }
  } finally { enCours = false; }
}

/* LES ESPACES, DERRIÈRE LE MUR (3.5.768) : les téléphones des professeurs et des étudiants sont abonnés au PORTAIL. Lucie lui
   dépose quoi annoncer, et à qui : aux professeurs (compte de Lucie = identifiant de leur espace) ce que leur cloche annonce et les
   messages de la Communication ; aux étudiants les messages de l'école et les documents déposés dans leur espace. */
let enCoursEspaces = false;
export async function passageEspaces() {
  if (enCoursEspaces) return; enCoursEspaces = true;
  try {
    const { portailActif, appelPortail } = await import('./portailSync.js');
    if (!portailActif()) return;
    const ab = await appelPortail('GET', '/interne/push/abonnes');
    const ens = new Set(ab.filter(x => x.espace === 'ens').map(x => Number(x.personne)));
    const etu = new Set(ab.filter(x => x.espace === 'etu').map(x => Number(x.personne)));
    const envois = [];
    const curseur = (cle, maxSql) => {
      const max = db.prepare(maxSql).get().m || 0;
      let c = lireCurseur(cle);
      if (c === null) { poserCurseur(cle, max); c = max; }
      return { c, max };
    };
    // Professeurs : la cloche et la Communication.
    const n = curseur('push_curseur_ens_notif', 'SELECT COALESCE(MAX(id), 0) m FROM lucie_notification');
    if (ens.size) {
      const comptes = new Map(db.prepare(`SELECT id, role, professeur_id FROM utilisateur WHERE id IN (${[...ens].join(',') || 0})`).all().map(u => [u.id, u]));
      for (const x of db.prepare('SELECT * FROM lucie_notification WHERE id > ? ORDER BY id LIMIT 300').all(n.c)) {
        for (const u of comptes.values()) {
          const pour = x.cible_user_id ? x.cible_user_id === u.id : (!x.cible_role || x.cible_role === u.role);
          if (pour && notificationVisible(u, x.section)) envois.push({ espace: 'ens', personne: u.id, titre: x.titre, corps: texte(x.corps), lien: '/', tag: `notif-${x.id}` });
        }
      }
      try {
        const cc = curseur('push_curseur_ens_comm', 'SELECT COALESCE(MAX(id), 0) m FROM communication_destinataire');
        const parProf = new Map([...comptes.values()].filter(u => u.professeur_id).map(u => [u.professeur_id, u.id]));
        for (const m of db.prepare(`SELECT d.id, d.utilisateur_id, d.professeur_id, c.titre, c.corps_html FROM communication_destinataire d
            JOIN communication c ON c.id = d.communication_id WHERE d.id > ? AND c.retire_le IS NULL ORDER BY d.id LIMIT 1000`).all(cc.c)) {
          const qui = comptes.has(m.utilisateur_id) ? m.utilisateur_id : parProf.get(m.professeur_id);
          if (qui) envois.push({ espace: 'ens', personne: qui, titre: m.titre, corps: texte(m.corps_html), lien: '/', tag: `comm-${m.id}` });
        }
        poserCurseur('push_curseur_ens_comm', cc.max);
      } catch { /* pas de communication */ }
    }
    poserCurseur('push_curseur_ens_notif', n.max);
    // Étudiants : messages de l'école, documents déposés.
    try {
      const md = curseur('push_curseur_etu_msg', 'SELECT COALESCE(MAX(rowid), 0) m FROM message_etudiant_dest');
      if (etu.size) for (const m of db.prepare(`SELECT d.rowid r, d.etudiant_id, e.objet, e.corps FROM message_etudiant_dest d
          JOIN message_etudiant e ON e.id = d.message_id WHERE d.rowid > ? AND e.retire_le IS NULL ORDER BY d.rowid LIMIT 2000`).all(md.c)) {
        if (etu.has(m.etudiant_id)) envois.push({ espace: 'etu', personne: m.etudiant_id, titre: m.objet, corps: texte(m.corps), lien: '/', tag: `msg-${m.r}` });
      }
      poserCurseur('push_curseur_etu_msg', md.max);
    } catch { /* pas de messages */ }
    try {
      const dd = curseur('push_curseur_etu_doc', "SELECT COALESCE(MAX(id), 0) m FROM envoi_mail");
      if (etu.size) for (const m of db.prepare(`SELECT id, destinataire_id, sujet FROM envoi_mail WHERE id > ? AND statut = 'depose'
          AND destinataire_type = 'etudiant' ORDER BY id LIMIT 2000`).all(dd.c)) {
        if (etu.has(m.destinataire_id)) envois.push({ espace: 'etu', personne: m.destinataire_id, titre: 'Un document vous attend',
          corps: `${m.sujet || 'Document'} — dans « Mes documents ».`, lien: '/', tag: `doc-${m.id}` });
      }
      poserCurseur('push_curseur_etu_doc', dd.max);
    } catch { /* pas d'envois */ }
    for (let i = 0; i < envois.length; i += 200) await appelPortail('POST', '/interne/push', { envois: envois.slice(i, i + 200) });
  } finally { enCoursEspaces = false; }
}

export function demarrerPush() {
  if (process.env.NODE_ENV !== 'production') return;   // la dev est une copie : ses abonnements sont de vrais téléphones
  setInterval(() => { passagePush().catch(e => console.error('[push] passage', e.message)); }, 30 * 1000).unref?.();
  setInterval(() => { passageEspaces().catch(e => console.error('[push] espaces', e.message)); }, 60 * 1000).unref?.();
}
