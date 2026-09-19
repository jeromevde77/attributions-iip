// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Le circuit de la valorisation des acquis (VA / VAE)
//
// CE FICHIER EXISTE À CAUSE D'UNE FAUTE RÉELLE.
//
// En septembre 2026, une attestation de réussite « Valorisation » erronée est
// sortie de Lucie. En amont, la procédure avait été contournée : pas d'avis
// écrit du chargé de cours, pas de base légale renseignée, pas de motivation.
// La signature de la direction et le cachet de l'établissement ont pourtant
// été apposés — parce que rien, dans le logiciel, ne savait ce qui aurait dû
// précéder. Lucie enregistrait UNE DÉCISION ; la procédure décrit UN CIRCUIT.
//
// La règle tient en une phrase, et tout ce qui suit la sert :
//
//   AUCUNE PIÈCE PORTANT UNE SIGNATURE NE SE PRODUIT SI LE CIRCUIT N'A PAS
//   ÉTÉ PARCOURU — ET CHAQUE ÉTAPE PORTE LE NOM DE CELUI QUI L'A FAITE.
//
// Les contrôles sont ICI, et non dans les écrans : un bouton caché n'est pas
// une protection. Un écran qui n'affiche pas le bouton d'attestation empêche
// de cliquer, il n'empêche pas d'appeler la route.
//
// Références : décret du 16.04.1991 art. 8 · AGCF du 13.12.2024 (modifié par
// l'AGCF du 18.07.2025) art. 2 à 11 · circulaire Sanction des études n° 7658 ·
// RDE/ROI IIP 2026-2027, titre VII (art. 27 à 31) et art. 87 §2.
// ─────────────────────────────────────────────────────────────────────────────

import db from '../db/index.js';

/**
 * LA BASE DE LA DÉCISION — ANNEXE 2 DE LA PROCÉDURE.
 *
 * Elle n'est pas décorative : c'est elle qui part dans eProm, et c'est elle
 * qui dit au vérificateur POURQUOI la dispense tient. Une décision accordée
 * sans base n'est pas encodable, donc pas conforme — c'est exactement ce qui
 * s'est produit.
 */
export const BASES = [
  { code: 'V1', famille: 'VAF',
    libelle: "Titre d'enseignement des 3 Communautés ou équivalent (IFAPME / EFP)" },
  { code: 'V2', famille: 'VAF', libelle: "Unité d'acquis d'apprentissage (UAA) du SFMQ" },
  { code: 'V3', famille: 'VAF', libelle: 'Titre de compétence (validation des compétences)' },
  { code: 'V4', famille: 'VAF', libelle: 'Convention automatique de valorisation' },
  { code: 'D',  famille: 'VANFI', libelle: 'Acquis non formels / informels — décision sur dossier' },
  { code: 'E',  famille: 'VANFI', libelle: 'Acquis non formels / informels — décision après épreuve ou test' },
];
export const CODES_BASE = BASES.map(b => b.code);

/** Les trois finalités de l'AGCF, dans les mots de l'arrêté. */
export const FINALITES = [
  { val: 'admission', label: 'Admission',
    aide: "Capacités préalables requises — l'étudiant suit l'UE et en présente les évaluations (art. 2)" },
  { val: 'partielle', label: 'Dispense partielle',
    aide: "Certaines activités d'enseignement — il reste inscrit et présente le reste (art. 3)" },
  { val: 'complete', label: 'Dispense complète',
    aide: "Tous les acquis de l'UE — attestation « Valorisation » possible (art. 4)" },
];

/**
 * LES ÉTATS DU DOSSIER, DANS L'ORDRE DE LA PROCÉDURE.
 *
 * Ils ne se choisissent pas dans une liste : ils se DÉDUISENT de ce qui a
 * réellement été fait. Un état qu'on peut poser à la main est un état qu'on
 * peut poser à tort, et c'est précisément la faute qu'on cherche à empêcher.
 */
export const ETATS = [
  { val: 'introduite',   label: 'Introduite',    aide: 'Reçue, recevabilité pas encore contrôlée' },
  { val: 'irrecevable',  label: 'Irrecevable',   aide: 'Refus de forme — hors délai ou dossier incomplet' },
  { val: 'recevable',    label: 'Recevable',     aide: "En attente de l'avis du chargé de cours" },
  { val: 'avis_rendu',   label: 'Avis rendu',    aide: 'En attente de la décision du Conseil des études' },
  { val: 'decidee',      label: 'Décidée',       aide: "Décision prise — à notifier à l'étudiant" },
  { val: 'notifiee',     label: 'Notifiée',      aide: 'À encoder dans eProm' },
  { val: 'encodee',      label: 'Encodée',       aide: 'Encodée dans eProm — à archiver' },
  { val: 'archivee',     label: 'Archivée',      aide: 'PV et pièces conservés (4 ans)' },
];

/**
 * L'ÉTAT SE DÉDUIT, IL NE SE DÉCLARE PAS.
 *
 * On lit les traces dans l'ordre inverse du circuit : le dernier geste posé
 * donne l'état. Un dossier importé avant cette version n'a aucune trace ; il
 * ressort « introduite », et l'écran dira ce qui lui manque — plutôt que de le
 * faire passer pour complet.
 */
export function etatDeduit(v) {
  if (!v) return 'introduite';
  if (v.archive_le) return 'archivee';
  if (v.eprom_le) return 'encodee';
  if (v.notifie_le) return 'notifiee';
  if (v.decision_le) return 'decidee';
  if (v.recevable === 0) return 'irrecevable';
  if (v.avis_le) return 'avis_rendu';
  if (v.recevable === 1) return 'recevable';
  return 'introduite';
}

/**
 * CE QUI NE PEUT JAMAIS ÊTRE VALORISÉ.
 *
 * Quatre exclusions, et elles ne se négocient pas (AGCF art. 4 §3 ;
 * RDE/ROI IIP art. 31) :
 *   1° l'épreuve intégrée — elle doit toujours être présentée ;
 *   2° les UE qui ne comportent pas de prestations d'étudiants ;
 *   3° les UE dont une réglementation spécifique impose qu'elles soient suivies ;
 *   4° à l'IIP, la méthodologie de la recherche, partie intégrante du programme.
 *
 * La première se reconnaît toute seule — Lucie sait déjà quelle unité porte
 * l'épreuve intégrée. Les trois autres dépendent du programme : elles se
 * cochent sur l'unité, avec leur motif, et ce motif s'imprime tel quel. Les
 * écrire en dur ferait mentir Lucie dès la première section qui change.
 *
 * Les UE de STAGE ne sont pas exclues, mais elles sont limitées : seule la
 * partie pratique peut être valorisée, le rapport est toujours rendu et
 * présenté. C'est un avertissement, pas un blocage — le Conseil décide.
 */
export function uniteValorisable(ueNum, annee) {
  /* LA COLONNE PEUT NE PAS ÊTRE LÀ, ET UN GARDE-FOU QUI TOMBE NE GARDE RIEN.
   *
   * Les deux drapeaux sont posés par des migrations additives. Or il a été
   * constaté, sur une base neuve, que le bloc de migration global peut
   * s'interrompre en cours de route : tout ce qui suit l'erreur n'est jamais
   * appliqué, en silence. Une requête écrite en dur sur ces colonnes rendait
   * alors une erreur 500 à CHAQUE valorisation — le contrôle ne protégeait
   * plus, il bloquait tout. On lit donc ce que la table porte réellement. */
  const colonnes = new Set(
    db.prepare('PRAGMA table_info(ue)').all().map(c => c.name));
  const champ = (nom, defaut) => (colonnes.has(nom) ? `COALESCE(${nom}, ${defaut})` : String(defaut));
  const texte = nom => (colonnes.has(nom) ? nom : 'NULL');
  const choix = `
    SELECT ue_num, ue_nom, section, ects, ue_niveau,
           ${champ('is_epreuve_integree', 0)} AS epreuve_integree,
           ${champ('valorisation_exclue', 0)} AS exclue,
           ${texte('valorisation_exclue_motif')} AS motif_exclusion
    FROM ue`;

  const u = db.prepare(`${choix} WHERE ue_num = ? AND annee_scolaire = ? LIMIT 1`)
      .get(Number(ueNum), annee)
    || db.prepare(`${choix} WHERE ue_num = ? ORDER BY annee_scolaire DESC LIMIT 1`)
      .get(Number(ueNum));

  if (!u) {
    return { ok: false, unite: null,
      motif: `L'unité ${ueNum} n'existe pas dans le référentiel.` };
  }
  if (u.epreuve_integree) {
    return { ok: false, unite: u,
      motif: `L'unité ${u.ue_num} porte l'épreuve intégrée : elle ne peut jamais `
           + `faire l'objet d'une valorisation — elle doit toujours être présentée `
           + `(AGCF du 13.12.2024, art. 4 §3, 1°).` };
  }
  if (u.exclue) {
    return { ok: false, unite: u,
      motif: u.motif_exclusion
        ? `L'unité ${u.ue_num} est exclue de la valorisation : ${u.motif_exclusion}`
        : `L'unité ${u.ue_num} est exclue de la valorisation (AGCF du 13.12.2024, art. 4 §3).` };
  }
  return { ok: true, unite: u, motif: null };
}

/**
 * LE DÉLAI D'INTRODUCTION — RDE/ROI IIP, ART. 28.
 *
 * UE annuelle : au plus tard le quinzième jour suivant le premier jour de
 * l'année académique. UE commençant à un autre moment : avant le premier jour
 * de cours de l'UE. Et si la date d'envoi du courriel est postérieure à la
 * date portée sur le formulaire, c'est la date d'ENVOI qui est retenue — sans
 * quoi il suffirait d'antidater le formulaire.
 *
 * Lucie SIGNALE, elle ne décide pas : une demande hors délai peut être
 * déclarée irrecevable par la coordination, c'est son geste et il se motive.
 * Mais il ne peut plus être posé sans savoir.
 */
export function controleDelai({ ueNum, annee, date_demande, date_reception }) {
  const retenue = [date_demande, date_reception].filter(Boolean).sort().pop() || null;
  if (!retenue) {
    return { connu: false, hors_delai: null, echeance: null,
      explication: "La date d'introduction n'est pas renseignée : le délai ne peut pas être contrôlé." };
  }

  // L'ouverture de l'unité, quand elle est encodée, fait l'échéance.
  let ouverture = null;
  try {
    const o = db.prepare(`
      SELECT date_debut FROM organisation_ue
      WHERE ue_num = ? AND annee_scolaire = ? AND date_debut IS NOT NULL LIMIT 1
    `).get(Number(ueNum), annee);
    ouverture = o?.date_debut || null;
  } catch { /* la table peut ne pas exister sur une base ancienne */ }

  if (ouverture) {
    return {
      connu: true, hors_delai: retenue >= ouverture, echeance: ouverture,
      date_retenue: retenue,
      explication: `L'unité ouvre le ${ouverture} : la demande doit être introduite `
        + `AVANT le premier jour de cours (RDE art. 28).`,
    };
  }

  // À défaut, la règle des UE annuelles : le quinzième jour après le premier
  // jour de l'année académique. On prend le 1er septembre du millésime — c'est
  // la date de référence de l'établissement, et elle est vérifiable.
  const debut = Number(String(annee).slice(0, 4));
  if (!debut) {
    return { connu: false, hors_delai: null, echeance: null,
      explication: "L'année académique n'est pas lisible : le délai ne peut pas être contrôlé." };
  }
  const d = new Date(Date.UTC(debut, 8, 1));
  d.setUTCDate(d.getUTCDate() + 15);
  const echeance = d.toISOString().slice(0, 10);
  return {
    connu: true, hors_delai: retenue > echeance, echeance, date_retenue: retenue,
    explication: `UE annuelle : au plus tard le quinzième jour suivant le premier `
      + `jour de l'année académique, soit le ${echeance} (RDE art. 28).`,
  };
}

/**
 * CE QUI MANQUE AU DOSSIER, ÉTAPE PAR ÉTAPE.
 *
 * Une seule fonction, lue par l'écran ET par les barrières. Deux listes de
 * contrôles — l'une pour afficher, l'autre pour refuser — finiraient par
 * différer, et c'est celle qu'on ne regarde pas qui laisserait passer la
 * pièce fausse.
 */
export function manquesDossier(v) {
  const m = [];
  if (!v) return ['Dossier introuvable.'];

  if (!v.date_demande && !v.date_reception) {
    m.push("La date d'introduction de la demande n'est pas renseignée.");
  }
  if (v.recevable == null) {
    m.push("La recevabilité n'a pas été contrôlée (étape 3).");
  }
  if (v.recevable === 0 && !String(v.motif_irrecevabilite || '').trim()) {
    m.push('Le motif de forme de l’irrecevabilité manque.');
  }
  if (v.recevable === 1 && !v.avis_le) {
    m.push("L'avis écrit et motivé du chargé de cours manque (étape 4).");
  }
  if (v.recevable === 1 && v.avis_le && !String(v.avis_texte || '').trim()) {
    m.push("L'avis du chargé de cours est enregistré sans motivation écrite.");
  }

  /* UN POURCENTAGE QUI N'EST PAS 50 EST UNE PIÈCE IRRÉGULIÈRE, DÉCIDÉE OU NON.
   *
   * Le verrou posé à l'écriture protège ce qui s'encode à partir d'ici ; il ne
   * répare pas ce qui a déjà été écrit du temps où le champ était libre — et
   * c'est précisément une de ces lignes-là qui est partie sur une attestation.
   * Le contrôle est donc POSÉ AVANT celui de la décision : un dossier ancien
   * n'a pas de date de décision, et le ranger derrière cette condition l'aurait
   * rendu muet exactement sur les dossiers qu'il doit rattraper. */
  if (v.decision !== 'refusee' && v.type !== 'admission'
      && v.pourcentage != null && Number(v.pourcentage) !== POURCENTAGE_DISPENSE) {
    m.push(`Le pourcentage est de ${v.pourcentage} % alors que la réussite d'une `
      + `dispense est fixée à ${POURCENTAGE_DISPENSE} % (RDE art. 29 §3 et 30).`);
  }

  const refus = v.decision === 'refusee';
  if (v.decision_le) {
    // UNE DÉCISION ACCORDÉE SANS BASE N'EST PAS ENCODABLE, DONC PAS CONFORME.
    if (!refus && !CODES_BASE.includes(String(v.base_code || ''))) {
      m.push('La base de la décision (VAF V1-V4 ou VANFI D/E) n’est pas renseignée.');
    }
    // CHAQUE DÉCISION SE MOTIVE PAR ÉCRIT, « en particulier les refus et les
    // accords partiels ». Les décisions de VA ne sont pas susceptibles de
    // recours (RDE art. 30 et 87 §2) : la motivation est tout ce qui reste.
    if (refus && !String(v.motif_refus || '').trim()) {
      m.push('Le refus n’est pas motivé (RDE art. 88 §3).');
    }
    if (!refus && v.type === 'partielle' && !String(v.commentaire || '').trim()
        && !Number(v.nb_equivalences || 0)) {
      m.push("L'accord partiel n'est motivé nulle part : ni constat d'équivalence, "
           + 'ni remarque du Conseil.');
    }
  } else {
    m.push("La décision du Conseil des études n'est pas enregistrée (étape 6).");
  }
  return m;
}

/**
 * LA BARRIÈRE DE PRODUCTION.
 *
 * C'est le cœur de la correction. Une attestation de réussite « Valorisation »
 * et un procès-verbal portent la signature du Conseil et le cachet de
 * l'établissement : ils n'ont pas à être produisibles depuis un dossier que
 * personne n'a instruit. Le serveur refuse, et il NOMME ce qui manque — un
 * refus muet se contourne, un refus nommé se corrige.
 *
 * `strict` distingue les deux usages : produire la pièce (strict) exige tout ;
 * la lire à l'écran n'exige rien et se contente d'afficher les manques.
 */
export function pieceProduisible(v) {
  const manques = manquesDossier(v);
  if (v?.recevable === 0) {
    manques.unshift("Le dossier a été déclaré irrecevable : aucune attestation ne s'en tire.");
  }
  if (v?.decision === 'refusee') {
    manques.unshift("La décision est un refus : aucune attestation de réussite ne s'en tire.");
  }
  if (v?.type !== 'complete') {
    manques.unshift("L'attestation « Valorisation » ne se délivre que sur dispense "
      + 'COMPLÈTE (AGCF du 13.12.2024, art. 4 §3).');
  }
  return { ok: manques.length === 0, manques };
}

/**
 * ÉCRIRE AU JOURNAL. PAR AJOUT, TOUJOURS.
 *
 * Aucune route ne modifie ni n'efface ces lignes, administrateur compris : une
 * trace qu'on peut corriger ne prouve rien. C'est la suite des gestes — qui, à
 * quelle heure, dans quel ordre — qui révèle une procédure contournée ; l'état
 * final, lui, ressemble toujours à un dossier normal.
 */
export function journaliser(vid, etape, req, detail = null) {
  try {
    db.prepare(`
      INSERT INTO valorisation_journal
        (valorisation_id, etape, acteur_id, acteur_nom, acteur_role, detail)
      VALUES (?,?,?,?,?,?)
    `).run(Number(vid), String(etape),
           req?.user?.id ?? null,
           req?.user?.nom || req?.user?.email || null,
           req?.user?.role || null,
           detail ? String(detail) : null);
  } catch (e) {
    // Le journal est une garantie, pas un point de panne : une écriture qui
    // échoue ne doit pas faire perdre la décision que l'utilisateur vient de
    // prendre. Elle se voit dans les logs du serveur.
    console.error('[valorisation] journal :', e.message);
  }
}

/** Le journal d'un dossier, dans l'ordre où les gestes ont été posés. */
export function journalDe(vid) {
  try {
    return db.prepare(`
      SELECT id, horodatage, etape, acteur_nom, acteur_role, detail
      FROM valorisation_journal WHERE valorisation_id = ? ORDER BY id
    `).all(Number(vid));
  } catch { return []; }
}

/** L'état écrit suit l'état déduit — on ne les laisse pas diverger. */
export function rafraichirEtat(vid) {
  const v = db.prepare('SELECT * FROM etudiant_valorisation WHERE id = ?').get(Number(vid));
  if (!v) return null;
  const etat = etatDeduit(v);
  try { db.prepare('UPDATE etudiant_valorisation SET etat = ? WHERE id = ?').run(etat, Number(vid)); }
  catch { /* colonne absente sur une base non migrée */ }
  return etat;
}

/**
 * LE SEUIL DE RÉUSSITE D'UNE DISPENSE EST DE 50 %, ET IL NE SE SAISIT PAS.
 *
 * « En cas de dispense (partielle ou complète), la réussite est fixée à 50 % »
 * (RDE art. 29 §3 et 30). C'était un champ libre, pré-rempli à 50 : un chiffre
 * modifiable finit par être modifié, et il part sur une attestation signée.
 * Un refus ne porte aucun pourcentage, et l'admission n'en porte pas non plus —
 * elle n'est pas une réussite, l'étudiant présentera les évaluations de l'UE.
 */
export const POURCENTAGE_DISPENSE = 50;
export function pourcentageDe({ decision, type }) {
  if (decision === 'refusee') return null;
  if (type === 'admission') return null;
  return POURCENTAGE_DISPENSE;
}
