/**
 * LA GRILLE D'ORGANISATION — LA COUCHE QUI MANQUAIT.
 *
 * Le DOSSIER PÉDAGOGIQUE dit ce qu'EST l'unité : il ne bouge pas, c'est le
 * référentiel approuvé par le Gouvernement. L'ATTRIBUTION dit QUI fait quoi.
 * Entre les deux manquait ce qu'on FAIT de l'unité cette année — comment ses
 * périodes se découpent, où l'autonomie se place, quand elle tombe dans
 * l'année. C'est la structure de l'année, et elle se planifie AVANT
 * d'attribuer.
 *
 * `PlanificateurVisuel` a été bâti sur les attributions (`voie =
 * l.attribution_id`) pour faire ce travail-là : on ne pouvait donc planifier
 * qu'après avoir attribué, et chaque bloc pendait à une ligne d'attribution.
 * C'est pour cela qu'il n'a jamais été fini.
 *
 * ELLE NE TOUCHE RIEN. Elle ne modifie ni le dossier pédagogique, ni les
 * attributions existantes : elle PROPOSE. C'est l'écran d'attribution qui
 * demandera « ajouter selon la planification ? », et la réponse appartient à
 * celui qui attribue.
 */
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';
import { anneeDeTravail } from '../helpers/annee.js';

const r = Router();

export function migrerGrille(dbx) {
  try {
    /* ON NE CRÉE PAS LA TABLE DE L'UNITÉ : ELLE EXISTE.
     *
     * `organisation_ue` porte déjà `annee_scolaire, section, ue_num,
     * date_debut, date_fin, nb_semaines` — c'est-à-dire exactement la couche
     * « ce qu'on fait de l'unité cette année », avec son écran de saisie
     * (Configuration → Dates des UE) et son commentaire qui dit la bonne
     * chose : « ces dates ne relèvent PAS du référentiel légal, elles se
     * rejouent chaque année ».
     *
     * En créer une seconde aurait donné deux sources pour la même date, et
     * c'est celle qu'on ne regarde pas qui aurait fini par faire foi. La
     * grille s'y BRANCHE : elle lit ces dates, et les complète quand elles
     * manquent.
     *
     * Le calendrier non plus ne se réinvente pas : `annee_calendrier` porte
     * déjà les semaines de l'année avec leurs dates réelles et leur type
     * (cours, congé, EV1, EV2, stage, férié), réglable à l'écran. La grille le
     * LIT — elle est calée sur le calendrier de l'institut, et l'on déroge par
     * les dates de l'unité.
     */
    dbx.exec(`
      -- Le cours dans l'unité, et la part d'autonomie qu'on lui a posée.
      -- Rattaché à l'organisation de l'UE, qui est la couche déjà en place.
      CREATE TABLE IF NOT EXISTS grille_cours (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        organisation_id  INTEGER NOT NULL,
        cours_code       TEXT NOT NULL,
        date_debut       TEXT,
        date_fin         TEXT,
        autonomie_placee REAL NOT NULL DEFAULT 0,
        UNIQUE(organisation_id, cours_code)
      );

      /* L'ACTIVITÉ EST UN SOUS-COURS, ET ELLE NE PARAÎT SUR AUCUNE PIÈCE
         OFFICIELLE. Leur somme retombe sur les périodes du cours, et c'est le
         COURS qui figure au contrat de travail, sur l'attestation et sur le
         procès-verbal. La colonne vu_etudiant porte la SECONDE LECTURE : ce
         qui est confié au professeur et ce que vit l'étudiant coïncident
         presque toujours — presque : sur un stage, les heures d'encadrement du
         superviseur ne sont pas les heures de l'étudiant. Une seule grille,
         deux lectures : deux grilles finiraient par diverger, et c'est celle
         qu'on ne regarde pas qui serait affichée aux étudiants. */
      CREATE TABLE IF NOT EXISTS grille_activite (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        grille_cours_id  INTEGER NOT NULL REFERENCES grille_cours(id) ON DELETE CASCADE,
        activite_id      INTEGER REFERENCES activite_type(id),
        periodes         REAL NOT NULL DEFAULT 0,
        vu_etudiant      INTEGER NOT NULL DEFAULT 1,
        ordre            INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_grille_cours_org ON grille_cours(organisation_id);
      CREATE INDEX IF NOT EXISTS idx_grille_act_cours ON grille_activite(grille_cours_id);
    `);
  } catch (e) { console.error('[migration] grille :', e.message); }
}

/** L'organisation d'une unité : celle qui existe, ou celle qu'on ouvre. */
function organisationDe(annee, section, ueNum, creer = false) {
  let o = db.prepare(`SELECT * FROM organisation_ue
    WHERE annee_scolaire = ? AND section = ? AND ue_num = ?
    ORDER BY num_organisation LIMIT 1`).get(annee, section, ueNum);
  if (!o && creer) {
    db.prepare(`INSERT INTO organisation_ue (ue_num, section, annee_scolaire, num_organisation)
      VALUES (?,?,?,1)`).run(ueNum, section, annee);
    o = db.prepare(`SELECT * FROM organisation_ue
      WHERE annee_scolaire = ? AND section = ? AND ue_num = ?
      ORDER BY num_organisation LIMIT 1`).get(annee, section, ueNum);
  }
  return o || null;
}

/**
 * LES SEMAINES DE L'ANNÉE — lues, jamais réinventées.
 * `annee_calendrier` les porte avec leurs dates réelles et leur type. La frise
 * s'y cale ; une unité déroge par SES dates, pas en redessinant le calendrier.
 */
function semainesDe(annee) {
  try {
    return db.prepare(`SELECT semaine_num, date_debut, date_fin, type, label
      FROM annee_calendrier WHERE annee_scolaire = ? ORDER BY semaine_num`).all(annee);
  } catch { return []; }
}

/** Le rang de semaine qui contient une date, ou null. */
function semaineDe(semaines, date) {
  if (!date) return null;
  const d = String(date).slice(0, 10);
  const s = semaines.find(x => d >= x.date_debut && d <= x.date_fin)
    || semaines.find(x => d <= x.date_fin);
  return s ? s.semaine_num : null;
}

/**
 * LE CONTRÔLE DES MULTIPLES — OBLIGATOIRE, ET IL SE DIT.
 *
 * Les périodes d'un cours doivent être un multiple de ce que fixe le dossier
 * pédagogique. On peut combler avec de l'autonomie pour y parvenir. Ce qui
 * compte, c'est que l'écran ANNONCE : de combien on s'écarte, et si l'autonomie
 * disponible suffit. Un contrôle qui bloque sans expliquer fait recommencer à
 * l'aveugle ; un contrôle muet laisse partir une grille fausse.
 *
 * Il se calcule ICI et nulle part ailleurs : deux contrôles pour une même règle
 * finiraient par ne plus dire la même chose, et c'est celui qu'on ne regarde
 * pas qui aurait raison.
 */
function controlerUE(annee, section, ueNum) {
  const cours = db.prepare(`
    SELECT cours_code, cours_nom, cours_per, ue_autonomie
    FROM cours WHERE ue_num = ? AND annee_scolaire = ? AND cours_code IS NOT NULL
    ORDER BY cours_code`).all(ueNum, annee);

  const o = organisationDe(annee, section, ueNum);
  const parCours = new Map();
  let autonomiePlacee = 0;
  if (o) {
    for (const gc of db.prepare('SELECT * FROM grille_cours WHERE organisation_id = ?').all(o.id)) {
      const somme = db.prepare(`SELECT COALESCE(SUM(periodes),0) AS s
        FROM grille_activite WHERE grille_cours_id = ?`).get(gc.id).s;
      parCours.set(gc.cours_code, { somme, autonomie: Number(gc.autonomie_placee) || 0 });
      autonomiePlacee += Number(gc.autonomie_placee) || 0;
    }
  }

  const autonomieUE = Number(cours.find(c => c.ue_autonomie != null)?.ue_autonomie) || 0;
  const restante = Math.round((autonomieUE - autonomiePlacee) * 100) / 100;

  const anomalies = [];
  for (const c of cours) {
    const dp = Number(c.cours_per) || 0;
    if (!dp) continue;                        // sans périodes au dossier, rien à contrôler
    const p = parCours.get(c.cours_code);
    if (!p) continue;                         // cours pas encore organisé : ce n'est pas une faute
    const total = Math.round((p.somme + p.autonomie) * 100) / 100;
    if (total === 0) continue;
    const reste = Math.round((total % dp) * 100) / 100;
    if (reste === 0) continue;
    const manque = Math.round((dp - reste) * 100) / 100;
    anomalies.push({
      cours_code: c.cours_code, cours_nom: c.cours_nom,
      total, multiple: dp, manque,
      autonomie_suffit: restante >= manque,
    });
  }

  return {
    ue_num: ueNum,
    conforme: anomalies.length === 0,
    anomalies,
    autonomie: { unite: autonomieUE, placee: Math.round(autonomiePlacee * 100) / 100, restante },
  };
}

/** Le calendrier de l'année, pour que la frise sache où sont les semaines. */
r.get('/calendrier', authRequired, (req, res) => {
  const annee = req.query.annee || anneeDeTravail(req);
  res.json({ annee, semaines: semainesDe(annee) });
});

/**
 * LA GRILLE D'UNE SECTION : les unités, leurs cours, leurs activités.
 *
 * Les dates viennent de `organisation_ue` — celles que l'on saisit déjà dans
 * « Dates des UE ». La grille ne les double pas : elle les LIT, et l'écran les
 * complète là où elles manquent. L'épaisseur de la barre vient des périodes
 * rapportées aux semaines : longue et fine, ou courte et épaisse.
 */
r.get('/', authRequired, (req, res) => {
  const annee = req.query.annee || anneeDeTravail(req);
  const section = String(req.query.section || '').trim();
  if (!section) return res.status(400).json({ error: 'section requise' });

  const semaines = semainesDe(annee);
  const ues = db.prepare(`
    SELECT DISTINCT u.ue_num, u.ue_nom, u.ue_niv, u.ue_quad, u.ue_per_etudiants
    FROM ue u WHERE u.section = ? AND u.annee_scolaire = ?
    ORDER BY u.ue_num`).all(section, annee);

  const sortie = ues.map(u => {
    const o = organisationDe(annee, section, u.ue_num);

    const cours = db.prepare(`
      SELECT cours_code, cours_nom, cours_per, ue_autonomie, ct_pp
      FROM cours WHERE ue_num = ? AND annee_scolaire = ? AND cours_code IS NOT NULL
      ORDER BY cours_code`).all(u.ue_num, annee).map(c => {
      const gc = o ? db.prepare(`SELECT * FROM grille_cours
        WHERE organisation_id = ? AND cours_code = ?`).get(o.id, c.cours_code) : null;
      const activites = gc ? db.prepare(`
        SELECT ga.*, at.libelle AS activite_nom, at.section AS activite_section
        FROM grille_activite ga LEFT JOIN activite_type at ON at.id = ga.activite_id
        WHERE ga.grille_cours_id = ? ORDER BY ga.ordre, ga.id`).all(gc.id) : [];
      return {
        ...c,
        date_debut: gc?.date_debut || null, date_fin: gc?.date_fin || null,
        sem_debut: semaineDe(semaines, gc?.date_debut || o?.date_debut),
        sem_fin: semaineDe(semaines, gc?.date_fin || o?.date_fin),
        autonomie_placee: gc ? Number(gc.autonomie_placee) || 0 : 0,
        activites,
      };
    });

    const perTotal = cours.reduce((t, c) => t + (Number(c.cours_per) || 0), 0);
    const semDeb = semaineDe(semaines, o?.date_debut);
    const semFin = semaineDe(semaines, o?.date_fin);
    /* L'ÉPAISSEUR EST L'INTENSITÉ. Les périodes rapportées aux semaines de
       COURS traversées — on ne compte pas les congés, sinon une unité qui
       enjambe Noël paraîtrait plus légère qu'elle n'est. */
    let semCours = 0;
    if (semDeb && semFin) {
      semCours = semaines.filter(s => s.semaine_num >= semDeb && s.semaine_num <= semFin
        && s.type === 'cours').length;
    }
    const perSemaine = semCours > 0 ? Math.round((perTotal / semCours) * 10) / 10 : null;

    return {
      ...u,
      organisation_id: o?.id || null,
      date_debut: o?.date_debut || null, date_fin: o?.date_fin || null,
      nb_semaines: o?.nb_semaines ?? null,
      sem_debut: semDeb, sem_fin: semFin,
      // Vide, l'unité n'est pas encore posée dans l'année : c'est ce que la
      // grille sert à compléter, et l'écran doit le dire plutôt que d'inventer.
      planifiee: !!(o && o.date_debut && o.date_fin),
      per_total: perTotal, per_semaine: perSemaine,
      cours,
      controle: controlerUE(annee, section, u.ue_num),
    };
  });

  /* UNE PÉRIODE N'EST PAS UNE HEURE, ET LA DURÉE NE SE DEVINE PAS.
     Cinquante minutes chez nous, mais c'est un RÉGLAGE (`planning.periode_minutes`,
     Configuration → Planification) : l'écrire en dur ici en ferait une seconde
     source, et le jour où il change c'est la grille qui aurait tort en silence.
     Le planificateur le sert à l'écran, qui convertit sans rien décider. */
  let periodeMinutes = 50;
  try {
    const p = db.prepare("SELECT valeur FROM parametre WHERE cle = 'planning.periode_minutes'").get();
    if (p && Number(p.valeur) > 0) periodeMinutes = Number(p.valeur);
  } catch { /* paramètre absent : la valeur de la maison */ }

  res.json({ annee, section, semaines, periode_minutes: periodeMinutes, ues: sortie });
});

/**
 * POSER UNE UNITÉ DANS L'ANNÉE.
 * On écrit dans `organisation_ue` — la table des dates d'UE, celle que l'écran
 * « Dates des UE » remplit déjà. Une seule vérité par fait.
 */
r.put('/ue', authRequired, roleRequired('admin', 'editeur', 'coordination'), (req, res) => {
  const b = req.body || {};
  const annee = b.annee_scolaire || anneeDeTravail(req);
  const section = String(b.section || '').trim();
  const ueNum = Number(b.ue_num);
  if (!section || !ueNum) return res.status(400).json({ error: 'section et ue_num requis' });

  const o = organisationDe(annee, section, ueNum, true);
  if (!o) return res.status(500).json({ error: "L'organisation de l'unité n'a pas pu être ouverte." });

  db.prepare(`UPDATE organisation_ue SET date_debut = ?, date_fin = ?, nb_semaines = ?
    WHERE id = ?`).run(b.date_debut || null, b.date_fin || null,
      b.nb_semaines != null ? Number(b.nb_semaines) : o.nb_semaines, o.id);

  res.json({ ok: true, controle: controlerUE(annee, section, ueNum) });
});

/**
 * La découpe d'un cours : ses activités et sa part d'autonomie.
 * On remplace le lot — une découpe est un tout, la corriger ligne à ligne
 * laisserait des activités orphelines d'un état antérieur.
 */
r.put('/cours', authRequired, roleRequired('admin', 'editeur', 'coordination'), (req, res) => {
  const b = req.body || {};
  const annee = b.annee_scolaire || anneeDeTravail(req);
  const section = String(b.section || '').trim();
  const ueNum = Number(b.ue_num);
  const code = String(b.cours_code || '').trim();
  if (!section || !ueNum || !code) {
    return res.status(400).json({ error: 'section, ue_num et cours_code requis' });
  }

  db.transaction(() => {
    const o = organisationDe(annee, section, ueNum, true);
    db.prepare(`INSERT INTO grille_cours (organisation_id, cours_code, date_debut, date_fin, autonomie_placee)
      VALUES (?,?,?,?,?)
      ON CONFLICT(organisation_id, cours_code) DO UPDATE SET
        date_debut = excluded.date_debut, date_fin = excluded.date_fin,
        autonomie_placee = excluded.autonomie_placee`)
      .run(o.id, code, b.date_debut || null, b.date_fin || null,
           Number(b.autonomie_placee) || 0);

    const gc = db.prepare(`SELECT id FROM grille_cours
      WHERE organisation_id = ? AND cours_code = ?`).get(o.id, code);

    if (Array.isArray(b.activites)) {
      db.prepare('DELETE FROM grille_activite WHERE grille_cours_id = ?').run(gc.id);
      const ins = db.prepare(`INSERT INTO grille_activite
        (grille_cours_id, activite_id, periodes, vu_etudiant, ordre) VALUES (?,?,?,?,?)`);
      b.activites.forEach((a, i) => {
        ins.run(gc.id, a.activite_id ? Number(a.activite_id) : null,
                Number(a.periodes) || 0, a.vu_etudiant === false ? 0 : 1, i);
      });
    }
  })();

  res.json({ ok: true, controle: controlerUE(annee, section, ueNum) });
});

/** Les activités proposables : celles de la maison, plus celles de la section. */
r.get('/activites', authRequired, (req, res) => {
  const section = String(req.query.section || '').trim();
  try {
    res.json(db.prepare(`SELECT id, libelle, section, ordre FROM activite_type
      WHERE section IS NULL OR section = ? ORDER BY section IS NOT NULL, ordre, libelle`)
      .all(section));
  } catch { res.json([]); }
});

export default r;
