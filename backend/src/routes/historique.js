import { Router } from 'express';
import express from 'express';
import { readFileSync, createReadStream, writeFileSync, copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';

const r = Router();
const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Fil d'activité : modifications des 7 derniers jours ───
// Renvoie les modifications (create/update/delete) des 7 derniers jours,
// avec pour chacune l'état 'traitée' (cochée) par l'utilisateur courant.
r.get('/activite', authRequired, (req, res) => {
  const { annee, jours = 7, limit = 200 } = req.query;

  const where = ["s.created_at >= datetime('now', ?)"];
  const params = [`-${Number(jours)} days`];
  if (annee) { where.push("json_extract(s.snapshot, '$.annee_scolaire') = ?"); params.push(annee); }

  const rows = db.prepare(`
    SELECT s.id, s.attribution_id, s.action, s.utilisateur_nom, s.created_at,
           json_extract(s.snapshot, '$.section')        AS section,
           json_extract(s.snapshot, '$.ue_num')         AS ue_num,
           json_extract(s.snapshot, '$.nom_cours')      AS nom_cours,
           json_extract(s.snapshot, '$.annee_scolaire') AS annee_scolaire,
           CASE WHEN t.snapshot_id IS NOT NULL THEN 1 ELSE 0 END AS traitee
    FROM attribution_snapshot s
    LEFT JOIN activite_traitee t
      ON t.snapshot_id = s.id AND t.utilisateur_id = ?
    WHERE ${where.join(' AND ')}
    ORDER BY s.created_at DESC
    LIMIT ?
  `).all(req.user.id, ...params, Number(limit));

  const nonTraitees = rows.filter(r => !r.traitee).length;
  res.json({ jours: Number(jours), count: rows.length, non_traitees: nonTraitees, items: rows });
});

// Cocher / décocher une modification comme traitée (par l'utilisateur courant)
r.post('/activite/:snapshotId/traitee', authRequired, (req, res) => {
  const sid = Number(req.params.snapshotId);
  const traitee = req.body?.traitee !== false; // par défaut true
  if (traitee) {
    db.prepare(`INSERT OR IGNORE INTO activite_traitee (snapshot_id, utilisateur_id) VALUES (?, ?)`)
      .run(sid, req.user.id);
  } else {
    db.prepare(`DELETE FROM activite_traitee WHERE snapshot_id = ? AND utilisateur_id = ?`)
      .run(sid, req.user.id);
  }
  res.json({ ok: true, snapshot_id: sid, traitee });
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

// ─── Restauration SQLite depuis un fichier de backup ──────────────────────────
// ⚠ Action destructive : écrase la base courante. Réservé aux admins.
// Reçoit le fichier .db en binaire brut (express.raw). Valide le fichier,
// sauvegarde l'état courant, puis remplace la base et redémarre le process
// (le conteneur Docker, en restart:unless-stopped, relit la nouvelle base).
r.post('/restore',
  authRequired,
  roleRequired('admin'),
  express.raw({ type: 'application/octet-stream', limit: '50mb' }),
  async (req, res) => {
    const buf = req.body;
    if (!buf || !buf.length) {
      return res.status(400).json({ error: 'Aucun fichier reçu.' });
    }
    // Vérif signature SQLite : les 16 premiers octets = "SQLite format 3\0"
    const header = buf.slice(0, 16).toString('utf8');
    if (!header.startsWith('SQLite format 3')) {
      return res.status(400).json({ error: 'Le fichier n\u2019est pas une base SQLite valide.' });
    }

    const dataDir = resolve(__dirname, '../../data');
    const dbPath = resolve(dataDir, 'attributions.db');
    const tmpPath = resolve(dataDir, `restore-tmp-${Date.now()}.db`);

    try {
      // 1. Écrire le fichier reçu dans un temporaire
      writeFileSync(tmpPath, buf);

      // 2. Valider avec better-sqlite3 si disponible : integrity_check + tables clés
      let nbAttr = null;
      try {
        const BetterSqlite3 = (await import('better-sqlite3')).default;
        const test = new BetterSqlite3(tmpPath, { readonly: true });
        try {
          const integ = test.pragma('integrity_check', { simple: true });
          if (integ !== 'ok') {
            return res.status(400).json({ error: 'Base corrompue (integrity_check: ' + integ + ').' });
          }
          const tables = test.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
          const requises = ['attribution', 'ue', 'cours', 'section', 'professeur'];
          const manquantes = requises.filter(t => !tables.includes(t));
          if (manquantes.length) {
            return res.status(400).json({ error: 'Tables manquantes : ' + manquantes.join(', ') + '. Ce n\u2019est pas une base Lucie valide.' });
          }
          nbAttr = test.prepare('SELECT COUNT(*) AS n FROM attribution').get().n;
        } finally {
          test.close();
        }
      } catch (valErr) {
        // better-sqlite3 indisponible → on se contente de la signature SQLite déjà vérifiée
        if (!/Cannot find|ERR_|MODULE/.test(String(valErr.message))) {
          // Erreur de validation réelle (corruption, etc.)
          return res.status(400).json({ error: 'Validation échouée : ' + valErr.message });
        }
      }

      // 3. Backup auto de l'état courant (avant écrasement)
      const backupsDir = resolve(dataDir, 'backups-auto');
      if (!existsSync(backupsDir)) mkdirSync(backupsDir, { recursive: true });
      const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
      const autoBackup = resolve(backupsDir, `avant-restore-${ts}.db`);
      try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch { /* ignore */ }
      copyFileSync(dbPath, autoBackup);

      // 4. Remplacer la base courante par le fichier restauré
      copyFileSync(tmpPath, dbPath);
      // Supprimer d'éventuels WAL/SHM résiduels pour éviter l'incohérence
      for (const suff of ['-wal', '-shm']) {
        const f = dbPath + suff;
        try { if (existsSync(f)) rmSync(f); } catch { /* ignore */ }
      }

      // 5. GARDE-FOU : vérifier que la base restaurée s'ouvre et est lisible.
      //    Si elle plante, on RESTAURE le backup auto et on NE redémarre PAS dans un état cassé.
      let verifOk = true, verifErr = null;
      try {
        const BetterSqlite3 = (await import('better-sqlite3')).default;
        const check = new BetterSqlite3(dbPath, { readonly: true });
        try {
          // lecture réelle d'une table clé
          check.prepare('SELECT COUNT(*) AS n FROM attribution').get();
          check.prepare('SELECT COUNT(*) AS n FROM section').get();
        } finally {
          check.close();
        }
        // Nettoyer les WAL/SHM créés par cette vérification
        for (const suff of ['-wal', '-shm']) {
          const f = dbPath + suff;
          try { if (existsSync(f)) rmSync(f); } catch { /* ignore */ }
        }
      } catch (e) {
        // better-sqlite3 absent → on ne peut pas vérifier, on fait confiance à la signature SQLite
        if (/Cannot find|ERR_|MODULE/.test(String(e.message))) {
          verifOk = true;
        } else {
          verifOk = false;
          verifErr = e.message;
        }
      }

      if (!verifOk) {
        // ROLLBACK : remettre le backup auto, ne pas redémarrer
        try {
          copyFileSync(autoBackup, dbPath);
          for (const suff of ['-wal', '-shm']) {
            const f = dbPath + suff;
            try { if (existsSync(f)) rmSync(f); } catch { /* ignore */ }
          }
        } catch (rbErr) {
          return res.status(500).json({
            error: `Base restaurée ILLISIBLE (${verifErr}). ÉCHEC du rollback automatique (${rbErr.message}). ` +
                   `Restaurez manuellement sur le NAS : cp backups-auto/avant-restore-${ts}.db attributions.db`,
            backup_auto: `avant-restore-${ts}.db`,
            rollback: 'ÉCHEC',
          });
        }
        return res.status(400).json({
          error: `La base restaurée est illisible (${verifErr}). Restauration annulée, l'ancienne base a été remise en place. Le serveur n'a pas redémarré.`,
          backup_auto: `avant-restore-${ts}.db`,
          rollback: 'OK',
        });
      }

      // 6. Répondre AVANT de redémarrer
      res.json({
        ok: true,
        attributions: nbAttr,
        backup_auto: `avant-restore-${ts}.db`,
        message: 'Base restaurée et vérifiée. Le serveur redémarre pour recharger les données…'
      });

      // 7. Redémarrer le process (conteneur Docker restart:unless-stopped → relit la base)
      setTimeout(() => process.exit(0), 500);
    } catch (e) {
      return res.status(500).json({ error: 'Échec de la restauration : ' + e.message });
    } finally {
      try { if (existsSync(tmpPath)) rmSync(tmpPath); } catch { /* ignore */ }
    }
  }
);

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
