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
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      libelle TEXT NOT NULL UNIQUE,
      ordre   INTEGER DEFAULT 0
    );
  `);
  const count = db.prepare('SELECT COUNT(*) AS n FROM activite_type').get().n;
  if (count === 0) {
    db.exec(`
      INSERT INTO activite_type (id, libelle, ordre) VALUES
        (1, 'Théorie',                1),
        (2, 'Exercices',              2),
        (3, 'Travaux pratiques (TP)', 3),
        (4, 'Laboratoire',            4),
        (5, 'Stage',                  5),
        (6, 'Séminaire',              6),
        (7, 'TFE',                    7);
    `);
    console.log('[migration] Table activite_type initialisée');
  }

  // 2. Ajouter la colonne attribution.activite_id si elle n'existe pas
  const cols = db.prepare("PRAGMA table_info(attribution)").all();
  if (!cols.find(c => c.name === 'activite_id')) {
    db.exec(`ALTER TABLE attribution ADD COLUMN activite_id INTEGER REFERENCES activite_type(id);`);
    console.log('[migration] Colonne attribution.activite_id ajoutée');
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
} catch (e) {
  console.error('[migration] ERREUR :', e.message);
  console.error(e.stack);
  try { db.exec('PRAGMA foreign_keys = ON;'); } catch {}
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

// Erreurs
app.use((err, req, res, next) => {
  console.error('[ERR]', err);
  res.status(err.status || 500).json({ error: err.message || 'Erreur serveur' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Backend Attributions IIP sur http://localhost:${PORT}`));
