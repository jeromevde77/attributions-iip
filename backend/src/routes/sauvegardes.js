// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Sauvegardes de la base
//
// SQLite écrit en mode WAL : copier le fichier vivant donne une base amputée
// des dernières écritures, voire corrompue. On passe donc par un point de
// contrôle puis par l'API de sauvegarde, seule à produire un fichier cohérent
// sous charge.
//
// Chaque copie est CONTRÔLÉE dans la foulée — intégrité et décompte des lignes
// principales. Une sauvegarde qu'on n'a jamais ouverte n'est pas une
// sauvegarde : c'est le jour où l'on en a besoin qu'on découvre qu'elle est
// illisible.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';

const r = Router();

const DOSSIER = process.env.BACKUP_DIR || '/app/data/backups';
const CHEMIN_BASE = process.env.DB_PATH || '/app/data/attributions.db';

// Tables dont le décompte trahit une anomalie : un effondrement soudain se
// voit immédiatement en comparant deux sauvegardes.
const TABLES_TEMOINS = ['attribution', 'professeur', 'etudiant', 'etudiant_inscription', 'ue'];

export function migrerSauvegardes(dbx) {
  try {
    dbx.exec(`
    CREATE TABLE IF NOT EXISTS sauvegarde (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      fichier      TEXT NOT NULL,
      taille       INTEGER,
      declencheur  TEXT NOT NULL DEFAULT 'manuel',   -- manuel | planifiee | deploiement
      integrite    TEXT,                             -- ok, ou le message d'erreur
      comptes      TEXT,                             -- décompte des tables témoins, en JSON
      duree_ms     INTEGER,
      erreur       TEXT,
      auteur       TEXT,
      cree_le      TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sauvegarde_config (
      cle    TEXT PRIMARY KEY,
      valeur TEXT
    );
    `);

    const defauts = {
      active: '1',
      heure: '02:30',            // heure de la sauvegarde nocturne
      garder_quotidiennes: '7',
      garder_hebdomadaires: '4',
      garder_mensuelles: '12',
    };
    const up = dbx.prepare('INSERT OR IGNORE INTO sauvegarde_config (cle, valeur) VALUES (?,?)');
    for (const [k, v] of Object.entries(defauts)) up.run(k, v);

    if (!fs.existsSync(DOSSIER)) fs.mkdirSync(DOSSIER, { recursive: true });
    console.log('[migration] Sauvegardes : table et dossier prêts');
  } catch (e) { console.error('[migration] sauvegardes :', e.message); }
}

function config() {
  const rows = db.prepare('SELECT cle, valeur FROM sauvegarde_config').all();
  const c = Object.fromEntries(rows.map(x => [x.cle, x.valeur]));
  return {
    active: c.active !== '0',
    heure: c.heure || '02:30',
    garder_quotidiennes: Number(c.garder_quotidiennes ?? 7),
    garder_hebdomadaires: Number(c.garder_hebdomadaires ?? 4),
    garder_mensuelles: Number(c.garder_mensuelles ?? 12),
  };
}

const horodatage = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/(\d{8})(\d{4})/, '$1_$2');

/**
 * Produit une sauvegarde cohérente, la contrôle, puis l'enregistre.
 * @param {string} declencheur  manuel | planifiee | deploiement
 */
export async function executerSauvegarde(declencheur = 'manuel', auteur = null) {
  const debut = Date.now();
  const nom = `attributions_${horodatage()}.db`;
  const cible = path.join(DOSSIER, nom);

  try {
    if (!fs.existsSync(DOSSIER)) fs.mkdirSync(DOSSIER, { recursive: true });

    // Point de contrôle : les écritures en attente rejoignent le fichier
    // principal avant la copie.
    db.pragma('wal_checkpoint(TRUNCATE)');
    await db.backup(cible);

    const taille = fs.statSync(cible).size;

    // Contrôle sur la COPIE, jamais sur l'original
    let integrite = 'inconnue';
    const comptes = {};
    const copie = new Database(cible, { readonly: true });
    try {
      integrite = copie.pragma('integrity_check', { simple: true });
      for (const t of TABLES_TEMOINS) {
        try { comptes[t] = copie.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n; }
        catch { comptes[t] = null; }
      }
    } finally { copie.close(); }

    const info = db.prepare(`
      INSERT INTO sauvegarde (fichier, taille, declencheur, integrite, comptes, duree_ms, auteur)
      VALUES (?,?,?,?,?,?,?)
    `).run(nom, taille, declencheur, integrite, JSON.stringify(comptes),
           Date.now() - debut, auteur);

    purger();
    return { ok: true, id: Number(info.lastInsertRowid), fichier: nom, taille, integrite, comptes };
  } catch (e) {
    db.prepare(`
      INSERT INTO sauvegarde (fichier, declencheur, erreur, duree_ms, auteur)
      VALUES (?,?,?,?,?)
    `).run(nom, declencheur, e.message, Date.now() - debut, auteur);
    try { if (fs.existsSync(cible)) fs.unlinkSync(cible); } catch {}
    return { ok: false, erreur: e.message };
  }
}

/**
 * Rétention en cascade : les quotidiennes récentes, puis une par semaine, puis
 * une par mois. Une erreur découverte le lendemain et une erreur découverte au
 * moment de la vérification comptable n'appellent pas la même profondeur.
 */
function purger() {
  const c = config();
  const toutes = db.prepare(
    "SELECT id, fichier, cree_le FROM sauvegarde WHERE erreur IS NULL ORDER BY cree_le DESC"
  ).all();

  const garder = new Set();
  const vues = { semaine: new Set(), mois: new Set() };
  let quotidiennes = 0;

  for (const s of toutes) {
    const d = new Date(s.cree_le.replace(' ', 'T') + 'Z');
    if (quotidiennes < c.garder_quotidiennes) { garder.add(s.id); quotidiennes++; continue; }

    const sem = `${d.getUTCFullYear()}-S${Math.floor(d.getUTCDate() / 7)}-${d.getUTCMonth()}`;
    if (vues.semaine.size < c.garder_hebdomadaires && !vues.semaine.has(sem)) {
      vues.semaine.add(sem); garder.add(s.id); continue;
    }
    const mois = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    if (vues.mois.size < c.garder_mensuelles && !vues.mois.has(mois)) {
      vues.mois.add(mois); garder.add(s.id); continue;
    }
  }

  for (const s of toutes) {
    if (garder.has(s.id)) continue;
    try { fs.unlinkSync(path.join(DOSSIER, s.fichier)); } catch {}
    db.prepare('DELETE FROM sauvegarde WHERE id = ?').run(s.id);
  }
}

// ── Planification ───────────────────────────────────────────────────────────
// Un réveil au quart d'heure suffit : inutile d'embarquer un ordonnanceur pour
// une tâche quotidienne, et le redémarrage du conteneur ne perd rien.
let derniereJournee = null;

export function demarrerPlanificateur() {
  const verifier = async () => {
    try {
      const c = config();
      if (!c.active) return;
      const now = new Date();
      const jour = now.toISOString().slice(0, 10);
      if (derniereJournee === jour) return;

      const [h, m] = (c.heure || '02:30').split(':').map(Number);
      const minutesMaintenant = now.getHours() * 60 + now.getMinutes();
      if (minutesMaintenant < h * 60 + m) return;

      // Une seule sauvegarde planifiée par jour, même après un redémarrage
      const dejaFaite = db.prepare(`
        SELECT COUNT(*) n FROM sauvegarde
        WHERE declencheur = 'planifiee' AND date(cree_le) = date('now')
      `).get().n;
      derniereJournee = jour;
      if (dejaFaite) return;

      const res = await executerSauvegarde('planifiee', 'planificateur');
      console.log('[sauvegarde] planifiée —', res.ok ? res.fichier : 'ÉCHEC : ' + res.erreur);
    } catch (e) { console.error('[sauvegarde] planificateur :', e.message); }
  };
  setTimeout(verifier, 30_000);
  setInterval(verifier, 15 * 60_000);
}

// ── Consultation ────────────────────────────────────────────────────────────
r.get('/', authRequired, (req, res) => {
  const liste = db.prepare('SELECT * FROM sauvegarde ORDER BY cree_le DESC LIMIT 60').all()
    .map(s => ({ ...s, comptes: s.comptes ? JSON.parse(s.comptes) : null }));

  const derniere = liste.find(s => !s.erreur);
  const heures = derniere
    ? (Date.now() - new Date(derniere.cree_le.replace(' ', 'T') + 'Z').getTime()) / 3_600_000
    : null;

  let espace = null;
  try {
    espace = fs.readdirSync(DOSSIER)
      .filter(f => f.endsWith('.db'))
      .reduce((s, f) => s + fs.statSync(path.join(DOSSIER, f)).size, 0);
  } catch { /* dossier absent */ }

  res.json({
    config: config(),
    sauvegardes: liste,
    dossier: DOSSIER,
    espace_total: espace,
    alerte: !derniere ? "Aucune sauvegarde n'a encore abouti."
      : heures > 26 ? `La dernière sauvegarde remonte à ${Math.round(heures)} heures.`
      : derniere.integrite && derniere.integrite !== 'ok'
        ? "Le dernier contrôle d'intégrité a échoué."
        : null,
  });
});

r.post('/executer', authRequired, roleRequired('admin'), async (req, res) => {
  const resultat = await executerSauvegarde('manuel', req.user?.email || null);
  if (!resultat.ok) return res.status(500).json(resultat);
  res.json(resultat);
});

r.get('/:id/telecharger', authRequired, roleRequired('admin'), (req, res) => {
  const s = db.prepare('SELECT * FROM sauvegarde WHERE id = ?').get(Number(req.params.id));
  if (!s || s.erreur) return res.status(404).json({ error: 'sauvegarde introuvable' });
  const chemin = path.join(DOSSIER, s.fichier);
  if (!fs.existsSync(chemin)) return res.status(404).json({ error: 'fichier absent du disque' });
  res.download(chemin, s.fichier);
});

r.delete('/:id', authRequired, roleRequired('admin'), (req, res) => {
  const s = db.prepare('SELECT * FROM sauvegarde WHERE id = ?').get(Number(req.params.id));
  if (!s) return res.status(404).json({ error: 'sauvegarde introuvable' });
  try { fs.unlinkSync(path.join(DOSSIER, s.fichier)); } catch {}
  db.prepare('DELETE FROM sauvegarde WHERE id = ?').run(s.id);
  res.json({ ok: true });
});

r.put('/config', authRequired, roleRequired('admin'), (req, res) => {
  const up = db.prepare(`
    INSERT INTO sauvegarde_config (cle, valeur) VALUES (?,?)
    ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur
  `);
  const permis = ['active', 'heure', 'garder_quotidiennes', 'garder_hebdomadaires', 'garder_mensuelles'];
  for (const [k, v] of Object.entries(req.body || {})) {
    if (!permis.includes(k)) continue;
    up.run(k, k === 'active' ? (v ? '1' : '0') : String(v));
  }
  res.json({ ok: true, config: config() });
});

export default r;
