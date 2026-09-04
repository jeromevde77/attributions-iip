// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Aménagements raisonnables (décret du 30 juin 2016, enseignement
// pour adultes inclusif, mis à jour au 21 août 2025)
//
// Un aménagement raisonnable est matériel ou pédagogique. Il « ne remet pas en
// cause les acquis d'apprentissage définis dans les dossiers pédagogiques, mais
// porte sur la manière d'y accéder et de les évaluer » (art. 7 § 1er). Cette
// phrase commande tout le module : on n'y trouve pas de dispense d'acquis.
//
// La procédure suit quatre temps :
//   1. l'étudiant sollicite, et fournit un document à l'appui (art. 7 § 2)
//   2. la personne de référence accueille, recueille et introduit la demande,
//      puis fait rapport au Conseil des études (art. 5)
//   3. le Conseil des études rend une DÉCISION MOTIVÉE (art. 6 § 2)
//   4. la direction notifie, et en communique copie à la personne de référence
//
// Deux conséquences que le décret attache aux pièces, et qu'il serait facile
// d'oublier :
//   · un DOCUMENT PROBANT exonère des droits d'inscription (art. 8)
//   · un RAPPORT DE SPÉCIALISTE date de moins de cinq ans à la première
//     demande, et ne se renouvelle PAS chaque année, sauf évolution médicale
//
// Le secret professionnel s'applique aux échanges (art. 5, dernier alinéa) :
// la nature du handicap n'a pas à circuler, seuls les aménagements retenus.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';

const r = Router();

// Catalogue indicatif, librement complétable. La distinction matériel /
// pédagogique est celle de l'article 7 § 1er.
const CATALOGUE = [
  // Accès aux apprentissages
  { code: 'TEMPS_SUP', nature: 'pedagogique', libelle: "Temps supplémentaire lors des évaluations",
    detail: "Un tiers-temps est l'usage ; à préciser selon la situation." },
  { code: 'LOCAL_ISOLE', nature: 'materiel', libelle: "Local isolé ou à effectif réduit" },
  { code: 'SUPPORTS_NUM', nature: 'materiel', libelle: "Supports de cours en format numérique accessible" },
  { code: 'POLICE_ADAPTEE', nature: 'materiel', libelle: "Documents en gros caractères ou police adaptée" },
  { code: 'ENREGISTREMENT', nature: 'materiel', libelle: "Autorisation d'enregistrer les cours" },
  { code: 'PRISE_NOTES', nature: 'materiel', libelle: "Aide à la prise de notes" },
  { code: 'PLACE_RESERVEE', nature: 'materiel', libelle: "Place réservée dans le local" },
  { code: 'INTERPRETE', nature: 'materiel', libelle: "Interprète en langue des signes" },
  { code: 'ORDINATEUR', nature: 'materiel', libelle: "Usage d'un ordinateur avec correcteur" },
  { code: 'PAUSES', nature: 'pedagogique', libelle: "Pauses aménagées durant les épreuves" },
  { code: 'ORAL_ECRIT', nature: 'pedagogique', libelle: "Passage d'une épreuve écrite à l'oral, ou l'inverse" },
  { code: 'CONSIGNES', nature: 'pedagogique', libelle: "Consignes reformulées ou lues" },
  { code: 'ETALEMENT', nature: 'pedagogique', libelle: "Étalement des épreuves sur plusieurs séances" },
  { code: 'ABSENCE_JUST', nature: 'pedagogique', libelle: "Souplesse sur les absences liées aux soins" },
  { code: 'STAGE_ADAPTE', nature: 'pedagogique', libelle: "Adaptation des modalités de stage" },
  { code: 'AUTRE', nature: 'pedagogique', libelle: "Autre — à décrire" },
];

export function migrerAmenagements(dbx) {
  try {
    dbx.exec(`
    -- Un dossier par étudiant et par année : la demande se renouvelle, mais
    -- le rapport de spécialiste, lui, reste valable (art. 7 § 2, 2°).
    CREATE TABLE IF NOT EXISTS amenagement_dossier (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      etudiant_id       INTEGER NOT NULL,
      annee_scolaire    TEXT NOT NULL,
      statut            TEXT NOT NULL DEFAULT 'demande',
        -- demande | instruction | accepte | partiel | refuse | recours
      date_demande      TEXT,
      personne_reference TEXT,
      -- Pièce produite à l'appui (art. 7 § 2)
      piece_type        TEXT,          -- probant | rapport_specialiste
      piece_date        TEXT,
      piece_auteur      TEXT,
      piece_reference   TEXT,
      -- Décision du Conseil des études (art. 6 § 2)
      cde_date          TEXT,
      cde_motivation    TEXT,
      delai_mise_oeuvre TEXT,
      conditions_particulieres TEXT,
      -- Notification par la direction (art. 6 § 2, alinéa 3)
      notifie_le        TEXT,
      notifie_par       TEXT,          -- recommande | courriel | main_propre
      -- Recours devant la Commission de l'enseignement pour adultes inclusif
      recours_le        TEXT,
      recours_issue     TEXT,
      besoins           TEXT,          -- difficultés entravant le parcours
      remarques         TEXT,
      cree_par          TEXT,
      maj_le            TEXT DEFAULT (datetime('now')),
      UNIQUE(etudiant_id, annee_scolaire)
    );

    CREATE TABLE IF NOT EXISTS amenagement_mesure (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      dossier_id   INTEGER NOT NULL REFERENCES amenagement_dossier(id) ON DELETE CASCADE,
      code         TEXT,
      nature       TEXT,               -- materiel | pedagogique
      libelle      TEXT NOT NULL,
      precisions   TEXT,
      portee       TEXT,               -- toutes | cours | epreuves | stage
      ue_num       INTEGER,            -- NULL = toutes les UE
      accorde      INTEGER NOT NULL DEFAULT 1,
      motif_refus  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_amenagement_mesure ON amenagement_mesure(dossier_id);

    -- Le cadre A du formulaire fait COCHER les unités concernées : la demande
    -- ne porte pas toujours sur toute l'année.
    CREATE TABLE IF NOT EXISTS amenagement_ue (
      dossier_id INTEGER NOT NULL REFERENCES amenagement_dossier(id) ON DELETE CASCADE,
      ue_num     INTEGER NOT NULL,
      PRIMARY KEY (dossier_id, ue_num)
    );
    `);

    // Les champs du formulaire que la table n'avait pas. Ajoutés un à un :
    // SQLite n'accepte pas plusieurs colonnes en une seule instruction.
    const cols = db.prepare('PRAGMA table_info(amenagement_dossier)').all().map(c0 => c0.name);
    const manquants = [
      ['soins_specifiques', 'TEXT'],   // cadre A.3 — nature des soins demandés
      ['annexes_nb', 'INTEGER'],       // cadre A.5
      ['annexes_desc', 'TEXT'],
      ['signe_etudiant_le', 'TEXT'],   // dates de signature du cadre A
      ['signe_reference_le', 'TEXT'],
      ['materiel_demande', 'INTEGER'], // cadre B.2.1 — demandés / non demandés
      ['materiel_desc', 'TEXT'],
      ['pedago_demande', 'INTEGER'],   // cadre B.2.2
      ['pedago_desc', 'TEXT'],
      ['rapport_annexes_nb', 'INTEGER'],
      ['rapport_annexes_desc', 'TEXT'],
      ['transmis_cde_le', 'TEXT'],     // cadre B.6
      ['cde_recu_le', 'TEXT'],         // cadre B.7
    ];
    for (const [nom, type] of manquants) {
      if (!cols.includes(nom)) {
        db.exec(`ALTER TABLE amenagement_dossier ADD COLUMN ${nom} ${type}`);
      }
    }
    console.log('[migration] aménagements raisonnables : dossier et mesures');
  } catch (e) { console.error('[migration] aménagements :', e.message); }
}

r.get('/catalogue', authRequired, (req, res) => res.json(CATALOGUE));

// ── Dossier d'un étudiant ───────────────────────────────────────────────────
r.get('/etudiant/:id', authRequired, (req, res) => {
  const etudId = Number(req.params.id);
  const annee = req.query.annee;

  const dossiers = db.prepare(
    'SELECT * FROM amenagement_dossier WHERE etudiant_id = ? ORDER BY annee_scolaire DESC'
  ).all(etudId);

  for (const d of dossiers) {
    d.mesures = db.prepare(
      'SELECT * FROM amenagement_mesure WHERE dossier_id = ? ORDER BY nature, libelle'
    ).all(d.id);
  }

  const courant = annee ? dossiers.find(d => d.annee_scolaire === annee) : dossiers[0];

  // Le rapport de spécialiste vaut cinq ans et ne se renouvelle pas chaque
  // année : on le cherche dans TOUT l'historique, faute de quoi on demanderait
  // à l'étudiant une pièce qu'il a déjà fournie.
  const pieceValide = (() => {
    const avec = dossiers.filter(d => d.piece_type && d.piece_date);
    if (!avec.length) return null;
    const plusRecente = avec.sort((a, b) => b.piece_date.localeCompare(a.piece_date))[0];
    if (plusRecente.piece_type === 'probant') {
      return { ...plusRecente, perime: false,
               note: "Document probant — sans limite de validité, et il exonère des droits d'inscription (art. 8)." };
    }
    const cinqAns = new Date(plusRecente.piece_date + 'T00:00:00Z');
    cinqAns.setUTCFullYear(cinqAns.getUTCFullYear() + 5);
    const perime = cinqAns < new Date();
    return {
      ...plusRecente, perime,
      note: perime
        ? "Ce rapport a plus de cinq ans : un rapport actualisé est nécessaire pour une nouvelle première demande."
        : `Rapport de spécialiste valable jusqu'au ${cinqAns.toISOString().slice(0, 10)}. `
          + "Il ne doit pas être renouvelé chaque année, sauf évolution de la situation médicale.",
    };
  })();

  // Les unités cochées de chaque dossier (cadre A.2).
  for (const d of dossiers) {
    d.ues = db.prepare('SELECT ue_num FROM amenagement_ue WHERE dossier_id = ? ORDER BY ue_num')
      .all(d.id).map(x => x.ue_num);
  }

  res.json({ dossiers, courant: courant || null, piece_valide: pieceValide,
             catalogue: CATALOGUE });
});

// ── Création et mise à jour ─────────────────────────────────────────────────
r.post('/dossier', authRequired, roleRequired('admin', 'directeur', 'directeur_adjoint',
                                              'editeur', 'secretariat'), (req, res) => {
  const d = req.body || {};
  if (!d.etudiant_id || !d.annee_scolaire) {
    return res.status(400).json({ error: 'etudiant_id et annee_scolaire requis' });
  }
  try {
    const info = db.prepare(`
      INSERT INTO amenagement_dossier
        (etudiant_id, annee_scolaire, statut, date_demande, personne_reference, besoins, cree_par)
      VALUES (?,?,?,?,?,?,?)
    `).run(Number(d.etudiant_id), d.annee_scolaire, d.statut || 'demande',
           d.date_demande || new Date().toISOString().slice(0, 10),
           d.personne_reference || null, d.besoins || null, req.user?.email || null);
    res.json({ ok: true, id: Number(info.lastInsertRowid) });
  } catch (e) {
    res.status(400).json({ error: /UNIQUE/.test(e.message)
      ? "Un dossier existe déjà pour cet étudiant et cette année." : e.message });
  }
});

// ── Les unités concernées par la demande (cadre A.2) ───────────────────────
r.put('/dossier/:id/ues', authRequired, roleRequired('admin', 'directeur',
      'directeur_adjoint', 'editeur', 'secretariat'), (req, res) => {
  const id = Number(req.params.id);
  const ues = Array.isArray(req.body?.ues) ? req.body.ues.map(Number).filter(Boolean) : [];

  db.transaction(() => {
    // On remplace l'ensemble : cocher et décocher sont le même geste.
    db.prepare('DELETE FROM amenagement_ue WHERE dossier_id = ?').run(id);
    const ins = db.prepare('INSERT OR IGNORE INTO amenagement_ue (dossier_id, ue_num) VALUES (?,?)');
    for (const n of ues) ins.run(id, n);
  })();

  res.json({ ok: true, ues });
});

r.put('/dossier/:id', authRequired, roleRequired('admin', 'directeur', 'directeur_adjoint',
                                                 'editeur', 'secretariat'), (req, res) => {
  const d = req.body || {};
  const champs = ['statut', 'date_demande', 'personne_reference', 'piece_type', 'piece_date',
                  'piece_auteur', 'piece_reference', 'cde_date', 'cde_motivation',
                  'delai_mise_oeuvre', 'conditions_particulieres', 'notifie_le', 'notifie_par',
                  'recours_le', 'recours_issue', 'besoins', 'remarques',
                  // Les champs du formulaire officiel, cadres A et B.
                  'soins_specifiques', 'annexes_nb', 'annexes_desc',
                  'signe_etudiant_le', 'signe_reference_le',
                  'materiel_demande', 'materiel_desc',
                  'pedago_demande', 'pedago_desc',
                  'rapport_annexes_nb', 'rapport_annexes_desc',
                  'transmis_cde_le', 'cde_recu_le'];
  const presents = champs.filter(k => k in d);
  if (!presents.length) return res.json({ ok: true, inchange: true });

  db.prepare(`
    UPDATE amenagement_dossier SET ${presents.map(k => `${k} = ?`).join(', ')},
      maj_le = datetime('now') WHERE id = ?
  `).run(...presents.map(k => d[k] ?? null), Number(req.params.id));

  // Le document probant emporte exonération du droit d'inscription (art. 8) :
  // le signaler plutôt que de le faire, la décision restant à la direction.
  let rappel = null;
  if (d.piece_type === 'probant') {
    const dossier = db.prepare('SELECT etudiant_id FROM amenagement_dossier WHERE id = ?')
      .get(Number(req.params.id));
    const e = dossier && db.prepare('SELECT di_exonere FROM etudiant WHERE id = ?').get(dossier.etudiant_id);
    if (e && !e.di_exonere) {
      rappel = "Ce document probant ouvre l'exonération des droits d'inscription (art. 8 du "
             + "décret). L'exonération n'est pas cochée dans la fiche réglementaire de l'étudiant.";
    }
  }
  res.json({ ok: true, rappel });
});

// ── Mesures ─────────────────────────────────────────────────────────────────
r.post('/dossier/:id/mesure', authRequired, roleRequired('admin', 'directeur',
       'directeur_adjoint', 'editeur', 'secretariat'), (req, res) => {
  const m = req.body || {};
  if (!m.libelle) return res.status(400).json({ error: 'libelle requis' });
  const info = db.prepare(`
    INSERT INTO amenagement_mesure (dossier_id, code, nature, libelle, precisions, portee, ue_num, accorde, motif_refus)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(Number(req.params.id), m.code || null, m.nature || 'pedagogique', m.libelle,
         m.precisions || null, m.portee || 'toutes',
         m.ue_num ? Number(m.ue_num) : null,
         m.accorde === false ? 0 : 1, m.motif_refus || null);
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
});

r.put('/mesure/:id', authRequired, roleRequired('admin', 'directeur', 'directeur_adjoint',
                                                'editeur', 'secretariat'), (req, res) => {
  const m = req.body || {};
  db.prepare(`
    UPDATE amenagement_mesure SET precisions = ?, portee = ?, ue_num = ?,
      accorde = ?, motif_refus = ? WHERE id = ?
  `).run(m.precisions ?? null, m.portee || 'toutes', m.ue_num ? Number(m.ue_num) : null,
         m.accorde === false ? 0 : 1, m.motif_refus || null, Number(req.params.id));
  res.json({ ok: true });
});

r.delete('/mesure/:id', authRequired, roleRequired('admin', 'directeur', 'directeur_adjoint',
                                                   'editeur', 'secretariat'), (req, res) => {
  db.prepare('DELETE FROM amenagement_mesure WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

export default r;
