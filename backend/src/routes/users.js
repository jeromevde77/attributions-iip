import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';
import { envoyerEmail, templateNotif } from '../services/mailer.js';
import { creerJeton, comptePeutMotDePasse, VALIDITE_MINUTES } from '../lib/motDePasse.js';
import { journaliser } from './mfa.js';
import { rolesConnus } from '../middleware/permissions.js';

const r = Router();

// La liste des rôles vient du SYSTÈME DE PERMISSIONS, elle n'est plus recopiée
// ici : cette copie n'en connaissait que quatre sur huit, et refusait
// « Rôle invalide » pour directeur, directeur_adjoint, secretariat et
// professeur, pourtant définis et utilisés partout ailleurs.

// Helper : récupère les sections d'un utilisateur
function sectionsOf(userId) {
  return db.prepare('SELECT section_code FROM utilisateur_section WHERE utilisateur_id = ?')
    .all(userId).map(r => r.section_code);
}

/**
 * SEULE LA COORDINATION SE CLOISONNE — les autres rôles voient tout
 * l'Institut : le secrétariat y travaille, la direction l'administre.
 *
 * La purge existait déjà (changer de rôle vide le périmètre, à juste titre),
 * mais depuis que l'absence de rattachement vaut « aucun accès », purger sans
 * rien dire d'autre fabrique un compte AVEUGLE : on passe quelqu'un de
 * coordination à secrétariat, et il ne voit plus rien, sans que personne
 * n'ait voulu le lui retirer. La purge pose donc le drapeau « toutes ».
 */
function ouvrirTout(userId) {
  db.prepare('DELETE FROM utilisateur_section WHERE utilisateur_id = ?').run(userId);
  db.prepare('UPDATE utilisateur SET perimetre_toutes = 1 WHERE id = ?').run(userId);
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
           acces_recrutement, permissions_json, mfa_actif, methode_auth, perimetre_toutes
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
  if (!rolesConnus().codes.includes(role)) return res.status(400).json({ error: 'Rôle invalide' });
  try {
    // Si un compte existe déjà avec cet email, le lier au prof plutôt que créer
    const existing = db.prepare('SELECT id FROM utilisateur WHERE email = ?').get(email);
    if (existing) {
      if (professeur_id) {
        db.prepare('UPDATE utilisateur SET professeur_id = ?, role = ?, actif = 1 WHERE id = ?')
          .run(professeur_id, roleNorm, existing.id);
        if (Array.isArray(sections) && sections.length) setSections(existing.id, sections);
        else ouvrirTout(existing.id);   // rien de demandé : ouvert, jamais aveugle
      }
      return res.status(200).json({ id: existing.id, linked: true });
    }
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(`
      INSERT INTO utilisateur (email, password_hash, nom_complet, role, actif, professeur_id)
      VALUES (?, ?, ?, ?, 1, ?)
    `).run(email, hash, nom_complet || email, role, professeur_id || null);
    if (Array.isArray(sections) && sections.length) setSections(result.lastInsertRowid, sections);
    else ouvrirTout(result.lastInsertRowid);   // rien de demandé : ouvert, jamais aveugle
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'Email déjà utilisé' });
    throw e;
  }
});

/*
 * LA DIRECTION ENVOIE UN LIEN, ELLE NE CHOISIT PLUS LE MOT DE PASSE.
 *
 * Le bouton « MDP » ouvrait un `prompt()` : on tapait un mot de passe pour
 * quelqu'un d'autre, en clair à l'écran, et on le lui communiquait ensuite —
 * donc on le connaissait. Un mot de passe qu'un tiers connaît n'en est plus
 * un, et c'est ce que la réinitialisation en libre-service corrige.
 *
 * Accessoirement, `prompt()` ne s'affiche pas toujours : le navigateur le
 * supprime dès qu'une page en a montré plusieurs, et le bouton devenait
 * silencieux — un bouton qui ne fait rien, sans rien dire.
 *
 * LE LIEN EST RENDU EN CLAIR À L'APPELANT quand le courriel ne part pas. Ce
 * n'est pas une faiblesse : il expire en une heure, ne sert qu'une fois, et ne
 * CONNECTE PAS — le second facteur reste exigé. Sans ce repli, un relais mal
 * configuré laisserait la direction sans aucun moyen de rendre un accès.
 */
r.post('/:id/lien-mot-de-passe', authRequired, roleRequired('admin'), async (req, res) => {
  const u = db.prepare('SELECT * FROM utilisateur WHERE id = ?').get(Number(req.params.id));
  if (!u) return res.status(404).json({ error: 'Compte introuvable' });
  if (!comptePeutMotDePasse(u)) {
    return res.status(400).json({
      error: u.actif ? "Ce compte ne s'authentifie pas par mot de passe."
                     : 'Ce compte est désactivé : réactivez-le d\u2019abord.',
    });
  }

  const jeton = creerJeton(u.id, req.ip || null);
  const base = process.env.LUCIE_URL || 'https://www.lucie-iip.be';
  const lien = `${base}/mot-de-passe?jeton=${encodeURIComponent(jeton)}`;

  let envoi = null;
  try {
    envoi = await envoyerEmail({
      to: u.email,
      subject: 'Lucie — réinitialiser votre mot de passe',
      html: templateNotif({
        titre: 'Réinitialiser votre mot de passe',
        corps: `<p>${req.user.nom || req.user.email} vous invite à choisir un nouveau mot de `
             + `passe pour votre compte Lucie (<strong>${u.email}</strong>).</p>`
             + `<p>Ce lien est valable <strong>${VALIDITE_MINUTES} minutes</strong> et ne sert `
             + `qu'une fois. Il vous permet de choisir un mot de passe ; il ne vous connecte pas.</p>`,
        lien: `/mot-de-passe?jeton=${encodeURIComponent(jeton)}`,
        lienTexte: 'Choisir un mot de passe',
      }),
    });
  } catch (e) { envoi = { ok: false, simule: false, erreur: e.message }; }

  // La leçon de 2.12.73 : `envoye` se lit du RÉSULTAT. Dire « envoyé » quand
  // rien n'est parti laisse la personne attendre un courriel qui n'existe pas.
  const parti = !!envoi?.ok && !envoi?.simule;
  journaliser({ utilisateur_id: u.id, acteur: req.user,
    evenement: parti ? 'mot_de_passe_lien_envoye' : 'mot_de_passe_lien_non_envoye',
    detail: parti ? null : (envoi?.erreur || 'aucun serveur de courriel') });

  res.json({
    ok: true, email: u.email, envoye: parti, minutes: VALIDITE_MINUTES,
    raison: parti ? null : (envoi?.erreur || "aucun serveur de courriel n'est configuré"),
    // Transmis seulement si le courriel n'est PAS parti : sinon le lien
    // n'aurait aucune raison de transiter par un second canal.
    lien: parti ? null : lien,
  });
});

r.patch('/:id', authRequired, roleRequired('admin'), (req, res) => {
  const { nom_complet, role, actif, password, sections, professeur_id, acces,
          permissions_json, acces_recrutement, perimetre_toutes } = req.body || {};
  const updates = [];
  const params = { id: req.params.id };
  if (nom_complet !== undefined) { updates.push('nom_complet = @nom_complet'); params.nom_complet = nom_complet; }
  if (professeur_id !== undefined) { updates.push('professeur_id = @professeur_id'); params.professeur_id = professeur_id || null; }
  if (role !== undefined) {
    const roleNorm = role;
    if (!rolesConnus().codes.includes(roleNorm)) return res.status(400).json({ error: 'Rôle invalide' });
    updates.push('role = @role'); params.role = roleNorm;
  }
  if (actif !== undefined) { updates.push('actif = @actif'); params.actif = actif ? 1 : 0; }
  // « Toutes les sections », explicitement — y compris celles à venir. C'est la
  // seule façon de distinguer « tout » de « pas encore rempli », que l'absence
  // de lignes confondait.
  if (perimetre_toutes !== undefined) {
    updates.push('perimetre_toutes = @perimetre_toutes');
    params.perimetre_toutes = perimetre_toutes ? 1 : 0;
  }
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
    // LE PÉRIMÈTRE NE DÉPEND PLUS DU RÔLE, et il ne l'a jamais vraiment dû.
    //
    // Les sections n'étaient posées que pour une coordination ; pour tout autre
    // rôle elles étaient PURGÉES sans un mot. La fiche envoyait pourtant un
    // périmètre en toutes lettres — son propre commentaire disait « un
    // secrétariat de section, cela existe » —, et le serveur le jetait. On
    // cochait des sections, on enregistrait, l'écran confirmait, et rien
    // n'était gardé.
    //
    // `getUserSections` n'a jamais regardé le rôle, sauf pour la direction.
    // C'était donc la seule porte qui refusait ce que tout le reste acceptait.
    {
      setSections(req.params.id, sections);
      // NOMMER DES SECTIONS VEUT DIRE « PAS TOUTES ». Sans cela, un compte qui
      // portait le drapeau continuerait de tout voir malgré la liste qu'on
      // vient de lui poser — l'écran dirait « TIM » et la personne lirait
      // l'Institut. Un réglage qui ne règle rien est pire que pas de réglage.
      // Le drapeau passé dans la même requête reste prioritaire : c'est un
      // choix explicite, la déduction ne vaut que par défaut.
      if (perimetre_toutes === undefined && Array.isArray(sections) && sections.length) {
        db.prepare('UPDATE utilisateur SET perimetre_toutes = 0 WHERE id = ?').run(req.params.id);
      }
    }
  }
  // CHANGER DE RÔLE NE TOUCHE PLUS AU PÉRIMÈTRE. La purge se justifiait tant
  // que seule une coordination pouvait être cloisonnée ; elle effacerait
  // maintenant un réglage que personne n'a demandé de défaire — et, le défaut
  // étant fermé, elle l'effacerait dans le sens dangereux une fois sur deux.

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
