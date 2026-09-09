// ─────────────────────────────────────────────────────────────────────────────
// Lucie — LES DOSSIERS DÉDOUBLÉS
//
// Le matricule change d'une année à l'autre : Nejla BEN TOUMI est 24-00239 en
// 2024-2025 et 25-00158 en 2025-2026. L'import rapproche par matricule, ne
// trouve rien, et crée un second dossier. Sur la section TIM, cent cinquante-
// deux étudiants — tous les revenants — se sont ainsi retrouvés en double.
//
// Ce n'est pas un désagrément d'affichage. Deux dossiers, c'est un parcours
// coupé en deux : la valorisation d'une unité acquise l'an dernier ne se voit
// plus, le relevé de l'étudiant est amputé, et une attestation peut être
// délivrée sur la moitié de ce qu'il a réussi.
//
// Deux réponses, et il faut les deux :
//   — EN AMONT, l'import reconnaît le revenant à son nom et RATTACHE le
//     nouveau matricule au dossier existant (voir importSuivi.js) ;
//   — ICI, on répare ce qui est déjà en base : on montre les paires, et on les
//     fusionne — une par une ou toutes celles qui ne font aucun doute.
//
// LA FUSION DÉPLACE TOUT. La fusion qui existait déjà (importHistorique.js)
// ne déplaçait ni les décisions de délibération, ni les ajustements, ni les
// motivations : fusionner y perdait la trace de la séance, ce qui est
// exactement ce qu'un procès-verbal ne peut pas se permettre. Celle-ci
// parcourt les tables portant `etudiant_id`, telles que la base les déclare —
// une table ajoutée demain suivra sans qu'on y pense.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';

const r = Router();

const clean = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');

/** Les tables qui portent un `etudiant_id`, telles que la base les déclare. */
function tablesLiees() {
  const noms = db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
  `).all().map(t => t.name);
  const liees = [];
  for (const n of noms) {
    if (n === 'etudiant') continue;
    try {
      if (db.prepare(`PRAGMA table_info(${n})`).all().some(c => c.name === 'etudiant_id')) {
        liees.push(n);
      }
    } catch { /* vue, table verrouillée : on passe */ }
  }
  return liees;
}

/**
 * CE QU'UN DOSSIER PORTE. On ne fusionne pas à l'aveugle : il faut voir de
 * chaque côté les années, les unités et les décisions avant de trancher.
 */
function fiche(id) {
  const e = db.prepare(`
    SELECT id, nom, prenom, id_ecampus, date_naissance FROM etudiant WHERE id = ?
  `).get(id);
  if (!e) return null;
  const mats = db.prepare(
    'SELECT id_ecampus FROM etudiant_matricule WHERE etudiant_id = ? ORDER BY id_ecampus'
  ).all(id).map(x => x.id_ecampus);
  const annees = db.prepare(`
    SELECT annee_scolaire AS annee, COUNT(*) AS unites
    FROM etudiant_inscription WHERE etudiant_id = ?
    GROUP BY annee_scolaire ORDER BY annee_scolaire
  `).all(id);
  const nb = t => {
    try {
      return db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE etudiant_id = ?`).get(id).n;
    } catch { return 0; }
  };
  return {
    ...e,
    matricules: [...new Set([e.id_ecampus, ...mats].filter(Boolean))],
    annees,
    inscriptions: nb('etudiant_inscription'),
    decisions: nb('deliberation_resultat'),
    notes: nb('etudiant_note_detail'),
  };
}

/**
 * LES PAIRES PRESSENTIES — même nom, même prénom, plusieurs dossiers.
 *
 * Le rapprochement se fait sur le nom ET le prénom normalisés : sans accents,
 * sans espaces, sans casse. Deux vrais homonymes existent — c'est pourquoi
 * rien ne se fusionne tout seul et pourquoi la fusion en lot ne prend que les
 * groupes dont les dates de naissance ne se contredisent pas.
 */
r.get('/', authRequired, roleRequired('admin', 'directeur', 'directeur_adjoint',
       'secretariat'), (req, res) => {
  const tous = db.prepare(`
    SELECT id, nom, prenom, id_ecampus, date_naissance FROM etudiant
    WHERE nom IS NOT NULL AND nom != ''
  `).all();

  const par = new Map();
  for (const e of tous) {
    const k = `${clean(e.nom)}|${clean(e.prenom)}`;
    if (k.length < 3) continue;
    (par.get(k) || par.set(k, []).get(k)).push(e);
  }

  const groupes = [];
  for (const [, l] of par) {
    if (l.length < 2) continue;
    const naiss = [...new Set(l.map(x => String(x.date_naissance || '').slice(0, 10))
      .filter(Boolean))];
    groupes.push({
      cle: `${l[0].nom} ${l[0].prenom}`,
      // SÛR : les dates de naissance connues ne se contredisent pas. C'est le
      // seul cas que la fusion en lot accepte de traiter sans qu'on regarde.
      sur: naiss.length < 2,
      naissances: naiss,
      dossiers: l.map(x => fiche(x.id)),
    });
  }
  groupes.sort((a, b) => a.cle.localeCompare(b.cle));

  res.json({
    groupes,
    total: groupes.length,
    surs: groupes.filter(g => g.sur).length,
    dossiers: groupes.reduce((n, g) => n + g.dossiers.length, 0),
  });
});

/**
 * LA FUSION. `garder` absorbe `absorber` — et tout ce que le second portait
 * suit : matricules, inscriptions, notes, décisions, ajustements, motivations,
 * présences, pièces. Les champs vides du dossier conservé se complètent de
 * ceux du dossier absorbé, jamais l'inverse : ce qui est renseigné fait foi.
 *
 * Une inscription à la même unité de la même année des deux côtés ne se
 * duplique pas : elle se complète, valeur manquante par valeur présente.
 */
export function fusionner(garder, absorber, { simulation = false } = {}) {
  const g = Number(garder), s = Number(absorber);
  if (!g || !s || g === s) throw new Error('deux dossiers distincts sont requis');
  if (!db.prepare('SELECT 1 FROM etudiant WHERE id = ?').get(g)
   || !db.prepare('SELECT 1 FROM etudiant WHERE id = ?').get(s)) {
    throw new Error('dossier introuvable');
  }

  const bilan = { garde: g, absorbe: s, deplaces: {}, inscriptions: 0,
                  fusionnees: 0, matricules: 0 };
  const faire = () => {
    // Le matricule du dossier absorbé doit rester cherchable : c'est lui qui
    // figure sur les documents de l'année passée.
    for (const m of db.prepare(`
      SELECT id_ecampus FROM etudiant_matricule WHERE etudiant_id = ?
      UNION SELECT id_ecampus FROM etudiant WHERE id = ? AND id_ecampus IS NOT NULL
    `).all(s, s)) {
      if (!m.id_ecampus) continue;
      db.prepare(`INSERT OR IGNORE INTO etudiant_matricule (etudiant_id, id_ecampus, source)
                  VALUES (?,?,'fusion')`).run(g, m.id_ecampus);
      bilan.matricules++;
    }

    // Les inscriptions d'abord, parce qu'elles se complètent au lieu de se
    // déplacer : deux lignes pour la même unité de la même année n'ont pas de
    // sens, mais l'une peut porter le résultat et l'autre les points.
    for (const i of db.prepare(
      'SELECT * FROM etudiant_inscription WHERE etudiant_id = ?').all(s)) {
      const dejaLa = db.prepare(`SELECT id FROM etudiant_inscription
        WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?`)
        .get(g, i.annee_scolaire, i.ue_num);
      if (dejaLa) {
        db.prepare(`UPDATE etudiant_inscription SET
            resultat = COALESCE(NULLIF(resultat, ''), ?),
            points   = COALESCE(points, ?),
            mention  = COALESCE(NULLIF(mention, ''), ?)
          WHERE id = ?`).run(i.resultat, i.points, i.mention, dejaLa.id);
        db.prepare('DELETE FROM etudiant_inscription WHERE id = ?').run(i.id);
        bilan.fusionnees++;
      } else {
        db.prepare('UPDATE etudiant_inscription SET etudiant_id = ? WHERE id = ?')
          .run(g, i.id);
        bilan.inscriptions++;
      }
    }

    // Tout le reste suit. UPDATE OR IGNORE laisse en place ce qui entrerait en
    // collision d'unicité — la ligne du dossier conservé gagne —, puis on
    // supprime ce qui n'a pas bougé : rien ne doit rester accroché à un
    // dossier qui va disparaître.
    for (const t of tablesLiees()) {
      if (t === 'etudiant_inscription' || t === 'etudiant_matricule') continue;
      const avant = db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE etudiant_id = ?`)
        .get(s).n;
      if (!avant) continue;
      db.prepare(`UPDATE OR IGNORE ${t} SET etudiant_id = ? WHERE etudiant_id = ?`)
        .run(g, s);
      const reste = db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE etudiant_id = ?`)
        .get(s).n;
      if (reste) db.prepare(`DELETE FROM ${t} WHERE etudiant_id = ?`).run(s);
      bilan.deplaces[t] = avant - reste;
    }
    db.prepare('DELETE FROM etudiant_matricule WHERE etudiant_id = ?').run(s);

    // Compléter les champs vides du dossier conservé, colonne par colonne et
    // seulement celles que la base a réellement.
    const cols = db.prepare('PRAGMA table_info(etudiant)').all()
      .map(c => c.name).filter(c => c !== 'id' && c !== 'id_ecampus');
    const abs = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(s);
    const set = cols.filter(c => abs[c] !== null && abs[c] !== '');
    if (set.length) {
      db.prepare(`UPDATE etudiant SET ${set.map(c =>
        `${c} = COALESCE(NULLIF(${c}, ''), @${c})`).join(', ')} WHERE id = @__id`)
        .run({ ...Object.fromEntries(set.map(c => [c, abs[c]])), __id: g });
    }
    db.prepare('DELETE FROM etudiant WHERE id = ?').run(s);
    if (simulation) throw new Error('SIMULATION');
  };

  try { db.transaction(faire)(); } catch (e) {
    if (e.message !== 'SIMULATION') throw e;
  }
  return bilan;
}

r.post('/fusionner', authRequired, roleRequired('admin', 'directeur',
       'directeur_adjoint'), (req, res) => {
  const { garder, absorber, simulation = false } = req.body || {};
  try {
    res.json({ ok: true, simulation, ...fusionner(garder, absorber, { simulation }) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * LA FUSION EN LOT.
 *
 * Cent cinquante-deux paires ne se traitent pas une par une : le secrétariat
 * y passerait la journée et se tromperait. On ne prend cependant QUE les
 * groupes sûrs — dates de naissance non contradictoires — et l'on garde le
 * dossier le plus récemment inscrit, celui de l'année en cours : c'est lui que
 * les écrans ouvrent et lui que le matricule actuel désigne.
 *
 * La simulation est le défaut. Le rapport dit, groupe par groupe, ce qui aurait
 * été déplacé.
 */
r.post('/fusionner-lot', authRequired, roleRequired('admin', 'directeur',
       'directeur_adjoint'), (req, res) => {
  const { simulation = true, cles = null } = req.body || {};
  const voulus = Array.isArray(cles) && cles.length ? new Set(cles) : null;

  const tous = db.prepare(`
    SELECT id, nom, prenom, date_naissance FROM etudiant
    WHERE nom IS NOT NULL AND nom != ''
  `).all();
  const par = new Map();
  for (const e of tous) {
    const k = `${clean(e.nom)}|${clean(e.prenom)}`;
    if (k.length < 3) continue;
    (par.get(k) || par.set(k, []).get(k)).push(e);
  }

  const rapport = { simulation, fusions: 0, ecartes: [], detail: [] };
  const faire = () => {
    for (const [k, l] of par) {
      if (l.length < 2) continue;
      const cle = `${l[0].nom} ${l[0].prenom}`;
      if (voulus && !voulus.has(k) && !voulus.has(cle)) continue;
      const naiss = [...new Set(l.map(x => String(x.date_naissance || '').slice(0, 10))
        .filter(Boolean))];
      if (naiss.length > 1) {
        rapport.ecartes.push(`${cle} — deux dates de naissance : ${naiss.join(' / ')}`);
        continue;
      }
      // L'ANNÉE LA PLUS RÉCENTE FAIT LE DOSSIER SURVIVANT.
      const derniere = id => db.prepare(`SELECT MAX(annee_scolaire) AS a
        FROM etudiant_inscription WHERE etudiant_id = ?`).get(id).a || '';
      const tries = l.map(x => ({ ...x, an: derniere(x.id) }))
        .sort((a, b) => b.an.localeCompare(a.an) || b.id - a.id);
      const garde = tries[0];
      for (const autre of tries.slice(1)) {
        const b = fusionner(garde.id, autre.id);
        rapport.fusions++;
        if (rapport.detail.length < 200) {
          rapport.detail.push({ cle, garde: garde.id, absorbe: autre.id,
                                annee_gardee: garde.an, annee_absorbee: autre.an,
                                deplaces: b.deplaces, inscriptions: b.inscriptions });
        }
      }
    }
    if (simulation) throw new Error('SIMULATION');
  };

  try { db.transaction(faire)(); } catch (e) {
    if (e.message !== 'SIMULATION') return res.status(500).json({ error: e.message });
  }
  res.json({ ok: true, ...rapport, nb_ecartes: rapport.ecartes.length,
             ecartes: rapport.ecartes.slice(0, 50) });
});

export default r;
