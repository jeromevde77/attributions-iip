// Usage: node /app/scripts/import-ues.js
// Lit /tmp/ues_export.json et fait un INSERT OR REPLACE dans la DB courante.
import Database from 'better-sqlite3';
import { readFileSync, existsSync } from 'fs';

const JSON_PATH = '/tmp/ues_export.json';
if (!existsSync(JSON_PATH)) {
  console.error('Fichier introuvable :', JSON_PATH);
  console.error('Lancer export-ues.js depuis le conteneur dev puis faire docker cp.');
  process.exit(1);
}

const ues = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
if (!ues.length) { console.error('JSON vide'); process.exit(1); }

const db = new Database('/app/data/attributions.db');
const cols = Object.keys(ues[0]);
const stmt = db.prepare(
  `INSERT OR REPLACE INTO ue (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`
);
db.transaction(() => ues.forEach(u => stmt.run(Object.values(u))))();
db.close();

console.log(`\u2713 ${ues.length} UE importées en prod :`);
ues.forEach(u => console.log(`  - UE ${u.ue_num} (${u.annee_scolaire}) : ${u.ue_nom}`));
