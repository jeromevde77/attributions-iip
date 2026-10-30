// ─────────────────────────────────────────────────────────────────────────────
// LES RAPPELS PAR COURRIEL (3.1.522, étape 1 — Charles, 30 octobre 2026 : « points non encodés, documents non vus,
// délibération dans moins de 10 jours… avec courriel automatique » ; analyse : docs/contexte/analyse-rappels-2026-10-30.md).
//
// Un moteur, un catalogue. Chaque source de rappel (l'échéancier aujourd'hui ; la délibération, le personnel et les
// étudiants aux étapes suivantes) dépose ses rappels dans une FILE, une ligne par personne et par rappel :
//   · ordinaire → il part dans le RÉCAPITULATIF DU MATIN (lib/recapQuotidien.js, rubrique « Rappels ») ;
//   · urgent    → il part AUSSITÔT, groupé avec les autres urgents de la même personne (un courriel par passage).
// Le doublon est empêché en amont par `rappel_envoye` (canal 'email'), à la source.
//
// La DIRECTION SEULE règle (tranché le 30 octobre) : un interrupteur général et un par rappel, dans
// Configuration → Courriels → Rappels. Personne ne se désabonne. Automatique en production seulement (la dev
// redirige tout vers une boîte) ; l'essai « m'envoyer mes rappels » reste ouvert partout.
// ─────────────────────────────────────────────────────────────────────────────
import db from '../db/index.js';
import { envoyerEmail, templateNotif } from '../services/mailer.js';
import { prenomDuCompte } from './nom.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** LE CATALOGUE : ce qui existe, pour qui, quand. Une entrée = un interrupteur dans Configuration. */
export const CATALOGUE = [
  { cle: 'echeancier', titre: "Les échéances de l'échéancier",
    pour: "Le responsable de l'échéance, ou les comptes de son rôle (la coordination : ses sections seulement).",
    quand: "Aux jalons de chaque type d'échéance (J-30, J-7, J-1…), puis chaque semaine en retard.",
    urgent: "Le jour J part aussitôt ; le reste, le matin." },
];

const DEFAUT = { actif: true, types: Object.fromEntries(CATALOGUE.map(c => [c.cle, { actif: true }])) };

export function migrerRappels(dbx = db) {
  dbx.exec(`CREATE TABLE IF NOT EXISTS rappel_courriel (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    utilisateur_id INTEGER NOT NULL,
    cle TEXT NOT NULL,
    titre TEXT NOT NULL,
    detail TEXT,
    lien TEXT,
    urgent INTEGER NOT NULL DEFAULT 0,
    cree_le TEXT DEFAULT (datetime('now')),
    envoye_le TEXT,
    statut TEXT
  )`);
  dbx.exec(`CREATE INDEX IF NOT EXISTS idx_rappel_courriel_attente ON rappel_courriel (utilisateur_id, envoye_le)`);
}

export function reglagesRappels() {
  let r = null;
  try { r = JSON.parse(db.prepare(`SELECT valeur FROM lucie_config WHERE cle = 'rappels'`).get()?.valeur || 'null'); } catch { r = null; }
  const types = { ...DEFAUT.types, ...(r?.types || {}) };
  return { actif: r?.actif !== false, types };
}

export function reglerRappels({ actif, types } = {}) {
  const cur = reglagesRappels();
  const prochain = {
    actif: actif === undefined ? cur.actif : !!actif,
    types: Object.fromEntries(CATALOGUE.map(c => [c.cle, { actif: types?.[c.cle]?.actif === undefined ? cur.types[c.cle]?.actif !== false : !!types[c.cle].actif }])),
  };
  db.prepare(`INSERT INTO lucie_config (cle, valeur) VALUES ('rappels', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur`)
    .run(JSON.stringify(prochain));
  return prochain;
}

/** Ce rappel part-il ? (interrupteur général et le sien) */
export function rappelActif(cle) {
  const r = reglagesRappels();
  return r.actif && r.types[cle]?.actif !== false;
}

/** Les comptes actifs d'un rôle, restreints à une section pour ceux qui sont bornés à leurs sections. */
const VOIT_TOUT = ['admin', 'directeur', 'directeur_adjoint', 'secretariat', 'editeur'];
export function comptesDuRole(role, section = null) {
  const l = db.prepare(`SELECT id, role, COALESCE(perimetre_toutes, 0) toutes FROM utilisateur
    WHERE role = ? AND COALESCE(actif, 1) = 1 AND email LIKE '%@%'`).all(role);
  if (!section || VOIT_TOUT.includes(role)) return l.map(u => u.id);
  const sec = db.prepare('SELECT 1 FROM utilisateur_section WHERE utilisateur_id = ? AND section_code = ?');
  return l.filter(u => u.toutes || sec.get(u.id, section)).map(u => u.id);
}

/** Déposer un rappel dans la file (rien si ce rappel est éteint). */
export function mettreEnFile({ utilisateurId, cle, titre, detail = null, lien = null, urgent = false }) {
  if (!utilisateurId || !rappelActif(cle)) return false;
  migrerRappels();
  db.prepare(`INSERT INTO rappel_courriel (utilisateur_id, cle, titre, detail, lien, urgent) VALUES (?,?,?,?,?,?)`)
    .run(utilisateurId, cle, titre, detail, lien, urgent ? 1 : 0);
  return true;
}

/** Les rappels qui attendent le récapitulatif du matin (ordinaires, pas encore partis). */
export function rappelsEnAttente(utilisateurId) {
  migrerRappels();
  return db.prepare(`SELECT id, cle, titre, detail, lien, cree_le FROM rappel_courriel
    WHERE utilisateur_id = ? AND envoye_le IS NULL AND urgent = 0 ORDER BY cree_le`).all(utilisateurId);
}

export function marquerEnvoyes(ids, statut) {
  if (!ids.length) return;
  db.prepare(`UPDATE rappel_courriel SET envoye_le = datetime('now'), statut = ? WHERE id IN (${ids.map(() => '?').join(',')})`)
    .run(statut, ...ids);
}

function ligne(r) {
  return `<li style="margin:4px 0"><b>${esc(r.titre)}</b>${r.detail ? `<br><span style="color:#475569">${esc(r.detail)}</span>` : ''}</li>`;
}
/** La rubrique « Rappels » du récapitulatif. */
export function rubriqueRappels(l) {
  if (!l.length) return '';
  return `<h3 style="color:#1B2B4B;font-size:15px;margin:18px 0 6px">Rappels (${l.length})</h3>
    <ul style="margin:0;padding-left:18px">${l.slice(0, 20).map(ligne).join('')}${l.length > 20
      ? `<li style="color:#64748B">… et ${l.length - 20} autre(s)</li>` : ''}</ul>`;
}

/** Les urgents : un courriel par personne, qui groupe ce qui est dû. `seul` : l'essai d'une personne. */
export async function envoyerUrgents({ seul = null } = {}) {
  migrerRappels();
  if (!seul && !reglagesRappels().actif) return { envoyes: 0 };
  const l = db.prepare(`SELECT r.*, u.email, u.role, u.nom_complet FROM rappel_courriel r JOIN utilisateur u ON u.id = r.utilisateur_id
    WHERE r.envoye_le IS NULL AND (r.urgent = 1 ${seul ? 'OR 1 = 1' : ''}) ${seul ? 'AND r.utilisateur_id = ?' : ''}
    ORDER BY r.utilisateur_id, r.cree_le`).all(...(seul ? [seul] : []));
  const parPersonne = new Map();
  for (const r of l) { if (!parPersonne.has(r.utilisateur_id)) parPersonne.set(r.utilisateur_id, []); parPersonne.get(r.utilisateur_id).push(r); }
  let envoyes = 0;
  for (const [, rs] of parPersonne) {
    const u = rs[0];
    const prenom = prenomDuCompte({ nom_complet: u.nom_complet, email: u.email });
    const html = templateNotif({ titre: rs.length > 1 ? 'Des rappels pour vous' : 'Un rappel pour vous',
      corps: `<p>Bonjour${prenom ? ` ${esc(prenom)}` : ''},</p><ul style="margin:0;padding-left:18px">${rs.map(ligne).join('')}</ul>
        <p style="color:#64748B;font-size:12px;margin-top:18px">Rappel automatique de Lucie. Le détail est dans Lucie.</p>`,
      lien: rs[0].lien || '/', lienTexte: 'Ouvrir Lucie' });
    const r = await envoyerEmail({ to: u.email, subject: `Lucie — ${rs.length > 1 ? `${rs.length} rappels` : rs[0].titre}`, html });
    marquerEnvoyes(rs.map(x => x.id), !r.ok ? 'echec' : r.simule ? 'simule' : 'envoye');
    if (r.ok) envoyes++;
  }
  return { envoyes };
}

/** Ce qui est parti (Configuration → Rappels). */
export function historiqueRappels(limite = 60) {
  migrerRappels();
  return db.prepare(`SELECT r.id, r.cle, r.titre, r.urgent, r.cree_le, r.envoye_le, r.statut, u.nom_complet, u.email
    FROM rappel_courriel r LEFT JOIN utilisateur u ON u.id = r.utilisateur_id ORDER BY r.id DESC LIMIT ?`).all(limite);
}

/** Toutes les 30 minutes, en production seulement : les urgents partent. */
export function planifierRappels() {
  migrerRappels();
  if (process.env.NODE_ENV !== 'production') return;
  const tour = () => envoyerUrgents().catch(e => console.error('[rappels]', e.message));
  setTimeout(tour, 90_000).unref?.();
  setInterval(tour, 30 * 60 * 1000).unref?.();
}
