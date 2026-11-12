// Lucie — CE QUI ATTEND LA DIRECTION (3.5.383, Charles, 12 novembre 2026 : « je ne vois pas les demandes de VA ou d'AR que je
// devrais signer comme directeur »). Les dossiers existaient, chacun dans son écran, mais rien ne les portait au tableau de bord :
// 38 VA décidées attendaient la validation de la direction et 21 AR, le rapport validé, attendaient la décision. Lecture seule ;
// le geste se pose dans l'écran de la valorisation (« Instruire en série » → validation) ou des aménagements.
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { PEUT_VALIDER } from '../lib/valorisation.js';
import { getUserSections } from '../middleware/auth.js';
import { sectionRattachement } from './etudiants.js';
import { anneeDeTravail } from '../helpers/annee.js';

const r = Router();
const essai = (f, d) => { try { return f(); } catch { return d; } };
const DECIDE = ['accepte', 'partiel', 'refuse', 'recours'];

r.get('/', authRequired, (req, res) => {
  if (!PEUT_VALIDER.includes(req.user.role)) return res.json({ direction: false, va: [], ar: 0 });
  // VA : décision posée, pas encore validée, non archivée — par année (les reprises d'avant restent visibles, comptées à part).
  const va = essai(() => db.prepare(`SELECT annee_scolaire AS annee, COUNT(*) AS n FROM etudiant_valorisation
    WHERE decision_le IS NOT NULL AND valide_le IS NULL AND archive_le IS NULL GROUP BY annee_scolaire ORDER BY annee_scolaire DESC`).all(), []);
  // AR : le rapport (volet B) est validé, le Conseil n'a pas encore décidé.
  const ar = essai(() => db.prepare(`SELECT COUNT(*) n FROM amenagement_dossier WHERE valide_b_le IS NOT NULL AND cde_date IS NULL
    AND COALESCE(statut, '') NOT IN (${DECIDE.map(() => '?').join(',')})`).get(...DECIDE).n, 0);
  res.json({ direction: true, va, ar });
});

/* LES AMÉNAGEMENTS RAISONNABLES DE MES SECTIONS (3.5.393, Charles : « je ne vois pas les demandes d'AR sur les tableaux de bord des
   coordinations concernées »). Le module est sur octroi nominatif (secret professionnel) : la coordination n'y entrait pas, et rien ne
   lui parvenait. Ici, pour la coordination de la section de l'étudiant (et la direction) : le nom, ce qui reste à faire, les unités et
   les MESURES ACCORDÉES — jamais la nature de la difficulté, ni la pièce, ni la motivation (art. 5). Lecture seule. */
r.get('/amenagements', authRequired, (req, res) => {
  const role = req.user.role;
  if (!['coordination', ...PEUT_VALIDER].includes(role)) return res.json({ lignes: [] });
  const annee = anneeDeTravail(req);
  const perim = getUserSections(req.user);
  const DEC = ['accepte', 'partiel', 'refuse', 'recours'];
  const lignes = [];
  const dossiers = essai(() => db.prepare(`SELECT d.id, d.etudiant_id, d.statut, d.date_demande, d.notifie_le, d.communique_le, d.cde_date,
      d.valide_a_le, d.valide_b_le, e.nom, e.prenom FROM amenagement_dossier d JOIN etudiant e ON e.id = d.etudiant_id
      WHERE d.annee_scolaire = ? ORDER BY e.nom, e.prenom`).all(annee), []);
  for (const d of dossiers) {
    let section = null;
    try { section = sectionRattachement(d.etudiant_id, annee).section || null; } catch { /* */ }
    if (perim && (!section || !perim.includes(section))) continue;
    const decide = DEC.includes(d.statut) || !!d.cde_date;
    // LES DEMANDES, PAS LES PIÈCES (3.5.394, Charles) : les aménagements demandés se lisent dès la demande ; décidés, on dit lesquels
    // sont accordés. La pièce, la nature de la difficulté et la motivation restent hors de vue.
    const mesuresD = essai(() => db.prepare('SELECT libelle, precisions, accorde FROM amenagement_mesure WHERE dossier_id = ? ORDER BY libelle').all(d.id), []);
    const accordees = mesuresD.filter(m => Number(m.accorde) === 1).map(m => m.libelle);
    const a_faire = !d.valide_a_le ? 'demande à instruire' : !d.valide_b_le ? 'rapport à établir' : !decide ? 'décision du Conseil à rendre'
      : !d.notifie_le ? 'décision à notifier' : ['accepte', 'partiel'].includes(d.statut) && !d.communique_le ? 'mesures à communiquer aux chargés de cours' : null;
    if (!a_faire && !accordees.length && !mesuresD.length) continue;
    lignes.push({ id: d.id, etudiant_id: d.etudiant_id, nom: d.nom, prenom: d.prenom, section, date_demande: d.date_demande, a_faire,
      decide, mesures: decide ? accordees : [],
      demandees: mesuresD.map(m => ({ libelle: m.libelle, precisions: m.precisions || null, accorde: decide ? Number(m.accorde) === 1 : null })),
      ues: essai(() => db.prepare('SELECT ue_num FROM amenagement_ue WHERE dossier_id = ? ORDER BY ue_num').all(d.id).map(x => x.ue_num), []) });
  }
  res.json({ annee, lignes });
});

export default r;
