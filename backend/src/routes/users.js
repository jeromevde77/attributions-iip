import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';

const r = Router();

const ROLES = ['admin', 'editeur', 'consultation', 'coordination'];

// Helper : récupère les sections d'un utilisateur
function sectionsOf(userId) {
  return db.prepare('SELECT section_code FROM utilisateur_section WHERE utilisateur_id = ?')
    .all(userId).map(r => r.section_code);
}

// Helper : remplace les sections d'un utilisateur
function setSections(userId, sections) {
  db.prepare('DELETE FROM utilisateur_section WHERE utilisateur_id = ?').run(userId);
  if (Array.isArray(sections)) {
    const ins = db.prepare('INSERT OR IGNORE INTO utilisateur_section (utilisateur_id, section_code) VALUES (?, ?)');
    for (const s of sections) if (s) ins.run(userId, s);
  }
}

r.get('/', authRequired, roleRequired('admin'), (req, res) => {
  const users = db.prepare(`
    SELECT id, email, nom_complet, role, actif, professeur_id, created_at, last_login_at,
           acces_recrutement, permissions_json
    FROM utilisateur ORDER BY nom_complet
  `).all();
  // Joindre les sections pour les coordinations
  for (const u of users) {
    u.sections = sectionsOf(u.id); // toujours, pour que l'UI affiche le périmètre réel
    }
  res.json(users);
});

r.post('/', authRequired, roleRequired('admin'), (req, res) => {
  const { email, password, nom_complet, role, sections, professeur_id } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });
  const roleNorm = role;
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Rôle invalide' });
  try {
    // Si un compte existe déjà avec cet email, le lier au prof plutôt que créer
    const existing = db.prepare('SELECT id FROM utilisateur WHERE email = ?').get(email);
    if (existing) {
      if (professeur_id) {
        db.prepare('UPDATE utilisateur SET professeur_id = ?, role = ?, actif = 1 WHERE id = ?')
          .run(professeur_id, roleNorm, existing.id);
        if (role === 'coordination') setSections(existing.id, sections);
      }
      return res.status(200).json({ id: existing.id, linked: true });
    }
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(`
      INSERT INTO utilisateur (email, password_hash, nom_complet, role, actif, professeur_id)
      VALUES (?, ?, ?, ?, 1, ?)
    `).run(email, hash, nom_complet || email, role, professeur_id || null);
    if (role === 'coordination') setSections(result.lastInsertRowid, sections);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'Email déjà utilisé' });
    throw e;
  }
});

r.patch('/:id', authRequired, roleRequired('admin'), (req, res) => {
  const { nom_complet, role, actif, password, sections, professeur_id, acces, permissions_json, acces_recrutement } = req.body || {};
  const updates = [];
  const params = { id: req.params.id };
  if (nom_complet !== undefined) { updates.push('nom_complet = @nom_complet'); params.nom_complet = nom_complet; }
  if (professeur_id !== undefined) { updates.push('professeur_id = @professeur_id'); params.professeur_id = professeur_id || null; }
  if (role !== undefined) {
    const roleNorm = role;
    if (!ROLES.includes(roleNorm)) return res.status(400).json({ error: 'Rôle invalide' });
    updates.push('role = @role'); params.role = roleNorm;
  }
  if (actif !== undefined) { updates.push('actif = @actif'); params.actif = actif ? 1 : 0; }
  if (password) {
    updates.push('password_hash = @hash');
    params.hash = bcrypt.hashSync(password, 10);
  }
  // permissions_json (nouveau système)
  if (permissions_json !== undefined) {
    updates.push('permissions_json = @permissions_json');
    params.permissions_json = typeof permissions_json === 'string' ? permissions_json : JSON.stringify(permissions_json);
  }
  // Compat ancienne colonne acces_recrutement
  if (acces_recrutement !== undefined) {
    updates.push('acces_recrutement = @acces_recrutement');
    params.acces_recrutement = acces_recrutement ? 1 : 0;
  }
  if (acces !== undefined) {
    if (acces.recrutement !== undefined) {
      updates.push('acces_recrutement = @acces_recrutement');
      params.acces_recrutement = acces.recrutement ? 1 : 0;
    }
  }
  if (updates.length) {
    db.prepare(`UPDATE utilisateur SET ${updates.join(', ')} WHERE id = @id`).run(params);
  }

  // Mise à jour des sections (si fournies)
  if (sections !== undefined) {
    const finalRole = role !== undefined ? role
      : db.prepare('SELECT role FROM utilisateur WHERE id = ?').get(req.params.id)?.role;
    if (finalRole === 'coordination') setSections(req.params.id, sections);
    else setSections(req.params.id, []); // si plus coordination, on purge les sections
  } else if (role !== undefined && role !== 'coordination') {
    setSections(req.params.id, []); // changement de rôle hors coordination → purge
  }

  if (!updates.length && sections === undefined) return res.status(400).json({ error: 'Rien à modifier' });
  res.json({ ok: true });
});

// Supprimer un compte échouait sur une contrainte de clé étrangère : les
// attributions et leur historique conservent qui les a créées, modifiées et
// validées. La base a raison de refuser — effacer l'utilisateur détruirait la
// traçabilité de décisions qui engagent l'établissement.
//
// On DÉSACTIVE donc : le compte ne peut plus se connecter, ses sections sont
// retirées, mais son nom reste lisible dans l'historique. La suppression n'est
// possible que pour un compte qui n'a jamais rien signé.
r.delete('/:id', authRequired, roleRequired('admin'), (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) {
    return res.status(400).json({ error: 'Impossible de supprimer son propre compte' });
  }
  const u = db.prepare('SELECT * FROM utilisateur WHERE id = ?').get(id);
  if (!u) return res.status(404).json({ error: 'compte introuvable' });

  const traces = (() => {
    let n = 0;
    for (const [table, colonnes] of [
      ['attribution', ['created_by', 'updated_by', 'valide_par']],
      ['modification_log', ['utilisateur_id']],
    ]) {
      for (const col of colonnes) {
        try {
          n += db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE ${col} = ?`).get(id).n;
        } catch { /* table ou colonne absente */ }
      }
    }
    return n;
  })();

  db.prepare('DELETE FROM utilisateur_section WHERE utilisateur_id = ?').run(id);

  if (traces > 0) {
    db.prepare("UPDATE utilisateur SET actif = 0 WHERE id = ?").run(id);
    return res.json({
      ok: true, desactive: true, traces,
      message: `Ce compte a signé ${traces} enregistrement(s) : il est désactivé plutôt `
             + `que supprimé, pour que l'historique reste lisible. Il ne peut plus se connecter.`,
    });
  }

  try {
    db.prepare('DELETE FROM utilisateur WHERE id = ?').run(id);
    res.json({ ok: true, supprime: true });
  } catch (e) {
    db.prepare("UPDATE utilisateur SET actif = 0 WHERE id = ?").run(id);
    res.json({
      ok: true, desactive: true,
      message: "Ce compte est référencé ailleurs : il a été désactivé plutôt que supprimé.",
    });
  }
});

// ─── Permissions granulaires ─────────────────────────────────────────────────

// GET /:id/permissions — retourne toutes les permissions d'un utilisateur
r.get('/:id/permissions', authRequired, roleRequired('admin'), (req, res) => {
  const perms = db.prepare(
    'SELECT * FROM utilisateur_permission WHERE utilisateur_id = ? ORDER BY ressource_type, ressource_id'
  ).all(req.params.id);
  res.json(perms);
});

// PUT /:id/permissions — remplace toutes les permissions
r.put('/:id/permissions', authRequired, roleRequired('admin'), (req, res) => {
  const { permissions } = req.body; // [{ ressource_type, ressource_id, niveau }]
  if (!Array.isArray(permissions)) return res.status(400).json({ error: 'Format invalide' });
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM utilisateur_permission WHERE utilisateur_id = ?').run(req.params.id);
    const ins = db.prepare(
      'INSERT INTO utilisateur_permission (utilisateur_id, ressource_type, ressource_id, niveau) VALUES (?, ?, ?, ?)'
    );
    for (const p of permissions) {
      if (p.ressource_type && p.ressource_id && p.niveau) {
        ins.run(req.params.id, p.ressource_type, p.ressource_id, p.niveau);
      }
    }
  });
  tx();
  res.json({ ok: true });
});

// Également retourner les permissions dans GET /:id
r.get('/:id', authRequired, roleRequired('admin'), (req, res) => {
  const u = db.prepare('SELECT id, email, nom_complet, role, actif, professeur_id, acces_recrutement FROM utilisateur WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Utilisateur introuvable' });
  u.sections     = sectionsOf(u.id);
  u.permissions  = db.prepare('SELECT * FROM utilisateur_permission WHERE utilisateur_id = ? ORDER BY ressource_type, ressource_id').all(u.id);
  res.json(u);
});

export default r;
