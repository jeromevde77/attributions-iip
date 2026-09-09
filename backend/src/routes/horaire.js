// ─────────────────────────────────────────────────────────────────────────────
// Lucie — L'HORAIRE, ET CE QU'IL DÉPENSE
//
// L'horaire n'est pas fait ici. Les coordinations le bâtissent dans
// Hyperplanning, à partir des attributions — et personne ne vérifie ensuite
// que l'horaire dépense bien ce que les attributions ont accordé. Un cours à
// qui l'on a donné vingt périodes peut en recevoir seize à l'horaire, ou
// vingt-quatre ; un cours peut être donné par un autre que son titulaire.
// Cela se découvre en fin d'année, quand la charge ne tombe pas juste.
//
// LUCIE COMPARE, ELLE NE CRÉE PAS ENCORE. C'est délibéré : avant de prétendre
// remplacer un logiciel d'horaire, il faut savoir lire le sien et dire où il
// s'écarte. Le comparateur est la première marche ; la table qu'il remplit —
// une séance datée, avec son heure, son cours, son professeur et son local —
// est exactement celle qu'un créateur d'horaire écrirait. Rien ne sera à
// jeter le jour où Lucie posera les séances elle-même.
//
// TROIS RAPPROCHEMENTS, ET AUCUN N'EST DEVINÉ :
//   — le COURS par son code (246.1, 249…) : c'est la clé de Lucie, elle est
//     exacte ou elle n'est pas ;
//   — le PROFESSEUR par son nom normalisé, en comparant le nom ET le prénom
//     concaténés — « DIAZ VILLAMIL Esteban » ne se coupe pas sur l'espace ;
//   — le LOCAL par son nom, à défaut rien : un local non reconnu reste écrit
//     en clair plutôt que d'être rattaché au hasard.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import multer from 'multer';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';
import { anneeDeTravail } from '../helpers/annee.js';
import { motsDuPdf } from '../lib/motsDuPdf.js';
import { lireHoraire, dureeMinutes } from '../lib/lireHoraireEDT.js';

const r = Router();
const upload = multer({ storage: multer.memoryStorage(),
                        limits: { fileSize: 20 * 1024 * 1024 } });

const clean = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');

export function migrerHoraire(base = db) {
  base.exec(`
    CREATE TABLE IF NOT EXISTS horaire_lot (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      annee_scolaire TEXT NOT NULL,
      classe TEXT, section TEXT, fichier TEXT,
      periode_debut TEXT, periode_fin TEXT,
      nb_seances INTEGER DEFAULT 0,
      importe_le TEXT DEFAULT CURRENT_TIMESTAMP, importe_par TEXT);
    CREATE TABLE IF NOT EXISTS horaire_seance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lot_id INTEGER REFERENCES horaire_lot(id) ON DELETE CASCADE,
      annee_scolaire TEXT NOT NULL, classe TEXT, section TEXT,
      date TEXT NOT NULL, heure_debut TEXT, heure_fin TEXT, minutes INTEGER,
      cours_code TEXT, ue_num INTEGER, matiere TEXT,
      professeur_texte TEXT, professeur_id INTEGER,
      local_texte TEXT,
      source TEXT DEFAULT 'import');
    CREATE INDEX IF NOT EXISTS idx_hs_annee ON horaire_seance(annee_scolaire, classe);
    CREATE INDEX IF NOT EXISTS idx_hs_cours ON horaire_seance(cours_code);
    CREATE INDEX IF NOT EXISTS idx_hs_prof ON horaire_seance(professeur_id);
    CREATE INDEX IF NOT EXISTS idx_hs_date ON horaire_seance(date);
  `);
}

/** L'index des professeurs, par nom+prénom normalisés — et par nom seul. */
function indexProfs() {
  const complet = new Map(), parNom = new Map();
  for (const p of db.prepare('SELECT id, nom, prenom FROM professeur').all()) {
    complet.set(clean(`${p.nom}${p.prenom}`), p);
    (parNom.get(clean(p.nom)) || parNom.set(clean(p.nom), []).get(clean(p.nom))).push(p);
  }
  return (texte) => {
    const k = clean(texte);
    if (!k) return null;
    const exact = complet.get(k);
    if (exact) return { ...exact, methode: 'nom et prénom' };
    // « DIAZ VILLAMIL Esteban » : le nom peut compter plusieurs mots. On essaie
    // chaque coupure possible plutôt que de supposer que le prénom est le
    // dernier mot — l'export écrit le nom en capitales, mais pas toujours.
    const mots = String(texte).trim().split(/\s+/);
    for (let i = 1; i < mots.length; i++) {
      const c = complet.get(clean(mots.slice(0, i).join('') + mots.slice(i).join('')));
      if (c) return { ...c, methode: 'nom et prénom' };
    }
    for (let i = mots.length - 1; i >= 1; i--) {
      const l = parNom.get(clean(mots.slice(0, i).join(' ')));
      if (l?.length === 1) return { ...l[0], methode: 'nom seul' };
      if (l?.length > 1) return { ambigu: true };
    }
    return null;
  };
}

// ── L'IMPORT ────────────────────────────────────────────────────────────────
//
// Deux temps, comme partout : une simulation dit ce qui sera écrit, l'envoi
// l'écrit. Un import remplace le lot précédent de la même classe et de la même
// année — un horaire se corrige, et deux versions superposées ne comparent
// plus rien.
r.post('/import', authRequired, roleRequired('admin', 'directeur',
       'directeur_adjoint', 'editeur'), upload.single('fichier'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'aucun fichier reçu' });
    const an = req.body?.annee || anneeDeTravail(req);
    const simulation = String(req.body?.simulation ?? 'true') !== 'false';

    const lu = lireHoraire(await motsDuPdf(req.file.buffer), an);
    if (!lu.seances.length) {
      return res.status(400).json({
        error: 'aucune séance lue — ce PDF n’a pas la forme d’un emploi du temps '
             + 'Index Éducation (une ligne par séance, colonnes jour / classe / '
             + 'cours / professeur / local)' });
    }

    const trouverProf = indexProfs();
    const coursConnu = new Map(db.prepare(
      'SELECT cours_code, ue_num, cours_nom, section FROM cours WHERE annee_scolaire = ?'
    ).all(an).map(c => [c.cours_code, c]));

    const rapport = { simulation, annee: an, classe: lu.classe,
      seances: lu.seances.length, ecartees: lu.ecartees.length,
      cours_inconnus: [], profs_inconnus: [], sans_code: 0,
      minutes: 0, section: null };

    const prets = lu.seances.map(s => {
      const min = dureeMinutes(s);
      rapport.minutes += min;
      const c = s.cours_code ? coursConnu.get(s.cours_code) : null;
      if (s.cours_code && !c && !rapport.cours_inconnus.includes(s.cours_code)) {
        rapport.cours_inconnus.push(s.cours_code);
      }
      if (!s.cours_code) rapport.sans_code++;
      const p = s.professeur ? trouverProf(s.professeur) : null;
      if (s.professeur && (!p || p.ambigu) && !rapport.profs_inconnus.includes(s.professeur)) {
        rapport.profs_inconnus.push(s.professeur + (p?.ambigu ? ' (homonymes)' : ''));
      }
      if (c?.section && !rapport.section) rapport.section = c.section;
      return { ...s, minutes: min, ue_num: c?.ue_num ?? null,
               professeur_id: p && !p.ambigu ? p.id : null };
    });

    const dates = prets.map(s => s.date).sort();
    rapport.periode = { debut: dates[0], fin: dates[dates.length - 1] };
    rapport.heures = Math.round(rapport.minutes / 6) / 10;
    rapport.rapproches = prets.filter(s => s.professeur_id).length;

    if (simulation) return res.json({ ...rapport, apercu: prets.slice(0, 12) });

    db.transaction(() => {
      const anciens = db.prepare(
        'SELECT id FROM horaire_lot WHERE annee_scolaire = ? AND classe IS ?'
      ).all(an, lu.classe || null);
      for (const a of anciens) {
        db.prepare('DELETE FROM horaire_seance WHERE lot_id = ?').run(a.id);
        db.prepare('DELETE FROM horaire_lot WHERE id = ?').run(a.id);
      }
      rapport.remplaces = anciens.length;

      const lot = db.prepare(`INSERT INTO horaire_lot
        (annee_scolaire, classe, section, fichier, periode_debut, periode_fin,
         nb_seances, importe_par) VALUES (?,?,?,?,?,?,?,?) RETURNING id`)
        .get(an, lu.classe || null, rapport.section, req.file.originalname || null,
             rapport.periode.debut, rapport.periode.fin, prets.length,
             req.user?.email || null);

      const ins = db.prepare(`INSERT INTO horaire_seance
        (lot_id, annee_scolaire, classe, section, date, heure_debut, heure_fin,
         minutes, cours_code, ue_num, matiere, professeur_texte, professeur_id,
         local_texte, source)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'import')`);
      for (const s of prets) {
        ins.run(lot.id, an, s.classe || lu.classe || null, rapport.section, s.date,
                s.heure_debut, s.heure_fin, s.minutes, s.cours_code, s.ue_num,
                s.matiere, s.professeur, s.professeur_id, s.local);
      }
      rapport.lot_id = lot.id;
    })();

    res.json(rapport);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── LES LOTS IMPORTÉS ───────────────────────────────────────────────────────
r.get('/lots', authRequired, (req, res) => {
  const an = req.query.annee || anneeDeTravail(req);
  res.json(db.prepare(`SELECT * FROM horaire_lot WHERE annee_scolaire = ?
    ORDER BY classe, importe_le DESC`).all(an));
});

r.delete('/lot/:id', authRequired, roleRequired('admin', 'directeur',
         'directeur_adjoint'), (req, res) => {
  db.prepare('DELETE FROM horaire_seance WHERE lot_id = ?').run(req.params.id);
  db.prepare('DELETE FROM horaire_lot WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

r.get('/seances', authRequired, (req, res) => {
  const an = req.query.annee || anneeDeTravail(req);
  const classe = req.query.classe || null;
  const sql = `SELECT s.*, p.nom AS prof_nom, p.prenom AS prof_prenom, c.cours_nom
    FROM horaire_seance s
    LEFT JOIN professeur p ON p.id = s.professeur_id
    LEFT JOIN cours c ON c.cours_code = s.cours_code AND c.annee_scolaire = s.annee_scolaire
    WHERE s.annee_scolaire = ?${classe ? ' AND s.classe = ?' : ''}
    ORDER BY s.date, s.heure_debut`;
  res.json(db.prepare(sql).all(...(classe ? [an, classe] : [an])));
});

/**
 * LE COMPARATEUR — l'horaire face aux attributions.
 *
 * Cours par cours : ce que l'horaire pose (séances, heures, qui le donne)
 * contre ce que l'attribution a accordé (le titulaire, sa charge). Quatre
 * verdicts, et chacun se lit sans explication :
 *
 *   concordant       le bon professeur, la charge à peu près dépensée ;
 *   professeur       l'horaire fait donner le cours à un autre ;
 *   heures           le bon professeur, mais la charge n'est pas dépensée ;
 *   hors attribution le cours est à l'horaire sans avoir été attribué.
 *
 * Et l'inverse, qu'on oublie toujours : les cours ATTRIBUÉS QUI N'ONT AUCUNE
 * SÉANCE. Un cours qu'on a payé et que l'horaire ne pose pas ne se voit nulle
 * part — sauf ici.
 *
 * L'ÉCART D'HEURES SE COMPTE EN HEURES DE 60 MINUTES des deux côtés. Une
 * période de Lucie vaut cinquante minutes ; la charge en heures que porte
 * l'attribution fait déjà la conversion, c'est elle qu'on oppose aux minutes
 * réellement posées à l'horaire.
 */
r.get('/comparaison', authRequired, (req, res) => {
  const an = req.query.annee || anneeDeTravail(req);
  const classe = req.query.classe || null;
  const tol = Number(req.query.tolerance ?? 2);      // heures d'écart admises

  const seances = db.prepare(`SELECT * FROM horaire_seance
    WHERE annee_scolaire = ?${classe ? ' AND classe = ?' : ''}`)
    .all(...(classe ? [an, classe] : [an]));

  const attributions = db.prepare(`
    SELECT a.code_cours, a.ue_num, a.professeur_id, p.nom, p.prenom,
           SUM(a.periodes_attribuees + a.autonomie_attribuee) AS periodes,
           SUM(a.charge_en_heures) AS heures
    FROM attribution a LEFT JOIN professeur p ON p.id = a.professeur_id
    WHERE a.annee_scolaire = ? AND a.code_cours IS NOT NULL
    GROUP BY a.code_cours, a.professeur_id
  `).all(an);

  const parCoursAttr = new Map();
  for (const a of attributions) {
    (parCoursAttr.get(a.code_cours) || parCoursAttr.set(a.code_cours, []).get(a.code_cours))
      .push(a);
  }

  const parCoursHor = new Map();
  for (const s of seances) {
    if (!s.cours_code) continue;
    const e = parCoursHor.get(s.cours_code)
      || parCoursHor.set(s.cours_code, { n: 0, minutes: 0, profs: new Map(),
                                         ue_num: s.ue_num, matiere: s.matiere })
        .get(s.cours_code);
    e.n++; e.minutes += s.minutes || 0;
    const k = s.professeur_id || `?${s.professeur_texte || ''}`;
    const q = e.profs.get(k)
      || e.profs.set(k, { id: s.professeur_id, texte: s.professeur_texte, n: 0, minutes: 0 })
        .get(k);
    q.n++; q.minutes += s.minutes || 0;
  }

  const nomsCours = new Map(db.prepare(
    'SELECT cours_code, cours_nom FROM cours WHERE annee_scolaire = ?').all(an)
    .map(c => [c.cours_code, c.cours_nom]));

  const lignes = [];
  for (const [code, h] of parCoursHor) {
    const attr = parCoursAttr.get(code) || [];
    const heuresHoraire = Math.round(h.minutes / 6) / 10;
    const heuresAttr = Math.round((attr.reduce((n, a) => n + (a.heures || 0), 0)) * 10) / 10;
    const profsHoraire = [...h.profs.values()];
    const idsAttr = new Set(attr.map(a => a.professeur_id).filter(Boolean));
    const memeProf = profsHoraire.every(p => p.id && idsAttr.has(p.id));

    let verdict = 'concordant';
    if (!attr.length) verdict = 'hors_attribution';
    else if (!memeProf) verdict = 'professeur';
    else if (Math.abs(heuresHoraire - heuresAttr) > tol) verdict = 'heures';

    lignes.push({
      cours_code: code, ue_num: h.ue_num, cours_nom: nomsCours.get(code) || h.matiere,
      seances: h.n, heures_horaire: heuresHoraire, heures_attribuees: heuresAttr,
      periodes_attribuees: Math.round(attr.reduce((n, a) => n + (a.periodes || 0), 0) * 10) / 10,
      ecart: Math.round((heuresHoraire - heuresAttr) * 10) / 10,
      profs_horaire: profsHoraire.map(p => ({
        id: p.id, nom: p.texte, seances: p.n,
        heures: Math.round(p.minutes / 6) / 10,
        attribue: !!(p.id && idsAttr.has(p.id)) })),
      profs_attribues: attr.map(a => ({
        id: a.professeur_id, nom: a.nom ? `${a.nom} ${a.prenom || ''}`.trim() : null,
        heures: Math.round((a.heures || 0) * 10) / 10 })),
      verdict,
    });
  }

  // LES ATTRIBUTIONS SANS UNE SEULE SÉANCE : la moitié qu'on ne regarde jamais.
  const sansSeance = [];
  for (const [code, attr] of parCoursAttr) {
    if (parCoursHor.has(code)) continue;
    sansSeance.push({
      cours_code: code, ue_num: attr[0].ue_num, cours_nom: nomsCours.get(code) || null,
      heures_attribuees: Math.round(attr.reduce((n, a) => n + (a.heures || 0), 0) * 10) / 10,
      profs: attr.map(a => (a.nom ? `${a.nom} ${a.prenom || ''}`.trim() : 'À désigner')),
    });
  }

  // ── LES COLLISIONS ────────────────────────────────────────────────────────
  //
  // Un professeur ne peut pas être en deux endroits à la même heure, ni deux
  // groupes occuper le même local. Cela ne se voit qu'en comparant TOUTES les
  // classes entre elles — d'où une lecture qui ignore le filtre de classe.
  const toutes = db.prepare(`SELECT * FROM horaire_seance WHERE annee_scolaire = ?`).all(an);
  const chevauche = (a, b) => a.heure_debut < b.heure_fin && b.heure_debut < a.heure_fin;
  const parJour = new Map();
  for (const s of toutes) {
    (parJour.get(s.date) || parJour.set(s.date, []).get(s.date)).push(s);
  }
  const collisions = { professeur: [], local: [] };
  for (const [date, l] of parJour) {
    for (let i = 0; i < l.length; i++) {
      for (let j = i + 1; j < l.length; j++) {
        if (!chevauche(l[i], l[j])) continue;
        const dire = quoi => `${date} ${l[i].heure_debut}–${l[i].heure_fin} · ${quoi}`
          + ` · ${l[i].classe || '?'} (${l[i].cours_code || '—'})`
          + ` et ${l[j].classe || '?'} (${l[j].cours_code || '—'})`;
        if (l[i].professeur_id && l[i].professeur_id === l[j].professeur_id
            && collisions.professeur.length < 40) {
          collisions.professeur.push(dire(l[i].professeur_texte));
        }
        if (l[i].local_texte && l[i].local_texte === l[j].local_texte
            && collisions.local.length < 40) {
          collisions.local.push(dire(l[i].local_texte));
        }
      }
    }
  }

  const ordre = { hors_attribution: 0, professeur: 1, heures: 2, concordant: 3 };
  lignes.sort((a, b) => ordre[a.verdict] - ordre[b.verdict]
    || String(a.cours_code).localeCompare(String(b.cours_code)));

  res.json({
    annee: an, classe, tolerance: tol,
    lignes, sans_seance: sansSeance, collisions,
    sans_code: seances.filter(s => !s.cours_code).map(s => ({
      date: s.date, heure: s.heure_debut, matiere: s.matiere,
      professeur: s.professeur_texte })),
    profs_non_rapproches: [...new Set(seances
      .filter(s => s.professeur_texte && !s.professeur_id)
      .map(s => s.professeur_texte))],
    total: {
      seances: seances.length,
      heures_horaire: Math.round(seances.reduce((n, s) => n + (s.minutes || 0), 0) / 6) / 10,
      concordants: lignes.filter(l => l.verdict === 'concordant').length,
      ecarts: lignes.filter(l => l.verdict !== 'concordant').length,
      sans_seance: sansSeance.length,
    },
  });
});

export default r;
