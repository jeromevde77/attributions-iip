import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import db from './db/index.js';
import authRoutes from './routes/auth.js';
import attrRoutes from './routes/attributions.js';
import refRoutes  from './routes/referentiels.js';
import pilotRoutes from './routes/pilotage.js';
import exportRoutes from './routes/exports.js';
import planningRoutes from './routes/planning.js';
import usersRoutes from './routes/users.js';
import adminRoutes from './routes/admin.js';
import anneesRoutes from './routes/annees.js';
import historiqueRoutes from './routes/historique.js';
import etablissementRoutes from './routes/etablissement.js';
import ea12Routes from './routes/ea12.js';
import templateRoutes   from './routes/templates.js';
import contratsRoutes   from './routes/contrats.js';
import proceduresRoutes from './routes/procedures.js';
import planificationRoutes from './routes/planification.js';
import parametresRoutes    from './routes/parametres.js';
import prerequisRoutes     from './routes/prerequis.js';
import planifIARoutes      from './routes/planification-ia.js';
import locauxRoutes        from './routes/locaux.js';
import nominationsRoutes   from './routes/nominations.js';
import sequenceRoutes      from './routes/sequence.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Migrations légères : CREATE TABLE IF NOT EXISTS + ADD COLUMN si absent.
// Ces opérations sont idempotentes — peuvent être exécutées à chaque démarrage.
// ---------------------------------------------------------------------------
try {
  // 0. Supprimer les vues d'abord — elles dépendent de ue/cours et empêcheraient
  //    un DROP TABLE lors des migrations de clés composites. Elles sont recréées plus bas.
  db.exec(`
    DROP VIEW IF EXISTS v_attribution_complete;
    DROP VIEW IF EXISTS v_professeur_total;
    DROP VIEW IF EXISTS v_cours_conformite;
  `);

  // 1. Créer la table activite_type si elle n'existe pas
  db.exec(`
    CREATE TABLE IF NOT EXISTS activite_type (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      libelle        TEXT NOT NULL,
      ordre          INTEGER DEFAULT 0,
      section        TEXT,              -- NULL = global, sinon spécifique à une section
      ue_num         INTEGER,           -- NULL = toute section, sinon spécifique à un cours
      annee_scolaire TEXT               -- NULL = toutes années
    );
  `);
  const count = db.prepare('SELECT COUNT(*) AS n FROM activite_type').get().n;
  if (count === 0) {
    db.exec(`
      INSERT INTO activite_type (id, libelle, ordre) VALUES
        (1, 'Théorie',                    1),
        (2, 'Exercices',                  2),
        (3, 'Travaux pratiques (TP)',      3),
        (4, 'Laboratoire',                4),
        (5, 'Stage',                      5),
        (6, 'Séminaire',                  6),
        (7, 'TFE',                        7),
        (8, 'Remédiation',                8),
        (9, 'Visite des copies',          9),
        (10,'Cours hybride asynchrone',   10),
        (11,'Cours hybride synchrone',    11),
        (12,'Clinique',                   12),
        (13,'Atelier',                    13),
        (14,'Simulation',                 14);
    `);
    console.log('[migration] Table activite_type initialisée');
  }

  // Migration : ajouter section/ue_num/annee_scolaire à activite_type si absents
  const _colsAT = db.prepare('PRAGMA table_info(activite_type)').all().map(c => c.name);
  if (!_colsAT.includes('section')) {
    db.exec(`ALTER TABLE activite_type ADD COLUMN section TEXT`);
    console.log('[migration] activite_type.section ajouté');
  }
  if (!_colsAT.includes('ue_num')) {
    db.exec(`ALTER TABLE activite_type ADD COLUMN ue_num INTEGER`);
    console.log('[migration] activite_type.ue_num ajouté');
  }
  if (!_colsAT.includes('annee_scolaire')) {
    db.exec(`ALTER TABLE activite_type ADD COLUMN annee_scolaire TEXT`);
    console.log('[migration] activite_type.annee_scolaire ajouté');
  }
  if (!_colsAT.includes('type_etp')) {
    db.exec(`ALTER TABLE activite_type ADD COLUMN type_etp TEXT`);
    console.log('[migration] activite_type.type_etp ajouté');
  }

  // Ajouter les nouvelles activités globales si absentes (pour installations existantes)
  const _activitesGlobales = [
    [8,  'Remédiation',              8],
    [9,  'Visite des copies',        9],
    [10, 'Cours hybride asynchrone', 10],
    [11, 'Cours hybride synchrone',  11],
    [12, 'Clinique',                 12],
    [13, 'Atelier',                  13],
    [14, 'Simulation',               14],
  ];
  const _insAct = db.prepare('INSERT OR IGNORE INTO activite_type (id, libelle, ordre) VALUES (?,?,?)');
  for (const a of _activitesGlobales) _insAct.run(...a);

  // 2. Ajouter la colonne attribution.activite_id si elle n'existe pas
  const cols = db.prepare("PRAGMA table_info(attribution)").all();
  if (!cols.find(c => c.name === 'activite_id')) {
    db.exec(`ALTER TABLE attribution ADD COLUMN activite_id INTEGER REFERENCES activite_type(id);`);
    console.log('[migration] Colonne attribution.activite_id ajoutée');
  }
  // Code titre RTF (Régime des Titres et Fonctions) par attribution, pour l'EA12.
  // Valeurs officielles (circ. 9589) : TR/TS/TPL/TPNL/ATS/ATP (nouveau régime)
  // et R/A/3B/Art.20 (ancien régime, dont R utilisé dans le supérieur).
  if (!cols.find(c => c.name === 'titre_rtf')) {
    db.exec(`ALTER TABLE attribution ADD COLUMN titre_rtf TEXT;`);
    console.log('[migration] Colonne attribution.titre_rtf ajoutée');
  }

  // Refonte dossier pédagogique (DP) :
  // - cours.cours_autonomie : autonomie PROPOSÉE pour ce cours (part de 7.2 rattachée).
  //   La somme des cours_autonomie d'une UE ne peut dépasser ue.ue_aut (× dédoublement).
  // - cours.dedouble : 'O'/'N' — cours dédoublé (2 groupes) -> périodes ET autonomie ×2.
  // - ue.ue_per_z : périodes des activités Z (7.3, développement professionnel).
  //   Périodes ÉTUDIANT, sans enseignant, sans charge, sans coût.
  const colsCours = db.prepare("PRAGMA table_info(cours)").all();
  if (!colsCours.find(c => c.name === 'cours_autonomie')) {
    db.exec(`ALTER TABLE cours ADD COLUMN cours_autonomie INTEGER;`);
    console.log('[migration] Colonne cours.cours_autonomie ajoutée');
  }
  if (!colsCours.find(c => c.name === 'dedouble')) {
    db.exec(`ALTER TABLE cours ADD COLUMN dedouble TEXT DEFAULT 'N';`);
    console.log('[migration] Colonne cours.dedouble ajoutée');
  }
  if (!colsCours.find(c => c.name === 'per_etudiant')) {
    db.exec(`ALTER TABLE cours ADD COLUMN per_etudiant INTEGER;`);
    console.log('[migration] Colonne cours.per_etudiant ajoutée (périodes étudiant pour cours Z)');
  }
  if (!colsCours.find(c => c.name === 'is_stage')) {
    db.exec(`ALTER TABLE cours ADD COLUMN is_stage INTEGER DEFAULT 0;`);
    console.log('[migration] Colonne cours.is_stage ajoutée');
  }
  const colsUe = db.prepare("PRAGMA table_info(ue)").all();
  if (!colsUe.find(c => c.name === 'ue_per_z')) {
    db.exec(`ALTER TABLE ue ADD COLUMN ue_per_z INTEGER;`);
    console.log('[migration] Colonne ue.ue_per_z ajoutée');
  }

  // 3. Table annee_scolaire (gestion multi-années)
  db.exec(`
    CREATE TABLE IF NOT EXISTS annee_scolaire (
      code       TEXT PRIMARY KEY,          -- ex: '2025-2026'
      libelle    TEXT NOT NULL,             -- ex: 'Année 2025-2026'
      active     INTEGER DEFAULT 0,         -- 1 = année courante par défaut
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  const nbAnnees = db.prepare('SELECT COUNT(*) AS n FROM annee_scolaire').get().n;
  if (nbAnnees === 0) {
    db.exec(`INSERT INTO annee_scolaire (code, libelle, active) VALUES ('2025-2026', 'Année 2025-2026', 1);`);
    console.log('[migration] Année 2025-2026 créée comme année active');
  }

  // 4. Table attribution_snapshot (historique complet par snapshot JSON)
  db.exec(`
    CREATE TABLE IF NOT EXISTS attribution_snapshot (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      attribution_id  INTEGER NOT NULL,
      action          TEXT NOT NULL,
      snapshot        TEXT NOT NULL,
      utilisateur_id  INTEGER,
      utilisateur_nom TEXT,
      created_at      TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_snapshot_attr ON attribution_snapshot(attribution_id);
    CREATE INDEX IF NOT EXISTS idx_snapshot_date ON attribution_snapshot(created_at DESC);
  `);

  // 5. Paramètre HISTORIQUE_ACTIF (désactivé par défaut)
  db.exec(`
    INSERT OR IGNORE INTO parametre_financier (cle, valeur_num, valeur_txt, description)
    VALUES ('HISTORIQUE_ACTIF', 0, 'false', 'Activer la journalisation de l''historique des modifications');
  `);

  // 5b. Table utilisateur_section (périmètre des coordinations)
  db.exec(`
    CREATE TABLE IF NOT EXISTS utilisateur_section (
      utilisateur_id  INTEGER NOT NULL,
      section_code    TEXT NOT NULL,
      PRIMARY KEY (utilisateur_id, section_code)
    );
    CREATE INDEX IF NOT EXISTS idx_us_user ON utilisateur_section(utilisateur_id);
  `);

  // 5c. Lien compte ↔ professeur (panneau « Accès Lucie » depuis la fiche Membre du personnel)
  //     Pas de contrainte UNIQUE (interdit en ALTER ADD COLUMN sous SQLite) ; unicité gérée applicativement.
  try {
    const colsUtil = db.prepare(`PRAGMA table_info(utilisateur)`).all().map(c => c.name);
    if (!colsUtil.includes('professeur_id')) {
      db.exec(`ALTER TABLE utilisateur ADD COLUMN professeur_id INTEGER`);
    }
    db.exec(`CREATE INDEX IF NOT EXISTS idx_user_prof ON utilisateur(professeur_id)`);
  } catch (e) { console.error('[migration] professeur_id sur utilisateur:', e.message); }

  // Table des templates de documents (éditeur visuel)
  db.exec(`
    CREATE TABLE IF NOT EXISTS document_template (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      nom         TEXT NOT NULL,
      slug        TEXT UNIQUE,                    -- identifiant système (ex: 'pv-recours')
      description TEXT,
      contenu     TEXT NOT NULL DEFAULT '',  -- HTML du template avec {{champs}}
      entites     TEXT DEFAULT '[]',          -- JSON: entités nécessaires ["prof","etab"]
      cree_par    TEXT,
      cree_le     TEXT DEFAULT (datetime('now')),
      modifie_le  TEXT DEFAULT (datetime('now'))
    );
  `);

  // Migration : ajouter colonne slug si absente (PRAGMA table_info — fiable, pas de try/catch)
  const _colsTpl = db.prepare("PRAGMA table_info(document_template)").all();
  if (!_colsTpl.find(c => c.name === 'slug')) {
    db.exec(`ALTER TABLE document_template ADD COLUMN slug TEXT`);
    console.log('[migration] Colonne document_template.slug ajoutée');
  }
  if (!_colsTpl.find(c => c.name === 'format')) {
    db.exec(`ALTER TABLE document_template ADD COLUMN format TEXT DEFAULT 'A4P'`);
    console.log('[migration] Colonne document_template.format ajoutée (A4P par défaut)');
  }
  if (!_colsTpl.find(c => c.name === 'margins')) {
    db.exec(`ALTER TABLE document_template ADD COLUMN margins TEXT DEFAULT NULL`);
    console.log('[migration] Colonne document_template.margins ajoutée');
  }

  // Mettre à jour les slugs des templates existants sans slug
  const contratRow = db.prepare(`SELECT id FROM document_template WHERE nom = 'Contrat de travail CDD' AND slug IS NULL`).get();
  if (contratRow) db.prepare(`UPDATE document_template SET slug = 'contrat-cdd' WHERE id = ?`).run(contratRow.id);
  const sectionRow = db.prepare(`SELECT id FROM document_template WHERE nom = 'Synthèse de section' AND slug IS NULL`).get();
  if (sectionRow) db.prepare(`UPDATE document_template SET slug = 'synthese-section' WHERE id = ?`).run(sectionRow.id);


  // ── Prof "À DÉSIGNER" — placeholder pour les postes non pourvus ─────────────
  const aDesigner = db.prepare(`SELECT id FROM professeur WHERE nom = 'À DÉSIGNER' AND prenom = ''`).get();
  if (!aDesigner) {
    db.prepare(`INSERT INTO professeur (nom, prenom, type_personnel) VALUES ('À DÉSIGNER', '', 'enseignant')`).run();
    console.log('[migration] Prof "À DÉSIGNER" créé');
  }

  // ── Colonne type_personnel dans professeur (admin = non chargé de cours) ──
  try { db.exec(`ALTER TABLE professeur ADD COLUMN type_personnel TEXT DEFAULT 'enseignant'`); }
  catch { /* colonne déjà présente */ }

  // ── Table personnel_etablissement : lien prof → fonction dans l'IIP ────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS personnel_etablissement (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      professeur_id  INTEGER NOT NULL REFERENCES professeur(id) ON DELETE CASCADE,
      fonction       TEXT NOT NULL,
      ordre          INTEGER NOT NULL DEFAULT 99
    );
  `);

  // Seed : personnel de direction/secrétariat/coordination (si table vide)
  const nbPE = db.prepare('SELECT COUNT(*) AS n FROM personnel_etablissement').get().n;
  if (nbPE === 0) {
    const seedPersonnel = [
      ['SOHET',       'Charles',  'Directeur',           1],
      ['VANDECAUTER', 'Nicolas',  'Directeur adjoint',   2],
      ['AEVALIOTIS',  'Mati',     'Secrétaire',          3],
      ['DAELEMEN',    'Florian',  'Secrétaire',          4],
      ['LAMBERT',     'Marie',    'Coordinatrice',       5],
      ['BOULENGIER',  'Natacha',  'Coordinatrice',       6],
      ['ROUGUI',      'Loubna',   'Coordinatrice',       7],
    ];
    for (const [nom, prenom, fonction, ordre] of seedPersonnel) {
      // Trouver ou créer la fiche prof
      let row = db.prepare('SELECT id FROM professeur WHERE nom = ? AND prenom = ?').get(nom, prenom);
      if (!row) {
        const info = db.prepare(`INSERT INTO professeur (nom, prenom, type_personnel) VALUES (?, ?, 'admin')`).run(nom, prenom);
        row = { id: info.lastInsertRowid };
        console.log(`[migration] Prof admin créé : ${prenom} ${nom}`);
      } else {
        db.prepare(`UPDATE professeur SET type_personnel = 'admin' WHERE id = ?`).run(row.id);
      }
      db.prepare(`INSERT INTO personnel_etablissement (professeur_id, fonction, ordre) VALUES (?, ?, ?)`).run(row.id, fonction, ordre);
      console.log(`[migration] Fonction assignée : ${prenom} ${nom} → ${fonction}`);
    }
  }

  // ── Table personnel_section : rattachement des membres CDE à une ou plusieurs sections ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS personnel_section (
      personnel_etablissement_id  INTEGER NOT NULL REFERENCES personnel_etablissement(id) ON DELETE CASCADE,
      section_code                TEXT NOT NULL,
      PRIMARY KEY (personnel_etablissement_id, section_code)
    );
    CREATE INDEX IF NOT EXISTS idx_ps_pe ON personnel_section(personnel_etablissement_id);
    CREATE INDEX IF NOT EXISTS idx_ps_section ON personnel_section(section_code);
    CREATE TABLE IF NOT EXISTS personnel_mission (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      professeur_id INTEGER NOT NULL,
      fonction      TEXT NOT NULL,
      section_code  TEXT NOT NULL,
      annee_scolaire TEXT NOT NULL,
      UNIQUE(professeur_id, fonction, section_code, annee_scolaire)
    );
    CREATE INDEX IF NOT EXISTS idx_pm_prof ON personnel_mission(professeur_id);
    CREATE INDEX IF NOT EXISTS idx_pm_annee ON personnel_mission(annee_scolaire);
  `);

  // ── fonction_type : référentiel des fonctions (colonnes de la matrice missions) ──
  // Table interrogée par referentiels.js (GET professeur, /fonctions, /personnel-matrice)
  // mais jamais créée par migration (oubli de b21a34a). Présente en prod uniquement car
  // créée à la main → absente sur toute base fraîche (d'où "no such table: fonction_type"
  // en dev). On la (re)crée ici pour la garantir partout, puis on la seede.
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS fonction_type (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        libelle  TEXT NOT NULL,
        portee   TEXT NOT NULL DEFAULT 'section',   -- 'etablissement' | 'section'
        ordre    INTEGER NOT NULL DEFAULT 0
      );
    `);
    console.log('[migration] Table fonction_type initialisée');
  } catch (e) { console.error('[migration] fonction_type:', e.message); }

  // Seed dans un try/catch séparé (indépendant de la création) — uniquement si vide.
  // Contenu repris à l'identique de la table fonction_type de prod (libellé/portée/ordre).
  try {
    if (db.prepare('SELECT COUNT(*) AS n FROM fonction_type').get().n === 0) {
      const insFt = db.prepare('INSERT INTO fonction_type (libelle, portee, ordre) VALUES (?, ?, ?)');
      const seedFt = [
        ['Directeur',                'etablissement',  1],
        ['Directeur adjoint',        'etablissement',  2],
        ['Secrétaire',               'etablissement',  3],
        ['Coordinateur de cursus',   'section',       10],
        ['Coordinateur des stages',  'section',       11],
        ['Coordinateur de TFE',      'section',       12],
        ['Coordinateur pédagogique', 'section',       13],
        ['Conseiller qualité',       'section',       14],
      ];
      for (const [libelle, portee, ordre] of seedFt) insFt.run(libelle, portee, ordre);
      console.log('[migration] fonction_type seedée (' + seedFt.length + ' fonctions)');
    }
  } catch (e) { console.error('[migration] seed fonction_type:', e.message); }

  // Nettoyage : supprimer l'ancienne table membres_cde si elle existe
  try { db.exec(`DROP TABLE IF EXISTS membres_cde`); } catch { /* ignoré */ }

  // ── Tables de planification horaire ────────────────────────────────────────

  // Calendrier annuel : semaines typées (cours / ev1 / ev2 / vacances / stage / ferie)
  db.exec(`
    CREATE TABLE IF NOT EXISTS annee_calendrier (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      annee_scolaire  TEXT NOT NULL,
      semaine_num     INTEGER NOT NULL,         -- 1..n dans l'année scolaire
      date_debut      TEXT NOT NULL,            -- lundi ISO YYYY-MM-DD
      date_fin        TEXT NOT NULL,            -- vendredi ISO YYYY-MM-DD
      type            TEXT NOT NULL DEFAULT 'cours',
                                                -- 'cours'|'ev1'|'ev2'|'vacances'|'stage'|'ferie'
      label           TEXT,                     -- ex. "Vacances Noël", "EV1 S1"
      UNIQUE(annee_scolaire, semaine_num)
    );
    CREATE INDEX IF NOT EXISTS idx_cal_annee ON annee_calendrier(annee_scolaire);
  `);

  // Locaux : salles avec capacité et type (classe, auditoire, labo spécialisé...)
  db.exec(`
    CREATE TABLE IF NOT EXISTS local (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      nom          TEXT NOT NULL UNIQUE,         -- ex. "P4 214"
      type         TEXT,                         -- "Classe", "Auditoire", "Clinique de la vision"...
      places       INTEGER,                      -- capacité (NULL si non définie, ex. labos)
      equipements  TEXT,                         -- texte libre
      actif        INTEGER NOT NULL DEFAULT 1
    );
    -- Local de prédilection d'un cours (ex. cours 282.1 → P4 214 "Clinique de la vision")
    CREATE TABLE IF NOT EXISTS cours_local (
      cours_code      TEXT NOT NULL,
      annee_scolaire  TEXT NOT NULL,
      section         TEXT,
      local_id        INTEGER NOT NULL REFERENCES local(id) ON DELETE CASCADE,
      PRIMARY KEY (cours_code, annee_scolaire, section, local_id)
    );
  `);

  // Engagement à titre définitif : nominations d'un prof sur un DP (code FWB = clé unique)
  db.exec(`
    CREATE TABLE IF NOT EXISTS nomination_definitive (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      professeur_id   INTEGER NOT NULL REFERENCES professeur(id) ON DELETE CASCADE,
      code_fwb        TEXT NOT NULL,            -- code FWB du dossier pédagogique (clé métier) ou 'INCONNU'
      ue_num          INTEGER,                  -- UE de la nomination (NULL si UE absente de la base)
      cours_code      TEXT,                     -- cours nommé (peut être NULL si toute l'UE)
      cours_libre     TEXT,                     -- nom de cours saisi librement (UE absente de la base)
      periodes        REAL NOT NULL DEFAULT 0,  -- nombre de périodes définitives
      type_charge     TEXT,                     -- 'CT' | 'PP' | 'CG'
      actif           INTEGER NOT NULL DEFAULT 1,
      notes           TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_nom_prof ON nomination_definitive(professeur_id);
    CREATE INDEX IF NOT EXISTS idx_nom_fwb  ON nomination_definitive(code_fwb);

    -- Remise au travail : quand l'UE/DP nommé n'est plus organisé, le prof est réaffecté
    CREATE TABLE IF NOT EXISTS remise_travail (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      nomination_id     INTEGER REFERENCES nomination_definitive(id) ON DELETE SET NULL,
      professeur_id     INTEGER NOT NULL REFERENCES professeur(id) ON DELETE CASCADE,
      charge_perdue     REAL NOT NULL DEFAULT 0,  -- périodes perdues (charge à recaser)
      ue_num            INTEGER,                  -- UE de remise au travail
      cours_code        TEXT,                     -- cours de remise au travail
      periodes          REAL NOT NULL DEFAULT 0,  -- périodes attribuées en RT (doit être ≥ charge_perdue au total)
      annee_scolaire    TEXT,
      notes             TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_rt_prof ON remise_travail(professeur_id);
  `);

  // Statut de nomination du prof : temporaire / temporaire_prioritaire / definitif
  {
    const cols = db.prepare('PRAGMA table_info(professeur)').all();
    if (!cols.find(c => c.name === 'statut_nomination')) {
      db.exec(`ALTER TABLE professeur ADD COLUMN statut_nomination TEXT DEFAULT 'temporaire'`);
      console.log('[migration] professeur.statut_nomination ajouté');
    }
  }
  // Migration : gestion des congés/remplacements sur attribution
  {
    const cols = db.prepare('PRAGMA table_info(attribution)').all();
    if (!cols.find(c => c.name === 'en_conge')) {
      db.exec(`ALTER TABLE attribution ADD COLUMN en_conge INTEGER DEFAULT 0`);
      console.log('[migration] attribution.en_conge ajouté');
    }
    if (!cols.find(c => c.name === 'remplace_attribution_id')) {
      db.exec(`ALTER TABLE attribution ADD COLUMN remplace_attribution_id INTEGER`);
      console.log('[migration] attribution.remplace_attribution_id ajouté');
    }
    if (!cols.find(c => c.name === 'est_rt')) {
      db.exec(`ALTER TABLE attribution ADD COLUMN est_rt INTEGER DEFAULT 0`);
      console.log('[migration] attribution.est_rt ajouté');
    }
    if (!cols.find(c => c.name === 'rt_nomination_id')) {
      db.exec(`ALTER TABLE attribution ADD COLUMN rt_nomination_id INTEGER`);
      console.log('[migration] attribution.rt_nomination_id ajouté');
    }
  }
  // Migration HELB : statut HELB du prof + nature Cours/TP de l'activité
  {
    const pc = db.prepare('PRAGMA table_info(professeur)').all();
    if (!pc.find(c => c.name === 'statut_helb')) {
      db.exec(`ALTER TABLE professeur ADD COLUMN statut_helb TEXT`); // MA / MFP / PI / COORD
      console.log('[migration] professeur.statut_helb ajouté');
    }
    const ac = db.prepare('PRAGMA table_info(activite_type)').all();
    if (ac.length && !ac.find(c => c.name === 'helb_nature')) {
      db.exec(`ALTER TABLE activite_type ADD COLUMN helb_nature TEXT`); // 'COURS' | 'TP'
      console.log('[migration] activite_type.helb_nature ajouté');
    }
    const atc = db.prepare('PRAGMA table_info(attribution)').all();
    if (!atc.find(c => c.name === 'helb_nature')) {
      db.exec(`ALTER TABLE attribution ADD COLUMN helb_nature TEXT DEFAULT 'CT'`); // 'CT' | 'TP' (par ligne, contrat HELB)
      console.log('[migration] attribution.helb_nature ajouté');
    }
    // Effectifs étudiants par UE (par année académique)
    const uc = db.prepare('PRAGMA table_info(ue)').all();
    if (uc.length && !uc.find(c => c.name === 'nb_etudiants')) {
      db.exec(`ALTER TABLE ue ADD COLUMN nb_etudiants INTEGER`);
      console.log('[migration] ue.nb_etudiants ajouté');
    }
  }
  // Migration : cours_libre sur nomination_definitive (UE absente de la base)
  {
    const cols = db.prepare('PRAGMA table_info(nomination_definitive)').all();
    if (cols.length && !cols.find(c => c.name === 'cours_libre')) {
      db.exec(`ALTER TABLE nomination_definitive ADD COLUMN cours_libre TEXT`);
      console.log('[migration] nomination_definitive.cours_libre ajouté');
    }
  }

  // Groupes : subdivision d'une attribution par groupe d'étudiants
  db.exec(`
    CREATE TABLE IF NOT EXISTS groupe (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      annee_scolaire  TEXT NOT NULL,
      ue_num          INTEGER NOT NULL,
      section         TEXT,
      nom             TEXT NOT NULL,            -- "A", "B", "Groupe 1"…
      nb_etudiants    INTEGER DEFAULT 0,
      professeur_id   INTEGER REFERENCES professeur(id) ON DELETE SET NULL,
      heures_attribuees REAL DEFAULT 0,         -- total heures 60min attribuées pour ce groupe
      notes           TEXT,
      cree_le         TEXT DEFAULT (datetime('now')),
      modifie_le      TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_groupe_annee   ON groupe(annee_scolaire);
    CREATE INDEX IF NOT EXISTS idx_groupe_ue      ON groupe(ue_num);
    CREATE INDEX IF NOT EXISTS idx_groupe_section ON groupe(section);
  `);

  // Planification : heures placées par groupe × semaine
  db.exec(`
    CREATE TABLE IF NOT EXISTS planification (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      groupe_id       INTEGER NOT NULL REFERENCES groupe(id) ON DELETE CASCADE,
      semaine_id      INTEGER NOT NULL REFERENCES annee_calendrier(id) ON DELETE CASCADE,
      heures          REAL NOT NULL DEFAULT 0,  -- heures de 60 min planifiées cette semaine
      UNIQUE(groupe_id, semaine_id)
    );
    CREATE INDEX IF NOT EXISTS idx_plan_groupe   ON planification(groupe_id);
    CREATE INDEX IF NOT EXISTS idx_plan_semaine  ON planification(semaine_id);
  `);

  // Migration : colonne planification.heures TEXT (pour stocker EV1, EV2, VC)
  const _colsPlan = db.prepare('PRAGMA table_info(planification)').all();
  const _heuresCol = _colsPlan.find(c => c.name === 'heures');
  if (_heuresCol && _heuresCol.type !== 'TEXT') {
    db.exec(`
      CREATE TABLE IF NOT EXISTS planification_new (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        groupe_id  INTEGER NOT NULL REFERENCES groupe(id) ON DELETE CASCADE,
        semaine_id INTEGER NOT NULL REFERENCES annee_calendrier(id) ON DELETE CASCADE,
        valeur     TEXT NOT NULL DEFAULT '0',
        UNIQUE(groupe_id, semaine_id)
      );
      INSERT INTO planification_new (groupe_id, semaine_id, valeur)
        SELECT groupe_id, semaine_id, CAST(heures AS TEXT) FROM planification WHERE heures > 0;
      DROP TABLE planification;
      ALTER TABLE planification_new RENAME TO planification;
      CREATE INDEX IF NOT EXISTS idx_plan_groupe  ON planification(groupe_id);
      CREATE INDEX IF NOT EXISTS idx_plan_semaine ON planification(semaine_id);
    `);
    console.log('[migration] planification.heures → valeur TEXT');
  }
  // Ajouter colonne valeur si absente (cas table existante sans migration)
  if (!_colsPlan.find(c => c.name === 'valeur') && _colsPlan.find(c => c.name === 'heures')) {
    // déjà géré ci-dessus
  }
  const _calExist = db.prepare("SELECT COUNT(*) AS n FROM annee_calendrier WHERE annee_scolaire = '2025-2026'").get();
  if (_calExist.n === 0) {
    // Génération automatique des semaines du 01/09/2025 au 26/06/2026
    // Types pré-configurés selon le calendrier FWB 2025-2026
    const VACANCES_2526 = [
      // [date_debut_lundi, nb_semaines, type, label]
      ['2025-11-03', 1, 'vacances', 'Congé automne'],
      ['2025-12-22', 2, 'vacances', 'Vacances Noël'],
      ['2026-02-16', 1, 'vacances', 'Congé carnaval'],
      ['2026-04-06', 2, 'vacances', 'Vacances Pâques'],
      ['2026-05-25', 1, 'vacances', 'Congé Pentecôte'],
    ];
    const EV_2526 = [
      ['2026-01-05', 3, 'ev1', 'Évaluations 1re session'],
      ['2026-06-08', 3, 'ev2', 'Évaluations 2e session'],
    ];
    const FERIES_2526 = [
      ['2025-11-10', 'Armistice'],
      ['2026-01-01', 'Nouvel An'],  // tombe hors semaines scolaires
      ['2026-05-14', 'Ascension'],
    ];

    // Construire la map date_lundi → {type, label}
    const typeMap = new Map();
    for (const [dl, nb, type, label] of [...VACANCES_2526, ...EV_2526]) {
      for (let i = 0; i < nb; i++) {
        const d = new Date(dl + 'T12:00:00');
        d.setDate(d.getDate() + i * 7);
        typeMap.set(d.toISOString().slice(0, 10), { type, label });
      }
    }

    // Générer toutes les semaines
    const insertSem = db.prepare(`INSERT OR IGNORE INTO annee_calendrier (annee_scolaire, semaine_num, date_debut, date_fin, type, label) VALUES (?,?,?,?,?,?)`);
    const start = new Date('2025-09-01T12:00:00');
    // Avancer au lundi
    while (start.getDay() !== 1) start.setDate(start.getDate() + 1);
    const end = new Date('2026-06-30T12:00:00');
    let semNum = 1;
    const insertAll = db.transaction(() => {
      let cur = new Date(start);
      while (cur <= end) {
        const dl = cur.toISOString().slice(0, 10);
        const fin = new Date(cur); fin.setDate(fin.getDate() + 4);
        const df = fin.toISOString().slice(0, 10);
        const info = typeMap.get(dl) || { type: 'cours', label: null };
        insertSem.run('2025-2026', semNum++, dl, df, info.type, info.label);
        cur.setDate(cur.getDate() + 7);
      }
    });
    insertAll();
    console.log(`[seed] Calendrier 2025-2026 : ${semNum - 1} semaines générées`);
  }

  // Seed calendrier 2026-2027 si absent
  const _cal2627 = db.prepare("SELECT COUNT(*) AS n FROM annee_calendrier WHERE annee_scolaire = '2026-2027'").get();
  if (_cal2627.n === 0) {
    const VACANCES_2627 = [
      ['2026-11-02', 1, 'vacances', 'Congé automne'],
      ['2026-12-21', 2, 'vacances', 'Vacances Noël'],
      ['2027-02-15', 1, 'vacances', 'Congé carnaval'],
      ['2027-03-29', 2, 'vacances', 'Vacances Pâques'],
      ['2027-05-17', 1, 'vacances', 'Congé Pentecôte'],
    ];
    const EV_2627 = [
      ['2027-01-04', 3, 'ev1', 'Évaluations 1re session'],
      ['2027-06-07', 3, 'ev2', 'Évaluations 2e session'],
    ];
    const typeMap2 = new Map();
    for (const [dl, nb, type, label] of [...VACANCES_2627, ...EV_2627]) {
      for (let i = 0; i < nb; i++) {
        const d = new Date(dl + 'T12:00:00');
        d.setDate(d.getDate() + i * 7);
        typeMap2.set(d.toISOString().slice(0, 10), { type, label });
      }
    }
    const insertSem2 = db.prepare(`INSERT OR IGNORE INTO annee_calendrier (annee_scolaire, semaine_num, date_debut, date_fin, type, label) VALUES (?,?,?,?,?,?)`);
    const start2 = new Date('2026-09-01T12:00:00');
    while (start2.getDay() !== 1) start2.setDate(start2.getDate() + 1);
    const end2 = new Date('2027-06-30T12:00:00');
    let semNum2 = 1;
    const insertAll2 = db.transaction(() => {
      let cur = new Date(start2);
      while (cur <= end2) {
        const dl = cur.toISOString().slice(0, 10);
        const fin = new Date(cur); fin.setDate(fin.getDate() + 4);
        const df = fin.toISOString().slice(0, 10);
        const info = typeMap2.get(dl) || { type: 'cours', label: null };
        insertSem2.run('2026-2027', semNum2++, dl, df, info.type, info.label);
        cur.setDate(cur.getDate() + 7);
      }
    });
    insertAll2();
    console.log(`[seed] Calendrier 2026-2027 : ${semNum2 - 1} semaines générées`);
  }
  // Option B : chaque génération est CONSERVÉE et horodatée (traçabilité FWB).
  db.exec(`
    CREATE TABLE IF NOT EXISTS document_archive (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      type_doc        TEXT NOT NULL,          -- 'ea12' | 'fiche'
      professeur_id   INTEGER,
      prof_nom        TEXT,
      prof_prenom     TEXT,
      annee_scolaire  TEXT,
      nom_fichier     TEXT NOT NULL,
      pdf             BLOB NOT NULL,          -- le PDF archivé tel qu'émis
      taille          INTEGER,
      genere_par      TEXT,                   -- email/identifiant de l'utilisateur
      genere_le       TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_docarch_prof ON document_archive(professeur_id);
    CREATE INDEX IF NOT EXISTS idx_docarch_type ON document_archive(type_doc);
  `);

  // ── Table procedure_archive : trace de chaque PV généré ────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS procedure_archive (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      type            TEXT NOT NULL,          -- 'recours' | 'fraude'
      statut          TEXT NOT NULL DEFAULT 'en_cours',
                                              -- 'en_cours' | 'clos' | 'annule'
      etudiant        TEXT,
      ue_num          INTEGER,
      ue_nom          TEXT,
      section         TEXT,
      annee_scolaire  TEXT,
      verdict         TEXT,                   -- 'irrecevable'|'rejete'|'accueilli'|'ajourne'|'refus'
      date_faits      TEXT,                   -- date publi résultats (recours) ou date examen (fraude)
      date_seance_cde TEXT,
      payload_json    TEXT,                   -- données complètes pour re-génération
      cree_par        TEXT,
      cree_le         TEXT DEFAULT (datetime('now')),
      modifie_le      TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_proc_type    ON procedure_archive(type);
    CREATE INDEX IF NOT EXISTS idx_proc_annee   ON procedure_archive(annee_scolaire);
    CREATE INDEX IF NOT EXISTS idx_proc_etudiant ON procedure_archive(etudiant);
    CREATE INDEX IF NOT EXISTS idx_proc_statut  ON procedure_archive(statut);
  `);

  // ── Table parametre : configuration centralisée ─────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS parametre (
      cle     TEXT PRIMARY KEY,
      valeur  TEXT NOT NULL,
      label   TEXT,
      section TEXT,   -- NULL = global, sinon spécifique à une section
      groupe  TEXT    -- regroupement UI : 'planification'|'procedures'|'etablissement'
    );
  `);

  // Seed des paramètres par défaut (INSERT OR IGNORE = ne pas écraser les valeurs existantes)
  const _params = [
    // Planification
    ['planning.ev1_heures',              '2',                               'Heures comptées pour EV1',                             null, 'planification'],
    ['planning.ev2_heures',              '0',                               'Heures comptées pour EV2',                             null, 'planification'],
    ['planning.vc_heures',               '1',                               'Heures comptées pour VC (visite des copies)',           null, 'planification'],
    ['planning.periode_minutes',         '50',                              'Durée d\'une période (minutes)',                        null, 'planification'],
    ['planning.min_semaines_ev1_ev2',    '1',                               'Semaines minimum libres entre EV1 et EV2',             null, 'planification'],
    // Procédures
    ['procedures.email_direction',       'direction@institut-prigogine.be', 'Email de la direction (procédures)',                   null, 'procedures'],
    ['procedures.delai_recours_jours',   '4',                               'Délai recours interne (jours calendrier)',              null, 'procedures'],
    ['procedures.delai_decision_jours',  '7',                               'Délai décision interne (jours calendrier)',             null, 'procedures'],
    ['procedures.delai_ext_cal_jours',   '7',                               'Délai recours externe (jours calendrier)',              null, 'procedures'],
    ['procedures.delai_ext_ouv_jours',   '3',                               'Jours ouvrables avant délai recours externe',          null, 'procedures'],
    // Établissement
    ['etab.nom',                         'Institut Ilya Prigogine',         'Nom de l\'établissement',                              null, 'etablissement'],
    // Calendrier des sessions (calcul rétroactif depuis le dernier jour admin)
    ['session.dernier_jour_admin',       '',                                'Dernier jour de travail du personnel admin (AAAA-MM-JJ)', null, 'session'],
    ['session.recours_jours_ouvr',       '5',                               'Jours ouvrables réservés pour les recours',             null, 'session'],
    ['session.delib2_recours_cal',       '3',                               'Jours calendrier entre délib. session 2 et recours',    null, 'session'],
    ['session.delib2_duree_cal',         '1',                               'Jour calendrier pour la délibération session 2',        null, 'session'],
    ['session.corrections_ev2_cal',      '3',                               'Jours calendrier corrections avant délib. EV2',         null, 'session'],
    ['session.vc1_ev2_cal',              '10',                              'Jours calendrier entre VC session 1 et EV2',            null, 'session'],
    ['session.delib1_vc1_cal',           '3',                               'Jours calendrier entre délib. EV1 et VC EV1',           null, 'session'],
    ['session.ev1_delib1_cal',           '5',                               'Jours calendrier entre EV1 et délib. EV1',              null, 'session'],
    ['session.cours_ev1_cal',            '7',                               'Jours calendrier entre dernier cours et EV1',           null, 'session'],
    // Mise en page des documents imprimés
    ['miseenpage.entete_logo',           '1', 'Afficher le logo en en-tête',                null, 'mise_en_page'],
    ['miseenpage.pied_etab_nom',         '1', 'Pied de page : nom de l\'établissement',     null, 'mise_en_page'],
    ['miseenpage.pied_po',               '1', 'Pied de page : Pouvoir Organisateur',        null, 'mise_en_page'],
    ['miseenpage.pied_num_entreprise',   '1', 'Pied de page : N° d\'entreprise',            null, 'mise_en_page'],
    ['miseenpage.pied_num_fase',         '1', 'Pied de page : N° FASE',                     null, 'mise_en_page'],
    ['miseenpage.pied_adresse',          '1', 'Pied de page : adresse',                     null, 'mise_en_page'],
    ['miseenpage.pied_tel',              '1', 'Pied de page : téléphone',                   null, 'mise_en_page'],
    ['miseenpage.pied_email',            '1', 'Pied de page : e-mail de contact',           null, 'mise_en_page'],
    ['miseenpage.pied_site_web',         '1', 'Pied de page : site web',                    null, 'mise_en_page'],
  ];
  const _insertParam = db.prepare(`INSERT OR IGNORE INTO parametre (cle, valeur, label, section, groupe) VALUES (?,?,?,?,?)`);
  const _seedParams = db.transaction(() => { for (const p of _params) _insertParam.run(...p); });
  _seedParams();

  // Seed des locaux (si table vide) — liste IIP/HELB campus
  const _nbLocaux = db.prepare('SELECT COUNT(*) AS n FROM local').get().n;
  if (_nbLocaux === 0) {
    const _locaux = [
    ['P4 204', 'Classe', 32, 'Internet Projecteur'],
    ['P4 215', 'Classe', 30, 'Internet Projecteur'],
    ['P4 306', 'Classe', 76, 'Internet Ordinateur Projecteur'],
    ['P4 309', 'Classe', 84, 'Internet Ordinateur Projecteur'],
    ['P5 102', 'Classe', 28, 'Internet Projecteur'],
    ['P5 102a', 'Classe', 30, 'Internet Projecteur'],
    ['P5 106', 'Classe', 30, 'Internet Projecteur'],
    ['P5 108', 'Classe', 30, 'Internet Ordinateur Projecteur'],
    ['P5 112', 'Classe', 30, 'Internet Projecteur'],
    ['P5 114', 'Classe', 30, 'Internet Projecteur'],
    ['P5 118', 'Classe', 30, 'Internet Projecteur'],
    ['P5 118a', 'Classe', 30, 'Internet Projecteur'],
    ['P5 203a', 'Classe', 50, 'Internet Projecteur'],
    ['P5 217a', 'Classe', 48, 'Internet Projecteur'],
    ['P6 111', 'Classe / TP HBD', 44, 'Internet Projecteur'],
    ['P2 204', 'Auditoire', 50, 'Internet Ordinateur Projecteur'],
    ['P2 303', 'Auditoire', 117, 'Internet Baffle Ordinateur Projecteur'],
    ['P2 306', 'Auditoire', 117, 'Internet Baffle Ordinateur Projecteur'],
    ['P2 523', 'Auditoire', 198, 'Micros Internet Baffle Ordinateur Projecteur'],
    ['P2 524', 'Auditoire', 220, 'Micros Internet Baffle Ordinateur Projecteur'],
    ['P3 204', 'Auditoire', 50, 'Internet Ordinateur Projecteur'],
    ['P3 216', 'Auditoire', 50, 'Internet Ordinateur Projecteur'],
    ['P3 303', 'Auditoire', 117, 'Internet Baffle Ordinateur Projecteur'],
    ['P3 317', 'Auditoire', 117, 'Internet Baffle Ordinateur Projecteur'],
    ['Nile', 'Auditoire', 320, 'Micros int\u00e9gr\u00e9s Internet Ordinateur Projecteur'],
    ['P4 101', 'TP Kin\u00e9', null, ''],
    ['P4 106', 'TP Kin\u00e9', null, ''],
    ['P4 111', 'TP Kin\u00e9', null, ''],
    ['P4 112', 'TP Kin\u00e9', null, ''],
    ['P4 117', 'TP Kin\u00e9', null, 'Ordinateur Projecteur'],
    ['P4 203a', 'TP Kin\u00e9', null, ''],
    ['P6 106', 'TP Kin\u00e9', null, ''],
    ['P6 112', 'TP Kin\u00e9', null, 'Pratique \u00e9tudiants'],
    ['P4 217a', 'TP HBD', null, ''],
    ['P3 103', 'Salle de psychomot', null, ''],
    ['P6 103', 'Salle de psychomot', null, ''],
    ['P1 111', 'Salle de fitness', null, ''],
    ['P1 520', 'Salle de sport', null, ''],
    ['P1 126', 'Labo de lunetterie', null, ''],
    ['P4 214', 'Clinique de la vision', null, ''],
    ['P4 218', 'Labo orthoptie', null, ''],
    ['P5 111', 'Labo Siamu-P\u00e9dia', null, 'Lits'],
    ['P5 206a', 'Labo Sage-Femme', null, ''],
    ['P5 210', 'Labo Soins Infirmiers', null, 'Lits Mannequin'],
    ['P5 214a', 'Labo de manutention', null, 'Lits Mannequin'],
    ['P1 125', 'Labo Ergo', null, ''],
    ['P1 425', 'Orth\u00e8ses', null, ''],
    ['P1 426', 'Labo Ergo', null, ''],
    ['P1 423', 'Labo de recherche kin\u00e9', null, 'A ne plus donner'],
    ['P2 212a', 'Cyber', null, '30 Ordis'],
    ['P7 103', 'Cyber', null, '20 Ordis'],
    ['Tc. 103 (Wybran)', 'Classe', 24, 'Wifi non optimal Ordinateur Projecteur'],
    ['Tc. 104 (Wybran)', 'Classe', 38, 'Wifi non optimal Ordinateur Projecteur'],
    ['Tc. 107 (Wybran)', 'Classe', 32, 'Wifi non optimal Ordinateur Projecteur'],
    ['Tc. 108 (Wybran)', 'Classe', 24, 'Wifi non optimal Ordinateur Projecteur'],
    ];
    const _insLocal = db.prepare('INSERT OR IGNORE INTO local (nom, type, places, equipements) VALUES (?,?,?,?)');
    const _seedLocaux = db.transaction(() => { for (const l of _locaux) _insLocal.run(...l); });
    _seedLocaux();
    console.log(`[seed] ${_locaux.length} locaux ins\u00e9r\u00e9s`);
  }

  // Ajouter procedure_id à document_archive si absent (lien vers la procédure)
  const _colsDocArch = db.prepare('PRAGMA table_info(document_archive)').all();
  if (!_colsDocArch.find(c => c.name === 'procedure_id')) {
    db.exec(`ALTER TABLE document_archive ADD COLUMN procedure_id INTEGER REFERENCES procedure_archive(id) ON DELETE SET NULL`);
    console.log('[migration] Colonne document_archive.procedure_id ajoutée');
  }

  // ── Prérequis entre UE ─────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS ue_prerequis (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      ue_num          INTEGER NOT NULL,       -- UE qui a le prérequis
      prerequis_num   INTEGER NOT NULL,       -- UE qui doit être terminée avant
      section         TEXT,                   -- NULL = toutes sections
      annee_scolaire  TEXT,                   -- NULL = toutes années
      UNIQUE(ue_num, prerequis_num, section, annee_scolaire)
    );
    CREATE INDEX IF NOT EXISTS idx_ueprereq_ue  ON ue_prerequis(ue_num);
    CREATE INDEX IF NOT EXISTS idx_ueprereq_pre ON ue_prerequis(prerequis_num);
  `);

  // Flag épreuve intégrée sur la table UE
  const _colsUE = db.prepare('PRAGMA table_info(ue)').all();
  if (!_colsUE.find(c => c.name === 'is_epreuve_integree')) {
    db.exec(`ALTER TABLE ue ADD COLUMN is_epreuve_integree INTEGER DEFAULT 0`);
    console.log('[migration] Colonne ue.is_epreuve_integree ajoutée');
    // Marquer les épreuves intégrées connues
    const _epNums = [80, 190, 264, 307];
    for (const n of _epNums) {
      db.prepare('UPDATE ue SET is_epreuve_integree = 1 WHERE ue_num = ?').run(n);
    }
  }

  // ── Créneaux horaires fixes de l'établissement ────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS creneau (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      heure_debut TEXT NOT NULL,   -- '08:00'
      heure_fin   TEXT NOT NULL,   -- '10:00'
      ordre       INTEGER NOT NULL,
      label       TEXT
    );
  `);
  const _creneaux = db.prepare('SELECT COUNT(*) AS n FROM creneau').get();
  if (_creneaux.n === 0) {
    const _insC = db.prepare('INSERT INTO creneau (heure_debut, heure_fin, ordre, label) VALUES (?,?,?,?)');
    const _seedC = db.transaction(() => {
      _insC.run('08:00', '10:00', 1, 'Matin 1');
      _insC.run('10:15', '12:15', 2, 'Matin 2');
      _insC.run('13:15', '15:15', 3, 'Après-midi 1');
      _insC.run('15:30', '17:30', 4, 'Après-midi 2');
      _insC.run('17:30', '19:30', 5, 'Soirée');
    });
    _seedC();
    console.log('[seed] 5 créneaux horaires créés');
  }

  // ── Disponibilités des professeurs ────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS prof_disponibilite (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      professeur_id   INTEGER NOT NULL REFERENCES professeur(id) ON DELETE CASCADE,
      quadrimestre    TEXT NOT NULL,   -- 'Q1' | 'Q2'
      jour            INTEGER NOT NULL, -- 1=lun .. 5=ven
      creneau_id      INTEGER NOT NULL REFERENCES creneau(id),
      disponible      INTEGER NOT NULL DEFAULT 1,
      UNIQUE(professeur_id, quadrimestre, jour, creneau_id)
    );
    CREATE INDEX IF NOT EXISTS idx_profdispo_prof ON prof_disponibilite(professeur_id);
  `);

  // ── Pattern d'alternance par groupe ──────────────────────────────────────
  const _colsGroupe = db.prepare('PRAGMA table_info(groupe)').all();
  if (!_colsGroupe.find(c => c.name === 'pattern')) {
    db.exec(`ALTER TABLE groupe ADD COLUMN pattern TEXT DEFAULT 'toutes'`);
    console.log('[migration] Colonne groupe.pattern ajoutée');
  }
  if (!_colsGroupe.find(c => c.name === 'pattern_offset')) {
    db.exec(`ALTER TABLE groupe ADD COLUMN pattern_offset INTEGER DEFAULT 0`);
    console.log('[migration] Colonne groupe.pattern_offset ajoutée');
  }
  if (!_colsGroupe.find(c => c.name === 'activite_id')) {
    db.exec(`ALTER TABLE groupe ADD COLUMN activite_id INTEGER REFERENCES activite_type(id)`);
    console.log('[migration] Colonne groupe.activite_id ajoutée');
  }
  if (!_colsGroupe.find(c => c.name === 'code_cours')) {
    db.exec(`ALTER TABLE groupe ADD COLUMN code_cours TEXT`);
    console.log('[migration] Colonne groupe.code_cours ajoutée');
  }
  if (!_colsGroupe.find(c => c.name === 'ue_quad')) {
    db.exec(`ALTER TABLE groupe ADD COLUMN ue_quad TEXT`);
    console.log('[migration] Colonne groupe.ue_quad ajoutée');
  }

  // Mettre à jour ue_quad des groupes existants depuis la table ue
  const _updatedQuad = db.prepare(`
    UPDATE groupe SET ue_quad = (
      SELECT ue_quad FROM ue 
      WHERE ue.ue_num = groupe.ue_num AND ue.annee_scolaire = groupe.annee_scolaire
    )
    WHERE ue_quad IS NULL
  `).run();
  if (_updatedQuad.changes > 0) {
    console.log(`[migration] groupe.ue_quad mis à jour pour ${_updatedQuad.changes} groupe(s)`);
  }

  // ── Sections masquées de la page Attributions ───────────────────────────
  // Une section listée ici n'apparaît plus dans la vue Attributions (y compris
  // ses lignes Z synthétiques), mais le référentiel (cours, UE) reste intact.
  // Le masque est par année scolaire.
  db.exec(`
    CREATE TABLE IF NOT EXISTS section_masquee (
      section        TEXT NOT NULL,
      annee_scolaire TEXT NOT NULL,
      masque_le      TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (section, annee_scolaire)
    );
  `);

  // ── Séquencement des cours dans les UE ───────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS cours_sequence (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      section        TEXT NOT NULL,
      annee_scolaire TEXT NOT NULL,
      ue_num         INTEGER NOT NULL,
      groupe_id      INTEGER NOT NULL REFERENCES groupe(id) ON DELETE CASCADE,
      rang           INTEGER NOT NULL DEFAULT 0,
      delai_avant    INTEGER NOT NULL DEFAULT 0,  -- semaines d'attente avant ce rang
      UNIQUE(groupe_id)
    );
    CREATE INDEX IF NOT EXISTS idx_coursseq_section ON cours_sequence(section, annee_scolaire, ue_num);
  `);
  const _colsPlanif = db.prepare('PRAGMA table_info(planification)').all();
  if (!_colsPlanif.find(c => c.name === 'manuel')) {
    db.exec(`ALTER TABLE planification ADD COLUMN manuel INTEGER DEFAULT 0`);
    console.log('[migration] Colonne planification.manuel ajoutée');
  }

  // ── Seed des prérequis depuis les organigrammes ───────────────────────────
  const _prereqExist = db.prepare('SELECT COUNT(*) AS n FROM ue_prerequis').get();
  if (_prereqExist.n === 0) {
    const _insP = db.prepare(`INSERT OR IGNORE INTO ue_prerequis (ue_num, prerequis_num, section) VALUES (?,?,?)`);
    const _seedP = db.transaction(() => {
      // ── Psychomotricité ──────────────────────────────────────
      const P = 'Psychomotricité';
      _insP.run(73, 65, P);
      _insP.run(75, 73, P);
      _insP.run(70, 75, P);
      _insP.run(71, 70, P);
      _insP.run(74, 71, P);
      _insP.run(74, 72, P);
      _insP.run(72, 75, P);
      _insP.run(72, 68, P);
      _insP.run(77, 76, P);
      _insP.run(77, 65, P);
      _insP.run(78, 77, P);
      _insP.run(79, 78, P);
      _insP.run(79, 71, P);
      _insP.run(68, 67, P);
      // UE80 épreuve intégrée : dépend de toutes (géré via is_epreuve_integree)

      // ── TIM (Imagerie médicale) ──────────────────────────────
      const T = 'TIM';
      _insP.run(247, 246, T);
      _insP.run(252, 260, T);
      _insP.run(253, 252, T);
      _insP.run(250, 248, T);
      _insP.run(250, 249, T);
      _insP.run(251, 250, T);
      _insP.run(251, 253, T);
      _insP.run(261, 250, T);
      _insP.run(261, 254, T);
      _insP.run(255, 254, T);
      _insP.run(255, 258, T);
      _insP.run(259, 255, T);
      _insP.run(262, 261, T);
      _insP.run(262, 255, T);
      _insP.run(256, 255, T);
      _insP.run(263, 262, T);
      _insP.run(263, 256, T);
      _insP.run(263, 259, T);
      // UE264 épreuve intégrée

      // ── Optométrie ───────────────────────────────────────────
      const O = 'Optométrie';
      _insP.run(296, 287, O);
      _insP.run(289, 303, O);
      _insP.run(298, 291, O);
      _insP.run(298, 290, O);
      _insP.run(299, 298, O);
      _insP.run(301, 291, O);
      _insP.run(305, 299, O);
      _insP.run(305, 301, O);
      _insP.run(300, 299, O);
      _insP.run(302, 301, O);
      _insP.run(297, 286, O);
      _insP.run(304, 288, O);
      _insP.run(304, 295, O);
      _insP.run(294, 292, O);
      _insP.run(306, 305, O);
      _insP.run(306, 300, O);
      _insP.run(306, 302, O);
      // UE307 épreuve intégrée

      // ── Opticien ─────────────────────────────────────────────
      const Op = 'Optique';
      _insP.run(177, 176, Op);
      _insP.run(182, 177, Op);
      _insP.run(185, 182, Op);
      _insP.run(186, 182, Op);
      // UE190 épreuve intégrée
    });
    _seedP();
    console.log('[seed] Prérequis UE chargés (Psychomotricité, TIM, Optométrie, Opticien)');
  }

  // Paramètres Q1/Q2 (ajout si absents)
  const _qParams = [
    ['planning.q1_debut', '2026-09-01', 'Date début Q1', null, 'planification'],
    ['planning.q1_fin',   '2027-01-31', 'Date fin Q1',   null, 'planification'],
    ['planning.q2_debut', '2027-02-01', 'Date début Q2', null, 'planification'],
    ['planning.q2_fin',   '2027-06-30', 'Date fin Q2',   null, 'planification'],
  ];
  const _insQP = db.prepare(`INSERT OR IGNORE INTO parametre (cle, valeur, label, section, groupe) VALUES (?,?,?,?,?)`);
  for (const p of _qParams) _insQP.run(...p);

  // 5c. Table ue_section (rattachement many-to-many UE <-> sections)
  db.exec(`
    CREATE TABLE IF NOT EXISTS ue_section (
      ue_num          INTEGER NOT NULL,
      section_code    TEXT NOT NULL,
      annee_scolaire  TEXT NOT NULL DEFAULT '2025-2026',
      PRIMARY KEY (ue_num, section_code, annee_scolaire)
    );
    CREATE INDEX IF NOT EXISTS idx_uesec_ue ON ue_section(ue_num, annee_scolaire);
    CREATE INDEX IF NOT EXISTS idx_uesec_sec ON ue_section(section_code, annee_scolaire);
  `);

  // 5d. Colonnes enrichies de la table section
  {
    const cols = db.prepare("PRAGMA table_info(section)").all().map(c => c.name);
    for (const [name, type] of [['niveau','TEXT'],['type_horaire','TEXT'],['responsable','TEXT'],['code_fwb','TEXT']]) {
      if (!cols.includes(name)) {
        db.exec(`ALTER TABLE section ADD COLUMN ${name} ${type};`);
        console.log(`[migration] section : colonne ${name} ajoutée`);
      }
    }
  }

  // 5e. Repère de dernière visite du fil d'activité (par utilisateur)
  {
    const cols = db.prepare("PRAGMA table_info(utilisateur)").all().map(c => c.name);
    if (!cols.includes('derniere_visite_activite')) {
      db.exec(`ALTER TABLE utilisateur ADD COLUMN derniere_visite_activite DATETIME;`);
      console.log('[migration] utilisateur : colonne derniere_visite_activite ajoutée');
    }
  }

  // 5f. Activer l'historique automatiquement (pour le fil d'activité)
  {
    const p = db.prepare("SELECT valeur_num FROM parametre_financier WHERE cle = 'HISTORIQUE_ACTIF'").get();
    if (!p) {
      db.prepare("INSERT INTO parametre_financier (cle, valeur_num, description) VALUES ('HISTORIQUE_ACTIF', 1, 'Journalisation des modifications (fil d activité)')").run();
      console.log('[migration] HISTORIQUE_ACTIF créé et activé');
    } else if (Number(p.valeur_num) !== 1) {
      db.prepare("UPDATE parametre_financier SET valeur_num = 1 WHERE cle = 'HISTORIQUE_ACTIF'").run();
      console.log('[migration] HISTORIQUE_ACTIF activé');
    }
  }

  // 5g. Accusés de traitement du fil d'activité : qui a coché quelle modif
  {
    db.exec(`
      CREATE TABLE IF NOT EXISTS activite_traitee (
        snapshot_id    INTEGER NOT NULL,
        utilisateur_id INTEGER NOT NULL,
        traite_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (snapshot_id, utilisateur_id)
      );
    `);
  }

  // 5h. Table des paramètres de l'établissement (documents officiels EA12)
  {
    db.exec(`
      CREATE TABLE IF NOT EXISTS etablissement (
        id              INTEGER PRIMARY KEY CHECK (id = 1),
        po_nom          TEXT,
        etab_nom        TEXT,
        adresse         TEXT,
        type_po         TEXT,
        sous_type       TEXT,
        num_ecot        TEXT,
        num_fase        TEXT,
        email_ec        TEXT,
        email_po        TEXT,
        gest_nom        TEXT,
        gest_prenom     TEXT,
        gest_qualite    TEXT,
        gest_tel        TEXT,
        gest_email      TEXT
      );
    `);
    // Nombre de jours de fonctionnement/semaine (propriété de l'établissement)
    const colsEtab = db.prepare("PRAGMA table_info(etablissement)").all().map(c => c.name);
    if (!colsEtab.includes('jours_fonctionnement')) db.exec("ALTER TABLE etablissement ADD COLUMN jours_fonctionnement INTEGER");
    // Pré-remplissage initial (IIP) si aucune donnée n'existe encore.
    // Valeurs certaines issues d'un EA12 réel ; les champs incertains
    // (email_ec tronqué, email gestionnaire absent) restent vides à compléter.
    const exists = db.prepare('SELECT 1 FROM etablissement WHERE id = 1').get();
    if (!exists) {
      db.prepare(`
        INSERT INTO etablissement
          (id, po_nom, etab_nom, adresse, type_po, sous_type, num_ecot, num_fase,
           email_ec, email_po, gest_nom, gest_prenom, gest_qualite, gest_tel, gest_email)
        VALUES (1, @po_nom, @etab_nom, @adresse, @type_po, @sous_type, @num_ecot, @num_fase,
           @email_ec, @email_po, @gest_nom, @gest_prenom, @gest_qualite, @gest_tel, @gest_email)
      `).run({
        po_nom: 'ASBL Ilya Prigogine',
        etab_nom: 'Institut Ilya Prigogine',
        adresse: 'Campus Erasme, Bât. P, route de Lennik 808, 1070 Anderlecht',
        type_po: 'FWB',
        sous_type: 'libre',
        num_ecot: '5222132070',
        num_fase: '292',
        email_ec: null,
        email_po: 'po001347@adm.cfwb.be',
        gest_nom: 'DAELEMAN',
        gest_prenom: 'Florian',
        gest_qualite: 'Éducateur-secrétaire',
        gest_tel: '+3225602959',
        gest_email: null,
      });
      console.log('[migration] etablissement : pré-remplissage IIP initial');
    }
  }

  // 5i. Colonnes EA12 sur la fiche professeur (données stables et réutilisables)
  {
    const cols = db.prepare("PRAGMA table_info(professeur)").all().map(c => c.name);
    if (!cols.includes('matricule')) db.exec("ALTER TABLE professeur ADD COLUMN matricule TEXT");
    if (!cols.includes('titre1')) db.exec("ALTER TABLE professeur ADD COLUMN titre1 TEXT");
    if (!cols.includes('titre2')) db.exec("ALTER TABLE professeur ADD COLUMN titre2 TEXT");
    if (!cols.includes('titre3')) db.exec("ALTER TABLE professeur ADD COLUMN titre3 TEXT");
    if (!cols.includes('statut_ea12')) db.exec("ALTER TABLE professeur ADD COLUMN statut_ea12 TEXT"); // T/TPr/St/D
    // date de naissance (pour l'environnement dev et les futurs documents RH)
    const colsProf = db.prepare("PRAGMA table_info(professeur)").all().map(c => c.name);
    if (!colsProf.includes('date_naissance')) db.exec("ALTER TABLE professeur ADD COLUMN date_naissance TEXT");
  }

  // 5l. Champs de la FICHE SIGNALÉTIQUE FWB (annexe 3) — identité civile + situation fiscale.
  // On n'ajoute QUE ce qui n'existe pas déjà ailleurs (nom, prénom, matricule, naissance,
  // adresse, email sont réutilisés depuis la fiche prof : pas de double encodage).
  {
    const cols = db.prepare("PRAGMA table_info(professeur)").all().map(c => c.name);
    const add = (name, type = 'TEXT') => {
      if (!cols.includes(name)) db.exec(`ALTER TABLE professeur ADD COLUMN ${name} ${type}`);
    };
    // ── Identité civile ──
    add('sexe');                 // 'F' | 'M'
    add('niss');                 // numéro national (NISS / NISS bis)
    add('nationalite');
    add('lieu_naissance_ville');
    add('lieu_naissance_pays');
    add('iban');
    add('bic');                  // si compte étranger
    add('compte_titulaire');     // au nom de…
    add('tel_gsm');
    add('photo');                // data-URI JPEG base64 issue de la carte eID (~3-4 Ko)
    // ── Situation fiscale du MDP ──
    add('etat_civil');           // celibataire|marie|veuf|divorce|cohab_legal|cohabitant|separe_corps|separe_fait
    add('handicap');             // 'oui' | 'non'
    // ── Situation du conjoint / cohabitant légal ──
    add('conjoint_nom');
    add('conjoint_prenom');
    add('conjoint_handicap');            // 'oui' | 'non'
    add('conjoint_alloc_foyer');         // 'oui' | 'non'
    add('conjoint_revenus');             // pro|pension|faibles|aucun (catégorie de revenus)
    // ── Règlement CE 883/2004 (réside dans un autre état européen) ──
    add('ce883_actif');                  // 'oui' | 'non'
    add('ce883_date_debut');
    add('ce883_caisse');                 // dénomination + adresse caisse SS
    add('ce883_num_inscription');
  }

  // 5m. Table des TITRES DE CAPACITÉ (un prof → plusieurs titres datés).
  // Remplace à terme titre1/2/3 (conservés pour compat + migration des données existantes).
  {
    db.exec(`
      CREATE TABLE IF NOT EXISTS titre_capacite (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        professeur_id INTEGER NOT NULL,
        date_obtention TEXT,
        intitule      TEXT,
        delivre_par   TEXT,
        ordre         INTEGER DEFAULT 0,
        FOREIGN KEY (professeur_id) REFERENCES professeur(id) ON DELETE CASCADE
      )
    `);
    db.exec("CREATE INDEX IF NOT EXISTS idx_titre_prof ON titre_capacite(professeur_id)");

    // Migration douce : si la table est vide, importer titre1/2/3 existants
    const nbTitres = db.prepare("SELECT COUNT(*) AS n FROM titre_capacite").get().n;
    if (nbTitres === 0) {
      const profs = db.prepare("SELECT id, titre1, titre2, titre3 FROM professeur").all();
      const ins = db.prepare(
        "INSERT INTO titre_capacite (professeur_id, intitule, ordre) VALUES (?, ?, ?)"
      );
      const tx = db.transaction(() => {
        for (const p of profs) {
          [p.titre1, p.titre2, p.titre3].forEach((t, i) => {
            if (t && t.trim()) ins.run(p.id, t.trim(), i);
          });
        }
      });
      tx();
      console.log('[migration] titres de capacité importés depuis titre1/2/3');
    }
  }

  // 5n. Table des PERSONNES À CHARGE (enfants, +65 ans, autres).
  {
    db.exec(`
      CREATE TABLE IF NOT EXISTS personne_charge (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        professeur_id INTEGER NOT NULL,
        categorie     TEXT,            -- 'enfant' | 'autre_65' | 'autre'
        date_naissance TEXT,
        handicap      TEXT,            -- 'oui' | 'non'
        ordre         INTEGER DEFAULT 0,
        FOREIGN KEY (professeur_id) REFERENCES professeur(id) ON DELETE CASCADE
      )
    `);
    db.exec("CREATE INDEX IF NOT EXISTS idx_charge_prof ON personne_charge(professeur_id)");
  }

  // 5o. ANCIENNETÉ — reports historiques saisis par le personnel administratif.
  // L'ancienneté affichée = report historique (avant l'année de démarrage)
  //                       + acquis de l'année courante (calculé automatiquement).
  // Deux anciennetés (CC sous IIP uniquement) : PO (global) et par cours.
  {
    const cols = db.prepare("PRAGMA table_info(professeur)").all().map(c => c.name);
    // Report PO (en jours) — réutilise/complète anciennete_25_26_po historique
    if (!cols.includes('report_anc_po')) db.exec("ALTER TABLE professeur ADD COLUMN report_anc_po INTEGER DEFAULT 0");

    // Report par cours (prof + nom de cours → jours d'ancienneté historiques)
    db.exec(`
      CREATE TABLE IF NOT EXISTS report_anc_cours (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        professeur_id INTEGER NOT NULL,
        cours_nom     TEXT NOT NULL,
        jours         INTEGER DEFAULT 0,
        FOREIGN KEY (professeur_id) REFERENCES professeur(id) ON DELETE CASCADE
      )
    `);
    db.exec("CREATE INDEX IF NOT EXISTS idx_report_cours_prof ON report_anc_cours(professeur_id)");

    // Migration douce : si report_anc_po est à 0 mais anciennete_25_26_po renseigné,
    // on reprend l'ancienne valeur comme report PO de départ.
    try {
      db.exec("UPDATE professeur SET report_anc_po = anciennete_25_26_po WHERE report_anc_po = 0 AND anciennete_25_26_po > 0");
    } catch (e) { /* colonne absente : ignore */ }
  }

  // 5k. Créer les sections référencées par des UE mais absentes de la table section.
  // Cas réel : AeSI (Assistant en Soins Infirmiers) a des UE mais pas d'entrée section,
  // donc elle n'apparaissait nulle part dans les listes de sections.
  {
    const libelles = {
      'AeSI': 'Assistant en soins infirmiers',
      'FID-Admin': 'FID — Administration',
      'FID-Guidance': 'FID — Guidance',
      'FID-Péda': 'FID — Pédagogie',
      'ATNUP': 'Aide soignant / Auxiliaire',
      'TIM': 'Technologue en imagerie médicale',
      'SAR': 'Soins, accompagnement et rééducation',
      'ME': 'Mécanique / Électronique',
      'RESTART': 'Restart',
      'Soins_plaies': 'Soins de plaies',
      'Optique': 'Optique',
      'Optométrie': 'Optométrie',
      'Psychomotricité': 'Psychomotricité',
    };
    try {
      // Sections officielles de l'IIP : créées inconditionnellement (qu'elles
      // soient référencées ou non par une UE), pour qu'elles existent toujours.
      const sectionsOfficielles = {
        'AeSI': 'Assistant en soins infirmiers',
        'ATNUP': 'Aide soignant / Auxiliaire',
        'TIM': 'Technologue en imagerie médicale',
        'Optique': 'Optique',
        'Optométrie': 'Optométrie',
        'Psychomotricité': 'Psychomotricité',
        'SAR': 'Soins, accompagnement et rééducation',
        'Soins_plaies': 'Soins de plaies',
        'ME': 'Mécanique / Électronique',
        'RESTART': 'Restart',
        'FID-Guidance': 'FID — Guidance',
        'FID-Péda': 'FID — Pédagogie',
        'FID-Admin': 'FID — Administration',
      };
      const existing = new Set(db.prepare('SELECT code FROM section').all().map(r => r.code));
      const insert = db.prepare('INSERT OR IGNORE INTO section (code, libelle) VALUES (?, ?)');
      let created = 0;

      // 1) Sections officielles garanties
      for (const [code, lib] of Object.entries(sectionsOfficielles)) {
        if (!existing.has(code)) { insert.run(code, lib); existing.add(code); created++; }
      }

      // 2) Sections supplémentaires référencées par des UE (au cas où il y en aurait d'autres)
      const ueSections = db.prepare(
        "SELECT DISTINCT section FROM ue WHERE section IS NOT NULL AND TRIM(section) <> ''"
      ).all().map(r => r.section);
      for (const sec of ueSections) {
        if (!existing.has(sec)) {
          insert.run(sec, libelles[sec] || sec);
          existing.add(sec);
          created++;
        }
      }
      if (created > 0) console.log(`[migration] ${created} section(s) créée(s) (officielles + orphelines)`);
    } catch (e) {
      console.error('[migration] sections orphelines :', e.message);
    }
  }

  // 5j. Table des documents EA12 (un par événement administratif d'un MDP)
  {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ea12 (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        professeur_id   INTEGER NOT NULL,
        annee_scolaire  TEXT NOT NULL,
        variante        TEXT NOT NULL DEFAULT 'bis',     -- 'secondaire' | 'bis' | 'ter'
        statut_doc      TEXT NOT NULL DEFAULT 'brouillon', -- 'brouillon' | 'genere'
        donnees_json    TEXT NOT NULL DEFAULT '{}',       -- tous les champs saisis (cases, dates, etc.)
        cree_le         DATETIME DEFAULT CURRENT_TIMESTAMP,
        modifie_le      DATETIME DEFAULT CURRENT_TIMESTAMP,
        cree_par        INTEGER,
        FOREIGN KEY (professeur_id) REFERENCES professeur(id)
      );
    `);
    db.exec("CREATE INDEX IF NOT EXISTS idx_ea12_prof ON ea12(professeur_id)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_ea12_annee ON ea12(annee_scolaire)");
    // num_doc : numéro de Doc12 (par prof/année, figé à la création)
    const colsEa12 = db.prepare("PRAGMA table_info(ea12)").all().map(c => c.name);
    if (!colsEa12.includes('num_doc')) db.exec("ALTER TABLE ea12 ADD COLUMN num_doc INTEGER");
  }

  // 6. Ajouter annee_scolaire aux tables ue et cours (clés composites)
  // SQLite ne permet pas de changer une PRIMARY KEY → on recrée les tables.
  // Les FK doivent être désactivées car d'autres tables (aa, cours) référencent ue.
  // PRAGMA foreign_keys ne fonctionne pas dans une transaction → on le pose hors transaction.
  const ueCols = db.prepare("PRAGMA table_info(ue)").all();
  const coursCols = db.prepare("PRAGMA table_info(cours)").all();
  const needUeMigration = !ueCols.find(c => c.name === 'annee_scolaire');
  const needCoursMigration = !coursCols.find(c => c.name === 'annee_scolaire');

  if (needUeMigration || needCoursMigration) {
    db.exec('PRAGMA foreign_keys = OFF;');

    if (needUeMigration) {
      db.exec(`DROP TABLE IF EXISTS ue_new;`);
      db.exec(`
        CREATE TABLE ue_new (
          ue_num          INTEGER,
          annee_scolaire  TEXT NOT NULL DEFAULT '2025-2026',
          ue_nom          TEXT NOT NULL,
          ue_code_fwb     TEXT,
          section         TEXT,
          ue_tc           TEXT,
          ue_det          TEXT,
          ue_niv          TEXT,
          ue_per_etudiants INTEGER,
          ue_per_cours    INTEGER,
          ue_aut          INTEGER,
          ue_tot_prf      INTEGER,
          ue_niveau       TEXT,
          ue_quad         TEXT,
          et_ref          TEXT,
          ects            INTEGER,
          ue_prerequise   TEXT,
          PRIMARY KEY (ue_num, annee_scolaire)
        );
        INSERT INTO ue_new (ue_num, annee_scolaire, ue_nom, ue_code_fwb, section, ue_tc, ue_det,
          ue_niv, ue_per_etudiants, ue_per_cours, ue_aut, ue_tot_prf, ue_niveau, ue_quad, et_ref, ects, ue_prerequise)
          SELECT ue_num, '2025-2026', ue_nom, ue_code_fwb, section, ue_tc, ue_det,
          ue_niv, ue_per_etudiants, ue_per_cours, ue_aut, ue_tot_prf, ue_niveau, ue_quad, et_ref, ects, ue_prerequise
          FROM ue;
        DROP TABLE ue;
        ALTER TABLE ue_new RENAME TO ue;
        CREATE INDEX IF NOT EXISTS idx_ue_section ON ue(section);
        CREATE INDEX IF NOT EXISTS idx_ue_niveau ON ue(ue_niveau);
        CREATE INDEX IF NOT EXISTS idx_ue_annee ON ue(annee_scolaire);
      `);
      console.log('[migration] Table ue : clé composite (ue_num, annee_scolaire)');
    }

    if (needCoursMigration) {
      db.exec(`DROP TABLE IF EXISTS cours_new;`);
      db.exec(`
        CREATE TABLE cours_new (
          cours_code      TEXT,
          annee_scolaire  TEXT NOT NULL DEFAULT '2025-2026',
          cours_num       INTEGER,
          cours_nom       TEXT NOT NULL,
          ct_pp           TEXT,
          section         TEXT,
          ue_num          INTEGER,
          quadrimestre_cours TEXT,
          cours_per       INTEGER,
          cours_total     INTEGER,
          ue_autonomie    INTEGER,
          ue_per_total    INTEGER,
          ue_niveau       TEXT,
          enc_cours       TEXT,
          heures          INTEGER,
          PRIMARY KEY (cours_code, annee_scolaire)
        );
        INSERT INTO cours_new (cours_code, annee_scolaire, cours_num, cours_nom, ct_pp, section,
          ue_num, quadrimestre_cours, cours_per, cours_total, ue_autonomie, ue_per_total, ue_niveau, enc_cours, heures)
          SELECT cours_code, '2025-2026', cours_num, cours_nom, ct_pp, section,
          ue_num, quadrimestre_cours, cours_per, cours_total, ue_autonomie, ue_per_total, ue_niveau, enc_cours, heures
          FROM cours;
        DROP TABLE cours;
        ALTER TABLE cours_new RENAME TO cours;
        CREATE INDEX IF NOT EXISTS idx_cours_ue ON cours(ue_num);
        CREATE INDEX IF NOT EXISTS idx_cours_annee ON cours(annee_scolaire);
      `);
      console.log('[migration] Table cours : clé composite (cours_code, annee_scolaire)');
    }

    db.exec('PRAGMA foreign_keys = ON;');
  }

  // 7. Retirer les FK obsolètes vers ue/cours (incompatibles avec clés composites)
  // Une FK simple REFERENCES cours(cours_code) provoque "foreign key mismatch"
  // depuis que cours a une PK composite. On recrée attribution/aa/ue_inscription sans FK.
  const attrFKs = db.prepare("PRAGMA foreign_key_list(attribution)").all();
  const hasObsoleteFK = attrFKs.some(fk => fk.table === 'cours' || fk.table === 'ue');
  if (hasObsoleteFK) {
    db.exec('PRAGMA foreign_keys = OFF;');

    // Recréer attribution sans les FK ue/cours, en préservant toutes les colonnes et données
    const cols = db.prepare("PRAGMA table_info(attribution)").all();
    const colNames = cols.map(c => c.name).filter(n => n !== 'total_attribue_professeur' && n !== 'charge_en_heures');
    // On reconstruit via le schéma : le plus sûr est de copier les colonnes connues.
    // Génère la liste des colonnes pour le SELECT/INSERT (hors colonnes générées VIRTUAL).
    const generated = cols.filter(c => c.name === 'total_attribue_professeur' || c.name === 'charge_en_heures').map(c => c.name);
    const insertable = cols.map(c => c.name).filter(n => !generated.includes(n));

    db.exec('DROP TABLE IF EXISTS attribution_new;');
    db.exec(`
      CREATE TABLE attribution_new (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        section         TEXT REFERENCES section(code),
        etablissement_referent TEXT,
        contrat_mdp     TEXT,
        organisation    TEXT,
        annee_scolaire  TEXT DEFAULT '2025-2026',
        ue_num          INTEGER NOT NULL,
        num_organisation INTEGER DEFAULT 1,
        quadrimestre_attribue TEXT,
        code_cours      TEXT,
        type_cours      TEXT,
        type_cours_helb TEXT,
        code            TEXT,
        nb_groupes      INTEGER DEFAULT 1,
        split_groupe    TEXT DEFAULT 'N',
        num_split       INTEGER,
        num_groupe      INTEGER,
        activite_id     INTEGER REFERENCES activite_type(id),
        professeur_id   INTEGER REFERENCES professeur(id),
        cours_ept_ad    TEXT,
        coordination_encadrement TEXT,
        modification_attribution TEXT,
        commentaire     TEXT,
        commentaire_2   TEXT,
        charge_perdue_84plus REAL,
        periodes_transferees REAL,
        per_etudiant_total_dp INTEGER,
        periodes_attribuees REAL NOT NULL DEFAULT 0,
        autonomie_attribuee REAL NOT NULL DEFAULT 0,
        total_attribue_professeur REAL GENERATED ALWAYS AS
                        (COALESCE(periodes_attribuees,0) + COALESCE(autonomie_attribuee,0)) VIRTUAL,
        charge_en_heures REAL GENERATED ALWAYS AS
                        (ROUND((COALESCE(periodes_attribuees,0) + COALESCE(autonomie_attribuee,0)) * 50.0 / 60.0)) VIRTUAL,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by      INTEGER,
        updated_by      INTEGER
      );
    `);
    // Colonnes communes entre l'ancienne table et la nouvelle (hors générées)
    const newCols = db.prepare("PRAGMA table_info(attribution_new)").all().map(c => c.name);
    const common = insertable.filter(n => newCols.includes(n));
    const colList = common.join(', ');
    db.exec(`INSERT INTO attribution_new (${colList}) SELECT ${colList} FROM attribution;`);
    db.exec('DROP TABLE attribution;');
    db.exec('ALTER TABLE attribution_new RENAME TO attribution;');
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_attr_prof ON attribution(professeur_id);
      CREATE INDEX IF NOT EXISTS idx_attr_section ON attribution(section);
      CREATE INDEX IF NOT EXISTS idx_attr_ue ON attribution(ue_num);
      CREATE INDEX IF NOT EXISTS idx_attr_annee ON attribution(annee_scolaire);
    `);
    console.log('[migration] Table attribution : FK obsolètes retirées');

    // Recréer le trigger updated_at (supprimé avec l'ancienne table)
    db.exec(`
      DROP TRIGGER IF EXISTS trg_attr_updated;
      CREATE TRIGGER trg_attr_updated AFTER UPDATE ON attribution
      BEGIN
        UPDATE attribution SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
    `);

    db.exec('PRAGMA foreign_keys = ON;');
  }

  // 7b. Retirer les FK obsolètes de aa et ue_inscription (même problème)
  const aaFKs = db.prepare("PRAGMA foreign_key_list(aa)").all();
  if (aaFKs.some(fk => fk.table === 'cours' || fk.table === 'ue')) {
    db.exec('PRAGMA foreign_keys = OFF;');
    db.exec('DROP TABLE IF EXISTS aa_new;');
    db.exec(`
      CREATE TABLE aa_new (
        aa_code     TEXT PRIMARY KEY,
        aa_num      INTEGER,
        ue_num      INTEGER,
        cours_code  TEXT,
        description TEXT
      );
      INSERT INTO aa_new (aa_code, aa_num, ue_num, cours_code, description)
        SELECT aa_code, aa_num, ue_num, cours_code, description FROM aa;
      DROP TABLE aa;
      ALTER TABLE aa_new RENAME TO aa;
    `);
    console.log('[migration] Table aa : FK obsolètes retirées');
    db.exec('PRAGMA foreign_keys = ON;');
  }

  const uiFKs = db.prepare("PRAGMA foreign_key_list(ue_inscription)").all();
  if (uiFKs.some(fk => fk.table === 'ue')) {
    db.exec('PRAGMA foreign_keys = OFF;');
    // Recréer ue_inscription sans la FK, en préservant les colonnes communes
    const uiCols = db.prepare("PRAGMA table_info(ue_inscription)").all().map(c => c.name);
    db.exec('DROP TABLE IF EXISTS ue_inscription_new;');
    db.exec(`
      CREATE TABLE ue_inscription_new (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        ue_num          INTEGER NOT NULL,
        num_organisation INTEGER DEFAULT 1,
        payroll         TEXT,
        organisation    TEXT,
        nb_etudiants_iip INTEGER DEFAULT 0,
        nb_etudiants_helb INTEGER DEFAULT 0,
        encadrement     TEXT,
        annee_scolaire  TEXT DEFAULT '2025-2026',
        UNIQUE(ue_num, num_organisation, annee_scolaire)
      );
    `);
    const newUiCols = db.prepare("PRAGMA table_info(ue_inscription_new)").all().map(c => c.name);
    const commonUi = uiCols.filter(n => newUiCols.includes(n));
    const uiList = commonUi.join(', ');
    db.exec(`INSERT INTO ue_inscription_new (${uiList}) SELECT ${uiList} FROM ue_inscription;`);
    db.exec('DROP TABLE ue_inscription;');
    db.exec('ALTER TABLE ue_inscription_new RENAME TO ue_inscription;');
    console.log('[migration] Table ue_inscription : FK obsolètes retirées');
    db.exec('PRAGMA foreign_keys = ON;');
  }

  // 7c. Réparer ue_inscription si la colonne encadrement manque
  // (une migration précédente l'avait recréée sans cette colonne)
  const uiColsNow = db.prepare("PRAGMA table_info(ue_inscription)").all().map(c => c.name);
  if (!uiColsNow.includes('encadrement')) {
    db.exec("ALTER TABLE ue_inscription ADD COLUMN encadrement TEXT;");
    console.log('[migration] Table ue_inscription : colonne encadrement ajoutée');
  }

  // 7d. PILOTAGE CIVIL — dotation par année civile + enveloppes extérieures
  {
    // pot_code sur ue : permet de taguer Qualité / CF / Inclusif (fallback : auto-détecté depuis ue_code_fwb)
    const ueColsNow = db.prepare("PRAGMA table_info(ue)").all().map(c => c.name);
    if (!ueColsNow.includes('pot_code')) {
      db.exec("ALTER TABLE ue ADD COLUMN pot_code TEXT");
      console.log('[migration] Table ue : colonne pot_code ajoutée');
    }

    // Table dotation_civile : dotation organique par année civile
    db.exec(`
      CREATE TABLE IF NOT EXISTS dotation_civile (
        annee_civile              INTEGER PRIMARY KEY,
        dotation_organique        REAL    NOT NULL DEFAULT 0,
        usage_historique_organique REAL,     -- NULL = calculé depuis la DB ; valeur = saisie manuelle (années sans données)
        notes                     TEXT
      );
    `);

    // Table enveloppe_externe : enveloppes fermées par code × année civile
    db.exec(`
      CREATE TABLE IF NOT EXISTS enveloppe_externe (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        code            TEXT    NOT NULL,          -- 'QUAL' | 'CF' | 'INCL'
        label           TEXT    NOT NULL,
        annee_civile    INTEGER NOT NULL,
        periodes_b      REAL    NOT NULL DEFAULT 0,
        usage_historique REAL,                     -- NULL = calculé ; valeur = saisie manuelle
        notes           TEXT,
        UNIQUE(code, annee_civile)
      );
    `);
    // Enveloppe illimitée (ex. AeSI sans pot défini) : ne déborde jamais sur la dotation
    try { db.exec("ALTER TABLE enveloppe_externe ADD COLUMN illimite INTEGER DEFAULT 0"); } catch {}

    // periodes_eleves (PEP brute Menu 7) + pep_calculee (PEP pondérée Menu 5.5) + dotation_utilisable + pep_reference
    try { db.exec("ALTER TABLE dotation_civile ADD COLUMN periodes_eleves      REAL"); } catch {}
    try { db.exec("ALTER TABLE dotation_civile ADD COLUMN pep_reference        REAL"); } catch {}
    try { db.exec("ALTER TABLE dotation_civile ADD COLUMN pep_annee_utilisee   INTEGER"); } catch {}
    try { db.exec("ALTER TABLE dotation_civile ADD COLUMN pep_calculee         REAL"); } catch {}  // PEP pondérée Menu 5.5 (comparée à pep_reference pour ±8%)
    try { db.exec("ALTER TABLE dotation_civile ADD COLUMN dotation_utilisable  REAL"); } catch {}  // Dotation utilisable (après retraits intra-année)

    // Seed complet depuis HOD IIP (1/06/2026) — Menu 7 (PEP brute) + Menu 5.5 (dotations et PEP pondérées)
    // Dérogations COVID : dotations 2022/2023/2024 ont utilisé PEP 2019 (A.Gt 27-10-2022)
    // usage_historique = dotation_utilisable - solde  (pour années sans données Lucie)
    const hodData = [
      // [civile, dot_init, dot_util, pep_brute_menu7, pep_ref, pep_calc, pep_an_used, usage_hist, notes]
      [2018, 12931, 12767, 196092, 323078, 364980, null,  12742, null],
      [2019, 13255, 12939, 167132, 325598, 303531, null,  13046, null],
      [2020, 13359, 12901, 152372, 325598, 311443, null,  12706, null],
      [2021, 13359, 12621, 142797, 325598, 281195, 2019,  12387, null],
      [2022, 13359, 12412, 123255, 280292, 238850, 2019,  11232, 'Dérogation COVID — PEP 2019 utilisées (A.Gt 27-10-2022)'],
      [2023, 13359, 12879, 198605, 236397, 343730, 2019,  12878, 'Dérogation COVID — PEP 2019 utilisées (A.Gt 27-10-2022)'],
      [2024, 13359, 13126, 296279, 238548, 483394, 2019,  13197, 'Dérogation COVID — PEP 2019 utilisées (A.Gt 27-10-2022)'],
      [2025, 13480, 12882, 313739, 239812, 554127, 2023,  null,  'Normale — PEP N-2 = 2023'],
      [2026, 13552, 13552, 193674, null,   346072, 2024,  null,  'Partielle (1/06/2026) — PEP N-2 = 2024'],
    ];
    const upsertHod = db.prepare(`
      INSERT INTO dotation_civile
        (annee_civile, dotation_organique, dotation_utilisable, periodes_eleves, pep_reference,
         pep_calculee, pep_annee_utilisee, usage_historique_organique, notes)
      VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(annee_civile) DO UPDATE SET
        dotation_organique            = excluded.dotation_organique,
        dotation_utilisable           = excluded.dotation_utilisable,
        periodes_eleves               = excluded.periodes_eleves,
        pep_reference                 = excluded.pep_reference,
        pep_calculee                  = excluded.pep_calculee,
        pep_annee_utilisee            = excluded.pep_annee_utilisee,
        usage_historique_organique    = COALESCE(excluded.usage_historique_organique, dotation_civile.usage_historique_organique),
        notes                         = COALESCE(excluded.notes, dotation_civile.notes)
    `);
    for (const [ac, di, du, pb, pr, pc, pau, uh, notes] of hodData)
      upsertHod.run(ac, di, du, pb, pr, pc, pau, uh, notes);
    console.log('[migration] HOD IIP 2018-2026 : dotations + PEP chargées (Menu 7 + Menu 5.5)');

    // Seeder dotation_civile depuis les paramètres PERIODES_DISPO existants
    const p25 = db.prepare("SELECT valeur_num FROM parametre_financier WHERE cle='PERIODES_DISPO_25'").get();
    const p26 = db.prepare("SELECT valeur_num FROM parametre_financier WHERE cle='PERIODES_DISPO_26'").get();
    if (p25) db.prepare("INSERT OR IGNORE INTO dotation_civile (annee_civile, dotation_organique) VALUES (2025, ?)").run(p25.valeur_num);
    if (p26) db.prepare("INSERT OR IGNORE INTO dotation_civile (annee_civile, dotation_organique) VALUES (2026, ?)").run(p26.valeur_num);

    // Seeder enveloppes initiales (QUAL=150, CF=200→300, INCL=50)
    const seedEnv = [
      ['QUAL', 'Coordinateur Qualité',              2025, 150],
      ['QUAL', 'Coordinateur Qualité',              2026, 150],
      ['CF',   'Conseiller à la Formation',         2025, 200],
      ['CF',   'Conseiller à la Formation',         2026, 300],
      ['INCL', 'Personne de référence EPS inclusif', 2025,  50],
      ['INCL', 'Personne de référence EPS inclusif', 2026,  50],
    ];
    const insEnv = db.prepare("INSERT OR IGNORE INTO enveloppe_externe (code, label, annee_civile, periodes_b) VALUES (?,?,?,?)");
    for (const [code, label, annee_civile, periodes_b] of seedEnv) {
      insEnv.run(code, label, annee_civile, periodes_b);
    }
    console.log('[migration] Pilotage civil : dotation_civile + enveloppe_externe initialisés');
  }

  // Enveloppe spéciale AeSI (hors dotation organique) — illimitée tant qu'aucun pot n'est défini
  try {
    const insAesi = db.prepare("INSERT OR IGNORE INTO enveloppe_externe (code, label, annee_civile, periodes_b, illimite, notes) VALUES (?,?,?,?,?,?)");
    for (const ac of [2025, 2026, 2027]) {
      insAesi.run('AESI', 'AeSI', ac, 0, 1, 'Enveloppe spéciale hors dotation organique — illimitée (pas de pot défini)');
    }
    // S'assurer que les lignes AESI existantes sont bien marquées illimitées
    db.prepare("UPDATE enveloppe_externe SET illimite = 1 WHERE code = 'AESI'").run();
  } catch (e) { console.error('[migration] enveloppe AeSI :', e.message); }

  // Corriger les valeurs '[object Object]' ET les chaînes vides dans quadrimestre_attribue et quadrimestre_cours
  try {
    const a1 = db.prepare("UPDATE attribution SET quadrimestre_attribue = NULL WHERE quadrimestre_attribue = '[object Object]'").run();
    const a2 = db.prepare("UPDATE attribution SET quadrimestre_attribue = NULL WHERE quadrimestre_attribue = ''").run();
    const c1 = db.prepare("UPDATE cours SET quadrimestre_cours = NULL WHERE quadrimestre_cours = '[object Object]'").run();
    const c2 = db.prepare("UPDATE cours SET quadrimestre_cours = NULL WHERE quadrimestre_cours = ''").run();
    if (a1.changes + a2.changes + c1.changes + c2.changes > 0)
      console.log(`[migration] Corrigé quadrimestre : ${a1.changes+a2.changes} attributions, ${c1.changes+c2.changes} cours`);
  } catch(e) { console.error('[migration] fix object Object:', e.message); }
  // (pour que leurs attributions aillent dans l'enveloppe AESI et pas en organique)
  try {
    const updated = db.prepare("UPDATE ue SET pot_code = 'AESI' WHERE section = 'AeSI' AND (pot_code IS NULL OR pot_code != 'AESI')").run();
    if (updated.changes > 0) console.log(`[migration] pot_code=AESI assigné à ${updated.changes} UE AeSI`);
  } catch (e) { console.error('[migration] pot_code AeSI :', e.message); }

  // Trigger : professeur_id NULL → À DÉSIGNER automatiquement
  try {
    const aDesigner = db.prepare("SELECT id FROM professeur WHERE nom = 'À DÉSIGNER' LIMIT 1").get();
    if (aDesigner) {
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS trg_attribution_prof_null_insert
        AFTER INSERT ON attribution
        WHEN NEW.professeur_id IS NULL
        BEGIN
          UPDATE attribution SET professeur_id = ${aDesigner.id} WHERE id = NEW.id;
        END;

        CREATE TRIGGER IF NOT EXISTS trg_attribution_prof_null_update
        AFTER UPDATE ON attribution
        WHEN NEW.professeur_id IS NULL
        BEGIN
          UPDATE attribution SET professeur_id = ${aDesigner.id} WHERE id = NEW.id;
        END;
      `);
    }
  } catch (e) { console.error('[migration] trigger prof NULL :', e.message); }
  try {
    const epts = [
      ['95', 'ExPT — Expertise Pédagogique et Technique'],
      ['96', 'SEtu — Admission, suivi pédagogique et sanction des études'],
      ['97', 'PeSu — Périodes supplémentaires'],
      ['98', 'PSup — Part supplémentaire'],
      ['99', 'CEtu — Conseil des études'],
    ];
    for (const [code, libelle] of epts) {
      db.prepare("INSERT OR IGNORE INTO type_encadrement (code, libelle) VALUES (?, ?)").run(code, libelle);
    }
  } catch (e) { console.error('[migration] codes EPT :', e.message); }

  // Colonnes EPROM dans etablissement
  try {
    db.exec("ALTER TABLE etablissement ADD COLUMN num_etab TEXT");
  } catch(e) {}
  try {
    db.exec("ALTER TABLE etablissement ADD COLUMN num_impl TEXT");
  } catch(e) {}
  try {
    db.exec("ALTER TABLE etablissement ADD COLUMN adresse_impl TEXT");
  } catch(e) {}
  try {
    db.exec("ALTER TABLE etablissement ADD COLUMN num_entreprise TEXT");
  } catch(e) {}
  try {
    db.exec("ALTER TABLE etablissement ADD COLUMN site_web TEXT");
  } catch(e) {}
  try {
    db.exec("ALTER TABLE etablissement ADD COLUMN email_contact TEXT");
  } catch(e) {}
  // Colonnes EV1 (évaluation) et VC1 (visite des copies) par cours — défaut 2h / 1h
  try {
    db.exec("ALTER TABLE cours ADD COLUMN cours_ev1 REAL DEFAULT 2");
  } catch(e) {}
  try {
    db.exec("ALTER TABLE cours ADD COLUMN cours_vc1 REAL DEFAULT 1");
  } catch(e) {}
  try {
    db.exec("ALTER TABLE cours ADD COLUMN cours_complement REAL DEFAULT 0");
  } catch(e) {}

  // Table organisation_ue (Doc A — description des organisations par UE)
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS organisation_ue (
        id                    INTEGER PRIMARY KEY AUTOINCREMENT,
        ue_num                INTEGER NOT NULL,
        section               TEXT NOT NULL,
        annee_scolaire        TEXT NOT NULL,
        num_organisation      INTEGER NOT NULL DEFAULT 1,
        date_debut            TEXT,
        date_fin              TEXT,
        nb_semaines           INTEGER,
        ept_uniquement        INTEGER DEFAULT 0,
        va_uniquement         INTEGER DEFAULT 0,
        sept_tq_7p            INTEGER DEFAULT 0,
        hybride               INTEGER DEFAULT 0,
        prison                INTEGER DEFAULT 0,
        activite_formation    INTEGER DEFAULT 0,
        conseiller_prevention INTEGER DEFAULT 0,
        ue_2_annees_org_prec  INTEGER,
        intervention_ext_type TEXT,
        intervention_ext_50   INTEGER DEFAULT 0,
        UNIQUE(ue_num, section, annee_scolaire, num_organisation)
      );
    `);
  } catch(e) { console.error('[migration] organisation_ue :', e.message); }

  // Corriger pot_code des UEs ME (CF/INCL/QUAL) manquants dans les années précédentes
  try {
    const fixes = [
      [88, 'ME', 'CF'], [90, 'ME', 'INCL'], [92, 'ME', 'QUAL'],
    ];
    for (const [num, sec, pot] of fixes) {
      db.prepare("UPDATE ue SET pot_code=? WHERE ue_num=? AND section=? AND (pot_code IS NULL OR pot_code='organique')")
        .run(pot, num, sec);
    }
  } catch (e) { console.error('[migration] pot_code UEs ME :', e.message); }

  // Créer les enveloppes externes pour l'année civile active si elles n'existent pas encore
  try {
    const anneeActive = db.prepare("SELECT code FROM annee_scolaire WHERE active=1 ORDER BY code DESC LIMIT 1").get()?.code;
    if (anneeActive) {
      const anneeCivile = 2000 + parseInt(anneeActive.split('-')[1]?.slice(-2) || '27');
      const codes = ['QUAL', 'CF', 'INCL', 'AESI'];
      for (const code of codes) {
        const existe = db.prepare("SELECT id FROM enveloppe_externe WHERE code=? AND annee_civile=?").get(code, anneeCivile);
        if (!existe) {
          // Copier depuis l'année précédente si disponible
          const prev = db.prepare("SELECT * FROM enveloppe_externe WHERE code=? AND annee_civile=?").get(code, anneeCivile - 1);
          if (prev) {
            db.prepare("INSERT OR IGNORE INTO enveloppe_externe (code, label, annee_civile, periodes_b) VALUES (?,?,?,?)")
              .run(code, prev.label, anneeCivile, prev.periodes_b);
            console.log(`[migration] enveloppe ${code} ${anneeCivile} créée (copie de ${anneeCivile-1}: ${prev.periodes_b} pér. B)`);
          }
        }
      }
    }
  } catch (e) { console.error('[migration] enveloppes année active :', e.message); }

} catch (e) {
  console.error('[migration] ERREUR :', e.message);
  console.error(e.stack);
  try { db.exec('PRAGMA foreign_keys = ON;'); } catch {}
}

// ─── Seeding des templates de documents — INDÉPENDANT de la migration ───────
// Bloc séparé : même si la migration principale échoue, les templates système
// (Synthèse, Contrat CDD, PV Recours, PV Fraude) sont toujours seedés.
try {
  // S'assurer que la colonne slug existe
  const _ct = db.prepare("PRAGMA table_info(document_template)").all();
  if (!_ct.find(c => c.name === 'slug')) db.exec(`ALTER TABLE document_template ADD COLUMN slug TEXT`);

  // Mettre à jour les slugs des templates existants sans slug (évite les doublons)
  const _cr = db.prepare(`SELECT id FROM document_template WHERE nom = 'Contrat de travail CDD' AND slug IS NULL`).get();
  if (_cr) db.prepare(`UPDATE document_template SET slug = 'contrat-cdd' WHERE id = ?`).run(_cr.id);
  const _sr = db.prepare(`SELECT id FROM document_template WHERE nom = 'Synthèse de section' AND slug IS NULL`).get();
  if (_sr) db.prepare(`UPDATE document_template SET slug = 'synthese-section' WHERE id = ?`).run(_sr.id);

  // Seed : template "Synthèse de section" (si absent — vérifie par slug)
  if (!db.prepare(`SELECT 1 FROM document_template WHERE slug = 'synthese-section'`).get()) {
    const contenuExemple = `<h2 style="text-align: center">Synthèse de section — {{sys.annee}}</h2><h3 style="text-align: center">{{etab.etab_nom}}</h3><p style="text-align: center"><em>Section : {{sys.section}}</em></p><p></p><div data-boucle="resume_section"><p></p></div><p></p><p style="color: #888; font-size: 9pt">Document généré par Lucie le {{sys.date}}</p>`;
    db.prepare(`INSERT INTO document_template (nom, slug, description, contenu, cree_par) VALUES (?, ?, ?, ?, 'Lucie')`).run(
      'Synthèse de section', 'synthese-section',
      'Tableau hiérarchique UE → Cours avec périodes prof et étudiant. Choisissez une section pour générer.',
      contenuExemple
    );
    console.log('[migration] Template "Synthèse de section" créé');
  }

  // Seed : template "Contrat de travail CDD" (si absent)
  const hasContrat = db.prepare(`SELECT 1 FROM document_template WHERE nom = 'Contrat de travail CDD'`).get();
  if (!hasContrat) {
    const contenuContrat = [
      `<h2 style="text-align: center">CONTRAT DE TRAVAIL POUR UNE DURÉE DÉTERMINÉE</h2>`,
      `<p style="text-align: center"><em>Dans l'Enseignement pour adultes (personnel enseignant)</em></p>`,
      `<p></p>`,
      `<p>Entre, d'une part, le Pouvoir Organisateur\u00a0: <strong>{{etab.po_nom}}</strong></p>`,
      `<p><em>(pour l'{{etab.etab_nom}} (en abrégé IIP))</em></p>`,
      `<p>Dont le siège social est situé\u00a0: {{etab.adresse}}</p>`,
      `<p>Numéro matricule FASE\u00a0: {{etab.num_fase}}\u2003|\u2003Matricule ETNIC\u00a0: {{etab.num_ecot}}</p>`,
      `<p>Représenté par\u00a0: <strong>{{etab.gest_prenom}} {{etab.gest_nom}}, {{etab.gest_qualite}}</strong></p>`,
      `<p></p>`,
      `<p>Et,</p>`,
      `<p></p>`,
      `<p>D'autre part,</p>`,
      `<p></p>`,
      `<p><strong>{{prof.nom}} {{prof.prenom}}</strong></p>`,
      `<p>Né(e) le\u00a0: {{prof.date_naissance_fr}}\u2003à {{prof.lieu_naissance}}</p>`,
      `<p>Nationalité\u00a0: {{prof.nationalite}}</p>`,
      `<p>Numéro de registre national\u00a0: {{prof.niss}}</p>`,
      `<p>Matricule enseignant\u00a0: {{prof.matricule}}</p>`,
      `<p>Domicilié(e)\u00a0: {{prof.domicile}}</p>`,
      `<p></p>`,
      `<p><strong>Il est convenu ce qui suit\u00a0:</strong></p>`,
      `<p></p>`,
      `<p><strong>Article 1</strong></p>`,
      `<p>Le membre du personnel est engagé dans un emploi\u00a0/ des emplois vacant(s) au sens de l'article 3 § 1er, § 1er bis et § 1er ter du Décret du 1er février 1993 comportant\u00a0:</p>`,
      `<p>{{contrat.table_attributions}}</p>`,
      `<p>Ces emplois constituent des prestations incomplètes pour l'année académique <strong>{{sys.annee}}</strong>.</p>`,
      `<p></p>`,
      `<p><strong>Article 2.</strong></p>`,
      `<p>Le présent contrat d'engagement est conclu conformément\u00a0:</p>`,
      `<ul><li>au Décret du 1er février 1993 fixant le statut des membres du personnel subsidiés de l'enseignement libre subventionné,</li><li>à la législation en vigueur dans l'enseignement subventionné par la Communauté Française.</li></ul>`,
      `<p>Le Pouvoir organisateur, d'une part, et le membre du personnel, d'autre part, déclarent expressément que le présent contrat, les règles complémentaires éventuellement établies par les Commissions Paritaires compétentes et le règlement de travail constituent un tout indivisible.</p>`,
      `<p></p>`,
      `<p><strong>Article 3.</strong></p>`,
      `<p>Conformément à l'article 3 § 5 du Décret du 1er février 1993, le Pouvoir organisateur déclare avoir opté pour le réseau libre non confessionnel et conformément à l'article 3 § 6 se déclare de caractère non confessionnel.</p>`,
      `<p></p>`,
      `<p><strong>Article 4.</strong></p>`,
      `<p>Conformément à l'article 21 du Décret du 1er février 1993, le membre du personnel s'engage à respecter les obligations qui découlent du caractère spécifique du projet éducatif et du projet pédagogique du pouvoir organisateur (voir annexe).</p>`,
      `<p></p>`,
      `<p><strong>Article 5.</strong></p>`,
      `<p>Conformément aux articles 24 et 25 du 1er février 1993 est déclarée incompatible avec le caractère spécifique du projet éducatif et du projet pédagogique toute occupation qui serait de nature à leur nuire (voir annexe).</p>`,
      `<p></p>`,
      `<p><strong>Article 6.</strong></p>`,
      `<p>Le membre du personnel certifie que sa situation professionnelle correspond à celle décrite dans le document \u00ab\u00a0fonctions actuelles\u00a0\u00bb ci-annexé. Il s'engage à avertir le Pouvoir organisateur de toute modification affectant sa situation professionnelle, par écrit dans les trois jours ouvrables. Le Pouvoir organisateur ne peut en aucun cas être tenu responsable d'éventuelles nouvelles modalités de rémunération entraînées par la/les dite(s) modification(s), conformément au statut pécuniaire.</p>`,
      `<p></p>`,
      `<p><strong>Article 7.</strong></p>`,
      `<p>Les prestations de travail sont fournies selon l'horaire ci-annexé. Le Pouvoir organisateur se réserve le droit de fixer et/ou de modifier l'horaire d'enseignement ou de travail en fonction des besoins et conformément au règlement de travail. De même, les lieux de cours ou de travail pourront être transférés si nécessaire. Le Pouvoir organisateur veillera à se concerter avec les intéressés préalablement à toute modification.</p>`,
      `<p></p>`,
      `<p><strong>Article 8.</strong></p>`,
      `<p>Sans préjudice de la responsabilité contractuelle du Pouvoir organisateur et des dispositions légales relatives au paiement de la rémunération, le montant de celle-ci est égal à la subvention-traitement afférente à l'emploi ou aux emplois exercé(s) par le membre du personnel, dont le(s) barème(s) est/sont déterminé(s) par la Communauté française.</p>`,
      `<p>Cette rémunération sera versée directement au membre du personnel par la Communauté française.</p>`,
      `<p>Toute modification de la subvention-traitement décidée par l'autorité publique à la hausse ou à la baisse lie les parties sans que le membre du personnel puisse faire valoir quelque droit que ce soit à l'égard du Pouvoir organisateur.</p>`,
      `<p></p>`,
      `<p><strong>Article 9.</strong></p>`,
      `<p>Le présent contrat prend fin dans les conditions et selon les modalités définies par les articles 71 à 71nonies du Décret du 1er février 1993 fixant le statut des membres du personnel subsidiés de l'enseignement libre subventionné et/ou selon la législation en vigueur dans l'enseignement subventionné par la Communauté française.</p>`,
      `<p></p>`,
      `<p><strong>Article 10.</strong></p>`,
      `<p>Est annexé à ce contrat le document \u00ab\u00a0contenu des prestations\u00a0\u00bb qui décrit les attendus de l'établissement en termes de charge de travail pour les enseignants. Le membre du personnel accepte la charge de travail qui lui est confiée dans et en dehors de la classe, dans le respect du décret du 1er février 1993.</p>`,
      `<p></p>`,
      `<p><strong>Article 11.</strong></p>`,
      `<p>En cas de litige, seuls les tribunaux du lieu où s'exécute le présent contrat sont compétents.</p>`,
      `<p></p>`,
      `<p>Ainsi établi en double exemplaire, à Bruxelles, le {{sys.date}}</p>`,
      `<p>Chaque partie reconnaissant avoir reçu le sien.</p>`,
      `<p></p>`,
      `<table><tbody><tr>`,
      `<td style="width:50%;vertical-align:top;padding-right:20px"><p><strong>Le travailleur,</strong><br><em>précédé de la mention « lu et approuvé »</em></p><p style="margin-top:60px">{{prof.nom}} {{prof.prenom}}</p></td>`,
      `<td style="width:50%;vertical-align:top;padding-left:20px"><p><strong>Le(s) représentant(s) du Pouvoir organisateur,</strong></p><p style="margin-top:60px">{{etab.gest_prenom}} {{etab.gest_nom}}<br><em>{{etab.gest_qualite}}</em></p></td>`,
      `</tr></tbody></table>`,
      `<p></p>`,
      `<hr>`,
      `<p><strong>Annexes\u00a0: 12</strong></p>`,
      `<ol>`,
      `<li>un exemplaire du Statut (Décret du 1er février 1993) disponible sur le drive</li>`,
      `<li>un exemplaire du règlement de travail tel qu'approuvé conformément à la loi du 08-04-65</li>`,
      `<li>un exemplaire du projet éducatif du pouvoir organisateur (disponible sur le site)</li>`,
      `<li>un exemplaire du projet pédagogique et du projet d'établissement (disponible sur le site)</li>`,
      `<li>le document administratif précisant les fonctions actuelles du membre du personnel signataire du contrat (document EA12)</li>`,
      `<li>l'horaire de travail applicable au membre du personnel (disponible en ligne via hyperplanning)</li>`,
      `<li>un règlement d'ordre intérieur (disponible en ligne)</li>`,
      `<li>un règlement des études (disponible en ligne)</li>`,
      `<li>un exemplaire des programmes et/ou des référentiels à utiliser (disponible sur le drive)</li>`,
      `<li>un document précisant l'endroit où le membre du personnel peut consulter les textes importants régissant l'enseignement en Communauté française (p.\u00a0ex. décret \u00ab\u00a0mission\u00a0\u00bb)</li>`,
      `<li>un exemplaire des décisions éventuelles de la ou des commissions paritaires compétentes</li>`,
      `<li>Le document intitulé \u00ab\u00a0contenu des prestations\u00a0\u00bb.</li>`,
      `</ol>`,
      `<p style="text-align:center;font-size:9pt;color:#888;border-top:1px solid #ccc;padding-top:8px;margin-top:20px">Institut Supérieur de Promotion Sociale Libre Ilya Prigogine\u2003\u2022\u2003PO ASBL Ilya Prigogine\u2003\u2022\u2003FASE 292<br>Campus Erasme\u2003\u2022\u2003Bâtiment P\u2003\u2022\u2003Route de Lennik 808, 1070 Bruxelles\u2003\u2022\u2003T. +32 (0)2 560 29 59</p>`,
    ].join('');
    db.prepare(`INSERT INTO document_template (nom, description, contenu, cree_par) VALUES (?, ?, ?, 'Lucie')`).run(
      'Contrat de travail CDD',
      'Contrat CDD enseignement pour adultes — Articles 1-11, tableau des attributions, coordonnées complètes PO + membre du personnel.',
      contenuContrat
    );
    console.log('[migration] Template "Contrat de travail CDD" créé');
  }

  // ── Seed PV Recours ────────────────────────────────────────────────────────
  if (!db.prepare(`SELECT 1 FROM document_template WHERE slug = 'pv-recours'`).get()) {
    db.prepare(`INSERT INTO document_template (nom, slug, description, contenu, cree_par) VALUES (?, ?, ?, ?, 'Lucie')`).run(
      'PV Recours — Décision motivée',
      'pv-recours',
      'Procès-verbal de décision du CDE sur recours étudiant (Art. 87-91 RDE/ROI). Modifiable dans l\'éditeur.',
      [
        `<h2 style="text-align:center;color:#1F3864">DÉCISION {{pv.type_decision}}<br>DU CONSEIL DES ÉTUDES</h2>`,
        `<p style="text-align:right;font-size:9pt;color:#888">Année académique {{sys.annee}} · {{sys.date}} · <strong>CONFIDENTIEL</strong></p>`,
        `<p></p>`,
        `<p><strong>Objet\u00a0:</strong> Recours contre la décision de refus — UE {{pv.ue_ref}}</p>`,
        `<p><strong>Étudiant·e\u00a0:</strong> {{pv.etudiant}}</p>`,
        `<p><strong>Date de publication des résultats\u00a0:</strong> {{pv.date_publi}}</p>`,
        `<p><strong>Date d'introduction du recours\u00a0:</strong> {{pv.date_recours}}</p>`,
        `{{pv.date_seance}}`,
        `<p></p>`,
        `{{pv.composition}}`,
        `<p></p>`,
        `<h3>VU ET CONSIDÉRANT</h3>`,
        `<p>Vu le Décret du 16 avril 1991 relatif à l'enseignement de promotion sociale, notamment les articles 123ter et 123quater\u00a0;</p>`,
        `<p>Vu le Décret du 27 octobre 2006 organisant les recours dans l'enseignement pour adultes\u00a0;</p>`,
        `<p>Vu le RDE/ROI de l'Institut Ilya Prigogine, année académique {{sys.annee}}, notamment les articles 87 à 91\u00a0;</p>`,
        `<p>Vu la plainte introduite par {{pv.etudiant}} en date du {{pv.date_recours}} concernant la délibération relative à l'UE {{pv.ue_ref}}\u00a0;</p>`,
        `<p>Vu les pièces du dossier\u00a0;</p>`,
        `<p></p>`,
        `{{pv.corps}}`,
        `<p></p>`,
        `{{pv.commentaire}}`,
        `<p></p>`,
        `{{pv.voies_recours}}`,
        `<p></p>`,
        `<p>Fait à Bruxelles, le {{sys.date}}</p>`,
        `<p>Chaque partie reconnaissant avoir reçu le sien.</p>`,
        `<p></p>`,
        `<table><tbody><tr>`,
        `<td style="width:50%;vertical-align:top;padding-right:20px"><p><strong>Le Président du CDE</strong></p><p style="margin-top:60px">___________________________</p></td>`,
        `<td style="width:50%;vertical-align:top;padding-left:20px"><p><strong>Le Directeur</strong></p><p style="margin-top:60px">{{directeur.nom_prenom}}</p></td>`,
        `</tr></tbody></table>`,
        `<p style="text-align:center;font-size:9pt;color:#888;border-top:1px solid #ccc;padding-top:8px;margin-top:20px">Institut Ilya Prigogine\u2003\u2022\u2003direction@institut-prigogine.be\u2003\u2022\u2003+32(0)2 560 29 59</p>`,
      ].join('')
    );
    console.log('[migration] Template "PV Recours" créé (slug: pv-recours)');
  }

  // ── Seed PV Fraude ─────────────────────────────────────────────────────────
  if (!db.prepare(`SELECT 1 FROM document_template WHERE slug = 'pv-fraude'`).get()) {
    db.prepare(`INSERT INTO document_template (nom, slug, description, contenu, cree_par) VALUES (?, ?, ?, ?, 'Lucie')`).run(
      'PV Fraude — Procédure contradictoire',
      'pv-fraude',
      'Procès-verbal de fraude avec procédure contradictoire (Art. 72-75 RDE/ROI). Modifiable dans l\'éditeur.',
      [
        `<h2 style="text-align:center;color:#7B1C1C">PROCÈS-VERBAL DE FRAUDE<br>PROCÉDURE CONTRADICTOIRE — DÉCISION DU CDE</h2>`,
        `<p style="text-align:right;font-size:9pt;color:#888">Année académique {{sys.annee}} · {{sys.date}} · <strong>CONFIDENTIEL</strong></p>`,
        `<p></p>`,
        `<p><strong>Étudiant·e\u00a0:</strong> {{pv.etudiant}}</p>`,
        `<p><strong>UE concernée\u00a0:</strong> UE {{pv.ue_ref}}</p>`,
        `<p><strong>Date de l'épreuve\u00a0:</strong> {{pv.date_examen}}</p>`,
        `<p><strong>Session\u00a0:</strong> {{pv.session}}{{pv.recidive}}</p>`,
        `{{pv.date_seance}}`,
        `<p></p>`,
        `{{pv.composition}}`,
        `<p></p>`,
        `<h3>VU ET CONSIDÉRANT</h3>`,
        `<p>Vu le RDE/ROI de l'Institut Ilya Prigogine, année académique {{sys.annee}}, notamment les articles 72 à 75\u00a0;</p>`,
        `<p>Vu le Décret du 16 avril 1991 relatif à l'enseignement de promotion sociale\u00a0;</p>`,
        `<p>Vu le rapport de fraude établi le {{pv.date_faits}} lors de l'épreuve de l'UE {{pv.ue_ref}}\u00a0;</p>`,
        `<p>Vu la notification adressée à l'étudiant·e le {{pv.date_notification}} l'informant de la fraude constatée et de son droit à une audition (Art. 74 §1 RDE/ROI)\u00a0;</p>`,
        `{{pv.vu_audition}}`,
        `<p>Vu les pièces du dossier\u00a0;</p>`,
        `<p></p>`,
        `<h3>I. FAITS CONSTATÉS</h3>`,
        `{{pv.faits}}`,
        `<p></p>`,
        `<h3>II. PROCÉDURE CONTRADICTOIRE (Art. 74 RDE/ROI)</h3>`,
        `{{pv.procedure_contradictoire}}`,
        `<p></p>`,
        `<h3>III. ANALYSE JURIDIQUE</h3>`,
        `{{pv.analyse_juridique}}`,
        `<p></p>`,
        `<h3>IV. DÉCISION DU CONSEIL DES ÉTUDES</h3>`,
        `{{pv.decision}}`,
        `{{pv.commentaire}}`,
        `<p></p>`,
        `<h3>VOIES DE RECOURS</h3>`,
        `{{pv.voies_recours}}`,
        `<p></p>`,
        `<p>Fait à Bruxelles, le {{sys.date}}</p>`,
        `<p></p>`,
        `<table><tbody><tr>`,
        `<td style="width:50%;vertical-align:top;padding-right:20px"><p><strong>Le Président du CDE</strong></p><p style="margin-top:60px">___________________________</p></td>`,
        `<td style="width:50%;vertical-align:top;padding-left:20px"><p><strong>Le Directeur</strong></p><p style="margin-top:60px">{{directeur.nom_prenom}}</p></td>`,
        `</tr></tbody></table>`,
        `<p style="text-align:center;font-size:9pt;color:#888;border-top:1px solid #ccc;padding-top:8px;margin-top:20px">Institut Ilya Prigogine\u2003\u2022\u2003direction@institut-prigogine.be\u2003\u2022\u2003+32(0)2 560 29 59\u2003\u2022\u2003<strong>CONFIDENTIEL</strong></p>`,
      ].join('')
    );
    console.log('[migration] Template "PV Fraude" créé (slug: pv-fraude)');
  }
} catch (e) {
  console.error('[seed-templates] ERREUR :', e.message);
}

// Recréer les VIEW à chaque démarrage pour qu'elles soient à jour
// quand le schéma évolue (sans nécessiter un init-db complet).
try {
  const schema = readFileSync(resolve(__dirname, 'db/schema.sql'), 'utf8');
  // Extraire et exécuter uniquement les blocs DROP VIEW + CREATE VIEW
  const viewBlocks = schema.match(/DROP VIEW[\s\S]*?CREATE VIEW[\s\S]*?;(?=\s*(DROP|CREATE TRIGGER|--|$))/g);
  if (viewBlocks) {
    for (const block of viewBlocks) {
      try {
        db.exec(block);
      } catch (e) {
        console.warn(`[views] Erreur lors de la recréation d'une vue : ${e.message}`);
      }
    }
    console.log(`[views] ${viewBlocks.length} vue(s) recréée(s)`);
  }
} catch (e) {
  console.warn('[views] Impossible de recréer les vues :', e.message);
}

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || true, credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(morgan('tiny'));

app.get('/api/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// Route publique : infos de base pour la page de connexion
app.get('/api/info', (req, res) => {
  const etab = db.prepare('SELECT etab_nom FROM etablissement WHERE id = 1').get();
  res.json({
    etab_nom: etab?.etab_nom || '',
    version: '1.0.0',
    environnement: process.env.NODE_ENV === 'development' ? 'dev' : 'prod',
  });
});

app.use('/api/auth',         authRoutes);
app.use('/api/attributions', attrRoutes);
app.use('/api/ref',          refRoutes);
app.use('/api/pilotage',     pilotRoutes);
app.use('/api/exports',      exportRoutes);
app.use('/api/planning',     planningRoutes);
app.use('/api/users',        usersRoutes);
app.use('/api/admin',        adminRoutes);
app.use('/api/annees',       anneesRoutes);
app.use('/api/historique',   historiqueRoutes);
app.use('/api/etablissement', etablissementRoutes);
app.use('/api/ea12',          ea12Routes);
app.use('/api/templates',   templateRoutes);
app.use('/api/contrats',    contratsRoutes);
app.use('/api/procedures',    proceduresRoutes);
app.use('/api/planification', planificationRoutes);
app.use('/api/parametres',   parametresRoutes);
app.use('/api/prerequis',      prerequisRoutes);
app.use('/api/planification-ia', planifIARoutes);
app.use('/api/locaux', locauxRoutes);
app.use('/api/nominations', nominationsRoutes);
app.use('/api/sequence',        sequenceRoutes);

// Route logo IIP
import { createRequire as _cr } from 'module';
import { fileURLToPath as _fup } from 'url';
import { dirname as _dn, join as _jn } from 'path';
const _logoPath = _jn(_dn(_fup(import.meta.url)), 'src/services/assets/logo_iip.png');
app.get('/api/logo-iip', (_req, res) => {
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(_logoPath);
});
const _logoBlanc = _jn(_dn(_fup(import.meta.url)), 'src/services/assets/logo_iip_blanc.png');
app.get('/api/logo-iip-blanc', (_req, res) => {
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(_logoBlanc);
});

// Erreurs
app.use((err, req, res, next) => {
  console.error('[ERR]', err);
  res.status(err.status || 500).json({ error: err.message || 'Erreur serveur' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Backend Attributions IIP sur http://localhost:${PORT}`));
