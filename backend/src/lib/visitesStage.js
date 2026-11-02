/**
 * LES VISITES DE STAGE ET LA FICHE DE TRANSPORT (3.5.058, Charles, 2 novembre 2026 : « que les chargés de cours qui
 * suivent des étudiants en stage placent dans leur agenda leurs visites, avec le lieu de stage lié à l'étudiant ; et
 * que cela génère une fiche de transport, car pour certains nous payons les frais de déplacement depuis chez eux ou
 * l'école, en fonction »).
 *
 * Une VISITE appartient à un STAGE (`stage` : l'étudiant, le lieu, le professeur de stage) : le lieu et son adresse
 * ne se retapent jamais, ils viennent du stage. Elle se pose par le professeur de stage (ou par le secrétariat, la
 * coordination de la section, la direction), paraît dans son horaire de la semaine et dans son agenda (flux iCalendar
 * de Mes cours), puis se marque « faite » avec ses kilomètres aller-retour.
 *
 * LE DÉPART REMBOURSÉ EST UNE RÈGLE PAR PERSONNE (`stage_trajet`), posée par la direction ou le secrétariat :
 * « aucun » (la fiche se tient sans montant), « depuis l'école », « depuis le domicile » (l'adresse de la fiche du
 * professeur). Le taux au kilomètre est un paramètre (`stages_km_taux`) ; vide = « à régler », jamais zéro euro.
 *
 * LA FICHE DE TRANSPORT est mensuelle, par personne : les visites faites du mois, leur trajet, les kilomètres et le
 * montant. Elle se signe dans l'ordre — la personne, puis la direction (`stage_fiche_signature`, en ajout seul) ; une
 * signature vaut pour CE contenu (empreinte) et tombe si une visite change. Signée par la direction, le mois est
 * verrouillé : ses visites ne se modifient plus.
 */
import crypto from 'node:crypto';
import db from '../db/index.js';
import { getParam } from '../routes/parametres.js';
import { getUserSections, NIVEAU_DIRECTION } from '../middleware/auth.js';

export const GESTION = ['admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat', 'coordination'];
export const REGLENT = ['admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat'];
export const DEPARTS = { ecole: "depuis l'école", domicile: 'depuis le domicile', autre: 'autre départ' };
export const REGLES = { aucun: 'pas de remboursement', ecole: "remboursé depuis l'école", domicile: 'remboursé depuis le domicile' };
export const STATUTS = { prevue: 'prévue', faite: 'faite', annulee: 'annulée' };

export function migrerVisites(base = db) {
  base.exec(`
    CREATE TABLE IF NOT EXISTS stage_visite (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      stage_id      INTEGER NOT NULL,
      professeur_id INTEGER NOT NULL,
      date          TEXT NOT NULL,
      heure_debut   TEXT,
      heure_fin     TEXT,
      depart        TEXT NOT NULL DEFAULT 'ecole',
      depart_texte  TEXT,
      km_ar         REAL,
      statut        TEXT NOT NULL DEFAULT 'prevue',
      remarques     TEXT,
      cree_par      TEXT,
      cree_le       TEXT DEFAULT (datetime('now')),
      maj_le        TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_visite_prof ON stage_visite(professeur_id, date);
    CREATE INDEX IF NOT EXISTS idx_visite_stage ON stage_visite(stage_id);
    CREATE TABLE IF NOT EXISTS stage_trajet (
      professeur_id INTEGER PRIMARY KEY,
      regle         TEXT NOT NULL DEFAULT 'aucun',
      remarque      TEXT,
      maj_par       TEXT,
      maj_le        TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS stage_trajet_km (
      professeur_id INTEGER NOT NULL,
      lieu_id       INTEGER NOT NULL,
      depart        TEXT NOT NULL,
      km_ar         REAL NOT NULL,
      PRIMARY KEY (professeur_id, lieu_id, depart)
    );
    CREATE TABLE IF NOT EXISTS stage_fiche_signature (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      professeur_id INTEGER NOT NULL,
      mois          TEXT NOT NULL,
      etape         TEXT NOT NULL,
      par_id        INTEGER,
      par_nom       TEXT,
      le            TEXT DEFAULT (datetime('now')),
      empreinte     TEXT NOT NULL
    );
    CREATE TRIGGER IF NOT EXISTS stage_fiche_signature_fixe_u BEFORE UPDATE ON stage_fiche_signature
      BEGIN SELECT RAISE(ABORT, 'Une signature ne se modifie pas.'); END;
    CREATE TRIGGER IF NOT EXISTS stage_fiche_signature_fixe_d BEFORE DELETE ON stage_fiche_signature
      BEGIN SELECT RAISE(ABORT, 'Une signature ne s''efface pas.'); END;
  `);
}

// ── Qui ─────────────────────────────────────────────────────────────────────
export const profDuCompte = userId => db.prepare('SELECT professeur_id FROM utilisateur WHERE id = ?').get(Number(userId))?.professeur_id || null;
export const gere = user => GESTION.includes(user?.role);
const nomProf = id => {
  const p = db.prepare('SELECT nom, prenom FROM professeur WHERE id = ?').get(id);
  return p ? `${String(p.nom || '').toUpperCase()} ${p.prenom || ''}`.trim() : '';
};

/** Le stage, avec son étudiant et son lieu — s'il est accessible à ce compte (le professeur de stage, ou la gestion
 *  dans son périmètre). */
export function stageAccessible(user, stageId) {
  const s = db.prepare(`SELECT s.*, e.nom AS etud_nom, e.prenom AS etud_prenom,
      COALESCE(s.section, e.section_rattachement) AS sec,
      l.nom AS lieu_nom, l.service AS lieu_service, l.adresse AS lieu_adresse, l.cp AS lieu_cp, l.localite AS lieu_localite
    FROM stage s JOIN etudiant e ON e.id = s.etudiant_id LEFT JOIN stage_lieu l ON l.id = s.lieu_id WHERE s.id = ?`).get(Number(stageId));
  if (!s) return null;
  if (gere(user)) {
    const perim = getUserSections(user);
    if (perim && !perim.includes(s.sec)) return null;
    return s;
  }
  const pid = profDuCompte(user?.id);
  return pid && s.professeur_id === pid ? s : null;
}

/** Les stages qu'un professeur suit (ou, pour la gestion, ceux de son périmètre), pour une année. */
export function stagesASuivre(user, annee, profId = null) {
  // L'année de travail, et tout stage qui n'est pas fini depuis plus de deux mois (une année qui chevauche).
  const cl = ["(s.annee_scolaire = ? OR COALESCE(s.date_fin, '') >= date('now', '-60 days'))", "s.statut NOT IN ('annule', 'rompu')"], p = [annee];
  if (gere(user)) {
    if (profId) { cl.push('s.professeur_id = ?'); p.push(Number(profId)); }
    const perim = getUserSections(user);
    if (perim) { cl.push(`COALESCE(s.section, e.section_rattachement) IN (${perim.map(() => '?').join(',') || "''"})`); p.push(...perim); }
  } else {
    const pid = profDuCompte(user?.id);
    if (!pid) return [];
    cl.push('s.professeur_id = ?'); p.push(pid);
  }
  return db.prepare(`SELECT s.id, s.etudiant_id, s.ue_num, s.intitule, s.domaine, s.date_debut, s.date_fin, s.statut, s.professeur_id, s.lieu_id,
      e.nom AS etud_nom, e.prenom AS etud_prenom, COALESCE(s.section, e.section_rattachement) AS section,
      l.nom AS lieu_nom, l.adresse AS lieu_adresse, l.cp AS lieu_cp, l.localite AS lieu_localite,
      (SELECT COUNT(*) FROM stage_visite v WHERE v.stage_id = s.id AND v.statut <> 'annulee') AS nb_visites
    FROM stage s JOIN etudiant e ON e.id = s.etudiant_id LEFT JOIN stage_lieu l ON l.id = s.lieu_id
    WHERE ${cl.join(' AND ')} ORDER BY e.nom, e.prenom, s.date_debut`).all(...p)
    .map(s => ({ ...s, professeur: s.professeur_id ? nomProf(s.professeur_id) : '' }));
}

const SELECT_VISITE = `SELECT v.*, s.etudiant_id, s.lieu_id, s.ue_num, s.intitule,
    e.nom AS etud_nom, e.prenom AS etud_prenom, COALESCE(s.section, e.section_rattachement) AS section,
    l.nom AS lieu_nom, l.service AS lieu_service, l.adresse AS lieu_adresse, l.cp AS lieu_cp, l.localite AS lieu_localite
  FROM stage_visite v JOIN stage s ON s.id = v.stage_id JOIN etudiant e ON e.id = s.etudiant_id
  LEFT JOIN stage_lieu l ON l.id = s.lieu_id`;
export const adresseLieu = v => [v.lieu_adresse, [v.lieu_cp, v.lieu_localite].filter(Boolean).join(' ')].filter(Boolean).join(', ');

/** Les visites d'un professeur entre deux dates (comprises). */
export function visitesDuProf(profId, du, au) {
  return db.prepare(`${SELECT_VISITE} WHERE v.professeur_id = ? AND v.date BETWEEN ? AND ? ORDER BY v.date, v.heure_debut`).all(profId, du, au);
}

/** Les visites lisibles par ce compte, avec filtres. */
export function visites(user, { du, au, profId } = {}) {
  const cl = ['v.date BETWEEN ? AND ?'], p = [du || '0000-01-01', au || '9999-12-31'];
  if (gere(user)) {
    if (profId) { cl.push('v.professeur_id = ?'); p.push(Number(profId)); }
    const perim = getUserSections(user);
    if (perim) { cl.push(`COALESCE(s.section, e.section_rattachement) IN (${perim.map(() => '?').join(',') || "''"})`); p.push(...perim); }
  } else {
    const pid = profDuCompte(user?.id);
    if (!pid) return [];
    cl.push('v.professeur_id = ?'); p.push(pid);
  }
  return db.prepare(`${SELECT_VISITE} WHERE ${cl.join(' AND ')} ORDER BY v.date, v.heure_debut`).all(...p)
    .map(v => ({ ...v, professeur: nomProf(v.professeur_id), verrouillee: verrouille(v.professeur_id, v.date.slice(0, 7)) }));
}

// ── La règle de remboursement et le taux ────────────────────────────────────
export const regleDe = profId => db.prepare('SELECT regle FROM stage_trajet WHERE professeur_id = ?').get(profId)?.regle || 'aucun';
export function taux() {
  const t = Number(String(getParam('stages_km_taux', '') || '').replace(',', '.'));
  return Number.isFinite(t) && t > 0 ? t : null;
}
export function ecrireTaux(v) {
  const t = Number(String(v ?? '').replace(',', '.'));
  const val = Number.isFinite(t) && t > 0 ? String(t) : '';
  db.prepare(`INSERT INTO parametre (cle, valeur) VALUES ('stages_km_taux', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur`).run(val);
  return taux();
}
export function ecrireRegle(profId, regle, remarque, par) {
  if (!REGLES[regle]) throw new Error('Règle inconnue.');
  db.prepare(`INSERT INTO stage_trajet (professeur_id, regle, remarque, maj_par, maj_le) VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(professeur_id) DO UPDATE SET regle = excluded.regle, remarque = excluded.remarque, maj_par = excluded.maj_par, maj_le = excluded.maj_le`)
    .run(profId, regle, remarque || null, par || null);
}
/** Les personnes qui suivent des stages (l'année), avec leur règle et leur adresse de domicile. */
export function personnesDeStage(user, annee) {
  const ids = new Set(stagesASuivre(user, annee).map(s => s.professeur_id).filter(Boolean));
  for (const r of db.prepare('SELECT professeur_id FROM stage_trajet').all()) if (gere(user) && !getUserSections(user)) ids.add(r.professeur_id);
  return [...ids].map(id => {
    const p = db.prepare('SELECT id, nom, prenom, adresse_rue, code_postal, commune FROM professeur WHERE id = ?').get(id);
    if (!p) return null;
    const t = db.prepare('SELECT * FROM stage_trajet WHERE professeur_id = ?').get(id);
    return { id, nom: nomProf(id), domicile: [p.adresse_rue, [p.code_postal, p.commune].filter(Boolean).join(' ')].filter(Boolean).join(', '),
      regle: t?.regle || 'aucun', remarque: t?.remarque || '', maj_par: t?.maj_par || null, maj_le: t?.maj_le || null };
  }).filter(Boolean).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

/** L'adresse de départ, en clair. */
export function adresseDepart(profId, depart, texte) {
  if (depart === 'domicile') {
    const p = db.prepare('SELECT adresse_rue, code_postal, commune FROM professeur WHERE id = ?').get(profId);
    return [p?.adresse_rue, [p?.code_postal, p?.commune].filter(Boolean).join(' ')].filter(Boolean).join(', ') || 'domicile (adresse absente de la fiche)';
  }
  if (depart === 'ecole') return db.prepare('SELECT adresse FROM etablissement WHERE id = 1').get()?.adresse || "l'école";
  return texte || 'autre départ';
}

/** Les kilomètres proposés : la dernière distance encodée pour ce lieu, depuis ce départ. */
export function kmPropose(profId, lieuId, depart) {
  if (!lieuId) return null;
  return db.prepare('SELECT km_ar FROM stage_trajet_km WHERE professeur_id = ? AND lieu_id = ? AND depart = ?').get(profId, lieuId, depart)?.km_ar ?? null;
}

// ── Écrire une visite ───────────────────────────────────────────────────────
const DATE = /^\d{4}-\d{2}-\d{2}$/, HEURE = /^\d{2}:\d{2}$/;
function valider(x) {
  if (!DATE.test(String(x.date || ''))) return 'La date de la visite est requise.';
  for (const k of ['heure_debut', 'heure_fin']) if (x[k] && !HEURE.test(x[k])) return 'Heure attendue au format hh:mm.';
  if (x.heure_debut && x.heure_fin && x.heure_fin <= x.heure_debut) return "L'heure de fin vient après celle du début.";
  if (!DEPARTS[x.depart]) return 'Départ inconnu.';
  if (x.depart === 'autre' && !String(x.depart_texte || '').trim()) return "Précisez d'où part le trajet.";
  if (!STATUTS[x.statut]) return 'Statut inconnu.';
  if (x.km_ar != null && x.km_ar !== '' && !(Number(x.km_ar) >= 0 && Number(x.km_ar) < 2000)) return 'Kilomètres aller-retour : un nombre entre 0 et 2000.';
  if (x.statut === 'faite' && x.date > new Date().toISOString().slice(0, 10)) return 'Une visite à venir ne peut pas être marquée « faite ».';
  return null;
}

export function ecrireVisite(user, id, body) {
  let avant = null;
  if (id) {
    avant = db.prepare('SELECT * FROM stage_visite WHERE id = ?').get(Number(id));
    if (!avant) return { code: 404, error: 'Visite introuvable.' };
  }
  const stageId = body.stage_id ?? avant?.stage_id;
  const s = stageAccessible(user, stageId);
  if (!s) return { code: 404, error: 'Stage introuvable dans vos stages.' };
  const profId = avant?.professeur_id || s.professeur_id || (gere(user) ? Number(body.professeur_id) || null : profDuCompte(user.id));
  if (!profId) return { code: 409, error: "Ce stage n'a pas de professeur de stage : il se désigne dans la fiche du stage." };
  const x = {
    date: body.date ?? avant?.date, heure_debut: (body.heure_debut ?? avant?.heure_debut) || null, heure_fin: (body.heure_fin ?? avant?.heure_fin) || null,
    depart: body.depart ?? avant?.depart ?? (regleDe(profId) === 'domicile' ? 'domicile' : 'ecole'),
    depart_texte: (body.depart_texte ?? avant?.depart_texte) || null,
    km_ar: 'km_ar' in body ? (body.km_ar === '' || body.km_ar == null ? null : Number(String(body.km_ar).replace(',', '.'))) : avant?.km_ar ?? null,
    statut: body.statut ?? avant?.statut ?? 'prevue', remarques: ('remarques' in body ? body.remarques : avant?.remarques) || null,
  };
  const err = valider(x);
  if (err) return { code: 400, error: err };
  for (const m of new Set([avant?.date?.slice(0, 7), x.date.slice(0, 7)].filter(Boolean))) {
    if (verrouille(profId, m)) return { code: 409, error: `La fiche de transport de ${m} est signée par la direction : ses visites ne se modifient plus.` };
  }
  let vid = avant?.id;
  if (avant) {
    db.prepare(`UPDATE stage_visite SET date = ?, heure_debut = ?, heure_fin = ?, depart = ?, depart_texte = ?, km_ar = ?, statut = ?, remarques = ?,
      maj_le = datetime('now') WHERE id = ?`).run(x.date, x.heure_debut, x.heure_fin, x.depart, x.depart_texte, x.km_ar, x.statut, x.remarques, vid);
  } else {
    vid = Number(db.prepare(`INSERT INTO stage_visite (stage_id, professeur_id, date, heure_debut, heure_fin, depart, depart_texte, km_ar, statut, remarques, cree_par)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(s.id, profId, x.date, x.heure_debut, x.heure_fin, x.depart, x.depart_texte, x.km_ar, x.statut, x.remarques,
      user?.email || null).lastInsertRowid);
  }
  // La distance se retient pour la prochaine visite au même lieu, depuis le même départ.
  if (x.km_ar != null && s.lieu_id && x.depart !== 'autre') {
    db.prepare(`INSERT INTO stage_trajet_km (professeur_id, lieu_id, depart, km_ar) VALUES (?, ?, ?, ?)
      ON CONFLICT(professeur_id, lieu_id, depart) DO UPDATE SET km_ar = excluded.km_ar`).run(profId, s.lieu_id, x.depart, x.km_ar);
  }
  return { ok: true, id: vid };
}

export function supprimerVisite(user, id) {
  const v = db.prepare('SELECT * FROM stage_visite WHERE id = ?').get(Number(id));
  if (!v || !stageAccessible(user, v.stage_id)) return { code: 404, error: 'Visite introuvable.' };
  if (v.statut === 'faite') return { code: 409, error: 'Une visite faite ne se supprime pas : elle peut être annulée.' };
  if (verrouille(v.professeur_id, v.date.slice(0, 7))) return { code: 409, error: 'Le mois est signé par la direction.' };
  db.prepare('DELETE FROM stage_visite WHERE id = ?').run(v.id);
  return { ok: true };
}

// ── La fiche de transport ───────────────────────────────────────────────────
export function fiche(profId, mois) {
  const du = `${mois}-01`, au = `${mois}-31`;
  const regle = regleDe(profId), t = taux();
  const lignes = visitesDuProf(profId, du, au).filter(v => v.statut === 'faite').map(v => {
    const rembourse = regle !== 'aucun';
    // Ce qui est remboursé part du départ de la RÈGLE : un trajet encodé depuis un autre départ se signale.
    const conforme = !rembourse || v.depart === regle;
    const montant = rembourse && conforme && v.km_ar != null && t ? Math.round(v.km_ar * t * 100) / 100 : null;
    return { id: v.id, date: v.date, heure_debut: v.heure_debut, heure_fin: v.heure_fin,
      etudiant: `${String(v.etud_nom || '').toUpperCase()} ${v.etud_prenom || ''}`.trim(), lieu: v.lieu_nom || '', adresse: adresseLieu(v),
      depart: v.depart, depart_adresse: adresseDepart(profId, v.depart, v.depart_texte), km_ar: v.km_ar, montant, conforme, remarques: v.remarques };
  });
  const problemes = [];
  if (lignes.some(l => l.km_ar == null)) problemes.push('une visite faite sans kilomètres');
  if (regle !== 'aucun' && lignes.some(l => !l.conforme)) problemes.push(`une visite dont le départ n'est pas celui de la règle (${REGLES[regle]})`);
  if (regle !== 'aucun' && !t) problemes.push('le taux au kilomètre est à régler');
  const km = lignes.reduce((s, l) => s + (l.km_ar || 0), 0);
  const total = lignes.reduce((s, l) => s + (l.montant || 0), 0);
  const empreinte = crypto.createHash('sha256').update(JSON.stringify({ regle, t, lignes: lignes.map(l => [l.id, l.date, l.depart, l.km_ar, l.montant]) })).digest('hex');
  const signatures = db.prepare('SELECT * FROM stage_fiche_signature WHERE professeur_id = ? AND mois = ? ORDER BY id').all(profId, mois)
    .map(s => ({ ...s, valable: s.empreinte === empreinte }));
  return { professeur_id: profId, professeur: nomProf(profId), mois, regle, regle_libelle: REGLES[regle], taux: t, lignes,
    km: Math.round(km * 10) / 10, total: Math.round(total * 100) / 100, problemes, empreinte, signatures,
    signe_personne: signatures.some(s => s.etape === 'personne' && s.valable),
    signe_direction: signatures.some(s => s.etape === 'direction' && s.valable) };
}

export function verrouille(profId, mois) {
  const sig = db.prepare("SELECT empreinte FROM stage_fiche_signature WHERE professeur_id = ? AND mois = ? AND etape = 'direction' ORDER BY id DESC LIMIT 1").get(profId, mois);
  if (!sig) return false;
  // Verrou posé dès qu'une signature de la direction existe ET vaut encore pour le contenu.
  return fiche(profId, mois).empreinte === sig.empreinte;
}

export function signer(user, profId, mois, etape) {
  const f = fiche(profId, mois);
  if (!f.lignes.length) return { code: 409, error: 'Aucune visite faite ce mois-là : rien à signer.' };
  if (f.problemes.length) return { code: 409, error: `La fiche ne se signe pas encore : ${f.problemes.join(' ; ')}.` };
  if (etape === 'personne') {
    if (profDuCompte(user.id) !== profId) return { code: 403, error: 'Seule la personne qui a fait les visites signe sa fiche.' };
    if (f.signe_personne) return { code: 409, error: 'Déjà signée.' };
  } else if (etape === 'direction') {
    if (!NIVEAU_DIRECTION.includes(user.role)) return { code: 403, error: 'La direction seule approuve la fiche.' };
    if (!f.signe_personne) return { code: 409, error: "La personne signe d'abord sa fiche." };
    if (f.signe_direction) return { code: 409, error: 'Déjà approuvée.' };
  } else return { code: 400, error: 'Étape inconnue.' };
  const u = db.prepare('SELECT nom_complet, email FROM utilisateur WHERE id = ?').get(user.id);
  db.prepare('INSERT INTO stage_fiche_signature (professeur_id, mois, etape, par_id, par_nom, empreinte) VALUES (?, ?, ?, ?, ?, ?)')
    .run(profId, mois, etape, user.id, u?.nom_complet || u?.email || null, f.empreinte);
  return { ok: true };
}

/** Les mois où un professeur a des visites faites (pour choisir la fiche). */
export function moisAvecVisites(profId) {
  return db.prepare("SELECT DISTINCT substr(date, 1, 7) m FROM stage_visite WHERE professeur_id = ? AND statut = 'faite' ORDER BY m DESC").all(profId).map(x => x.m);
}
