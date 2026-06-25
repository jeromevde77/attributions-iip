#!/usr/bin/env node
/**
 * generate-demo-db.js
 * Génère une base SQLite de démo avec des données fictives complètes.
 * Usage : node generate-demo-db.js [chemin/vers/demo-seed.db]
 *
 * À lancer UNE fois sur le NAS après avoir copié ce fichier :
 * node generate-demo-db.js /volume1/docker/attributions-app/backend/data-demo/demo-seed.db
 */

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import bcrypt from 'bcryptjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = process.argv[2] || './demo-seed.db';

console.log(`Génération de la DB démo : ${outPath}`);

const db = new Database(outPath);

// Charger le schéma de base
const schemaPath = join(__dirname, '../backend/src/db/schema.sql');
const schema = readFileSync(schemaPath, 'utf8');
db.exec(schema);

// ── Années scolaires ──────────────────────────────────────────────────────────
db.exec(`
  INSERT OR IGNORE INTO annee_scolaire (code, active) VALUES ('2025-2026', 0);
  INSERT OR IGNORE INTO annee_scolaire (code, active) VALUES ('2026-2027', 1);
`);

// ── Utilisateur démo admin ────────────────────────────────────────────────────
const hash = bcrypt.hashSync('demo1234', 10);
db.prepare(`INSERT OR IGNORE INTO utilisateur (id, email, password_hash, nom_complet, role, actif)
  VALUES (1, 'admin@demo.be', ?, 'Directeur Démo', 'admin', 1)`).run(hash);

// ── Sections ──────────────────────────────────────────────────────────────────
const sections = ['INF', 'OPT', 'PSY', 'TIM'];
for (const s of sections) {
  db.prepare(`INSERT OR IGNORE INTO section (code, libelle) VALUES (?, ?)`).run(s, `Section ${s}`);
}

// ── UEs ───────────────────────────────────────────────────────────────────────
const ues = [
  [101, 'Anatomie et physiologie', 'INF', 'BA1', 'Q1'],
  [102, 'Soins infirmiers fondamentaux', 'INF', 'BA1', 'Q2'],
  [201, 'Optique géométrique', 'OPT', 'BA1', 'Q1'],
  [202, 'Physiopathologie oculaire', 'OPT', 'BA2', 'Q1Q2'],
  [301, 'Psychologie générale', 'PSY', 'BA1', 'Q1'],
  [401, 'Imagerie médicale fondamentale', 'TIM', 'BA1', 'Q1Q2'],
];
for (const [num, nom, sec, bloc, quad] of ues) {
  db.prepare(`INSERT OR IGNORE INTO ue (ue_num, ue_nom, section, ue_niv, ue_quad, ects) VALUES (?,?,?,?,?,6)`)
    .run(num, nom, sec, bloc, quad);
}

// ── Cours ────────────────────────────────────────────────────────────────────
const cours = [
  ['101.1', 101, 'Cours théorique', 'CT', 40],
  ['101.2', 101, 'Travaux pratiques', 'PP', 20],
  ['102.1', 102, 'Cours magistral', 'CT', 36],
  ['201.1', 201, 'Optique théorique', 'CT', 30],
  ['201.2', 201, 'Labos optique', 'PP', 15],
  ['202.1', 202, 'Pathologies oculaires', 'CT', 24],
  ['301.1', 301, 'Intro psychologie', 'CT', 30],
  ['401.1', 401, 'Bases imagerie', 'CT', 40],
  ['401.2', 401, 'TP Imagerie', 'PP', 20],
];
for (const [code, ue, nom, type, dp] of cours) {
  db.prepare(`INSERT OR IGNORE INTO cours (cours_code, ue_num, cours_nom, type_cours, cours_per) VALUES (?,?,?,?,?)`)
    .run(code, ue, nom, type, dp);
}

// ── Professeurs fictifs ───────────────────────────────────────────────────────
const profs = [
  [1, 'MARTIN', 'Sophie', 'sophie.martin@demo-iip.be', 'Uccle'],
  [2, 'DUBOIS', 'Thomas', 'thomas.dubois@demo-iip.be', 'Ixelles'],
  [3, 'LAMBERT', 'Claire', 'claire.lambert@demo-iip.be', 'Bruxelles'],
  [4, 'RENARD', 'Pierre', 'pierre.renard@demo-iip.be', 'Etterbeek'],
  [5, 'SIMON', 'Marie', 'marie.simon@demo-iip.be', 'Schaerbeek'],
  [6, 'LECOMTE', 'Jean', 'jean.lecomte@demo-iip.be', 'Forest'],
  [7, 'DUMONT', 'Isabelle', 'isabelle.dumont@demo-iip.be', 'Molenbeek'],
  [8, 'FONTAINE', 'Lucas', 'lucas.fontaine@demo-iip.be', 'Jette'],
  [9, 'À DÉSIGNER', '', null, null],
];
for (const [id, nom, prenom, mail, commune] of profs) {
  db.prepare(`INSERT OR IGNORE INTO professeur (id, nom, prenom, adresse_mail, commune) VALUES (?,?,?,?,?)`)
    .run(id, nom, prenom, mail, commune);
}

// ── Attributions 2026-2027 ────────────────────────────────────────────────────
const annee = '2026-2027';
const attribs = [
  // [section, ue_num, code_cours, prof_id, groupe, periodes, autonomie, contrat]
  ['INF', 101, '101.1', 1, 'Ts', 40, 5, 'IIP'],
  ['INF', 101, '101.2', 2, 'A', 20, 0, 'IIP'],
  ['INF', 101, '101.2', 2, 'B', 20, 0, 'IIP'],
  ['INF', 102, '102.1', 3, 'Ts', 36, 4, 'IIP'],
  ['OPT', 201, '201.1', 4, 'Ts', 30, 3, 'IIP'],
  ['OPT', 201, '201.2', 5, 'A', 15, 0, 'IIP'],
  ['OPT', 201, '201.2', 5, 'B', 15, 0, 'IIP'],
  ['OPT', 202, '202.1', 4, 'Ts', 24, 3, 'IIP'],
  ['PSY', 301, '301.1', 6, 'Ts', 30, 3, 'IIP'],
  ['TIM', 401, '401.1', 7, 'Ts', 40, 5, 'IIP'],
  ['TIM', 401, '401.2', 8, 'A', 20, 0, 'IIP'],
  ['TIM', 401, '401.2', 8, 'B', 20, 0, 'IIP'],
  // Quelques À DÉSIGNER
  ['INF', 102, '102.1', 9, 'A', 0, 0, 'IIP'],
  ['OPT', 202, '202.1', 9, 'A', 0, 0, 'IIP'],
];

const insAttr = db.prepare(`
  INSERT OR IGNORE INTO attribution
  (annee_scolaire, section, ue_num, code_cours, professeur_id, code, periodes_attribuees, autonomie_attribuee, contrat_mdp, type_cours)
  VALUES (?,?,?,?,?,?,?,?,?,
    (SELECT type_cours FROM cours WHERE cours_code = ?))
`);
for (const [sec, ue, code, prof, gr, per, aut, contrat] of attribs) {
  insAttr.run(annee, sec, ue, code, prof, gr, per, aut, contrat, code);
}

// ── Paramètres de base ────────────────────────────────────────────────────────
db.exec(`
  INSERT OR IGNORE INTO parametre (cle, valeur) VALUES ('etablissement_nom', 'Institut Démo — Lucie');
  INSERT OR IGNORE INTO parametre (cle, valeur) VALUES ('etablissement_ville', 'Bruxelles');
`);

// ── lucie_config ──────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS lucie_config (
    cle TEXT PRIMARY KEY, valeur TEXT NOT NULL, description TEXT
  );
  INSERT OR IGNORE INTO lucie_config (cle, valeur) VALUES (
    'entretien_intro',
    'Bonjour et bienvenue dans cette démonstration de Lucie.\n\nCeci est une instance démo — toutes les données sont fictives et la base est réinitialisée chaque nuit.\n\nVous pouvez explorer toutes les fonctionnalités librement.'
  );
  INSERT OR IGNORE INTO lucie_config (cle, valeur) VALUES (
    'entretien_conclusion',
    'Merci d''avoir exploré cette démo de Lucie.\n\nPour en savoir plus sur l''Institut Ilya Prigogine et Lucie, contactez-nous.'
  );
`);

db.close();
console.log(`✅ DB démo générée : ${outPath}`);
console.log(`   ${profs.length - 1} profs fictifs, ${attribs.length} attributions, ${cours.length} cours`);
