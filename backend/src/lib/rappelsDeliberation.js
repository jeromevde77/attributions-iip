// ─────────────────────────────────────────────────────────────────────────────
// LES RAPPELS DE LA DÉLIBÉRATION (3.1.523, étape 2 — analyse : docs/contexte/analyse-rappels-2026-10-30.md, P1 à P4,
// C1, C4, S1, S2, D3). Tranché par Charles le 30 octobre 2026 : la date est rappelée à J-10 et J-3, le DERNIER DÉLAI
// d'encodage des points est J-2 ; délai dépassé → copie à la coordination de la section ; sans date de séance,
// seulement l'alerte « date à poser » (secrétariat et coordination, 15 jours avant la fin de l'UE).
//
// Tout part par la file de lib/rappels.js (ordinaire → le matin ; urgent → aussitôt). Le doublon est empêché par
// `rappel_envoye` (canal 'email', une ligne par objet, jalon et personne). Ce qui reste à encoder vient de
// `resteAEncoder()` (routes/mesCours.js) : la règle même de l'écran Mes cours.
// ─────────────────────────────────────────────────────────────────────────────
import db from '../db/index.js';
import { mettreEnFile, comptesDuRole } from './rappels.js';
import { resteAEncoder } from '../routes/mesCours.js';

const DIRECTION = ['admin', 'directeur', 'directeur_adjoint'];
const jourFr = d => String(d || '').slice(0, 10).split('-').reverse().join('/');

/** Aujourd'hui à Bruxelles (AAAA-MM-JJ). */
function aujourdhui() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('fr-BE', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date()).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
/** Jours de `a` à `b` (b - a), dates AAAA-MM-JJ. */
const ecart = (a, b) => Math.round((Date.UTC(...b.split('-').map((x, i) => Number(x) - (i === 1 ? 1 : 0)))
  - Date.UTC(...a.split('-').map((x, i) => Number(x) - (i === 1 ? 1 : 0)))) / 864e5);
const decaler = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

/** La section d'une UE pour une année (et une organisation). */
function sectionDe(ueNum, annee, org) {
  return db.prepare(`SELECT section FROM organisation_ue WHERE ue_num = ? AND annee_scolaire = ?
      AND (? = 0 OR num_organisation = ?) AND section IS NOT NULL ORDER BY num_organisation LIMIT 1`).get(ueNum, annee, org, org)?.section
    || db.prepare(`SELECT section FROM ue WHERE ue_num = ? AND section IS NOT NULL ORDER BY (annee_scolaire = ?) DESC LIMIT 1`).get(ueNum, annee)?.section
    || null;
}

/** Déposer une fois (objet, jalon, personne). */
function deposerUneFois({ cibleType, cibleId, jalon, utilisateurId, cle, titre, detail, lien, urgent }) {
  const deja = db.prepare(`SELECT 1 FROM rappel_envoye WHERE cible_type = ? AND cible_id = ? AND jalon = ? AND canal = 'email'
      AND IFNULL(user_id, 0) = IFNULL(?, 0)`).get(cibleType, cibleId, jalon, utilisateurId);
  if (deja) return false;
  if (!mettreEnFile({ utilisateurId, cle, titre, detail, lien, urgent })) return false;
  db.prepare(`INSERT OR IGNORE INTO rappel_envoye (cible_type, cible_id, jalon, user_id, canal) VALUES (?,?,?,?, 'email')`)
    .run(cibleType, cibleId, jalon, utilisateurId);
  return true;
}

/** Le passage : à lancer plusieurs fois par jour, il ne dépose que ce qui est dû et pas encore parti. */
export function genererRappelsDeliberation(annee) {
  const auj = aujourdhui();
  const stats = { professeurs: 0, coordination: 0, date_a_poser: 0, non_closes: 0 };
  let seances = [];
  try {
    seances = db.prepare(`SELECT id, ue_num, session, num_organisation AS org, date_seance FROM deliberation_seance
      WHERE annee_scolaire = ? AND COALESCE(cloturee, 0) = 0 AND COALESCE(reprise, 0) = 0 AND date_seance IS NOT NULL`).all(annee);
  } catch { return stats; }

  const nomUE = n => db.prepare(`SELECT ue_nom FROM ue WHERE ue_num = ? AND ue_nom IS NOT NULL ORDER BY (annee_scolaire = ?) DESC LIMIT 1`).get(n, annee)?.ue_nom || '';
  const comptesProf = db.prepare(`SELECT id FROM utilisateur WHERE professeur_id = ? AND COALESCE(actif, 1) = 1 AND email LIKE '%@%'`);
  const orgDe = db.prepare(`SELECT COALESCE(num_organisation, 1) o FROM etudiant_inscription WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?`);

  for (const s of seances) {
    const date = String(s.date_seance).slice(0, 10);
    const n = ecart(auj, date);                       // jours jusqu'à la séance (négatif : passée)
    const section = sectionDe(s.ue_num, annee, s.org);
    const ue = `UE ${s.ue_num}${nomUE(s.ue_num) ? ` — ${nomUE(s.ue_num)}` : ''}`;
    const sess = s.session === 2 ? ' (2ᵉ session)' : '';

    // ── LES PROFESSEURS DE L'UE : J-10, J-3 (la date), J-2 (dernier délai), J-1 et J (délai dépassé) ──
    const jalonProf = n === 10 ? 'J-10' : n === 3 ? 'J-3' : n === 2 ? 'J-2' : (n === 1 || n === 0) ? `depasse-${n}` : null;
    if (jalonProf) {
      const lignes = db.prepare(`SELECT DISTINCT a.professeur_id, a.code_cours, p.nom, p.prenom,
          (SELECT c.cours_nom FROM cours c WHERE c.cours_code = a.code_cours ORDER BY (c.annee_scolaire = ?) DESC LIMIT 1) AS cours_nom
        FROM attribution a JOIN professeur p ON p.id = a.professeur_id
        WHERE a.annee_scolaire = ? AND a.ue_num = ? AND a.code_cours IS NOT NULL
          AND (? = 0 OR COALESCE(a.num_organisation, 1) = ?)`).all(annee, annee, s.ue_num, s.org, s.org);
      const enRetard = [];
      for (const l of lignes) {
        let reste = [];
        try { reste = resteAEncoder(l.professeur_id, l.code_cours, annee, s.session); } catch { reste = []; }
        if (s.org) reste = reste.filter(e => (orgDe.get(e.id, annee, s.ue_num)?.o ?? 1) === s.org);
        const cours = `${l.cours_nom || l.code_cours} (${l.code_cours})`;
        const lien = `/mes-cours?cours=${encodeURIComponent(l.code_cours)}${s.session === 2 ? '&session=2' : ''}`;
        let titre = null, detail = null, urgent = false;
        if (jalonProf === 'J-10' || jalonProf === 'J-3') {
          titre = `Délibération de l'${ue}${sess} le ${jourFr(date)} — dans ${n} jours`;
          detail = reste.length
            ? `${cours} : ${reste.length} étudiant(s) encore à encoder. Dernier délai pour vos points : le ${jourFr(decaler(date, -2))}.`
            : `${cours} : vos points sont encodés.`;
        } else if (reste.length && jalonProf === 'J-2') {
          titre = `Dernier délai aujourd'hui — points de ${cours}`;
          detail = `${reste.length} étudiant(s) sans note complète ; délibération de l'${ue}${sess} le ${jourFr(date)}.`;
          urgent = true;
        } else if (reste.length) {
          titre = `Délai dépassé — points de ${cours}`;
          detail = `${reste.length} étudiant(s) sans note complète ; délibération de l'${ue}${sess} ${n === 0 ? "aujourd'hui" : 'demain'}.`;
          urgent = true;
        }
        if (reste.length && jalonProf.startsWith('depasse')) enRetard.push(`${String(l.nom || '').toUpperCase()} ${l.prenom || ''} : ${cours}, ${reste.length} étudiant(s)`);
        if (!titre) continue;
        for (const u of comptesProf.all(l.professeur_id)) {
          if (deposerUneFois({ cibleType: 'deliberation_seance', cibleId: s.id, jalon: `${jalonProf}|${l.code_cours}`, utilisateurId: u.id,
            cle: 'deliberation_professeurs', titre, detail, lien, urgent })) stats.professeurs++;
        }
      }
      // ── LA COPIE À LA COORDINATION DE LA SECTION, QUAND LE DÉLAI EST DÉPASSÉ ──
      if (enRetard.length) {
        for (const uid of comptesDuRole('coordination', section)) {
          if (deposerUneFois({ cibleType: 'deliberation_seance', cibleId: s.id, jalon: jalonProf, utilisateurId: uid,
            cle: 'deliberation_coordination', titre: `Encodage incomplet — ${ue}${sess}, délibération le ${jourFr(date)}`,
            detail: enRetard.join(' · '), lien: '/etudiants', urgent: true })) stats.coordination++;
        }
      }
    }

    // ── LA SÉANCE PASSÉE ET NON CLOSE : J+2, puis chaque semaine ──
    if (n <= -2) {
      const jalon = `non-close-s${Math.floor((-n - 2) / 7)}`;
      const dest = new Set([...comptesDuRole('secretariat'), ...comptesDuRole('coordination', section),
        ...DIRECTION.flatMap(r => comptesDuRole(r))]);
      for (const uid of dest) {
        if (deposerUneFois({ cibleType: 'deliberation_seance', cibleId: s.id, jalon, utilisateurId: uid, cle: 'deliberation_non_close',
          titre: `Séance non close — ${ue}${sess}, tenue le ${jourFr(date)}`,
          detail: `La délibération date de ${-n} jour(s) et n'est pas close : les résultats ne sont ni publiés ni déposés aux étudiants.`,
          lien: '/etudiants', urgent: false })) stats.non_closes++;
      }
    }
  }

  // ── « DATE À POSER » : l'UE se termine dans 15 jours au plus et aucune séance de première session n'est datée ──
  let ues = [];
  try {
    ues = db.prepare(`SELECT o.id, o.ue_num, o.num_organisation AS org, o.section, o.date_fin FROM organisation_ue o
      WHERE o.annee_scolaire = ? AND o.date_fin IS NOT NULL AND o.date_fin BETWEEN ? AND ?
        AND NOT EXISTS (SELECT 1 FROM deliberation_seance s WHERE s.ue_num = o.ue_num AND s.annee_scolaire = o.annee_scolaire
          AND s.session = 1 AND (s.num_organisation = 0 OR s.num_organisation = o.num_organisation)
          AND (s.date_seance IS NOT NULL OR COALESCE(s.cloturee, 0) = 1))`).all(annee, auj, decaler(auj, 15));
  } catch { ues = []; }
  for (const o of ues) {
    const ue = `UE ${o.ue_num}${nomUE(o.ue_num) ? ` — ${nomUE(o.ue_num)}` : ''}${o.org > 1 ? ` · org ${o.org}` : ''}`;
    const dest = new Set([...comptesDuRole('secretariat'), ...comptesDuRole('coordination', o.section)]);
    for (const uid of dest) {
      if (deposerUneFois({ cibleType: 'organisation_ue', cibleId: o.id, jalon: 'date_a_poser', utilisateurId: uid, cle: 'deliberation_date_a_poser',
        titre: `Date de délibération à poser — ${ue}`,
        detail: `L'unité se termine le ${jourFr(o.date_fin)} et aucune séance n'est datée : les professeurs ne reçoivent leurs rappels qu'une fois la date posée.`,
        lien: '/etudiants', urgent: false })) stats.date_a_poser++;
    }
  }
  return stats;
}
