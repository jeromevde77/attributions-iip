import { Router } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const r = Router();

/**
 * Réimporter depuis Excel (Attributions.xlsm + BD_UE_COURS.xlsx).
 * ATTENTION : remplace UE/cours/AA/professeurs et ré-ajoute les attributions.
 * Stratégie : on lance le script import-from-excel.js en sous-processus.
 */
r.post('/reimport-excel', authRequired, roleRequired('admin'), (req, res) => {
  const scriptPath = path.join(__dirname, '../../scripts/import-from-excel.js');
  const proc = spawn('node', [scriptPath], {
    cwd: path.join(__dirname, '../..'),
    env: process.env
  });

  let stdout = '';
  let stderr = '';
  proc.stdout.on('data', d => { stdout += d.toString(); });
  proc.stderr.on('data', d => { stderr += d.toString(); });

  proc.on('close', code => {
    if (code === 0) {
      res.json({ ok: true, log: stdout });
    } else {
      res.status(500).json({ ok: false, code, log: stdout, error: stderr });
    }
  });
});

/**
 * Statistiques globales (utile en plus du dashboard).
 */
r.get('/stats', authRequired, roleRequired('admin'), (req, res) => {
  const stats = {
    attributions: db.prepare('SELECT COUNT(*) AS n FROM attribution').get().n,
    professeurs:  db.prepare('SELECT COUNT(*) AS n FROM professeur').get().n,
    ue:           db.prepare('SELECT COUNT(*) AS n FROM ue').get().n,
    cours:        db.prepare('SELECT COUNT(*) AS n FROM cours').get().n,
    planning:     db.prepare('SELECT COUNT(*) AS n FROM planning_hebdo').get().n
  };
  res.json(stats);
});

/**
 * Purger toutes les données d'une année scolaire.
 * Supprime : attributions, organisations, UE, cours, ue_section, EA12.
 * Nécessite confirmation explicite.
 */
r.delete('/purge-annee/:annee', authRequired, roleRequired('admin'), (req, res) => {
  const annee = req.params.annee;
  const { confirmation } = req.body || {};
  if (confirmation !== `PURGER-${annee}`) {
    return res.status(400).json({ error: `Confirmation invalide. Envoyez { "confirmation": "PURGER-${annee}" }` });
  }
  const purge = db.transaction(() => {
    const tables = ['attribution', 'organisation', 'ue_section', 'cours', 'ue', 'ea12'];
    const counts = {};
    for (const t of tables) {
      try {
        const r = db.prepare(`DELETE FROM ${t} WHERE annee_scolaire = ?`).run(annee);
        counts[t] = r.changes;
      } catch(e) { counts[t] = `erreur: ${e.message}`; }
    }
    return counts;
  });
  const result = purge();
  console.log(`[admin] Purge année ${annee} :`, result);
  res.json({ ok: true, annee, supprime: result });
});

export default r;
