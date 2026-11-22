/** (CS)
 * LE RECOURS EN LIGNE (3.5.658, Charles, 23 novembre 2026 : « dans le module étudiant, ajouter la possibilité de faire un
 * recours s'il reçoit des résultats en deuxième session » ; « il faut intégrer le module de recours dans l'espace étudiant »).
 *
 * Le RDE (art. 87-88) ouvre le recours contre un REFUS — en seconde session presque toujours, en première quand il n'y a rien
 * après — jamais contre un ajournement. La plainte se remet dans les QUATRE JOURS CALENDRIER qui suivent la publication des
 * résultats (art. 88 §1), écrite, avec les irrégularités invoquées (art. 88 §2).
 *
 * L'espace de l'étudiant ne fait que NOTER la plainte (et ses pièces) ; Lucie la relève, la juge ici et l'écrit dans le
 * circuit des procédures (lib/procedures.js) — le MÊME dossier que celui qu'ouvre le secrétariat : étape « Plainte reçue »,
 * mode « en ligne », datée du jour où l'étudiant l'a envoyée. Elle part à la direction, la coordination en copie ; la suite
 * (recevabilité, CDE restreint, décision motivée, envoi recommandé) reste celle de l'écran Procédures.
 *
 * L'étudiant suit son dossier : reçue, recevabilité en examen ou recevable, et la décision — seulement une fois envoyée.
 */
import fs from 'fs';
import path from 'path';
import db from '../db/index.js';
import { migrerProcedures, lireDossier, proposerMembresRecours } from './procedures.js';
import { ajouterJours } from '../services/echeancier_dates.js';
import { sectionDuDossier } from './sectionDossier.js';

const DATA_DIR = process.env.DATA_DIR || '/app/data';
/** Art. 88 §1 : quatre jours calendrier après la publication (le paramètre de Configuration → Procédures, s'il est posé). */
function delai() {
  try { const v = Number(db.prepare("SELECT valeur FROM parametre WHERE cle = 'procedures.delai_recours_jours'").get()?.valeur); if (v > 0) return v; } catch { /* */ }
  return 4;
}
export const aujourdhui = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Brussels' });
/** Une date-heure du portail (UTC, « AAAA-MM-JJ HH:MM:SS ») ramenée au jour de Bruxelles. */
export function jourBruxelles(dt) {
  if (!dt) return aujourdhui();
  const d = new Date(String(dt).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(dt) ? '' : 'Z'));
  return Number.isNaN(d.getTime()) ? String(dt).slice(0, 10) : d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Brussels' });
}
const precedente = a => { const m = /^(\d{4})-(\d{4})$/.exec(a || ''); return m ? `${Number(m[1]) - 1}-${Number(m[2]) - 1}` : null; };
const nomUE = (ue, annee) => db.prepare('SELECT ue_nom FROM ue WHERE ue_num = ? ORDER BY (annee_scolaire = ?) DESC LIMIT 1').get(ue, annee)?.ue_nom || null;

/** Le dossier de recours déjà ouvert sur cette décision (par l'école ou en ligne). */
function dossierExistant(etudiantId, ueNum, annee, session) {
  return db.prepare(`SELECT id FROM proc_dossier WHERE type = 'recours' AND etudiant_id = ? AND ue_num = ? AND annee_scolaire = ?
    AND COALESCE(session, 1) = ? AND supprime_le IS NULL ORDER BY id DESC LIMIT 1`).get(etudiantId, ueNum, annee, session)?.id || null;
}

/** Les refus PUBLIÉS de l'étudiant (année active et précédente) : séance close de son organisation (ou « toute l'unité »)
 *  et date de publication posée. Chacun avec son délai et, s'il existe, l'état de son recours. */
export function refusRecourables(etudiantId, annee) {
  migrerProcedures(db);
  const annees = [annee, precedente(annee)].filter(Boolean);
  const out = [];
  let lignes = [];
  try {
    lignes = db.prepare(`SELECT r.ue_num, r.annee_scolaire, r.session, COALESCE(i.num_organisation, 0) AS org
      FROM deliberation_resultat r JOIN etudiant_inscription i
        ON i.etudiant_id = r.etudiant_id AND i.ue_num = r.ue_num AND i.annee_scolaire = r.annee_scolaire
      WHERE r.etudiant_id = ? AND r.resultat = 'refuse' AND r.annee_scolaire IN (${annees.map(() => '?').join(',')})
      ORDER BY r.annee_scolaire DESC, r.ue_num`).all(etudiantId, ...annees);
  } catch { return []; }
  const jour = aujourdhui(), n = delai();
  for (const l of lignes) {
    const s = db.prepare(`SELECT publie_le FROM deliberation_seance WHERE ue_num = ? AND annee_scolaire = ? AND session = ?
      AND cloturee = 1 AND (COALESCE(num_organisation, 0) = 0 OR num_organisation = ?)
      ORDER BY (num_organisation = ?) DESC, publie_le DESC LIMIT 1`).get(l.ue_num, l.annee_scolaire, l.session, l.org, l.org);
    if (!s?.publie_le) continue;
    const publie = String(s.publie_le).slice(0, 10);
    const limite = ajouterJours(publie, n);
    const did = dossierExistant(etudiantId, l.ue_num, l.annee_scolaire, l.session);
    // Un refus dont le délai est passé reste listé : l'espace le dit, en gris, sous l'unité (Charles, 23 novembre 2026).
    out.push({ ue_num: l.ue_num, ue_nom: nomUE(l.ue_num, l.annee_scolaire), annee: l.annee_scolaire, session: l.session,
      org: l.org, publie_le: publie, limite, ouvert: !did && jour <= limite, delai_jours: n,
      dossier: did ? etatPourLEtudiant(lireDossier(did)) : null });
  }
  return out;
}

/** CE QUE L'ÉTUDIANT VOIT DE SON RECOURS : la réception, la recevabilité, la décision — celle-ci seulement une fois envoyée
 *  (la décision motivée part par recommandé, art. 89 §3 ; l'espace ne la devance pas). */
export function etatPourLEtudiant(d) {
  if (!d) return null;
  const et = d.etapes || {};
  const envoye = et.envoi?.envoye_le || null;
  const irrecevable = et.recevabilite?.recevable === false;
  return {
    id: d.id,
    introduit_le: et.plainte?.recue_le || null,
    en_ligne: et.plainte?.mode === 'en_ligne',
    recevabilite: !et.recevabilite ? 'en_examen' : irrecevable ? (envoye ? 'irrecevable' : 'en_examen') : 'recevable',
    motif_irrecevabilite: irrecevable && envoye ? (et.recevabilite.motif || null) : null,
    cde_le: !irrecevable && et.cde?.date ? et.cde.date : null,
    decision: envoye && !irrecevable ? (et.decision?.issue || null) : null,
    envoye_le: envoye,
    externe_jusquau: envoye ? ((d.echeances || []).find(e => e.cle === 'externe')?.date || null) : null,
    pieces: (d.pieces || []).filter(p => p.categorie === 'plainte_en_ligne').length,
  };
}

/** L'offre déposée au portail : les refus et leurs recours. */
export function offreRecours(e, annee) {
  return { refus: refusRecourables(e.id, annee), delai_jours: delai() };
}

const mimeDe = b => {
  if (!b || b.length < 4) return null;
  const h = b.toString('hex', 0, 4);
  if (b.toString('latin1', 0, 4) === '%PDF') return 'application/pdf';
  if (h.startsWith('ffd8ff')) return 'image/jpeg';
  if (h === '89504e47') return 'image/png';
  return null;
};

/**
 * LA PLAINTE INTRODUITE EN LIGNE. `x` = { ue_num, annee, session, griefs } ; `pieces` = [{ nom, buffer }] ; `envoyeLe` = la
 * date-heure du geste dans le portail (c'est elle qui fait foi pour le délai, pas l'heure du relevé).
 * Rend { erreur } ou { resultat, dossier_id }.
 */
export function introduireRecours(e, annee, x, pieces = [], envoyeLe = null) {
  migrerProcedures(db);
  const ue = Number(x?.ue_num), session = Number(x?.session) || 1, an = String(x?.annee || '');
  const griefs = String(x?.griefs || '').trim();
  if (!griefs) return { erreur: 'Décrivez les irrégularités que vous invoquez (RDE art. 88 §2).' };
  const refus = refusRecourables(e.id, annee).find(r => r.ue_num === ue && r.annee === an && r.session === session);
  if (!refus) return { erreur: 'Cette décision ne peut pas faire l’objet d’un recours en ligne : seul un refus publié se conteste (RDE art. 87). Adressez-vous au secrétariat.' };
  if (refus.dossier) return { erreur: `Un recours est déjà introduit pour l’UE ${ue} (le ${String(refus.dossier.introduit_le || '').split('-').reverse().join('/')}).` };
  const jour = jourBruxelles(envoyeLe);
  if (jour > refus.limite) {
    return { erreur: `Le délai de recours est passé : la plainte devait être remise au plus tard le ${refus.limite.split('-').reverse().join('/')} (RDE art. 88 §1). Adressez-vous à la direction.` };
  }
  for (const p of pieces) if (!mimeDe(p.buffer)) return { erreur: 'Une pièce n’a pas pu être lue : déposez des PDF ou des photos (JPEG, PNG).' };

  const par = `${String(e.nom || '').toUpperCase()} ${e.prenom || ''} (étudiant, en ligne)`.replace(/\s+/g, ' ').trim();
  const section = sectionDuDossier(e.id, ue, an);
  const did = db.transaction(() => {
    const info = db.prepare(`INSERT INTO proc_dossier (type, nature, etudiant_id, annee_scolaire, section, ue_num, session,
        num_organisation, objet, cree_par_id, cree_par_nom) VALUES ('recours', NULL, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`)
      .run(e.id, an, section, ue, session, refus.org, `Refus en ${session === 2 ? 'seconde' : 'première'} session — introduit en ligne`, par);
    const id = Number(info.lastInsertRowid);
    proposerMembresRecours(id, ue, an);
    db.prepare('INSERT INTO proc_etape (dossier_id, etape, donnees, par_id, par_nom) VALUES (?,?,?,?,?)')
      .run(id, 'plainte', JSON.stringify({ recue_le: jour, mode: 'en_ligne', griefs: griefs.slice(0, 8000) }), null, par);
    return id;
  })();
  // Les pièces, sur le disque comme celles que le secrétariat dépose (DATA_DIR/procedures/<dossier>).
  if (pieces.length) {
    const dir = path.join(DATA_DIR, 'procedures', String(did));
    fs.mkdirSync(dir, { recursive: true });
    const ins = db.prepare('INSERT INTO proc_piece (dossier_id, categorie, nom, chemin, taille, par_nom) VALUES (?,?,?,?,?,?)');
    pieces.forEach((p, i) => {
      const propre = String(p.nom || `piece_${i + 1}`).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-80);
      const chemin = path.join(dir, `${Date.now()}_${i}_${propre}`);
      fs.writeFileSync(chemin, p.buffer);
      ins.run(did, 'plainte_en_ligne', String(p.nom || propre).slice(0, 150), chemin, p.buffer.length, par);
    });
  }
  // ENVOYÉ À LA DIRECTION, LA COORDINATION EN COPIE (Charles, 23 novembre 2026) : le délai de décision court (art. 89 §3).
  try {
    const titre = `Recours introduit en ligne — ${String(e.nom || '').toUpperCase()} ${e.prenom || ''}, UE ${ue}`.replace(/\s+/g, ' ');
    const corps = `Refus de ${session === 2 ? 'seconde' : 'première'} session (${an}), publié le ${refus.publie_le.split('-').reverse().join('/')}. `
      + `Plainte reçue le ${jour.split('-').reverse().join('/')}${pieces.length ? `, ${pieces.length} pièce(s) jointe(s)` : ''}. Recevabilité à examiner.`;
    const n = db.prepare(`INSERT INTO lucie_notification (type, titre, corps, lien, cible_user_id, cible_role, section, cree_par)
      VALUES ('recours_en_ligne', ?, ?, ?, ?, ?, ?, 'Espace de l’étudiant')`);
    const lien = `/procedures?dossier=${did}`;
    // La direction à sa personne (le rôle d'un compte de direction varie : admin, directeur, directeur adjoint).
    for (const u of db.prepare("SELECT id FROM utilisateur WHERE COALESCE(actif, 1) = 1 AND role IN ('admin', 'directeur', 'directeur_adjoint')").all()) {
      n.run(titre, corps, lien, u.id, null, null);
    }
    if (section) n.run(titre, corps, lien, null, 'coordination', section);
  } catch (err) { console.error('[recours en ligne] notification :', err.message); }
  return { dossier_id: did, resultat: `Votre recours est reçu (le ${jour.split('-').reverse().join('/')}). La direction examine d’abord sa recevabilité ; la décision motivée vous sera adressée par courrier recommandé.` };
}
