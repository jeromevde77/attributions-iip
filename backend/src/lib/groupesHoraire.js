/* (CS) LES GROUPES DE L'HORAIRE (3.5.717, Charles, 25 novembre 2026 : le document « Groupes 250-255-259-252 » de TIM ; tranché :
   « groupes de l'horaire, à importer »). L'horaire importé d'Hyperplanning numérote les groupes d'une séance (« 3 », « 3+4 ») ; la
   répartition et les ATTRIBUTIONS de ces UE les nomment par des lettres, sur lesquelles repose la liste de chaque professeur. Plutôt
   que de toucher aux lettres, chaque étudiant reçoit, par UE et par année, le NUMÉRO de son groupe dans l'horaire. Les présences
   d'une séance numérotée ne montrent alors que ses étudiants (lib/grillePresence.js, routes/mesCours.js, routes/presencesUE.js). */
import db from '../db/index.js';

export function migrerGroupesHoraire(dbx = db) {
  dbx.exec(`CREATE TABLE IF NOT EXISTS groupe_horaire (
    annee_scolaire TEXT NOT NULL, ue_num INTEGER NOT NULL, etudiant_id INTEGER NOT NULL, numero TEXT NOT NULL,
    par TEXT, le TEXT DEFAULT (datetime('now')), PRIMARY KEY (annee_scolaire, ue_num, etudiant_id))`);
}
try { migrerGroupesHoraire(); } catch (e) { console.error('[groupes horaire] migration', e.message); }

/** Le numéro de groupe de chaque étudiant pour une UE et une année (Map étudiant → numéro), ou null s'il n'y en a pas. */
export function numerosDeLUE(annee, ueNum) {
  try {
    const l = db.prepare('SELECT etudiant_id, numero FROM groupe_horaire WHERE annee_scolaire = ? AND ue_num = ?').all(annee, Number(ueNum));
    return l.length ? new Map(l.map(x => [x.etudiant_id, String(x.numero)])) : null;
  } catch { return null; }
}

/** Les numéros que désigne le groupe d'une séance (« 1B3 » n'est pas un numéro ; « 3 », « 3+4 », « 1+2+5+6 » le sont), ou null. */
export function numerosDeLaSeance(sousGroupe) {
  const t = String(sousGroupe || '').split('+').map(x => x.trim()).filter(Boolean);
  return t.length && t.every(x => /^\d+$/.test(x)) ? t.map(x => String(Number(x))) : null;
}

/** Les étudiants (ids) d'une séance numérotée d'après les groupes de l'horaire de l'UE, ou null quand on ne sait pas. */
export function etudiantsDeLaSeance(annee, ueNum, sousGroupe) {
  const nums = numerosDeLaSeance(sousGroupe);
  if (!nums) return null;
  const m = numerosDeLUE(annee, ueNum);
  if (!m) return null;
  return new Set([...m.entries()].filter(([, n]) => nums.includes(n)).map(([id]) => id));
}

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

/** Importer (simulation d'abord) : lignes { nom, prenom, ue_num, groupe }. Rapprochement parmi les inscrits de l'UE pour l'année :
 *  nom exact, puis premier prénom ; un seul candidat sinon la ligne est « à voir ». */
export function importerGroupesHoraire({ annee, lignes, simulation = true, par = null }) {
  migrerGroupesHoraire();
  const inscritsDe = new Map();
  const inscrits = ue => {
    if (!inscritsDe.has(ue)) inscritsDe.set(ue, db.prepare(`SELECT e.id, e.nom, e.prenom FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
      WHERE i.annee_scolaire = ? AND i.ue_num = ?`).all(annee, ue).map(e => ({ ...e, n: norm(e.nom), p: norm(e.prenom).split(' ')[0] || '' })));
    return inscritsDe.get(ue);
  };
  const retenues = [], introuvables = [], douteuses = [];
  for (const l of lignes) {
    const ue = Number(l.ue_num), num = String(l.groupe ?? '').replace(/[^0-9]/g, '');
    if (!ue || !num) { introuvables.push({ ...l, raison: 'UE ou groupe manquant' }); continue; }
    const n = norm(l.nom), p = norm(l.prenom).split(' ')[0] || '';
    let c = inscrits(ue).filter(e => e.n === n);
    if (c.length > 1) c = c.filter(e => e.p === p || e.p.startsWith(p) || p.startsWith(e.p));
    if (!c.length) { // un nom écrit autrement (« Kayinarura ») : nom contenu, même premier prénom
      c = inscrits(ue).filter(e => (e.n.includes(n) || n.includes(e.n)) && e.p && p && (e.p === p || e.p.startsWith(p) || p.startsWith(e.p)));
    }
    if (c.length === 1) retenues.push({ etudiant_id: c[0].id, nom: `${String(c[0].nom || '').toUpperCase()} ${c[0].prenom || ''}`, ue_num: ue, numero: String(Number(num)) });
    else if (!c.length) introuvables.push({ ...l, raison: `pas inscrit(e) à l'UE ${ue} en ${annee}` });
    else douteuses.push({ ...l, raison: `${c.length} étudiants possibles` });
  }
  if (!simulation) {
    const poser = db.prepare(`INSERT INTO groupe_horaire (annee_scolaire, ue_num, etudiant_id, numero, par, le) VALUES (?,?,?,?,?, datetime('now'))
      ON CONFLICT(annee_scolaire, ue_num, etudiant_id) DO UPDATE SET numero = excluded.numero, par = excluded.par, le = excluded.le`);
    db.transaction(() => { for (const r of retenues) poser.run(annee, r.ue_num, r.etudiant_id, r.numero, par); })();
  }
  const parUE = {};
  for (const r of retenues) parUE[r.ue_num] = (parUE[r.ue_num] || 0) + 1;
  return { simulation, retenues: retenues.length, par_ue: parUE, introuvables, douteuses };
}
