// ─────────────────────────────────────────────────────────────────────────────
// LA BASCULE DES PROFESSEURS VERS LEUR ESPACE (3.5.212, Charles, 7 novembre 2026 : « fixer la date de bascule » ; règle du
// 6 novembre : « les enseignants ne pourront plus se connecter à Lucie — Lucie est coupée en 3 »).
// La direction fixe une date (Configuration → Mise en service). À partir de ce jour (Bruxelles), un compte au rôle « professeur »
// n'entre plus dans Lucie : la connexion le renvoie vers son espace, et une session ouverte s'arrête à la requête suivante.
// Restent ouverts : le RELAIS de l'espace enseignant (jeton `relais`, signé par Lucie elle-même) et l'aperçu de la direction.
// La coordination et la direction qui enseignent gardent Lucie : la règle ne lit que le rôle « professeur ».
// Une date se fixe seulement quand l'espace enseignant est ouvert à TOUS (« allumée ») : sinon des professeurs perdraient
// toute porte. Sans date, rien ne change.
// ─────────────────────────────────────────────────────────────────────────────
import db from '../db/index.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
let cache = { t: 0, v: null };
export const URL_ESPACE = () => (process.env.ENSEIGNANTS_URL_PUBLIQUE || 'https://enseignants.lucie-iip.be').replace(/\/$/, '');
const jourBruxelles = () => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Brussels' }).format(new Date());

export function lireBascule() {
  if (Date.now() - cache.t < 30_000) return cache.v;
  let v = null;
  try { v = JSON.parse(db.prepare(`SELECT valeur FROM lucie_config WHERE cle = 'bascule_professeurs'`).get()?.valeur || 'null'); } catch { v = null; }
  cache = { t: Date.now(), v: v?.date && ISO.test(v.date) ? v : null };
  return cache.v;
}

export function ecrireBascule(date, par) {
  const v = date ? { date, pose_par: par, pose_le: new Date().toISOString() } : null;
  if (date && !ISO.test(String(date))) throw Object.assign(new Error('Date attendue (aaaa-mm-jj).'), { status: 400 });
  db.prepare(`INSERT INTO lucie_config (cle, valeur) VALUES ('bascule_professeurs', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur`)
    .run(JSON.stringify(v));
  cache = { t: 0, v: null };
  return lireBascule();
}

/** Ce compte est-il passé dans son espace ? (rôle professeur, date atteinte, hors relais et aperçu) */
export function estBascule(user) {
  if (!user || user.relais || user.preview || user.apercuProfId) return false;
  if (String(user.role || '') !== 'professeur') return false;
  const b = lireBascule();
  return !!b && jourBruxelles() >= b.date;
}

export const refusBascule = () => ({
  error: `Depuis le ${lireBascule().date.split('-').reverse().join('/')}, les enseignants travaillent dans leur espace : ${URL_ESPACE()}`,
  bascule: true, url: URL_ESPACE(),
});

/** Où envoyer un professeur depuis un courriel : son espace s'il lui est ouvert (rôle professeur, fonction de l'espace). */
export async function lienPour(u) {
  if (String(u?.role || '') !== 'professeur') return null;
  const { fonctionPour } = await import('./fonctions.js');
  return fonctionPour('enseignant.espace', { userId: u.id }) ? URL_ESPACE() : null;
}
