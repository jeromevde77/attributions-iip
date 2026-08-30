// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Stages et activités professionnelles de formation
// (RDE, titre XIII, art. 50 à 56 ; décret du 16 avril 1991, art. 46 et 72 § 3)
//
// Deux objets distincts, qu'il serait tentant de confondre :
//
//   LE LIEU — l'établissement d'accueil, avec son adresse. Il vit d'une année
//   sur l'autre et sert à plusieurs étudiants. C'est lui qui figure au
//   supplément au diplôme, d'où l'exigence sur l'adresse complète.
//
//   LE STAGE — la période effectuée par un étudiant dans ce lieu, pour une UE
//   donnée, avec son maître de stage, ses dates et son évaluation.
//
// Les articles 51 et 52 commandent la structure : rien ne commence sans
// autorisation écrite ET convention signée. Le module suit donc ces deux jalons
// séparément, et refuse de considérer un stage comme démarré tant que les deux
// ne sont pas posés.
//
// L'article 55 ajoute des pièces dont l'absence est bloquante : le casier
// judiciaire modèle 2 avant le premier dixième, sous peine d'exclusion de l'UE.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired, getUserSections } from '../middleware/auth.js';

const r = Router();

const ECRITURE = ['admin', 'directeur', 'directeur_adjoint', 'editeur',
                  'secretariat', 'coordination'];

export function migrerStages(dbx) {
  try {
    dbx.exec(`
    -- Le lieu d'accueil. Son adresse figure au supplément au diplôme : elle
    -- doit donc être complète et stable, non ressaisie à chaque convention.
    CREATE TABLE IF NOT EXISTS stage_lieu (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      nom             TEXT NOT NULL,
      service         TEXT,                 -- service ou département d'accueil
      adresse         TEXT,
      cp              TEXT,
      localite        TEXT,
      pays            TEXT DEFAULT 'Belgique',
      secteur         TEXT,                 -- hôpital, cabinet, école, entreprise…
      num_entreprise  TEXT,
      site_web        TEXT,
      contact_nom     TEXT,
      contact_fonction TEXT,
      contact_tel     TEXT,
      contact_email   TEXT,
      agrement        TEXT,                 -- numéro ou référence d'agrément
      remarques       TEXT,
      actif           INTEGER NOT NULL DEFAULT 1,
      cree_par        TEXT,
      cree_le         TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_stage_lieu_nom ON stage_lieu(nom);

    -- Le stage d'un étudiant : une période, un lieu, une UE.
    CREATE TABLE IF NOT EXISTS stage (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      etudiant_id       INTEGER NOT NULL,
      annee_scolaire    TEXT NOT NULL,
      ue_num            INTEGER,
      section           TEXT,
      lieu_id           INTEGER REFERENCES stage_lieu(id),
      -- Encadrement
      maitre_stage      TEXT,               -- le tuteur désigné par l'entreprise
      maitre_fonction   TEXT,
      maitre_email      TEXT,
      maitre_tel        TEXT,
      professeur_id     INTEGER,            -- le professeur de stage, côté IIP
      -- Période
      date_debut        TEXT,
      date_fin          TEXT,
      heures_prevues    REAL,
      heures_effectuees REAL,
      fractionne        INTEGER NOT NULL DEFAULT 0,
      -- Les deux jalons de l'article 51 : sans eux, rien ne commence
      autorisation_le   TEXT,
      convention_le     TEXT,
      convention_ref    TEXT,
      -- Pièces exigées par l'article 55
      casier_le         TEXT,               -- extrait modèle 2, moins de six mois
      medecine_le       TEXT,
      vaccination_ok    INTEGER,
      -- Suivi
      statut            TEXT NOT NULL DEFAULT 'prevu',
        -- prevu | autorise | en_cours | termine | rompu | annule
      evaluation_tuteur TEXT,
      note_tuteur       REAL,
      remarques         TEXT,
      cree_par          TEXT,
      maj_le            TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_stage_etudiant ON stage(etudiant_id, annee_scolaire);
    CREATE INDEX IF NOT EXISTS idx_stage_lieu ON stage(lieu_id);
    `);
    console.log('[migration] stages : lieux et périodes');
  } catch (e) { console.error('[migration] stages :', e.message); }
}

const perimetre = req => getUserSections(req.user);

// ── Lieux de stage ──────────────────────────────────────────────────────────
r.get('/lieux', authRequired, (req, res) => {
  const q = (req.query.q || '').trim();
  const params = [];
  let sql = 'SELECT * FROM stage_lieu WHERE actif = 1';
  if (q) {
    sql += ' AND (nom LIKE ? OR localite LIKE ? OR secteur LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  sql += ' ORDER BY nom';
  const lieux = db.prepare(sql).all(...params);

  // Combien d'étudiants y sont passés : un lieu très fréquenté se distingue
  // d'un lieu ponctuel, et cela guide le choix.
  for (const l of lieux) {
    l.nb_stages = db.prepare('SELECT COUNT(*) n FROM stage WHERE lieu_id = ?').get(l.id).n;
  }
  res.json(lieux);
});

r.post('/lieux', authRequired, roleRequired(...ECRITURE), (req, res) => {
  const l = req.body || {};
  if (!l.nom) return res.status(400).json({ error: 'nom requis' });
  const champs = ['nom', 'service', 'adresse', 'cp', 'localite', 'pays', 'secteur',
                  'num_entreprise', 'site_web', 'contact_nom', 'contact_fonction',
                  'contact_tel', 'contact_email', 'agrement', 'remarques'];
  const info = db.prepare(`
    INSERT INTO stage_lieu (${champs.join(',')}, cree_par)
    VALUES (${champs.map(() => '?').join(',')}, ?)
  `).run(...champs.map(k => l[k] ?? null), req.user?.email || null);
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
});

r.put('/lieux/:id', authRequired, roleRequired(...ECRITURE), (req, res) => {
  const l = req.body || {};
  const champs = ['nom', 'service', 'adresse', 'cp', 'localite', 'pays', 'secteur',
                  'num_entreprise', 'site_web', 'contact_nom', 'contact_fonction',
                  'contact_tel', 'contact_email', 'agrement', 'remarques', 'actif'];
  const presents = champs.filter(k => k in l);
  if (!presents.length) return res.json({ ok: true, inchange: true });
  db.prepare(`UPDATE stage_lieu SET ${presents.map(k => `${k} = ?`).join(', ')} WHERE id = ?`)
    .run(...presents.map(k => l[k] ?? null), Number(req.params.id));
  res.json({ ok: true });
});

r.delete('/lieux/:id', authRequired, roleRequired(...ECRITURE), (req, res) => {
  const n = db.prepare('SELECT COUNT(*) n FROM stage WHERE lieu_id = ?').get(Number(req.params.id)).n;
  if (n) {
    // Un lieu qui a accueilli des étudiants figure dans leurs suppléments au
    // diplôme : l'effacer romprait la référence. On le désactive.
    db.prepare('UPDATE stage_lieu SET actif = 0 WHERE id = ?').run(Number(req.params.id));
    return res.json({
      ok: true, desactive: true,
      message: `Ce lieu a accueilli ${n} stage(s) : il est retiré de la liste sans être `
             + `supprimé, pour que les dossiers déjà constitués restent lisibles.`,
    });
  }
  db.prepare('DELETE FROM stage_lieu WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true, supprime: true });
});

// ── Stages d'un étudiant ────────────────────────────────────────────────────
r.get('/etudiant/:id', authRequired, (req, res) => {
  const etudId = Number(req.params.id);
  const stages = db.prepare(`
    SELECT s.*, l.nom AS lieu_nom, l.adresse, l.cp, l.localite, l.pays, l.secteur,
           (SELECT ue_nom FROM ue u WHERE u.ue_num = s.ue_num
             ORDER BY u.annee_scolaire DESC LIMIT 1) AS ue_nom,
           (SELECT nom || ' ' || COALESCE(prenom,'') FROM professeur p WHERE p.id = s.professeur_id) AS professeur
    FROM stage s
    LEFT JOIN stage_lieu l ON l.id = s.lieu_id
    WHERE s.etudiant_id = ?
    ORDER BY s.annee_scolaire DESC, s.date_debut
  `).all(etudId);

  // Ce qui manque avant que le stage puisse commencer (art. 51 et 55)
  for (const s of stages) {
    s.blocages = [];
    if (!s.autorisation_le) s.blocages.push("autorisation écrite du professeur de stage");
    if (!s.convention_le) s.blocages.push("convention signée");
    if (s.casier_le) {
      const six = new Date(s.casier_le + 'T00:00:00Z');
      six.setUTCMonth(six.getUTCMonth() + 6);
      if (s.date_debut && new Date(s.date_debut + 'T00:00:00Z') > six) {
        s.blocages.push("extrait de casier judiciaire de plus de six mois au début du stage");
      }
    }
    s.pret = s.blocages.length === 0;
  }

  res.json({ stages });
});

r.post('/', authRequired, roleRequired(...ECRITURE), (req, res) => {
  const s = req.body || {};
  if (!s.etudiant_id || !s.annee_scolaire) {
    return res.status(400).json({ error: 'etudiant_id et annee_scolaire requis' });
  }
  const perim = perimetre(req);
  if (perim && s.section && !perim.includes(s.section)) {
    return res.status(403).json({ error: 'Section hors de votre périmètre' });
  }
  const champs = ['etudiant_id', 'annee_scolaire', 'ue_num', 'section', 'lieu_id',
                  'maitre_stage', 'maitre_fonction', 'maitre_email', 'maitre_tel',
                  'professeur_id', 'date_debut', 'date_fin', 'heures_prevues',
                  'statut', 'remarques'];
  const info = db.prepare(`
    INSERT INTO stage (${champs.join(',')}, cree_par)
    VALUES (${champs.map(() => '?').join(',')}, ?)
  `).run(...champs.map(k => s[k] ?? null), req.user?.email || null);
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
});

r.put('/:id', authRequired, roleRequired(...ECRITURE), (req, res) => {
  const s = req.body || {};
  const champs = ['ue_num', 'section', 'lieu_id', 'maitre_stage', 'maitre_fonction',
                  'maitre_email', 'maitre_tel', 'professeur_id', 'date_debut', 'date_fin',
                  'heures_prevues', 'heures_effectuees', 'fractionne', 'autorisation_le',
                  'convention_le', 'convention_ref', 'casier_le', 'medecine_le',
                  'vaccination_ok', 'statut', 'evaluation_tuteur', 'note_tuteur', 'remarques'];
  const presents = champs.filter(k => k in s);
  if (!presents.length) return res.json({ ok: true, inchange: true });

  db.prepare(`
    UPDATE stage SET ${presents.map(k => `${k} = ?`).join(', ')}, maj_le = datetime('now')
    WHERE id = ?
  `).run(...presents.map(k => s[k] ?? null), Number(req.params.id));

  // Rappel plutôt qu'interdiction : c'est le professeur de stage qui juge.
  const apres = db.prepare('SELECT * FROM stage WHERE id = ?').get(Number(req.params.id));
  let rappel = null;
  if (['en_cours', 'termine'].includes(apres.statut)
      && (!apres.autorisation_le || !apres.convention_le)) {
    rappel = "Aucun stage ne peut débuter sans autorisation écrite du professeur de stage "
           + "ni convention signée (art. 51). Le non-respect entraîne l'annulation du stage.";
  }
  res.json({ ok: true, rappel });
});

r.delete('/:id', authRequired, roleRequired(...ECRITURE), (req, res) => {
  db.prepare('DELETE FROM stage WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ── Vue d'ensemble, pour la coordination de stage ───────────────────────────
r.get('/', authRequired, (req, res) => {
  const annee = req.query.annee;
  const section = req.query.section;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const perim = perimetre(req);
  if (section && perim && !perim.includes(section)) {
    return res.status(403).json({ error: 'Section hors de votre périmètre' });
  }

  const clauses = ['s.annee_scolaire = ?'];
  const params = [annee];
  if (section) { clauses.push('s.section = ?'); params.push(section); }
  else if (perim) {
    clauses.push(`s.section IN (${perim.map(() => '?').join(',') || "''"})`);
    params.push(...perim);
  }

  const stages = db.prepare(`
    SELECT s.*, e.nom AS etud_nom, e.prenom AS etud_prenom, e.id_ecampus,
           l.nom AS lieu_nom, l.localite, l.secteur,
           (SELECT ue_nom FROM ue u WHERE u.ue_num = s.ue_num
             ORDER BY u.annee_scolaire DESC LIMIT 1) AS ue_nom
    FROM stage s
    JOIN etudiant e ON e.id = s.etudiant_id
    LEFT JOIN stage_lieu l ON l.id = s.lieu_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY s.section, e.nom, s.date_debut
  `).all(...params);

  const manquants = stages.filter(s => !s.autorisation_le || !s.convention_le).length;
  res.json({
    annee, stages,
    synthese: {
      total: stages.length,
      sans_lieu: stages.filter(s => !s.lieu_id).length,
      sans_convention: manquants,
      en_cours: stages.filter(s => s.statut === 'en_cours').length,
      termines: stages.filter(s => s.statut === 'termine').length,
    },
  });
});

export default r;
