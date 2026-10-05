// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Le garde des modules, et son mode CONSTAT
//
// CE QUI N'EST PAS MESURÉ NE SE FERME PAS À L'AVEUGLE.
//
// Poser d'un coup le contrôle sur soixante-douze portes, c'est découvrir le
// lundi matin — par le secrétariat — ce qu'on a fermé. La carte des modules
// est un travail d'interprétation : « /api/aa relève-t-il de l'organisation ou
// des étudiants ? » se tranche mieux sur des refus observés que sur une
// intuition. Et un POST qui ne fait que produire une pièce ressemble à une
// écriture sans en être une.
//
// Le garde a donc deux régimes, et le premier est celui qu'on déploie :
//
//   constat — il LAISSE PASSER et note ce qu'il aurait refusé.
//   strict  — il refuse.
//
// C'est la règle de la maison appliquée aux droits : rien ne s'écrit sans
// qu'on ait vu ce qui sera écrit. Ici, rien ne se ferme sans qu'on ait vu ce
// qui sera fermé.
// ─────────────────────────────────────────────────────────────────────────────
import db from '../db/index.js';
import { peut } from './permissions.js';
import { actionDe, moduleDe } from './carteModules.js';
import { utilisateurDuJeton, SOI_SEUL } from './auth.js';

const MODE = () => (process.env.PERMISSIONS_MODE === 'strict' ? 'strict' : 'constat');

export function migrerConstat(dbx) {
  try {
    dbx.exec(`
    CREATE TABLE IF NOT EXISTS permission_constat (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      utilisateur_id INTEGER,
      email          TEXT,
      role           TEXT,
      module         TEXT NOT NULL,
      action         TEXT NOT NULL,      -- lire | ecrire
      methode        TEXT NOT NULL,
      chemin         TEXT NOT NULL,
      occurrences    INTEGER NOT NULL DEFAULT 1,
      premiere_le    TEXT DEFAULT (datetime('now')),
      derniere_le    TEXT DEFAULT (datetime('now')),
      UNIQUE(utilisateur_id, module, action, methode, chemin)
    );`);
    console.log('[migration] permission_constat : registre du mode constat');
  } catch (e) { console.error('[migration] permission_constat :', e.message); }
}

/*
 * UNE LIGNE PAR CAS, PAS PAR REQUÊTE. Un écran qui rafraîchit toutes les dix
 * secondes produirait des milliers de lignes identiques et noierait le seul
 * refus qui compte. On compte les occurrences et on garde les deux dates :
 * « depuis quand » et « est-ce encore en cours » sont les deux questions
 * qu'on se posera en lisant ce registre.
 *
 * Le chemin est NORMALISÉ — les identifiants deviennent « :id » —, sans quoi
 * cinq cents fiches d'étudiant donneraient cinq cents lignes pour un seul fait.
 */
function normaliser(chemin) {
  return chemin.split('?')[0]
    .replace(/\/\d+(?=\/|$)/g, '/:id')
    .replace(/\/(19|20)\d{2}-(19|20)\d{2}(?=\/|$)/g, '/:annee');
}

function noter(req, module, action, u) {
  try {
    db.prepare(`
      INSERT INTO permission_constat
        (utilisateur_id, email, role, module, action, methode, chemin)
      VALUES (@uid, @email, @role, @module, @action, @methode, @chemin)
      ON CONFLICT(utilisateur_id, module, action, methode, chemin)
      DO UPDATE SET occurrences = occurrences + 1, derniere_le = datetime('now')
    `).run({
      uid: u?.id ?? null,
      email: u?.email ?? null,
      role: u?.role ?? null,
      module, action,
      methode: req.method,
      chemin: normaliser(req.originalUrl),
    });
  } catch { /* le registre ne doit jamais faire tomber une requête */ }
}

/**
 * Le garde d'un montage. `prefixe` est le segment d'URL — 'attributions',
 * 'etudiants' —, et la carte dit à quel module il appartient.
 *
 * Il ne fait RIEN pour une porte sans module : la liste `SANS_MODULE` dit
 * lesquelles, et pourquoi.
 */
/*
 * CE QU'ON A À FAIRE, ON PEUT LE DIRE FAIT (Charles, 30 septembre 2026 : Mati
 * « ne sait pas cocher une tâche réalisée »). Cocher une tâche passait par la
 * porte des réunions : un secrétariat qui les LIT sans les écrire voyait son
 * clic refusé — 29 fois pour Mati, sans un mot, l'Accueil n'affichant pas la
 * réponse. Deux gestes échappent donc au module, et deux seulement, sur les
 * tâches dont on est RESPONSABLE : se marquer « vu », et dire « fait » ou
 * « pas encore fait » — et, en lecture, voir ses propres tâches. Rien d'autre du corps ne passe : modifier l'intitulé,
 * l'échéance ou l'équipage reste un geste du module.
 */
function gesteSurSaTache(req, user) {
  try {
    const chemin = req.originalUrl.split('?')[0];
    if (req.method === 'POST' && chemin === '/api/reunions/taches/vues') return true;   // ne touche que ses propres lignes
    // LIRE SES PROPRES TÂCHES à l'Accueil : un professeur à qui l'on confie une
    // tâche ne la voyait pas (Sébastien Delvosal, 78 refus). « mien », « informe »
    // et « confie » ne rendent que ce qui concerne la personne (routes/reunions.js).
    if (req.method === 'GET' && chemin === '/api/reunions/taches'
        && ['mien', 'informe', 'confie'].some(k => req.query?.[k] === '1')) return true;
    const m = /^\/api\/reunions\/taches\/(\d+)$/.exec(chemin);
    if (req.method !== 'PUT' || !m) return false;
    const cles = Object.keys(req.body || {});
    if (!cles.length || !cles.every(k => ['statut', 'pas_fait'].includes(k))) return false;
    if (req.body.statut !== undefined && !['fait', 'a_faire', 'en_cours'].includes(req.body.statut)) return false;
    const id = Number(m[1]);
    const prof = db.prepare('SELECT professeur_id FROM utilisateur WHERE id = ?').get(user.id)?.professeur_id || null;
    return !!db.prepare(`SELECT 1 FROM tache t WHERE t.id = ? AND (t.responsable_user_id = ?
        OR EXISTS (SELECT 1 FROM tache_personne p WHERE p.tache_id = t.id AND (p.user_id = ? OR (? IS NOT NULL AND p.professeur_id = ?))))`)
      .get(id, user.id, user.id, prof, prof);
  } catch { return false; }
}

/* SA PROPRE FICHE NE DÉPEND D'AUCUN MODULE (5 octobre 2026, Loubna Sebbar :
 * « Vous n'avez pas accès à ce module (organisation) » en ouvrant « Ma fiche »).
 * La fiche d'un membre se lit par /api/ref, rangé sous Organisation ; un compte
 * professeur dont la case Organisation est décochée ne pouvait plus se lire
 * lui-même. Deux gestes passent, et seulement sur SON numéro : LIRE ce qui porte
 * ce numéro, et PROPOSER une modification (le PATCH, qui dépose une demande —
 * routes/referentiels.js). Écrire titres ou charges reste fermé. Les routes
 * gardent leur propre contrôle (soiSeul). */
function surSaFiche(req, user) {
  try {
    if (!SOI_SEUL.includes(user?.role)) return false;
    const chemin = req.originalUrl.split('?')[0];
    const m = /^\/api\/ref\/professeurs\/(\d+)(\/.*)?$/.exec(chemin);
    if (!m) return false;
    const moi = db.prepare('SELECT professeur_id FROM utilisateur WHERE id = ?').get(user.id)?.professeur_id;
    if (!moi || Number(m[1]) !== Number(moi)) return false;
    if (req.method === 'GET') return true;
    return req.method === 'PATCH' && !m[2];
  } catch { return false; }
}

export function garderModule(prefixe) {
  return (req, res, next) => {
    // Le module se résout à CHAQUE requête, et non une fois au montage : deux
    // modules peuvent partager une porte — la dotation vit sous /api/pilotage.
    const module = moduleDe(prefixe, req.originalUrl.split('?')[0]);
    if (!module) return next();

    // LE GARDE PASSE AVANT `authRequired`, qui est posé par route et non au
    // montage : `req.user` n'existe pas encore ici. Sans cette lecture, le
    // garde ne voyait que des anonymes et laissait TOUT passer — un cadenas
    // monté à l'envers, qui se referme sur le vide.
    const user = req.user || utilisateurDuJeton(req);
    // Pas de jeton : c'est `authRequired` qui répondra, pas nous. Le garde ne
    // se prononce que sur ce qu'un utilisateur CONNU a le droit de faire.
    if (!user) return next();

    const action = actionDe(req);
    const droit = peut(user, module, action);

    if (droit) {
      // 'demande' — la coordination n'écrit pas, elle propose. Les écrans qui
      // savent déposer une demande lisent `req.ecriture` ; ceux qui ne le
      // savent pas se comportent comme avant, et le constat les révélera.
      if (action === 'ecrire') req.ecriture = droit;
      return next();
    }

    if (gesteSurSaTache(req, user)) return next();
    if (surSaFiche(req, user)) return next();

    noter(req, module, action, user);
    if (MODE() === 'constat') {
      // On laisse passer, mais on le DIT : une permission qui ne s'applique
      // pas doit au moins s'entendre. L'en-tête sert aux essais automatisés
      // et au bandeau de développement.
      res.setHeader('X-Lucie-Permission', `constat:${module}:${action}`);
      return next();
    }

    return res.status(403).json({
      error: action === 'lire'
        ? `Vous n'avez pas accès à ce module (${module}).`
        : `Vous n'avez pas le droit de modifier ce module (${module}).`,
      module, action,
    });
  };
}

export { MODE };
