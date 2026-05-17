import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = process.env.DB_PATH || join(__dirname, '..', 'data', 'attributions.db');
const SCHEMA_PATH = join(__dirname, '..', 'src', 'db', 'schema.sql');

console.log(`[init-db] DB: ${DB_PATH}`);
console.log(`[init-db] Schema: ${SCHEMA_PATH}`);

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

const schema = readFileSync(SCHEMA_PATH, 'utf-8');
db.exec(schema);

console.log('[init-db] OK base initialisee');
db.close();
