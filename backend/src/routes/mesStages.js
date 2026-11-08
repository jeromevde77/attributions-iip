// ─────────────────────────────────────────────────────────────────────────────
// MES STAGES ET LE LIEN DU MAÎTRE DE STAGE (3.5.213, Charles, 8 novembre 2026 : « il faut avancer » ; choisis : la fiche du
// superviseur et une porte pour le maître de stage).
//
// Le SUPERVISEUR (le professeur de stage, `stage.professeur_id`) voit ses stages de l'année — étudiant, lieu, maître de
// stage, période, visites — et les fiches d'évaluation de l'UE (domaine stage). Il remplit celles du superviseur ; il peut
// aussi encoder celle du maître de stage à sa place (règle d'avant), ou lui ENVOYER UN LIEN.
//
// Le MAÎTRE DE STAGE n'a pas de compte : un lien `/evaluation-stage/<jeton>` (32 octets aléatoires ; la base n'en garde que
// l'empreinte SHA-256), pour UN stage et UNE fiche, valable 60 jours, envoyé à son adresse. Un nouveau lien révoque l'ancien.
// Il voit l'étudiant, le lieu, la période et les critères ; ses notes s'écrivent comme les autres (`ecrireFiche`) au nom
// « NOM (maître de stage, par lien) » ; il peut corriger tant que le lien vaut. Le superviseur est prévenu à chaque envoi.
// Monté sur /api/mes-cours/stages (avant les routes paramétriques) ; la page publique sur /api/evaluation-stage.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express';
import { randomBytes, createHash } from 'crypto';
import db from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { anneeDeTravail } from '../helpers/annee.js';
import { fichesPour, ecrireFiche } from '../lib/fichesNotes.js';
import { REMPLI_PAR } from './fichesEvaluation.js';
import { envoyerEmail, templateNotif } from '../services/mailer.js';

const r = Router();
export const publique = Router();
const qui = req => req.user?.email || req.user?.nom || null;
const empreinte = j => createHash('sha256').update(String(j)).digest('hex');
const JOURS_LIEN = 60;
const base = () => String(process.env.LUCIE_URL || 'https://www.lucie-iip.be').replace(/\/+$/, '');
const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
const echap = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function migrerLienMaitre(dbx = db) {
  dbx.exec(`CREATE TABLE IF NOT EXISTS stage_lien_maitre (id INTEGER PRIMARY KEY AUTOINCREMENT, stage_id INTEGER NOT NULL,
    fiche_id INTEGER NOT NULL, empreinte TEXT NOT NULL UNIQUE, email TEXT, nom TEXT, cree_par TEXT, cree_le TEXT DEFAULT (datetime('now')),
    expire_le TEXT NOT NULL, revoque_le TEXT, ouvert_le TEXT, rempli_le TEXT);
    CREATE INDEX IF NOT EXISTS idx_lien_maitre ON stage_lien_maitre(stage_id, fiche_id);`);
}

function profDe(req) {
  if (req.user?.apercuProfId) return req.user.apercuProfId;
  try { return db.prepare('SELECT professeur_id FROM utilisateur WHERE id = ?').get(req.user?.id)?.professeur_id || null; } catch { return null; }
}
/** Le superviseur remplit sa fiche, et celle du maître de stage à sa place. */
const remplit = f => f.rempli_par === 'superviseur' || f.rempli_par === 'maitre_stage';

const SQL_STAGE = `SELECT s.*, e.nom etud_nom, e.prenom etud_prenom, e.email_ecole, e.section_rattachement sec,
    l.nom lieu_nom, l.service lieu_service, l.adresse lieu_adresse, l.cp lieu_cp, l.localite lieu_localite,
    (SELECT ue_nom FROM ue u WHERE u.ue_num = s.ue_num ORDER BY u.annee_scolaire DESC LIMIT 1) AS ue_nom
  FROM stage s JOIN etudiant e ON e.id = s.etudiant_id LEFT JOIN stage_lieu l ON l.id = s.lieu_id`;

function liensDe(stageId) {
  migrerLienMaitre();
  return db.prepare(`SELECT fiche_id, email, cree_le, expire_le, ouvert_le, rempli_le FROM stage_lien_maitre
    WHERE stage_id = ? AND revoque_le IS NULL ORDER BY id DESC`).all(stageId);
}

r.get('/', authRequired, (req, res) => {
  const profId = profDe(req);
  const annee = String(req.query.annee || anneeDeTravail(req));
  if (!profId) return res.json({ annee, relie: false, stages: [] });
  const liste = db.prepare(`${SQL_STAGE} WHERE s.annee_scolaire = ? AND s.professeur_id = ? AND COALESCE(s.statut, '') <> 'annule'
    ORDER BY s.date_debut, e.nom, e.prenom`).all(annee, profId);
  let vis = null; try { vis = db.prepare("SELECT SUM(statut = 'prevue') prevues, SUM(statut = 'faite') faites, MIN(CASE WHEN statut = 'prevue' AND date >= date('now') THEN date END) prochaine FROM stage_visite WHERE stage_id = ?"); } catch { vis = null; }
  const auj = new Date().toISOString().slice(0, 10);
  const stages = liste.map(s => {
    const v = vis ? vis.get(s.id) : null;
    const liens = liensDe(s.id);
    return {
      id: s.id, etudiant: { id: s.etudiant_id, nom: s.etud_nom, prenom: s.etud_prenom, email: s.email_ecole },
      section: s.section || s.sec || null, ue_num: s.ue_num, ue_nom: s.ue_nom, intitule: s.intitule, domaine: s.domaine,
      lieu: { nom: s.lieu_nom, service: s.lieu_service, adresse: [s.lieu_adresse, [s.lieu_cp, s.lieu_localite].filter(Boolean).join(' ')].filter(Boolean).join(', ') },
      maitre: { nom: s.maitre_stage, fonction: s.maitre_fonction, email: s.maitre_email, tel: s.maitre_tel },
      debut: s.date_debut, fin: s.date_fin, statut: s.statut, en_cours: !!(s.date_debut && s.date_debut <= auj && (!s.date_fin || s.date_fin >= auj)),
      heures_prevues: s.heures_prevues, heures_effectuees: s.heures_effectuees,
      visites: { prevues: v?.prevues || 0, faites: v?.faites || 0, prochaine: v?.prochaine || null },
      fiches: s.ue_num ? fichesPour('stage', s.annee_scolaire, s.ue_num, s.etudiant_id, remplit).map(f => ({
        ...f, lien: f.rempli_par === 'maitre_stage' ? liens.find(l => l.fiche_id === f.id) || null : undefined,
      })) : [],
    };
  });
  res.json({ annee, relie: true, stages });
});

function stageDuSuperviseur(req) {
  const profId = profDe(req);
  const s = db.prepare('SELECT * FROM stage WHERE id = ?').get(Number(req.params.stageId));
  return s && profId && s.professeur_id === profId ? s : null;
}
const ficheDuStage = (s, ficheId) => db.prepare(`SELECT * FROM fiche_modele WHERE id = ? AND domaine = 'stage' AND ue_num = ? AND annee_scolaire = ?`)
  .get(Number(ficheId), s.ue_num, s.annee_scolaire);

r.put('/:stageId/fiche/:ficheId', authRequired, (req, res) => {
  const s = stageDuSuperviseur(req);
  if (!s) return res.status(404).json({ error: 'Stage introuvable.' });
  const f = ficheDuStage(s, req.params.ficheId);
  if (!f) return res.status(404).json({ error: 'Fiche introuvable pour ce stage.' });
  if (!remplit(f)) return res.status(403).json({ error: `Cette fiche se remplit par : ${REMPLI_PAR.stage[f.rempli_par] || f.rempli_par}.` });
  const x = ecrireFiche(f, s.etudiant_id, req.body?.notes, qui(req));
  if (!x.ok) return res.status(x.status).json({ error: x.error, erreurs: x.erreurs });
  res.json(x);
});

// Envoyer le lien au maître de stage (adresse du stage, ou celle donnée ; elle est alors retenue sur le stage).
r.post('/:stageId/fiche/:ficheId/lien', authRequired, async (req, res) => {
  migrerLienMaitre();
  const s = stageDuSuperviseur(req);
  if (!s) return res.status(404).json({ error: 'Stage introuvable.' });
  const f = ficheDuStage(s, req.params.ficheId);
  if (!f || f.rempli_par !== 'maitre_stage') return res.status(404).json({ error: 'Cette fiche ne se remplit pas par le maître de stage.' });
  if (!f.evaluation_id) return res.status(409).json({ error: 'La fiche n’est pas encore réglée (Organisation → Stages → Fiches d’évaluation).' });
  const email = String(req.body?.email || s.maitre_email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Donnez l’adresse du maître de stage.' });
  const jeton = randomBytes(32).toString('base64url');
  const expire = new Date(Date.now() + JOURS_LIEN * 86400000).toISOString().slice(0, 10);
  const etu = db.prepare('SELECT nom, prenom FROM etudiant WHERE id = ?').get(s.etudiant_id) || {};
  const lieu = s.lieu_id ? db.prepare('SELECT nom FROM stage_lieu WHERE id = ?').get(s.lieu_id)?.nom : null;
  const prof = db.prepare("SELECT TRIM(COALESCE(prenom, '') || ' ' || UPPER(nom)) n FROM professeur WHERE id = ?").get(s.professeur_id)?.n || '';
  const objet = `Évaluation du stage de ${etu.prenom || ''} ${String(etu.nom || '').toUpperCase()}`.trim();
  const corps = `<p>Madame, Monsieur,</p>
    <p>Vous accueillez en stage ${echap(etu.prenom)} ${echap(String(etu.nom || '').toUpperCase())}${lieu ? ` (${echap(lieu)})` : ''}${s.date_debut ? `, du ${fr(s.date_debut)}${s.date_fin ? ` au ${fr(s.date_fin)}` : ''}` : ''}.
    Nous vous remercions de bien vouloir remplir la fiche « ${echap(f.intitule)} » en suivant le lien ci-dessous. Aucun compte n’est nécessaire.</p>
    <p>Le lien est personnel et vaut jusqu’au ${fr(expire)} ; vous pouvez y revenir pour corriger.</p>
    <p>${prof ? `${echap(prof)}, professeur de stage` : 'Le professeur de stage'}<br>Institut Ilya Prigogine</p>`;
  try {
    const env = await envoyerEmail({ to: email, subject: objet, html: templateNotif({ titre: objet, corps, lien: `/evaluation-stage/${jeton}`, lienTexte: 'Remplir la fiche' }),
      text: `${objet}\n\nRemplir la fiche : ${base()}/evaluation-stage/${jeton}\nLien valable jusqu’au ${fr(expire)}.` });
    if (env && env.ok === false) throw new Error(env.erreur || 'envoi refusé');
  } catch (e) { return res.status(502).json({ error: `Le courriel n’est pas parti : ${e.message}` }); }
  db.transaction(() => {
    db.prepare("UPDATE stage_lien_maitre SET revoque_le = datetime('now') WHERE stage_id = ? AND fiche_id = ? AND revoque_le IS NULL").run(s.id, f.id);
    db.prepare(`INSERT INTO stage_lien_maitre (stage_id, fiche_id, empreinte, email, nom, cree_par, expire_le) VALUES (?,?,?,?,?,?,?)`)
      .run(s.id, f.id, empreinte(jeton), email, s.maitre_stage || null, qui(req), expire);
    if (!s.maitre_email) db.prepare('UPDATE stage SET maitre_email = ? WHERE id = ?').run(email, s.id);
  })();
  res.json({ ok: true, email, expire_le: expire });
});

// ── La page du maître de stage (sans compte) ──
function lienValide(jeton) {
  migrerLienMaitre();
  const l = db.prepare('SELECT * FROM stage_lien_maitre WHERE empreinte = ?').get(empreinte(jeton || ''));
  if (!l || l.revoque_le || l.expire_le < new Date().toISOString().slice(0, 10)) return null;
  const s = db.prepare('SELECT * FROM stage WHERE id = ?').get(l.stage_id);
  const f = s ? ficheDuStage(s, l.fiche_id) : null;
  return s && f && f.evaluation_id ? { l, s, f } : null;
}
const PERIME = 'Ce lien n’est plus valable (remplacé, ou plus de 60 jours). Demandez-en un nouveau au professeur de stage.';

publique.get('/:jeton', (req, res) => {
  const x = lienValide(req.params.jeton);
  if (!x) return res.status(404).json({ error: PERIME });
  const { l, s, f } = x;
  if (!l.ouvert_le) db.prepare("UPDATE stage_lien_maitre SET ouvert_le = datetime('now') WHERE id = ?").run(l.id);
  const etu = db.prepare('SELECT nom, prenom FROM etudiant WHERE id = ?').get(s.etudiant_id) || {};
  const lieu = s.lieu_id ? db.prepare('SELECT nom, service FROM stage_lieu WHERE id = ?').get(s.lieu_id) : null;
  const ue = db.prepare('SELECT ue_nom FROM ue WHERE ue_num = ? ORDER BY annee_scolaire DESC LIMIT 1').get(s.ue_num)?.ue_nom || '';
  const prof = db.prepare("SELECT TRIM(COALESCE(prenom, '') || ' ' || UPPER(nom)) n FROM professeur WHERE id = ?").get(s.professeur_id)?.n || null;
  const fiche = fichesPour('stage', s.annee_scolaire, s.ue_num, s.etudiant_id, () => true).find(z => z.id === f.id);
  res.json({
    etudiant: `${String(etu.nom || '').toUpperCase()} ${etu.prenom || ''}`.trim(), lieu: lieu ? [lieu.nom, lieu.service].filter(Boolean).join(' — ') : null,
    unite: ue, debut: s.date_debut, fin: s.date_fin, superviseur: prof, maitre: s.maitre_stage || null, expire_le: l.expire_le, rempli_le: l.rempli_le,
    fiche: { intitule: fiche.intitule, moment: fiche.moment, sur: fiche.sur, criteres: fiche.criteres.map(c => ({ aa_code: c.aa_code, description: c.description, consigne: c.consigne, note: c.note ? { points: c.note.points, mention: c.note.mention } : null })) },
  });
});

publique.put('/:jeton', (req, res) => {
  const x = lienValide(req.params.jeton);
  if (!x) return res.status(404).json({ error: PERIME });
  const { l, s, f } = x;
  const nom = String(req.body?.nom || l.nom || s.maitre_stage || 'Maître de stage').trim().slice(0, 120);
  const r2 = ecrireFiche(f, s.etudiant_id, req.body?.notes, `${nom} (maître de stage, par lien)`);
  if (!r2.ok) return res.status(r2.status).json({ error: r2.error, erreurs: r2.erreurs });
  db.prepare("UPDATE stage_lien_maitre SET rempli_le = datetime('now'), nom = ? WHERE id = ?").run(nom, l.id);
  try {
    const compte = db.prepare('SELECT id FROM utilisateur WHERE professeur_id = ? AND COALESCE(actif, 1) = 1 LIMIT 1').get(s.professeur_id);
    const etu = db.prepare('SELECT nom, prenom FROM etudiant WHERE id = ?').get(s.etudiant_id) || {};
    if (compte) db.prepare(`INSERT INTO lucie_notification (type, titre, corps, lien, cible_role, cible_user_id, cree_par, section)
      VALUES ('stage_maitre', ?, ?, '/mes-cours', NULL, ?, ?, ?)`)
      .run(`Fiche du maître de stage remplie — ${String(etu.nom || '').toUpperCase()} ${etu.prenom || ''}`.trim(),
        `${nom} a rempli « ${f.intitule} ».`, compte.id, nom, s.section || null);
  } catch { /* la notification ne bloque pas l'enregistrement */ }
  res.json(r2);
});

export default r;
