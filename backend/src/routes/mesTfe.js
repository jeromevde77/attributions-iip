// ─────────────────────────────────────────────────────────────────────────────
// MES TFE (3.5.210, Charles, 7 novembre 2026 : « avons-nous tout pensé ? » ; tranché : le professeur voit ses TFE et leur
// suivi, et remplit les fiches d'évaluation de son rôle). Monté sur /api/mes-cours/tfe AVANT les routes paramétriques de Mes
// cours ; l'espace enseignant le lit par le relais.
//
// Ses TFE : ceux où sa fiche du personnel est membre du jury (`tfe_membre` : promoteur, copromoteur, lecteur, auditeur,
// président). Il y lit l'étudiant, la question de recherche, le calendrier des remises de la section et ce qui a été remis,
// les fichiers déposés depuis l'espace de l'étudiant, la défense. Les fiches : celles de l'UE du TFE (`fiche_modele`, domaine
// tfe) dont `rempli_par` est l'un de ses rôles — « le jury, de commun accord » est encodé par le promoteur. Une fiche s'écrit
// comme une évaluation « par acquis » du carnet (carnet_note_aa, puis la note d'ensemble dans carnet_note) : la note suit le
// chemin habituel (carnet → feuille de notes → délibération). Le promoteur n'a pas besoin d'être attribué au cours : c'est
// son rôle dans le jury qui lui ouvre la fiche, et pour CET étudiant seulement.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { anneeDeTravail } from '../helpers/annee.js';
import { acquisDuCours } from './mesCours.js';
import { lireValeur, notesParAcquis, noteDEnsemble } from '../lib/carnet.js';
import { migrerFiches, REMPLI_PAR } from './fichesEvaluation.js';
import { tfeEspaceDe } from '../lib/portailTfeStage.js';

const r = Router();
const qui = req => req.user?.email || req.user?.nom || null;
const ROLES = { promoteur: 'Promoteur', copromoteur: 'Copromoteur', lecteur: 'Lecteur', auditeur: 'Auditeur', president: 'Président du jury' };

function profDe(req) {
  if (req.user?.apercuProfId) return req.user.apercuProfId;
  try { return db.prepare('SELECT professeur_id FROM utilisateur WHERE id = ?').get(req.user?.id)?.professeur_id || null; } catch { return null; }
}
/** Les rôles de ce professeur dans ce TFE. */
const rolesDans = (tfeId, profId) => db.prepare('SELECT role FROM tfe_membre WHERE tfe_id = ? AND professeur_id = ?').all(tfeId, profId).map(x => x.role);
/** Une fiche se remplit par qui elle nomme ; « jury » = le promoteur l'encode. */
const remplit = (fiche, roles) => roles.includes(fiche.rempli_par) || (fiche.rempli_par === 'jury' && roles.includes('promoteur'));

function fichesDuTfe(t, roles) {
  migrerFiches();
  const fiches = db.prepare(`SELECT * FROM fiche_modele WHERE annee_scolaire = ? AND domaine = 'tfe' AND ue_num = ? ORDER BY ordre, id`)
    .all(t.annee_scolaire, t.ue_num);
  const crit = db.prepare('SELECT aa_code, poids, consigne FROM fiche_critere WHERE fiche_id = ? ORDER BY ordre, aa_code');
  const noteAA = db.prepare('SELECT points, mention, saisi_par, saisi_le FROM carnet_note_aa WHERE evaluation_id = ? AND etudiant_id = ? AND aa_code = ?');
  const ensemble = db.prepare('SELECT points, mention FROM carnet_note WHERE evaluation_id = ? AND etudiant_id = ?');
  return fiches.map(f => {
    const libelles = new Map(acquisDuCours(f.cours_code, f.ue_num, f.annee_scolaire).map(a => [a.aa_code, a.description]));
    const criteres = crit.all(f.id).map(c => ({
      ...c, description: libelles.get(c.aa_code) || db.prepare('SELECT description FROM aa WHERE aa_code = ?').get(c.aa_code)?.description || '',
      note: f.evaluation_id ? noteAA.get(f.evaluation_id, t.etudiant_id, c.aa_code) || null : null,
    }));
    return {
      id: f.id, intitule: f.intitule, moment: f.moment, sur: f.sur, cours_code: f.cours_code,
      rempli_par: f.rempli_par, rempli_par_libelle: REMPLI_PAR.tfe[f.rempli_par] || f.rempli_par,
      a_moi: remplit(f, roles), criteres,
      ensemble: f.evaluation_id ? ensemble.get(f.evaluation_id, t.etudiant_id) || null : null,
    };
  });
}

r.get('/', authRequired, (req, res) => {
  const profId = profDe(req);
  const annee = String(req.query.annee || anneeDeTravail(req));
  if (!profId) return res.json({ annee, relie: false, tfes: [] });
  const liste = db.prepare(`
    SELECT t.*, e.nom etud_nom, e.prenom etud_prenom, e.email_ecole, e.section_rattachement sec,
      (SELECT ue_nom FROM ue u WHERE u.ue_num = t.ue_num ORDER BY u.annee_scolaire DESC LIMIT 1) AS ue_nom
    FROM tfe t JOIN etudiant e ON e.id = t.etudiant_id
    WHERE t.annee_scolaire = ? AND EXISTS (SELECT 1 FROM tfe_membre m WHERE m.tfe_id = t.id AND m.professeur_id = ?)
    ORDER BY e.nom, e.prenom`).all(annee, profId);
  const membres = db.prepare(`SELECT m.role, m.nom_libre,
      (SELECT UPPER(p.nom) || ' ' || COALESCE(p.prenom, '') FROM professeur p WHERE p.id = m.professeur_id) AS nom
    FROM tfe_membre m WHERE m.tfe_id = ? ORDER BY m.ordre, m.id`);
  const jalons = db.prepare('SELECT * FROM tfe_jalon WHERE annee_scolaire = ? AND section = ? ORDER BY COALESCE(date_limite, \'9999\'), ordre, id');
  const remise = db.prepare('SELECT recu_le FROM tfe_remise WHERE tfe_id = ? AND jalon_id = ?');
  const tfes = liste.map(t => {
    const roles = rolesDans(t.id, profId);
    const section = t.section || t.sec || null;
    const esp = (() => { try { return tfeEspaceDe(t.id); } catch { return { questions: [], depots: [] }; } })();
    return {
      id: t.id, etudiant: { id: t.etudiant_id, nom: t.etud_nom, prenom: t.etud_prenom, email: t.email_ecole }, section,
      ue_num: t.ue_num, ue_nom: t.ue_nom, titre: t.titre, question: t.question_recherche || null,
      question_proposee: (esp.questions || []).find(q => q.etat === 'proposee') || null,
      roles, roles_libelles: roles.map(x => ROLES[x] || x),
      jury: membres.all(t.id).map(m => ({ role: ROLES[m.role] || m.role, nom: m.nom || m.nom_libre })),
      defense: { date: t.date_defense, heure: t.heure_defense, local: t.local_defense },
      jalons: section ? jalons.all(t.annee_scolaire, section).map(j => ({ id: j.id, libelle: j.libelle, date_limite: j.date_limite, recu_le: remise.get(t.id, j.id)?.recu_le || null })) : [],
      depots: esp.depots || [],
      fiches: t.ue_num ? fichesDuTfe(t, roles) : [],
    };
  });
  res.json({ annee, relie: true, tfes });
});

// Un fichier remis par l'étudiant : à un membre du jury de CE TFE.
r.get('/depot/:id', authRequired, (req, res) => {
  const profId = profDe(req);
  const d = db.prepare('SELECT * FROM tfe_depot WHERE id = ?').get(Number(req.params.id));
  if (!d || !profId || !rolesDans(d.tfe_id, profId).length) return res.status(404).json({ error: 'Fichier introuvable.' });
  if (!fs.existsSync(d.chemin)) return res.status(410).json({ error: 'Le fichier n’est plus sur le serveur.' });
  res.setHeader('Content-Type', d.type_mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(d.nom)}`);
  fs.createReadStream(d.chemin).pipe(res);
});

// Remplir une fiche : une note par critère (acquis), ou PP · NP · CM ; vide = effacer. Tout ou rien.
r.put('/:tfeId/fiche/:ficheId', authRequired, (req, res) => {
  migrerFiches();
  const profId = profDe(req);
  const t = db.prepare('SELECT * FROM tfe WHERE id = ?').get(Number(req.params.tfeId));
  if (!t || !profId) return res.status(404).json({ error: 'TFE introuvable.' });
  const roles = rolesDans(t.id, profId);
  if (!roles.length) return res.status(404).json({ error: 'TFE introuvable.' });
  const f = db.prepare(`SELECT * FROM fiche_modele WHERE id = ? AND domaine = 'tfe' AND ue_num = ? AND annee_scolaire = ?`)
    .get(Number(req.params.ficheId), t.ue_num, t.annee_scolaire);
  if (!f || !f.evaluation_id) return res.status(404).json({ error: 'Fiche introuvable pour ce TFE.' });
  if (!remplit(f, roles)) return res.status(403).json({ error: `Cette fiche se remplit par : ${REMPLI_PAR.tfe[f.rempli_par] || f.rempli_par}.` });
  const ev = db.prepare('SELECT * FROM carnet_evaluation WHERE id = ?').get(f.evaluation_id);
  if (!ev) return res.status(404).json({ error: 'L’évaluation du carnet de cette fiche est introuvable.' });
  const liens = new Set(db.prepare('SELECT aa_code FROM carnet_evaluation_aa WHERE evaluation_id = ?').all(ev.id).map(x => x.aa_code));
  const lues = [], erreurs = [];
  for (const l of Array.isArray(req.body?.notes) ? req.body.notes : []) {
    const aa = String(l?.aa_code || '');
    if (!liens.has(aa)) { erreurs.push(`acquis ${aa || '(aucun)'} hors de cette fiche`); continue; }
    const v = lireValeur(l?.valeur, ev.sur);
    if (v.erreur) { erreurs.push(`${aa} : ${v.erreur}`); continue; }
    lues.push({ aa, ...v });
  }
  if (erreurs.length) return res.status(400).json({ error: erreurs.join(' · '), erreurs });
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
      if (x.points == null && !x.mention) n += oterAA.run(ev.id, t.etudiant_id, x.aa).changes;
      else { poserAA.run(ev.id, t.etudiant_id, x.aa, x.points, x.mention, qui(req)); n++; }
    }
    const tot = noteDEnsemble(evx, (notesParAcquis([evx]).get(ev.id) || new Map()).get(t.etudiant_id));
    if (!tot) oter.run(ev.id, t.etudiant_id); else poser.run(ev.id, t.etudiant_id, tot.points, tot.mention, qui(req));
  })();
  res.json({ ok: true, ecrites: n });
});

export default r;
