// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Profils d'accès
//
// Un profil est un MODÈLE, non un héritage : on l'applique, il remplit les
// cases, et l'on retouche ensuite librement. Ce qui est coché sur une fiche est
// donc toujours ce qui s'applique — sans quoi un droit pourrait changer sans
// que personne n'ait touché à la fiche.
//
// La fiche signale la dérive et permet de réappliquer le profil.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';
import { MODULES } from '../middleware/permissions.js';

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
             'communication', 'listes', 'pilotage'], true)],
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

r.put('/:id', authRequired, roleRequired('admin'), (req, res) => {
  const p = db.prepare('SELECT * FROM profil_acces WHERE id = ?').get(Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'profil introuvable' });
  const { nom, role, description, permissions } = req.body || {};
  db.prepare(`
    UPDATE profil_acces SET nom = ?, role = ?, description = ?, permissions_json = ?,
      maj_le = datetime('now') WHERE id = ?
  `).run(nom || p.nom, role || p.role, description ?? p.description,
         JSON.stringify(permissions || {}), p.id);
  res.json({ ok: true, avertissement: p.systeme
    ? "Ce profil de référence est modifié : les fiches déjà établies ne changent pas, "
    + "il faudra le réappliquer là où c'est voulu." : null });
});

r.delete('/:id', authRequired, roleRequired('admin'), (req, res) => {
  const p = db.prepare('SELECT * FROM profil_acces WHERE id = ?').get(Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'profil introuvable' });
  if (p.systeme) return res.status(400).json({ error: 'Un profil de référence ne se supprime pas' });
  db.prepare('DELETE FROM profil_acces WHERE id = ?').run(p.id);
  res.json({ ok: true });
});

export default r;
