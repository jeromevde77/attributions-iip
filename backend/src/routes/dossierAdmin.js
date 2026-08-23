// ─────────────────────────────────────────────────────────────────────────────
// Lucie V3++ — Zone 1 : dossier administratif du membre du personnel
//
// Trois volets, tous rattachés à `professeur` :
//   · pièces du dossier (piece_dossier / piece_type) — circ. 9760 annexes
//   · absences (absence_personnel) — CAMMAT, circ. 9626
//   · entretiens et rendez-vous (entretien_personnel)
//
// Aucune duplication : les titres restent dans `titre_capacite`, les documents
// générés dans `document_archive` ; piece_dossier ne fait que les référencer.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';
import { declencher, anneeActive } from '../services/echeancier.js';

const r = Router();
const peutEcrire = roleRequired('admin', 'editeur');

// ═══ PIÈCES DU DOSSIER ══════════════════════════════════════════════════════

/**
 * Renvoie la checklist complète : chaque type de pièce attendu, complété par
 * l'état réel s'il existe. Les pièces non encore créées apparaissent comme
 * « manquantes » sans qu'il faille les matérialiser en base.
 */
r.get('/:profId/pieces', authRequired, (req, res) => {
  const profId = Number(req.params.profId);
  const prof = db.prepare('SELECT id, nom, prenom, statut FROM professeur WHERE id = ?').get(profId);
  if (!prof) return res.status(404).json({ error: 'membre du personnel introuvable' });

  const types = db.prepare('SELECT * FROM piece_type WHERE actif = 1 ORDER BY ordre, code').all();
  const existantes = db.prepare(`
    SELECT p.*, d.nom_fichier, t.intitule AS titre_intitule
      FROM piece_dossier p
      LEFT JOIN document_archive d ON d.id = p.document_archive_id
      LEFT JOIN titre_capacite   t ON t.id = p.titre_capacite_id
     WHERE p.professeur_id = ?
  `).all(profId);
  const parCode = new Map(existantes.map(p => [p.code_piece, p]));

  // Le titre de capacité est déjà en base : on le considère présent d'office.
  const titres = db.prepare(
    'SELECT id, intitule FROM titre_capacite WHERE professeur_id = ? LIMIT 1'
  ).all(profId);

  const aujourdhui = new Date().toISOString().slice(0, 10);

  const pieces = types.map(t => {
    const e = parCode.get(t.code);
    let statut = e?.statut || 'manquante';

    // Pièce non requise selon le statut du membre du personnel
    if (!e && t.obligatoire === 'jamais') statut = 'non_requise';
    if (!e && t.obligatoire === 'temporaire' && prof.statut && prof.statut !== 'MDP') {
      statut = 'non_requise';
    }
    // Titre présent dans titre_capacite → considéré au dossier
    if (!e && t.code === 'titre' && titres.length) statut = 'recue';
    // Expiration (ex. extrait de casier)
    if (e?.date_expiration && e.date_expiration < aujourdhui) statut = 'expiree';

    return {
      id: e?.id || null,
      code_piece: t.code,
      libelle: t.libelle,
      annexe: t.annexe,
      base_legale: t.base_legale,
      obligatoire: t.obligatoire,
      delai_jours: t.delai_jours,
      template_slug: t.template_slug,
      statut,
      date_reception: e?.date_reception || (t.code === 'titre' && titres.length ? null : null),
      date_transmission: e?.date_transmission || null,
      date_expiration: e?.date_expiration || null,
      document_archive_id: e?.document_archive_id || null,
      nom_fichier: e?.nom_fichier || null,
      titre_intitule: e?.titre_intitule || titres[0]?.intitule || null,
      notes: e?.notes || null,
    };
  });

  const requises = pieces.filter(p => p.statut !== 'non_requise');
  const completes = requises.filter(p => ['recue', 'transmise'].includes(p.statut));

  res.json({
    professeur: prof,
    completude: { requises: requises.length, completes: completes.length,
                  manquantes: requises.length - completes.length },
    pieces,
  });
});

/** Crée ou met à jour l'état d'une pièce (upsert par professeur + code). */
r.put('/:profId/pieces/:code', authRequired, peutEcrire, (req, res) => {
  const profId = Number(req.params.profId);
  const code = req.params.code;
  const { statut, date_reception, date_transmission, date_expiration,
          document_archive_id, notes } = req.body;

  const type = db.prepare('SELECT * FROM piece_type WHERE code = ?').get(code);
  if (!type) return res.status(400).json({ error: 'type de pièce inconnu' });

  const statutsValides = ['manquante', 'a_demander', 'recue', 'transmise', 'non_requise', 'expiree'];
  if (statut && !statutsValides.includes(statut)) {
    return res.status(400).json({ error: 'statut invalide' });
  }

  // Expiration calculée si la pièce a une durée de validité
  let expiration = date_expiration ?? null;
  if (!expiration && type.duree_validite_mois && date_reception) {
    const d = new Date(date_reception + 'T00:00:00Z');
    d.setUTCMonth(d.getUTCMonth() + type.duree_validite_mois);
    expiration = d.toISOString().slice(0, 10);
  }

  db.prepare(`
    INSERT INTO piece_dossier
      (professeur_id, code_piece, statut, date_reception, date_transmission,
       date_expiration, document_archive_id, notes, modifie_le)
    VALUES (?,?,?,?,?,?,?,?, datetime('now'))
    ON CONFLICT(professeur_id, code_piece) DO UPDATE SET
      statut            = COALESCE(excluded.statut, statut),
      date_reception    = excluded.date_reception,
      date_transmission = excluded.date_transmission,
      date_expiration   = excluded.date_expiration,
      document_archive_id = COALESCE(excluded.document_archive_id, document_archive_id),
      notes             = excluded.notes,
      modifie_le        = datetime('now')
  `).run(profId, code, statut || 'manquante', date_reception || null,
         date_transmission || null, expiration, document_archive_id || null,
         notes || null);

  res.json({ ok: true });
});

// ═══ ABSENCES ═══════════════════════════════════════════════════════════════

const TYPES_ABSENCE = ['maladie_1j', 'maladie', 'maternite', 'accident_travail',
                       'accident_hors_service', 'anrj', 'greve', 'cad', 'autre'];

r.get('/:profId/absences', authRequired, (req, res) => {
  const lignes = db.prepare(`
    SELECT a.*, p.nom AS remplacant_nom, p.prenom AS remplacant_prenom
      FROM absence_personnel a
      LEFT JOIN professeur p ON p.id = a.remplacant_prof_id
     WHERE a.professeur_id = ?
     ORDER BY a.date_debut DESC
  `).all(Number(req.params.profId));

  // Total de jours calendrier sur l'année en cours
  const annee = req.query.annee || anneeActive(db);
  const total = lignes
    .filter(l => l.annee_scolaire === annee)
    .reduce((n, l) => {
      if (!l.date_fin) return n + 1;
      const j = Math.round((new Date(l.date_fin) - new Date(l.date_debut)) / 86400000) + 1;
      return n + Math.max(1, j);
    }, 0);

  res.json({ absences: lignes, jours_annee: total, annee });
});

r.post('/:profId/absences', authRequired, peutEcrire, (req, res) => {
  const profId = Number(req.params.profId);
  const { type, date_debut, date_fin, code_cad, code_di, motif,
          cammat_declare, certificat_recu, notes } = req.body;

  if (!type || !TYPES_ABSENCE.includes(type)) {
    return res.status(400).json({ error: 'type d\'absence invalide' });
  }
  if (!date_debut) return res.status(400).json({ error: 'date de début requise' });
  if (date_fin && date_fin < date_debut) {
    return res.status(400).json({ error: 'la date de fin précède la date de début' });
  }

  const annee = req.body.annee_scolaire || anneeActive(db);
  const info = db.prepare(`
    INSERT INTO absence_personnel
      (professeur_id, type, date_debut, date_fin, code_cad, code_di, motif,
       cammat_declare, certificat_recu, annee_scolaire, notes, cree_par)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(profId, type, date_debut, date_fin || null, code_cad || null,
         code_di || null, motif || null, cammat_declare ? 1 : 0,
         certificat_recu ? 1 : 0, annee, notes || null,
         req.user.nom || req.user.email || `#${req.user.id}`);

  const id = Number(info.lastInsertRowid);

  // Échéances déclenchées : déclaration CAMMAT, remplacement au-delà de
  // 10 jours ouvrables (circ. 9760 III.2.8).
  const prof = db.prepare('SELECT nom, prenom FROM professeur WHERE id = ?').get(profId);
  try {
    declencher(db, {
      ancre: 'absence_debut', dateRef: date_debut, anneeScolaire: annee,
      sourceType: 'absence', sourceId: id,
      libelle: prof ? `${prof.nom} ${prof.prenom}` : null,
    });
  } catch (e) { console.error('[dossier] échéances absence :', e.message); }

  res.json(db.prepare('SELECT * FROM absence_personnel WHERE id = ?').get(id));
});

r.patch('/absences/:id', authRequired, peutEcrire, (req, res) => {
  const id = Number(req.params.id);
  const permis = ['type', 'date_debut', 'date_fin', 'code_cad', 'code_di', 'motif',
                  'cammat_declare', 'cammat_le', 'certificat_recu', 'certificat_le',
                  'controle_demande', 'remplacement_requis', 'remplacant_prof_id', 'notes'];
  const champs = [], vals = [];
  for (const k of permis) {
    if (req.body[k] !== undefined) { champs.push(`${k} = ?`); vals.push(req.body[k]); }
  }
  if (!champs.length) return res.status(400).json({ error: 'rien à modifier' });
  vals.push(id);
  db.prepare(`UPDATE absence_personnel SET ${champs.join(', ')} WHERE id = ?`).run(...vals);
  res.json(db.prepare('SELECT * FROM absence_personnel WHERE id = ?').get(id));
});

r.delete('/absences/:id', authRequired, peutEcrire, (req, res) => {
  db.prepare('DELETE FROM absence_personnel WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ═══ ENTRETIENS ═════════════════════════════════════════════════════════════

const TYPES_ENTRETIEN = ['accueil', 'suivi', 'visite_classe', 'evaluation',
                         'recadrage', 'fin_fonction', 'autre'];

r.get('/:profId/entretiens', authRequired, (req, res) => {
  const lignes = db.prepare(`
    SELECT * FROM entretien_personnel
     WHERE professeur_id = ?
     ORDER BY COALESCE(date_tenue, date_prevue) DESC
  `).all(Number(req.params.profId));

  // Les entretiens confidentiels ne sont lisibles que par un administrateur
  const visibles = req.user.role === 'admin'
    ? lignes
    : lignes.map(l => l.confidentiel
        ? { ...l, compte_rendu_html: null, masque: true }
        : l);

  res.json({ entretiens: visibles });
});

r.post('/:profId/entretiens', authRequired, peutEcrire, (req, res) => {
  const profId = Number(req.params.profId);
  const { type, date_prevue, date_tenue, mene_par, lieu,
          compte_rendu_html, confidentiel } = req.body;

  if (!type || !TYPES_ENTRETIEN.includes(type)) {
    return res.status(400).json({ error: 'type d\'entretien invalide' });
  }
  if (!date_prevue && !date_tenue) {
    return res.status(400).json({ error: 'une date est requise' });
  }

  const info = db.prepare(`
    INSERT INTO entretien_personnel
      (professeur_id, type, date_prevue, date_tenue, mene_par, lieu,
       compte_rendu_html, confidentiel, annee_scolaire, cree_par)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(profId, type, date_prevue || null, date_tenue || null,
         mene_par || req.user.nom || null, lieu || null,
         compte_rendu_html || null, confidentiel ? 1 : 0,
         anneeActive(db), req.user.nom || req.user.email || `#${req.user.id}`);

  res.json(db.prepare('SELECT * FROM entretien_personnel WHERE id = ?')
             .get(Number(info.lastInsertRowid)));
});

r.patch('/entretiens/:id', authRequired, peutEcrire, (req, res) => {
  const id = Number(req.params.id);
  const permis = ['type', 'date_prevue', 'date_tenue', 'mene_par', 'lieu',
                  'compte_rendu_html', 'confidentiel'];
  const champs = [], vals = [];
  for (const k of permis) {
    if (req.body[k] !== undefined) { champs.push(`${k} = ?`); vals.push(req.body[k]); }
  }
  if (!champs.length) return res.status(400).json({ error: 'rien à modifier' });
  champs.push("modifie_le = datetime('now')");
  vals.push(id);
  db.prepare(`UPDATE entretien_personnel SET ${champs.join(', ')} WHERE id = ?`).run(...vals);
  res.json(db.prepare('SELECT * FROM entretien_personnel WHERE id = ?').get(id));
});

r.delete('/entretiens/:id', authRequired, roleRequired('admin'), (req, res) => {
  db.prepare('DELETE FROM entretien_personnel WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ═══ JOURNAL DU DOSSIER ═════════════════════════════════════════════════════

/**
 * GET /:profId/journal — le fil chronologique complet : remarques libres +
 * événements dérivés des tables existantes (jamais recopiés). Une remarque
 * confidentielle n'est lisible que par un administrateur ou son auteur.
 */
r.get('/:profId/journal', authRequired, (req, res) => {
  const profId = Number(req.params.profId);
  const estAdmin = req.user.role === 'admin';
  const items = [];

  // Remarques libres
  for (const n of db.prepare(
    'SELECT * FROM journal_personnel WHERE professeur_id = ? ORDER BY cree_le DESC'
  ).all(profId)) {
    const lisible = !n.confidentiel || estAdmin || n.auteur_user_id === req.user.id;
    items.push({
      genre: 'remarque', id: n.id, date: n.cree_le,
      contenu: lisible ? n.contenu : null, masque: !lisible,
      confidentiel: !!n.confidentiel, auteur: n.auteur,
      supprimable: estAdmin,
    });
  }

  // Entretiens (contenu déjà protégé par sa propre règle)
  for (const e of db.prepare(
    'SELECT * FROM entretien_personnel WHERE professeur_id = ?'
  ).all(profId)) {
    items.push({
      genre: 'entretien', id: e.id, date: e.date_tenue || e.date_prevue,
      contenu: `Entretien ${e.type}${e.date_tenue ? ' tenu' : ' prévu'}${e.mene_par ? ' — ' + e.mene_par : ''}`,
      confidentiel: !!e.confidentiel, auteur: e.cree_par,
    });
  }

  // Absences
  for (const a of db.prepare(
    'SELECT * FROM absence_personnel WHERE professeur_id = ?'
  ).all(profId)) {
    items.push({
      genre: 'absence', id: a.id, date: a.date_debut,
      contenu: `Absence (${a.type})${a.date_fin ? ' du ' + a.date_debut + ' au ' + a.date_fin : ''}`,
      auteur: a.cree_par,
    });
  }

  // Pièces du dossier (réception et transmission)
  for (const p of db.prepare(
    'SELECT * FROM piece_dossier WHERE professeur_id = ?'
  ).all(profId)) {
    const type = db.prepare('SELECT libelle FROM piece_type WHERE code = ?').get(p.code_piece);
    if (p.date_reception) items.push({
      genre: 'piece', date: p.date_reception,
      contenu: `Pièce reçue : ${type?.libelle || p.code_piece}`,
    });
    if (p.date_transmission) items.push({
      genre: 'piece', date: p.date_transmission,
      contenu: `Pièce transmise (GEDI) : ${type?.libelle || p.code_piece}`,
    });
  }

  // Engagement
  const prof = db.prepare('SELECT date_engagement FROM professeur WHERE id = ?').get(profId);
  if (prof?.date_engagement) {
    items.push({ genre: 'engagement', date: prof.date_engagement,
                 contenu: 'Entrée en fonction' });
  }

  items.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  res.json({ items });
});

/** Ajouter une remarque (admin et éditeur). Inaltérable après création. */
r.post('/:profId/journal', authRequired, peutEcrire, (req, res) => {
  const profId = Number(req.params.profId);
  const { contenu, confidentiel } = req.body;
  if (!contenu || !String(contenu).trim()) {
    return res.status(400).json({ error: 'contenu requis' });
  }
  if (!db.prepare('SELECT 1 FROM professeur WHERE id = ?').get(profId)) {
    return res.status(404).json({ error: 'membre du personnel introuvable' });
  }
  const info = db.prepare(`
    INSERT INTO journal_personnel (professeur_id, contenu, confidentiel, auteur, auteur_user_id)
    VALUES (?,?,?,?,?)
  `).run(profId, String(contenu).trim(), confidentiel ? 1 : 0,
         req.user.nom || req.user.email || `#${req.user.id}`, req.user.id);
  res.json(db.prepare('SELECT * FROM journal_personnel WHERE id = ?')
             .get(Number(info.lastInsertRowid)));
});

/** Suppression : administrateur seul — les remarques ne se modifient pas. */
r.delete('/journal/:id', authRequired, roleRequired('admin'), (req, res) => {
  db.prepare('DELETE FROM journal_personnel WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ═══ VUE D'ENSEMBLE — complétude de tous les dossiers ═══════════════════════

r.get('/completude', authRequired, (req, res) => {
  const types = db.prepare(
    "SELECT code, obligatoire FROM piece_type WHERE actif = 1 AND obligatoire != 'jamais'"
  ).all();
  const codesRequis = types.map(t => t.code);

  const profs = db.prepare(`
    SELECT id, nom, prenom, statut FROM professeur ORDER BY nom, prenom
  `).all();

  const pieces = db.prepare(
    "SELECT professeur_id, code_piece, statut FROM piece_dossier"
  ).all();
  const parProf = new Map();
  for (const p of pieces) {
    if (!parProf.has(p.professeur_id)) parProf.set(p.professeur_id, new Map());
    parProf.get(p.professeur_id).set(p.code_piece, p.statut);
  }

  const lignes = profs.map(p => {
    const m = parProf.get(p.id) || new Map();
    const ok = codesRequis.filter(c => ['recue', 'transmise'].includes(m.get(c))).length;
    return { ...p, requises: codesRequis.length, completes: ok,
             manquantes: codesRequis.length - ok };
  });

  res.json({
    total: lignes.length,
    incomplets: lignes.filter(l => l.manquantes > 0).length,
    lignes,
  });
});

export default r;
