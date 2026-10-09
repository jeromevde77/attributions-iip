// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Module Étudiants : base étudiants, inscriptions, résultats et PAE
// ─────────────────────────────────────────────────────────────────────────────

import { migrerGroupesCommuns, cohorte as cohorteGC, proposerBriques, appliquerBriques } from '../lib/groupesCommuns.js';
import { dispensesDeLUE } from '../lib/dispenses.js';
import { paysDe, estUnPays } from '../lib/pays.js';
import { Router } from 'express';
import multer from 'multer';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { LOGO_IIP_JPEG } from '../services/assets/logo_iip_jpeg.js';
import { piedBalisage, piedStyles, reglesDePage, envelopperDocument } from '../lib/document.js';
import { htmlListeCoordonnees } from '../services/liste_coordonnees.js';

import { sectionDuDossier as sectionDeLInscription } from '../lib/sectionDossier.js';
import db from '../db/index.js';
import { piedDocument } from './parametres.js';
import { anneeDeTravail } from '../helpers/annee.js';
import { authRequired, roleRequired, getUserSections } from '../middleware/auth.js';
import { construireGraphe, niveauxEffectifs, rangNiveau } from './capitalisation.js';
import { etatsPAE, plafondBloc, rangBloc } from '../lib/pae.js';
import { SIGNATURE_SOHET, SCEAU_IIP } from '../services/assets/signature_sohet.js';
import { identiteEtablissement } from './config.js';
import { structureUE, calculerNoteUE, coursValidesAnterieurs, poserReportsDOffice } from './acquis.js';
import {
  BASES, CODES_BASE, FINALITES, ETATS, etatDeduit, uniteValorisable,
  controleDelai, manquesDossier, pieceProduisible, journaliser, journalDe,
  rafraichirEtat, pourcentageDe, POURCENTAGE_DISPENSE,
  PEUT_INSTRUIRE, PORTES, CODES_PORTE,
  estAdmissionDeSection, unitesDeBase, decideHorsCircuit, vaRetenue, vaSur20, vaPourcent, ANNEE_CIRCUIT_VA,
} from '../lib/valorisation.js';
import { gesteRequis, gesteAutorise } from '../lib/gestes.js';
import { codeGroupe } from '../lib/groupes.js';
import { controlePrerequisPae } from '../lib/controlePae.js';
import { peut as peutModule } from '../middleware/permissions.js';
import { calculerDI, calculerDIS } from './droitInscription.js';
import { rapprocher, normDate } from './importHistorique.js';
import { lirePackUF } from '../lib/packUF.js';
import { schemaSvg, legendeSchemaHtml } from '../lib/schemaSvg.js';
import { appelerCharges, avisCoordination, motifsVA } from '../lib/avisVA.js';
import { TITRES_ACCES, DIPLOMES_MAX } from '../lib/profilEtudiant.js';
import { composerNotificationVA } from '../lib/pieceNotificationVA.js';

const r = Router();

// Intitulé, niveau et section d'une UE, indépendamment de l'année.
// Le référentiel est dupliqué par année scolaire ; cette vue en donne une
// lecture pérenne : le millésime de l'année demandée s'il existe, sinon le
// plus récent connu. Sans quoi les années antérieures au premier référentiel
// affichent des UE sans nom.
/* LA SECTION D'UNE INSCRIPTION, EN SQL (30 septembre 2026, orthoptie) — la
   règle de lib/sectionDossier.js pour les requêtes qui joignent `e`
   (etudiant), `i` (inscription) et `u` (UE_REF) : celle de l'étudiant quand
   l'unité est rattachée à sa section déclarée, sinon celle de l'unité. */
const SECTION_INSCRIPTION = `(CASE WHEN e.section_rattachement IS NOT NULL AND EXISTS (
    SELECT 1 FROM ue_section us WHERE us.ue_num = i.ue_num AND us.section_code = e.section_rattachement)
  THEN e.section_rattachement ELSE u.section END)`;

const UE_REF = `(
  SELECT ue_num,
         (SELECT ue_nom  FROM ue x WHERE x.ue_num = u0.ue_num AND x.ue_nom  IS NOT NULL ORDER BY x.annee_scolaire DESC LIMIT 1) AS ue_nom,
         (SELECT ue_niv  FROM ue x WHERE x.ue_num = u0.ue_num AND x.ue_niv  IS NOT NULL ORDER BY x.annee_scolaire DESC LIMIT 1) AS ue_niv,
         (SELECT section FROM ue x WHERE x.ue_num = u0.ue_num AND x.section IS NOT NULL ORDER BY x.annee_scolaire DESC LIMIT 1) AS section,
         (SELECT ue_quad FROM ue x WHERE x.ue_num = u0.ue_num ORDER BY x.annee_scolaire DESC LIMIT 1) AS ue_quad,
         -- Les crédits manquaient à cette sous-requête : la fiche affichait
         -- donc un tiret sur chaque ligne, et les demander faisait échouer la
         -- requête entière.
         (SELECT ects FROM ue x WHERE x.ue_num = u0.ue_num AND x.ects IS NOT NULL ORDER BY x.annee_scolaire DESC LIMIT 1) AS ects
  FROM ue u0 GROUP BY ue_num
)`;

/**
 * Niveau d'un étudiant, déduit des UE à son programme.
 *
 *   toutes de BA1  → « BA1 »        (idem BA2)
 *   toutes de BA3  → « Diplômant »  (il ne lui reste que l'année terminale)
 *   mélangées      → « Parcours »   (il reprend des UE de plusieurs années)
 *
 * Le niveau retenu est celui de la section (ue_niveau_section), le même que
 * dans le schéma de capitalisation — et non la valeur brute du référentiel.
 */
export function niveauEtudiant(etudId, annee) {
  let lignes = db.prepare(`
    SELECT DISTINCT ue_num FROM etudiant_inscription
    WHERE etudiant_id = ? AND annee_scolaire = ?
  `).all(etudId, annee);

  // Sans programme pour l'année demandée, on se rabat sur la dernière connue
  let anneeRetenue = annee;
  if (!lignes.length) {
    const derniere = db.prepare(`
      SELECT MAX(annee_scolaire) AS a FROM etudiant_inscription WHERE etudiant_id = ?
    `).get(etudId)?.a;
    if (!derniere) return { niveau: null, libelle: null, detail: {} };
    anneeRetenue = derniere;
    lignes = db.prepare(`
      SELECT DISTINCT ue_num FROM etudiant_inscription
      WHERE etudiant_id = ? AND annee_scolaire = ?
    `).all(etudId, derniere);
  }
  if (!lignes.length) return { niveau: null, libelle: null, detail: {} };

  const { sections } = sectionsDeLEtudiant(etudId, null);
  const niveaux = sections.length ? niveauxEffectifs(sections, anneeRetenue) : {};

  const detail = {};
  for (const l of lignes) {
    const n = (niveaux[l.ue_num] || '').toUpperCase();
    if (!n) continue;
    detail[n] = (detail[n] || 0) + 1;
  }
  const presents = Object.keys(detail);
  if (!presents.length) return { niveau: null, libelle: null, detail };

  /* LE STAGE CLASSE (Charles, 2 octobre 2026) : l'épreuve intégrée au PAE
     donne « Diplômant » ; sinon le stage le plus avancé du PAE décide — stage
     de BA1 → Parcours B1, de BA2 → Parcours B2, de BA3 → Diplômant. Sans
     stage, la règle des blocs. Toutes les sections. Le niveau ne sert qu'à
     lire et à filtrer : le moteur du PAE ne le consulte pas. */
  const LIB = { BA1: 'Parcours B1', BA2: 'Parcours B2', BA3: 'Diplômant' };
  const nums = lignes.map(l => l.ue_num);
  const ph = nums.map(() => '?').join(',');
  let ei = false;
  try {
    ei = !!db.prepare(`SELECT 1 FROM ue_epreuve_integree WHERE actif = 1 AND ue_num IN (${ph}) LIMIT 1`).get(...nums);
  } catch { /* table absente */ }
  if (!ei) {
    try { ei = !!db.prepare(`SELECT 1 FROM ue WHERE is_epreuve_integree = 1 AND ue_num IN (${ph}) LIMIT 1`).get(...nums); }
    catch { /* colonne absente */ }
  }
  if (ei) return { niveau: 'BA3', libelle: 'Diplômant', detail, annee: anneeRetenue, par: 'epreuve' };
  let stages = [];
  try {
    stages = db.prepare(`SELECT DISTINCT ue_num FROM cours WHERE COALESCE(is_stage, 0) = 1 AND ue_num IN (${ph})`)
      .all(...nums).map(x => (niveaux[x.ue_num] || '').toUpperCase()).filter(n => LIB[n]);
  } catch { /* colonne absente */ }
  if (stages.length) {
    const haut = stages.sort().pop();
    return { niveau: haut, libelle: LIB[haut], detail, annee: anneeRetenue, par: 'stage' };
  }

  if (presents.length === 1) {
    const seul = presents[0];
    return {
      niveau: seul,
      libelle: LIB[seul] || seul,
      detail, annee: anneeRetenue,
    };
  }
  return { niveau: 'MIXTE', libelle: 'Parcours', detail, annee: anneeRetenue };
}

export function migrerEtudiants(dbx) {
  try {
    dbx.exec(`
    CREATE TABLE IF NOT EXISTS etudiant (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      id_ecampus     TEXT UNIQUE,
      nom            TEXT NOT NULL,
      prenom         TEXT NOT NULL,
      date_naissance TEXT,
      email_ecole    TEXT,
      email_perso    TEXT,
      num_national   TEXT,
      gsm            TEXT,
      adresse        TEXT,
      localite       TEXT,
      cp             TEXT,
      titre          TEXT,
      actif          INTEGER NOT NULL DEFAULT 1,
      cree_le        TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_etudiant_nom ON etudiant(nom, prenom);

    CREATE TABLE IF NOT EXISTS etudiant_inscription (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      etudiant_id    INTEGER NOT NULL REFERENCES etudiant(id) ON DELETE CASCADE,
      annee_scolaire TEXT NOT NULL,
      ue_num         INTEGER NOT NULL,
      groupe         TEXT,
      statut         TEXT DEFAULT 'inscrit',
      resultat       TEXT,
        -- Les TROIS décisions de première session, distinguées par la circulaire
        -- sanction des études : 'reussi', 'ajourne' — qui ouvre une seconde
        -- session sur des acquis précis — et 'refuse', qui ne l'ouvre pas.
        -- 'absent' et NULL complètent le tableau.
      mention        TEXT,        -- A, B, C, D, E
      points         REAL,
      cree_le        TEXT DEFAULT (datetime('now')),
      UNIQUE(etudiant_id, annee_scolaire, ue_num)
    );
    CREATE INDEX IF NOT EXISTS idx_inscription_etud
      ON etudiant_inscription(etudiant_id, annee_scolaire);
    `);
    console.log('[migration] Tables etudiant + etudiant_inscription créées');

    // Pièces du dossier individuel de l'apprenant (circulaire n° 9764 du 13/07/2026)
    dbx.exec(`
    CREATE TABLE IF NOT EXISTS etudiant_piece (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      etudiant_id  INTEGER NOT NULL REFERENCES etudiant(id) ON DELETE CASCADE,
      type_piece   TEXT NOT NULL,
      statut       TEXT NOT NULL DEFAULT 'manquant',   -- manquant | recu | na
      commentaire  TEXT,
      maj_le       TEXT DEFAULT (datetime('now')),
      UNIQUE(etudiant_id, type_piece)
    );`);

    // Colonnes réglementaires sur l'inscription (fiche d'inscription/reçu)
    const addCol = (t, def) => { try { dbx.exec('ALTER TABLE ' + t + ' ADD COLUMN ' + def); } catch {} };
    addCol('etudiant_inscription', "date_inscription TEXT");
    addCol('etudiant_inscription', "admission_type TEXT"); // 'titre' | 'test' | null
    addCol('etudiant_inscription', "dispense_complete INTEGER NOT NULL DEFAULT 0");
    addCol('etudiant_inscription', "codiplomation_ch INTEGER NOT NULL DEFAULT 0");
    addCol('etudiant_inscription', "di_specifique REAL");
    addCol('etudiant_inscription', "ects REAL");
    addCol('etudiant_inscription', "derogation INTEGER NOT NULL DEFAULT 0");
    // Qui a forcé une réinscription (UE déjà réussie) ou une dérogation, et quand.
    addCol('etudiant_inscription', "derogation_par TEXT");
    addCol('etudiant_inscription', "derogation_le TEXT");
    console.log('[migration] etudiant_piece + colonnes fiche inscription');

    /* LE REGISTRE DES DÉROGATIONS AU PAE (28 septembre 2026). Chaque inscription
       posée contre une règle du moteur — bloc non atteint, prérequis manquant,
       unité déjà réussie, hors cursus, épreuve intégrée fermée, unité non
       organisée — laisse ici une ligne : laquelle, par qui, d'où, pourquoi. Le
       « ce choix sera tracé » de l'écran ne l'était pas. En ajout seul : une
       dérogation se régularise (colonnes regularise_*), elle ne s'efface pas. */
    dbx.exec(`
    CREATE TABLE IF NOT EXISTS pae_derogation (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      etudiant_id    INTEGER NOT NULL,
      annee_scolaire TEXT NOT NULL,
      ue_num         INTEGER NOT NULL,
      regle          TEXT NOT NULL,
      detail         TEXT,
      motif          TEXT,
      origine        TEXT,
      par            TEXT,
      le             TEXT DEFAULT (datetime('now')),
      regularise_le  TEXT,
      regularise_par TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_pae_derogation_etud ON pae_derogation(etudiant_id, annee_scolaire);`);

    // Correspondance entre les codes d'UE d'eCampus (TINFO, PDPS, 901…) et les
    // numéros d'UE de Lucie. Établie une fois, elle vaut pour tous les imports
    // suivants — la liste d'eCampus ne porte pas le ue_num.
    dbx.exec(`
    CREATE TABLE IF NOT EXISTS ue_code_externe (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      code     TEXT NOT NULL UNIQUE,
      ue_num   INTEGER NOT NULL,
      libelle  TEXT,
      maj_le   TEXT DEFAULT (datetime('now'))
    );`);

    // Valorisation des acquis — AGCF 13-12-2024 (art. 3 partielle, art. 4 complète)
    dbx.exec(`
    CREATE TABLE IF NOT EXISTS etudiant_valorisation (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      etudiant_id    INTEGER NOT NULL REFERENCES etudiant(id) ON DELETE CASCADE,
      annee_scolaire TEXT NOT NULL,
      ue_num         INTEGER NOT NULL,
      type           TEXT NOT NULL CHECK (type IN ('complete','partielle','admission')),
      cible          TEXT CHECK (cible IN ('aa','cours') OR cible IS NULL),
      cible_detail   TEXT,          -- codes AA ou codes cours dispensés (séparés par virgule)
      pourcentage    REAL,          -- note attribuée (pratique : 50 par défaut)
      decision_ce_date TEXT,        -- date de la décision du Conseil des études
      commentaire    TEXT,
      cree_le        TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_valo_etud ON etudiant_valorisation(etudiant_id);
    -- L'ÉQUIVALENCE SE DIT ACQUIS PAR ACQUIS, ET ELLE SE MOTIVE.
    --
    -- « cible_detail » retenait des codes séparés par des virgules : il disait
    -- QUOI est dispensé, jamais POURQUOI. Or le Conseil ne dispense pas d'un
    -- acquis, il constate qu'il est maîtrisé ailleurs — et c'est ce constat,
    -- écrit, qui tient devant une inspection. Une ligne par acquis, avec son
    -- texte : une phrase proposée, remplaçable, jamais un blanc.
    -- LA PREUVE QUI FONDE LA DÉCISION.
    --
    -- Une valorisation se décide sur pièces : un diplôme, une attestation de
    -- formation, un dossier pédagogique, un contrat de travail. Ces pièces
    -- vivaient dans une armoire, ou dans la boîte courriel de celui qui les a
    -- reçues. Un Conseil qui relit sa décision deux ans plus tard, ou une
    -- inspection qui la vérifie, ne trouve alors plus rien.
    CREATE TABLE IF NOT EXISTS etudiant_valorisation_fichier (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      valorisation_id INTEGER NOT NULL
        REFERENCES etudiant_valorisation(id) ON DELETE CASCADE,
      nom             TEXT NOT NULL,
      chemin          TEXT NOT NULL,
      taille          INTEGER,
      type_mime       TEXT,
      nature          TEXT,
      cree_par        TEXT,
      cree_le         TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_valo_fic
      ON etudiant_valorisation_fichier(valorisation_id);
    CREATE TABLE IF NOT EXISTS etudiant_valorisation_aa (
      valorisation_id INTEGER NOT NULL
        REFERENCES etudiant_valorisation(id) ON DELETE CASCADE,
      aa_code         TEXT NOT NULL,
      texte           TEXT,
      PRIMARY KEY (valorisation_id, aa_code)
    );
    `);
    try { dbx.exec('ALTER TABLE etudiant_valorisation_fichier ADD COLUMN nature TEXT'); }
    catch { /* déjà là */ }
    console.log('[migration] etudiant_valorisation créée');

    // Notes détaillées par cours et par acquis d'apprentissage
    dbx.exec(`
    CREATE TABLE IF NOT EXISTS etudiant_note_detail (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      etudiant_id    INTEGER NOT NULL REFERENCES etudiant(id) ON DELETE CASCADE,
      annee_scolaire TEXT NOT NULL,
      ue_num         INTEGER NOT NULL,
      type           TEXT NOT NULL CHECK (type IN ('cours','aa')),
      code           TEXT NOT NULL,
      points         REAL,
      va             INTEGER NOT NULL DEFAULT 0,
      commentaire    TEXT,
      UNIQUE(etudiant_id, annee_scolaire, ue_num, type, code)
    );
    CREATE INDEX IF NOT EXISTS idx_note_detail
      ON etudiant_note_detail(etudiant_id, annee_scolaire, ue_num);
    `);
    console.log('[migration] etudiant_note_detail créée');
  } catch (e) { console.error('[migration] etudiants :', e.message); }

  // UNE DEMANDE DE VALORISATION PEUT ÊTRE REFUSÉE, et le refus s'encode.
  //
  // La table ne connaissait que des dispenses accordées : un refus n'avait
  // nulle part où s'écrire, donc il ne s'écrivait pas — et une demande dont
  // rien ne garde trace est une demande qu'on réintroduit l'année suivante,
  // sans savoir qu'elle a déjà été examinée. Le procès-verbal, lui, réserve
  // depuis toujours une colonne « Réussite / Refus ».
  //
  // Le motif n'est pas un commentaire : toute décision défavorable se motive
  // (RDE art. 88 §3). Il a sa colonne pour qu'on puisse exiger qu'il soit
  // rempli, ce qu'un champ libre partagé ne permet pas.
  try {
    const cols = dbx.prepare('PRAGMA table_info(etudiant_valorisation)').all();
    if (cols.length) {
      if (!cols.some(c => c.name === 'decision')) {
        dbx.exec("ALTER TABLE etudiant_valorisation ADD COLUMN decision TEXT NOT NULL DEFAULT 'accordee'");
      }
      if (!cols.some(c => c.name === 'motif_refus')) {
        dbx.exec('ALTER TABLE etudiant_valorisation ADD COLUMN motif_refus TEXT');
      }
    }
  } catch (e) { console.error('[migration] valorisation/décision :', e.message); }

  /* ──────────────────────────────────────────────────────────────────────
   * LE DOSSIER DE VALORISATION EST UN CIRCUIT, PAS UNE DÉCISION.
   *
   * Lucie n'enregistrait que le point d'arrivée : une dispense accordée ou
   * refusée. La procédure de l'IIP, elle, décrit DIX ÉTAPES, avec des délais,
   * des rôles distincts et des motifs de nature différente — un refus de FORME
   * (hors délai, dossier incomplet) n'est pas un refus PÉDAGOGIQUE.
   *
   * Ce qui a été vécu en septembre 2026 dit pourquoi cela ne suffisait pas :
   * une attestation erronée est sortie, la procédure a été contournée en
   * amont, et la signature de la direction et le cachet de l'établissement ont
   * été apposés sur une décision qui n'avait ni base légale renseignée, ni
   * motivation écrite. Aucune de ces trois fautes n'était détectable dans
   * Lucie — parce que Lucie ne savait pas ce qui aurait dû précéder.
   *
   * Les colonnes ci-dessous portent le circuit. Elles sont toutes ADDITIVES et
   * nullables : un dossier encodé avant cette version reste lisible, il est
   * simplement incomplet — et l'écran le dit, plutôt que de faire comme si.
   * ────────────────────────────────────────────────────────────────────── */
  try {
    const cols = dbx.prepare('PRAGMA table_info(etudiant_valorisation)').all();
    if (cols.length) {
      const ajouter = (nom, decl) => {
        if (!cols.some(c => c.name === nom)) {
          dbx.exec(`ALTER TABLE etudiant_valorisation ADD COLUMN ${nom} ${decl}`);
        }
      };
      // ÉTAPE 2 — l'introduction. Sans la date de la demande, aucun contrôle
      // de délai n'est possible : « hors délai » ne se constate pas de mémoire.
      ajouter('date_demande', 'TEXT');       // date portée sur le formulaire
      ajouter('date_reception', 'TEXT');     // date d'envoi/dépôt — la plus tardive fait foi
      ajouter('mode_introduction', 'TEXT');  // courriel | papier | rendez-vous
      /* LA PORTE D'ENTRÉE — ET ELLE RESTE SIMPLE.
       *
       * Ce qu'on sait au moment où la demande arrive tient en un mot :
       * ADMISSION (capacités préalables requises), VA (acquis formels — un
       * titre, une attestation d'enseignement) ou VAE (acquis de l'expérience
       * professionnelle ou personnelle). Tout le reste — dispense partielle ou
       * complète, activités visées, base exacte — se décide plus tard, dans le
       * dossier. Demander tout dès la porte, c'est ne rien encoder du tout. */
      ajouter('porte', 'TEXT');              // admission | va | vae
      /* L'ADMISSION SE DÉCIDE PAR SECTION, PAS PAR UNITÉ.
       *
       * C'était une erreur de modèle : l'écran proposait AD case par case,
       * comme une VA. Or on n'est pas admis « à l'UE 95 » — on est admis DANS
       * LA SECTION, après vérification des capacités préalables requises
       * (AGCF art. 2), et cette admission se reporte ensuite sur les unités de
       * base, celles qui n'ont pas d'autre prérequis que le titre d'accès.
       *
       * Une seule ligne porte donc la décision, et elle est rattachée à la
       * SECTION. Les unités de base s'en déduisent à la lecture plutôt que
       * d'être recopiées : recopier, c'est figer un programme qui bouge, et
       * c'est multiplier par dix les lignes d'une décision unique.
       *
       * `ue_num` vaut alors 0 — la colonne est NOT NULL depuis l'origine et la
       * reconstruire sur des données de production ne se justifie pas pour
       * cela. Zéro n'est le numéro d'aucune unité : aucune requête existante
       * ne le rencontre, et le sens est écrit ici plutôt que deviné. */
      ajouter('section', 'TEXT');
      /* ÉTAPE 5 — LE TEST OU L'ÉPREUVE COMPLÉMENTAIRE.
       *
       * Quand le Conseil ne peut pas se prononcer sur pièces, il fixe un test.
       * Pour une ADMISSION, ce test porte sur les capacités préalables
       * requises, et à l'IIP cela veut dire deux résultats qui se disent :
       * le FRANÇAIS et les MATHÉMATIQUES. Ils vivaient dans la tête de qui
       * avait corrigé, ou sur une feuille — donc nulle part. */
      ajouter('test_note_francais', 'REAL');
      ajouter('test_note_maths', 'REAL');
      ajouter('test_date', 'TEXT');
      ajouter('test_par', 'TEXT');
      // ÉTAPE 3 — la recevabilité. NULL tant que le contrôle n'a pas eu lieu :
      // « pas encore contrôlé » et « recevable » sont deux états différents, et
      // les confondre revient à déclarer recevable ce que personne n'a regardé.
      ajouter('recevable', 'INTEGER');
      ajouter('motif_irrecevabilite', 'TEXT');
      ajouter('recevabilite_par', 'TEXT');
      ajouter('recevabilite_le', 'TEXT');
      // ÉTAPE 4 — l'avis écrit et motivé du chargé de cours. C'est la pièce qui
      // manquait : le Conseil décidait sans que rien n'atteste d'une analyse.
      ajouter('avis_sens', 'TEXT');          // favorable | partiel | defavorable
      ajouter('avis_texte', 'TEXT');
      ajouter('avis_par', 'TEXT');
      ajouter('avis_le', 'TEXT');
      // ÉTAPE 6 — la base de la décision. Annexe 2 de la procédure : VAF V1 à
      // V4, VANFI D ou E. Elle part dans eProm ; sans elle, la décision n'est
      // pas encodable, donc pas conforme.
      ajouter('base_code', 'TEXT');
      ajouter('decision_par', 'TEXT');
      ajouter('decision_le', 'TEXT');
      // ÉTAPE 7 — la notification et le PAE.
      ajouter('notifie_le', 'TEXT');
      ajouter('notifie_par', 'TEXT');
      ajouter('pae_maj_le', 'TEXT');
      // ÉTAPE 8 — l'encodage FWB. « Une décision non encodée est une décision
      // non conforme » (AGCF 13.12.2024, art. 5 al. 3), positives ET négatives.
      ajouter('eprom_le', 'TEXT');
      ajouter('eprom_par', 'TEXT');
      /* ÉTAPE 6 BIS — LA VALIDATION PAR LA DIRECTION OU SON DÉLÉGUÉ.
       *
       * C'est le geste qui ENGAGE LA SIGNATURE, et il manquait entièrement.
       * Tout le circuit peut être parcouru correctement et la pièce rester
       * fausse si personne, en fin d'étude, n'a regardé le dossier et dit :
       * celui-ci part. On enregistre donc QUI a validé, avec quel profil et
       * quand — et une fois validé, le dossier ne se modifie plus. Une pièce
       * signée ne doit pas pouvoir reposer sur un dossier retouché après coup.
       *
       * `valide_par_id` autant que `valide_par` : un nom se change dans la
       * fiche d'un compte, un identifiant non. */
      ajouter('valide_le', 'TEXT');
      ajouter('valide_par', 'TEXT');
      ajouter('valide_par_id', 'INTEGER');
      ajouter('valide_role', 'TEXT');
      // ÉTAPE 10 — l'archivage, quatre ans (AGCF art. 5 al. 2).
      ajouter('archive_le', 'TEXT');
      // L'ÉTAT COURANT, DÉDUIT MAIS ÉCRIT. Il se recalcule des colonnes
      // ci-dessus ; on le stocke pour pouvoir trier et compter sans rejouer la
      // déduction dans chaque requête — et la déduction reste la référence.
      ajouter('etat', "TEXT NOT NULL DEFAULT 'introduite'");
    }
  } catch (e) { console.error('[migration] valorisation/circuit :', e.message); }

  /* LE JOURNAL — CE QUI PROTÈGE CONTRE CE QU'ON A VÉCU.
   *
   * Une procédure contournée ne se voit pas dans l'état final : le dossier
   * ressemble à un dossier normal. Ce qui la révèle, c'est la SUITE DES
   * GESTES — qui a déclaré recevable, quand, qui a rendu l'avis, qui a
   * enregistré la décision, et dans quel ordre. Le journal n'est écrit que par
   * AJOUT : aucune route ne le modifie ni ne l'efface, y compris pour un
   * administrateur. Une trace qu'on peut corriger ne prouve rien.
   */
  try {
    dbx.exec(`
    CREATE TABLE IF NOT EXISTS valorisation_journal (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      valorisation_id INTEGER NOT NULL
        REFERENCES etudiant_valorisation(id) ON DELETE CASCADE,
      horodatage      TEXT NOT NULL DEFAULT (datetime('now')),
      etape           TEXT NOT NULL,
      acteur_id       INTEGER,
      acteur_nom      TEXT,
      acteur_role     TEXT,
      detail          TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_valo_journal
      ON valorisation_journal(valorisation_id, id);
    `);
  } catch (e) { console.error('[migration] valorisation_journal :', e.message); }

  /* CE QUI NE PEUT JAMAIS ÊTRE VALORISÉ SE RÈGLE À L'ÉCRAN, PAS DANS LE CODE.
   *
   * L'épreuve intégrée est exclue par le texte lui-même (AGCF art. 4 §3) et se
   * reconnaît toute seule. Mais les trois autres exclusions — UE sans
   * prestations d'étudiants, UE dont une réglementation impose qu'elles soient
   * suivies, et à l'IIP la méthodologie de la recherche — dépendent du
   * programme : les écrire en dur ferait mentir Lucie dès la première section
   * qui change. Une case sur l'unité, avec son motif, qui s'imprime tel quel
   * dans le refus.
   */
  try {
    const cols = dbx.prepare('PRAGMA table_info(ue)').all();
    if (cols.length && !cols.some(c => c.name === 'valorisation_exclue')) {
      dbx.exec('ALTER TABLE ue ADD COLUMN valorisation_exclue INTEGER NOT NULL DEFAULT 0');
      dbx.exec('ALTER TABLE ue ADD COLUMN valorisation_exclue_motif TEXT');
    }
  } catch (e) { console.error('[migration] ue/valorisation_exclue :', e.message); }
}

// Les 5 pièces réglementaires (circulaire dossiers apprenants EA)
export const PIECES_APPRENANT = [
  { type: 'identite',          libelle: "Copie du document d'identité" },
  { type: 'titre_cpr',         libelle: 'Titre correspondant aux capacités préalables requises (ou valorisation des acquis)' },
  { type: 'fiche_inscription', libelle: "Fiche d'inscription / reçu" },
  { type: 'decision_ce',       libelle: 'Décision favorable du Conseil des études (réinscription UE déjà réussie)' },
  { type: 'exoneration_di',    libelle: "Documents d'exonération du droit d'inscription" },
];

// Sections d'un étudiant, pondérées par le nombre d'UE inscrites.
// Certaines UE sont partagées entre sections : une seule UE commune ne doit
// pas faire entrer tout le catalogue d'une autre section. On ne retient donc
// que la (ou les) section(s) dominante(s).
/**
 * Périmètre de l'utilisateur. Sans cloisonnement, un coordinateur voyait les
 * étudiants de tout l'établissement — le panneau d'accès affichait ses
 * sections sans que rien ne les fasse respecter.
 */
function perimetre(req) {
  return getUserSections(req.user);      // null = toutes
}

function sectionAutoriseeReq(req, section) {
  const p = perimetre(req);
  return p === null ? true : (section ? p.includes(section) : false);
}

/* UNE UE DÉJÀ RÉUSSIE NE REVIENT PAS AU PROGRAMME SANS QU'ON L'AIT VOULU
 * (Charles, 25 septembre 2026). La réinscription existe — pour améliorer une
 * note, par exemple —, mais elle se FORCE, par la direction ou la
 * coordination, et ce geste porte un nom et une date. Le 21 septembre, la
 * promotion lancée pour les quatre sections avait réinscrit 52 étudiants dans
 * 301 unités qu'ils avaient déjà réussies, et « Valider les PAE » les laissait
 * passer sans un mot : ce qui n'a pas été forcé est une erreur, pas un choix.
 * Réussie = résultat « reussi » une année ANTÉRIEURE, ou dispense complète
 * accordée (la même définition que composerPAE). */
/* Qui force : le geste « etudiants.reinscription » (lib/gestes.js). */
const SQL_DEJA_REUSSIE = `(
  EXISTS (SELECT 1 FROM etudiant_inscription p
          WHERE p.etudiant_id = i.etudiant_id AND p.ue_num = i.ue_num
            AND p.annee_scolaire < i.annee_scolaire AND p.resultat = 'reussi')
  OR EXISTS (SELECT 1 FROM etudiant_valorisation v
          WHERE v.etudiant_id = i.etudiant_id AND v.ue_num = i.ue_num
            AND v.annee_scolaire < i.annee_scolaire AND v.type = 'complete'
            AND ${vaRetenue('v.')}))`;
function reprisesNonForcees(etudId, annee) {
  return db.prepare(`SELECT i.ue_num FROM etudiant_inscription i
    WHERE i.etudiant_id = ? AND i.annee_scolaire = ? AND COALESCE(i.derogation, 0) = 0
      AND ${SQL_DEJA_REUSSIE} ORDER BY i.ue_num`).all(etudId, annee).map(x => x.ue_num);
}

/* LES DOSSIERS DE VALORISATION SE TIENNENT DANS SON PÉRIMÈTRE (23 septembre
 * 2026). Le registre, la matrice, l'analyse, les dossiers individuels et
 * leurs étapes s'ouvraient à tout compte connecté : une coordination voyait
 * — et pouvait instruire — les demandes des autres sections. La règle est
 * celle de la liste des étudiants : on ne montre pas ce qui n'est pas le
 * sien, et elle vaut pour l'écriture. Même esprit que `unitePermise` posé en
 * 2.12.113 sur la séance (attestations.js), jamais appliqué à ces routes. */
function sectionsDeUE(ueNum) {
  const n = Number(ueNum);
  const directes = db.prepare(
    'SELECT DISTINCT section FROM ue WHERE ue_num = ? AND section IS NOT NULL').all(n);
  const liens = db.prepare(
    'SELECT DISTINCT section_code AS section FROM ue_section WHERE ue_num = ?').all(n);
  return [...new Set([...directes, ...liens].map(x => x.section).filter(Boolean))];
}
function unitePermise(req, res, ueNum) {
  const permises = perimetre(req);
  if (!permises) return true;
  if (sectionsDeUE(ueNum).some(s => permises.includes(s))) return true;
  res.status(403).json({ error: 'Cette unité est hors de votre périmètre.' });
  return false;
}
// Une admission (ue_num = 0) porte sa section ; les autres la tiennent de l'UE.
function sectionsValorisation(vid) {
  const v = db.prepare('SELECT ue_num, section FROM etudiant_valorisation WHERE id = ?')
    .get(Number(vid));
  if (!v) return [];
  return v.ue_num ? sectionsDeUE(v.ue_num) : (v.section ? [v.section] : []);
}
function valorisationsPermises(req, res, vids) {
  const permises = perimetre(req);
  if (!permises) return true;
  for (const vid of vids) {
    if (!sectionsValorisation(vid).some(s => permises.includes(s))) {
      res.status(403).json({ error: 'Un des dossiers de valorisation est hors de votre périmètre.' });
      return false;
    }
  }
  return true;
}
function valorisationPermise(req, res, vid) {
  return valorisationsPermises(req, res, [vid]);
}
// Pour les listes (registre, analyse, en-retard) : on écarte les lignes hors
// périmètre au lieu de refuser la requête. Une admission (ue_num = 0) n'a pas
// d'UE : sa section se relit sur le dossier lui-même.
function filtrerValorisationsParPerimetre(req, lignes) {
  const permises = perimetre(req);
  if (!permises) return lignes;
  const cache = new Map();
  const secsDe = (ue) => {
    if (!cache.has(ue)) cache.set(ue, sectionsDeUE(ue));
    return cache.get(ue);
  };
  return lignes.filter(l => {
    const secs = l.ue_num ? secsDe(l.ue_num)
      : (l.section ? [l.section] : (l.id ? sectionsValorisation(l.id) : []));
    return secs.some(s => permises.includes(s));
  });
}
// Même règle que la fiche : un étudiant sans aucune section reste visible de
// tous. Le rattachement compte aussi — un primo sans inscription a déjà une
// section, et c'est elle qui décide.
/* LE PÉRIMÈTRE SE JUGE SUR LA SECTION DE L'ÉTUDIANT, PAS SUR CELLE DE SES
 * UNITÉS (Charles, 3 octobre 2026 : « Natacha est Opto ! Elle voit tout le
 * monde »). Il suffisait qu'UNE unité de l'étudiant relève du périmètre : l'UE
 * 185, rangée sous Optique et suivie par des étudiants de TIM, ouvrait à la
 * coordination d'optique cent étudiants de TIM. Sa section, c'est le
 * rattachement, ou la déduction de Lucie à défaut — la même que montrent la
 * liste et sa frise. */
export function sectionPropre(etudId) {
  const rat = db.prepare('SELECT section_rattachement FROM etudiant WHERE id = ?').get(Number(etudId))?.section_rattachement;
  if (rat) return rat;
  try { return sectionRattachement(Number(etudId)).section || null; } catch { return null; }
}
function etudiantPermis(req, res, etudId) {
  const permises = perimetre(req);
  if (!permises) return true;
  const sec = sectionPropre(etudId);
  if (sec && permises.includes(sec)) return true;
  res.status(403).json({ error: 'Cet étudiant est hors de votre périmètre.' });
  return false;
}

function sectionsDeLEtudiant(etudId, forcee) {
  if (forcee) return { sections: [forcee], scores: [] };
  // La section d'une UE ne dépend pas de l'année : joindre sur l'année de
  // l'inscription excluait tout ce que le référentiel ne couvre pas. Sur la
  // base de production, qui ne remonte qu'à 2025-2026, 306 étudiants sur 576
  // se retrouvaient sans section — et donc sans PAE possible.
  //
  // On prend la section connue pour cette UE, la plus récente d'abord, comme
  // le fait UE_REF ailleurs dans ce fichier.
  // Une jointure plutôt qu'une sous-requête corrélée : SQLite ne fait pas
  // remonter l'alias « i » à l'intérieur d'une table dérivée, et la requête
  // échouait à chaque appel — donc la liste entière.
  //
  // La préférence pour l'année de l'inscription se traduit ici par un tri sur
  // la table jointe, et DISTINCT garde une seule section par UE.
  // Deux requêtes simples plutôt qu'une corrélée : SQLite n'accepte pas de
  // référence à un alias extérieur depuis une sous-requête placée dans une
  // table dérivée, ni depuis son ORDER BY. La règle de préférence — l'année de
  // l'inscription d'abord, la plus récente ensuite — se calcule donc ici.
  const inscriptions = db.prepare(
    'SELECT DISTINCT ue_num, annee_scolaire FROM etudiant_inscription WHERE etudiant_id = ?'
  ).all(etudId);

  const sectionsParUe = {};
  if (inscriptions.length) {
    const nums = [...new Set(inscriptions.map(x => x.ue_num))];
    for (const l of db.prepare(`
      SELECT ue_num, annee_scolaire, section FROM ue
      WHERE ue_num IN (${nums.map(() => '?').join(',')}) AND section IS NOT NULL
    `).all(...nums)) {
      (sectionsParUe[l.ue_num] = sectionsParUe[l.ue_num] || []).push(l);
    }
  }

  /* UNE UE RATTACHÉE À LA SECTION DÉCLARÉE DE L'ÉTUDIANT COMPTE POUR ELLE
     (30 septembre 2026, orthoptie) : le tronc commun est déclaré en
     Optométrie, un orthoptiste qui le suit n'en devient pas optométriste — la
     règle de lib/sectionDossier.js. Sans elle, la coordination d'Orthoptie
     était refusée sur la fiche de ses propres étudiants, et celle
     d'Optométrie y entrait. */
  const rat = db.prepare('SELECT section_rattachement s FROM etudiant WHERE id = ?').get(etudId)?.s || null;
  const lieesAuRat = new Set(rat ? db.prepare('SELECT DISTINCT ue_num FROM ue_section WHERE section_code = ?').all(rat).map(x => x.ue_num) : []);
  const parSection = {};
  for (const ins of inscriptions) {
    if (rat && lieesAuRat.has(ins.ue_num)) { (parSection[rat] = parSection[rat] || new Set()).add(ins.ue_num); continue; }
    const candidats = sectionsParUe[ins.ue_num] || [];
    if (!candidats.length) continue;
    const exact = candidats.find(x => x.annee_scolaire === ins.annee_scolaire);
    const retenue = exact
      || [...candidats].sort((a, b) =>
           String(b.annee_scolaire).localeCompare(String(a.annee_scolaire)))[0];
    (parSection[retenue.section] = parSection[retenue.section] || new Set()).add(ins.ue_num);
  }

  const scores = Object.entries(parSection)
    .map(([section, ues]) => ({ section, n: ues.size }))
    .sort((a, b) => b.n - a.n);
  if (!scores.length) return { sections: [], scores };
  const max = scores[0].n;
  // Seuil : une section n'est retenue que si elle couvre au moins 60 % des UE
  // de la section dominante (une UE partagée isolée reste sous le seuil).
  const sections = scores.filter(s => s.n >= Math.max(2, max * 0.6)).map(s => s.section);
  return { sections: sections.length ? sections : [scores[0].section], scores };
}

/* UN CURSUS EN COURS, LES AUTRES ARCHIVÉS (Charles, 27 septembre 2026 : « si
 * on passe d'un cursus à l'autre, on archive le précédent, sauf si ce sont des
 * cursus compatibles — cela doit se voir »). Le cursus en cours : la section de
 * rattachement, sinon celle des inscriptions de l'année, sinon la dominante.
 * Les sections déclarées compatibles avec lui (Configuration → Enseignement →
 * Cursus compatibles) restent ouvertes à côté ; toute autre section du passé
 * est un cursus ARCHIVÉ : il ne nourrit plus ni le schéma ni la proposition de
 * PAE, et il se nomme, avec ses années et ce qui y a été réussi. */
export function cursusCompatibles() {
  try {
    const l = JSON.parse(db.prepare("SELECT valeur FROM lucie_config WHERE cle = 'cursus_compatibles'").get()?.valeur || '[]');
    return Array.isArray(l) ? l.filter(p => Array.isArray(p) && p.length === 2) : [];
  } catch { return []; }
}
export function cursusDe(etudId, annee) {
  const { sections: toutes, scores } = sectionsDeLEtudiant(etudId, null);
  const rat = db.prepare('SELECT section_rattachement FROM etudiant WHERE id = ?').get(etudId)?.section_rattachement;
  /* LE RATTACHEMENT DÉCLARÉ PRIME, MÊME SANS INSCRIPTION DANS LA SECTION
     (28 septembre 2026, De Clercq : rattaché à TIM, inscrit par erreur à sept
     unités de psychomotricité). Il n'était retenu que si l'étudiant avait déjà
     une inscription dans sa section : sinon le cursus se déduisait des
     inscriptions — c'est-à-dire de l'erreur même qu'il fallait corriger. */
  const presentes = [...new Set([...(rat ? [rat] : []), ...(scores || []).map(x => x.section), ...toutes])];
  if (!presentes.length) return { courant: null, actifs: [], archives: [] };
  let courant = rat || null;
  if (!courant && annee) {
    const n = {};
    for (const x of db.prepare('SELECT ue_num FROM etudiant_inscription WHERE etudiant_id = ? AND annee_scolaire = ?').all(etudId, annee)) {
      const su = db.prepare(`SELECT section FROM ue WHERE ue_num = ? AND section IS NOT NULL AND COALESCE(hors_cursus,0) = 0
        ORDER BY (annee_scolaire = ?) DESC, annee_scolaire DESC LIMIT 1`).get(x.ue_num, annee)?.section;
      if (su) n[su] = (n[su] || 0) + 1;
    }
    courant = Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  }
  if (!courant) courant = rat || toutes[0];
  /* UNE SECTION N'EST PAS UN CURSUS QUAND ELLE NE FAIT QUE PORTER DES UNITÉS
     RATTACHÉES AU SIEN (30 septembre 2026, orthoptie) : le tronc commun est
     rangé sous Optométrie et rattaché à Orthoptie ; un orthoptiste inscrit à
     ce tronc commun lisait « cursus antérieur archivé : Optométrie ». */
  const rattachees = new Set(db.prepare('SELECT DISTINCT ue_num FROM ue_section WHERE section_code = ?').all(courant).map(x => x.ue_num));
  if (rattachees.size) {
    const insc = db.prepare('SELECT DISTINCT ue_num FROM etudiant_inscription WHERE etudiant_id = ?').all(etudId).map(x => x.ue_num);
    const secDe = db.prepare('SELECT section FROM ue WHERE ue_num = ? AND section IS NOT NULL ORDER BY annee_scolaire DESC LIMIT 1');
    for (const sx of [...presentes]) {
      if (sx === courant) continue;
      const siennes = insc.filter(u => secDe.get(u)?.section === sx);
      if (siennes.length && siennes.every(u => rattachees.has(u))) presentes.splice(presentes.indexOf(sx), 1);
    }
  }
  const compat = new Set(cursusCompatibles().filter(p => p.includes(courant)).flat());
  const actifs = presentes.filter(x => x === courant || compat.has(x));
  if (!actifs.includes(courant)) actifs.unshift(courant);
  const archives = presentes.filter(x => !actifs.includes(x)).map(section => {
    const l = db.prepare(`SELECT i.ue_num, i.annee_scolaire, i.resultat FROM etudiant_inscription i
      WHERE i.etudiant_id = ? AND i.ue_num IN (SELECT ue_num FROM ue WHERE section = ?)`).all(etudId, section);
    const ans = [...new Set(l.map(x => x.annee_scolaire))].sort();
    return { section, du: ans[0] || null, au: ans[ans.length - 1] || null,
      reussies: new Set(l.filter(x => x.resultat === 'reussi').map(x => x.ue_num)).size,
      encore_cette_annee: !!annee && ans.includes(annee) };
  });
  return { courant, actifs, archives };
}

/* LES FAITS DU MOTEUR PAE (lib/pae.js), rassemblés UNE fois pour tous les
 * lecteurs : proposition, schéma, frise, PAE de base, contrôle des écritures.
 * `cache` (facultatif) garde ce qui ne dépend que des sections et de l'année
 * — la frise calcule six cents étudiants d'affilée. */
/* LA PART D'UN BLOC À ACQUÉRIR POUR OUVRIR LE SUIVANT (30 septembre 2026) :
   un réglage, pas une constante — Configuration → Paramètres. */
try {
  db.prepare('INSERT OR IGNORE INTO parametre (cle, valeur, label, groupe) VALUES (?,?,?,?)')
    .run('pae_seuil_bloc', '50', "PAE — part des ECTS d'un bloc à acquérir pour ouvrir le bloc suivant (%)", 'pae');
} catch (e) { console.error('[migration] pae_seuil_bloc :', e.message); }
function seuilBloc() {
  try {
    const v = Number(String(db.prepare("SELECT valeur FROM parametre WHERE cle = 'pae_seuil_bloc'").get()?.valeur ?? '50').replace(',', '.'));
    return Number.isFinite(v) && v >= 0 && v <= 100 ? v : 50;
  } catch { return 50; }
}

export function faitsPAE(etudId, annee, sections, cache = null) {
  const cle = `${annee}|${[...sections].sort().join(',')}`;
  let sec = cache?.get(cle);
  if (!sec) {
    const ph = sections.map(() => '?').join(',');
    // Une unité RATTACHÉE à la section (ue_section) est organisée par la
    // section qui la porte : le tronc commun, organisé sous Optométrie, n'était
    // « pas organisé cette année » pour les orthoptistes (30 septembre 2026).
    const organisees = new Set(sections.length ? db.prepare(`SELECT DISTINCT ue_num FROM organisation_ue
      WHERE annee_scolaire = ? AND (section IN (${ph})
        OR ue_num IN (SELECT ue_num FROM ue_section WHERE annee_scolaire = ? AND section_code IN (${ph})))`)
      .all(annee, ...sections, annee, ...sections).map(x => x.ue_num) : []);
    // Les unités RATTACHÉES à la section (ue_section) en font partie comme
    // celles qu'elle porte : le tronc commun d'Optométrie, suivi par les
    // orthoptistes (30 septembre 2026), est rangé sous Optométrie et
    // rattaché à Orthoptie.
    const nums = new Set([...organisees, ...(sections.length ? db.prepare(`SELECT DISTINCT ue_num FROM ue
      WHERE annee_scolaire = ? AND section IN (${ph})`).all(annee, ...sections).map(x => x.ue_num) : []),
      ...(sections.length ? db.prepare(`SELECT DISTINCT ue_num FROM ue_section
      WHERE annee_scolaire = ? AND section_code IN (${ph})`).all(annee, ...sections).map(x => x.ue_num) : [])]);
    // L'épreuve intégrée : la ligne annuelle l'emporte quand elle existe ;
    // sinon la case du référentiel, sinon l'intitulé.
    const annuelle = new Map();
    try {
      for (const l of db.prepare('SELECT ue_num, actif FROM ue_epreuve_integree WHERE annee_scolaire = ?').all(annee)) annuelle.set(l.ue_num, !!l.actif);
    } catch { /* table absente */ }
    const parCase = new Set(db.prepare(`SELECT DISTINCT ue_num FROM ue WHERE COALESCE(is_epreuve_integree,0) = 1
      OR ue_nom LIKE '%preuve int%gr%'`).all().map(x => x.ue_num));
    const ues = [...nums].sort((a, b) => a - b).map(n => ({ ue_num: n, organisee: organisees.has(n),
      epreuve: annuelle.has(n) ? annuelle.get(n) : parCase.has(n) }));
    // Les prérequis de CETTE section et de CETTE année — les colonnes existaient,
    // aucun calcul ne les lisait. Légal bloque, interne avertit.
    const legal = {}, interne = {};
    for (const p of db.prepare(`SELECT ue_num, prerequis_num, COALESCE(type,'legal') AS type, motif, section, annee_scolaire
        FROM ue_prerequis`).all()) {
      if (p.section && !sections.includes(p.section)) continue;
      if (p.annee_scolaire && p.annee_scolaire !== annee) continue;
      if (p.type === 'interne') (interne[p.ue_num] ||= []).push({ ue: p.prerequis_num, motif: p.motif });
      else if (!(legal[p.ue_num] ||= []).includes(p.prerequis_num)) legal[p.ue_num].push(p.prerequis_num);
    }
    sec = { ues, legal, interne, niv: sections.length ? niveauxEffectifs(sections, annee) : {} };
    cache?.set(cle, sec);
  }
  const acquis = new Set([
    ...db.prepare("SELECT DISTINCT ue_num FROM etudiant_inscription WHERE etudiant_id = ? AND resultat = 'reussi'").all(etudId).map(x => x.ue_num),
    ...db.prepare(`SELECT DISTINCT ue_num FROM etudiant_valorisation WHERE etudiant_id = ? AND type = 'complete'
      AND ${vaRetenue()}`).all(etudId).map(x => x.ue_num),
  ]);
  // En attente : AJOURNÉE à sa dernière inscription, l'année consultée ou la
  // précédente. Sans note, ce n'est pas une attente : c'est non acquis.
  const mA = /^(\d{4})-(\d{4})$/.exec(String(annee));
  const anneePrec = mA ? `${+mA[1] - 1}-${+mA[2] - 1}` : null;
  const enAttente = new Set(db.prepare(`SELECT i.ue_num, i.resultat, i.annee_scolaire FROM etudiant_inscription i
      WHERE i.etudiant_id = ? AND i.annee_scolaire = (SELECT MAX(j.annee_scolaire) FROM etudiant_inscription j
        WHERE j.etudiant_id = i.etudiant_id AND j.ue_num = i.ue_num)`).all(etudId)
    .filter(x => x.resultat === 'ajourne' && !acquis.has(x.ue_num)
      && (x.annee_scolaire === annee || x.annee_scolaire === anneePrec)).map(x => x.ue_num));
  const suiviesAvant = db.prepare(`SELECT DISTINCT ue_num FROM etudiant_inscription
    WHERE etudiant_id = ? AND annee_scolaire < ?`).all(etudId, annee).map(x => x.ue_num);
  if (!sec.ects) {
    sec.ects = Object.fromEntries(db.prepare('SELECT ue_num, MAX(ects) e FROM ue WHERE ects IS NOT NULL GROUP BY ue_num').all().map(x => [x.ue_num, Number(x.e) || 0]));
  }
  const plafond = plafondBloc(suiviesAvant, acquis, sec.niv, { ects: sec.ects, seuil: seuilBloc() });
  const etats = etatsPAE({ ues: sec.ues, niv: sec.niv, legal: sec.legal, interne: sec.interne, acquis, enAttente, plafond });
  return { ...sec, acquis, enAttente, suiviesAvant, plafond, etats };
}

/* ── LA PORTE UNIQUE DU PROGRAMME ANNUEL (28 septembre 2026) ─────────────────
 *
 * Vingt-deux routes écrivaient `etudiant_inscription`, et seule la promotion
 * appliquait les règles : les autres inscrivaient ce qu'on leur envoyait. Une
 * règle que seule une porte connaît n'est pas une règle. Toute écriture du
 * programme d'une année passe désormais par ici.
 *
 * Une unité AJOUTÉE est jugée par le moteur (faitsPAE) contre le programme
 * qui en résulte — sous réserve ou cadenas compris. Une unité déjà inscrite
 * n'est pas rejugée : on n'invalide pas en silence ce qui a été posé hier.
 *
 * Deux modes, tranchés par Charles le 28 septembre :
 *   · 'strict' (les écrans) : une unité qui viole une règle n'entre que si un
 *     motif est donné pour elle ; sinon RIEN ne s'écrit et le refus nomme
 *     chaque unité et chaque règle.
 *   · 'signaler' (les imports : eCampus est l'inscription administrative) :
 *     l'unité entre, la dérogation est tracée sous l'origine de l'import et
 *     reste « à régulariser » ; `exclus` écarte ce qu'on a décoché à la
 *     simulation.
 * Chaque dérogation écrit une ligne dans pae_derogation. Une unité déjà
 * réussie qu'on réinscrit porte en plus `derogation = 1` : c'est la
 * réinscription forcée, qu'attendent la confirmation et le nettoyage.
 * Un retrait épargne ce qui porte un résultat, une note ou un report, sauf
 * `forcerRetrait`. Un programme qui change perd sa confirmation — sauf quand
 * c'est la confirmation elle-même qui écrit.
 */
const LIBELLE_REGLE = {
  hors_cursus: 'unité hors du cursus en cours',
  non_organisee: "unité non organisée cette année",
  deja_reussie: 'unité déjà réussie (réinscription : décision du Conseil des études)',
  hors_bloc: "bloc non encore atteint",
  prerequis: 'prérequis non acquis',
  epreuve_fermee: 'épreuve intégrée : des unités antérieures restent à acquérir',
};
export function controlerAjouts(etudId, annee, ajouts, programmeFinal, faits = null) {
  const sections = cursusDe(etudId, annee).actifs;
  const f = faits || faitsPAE(etudId, annee, sections);
  const horsCursusUE = db.prepare('SELECT MAX(COALESCE(hors_cursus,0)) AS h FROM ue WHERE ue_num = ?');
  const forcee = db.prepare(`SELECT COALESCE(derogation,0) AS d FROM etudiant_inscription
    WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?`);
  const nivDe = n => String(f.niv[n] || '').toUpperCase();
  const ecarts = [];
  for (const ue of ajouts) {
    const e = f.etats.get(ue);
    const regles = [];
    if (!e) {
      if (!horsCursusUE.get(ue)?.h) regles.push({ regle: 'hors_cursus', detail: sections.join(', ') || 'aucun cursus' });
    } else {
      if (!e.organisee) regles.push({ regle: 'non_organisee' });
      if (e.deja_reussie && !forcee.get(etudId, annee, ue)?.d) regles.push({ regle: 'deja_reussie' });
      if (!e.deja_reussie && e.hors_bloc) regles.push({ regle: 'hors_bloc', detail: `${nivDe(ue) || '?'} — plafond BA${f.plafond}` });
      if (e.epreuve && e.epreuve_etat === 'fermee') {
        regles.push({ regle: 'epreuve_fermee', detail: `restent ${e.epreuve_restantes.join(', ')}` });
      } else if (!e.deja_reussie) {
        const bloquants = e.prereq_manquants.filter(p => !f.enAttente.has(p)
          && !(programmeFinal.has(p) && nivDe(p) === nivDe(ue)));
        if (bloquants.length) regles.push({ regle: 'prerequis', detail: `exige ${bloquants.join(', ')}` });
      }
    }
    if (regles.length) ecarts.push({ ue_num: ue, regles: regles.map(x => ({ ...x, libelle: LIBELLE_REGLE[x.regle] })) });
  }
  return ecarts;
}

export function ecrireProgramme({ etudId, annee, ajouter = [], retirer = [], origine, par = null,
  motifs = {}, mode = 'strict', exclus = [], forcerRetrait = false, simulation = false, dateInscription = null }) {
  const existantes = db.prepare(`SELECT ue_num, resultat FROM etudiant_inscription
    WHERE etudiant_id = ? AND annee_scolaire = ?`).all(etudId, annee);
  const dejaLa = new Set(existantes.map(x => x.ue_num));
  const exclusSet = new Set(exclus.map(Number));
  const aAjouter = [...new Set(ajouter.map(Number).filter(Boolean))].filter(u => !dejaLa.has(u) && !exclusSet.has(u));
  const aRetirer = [...new Set(retirer.map(Number).filter(Boolean))].filter(u => dejaLa.has(u));
  const final = new Set([...dejaLa, ...aAjouter].filter(u => !aRetirer.includes(u)));

  const ecarts = controlerAjouts(etudId, annee, aAjouter, final);
  const motifDe = u => String(motifs[u] ?? motifs[String(u)] ?? '').trim()
    || (mode === 'signaler' ? `inscription reprise de l'import (${origine})` : '');
  const refus = mode === 'strict' ? ecarts.filter(x => !motifDe(x.ue_num)) : [];

  // Ce qui ne se retire pas sans « forcer » : résultat, note, report.
  const aNote = db.prepare('SELECT 1 FROM etudiant_note_detail WHERE etudiant_id=? AND annee_scolaire=? AND ue_num=? LIMIT 1');
  const aReport = db.prepare('SELECT 1 FROM etudiant_report_note WHERE etudiant_id=? AND annee_scolaire=? AND ue_num=? LIMIT 1');
  const resultatDe = new Map(existantes.map(x => [x.ue_num, x.resultat]));
  const conservees = [], retirables = [];
  for (const u of aRetirer) {
    const pourquoi = resultatDe.get(u) != null ? 'résultat' : aNote.get(etudId, annee, u) ? 'notes'
      : aReport.get(etudId, annee, u) ? 'report' : null;
    if (pourquoi && !forcerRetrait) conservees.push({ ue_num: u, pourquoi });
    else retirables.push(u);
  }
  const bilan = { simulation, origine, ajoutees: aAjouter, retirees: retirables, conservees, ecarts,
    refus, confirmation_retiree: false };
  if (simulation || refus.length) return bilan;

  const date = dateInscription || new Date().toISOString().slice(0, 10);
  const ins = db.prepare(`INSERT INTO etudiant_inscription (etudiant_id, annee_scolaire, ue_num, date_inscription)
    VALUES (?,?,?,?) ON CONFLICT(etudiant_id, annee_scolaire, ue_num) DO NOTHING`);
  const forcer = db.prepare(`UPDATE etudiant_inscription SET derogation = 1, derogation_par = ?, derogation_le = datetime('now')
    WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?`);
  const trace = db.prepare(`INSERT INTO pae_derogation (etudiant_id, annee_scolaire, ue_num, regle, detail, motif, origine, par)
    VALUES (?,?,?,?,?,?,?,?)`);
  const del = db.prepare('DELETE FROM etudiant_inscription WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?');
  db.transaction(() => {
    for (const u of aAjouter) ins.run(etudId, annee, u, date);
    for (const x of ecarts) {
      for (const r0 of x.regles) trace.run(etudId, annee, x.ue_num, r0.regle, r0.detail || null, motifDe(x.ue_num), origine, par);
      if (x.regles.some(r0 => r0.regle === 'deja_reussie')) forcer.run(par, etudId, annee, x.ue_num);
    }
    for (const u of retirables) {
      // Le report d'abord : tant qu'il est accordé, ses notes sont gardées.
      db.prepare('DELETE FROM etudiant_report_note WHERE etudiant_id=? AND annee_scolaire=? AND ue_num=?').run(etudId, annee, u);
      db.prepare('DELETE FROM etudiant_note_detail WHERE etudiant_id=? AND annee_scolaire=? AND ue_num=?').run(etudId, annee, u);
      del.run(etudId, annee, u);
    }
    if ((aAjouter.length || retirables.length) && origine !== 'confirmation') {
      bilan.confirmation_retiree = db.prepare('DELETE FROM etudiant_pae WHERE etudiant_id = ? AND annee_scolaire = ?')
        .run(etudId, annee).changes > 0;
    }
  })();
  if (aAjouter.length || retirables.length) bilan.reports = reporterDOffice(etudId, annee);
  return bilan;
}

// ── Liste des étudiants ───────────────────────────────────────────────────────
r.get('/', authRequired, (req, res) => {
  // SECTION, UNITÉ ET ANNÉE RESTREIGNENT LA LISTE.
  //
  // La fiche d'un étudiant se parcourt à la flèche, d'un dossier au suivant :
  // encore faut-il pouvoir dire de QUELS étudiants il s'agit. « Les inscrits de
  // l'UE 246 en 2024-2025 » est la cohorte qu'on veut suivre — la liste
  // complète de l'établissement ne se parcourt pas.
  const { section, q, ue_num: ueNum, annee: anneeFiltre, statut } = req.query;
  const autorisees = perimetre(req);
  if (section && !sectionAutoriseeReq(req, section)) {
    return res.status(403).json({ error: 'Section hors de votre périmètre' });
  }

  // Tous les étudiants actifs, avec leurs inscriptions toutes années confondues.
  // La section affichée vient des UE de leurs inscriptions (dernière année connue).
  /* UN ÉTUDIANT SANS INSCRIPTION EXISTE AUSSI — ET IL ÉTAIT INVISIBLE.
   *
   * La liste partait des inscriptions (JOIN) : un étudiant sans aucune UE n'y
   * figurait pas. Or c'est exactement l'état d'un BA1 qu'on vient d'importer
   * depuis la signalétique eCampus, avant que son PAE ne soit composé — et
   * c'est l'état d'un dossier créé à la main. L'import disait « 2 créés » et
   * la liste en montrait 0 : Charles en a conclu, le 21 septembre, que Lucie
   * ne permettait pas d'importer des étudiants nouveaux. Elle le permettait ;
   * elle les cachait.
   *
   * LEFT JOIN, donc, et pour un étudiant sans unité la section est celle de
   * son RATTACHEMENT — c'est elle qui le range et qui décide du périmètre. Sans
   * rattachement, il paraît sous « (sans section) », et seulement pour qui voit
   * toutes les sections : on ne montre pas à une coordination un étudiant dont
   * rien ne dit qu'il est le sien. Les filtres par unité ou par année, eux,
   * portent sur des inscriptions : ils l'écartent, et c'est juste. */
  let sql = `
    SELECT e.id, e.nom, e.prenom, e.email_ecole, e.id_ecampus,
           e.sortie_statut, e.sortie_le, e.sortie_motif,
           COALESCE(GROUP_CONCAT(DISTINCT ${SECTION_INSCRIPTION}), e.section_rattachement) AS sections,
           COUNT(DISTINCT i.ue_num) AS nb_ue,
           MAX(i.annee_scolaire) AS derniere_annee
    FROM etudiant e
    LEFT JOIN etudiant_inscription i ON i.etudiant_id = e.id
    LEFT JOIN ${UE_REF} u ON u.ue_num = i.ue_num
    WHERE e.actif = 1
  `;
  const params = [];

  if (section) {
    sql += ` AND (${SECTION_INSCRIPTION} = ? OR (i.ue_num IS NULL AND e.section_rattachement = ?))`;
    params.push(section, section);
  } else if (autorisees) {
    // Hors filtre explicite, la liste se borne au périmètre de la personne.
    const marques = autorisees.map(() => '?').join(',') || "''";
    sql += ` AND (${SECTION_INSCRIPTION} IN (${marques})
                  OR (i.ue_num IS NULL AND e.section_rattachement IN (${marques})))`;
    params.push(...autorisees, ...autorisees);
  }
  if (ueNum) { sql += ` AND i.ue_num = ?`; params.push(Number(ueNum)); }
  if (anneeFiltre) { sql += ` AND i.annee_scolaire = ?`; params.push(anneeFiltre); }
  if (q) {
    sql += ` AND (e.nom LIKE ? OR e.prenom LIKE ? OR e.id_ecampus LIKE ?)`;
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  sql += ` GROUP BY e.id ORDER BY e.nom, e.prenom`;

  const anneeActive = anneeDeTravail(req);
  let rows = db.prepare(sql).all(...params);
  // Le filtre SQL ci-dessus est large (il passe par les unités) ; le
  // périmètre se tranche sur la section de l'étudiant lui-même.
  if (autorisees && !section) rows = rows.filter(r0 => autorisees.includes(sectionPropre(r0.id)));

  // ── QUI EST DIPLÔMÉ ──────────────────────────────────────────────────────
  //
  // Réussir l'épreuve intégrée, c'est être diplômé : elle ne se présente
  // qu'une fois toutes les autres unités acquises, et sa réussite vaut donc
  // pour tout le reste. Le critère est objectif, il n'y a rien à saisir.
  //
  // Un diplômé n'est plus un étudiant en cours de parcours : le laisser dans
  // la liste fausse ce qu'on y cherche — les effectifs, les inscriptions à
  // faire, les dossiers à suivre — et personne ne s'en aperçoit, parce qu'une
  // liste trop longue ne se voit pas.
  //
  // DEUX SOURCES DISENT L'ÉPREUVE INTÉGRÉE, et il faut lire les deux : la
  // table annuelle « ue_epreuve_integree » et l'ancienne colonne
  // « ue.is_epreuve_integree ». Une seule d'entre elles est renseignée selon
  // l'unité et l'année ; s'en tenir à une seule diplômait la moitié des gens.
  const diplomes = new Map();
  try {
    const ei = new Set();
    try {
      for (const l of db.prepare(
        'SELECT ue_num FROM ue_epreuve_integree WHERE actif = 1').all()) ei.add(l.ue_num);
    } catch { /* table absente : la colonne suffira */ }
    try {
      for (const l of db.prepare(
        'SELECT ue_num FROM ue WHERE is_epreuve_integree = 1').all()) ei.add(l.ue_num);
    } catch { /* colonne absente */ }
    /* TROISIÈME SOURCE : L'INTITULÉ. Une épreuve intégrée importée du dossier
     * pédagogique sans que personne ait coché la marque restait invisible —
     * et ses lauréats, jamais diplômés dans la liste. Une unité qui s'appelle
     * « Épreuve intégrée… » EST l'épreuve intégrée : le nom fait foi quand la
     * marque manque. */
    try {
      for (const l of db.prepare(`SELECT DISTINCT ue_num FROM ue
        WHERE ue_nom LIKE '%preuve int%gr%'`).all()) ei.add(l.ue_num);
    } catch { /* colonne absente */ }
    if (ei.size) {
      const dans = [...ei].map(() => '?').join(',');
      /* Deux traces de la réussite, lues toutes deux : le résultat recopié
       * au dossier, et la décision de délibération elle-même — une reprise
       * ou un import qui n'aurait écrit que l'une ne doit pas priver un
       * lauréat de son diplôme. La plus récente l'emporte. */
      for (const l of db.prepare(`
        SELECT etudiant_id, MAX(annee_scolaire) AS annee, ue_num FROM (
          SELECT etudiant_id, annee_scolaire, ue_num FROM etudiant_inscription
           WHERE resultat IN ('reussi','valorise') AND ue_num IN (${dans})
          UNION ALL
          SELECT etudiant_id, annee_scolaire, ue_num FROM deliberation_resultat
           WHERE resultat IN ('reussi','valorise') AND ue_num IN (${dans})
        ) GROUP BY etudiant_id
      `).all(...ei, ...ei)) diplomes.set(l.etudiant_id, { annee: l.annee, ue_num: l.ue_num });
    }
  } catch (e) { console.error('[étudiants] diplômés :', e.message); }

  // Les PAE confirmés de l'année : une seule requête plutôt qu'une par ligne.
  const confirmes = new Set(db.prepare(
    'SELECT etudiant_id FROM etudiant_pae WHERE annee_scolaire = ? AND confirme_le IS NOT NULL'
  ).all(anneeActive).map(x => x.etudiant_id));

  /* LES SEGMENTS. L'archive l'emporte sur tout : ce qu'on a rangé à la cave
   * ne revient dans aucune liste de travail, diplômé ou non. Puis le
   * diplôme — déduit de l'épreuve intégrée OU posé à la main —, puis la
   * sortie. « En cours », c'est ce qui reste. */
  const segment = r0 => {
    if (r0.sortie_statut === 'archive') return 'archives';
    if (diplomes.has(r0.id) || r0.sortie_statut === 'diplome') return 'diplomes';
    if (r0.sortie_statut === 'sorti') return 'sortis';
    return 'en_cours';
  };
  const vus = rows.filter(r0 => {
    if (!statut || statut === 'tous') return true;
    return segment(r0) === statut;
  });

  // LES NOUVEAUX INSCRITS (primo) : aucune trace — inscription ou
  // valorisation — avant l'année de travail. Même définition que la grille
  // des PAE ; le matricule n'est qu'un indice, l'historique fait foi.
  const anciensListe = new Set([
    ...db.prepare('SELECT DISTINCT etudiant_id FROM etudiant_inscription WHERE annee_scolaire < ?')
      .all(anneeActive).map(x => x.etudiant_id),
    ...db.prepare('SELECT DISTINCT etudiant_id FROM etudiant_valorisation WHERE annee_scolaire < ?')
      .all(anneeActive).map(x => x.etudiant_id),
  ]);

  // LE PAE VALIDÉ DANS LA REVUE se voit dans la liste (Charles, 2 octobre
  // 2026 : une bille verte au v blanc, à côté du nom).
  const valides = new Map();
  try {
    for (const x of db.prepare('SELECT etudiant_id, revu_le, revu_par FROM pae_revue WHERE annee_scolaire = ?').all(anneeActive))
      valides.set(x.etudiant_id, x);
  } catch { /* table pas encore créée */ }

  /* CE QUI MANQUE AU DOSSIER (Charles, 9 octobre 2026 : « afin d'aider le
     secrétariat à compléter les dossiers incomplets, des filtres par type :
     nationalité, sexe, date de naissance, titre d'accès… »). Seuls les NOMS
     des champs vides partent vers l'écran, jamais les valeurs : le n° national
     et l'adresse restent réservés à qui peut les lire. */
  const manquesDe = new Map();
  {
    const vide = v => v == null || String(v).trim() === '';
    for (const x of db.prepare(`SELECT id, nationalite, sexe, date_naissance, lieu_naissance, titre_acces, diplome_max,
        adresse, cp, localite, email_ecole, email_perso, gsm, num_national FROM etudiant WHERE actif = 1`).all()) {
      const m = [];
      if (vide(x.nationalite)) m.push('nationalite'); else if (!estUnPays(x.nationalite)) m.push('nationalite_libre');
      if (vide(x.sexe)) m.push('sexe');
      if (vide(x.date_naissance)) m.push('date_naissance');
      if (vide(x.lieu_naissance)) m.push('lieu_naissance');
      if (vide(x.titre_acces)) m.push('titre_acces');
      if (vide(x.diplome_max)) m.push('diplome_max');
      if (vide(x.adresse) || vide(x.cp) || vide(x.localite)) m.push('adresse');
      if (vide(x.email_ecole)) m.push('email_ecole');
      if (vide(x.email_perso)) m.push('email_perso');
      if (vide(x.gsm)) m.push('gsm');
      if (vide(x.num_national)) m.push('num_national');
      if (m.length) manquesDe.set(x.id, m);
    }
  }

  res.json(vus.map(r0 => {
    const n = niveauEtudiant(r0.id, anneeActive);
    const rat = sectionRattachement(r0.id, anneeActive);
    const d = diplomes.get(r0.id) || null;
    return {
      ...r0, niveau: n.niveau, niveau_libelle: n.libelle,
      diplome: !!d || r0.sortie_statut === 'diplome',
      diplome_declare: !d && r0.sortie_statut === 'diplome',
      diplome_annee: d?.annee || null, diplome_ue: d?.ue_num || null,
      segment: segment(r0),
      // Tant que le programme n'est pas confirmé, il n'est qu'une proposition.
      pae_confirme: confirmes.has(r0.id),
      pae_valide: valides.has(r0.id) ? { le: valides.get(r0.id).revu_le, par: valides.get(r0.id).revu_par } : null,
      primo: !anciensListe.has(r0.id),
      section_rattachement: rat.section,
      section_deduite: rat.deduite,
      manques: manquesDe.get(r0.id) || [],
    };
  }));
});

/* ── LA FRISE DU PARCOURS, DANS LA LISTE (2.12.193) ─────────────────────────
 * Demandé par Charles le 26 septembre 2026 : sur chaque ligne de la liste, les
 * UE de la section dans l'ordre du cursus, en vert celles réussies, en bleu
 * celles inscrites, en gris ce qui n'est pas atteignable. Une route à part —
 * la liste garde sa forme — qui rend, par section, l'ordre des UE une fois, et
 * par étudiant une chaîne d'une lettre par UE :
 *   r réussie · f réussie par faveur · i inscrite cette année · a ajournée, en
 *   attente · o atteignable, non prise · n pas encore atteignable.
 * Les états viennent du moteur du PAE (lib/pae.js), comme ceux de la fiche.
 */
/* ── LES NATIONALITÉS REMISES D'APLOMB (3 octobre 2026) ─────────────────────
 * La nationalité se tapait : vingt formes pour une dizaine de pays. Depuis
 * 3.0.15 elle se choisit dans la liste des pays ; ceci range ce qui a été
 * écrit avant. Simulation d'abord (GET), puis l'écriture (POST), qui ne
 * touche que ce qu'elle a reconnu — le reste est nommé, pour être corrigé à
 * la main sur la fiche. */
function planNationalites() {
  const lignes = db.prepare(`SELECT nationalite v, COUNT(*) n FROM etudiant
    WHERE COALESCE(TRIM(nationalite), '') <> '' GROUP BY nationalite ORDER BY n DESC`).all();
  const corriger = [], revoir = [];
  for (const l of lignes) {
    if (estUnPays(l.v)) continue;
    const p = paysDe(l.v);
    (p ? corriger : revoir).push({ actuel: l.v, propose: p?.nom || null, dossiers: l.n });
  }
  return { corriger, revoir };
}
r.get('/nationalites/normaliser', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  res.json(planNationalites());
});
r.post('/nationalites/normaliser', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { corriger } = planNationalites();
  const maj = db.prepare('UPDATE etudiant SET nationalite = ? WHERE nationalite = ?');
  let n = 0;
  db.transaction(() => { for (const c of corriger) n += maj.run(c.propose, c.actuel).changes; })();
  console.log(`[nationalites] ${n} dossier(s) remis d'aplomb par ${req.user?.nom || req.user?.email || '?'}`);
  res.json({ ok: true, dossiers: n });
});

r.get('/frises', authRequired, (req, res) => {
  const annee = req.query.annee || anneeDeTravail(req);
  const autorisees = perimetre(req);

  // Acquis, attente et plafond viennent du moteur (faitsPAE) ; ne se lisent ici
  // en bloc que la faveur et l'année de réussite, qui ne changent pas l'état.
  const faveurs = new Set(), inscritesDe = new Map();
  const ajouter = (m, id, v) => { if (!m.has(id)) m.set(id, new Set()); m.get(id).add(v); };
  const reussiesAn = new Map();
  for (const x of db.prepare(`SELECT etudiant_id, ue_num, annee_scolaire FROM etudiant_inscription
      WHERE resultat = 'reussi' ORDER BY annee_scolaire`).all()) {
    reussiesAn.set(`${x.etudiant_id}|${x.ue_num}`, x.annee_scolaire);
  }
  try {
    for (const f of db.prepare(`SELECT DISTINCT etudiant_id, ue_num, annee_scolaire FROM deliberation_ajustement
        WHERE action = 'faveur'`).all()) faveurs.add(`${f.etudiant_id}|${f.ue_num}|${f.annee_scolaire}`);
  } catch { /* table absente */ }
  try {
    for (const f of db.prepare(`SELECT DISTINCT etudiant_id, ue_num, annee_scolaire FROM etudiant_resultat_cours
        WHERE faveur = 1 AND ue_num IS NOT NULL`).all()) faveurs.add(`${f.etudiant_id}|${f.ue_num}|${f.annee_scolaire}`);
  } catch { /* table absente */ }
  for (const x of db.prepare('SELECT etudiant_id, ue_num FROM etudiant_inscription WHERE annee_scolaire = ?').all(annee)) {
    ajouter(inscritesDe, x.etudiant_id, x.ue_num);
  }
  /* LES ECTS DU PROGRAMME DE L'ANNÉE, à côté de la frise (Charles, 30
     septembre 2026 : « à côté, le nombre d'ECTS inscrits cette année »). Les
     crédits de l'unité dans le référentiel de l'année, à défaut le plus récent. */
  const ectsUE = new Map(db.prepare(`SELECT ue_num, MAX(ects) e FROM ue WHERE ects IS NOT NULL
      AND annee_scolaire = (SELECT MAX(u2.annee_scolaire) FROM ue u2 WHERE u2.ue_num = ue.ue_num AND u2.ects IS NOT NULL AND u2.annee_scolaire <= ?)
      GROUP BY ue_num`).all(annee).map(x => [x.ue_num, Number(x.e) || 0]));

  const graphes = {};
  const graphe = sec => {
    if (graphes[sec] !== undefined) return graphes[sec];
    const base = construireGraphe({ sections: [sec], annee });
    if (!base.nodes.length) return (graphes[sec] = null);
    // L'ordre du cursus : par bloc, l'épreuve intégrée au bout, puis la place
    // dans le schéma.
    const nodes = [...base.nodes].sort((a, b) =>
      (a.epreuve_integree - b.epreuve_integree) || (rangNiveau(a.ue_niv) - rangNiveau(b.ue_niv))
      || (a.couche - b.couche) || (a.ordre - b.ordre) || (a.ue_num - b.ue_num));
    return (graphes[sec] = { nodes });
  };

  const sections = {}, etats = {};
  const cacheFaits = new Map();
  for (const e of db.prepare('SELECT id FROM etudiant WHERE actif = 1').all()) {
    const sec = sectionRattachement(e.id, annee).section;
    if (!sec || (autorisees && !autorisees.includes(sec))) continue;
    const g = graphe(sec);
    if (!g) continue;
    if (!sections[sec]) {
      sections[sec] = g.nodes.map(n => ({ ue_num: n.ue_num, ue_nom: n.ue_nom, bloc: n.ue_niv || '',
        ei: !!n.epreuve_integree }));
    }
    const inscrites = inscritesDe.get(e.id) || new Set();
    // Le moteur du PAE (lib/pae.js), sur le cursus actif — le même calcul que
    // la fiche et la proposition.
    const actifs = cursusDe(e.id, annee).actifs;
    const faits = faitsPAE(e.id, annee, actifs.length ? actifs : [sec], cacheFaits);
    etats[e.id] = { s: sec, c: g.nodes.map(n => {
      const u = n.ue_num;
      const st = faits.etats.get(u)?.statut || 'bloquee';
      if (st === 'acquise') return faveurs.has(`${e.id}|${u}|${reussiesAn.get(`${e.id}|${u}`)}`) ? 'f' : 'r';
      if (inscrites.has(u)) return 'i';
      if (st === 'en_attente') return 'a';
      if (st === 'accessible' || st === 'sous_reserve') return 'o';
      return 'n';
    }).join(''), ects: [...inscrites].reduce((t, u) => t + (ectsUE.get(u) || 0), 0) };
  }
  res.json({ annee, sections, etats });
});

/* ── Coordonnées d'une sélection ──────────────────────────────────────────
 * L'écran coche, la pièce se lit : emails, GSM et adresse des étudiants
 * retenus. Le périmètre s'applique comme sur la liste — on n'imprime pas
 * ceux qu'on ne peut pas voir. */
r.post('/coordonnees', authRequired, (req, res) => {
  const ids = Array.isArray(req.body?.ids)
    ? req.body.ids.map(Number).filter(Number.isInteger) : [];
  if (!ids.length) return res.status(400).json({ error: 'ids requis' });

  const marques = ids.map(() => '?').join(',');
  let lignes = db.prepare(`
    SELECT e.id, e.nom, e.prenom, e.email_ecole, e.email_perso, e.gsm,
           e.adresse, e.cp, e.localite,
           COALESCE(GROUP_CONCAT(DISTINCT ${SECTION_INSCRIPTION}), e.section_rattachement) AS sections
    FROM etudiant e
    LEFT JOIN etudiant_inscription i ON i.etudiant_id = e.id
    LEFT JOIN ${UE_REF} u ON u.ue_num = i.ue_num
    WHERE e.id IN (${marques}) AND e.actif = 1
    GROUP BY e.id ORDER BY e.nom, e.prenom
  `).all(...ids);

  const autorisees = perimetre(req);
  if (autorisees) {
    lignes = lignes.filter((l) =>
      String(l.sections || '').split(',').some((s) => autorisees.includes(s.trim())));
  }

  const html = htmlListeCoordonnees({
    titre: 'Coordonnées des étudiants',
    sousTitre: `${lignes.length} étudiant(s)`,
    colonnes: [
      { cle: 'nom', label: 'Nom' },
      { cle: 'prenom', label: 'Prénom' },
      { cle: 'sections', label: 'Section' },
      { cle: 'email_ecole', label: 'E-mail école' },
      { cle: 'email_perso', label: 'E-mail privé' },
      { cle: 'gsm', label: 'GSM' },
      { cle: '_adresse', label: 'Adresse' },
    ],
    lignes: lignes.map((l) => ({
      ...l,
      _adresse: [l.adresse, [l.cp, l.localite].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    })),
  });
  res.json({ html, nom: `Coordonnees_etudiants_${lignes.length}` });
});

/* ── Répartition des inscrits dans les organisations d'une unité ──────────
 * La délibération se tient par organisation : la coordination range chaque
 * inscrit dans la sienne, à la main — c'est elle qui sait. GET rend l'état,
 * POST écrit en bloc. Même périmètre que la feuille de délibération. */
r.get('/repartition', authRequired, (req, res) => {
  const ueNum = Number(req.query.ue_num);
  const annee = req.query.annee || anneeDeTravail(req);
  if (!ueNum) return res.status(400).json({ error: 'ue_num requis' });
  if (!unitePermise(req, res, ueNum)) return;

  const organisations = db.prepare(`
    SELECT DISTINCT num_organisation AS num FROM attribution
     WHERE ue_num = ? AND annee_scolaire = ? AND num_organisation IS NOT NULL
    UNION
    SELECT DISTINCT num_organisation FROM ue_inscription
     WHERE ue_num = ? AND annee_scolaire = ? AND num_organisation IS NOT NULL
    ORDER BY 1
  `).all(ueNum, annee, ueNum, annee).map(r0 => r0.num);

  const etudiants = db.prepare(`
    SELECT e.id, e.nom, e.prenom, e.id_ecampus, i.num_organisation, i.groupe
    FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
    WHERE i.ue_num = ? AND i.annee_scolaire = ?
    ORDER BY e.nom, e.prenom
  `).all(ueNum, annee);

  res.json({ ue_num: ueNum, annee, organisations, etudiants });
});

r.post('/repartition', authRequired, roleRequired(...PEUT_INSTRUIRE), (req, res) => {
  const ueNum = Number(req.body?.ue_num);
  const annee = String(req.body?.annee || '').trim();
  const affectations = Array.isArray(req.body?.affectations) ? req.body.affectations : [];
  if (!ueNum || !annee) return res.status(400).json({ error: 'ue_num et annee requis' });
  if (!affectations.length) return res.status(400).json({ error: 'Aucune affectation.' });
  if (!unitePermise(req, res, ueNum)) return;

  const maj = db.prepare(`
    UPDATE etudiant_inscription SET num_organisation = ?
    WHERE etudiant_id = ? AND ue_num = ? AND annee_scolaire = ?
  `);
  let modifies = 0;
  db.transaction(() => {
    for (const x of affectations) {
      const eid = Number(x?.etudiant_id);
      const org = x?.num_organisation == null || x.num_organisation === ''
        ? null : Number(x.num_organisation);
      if (!Number.isInteger(eid)) continue;
      if (org !== null && (!Number.isInteger(org) || org < 1)) continue;
      modifies += maj.run(org, eid, ueNum, annee).changes;
    }
  })();
  res.json({ ok: true, modifies });
});

/* ── Répartition des étudiants dans les groupes de cours ──────────────────
 * Le croisement attributions × PAE : les colonnes viennent des attributions
 * (organisation, lettre de groupe, professeurs), les lignes du PAE. Trois
 * routes : les UE d'une section, le détail d'une UE, l'écriture en bloc. */
r.get('/repartition-cours', authRequired, (req, res) => {
  const section = String(req.query.section || '').trim();
  const annee = req.query.annee || anneeDeTravail(req);
  if (!section) return res.status(400).json({ error: 'section requise' });
  if (!sectionAutoriseeReq(req, section)) {
    return res.status(403).json({ error: 'Section hors de votre périmètre' });
  }
  const ues = db.prepare(`
    SELECT u.ue_num, MAX(u.ue_nom) AS ue_nom,
           (SELECT COUNT(*) FROM etudiant_inscription i
             WHERE i.ue_num = u.ue_num AND i.annee_scolaire = ?) AS inscrits
    FROM ue u
    WHERE u.annee_scolaire = ? AND (u.section = ? OR u.ue_num IN
      (SELECT ue_num FROM ue_section WHERE annee_scolaire = ? AND section_code = ?))
    GROUP BY u.ue_num ORDER BY u.ue_num
  `).all(annee, annee, section, annee, section);
  res.json({ section, annee, ues });
});

/* HORS DU CARNET DE COTES (Charles, 8 octobre 2026 : « je dois pouvoir décocher le
 * cours pour qu'il n'apparaisse pas dans le carnet de cotes du prof — c'est
 * parfois de l'EPT, ou des périodes données pour des corrections »). Un cours et
 * une activité, pour une année : les lignes d'attribution qui les portent ne
 * mettent plus le cours dans Mes cours de leur titulaire (routes/mesCours.js,
 * attributionsDe). Les attributions, elles, ne changent pas. */
db.exec(`CREATE TABLE IF NOT EXISTS carnet_exclusion (
  annee_scolaire TEXT NOT NULL, cours_code TEXT NOT NULL, activite_id INTEGER NOT NULL DEFAULT 0,
  par TEXT, le TEXT DEFAULT (datetime('now')), PRIMARY KEY (annee_scolaire, cours_code, activite_id))`);
const horsCarnet = db.prepare('SELECT 1 FROM carnet_exclusion WHERE annee_scolaire = ? AND cours_code = ? AND activite_id = ?');
r.put('/repartition-cours/carnet', authRequired, roleRequired(...PEUT_INSTRUIRE), (req, res) => {
  const { cours_code, exclu } = req.body || {};
  const activite = Number(req.body?.activite_id) || 0;
  const annee = String(req.body?.annee || anneeDeTravail(req));
  if (!cours_code) return res.status(400).json({ error: 'cours_code requis' });
  const c = db.prepare('SELECT ue_num FROM cours WHERE cours_code = ? AND annee_scolaire = ? LIMIT 1').get(cours_code, annee);
  if (!c) return res.status(404).json({ error: 'Cours inconnu pour cette année.' });
  if (!unitePermise(req, res, c.ue_num)) return;
  if (exclu) db.prepare('INSERT OR IGNORE INTO carnet_exclusion (annee_scolaire, cours_code, activite_id, par) VALUES (?,?,?,?)')
    .run(annee, cours_code, activite, req.user?.nom || req.user?.email || null);
  else db.prepare('DELETE FROM carnet_exclusion WHERE annee_scolaire = ? AND cours_code = ? AND activite_id = ?').run(annee, cours_code, activite);
  res.json({ ok: true, hors_carnet: !!exclu });
});

/* LES GROUPES COMMUNS (lib/groupesCommuns.js) : une cohorte = une section et
   un bloc, coupée en briques ; tous les groupes de toutes ses activités s'en
   déduisent. Lire est permis à qui lit la répartition ; écrire, à qui la fait. */
migrerGroupesCommuns(db);
const lireCohorte = (req, res) => {
  const section = String(req.query.section || req.body?.section || '').trim();
  const bloc = String(req.query.bloc || req.body?.bloc || '').trim().toUpperCase();
  const annee = String(req.query.annee || req.body?.annee || anneeDeTravail(req));
  if (!section || !bloc) { res.status(400).json({ error: 'section et bloc requis' }); return null; }
  if (!sectionAutoriseeReq(req, section)) { res.status(403).json({ error: 'Section hors de votre périmètre' }); return null; }
  return cohorteGC(section, bloc, annee);
};
r.get('/repartition-cours/communs', authRequired, (req, res) => {
  const c = lireCohorte(req, res); if (c) res.json(c);
});
r.put('/repartition-cours/communs', authRequired, roleRequired(...PEUT_INSTRUIRE), (req, res) => {
  const c = lireCohorte(req, res); if (!c) return;
  const par = req.user?.email || null;
  const reg = db.prepare(`INSERT INTO groupe_commun_reglage (annee_scolaire, section, bloc, cours_code, activite_id, nb_groupes, quadri, inclus, ordre, maj_par)
    VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(annee_scolaire, section, bloc, cours_code, activite_id) DO UPDATE SET
    nb_groupes = excluded.nb_groupes, quadri = excluded.quadri, inclus = excluded.inclus, ordre = excluded.ordre, maj_par = excluded.maj_par, maj_le = datetime('now')`);
  const bri = db.prepare(`INSERT INTO groupe_commun_brique (annee_scolaire, section, bloc, etudiant_id, brique, maj_par)
    VALUES (?,?,?,?,?,?) ON CONFLICT(annee_scolaire, section, bloc, etudiant_id) DO UPDATE SET
    brique = excluded.brique, maj_par = excluded.maj_par, maj_le = datetime('now')`);
  const actifs = new Set(c.activites.map(a => `${a.cours_code}#${a.activite_id}`));
  const ids = new Set(c.etudiants.map(e => e.id));
  db.transaction(() => {
    for (const x of (req.body?.reglages || [])) {
      if (!actifs.has(`${x.cours_code}#${Number(x.activite_id) || 0}`)) continue;
      reg.run(c.annee, c.section, c.bloc, x.cours_code, Number(x.activite_id) || 0,
        Math.max(1, Math.min(48, Number(x.nb_groupes) || 1)), ['Q1', 'Q2', 'AN'].includes(x.quadri) ? x.quadri : 'AN', x.inclus === false ? 0 : 1,
        Array.isArray(x.ordre) ? JSON.stringify(x.ordre.map(String).slice(0, 48)) : null, par);
    }
    if (req.body?.briques) {
      db.prepare('DELETE FROM groupe_commun_brique WHERE annee_scolaire = ? AND section = ? AND bloc = ?').run(c.annee, c.section, c.bloc);
      for (const [id, b] of Object.entries(req.body.briques)) if (ids.has(Number(id)) && Number(b) > 0) bri.run(c.annee, c.section, c.bloc, Number(id), Number(b), par);
    }
  })();
  res.json({ ok: true, ...cohorteGC(c.section, c.bloc, c.annee) });
});
r.post('/repartition-cours/communs/proposer', authRequired, (req, res) => {
  const c = lireCohorte(req, res); if (!c) return;
  const B = Math.max(1, Math.min(96, Number(req.body?.nb_briques) || c.nb_briques));
  res.json({ nb_briques: B, briques: proposerBriques(c, B) });
});
r.post('/repartition-cours/communs/appliquer', authRequired, roleRequired(...PEUT_INSTRUIRE), (req, res) => {
  const c = lireCohorte(req, res); if (!c) return;
  res.json(appliquerBriques(c, { simulation: req.body?.simulation !== false, par: req.user?.email || null }));
});

r.get('/repartition-cours/ue', authRequired, (req, res) => {
  const ueNum = Number(req.query.ue_num);
  const annee = req.query.annee || anneeDeTravail(req);
  if (!ueNum) return res.status(400).json({ error: 'ue_num requis' });
  if (!unitePermise(req, res, ueNum)) return;

  // Les cours et leurs groupes, tels que les attributions les définissent.
  const coursRows = db.prepare(`
    SELECT cours_code, cours_nom, cours_per, plafond_groupe FROM cours
    WHERE ue_num = ? AND annee_scolaire = ? ORDER BY cours_code
  `).all(ueNum, annee);
  const attr = db.prepare(`
    SELECT a.code_cours, COALESCE(a.num_organisation, 1) AS org,
           a.code AS groupe, p.nom, p.prenom,
           COALESCE(a.activite_id, 0) AS activite_id,
           t.libelle AS activite_libelle, COALESCE(t.ordre, 999) AS activite_ordre
    FROM attribution a LEFT JOIN professeur p ON p.id = a.professeur_id
    LEFT JOIN activite_type t ON t.id = a.activite_id
    WHERE a.ue_num = ? AND a.annee_scolaire = ? AND a.code_cours IS NOT NULL
  `).all(ueNum, annee);
  // Cours → activité → groupe. Ce sont les ACTIVITÉS qui se coupent en
  // groupes : chacune forme son propre bloc de colonnes.
  const parCours = {};
  for (const a of attr) {
    const acts = (parCours[a.code_cours] ||= new Map());
    const bloc = acts.get(a.activite_id) || { activite_id: a.activite_id,
      activite_libelle: a.activite_libelle || null, activite_ordre: a.activite_ordre, groupes: new Map() };
    const clef = `${a.org}|${a.groupe || ''}`;
    const g = bloc.groupes.get(clef)
      || { num_organisation: a.org, groupe: a.groupe || null, professeurs: new Set() };
    if (a.nom) g.professeurs.add(`${a.prenom ? a.prenom[0] + '. ' : ''}${a.nom}`);
    bloc.groupes.set(clef, g);
    acts.set(a.activite_id, bloc);
  }
  const cours = coursRows.flatMap(c => {
    const blocs = [...(parCours[c.cours_code]?.values() || [])]
      .sort((x, y) => x.activite_ordre - y.activite_ordre || x.activite_id - y.activite_id);
    if (!blocs.length) blocs.push({ activite_id: 0, activite_libelle: null, groupes: new Map() });
    return blocs.map(b => {
      const groupes = [...b.groupes.values()]
        .map(g => ({ ...g, professeurs: [...g.professeurs].join(', ') }))
        .sort((x, y) => x.num_organisation - y.num_organisation
          || String(x.groupe || '').localeCompare(String(y.groupe || ''), 'fr', { numeric: true }));
      // Un seul groupe (ou aucun) : « Tous » — chaque inscrit y est d'office.
      return { ...c, activite_id: b.activite_id, activite_libelle: b.activite_libelle,
        cle: `${c.cours_code}#${b.activite_id}`, groupes, sans_groupe: groupes.length <= 1,
        hors_carnet: !!horsCarnet.get(annee, c.cours_code, b.activite_id) };
    });
  });

  // Les adresses servent à rapprocher un classeur de groupes : le mail
  // départage deux homonymes, là où le nom seul hésiterait.
  const etudiants = db.prepare(`
    SELECT e.id, e.nom, e.prenom, e.email_ecole, e.email_perso, i.num_organisation
    FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
    WHERE i.ue_num = ? AND i.annee_scolaire = ? ORDER BY e.nom, e.prenom
  `).all(ueNum, annee);
  const affectations = coursRows.length ? db.prepare(`
    SELECT etudiant_id, cours_code, activite_id, num_organisation, groupe_code
    FROM etudiant_cours_groupe
    WHERE annee_scolaire = ? AND cours_code IN (${coursRows.map(() => '?').join(',')})
  `).all(annee, ...coursRows.map(c => c.cours_code)) : [];

  /* LES DISPENSES PAR COURS (Charles, 9 octobre 2026, cas Dethier) : un
     étudiant dispensé d'un cours (VAP, report) n'a pas de groupe à y recevoir ;
     dispensé de l'unité (VA), d'aucun. L'écran grise la case et le dit. */
  const disp = dispensesDeLUE(ueNum, annee);
  const dispenses = Object.fromEntries([...disp].map(([id, d]) => [id, { ue: d.ue, cours: Object.fromEntries(d.cours) }]));

  res.json({ ue_num: ueNum, annee, cours, etudiants, affectations, dispenses });
});

/* RENOMMER UN GROUPE, ET L'ATTRIBUTION SUIT (3.1.23, Charles, 4 octobre 2026 :
   « on devrait pouvoir changer les groupes ici, avec conséquences sur
   l'attribution »). Le nom d'un groupe n'existe qu'à un endroit — le code de
   la ligne d'attribution — et les étudiants répartis y sont rattachés par ce
   nom (`etudiant_cours_groupe.groupe_code`). Les deux se renomment donc
   ENSEMBLE, dans une transaction : renommer l'un sans l'autre laisserait des
   étudiants dans un groupe qui n'existe plus.
   - un nom déjà pris par un autre groupe du même cours : les deux s'ÉCHANGENT ;
   - « renuméroter » nomme tous les groupes du cours dans l'ordre, selon
     A, B… · A1, A2… (la lettre est l'organisation) · 1, 2… (lib/groupes.js). */
function groupesDuCours(ueNum, annee, cours, act) {
  return db.prepare(`SELECT DISTINCT COALESCE(num_organisation, 1) org, code FROM attribution
    WHERE ue_num = ? AND annee_scolaire = ? AND code_cours = ? AND COALESCE(activite_id, 0) = ?
      AND code IS NOT NULL AND code <> '' AND UPPER(code) <> 'TS'`)
    /* PAS DE FILTRE SUR split_groupe : la répartition montre comme groupe toute
       ligne qui porte un nom (333.3, organisation 2 : « A » et « C » marqués
       split et nommés). L'écarter ici disait « ce groupe n'existe pas » pour un
       groupe affiché à l'écran (Charles, 4 octobre 2026). */
    .all(ueNum, annee, cours, act);
}
function appliquerRenommages(req, ueNum, annee, cours, act, renommages) {
  // renommages : [{ org, ancien, nouveau }] — en deux temps, pour qu'un échange
  // ou une permutation ne heurte jamais un nom encore occupé.
  const majA = db.prepare(`UPDATE attribution SET code = ? WHERE ue_num = ? AND annee_scolaire = ?
    AND code_cours = ? AND COALESCE(activite_id, 0) = ? AND COALESCE(num_organisation, 1) = ? AND code = ?`);
  const majE = db.prepare(`UPDATE etudiant_cours_groupe SET groupe_code = ?, maj_le = datetime('now'), maj_par = ?
    WHERE annee_scolaire = ? AND cours_code = ? AND activite_id = ? AND COALESCE(num_organisation, 1) = ? AND groupe_code = ?`);
  const par = req.user?.nom || req.user?.email || null;
  let lignes = 0, etudiants = 0;
  db.transaction(() => {
    renommages.forEach((x, i) => {
      const tmp = `__renom_${i}`;
      lignes += majA.run(tmp, ueNum, annee, cours, act, x.org, x.ancien).changes;
      etudiants += majE.run(tmp, par, annee, cours, act, x.org, x.ancien).changes;
    });
    renommages.forEach((x, i) => {
      const tmp = `__renom_${i}`;
      majA.run(x.nouveau, ueNum, annee, cours, act, x.org, tmp);
      majE.run(x.nouveau, par, annee, cours, act, x.org, tmp);
    });
  })();
  return { lignes, etudiants };
}
function peutRenommer(req, res) {
  // Le geste ET le module : l'écran montre le crayon sur ces deux conditions,
  // la porte les exige aussi — un secrétariat qui lit les attributions ne les renomme pas.
  if (gesteAutorise(req, 'attributions.modifier') !== 'oui' || !peutModule(req.user, 'attributions', 'ecrire')) {
    res.status(403).json({ error: 'Renommer un groupe modifie les attributions : votre rôle ne le permet pas.' });
    return false;
  }
  return true;
}

r.post('/repartition-cours/renommer-groupe', authRequired, (req, res) => {
  if (!peutRenommer(req, res)) return;
  const ueNum = Number(req.body?.ue_num);
  const annee = String(req.body?.annee || '').trim();
  const cours = String(req.body?.cours_code || '').trim();
  const act = Number(req.body?.activite_id) || 0;
  const org = Number(req.body?.num_organisation) || 1;
  const ancien = String(req.body?.ancien || '').trim();
  const nouveau = String(req.body?.nouveau || '').trim().toUpperCase();
  if (!ueNum || !annee || !cours || !ancien) return res.status(400).json({ error: 'Groupe non désigné.' });
  if (!unitePermise(req, res, ueNum)) return;
  if (!/^[A-Z0-9]{1,6}$/.test(nouveau) || nouveau === 'TS') {
    return res.status(400).json({ error: 'Un nom de groupe : des lettres et des chiffres, six au plus (A, B, A1, A2, 1, 2…).' });
  }
  if (nouveau === ancien.toUpperCase()) return res.json({ ok: true, lignes: 0, etudiants: 0 });
  const existants = groupesDuCours(ueNum, annee, cours, act).filter(g => g.org === org);
  if (!existants.some(g => g.code === ancien)) return res.status(404).json({ error: `Le groupe ${ancien} n'existe pas dans ce cours.` });
  const occupe = existants.find(g => g.code.toUpperCase() === nouveau);
  const renommages = [{ org, ancien, nouveau }];
  if (occupe) renommages.push({ org, ancien: occupe.code, nouveau: ancien });   // échange
  const r2 = appliquerRenommages(req, ueNum, annee, cours, act, renommages);
  res.json({ ok: true, echange: !!occupe, ...r2 });
});

r.post('/repartition-cours/renumeroter', authRequired, (req, res) => {
  if (!peutRenommer(req, res)) return;
  const ueNum = Number(req.body?.ue_num);
  const annee = String(req.body?.annee || '').trim();
  const cours = String(req.body?.cours_code || '').trim();
  const act = Number(req.body?.activite_id) || 0;
  const mode = ['lettres', 'lettre_chiffre', 'chiffres'].includes(req.body?.mode) ? req.body.mode : null;
  if (!ueNum || !annee || !cours || !mode) return res.status(400).json({ error: 'Cours ou numérotation non désignés.' });
  if (!unitePermise(req, res, ueNum)) return;
  const rang = c => { const m = /(\d+)$/.exec(c); const l = /^[A-Z]+/i.exec(c);
    return (l ? (l[0].toUpperCase().charCodeAt(0) - 64) * 1000 : 0) + (m ? Number(m[1]) : 0); };
  const parOrg = new Map();
  for (const g of groupesDuCours(ueNum, annee, cours, act)) {
    if (!parOrg.has(g.org)) parOrg.set(g.org, []);
    parOrg.get(g.org).push(g.code);
  }
  const renommages = [];
  for (const [org, codes] of parOrg) {
    codes.sort((a, b) => rang(a) - rang(b) || a.localeCompare(b, 'fr', { numeric: true }));
    codes.forEach((ancien, i) => {
      const nouveau = codeGroupe(i, mode, org);
      if (nouveau !== ancien) renommages.push({ org, ancien, nouveau });
    });
  }
  if (req.body?.simulation) return res.json({ simulation: true, renommages });
  const r2 = appliquerRenommages(req, ueNum, annee, cours, act, renommages);
  res.json({ ok: true, renommages, ...r2 });
});

/* LE CONTRÔLE DES PAE FACE AUX PRÉREQUIS (3.1.44) — Contrôler les dossiers →
   PAE hors règle. Même calcul que la pièce des Éditions (lib/controlePae.js),
   borné au périmètre de la personne connectée. */
r.get('/controle-pae', authRequired,
  roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat', 'coordination'), (req, res) => {
  const annee = String(req.query.annee || anneeDeTravail(req));
  res.json(controlePrerequisPae(annee, { sections: getUserSections(req.user) }));
});

r.post('/repartition-cours', authRequired, roleRequired(...PEUT_INSTRUIRE), (req, res) => {
  const ueNum = Number(req.body?.ue_num);
  const annee = String(req.body?.annee || '').trim();
  const affectations = Array.isArray(req.body?.affectations) ? req.body.affectations : [];
  if (!ueNum || !annee) return res.status(400).json({ error: 'ue_num et annee requis' });
  if (!affectations.length) return res.status(400).json({ error: 'Aucun changement.' });
  if (!unitePermise(req, res, ueNum)) return;

  const codesUE = new Set(db.prepare(
    'SELECT cours_code FROM cours WHERE ue_num = ? AND annee_scolaire = ?')
    .all(ueNum, annee).map(c => c.cours_code));
  const poser = db.prepare(`
    INSERT INTO etudiant_cours_groupe
      (etudiant_id, annee_scolaire, cours_code, activite_id, num_organisation, groupe_code, maj_le, maj_par)
    VALUES (?,?,?,?,?,?,datetime('now'),?)
    ON CONFLICT(etudiant_id, annee_scolaire, cours_code, activite_id) DO UPDATE SET
      num_organisation = excluded.num_organisation, groupe_code = excluded.groupe_code,
      maj_le = datetime('now'), maj_par = excluded.maj_par`);
  const oter = db.prepare(
    'DELETE FROM etudiant_cours_groupe WHERE etudiant_id = ? AND annee_scolaire = ? AND cours_code = ? AND activite_id = ?');
  let changements = 0;
  db.transaction(() => {
    for (const x of affectations) {
      const eid = Number(x?.etudiant_id);
      const code = String(x?.cours_code || '');
      if (!Number.isInteger(eid) || !codesUE.has(code)) continue;
      const act = Number(x?.activite_id) || 0;
      if (x.retirer) { changements += oter.run(eid, annee, code, act).changes; continue; }
      poser.run(eid, annee, code, act,
        x.num_organisation == null ? null : Number(x.num_organisation),
        x.groupe_code == null || x.groupe_code === '' ? null : String(x.groupe_code),
        req.user?.email || null);
      changements++;
    }
  })();
  res.json({ ok: true, changements });
});

// ── Rapport croisé : étudiants × UE d'une section, pour une année ────────────
r.get('/rapport', authRequired, (req, res) => {
  const { section, annee } = req.query;
  if (!section || !annee) return res.status(400).json({ error: 'section et annee requises' });

  const anneeActive = anneeDeTravail(req);

  // UE de la section (référentiel de l'année demandée, sinon année active), BA1→BA3
  let ues = db.prepare(`
    SELECT DISTINCT ue_num, ue_nom, ue_niv FROM ue
    WHERE annee_scolaire = ? AND section = ?
    ORDER BY CASE UPPER(COALESCE(ue_niv,'')) WHEN 'BA1' THEN 1 WHEN 'BA2' THEN 2 WHEN 'BA3' THEN 3 ELSE 4 END, ue_num
  `).all(annee, section);
  if (!ues.length) ues = db.prepare(`
    SELECT DISTINCT ue_num, ue_nom, ue_niv FROM ue
    WHERE annee_scolaire = ? AND section = ?
    ORDER BY CASE UPPER(COALESCE(ue_niv,'')) WHEN 'BA1' THEN 1 WHEN 'BA2' THEN 2 WHEN 'BA3' THEN 3 ELSE 4 END, ue_num
  `).all(anneeActive, section);
  const ueNums = new Set(ues.map(u => u.ue_num));

  // Étudiants avec inscriptions ou VA cette année dans ces UE
  const inscriptions = db.prepare(`
    SELECT i.etudiant_id, i.ue_num, i.resultat, i.points, e.nom, e.prenom, e.id_ecampus
    FROM etudiant_inscription i
    JOIN etudiant e ON e.id = i.etudiant_id
    WHERE i.annee_scolaire = ?
  `).all(annee).filter(i => ueNums.has(i.ue_num));
  const vas = db.prepare(`
    SELECT v.etudiant_id, v.ue_num, v.pourcentage, e.nom, e.prenom, e.id_ecampus
    FROM etudiant_valorisation v
    JOIN etudiant e ON e.id = v.etudiant_id
    WHERE v.annee_scolaire = ? AND v.type = 'complete' AND ${vaRetenue('v.')}
  `).all(annee).filter(v => ueNums.has(v.ue_num));

  // Regrouper par étudiant
  const etudiants = new Map();
  const cle = r0 => r0.etudiant_id;
  for (const i of inscriptions) {
    if (!etudiants.has(cle(i))) etudiants.set(cle(i), { nom: i.nom, prenom: i.prenom, id_ecampus: i.id_ecampus, cells: {} });
    // « R » désignait aussi bien l'ajournement que le refus, deux décisions que
    // la circulaire distingue. L'ajournement prend « Aj ».
    const marque = i.resultat === 'reussi' ? 'C'
      : i.resultat === 'ajourne' ? 'Aj'
      : i.resultat === 'refuse' ? 'R'
      : i.resultat === 'absent' ? 'A' : '•';
    etudiants.get(cle(i)).cells[i.ue_num] = { m: marque, pts: i.points };
  }
  for (const v of vas) {
    if (!etudiants.has(cle(v))) etudiants.set(cle(v), { nom: v.nom, prenom: v.prenom, id_ecampus: v.id_ecampus, cells: {} });
    etudiants.get(cle(v)).cells[v.ue_num] = { m: 'VA', pts: vaSur20(v.pourcentage) };
  }
  const lignes = [...etudiants.values()].sort((a, b) =>
    (a.nom || '').localeCompare(b.nom || '') || (a.prenom || '').localeCompare(b.prenom || ''));

  const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const cellHtml = c0 => {
    if (!c0) return '<td></td>';
    const cls = c0.m === 'C' ? 'c' : c0.m === 'R' ? 'r' : c0.m === 'A' ? 'a' : c0.m === 'VA' ? 'va' : 'i';
    const titre = c0.pts != null ? ' title="' + c0.pts + '/20"' : '';
    return '<td class="' + cls + '"' + titre + '>' + c0.m + '</td>';
  };

  const enTetes = ues.map(u =>
    '<th class="ue" title="' + esc(u.ue_nom || '') + '">' + u.ue_num + '<span class="niv">' + esc(u.ue_niv || '') + '</span></th>').join('');
  const corps = lignes.map((l, i) => '<tr>' +
    '<td class="num">' + (i + 1) + '</td>' +
    '<td class="nom">' + esc(l.nom) + ' ' + esc(l.prenom) + '<span class="mat">' + esc(l.id_ecampus || '') + '</span></td>' +
    ues.map(u => cellHtml(l.cells[u.ue_num])).join('') + '</tr>').join('');

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<title>Parcours ${esc(section)} — ${esc(annee)}</title>
<style>
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1B2B4B; margin: 24px; }
  h1 { font-size: 16px; margin: 0 0 2px; }
  .meta { color: #64748b; margin-bottom: 12px; font-size: 11px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #cbd5e1; padding: 3px 5px; text-align: center; }
  th { background: #f1f5f9; font-size: 10px; }
  th.ue .niv { display: block; font-weight: normal; color: #94a3b8; font-size: 8.5px; }
  td.num { color: #94a3b8; width: 24px; }
  td.nom { text-align: left; white-space: nowrap; font-weight: 500; }
  td.nom .mat { display: block; color: #94a3b8; font-weight: normal; font-size: 9px; }
  td.c  { background: #d1fae5; color: #065f46; font-weight: 700; }
  td.r  { background: #fee2e2; color: #991b1b; font-weight: 700; }
  td.a  { background: #fef3c7; color: #92400e; font-weight: 700; }
  td.va { background: #ede9fe; color: #5b21b6; font-weight: 700; }
  td.i  { color: #64748b; }
  .legende { margin-top: 10px; font-size: 10px; color: #64748b; }
  @media print { body { margin: 0; } }

  /* PAYSAGE : une colonne par UE, la matrice ne tient pas en portrait.
     L'orientation se déclare ICI et nulle part ailleurs — un second @page
     déclaré plus bas l'emporterait, ce qui est précisément ce qui ramenait ce
     rapport en portrait. */
  ${reglesDePage({ haut: 12, cote: 10, orientation: 'paysage' })}

  /* Pied de page commun, ancré en bas de CHAQUE page — dernière comprise.
     Un pied placé dans le flux, ou en table-footer-group, flotte au milieu
     d'une dernière page à moitié vide. */
  ${piedStyles()}
</style></head><body>
<h1>Parcours des étudiants — ${esc(section)}</h1>
<div class="meta">Année académique ${esc(annee)} · ${lignes.length} étudiant(s) · ${ues.length} UE · imprimé le ${new Date().toLocaleDateString('fr-BE')}</div>
<table>
  <thead><tr><th></th><th style="text-align:left">Étudiant</th>${enTetes}</tr></thead>
  <tbody>${corps || '<tr><td colspan="' + (ues.length + 2) + '" style="color:#94a3b8">Aucune donnée pour ces critères</td></tr>'}</tbody>
</table>
<div class="legende"><b>C</b> réussite · <b>R</b> refusé · <b>A</b> absent · <b>VA</b> valorisation des acquis · <b>•</b> inscrit (non délibéré) · survolez une case pour les points</div>

${piedBalisage(LOGO_IIP_JPEG)}
</body></html>`;

  res.json({ html, nom: 'parcours_' + section + '_' + annee + '.html' });
});

// ── Codes d'UE externes : correspondance avec les numéros de Lucie ─────────
// eCampus désigne les UE par un code court (TINFO, PDPS, 901). La liste ne
// porte pas le ue_num : on rapproche donc les intitulés, une fois pour toutes.
const sansAccent = s => String(s || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[’']/g, "'")
  .replace(/^[a-zàéèêç\s]+\s*:\s*/i, '')     // « Psychomotricité : … »
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

function ressemblance(a, b) {
  const A = sansAccent(a), B = sansAccent(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  if (A.startsWith(B) || B.startsWith(A)) return 0.92;
  const motsA = new Set(A.split(' ').filter(m => m.length > 3));
  const motsB = new Set(B.split(' ').filter(m => m.length > 3));
  if (!motsA.size || !motsB.size) return 0;
  let communs = 0;
  for (const m of motsA) if (motsB.has(m)) communs++;
  return communs / Math.max(motsA.size, motsB.size);
}

r.post('/codes-externes/resoudre', authRequired, (req, res) => {
  const { codes, section } = req.body;
  if (!Array.isArray(codes)) return res.status(400).json({ error: 'codes requis' });

  const anneeRef = anneeDeTravail(req);
  const ues = db.prepare(`
    SELECT DISTINCT ue_num, MIN(ue_nom) AS ue_nom, MIN(section) AS section FROM ue
    ${section ? 'WHERE section = ?' : ''}
    GROUP BY ue_num ORDER BY ue_num
  `).all(...(section ? [section] : []));

  const memorises = {};
  for (const m of db.prepare('SELECT code, ue_num FROM ue_code_externe').all()) {
    memorises[m.code] = m.ue_num;
  }

  const resultats = codes.map(({ code, libelle }) => {
    const cd = String(code || '').trim();
    if (memorises[cd] != null) {
      const u = ues.find(x => x.ue_num === memorises[cd]);
      return { code: cd, libelle, ue_num: memorises[cd], ue_nom: u?.ue_nom || null,
               origine: 'memorise', score: 1 };
    }
    let meilleur = null, score = 0;
    for (const u of ues) {
      const s = ressemblance(libelle, u.ue_nom);
      if (s > score) { score = s; meilleur = u; }
    }
    return score >= 0.6
      ? { code: cd, libelle, ue_num: meilleur.ue_num, ue_nom: meilleur.ue_nom,
          origine: 'suggere', score: Math.round(score * 100) / 100 }
      : { code: cd, libelle, ue_num: null, ue_nom: null, origine: null, score: 0 };
  });

  res.json({ resultats, ues });
});

r.put('/codes-externes', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { correspondances } = req.body;
  if (!Array.isArray(correspondances)) return res.status(400).json({ error: 'correspondances requises' });
  const up = db.prepare(`
    INSERT INTO ue_code_externe (code, ue_num, libelle, maj_le)
    VALUES (?,?,?, datetime('now'))
    ON CONFLICT(code) DO UPDATE SET ue_num = excluded.ue_num, maj_le = datetime('now')
  `);
  let n = 0;
  db.transaction(() => {
    for (const m of correspondances) {
      if (!m.code || m.ue_num == null) continue;
      up.run(String(m.code).trim(), Number(m.ue_num), m.libelle || null); n++;
    }
  })();
  res.json({ ok: true, enregistrees: n });
});

// ── Import d'une liste eCampus : signalétique, inscriptions et groupes ─────
r.post('/import-liste', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { annee, etudiants, inscriptions } = req.body;
  if (!annee || !Array.isArray(etudiants)) {
    return res.status(400).json({ error: 'annee et etudiants requis' });
  }

  const upEtud = db.prepare(`
    INSERT INTO etudiant (id_ecampus, nom, prenom, email_ecole, email_perso,
      date_naissance, num_national, gsm, adresse, localite, cp, titre,
      lieu_naissance)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id_ecampus) DO UPDATE SET
      nom = excluded.nom, prenom = excluded.prenom,
      email_ecole   = COALESCE(excluded.email_ecole,   etudiant.email_ecole),
      email_perso   = COALESCE(excluded.email_perso,   etudiant.email_perso),
      date_naissance= COALESCE(excluded.date_naissance,etudiant.date_naissance),
      num_national  = COALESCE(excluded.num_national,  etudiant.num_national),
      gsm           = COALESCE(excluded.gsm,           etudiant.gsm),
      adresse       = COALESCE(excluded.adresse,       etudiant.adresse),
      localite      = COALESCE(excluded.localite,      etudiant.localite),
      cp            = COALESCE(excluded.cp,            etudiant.cp),
      titre         = COALESCE(excluded.titre,         etudiant.titre),
      -- Les classeurs eCampus portent LieuNais, mais l'import ne le reprenait
      -- pas : la donnée existait dans vos fichiers et n'entrait jamais en base,
      -- d'où le lieu de naissance vide sur les attestations.
      lieu_naissance= COALESCE(excluded.lieu_naissance, etudiant.lieu_naissance)
  `);
  const trouver = db.prepare('SELECT id FROM etudiant WHERE id_ecampus = ?');
  const upInsc = db.prepare(`
    INSERT INTO etudiant_inscription (etudiant_id, annee_scolaire, ue_num, groupe, date_inscription)
    VALUES (?,?,?,?,?)
    ON CONFLICT(etudiant_id, annee_scolaire, ue_num) DO UPDATE SET
      groupe = COALESCE(excluded.groupe, etudiant_inscription.groupe)
  `);

  const dateJour = new Date().toISOString().slice(0, 10);
  let nEtud = 0, nInsc = 0, sansCode = 0;

  db.transaction(() => {
    for (const e of etudiants) {
      // UN MATRICULE ABSENT EST NULL, NON UNE CHAÎNE VIDE. La chaîne vide est
      // une valeur : deux étudiants sans matricule entraient en conflit sur
      // l'unicité, et le second ÉCRASAIT le premier — deux personnes réduites
      // à une fiche, sans un mot. SQLite, lui, autorise plusieurs NULL.
      upEtud.run(String(e.id_ecampus || '').trim() || null, e.nom || '', e.prenom || '',
        e.email_ecole || null, e.email_perso || null, e.date_naissance || null,
        e.num_national || null, e.gsm || null, e.adresse || null,
        e.localite || null, e.cp || null, e.titre || null,
        e.lieu_naissance || null);
      nEtud++;
    }
  })();

  /* LES INSCRIPTIONS PASSENT PAR LA PORTE UNIQUE, EN MODE « SIGNALER »
     (Charles, 28 septembre 2026 : choix B). eCampus est l'inscription
     administrative : ce qu'il dit entre, et ce qui contrevient aux règles du
     PAE se trace comme dérogation « à régulariser » au lieu de passer en
     silence. */
  const parEtud = new Map();
  for (const i of (inscriptions || [])) {
    if (i.ue_num == null) { sansCode++; continue; }
    const e = trouver.get(String(i.id_ecampus || '').trim());
    if (!e) { sansCode++; continue; }
    if (!parEtud.has(e.id)) parEtud.set(e.id, []);
    parEtud.get(e.id).push(i);
  }
  const qui = req.user?.email || req.user?.nom || null;
  const aRegulariser = [];
  for (const [id, lignes] of parEtud) {
    const b = ecrireProgramme({ etudId: id, annee, ajouter: lignes.map(i => Number(i.ue_num)),
      origine: 'import eCampus (liste)', par: qui, mode: 'signaler', dateInscription: dateJour });
    for (const x of b.ecarts) aRegulariser.push({ etudiant_id: id, ue_num: x.ue_num, regles: x.regles.map(r0 => r0.libelle) });
    for (const i of lignes) { upInsc.run(id, annee, Number(i.ue_num), i.groupe || null, dateJour); nInsc++; }
  }

  res.json({ ok: true, annee, etudiants: nEtud, inscriptions: nInsc, ignorees: sansCode,
    a_regulariser: aRegulariser.length, a_regulariser_liste: aRegulariser.slice(0, 200) });
});

// ── Rapport de PAE : données pour l'aperçu et pour l'export Excel ──────────
// Un seul jeu de données sert les deux sorties, pour qu'elles ne divergent pas.
r.get('/rapport-pae', authRequired, (req, res) => {
  // Paysage par défaut : une colonne par UE, la matrice ne tient pas en
  // portrait. Le portrait reste possible pour une section à peu d'unités.
  const orientation = req.query.orientation === 'portrait' ? 'portrait' : 'paysage';
  const { section, annee, niveau, ue_num, granularite = 'ue' } = req.query;
  if (!section || !annee) return res.status(400).json({ error: 'section et annee requises' });

  const anneeRef = anneeDeTravail(req) || annee;
  const niveaux = niveauxEffectifs([section], annee);

  let ues = db.prepare(`
    SELECT DISTINCT ue_num, MIN(ue_nom) AS ue_nom, MAX(COALESCE(ects,0)) AS ects,
           MAX(COALESCE(is_epreuve_integree,0)) AS is_epreuve_integree
    FROM ue
    WHERE section = ? AND annee_scolaire IN (?, ?)
    GROUP BY ue_num
  `).all(section, annee, anneeRef);

  if (ue_num) ues = ues.filter(u => u.ue_num === Number(ue_num));
  else if (niveau) ues = ues.filter(u => (niveaux[u.ue_num] || '') === String(niveau).toUpperCase());
  if (!ues.length) return res.json({ ues: [], colonnes: [], etudiants: [] });

  const rang = v => { const m = /^BA(\d+)$/.exec((v || '').toUpperCase()); return m ? Number(m[1]) : 9; };
  ues.sort((a, b) => rang(niveaux[a.ue_num]) - rang(niveaux[b.ue_num]) || a.ue_num - b.ue_num);
  for (const u of ues) u.ue_niv = niveaux[u.ue_num] || null;
  const listeUe = ues.map(u => u.ue_num).join(',');

  // Colonnes : les UE, ou les cours qui les composent
  let colonnes;
  if (granularite === 'cours') {
    const cours = db.prepare(`
      SELECT DISTINCT cours_code, MIN(cours_nom) AS cours_nom, ue_num FROM cours
      WHERE ue_num IN (${listeUe}) AND cours_code IS NOT NULL
      GROUP BY cours_code
    `).all();
    colonnes = ues.flatMap(u => {
      const siens = cours.filter(c0 => c0.ue_num === u.ue_num)
        .sort((a, b) => String(a.cours_code).localeCompare(String(b.cours_code), 'fr', { numeric: true }));
      // Une UE sans cours au référentiel garde une colonne à son numéro
      return siens.length
        ? siens.map(c0 => ({ code: String(c0.cours_code), libelle: c0.cours_nom || '', ue_num: u.ue_num, ue_niv: u.ue_niv }))
        : [{ code: String(u.ue_num), libelle: u.ue_nom || '', ue_num: u.ue_num, ue_niv: u.ue_niv }];
    });
  } else {
    colonnes = ues.map(u => ({
      code: String(u.ue_num), libelle: u.ue_nom || '', ue_num: u.ue_num, ue_niv: u.ue_niv,
    }));
  }

  const etudiants = db.prepare(`
    SELECT DISTINCT e.id, e.nom, e.prenom, e.id_ecampus, e.email_ecole
    FROM etudiant e
    JOIN etudiant_inscription i ON i.etudiant_id = e.id
    WHERE e.actif = 1 AND i.ue_num IN (${listeUe})
    ORDER BY e.nom, e.prenom
  `).all();
  if (!etudiants.length) return res.json({ ues, colonnes, etudiants: [] });

  const ids = etudiants.map(e => e.id).join(',');

  // Toutes les inscriptions, pour connaître l'année de validation
  const insc = db.prepare(`
    SELECT etudiant_id, ue_num, annee_scolaire, resultat, points FROM etudiant_inscription
    WHERE etudiant_id IN (${ids}) AND ue_num IN (${listeUe})
  `).all();
  const vas = db.prepare(`
    SELECT etudiant_id, ue_num, annee_scolaire FROM etudiant_valorisation
    WHERE etudiant_id IN (${ids}) AND ue_num IN (${listeUe}) AND type = 'complete' AND ${vaRetenue()}
  `).all();
  let resCours = [];
  try {
    resCours = db.prepare(`
      SELECT etudiant_id, cours_code, annee_scolaire, statut, faveur, note
      FROM etudiant_resultat_cours WHERE etudiant_id IN (${ids})
    `).all();
  } catch { /* table absente */ }

  const parEtud = {};
  for (const e of etudiants) parEtud[e.id] = { ue: {}, cours: {}, courant: {}, points_courant: {} };

  for (const i of insc) {
    const p = parEtud[i.etudiant_id]; if (!p) continue;
    if (i.annee_scolaire === annee) {
      p.courant[i.ue_num] = i.resultat || 'inscrit';
      // La cote reste en base, mais elle ne se COMMUNIQUE pas lorsque le seuil
      // de réussite n'est pas atteint : les documents portent « NA ». La
      // transmettre ici reviendrait à la faire figurer sur un rapport remis à
      // l'étudiant.
      if (i.points != null) {
        (p.points_courant = p.points_courant || {})[i.ue_num] =
          ['reussi', 'va'].includes(i.resultat) ? i.points : 'NA';
      }
    }
    if (i.resultat === 'reussi') {
      const prec = p.ue[i.ue_num];
      if (!prec || i.annee_scolaire < prec.annee) {
        p.ue[i.ue_num] = { annee: i.annee_scolaire, mode: 'reussi', points: i.points };
      }
    }
  }
  for (const v of vas) {
    const p = parEtud[v.etudiant_id]; if (!p) continue;
    if (!p.ue[v.ue_num]) p.ue[v.ue_num] = { annee: v.annee_scolaire, mode: 'va' };
  }
  for (const rc of resCours) {
    const p = parEtud[rc.etudiant_id]; if (!p) continue;
    const prec = p.cours[rc.cours_code];
    if (!prec || rc.annee_scolaire > prec.annee) {
      p.cours[rc.cours_code] = { annee: rc.annee_scolaire, statut: rc.statut,
                                 faveur: rc.faveur, note: rc.note };
    }
  }

  const ectsDe = Object.fromEntries(ues.map(u => [u.ue_num, Number(u.ects || 0)]));
  const epreuves = ues.filter(u => u.is_epreuve_integree).map(u => u.ue_num);

  const lignes = etudiants.map(e => {
    const p = parEtud[e.id];
    const acquises = Object.keys(p.ue).map(Number);
    const ects = acquises.reduce((s, n) => s + (ectsDe[n] || 0), 0);
    // Diplômable : tout est acquis sauf l'épreuve intégrée
    const restantes = ues.filter(u => !p.ue[u.ue_num]).map(u => u.ue_num);
    const diplomable = epreuves.length > 0
      && restantes.length > 0
      && restantes.every(n => epreuves.includes(n));
    const echecs = Object.values(p.courant)
      .filter(r0 => r0 === 'ajourne' || r0 === 'refuse').length;
    return {
      ...e, niveau: niveauEtudiant(e.id, annee).libelle || null, ...p,
      acquises: acquises.length, total_ue: ues.length,
      ects, ects_total: ues.reduce((s, u) => s + Number(u.ects || 0), 0),
      diplomable, echecs,
    };
  });

  // Taux de réussite par colonne — désigne les UE qui font barrage
  const taux = {};
  for (const col of colonnes) {
    let acquis = 0, concernes = 0;
    for (const e of lignes) {
      const a = e.ue[col.ue_num];
      const c0 = e.courant[col.ue_num];
      if (!a && !c0) continue;
      concernes++;
      if (a) acquis++;
    }
    taux[col.code] = concernes ? Math.round((acquis / concernes) * 100) : null;
  }

  res.json({
    section, annee, granularite, ues, colonnes, taux,
    etudiants: lignes,
  });
});

// ── Synthèse par année : étudiants × années scolaires ──────────────────────
// Vue de cohorte. Chaque case résume une année — UE tentées, réussies,
// refusées — plutôt que d'en détailler les UE : le détail est à un clic, dans
// la vue de délibération. C'est ce qui la garde lisible sur cinq ou six
// colonnes là où une matrice complète en compterait cinquante.
/**
 * CHERCHER UN ÉTUDIANT PENDANT QU'ON TAPE (Charles, 7 octobre 2026 : « si je
 * tape Cha, il doit proposer tous les noms ou prénoms avec CHA… le même
 * système partout »). Léger : nom, prénom, matricule, section — sans accents
 * ni casse, chaque mot tapé doit se retrouver. Le périmètre de l'utilisateur
 * s'applique comme à la liste.
 */
r.get('/chercher', authRequired, (req, res) => {
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const mots = norm(req.query.q).split(/\s+/).filter(Boolean);
  if (!mots.length) return res.json([]);
  const limite = Math.min(50, Number(req.query.limite) || 20);
  const autorisees = perimetre(req);
  const lignes = db.prepare(`SELECT id, nom, prenom, id_ecampus, matricule_helb, section_rattachement
    FROM etudiant ORDER BY upper(nom), prenom`).all();
  const out = [];
  for (const e of lignes) {
    const foin = norm(`${e.nom} ${e.prenom} ${e.id_ecampus || ''} ${e.matricule_helb || ''}`);
    if (!mots.every(m => foin.includes(m))) continue;
    let section = e.section_rattachement || null;
    if (autorisees !== null) {
      if (!section) { try { section = sectionRattachement(e.id).section || null; } catch { /* */ } }
      if (!section || !autorisees.includes(section)) continue;
    }
    out.push({ id: e.id, nom: e.nom, prenom: e.prenom, matricule: e.id_ecampus || e.matricule_helb || '', section });
    if (out.length >= limite) break;
  }
  res.json(out);
});

/**
 * LA NOTIFICATION DES DÉCISIONS DE VA, PAR ÉTUDIANT (7 octobre 2026) —
 * lib/pieceNotificationVA.js. GET compose la pièce ; POST /notifier consigne
 * la notification APRÈS l'envoi par le centre d'envoi, dossier par dossier,
 * au nom de qui a envoyé. Seuls les dossiers validés (ou irrecevables) se
 * notifient.
 */
r.get('/:id/valorisations/notification', authRequired,
  roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat'), (req, res) => {
    const etudId = Number(req.params.id);
    if (!etudiantPermis(req, res, etudId)) return;
    const annee = String(req.query.annee || anneeDeTravail(req) || '');
    const p = composerNotificationVA(etudId, annee);
    if (p.erreur) return res.status(p.code || 400).json({ error: p.erreur, manques: p.manques || [] });
    res.json({ html: p.html, nom: p.nom, titre: 'Notification des décisions de valorisation',
               ids: p.ids, en_cours: p.en_cours, etudiant_id: etudId });
  });

r.post('/:id/valorisations/notifier', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const etudId = Number(req.params.id);
  if (!etudiantPermis(req, res, etudId)) return;
  const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter(Boolean);
  if (!ids.length) return res.status(400).json({ error: 'aucun dossier' });
  const qui = req.user?.nom || req.user?.email || null;
  const faits = [];
  for (const vid of ids) {
    const v = db.prepare('SELECT * FROM etudiant_valorisation WHERE id = ? AND etudiant_id = ?').get(vid, etudId);
    if (!v || v.notifie_le) continue;
    const notifiable = (v.decision_le && v.valide_le) || (v.recevable === 0 && !v.decision_le);
    if (!notifiable) continue;
    db.prepare("UPDATE etudiant_valorisation SET notifie_le = datetime('now'), notifie_par = ? WHERE id = ?")
      .run(qui, vid);
    journaliser(vid, 'notifiee', req, String(req.body?.detail || 'notification des décisions envoyée à l’étudiant').slice(0, 300));
    rafraichirEtat(vid);
    faits.push(vid);
  }
  res.json({ ok: true, notifies: faits });
});

/**
 * RETIRER CE QUI EST DÉJÀ ACQUIS (Charles, 7 octobre 2026 : « si AQ et
 * retirer, alors prévoir le bouton pour le faire »). Le serveur ne croit pas
 * l'écran : il revérifie, paire par paire, que l'unité a été réussie ou
 * valorisée en entier une année précédente, puis retire par la porte du PAE
 * (ecrireProgramme) — une inscription qui porte un résultat, des notes ou un
 * report est conservée et nommée. Simulation d'abord.
 */
r.post('/inscrits-unites/retirer-acquises', authRequired, gesteRequis('etudiants.pae_composer'), (req, res) => {
  const annee = String(req.body?.annee || '');
  const paires = (Array.isArray(req.body?.paires) ? req.body.paires : [])
    .map(p => ({ id: Number(p?.id), ue: Number(p?.ue) })).filter(p => p.id && p.ue).slice(0, 2000);
  const simulation = req.body?.simulation !== false;
  if (!annee || !paires.length) return res.status(400).json({ error: 'annee et paires requises' });
  const reussie = db.prepare(`SELECT MIN(annee_scolaire) a FROM etudiant_inscription
    WHERE etudiant_id = ? AND ue_num = ? AND annee_scolaire < ? AND resultat = 'reussi'`);
  const vaAvant = db.prepare(`SELECT MIN(annee_scolaire) a FROM etudiant_valorisation
    WHERE etudiant_id = ? AND ue_num = ? AND annee_scolaire < ? AND type = 'complete' AND ${vaRetenue()}`);
  const nom = db.prepare('SELECT nom, prenom FROM etudiant WHERE id = ?');
  const par = req.user?.nom || req.user?.email || null;
  const retirees = [], conservees = [], refusees = [];
  const parEtudiant = new Map();
  for (const p of paires) {
    const e = nom.get(p.id);
    const qui = e ? `${String(e.nom || '').toUpperCase()} ${e.prenom || ''}`.trim() : `#${p.id}`;
    const quand = reussie.get(p.id, p.ue, annee)?.a || vaAvant.get(p.id, p.ue, annee)?.a;
    if (!quand) { refusees.push({ ...p, nom: qui, pourquoi: "l'unité n'est pas acquise" }); continue; }
    (parEtudiant.get(p.id) || parEtudiant.set(p.id, { nom: qui, ues: [] }).get(p.id)).ues.push({ ue: p.ue, quand });
  }
  for (const [id, x] of parEtudiant) {
    const perim = perimetre(req);
    if (perim) {
      let s = null; try { s = sectionRattachement(id, annee).section || null; } catch { /* */ }
      if (!s || !perim.includes(s)) { for (const u of x.ues) refusees.push({ id, ue: u.ue, nom: x.nom, pourquoi: 'hors de votre périmètre' }); continue; }
    }
    const b = ecrireProgramme({ etudId: id, annee, retirer: x.ues.map(u => u.ue), origine: 'inscrits par unité — déjà acquise',
      par, simulation, motifs: Object.fromEntries(x.ues.map(u => [u.ue, `déjà acquise (${u.quand})`])) });
    for (const u of b.retirees || []) retirees.push({ id, ue: u, nom: x.nom });
    for (const c of b.conservees || []) conservees.push({ id, ue: c.ue_num, nom: x.nom, pourquoi: c.pourquoi });
  }
  res.json({ simulation, retirees, conservees, refusees });
});

/**
 * LES INSCRITS PAR UNITÉ, À L'ÉCRAN (Charles, 7 octobre 2026 : « un tableau
 * par section, avec des filtres ; d'abord tous les inscrits de la section,
 * puis pour des UE sélectionnées ou une seule ; ensuite le détail avec des
 * colonnes cours, et des filtres sur les étudiants : nouveaux, qui
 * recommencent… »). Le serveur rend les faits, étudiant par étudiant et cours
 * par cours ; l'écran filtre et compte — un filtre ne refait pas la requête.
 *
 * Mêmes parties que la pièce « Listes par unité » : A à suivre en entier,
 * B avec dispense / VA / report, C déjà acquise (à retirer).
 * Nouveau = aucune inscription ni valorisation avant l'année (le « primo »).
 * Reprise = déjà inscrit à CETTE unité une année précédente, sans l'avoir
 * réussie. Une unité hors cursus ne garde que les étudiants rattachés à la
 * section.
 */
r.get('/inscrits-unites', authRequired, (req, res) => {
  const annee = req.query.annee || anneeDeTravail(req);
  const section = req.query.section;
  if (!section) return res.status(400).json({ error: 'section requise' });
  if (!sectionAutoriseeReq(req, section)) return res.status(403).json({ error: 'Section hors de votre périmètre.' });
  res.json(donneesInscritsUnites(annee, section));
});

export function donneesInscritsUnites(annee, section) {
  const ues = db.prepare(`SELECT ue_num, MIN(ue_nom) AS ue_nom, MAX(COALESCE(hors_cursus, 0)) AS hors_cursus,
        MIN(ue_niveau) AS niveau, MIN(ue_niv) AS bloc, MAX(COALESCE(is_epreuve_integree, 0)) AS ei
      FROM ue WHERE annee_scolaire = ? AND (section = ? OR ue_num IN
        (SELECT ue_num FROM ue_section WHERE section_code = ? AND annee_scolaire = ?))
      GROUP BY ue_num ORDER BY ue_num`).all(annee, section, section, annee);
  const coursDe = db.prepare(`SELECT cours_code AS code, cours_nom AS nom FROM cours
      WHERE ue_num = ? AND annee_scolaire = ? AND (section = ? OR section IS NULL OR ? = 1)
      GROUP BY cours_code ORDER BY cours_num, cours_code`);
  const inscrits = db.prepare(`SELECT e.id, MAX(COALESCE(i.dispense_complete, 0)) AS dispense_complete
      FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
     WHERE i.annee_scolaire = ? AND i.ue_num = ? GROUP BY e.id`);
  // UNE VA ACCORDÉE N'A PAS TOUJOURS D'INSCRIPTION (69 en 2026-2027) : elle
  // entre dans la grille, marquée « sans inscription ».
  const vaSeules = db.prepare(`SELECT DISTINCT v.etudiant_id AS id FROM etudiant_valorisation v
      WHERE v.annee_scolaire = ? AND v.ue_num = ? AND v.decision_le IS NOT NULL AND COALESCE(v.decision, 'accordee') <> 'refusee'
        AND NOT EXISTS (SELECT 1 FROM etudiant_inscription i WHERE i.etudiant_id = v.etudiant_id
          AND i.ue_num = v.ue_num AND i.annee_scolaire = v.annee_scolaire)`);
  const sectionsDeLUE = db.prepare(`SELECT COUNT(DISTINCT s) n FROM (
      SELECT section AS s FROM ue WHERE annee_scolaire = ? AND ue_num = ? AND section IS NOT NULL
      UNION SELECT section_code FROM ue_section WHERE annee_scolaire = ? AND ue_num = ?)`);
  const fiche = db.prepare(`SELECT id, nom, prenom, COALESCE(id_ecampus, matricule_helb) AS matricule,
      COALESCE(sejour_limite_etudes, 0) AS sle FROM etudiant WHERE id = ?`);
  const vas = db.prepare(`SELECT etudiant_id, annee_scolaire, type, cible, cible_detail, porte, decision_le,
        decision_ce_date, date_demande
      FROM etudiant_valorisation WHERE ue_num = ? AND COALESCE(decision, 'accordee') <> 'refusee'`);
  const reports = db.prepare(`SELECT etudiant_id, cours_code, note, annee_origine, nature FROM etudiant_report_note
      WHERE annee_scolaire = ? AND ue_num = ? AND COALESCE(statut, 'accorde') = 'accorde' AND COALESCE(cible, 'cours') = 'cours'`);
  const reussies = db.prepare(`SELECT etudiant_id, MIN(annee_scolaire) AS annee FROM etudiant_inscription
      WHERE ue_num = ? AND annee_scolaire < ? AND resultat = 'reussi' GROUP BY etudiant_id`);
  const anterieures = db.prepare('SELECT DISTINCT etudiant_id FROM etudiant_inscription WHERE ue_num = ? AND annee_scolaire < ?');
  const anciens = new Set([
    ...db.prepare('SELECT DISTINCT etudiant_id FROM etudiant_inscription WHERE annee_scolaire < ?').all(annee).map(x => x.etudiant_id),
    ...db.prepare('SELECT DISTINCT etudiant_id FROM etudiant_valorisation WHERE annee_scolaire < ?').all(annee).map(x => x.etudiant_id),
  ]);
  const blocs = new Map();
  const blocDe = id => {
    if (!blocs.has(id)) { let b = null; try { b = niveauEtudiant(id, annee).niveau || null; } catch { /* */ } blocs.set(id, b); }
    return blocs.get(id);
  };
  const rattache = new Map();
  const estDeLaSection = id => {
    if (!rattache.has(id)) { let s = null; try { s = sectionRattachement(id, annee).section || null; } catch { /* */ } rattache.set(id, s); }
    return rattache.get(id) === section;
  };
  const grouper = l => { const m = new Map(); for (const x of l) (m.get(x.etudiant_id) || m.set(x.etudiant_id, []).get(x.etudiant_id)).push(x); return m; };
  const jour = d => (d ? String(d).slice(0, 10) : null);

  const etudiants = new Map();
  const unites = [];
  for (const u of ues) {
    let l = inscrits.all(annee, u.ue_num).map(x => ({ ...x, inscrit: true }));
    l.push(...vaSeules.all(annee, u.ue_num).map(x => ({ id: x.id, dispense_complete: 0, inscrit: false })));
    /* UNE UNITÉ PARTAGÉE GARDE LES SIENS (Charles, 7 octobre 2026 : « tu as mis
       les orthoptistes avec les optos » — 187 inscrits en UE 282). Le tronc
       commun Optométrie/Orthoptie est un regroupement d'organisation : chaque
       étudiant reste dans SA section. Une unité hors cursus, ou rattachée à
       plus d'une section, ne retient que les étudiants de la section affichée. */
    const partagee = u.hors_cursus || sectionsDeLUE.get(annee, u.ue_num, annee, u.ue_num).n > 1;
    if (partagee) l = l.filter(e => estDeLaSection(e.id));
    if (!l.length) continue;
    const cours = coursDe.all(u.ue_num, annee, section, partagee ? 1 : 0);
    const codes = cours.map(c => c.code);
    const vaPar = grouper(vas.all(u.ue_num));
    const repPar = grouper(reports.all(annee, u.ue_num));
    const reussPar = new Map(reussies.all(u.ue_num, annee).map(x => [x.etudiant_id, x.annee]));
    const avant = new Set(anterieures.all(u.ue_num, annee).map(x => x.etudiant_id));
    const lignes = [];
    for (const e of l) {
      if (!etudiants.has(e.id)) {
        const f = fiche.get(e.id) || {};
        etudiants.set(e.id, { id: e.id, nom: `${String(f.nom || '').toUpperCase()} ${f.prenom || ''}`.trim(),
          nom_famille: String(f.nom || '').toUpperCase(), prenom: f.prenom || '',
          matricule: f.matricule || '', sle: !!Number(f.sle), nouveau: !anciens.has(e.id), bloc: blocDe(e.id) });
      }
      const decidees = (vaPar.get(e.id) || []).filter(v => v.decision_le);
      const totaleAvant = decidees.find(v => v.type === 'complete' && v.annee_scolaire < annee);
      /* `code` dit l'état de l'unité en un mot, `cellules` celui de chaque
         cours : I (à suivre), VA / VAE (totale), VAP (partielle), RP (report
         de note), D (dispense complète), AQ (déjà acquise). */
      const ligne = { id: e.id, inscrit: e.inscrit, reprise: avant.has(e.id) && !reussPar.has(e.id),
        cours: {}, cellules: {}, detail: [], tags: [] };
      if (reussPar.has(e.id) || totaleAvant) {
        ligne.partie = 'C'; ligne.code = 'AQ';
        ligne.date = reussPar.has(e.id) ? reussPar.get(e.id) : totaleAvant.annee_scolaire;
        ligne.detail.push(reussPar.has(e.id) ? `réussie en ${reussPar.get(e.id)}` : `${(totaleAvant.porte || 'va').toUpperCase()} totale en ${totaleAvant.annee_scolaire}`);
        for (const c of codes) { ligne.cours[c] = 'acquis'; ligne.cellules[c] = { k: 'AQ' }; }
        lignes.push(ligne); continue;
      }
      for (const c of codes) { ligne.cours[c] = 'suit'; ligne.cellules[c] = { k: 'I' }; }
      let code = 'I', date = null;
      if (e.dispense_complete) {
        ligne.detail.push('dispense complète'); code = 'D';
        for (const c of codes) { ligne.cours[c] = 'D'; ligne.cellules[c] = { k: 'D' }; }
      }
      for (const v of decidees.filter(v => v.annee_scolaire === annee)) {
        const porte = String(v.porte || 'va').toUpperCase() === 'VAE' ? 'VAE' : 'VA';
        const d = jour(v.decision_ce_date || v.decision_le);
        if (v.type === 'complete') {
          ligne.detail.push(`${porte} totale`); code = porte; date = d;
          for (const c of codes) { ligne.cours[c] = 'VA'; ligne.cellules[c] = { k: porte, date: d }; }
        } else if (v.type === 'partielle') {
          const cibles = String(v.cible_detail || '').split(',').map(x => x.trim()).filter(Boolean);
          if (code === 'I' || code === 'RP') { code = 'VAP'; date = d; }
          ligne.tags.push(porte === 'VAE' ? 'VAE' : 'VA');
          if (v.cible === 'cours') {
            for (const c of cibles) if (c in ligne.cours) { ligne.cours[c] = 'VA'; ligne.cellules[c] = { k: porte, date: d }; }
            ligne.detail.push(`${porte} partielle (cours)`);
          } else ligne.detail.push(`${porte} partielle — acquis ${cibles.join(', ') || '(à préciser)'}`);
        }
      }
      for (const x of repPar.get(e.id) || []) {
        if (x.cours_code in ligne.cours && ligne.cours[x.cours_code] === 'suit') {
          ligne.cours[x.cours_code] = 'R';
          const nat = String(x.nature || '').toUpperCase();
          ligne.cellules[x.cours_code] = { k: nat === 'VA' || nat === 'VAE' ? nat : 'RP', note: x.note, annee: x.annee_origine || null };
        }
        ligne.detail.push(`report ${x.cours_code}`);
        if (code === 'I') { code = 'RP'; date = x.annee_origine || null; }
        else if (code === 'VAP' && !ligne.tags.includes('RP')) ligne.tags.push('RP');
      }
      const enCours = (vaPar.get(e.id) || []).find(v => !v.decision_le && v.annee_scolaire === annee);
      if (enCours) { ligne.va_en_cours = true; ligne.tags.push('VA ?'); }
      ligne.partie = ligne.detail.length ? 'B' : 'A';
      ligne.code = code; ligne.date = date;
      if (!e.inscrit) ligne.detail.push('sans inscription cette année');
      if (enCours) ligne.detail.push('demande de VA en cours');
      lignes.push(ligne);
    }
    lignes.sort((a, b) => etudiants.get(a.id).nom.localeCompare(etudiants.get(b.id).nom, 'fr'));
    unites.push({ ue_num: u.ue_num, ue_nom: u.ue_nom, niveau: u.niveau, bloc: u.bloc || null, ei: !!u.ei, hors_cursus: !!u.hors_cursus, cours, lignes });
  }
  return { annee, section, unites, etudiants: Object.fromEntries(etudiants) };
}

r.get('/synthese', authRequired, (req, res) => {
  const { section } = req.query;
  if (!section) return res.status(400).json({ error: 'section requise' });

  const anneeRef = anneeDeTravail(req);
  const ues = db.prepare(`
    SELECT DISTINCT ue_num FROM ue WHERE section = ?
  `).all(section).map(u => u.ue_num);
  if (!ues.length) return res.json({ annees: [], etudiants: [] });
  const listeUe = ues.join(',');

  const etudiants = db.prepare(`
    SELECT DISTINCT e.id, e.nom, e.prenom, e.id_ecampus
    FROM etudiant e
    JOIN etudiant_inscription i ON i.etudiant_id = e.id
    WHERE e.actif = 1 AND i.ue_num IN (${listeUe})
    ORDER BY e.nom, e.prenom
  `).all();
  if (!etudiants.length) return res.json({ annees: [], etudiants: [] });

  const ids = etudiants.map(e => e.id).join(',');
  const lignes = db.prepare(`
    SELECT etudiant_id, annee_scolaire, resultat, points
    FROM etudiant_inscription
    WHERE etudiant_id IN (${ids}) AND ue_num IN (${listeUe})
  `).all();
  let vas = [];
  try {
    vas = db.prepare(`
      SELECT etudiant_id, annee_scolaire FROM etudiant_valorisation
      WHERE etudiant_id IN (${ids}) AND ue_num IN (${listeUe}) AND type = 'complete' AND ${vaRetenue()}
    `).all();
  } catch { /* table absente */ }

  const annees = [...new Set([...lignes.map(l => l.annee_scolaire), anneeRef].filter(Boolean))].sort();

  const par = {};
  for (const e of etudiants) par[e.id] = {};
  const case0 = () => ({ tentees: 0, reussies: 0, refusees: 0, absentes: 0, en_cours: 0, va: 0, somme: 0, notees: 0 });

  for (const l of lignes) {
    const p = par[l.etudiant_id]; if (!p) continue;
    const k = (p[l.annee_scolaire] = p[l.annee_scolaire] || case0());
    k.tentees++;
    if (l.resultat === 'reussi') k.reussies++;
    else if (l.resultat === 'ajourne') k.refusees++;
    else if (l.resultat === 'absent') k.absentes++;
    else k.en_cours++;
    if (l.points != null) { k.somme += Number(l.points); k.notees++; }
  }
  for (const v of vas) {
    const p = par[v.etudiant_id]; if (!p) continue;
    const k = (p[v.annee_scolaire] = p[v.annee_scolaire] || case0());
    k.va++; k.tentees++; k.reussies++;
  }

  res.json({
    section, annee_active: anneeRef, annees,
    etudiants: etudiants.map(e => {
      const cases = par[e.id];
      for (const k of Object.values(cases)) {
        k.moyenne = k.notees ? Math.round((k.somme / k.notees) * 10) / 10 : null;
        delete k.somme; delete k.notees;
      }
      const total = Object.values(cases).reduce((s, k) => s + k.tentees, 0);
      const acquis = Object.values(cases).reduce((s, k) => s + k.reussies, 0);
      return { ...e, cases, total, acquis };
    }),
  });
});

// ── Rapport de PAE au format Excel ─────────────────────────────────────────
// Construit côté serveur avec ExcelJS, seul à savoir mettre en forme les
// cellules. La disposition reste celle du classeur de la coordination —
// intitulés en ligne 1, codes en ligne 2 — pour rester réimportable.
// ── Export complet d'une section, réimportable ─────────────────────────────
// Deux feuilles. « Étudiants » porte le signalétique ; « Résultats » porte une
// LIGNE PAR RÉSULTAT — étudiant, année, unité, session, décision, note.
//
// Le format est pensé pour le RETOUR : les colonnes portent les noms que
// l'importateur sur mesure reconnaît, et le numéro national sert de clé.
r.get('/export-section', authRequired, async (req, res) => {
  const { section, annee } = req.query;
  if (!section) return res.status(400).json({ error: 'section requise' });

  const perim = getUserSections(req.user);
  if (perim && !perim.includes(section)) {
    return res.status(403).json({ error: 'section hors de votre périmètre' });
  }

  const ues = db.prepare(
    'SELECT DISTINCT ue_num FROM ue WHERE section = ?').all(section).map(u => u.ue_num);
  if (!ues.length) return res.status(404).json({ error: 'aucune unité pour cette section' });
  const ph = ues.map(() => '?').join(',');

  const clauseAnnee = annee ? ' AND i.annee_scolaire = ?' : '';
  const params = [...ues, ...(annee ? [annee] : [])];

  const lignes = db.prepare(`
    SELECT e.id, e.id_ecampus, e.num_national, e.nom, e.prenom, e.titre,
           e.date_naissance, e.lieu_naissance, e.nationalite,
           e.adresse, e.cp, e.localite, e.gsm, e.email_ecole, e.email_perso,
           i.annee_scolaire, i.ue_num, i.resultat, i.resultat_s1, i.resultat_s2,
           i.points, i.mention, i.groupe,
           (SELECT ue_nom FROM ue u WHERE u.ue_num = i.ue_num AND u.ue_nom IS NOT NULL
             ORDER BY u.annee_scolaire DESC LIMIT 1) AS ue_nom
    FROM etudiant_inscription i
    JOIN etudiant e ON e.id = i.etudiant_id
    WHERE i.ue_num IN (${ph})${clauseAnnee}
    ORDER BY e.nom, e.prenom, i.annee_scolaire DESC, i.ue_num
  `).all(...params);

  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Lucie — Institut Ilya Prigogine';
  wb.created = new Date();

  // ── Feuille 1 : les étudiants, une ligne chacun ──────────────────────────
  const fe = wb.addWorksheet('Étudiants');
  fe.columns = [
    { header: 'num_national', key: 'num_national', width: 18 },
    { header: 'id_ecampus', key: 'id_ecampus', width: 12 },
    { header: 'nom', key: 'nom', width: 22 },
    { header: 'prenom', key: 'prenom', width: 18 },
    { header: 'titre', key: 'titre', width: 10 },
    { header: 'date_naissance', key: 'date_naissance', width: 14 },
    { header: 'lieu_naissance', key: 'lieu_naissance', width: 18 },
    { header: 'nationalite', key: 'nationalite', width: 14 },
    { header: 'adresse', key: 'adresse', width: 30 },
    { header: 'cp', key: 'cp', width: 8 },
    { header: 'localite', key: 'localite', width: 18 },
    { header: 'gsm', key: 'gsm', width: 15 },
    { header: 'email_ecole', key: 'email_ecole', width: 30 },
    { header: 'email_perso', key: 'email_perso', width: 30 },
  ];
  const vus = new Set();
  for (const l of lignes) {
    if (vus.has(l.id)) continue;
    vus.add(l.id);
    fe.addRow(l);
  }

  // ── Feuille 2 : un résultat par ligne ────────────────────────────────────
  const fr = wb.addWorksheet('Résultats');
  fr.columns = [
    { header: 'num_national', key: 'num_national', width: 18 },
    { header: 'nom', key: 'nom', width: 22 },
    { header: 'prenom', key: 'prenom', width: 18 },
    { header: 'annee_scolaire', key: 'annee_scolaire', width: 14 },
    { header: 'ue_num', key: 'ue_num', width: 9 },
    { header: 'ue_nom', key: 'ue_nom', width: 40 },
    { header: 'session', key: 'session', width: 10 },
    { header: 'decision', key: 'decision', width: 11 },
    { header: 'points', key: 'points', width: 8 },
    { header: 'resultat_s1', key: 'resultat_s1', width: 12 },
    { header: 'resultat_s2', key: 'resultat_s2', width: 12 },
    { header: 'mention', key: 'mention', width: 14 },
    { header: 'groupe', key: 'groupe', width: 8 },
  ];

  // La lettre de délibération : C capitalisé, Aj ajourné, R refusé, A absent.
  const lettre = r0 => r0 === 'reussi' ? 'C' : r0 === 'ajourne' ? 'Aj'
    : r0 === 'refuse' ? 'R' : r0 === 'absent' ? 'A' : '';

  for (const l of lignes) {
    // La session d'où vient la décision. Ni l'une ni l'autre : « finale » —
    // c'est le cas de tout ce qui précède la distinction des sessions.
    const session = l.resultat_s2 ? 'S2' : l.resultat_s1 ? 'S1' : 'finale';
    fr.addRow({
      ...l,
      session,
      decision: lettre(l.resultat),
      resultat_s1: lettre(l.resultat_s1),
      resultat_s2: lettre(l.resultat_s2),
    });
  }

  for (const f0 of [fe, fr]) {
    f0.getRow(1).font = { bold: true };
    f0.getRow(1).fill = { type: 'pattern', pattern: 'solid',
                          fgColor: { argb: 'FF1B2B4B' } };
    f0.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    f0.views = [{ state: 'frozen', ySplit: 1 }];
    f0.autoFilter = { from: { row: 1, column: 1 },
                      to: { row: 1, column: f0.columns.length } };
  }

  // ── Feuille 3 : ce que les colonnes veulent dire ─────────────────────────
  const fl = wb.addWorksheet('Légende');
  fl.columns = [{ header: 'Colonne', key: 'c', width: 18 },
                { header: 'Signification', key: 's', width: 80 }];
  for (const [k, v] of [
    ['num_national', "Clé de rapprochement à la réimportation. Le matricule change chaque rentrée, pas lui."],
    ['session', "S1, S2, ou « finale » lorsque la décision ne distingue pas les sessions."],
    ['decision', "C capitalisé · Aj ajourné · R refusé · A absent. C'est la décision qui fait foi."],
    ['resultat_s1', "Résultat de la première session, s'il a été encodé."],
    ['resultat_s2', "Résultat de la seconde session. Il prime sur la première."],
    ['points', 'Note sur 20.'],
  ]) fl.addRow({ c: k, s: v });
  fl.getRow(1).font = { bold: true };

  const nom = `Export_${String(section).replace(/[^A-Za-z0-9]+/g, '_')}`
    + (annee ? `_${annee}` : '') + '.xlsx';
  res.setHeader('Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nom}"`);
  await wb.xlsx.write(res);
  res.end();
});

r.post('/rapport-pae/excel', authRequired, async (req, res) => {
  const { section, annee, colonnes, etudiants, taux, options = {} } = req.body;
  if (!section || !annee || !Array.isArray(colonnes) || !Array.isArray(etudiants)) {
    return res.status(400).json({ error: 'données du rapport requises' });
  }

  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Lucie — Institut Ilya Prigogine';
  wb.created = new Date();

  const MARINE = 'FF1B2B4B', TURQ = 'FF00AACC';
  const NIV = { BA1: 'FFF97316', BA2: 'FF60A5FA', BA3: 'FF1E3A8A' };
  const teinte = {
    ok:   { fill: 'FFD1FAE5', police: 'FF065F46' },
    ko:   { fill: 'FFFEE2E2', police: 'FF991B1B' },
    va:   { fill: 'FFEDE9FE', police: 'FF5B21B6' },
    ins:  { fill: 'FFE0F2FE', police: 'FF075985' },
    abs:  { fill: 'FFF1F5F9', police: 'FF64748B' },
  };
  const classe = v => {
    if (!v) return null;
    const b = String(v).replace('*', '');
    // Une note se juge au seuil de 10/20 — sans quoi un 7 s'afficherait en vert.
    if (/^\d+([.,]\d+)?$/.test(b)) return Number(b.replace(',', '.')) >= 10 ? 'ok' : 'ko';
    if (/^\d\d-\d\d$/.test(b) || b === 'C' || b === '✓') return 'ok';
    if (b.startsWith('VA')) return 'va';
    if (b === 'R') return 'ko';
    if (b === 'A') return 'abs';
    if (b === 'NA') return 'ko';   // cote non communiquée : seuil non atteint
    if (b === 'x') return 'ins';
    return null;
  };

  const ws = wb.addWorksheet('TOUS', {
    views: [{ state: 'frozen', xSplit: 5, ySplit: 2 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const tetesFixes = ['Id_Etud', 'Email Perso', 'EmailEcole', 'NomEtud', 'PréEtud',
                      '', 'inscription', 'Classe', 'Niveau'];
  const synth = options.synthese ? ['Acquis', 'ECTS', 'Situation'] : [];

  // Ligne 1 — intitulés ; ligne 2 — codes, dans la forme attendue à la relecture
  ws.addRow([...tetesFixes.map(() => ''), ...colonnes.map(c0 => c0.libelle || ''), ...synth.map(() => '')]);
  ws.addRow([...tetesFixes, ...colonnes.map(c0 => c0.code),
             ...synth, "Commentaire(s) du Conseil des Etudes"]);

  const l1 = ws.getRow(1), l2 = ws.getRow(2);
  l1.height = 46; l2.height = 20;
  l1.eachCell({ includeEmpty: true }, (cell, i) => {
    if (i <= tetesFixes.length) return;
    cell.alignment = { vertical: 'bottom', horizontal: 'left', wrapText: true, textRotation: 60 };
    cell.font = { size: 7.5, color: { argb: 'FF64748B' } };
  });
  l2.eachCell({ includeEmpty: true }, (cell, i) => {
    const col = colonnes[i - tetesFixes.length - 1];
    const couleur = col ? (NIV[(col.ue_niv || '').toUpperCase()] || 'FF94A3B8') : MARINE;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: couleur } };
    cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { bottom: { style: 'medium', color: { argb: MARINE } } };
  });

  // Étudiants
  for (const e of etudiants) {
    const cells = colonnes.map(c0 => e.valeurs[c0.code] ?? '');
    const s = options.synthese
      ? [`${e.acquises}/${e.total_ue}`, e.ects_total ? `${e.ects}/${e.ects_total}` : e.ects,
         e.diplomable ? 'diplômable' : (e.echecs ? `${e.echecs} échec(s)` : '')]
      : [];
    const r0 = ws.addRow([
      e.id_ecampus || '', '', e.email_ecole || '', e.nom || '', e.prenom || '',
      '', '', '', e.niveau || '', ...cells, ...s, '',
    ]);
    r0.height = 17;
    r0.eachCell({ includeEmpty: true }, (cell, i) => {
      cell.border = { top: { style: 'hair', color: { argb: 'FFE2E8F0' } },
                      bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } } };
      if (i <= 5) { cell.font = { size: 9.5 }; return; }
      cell.alignment = { horizontal: 'center' };
      cell.font = { size: 9 };
      const idx = i - tetesFixes.length - 1;
      if (idx >= 0 && idx < colonnes.length) {
        const t = teinte[classe(cell.value)];
        if (t) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: t.fill } };
          cell.font = { size: 9, bold: true, color: { argb: t.police } };
        }
        if (String(cell.value || '').includes('*')) cell.font = { ...cell.font, italic: true };
      } else if (idx >= colonnes.length) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }
    });
  }

  // Taux de réussite par UE
  if (options.tauxUE && taux) {
    const r0 = ws.addRow(['', '', '', 'Taux de réussite', '', '', '', '', '',
      ...colonnes.map(c0 => (taux[c0.code] == null ? '' : taux[c0.code] / 100)), ...synth.map(() => '')]);
    r0.height = 19;
    r0.eachCell({ includeEmpty: true }, (cell, i) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      cell.font = { bold: true, size: 9, color: { argb: 'FF475569' } };
      cell.border = { top: { style: 'medium', color: { argb: MARINE } } };
      const idx = i - tetesFixes.length - 1;
      if (idx >= 0 && idx < colonnes.length && typeof cell.value === 'number') {
        cell.numFmt = '0 %';
        cell.alignment = { horizontal: 'center' };
        cell.font = { bold: true, size: 9,
          color: { argb: cell.value >= 0.75 ? 'FF047857' : cell.value >= 0.5 ? 'FF92400E' : 'FFB91C1C' } };
      }
    });
  }

  // Largeurs posées colonne par colonne : affecter ws.columns après avoir
  // ajouté des lignes désaligne le tableau dans ExcelJS.
  const largeurs = [11, 20, 28, 20, 15, 5, 10, 8, 11,
    ...colonnes.map(() => 7), ...synth.map(() => 12), 46];
  largeurs.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.autoFilter = {
    from: { row: 2, column: 1 },
    to: { row: ws.rowCount, column: tetesFixes.length + colonnes.length + synth.length },
  };

  // Second onglet : ce que le tableau montre, et la légende
  const info = wb.addWorksheet('Informations');
  info.getColumn(1).width = 26;
  info.getColumn(2).width = 74;
  const lignes = [
    ['Section', section],
    ['Année', annee],
    ['Contenu des cases', options.libelleContenu || ''],
    ['Colonnes', options.granularite === 'cours' ? 'Une par cours' : 'Une par UE'],
    ['Étudiants retenus', options.libelleFiltre || 'Tous'],
    ['Édité le', new Date().toLocaleString('fr-BE')],
    ['', ''],
    ['Légende', 'C ou une année : acquise · VA : valorisation · R : refusé · A : absent · x : inscrit, non délibéré'],
    ['', 'Une valeur en italique suivie d\u2019un astérisque est reprise de l\u2019unité d\u2019enseignement, faute de résultat encodé par cours.'],
    ['', 'Les couleurs d\u2019en-tête suivent l\u2019année d\u2019études : BA1 orange, BA2 bleu clair, BA3 bleu marine.'],
    ['', ''],
    ['Réimport', 'Ce classeur garde la forme attendue par « Importer le classeur PAE » : il peut être complété à la main puis relu par Lucie.'],
  ];
  for (const [a, b] of lignes) {
    const r0 = info.addRow([a, b]);
    r0.getCell(1).font = { bold: true, size: 10, color: { argb: MARINE } };
    r0.getCell(2).font = { size: 10 };
    r0.getCell(2).alignment = { wrapText: true, vertical: 'top' };
  }
  info.getRow(1).getCell(1).font = { bold: true, size: 12, color: { argb: MARINE } };

  const buffer = await wb.xlsx.writeBuffer();
  const nom = `PAE_${section}_${annee}.xlsx`.replace(/[^\w.\-]/g, '_');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nom}"`);
  res.send(Buffer.from(buffer));
});

// ── Matrice d'encodage rapide : étudiants × UE, pour une année ──────────────
// L'année est portée par l'écran, pas par la cellule : on encode une année
// entière d'un coup. Les acquis des AUTRES années sont tout de même renvoyés,
// pour que l'on voie d'un coup d'œil ce qui est déjà fait et quand.
// ── Sessions et cohérence des décisions ────────────────────────────────────
// La circulaire distingue deux sessions. La règle, telle que l'IIP l'applique :
//
//   session 1 réussie ................. réussi
//   session 1 échouée, présenté ....... ajourné, l'étudiant va en session 2
//   session 1 non présenté ............ REFUS, définitif
//   session 2 réussie ................. réussi
//   session 2 échouée ou non présenté . REFUS
//
// resultat_s1 et resultat_s2 gardent le détail ; « resultat » reste la décision
// QUI FAIT FOI — celle de session 2 si elle existe, celle de session 1 sinon.
// Les documents la lisent sans rien changer.
(function migrerSessions() {
  try {
    const cols = db.prepare('PRAGMA table_info(etudiant_inscription)').all().map(c => c.name);
    if (!cols.includes('resultat_s1')) {
      db.exec('ALTER TABLE etudiant_inscription ADD COLUMN resultat_s1 TEXT');
      console.log('[migration] etudiant_inscription.resultat_s1 ajoutée');
    }
    if (!cols.includes('resultat_s2')) {
      db.exec('ALTER TABLE etudiant_inscription ADD COLUMN resultat_s2 TEXT');
    }
    // Les NOTES de chaque session, à côté de leur décision. « points » reste
    // la note qui fait foi, comme « resultat » reste la décision qui fait foi.
    if (!cols.includes('points_s1')) {
      db.exec('ALTER TABLE etudiant_inscription ADD COLUMN points_s1 REAL');
      console.log('[migration] points_s1 / points_s2 ajoutées');
    }
    if (!cols.includes('points_s2')) {
      db.exec('ALTER TABLE etudiant_inscription ADD COLUMN points_s2 REAL');
    }
  } catch (e) { console.error('[migration] sessions :', e.message); }
})();

// L'ORGANISATION DE L'ÉTUDIANT DANS L'UNITÉ (23 septembre 2026). Une unité
// comme la 333 AESI se donne en plusieurs organisations, et LA DÉLIBÉRATION
// SE TIENT PAR ORGANISATION : chaque inscrit doit donc porter la sienne.
// Rien ne se déduit — la répartition est un geste de la coordination.
/* LE STATUT DE SORTIE — POSÉ, NON DÉDUIT (Jérôme, 1er octobre 2026).
 *
 * « Diplômé » se déduisait seul de l'épreuve intégrée réussie ; rien ne
 * permettait de dire qu'un étudiant était parti, ni de ranger à la cave ceux
 * qu'on ne suit plus. Trois statuts, posés par la coordination, le
 * secrétariat ou la direction — et tous RÉVERSIBLES :
 *   · diplome  — diplômé, quand l'épreuve intégrée n'est pas (ou pas encore)
 *                encodée dans Lucie : années reconstruites, diplômes anciens ;
 *   · sorti    — a quitté le cursus (abandon, réorientation, exclusion) ;
 *   · archive  — à la cave : hors des listes de travail, rien n'est effacé.
 * Le dossier reste entier et actif : ses attestations se rééditent, ses
 * résultats comptent dans l'historique. Seule la liste de travail change. */
(function migrerStatutSortie() {
  try {
    const cols = db.prepare('PRAGMA table_info(etudiant)').all().map(c => c.name);
    for (const [c, d] of [['sortie_statut', 'TEXT'], ['sortie_le', 'TEXT'],
                          ['sortie_par', 'TEXT'], ['sortie_motif', 'TEXT']]) {
      if (!cols.includes(c)) db.exec(`ALTER TABLE etudiant ADD COLUMN ${c} ${d}`);
    }
  } catch (e) { console.error('[migration] statut de sortie :', e.message); }
})();

(function migrerOrganisation() {
  try {
    const cols = db.prepare('PRAGMA table_info(etudiant_inscription)').all().map(c => c.name);
    if (!cols.includes('num_organisation')) {
      db.exec('ALTER TABLE etudiant_inscription ADD COLUMN num_organisation INTEGER');
      console.log('[migration] etudiant_inscription.num_organisation ajoutée');
    }
  } catch (e) { console.error('[migration] organisation :', e.message); }
})();

/* LE RATTACHEMENT S'ÉCRIT EN CODE DE SECTION (25 septembre 2026). Les
 * imports ont laissé des LIBELLÉS (« Optométrie », « AeSI ») là où tout le
 * reste de Lucie compare des CODES (OPTO, AESI) : matrices, listes et
 * contrôles de périmètre rataient ces étudiants en silence. À chaque
 * démarrage, toute valeur qui correspond au code ou au libellé d'une section
 * — accents, casse et ponctuation ignorés — est ramenée AU CODE. Idempotent :
 * un import qui repose un libellé est repris au démarrage suivant. */
(function canonicaliserRattachements() {
  try {
    const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toUpperCase().replace(/[^A-Z0-9]+/g, '');
    const parNorm = new Map();
    for (const s of db.prepare('SELECT code, libelle FROM section').all()) {
      parNorm.set(norm(s.code), s.code);
      if (s.libelle) parNorm.set(norm(s.libelle), s.code);
    }
    const valeurs = db.prepare(`SELECT DISTINCT section_rattachement AS v FROM etudiant
      WHERE section_rattachement IS NOT NULL AND section_rattachement <> ''`).all();
    let n = 0;
    for (const { v } of valeurs) {
      const code = parNorm.get(norm(v));
      if (code && code !== v) {
        n += db.prepare('UPDATE etudiant SET section_rattachement = ? WHERE section_rattachement = ?')
          .run(code, v).changes;
      }
    }
    if (n) console.log(`[migration] rattachements canonicalisés vers le code de section : ${n} étudiant(s)`);
  } catch (e) { console.error('[migration] rattachements :', e.message); }
})();

// LE LIEN ATTRIBUTIONS × PAE (24 septembre 2026). Qui a cours où : pour
// chaque cours d'une unité, l'étudiant est placé dans un groupe tel que les
// attributions le définissent (organisation + lettre). Une ligne par
// étudiant × cours × année — un cours sans groupe ne s'écrit pas, tous les
// inscrits y sont d'office. Le plafond « suggéré » d'un groupe se règle sur
// le cours, au référentiel : il alerte, il ne bloque pas.
(function migrerRepartitionCours() {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS etudiant_cours_groupe (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      etudiant_id INTEGER NOT NULL,
      annee_scolaire TEXT NOT NULL,
      cours_code TEXT NOT NULL,
      activite_id INTEGER NOT NULL DEFAULT 0,
      num_organisation INTEGER,
      groupe_code TEXT,
      maj_le TEXT, maj_par TEXT,
      UNIQUE(etudiant_id, annee_scolaire, cours_code, activite_id)
    )`);
    /* L'ACTIVITÉ ENTRE DANS LA CLÉ (Jérôme, 2 octobre 2026). En TIM, ce ne
     * sont pas les cours qui se coupent en groupes, ce sont leurs ACTIVITÉS :
     * la théorie du 250.1 réunit tout le monde, son laboratoire se fait en
     * huit groupes. Un étudiant n'avait qu'UN groupe par cours : on ne
     * pouvait pas dire « théorie avec tous, labo 3 ». `activite_id` = 0 pour
     * le cours entier — ce qui existait avant garde exactement son sens. */
    const colsG = db.prepare('PRAGMA table_info(etudiant_cours_groupe)').all().map(c => c.name);
    if (colsG.length && !colsG.includes('activite_id')) {
      db.exec(`
        ALTER TABLE etudiant_cours_groupe RENAME TO etudiant_cours_groupe_v1;
        CREATE TABLE etudiant_cours_groupe (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          etudiant_id INTEGER NOT NULL,
          annee_scolaire TEXT NOT NULL,
          cours_code TEXT NOT NULL,
          activite_id INTEGER NOT NULL DEFAULT 0,
          num_organisation INTEGER,
          groupe_code TEXT,
          maj_le TEXT, maj_par TEXT,
          UNIQUE(etudiant_id, annee_scolaire, cours_code, activite_id)
        );
        INSERT INTO etudiant_cours_groupe (etudiant_id, annee_scolaire, cours_code, activite_id,
          num_organisation, groupe_code, maj_le, maj_par)
          SELECT etudiant_id, annee_scolaire, cours_code, 0, num_organisation, groupe_code, maj_le, maj_par
          FROM etudiant_cours_groupe_v1;
        DROP TABLE etudiant_cours_groupe_v1;
      `);
      console.log('[migration] etudiant_cours_groupe : groupes par activité');
    }
    const cols = db.prepare('PRAGMA table_info(cours)').all().map(c => c.name);
    if (cols.length && !cols.includes('plafond_groupe')) {
      db.exec('ALTER TABLE cours ADD COLUMN plafond_groupe INTEGER');
      console.log('[migration] cours.plafond_groupe ajoutée');
    }
  } catch (e) { console.error('[migration] repartition cours :', e.message); }
})();

/** La décision qui fait foi, déduite des deux sessions. */
export function decisionFinale(s1, s2) {
  if (s2 === 'reussi') return 'reussi';
  if (s2 === 'echec' || s2 === 'absent') return 'refuse';
  if (s1 === 'reussi') return 'reussi';
  if (s1 === 'absent') return 'refuse';      // non présenté en S1 : définitif
  if (s1 === 'echec') return 'ajourne';      // va en seconde session
  if (s1 === 'refuse') return 'refuse';
  return null;
}

// ── Contrôle de cohérence : notes en échec, décision absente ────────────────
// 61 notes sous 10 en Psychomotricité sans décision d'échec correspondante :
// les notes sont encodées, la délibération ne les suit pas. Lucie ne décide
// pas à la place du Conseil, mais elle doit le signaler.
// ── Rattachement et confirmation du PAE ────────────────────────────────────
// Trois axes, comme vous les décrivez : les DONNÉES de l'étudiant, son
// INSCRIPTION au programme, ses RÉSULTATS. Le rattachement à une section est le
// point de départ du deuxième : jusqu'ici la section se déduisait des
// inscriptions, ce qui inverse l'ordre naturel — on choisit d'abord la section,
// on inscrit ensuite.
(function migrerParcours() {
  try {
    const cols = db.prepare('PRAGMA table_info(etudiant)').all().map(c => c.name);
    if (!cols.includes('section_rattachement')) {
      db.exec('ALTER TABLE etudiant ADD COLUMN section_rattachement TEXT');
      console.log('[migration] etudiant.section_rattachement ajoutée');
    }
    // La confirmation porte sur un COUPLE étudiant × année : un même étudiant
    // confirme son programme chaque année, ce n'est pas un état permanent.
    db.exec(`
      CREATE TABLE IF NOT EXISTS etudiant_pae (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        etudiant_id    INTEGER NOT NULL,
        annee_scolaire TEXT    NOT NULL,
        confirme_le    TEXT,
        confirme_par   TEXT,
        UNIQUE(etudiant_id, annee_scolaire)
      )`);
  } catch (e) { console.error('[migration] parcours :', e.message); }
})();

/**
 * La section de rattachement, avec DÉDUCTION EN SECOURS.
 *
 * Le rattachement explicite fait foi. À défaut — les étudiants déjà en base
 * n'en ont pas — on retombe sur la section la plus représentée dans ses
 * inscriptions, comme avant.
 */
export function sectionRattachement(etudId, annee = null) {
  const e = db.prepare('SELECT section_rattachement FROM etudiant WHERE id = ?').get(etudId);
  if (e?.section_rattachement) return { section: e.section_rattachement, deduite: false };

  // LES UNITÉS HORS CURSUS NE VOTENT PAS. Une unité qui s'ajoute au programme
  // d'étudiants de plusieurs sections ne dit rien du cursus de celui-ci : la
  // compter dans la déduction, c'est laisser un héritage d'import trancher un
  // rattachement — et, sur un étudiant qui ne porte qu'une ou deux unités, le
  // trancher faux.
  const lire = an => db.prepare(`
    SELECT (SELECT section FROM ue u WHERE u.ue_num = i.ue_num AND u.section IS NOT NULL
              AND COALESCE(u.hors_cursus, 0) = 0
             ORDER BY u.annee_scolaire DESC LIMIT 1) AS section
    FROM etudiant_inscription i
    WHERE i.etudiant_id = ?${an ? ' AND i.annee_scolaire = ?' : ''}
  `).all(...(an ? [etudId, an] : [etudId])).map(x => x.section).filter(Boolean);
  let lignes = lire(annee);

  /* UNE ANNÉE SANS INSCRIPTION N'EST PAS UN ÉTUDIANT SANS SECTION (21
   * septembre 2026). En passant sur 2026-2027, TOUS les étudiants de 25-26
   * sont apparus « sans section » : leur PAE de l'année suivante n'était pas
   * encore composé, la déduction ne regardait que l'année choisie, et elle ne
   * trouvait rien. Rien n'était perdu en base — mais une liste où six cents
   * personnes n'ont plus de section se lit comme une catastrophe, et un
   * filtre par section les rendait introuvables. À défaut d'inscription dans
   * l'année, on reprend la dernière année où il en a. */
  if (!lignes.length && annee) {
    const derniere = db.prepare(`SELECT MAX(annee_scolaire) AS a FROM etudiant_inscription
      WHERE etudiant_id = ? AND annee_scolaire <= ?`).get(etudId, annee)?.a
      || db.prepare('SELECT MAX(annee_scolaire) AS a FROM etudiant_inscription WHERE etudiant_id = ?')
        .get(etudId)?.a;
    if (derniere) lignes = lire(derniere);
  }

  if (!lignes.length) return { section: null, deduite: true };
  const compte = {};
  for (const s of lignes) compte[s] = (compte[s] || 0) + 1;
  const section = Object.entries(compte).sort((a, b) => b[1] - a[1])[0][0];
  return { section, deduite: true };
}

// ── Confirmer le programme d'un étudiant ───────────────────────────────────
// Tant que le PAE n'est pas confirmé, il n'est qu'une PROPOSITION. La
// confirmation le fige et fait passer l'étudiant en « inscrit ».
/* LA COORDINATION COMPOSE, CONFIRME ET VALIDE LES PAE DE SES SECTIONS (Charles,
   2 octobre 2026 : « la coordination doit être oui pour tous ces gestes »).
   Exception explicite à la règle « un coordinateur n'écrit jamais directement »,
   comme la valorisation — et le périmètre se pose sur chaque porte. */
/* Les gestes « etudiants.pae_composer » et « etudiants.pae_valider » (lib/gestes.js). */
r.post('/:id/pae/confirmer', authRequired,
       gesteRequis('etudiants.pae_composer'),
       (req, res) => {
  const etudId = Number(req.params.id);
  if (!etudiantPermis(req, res, etudId)) return;
  const { annee, ues } = req.body || {};
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const e = db.prepare('SELECT id FROM etudiant WHERE id = ?').get(etudId);
  if (!e) return res.status(404).json({ error: 'étudiant introuvable' });

  const qui = req.user?.email || req.user?.nom_complet || null;

  // Une réinscription posée hier sans être forcée bloque toujours la signature.
  const bloquantes = reprisesNonForcees(etudId, annee);
  if (bloquantes.length) {
    return res.status(409).json({
      error: `Ce programme réinscrit ${bloquantes.length > 1 ? 'des UE déjà réussies' : 'une UE déjà réussie'} `
           + `(${bloquantes.join(', ')}) sans que la réinscription ait été forcée par la direction `
           + 'ou la coordination. Retirez-les, ou faites forcer la réinscription.',
      deja_reussies: bloquantes,
    });
  }
  // Les unités transmises sont celles que l'écran affiche : elles passent par
  // la porte unique, qui les juge comme n'importe quel ajout.
  const b = ecrireProgramme({ etudId, annee, ajouter: Array.isArray(ues) ? ues : [], origine: 'confirmation',
    par: qui, motifs: req.body?.motifs || {} });
  if (b.refus.length) {
    return res.status(409).json({ error: `${b.refus.length} unité(s) contreviennent aux règles du PAE : un motif est demandé pour chacune.`,
      refus: b.refus });
  }
  db.prepare(`
    INSERT INTO etudiant_pae (etudiant_id, annee_scolaire, confirme_le, confirme_par)
    VALUES (?,?, datetime('now'), ?)
    ON CONFLICT(etudiant_id, annee_scolaire) DO UPDATE SET
      confirme_le = datetime('now'), confirme_par = excluded.confirme_par
  `).run(etudId, annee, qui);
  const ajoutees = b.ajoutees.length;
  const reports = b.reports ?? reporterDOffice(etudId, annee);
  res.json({ ok: true, ajoutees, confirme: true, reports });
});

r.delete('/:id/pae/confirmer', authRequired,
         roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur'), (req, res) => {
  const { annee } = req.query;
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  // On retire la confirmation SANS toucher aux inscriptions : les supprimer
  // effacerait des résultats éventuels.
  db.prepare('DELETE FROM etudiant_pae WHERE etudiant_id = ? AND annee_scolaire = ?')
    .run(Number(req.params.id), annee);
  res.json({ ok: true, confirme: false });
});

// ── Import d'un classeur de suivi ──────────────────────────────────────────
// Les classeurs portent les DEUX sessions, les notes par acquis et la
// MOTIVATION des décisions — ce que Lucie ne savait pas importer. Chaque ligne
// alimente trois tables : l'inscription pour la décision et sa session,
// etudiant_note_detail pour les acquis, decision_motivation pour le motif.
r.post('/import-suivi', authRequired,
       roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur'), (req, res) => {
  const { annee, lignes, simulation } = req.body || {};
  if (!annee || !Array.isArray(lignes)) {
    return res.status(400).json({ error: 'annee et lignes requises' });
  }

  // Rapprochement par MATRICULE : c'est ce que portent les classeurs. Il change
  // d'une rentrée à l'autre, mais ces fichiers sont annuels — le matricule y
  // est donc fiable, contrairement à un import pluriannuel.
  const parMatricule = {};
  for (const e of db.prepare('SELECT id, id_ecampus, nom, prenom FROM etudiant').all()) {
    const k = String(e.id_ecampus || '').trim();
    if (k) parMatricule[k] = e;
  }

  // Les PONDÉRATIONS du classeur : elles manquent au référentiel de Lucie,
  // alors que vos fichiers les portent. Sans elles, la note d'unité se calcule
  // à la moyenne simple, ce qui est faux dès qu'un acquis pèse 60 %.
  const insPondCours = db.prepare(`
    INSERT INTO cours_ponderation (annee_scolaire, ue_num, cours_code, poids, maj_le)
    VALUES (?,?,?,?, datetime('now'))
    ON CONFLICT(annee_scolaire, ue_num, cours_code) DO UPDATE SET
      poids = excluded.poids, maj_le = excluded.maj_le`);

  const insPond = db.prepare(`
    INSERT INTO aa_ponderation (annee_scolaire, ue_num, cours_code, aa_code, poids, maj_le)
    VALUES (?,?,?,?,?, datetime('now'))
    -- La contrainte porte sur (annee_scolaire, cours_code, aa_code), SANS
    -- ue_num : l'avoir supposée autrement faisait échouer tout l'import.
    ON CONFLICT(annee_scolaire, cours_code, aa_code) DO UPDATE SET
      poids = excluded.poids, maj_le = excluded.maj_le`);

  const rapport = { retrouves: 0, resultats: 0, notes: 0, motivations: 0,
                    ponderations: 0,
                    ecrases: 0, inconnus: [] };
  const vusEtud = new Set();
  const ponderationsFaites = new Set();
  rapport.aa_sans_cours = new Set();

  const insInsc = db.prepare(`
    INSERT INTO etudiant_inscription
      (etudiant_id, annee_scolaire, ue_num, resultat, resultat_s1, resultat_s2,
       points, date_inscription)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(etudiant_id, annee_scolaire, ue_num) DO UPDATE SET
      resultat    = excluded.resultat,
      resultat_s1 = COALESCE(excluded.resultat_s1, etudiant_inscription.resultat_s1),
      resultat_s2 = COALESCE(excluded.resultat_s2, etudiant_inscription.resultat_s2),
      points      = COALESCE(excluded.points, etudiant_inscription.points)`);

  const lireInsc = db.prepare(`
    SELECT resultat, points FROM etudiant_inscription
    WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?`);

  const insNote = db.prepare(`
    INSERT INTO etudiant_note_detail
      (etudiant_id, annee_scolaire, ue_num, type, code, points)
    VALUES (?,?,?, 'aa', ?, ?)
    ON CONFLICT(etudiant_id, annee_scolaire, ue_num, type, code) DO UPDATE SET
      points = excluded.points`);

  const insMotif = db.prepare(`
    INSERT INTO decision_motivation
      (etudiant_id, annee_scolaire, ue_num, aa_code, motif, maj_le, maj_par)
    VALUES (?,?,?,?,?, datetime('now'), ?)
    ON CONFLICT(etudiant_id, annee_scolaire, ue_num, aa_code) DO UPDATE SET
      motif = excluded.motif, maj_le = excluded.maj_le`);

  const dateJour = new Date().toISOString().slice(0, 10);
  const qui = req.user?.email || req.user?.nom_complet || null;

  const appliquer = db.transaction(() => {
    for (const l of lignes) {
      const e = parMatricule[String(l.matricule || '').trim()];
      if (!e) {
        rapport.inconnus.push({ matricule: l.matricule, nom: l.nom, prenom: l.prenom });
        continue;
      }
      if (!vusEtud.has(e.id)) { vusEtud.add(e.id); rapport.retrouves++; }

      const ueNum = Number(l.ue_num);
      if (!Number.isFinite(ueNum)) continue;

      // Un résultat déjà en base sera REMPLACÉ : on le compte pour l'annoncer.
      const avant = lireInsc.get(e.id, annee, ueNum);
      if (avant?.resultat && avant.resultat !== l.decision) rapport.ecrases++;

      if (l.decision) {
        // La session d'où vient la décision, telle que le classeur la dit.
        const s1 = l.session === 's1' ? l.decision : null;
        const s2 = l.session === 's2' ? (l.decision === 'reussi' ? 'reussi' : 'echec') : null;
        if (!simulation) {
          insInsc.run(e.id, annee, ueNum, l.decision, s1, s2,
                      l.points ?? null, dateJour);
        }
        rapport.resultats++;
      }

      // Le cours de chaque acquis : le calcul de la note d'UE cherche les
      // notes sous la clé « cours|acquis », les pondérations étant propres au
      // cours. Une note sans cours resterait invisible au calcul.
      const coursDe = {};
      for (const r0 of db.prepare(
        'SELECT aa_code, cours_code FROM aa WHERE ue_num = ?').all(ueNum)) {
        if (r0.cours_code) coursDe[r0.aa_code] = r0.cours_code;
      }

      for (const [bloc, notes] of [['s1', l.notes_s1], ['s2', l.notes_s2]]) {
        for (const [aa, note] of Object.entries(notes || {})) {
          // Le code porte la session : sans cela, la seconde écraserait la
          // première et l'on perdrait le détail de la délibération.
          // Deux écritures : la SESSION pour la feuille de délibération, et le
          // COURS pour le calcul de la note d'unité. Les deux sont utiles et ne
          // se remplacent pas.
          if (!simulation) insNote.run(e.id, annee, ueNum, `${bloc}|${aa}`, note);
          const cc = coursDe[aa];
          if (cc && bloc === 's2' || (cc && bloc === 's1' && !l.notes_s2?.[aa])) {
            // La note qui FAIT FOI : la seconde session si elle existe.
            if (!simulation) insNote.run(e.id, annee, ueNum, `${cc}|${aa}`, note);
          }
          rapport.notes++;
        }
      }

      // Les pondérations sont propres à l'UNITÉ, non à l'étudiant : on ne les
      // écrit qu'une fois par unité rencontrée.
      // La RÉPARTITION de l'onglet dédié fait foi jusqu'en 2025-2026 : elle
      // donne le poids de chaque cours et le poids de chaque acquis DANS
      // chaque cours, un même acquis pouvant figurer dans plusieurs. À partir
      // de 2026-2027, les périodes du dossier pédagogique prennent le relais
      // et ces tables restent vides.
      if (l.repartition && !ponderationsFaites.has(ueNum)) {
        ponderationsFaites.add(ueNum);
        for (const [cc, p] of Object.entries(l.repartition.cours || {})) {
          if (p == null || p === 0) continue;
          if (!simulation) insPondCours.run(annee, ueNum, cc, p);
          rapport.ponderations++;
        }
        for (const [aa, parCours] of Object.entries(l.repartition.acquis || {})) {
          for (const [cc, p] of Object.entries(parCours)) {
            if (p == null || p === 0) continue;
            if (!simulation) insPond.run(annee, ueNum, cc, aa, p);
            rapport.ponderations++;
          }
        }
        continue;
      }

      if (l.ponderations && !ponderationsFaites.has(ueNum)) {
        ponderationsFaites.add(ueNum);
        for (const [aa, p] of Object.entries(l.ponderations)) {
          if (p?.poids_aa == null) continue;
          // La pondération est stockée PAR COURS : sans le cours, le calcul
          // de la note d'UE ne la retrouve pas. Un acquis sans cours rattaché
          // est signalé plutôt qu'écrit sous une clé vide.
          const cc = db.prepare(
            'SELECT cours_code FROM aa WHERE ue_num = ? AND aa_code = ? LIMIT 1'
          ).get(ueNum, aa)?.cours_code;
          if (!cc) { rapport.aa_sans_cours.add(aa); continue; }
          if (!simulation) insPond.run(annee, ueNum, cc, aa, p.poids_aa);
          rapport.ponderations++;
        }
      }

      // La justification du classeur devient la motivation de la décision.
      if (l.justification && (l.decision === 'refuse' || l.decision === 'ajourne')) {
        if (!simulation) {
          insMotif.run(e.id, annee, ueNum, '_ue', l.justification, qui);
        }
        rapport.motivations++;
      }
    }
    if (simulation) throw new Error('SIMULATION');
  });

  try { appliquer(); } catch (e) {
    if (e.message !== 'SIMULATION') {
      console.error('[import-suivi]', e);
      return res.status(500).json({ error: e.message });
    }
  }

  res.json({
    ok: true, simulation: !!simulation,
    lignes_lues: lignes.length,
    retrouves: rapport.retrouves,
    resultats: rapport.resultats,
    notes: rapport.notes,
    motivations: rapport.motivations,
    ponderations: rapport.ponderations,
    aa_sans_cours: [...rapport.aa_sans_cours],
    ecrases: rapport.ecrases,
    inconnus: rapport.inconnus.slice(0, 20),
    nb_inconnus: rapport.inconnus.length,
  });
});

// ── Fiche pédagogique de parcours ──────────────────────────────────────────
// Le document qu'on remet à l'étudiant après délibération : où il en est, ce
// qu'il peut suivre, ce qui lui reste. Aucune notion financière — c'est une
// pièce PÉDAGOGIQUE, non un décompte de droits d'inscription.
r.get('/:id/fiche-parcours', authRequired, (req, res) => {
  const etudId = Number(req.params.id);
  const annee = req.query.annee || anneeDeTravail(req);

  const e = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(etudId);
  if (!e) return res.status(404).json({ error: 'étudiant introuvable' });

  const { section } = sectionRattachement(etudId, annee);
  if (!section) {
    return res.status(400).json({
      error: "Aucune section pour cet étudiant : le schéma de capitalisation "
           + 'ne peut pas être construit.',
    });
  }

  // Tout ce que l'étudiant a acquis, TOUTES ANNÉES : une unité réussie ne se
  // reperd pas.
  const acquis = new Map();
  for (const l of db.prepare(`
    SELECT ue_num, resultat, points, annee_scolaire FROM etudiant_inscription
    WHERE etudiant_id = ? ORDER BY annee_scolaire
  `).all(etudId)) {
    if (l.resultat === 'reussi') {
      acquis.set(l.ue_num, { points: l.points, annee: l.annee_scolaire, mode: 'reussi' });
    }
  }
  for (const v of db.prepare(`
    SELECT ue_num, pourcentage, annee_scolaire FROM etudiant_valorisation
    WHERE etudiant_id = ? AND type = 'complete' AND ${vaRetenue()}
  `).all(etudId)) {
    if (!acquis.has(v.ue_num)) {
      acquis.set(v.ue_num, { points: vaSur20(v.pourcentage), annee: v.annee_scolaire, mode: 'va' });
    }
  }

  const inscrites = new Set(db.prepare(`
    SELECT ue_num FROM etudiant_inscription
    WHERE etudiant_id = ? AND annee_scolaire = ?
  `).all(etudId, annee).map(x => x.ue_num));

  // Le graphe, avec la situation de l'étudiant superposée. Une unité est
  // ACCESSIBLE si tous ses prérequis sont acquis ; sinon elle est hors
  // d'atteinte pour l'instant.
  const graphe = construireGraphe({
    sections: [section], annee,
    etat: (ueNum) => {
      if (acquis.has(ueNum)) {
        const a = acquis.get(ueNum);
        return { statut: 'acquis', points: a.points, annee_acquis: a.annee, mode: a.mode };
      }
      return { statut: 'a_evaluer', inscrite: inscrites.has(ueNum) };
    },
  });

  // L'accessibilité se calcule APRÈS coup : elle dépend des prérequis, que le
  // graphe vient d'établir.
  for (const n of graphe.nodes) {
    if (n.statut === 'acquis') continue;
    const bloquants = (n.prerequis || []).filter(p => !acquis.has(p));
    n.statut = bloquants.length ? 'bloque' : 'accessible';
    n.bloquants = bloquants;
  }

  // Les unités réussies, avec leur note — la partie basse du document.
  const reussies = [...acquis.entries()]
    .map(([ue_num, a]) => {
      const u = graphe.nodes.find(n => n.ue_num === ue_num);
      return {
        ue_num, ue_nom: u?.ue_nom || `UE ${ue_num}`, ue_niv: u?.ue_niv || '',
        points: a.points, annee: a.annee, mode: a.mode,
      };
    })
    .sort((a, b) => String(a.annee).localeCompare(String(b.annee)) || a.ue_num - b.ue_num);

  res.json({
    etudiant: { id: e.id, nom: e.nom, prenom: e.prenom, id_ecampus: e.id_ecampus },
    section, annee, graphe, reussies,
    compte: {
      acquis: acquis.size,
      accessibles: graphe.nodes.filter(n => n.statut === 'accessible').length,
      bloquees: graphe.nodes.filter(n => n.statut === 'bloque').length,
      inscrites: inscrites.size,
      total: graphe.nodes.length,
    },
  });
});

// ── Le document imprimable ─────────────────────────────────────────────────
// Paysage, une page A4. Le schéma en haut, les unités réussies en bas.
/**
 * LE PARCOURS D'UN ÉTUDIANT, SUR UNE PAGE — extrait de sa route pour être
 * produit AUSSI en lot. Composer les programmes d'une promotion sans pouvoir
 * en remettre le parcours à chacun n'aurait servi qu'à moitié : c'est cette
 * feuille que l'étudiant emporte.
 *
 * Elle porte le graphe des prérequis, ce qui est acquis, et le programme de
 * l'année — ni cote d'échec ni décision : ce n'est pas un bulletin.
 */
export function documentParcours(etudId, annee) {
  const e = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(etudId);
  if (!e) return { erreur: 'étudiant introuvable', code: 404 };

  const { section } = sectionRattachement(etudId, annee);
  if (!section) return { erreur: 'aucune section pour cet étudiant', code: 400 };

  // On réutilise le calcul de la route de données, sans le dupliquer.
  const acquis = new Map();
  for (const l of db.prepare(`
    SELECT ue_num, resultat, points, annee_scolaire FROM etudiant_inscription
    WHERE etudiant_id = ? ORDER BY annee_scolaire`).all(etudId)) {
    if (l.resultat === 'reussi') {
      acquis.set(l.ue_num, { points: l.points, annee: l.annee_scolaire, mode: 'reussi' });
    }
  }
  for (const v of db.prepare(`
    SELECT ue_num, pourcentage, annee_scolaire FROM etudiant_valorisation
    WHERE etudiant_id = ? AND type = 'complete' AND ${vaRetenue()}`).all(etudId)) {
    if (!acquis.has(v.ue_num)) {
      acquis.set(v.ue_num, { points: vaSur20(v.pourcentage), annee: v.annee_scolaire, mode: 'va' });
    }
  }
  const inscrites = new Set(db.prepare(`
    SELECT ue_num FROM etudiant_inscription
    WHERE etudiant_id = ? AND annee_scolaire = ?`).all(etudId, annee).map(x => x.ue_num));

  // Le schéma : le MÊME calcul et le MÊME dessin qu'à l'écran
  // (donneesCapitalisation, lib/schemaSvg.js) — deux dessins d'un même
  // parcours finissent par dire deux choses.
  const graphe = donneesCapitalisation(etudId, annee, section);
  const esc2 = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const schema = schemaSvg(graphe);

  const reussies = [...acquis.entries()]
    .map(([ue, a]) => ({ ue, ...a,
      nom: graphe.nodes.find(n => n.ue_num === ue)?.ue_nom || `UE ${ue}` }))
    .sort((a, b) => String(a.annee).localeCompare(String(b.annee)) || a.ue - b.ue);

  // Le PROGRAMME de l'année, énuméré sous le schéma : la pastille du graphe
  // signale bien une UE inscrite, mais elle ne se lit qu'en cherchant, et la
  // fiche imprimée doit pouvoir se relire sans décoder le dessin. Les unités
  // déjà acquises en sont exclues — elles figurent dans l'autre tableau.
  const inscritesListe = [...inscrites]
    .filter(ue => !acquis.has(ue))
    .map(ue => {
      const n0 = graphe.nodes.find(x => x.ue_num === ue);
      return { ue, nom: n0?.ue_nom || `UE ${ue}`, niv: n0?.ue_niv || '',
               statut: n0?.statut || null };
    })
    .sort((a, b) => a.ue - b.ue);

  const corps = `
<div class="fp">
  <div class="entete">
    <div>
      <div class="nom-etud">${esc2((e.nom || '').toUpperCase())} ${esc2(e.prenom || '')}</div>
      <div class="sous">${esc2(section)} · année ${esc2(annee)}${
        e.id_ecampus ? ` · matricule ${esc2(e.id_ecampus)}` : ''}</div>
    </div>
    <div class="titre">Parcours de formation</div>
  </div>

  <div class="legende">${legendeSchemaHtml()}</div>

  ${schema}

  <div class="bas">
    <div class="bas-titre">Unités d'enseignement acquises
      <span class="cpt">${reussies.length}</span></div>
    ${reussies.length ? `<table class="acquises">
      <tr><th>UE</th><th>Intitulé</th><th>Année</th><th>Note</th></tr>
      ${reussies.map(u => `<tr>
        <td>${u.ue}</td>
        <td>${esc2(u.nom)}</td>
        <td>${esc2(u.annee || '')}</td>
        <td class="n">${u.mode === 'va' ? 'Valorisation'
          : (() => {
            // JAMAIS DE COTE SOUS DIX SUR UN DOCUMENT REMIS À L'ÉTUDIANT
            // (circulaire Sanction des études). Ces unités sont réussies, donc
            // la question ne devrait pas se poser — mais une reprise
            // d'historique peut porter une décision de réussite et une cote
            // incohérente, et c'est la pièce de l'étudiant qui l'afficherait.
            if (u.points == null) return '—';
            const n = Math.round(Number(u.points));
            return n < 10 ? 'NA' : `${n}/20`;
          })()}</td>
      </tr>`).join('')}
    </table>` : '<div class="vide">Aucune unité acquise à ce jour.</div>'}
  </div>

  <div class="bas">
    <div class="bas-titre">Unités d'enseignement inscrites au programme ${esc2(annee)}
      <span class="cpt">${inscritesListe.length}</span></div>
    ${inscritesListe.length ? `<table class="acquises">
      <tr><th>UE</th><th>Intitulé</th><th>Bloc</th></tr>
      ${inscritesListe.map(u => `<tr>
        <td>${u.ue}</td>
        <td>${esc2(u.nom)}</td>
        <td class="n">${esc2(u.niv || '—')}</td>
      </tr>`).join('')}
    </table>` : `<div class="vide">Aucune unité inscrite au programme ${esc2(annee)}.</div>`}
  </div>
</div>`;

  const html = envelopperDocument({
    html: corps, titre: '', orientation: 'paysage',
    margeHaut: 10, margeCote: 10, logo: LOGO_IIP_JPEG,
    styles: `
.fp{font-size:8pt;color:#1B2B4B}
.entete{display:flex;justify-content:space-between;align-items:flex-end;
  border-bottom:1pt solid #C9A84C;padding-bottom:1.5mm;margin-bottom:2mm}
.entete .nom-etud{font-size:13pt;font-weight:700}
.entete .sous{font-size:8.5pt;color:#475569}
.entete .titre{font-size:10pt;font-weight:700;letter-spacing:.4pt;color:#475569}

.legende{font-size:7pt;color:#475569;margin-bottom:2mm;line-height:1.8}

/* Le schéma est un SVG : il porte ses propres couleurs. */
.schema{width:100%;height:auto;max-height:105mm;display:block;margin:1mm 0 2mm}

.bas{margin-top:3mm;border-top:.5pt solid #cbd5e1;padding-top:1.5mm}
.bas-titre{font-size:8.5pt;font-weight:700;margin-bottom:1mm}
.bas-titre .cpt{background:#1B2B4B;color:#fff;border-radius:2mm;
  padding:.2mm 1.6mm;font-size:7pt;margin-left:1.5mm}
table.acquises{width:100%;border-collapse:collapse;font-size:7pt}
table.acquises th{background:#f1f5f9;text-align:left;font-size:6.5pt;
  text-transform:uppercase;letter-spacing:.2pt;color:#475569;
  padding:.8mm 1.2mm;border:.4pt solid #cbd5e1}
table.acquises td{padding:.7mm 1.2mm;border:.4pt solid #e2e8f0}
table.acquises td.n{text-align:right;white-space:nowrap;font-weight:600}
.vide{font-size:7.5pt;color:#94a3b8;font-style:italic}`,
  });

  return { html, corps, nom: `Parcours_${e.nom}_${e.prenom}_${annee}`,
           etudiant: e, section, annee,
           acquises: reussies.length, programme: inscritesListe.length };
}

/**
 * LE BULLETIN DE PARCOURS (Charles, 1er octobre 2026 : « toutes ses UE
 * inscrites, année après année, et les notes obtenues ; s'il est inscrit deux
 * années, la note de la première année, celle de la seconde ; avec le schéma de
 * capitalisation ; si la note est < 10, NA »). Maquette validée le même jour.
 *
 *   · une ligne par UE du cursus (rangée par bloc, épreuve intégrée au bout),
 *     une colonne par année suivie — la même UE porte ses cotes successives ;
 *   · une rubrique « autres unités » pour ce qui a été suivi hors du cursus ;
 *   · quatre tuiles : ECTS acquis, UE acquises, ECTS inscrits cette année,
 *     moyenne générale (pondérée par les périodes étudiant, la définition du
 *     bilan de parcours, sur les unités ACQUISES — la seule qui garde ses
 *     décimales) ;
 *   · en annexe, le schéma de la fiche de parcours (lib/schemaSvg.js), tourné
 *     d'un quart de tour pour tenir en largeur.
 * Pièce remise à l'étudiant : jamais de cote sous dix (NA) ; une faveur vaut 10.
 */
export function documentBulletin(etudId, annee) {
  const e = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(etudId);
  if (!e) return { erreur: 'étudiant introuvable', code: 404 };
  const section = cursusDe(etudId, annee).courant || sectionRattachement(etudId, annee).section;
  if (!section) return { erreur: 'aucune section pour cet étudiant', code: 400 };
  const sec = db.prepare('SELECT code, libelle FROM section WHERE code = ?').get(section) || { code: section };
  const graphe = donneesCapitalisation(etudId, annee, section);
  const esc = x => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const court = a => String(a || '').replace(/^20(\d\d)-20(\d\d)$/, '$1-$2');

  const refUe = db.prepare(`SELECT ue_nom, ue_niv, ects, ue_per_etudiants, COALESCE(is_epreuve_integree,0) ei FROM ue
      WHERE ue_num = ? ORDER BY (annee_scolaire = ?) DESC, annee_scolaire DESC LIMIT 1`);
  const ref = new Map();
  const refDe = n => { if (!ref.has(n)) ref.set(n, refUe.get(n, annee) || {}); return ref.get(n); };

  const insc = db.prepare(`SELECT ue_num, annee_scolaire, resultat, points FROM etudiant_inscription WHERE etudiant_id = ?`).all(etudId);
  const sessions = new Map();
  try {
    for (const d of db.prepare(`SELECT ue_num, annee_scolaire, session, resultat, points FROM deliberation_resultat
        WHERE etudiant_id = ? AND resultat IS NOT NULL AND resultat != ''`).all(etudId)) {
      sessions.set(`${d.ue_num}|${d.annee_scolaire}|${d.session}`, d);
    }
  } catch { /* table absente */ }
  const faveurs = new Set();
  try {
    for (const f of db.prepare(`SELECT DISTINCT ue_num, annee_scolaire FROM deliberation_ajustement WHERE etudiant_id = ? AND action = 'faveur'`).all(etudId)) {
      faveurs.add(`${f.ue_num}|${f.annee_scolaire}`);
    }
  } catch { /* table absente */ }
  const vas = db.prepare(`SELECT ue_num, annee_scolaire FROM etudiant_valorisation WHERE etudiant_id = ?
      AND type = 'complete' AND ${vaRetenue()}`).all(etudId);
  const annees = [...new Set([...insc.map(i => i.annee_scolaire), ...vas.map(v => v.annee_scolaire)])].filter(Boolean).sort();
  if (!annees.includes(annee) && insc.some(i => i.annee_scolaire === annee)) annees.push(annee);

  const noteLisible = p => { if (p == null) return null; const n = Math.round(Number(p)); return n < 10 ? 'NA' : String(n); };
  // Une case : ce qui s'est passé pour cette UE cette année-là.
  const caseDe = (ue, an) => {
    if (vas.some(v => v.ue_num === ue && v.annee_scolaire === an)) return { cls: 'c-va', txt: 'VA', m: 'valorisation', acquise: true };
    const i = insc.find(x => x.ue_num === ue && x.annee_scolaire === an);
    if (!i) return null;
    const s1 = sessions.get(`${ue}|${an}|1`), s2 = sessions.get(`${ue}|${an}|2`);
    // UNE LIGNE « SESSION 2 » NE PROUVE PAS UNE SECONDE SESSION : la clôture de
    // septembre écrit une ligne pour TOUS les inscrits de l'unité, y compris ceux
    // qui avaient réussi en juin (2 169 cas en production au 1er octobre 2026).
    // Il n'y a eu seconde session que si la première a AJOURNÉ l'étudiant.
    const deux = !!(s1 && s2 && s1.resultat === 'ajourne');
    const mS = r => (r?.resultat === 'reussi' ? (noteLisible(r.points) === 'NA' ? '✓' : noteLisible(r.points) || '✓') : 'NA');
    const mention = deux ? `S1 ${mS(s1)} · S2 ${mS(s2)}` : null;
    if (faveurs.has(`${ue}|${an}`) && i.resultat === 'reussi') return { cls: 'c-fav', txt: '10', m: 'faveur du Conseil', acquise: true, faveur: true, s2: deux };
    if (i.resultat === 'reussi') {
      const n = noteLisible(i.points);
      return { cls: 'c-ok', txt: n && n !== 'NA' ? n : '✓', m: mention, acquise: true, s2: deux };
    }
    if (i.resultat === 'ajourne' || i.resultat === 'refuse') return { cls: 'c-na', txt: 'NA', m: mention, echec: true };
    if (an === annee) return { cls: 'c-cours', txt: 'en cours', encours: true };
    // Une année qui n'est pas encore commencée porte un programme, pas un résultat manquant.
    if (an > annee) return { cls: 'c-cours', txt: 'inscrite', prevue: true };
    return { cls: 'c-vide', txt: '—', m: 'sans résultat', vide: true };
  };

  const prereqDe = {};
  for (const ed of graphe.edges || []) (prereqDe[ed.to] ||= []).push(ed.from);
  const nodes = (graphe.nodes || []).slice().sort((a, b) =>
    (!!a.epreuve_integree - !!b.epreuve_integree) || rangBloc(a.ue_niv) - rangBloc(b.ue_niv) || a.ue_num - b.ue_num);
  const dansCursus = new Set(nodes.map(n => n.ue_num));
  const acquisSet = new Set();
  const ligne = n => {
    const cases = annees.map(an => caseDe(n.ue_num, an));
    const derniereAcquise = [...cases].reverse().find(c => c?.acquise);
    const iAcq = derniereAcquise ? annees[cases.lastIndexOf(derniereAcquise)] : null;
    if (derniereAcquise) acquisSet.add(n.ue_num);
    const tente = cases.some(c => c && (c.acquise || c.echec));
    const inscriteSansResultat = !tente && cases.some(c => c?.vide);
    let etat;
    if (derniereAcquise) etat = `Acquise en ${iAcq}${derniereAcquise.faveur ? ' (faveur)' : derniereAcquise.txt === 'VA' ? ' (valorisation)' : derniereAcquise.s2 ? ' (2<sup>e</sup> session)' : ''}`;
    else if (cases[annees.indexOf(annee)]?.encours) etat = tente ? `Reprise en ${annee}` : 'Première inscription';
    else if (tente) etat = 'À reprendre';
    else if (cases.some(c => c?.prevue)) etat = 'Inscrite pour l\'année suivante';
    else if (inscriteSansResultat) etat = '<span class="gris">Inscrite, aucun résultat encodé</span>';
    else if (n.epreuve_integree) etat = '<span class="gris">S\'ouvre quand tout le reste est acquis</span>';
    else {
      const manque = (prereqDe[n.ue_num] || []).filter(p => !acquisDuGraphe.has(p));
      etat = `<span class="gris">Pas encore suivie${manque.length ? ` — exige ${manque.join(', ')}` : ''}</span>`;
    }
    const r0 = refDe(n.ue_num);
    return { ue: n.ue_num, nom: n.ue_nom || r0.ue_nom || `UE ${n.ue_num}`, niv: String(n.ue_niv || r0.ue_niv || '').toUpperCase(),
      ects: Number(r0.ects) || 0, per: Number(r0.ue_per_etudiants) || 0, ei: !!n.epreuve_integree, cases, etat,
      acquise: !!derniereAcquise, faveur: !!derniereAcquise?.faveur, encours: !!cases[annees.indexOf(annee)]?.encours,
      inscriteAnnee: insc.some(x => x.ue_num === n.ue_num && x.annee_scolaire === annee),
      note: derniereAcquise ? (derniereAcquise.faveur ? 10 : (() => { const i = insc.filter(x => x.ue_num === n.ue_num && x.resultat === 'reussi').pop(); return i?.points ?? null; })()) : null };
  };
  const acquisDuGraphe = new Set((graphe.nodes || []).filter(n => n.statut === 'acquise').map(n => n.ue_num));
  const lignes = nodes.map(ligne);
  // LES AUTRES UNITÉS : suivies, mais hors du cursus de la section.
  const autresNums = [...new Set([...insc.map(i => i.ue_num), ...vas.map(v => v.ue_num)])].filter(u => !dansCursus.has(u)).sort((a, b) => a - b);
  const autres = autresNums.map(u => ligne({ ue_num: u, ue_nom: refDe(u).ue_nom, ue_niv: refDe(u).ue_niv }));

  const tous = [...lignes, ...autres];
  const ectsAcquis = tous.filter(l => l.acquise).reduce((t, l) => t + l.ects, 0);
  const ectsFaveur = tous.filter(l => l.faveur).reduce((t, l) => t + l.ects, 0);
  const ectsCursus = lignes.reduce((t, l) => t + l.ects, 0);
  const ectsInscrits = tous.filter(l => l.inscriteAnnee).reduce((t, l) => t + l.ects, 0);
  const nbEnCours = tous.filter(l => l.encours).length;
  let num = 0, den = 0;
  for (const l of tous) { if (!l.acquise || l.note == null || !l.per) continue; num += Number(l.note) * l.per; den += l.per; }
  const moyenne = den ? (num / den) : null;

  const couleurBlocP = { BA1: '#E8890C', BA2: '#7FB3D5', BA3: '#1B2B4B' };
  const texteBloc = b => (b === 'BA2' ? '#1B2B4B' : '#fff');
  const cellule = c => (!c ? '<td class="n vide">—</td>'
    : `<td class="n">${c.cls === 'c-vide' ? '<span class="vide">—</span>' : `<span class="cote ${c.cls}">${esc(c.txt)}</span>`}${c.m ? `<span class="m">${esc(c.m)}</span>` : ''}</td>`);
  const rangee = l => `<tr><td${l.ei ? ' class="ei"' : ''}><b>${l.ue}</b> ${esc(l.nom)}</td><td class="n">${l.ects || '—'}</td>${l.cases.map(cellule).join('')}<td class="etat">${l.etat}</td></tr>`;
  const groupes = [];
  for (const l of lignes) {
    const b = l.ei ? 'EI' : (l.niv || '—');
    let g = groupes.find(x => x.b === b);
    if (!g) { g = { b, l: [] }; groupes.push(g); }
    g.l.push(l);
  }
  const nbCol = annees.length + 3;
  const corpsTable = groupes.map(g => {
    if (g.b === 'EI') return g.l.map(rangee).join('');
    const tot = g.l.reduce((t, l) => t + l.ects, 0), acq = g.l.filter(l => l.acquise).reduce((t, l) => t + l.ects, 0),
      cours = g.l.filter(l => l.encours).reduce((t, l) => t + l.ects, 0);
    return `<tr class="bloc"><td colspan="${nbCol}" style="background:${couleurBlocP[g.b] || '#64748b'};color:${texteBloc(g.b)}">${esc(g.b)} — ${tot} ECTS · acquis ${acq}${cours ? ` · en cours ${cours}` : ''}</td></tr>`
      + g.l.map(rangee).join('');
  }).join('') + (autres.length ? `<tr class="bloc"><td colspan="${nbCol}" style="background:#EEF1F6;color:#1B2B4B">Autres unités suivies — hors du cursus de la section</td></tr>${autres.map(rangee).join('')}` : '');

  const tuile = (v, l, p) => `<div class="tuile"><div class="v">${v}</div><div class="l">${l}</div>${p ? `<div class="p">${p}</div>` : ''}</div>`;
  const naissance = e.date_naissance ? String(e.date_naissance).replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1') : null;
  /* À L'ÉCHELLE DU DESSIN, PAS DE LA PAGE (Charles, 9 octobre 2026 : « très
     grand »). Étiré sur les 235 mm de la feuille, un cursus de quatre unités
     donnait des blocs géants. Une échelle naturelle (0,42 mm par unité de
     dessin), plafonnée à la page : un petit cursus reste petit, un grand se
     resserre pour tenir. */
  const svgBrut = schemaSvg(graphe);
  const vb = (svgBrut.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/) || []).slice(1).map(Number);
  const svg = vb.length === 2
    ? svgBrut.replace('<svg ', `<svg style="width:${Math.min(235, Math.round(vb[0] * 0.42))}mm;max-width:100%" `)
    : svgBrut;
  const ident = identiteEtablissement();
  const dateLongue = new Date().toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })
    .replace(/^1 /, '1er ');

  const corps = `
<div class="bulletin">
  <div class="etudiant"><div class="nom">${esc(String(e.nom || '').toUpperCase())} ${esc(e.prenom || '')}</div>
    <div class="d">${[e.id_ecampus || (e.matricule_helb ? `HELB ${e.matricule_helb}` : null), naissance ? `né(e) le ${esc(naissance)}` : null, `section ${esc(section)}`].filter(Boolean).join(' · ')}</div></div>
  <div class="tuiles">
    ${tuile(`${ectsAcquis} <span class="sur">/ ${ectsCursus}</span>`, 'ECTS acquis', ectsFaveur ? `dont ${ectsFaveur} par faveur du Conseil` : null)}
    ${tuile(`${tous.filter(l => l.acquise).length} <span class="sur">/ ${lignes.length}</span>`, 'UE acquises', autres.filter(l => l.acquise).length ? `dont ${autres.filter(l => l.acquise).length} hors cursus` : null)}
    ${tuile(ectsInscrits, `ECTS inscrits en ${esc(annee)}`, `${tous.filter(l => l.inscriteAnnee).length} UE${nbEnCours ? `, dont ${nbEnCours} en cours` : ''}`)}
    ${tuile(moyenne == null ? '—' : moyenne.toLocaleString('fr-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 'Moyenne générale', 'UE acquises, pondérée par les périodes')}
  </div>
  <h2>Les unités du cursus, année après année</h2>
  <table class="ues">
    <thead><tr><th style="width:40%">Unité d'enseignement</th><th class="n">ECTS</th>${annees.map(a => `<th class="n">${esc(a)}</th>`).join('')}<th>Où en est l'unité</th></tr></thead>
    <tbody>${corpsTable}</tbody>
  </table>
  <div class="legende"><b>NA</b> : non acquis. Aucune cote inférieure à 10/20 ne figure sur un document remis à l'étudiant (circulaire Sanction des études).
    · <b>S1 / S2</b> : première et seconde session, quand l'unité s'est jouée en deux temps — la cote de la case est celle qui a été retenue.
    · <b>Faveur</b> : unité accordée par le Conseil des études ; elle vaut 10. · <b>VA</b> : valorisation des acquis. · Les cotes sont sur 20.
    · La moyenne générale porte sur les unités acquises, pondérées par leurs périodes ; elle seule garde ses décimales.</div>
  <div class="cloture">
    <div class="sceau"></div>
    <div class="paraphe"></div>
    <div class="lieu">Fait à ${esc(ident.ville || 'Bruxelles')}, le ${esc(dateLongue)}</div>
    <div class="legende">
      <div class="qualite">Pour l'Institut,<br>le Directeur</div>
      <div class="nom">${esc(ident.directeur || 'SOHET Charles')}</div>
    </div>
  </div>
  <div class="annexe">
    <div class="tourne">
      <div class="doc-cadre" style="margin-top:0"><div class="doc-cadre-t">Annexe — Schéma de capitalisation</div>
        <div class="doc-cadre-s">${esc(String(e.nom || '').toUpperCase())} ${esc(e.prenom || '')} · ${esc(section)} · état au ${esc(annee)}</div></div>
      <div class="legende-schema">${legendeSchemaHtml()}</div>
      ${svg}
      <div class="fleches"><b>Lire les flèches.</b> Une flèche va d'une unité vers celle qu'elle ouvre : l'unité de
        départ doit être acquise pour pouvoir s'inscrire à l'unité d'arrivée (prérequis). Sa couleur est celle du
        bloc de l'unité d'arrivée. <b>En trait plein</b>, le prérequis est réglementaire : il s'impose. <b>En
        pointillés</b>, c'est un prérequis recommandé par l'Institut : il est conseillé de le respecter, sans
        qu'il empêche l'inscription. Une unité sans flèche entrante est ouverte d'emblée ; l'épreuve intégrée
        (★) ne s'ouvre qu'une fois toutes les autres unités acquises.</div>
    </div>
  </div>
</div>`;

  const html = envelopperDocument({
    html: corps, titre: `Bulletin de parcours — ${e.nom} ${e.prenom || ''}`,
    entete: { titre: 'Bulletin de parcours', sous: sec.libelle && sec.libelle !== section ? `${sec.libelle} (${section})` : section,
      ligne: annees.length ? `De ${annees[0]} à ${annees[annees.length - 1]} · arrêté le ${new Date().toLocaleDateString('fr-BE')}` : null },
    styles: `
.bulletin{font-size:8.5pt;color:#1B2B4B}
.etudiant{background:#eff6ff;border-left:.6mm solid #1B2B4B;padding:2.5mm 3.5mm;margin:0 0 4mm;display:flex;justify-content:space-between;align-items:baseline;gap:4mm}
.etudiant .nom{font-size:11pt;font-weight:700}
.etudiant .d{font-size:8pt;color:#475569}
.tuiles{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm;margin:0 0 4mm}
.tuile{border:.3mm solid #D8DCE4;border-left:1mm solid #C9A84C;border-radius:0 2.6mm 2.6mm 0;padding:1.6mm 2.6mm;background:#fff}
.tuile .v{font-size:11pt;font-weight:700;line-height:1.15}
.tuile .v .sur{font-size:8.5pt;font-weight:400}
.tuile .l{font-size:7.5pt}
.tuile .p{font-size:6.8pt;color:#8A93A3}
h2{font-size:9.5pt;margin:4mm 0 1.8mm;color:#1B2B4B}
table.ues{width:100%;border-collapse:collapse;font-size:7.8pt}
table.ues th{text-align:left;font-size:6.8pt;text-transform:uppercase;letter-spacing:.04em;color:#475569;background:#F1F4F9;padding:1.4mm 1.8mm;border-bottom:.3mm solid #D8DCE4}
table.ues td{padding:1.3mm 1.8mm;border-bottom:.2mm solid #E4E7EC;vertical-align:middle}
table.ues tr{break-inside:avoid}
table.ues tr.bloc td{font-weight:700;font-size:7.8pt;padding:1mm 1.8mm}
table.ues td.ei{border-left:1mm solid #C9A227}
.n{text-align:center;white-space:nowrap}
.cote{display:inline-block;min-width:8mm;text-align:center;font-weight:700;border-radius:1mm;padding:.35mm 1mm;color:#fff;font-size:7.5pt}
.c-ok{background:#3E7D5E}.c-fav{background:#6B46C1}.c-na{background:#9D4A38}
.c-va{background:#fff;color:#2F6049;border:.45mm solid #3E7D5E}
.c-cours{background:#fff;color:#2F6FB0;border:.3mm solid #2F6FB0}
.m{display:block;font-size:6.3pt;color:#64748b;margin-top:.3mm}
.vide{color:#cbd5e1}
.gris{color:#8A93A3}
.etat{font-size:7.3pt}
.legende{font-size:6.8pt;color:#475569;margin-top:2mm;line-height:1.5}
/* L'ANNEXE : une page à elle, le schéma tourné d'un quart de tour pour tenir en largeur. */
.annexe{break-before:page;page-break-before:always;height:235mm;position:relative;overflow:hidden}
.tourne{position:absolute;top:0;left:0;width:235mm;transform-origin:top left;transform:translate(0,235mm) rotate(-90deg)}
.tourne svg{width:100%;height:auto;max-height:160mm;display:block;margin-top:2mm}
.legende-schema{font-size:6.8pt;color:#475569;margin:2mm 0;line-height:1.8}
.fleches{font-size:7.2pt;color:#334155;line-height:1.45;margin-top:2mm;border-left:.6mm solid #C9A84C;padding-left:2.5mm}
/* LA SIGNATURE : le bloc des attestations, tel quel — la protection fac-similé
   (lib/protectionSignature.js) le reconnaît et le filigrane au PDF, à l'aperçu et à l'envoi. */
:root{--sceau:url("${SCEAU_IIP}");--paraphe:url("${SIGNATURE_SOHET}")}
.cloture{display:grid;grid-template-columns:auto 1fr auto;grid-template-rows:auto auto;column-gap:14mm;align-items:end;margin-top:8mm;page-break-inside:avoid;break-inside:avoid}
.cloture .lieu{grid-column:2;grid-row:2;font-size:8.5pt;color:#334;text-align:center;padding-bottom:1mm}
.cloture .sceau,.cloture .paraphe{grid-row:1;height:20mm;background-repeat:no-repeat;background-position:center bottom;background-size:contain}
.cloture .sceau{grid-column:1;width:20mm;opacity:.92;background-image:var(--sceau)}
.cloture .paraphe{grid-column:3;width:46mm;background-image:var(--paraphe)}
.cloture .legende{grid-column:3;grid-row:2;text-align:center;border-top:.4pt solid #94a3b8;padding-top:1mm;width:46mm}
.cloture .qualite{font-size:8.5pt;color:#334}
.cloture .nom{font-size:9.5pt;font-weight:700;color:#1B2B4B;letter-spacing:.3px}`,
  });
  return { html, nom: `Bulletin_${e.nom}_${e.prenom || ''}_${annee}`, titre: 'Bulletin de parcours', etudiant: e, section };
}

/**
 * LES PIÈCES DU DOSSIER, EN NOMBRE (Charles, 1er octobre 2026 : « TOUT doit
 * pouvoir sortir du centre d'impression, et en grand nombre avec envoi direct.
 * Les annexes 1 et 2, c'est pour les étudiants en SLE »).
 *
 * Le lot de délibération ne connaît que des pièces PAR UNITÉ. Celles-ci sont
 * PAR ÉTUDIANT : le bulletin de parcours, et les deux annexes de l'Office des
 * Étrangers. Un document par pièce et par étudiant — jamais une enveloppe à
 * vingt noms, puisqu'on l'envoie.
 *
 * LES ANNEXES NE VONT QU'AUX ÉTUDIANTS EN SÉJOUR LIMITÉ AUX ÉTUDES : les autres
 * sont écartés, et NOMMÉS — un étudiant qui manque sans qu'on dise pourquoi est
 * un étudiant qu'on croit avoir servi. Ce qui est une appréciation de la
 * direction (motif de l'annexe 2, raisons d'un programme sous 54 crédits) reste
 * en pointillés, comme sur la pièce tirée seule.
 */
r.post('/pieces-dossier-lot', authRequired, async (req, res) => {
  const b = req.body || {};
  const annee = b.annee || anneeDeTravail(req);
  const ids = (Array.isArray(b.etudiants) ? b.etudiants : []).map(Number).filter(Boolean);
  const veut = { bulletin: b.bulletin === true, annexe1: b.annexe1 === true, annexe2: b.annexe2 === true };
  if (!ids.length) return res.status(400).json({ error: 'aucun étudiant coché' });
  if (!Object.values(veut).some(Boolean)) return res.status(400).json({ error: 'aucune pièce demandée' });
  const peutAnnexes = ['admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat'].includes(req.user?.role);
  if ((veut.annexe1 || veut.annexe2) && !peutAnnexes) {
    return res.status(403).json({ error: "Les annexes de l'Office des Étrangers sont réservées au secrétariat et à la direction." });
  }
  const { documentAnnexe1 } = await import('./annexe1.js');
  const { documentAnnexe2 } = await import('./annexe2.js');
  const permises = perimetre(req);
  const slug = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const documents = [], manques = [], horsSLE = [];
  for (const id of ids) {
    const e = db.prepare('SELECT id, nom, prenom, sejour_limite_etudes, section_rattachement FROM etudiant WHERE id = ?').get(id);
    if (!e) continue;
    if (permises) {
      const toutes = [...new Set([...sectionsDeLEtudiant(id, null).sections, ...(e.section_rattachement ? [e.section_rattachement] : [])])];
      if (toutes.length && !toutes.some(s => permises.includes(s))) continue;
    }
    const nomE = `${e.nom} ${e.prenom || ''}`.trim();
    const base = `${slug(e.nom)}_${slug(e.prenom)}_${String(annee).replace(/\W/g, '')}`;
    const pousser = (piece, d, opts, contenu) => documents.push({
      etudiant_id: e.id, etudiant: nomE, piece, contenu, nom: `${piece === 'bulletin' ? 'Bulletin' : piece === 'annexe1' ? 'Annexe1' : 'Annexe2'}_${base}`,
      html: d.html, ...opts });
    if (veut.bulletin) {
      try {
        const d = documentBulletin(e.id, annee);
        if (d.erreur) manques.push(`${nomE} — bulletin : ${d.erreur}`);
        else pousser('bulletin', d, { pagination: 'si-plusieurs', pied: true }, `Bulletin de parcours — ${annee}`);
      } catch (err) { manques.push(`${nomE} — bulletin : ${err.message}`); }
    }
    if (veut.annexe1 || veut.annexe2) {
      if (!Number(e.sejour_limite_etudes)) { horsSLE.push(nomE); continue; }
      if (veut.annexe1) {
        const d = documentAnnexe1({ etudiant_id: e.id, annee, date_document: b.date_document || undefined });
        if (d.erreur) manques.push(`${nomE} — annexe 1 : ${d.erreur}`);
        else pousser('annexe1', d, { pagination: 'jamais', pied: false }, `Annexe 1 — visa ou titre de séjour étudiant — ${annee}`);
      }
      if (veut.annexe2) {
        const d = documentAnnexe2({ etudiant_id: e.id, annee, date_document: b.date_document || undefined });
        if (d.erreur) manques.push(`${nomE} — annexe 2 : ${d.erreur}`);
        else pousser('annexe2', d, { pagination: 'jamais', pied: false }, `Annexe 2 — progrès des études — ${annee}`);
      }
    }
  }
  if (!documents.length) {
    return res.status(400).json({ error: horsSLE.length && !veut.bulletin
      ? "Aucun des étudiants cochés n'est en séjour limité aux études : les annexes 1 et 2 ne les concernent pas."
      : 'Aucune pièce produite.', manques, hors_sle: horsSLE });
  }
  res.json({ documents, manques, hors_sle: horsSLE });
});

/**
 * LA REVUE DES PAE (Charles et Marie, 1er octobre 2026 : « passer chaque
 * étudiant l'un après l'autre, voir le parcours, et si une inscription porte
 * un report, que cela soit visible — en un coup d'œil ; et imprimer tous les
 * parcours »). Maquette validée le même jour : le PAE de l'année COURS PAR
 * COURS — reporté d'office (etudiant_report_note), dispensé par une VA
 * partielle, ou à suivre —, une UE refusée l'an passé sans aucun report
 * signalée « à vérifier », et une case « PAE revu » qui garde qui l'a cochée.
 */
try {
  db.exec(`CREATE TABLE IF NOT EXISTS pae_revue (
    etudiant_id    INTEGER NOT NULL,
    annee_scolaire TEXT    NOT NULL,
    revu_le        TEXT    NOT NULL DEFAULT (datetime('now')),
    revu_par       TEXT,
    PRIMARY KEY (etudiant_id, annee_scolaire)
  )`);
} catch (e) { console.error('[pae_revue]', e.message); }
/* PLUS DE 60 ECTS, EN CONNAISSANCE DE CAUSE (Charles, 3 octobre 2026). Un
   programme qui dépasse une année à temps plein ne se refuse pas — il se
   valide après l'avoir vu : la validation exige une confirmation, et garde le
   nombre d'ECTS confirmé. Un an après, on sait que la charge a été regardée. */
try {
  const cols = db.prepare('PRAGMA table_info(pae_revue)').all().map(c => c.name);
  if (!cols.includes('ects_confirme')) db.exec('ALTER TABLE pae_revue ADD COLUMN ects_confirme INTEGER');
} catch (e) { console.error('[pae_revue ects]', e.message); }
const SEUIL_ECTS_PAE = 60;
function ectsDuPAE(etudId, annee) {
  return Number(db.prepare(`SELECT COALESCE(SUM((SELECT MAX(u.ects) FROM ue u WHERE u.ue_num = i.ue_num
      AND u.annee_scolaire = i.annee_scolaire)), 0) n FROM etudiant_inscription i
    WHERE i.etudiant_id = ? AND i.annee_scolaire = ?`).get(etudId, annee).n) || 0;
}

/* LA NATURE D'UNE DISPENSE DE COURS (2 octobre 2026) : un report de note, ou
   une VA / VAE / VAP / VAEP reprise sans dossier pour 2024-2025 et 2025-2026. */
try {
  const cols = db.prepare('PRAGMA table_info(etudiant_report_note)').all().map(c => c.name);
  if (cols.length && !cols.includes('nature')) db.exec('ALTER TABLE etudiant_report_note ADD COLUMN nature TEXT');
} catch (e) { console.error('[etudiant_report_note.nature]', e.message); }
/* Sur un COURS : VAP, VAEP ou dispense ; sur l'UE ENTIÈRE : VA ou VAE, posée
   cours par cours sur tous ses cours (Charles, 2 octobre 2026). */
const NATURES_REPRISE = ['VA', 'VAE', 'VAP', 'VAEP', 'DISPENSE'];
const DERNIERE_ANNEE_REPRISE = '2025-2026';

export function revuePAE(etudId, annee) {
  const e = db.prepare('SELECT id, nom, prenom, id_ecampus, section_rattachement FROM etudiant WHERE id = ?').get(etudId);
  if (!e) return null;
  const section = sectionRattachement(etudId, annee).section || e.section_rattachement || null;
  const refUe = db.prepare(`SELECT ue_nom, ue_niv, ects, COALESCE(is_epreuve_integree, 0) ei,
      COALESCE(ue_per_etudiants, 0) per_etud, COALESCE(ue_aut, 0) aut FROM ue WHERE ue_num = ?
      ORDER BY (annee_scolaire = ?) DESC, (section = ?) DESC, annee_scolaire DESC LIMIT 1`);
  const coursDe = db.prepare(`SELECT cours_code, MIN(cours_nom) cours_nom, MAX(COALESCE(cours_per, 0)) cours_per,
      MAX(COALESCE(is_stage, 0)) is_stage, MAX(ct_pp) ct_pp FROM cours WHERE ue_num = ? AND annee_scolaire = ? AND cours_code IS NOT NULL
      GROUP BY cours_code ORDER BY cours_code`);
  const inscr = db.prepare('SELECT DISTINCT ue_num FROM etudiant_inscription WHERE etudiant_id = ? AND annee_scolaire = ?')
    .all(etudId, annee).map(x => x.ue_num);
  const tentees = new Set(db.prepare(`SELECT DISTINCT ue_num FROM etudiant_inscription WHERE etudiant_id = ?
      AND annee_scolaire < ? AND resultat IN ('ajourne', 'refuse')`).all(etudId, annee).map(x => x.ue_num));
  const reports = new Map(), refuses = new Map();
  try {
    for (const r of db.prepare(`SELECT ue_num, cours_code, note, annee_origine, COALESCE(statut, 'accorde') statut,
        motif, decide_par, nature FROM etudiant_report_note
        WHERE etudiant_id = ? AND annee_scolaire = ? AND COALESCE(cible, 'cours') = 'cours'`).all(etudId, annee)) {
      (r.statut === 'accorde' ? reports : refuses).set(`${r.ue_num}|${r.cours_code}`, r);
    }
  } catch { /* table ancienne */ }
  /* LA NATURE DE LA DISPENSE SE NOMME (Charles, 2 octobre 2026) : VA ou VAE pour
     une dispense totale, VAP ou VAEP pour une partielle, Report pour un cours
     reporté. */
  const vaCours = new Map(), vaComplete = new Map();
  for (const v of db.prepare(`SELECT ue_num, type, cible, cible_detail, porte FROM etudiant_valorisation
      WHERE etudiant_id = ? AND annee_scolaire = ? AND ${vaRetenue()}
        AND decision_le IS NOT NULL`).all(etudId, annee)) {
    const vae = v.porte === 'vae';
    if (v.type === 'complete') vaComplete.set(v.ue_num, vae ? 'VAE' : 'VA');
    else if (v.type === 'partielle' && v.cible === 'cours') {
      for (const c of String(v.cible_detail || '').split(',').map(x => x.trim()).filter(Boolean)) vaCours.set(`${v.ue_num}|${c}`, vae ? 'VAEP' : 'VAP');
    }
  }
  /* UNE UNITÉ RÉUSSIE CETTE ANNÉE EST RÉUSSIE, faveur ou non (Charles,
     9 octobre 2026 : « une fois que l'UE est réussie, tu dois ajuster le PAE ;
     elle doit être indiquée comme réussie »). Le PAE ne lisait que les années
     ANTÉRIEURES : l'UE 333 délibérée en juin restait « au programme », ses
     cours « à suivre », et ses ECTS hors du total réussi. */
  const reussiesAnnee = new Set(db.prepare(`SELECT DISTINCT ue_num FROM etudiant_inscription
      WHERE etudiant_id = ? AND annee_scolaire = ? AND resultat = 'reussi'`).all(etudId, annee).map(x => x.ue_num));
  const faveurs = new Set();
  try {
    for (const f of db.prepare(`SELECT DISTINCT ue_num FROM deliberation_ajustement WHERE etudiant_id = ?
        AND annee_scolaire = ? AND action = 'faveur' AND portee = 'ue'`).all(etudId, annee)) faveurs.add(f.ue_num);
  } catch { /* table absente */ }
  const ues = inscr.map(n => {
    const u = refUe.get(n, annee, section) || {};
    let eligibles = [];
    try { eligibles = coursValidesAnterieurs(etudId, n, annee) || []; } catch { eligibles = []; }
    const cours = coursDe.all(n, annee).map(c => {
      const r = reports.get(`${n}|${c.cours_code}`);
      const statut = vaComplete.has(n) ? 'va' : r ? 'report' : vaCours.has(`${n}|${c.cours_code}`) ? 'va' : 'suivre';
      const el = eligibles.find(x => x.cours_code === c.cours_code);
      const rf = refuses.get(`${n}|${c.cours_code}`);
      const nature = statut === 'report' ? (r?.nature || 'Report')
        : statut === 'va' ? (vaComplete.get(n) || vaCours.get(`${n}|${c.cours_code}`) || 'VA') : null;
      return { code: c.cours_code, nom: c.cours_nom, per: Number(c.cours_per) || 0, stage: !!c.is_stage,
        z: String(c.ct_pp || '').toUpperCase() === 'Z', statut, nature,
        note: r ? r.note : null, annee_origine: r ? r.annee_origine : null, par: r ? r.decide_par : null,
        // Ce que Lucie sait du cours : réussi une année antérieure, avec quelle note.
        eligible: statut === 'suivre' && el ? { note: el.note_affichee ?? (el.note != null ? Math.round(el.note) : null), annee_origine: el.annee_origine } : null,
        refuse: statut === 'suivre' && rf ? { motif: rf.motif || null, par: rf.decide_par || null } : null };
    });
    // Une VA reprise sans dossier se range avec les VA, pas avec les reports.
    const estVA = c => c.statut === 'va' || (c.statut === 'report' && c.nature && c.nature !== 'Report');
    const nRep = cours.filter(c => c.statut === 'report' && !estVA(c)).length;
    const nVa = cours.filter(estVA).length;
    const reussie = reussiesAnnee.has(n);
    if (reussie) for (const c of cours) if (c.statut === 'suivre') c.statut = 'acquis';
    const etat = vaComplete.has(n) ? 'dispensee'
      : reussie ? (faveurs.has(n) ? 'faveur' : 'reussie')
      : nRep || nVa ? 'partielle'
        : tentees.has(n) ? 'reprendre' : 'programme';
    /* LES PÉRIODES DE L'ÉTUDIANT, ET ELLES SEULES (Charles, 6 octobre 2026 :
       « dans le PAE, il faut mettre les périodes étudiant ; sinon ils vont
       dire qu'on a plus d'heures que prévu »). Le cours garde ses périodes ;
       l'autonomie a SA ligne ; un stage porte les périodes que l'étudiant y
       passe, non les vingt d'encadrement du professeur. Le total de l'unité
       est le plus grand de ce que dit le dossier et de cours + autonomie —
       les deux conventions coexistent en base (UE 68 : 120 autonomie
       comprise ; UE 65 : 80 sans elle) — et les lignes y retombent toujours. */
    const aut = Number(u.aut) || 0;
    // Les activités Z restent affichées comme avant, hors du total : savoir si
    // elles entrent dans les périodes de l'étudiant n'est pas encore tranché.
    const perCours = cours.filter(c => !c.z).reduce((t, c) => t + c.per, 0);
    const total = Math.max(Number(u.per_etud) || 0, perCours + aut);
    let reste = total - perCours - aut;
    const stage = cours.find(c => c.stage);
    if (reste > 0 && stage) { stage.per_encadrement = stage.per; stage.per += reste; reste = 0; }
    return { ue_num: n, ue_nom: u.ue_nom || `UE ${n}`, niv: String(u.ue_niv || '').toUpperCase(), ects: Number(u.ects) || 0,
      periodes: total, autonomie: aut, hors_cours: reste,
      ei: !!u.ei, etat, cours, reports: nRep, va: nVa,
      nature_totale: vaComplete.get(n)
        || (cours.length && cours.every(c => c.statut === 'report' && ['VA', 'VAE'].includes(c.nature)) ? cours[0].nature : null),
      nature_partielle: [...new Set(cours.filter(estVA).map(c => c.nature))].join(' / ') || null };
  }).sort((a, b) => (a.ei - b.ei) || rangBloc(a.niv) - rangBloc(b.niv) || a.ue_num - b.ue_num);

  const acquises = db.prepare(`SELECT DISTINCT ue_num FROM etudiant_inscription WHERE etudiant_id = ? AND resultat = 'reussi'
      AND annee_scolaire <= ?`).all(etudId, annee).map(x => x.ue_num);
  for (const v of db.prepare(`SELECT DISTINCT ue_num FROM etudiant_valorisation WHERE etudiant_id = ? AND type = 'complete'
      AND ${vaRetenue()} AND annee_scolaire < ?`).all(etudId, annee)) acquises.push(v.ue_num);
  const dejaAcquises = new Map(db.prepare(`SELECT ue_num, MIN(annee_scolaire) a FROM etudiant_inscription WHERE etudiant_id = ?
      AND resultat = 'reussi' AND annee_scolaire < ? GROUP BY ue_num`).all(etudId, annee).map(x => [x.ue_num, x.a]));
  for (const u of ues) if (dejaAcquises.has(u.ue_num)) u.deja = dejaAcquises.get(u.ue_num);
  const ectsAcquis = [...new Set(acquises)].reduce((t, n) => t + (Number(refUe.get(n, annee, section)?.ects) || 0), 0);
  const tousCours = ues.flatMap(u => u.cours);
  const aSuivre = tousCours.filter(c => c.statut === 'suivre');
  const revu = db.prepare('SELECT revu_le, revu_par, ects_confirme FROM pae_revue WHERE etudiant_id = ? AND annee_scolaire = ?').get(etudId, annee) || null;
  const niveau = niveauEtudiant(etudId, annee);
  /* CE QUI PEUT ENTRER AU PAE : les unités du cursus qui n'y sont pas, avec
     ce que le moteur en dit (accessible, bloquée…). L'ajout lui-même passe par
     la porte unique — pae-valider, ecrireProgramme() —, qui juge et demande
     un motif pour toute dérogation. */
  let autres = [];
  try {
    const g = donneesCapitalisation(etudId, annee, section);
    const dedans = new Set(inscr);
    autres = (g.nodes || []).filter(n => !dedans.has(n.ue_num) && n.statut !== 'acquise')
      .map(n => ({ ue_num: n.ue_num, ue_nom: n.ue_nom, niv: String(n.ue_niv || '').toUpperCase(), statut: n.statut || null,
        ei: !!n.epreuve_integree }))
      .sort((a, b) => rangBloc(a.niv) - rangBloc(b.niv) || a.ue_num - b.ue_num);
  } catch { autres = []; }
  return {
    etudiant: { id: e.id, nom: e.nom, prenom: e.prenom, id_ecampus: e.id_ecampus, section, niveau: niveau.niveau, niveau_libelle: niveau.libelle },
    annee, ues, autres,
    chiffres: {
      ects_acquis: ectsAcquis, nb_ue: ues.length, ects_pae: ues.reduce((t, u) => t + u.ects, 0),
      cours_reportes: tousCours.filter(c => c.statut === 'report' && (!c.nature || c.nature === 'Report')).length,
      ue_avec_report: ues.filter(u => u.reports).length,
      cours_va: tousCours.filter(c => c.statut === 'va' || (c.statut === 'report' && c.nature && c.nature !== 'Report')).length,
      cours_a_suivre: aSuivre.length, periodes_a_suivre: aSuivre.reduce((t, c) => t + c.per, 0),
      // Les périodes étudiant du PAE : toute l'UE, autonomie comprise.
      periodes_pae: ues.reduce((t, u) => t + (u.periodes || 0), 0),
      // LA MOYENNE DU PARCOURS, celle du bulletin : les unités réussies,
      // pondérées par leurs périodes étudiant ; elle seule garde ses décimales.
      moyenne: (() => {
        let num = 0, den = 0;
        for (const x of db.prepare(`SELECT i.ue_num, i.points FROM etudiant_inscription i WHERE i.etudiant_id = ?
            AND i.resultat = 'reussi' AND i.points IS NOT NULL AND i.annee_scolaire < ?`).all(etudId, annee)) {
          const p = Number(refUe.get(x.ue_num, annee, section)?.per_etud) || 0;
          if (!p) continue;
          num += Number(x.points) * p; den += p;
        }
        return den ? Math.round((num / den) * 100) / 100 : null;
      })(),
    },
    alertes: [
      ...ues.filter(u => dejaAcquises.has(u.ue_num)).map(u => ({ ue_num: u.ue_num,
        texte: `UE ${u.ue_num} déjà acquise en ${dejaAcquises.get(u.ue_num)} — elle figure de nouveau au PAE.` })),
      ...ues.filter(u => u.etat === 'reprendre').map(u => ({ ue_num: u.ue_num,
        texte: `UE ${u.ue_num} reprise après un échec : aucun cours reporté, toute l'unité est à suivre.` })),
    ],
    revu,
  };
}

/* LES REPORTS S'ENCODENT DANS LA REVUE (Charles, 1er octobre 2026 : « je veux
   voir directement les reports, mais je veux surtout pouvoir les encoder »).
   Même écriture que le report d'office : une ligne `etudiant_report_note`
   accordée, et la note de chaque acquis du cours recopiée dans l'année sous
   `origine = 'report:<année>'` — la délibération, Mes cours et les pièces la
   lisent sans rien savoir du report.
   · Lucie connaît le cours réussi avant : ses notes d'acquis sont reprises.
   · Elle ne le connaît pas (notes jamais importées) : la note du cours est
     saisie, et vaut pour chacun de ses acquis.
   Une note déjà encodée cette année pour un acquis n'est jamais écrasée. */
/* Le geste « etudiants.reports » (lib/gestes.js). */
r.put('/:id/revue-pae/report', authRequired, gesteRequis('etudiants.reports'), (req, res) => {
  const id = Number(req.params.id);
  if (!etudiantPermis(req, res, id)) return;
  const annee = req.body?.annee || anneeDeTravail(req);
  const ue = Number(req.body?.ue_num);
  const code = String(req.body?.cours_code || '');
  if (!ue || !code) return res.status(400).json({ error: 'unité et cours requis' });
  if (!db.prepare('SELECT 1 FROM etudiant_inscription WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?').get(id, annee, ue)) {
    return res.status(409).json({ error: `L'UE ${ue} n'est pas au PAE ${annee} : il n'y a rien à reporter.` });
  }
  const structure = structureUE(ue, annee);
  const co = structure.find(c => c.cours_code === code);
  if (!co) return res.status(404).json({ error: `Le cours ${code} n'appartient pas à l'UE ${ue} en ${annee}.` });
  let el = null;
  try { el = (coursValidesAnterieurs(id, ue, annee) || []).find(x => x.cours_code === code) || null; } catch { el = null; }
  /* UNE VA REPRISE SANS DOSSIER (Charles, 2 octobre 2026 : « il en manque pour
     24-25 et 25-26 ; sans encoder les dossiers, on doit pouvoir mettre
     VA/VAE/VAP en regard du cours, et ça met la note à 10 »). Réservé aux
     années antérieures à 2026-2027 : à partir de là, une valorisation passe
     par son dossier et son circuit. */
  const nature = req.body?.nature ? String(req.body.nature).toUpperCase() : null;
  if (nature && !NATURES_REPRISE.includes(nature)) return res.status(400).json({ error: 'Nature inconnue : VA, VAE (UE entière), VAP, VAEP ou dispense (cours).' });
  if (nature) {
    const o = String(req.body?.annee_origine || '');
    if (!/^\d{4}-\d{4}$/.test(o) || o > DERNIERE_ANNEE_REPRISE) {
      return res.status(400).json({ error: `Une VA sans dossier ne se pose que pour ${DERNIERE_ANNEE_REPRISE} et avant ; à partir de 2026-2027, elle passe par le dossier de valorisation.` });
    }
    req.body.note = 10;
  }
  const saisie = req.body?.note != null && req.body.note !== '';
  let note, origine, notesAA;
  if (saisie || !el) {
    note = Number(String(req.body?.note ?? '').replace(',', '.'));
    origine = String(req.body?.annee_origine || '');
    if (!Number.isFinite(note) || note < 10 || note > 20) {
      return res.status(400).json({ error: 'La note reportée est celle d’un cours réussi : entre 10 et 20.' });
    }
    if (!/^\d{4}-\d{4}$/.test(origine) || origine >= annee) {
      return res.status(400).json({ error: "L'année d'origine est une année antérieure, au format 2025-2026." });
    }
    notesAA = (co.aas || []).map(a => ({ aa_code: a.aa_code, note }));
  } else {
    note = el.note ?? el.note_affichee; origine = el.annee_origine;
    notesAA = (el.aas || []).filter(a => (co.aas || []).some(x => x.aa_code === a.aa_code));
  }
  const qui = req.user?.nom || req.user?.email || null;
  const motif = nature ? `${nature} reprise sans dossier (${origine}) — dispense du cours à 10/20, revue des PAE`
    : saisie || !el ? `report encodé en revue des PAE — note de cours ${note}/20 (${origine})` : 'report accordé en revue des PAE';
  const reelle = db.prepare(`SELECT 1 FROM etudiant_note_detail WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?
      AND type = 'aa' AND (cours_code = ? OR cours_code IS NULL) AND (code = ? OR code LIKE '%|' || ?)
      AND (origine IS NULL OR origine NOT LIKE 'report:%') LIMIT 1`);
  const insNote = db.prepare(`INSERT INTO etudiant_note_detail (etudiant_id, annee_scolaire, ue_num, type, code, cours_code, points, origine)
      VALUES (?,?,?, 'aa', ?,?,?,?) ON CONFLICT(etudiant_id, annee_scolaire, ue_num, type, code) DO NOTHING`);
  db.transaction(() => {
    const ligne = db.prepare(`SELECT id FROM etudiant_report_note WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?
        AND cible = 'cours' AND cours_code = ? AND aa_code IS NULL`).get(id, annee, ue, code);
    if (ligne) {
      // Repasser par « refusé » efface les notes recopiées (déclencheur) : on repart propre.
      db.prepare(`UPDATE etudiant_report_note SET statut = 'refuse' WHERE id = ?`).run(ligne.id);
      db.prepare(`UPDATE etudiant_report_note SET statut = 'accorde', note = ?, annee_origine = ?, decision_ce = ?,
          motif = NULL, decide_le = datetime('now'), decide_par = ?, nature = ? WHERE id = ?`).run(note, origine, motif, qui, nature, ligne.id);
    } else {
      db.prepare(`INSERT INTO etudiant_report_note (etudiant_id, annee_scolaire, ue_num, cible, cours_code, aa_code, note,
          annee_origine, statut, decision_ce, decide_le, decide_par, nature) VALUES (?,?,?, 'cours', ?, NULL, ?, ?, 'accorde', ?, datetime('now'), ?, ?)`)
        .run(id, annee, ue, code, note, origine, motif, qui, nature);
    }
    for (const a of notesAA) {
      if (a.note == null || reelle.get(id, annee, ue, code, a.aa_code, a.aa_code)) continue;
      insNote.run(id, annee, ue, `s1|${code}|${a.aa_code}`, code, a.note, `report:${origine}`);
    }
  })();
  res.json({ ok: true, revue: revuePAE(id, annee) });
});

/* LA VA OU VAE D'UNE UE ENTIÈRE, SANS DOSSIER (2024-2025 et 2025-2026) : chaque
   cours de l'unité est dispensé à 10/20 sous cette nature — la délibération
   lit l'UE comme acquise à 10. Une note réellement encodée n'est jamais écrasée. */
r.put('/:id/revue-pae/va-ue', authRequired, gesteRequis('etudiants.reports'), (req, res) => {
  const id = Number(req.params.id);
  if (!etudiantPermis(req, res, id)) return;
  const annee = req.body?.annee || anneeDeTravail(req);
  const ue = Number(req.body?.ue_num);
  const nature = String(req.body?.nature || '').toUpperCase();
  const origine = String(req.body?.annee_origine || '');
  if (!['VA', 'VAE'].includes(nature)) return res.status(400).json({ error: "Sur l'UE entière : VA ou VAE." });
  if (!/^\d{4}-\d{4}$/.test(origine) || origine > DERNIERE_ANNEE_REPRISE) {
    return res.status(400).json({ error: `Une VA sans dossier ne se pose que pour ${DERNIERE_ANNEE_REPRISE} et avant ; à partir de 2026-2027, elle passe par le dossier de valorisation.` });
  }
  if (!db.prepare('SELECT 1 FROM etudiant_inscription WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?').get(id, annee, ue)) {
    return res.status(409).json({ error: `L'UE ${ue} n'est pas au PAE ${annee}.` });
  }
  const structure = structureUE(ue, annee);
  if (!structure.length) return res.status(409).json({ error: `L'UE ${ue} n'a aucun cours encodé en ${annee}.` });
  const qui = req.user?.nom || req.user?.email || null;
  const motif = `${nature} de l'UE entière, reprise sans dossier (${origine}) — dispense à 10/20, revue des PAE`;
  const reelle = db.prepare(`SELECT 1 FROM etudiant_note_detail WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?
      AND type = 'aa' AND (cours_code = ? OR cours_code IS NULL) AND (code = ? OR code LIKE '%|' || ?)
      AND (origine IS NULL OR origine NOT LIKE 'report:%') LIMIT 1`);
  const insNote = db.prepare(`INSERT INTO etudiant_note_detail (etudiant_id, annee_scolaire, ue_num, type, code, cours_code, points, origine)
      VALUES (?,?,?, 'aa', ?,?,?,?) ON CONFLICT(etudiant_id, annee_scolaire, ue_num, type, code) DO NOTHING`);
  db.transaction(() => {
    for (const co of structure) {
      const ligne = db.prepare(`SELECT id FROM etudiant_report_note WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?
          AND cible = 'cours' AND cours_code = ? AND aa_code IS NULL`).get(id, annee, ue, co.cours_code);
      if (ligne) {
        db.prepare(`UPDATE etudiant_report_note SET statut = 'refuse' WHERE id = ?`).run(ligne.id);
        db.prepare(`UPDATE etudiant_report_note SET statut = 'accorde', note = 10, annee_origine = ?, decision_ce = ?,
            motif = NULL, decide_le = datetime('now'), decide_par = ?, nature = ? WHERE id = ?`).run(origine, motif, qui, nature, ligne.id);
      } else {
        db.prepare(`INSERT INTO etudiant_report_note (etudiant_id, annee_scolaire, ue_num, cible, cours_code, aa_code, note,
            annee_origine, statut, decision_ce, decide_le, decide_par, nature) VALUES (?,?,?, 'cours', ?, NULL, 10, ?, 'accorde', ?, datetime('now'), ?, ?)`)
          .run(id, annee, ue, co.cours_code, origine, motif, qui, nature);
      }
      for (const a of co.aas || []) {
        if (reelle.get(id, annee, ue, co.cours_code, a.aa_code, a.aa_code)) continue;
        insNote.run(id, annee, ue, `s1|${co.cours_code}|${a.aa_code}`, co.cours_code, 10, `report:${origine}`);
      }
    }
  })();
  res.json({ ok: true, revue: revuePAE(id, annee) });
});

/* RETIRER, C'EST REFUSER : supprimer la ligne ferait reposer le report d'office
   au prochain PAE enregistré. Refusé, il ne l'est plus jamais ; ses notes
   recopiées s'effacent (déclencheur). */
r.delete('/:id/revue-pae/report', authRequired, gesteRequis('etudiants.reports'), (req, res) => {
  const id = Number(req.params.id);
  if (!etudiantPermis(req, res, id)) return;
  const annee = req.query.annee || anneeDeTravail(req);
  const ue = Number(req.query.ue_num), code = String(req.query.cours_code || '');
  const qui = req.user?.nom || req.user?.email || null;
  const n = db.prepare(`UPDATE etudiant_report_note SET statut = 'refuse', motif = ?, decide_le = datetime('now'), decide_par = ?
      WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ? AND cours_code = ? AND COALESCE(cible, 'cours') = 'cours'`)
    .run('retiré en revue des PAE — le cours est à suivre', qui, id, annee, ue, code).changes;
  if (!n) return res.status(404).json({ error: 'Aucun report sur ce cours.' });
  res.json({ ok: true, revue: revuePAE(id, annee) });
});

/* LA SYNTHÈSE DE LA LISTE, pour filtrer la revue sans ouvrir 833 dossiers :
   reports, alertes, revu — en quelques requêtes. */
r.post('/revue-pae/synthese', authRequired, (req, res) => {
  const annee = req.body?.annee || anneeDeTravail(req);
  const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter(Boolean);
  const out = {};
  for (const id of ids) out[id] = { reports: 0, deja: 0, reprendre: 0, revu: false, pae: 0 };
  const dans = id => out[id];
  for (const x of db.prepare(`SELECT etudiant_id id, COUNT(DISTINCT ue_num) n FROM etudiant_inscription WHERE annee_scolaire = ? GROUP BY 1`).all(annee)) if (dans(x.id)) out[x.id].pae = x.n;
  try {
    for (const x of db.prepare(`SELECT etudiant_id id, COUNT(*) n FROM etudiant_report_note WHERE annee_scolaire = ?
        AND COALESCE(statut,'accorde') = 'accorde' GROUP BY 1`).all(annee)) if (dans(x.id)) out[x.id].reports = x.n;
  } catch { /* */ }
  for (const x of db.prepare(`SELECT i.etudiant_id id, COUNT(*) n FROM etudiant_inscription i WHERE i.annee_scolaire = ?
      AND EXISTS (SELECT 1 FROM etudiant_inscription p WHERE p.etudiant_id = i.etudiant_id AND p.ue_num = i.ue_num
        AND p.annee_scolaire < ? AND p.resultat = 'reussi') GROUP BY 1`).all(annee, annee)) if (dans(x.id)) out[x.id].deja = x.n;
  for (const x of db.prepare(`SELECT i.etudiant_id id, COUNT(*) n FROM etudiant_inscription i WHERE i.annee_scolaire = ?
      AND EXISTS (SELECT 1 FROM etudiant_inscription p WHERE p.etudiant_id = i.etudiant_id AND p.ue_num = i.ue_num
        AND p.annee_scolaire < ? AND p.resultat IN ('ajourne','refuse'))
      AND NOT EXISTS (SELECT 1 FROM etudiant_report_note r WHERE r.etudiant_id = i.etudiant_id AND r.ue_num = i.ue_num
        AND r.annee_scolaire = i.annee_scolaire AND COALESCE(r.statut,'accorde') = 'accorde') GROUP BY 1`).all(annee, annee)) if (dans(x.id)) out[x.id].reprendre = x.n;
  for (const x of db.prepare('SELECT etudiant_id id FROM pae_revue WHERE annee_scolaire = ?').all(annee)) if (dans(x.id)) out[x.id].revu = true;
  res.json(out);
});

r.get('/:id/revue-pae', authRequired, (req, res) => {
  const id = Number(req.params.id);
  if (!etudiantPermis(req, res, id)) return;
  const d = revuePAE(id, req.query.annee || anneeDeTravail(req));
  if (!d) return res.status(404).json({ error: 'étudiant introuvable' });
  res.json(d);
});

/* LA VALIDATION DE LA REVUE, LUE PAR LA FICHE (2 octobre 2026 : « une fois
   validé, le message sur la fiche est : ce PAE a été validé le … par … »). */
r.get('/:id/revue-pae/revu', authRequired, (req, res) => {
  const id = Number(req.params.id);
  if (!etudiantPermis(req, res, id)) return;
  const annee = req.query.annee || anneeDeTravail(req);
  res.json({ revu: db.prepare('SELECT revu_le, revu_par, ects_confirme FROM pae_revue WHERE etudiant_id = ? AND annee_scolaire = ?').get(id, annee) || null });
});

/* CELUI QUI COCHE EST CELUI QUI SIGNE : le nom vient de la session, jamais d'un champ. */
r.put('/:id/revue-pae/revu', authRequired, gesteRequis('etudiants.pae_revu'), (req, res) => {
  const id = Number(req.params.id);
  if (!etudiantPermis(req, res, id)) return;
  const annee = req.body?.annee || anneeDeTravail(req);
  if (req.body?.revu === false) {
    db.prepare('DELETE FROM pae_revue WHERE etudiant_id = ? AND annee_scolaire = ?').run(id, annee);
    return res.json({ ok: true, revu: null });
  }
  const qui = req.user?.nom || req.user?.email || null;
  const ects = ectsDuPAE(id, annee);
  if (ects > SEUIL_ECTS_PAE && Number(req.body?.plus60) !== ects) {
    return res.status(409).json({ plus60: ects,
      error: `Programme de ${ects} ECTS, au-delà de ${SEUIL_ECTS_PAE} : la validation demande de le confirmer en connaissance de cause.` });
  }
  db.prepare(`INSERT INTO pae_revue (etudiant_id, annee_scolaire, revu_par, ects_confirme) VALUES (?, ?, ?, ?)
    ON CONFLICT(etudiant_id, annee_scolaire) DO UPDATE SET revu_le = datetime('now'), revu_par = excluded.revu_par,
      ects_confirme = excluded.ects_confirme`)
    .run(id, annee, qui, ects > SEUIL_ECTS_PAE ? ects : null);
  res.json({ ok: true, revu: db.prepare('SELECT revu_le, revu_par, ects_confirme FROM pae_revue WHERE etudiant_id = ? AND annee_scolaire = ?').get(id, annee) });
});

/* L'IMPRESSION DES PARCOURS : une page par étudiant, sans le schéma (Charles :
   « sans schéma pour commencer »). Un document pour la pile, ou un par
   étudiant pour l'envoi. */
function pageRevue(d, esc) {
  /* LA PIÈCE SUIT L'ÉCRAN (Charles, 2 octobre 2026 : « alignement mauvais,
     mise en page peu jolie ») : l'identité sur une ligne, le train des
     chiffres en tuiles, une bande par bloc qui porte sa couleur, et un tableau
     sans trait vertical — les filets séparent, l'alignement fait le reste. */
  const couleurBloc = { BA1: '#E8890C', BA2: '#7FB3D5', BA3: '#1B2B4B' };
  const etatUE = { dispensee: 'dispensée', partielle: 'reprise partielle', reprendre: 'à reprendre', programme: 'au programme' };
  const court = a => String(a || '').replace(/^20(\d\d)-20(\d\d)$/, '$1-$2');
  const groupes = [];
  for (const u of d.ues) {
    const k = u.ei ? 'Épreuve intégrée' : (u.niv || '—');
    let g = groupes.find(x => x.k === k);
    if (!g) groupes.push(g = { k, ei: u.ei, ues: [] });
    g.ues.push(u);
  }
  /* DES COLONNES, PAS DES PHRASES (Charles, 3 octobre 2026 : « pas clair du
     tout à la lecture ; si un cours est reporté, c'est une dispense ; il faut
     des colonnes »). Chaque cours de chaque UE a sa ligne ; la colonne
     « Dispense » porte un code — RP report de note, VAP/VAEP valorisation
     partielle, D dispense, VA/VAE l'unité entière —, la colonne « Note » la
     note qui vaut (celle reportée, ou 10/20 pour une dispense), avec son
     année d'origine. Une ligne sans code est un cours à suivre. */
  const codeDe = c => {
    if (c.statut === 'suivre' || c.statut === 'acquis') return null;
    const n = String(c.nature || '');
    if (c.statut === 'report' && (!n || n === 'Report')) return 'RP';
    if (n.toUpperCase() === 'DISPENSE') return 'D';
    return n || 'VA';
  };
  let lignes = '';
  for (const g of groupes) {
    const fond = g.ei ? '#C9A227' : (couleurBloc[g.k] || '#64748b');
    lignes += `<tr class="bande"><td colspan="6" style="background:${fond};color:${g.k === 'BA2' ? '#1B2B4B' : '#fff'}">${esc(g.k)}<span>${g.ues.length} UE · ${g.ues.reduce((t, u) => t + u.ects, 0)} ECTS</span></td></tr>`;
    for (const u of g.ues) {
      const mention = u.nature_totale ? '' : u.etat === 'faveur' ? 'réussie par faveur' : u.etat === 'reussie' ? 'réussie'
        : u.etat === 'reprendre' ? 'à reprendre' : u.etat === 'partielle' ? 'reprise partielle' : '';
      lignes += `<tr class="ue"><td class="num">${u.ue_num}</td><td>${esc(u.ue_nom)}${mention ? ` <span class="mention">${mention}</span>` : ''}`
        + `${u.deja ? `<div class="alerte">déjà acquise en ${esc(u.deja)} — à vérifier</div>` : ''}</td>`
        + `<td class="n">${u.ects || ''}</td><td class="n">${u.periodes || ''}</td>`
        + `<td class="c">${u.nature_totale ? `<span class="code code-va">${esc(u.nature_totale)}</span>` : ''}</td><td class="n"></td></tr>`;
      for (const c of u.cours) {
        const code = u.nature_totale ? null : codeDe(c);
        const note = !code ? '' : code === 'RP'
          ? (c.note != null ? `${Math.round(c.note)}/20` : 'reprise')
          : '10/20';
        const origine = code && c.annee_origine ? `<span class="orig">${esc(court(c.annee_origine))}</span>` : '';
        lignes += `<tr class="cours${code || u.nature_totale ? ' dispense' : ''}"><td class="num">${esc(c.code)}</td><td>${esc(c.nom || '')}`
          + `${c.per_encadrement ? ` <span class="mention">périodes de l'étudiant ; ${c.per_encadrement} d'encadrement</span>` : ''}</td>`
          + `<td></td><td class="n">${c.per || ''}</td>`
          + `<td class="c">${code ? `<span class="code">${esc(code)}</span>` : ''}</td><td class="n">${note}${origine}</td></tr>`;
      }
      if (u.autonomie) {
        lignes += `<tr class="cours${u.nature_totale ? ' dispense' : ''}"><td class="num"></td><td><i>Part d'autonomie</i></td>`
          + `<td></td><td class="n">${u.autonomie}</td><td class="c"></td><td class="n"></td></tr>`;
      }
      if (u.hors_cours) {
        lignes += `<tr class="cours${u.nature_totale ? ' dispense' : ''}"><td class="num"></td><td><i>Travail de l'étudiant hors cours</i></td>`
          + `<td></td><td class="n">${u.hors_cours}</td><td class="c"></td><td class="n"></td></tr>`;
      }
    }
  }
  const e = d.etudiant, ch = d.chiffres;
  const moy = ch.moyenne != null ? String(ch.moyenne.toFixed(2)).replace('.', ',') : '—';
  const tuile = (v, l, rail = '#1B2B4B') => `<div class="tuile" style="border-left-color:${rail}"><b>${v}</b><span>${l}</span></div>`;
  const nDeja = d.ues.filter(u => u.deja).length;
  return `<div class="revue">
    <div class="ident"><div><div class="nom">${esc(String(e.nom || '').toUpperCase())} ${esc(e.prenom || '')}</div>
      <div class="mat">${esc(e.id_ecampus || '')}</div></div>
      <div class="sec">${esc(e.section || '')}${e.niveau_libelle ? ` · ${esc(e.niveau_libelle)}` : ''}</div></div>
    <div class="train">
      ${tuile(ch.ects_pae, 'ECTS au PAE')}
      ${tuile(`${ch.nb_ue} UE`, `${ch.periodes_pae} périodes étudiant`)}
      ${tuile(ch.cours_reportes, "cours reportés d'office")}
      ${ch.cours_va ? tuile(ch.cours_va, 'cours dispensés') : ''}
      ${tuile(ch.ects_acquis, 'ECTS réussis', '#3E7D5E')}
      ${tuile(moy, 'moyenne du parcours')}
    </div>
    ${nDeja ? `<div class="encadre">${nDeja} UE déjà acquise${nDeja > 1 ? 's' : ''} remise${nDeja > 1 ? 's' : ''} au PAE — à vérifier.</div>` : ''}
    <table class="pae"><colgroup><col style="width:14mm"><col><col style="width:11mm"><col style="width:11mm"><col style="width:17mm"><col style="width:22mm"></colgroup>
    <thead><tr><th>Code</th><th>Intitulé</th><th class="n">ECTS</th><th class="n">Pér.</th><th class="c">Dispense</th><th class="n">Note</th></tr></thead>
    <tbody>${lignes || '<tr><td colspan="6">Aucune UE au PAE de cette année.</td></tr>'}</tbody></table>
    <p class="pied-revue"><b>RP</b> report de note · <b>VAP</b> / <b>VAEP</b> valorisation partielle (cours) · <b>D</b> dispense · <b>VA</b> / <b>VAE</b> unité entière valorisée. Un cours sans code est à suivre ; une dispense vaut 10/20.<br>
      Les périodes sont celles de l'étudiant. L'établissement est libre de répartir l'autonomie dans les cours de l'UE ou d'organiser des activités annexes.</p>
    ${d.revu ? `<div class="valide">PAE validé le ${esc(String(d.revu.revu_le).slice(0, 10).split('-').reverse().join('/'))} par ${esc(d.revu.revu_par || '')}.</div>` : ''}
  </div>`;
}
const STYLE_REVUE = `
.revue+.revue{break-before:page;page-break-before:always}
.revue .ident{display:flex;justify-content:space-between;align-items:flex-end;gap:6mm;padding-bottom:2mm;border-bottom:.25mm solid #D8DCE4;margin-bottom:3mm}
.revue .ident .nom{font-size:13pt;font-weight:700;color:#1B2B4B;line-height:1.1}
.revue .ident .mat{font-size:8pt;color:#6e6e73;margin-top:.6mm}
.revue .ident .sec{font-size:10pt;font-weight:700;color:#1B2B4B}
.revue .train{display:flex;gap:2mm;margin-bottom:3mm}
.revue .tuile{flex:1;border:.3mm solid #D8DCE4;border-left:1mm solid #1B2B4B;border-radius:0 2.6mm 2.6mm 0;padding:1.6mm 2.4mm;background:#fff}
.revue .tuile b{display:block;font-size:12pt;color:#1B2B4B;line-height:1.1}
.revue .tuile span{display:block;font-size:7.5pt;color:#6e6e73;margin-top:.4mm}
.revue .encadre{border:.3mm solid #D8DCE4;border-left:1mm solid #B45309;border-radius:0 2.6mm 2.6mm 0;padding:1.6mm 2.4mm;font-size:8.5pt;margin-bottom:3mm}
.revue table.pae{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8.5pt}
.revue table.pae th,.revue table.pae td{border:0;border-bottom:.2mm solid #E4E7EC;padding:1.3mm 2mm;vertical-align:baseline;text-align:left}
.revue table.pae th{background:#F1F4F9;font-size:7pt;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#475569;border-bottom:.3mm solid #D8DCE4}
.revue table.pae .n{text-align:right;font-variant-numeric:tabular-nums}
.revue table.pae .num{font-variant-numeric:tabular-nums}
.revue table.pae tr{break-inside:avoid}
.revue table.pae tr.bande td{font-weight:700;font-size:8pt;padding:1.2mm 2mm;border-bottom:0;letter-spacing:.03em}
.revue table.pae tr.bande td span{float:right;font-weight:600;font-size:7.5pt;opacity:.9}
.revue table.pae tr.ue td{font-weight:700;color:#1B2B4B}
.revue table.pae tr.ue td.st{font-weight:500;color:#334155}
.revue table.pae tr.cours td{font-size:8pt;color:#475569;padding-top:.9mm;padding-bottom:.9mm}
.revue table.pae tr.cours td.num{padding-left:5mm;color:#6e6e73}
.revue table.pae .c{text-align:center}
.revue table.pae .code{display:inline-block;min-width:8mm;padding:.2mm 1.2mm;border-radius:.8mm;background:#1B2B4B;color:#fff;font-weight:700;font-size:7.5pt;text-align:center}
.revue table.pae .code-va{background:#fff;color:#2F6049;border:.45mm solid #3E7D5E}
.revue table.pae tr.cours.dispense td{color:#1B2B4B}
.revue table.pae .orig{display:inline-block;margin-left:1.2mm;font-size:7pt;color:#6e6e73}
.revue table.pae .mention{font-weight:500;font-size:7.5pt;color:#6e6e73;margin-left:1.5mm}
.revue table.pae .rep{color:#3E7D5E}
.revue table.pae .alerte{font-weight:500;font-size:7.5pt;color:#B45309;margin-top:.4mm}
.revue .pied-revue{font-size:7.5pt;color:#64748b;margin-top:2mm}
.revue .valide{margin-top:2mm;border:.3mm solid #D8DCE4;border-left:1mm solid #3E7D5E;border-radius:0 2.6mm 2.6mm 0;padding:1.6mm 2.4mm;font-size:8.5pt}`;

r.post('/revue-pae/document', authRequired, (req, res) => {
  const annee = req.body?.annee || anneeDeTravail(req);
  const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter(Boolean).slice(0, 800);
  if (!ids.length) return res.status(400).json({ error: 'aucun étudiant' });
  const esc = x => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const permises = perimetre(req);
  const pages = [];
  for (const id of ids) {
    if (permises) {
      const rat = db.prepare('SELECT section_rattachement FROM etudiant WHERE id = ?').get(id)?.section_rattachement;
      const toutes = [...new Set([...sectionsDeLEtudiant(id, null).sections, ...(rat ? [rat] : [])])];
      if (toutes.length && !toutes.some(x => permises.includes(x))) continue;
    }
    const d = revuePAE(id, annee);
    if (d) pages.push({ d, html: pageRevue(d, esc) });
  }
  if (!pages.length) return res.status(400).json({ error: 'Aucun étudiant de votre périmètre.' });
  const envelopper = (corps, sous) => envelopperDocument({ html: corps, titre: `PAE ${annee}`, styles: STYLE_REVUE,
    entete: { titre: `Programme annuel de l'étudiant — ${annee}`, sous, ligne: `Détail par cours, reports et dispenses · arrêté le ${new Date().toLocaleDateString('fr-BE')}` } });
  const slug = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (req.body?.separer === true) {
    return res.json({ documents: pages.map(p => ({ etudiant_id: p.d.etudiant.id,
      etudiant: `${p.d.etudiant.nom} ${p.d.etudiant.prenom || ''}`.trim(),
      nom: `PAE_${slug(p.d.etudiant.nom)}_${slug(p.d.etudiant.prenom)}_${String(annee).replace(/\W/g, '')}`,
      contenu: `PAE ${annee} détaillé par cours`,
      html: envelopper(p.html, p.d.etudiant.section || '') })) });
  }
  const sections = [...new Set(pages.map(p => p.d.etudiant.section).filter(Boolean))];
  res.json({ html: envelopper(pages.map(p => p.html).join(''), `${sections.join(', ')} · ${pages.length} étudiant(s)`),
    nom: `PAE_${String(annee).replace(/\W/g, '')}_${pages.length}_etudiants`, n: pages.length });
});

r.get('/:id/bulletin/document', authRequired, (req, res) => {
  if (!etudiantPermis(req, res, Number(req.params.id))) return;
  const d = documentBulletin(Number(req.params.id), req.query.annee || anneeDeTravail(req));
  if (d.erreur) return res.status(d.code || 400).json({ error: d.erreur });
  res.json({ html: d.html, nom: d.nom, titre: d.titre });
});

r.get('/:id/fiche-parcours/document', authRequired, (req, res) => {
  const d = documentParcours(Number(req.params.id),
    req.query.annee || anneeDeTravail(req));
  if (d.erreur) return res.status(d.code || 400).json({ error: d.erreur });
  res.json({ html: d.html, nom: d.nom });
});

/**
 * LES PARCOURS D'UNE PROMOTION, EN UN SEUL DOCUMENT.
 *
 * Le secrétariat n'imprime pas quarante fiches une par une. Chaque parcours
 * occupe sa page ; on les enchaîne, et le tirage se fait en une fois.
 */
r.post('/parcours-lot', authRequired, (req, res) => {
  const { annee, etudiants } = req.body || {};
  if (!annee || !Array.isArray(etudiants) || !etudiants.length) {
    return res.status(400).json({ error: 'annee et etudiants requis' });
  }
  if (etudiants.length > 300) {
    return res.status(400).json({
      error: 'Plus de 300 parcours en une fois : le document deviendrait '
           + 'ingérable à l’impression. Procédez par groupes.',
    });
  }
  const pages = [], manques = [];
  for (const id of etudiants.map(Number)) {
    // UN DOSSIER QUI ÉCHOUE N'ARRÊTE PAS LE LOT (27 septembre 2026) : une
    // exception levée sur un seul étudiant rendait la page d'erreur d'Express
    // au lieu du JSON attendu, et l'écran n'affichait que « The string did not
    // match the expected pattern ». Il est nommé dans les manques, avec la raison.
    let d;
    try { d = documentParcours(id, annee); }
    catch (err) {
      console.error('[parcours-lot]', id, err);
      d = { erreur: `erreur interne : ${err.message}` };
    }
    if (d.erreur) {
      const e0 = db.prepare('SELECT nom, prenom FROM etudiant WHERE id = ?').get(id);
      manques.push({ etudiant_id: id, nom: e0 ? `${e0.nom} ${e0.prenom}` : `#${id}`,
                     raison: d.erreur });
      continue;
    }
    pages.push(d);
  }
  if (!pages.length) {
    return res.status(400).json({
      error: 'Aucun parcours n’a pu être produit.', manques });
  }
  // La feuille de style est celle de la première page : elles sont identiques,
  // et un <style> répété entre deux pages casse les sauts de page.
  const html = pages[0].html.replace(
    /(<body[^>]*>)([\s\S]*)(<\/body>)/i,
    (_, o, corps0, f) => o + [corps0, ...pages.slice(1).map(p =>
      `<div style="break-before:page;page-break-before:always"></div>${p.corps}`)
    ].join('\n') + f);

  res.json({ html, nom: `Parcours_${annee}`, pages: pages.length, manques });
});

r.get('/coherence-resultats', authRequired, (req, res) => {
  const { annee, section } = req.query;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const params = [annee];
  let clauseSection = '';
  if (section) {
    clauseSection = ` AND i.ue_num IN (SELECT ue_num FROM ue WHERE section = ?)`;
    params.push(section);
  }

  const lignes = db.prepare(`
    SELECT i.etudiant_id, i.ue_num, i.resultat, i.points,
           e.nom, e.prenom
    FROM etudiant_inscription i
    JOIN etudiant e ON e.id = i.etudiant_id
    WHERE i.annee_scolaire = ? AND i.points IS NOT NULL AND i.points < 10
      ${clauseSection}
    ORDER BY e.nom, i.ue_num
  `).all(...params);

  // Une note sous le seuil avec une décision de réussite, ou sans décision.
  const incoherents = lignes.filter(l =>
    l.resultat === 'reussi' || l.resultat == null);

  res.json({
    annee, section: section || null,
    notes_sous_seuil: lignes.length,
    incoherents: incoherents.slice(0, 200).map(l => ({
      etudiant_id: l.etudiant_id, nom: l.nom, prenom: l.prenom,
      ue_num: l.ue_num, points: l.points, resultat: l.resultat,
    })),
    nb_incoherents: incoherents.length,
    etudiants_concernes: new Set(incoherents.map(l => l.etudiant_id)).size,
  });
});

r.get('/matrice', authRequired, (req, res) => {
  const { annee, section } = req.query;
  if (!annee || !section) return res.status(400).json({ error: 'annee et section requises' });

  const anneeRef = anneeDeTravail(req) || annee;

  const ues = db.prepare(`
    SELECT DISTINCT ue_num, MIN(ue_nom) AS ue_nom,
           -- Le niveau propre à l'UE, tous millésimes confondus : il sert de
           -- recours quand niveauxEffectifs n'en trouve pas.
           MIN(NULLIF(ue_niv, '')) AS ue_niv_propre
    FROM ue
    WHERE section = ? AND annee_scolaire IN (?, ?)
    GROUP BY ue_num
  `).all(section, annee, anneeRef);
  if (!ues.length) return res.json({ ues: [], etudiants: [] });

  const niveaux = niveauxEffectifs([section], annee);
  const rang = v => { const m = /^BA(\d+)$/.exec((v || '').toUpperCase()); return m ? Number(m[1]) : 9; };

  // niveauxEffectifs ne lit le niveau que pour l'ANNÉE ACTIVE : une UE
  // présente uniquement dans l'année consultée n'en recevait aucun et se
  // retrouvait reléguée en fin de tableau, d'où un classement apparemment
  // aléatoire. On retombe sur le niveau porté par l'UE elle-même.
  for (const u of ues) {
    u.ue_niv = niveaux[u.ue_num] || (u.ue_niv_propre || '').toUpperCase() || null;
    delete u.ue_niv_propre;
  }
  ues.sort((a, b) => rang(a.ue_niv) - rang(b.ue_niv) || a.ue_num - b.ue_num);

  const listeUe = ues.map(u => u.ue_num).join(',');

  // Étudiants : ceux qui ont une inscription dans la section, toutes années
  const etudiants = db.prepare(`
    SELECT DISTINCT e.id, e.nom, e.prenom, e.id_ecampus
    FROM etudiant e
    JOIN etudiant_inscription i ON i.etudiant_id = e.id
    WHERE e.actif = 1 AND i.ue_num IN (${listeUe})
    ORDER BY e.nom, e.prenom
  `).all();
  if (!etudiants.length) return res.json({ ues, etudiants: [] });

  const ids = etudiants.map(e => e.id).join(',');

  const inscriptions = db.prepare(`
    SELECT etudiant_id, ue_num, annee_scolaire, resultat, points
    FROM etudiant_inscription
    WHERE etudiant_id IN (${ids}) AND ue_num IN (${listeUe})
  `).all();
  const vas = db.prepare(`
    SELECT etudiant_id, ue_num, annee_scolaire FROM etudiant_valorisation
    WHERE etudiant_id IN (${ids}) AND ue_num IN (${listeUe}) AND type = 'complete' AND ${vaRetenue()}
  `).all();

  const parEtud = {};
  for (const e of etudiants) parEtud[e.id] = { cellules: {}, anterieurs: {} };

  for (const i of inscriptions) {
    const p = parEtud[i.etudiant_id];
    if (!p) continue;
    if (i.annee_scolaire === annee) {
      p.cellules[i.ue_num] = { resultat: i.resultat, points: i.points };
    } else if (i.resultat) {
      const prec = p.anterieurs[i.ue_num];
      // On retient l'acquis le plus favorable, sinon la trace la plus récente
      if (!prec || (i.resultat === 'reussi' && prec.resultat !== 'reussi')
          || (i.resultat === prec.resultat && i.annee_scolaire > prec.annee)) {
        p.anterieurs[i.ue_num] = { annee: i.annee_scolaire, resultat: i.resultat, points: i.points };
      }
    }
  }
  for (const v of vas) {
    const p = parEtud[v.etudiant_id];
    if (!p) continue;
    if (v.annee_scolaire !== annee) {
      p.anterieurs[v.ue_num] = { annee: v.annee_scolaire, resultat: 'va' };
    }
  }

  res.json({
    annee, section, ues,
    etudiants: etudiants.map(e => ({ ...e, ...parEtud[e.id] })),
  });
});

// ── Encodage direct des notes ──────────────────────────────────────────────
// La matrice ne retient que le résultat ; ici on saisit la NOTE, dont le
// résultat se déduit. L'année est choisie librement, pour rattraper un
// millésime antérieur sans changer d'écran.
r.get('/encodage-direct', authRequired, (req, res) => {
  const { annee, section, ue_num } = req.query;
  if (!annee || !section) return res.status(400).json({ error: 'annee et section requises' });

  const perim = getUserSections(req.user);
  if (perim && !perim.includes(section)) {
    return res.status(403).json({ error: 'section hors de votre périmètre' });
  }

  // Les UE de la section pour l'année, telles que le référentiel les décrit.
  const ues = db.prepare(`
    SELECT DISTINCT ue_num, ue_nom, ue_niv, ects
    FROM ue WHERE section = ? AND annee_scolaire = ?
    ORDER BY ue_niv, ue_num
  `).all(section, annee);

  // Les étudiants inscrits dans la section cette année-là. On part des
  // inscriptions réelles, le rattachement par section n'étant pas fiable.
  const filtreUe = ue_num ? 'AND i.ue_num = ?' : '';
  const params = [section, annee, annee];
  if (ue_num) params.push(Number(ue_num));

  const etudiants = db.prepare(`
    SELECT DISTINCT e.id, e.nom, e.prenom, e.id_ecampus
    FROM etudiant e
    JOIN etudiant_inscription i ON i.etudiant_id = e.id
    WHERE i.ue_num IN (SELECT ue_num FROM ue WHERE section = ? AND annee_scolaire = ?)
      AND i.annee_scolaire = ? ${filtreUe}
    ORDER BY e.nom, e.prenom
  `).all(...params);

  // Ce qui est déjà encodé, pour ne pas faire ressaisir.
  // Les résultats se chargent pour les MÊMES unités que les colonnes.
  // Auparavant les colonnes étaient bâties sur deux millésimes — l'année
  // consultée et l'année de référence — mais les résultats n'étaient lus que
  // pour l'année consultée : une unité absente de ce millésime affichait une
  // colonne VIDE alors que le résultat existait, et l'encodage direct
  // contredisait la grille de parcours.
  const existant = {};
  for (const l of db.prepare(`
    SELECT etudiant_id, ue_num, resultat, resultat_s1, resultat_s2,
           points, points_s1, points_s2
    FROM etudiant_inscription
    WHERE annee_scolaire = ?
      AND ue_num IN (${ues.map(() => '?').join(',')})
  `).all(annee, ...ues.map(u => u.ue_num))) {
    existant[`${l.etudiant_id}|${l.ue_num}`] = {
      resultat: l.resultat, points: l.points,
      s1: l.resultat_s1 || null, s2: l.resultat_s2 || null,
      p1: l.points_s1 ?? null, p2: l.points_s2 ?? null,
    };
  }

  // Les VALORISATIONS complètes. La grille de parcours les affiche et elles y
  // masquent l'inscription ; cet écran les ignorait, si bien que les deux ne
  // disaient pas la même chose du même étudiant.
  for (const v of db.prepare(`
    SELECT etudiant_id, ue_num, pourcentage FROM etudiant_valorisation
    WHERE annee_scolaire = ? AND type = 'complete' AND ${vaRetenue()}
      AND ue_num IN (${ues.map(() => '?').join(',')})
  `).all(annee, ...ues.map(u => u.ue_num))) {
    const cle = `${v.etudiant_id}|${v.ue_num}`;
    const insc = existant[cle];
    existant[cle] = {
      resultat: 'va', points: vaSur20(v.pourcentage),
      // Une valorisation ET un résultat encodé sur la même unité, c'est une
      // contradiction : on la signale plutôt que d'en taire une des deux.
      conflit: insc?.resultat ? insc.resultat : null,
    };
  }

  res.json({ ues, etudiants, existant });
});

// ── Composition des PAE en lot ──────────────────────────────────────────────
// Composer un programme annuel étudiant par étudiant est intenable sur une
// promotion entière : on inscrit ou on retire les mêmes unités pour tous les
// étudiants retenus, en une fois.
/* ══ COMPOSER LES PAE — LA GRILLE ═══════════════════════════════════════════
 *
 * Demandé par Charles le 21 septembre 2026 : « un outil qui doit permettre de
 * rapidement voir, revoir, changer, modifier et créer un PAE pour un, des…
 * étudiants » — automatique ou semi-automatique, un PAE de base en un coup,
 * une UE choisie dans une liste retirée à tous.
 *
 * La grille : une ligne par étudiant de la section, une colonne par UE de sa
 * COMPOSITION (ue_section ; à défaut, les UE rangées sous la section). Les
 * étudiants sont ceux RATTACHÉS à la section (posé ou déduit — la déduction
 * ignore les UE hors cursus) ET ceux inscrits cette année à l'une de ses UE :
 * un BA1 tout juste importé, sans aucune UE, doit y figurer — c'est à lui
 * qu'on donne un PAE de base.
 */
r.get('/pae-grille', authRequired, (req, res) => {
  const { section, annee } = req.query;
  if (!section || !annee) return res.status(400).json({ error: 'section et annee requises' });
  if (!sectionAutoriseeReq(req, section)) return res.status(403).json({ error: 'Section hors de votre périmètre' });

  let ues = db.prepare(`
    SELECT us.ue_num,
           (SELECT u.ue_nom FROM ue u WHERE u.ue_num = us.ue_num AND u.annee_scolaire = ? LIMIT 1) AS ue_nom,
           (SELECT u.ue_niv FROM ue u WHERE u.ue_num = us.ue_num AND u.annee_scolaire = ? LIMIT 1) AS ue_niv,
           (SELECT COALESCE(u.hors_cursus,0) FROM ue u WHERE u.ue_num = us.ue_num AND u.annee_scolaire = ? LIMIT 1) AS hors_cursus
      FROM ue_section us WHERE us.annee_scolaire = ? AND us.section_code = ?`).all(annee, annee, annee, annee, section);
  let source = 'composition';
  if (!ues.length) {
    source = 'referentiel';
    ues = db.prepare(`SELECT ue_num, MAX(ue_nom) AS ue_nom, MAX(ue_niv) AS ue_niv,
        MAX(COALESCE(hors_cursus,0)) AS hors_cursus
      FROM ue WHERE annee_scolaire = ? AND section = ? GROUP BY ue_num`).all(annee, section);
  }
  if (!ues.length) {
    /* L'HISTORIQUE SE COMPOSE AUSSI POUR LES ANNÉES QUE LE RÉFÉRENTIEL NE
       COUVRE PAS. La section d'une UE ne dépend pas de l'année (règle déjà
       posée pour les sections des étudiants) : à défaut de référentiel pour
       l'année demandée, les colonnes viennent des autres années — sans quoi
       « échoué en 2024-2025 » n'aurait nulle part où s'écrire. */
    source = 'referentiel-autre-annee';
    ues = db.prepare(`
      SELECT DISTINCT u0.ue_num,
        (SELECT ue_nom FROM ue x WHERE x.ue_num = u0.ue_num AND x.ue_nom IS NOT NULL
          ORDER BY x.annee_scolaire DESC LIMIT 1) AS ue_nom,
        (SELECT ue_niv FROM ue x WHERE x.ue_num = u0.ue_num AND x.ue_niv IS NOT NULL
          ORDER BY x.annee_scolaire DESC LIMIT 1) AS ue_niv,
        0 AS hors_cursus
      FROM ue u0 WHERE u0.section = ?`).all(section);
  }
  const rang = n => ({ BA1: 1, BA2: 2, BA3: 3 }[String(n || '').toUpperCase()] || 4);
  ues.sort((a, b) => rang(a.ue_niv) - rang(b.ue_niv) || a.ue_num - b.ue_num);
  const nums = new Set(ues.map(u => u.ue_num));

  // Les étudiants : rattachés à la section, ou inscrits à l'une de ses UE.
  const candidats = new Map();
  for (const e of db.prepare('SELECT id, nom, prenom, id_ecampus FROM etudiant WHERE actif = 1').all()) {
    candidats.set(e.id, e);
  }
  const inscr = db.prepare(`SELECT etudiant_id, ue_num, resultat, points FROM etudiant_inscription
    WHERE annee_scolaire = ?`).all(annee);
  // LES NOUVEAUX INSCRITS (primo) : aucune trace — inscription ou
  // valorisation — dans une année antérieure. Le matricule Gips qui commence
  // par « 26 » n'est qu'un indice d'une année ; l'historique, lui, fait foi.
  const anciens = new Set([
    ...db.prepare('SELECT DISTINCT etudiant_id FROM etudiant_inscription WHERE annee_scolaire < ?')
      .all(annee).map(x => x.etudiant_id),
    ...db.prepare('SELECT DISTINCT etudiant_id FROM etudiant_valorisation WHERE annee_scolaire < ?')
      .all(annee).map(x => x.etudiant_id),
  ]);
  const va = db.prepare(`SELECT etudiant_id, ue_num, type, decision FROM etudiant_valorisation
    WHERE annee_scolaire = ? AND decision_le IS NOT NULL`).all(annee);
  const dansSection = new Set(inscr.filter(i => nums.has(i.ue_num)).map(i => i.etudiant_id));
  const lignes = [];
  for (const e of candidats.values()) {
    const rat = sectionRattachement(e.id, annee);
    if (!(rat.section === section || dansSection.has(e.id))) continue;
    lignes.push({ id: e.id, nom: e.nom, prenom: e.prenom, id_ecampus: e.id_ecampus,
      section_rattachement: rat.section, section_deduite: rat.deduite,
      niveau: niveauEtudiant(e.id, annee).niveau || null,
      primo: !anciens.has(e.id), cases: {}, autres_ue: 0 });
  }
  const parId = new Map(lignes.map(l => [l.id, l]));
  for (const i of inscr) {
    const l = parId.get(i.etudiant_id);
    if (!l) continue;
    if (nums.has(i.ue_num)) {
      l.cases[i.ue_num] = { inscrit: true, resultat: i.resultat || null,
        points: i.points ?? null };
    } else l.autres_ue++;
  }
  for (const v of va) {
    const l = parId.get(v.etudiant_id);
    if (l && nums.has(v.ue_num)) {
      l.cases[v.ue_num] = { ...(l.cases[v.ue_num] || {}),
        va: v.decision === 'refusee' ? 'refusee' : v.type };
    }
  }
  /* CE QUI EST DÉJÀ RÉUSSI SE VOIT (Charles, 26 septembre 2026, à propos de
     Kenza : « toutes les cases ne sont pas cochées puisque déjà réussi »). La
     grille ne lisait que l'année composée : une UE réussie en 2024-2025 y
     paraissait en case vide, exactement comme une UE jamais prise — une
     étudiante qui a tout réussi sauf son épreuve intégrée ressemblait à une
     étudiante sans programme. La réussite ANTÉRIEURE s'ajoute donc à la case,
     avec son année et sa note ; elle n'inscrit rien. */
  const acquisAvant = [
    ...db.prepare(`SELECT etudiant_id, ue_num, annee_scolaire AS annee, points AS note, 0 AS va
      FROM etudiant_inscription WHERE resultat = 'reussi' AND annee_scolaire < ?
      ORDER BY annee_scolaire`).all(annee),
    ...db.prepare(`SELECT etudiant_id, ue_num, annee_scolaire AS annee, NULL AS note, 1 AS va
      FROM etudiant_valorisation WHERE type = 'complete' AND ${vaRetenue()}
        AND annee_scolaire < ? ORDER BY annee_scolaire`).all(annee),
  ];
  for (const a of acquisAvant) {
    const l = parId.get(a.etudiant_id);
    if (!l || !nums.has(a.ue_num)) continue;
    const c = l.cases[a.ue_num] || {};
    // La plus récente fait foi ; une réussite par délibération passe avant une VA.
    if (!c.acquise || (!a.va && (c.acquise.va || a.annee >= c.acquise.annee))) {
      l.cases[a.ue_num] = { ...c, acquise: { annee: a.annee, note: a.note ?? null, va: !!a.va } };
    }
  }
  /* L'ÉCHEC D'UNE ANNÉE ANTÉRIEURE SE VOIT AUSSI (Charles, 28 septembre 2026 :
     le coin rouge de la case). La DERNIÈRE décision antérieure fait foi :
     refusée ou ajournée, et pas réussie depuis. */
  for (const x of db.prepare(`SELECT i.etudiant_id, i.ue_num, i.annee_scolaire AS annee, i.resultat
      FROM etudiant_inscription i WHERE i.annee_scolaire < ? AND i.annee_scolaire = (
        SELECT MAX(j.annee_scolaire) FROM etudiant_inscription j
        WHERE j.etudiant_id = i.etudiant_id AND j.ue_num = i.ue_num AND j.annee_scolaire < ? AND j.resultat IS NOT NULL)
      AND i.resultat IN ('refuse', 'ajourne')`).all(annee, annee)) {
    const l = parId.get(x.etudiant_id);
    if (!l || !nums.has(x.ue_num)) continue;
    const c = l.cases[x.ue_num] || {};
    if (c.acquise) continue;
    l.cases[x.ue_num] = { ...c, echec: { annee: x.annee, resultat: x.resultat } };
  }
  lignes.sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr') || (a.prenom || '').localeCompare(b.prenom || '', 'fr'));

  // LA VALIDATION DU PAE (24 septembre 2026) : un programme composé n'est
  // qu'une proposition tant que personne ne l'a validé. La grille dit lequel.
  const valides = new Map(db.prepare(`SELECT etudiant_id, confirme_le, confirme_par FROM etudiant_pae
    WHERE annee_scolaire = ? AND confirme_le IS NOT NULL`).all(annee).map(x => [x.etudiant_id, x]));
  for (const l of lignes) {
    const v = valides.get(l.id);
    l.pae_confirme_le = v?.confirme_le || null;
    l.pae_confirme_par = v?.confirme_par || null;
  }

  /* VALIDER EN SACHANT QUOI. Avec « controle », chaque programme non vide est
   * relu par composerPAE — le calcul de la fiche — et la grille signale ce
   * qui mérite un regard avant de signer : une UE inscrite que les prérequis
   * ne proposent pas (sauf dérogation posée), une UE proposée qui manque. */
  if (req.query.controle) {
    const derog = new Set(db.prepare(`SELECT etudiant_id || '|' || ue_num AS k FROM etudiant_inscription
      WHERE annee_scolaire = ? AND COALESCE(derogation, 0) = 1`).all(annee).map(x => x.k));
    for (const l of lignes) {
      l.controle = { hors_proposition: [], manquantes: [], deja_reussies: [],
                     cadenas: [], en_attente: [] };
      if (!Object.values(l.cases).some(c => c.inscrit)) continue;
      // Une UE déjà réussie, réinscrite sans que personne l'ait forcé : c'est
      // une erreur à retirer, et la validation la refuse.
      l.controle.deja_reussies = reprisesNonForcees(l.id, annee);
      const c = composerPAE(l.id, annee, { section });
      if (c.erreur) continue;
      for (const u of c.pae) {
        if (!nums.has(u.ue_num)) continue;
        if (u.inscrite && u.en_attente) {
          // Réinscrite alors que sa seconde session n'est pas délibérée.
          l.controle.en_attente.push(u.ue_num);
        } else if (u.inscrite && !u.propose && !u.deja_reussie && !derog.has(`${l.id}|${u.ue_num}`)) {
          l.controle.hors_proposition.push(u.ue_num);
        }
        if (u.inscrite && u.cadenas?.length) l.controle.cadenas.push({ ue: u.ue_num, si: u.cadenas });
        if (u.propose && !u.inscrite) l.controle.manquantes.push(u.ue_num);
      }
    }
  }
  res.json({ section, annee, source, ues, etudiants: lignes });
});

/* ══ VALIDER LES PAE D'UNE SECTION, EN LOT ════════════════════════════════
 *
 * « Tu les crées mais ils ne sont pas validés » (Jérôme, 24 septembre 2026).
 * La promotion inscrit ; la validation se faisait dossier par dossier, depuis
 * la fiche. Ici, les étudiants cochés dans la grille. Valider ne change AUCUNE
 * inscription : cela signe le programme tel qu'il est. Un programme vide ne
 * se valide pas — il n'y aurait rien à signer.
 */
r.post('/pae-valider-lot', authRequired,
       gesteRequis('etudiants.pae_valider'), (req, res) => {
  const { section, annee, etudiants, retirer } = req.body || {};
  if (!section || !annee || !Array.isArray(etudiants) || !etudiants.length) {
    return res.status(400).json({ error: 'section, annee et étudiants requis' });
  }
  if (!sectionAutoriseeReq(req, section)) return res.status(403).json({ error: 'Section hors de votre périmètre' });
  // Retirer une validation reste réservé, comme sur la fiche.
  if (retirer && req.user?.role === 'secretariat') {
    return res.status(403).json({ error: 'Retirer une validation est réservé à la direction et aux éditeurs.' });
  }
  const qui = req.user?.email || req.user?.nom_complet || null;
  const nbInscr = db.prepare('SELECT COUNT(*) AS n FROM etudiant_inscription WHERE etudiant_id = ? AND annee_scolaire = ?');
  const dansSection = db.prepare(`SELECT 1 FROM etudiant_inscription i WHERE i.etudiant_id = ? AND i.annee_scolaire = ?
    AND EXISTS (SELECT 1 FROM ue u WHERE u.ue_num = i.ue_num AND u.section = ?) LIMIT 1`);
  const signer = db.prepare(`
    INSERT INTO etudiant_pae (etudiant_id, annee_scolaire, confirme_le, confirme_par)
    VALUES (?,?, datetime('now'), ?)
    ON CONFLICT(etudiant_id, annee_scolaire) DO UPDATE SET
      confirme_le = datetime('now'), confirme_par = excluded.confirme_par`);
  const oter = db.prepare('DELETE FROM etudiant_pae WHERE etudiant_id = ? AND annee_scolaire = ?');
  /* UNE SEULE NOTION DE « VALIDÉ » (Charles, 2 octobre 2026) : valider en
     groupe des PAE standards écrit la MÊME trace que l'œil — la revue —, au
     nom de qui clique. Le crayon de la liste passe au vert pareil. */
  const revu = db.prepare(`INSERT INTO pae_revue (etudiant_id, annee_scolaire, revu_par, ects_confirme) VALUES (?, ?, ?, ?)
    ON CONFLICT(etudiant_id, annee_scolaire) DO UPDATE SET revu_le = datetime('now'), revu_par = excluded.revu_par,
      ects_confirme = excluded.ects_confirme`);
  /* AU-DELÀ DE 60 ECTS, LE LOT S'ARRÊTE AVANT D'ÉCRIRE (tout ou rien) et nomme
     les programmes à confirmer ; renvoyé avec plus60: true, il les valide en
     gardant le nombre d'ECTS confirmé. */
  if (!retirer && req.body?.plus60 !== true) {
    const lourds = [];
    for (const id of [...new Set(etudiants.map(Number).filter(Number.isInteger))]) {
      const n = ectsDuPAE(id, annee);
      if (n > SEUIL_ECTS_PAE) {
        const e = db.prepare('SELECT nom, prenom FROM etudiant WHERE id = ?').get(id) || {};
        lourds.push({ id, ects: n, nom: `${String(e.nom || '').toUpperCase()} ${e.prenom || ''}`.trim() });
      }
    }
    if (lourds.length) return res.status(409).json({ plus60: lourds,
      error: `${lourds.length} programme(s) au-delà de ${SEUIL_ECTS_PAE} ECTS : la validation demande de les confirmer en connaissance de cause.` });
  }
  const quiRevu = req.user?.nom || req.user?.email || null;
  const pasRevu = db.prepare('DELETE FROM pae_revue WHERE etudiant_id = ? AND annee_scolaire = ?');

  let faits = 0;
  const ignores = [];
  db.transaction(() => {
    for (const id of [...new Set(etudiants.map(Number).filter(Number.isInteger))]) {
      // Le périmètre se vérifie par étudiant : la section annoncée ne suffit pas.
      // Un rattachement DÉCLARÉ tranche (30 septembre 2026) : sans quoi la
      // coordination d'Optométrie validait le PAE d'un orthoptiste inscrit au
      // tronc commun, déclaré en Optométrie.
      const declaree = db.prepare('SELECT section_rattachement s FROM etudiant WHERE id = ?').get(id)?.s || null;
      if (declaree ? declaree !== section
        : (sectionRattachement(id, annee).section !== section && !dansSection.get(id, annee, section))) {
        ignores.push({ id, raison: 'hors de la section' }); continue;
      }
      if (retirer) { faits += oter.run(id, annee).changes; pasRevu.run(id, annee); continue; }
      if (!nbInscr.get(id, annee).n) { ignores.push({ id, raison: 'programme vide' }); continue; }
      const reprises = reprisesNonForcees(id, annee);
      if (reprises.length) {
        ignores.push({ id, raison: `UE déjà réussie${reprises.length > 1 ? 's' : ''}, `
          + `réinscrite${reprises.length > 1 ? 's' : ''} sans être forcée${reprises.length > 1 ? 's' : ''} : `
          + reprises.join(', ') });
        continue;
      }
      signer.run(id, annee, qui); { const n = ectsDuPAE(id, annee); revu.run(id, annee, quiRevu, n > SEUIL_ECTS_PAE ? n : null); } faits++;
    }
  })();
  res.json({ ok: true, faits, ignores });
});

/* ══ FORCER LA RÉINSCRIPTION À UNE UE DÉJÀ RÉUSSIE ═════════════════════════
 *
 * Le seul geste qui rend légitime une UE réussie au programme d'une année
 * suivante. Réservé à la direction et à la coordination, dans leur périmètre.
 * CELUI QUI CLIQUE EST CELUI QUI FORCE : son nom et l'heure s'écrivent sur
 * l'inscription. « retirer » défait le forçage, sans toucher à l'inscription.
 */
r.post('/pae-forcer-reinscription', authRequired,
       gesteRequis('etudiants.reinscription'), (req, res) => {
  const { etudiant_id, annee, ue_num, retirer } = req.body || {};
  const id = Number(etudiant_id), ue = Number(ue_num);
  if (!id || !annee || !ue) return res.status(400).json({ error: 'étudiant, année et UE requis' });
  const perim = perimetre(req);
  if (perim && !perim.includes(sectionRattachement(id, annee).section)
      && !sectionsDeUE(ue).some(s0 => perim.includes(s0))) {
    return res.status(403).json({ error: 'Cet étudiant est hors de votre périmètre.' });
  }
  const insc = db.prepare(`SELECT i.id, ${SQL_DEJA_REUSSIE} AS reussie FROM etudiant_inscription i
    WHERE i.etudiant_id = ? AND i.annee_scolaire = ? AND i.ue_num = ?`).get(id, annee, ue);
  if (!insc) return res.status(404).json({ error: `L'UE ${ue} n'est pas au programme ${annee} de cet étudiant.` });
  if (!insc.reussie) {
    return res.status(409).json({ error: `L'UE ${ue} n'a pas été réussie une année antérieure : rien à forcer.` });
  }
  const qui = req.user?.nom || req.user?.email || null;
  if (retirer) {
    db.prepare(`UPDATE etudiant_inscription SET derogation = 0, derogation_par = NULL, derogation_le = NULL
      WHERE id = ?`).run(insc.id);
  } else {
    db.prepare(`UPDATE etudiant_inscription SET derogation = 1, derogation_par = ?, derogation_le = datetime('now')
      WHERE id = ?`).run(qui, insc.id);
  }
  res.json({ ok: true, force: !retirer, par: retirer ? null : qui });
});

/* ══ RETIRER LES UE DÉJÀ RÉUSSIES QUE PERSONNE N'A FORCÉES ═════════════════
 *
 * Le nettoyage des réinscriptions fautives. Simulation par défaut : la liste
 * nominative d'abord, l'écriture ensuite. Ne retire JAMAIS une inscription qui
 * porte un résultat, des points, des notes d'acquis, ou un forçage. Un PAE
 * déjà validé qui perd des unités perd aussi sa validation : la signature
 * portait sur un autre programme que celui qui reste.
 */
r.post('/pae-nettoyer-reussies', authRequired,
       gesteRequis('etudiants.reinscription'), (req, res) => {
  const { annee, section, simulation = true } = req.body || {};
  if (!annee || !section) return res.status(400).json({ error: 'année et section requises' });
  if (!sectionAutoriseeReq(req, section)) return res.status(403).json({ error: 'Section hors de votre périmètre' });

  const lignes = db.prepare(`
    SELECT i.id, i.etudiant_id, i.ue_num, e.nom, e.prenom
    FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
    WHERE i.annee_scolaire = ? AND COALESCE(i.derogation, 0) = 0
      AND i.resultat IS NULL AND i.points IS NULL
      AND NOT EXISTS (SELECT 1 FROM etudiant_note_detail n
        WHERE n.etudiant_id = i.etudiant_id AND n.annee_scolaire = i.annee_scolaire AND n.ue_num = i.ue_num)
      AND ${SQL_DEJA_REUSSIE}
    ORDER BY e.nom, e.prenom, i.ue_num`).all(annee)
    .filter(l => sectionRattachement(l.etudiant_id, annee).section === section);

  const parEtudiant = new Map();
  for (const l of lignes) {
    if (!parEtudiant.has(l.etudiant_id)) {
      parEtudiant.set(l.etudiant_id, { id: l.etudiant_id, nom: l.nom, prenom: l.prenom, ues: [] });
    }
    parEtudiant.get(l.etudiant_id).ues.push(l.ue_num);
  }
  const valide = db.prepare('SELECT confirme_le FROM etudiant_pae WHERE etudiant_id = ? AND annee_scolaire = ?');
  const etudiants = [...parEtudiant.values()].map(x => ({ ...x, pae_valide: !!valide.get(x.id, annee)?.confirme_le }));

  let retirees = 0, validations_retirees = 0;
  if (!simulation && lignes.length) {
    const del = db.prepare('DELETE FROM etudiant_inscription WHERE id = ? AND resultat IS NULL AND points IS NULL');
    const oter = db.prepare('DELETE FROM etudiant_pae WHERE etudiant_id = ? AND annee_scolaire = ?');
    db.transaction(() => {
      for (const l of lignes) retirees += del.run(l.id).changes;
      for (const x of etudiants) if (x.pae_valide) validations_retirees += oter.run(x.id, annee).changes;
    })();
  }
  res.json({ ok: true, simulation: !!simulation, annee, section,
    etudiants, total: { etudiants: etudiants.length, inscriptions: lignes.length },
    retirees, validations_retirees });
});

/* ══ COMPOSER LES PAE — APPLIQUER LES CHANGEMENTS DE LA GRILLE ════════════
 *
 * La grille prépare des changements CASE PAR CASE — ajouter l'UE 9701 à
 * trente étudiants, en retirer 9703 à deux autres, donner le PAE de base à
 * dix : c'est une liste de couples (étudiant, UE), pas « une action pour
 * tous ». Simulation d'abord, puis tout ou rien.
 *
 * DEUX PROTECTIONS au retrait, et la seconde manquait au lot : un RÉSULTAT
 * encodé (effacer une décision du Conseil), et des NOTES déjà saisies sans
 * résultat encore — retirer l'inscription les laisserait orphelines.
 * Le périmètre s'applique aux unités, comme au lot.
 */
/* ── UN PROGRAMME, UNE SECTION (Charles, 27 septembre 2026 : « non, ce n'est
 * pas possible »). Le 25 septembre, 123 étudiants d'ATNUP ont reçu en plus le
 * BA1 de psychomotricité, et 84 d'AeSI dix unités d'optométrie, chacun à la
 * seconde près : la route des programmes acceptait n'importe quelle unité pour
 * n'importe quel étudiant, sans regarder sa section. Deux aides, écrites une
 * fois : la section d'une unité (hors cursus compris), et la section d'un
 * dossier — le rattachement posé, sinon l'historique des années antérieures,
 * sinon ce qu'il porte déjà cette année. */
function sectionDeLUE(u, annee) {
  return db.prepare(`SELECT section, COALESCE(hors_cursus, 0) AS hc FROM ue
    WHERE ue_num = ? AND section IS NOT NULL ORDER BY (annee_scolaire = ?) DESC, annee_scolaire DESC LIMIT 1`).get(u, annee) || null;
}
function sectionsHistoriques(etudId, annee) {
  const n = {};
  for (const x of db.prepare(`SELECT i.ue_num, i.annee_scolaire FROM etudiant_inscription i
      WHERE i.etudiant_id = ? AND i.annee_scolaire < ?`).all(etudId, annee)) {
    const su = sectionDeLUE(x.ue_num, x.annee_scolaire);
    if (su && !su.hc) n[su.section] = (n[su.section] || 0) + 1;
  }
  return Object.entries(n).sort((a, b) => b[1] - a[1]).map(([sec]) => sec);
}
function sectionDuDossier(etudId, annee) {
  const rat = db.prepare('SELECT section_rattachement FROM etudiant WHERE id = ?').get(etudId)?.section_rattachement;
  if (rat) return rat;
  const h = sectionsHistoriques(etudId, annee);
  if (h.length) return h[0];
  const cette = new Set();
  for (const x of db.prepare('SELECT ue_num FROM etudiant_inscription WHERE etudiant_id = ? AND annee_scolaire = ?').all(etudId, annee)) {
    const su = sectionDeLUE(x.ue_num, annee); if (su && !su.hc) cette.add(su.section);
  }
  return cette.size === 1 ? [...cette][0] : null;
}

/* LA RÉPARATION, SIMULATION D'ABORD. Les étudiants inscrits cette année dans
 * deux sections : on garde la section du dossier (rattachement, sinon
 * historique, sinon celle posée en premier), on retire les inscriptions de
 * l'autre — jamais celles qui portent un résultat, une note ou un report. Un
 * dossier dont l'historique connaît les DEUX sections n'est pas tranché : il
 * est nommé, et se règle à la main. Écrire est un geste de direction. */
/* ── LES PROGRAMMES AU-DELÀ DU BLOC ATTEINT (Charles, 28 septembre 2026 :
 * « tous les primos de psychomotricité ont toutes les UE de la section, pas
 * possible »). 45 primo-inscrits portaient leurs BA2 et BA3 — 441 inscriptions
 * vides, posées avant que le plafond de bloc existe. L'outil nomme, pour chaque
 * étudiant, les unités d'un bloc qu'il n'a pas encore atteint (le moteur :
 * faitsPAE, `hors_bloc`) et propose de les retirer par la porte unique.
 *   · ce qui porte un résultat, une note ou un report reste ;
 *   · une dérogation tracée (pae_derogation) ou une réinscription forcée reste :
 *     quelqu'un l'a voulue ;
 *   · un étudiant qui a une VALORISATION n'est pas tranché : une VA peut ouvrir
 *     le bloc suivant, cela se regarde à la main.
 * Simulation d'abord ; l'écriture est un geste de direction. */
/**
 * LES ORTHOPTISTES DE LA HELB (Charles, 30 septembre 2026 : « le tronc commun
 * regroupe en fait deux sections, Optométrie et Orthoptie. L'orthoptie est
 * gérée par la HELB, MAIS c'est moi qui organise les UE du tronc commun »).
 *
 * La HELB transmet sa liste d'inscrits (colonnes : matricule, nom, prenom,
 * sexe, naiss_date « jj/mm/aaaa », naiss_lieu, nat_lib, dom_rue, dom_cp,
 * dom_loc, gsm, et_lib_regnat = registre national…). L'import :
 *   · crée la section « Orthoptie » si elle manque ;
 *   · rattache à Orthoptie, pour l'année, les unités de TRONC COMMUN
 *     (ue_tc = 'x', rangées sous Optométrie) — un rattachement, jamais une
 *     copie de l'unité (ue_section) ;
 *   · ouvre ou complète un dossier par étudiant, rattaché à Orthoptie
 *     (déclaré, signé, daté). Le matricule HELB est leur identifiant ; le
 *     doublon se cherche d'abord au registre national (`rapprocher`).
 *   · N'INSCRIT À AUCUNE UNITÉ : les programmes se composent un à un, dans le
 *     PAE (choix de Charles).
 * Un dossier déjà rattaché à une AUTRE section n'est pas déplacé : il est
 * nommé, et c'est à la main qu'on tranche.
 * L'adresse d'école est celle de la HELB (@helb-prigogine.be) : elle n'est
 * reprise que si le fichier la porte — on ne la devine pas.
 */
const SECTION_HELB = 'Orthoptie';
// Toutes les colonnes que l'import écrit, créées au démarrage : certaines ne
// naissaient que dans la route qui s'en servait la première (rattachement_par
// dans « Reprendre ce cursus ») — une base où cette route n'avait jamais servi
// refusait l'import (dev, 30 septembre 2026).
for (const c of ['matricule_helb', 'rattachement_par', 'rattachement_le', 'rn_norm', 'nationalite', 'lieu_naissance', 'section_rattachement']) {
  try { db.exec(`ALTER TABLE etudiant ADD COLUMN ${c} TEXT`); } catch { /* déjà là */ }
}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_etudiant_mat_helb ON etudiant(matricule_helb)'); } catch { /* */ }

r.post('/import-helb', authRequired, roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur'), (req, res) => {
  const { lignes, annee, simulation = true, exclus = [] } = req.body || {};
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  if (!Array.isArray(lignes) || !lignes.length) return res.status(400).json({ error: 'le fichier ne porte aucune ligne' });
  const exclusSet = new Set((Array.isArray(exclus) ? exclus : []).map(String));
  const qui = req.user?.email || null;
  const t = v => String(v ?? '').trim();
  const capit = x => t(x).toLowerCase().replace(/(^|[-'’\s])([\p{L}])/gu, (_, a, c) => a + c.toLocaleUpperCase('fr'));
  const iso = d => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t(d)); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : t(d) || null; };
  const rnForme = d => { const x = t(d).replace(/\D/g, ''); return x.length === 11 ? `${x.slice(0, 6)} ${x.slice(6, 9)}-${x.slice(9)}` : (t(d) || null); };
  const cleMail = l => Object.keys(l).find(k => /mail/i.test(k));

  const sectionExiste = !!db.prepare('SELECT 1 FROM section WHERE code = ?').get(SECTION_HELB);
  const tc = db.prepare(`SELECT DISTINCT u.ue_num, u.ue_nom, u.section FROM ue u
    WHERE u.annee_scolaire = ? AND LOWER(COALESCE(u.ue_tc,'')) = 'x' ORDER BY u.ue_num`).all(annee);
  const dejaLie = db.prepare('SELECT 1 FROM ue_section WHERE ue_num = ? AND section_code = ? AND annee_scolaire = ?');
  const aLier = tc.filter(u => u.section !== SECTION_HELB && !dejaLie.get(u.ue_num, SECTION_HELB, annee));

  const parMatricule = db.prepare('SELECT id FROM etudiant WHERE matricule_helb = ?');
  const parEmail = db.prepare('SELECT id FROM etudiant WHERE lower(email_ecole) = ? LIMIT 1');
  const parNomOrtho = db.prepare(`SELECT id FROM etudiant WHERE upper(trim(nom)) = ? AND lower(trim(prenom)) = ?
    AND (section_rattachement = '${SECTION_HELB}' OR matricule_helb IS NOT NULL) LIMIT 1`);
  const fiche = db.prepare('SELECT id, nom, prenom, id_ecampus, matricule_helb, section_rattachement, email_ecole FROM etudiant WHERE id = ?');
  const plan = [];
  for (const [i, l] of lignes.entries()) {
    const mat = t(l.matricule);
    const nom = t(l.nom).toLocaleUpperCase('fr').replace(/\s+/g, ' ');
    const prenom = capit(l.prenom);
    if (!nom || !prenom) { plan.push({ i, action: 'ignore', raison: 'nom ou prénom absent', nom, prenom, matricule: mat }); continue; }
    const email = cleMail(l) ? t(l[cleMail(l)]).toLowerCase() || null : null;
    const donnees = {
      nom, prenom, matricule_helb: mat || null, date_naissance: iso(l.naiss_date),
      lieu_naissance: t(l.naiss_lieu) || null, nationalite: t(l.nat_lib) || null,
      num_national: rnForme(l.et_lib_regnat), rn_norm: t(l.et_lib_regnat).replace(/\D/g, '') || null,
      titre: t(l.sexe).toUpperCase() === 'F' ? 'Madame' : t(l.sexe).toUpperCase() === 'M' ? 'Monsieur' : null,
      adresse: t(l.dom_rue) || null, cp: t(l.dom_cp) || null, localite: t(l.dom_loc) || null,
      gsm: t(l.gsm) || null, email_ecole: email,
    };
    let trouve = mat ? parMatricule.get(mat) : null;
    let methode = trouve ? 'matricule HELB' : null;
    if (!trouve) {
      const rp = rapprocher({ num_national: donnees.num_national, nom, prenom, date_naissance: donnees.date_naissance });
      if (rp) { trouve = { id: rp.id }; methode = rp.methode === 'numero_national' ? 'registre national' : 'nom, prénom et naissance'; }
    }
    /* L'EXPORTATION « CURSUS » NE PORTE NI NAISSANCE NI REGISTRE NATIONAL (8 octobre
       2026) : sans ces deux clés, un étudiant déjà importé serait recréé. Deux
       rapprochements de secours, du plus sûr au moins sûr : l'adresse HELB, puis
       le nom et le prénom exacts parmi les dossiers d'Orthoptie. */
    if (!trouve && email) {
      const x = parEmail.get(email);
      if (x) { trouve = x; methode = 'adresse HELB'; }
    }
    if (!trouve) {
      const x = parNomOrtho.get(nom, prenom.toLocaleLowerCase('fr'));
      if (x) { trouve = x; methode = 'nom et prénom (Orthoptie)'; }
    }
    if (!trouve) { plan.push({ i, action: 'creer', nom, prenom, matricule: mat, email, donnees }); continue; }
    const f = fiche.get(trouve.id);
    const autre = f.section_rattachement && f.section_rattachement !== SECTION_HELB;
    plan.push({ i, action: autre ? 'a_trancher' : 'completer', etudiant_id: f.id, nom, prenom, matricule: mat, email,
      methode, section_actuelle: f.section_rattachement || null, id_ecampus: f.id_ecampus || null, donnees });
  }
  const resume = {
    creer: plan.filter(p => p.action === 'creer').length,
    completer: plan.filter(p => p.action === 'completer').length,
    a_trancher: plan.filter(p => p.action === 'a_trancher').length,
    ignores: plan.filter(p => p.action === 'ignore').length,
    sans_adresse: plan.filter(p => p.action !== 'ignore' && !p.email).length,
  };
  const vue = plan.map(({ donnees, ...p }) => p);
  if (simulation) {
    return res.json({ simulation: true, annee, section: SECTION_HELB, section_a_creer: !sectionExiste,
      tronc_commun: tc.map(u => ({ ue_num: u.ue_num, ue_nom: u.ue_nom, a_lier: aLier.some(x => x.ue_num === u.ue_num) })),
      resume, lignes: vue });
  }

  const cols = ['nom', 'prenom', 'matricule_helb', 'date_naissance', 'lieu_naissance', 'nationalite',
    'num_national', 'rn_norm', 'titre', 'adresse', 'cp', 'localite', 'gsm', 'email_ecole'];
  const ins = db.prepare(`INSERT INTO etudiant (${cols.join(', ')}, actif, section_rattachement, rattachement_par, rattachement_le)
    VALUES (${cols.map(() => '?').join(', ')}, 1, ?, ?, datetime('now'))`);
  // Compléter : on n'écrase jamais ce qui est déjà écrit dans Lucie.
  const comp = db.prepare(`UPDATE etudiant SET ${cols.filter(c => !['nom', 'prenom'].includes(c))
    .map(c => `${c} = COALESCE(NULLIF(${c}, ''), ?)`).join(', ')},
    section_rattachement = COALESCE(section_rattachement, ?),
    rattachement_par = CASE WHEN section_rattachement IS NULL THEN ? ELSE rattachement_par END,
    rattachement_le  = CASE WHEN section_rattachement IS NULL THEN datetime('now') ELSE rattachement_le END
    WHERE id = ?`);
  let crees = 0, completes = 0, liees = 0;
  db.transaction(() => {
    if (!sectionExiste) db.prepare('INSERT OR IGNORE INTO section (code, libelle) VALUES (?, ?)').run(SECTION_HELB, SECTION_HELB);
    const lier = db.prepare('INSERT OR IGNORE INTO ue_section (ue_num, section_code, annee_scolaire) VALUES (?,?,?)');
    for (const u of aLier) liees += lier.run(u.ue_num, SECTION_HELB, annee).changes;
    for (const p of plan) {
      if (exclusSet.has(String(p.i))) continue;
      const d = p.donnees;
      if (p.action === 'creer') { ins.run(...cols.map(c => d[c] ?? null), SECTION_HELB, qui); crees++; }
      else if (p.action === 'completer') {
        comp.run(...cols.filter(c => !['nom', 'prenom'].includes(c)).map(c => d[c] ?? null), SECTION_HELB, qui, p.etudiant_id);
        completes++;
      }
    }
  })();
  console.log(`[import-helb] ${crees} créé(s), ${completes} complété(s), ${liees} UE rattachée(s) à ${SECTION_HELB} par ${qui || '?'} (${annee})`);
  res.json({ ok: true, crees, completes, ue_rattachees: liees, a_trancher: resume.a_trancher });
});

/**
 * LES DÉCISIONS SANS INSCRIPTION — la réparation (Charles, 30 septembre 2026 :
 * « ABDO R est notée comme primo. Pourquoi ? »).
 *
 * Une décision du Conseil a été posée sur une inscription, puis l'inscription
 * a disparu (suppression d'une année sur la fiche, purge) : ces deux gestes
 * effaçaient inscriptions et notes, jamais deliberation_resultat. La décision
 * restait donc, invisible — or c'est l'INSCRIPTION que lisent « primo », le
 * parcours, la frise, le bloc atteint, les crédits et les attestations. Une
 * étudiante dont trois UE sont réussies se lisait comme une nouvelle inscrite.
 *
 * On recrée l'inscription d'après la décision de la session la plus avancée,
 * avec sa cote. Les notes d'acquis effacées avec elle ne reviennent pas : seul
 * un nouvel import du classeur les rend. Un dossier sans matricule qui a un
 * homonyme est un doublon probable : il se fusionne d'abord, on ne le répare
 * pas — sans quoi on donnerait un parcours à un dossier qui ne devrait pas
 * exister.
 */
r.post('/decisions-sans-inscription', authRequired,
       roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat'), (req, res) => {
  const { simulation = true, exclus = [] } = req.body || {};
  const direction = ['admin', 'directeur', 'directeur_adjoint'].includes(req.user.role);
  if (!simulation && !direction) return res.status(403).json({ error: 'La réparation est un geste de direction.' });
  const exclusSet = new Set((Array.isArray(exclus) ? exclus : []).map(Number));

  const orphelines = db.prepare(`
    SELECT d.etudiant_id, d.annee_scolaire, d.ue_num,
           MAX(CASE WHEN d.session = 1 THEN d.resultat END) AS resultat_s1,
           MAX(CASE WHEN d.session = 1 THEN d.points END)   AS points_s1,
           MAX(CASE WHEN d.session = 2 THEN d.resultat END) AS resultat_s2,
           MAX(CASE WHEN d.session = 2 THEN d.points END)   AS points_s2
    FROM deliberation_resultat d
    WHERE d.resultat IS NOT NULL AND d.resultat != ''
      AND NOT EXISTS (SELECT 1 FROM etudiant_inscription i WHERE i.etudiant_id = d.etudiant_id
                        AND i.annee_scolaire = d.annee_scolaire AND i.ue_num = d.ue_num)
    GROUP BY d.etudiant_id, d.annee_scolaire, d.ue_num
    ORDER BY d.etudiant_id, d.annee_scolaire, d.ue_num
  `).all();
  const etud = db.prepare('SELECT id, nom, prenom, id_ecampus FROM etudiant WHERE id = ?');
  const homonymes = db.prepare(`SELECT id, prenom, id_ecampus FROM etudiant
    WHERE id != ? AND UPPER(TRIM(nom)) = UPPER(TRIM(?))`);
  const ueNom = db.prepare(`SELECT ue_nom FROM ue WHERE ue_num = ? AND ue_nom IS NOT NULL
    ORDER BY (annee_scolaire = ?) DESC, annee_scolaire DESC LIMIT 1`);
  const anterieure = db.prepare(`SELECT 1 FROM etudiant_inscription WHERE etudiant_id = ? AND annee_scolaire < ? LIMIT 1`);
  const anneeActive = anneeDeTravail(req);

  const parEtud = new Map();
  for (const o of orphelines) {
    if (!parEtud.has(o.etudiant_id)) {
      const e = etud.get(o.etudiant_id);
      if (!e) continue;
      const hom = e.id_ecampus ? [] : homonymes.all(e.id, e.nom).filter(h => h.id_ecampus);
      parEtud.set(e.id, { etudiant_id: e.id, nom: e.nom, prenom: e.prenom, id_ecampus: e.id_ecampus,
        doublon: hom.length ? hom.map(h => ({ id: h.id, prenom: h.prenom, id_ecampus: h.id_ecampus })) : null,
        primo_a_tort: !anterieure.get(e.id, anneeActive), unites: [] });
    }
    const final = o.resultat_s2 ? { resultat: o.resultat_s2, points: o.points_s2 } : { resultat: o.resultat_s1, points: o.points_s1 };
    parEtud.get(o.etudiant_id).unites.push({ annee: o.annee_scolaire, ue_num: o.ue_num,
      ue_nom: ueNom.get(o.ue_num, o.annee_scolaire)?.ue_nom || null, ...final,
      resultat_s1: o.resultat_s1, points_s1: o.points_s1, resultat_s2: o.resultat_s2, points_s2: o.points_s2 });
  }
  const lignes = [...parEtud.values()];

  if (simulation) return res.json({ simulation: true, lignes });

  const ins = db.prepare(`INSERT OR IGNORE INTO etudiant_inscription
    (etudiant_id, annee_scolaire, ue_num, resultat, points, resultat_s1, points_s1, resultat_s2, points_s2)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  let recreees = 0, etudiants = 0;
  db.transaction(() => {
    for (const l of lignes) {
      if (l.doublon || exclusSet.has(l.etudiant_id)) continue;
      etudiants++;
      for (const u of l.unites) {
        recreees += ins.run(l.etudiant_id, u.annee, u.ue_num, u.resultat, u.points ?? null,
          u.resultat_s1 ?? null, u.points_s1 ?? null, u.resultat_s2 ?? null, u.points_s2 ?? null).changes;
      }
    }
  })();
  console.log(`[decisions-sans-inscription] ${recreees} inscription(s) recréée(s) pour ${etudiants} étudiant(s) par ${req.user?.email || '?'}`);
  res.json({ ok: true, recreees, etudiants });
});

r.post('/hors-bloc', authRequired,
       roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat'), (req, res) => {
  const { annee, simulation = true, exclus = [] } = req.body || {};
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  const direction = ['admin', 'directeur', 'directeur_adjoint'].includes(req.user.role);
  if (!simulation && !direction) return res.status(403).json({ error: 'La réparation est un geste de direction.' });
  const exclusSet = new Set((Array.isArray(exclus) ? exclus : []).map(Number));
  const perim = getUserSections(req.user);
  const cache = new Map();
  const derogee = db.prepare(`SELECT 1 FROM pae_derogation WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ? AND regle = 'hors_bloc' LIMIT 1`);
  const forcee = db.prepare(`SELECT COALESCE(derogation,0) AS d FROM etudiant_inscription WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?`);
  const aVA = db.prepare('SELECT 1 FROM etudiant_valorisation WHERE etudiant_id = ? LIMIT 1');
  const lignes = [];
  for (const e of db.prepare(`SELECT DISTINCT e.id, e.nom, e.prenom, e.id_ecampus FROM etudiant e
      JOIN etudiant_inscription i ON i.etudiant_id = e.id AND i.annee_scolaire = ? WHERE e.actif = 1
      ORDER BY e.nom, e.prenom`).all(annee)) {
    const cur = cursusDe(e.id, annee);
    if (!cur.actifs.length) continue;
    if (perim && !cur.actifs.some(x => perim.includes(x))) continue;
    const f = faitsPAE(e.id, annee, cur.actifs, cache);
    const inscrites = db.prepare('SELECT ue_num FROM etudiant_inscription WHERE etudiant_id = ? AND annee_scolaire = ?')
      .all(e.id, annee).map(x => x.ue_num);
    const hors = inscrites.filter(u => f.etats.get(u)?.hors_bloc);
    if (!hors.length) continue;
    const gardees = hors.filter(u => derogee.get(e.id, annee, u) || forcee.get(e.id, annee, u)?.d)
      .map(u => ({ ue_num: u, pourquoi: 'dérogation tracée' }));
    const candidates = hors.filter(u => !gardees.some(g => g.ue_num === u));
    const sim = ecrireProgramme({ etudId: e.id, annee, retirer: candidates, origine: 'réparation hors bloc', simulation: true });
    /* UN « PRIMO » SANS HISTORIQUE N'EST PAS TOUJOURS UN PRIMO. Rama Abdo
       (25-00278) n'a aucune inscription antérieure dans Lucie alors que le
       tableau du secrétariat porte ses résultats 2025-2026 ; Carole Djandja a
       deux dossiers, et c'est le doublon sans matricule qui porte 2026-2027.
       Retirer leurs unités aurait été faux. Sans historique, on ne tranche que
       si le matricule est de l'année : plus ancien, l'historique manque ;
       absent, c'est peut-être un doublon. */
    const primo = !f.suiviesAvant.length;
    const aa = String(annee).slice(2, 4);
    const mat = /^(\d{2})-/.exec(String(e.id_ecampus || ''));
    const raison = aVA.get(e.id) ? 'a une valorisation : elle peut ouvrir le bloc suivant — à trancher à la main'
      : primo && !e.id_ecampus ? 'aucun historique et aucun matricule : doublon possible — à vérifier'
      : primo && mat && mat[1] < aa ? `matricule ${e.id_ecampus} antérieur à l'année, mais aucun historique dans Lucie : l'historique manque — à vérifier`
      : null;
    const ambigu = !!raison;
    lignes.push({ etudiant_id: e.id, nom: e.nom, prenom: e.prenom, id_ecampus: e.id_ecampus,
      section: cur.courant, plafond: f.plafond, primo,
      retirer: sim.retirees.map(u => ({ ue_num: u, niv: f.niv[u] || null })),
      proteges: [...gardees, ...sim.conservees], ambigu, raison });
  }
  let retirees = 0, confirmations = 0;
  if (!simulation) {
    const qui = req.user?.email || req.user?.nom || null;
    for (const l of lignes) {
      if (l.ambigu || exclusSet.has(l.etudiant_id) || !l.retirer.length) continue;
      const b = ecrireProgramme({ etudId: l.etudiant_id, annee, retirer: l.retirer.map(x => x.ue_num),
        origine: 'réparation hors bloc', par: qui });
      retirees += b.retirees.length;
      if (b.confirmation_retiree) confirmations++;
    }
    console.log(`[hors-bloc] ${retirees} inscription(s) retirée(s) par ${qui || '?'} (${annee})`);
  }
  res.json({ ok: true, simulation: !!simulation, annee, lignes, retirees, confirmations_retirees: confirmations,
    a_retirer: lignes.filter(l => !l.ambigu && !exclusSet.has(l.etudiant_id)).reduce((n, l) => n + l.retirer.length, 0) });
});

r.post('/doubles-programmes', authRequired,
       roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat'), (req, res) => {
  const { annee, simulation = true, exclus = [] } = req.body || {};
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  const direction = ['admin', 'directeur', 'directeur_adjoint'].includes(req.user.role);
  if (!simulation && !direction) return res.status(403).json({ error: 'La réparation est un geste de direction.' });
  const exclusSet = new Set((Array.isArray(exclus) ? exclus : []).map(Number));
  const perim = getUserSections(req.user);

  const parEtu = new Map();
  for (const x of db.prepare(`SELECT i.etudiant_id, i.ue_num, i.cree_le, i.resultat FROM etudiant_inscription i
      WHERE i.annee_scolaire = ? ORDER BY i.cree_le`).all(annee)) {
    const su = sectionDeLUE(x.ue_num, annee);
    if (!su || su.hc) continue;
    if (!parEtu.has(x.etudiant_id)) parEtu.set(x.etudiant_id, []);
    parEtu.get(x.etudiant_id).push({ ...x, section: su.section });
  }
  const notes = db.prepare('SELECT COUNT(*) AS n FROM etudiant_note_detail WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?');
  const report = db.prepare('SELECT COUNT(*) AS n FROM etudiant_report_note WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?');
  const lignes = [];
  for (const [id, ins] of parEtu) {
    const secs = [...new Set(ins.map(x => x.section))];
    if (secs.length < 2) continue;
    if (perim && !secs.some(x => perim.includes(x))) continue;
    const e = db.prepare('SELECT nom, prenom, id_ecampus, section_rattachement FROM etudiant WHERE id = ?').get(id);
    const hist = sectionsHistoriques(id, annee);
    let garde = null, raison = '', ambigu = false;
    if (e.section_rattachement && secs.includes(e.section_rattachement)) { garde = e.section_rattachement; raison = 'section de rattachement'; }
    // Deux cursus déclarés compatibles se suivent ensemble : rien à réparer.
    const compat = cursusCompatibles();
    if (secs.every(a => secs.every(b => a === b || compat.some(p => p.includes(a) && p.includes(b))))) continue;
    const dansHist = secs.filter(x => hist.includes(x));
    if (garde) {
      // Rattaché ailleurs que son historique : c'est un CHANGEMENT DE CURSUS —
      // l'ancien est archivé, ses inscriptions de cette année s'en vont.
      const anciens = dansHist.filter(x => x !== garde);
      if (anciens.length) raison = `changement de cursus — ${anciens.join(', ')} archivé`;
    } else if (dansHist.length > 1) { ambigu = true; raison = `l'historique connaît ${dansHist.join(' et ')}, et aucun rattachement ne tranche`; }
    else if (dansHist.length === 1) { garde = dansHist[0]; raison = 'section des années antérieures'; }
    else { garde = ins[0].section; raison = 'section inscrite en premier'; }
    const retirer = [], proteges = [];
    for (const x of ins) {
      if (x.section === garde) continue;
      let n = 0, rp = 0;
      try { n = notes.get(id, annee, x.ue_num).n; } catch { /* */ }
      try { rp = report.get(id, annee, x.ue_num).n; } catch { /* */ }
      if (x.resultat) proteges.push({ ue_num: x.ue_num, section: x.section, pourquoi: `résultat « ${x.resultat} »` });
      else if (n) proteges.push({ ue_num: x.ue_num, section: x.section, pourquoi: `${n} note(s)` });
      else if (rp) proteges.push({ ue_num: x.ue_num, section: x.section, pourquoi: 'note reportée' });
      else retirer.push({ ue_num: x.ue_num, section: x.section });
    }
    lignes.push({ etudiant_id: id, nom: e.nom, prenom: e.prenom, id_ecampus: e.id_ecampus,
      sections: secs, garde: ambigu ? null : garde, raison, ambigu, retirer: ambigu ? [] : retirer,
      proteges, autres: ambigu ? ins.filter(x => x.section !== secs[0]).map(x => x.ue_num) : [] });
  }
  lignes.sort((a, b) => (a.ambigu - b.ambigu) || String(a.nom).localeCompare(String(b.nom), 'fr'));

  let retirees = 0;
  if (!simulation) {
    const del = db.prepare('DELETE FROM etudiant_inscription WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ? AND resultat IS NULL');
    db.transaction(() => {
      for (const l of lignes) {
        if (l.ambigu || exclusSet.has(l.etudiant_id)) continue;
        for (const x of l.retirer) retirees += del.run(l.etudiant_id, annee, x.ue_num).changes;
      }
    })();
    console.log(`[doubles-programmes] ${retirees} inscription(s) retirée(s) par ${req.user?.email || '?'} (${annee})`);
  }
  res.json({ ok: true, simulation: !!simulation, annee, lignes,
    a_retirer: lignes.filter(l => !l.ambigu && !exclusSet.has(l.etudiant_id)).reduce((n, l) => n + l.retirer.length, 0),
    retirees });
});

r.post('/pae-modifier', authRequired,
       gesteRequis('etudiants.pae_composer'), (req, res) => {
  const { annee, ajouts = [], retraits = [], simulation = true } = req.body || {};
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  const couples = l => (Array.isArray(l) ? l : []).map(x => [Number(x.etudiant_id), Number(x.ue_num)])
    .filter(([e, u]) => Number.isInteger(e) && e > 0 && Number.isInteger(u) && u >= 0);
  const A = couples(ajouts), R = couples(retraits);
  if (!A.length && !R.length) return res.status(400).json({ error: 'Aucun changement.' });

  const perim = getUserSections(req.user);
  if (perim) {
    const nums = [...new Set([...A, ...R].map(([, u]) => u))];
    const hors = nums.filter(u => {
      const s0 = db.prepare('SELECT section FROM ue WHERE ue_num = ? AND section IS NOT NULL LIMIT 1').get(u)?.section;
      return s0 && !perim.includes(s0);
    });
    if (hors.length) return res.status(403).json({ error: `Unité(s) hors de votre périmètre : ${hors.join(', ')}` });
  }

  const nom = id => { const e = db.prepare('SELECT nom, prenom FROM etudiant WHERE id = ?').get(id); return e ? `${(e.nom || '').toUpperCase()} ${e.prenom || ''}`.trim() : `#${id}`; };

  /* LE GARDE-FOU : une unité d'une autre section que celle du dossier (hors
     cursus excepté) ne s'ajoute pas sans qu'on l'ait voulu. La simulation la
     nomme ; l'écriture la refuse tant que ce n'est pas confirmé. */
  const autreSection = [];
  const secDossier = new Map();
  const rattacheeA = db.prepare('SELECT 1 FROM ue_section WHERE ue_num = ? AND section_code = ? AND annee_scolaire = ?');
  for (const [e, u] of A) {
    const su = sectionDeLUE(u, annee);
    if (!su || su.hc) continue;
    if (!secDossier.has(e)) secDossier.set(e, sectionDuDossier(e, annee));
    const sd = secDossier.get(e);
    // Une unité RATTACHÉE à la section du dossier (ue_section) en fait partie :
    // le tronc commun d'Optométrie, pour un orthoptiste (30 septembre 2026).
    if (sd && sd !== su.section && rattacheeA.get(u, sd, annee)) continue;
    if (sd && sd !== su.section) autreSection.push({ etudiant_id: e, etudiant: nom(e), ue_num: u, section_ue: su.section, section_dossier: sd });
  }
  if (autreSection.length && !simulation && !req.body?.autre_section_confirmee) {
    const n = new Set(autreSection.map(x => x.etudiant_id)).size;
    return res.status(409).json({
      error: `${n} étudiant(s) recevraient des unités d'une autre section que la leur. Rien n'est écrit : confirmez-le si c'est voulu.`,
      autre_section: autreSection.slice(0, 200) });
  }

  /* PAR LA PORTE UNIQUE, ÉTUDIANT PAR ÉTUDIANT (28 septembre 2026). Le « PAE de
     base » coche un bloc entier d'un clic : il reste, mais ses ajouts sont
     jugés comme les autres. Une simulation d'ensemble d'abord — tout ou rien :
     si une unité contrevient à une règle et qu'aucun motif n'est donné, rien
     ne s'écrit, et les écarts sont nommés. Le motif, donné une fois, vaut pour
     tous les écarts du lot et se trace sur chacun. */
  const parEtud = new Map();
  for (const [e, u] of A) { if (!parEtud.has(e)) parEtud.set(e, { a: [], r: [] }); parEtud.get(e).a.push(u); }
  for (const [e, u] of R) { if (!parEtud.has(e)) parEtud.set(e, { a: [], r: [] }); parEtud.get(e).r.push(u); }
  const motif = String(req.body?.motif || '').trim();
  const qui = req.user?.email || req.user?.nom || null;
  const rapport = { ajoutes: 0, deja: 0, retires: 0, absents: 0, proteges: [], ecarts: [], confirmations_retirees: 0,
    autre_section: autreSection.slice(0, 200) };
  const bilans = [];
  for (const [e, { a, r: rr }] of parEtud) {
    const motifs = motif ? Object.fromEntries(a.map(u => [u, motif])) : {};
    const b = ecrireProgramme({ etudId: e, annee, ajouter: a, retirer: rr, origine: 'composition', par: qui, motifs, simulation: true });
    const deja = new Set(db.prepare('SELECT ue_num FROM etudiant_inscription WHERE etudiant_id = ? AND annee_scolaire = ?').all(e, annee).map(x => x.ue_num));
    rapport.deja += a.filter(u => deja.has(u)).length;
    rapport.absents += rr.filter(u => !deja.has(u)).length;
    for (const x of b.conservees) rapport.proteges.push({ etudiant: nom(e), ue_num: x.ue_num, pourquoi: `${x.pourquoi} déjà encodé(es)` });
    for (const x of b.ecarts) rapport.ecarts.push({ etudiant_id: e, etudiant: nom(e), ue_num: x.ue_num, regles: x.regles });
    bilans.push({ e, a, rr, motifs, b });
  }
  rapport.ecarts = rapport.ecarts.slice(0, 300);
  const sansMotif = rapport.ecarts.length && !motif;
  if (!simulation && sansMotif) {
    return res.status(409).json({ error: `${rapport.ecarts.length} ajout(s) contreviennent aux règles du PAE. Rien n'est écrit : donnez un motif, ou retirez-les.`,
      ...rapport });
  }
  for (const x of bilans) { rapport.ajoutes += x.b.ajoutees.length; rapport.retires += x.b.retirees.length; }
  if (!simulation) {
    for (const x of bilans) {
      const b = ecrireProgramme({ etudId: x.e, annee, ajouter: x.a, retirer: x.rr, origine: 'composition', par: qui, motifs: x.motifs });
      if (b.confirmation_retiree) rapport.confirmations_retirees++;
    }
  }
  res.json({ ok: true, simulation: !!simulation, motif_requis: !!sansMotif, ...rapport });
});

/* ── L'HISTORIQUE DE PAE, ENCODÉ À LA MAIN DEPUIS LA GRILLE ────────────────
 * Composer les PAE porte deux vues d'encodage : la coche (réussi/refusé) et
 * la note (>= 10 → réussi, sinon refusé). Chaque écriture vaut pour L'ANNÉE
 * choisie dans la grille — un étudiant a pu échouer l'UE en 2024-2025 et la
 * réussir en 2025-2026 : deux lignes, deux années. Poser un résultat sur une
 * case vide crée l'inscription ; effacer le résultat garde l'inscription. */
r.post('/pae-resultats', authRequired,
       roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat'), (req, res) => {
  const { annee, resultats = [] } = req.body || {};
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  const RES = ['reussi', 'refuse', null];
  const lignes = (Array.isArray(resultats) ? resultats : [])
    .map(x => ({
      etudiant_id: Number(x?.etudiant_id), ue_num: Number(x?.ue_num),
      resultat: RES.includes(x?.resultat ?? null) ? (x?.resultat ?? null) : undefined,
      points: x?.points == null || x.points === '' ? null : Number(x.points),
    }))
    .filter(x => Number.isInteger(x.etudiant_id) && x.etudiant_id > 0
      && Number.isInteger(x.ue_num) && x.resultat !== undefined
      && (x.points === null || (Number.isFinite(x.points) && x.points >= 0 && x.points <= 20)));
  if (!lignes.length) return res.status(400).json({ error: 'Aucun résultat à écrire.' });

  // Même périmètre que la composition : les unités de ses sections.
  const perim = getUserSections(req.user);
  if (perim) {
    const hors = [...new Set(lignes.map(x => x.ue_num))].filter(u =>
      !sectionsDeUE(u).some(s => perim.includes(s)));
    if (hors.length) {
      return res.status(403).json({ error: `Unité(s) hors de votre périmètre : ${hors.join(', ')}` });
    }
  }

  const dateJour = new Date().toISOString().slice(0, 10);
  const poser = db.prepare(`
    INSERT INTO etudiant_inscription
      (etudiant_id, annee_scolaire, ue_num, resultat, points, date_inscription)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(etudiant_id, annee_scolaire, ue_num) DO UPDATE SET
      resultat = excluded.resultat, points = excluded.points`);
  const effacer = db.prepare(`
    UPDATE etudiant_inscription SET resultat = NULL, points = NULL
    WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?`);
  let ecrits = 0, effaces = 0;
  db.transaction(() => {
    for (const x of lignes) {
      if (x.resultat === null && x.points === null) {
        effaces += effacer.run(x.etudiant_id, annee, x.ue_num).changes;
      } else {
        poser.run(x.etudiant_id, annee, x.ue_num, x.resultat, x.points, dateJour);
        ecrits++;
      }
    }
  })();
  res.json({ ok: true, ecrits, effaces });
});

// POST /pae-lot : retiré le 28 septembre 2026 — aucun écran ne l'appelait,
// et il écrivait le programme sans aucune règle. Porte unique : ecrireProgramme().

r.post('/encodage-direct', authRequired,
       roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat'), (req, res) => {
  const { annee, entrees } = req.body || {};
  if (!annee || !Array.isArray(entrees)) {
    return res.status(400).json({ error: 'annee et entrees requises' });
  }

  const dateJour = new Date().toISOString().slice(0, 10);
  const ins = db.prepare(`
    INSERT INTO etudiant_inscription
      (etudiant_id, annee_scolaire, ue_num, resultat, points, date_inscription)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(etudiant_id, annee_scolaire, ue_num) DO UPDATE SET
      resultat = excluded.resultat, points = excluded.points
  `);

  let n = 0;
  const refuses = [];
  db.transaction(() => {
    for (const e of entrees) {
      let points = null;
      if (e.points != null && e.points !== '') {
        points = Number(String(e.points).replace(',', '.'));
        if (!Number.isFinite(points) || points < 0 || points > 20) {
          refuses.push({ etudiant_id: e.etudiant_id, ue_num: e.ue_num, valeur: e.points });
          continue;
        }
      }
      // Le résultat suit la note quand il n'est pas imposé : le seuil de
      // réussite est de 10 sur 20 (RDE, art. 44).
      const resultat = e.resultat
        || (points == null ? null : (points >= 10 ? 'reussi' : 'ajourne'));

      ins.run(Number(e.etudiant_id), annee, Number(e.ue_num), resultat, points, dateJour);
      n++;
    }
  })();

  res.json({ ok: true, enregistres: n, refuses, nb_refuses: refuses.length });
});

// ── Enregistrement par lots depuis la matrice ──────────────────────────────
// Marquer un résultat vaut inscription : la ligne est créée si besoin.
// Effacer un résultat vide la case sans supprimer l'inscription.
r.post('/matrice', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { annee, changements } = req.body;
  if (!annee || !Array.isArray(changements)) {
    return res.status(400).json({ error: 'annee et changements requis' });
  }
  // « refuse » manquait : l'écran ne pouvait donc pas enregistrer une décision
  // de refus, pourtant distincte de l'ajournement dans toute l'application.
  const RES = ['reussi', 'ajourne', 'refuse', 'absent'];
  const dateJour = new Date().toISOString().slice(0, 10);

  // Ce qu'une session accepte. La session 2 ne connaît que la réussite et
  // l'échec : un ajournement n'y a pas de sens, il n'y a pas de troisième tour.
  const RES_S1 = ['reussi', 'echec', 'absent'];
  const RES_S2 = ['reussi', 'echec', 'absent'];

  const ins = db.prepare(`
    INSERT INTO etudiant_inscription
      (etudiant_id, annee_scolaire, ue_num, resultat, resultat_s1, resultat_s2,
       points, points_s1, points_s2, date_inscription)
    VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(etudiant_id, annee_scolaire, ue_num) DO UPDATE SET
      resultat    = excluded.resultat,
      resultat_s1 = COALESCE(excluded.resultat_s1, etudiant_inscription.resultat_s1),
      resultat_s2 = COALESCE(excluded.resultat_s2, etudiant_inscription.resultat_s2),
      points      = COALESCE(excluded.points,      etudiant_inscription.points),
      points_s1   = COALESCE(excluded.points_s1,   etudiant_inscription.points_s1),
      points_s2   = COALESCE(excluded.points_s2,   etudiant_inscription.points_s2)
  `);

  const lire = db.prepare(`
    SELECT resultat_s1, resultat_s2, points_s1, points_s2 FROM etudiant_inscription
    WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?`);

  /** Une note : hors bornes ou illisible, elle ne vaut RIEN, pas zéro. */
  const note = v => {
    if (v == null || v === '') return null;
    const x = Number(String(v).replace(',', '.'));
    return Number.isFinite(x) && x >= 0 && x <= 20 ? x : null;
  };

  let n = 0;
  db.transaction(() => {
    for (const ch of changements) {
      const session = ch.session === 2 ? 2 : ch.session === 1 ? 1 : null;

      if (!session) {
        // Saisie directe de la décision, sans session : on la respecte telle
        // quelle. C'est le cas des reprises et des corrections du Conseil.
        const r0 = ch.resultat && RES.includes(ch.resultat) ? ch.resultat : null;
        ins.run(Number(ch.etudiant_id), annee, Number(ch.ue_num), r0, null, null,
                note(ch.points), null, null, dateJour);
        n++; continue;
      }

      const permis = session === 1 ? RES_S1 : RES_S2;
      const val = ch.resultat && permis.includes(ch.resultat) ? ch.resultat : null;

      const actuel = lire.get(Number(ch.etudiant_id), annee, Number(ch.ue_num)) || {};
      const s1 = session === 1 ? val : (actuel.resultat_s1 ?? null);
      const s2 = session === 2 ? val : (actuel.resultat_s2 ?? null);

      // La décision se DÉDUIT des deux sessions, sauf si le Conseil l'impose.
      const decision = ch.decision_imposee && RES.includes(ch.decision_imposee)
        ? ch.decision_imposee
        : decisionFinale(s1, s2);

      // La note de la session, et celle qui FAIT FOI : la seconde si elle
      // existe, la première sinon — même règle que pour la décision.
      const p = note(ch.points);
      const p1 = session === 1 ? p : (actuel.points_s1 ?? null);
      const p2 = session === 2 ? p : (actuel.points_s2 ?? null);
      const pFoi = p2 ?? p1;

      ins.run(Number(ch.etudiant_id), annee, Number(ch.ue_num), decision,
              session === 1 ? val : null, session === 2 ? val : null,
              pFoi, session === 1 ? p : null, session === 2 ? p : null, dateJour);
      n++;
    }
  })();

  res.json({ ok: true, enregistres: n });
});

// ── Périmètre disponible pour la purge : UE et cours d'une section ──────────
r.get('/purge/perimetre', authRequired, (req, res) => {
  const { section, annee } = req.query;
  const anneeRef = anneeDeTravail(req) || annee;

  const annees = db.prepare(
    'SELECT DISTINCT annee_scolaire FROM etudiant_inscription ORDER BY annee_scolaire DESC'
  ).all().map(r0 => r0.annee_scolaire);

  let ues = [], cours = [];
  if (section) {
    ues = db.prepare(`
      SELECT DISTINCT ue_num, MIN(ue_nom) AS ue_nom FROM ue
      WHERE section = ? AND annee_scolaire IN (?, ?)
      GROUP BY ue_num ORDER BY ue_num
    `).all(section, annee || anneeRef, anneeRef);
    /* LES UNITÉS ORPHELINES (27 septembre 2026 : la 901, renumérotée 333) :
       absentes du référentiel de l'année, elles portent encore des
       inscriptions — et c'est précisément ce qu'on vient vider. Elles
       s'affichent, marquées, sans quoi on ne peut pas les atteindre. */
    const connues = new Set(ues.map(u => u.ue_num));
    for (const o of db.prepare(`
      SELECT i.ue_num, (SELECT MIN(u.ue_nom) FROM ue u WHERE u.ue_num = i.ue_num) AS ue_nom
      FROM etudiant_inscription i
      WHERE i.annee_scolaire = ? AND EXISTS (SELECT 1 FROM ue u WHERE u.ue_num = i.ue_num AND u.section = ?)
      GROUP BY i.ue_num`).all(annee || anneeRef, section)) {
      if (!connues.has(o.ue_num)) ues.push({ ue_num: o.ue_num, ue_nom: `${o.ue_nom || ''} — hors référentiel de l'année`.trim() });
    }
    ues.sort((a, b) => a.ue_num - b.ue_num);
    if (ues.length) {
      cours = db.prepare(`
        SELECT DISTINCT cours_code, MIN(cours_nom) AS cours_nom, ue_num FROM cours
        WHERE ue_num IN (${ues.map(u => u.ue_num).join(',')})
        GROUP BY cours_code ORDER BY cours_code
      `).all();
    }
  }
  res.json({ annees, ues, cours });
});

// ── Étudiants concernés, pour une sélection fine ───────────────────────────
r.get('/purge/etudiants', authRequired, (req, res) => {
  const { annee, section, ue_num } = req.query;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  let ues = null;
  if (ue_num) ues = [Number(ue_num)];
  else if (section) {
    const anneeRef = anneeDeTravail(req) || annee;
    ues = db.prepare(`
      SELECT DISTINCT ue_num FROM ue WHERE section = ? AND annee_scolaire IN (?, ?)
    `).all(section, annee, anneeRef).map(r0 => r0.ue_num);
  }

  const clause = ues && ues.length ? `AND i.ue_num IN (${ues.join(',')})` : '';
  const rows = db.prepare(`
    SELECT e.id, e.nom, e.prenom, e.id_ecampus,
           COUNT(DISTINCT i.ue_num) AS nb_ue,
           SUM(CASE WHEN i.resultat IS NOT NULL THEN 1 ELSE 0 END) AS nb_resultats
    FROM etudiant e
    JOIN etudiant_inscription i ON i.etudiant_id = e.id AND i.annee_scolaire = ?
    WHERE 1=1 ${clause}
    GROUP BY e.id ORDER BY e.nom, e.prenom
  `).all(annee);
  res.json(rows);
});

// ── Purge sélective : section, UE ou cours, sur tout ou partie des étudiants
// Appelée d'abord en simulation pour annoncer ce qui sera touché, puis pour
// de bon. Rien n'est supprimé sans que le compte ait été montré.
r.post('/purge', authRequired, gesteRequis('etudiants.purge'), (req, res) => {
  const {
    annee, section, ue_num, cours_code,
    etudiant_ids,                 // null ou [] = tous les étudiants concernés
    portee = 'resultats',         // resultats | inscriptions
    simulation = true,
  } = req.body;

  if (!annee) return res.status(400).json({ error: 'annee requise' });

  // UE visées : une seule, ou toutes celles de la section, ou aucune limite
  let ues = null;
  if (ue_num) ues = [Number(ue_num)];
  else if (section) {
    const anneeRef = anneeDeTravail(req) || annee;
    ues = db.prepare(`
      SELECT DISTINCT ue_num FROM ue WHERE section = ? AND annee_scolaire IN (?, ?)
    `).all(section, annee, anneeRef).map(r0 => r0.ue_num);
    if (!ues.length) return res.json({ ok: true, simulation, rien: true, message: 'Aucune UE pour cette section.' });
  }

  // Cours visé : restreint aux résultats de cours et aux notes d'acquis
  const cc = cours_code ? String(cours_code).trim() : null;
  if (cc && !ues) {
    const ue = db.prepare('SELECT ue_num FROM cours WHERE cours_code = ? LIMIT 1').get(cc)?.ue_num;
    if (ue != null) ues = [ue];
  }

  const etudiants = Array.isArray(etudiant_ids) && etudiant_ids.length
    ? etudiant_ids.map(Number) : null;

  // Construction des clauses communes
  const cond = (colUe = 'ue_num', colEtud = 'etudiant_id') => {
    const parts = ['annee_scolaire = @annee'];
    const p = { annee };
    if (ues) { parts.push(`${colUe} IN (${ues.join(',')})`); }
    if (etudiants) { parts.push(`${colEtud} IN (${etudiants.join(',')})`); }
    return { where: parts.join(' AND '), p };
  };

  const compter = (table, extra = '') => {
    const { where, p } = cond();
    try {
      return db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}${extra}`).get(p).n;
    } catch { return 0; }
  };

  const clauseCours = cc ? ` AND cours_code = '${cc.replace(/'/g, "''")}'` : '';

  const compte = {
    resultats_cours: compter('etudiant_resultat_cours', clauseCours),
    notes_aa: compter('etudiant_note_detail', clauseCours),
    reports: compter('etudiant_report_note', clauseCours),
    // Les inscriptions et valorisations sont à la maille de l'UE : un filtre
    // par cours ne les concerne pas.
    inscriptions: cc ? 0 : compter('etudiant_inscription'),
    inscriptions_avec_resultat: cc ? 0 : compter('etudiant_inscription', ' AND resultat IS NOT NULL'),
    valorisations: cc ? 0 : compter('etudiant_valorisation'),
    decisions: cc ? 0 : compter('deliberation_resultat', " AND resultat IS NOT NULL AND resultat != ''"),
  };

  // Une purge des inscriptions laissait les décisions du Conseil sans
  // inscription pour les porter (30 septembre 2026) : on ne purge pas ce qui a
  // été délibéré.
  if (!simulation && !cc && portee === 'inscriptions' && compte.decisions > 0) {
    return res.status(409).json({
      error: `${compte.decisions} décision(s) du Conseil portent sur ces inscriptions : elles ne se purgent pas. `
           + 'Restreignez la purge aux résultats, ou corrigez les décisions en séance.',
      compte,
    });
  }

  if (simulation) {
    return res.json({
      ok: true, simulation: true, annee, section: section || null,
      ue_num: ue_num || null, cours_code: cc, portee,
      etudiants: etudiants ? etudiants.length : 'tous',
      compte,
    });
  }

  const supprime = {};
  db.transaction(() => {
    const { where, p } = cond();
    const exec = (sql) => { try { return db.prepare(sql).run(p).changes; } catch { return 0; } };

    supprime.resultats_cours = exec(`DELETE FROM etudiant_resultat_cours WHERE ${where}${clauseCours}`);
    supprime.notes_aa       = exec(`DELETE FROM etudiant_note_detail   WHERE ${where}${clauseCours}`);
    supprime.reports        = exec(`DELETE FROM etudiant_report_note   WHERE ${where}${clauseCours}`);

    if (!cc) {
      if (portee === 'inscriptions') {
        supprime.inscriptions  = exec(`DELETE FROM etudiant_inscription   WHERE ${where}`);
        supprime.valorisations = exec(`DELETE FROM etudiant_valorisation  WHERE ${where}`);
      } else {
        supprime.inscriptions_videes = exec(
          `UPDATE etudiant_inscription SET resultat = NULL, points = NULL WHERE ${where}`);
      }
    }
  })();

  res.json({ ok: true, simulation: false, annee, portee, supprime });
});

// ── Fiche étudiant avec inscriptions ─────────────────────────────────────────
/** Les listes fermées du diplôme (titre d'accès, plus haut diplôme). */
r.get('/listes/diplomes', authRequired, (req, res) => {
  res.json({ titres_acces: TITRES_ACCES, diplomes_max: DIPLOMES_MAX });
});

r.get('/:id', authRequired, (req, res) => {
  const etudiant = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(Number(req.params.id));
  if (!etudiant) return res.status(404).json({ error: 'étudiant introuvable' });

  // Toutes les inscriptions, toutes années — le front groupe par année.
  const inscriptions = db.prepare(`
    SELECT i.*, u.ue_nom, u.ue_niv, u.ue_quad, u.section
    FROM etudiant_inscription i
    LEFT JOIN ${UE_REF} u ON u.ue_num = i.ue_num
    WHERE i.etudiant_id = ?
    ORDER BY i.annee_scolaire DESC, u.section, i.ue_num
  `).all(etudiant.id);

  const anneeAct = anneeDeTravail(req);
  // Un étudiant hors périmètre ne doit pas être consultable par son seul
  // identifiant : masquer la liste sans protéger la fiche ne protège rien.
  const { sections: secEtud } = sectionsDeLEtudiant(etudiant.id, null);
  const autoriseesFiche = perimetre(req);
  if (autoriseesFiche && secEtud.length && !secEtud.some(s => autoriseesFiche.includes(s))) {
    return res.status(403).json({ error: 'Cet étudiant est hors de votre périmètre' });
  }

  res.json({ ...etudiant, inscriptions, niveau: niveauEtudiant(etudiant.id, anneeAct) });
});

// ── Encoder un résultat ───────────────────────────────────────────────────────
r.patch('/inscription/:id', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { resultat, mention, points } = req.body;
  // Les trois décisions de première session, plus l'absence. « refuse » manquait :
  // le serveur aurait rejeté une décision que la circulaire prévoit.
  const RESULTATS = ['reussi', 'ajourne', 'refuse', 'absent', null];
  if (resultat !== undefined && !RESULTATS.includes(resultat)) {
    return res.status(400).json({ error: 'resultat invalide' });
  }

  // La cote est CONSERVÉE quel que soit le résultat : l'établissement doit la
  // connaître — pour la seconde session, pour un recours, pour la délibération.
  // Ce que la circulaire écarte, c'est sa COMMUNICATION : lorsque le seuil
  // n'est pas atteint, les documents remis à l'étudiant portent « NA » et non
  // un nombre. L'effacer aurait fait perdre une information nécessaire.
  db.prepare(`
    UPDATE etudiant_inscription SET resultat = ?, mention = ?, points = ? WHERE id = ?
  `).run(resultat ?? null, mention ?? null, points ?? null, Number(req.params.id));

  res.json({ ok: true });
});

// ── Générer le PAE pour une année ─────────────────────────────────────────────
// Logique : UEs organisées cette année dont les prérequis sont satisfaits
// (l'étudiant les a réussies l'année précédente ou elles n'ont pas de prérequis)
/**
 * COMPOSER LE PROGRAMME D'UN ÉTUDIANT — extrait de sa route pour servir AUSSI
 * en lot.
 *
 * Composer une promotion entière un dossier à la fois est intenable ; et
 * réécrire ailleurs le jeu des prérequis, de l'épreuve intégrée et du point
 * fixe intra-niveau serait pire — deux calculs pour la même chose finissent
 * toujours par diverger, et c'est le programme d'un étudiant qui en pâtirait.
 * Un seul calcul, appelé par la route comme par le lot.
 */
export function composerPAE(profId, annee, options = {}) {
  const anneePrecedente = options.annee_precedente || null;
  const etudiant = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(profId);
  if (!etudiant) return { erreur: 'étudiant introuvable', code: 404 };

  // UEs réussies explicitement (toutes années — un résultat encodé n'expire pas)
  const reussiesExplicites = new Set(
    db.prepare(`
      SELECT DISTINCT ue_num FROM etudiant_inscription
      WHERE etudiant_id = ? AND resultat = 'reussi'
    `).all(profId).map(r => r.ue_num)
  );

  // UEs déjà inscrites pour l'année du PAE (état courant)
  const dejaInscritesAnnee = new Set(
    db.prepare(`
      SELECT ue_num FROM etudiant_inscription
      WHERE etudiant_id = ? AND annee_scolaire = ?
    `).all(profId, annee).map(r => r.ue_num)
  );

  // UEs déjà suivies (toutes années confondues)
  const dejaSuivies = new Set(
    db.prepare(`
      SELECT DISTINCT ue_num FROM etudiant_inscription WHERE etudiant_id = ?
    `).all(profId).map(r => r.ue_num)
  );

  // VA en dispense complète : l'UE est acquise (AGCF art. 4)
  const vaCompletes = new Set(
    db.prepare(`
      SELECT DISTINCT ue_num FROM etudiant_valorisation
      WHERE etudiant_id = ? AND type = 'complete' AND ${vaRetenue()}
    `).all(profId).map(r => r.ue_num)
  );

  // Acquis = réussites explicites ∪ VA complètes.
  // (L'inférence par prérequis n'est plus un acquis automatique : elle est
  //  devenue une suggestion visuelle dans la grille de parcours, où le
  //  secrétariat encode explicitement l'historique.)
  const reussies = new Set([...reussiesExplicites, ...vaCompletes]);

  // Le cadenas et l'attente : voir lib/pae.js (seule règle).

  // Sections de l'étudiant (dominantes) — override possible via ?section=
  // Le cursus EN COURS et ses compatibles ; un cursus archivé ne propose plus rien.
  const { scores: sectionsScores } = sectionsDeLEtudiant(profId, options.section);
  const sectionsEtudiant = options.section ? [options.section] : cursusDe(profId, annee).actifs;

  /* L'ÉTAT DE CHAQUE UNITÉ VIENT DU MOTEUR (lib/pae.js, 28 septembre 2026).
     Ce calcul-ci en était un des sept ; il n'en reste qu'un, que le schéma, la
     frise et le contrôle des écritures lisent aussi. Ici ne reste que la mise
     en forme de la liste. */
  const faits = faitsPAE(profId, annee, sectionsEtudiant);

  // UEs organisées cette année dans ces sections — UNE ligne par UE
  // (une UE peut avoir plusieurs organisations : on ne la propose qu'une fois)
  let organisees = [];
  if (sectionsEtudiant.length) {
    const placeholders = sectionsEtudiant.map(() => '?').join(',');
    organisees = db.prepare(`
      SELECT o.ue_num,
             MIN(o.section) AS section,
             MIN(o.num_organisation) AS num_organisation,
             MIN(o.date_debut) AS date_debut,
             MAX(o.date_fin) AS date_fin,
             MIN(u.ue_nom) AS ue_nom,
             MIN(u.ue_niv) AS ue_niv,
             MIN(u.ue_quad) AS ue_quad
      FROM organisation_ue o
      LEFT JOIN ue u ON u.ue_num = o.ue_num AND u.annee_scolaire = ?
                    AND u.section = o.section
      WHERE o.annee_scolaire = ? AND (o.section IN (${placeholders})
        -- les unités RATTACHÉES à la section (ue_section), organisées par la
        -- section qui les porte : le tronc commun des orthoptistes.
        OR o.ue_num IN (SELECT ue_num FROM ue_section WHERE annee_scolaire = ? AND section_code IN (${placeholders})))
      GROUP BY o.ue_num
      ORDER BY
        CASE UPPER(COALESCE(MIN(u.ue_niv),'')) WHEN 'BA1' THEN 1 WHEN 'BA2' THEN 2 WHEN 'BA3' THEN 3 ELSE 4 END,
        o.ue_num
    `).all(annee, annee, ...sectionsEtudiant, annee, ...sectionsEtudiant);
  }

  const nomUe = db.prepare('SELECT ue_nom FROM ue WHERE ue_num = ? AND annee_scolaire = ? LIMIT 1');
  const pae = [];
  for (const ue of organisees) {
    const e = faits.etats.get(ue.ue_num);
    if (!e) continue;
    pae.push({
      ...ue,
      prerequis: (faits.legal[ue.ue_num] || []).map(p => ({ ue_num_requis: p, ue_nom: nomUe.get(p, annee)?.ue_nom || null })),
      prerequis_ok: !e.prereq_manquants.length,
      // Les prérequis ajournés l'an dernier : la seconde session décidera.
      cadenas: e.cadenas,
      en_attente: e.en_attente,
      epreuve_integree: e.epreuve,
      epreuve_etat: e.epreuve_etat,
      epreuve_restantes: e.epreuve_restantes,
      deja_reussie: e.deja_reussie,
      va_complete: vaCompletes.has(ue.ue_num),
      deja_suivie: dejaSuivies.has(ue.ue_num),
      inscrite: dejaInscritesAnnee.has(ue.ue_num),
      accessible: e.accessible,
      sous_reserve: e.sous_reserve,
      prereq_manquants: e.prereq_manquants,
      prereq_chaine: e.prereq_chaine,
      // Prérequis internes non satisfaits : l'UE reste accessible, l'écran le
      // signale pour que la décision soit prise en connaissance de cause.
      avertissements: e.avertissements.map(x => ({ ue_num: x.ue, motif: x.motif })),
      // Circulaire 9764 : la réinscription dans une UE déjà réussie est possible
      // avec décision favorable du Conseil des études (pièce au dossier).
      reinscriptible_ce: !e.prereq_manquants.length && e.deja_reussie,
      hors_bloc: e.hors_bloc && !dejaInscritesAnnee.has(ue.ue_num),
      plafond_bloc: faits.plafond,
      propose: e.propose,
      propose_sous_reserve: e.propose_sous_reserve,
    });
  }

  // Niveau de rattachement de chaque UE, tel que défini pour la section
  const nivEffectifs = sectionsEtudiant.length
    ? niveauxEffectifs(sectionsEtudiant, annee) : {};
  for (const u of pae) u.ue_niv = nivEffectifs[u.ue_num] || u.ue_niv || null;

  // L'état de confirmation : l'écran doit savoir si le programme est figé ou
  // n'est encore qu'une proposition.
  const confirmation = db.prepare(
    'SELECT confirme_le, confirme_par FROM etudiant_pae WHERE etudiant_id = ? AND annee_scolaire = ?'
  ).get(profId, annee);

  return {
    etudiant,
    annee,
    pae_confirme: !!confirmation?.confirme_le,
    pae_confirme_le: confirmation?.confirme_le || null,
    pae_confirme_par: confirmation?.confirme_par || null,
    annee_precedente: anneePrecedente,
    sections: sectionsEtudiant,
    sections_scores: sectionsScores,
    niveau: niveauEtudiant(profId, annee),
    pae,
    proposition: pae.filter(u => u.propose).map(u => u.ue_num),
    accessibles: pae.filter(u => u.accessible).length,
    reference: 'PAE — Plan Annuel de l\'Étudiant. Basé sur les prérequis de la section et les UE organisées.'
  };
}

/**
 * QUI PEUT PASSER À L'ANNÉE SUIVANTE — et qui attend encore quelque chose.
 *
 * Un programme ne se compose pas sur des résultats provisoires : inscrire un
 * étudiant à la suite alors que sa seconde session n'est pas tranchée, c'est
 * lui promettre une place qu'un refus de septembre lui reprendra.
 *
 * Une unité est ARRIVÉE À SON TERME pour un étudiant dans deux cas, et deux
 * seulement : il l'a réussie en première session — plus rien ne l'attend — ou
 * la session qui le concernait est close. La session qui le concerne est la
 * seconde s'il a été ajourné en juin, la première sinon.
 *
 * LES ANNÉES REPRISES N'ONT PAS DE SÉANCE. Une année importée d'un classeur
 * porte ses décisions mais aucune trace de clôture : exiger la séance y
 * déclarerait tout le monde inadmissible. À défaut de séance, c'est la
 * décision au dossier qui fait foi — et « ajourné » y signifie précisément
 * que quelque chose reste à trancher.
 */
export function admissibilitePAE(etudId, annee, section = null) {
  /* CE QUI N'A RIEN À VOIR AVEC LA SECTION NE RETIENT PAS L'ÉTUDIANT (24
   * septembre 2026). Les deux Akabi ont réussi tout leur BA1 de TIM — et
   * restaient « en attente » à cause d'une inscription à RESTART (UE 95) et
   * au stage d'opticien (UE 185), sans décision au dossier. Une unité en
   * suspens ne compte que si elle pèse sur le programme de la section : si
   * elle en fait partie, ou si elle est le prérequis d'une de ses unités. Les
   * autres restent signalées, mais ne bloquent plus. */
  let pertinentes = null;
  if (section) {
    const ues = db.prepare('SELECT DISTINCT ue_num FROM ue WHERE section = ?')
      .all(section).map(x => x.ue_num);
    pertinentes = new Set(ues);
    if (ues.length) {
      for (const p of db.prepare(`SELECT DISTINCT prerequis_num FROM ue_prerequis
        WHERE ue_num IN (${ues.map(() => '?').join(',')})`).all(...ues)) pertinentes.add(p.prerequis_num);
    }
  }
  const unites = db.prepare(`
    SELECT i.ue_num, i.resultat,
           (SELECT ue_nom FROM ue u WHERE u.ue_num = i.ue_num
             AND u.ue_nom IS NOT NULL ORDER BY u.annee_scolaire DESC LIMIT 1) AS ue_nom
    FROM etudiant_inscription i
    WHERE i.etudiant_id = ? AND i.annee_scolaire = ?
    ORDER BY i.ue_num`).all(etudId, annee);

  const attentes = [], horsSection = [];
  for (const u of unites) {
    const dec = s => db.prepare(`SELECT resultat FROM deliberation_resultat
      WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ? AND session = ?`)
      .get(etudId, annee, u.ue_num, s)?.resultat || null;
    const close = s => !!db.prepare(`SELECT cloturee FROM deliberation_seance
      WHERE ue_num = ? AND annee_scolaire = ? AND session = ?`)
      .get(u.ue_num, annee, s)?.cloturee;

    const s1 = dec(1), s2 = dec(2);

    // Réussi dès juin : rien ne l'attend, même si d'autres repassent en
    // septembre. C'est le cas que Jérôme nomme « admis dès la première ».
    if (s1 === 'reussi' || (!s1 && u.resultat === 'reussi')) continue;

    const aucuneSeance = !db.prepare(`SELECT 1 FROM deliberation_seance
      WHERE ue_num = ? AND annee_scolaire = ?`).get(u.ue_num, annee);

    if (aucuneSeance) {
      // Année reprise : la décision au dossier fait foi.
      if (['reussi', 'refuse', 'absent'].includes(u.resultat)) continue;
      attentes.push({ ...u, raison: u.resultat === 'ajourne'
        ? 'ajourné, seconde session non tranchée'
        : 'aucune décision au dossier' });
      continue;
    }

    // La session qui le concerne : la seconde s'il a été ajourné en juin.
    const ajourneS1 = s1 === 'ajourne' || (!s1 && u.resultat === 'ajourne');
    const session = ajourneS1 ? 2 : 1;
    /* UNE SESSION SANS SÉANCE SE JUGE AU DOSSIER, COMME UNE ANNÉE REPRISE
       (Charles, 28 septembre 2026 : « toutes les autres sont terminées »). La
       règle ne regardait le dossier que si l'unité n'avait AUCUNE séance : la
       246 en avait une en juin, et sa seconde session — importée avec ses 82
       refus et 51 réussites — n'en avait pas. Lucie attendait donc une séance
       de septembre qui n'existera jamais, et 117 étudiants de TIM restaient
       bloqués. Une séance ouverte, elle, bloque toujours : c'est une
       délibération en cours. */
    const seanceSession = db.prepare(`SELECT 1 FROM deliberation_seance
      WHERE ue_num = ? AND annee_scolaire = ? AND session = ?`).get(u.ue_num, annee, session);
    if (!seanceSession) {
      const auDossier = session === 2 ? (s2 || u.resultat) : (s1 || u.resultat);
      if (['reussi', 'refuse', 'absent'].includes(auDossier)) continue;
      attentes.push({ ...u, raison: `session ${session} sans séance, et aucune décision arrêtée au dossier` });
      continue;
    }
    if (!close(session)) {
      attentes.push({ ...u, raison: `séance de session ${session} non clôturée` });
      continue;
    }
    const finale = session === 2 ? (s2 || u.resultat) : (s1 || u.resultat);
    if (!finale || finale === 'ajourne') {
      attentes.push({ ...u, raison: session === 2
        ? 'seconde session close sans décision arrêtée'
        : 'aucune décision arrêtée' });
    }
  }

  // Le tri se fait après coup : la raison reste la même, seul son poids change.
  const bloquantes = pertinentes ? attentes.filter(u => pertinentes.has(u.ue_num)) : attentes;
  if (pertinentes) for (const u of attentes) if (!pertinentes.has(u.ue_num)) horsSection.push(u);

  return { admissible: bloquantes.length === 0, unites: unites.length,
           attentes: bloquantes, hors_section: horsSection };
}

r.get('/:id/pae', authRequired, (req, res) => {
  const annee = req.query.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  const r0 = composerPAE(Number(req.params.id), annee, {
    section: req.query.section, annee_precedente: req.query.annee_precedente });
  if (r0.erreur) return res.status(r0.code || 400).json({ error: r0.erreur });
  res.json(r0);
});

// ── Valider le PAE : synchroniser les inscriptions de l'année ────────────────
// Reçoit la liste retenue par le secrétariat. Insère les manquantes, retire
// celles décochées qui n'ont PAS de résultat encodé (jamais destructif).

/* LE REPORT D'OFFICE SUIT LE PAE (27 septembre 2026) : dès que le programme
   s'écrit, les cours dont tous les acquis ont été maîtrisés l'an passé sont
   reportés. Une erreur ici ne défait pas le PAE : elle se journalise, et le
   rattrapage (Délibération → Reports d'office) la reprendra. */
function reporterDOffice(etudId, annee) {
  try { return poserReportsDOffice(etudId, annee).poses.length; }
  catch (e) { console.error('[report d\'office]', etudId, annee, e.message); return 0; }
}

r.post('/:id/pae-valider', authRequired, gesteRequis('etudiants.pae_valider'), (req, res) => {
  const etudId = Number(req.params.id);
  if (!etudiantPermis(req, res, etudId)) return;
  const { annee, ue_nums, motifs, forcer, simulation } = req.body;
  if (!annee || !Array.isArray(ue_nums)) {
    return res.status(400).json({ error: 'annee et ue_nums requis' });
  }
  const e = db.prepare('SELECT id FROM etudiant WHERE id = ?').get(etudId);
  if (!e) return res.status(404).json({ error: 'étudiant introuvable' });

  // La sélection de l'écran est le programme voulu : ce qui manque s'ajoute,
  // ce qui n'y est plus se retire — par la porte unique, qui juge les ajouts.
  const retenues = new Set(ue_nums.map(Number));
  const existantes = db.prepare('SELECT ue_num FROM etudiant_inscription WHERE etudiant_id = ? AND annee_scolaire = ?')
    .all(etudId, annee).map(x => x.ue_num);
  const b = ecrireProgramme({ etudId, annee, ajouter: [...retenues], retirer: existantes.filter(u => !retenues.has(u)),
    origine: 'pae', par: req.user?.email || req.user?.nom || null, motifs: motifs || {},
    forcerRetrait: !!forcer, simulation: !!simulation });
  if (b.refus.length) {
    return res.status(409).json({ error: `${b.refus.length} unité(s) contreviennent aux règles du PAE : un motif est demandé pour chacune.`,
      refus: b.refus });
  }
  res.json({ ok: true, annee, ajoutees: b.ajoutees.length, retirees: b.retirees.length,
    conservees: b.conservees.length, derogations: b.ecarts.length, confirmation_retiree: b.confirmation_retiree,
    total: retenues.size, reports: b.reports || 0 });
});

// ── LES PROGRAMMES D'UNE PROMOTION, D'UN SEUL GESTE ─────────────────────────
//
// À la fin de septembre, tout est tranché et il faut composer le programme de
// l'année suivante pour toute une section. Le faire dossier par dossier occupe
// une semaine de secrétariat, et c'est une semaine pendant laquelle les
// étudiants ne savent pas à quoi ils sont inscrits.
//
// Chaque étudiant reçoit SON programme, calculé sur SES résultats : les unités
// réussies libèrent la suite, celles qui ne l'ont pas été reviennent au
// programme — c'est le même calcul que la fiche individuelle, appelé en
// boucle, et non un second calcul qui finirait par en différer.
//
// RIEN NE S'ÉCRIT SANS QU'ON AIT VU CE QUI SERA ÉCRIT : la simulation est le
// mode par défaut, et l'écriture se demande.
r.post('/pae-promotion', authRequired,
       gesteRequis('etudiants.promotion'), (req, res) => {
  const { section, annee_source, annee_cible, etudiants, simulation = true } = req.body || {};
  if (!section || !annee_source || !annee_cible) {
    return res.status(400).json({ error: 'section, annee_source et annee_cible requises' });
  }
  if (annee_source === annee_cible) {
    return res.status(400).json({
      error: "L'année de départ et l'année du programme sont les mêmes : le "
           + "programme se compose sur les résultats de l'année écoulée.",
    });
  }
  const perim = getUserSections(req.user);
  if (perim && !perim.includes(section)) {
    return res.status(403).json({ error: 'Cette section est hors de votre périmètre.' });
  }

  // Les étudiants de la section pour l'année écoulée : il n'existe pas
  // d'inscription à une section, seulement des inscriptions aux unités qui la
  // composent — c'est par elles qu'on passe, comme partout ailleurs.
  const uesSection = db.prepare(
    'SELECT DISTINCT ue_num FROM ue WHERE annee_scolaire = ? AND section = ?'
  ).all(annee_source, section).map(x => x.ue_num);
  if (!uesSection.length) {
    return res.status(404).json({
      error: `Aucune unité n'est enregistrée pour la section ${section} en `
           + `${annee_source}.`,
    });
  }
  const gens = db.prepare(`
    SELECT DISTINCT e.id, e.nom, e.prenom, e.id_ecampus
    FROM etudiant e JOIN etudiant_inscription i ON i.etudiant_id = e.id
    WHERE i.annee_scolaire = ? AND i.ue_num IN (${uesSection.map(() => '?').join(',')})
      AND e.actif = 1
    ORDER BY e.nom, e.prenom`).all(annee_source, ...uesSection);

  // Une sélection restreint ; son absence prend toute la promotion.
  const retenus = Array.isArray(etudiants) && etudiants.length
    ? new Set(etudiants.map(Number)) : null;

  /* SUIVRE UNE UE D'UNE SECTION N'EST PAS ÊTRE DE CETTE SECTION (21 septembre
   * 2026). La promotion prenait tout inscrit à l'UNE des unités de la section,
   * puis lui composait le programme COMPLET de cette section : un étudiant de
   * TIM qui suivait une unité partagée d'Optométrie recevait tout le PAE
   * d'Optométrie. Lancée pour les quatre sections, elle a inscrit en 2026-2027
   * des centaines d'étudiants dans des sections qui ne sont pas les leurs.
   * La section de l'étudiant (rattachement, déduction à défaut) décide. */
  const autreSection = [];

  const prets = [], attente = [], rien = [];
  for (const e of gens) {
    if (retenus && !retenus.has(e.id)) continue;
    const sa = sectionRattachement(e.id, annee_source).section;
    if (sa !== section) { autreSection.push({ ...e, section: sa || null }); continue; }
    const adm = admissibilitePAE(e.id, annee_source, section);
    if (!adm.admissible) { attente.push({ ...e, attentes: adm.attentes }); continue; }

    const c = composerPAE(e.id, annee_cible, { section });
    if (c.erreur) { attente.push({ ...e, attentes: [{ raison: c.erreur }] }); continue; }

    const propose = c.pae.filter(u => u.propose);
    // DÉJÀ INSCRIT N'EST PAS À INSCRIRE : on ne recompte pas ce qui existe, et
    // le rapport doit dire ce qui va réellement changer.
    const aInscrire = propose.filter(u => !u.inscrite);
    const ligne = {
      ...e,
      // LE NIVEAU EST UN OBJET, non une chaîne : niveauEtudiant() renvoie
      // { niveau, libelle, detail, annee }. L'écran le rendait tel quel et
      // React refusait d'afficher un objet — l'écran entier tombait au moment
      // même où l'on venait composer les programmes. On n'envoie que ce qui
      // s'affiche.
      niveau: c.niveau && typeof c.niveau === 'object'
        ? (c.niveau.libelle || c.niveau.niveau || null)
        : (c.niveau || null),
      total: propose.length,
      deja: propose.length - aInscrire.length,
      ues: aInscrire.map(u => ({
        ue_num: u.ue_num, ue_nom: u.ue_nom, ue_niv: u.ue_niv,
        epreuve_integree: !!u.epreuve_integree,
        sous_reserve: !!u.propose_sous_reserve,
        // Une unité non réussie qui revient au programme : c'est une reprise,
        // et l'étudiant a le droit de le savoir avant de s'inscrire.
        reprise: !!u.deja_suivie,
      })),
    };
    // Un étudiant dont le programme serait vide n'est pas « prêt » : ou bien il
    // a terminé son cursus, ou bien plus rien ne s'ouvre à lui. Dans les deux
    // cas, c'est une décision humaine, pas une inscription.
    if (!propose.length) rien.push({ ...e, raison: 'aucune unité ne s’ouvre' });
    else prets.push(ligne);
  }

  let ecrits = 0, inscriptions = 0;
  const refuses = [];
  if (!simulation) {
    // Par la porte unique, étudiant par étudiant : chacun est jugé sur SES
    // faits, et un refus n'arrête pas les autres — il est nommé.
    for (const l of prets) {
      const b = ecrireProgramme({ etudId: l.id, annee: annee_cible, ajouter: l.ues.map(u => u.ue_num),
        origine: 'promotion', par: req.user?.email || req.user?.nom || null });
      if (b.refus.length) { refuses.push({ id: l.id, nom: l.nom, prenom: l.prenom, refus: b.refus }); continue; }
      if (b.ajoutees.length) { ecrits++; inscriptions += b.ajoutees.length; }
    }
  }

  res.json({
    section, annee_source, annee_cible, simulation: !!simulation, refuses,
    promotion: gens.length - autreSection.length,
    autre_section: autreSection,
    prets, attente, sans_programme: rien,
    total: {
      prets: prets.length, attente: attente.length, sans_programme: rien.length,
      inscriptions_a_creer: prets.reduce((n, l) => n + l.ues.length, 0),
      etudiants_ecrits: ecrits, inscriptions_creees: inscriptions,
    },
  });
});

// ── PAE auto : inscrire d'un clic LA PROPOSITION ─────────────────────────────
// C'était un second moteur (sans plafond de bloc, sans épreuve intégrée, sur
// les cursus archivés) : un primo-inscrit y recevait du BA2. Il inscrit
// désormais la proposition du moteur unique, par la porte unique.
r.post('/:id/pae-auto', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const etudId = Number(req.params.id);
  const annee = req.body.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  const c = composerPAE(etudId, annee, { section: req.body.section });
  if (c.erreur) return res.status(c.code || 400).json({ error: c.erreur });
  const propose = c.pae.filter(u => u.propose);
  const b = ecrireProgramme({ etudId, annee, ajouter: propose.map(u => u.ue_num), origine: 'pae-auto',
    par: req.user?.email || req.user?.nom || null });
  if (b.refus.length) return res.status(409).json({ error: 'La proposition contrevient aux règles — à signaler.', refus: b.refus });
  res.json({
    ok: true, annee, creees: b.ajoutees.length,
    inscrites: propose.map(u => u.ue_num).sort((x, y) => x - y),
    sous_reserve: Object.fromEntries(propose.filter(u => u.propose_sous_reserve).map(u => [u.ue_num, u.prereq_manquants])),
  });
});

// ── Import du classeur de PAE (résultats par cours + PAE de l'année suivante)
// Le frontend a déjà résolu la légende : il envoie des entrées normalisées.
r.post('/import-pae', authRequired, gesteRequis('etudiants.import'), (req, res) => {
  const { annee_resultats, annee_pae, resultats, pae, commentaires } = req.body;
  if (!annee_resultats || !Array.isArray(resultats)) {
    return res.status(400).json({ error: 'annee_resultats et resultats requis' });
  }

  // cours_code → ue_num, depuis le référentiel (toutes années confondues)
  const ueDeCours = {};
  for (const x of db.prepare('SELECT DISTINCT cours_code, ue_num FROM cours WHERE cours_code IS NOT NULL').all()) {
    ueDeCours[String(x.cours_code).trim()] = x.ue_num;
  }

  const trouver = db.prepare('SELECT id FROM etudiant WHERE id_ecampus = ?');
  const insRes = db.prepare(`
    INSERT INTO etudiant_resultat_cours
      (etudiant_id, annee_scolaire, ue_num, cours_code, statut, note, faveur)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(etudiant_id, annee_scolaire, cours_code) DO UPDATE SET
      statut = excluded.statut, note = excluded.note,
      faveur = excluded.faveur, ue_num = excluded.ue_num
  `);
  const insInsc = db.prepare(`
    INSERT OR IGNORE INTO etudiant_inscription
      (etudiant_id, annee_scolaire, ue_num, date_inscription)
    VALUES (?,?,?,?)
  `);
  const insCom = db.prepare(`
    INSERT INTO etudiant_commentaire_ce (etudiant_id, annee_scolaire, texte, maj_le)
    VALUES (?,?,?, datetime('now'))
    ON CONFLICT(etudiant_id, annee_scolaire) DO UPDATE SET
      texte = excluded.texte, maj_le = datetime('now')
  `);

  const inconnus = new Set(), coursInconnus = new Set();
  let nRes = 0, nPae = 0, nCom = 0, nUE = 0;
  const paeParEtud = new Map();
  const dateJour = new Date().toISOString().slice(0, 10);

  // Réussite d'une UE : tous ses cours connus doivent être réussis, valorisés
  // ou reportés. Un seul refus ou non-présenté suffit à la faire échouer.
  const parEtudiantUE = {};

  db.transaction(() => {
    for (const l of resultats) {
      const e = trouver.get(String(l.id_ecampus || '').trim());
      if (!e) { inconnus.add(l.id_ecampus); continue; }
      const cc = String(l.cours_code || '').trim();
      const ue = ueDeCours[cc] ?? null;
      if (ue == null) coursInconnus.add(cc);
      insRes.run(e.id, annee_resultats, ue, cc, l.statut,
                 l.note != null ? Number(l.note) : null, l.faveur ? 1 : 0);
      nRes++;
      if (ue != null) {
        const cle = e.id + '|' + ue;
        (parEtudiantUE[cle] = parEtudiantUE[cle] || []).push(l.statut);
      }
    }

    // Inscription à l'UE pour l'année des résultats, avec son issue
    for (const [cle, statuts] of Object.entries(parEtudiantUE)) {
      const [eid, ue] = cle.split('|').map(Number);
      const acquis = s => ['reussi', 'va', 'report'].includes(s);
      const resultat = statuts.every(acquis) ? 'reussi'
        : statuts.some(s => s === 'non_presente') && !statuts.some(s => s === 'refuse') ? 'absent'
        : 'ajourne';
      insInsc.run(eid, annee_resultats, ue, dateJour);
      db.prepare(`
        UPDATE etudiant_inscription SET resultat = ?
        WHERE etudiant_id=? AND annee_scolaire=? AND ue_num=? AND resultat IS NULL
      `).run(resultat, eid, annee_resultats, ue);
      nUE++;
    }

    // PAE de l'année suivante : inscriptions non délibérées
    if (annee_pae && Array.isArray(pae)) {
      const vues = new Set();
      for (const l of pae) {
        const e = trouver.get(String(l.id_ecampus || '').trim());
        if (!e) { inconnus.add(l.id_ecampus); continue; }
        const ue = ueDeCours[String(l.cours_code || '').trim()];
        if (ue == null) continue;
        const cle = e.id + '|' + ue;
        if (vues.has(cle)) continue;            // une inscription par UE
        vues.add(cle);
        if (!paeParEtud.has(e.id)) paeParEtud.set(e.id, []);
        paeParEtud.get(e.id).push(ue);
      }
    }

    for (const cm of (commentaires || [])) {
      const e = trouver.get(String(cm.id_ecampus || '').trim());
      if (!e || !cm.texte) continue;
      insCom.run(e.id, annee_resultats, String(cm.texte).trim());
      nCom++;
    }
  })();

  // Le PAE de l'année suivante par la porte unique, en mode « signaler ».
  const aRegulariser = [];
  for (const [id, ues] of paeParEtud) {
    const b = ecrireProgramme({ etudId: id, annee: annee_pae, ajouter: ues, origine: 'import du classeur de PAE',
      par: req.user?.email || req.user?.nom || null, mode: 'signaler', dateInscription: dateJour });
    nPae += b.ajoutees.length;
    for (const x of b.ecarts) aRegulariser.push({ etudiant_id: id, ue_num: x.ue_num, regles: x.regles.map(r0 => r0.libelle) });
  }

  res.json({
    ok: true, a_regulariser: aRegulariser.length, a_regulariser_liste: aRegulariser.slice(0, 200),
    resultats_cours: nRes, ue_deduites: nUE, pae_creees: nPae, commentaires: nCom,
    matricules_inconnus: [...inconnus].slice(0, 25),
    cours_inconnus: [...coursInconnus].slice(0, 25),
  });
});

// ── Import des résultats depuis le classeur de suivi (.xlsm) ─────────────────
// Le frontend lit les onglets par UE et envoie { annee, resultats: [...] }.
r.post('/import-resultats', authRequired, gesteRequis('etudiants.import'), (req, res) => {
  const { annee, resultats } = req.body;
  if (!annee || !Array.isArray(resultats)) {
    return res.status(400).json({ error: 'annee et resultats requis' });
  }

  const findEtud = db.prepare('SELECT id FROM etudiant WHERE id_ecampus = ?');
  const upsert = db.prepare(`
    INSERT INTO etudiant_inscription (etudiant_id, annee_scolaire, ue_num, resultat, points)
    VALUES (?,?,?,?,?)
    ON CONFLICT(etudiant_id, annee_scolaire, ue_num) DO UPDATE SET
      resultat = excluded.resultat,
      points = COALESCE(excluded.points, points)
  `);

  let maj = 0, inconnus = [];
  const tx = db.transaction(() => {
    for (const r0 of resultats) {
      const e = findEtud.get(String(r0.id_ecampus || '').trim());
      if (!e) { inconnus.push(r0.id_ecampus); continue; }
      const resultat = ['reussi','ajourne','absent'].includes(r0.resultat) ? r0.resultat : null;
      const points = r0.points != null && !isNaN(Number(r0.points)) ? Number(r0.points) : null;
      upsert.run(e.id, annee, Number(r0.ue_num), resultat, points);
      maj++;
    }
  });
  tx();

  res.json({ ok: true, maj, inconnus: [...new Set(inconnus)].slice(0, 20) });
});

// ── Schéma de capitalisation d'un étudiant ──────────────────────────────────
// Le graphe (nœuds, arêtes, colonnes) est construit par le module
// capitalisation, qui fait autorité sur l'année d'études de chaque UE.
// On n'y superpose ici que l'état de l'étudiant.
// L'état d'une UE pour un étudiant : lib/pae.js, seule règle (28 septembre 2026).
/* LES ÉTATS DU SCHÉMA DE CAPITALISATION, pour l'écran ET pour la pièce
 * imprimée (2.12.220, Charles : « utiliser le même design que l'écran pour
 * l'impression du schéma »). Deux calculs donnaient deux schémas : la fiche
 * imprimée ignorait la faveur, l'attente de seconde session et le « sous
 * réserve ». Une fonction, deux lecteurs. */
export function donneesCapitalisation(etudId, annee, sectionForcee = null) {
  const cur = sectionForcee ? null : cursusDe(etudId, annee);
  const sections = sectionForcee ? [sectionForcee] : cur.actifs;
  const archives = cur ? cur.archives : [];
  if (!sections.length) return { nodes: [], edges: [], colonnes: [], sections: [], archives };

  const acquis = new Set([
    ...db.prepare("SELECT DISTINCT ue_num FROM etudiant_inscription WHERE etudiant_id = ? AND resultat = 'reussi'").all(etudId).map(r0 => r0.ue_num),
    ...db.prepare(`SELECT DISTINCT ue_num FROM etudiant_valorisation WHERE etudiant_id = ? AND type = 'complete' AND ${vaRetenue()}`).all(etudId).map(r0 => r0.ue_num),
  ]);
  const inscrites = new Set(
    db.prepare('SELECT ue_num FROM etudiant_inscription WHERE etudiant_id = ? AND annee_scolaire = ?')
      .all(etudId, annee).map(r0 => r0.ue_num));
  /* LA NOTE ET L'ANNÉE D'UNE UE ACQUISE (Charles, 25 septembre 2026 : « dans
     l'UE réussie, la note et l'année »). La réussite la plus récente fait foi ;
     une valorisation se dit « VA », avec son année. */
  const reussite = {};
  /* LA FAVEUR ET LA SECONDE SESSION SE VOIENT (Charles, 25 septembre 2026 :
     « si faveur c'est violet », avec le cadeau de la délibération). La faveur
     se lit là où le Conseil la pose — un ajustement de délibération — ou là où
     l'import de l'historique l'a reprise, cours par cours. */
  const avecFaveur = new Set();
  const cleFaveur = (ue, an) => `${ue}|${an}`;
  try {
    for (const f of db.prepare(`SELECT DISTINCT ue_num, annee_scolaire FROM deliberation_ajustement
        WHERE etudiant_id = ? AND action = 'faveur'`).all(etudId)) avecFaveur.add(cleFaveur(f.ue_num, f.annee_scolaire));
  } catch { /* table absente */ }
  try {
    for (const f of db.prepare(`SELECT DISTINCT ue_num, annee_scolaire FROM etudiant_resultat_cours
        WHERE etudiant_id = ? AND faveur = 1 AND ue_num IS NOT NULL`).all(etudId)) avecFaveur.add(cleFaveur(f.ue_num, f.annee_scolaire));
  } catch { /* table absente */ }
  let colS2 = false;
  try { colS2 = db.prepare('PRAGMA table_info(etudiant_inscription)').all().some(c => c.name === 'resultat_s2'); } catch { /* */ }
  for (const r0 of db.prepare(`SELECT ue_num, annee_scolaire, points, ${colS2 ? 'resultat_s2' : 'NULL'} AS s2
      FROM etudiant_inscription
      WHERE etudiant_id = ? AND resultat = 'reussi' ORDER BY annee_scolaire`).all(etudId)) {
    reussite[r0.ue_num] = { annee: r0.annee_scolaire, note: r0.points ?? null, va: false,
      faveur: avecFaveur.has(cleFaveur(r0.ue_num, r0.annee_scolaire)), s2: !!r0.s2 };
  }
  for (const v of db.prepare(`SELECT ue_num, annee_scolaire FROM etudiant_valorisation
      WHERE etudiant_id = ? AND type = 'complete' AND ${vaRetenue()}
      ORDER BY annee_scolaire`).all(etudId)) {
    if (!reussite[v.ue_num]) reussite[v.ue_num] = { annee: v.annee_scolaire, note: null, va: true };
  }
  /* L'ÉTAT DE CHAQUE UNITÉ VIENT DU MOTEUR (lib/pae.js) — le même que la
     proposition du PAE : le schéma ne peut plus dire « indisponible » d'une
     unité que la liste d'à côté propose avec un cadenas. */
  const faits = faitsPAE(etudId, annee, sections);
  const etatDe = n => faits.etats.get(n);

  const g = construireGraphe({
    sections, annee,
    etat: n => ({
      statut: etatDe(n)?.statut || 'bloquee',
      inscrite: inscrites.has(n),
      organisee: !!etatDe(n)?.organisee,
      reussite: acquis.has(n) ? (reussite[n] || null) : null,
      prereq_manquants: etatDe(n)?.prereq_manquants || [],
      cadenas: etatDe(n)?.cadenas || [],
      hors_bloc: !!etatDe(n)?.hors_bloc,
    }),
  });

  /* DEUX REPÈRES SUR LA TUILE (Charles, 2 octobre 2026) : l'unité a déjà été
     REFUSÉE une fois (cercle rouge, en haut à gauche), et elle est
     DÉTERMINANTE pour la mention (cercle marine, en haut à droite). */
  const refusees = new Set(db.prepare(`SELECT DISTINCT ue_num FROM etudiant_inscription
      WHERE etudiant_id = ? AND resultat = 'refuse'`).all(etudId).map(r0 => r0.ue_num));
  const nums = (g.nodes || []).map(n => n.ue_num);
  const determinantes = new Set(nums.length ? db.prepare(`SELECT DISTINCT ue_num FROM ue
      WHERE ue_det = 'x' AND ue_num IN (${nums.map(() => '?').join(',')})`).all(...nums).map(r0 => r0.ue_num) : []);
  for (const n of g.nodes || []) { n.refusee = refusees.has(n.ue_num); n.determinante = determinantes.has(n.ue_num); }

  return { ...g, sections, annee, archives };
}

/* RETIRER LES INSCRIPTIONS D'UN CURSUS ARCHIVÉ (Charles, 28 septembre 2026 :
 * « comment faire pour retirer ? »). Le bandeau le demandait sans offrir la
 * porte : un constat sans porte est un constat qu'on relit chaque matin. Par
 * la porte unique : ce qui porte un résultat, une note ou un report reste, et
 * la réponse le nomme. Simulation d'abord. */
r.post('/:id/cursus-archive/retirer', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const etudId = Number(req.params.id);
  const { annee, section, simulation = true } = req.body || {};
  if (!annee || !section) return res.status(400).json({ error: 'annee et section requises' });
  const cur = cursusDe(etudId, annee);
  if (!cur.archives.some(a => a.section === section)) {
    return res.status(409).json({ error: `${section} n'est pas un cursus archivé de cet étudiant.` });
  }
  const ues = db.prepare(`SELECT i.ue_num FROM etudiant_inscription i WHERE i.etudiant_id = ? AND i.annee_scolaire = ?
    AND i.ue_num IN (SELECT ue_num FROM ue WHERE section = ? AND COALESCE(hors_cursus,0) = 0)`)
    .all(etudId, annee, section).map(x => x.ue_num);
  const b = ecrireProgramme({ etudId, annee, retirer: ues, origine: 'retrait du cursus archivé',
    par: req.user?.email || req.user?.nom || null, simulation: simulation !== false });
  res.json({ ok: true, simulation: simulation !== false, section, retirees: b.retirees, conservees: b.conservees,
    confirmation_retiree: b.confirmation_retiree });
});

/* REPRENDRE UN CURSUS ARCHIVÉ (Charles, 30 septembre 2026 : « inscrit en opto,
 * parcours antérieur en TIM ; je veux le faire sortir d'opto et l'intégrer en
 * TIM »). Le cursus en cours se déduit des inscriptions de l'année — donc ici
 * de l'erreur même. Le rattachement DÉCLARÉ prime (cursusDe) : on le pose sur
 * la section reprise, et celle d'aujourd'hui devient à son tour un cursus
 * archivé, dont les inscriptions de l'année se retirent par le geste qui
 * existe déjà (« Retirer ces inscriptions », simulation d'abord). Le geste est
 * signé et daté sur la fiche. */
r.post('/:id/cursus/reprendre', authRequired,
  roleRequired('admin', 'editeur', 'directeur', 'directeur_adjoint', 'secretariat'), (req, res) => {
  const etudId = Number(req.params.id);
  const { annee, section } = req.body || {};
  if (!annee || !section) return res.status(400).json({ error: 'annee et section requises' });
  if (!db.prepare('SELECT 1 FROM section WHERE code = ?').get(section)) {
    return res.status(404).json({ error: `Section inconnue : ${section}.` });
  }
  const permises = perimetre(req);
  if (permises && !permises.includes(section)) return res.status(403).json({ error: 'Section hors de votre périmètre.' });
  const cols = db.prepare('PRAGMA table_info(etudiant)').all().map(c => c.name);
  for (const c of ['rattachement_par', 'rattachement_le']) if (!cols.includes(c)) db.exec(`ALTER TABLE etudiant ADD COLUMN ${c} TEXT`);
  const avant = cursusDe(etudId, annee).courant;
  db.prepare(`UPDATE etudiant SET section_rattachement = ?, rattachement_par = ?, rattachement_le = datetime('now') WHERE id = ?`)
    .run(section, req.user?.nom || req.user?.email || null, etudId);
  const apres = cursusDe(etudId, annee);
  res.json({ ok: true, avant, courant: apres.courant, archives: apres.archives });
});

r.get('/:id/capitalisation', authRequired, (req, res) => {
  const etudId = Number(req.params.id);
  const annee = req.query.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  const e = db.prepare('SELECT id FROM etudiant WHERE id = ?').get(etudId);
  if (!e) return res.status(404).json({ error: 'étudiant introuvable' });
  res.json(donneesCapitalisation(etudId, annee, req.query.section));
});

// ── Purge d'une année pour un étudiant ──────────────────────────────────────
// Deux portées : « resultats » vide les notes en gardant les inscriptions,
// « tout » supprime les inscriptions de l'année et ce qui s'y rattache.
/* POSER UN STATUT DE SORTIE SUR UN LOT — diplômé, sorti, archivé, ou
 * `null` pour réintégrer. Chaque étudiant est jugé contre le périmètre de
 * celui qui agit : une coordination n'archive pas la section d'une autre.
 * Le geste est signé et daté sur la fiche. */
r.post('/statut', authRequired, roleRequired(...PEUT_INSTRUIRE), (req, res) => {
  const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter(Boolean);
  const statut = req.body?.statut ?? null;
  const motif = String(req.body?.motif || '').trim() || null;
  if (!ids.length) return res.status(400).json({ error: 'Aucun étudiant.' });
  if (statut !== null && !['diplome', 'sorti', 'archive'].includes(statut)) {
    return res.status(400).json({ error: 'Statut inconnu.' });
  }
  const permises = perimetre(req);
  const dansPerimetre = id => {
    if (!permises) return true;
    const { sections } = sectionsDeLEtudiant(id, null);
    const rat = db.prepare('SELECT section_rattachement FROM etudiant WHERE id = ?').get(id)?.section_rattachement;
    const toutes = [...new Set([...sections, ...(rat ? [rat] : [])])];
    return !toutes.length || toutes.some(x => permises.includes(x));
  };
  const par = req.user?.nom || req.user?.email || null;
  const poser = db.prepare(`UPDATE etudiant SET sortie_statut = ?, sortie_le = ?,
    sortie_par = ?, sortie_motif = ? WHERE id = ?`);
  let faits = 0; const refuses = [];
  db.transaction(() => {
    for (const id of ids) {
      if (!db.prepare('SELECT 1 FROM etudiant WHERE id = ?').get(id)) continue;
      if (!dansPerimetre(id)) { refuses.push(id); continue; }
      poser.run(statut, statut ? new Date().toISOString().slice(0, 10) : null,
        statut ? par : null, statut ? motif : null, id);
      faits++;
    }
  })();
  res.json({ ok: true, faits, refuses });
});

/* SUPPRIMER UN ÉTUDIANT — directement, mais jamais à l'aveugle (Jérôme,
 * 30 septembre 2026 : « je ne sais pas facilement supprimer les étudiants »).
 *
 * La suppression est DESTRUCTRICE : elle emporte inscriptions, notes,
 * décisions, valorisations, suivi. La route répond donc en deux temps :
 *   1. sans ?force=1 et si le dossier porte des données → 409 avec
 *      L'INVENTAIRE de ce qui serait emporté — l'écran le montre, la
 *      personne confirme en sachant quoi ;
 *   2. avec ?force=1 (direction uniquement) ou dossier vide (direction et
 *      secrétariat) → suppression en transaction, table par table.
 * Une fiche portant des DÉCISIONS de délibération se supprime, mais c'est un
 * geste de direction : effacer un dossier notifié n'est pas de l'entretien. */
r.delete('/:id', authRequired, gesteRequis('etudiants.supprimer'), (req, res) => {
  const id = Number(req.params.id);
  const e = db.prepare('SELECT id, nom, prenom FROM etudiant WHERE id = ?').get(id);
  if (!e) return res.status(404).json({ error: 'Étudiant introuvable.' });

  const compte = (table, colonne = 'etudiant_id') => {
    try { return db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${colonne} = ?`).get(id).n; }
    catch { return 0; }
  };
  const inventaire = {
    inscriptions: compte('etudiant_inscription'),
    notes: compte('etudiant_note_detail'),
    decisions: compte('deliberation_resultat'),
    valorisations: compte('etudiant_valorisation'),
    suivi: compte('etudiant_suivi'),
    groupes: compte('etudiant_cours_groupe'),
  };
  const total = Object.values(inventaire).reduce((a, b) => a + b, 0);
  const direction = ['admin', 'directeur', 'directeur_adjoint'].includes(req.user.role);

  if (total > 0 && req.query.force !== '1') {
    return res.status(409).json({
      confirmation_requise: true, etudiant: `${String(e.nom || '').toUpperCase()} ${e.prenom || ''}`.trim(), inventaire, total,
      force_permis: direction,
    });
  }
  if (total > 0 && !direction) {
    return res.status(403).json({
      error: 'Ce dossier porte des données : seule la direction peut le supprimer. '
           + 'Le secrétariat supprime les fiches vides (doublons, erreurs de saisie).',
      inventaire,
    });
  }

  db.transaction(() => {
    for (const t of ['etudiant_inscription', 'etudiant_note_detail', 'deliberation_resultat',
                     'etudiant_valorisation', 'etudiant_suivi', 'etudiant_cours_groupe',
                     'note_proposee', 'etudiant_report_note']) {
      try { db.prepare(`DELETE FROM ${t} WHERE etudiant_id = ?`).run(id); } catch { /* table absente */ }
    }
    db.prepare('DELETE FROM etudiant WHERE id = ?').run(id);
  })();
  res.json({ ok: true, supprime: `${String(e.nom || '').toUpperCase()} ${e.prenom || ''}`.trim(), donnees_emportees: total });
});

r.delete('/:id/annee/:annee', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const etudId = Number(req.params.id);
  const annee = req.params.annee;
  const portee = req.query.portee === 'tout' ? 'tout' : 'resultats';

  const e = db.prepare('SELECT id FROM etudiant WHERE id = ?').get(etudId);
  if (!e) return res.status(404).json({ error: 'étudiant introuvable' });

  const avant = db.prepare(
    'SELECT COUNT(*) AS n FROM etudiant_inscription WHERE etudiant_id=? AND annee_scolaire=?'
  ).get(etudId, annee).n;

  /* UNE DÉCISION DU CONSEIL NE S'EFFACE PAS PAR LA FICHE (30 septembre 2026,
     ABDO R.). Cette route effaçait inscriptions et notes, jamais
     deliberation_resultat : la décision restait, sans inscription pour la
     porter — l'étudiante se lisait « primo », ses UE réussies ne comptaient
     plus. Une année délibérée se corrige en séance, elle ne se supprime pas. */
  const deliberees = db.prepare(`SELECT DISTINCT ue_num FROM deliberation_resultat
    WHERE etudiant_id = ? AND annee_scolaire = ? AND resultat IS NOT NULL AND resultat != ''
    ORDER BY ue_num`).all(etudId, annee).map(x => x.ue_num);
  if (deliberees.length) {
    return res.status(409).json({
      error: `Cette année porte des décisions du Conseil (UE ${deliberees.join(', ')}) : elle ne se supprime pas. `
           + 'Une décision se corrige en séance (Délibération → Corriger ou rouvrir…).',
      ue: deliberees,
    });
  }

  let notes = 0, inscriptions = 0, valorisations = 0;
  db.transaction(() => {
    notes = db.prepare(
      'DELETE FROM etudiant_note_detail WHERE etudiant_id=? AND annee_scolaire=?'
    ).run(etudId, annee).changes;

    try {
      db.prepare('DELETE FROM etudiant_report_note WHERE etudiant_id=? AND annee_scolaire=?')
        .run(etudId, annee);
    } catch { /* table absente */ }

    if (portee === 'tout') {
      inscriptions = db.prepare(
        'DELETE FROM etudiant_inscription WHERE etudiant_id=? AND annee_scolaire=?'
      ).run(etudId, annee).changes;
      valorisations = db.prepare(
        'DELETE FROM etudiant_valorisation WHERE etudiant_id=? AND annee_scolaire=?'
      ).run(etudId, annee).changes;
    } else {
      db.prepare(`
        UPDATE etudiant_inscription SET resultat = NULL, points = NULL
        WHERE etudiant_id=? AND annee_scolaire=?
      `).run(etudId, annee);
    }
  })();

  res.json({ ok: true, annee, portee, avant, inscriptions, notes, valorisations });
});

// ── Grille de parcours : UE (lignes, BA1→BA3) × années (colonnes) ────────────
r.get('/:id/grille', authRequired, (req, res) => {
  const etudId = Number(req.params.id);
  const e = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(etudId);
  if (!e) return res.status(404).json({ error: 'étudiant introuvable' });

  // Année active pour le référentiel UE
  const anneeActive = anneeDeTravail(req);

  /* LES SECTIONS DE LA GRILLE SONT CELLES DU CURSUS (5 octobre 2026, DUMOULIN
     Xavier, optométriste : la grille affichait toute la section TIM). Elle
     retenait toute section qui pesait 60 % de la dominante — une règle que le
     schéma et le PAE ont quittée le 27 septembre pour le cursus en cours, ses
     compatibles, et les autres ARCHIVÉS. Deux règles pour un même fait : la
     grille ouvrait un cursus archivé en entier. Elle lit désormais cursusDe() ;
     une UE suivie dans un cursus archivé reste visible, marquée « autre
     section ». ?section= garde la main. */
  const { sections: dominantes, scores: sectionsScores } = sectionsDeLEtudiant(etudId, req.query.section);
  const sections = req.query.section ? dominantes
    : (() => { const c = cursusDe(etudId, anneeActive); return c.actifs?.length ? c.actifs : dominantes; })();

  // Les UE de la section (référentiel année active), triées BA1→BA3 puis numéro
  let ues = [];
  if (sections.length) {
    const ph = sections.map(() => '?').join(',');
    ues = db.prepare(`
      SELECT DISTINCT ue_num, ue_nom, ue_niv, section FROM ue
      WHERE annee_scolaire = ? AND section IN (${ph})
      ORDER BY
        CASE UPPER(COALESCE(ue_niv,'')) WHEN 'BA1' THEN 1 WHEN 'BA2' THEN 2 WHEN 'BA3' THEN 3 ELSE 4 END,
        ue_num
    `).all(anneeActive, ...sections);
  }

  // Une UE à laquelle l'étudiant est inscrit mais qui ne figure pas au
  // référentiel de sa section — autre section, ou millésime disparu — doit
  // tout de même apparaître : sans quoi elle serait invisible.
  const connues = new Set(ues.map(u => u.ue_num));
  const orphelines = db.prepare(`
    SELECT DISTINCT i.ue_num,
           (SELECT ue_nom  FROM ue x WHERE x.ue_num = i.ue_num ORDER BY x.annee_scolaire DESC LIMIT 1) AS ue_nom,
           (SELECT ue_niv  FROM ue x WHERE x.ue_num = i.ue_num ORDER BY x.annee_scolaire DESC LIMIT 1) AS ue_niv,
           (SELECT section FROM ue x WHERE x.ue_num = i.ue_num ORDER BY x.annee_scolaire DESC LIMIT 1) AS section
    FROM etudiant_inscription i WHERE i.etudiant_id = ?
  `).all(etudId).filter(u => !connues.has(u.ue_num));
  for (const o of orphelines) {
    // « Hors référentiel » ne doit désigner que ce qui l'est vraiment : une UE
    // d'une AUTRE section, ou dont la section est inconnue. Une unité de la
    // section de l'étudiant, simplement absente du millésime actif ou écartée
    // parce que sa section n'a pas atteint le seuil de dominance, appartient
    // bien à son programme — l'afficher comme étrangère induisait en erreur.
    const memeSection = o.section && sections.includes(o.section);
    ues.push({
      ...o,
      ue_nom: o.ue_nom || `UE ${o.ue_num}`,
      hors_referentiel: !memeSection,
      hors_millesime: memeSection,
    });
  }

  // Prérequis par UE
  const prereqs = db.prepare('SELECT ue_num, prerequis_num FROM ue_prerequis').all();
  const prereqDe = {};
  for (const p of prereqs) {
    (prereqDe[p.ue_num] = prereqDe[p.ue_num] || []).push(p.prerequis_num);
  }

  // Cellules : inscriptions + VA complètes
  const inscriptions = db.prepare(
    'SELECT * FROM etudiant_inscription WHERE etudiant_id = ?').all(etudId);
  const vas = db.prepare(
    `SELECT * FROM etudiant_valorisation WHERE etudiant_id = ? AND type = 'complete' AND ${vaRetenue()}`).all(etudId);

  const cellules = {};
  for (const i of inscriptions) {
    (cellules[i.annee_scolaire] = cellules[i.annee_scolaire] || {})[i.ue_num] = {
      kind: i.resultat || 'inscrit', points: i.points, derogation: !!i.derogation, id: i.id,
    };
  }
  for (const v of vas) {
    (cellules[v.annee_scolaire] = cellules[v.annee_scolaire] || {})[v.ue_num] = {
      kind: 'va', points: vaSur20(v.pourcentage), derogation: false, vid: v.id,
    };
  }
  // La faveur : posée par le Conseil (ou dans cette grille) sur l'unité, ou
  // reprise de l'historique cours par cours. La case la montre — violet, cadeau.
  try {
    for (const f of db.prepare(`SELECT DISTINCT ue_num, annee_scolaire FROM deliberation_ajustement
        WHERE etudiant_id = ? AND action = 'faveur'`).all(etudId)) {
      const c = cellules[f.annee_scolaire]?.[f.ue_num];
      if (c && c.kind === 'reussi') c.faveur = true;
    }
  } catch { /* table absente */ }

  // Années : celles des données + année active, triées
  const annees = [...new Set([...Object.keys(cellules), anneeActive].filter(Boolean))].sort();

  // Acquis explicites (réussite ou VA, toutes années)
  const acquis = new Set();
  for (const [, parUe] of Object.entries(cellules)) {
    for (const [ueNum, cell] of Object.entries(parUe)) {
      if (cell.kind === 'reussi' || cell.kind === 'va') acquis.add(Number(ueNum));
    }
  }

  // Suggestion (inférence) : prérequis transitifs des UE inscrites — aide à l'encodage
  const inscritesToutes = new Set(inscriptions.map(i => i.ue_num));
  const suggerees = new Set();
  const pile = [...inscritesToutes];
  const prereqMap = new Map(Object.entries(prereqDe).map(([k, v]) => [Number(k), v]));
  while (pile.length) {
    const ue = pile.pop();
    for (const pr of (prereqMap.get(ue) || [])) {
      if (!suggerees.has(pr)) { suggerees.add(pr); pile.push(pr); }
    }
  }

  // Cellules avec notes détaillées (pour l'indicateur visuel)
  const detailSet = db.prepare(`
    SELECT DISTINCT annee_scolaire, ue_num FROM etudiant_note_detail WHERE etudiant_id = ?
  `).all(etudId).map(d => d.annee_scolaire + ':' + d.ue_num);

  res.json({
    etudiant: { id: e.id, nom: e.nom, prenom: e.prenom },
    sections, sections_scores: sectionsScores, annees, anneeActive, detail: detailSet,
    ues: ues.map(u => ({
      ...u,
      prerequis: prereqDe[u.ue_num] || [],
      hors_referentiel: !!u.hors_referentiel,
      hors_millesime: !!u.hors_millesime,
      // Verrou TRANSITIF : la chaîne entière doit être acquise. Exiger la 255
      // pour la 256 ne suffit pas si la 255 exige elle-même la 254.
      prereq_chaine: (() => {
        const m = new Set(), vus = new Set(), pile = [u.ue_num];
        while (pile.length) {
          const n = pile.pop();
          if (vus.has(n)) continue;
          vus.add(n);
          for (const p of (prereqDe[n] || [])) {
            if (acquis.has(p)) continue;
            m.add(p); pile.push(p);
          }
        }
        return [...m].sort((a, b) => a - b);
      })(),
      deverrouillee: (prereqDe[u.ue_num] || []).every(p => acquis.has(p)),
      acquise: acquis.has(u.ue_num),
      suggeree: suggerees.has(u.ue_num) && !acquis.has(u.ue_num),
    })),
    cellules,
  });
});

// ── Écrire une cellule de la grille ──────────────────────────────────────────
/* ── DÉPLACER DES CASES D'UNE ANNÉE À L'AUTRE, DANS LA FICHE ────────────────
 *
 * Demandé par Charles le 25-26 septembre 2026 : faire glisser, dans la grille
 * du parcours, une case — et plusieurs à la fois — vers la bonne année. C'est
 * la réparation d'un historique rangé dans la mauvaise colonne : on déplace
 * l'INSCRIPTION et tout ce qui la suit (notes d'acquis, reports, résultats par
 * cours, faveurs et ajournements, décisions par session, motivations).
 *
 * Tranché le 26 septembre :
 *   · ARRIVÉE OCCUPÉE — si l'inscription d'arrivée est vide (ni résultat, ni
 *     note, ni trace de délibération), la case déplacée la remplace ; sinon le
 *     lot est refusé, et l'écran nomme la case.
 *   · MOTIF POUR TOUS — un motif écrit, une fois pour le lot, et une ligne de
 *     journal par case : qui, quand, de quelle année vers laquelle. Une
 *     décision notifiée peut être déplacée ; elle ne l'est jamais en silence.
 *   · DROITS — ceux de l'encodage de la grille.
 *
 * Ce qui ne se déplace PAS d'ici : une valorisation (elle a son circuit, son
 * journal et sa séance — elle se corrige dans l'écran Valorisation), et un
 * stage (un objet à part, avec son lieu et ses dates).
 *
 * TOUT OU RIEN, et simulation d'abord : « rien ne s'écrit sans qu'on ait vu ce
 * qui sera écrit ».
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS etudiant_deplacement (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    etudiant_id  INTEGER NOT NULL,
    ue_num       INTEGER NOT NULL,
    de           TEXT NOT NULL,
    vers         TEXT NOT NULL,
    motif        TEXT NOT NULL,
    seance_close INTEGER NOT NULL DEFAULT 0,
    detail       TEXT,
    acteur_id    INTEGER,
    acteur_nom   TEXT,
    horodatage   TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_deplacement_etud ON etudiant_deplacement(etudiant_id);
`);

// Ce qui suit une inscription, avec les colonnes qui font l'unicité d'une ligne.
const SUIT_INSCRIPTION = [
  { t: 'etudiant_note_detail', compteur: 'notes' },
  { t: 'etudiant_report_note', compteur: 'reports' },
  { t: 'etudiant_resultat_cours', compteur: 'cours' },
  { t: 'deliberation_ajustement', compteur: 'ajustements' },
  { t: 'deliberation_resultat', compteur: 'decisions' },
  { t: 'decision_motivation', compteur: 'motivations' },
];
const compterLignes = (t, etudId, annee, ue) => {
  try {
    return db.prepare(`SELECT COUNT(*) AS n FROM ${t}
      WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?`).get(etudId, annee, ue).n;
  } catch { return 0; }   // table absente sur cette base
};

r.post('/:id/grille/deplacer', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const etudId = Number(req.params.id);
  const simulation = req.body?.simulation !== false;
  const motif = String(req.body?.motif || '').trim();
  const brut = Array.isArray(req.body?.mouvements) ? req.body.mouvements : [];
  const e = db.prepare('SELECT id, nom, prenom FROM etudiant WHERE id = ?').get(etudId);
  if (!e) return res.status(404).json({ error: 'étudiant introuvable' });

  const ANNEE = /^\d{4}-\d{4}$/;
  const mouvements = brut.map(m => ({ ue_num: Number(m?.ue_num), de: String(m?.de || ''), vers: String(m?.vers || '') }));
  if (!mouvements.length) return res.status(400).json({ error: 'Aucune case à déplacer.' });
  if (mouvements.some(m => !m.ue_num || !ANNEE.test(m.de) || !ANNEE.test(m.vers) || m.de === m.vers)) {
    return res.status(400).json({ error: 'Chaque case demande une unité, une année de départ et une autre année d’arrivée.' });
  }
  // Une même unité ne bouge qu'une fois par lot : deux cases d'une même ligne
  // qui s'échangent ou se poussent l'une l'autre ne se lisent pas sans ambiguïté.
  const parUe = new Map();
  for (const m of mouvements) {
    if (parUe.has(m.ue_num)) {
      return res.status(400).json({ error: `L'UE ${m.ue_num} figure deux fois dans le lot : déplacez ses cases une à une.` });
    }
    parUe.set(m.ue_num, m);
  }

  const blocages = [];
  const plan = [];
  for (const m of mouvements) {
    const src = db.prepare(`SELECT id, resultat, points FROM etudiant_inscription
      WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?`).get(etudId, m.de, m.ue_num);
    const vaSrc = db.prepare(`SELECT id FROM etudiant_valorisation
      WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?`).get(etudId, m.de, m.ue_num);
    if (!src) {
      blocages.push({ ...m, raison: vaSrc
        ? 'C’est une valorisation : elle se corrige dans l’écran Valorisation, avec son circuit.'
        : 'Aucune inscription dans l’année de départ.' });
      continue;
    }
    const dst = db.prepare(`SELECT id, resultat, points FROM etudiant_inscription
      WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?`).get(etudId, m.vers, m.ue_num);
    const vaDst = db.prepare(`SELECT id FROM etudiant_valorisation
      WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?`).get(etudId, m.vers, m.ue_num);
    if (vaDst) { blocages.push({ ...m, raison: `Une valorisation existe déjà pour ${m.vers}.` }); continue; }
    let remplace = false;
    if (dst) {
      const tracesDst = SUIT_INSCRIPTION.reduce((n, x) => n + compterLignes(x.t, etudId, m.vers, m.ue_num), 0);
      const vide = !dst.resultat && dst.points == null && tracesDst === 0;
      if (!vide) {
        blocages.push({ ...m, raison: `L’année ${m.vers} porte déjà un résultat ou des notes pour cette UE.` });
        continue;
      }
      remplace = true;   // inscription d'arrivée vide : la case déplacée la remplace
    } else {
      // Pas d'inscription à l'arrivée, mais des notes sans inscription : elles
      // entreraient en collision avec celles qu'on déplace. On ne mélange pas.
      const orphelines = SUIT_INSCRIPTION.reduce((n, x) => n + compterLignes(x.t, etudId, m.vers, m.ue_num), 0);
      if (orphelines) {
        blocages.push({ ...m, raison: `L’année ${m.vers} porte déjà des notes pour cette UE, sans inscription.` });
        continue;
      }
    }
    const traces = Object.fromEntries(SUIT_INSCRIPTION.map(x => [x.compteur, compterLignes(x.t, etudId, m.de, m.ue_num)]));
    let seanceClose = false;
    try {
      seanceClose = !!db.prepare(`SELECT 1 FROM deliberation_seance
        WHERE ue_num = ? AND annee_scolaire = ? AND cloturee = 1`).get(m.ue_num, m.de);
    } catch { /* table absente */ }
    let stage = 0;
    try {
      stage = db.prepare('SELECT COUNT(*) AS n FROM stage WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?')
        .get(etudId, m.de, m.ue_num).n;
    } catch { /* table absente */ }
    plan.push({ ...m, resultat: src.resultat || null, points: src.points ?? null,
                remplace, seance_close: seanceClose, stage_reste: stage, traces });
  }

  const rapport = { simulation, etudiant: `${e.nom} ${e.prenom}`, plan, blocages,
                    motif_requis: true };
  if (blocages.length) return res.status(simulation ? 200 : 409).json({ ok: false, ...rapport });
  if (simulation) return res.json({ ok: true, ...rapport });

  if (motif.length < 5) {
    return res.status(400).json({ error: 'Un motif écrit est obligatoire (ex. « import rangé dans la mauvaise année »).' });
  }
  const acteurNom = req.user?.nom || req.user?.email || null;
  db.transaction(() => {
    for (const m of plan) {
      if (m.remplace) {
        db.prepare('DELETE FROM etudiant_inscription WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?')
          .run(etudId, m.vers, m.ue_num);
      }
      db.prepare('UPDATE etudiant_inscription SET annee_scolaire = ? WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?')
        .run(m.vers, etudId, m.de, m.ue_num);
      for (const x of SUIT_INSCRIPTION) {
        try {
          db.prepare(`UPDATE ${x.t} SET annee_scolaire = ? WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?`)
            .run(m.vers, etudId, m.de, m.ue_num);
        } catch (err) { if (!/no such table/.test(err.message)) throw err; }
      }
      db.prepare(`INSERT INTO etudiant_deplacement
        (etudiant_id, ue_num, de, vers, motif, seance_close, detail, acteur_id, acteur_nom)
        VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(etudId, m.ue_num, m.de, m.vers, motif, m.seance_close ? 1 : 0,
             JSON.stringify({ resultat: m.resultat, points: m.points, remplace: m.remplace, traces: m.traces }),
             req.user?.id ?? null, acteurNom);
    }
  })();
  res.json({ ok: true, ...rapport, simulation: false, deplaces: plan.length });
});

/** Le journal des déplacements d'une fiche — en lecture seule, comme tout journal. */
r.get('/:id/grille/deplacements', authRequired, (req, res) => {
  res.json(db.prepare(`SELECT ue_num, de, vers, motif, seance_close, acteur_nom, horodatage
    FROM etudiant_deplacement WHERE etudiant_id = ? ORDER BY id DESC`).all(Number(req.params.id)));
});

r.put('/:id/grille', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const etudId = Number(req.params.id);
  const { annee, ue_num, kind, points } = req.body;
  if (!annee || !ue_num || !kind) {
    return res.status(400).json({ error: 'annee, ue_num et kind requis' });
  }
  // « refuse » manquait : l'écran proposait « Refusé », le serveur répondait
  // « kind invalide » — la troisième décision de la circulaire ne s'encodait pas.
  const KINDS = ['inscrit', 'reussi', 'faveur', 'ajourne', 'refuse', 'absent', 'va',
                 'effacer_resultat', 'effacer'];
  if (!KINDS.includes(kind)) return res.status(400).json({ error: 'kind invalide' });

  const ueN = Number(ue_num);

  /* LA FAVEUR S'ENCODE AUSSI DANS LE PARCOURS (Charles, 5 octobre 2026 : « je
     dois aussi pouvoir encoder une faveur dans cet écran — en 247 cet étudiant
     a une faveur »). Elle s'écrit comme la délibération l'écrit : un
     ajustement de l'UNITÉ (portée 'ue', code '*', action 'faveur'), au nom de
     celui qui clique ; l'unité vaut alors 10, réussie. Tout autre choix posé
     sur la case la retire : une faveur ne survit pas à la décision qui la
     remplace. */
  const retirerFaveur = () => {
    try {
      db.prepare(`DELETE FROM deliberation_ajustement WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?
        AND portee = 'ue' AND action = 'faveur'`).run(etudId, annee, ueN);
    } catch { /* table absente */ }
  };
  if (kind === 'faveur') {
    let session = 1;
    try {
      session = db.prepare(`SELECT MAX(session) s FROM deliberation_resultat WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?`)
        .get(etudId, annee, ueN)?.s || 1;
    } catch { /* table absente */ }
    const par = req.user?.nom || req.user?.email || null;
    db.transaction(() => {
      db.prepare('DELETE FROM etudiant_valorisation WHERE etudiant_id=? AND annee_scolaire=? AND ue_num=?').run(etudId, annee, ueN);
      db.prepare(`INSERT INTO etudiant_inscription (etudiant_id, annee_scolaire, ue_num, resultat, points)
        VALUES (?,?,?,'reussi',10)
        ON CONFLICT(etudiant_id, annee_scolaire, ue_num) DO UPDATE SET resultat = 'reussi', points = 10`).run(etudId, annee, ueN);
      retirerFaveur();
      db.prepare(`INSERT INTO deliberation_ajustement (etudiant_id, annee_scolaire, ue_num, session, portee, code, action, maj_par)
        VALUES (?,?,?,?,'ue','*','faveur',?)`).run(etudId, annee, ueN, session, par);
    })();
    return res.json({ ok: true });
  }
  retirerFaveur();

  // Toujours nettoyer les deux sources pour cette cellule
  const delInsc = () => db.prepare(
    'DELETE FROM etudiant_inscription WHERE etudiant_id=? AND annee_scolaire=? AND ue_num=?'
  ).run(etudId, annee, ueN);
  /* ON REMPLACE LA DÉCISION, ON N'EN POSE PAS UNE SECONDE À CÔTÉ.
     Ce nettoyage ne visait que les dispenses COMPLÈTES : une valorisation
     partielle — ou un REFUS, qui est enregistré comme partielle — survivait
     donc à l'opération, et la ligne créée juste après venait s'ajouter à elle.
     L'étudiante refusée par le Conseil se retrouvait avec deux décisions pour
     la même unité, et le procès-verbal imprimait les deux : « Refus », puis
     « Réussite ». Une pièce signée qui se contredit elle-même. */
  const delVa = () => db.prepare(
    'DELETE FROM etudiant_valorisation WHERE etudiant_id=? AND annee_scolaire=? AND ue_num=?'
  ).run(etudId, annee, ueN);

  // Effacer le seul résultat : l'inscription demeure, ses notes disparaissent.
  if (kind === 'effacer_resultat') {
    db.prepare(`
      UPDATE etudiant_inscription SET resultat = NULL, points = NULL
      WHERE etudiant_id=? AND annee_scolaire=? AND ue_num=?
    `).run(etudId, annee, ueN);
    db.prepare(`
      DELETE FROM etudiant_note_detail
      WHERE etudiant_id=? AND annee_scolaire=? AND ue_num=?
    `).run(etudId, annee, ueN);
    return res.json({ ok: true });
  }

  // Supprimer l'inscription : la ligne et tout ce qui s'y rattache.
  if (kind === 'effacer') {
    delInsc(); delVa();
    db.prepare('DELETE FROM etudiant_note_detail WHERE etudiant_id=? AND annee_scolaire=? AND ue_num=?')
      .run(etudId, annee, ueN);
    try {
      db.prepare('DELETE FROM etudiant_report_note WHERE etudiant_id=? AND annee_scolaire=? AND ue_num=?')
        .run(etudId, annee, ueN);
    } catch { /* table absente sur une base non migrée */ }
    return res.json({ ok: true });
  }

  if (kind === 'va') {
    /* UN REFUS NE SE RENVERSE PAS EN COCHANT UNE CASE DANS UN PARCOURS.
       Cette porte-ci crée une dispense complète sans décision du Conseil, sans
       séance et sans preuve : c'est une reprise d'encodage, pas une
       délibération. Qu'elle puisse effacer un refus motivé — et faire sortir
       l'attestation de réussite correspondante — n'était voulu par personne.
       Elle refuse donc, et renvoie vers l'écran où la décision se corrige. */
    /* DEPUIS LE CIRCUIT (2026-2027), UNE VA NE S'ÉCRIT QU'AVEC UNE DÉCISION
       DU CONSEIL : la grille reste la porte des années reprises. */
    if (annee >= ANNEE_CIRCUIT_VA) {
      return res.status(409).json({ error: "Depuis 2026-2027, une valorisation se décide dans l'écran Valorisation des acquis "
        + '(recevabilité, avis, décision du Conseil) : la grille ne la pose plus.' });
    }
    const refusExistant = db.prepare(`SELECT id FROM etudiant_valorisation
      WHERE etudiant_id=? AND annee_scolaire=? AND ue_num=? AND decision='refusee'`)
      .get(etudId, annee, ueN);
    if (refusExistant) {
      return res.status(409).json({
        error: "Le Conseil a refusé la valorisation de cette unité pour cet étudiant. "
             + "Corrigez la décision dans l'écran Valorisation des acquis ; "
             + "elle ne se renverse pas depuis le parcours." });
    }
    delInsc(); delVa();
    db.prepare(`
      INSERT INTO etudiant_valorisation
        (etudiant_id, annee_scolaire, ue_num, type, pourcentage, decision)
      VALUES (?,?,?,'complete',?,'accordee')
    `).run(etudId, annee, ueN, vaPourcent(points != null ? Number(points) : null));
    // La colonne porte le POURCENTAGE (50) ; Lucie le lit 10/20 (vaSur20).
    return res.json({ ok: true });
  }

  /* UNE CASE « INSCRIT » POSÉE SUR L'ANNÉE EN COURS OU À VENIR CRÉE UNE LIGNE
     DE PROGRAMME : elle passe par la porte unique, qui la juge (28 septembre
     2026). La dérogation se motive et se trace dans pae_derogation — elle ne
     pose plus `derogation = 1`, qui veut dire « réinscription forcée ».
     L'historique (années passées, résultats) reste un encodage de faits. */
  const existe = db.prepare('SELECT 1 FROM etudiant_inscription WHERE etudiant_id=? AND annee_scolaire=? AND ue_num=?')
    .get(etudId, annee, ueN);
  const anneeCourante = anneeDeTravail(req);
  if (kind === 'inscrit' && !existe && (!anneeCourante || annee >= anneeCourante)) {
    const motif = String(req.body?.motif || '').trim();
    const b = ecrireProgramme({ etudId, annee, ajouter: [ueN], origine: 'grille de parcours',
      par: req.user?.email || req.user?.nom || null, motifs: motif ? { [ueN]: motif } : {} });
    if (b.refus.length) {
      return res.status(409).json({ error: `UE ${ueN} : ${b.refus[0].regles.map(r0 => r0.libelle + (r0.detail ? ` (${r0.detail})` : '')).join(' ; ')}. `
        + 'Un motif est demandé pour inscrire quand même.', refus: b.refus, motif_requis: true });
    }
    delVa();
    return res.json({ ok: true, derogations: b.ecarts.length });
  }
  // inscrit / reussi / ajourne / absent → etudiant_inscription. La marque de
  // réinscription forcée n'est pas touchée : ré-encoder un résultat l'effaçait.
  delVa();
  db.prepare(`
    INSERT INTO etudiant_inscription (etudiant_id, annee_scolaire, ue_num, resultat, points)
    VALUES (?,?,?,?,?)
    ON CONFLICT(etudiant_id, annee_scolaire, ue_num) DO UPDATE SET
      resultat = excluded.resultat, points = excluded.points
  `).run(etudId, annee, ueN, kind === 'inscrit' ? null : kind,
         points != null ? Number(points) : null);
  res.json({ ok: true });
});

// ── Détail des notes par AA (cellule UE × année) ─────────────────────────────
// La note de l'UE se calcule à partir des acquis d'apprentissage : chacun pèse
// par sa pondération dans son cours et par les périodes de ce cours. Un AA
// présent dans deux cours y est coté séparément.
r.get('/:id/grille/detail', authRequired, (req, res) => {
  const etudId = Number(req.params.id);
  const { annee, ue_num } = req.query;
  if (!annee || !ue_num) return res.status(400).json({ error: 'annee et ue_num requis' });
  const ueN = Number(ue_num);

  const structure = structureUE(ueN, annee);

  const lignes = db.prepare(`
    SELECT type, code, cours_code, points, va, non_evalue
    FROM etudiant_note_detail
    WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?
  `).all(etudId, annee, ueN);

  // Clé de note d'AA : cours|aa ; les anciennes lignes sans cours_code sont
  // rattachées au premier cours qui contient cet AA.
  const notes = {};
  // Les notes PAR SESSION. L'import des classeurs de suivi préfixe le code par
  // « s1| » ou « s2| » : sans les séparer ici, la seconde session écrasait la
  // première et l'on perdait le détail de la délibération.
  const sessions = { s1: {}, s2: {} };

  for (const l of lignes) {
    if (l.type !== 'aa') continue;
    const parts = String(l.code).split('|');
    // Trois formes coexistent : « aa », « cours|aa », et « s1|aa » depuis
    // l'import des classeurs.
    const session = /^s[12]$/.test(parts[0]) ? parts[0] : null;
    const brut = parts.length > 1 ? parts[parts.length - 1] : l.code;
    const cc = l.cours_code
      || structure.find(c => c.aas.some(a => a.aa_code === brut))?.cours_code;
    if (!cc) continue;
    const valeur = { points: l.points, va: l.va, non_evalue: l.non_evalue };
    if (session) sessions[session][cc + '|' + brut] = valeur;
    // Le calcul de l'UE s'appuie sur la note qui FAIT FOI : la seconde session
    // si elle existe, la première sinon.
    if (!session || session === 's2' || !notes[cc + '|' + brut]) {
      notes[cc + '|' + brut] = valeur;
    }
  }

  const reportsActifs = db.prepare(`
    SELECT cours_code, note, annee_origine FROM etudiant_report_note
    WHERE etudiant_id = ? AND ue_num = ? AND annee_scolaire = ? AND statut = 'accorde'
  `).all(etudId, ueN, annee);
  const reports = Object.fromEntries(reportsActifs.map(r0 => [r0.cours_code, r0.note]));

  const dejaReportes = new Set(reportsActifs.map(r0 => r0.cours_code));
  const candidats = coursValidesAnterieurs(etudId, ueN, annee)
    .filter(c0 => !dejaReportes.has(c0.cours_code));

  const calcul = calculerNoteUE(ueN, annee, notes, reports);

  // La décision de chaque session, et la motivation si le Conseil en a donné une.
  const insc = db.prepare(`
    SELECT resultat, resultat_s1, resultat_s2, points FROM etudiant_inscription
    WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?
  `).get(etudId, annee, ueN) || {};

  const motivation = db.prepare(`
    SELECT motif FROM decision_motivation
    WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ? AND aa_code = '_ue'
  `).get(etudId, annee, ueN)?.motif || null;

  res.json({
    structure, notes, calcul, reports: reportsActifs, candidats_report: candidats,
    sessions,
    decision: {
      finale: insc.resultat || null,
      s1: insc.resultat_s1 || null,
      s2: insc.resultat_s2 || null,
      points: insc.points ?? null,
      motivation,
    },
  });
});

r.put('/:id/grille/detail', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const etudId = Number(req.params.id);
  const { annee, ue_num, cours_code, code, points, va, non_evalue } = req.body;
  if (!annee || !ue_num || !code || !cours_code) {
    return res.status(400).json({ error: 'annee, ue_num, cours_code et code requis' });
  }
  const ueN = Number(ue_num);

  // UN COURS REPORTÉ NE SE RÉENCODE PAS : sa note est celle de l'année
  // d'origine, gardée tant que le report tient. On le dit plutôt que d'écrire
  // une seconde note que la délibération ignorerait en silence.
  const rep = db.prepare(`SELECT annee_origine FROM etudiant_report_note
    WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ? AND cours_code = ?
      AND statut = 'accorde' LIMIT 1`).get(etudId, annee, ueN, cours_code);
  if (rep) {
    return res.status(409).json({ error: `Ce cours est reporté de ${rep.annee_origine || "l'année précédente"} : `
      + 'ses notes y sont reprises et ne se réencodent pas. Retirez le report pour encoder une nouvelle note.' });
  }

  // La clé unique historique porte sur (type, code) : un même AA présent dans
  // deux cours entrerait en collision. On la lève en préfixant le code par le
  // cours, tout en conservant cours_code dans sa colonne pour la lecture.
  const cleUnique = cours_code + '|' + code;
  const rienASauver = (points == null || points === '') && !va && !non_evalue;

  if (rienASauver) {
    db.prepare(`
      DELETE FROM etudiant_note_detail
      WHERE etudiant_id=? AND annee_scolaire=? AND ue_num=? AND type='aa' AND code=?
    `).run(etudId, annee, ueN, cleUnique);
  } else {
    db.prepare(`
      INSERT INTO etudiant_note_detail
        (etudiant_id, annee_scolaire, ue_num, type, code, cours_code, points, va, non_evalue)
      VALUES (?,?,?, 'aa', ?,?,?,?,?)
      ON CONFLICT(etudiant_id, annee_scolaire, ue_num, type, code) DO UPDATE SET
        points = excluded.points, va = excluded.va,
        non_evalue = excluded.non_evalue, cours_code = excluded.cours_code
    `).run(etudId, annee, ueN, cleUnique, cours_code,
           points != null && points !== '' ? Number(points) : (va ? 10 : null),
           va ? 1 : 0, non_evalue ? 1 : 0);
  }

  // Recalcul immédiat, pour que l'écran affiche la note à jour
  const structure = structureUE(ueN, annee);
  const notes = {};
  for (const l of db.prepare(`
    SELECT code, cours_code, points, va, non_evalue FROM etudiant_note_detail
    WHERE etudiant_id=? AND annee_scolaire=? AND ue_num=? AND type='aa'
  `).all(etudId, annee, ueN)) {
    const brut = String(l.code).split('|').pop();   // l'acquis est le DERNIER segment : « s1|67.4|AA67.2 »
    const cc = l.cours_code
      || structure.find(c => c.aas.some(a => a.aa_code === brut))?.cours_code;
    if (cc) notes[cc + '|' + brut] = { points: l.points, va: l.va, non_evalue: l.non_evalue };
  }

  const reports = Object.fromEntries(db.prepare(`
    SELECT cours_code, note FROM etudiant_report_note
    WHERE etudiant_id = ? AND ue_num = ? AND annee_scolaire = ? AND statut = 'accorde'
  `).all(etudId, ueN, annee).map(r0 => [r0.cours_code, r0.note]));

  res.json({ ok: true, calcul: calculerNoteUE(ueN, annee, notes, reports) });
});

// ── Valorisation des acquis (VA/VAE) — AGCF 13-12-2024 ──────────────────────
r.get('/:id/valorisations', authRequired, (req, res) => {
  if (!etudiantPermis(req, res, req.params.id)) return;
  const rows = db.prepare(`
    SELECT v.*, u.ue_nom, u.section
    FROM etudiant_valorisation v
    LEFT JOIN ${UE_REF} u ON u.ue_num = v.ue_num
    WHERE v.etudiant_id = ?
    ORDER BY v.annee_scolaire DESC, v.ue_num
  `).all(Number(req.params.id));
  const eq = db.prepare(`
    SELECT a.valorisation_id, a.aa_code, a.texte, aa.description
      FROM etudiant_valorisation_aa a
      LEFT JOIN aa ON aa.aa_code = a.aa_code
     WHERE a.valorisation_id IN (SELECT id FROM etudiant_valorisation WHERE etudiant_id = ?)
  `).all(Number(req.params.id));
  const parValo = {};
  for (const l of eq) (parValo[l.valorisation_id] ||= []).push(l);

  const fics = db.prepare(`
    SELECT id, valorisation_id, nom, taille, type_mime, nature, cree_le
      FROM etudiant_valorisation_fichier
     WHERE valorisation_id IN (SELECT id FROM etudiant_valorisation WHERE etudiant_id = ?)
     ORDER BY cree_le`).all(Number(req.params.id));
  const ficParValo = {};
  for (const f of fics) (ficParValo[f.valorisation_id] ||= []).push(f);

  res.json(rows.map(v => ({ ...v,
    equivalences: parValo[v.id] || [], fichiers: ficParValo[v.id] || [] })));
});

// ── Les preuves d'une valorisation ──────────────────────────────────────────
const DATA_DIR_VA = process.env.DATA_DIR || '/app/data';

/**
 * CE QU'ON ACCEPTE DE DÉPOSER.
 *
 * Une preuve est un document qu'on lit : un PDF, une image d'un diplôme, un
 * fichier de traitement de texte ou de tableur. Tout le reste est refusé — non
 * par méfiance envers le secrétariat, mais parce qu'un dossier d'étudiant
 * n'est pas un endroit où l'on range des exécutables, et qu'un refus net vaut
 * mieux qu'un fichier accepté que personne ne pourra jamais ouvrir.
 */
export const TYPES_PREUVE = new Set([
  'application/pdf',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/tiff',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.spreadsheet',
  'text/plain', 'message/rfc822',
]);

/**
 * LA NATURE D'UNE PIÈCE — et ce qu'elle vaut au dossier.
 *
 * « 23453.docx » ne dit rien à personne. Six mois plus tard, retrouver la carte
 * d'identité au milieu de douze fichiers ainsi nommés demande de les ouvrir un
 * par un. Lucie ne peut pas deviner ce que contient un fichier : elle demande
 * sa nature au dépôt — un menu, une seconde — et le nom se construit seul.
 */
export const NATURES_PREUVE = [
  { cle: 'CI', label: "Carte d'identité" },
  { cle: 'DIP', label: 'Diplôme ou titre' },
  { cle: 'REL', label: 'Relevé de notes / bulletin' },
  { cle: 'ATT', label: 'Attestation de formation' },
  { cle: 'DP', label: 'Dossier pédagogique / programme' },
  { cle: 'EXP', label: "Attestation d'expérience professionnelle" },
  { cle: 'CT', label: 'Contrat de travail' },
  { cle: 'CV', label: 'Curriculum vitae' },
  { cle: 'DEM', label: 'Demande de valorisation' },
  /* LA COPIE DU TEST EST UNE PIÈCE DU DOSSIER, PAS UN BROUILLON.
   * « Les copies d'épreuves ou tests ayant servi à la décision suivent la même
   * règle » que les PV : conservation quatre ans, présentables à tout moment
   * aux services d'inspection (AGCF du 13.12.2024, art. 5 al. 2). Sans une
   * nature qui la nomme, elle se dépose en « Autre pièce » et on ne la
   * retrouve plus. */
  { cle: 'TEST', label: "Copie du test ou de l'épreuve d'admission" },
  { cle: 'AUT', label: 'Autre pièce' },
];

/**
 * LE NOM SOUS LEQUEL LA PIÈCE SE LIT.
 *
 * Nature, nom, prénom, unité, année — et l'extension d'origine, qu'on ne
 * touche pas : c'est elle qui dit au système avec quoi l'ouvrir. Tout est
 * ramené à des caractères sûrs, accents compris : un nom de fichier qui
 * voyage entre Windows, macOS et un NAS ne survit pas aux fantaisies.
 */
export function nommerPreuve(nature, etud, valo, original) {
  const pur = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '');
  const ext = (String(original || '').match(/\.[A-Za-z0-9]{1,8}$/) || [''])[0].toLowerCase();
  const code = NATURES_PREUVE.some(n => n.cle === nature) ? nature : 'AUT';
  return [code, pur(etud?.nom).toUpperCase(), pur(etud?.prenom),
    valo?.ue_num ? `UE${valo.ue_num}` : null,
    valo?.annee_scolaire ? String(valo.annee_scolaire).replace(/\W/g, '') : null]
    .filter(Boolean).join('_') + ext;
}

/**
 * DEUX PIÈCES DE MÊME NATURE NE S'ÉCRASENT PAS. Un étudiant peut déposer deux
 * diplômes : le second devient « …_2 », sans quoi le nom affiché mentirait sur
 * ce qu'on télécharge.
 */
export function nomLibre(valorisationId, propose) {
  const pris = new Set(db.prepare(
    'SELECT nom FROM etudiant_valorisation_fichier WHERE valorisation_id = ?')
    .all(valorisationId).map(f => f.nom));
  if (!pris.has(propose)) return propose;
  const m = propose.match(/^(.*?)(\.[A-Za-z0-9]{1,8})?$/);
  const base = m[1]; const ext = m[2] || '';
  for (let i = 2; i < 100; i++) if (!pris.has(`${base}_${i}${ext}`)) return `${base}_${i}${ext}`;
  return `${base}_${Date.now()}${ext}`;
}

const stockagePreuve = multer.diskStorage({
  destination(req, file, cb) {
    const dir = join(DATA_DIR_VA, 'valorisations', String(req.params.vid));
    try { mkdirSync(dir, { recursive: true }); } catch { /* déjà là */ }
    cb(null, dir);
  },
  // Le nom d'origine est conservé pour l'affichage ; sur le disque il est
  // horodaté et nettoyé — deux diplômes nommés « scan.pdf » ne doivent pas
  // s'écraser l'un l'autre, et un nom de fichier ne doit pas pouvoir remonter
  // l'arborescence.
  filename(req, file, cb) {
    cb(null, `${Date.now()}_${file.originalname.replace(/[^\w.\-]+/g, '_')}`);
  },
});
const envoiPreuve = multer({
  storage: stockagePreuve,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (TYPES_PREUVE.has(file.mimetype)) return cb(null, true);
    cb(new Error(`Type de fichier non accepté (${file.mimetype}).`));
  },
});

// LES ROUTES SPÉCIFIQUES AVANT LES PARAMÉTRIQUES : « /valorisations/fichiers/… »
// doit passer avant « /valorisations/:vid », sans quoi « fichiers » est lu
// comme un identifiant.
// La liste vit côté serveur : c'est elle qui décide du préfixe du nom, et un
// second exemplaire dans l'écran finirait par ne plus dire la même chose.
r.get('/valorisations/natures', authRequired, (req, res) => res.json(NATURES_PREUVE));

/**
 * LE REGISTRE DES VALORISATIONS — qui en a, et lesquelles.
 *
 * Les valorisations ne se lisaient que fiche par fiche : pour savoir qui en
 * avait, il fallait ouvrir les cinq cent quatre-vingt-huit dossiers. On ne le
 * faisait pas, donc on ne savait pas — ni combien de demandes l'année avait
 * porté, ni lesquelles avaient été refusées, ni quelles unités revenaient.
 *
 * Une ligne par valorisation, l'étudiant devant : c'est la lecture qui manque,
 * pas un comptage.
 */
r.get('/valorisations/registre', authRequired, (req, res) => {
  const { annee, section, decision } = req.query;
  const ou = [];
  const par = [];
  if (annee) { ou.push('v.annee_scolaire = ?'); par.push(annee); }
  if (section) { ou.push('u.section = ?'); par.push(section); }
  if (decision) { ou.push('COALESCE(v.decision, \'accordee\') = ?'); par.push(decision); }
  const where = ou.length ? `WHERE ${ou.join(' AND ')}` : '';
  try {
    /* LE REGISTRE PORTE LES TRACES DU CIRCUIT, PAS SEULEMENT LA DÉCISION.
     *
     * Il rendait l'issue — accordée, refusée — et rien de ce qui y mène. Or la
     * question qu'on pose devant cette liste n'est pas « qu'a-t-on décidé ? »
     * (la plupart des dossiers n'en sont pas là) mais « OÙ EN EST-ON ? ». Sans
     * les dates du circuit, l'écran ne pouvait pas y répondre, et il fallait
     * ouvrir chaque dossier pour l'apprendre — c'est-à-dire ne pas l'apprendre.
     *
     * `v.*` plutôt qu'une liste de colonnes : l'ancienne énumération avait
     * déjà oublié sept colonnes, et elle en oubliera d'autres à chaque étape
     * ajoutée au circuit. Rien de sensible ne vit sur cette table.
     */
    const lignes = db.prepare(`
      SELECT v.*,
             COALESCE(v.decision, 'accordee') AS decision,
             e.nom, e.prenom,
             u.ue_nom, u.section,
             (SELECT COUNT(*) FROM etudiant_valorisation_fichier f
               WHERE f.valorisation_id = v.id) AS preuves
        FROM etudiant_valorisation v
        JOIN etudiant e ON e.id = v.etudiant_id
        LEFT JOIN ${UE_REF} u ON u.ue_num = v.ue_num
        ${where}
       ORDER BY e.nom, e.prenom, v.annee_scolaire DESC, v.ue_num
    `).all(...par);
    /* L'ÉTAT SE DÉDUIT ICI, PAS DANS L'ÉCRAN. Deux déductions pour un même
     * fait finiraient par différer, et c'est celle qu'on regarde le moins qui
     * afficherait l'ancienne règle. `etatDeduit` est la seule. */
    res.json(filtrerValorisationsParPerimetre(req, lignes).map(v => ({
      ...v, etat: etatDeduit(v), hors_circuit: decideHorsCircuit(v),
    })));
  } catch (e) {
    console.error('[valorisations/registre]', e.message);
    res.status(500).json({ error: e.message });
  }
});

r.get('/valorisations/fichiers/:fid', authRequired, (req, res) => {
  const f = db.prepare('SELECT * FROM etudiant_valorisation_fichier WHERE id = ?')
    .get(Number(req.params.fid));
  if (!f || !existsSync(f.chemin)) return res.status(404).json({ error: 'Pièce introuvable' });
  if (!valorisationPermise(req, res, f.valorisation_id)) return;
  res.download(f.chemin, f.nom);
});

r.delete('/valorisations/fichiers/:fid', authRequired, roleRequired('admin', 'editeur'),
  (req, res) => {
    const f = db.prepare('SELECT * FROM etudiant_valorisation_fichier WHERE id = ?')
      .get(Number(req.params.fid));
    if (!f) return res.status(404).json({ error: 'Introuvable' });
    try { unlinkSync(f.chemin); } catch { /* déjà parti du disque */ }
    db.prepare('DELETE FROM etudiant_valorisation_fichier WHERE id = ?').run(f.id);
    res.json({ ok: true });
  });

/**
 * RENOMMER UNE PIÈCE. La nature choisie peut avoir été la mauvaise, ou le nom
 * proposé ne pas convenir : on corrige le nom affiché, jamais le fichier sur
 * le disque — le chemin est ce qui permet de le retrouver.
 */
r.patch('/valorisations/fichiers/:fid', authRequired, roleRequired('admin', 'editeur'),
  (req, res) => {
    const f = db.prepare('SELECT * FROM etudiant_valorisation_fichier WHERE id = ?')
      .get(Number(req.params.fid));
    if (!f) return res.status(404).json({ error: 'Introuvable' });
    const nom = String(req.body?.nom || '').trim().replace(/[\\/]/g, '_');
    if (!nom) return res.status(400).json({ error: 'Nom vide.' });
    db.prepare('UPDATE etudiant_valorisation_fichier SET nom = ?, nature = ? WHERE id = ?')
      .run(nom, req.body?.nature || f.nature, f.id);
    res.json({ ok: true, nom });
  });

r.post('/valorisations/:vid/fichiers', authRequired, roleRequired('admin', 'editeur'),
  (req, res) => {
    const valo = db.prepare(
      'SELECT id, ue_num, annee_scolaire FROM etudiant_valorisation WHERE id = ?')
      .get(Number(req.params.vid));
    if (!valo) return res.status(404).json({ error: 'Valorisation introuvable' });
    // Le filtre de multer rejette par une exception : sans ce relais, elle
    // remonterait en erreur 500 et l'écran dirait « erreur » là où il doit
    // dire quel type de fichier n'est pas accepté.
    envoiPreuve.single('fichier')(req, res, err => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });
      // LE NOM D'ORIGINE N'EST PAS CONSERVÉ, ET C'EST LE BUT : « 23453.docx »
      // ne dit rien. Le nom affiché se reconstruit à partir de la nature
      // choisie, de l'étudiant et de l'unité — le fichier reste le même.
      const etud = db.prepare(`SELECT e.nom, e.prenom FROM etudiant e
        JOIN etudiant_valorisation v ON v.etudiant_id = e.id
        WHERE v.id = ?`).get(valo.id) || {};
      const nature = String(req.body?.nature || 'AUT').toUpperCase();
      const nom = nomLibre(valo.id, nommerPreuve(nature, etud, valo, req.file.originalname));
      const info = db.prepare(`INSERT INTO etudiant_valorisation_fichier
        (valorisation_id, nom, chemin, taille, type_mime, nature, cree_par)
        VALUES (?,?,?,?,?,?,?)`).run(valo.id, nom, req.file.path,
          req.file.size, req.file.mimetype, nature, req.user?.username || null);
      res.json({ ok: true, id: info.lastInsertRowid, nom, nom_origine: req.file.originalname });
    });
  });

/**
 * LES UNITÉS QU'ON PEUT VALORISER POUR CET ÉTUDIANT.
 *
 * Le numéro d'UE se tapait à la main. Or on ne valorise pas n'importe quelle
 * unité : on valorise une unité DE CHEZ NOUS, celle que l'étudiant aura à son
 * programme. Un numéro libre laissait passer une unité d'une autre section, ou
 * qui n'existe pas — et rien ne le signalait.
 *
 * Les unités du PAE viennent en tête, marquées : une valorisation se décide
 * souvent AVANT que le programme soit encodé, fermer la liste au seul PAE
 * empêcherait le cas normal.
 */
r.get('/:id/valorisations/unites', authRequired, (req, res) => {
  if (!etudiantPermis(req, res, req.params.id)) return;
  const etudId = Number(req.params.id);
  const annee = req.query.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  const section = req.query.section || null;

  const etud = db.prepare(
    'SELECT section_rattachement FROM etudiant WHERE id = ?').get(etudId) || {};
  const sections = db.prepare(
    'SELECT code, libelle FROM section ORDER BY code').all();

  const auPae = new Set(db.prepare(`SELECT ue_num FROM etudiant_inscription
    WHERE etudiant_id = ? AND annee_scolaire = ?`).all(etudId, annee)
    .map(l => l.ue_num));

  // DEUX SOURCES POUR LE RATTACHEMENT, ET ELLES NE DISENT PAS LA MÊME CHOSE :
  // ue.section est le rangement d'import, ue_section la composition déclarée.
  // On prend l'union — une unité partagée entre deux sections doit apparaître
  // dans les deux, faute de quoi elle devient invalorisable dans l'une d'elles.
  const params = [annee];
  let filtre = '';
  if (section) {
    filtre = `AND (u.section = ? OR EXISTS (SELECT 1 FROM ue_section s
      WHERE s.ue_num = u.ue_num AND s.section_code = ? AND s.annee_scolaire = ?))`;
    params.push(section, section, annee);
  }
  const unites = db.prepare(`
    SELECT u.ue_num, u.ue_nom, u.section, u.ue_niv
      FROM ue u WHERE u.annee_scolaire = ? ${filtre}
     ORDER BY u.ue_num`).all(...params)
    .map(u => ({ ...u, au_pae: auPae.has(u.ue_num) }));

  res.json({
    sections, section_etudiant: etud.section_rattachement || null,
    unites: [...unites.filter(u => u.au_pae), ...unites.filter(u => !u.au_pae)],
  });
});

/**
 * CE QU'UNE VALORISATION DOIT AVOIR POUR ÊTRE ENREGISTRABLE.
 *
 * La même règle sert à créer et à corriger : une valorisation qu'on modifie
 * doit rester aussi valable qu'à sa création, sinon on aurait bâti une porte
 * dérobée pour écrire ce que la porte d'entrée refuse.
 */
function verifierValorisation(b) {
  const { annee_scolaire, ue_num, type, cible } = b;
  // L'ADMISSION PORTE ue_num = 0 : « !ue_num » la déclarait sans unité et la
  // refusait — toute admission décidée en série tombait là (29 septembre 2026).
  if (!annee_scolaire || ((ue_num == null || ue_num === '') && type !== 'admission') || !type) {
    return 'annee_scolaire, ue_num et type requis';
  }
  if (!['complete','partielle','admission'].includes(type)) return 'type invalide';
  const decision = b.decision === 'refusee' ? 'refusee' : 'accordee';

  /* UNE ADMISSION NE PORTE PAS SUR UNE UNITÉ — elle porte sur la section, et
   * sa ligne n'a donc pas d'unité à vérifier. Lui appliquer les contrôles
   * d'unité aurait réclamé un code FWB et des périodes à une décision qui n'en
   * a pas. */
  if (!estAdmissionDeSection({ type, porte: b.porte, ue_num })) {
    /* CE QUI NE PEUT JAMAIS ÊTRE VALORISÉ SE REFUSE ICI, ET NON À L'ÉCRAN.
     *
     * L'épreuve intégrée doit toujours être présentée ; s'y ajoutent les
     * unités sans prestations d'étudiants, celles qu'une réglementation impose
     * de suivre, et à l'IIP la méthodologie de la recherche. Rien ne
     * l'empêchait : on pouvait dispenser l'épreuve intégrée, et la pièce
     * sortait. */
    const valorisable = uniteValorisable(ue_num, annee_scolaire);
    if (!valorisable.ok) return valorisable.motif;
  }

  // UN REFUS SE MOTIVE. C'est une décision défavorable (RDE art. 88 §3), et
  // « refusé » sans motif ne se défend pas devant un recours. En revanche il
  // ne réclame ni cible ni dispense : on ne dispense rien.
  if (decision === 'refusee') {
    if (!String(b.motif_refus || '').trim()) return 'Un refus doit être motivé.';
    return null;
  }
  if (type === 'partielle' && !['aa','cours'].includes(cible)) {
    return 'dispense partielle : cible aa ou cours requise';
  }

  /* UNE DISPENSE PARTIELLE NE PEUT PAS COUVRIR TOUTE L'UNITÉ (RGE art. 29 §2).
   *
   * « Ne peut être dispensé de l'ensemble des activités d'une même UE par cette
   * voie » : une partielle qui les couvre toutes est une dispense complète
   * déguisée — mêmes effets, mais sans l'attestation, sans le PV d'unité, et
   * sans que l'étudiant cesse d'être compté comme régulier. C'est exactement le
   * genre de contournement qu'on ne voit qu'au contrôle. */
  if (type === 'partielle' && cible === 'cours') {
    const vises = String(b.cible_detail || '').split(',').map(x => x.trim()).filter(Boolean);
    if (vises.length) {
      const tous = db.prepare(
        'SELECT cours_code FROM cours WHERE ue_num = ? AND annee_scolaire = ?')
        .all(Number(ue_num), annee_scolaire).map(c => c.cours_code);
      if (tous.length && tous.every(c => vises.includes(c))) {
        return "Une dispense partielle ne peut pas couvrir TOUTES les activités "
          + "d'enseignement de l'unité (RGE art. 29 §2). S'il s'agit de dispenser "
          + "l'unité entière, c'est une dispense complète : elle donne lieu à "
          + "l'attestation « Valorisation » et l'étudiant cesse d'y être compté "
          + 'comme élève régulier.';
      }
    }
  }
  return null;
}

/**
 * LA DÉCISION SE PREND SUR UN DOSSIER INSTRUIT — ET ON LE VÉRIFIE.
 *
 * Contrôle commun à l'enregistrement d'une décision du Conseil, quel que soit
 * le chemin employé : la base (VAF V1-V4 / VANFI D-E) est obligatoire dès lors
 * qu'on accorde quelque chose, parce que c'est elle qui part dans eProm et
 * qu'« une décision non encodée est une décision non conforme ».
 */
function verifierDecisionCE(b) {
  const refus = b.decision === 'refusee';
  if (!refus && !CODES_BASE.includes(String(b.base_code || ''))) {
    return 'La base de la décision est obligatoire : VAF (V1, V2, V3, V4) ou '
      + "VANFI (D, E). C'est elle qui est encodée dans eProm, et une décision "
      + 'non encodable ne peut pas être conforme.';
  }
  return null;
}

/**
 * LA MATRICE D'INTRODUCTION — LA PORTE D'ENTRÉE DE TOUTE LA MACHINE.
 *
 * Les demandes arrivent en septembre par dizaines, et elles arrivaient dans une
 * boîte courriel. Pour les faire entrer dans Lucie, il fallait ouvrir un
 * dossier à la fois, chercher l'étudiant parmi 588, choisir l'unité, remplir
 * une décision qui n'était pas encore prise. Personne ne le faisait — donc
 * rien n'était encodé, donc rien n'était contrôlable.
 *
 * Une section, une année : les ÉTUDIANTS en lignes, les UNITÉS en colonnes, et
 * dans chaque case un mot — AD, VA ou VAE. C'est tout ce qu'on sait quand la
 * demande arrive, et c'est tout ce qu'on demande. Le détail se traite ensuite,
 * dossier par dossier.
 *
 * Les cases DÉJÀ ouvertes sont rendues avec leur état : la matrice montre où en
 * est la section d'un coup d'œil, et elle ne se relit pas comme un formulaire
 * vide qu'on croirait devoir remplir deux fois.
 */
r.get('/valorisations/matrice', authRequired, (req, res) => {
  const { annee, section } = req.query;
  if (!annee || !section) {
    return res.status(400).json({ error: 'annee et section requises' });
  }
  if (!sectionAutoriseeReq(req, section)) {
    return res.status(403).json({ error: 'Section hors de votre périmètre' });
  }

  /* LES UNITÉS DE LA SECTION — et pas celles qu'on ne peut jamais valoriser.
   * Afficher une colonne « épreuve intégrée » serait inviter à cocher ce que
   * le serveur refusera : une colonne qu'on ne peut pas remplir n'a rien à
   * faire dans un tableau. */
  const colonnes = new Set(
    db.prepare('PRAGMA table_info(ue)').all().map(c => c.name));
  const ei = colonnes.has('is_epreuve_integree') ? 'COALESCE(is_epreuve_integree,0)' : '0';
  const ex = colonnes.has('valorisation_exclue') ? 'COALESCE(valorisation_exclue,0)' : '0';
  const unites = db.prepare(`
    SELECT ue_num, ue_nom, ue_niv, ${ei} AS epreuve_integree, ${ex} AS exclue
    FROM ue WHERE annee_scolaire = ? AND section = ?
    ORDER BY CASE UPPER(COALESCE(ue_niv,''))
      WHEN 'BA1' THEN 1 WHEN 'BA2' THEN 2 WHEN 'BA3' THEN 3 ELSE 4 END, ue_num
  `).all(annee, section).filter(u => !u.epreuve_integree && !u.exclue);

  const nums = unites.map(u => u.ue_num);
  const marques = nums.length ? `(${nums.map(() => '?').join(',')})` : '(NULL)';

  // Les étudiants inscrits à au moins une unité de la section cette année.
  const inscrits = nums.length ? db.prepare(`
    SELECT DISTINCT e.id, e.nom, e.prenom, e.id_ecampus, e.section_rattachement
    FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
    WHERE i.annee_scolaire = ? AND i.ue_num IN ${marques}
    ORDER BY e.nom, e.prenom
  `).all(annee, ...nums) : [];

  /* LES ADMISSIONS DE LA SECTION — une ligne par étudiant, pas par unité.
   * Elles ne vivent pas dans la grille : la colonne d'admission est à part,
   * parce que la décision l'est aussi. */
  const admissions = db.prepare(`
    SELECT v.id, v.etudiant_id, v.porte, v.decision, v.recevable, v.avis_le,
           v.decision_le, v.valide_le,
           e.nom, e.prenom, e.id_ecampus, e.section_rattachement
    FROM etudiant_valorisation v JOIN etudiant e ON e.id = v.etudiant_id
    WHERE v.annee_scolaire = ? AND v.ue_num = 0 AND v.section = ?
  `).all(annee, section);

  // Et ceux qui portent déjà une demande sur une de ces unités, même sans
  // inscription : une valorisation précède souvent l'inscription.
  const dejaLa = nums.length ? db.prepare(`
    SELECT v.id, v.etudiant_id, v.ue_num, v.porte, v.type, v.decision,
           v.recevable, v.avis_le, v.decision_le, v.valide_le,
           e.nom, e.prenom, e.id_ecampus, e.section_rattachement
    FROM etudiant_valorisation v JOIN etudiant e ON e.id = v.etudiant_id
    WHERE v.annee_scolaire = ? AND v.ue_num IN ${marques}
  `).all(annee, ...nums) : [];

  /* UN ÉTUDIANT SANS INSCRIPTION EXISTE AUSSI — leçon du 21 septembre,
   * jamais appliquée ici, où elle coûte double : la valorisation PRÉCÈDE
   * souvent l'inscription, et c'est précisément le public de cette matrice.
   * ET LA SECTION SE DÉDUIT AUSSI : un BA2 dont le PAE 2026-2027 n'est pas
   * composé et dont le dossier ne porte pas de rattachement appartient
   * pourtant à sa section — ses inscriptions passées le disent. Même règle
   * que la liste des étudiants : rattachement posé, sinon déduit. */
  const normSec = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, '');
  const cibleSec = normSec(section);
  const rattaches = [];
  for (const e of db.prepare(
    'SELECT id, nom, prenom, id_ecampus FROM etudiant WHERE actif = 1 ORDER BY nom, prenom').all()) {
    // Le dédoublonnage avec les inscrits se fait au remplissage, plus bas.
    const rat = sectionRattachement(e.id, annee);
    if (rat.section && normSec(rat.section) === cibleSec) {
      rattaches.push({ ...e, section_rattachement: rat.section });
    }
  }

  const par = new Map();
  for (const e of inscrits) {
    par.set(e.id, { id: e.id, nom: e.nom, prenom: e.prenom,
      id_ecampus: e.id_ecampus, section: e.section_rattachement,
      inscrit: true, cellules: {} });
  }
  for (const e of rattaches) {
    if (!par.has(e.id)) {
      par.set(e.id, { id: e.id, nom: e.nom, prenom: e.prenom,
        id_ecampus: e.id_ecampus, section: e.section_rattachement,
        inscrit: false, cellules: {} });
    }
  }
  for (const d of dejaLa) {
    if (!par.has(d.etudiant_id)) {
      par.set(d.etudiant_id, { id: d.etudiant_id, nom: d.nom, prenom: d.prenom,
        id_ecampus: d.id_ecampus, section: d.section_rattachement,
        inscrit: false, cellules: {} });
    }
    par.get(d.etudiant_id).cellules[d.ue_num] = {
      id: d.id, porte: d.porte || null, etat: etatDeduit(d),
      decision: d.decision_le ? d.decision : null,
    };
  }

  for (const a of admissions) {
    if (!par.has(a.etudiant_id)) {
      par.set(a.etudiant_id, { id: a.etudiant_id, nom: a.nom, prenom: a.prenom,
        id_ecampus: a.id_ecampus, section: a.section_rattachement,
        inscrit: false, cellules: {} });
    }
    par.get(a.etudiant_id).admission = { id: a.id, etat: etatDeduit(a) };
  }

  // Primo et niveau, pour les filtres de l'écran — mêmes définitions que la
  // liste des étudiants et la grille des PAE.
  const anciensVa = new Set([
    ...db.prepare('SELECT DISTINCT etudiant_id FROM etudiant_inscription WHERE annee_scolaire < ?')
      .all(annee).map(x => x.etudiant_id),
    ...db.prepare('SELECT DISTINCT etudiant_id FROM etudiant_valorisation WHERE annee_scolaire < ?')
      .all(annee).map(x => x.etudiant_id),
  ]);

  res.json({
    annee, section, portes: PORTES, unites,
    /* LES UNITÉS QUE L'ADMISSION OUVRE — déduites, jamais recopiées. Elles
     * s'affichent à l'écran pour qu'on sache ce qu'on décide, et elles se
     * relisent au fil des années sans qu'une liste figée se démente. */
    unites_de_base: unitesDeBase(section, annee),
    etudiants: [...par.values()].map(e => ({
      ...e, primo: !anciensVa.has(e.id),
      niveau: niveauEtudiant(e.id, annee).niveau || null,
    })).sort((a, b) =>
      (a.nom || '').localeCompare(b.nom || '')
      || (a.prenom || '').localeCompare(b.prenom || '')),
  });
});

/**
 * OUVRIR LES DOSSIERS COCHÉS DANS LA MATRICE.
 *
 * Une case cochée n'est pas une décision : c'est une DEMANDE REÇUE. Le dossier
 * naît donc sans décision — `decision_le` reste vide, et c'est lui que tout le
 * circuit regarde. Rien ne sortira de ce dossier tant qu'il n'aura pas été
 * instruit puis validé.
 *
 * On ne rouvre pas une case déjà ouverte : elle est rendue telle quelle par la
 * matrice, avec son état. Les cases déjà là sont simplement IGNORÉES — à la
 * différence de la création en lot, où un doublon arrête tout, parce qu'ici le
 * tableau montre l'existant et qu'un enregistrement se rejoue sans dommage.
 */
r.post('/valorisations/matrice', authRequired, gesteRequis('valorisation.instruire'),
  (req, res) => {
    const { annee, cellules } = req.body;
    if (!annee) return res.status(400).json({ error: 'annee requise' });
    const liste = (Array.isArray(cellules) ? cellules : []).filter(c =>
      Number.isInteger(Number(c?.etudiant_id)) && Number.isInteger(Number(c?.ue_num))
      && CODES_PORTE.includes(String(c?.porte)));
    if (!liste.length) return res.status(400).json({ error: 'Aucune case cochée.' });

    const refus = [];
    const aCreer = [];
    // L'écriture aussi se tient dans son périmètre : une case cochée sur une
    // unité (ou une admission vers une section) d'autrui se refuse, ligne
    // par ligne, comme les autres refus de la matrice.
    const permisesMat = perimetre(req);
    for (const c of liste) {
      const eid = Number(c.etudiant_id);
      const ue = Number(c.ue_num);
      if (permisesMat) {
        const secs = c.porte === 'admission'
          ? [String(c.section || req.body.section || '').trim()].filter(Boolean)
          : sectionsDeUE(ue);
        if (!secs.some(s => permisesMat.includes(s))) {
          refus.push({ etudiant_id: eid, ue_num: ue, pourquoi: 'Hors de votre périmètre.' });
          continue;
        }
      }

      /* L'ADMISSION SE DÉCIDE PAR SECTION : une seule ligne, `ue_num = 0`.
       * La matrice l'envoie avec la section plutôt qu'avec une unité — on
       * n'est pas admis « à l'UE 95 », on est admis dans le cursus, et
       * l'admission se reporte ensuite sur les unités de base. */
      if (c.porte === 'admission') {
        const sec = String(c.section || req.body.section || '').trim();
        if (!sec) {
          refus.push({ etudiant_id: eid, pourquoi: "Une admission se rattache à une section." });
          continue;
        }
        const dejaAd = db.prepare(`SELECT id FROM etudiant_valorisation
          WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = 0
            AND section = ? LIMIT 1`).get(eid, annee, sec);
        if (dejaAd) continue;
        aCreer.push({ eid, ue: 0, porte: 'admission', section: sec });
        continue;
      }

      // CE QUI NE PEUT JAMAIS ÊTRE VALORISÉ NE S'OUVRE MÊME PAS EN DOSSIER.
      const val = uniteValorisable(ue, annee);
      if (!val.ok) { refus.push({ etudiant_id: eid, ue_num: ue, pourquoi: val.motif }); continue; }
      const deja = db.prepare(`SELECT id FROM etudiant_valorisation
        WHERE etudiant_id = ? AND ue_num = ? AND annee_scolaire = ? LIMIT 1`)
        .get(eid, ue, annee);
      if (deja) continue;   // déjà ouverte : la matrice la montre, on n'y touche pas
      aCreer.push({ eid, ue, porte: String(c.porte), section: null });
    }

    const inserer = db.prepare(`
      INSERT INTO etudiant_valorisation
        (etudiant_id, annee_scolaire, ue_num, type, porte, decision,
         date_reception, mode_introduction, section)
      VALUES (?,?,?,?,?,?,?,?,?)`);
    const crees = [];
    db.transaction(() => {
      for (const c of aCreer) {
        /* UNE ADMISSION EST UNE FINALITÉ ; VA ET VAE N'EN SONT PAS.
         * La porte « admission » fixe donc le type dès l'entrée — c'est la
         * seule des trois qui le dise. Les deux autres ouvrent un dossier dont
         * la finalité (partielle ou complète) se tranchera en séance : la
         * poser ici reviendrait à décider à la place du Conseil. */
        const type = c.porte === 'admission' ? 'admission' : 'partielle';
        const info = inserer.run(c.eid, annee, c.ue, type, c.porte, 'accordee',
          req.body.date_reception || null, req.body.mode_introduction || null,
          c.section || null);
        crees.push({ etudiant_id: c.eid, ue_num: c.ue, id: info.lastInsertRowid });
      }
    })();
    for (const c of crees) {
      journaliser(c.id, 'introduction', req,
        `demande reçue · ${liste.find(x => Number(x.etudiant_id) === c.etudiant_id
          && Number(x.ue_num) === c.ue_num)?.porte || ''}`);
      rafraichirEtat(c.id);
    }
    res.json({ ok: true, crees: crees.length, refus });
  });

/**
 * LES ÉTUDIANTS QUE CETTE UNITÉ CONCERNE.
 *
 * Une séance de valorisation se tient PAR UNITÉ, devant le conseil des études
 * de cette unité : on y examine dix dossiers qui posent la même question. Pour
 * cocher dix étudiants, il fallait pourtant les chercher un à un dans les cinq
 * cent quatre-vingt-huit du fichier — alors que ceux que la question concerne
 * sont connus : ceux qui ont l'unité à leur programme.
 *
 * On rend aussi la valorisation DÉJÀ enregistrée quand il y en a une. Elle ne
 * sert pas à décorer la ligne : c'est elle qui interdit le lot (voir plus bas).
 *
 * Route spécifique AVANT la paramétrique `/:id/valorisations` — l'ordre
 * d'Express, et une leçon déjà payée.
 */
/* ═══════════════════════════════════════════════════════════════════════════
 * LE CIRCUIT DE LA VALORISATION — UNE ROUTE PAR ÉTAPE DE LA PROCÉDURE
 *
 * Chacune écrit au journal QUI a posé le geste et QUAND, et chacune refuse de
 * s'exécuter si l'étape précédente n'a pas été franchie. Ce n'est pas de la
 * bureaucratie : c'est ce qui manquait le jour où une attestation erronée est
 * sortie d'un dossier que personne n'avait instruit, avec la signature de la
 * direction et le cachet de l'établissement dessus.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Le vocabulaire du circuit, servi par le serveur — deux listes, une affichée
 *  et une contrôlée, finiraient par diverger. */
r.get('/valorisations/referentiel', authRequired, (req, res) => {
  res.json({ bases: BASES, finalites: FINALITES, etats: ETATS,
             pourcentage_dispense: POURCENTAGE_DISPENSE, motifs: motifsVA() });
});

/**
 * LE DOSSIER TEL QUE LES CONTRÔLES DOIVENT LE VOIR.
 *
 * `manquesDossier` a besoin du nombre d'équivalences pour juger si un accord
 * partiel est motivé. Une requête qui l'oublie rend un dossier « complet »
 * alors qu'il ne l'est pas — et c'est le genre d'écart qui ne se voit qu'au
 * moment où la pièce fausse est déjà partie. Une seule lecture, employée par
 * toutes les routes du circuit.
 */
function lireDossierComplet(vid) {
  return db.prepare(`
    SELECT v.*, e.nom, e.prenom, e.id_ecampus,
           (SELECT COUNT(*) FROM etudiant_valorisation_aa a
             WHERE a.valorisation_id = v.id) AS nb_equivalences,
           (SELECT COUNT(*) FROM etudiant_valorisation_fichier f
             WHERE f.valorisation_id = v.id) AS nb_preuves,
           (SELECT COUNT(*) FROM etudiant_valorisation_fichier f
             WHERE f.valorisation_id = v.id AND f.nature = 'TEST') AS nb_preuves_test
    FROM etudiant_valorisation v
    JOIN etudiant e ON e.id = v.etudiant_id
    WHERE v.id = ?`).get(Number(vid));
}

/**
 * UN DOSSIER VALIDÉ NE SE MODIFIE PLUS.
 *
 * Sans ce gel, la validation ne garantirait rien : on validerait un dossier
 * propre, puis on corrigerait la décision derrière, et la pièce déjà partie
 * reposerait sur autre chose que ce qui a été validé. Pour corriger, on
 * dévalide — et dévalider est un acte de direction qui se motive.
 */
function refuseSiValide(v, res) {
  if (v?.valide_le) {
    res.status(409).json({ error: `Ce dossier a été validé le ${v.valide_le}`
      + `${v.valide_par ? ` par ${v.valide_par}` : ''} : il ne se modifie plus. `
      + 'Pour le corriger, la direction doit d’abord retirer la validation, et '
      + 'elle motive ce retrait.' });
    return true;
  }
  return false;
}

/** Un dossier, son état, ce qui lui manque, et son journal. */
r.get('/valorisations/:vid/dossier', authRequired, (req, res) => {
  const vid = Number(req.params.vid);
  const v = lireDossierComplet(vid);
  if (!v) return res.status(404).json({ error: 'Dossier introuvable.' });
  if (!valorisationPermise(req, res, vid)) return;

  const admission = estAdmissionDeSection(v);
  const valorisable = admission
    ? { ok: true, unite: null, motif: null }
    : uniteValorisable(v.ue_num, v.annee_scolaire);
  res.json({
    dossier: { ...v, etat: etatDeduit(v) },
    admission_de_section: admission,
    // Ce que l'admission ouvre, calculé à la lecture : c'est le programme du
    // jour qui fait foi, pas une liste recopiée le jour de la décision.
    unites_de_base: admission ? unitesDeBase(v.section, v.annee_scolaire) : [],
    unite: valorisable.unite,
    unite_valorisable: valorisable.ok,
    unite_motif: valorisable.motif,
    delai: controleDelai({ ueNum: admission ? null : v.ue_num, annee: v.annee_scolaire,
                           date_demande: v.date_demande,
                           date_reception: v.date_reception }),
    manques: manquesDossier(v),
    // CE QUI PROTÈGE LA SIGNATURE : l'écran le montre AVANT qu'on demande la
    // pièce, plutôt que de faire découvrir le refus au moment de l'imprimer.
    piece: pieceProduisible(v),
    peut_valider: gesteAutorise(req, 'valorisation.valider') === 'oui',
    peut_devalider: gesteAutorise(req, 'valorisation.devalider') === 'oui',
    journal: journalDe(vid),
  });
});

/**
 * ÉTAPE 2 — L'INTRODUCTION DE LA DEMANDE.
 *
 * La date d'introduction n'était nulle part : « hors délai » ne se constatait
 * donc jamais, il se plaidait de mémoire. Et si la date d'envoi du courriel est
 * postérieure à celle portée sur le formulaire, c'est L'ENVOI qui fait foi —
 * sans quoi il suffirait d'antidater le formulaire.
 */
r.put('/valorisations/:vid/demande', authRequired, gesteRequis('valorisation.instruire'),
  (req, res) => {
    const vid = Number(req.params.vid);
    if (!valorisationPermise(req, res, vid)) return;
    const v = db.prepare('SELECT * FROM etudiant_valorisation WHERE id = ?').get(vid);
    if (!v) return res.status(404).json({ error: 'Dossier introuvable.' });
    if (refuseSiValide(v, res)) return;
    const { date_demande, date_reception, mode_introduction } = req.body;

    /* UNE DEMANDE SE CORRIGE TANT QU'ELLE N'A PAS ÉTÉ TRANCHÉE.
     *
     * La nature de la demande — AD, VA ou VAE — se posait à la matrice et ne
     * se changeait plus nulle part : un étudiant introduit en VA alors qu'il
     * apporte une expérience professionnelle restait en VA pour toujours. Et
     * ce qu'il DEMANDE — une dispense partielle plutôt que complète — ne se
     * touchait qu'à l'étape de décision, donc après la recevabilité et l'avis.
     * On ne pouvait donc pas enregistrer la demande telle qu'elle est arrivée.
     *
     * Ce sont deux choses distinctes, et elles le restent : ici on écrit CE
     * QUI EST DEMANDÉ ; à l'étape 6, le Conseil écrit CE QU'IL ACCORDE. Rien
     * n'oblige les deux à coïncider — c'est même tout l'objet d'un accord
     * partiel.
     *
     * Tant que le dossier n'est pas validé : `refuseSiValide` ci-dessus. Une
     * demande corrigée après la signature réécrirait l'histoire. */
    const porte = CODES_PORTE.includes(String(req.body.porte))
      ? String(req.body.porte) : v.porte;
    const type = ['complete', 'partielle', 'admission'].includes(String(req.body.type))
      ? String(req.body.type) : v.type;

    /* UNE ADMISSION N'EST PAS UNE DISPENSE, ET RÉCIPROQUEMENT.
     * La porte « admission » emporte la finalité — c'est la seule des trois
     * qui la dise. Laisser les deux diverger produirait un dossier qui demande
     * une admission et accorde une dispense. */
    const typeFinal = porte === 'admission' ? 'admission'
      : (type === 'admission' ? 'partielle' : type);

    /* CE QUI N'EST PAS ENVOYÉ N'EST PAS EFFACÉ.
     *
     * La route écrivait les trois dates à chaque appel : corriger la seule
     * NATURE de la demande remettait donc date et mode à zéro, en silence — on
     * changeait « VA » en « VAE » et l'on perdait la date d'introduction, donc
     * le contrôle du délai avec elle. Une mise à jour partielle qui efface ce
     * qu'elle ne connaît pas n'est pas une mise à jour, c'est un écrasement.
     *
     * On distingue donc « absent du corps » (on garde) de « envoyé vide » (on
     * efface) — c'est la différence entre ne rien dire et dire « rien ». */
    const garder = (nom, valeur) => (nom in req.body ? (valeur || null) : v[nom]);
    db.prepare(`UPDATE etudiant_valorisation
      SET date_demande = ?, date_reception = ?, mode_introduction = ?,
          porte = ?, type = ? WHERE id = ?`)
      .run(garder('date_demande', date_demande),
           garder('date_reception', date_reception),
           garder('mode_introduction', mode_introduction),
           porte || null, typeFinal, vid);
    journaliser(vid, 'introduction', req,
      `demande du ${date_demande || '?'} · reçue le ${date_reception || '?'}`
      + (mode_introduction ? ` · ${mode_introduction}` : '')
      + (porte !== v.porte || typeFinal !== v.type
        ? ` · demande : ${porte || '?'} / ${typeFinal}` : ''));
    rafraichirEtat(vid);
    const delai = controleDelai({
      ueNum: estAdmissionDeSection({ type: typeFinal, porte, ue_num: v.ue_num })
        ? null : v.ue_num,
      annee: v.annee_scolaire,
      date_demande: garder('date_demande', date_demande),
      date_reception: garder('date_reception', date_reception),
    });
    res.json({ ok: true, delai });
  });

/**
 * ÉTAPE 3 — LA RECEVABILITÉ. UN REFUS DE FORME N'EST PAS UN REFUS PÉDAGOGIQUE.
 *
 * Hors délai, formulaire incomplet, pièces non officielles : la coordination
 * déclare irrecevable, et le motif de FORME s'écrit dans sa propre colonne. Les
 * confondre avec le motif pédagogique produisait des refus dont on ne savait
 * plus, un an après, s'ils portaient sur le fond ou sur la procédure.
 *
 * « Toute demande est encodée dans Lucie, recevable ou non » : une irrecevable
 * reste un dossier, avec sa trace et son document de refus.
 */
r.put('/valorisations/:vid/recevabilite', authRequired, gesteRequis('valorisation.instruire'),
  (req, res) => {
    const vid = Number(req.params.vid);
    if (!valorisationPermise(req, res, vid)) return;
    const v = db.prepare('SELECT * FROM etudiant_valorisation WHERE id = ?').get(vid);
    if (!v) return res.status(404).json({ error: 'Dossier introuvable.' });
    if (refuseSiValide(v, res)) return;
    /* LA RECEVABILITÉ SE POSE ENCORE SUR UN DOSSIER DÉCIDÉ HORS CIRCUIT.
     * Refuser parce qu'« une décision est déjà là » suppose qu'elle a été
     * instruite ; sur un dossier antérieur au circuit, elle ne l'a pas été, et
     * le refus enfermait le dossier sans issue. Un dossier RÉELLEMENT instruit,
     * lui, reste protégé : sa recevabilité ne se rejuge pas. */
    if (v.decision_le && !decideHorsCircuit(v)) {
      return res.status(409).json({ error: "La décision du Conseil est déjà "
        + 'enregistrée : la recevabilité ne se rejuge pas après coup.' });
    }
    const recevable = req.body.recevable ? 1 : 0;
    const motif = String(req.body.motif_irrecevabilite || '').trim();
    if (!recevable && !motif) {
      return res.status(400).json({ error: "Une irrecevabilité se motive : c'est "
        + 'un refus de forme, et il est notifié à l’étudiant.' });
    }
    const qui = req.user?.nom || req.user?.email || null;
    db.prepare(`UPDATE etudiant_valorisation
      SET recevable = ?, motif_irrecevabilite = ?, recevabilite_par = ?,
          recevabilite_le = datetime('now') WHERE id = ?`)
      .run(recevable, recevable ? null : motif, qui, vid);
    journaliser(vid, recevable ? 'recevable' : 'irrecevable', req,
      recevable ? null : motif);
    // RECEVABLE : les chargés de cours des cours visés sont appelés et prévenus.
    if (recevable) appelerCharges(vid).catch(e => console.error('[avisVA]', e.message));
    res.json({ ok: true, etat: rafraichirEtat(vid) });
  });

/**
 * ÉTAPE 4 — L'AVIS ÉCRIT ET MOTIVÉ DU CHARGÉ DE COURS.
 *
 * C'EST LA PIÈCE QUI MANQUAIT. Le Conseil décidait sans que rien n'atteste
 * qu'une analyse pédagogique ait eu lieu : on comparait — ou non — les preuves
 * au dossier pédagogique, et il n'en restait aucune trace. Un avis sans texte
 * n'est pas un avis : la motivation est obligatoire, parce que les décisions de
 * VA ne sont pas susceptibles de recours (RDE art. 30 et 87 §2) et que c'est
 * tout ce qui restera pour les défendre.
 */
r.put('/valorisations/:vid/avis', authRequired, gesteRequis('valorisation.avis'),
  (req, res) => {
    const vid = Number(req.params.vid);
    if (!valorisationPermise(req, res, vid)) return;
    const v = db.prepare('SELECT * FROM etudiant_valorisation WHERE id = ?').get(vid);
    if (!v) return res.status(404).json({ error: 'Dossier introuvable.' });
    if (refuseSiValide(v, res)) return;
    if (v.recevable == null) {
      return res.status(409).json({ error: "La recevabilité n'a pas été contrôlée : "
        + "l'analyse pédagogique vient APRÈS (étape 4 de la procédure)." });
    }
    if (v.recevable === 0) {
      return res.status(409).json({ error: 'Le dossier est irrecevable : il ne se '
        + 'transmet pas au chargé de cours.' });
    }
    const sens = String(req.body.avis_sens || '');
    if (!['favorable','partiel','defavorable'].includes(sens)) {
      return res.status(400).json({ error: "Le sens de l'avis est requis : favorable, "
        + 'partiel ou défavorable.' });
    }
    const texte = String(req.body.avis_texte || '').trim();
    if (!texte) {
      return res.status(400).json({ error: "Un avis se motive par écrit : c'est lui "
        + 'qui fonde la décision du Conseil, et il n’y a pas de recours ensuite.' });
    }
    // QUI REND L'AVIS N'EST PAS QUI LE SAISIT : le chargé de cours est nommé
    // à l'écran ; à défaut, celui qui saisit. Le journal garde, lui, la main
    // qui a tenu le clavier.
    const qui = String(req.body.avis_par || '').trim()
      || req.user?.nom || req.user?.email || null;
    // Des chargés de cours ont déjà rendu le leur dans Mes cours : celui-ci
    // s'ajoute à la liste, il ne les écrase pas.
    if (!avisCoordination(v, qui, sens, texte, req.user?.nom || req.user?.email || null)) {
      db.prepare(`UPDATE etudiant_valorisation
        SET avis_sens = ?, avis_texte = ?, avis_par = ?, avis_le = datetime('now')
        WHERE id = ?`).run(sens, texte, qui, vid);
    }
    journaliser(vid, 'avis', req, `${sens} — ${texte.slice(0, 180)}`);
    res.json({ ok: true, etat: rafraichirEtat(vid) });
  });

/**
 * ÉTAPE 6 — LA DÉCISION DU CONSEIL DES ÉTUDES.
 *
 * Elle exige ce que la procédure exige, et le serveur ne l'accorde pas
 * autrement : un dossier recevable, un avis rendu, une BASE (VAF V1-V4 ou
 * VANFI D/E) et une motivation. Le pourcentage, lui, NE SE SAISIT PAS — la
 * réussite d'une dispense est fixée à 50 % (RDE art. 29 §3 et 30) ; un chiffre
 * modifiable finit par être modifié, et il part sur une pièce signée.
 */
r.put('/valorisations/:vid/decision', authRequired, gesteRequis('valorisation.instruire'),
  (req, res) => {
    const vid = Number(req.params.vid);
    if (!valorisationPermise(req, res, vid)) return;
    const v = db.prepare('SELECT * FROM etudiant_valorisation WHERE id = ?').get(vid);
    if (!v) return res.status(404).json({ error: 'Dossier introuvable.' });

    if (refuseSiValide(v, res)) return;
    if (v.recevable == null) {
      return res.status(409).json({ error: "La recevabilité n'a pas été contrôlée "
        + '(étape 3) : le Conseil ne peut pas décider d’un dossier non instruit.' });
    }
    if (v.recevable === 1 && !v.avis_le) {
      return res.status(409).json({ error: "L'avis écrit du chargé de cours manque "
        + '(étape 4) : c’est lui qui fonde la décision.' });
    }

    // Une admission reste une admission, quel que soit le mot de l'écran.
    const type = estAdmissionDeSection(v) ? 'admission' : (req.body.type || v.type);
    const decision = req.body.decision === 'refusee' ? 'refusee' : 'accordee';
    const corps = { ...req.body, type, porte: v.porte, decision,
                    annee_scolaire: v.annee_scolaire, ue_num: v.ue_num };
    const souci = verifierValorisation(corps) || verifierDecisionCE(corps);
    if (souci) return res.status(400).json({ error: souci });

    const refus = decision === 'refusee';
    const qui = req.user?.nom || req.user?.email || null;
    db.prepare(`UPDATE etudiant_valorisation
      SET type = ?, decision = ?, base_code = ?, motif_refus = ?,
          cible = ?, cible_detail = ?, pourcentage = ?,
          decision_ce_date = ?, commentaire = ?,
          decision_par = ?, decision_le = datetime('now')
      WHERE id = ?`).run(
        type, decision, refus ? null : String(req.body.base_code),
        refus ? String(req.body.motif_refus).trim() : null,
        !refus && type === 'partielle' ? (req.body.cible || v.cible) : null,
        !refus && type === 'partielle' ? (req.body.cible_detail ?? v.cible_detail) : null,
        pourcentageDe({ decision, type }),
        req.body.decision_ce_date || v.decision_ce_date || null,
        req.body.commentaire ?? v.commentaire ?? null,
        qui, vid);

    if (!refus && Array.isArray(req.body.equivalences)) {
      ecrireEquivalences(vid, req.body.equivalences);
    }
    journaliser(vid, refus ? 'decision_refus' : 'decision_accord', req,
      refus ? String(req.body.motif_refus).trim().slice(0, 180)
            : `${type} · base ${req.body.base_code}`);
    res.json({ ok: true, etat: rafraichirEtat(vid) });
  });

/**
 * ÉTAPE 5 — LE TEST OU L'ÉPREUVE COMPLÉMENTAIRE.
 *
 * Quand le Conseil ne peut pas se prononcer sur pièces — acquis non formels,
 * dossier jugé insuffisant —, il fixe un test (AGCF du 13.12.2024, art. 2 §3,
 * art. 4 §2 et art. 6). Pour une ADMISSION, ce test porte sur les capacités
 * préalables requises, et à l'IIP cela veut dire deux résultats qui se disent :
 * le FRANÇAIS et les MATHÉMATIQUES.
 *
 * Ils vivaient dans la tête de celui qui avait corrigé, ou sur une feuille
 * dans une farde — donc nulle part le jour où l'on demande sur quoi
 * l'admission s'est fondée. Ils entrent ici, avec la date, et la copie se
 * dépose en pièce du dossier : « les copies d'épreuves ou tests ayant servi à
 * la décision » se conservent quatre ans et se présentent à l'inspection
 * (art. 5 al. 2).
 */
r.put('/valorisations/:vid/test', authRequired, gesteRequis('valorisation.avis'),
  (req, res) => {
    const vid = Number(req.params.vid);
    if (!valorisationPermise(req, res, vid)) return;
    const v = lireDossierComplet(vid);
    if (!v) return res.status(404).json({ error: 'Dossier introuvable.' });
    if (refuseSiValide(v, res)) return;

    const lire = x => {
      if (x === '' || x == null) return null;
      const n = Number(String(x).replace(',', '.'));
      return Number.isFinite(n) ? n : NaN;
    };
    const fr = lire(req.body.test_note_francais);
    const ma = lire(req.body.test_note_maths);
    // UNE NOTE QUI N'EN EST PAS NE S'ENREGISTRE PAS. Un « /20 » collé dans la
    // case, et l'on stockerait NaN : la pièce dirait alors que le test a eu
    // lieu sans pouvoir en donner le résultat.
    for (const [nom, val] of [['français', fr], ['mathématiques', ma]]) {
      if (Number.isNaN(val)) {
        return res.status(400).json({ error: `La note de ${nom} n'est pas un nombre.` });
      }
      if (val != null && (val < 0 || val > 20)) {
        return res.status(400).json({ error: `La note de ${nom} doit être comprise entre 0 et 20.` });
      }
    }

    db.prepare(`UPDATE etudiant_valorisation
      SET test_note_francais = ?, test_note_maths = ?, test_date = ?, test_par = ?
      WHERE id = ?`).run(fr, ma, req.body.test_date || null,
                         req.user?.nom || req.user?.email || null, vid);
    journaliser(vid, 'test', req,
      `français ${fr ?? '—'}/20 · mathématiques ${ma ?? '—'}/20`
      + (req.body.test_date ? ` · ${req.body.test_date}` : ''));
    res.json({ ok: true, copie_archivee: Number(v.nb_preuves_test || 0) > 0 });
  });

/**
 * ÉTAPE 6 BIS — LA VALIDATION PAR LA DIRECTION OU SON DÉLÉGUÉ.
 *
 * C'EST LE GESTE QUI ENGAGE LA SIGNATURE, ET IL N'EXISTAIT PAS.
 *
 * Tout le circuit peut être parcouru dans l'ordre et la pièce rester fausse si
 * personne, en fin d'étude, n'a regardé le dossier entier et dit « celui-ci
 * part ». C'est exactement ce qui a manqué : la coordination avait instruit à
 * sa façon, et la signature de la direction s'est retrouvée sur le résultat
 * sans que la direction ait rien vu.
 *
 * Trois conséquences, et elles tiennent ensemble :
 *   — la validation est RÉSERVÉE (direction, adjoint, coordination) ;
 *   — elle exige un dossier SANS MANQUE : on ne valide pas ce qui n'est pas
 *     instruit, sinon la case ne vaudrait rien ;
 *   — elle GÈLE le dossier : recevabilité, avis et décision ne se modifient
 *     plus. Une pièce signée ne doit pas pouvoir reposer sur un dossier
 *     retouché après coup. Pour corriger, il faut dévalider, et dévalider est
 *     un acte de direction qui se motive.
 */
r.put('/valorisations/:vid/validation', authRequired, (req, res) => {
  if (gesteAutorise(req, 'valorisation.valider') !== 'oui') {
    return res.status(403).json({ error: 'La validation appartient à la direction '
      + "et à la direction adjointe : la coordination instruit le dossier, elle ne "
      + 'valide pas son propre travail.' });
  }
  const vid = Number(req.params.vid);
  const v = lireDossierComplet(vid);
  if (!v) return res.status(404).json({ error: 'Dossier introuvable.' });
  if (v.valide_le) {
    return res.status(409).json({ error: `Déjà validé le ${v.valide_le}`
      + `${v.valide_par ? ` par ${v.valide_par}` : ''}.` });
  }
  // ON NE VALIDE PAS CE QUI N'EST PAS INSTRUIT : une case qu'on peut cocher
  // sur un dossier incomplet ne vaut rien, et donnerait une fausse garantie.
  const manques = manquesDossier(v).filter(m => !m.startsWith('Le dossier n’a pas été validé'));
  if (manques.length) {
    return res.status(409).json({
      error: 'Ce dossier ne peut pas être validé en l’état.', manques });
  }
  db.prepare(`UPDATE etudiant_valorisation
    SET valide_le = datetime('now'), valide_par = ?, valide_par_id = ?, valide_role = ?
    WHERE id = ?`).run(req.user?.nom || req.user?.email || null,
                       req.user?.id ?? null, req.user?.role || null, vid);
  journaliser(vid, 'validation', req, req.body?.detail || null);
  res.json({ ok: true, etat: rafraichirEtat(vid) });
});

/** Retirer une validation : direction seule, motif écrit, trace conservée. */
r.delete('/valorisations/:vid/validation', authRequired, (req, res) => {
  if (gesteAutorise(req, 'valorisation.devalider') !== 'oui') {
    return res.status(403).json({ error: 'Retirer une validation est réservé à la '
      + 'direction, qui seule valide : la coordination instruit le dossier.' });
  }
  const vid = Number(req.params.vid);
  const motif = String(req.body?.motif || '').trim();
  if (!motif) {
    return res.status(400).json({ error: 'Retirer une validation se motive : une '
      + 'pièce a pu partir sur la foi de cette validation.' });
  }
  db.prepare(`UPDATE etudiant_valorisation
    SET valide_le = NULL, valide_par = NULL, valide_par_id = NULL, valide_role = NULL
    WHERE id = ?`).run(vid);
  // LA TRACE RESTE, ELLE. Le journal est en ajout seul : on y lit encore la
  // validation retirée, qui l'avait posée, et pourquoi elle a été défaite.
  journaliser(vid, 'validation_retiree', req, motif);
  res.json({ ok: true, etat: rafraichirEtat(vid) });
});

/**
 * LA SÉANCE DU CONSEIL DES ÉTUDES — LES DOSSIERS D'UNE UNITÉ, UN À UN.
 *
 * Une séance ne se tient pas dossier par dossier au hasard du fichier : elle
 * porte sur UNE unité, et on passe ses demandes l'une après l'autre. Cette
 * route rend la file, dans l'ordre, avec pour chacune son état et ce qui lui
 * manque — de quoi avancer sans rouvrir dix écrans, et surtout de quoi voir
 * d'un coup ce qui n'est pas prêt à être validé.
 */
r.get('/valorisations/ue/:ueNum/seance-dossiers', authRequired, (req, res) => {
  if (!unitePermise(req, res, req.params.ueNum)) return;
  const ueNum = Number(req.params.ueNum);
  const annee = req.query.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  const lignes = db.prepare(`
    SELECT v.*, e.nom, e.prenom,
           (SELECT COUNT(*) FROM etudiant_valorisation_aa a
             WHERE a.valorisation_id = v.id) AS nb_equivalences,
           (SELECT COUNT(*) FROM etudiant_valorisation_fichier f
             WHERE f.valorisation_id = v.id) AS nb_preuves
    FROM etudiant_valorisation v
    JOIN etudiant e ON e.id = v.etudiant_id
    WHERE v.ue_num = ? AND v.annee_scolaire = ?
    ORDER BY e.nom, e.prenom
  `).all(ueNum, annee);

  const valorisable = uniteValorisable(ueNum, annee);
  res.json({
    ue_num: ueNum, annee, unite: valorisable.unite,
    peut_valider: gesteAutorise(req, 'valorisation.valider') === 'oui',
    peut_devalider: gesteAutorise(req, 'valorisation.devalider') === 'oui',
    dossiers: lignes.map(v => {
      const manques = manquesDossier(v);
      return {
        id: v.id, etudiant_id: v.etudiant_id, nom: v.nom, prenom: v.prenom,
        etat: etatDeduit(v), type: v.type, decision: v.decision,
        base_code: v.base_code, avis_sens: v.avis_sens,
        valide_le: v.valide_le, valide_par: v.valide_par, valide_role: v.valide_role,
        nb_preuves: v.nb_preuves,
        manques,
        // « prêt » veut dire : tout est là SAUF la validation elle-même.
        pret_a_valider: !v.valide_le
          && !manques.filter(m => !m.startsWith('Le dossier n’a pas été validé')).length,
      };
    }),
  });
});

/**
 * CORRIGER OU VALIDER EN SÉRIE — SANS PERDRE LA TRACE DE CHAQUE DOSSIER.
 *
 * En séance, la même correction vaut souvent pour huit dossiers : la même base
 * légale, la même date de Conseil. Les reprendre un à un, c'est huit occasions
 * de se tromper d'une case — et c'est ce qui fait qu'on ne les reprend pas.
 *
 * MAIS LE LOT NE DILUE PAS LA RESPONSABILITÉ : chaque dossier reçoit sa propre
 * ligne de journal, avec le nom de celui qui a posé le geste. On lit donc, un
 * an après, « validé par Untel le 20 septembre » sur CE dossier-là, et non un
 * geste collectif dont plus personne ne répond.
 *
 * TOUT OU RIEN, comme la création en lot : une écriture partielle laisserait
 * ignorer lesquels sont passés. Les dossiers qui bloquent sont NOMMÉS, et on
 * les décoche.
 */
r.post('/valorisations/lot/validation', authRequired, (req, res) => {
  if (gesteAutorise(req, 'valorisation.valider') !== 'oui') {
    return res.status(403).json({ error: 'La validation appartient à la direction '
      + "et à la direction adjointe : la coordination instruit le dossier, elle ne "
      + 'valide pas son propre travail.' });
  }
  const ids = [...new Set((Array.isArray(req.body?.ids) ? req.body.ids : [])
    .map(Number).filter(n => Number.isInteger(n) && n > 0))];
  if (!ids.length) return res.status(400).json({ error: 'Aucun dossier coché.' });
  if (!valorisationsPermises(req, res, ids)) return;

  const bloquants = [];
  const prets = [];
  const dossiers = [];
  for (const id of ids) {
    const v = lireDossierComplet(id);
    if (!v) { bloquants.push({ id, qui: `#${id}`, pourquoi: 'Dossier introuvable.' }); continue; }
    const qui = `${(v.nom || '').toUpperCase()} ${v.prenom || ''}`.trim();
    if (v.valide_le) {
      bloquants.push({ id, qui, pourquoi: `déjà validé le ${v.valide_le}` });
      continue;
    }
    const manques = manquesDossier(v)
      .filter(m => !m.startsWith('Le dossier n’a pas été validé'));
    if (manques.length) { bloquants.push({ id, qui, pourquoi: manques[0] }); continue; }
    prets.push(id);
    dossiers.push(v);
  }
  if (bloquants.length) {
    return res.status(409).json({
      error: `${bloquants.length} dossier(s) ne peuvent pas être validés : rien n'a `
        + 'été enregistré.', bloquants });
  }
  if (memeSeance(dossiers, res)) return;

  const maj = db.prepare(`UPDATE etudiant_valorisation
    SET valide_le = datetime('now'), valide_par = ?, valide_par_id = ?, valide_role = ?
    WHERE id = ?`);
  const nom = req.user?.nom || req.user?.email || null;
  db.transaction(() => {
    for (const id of prets) maj.run(nom, req.user?.id ?? null, req.user?.role || null, id);
  })();
  // Le journal, LIGNE PAR LIGNE : un geste en série reste une suite de gestes
  // individuels, et c'est ainsi qu'il se relit.
  for (const id of prets) {
    journaliser(id, 'validation', req, `validation en série (${prets.length} dossiers)`);
    rafraichirEtat(id);
  }
  res.json({ ok: true, valides: prets.length });
});

/** Corriger en série : la même décision appliquée à plusieurs dossiers. */
r.post('/valorisations/lot/decision', authRequired, gesteRequis('valorisation.instruire'), (req, res) => {
  const ids = [...new Set((Array.isArray(req.body?.ids) ? req.body.ids : [])
    .map(Number).filter(n => Number.isInteger(n) && n > 0))];
  if (!ids.length) return res.status(400).json({ error: 'Aucun dossier coché.' });
  if (!valorisationsPermises(req, res, ids)) return;

  const bloquants = [];
  const cibles = [];
  for (const id of ids) {
    const v = lireDossierComplet(id);
    if (!v) { bloquants.push({ id, qui: `#${id}`, pourquoi: 'Dossier introuvable.' }); continue; }
    const qui = `${(v.nom || '').toUpperCase()} ${v.prenom || ''}`.trim();
    const bloque = bloqueDecisionEnLot(v);
    if (bloque) { bloquants.push({ id, qui, pourquoi: bloque }); continue; }
    cibles.push(v);
  }
  if (bloquants.length) {
    return res.status(409).json({
      error: `${bloquants.length} dossier(s) bloquent : rien n'a été enregistré.`,
      bloquants });
  }
  if (memeSeance(cibles, res, req.body.decision_ce_date || null)) return;

  const decision = req.body.decision === 'refusee' ? 'refusee' : 'accordee';
  const refus = decision === 'refusee';
  /* UNE ADMISSION RESTE UNE ADMISSION. « Dispense totale » à l'écran veut dire,
     pour elle, « accordée » : elle ne porte sur aucune unité, et l'écrire en
     « complete » en aurait fait une dispense d'une unité 0 qui n'existe pas.
     Une admission n'a pas de cours à dispenser : pas de partielle. */
  const typeDe = v => (estAdmissionDeSection(v) ? 'admission' : req.body.type);
  if (!refus && req.body.type === 'partielle') {
    const adm = cibles.filter(v => estAdmissionDeSection(v));
    if (adm.length) {
      return res.status(409).json({ error: "Une admission ne se décide pas en dispense partielle : elle est accordée ou refusée.",
        bloquants: adm.map(v => ({ id: v.id, qui: `${(v.nom || '').toUpperCase()} ${v.prenom || ''}`.trim(), pourquoi: 'admission de section' })) });
    }
  }
  for (const v of cibles) {
    const corps = { ...req.body, type: typeDe(v), porte: v.porte, decision,
                    annee_scolaire: v.annee_scolaire, ue_num: v.ue_num };
    const souci = verifierValorisation(corps) || verifierDecisionCE(corps);
    if (souci) return res.status(400).json({ error: souci });
  }

  const nom = req.user?.nom || req.user?.email || null;
  db.transaction(() => {
    for (const v of cibles) ecrireDecision(v, { ...req.body, type: typeDe(v), decision }, nom);
  })();
  for (const v of cibles) {
    journaliser(v.id, refus ? 'decision_refus' : 'decision_accord', req,
      `en série (${cibles.length} dossiers) · ${refus ? 'refus'
        : `${typeDe(v)} · base ${req.body.base_code}`}`);
    rafraichirEtat(v.id);
  }
  res.json({ ok: true, corriges: cibles.length });
});

/**
 * DÉCIDER PAR ÉTUDIANT — UNE DÉCISION PAR UNITÉ, ENREGISTRÉES ENSEMBLE.
 *
 * Demandé par Charles le 21 septembre 2026 : un dossier arrive pour UN
 * étudiant et PLUSIEURS unités, le Conseil les examine dans la même séance.
 * Le lot « même décision pour tous » ne convient pas : sur trois unités, l'une
 * est accordée entièrement, l'autre en partie — cours ou acquis propres à CETTE
 * unité —, la troisième refusée. Une ligne par dossier, donc, chacune avec sa
 * décision, et un seul enregistrement.
 *
 * LES MÊMES CONTRÔLES QU'UN À UN, DOSSIER PAR DOSSIER : verifierValorisation
 * et verifierDecisionCE, sans quoi on bâtirait une porte dérobée pour écrire
 * ce que la porte d'entrée refuse. La date de séance est COMMUNE : c'est ce
 * qui fait de ces décisions celles d'une même réunion, et `memeSeance` le
 * vérifie avec la section.
 *
 * TOUT OU RIEN, et ce qui bloque est NOMMÉ, dossier et unité : un
 * enregistrement partiel laisserait croire que tout est décidé.
 */
r.post('/valorisations/lot/decisions', authRequired, gesteRequis('valorisation.instruire'), (req, res) => {
  const dateCE = String(req.body?.decision_ce_date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateCE)) {
    return res.status(400).json({ error: 'La date de la séance du Conseil est obligatoire : '
      + 'c’est elle qui fait de ces décisions celles d’une même réunion.' });
  }
  const lignes = Array.isArray(req.body?.lignes) ? req.body.lignes : [];
  const ids = lignes.map(l => Number(l?.id));
  if (!lignes.length) return res.status(400).json({ error: 'Aucune décision à enregistrer.' });
  if (!valorisationsPermises(req, res, ids.filter(n => Number.isInteger(n) && n > 0))) return;
  if (ids.some(n => !Number.isInteger(n) || n <= 0) || new Set(ids).size !== ids.length) {
    return res.status(400).json({ error: 'Chaque dossier ne porte qu’une décision.' });
  }

  const bloquants = [];
  const cibles = [];
  for (const l of lignes) {
    const v = lireDossierComplet(l.id);
    if (!v) { bloquants.push({ id: l.id, qui: `#${l.id}`, pourquoi: 'Dossier introuvable.' }); continue; }
    const qui = `${(v.nom || '').toUpperCase()} ${v.prenom || ''} — UE ${v.ue_num}`.trim();
    const bloque = bloqueDecisionEnLot(v)
      // L'ADMISSION n'est pas une dispense d'unité : elle se décide par
      // section, dans son dossier, et ne se range pas dans ce tableau.
      || (v.ue_num === 0 || v.type === 'admission'
        ? 'admission — elle se décide dans son propre dossier' : null);
    if (bloque) { bloquants.push({ id: v.id, qui, pourquoi: bloque }); continue; }

    const decision = l.decision === 'refusee' ? 'refusee' : 'accordee';
    const type = decision === 'refusee' ? 'complete'
      : (l.type === 'partielle' ? 'partielle' : 'complete');
    const corps = {
      decision, type,
      base_code: l.base_code, motif_refus: l.motif_refus,
      cible: l.cible, cible_detail: l.cible_detail,
      equivalences: l.equivalences, commentaire: l.commentaire,
      decision_ce_date: dateCE,
      annee_scolaire: v.annee_scolaire, ue_num: v.ue_num,
    };
    const souci = verifierValorisation(corps) || verifierDecisionCE(corps);
    if (souci) { bloquants.push({ id: v.id, qui, pourquoi: souci }); continue; }
    cibles.push({ v, corps });
  }
  if (bloquants.length) {
    return res.status(409).json({
      error: `${bloquants.length} décision(s) ne peuvent pas être enregistrées : rien `
        + "n'a été écrit.", bloquants });
  }
  if (memeSeance(cibles.map(c => c.v), res, dateCE)) return;

  const nom = req.user?.nom || req.user?.email || null;
  db.transaction(() => {
    for (const { v, corps } of cibles) ecrireDecision(v, corps, nom);
  })();
  // UNE LIGNE DE JOURNAL PAR DOSSIER, avec ce qui a été décidé pour lui : le
  // lot ne dilue pas la responsabilité, et ne confond pas les décisions.
  for (const { v, corps } of cibles) {
    const refus = corps.decision === 'refusee';
    journaliser(v.id, refus ? 'decision_refus' : 'decision_accord', req,
      `par étudiant (${cibles.length} dossiers, séance du ${dateCE}) · `
      + (refus ? `refus — ${String(corps.motif_refus || '').trim().slice(0, 120)}`
               : `${corps.type} · base ${corps.base_code}`));
    rafraichirEtat(v.id);
  }
  res.json({ ok: true, decides: cibles.length, ids: cibles.map(c => c.v.id) });
});

/**
 * L'AVIS DU CHARGÉ DE COURS EN SÉRIE — UN AVIS, UN AUTEUR, UNE COHORTE.
 *
 * Il ne l'était pas, et c'est ce qui bloquait le rattrapage : dix-sept
 * dossiers ATNUP à ouvrir un par un pour écrire dix-sept fois le même constat,
 * avant de pouvoir seulement cocher la décision.
 *
 * La réserve posée en le construisant tient toujours : **un avis rendu en lot
 * porte le même texte pour tous**, et cela n'a de sens que sur une cohorte
 * homogène — même unité, même diplôme antérieur, même analyse. Le chargé de
 * cours est NOMMÉ une fois pour le lot : c'est lui qui répond de l'avis, pas
 * celui qui le saisit. Chaque dossier garde sa propre ligne de journal, avec
 * l'un et l'autre.
 *
 * L'ordre du circuit ne fléchit pas : la recevabilité vient avant, et un
 * dossier irrecevable ne se transmet pas au chargé de cours.
 */
r.post('/valorisations/lot/avis', authRequired, gesteRequis('valorisation.avis'),
  (req, res) => {
    const ids = [...new Set((Array.isArray(req.body?.ids) ? req.body.ids : [])
      .map(Number).filter(n => Number.isInteger(n) && n > 0))];
    if (!ids.length) return res.status(400).json({ error: 'Aucun dossier coché.' });
    if (!valorisationsPermises(req, res, ids)) return;

    const sens = String(req.body.avis_sens || '');
    if (!['favorable','partiel','defavorable'].includes(sens)) {
      return res.status(400).json({ error: "Le sens de l'avis est requis : favorable, "
        + 'partiel ou défavorable.' });
    }
    const texte = String(req.body.avis_texte || '').trim();
    if (!texte) {
      return res.status(400).json({ error: "Un avis se motive par écrit : c'est lui "
        + 'qui fonde la décision du Conseil, et il n’y a pas de recours ensuite.' });
    }
    /* QUI REND L'AVIS N'EST PAS QUI LE SAISIT. Le secrétariat peut consigner
     * l'avis du chargé de cours ; c'est le nom du chargé de cours qui doit
     * figurer au dossier, sans quoi la pièce attribue l'analyse pédagogique à
     * celui qui a tenu le clavier. */
    const auteur = String(req.body.avis_par || '').trim();
    if (!auteur) {
      return res.status(400).json({ error: "Le chargé de cours qui rend l'avis doit "
        + 'être nommé : c’est lui qui en répond.' });
    }

    const bloquants = [];
    const cibles = [];
    for (const id of ids) {
      const v = lireDossierComplet(id);
      if (!v) { bloquants.push({ id, qui: `#${id}`, pourquoi: 'Dossier introuvable.' }); continue; }
      const qui = `${(v.nom || '').toUpperCase()} ${v.prenom || ''}`.trim();
      if (v.valide_le) {
        bloquants.push({ id, qui, pourquoi: `déjà validé le ${v.valide_le} — le dévalider d’abord` });
        continue;
      }
      if (v.recevable == null) {
        bloquants.push({ id, qui, pourquoi: "recevabilité non contrôlée — l'analyse vient après" });
        continue;
      }
      if (v.recevable === 0) {
        bloquants.push({ id, qui, pourquoi: 'irrecevable — ne se transmet pas au chargé de cours' });
        continue;
      }
      cibles.push(v);
    }
    if (bloquants.length) {
      return res.status(409).json({
        error: `${bloquants.length} dossier(s) bloquent : rien n'a été enregistré.`,
        bloquants });
    }

    const maj = db.prepare(`UPDATE etudiant_valorisation
      SET avis_sens = ?, avis_texte = ?, avis_par = ?, avis_le = datetime('now')
      WHERE id = ?`);
    db.transaction(() => {
      for (const v of cibles) {
        if (!avisCoordination(v, auteur, sens, texte, req.user?.nom || req.user?.email || null)) maj.run(sens, texte, auteur, v.id);
      }
    })();
    for (const v of cibles) {
      journaliser(v.id, 'avis', req,
        `en série (${cibles.length} dossiers) · ${auteur} · ${sens} — ${texte.slice(0, 140)}`);
      rafraichirEtat(v.id);
    }
    res.json({ ok: true, traites: cibles.length });
  });

/**
 * LA DATE DE LA DEMANDE, POSÉE EN LOT.
 *
 * Une cohorte dépose ses demandes le même jour — c'est le cas ordinaire d'une
 * reprise d'études : le secrétariat reçoit une liasse. La saisir dossier par
 * dossier, c'est dix-sept fois la même date, avec dix-sept occasions de se
 * tromper d'un jour — et c'est cette date qui décide du délai (RDE art. 28).
 *
 * ELLE NE TOUCHE À RIEN D'AUTRE. Ni la nature, ni la portée, ni la décision :
 * une route qui corrige la date ne doit pas pouvoir réécrire le reste au
 * passage.
 */
r.post('/valorisations/lot/demande', authRequired, gesteRequis('valorisation.instruire'),
  (req, res) => {
    const ids = [...new Set((Array.isArray(req.body?.ids) ? req.body.ids : [])
      .map(Number).filter(n => Number.isInteger(n) && n > 0))];
    if (!ids.length) return res.status(400).json({ error: 'Aucun dossier coché.' });
    if (!valorisationsPermises(req, res, ids)) return;
    const dateDemande = String(req.body.date_demande || '').trim();
    const dateReception = String(req.body.date_reception || '').trim();
    if (!dateDemande && !dateReception) {
      return res.status(400).json({ error: 'Aucune date à poser.' });
    }

    const bloquants = [];
    const cibles = [];
    for (const id of ids) {
      const v = lireDossierComplet(id);
      if (!v) { bloquants.push({ id, qui: `#${id}`, pourquoi: 'Dossier introuvable.' }); continue; }
      const qui = `${(v.nom || '').toUpperCase()} ${v.prenom || ''}`.trim();
      if (v.valide_le) {
        bloquants.push({ id, qui, pourquoi: `déjà validé le ${v.valide_le} — le dévalider d’abord` });
        continue;
      }
      cibles.push(v);
    }
    if (bloquants.length) {
      return res.status(409).json({
        error: `${bloquants.length} dossier(s) bloquent : rien n'a été enregistré.`,
        bloquants });
    }

    const maj = db.prepare(`UPDATE etudiant_valorisation
      SET date_demande = COALESCE(?, date_demande),
          date_reception = COALESCE(?, date_reception)
      WHERE id = ?`);
    db.transaction(() => {
      for (const v of cibles) maj.run(dateDemande || null, dateReception || null, v.id);
    })();
    for (const v of cibles) {
      journaliser(v.id, 'demande', req, `dates posées en série (${cibles.length} dossiers)`
        + `${dateDemande ? ` · demande ${dateDemande}` : ''}`
        + `${dateReception ? ` · réception ${dateReception}` : ''}`);
      rafraichirEtat(v.id);
    }
    res.json({ ok: true, traites: cibles.length });
  });

/**
 * ANALYSER LES DEMANDES EN SÉRIE — LA VUE À PLAT DE TOUTE L'ANNÉE.
 *
 * Les dossiers se lisaient par étudiant, pliés les uns sous les autres : pour
 * savoir lesquels attendent une recevabilité, il fallait déplier dix-sept
 * lignes et ouvrir dix-sept fenêtres. Le tableau de ce qui reste à faire
 * NOMMAIT le retard — « 17 recevabilités à contrôler » — sans donner nulle part
 * où le traiter : un constat sans porte est un constat qu'on relit chaque
 * matin. Une ligne par demande, l'état et ce qui manque sur la même ligne,
 * filtrable, cochable.
 *
 * ELLE NE DÉCIDE RIEN : elle montre et elle coche. Tout ce qui s'écrit passe
 * par les routes de lot ci-dessus, avec leurs barrières et leur journal — une
 * seconde porte d'écriture finirait par accepter ce que la première refuse.
 */
r.get('/valorisations/analyse', authRequired, (req, res) => {
  const annee = req.query.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const lignes = db.prepare(`
    SELECT v.*, e.nom, e.prenom, e.id_ecampus, e.section_rattachement,
           /* UNE SOUS-REQUÊTE, PAS UNE JOINTURE — ET CE POINT A ÉTÉ CODÉ FAUX.
            * Un même numéro d'unité existe sous PLUSIEURS sections : c'est le
            * cas UE 95 « Restart », déjà payé une fois. Une jointure rendait
            * donc trois lignes pour un dossier, et le tableau affichait trois
            * fois le même étudiant — qu'on aurait coché trois fois, envoyé
            * trois fois, et journalisé trois fois. Un LIMIT 1 sur le nom
            * suffit : la section réelle du dossier se déduit plus bas. */
           (SELECT u.ue_nom FROM ue u WHERE u.ue_num = v.ue_num
             AND u.annee_scolaire = v.annee_scolaire LIMIT 1) AS ue_nom,
           (SELECT u.section FROM ue u WHERE u.ue_num = v.ue_num
             AND u.annee_scolaire = v.annee_scolaire LIMIT 1) AS ue_section,
           (SELECT COUNT(*) FROM etudiant_valorisation_aa a
             WHERE a.valorisation_id = v.id) AS nb_equivalences,
           (SELECT COUNT(*) FROM etudiant_valorisation_fichier f
             WHERE f.valorisation_id = v.id) AS nb_preuves
    FROM etudiant_valorisation v
    JOIN etudiant e ON e.id = v.etudiant_id
    WHERE v.annee_scolaire = ?
    ORDER BY v.ue_num, e.nom, e.prenom
  `).all(annee);

  /* LE PÉRIMÈTRE SE POSE ICI AUSSI. Une coordination limitée à TIM n'a pas à
   * lire les demandes d'optométrie — la règle des trente-trois routes
   * d'attribution vaut pour celle-ci, qui est précisément une route qui rend
   * TOUT. La section d'une demande est celle de l'unité ; à défaut (admission,
   * unité hors référentiel), celle de l'étudiant. */
  const permises = getUserSections(req.user);   // null = toutes
  const dossiers = [];
  for (const v of lignes) {
    const section = v.section || v.ue_section || v.section_rattachement || null;
    if (permises && section && !permises.includes(section)) continue;
    const manques = manquesDossier(v);
    dossiers.push({
      id: v.id, etudiant_id: v.etudiant_id,
      nom: v.nom, prenom: v.prenom, id_ecampus: v.id_ecampus,
      section, ue_num: v.ue_num, ue_nom: v.ue_nom,
      porte: v.porte, type: v.type, etat: etatDeduit(v),
      decision: v.decision, base_code: v.base_code,
      // La cible d'une partielle déjà décidée : sans elle, le tableau par
      // étudiant rouvrirait une dispense partielle vide, et l'enregistrer
      // effacerait ce que le Conseil avait désigné.
      cible: v.cible, cible_detail: v.cible_detail, motif_refus: v.motif_refus,
      /* LES DATES DE LA DEMANDE PARTENT AVEC LE DOSSIER. L'écran en a besoin
       * pour dire si la PREMIÈRE étape du circuit est franchie : sans elles, la
       * frise d'avancement montrait « demande à poser » sur des dossiers qui
       * la portaient depuis des semaines. */
      date_demande: v.date_demande, date_reception: v.date_reception,
      recevable: v.recevable, recevabilite_le: v.recevabilite_le,
      motif_irrecevabilite: v.motif_irrecevabilite,
      avis_le: v.avis_le, avis_sens: v.avis_sens, avis_texte: v.avis_texte, avis_par: v.avis_par,
      decision_le: v.decision_le, decision_ce_date: v.decision_ce_date,
      valide_le: v.valide_le, valide_par: v.valide_par,
      notifie_le: v.notifie_le, eprom_le: v.eprom_le,
      nb_preuves: v.nb_preuves, nb_equivalences: v.nb_equivalences,
      /* CE DOSSIER A-T-IL ÉTÉ DÉCIDÉ SANS AVOIR ÉTÉ INSTRUIT ? L'écran en a
       * besoin pour expliquer pourquoi il propose une régularisation plutôt
       * qu'un blocage. */
      hors_circuit: decideHorsCircuit(v),
      manques,
      pret_a_valider: !v.valide_le && !manques
        .filter(m => !m.startsWith('Le dossier n’a pas été validé')).length,
    });
  }

  res.json({
    annee,
    peut_instruire: gesteAutorise(req, 'valorisation.instruire') === 'oui',
    peut_valider: gesteAutorise(req, 'valorisation.valider') === 'oui',
    etats: ETATS,
    dossiers,
  });
});

/**
 * UNE SÉANCE NE MÊLE PAS DEUX CONSEILS — ET UNE SÉANCE, C'EST UNE SECTION ET
 * UNE DATE, PAS UNE UNITÉ.
 *
 * La règle disait « une séance par unité », et elle était fausse pour l'IIP.
 * Charles, le 21 septembre 2026 : « on reçoit parfois un dossier pour un
 * étudiant et plusieurs UE. On traite toutes les UE de tout le monde en même
 * temps. On sort le PV quand tout est fait. » Borner le lot à une unité
 * obligeait donc à découper en autant de lots une réunion unique — et rendait
 * impossible de décider, pour UN étudiant, toutes les unités de SON dossier.
 *
 * Ce qui reste vrai, et que la borne protège : un lot ne doit pas attribuer à
 * une réunion ce qu'une AUTRE a décidé. Une séance se reconnaît donc à sa
 * SECTION (le conseil des études d'une section) et à sa DATE. Chaque unité
 * garde son procès-verbal d'annexe 4, daté de cette séance.
 *
 * La section d'un dossier : celle de l'admission si c'en est une ; sinon celle
 * de l'unité — sauf une unité HORS CURSUS, qui se range dans la section de
 * l'étudiant (la leçon de l'UE 95 « Restart », 2.11.1).
 *
 * `dateCommune` : la date que le lot pose (décision). Sans elle (validation),
 * on lit la date déjà encodée sur chaque dossier.
 */
function sectionDeSeance(v) {
  if (v.ue_num === 0) return v.section || null;
  const u = db.prepare(`SELECT section, COALESCE(hors_cursus, 0) AS hors FROM ue
     WHERE ue_num = ? AND section IS NOT NULL
     ORDER BY (annee_scolaire = ?) DESC, annee_scolaire DESC LIMIT 1`)
    .get(v.ue_num, v.annee_scolaire);
  if (u && !u.hors) return u.section;
  return sectionRattachement(v.etudiant_id, v.annee_scolaire).section || u?.section || null;
}

function memeSeance(cibles, res, dateCommune = null) {
  const sections = [...new Set(cibles.map(sectionDeSeance).map(s => s || '(sans section)'))];
  if (sections.length > 1) {
    res.status(409).json({
      error: `Le lot mêle ${sections.length} sections (${sections.join(', ')}) : `
        + 'une séance du conseil des études se tient par section. '
        + "Rien n'a été enregistré — traitez une section à la fois.",
    });
    return true;
  }
  const dates = [...new Set(cibles.map(v => dateCommune || v.decision_ce_date)
    .filter(Boolean).map(d => String(d).slice(0, 10)))];
  if (dates.length > 1) {
    res.status(409).json({
      error: `Le lot mêle ${dates.length} dates de séance (${dates.join(', ')}) : `
        + 'ce sont deux réunions du Conseil, pas une. '
        + "Rien n'a été enregistré — traitez une séance à la fois.",
    });
    return true;
  }
  return false;
}

/**
 * ÉCRIRE UNE DÉCISION — UNE FOIS, POUR TOUS LES LOTS.
 *
 * Le lot « même décision pour tous » et le lot « une décision par dossier »
 * écrivent la même chose, avec les mêmes replis : deux requêtes UPDATE
 * recopiées finiraient par différer d'une colonne, et c'est celle qu'on
 * n'aurait pas regardée qui serait fausse. `b` porte ce que l'écran a envoyé
 * pour CE dossier.
 */
function ecrireDecision(v, b, nom) {
  const refus = b.decision === 'refusee';
  db.prepare(`UPDATE etudiant_valorisation
    SET type = ?, decision = ?, base_code = ?, motif_refus = ?,
        cible = ?, cible_detail = ?, pourcentage = ?,
        decision_ce_date = ?, commentaire = ?,
        decision_par = ?, decision_le = datetime('now')
    WHERE id = ?`).run(
      b.type, b.decision, refus ? null : String(b.base_code),
      refus ? String(b.motif_refus).trim() : null,
      !refus && b.type === 'partielle' ? (b.cible || v.cible) : null,
      !refus && b.type === 'partielle' ? (b.cible_detail ?? v.cible_detail) : null,
      pourcentageDe({ decision: b.decision, type: b.type }),
      b.decision_ce_date || v.decision_ce_date || null,
      b.commentaire ?? v.commentaire ?? null,
      nom, v.id);
  if (!refus && Array.isArray(b.equivalences)) ecrireEquivalences(v.id, b.equivalences);
}

/** Ce qui empêche de décider un dossier en lot — la même liste pour les deux lots. */
function bloqueDecisionEnLot(v) {
  // UN DOSSIER VALIDÉ NE SE CORRIGE PAS : il se dévalide d'abord, et cela
  // se motive. Sans quoi la validation ne garantirait rien.
  if (v.valide_le) return 'déjà validé — le dévalider d’abord';
  if (v.recevable !== 1) return 'recevabilité non contrôlée';
  if (!v.avis_le) return 'avis du chargé de cours manquant';
  return null;
}

/**
 * LA RECEVABILITÉ EN SÉRIE — ET ELLE, ELLE N'EST PAS BORNÉE À UNE UNITÉ.
 *
 * C'est un contrôle de FORME — délai, pièces officielles, dossier complet —,
 * posé par le secrétariat ou la coordination. Aucun conseil des études n'est
 * convoqué : le borner à une unité serait une contrainte sans raison derrière,
 * et ce sont celles-là qu'on finit par contourner. Quinze dossiers reçus le
 * même jour se pointent donc ensemble, quelles que soient leurs unités.
 *
 * L'IRRECEVABILITÉ, ELLE, SE MOTIVE — même en série, et c'est le même motif
 * pour tout le lot : si le motif diffère d'un dossier à l'autre, ce n'est plus
 * un lot, ce sont des dossiers.
 */
r.post('/valorisations/lot/recevabilite', authRequired,
  gesteRequis('valorisation.instruire'), (req, res) => {
    const ids = [...new Set((Array.isArray(req.body?.ids) ? req.body.ids : [])
      .map(Number).filter(n => Number.isInteger(n) && n > 0))];
    if (!ids.length) return res.status(400).json({ error: 'Aucun dossier coché.' });
    if (!valorisationsPermises(req, res, ids)) return;

    const recevable = req.body.recevable ? 1 : 0;
    const motif = String(req.body.motif_irrecevabilite || '').trim();
    if (!recevable && !motif) {
      return res.status(400).json({ error: "Une irrecevabilité se motive : c'est "
        + 'un refus de forme, et il est notifié à l’étudiant.' });
    }

    const bloquants = [];
    const cibles = [];
    for (const id of ids) {
      const v = lireDossierComplet(id);
      if (!v) { bloquants.push({ id, qui: `#${id}`, pourquoi: 'Dossier introuvable.' }); continue; }
      const qui = `${(v.nom || '').toUpperCase()} ${v.prenom || ''}`.trim();
      if (v.valide_le) {
        bloquants.push({ id, qui, pourquoi: `déjà validé le ${v.valide_le} — le dévalider d’abord` });
        continue;
      }
      if (v.decision_le && !decideHorsCircuit(v)) {
        bloquants.push({ id, qui, pourquoi: 'décision déjà enregistrée — la recevabilité ne se rejuge pas après coup' });
        continue;
      }
      cibles.push(v);
    }
    if (bloquants.length) {
      return res.status(409).json({
        error: `${bloquants.length} dossier(s) bloquent : rien n'a été enregistré.`,
        bloquants });
    }

    const qui = req.user?.nom || req.user?.email || null;
    const maj = db.prepare(`UPDATE etudiant_valorisation
      SET recevable = ?, motif_irrecevabilite = ?, recevabilite_par = ?,
          recevabilite_le = datetime('now') WHERE id = ?`);
    db.transaction(() => {
      for (const v of cibles) maj.run(recevable, recevable ? null : motif, qui, v.id);
    })();
    // UNE LIGNE DE JOURNAL PAR DOSSIER : un geste en série reste une suite de
    // gestes individuels, et c'est ainsi qu'il se relit un an après.
    for (const v of cibles) {
      journaliser(v.id, recevable ? 'recevable' : 'irrecevable', req,
        `en série (${cibles.length} dossiers)${recevable ? '' : ` · ${motif}`}`);
      rafraichirEtat(v.id);
      if (recevable) appelerCharges(v.id).catch(e => console.error('[avisVA]', e.message));
    }
    res.json({ ok: true, traites: cibles.length, recevable: !!recevable });
  });

/**
 * ÉTAPE 7 — LA NOTIFICATION ET LA MISE À JOUR DU PAE (2 jours ouvrables).
 * ÉTAPE 8 — L'ENCODAGE DANS eProm (5 jours ouvrables), POSITIF COMME NÉGATIF.
 * ÉTAPE 10 — L'ARCHIVAGE (4 ans).
 *
 * Trois gestes administratifs, trois traces. Celui d'eProm n'est pas une
 * commodité : « une décision non encodée est une décision non conforme »
 * (AGCF du 13.12.2024, art. 5 al. 3). Ce qui n'est pas pointé ici ressort dans
 * le tableau de ce qui reste à faire — c'est la seule façon qu'un retard se
 * voie avant la vérification.
 */
for (const [chemin, colonne, etape] of [
  ['notification', 'notifie_le', 'notifiee'],
  ['eprom', 'eprom_le', 'encodee'],
  ['archivage', 'archive_le', 'archivee'],
]) {
  r.put(`/valorisations/:vid/${chemin}`, authRequired, roleRequired('admin', 'editeur'),
    (req, res) => {
      const vid = Number(req.params.vid);
      const v = db.prepare('SELECT * FROM etudiant_valorisation WHERE id = ?').get(vid);
      if (!v) return res.status(404).json({ error: 'Dossier introuvable.' });
      if (!v.decision_le) {
        return res.status(409).json({ error: "La décision du Conseil n'est pas "
          + 'enregistrée : il n’y a rien à notifier, encoder ni archiver.' });
      }
      // ON NE NOTIFIE PAS CE QUE LA DIRECTION N'A PAS VALIDÉ (7 octobre 2026) :
      // la pièce remise à l'étudiant engage la signature.
      if (colonne === 'notifie_le' && !v.valide_le) {
        return res.status(409).json({ error: 'Ce dossier n’est pas encore validé par la direction : '
          + 'la décision ne se notifie qu’une fois validée.' });
      }
      const qui = req.user?.nom || req.user?.email || null;
      const sup = colonne === 'notifie_le' ? ', notifie_par = ?'
        : colonne === 'eprom_le' ? ', eprom_par = ?' : '';
      const args = sup ? [qui, vid] : [vid];
      db.prepare(`UPDATE etudiant_valorisation
        SET ${colonne} = datetime('now')${sup} WHERE id = ?`).run(...args);
      if (colonne === 'notifie_le' && req.body?.pae_maj) {
        db.prepare("UPDATE etudiant_valorisation SET pae_maj_le = datetime('now') WHERE id = ?")
          .run(vid);
      }
      journaliser(vid, etape, req, req.body?.detail || null);
      res.json({ ok: true, etat: rafraichirEtat(vid) });
    });
}

/**
 * CE QUI RESTE À FAIRE — LE TABLEAU QUI MANQUAIT.
 *
 * Un retard ne se voit pas dossier par dossier : il se voit en bloc. Avis en
 * attente, décisions non notifiées, décisions non encodées dans eProm, dossiers
 * dont la recevabilité n'a jamais été contrôlée, et demandes introduites hors
 * délai. Sans cet écran, la non-conformité se découvre à l'inspection.
 */
r.get('/valorisations/en-retard', authRequired, (req, res) => {
  const annee = req.query.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  const lignes = db.prepare(`
    SELECT v.*, e.nom, e.prenom,
           (SELECT COUNT(*) FROM etudiant_valorisation_fichier f
             WHERE f.valorisation_id = v.id) AS nb_preuves,
           (SELECT COUNT(*) FROM etudiant_valorisation_fichier f
             WHERE f.valorisation_id = v.id AND f.nature = 'TEST') AS nb_copies_test
    FROM etudiant_valorisation v
    JOIN etudiant e ON e.id = v.etudiant_id
    WHERE v.annee_scolaire = ?
    ORDER BY e.nom, e.prenom, v.ue_num
  `).all(annee);

  const paquets = {
    recevabilite: [], avis: [], decision: [], validation: [], notification: [], eprom: [],
    hors_delai: [], sans_preuve: [], sans_base: [], test_sans_copie: [],
  };
  for (const v of filtrerValorisationsParPerimetre(req, lignes)) {
    const etat = etatDeduit(v);
    const court = { id: v.id, etudiant_id: v.etudiant_id, nom: v.nom,
                    prenom: v.prenom, ue_num: v.ue_num, etat };
    if (v.recevable == null) paquets.recevabilite.push(court);
    else if (v.recevable === 1 && !v.avis_le) paquets.avis.push(court);
    else if (v.recevable === 1 && !v.decision_le) paquets.decision.push(court);   // l'irrecevable n'attend pas le Conseil
    if (v.decision_le && !v.valide_le) paquets.validation.push(court);
    if (v.valide_le && !v.notifie_le) paquets.notification.push(court);
    if (v.decision_le && !v.eprom_le) paquets.eprom.push(court);
    if (v.decision_le && v.decision !== 'refusee'
        && !CODES_BASE.includes(String(v.base_code || ''))) paquets.sans_base.push(court);
    if (!v.nb_preuves) paquets.sans_preuve.push(court);
    /* UN TEST PASSÉ DONT LA COPIE N'EST PAS AU DOSSIER.
     * On ne bloque pas — le test a bien eu lieu, la note est là. Mais la copie
     * se conserve quatre ans et se présente à l'inspection : si elle n'est pas
     * déposée le jour même, elle ne le sera jamais. C'est donc un rappel, et
     * il est en bloc plutôt que dossier par dossier. */
    if ((v.test_note_francais != null || v.test_note_maths != null)
        && !Number(v.nb_copies_test || 0)) paquets.test_sans_copie.push(court);
    const d = controleDelai({ ueNum: v.ue_num, annee: v.annee_scolaire,
                              date_demande: v.date_demande,
                              date_reception: v.date_reception });
    if (d.hors_delai) paquets.hors_delai.push({ ...court, echeance: d.echeance });
  }
  res.json({ annee, total: lignes.length, paquets });
});

r.get('/valorisations/ue/:ueNum/candidats', authRequired, (req, res) => {
  if (!unitePermise(req, res, req.params.ueNum)) return;
  const ueNum = Number(req.params.ueNum);
  const annee = req.query.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const unite = db.prepare(`
    SELECT ue_num, ue_nom, section, ue_niv FROM ue
    WHERE ue_num = ? AND annee_scolaire = ? LIMIT 1`).get(ueNum, annee)
    || db.prepare('SELECT ue_num, ue_nom, section, ue_niv FROM ue WHERE ue_num = ? LIMIT 1')
         .get(ueNum);
  if (!unite) {
    return res.status(404).json({ error: `L'unité ${ueNum} n'existe pas dans le référentiel.` });
  }

  // Ceux qui ont l'unité au programme cette année.
  const inscrits = db.prepare(`
    SELECT e.id, e.nom, e.prenom, e.id_ecampus, e.section_rattachement,
           i.resultat
    FROM etudiant_inscription i
    JOIN etudiant e ON e.id = i.etudiant_id
    WHERE i.ue_num = ? AND i.annee_scolaire = ?
  `).all(ueNum, annee);

  // Ceux qui portent déjà une décision sur cette unité — ils peuvent ne pas
  // être inscrits (une valorisation précède souvent l'inscription).
  const deja = db.prepare(`
    SELECT v.id AS valorisation_id, v.etudiant_id, v.type, v.decision,
           e.nom, e.prenom, e.id_ecampus, e.section_rattachement
    FROM etudiant_valorisation v
    JOIN etudiant e ON e.id = v.etudiant_id
    WHERE v.ue_num = ? AND v.annee_scolaire = ?
  `).all(ueNum, annee);

  const par = new Map();
  for (const i of inscrits) {
    par.set(i.id, {
      id: i.id, nom: i.nom, prenom: i.prenom, id_ecampus: i.id_ecampus,
      section: i.section_rattachement, au_programme: true,
      resultat: i.resultat || null, valorisation: null,
    });
  }
  /* UN ÉTUDIANT SANS INSCRIPTION EXISTE AUSSI (leçon du 21 septembre) : une
   * valorisation précède souvent l'inscription. Les rattachés aux sections
   * de l'unité sont donc candidats, même sans PAE composé. */
  // Rattachement posé OU DÉDUIT — même règle que la liste et la matrice.
  const normSecC = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, '');
  const secsUE = new Set(sectionsDeUE(ueNum).map(normSecC));
  const rattachesUE = [];
  if (secsUE.size) {
    for (const e of db.prepare(
      'SELECT id, nom, prenom, id_ecampus FROM etudiant WHERE actif = 1').all()) {
      const rat = sectionRattachement(e.id, annee);
      if (rat.section && secsUE.has(normSecC(rat.section))) {
        rattachesUE.push({ ...e, section_rattachement: rat.section });
      }
    }
  }
  for (const e of rattachesUE) {
    if (!par.has(e.id)) {
      par.set(e.id, {
        id: e.id, nom: e.nom, prenom: e.prenom, id_ecampus: e.id_ecampus,
        section: e.section_rattachement, au_programme: false,
        resultat: null, valorisation: null,
      });
    }
  }
  for (const d of deja) {
    if (!par.has(d.etudiant_id)) {
      par.set(d.etudiant_id, {
        id: d.etudiant_id, nom: d.nom, prenom: d.prenom, id_ecampus: d.id_ecampus,
        section: d.section_rattachement, au_programme: false,
        resultat: null, valorisation: null,
      });
    }
    par.get(d.etudiant_id).valorisation = {
      id: d.valorisation_id, type: d.type, decision: d.decision };
  }

  const etudiants = [...par.values()].sort((a, b) =>
    (a.nom || '').localeCompare(b.nom || '')
    || (a.prenom || '').localeCompare(b.prenom || ''));
  res.json({ unite, annee, etudiants });
});

/**
 * UNE MÊME DÉCISION POUR PLUSIEURS ÉTUDIANTS, EN UNE FOIS.
 *
 * Le conseil des études d'une unité examine les demandes en série : même
 * unité, même séance, même dispense, et souvent le même constat d'équivalence
 * — huit dossiers de reprise d'études qui portent le même diplôme antérieur.
 * Lucie obligeait à créer huit valorisations « partielles et vides », puis à
 * ouvrir huit lignes et à y refaire huit fois la même saisie. On écrivait donc
 * huit fois ce que le Conseil a décidé une fois, avec huit occasions de se
 * tromper d'une case.
 *
 * LE LOT EST TOUT OU RIEN. Une écriture partielle serait pire que le refus :
 * on ne saurait pas lesquels sont passés, on recommencerait, et les premiers
 * se retrouveraient en double — deux décisions contraires sur une même unité
 * bloquent l'impression du procès-verbal, et personne ne saurait pourquoi.
 *
 * UN DOUBLON ARRÊTE LE LOT. Un étudiant qui porte déjà une décision sur cette
 * unité et cette année a été examiné : l'écraser ferait disparaître une
 * décision du Conseil sans trace, et l'ignorer laisserait croire qu'il a reçu
 * celle du lot. On rend la liste, on n'écrit rien, et le secrétariat décoche
 * ou corrige à la main — c'est une décision, pas une collision de données.
 */
r.post('/valorisations/lot', authRequired, gesteRequis('valorisation.instruire'), (req, res) => {
  const { etudiant_ids, annee_scolaire, ue_num, type, cible, cible_detail,
          pourcentage, decision_ce_date, commentaire } = req.body;

  const ids = [...new Set((Array.isArray(etudiant_ids) ? etudiant_ids : [])
    .map(Number).filter(n => Number.isInteger(n) && n > 0))];
  if (!ids.length) return res.status(400).json({ error: 'Aucun étudiant coché.' });

  // LA MÊME RÈGLE QU'À L'UNITÉ. Un lot qui validerait moins qu'une saisie
  // individuelle serait la porte dérobée qu'on a déjà refusée pour le PUT.
  const souci = verifierValorisation(req.body);
  if (souci) return res.status(400).json({ error: souci });
  const decision = req.body.decision === 'refusee' ? 'refusee' : 'accordee';

  const connue = db.prepare(
    'SELECT 1 FROM ue WHERE ue_num = ? LIMIT 1').get(Number(ue_num));
  if (!connue) {
    return res.status(400).json({
      error: `L'unité ${ue_num} n'existe pas dans le référentiel.` });
  }
  if (!unitePermise(req, res, Number(ue_num))) return;

  const marques = `(${ids.map(() => '?').join(',')})`;
  const inconnus = ids.filter(id =>
    !db.prepare('SELECT 1 FROM etudiant WHERE id = ? LIMIT 1').get(id));
  if (inconnus.length) {
    return res.status(400).json({
      error: `Étudiant${inconnus.length > 1 ? 's' : ''} introuvable${inconnus.length > 1 ? 's' : ''} : ${inconnus.join(', ')}.` });
  }

  const doublons = db.prepare(`
    SELECT v.etudiant_id, v.id AS valorisation_id, v.type, v.decision,
           e.nom, e.prenom
    FROM etudiant_valorisation v
    JOIN etudiant e ON e.id = v.etudiant_id
    WHERE v.ue_num = ? AND v.annee_scolaire = ?
      AND v.etudiant_id IN ${marques}
    ORDER BY e.nom, e.prenom
  `).all(Number(ue_num), annee_scolaire, ...ids);
  if (doublons.length) {
    return res.status(409).json({
      error: doublons.length > 1
        ? `${doublons.length} étudiants portent déjà une décision sur l'unité ${ue_num} en ${annee_scolaire}. Rien n'a été enregistré.`
        : `${(doublons[0].nom || '').toUpperCase()} ${doublons[0].prenom} porte déjà une décision sur l'unité ${ue_num} en ${annee_scolaire}. Rien n'a été enregistré.`,
      doublons,
    });
  }

  const refus = decision === 'refusee';
  const equivalences = !refus && Array.isArray(req.body.equivalences)
    ? req.body.equivalences : [];

  const inserer = db.prepare(`
    INSERT INTO etudiant_valorisation
      (etudiant_id, annee_scolaire, ue_num, type, cible, cible_detail,
       pourcentage, decision_ce_date, commentaire, decision, motif_refus)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `);
  const ecrire = db.transaction(() => {
    const crees = [];
    for (const id of ids) {
      const info = inserer.run(
        id, annee_scolaire, Number(ue_num), type,
        !refus && type === 'partielle' ? cible : null,
        !refus && type === 'partielle' ? (cible_detail || null) : null,
        // LES 50 % NE SE SAISISSENT PAS (RDE art. 29 §3 et 30) : voir
        // `pourcentageDe`. Un chiffre modifiable finit par être modifié, et il
        // part sur une attestation signée.
        pourcentageDe({ decision, type }),
        decision_ce_date || null, commentaire || null,
        decision, refus ? String(req.body.motif_refus).trim() : null);
      if (equivalences.length) ecrireEquivalences(info.lastInsertRowid, equivalences);
      crees.push({ etudiant_id: id, valorisation_id: info.lastInsertRowid });
    }
    return crees;
  });

  let crees;
  try { crees = ecrire(); }
  catch (e) { return res.status(500).json({ error: e.message }); }
  res.json({ ok: true, crees: crees.length, valorisations: crees });
});

r.post('/:id/valorisations', authRequired, gesteRequis('valorisation.instruire'), (req, res) => {
  if (!etudiantPermis(req, res, req.params.id)) return;
  const { annee_scolaire, ue_num, type, cible, cible_detail, pourcentage,
          decision_ce_date, commentaire } = req.body;
  const souci = verifierValorisation(req.body);
  if (souci) return res.status(400).json({ error: souci });
  const decision = req.body.decision === 'refusee' ? 'refusee' : 'accordee';
  // L'UNITÉ DOIT EXISTER CHEZ NOUS. Le numéro se tapait à la main : une unité
  // inconnue s'enregistrait sans un mot, et ne se découvrait qu'au moment
  // d'imprimer une pièce qui ne pouvait plus être juste.
  const connue = db.prepare(
    'SELECT 1 FROM ue WHERE ue_num = ? LIMIT 1').get(Number(ue_num));
  if (!connue) {
    return res.status(400).json({
      error: `L'unité ${ue_num} n'existe pas dans le référentiel.` });
  }
  if (!unitePermise(req, res, Number(ue_num))) return;

  // UN REFUS NE PORTE NI DISPENSE NI POURCENTAGE. Le procès-verbal lit
  // l'absence de pourcentage comme un refus : lui en laisser un le ferait
  // basculer en « Réussite » sur la pièce officielle.
  const refus = decision === 'refusee';
  const info = db.prepare(`
    INSERT INTO etudiant_valorisation
      (etudiant_id, annee_scolaire, ue_num, type, cible, cible_detail,
       pourcentage, decision_ce_date, commentaire, decision, motif_refus)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(Number(req.params.id), annee_scolaire, Number(ue_num), type,
         !refus && type === 'partielle' ? cible : null,
         !refus && type === 'partielle' ? (cible_detail || null) : null,
         // LES 50 % NE SE SAISISSENT PAS (RDE art. 29 §3 et 30).
         pourcentageDe({ decision, type }),
         decision_ce_date || null, commentaire || null,
         decision, refus ? String(req.body.motif_refus).trim() : null);

  // Les acquis reconnus équivalents, avec leur motivation. Une case cochée
  // sans texte reprend la phrase proposée : l'annexe ne part jamais avec un
  // blanc, mais le texte reste celui du Conseil dès qu'il l'a écrit.
  if (!refus && Array.isArray(req.body.equivalences)) {
    ecrireEquivalences(info.lastInsertRowid, req.body.equivalences);
  }
  res.json({ ok: true, id: info.lastInsertRowid });
});

/** Les acquis reconnus équivalents d'une valorisation — on remplace le lot. */
function ecrireEquivalences(vid, liste) {
  db.prepare('DELETE FROM etudiant_valorisation_aa WHERE valorisation_id = ?').run(vid);
  const ins = db.prepare(`INSERT OR REPLACE INTO etudiant_valorisation_aa
    (valorisation_id, aa_code, texte) VALUES (?,?,?)`);
  for (const e of liste) {
    if (!e?.aa_code) continue;
    ins.run(vid, String(e.aa_code), (e.texte || '').trim() || TEXTE_EQUIVALENCE);
  }
}

/**
 * CORRIGER UNE VALORISATION DÉJÀ ENCODÉE.
 *
 * Elle ne se corrigeait pas : une faute de frappe sur le pourcentage, un
 * acquis coché de trop, et la seule issue était de supprimer — ce qui emporte
 * les preuves déposées avec elle. On rouvrait donc le dossier, on redéposait
 * les pièces, et personne ne le faisait : la faute restait.
 *
 * Les preuves survivent : c'est la décision qu'on corrige, pas le dossier qui
 * la fonde.
 */
r.put('/valorisations/:vid', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const vid = Number(req.params.vid);
  const avant = db.prepare('SELECT * FROM etudiant_valorisation WHERE id = ?').get(vid);
  if (!avant) return res.status(404).json({ error: 'Valorisation introuvable.' });
  if (!valorisationPermise(req, res, vid)) return;
  // L'ANCIENNE PORTE NE CONTOURNE PLUS LE GEL : un dossier validé ne se
  // corrige qu'après réouverture par la direction.
  if (refuseSiValide(avant, res)) return;

  const b = { ...req.body,
    annee_scolaire: req.body.annee_scolaire || avant.annee_scolaire,
    ue_num: req.body.ue_num || avant.ue_num };
  const souci = verifierValorisation(b);
  if (souci) return res.status(400).json({ error: souci });

  const connue = db.prepare('SELECT 1 FROM ue WHERE ue_num = ? LIMIT 1').get(Number(b.ue_num));
  if (!connue) {
    return res.status(400).json({ error: `L'unité ${b.ue_num} n'existe pas dans le référentiel.` });
  }

  const decision = b.decision === 'refusee' ? 'refusee' : 'accordee';
  const refus = decision === 'refusee';
  db.transaction(() => {
    db.prepare(`UPDATE etudiant_valorisation SET
        annee_scolaire = ?, ue_num = ?, type = ?, cible = ?, cible_detail = ?,
        pourcentage = ?, decision_ce_date = ?, commentaire = ?,
        decision = ?, motif_refus = ?
      WHERE id = ?`).run(
      b.annee_scolaire, Number(b.ue_num), b.type,
      !refus && b.type === 'partielle' ? b.cible : null,
      !refus && b.type === 'partielle' ? (b.cible_detail || null) : null,
      // LES 50 % NE SE SAISISSENT PAS (RDE art. 29 §3 et 30).
      pourcentageDe({ decision, type: b.type }),
      b.decision_ce_date || null, b.commentaire || null,
      decision, refus ? String(b.motif_refus).trim() : null, vid);

    if (refus) {
      db.prepare('DELETE FROM etudiant_valorisation_aa WHERE valorisation_id = ?').run(vid);
    } else if (Array.isArray(b.equivalences)) {
      ecrireEquivalences(vid, b.equivalences);
    }
  })();
  res.json({ ok: true, id: vid });
});

/**
 * LA PHRASE PROPOSÉE POUR UNE ÉQUIVALENCE.
 *
 * Elle vit ici, côté serveur, et non dans l'écran : c'est elle qui part sur la
 * pièce quand personne n'a rien écrit, et deux libellés — un affiché, un
 * enregistré — finiraient par diverger sans que personne ne s'en aperçoive.
 */
export const TEXTE_EQUIVALENCE = "Les acquis d'apprentissage de cette unité "
  + "sont équivalents aux acquis vus dans le cadre du cours démontré ou dans "
  + 'un dossier pédagogique.';

/**
 * RETIRER TOUTE LA LIGNE D'UN ÉTUDIANT POUR UNE ANNÉE.
 *
 * On se trompe d'étudiant : un homonyme, une ligne cochée trop vite dans la
 * matrice. Il fallait alors ouvrir la ligne, déplier, et supprimer les unités
 * une à une — donc on ne le faisait pas, et le registre gardait des étudiants
 * qui n'ont jamais rien demandé. Une erreur qu'on ne peut pas défaire d'un
 * geste est une erreur qui reste.
 *
 * TOUT OU RIEN, et pour la même raison qu'ailleurs : si l'un des dossiers a
 * été tranché par le Conseil, la ligne n'est plus une erreur de saisie. On
 * refuse alors l'ENSEMBLE en nommant ce qui bloque, plutôt que d'effacer les
 * deux dossiers vierges et de laisser le troisième seul — ce qui donnerait un
 * registre à moitié corrigé dont personne ne comprendrait l'état.
 */
r.delete('/valorisations/etudiant/:id', authRequired, gesteRequis('valorisation.instruire'),
  (req, res) => {
    const eid = Number(req.params.id);
    if (!etudiantPermis(req, res, eid)) return;
    const annee = req.query.annee;
    if (!annee) return res.status(400).json({ error: 'annee requise' });

    const lignes = db.prepare(`SELECT * FROM etudiant_valorisation
      WHERE etudiant_id = ? AND annee_scolaire = ?`).all(eid, annee);
    if (!lignes.length) return res.json({ ok: true, supprimes: 0 });

    // Une validation se retire d'abord : c'est un acte à part, et il se motive.
    const validees = lignes.filter(v => v.valide_le)
      .map(v => `UE ${v.ue_num} : validée le ${v.valide_le}`);
    if (validees.length) {
      return res.status(409).json({
        error: 'Cette ligne porte des dossiers VALIDÉS : la direction doit d’abord '
          + 'retirer la validation, dossier par dossier.', bloquants: validees });
    }

    /* DES DÉCISIONS PRISES : DIRECTION SEULE, ET AVEC UN MOTIF.
     * Même régime qu'à l'unité — on ne refuse pas de réparer, on demande qui
     * répare et pourquoi. */
    const decidees = lignes.filter(v => v.decision_le)
      .map(v => `UE ${v.ue_num} : décidée le ${v.decision_le}`);
    if (decidees.length) {
      if (gesteAutorise(req, 'valorisation.devalider') !== 'oui') {
        return res.status(409).json({
          error: 'Cette ligne porte des décisions du Conseil : seule la direction '
            + 'peut la supprimer, et elle motive sa décision.',
          bloquants: decidees, motif_requis: true, reserve_direction: true });
      }
      const motif = String(req.body?.motif || req.query?.motif || '').trim();
      if (!motif) {
        return res.status(409).json({
          error: 'Cette ligne porte des décisions du Conseil : sa suppression se '
            + 'motive — les journaux partent avec elle.',
          bloquants: decidees, motif_requis: true });
      }
      console.warn(`[valorisation] suppression d'une ligne décidée — étudiant ${eid}, `
        + `${annee}, ${decidees.length} décision(s), par `
        + `${req.user?.nom || req.user?.email || '?'} (${req.user?.role}) : ${motif}`);
    }

    let n = 0;
    db.transaction(() => {
      for (const v of lignes) {
        for (const f of db.prepare(
          'SELECT chemin FROM etudiant_valorisation_fichier WHERE valorisation_id = ?')
          .all(v.id)) {
          try { unlinkSync(f.chemin); } catch { /* déjà parti */ }
        }
        db.prepare('DELETE FROM etudiant_valorisation_fichier WHERE valorisation_id = ?').run(v.id);
        db.prepare('DELETE FROM etudiant_valorisation WHERE id = ?').run(v.id);
        n += 1;
      }
    })();
    res.json({ ok: true, supprimes: n });
  });

/**
 * RETIRER UN DOSSIER — PARCE QU'ON SE TROMPE EN L'OUVRANT.
 *
 * Une case cochée de travers dans la matrice, un étudiant introduit à la place
 * d'un homonyme : l'erreur d'INTRODUCTION est fréquente, et il faut pouvoir la
 * défaire. Elle l'était réservée à l'administrateur, si bien que la
 * coordination qui venait de se tromper devait demander à quelqu'un d'autre —
 * donc elle laissait la ligne en place, et le registre se remplissait de
 * dossiers fantômes.
 *
 * MAIS UNE DÉCISION PRISE NE DISPARAÎT PAS. Dès qu'un Conseil a tranché, ou
 * qu'une validation a été posée, la ligne n'est plus une erreur de saisie :
 * c'est un acte, et un acte se corrige ou se refuse, il ne s'efface pas. Sinon
 * il suffirait de supprimer pour faire disparaître une décision gênante — et
 * le journal partirait avec, puisqu'il pend à la ligne.
 */
r.delete('/valorisations/:vid', authRequired, gesteRequis('valorisation.instruire'), (req, res) => {
  const vid = Number(req.params.vid);
  const v = db.prepare('SELECT * FROM etudiant_valorisation WHERE id = ?').get(vid);
  if (!v) return res.status(404).json({ error: 'Dossier introuvable.' });
  if (!valorisationPermise(req, res, vid)) return;
  if (v.valide_le) {
    /* L'ÉCRAN NE DOIT PAS DEVINER LE CAS EN LISANT LA PHRASE. Il cherchait
     * « validé le » dans le message pour savoir s'il devait proposer le
     * retrait de validation : un test sur du français, qui tombe à la première
     * reformulation — la même famille de faute que `label` pour `libelle`. Le
     * serveur nomme le cas ; l'écran le lit. */
    return res.status(409).json({
      error: `Ce dossier a été validé le ${v.valide_le}`
        + `${v.valide_par ? ` par ${v.valide_par}` : ''} : il ne se supprime pas. `
        + 'La direction peut retirer la validation, puis le Conseil corrigera sa décision.',
      valide_le: v.valide_le, valide_par: v.valide_par || null,
      devalidation_possible: true });
  }
  /* UNE DÉCISION PRISE NE S'EFFACE PAS D'UN CLIC — MAIS ELLE DOIT POUVOIR
   * S'EFFACER.
   *
   * Premier essai : refus pur et simple dès qu'un Conseil avait tranché. C'est
   * intenable — un dossier d'essai, une erreur d'unité découverte après coup,
   * et la ligne restait pour toujours, sans que personne puisse rien y faire.
   * Une règle qui empêche de réparer se contourne autrement, et c'est pire.
   *
   * La suppression reste donc possible, mais elle change de main et de forme :
   * la DIRECTION seule, et avec un MOTIF ÉCRIT. C'est le même régime que le
   * retrait d'une validation et que la réouverture d'une séance close. La
   * coordination, elle, ne défait pas ce que le Conseil a posé. */
  if (v.decision_le) {
    if (gesteAutorise(req, 'valorisation.devalider') !== 'oui') {
      return res.status(409).json({
        error: `Le Conseil des études a tranché ce dossier le ${v.decision_le} : `
          + 'seule la direction peut le supprimer, et elle motive sa décision.',
        motif_requis: true, reserve_direction: true });
    }
    const motif = String(req.body?.motif || req.query?.motif || '').trim();
    if (!motif) {
      return res.status(409).json({
        error: `Ce dossier porte une décision du ${v.decision_le} : sa suppression `
          + 'se motive — le journal part avec lui.', motif_requis: true });
    }
    // LA TRACE PART AVEC LA LIGNE, ALORS ON L'ÉCRIT AILLEURS AVANT. Le journal
    // du dossier disparaît par la clé étrangère ; le journal du serveur, lui,
    // garde qui a supprimé quoi et pourquoi.
    console.warn(`[valorisation] suppression d'un dossier décidé — `
      + `id ${vid}, étudiant ${v.etudiant_id}, UE ${v.ue_num}, `
      + `par ${req.user?.nom || req.user?.email || '?'} (${req.user?.role}) : ${motif}`);
  }
  // Les pièces partent avec la décision qu'elles fondaient. La ligne de la
  // base s'en va par la clé étrangère ; le fichier sur le disque, lui, ne
  // s'efface pas tout seul et resterait là sans que rien ne le nomme.
  for (const f of db.prepare(
    'SELECT chemin FROM etudiant_valorisation_fichier WHERE valorisation_id = ?').all(vid)) {
    try { unlinkSync(f.chemin); } catch { /* déjà parti */ }
  }
  db.prepare('DELETE FROM etudiant_valorisation_fichier WHERE valorisation_id = ?').run(vid);
  db.prepare('DELETE FROM etudiant_valorisation WHERE id = ?').run(vid);
  res.json({ ok: true });
});

/* QUI REND L'AVIS SE LIT DES ATTRIBUTIONS (Charles, 2 octobre 2026 : « ce
 * doit être automatique en fonction des attributions »). Les chargés de cours
 * de l'UE pour l'année — à défaut, la dernière année attribuée —, ceux des
 * cours visés d'abord, puis par volume de périodes : le premier est proposé
 * d'office, la liste du personnel reste ouverte derrière. */
r.get('/ue/:ueNum/charges', authRequired, (req, res) => {
  const ueNum = Number(req.params.ueNum);
  const annee = req.query.annee || anneeDeTravail(req);
  const vises = new Set(String(req.query.cours || '').split(',').map(x => x.trim()).filter(Boolean));
  let an = annee;
  const compte = a => db.prepare(`SELECT COUNT(*) n FROM attribution WHERE ue_num = ? AND annee_scolaire = ? AND professeur_id IS NOT NULL`).get(ueNum, a).n;
  if (!compte(an)) an = db.prepare(`SELECT MAX(annee_scolaire) a FROM attribution WHERE ue_num = ? AND annee_scolaire <= ? AND professeur_id IS NOT NULL`).get(ueNum, annee)?.a || annee;
  const lignes = db.prepare(`SELECT p.id, p.nom, p.prenom, a.code_cours, COALESCE(a.periodes_attribuees, 0) per
      FROM attribution a JOIN professeur p ON p.id = a.professeur_id
     WHERE a.ue_num = ? AND a.annee_scolaire = ?`).all(ueNum, an);
  const m = new Map();
  for (const l of lignes) {
    if (!m.has(l.id)) m.set(l.id, { professeur_id: l.id, nom: `${(l.nom || '').toUpperCase()} ${l.prenom || ''}`.trim(), cours: new Set(), periodes: 0, vise: false });
    const x = m.get(l.id);
    if (l.code_cours) x.cours.add(l.code_cours);
    x.periodes += Number(l.per) || 0;
    if (vises.has(l.code_cours)) x.vise = true;
  }
  const charges = [...m.values()].map(x => ({ ...x, cours: [...x.cours].sort() }))
    .sort((a, b) => (b.vise - a.vise) || (b.periodes - a.periodes) || a.nom.localeCompare(b.nom, 'fr'));
  res.json({ annee: an, charges });
});

// Cibles disponibles pour une dispense partielle : les cours et AA d'une UE
r.get('/ue/:ueNum/composantes', authRequired, (req, res) => {
  const ueNum = Number(req.params.ueNum);
  const annee = req.query.annee;
  const cours = db.prepare(`
    SELECT cours_code, MAX(cours_nom) AS cours_nom, MAX(COALESCE(cours_per, 0)) AS per,
           MAX(COALESCE(is_stage, 0)) AS stage FROM cours
    WHERE ue_num = ? ${annee ? 'AND annee_scolaire = ?' : ''}
    GROUP BY cours_code ORDER BY cours_code
  `).all(...(annee ? [ueNum, annee] : [ueNum]));
  /* LES HEURES DE STAGE DE L'ÉTUDIANT, PAS LES PÉRIODES DU PROFESSEUR (Charles,
     9 octobre 2026). Le cours de stage porte les périodes d'ENCADREMENT (20) ;
     l'étudiant, lui, passe en stage ce que l'unité lui demande, moins ses
     autres cours et son autonomie. Le total étudiant de l'unité est le plus
     haut connu, toutes années confondues : un réimport de 2026-2027 l'avait
     ramené aux périodes du professeur. */
  const perEtud = db.prepare('SELECT MAX(COALESCE(ue_per_etudiants, 0)) AS n, MAX(COALESCE(ue_aut, 0)) AS aut FROM ue WHERE ue_num = ?').get(ueNum) || {};
  const autres = cours.filter(c => !c.stage).reduce((t, c) => t + (Number(c.per) || 0), 0);
  const nbStages = cours.filter(c => c.stage).length || 1;
  for (const c of cours) {
    if (!c.stage) continue;
    const h = Math.round((Number(perEtud.n) - autres - Number(perEtud.aut || 0)) / nbStages);
    c.heures_etudiant = h > Number(c.per || 0) ? h : null;
  }
  const aas = db.prepare(`
    SELECT aa_code, aa_num, cours_code, description FROM aa
    WHERE ue_num = ? ORDER BY aa_num
  `).all(ueNum);
  // LA PHRASE PROPOSÉE VIENT D'ICI, PAS DE L'ÉCRAN. C'est elle qui part sur la
  // pièce quand le Conseil n'a rien écrit : deux libellés, un affiché et un
  // enregistré, finiraient par diverger sans que personne ne s'en aperçoive.
  res.json({ cours, aas, texte_equivalence: TEXTE_EQUIVALENCE });
});

// ── Dossier individuel : les 5 pièces réglementaires ─────────────────────────
r.get('/:id/pieces', authRequired, (req, res) => {
  const etudId = Number(req.params.id);
  const existantes = db.prepare(
    'SELECT type_piece, statut, commentaire, maj_le FROM etudiant_piece WHERE etudiant_id = ?'
  ).all(etudId);
  const map = Object.fromEntries(existantes.map(p => [p.type_piece, p]));
  res.json(PIECES_APPRENANT.map(p => ({
    ...p,
    statut: map[p.type]?.statut || 'manquant',
    commentaire: map[p.type]?.commentaire || null,
    maj_le: map[p.type]?.maj_le || null,
  })));
});

r.put('/:id/pieces/:type', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { statut, commentaire } = req.body;
  if (!['manquant', 'recu', 'na'].includes(statut)) {
    return res.status(400).json({ error: 'statut invalide (manquant|recu|na)' });
  }
  if (!PIECES_APPRENANT.some(p => p.type === req.params.type)) {
    return res.status(400).json({ error: 'type de pièce inconnu' });
  }
  db.prepare(`
    INSERT INTO etudiant_piece (etudiant_id, type_piece, statut, commentaire, maj_le)
    VALUES (?,?,?,?, datetime('now'))
    ON CONFLICT(etudiant_id, type_piece) DO UPDATE SET
      statut = excluded.statut, commentaire = excluded.commentaire, maj_le = datetime('now')
  `).run(Number(req.params.id), req.params.type, statut, commentaire || null);
  res.json({ ok: true });
});

// ── Fiche d'inscription / reçu (HTML imprimable, contenu circulaire 9764) ────
// Structure : acquis antérieurs EN HAUT (réussites + VA), puis les UE de
// l'inscription de l'année avec mentions réglementaires et sous réserve.
r.get('/:id/fiche-inscription', authRequired, (req, res) => {
  const etudId = Number(req.params.id);
  const annee = req.query.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const e = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(etudId);
  if (!e) return res.status(404).json({ error: 'étudiant introuvable' });

  const etab = (() => {
    try {
      return db.prepare("SELECT valeur FROM lucie_config WHERE cle = 'etablissement_nom'").get()?.valeur
        || 'Institut Ilya Prigogine';
    } catch { return 'Institut Ilya Prigogine'; }
  })();

  // 1. Acquis antérieurs : réussites encodées + VA complètes
  const reussites = db.prepare(`
    SELECT i.annee_scolaire, i.ue_num, i.points, u.ue_nom, 'reussi' AS kind
    FROM etudiant_inscription i
    LEFT JOIN ${UE_REF} u ON u.ue_num = i.ue_num
    WHERE i.etudiant_id = ? AND i.annee_scolaire < ? AND i.resultat = 'reussi'
  `).all(etudId, annee);
  const vasAcq = db.prepare(`
    SELECT v.annee_scolaire, v.ue_num, v.pourcentage AS points, u.ue_nom, 'va' AS kind
    FROM etudiant_valorisation v
    LEFT JOIN ${UE_REF} u ON u.ue_num = v.ue_num
    WHERE v.etudiant_id = ? AND v.type = 'complete' AND ${vaRetenue('v.')}
  `).all(etudId);
  const acquisRows = [...reussites, ...vasAcq].sort((a, b) =>
    String(a.annee_scolaire || '').localeCompare(String(b.annee_scolaire || '')) || a.ue_num - b.ue_num);
  const acquisSet = new Set(acquisRows.map(a => a.ue_num));

  // Historique complet exigé : ajournés / absents antérieurs
  const autres = db.prepare(`
    SELECT i.annee_scolaire, i.ue_num, i.resultat, u.ue_nom
    FROM etudiant_inscription i
    LEFT JOIN ${UE_REF} u ON u.ue_num = i.ue_num
    WHERE i.etudiant_id = ? AND i.annee_scolaire < ? AND i.resultat IN ('ajourne','absent')
    ORDER BY i.annee_scolaire, i.ue_num
  `).all(etudId, annee);

  // 2. UE de l'inscription de l'année
  const inscriptions = db.prepare(`
    -- Les ECTS viennent du RÉFÉRENTIEL : etudiant_inscription n'en porte pas.
    -- La colonne figurait sur la fiche sans être alimentée, faute d'être
    -- sélectionnée ici.
    SELECT i.*, u.ue_nom, u.section, u.ects AS ects
    FROM etudiant_inscription i
    LEFT JOIN ${UE_REF} u ON u.ue_num = i.ue_num
    WHERE i.etudiant_id = ? AND i.annee_scolaire = ?
    ORDER BY u.section, i.ue_num
  `).all(etudId, annee)
    // La section DU DOSSIER (lib/sectionDossier.js) : un orthoptiste au tronc
    // commun est inscrit en Orthoptie, même si l'UE est déclarée en Optométrie.
    .map(i => ({ ...i, section: sectionDeLInscription(etudId, i.ue_num, annee) || i.section }));

  // Sous réserve : prérequis non acquis mais inscrits la même année
  const prereqs = db.prepare('SELECT ue_num, prerequis_num FROM ue_prerequis').all();
  const prereqDe = {};
  for (const p of prereqs) (prereqDe[p.ue_num] = prereqDe[p.ue_num] || []).push(p.prerequis_num);
  const inscritesAnnee = new Set(inscriptions.map(i => i.ue_num));

  // Niveau effectif : celui défini pour la section, comme dans le schéma de
  // capitalisation — non la valeur brute du référentiel.
  const sectionsEtud = [...new Set(inscriptions.map(i => i.section).filter(Boolean))];
  const nivDe2 = sectionsEtud.length ? niveauxEffectifs(sectionsEtud, annee) : {};
  const anneeRefNiv2 = anneeDeTravail(req) || annee;
  for (const n of db.prepare('SELECT DISTINCT ue_num, ue_niv FROM ue WHERE annee_scolaire = ?').all(anneeRefNiv2)) {
    if (!nivDe2[n.ue_num]) nivDe2[n.ue_num] = (n.ue_niv || '').toUpperCase();
  }

  // Chaîne COMPLÈTE des prérequis manquants d'une UE — l'exigence est
  // transitive : la 256 exige la 255, laquelle exige la 254.
  const chaineDe = ueNum => {
    const m = new Set(), vus = new Set(), pile = [ueNum];
    while (pile.length) {
      const n = pile.pop();
      if (vus.has(n)) continue;
      vus.add(n);
      for (const p of (prereqDe[n] || [])) {
        if (acquisSet.has(p)) continue;
        m.add(p); pile.push(p);
      }
    }
    return [...m].sort((a, b) => a - b);
  };

  // Le « sous réserve » ne vaut qu'entre UE de MÊME NIVEAU inscrites la même
  // année — l'épreuve intégrée et ses déterminantes. Un prérequis d'une année
  // antérieure non acquis rend l'inscription impossible, non conditionnelle.
  // Carte des UE de la section : déterminantes et épreuve intégrée
  const carteFiche = sectionsEtud.length
    ? db.prepare(`
        SELECT DISTINCT ue_num, MAX(COALESCE(is_epreuve_integree, 0)) AS epreuve
        FROM ue WHERE section IN (${sectionsEtud.map(() => '?').join(',')})
        GROUP BY ue_num
      `).all(...sectionsEtud)
    : [];
  const epreuveF = {};
  for (const u of carteFiche) epreuveF[u.ue_num] = !!u.epreuve;
  const rangF = v => {
    const m = /^BA(\d+)$/.exec(String(v || '').toUpperCase());
    return m ? Number(m[1]) : 9;
  };

  const situationDe = ueNum => {
    // L'épreuve intégrée sanctionne la section : elle ne s'ouvre que si tout
    // le reste est acquis, ou s'il ne subsiste que les UE déterminantes,
    // présentées la même année.
    if (epreuveF[ueNum]) {
      // Elle ne s'ouvre que si toutes les UE des années inférieures sont
      // acquises. Sinon, seule une décision du Conseil des études la justifie.
      const rangE = rangF(nivDe2[ueNum]);
      const restantes = carteFiche
        .filter(x => x.ue_num !== ueNum
                  && rangF(nivDe2[x.ue_num]) < rangE
                  && !acquisSet.has(x.ue_num))
        .map(x => x.ue_num).sort((a, b) => a - b);
      return restantes.length
        ? { etat: 'impossible', chaine: restantes, epreuve: true }
        : { etat: 'ok' };
    }
    const chaine = chaineDe(ueNum);
    if (!chaine.length) return { etat: 'ok' };
    const niv = (nivDe2[ueNum] || '').toUpperCase();
    const conditionnelle = chaine.every(p =>
      inscritesAnnee.has(p) && (nivDe2[p] || '').toUpperCase() === niv);
    return conditionnelle
      ? { etat: 'sous_reserve', chaine }
      : { etat: 'impossible', chaine };
  };

  const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;');

  // Le parcours antérieur se lit par ANNÉE ACADÉMIQUE : c'est ainsi qu'on
  // raisonne un cursus. Auparavant les acquis formaient un bloc et les ajournés
  // un second, si bien que la même année revenait à deux endroits du tableau.
  const parcoursAnterieur = (() => {
    const tout = [
      ...acquisRows.map(a => ({
        annee: a.annee_scolaire || '—', ue_num: a.ue_num, ue_nom: a.ue_nom,
        mode: a.kind === 'va' ? '<b>Valorisation des acquis</b>' : 'Réussite',
        points: a.points, va: a.kind === 'va', acquis: true,
      })),
      ...autres.map(h => ({
        annee: h.annee_scolaire || '—', ue_num: h.ue_num, ue_nom: h.ue_nom,
        // Le libellé d'origine : ajourné = refusé, tout autre cas = absent.
        mode: h.resultat === 'ajourne' ? 'Refusé' : 'Absent',
        points: null, acquis: false,
      })),
    ];

    // Millésime décroissant : le plus récent d'abord, c'est ce qu'on consulte.
    const annees = [...new Set(tout.map(x => x.annee))]
      .sort((a, b) => String(b).localeCompare(String(a)));

    return annees.map(an => {
      const lignes = tout.filter(x => x.annee === an)
        .sort((a, b) => a.ue_num - b.ue_num);
      const nbAcquis = lignes.filter(x => x.acquis).length;
      return `
    <tr class="annee-groupe">
      <td colspan="4"><b>${esc(an)}</b>
        <span style="color:#64748b;font-weight:400"> — ${lignes.length} unité(s),
        ${nbAcquis} acquise(s)</span></td>
    </tr>` + lignes.map(x => `
    <tr>
      <td>${x.ue_num}</td>
      <td>${esc(x.ue_nom || '')}</td>
      <td>${x.mode}</td>
      <td style="text-align:right;white-space:nowrap">${
        x.va ? `${vaPourcent(x.points)} %` : x.points != null ? x.points + ' / 20' : '—'}</td>
    </tr>`).join('');
    }).join('');
  })();

  // Dates d'organisation : l'étudiant doit savoir quand son UE commence et se
  // termine — ces dates commandent aussi son délai de paiement.
  const datesOrg = Object.fromEntries(db.prepare(`
    SELECT ue_num, MIN(date_debut) AS date_debut, MAX(date_fin) AS date_fin
    FROM organisation_ue WHERE annee_scolaire = ? GROUP BY ue_num
  `).all(annee).map(o => [o.ue_num, o]));

  // Droit d'inscription, calculé sur le programme de l'année
  const di = calculerDI(etudId, annee);
  const dis = calculerDIS(etudId, annee);
  const eur = n => (Number(n) || 0).toFixed(2).replace('.', ',') + ' €';
  const parUe = Object.fromEntries((di?.detail || []).map(d => [d.ue_num, d]));

  // Deux lignes par UE : l'intitulé sur toute la largeur, les valeurs dessous.
  // Dix colonnes sur une seule ligne écrasaient l'intitulé, qui est pourtant ce
  // que l'étudiant lit en premier. La légende reste écrite UNE fois en tête :
  // la répéter à chaque UE aurait triplé la hauteur du tableau pour une
  // information constante.
  const lignesInsc = inscriptions.map(i => {
    const sit = situationDe(i.ue_num);
    const sr = sit.etat === 'sous_reserve' ? sit.chaine : null;
    const d = parUe[i.ue_num];
    // Réinscription à une UE déjà acquise : la circulaire l'admet sur décision
    // du Conseil des études, mais c'est le plus souvent le vestige d'un
    // programme calculé avant l'encodage des résultats. On le signale.
    const dejaAcquise = acquisRows.find(a => a.ue_num === i.ue_num);

    const alerte = sit.etat === 'impossible'
      ? (sit.epreuve
          ? ' <b style="color:#B91C1C">— épreuve intégrée : ' + sit.chaine.length
            + ' unité(s) des années antérieures non acquise(s)</b>'
          : ' <b style="color:#B91C1C">— exige la réussite de l\u2019UE ' + sit.chaine.join(', ') + '</b>')
      : '';

    const dates = (() => {
      const o = datesOrg[i.ue_num];
      if (!o?.date_debut && !o?.date_fin) return ['—', ''];
      const j = v => v ? String(v).slice(0, 10).split('-').reverse().join('/') : '…';
      return [j(o.date_debut), j(o.date_fin)];
    })();

    return `
    <tr class="ue-titre">
      <td colspan="7">
        <span class="ue-num">${i.ue_num}</span>
        <b>${esc(i.ue_nom || '')}</b>${i.codiplomation_ch ? ' <b>(CH)</b>' : ''}${
        sr ? ' <i>(sous réserve de la réussite de l\u2019UE ' + sr.join(', ') + ')</i>' : ''}${
        dejaAcquise ? ' <b style="color:#B45309">— déjà acquise en '
          + esc(dejaAcquise.annee_scolaire || '') + '</b>' : ''}${alerte}
      </td>
    </tr>
    <tr class="ue-valeurs">
      <td>${esc(i.date_inscription || '')}</td>
      <td>${i.admission_type === 'titre' ? 'Titre' : i.admission_type === 'test' ? 'Test' : '—'}</td>
      <td>${d?.dispensee ? 'Dispense complète' : (i.dispense_complete ? 'Dispense complète' : '—')}</td>
      <td style="text-align:center;white-space:nowrap">${dates[0]}${dates[1] ? ' <span style="color:#94a3b8">→ ' + dates[1] + '</span>' : ''}</td>
      <td style="text-align:right;white-space:nowrap">${d ? d.periodes_brutes : '—'}${
        d?.porte_forfait ? ' <span style="color:#C9A84C" title="Cette UE porte le forfait annuel">◆</span>' : ''}</td>
      <td style="text-align:right;white-space:nowrap">${d && !d.dispensee ? eur(d.montant) : '—'}</td>
      <td style="text-align:right">${i.ects != null ? i.ects : '—'}</td>
    </tr>`;
  }).join('');

  // Pied du tableau : forfait, puis total
  const piedDI = di && di.detail.length ? `
    <tr class="tot">
      <td colspan="4" style="text-align:right">Forfait annuel${di.ue_forfait ? ` — porté par l'UE ${di.ue_forfait} ◆` : ''}</td>
      <td style="text-align:right">—</td>
      <td style="text-align:right">${eur(di.forfait)}</td><td></td>
    </tr>
    <tr class="tot">
      <td colspan="4" style="text-align:right"><b>Droit d'inscription — total</b></td>
      <td style="text-align:right"><b>${di.periodes.total}</b></td>
      <td style="text-align:right"><b>${di.exonere ? '0,00 € (exonéré)' : eur(di.montant_arrondi)}</b></td>
      <td style="text-align:right"><b>${(() => {
        // Le total des crédits : c'est le chiffre que l'étudiant retient.
        const t = inscriptions.reduce((s, x) => s + (Number(x.ects) || 0), 0);
        return t || '—';
      })()}</b></td></tr>
    ${di.plafond_atteint ? `<tr><td colspan="7" style="font-size:10px;color:#64748b">
      Plafond de ${di.bareme.plafond_periodes} périodes atteint : ${di.retenues.secondaire + di.retenues.superieur}
      période(s) facturée(s) sur ${di.periodes.total}, le secondaire étant compté en premier.</td></tr>` : ''}
    ${di.exonere ? `<tr><td colspan="7" style="font-size:10px;color:#065f46">
      Exonération du droit d'inscription${di.motif ? ' — motif enregistré' : ''}.</td></tr>` : ''}
    ${dis && dis.soumis ? `<tr class="tot"><td colspan="5" style="text-align:right">
      Droit d'inscription spécifique (${dis.periodes_hebdo} pér./sem.)</td>
      <td style="text-align:right"><b>${eur(dis.montant_du)}</b></td><td></td></tr>` : ''}
  ` : '';

  /* L'ENVELOPPE COMMUNE (Charles, 3 octobre 2026 : « c'est quoi cette moche
     mise en page ? et le bas de page ? »). La fiche montait son propre HTML :
     pas de cadre de titre, des tailles en pixels, et un pied qui flottait au
     milieu de la feuille. Elle passe désormais par envelopperDocument, comme
     toutes les pièces : en-tête de l'établissement, titre, pied en bas de
     chaque page. Seul le corps lui est propre. */
  const stylesFiche = `
  .meta { color: #475569; margin: 0 0 3mm; font-size: 9.5pt; line-height: 1.45; }
  th, td { border-bottom: 0.25mm solid #D8DCE4; padding: 1.2mm 1.6mm; text-align: left; font-size: 9pt; }
  th { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .3pt; color: #475569; }
  tr.tot td { font-size: 8.5pt; }
  .alerte { border: 0.25mm solid #D8DCE4; border-left: 1mm solid #B45309; border-radius: 0 2.6mm 2.6mm 0;
            padding: 2mm 3mm; font-size: 8.5pt; margin: 3mm 0; }
  .alerte.grave { border-left-color: #9D4A38; }
  .sig { margin-top: 12mm; display: flex; gap: 20mm; }
  .sig div { flex: 1; border-top: 0.25mm solid #94a3b8; padding-top: 1.5mm; font-size: 9pt; }
  .engagement { margin-top: 6mm; padding: 3mm 4mm; border: 0.25mm solid #D8DCE4;
                border-radius: 2.6mm; font-size: 9pt; line-height: 1.5; }
  .engagement p { margin: 0 0 1.5mm; }
  .engagement p:last-child { margin-bottom: 0; }
  .engagement .rgpd { font-size: 8pt; color: #475569; border-top: 0.25mm solid #D8DCE4;
                      padding-top: 1.5mm; }
  .sig .mention { display: block; font-size: 7.5pt; color: #94a3b8; font-style: italic; }
  /* Sans largeurs explicites, le navigateur donnait autant de place aux
     colonnes vides qu'aux intitulés, qui s'écrasaient sur six lignes. */
  table.ues { table-layout: fixed; }
  /* Sept colonnes désormais : l'intitulé occupe sa propre ligne au-dessus. */
  table.ues th:nth-child(1), table.ues td:nth-child(1) { width: 15%; }
  table.ues th:nth-child(2), table.ues td:nth-child(2) { width: 12%; }
  table.ues th:nth-child(3), table.ues td:nth-child(3) { width: 17%; }
  table.ues th:nth-child(4), table.ues td:nth-child(4) { width: 22%; }
  table.ues th:nth-child(5), table.ues td:nth-child(5) { width: 11%; }
  table.ues th:nth-child(6), table.ues td:nth-child(6) { width: 15%; }
  table.ues th:nth-child(7), table.ues td:nth-child(7) { width: 8%; }
  table.ues td { word-wrap: break-word; }

  /* Deux niveaux de ligne : l'intitulé porte le filet supérieur, les valeurs
     s'y rattachent sans se séparer d'elles à la pagination. */
  table.ues tr.ue-titre td {
    border-top: 0.6pt solid #94a3b8; border-bottom: 0;
    padding-top: 1.8mm; padding-bottom: 0.4mm; font-size: 9pt;
  }
  table.ues tr.ue-titre .ue-num {
    display: inline-block; min-width: 9mm; margin-right: 1.5mm;
    padding: 0.2mm 1.2mm; border-radius: 1mm;
    background: #1B2B4B; color: #fff; font-size: 7.5pt; text-align: center;
  }
  table.ues tr.ue-valeurs td {
    border-top: 0; padding-top: 0.4mm; padding-bottom: 1.8mm;
    font-size: 8.5pt; color: #334155;
  }
  /* Le couple intitulé + valeurs ne doit pas se scinder d'une page à l'autre. */
  table.ues tr.ue-titre { break-after: avoid; page-break-after: avoid; }
  table.ues tr.ue-valeurs { break-before: avoid; page-break-before: avoid; }

  .section-insc { margin: 0 0 2mm; font-size: 9pt; color: #334155; }

  /* Le rang d'année ouvre chaque groupe du parcours antérieur. */
  tr.annee-groupe td {
    background: #f1f5f9; border-top: 0.6pt solid #94a3b8;
    padding-top: 1.4mm; padding-bottom: 1.4mm; font-size: 9pt;
  }
  tr.annee-groupe { break-after: avoid; page-break-after: avoid; }

  /* « 10 / 20 » se cassait en deux lignes. */
  .nowrap, td.num { white-space: nowrap; }

  /* Un bloc de signature coupé en deux pages n'a aucune valeur. */
  .engagement, .sig { break-inside: avoid; page-break-inside: avoid; }
  .engagement { break-before: auto; }

  .footer { margin-top: 6mm; font-size: 7.5pt; color: #64748b; line-height: 1.4; }
`;
  const corpsFiche = `
<div class="meta">
  ${esc(e.titre || '')} <b>${esc(e.nom)} ${esc(e.prenom)}</b>
  ${e.date_naissance ? ' · né(e) le ' + esc(e.date_naissance) : ''}
  ${e.num_national ? ' · RN ' + esc(e.num_national) : ''}<br>
  ${esc([e.adresse, e.cp, e.localite].filter(Boolean).join(', '))}
  ${e.email_ecole ? ' · ' + esc(e.email_ecole) : ''}
</div>

${acquisRows.length || autres.length ? `
<h2>Parcours antérieur au sein de l'établissement</h2>
<table>
  <thead><tr><th>UE</th><th>Intitulé</th><th>Mode d'acquisition</th>
    <th style="text-align:right">Note</th></tr></thead>
  <tbody>${parcoursAnterieur}</tbody>
</table>` : ''}

${(() => {
  const dejaVues = inscriptions.filter(i => acquisRows.some(a => a.ue_num === i.ue_num));
  const impossibles = inscriptions
    .map(i => ({ i, s: situationDe(i.ue_num) }))
    .filter(x => x.s.etat === 'impossible');
  let html = '';
  if (impossibles.length) {
    html += `<div class="alerte grave">
      <b>${impossibles.length} inscription(s) impossible(s)</b> : les prérequis ne sont pas acquis.
      ${impossibles.map(x => x.s.epreuve
          ? 'UE ' + x.i.ue_num + ' — épreuve intégrée, ' + x.s.chaine.length + ' unité(s) non acquise(s)'
          : 'UE ' + x.i.ue_num + ' exige ' + x.s.chaine.join(', ')).join(' · ')}.
      Une inscription conditionnelle ne vaut qu'entre unités d'une même année d'études, inscrites
      ensemble ; l'épreuve intégrée, elle, ne s'ouvre que si toutes les unités des années
      antérieures sont acquises — à défaut, seule une décision du Conseil des études la justifie. Retirez-les depuis l'onglet PAE avant de remettre ce document — elles gonflent
      également le droit d'inscription.
    </div>`;
  }
  if (dejaVues.length) {
    html += `<div class="alerte">
      <b>${dejaVues.length} unité(s) d'enseignement déjà acquise(s)</b> figurent à cette inscription
      (UE ${dejaVues.map(i => i.ue_num).join(', ')}). Une réinscription suppose une décision favorable
      du Conseil des études.
    </div>`;
  }
  return html;
})()}

<h2>Unités d'enseignement — inscription ${esc(annee)}</h2>
${(() => {
  // La section appartient à l'en-tête : on inscrit DANS une section, elle ne
  // varie pas d'une ligne à l'autre. Sauf pour l'étudiant inscrit dans
  // plusieurs, cas qui existe et qu'il faut alors énoncer.
  const secs = [...new Set(inscriptions.map(i => i.section).filter(Boolean))];
  if (!secs.length) return '';
  return `<p class="section-insc">${secs.length > 1 ? 'Sections' : 'Section'} :
    <b>${secs.map(esc).join(' · ')}</b></p>`;
})()}
<table class="ues">
  <thead><tr>
    <th>Date d'inscription</th><th>Admission</th><th>Valorisation</th>
    <th style="text-align:center">Dates</th><th style="text-align:right">Périodes</th>
    <th style="text-align:right">Droit d'inscription</th><th style="text-align:right">ECTS</th>
  </tr></thead>
  <tbody>${lignesInsc ? lignesInsc + piedDI : '<tr><td colspan="7" style="text-align:center;color:#94a3b8">Aucune UE inscrite pour cette année — encodez les inscriptions dans la grille de parcours</td></tr>'}</tbody>
</table>

<!-- Engagement de l'étudiant. L'article 39 du règlement des études n'admet
     comme signature qu'un tracé manuscrit ou un procédé électronique
     authentifié : le document doit être signé, non approuvé par courriel. -->
<div class="engagement">
  <p>
    Je soussigné(e) <b>${esc([e.titre, e.prenom, e.nom].filter(Boolean).join(' '))}</b>
    confirme mon inscription aux <b>${inscriptions.length}</b> unité(s) d'enseignement
    reprises ci-dessus, et signe pour chacune d'elles.
  </p>
  <p>
    Je reconnais avoir pris connaissance du règlement des études et du règlement d'ordre
    intérieur, et m'engage à les respecter, ainsi qu'à m'acquitter du droit d'inscription
    dans les délais prévus.
  </p>
  <p class="rgpd">
    <b>Protection des données.</b> Conformément au Règlement général sur la protection des
    données, les informations recueillies servent uniquement à la gestion du dossier
    administratif, à des fins pédagogiques et statistiques, et à leur transmission à la
    Fédération Wallonie-Bruxelles dans le cadre du financement de l'enseignement. Elles ne
    sont communiquées à aucun tiers, hormis la Fédération dans le cadre de ses missions
    légales. Vous pouvez accéder aux données vous concernant et en demander la correction
    auprès du secrétariat. <i>Règlement des études, article 108.</i>
  </p>
</div>

<div class="sig">
  <div>
    Signature de l'apprenant
    <span class="mention">précédée de la mention « lu et approuvé »</span>
  </div>
  <div>Pour l'établissement</div>
</div>
<div class="footer">
  Mention « CH » : UE suivie dans le cadre d'un programme d'études en codiplômation.
  « Sous réserve » : l'accès effectif dépend de la réussite de l'UE prérequise organisée la même année.
</div>
`;
  const html = envelopperDocument({
    html: corpsFiche, styles: stylesFiche,
    titre: `Fiche d'inscription — ${e.nom} ${e.prenom}`,
    entete: { titre: "Fiche d'inscription / reçu", sous: `${etab} — Enseignement pour adultes · ${annee}` },
  });

  res.json({ html, nom: 'fiche_inscription_' + (e.nom || 'etudiant') + '_' + annee + '.html' });
});

// ── Ajouter un étudiant manuellement ─────────────────────────────────────────
// ── Modification du signalétique ────────────────────────────────────────────
// Rien ne permettait de corriger une adresse ou d'ajouter un lieu de naissance :
// on pouvait créer un étudiant, jamais le rectifier.
const CHAMPS_ETUDIANT = ['id_ecampus', 'nom', 'prenom', 'titre', 'date_naissance',
  'lieu_naissance', 'nationalite', 'num_national', 'email_ecole', 'email_perso',
  'gsm', 'adresse', 'cp', 'localite', 'actif', 'sejour_limite_etudes', 'titre_acces', 'diplome_max', 'sexe'];

r.patch('/:id', authRequired, gesteRequis('etudiants.identite'), (req, res) => {
  const etudId = Number(req.params.id);
  const avant = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(etudId);
  if (!avant) return res.status(404).json({ error: 'étudiant introuvable' });

  const presents = CHAMPS_ETUDIANT.filter(k => k in (req.body || {}));
  if (!presents.length) return res.json({ ok: true, inchange: true });

  // Le numéro national identifie la personne : un doublon rendrait tout
  // rapprochement d'historique impossible.
  if (presents.includes('num_national') && req.body.num_national) {
    const norm = String(req.body.num_national).replace(/[^0-9]/g, '');
    const autre = db.prepare(`
      SELECT id, nom, prenom FROM etudiant
      WHERE id <> ? AND REPLACE(REPLACE(REPLACE(COALESCE(num_national,''),'.',''),'-',''),' ','') = ?
    `).get(etudId, norm);
    if (autre) {
      return res.status(400).json({
        error: `Ce numéro national est déjà celui de ${autre.nom} ${autre.prenom}. `
             + `Deux dossiers ne peuvent pas le partager.`,
      });
    }
  }

  if (presents.includes('sexe') && req.body.sexe && !['F', 'M', 'X'].includes(req.body.sexe)) {
    return res.status(400).json({ error: 'Sexe attendu : F, M ou X' });
  }
  // Le diplôme se choisit dans une liste fermée : un texte libre ne se compte pas.
  for (const [k, liste] of [['titre_acces', TITRES_ACCES], ['diplome_max', DIPLOMES_MAX]]) {
    if (presents.includes(k) && req.body[k] && !liste.some(([c]) => c === req.body[k])) {
      return res.status(400).json({ error: `Valeur inconnue pour ${k} : ${req.body[k]}` });
    }
  }

  db.prepare(`UPDATE etudiant SET ${presents.map(k => `${k} = ?`).join(', ')} WHERE id = ?`)
    .run(...presents.map(k => (req.body[k] === '' && (k === 'titre_acces' || k === 'diplome_max' || k === 'sexe') ? null : req.body[k] ?? null)), etudId);

  res.json({ ok: true, modifies: presents });
});

// ── Complément de dossier par numéro national ───────────────────────────────
// Les listes officielles portent des données que Lucie n'a pas — lieu de
// naissance, adresse à jour. Le rapprochement se fait sur le numéro national,
// seul identifiant stable : eCampus réattribue les matricules chaque rentrée.
r.post('/completer', authRequired, roleRequired('admin', 'directeur', 'directeur_adjoint',
       'editeur', 'secretariat'), (req, res) => {
  const { lignes, simulation } = req.body || {};
  if (!Array.isArray(lignes)) return res.status(400).json({ error: 'lignes requises' });

  const norm = v => String(v || '').replace(/[^0-9]/g, '');
  // Comparaison des noms : sans accent, sans casse, sans ponctuation. « EL
  // AZIZI », « El-Azizi » et « el azizi » sont la même personne.
  const cle = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');

  const tous = db.prepare(
    'SELECT id, nom, prenom, num_national, id_ecampus, date_naissance FROM etudiant').all();
  const parRN = {};
  const parMat = {};
  const parNom = {};
  for (const e of tous) {
    const n = norm(e.num_national);
    if (n) parRN[n] = e;
    const m = String(e.id_ecampus || '').trim();
    if (m) parMat[m] = e;
    const k = cle(e.nom) + '|' + cle(e.prenom);
    if (k !== '|') (parNom[k] ||= []).push(e);
  }

  /**
   * RETROUVER LE DOSSIER — du plus sûr au moins sûr.
   *
   * Le rapprochement ne se faisait QUE sur le numéro national. Un étudiant
   * dont Lucie n'a pas encore le numéro — c'est-à-dire précisément celui
   * qu'on cherche à compléter — n'était jamais retrouvé : sa ligne partait
   * en « inconnu » et rien n'était écrit. On tombe donc en cascade sur le
   * matricule, puis sur l'identité, cette dernière seulement si elle ne
   * désigne qu'une personne : deux homonymes valent mieux non rapprochés
   * que mal rapprochés.
   */
  const retrouver = (l) => {
    const n = norm(l.num_national);
    if (n && parRN[n]) return { e: parRN[n], methode: 'numero_national' };
    const m = String(l.id_ecampus || '').trim();
    if (m && parMat[m]) return { e: parMat[m], methode: 'matricule' };
    const k = cle(l.nom) + '|' + cle(l.prenom);
    if (k !== '|' && parNom[k]) {
      const c = parNom[k];
      if (c.length === 1) return { e: c[0], methode: 'identite' };
      // Homonymes : la date de naissance tranche, si la liste la porte.
      const dn = String(l.date_naissance || '').trim();
      const exact = dn ? c.filter(x => String(x.date_naissance || '').trim() === dn) : [];
      if (exact.length === 1) return { e: exact[0], methode: 'identite' };
      return { ambigu: c.length };
    }
    return null;
  };

  const COMPLETABLES = ['lieu_naissance', 'nationalite', 'date_naissance', 'adresse',
                        'cp', 'localite', 'gsm', 'email_perso', 'email_ecole',
                        'titre', 'id_ecampus'];

  const rapport = { retrouves: 0, inconnus: [], modifications: [], champs: {},
                    conflits_matricule: [], ambigus: [],
                    methodes: { numero_national: 0, matricule: 0, identite: 0 } };

  // LE MATRICULE APPARTIENT DÉJÀ À QUELQU'UN.
  //
  // eCampus réattribue les matricules à chaque rentrée : celui que la liste
  // donne à Marie peut être, en base, encore celui de Luc. L'UPDATE butait
  // alors sur l'unicité — « UNIQUE constraint failed: etudiant.id_ecampus » —
  // et la transaction emportait TOUTE la complétion, y compris les lignes
  // saines, sur un message que rien n'expliquait.
  //
  // On écarte le seul champ en cause, on complète le reste, et on dit à qui
  // le matricule appartient : c'est un arbitrage humain, pas une erreur
  // technique.
  const matriculePris = db.prepare(
    'SELECT id, nom, prenom FROM etudiant WHERE id_ecampus = ? AND id <> ?');

  const appliquer = db.transaction(() => {
    for (const l of lignes) {
      const t = retrouver(l);
      if (t?.ambigu) {
        rapport.ambigus.push({ nom: l.nom, prenom: l.prenom, homonymes: t.ambigu });
        continue;
      }
      if (!t) {
        rapport.inconnus.push({ num_national: l.num_national, nom: l.nom });
        continue;
      }
      const e = t.e;
      rapport.retrouves++;
      rapport.methodes[t.methode]++;

      const actuel = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(e.id);
      const maj = {};
      for (const k of COMPLETABLES) {
        const v = l[k];
        if (v == null || String(v).trim() === '') continue;
        // On COMPLÈTE : une valeur déjà présente n'est pas écrasée, sauf
        // demande explicite. Une liste importée n'est pas plus fiable que ce
        // qu'un secrétariat a corrigé à la main.
        if (actuel[k] != null && String(actuel[k]).trim() !== '' && !l.__ecraser) continue;
        if (k === 'id_ecampus') {
          const autre = matriculePris.get(String(v).trim(), e.id);
          if (autre) {
            rapport.conflits_matricule.push({
              id: e.id, nom: actuel.nom, prenom: actuel.prenom,
              id_ecampus: String(v).trim(),
              detenu_par: `${autre.nom} ${autre.prenom}`, detenu_par_id: autre.id,
            });
            continue;
          }
        }
        maj[k] = String(v).trim();
        rapport.champs[k] = (rapport.champs[k] || 0) + 1;
      }
      if (!Object.keys(maj).length) continue;

      rapport.modifications.push({
        id: e.id, nom: actuel.nom, prenom: actuel.prenom, champs: Object.keys(maj),
      });
      if (!simulation) {
        db.prepare(`UPDATE etudiant SET ${Object.keys(maj).map(k => `${k} = ?`).join(', ')}
                    WHERE id = ?`).run(...Object.values(maj), e.id);
      }
    }
    if (simulation) throw new Error('SIMULATION');
  });

  try { appliquer(); } catch (e) {
    if (e.message !== 'SIMULATION') {
      // Une contrainte violée n'est pas un message à montrer tel quel : elle
      // dit la table et la colonne, jamais ce qu'il faut faire.
      const clair = /UNIQUE constraint failed: etudiant\.(\w+)/.exec(e.message);
      return res.status(500).json({
        error: clair
          ? `La valeur « ${clair[1]} » d'une des lignes appartient déjà à un autre `
            + "dossier. Rien n'a été modifié : corrigez la ligne en cause dans le "
            + 'classeur, ou laissez cette colonne de côté.'
          : e.message,
      });
    }
  }

  res.json({
    ok: true, simulation: !!simulation,
    lignes_lues: lignes.length,
    nb_conflits: rapport.conflits_matricule.length,
    nb_ambigus: rapport.ambigus.length,
    ...rapport,
    inconnus: rapport.inconnus.slice(0, 30),
    nb_inconnus: rapport.inconnus.length,
  });
});

/**
 * CRÉER UN ÉTUDIANT À LA MAIN.
 *
 * La route existait depuis toujours ; aucun écran ne l'appelait. Un étudiant
 * qui se présente hors import eCampus — une inscription tardive, un dossier
 * repris d'un autre établissement — n'avait donc aucun moyen d'entrer dans
 * Lucie. Une fonction sans porte est une fonction qui n'existe pas.
 *
 * ELLE REFUSE UN DOUBLON PLUTÔT QUE DE LE CRÉER. Nous venons de passer une
 * journée à fusionner des étudiants de TIM dont le parcours était coupé en
 * deux ; c'est exactement ainsi que cela commence — on ne trouve pas
 * quelqu'un dans la liste, on le recrée, et son historique se scinde. Le
 * registre national d'abord, puis nom + prénom + date de naissance. Le doublon
 * n'est pas bloqué au sens strict : le serveur le SIGNALE et laisse le
 * secrétariat trancher, parce que deux homonymes nés le même jour existent.
 */
r.post('/', authRequired, gesteRequis('etudiants.creer'), (req, res) => {
  const { nom, prenom, annee, ue_nums, ...rest } = req.body;
  if (!nom || !prenom) return res.status(400).json({ error: 'nom et prenom requis' });

  if (!rest.forcer) {
    const nn = String(rest.num_national || '').replace(/\D/g, '');
    let candidats = [];
    if (nn.length >= 11) {
      candidats = db.prepare(`SELECT id, nom, prenom, date_naissance, email_ecole
        FROM etudiant WHERE REPLACE(REPLACE(REPLACE(num_national,'.',''),'-',''),' ','') = ?`)
        .all(nn);
    }
    if (!candidats.length) {
      candidats = db.prepare(`SELECT id, nom, prenom, date_naissance, email_ecole
        FROM etudiant
        WHERE LOWER(TRIM(nom)) = LOWER(TRIM(?)) AND LOWER(TRIM(prenom)) = LOWER(TRIM(?))
          ${rest.date_naissance ? 'AND date_naissance = ?' : ''}`)
        .all(...(rest.date_naissance ? [nom, prenom, rest.date_naissance] : [nom, prenom]));
    }
    if (candidats.length) {
      return res.status(409).json({
        error: 'Un dossier existe déjà pour cette personne.',
        candidats,
      });
    }
  }

  const info = db.prepare(`
    INSERT INTO etudiant (nom, prenom, email_ecole, email_perso, date_naissance,
                         num_national, gsm, adresse, localite, cp, titre,
                         section_rattachement)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(nom.trim(), prenom.trim(), rest.email_ecole||null, rest.email_perso||null,
         rest.date_naissance||null, rest.num_national||null, rest.gsm||null,
         rest.adresse||null, rest.localite||null, rest.cp||null, rest.titre||null,
         rest.section_rattachement||null);

  const id = Number(info.lastInsertRowid);
  // Ce que la carte d'identité apporte en plus (3 octobre 2026).
  try {
    if (rest.nationalite || rest.lieu_naissance) db.prepare('UPDATE etudiant SET nationalite = COALESCE(?, nationalite), lieu_naissance = COALESCE(?, lieu_naissance) WHERE id = ?')
      .run(rest.nationalite || null, rest.lieu_naissance || null, id);
  } catch { /* colonnes absentes d'une base ancienne */ }

  // Inscriptions initiales
  // Par la porte unique (mode « signaler ») : l'écran n'en envoie pas, mais
  // la route les accepte — elles ne passent plus sans être jugées.
  let aRegulariser = 0;
  if (annee && Array.isArray(ue_nums) && ue_nums.length) {
    aRegulariser = ecrireProgramme({ etudId: id, annee, ajouter: ue_nums, origine: 'création du dossier',
      par: req.user?.email || req.user?.nom || null, mode: 'signaler' }).ecarts.length;
  }

  res.json({ ok: true, id, a_regulariser: aRegulariser });
});

// ── IMPORTER DE NOUVEAUX ÉTUDIANTS — la signalétique eCampus ─────────────────
//
// Demandé par Charles le 21 septembre 2026, un fichier en main : l'export
// eCampus « R_Etudiants_Excel » d'une promotion de BA1 — identités, pas
// d'unités. Aucune porte ne le prenait : « Liste eCampus » exige Code_UE, et
// l'importateur sur mesure « complète les dossiers existants » — la création y
// était une case facultative que personne ne pouvait deviner.
//
// Cette porte-ci connaît le fichier : ses colonnes s'associent d'elles-mêmes.
// Pour chaque ligne :
//   RETROUVÉ  → on COMPLÈTE les champs vides, rien n'est écrasé (ce qu'un
//               secrétariat a corrigé à la main vaut mieux qu'un export), et
//               le matricule de l'année REJOINT le dossier sans remplacer
//               l'ancien, qui figure sur des pièces déjà délivrées ;
//   INCONNU   → on CRÉE, rattaché à la section choisie ;
//   SANS NOM  → on ÉCARTE, et on le dit.
// La recherche est celle de l'import d'historique (`rapprocher`) : numéro
// national, puis TOUS les matricules connus (celui de l'année et le NoInit),
// puis nom + prénom + date de naissance. Une deuxième recherche aurait fini
// par différer de la première — et c'est la plus laxiste qui créerait le
// doublon.
//
// Simulation d'abord ; l'écriture est tout ou rien.
const COLONNES_SIGNALETIQUE = {
  id_ecampus: 'Id_Etud', no_init: 'NoInit', titre: 'TitreMrMme',
  nom: 'NomEtud', prenom: 'PréEtud', complet: 'Etudiant',
  lieu_naissance: 'LieuNais', date_naissance: 'StrDatNais',
  adresse: 'AdrN°Bte', cp: 'CP', localite: 'Localité',
  email_perso: 'Email Perso', email_ecole: 'EmailEcole',
  num_national: 'N°National', gsm: 'GSMEtud', tel: 'TélEtud',
};
const CHAMPS_COMPLETABLES = ['titre', 'lieu_naissance', 'date_naissance', 'adresse', 'cp',
  'localite', 'email_perso', 'email_ecole', 'num_national', 'gsm'];

function lireLigneSignaletique(brut) {
  const v = cle => String(brut?.[COLONNES_SIGNALETIQUE[cle]] ?? '').trim();
  let nom = v('nom'), prenom = v('prenom');
  // Nom et prénom séparés manquants, « Etudiant » les porte collés : on ne
  // devine pas où couper — le NOM en capitales vient d'abord, c'est la règle
  // d'eCampus (« ABDO Rama »).
  if ((!nom || !prenom) && v('complet')) {
    const m = /^([A-ZÀ-ÖØ-Þ' -]+)\s+(.+)$/.exec(v('complet'));
    if (m) { nom = nom || m[1].trim(); prenom = prenom || m[2].trim(); }
  }
  const dn = normDate(v('date_naissance'));
  const cp = v('cp');
  // « 1348 Louvain-la-Neuve » : le code postal a sa propre colonne.
  const localite = v('localite').replace(new RegExp(`^${cp}\\s+`), '').trim();
  return {
    id_ecampus: v('id_ecampus') || null, no_init: v('no_init') || null,
    nom, prenom, titre: v('titre') || null,
    lieu_naissance: v('lieu_naissance') || null,
    date_naissance: /^\d{4}-\d{2}-\d{2}$/.test(dn) ? dn : null,
    date_brute: v('date_naissance') || null,
    adresse: v('adresse') || null, cp: cp || null, localite: localite || null,
    email_perso: v('email_perso') || null, email_ecole: v('email_ecole') || null,
    num_national: v('num_national') || null, gsm: v('gsm') || v('tel') || null,
  };
}

r.post('/import-signaletique', authRequired,
  roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat'), (req, res) => {
  /* LA SECTION SE CHOISIT PAR ÉTUDIANT. Un export eCampus mêle souvent
   * plusieurs packs — le fichier BA1 du 21 septembre en portait cinq :
   * Psychomotricité, AeSI (deux groupes), TIM, Opto-Ortho. Une section pour
   * tout le lot aurait rattaché 300 personnes à la mauvaise. `section` est le
   * défaut ; `sections_par_ligne` ({ indice: code | '' }) le remplace ligne
   * par ligne, '' voulant dire « aucune ». */
  const { lignes, section, sections_par_ligne = {}, simulation = true } = req.body || {};
  if (!Array.isArray(lignes) || !lignes.length) {
    return res.status(400).json({ error: 'Le fichier ne contient aucune ligne.' });
  }
  const sectionDe = i => (Object.prototype.hasOwnProperty.call(sections_par_ligne, i)
    ? (sections_par_ligne[i] || null) : (section || null));
  const entetes = Object.keys(lignes[0] || {});
  const manquantes = ['Id_Etud', 'NomEtud', 'PréEtud', 'N°National']
    .filter(c => !entetes.includes(c));
  if (manquantes.length === 4 || !entetes.includes('Id_Etud')) {
    return res.status(400).json({ error: 'Ce fichier n’est pas l’export eCampus des étudiants '
      + '(« R_Etudiants_Excel ») : colonnes introuvables — ' + manquantes.join(', ') + '.' });
  }
  const demandees = new Set([section, ...Object.values(sections_par_ligne)].filter(Boolean));
  for (const code of demandees) {
    const ok = db.prepare('SELECT 1 FROM section WHERE code = ?').get(code);
    if (!ok) return res.status(400).json({ error: `Section inconnue : ${code}.` });
  }

  const rapport = { crees: [], completes: [], inchanges: 0, ecartes: [], conflits: [] };
  const vusRN = new Map();
  const normRN = x => String(x || '').replace(/\D/g, '');

  const ecrire = db.transaction(() => {
    lignes.forEach((brut, i) => {
      const n = i + 2;                       // n° de ligne dans le tableur
      const p = lireLigneSignaletique(brut);
      const sectionLigne = sectionDe(i);
      const qui = `${(p.nom || '').toUpperCase()} ${p.prenom || ''}`.trim() || p.id_ecampus || `ligne ${n}`;
      if (!p.nom || !p.prenom) {
        rapport.ecartes.push({ ligne: n, qui, motif: 'nom ou prénom absent' });
        return;
      }
      const rn = normRN(p.num_national);
      if (rn && vusRN.has(rn)) {
        rapport.ecartes.push({ ligne: n, qui,
          motif: `même numéro national que la ligne ${vusRN.get(rn)} du fichier` });
        return;
      }
      if (rn) vusRN.set(rn, n);

      const trouve = rapprocher(p)
        || (p.no_init ? rapprocher({ id_ecampus: p.no_init }) : null);
      const matricules = [p.id_ecampus, p.no_init].filter(Boolean);

      if (trouve) {
        const actuel = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(trouve.id);
        const maj = {};
        for (const c of CHAMPS_COMPLETABLES) {
          if (p[c] && (actuel[c] == null || String(actuel[c]).trim() === '')) maj[c] = p[c];
        }
        if (rn && !actuel.rn_norm) maj.rn_norm = rn;
        if (sectionLigne && !actuel.section_rattachement) maj.section_rattachement = sectionLigne;
        if (Object.keys(maj).length) {
          db.prepare(`UPDATE etudiant SET ${Object.keys(maj).map(c => `${c} = ?`).join(', ')}
            WHERE id = ?`).run(...Object.values(maj), actuel.id);
          rapport.completes.push({ ligne: n, qui, id: actuel.id, par: trouve.methode,
            champs: Object.keys(maj).filter(c => c !== 'rn_norm') });
        } else rapport.inchanges++;
        for (const m of matricules) {
          const autre = db.prepare('SELECT etudiant_id FROM etudiant_matricule WHERE id_ecampus = ?').get(m);
          if (autre && autre.etudiant_id !== actuel.id) {
            rapport.conflits.push({ ligne: n, qui, motif: `le matricule ${m} appartient déjà à un autre dossier` });
            continue;
          }
          db.prepare(`INSERT OR IGNORE INTO etudiant_matricule (etudiant_id, id_ecampus, annee, source)
            VALUES (?,?,?,'signaletique')`).run(actuel.id, m, null);
        }
        return;
      }

      // Le matricule est unique en base : s'il est déjà pris, le dossier naît
      // sans lui et on le dit — plutôt que d'échouer ou de voler celui d'autrui.
      const pris = p.id_ecampus && (
        db.prepare('SELECT 1 FROM etudiant WHERE id_ecampus = ?').get(p.id_ecampus)
        || db.prepare('SELECT 1 FROM etudiant_matricule WHERE id_ecampus = ?').get(p.id_ecampus));
      if (pris) rapport.conflits.push({ ligne: n, qui, motif: `matricule ${p.id_ecampus} déjà attribué — dossier créé sans lui` });
      const info = db.prepare(`INSERT INTO etudiant
        (id_ecampus, nom, prenom, titre, lieu_naissance, date_naissance, adresse, cp, localite,
         email_perso, email_ecole, num_national, gsm, rn_norm, section_rattachement, actif)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`).run(
          pris ? null : p.id_ecampus, p.nom, p.prenom, p.titre, p.lieu_naissance, p.date_naissance,
          p.adresse, p.cp, p.localite, p.email_perso, p.email_ecole, p.num_national, p.gsm,
          rn || null, sectionLigne);
      const id = Number(info.lastInsertRowid);
      for (const m of matricules) {
        db.prepare(`INSERT OR IGNORE INTO etudiant_matricule (etudiant_id, id_ecampus, annee, source)
          VALUES (?,?,?,'signaletique')`).run(id, m, null);
      }
      rapport.crees.push({ ligne: n, qui, id, section: sectionLigne,
        ...(p.date_brute && !p.date_naissance ? { note: `date « ${p.date_brute} » non lue` } : {}) });
    });
    if (simulation) throw new Error('SIMULATION');
  });

  try { ecrire(); } catch (e) {
    if (e.message !== 'SIMULATION') {
      console.error('[import-signaletique]', e);
      return res.status(500).json({ error: e.message });
    }
  }
  res.json({
    simulation: !!simulation, lignes: lignes.length, section: section || null,
    nb_crees: rapport.crees.length, nb_completes: rapport.completes.length,
    nb_inchanges: rapport.inchanges, nb_ecartes: rapport.ecartes.length,
    crees: rapport.crees, completes: rapport.completes,
    ecartes: rapport.ecartes, conflits: rapport.conflits,
  });
});

// ── PLACER LES ÉTUDIANTS DANS LEUR SECTION — le rapport eCampus « Pack UF » ─
//
// Demandé par Charles le 21 septembre 2026 : « sais-tu te servir de mon
// document Word pour placer les étudiants sans section dans une section ? ».
// Le rapport dit, pour chaque matricule, de quel PACK il est ; un pack
// appartient à une section. Trois temps, comme tout import :
//   1. ANALYSE    (sans `correspondances`) : les packs lus, une section
//                 proposée pour chacun — rien d'écrit ;
//   2. SIMULATION : ce qui serait posé, étudiant par étudiant ;
//   3. ÉCRITURE   : tout ou rien.
// On ne pose une section QUE là où il n'y en a pas : un rattachement déjà
// fait a été décidé par quelqu'un, et un rapport n'a pas autorité pour le
// défaire. Les désaccords sont montrés, jamais corrigés d'office.
const televersementPack = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function sectionProposee(libelle, sections) {
  const n = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const l = n(libelle);
  // Le libellé du pack contient le nom de la section (« Bachelier 1 en
  // Psychomotricité ») ; sinon son code (« AeSI 1e Gpe1 »). Imagerie médicale
  // est TIM. Rien d'autre n'est deviné : « Opto-Ortho » reste à trancher.
  const trouves = sections.filter(sc => {
    const lib = n(sc.libelle), code = n(sc.code);
    return (lib.length > 3 && l.includes(lib)) || (code.length > 1 && new RegExp(`\\b${code}\\b`).test(l))
      || (code === 'tim' && l.includes('imagerie'));
  });
  return trouves.length === 1 ? trouves[0].code : null;
}

r.post('/rattacher-pack', authRequired,
  roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat'),
  televersementPack.single('fichier'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });
    let packs;
    try { ({ packs } = await lirePackUF(req.file.buffer)); }
    catch (e) { return res.status(e.status || 422).json({ error: e.message }); }

    const sections = db.prepare('SELECT code, libelle FROM section ORDER BY libelle').all();
    let correspondances = null;
    try { correspondances = req.body?.correspondances ? JSON.parse(req.body.correspondances) : null; }
    catch { return res.status(400).json({ error: 'Correspondances illisibles.' }); }
    const simulation = req.body?.simulation !== 'false';

    const resume = packs.map(p => ({
      libelle: p.libelle, etudiants: p.etudiants.length, unites: p.unites,
      section_proposee: sectionProposee(p.libelle, sections),
    }));
    if (!correspondances) return res.json({ etape: 'analyse', packs: resume });

    for (const code of Object.values(correspondances).filter(Boolean)) {
      if (!sections.some(sc => sc.code === code)) {
        return res.status(400).json({ error: `Section inconnue : ${code}.` });
      }
    }

    const rapport = { a_placer: [], deja_meme: 0, deja_autre: [], introuvables: [], sans_section_choisie: 0 };
    const poser = db.prepare('UPDATE etudiant SET section_rattachement = ? WHERE id = ? AND section_rattachement IS NULL');
    const ecrire = db.transaction(() => {
      for (const p of packs) {
        const cible = correspondances[p.libelle] || null;
        for (const e of p.etudiants) {
          if (!cible) { rapport.sans_section_choisie++; continue; }
          const trouve = rapprocher({ id_ecampus: e.matricule });
          if (!trouve) { rapport.introuvables.push({ matricule: e.matricule, nom: e.nom, pack: p.libelle }); continue; }
          const actuel = db.prepare('SELECT id, nom, prenom, section_rattachement FROM etudiant WHERE id = ?').get(trouve.id);
          const qui = `${(actuel.nom || '').toUpperCase()} ${actuel.prenom || ''}`.trim();
          if (actuel.section_rattachement === cible) { rapport.deja_meme++; continue; }
          if (actuel.section_rattachement) {
            rapport.deja_autre.push({ qui, matricule: e.matricule, actuelle: actuel.section_rattachement, pack: p.libelle, proposee: cible });
            continue;
          }
          rapport.a_placer.push({ qui, matricule: e.matricule, section: cible });
          poser.run(cible, actuel.id);
        }
      }
      if (simulation) throw new Error('SIMULATION');
    });
    try { ecrire(); } catch (e) {
      if (e.message !== 'SIMULATION') {
        console.error('[rattacher-pack]', e);
        return res.status(500).json({ error: e.message });
      }
    }
    const parSection = {};
    for (const x of rapport.a_placer) parSection[x.section] = (parSection[x.section] || 0) + 1;
    res.json({
      etape: simulation ? 'simulation' : 'ecriture', packs: resume,
      nb_a_placer: rapport.a_placer.length, par_section: parSection,
      deja_meme: rapport.deja_meme, deja_autre: rapport.deja_autre,
      introuvables: rapport.introuvables, sans_section_choisie: rapport.sans_section_choisie,
    });
  });

// ── Import depuis le fichier eCampus Excel ───────────────────────────────────
// Le frontend lit le fichier XLS/XLSX avec SheetJS et envoie les données en JSON.
// La colonne Code_UE contient directement le ue_num Lucie.
r.post('/import-excel', authRequired, gesteRequis('etudiants.import'), async (req, res) => {
  const { annee, etudiants: etudiantsData, inscriptions: inscriptionsData } = req.body;
  if (!annee || !Array.isArray(etudiantsData)) {
    return res.status(400).json({ error: 'annee et etudiants requis' });
  }

  try {
    const insEtud = db.prepare(`
      INSERT INTO etudiant (id_ecampus,nom,prenom,email_ecole,email_perso,
        date_naissance,num_national,gsm,adresse,localite,cp,titre)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id_ecampus) DO UPDATE SET
        nom=excluded.nom, prenom=excluded.prenom,
        email_ecole=excluded.email_ecole, email_perso=excluded.email_perso
    `);

    let etudiants_crees=0, inscriptions_creees=0;
    const tx = db.transaction(() => {
      for (const e of etudiantsData) {
        const r = insEtud.run(e.id_ecampus||null, e.nom||'', e.prenom||'',
          e.email_ecole||null, e.email_perso||null, e.date_naissance||null,
          e.num_national||null, e.gsm||null, e.adresse||null,
          e.localite||null, e.cp||null, e.titre||null);
        if (r.changes) etudiants_crees++;
      }
    });
    tx();

    // Les inscriptions par la porte unique, en mode « signaler » (choix B).
    const trouver = db.prepare('SELECT id FROM etudiant WHERE id_ecampus = ? LIMIT 1');
    const parEtud = new Map();
    for (const i of inscriptionsData) {
      if (!i.ue_num || isNaN(Number(i.ue_num))) continue;
      const e = trouver.get(i.id_ecampus);
      if (!e) continue;
      if (!parEtud.has(e.id)) parEtud.set(e.id, []);
      parEtud.get(e.id).push(i);
    }
    const aRegulariser = [];
    for (const [id, lignes] of parEtud) {
      const b = ecrireProgramme({ etudId: id, annee, ajouter: lignes.map(i => Number(i.ue_num)),
        origine: 'import eCampus (Excel)', par: req.user?.email || req.user?.nom || null, mode: 'signaler' });
      inscriptions_creees += b.ajoutees.length;
      for (const x of b.ecarts) aRegulariser.push({ etudiant_id: id, ue_num: x.ue_num, regles: x.regles.map(r0 => r0.libelle) });
      for (const i of lignes) if (i.groupe) db.prepare(`UPDATE etudiant_inscription SET groupe = COALESCE(groupe, ?)
        WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?`).run(i.groupe, id, annee, Number(i.ue_num));
    }

    res.json({ ok:true, etudiants: etudiantsData.length, etudiants_crees,
               inscriptions: inscriptionsData.length, inscriptions_creees, annee,
               a_regulariser: aRegulariser.length, a_regulariser_liste: aRegulariser.slice(0, 200) });
  } catch(e) {
    console.error('Import étudiants:', e);
    res.status(500).json({ error: e.message });
  }
});


export default r;
