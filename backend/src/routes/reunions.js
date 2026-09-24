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
import { envoyerEmail, mailerConfigure } from '../services/mailer.js';
import { rendrePdf } from '../services/pdf.js';

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
  { cle: 'conseil_administration', libelle: "Conseil d'administration" },
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
  // CE QUI A ÉTÉ VU RESTE VU. L'équipage se réécrit en entier — on efface, on
  // repose —, et « vu_le » partait avec. Ajouter quelqu'un à une tâche aurait
  // donc rendu la tâche « nouvelle » pour tous les autres, qui l'avaient lue
  // depuis longtemps : un signal qui se rallume tout seul ne signale plus rien.
  const vus = new Map();
  for (const l of db.prepare(
    'SELECT user_id, professeur_id, role, vu_le FROM tache_personne WHERE tache_id = ?')
    .all(tacheId)) {
    if (l.vu_le) vus.set(`${l.user_id || ''}|${l.professeur_id || ''}|${l.role || ''}`, l.vu_le);
  }
  db.prepare('DELETE FROM tache_personne WHERE tache_id = ?').run(tacheId);
  const poser = db.prepare(`INSERT INTO tache_personne
    (tache_id, user_id, professeur_id, role, rang, vu_le) VALUES (?,?,?,?,?,?)`);
  (cles || []).filter(Boolean).forEach((cle, i) => {
    const c = depuisCle(cle);
    poser.run(tacheId, c.user_id, c.professeur_id, c.role, i,
      vus.get(`${c.user_id || ''}|${c.professeur_id || ''}|${c.role || ''}`) || null);
  });
  const premier = depuisCle((cles || []).filter(Boolean)[0]);
  db.prepare(`UPDATE tache SET responsable_user_id=?, responsable_professeur_id=?,
              responsable_role=? WHERE id=?`)
    .run(premier.user_id, premier.professeur_id, premier.role, tacheId);
}

/**
 * LES INFORMÉS — ceux qui doivent savoir que la tâche a été donnée, sans en
 * répondre. Même écriture que l'équipage, « vu » compris ; celui qui est déjà
 * responsable n'est pas en plus informé.
 */
function ecrireInformes(tacheId, cles) {
  const vus = new Map();
  for (const l of db.prepare('SELECT user_id, professeur_id, role, vu_le FROM tache_informe WHERE tache_id = ?').all(tacheId)) {
    if (l.vu_le) vus.set(`${l.user_id || ''}|${l.professeur_id || ''}|${l.role || ''}`, l.vu_le);
  }
  const equipage = new Set(db.prepare('SELECT user_id, professeur_id, role FROM tache_personne WHERE tache_id = ?')
    .all(tacheId).map(l => `${l.user_id || ''}|${l.professeur_id || ''}|${l.role || ''}`));
  db.prepare('DELETE FROM tache_informe WHERE tache_id = ?').run(tacheId);
  const poser = db.prepare(`INSERT INTO tache_informe (tache_id, user_id, professeur_id, role, vu_le)
    VALUES (?,?,?,?,?)`);
  for (const cle of [...new Set((cles || []).filter(Boolean))]) {
    const c = depuisCle(cle);
    const k = `${c.user_id || ''}|${c.professeur_id || ''}|${c.role || ''}`;
    if (equipage.has(k)) continue;
    poser.run(tacheId, c.user_id, c.professeur_id, c.role, vus.get(k) || null);
  }
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
  const inf = db.prepare(`
    SELECT ti.tache_id, ti.user_id, ti.professeur_id, ti.role,
           COALESCE(u.nom_complet, pr.prenom || ' ' || pr.nom) AS nom
      FROM tache_informe ti
      LEFT JOIN utilisateur u  ON u.id  = ti.user_id
      LEFT JOIN professeur  pr ON pr.id = ti.professeur_id
     WHERE ti.tache_id IN (${ids.map(() => '?').join(',')})
  `).all(...ids);
  const parI = new Map();
  for (const x of inf) {
    if (!parI.has(x.tache_id)) parI.set(x.tache_id, []);
    parI.get(x.tache_id).push({
      cle: x.user_id ? `u:${x.user_id}` : x.professeur_id ? `p:${x.professeur_id}` : `r:${x.role}`,
      nom: x.nom || null, role: x.role || null,
    });
  }
  for (const l of lignes) l.informes = parI.get(l.id) || [];
  return lignes;
}

const SELECT_TACHE = `
  SELECT t.*,
         COALESCE(u.nom_complet, pr.prenom || ' ' || pr.nom) AS responsable_nom,
         pt.intitule AS point_intitule,
         r.titre AS reunion_titre, r.date_seance AS reunion_date, r.section AS reunion_section,
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

  // CE DONT ON M'A TENU AU COURANT — sans que j'en réponde.
  if (req.query.informe === '1') {
    sql += ` AND EXISTS (SELECT 1 FROM tache_informe ti WHERE ti.tache_id = t.id
               AND (ti.user_id = ? OR ti.role = ?
                    OR (ti.professeur_id IS NOT NULL AND ti.professeur_id = (
                          SELECT professeur_id FROM utilisateur WHERE id = ?))))`;
    p.push(req.user.id, req.user.role, req.user.id);
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
  const lignes = attacherResponsables(db.prepare(sql).all(...p));
  res.json(marquerNouvelles(lignes, req.user));
});

/**
 * CE QUE CETTE PERSONNE N'A PAS ENCORE VU.
 *
 * Une tâche confiée un vendredi soir se noyait le lundi parmi les six autres :
 * rien ne distinguait celle qu'on n'avait jamais lue de celles qu'on traîne
 * depuis trois semaines.
 *
 * Seule la ligne de `tache_personne` qui NOMME cette personne fait foi — une
 * tâche confiée à un rôle qu'elle porte aussi n'a pas de ligne à son nom, et
 * elle n'est alors pas signalée : mieux vaut ne rien annoncer qu'annoncer à
 * tort une nouveauté à quatre personnes à la fois.
 */
function marquerNouvelles(lignes, user) {
  if (!lignes.length || !user?.id) return lignes;
  try {
    const ids = lignes.map(l => l.id);
    const vus = db.prepare(`
      SELECT tache_id, vu_le FROM tache_personne
       WHERE tache_id IN (${ids.map(() => '?').join(',')})
         AND (user_id = ? OR (professeur_id IS NOT NULL AND professeur_id = (
               SELECT professeur_id FROM utilisateur WHERE id = ?)))
      UNION ALL
      SELECT tache_id, vu_le FROM tache_informe
       WHERE tache_id IN (${ids.map(() => '?').join(',')})
         AND (user_id = ? OR (professeur_id IS NOT NULL AND professeur_id = (
               SELECT professeur_id FROM utilisateur WHERE id = ?)))
    `).all(...ids, user.id, user.id, ...ids, user.id, user.id);
    const sansVue = new Set(vus.filter(v => !v.vu_le).map(v => v.tache_id));
    return lignes.map(l => ({ ...l, nouveau: sansVue.has(l.id) ? 1 : 0 }));
  } catch (e) {
    // La colonne peut manquer sur une base qui n'a pas encore migré : sans ce
    // filet, tout l'écran des tâches tomberait pour un signal décoratif.
    console.error('[taches/nouveau]', e.message);
    return lignes;
  }
}

/**
 * ACQUITTER — « je les ai vues ».
 *
 * L'écran le dit une fois affichées. Il n'y a rien à confirmer : le signal
 * n'est pas une alerte qu'on ferme, c'est une nouveauté qui cesse de l'être.
 */
r.post('/taches/vues', authRequired, (req, res) => {
  const ids = (req.body?.ids || []).map(Number).filter(Boolean);
  if (!ids.length) return res.json({ ok: true, marquees: 0 });
  try {
    let marquees = 0;
    for (const table of ['tache_personne', 'tache_informe']) {
      marquees += db.prepare(`
        UPDATE ${table} SET vu_le = datetime('now')
         WHERE vu_le IS NULL
           AND tache_id IN (${ids.map(() => '?').join(',')})
           AND (user_id = ? OR (professeur_id IS NOT NULL AND professeur_id = (
                 SELECT professeur_id FROM utilisateur WHERE id = ?)))
      `).run(...ids, req.user.id, req.user.id).changes;
    }
    res.json({ ok: true, marquees });
  } catch (e) {
    console.error('[taches/vues]', e.message);
    res.json({ ok: true, marquees: 0 });
  }
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
  if (Array.isArray(b.informes)) ecrireInformes(info.lastInsertRowid, b.informes);
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

  /* « PAS ENCORE FAIT » : le responsable le signale d'un clic quand la date
   * approche ; daté, signé, visible dans le suivi de celui qui a confié.
   * Marquer la tâche faite efface le signal — il a cessé d'être vrai. */
  let pasFaitLe = t.pas_fait_le, pasFaitPar = t.pas_fait_par;
  if (b.pas_fait === true) { pasFaitLe = new Date().toISOString().slice(0, 10); pasFaitPar = qui(req); }
  if (b.pas_fait === false || devientFaite) { pasFaitLe = null; pasFaitPar = null; }

  db.prepare(`
    UPDATE tache SET titre=?, detail=?, responsable_user_id=?,
      responsable_professeur_id=?, responsable_role=?,
      echeance=?, statut=?, priorite=?, commentaire=?, reunion_id=?,
      revue_reunion_id=?, echeance_id=?, point_id=?,
      fait_le=?, fait_par=?, pas_fait_le=?, pas_fait_par=?, maj_le=datetime('now')
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
    pasFaitLe, pasFaitPar,
    req.params.id);

  // L'ÉQUIPAGE NE SE MODIFIE QUE SI ON LE DIT. Cocher « fait » envoie un seul
  // champ : réécrire les responsables à cette occasion les effacerait.
  if (Array.isArray(b.responsables)) ecrireResponsables(Number(req.params.id), b.responsables);
  if (Array.isArray(b.informes)) ecrireInformes(Number(req.params.id), b.informes);

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

/**
 * QUI LIT LE CONFIDENTIEL D'UNE SÉANCE — la règle, écrite une fois.
 *
 * La direction ; l'organisateur ; les participants convoqués, par leur compte
 * ou par leur fiche du personnel. Personne d'autre : un compte qui ouvre le
 * suivi d'équipe voit la séance, ses points et ses décisions, mais pas ce qui
 * s'y est dit à huis clos. C'est le SERVEUR qui retire le texte — l'écran ne
 * reçoit jamais ce qu'il ne doit pas montrer.
 */
function peutConfidentiel(user, reunion) {
  if (!user || !reunion) return false;
  if (['admin', 'directeur', 'directeur_adjoint'].includes(user.role)) return true;
  if (reunion.organisateur_user_id && reunion.organisateur_user_id === user.id) return true;
  const profId = db.prepare('SELECT professeur_id FROM utilisateur WHERE id = ?')
    .get(user.id)?.professeur_id || null;
  if (profId && reunion.organisateur_professeur_id === profId) return true;
  return !!db.prepare(`
    SELECT 1 FROM reunion_participant
     WHERE reunion_id = ? AND (user_id = ? OR (? IS NOT NULL AND professeur_id = ?))
     LIMIT 1`).get(reunion.id, user.id, profId, profId);
}

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
  // QUI ÉTAIT LÀ (Jérôme, 24 septembre 2026) : l'organisateur seul ne dit pas
  // de quelle séance il s'agit — le nom des présents, si.
  const lirePresents = db.prepare(`SELECT nom, present, excuse FROM reunion_participant
    WHERE reunion_id = ? ORDER BY nom`);
  // La liste n'a pas besoin du texte : elle dit seulement qu'il existe.
  for (const l of lignes) {
    const gens = lirePresents.all(l.id);
    l.presents = gens.filter(g => g.present).map(g => g.nom);
    l.excuses = gens.filter(g => !g.present && g.excuse).map(g => g.nom);
    l.a_du_confidentiel = !!(l.notes_confidentielles && l.notes_confidentielles.trim())
      || !!db.prepare('SELECT 1 FROM reunion_point WHERE reunion_id = ? AND confidentiel = 1 LIMIT 1').get(l.id);
    delete l.notes_confidentielles;
  }
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
  reunion.peut_confidentiel = peutConfidentiel(req.user, reunion);
  if (!reunion.peut_confidentiel) {
    reunion.notes_confidentielles = null;
    for (const p of reunion.points) {
      if (p.confidentiel) { p.notes = null; p.masque = true; }
    }
  }
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
                         lieu, ordre_du_jour, notes, notes_confidentielles, statut,
                         organisateur_user_id, organisateur_professeur_id, section,
                         prochaine_date, prochaine_heure, prochain_lieu, prochaine_qui,
                         cree_par)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(anneeDeTravail(req), (b.titre || 'Réunion').trim(),
    b.genre || 'secretariat',
    b.date_seance || new Date().toISOString().slice(0, 10),
    b.heure_seance || null, b.lieu || null,
    b.ordre_du_jour || null, b.notes || null, b.notes_confidentielles || null,
    b.statut || 'preparee',
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
    db.prepare('INSERT INTO reunion_point (reunion_id, ordre, intitule, notes, confidentiel) VALUES (?,?,?,?,?)')
      .run(info.lastInsertRowid, i, String(pt.intitule || '').trim(), pt.notes || null,
        pt.confidentiel ? 1 : 0);
  });
  res.json({ id: info.lastInsertRowid });
});

r.put('/:id', authRequired, (req, res) => {
  const reunion = db.prepare('SELECT * FROM reunion WHERE id = ?').get(req.params.id);
  if (!reunion) return res.status(404).json({ error: 'réunion inconnue' });
  const b = req.body || {};
  const v = (k) => (b[k] === undefined ? reunion[k] : b[k]);
  // UN ÉCRAN QUI N'A PAS REÇU LE CONFIDENTIEL NE PEUT PAS L'EFFACER. Il
  // renverrait un champ vide ; on garde donc ce qui est en base.
  const peut = peutConfidentiel(req.user, reunion);
  const confid = peut && b.notes_confidentielles !== undefined
    ? (b.notes_confidentielles || null) : reunion.notes_confidentielles;
  db.prepare(`
    UPDATE reunion SET titre=?, genre=?, date_seance=?, heure_seance=?, lieu=?,
      ordre_du_jour=?, notes=?, notes_confidentielles=?, statut=?,
      organisateur_user_id=?, organisateur_professeur_id=?, section=?,
      prochaine_date=?, prochaine_heure=?, prochain_lieu=?, prochaine_qui=?
    WHERE id=?
  `).run(v('titre'), v('genre'), v('date_seance'), v('heure_seance'), v('lieu'),
    v('ordre_du_jour'), v('notes'), confid, v('statut'),
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
        const avant = db.prepare('SELECT confidentiel, notes FROM reunion_point WHERE id = ? AND reunion_id = ?')
          .get(pt.id, req.params.id);
        // Point confidentiel et lecteur non habilité : l'intitulé et l'ordre
        // bougent, les notes et le drapeau restent ce qu'ils sont en base.
        const garderSecret = avant?.confidentiel && !peut;
        db.prepare('UPDATE reunion_point SET ordre=?, intitule=?, notes=?, confidentiel=? WHERE id=? AND reunion_id=?')
          .run(i, intitule,
            garderSecret ? avant.notes : (pt.notes || null),
            garderSecret ? 1 : (peut ? (pt.confidentiel ? 1 : 0) : (avant?.confidentiel || 0)),
            pt.id, req.params.id);
        gardes.push(pt.id);
      } else if (intitule || pt.notes) {
        const r2 = db.prepare(
          'INSERT INTO reunion_point (reunion_id, ordre, intitule, notes, confidentiel) VALUES (?,?,?,?,?)')
          .run(req.params.id, i, intitule, pt.notes || null, peut && pt.confidentiel ? 1 : 0);
        gardes.push(r2.lastInsertRowid);
      }
    });
    // Un point confidentiel ne se retire pas à l'aveugle : qui ne le lit pas
    // ne le supprime pas.
    if (!peut) {
      for (const x of db.prepare('SELECT id FROM reunion_point WHERE reunion_id = ? AND confidentiel = 1')
        .all(req.params.id)) {
        if (!gardes.includes(x.id)) gardes.push(x.id);
      }
    }
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
  /* DEUX PV, ET UN SEUL CIRCULE. Le PV ordinaire ne reproduit jamais le
   * confidentiel — c'est celui qu'on diffuse. Le PV INTÉGRAL le reprend,
   * marqué comme tel, et ne se produit que pour qui peut le lire. */
  const integral = req.body?.version === 'integrale';
  if (integral && !peutConfidentiel(req.user, reunion)) {
    return res.status(403).json({ error: 'Le PV intégral est réservé à la direction, à l’organisateur et aux participants de la séance.' });
  }
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

  /* LE PV, REFAIT POUR SE LIRE (Jérôme, 24 septembre 2026 : « la mise en page
   * ne va pas »). Le titre s'imprimait deux fois — l'enveloppe le pose déjà —,
   * l'ordre du jour se lisait en liste avant de se relire en détail, et des
   * rubriques vides annonçaient « aucune autre décision ». Le PV tient
   * désormais en trois temps : un cartouche (quand, où, qui), les points
   * numérotés avec ce qui s'y est décidé, la suite. Rien de vide n'est écrit. */
  const court = d => (d ? String(d).slice(0, 10).split('-').reverse().slice(0, 2).join('/') : '');
  const ligneTache = t => `<tr>
    <td class="fl">→</td>
    <td>${esc(t.titre)}${t.detail ? `<span class="fin"> — ${esc(t.detail)}</span>` : ''}${
      t.obligation_libelle ? `<br><span class="fin">pour : ${esc(t.obligation_libelle)}</span>` : ''}</td>
    <td class="qui">${esc(quiFait(t))}</td>
    <td class="date">${t.echeance ? `pour le ${court(t.echeance)}` : ''}</td>
    <td class="etat">${t.statut && t.statut !== 'a_faire' ? esc(LIB_STATUT[t.statut] || t.statut) : ''}</td>
  </tr>`;
  const decisions = liste => (liste.length
    ? `<table class="dec"><tbody>${liste.map(ligneTache).join('')}</tbody></table>` : '');
  const paragraphes = texte => String(texte || '').split('\n').filter(l => l.trim())
    .map(l => `<p>${esc(l)}</p>`).join('');

  const cartouche = [
    ['Date', `${fr(reunion.date_seance)}${reunion.heure_seance ? ` à ${esc(reunion.heure_seance)}` : ''}`],
    reunion.lieu ? ['Lieu', esc(reunion.lieu)] : null,
    reunion.organisateur_nom ? ['Organisée par', esc(reunion.organisateur_nom)] : null,
    reunion.section ? ['Section', esc(reunion.section)] : null,
    ['Présents', presents.length ? presents.join(', ') : '—'],
    excuses.length ? ['Excusés', excuses.join(', ')] : null,
    absents.length ? ['Absents', absents.join(', ')] : null,
  ].filter(Boolean);

  const hors = taches.filter(t => !points.length || !t.point_id);

  const corps = `
    <table class="cartouche"><tbody>${cartouche.map(([k, v]) =>
      `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</tbody></table>

    ${points.map((p, i) => {
      const siennes = taches.filter(t => t.point_id === p.id);
      const cache = p.confidentiel && !integral;
      return `<div class="point">
        <h3>${i + 1}. ${esc(p.intitule) || 'Point sans intitulé'}${
          p.confidentiel && integral ? ' <span class="confid">confidentiel</span>' : ''}</h3>
        ${cache ? '<p class="fin">Point traité à huis clos — les échanges ne sont pas reproduits.</p>'
          : paragraphes(p.notes)}
        ${decisions(siennes)}
      </div>`;
    }).join('')}

    ${hors.length ? `<div class="point"><h3>${points.length ? 'Autres décisions' : 'Décisions'}</h3>${decisions(hors)}</div>` : ''}

    ${reunion.notes ? `<div class="point"><h3>Notes</h3>${paragraphes(reunion.notes)}</div>` : ''}

    ${integral && reunion.notes_confidentielles ? `<div class="point"><h3>Notes confidentielles
        <span class="confid">confidentiel</span></h3>${paragraphes(reunion.notes_confidentielles)}</div>` : ''}

    ${reunion.prochaine_date ? `<p class="suite"><b>Prochaine séance :</b> ${fr(reunion.prochaine_date)}${
      reunion.prochaine_heure ? ` à ${esc(reunion.prochaine_heure)}` : ''}${
      reunion.prochain_lieu ? ` · ${esc(reunion.prochain_lieu)}` : ''}${
      reunion.prochaine_qui ? ` — ${esc(reunion.prochaine_qui)}` : ''}</p>` : ''}`;

  res.json({
    html: envelopperDocument({
      html: corps,
      titre: `${reunion.titre} — ${fr(reunion.date_seance)}${integral ? ' — PV intégral (confidentiel)' : ''}`,
      styles: STYLE_PV + (integral ? `
        .confid { display:inline-block; font-size:7.5pt; font-weight:700; color:#B91C1C;
          border:0.3mm solid #B91C1C; border-radius:1mm; padding:0 1.5mm; margin-left:2mm;
          text-transform:uppercase; vertical-align:middle; }` : ''),
    }),
    nom: `Reunion_${String(reunion.date_seance).replace(/\W/g, '')}${integral ? '_integral' : ''}.html`,
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

// ─── LE RAPPORT DU MOIS ─────────────────────────────────────────────────────
//
// « Chaque mois, je veux un rapport de ce qui a été fait » (Jérôme, 24
// septembre 2026) — et de TOUT Lucie, pas seulement des réunions. Le rapport
// se lit en une minute : un « en bref » chiffré, puis chaque domaine où il
// s'est passé quelque chose. Un domaine muet ne s'imprime pas.
//
// RIEN DE CONFIDENTIEL N'Y ENTRE : des réunions, les intitulés des points,
// jamais les notes ; du dossier de suivi des étudiants, un nombre, jamais le
// texte.

const NOMS_MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const moisLibelle = mois => `${NOMS_MOIS[Number(mois.slice(5, 7)) - 1]} ${mois.slice(0, 4)}`;
const moisSuivant = mois => {
  const [a, m] = mois.split('-').map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
};

export function construireRapportMensuel(mois) {
  const debut = `${mois}-01`, fin = `${moisSuivant(mois)}-01`;
  const dans = col => `substr(${col}, 1, 10) >= '${debut}' AND substr(${col}, 1, 10) < '${fin}'`;
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
  // Une table absente (base plus ancienne) ne fait pas tomber le rapport.
  const tous = (sql, ...a) => { try { return db.prepare(sql).all(...a); } catch { return []; } };
  const un = (sql, ...a) => { try { return db.prepare(sql).get(...a) || {}; } catch { return {}; } };
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const borne = fin <= aujourdhui ? fin : aujourdhui;   // « en retard » à la fin du mois, ou aujourd'hui

  // ── Réunions ──
  const reunions = tous(`SELECT r.id, r.titre, r.date_seance, r.section FROM reunion r
    WHERE ${dans('r.date_seance')} ORDER BY r.date_seance, r.id`);
  for (const r0 of reunions) {
    r0.presents = tous('SELECT nom FROM reunion_participant WHERE reunion_id = ? AND present = 1 ORDER BY nom', r0.id).map(x => x.nom);
    r0.points = tous('SELECT intitule FROM reunion_point WHERE reunion_id = ? ORDER BY ordre, id', r0.id).map(x => x.intitule).filter(Boolean);
    const t = un(`SELECT COUNT(*) n, SUM(statut = 'fait') f FROM tache WHERE reunion_id = ?`, r0.id);
    r0.decisions = t.n || 0; r0.faites = t.f || 0;
  }

  // ── Tâches ──
  const faites = attacherResponsables(tous(SELECT_TACHE + ` WHERE t.statut = 'fait' AND ${dans('t.fait_le')} ORDER BY t.fait_le`));
  const creees = un(`SELECT COUNT(*) n FROM tache WHERE ${dans('cree_le')}`).n || 0;
  const retard = attacherResponsables(tous(SELECT_TACHE + ` WHERE t.statut IN ('a_faire','en_cours')
    AND t.echeance IS NOT NULL AND t.echeance < ? ORDER BY t.echeance`, borne));
  const signalees = un(`SELECT COUNT(*) n FROM tache WHERE ${dans('pas_fait_le')}`).n || 0;
  const quiFait = t => (t.responsables?.length
    ? t.responsables.map(x => x.nom || LIB_ROLE[x.role] || x.role).filter(Boolean).join(', ')
    : (t.responsable_nom || LIB_ROLE[t.responsable_role] || t.responsable_role)) || 'Sans responsable';
  const parPersonne = liste => {
    const m = new Map();
    for (const t of liste) { const k = quiFait(t); (m.get(k) || m.set(k, []).get(k)).push(t); }
    return [...m].sort((a, b) => b[1].length - a[1].length);
  };

  // ── Obligations de l'échéancier ──
  const oblFaites = tous(`SELECT COALESCE(e.libelle_override, et.libelle) AS lib, e.date_due, e.fait_le
    FROM echeance e LEFT JOIN echeance_type et ON et.id = e.type_id
    WHERE e.fait_le IS NOT NULL AND ${dans('e.fait_le')} ORDER BY e.fait_le`);
  const oblManquees = tous(`SELECT COALESCE(e.libelle_override, et.libelle) AS lib, e.date_due
    FROM echeance e LEFT JOIN echeance_type et ON et.id = e.type_id
    WHERE e.fait_le IS NULL AND ${dans('e.date_due')} AND e.date_due < ? ORDER BY e.date_due`, borne);

  // ── Étudiants ──
  const nouveaux = un(`SELECT COUNT(*) n FROM etudiant WHERE ${dans('cree_le')}`).n || 0;
  const inscriptions = tous(`SELECT COALESCE((SELECT section FROM ue u WHERE u.ue_num = i.ue_num
      ORDER BY u.annee_scolaire DESC LIMIT 1), '—') AS section, COUNT(*) n, COUNT(DISTINCT i.etudiant_id) e
    FROM etudiant_inscription i WHERE ${dans('COALESCE(i.cree_le, i.date_inscription)')}
    GROUP BY 1 ORDER BY 2 DESC`);
  const paeValides = un(`SELECT COUNT(*) n FROM etudiant_pae WHERE ${dans('confirme_le')}`).n || 0;
  const sorties = tous(`SELECT sortie_statut AS statut, COUNT(*) n FROM etudiant
    WHERE sortie_le IS NOT NULL AND ${dans('sortie_le')} GROUP BY 1`);
  const suivi = un(`SELECT COUNT(*) n, COUNT(DISTINCT etudiant_id) e FROM etudiant_suivi WHERE ${dans('cree_le')}`);

  // ── Délibérations ──
  const delib = tous(`SELECT d.ue_num,
      (SELECT ue_nom FROM ue u WHERE u.ue_num = d.ue_num ORDER BY u.annee_scolaire DESC LIMIT 1) AS ue_nom,
      COUNT(*) n, SUM(d.resultat = 'reussi') r, SUM(d.resultat = 'ajourne') a, SUM(d.resultat = 'refuse') f
    FROM deliberation_resultat d WHERE ${dans('d.decide_le')} GROUP BY d.ue_num ORDER BY d.ue_num`);
  const seances = un(`SELECT COUNT(*) n FROM deliberation_seance WHERE ${dans('date_seance')}`).n || 0;

  // ── Valorisations ──
  const va = tous(`SELECT COALESCE(decision, 'sans décision') AS decision, COUNT(*) n FROM etudiant_valorisation
    WHERE decision_le IS NOT NULL AND ${dans('decision_le')} GROUP BY 1`);
  const vaDemandes = un(`SELECT COUNT(*) n FROM etudiant_valorisation WHERE ${dans('COALESCE(date_reception, cree_le)')}`).n || 0;

  // ── Personnel et organisation ──
  const attrCreees = un(`SELECT COUNT(*) n FROM attribution WHERE ${dans('created_at')}`).n || 0;
  const attrModifiees = un(`SELECT COUNT(*) n FROM attribution WHERE ${dans('updated_at')}
    AND NOT (${dans('created_at')})`).n || 0;
  const absences = un(`SELECT COUNT(*) n FROM absence_personnel WHERE ${dans('cree_le')}`).n || 0;
  const entretiens = un(`SELECT COUNT(*) n FROM entretien_personnel WHERE date_tenue IS NOT NULL AND ${dans('date_tenue')}`).n || 0;
  const candidatures = un(`SELECT COUNT(*) n FROM recrutement_candidature WHERE ${dans('cree_le')}`).n || 0;

  // ── Communication et enseignants ──
  const comms = un(`SELECT COUNT(*) n FROM communication WHERE envoye_le IS NOT NULL AND ${dans('envoye_le')}`).n || 0;
  const mails = un(`SELECT COUNT(*) n FROM envoi_mail WHERE ${dans('envoye_le')}`).n || 0;
  const notesProp = un(`SELECT COUNT(*) n, COUNT(DISTINCT professeur_id) p FROM note_proposee WHERE ${dans('propose_le')}`);

  // ── Mise en page ──
  const bref = [
    ['Réunions tenues', reunions.length],
    ['Tâches faites', faites.length],
    ['Tâches en retard', retard.length],
    ['PAE validés', paeValides],
    ['Décisions de délibération', delib.reduce((n, d) => n + d.n, 0)],
    ['Inscriptions enregistrées', inscriptions.reduce((n, i) => n + i.n, 0)],
  ];
  const section = (titre, contenu) => (contenu ? `<div class="bloc"><h3>${titre}</h3>${contenu}</div>` : '');
  const liste = items => (items.length ? `<ul>${items.map(x => `<li>${x}</li>`).join('')}</ul>` : '');
  const chiffres = paires => {
    const l = paires.filter(([, v]) => v);
    return l.length ? `<p>${l.map(([k, v]) => `<b>${v}</b> ${k}`).join(' · ')}</p>` : '';
  };

  const corps = `
    <table class="bref"><tr>${bref.map(([k, v]) =>
      `<td><div class="n">${v}</div><div class="k">${k}</div></td>`).join('')}</tr></table>

    ${section(`Réunions (${reunions.length})`, reunions.length ? `<table class="lst"><tbody>${reunions.map(r0 => `<tr>
        <td class="d">${fr(r0.date_seance)}</td>
        <td><b>${esc(r0.titre)}</b>${r0.section ? ` · ${esc(r0.section)}` : ''}
          ${r0.presents.length ? `<br><span class="fin">Présents : ${r0.presents.map(esc).join(', ')}</span>` : ''}
          ${r0.points.length ? `<br><span class="fin">Points : ${r0.points.map(esc).join(' · ')}</span>` : ''}</td>
        <td class="c">${r0.decisions ? `${r0.decisions} décision(s)<br><span class="fin">${r0.faites} faite(s)</span>` : ''}</td>
      </tr>`).join('')}</tbody></table>` : '')}

    ${section(`Ce qui a été fait (${faites.length} tâche${faites.length > 1 ? 's' : ''})`,
      faites.length ? parPersonne(faites).map(([qui, l]) => `<p class="qui"><b>${esc(qui)}</b> — ${l.length}</p>${
        liste(l.map(t => `${esc(t.titre)} <span class="fin">· ${fr(t.fait_le)}${t.reunion_titre ? ` · ${esc(t.reunion_titre)}` : ''}</span>`))}`).join('')
        + (creees || signalees ? `<p class="fin">${creees} tâche(s) créée(s) dans le mois${signalees ? ` · ${signalees} signalée(s) « pas encore fait »` : ''}.</p>` : '')
      : '')}

    ${section(`En retard (${retard.length})`,
      retard.length ? parPersonne(retard).map(([qui, l]) => `<p class="qui"><b>${esc(qui)}</b> — ${l.length}</p>${
        liste(l.map(t => `${esc(t.titre)} <span class="fin">· prévue le ${fr(t.echeance)}</span>`))}`).join('') : '')}

    ${section('Obligations de l’échéancier', (oblFaites.length || oblManquees.length) ? `
      ${oblFaites.length ? `<p><b>Remplies :</b></p>${liste(oblFaites.map(o => `${esc(o.lib)} <span class="fin">· ${fr(o.fait_le)}</span>`))}` : ''}
      ${oblManquees.length ? `<p><b>Échues sans être remplies :</b></p>${liste(oblManquees.map(o => `${esc(o.lib)} <span class="fin">· due le ${fr(o.date_due)}</span>`))}` : ''}` : '')}

    ${section('Étudiants', (nouveaux || inscriptions.length || paeValides || sorties.length || suivi.n) ? `
      ${chiffres([['nouvelle(s) fiche(s)', nouveaux], ['PAE validé(s)', paeValides],
        ['note(s) au dossier de suivi', suivi.n]])}
      ${inscriptions.length ? `<p>Inscriptions enregistrées : ${inscriptions.map(i =>
        `${esc(i.section)} <b>${i.n}</b> <span class="fin">(${i.e} étudiant${i.e > 1 ? 's' : ''})</span>`).join(' · ')}</p>` : ''}
      ${sorties.length ? `<p>Sorties : ${sorties.map(x => `<b>${x.n}</b> ${esc({ diplome: 'diplômé(s)', sorti: 'sorti(s)', archive: 'archivé(s)' }[x.statut] || x.statut)}`).join(' · ')}</p>` : ''}` : '')}

    ${section('Délibérations', delib.length || seances ? `
      ${chiffres([['séance(s) de délibération', seances]])}
      ${delib.length ? `<table class="lst"><tbody>${delib.map(d => `<tr>
        <td class="d">UE ${d.ue_num}</td><td>${esc(d.ue_nom || '')}</td>
        <td class="c">${d.r || 0} réussi · ${d.a || 0} ajourné · ${d.f || 0} refusé</td></tr>`).join('')}</tbody></table>` : ''}` : '')}

    ${section('Valorisation des acquis', va.length || vaDemandes ? `
      ${chiffres([['demande(s) reçue(s)', vaDemandes]])}
      ${va.length ? `<p>Décisions : ${va.map(x => `<b>${x.n}</b> ${esc(x.decision)}`).join(' · ')}</p>` : ''}` : '')}

    ${section('Personnel et organisation', chiffres([
      ['attribution(s) créée(s)', attrCreees], ['attribution(s) modifiée(s)', attrModifiees],
      ['absence(s) déclarée(s)', absences], ['entretien(s) tenu(s)', entretiens],
      ['candidature(s) reçue(s)', candidatures]]))}

    ${section('Communication et enseignants', chiffres([
      ['communication(s) diffusée(s)', comms], ['document(s) envoyé(s) par courriel', mails],
      [`note(s) proposée(s) par ${notesProp.p || 0} enseignant(s)`, notesProp.n]]))}

    <p class="fin pied">Rapport établi le ${fr(aujourdhui)} à partir des données de Lucie. Les notes confidentielles
      des réunions et le contenu des dossiers de suivi n’y figurent pas.</p>`;

  const titre = `Rapport d’activité — ${moisLibelle(mois)}`;
  return {
    titre,
    nom: `Rapport_activite_${mois}.html`,
    html: envelopperDocument({ html: corps, titre, styles: STYLE_PV + `
      table.bref { width: 100%; margin: 0 0 6mm; border-collapse: separate; border-spacing: 1.5mm 0; }
      table.bref td { border: 0.4pt solid #cbd5e1; border-radius: 1.5mm; padding: 2.5mm 2mm; text-align: center; width: 16.6%; }
      table.bref .n { font-size: 16pt; font-weight: 700; color: #1B2B4B; line-height: 1.1; }
      table.bref .k { font-size: 7.5pt; color: #64748b; margin-top: .8mm; }
      .bloc { margin: 0 0 5mm; }
      .bloc h3 { border-bottom: 0.8pt solid #cbd5e1; padding-bottom: 1mm; margin-bottom: 2mm; }
      p.qui { margin: 2mm 0 .5mm; }
      ul { margin: 0 0 1.5mm 5mm; } li { font-size: 9pt; }
      table.lst { width: 100%; } table.lst td { font-size: 9pt; vertical-align: top; }
      table.lst td.d { width: 20mm; color: #475569; white-space: nowrap; }
      table.lst td.c { width: 45mm; text-align: right; color: #334155; }
      .pied { margin-top: 6mm; }` }),
  };
}

const moisValide = m => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(m || ''));

r.post('/rapport-mensuel', authRequired,
  roleRequired('admin', 'directeur', 'directeur_adjoint'), (req, res) => {
    const mois = req.body?.mois;
    if (!moisValide(mois)) return res.status(400).json({ error: 'mois attendu au format AAAA-MM' });
    res.json(construireRapportMensuel(mois));
  });

/**
 * LE 1er DU MOIS, LE RAPPORT DU MOIS ÉCOULÉ PART À LA DIRECTION.
 *
 * Une fois par mois, et une seule : l'envoi est noté (rapport_mensuel_envoi),
 * si bien qu'un redémarrage du serveur ne le renvoie pas. Sans expéditeur
 * configuré, rien ne part — le rapport reste à produire d'un bouton.
 */
export async function envoyerRapportMensuelSiDu(maintenant = new Date()) {
    db.exec(`CREATE TABLE IF NOT EXISTS rapport_mensuel_envoi (
      mois TEXT PRIMARY KEY, envoye_le TEXT DEFAULT (datetime('now')),
      destinataires TEXT, statut TEXT)`);
    try {
      if (!mailerConfigure()) return { statut: 'sans_expediteur' };
      const d = maintenant;
      // LA PREMIÈRE SEMAINE SEULEMENT : le 1er, ou dès que le serveur revient
      // s'il était arrêté ce jour-là. Mis en service un 24, il n'envoie pas
      // aussitôt le rapport d'un mois déjà loin.
      if (d.getUTCDate() > 7) return { statut: 'hors_periode' };
      const prec = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
      const mois = `${prec.getUTCFullYear()}-${String(prec.getUTCMonth() + 1).padStart(2, '0')}`;
      if (db.prepare('SELECT 1 FROM rapport_mensuel_envoi WHERE mois = ?').get(mois)) return { statut: 'deja', mois };
      const dest = db.prepare(`SELECT email FROM utilisateur WHERE actif = 1 AND email LIKE '%@%'
        AND role IN ('admin','directeur','directeur_adjoint')`).all().map(x => x.email);
      if (!dest.length) return { statut: 'sans_destinataire', mois };
      // On réserve le mois AVANT d'envoyer : deux passes simultanées ne
      // doivent pas produire deux courriels.
      db.prepare('INSERT INTO rapport_mensuel_envoi (mois, destinataires, statut) VALUES (?,?,?)')
        .run(mois, dest.join(', '), 'en_cours');
      const rap = construireRapportMensuel(mois);
      let pieces = [];
      try {
        const pdf = await rendrePdf(rap.html, { pagination: 'si-plusieurs' });
        pieces = [{ filename: `Rapport_activite_${mois}.pdf`, content: pdf, contentType: 'application/pdf' }];
      } catch {
        pieces = [{ filename: rap.nom, content: Buffer.from(rap.html, 'utf8'), contentType: 'text/html' }];
      }
      const env = await envoyerEmail({
        to: dest, subject: `Lucie — ${rap.titre}`,
        html: `<p>Bonjour,</p><p>Vous trouverez en pièce jointe le rapport d’activité de ${moisLibelle(mois)} :
          réunions, tâches faites et en retard, étudiants, délibérations, valorisations, personnel.</p>
          <p>Il se reproduit à tout moment dans Lucie : Suivi d’équipe → Rapport du mois.</p>`,
        attachments: pieces,
      });
      db.prepare('UPDATE rapport_mensuel_envoi SET statut = ?, envoye_le = datetime(\'now\') WHERE mois = ?')
        .run(env.ok ? (env.simule ? 'simule' : 'envoye') : `erreur : ${env.erreur || ''}`, mois);
      // Un échec se retente à la passe suivante.
      if (!env.ok) db.prepare('DELETE FROM rapport_mensuel_envoi WHERE mois = ?').run(mois);
      console.log(`[rapport mensuel] ${mois} → ${dest.length} destinataire(s) : ${env.ok ? 'envoyé' : env.erreur}`);
      return { statut: env.ok ? 'envoye' : 'erreur', mois, destinataires: dest, erreur: env.erreur };
    } catch (e) { console.error('[rapport mensuel] :', e.message); return { statut: 'erreur', erreur: e.message }; }
}

export function planifierRapportMensuel() {
  const passe = () => { envoyerRapportMensuelSiDu(); };
  setTimeout(passe, 60_000).unref?.();
  setInterval(passe, 6 * 3600 * 1000).unref?.();
}

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
  h3 { font-size: 10.5pt; margin: 0 0 1.2mm; letter-spacing: -.1pt; }
  p { margin: 0 0 1.2mm; font-size: 9.5pt; line-height: 1.4; }
  ol, ul { margin: 1mm 0 2mm 5mm; padding: 0; }
  li { margin: .8mm 0; font-size: 9pt; }
  table { margin: 0 0 2mm; }
  th, td { border: 0; padding: 1.6mm 2mm; font-size: 8.5pt;
           border-bottom: 0.3pt solid #e2e8f0; }
  th { background: transparent; color:#64748b; font-size: 7.5pt;
       border-bottom: 0.8pt solid #cbd5e1; }
  tbody tr:last-child td { border-bottom: 0; }
  /* Le cartouche : quand, où, qui — en deux colonnes, sans cadre. */
  table.cartouche { width: 100%; margin: 0 0 5mm; border-top: 0.8pt solid #cbd5e1;
                    border-bottom: 0.8pt solid #cbd5e1; }
  table.cartouche th { width: 28mm; text-align: left; color:#64748b; font-size: 8pt;
                       font-weight: 600; border-bottom: 0; padding: 1.2mm 2mm 1.2mm 0; vertical-align: top; }
  table.cartouche td { font-size: 9pt; border-bottom: 0; padding: 1.2mm 0; }
  .point { margin: 0 0 4.5mm; page-break-inside: avoid; }
  /* Les décisions : une ligne chacune, sans en-tête de tableau. */
  table.dec { width: 100%; margin: 1mm 0 0; }
  table.dec td { font-size: 9pt; padding: 1mm 1.5mm; border-bottom: 0.3pt solid #eef2f6; vertical-align: top; }
  table.dec td.fl { width: 4mm; color: #1a9aa0; font-weight: 700; padding-left: 0; }
  table.dec td.qui { width: 38mm; color: #334155; }
  table.dec td.date { width: 22mm; color: #475569; white-space: nowrap; }
  table.dec td.etat { width: 16mm; color: #64748b; font-size: 8pt; white-space: nowrap; }
  .suite { margin-top: 5mm; padding-top: 2mm; border-top: 0.8pt solid #cbd5e1; font-size: 9.5pt; }`;

export default r;
