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
  // `transaction` MANQUAIT À CETTE DOUBLURE, et une trentaine de fichiers
  // l'appellent. Quand better-sqlite3 ne se compile pas — ce qui arrive dès
  // qu'on change de version de Node —, le repli prenait la main et toutes ces
  // routes tombaient sur « db.transaction is not a function ». Une doublure
  // qui n'offre pas la même surface que l'objet qu'elle remplace n'est pas un
  // repli : c'est une panne différée.
  //
  // SAVEPOINT plutôt que BEGIN, pour la même raison que better-sqlite3 le
  // fait : une transaction appelée depuis une autre doit s'imbriquer au lieu
  // d'échouer.
  let profondeur = 0;
  const transaction = (fn) => (...args) => {
    const nom = `sp_${profondeur}`;
    inner.exec(profondeur === 0 ? 'BEGIN' : `SAVEPOINT ${nom}`);
    profondeur++;
    try {
      const r = fn(...args);
      profondeur--;
      inner.exec(profondeur === 0 ? 'COMMIT' : `RELEASE ${nom}`);
      return r;
    } catch (e) {
      profondeur--;
      try { inner.exec(profondeur === 0 ? 'ROLLBACK' : `ROLLBACK TO ${nom}`); } catch { /* déjà défaite */ }
      throw e;
    }
  };

  db = {
    exec: (sql) => inner.exec(sql),
    pragma: (p) => inner.exec(`PRAGMA ${p}`),
    transaction,
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
