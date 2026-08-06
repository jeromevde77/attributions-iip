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
          SELECT o.id, o.ue_num, o.section, o.date_debut, o.date_fin
          FROM organisation_ue o
          WHERE o.annee_scolaire = ? AND o.date_debut IS NOT NULL AND o.date_fin IS NOT NULL`;
        if (type.filtre_source === 'epreuve_integree') {
          sql += ` AND EXISTS (SELECT 1 FROM ue u WHERE u.ue_num = o.ue_num
                               AND u.annee_scolaire = o.annee_scolaire
                               AND u.is_epreuve_integree = 1)`;
        }
        const ues = db.prepare(sql).all(anneeScolaire);
        for (const ue of ues) {
          const ctx = { ...ctxBase, ancres: { ue_debut: ue.date_debut, ue_fin: ue.date_fin } };
          for (const d of calculerDates(regle, ctx)) {
            ajouter(type, d.date_due, {
              libelle: `UE ${ue.ue_num}${ue.section ? ' — ' + ue.section : ''}`,
              source_type: 'organisation_ue', source_id: ue.id,
            });
          }
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

      // Les autres ancres (engagement, publication, deliberation, contrat_fin,
      // evenement) sont déclenchées à l'événement, pas en masse.
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
  const notifier = db.prepare(`
    INSERT INTO lucie_notification
      (type, titre, corps, lien, cible_role, cible_user_id, cree_par)
    VALUES ('echeance_rappel', ?, ?, ?, ?, ?, 'systeme')
  `);

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
    );
    tracer.run(e.id, cle, userId);
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
