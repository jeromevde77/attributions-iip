// ─────────────────────────────────────────────────────────────────────────────
// LES CANDIDATURES DES ENSEIGNANTS (3.5.229, Charles, 8 novembre 2026 — formulaires 013 « candidature à titre définitif » et 014
// « candidature à titre temporaire », jusqu'ici en Word). Une CAMPAGNE par année visée, ouverte par la direction (du … au …) ;
// l'enseignant y répond depuis son espace (par le relais) : sa situation est reprise de Lucie (périodes de chargé de cours,
// d'expert, nominations définitives de l'année en cours), puis il choisit — maintenir ses attributions, une augmentation de charge,
// renoncer à toute sa charge, être engagé dans des cours (temporaire) ou à titre définitif dans des UE — et confirme être dans les
// conditions légales. Le dépôt vaut ACCUSÉ DE RÉCEPTION (date et heure, au nom du compte) : le « cadre réservé à l'administration »
// du papier. La coordination (ses sections) et la direction analysent ; la direction transmet au CA pour le définitif.
// Une candidature se remplace tant que la campagne est ouverte et qu'elle n'a pas été analysée ; l'historique reste (statut
// « remplacee »). Rien n'écrit d'attribution : la proposition d'attributions suit son propre chemin.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, getUserSections } from '../middleware/auth.js';
import { anneeDeTravail } from '../helpers/annee.js';
import { envelopperDocument } from '../lib/document.js';

const r = Router();
const DIRECTION = ['admin', 'directeur', 'directeur_adjoint'];
const LISENT = [...DIRECTION, 'coordination', 'secretariat', 'editeur'];
const STATUTS = { deposee: 'Reçue', analysee: 'Analysée', transmise_ca: 'Transmise au CA', retenue: 'Retenue', non_retenue: 'Non retenue', remplacee: 'Remplacée', retiree: 'Retirée' };

try {
  db.exec(`CREATE TABLE IF NOT EXISTS candidature_mdp (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    annee_cible     TEXT NOT NULL,
    professeur_id   INTEGER NOT NULL,
    user_id         INTEGER,
    situation       TEXT,              -- JSON : périodes de l'année en cours, reprises de Lucie au dépôt
    maintien        INTEGER NOT NULL DEFAULT 0,
    augmentation    INTEGER,           -- périodes AU TOTAL souhaitées
    renonce         INTEGER NOT NULL DEFAULT 0,
    temporaire      INTEGER NOT NULL DEFAULT 0,   -- être engagé comme chargé de cours dans des cours
    definitif       INTEGER NOT NULL DEFAULT 0,   -- être engagé à titre définitif dans des UE
    lignes          TEXT,              -- JSON [{ nature, section, ue_num, cours_code, cours_nom, periodes }]
    remarque        TEXT,
    conditions      INTEGER NOT NULL DEFAULT 0,   -- « je confirme être dans les conditions légales »
    statut          TEXT NOT NULL DEFAULT 'deposee',
    depose_le       TEXT DEFAULT (datetime('now')),
    decide_par      TEXT, decide_le TEXT, mot TEXT
  )`);
} catch (e) { console.error('[migration] candidature_mdp :', e.message); }

const lireJSON = (v, d) => { try { return JSON.parse(v); } catch { return d; } };
function reglage() {
  return lireJSON(db.prepare(`SELECT valeur FROM lucie_config WHERE cle = 'candidatures'`).get()?.valeur, null) || {};
}
const ouverte = (g, jour = new Date().toISOString().slice(0, 10)) => !!(g.annee_cible && g.du && g.au && g.du <= jour && jour <= g.au);
const profDuCompte = id => db.prepare('SELECT professeur_id FROM utilisateur WHERE id = ?').get(id)?.professeur_id || null;
const nomProf = id => { const p = db.prepare('SELECT nom, prenom, matricule FROM professeur WHERE id = ?').get(id); return p ? { nom: `${String(p.nom || '').toUpperCase()} ${p.prenom || ''}`.trim(), matricule: p.matricule || '' } : { nom: `n° ${id}`, matricule: '' }; };

/** La situation de l'année en cours : périodes de chargé de cours, d'expert, nominations définitives ; et ses cours. */
function situation(profId, annee) {
  const s = { annee, cc: 0, expert: 0, definitif: 0, sections: [], cours: [] };
  try {
    for (const l of db.prepare(`SELECT v.section, v.codification_unite AS ue, v.code_cours, v.nom_cours, SUM(COALESCE(v.total_attribue_professeur, v.periodes_attribuees, 0)) AS per,
        UPPER(COALESCE((SELECT a.statut_exception FROM attribution a WHERE a.id = v.id), (SELECT p.statut FROM professeur p WHERE p.id = v.professeur_id), '')) AS st
      FROM v_attribution_complete v WHERE v.professeur_id = ? AND v.annee_scolaire = ? GROUP BY v.section, v.code_cours, st`).all(profId, annee)) {
      if (l.st === 'EXP') s.expert += l.per || 0; else s.cc += l.per || 0;
      if (l.section && !s.sections.includes(l.section)) s.sections.push(l.section);
      s.cours.push({ section: l.section, ue: l.ue, cours_code: l.code_cours, cours_nom: l.nom_cours, periodes: Math.round(l.per || 0), expert: l.st === 'EXP' });
    }
  } catch { /* vue absente */ }
  try { s.definitif = Math.round(db.prepare('SELECT SUM(periodes) n FROM nomination_definitive WHERE professeur_id = ? AND actif = 1').get(profId)?.n || 0); } catch { /* */ }
  s.cc = Math.round(s.cc); s.expert = Math.round(s.expert);
  return s;
}

// ── LA CAMPAGNE (direction) ────────────────────────────────────────────────
r.get('/reglage', authRequired, (req, res) => res.json({ ...reglage(), ouverte: ouverte(reglage()) }));
r.put('/reglage', authRequired, (req, res) => {
  if (!DIRECTION.includes(req.user.role)) return res.status(403).json({ error: 'Réservé à la direction.' });
  const { annee_cible, du, au } = req.body || {};
  const iso = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
  if (annee_cible && !/^\d{4}-\d{4}$/.test(annee_cible)) return res.status(400).json({ error: 'Année visée : aaaa-aaaa.' });
  if ((du && !iso(du)) || (au && !iso(au)) || (du && au && au < du)) return res.status(400).json({ error: 'Dates de la campagne incorrectes.' });
  const v = { annee_cible: annee_cible || null, du: du || null, au: au || null, par: req.user.nom || req.user.email, le: new Date().toISOString() };
  db.prepare(`INSERT INTO lucie_config (cle, valeur) VALUES ('candidatures', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur`).run(JSON.stringify(v));
  res.json({ ...v, ouverte: ouverte(v) });
});

// ── L'ENSEIGNANT ───────────────────────────────────────────────────────────
r.get('/moi', authRequired, (req, res) => {
  const g = reglage();
  const prof = profDuCompte(req.user.id);
  if (!prof) return res.json({ relie: false, campagne: { ...g, ouverte: ouverte(g) } });
  const annee = anneeDeTravail(req);
  const miennes = db.prepare(`SELECT * FROM candidature_mdp WHERE professeur_id = ? ORDER BY id DESC LIMIT 10`).all(prof)
    .map(c => ({ ...c, situation: lireJSON(c.situation, null), lignes: lireJSON(c.lignes, []) }));
  // Le catalogue des cours proposables : ceux de l'année en cours dans les sections de l'école.
  const catalogue = (() => { try {
    return db.prepare(`SELECT c.cours_code, c.cours_nom, c.ue_num, c.cours_per AS periodes, (SELECT u.section FROM ue u WHERE u.ue_num = c.ue_num AND u.annee_scolaire = c.annee_scolaire LIMIT 1) AS section,
        (SELECT u.ue_nom FROM ue u WHERE u.ue_num = c.ue_num AND u.annee_scolaire = c.annee_scolaire LIMIT 1) AS ue_nom
      FROM cours c WHERE c.annee_scolaire = ? ORDER BY section, c.ue_num, c.cours_code`).all(annee);
  } catch { return []; } })();
  res.json({ relie: true, campagne: { ...g, ouverte: ouverte(g) }, identite: nomProf(prof), situation: situation(prof, annee), miennes, catalogue });
});

r.post('/moi', authRequired, (req, res) => {
  const g = reglage();
  if (!ouverte(g)) return res.status(409).json({ error: 'La campagne de candidatures n’est pas ouverte.' });
  const prof = profDuCompte(req.user.id);
  if (!prof) return res.status(409).json({ error: 'Votre compte n’est relié à aucune fiche d’enseignant : demandez-le au secrétariat.' });
  const b = req.body || {};
  const choix = { maintien: !!b.maintien, renonce: !!b.renonce, temporaire: !!b.temporaire, definitif: !!b.definitif,
    augmentation: Number(b.augmentation) > 0 ? Math.round(Number(b.augmentation)) : null };
  if (!choix.maintien && !choix.renonce && !choix.temporaire && !choix.definitif && !choix.augmentation) return res.status(400).json({ error: 'Cochez au moins un choix.' });
  if (choix.renonce && (choix.maintien || choix.augmentation || choix.temporaire || choix.definitif)) return res.status(400).json({ error: 'Renoncer à toute sa charge ne se combine pas avec un autre choix.' });
  const lignes = (Array.isArray(b.lignes) ? b.lignes : []).slice(0, 40).map(l => ({ nature: l.nature === 'definitif' ? 'definitif' : 'temporaire',
    section: String(l.section || '').slice(0, 40), ue_num: Number(l.ue_num) || null, cours_code: String(l.cours_code || '').slice(0, 30),
    cours_nom: String(l.cours_nom || '').slice(0, 160), periodes: Number(l.periodes) > 0 ? Math.round(Number(l.periodes)) : null })).filter(l => l.ue_num || l.cours_code);
  if ((choix.temporaire || choix.definitif) && !lignes.length) return res.status(400).json({ error: 'Indiquez les cours ou les unités visés.' });
  if (!choix.renonce && !b.conditions) return res.status(400).json({ error: 'Confirmez être dans les conditions légales pour candidater.' });
  const enCours = db.prepare(`SELECT id, statut FROM candidature_mdp WHERE professeur_id = ? AND annee_cible = ? AND statut NOT IN ('remplacee','retiree') ORDER BY id DESC LIMIT 1`).get(prof, g.annee_cible);
  if (enCours && enCours.statut !== 'deposee') return res.status(409).json({ error: 'Votre candidature est déjà en cours d’analyse : écrivez à la coordination pour la modifier.' });
  const id = db.transaction(() => {
    if (enCours) db.prepare(`UPDATE candidature_mdp SET statut = 'remplacee' WHERE id = ?`).run(enCours.id);
    return Number(db.prepare(`INSERT INTO candidature_mdp (annee_cible, professeur_id, user_id, situation, maintien, augmentation, renonce, temporaire, definitif, lignes, remarque, conditions)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(g.annee_cible, prof, req.user.id, JSON.stringify(situation(prof, anneeDeTravail(req))),
      choix.maintien ? 1 : 0, choix.augmentation, choix.renonce ? 1 : 0, choix.temporaire ? 1 : 0, choix.definitif ? 1 : 0,
      JSON.stringify(lignes), String(b.remarque || '').slice(0, 2000) || null, b.conditions ? 1 : 0).lastInsertRowid);
  })();
  try {
    const n = nomProf(prof).nom;
    db.prepare(`INSERT INTO lucie_notification (type, titre, corps, lien, cible_role, cree_par) VALUES ('candidature', ?, ?, '/professeurs?vue=candidatures', ?, ?)`)
      .run(`Candidature ${g.annee_cible} — ${n}`, choix.renonce ? 'Renonce à toute sa charge.' : [choix.maintien && 'maintien', choix.augmentation && `augmentation à ${choix.augmentation} périodes`, choix.temporaire && 'engagement temporaire', choix.definitif && 'engagement à titre définitif'].filter(Boolean).join(' · '),
        'admin', n);
  } catch { /* la notification ne bloque pas */ }
  const c = db.prepare('SELECT depose_le FROM candidature_mdp WHERE id = ?').get(id);
  res.json({ ok: true, id, accuse: `Candidature reçue le ${String(c.depose_le).slice(0, 10).split('-').reverse().join('/')} à ${String(c.depose_le).slice(11, 16)} (UTC).` });
});

r.post('/moi/:id/retirer', authRequired, (req, res) => {
  const prof = profDuCompte(req.user.id);
  const n = db.prepare(`UPDATE candidature_mdp SET statut = 'retiree', decide_le = datetime('now'), decide_par = 'retirée par son auteur'
    WHERE id = ? AND professeur_id = ? AND statut = 'deposee'`).run(Number(req.params.id), prof || -1).changes;
  if (!n) return res.status(409).json({ error: 'Candidature introuvable ou déjà en analyse.' });
  res.json({ ok: true });
});

// ── L'ÉCOLE : la liste, l'analyse, la pièce ────────────────────────────────
function visible(req, c) {
  if (!LISENT.includes(req.user.role)) return false;
  const secs = getUserSections(req.user);
  if (!secs) return true;
  const s = lireJSON(c.situation, {})?.sections || [];
  const visees = (lireJSON(c.lignes, []) || []).map(l => l.section);
  return [...s, ...visees].some(x => secs.includes(x));
}
r.get('/', authRequired, (req, res) => {
  if (!LISENT.includes(req.user.role)) return res.status(403).json({ error: 'Réservé à la direction, au secrétariat et à la coordination.' });
  const g = reglage();
  const annee = req.query.annee_cible || g.annee_cible;
  const l = db.prepare(`SELECT * FROM candidature_mdp WHERE annee_cible = ? AND statut NOT IN ('remplacee') ORDER BY depose_le DESC`).all(annee || '')
    .filter(c => visible(req, c)).map(c => ({ ...c, ...nomProf(c.professeur_id), situation: lireJSON(c.situation, null), lignes: lireJSON(c.lignes, []) }));
  res.json({ campagne: { ...g, ouverte: ouverte(g) }, annee_cible: annee, candidatures: l, statuts: STATUTS, direction: DIRECTION.includes(req.user.role) });
});

r.put('/:id/statut', authRequired, (req, res) => {
  const c = db.prepare('SELECT * FROM candidature_mdp WHERE id = ?').get(Number(req.params.id));
  if (!c || !visible(req, c)) return res.status(404).json({ error: 'Candidature introuvable.' });
  const statut = req.body?.statut;
  if (!['deposee', 'analysee', 'transmise_ca', 'retenue', 'non_retenue'].includes(statut)) return res.status(400).json({ error: 'Statut inconnu.' });
  // La coordination analyse ; transmettre au CA et décider reviennent à la direction.
  if (['transmise_ca', 'retenue', 'non_retenue'].includes(statut) && !DIRECTION.includes(req.user.role)) return res.status(403).json({ error: 'Réservé à la direction.' });
  if (statut === 'non_retenue' && !String(req.body?.mot || '').trim()) return res.status(400).json({ error: 'Un mot pour dire pourquoi.' });
  db.prepare(`UPDATE candidature_mdp SET statut = ?, decide_par = ?, decide_le = datetime('now'), mot = COALESCE(?, mot) WHERE id = ?`)
    .run(statut, req.user.nom || req.user.email, String(req.body?.mot || '').trim() || null, c.id);
  res.json({ ok: true });
});

r.get('/:id/document', authRequired, (req, res) => {
  const c = db.prepare('SELECT * FROM candidature_mdp WHERE id = ?').get(Number(req.params.id));
  const prof = profDuCompte(req.user.id);
  if (!c || !(visible(req, c) || (prof && prof === c.professeur_id))) return res.status(404).json({ error: 'Candidature introuvable.' });
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const fr = d => String(d || '').slice(0, 10).split('-').reverse().join('/');
  const s = lireJSON(c.situation, {}) || {}, lignes = lireJSON(c.lignes, []) || [], id = nomProf(c.professeur_id);
  const case_ = v => (v ? '☒' : '☐');
  const def = !!c.definitif;
  const corps = `
    <h2>${def ? 'Candidature à titre définitif' : 'Candidature à titre temporaire'} — année ${esc(c.annee_cible)}</h2>
    <table class="serre"><tr><th style="width:45mm">Nom et prénom</th><td><b>${esc(id.nom)}</b></td></tr>
      <tr><th>Matricule</th><td>${esc(id.matricule || '—')}</td></tr></table>
    <h3>Situation en ${esc(s.annee || '')}</h3>
    <p>${case_(s.cc)} Chargé de cours : <b>${s.cc || 0}</b> périodes &nbsp; ${case_(s.expert)} Expert : <b>${s.expert || 0}</b> périodes &nbsp; ${case_(s.definitif)} Définitif : <b>${s.definitif || 0}</b> périodes</p>
    <h3>Demande, dans la mesure des postes disponibles</h3>
    <p>${case_(c.maintien)} Le maintien de mes attributions pour l’année ${esc(c.annee_cible)}.<br>
      ${case_(c.augmentation)} Une augmentation de charge à concurrence de <b>${c.augmentation || '…'}</b> périodes au total.<br>
      ${case_(c.renonce)} Renoncer à ma charge de cours dans son intégralité.<br>
      ${case_(c.temporaire)} Être engagé(e) en tant que chargé(e) de cours dans les cours ci-dessous.<br>
      ${case_(c.definitif)} Être engagé(e) à titre définitif dans les unités ci-dessous.</p>
    ${lignes.length ? `<table class="serre"><thead><tr><th>Nature</th><th>Section</th><th>UE</th><th>Cours</th><th>Périodes</th></tr></thead><tbody>
      ${lignes.map(l => `<tr><td>${l.nature === 'definitif' ? 'définitif' : 'temporaire'}</td><td>${esc(l.section)}</td><td>${esc(l.ue_num || '')}</td><td>${esc(l.cours_code)} ${esc(l.cours_nom)}</td><td>${esc(l.periodes || '')}</td></tr>`).join('')}</tbody></table>` : ''}
    ${c.remarque ? `<h3>Remarque</h3><p>${esc(c.remarque)}</p>` : ''}
    <p>${case_(c.conditions)} ${def ? 'Je confirme être dans les conditions légales pour candidater à une fonction de chargé de cours à titre définitif. Je tiens à disposition du secrétariat les documents légaux nécessaires à la constitution de mon dossier. L’engagement ne pourra se faire qu’après accord du CA, si les postes sont disponibles.' : 'Je confirme être dans les conditions légales pour candidater à une fonction de chargé de cours à titre temporaire.'}</p>
    <p class="fin">Ce document fait l’objet d’une analyse par la coordination et la direction${def ? ', qui transmettent la demande au CA dans les délais légaux' : ' ; une proposition d’attributions vous parviendra selon le statut des candidats et les postes vacants'}.</p>
    <table class="serre"><tr><th style="width:60mm">Déposée dans Lucie</th><td>le ${fr(c.depose_le)} à ${esc(String(c.depose_le).slice(11, 16))} (UTC), par son auteur — vaut signature et accusé de réception</td></tr>
      <tr><th>État</th><td>${esc(STATUTS[c.statut] || c.statut)}${c.decide_le ? ` (${fr(c.decide_le)}, ${esc(c.decide_par || '')})` : ''}${c.mot ? ` — ${esc(c.mot)}` : ''}</td></tr></table>`;
  res.json({ html: envelopperDocument({ html: corps, titre: 'Candidature', entete: { titre: def ? 'Candidature à titre définitif' : 'Candidature à titre temporaire', sous: `${id.nom} · ${c.annee_cible}` } }),
    titre: 'Candidature', nom: `Candidature-${id.nom.replace(/\s+/g, '-')}-${c.annee_cible}.html` });
});

export default r;
