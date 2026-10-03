// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Profils d'accès
//
// UN PROFIL EST UN HÉRITAGE (Charles, 30 septembre 2026 : « il ne met pas les
// profils à jour sur base des accès dans config » — tranché : la fiche suit le
// profil). Jusque-là le profil était un MODÈLE : appliqué, il remplissait les
// cases de la fiche, qui n'en dépendaient plus ; corriger un profil ne changeait
// aucun compte existant, et la fiche montrait un état que plus personne ne
// réglait.
//
// Désormais chaque compte porte :
//   · `permissions_exceptions` — CE QUI DIFFÈRE DE SON PROFIL, posé à la main
//     sur la personne (null = une case du profil retirée) ;
//   · `permissions_json` — la copie EFFECTIVE, profil + exceptions, que lisent
//     tous les contrôles de droits (inchangés). Elle se recalcule quand le
//     profil du rôle change, quand le rôle change, quand la fiche change.
// Le profil d'un rôle est le profil DE RÉFÉRENCE (systeme = 1) de ce rôle.
// Un compte sans aucune case (permissions_json vide) suit son rôle entier,
// comme avant, et n'est pas touché.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';
import { MODULES, ROLES, NIVEAUX, invaliderPlafonds, rolesConnus } from '../middleware/permissions.js';
import { tableauGestes } from '../lib/gestes.js';

const r = Router();

export function migrerProfilsAcces(dbx) {
  try {
    dbx.exec(`
    CREATE TABLE IF NOT EXISTS profil_acces (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      nom              TEXT NOT NULL UNIQUE,
      role             TEXT NOT NULL,
      description      TEXT,
      permissions_json TEXT,
      systeme          INTEGER NOT NULL DEFAULT 0,
      maj_le           TEXT DEFAULT (datetime('now'))
    );`);

    const perm = (modules, ecrire = false) => JSON.stringify(
      Object.fromEntries(MODULES.map(m => [m, {
        lire: modules === 'tous' || modules.includes(m),
        ecrire: ecrire && (modules === 'tous' || modules.includes(m)),
      }])));

    const defauts = [
      ['Directeur', 'directeur', "Tout, y compris les référentiels et la validation des demandes", perm('tous', true)],
      ['Directeur adjoint', 'directeur_adjoint', "Mêmes droits que le directeur, même pouvoir de validation", perm('tous', true)],
      ['Administrateur technique', 'admin', "Compte sans fiche : prestataire extérieur", perm('tous', true)],
      ['Secrétariat', 'secretariat',
       "Lecture partout, écriture sur les étudiants et le centre d'impression",
       perm('tous', false)],
      ['Coordination', 'coordination',
       "Encode pour ses sections ; ses modifications sont validées par la direction",
       perm(['etudiants', 'attributions', 'organisation', 'planification', 'budget',
             'listes', 'pilotage'], true)],
      ['Professeur', 'professeur', "Ses propres attributions et ses données",
       perm(['attributions', 'personnel', 'planification'], false)],
      ['Consultation', 'consultation', 'Lecture seule', perm('tous', false)],
    ];
    const up = dbx.prepare(`
      INSERT OR IGNORE INTO profil_acces (nom, role, description, permissions_json, systeme)
      VALUES (?,?,?,?,1)`);
    for (const [nom, role, desc, pj] of defauts) up.run(nom, role, desc, pj);
    console.log('[migration] profil_acces : 5 profils de référence');
  } catch (e) { console.error('[migration] profils accès :', e.message); }
}

// ── L'héritage ──────────────────────────────────────────────────────────────
const lireJson = t => { try { return t ? (typeof t === 'string' ? JSON.parse(t) : t) : null; } catch { return null; } };

export function profilDuRole(role) {
  try {
    const p = db.prepare('SELECT permissions_json FROM profil_acces WHERE role = ? AND systeme = 1 ORDER BY id LIMIT 1').get(role);
    return p ? (lireJson(p.permissions_json) || {}) : null;
  } catch { return null; }
}

/** Ce qui, dans `complet`, diffère de `base` — module par module, case par
 *  case. Une case ou un module présent dans le profil et absent de la fiche
 *  s'écrit `null` : la fusion le retire, et le droit reste celui d'avant. */
export function ecartsAuProfil(complet, base) {
  const c = complet || {}, b = base || {}, ex = {};
  for (const m of new Set([...Object.keys(c), ...Object.keys(b)])) {
    if (!(m in c)) { ex[m] = null; continue; }
    const cm = c[m] || {}, bm = b[m];
    if (!bm) { ex[m] = { ...cm }; continue; }
    const d = {};
    for (const k of new Set([...Object.keys(cm), ...Object.keys(bm)])) {
      if (!(k in cm)) d[k] = null;
      else if (cm[k] !== bm[k]) d[k] = cm[k];
    }
    if (Object.keys(d).length) ex[m] = d;
  }
  return ex;
}

export function fusionnerProfil(base, ex) {
  const out = JSON.parse(JSON.stringify(base || {}));
  for (const [m, v] of Object.entries(ex || {})) {
    if (v === null) { delete out[m]; continue; }
    out[m] = { ...(out[m] || {}) };
    for (const [k, x] of Object.entries(v)) { if (x === null) delete out[m][k]; else out[m][k] = x; }
  }
  return out;
}

/** Écrit les droits d'un compte à partir de ce que la fiche montre : les
 *  exceptions se déduisent du profil du rôle. Sans profil pour ce rôle, la
 *  fiche est gardée telle quelle, sans héritage. */
export function enregistrerDroits(userId, role, complet) {
  const c = lireJson(complet);
  if (c == null) return;
  const base = profilDuRole(role);
  const ex = base ? ecartsAuProfil(c, base) : null;
  db.prepare('UPDATE utilisateur SET permissions_json = ?, permissions_exceptions = ? WHERE id = ?')
    .run(JSON.stringify(c), ex ? JSON.stringify(ex) : null, userId);
}

/** Le rôle a changé de profil, ou le compte a changé de rôle : on recalcule. */
export function recalculerDroits({ role = null, userId = null } = {}) {
  const lignes = userId
    ? db.prepare('SELECT id, role, permissions_json, permissions_exceptions FROM utilisateur WHERE id = ?').all(userId)
    : db.prepare('SELECT id, role, permissions_json, permissions_exceptions FROM utilisateur WHERE role = ?').all(role);
  let n = 0;
  const maj = db.prepare('UPDATE utilisateur SET permissions_json = ? WHERE id = ?');
  for (const u of lignes) {
    if (!u.permissions_json || u.permissions_exceptions == null) continue;   // suit son rôle, ou sans héritage
    const base = profilDuRole(u.role);
    if (!base) continue;
    const eff = JSON.stringify(fusionnerProfil(base, lireJson(u.permissions_exceptions) || {}));
    if (eff !== u.permissions_json) { maj.run(eff, u.id); n++; }
  }
  return n;
}

/** Le module « réunions » dans les profils de référence : la valeur de
 *  « procédures », écriture pour la coordination. Après la conversion en
 *  exceptions, pour que les comptes le reçoivent de leur profil. */
export function migrerModuleReunions(dbx) {
  try {
    const roles = [];
    for (const p of dbx.prepare('SELECT id, role, permissions_json FROM profil_acces WHERE systeme = 1').all()) {
      const pj = lireJson(p.permissions_json) || {};
      if (pj.reunions) continue;
      pj.reunions = p.role === 'coordination' ? { lire: true, ecrire: true } : { ...(pj.procedures || { lire: false, ecrire: false }) };
      dbx.prepare("UPDATE profil_acces SET permissions_json = ?, maj_le = datetime('now') WHERE id = ?").run(JSON.stringify(pj), p.id);
      roles.push(p.role);
    }
    let n = 0;
    for (const role of roles) n += recalculerDroits({ role });
    if (roles.length) console.log(`[migration] module réunions : ${roles.length} profil(s), ${n} compte(s) mis à jour`);
  } catch (e) { console.error('[migration] module réunions :', e.message); }
}

export function migrerExceptions(dbx) {
  try {
    const cols = dbx.prepare('PRAGMA table_info(utilisateur)').all().map(c => c.name);
    if (!cols.includes('permissions_exceptions')) dbx.exec('ALTER TABLE utilisateur ADD COLUMN permissions_exceptions TEXT');
    // Chaque fiche devient « profil + écarts » : les droits de chacun restent
    // EXACTEMENT ceux d'avant, seul le profil pourra désormais les faire bouger.
    let n = 0;
    for (const u of dbx.prepare(`SELECT id, role, permissions_json FROM utilisateur
        WHERE permissions_json IS NOT NULL AND permissions_json != '' AND permissions_exceptions IS NULL`).all()) {
      const base = profilDuRole(u.role);
      const c = lireJson(u.permissions_json);
      if (!base || !c) continue;
      dbx.prepare('UPDATE utilisateur SET permissions_exceptions = ? WHERE id = ?').run(JSON.stringify(ecartsAuProfil(c, base)), u.id);
      n++;
    }
    if (n) console.log(`[migration] ${n} compte(s) : droits convertis en profil + exceptions`);
  } catch (e) { console.error('[migration] exceptions de droits :', e.message); }
}

r.get('/', authRequired, (req, res) => {
  res.json(db.prepare('SELECT * FROM profil_acces ORDER BY systeme DESC, nom').all()
    .map(p => ({ ...p, permissions: p.permissions_json ? JSON.parse(p.permissions_json) : {} })));
});

r.post('/', authRequired, roleRequired('admin'), (req, res) => {
  const { nom, role, description, permissions } = req.body || {};
  if (!nom || !role) return res.status(400).json({ error: 'nom et role requis' });
  try {
    const info = db.prepare(`
      INSERT INTO profil_acces (nom, role, description, permissions_json)
      VALUES (?,?,?,?)`).run(nom.trim(), role, description || null,
                             JSON.stringify(permissions || {}));
    res.json({ ok: true, id: Number(info.lastInsertRowid) });
  } catch (e) {
    res.status(400).json({ error: /UNIQUE/.test(e.message) ? 'Ce nom existe déjà' : e.message });
  }
});

// ── Plafonds par rôle ───────────────────────────────────────────────────────
// Ce qu'un rôle autorise AU MIEUX, module par module. Les cases d'une fiche
// affinent à l'intérieur, sans jamais pouvoir accorder davantage. Réservé à la
// direction : c'est la charpente du cloisonnement.
r.get('/plafonds', authRequired, (req, res) => {
  const lignes = db.prepare('SELECT role, module, niveau FROM role_plafond').all();
  const par = {};
  for (const l of lignes) (par[l.role] = par[l.role] || {})[l.module] = l.niveau;
  const rc = rolesConnus();
  res.json({ roles: rc.codes, libelles: rc.libelles, personnalises: rc.definis,
             modules: MODULES, niveaux: NIVEAUX, plafonds: par });
});

/* LES GESTES — qui peut faire quoi, au-delà du module (Charles, 3 octobre
 * 2026 : « il faut les gestes »). EN LECTURE : le catalogue décrit ce que le
 * code applique aujourd'hui (lib/gestes.js), il n'autorise rien. Mêmes rôles,
 * dans le même ordre, que la grille des plafonds ; même réserve d'accès que
 * l'écran qui le montre. */
r.get('/gestes', authRequired, roleRequired('admin', 'directeur', 'directeur_adjoint'), (req, res) => {
  const lignes = db.prepare('SELECT role, module, niveau FROM role_plafond').all();
  const par = {};
  for (const l of lignes) (par[l.role] = par[l.role] || {})[l.module] = l.niveau;
  const rc = rolesConnus();
  res.json({ roles: rc.codes, libelles: rc.libelles,
             mode_modules: process.env.PERMISSIONS_MODE === 'strict' ? 'strict' : 'constat',
             ...tableauGestes(rc.codes, (role, module) => par[role]?.[module] ?? null) });
});

/* CRÉER UN RÔLE — la liste cesse d'être une constante du code. Un rôle défini
 * n'a aucun pouvoir spécial : il ne vaut que par ses plafonds, amorcés à
 * « rien » (ou copiés d'un rôle modèle), que la direction règle écran par
 * écran ci-dessus. Le périmètre de sections, lui, se pose sur chaque fiche. */
r.post('/roles', authRequired, roleRequired('admin', 'directeur', 'directeur_adjoint'),
  (req, res) => {
    const libelle = String(req.body?.libelle || '').trim();
    if (!libelle) return res.status(400).json({ error: 'Libellé obligatoire.' });
    const code = libelle.normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
    if (!code) return res.status(400).json({ error: 'Libellé illisible.' });
    const rc = rolesConnus();
    if (rc.codes.includes(code)) {
      return res.status(409).json({ error: `Le rôle « ${code} » existe déjà.` });
    }
    const modele = req.body?.modele && rc.codes.includes(req.body.modele)
      ? req.body.modele : null;
    /* Un modèle DIRECTION ne se copie pas : on n'amorce pas un rôle défini
     * avec l'écriture partout d'un directeur. */
    const modeleSur = modele && !['admin', 'directeur', 'directeur_adjoint'].includes(modele)
      ? modele : null;
    const tx = db.transaction(() => {
      db.prepare('INSERT INTO role_defini (code, libelle) VALUES (?,?)').run(code, libelle);
      const ins = db.prepare('INSERT OR REPLACE INTO role_plafond (role, module, niveau) VALUES (?,?,?)');
      for (const m of MODULES) {
        const niveau = modeleSur
          ? (db.prepare('SELECT niveau FROM role_plafond WHERE role = ? AND module = ?')
              .get(modeleSur, m)?.niveau || 'rien')
          : 'rien';
        ins.run(code, m, niveau);
      }
    });
    tx();
    invaliderPlafonds();
    res.status(201).json({ ok: true, code, libelle });
  });

/* SUPPRIMER UN RÔLE DÉFINI — jamais un rôle de la maison, et jamais un rôle
 * porté : un compte dont le rôle disparaît deviendrait un compte sans droits
 * sans que personne ne l'ait décidé pour LUI. On réaffecte d'abord. */
r.delete('/roles/:code', authRequired, roleRequired('admin', 'directeur', 'directeur_adjoint'),
  (req, res) => {
    const code = req.params.code;
    const d = db.prepare('SELECT code FROM role_defini WHERE code = ?').get(code);
    if (!d) return res.status(404).json({ error: 'Seul un rôle défini se supprime.' });
    const portes = db.prepare('SELECT COUNT(*) AS n FROM utilisateur WHERE role = ?').get(code).n;
    if (portes > 0) {
      return res.status(409).json({
        error: `${portes} compte(s) portent encore ce rôle : réaffectez-les d'abord.`,
      });
    }
    db.prepare('DELETE FROM role_plafond WHERE role = ?').run(code);
    db.prepare('DELETE FROM role_defini WHERE code = ?').run(code);
    invaliderPlafonds();
    res.json({ ok: true });
  });

/*
 * CE QUE LE MODE CONSTAT A VU.
 *
 * Un registre que personne ne peut lire n'existe pas : le mode constat n'a de
 * sens que si l'on vient regarder ce qu'il a noté avant de fermer. Chaque
 * ligne est un refus qui AURAIT eu lieu — à lire comme une question : « cette
 * personne devrait-elle y avoir accès ? » Si oui, c'est le plafond ou la carte
 * des modules qu'il faut corriger, pas le constat qu'il faut ignorer.
 */
r.get('/constat', authRequired, roleRequired('admin', 'directeur', 'directeur_adjoint'),
  (req, res) => {
    let lignes = [];
    try {
      lignes = db.prepare(`
        SELECT email, role, module, action, methode, chemin, occurrences,
               premiere_le, derniere_le
        FROM permission_constat
        ORDER BY occurrences DESC, derniere_le DESC
        LIMIT 500`).all();
    } catch { /* la table n'existe pas encore : registre vide */ }
    res.json({
      mode: process.env.PERMISSIONS_MODE === 'strict' ? 'strict' : 'constat',
      lignes,
      // Le résumé répond à la seule question qui décide : qui perdrait quoi ?
      par_personne: Object.values(lignes.reduce((acc, l) => {
        const c = acc[l.email] || (acc[l.email] = {
          email: l.email, role: l.role, modules: new Set(), total: 0 });
        c.modules.add(l.module); c.total += l.occurrences;
        return acc;
      }, {})).map(c => ({ ...c, modules: [...c.modules] })),
    });
  });

/** Repartir de zéro, après avoir corrigé un plafond ou la carte. */
r.delete('/constat', authRequired, roleRequired('admin', 'directeur', 'directeur_adjoint'),
  (req, res) => {
    try { db.prepare('DELETE FROM permission_constat').run(); } catch { /* rien à vider */ }
    res.json({ ok: true });
  });

r.put('/plafonds', authRequired, roleRequired('admin', 'directeur', 'directeur_adjoint'),
  (req, res) => {
    const { role, module, niveau } = req.body || {};
    if (!rolesConnus().codes.includes(role)) return res.status(400).json({ error: 'rôle inconnu' });
    if (!MODULES.includes(module)) return res.status(400).json({ error: 'module inconnu' });
    if (!NIVEAUX.includes(niveau)) return res.status(400).json({ error: 'niveau inconnu' });

    // Un garde-fou demeure : la direction ne peut pas se fermer la porte, et
    // l'on ne saurait plus rien réparer si elle le faisait par mégarde.
    if (['admin', 'directeur', 'directeur_adjoint'].includes(role) && niveau !== 'ecrit') {
      return res.status(400).json({
        error: "La direction conserve l'écriture sur tous les modules : c'est elle qui "
             + "répare les erreurs de paramétrage.",
      });
    }

    db.prepare(`
      INSERT INTO role_plafond (role, module, niveau, maj_le) VALUES (?,?,?, datetime('now'))
      ON CONFLICT(role, module) DO UPDATE SET niveau = excluded.niveau, maj_le = datetime('now')
    `).run(role, module, niveau);

    invaliderPlafonds();
    res.json({
      ok: true,
      avertissement: niveau === 'validation'
        ? "Les écrans qui ne savent pas encore transmettre une demande refuseront la saisie "
        + "avec un message explicite."
        : null,
    });
  });

r.put('/:id', authRequired, roleRequired('admin'), (req, res) => {
  const p = db.prepare('SELECT * FROM profil_acces WHERE id = ?').get(Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'profil introuvable' });
  const { nom, role, description, permissions } = req.body || {};
  db.prepare(`
    UPDATE profil_acces SET nom = ?, role = ?, description = ?, permissions_json = ?,
      maj_le = datetime('now') WHERE id = ?
  `).run(nom || p.nom, role || p.role, description ?? p.description,
         JSON.stringify(permissions || {}), p.id);
  // L'héritage : les comptes du rôle suivent leur profil de référence. Les
  // exceptions posées sur une personne restent les siennes.
  let comptes = 0;
  if (p.systeme) {
    comptes += recalculerDroits({ role: p.role });
    if (role && role !== p.role) comptes += recalculerDroits({ role });
    invaliderPlafonds();
  }
  res.json({ ok: true, comptes_mis_a_jour: comptes, avertissement: p.systeme
    ? `Profil de référence modifié : ${comptes} compte(s) mis à jour. Les exceptions posées sur une personne restent les siennes.`
    : "Ce profil n'est pas le profil de référence d'un rôle : il sert de modèle, les comptes ne le suivent pas." });
});

r.delete('/:id', authRequired, roleRequired('admin'), (req, res) => {
  const p = db.prepare('SELECT * FROM profil_acces WHERE id = ?').get(Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'profil introuvable' });
  if (p.systeme) return res.status(400).json({ error: 'Un profil de référence ne se supprime pas' });
  db.prepare('DELETE FROM profil_acces WHERE id = ?').run(p.id);
  res.json({ ok: true });
});

export default r;
