/**
 * LES ANNÉES PASSÉES DANS L'ESPACE DE L'ÉTUDIANT (3.5.027, Charles, 1er novembre 2026 : « Lucie est nouvelle de cette
 * année ; pour tous les résultats antérieurs, génère toutes les attestations de réussite, de VA, etc., et que tout soit
 * dans les espaces des étudiants » ; tranché : réussites par UE, attestations de VA, un document « toutes les années » ;
 * AUCUN courriel — l'espace n'est pas encore ouvert, l'annonce le dira ; un bouton de la direction, simulation d'abord ;
 * TOUS les étudiants, archivés compris, pour quand ils reviennent).
 *
 * Les pièces sont celles d'Éditions (`piecesHistoriques`, routes/attestations.js). Chacune entre au registre des envois
 * (`deposerDansLEspace` : mode « espace », copie, référence, signature refaite à l'identique) et part au portail avec les
 * autres, dès que l'étudiant y est visible et que « Mes documents » lui est ouvert. Une pièce ne se dépose qu'une fois
 * (`portail_depot`, natures `hist_*`), notée « avisée » d'emblée : l'avis du dépôt d'office ne part pas pour elles.
 */
import db from '../db/index.js';
import { piecesHistoriques } from '../routes/attestations.js';
import { deposerDansLEspace } from '../routes/envois.js';
import { migrerDepot } from './depotEspace.js';
import { sectionPropre } from '../routes/etudiants.js';

const anneeActive = () => db.prepare('SELECT code FROM annee_scolaire WHERE active = 1').get()?.code
  || db.prepare('SELECT code FROM annee_scolaire ORDER BY code DESC LIMIT 1').get()?.code || '';

/** Les étudiants qui ont quelque chose d'avant l'année active : une réussite ou une VA complète. */
function candidats(annee) {
  return db.prepare(`SELECT id, nom, prenom, email_ecole, section_rattachement FROM etudiant WHERE id IN (
      SELECT etudiant_id FROM etudiant_inscription WHERE resultat = 'reussi' AND annee_scolaire < ?
      UNION SELECT etudiant_id FROM etudiant_valorisation WHERE type = 'complete' AND annee_scolaire < ? AND ue_num > 0)
    ORDER BY nom, prenom`).all(annee, annee);
}

/* UN ÉTUDIANT DÉJÀ SERVI NE SE RECOMPOSE PAS (3.5.028, Charles : « et les autres ? » — le dépôt s'arrêtait à 200 : chaque
   lot recomposait d'abord toutes les pièces des lots précédents avant de trouver du neuf, et le troisième n'en finissait
   pas). On compte, sans rien composer, ce qu'il a d'avant (réussites, VA complètes retenues) et ce qui est déjà déposé :
   s'il a tout, on passe. */
const attendues = () => db.prepare(`SELECT
    (SELECT COUNT(*) FROM etudiant_inscription WHERE etudiant_id = ? AND resultat = 'reussi' AND annee_scolaire < ?)
  + (SELECT COUNT(DISTINCT annee_scolaire || '|' || ue_num) FROM etudiant_valorisation WHERE etudiant_id = ? AND type = 'complete'
       AND ue_num > 0 AND annee_scolaire < ? AND COALESCE(decision, 'accordee') <> 'refusee') AS n`);
const deposees = () => db.prepare(`SELECT COUNT(*) AS n FROM portail_depot WHERE etudiant_id = ? AND nature IN ('hist_reussite','hist_va')`);

const dejaDepose = () => db.prepare(`SELECT 1 FROM portail_depot WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ? AND session = 0 AND nature = ?`);

/**
 * `ecrire` faux : compte seulement (par année et par section, ce qui manque au référentiel).
 * Vrai : compose et dépose ce qui ne l'est pas encore. Rend le bilan.
 */
export function deposerHistorique({ ecrire = false, par = 'Lucie (années passées)', limite = 50 } = {}) {
  migrerDepot();
  const active = anneeActive();
  const deja = dejaDepose();
  const nAttendues = attendues(), nDeposees = deposees();
  const noter = db.prepare(`INSERT OR IGNORE INTO portail_depot (etudiant_id, annee_scolaire, ue_num, session, nature, envoi_id, avise_le)
    VALUES (?,?,?,0,?,?, datetime('now'))`);
  // PAR LOTS (l'école compte quelques milliers de pièces) : à l'écriture, `limite` étudiants par appel ; `reste` dit s'il
  // faut rappeler. L'écran rappelle jusqu'au bout et montre l'avancement.
  const bilan = { annee_active: active, etudiants: 0, pieces: 0, deja: 0, par_annee: {}, par_nature: {}, par_section: {}, manques: [], reste: false };
  for (const e of candidats(active)) {
    if (ecrire && bilan.etudiants >= limite) { bilan.reste = true; break; }
    const dejaLa = nDeposees.get(e.id).n;
    if (dejaLa && dejaLa >= nAttendues.get(e.id, active, e.id, active).n) { bilan.deja += dejaLa; continue; }
    let r;
    try { r = piecesHistoriques(e.id, active); } catch (x) { bilan.manques.push(`${(e.nom || '').toUpperCase()} ${e.prenom || ''} : ${x.message}`); continue; }
    for (const m of r.manques) bilan.manques.push(`${(e.nom || '').toUpperCase()} ${e.prenom || ''} — ${m}`);
    let compte = 0;
    for (const p of r.pieces) {
      if (deja.get(e.id, p.annee, p.ue_num, p.nature)) { bilan.deja++; continue; }
      compte++;
      bilan.pieces++;
      bilan.par_annee[p.annee] = (bilan.par_annee[p.annee] || 0) + 1;
      bilan.par_nature[p.nature] = (bilan.par_nature[p.nature] || 0) + 1;
      // La section de l'étudiant, celle de sa fiche (posée, sinon déduite) : la colonne « — » comptait les non posées.
      const s = sectionPropre(e.id) || 'sans section';
      bilan.par_section[s] = (bilan.par_section[s] || 0) + 1;
      if (!ecrire) continue;
      const { id } = deposerDansLEspace({ etudiant: e, sujet: p.sujet, html: p.html, type_doc: `espace_${p.nature}`,
        nom_fichier: p.nom_fichier, contenu: p.sujet, par });
      noter.run(e.id, p.annee, p.ue_num, p.nature, id);
    }
    if (compte) bilan.etudiants++;
  }
  return bilan;
}
