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
    dbx.exec(`
      -- L'unité dans l'année : quand elle tombe, et sur quelle intensité.
      CREATE TABLE IF NOT EXISTS grille_ue (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        annee_scolaire TEXT NOT NULL,
        section        TEXT NOT NULL,
        ue_num         INTEGER NOT NULL,
        quadri         TEXT,            -- Q1 / Q2 / Q1Q2 — vide = celui du DP
        sem_debut      INTEGER,         -- rang de semaine dans l'année scolaire
        sem_fin        INTEGER,
        maj_le         TEXT DEFAULT (datetime('now')),
        UNIQUE(annee_scolaire, section, ue_num)
      );

      -- Le cours dans l'unité, et la part d'autonomie qu'on lui a posée.
      CREATE TABLE IF NOT EXISTS grille_cours (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        grille_ue_id   INTEGER NOT NULL REFERENCES grille_ue(id) ON DELETE CASCADE,
        cours_code     TEXT NOT NULL,
        sem_debut      INTEGER,
        sem_fin        INTEGER,
        autonomie_placee REAL NOT NULL DEFAULT 0,
        UNIQUE(grille_ue_id, cours_code)
      );

      /* L'ACTIVITÉ EST UN SOUS-COURS, ET ELLE NE PARAÎT SUR AUCUNE PIÈCE
         OFFICIELLE. Leur somme retombe sur les périodes du cours, et c'est le
         COURS qui figure au contrat de travail, sur l'attestation et sur le
         procès-verbal. La colonne vu_etudiant porte la SECONDE LECTURE : ce qui est
         confié au professeur et ce que vit l'étudiant coïncident presque
         toujours — presque : sur un stage, les heures d'encadrement du
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

      CREATE INDEX IF NOT EXISTS idx_grille_ue_sec
        ON grille_ue(annee_scolaire, section);
      CREATE INDEX IF NOT EXISTS idx_grille_cours_ue ON grille_cours(grille_ue_id);
      CREATE INDEX IF NOT EXISTS idx_grille_act_cours ON grille_activite(grille_cours_id);
    `);
  } catch (e) { console.error('[migration] grille :', e.message); }
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

  const g = db.prepare(`SELECT id FROM grille_ue
    WHERE annee_scolaire = ? AND section = ? AND ue_num = ?`).get(annee, section, ueNum);

  const parCours = new Map();
  let autonomiePlacee = 0;
  if (g) {
    for (const gc of db.prepare('SELECT * FROM grille_cours WHERE grille_ue_id = ?').all(g.id)) {
      const somme = db.prepare(`SELECT COALESCE(SUM(periodes),0) AS s
        FROM grille_activite WHERE grille_cours_id = ?`).get(gc.id).s;
      parCours.set(gc.cours_code, { somme, autonomie: Number(gc.autonomie_placee) || 0 });
      autonomiePlacee += Number(gc.autonomie_placee) || 0;
    }
  }

  // L'autonomie de l'unité vient du dossier ; son intervalle aussi.
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
    // Le multiple : le dossier fixe une unité de découpe, le total doit tomber
    // dessus. On dit de COMBIEN on s'écarte, pas seulement que c'est faux.
    const reste = Math.round((total % dp) * 100) / 100;
    if (reste === 0) continue;
    const manque = Math.round((dp - reste) * 100) / 100;
    anomalies.push({
      cours_code: c.cours_code, cours_nom: c.cours_nom,
      total, multiple: dp, manque,
      // « L'autonomie suffit-elle à combler ? » est la seule question utile
      // au moment où l'on regarde : sans elle, on va la chercher ailleurs.
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

/** La grille d'une section : les unités, leurs cours, leurs activités. */
r.get('/', authRequired, (req, res) => {
  const annee = req.query.annee || anneeDeTravail(req);
  const section = String(req.query.section || '').trim();
  if (!section) return res.status(400).json({ error: 'section requise' });

  const ues = db.prepare(`
    SELECT DISTINCT u.ue_num, u.ue_nom, u.ue_niv, u.ue_quad, u.ue_per_etudiants
    FROM ue u WHERE u.section = ? AND u.annee_scolaire = ?
    ORDER BY u.ue_num`).all(section, annee);

  const sortie = ues.map(u => {
    const g = db.prepare(`SELECT * FROM grille_ue
      WHERE annee_scolaire = ? AND section = ? AND ue_num = ?`).get(annee, section, u.ue_num);

    const cours = db.prepare(`
      SELECT cours_code, cours_nom, cours_per, ue_autonomie
      FROM cours WHERE ue_num = ? AND annee_scolaire = ? AND cours_code IS NOT NULL
      ORDER BY cours_code`).all(u.ue_num, annee).map(c => {
      const gc = g ? db.prepare(`SELECT * FROM grille_cours
        WHERE grille_ue_id = ? AND cours_code = ?`).get(g.id, c.cours_code) : null;
      const activites = gc ? db.prepare(`
        SELECT ga.*, at.libelle AS activite_nom, at.section AS activite_section
        FROM grille_activite ga LEFT JOIN activite_type at ON at.id = ga.activite_id
        WHERE ga.grille_cours_id = ? ORDER BY ga.ordre, ga.id`).all(gc.id) : [];
      return {
        ...c,
        sem_debut: gc?.sem_debut ?? null, sem_fin: gc?.sem_fin ?? null,
        autonomie_placee: gc ? Number(gc.autonomie_placee) || 0 : 0,
        activites,
      };
    });

    return {
      ...u,
      // Le quadrimestre de la grille l'emporte s'il existe ; à défaut, celui du
      // dossier. On ne recopie PAS le dossier dans la grille : une valeur
      // recopiée cesse de suivre sa source le jour où celle-ci change.
      quadri: g?.quadri || u.ue_quad || null,
      sem_debut: g?.sem_debut ?? null, sem_fin: g?.sem_fin ?? null,
      planifiee: !!g,
      cours,
      controle: controlerUE(annee, section, u.ue_num),
    };
  });

  res.json({ annee, section, ues: sortie });
});

/** Poser une unité dans l'année. */
r.put('/ue', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { annee_scolaire, section, ue_num, quadri, sem_debut, sem_fin } = req.body || {};
  if (!section || ue_num == null) return res.status(400).json({ error: 'section et ue_num requis' });
  const annee = annee_scolaire || anneeDeTravail(req);
  db.prepare(`
    INSERT INTO grille_ue (annee_scolaire, section, ue_num, quadri, sem_debut, sem_fin)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(annee_scolaire, section, ue_num) DO UPDATE SET
      quadri = excluded.quadri, sem_debut = excluded.sem_debut,
      sem_fin = excluded.sem_fin, maj_le = datetime('now')
  `).run(annee, section, Number(ue_num), quadri || null,
         sem_debut ?? null, sem_fin ?? null);
  res.json({ ok: true, controle: controlerUE(annee, section, Number(ue_num)) });
});

/**
 * La découpe d'un cours : ses activités et sa part d'autonomie.
 * On remplace le lot — une découpe est un tout, la corriger ligne à ligne
 * laisserait des activités orphelines d'un état antérieur.
 */
r.put('/cours', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const b = req.body || {};
  const annee = b.annee_scolaire || anneeDeTravail(req);
  const section = String(b.section || '').trim();
  const ueNum = Number(b.ue_num);
  const code = String(b.cours_code || '').trim();
  if (!section || !ueNum || !code) {
    return res.status(400).json({ error: 'section, ue_num et cours_code requis' });
  }

  db.transaction(() => {
    db.prepare(`INSERT INTO grille_ue (annee_scolaire, section, ue_num)
      VALUES (?,?,?) ON CONFLICT(annee_scolaire, section, ue_num) DO NOTHING`)
      .run(annee, section, ueNum);
    const g = db.prepare(`SELECT id FROM grille_ue
      WHERE annee_scolaire = ? AND section = ? AND ue_num = ?`).get(annee, section, ueNum);

    db.prepare(`INSERT INTO grille_cours (grille_ue_id, cours_code, sem_debut, sem_fin, autonomie_placee)
      VALUES (?,?,?,?,?)
      ON CONFLICT(grille_ue_id, cours_code) DO UPDATE SET
        sem_debut = excluded.sem_debut, sem_fin = excluded.sem_fin,
        autonomie_placee = excluded.autonomie_placee`)
      .run(g.id, code, b.sem_debut ?? null, b.sem_fin ?? null,
           Number(b.autonomie_placee) || 0);

    const gc = db.prepare(`SELECT id FROM grille_cours
      WHERE grille_ue_id = ? AND cours_code = ?`).get(g.id, code);

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

/** Le contrôle seul — pour rafraîchir le bandeau sans tout recharger. */
r.get('/controle', authRequired, (req, res) => {
  const annee = req.query.annee || anneeDeTravail(req);
  const section = String(req.query.section || '').trim();
  const ueNum = Number(req.query.ue_num);
  if (!section || !ueNum) return res.status(400).json({ error: 'section et ue_num requis' });
  res.json(controlerUE(annee, section, ueNum));
});

/**
 * REPRENDRE LA GRILLE DE L'AN DERNIER.
 * Comme le reste dans Lucie : on ne repart pas d'une page blanche chaque année.
 * ADDITIF — on ne touche pas aux unités déjà planifiées cette année, sinon une
 * reprise lancée deux fois effacerait le travail fait entre les deux.
 */
r.post('/reprendre', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const vers = req.body?.annee || anneeDeTravail(req);
  const depuis = String(req.body?.depuis || '').trim();
  const section = String(req.body?.section || '').trim();
  if (!depuis || !section) return res.status(400).json({ error: 'depuis et section requis' });
  if (depuis === vers) return res.status(400).json({ error: 'Même année : rien à reprendre.' });

  let reprises = 0, ignorees = 0;
  db.transaction(() => {
    const src = db.prepare(`SELECT * FROM grille_ue
      WHERE annee_scolaire = ? AND section = ?`).all(depuis, section);
    for (const s of src) {
      const existe = db.prepare(`SELECT id FROM grille_ue
        WHERE annee_scolaire = ? AND section = ? AND ue_num = ?`).get(vers, section, s.ue_num);
      if (existe) { ignorees++; continue; }
      const info = db.prepare(`INSERT INTO grille_ue
        (annee_scolaire, section, ue_num, quadri, sem_debut, sem_fin)
        VALUES (?,?,?,?,?,?)`)
        .run(vers, section, s.ue_num, s.quadri, s.sem_debut, s.sem_fin);
      const nid = info.lastInsertRowid;
      for (const c of db.prepare('SELECT * FROM grille_cours WHERE grille_ue_id = ?').all(s.id)) {
        const ci = db.prepare(`INSERT INTO grille_cours
          (grille_ue_id, cours_code, sem_debut, sem_fin, autonomie_placee) VALUES (?,?,?,?,?)`)
          .run(nid, c.cours_code, c.sem_debut, c.sem_fin, c.autonomie_placee);
        for (const a of db.prepare('SELECT * FROM grille_activite WHERE grille_cours_id = ?').all(c.id)) {
          db.prepare(`INSERT INTO grille_activite
            (grille_cours_id, activite_id, periodes, vu_etudiant, ordre) VALUES (?,?,?,?,?)`)
            .run(ci.lastInsertRowid, a.activite_id, a.periodes, a.vu_etudiant, a.ordre);
        }
      }
      reprises++;
    }
  })();

  res.json({ ok: true, reprises, ignorees });
});

export default r;
