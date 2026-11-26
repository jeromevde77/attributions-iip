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

export function demarrerPush() {
  if (process.env.NODE_ENV !== 'production') return;   // la dev est une copie : ses abonnements sont de vrais téléphones
  setInterval(() => { passagePush().catch(e => console.error('[push] passage', e.message)); }, 30 * 1000).unref?.();
}
