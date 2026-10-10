import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';
import { LOGO_IIP_JPEG } from '../services/assets/logo_iip_jpeg.js';
import { LOGO_IIP_BLANC_B64 } from '../services/assets/logo_iip_blanc.js';
import { SIGNATURE_SOHET, SCEAU_IIP } from '../services/assets/signature_sohet.js';

const r = Router();

/* PLUSIEURS ÉTABLISSEMENTS (3.1.253, Charles, 10 octobre 2026 : « il faut pouvoir
 * avoir deux établissements — HELB et IIP, ou deux établissements pour adultes
 * comme l'EPFC ou Soralia — gérés par le même conseil d'administration ; chacun
 * ses étudiants, ou un mélange comme ici »). La table était verrouillée sur une
 * ligne (CHECK id = 1) ; elle en accepte plusieurs. L'IIP RESTE LA LIGNE 1 : les
 * dix-neuf lecteurs qui écrivent `WHERE id = 1` ou `LIMIT 1` continuent de le
 * trouver. Chaque établissement porte ses images — logo couleur, logo blanc,
 * signature de la direction, cachet — en data URL, et chaque SECTION est
 * rattachée à un établissement (`section.etablissement_id`, 1 par défaut) : c'est
 * par les sections que les étudiants, le personnel et les pièces s'y rattachent,
 * et le périmètre par section cloisonne déjà ce qui doit l'être. */
export function migrerEtablissements(base = db) {
  try {
    const sql = base.prepare("SELECT sql FROM sqlite_master WHERE name = 'etablissement'").get()?.sql || '';
    if (/CHECK\s*\(\s*id\s*=\s*1\s*\)/i.test(sql)) {
      const cols = base.prepare('PRAGMA table_info(etablissement)').all().map(c => c.name).filter(c => c !== 'id');
      base.transaction(() => {
        base.exec(`CREATE TABLE etablissement_n (id INTEGER PRIMARY KEY AUTOINCREMENT, ${cols.map(c => `${c} ${c === 'jours_fonctionnement' ? 'INTEGER' : 'TEXT'}`).join(', ')})`);
        base.exec(`INSERT INTO etablissement_n (id, ${cols.join(', ')}) SELECT id, ${cols.join(', ')} FROM etablissement`);
        base.exec('DROP TABLE etablissement');
        base.exec('ALTER TABLE etablissement_n RENAME TO etablissement');
      })();
    }
    const ont = new Set(base.prepare('PRAGMA table_info(etablissement)').all().map(c => c.name));
    for (const [c, t] of [['code', 'TEXT'], ['nom_court', 'TEXT'], ['logo', 'TEXT'], ['logo_blanc', 'TEXT'], ['signature', 'TEXT'], ['cachet', 'TEXT'], ['signataire', 'TEXT']])
      if (!ont.has(c)) base.exec(`ALTER TABLE etablissement ADD COLUMN ${c} ${t}`);
    const sec = new Set(base.prepare('PRAGMA table_info(section)').all().map(c => c.name));
    if (sec.size && !sec.has('etablissement_id')) base.exec('ALTER TABLE section ADD COLUMN etablissement_id INTEGER NOT NULL DEFAULT 1');
    base.prepare("UPDATE etablissement SET code = COALESCE(code, 'IIP'), nom_court = COALESCE(nom_court, 'IIP') WHERE id = 1").run();
  } catch (e) { console.error('[migration] établissements :', e.message); }
}
migrerEtablissements();

const IMAGES = ['logo', 'logo_blanc', 'signature', 'cachet'];
/* UNE IMAGE SE VÉRIFIE À SES OCTETS, pas à son nom : PNG, JPEG, WebP ou SVG, 2 Mo au
   plus ; un SVG ne passe que sans script ni gestionnaire d'événement. */
function imageValide(v) {
  if (v === null || v === '') return { ok: true, v: null };
  const m = /^data:(image\/(png|jpeg|webp|svg\+xml));base64,([A-Za-z0-9+/=]+)$/.exec(String(v));
  if (!m) return { ok: false, err: 'Image attendue : PNG, JPEG, WebP ou SVG.' };
  const buf = Buffer.from(m[3], 'base64');
  if (buf.length > 2 * 1024 * 1024) return { ok: false, err: 'Image trop lourde (2 Mo au plus).' };
  const t = m[2];
  const sig = t === 'png' ? buf.subarray(0, 4).toString('hex') === '89504e47'
    : t === 'jpeg' ? buf.subarray(0, 3).toString('hex') === 'ffd8ff'
    : t === 'webp' ? buf.subarray(8, 12).toString() === 'WEBP'
    : /<svg[\s>]/i.test(buf.toString('utf8')) && !/<script|\son\w+\s*=|javascript:/i.test(buf.toString('utf8'));
  return sig ? { ok: true, v } : { ok: false, err: 'Le contenu ne correspond pas au type d’image annoncé.' };
}

const CHAMPS = [
  'po_nom', 'etab_nom', 'adresse', 'type_po', 'sous_type',
  'num_ecot', 'num_fase', 'num_entreprise', 'site_web', 'email_contact', 'email_ec', 'email_po',
  'gest_nom', 'gest_prenom', 'gest_qualite', 'gest_tel', 'gest_email',
  'jours_fonctionnement',
];

// Les images d'un établissement — importées, ou à défaut celles d'origine (pour l'établissement 1).
r.get('/images', authRequired, (req, res) => {
  const id = Number(req.query.id) || 1;
  const i = db.prepare('SELECT logo, logo_blanc, signature, cachet FROM etablissement WHERE id = ?').get(id) || {};
  const repli = id === 1 ? { logo: LOGO_IIP_JPEG, logo_blanc: LOGO_IIP_BLANC_B64, signature: SIGNATURE_SOHET, cachet: SCEAU_IIP } : {};
  res.set('Cache-Control', 'private, max-age=300');
  res.json({ logo: i.logo || repli.logo || '', logo_blanc: i.logo_blanc || repli.logo_blanc || '',
    signature: i.signature || repli.signature || '', cachet: i.cachet || repli.cachet || '' });
});
// La liste des établissements, sans les images (légère), et leurs sections.
r.get('/liste', authRequired, (req, res) => {
  const etabs = db.prepare(`SELECT id, code, nom_court, etab_nom, po_nom, num_ecot, num_fase,
      (logo IS NOT NULL) a_logo, (logo_blanc IS NOT NULL) a_logo_blanc, (signature IS NOT NULL) a_signature, (cachet IS NOT NULL) a_cachet
    FROM etablissement ORDER BY id`).all();
  const sections = db.prepare('SELECT code, libelle, COALESCE(etablissement_id, 1) etablissement_id FROM section ORDER BY code').all();
  res.json({ etablissements: etabs, sections });
});
// Un établissement (id=1 par défaut — l'IIP, comme avant).
r.get('/', authRequired, (req, res) => {
  const row = db.prepare('SELECT * FROM etablissement WHERE id = ?').get(Number(req.query.id) || 1);
  res.json(row || {});
});
// Créer un établissement : un nom suffit, le reste se complète ensuite.
r.post('/', authRequired, roleRequired('admin'), (req, res) => {
  const nom = String(req.body?.etab_nom || '').trim(), code = String(req.body?.code || '').trim().toUpperCase();
  if (!nom || !code) return res.status(400).json({ error: 'Un nom et un code court (ex. HELB, EPFC).' });
  if (db.prepare('SELECT 1 FROM etablissement WHERE UPPER(code) = ?').get(code)) return res.status(409).json({ error: `Le code ${code} existe déjà.` });
  const id = db.prepare('INSERT INTO etablissement (code, nom_court, etab_nom) VALUES (?,?,?)').run(code, code, nom).lastInsertRowid;
  res.json({ ok: true, id });
});
// Retirer un établissement : jamais le premier, et jamais s'il porte encore des sections.
r.delete('/:id', authRequired, roleRequired('admin'), (req, res) => {
  const id = Number(req.params.id);
  if (id === 1) return res.status(400).json({ error: 'Le premier établissement ne se retire pas.' });
  const n = db.prepare('SELECT COUNT(*) n FROM section WHERE etablissement_id = ?').get(id).n;
  if (n) return res.status(409).json({ error: `${n} section(s) y sont rattachées : rattachez-les ailleurs d’abord.` });
  db.prepare('DELETE FROM etablissement WHERE id = ?').run(id);
  res.json({ ok: true });
});
// Rattacher des sections à un établissement.
r.put('/:id/sections', authRequired, roleRequired('admin'), (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT 1 FROM etablissement WHERE id = ?').get(id)) return res.status(404).json({ error: 'Établissement inconnu' });
  const codes = Array.isArray(req.body?.sections) ? req.body.sections.map(String) : [];
  const maj = db.prepare('UPDATE section SET etablissement_id = ? WHERE code = ?');
  db.transaction(() => { for (const c of codes) maj.run(id, c); })();
  res.json({ ok: true });
});

// Enregistrer / mettre à jour les paramètres (upsert sur id=1)
r.put('/', authRequired, roleRequired('admin', 'editeur'), async (req, res) => {
  const id = Number(req.query.id || req.body?.id) || 1;
  const vals = {};
  for (const c of [...CHAMPS, 'code', 'nom_court', 'signataire']) vals[c] = (req.body?.[c] ?? null) || null;
  if (id === 1) { vals.code = vals.code || 'IIP'; vals.nom_court = vals.nom_court || vals.code; }
  // Les images : seules celles ENVOYÉES changent ; chacune est vérifiée à ses octets. Réservé à l'administrateur.
  const images = {};
  const avant = db.prepare(`SELECT ${IMAGES.join(', ')} FROM etablissement WHERE id = ?`).get(id) || {};
  for (const k of IMAGES) if (Object.prototype.hasOwnProperty.call(req.body || {}, k) && (req.body[k] || null) !== (avant[k] || null)) {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Seul l’administrateur change les images.' });
    const v = imageValide(req.body[k]);
    if (!v.ok) return res.status(400).json({ error: `${k} : ${v.err}` });
    images[k] = v.v;
  }
  const exists = db.prepare('SELECT 1 FROM etablissement WHERE id = ?').get(id);
  const champs = [...CHAMPS, 'code', 'nom_court', 'signataire'];
  if (exists) {
    db.prepare(`UPDATE etablissement SET ${champs.map(c => `${c} = @${c}`).join(', ')} WHERE id = @id`).run({ ...vals, id });
  } else {
    db.prepare(`INSERT INTO etablissement (id, ${champs.join(', ')}) VALUES (@id, ${champs.map(c => `@${c}`).join(', ')})`).run({ ...vals, id });
  }
  for (const [k, v] of Object.entries(images)) db.prepare(`UPDATE etablissement SET ${k} = ? WHERE id = ?`).run(v, id);
  if (Object.keys(images).length && id === 1) { const { appliquerIdentite } = await import('../lib/identite.js'); appliquerIdentite(); }
  res.json({ ok: true });
});

export default r;
