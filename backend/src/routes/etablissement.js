import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';

const r = Router();

const CHAMPS = [
  'po_nom', 'etab_nom', 'adresse', 'type_po', 'sous_type',
  'num_ecot', 'num_fase', 'num_entreprise', 'site_web', 'email_ec', 'email_po',
  'gest_nom', 'gest_prenom', 'gest_qualite', 'gest_tel', 'gest_email',
  'jours_fonctionnement',
];

// Lire les paramètres de l'établissement (ligne unique id=1)
r.get('/', authRequired, (req, res) => {
  const row = db.prepare('SELECT * FROM etablissement WHERE id = 1').get();
  res.json(row || {});
});

// Enregistrer / mettre à jour les paramètres (upsert sur id=1)
r.put('/', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const vals = {};
  for (const c of CHAMPS) vals[c] = (req.body?.[c] ?? null) || null;

  const exists = db.prepare('SELECT 1 FROM etablissement WHERE id = 1').get();
  if (exists) {
    const set = CHAMPS.map(c => `${c} = @${c}`).join(', ');
    db.prepare(`UPDATE etablissement SET ${set} WHERE id = 1`).run(vals);
  } else {
    const cols = CHAMPS.join(', ');
    const ph = CHAMPS.map(c => `@${c}`).join(', ');
    db.prepare(`INSERT INTO etablissement (id, ${cols}) VALUES (1, ${ph})`).run(vals);
  }
  res.json({ ok: true });
});

export default r;
