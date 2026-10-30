// ─────────────────────────────────────────────────────────────────────────────
// Lucie V3++ — Moteur de l'échéancier
//
// Trois opérations, exécutées au démarrage puis chaque nuit :
//   1. instancier(annee)      : crée les échéances de l'année depuis le référentiel
//                               et depuis les données existantes (UE, engagements…)
//   2. recalculerStatuts()    : passe en 'en_retard' ce qui est dépassé
//   3. genererRappels()       : écrit dans lucie_notification (sans doublon)
//
// Le moteur ne duplique aucune donnée : il LIT organisation_ue, professeur,
// ea12, absence_personnel… et ÉCRIT uniquement dans echeance / lucie_notification.
// ─────────────────────────────────────────────────────────────────────────────

import {
  calculerDates, chargerPeriodesConges, anneeDebutDe, iso, diffJours, ajouterJours,
} from './echeancier_dates.js';
import { DATES_GEDI } from '../db/migrations_echeancier.js';
import { premierDixiemeUE } from '../lib/datesReelles.js';
import { mettreEnFile, comptesDuRole } from '../lib/rappels.js';

const aujourdhui = () => iso(new Date());

// ─────────────────────────────────────────────────────────────────────────────
// 1. INSTANCIATION
// ─────────────────────────────────────────────────────────────────────────────

export function instancier(db, anneeScolaire, { verbose = false } = {}) {
  const stats = { crees: 0, existants: 0, ignores: 0 };
  const anneeDebut = anneeDebutDe(anneeScolaire);
  const estEnConge = chargerPeriodesConges(db, anneeScolaire);
  const datesGedi = DATES_GEDI[anneeScolaire] || [];

  const types = db.prepare('SELECT * FROM echeance_type WHERE actif = 1').all();
  const insert = db.prepare(`
    INSERT INTO echeance
      (type_id, annee_scolaire, date_due, libelle_override, responsable_role,
       statut, source_type, source_id, genere_auto)
    VALUES (@type_id, @annee, @date_due, @libelle, @role, 'a_faire',
            @source_type, @source_id, @auto)
  `);

  function ajouter(type, date_due, { libelle = null, source_type = null, source_id = null, auto = 1 } = {}) {
    if (!date_due) return;
    try {
      insert.run({
        type_id: type.id, annee: anneeScolaire, date_due,
        libelle, role: type.responsable_defaut || null,
        source_type, source_id, auto,
      });
      stats.crees++;
      if (verbose) console.log(`   + ${date_due} ${type.code}${libelle ? ' — ' + libelle : ''}`);
    } catch (e) {
      // index unique → l'échéance existe déjà, c'est le comportement attendu
      if (String(e.message).includes('UNIQUE')) stats.existants++;
      else { stats.ignores++; console.error(`   ! ${type.code} : ${e.message}`); }
    }
  }

  const ctxBase = { anneeScolaire, anneeDebut, estEnConge, datesGedi };

  for (const type of types) {
    const regle = type.regle_date || '';

    // ── a) Règles sans source : dates fixes, mensuelles ──
    if (regle.startsWith('fixe:') || regle.startsWith('mensuel')) {
      for (const d of calculerDates(regle, ctxBase)) {
        ajouter(type, d.date_due, { libelle: d.libelle || null });
      }
      continue;
    }

    // ── b) Règles relatives : une échéance par objet source ──
    if (regle.startsWith('rel:')) {
      const ancre = /^rel:([a-z_]+)/.exec(regle)?.[1];

      // Jalons rattachés aux organisations d'UE
      if (ancre === 'ue_debut' || ancre === 'ue_fin') {
        // Certains jalons ne visent qu'un sous-ensemble d'UE (ex. les épreuves
        // intégrées pour la clôture des inscriptions — RGE art. 32).
        let sql = `
          SELECT o.id, o.ue_num, o.section, o.num_organisation, o.date_debut, o.date_fin
          FROM organisation_ue o
          WHERE o.annee_scolaire = ? AND o.date_debut IS NOT NULL AND o.date_fin IS NOT NULL`;
        if (type.filtre_source === 'epreuve_integree') {
          sql += ` AND EXISTS (SELECT 1 FROM ue u WHERE u.ue_num = o.ue_num
                               AND u.annee_scolaire = o.annee_scolaire
                               AND u.is_epreuve_integree = 1)`;
        }
        const ues = db.prepare(sql).all(anneeScolaire);
        // UN POURCENTAGE DE L'UE SE LIT DANS L'HORAIRE RÉEL (28 octobre 2026) : le
        // comptage au 1/10 tombe sur la séance la plus proche du dixième des séances,
        // comme le compte la vérificatrice ; à défaut de séances, sur les dates.
        const pc = /^rel:ue_debut\+(\d+)pc$/.exec(regle);
        for (const ue of ues) {
          const ctx = { ...ctxBase, ancres: { ue_debut: ue.date_debut, ue_fin: ue.date_fin } };
          const reel = pc ? premierDixiemeUE(ue.ue_num, anneeScolaire,
            { section: ue.section, numOrganisation: ue.num_organisation, pct: Number(pc[1]) }) : null;
          const dates = (reel ? [{ date_due: reel.date }] : calculerDates(regle, ctx)).map(d => d.date_due).filter(Boolean);
          for (const date_due of dates) {
            ajouter(type, date_due, {
              libelle: `UE ${ue.ue_num}${ue.section ? ' — ' + ue.section : ''}`,
              source_type: 'organisation_ue', source_id: ue.id,
            });
          }
          // UNE DATE D'UE QUI BOUGE NE LAISSE PAS SON ANCIEN JALON DERRIÈRE ELLE. La clé
          // d'unicité porte la date : changer les dates de l'UE (ou les aligner sur
          // l'horaire) ajoutait le nouveau jalon À CÔTÉ de l'ancien. On retire l'ancien
          // seulement s'il n'a jamais été touché — généré, à faire, sans commentaire,
          // ni fait, ni rattaché à une tâche.
          if (dates.length) try {
            stats.remplaces = (stats.remplaces || 0) + db.prepare(`DELETE FROM echeance
              WHERE type_id = ? AND annee_scolaire = ? AND source_type = 'organisation_ue' AND source_id = ?
                AND date_due NOT IN (${dates.map(() => '?').join(',')})
                AND genere_auto = 1 AND statut = 'a_faire' AND fait_le IS NULL AND COALESCE(commentaire, '') = ''
                AND responsable_user_id IS NULL
                AND NOT EXISTS (SELECT 1 FROM tache t WHERE t.echeance_id = echeance.id)`)
              .run(type.id, anneeScolaire, ue.id, ...dates).changes;
          } catch (e) { console.error(`   ! ${type.code} — ancien jalon de l'UE ${ue.ue_num} : ${e.message}`); }
        }
        continue;
      }

      // Jalons rattachés à une absence en cours
      if (ancre === 'absence_debut') {
        let absences = [];
        try {
          absences = db.prepare(`
            SELECT a.id, a.date_debut, a.type, p.nom, p.prenom
            FROM absence_personnel a JOIN professeur p ON p.id = a.professeur_id
            WHERE a.annee_scolaire = ?
          `).all(anneeScolaire);
        } catch { absences = []; }
        for (const a of absences) {
          const ctx = { ...ctxBase, ancres: { absence_debut: a.date_debut } };
          for (const d of calculerDates(regle, ctx)) {
            ajouter(type, d.date_due, {
              libelle: `${a.nom} ${a.prenom}`,
              source_type: 'absence', source_id: a.id,
            });
          }
        }
        continue;
      }

      // LA DÉLIBÉRATION ET LA PUBLICATION SE LISENT DES SÉANCES (3.1.522). Ces deux ancres attendaient un
      // `declencher()` que personne n'appelait : « publication des résultats » et les fenêtres de recours ne
      // naissaient jamais. Elles se lisent désormais de `deliberation_seance` — la date de séance posée, la date de
      // publication posée à la clôture —, quelle que soit la porte qui les a écrites. Comme pour les UE, un jalon
      // jamais touché suit la date quand elle change.
      if (ancre === 'deliberation' || ancre === 'publication') {
        const col = ancre === 'deliberation' ? 'date_seance' : 'publie_le';
        let seances = [];
        try {
          seances = db.prepare(`SELECT s.id, s.ue_num, s.session, s.num_organisation, s.${col} AS d,
              (SELECT o.section FROM organisation_ue o WHERE o.ue_num = s.ue_num AND o.annee_scolaire = s.annee_scolaire
                 AND (s.num_organisation = 0 OR o.num_organisation = s.num_organisation) ORDER BY o.num_organisation LIMIT 1) AS section
            FROM deliberation_seance s WHERE s.annee_scolaire = ? AND s.${col} IS NOT NULL AND COALESCE(s.reprise, 0) = 0`).all(anneeScolaire);
        } catch { seances = []; }
        for (const se of seances) {
          const ctx = { ...ctxBase, ancres: { [ancre]: String(se.d).slice(0, 10) } };
          // Un jalon déjà passé quand la séance l'engendre ne se crée pas : la reprise d'une année close ferait
          // pleuvoir des « en retard » sur des publications faites depuis longtemps.
          const dates = calculerDates(regle, ctx).map(d => d.date_due).filter(d => d && d >= aujourdhui());
          const precis = `${se.session === 2 ? '2e session' : '1re session'}${se.num_organisation ? ` · org ${se.num_organisation}` : ''}`;
          for (const date_due of dates) {
            ajouter(type, date_due, { libelle: `UE ${se.ue_num}${se.section ? ' — ' + se.section : ''} (${precis})`,
              source_type: 'deliberation_seance', source_id: se.id });
          }
          if (dates.length) try {
            db.prepare(`DELETE FROM echeance WHERE type_id = ? AND annee_scolaire = ? AND source_type = 'deliberation_seance'
                AND source_id = ? AND date_due NOT IN (${dates.map(() => '?').join(',')})
                AND genere_auto = 1 AND statut = 'a_faire' AND fait_le IS NULL AND COALESCE(commentaire, '') = ''
                AND responsable_user_id IS NULL AND NOT EXISTS (SELECT 1 FROM tache t WHERE t.echeance_id = echeance.id)`)
              .run(type.id, anneeScolaire, se.id, ...dates);
          } catch (e) { console.error(`   ! ${type.code} — séance ${se.id} : ${e.message}`); }
        }
        continue;
      }

      // Les autres ancres (engagement, contrat_fin, evenement) sont déclenchées à l'événement, pas en masse.
      continue;
    }

    // ── c) manuelle → rien à instancier ──
  }

  if (verbose) {
    console.log(`[echeancier] ${anneeScolaire} : ${stats.crees} créée(s), ${stats.existants} déjà présente(s)`);
  }
  return stats;
}

/**
 * Crée les échéances déclenchées par un événement ponctuel.
 * Appelée depuis les routes (engagement d'un candidat, délibération encodée…).
 * @param ancre  'engagement' | 'publication' | 'deliberation' | 'contrat_fin' | 'evenement'
 */
export function declencher(db, { ancre, dateRef, anneeScolaire, sourceType, sourceId, libelle }) {
  const anneeDebut = anneeDebutDe(anneeScolaire);
  const estEnConge = chargerPeriodesConges(db, anneeScolaire);
  const types = db.prepare(
    `SELECT * FROM echeance_type WHERE actif = 1 AND regle_date LIKE ?`
  ).all(`rel:${ancre}%`);

  const insert = db.prepare(`
    INSERT INTO echeance
      (type_id, annee_scolaire, date_due, libelle_override, responsable_role,
       statut, source_type, source_id, genere_auto)
    VALUES (?, ?, ?, ?, ?, 'a_faire', ?, ?, 1)
  `);

  let crees = 0;
  for (const type of types) {
    const ctx = { anneeScolaire, anneeDebut, estEnConge, ancres: { [ancre]: dateRef } };
    for (const d of calculerDates(type.regle_date, ctx)) {
      try {
        insert.run(type.id, anneeScolaire, d.date_due, libelle || null,
                   type.responsable_defaut || null, sourceType || null, sourceId || null);
        crees++;
      } catch { /* déjà présente */ }
    }
  }
  return crees;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. RECALCUL DES STATUTS
// ─────────────────────────────────────────────────────────────────────────────

export function recalculerStatuts(db) {
  const today = aujourdhui();
  const r1 = db.prepare(`
    UPDATE echeance SET statut = 'en_retard'
    WHERE statut = 'a_faire' AND date_due < ?
  `).run(today);
  // Une échéance repassée dans le futur (date corrigée) redevient à faire
  const r2 = db.prepare(`
    UPDATE echeance SET statut = 'a_faire'
    WHERE statut = 'en_retard' AND date_due >= ?
  `).run(today);
  let r3 = { changes: 0 };
  try {
    r3 = db.prepare(`UPDATE action SET statut = 'a_faire'
                     WHERE statut = 'a_faire' AND date_due < ?`).run(today);
  } catch { /* table action absente */ }
  return { en_retard: r1.changes, retablies: r2.changes, actions: r3.changes };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. GÉNÉRATION DES RAPPELS → lucie_notification
// ─────────────────────────────────────────────────────────────────────────────

export function genererRappels(db, { verbose = false } = {}) {
  const today = aujourdhui();
  let envoyes = 0;

  const echeances = db.prepare(`
    SELECT e.*, t.code, t.libelle AS type_libelle, t.rappels_defaut,
           t.base_legale, t.lien_interne, t.zone
    FROM echeance e JOIN echeance_type t ON t.id = e.type_id
    WHERE e.statut IN ('a_faire','en_retard')
      AND e.date_due BETWEEN date(?, '-60 days') AND date(?, '+60 days')
  `).all(today, today);

  const dejaEnvoye = db.prepare(`
    SELECT 1 FROM rappel_envoye
    WHERE cible_type='echeance' AND cible_id=? AND jalon=? AND canal='inapp'
      AND IFNULL(user_id,0)=IFNULL(?,0)
  `);
  const tracer = db.prepare(`
    INSERT INTO rappel_envoye (cible_type, cible_id, jalon, user_id, canal)
    VALUES ('echeance', ?, ?, ?, 'inapp')
  `);
  // LE RAPPEL PORTE LA SECTION DE SON UNITÉ (3.1.481) : adressé au rôle « coordination », il partait à toutes
  // les coordinations — celle de psychomotricité recevait les rappels de TIM. Le fil d'activité filtre dessus.
  marquerSectionNotifications(db);
  const notifier = db.prepare(`
    INSERT INTO lucie_notification
      (type, titre, corps, lien, cible_role, cible_user_id, cree_par, section)
    VALUES ('echeance_rappel', ?, ?, ?, ?, ?, 'systeme', ?)
  `);
  const sectionOrg = db.prepare(`SELECT o.section FROM organisation_ue o WHERE o.id = ?`);
  const sectionSeance = db.prepare(`SELECT o.section FROM deliberation_seance s JOIN organisation_ue o
    ON o.ue_num = s.ue_num AND o.annee_scolaire = s.annee_scolaire AND (s.num_organisation = 0 OR o.num_organisation = s.num_organisation)
    WHERE s.id = ? ORDER BY o.num_organisation LIMIT 1`);
  const sectionDe = e => (e.source_type === 'organisation_ue' ? sectionOrg.get(e.source_id)?.section
    : e.source_type === 'deliberation_seance' ? sectionSeance.get(e.source_id)?.section : null) || null;
  // LE COURRIEL (3.1.522) : chaque rappel de l'échéancier entre aussi dans la file des courriels — au responsable
  // nommé, sinon aux comptes de son rôle (une coordination : ses sections). Le jour J part aussitôt, le reste le matin.
  const dejaMail = db.prepare(`SELECT 1 FROM rappel_envoye WHERE cible_type='echeance' AND cible_id=? AND jalon=? AND canal='email'
      AND IFNULL(user_id,0)=IFNULL(?,0)`);
  const tracerMail = db.prepare(`INSERT OR IGNORE INTO rappel_envoye (cible_type, cible_id, jalon, user_id, canal) VALUES ('echeance', ?, ?, ?, 'email')`);

  for (const e of echeances) {
    const reste = diffJours(today, e.date_due);   // < 0 = en retard
    let jalon = null;
    if (reste < 0) jalon = 'retard';
    else if (reste === 0) jalon = 'jour_j';
    else {
      let rappels = [30, 7, 1];
      try { rappels = JSON.parse(e.rappels_defaut || '[30,7,1]'); } catch { /* défaut */ }
      if (rappels.includes(reste)) jalon = `J-${reste}`;
    }
    if (!jalon) continue;

    // Un rappel de retard est répété au maximum une fois par semaine
    const cle = jalon === 'retard'
      ? `retard-s${Math.floor(Math.abs(reste) / 7)}`
      : jalon;

    const userId = e.responsable_user_id || null;
    if (dejaEnvoye.get(e.id, cle, userId)) continue;

    const libelle = e.libelle_override
      ? `${e.type_libelle} — ${e.libelle_override}`
      : e.type_libelle;
    const quand = jalon === 'retard'
      ? `En retard de ${Math.abs(reste)} jour(s)`
      : jalon === 'jour_j' ? "C'est aujourd'hui"
      : `Dans ${reste} jour(s)`;
    const titre = `${quand} — ${libelle}`;
    const corps = `Échéance du ${formatFr(e.date_due)}.` +
                  (e.base_legale ? ` Base : ${e.base_legale}.` : '');

    notifier.run(
      titre, corps,
      e.lien_interne || '/echeancier',
      userId ? null : (e.responsable_role || 'admin'),
      userId,
      sectionDe(e),
    );
    tracer.run(e.id, cle, userId);
    try {
      const destinataires = userId ? [userId] : comptesDuRole(e.responsable_role || 'admin', sectionDe(e));
      for (const uid of destinataires) {
        if (dejaMail.get(e.id, cle, uid)) continue;
        if (mettreEnFile({ utilisateurId: uid, cle: 'echeancier', titre, detail: corps, lien: e.lien_interne || '/echeancier', urgent: jalon === 'jour_j' }))
          tracerMail.run(e.id, cle, uid);
      }
    } catch (err) { console.error('[echeancier] courriel :', err.message); }
    envoyes++;
    if (verbose) console.log(`   🔔 ${titre}`);
  }

  return { envoyes };
}

function formatFr(dateISO) {
  const [y, m, d] = String(dateISO).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cycle complet + planification
// ─────────────────────────────────────────────────────────────────────────────

export function cycleComplet(db, anneeScolaire, opts = {}) {
  const inst = instancier(db, anneeScolaire, opts);
  const stat = recalculerStatuts(db);
  const rap = genererRappels(db, opts);
  return { ...inst, ...stat, ...rap };
}

/** Année scolaire active (table annee_scolaire), sinon calcul par la date. */
export function anneeActive(db) {
  try {
    const r = db.prepare('SELECT code FROM annee_scolaire WHERE active = 1 LIMIT 1').get();
    if (r?.code) return r.code;
  } catch { /* table absente */ }
  const d = new Date();
  const y = d.getUTCFullYear();
  return d.getUTCMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

/**
 * Démarre le moteur : un passage au lancement (différé de 20 s pour ne pas
 * ralentir le démarrage) puis toutes les 6 heures.
 */
export function demarrerMoteur(db) {
  const passe = () => {
    try {
      const annee = anneeActive(db);
      const r = cycleComplet(db, annee);
      console.log(`[echeancier] ${annee} — ${r.crees} échéance(s) créée(s), ` +
                  `${r.en_retard} en retard, ${r.envoyes} rappel(s) émis`);
    } catch (e) {
      console.error('[echeancier] cycle :', e.message);
    }
  };
  setTimeout(passe, 20_000).unref?.();
  setInterval(passe, 6 * 3600 * 1000).unref?.();
}

export default { instancier, declencher, recalculerStatuts, genererRappels,
                 cycleComplet, anneeActive, demarrerMoteur };

/* LA COLONNE, ET LE RATTRAPAGE DES RAPPELS DÉJÀ ENVOYÉS (3.1.481). Un rappel ne garde pas l'identifiant de son
   échéance : on le retrouve à son intitulé, qui finit par celui de l'échéance (« … — <type> — <précision> »).
   Seuls les rappels encore sans section sont touchés ; une fois fait, rien ne se refait. */
export function marquerSectionNotifications(db) {
  const cols = db.prepare('PRAGMA table_info(lucie_notification)').all().map(c => c.name);
  if (!cols.includes('section')) db.exec('ALTER TABLE lucie_notification ADD COLUMN section TEXT');
  const reste = db.prepare(`SELECT COUNT(*) n FROM lucie_notification WHERE type = 'echeance_rappel' AND section IS NULL`).get().n;
  if (!reste) return;
  const ech = db.prepare(`SELECT e.libelle_override, t.libelle, o.section FROM echeance e JOIN echeance_type t ON t.id = e.type_id
    JOIN organisation_ue o ON o.id = e.source_id WHERE e.source_type = 'organisation_ue' AND o.section IS NOT NULL`).all();
  const maj = db.prepare(`UPDATE lucie_notification SET section = ? WHERE type = 'echeance_rappel' AND section IS NULL AND titre LIKE ?`);
  const vus = new Set();
  for (const e of ech) {
    const lib = e.libelle_override ? `${e.libelle} — ${e.libelle_override}` : e.libelle;
    const cle = `${lib}|${e.section}`;
    if (!e.libelle_override || vus.has(cle)) continue;   // sans précision, l'intitulé ne dit pas l'unité
    vus.add(cle);
    maj.run(e.section, `% — ${lib}`);
  }
}
