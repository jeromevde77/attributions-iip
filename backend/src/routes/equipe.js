// ─────────────────────────────────────────────────────────────────────────────
// Lucie — QUI EST LÀ ? (3.1.287)
//
// Charles, 11 octobre 2026, d'après l'idée de Jérôme à l'EPFC : « une tuile, facile à trouver
// dans le tableau de bord ; en cas de souci, on clique et on sait de suite qui est là ou qui
// est de permanence ; si on clique, ça appelle ». Tranché le même jour :
//   · PRÉSENT = le réel s'il existe, sinon le prévu. Chacun a son horaire de la semaine
//     (`equipe_horaire`) ; « J'arrive / Je pars » (`equipe_pointage`) le corrige en direct
//     — maladie, retard, réunion. Un pointage ne vaut que pour le jour même.
//   · LES PERMANENCES sont un tour de rôle daté (`equipe_permanence`) : tel soir, tel samedi,
//     telle personne. La direction et le secrétariat le tiennent.
//   · LE NUMÉRO est celui que chacun choisit d'afficher (`utilisateur.telephone_affiche`) :
//     rien de privé n'apparaît sans son accord.
//   · TOUT LE PERSONNEL voit la tuile — ce sont surtout les enseignants qui, en classe, ont
//     besoin de savoir qui appeler.
// Heures et jours se comptent à BRUXELLES, pas à l'heure du serveur.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired } from '../middleware/auth.js';

const r = Router();
const GERER = ['admin', 'directeur', 'directeur_adjoint', 'secretariat', 'editeur'];
const ROLES = { admin: 'Direction', directeur: 'Direction', directeur_adjoint: 'Direction adjointe', secretariat: 'Secrétariat',
  editeur: 'Secrétariat', coordination: 'Coordination', professeur: 'Enseignant', consultation: 'Consultation' };

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS equipe_horaire (
      id INTEGER PRIMARY KEY AUTOINCREMENT, utilisateur_id INTEGER NOT NULL, jour INTEGER NOT NULL,   -- 1 lundi … 7 dimanche
      debut TEXT NOT NULL, fin TEXT NOT NULL, lieu TEXT);
    CREATE INDEX IF NOT EXISTS idx_equipe_horaire ON equipe_horaire(utilisateur_id, jour);
    CREATE TABLE IF NOT EXISTS equipe_pointage (
      id INTEGER PRIMARY KEY AUTOINCREMENT, utilisateur_id INTEGER NOT NULL, etat TEXT NOT NULL,      -- la | parti
      jour TEXT NOT NULL, heure TEXT NOT NULL, le TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE INDEX IF NOT EXISTS idx_equipe_pointage ON equipe_pointage(jour, utilisateur_id);
    CREATE TABLE IF NOT EXISTS equipe_permanence (
      id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, debut TEXT NOT NULL, fin TEXT NOT NULL,
      utilisateur_id INTEGER NOT NULL, note TEXT, cree_par TEXT, cree_le TEXT DEFAULT (datetime('now')));
    CREATE INDEX IF NOT EXISTS idx_equipe_permanence ON equipe_permanence(date);
  `);
  const cols = db.prepare('PRAGMA table_info(utilisateur)').all().map(c => c.name);
  if (!cols.includes('telephone_affiche')) db.exec('ALTER TABLE utilisateur ADD COLUMN telephone_affiche TEXT');
} catch (e) { console.error('[migration] équipe :', e.message); }

/** Maintenant, à Bruxelles : { date: 'AAAA-MM-JJ', heure: 'HH:MM', jour: 1…7 }. */
function maintenant() {
  const t = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Brussels' });   // « 2026-10-11 14:05:33 »
  const [date, h] = t.split(' ');
  const j = new Date(`${date}T12:00:00Z`).getUTCDay();
  return { date, heure: h.slice(0, 5), jour: j === 0 ? 7 : j };
}
const hhmm = v => (/^\d{2}:\d{2}$/.test(String(v || '')) ? v : null);
const nomDe = u => {
  const n = String(u.nom_complet || u.email || '').trim();
  return n;
};
const personne = u => ({ id: u.id, nom: nomDe(u), role: ROLES[u.role] || u.role, telephone: u.telephone_affiche || null });

/** Ce que la tuile montre : qui est là maintenant, et la permanence du jour. */
r.get('/maintenant', authRequired, (req, res) => {
  const m = maintenant();
  const comptes = new Map(db.prepare('SELECT id, nom_complet, email, role, telephone_affiche FROM utilisateur WHERE COALESCE(actif, 1) = 1').all().map(u => [u.id, u]));
  // Le dernier pointage du jour, par personne.
  const pointes = new Map();
  for (const p of db.prepare('SELECT utilisateur_id, etat, heure FROM equipe_pointage WHERE jour = ? ORDER BY id').all(m.date)) pointes.set(p.utilisateur_id, p);
  const horaires = db.prepare('SELECT utilisateur_id, debut, fin, lieu FROM equipe_horaire WHERE jour = ? ORDER BY debut').all(m.jour);
  const prevuDe = new Map();
  for (const h of horaires) { if (!prevuDe.has(h.utilisateur_id)) prevuDe.set(h.utilisateur_id, []); prevuDe.get(h.utilisateur_id).push(h); }
  const ids = new Set([...pointes.keys(), ...prevuDe.keys()]);
  const presents = [], attendus = [];
  for (const id of ids) {
    const u = comptes.get(id); if (!u) continue;
    const p = pointes.get(id), plages = prevuDe.get(id) || [];
    const dansPlage = plages.find(h => h.debut <= m.heure && m.heure < h.fin);
    const ensuite = plages.find(h => h.debut > m.heure);
    if (p) {
      if (p.etat === 'la') presents.push({ ...personne(u), source: 'pointage', depuis: p.heure, jusqu: dansPlage?.fin || null, lieu: dansPlage?.lieu || null });
      // « Je pars » : absent pour le reste du jour, quoi que dise l'horaire.
    } else if (dansPlage) {
      presents.push({ ...personne(u), source: 'horaire', depuis: dansPlage.debut, jusqu: dansPlage.fin, lieu: dansPlage.lieu || null });
    } else if (ensuite) {
      attendus.push({ ...personne(u), a: ensuite.debut });
    }
  }
  presents.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  attendus.sort((a, b) => a.a.localeCompare(b.a));
  const perm = db.prepare('SELECT * FROM equipe_permanence WHERE date = ? ORDER BY debut').all(m.date)
    .map(p => ({ id: p.id, debut: p.debut, fin: p.fin, note: p.note, en_cours: p.debut <= m.heure && m.heure < p.fin,
      ...(comptes.get(p.utilisateur_id) ? personne(comptes.get(p.utilisateur_id)) : { nom: '—', telephone: null }) }));
  const moiP = pointes.get(req.user.id);
  res.json({ ...m, presents, attendus, permanences: perm,
    moi: { etat: moiP?.etat || null, depuis: moiP?.heure || null, a_un_horaire: db.prepare('SELECT 1 FROM equipe_horaire WHERE utilisateur_id = ? LIMIT 1').get(req.user.id) ? true : false,
      telephone: comptes.get(req.user.id)?.telephone_affiche || '' },
    peut_gerer: GERER.includes(req.user.role) });
});

/** J'arrive / Je pars — pour le jour même. */
r.post('/pointer', authRequired, (req, res) => {
  const etat = req.body?.etat === 'parti' ? 'parti' : 'la';
  const m = maintenant();
  db.prepare('INSERT INTO equipe_pointage (utilisateur_id, etat, jour, heure) VALUES (?,?,?,?)').run(req.user.id, etat, m.date, m.heure);
  res.json({ ok: true, etat, heure: m.heure });
});

/** Mon horaire de la semaine (ou celui d'un autre, pour la direction et le secrétariat). */
r.get('/horaire', authRequired, (req, res) => {
  const uid = req.query.utilisateur && GERER.includes(req.user.role) ? Number(req.query.utilisateur) : req.user.id;
  res.json(db.prepare('SELECT jour, debut, fin, lieu FROM equipe_horaire WHERE utilisateur_id = ? ORDER BY jour, debut').all(uid));
});
r.put('/horaire', authRequired, (req, res) => {
  const uid = req.body?.utilisateur && GERER.includes(req.user.role) ? Number(req.body.utilisateur) : req.user.id;
  const plages = (Array.isArray(req.body?.plages) ? req.body.plages : [])
    .map(p => ({ jour: Number(p.jour), debut: hhmm(p.debut), fin: hhmm(p.fin), lieu: String(p.lieu || '').trim().slice(0, 60) || null }))
    .filter(p => p.jour >= 1 && p.jour <= 7 && p.debut && p.fin && p.debut < p.fin);
  db.transaction(() => {
    db.prepare('DELETE FROM equipe_horaire WHERE utilisateur_id = ?').run(uid);
    const ins = db.prepare('INSERT INTO equipe_horaire (utilisateur_id, jour, debut, fin, lieu) VALUES (?,?,?,?,?)');
    for (const p of plages) ins.run(uid, p.jour, p.debut, p.fin, p.lieu);
  })();
  res.json({ ok: true, plages: plages.length });
});

/** Le numéro que j'accepte d'afficher (vide : aucun). */
r.put('/telephone', authRequired, (req, res) => {
  const t = String(req.body?.telephone || '').replace(/[^\d+ ./()-]/g, '').trim().slice(0, 30);
  db.prepare('UPDATE utilisateur SET telephone_affiche = ? WHERE id = ?').run(t || null, req.user.id);
  res.json({ ok: true, telephone: t || null });
});

/** Le tour de rôle des permanences. */
r.get('/permanences', authRequired, (req, res) => {
  const m = maintenant();
  const l = db.prepare(`SELECT p.*, u.nom_complet, u.email FROM equipe_permanence p LEFT JOIN utilisateur u ON u.id = p.utilisateur_id
    WHERE p.date >= ? ORDER BY p.date, p.debut LIMIT 200`).all(m.date);
  res.json(l.map(p => ({ id: p.id, date: p.date, debut: p.debut, fin: p.fin, note: p.note, utilisateur_id: p.utilisateur_id, nom: p.nom_complet || p.email || '—' })));
});
r.post('/permanences', authRequired, (req, res) => {
  if (!GERER.includes(req.user.role)) return res.status(403).json({ error: 'Le tour de rôle se tient par la direction et le secrétariat.' });
  const b = req.body || {};
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date || '')) ? b.date : null;
  if (!date || !hhmm(b.debut) || !hhmm(b.fin) || !(b.debut < b.fin) || !Number(b.utilisateur_id)) return res.status(400).json({ error: 'Date, heures et personne requises.' });
  // Une même permanence sur plusieurs semaines : « répéter » n fois, de semaine en semaine.
  const fois = Math.min(52, Math.max(1, Number(b.repeter) || 1));
  const ins = db.prepare('INSERT INTO equipe_permanence (date, debut, fin, utilisateur_id, note, cree_par) VALUES (?,?,?,?,?,?)');
  db.transaction(() => {
    for (let k = 0; k < fois; k++) {
      const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 7 * k);
      ins.run(d.toISOString().slice(0, 10), b.debut, b.fin, Number(b.utilisateur_id), String(b.note || '').trim().slice(0, 120) || null, req.user?.nom || req.user?.email || null);
    }
  })();
  res.json({ ok: true, ajoutees: fois });
});
r.delete('/permanences/:id', authRequired, (req, res) => {
  if (!GERER.includes(req.user.role)) return res.status(403).json({ error: 'Réservé.' });
  db.prepare('DELETE FROM equipe_permanence WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});
/** Les personnes qu'on peut mettre de permanence : les comptes actifs hors enseignants. */
r.get('/personnes', authRequired, (req, res) => {
  res.json(db.prepare(`SELECT id, nom_complet, email, role FROM utilisateur WHERE COALESCE(actif, 1) = 1 AND role <> 'professeur' ORDER BY nom_complet`).all()
    .map(u => ({ id: u.id, nom: nomDe(u), role: ROLES[u.role] || u.role })));
});

export default r;
