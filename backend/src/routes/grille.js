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
import { organisationsDe } from '../lib/groupesCommuns.js';

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

    /* TOUT COURS EST ÉVALUÉ, ET CELA SE PLANIFIE COMME LE RESTE.
     *
     * Un examen de fin d'unité, sa correction et la visite des copies prennent
     * des périodes RÉELLES — trois, chez nous — et personne ne pensait à les
     * poser : on découpait le cours en théorie et exercices jusqu'au dernier
     * quart d'heure, puis l'évaluation se tenait « en plus », hors grille. La
     * grille la PROPOSE donc d'office, cochée, et l'on décoche quand le cours
     * est en évaluation continue — auquel cas il n'y a pas de périodes à
     * compter, l'évaluation se faisant pendant le cours.
     *
     * Elle est une ACTIVITÉ comme les autres, et c'est voulu : son nombre de
     * périodes se corrige, elle entre dans le total, et elle se placera dans
     * l'année au moment venu — une partie en janvier, le reste en juin, si
     * c'est le choix du professeur. Un champ « nombre d'heures d'examen » posé
     * à côté n'aurait rien permis de tout cela. */
    const colsAct = dbx.prepare('PRAGMA table_info(activite_type)').all().map(c => c.name);
    if (!colsAct.includes('role')) {
      dbx.exec("ALTER TABLE activite_type ADD COLUMN role TEXT");
    }
    /* On la RECONNAÎT par son rôle, jamais par son libellé : un libellé se
       renomme à l'écran, et le jour où quelqu'un écrit « Examen » au lieu
       d'« Évaluation », la proposition d'office cesserait sans bruit. */
    const evalExistante = dbx.prepare("SELECT id FROM activite_type WHERE role = 'evaluation'").get();
    if (!evalExistante) {
      const ordre = (dbx.prepare('SELECT MAX(ordre) AS m FROM activite_type').get().m || 0) + 1;
      dbx.prepare(`INSERT INTO activite_type (libelle, ordre, role)
        VALUES (?, ?, 'evaluation')`)
        .run('Évaluation et visite des copies', ordre);
    }

    /* LE MODE D'ÉVALUATION DU COURS : examen de fin d'unité (le défaut), ou
       évaluation continue. Il vit sur le cours et non sur l'activité, parce
       que c'est un choix du cours — et qu'en continue il n'y a justement
       aucune ligne d'activité pour le porter. */
    const colsGC = dbx.prepare('PRAGMA table_info(grille_cours)').all().map(c => c.name);
    if (!colsGC.includes('evaluation_mode')) {
      dbx.exec("ALTER TABLE grille_cours ADD COLUMN evaluation_mode TEXT NOT NULL DEFAULT 'examen'");
    }
    /* LE LABORATOIRE TEMPOREL (Charles, 10 octobre 2026) : une activité se
       donne en GROUPES — ses `periodes` restent celles de l'enseignant, tous
       groupes confondus (la règle des multiples les lit ainsi) ; l'étudiant en
       vit periodes / groupes. Et un stage peut BLOQUER les cours du bloc
       pendant ses semaines : c'est une case sur l'unité, pas une règle. */
    const colsGA = dbx.prepare('PRAGMA table_info(grille_activite)').all().map(c => c.name);
    if (!colsGA.includes('groupes')) dbx.exec('ALTER TABLE grille_activite ADD COLUMN groupes INTEGER NOT NULL DEFAULT 1');
    /* L'ACTIVITÉ A SES DATES (Charles, 10 octobre 2026 : « l'évaluation à la fin,
       théorie et exercices en suivant ou en parallèle »). Sans dates, elle court
       sur toute la période de son unité. */
    if (!colsGA.includes('date_debut')) dbx.exec('ALTER TABLE grille_activite ADD COLUMN date_debut TEXT');
    if (!colsGA.includes('date_fin')) dbx.exec('ALTER TABLE grille_activite ADD COLUMN date_fin TEXT');
    const colsOU = dbx.prepare('PRAGMA table_info(organisation_ue)').all().map(c => c.name);
    if (!colsOU.includes('stage_bloquant')) dbx.exec('ALTER TABLE organisation_ue ADD COLUMN stage_bloquant INTEGER NOT NULL DEFAULT 0');
    // Par défaut, pas de cours pendant les vacances ; une UE peut en décider autrement.
    if (!colsOU.includes('cours_pendant_conges')) dbx.exec('ALTER TABLE organisation_ue ADD COLUMN cours_pendant_conges INTEGER NOT NULL DEFAULT 0');
    /* L'AUTONOMIE MISE DE CÔTÉ (Charles, 10 octobre 2026) : volontairement, avec un
       motif ; elle reste rattachée à son UE et se lit au niveau de la section. */
    if (!colsOU.includes('autonomie_reservee')) dbx.exec('ALTER TABLE organisation_ue ADD COLUMN autonomie_reservee REAL NOT NULL DEFAULT 0');
    if (!colsOU.includes('autonomie_motif')) dbx.exec('ALTER TABLE organisation_ue ADD COLUMN autonomie_motif TEXT');
  } catch (e) { console.error('[migration] grille :', e.message); }
}

/** L'organisation d'une unité : celle qui existe, ou celle qu'on ouvre. */
/* UNE UE EN PLUSIEURS ORGANISATIONS (Charles, 10 octobre 2026 : AESI, une moitié
   en stage de Toussaint à Noël, l'autre de Carnaval à Pâques) : `org` désigne la
   sienne ; sans `org`, la première, comme avant. */
function organisationDe(annee, section, ueNum, creer = false, org = null) {
  const lire = () => org
    ? db.prepare(`SELECT * FROM organisation_ue WHERE annee_scolaire = ? AND section = ? AND ue_num = ? AND COALESCE(num_organisation, 1) = ?`).get(annee, section, ueNum, org)
    : db.prepare(`SELECT * FROM organisation_ue WHERE annee_scolaire = ? AND section = ? AND ue_num = ? ORDER BY num_organisation LIMIT 1`).get(annee, section, ueNum);
  let o = lire();
  if (!o && creer) {
    db.prepare(`INSERT INTO organisation_ue (ue_num, section, annee_scolaire, num_organisation)
      VALUES (?,?,?,?)`).run(ueNum, section, annee, org || 1);
    o = lire();
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
      -- Les activités Z ne se planifient pas : travail de l'étudiant, sans
      -- enseignant (Charles, 25 septembre 2026).
      AND (ct_pp IS NULL OR ct_pp <> 'Z')
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
  /* L'AUTONOMIE A SON PROPRE CONTRÔLE, et c'est le seul qui la concerne : on
     n'en place pas plus que l'unité n'en porte. Ce qui reste non placé est
     SIGNALÉ, jamais réparti d'office. */
  const autonomieDepassee = restante < 0;

  const anomalies = [];
  for (const c of cours) {
    const dp = Number(c.cours_per) || 0;
    if (!dp) continue;                        // sans périodes au dossier, rien à contrôler
    const p = parCours.get(c.cours_code);
    if (!p) continue;                         // cours pas encore organisé : ce n'est pas une faute
    /* L'AUTONOMIE N'ENTRE PAS DANS LE MULTIPLE. ELLE SE COMPTE À PART.
     *
     * Elle y entrait, et le calcul était FAUX : un cours de 64 découpé en 64
     * périodes de théorie est conforme ; y poser 4 d'autonomie le portait à 68
     * et déclenchait « il manque 60 pour un multiple de 64 ». On demandait donc
     * de casser une grille juste pour satisfaire un contrôle qui l'était moins.
     *
     * Ce sont deux grandeurs distinctes : les périodes du COURS, qui doivent
     * tomber sur un multiple de ce que fixe le dossier, et l'AUTONOMIE de
     * l'unité, qui se répartit sur ses cours et se contrôle contre son propre
     * plafond. Les additionner revenait à comparer des heures de cours à des
     * heures de travail autonome. */
    const total = Math.round(p.somme * 100) / 100;
    /* UN COURS ORGANISÉ À ZÉRO N'EXISTE PAS, ET C'ÉTAIT COMPTÉ « CONFORME ».
     *
     * Zéro passait le modulo sans bruit : on retirait toutes les activités d'un
     * cours, et la grille le déclarait en règle. Or on ne SUPPRIME pas un cours
     * — il vient du dossier pédagogique, qui ne bouge pas. Un cours vidé n'est
     * donc pas un cours sans périodes : c'est un découpage qu'on a perdu, et il
     * faut le dire. L'écriture, elle, ne le laisse plus arriver (voir
     * `PUT /cours`) ; ce contrôle rattrape ce qui a pu être enregistré avant. */
    if (total === 0) {
      anomalies.push({
        cours_code: c.cours_code, cours_nom: c.cours_nom,
        total: 0, multiple: dp, manque: dp, vide: true,
      });
      continue;
    }
    const reste = Math.round((total % dp) * 100) / 100;
    if (reste === 0) continue;
    const manque = Math.round((dp - reste) * 100) / 100;
    anomalies.push({
      cours_code: c.cours_code, cours_nom: c.cours_nom,
      total, multiple: dp, manque,
    });
  }

  return {
    ue_num: ueNum,
    conforme: anomalies.length === 0 && !autonomieDepassee,
    anomalies,
    autonomie_depassee: autonomieDepassee,
    autonomie: { unite: autonomieUE, placee: Math.round(autonomiePlacee * 100) / 100, restante },
  };
}

/**
 * LA COUPURE ENTRE LES DEUX QUADRIMESTRES — déduite, jamais saisie.
 *
 * C'est la plus longue suite de semaines sans cours au milieu de l'année. Elle
 * se calculait déjà à l'écran pour dessiner la frise ; la voici côté serveur,
 * parce que l'intensité en dépend maintenant. DEUX calculs de la même coupure
 * finiraient par ne plus tomber au même endroit, et c'est celui qu'on ne
 * regarde pas qui aurait raison.
 */
function coupureQuadri(semaines) {
  if (!semaines.length) return 0;
  const milieu = Math.floor(semaines.length / 2);
  let best = semaines[milieu]?.semaine_num ?? 0, bestLen = 0, i = 0;
  while (i < semaines.length) {
    if (semaines[i].type === 'cours') { i++; continue; }
    let j = i;
    while (j < semaines.length && semaines[j].type !== 'cours') j++;
    const len = j - i;
    if (len > bestLen && Math.abs(i - milieu) < semaines.length / 3) {
      bestLen = len;
      best = semaines[i + Math.floor(len / 2)]?.semaine_num ?? best;
    }
    i = j;
  }
  return best;
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

  // Une fiche par organisation : une UE dédoublée paraît deux fois, chacune avec ses dates.
  const sortie = ues.flatMap(u => organisationsDe(section, u.ue_num, annee).map((num, _, toutes) => {
    const o = organisationDe(annee, section, u.ue_num, false, num);
    // Le verre d'une organisation sans découpe propre est celui de la première (même UE, même contenu).
    const propre = o && db.prepare('SELECT 1 FROM grille_cours WHERE organisation_id = ? LIMIT 1').get(o.id);
    const ov = num > 1 && !propre ? organisationDe(annee, section, u.ue_num) : o;

    const cours = db.prepare(`
      SELECT cours_code, cours_nom, cours_per, ue_autonomie, ct_pp, COALESCE(is_stage, 0) AS is_stage
      FROM cours WHERE ue_num = ? AND annee_scolaire = ? AND cours_code IS NOT NULL
        AND (ct_pp IS NULL OR ct_pp <> 'Z')          -- Z : ni planifié, ni compté
      ORDER BY cours_code`).all(u.ue_num, annee).map(c => {
      const gc = ov ? db.prepare(`SELECT * FROM grille_cours
        WHERE organisation_id = ? AND cours_code = ?`).get(ov.id, c.cours_code) : null;
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
        /* `organise` dit si ce cours a déjà été ouvert dans la grille. Il ne
           commande plus la proposition — c'est la PRÉSENCE DE LIGNES qui la
           commande, côté écran : un cours ouvert puis vidé se rouvrait sinon à
           zéro. Le champ reste parce qu'il distingue « jamais touché » de
           « organisé », ce que le nombre de lignes ne dit pas. */
        organise: !!gc,
        evaluation_mode: gc ? (gc.evaluation_mode || 'examen') : 'examen',
        activites,
      };
    });

    const perTotal = cours.reduce((t, c) => t + (Number(c.cours_per) || 0), 0);
    const semDeb = semaineDe(semaines, o?.date_debut);
    const semFin = semaineDe(semaines, o?.date_fin);
    /* L'ÉPAISSEUR EST L'INTENSITÉ, ET ELLE NE SE TAIT JAMAIS.
     *
     * Les périodes rapportées aux semaines de COURS traversées — on ne compte
     * pas les congés, sinon une unité qui enjambe Noël paraîtrait plus légère
     * qu'elle n'est.
     *
     * MAIS ELLE NE PEUT PAS DÉPENDRE DES SEULES DATES ENCODÉES. Tant qu'une
     * unité n'avait pas ses dates, il n'y avait pas d'assiette, donc pas
     * d'intensité, donc une barre au minimum : les unités pas encore posées
     * — c'est-à-dire précisément celles qu'on vient planifier — se ressemblaient
     * toutes, la plus lourde comme la plus légère. Or on en sait assez pour
     * répondre : le dossier dit le QUADRIMESTRE, et le calendrier dit combien
     * de semaines de cours ce quadrimestre porte.
     *
     * Deux assiettes, dans cet ordre : les DATES quand elles sont encodées —
     * c'est ce qu'on a décidé pour cette unité —, le QUADRIMESTRE sinon.
     * L'écran dit laquelle a servi : une épaisseur calculée sur une hypothèse
     * ne doit pas se lire comme une épaisseur mesurée. */
    const semainesCoursEntre = (a, b) => semaines.filter(
      s => s.semaine_num >= a && s.semaine_num <= b && s.type === 'cours').length;

    let semCours = 0;
    let assiette = null;
    if (semDeb && semFin) {
      semCours = semainesCoursEntre(semDeb, semFin);
      if (semCours > 0) assiette = 'dates';
    }
    if (!semCours) {
      /* LE QUADRIMESTRE VIENT DU DOSSIER (`ue_quad`), la coupure du CALENDRIER.
         Elle se déduit de la plus longue suite de semaines sans cours au milieu
         de l'année : c'est ce qui sépare Q1 de Q2, et on ne la saisit pas une
         seconde fois. Une unité annuelle, ou dont le quadrimestre n'est pas
         renseigné, s'étale sur toutes les semaines de cours. */
      const q = String(u.ue_quad ?? '').trim();
      const toutes = semaines.filter(s => s.type === 'cours').map(s => s.semaine_num);
      let fenetre = toutes;
      if (toutes.length) {
        const coupure = coupureQuadri(semaines);
        if (q === '1') fenetre = toutes.filter(n => n <= coupure);
        else if (q === '2') fenetre = toutes.filter(n => n > coupure);
      }
      semCours = fenetre.length;
      if (semCours > 0) assiette = 'quadrimestre';
    }
    const perSemaine = semCours > 0 ? Math.round((perTotal / semCours) * 10) / 10 : null;

    return {
      ...u,
      num_organisation: num, nb_organisations: toutes.length, cle: toutes.length > 1 ? `${u.ue_num}#${num}` : String(u.ue_num),
      verre_repris: ov !== o,
      organisation_id: o?.id || null,
      date_debut: o?.date_debut || null, date_fin: o?.date_fin || null,
      stage: cours.some(c => c.is_stage), stage_bloquant: !!o?.stage_bloquant, cours_pendant_conges: !!o?.cours_pendant_conges,
      autonomie_reservee: Number(o?.autonomie_reservee) || 0, autonomie_motif: o?.autonomie_motif || null,
      nb_semaines: o?.nb_semaines ?? null,
      sem_debut: semDeb, sem_fin: semFin,
      // Vide, l'unité n'est pas encore posée dans l'année : c'est ce que la
      // grille sert à compléter, et l'écran doit le dire plutôt que d'inventer.
      planifiee: !!(o && o.date_debut && o.date_fin),
      per_total: perTotal, per_semaine: perSemaine,
      // Sur quoi l'intensité a été calculée — l'écran le dit, pour qu'une
      // épaisseur supposée ne se lise pas comme une épaisseur mesurée.
      intensite_assiette: assiette, semaines_cours: semCours,
      cours,
      controle: controlerUE(annee, section, u.ue_num),
    };
  }));

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

  /* TROIS PÉRIODES POUR L'EXAMEN, LA CORRECTION ET LA VISITE DES COPIES —
     c'est l'usage de la maison, donc un RÉGLAGE et non une constante du code.
     Écrit en dur, il aurait rejoint la liste des décisions invisibles et
     indiscutables que ce projet passe son temps à déterrer. */
  let evalPeriodes = 3;
  try {
    const p = db.prepare("SELECT valeur FROM parametre WHERE cle = 'planning.evaluation_periodes'").get();
    if (p && Number(p.valeur) >= 0) evalPeriodes = Number(p.valeur);
  } catch { /* paramètre absent : l'usage de la maison */ }
  let evalActiviteId = null;
  let matiereId = null;
  try {
    evalActiviteId = db.prepare("SELECT id FROM activite_type WHERE role = 'evaluation'").get()?.id ?? null;
    /* LA MATIÈRE : la première activité de la maison qui n'est pas
       l'évaluation — « Théorie » chez nous. C'est ce que la grille propose
       pour le corps du cours, parce qu'un cours est donné : ouvrir la fenêtre
       sur zéro période obligeait à retaper ce que le dossier pédagogique sait
       déjà, et affichait « il manque 64 » sur un cours dont personne n'avait
       encore rien dit. */
    matiereId = db.prepare(`SELECT id FROM activite_type
      WHERE section IS NULL AND (role IS NULL OR role <> 'evaluation')
      ORDER BY ordre, id LIMIT 1`).get()?.id ?? null;
  } catch { /* pas encore migré */ }

  res.json({ annee, section, semaines, periode_minutes: periodeMinutes,
    evaluation: { activite_id: evalActiviteId, matiere_id: matiereId, periodes: evalPeriodes },
    ues: sortie });
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

  const o = organisationDe(annee, section, ueNum, true, Number(b.num_organisation) || null);
  if (!o) return res.status(500).json({ error: "L'organisation de l'unité n'a pas pu être ouverte." });

  // Seuls les champs ENVOYÉS changent : cocher « stage bloquant » ne vide pas les dates.
  const a = k => Object.prototype.hasOwnProperty.call(b, k);
  if (a('date_debut') || a('date_fin')) {
    db.prepare(`UPDATE organisation_ue SET date_debut = ?, date_fin = ?, nb_semaines = ?
      WHERE id = ?`).run(b.date_debut || null, b.date_fin || null,
        b.nb_semaines != null ? Number(b.nb_semaines) : o.nb_semaines, o.id);
  }
  if (a('stage_bloquant')) db.prepare('UPDATE organisation_ue SET stage_bloquant = ? WHERE id = ?').run(b.stage_bloquant ? 1 : 0, o.id);
  if (a('cours_pendant_conges')) db.prepare('UPDATE organisation_ue SET cours_pendant_conges = ? WHERE id = ?').run(b.cours_pendant_conges ? 1 : 0, o.id);
  if (a('autonomie_reservee')) {
    const v = Math.max(0, Number(b.autonomie_reservee) || 0), motif = String(b.autonomie_motif || '').trim();
    if (v > 0 && !motif) return res.status(400).json({ error: 'Mettre de l’autonomie de côté demande un motif.' });
    db.prepare('UPDATE organisation_ue SET autonomie_reservee = ?, autonomie_motif = ? WHERE id = ?').run(v, v > 0 ? motif : null, o.id);
  }

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

  let repli = { applique: false, periodes: 0 };
  db.transaction(() => {
    const o = organisationDe(annee, section, ueNum, true, Number(b.num_organisation) || null);
    /* LA PREMIÈRE DÉCOUPE PROPRE D'UNE ORGANISATION DÉDOUBLÉE : son verre était celui
       de l'organisation 1 ; on le recopie d'abord en entier, sinon les autres cours
       paraîtraient vides dès qu'on en retouche un. */
    if ((o.num_organisation || 1) > 1 && !db.prepare('SELECT 1 FROM grille_cours WHERE organisation_id = ? LIMIT 1').get(o.id)) {
      const p1 = organisationDe(annee, section, ueNum);
      if (p1 && p1.id !== o.id) for (const g of db.prepare('SELECT * FROM grille_cours WHERE organisation_id = ?').all(p1.id)) {
        const id = db.prepare('INSERT INTO grille_cours (organisation_id, cours_code, date_debut, date_fin, autonomie_placee, evaluation_mode) VALUES (?,?,?,?,?,?)')
          .run(o.id, g.cours_code, null, null, g.autonomie_placee, g.evaluation_mode).lastInsertRowid;
        for (const a of db.prepare('SELECT * FROM grille_activite WHERE grille_cours_id = ?').all(g.id))
          db.prepare('INSERT INTO grille_activite (grille_cours_id, activite_id, periodes, vu_etudiant, ordre, groupes) VALUES (?,?,?,?,?,?)').run(id, a.activite_id, a.periodes, a.vu_etudiant, a.ordre, a.groupes);
      }
    }
    /* Le mode d'évaluation : 'examen' (le défaut) ou 'continue'. Toute autre
       valeur est ramenée au défaut — un mode inconnu écrit en base ferait
       disparaître la proposition sans que rien ne le dise. */
    const mode = b.evaluation_mode === 'continue' ? 'continue' : 'examen';
    db.prepare(`INSERT INTO grille_cours
        (organisation_id, cours_code, date_debut, date_fin, autonomie_placee, evaluation_mode)
      VALUES (?,?,?,?,?,?)
      ON CONFLICT(organisation_id, cours_code) DO UPDATE SET
        date_debut = excluded.date_debut, date_fin = excluded.date_fin,
        autonomie_placee = excluded.autonomie_placee,
        evaluation_mode = excluded.evaluation_mode`)
      .run(o.id, code, b.date_debut || null, b.date_fin || null,
           Number(b.autonomie_placee) || 0, mode);

    const gc = db.prepare(`SELECT id FROM grille_cours
      WHERE organisation_id = ? AND cours_code = ?`).get(o.id, code);

    if (Array.isArray(b.activites)) {
      /* ON NE SUPPRIME PAS UN COURS, DONC ON NE L'ENREGISTRE PAS À ZÉRO.
       *
       * Le cours vient du dossier pédagogique : il existe, qu'on l'ait découpé
       * ou non. Vider ses activités n'était pourtant pas empêché — on retirait
       * les lignes, on enregistrait, et le cours se retrouvait à zéro période
       * avec un contrôle qui le déclarait en règle. AU PIRE, ON REVIENT AU
       * CONTENU DU COURS : le dossier dit combien il porte, et c'est ce qu'on
       * réécrit, en une ligne de matière. On ne perd pas le cours, on perd
       * seulement le découpage qu'on venait d'effacer — et la réponse le dit,
       * pour que l'écran ne fasse pas semblant d'avoir enregistré autre chose. */
      const utiles = b.activites.filter(a => a.activite_id && (Number(a.periodes) || 0) > 0);
      const somme = utiles.reduce((t, a) => t + (Number(a.periodes) || 0), 0);

      let lignes = utiles;
      if (somme <= 0) {
        const dp = Number(db.prepare(`SELECT cours_per FROM cours
          WHERE ue_num = ? AND cours_code = ? AND annee_scolaire = ?`)
          .get(ueNum, code, annee)?.cours_per) || 0;
        const matiere = db.prepare(`SELECT id FROM activite_type
          WHERE section IS NULL AND (role IS NULL OR role <> 'evaluation')
          ORDER BY ordre, id LIMIT 1`).get()?.id ?? null;
        if (dp > 0 && matiere) {
          lignes = [{ activite_id: matiere, periodes: dp, vu_etudiant: true }];
          repli = { applique: true, periodes: dp };
        }
      }

      db.prepare('DELETE FROM grille_activite WHERE grille_cours_id = ?').run(gc.id);
      const ins = db.prepare(`INSERT INTO grille_activite
        (grille_cours_id, activite_id, periodes, vu_etudiant, ordre, groupes, date_debut, date_fin) VALUES (?,?,?,?,?,?,?,?)`);
      const jour = d => (/^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) ? String(d) : null);
      lignes.forEach((a, i) => {
        const d = jour(a.date_debut), f = jour(a.date_fin);
        ins.run(gc.id, a.activite_id ? Number(a.activite_id) : null,
                Number(a.periodes) || 0, a.vu_etudiant === false ? 0 : 1, i,
                Math.max(1, Math.min(30, Math.round(Number(a.groupes) || 1))),
                d, f && d && f < d ? d : f);
      });
    }
  })();

  res.json({ ok: true, repli, controle: controlerUE(annee, section, ueNum) });
});

/**
 * REMPLIR LES VERRES DEPUIS LES ATTRIBUTIONS (Charles, 10 octobre 2026 : « j'ai
 * déjà les attributions : il faut que les verres puissent être remplis avec ce
 * qui a déjà été créé »). Pour chaque cours de l'unité : ses activités, leur
 * nombre de groupes (les codes de groupe distincts) et leurs périodes — côté
 * enseignant, la somme de tous les groupes ; l'étudiant en vit le total divisé par
 * les groupes. On lit l'organisation de la SECTION seulement (l'organisation 2 de
 * la 282 est celle d'orthoptie), sans les lignes Z ni les remplacements (la ligne
 * remplacée porte déjà les périodes du groupe). Un cours déjà découpé n'est
 * remplacé que si on le demande ; rien ne s'écrit sans le compte rendu d'abord.
 */
function propositionDepuisAttributions(annee, section, ueNum, org = 1) {
  let matiere = null;
  try { matiere = db.prepare(`SELECT id FROM activite_type WHERE section IS NULL AND (role IS NULL OR role <> 'evaluation') ORDER BY ordre, id LIMIT 1`).get()?.id ?? null; } catch { /* */ }
  const lignes = db.prepare(`SELECT a.code_cours, a.activite_id, a.code, COALESCE(a.periodes_attribuees, 0) AS p, t.libelle
    FROM attribution a LEFT JOIN activite_type t ON t.id = a.activite_id
    WHERE a.annee_scolaire = ? AND a.ue_num = ? AND COALESCE(a.num_organisation, 1) = ?
      AND (a.section = ? OR a.section IS NULL) AND a.code_cours IS NOT NULL
      AND COALESCE(a.type_cours, '') <> 'Z' AND a.remplace_attribution_id IS NULL`).all(annee, ueNum, org, section);
  const parCours = new Map();
  for (const l of lignes) {
    const act = l.activite_id || matiere;
    if (!parCours.has(l.code_cours)) parCours.set(l.code_cours, new Map());
    const m = parCours.get(l.code_cours);
    if (!m.has(act)) m.set(act, { activite_id: act, activite_nom: l.libelle || 'Théorie', groupes: new Set(), periodes: 0 });
    const x = m.get(act);
    x.groupes.add(l.code || '');
    x.periodes += Number(l.p) || 0;
  }
  return [...parCours.entries()].map(([cours_code, m]) => ({ cours_code,
    activites: [...m.values()].filter(x => x.periodes > 0).map(x => ({ activite_id: x.activite_id, activite_nom: x.activite_nom,
      groupes: Math.max(1, x.groupes.size), periodes: Math.round(x.periodes * 100) / 100,
      par_etudiant: Math.round(x.periodes / Math.max(1, x.groupes.size) * 10) / 10 })) }))
    .filter(c => c.activites.length);
}

/* DÉDOUBLER UNE UE : une organisation de plus, sans dates — on la pose ensuite dans
   l'année. Son verre est celui de la première tant qu'on ne le découpe pas. */
r.post('/organisation', authRequired, roleRequired('admin', 'editeur', 'coordination'), (req, res) => {
  const b = req.body || {};
  const annee = b.annee_scolaire || anneeDeTravail(req), section = String(b.section || '').trim(), ueNum = Number(b.ue_num);
  if (!section || !ueNum) return res.status(400).json({ error: 'section et ue_num requis' });
  organisationDe(annee, section, ueNum, true);
  const n = (db.prepare('SELECT MAX(COALESCE(num_organisation, 1)) m FROM organisation_ue WHERE annee_scolaire = ? AND section = ? AND ue_num = ?').get(annee, section, ueNum).m || 1) + 1;
  db.prepare('INSERT INTO organisation_ue (ue_num, section, annee_scolaire, num_organisation) VALUES (?,?,?,?)').run(ueNum, section, annee, n);
  res.json({ ok: true, num_organisation: n });
});
/* RETIRER UNE ORGANISATION : seulement la dernière, et seulement si aucune
   attribution ni aucun étudiant n'y est rattaché — sinon on effacerait ce qui la fait vivre. */
r.delete('/organisation', authRequired, roleRequired('admin', 'editeur', 'coordination'), (req, res) => {
  const b = req.body || {};
  const annee = b.annee_scolaire || anneeDeTravail(req), section = String(b.section || '').trim(), ueNum = Number(b.ue_num), n = Number(b.num_organisation);
  if (!section || !ueNum || !(n > 1)) return res.status(400).json({ error: 'section, ue_num et une organisation au-delà de la première' });
  const max = db.prepare('SELECT MAX(COALESCE(num_organisation, 1)) m FROM organisation_ue WHERE annee_scolaire = ? AND section = ? AND ue_num = ?').get(annee, section, ueNum).m;
  if (n !== max) return res.status(400).json({ error: `Seule la dernière organisation (${max}) se retire.` });
  const attr = db.prepare('SELECT COUNT(*) n FROM attribution WHERE annee_scolaire = ? AND ue_num = ? AND COALESCE(num_organisation, 1) = ?').get(annee, ueNum, n).n;
  const etu = db.prepare('SELECT COUNT(*) n FROM etudiant_inscription WHERE annee_scolaire = ? AND ue_num = ? AND num_organisation = ?').get(annee, ueNum, n).n;
  if (attr || etu) return res.status(409).json({ error: `L’organisation ${n} porte ${attr} attribution(s) et ${etu} étudiant(s) : elle ne se retire pas.` });
  const o = organisationDe(annee, section, ueNum, false, n);
  db.transaction(() => {
    db.prepare('DELETE FROM grille_activite WHERE grille_cours_id IN (SELECT id FROM grille_cours WHERE organisation_id = ?)').run(o.id);
    db.prepare('DELETE FROM grille_cours WHERE organisation_id = ?').run(o.id);
    db.prepare('DELETE FROM organisation_ue WHERE id = ?').run(o.id);
  })();
  res.json({ ok: true });
});

r.post('/depuis-attributions', authRequired, roleRequired('admin', 'editeur', 'coordination'), (req, res) => {
  const b = req.body || {};
  const annee = b.annee_scolaire || anneeDeTravail(req);
  const section = String(b.section || '').trim();
  const ues = (Array.isArray(b.ue_nums) ? b.ue_nums : [b.ue_num]).map(Number).filter(Boolean);
  if (!section || !ues.length) return res.status(400).json({ error: 'section et unité(s) requises' });
  const remplacer = !!b.remplacer, simulation = b.simulation !== false;
  const rapport = { a_ecrire: [], deja: [], sans_attribution: [] };
  for (const ueNum of ues) {
    // Chaque organisation se remplit de SES attributions.
    let rien = true;
    for (const org of organisationsDe(section, ueNum, annee)) {
      const prop = propositionDepuisAttributions(annee, section, ueNum, org);
      if (!prop.length) continue;
      rien = false;
      const o = organisationDe(annee, section, ueNum, false, org);
      for (const c of prop) {
        const gc = o ? db.prepare('SELECT id FROM grille_cours WHERE organisation_id = ? AND cours_code = ?').get(o.id, c.cours_code) : null;
        const n = gc ? db.prepare('SELECT COUNT(*) n FROM grille_activite WHERE grille_cours_id = ?').get(gc.id).n : 0;
        (n && !remplacer ? rapport.deja : rapport.a_ecrire).push({ ue_num: ueNum, num_organisation: org, ...c });
      }
    }
    if (rien) rapport.sans_attribution.push(ueNum);
  }
  if (simulation) return res.json(rapport);
  db.transaction(() => {
    for (const c of rapport.a_ecrire) {
      const o = organisationDe(annee, section, c.ue_num, true, c.num_organisation || 1);
      db.prepare(`INSERT INTO grille_cours (organisation_id, cours_code) VALUES (?, ?)
        ON CONFLICT(organisation_id, cours_code) DO NOTHING`).run(o.id, c.cours_code);
      const gc = db.prepare('SELECT id FROM grille_cours WHERE organisation_id = ? AND cours_code = ?').get(o.id, c.cours_code);
      db.prepare('DELETE FROM grille_activite WHERE grille_cours_id = ?').run(gc.id);
      const ins = db.prepare('INSERT INTO grille_activite (grille_cours_id, activite_id, periodes, vu_etudiant, ordre, groupes) VALUES (?,?,?,1,?,?)');
      c.activites.forEach((a, i) => ins.run(gc.id, a.activite_id, a.periodes, i, a.groupes));
    }
  })();
  res.json({ ...rapport, ecrit: rapport.a_ecrire.length });
});

/**
 * LE GRAND NETTOYAGE DU LABORATOIRE (Charles, 10 octobre 2026 : « il vide tout, ne
 * garde que la structure de la section ; puis on propose de réimporter depuis les
 * attributions ; en même temps il sauve le labo »).
 * Ce qui part : les verres et leurs couches (grille_cours, grille_activite), le plan
 * enregistré (plan_creneau), les briques et leurs réglages, les locaux des
 * activités, les cases stage bloquant, congés et autonomie mise de côté — et, sur
 * demande seulement, les dates des UE (Dates des UE et l'échéancier les lisent).
 * Ce qui reste : les UE, les cours (le dossier), les plages, les priorités, les
 * attributions. TOUT EST SAUVEGARDÉ AVANT (labo_sauvegarde) et se restaure.
 */
function migrerSauvegardes() {
  db.exec(`CREATE TABLE IF NOT EXISTS labo_sauvegarde (
    id INTEGER PRIMARY KEY AUTOINCREMENT, annee_scolaire TEXT NOT NULL, section TEXT NOT NULL,
    motif TEXT, contenu TEXT NOT NULL, cree_par TEXT, cree_le TEXT DEFAULT (datetime('now')))`);
}
const lire = (sql, ...p) => { try { return db.prepare(sql).all(...p); } catch { return []; } };
function instantane(annee, section) {
  const orgs = lire('SELECT * FROM organisation_ue WHERE annee_scolaire = ? AND section = ?', annee, section);
  const ids = orgs.map(o => o.id);
  const gc = ids.length ? lire(`SELECT * FROM grille_cours WHERE organisation_id IN (${ids.map(() => '?').join(',')})`, ...ids) : [];
  const gcIds = gc.map(x => x.id);
  const ga = gcIds.length ? lire(`SELECT * FROM grille_activite WHERE grille_cours_id IN (${gcIds.map(() => '?').join(',')})`, ...gcIds) : [];
  return { organisations: orgs, grille_cours: gc, grille_activite: ga,
    plan_creneau: lire('SELECT * FROM plan_creneau WHERE annee_scolaire = ? AND section = ?', annee, section),
    horaire_local_activite: lire('SELECT * FROM horaire_local_activite WHERE annee_scolaire = ? AND section = ?', annee, section),
    groupe_commun_reglage: lire('SELECT * FROM groupe_commun_reglage WHERE annee_scolaire = ? AND section = ?', annee, section),
    groupe_commun_brique: lire('SELECT * FROM groupe_commun_brique WHERE annee_scolaire = ? AND section = ?', annee, section) };
}
function sauvegarder(annee, section, motif, par) {
  migrerSauvegardes();
  const c = instantane(annee, section);
  const id = db.prepare('INSERT INTO labo_sauvegarde (annee_scolaire, section, motif, contenu, cree_par) VALUES (?,?,?,?,?)')
    .run(annee, section, motif, JSON.stringify(c), par).lastInsertRowid;
  return { id, compte: { verres: c.grille_cours.length, couches: c.grille_activite.length, plan: c.plan_creneau.length, briques: c.groupe_commun_brique.length } };
}
function vider(annee, section, avecDates) {
  const orgs = lire('SELECT id FROM organisation_ue WHERE annee_scolaire = ? AND section = ?', annee, section).map(o => o.id);
  const run = (sql, ...p) => { try { return db.prepare(sql).run(...p).changes; } catch { return 0; } };
  if (orgs.length) {
    const ph = orgs.map(() => '?').join(',');
    run(`DELETE FROM grille_activite WHERE grille_cours_id IN (SELECT id FROM grille_cours WHERE organisation_id IN (${ph}))`, ...orgs);
    run(`DELETE FROM grille_cours WHERE organisation_id IN (${ph})`, ...orgs);
    run(`UPDATE organisation_ue SET stage_bloquant = 0, cours_pendant_conges = 0, autonomie_reservee = 0, autonomie_motif = NULL${avecDates ? ', date_debut = NULL, date_fin = NULL' : ''} WHERE id IN (${ph})`, ...orgs);
  }
  for (const t of ['plan_creneau', 'horaire_local_activite', 'groupe_commun_reglage', 'groupe_commun_brique'])
    run(`DELETE FROM ${t} WHERE annee_scolaire = ? AND section = ?`, annee, section);
}
function inserer(table, lignes) {
  for (const l of lignes) {
    const cols = Object.keys(l);
    try { db.prepare(`INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...cols.map(k => l[k])); } catch { /* colonne disparue : on passe */ }
  }
}

r.post('/nettoyer', authRequired, roleRequired('admin', 'editeur', 'coordination'), (req, res) => {
  const b = req.body || {};
  const annee = b.annee_scolaire || anneeDeTravail(req), section = String(b.section || '').trim();
  if (!section) return res.status(400).json({ error: 'section requise' });
  const c = instantane(annee, section);
  const compte = { verres: c.grille_cours.length, couches: c.grille_activite.length, plan: c.plan_creneau.length,
    briques: c.groupe_commun_brique.length, ues_datees: c.organisations.filter(o => o.date_debut).length };
  if (b.simulation !== false) return res.json({ compte });
  let sauvegarde;
  db.transaction(() => {
    sauvegarde = sauvegarder(annee, section, 'avant le grand nettoyage', req.user?.email || null);
    vider(annee, section, !!b.dates);
  })();
  res.json({ ok: true, compte, sauvegarde_id: sauvegarde.id });
});

r.get('/sauvegardes', authRequired, (req, res) => {
  migrerSauvegardes();
  const annee = req.query.annee || anneeDeTravail(req), section = String(req.query.section || '');
  res.json(db.prepare(`SELECT id, motif, cree_par, cree_le, length(contenu) taille FROM labo_sauvegarde
    WHERE annee_scolaire = ? AND section = ? ORDER BY id DESC LIMIT 30`).all(annee, section));
});

r.post('/sauvegardes/:id/restaurer', authRequired, roleRequired('admin', 'editeur', 'coordination'), (req, res) => {
  migrerSauvegardes();
  const s0 = db.prepare('SELECT * FROM labo_sauvegarde WHERE id = ?').get(Number(req.params.id));
  if (!s0) return res.status(404).json({ error: 'Sauvegarde introuvable' });
  const c = JSON.parse(s0.contenu);
  db.transaction(() => {
    // L'état actuel est sauvé lui aussi : une restauration se défait.
    sauvegarder(s0.annee_scolaire, s0.section, `avant la restauration du ${s0.cree_le}`, req.user?.email || null);
    vider(s0.annee_scolaire, s0.section, true);
    for (const o of c.organisations || []) {
      try {
        db.prepare(`UPDATE organisation_ue SET date_debut = ?, date_fin = ?, nb_semaines = ?, stage_bloquant = ?, cours_pendant_conges = ?,
          autonomie_reservee = ?, autonomie_motif = ? WHERE id = ?`).run(o.date_debut, o.date_fin, o.nb_semaines, o.stage_bloquant || 0,
          o.cours_pendant_conges || 0, o.autonomie_reservee || 0, o.autonomie_motif || null, o.id);
      } catch { /* */ }
    }
    inserer('grille_cours', c.grille_cours || []); inserer('grille_activite', c.grille_activite || []);
    inserer('plan_creneau', c.plan_creneau || []); inserer('horaire_local_activite', c.horaire_local_activite || []);
    inserer('groupe_commun_reglage', c.groupe_commun_reglage || []); inserer('groupe_commun_brique', c.groupe_commun_brique || []);
  })();
  res.json({ ok: true });
});

/** Les activités proposables : celles de la maison, plus celles de la section. */
r.get('/activites', authRequired, (req, res) => {
  const section = String(req.query.section || '').trim();
  try {
    res.json(db.prepare(`SELECT id, libelle, section, ordre, role FROM activite_type
      WHERE section IS NULL OR section = ? ORDER BY section IS NOT NULL, ordre, libelle`)
      .all(section));
  } catch { res.json([]); }
});

export default r;
