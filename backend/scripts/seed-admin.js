import bcrypt from 'bcryptjs';
import db from '../src/db/index.js';

const email = process.argv[2] || 'admin@institut-prigogine.be';
const password = process.argv[3] || 'admin123';
const nom = process.argv[4] || 'Administrateur';

const hash = bcrypt.hashSync(password, 10);
const stmt = db.prepare(`
  INSERT INTO utilisateur (email, password_hash, nom_complet, role, actif)
  VALUES (?, ?, ?, 'admin', 1)
  ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, role = 'admin', actif = 1
`);
stmt.run(email, hash, nom);
console.log(`✅ Admin créé/mis à jour : ${email} / ${password}`);
db.close();
