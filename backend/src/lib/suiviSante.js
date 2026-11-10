/**
 * LE SUIVI DE SANTÉ DES ÉTUDIANTS (3.5.283, Charles, 10 novembre 2026, d'après la note du secrétariat : « l'étudiant reçoit sa
 * convocation du CESI ; après la visite médicale, le CESI nous envoie le formulaire de santé… organisme CESI, date de l'examen…
 * pas de visite médicale, pas de stage et pas de réussite en fin d'année » ; tranché : la FICHE de l'étudiant est la source et les
 * stages la lisent (la date « médecine du travail » du stage est reprise) ; une durée de validité réglable par la direction ;
 * Lucie SIGNALE sans bloquer ; le formulaire du CESI se dépose au dossier).
 *
 * Table `etudiant_visite_medicale` : une ligne par visite (organisme, date de l'examen, formulaire, qui l'a encodée). Une visite ne
 * s'efface pas : elle se RETIRE avec un motif (une erreur d'encodage), et reste lisible. La visite qui fait foi est la plus
 * récente non retirée ; elle vaut `sante.validite_mois` mois (lucie_config, 12 par défaut). Le formulaire vit sous
 * DATA_DIR/sante/<id>.
 */
import fs from 'node:fs';
import path from 'node:path';
import db from '../db/index.js';

const DATA_DIR = () => process.env.DATA_DIR || '/app/data';
export const cheminFormulaire = id => path.join(DATA_DIR(), 'sante', String(Number(id)));
export const ORGANISME_DEFAUT = 'CESI';

let pret = false;
export function migrerSante() {
  if (pret) return;
  db.exec(`CREATE TABLE IF NOT EXISTS etudiant_visite_medicale (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    etudiant_id INTEGER NOT NULL,
    organisme TEXT,
    date_examen TEXT NOT NULL,
    remarque TEXT,
    nom_fichier TEXT,
    mime TEXT,
    origine TEXT,
    cree_par TEXT,
    cree_le TEXT DEFAULT (datetime('now')),
    retire_le TEXT,
    retire_par TEXT,
    retire_motif TEXT
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_visite_medicale_etud ON etudiant_visite_medicale (etudiant_id, date_examen)');
  db.exec(`CREATE TABLE IF NOT EXISTS lucie_config (cle TEXT PRIMARY KEY, valeur TEXT)`);
  // LA DATE DU STAGE EST REPRISE UNE FOIS : chaque « médecine du travail » posée sur un stage devient une visite de la fiche.
  try {
    const fait = db.prepare("SELECT valeur FROM lucie_config WHERE cle = 'sante_reprise_stages'").get();
    const aStage = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'stage'").get()
      && db.prepare('PRAGMA table_info(stage)').all().some(c => c.name === 'medecine_le');
    if (!fait && aStage) {
      const l = db.prepare(`SELECT DISTINCT etudiant_id, medecine_le FROM stage WHERE medecine_le IS NOT NULL AND medecine_le <> ''`).all();
      const deja = db.prepare('SELECT 1 FROM etudiant_visite_medicale WHERE etudiant_id = ? AND date_examen = ?');
      const ins = db.prepare(`INSERT INTO etudiant_visite_medicale (etudiant_id, organisme, date_examen, remarque, origine, cree_par)
        VALUES (?, NULL, ?, 'Reprise de la date « médecine du travail » de la fiche du stage.', 'stage', 'Lucie (reprise)')`);
      db.transaction(() => { for (const x of l) if (!deja.get(x.etudiant_id, x.medecine_le)) ins.run(x.etudiant_id, String(x.medecine_le).slice(0, 10)); })();
      db.prepare("INSERT INTO lucie_config (cle, valeur) VALUES ('sante_reprise_stages', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur")
        .run(String(l.length));
    }
  } catch (e) { console.error('[santé] reprise des stages :', e.message); }
  pret = true;
}

/** La durée de validité d'une visite, en mois (réglée par la direction). */
export function validiteMois() {
  migrerSante();
  const v = Number(db.prepare("SELECT valeur FROM lucie_config WHERE cle = 'sante.validite_mois'").get()?.valeur);
  return Number.isFinite(v) && v >= 1 && v <= 120 ? Math.round(v) : 12;
}
export function reglerValidite(mois) {
  const m = Math.round(Number(mois));
  if (!Number.isFinite(m) || m < 1 || m > 120) return { erreur: 'Une durée entre 1 et 120 mois.' };
  migrerSante();
  db.prepare("INSERT INTO lucie_config (cle, valeur) VALUES ('sante.validite_mois', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur").run(String(m));
  return { mois: m };
}

const plusMois = (d, m) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCMonth(x.getUTCMonth() + m); return x.toISOString().slice(0, 10); };

/** La visite qui fait foi pour un étudiant — la plus récente non retirée — et si elle couvre une date (le début d'un stage, ou
 *  aujourd'hui) : { visite, date, jusqu_au, valide, etat: 'valide'|'echue'|'aucune' }. */
export function visiteAuJour(etudId, aLaDate = new Date().toISOString().slice(0, 10)) {
  migrerSante();
  const v = db.prepare(`SELECT * FROM etudiant_visite_medicale WHERE etudiant_id = ? AND retire_le IS NULL
    ORDER BY date_examen DESC, id DESC LIMIT 1`).get(Number(etudId));
  if (!v) return { visite: null, date: null, jusqu_au: null, valide: false, etat: 'aucune' };
  const jusqu = plusMois(v.date_examen, validiteMois());
  const valide = jusqu >= String(aLaDate).slice(0, 10);
  return { visite: v, date: v.date_examen, jusqu_au: jusqu, valide, etat: valide ? 'valide' : 'echue' };
}

export function visitesDe(etudId) {
  migrerSante();
  return db.prepare('SELECT * FROM etudiant_visite_medicale WHERE etudiant_id = ? ORDER BY date_examen DESC, id DESC').all(Number(etudId))
    .map(v => ({ ...v, a_formulaire: !!v.nom_fichier && fs.existsSync(cheminFormulaire(v.id)) }));
}

/** Encoder une visite : la date est obligatoire, jamais dans le futur ; l'organisme vaut CESI par défaut. */
export function encoder({ etudiantId, organisme, dateExamen, remarque, fichier, par }) {
  migrerSante();
  const e = db.prepare('SELECT id FROM etudiant WHERE id = ?').get(Number(etudiantId));
  if (!e) return { erreur: 'Étudiant introuvable.' };
  const d = String(dateExamen || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { erreur: 'La date de l’examen est obligatoire (celle du formulaire de santé).' };
  if (d > new Date().toISOString().slice(0, 10)) return { erreur: 'La date de l’examen ne peut pas être dans le futur.' };
  const org = String(organisme || '').trim() || ORGANISME_DEFAUT;
  const id = db.prepare(`INSERT INTO etudiant_visite_medicale (etudiant_id, organisme, date_examen, remarque, nom_fichier, mime, origine, cree_par)
    VALUES (?, ?, ?, ?, ?, ?, 'fiche', ?)`).run(e.id, org.slice(0, 120), d, String(remarque || '').trim().slice(0, 1000) || null,
    fichier ? String(fichier.nom || 'formulaire').slice(0, 200) : null, fichier?.mime || null, par || null).lastInsertRowid;
  if (fichier?.buffer) {
    fs.mkdirSync(path.dirname(cheminFormulaire(id)), { recursive: true });
    fs.writeFileSync(cheminFormulaire(id), fichier.buffer);
  }
  return { id: Number(id) };
}

/** Joindre le formulaire à une visite déjà encodée (il arrive souvent après la date). */
export function joindre(id, fichier, par) {
  migrerSante();
  const v = db.prepare('SELECT * FROM etudiant_visite_medicale WHERE id = ?').get(Number(id));
  if (!v || v.retire_le) return { erreur: 'Visite introuvable.' };
  fs.mkdirSync(path.dirname(cheminFormulaire(v.id)), { recursive: true });
  fs.writeFileSync(cheminFormulaire(v.id), fichier.buffer);
  db.prepare('UPDATE etudiant_visite_medicale SET nom_fichier = ?, mime = ? WHERE id = ?').run(String(fichier.nom || 'formulaire').slice(0, 200), fichier.mime, v.id);
  return { id: v.id, par };
}

/** Retirer une visite encodée par erreur : un motif, et elle reste lisible (barrée). */
export function retirer(id, motif, par) {
  migrerSante();
  const m = String(motif || '').trim();
  if (m.length < 3) return { erreur: 'Dites pourquoi cette visite est retirée.' };
  const v = db.prepare('SELECT * FROM etudiant_visite_medicale WHERE id = ?').get(Number(id));
  if (!v || v.retire_le) return { erreur: 'Visite introuvable.' };
  db.prepare("UPDATE etudiant_visite_medicale SET retire_le = datetime('now'), retire_par = ?, retire_motif = ? WHERE id = ?").run(par || null, m.slice(0, 500), v.id);
  return { id: v.id };
}

/** Les étudiants (parmi `ids`) sans visite valable à la date : pour le filtre de la liste et l'alerte de délibération. */
export function sansVisiteValable(ids, aLaDate) {
  migrerSante();
  return ids.filter(id => !visiteAuJour(id, aLaDate).valide);
}

/** L'état de la visite de TOUS les étudiants, en une requête (le filtre de la liste) : { [etudiant_id]: 'valide'|'echue' } ;
 *  un étudiant absent de la carte n'a aucune visite. */
export function etatsDeTous(aLaDate = new Date().toISOString().slice(0, 10)) {
  migrerSante();
  const m = validiteMois();
  const out = {};
  for (const r of db.prepare(`SELECT etudiant_id, MAX(date_examen) d FROM etudiant_visite_medicale WHERE retire_le IS NULL GROUP BY etudiant_id`).all()) {
    out[r.etudiant_id] = plusMois(r.d, m) >= String(aLaDate).slice(0, 10) ? 'valide' : 'echue';
  }
  return out;
}
