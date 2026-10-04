/**
 * LES RÉPONSES TYPES (3.1.21, Charles, 4 octobre 2026 : « de manière générale,
 * partout dans Lucie, je veux des réponses pré-établies disponibles »).
 *
 * Toute zone de texte de Lucie porte un bouton « Réponses types ». Le champ se
 * reconnaît à une CLÉ — écrite par l'écran (`data-reponses`), sinon déduite de
 * son intitulé — et le catalogue est rangé par clé.
 *
 * Deux catalogues, une seule table :
 *   - le COMMUN (proprietaire_id NULL), tenu par la direction — dans
 *     Configuration → Réponses types, ou depuis le champ lui-même ;
 *   - le PERSONNEL de chacun, qu'il est seul à voir et à modifier.
 *
 * Une phrase peut porter des VARIABLES ({etudiant}, {ue}, {date}…) que l'écran
 * remplit avec ce qu'il sait ; ce qu'il ne sait pas reste entre crochets, à
 * compléter. Une réponse type est un point de départ, jamais une décision :
 * elle s'insère dans le champ, où elle se relit et se corrige.
 */
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, NIVEAU_DIRECTION } from '../middleware/auth.js';

const r = Router();
const direction = req => NIVEAU_DIRECTION.includes(req.user?.role);
const qui = req => req.user?.nom || req.user?.email || null;
const propre = s => String(s ?? '').trim();

export function migrerReponsesTypes(dbx = db) {
  dbx.exec(`
    CREATE TABLE IF NOT EXISTS reponse_type (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      champ           TEXT NOT NULL,          -- la clé du champ
      champ_libelle   TEXT,                   -- son intitulé, pour s'y retrouver
      groupe          TEXT,                   -- rangement facultatif dans la liste
      texte           TEXT NOT NULL,
      ordre           INTEGER NOT NULL DEFAULT 0,
      proprietaire_id INTEGER,                -- NULL = catalogue commun
      cree_le         TEXT DEFAULT (datetime('now')),
      cree_par        TEXT,
      maj_le          TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_reponse_type_champ ON reponse_type(champ, proprietaire_id);
    -- Ce qui a déjà été amorcé : une phrase retirée ne revient pas.
    CREATE TABLE IF NOT EXISTS reponse_type_amorce (cle TEXT PRIMARY KEY, le TEXT DEFAULT (datetime('now')));
  `);
  amorcer(dbx);
}

/* LE CATALOGUE DE DÉPART : les champs des recours et de la discipline, écrits
   d'après le RDE 2026-2027. Posé une fois — une phrase que la direction a
   retirée ne revient pas au redémarrage. */
const AMORCE = [
  // ── Discipline ────────────────────────────────────────────────────────────
  ['proc.description', 'Description des faits', 'Fraude', "Le {date_faits}, lors de l'évaluation de l'UE {ue} — {ue_nom}, [nom et qualité de la personne] a constaté que {etudiant} [décrire précisément le comportement observé : document, appareil, échange, copie…]."],
  ['proc.description', 'Description des faits', 'Fraude', "Lors de la correction du travail remis par {etudiant} pour l'UE {ue} — {ue_nom}, [le chargé de cours] a relevé des passages reproduits sans citation de leur source : [références, pages, pourcentage de reprise constaté]."],
  ['proc.description', 'Description des faits', 'Comportement', "Le {date_faits}, [lieu], {etudiant} a [décrire les faits, sans qualification : propos tenus, gestes, personnes présentes]. Les faits ont été rapportés par [nom et qualité] le [date du rapport]."],
  ['proc.declarations', "Déclarations de l'étudiant", 'Faits reconnus', "{etudiant} reconnaît les faits tels qu'ils lui ont été exposés. [Explications données par l'étudiant.]"],
  ['proc.declarations', "Déclarations de l'étudiant", 'Faits contestés', "{etudiant} conteste les faits qui lui sont reprochés. Il déclare : [reprendre ses explications, au plus près de ses mots]."],
  ['proc.declarations', "Déclarations de l'étudiant", 'Absence', "{etudiant}, régulièrement convoqué par [mode de remise] le [date], ne s'est pas présenté à l'audition et ne s'y est pas fait représenter. Aucune explication écrite n'a été transmise."],
  ['proc.avis', 'Avis du CDE', null, "Le Conseil des études, réuni le [date], après avoir pris connaissance du dossier et des déclarations de {etudiant}, estime que les faits sont [établis / non établis] et rend un avis [favorable / défavorable] à la sanction envisagée, pour les motifs suivants : [motifs]."],
  ['proc.motivation_disciplinaire', 'Motivation : faits, dispositions, gravité', 'Fraude', "FAITS — Le {date_faits}, lors de l'évaluation de l'UE {ue} — {ue_nom}, {etudiant} [faits établis].\n\nDISPOSITIONS — Ces faits constituent une fraude au sens de l'article 72 du règlement des études, que l'étudiant a reçu et dont il a pris connaissance à son inscription.\n\nGRAVITÉ — [Caractère délibéré ou non, ampleur, récidive éventuelle, attitude lors de l'audition.] La sanction retenue est proportionnée à ces éléments."],
  ['proc.motivation_disciplinaire', 'Motivation : faits, dispositions, gravité', 'Comportement', "FAITS — [Faits établis, datés et circonstanciés.]\n\nDISPOSITIONS — Ces faits contreviennent à [disposition du règlement des études ou du règlement d'ordre intérieur].\n\nGRAVITÉ — [Atteinte aux personnes ou au bon fonctionnement, répétition, attitude de l'étudiant.] La sanction retenue est proportionnée à ces éléments."],
  ['proc.motivation_disciplinaire', 'Motivation : faits, dispositions, gravité', 'Faits non établis', "Au terme de l'audition et de l'examen du dossier, les faits reprochés à {etudiant} ne sont pas établis à suffisance : [raisons]. Aucune sanction n'est prononcée."],
  // ── Recours ───────────────────────────────────────────────────────────────
  ['proc.irrecevabilite', "Motif précis de l'irrecevabilité", 'Délai', "Le recours a été introduit le [date], soit au-delà du délai fixé par le règlement des études, qui courait à compter de la publication des résultats le {publie_le}."],
  ['proc.irrecevabilite', "Motif précis de l'irrecevabilité", 'Objet', "Le recours ne vise pas une décision de refus : il porte sur [objet], qui n'est pas susceptible de recours au sens du règlement des études."],
  ['proc.irrecevabilite', "Motif précis de l'irrecevabilité", 'Griefs', "Le recours ne mentionne aucune irrégularité précise de la procédure : il se borne à contester l'appréciation portée sur les épreuves, que le Conseil des études arrête souverainement."],
  ['proc.irrecevabilite', "Motif précis de l'irrecevabilité", 'Forme', "Le recours n'a pas été introduit dans les formes prévues par le règlement des études : [envoi recommandé, remise contre accusé de réception, signature manquante…]."],
  ['proc.motivation_recours', 'Motivation, grief par grief', 'Grief fondé', "Grief [n°] — [résumé du grief].\nLe Conseil des études restreint constate que [irrégularité établie] et que cette irrégularité a pu influencer la décision. Le grief est fondé."],
  ['proc.motivation_recours', 'Motivation, grief par grief', 'Grief non fondé', "Grief [n°] — [résumé du grief].\nIl ressort du dossier que [éléments du dossier : modalités annoncées dans la fiche descriptive, déroulement de l'épreuve, procès-verbal de délibération]. La procédure a été respectée sur ce point. Le grief n'est pas fondé."],
  ['proc.motivation_recours', 'Motivation, grief par grief', 'Conclusion', "Les griefs étant [tous non fondés / fondés en tout ou en partie], le recours de {etudiant} contre la décision de refus de l'UE {ue} — {ue_nom} ({session_texte}) est [rejeté / accueilli]."],
];

function amorcer(dbx) {
  const deja = dbx.prepare("SELECT 1 FROM reponse_type_amorce WHERE cle = 'procedures'").get();
  if (deja) return;
  const ins = dbx.prepare(`INSERT INTO reponse_type (champ, champ_libelle, groupe, texte, ordre, cree_par)
    VALUES (?, ?, ?, ?, ?, 'Lucie')`);
  dbx.transaction(() => {
    AMORCE.forEach(([champ, lib, groupe, texte], i) => ins.run(champ, lib, groupe, texte, i));
    dbx.prepare("INSERT OR IGNORE INTO reponse_type_amorce (cle) VALUES ('procedures')").run();
  })();
}

/** Ce qu'on voit d'un champ : le commun, puis ses propres phrases. */
r.get('/', authRequired, (req, res) => {
  const champ = propre(req.query.champ);
  if (!champ) return res.status(400).json({ error: 'champ manquant' });
  const lignes = db.prepare(`SELECT id, champ, champ_libelle, groupe, texte, ordre, proprietaire_id
    FROM reponse_type WHERE champ = ? AND (proprietaire_id IS NULL OR proprietaire_id = ?)
    ORDER BY (proprietaire_id IS NOT NULL), ordre, id`).all(champ, req.user.id);
  res.json({
    reponses: lignes.map(l => ({ ...l, commun: l.proprietaire_id == null, proprietaire_id: undefined })),
    peut_commun: direction(req),
  });
});

/** Le catalogue entier, par champ — pour Configuration (direction). */
r.get('/catalogue', authRequired, (req, res) => {
  if (!direction(req)) return res.status(403).json({ error: 'Réservé à la direction.' });
  const lignes = db.prepare(`SELECT id, champ, champ_libelle, groupe, texte, ordre, cree_par, maj_le
    FROM reponse_type WHERE proprietaire_id IS NULL ORDER BY champ, ordre, id`).all();
  res.json({ reponses: lignes });
});

r.post('/', authRequired, (req, res) => {
  const champ = propre(req.body?.champ);
  const texte = propre(req.body?.texte);
  if (!champ || !texte) return res.status(400).json({ error: 'Le champ et le texte sont obligatoires.' });
  const commun = !!req.body?.commun;
  if (commun && !direction(req)) return res.status(403).json({ error: 'Le catalogue commun est tenu par la direction.' });
  const ordre = db.prepare(`SELECT COALESCE(MAX(ordre), 0) + 1 n FROM reponse_type
    WHERE champ = ? AND proprietaire_id IS ?`).get(champ, commun ? null : req.user.id).n;
  const info = db.prepare(`INSERT INTO reponse_type (champ, champ_libelle, groupe, texte, ordre, proprietaire_id, cree_par)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(champ, propre(req.body?.champ_libelle) || null,
    propre(req.body?.groupe) || null, texte, ordre, commun ? null : req.user.id, qui(req));
  res.json({ id: info.lastInsertRowid });
});

function permise(req, res) {
  const l = db.prepare('SELECT * FROM reponse_type WHERE id = ?').get(Number(req.params.id));
  if (!l) { res.status(404).json({ error: 'Réponse introuvable.' }); return null; }
  const ok = l.proprietaire_id == null ? direction(req) : l.proprietaire_id === req.user.id;
  if (!ok) { res.status(403).json({ error: 'Cette réponse ne vous appartient pas.' }); return null; }
  return l;
}

r.put('/:id', authRequired, (req, res) => {
  const l = permise(req, res);
  if (!l) return;
  const texte = req.body?.texte !== undefined ? propre(req.body.texte) : l.texte;
  if (!texte) return res.status(400).json({ error: 'Une réponse type ne peut pas être vide.' });
  db.prepare(`UPDATE reponse_type SET texte = ?, groupe = ?, ordre = ?, maj_le = datetime('now') WHERE id = ?`)
    .run(texte, req.body?.groupe !== undefined ? (propre(req.body.groupe) || null) : l.groupe,
      Number.isFinite(Number(req.body?.ordre)) ? Number(req.body.ordre) : l.ordre, l.id);
  res.json({ ok: true });
});

r.delete('/:id', authRequired, (req, res) => {
  const l = permise(req, res);
  if (!l) return;
  db.prepare('DELETE FROM reponse_type WHERE id = ?').run(l.id);
  res.json({ ok: true });
});

export default r;
