// ─────────────────────────────────────────────────────────────────────────────
// L'ABSENCE D'UN ENSEIGNANT (3.5.210, Charles, 7 novembre 2026 : « signaler une absence » ; tranché : le professeur signale,
// LE SECRÉTARIAT DÉCIDE séance par séance — annulée, remplacée, déplacée, maintenue —, et les étudiants ne sont prévenus
// qu'ensuite).
//
// Le professeur (Mes cours ou son espace) donne ses dates, un motif de la liste fermée et un mot ; Lucie relève ses séances de
// la période (la règle de Mes cours, `seancesPourEspace`) et les attache à l'absence. Secrétariat, coordination de la section
// et direction sont notifiés. Le secrétariat (ou la direction) pose une décision par séance, qui s'écrit dans l'horaire
// (`horaire_seance` : annule, professeur_id, date et heures — `modifie_lucie = 1`, qu'aucun import n'écrasera). « Prévenir les
// étudiants » envoie, pour les séances décidées et pas encore annoncées, un message dans l'espace des inscrits du cours, et un
// courriel à l'adresse d'école de ceux qui n'ont pas d'espace ; le professeur reçoit la décision dans son fil.
// Une absence ne s'efface pas : le professeur la retire tant que rien n'est décidé ; ensuite, elle reste au registre.
// ─────────────────────────────────────────────────────────────────────────────
import db from '../db/index.js';
import { seancesPourEspace } from '../routes/mesCours.js';

export const MOTIFS = { maladie: 'Maladie', familial: 'Raison familiale', formation: 'Formation', service: 'Mission de service', autre: 'Autre' };
export const DECISIONS = { annulee: 'Annulée', remplacee: 'Remplacée', deplacee: 'Déplacée', maintenue: 'Maintenue' };
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const HEURE = /^\d{2}:\d{2}$/;

export function migrerAbsences(dbx = db) {
  dbx.exec(`
    CREATE TABLE IF NOT EXISTS absence_prof (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, professeur_id INTEGER NOT NULL,
      du TEXT NOT NULL, au TEXT NOT NULL, motif TEXT NOT NULL, remarque TEXT, signale_par TEXT, signale_le TEXT DEFAULT (datetime('now')),
      retiree_le TEXT);
    CREATE INDEX IF NOT EXISTS idx_absence_prof ON absence_prof(professeur_id, du);
    CREATE TABLE IF NOT EXISTS absence_prof_seance (absence_id INTEGER NOT NULL, seance_id INTEGER NOT NULL,
      date TEXT, heure_debut TEXT, heure_fin TEXT, cours_code TEXT, ue_num INTEGER, section TEXT, cours_nom TEXT,
      decision TEXT, remplacant_id INTEGER, nouvelle_date TEXT, nouvelle_heure_debut TEXT, nouvelle_heure_fin TEXT, mot TEXT,
      decide_par TEXT, decide_le TEXT, prevenus_le TEXT, prevenus_n INTEGER,
      PRIMARY KEY (absence_id, seance_id));
  `);
}

const nomProf = id => {
  const p = db.prepare('SELECT nom, prenom FROM professeur WHERE id = ?').get(id);
  return p ? `${String(p.nom || '').toUpperCase()} ${p.prenom || ''}`.trim() : `professeur ${id}`;
};
const fr = d => String(d || '').slice(0, 10).split('-').reverse().join('/');
const profDuCompte = userId => db.prepare('SELECT professeur_id FROM utilisateur WHERE id = ?').get(userId)?.professeur_id || null;

function notifier({ titre, corps, lien, role = null, userId = null, section = null }) {
  try {
    db.prepare(`INSERT INTO lucie_notification (type, titre, corps, lien, cible_role, cible_user_id, cree_par, section)
      VALUES ('absence_prof',?,?,?,?,?,?,?)`).run(titre, corps, lien, role, userId, 'Lucie', section);
  } catch (e) { console.error('[absence prof] notification :', e.message); }
}

/** Le professeur signale : rend { id, seances } ou { erreur }. */
export function signaler(user, { du, au, motif, remarque }, parNom) {
  migrerAbsences();
  const profId = user?.apercuProfId || profDuCompte(user?.id);
  if (!profId) return { erreur: 'Votre compte n’est relié à aucune fiche du personnel : le secrétariat fait le lien.' };
  if (!ISO.test(String(du || '')) || !ISO.test(String(au || '')) || au < du) return { erreur: 'Donnez une date de début et une date de fin (la fin après le début).' };
  if (!MOTIFS[motif]) return { erreur: 'Choisissez un motif.' };
  const { seances } = seancesPourEspace(user, du, au);
  const miennes = (seances || []).filter(s => !s.visite && !s.annule);
  const sectionDe = s => db.prepare('SELECT section FROM horaire_seance WHERE id = ?').get(s.id)?.section || null;
  const id = db.transaction(() => {
    const a = db.prepare(`INSERT INTO absence_prof (user_id, professeur_id, du, au, motif, remarque, signale_par) VALUES (?,?,?,?,?,?,?)`)
      .run(user?.id || null, profId, du, au, motif, String(remarque || '').trim().slice(0, 2000) || null, parNom).lastInsertRowid;
    const ins = db.prepare(`INSERT OR IGNORE INTO absence_prof_seance (absence_id, seance_id, date, heure_debut, heure_fin, cours_code, ue_num, section, cours_nom)
      VALUES (?,?,?,?,?,?,?,?,?)`);
    for (const s of miennes) ins.run(a, s.id, s.date, s.heure_debut, s.heure_fin, s.cours_code, s.ue_num, sectionDe(s), s.cours_nom || s.matiere || null);
    return a;
  })();
  const nom = nomProf(profId);
  const titre = `Absence signalée : ${nom}, ${du === au ? `le ${fr(du)}` : `du ${fr(du)} au ${fr(au)}`}`;
  const corps = `${MOTIFS[motif]} — ${miennes.length} séance(s) concernée(s). À décider séance par séance.`;
  const lien = '/organisation?onglet=absences-prof';
  notifier({ titre, corps, lien, role: 'secretariat' });
  for (const sec of new Set(miennes.map(sectionDe).filter(Boolean))) notifier({ titre, corps, lien, role: 'coordination', section: sec });
  return { ok: true, id, seances: miennes.length };
}

function lire(a) {
  const seances = db.prepare('SELECT * FROM absence_prof_seance WHERE absence_id = ? ORDER BY date, heure_debut').all(a.id)
    .map(s => ({ ...s, decision_libelle: s.decision ? DECISIONS[s.decision] : null, remplacant: s.remplacant_id ? nomProf(s.remplacant_id) : null }));
  const decidees = seances.filter(s => s.decision).length;
  return { ...a, professeur: nomProf(a.professeur_id), motif_libelle: MOTIFS[a.motif] || a.motif, seances,
    etat: a.retiree_le ? 'retiree' : !seances.length || decidees === seances.length ? 'traitee' : decidees ? 'en_cours' : 'a_traiter',
    a_prevenir: seances.filter(s => s.decision && s.decision !== 'maintenue' && !s.prevenus_le).length };
}

/** Les absences d'un professeur (son écran). */
export function mesAbsences(user) {
  migrerAbsences();
  const profId = user?.apercuProfId || profDuCompte(user?.id);
  if (!profId) return { relie: false, absences: [] };
  return { relie: true, motifs: MOTIFS, absences: db.prepare('SELECT * FROM absence_prof WHERE professeur_id = ? ORDER BY du DESC, id DESC LIMIT 50').all(profId).map(lire) };
}

/** Retirer : le professeur, tant qu'aucune séance n'est décidée. */
export function retirer(user, id) {
  migrerAbsences();
  const profId = user?.apercuProfId || profDuCompte(user?.id);
  const a = db.prepare('SELECT * FROM absence_prof WHERE id = ? AND professeur_id = ?').get(Number(id), profId);
  if (!a || a.retiree_le) return { erreur: 'Absence introuvable.', code: 404 };
  if (db.prepare('SELECT 1 FROM absence_prof_seance WHERE absence_id = ? AND decision IS NOT NULL').get(a.id)) return { erreur: 'Le secrétariat a déjà décidé de séances : demandez-lui de revenir en arrière.', code: 409 };
  db.prepare("UPDATE absence_prof SET retiree_le = datetime('now') WHERE id = ?").run(a.id);
  notifier({ titre: `Absence retirée : ${nomProf(a.professeur_id)} (${fr(a.du)})`, corps: 'Le professeur a retiré son signalement.', lien: '/organisation?onglet=absences-prof', role: 'secretariat' });
  return { ok: true };
}

/** Le registre (secrétariat, direction ; coordination : ses sections, en lecture). */
export function registre({ sections = null, tout = false } = {}) {
  migrerAbsences();
  const l = db.prepare(`SELECT * FROM absence_prof WHERE ${tout ? '1' : "retiree_le IS NULL AND au >= date('now', '-60 days')"} ORDER BY du DESC, id DESC LIMIT 300`).all().map(lire);
  return sections ? l.filter(a => a.seances.some(s => sections.includes(s.section))) : l;
}

/** Décider une séance : écrit dans l'horaire. Rend { ok } ou { erreur, code }. */
export function decider(absenceId, seanceId, { decision, remplacant_id, date, heure_debut, heure_fin, mot }, parNom) {
  migrerAbsences();
  const ls = db.prepare('SELECT * FROM absence_prof_seance WHERE absence_id = ? AND seance_id = ?').get(Number(absenceId), Number(seanceId));
  const a = db.prepare('SELECT * FROM absence_prof WHERE id = ?').get(Number(absenceId));
  if (!ls || !a || a.retiree_le) return { erreur: 'Séance introuvable dans cette absence.', code: 404 };
  if (!DECISIONS[decision]) return { erreur: 'Décision inconnue.', code: 400 };
  const s = db.prepare('SELECT * FROM horaire_seance WHERE id = ?').get(ls.seance_id);
  if (!s) return { erreur: 'La séance n’est plus dans l’horaire.', code: 410 };
  const m = String(mot || '').trim().slice(0, 500) || null;
  let rempl = null, nd = null, nhd = null, nhf = null;
  if (decision === 'remplacee') {
    rempl = Number(remplacant_id) || null;
    if (!rempl || !db.prepare('SELECT 1 FROM professeur WHERE id = ?').get(rempl)) return { erreur: 'Choisissez qui remplace.', code: 400 };
    if (rempl === a.professeur_id) return { erreur: 'Le remplaçant est le professeur absent.', code: 400 };
  }
  if (decision === 'deplacee') {
    nd = String(date || ''); nhd = String(heure_debut || ''); nhf = String(heure_fin || '');
    if (!ISO.test(nd) || !HEURE.test(nhd) || !HEURE.test(nhf) || nhf <= nhd) return { erreur: 'Donnez la nouvelle date et les heures (la fin après le début).', code: 400 };
  }
  const hm = h => { const [x, y] = String(h).split(':').map(Number); return x * 60 + y; };
  const motHoraire = `Absence de ${nomProf(a.professeur_id)}${m ? ` — ${m}` : ''}`;
  db.transaction(() => {
    // Revenir sur une décision : l'horaire reprend l'état d'avant (les colonnes gardées sur la ligne de l'absence).
    const orig = { date: ls.date, heure_debut: ls.heure_debut, heure_fin: ls.heure_fin, prof: a.professeur_id };
    const base = `modifie_lucie = 1, modifie_par = ?, modifie_le = datetime('now')`;
    if (decision === 'annulee') db.prepare(`UPDATE horaire_seance SET annule = 1, professeur_id = ?, date = ?, heure_debut = ?, heure_fin = ?, commentaire = ?, ${base} WHERE id = ?`)
      .run(orig.prof, orig.date, orig.heure_debut, orig.heure_fin, motHoraire, parNom, s.id);
    if (decision === 'remplacee') db.prepare(`UPDATE horaire_seance SET annule = 0, professeur_id = ?, date = ?, heure_debut = ?, heure_fin = ?, commentaire = ?, ${base} WHERE id = ?`)
      .run(rempl, orig.date, orig.heure_debut, orig.heure_fin, `Remplacement — ${motHoraire}`, parNom, s.id);
    if (decision === 'deplacee') db.prepare(`UPDATE horaire_seance SET annule = 0, professeur_id = ?, date = ?, heure_debut = ?, heure_fin = ?, minutes = ?, commentaire = ?, ${base} WHERE id = ?`)
      .run(orig.prof, nd, nhd, nhf, hm(nhf) - hm(nhd), `Déplacée — ${motHoraire} (prévue le ${fr(orig.date)})`, parNom, s.id);
    if (decision === 'maintenue') db.prepare(`UPDATE horaire_seance SET annule = 0, professeur_id = ?, date = ?, heure_debut = ?, heure_fin = ?, ${base} WHERE id = ?`)
      .run(orig.prof, orig.date, orig.heure_debut, orig.heure_fin, parNom, s.id);
    db.prepare(`UPDATE absence_prof_seance SET decision = ?, remplacant_id = ?, nouvelle_date = ?, nouvelle_heure_debut = ?, nouvelle_heure_fin = ?,
      mot = ?, decide_par = ?, decide_le = datetime('now'), prevenus_le = NULL, prevenus_n = NULL WHERE absence_id = ? AND seance_id = ?`)
      .run(decision, rempl, nd, nhd, nhf, m, parNom, ls.absence_id, ls.seance_id);
  })();
  return { ok: true };
}

/** Le texte que reçoivent les étudiants pour une séance décidée. */
export function texteEtudiant(s) {
  const quand = `du ${fr(s.date)}${s.heure_debut ? ` (${s.heure_debut}–${s.heure_fin || ''})` : ''}`;
  const cours = s.cours_nom || s.cours_code || 'votre cours';
  if (s.decision === 'annulee') return `La séance de ${cours} ${quand} est annulée.${s.mot ? ` ${s.mot}` : ''}`;
  if (s.decision === 'remplacee') return `La séance de ${cours} ${quand} a lieu ; elle est donnée par ${nomProf(s.remplacant_id)}.${s.mot ? ` ${s.mot}` : ''}`;
  if (s.decision === 'deplacee') return `La séance de ${cours} ${quand} est déplacée au ${fr(s.nouvelle_date)}, de ${s.nouvelle_heure_debut} à ${s.nouvelle_heure_fin}.${s.mot ? ` ${s.mot}` : ''}`;
  return null;
}

/** Les inscrits d'une séance : ceux du cours (règle de Mes cours, `etudiant_inscription` de l'UE), actifs. */
export function inscritsDe(s) {
  const annee = db.prepare('SELECT annee_scolaire FROM horaire_seance WHERE id = ?').get(s.seance_id)?.annee_scolaire;
  if (!annee || !s.ue_num) return [];
  return db.prepare(`SELECT DISTINCT e.id, e.nom, e.prenom, e.email_ecole FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
    WHERE i.annee_scolaire = ? AND i.ue_num = ? AND COALESCE(e.actif, 1) = 1`).all(annee, s.ue_num).map(e => ({ ...e, annee }));
}

/** Le professeur apprend la décision (fil de son tableau de bord). */
export function aviserProfesseur(absenceId) {
  const a = db.prepare('SELECT * FROM absence_prof WHERE id = ?').get(Number(absenceId));
  if (!a?.user_id) return;
  const decid = db.prepare('SELECT * FROM absence_prof_seance WHERE absence_id = ? AND decision IS NOT NULL').all(a.id);
  if (!decid.length) return;
  notifier({ titre: `Votre absence du ${fr(a.du)} : ${decid.length} séance(s) décidée(s)`,
    corps: decid.map(s => `${fr(s.date)} ${s.cours_nom || s.cours_code} : ${DECISIONS[s.decision]}${s.decision === 'remplacee' ? ` (${nomProf(s.remplacant_id)})` : ''}`).join(' · '),
    lien: '/mes-cours', userId: a.user_id });
}
