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
import { authRequired, roleRequired, getUserSections } from '../middleware/auth.js';
import { sectionRattachement } from './etudiants.js';
import { peut } from '../middleware/permissions.js';
import { chargerDossier, composerPiece, chargesDeCours, TYPES_PIECE, RECOURS_DEFAUT }
  from '../lib/piecesAmenagement.js';
import { migrerCircuitAR, catalogueAR, horsCircuit, manquesA, manquesB, estPersonneReference,
  avisDuDossier, DIRECTION, DECIDE } from '../lib/circuitAR.js';

/* QUI ÉCRIT UN AMÉNAGEMENT : les rôles d'office, OU toute personne à qui
 * l'écriture a été accordée sur sa fiche (Accès Lucie → Aménagements
 * raisonnables). Voir MODULES_SUR_OCTROI dans middleware/permissions.js. */
export const ROLES_AMENAGEMENT = ['admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat'];
function peutAmenager(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
  if (ROLES_AMENAGEMENT.includes(req.user.role) || peut(req.user, 'amenagements', 'ecrire') === 'direct') return next();
  return res.status(403).json({ error: "Vous n'avez pas le droit de modifier les aménagements raisonnables." });
}

/* QUI LIT UN DOSSIER, ET DANS QUEL PÉRIMÈTRE. Les pièces portent la situation
 * de l'étudiant : elles ne sortent que pour qui peut lire le module, et dans
 * ses sections — le périmètre se pose sur chaque porte, pas sur l'entrée. */
function dossierLisible(req, res) {
  if (!ROLES_AMENAGEMENT.includes(req.user?.role) && !peut(req.user, 'amenagements', 'lire')) {
    res.status(403).json({ error: 'Accès refusé.' }); return null;
  }
  const d = chargerDossier(req.params.id);
  const perim = getUserSections(req.user);
  if (!d || (perim && d.section && !perim.includes(d.section))) {
    res.status(404).json({ error: 'dossier introuvable' }); return null;
  }
  return d;
}

const r = Router();

/* LE CIRCUIT DU DOSSIER (Charles, 2 octobre 2026) : A validée → B s'ouvre ;
   B validée par la personne de référence → les chargés de cours sont appelés,
   et le Conseil des études peut trancher. Voir lib/circuitAR.js. */
function circuitDe(d) {
  const nbMesures = db.prepare('SELECT COUNT(*) n FROM amenagement_mesure WHERE dossier_id = ?').get(d.id).n;
  const charges = (() => { try { return chargesDeCours(chargerDossier(d.id)); } catch { return []; } })();
  return {
    hors_circuit: horsCircuit(d),
    a: { valide_le: d.valide_a_le || null, valide_par: d.valide_a_par || null, manques: manquesA(d, nbMesures) },
    b: { valide_le: d.valide_b_le || null, valide_par: d.valide_b_par || null, manques: manquesB(d, nbMesures) },
    charges: charges.map(p => ({ professeur_id: p.id, nom: `${String(p.nom || '').toUpperCase()} ${p.prenom || ''}`.trim(), ues: p.ues })),
    avis: avisDuDossier(d.id),
  };
}
const CHAMPS_A = ['date_demande', 'soins_specifiques', 'annexes_nb', 'annexes_desc', 'signe_etudiant_le',
  'signe_reference_le', 'piece_type', 'piece_date', 'piece_auteur', 'piece_reference'];
const CHAMPS_B = ['materiel_demande', 'materiel_desc', 'pedago_demande',
  'pedago_desc', 'rapport_annexes_nb', 'rapport_annexes_desc', 'transmis_cde_le'];
// Ce qui se tient à jour à toute étape : qui suit le dossier, ce qui entrave le parcours.
const CHAMPS_LIBRES = ['personne_reference', 'besoins', 'remarques'];
/* LES MESURES DEMANDÉES se cochent au cadre A et s'ajustent au cadre B :
   elles restent modifiables jusqu'à la validation du rapport. */
function refusMesures(d) {
  if (!d || horsCircuit(d)) return null;
  if (d.valide_b_le) return 'Le rapport (volet B) est validé : rouvrez-le pour changer les mesures.';
  return null;
}
/* Le serveur tient le circuit : un bouton grisé n'est pas une protection. */
function refusEtape(d, champs) {
  if (!d || horsCircuit(d)) return null;
  if (champs.some(k => CHAMPS_A.includes(k)) && d.valide_a_le) return 'La demande (volet A) est validée : rouvrez-la pour la modifier.';
  if (champs.some(k => CHAMPS_B.includes(k)) && !d.valide_a_le) return 'Le rapport (volet B) s’ouvre quand la demande (volet A) est validée.';
  if (champs.some(k => CHAMPS_B.includes(k)) && d.valide_b_le) return 'Le rapport (volet B) est validé : rouvrez-le pour le modifier.';
  const decision = champs.filter(k => !CHAMPS_A.includes(k) && !CHAMPS_B.includes(k) && !CHAMPS_LIBRES.includes(k));
  if (decision.length && !d.valide_b_le) return 'La décision du Conseil se prend quand le rapport (volet B) est validé.';
  return null;
}

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
      // La décision de la Commission, quand un recours a été introduit.
      ['recours_decision_le', 'TEXT'],
      // La communication des mesures aux chargés de cours : quand, par qui,
      // à qui. Celui qui clique est celui qui signe.
      ['communique_le', 'TEXT'],
      ['communique_par', 'TEXT'],
      ['communique_a', 'TEXT'],
    ];
    for (const [nom, type] of manquants) {
      if (!cols.includes(nom)) {
        db.exec(`ALTER TABLE amenagement_dossier ADD COLUMN ${nom} ${type}`);
      }
    }
    // La mention des voies de recours se relit et se corrige à l'écran
    // (Configuration → Procédures), elle n'est pas écrite en dur.
    try {
      dbx.prepare('INSERT OR IGNORE INTO parametre (cle, valeur, label, groupe) VALUES (?,?,?,?)')
        .run('amenagement_recours', RECOURS_DEFAUT,
          'Aménagements raisonnables — mention des voies de recours (décision et notification)',
          'procedures');
    } catch (e) { console.error('[migration] aménagements, mention de recours :', e.message); }
    try { migrerCircuitAR(); } catch (e) { console.error('[migration] circuit AR :', e.message); }
    console.log('[migration] aménagements raisonnables : dossier et mesures');
  } catch (e) { console.error('[migration] aménagements :', e.message); }
}

r.get('/catalogue', authRequired, (req, res) => res.json(catalogueAR()));

// ── LE REGISTRE DE L'ANNÉE (Charles, 28 septembre 2026 : « un lien direct
// dans le rail, comme la valorisation, afin que ce soit rapidement joint »).
// Les dossiers ne se lisaient que fiche par fiche, donc ils ne se lisaient pas.
// Une ligne par dossier : l'étudiant, l'état, les dates de la procédure, les
// MESURES retenues — et rien de la nature du handicap, ni de la pièce : le
// secret professionnel s'applique (art. 5), seuls les aménagements circulent.
// Le périmètre de section s'applique comme ailleurs.
r.get('/registre', authRequired, (req, res) => {
  if (!peut(req.user, 'amenagements', 'lire')) return res.status(403).json({ error: 'Accès refusé.' });
  const annee = req.query.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  const perim = getUserSections(req.user);
  const dossiers = db.prepare(`SELECT d.id, d.etudiant_id, d.statut, d.date_demande, d.cde_date, d.notifie_le,
      d.recours_le, d.delai_mise_oeuvre, d.communique_le, e.nom, e.prenom, e.id_ecampus
    FROM amenagement_dossier d JOIN etudiant e ON e.id = d.etudiant_id
    WHERE d.annee_scolaire = ? ORDER BY e.nom, e.prenom`).all(annee);
  const mesures = db.prepare(`SELECT libelle, nature, portee, ue_num, accorde FROM amenagement_mesure
    WHERE dossier_id = ? ORDER BY nature, libelle`);
  const ues = db.prepare('SELECT ue_num FROM amenagement_ue WHERE dossier_id = ? ORDER BY ue_num');
  const lignes = [];
  for (const d of dossiers) {
    let section = null;
    try { section = sectionRattachement(d.etudiant_id, annee).section || null; } catch { /* */ }
    if (perim && section && !perim.includes(section)) continue;
    const m = mesures.all(d.id);
    const decide = ['accepte', 'partiel', 'refuse', 'recours'].includes(d.statut);
    // CE QUI RESTE À FAIRE se lit sur la ligne : une demande sans décision, une
    // décision non notifiée, un accord sans mesure — un retard ne se voit pas
    // dossier par dossier.
    const aFaire = !decide ? 'décision du Conseil à rendre'
      : !d.notifie_le ? 'décision à notifier'
      : ['accepte', 'partiel'].includes(d.statut) && !m.some(x => x.accorde) ? 'aucune mesure accordée encodée'
      : ['accepte', 'partiel'].includes(d.statut) && !d.communique_le ? 'mesures à communiquer aux chargés de cours'
      : null;
    lignes.push({ ...d, section, mesures: m, ues: ues.all(d.id).map(x => x.ue_num), a_faire: aFaire });
  }
  res.json({ annee, lignes });
});

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
             catalogue: catalogueAR(), circuit: courant ? circuitDe(courant) : null });
});

// ── Création et mise à jour ─────────────────────────────────────────────────
r.post('/dossier', authRequired, peutAmenager, (req, res) => {
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

// ── Les unités du PAE de l'étudiant ────────────────────────────────────────
// Le cadre A fait cocher les unités concernées, mais seules celles où
// l'étudiant est INSCRIT ont un sens : lui proposer les dix-neuf unités de la
// section quand il en suit six oblige à chercher dans une liste inutile.
r.get('/dossier/:id/ues-possibles', authRequired, (req, res) => {
  const d = db.prepare('SELECT etudiant_id, annee_scolaire FROM amenagement_dossier WHERE id = ?')
    .get(Number(req.params.id));
  if (!d) return res.status(404).json({ error: 'dossier introuvable' });

  const ues = db.prepare(`
    SELECT DISTINCT i.ue_num,
           (SELECT ue_nom FROM ue u WHERE u.ue_num = i.ue_num AND u.ue_nom IS NOT NULL
             ORDER BY u.annee_scolaire DESC LIMIT 1) AS ue_nom,
           (SELECT ue_niv FROM ue u WHERE u.ue_num = i.ue_num AND u.ue_niv IS NOT NULL
             ORDER BY u.annee_scolaire DESC LIMIT 1) AS ue_niv
    FROM etudiant_inscription i
    WHERE i.etudiant_id = ? AND i.annee_scolaire = ?
    ORDER BY i.ue_num
  `).all(d.etudiant_id, d.annee_scolaire);

  res.json({ annee: d.annee_scolaire, ues });
});

// ── Les unités concernées par la demande (cadre A.2) ───────────────────────
r.put('/dossier/:id/ues', authRequired, peutAmenager, (req, res) => {
  const id = Number(req.params.id);
  const dos = db.prepare('SELECT * FROM amenagement_dossier WHERE id = ?').get(id);
  const refus = refusEtape(dos, ['date_demande']);
  if (refus) return res.status(409).json({ error: refus });
  const ues = Array.isArray(req.body?.ues) ? req.body.ues.map(Number).filter(Boolean) : [];

  db.transaction(() => {
    // On remplace l'ensemble : cocher et décocher sont le même geste.
    db.prepare('DELETE FROM amenagement_ue WHERE dossier_id = ?').run(id);
    const ins = db.prepare('INSERT OR IGNORE INTO amenagement_ue (dossier_id, ue_num) VALUES (?,?)');
    for (const n of ues) ins.run(id, n);
  })();

  res.json({ ok: true, ues });
});

r.put('/dossier/:id', authRequired, peutAmenager, (req, res) => {
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
                  'transmis_cde_le', 'cde_recu_le', 'recours_decision_le'];
  const presents = champs.filter(k => k in d);
  if (!presents.length) return res.json({ ok: true, inchange: true });
  const dos = db.prepare('SELECT * FROM amenagement_dossier WHERE id = ?').get(Number(req.params.id));
  const refus = refusEtape(dos, presents);
  if (refus) return res.status(409).json({ error: refus });

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
r.post('/dossier/:id/mesure', authRequired, peutAmenager, (req, res) => {
  const m = req.body || {};
  const dos = db.prepare('SELECT * FROM amenagement_dossier WHERE id = ?').get(Number(req.params.id));
  const refus = refusMesures(dos);
  if (refus) return res.status(409).json({ error: refus });
  if (!m.libelle) return res.status(400).json({ error: 'libelle requis' });
  if (m.accorde === false && !String(m.motif_refus || '').trim()) {
    return res.status(400).json({ error: 'Une mesure refusée se motive (art. 6 § 2) : le motif du refus est requis.' });
  }
  const info = db.prepare(`
    INSERT INTO amenagement_mesure (dossier_id, code, nature, libelle, precisions, portee, ue_num, accorde, motif_refus)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(Number(req.params.id), m.code || null, m.nature || 'pedagogique', m.libelle,
         m.precisions || null, m.portee || 'toutes',
         m.ue_num ? Number(m.ue_num) : null,
         m.accorde === false ? 0 : 1, m.motif_refus || null);
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
});

r.put('/mesure/:id', authRequired, peutAmenager, (req, res) => {
  const m = req.body || {};
  const avant = db.prepare('SELECT * FROM amenagement_mesure WHERE id = ?').get(Number(req.params.id));
  const dos = avant && db.prepare('SELECT * FROM amenagement_dossier WHERE id = ?').get(avant.dossier_id);
  if (avant && dos) {
    // Le contenu de la mesure est du volet B ; son accord ou son refus, de la décision.
    const contenu = (m.precisions ?? null) !== (avant.precisions ?? null) || (m.portee || 'toutes') !== (avant.portee || 'toutes')
      || (m.ue_num ? Number(m.ue_num) : null) !== (avant.ue_num ?? null);
    const decision = (m.accorde === false ? 0 : 1) !== avant.accorde || (m.motif_refus || null) !== (avant.motif_refus || null);
    const refus = (contenu && refusMesures(dos)) || (decision ? refusEtape(dos, ['cde_date']) : null);
    if (refus) return res.status(409).json({ error: refus });
  }
  // UN REFUS SE MOTIVE, MESURE PAR MESURE. La même règle qu'à la création :
  // sans quoi on aurait une porte dérobée pour écrire ce que l'entrée refuse.
  if (m.accorde === false && !String(m.motif_refus || '').trim()) {
    return res.status(400).json({ error: 'Une mesure refusée se motive (art. 6 § 2) : le motif du refus est requis.' });
  }
  db.prepare(`
    UPDATE amenagement_mesure SET precisions = ?, portee = ?, ue_num = ?,
      accorde = ?, motif_refus = ? WHERE id = ?
  `).run(m.precisions ?? null, m.portee || 'toutes', m.ue_num ? Number(m.ue_num) : null,
         m.accorde === false ? 0 : 1, m.motif_refus || null, Number(req.params.id));
  res.json({ ok: true });
});

// ── Les pièces du dossier ───────────────────────────────────────────────────
// Formulaire (cadres A et B), décision motivée, notification (qui emporte la
// décision), fiche « mesures » des chargés de cours. Le serveur refuse, et
// nomme ce qui manque, tant que la décision n'est pas complète.
r.get('/dossier/:id/piece/:type', authRequired, (req, res) => {
  const d = dossierLisible(req, res);
  if (!d) return;
  if (!TYPES_PIECE[req.params.type]) return res.status(400).json({ error: 'pièce inconnue' });
  const p = composerPiece(req.params.type, d);
  if (p.erreur) return res.status(p.code || 400).json({ error: p.erreur, manques: p.manques || [] });
  res.json({ html: p.html, nom: p.nom, titre: TYPES_PIECE[req.params.type],
             etudiant_id: d.etudiant_id });
});

// ── Les chargés de cours des unités concernées ──────────────────────────────
// Ceux qui portent une attribution, cette année, dans une unité visée par la
// demande (aucune cochée : tout le programme de l'année).
r.get('/dossier/:id/charges-de-cours', authRequired, (req, res) => {
  const d = dossierLisible(req, res);
  if (!d) return;
  res.json({ professeurs: chargesDeCours(d), communique_le: d.communique_le || null,
             communique_par: d.communique_par || null, communique_a: d.communique_a || null });
});

// ── La communication des mesures, consignée au dossier ─────────────────────
// Posée après l'envoi par le centre d'envoi, qui garde son propre journal ;
// le dossier, lui, dit quand et à qui les mesures sont parties — c'est la
// question qu'on posera si un chargé de cours dit n'avoir rien reçu.
r.post('/dossier/:id/communication', authRequired, peutAmenager, (req, res) => {
  const d = dossierLisible(req, res);
  if (!d) return;
  const noms = (Array.isArray(req.body?.destinataires) ? req.body.destinataires : [])
    .map(x => String(x || '').trim()).filter(Boolean);
  if (!noms.length) return res.status(400).json({ error: 'aucun destinataire' });
  const par = req.user?.nom || req.user?.email || null;
  db.prepare(`UPDATE amenagement_dossier SET communique_le = datetime('now'),
      communique_par = ?, communique_a = ?, maj_le = datetime('now') WHERE id = ?`)
    .run(par, noms.join(', '), d.id);
  res.json({ ok: true });
});

/* SUPPRIMER UN DOSSIER (Charles, 29 septembre 2026 : « je ne sais pas
   supprimer un AR depuis la liste, enfin un dossier »). Un geste irréversible
   se nomme, se motive et laisse une trace :
     · un dossier SANS décision (ouvert par erreur, en double) se supprime par
       qui peut écrire les aménagements ;
     · un dossier DÉCIDÉ, notifié ou communiqué aux chargés de cours ne se
       supprime que par la direction, motif écrit — une décision a pu partir ;
     · dans les deux cas, un instantané complet du dossier (mesures et unités
       comprises) s'écrit dans amenagement_suppression, en ajout seul. */
const DIRECTION_AR = ['admin', 'directeur', 'directeur_adjoint'];
r.delete('/dossier/:id', authRequired, peutAmenager, (req, res) => {
  const d = dossierLisible(req, res);
  if (!d) return;
  const motif = String(req.body?.motif || req.query?.motif || '').trim();
  const engage = ['accepte', 'partiel', 'refuse', 'recours'].includes(d.statut) || d.cde_date || d.notifie_le || d.communique_le;
  if (engage && !DIRECTION_AR.includes(req.user?.role)) {
    return res.status(403).json({ error: 'Ce dossier porte une décision du Conseil, ou a déjà été notifié ou communiqué : seule la direction peut le supprimer, et elle motive sa décision.' });
  }
  if (engage && !motif) {
    return res.status(400).json({ error: 'Ce dossier porte une décision : sa suppression se motive — une décision a pu partir sur sa foi.', motif_requis: true });
  }
  db.exec(`CREATE TABLE IF NOT EXISTS amenagement_suppression (
    id INTEGER PRIMARY KEY AUTOINCREMENT, dossier_id INTEGER, etudiant_id INTEGER, annee_scolaire TEXT,
    statut TEXT, instantane TEXT, motif TEXT, par TEXT, le TEXT DEFAULT (datetime('now')))`);
  const mesures = db.prepare('SELECT * FROM amenagement_mesure WHERE dossier_id = ?').all(d.id);
  const ues = db.prepare('SELECT ue_num FROM amenagement_ue WHERE dossier_id = ?').all(d.id).map(x => x.ue_num);
  db.transaction(() => {
    db.prepare(`INSERT INTO amenagement_suppression (dossier_id, etudiant_id, annee_scolaire, statut, instantane, motif, par)
      VALUES (?,?,?,?,?,?,?)`).run(d.id, d.etudiant_id, d.annee_scolaire, d.statut,
      JSON.stringify({ dossier: d, mesures, ues }), motif || null, req.user?.email || req.user?.nom || null);
    db.prepare('DELETE FROM amenagement_mesure WHERE dossier_id = ?').run(d.id);
    db.prepare('DELETE FROM amenagement_ue WHERE dossier_id = ?').run(d.id);
    db.prepare('DELETE FROM amenagement_dossier WHERE id = ?').run(d.id);
  })();
  res.json({ ok: true, supprime: d.id });
});

r.delete('/mesure/:id', authRequired, peutAmenager, (req, res) => {
  {
    const m0 = db.prepare('SELECT dossier_id FROM amenagement_mesure WHERE id = ?').get(Number(req.params.id));
    const dos = m0 && db.prepare('SELECT * FROM amenagement_dossier WHERE id = ?').get(m0.dossier_id);
    const refus = refusMesures(dos);
    if (refus) return res.status(409).json({ error: refus });
  }
  db.prepare('DELETE FROM amenagement_mesure WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ── Le circuit : valider A, valider B, rouvrir ─────────────────────────────
r.put('/dossier/:id/valider-a', authRequired, peutAmenager, (req, res) => {
  const d = db.prepare('SELECT * FROM amenagement_dossier WHERE id = ?').get(Number(req.params.id));
  if (!d) return res.status(404).json({ error: 'dossier introuvable' });
  const manque = manquesA(d, db.prepare('SELECT COUNT(*) n FROM amenagement_mesure WHERE dossier_id = ?').get(d.id).n);
  if (manque.length) return res.status(409).json({ error: `La demande n'est pas complète : il manque ${manque.join(', ')}.`, manques: manque });
  const par = req.user?.nom || req.user?.email || null;
  db.prepare(`UPDATE amenagement_dossier SET valide_a_le = datetime('now'), valide_a_par = ?,
      statut = CASE WHEN statut = 'demande' THEN 'instruction' ELSE statut END, maj_le = datetime('now') WHERE id = ?`).run(par, d.id);
  res.json({ ok: true });
});
r.delete('/dossier/:id/valider-a', authRequired, peutAmenager, (req, res) => {
  const d = db.prepare('SELECT * FROM amenagement_dossier WHERE id = ?').get(Number(req.params.id));
  if (!d) return res.status(404).json({ error: 'dossier introuvable' });
  if (d.valide_b_le) return res.status(409).json({ error: 'Le rapport (volet B) est validé : rouvrez-le d’abord.' });
  db.prepare(`UPDATE amenagement_dossier SET valide_a_le = NULL, valide_a_par = NULL, maj_le = datetime('now') WHERE id = ?`).run(d.id);
  res.json({ ok: true });
});
/* B : la personne de référence du dossier — ou la direction à sa place.
   Celui qui clique est celui qui signe. La validation appelle les chargés de
   cours : la demande paraît dans leur Mes cours. */
r.put('/dossier/:id/valider-b', authRequired, peutAmenager, (req, res) => {
  const d = db.prepare('SELECT * FROM amenagement_dossier WHERE id = ?').get(Number(req.params.id));
  if (!d) return res.status(404).json({ error: 'dossier introuvable' });
  if (!d.valide_a_le) return res.status(409).json({ error: 'La demande (volet A) doit être validée d’abord.' });
  if (!DIRECTION.includes(req.user?.role) && !estPersonneReference(req.user, d)) {
    return res.status(403).json({ error: `Le rapport se valide par la personne de référence du dossier${d.personne_reference ? ` (${d.personne_reference})` : ''}, ou par la direction.` });
  }
  const nb = db.prepare('SELECT COUNT(*) n FROM amenagement_mesure WHERE dossier_id = ?').get(d.id).n;
  const manque = manquesB(d, nb);
  if (manque.length) return res.status(409).json({ error: `Le rapport n'est pas complet : il manque ${manque.join(', ')}.`, manques: manque });
  const par = req.user?.nom || req.user?.email || null;
  db.prepare(`UPDATE amenagement_dossier SET valide_b_le = datetime('now'), valide_b_par = ?,
      avis_demande_le = COALESCE(avis_demande_le, datetime('now')), maj_le = datetime('now') WHERE id = ?`).run(par, d.id);
  res.json({ ok: true });
});
r.delete('/dossier/:id/valider-b', authRequired, peutAmenager, (req, res) => {
  const d = db.prepare('SELECT * FROM amenagement_dossier WHERE id = ?').get(Number(req.params.id));
  if (!d) return res.status(404).json({ error: 'dossier introuvable' });
  if (DECIDE.includes(d.statut) || d.cde_date) return res.status(409).json({ error: 'Le Conseil a décidé : le rapport ne se rouvre plus.' });
  if (!DIRECTION.includes(req.user?.role) && !estPersonneReference(req.user, d)) {
    return res.status(403).json({ error: 'Seule la personne de référence ou la direction rouvre le rapport.' });
  }
  db.prepare(`UPDATE amenagement_dossier SET valide_b_le = NULL, valide_b_par = NULL, maj_le = datetime('now') WHERE id = ?`).run(d.id);
  res.json({ ok: true });
});

export default r;
