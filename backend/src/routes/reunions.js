// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Réunions d'équipe et tâches de suivi
//
// CE QUI SE DÉCIDE EN RÉUNION DOIT SURVIVRE À LA RÉUNION. Un ordre du jour se
// prépare dans un traitement de texte, les décisions se notent sur un carnet,
// et quinze jours plus tard on rouvre la séance en demandant « où en
// est-on ? » — à quoi personne ne peut répondre, parce que rien ne relie ce
// qui a été dit à ce qui a été fait.
//
// Une réunion porte donc ses points, ses présents et ses tâches ; une tâche
// porte son responsable, son échéance et son statut, et sait de quelle séance
// elle vient. Rouvrir une réunion, c'est retrouver ce qui reste ouvert.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';
import { envelopperDocument } from '../lib/document.js';

const r = Router();

/** L'année de travail, celle des écrans, sans la redemander à chaque appel. */
function anneeDeTravail(req) {
  if (req.query?.annee) return req.query.annee;
  if (req.body?.annee) return req.body.annee;
  const l = db.prepare(
    "SELECT valeur FROM lucie_config WHERE cle = 'annee_active'").get();
  return l?.valeur
    || db.prepare('SELECT MAX(annee_scolaire) AS a FROM attribution').get()?.a
    || '';
}

const qui = req => req.user?.nom_complet || req.user?.email || 'inconnu';

/**
 * À QUI PEUT-ON CONFIER UNE TÂCHE.
 *
 * La liste des utilisateurs est réservée à l'administrateur — c'est juste, elle
 * porte les courriels, les droits et les dates de connexion. Mais pour confier
 * une tâche il ne faut qu'un nom et un rôle : cette porte-là ne donne que cela,
 * et seulement des comptes actifs.
 */
r.get('/personnes', authRequired, (req, res) => {
  // LE PERSONNEL D'ABORD, LES COMPTES ENSUITE. On convoque et l'on charge des
  // PERSONNES ; le compte Lucie ne dit que si elles peuvent se connecter. Ne
  // proposer que les comptes rendait la moitié de l'équipe inassignable — et
  // les enseignants, qui n'en ont pas, invisibles.
  const personnel = db.prepare(`
    SELECT p.id, p.nom, p.prenom, p.statut,
           (SELECT u.id FROM utilisateur u WHERE u.professeur_id = p.id AND u.actif = 1)
             AS user_id
      FROM professeur p ORDER BY p.nom, p.prenom
  `).all().map(p => ({
    cle: p.user_id ? `u:${p.user_id}` : `p:${p.id}`,
    professeur_id: p.id, user_id: p.user_id || null,
    nom: `${p.prenom} ${p.nom}`, statut: p.statut || null, source: 'personnel',
  }));

  /**
   * LA SECTION D'UN ENSEIGNANT NE S'ÉCRIT NULLE PART — elle se déduit de ce
   * qu'il enseigne. Un professeur peut porter des heures dans deux sections :
   * on rend donc une LISTE, jamais une valeur unique.
   *
   * Les unités HORS CURSUS sont écartées : elles s'ajoutent au programme
   * d'étudiants de plusieurs sections, et rattacher quelqu'un à la section
   * d'import de l'UE 95 fausserait le filtre comme elle a faussé les
   * statistiques.
   */
  const annee = req.query.annee || anneeDeTravail(req);
  const parProf = new Map();
  try {
    // La colonne « hors cursus » date de 2.11.1 : une base plus ancienne ne la
    // porte pas. On regarde plutôt que de supposer — une requête qui échoue
    // dans un try muet aurait vidé le filtre sans que personne ne sache
    // pourquoi.
    const aHorsCursus = db.prepare('PRAGMA table_info(ue)').all()
      .some(c => c.name === 'hors_cursus');
    for (const l of db.prepare(`
      SELECT DISTINCT a.professeur_id AS pid, u.section
        FROM attribution a
        JOIN ue u ON u.ue_num = a.ue_num AND u.annee_scolaire = a.annee_scolaire
       WHERE a.annee_scolaire = ? AND a.professeur_id IS NOT NULL
         AND u.section IS NOT NULL
         ${aHorsCursus ? 'AND COALESCE(u.hors_cursus, 0) = 0' : ''}
    `).all(annee)) {
      if (!parProf.has(l.pid)) parProf.set(l.pid, []);
      parProf.get(l.pid).push(l.section);
    }
  } catch (e) {
    console.error('[reunions/personnes] sections :', e.message);
  }
  for (const p of personnel) p.sections = parProf.get(p.professeur_id) || [];

  // Les comptes sans fiche — l'administrateur technique, par exemple — restent
  // joignables : ils tiennent des tâches, eux aussi.
  const sansFiche = db.prepare(`
    SELECT id, nom_complet AS nom, role FROM utilisateur
     WHERE actif = 1 AND (professeur_id IS NULL
        OR professeur_id NOT IN (SELECT id FROM professeur))
     ORDER BY nom_complet
  `).all().map(u => ({
    cle: `u:${u.id}`, user_id: u.id, professeur_id: null,
    nom: u.nom, role: u.role, source: 'compte', sections: [],
  }));

  res.json([...personnel, ...sansFiche]);
});

/**
 * LES OBLIGATIONS DE L'ANNÉE, pour y raccrocher une action.
 *
 * L'échéancier porte ce que la circulaire et le décret imposent : une date, un
 * libellé, une base légale. Une réunion de service, elle, décide du TRAVAIL qui
 * permettra de les tenir. Tant que les deux restaient étrangers, on avait d'un
 * côté un registre d'obligations que personne ne rattachait à une action, et de
 * l'autre des actions dont plus personne ne savait pourquoi on les faisait.
 */
r.get('/obligations', authRequired, (req, res) => {
  const annee = anneeDeTravail(req);
  res.json(db.prepare(`
    SELECT e.id, e.date_due, e.statut,
           COALESCE(e.libelle_override, t.libelle) AS libelle,
           t.base_legale, t.categorie, t.zone
      FROM echeance e JOIN echeance_type t ON t.id = e.type_id
     WHERE e.annee_scolaire = ? AND e.statut NOT IN ('annule','sans_objet')
       -- DES THÉMATIQUES GLOBALES, PAS DES UNITÉS. L'échéancier contient aussi
       -- les dates propres à chaque UE — épreuves, remises, visites des copies :
       -- elles se posent au calendrier des sessions, unité par unité, et elles
       -- noyaient ici les obligations de l'établissement sous trois cents
       -- lignes. Une action de réunion sert une obligation GÉNÉRALE ; ce qui
       -- tient à une unité se dit par la portée de la séance.
       AND COALESCE(t.zone, '') <> 'ue'
       AND COALESCE(e.source_type, '') <> 'organisation_ue'
     ORDER BY t.categorie, e.date_due
  `).all(annee));
});

/**
 * LES RÉUNIONS DE LA MAISON ONT DES NOMS, ET ILS SE RÉPÈTENT.
 *
 * Écrire l'intitulé à la main produit « Réunion secrétariat », « réu secrét. »
 * et « Secrétariat 15/09 » pour la même chose : trois libellés, aucun
 * regroupement possible, et l'historique d'un type de réunion introuvable. La
 * liste est courte et connue — autant la donner.
 */
export const TYPES_REUNION = [
  { cle: 'secretariat',      libelle: 'Secrétariat' },
  { cle: 'coord_section',    libelle: 'Coordination de section',  portee: 'section' },
  { cle: 'coord_stage',      libelle: 'Coordination de stage',    portee: 'section' },
  { cle: 'copil',            libelle: 'COPIL' },
  { cle: 'bilat_coord',      libelle: 'Bilatérale direction — coordination', portee: 'section' },
  { cle: 'bilat_direction',  libelle: 'Bilatérale de direction' },
  { cle: 'conseil_etudes',   libelle: "Conseil des études (hors délibération)", portee: 'ue' },
  { cle: 'equipe_ue',        libelle: "Équipe d'unité",           portee: 'ue' },
  { cle: 'qualite',          libelle: 'Démarche qualité (AEQES)' },
  { cle: 'autre',            libelle: 'Autre réunion' },
];

r.get('/types', authRequired, (req, res) => res.json(TYPES_REUNION));

/** Les sections et leurs unités — de quoi poser la portée d'une séance. */
r.get('/perimetre', authRequired, (req, res) => {
  const annee = anneeDeTravail(req);
  const ues = db.prepare(`
    -- La marque de tronc commun voyage avec l'unité : le centre d'impression
    -- filtre dessus, et sans cette colonne il devrait la redemander au serveur
    -- à chaque frappe.
    SELECT ue_num, ue_nom, section, ue_tc FROM ue
     WHERE annee_scolaire = ? ORDER BY section, ue_num
  `).all(annee);
  const sections = [...new Set(ues.map(u => u.section).filter(Boolean))].sort();
  res.json({ annee, sections, ues });
});

// ─── LES TÂCHES ─────────────────────────────────────────────────────────────

/**
 * UNE CLÉ DE CHOIX → LES TROIS COLONNES QUI LA PORTENT.
 *
 * L'écran manipule « u:3 », « p:12 », « r:secretariat » — un seul jeton par
 * personne, qu'elle ait un compte, une fiche, ou qu'il s'agisse d'un service.
 * La base, elle, a trois colonnes. La traduction se fait ici, une fois.
 */
function depuisCle(cle) {
  const [genre, valeur] = String(cle || '').split(':');
  return {
    user_id:       genre === 'u' ? Number(valeur) : null,
    professeur_id: genre === 'p' ? Number(valeur) : null,
    role:          genre === 'r' ? valeur : null,
  };
}

/**
 * L'ÉQUIPAGE D'UNE TÂCHE.
 *
 * Le premier nommé est celui qui répond de l'action : c'est lui qu'on écrit
 * dans les colonnes `responsable_*`, pour que l'échéancier, les tableaux de
 * bord et le procès-verbal — qui ne connaissent qu'une colonne — continuent de
 * dire quelque chose de juste. Les autres vivent dans `tache_personne`, et
 * voient la tâche sur leur propre tableau de bord.
 */
function ecrireResponsables(tacheId, cles) {
  db.prepare('DELETE FROM tache_personne WHERE tache_id = ?').run(tacheId);
  const poser = db.prepare(`INSERT INTO tache_personne
    (tache_id, user_id, professeur_id, role, rang) VALUES (?,?,?,?,?)`);
  (cles || []).filter(Boolean).forEach((cle, i) => {
    const c = depuisCle(cle);
    poser.run(tacheId, c.user_id, c.professeur_id, c.role, i);
  });
  const premier = depuisCle((cles || []).filter(Boolean)[0]);
  db.prepare(`UPDATE tache SET responsable_user_id=?, responsable_professeur_id=?,
              responsable_role=? WHERE id=?`)
    .run(premier.user_id, premier.professeur_id, premier.role, tacheId);
}

/** Les équipages des tâches rendues, en une seule requête plutôt qu'une par ligne. */
function attacherResponsables(lignes) {
  if (!lignes.length) return lignes;
  const ids = lignes.map(l => l.id);
  const rangs = db.prepare(`
    SELECT tp.tache_id, tp.user_id, tp.professeur_id, tp.role, tp.rang,
           COALESCE(u.nom_complet, pr.prenom || ' ' || pr.nom) AS nom
      FROM tache_personne tp
      LEFT JOIN utilisateur u  ON u.id  = tp.user_id
      LEFT JOIN professeur  pr ON pr.id = tp.professeur_id
     WHERE tp.tache_id IN (${ids.map(() => '?').join(',')})
     ORDER BY tp.rang
  `).all(...ids);
  const par = new Map();
  for (const x of rangs) {
    if (!par.has(x.tache_id)) par.set(x.tache_id, []);
    par.get(x.tache_id).push({
      cle: x.user_id ? `u:${x.user_id}` : x.professeur_id ? `p:${x.professeur_id}`
        : x.role ? `r:${x.role}` : '',
      nom: x.nom || null, role: x.role || null,
    });
  }
  for (const l of lignes) l.responsables = par.get(l.id) || [];
  return lignes;
}

const SELECT_TACHE = `
  SELECT t.*,
         COALESCE(u.nom_complet, pr.prenom || ' ' || pr.nom) AS responsable_nom,
         pt.intitule AS point_intitule,
         r.titre AS reunion_titre, r.date_seance AS reunion_date,
         COALESCE(e.libelle_override, et.libelle) AS obligation_libelle,
         et.base_legale AS obligation_base, e.date_due AS obligation_date
    FROM tache t
    LEFT JOIN utilisateur u  ON u.id  = t.responsable_user_id
    LEFT JOIN professeur  pr ON pr.id = t.responsable_professeur_id
    LEFT JOIN reunion r      ON r.id  = t.reunion_id
    LEFT JOIN echeance e     ON e.id  = t.echeance_id
    LEFT JOIN echeance_type et ON et.id = e.type_id
    LEFT JOIN reunion_point pt ON pt.id = t.point_id
`;

/**
 * GET /taches — filtres : annee, statut, responsable_user_id, mien, reunion_id,
 * ouvertes=1 (tout ce qui n'est ni fait ni abandonné).
 */
r.get('/taches', authRequired, (req, res) => {
  const annee = anneeDeTravail(req);
  let sql = SELECT_TACHE + ' WHERE t.annee_scolaire = ?';
  const p = [annee];
  if (req.query.statut) { sql += ' AND t.statut = ?'; p.push(req.query.statut); }
  if (req.query.ouvertes === '1') sql += " AND t.statut IN ('a_faire','en_cours')";
  if (req.query.reunion_id) { sql += ' AND t.reunion_id = ?'; p.push(Number(req.query.reunion_id)); }
  if (req.query.responsable_user_id) {
    sql += ' AND t.responsable_user_id = ?'; p.push(Number(req.query.responsable_user_id));
  }
  // « Les miennes » : ce qui m'est confié nommément ET ce qui l'est à mon rôle.
  // Ne retenir que le nom laisserait de côté « le secrétariat fait X », qui est
  // pourtant ma tâche si je suis au secrétariat.
  // Et ce qui m'est confié AVEC QUELQU'UN D'AUTRE : une action portée à deux
  // n'est pas à moitié la mienne.
  if (req.query.mien === '1') {
    sql += ` AND (t.responsable_user_id = ? OR t.responsable_role = ?
                  OR (t.responsable_professeur_id IS NOT NULL
                      AND t.responsable_professeur_id = (
                        SELECT professeur_id FROM utilisateur WHERE id = ?))
                  OR EXISTS (SELECT 1 FROM tache_personne tp
                              WHERE tp.tache_id = t.id
                                AND (tp.user_id = ? OR tp.role = ?
                                     OR (tp.professeur_id IS NOT NULL
                                         AND tp.professeur_id = (
                                           SELECT professeur_id FROM utilisateur WHERE id = ?)))))`;
    p.push(req.user.id, req.user.role, req.user.id,
      req.user.id, req.user.role, req.user.id);
  }

  // CE QUE J'AI CONFIÉ ME REGARDE AUSSI.
  //
  // Une action décidée en séance concerne trois personnes : celle qui la fait,
  // CELUI QUI A CONVOQUÉ — c'est lui qui rouvrira le point la fois suivante —
  // et la direction, qui répond de l'ensemble. Tant que la tâche n'apparaissait
  // que chez son responsable, le suivi reposait sur la mémoire de celui qui
  // présidait : au point suivant, on redemandait « où en est-on ? ».
  if (req.query.confie === '1') {
    const direction = ['admin', 'directeur', 'directeur_adjoint'].includes(req.user.role);
    if (direction) {
      // La direction voit tout ce qui est confié à quelqu'un d'autre qu'elle.
      sql += ` AND (t.responsable_user_id IS NOT ? OR t.responsable_user_id IS NULL)`;
      p.push(req.user.id);
    } else {
      sql += ` AND r.organisateur_user_id = ?`;
      p.push(req.user.id);
    }
  }
  // L'ordre d'une liste de tâches n'est pas l'ordre de création : ce qui est en
  // retard d'abord, puis ce qui vient, puis ce qui n'a pas de date.
  sql += ` ORDER BY CASE WHEN t.statut IN ('fait','abandonnee') THEN 1 ELSE 0 END,
                    CASE WHEN t.echeance IS NULL THEN 1 ELSE 0 END,
                    t.echeance, t.priorite DESC, t.id`;
  res.json(attacherResponsables(db.prepare(sql).all(...p)));
});

r.post('/taches', authRequired, (req, res) => {
  const b = req.body || {};
  if (!b.titre || !String(b.titre).trim()) {
    return res.status(400).json({ error: 'Une tâche sans intitulé ne se suit pas.' });
  }
  const info = db.prepare(`
    INSERT INTO tache (annee_scolaire, titre, detail, responsable_user_id,
                       responsable_professeur_id,
                       responsable_role, echeance, statut, priorite, reunion_id,
                       echeance_id, point_id, cree_par, maj_le)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now'))
  `).run(anneeDeTravail(req), String(b.titre).trim(), b.detail || null,
    b.responsable_user_id || null, b.responsable_professeur_id || null,
    b.responsable_role || null,
    b.echeance || null, b.statut || 'a_faire',
    Number.isInteger(b.priorite) ? b.priorite : 1,
    b.reunion_id || null, b.echeance_id || null, b.point_id || null, qui(req));
  if (Array.isArray(b.responsables)) {
    ecrireResponsables(info.lastInsertRowid, b.responsables);
  } else if (b.responsable_user_id || b.responsable_professeur_id || b.responsable_role) {
    // Une tâche créée à l'ancienne — un seul responsable — rejoint quand même
    // la table d'équipage : sinon elle n'y serait jamais.
    ecrireResponsables(info.lastInsertRowid, [
      b.responsable_user_id ? `u:${b.responsable_user_id}`
        : b.responsable_professeur_id ? `p:${b.responsable_professeur_id}`
        : `r:${b.responsable_role}`]);
  }
  res.json(attacherResponsables(
    [db.prepare(SELECT_TACHE + ' WHERE t.id = ?').get(info.lastInsertRowid)])[0]);
});

r.put('/taches/:id', authRequired, (req, res) => {
  const t = db.prepare('SELECT * FROM tache WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'tâche inconnue' });
  const b = req.body || {};
  const v = (k, d) => (b[k] === undefined ? d : b[k]);

  // FAIT SE DATE, ET SE SIGNE. Une tâche cochée sans trace ne vaut pas mieux
  // qu'une tâche effacée : au point suivant, on ne sait plus qui l'a close.
  const devientFaite = b.statut === 'fait' && t.statut !== 'fait';
  const redevientOuverte = b.statut && b.statut !== 'fait' && t.statut === 'fait';

  db.prepare(`
    UPDATE tache SET titre=?, detail=?, responsable_user_id=?,
      responsable_professeur_id=?, responsable_role=?,
      echeance=?, statut=?, priorite=?, commentaire=?, reunion_id=?,
      revue_reunion_id=?, echeance_id=?, point_id=?,
      fait_le=?, fait_par=?, maj_le=datetime('now')
    WHERE id=?
  `).run(
    v('titre', t.titre), v('detail', t.detail),
    v('responsable_user_id', t.responsable_user_id),
    v('responsable_professeur_id', t.responsable_professeur_id),
    v('responsable_role', t.responsable_role),
    v('echeance', t.echeance), v('statut', t.statut),
    v('priorite', t.priorite), v('commentaire', t.commentaire),
    v('reunion_id', t.reunion_id), v('revue_reunion_id', t.revue_reunion_id),
    v('echeance_id', t.echeance_id), v('point_id', t.point_id),
    devientFaite ? new Date().toISOString().slice(0, 10)
      : redevientOuverte ? null : t.fait_le,
    devientFaite ? qui(req) : redevientOuverte ? null : t.fait_par,
    req.params.id);

  // L'ÉQUIPAGE NE SE MODIFIE QUE SI ON LE DIT. Cocher « fait » envoie un seul
  // champ : réécrire les responsables à cette occasion les effacerait.
  if (Array.isArray(b.responsables)) ecrireResponsables(Number(req.params.id), b.responsables);

  res.json(attacherResponsables(
    [db.prepare(SELECT_TACHE + ' WHERE t.id = ?').get(req.params.id)])[0]);
});

// Supprimer une tâche reste possible — une tâche créée par erreur n'a pas à
// polluer le suivi —, mais c'est réservé à la direction : ailleurs, on
// l'abandonne, ce qui laisse une trace.
r.delete('/taches/:id', authRequired,
  roleRequired('admin', 'directeur', 'directeur_adjoint'), (req, res) => {
    db.prepare('DELETE FROM tache WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

// ─── LES RÉUNIONS ───────────────────────────────────────────────────────────

r.get('/', authRequired, (req, res) => {
  const annee = anneeDeTravail(req);
  const lignes = db.prepare(`
    SELECT r.*,
      COALESCE(u.nom_complet, pr.prenom || ' ' || pr.nom) AS organisateur_nom,
      (SELECT GROUP_CONCAT(ue_num, ', ') FROM reunion_ue x WHERE x.reunion_id = r.id)
        AS ues_libelle,
      (SELECT COUNT(*) FROM tache t WHERE t.reunion_id = r.id) AS nb_taches,
      (SELECT COUNT(*) FROM tache t WHERE t.reunion_id = r.id
         AND t.statut IN ('a_faire','en_cours')) AS nb_ouvertes
    FROM reunion r
    LEFT JOIN utilisateur u  ON u.id  = r.organisateur_user_id
    LEFT JOIN professeur  pr ON pr.id = r.organisateur_professeur_id
    WHERE r.annee_scolaire = ?
    ORDER BY r.date_seance DESC, r.id DESC
  `).all(annee);
  res.json(lignes);
});

// UNE ROUTE NOMMÉE PASSE AVANT UNE ROUTE À PARAMÈTRE : posée après
// « /:id », « /prochaine » serait lue comme une réunion d'identifiant
// « prochaine » — et répondrait 404 sans que rien ne le dise.
/**
 * LE PROCHAIN RENDEZ-VOUS DE CHACUN.
 *
 * Il se fixe à la fin d'une séance, quand tout le monde est là — puis il se
 * perd, parce qu'il vit dans le procès-verbal que personne ne rouvre. Il
 * s'affiche donc sur le tableau de bord de ceux qui y sont attendus : les
 * participants de la séance où il a été fixé, et l'organisateur.
 */
r.get('/prochaine', authRequired, (req, res) => {
  const annee = anneeDeTravail(req);
  const jour = new Date().toISOString().slice(0, 10);
  const ligne = db.prepare(`
    SELECT r.id, r.titre, r.genre, r.section,
           r.prochaine_date, r.prochaine_heure, r.prochain_lieu, r.prochaine_qui,
           COALESCE(u.nom_complet, pr.prenom || ' ' || pr.nom) AS organisateur_nom
      FROM reunion r
      LEFT JOIN utilisateur u  ON u.id  = r.organisateur_user_id
      LEFT JOIN professeur  pr ON pr.id = r.organisateur_professeur_id
     WHERE r.annee_scolaire = ? AND r.prochaine_date IS NOT NULL
       AND r.prochaine_date >= ?
       AND (r.organisateur_user_id = ?
            OR EXISTS (SELECT 1 FROM reunion_participant x
                        WHERE x.reunion_id = r.id
                          AND (x.user_id = ?
                               OR (x.professeur_id IS NOT NULL
                                   AND x.professeur_id = (SELECT professeur_id
                                       FROM utilisateur WHERE id = ?)))))
     ORDER BY r.prochaine_date, r.prochaine_heure LIMIT 1
  `).get(annee, jour, req.user.id, req.user.id, req.user.id);
  res.json(ligne || null);
});

r.get('/:id', authRequired, (req, res) => {
  const reunion = db.prepare(`
    SELECT r.*, COALESCE(u.nom_complet, pr.prenom || ' ' || pr.nom) AS organisateur_nom
      FROM reunion r
      LEFT JOIN utilisateur u  ON u.id  = r.organisateur_user_id
      LEFT JOIN professeur  pr ON pr.id = r.organisateur_professeur_id
     WHERE r.id = ?`).get(req.params.id);
  if (!reunion) return res.status(404).json({ error: 'réunion inconnue' });
  reunion.ues = db.prepare(
    'SELECT ue_num FROM reunion_ue WHERE reunion_id = ? ORDER BY ue_num')
    .all(reunion.id).map(x => x.ue_num);
  const participants = db.prepare(
    'SELECT * FROM reunion_participant WHERE reunion_id = ? ORDER BY nom').all(reunion.id);
  reunion.points = db.prepare(
    'SELECT * FROM reunion_point WHERE reunion_id = ? ORDER BY ordre, id').all(reunion.id);
  const taches = attacherResponsables(
    db.prepare(SELECT_TACHE + ' WHERE t.reunion_id = ? ORDER BY t.id').all(reunion.id));
  // CE QUI RESTE OUVERT DES SÉANCES PRÉCÉDENTES, c'est le premier point de
  // toute réunion de suivi — et c'est justement ce qu'on oublie de préparer.
  const reste = db.prepare(SELECT_TACHE + `
    WHERE t.annee_scolaire = ? AND t.statut IN ('a_faire','en_cours')
      AND (t.reunion_id IS NULL OR t.reunion_id <> ?)
    ORDER BY CASE WHEN t.echeance IS NULL THEN 1 ELSE 0 END, t.echeance, t.id
  `).all(reunion.annee_scolaire, reunion.id);
  attacherResponsables(reste);
  res.json({ ...reunion, participants, taches, reste });
});

r.post('/', authRequired, (req, res) => {
  const b = req.body || {};
  const info = db.prepare(`
    INSERT INTO reunion (annee_scolaire, titre, genre, date_seance, heure_seance,
                         lieu, ordre_du_jour, notes, statut,
                         organisateur_user_id, organisateur_professeur_id, section,
                         prochaine_date, prochaine_heure, prochain_lieu, prochaine_qui,
                         cree_par)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(anneeDeTravail(req), (b.titre || 'Réunion').trim(),
    b.genre || 'secretariat',
    b.date_seance || new Date().toISOString().slice(0, 10),
    b.heure_seance || null, b.lieu || null,
    b.ordre_du_jour || null, b.notes || null, b.statut || 'preparee',
    // À DÉFAUT, CELUI QUI CRÉE LA SÉANCE L'ORGANISE. C'est vrai neuf fois sur
    // dix, et cela évite une réunion sans personne pour en suivre les suites.
    b.organisateur_user_id ?? req.user.id, b.organisateur_professeur_id || null,
    b.section || null,
    b.prochaine_date || null, b.prochaine_heure || null,
    b.prochain_lieu || null, b.prochaine_qui || null, qui(req));

  for (const ue of (b.ues || [])) {
    db.prepare('INSERT OR IGNORE INTO reunion_ue (reunion_id, ue_num) VALUES (?,?)')
      .run(info.lastInsertRowid, Number(ue));
  }

  for (const p of (b.participants || [])) {
    db.prepare(`INSERT INTO reunion_participant
                (reunion_id, user_id, professeur_id, nom, present, excuse)
                VALUES (?,?,?,?,?,?)`)
      .run(info.lastInsertRowid, p.user_id || null, p.professeur_id || null,
        p.nom, p.present ? 1 : 0, p.excuse ? 1 : 0);
  }
  (b.points || []).forEach((pt, i) => {
    db.prepare('INSERT INTO reunion_point (reunion_id, ordre, intitule, notes) VALUES (?,?,?,?)')
      .run(info.lastInsertRowid, i, String(pt.intitule || '').trim(), pt.notes || null);
  });
  res.json({ id: info.lastInsertRowid });
});

r.put('/:id', authRequired, (req, res) => {
  const reunion = db.prepare('SELECT * FROM reunion WHERE id = ?').get(req.params.id);
  if (!reunion) return res.status(404).json({ error: 'réunion inconnue' });
  const b = req.body || {};
  const v = (k) => (b[k] === undefined ? reunion[k] : b[k]);
  db.prepare(`
    UPDATE reunion SET titre=?, genre=?, date_seance=?, heure_seance=?, lieu=?,
      ordre_du_jour=?, notes=?, statut=?,
      organisateur_user_id=?, organisateur_professeur_id=?, section=?,
      prochaine_date=?, prochaine_heure=?, prochain_lieu=?, prochaine_qui=?
    WHERE id=?
  `).run(v('titre'), v('genre'), v('date_seance'), v('heure_seance'), v('lieu'),
    v('ordre_du_jour'), v('notes'), v('statut'),
    v('organisateur_user_id'), v('organisateur_professeur_id'), v('section'),
    v('prochaine_date'), v('prochaine_heure'), v('prochain_lieu'), v('prochaine_qui'),
    req.params.id);

  if (Array.isArray(b.ues)) {
    db.prepare('DELETE FROM reunion_ue WHERE reunion_id = ?').run(req.params.id);
    for (const ue of b.ues) {
      db.prepare('INSERT OR IGNORE INTO reunion_ue (reunion_id, ue_num) VALUES (?,?)')
        .run(req.params.id, Number(ue));
    }
  }

  if (Array.isArray(b.participants)) {
    db.prepare('DELETE FROM reunion_participant WHERE reunion_id = ?').run(req.params.id);
    for (const p of b.participants) {
      db.prepare(`INSERT INTO reunion_participant
                  (reunion_id, user_id, professeur_id, nom, present, excuse)
                  VALUES (?,?,?,?,?,?)`)
        .run(req.params.id, p.user_id || null, p.professeur_id || null,
          p.nom, p.present ? 1 : 0, p.excuse ? 1 : 0);
    }
  }

  // LES POINTS SE MODIFIENT, ILS NE SE REFONT PAS.
  //
  // Vider la table pour la réécrire — ce qu'on fait pour les présents, qui ne
  // portent rien — détacherait les actions décidées sous chaque point : elles
  // pointeraient vers des identifiants disparus. Chaque point garde donc le
  // sien ; seuls ceux que l'on retire s'en vont, et les actions qui en
  // dépendaient redeviennent simplement des actions de la séance.
  if (Array.isArray(b.points)) {
    const gardes = [];
    b.points.forEach((pt, i) => {
      const intitule = String(pt.intitule || '').trim();
      if (pt.id) {
        db.prepare('UPDATE reunion_point SET ordre=?, intitule=?, notes=? WHERE id=? AND reunion_id=?')
          .run(i, intitule, pt.notes || null, pt.id, req.params.id);
        gardes.push(pt.id);
      } else if (intitule || pt.notes) {
        const r2 = db.prepare(
          'INSERT INTO reunion_point (reunion_id, ordre, intitule, notes) VALUES (?,?,?,?)')
          .run(req.params.id, i, intitule, pt.notes || null);
        gardes.push(r2.lastInsertRowid);
      }
    });
    const partis = db.prepare(
      `SELECT id FROM reunion_point WHERE reunion_id = ?
        ${gardes.length ? `AND id NOT IN (${gardes.map(() => '?').join(',')})` : ''}`)
      .all(req.params.id, ...gardes).map(x => x.id);
    for (const id of partis) {
      db.prepare('UPDATE tache SET point_id = NULL WHERE point_id = ?').run(id);
      db.prepare('DELETE FROM reunion_point WHERE id = ?').run(id);
    }
  }
  res.json({ ok: true });
});

r.delete('/:id', authRequired,
  roleRequired('admin', 'directeur', 'directeur_adjoint'), (req, res) => {
    db.prepare('DELETE FROM reunion WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

// ─── LE PROCÈS-VERBAL ───────────────────────────────────────────────────────
//
// Une réunion qui ne produit pas de feuille ne se transmet pas : l'absent n'en
// saura rien, et personne ne pourra la relire. Le PV passe par l'enveloppe
// commune — A4, en-tête de l'établissement, pied numéroté.

r.post('/:id/document', authRequired, (req, res) => {
  const reunion = db.prepare('SELECT * FROM reunion WHERE id = ?').get(req.params.id);
  if (!reunion) return res.status(404).json({ error: 'réunion inconnue' });
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');

  const org = db.prepare(`
    SELECT COALESCE(u.nom_complet, pr.prenom || ' ' || pr.nom) AS nom
      FROM reunion r
      LEFT JOIN utilisateur u  ON u.id  = r.organisateur_user_id
      LEFT JOIN professeur  pr ON pr.id = r.organisateur_professeur_id
     WHERE r.id = ?`).get(reunion.id);
  reunion.organisateur_nom = org?.nom || null;
  const participants = db.prepare(
    'SELECT * FROM reunion_participant WHERE reunion_id = ? ORDER BY nom').all(reunion.id);
  const taches = attacherResponsables(
    db.prepare(SELECT_TACHE + ' WHERE t.reunion_id = ? ORDER BY t.id').all(reunion.id));

  const presents = participants.filter(p => p.present).map(p => esc(p.nom));
  const excuses = participants.filter(p => !p.present && p.excuse).map(p => esc(p.nom));
  const absents = participants.filter(p => !p.present && !p.excuse).map(p => esc(p.nom));

  const points = db.prepare(
    'SELECT * FROM reunion_point WHERE reunion_id = ? ORDER BY ordre, id').all(reunion.id);

  /** Tout l'équipage, pas seulement le premier nommé. */
  const quiFait = t => (t.responsables?.length
    ? t.responsables.map(x => x.nom || LIB_ROLE[x.role] || x.role).filter(Boolean).join(', ')
    : (t.responsable_nom || t.responsable_role)) || '—';

  const ligneTache = t => `<tr>
    <td>${esc(t.titre)}${t.detail ? `<br><span class="fin">${esc(t.detail)}</span>` : ''}</td>
    <td>${esc(quiFait(t))}${t.obligation_libelle
      ? `<br><span class="fin">pour : ${esc(t.obligation_libelle)}${
          t.obligation_base ? ` — ${esc(t.obligation_base)}` : ''}</span>` : ''}</td>
    <td>${fr(t.echeance)}</td>
    <td>${esc(LIB_STATUT[t.statut] || t.statut)}</td>
  </tr>`;

  const corps = `
    <h1>${esc(reunion.titre)}</h1>
    <p class="sous">${fr(reunion.date_seance)}${reunion.heure_seance
      ? ` à ${esc(reunion.heure_seance)}` : ''}${reunion.lieu ? ` · ${esc(reunion.lieu)}` : ''}</p>

    ${reunion.organisateur_nom ? `<p class="fin">Organisée par ${
      esc(reunion.organisateur_nom)}${reunion.section ? ` · ${esc(reunion.section)}` : ''}</p>` : ''}

    <h3>Présences</h3>
    <p>${presents.length ? `<b>Présents :</b> ${presents.join(', ')}` : 'Aucun présent noté.'}
      ${excuses.length ? `<br><b>Excusés :</b> ${excuses.join(', ')}` : ''}
      ${absents.length ? `<br><b>Absents :</b> ${absents.join(', ')}` : ''}</p>

    ${points.length ? `<h3>Ordre du jour</h3><ol>${
      points.map(p => `<li>${esc(p.intitule)}</li>`).join('')}</ol>` : ''}

    ${/* LE PROCÈS-VERBAL SUIT LA SÉANCE, POINT PAR POINT. Un pavé de notes
          suivi d'un tableau d'actions oblige le lecteur à refaire lui-même le
          rapprochement : sous chaque point, ce qui s'y est dit et ce qui en a
          été décidé. */
      points.map((p, i) => {
        const siennes = taches.filter(t => t.point_id === p.id);
        if (!p.notes && !siennes.length) return '';
        return `<h3>${i + 1}. ${esc(p.intitule) || 'Point sans intitulé'}</h3>
          ${String(p.notes || '').split('\n').filter(l => l.trim())
            .map(l => `<p>${esc(l)}</p>`).join('')}
          ${siennes.length ? `<table>
            <thead><tr><th>Décidé</th><th>Qui</th><th>Pour le</th><th>État</th></tr></thead>
            <tbody>${siennes.map(ligneTache).join('')}</tbody></table>` : ''}`;
      }).join('')}

    ${reunion.notes ? `<h3>Notes de séance</h3>${
      String(reunion.notes).split('\n').filter(l => l.trim())
        .map(l => `<p>${esc(l)}</p>`).join('')}` : ''}

    ${reunion.prochaine_date ? `<h3>Prochaine séance</h3><p>${fr(reunion.prochaine_date)}${
      reunion.prochaine_heure ? ` à ${esc(reunion.prochaine_heure)}` : ''}${
      reunion.prochain_lieu ? ` · ${esc(reunion.prochain_lieu)}` : ''}${
      reunion.prochaine_qui ? `<br><span class="fin">Attendus : ${
        esc(reunion.prochaine_qui)}</span>` : ''}</p>` : ''}

    ${/* Ce qui a été décidé hors d'un point — et le récapitulatif quand la
          séance n'a pas été tenue par points. */''}
    <h3>${points.length ? 'Autres décisions' : 'Ce qui a été décidé — et par qui'}</h3>
    ${(() => {
      const hors = taches.filter(t => !points.length || !t.point_id);
      return hors.length ? `<table>
        <thead><tr><th>Tâche</th><th>Qui</th><th>Pour le</th><th>État</th></tr></thead>
        <tbody>${hors.map(ligneTache).join('')}</tbody></table>`
        : '<p class="fin">Aucune autre décision.</p>';
    })()}`;

  res.json({
    html: envelopperDocument({
      html: corps,
      titre: `${reunion.titre} — ${fr(reunion.date_seance)}`,
      styles: STYLE_PV,
    }),
    nom: `Reunion_${String(reunion.date_seance).replace(/\W/g, '')}.html`,
    titre: reunion.titre,
  });
});

/** La liste des tâches ouvertes, par responsable — la feuille de la réunion. */
r.post('/taches/document', authRequired, (req, res) => {
  const annee = anneeDeTravail(req);
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
  const taches = db.prepare(SELECT_TACHE + `
    WHERE t.annee_scolaire = ? ${req.body?.toutes ? '' : "AND t.statut IN ('a_faire','en_cours')"}
    ORDER BY COALESCE(u.nom_complet, t.responsable_role, 'zzz'),
             CASE WHEN t.echeance IS NULL THEN 1 ELSE 0 END, t.echeance
  `).all(annee);
  attacherResponsables(taches);

  // PAR PERSONNE, PAS PAR DATE. On ne lit pas cette feuille pour savoir ce qui
  // tombe mardi : on la lit pour dire à chacun ce qu'il doit, et un nom qui
  // revient dix fois dans une liste chronologique ne se voit jamais d'un coup.
  //
  // UNE ACTION PORTÉE À DEUX FIGURE CHEZ LES DEUX. La compter une seule fois,
  // chez le premier nommé, revient à dire au second qu'elle ne le regarde pas.
  const groupes = new Map();
  for (const t of taches) {
    const cibles = t.responsables?.length
      ? t.responsables.map(x => x.nom || LIB_ROLE[x.role] || x.role || 'Sans responsable')
      : [t.responsable_nom || LIB_ROLE[t.responsable_role] || t.responsable_role
         || 'Sans responsable'];
    for (const cle of [...new Set(cibles)]) {
      if (!groupes.has(cle)) groupes.set(cle, []);
      groupes.get(cle).push(t);
    }
  }

  const corps = `
    <h1>Tâches en cours</h1>
    <p class="sous">${esc(annee)} · ${taches.length} tâche(s) ouverte(s)
      · état au ${new Date().toLocaleDateString('fr-BE')}</p>
    ${[...groupes.entries()].map(([nom, liste]) => `
      <h3>${esc(nom)} <span class="fin">— ${liste.length} tâche(s)</span></h3>
      <table>
        <thead><tr><th>Tâche</th><th>Pour le</th><th>État</th><th>Décidée le</th></tr></thead>
        <tbody>${liste.map(t => `<tr>
          <td>${esc(t.titre)}${t.detail ? `<br><span class="fin">${esc(t.detail)}</span>` : ''}</td>
          <td>${fr(t.echeance)}</td>
          <td>${esc(LIB_STATUT[t.statut] || t.statut)}</td>
          <td>${t.reunion_date ? fr(t.reunion_date) : '—'}</td>
        </tr>`).join('')}</tbody>
      </table>`).join('')}
    ${taches.length ? '' : '<p class="fin">Aucune tâche ouverte.</p>'}`;

  res.json({
    html: envelopperDocument({ html: corps, titre: 'Tâches en cours', styles: STYLE_PV }),
    nom: `Taches_${String(annee).replace(/\W/g, '')}.html`,
    titre: 'Tâches en cours',
  });
});

const LIB_STATUT = {
  a_faire: 'à faire', en_cours: 'en cours', fait: 'fait', abandonnee: 'abandonnée',
};

// Un service porte une action comme une personne : sur le papier, il doit se
// lire en toutes lettres et non par sa clé technique.
const LIB_ROLE = {
  secretariat: 'Le secrétariat', coordination: 'La coordination',
  directeur_adjoint: 'La direction adjointe', directeur: 'La direction',
  admin: "L'administration",
};

// Le même papier que les rapports : un filet sous l'en-tête, un filet fin entre
// les lignes, et rien d'autre — on lit des noms et des dates, pas une grille.
const STYLE_PV = `
  h1 { font-size: 14pt; letter-spacing: -.2pt; }
  .sous { color:#64748b; font-size:9pt; margin:0 0 6mm; }
  .fin  { color:#94a3b8; font-size:8pt; }
  h3 { font-size: 10pt; margin: 6mm 0 1mm; letter-spacing: -.1pt; }
  ol, ul { margin: 1mm 0 2mm 5mm; padding: 0; }
  li { margin: .8mm 0; font-size: 9pt; }
  table { margin: 0 0 2mm; }
  th, td { border: 0; padding: 1.6mm 2mm; font-size: 8.5pt;
           border-bottom: 0.3pt solid #e2e8f0; }
  th { background: transparent; color:#64748b; font-size: 7.5pt;
       border-bottom: 0.8pt solid #cbd5e1; }
  tbody tr:last-child td { border-bottom: 0; }`;

export default r;
