// ─────────────────────────────────────────────────────────────────────────────
// LES RAPPELS DU PERSONNEL (3.1.524, étape 3 — analyse : docs/contexte/analyse-rappels-2026-10-30.md, P5 à P7, S4 à S9,
// C2, C3, D1, D2). Mêmes règles que les étapes 1 et 2 : tout passe par la file de lib/rappels.js (ordinaire → le matin,
// urgent → aussitôt), le doublon est empêché par `rappel_envoye` (canal 'email'), chaque rappel a son interrupteur.
//
// Ce qui se compte en masse (VA, absences, frais, aménagements) part en BILAN DU LUNDI : un chiffre par paquet et un
// lien, une fois par semaine — un rappel par dossier noierait le secrétariat. Ce qui attend UNE personne (une séance
// sans présences, un avis demandé, une proposition de PAE, un délai de procédure) lui part à elle.
// ─────────────────────────────────────────────────────────────────────────────
import db from '../db/index.js';
import { mettreEnFile, comptesDuRole } from './rappels.js';
import { alertesAbsences } from './alertesAbsences.js';
import { calculerFrais } from '../routes/fraisScolarite.js';
import { chargerDossier, chargesDeCours } from './piecesAmenagement.js';
import { DECIDE } from './circuitAR.js';
import { lireDossier } from './procedures.js';

const DIRECTION = ['admin', 'directeur', 'directeur_adjoint'];
const jourFr = d => String(d || '').slice(0, 10).split('-').reverse().join('/');
function aujourdhui() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('fr-BE', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date()).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
const utc = d => Date.UTC(...String(d).slice(0, 10).split('-').map((x, i) => Number(x) - (i === 1 ? 1 : 0)));
const ecart = (a, b) => Math.round((utc(b) - utc(a)) / 864e5);
const decaler = (d, n) => { const x = new Date(`${String(d).slice(0, 10)}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
/** Jours ouvrables (lundi-vendredi) écoulés de `depuis` (exclu) à `jusqua` (inclus). */
function ouvrables(depuis, jusqua) {
  let n = 0;
  for (let d = decaler(depuis, 1); d <= jusqua; d = decaler(d, 1)) { const j = new Date(`${d}T12:00:00Z`).getUTCDay(); if (j && j !== 6) n++; }
  return n;
}
const estLundi = d => new Date(`${d}T12:00:00Z`).getUTCDay() === 1;

function deposerUneFois({ cibleType, cibleId, jalon, utilisateurId, cle, titre, detail, lien, urgent = false }) {
  if (db.prepare(`SELECT 1 FROM rappel_envoye WHERE cible_type = ? AND cible_id = ? AND jalon = ? AND canal = 'email'
      AND IFNULL(user_id, 0) = IFNULL(?, 0)`).get(cibleType, cibleId, jalon, utilisateurId)) return false;
  if (!mettreEnFile({ utilisateurId, cle, titre, detail, lien, urgent })) return false;
  db.prepare(`INSERT OR IGNORE INTO rappel_envoye (cible_type, cible_id, jalon, user_id, canal) VALUES (?,?,?,?, 'email')`)
    .run(cibleType, cibleId, jalon, utilisateurId);
  return true;
}
const sectionDeUE = (ue, annee) => db.prepare(`SELECT section FROM organisation_ue WHERE ue_num = ? AND annee_scolaire = ? AND section IS NOT NULL
    ORDER BY num_organisation LIMIT 1`).get(ue, annee)?.section
  || db.prepare(`SELECT section FROM ue WHERE ue_num = ? AND section IS NOT NULL ORDER BY (annee_scolaire = ?) DESC LIMIT 1`).get(ue, annee)?.section || null;
const sectionEtudiant = id => db.prepare('SELECT section_rattachement s FROM etudiant WHERE id = ?').get(id)?.s || null;
const comptesProf = pid => db.prepare(`SELECT id FROM utilisateur WHERE professeur_id = ? AND COALESCE(actif, 1) = 1 AND email LIKE '%@%'`).all(pid).map(u => u.id);
const nomEtu = id => { const e = db.prepare('SELECT nom, prenom FROM etudiant WHERE id = ?').get(id) || {}; return `${String(e.nom || '').toUpperCase()} ${e.prenom || ''}`.trim(); };
const essayer = (nom, fn, stats) => { try { stats[nom] = fn(); } catch (e) { console.error(`[rappels personnel] ${nom} :`, e.message); stats[nom] = 'erreur'; } };

/* P5 — LES PRÉSENCES À COMPLÉTER : une séance passée (30 derniers jours) de SES cours sans aucune présence encodée.
   Le lendemain d'une séance oubliée ; sinon, le lundi, tant qu'il en reste. */
function presences(annee, auj) {
  let n = 0;
  const profs = db.prepare(`SELECT DISTINCT professeur_id p FROM utilisateur WHERE professeur_id IS NOT NULL AND COALESCE(actif, 1) = 1`).all().map(x => x.p);
  for (const pid of profs) {
    const seances = db.prepare(`SELECT s.id, s.date, s.cours_code,
        (SELECT c.cours_nom FROM cours c WHERE c.cours_code = s.cours_code ORDER BY (c.annee_scolaire = ?) DESC LIMIT 1) AS cours_nom
      FROM horaire_seance s
      WHERE s.date < ? AND s.date >= ? AND COALESCE(s.annule, 0) = 0
        AND (s.professeur_id = ? OR (s.professeur_id IS NULL AND s.cours_code IN
          (SELECT a.code_cours FROM attribution a WHERE a.professeur_id = ? AND a.annee_scolaire = ?)))
        AND NOT EXISTS (SELECT 1 FROM presence p WHERE p.seance_id = s.id)
      ORDER BY s.date`).all(annee, auj, decaler(auj, -30), pid, pid, annee);
    if (!seances.length) continue;
    const hier = seances.some(s => String(s.date).slice(0, 10) === decaler(auj, -1));
    if (!hier && !estLundi(auj)) continue;
    const jalon = `${hier ? 'jour' : 'semaine'}-${auj}`;
    const detail = seances.slice(-6).map(s => `${jourFr(s.date)} · ${s.cours_nom || s.cours_code}`).join(' — ')
      + (seances.length > 6 ? ` — et ${seances.length - 6} autre(s)` : '');
    for (const uid of comptesProf(pid)) {
      if (deposerUneFois({ cibleType: 'presences_prof', cibleId: pid, jalon, utilisateurId: uid, cle: 'presences_a_completer',
        titre: `Présences à compléter — ${seances.length} séance(s)`, detail, lien: '/mes-cours' })) n++;
    }
  }
  return n;
}

/* P6 — L'AVIS DE VALORISATION DEMANDÉ ET PAS RENDU : au chargé de cours à 5 jours ouvrables ; à 10 (délai annoncé),
   à lui et à la coordination de la section. */
function avisVA(annee, auj) {
  let n = 0;
  let l = [];
  try {
    l = db.prepare(`SELECT a.valorisation_id, a.professeur_id, a.appele_le, v.ue_num, v.etudiant_id
      FROM valorisation_avis_appel a JOIN etudiant_valorisation v ON v.id = a.valorisation_id
      WHERE v.annee_scolaire = ? AND v.decision_le IS NULL AND v.archive_le IS NULL
        AND NOT EXISTS (SELECT 1 FROM valorisation_avis x WHERE x.valorisation_id = a.valorisation_id AND x.professeur_id = a.professeur_id)`).all(annee);
  } catch { return 0; }
  for (const x of l) {
    const jours = ouvrables(x.appele_le, auj);
    const jalon = jours >= 10 ? 'J+10' : jours >= 5 ? 'J+5' : null;
    if (!jalon) continue;
    const titre = `${jalon === 'J+10' ? 'Avis attendu, délai dépassé' : 'Avis attendu'} — valorisation de ${nomEtu(x.etudiant_id)}, UE ${x.ue_num}`;
    const detail = `Demandé le ${jourFr(x.appele_le)} (${jours} jours ouvrables). L'avis se rend dans Mes cours → Avis de valorisation.`;
    for (const uid of comptesProf(x.professeur_id)) {
      if (deposerUneFois({ cibleType: 'avis_va', cibleId: x.valorisation_id, jalon: `${jalon}|${x.professeur_id}`, utilisateurId: uid,
        cle: 'avis_attendus', titre, detail, lien: '/mes-cours' })) n++;
    }
    if (jalon === 'J+10') {
      const p = db.prepare('SELECT nom, prenom FROM professeur WHERE id = ?').get(x.professeur_id) || {};
      for (const uid of comptesDuRole('coordination', sectionDeUE(x.ue_num, annee))) {
        if (deposerUneFois({ cibleType: 'avis_va', cibleId: x.valorisation_id, jalon: `J+10-coord|${x.professeur_id}`, utilisateurId: uid,
          cle: 'avis_attendus', titre: `Avis de VA en retard — ${String(p.nom || '').toUpperCase()} ${p.prenom || ''}, UE ${x.ue_num}`,
          detail: `Valorisation de ${nomEtu(x.etudiant_id)} : avis demandé le ${jourFr(x.appele_le)}, pas encore rendu.`, lien: '/etudiants' })) n++;
      }
    }
  }
  return n;
}

/* P7 — L'AVIS D'AMÉNAGEMENT RAISONNABLE DEMANDÉ ET PAS RENDU : mêmes jalons ; la copie va au secrétariat. */
function avisAR(annee, auj) {
  let n = 0;
  let ids = [];
  try {
    ids = db.prepare(`SELECT id FROM amenagement_dossier WHERE annee_scolaire = ? AND valide_b_le IS NOT NULL AND cde_date IS NULL`).all(annee).map(x => x.id);
  } catch { return 0; }
  for (const id of ids) {
    const d = chargerDossier(id);
    if (!d || DECIDE.includes(d.statut)) continue;
    const depuis = d.avis_demande_le || d.valide_b_le;
    const jours = ouvrables(depuis, auj);
    const jalon = jours >= 10 ? 'J+10' : jours >= 5 ? 'J+5' : null;
    if (!jalon) continue;
    const rendus = new Set(db.prepare('SELECT DISTINCT professeur_id p FROM amenagement_avis WHERE dossier_id = ?').all(id).map(x => x.p));
    const manquent = chargesDeCours(d).filter(p => !rendus.has(p.id));
    for (const p of manquent) {
      for (const uid of comptesProf(p.id)) {
        if (deposerUneFois({ cibleType: 'avis_ar', cibleId: id, jalon: `${jalon}|${p.id}`, utilisateurId: uid, cle: 'avis_attendus',
          titre: `${jalon === 'J+10' ? 'Avis attendu, délai dépassé' : 'Avis attendu'} — aménagement raisonnable`,
          detail: `Une demande d'aménagement attend votre avis depuis le ${jourFr(depuis)}. L'avis se rend dans Mes cours → Aménagements.`,
          lien: '/mes-cours' })) n++;
      }
    }
    if (jalon === 'J+10' && manquent.length) {
      const noms = manquent.map(p => `${String(p.nom || '').toUpperCase()} ${p.prenom || ''}`.trim()).join(', ');
      for (const uid of comptesDuRole('secretariat')) {
        if (deposerUneFois({ cibleType: 'avis_ar', cibleId: id, jalon: 'J+10-sec', utilisateurId: uid, cle: 'avis_attendus',
          titre: `Avis d'aménagement en retard — ${nomEtu(d.etudiant_id || d.etudiant?.id)}`,
          detail: `Demandés le ${jourFr(depuis)}, pas encore rendus : ${noms}.`, lien: '/etudiants' })) n++;
      }
    }
  }
  return n;
}

/* S5, C3 — LES PROPOSITIONS DE PAE EN LIGNE : au dépôt, puis à J+3 si personne ne l'a traitée. */
function propositionsPAE(annee, auj) {
  let n = 0;
  let l = [];
  try { l = db.prepare(`SELECT id, etudiant_id, depose_le FROM pae_proposition WHERE annee_scolaire = ? AND statut = 'deposee'`).all(annee); } catch { return 0; }
  for (const p of l) {
    const jours = ecart(String(p.depose_le).slice(0, 10), auj);
    const jalon = jours >= 3 ? 'J+3' : 'depot';
    const dest = new Set([...comptesDuRole('secretariat'), ...comptesDuRole('coordination', sectionEtudiant(p.etudiant_id))]);
    for (const uid of dest) {
      if (deposerUneFois({ cibleType: 'pae_proposition', cibleId: p.id, jalon, utilisateurId: uid, cle: 'pae_propositions',
        titre: `${jalon === 'J+3' ? 'Toujours à traiter' : 'À traiter'} — proposition de PAE de ${nomEtu(p.etudiant_id)}`,
        detail: `Envoyée le ${jourFr(p.depose_le)} depuis l'espace de l'étudiant.`, lien: '/etudiants' })) n++;
    }
  }
  return n;
}

/* D2 — LES DÉLAIS DE PROCÉDURE (recours, discipline) : la prochaine échéance ouverte, deux jours avant et le jour même. */
function procedures(annee, auj) {
  let n = 0;
  let ids = [];
  try { ids = db.prepare(`SELECT id FROM proc_dossier WHERE supprime_le IS NULL ORDER BY id DESC LIMIT 500`).all().map(x => x.id); } catch { return 0; }
  for (const id of ids) {
    let d = null;
    try { d = lireDossier(id); } catch { d = null; }
    if (!d || d.circuit?.clos) continue;
    const e = (d.echeances || []).find(x => x.etat === 'ouverte' && !x.information && x.date);
    if (!e) continue;
    const j = ecart(auj, String(e.date).slice(0, 10));
    const jalon = j === 2 ? 'J-2' : j === 0 ? 'jour_j' : null;
    if (!jalon) continue;
    const dest = new Set([...comptesDuRole('secretariat'), ...DIRECTION.flatMap(r => comptesDuRole(r))]);
    for (const uid of dest) {
      if (deposerUneFois({ cibleType: 'proc_dossier', cibleId: id, jalon: `${jalon}|${e.cle}`, utilisateurId: uid, cle: 'procedures_delais',
        titre: `${j === 0 ? "Aujourd'hui" : 'Dans 2 jours'} — ${e.label} (${d.type === 'recours' ? 'recours' : 'discipline'}, ${nomEtu(d.etudiant?.id)})`,
        detail: `Échéance du ${jourFr(e.date)}${e.art ? ` — ${e.art}` : ''}.`, lien: '/etudiants', urgent: true })) n++;
    }
  }
  return n;
}

/* LE BILAN DU LUNDI : VA (S4, C2, D1), absences au-delà du seuil (S6), frais impayés (S8), aménagements (S9). Un chiffre par
   paquet ; la coordination ne reçoit que ce qui touche ses sections, la direction la validation des VA. */
function bilanLundi(annee, auj) {
  if (!estLundi(auj)) return 0;
  // Calculé une fois le lundi, pas à chaque heure : les absences et les frais se recalculent pour toute l'école.
  const fait = db.prepare(`SELECT valeur FROM lucie_config WHERE cle = 'bilan_lundi_fait'`).get()?.valeur;
  if (fait === auj) return 0;
  db.prepare(`INSERT INTO lucie_config (cle, valeur) VALUES ('bilan_lundi_fait', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur`).run(auj);
  let n = 0;
  const parSection = new Map();     // section → { cle: [lignes] }
  const ajouter = (section, cle, ligne) => {
    const k = section || '';
    if (!parSection.has(k)) parSection.set(k, {});
    (parSection.get(k)[cle] ||= []).push(ligne);
  };
  const tout = {};
  const compter = (cle, ligne, section) => { (tout[cle] ||= []).push(ligne); ajouter(section, cle, ligne); };

  try {
    for (const v of db.prepare(`SELECT v.* FROM etudiant_valorisation v WHERE v.annee_scolaire = ? AND v.archive_le IS NULL`).all(annee)) {
      const sec = sectionDeUE(v.ue_num, annee);
      if (v.recevable == null) compter('va_recevabilite', v.id, sec);
      else if (v.recevable === 1 && !v.avis_le) compter('va_avis', v.id, sec);
      else if (v.recevable === 1 && !v.decision_le) compter('va_decision', v.id, sec);
      if (v.decision_le && !v.valide_le) compter('va_validation', v.id, sec);
      if (v.valide_le && !v.notifie_le) compter('va_notification', v.id, sec);
      if (v.decision_le && !v.eprom_le) compter('va_eprom', v.id, sec);
    }
  } catch (e) { console.error('[bilan] VA :', e.message); }
  try {
    for (const a of alertesAbsences(annee).alertes.filter(x => !x.prevenu_le)) compter('absences', a.etudiant_id, sectionEtudiant(a.etudiant_id));
  } catch (e) { console.error('[bilan] absences :', e.message); }
  try {
    for (const { id } of db.prepare(`SELECT DISTINCT etudiant_id id FROM etudiant_inscription WHERE annee_scolaire = ?`).all(annee)) {
      const f = calculerFrais(id, annee);
      if (f && !f.sans_frais && f.restant > 0 && f.echeance_solde && String(f.echeance_solde).slice(0, 10) < auj) compter('frais', id, sectionEtudiant(id));
    }
  } catch (e) { console.error('[bilan] frais :', e.message); }
  try {
    for (const { id } of db.prepare(`SELECT id FROM amenagement_dossier WHERE annee_scolaire = ?`).all(annee)) {
      const d = chargerDossier(id);
      if (!d) continue;
      const decide = DECIDE.includes(d.statut);
      if (!decide && d.valide_b_le) compter('ar_decision', id, d.section);
      else if (decide && !d.notifie_le) compter('ar_notification', id, d.section);
      else if (decide && ['accepte', 'partiel'].includes(d.statut) && !d.communique_le) compter('ar_communication', id, d.section);
    }
  } catch (e) { console.error('[bilan] AR :', e.message); }

  const LIBELLES = {
    va_recevabilite: 'VA : recevabilités à contrôler', va_avis: 'VA : avis attendus', va_decision: 'VA : décisions à prendre',
    va_validation: 'VA : décisions à valider (direction)', va_notification: 'VA : décisions à notifier', va_eprom: 'VA : décisions à encoder dans eProm',
    absences: 'Étudiants au-delà du seuil d’absences, pas encore prévenus', frais: 'Étudiants dont le solde des frais est échu',
    ar_decision: 'Aménagements : décisions à rendre', ar_notification: 'Aménagements : décisions à notifier', ar_communication: 'Aménagements : mesures à communiquer aux chargés de cours',
  };
  const ligne = paquets => Object.entries(paquets).filter(([, l]) => l.length).map(([k, l]) => `${LIBELLES[k]} : ${l.length}`).join(' · ');
  const envoyer = (uid, paquets, portee) => {
    const texte = ligne(paquets);
    if (!texte) return;
    if (deposerUneFois({ cibleType: 'bilan_lundi', cibleId: 0, jalon: auj, utilisateurId: uid, cle: 'bilan_lundi',
      titre: `Ce qui reste à faire — semaine du ${jourFr(auj)}${portee ? ` (${portee})` : ''}`, detail: texte, lien: '/etudiants' })) n++;
  };
  // Le secrétariat : tout. La direction : tout aussi (la validation des VA est à elle). La coordination : ses sections, sans les frais.
  for (const uid of comptesDuRole('secretariat')) envoyer(uid, tout);
  for (const uid of new Set(DIRECTION.flatMap(r => comptesDuRole(r)))) envoyer(uid, tout);
  const coordos = db.prepare(`SELECT id FROM utilisateur WHERE role = 'coordination' AND COALESCE(actif, 1) = 1 AND email LIKE '%@%'`).all().map(u => u.id);
  for (const uid of coordos) {
    const p = {};
    for (const [section, paquets] of parSection) {
      if (!section || !comptesDuRole('coordination', section).includes(uid)) continue;
      for (const [k, l] of Object.entries(paquets)) if (k !== 'frais' && k !== 'va_validation') (p[k] ||= []).push(...l);
    }
    envoyer(uid, p, 'vos sections');
  }
  return n;
}

/* S7 — LE CONGÉ-ÉDUCATION : l'attestation d'inscription régulière part chez l'employeur au plus tard le 31 octobre. Un type
   d'échéance de l'échéancier (posé une fois), que l'étape 1 rappelle par courriel. */
export function poserEcheancesCEP(dbx = db) {
  try {
    dbx.prepare(`INSERT INTO echeance_type (code, libelle, description, zone, categorie, regle_date, responsable_defaut, rappels_defaut, base_legale, lien_interne)
      SELECT 'cep_attestation_inscription', 'Congé-éducation : attestations d''inscription régulière',
        'À remettre à l''employeur au plus tard le 31 octobre (ou 15 jours après une inscription tardive).',
        'etablissement', 'pedagogique', 'fixe:31/10', 'secretariat', '[15,7,1]', 'Loi du 22/01/1985 ; A. bruxellois du 29/06/2023', '/etudiants'
      WHERE NOT EXISTS (SELECT 1 FROM echeance_type WHERE code = 'cep_attestation_inscription')`).run();
  } catch (e) { console.error('[rappels] échéance CEP :', e.message); }
}

/** Le passage : toutes les heures ; ne dépose que ce qui est dû et pas encore parti. */
export function genererRappelsPersonnel(annee, { jour = null } = {}) {
  const auj = jour || aujourdhui();     // `jour` : pour les essais seulement

  const stats = {};
  essayer('presences', () => presences(annee, auj), stats);
  essayer('avis_va', () => avisVA(annee, auj), stats);
  essayer('avis_ar', () => avisAR(annee, auj), stats);
  essayer('pae', () => propositionsPAE(annee, auj), stats);
  essayer('procedures', () => procedures(annee, auj), stats);
  essayer('bilan', () => bilanLundi(annee, auj), stats);
  return stats;
}
