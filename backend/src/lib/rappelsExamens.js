// ─────────────────────────────────────────────────────────────────────────────
// LES RAPPELS DES EXAMENS (3.5.227, Charles, 8 novembre 2026 : « il faut des rappels aux enseignants et aux coordinations, mais en
// respectant la procédure »). La procédure est celle publiée dans Documentation : « Procédure pour l'organisation des examens
// 2026-2027 » (et non l'ancien Word 006 de 2024-2025).
//   · Le questionnaire au secrétariat (examens@…) un mois avant l'épreuve ; janvier : au plus tard le 1er décembre ; mai à
//     septembre : au plus tard le 15 avril ; celui de la 2e session EN MÊME TEMPS. Délai non respecté → signalé à la coordination.
//     Le secrétariat coche « questionnaire reçu » dans Examens : préparer et imprimer ; tant qu'il ne l'a pas fait, Lucie rappelle.
//   · La visite des copies : présence de l'enseignant indispensable → rappel la veille.
//   · L'archivage : les copies reviennent avec la feuille d'archivage après la visite → rappel le lendemain.
//   · La seconde session pas avant 10 jours après la délibération (7 jours après la visite des copies) → alerte au secrétariat et à
//     la coordination quand une épreuve de 2e session est datée trop tôt.
// L'encodage des notes (48 h avant la délibération) a déjà ses rappels (lib/rappelsDeliberation.js, J-2).
// ─────────────────────────────────────────────────────────────────────────────
import db from '../db/index.js';
import { mettreEnFile, comptesDuRole } from './rappels.js';
import { epreuves, delaiQuestionnaire } from './examens.js';

const jourFr = d => String(d || '').slice(0, 10).split('-').reverse().join('/');
function aujourdhui() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('fr-BE', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date()).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
const ecart = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 864e5);
const plus = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

function deposerUneFois({ cibleId, jalon, utilisateurId, cle, titre, detail, lien, urgent = false }) {
  const deja = db.prepare(`SELECT 1 FROM rappel_envoye WHERE cible_type = 'epreuve' AND cible_id = ? AND jalon = ? AND canal = 'email'
      AND IFNULL(user_id, 0) = IFNULL(?, 0)`).get(cibleId, jalon, utilisateurId);
  if (deja) return false;
  if (!mettreEnFile({ utilisateurId, cle, titre, detail, lien, urgent })) return false;
  db.prepare(`INSERT OR IGNORE INTO rappel_envoye (cible_type, cible_id, jalon, user_id, canal) VALUES ('epreuve', ?, ?, ?, 'email')`)
    .run(cibleId, jalon, utilisateurId);
  return true;
}

export function genererRappelsExamens(annee, { jour = null } = {}) {
  const auj = jour || aujourdhui();
  const stats = { questionnaires: 0, coordination: 0, visites: 0, archivage: 0, seconde_session: 0 };
  const profsDuCours = db.prepare(`SELECT DISTINCT u.id FROM attribution a JOIN utilisateur u ON u.professeur_id = a.professeur_id
    WHERE a.annee_scolaire = ? AND a.ue_num = ? AND (? = '' OR a.code_cours = ?) AND COALESCE(u.actif, 1) = 1 AND u.email LIKE '%@%'`);
  let seance = { get: () => null };
  try {
    seance = db.prepare(`SELECT date_seance, visite_date, visite_heure, visite_local FROM deliberation_seance
      WHERE annee_scolaire = ? AND ue_num = ? AND session = ? ORDER BY COALESCE(num_organisation, 0) LIMIT 1`);
  } catch { /* table d'une base ancienne : la visite se lit alors sur l'épreuve seule */ }
  // Un identifiant stable par épreuve (rappel_envoye attend un entier) : empreinte de la clé.
  const idDe = k => { let h = 0; for (const c of `${annee}|${k}`) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };

  for (const session of [1, 2]) {
    let liste = [];
    try { liste = epreuves({ annee, session }); } catch { liste = []; }
    for (const e of liste) {
      const date = String(e.date).slice(0, 10);
      const id = idDe(e.cle);
      const epreuve = `${e.cours_code ? `${e.cours_nom || e.cours_code} (${e.cours_code})` : `l'UE ${e.ue_num}`}`;
      const profs = (() => { try { return profsDuCours.all(annee, e.ue_num, e.cours_code, e.cours_code).map(x => x.id); } catch { return []; } })();

      // ── LE QUESTIONNAIRE (1re session ; il emporte celui de la 2e) ──
      if (session === 1 && !e.questionnaire_recu_le && date >= auj) {
        const delai = delaiQuestionnaire(date);
        const n = delai ? ecart(auj, delai) : null;
        const jalon = n === 7 ? 'quest-J-7' : n === 0 ? 'quest-J' : null;
        if (jalon) for (const uid of profs) {
          if (deposerUneFois({ cibleId: id, jalon, utilisateurId: uid, cle: 'examens_questionnaires', urgent: n === 0,
            titre: n === 0 ? `Aujourd'hui : questionnaire de ${epreuve} au secrétariat` : `Questionnaire de ${epreuve} : à remettre pour le ${jourFr(delai)}`,
            detail: `Épreuve du ${jourFr(date)}${e.heure ? ` à ${String(e.heure).slice(0, 5)}` : ''}. À envoyer à examens@institut-prigogine.be, sur la feuille à en-tête réglementaire, avec le questionnaire de la 2e session.`,
            lien: '/documentation' })) stats.questionnaires++;
        }
        // Délai dépassé sans questionnaire : la coordination de la section, une fois.
        if (n === -1) for (const uid of comptesDuRole('coordination', e.section)) {
          if (deposerUneFois({ cibleId: id, jalon: 'quest-depasse', utilisateurId: uid, cle: 'examens_questionnaires_coordination', urgent: true,
            titre: `Questionnaire non reçu — ${epreuve} (UE ${e.ue_num})`,
            detail: `Épreuve du ${jourFr(date)} ; délai du ${jourFr(delai)} dépassé. Professeur(s) : ${e.professeurs || '—'}.`,
            lien: '/organisation?onglet=examens' })) stats.coordination++;
        }
      }

      // ── LA VISITE DES COPIES (veille) ET L'ARCHIVAGE (lendemain) ──
      const sea = (() => { try { return seance.get(annee, e.ue_num, session); } catch { return null; } })();
      const visite = String(e.visite_date || sea?.visite_date || '').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(visite)) {
        const n = ecart(auj, visite);
        const h = e.visite_heure || sea?.visite_heure, l = e.visite_local || sea?.visite_local;
        if (n === 1) for (const uid of profs) {
          if (deposerUneFois({ cibleId: id, jalon: 'visite-J-1', utilisateurId: uid, cle: 'examens_visite',
            titre: `Demain : visite des copies — ${epreuve}`,
            detail: `Le ${jourFr(visite)}${h ? ` à ${String(h).slice(0, 5)}` : ''}${l ? `, ${l}` : ''}. Votre présence est indispensable : vous expliquez chaque acquis non atteint ; une correction collective est demandée.`,
            lien: '/mes-cours' })) stats.visites++;
        }
        if (n === -1) for (const uid of profs) {
          if (deposerUneFois({ cibleId: id, jalon: 'archivage', utilisateurId: uid, cle: 'examens_archivage',
            titre: `Copies de ${epreuve} à remettre pour l'archivage`,
            detail: `Après la visite des copies du ${jourFr(visite)} : les copies, le correctif et le registre, avec la feuille d'archivage, au secrétariat.`,
            lien: '/mes-cours' })) stats.archivage++;
        }
      }

      // ── LA SECONDE SESSION TROP TÔT : moins de 10 jours après la délibération de 1re session ──
      if (session === 2 && date >= auj) {
        const d1 = (() => { try { return String(seance.get(annee, e.ue_num, 1)?.date_seance || '').slice(0, 10); } catch { return ''; } })();
        if (/^\d{4}-\d{2}-\d{2}$/.test(d1) && date < plus(d1, 10)) {
          for (const uid of new Set([...comptesDuRole('secretariat'), ...comptesDuRole('coordination', e.section)])) {
            if (deposerUneFois({ cibleId: id, jalon: `s2-trop-tot|${date}`, utilisateurId: uid, cle: 'examens_seconde_session',
              titre: `2e session trop tôt — ${epreuve} (UE ${e.ue_num})`,
              detail: `Épreuve de 2e session le ${jourFr(date)}, délibération de 1re session le ${jourFr(d1)} : la procédure demande 10 jours au moins (7 après la visite des copies), soit pas avant le ${jourFr(plus(d1, 10))}.`,
              lien: '/organisation?onglet=planif-sessions' })) stats.seconde_session++;
          }
        }
      }
    }
  }
  return stats;
}
