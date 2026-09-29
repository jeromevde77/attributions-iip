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
import { authRequired, roleRequired, getUserSections } from '../middleware/auth.js';
import { niveauxEffectifs } from './capitalisation.js';
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
  /* L'ÉDITEUR D'HORAIRE (28 septembre 2026) : la table avait été pensée pour
     qu'un créateur d'horaire l'écrive un jour — « rien ne sera à jeter ». Il
     lui manquait le groupe, la trace de qui a posé ou déplacé, l'annulation,
     et la marque qui protège une séance retouchée dans Lucie d'un import. */
  const cols = base.prepare('PRAGMA table_info(horaire_seance)').all().map(c => c.name);
  for (const [nom, type] of [['groupe_id', 'INTEGER'], ['annule', 'INTEGER NOT NULL DEFAULT 0'],
    ['commentaire', 'TEXT'], ['modifie_lucie', 'INTEGER NOT NULL DEFAULT 0'], ['cree_par', 'TEXT'],
    ['cree_le', 'TEXT'], ['modifie_par', 'TEXT'], ['modifie_le', 'TEXT'], ['bloc', 'TEXT'], ['sous_groupe', 'TEXT']]) {
    if (!cols.includes(nom)) base.exec(`ALTER TABLE horaire_seance ADD COLUMN ${nom} ${type}`);
  }
  base.exec('CREATE INDEX IF NOT EXISTS idx_hs_groupe ON horaire_seance(groupe_id)');
  /* LE NOM D'HYPERPLANNING N'EST PAS TOUJOURS CELUI DE LUCIE (Charles, 29
     septembre 2026 : « ELJASZUK » dans l'export, « ELJASUK » dans Lucie, et
     c'est Lucie qui a raison). On ne corrige pas une donnée juste pour
     satisfaire un fichier : on dit une fois pour toutes que ce texte-là
     désigne cette personne-là, et chaque import le relit. */
  base.exec(`CREATE TABLE IF NOT EXISTS horaire_alias_prof (
    texte TEXT PRIMARY KEY, texte_brut TEXT,
    professeur_id INTEGER NOT NULL REFERENCES professeur(id) ON DELETE CASCADE,
    pose_par TEXT, pose_le TEXT DEFAULT (datetime('now')))`);
}

/** L'index des professeurs, par nom+prénom normalisés — et par nom seul. */
function indexProfs() {
  const complet = new Map(), parNom = new Map();
  for (const p of db.prepare('SELECT id, nom, prenom FROM professeur').all()) {
    complet.set(clean(`${p.nom}${p.prenom}`), p);
    (parNom.get(clean(p.nom)) || parNom.set(clean(p.nom), []).get(clean(p.nom))).push(p);
  }
  const alias = new Map();
  try {
    const parId = new Map(db.prepare('SELECT id, nom, prenom FROM professeur').all().map(p => [p.id, p]));
    for (const a of db.prepare('SELECT texte, professeur_id FROM horaire_alias_prof').all()) {
      if (parId.has(a.professeur_id)) alias.set(a.texte, parId.get(a.professeur_id));
    }
  } catch { /* table absente */ }
  return (texte) => {
    const k = clean(texte);
    if (!k) return null;
    if (alias.has(k)) return { ...alias.get(k), methode: 'correspondance enregistrée' };
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

/* ══ L'ÉDITEUR D'HORAIRE — LA SEMAINE, LES TUILES, LE BAC ════════════════════
 *
 * Demandé par Charles le 28 septembre 2026 : « copier le fonctionnement
 * d'Hyperplanning, mais en plus simple ; une grille qui montre la semaine, des
 * tuiles déplaçables pour les blocs de 2 h ou 1 h, sur base des attributions
 * et des groupes ». Deux usages sont à prévoir, sans savoir encore lequel
 * l'emportera : Lucie comme outil d'horaire, ou Lucie à côté d'Hyperplanning.
 * D'où la marque `modifie_lucie` : une séance posée ou retouchée ici n'est
 * jamais écrasée par un import, qui signalera l'écart.
 *
 * LA CLASSE, c'est une section et un bloc (« Optométrie BA1 ») — ce que
 * l'horaire d'Hyperplanning appelle « OPTO B1 ». Ses unités sont celles dont
 * le niveau effectif, dans la section, est ce bloc.
 *
 * LE BAC dit ce qui reste à poser, groupe par groupe : les heures attribuées au
 * groupe, moins celles déjà posées sur l'année. Quand la planification porte
 * les heures prévues pour la semaine, il le dit aussi — c'est elle qui
 * répartit l'année en semaines.
 *
 * UN CONFLIT SE NOMME, IL NE S'EMPÊCHE PAS : le même professeur, le même
 * local, ou la même classe au même moment. Deux sous-groupes d'un même cours
 * peuvent avoir cours ensemble — c'est ainsi qu'un labo se dédouble.
 */
const EDITEURS = ['admin', 'directeur', 'directeur_adjoint', 'editeur'];
const qui = req => req.user?.email || req.user?.nom || null;
const hm = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
const deHm = n => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
const iso = d => d.toISOString().slice(0, 10);
const ajouterJours = (dateIso, n) => { const d = new Date(dateIso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const lundiDe = dateIso => { const d = new Date(dateIso + 'T12:00:00Z'); const j = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - j); return iso(d); };

/* LES JOURS FÉRIÉS se calculent : dates fixes, et celles qui suivent Pâques.
   Le 27 septembre est la fête de la Fédération Wallonie-Bruxelles. */
function paques(an) {
  const a = an % 19, b = Math.floor(an / 100), c = an % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31), jour = ((h + l - 7 * m + 114) % 31) + 1;
  return `${an}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
}
export function joursFeries(an) {
  const p = paques(an);
  return new Map([
    [`${an}-01-01`, 'Nouvel an'], [ajouterJours(p, 1), 'Lundi de Pâques'], [`${an}-05-01`, 'Fête du travail'],
    [ajouterJours(p, 39), 'Ascension'], [ajouterJours(p, 50), 'Lundi de Pentecôte'], [`${an}-07-21`, 'Fête nationale'],
    [`${an}-08-15`, 'Assomption'], [`${an}-09-27`, 'Fête de la Fédération Wallonie-Bruxelles'],
    [`${an}-11-01`, 'Toussaint'], [`${an}-11-11`, 'Armistice'], [`${an}-12-25`, 'Noël'],
  ]);
}

/** Les unités d'une classe (section + bloc), l'année donnée. */
function unitesDeClasse(section, bloc, annee) {
  const niv = niveauxEffectifs([section], annee);
  return new Set(Object.entries(niv).filter(([, v]) => String(v).toUpperCase() === String(bloc).toUpperCase()).map(([k]) => Number(k)));
}

// Les classes : chaque section et chaque bloc où des groupes existent.
r.get('/classes', authRequired, (req, res) => {
  const an = req.query.annee || anneeDeTravail(req);
  const perim = getUserSections(req.user);
  const out = new Map();
  const secs = db.prepare('SELECT DISTINCT section FROM groupe WHERE annee_scolaire = ? AND section IS NOT NULL').all(an).map(x => x.section);
  for (const sec of secs) {
    if (perim && !perim.includes(sec)) continue;
    const niv = niveauxEffectifs([sec], an);
    for (const g of db.prepare('SELECT DISTINCT ue_num FROM groupe WHERE annee_scolaire = ? AND section = ?').all(an, sec)) {
      const b = String(niv[g.ue_num] || '').toUpperCase();
      if (!b) continue;
      out.set(`${sec}|${b}`, { cle: `${sec}|${b}`, section: sec, bloc: b, libelle: `${sec} ${b}` });
    }
  }
  res.json([...out.values()].sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr')));
});

// Les professeurs qui ont un groupe cette année, et les locaux.
r.get('/referentiel', authRequired, (req, res) => {
  const an = req.query.annee || anneeDeTravail(req);
  const profs = db.prepare(`SELECT DISTINCT p.id, p.nom, p.prenom FROM professeur p
    JOIN groupe g ON g.professeur_id = p.id AND g.annee_scolaire = ? ORDER BY p.nom, p.prenom`).all(an);
  let locaux = [];
  try { locaux = db.prepare('SELECT nom, type, places FROM local ORDER BY nom').all(); } catch { /* table absente */ }
  res.json({ profs, locaux });
});

/* Le nom du cours : celui de l'année de la séance, sinon le plus récent. PAS DE
   COLONNE EXTÉRIEURE DANS UN ORDER BY de sous-requête : le SQLite du serveur
   la refuse (« no such column »), celui du poste de développement l'accepte. */
const SEANCE_SQL = `SELECT s.*, p.nom AS prof_nom, p.prenom AS prof_prenom, g.nom AS groupe_nom,
    COALESCE((SELECT cours_nom FROM cours c WHERE c.cours_code = s.cours_code AND c.annee_scolaire = s.annee_scolaire LIMIT 1),
      (SELECT cours_nom FROM cours c WHERE c.cours_code = s.cours_code ORDER BY c.annee_scolaire DESC LIMIT 1)) AS cours_nom
  FROM horaire_seance s LEFT JOIN professeur p ON p.id = s.professeur_id LEFT JOIN groupe g ON g.id = s.groupe_id`;

/** Les conflits d'un ensemble de séances d'un même jour. */
function conflitsDe(seances) {
  const sansLocal = l => !l || /distanciel|à distance|en ligne/i.test(l);
  const out = new Map();
  const ajouter = (s, raison) => { if (!out.has(s.id)) out.set(s.id, new Set()); out.get(s.id).add(raison); };
  const actives = seances.filter(s => !s.annule);
  for (let i = 0; i < actives.length; i++) for (let j = i + 1; j < actives.length; j++) {
    const a = actives[i], b = actives[j];
    if (a.date !== b.date || !(hm(a.heure_debut) < hm(b.heure_fin) && hm(b.heure_debut) < hm(a.heure_fin))) continue;
    if (a.professeur_id && a.professeur_id === b.professeur_id) { ajouter(a, 'professeur'); ajouter(b, 'professeur'); }
    if (!sansLocal(a.local_texte) && a.local_texte === b.local_texte) { ajouter(a, 'local'); ajouter(b, 'local'); }
    const memeClasse = a.section && a.section === b.section && a.bloc && a.bloc === b.bloc;
    // Deux sous-groupes de la classe travaillent en parallèle : ce n'est pas un conflit.
    const sousGroupes = (a.cours_code === b.cours_code && a.groupe_id !== b.groupe_id)
      || (a.sous_groupe && b.sous_groupe && a.sous_groupe !== b.sous_groupe);
    if (memeClasse && !sousGroupes) { ajouter(a, 'classe'); ajouter(b, 'classe'); }
  }
  return out;
}

// LA SEMAINE — une vue par classe, par professeur ou par local.
r.get('/semaine', authRequired, (req, res) => {
  const an = req.query.annee || anneeDeTravail(req);
  const lundi = lundiDe(String(req.query.lundi || iso(new Date())));
  const dimanche = ajouterJours(lundi, 6);
  const vue = ['classe', 'professeur', 'local'].includes(req.query.vue) ? req.query.vue : 'classe';
  const cle = String(req.query.cle || '');
  let where = '', args = [];
  if (vue === 'classe') { const [sec, bloc] = cle.split('|'); where = 's.section = ? AND s.bloc = ?'; args = [sec, bloc]; }
  if (vue === 'professeur') { where = 's.professeur_id = ?'; args = [Number(cle)]; }
  if (vue === 'local') { where = 's.local_texte = ?'; args = [cle]; }
  const seances = cle ? db.prepare(`${SEANCE_SQL} WHERE s.annee_scolaire = ? AND s.date BETWEEN ? AND ? AND ${where}
    ORDER BY s.date, s.heure_debut`).all(an, lundi, dimanche, ...args) : [];
  // Les conflits se cherchent contre TOUTES les séances de la semaine, pas
  // seulement celles de la vue : le professeur est peut-être pris ailleurs.
  const toutes = db.prepare(`SELECT * FROM horaire_seance WHERE annee_scolaire = ? AND date BETWEEN ? AND ?`).all(an, lundi, dimanche);
  const conf = conflitsDe(toutes);
  for (const s of seances) s.conflits = [...(conf.get(s.id) || [])];
  const feries = new Map([...joursFeries(Number(lundi.slice(0, 4))), ...joursFeries(Number(dimanche.slice(0, 4)))]);
  const jours = [0, 1, 2, 3, 4, 5, 6].map(i => { const d = ajouterJours(lundi, i); return { date: d, ferie: feries.get(d) || null }; });
  const semaine = db.prepare(`SELECT id, semaine_num, type, label FROM annee_calendrier WHERE annee_scolaire = ? AND date_debut <= ? AND date_fin >= ?`)
    .get(an, ajouterJours(lundi, 4), lundi) || null;

  let bac = [];
  if (vue === 'classe' && cle) {
    const [sec, bloc] = cle.split('|');
    const ues = unitesDeClasse(sec, bloc, an);
    const groupes = db.prepare(`SELECT g.id, g.ue_num, g.code_cours, g.nom, g.heures_attribuees, g.ue_quad, g.professeur_id,
        p.nom AS prof_nom, p.prenom AS prof_prenom,
        COALESCE((SELECT cours_nom FROM cours c WHERE c.cours_code = g.code_cours AND c.annee_scolaire = g.annee_scolaire LIMIT 1),
          (SELECT cours_nom FROM cours c WHERE c.cours_code = g.code_cours ORDER BY c.annee_scolaire DESC LIMIT 1)) AS cours_nom
      FROM groupe g LEFT JOIN professeur p ON p.id = g.professeur_id
      WHERE g.annee_scolaire = ? AND g.section = ? ORDER BY g.code_cours, g.nom`).all(an, sec).filter(g => ues.has(g.ue_num));
    const pose = db.prepare(`SELECT COALESCE(SUM(minutes), 0) AS m FROM horaire_seance WHERE annee_scolaire = ? AND groupe_id = ? AND annule = 0`);
    const poseSem = db.prepare(`SELECT COALESCE(SUM(minutes), 0) AS m FROM horaire_seance WHERE annee_scolaire = ? AND groupe_id = ? AND annule = 0 AND date BETWEEN ? AND ?`);
    const prevu = semaine ? db.prepare('SELECT valeur FROM planification WHERE groupe_id = ? AND semaine_id = ?') : null;
    bac = groupes.map(g => {
      const posees = pose.get(an, g.id).m / 60;
      const p = prevu ? parseFloat(prevu.get(g.id, semaine.id)?.valeur) : NaN;
      return { ...g, heures_posees: Math.round(posees * 100) / 100,
        reste: Math.round(((g.heures_attribuees || 0) - posees) * 100) / 100,
        prevu_semaine: Number.isFinite(p) ? p : null,
        pose_semaine: Math.round(poseSem.get(an, g.id, lundi, dimanche).m / 6) / 10 };
    });
  }
  res.json({ annee: an, lundi, jours, semaine, seances, bac });
});

/** Ce que dit une séance posée : ses conflits, calculés contre sa journée. */
function conflitsDeLaSeance(id) {
  const s = db.prepare('SELECT * FROM horaire_seance WHERE id = ?').get(id);
  if (!s) return [];
  const jour = db.prepare('SELECT * FROM horaire_seance WHERE annee_scolaire = ? AND date = ?').all(s.annee_scolaire, s.date);
  return [...(conflitsDe(jour).get(id) || [])];
}
function horaireValide(b) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.date || ''))) return 'date attendue (AAAA-MM-JJ)';
  const d = hm(b.heure_debut), f = hm(b.heure_fin);
  if (!(f > d)) return "l'heure de fin doit suivre l'heure de début";
  if (d % 15 || f % 15) return 'les heures se posent au quart d’heure';
  if (d < 7 * 60 || f > 22 * 60) return 'entre 7 h et 22 h';
  return null;
}
function sectionPermise(req, section) {
  const perim = getUserSections(req.user);
  return !perim || perim.includes(section);
}

// POSER une séance, depuis le bac : un groupe, un jour, une heure.
/* « C'EST LA MÊME PERSONNE » : le texte de l'export désigne ce professeur.
   Enregistré pour les imports suivants, et appliqué tout de suite aux séances
   déjà importées sous ce texte sans professeur reconnu — sans ré-import. */
r.post('/alias', authRequired, roleRequired(...EDITEURS), (req, res) => {
  const texte = String(req.body?.texte || '').trim();
  const profId = Number(req.body?.professeur_id);
  if (!texte || !profId) return res.status(400).json({ error: 'Le nom de l’export et le professeur sont requis.' });
  const p = db.prepare('SELECT id, nom, prenom FROM professeur WHERE id = ?').get(profId);
  if (!p) return res.status(404).json({ error: 'professeur introuvable' });
  const k = clean(texte);
  db.prepare(`INSERT INTO horaire_alias_prof (texte, texte_brut, professeur_id, pose_par) VALUES (?, ?, ?, ?)
    ON CONFLICT (texte) DO UPDATE SET professeur_id = excluded.professeur_id, texte_brut = excluded.texte_brut,
      pose_par = excluded.pose_par, pose_le = datetime('now')`).run(k, texte, p.id, qui(req));
  const ids = db.prepare('SELECT id, professeur_texte FROM horaire_seance WHERE professeur_id IS NULL AND professeur_texte IS NOT NULL')
    .all().filter(x => clean(x.professeur_texte) === k).map(x => x.id);
  const maj = db.prepare('UPDATE horaire_seance SET professeur_id = ? WHERE id = ?');
  db.transaction(() => { for (const id of ids) maj.run(p.id, id); })();
  res.json({ ok: true, seances: ids.length, professeur: `${p.nom} ${p.prenom || ''}`.trim() });
});

r.post('/seance', authRequired, roleRequired(...EDITEURS), (req, res) => {
  const b = req.body || {};
  const g = db.prepare('SELECT * FROM groupe WHERE id = ?').get(Number(b.groupe_id));
  if (!g) return res.status(404).json({ error: 'Groupe inconnu.' });
  if (!sectionPermise(req, g.section)) return res.status(403).json({ error: 'Section hors de votre périmètre.' });
  const err = horaireValide(b);
  if (err) return res.status(400).json({ error: err });
  const niv = niveauxEffectifs([g.section], g.annee_scolaire);
  const bloc = String(niv[g.ue_num] || '').toUpperCase() || null;
  const info = db.prepare(`INSERT INTO horaire_seance (annee_scolaire, classe, section, bloc, date, heure_debut, heure_fin, minutes,
      cours_code, ue_num, matiere, professeur_id, local_texte, groupe_id, source, modifie_lucie, cree_par, cree_le)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'lucie', 1, ?, datetime('now'))`).run(
    g.annee_scolaire, `${g.section} ${bloc || ''}`.trim(), g.section, bloc, b.date, b.heure_debut, b.heure_fin,
    hm(b.heure_fin) - hm(b.heure_debut), g.code_cours, g.ue_num, null, g.professeur_id || null,
    String(b.local_texte || '').trim() || null, g.id, qui(req));
  res.json({ ok: true, id: info.lastInsertRowid, conflits: conflitsDeLaSeance(info.lastInsertRowid) });
});

// DÉPLACER, RALLONGER, CHANGER DE LOCAL, ANNULER.
r.put('/seance/:id', authRequired, roleRequired(...EDITEURS), (req, res) => {
  const s = db.prepare('SELECT * FROM horaire_seance WHERE id = ?').get(Number(req.params.id));
  if (!s) return res.status(404).json({ error: 'Séance introuvable.' });
  if (!sectionPermise(req, s.section)) return res.status(403).json({ error: 'Section hors de votre périmètre.' });
  const b = { date: s.date, heure_debut: s.heure_debut, heure_fin: s.heure_fin, ...req.body };
  const err = horaireValide(b);
  if (err) return res.status(400).json({ error: err });
  db.prepare(`UPDATE horaire_seance SET date = ?, heure_debut = ?, heure_fin = ?, minutes = ?,
      local_texte = ?, annule = ?, commentaire = ?, modifie_lucie = 1, modifie_par = ?, modifie_le = datetime('now')
    WHERE id = ?`).run(b.date, b.heure_debut, b.heure_fin, hm(b.heure_fin) - hm(b.heure_debut),
    'local_texte' in req.body ? (String(req.body.local_texte || '').trim() || null) : s.local_texte,
    'annule' in req.body ? (req.body.annule ? 1 : 0) : s.annule,
    'commentaire' in req.body ? (String(req.body.commentaire || '').trim() || null) : s.commentaire,
    qui(req), s.id);
  res.json({ ok: true, conflits: conflitsDeLaSeance(s.id) });
});

r.delete('/seance/:id', authRequired, roleRequired(...EDITEURS), (req, res) => {
  const s = db.prepare('SELECT * FROM horaire_seance WHERE id = ?').get(Number(req.params.id));
  if (!s) return res.status(404).json({ error: 'Séance introuvable.' });
  if (!sectionPermise(req, s.section)) return res.status(403).json({ error: 'Section hors de votre périmètre.' });
  db.prepare('DELETE FROM horaire_seance WHERE id = ?').run(s.id);
  res.json({ ok: true });
});

/* RECOPIER UNE SEMAINE — l'essentiel d'un horaire est une semaine type répétée.
   Simulation d'abord. On ne pose rien un jour férié ni dans une semaine qui
   n'est pas de cours ; une séance identique déjà là n'est pas doublée. */
r.post('/recopier', authRequired, roleRequired(...EDITEURS), (req, res) => {
  const an = req.body?.annee || anneeDeTravail(req);
  const [sec, bloc] = String(req.body?.cle || '').split('|');
  if (!sec || !bloc) return res.status(400).json({ error: 'classe requise' });
  if (!sectionPermise(req, sec)) return res.status(403).json({ error: 'Section hors de votre périmètre.' });
  const source = lundiDe(String(req.body?.lundi || ''));
  const cibles = [...new Set((Array.isArray(req.body?.cibles) ? req.body.cibles : []).map(x => lundiDe(String(x))))].filter(x => x !== source);
  const simulation = req.body?.simulation !== false;
  const modele = db.prepare(`SELECT * FROM horaire_seance WHERE annee_scolaire = ? AND section = ? AND bloc = ? AND annule = 0
    AND date BETWEEN ? AND ?`).all(an, sec, bloc, source, ajouterJours(source, 6));
  if (!modele.length) return res.status(409).json({ error: 'La semaine modèle est vide.' });
  const existe = db.prepare(`SELECT 1 FROM horaire_seance WHERE annee_scolaire = ? AND date = ? AND heure_debut = ?
    AND COALESCE(groupe_id, 0) = COALESCE(?, 0) AND COALESCE(cours_code, '') = COALESCE(?, '') LIMIT 1`);
  const semaineDe = db.prepare(`SELECT type, label FROM annee_calendrier WHERE annee_scolaire = ? AND date_debut <= ? AND date_fin >= ?`);
  const ins = db.prepare(`INSERT INTO horaire_seance (annee_scolaire, classe, section, bloc, date, heure_debut, heure_fin, minutes,
      cours_code, ue_num, matiere, professeur_id, local_texte, groupe_id, source, modifie_lucie, cree_par, cree_le)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'lucie', 1, ?, datetime('now'))`);
  const rapport = [];
  const aEcrire = [];
  for (const lundi of cibles) {
    const sem = semaineDe.get(an, ajouterJours(lundi, 4), lundi);
    if (sem && sem.type !== 'cours') { rapport.push({ lundi, creees: 0, ignorees: modele.length, raison: sem.label || sem.type }); continue; }
    const feries = joursFeries(Number(lundi.slice(0, 4)));
    let n = 0, ign = 0; const motifs = new Set();
    for (const m of modele) {
      const decal = Math.round((new Date(m.date + 'T12:00:00Z') - new Date(source + 'T12:00:00Z')) / 86400000);
      const d = ajouterJours(lundi, decal);
      if (feries.has(d)) { ign++; motifs.add(`${feries.get(d)} (${d})`); continue; }
      if (existe.get(an, d, m.heure_debut, m.groupe_id, m.cours_code)) { ign++; motifs.add('déjà posée'); continue; }
      aEcrire.push([m, d]); n++;
    }
    rapport.push({ lundi, creees: n, ignorees: ign, raison: [...motifs].join(', ') || null });
  }
  if (!simulation) {
    db.transaction(() => {
      for (const [m, d] of aEcrire) ins.run(an, m.classe, m.section, m.bloc, d, m.heure_debut, m.heure_fin, m.minutes,
        m.cours_code, m.ue_num, m.matiere, m.professeur_id, m.local_texte, m.groupe_id, qui(req));
    })();
  }
  res.json({ ok: true, simulation, modele: modele.length, rapport, total: aEcrire.length });
});

// Les semaines de l'année, pour choisir où recopier.
r.get('/semaines', authRequired, (req, res) => {
  const an = req.query.annee || anneeDeTravail(req);
  res.json(db.prepare('SELECT id, semaine_num, date_debut, date_fin, type, label FROM annee_calendrier WHERE annee_scolaire = ? ORDER BY date_debut').all(an));
});

/* ══ L'IMPORT DE L'EXPORT « LISTE » D'HYPERPLANNING (CSV) ════════════════════
 *
 * Reçu du service informatique le 29 septembre 2026 (« Horaires OPTO B1
 * 2026-27.csv ») : une ligne par séance RÉCURRENTE, séparée par des
 * points-virgules — DDEBUT;DFIN;PERIODE;NBSEANCES;JOUR;HDEBUT;HFIN;
 * LIBELLE_MAT;NOM_ENS;PRENOM_ENS;NOMPERSO_DIP.
 *
 * LA PÉRIODE DIT LES SEMAINES, et c'est elle qui fait foi : « [1..6,9..14] »,
 * semaines numérotées depuis le lundi de la semaine 1. Ce lundi se déduit du
 * fichier même (première ligne datée), et chaque ligne est contrôlée : le
 * nombre de séances et les dates de début et de fin doivent retomber juste,
 * sans quoi la ligne est nommée plutôt qu'importée à l'aveugle.
 *
 * Le COURS par son code (« 292.1 … ») ; à défaut, par son intitulé, contre les
 * cours de la section (« Labo de réfraction » → 291.1) — et si rien ne tient
 * nettement, la séance entre avec son libellé, SANS cours, et elle est
 * signalée. Le SOUS-GROUPE (« <OPTO B1> 2 ») se garde : deux sous-groupes en
 * parallèle ne sont pas un conflit. Le local n'est pas dans le fichier.
 *
 * RÉ-IMPORTER REMPLACE ce qu'un import précédent avait posé pour la classe,
 * SAUF ce qui a été retouché dans Lucie (modifie_lucie) : cela ne s'écrase
 * jamais, et la simulation le dit.
 */
const JOURS_IDX = { lundi: 0, mardi: 1, mercredi: 2, jeudi: 3, vendredi: 4, samedi: 5, dimanche: 6 };
function lireCsvHyper(texte) {
  const lignes = String(texte).replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (!lignes.length) return { entete: [], rows: [] };
  const entete = lignes[0].split(';').map(x => x.trim());
  const rows = lignes.slice(1).map(l => { const v = l.split(';'); return Object.fromEntries(entete.map((k, i) => [k, (v[i] ?? '').trim()])); });
  return { entete, rows };
}
const dateFr = t => { const m = /^(\d{2})-(\d{2})-(\d{2,4})$/.exec(String(t || '').trim()); if (!m) return null; const a = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${a}-${m[2]}-${m[1]}`; };
function semainesDe(p) {
  const out = [];
  for (const part of String(p || '').replace(/[[\]\s]/g, '').split(',')) {
    if (!part) continue;
    const r = /^(\d+)\.\.(\d+)$/.exec(part);
    if (r) { for (let n = +r[1]; n <= +r[2]; n++) out.push(n); } else if (/^\d+$/.test(part)) out.push(+part);
  }
  return out;
}
const sansAccent = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const SYNONYMES = { labo: 'laboratoire', physio: 'physiologie', neurophysio: 'neurophysiologie', sv: 'systeme visuel' };
const VIDES = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'l', 'd', 'a', 'en', 'au', 'aux', 'e']);
const motsDe = t => sansAccent(t).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w && !VIDES.has(w))
  .flatMap(w => (SYNONYMES[w] || w).split(' '));

r.post('/import-csv', authRequired, roleRequired(...EDITEURS), upload.single('fichier'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });
    const an = req.body?.annee || anneeDeTravail(req);
    const [sec, bloc] = String(req.body?.cle || '').split('|');
    if (!sec || !bloc) return res.status(400).json({ error: 'Choisissez la classe de Lucie à laquelle cet horaire se rapporte.' });
    if (!sectionPermise(req, sec)) return res.status(403).json({ error: 'Section hors de votre périmètre.' });
    const simulation = String(req.body?.simulation ?? 'true') !== 'false';
    const { entete, rows } = lireCsvHyper(req.file.buffer.toString('utf8'));
    const requis = ['DDEBUT', 'DFIN', 'PERIODE', 'JOUR', 'HDEBUT', 'HFIN', 'LIBELLE_MAT'];
    const absents = requis.filter(k => !entete.includes(k));
    if (absents.length) return res.status(400).json({ error: `Ce fichier n'est pas l'export « liste » d'Hyperplanning attendu : colonnes absentes — ${absents.join(', ')}.` });

    // La classe principale : l'entrée simple la plus fréquente (« OPTO B1 »).
    const compte = {};
    for (const x of rows) for (const c of String(x.NOMPERSO_DIP || '').split(',').map(t => t.trim()).filter(Boolean)) if (!c.startsWith('<')) compte[c] = (compte[c] || 0) + 1;
    const classeSource = Object.entries(compte).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const libelleLucie = `${sec} ${bloc}`;

    // Le lundi de la semaine 1, déduit de la première ligne datée.
    let lundi1 = null;
    for (const x of rows) {
      const sem = semainesDe(x.PERIODE); const d0 = dateFr(x.DDEBUT);
      if (x.JOUR && sem.length && d0) { lundi1 = ajouterJours(lundiDe(d0), -7 * (sem[0] - 1)); break; }
    }
    if (!lundi1) return res.status(400).json({ error: 'Aucune ligne datée : impossible de situer la semaine 1.' });

    // Les cours : par code, sinon par intitulé contre ceux de la section.
    const cours = db.prepare(`SELECT cours_code, MIN(cours_nom) AS cours_nom, MIN(ue_num) AS ue_num FROM cours GROUP BY cours_code`).all();
    const parCode = new Map(cours.map(c => [c.cours_code, c]));
    const uesSection = new Set(db.prepare('SELECT DISTINCT ue_num FROM ue WHERE section = ?').all(sec).map(x => x.ue_num));
    const candidats = cours.filter(c => uesSection.has(c.ue_num)).map(c => ({ ...c, mots: motsDe(c.cours_nom) }));
    const memo = new Map();
    const coursDe = lib => {
      if (memo.has(lib)) return memo.get(lib);
      let v = null;
      const m = /^(\d+\.\d+)\s/.exec(lib);
      if (m && parCode.has(m[1])) v = { ...parCode.get(m[1]), methode: 'code' };
      else {
        const t = motsDe(lib);
        const notes = candidats.map(c => ({ c, s: t.length ? t.filter(w => c.mots.some(x => x.startsWith(w) || w.startsWith(x))).length / t.length : 0 }))
          .sort((a, b) => b.s - a.s);
        if (notes[0] && notes[0].s >= 0.7 && (notes[0].s - (notes[1]?.s || 0)) >= 0.2) v = { ...notes[0].c, methode: 'intitulé' };
      }
      memo.set(lib, v); return v;
    };
    const prof = indexProfs();
    const groupesDe = db.prepare('SELECT id, nom, professeur_id FROM groupe WHERE annee_scolaire = ? AND code_cours = ?');

    const seances = [], ignorees = [], incoherentes = [], sansCours = new Map(), profsInconnus = new Map();
    rows.forEach((x, i) => {
      const n = i + 2;                                    // numéro de ligne du fichier
      const lib = String(x.LIBELLE_MAT || '').split(',')[0].trim();
      if (!x.JOUR || !x.HDEBUT || !x.HFIN) { ignorees.push({ ligne: n, libelle: lib, raison: 'sans jour ni heure (semaine entière)' }); return; }
      const j = JOURS_IDX[sansAccent(x.JOUR)];
      const sem = semainesDe(x.PERIODE);
      const d0 = dateFr(x.DDEBUT), d1 = dateFr(x.DFIN);
      if (j == null || !sem.length) { ignorees.push({ ligne: n, libelle: lib, raison: `jour ou période illisible (${x.JOUR} ${x.PERIODE})` }); return; }
      const dates = sem.map(k => ajouterJours(lundi1, 7 * (k - 1) + j));
      const nb = Number(x.NBSEANCES);
      if ((nb && nb !== dates.length) || (d0 && dates[0] !== d0) || (d1 && dates[dates.length - 1] !== d1)) {
        incoherentes.push({ ligne: n, libelle: lib, periode: x.PERIODE, du: d0, au: d1 }); return;
      }
      // Le sous-groupe : « <OPTO B1> 2 », quand la séance ne vise pas la classe entière.
      const entrees = String(x.NOMPERSO_DIP || '').split(',').map(t => t.trim()).filter(Boolean);
      const entiere = entrees.includes(classeSource);
      const sg = entiere ? null : entrees.map(e => (/^<([^>]+)>\s*(?:Gr\s*)?(\S+)$/i.exec(e) || [])).filter(m => m[1] === classeSource).map(m => m[2]).join('+') || null;
      // Une ligne qui ne vise ni la classe ni un de ses sous-groupes (« <ORTHO B1>
      // Gr 1 » seul) est d'une autre classe : l'importer en ferait un cours de
      // toute la classe, et un faux conflit.
      if (!entiere && !sg) { ignorees.push({ ligne: n, libelle: lib, raison: `ne concerne pas ${classeSource} : ${entrees.join(', ')}` }); return; }
      const c = coursDe(lib);
      if (!c) sansCours.set(lib, (sansCours.get(lib) || 0) + dates.length);
      const noms = String(x.NOM_ENS || '').split(',').map(t => t.trim()).filter(Boolean);
      const prenoms = String(x.PRENOM_ENS || '').split(',').map(t => t.trim());
      const texteProf = noms.map((nm, k) => `${nm} ${prenoms[k] || ''}`.trim()).join(', ') || null;
      const p0 = noms[0] ? prof(`${noms[0]} ${prenoms[0] || ''}`) : null;
      const pid = p0 && !p0.ambigu ? p0.id : null;
      if (noms[0] && !pid) profsInconnus.set(texteProf, (profsInconnus.get(texteProf) || 0) + dates.length);
      let groupeId = null;
      if (c) {
        const gs = groupesDe.all(an, c.cours_code);
        groupeId = (gs.find(g => pid && g.professeur_id === pid) || gs[0] || {}).id || null;
      }
      for (const d of dates) seances.push({ date: d, heure_debut: x.HDEBUT, heure_fin: x.HFIN, minutes: hm(x.HFIN) - hm(x.HDEBUT),
        cours_code: c?.cours_code || null, ue_num: c?.ue_num ?? null, matiere: c ? null : lib, professeur_texte: texteProf,
        professeur_id: pid, groupe_id: groupeId, sous_groupe: sg, bloc });   // l'export est l'horaire DE LA CLASSE
    });

    // Ce qu'un import précédent avait posé pour cette classe, et ce qui a été retouché.
    const precedentes = db.prepare(`SELECT COUNT(*) AS n, SUM(modifie_lucie) AS m FROM horaire_seance
      WHERE annee_scolaire = ? AND section = ? AND classe = ? AND source = 'import'`).get(an, sec, libelleLucie);
    const lucie = db.prepare(`SELECT COUNT(*) AS n FROM horaire_seance WHERE annee_scolaire = ? AND section = ? AND bloc = ? AND source = 'lucie'`).get(an, sec, bloc).n;

    const rapport = {
      ok: true, simulation, classe_source: classeSource, classe_lucie: libelleLucie, semaine_1: lundi1,
      lignes: rows.length, seances: seances.length,
      du: seances.map(s => s.date).sort()[0] || null, au: seances.map(s => s.date).sort().pop() || null,
      heures: Math.round(seances.reduce((t, s) => t + s.minutes, 0) / 6) / 10,
      ignorees, incoherentes,
      sans_cours: [...sansCours].map(([libelle, n]) => ({ libelle, seances: n })),
      profs_inconnus: [...profsInconnus].map(([nom, n]) => ({ nom, seances: n })),
      remplacees: (precedentes.n || 0) - (precedentes.m || 0), conservees_retouchees: precedentes.m || 0,
      deja_posees_dans_lucie: lucie,
    };
    if (simulation) return res.json(rapport);

    db.transaction(() => {
      db.prepare(`DELETE FROM horaire_seance WHERE annee_scolaire = ? AND section = ? AND classe = ? AND source = 'import' AND modifie_lucie = 0`)
        .run(an, sec, libelleLucie);
      const lot = db.prepare(`INSERT INTO horaire_lot (annee_scolaire, classe, section, fichier, periode_debut, periode_fin, nb_seances, importe_par)
        VALUES (?,?,?,?,?,?,?,?)`).run(an, libelleLucie, sec, req.file.originalname || 'horaire.csv', rapport.du, rapport.au, seances.length, qui(req));
      const ins = db.prepare(`INSERT INTO horaire_seance (lot_id, annee_scolaire, classe, section, bloc, date, heure_debut, heure_fin, minutes,
          cours_code, ue_num, matiere, professeur_texte, professeur_id, groupe_id, sous_groupe, source, modifie_lucie, cree_par, cree_le)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'import', 0, ?, datetime('now'))`);
      for (const s of seances) ins.run(lot.lastInsertRowid, an, libelleLucie, sec, s.bloc, s.date, s.heure_debut, s.heure_fin, s.minutes,
        s.cours_code, s.ue_num, s.matiere, s.professeur_texte, s.professeur_id, s.groupe_id, s.sous_groupe, qui(req));
    })();
    res.json(rapport);
  } catch (e) {
    console.error('[horaire/import-csv]', e);
    res.status(500).json({ error: e.message });
  }
});

export default r;
