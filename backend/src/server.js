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

  // Nettoyage : supprimer l'ancienne table membres_cde si elle existe
  try { db.exec(`DROP TABLE IF EXISTS membres_cde`); } catch { /* ignoré */ }
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
app.use('/api/procedures',  proceduresRoutes);

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
