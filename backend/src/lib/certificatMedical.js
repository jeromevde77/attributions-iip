/* LE CERTIFICAT MÉDICAL (3.5.125, Charles, 4 novembre 2026 : « l'étudiant doit pouvoir uploader un certificat médical et
 * compléter les dates de son absence ; cela doit aller dans les présences ; le prof doit le voir et le secrétariat aussi, avec
 * notification ; attention aux délais du RDE » ; tranché : deux portes — l'espace de l'étudiant et le secrétariat, qui l'encode
 * quand il le reçoit — et un délai de 3 jours ouvrables après le début de l'absence).
 *
 * Un certificat couvre une période (du … au …). Remis DANS LE DÉLAI, il est accepté d'office : les absences de l'étudiant aux
 * séances de la période deviennent « justifiées — certificat médical » (`ecrirePresences`, journal compris), et une absence
 * encodée plus tard sur une séance de la période le devient aussi (`cep.js`, `absenceCouverte`). Remis HORS DÉLAI, il attend la
 * décision de la direction (accepter → même effet ; refuser → motif). Les professeurs des séances de la période et le
 * secrétariat sont notifiés. Le fichier vit sous DATA_DIR/certificats/<id>. */
import fs from 'node:fs';
import path from 'node:path';
import db from '../db/index.js';
import { ecrirePresences } from './cep.js';
import { joursFeries } from '../routes/horaire.js';

const DATA_DIR = () => process.env.DATA_DIR || '/app/data';
export const DELAI_JOURS_OUVRABLES = 3;

export function migrerCertificats(base = db) {
  base.exec(`CREATE TABLE IF NOT EXISTS certificat_medical (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    etudiant_id INTEGER NOT NULL, annee_scolaire TEXT,
    du TEXT NOT NULL, au TEXT NOT NULL, recu_le TEXT NOT NULL,
    depose_par TEXT NOT NULL DEFAULT 'secretariat',      -- secretariat | etudiant
    nom_fichier TEXT, mime TEXT, taille INTEGER,
    limite TEXT, hors_delai INTEGER NOT NULL DEFAULT 0,
    statut TEXT NOT NULL DEFAULT 'accepte',              -- accepte | a_decider | refuse
    decide_par TEXT, decide_le TEXT, motif_refus TEXT,
    remarque TEXT, seances_justifiees INTEGER DEFAULT 0,
    cree_par TEXT, cree_le TEXT DEFAULT (datetime('now')))`);
}

const iso = d => d.toISOString().slice(0, 10);
/** La date limite : le début de l'absence + 3 jours ouvrables (ni samedi, ni dimanche, ni jour férié ou de fermeture). */
export function dateLimite(du, jours = DELAI_JOURS_OUVRABLES) {
  let d = new Date(`${String(du).slice(0, 10)}T12:00:00Z`), n = 0;
  const feries = new Map();
  const ferie = x => { const an = Number(x.slice(0, 4)); if (!feries.has(an)) { try { feries.set(an, joursFeries(an)); } catch { feries.set(an, new Map()); } } return feries.get(an).has(x); };
  while (n < jours) {
    d = new Date(d.getTime() + 86400000);
    const j = d.getUTCDay(), x = iso(d);
    if (j !== 0 && j !== 6 && !ferie(x)) n++;
  }
  return iso(d);
}

/** Les séances (non annulées) des UE de l'étudiant, dans la période. */
function seancesDeLaPeriode(etudId, du, au) {
  return db.prepare(`SELECT s.id, s.date, s.heure_debut, s.cours_code, COALESCE(s.ue_num, c.ue_num) AS ue_num, s.professeur_id
    FROM horaire_seance s LEFT JOIN cours c ON c.cours_code = s.cours_code AND c.annee_scolaire = s.annee_scolaire
    WHERE s.date BETWEEN ? AND ? AND COALESCE(s.annule, 0) = 0
      AND COALESCE(s.ue_num, c.ue_num) IN (SELECT ue_num FROM etudiant_inscription WHERE etudiant_id = ? AND annee_scolaire = s.annee_scolaire)
    ORDER BY s.date, s.heure_debut`).all(du, au, etudId);
}

/** Appliquer un certificat accepté : ses absences dans la période deviennent justifiées (motif médical). */
export function appliquer(cm, par) {
  const seances = seancesDeLaPeriode(cm.etudiant_id, cm.du, cm.au);
  const absent = db.prepare("SELECT 1 FROM presence WHERE seance_id = ? AND etudiant_id = ? AND statut = 'absent'");
  const lignes = seances.filter(s => absent.get(s.id, cm.etudiant_id))
    .map(s => ({ seance_id: s.id, etudiant_id: cm.etudiant_id, statut: 'justifie', motif: 'medical' }));
  const r = lignes.length ? ecrirePresences(lignes, par) : { ecrites: 0 };
  db.prepare('UPDATE certificat_medical SET seances_justifiees = ? WHERE id = ?').run(r.ecrites || 0, cm.id);
  return r.ecrites || 0;
}

/** Prévenir les professeurs des séances de la période et le secrétariat. */
function notifier(cm, titre, corps, par) {
  const lien = '/etudiants?outil=presence-qr';
  const ins = db.prepare(`INSERT INTO lucie_notification (type, titre, corps, lien, cible_user_id, cible_role, cree_par)
    VALUES ('certificat_medical', ?, ?, ?, ?, ?, ?)`);
  try {
    ins.run(titre, corps, lien, null, 'secretariat', par);
    const profs = new Set(seancesDeLaPeriode(cm.etudiant_id, cm.du, cm.au).map(s => s.professeur_id).filter(Boolean));
    for (const pid of profs) {
      for (const u of db.prepare("SELECT id FROM utilisateur WHERE professeur_id = ? AND COALESCE(actif, 1) = 1").all(pid)) {
        ins.run(titre, corps, '/mes-cours', u.id, null, par);
      }
    }
  } catch (e) { console.error('[certificat médical] notification :', e.message); }
}

const fr = d => String(d || '').slice(0, 10).split('-').reverse().join('/');
const nomEtudiant = id => { const e = db.prepare('SELECT nom, prenom FROM etudiant WHERE id = ?').get(id) || {}; return `${String(e.nom || '').toUpperCase()} ${e.prenom || ''}`.trim(); };

/** Déposer un certificat (secrétariat ou étudiant) : enregistrer, juger le délai, appliquer s'il est dans le délai, prévenir. */
export function deposer({ etudiantId, du, au, recuLe, fichier = null, deposePar = 'secretariat', par, remarque = null, annee = null }) {
  migrerCertificats();
  const j = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
  if (!etudiantId || !db.prepare('SELECT 1 FROM etudiant WHERE id = ?').get(Number(etudiantId))) return { erreur: 'Étudiant inconnu.' };
  if (!j(du) || !j(au)) return { erreur: 'Les dates de l’absence (du … au …) sont requises.' };
  if (au < du) return { erreur: 'La fin de l’absence précède son début.' };
  const recu = j(recuLe) ? recuLe : iso(new Date());
  const limite = dateLimite(du);
  const hors = recu > limite ? 1 : 0;
  const r = db.prepare(`INSERT INTO certificat_medical (etudiant_id, annee_scolaire, du, au, recu_le, depose_par, nom_fichier, mime, taille,
      limite, hors_delai, statut, remarque, cree_par) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(Number(etudiantId), annee, du, au, recu, deposePar, fichier?.nom || null, fichier?.mime || null, fichier?.buffer?.length || null,
      limite, hors, hors ? 'a_decider' : 'accepte', remarque, par);
  const id = Number(r.lastInsertRowid);
  // Le fichier, ou rien : un certificat enregistré sans le fichier qu'on croit avoir déposé serait un trou dans le dossier.
  if (fichier?.buffer) {
    try {
      const dir = path.join(DATA_DIR(), 'certificats');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, String(id)), fichier.buffer);
    } catch (e) {
      db.prepare('DELETE FROM certificat_medical WHERE id = ?').run(id);
      return { erreur: `Le fichier n'a pas pu être enregistré (${e.message}) : rien n'a été enregistré.` };
    }
  }
  const cm = db.prepare('SELECT * FROM certificat_medical WHERE id = ?').get(id);
  const n = hors ? 0 : appliquer(cm, par);
  const qui = nomEtudiant(etudiantId);
  notifier(cm, `Certificat médical — ${qui}, du ${fr(du)} au ${fr(au)}`,
    hors ? `Remis le ${fr(recu)}, après la limite du ${fr(limite)} (${DELAI_JOURS_OUVRABLES} jours ouvrables) : la direction décide.`
      : `Accepté : les absences de la période sont justifiées (certificat médical)${n ? ` — ${n} séance(s) déjà encodée(s)` : ''}.`, par);
  return { ok: true, id, hors_delai: !!hors, limite, seances_justifiees: n };
}

/** La direction décide d'un certificat remis hors délai. */
export function decider(id, decision, motif, par) {
  migrerCertificats();
  const cm = db.prepare('SELECT * FROM certificat_medical WHERE id = ?').get(Number(id));
  if (!cm) return { erreur: 'Certificat introuvable.' };
  if (!['accepte', 'refuse'].includes(decision)) return { erreur: 'accepte ou refuse' };
  if (decision === 'refuse' && !String(motif || '').trim()) return { erreur: 'Un refus se motive.' };
  db.prepare(`UPDATE certificat_medical SET statut = ?, motif_refus = ?, decide_par = ?, decide_le = datetime('now') WHERE id = ?`)
    .run(decision, decision === 'refuse' ? String(motif).trim() : null, par, cm.id);
  const n = decision === 'accepte' ? appliquer({ ...cm, statut: 'accepte' }, par) : 0;
  notifier(cm, `Certificat médical ${decision === 'accepte' ? 'accepté' : 'refusé'} — ${nomEtudiant(cm.etudiant_id)}, du ${fr(cm.du)} au ${fr(cm.au)}`,
    decision === 'accepte' ? `Accepté par la direction malgré le délai${n ? ` — ${n} séance(s) justifiée(s)` : ''}.` : `Refusé : ${String(motif).trim()}`, par);
  return { ok: true, seances_justifiees: n };
}

export function liste({ annee = null, sections = null } = {}) {
  migrerCertificats();
  let l = db.prepare(`SELECT c.*, e.nom, e.prenom, e.id_ecampus, e.section_rattachement AS section
    FROM certificat_medical c JOIN etudiant e ON e.id = c.etudiant_id
    ${annee ? 'WHERE c.annee_scolaire = ? OR c.annee_scolaire IS NULL' : ''} ORDER BY c.recu_le DESC, c.id DESC`).all(...(annee ? [annee] : []));
  if (sections) l = l.filter(x => !x.section || sections.includes(x.section));
  return l;
}

export function cheminFichier(id) { return path.join(DATA_DIR(), 'certificats', String(Number(id))); }
