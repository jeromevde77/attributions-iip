import { Router } from 'express';
import { readFileSync, createReadStream } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';

const r = Router();
const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Fil d'activité : nouveautés depuis la dernière visite de l'utilisateur ───
// Renvoie les modifications (create/update/delete) postérieures au repère
// derniere_visite_activite de l'utilisateur courant, + leur nombre.
r.get('/activite', authRequired, (req, res) => {
  const { annee, limit = 100 } = req.query;
  const u = db.prepare('SELECT derniere_visite_activite FROM utilisateur WHERE id = ?').get(req.user.id);
  const depuis = u?.derniere_visite_activite || null;

  const where = [];
  const params = [];
  if (annee) { where.push("json_extract(s.snapshot, '$.annee_scolaire') = ?"); params.push(annee); }
  if (depuis) { where.push("s.created_at > ?"); params.push(depuis); }

  const rows = db.prepare(`
    SELECT s.id, s.attribution_id, s.action, s.utilisateur_nom, s.created_at,
           json_extract(s.snapshot, '$.section')        AS section,
           json_extract(s.snapshot, '$.ue_num')         AS ue_num,
           json_extract(s.snapshot, '$.nom_cours')      AS nom_cours,
           json_extract(s.snapshot, '$.annee_scolaire') AS annee_scolaire
    FROM attribution_snapshot s
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY s.created_at DESC
    LIMIT ?
  `).all(...params, Number(limit));

  res.json({ depuis, count: rows.length, items: rows });
});

// Acquitter le fil : avance le repère de dernière visite à maintenant.
r.post('/activite/vu', authRequired, (req, res) => {
  db.prepare("UPDATE utilisateur SET derniere_visite_activite = datetime('now') WHERE id = ?").run(req.user.id);
  res.json({ ok: true });
});

// ─── Paramètre activation ────────────────────────────────────────────────────

// Lire l'état actuel de l'historique
r.get('/config', authRequired, (req, res) => {
  const row = db.prepare(`SELECT valeur_num FROM parametre_financier WHERE cle = 'HISTORIQUE_ACTIF'`).get();
  res.json({ actif: Number(row?.valeur_num ?? 0) === 1 });
});

// Activer / désactiver
r.post('/config', authRequired, roleRequired('admin'), (req, res) => {
  const { actif } = req.body;
  db.prepare(`UPDATE parametre_financier SET valeur_num = ?, valeur_txt = ? WHERE cle = 'HISTORIQUE_ACTIF'`)
    .run(actif ? 1 : 0, actif ? 'true' : 'false');
  res.json({ ok: true, actif: !!actif });
});

// ─── Lecture historique ───────────────────────────────────────────────────────

// Historique global (50 derniers)
r.get('/', authRequired, (req, res) => {
  const { annee, limit = 100 } = req.query;
  const rows = db.prepare(`
    SELECT s.id, s.attribution_id, s.action, s.utilisateur_nom, s.created_at,
           json_extract(s.snapshot, '$.section')       AS section,
           json_extract(s.snapshot, '$.ue_num')        AS ue_num,
           json_extract(s.snapshot, '$.nom_cours')     AS nom_cours,
           json_extract(s.snapshot, '$.annee_scolaire') AS annee_scolaire
    FROM attribution_snapshot s
    ${annee ? "WHERE json_extract(s.snapshot, '$.annee_scolaire') = ?" : ''}
    ORDER BY s.created_at DESC
    LIMIT ?
  `).all(...(annee ? [annee, Number(limit)] : [Number(limit)]));
  res.json(rows);
});

// Historique d'une attribution spécifique
r.get('/attribution/:id', authRequired, (req, res) => {
  const rows = db.prepare(`
    SELECT id, attribution_id, action, snapshot, utilisateur_nom, created_at
    FROM attribution_snapshot
    WHERE attribution_id = ?
    ORDER BY created_at DESC
  `).all(req.params.id);
  res.json(rows.map(r => ({ ...r, snapshot: JSON.parse(r.snapshot) })));
});

// ─── Rollback ─────────────────────────────────────────────────────────────────

// Restaurer un snapshot (admin seulement)
r.post('/rollback/:snapshotId', authRequired, roleRequired('admin'), (req, res) => {
  const snap = db.prepare('SELECT * FROM attribution_snapshot WHERE id = ?').get(req.params.snapshotId);
  if (!snap) return res.status(404).json({ error: 'Snapshot introuvable' });

  const data = JSON.parse(snap.snapshot);
  if (data._deleted) return res.status(400).json({ error: 'Impossible de restaurer une attribution supprimée' });

  const allowed = [
    'section','etablissement_referent','contrat_mdp','organisation','ue_num',
    'num_organisation','quadrimestre_attribue','code_cours','type_cours',
    'type_cours_helb','code','nb_groupes','split_groupe','num_split','num_groupe',
    'activite_id','professeur_id','cours_ept_ad','coordination_encadrement',
    'modification_attribution','commentaire','commentaire_2',
    'per_etudiant_total_dp','periodes_attribuees','autonomie_attribuee','annee_scolaire'
  ];

  const sets = allowed.map(k => `${k} = @${k}`).join(', ');
  const params = { id: snap.attribution_id };
  for (const k of allowed) params[k] = data[k] ?? null;

  const existing = db.prepare('SELECT id FROM attribution WHERE id = ?').get(snap.attribution_id);
  if (!existing) return res.status(404).json({ error: 'Attribution introuvable (peut-être supprimée)' });

  db.prepare(`UPDATE attribution SET ${sets} WHERE id = @id`).run(params);

  // Logger le rollback lui-même
  db.prepare(`
    INSERT INTO attribution_snapshot (attribution_id, action, snapshot, utilisateur_id, utilisateur_nom)
    VALUES (?, 'rollback', ?, ?, ?)
  `).run(snap.attribution_id, JSON.stringify(data), req.user.id, req.user.nom || req.user.email);

  res.json({ ok: true, restored: snap.attribution_id });
});

// ─── Backup SQLite ────────────────────────────────────────────────────────────

r.get('/backup', authRequired, roleRequired('admin'), (req, res) => {
  try {
    const dbPath = resolve(__dirname, '../../data/attributions.db');
    const buf = readFileSync(dbPath);
    const filename = `attributions-backup-${new Date().toISOString().slice(0,19).replace(/[T:]/g,'-')}.db`;
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: 'Impossible de lire la base : ' + e.message });
  }
});

r.post('/backup-drive', authRequired, roleRequired('admin'), (req, res) => {
  // Pour l'upload Drive automatique depuis le serveur Synology, il faut configurer
  // un compte de service Google (service account) avec les credentials dans un fichier JSON.
  // Sans credentials configurés, on retourne une erreur explicite.
  const credPath = resolve(__dirname, '../../data/google-service-account.json');
  try {
    readFileSync(credPath); // vérifie l'existence
  } catch {
    return res.status(501).json({
      error: 'Google Drive non configuré. Déposez un fichier google-service-account.json dans /app/data/ pour activer cette fonctionnalité. Utilisez le téléchargement direct en attendant.'
    });
  }
  // TODO: implémenter l'upload Drive si un service account est configuré
  res.status(501).json({ error: 'Upload Drive : implémentation avec service account à venir.' });
});

// ─── Changelog (généré depuis Git au build) ───
r.get('/changelog', authRequired, (req, res) => {
  const tsvPath = resolve(__dirname, '../../git-changelog.tsv');
  try {
    const raw = readFileSync(tsvPath, 'utf8');
    const commits = raw.split('\n').filter(Boolean).map(line => {
      const [hash, date, ...rest] = line.split('\t');
      const subject = rest.join('\t');
      return { hash: hash.slice(0, 7), date, subject };
    });

    // Regrouper par jour
    const byDay = {};
    for (const c of commits) {
      const day = (c.date || '').slice(0, 10);
      (byDay[day] ||= []).push(c);
    }

    res.json({ commits, byDay });
  } catch {
    res.json({ commits: [], byDay: {}, error: 'Changelog Git non disponible (build sans historique)' });
  }
});

export default r;
