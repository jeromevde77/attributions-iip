// ─────────────────────────────────────────────────────────────────────────────
// LIRE ET REMPLIR UNE FICHE D'ÉVALUATION POUR UN ÉTUDIANT (3.5.213) — commun à Mes TFE (promoteur, jury), Mes stages
// (superviseur) et au lien du maître de stage. Une fiche est une évaluation « par acquis » du carnet : chaque critère s'écrit
// dans carnet_note_aa, puis la note d'ensemble dans carnet_note. La note suit le chemin habituel (carnet → feuille de notes →
// délibération). Écrit une fois ici : trois portes, une seule règle d'écriture.
// ─────────────────────────────────────────────────────────────────────────────
import db from '../db/index.js';
import { acquisDuCours } from '../routes/mesCours.js';
import { lireValeur, notesParAcquis, noteDEnsemble } from './carnet.js';
import { migrerFiches, REMPLI_PAR } from '../routes/fichesEvaluation.js';

/** Les fiches d'une UE (domaine tfe | stage) pour un étudiant ; `aMoi(fiche)` dit si le lecteur la remplit. */
export function fichesPour(domaine, annee, ueNum, etudiantId, aMoi = () => false) {
  migrerFiches();
  const fiches = db.prepare(`SELECT * FROM fiche_modele WHERE annee_scolaire = ? AND domaine = ? AND ue_num = ? ORDER BY ordre, id`)
    .all(annee, domaine, ueNum);
  const crit = db.prepare('SELECT aa_code, poids, consigne FROM fiche_critere WHERE fiche_id = ? ORDER BY ordre, aa_code');
  const noteAA = db.prepare('SELECT points, mention, saisi_par, saisi_le FROM carnet_note_aa WHERE evaluation_id = ? AND etudiant_id = ? AND aa_code = ?');
  const ensemble = db.prepare('SELECT points, mention FROM carnet_note WHERE evaluation_id = ? AND etudiant_id = ?');
  return fiches.map(f => {
    const libelles = new Map(acquisDuCours(f.cours_code, f.ue_num, f.annee_scolaire).map(a => [a.aa_code, a.description]));
    const criteres = crit.all(f.id).map(c => ({
      ...c, description: libelles.get(c.aa_code) || db.prepare('SELECT description FROM aa WHERE aa_code = ?').get(c.aa_code)?.description || '',
      note: f.evaluation_id ? noteAA.get(f.evaluation_id, etudiantId, c.aa_code) || null : null,
    }));
    return {
      id: f.id, intitule: f.intitule, moment: f.moment, sur: f.sur, cours_code: f.cours_code,
      rempli_par: f.rempli_par, rempli_par_libelle: REMPLI_PAR[domaine]?.[f.rempli_par] || f.rempli_par,
      a_moi: !!aMoi(f), criteres,
      ensemble: f.evaluation_id ? ensemble.get(f.evaluation_id, etudiantId) || null : null,
    };
  });
}

/** Écrire les notes d'une fiche pour un étudiant : [{ aa_code, valeur }] (points, PP · NP · CM, vide = effacer). Tout ou rien.
 *  Rend { ok, ecrites } ou { status, error, erreurs }. */
export function ecrireFiche(f, etudiantId, notes, auteur) {
  if (!f?.evaluation_id) return { status: 404, error: 'Fiche introuvable.' };
  const ev = db.prepare('SELECT * FROM carnet_evaluation WHERE id = ?').get(f.evaluation_id);
  if (!ev) return { status: 404, error: 'L’évaluation du carnet de cette fiche est introuvable.' };
  const liens = new Set(db.prepare('SELECT aa_code FROM carnet_evaluation_aa WHERE evaluation_id = ?').all(ev.id).map(x => x.aa_code));
  const lues = [], erreurs = [];
  for (const l of Array.isArray(notes) ? notes : []) {
    const aa = String(l?.aa_code || '');
    if (!liens.has(aa)) { erreurs.push(`acquis ${aa || '(aucun)'} hors de cette fiche`); continue; }
    const v = lireValeur(l?.valeur, ev.sur);
    if (v.erreur) { erreurs.push(`${aa} : ${v.erreur}`); continue; }
    lues.push({ aa, ...v });
  }
  if (erreurs.length) return { status: 400, error: erreurs.join(' · '), erreurs };
  const evx = { ...ev, aa: db.prepare('SELECT aa_code, poids FROM carnet_evaluation_aa WHERE evaluation_id = ?').all(ev.id) };
  const poserAA = db.prepare(`INSERT INTO carnet_note_aa (evaluation_id, etudiant_id, aa_code, points, mention, saisi_par, saisi_le)
    VALUES (?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(evaluation_id, etudiant_id, aa_code) DO UPDATE SET points = excluded.points, mention = excluded.mention,
      saisi_par = excluded.saisi_par, saisi_le = excluded.saisi_le`);
  const oterAA = db.prepare('DELETE FROM carnet_note_aa WHERE evaluation_id = ? AND etudiant_id = ? AND aa_code = ?');
  const poser = db.prepare(`INSERT INTO carnet_note (evaluation_id, etudiant_id, points, mention, saisi_par, saisi_le)
    VALUES (?,?,?,?,?,datetime('now'))
    ON CONFLICT(evaluation_id, etudiant_id) DO UPDATE SET points = excluded.points, mention = excluded.mention,
      saisi_par = excluded.saisi_par, saisi_le = excluded.saisi_le`);
  const oter = db.prepare('DELETE FROM carnet_note WHERE evaluation_id = ? AND etudiant_id = ?');
  let n = 0;
  db.transaction(() => {
    for (const x of lues) {
      if (x.points == null && !x.mention) n += oterAA.run(ev.id, etudiantId, x.aa).changes;
      else { poserAA.run(ev.id, etudiantId, x.aa, x.points, x.mention, auteur); n++; }
    }
    const tot = noteDEnsemble(evx, (notesParAcquis([evx]).get(ev.id) || new Map()).get(etudiantId));
    if (!tot) oter.run(ev.id, etudiantId); else poser.run(ev.id, etudiantId, tot.points, tot.mention, auteur);
  })();
  return { ok: true, ecrites: n };
}
