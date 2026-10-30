// ─────────────────────────────────────────────────────────────────────────────
// LE RÉCAPITULATIF QUOTIDIEN PAR COURRIEL (3.1.472, Charles, 30 octobre 2026, à la demande de
// Véronique Moiny : « recevoir une notification quand nous avons une action à réaliser dans Lucie —
// j'ai découvert avec horreur tout ce que je dois faire/lire » ; rythme tranché : quotidien).
//
// Un courriel par personne, le matin (après 7 h, heure de Bruxelles), SEULEMENT si quelque chose de
// NOUVEAU l'attend depuis le précédent : une tâche confiée, un texte à confirmer, un message, une
// réponse à son idée — et, pour la direction, une idée déposée. Le courriel dit ce qui attend et
// renvoie à Lucie : il ne remplace pas le tableau de bord (Charles : « l'idée est de vous inciter à
// vous connecter »). Il ne recopie AUCUN contenu sensible : des intitulés et des nombres.
//
// Les chiffres sont ceux de l'Accueil : mêmes tâches (« les miennes » : nom, rôle, équipage), mêmes
// textes (`etatLecture`), mêmes messages (`messagesRecus`). Un interrupteur (`lucie_config`
// « recap_quotidien_actif », allumé par défaut) ; `recap_envoi` garde ce qui est parti, par personne et
// par jour — un redémarrage ne renvoie rien.
// ─────────────────────────────────────────────────────────────────────────────
import db from '../db/index.js';
import { prenomDuCompte } from './nom.js';
import { envoyerEmail, templateNotif } from '../services/mailer.js';
import { etatLecture, derniereVersion } from '../routes/documentation.js';
import { messagesRecus } from '../routes/communication.js';

const DIRECTION = ['admin', 'directeur', 'directeur_adjoint'];
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const jourFr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');

export function migrerRecap(dbx = db) {
  dbx.exec(`CREATE TABLE IF NOT EXISTS recap_envoi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    utilisateur_id INTEGER NOT NULL,
    jour TEXT NOT NULL,
    envoye_le TEXT DEFAULT (datetime('now')),
    statut TEXT,
    resume TEXT,
    UNIQUE(utilisateur_id, jour)
  )`);
}

const config = cle => db.prepare('SELECT valeur FROM lucie_config WHERE cle = ?').get(cle)?.valeur;
export const recapActif = () => config('recap_quotidien_actif') !== '0';
export function poserRecapActif(actif) {
  db.prepare(`INSERT INTO lucie_config (cle, valeur) VALUES ('recap_quotidien_actif', ?)
    ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur`).run(actif ? '1' : '0');
}

/** Bruxelles : le jour (AAAA-MM-JJ) et l'heure. */
function maintenantBruxelles() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('fr-BE', { timeZone: 'Europe/Brussels',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false })
    .formatToParts(new Date()).map(x => [x.type, x.value]));
  return { jour: `${p.year}-${p.month}-${p.day}`, heure: Number(p.hour) };
}

/** Ce qui attend une personne. `depuis` : la date du dernier récapitulatif (ce qui est plus récent est nouveau). */
export function ceQuiAttend(u, depuis) {
  const neuf = d => !!d && (!depuis || String(d) > depuis);
  // Les tâches ouvertes qui sont les miennes — la règle de l'Accueil (`/reunions/taches?mien=1`).
  const taches = db.prepare(`SELECT t.id, t.titre, t.echeance, t.cree_le FROM tache t
    WHERE t.statut IN ('a_faire','en_cours')
      AND (t.responsable_user_id = ? OR t.responsable_role = ?
        OR (t.responsable_professeur_id IS NOT NULL AND t.responsable_professeur_id = ?)
        OR EXISTS (SELECT 1 FROM tache_personne tp WHERE tp.tache_id = t.id
          AND (tp.user_id = ? OR tp.role = ? OR (tp.professeur_id IS NOT NULL AND tp.professeur_id = ?))))
    ORDER BY t.echeance IS NULL, t.echeance`).all(u.id, u.role, u.professeur_id, u.id, u.role, u.professeur_id)
    .map(t => ({ ...t, nouveau: neuf(t.cree_le), retard: !!t.echeance && t.echeance < new Date().toISOString().slice(0, 10) }));

  const textes = [];
  for (const d of db.prepare(`SELECT d.id, d.titre FROM corpus_document d
      JOIN corpus_destinataire t ON t.document_id = d.id AND t.role = ? WHERE d.retire_le IS NULL ORDER BY d.titre`).all(u.role)) {
    const v = derniereVersion(d.id);
    if (v && !etatLecture(d.id, u.id).confirme_le) textes.push({ titre: d.titre, nouveau: neuf(v.publiee_le) });
  }

  let messages = [];
  try { messages = messagesRecus(u).filter(m => !m.lu_le).map(m => ({ titre: m.titre, nouveau: neuf(m.envoye_le) })); }
  catch { /* tables absentes : pas de messages */ }

  let idees = [];
  try {
    idees = db.prepare(`SELECT s.titre, s.vu_auteur_le,
        (SELECT MAX(cree_le) FROM suggestion_message m WHERE m.suggestion_id = s.id AND m.cote = 'direction') d
        FROM suggestion s WHERE s.auteur_id = ?`).all(u.id)
      .filter(s => s.d && s.d > (s.vu_auteur_le || ''))
      .map(s => ({ titre: `Réponse de la direction à votre idée « ${s.titre} »`, nouveau: neuf(s.d) }));
    if (DIRECTION.includes(u.role)) {
      idees.push(...db.prepare(`SELECT titre, auteur_nom, cree_le FROM suggestion WHERE etat = 'nouvelle' AND auteur_id IS NOT ?`)
        .all(u.id).map(s => ({ titre: `Idée de ${s.auteur_nom || 'quelqu’un'} : « ${s.titre} »`, nouveau: neuf(s.cree_le) })));
    }
  } catch { /* pas de registre des idées */ }

  const tout = [...taches, ...textes, ...messages, ...idees];
  return { taches, textes, messages, idees, nouveaux: tout.filter(x => x.nouveau).length, total: tout.length };
}

function section(titre, lignes, rendu) {
  if (!lignes.length) return '';
  return `<h3 style="color:#1B2B4B;font-size:15px;margin:18px 0 6px">${titre} (${lignes.length})</h3>
    <ul style="margin:0;padding-left:18px">${lignes.slice(0, 12).map(x => `<li style="margin:3px 0">${rendu(x)}${x.nouveau
      ? ' <b style="color:#05B7E6">· nouveau</b>' : ''}</li>`).join('')}${lignes.length > 12
      ? `<li style="color:#64748B">… et ${lignes.length - 12} autre(s)</li>` : ''}</ul>`;
}

export function composerRecap(u, a) {
  const prenom = prenomDuCompte(u);
  const corps = `<p>Bonjour${prenom ? ` ${esc(prenom)}` : ''},</p>
    <p>Voici ce qui vous attend dans Lucie${a.nouveaux ? ` — dont <b>${a.nouveaux} nouveau${a.nouveaux > 1 ? 'x' : ''}</b> depuis le dernier récapitulatif` : ''}.</p>
    ${section('Vos tâches', a.taches, t => `${esc(t.titre)}${t.echeance ? ` — pour le ${jourFr(t.echeance)}${t.retard ? ' <b style="color:#9D4A38">(en retard)</b>' : ''}` : ''}`)}
    ${section('Textes à lire et confirmer', a.textes, t => esc(t.titre))}
    ${section('Messages non lus', a.messages, m => esc(m.titre))}
    ${section('Idées d’amélioration', a.idees, i => esc(i.titre))}
    <p style="color:#64748B;font-size:12px;margin-top:18px">Ce courriel ne part que lorsqu'une chose nouvelle vous attend. Le détail est dans Lucie, sur votre tableau de bord.</p>`;
  return templateNotif({ titre: 'Ce qui vous attend dans Lucie', corps, lien: '/', lienTexte: 'Ouvrir mon tableau de bord' });
}

/** Le passage du matin. `force` : envoyer pour `seul` même hors des heures ou déjà fait (essai). */
export async function passerRecap({ seul = null, force = false } = {}) {
  migrerRecap();
  const { jour, heure } = maintenantBruxelles();
  if (!force && (!recapActif() || heure < 7)) return { envoyes: 0, raison: 'hors heure ou éteint' };
  const users = db.prepare(`SELECT id, email, role, nom_complet, professeur_id FROM utilisateur
    WHERE COALESCE(actif, 1) = 1 AND email LIKE '%@%' ${seul ? 'AND id = ?' : ''}`).all(...(seul ? [seul] : []));
  let envoyes = 0;
  for (const u of users) {
    if (!force && db.prepare('SELECT 1 FROM recap_envoi WHERE utilisateur_id = ? AND jour = ?').get(u.id, jour)) continue;
    const dernier = db.prepare(`SELECT MAX(envoye_le) d FROM recap_envoi WHERE utilisateur_id = ? AND statut IN ('envoye','simule')`).get(u.id)?.d || null;
    const a = ceQuiAttend(u, dernier);
    // RIEN DE NOUVEAU, RIEN NE PART — mais la journée est marquée, pour ne pas recalculer toutes les demi-heures.
    if (!a.nouveaux && !force) {
      db.prepare(`INSERT OR IGNORE INTO recap_envoi (utilisateur_id, jour, statut, resume) VALUES (?,?, 'rien', NULL)`).run(u.id, jour);
      continue;
    }
    const r = await envoyerEmail({ to: u.email, subject: `Lucie — ce qui vous attend (${a.nouveaux} nouveau${a.nouveaux > 1 ? 'x' : ''})`,
      html: composerRecap(u, a) });
    const statut = !r.ok ? 'echec' : r.simule ? 'simule' : 'envoye';
    db.prepare(`INSERT INTO recap_envoi (utilisateur_id, jour, statut, resume) VALUES (?,?,?,?)
      ON CONFLICT(utilisateur_id, jour) DO UPDATE SET statut = excluded.statut, resume = excluded.resume, envoye_le = datetime('now')`)
      .run(u.id, jour, statut, `${a.taches.length} tâche(s), ${a.textes.length} texte(s), ${a.messages.length} message(s), ${a.idees.length} idée(s)`);
    if (r.ok) envoyes++;
  }
  return { envoyes, jour };
}

/** Toutes les demi-heures : le premier passage après 7 h envoie ; les suivants ne trouvent plus rien à faire. */
export function planifierRecap() {
  // EN PRODUCTION SEULEMENT : la dev redirige tous les courriels vers une seule boîte, qui en recevrait un
  // par personne chaque matin. L'essai (« M'envoyer le mien ») reste ouvert partout.
  if (process.env.NODE_ENV !== 'production') return;
  const tour = () => passerRecap().catch(e => console.error('[recap quotidien]', e.message));
  setTimeout(tour, 60_000).unref?.();
  setInterval(tour, 30 * 60 * 1000).unref?.();
}
