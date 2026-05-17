import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || resolve(__dirname, '../../data/attributions.db');

let db;
try {
  const Database = (await import('better-sqlite3')).default;
  db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
} catch {
  const { DatabaseSync } = await import('node:sqlite');
  const inner = new DatabaseSync(DB_PATH);
  inner.exec('PRAGMA foreign_keys = ON');
  inner.exec('PRAGMA journal_mode = WAL');
  function flatten(args) {
    if (args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
      return [args[0]];
    }
    return args;
  }
  db = {
    exec: (sql) => inner.exec(sql),
    pragma: (p) => inner.exec(`PRAGMA ${p}`),
    prepare: (sql) => {
      const stmt = inner.prepare(sql);
      return {
        get: (...args) => stmt.get(...flatten(args)),
        all: (...args) => stmt.all(...flatten(args)),
        run: (...args) => {
          const r = stmt.run(...flatten(args));
          return { lastInsertRowid: Number(r.lastInsertRowid), changes: r.changes };
        }
      };
    }
  };
}

export function runSchema() {
  const sql = readFileSync(resolve(__dirname, 'schema.sql'), 'utf8');
  db.exec(sql);
  console.log(`[db] Schéma appliqué sur ${DB_PATH}`);
}

export { db };
export default db;
