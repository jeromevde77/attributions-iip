// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Travail de fin d'études (Charles, 15 octobre 2026 : « dans le dossier
// étudiant, comme pour les stages, prévoir une partie TFE ; il faut pouvoir
// encoder le titre »).
//
// Le TFE d'un étudiant : une année, une unité (l'épreuve intégrée, le plus
// souvent), un TITRE, un promoteur choisi dans le personnel, les dates de dépôt
// et de défense. Le titre est la seule valeur obligatoire : c'est lui qu'on
// demande. Un étudiant peut en avoir plusieurs (une reprise d'une année sur
// l'autre) : une ligne par année.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired, getUserSections } from '../middleware/auth.js';
import { estEpreuveIntegree } from './acquis.js';
import { envoyerEmail, templateNotif } from '../services/mailer.js';
import fs from 'fs';
import { tfeEspaceDe, traiterQuestion } from '../lib/portailTfeStage.js';

const r = Router();
const ECRITURE = ['admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat', 'coordination'];

export function migrerTfe(dbx) {
  try {
    dbx.exec(`
    CREATE TABLE IF NOT EXISTS tfe (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      etudiant_id     INTEGER NOT NULL,
      annee_scolaire  TEXT NOT NULL,
      ue_num          INTEGER,
      titre           TEXT NOT NULL,
      promoteur_id    INTEGER,
      date_depot      TEXT,
      date_defense    TEXT,
      remarques       TEXT,
      cree_par        TEXT,
      maj_par         TEXT,
      maj_le          TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tfe_etudiant ON tfe(etudiant_id, annee_scolaire);
    -- LE JURY (3.1.378) : promoteur, copromoteur, lecteur, auditeur, président. Une personne du
    -- personnel quand Lucie la reconnaît ; sinon le nom tel que le fichier l'écrit, à rattacher.
    CREATE TABLE IF NOT EXISTS tfe_membre (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      tfe_id        INTEGER NOT NULL,
      role          TEXT NOT NULL,
      professeur_id INTEGER,
      nom_libre     TEXT,
      ordre         INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_tfe_membre ON tfe_membre(tfe_id);
    `);
    /* L'ESPACE TFE D'ORGANISATION (3.5.069) : le calendrier des remises PAR SECTION ET PAR ANNÉE (tfe_jalon), ce que chaque
       étudiant a remis (tfe_remise), le local de défense et la trace des convocations et relances. */
    dbx.exec(`
    CREATE TABLE IF NOT EXISTS tfe_jalon (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      annee_scolaire TEXT NOT NULL,
      section        TEXT NOT NULL,
      libelle        TEXT NOT NULL,
      date_limite    TEXT,
      ordre          INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_tfe_jalon ON tfe_jalon(annee_scolaire, section);
    CREATE TABLE IF NOT EXISTS tfe_remise (
      tfe_id    INTEGER NOT NULL,
      jalon_id  INTEGER NOT NULL,
      recu_le   TEXT NOT NULL,
      recu_par  TEXT,
      PRIMARY KEY (tfe_id, jalon_id)
    );`);
    for (const c of ['heure_defense TEXT', 'section TEXT', 'origine TEXT', 'local_defense TEXT', 'convoque_le TEXT', 'relance_le TEXT']) { try { dbx.exec(`ALTER TABLE tfe ADD COLUMN ${c}`); } catch { /* déjà là */ } }
    // Le promoteur de 3.1.366 rejoint le jury.
    try {
      dbx.exec(`INSERT INTO tfe_membre (tfe_id, role, professeur_id)
        SELECT t.id, 'promoteur', t.promoteur_id FROM tfe t WHERE t.promoteur_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM tfe_membre m WHERE m.tfe_id = t.id AND m.role = 'promoteur')`);
    } catch { /* */ }
  } catch (e) { console.error('[migration] tfe :', e.message); }
}

// La coordination ne voit et n'écrit que les étudiants de ses sections.
function permis(req, etudId) {
  const perim = getUserSections(req.user);
  if (!perim) return true;
  const e = db.prepare('SELECT section_rattachement s FROM etudiant WHERE id = ?').get(etudId);
  if (e?.s && perim.includes(e.s)) return true;
  const secs = db.prepare(`SELECT DISTINCT u.section FROM etudiant_inscription i JOIN ue u ON u.ue_num = i.ue_num
    AND u.annee_scolaire = i.annee_scolaire WHERE i.etudiant_id = ?`).all(etudId).map(x => x.section);
  return secs.some(s => perim.includes(s));
}
const auteur = req => req.user?.nom || req.user?.email || null;
const propre = v => (v == null || String(v).trim() === '' ? null : String(v).trim());

export const ROLES_JURY = ['promoteur', 'copromoteur', 'lecteur', 'auditeur', 'president'];
// Préparée à l'usage : la table naît à la migration, après le chargement de ce module.
const membresDe = { all: id => db.prepare(`SELECT m.role, m.professeur_id, m.nom_libre,
    (SELECT UPPER(p.nom) || ' ' || COALESCE(p.prenom, '') FROM professeur p WHERE p.id = m.professeur_id) AS nom
  FROM tfe_membre m WHERE m.tfe_id = ? ORDER BY m.ordre, m.id`).all(id) };
function poserMembres(tfeId, membres) {
  db.prepare('DELETE FROM tfe_membre WHERE tfe_id = ?').run(tfeId);
  const ins = db.prepare('INSERT INTO tfe_membre (tfe_id, role, professeur_id, nom_libre, ordre) VALUES (?,?,?,?,?)');
  (membres || []).forEach((m, i) => {
    if (!ROLES_JURY.includes(m.role) || (!m.professeur_id && !String(m.nom_libre || '').trim())) return;
    ins.run(tfeId, m.role, m.professeur_id ? Number(m.professeur_id) : null, m.professeur_id ? null : String(m.nom_libre).trim(), i);
  });
  const promo = (membres || []).find(m => m.role === 'promoteur' && m.professeur_id);
  db.prepare('UPDATE tfe SET promoteur_id = ? WHERE id = ?').run(promo ? Number(promo.professeur_id) : null, tfeId);
}

r.get('/etudiant/:id', authRequired, (req, res) => {
  const etudId = Number(req.params.id);
  if (!permis(req, etudId)) return res.status(404).json({ error: 'Étudiant introuvable' });
  const liste = db.prepare(`
    SELECT t.*,
      /* Le serveur refuse l'alias extérieur dans le ORDER BY d'une sous-requête (15 octobre 2026 : l'onglet restait vide). */
      (SELECT ue_nom FROM ue u WHERE u.ue_num = t.ue_num ORDER BY u.annee_scolaire DESC LIMIT 1) AS ue_nom,
      (SELECT UPPER(p.nom) || ' ' || COALESCE(p.prenom, '') FROM professeur p WHERE p.id = t.promoteur_id) AS promoteur
    FROM tfe t WHERE t.etudiant_id = ? ORDER BY t.annee_scolaire DESC, t.id DESC`).all(etudId);
  for (const t of liste) { t.membres = membresDe.all(t.id); t.espace = tfeEspaceDe(t.id); }
  res.json(liste);
});

function valeurs(b) {
  return {
    annee_scolaire: propre(b.annee_scolaire), ue_num: b.ue_num ? Number(b.ue_num) : null, titre: propre(b.titre),
    promoteur_id: b.promoteur_id ? Number(b.promoteur_id) : null,
    date_depot: propre(b.date_depot), date_defense: propre(b.date_defense), remarques: propre(b.remarques),
    heure_defense: propre(b.heure_defense), local_defense: propre(b.local_defense),
  };
}

r.post('/', authRequired, roleRequired(...ECRITURE), (req, res) => {
  const etudId = Number(req.body.etudiant_id);
  if (!etudId || !permis(req, etudId)) return res.status(404).json({ error: 'Étudiant introuvable' });
  const v = valeurs(req.body);
  if (!v.titre) return res.status(400).json({ error: 'Le titre du TFE est obligatoire.' });
  if (!v.annee_scolaire) return res.status(400).json({ error: "L'année est obligatoire." });
  const id = db.prepare(`INSERT INTO tfe (etudiant_id, annee_scolaire, ue_num, titre, promoteur_id, date_depot, date_defense, heure_defense, remarques, cree_par, maj_par)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(etudId, v.annee_scolaire, v.ue_num, v.titre, v.promoteur_id, v.date_depot, v.date_defense, v.heure_defense, v.remarques, auteur(req), auteur(req)).lastInsertRowid;
  if (Array.isArray(req.body.membres)) poserMembres(id, req.body.membres);
  res.json({ id });
});

/* ─────────────────────────────────────────────────────────────────────────────
   L'ESPACE TFE D'ORGANISATION (3.5.069, Charles, 2 novembre 2026 : « il faudra encore un espace TFE » ; tranché : sujets et
   promoteurs, jalons et dépôts, défense et jury, lien avec l'épreuve intégrée). Organisation → TFE. Le TFE de chaque étudiant
   reste celui de sa fiche (même table) : cet espace en donne la vue de l'année, le calendrier des remises par section, le
   planning des défenses et les convocations. L'épreuve intégrée n'est pas réécrite : sa décision se LIT de l'inscription.
   ───────────────────────────────────────────────────────────────────────────── */
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const sectionDe = t => t.section || t.sec || null;
function dansPerimetre(req, section) {
  const perim = getUserSections(req.user);
  return !perim || (section && perim.includes(section));
}

/** Les UE d'épreuve intégrée de l'année (le référentiel ou la ligne annuelle, `estEpreuveIntegree`). */
function uesEI(annee) {
  return db.prepare('SELECT DISTINCT ue_num, section FROM ue WHERE annee_scolaire = ?').all(annee)
    .filter(u => estEpreuveIntegree(u.ue_num, annee));
}

function lireAnnee(req, annee) {
  const auj = aujourdhui();
  const tfes = db.prepare(`
    SELECT t.*, e.nom etud_nom, e.prenom etud_prenom, e.email_ecole, e.section_rattachement sec,
      (SELECT ue_nom FROM ue u WHERE u.ue_num = t.ue_num ORDER BY u.annee_scolaire DESC LIMIT 1) AS ue_nom
    FROM tfe t JOIN etudiant e ON e.id = t.etudiant_id
    WHERE t.annee_scolaire = ? ORDER BY e.nom, e.prenom`).all(annee).filter(t => dansPerimetre(req, sectionDe(t)));
  const jalons = db.prepare('SELECT * FROM tfe_jalon WHERE annee_scolaire = ? ORDER BY section, COALESCE(date_limite, \'9999\'), ordre, id').all(annee)
    .filter(j => dansPerimetre(req, j.section));
  const remises = db.prepare(`SELECT r.* FROM tfe_remise r JOIN tfe t ON t.id = r.tfe_id WHERE t.annee_scolaire = ?`).all(annee);
  const eis = uesEI(annee);
  const eiNums = [...new Set(eis.map(u => u.ue_num))];
  const decisionEI = db.prepare(`SELECT i.ue_num, i.resultat, i.points, i.resultat_s1, i.resultat_s2 FROM etudiant_inscription i
    WHERE i.etudiant_id = ? AND i.annee_scolaire = ? AND i.ue_num IN (${eiNums.map(() => '?').join(',') || 'NULL'}) LIMIT 1`);
  for (const t of tfes) {
    t.section = sectionDe(t);
    t.membres = membresDe.all(t.id);
    const mes = jalons.filter(j => j.section === t.section);
    t.remises = mes.map(j => ({ jalon_id: j.id, libelle: j.libelle, date_limite: j.date_limite,
      recu_le: remises.find(r => r.tfe_id === t.id && r.jalon_id === j.id)?.recu_le || null }));
    t.en_retard = t.remises.filter(r => !r.recu_le && r.date_limite && r.date_limite < auj).map(r => r.libelle);
    t.sans_jury = !t.membres.some(m => m.role === 'promoteur');
    t.ei = eiNums.length ? decisionEI.get(t.etudiant_id, annee, ...eiNums) || null : null;
  }
  // Les inscrits d'une épreuve intégrée de l'année qui n'ont pas de TFE encodé.
  const avec = new Set(tfes.map(t => t.etudiant_id));
  const sans = eiNums.length ? db.prepare(`
    SELECT DISTINCT e.id etudiant_id, e.nom etud_nom, e.prenom etud_prenom, e.section_rattachement section, i.ue_num,
      (SELECT ue_nom FROM ue u WHERE u.ue_num = i.ue_num ORDER BY u.annee_scolaire DESC LIMIT 1) AS ue_nom
    FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
    WHERE i.annee_scolaire = ? AND i.ue_num IN (${eiNums.map(() => '?').join(',')})
      AND COALESCE(e.sortie_statut, '') <> 'archive' ORDER BY e.nom, e.prenom`).all(annee, ...eiNums)
    .filter(x => !avec.has(x.etudiant_id) && dansPerimetre(req, x.section || eis.find(u => u.ue_num === x.ue_num)?.section)) : [];
  const sections = [...new Set([...tfes.map(t => t.section), ...sans.map(x => x.section), ...eis.map(u => u.section)].filter(Boolean))]
    .filter(s => dansPerimetre(req, s)).sort((a, b) => a.localeCompare(b, 'fr'));
  return {
    annee, tfe: tfes, sans_tfe: sans, jalons, sections, ues_ei: eis,
    synthese: {
      total: tfes.length, sans_tfe: sans.length,
      sans_promoteur: tfes.filter(t => t.sans_jury).length,
      en_retard: tfes.filter(t => t.en_retard.length).length,
      defense_posee: tfes.filter(t => t.date_defense).length,
      convoques: tfes.filter(t => t.convoque_le).length,
    },
  };
}

r.get('/annee', authRequired, (req, res) => {
  const annee = propre(req.query.annee);
  if (!annee) return res.status(400).json({ error: 'année requise' });
  res.json(lireAnnee(req, annee));
});

/** Le calendrier des remises d'une section : on renvoie la liste entière. Un jalon déjà remis ne se retire pas. */
r.put('/jalons', authRequired, roleRequired(...ECRITURE), (req, res) => {
  const { annee, section, jalons } = req.body || {};
  if (!annee || !section || !Array.isArray(jalons)) return res.status(400).json({ error: 'année, section et jalons requis' });
  if (!dansPerimetre(req, section)) return res.status(404).json({ error: 'Section hors de votre périmètre.' });
  const propres = jalons.map((j, i) => ({ id: j.id ? Number(j.id) : null, libelle: propre(j.libelle), date_limite: propre(j.date_limite), ordre: i }))
    .filter(j => j.libelle);
  const avant = db.prepare('SELECT id, libelle FROM tfe_jalon WHERE annee_scolaire = ? AND section = ?').all(annee, section);
  const gardes = new Set(propres.filter(j => j.id).map(j => j.id));
  for (const a of avant.filter(a => !gardes.has(a.id))) {
    const n = db.prepare('SELECT COUNT(*) n FROM tfe_remise WHERE jalon_id = ?').get(a.id).n;
    if (n) return res.status(409).json({ error: `« ${a.libelle} » porte déjà ${n} remise(s) : il ne se retire pas.` });
  }
  db.transaction(() => {
    for (const a of avant.filter(a => !gardes.has(a.id))) db.prepare('DELETE FROM tfe_jalon WHERE id = ?').run(a.id);
    for (const j of propres) {
      if (j.id && avant.some(a => a.id === j.id)) db.prepare('UPDATE tfe_jalon SET libelle = ?, date_limite = ?, ordre = ? WHERE id = ?').run(j.libelle, j.date_limite, j.ordre, j.id);
      else db.prepare('INSERT INTO tfe_jalon (annee_scolaire, section, libelle, date_limite, ordre) VALUES (?,?,?,?,?)').run(annee, section, j.libelle, j.date_limite, j.ordre);
    }
  })();
  res.json({ ok: true });
});

/** Ce que l'étudiant a remis : la date du jour par défaut ; `recu_le: null` efface. */
r.put('/:id/remise', authRequired, roleRequired(...ECRITURE), (req, res) => {
  const t = db.prepare('SELECT t.*, e.section_rattachement sec FROM tfe t JOIN etudiant e ON e.id = t.etudiant_id WHERE t.id = ?').get(Number(req.params.id));
  if (!t || !permis(req, t.etudiant_id)) return res.status(404).json({ error: 'TFE introuvable' });
  const j = db.prepare('SELECT * FROM tfe_jalon WHERE id = ?').get(Number(req.body?.jalon_id));
  if (!j || j.annee_scolaire !== t.annee_scolaire) return res.status(400).json({ error: 'Remise inconnue pour cette année.' });
  if (req.body.recu_le === null) db.prepare('DELETE FROM tfe_remise WHERE tfe_id = ? AND jalon_id = ?').run(t.id, j.id);
  else db.prepare(`INSERT INTO tfe_remise (tfe_id, jalon_id, recu_le, recu_par) VALUES (?,?,?,?)
    ON CONFLICT(tfe_id, jalon_id) DO UPDATE SET recu_le = excluded.recu_le, recu_par = excluded.recu_par`)
    .run(t.id, j.id, propre(req.body.recu_le) || aujourdhui(), auteur(req));
  res.json({ ok: true });
});

/** Relancer l'étudiant pour ce qui est en retard — à son adresse d'école, seulement. */
r.post('/:id/relancer', authRequired, roleRequired(...ECRITURE), async (req, res) => {
  const t = db.prepare('SELECT t.*, e.prenom, e.email_ecole, e.section_rattachement sec FROM tfe t JOIN etudiant e ON e.id = t.etudiant_id WHERE t.id = ?').get(Number(req.params.id));
  if (!t || !permis(req, t.etudiant_id)) return res.status(404).json({ error: 'TFE introuvable' });
  if (!t.email_ecole) return res.status(409).json({ error: 'Pas d’adresse d’école : la relance ne part pas.' });
  const sec = sectionDe(t);
  const retard = db.prepare(`SELECT j.* FROM tfe_jalon j WHERE j.annee_scolaire = ? AND j.section = ? AND j.date_limite < ?
    AND NOT EXISTS (SELECT 1 FROM tfe_remise r WHERE r.tfe_id = ? AND r.jalon_id = j.id) ORDER BY j.date_limite`).all(t.annee_scolaire, sec, aujourdhui(), t.id);
  if (!retard.length) return res.status(409).json({ error: 'Aucune remise en retard pour ce TFE.' });
  const corps = `<p>Bonjour ${t.prenom},</p><p>Pour votre travail de fin d’études « ${t.titre} », les remises suivantes n’ont pas été reçues :</p><ul>${retard.map(j => `<li>${j.libelle} — attendue le ${String(j.date_limite).split('-').reverse().join('/')}</li>`).join('')}</ul><p>Merci de les remettre au plus vite, ou de prendre contact avec votre promoteur.</p>`;
  try { await envoyerEmail({ to: t.email_ecole, subject: 'Votre TFE : remises attendues', html: templateNotif({ titre: 'Votre TFE : remises attendues', corps }) }); }
  catch (e) { return res.status(502).json({ error: `Le courriel n’est pas parti : ${e.message}` }); }
  db.prepare("UPDATE tfe SET relance_le = datetime('now') WHERE id = ?").run(t.id);
  res.json({ ok: true, a: t.email_ecole, remises: retard.map(j => j.libelle) });
});

/** Convoquer à la défense : l'étudiant (adresse d'école) et chaque membre du jury (adresse de l'institut). Simulation d'abord :
 *  elle dit qui reçoit, et ce qui empêche (date, heure ou local manquants, adresse absente). */
r.post('/convoquer', authRequired, roleRequired(...ECRITURE), async (req, res) => {
  const { ids, simulation = true } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'Aucun TFE choisi.' });
  const LIB = { promoteur: 'Promoteur', copromoteur: 'Copromoteur', lecteur: 'Lecteur', auditeur: 'Auditeur', president: 'Président du jury' };
  const lignes = [];
  for (const id of ids.map(Number)) {
    const t = db.prepare('SELECT t.*, e.nom, e.prenom, e.email_ecole, e.section_rattachement sec FROM tfe t JOIN etudiant e ON e.id = t.etudiant_id WHERE t.id = ?').get(id);
    if (!t || !permis(req, t.etudiant_id)) continue;
    const jury = db.prepare(`SELECT m.role, m.nom_libre, p.nom, p.prenom, p.adresse_mail FROM tfe_membre m LEFT JOIN professeur p ON p.id = m.professeur_id
      WHERE m.tfe_id = ? ORDER BY m.ordre, m.id`).all(id);
    const manque = [];
    if (!t.date_defense) manque.push('date'); if (!t.heure_defense) manque.push('heure'); if (!t.local_defense) manque.push('local');
    if (!jury.length) manque.push('jury');
    const dest = [];
    if (t.email_ecole) dest.push({ qui: `${String(t.nom).toUpperCase()} ${t.prenom}`, role: 'étudiant', email: t.email_ecole });
    else manque.push('adresse d’école de l’étudiant');
    const sansAdresse = [];
    for (const m of jury) {
      const nom = m.nom ? `${String(m.nom).toUpperCase()} ${m.prenom || ''}`.trim() : m.nom_libre;
      if (m.adresse_mail) dest.push({ qui: nom, role: LIB[m.role] || m.role, email: m.adresse_mail }); else sansAdresse.push(nom);
    }
    lignes.push({ id, t, jury, dest, manque, sans_adresse: sansAdresse,
      nom: `${String(t.nom).toUpperCase()} ${t.prenom}`, deja: t.convoque_le });
  }
  const pretes = lignes.filter(l => !l.manque.length);
  const resume = lignes.map(({ t, jury, ...l }) => ({ ...l, dest: l.dest.map(d => `${d.qui} (${d.role})`) }));
  if (simulation) return res.json({ simulation: true, lignes: resume, envoyables: pretes.length });
  const envoyes = [], echecs = [];
  for (const l of pretes) {
    const t = l.t;
    const quand = `le ${String(t.date_defense).split('-').reverse().join('/')} à ${t.heure_defense}, local ${t.local_defense}`;
    const juryHtml = l.jury.map(m => `<li>${LIB[m.role] || m.role} : ${m.nom ? `${m.prenom || ''} ${String(m.nom).toUpperCase()}`.trim() : m.nom_libre}</li>`).join('');
    const corps = `<p>La défense du travail de fin d’études de ${t.prenom} ${String(t.nom).toUpperCase()}, « ${t.titre} », aura lieu ${quand}.</p><p>Composition du jury :</p><ul>${juryHtml}</ul>`;
    try {
      for (const d of l.dest) await envoyerEmail({ to: d.email, subject: `Défense de TFE — ${t.prenom} ${String(t.nom).toUpperCase()}`, html: templateNotif({ titre: 'Convocation à la défense du TFE', corps }) });
      db.prepare("UPDATE tfe SET convoque_le = datetime('now') WHERE id = ?").run(t.id);
      envoyes.push(l.nom);
    } catch (e) { echecs.push({ nom: l.nom, erreur: e.message }); }
  }
  res.json({ simulation: false, envoyes, echecs, ignores: lignes.filter(l => l.manque.length).map(l => ({ nom: l.nom, manque: l.manque })) });
});

/* LA QUESTION DE RECHERCHE ET LES REMISES DÉPOSÉES DEPUIS L'ESPACE DE L'ÉTUDIANT (3.5.081). Accepter : elle devient la
   question du TFE ; renvoyer : avec un mot, que l'étudiant lit dans son espace. */
r.post('/question/:qid', authRequired, roleRequired(...ECRITURE), (req, res) => {
  const q = db.prepare('SELECT t.etudiant_id FROM tfe_question q JOIN tfe t ON t.id = q.tfe_id WHERE q.id = ?').get(Number(req.params.qid));
  if (!q || !permis(req, q.etudiant_id)) return res.status(404).json({ error: 'Proposition introuvable.' });
  const x = traiterQuestion(req.params.qid, { accepter: !!req.body?.accepter, mot: req.body?.mot }, req.user?.nom || req.user?.email);
  if (x.erreur) return res.status(400).json({ error: x.erreur });
  res.json(x);
});
r.get('/depot/:id', authRequired, (req, res) => {
  const d = db.prepare('SELECT d.*, t.etudiant_id FROM tfe_depot d JOIN tfe t ON t.id = d.tfe_id WHERE d.id = ?').get(Number(req.params.id));
  if (!d || !permis(req, d.etudiant_id)) return res.status(404).json({ error: 'Fichier introuvable.' });
  if (!fs.existsSync(d.chemin)) return res.status(410).json({ error: 'Le fichier n’est plus sur le serveur.' });
  res.setHeader('Content-Type', d.type_mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(d.nom)}`);
  fs.createReadStream(d.chemin).pipe(res);
});

r.put('/:id', authRequired, roleRequired(...ECRITURE), (req, res) => {
  const t = db.prepare('SELECT * FROM tfe WHERE id = ?').get(Number(req.params.id));
  if (!t || !permis(req, t.etudiant_id)) return res.status(404).json({ error: 'TFE introuvable' });
  const v = valeurs({ ...t, ...req.body });
  if (!v.titre) return res.status(400).json({ error: 'Le titre du TFE est obligatoire.' });
  db.prepare(`UPDATE tfe SET annee_scolaire = ?, ue_num = ?, titre = ?, promoteur_id = ?, date_depot = ?, date_defense = ?, heure_defense = ?, local_defense = ?, remarques = ?,
    maj_par = ?, maj_le = datetime('now') WHERE id = ?`)
    .run(v.annee_scolaire || t.annee_scolaire, v.ue_num, v.titre, v.promoteur_id, v.date_depot, v.date_defense, v.heure_defense, v.local_defense, v.remarques, auteur(req), t.id);
  if (Array.isArray(req.body.membres)) poserMembres(t.id, req.body.membres);
  res.json({ ok: true });
});

r.delete('/:id', authRequired, roleRequired(...ECRITURE), (req, res) => {
  const t = db.prepare('SELECT * FROM tfe WHERE id = ?').get(Number(req.params.id));
  if (!t || !permis(req, t.etudiant_id)) return res.status(404).json({ error: 'TFE introuvable' });
  db.prepare('DELETE FROM tfe_membre WHERE tfe_id = ?').run(t.id);
  db.prepare('DELETE FROM tfe_remise WHERE tfe_id = ?').run(t.id);
  db.prepare('DELETE FROM tfe WHERE id = ?').run(t.id);
  res.json({ ok: true });
});

/* L'IMPORT DES TFE (3.1.378, Charles, 15 octobre 2026 : « je souhaite importer des données de TFE » —
 * une liste TIM nom + titre, un tableau d'optométrie avec promoteur, les plannings de défense de
 * psychomotricité avec tout le jury). L'écran lit le fichier et remet des lignes ; le serveur retrouve
 * l'étudiant (nom, puis prénom ou son initiale), le jury dans le personnel (nom, ou initiales :
 * « AVdH », « LR »), et pose ou complète le TFE de l'année. Un nom de jury non reconnu reste en texte,
 * signalé. Simulation d'abord ; rien n'est écrasé par un vide. */
const norme = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const TITRES_CIVILS = /^(m|mr|mme|mlle|mrs|monsieur|madame|dr|pr)$/;
export function trouverProf(texte, profs) {
  const brut = String(texte || '').trim();
  if (!brut || /^x+$/i.test(brut)) return { libre: null };
  const mots = norme(brut).split(' ').filter(w => w && !TITRES_CIVILS.test(w));
  const s = ` ${mots.join(' ')} `;
  if (!mots.length) return { libre: brut };
  // Le nom de famille entier, et le prénom ou son initiale s'il est donné.
  let c = profs.filter(p => p.n && s.includes(` ${p.n} `));
  if (c.length > 1) {
    const reste = mots.filter(w => !c[0].n.split(' ').includes(w));
    const parPrenom = c.filter(p => reste.some(w => p.p && (p.p === w || p.p.startsWith(w) || p.p[0] === w[0])));
    if (parPrenom.length) c = parPrenom;
  } else if (c.length === 1) {
    const reste = mots.filter(w => !c[0].n.split(' ').includes(w));
    if (reste.length && c[0].p && !reste.some(w => c[0].p.startsWith(w) || w.startsWith(c[0].p) || c[0].p[0] === w[0])) c = [];
  }
  // Les initiales seules (« AVdH », « LR ») : un mot de 2 à 5 lettres.
  // « Vander Heyden » pour « VAN DER HEYDEN » : le nom sans ses espaces.
  if (!c.length) { const colle = mots.join(''); c = profs.filter(p => p.n.length >= 5 && colle.includes(p.n.replace(/ /g, ''))); }
  const sigle = mots.length === 1 ? mots[0] : mots.every(w => w.length <= 3) ? mots.join('') : '';   // « AVdH », « A VdH », « LR »
  if (!c.length && /^[a-z]{2,5}$/.test(sigle)) c = profs.filter(p => p.i === sigle);
  return c.length === 1 ? { id: c[0].id, nom: c[0].affiche } : { libre: brut, ambigu: c.length > 1 };
}
export function trouverEtudiant(l, etus) {
  let nom = norme(l.nom), prenom = norme(l.prenom);
  if (!prenom) {
    // « ABDELLAOUI Kenza » : les mots en capitales sont le nom ; « Golfinopoulos N » : l'initiale suit.
    const mots = String(l.nom || '').trim().split(/\s+/);
    // Une initiale (« W. », « E. ») n'est pas un nom en capitales.
    const caps = mots.filter(w => w.replace(/[.,]/g, '').length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w));
    if (caps.length && caps.length < mots.length) { nom = norme(caps.join(' ')); prenom = norme(mots.filter(w => !caps.includes(w)).join(' ')); }
    else if (mots.length > 1 && /^[A-Za-zÀ-ÿ]\.?,?$/.test(mots.at(-1))) { nom = norme(mots.slice(0, -1).join(' ')); prenom = norme(mots.at(-1)); }
  }
  if (!nom) return { erreur: 'nom absent' };
  let c = etus.filter(e => e.n === nom);
  if (!c.length) c = etus.filter(e => e.n.startsWith(nom + ' ') || nom.startsWith(e.n + ' ') || e.n.replace(/ /g, '') === nom.replace(/ /g, ''));
  if (prenom && c.length > 1) {
    const p1 = prenom.split(' ')[0];
    const f = c.filter(e => e.p === prenom || e.p.startsWith(p1) || (p1.length === 1 && e.p[0] === p1));
    if (f.length) c = f;
  } else if (prenom && c.length === 1) {
    const p1 = prenom.split(' ')[0];
    // Un prénom proche (« Myriam » pour « Miriam ») : même initiale et une seule personne de ce nom.
    const proche = (a, b) => a[0] === b[0] && Math.abs(a.length - b.length) <= 2 && [...a].filter((x, i) => b[i] === x).length >= Math.min(a.length, b.length) - 2;
    if (!(c[0].p === prenom || c[0].p.startsWith(p1) || p1.startsWith(c[0].p.split(' ')[0]) || (p1.length === 1 && c[0].p[0] === p1)
      || (p1.length > 2 && proche(p1, c[0].p.split(' ')[0])))) c = [];
  }
  if (c.length > 1 && l.section) { const ns = norme(l.section); const f = c.filter(e => norme(e.s).startsWith(ns)); if (f.length) c = f; }
  if (c.length > 1) { const f = c.filter(e => e.actif); if (f.length === 1) c = f; }
  if (c.length === 1) return { id: c[0].id, nom: c[0].affiche };
  return { erreur: c.length ? `${c.length} étudiants possibles` : 'étudiant introuvable' };
}

r.post('/import', authRequired, roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat'), (req, res) => {
  const { annee, lignes, simulation = true, section = null, origine = null } = req.body || {};
  if (!annee || !Array.isArray(lignes) || !lignes.length) return res.status(400).json({ error: 'année et lignes requises' });
  const profs = db.prepare('SELECT id, nom, prenom FROM professeur WHERE COALESCE(est_a_designer, 0) = 0').all().map(p => ({
    id: p.id, n: norme(p.nom), p: norme(p.prenom), affiche: `${String(p.nom || '').toUpperCase()} ${p.prenom || ''}`.trim(),
    i: norme(`${p.prenom || ''} ${p.nom || ''}`).split(' ').filter(Boolean).map(w => w[0]).join(''),
  }));
  const etus = db.prepare(`SELECT e.id, e.nom, e.prenom, e.section_rattachement s,
      EXISTS (SELECT 1 FROM etudiant_inscription i WHERE i.etudiant_id = e.id AND i.annee_scolaire = ?) AS actif
    FROM etudiant e WHERE COALESCE(e.sortie_statut, '') <> 'archive'`).all(annee)
    .map(e => ({ ...e, n: norme(e.nom), p: norme(e.prenom), affiche: `${String(e.nom || '').toUpperCase()} ${e.prenom || ''}`.trim() }));
  const perim = getUserSections(req.user);
  const rapport = { simulation: !!simulation, crees: 0, completes: 0, inchanges: 0, ignores: [], jury_libre: [], details: [] };
  const ecrire = db.transaction(() => {
    lignes.forEach((l, k) => {
      const titre = propre(l.titre);
      const e = trouverEtudiant({ ...l, section: l.section || section }, etus);
      if (!e.id) { rapport.ignores.push({ ligne: k + 1, nom: [l.nom, l.prenom].filter(Boolean).join(' '), raison: e.erreur }); return; }
      if (perim && !permis(req, e.id)) { rapport.ignores.push({ ligne: k + 1, nom: e.nom, raison: 'hors de votre périmètre' }); return; }
      const membres = [];
      for (const role of ROLES_JURY) {
        for (const morceau of String(l[role] || '').split(/\s*[;/]\s*|\s+et\s+/).filter(x => x.trim())) {
          const m = trouverProf(morceau, profs);
          if (m.id) membres.push({ role, professeur_id: m.id, affiche: m.nom });
          else if (m.libre) { membres.push({ role, nom_libre: m.libre, affiche: `« ${m.libre} »` }); rapport.jury_libre.push({ nom: e.nom, role, texte: m.libre, ambigu: !!m.ambigu }); }
        }
      }
      const anneeL = propre(l.annee) && /^\d{4}-\d{4}$/.test(String(l.annee).trim()) ? String(l.annee).trim() : annee;
      const ex = db.prepare('SELECT * FROM tfe WHERE etudiant_id = ? AND annee_scolaire = ? ORDER BY id LIMIT 1').get(e.id, anneeL);
      const d = { nom: e.nom, annee: anneeL, titre: titre || ex?.titre || null, jury: membres.map(m => `${m.role} ${m.affiche}`).join(' · ') };
      if (!ex) {
        if (!titre) { rapport.ignores.push({ ligne: k + 1, nom: e.nom, raison: 'sans titre' }); return; }
        rapport.crees++; rapport.details.push({ ...d, action: 'créé' });
        if (simulation) return;
        const id = db.prepare(`INSERT INTO tfe (etudiant_id, annee_scolaire, titre, date_defense, heure_defense, section, origine, cree_par, maj_par)
          VALUES (?,?,?,?,?,?,?,?,?)`).run(e.id, anneeL, titre, propre(l.date_defense), propre(l.heure), etus.find(x => x.id === e.id)?.s || section, origine, auteur(req), auteur(req)).lastInsertRowid;
        if (membres.length) poserMembres(id, membres);
        return;
      }
      // Compléter sans écraser : un champ vide du fichier ne vide rien ; le jury s'ajoute rôle par rôle.
      const deja = membresDe.all(ex.id);
      const rolesNouveaux = new Set(membres.map(m => m.role));
      const fusion = [...deja.filter(m => !rolesNouveaux.has(m.role)), ...membres];
      const change = (titre && titre !== ex.titre) || (propre(l.date_defense) && propre(l.date_defense) !== ex.date_defense)
        || (propre(l.heure) && propre(l.heure) !== ex.heure_defense)
        || membres.some(m => !deja.some(x => x.role === m.role && (m.professeur_id ? x.professeur_id === m.professeur_id : x.nom_libre === m.nom_libre)));
      if (!change) { rapport.inchanges++; rapport.details.push({ ...d, action: 'inchangé' }); return; }
      rapport.completes++; rapport.details.push({ ...d, action: 'complété' });
      if (simulation) return;
      db.prepare(`UPDATE tfe SET titre = COALESCE(?, titre), date_defense = COALESCE(?, date_defense), heure_defense = COALESCE(?, heure_defense),
        maj_par = ?, maj_le = datetime('now') WHERE id = ?`).run(titre, propre(l.date_defense), propre(l.heure), auteur(req), ex.id);
      if (membres.length) poserMembres(ex.id, fusion);
    });
  });
  ecrire();
  res.json(rapport);
});

export default r;
