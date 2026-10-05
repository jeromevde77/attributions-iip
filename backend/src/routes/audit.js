// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Qui a fait quoi
//
// Sept registres existaient, et pas un seul ne répondait à la question qu'on
// se pose réellement après coup : « qu'a fait cette personne ? ». Tous sont
// rangés par OBJET — cette attribution, ce dossier de valorisation, ce compte.
// Pour savoir ce qu'une coordination a validé en septembre, il fallait ouvrir
// les dossiers un par un, c'est-à-dire ne jamais le savoir.
//
// C'est la demande de Charles après l'attestation erronée : « je veux des
// traces ». Les traces existaient ; ce qui manquait, c'était la LENTILLE.
//
// AUCUN REGISTRE N'EST CRÉÉ ICI, et c'est délibéré. Un huitième journal serait
// une source de plus à tenir, et la première à diverger. Cet écran ne fait que
// réunir ce qui s'écrit déjà.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, administrateurSeul } from '../middleware/auth.js';

const r = Router();

/*
 * L'IDENTITÉ SE RÉSOUT SUR L'IDENTIFIANT, JAMAIS SUR LE NOM.
 *
 * La même personne s'écrit de trois façons selon le registre : « Charles
 * Sohet » avec une espace initiale, « LAMBERT Marie » nom d'abord, et
 * « charles.sohet@institut-prigogine.be » pour les procédures. Filtrer par nom
 * aurait donc rendu une partie des gestes de quelqu'un et tu — sans rien dire —
 * le reste : le pire résultat possible pour un écran d'audit, puisqu'il a
 * l'air complet.
 *
 * Tous les registres portent un identifiant, sauf `procedure_archive` qui
 * porte l'ADRESSE : on la rattache par jointure, et ce qui ne se rattache pas
 * reste affiché sous le libellé brut plutôt que d'être écarté.
 */
const SOURCES = [
  {
    cle: 'attributions',
    sql: `SELECT s.created_at AS quand, s.utilisateur_id AS qui_id, s.utilisateur_nom AS qui_nom,
                 'attributions' AS registre, s.action AS geste,
                 -- nom_cours N'EXISTE PAS dans ces snapshots : ils portent
                 -- code_cours (« 263.1 »). Vérifié sur les données, après
                 -- avoir affiché « attribution #4021 » pour tout le monde.
                 COALESCE(json_extract(s.snapshot,'$.nom_cours'),
                          json_extract(s.snapshot,'$.code_cours'),
                          'attribution #'||s.attribution_id) AS objet,
                 json_extract(s.snapshot,'$.section') AS section,
                 json_extract(s.snapshot,'$.annee_scolaire') AS annee,
                 NULL AS detail
          FROM attribution_snapshot s`,
  },
  {
    // LE REGISTRE QUI N'AVAIT AUCUNE PORTE. Il s'écrit depuis 2.12.38 et
    // aucune route ne le lisait : vingt et une lignes sur le circuit de
    // valorisation — celui-là même né de l'attestation erronée — dormaient
    // sans que personne puisse les consulter.
    cle: 'valorisation',
    sql: `SELECT j.horodatage AS quand, j.acteur_id AS qui_id, j.acteur_nom AS qui_nom,
                 'valorisation' AS registre, j.etape AS geste,
                 COALESCE(e.nom||' '||e.prenom, 'dossier #'||j.valorisation_id) AS objet,
                 NULL AS section, v.annee_scolaire AS annee, j.detail
          FROM valorisation_journal j
          LEFT JOIN etudiant_valorisation v ON v.id = j.valorisation_id
          LEFT JOIN etudiant e ON e.id = v.etudiant_id`,
  },
  {
    // Les cases de parcours déplacées d'une année à l'autre (2.12.192) : une
    // décision notifiée peut changer d'année, jamais sans trace.
    cle: 'parcours',
    sql: `SELECT d.horodatage AS quand, d.acteur_id AS qui_id, d.acteur_nom AS qui_nom,
                 'parcours' AS registre, 'déplacement' AS geste,
                 COALESCE(e.nom||' '||e.prenom, 'étudiant #'||d.etudiant_id)||' · UE '||d.ue_num AS objet,
                 NULL AS section, d.vers AS annee,
                 d.de||' → '||d.vers||' · '||d.motif AS detail
          FROM etudiant_deplacement d
          LEFT JOIN etudiant e ON e.id = d.etudiant_id`,
  },
  {
    // Le compte CONCERNÉ n'est pas l'acteur : réinitialiser le second facteur
    // de quelqu'un, c'est un geste posé SUR lui, par un autre.
    cle: 'comptes',
    sql: `SELECT m.cree_le AS quand, m.acteur_id AS qui_id,
                 COALESCE(m.acteur_nom, 'ligne de commande') AS qui_nom,
                 'comptes' AS registre, m.evenement AS geste,
                 COALESCE(u.email, 'compte #'||m.utilisateur_id) AS objet,
                 NULL AS section, NULL AS annee, m.detail
          FROM mfa_journal m
          LEFT JOIN utilisateur u ON u.id = m.utilisateur_id`,
  },
  {
    cle: 'procedures',
    sql: `SELECT p.cree_le AS quand, ua.id AS qui_id, COALESCE(ua.nom_complet, p.cree_par) AS qui_nom,
                 'procedures' AS registre, COALESCE(p.type,'procédure') AS geste,
                 COALESCE(p.etudiant, p.ue_nom, 'dossier #'||p.id) AS objet,
                 p.section, p.annee_scolaire AS annee, p.statut AS detail
          FROM procedure_archive p
          LEFT JOIN utilisateur ua ON lower(ua.email) = lower(p.cree_par)`,
  },
  {
    cle: 'dossiers',
    sql: `SELECT jp.cree_le AS quand, jp.auteur_user_id AS qui_id, jp.auteur AS qui_nom,
                 'dossiers' AS registre, 'note au dossier' AS geste,
                 COALESCE(pr.nom||' '||pr.prenom, 'personne #'||jp.professeur_id) AS objet,
                 NULL AS section, NULL AS annee,
                 CASE WHEN jp.confidentiel THEN 'confidentiel' ELSE NULL END AS detail
          FROM journal_personnel jp
          LEFT JOIN professeur pr ON pr.id = jp.professeur_id`,
  },
  /* LE TRAVAIL COURANT DU SECRÉTARIAT (3.1.43, Charles, 5 octobre 2026 : « je
     ne vois aucun geste de Florian ni de Mélina, pourtant ils ont travaillé »).
     Les envois, les PAE validés, les décisions de délibération… s'écrivaient
     dans leurs registres sans qu'aucun ne soit lu ici. */
  {
    cle: 'envois',
    sql: `SELECT m.envoye_le AS quand, NULL AS qui_id, m.envoye_par AS qui_nom,
                 'envois' AS registre, CASE WHEN m.statut = 'envoye' THEN 'envoi' ELSE 'envoi en échec' END AS geste,
                 COALESCE(m.destinataire_nom, m.email)||' · '||m.sujet AS objet,
                 NULL AS section, NULL AS annee, m.reference AS detail
          FROM envoi_mail m`,
  },
  {
    cle: 'pae',
    sql: `SELECT r.revu_le AS quand, NULL AS qui_id, r.revu_par AS qui_nom,
                 'pae' AS registre, 'PAE validé' AS geste,
                 COALESCE(e.nom||' '||e.prenom, 'étudiant #'||r.etudiant_id) AS objet,
                 NULL AS section, r.annee_scolaire AS annee, NULL AS detail
          FROM pae_revue r LEFT JOIN etudiant e ON e.id = r.etudiant_id
          UNION ALL
          SELECT d.le, NULL, d.par, 'pae', 'dérogation au PAE',
                 COALESCE(e.nom||' '||e.prenom, 'étudiant #'||d.etudiant_id)||' · UE '||d.ue_num,
                 NULL, d.annee_scolaire, d.regle||COALESCE(' — '||d.motif, '')
          FROM pae_derogation d LEFT JOIN etudiant e ON e.id = d.etudiant_id`,
  },
  {
    cle: 'deliberation',
    sql: `SELECT r.decide_le AS quand, NULL AS qui_id, r.decide_par AS qui_nom,
                 'deliberation' AS registre, 'décision : '||COALESCE(r.resultat, '—') AS geste,
                 COALESCE(e.nom||' '||e.prenom, 'étudiant #'||r.etudiant_id)||' · UE '||r.ue_num||' · S'||r.session AS objet,
                 NULL AS section, r.annee_scolaire AS annee, NULL AS detail
          FROM deliberation_resultat r LEFT JOIN etudiant e ON e.id = r.etudiant_id
          UNION ALL
          SELECT a.maj_le, NULL, a.maj_par, 'deliberation', a.action||' ('||a.portee||')',
                 COALESCE(e.nom||' '||e.prenom, 'étudiant #'||a.etudiant_id)||' · UE '||a.ue_num||' · '||a.code,
                 NULL, a.annee_scolaire, NULL
          FROM deliberation_ajustement a LEFT JOIN etudiant e ON e.id = a.etudiant_id`,
  },
  {
    cle: 'procedures',   // le registre RDE (3.1.x) rejoint celui des anciens dossiers
    sql: `SELECT p.le AS quand, p.par_id AS qui_id, p.par_nom AS qui_nom,
                 'procedures' AS registre, 'étape : '||p.etape AS geste,
                 COALESCE(e.nom||' '||e.prenom, 'dossier #'||p.dossier_id) AS objet,
                 d.section, d.annee_scolaire AS annee, CASE WHEN p.donnees IS NULL THEN 'retirée' END AS detail
          FROM proc_etape p LEFT JOIN proc_dossier d ON d.id = p.dossier_id LEFT JOIN etudiant e ON e.id = d.etudiant_id`,
  },
  {
    cle: 'conventions',
    sql: `SELECT j.horodatage AS quand, j.acteur_id AS qui_id, j.acteur_nom AS qui_nom,
                 'conventions' AS registre, j.geste, 'convention #'||j.convention_id AS objet,
                 NULL AS section, NULL AS annee, j.detail
          FROM convention_journal j`,
  },
  {
    cle: 'presences',
    sql: `SELECT j.le AS quand, NULL AS qui_id, j.par AS qui_nom,
                 'presences' AS registre, 'présence : '||COALESCE(j.apres, '—') AS geste,
                 COALESCE(e.nom||' '||e.prenom, 'étudiant #'||j.etudiant_id)||' · séance #'||j.seance_id AS objet,
                 NULL AS section, NULL AS annee, j.motif AS detail
          FROM presence_journal j LEFT JOIN etudiant e ON e.id = j.etudiant_id`,
  },
  {
    cle: 'suivi',
    sql: `SELECT s.cree_le AS quand, s.cree_par_id AS qui_id, s.cree_par AS qui_nom,
                 'suivi' AS registre, 'note de suivi' AS geste,
                 COALESCE(e.nom||' '||e.prenom, 'étudiant #'||s.etudiant_id) AS objet,
                 NULL AS section, NULL AS annee, NULL AS detail
          FROM etudiant_suivi s LEFT JOIN etudiant e ON e.id = s.etudiant_id`,
  },
  {
    cle: 'documents',
    sql: `SELECT d.genere_le AS quand, NULL AS qui_id, d.genere_par AS qui_nom,
                 'documents' AS registre, COALESCE(d.type_doc,'pièce') AS geste,
                 COALESCE(d.nom_fichier, d.prof_nom) AS objet,
                 NULL AS section, d.annee_scolaire AS annee, NULL AS detail
          FROM document_archive d`,
  },
];

/**
 * L'AUDIT EST RÉSERVÉ AU RÔLE `admin`, ET À LUI SEUL.
 *
 * Il dit qui a fait quoi, et cela vaut pour TOUT LE MONDE — direction
 * comprise : c'est un pouvoir de contrôle, pas un écran de travail. Un écran
 * qui montre les gestes de chacun doit être tenu par le moins de mains
 * possible, et surtout pas par celles qu'il surveille.
 *
 * `niveauDirection` aurait été plus large — il ouvre au directeur et à son
 * adjoint, qui figurent parmi les personnes listées ici. Tranché par Jérôme :
 * l'administrateur seul.
 */
r.get('/', authRequired, administrateurSeul, (req, res) => {
  const { qui, depuis, jusqu, registre, limit = 300 } = req.query;

  const parties = [];
  for (const s of SOURCES) {
    if (registre && registre !== s.cle) continue;
    try {
      // Chaque source est interrogée SÉPARÉMENT et ses échecs sont absorbés :
      // une table absente — `document_archive` sur une base ancienne — ne doit
      // pas vider l'écran entier et faire croire qu'il ne s'est rien passé.
      const lignes = db.prepare(s.sql).all();
      parties.push(...lignes);
    } catch (e) {
      console.error(`[audit] source ${s.cle} :`, e.message);
    }
  }

  /* UN NOM OU UNE ADRESSE SE RATTACHE À SON COMPTE. Plusieurs registres ne
     gardent que « DAELEMAN Florian », « Charles Sohet » ou l'adresse : sans ce
     rattachement, choisir une personne écartait tous ces gestes-là. On
     reconnaît le nom complet dans les deux ordres, et l'adresse. */
  const norm = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9@.]+/g, ' ').trim();
  const comptes = new Map();
  try {
    for (const u of db.prepare('SELECT id, nom_complet, email FROM utilisateur').all()) {
      const mots = norm(u.nom_complet).split(' ').filter(Boolean);
      if (mots.length) { comptes.set(mots.join(' '), u.id); comptes.set([...mots].reverse().join(' '), u.id);
        if (mots.length > 2) comptes.set([...mots.slice(1), mots[0]].join(' '), u.id); }
      if (u.email) comptes.set(norm(u.email), u.id);
    }
  } catch { /* table absente */ }
  for (const l of parties) {
    if (l.qui_id == null && l.qui_nom) { const id = comptes.get(norm(l.qui_nom)); if (id != null) l.qui_id = id; }
  }

  const q = qui ? String(qui) : null;
  const filtre = parties.filter(l => {
    if (!l.quand) return false;
    if (depuis && String(l.quand) < String(depuis)) return false;
    if (jusqu && String(l.quand) > String(jusqu) + ' 23:59:59') return false;
    if (q) {
      // Sur l'identifiant quand on l'a, sur le libellé sinon : un geste posé
      // en ligne de commande n'a pas d'identifiant, et il doit rester visible.
      if (String(l.qui_id ?? '') === q) return true;
      return String(l.qui_nom || '').toLowerCase().includes(q.toLowerCase());
    }
    return true;
  });

  filtre.sort((a, b) => String(b.quand).localeCompare(String(a.quand)));

  // QUI A AGI, indépendamment de la façon dont chaque registre l'écrit : c'est
  // ce qui permet de choisir une personne sans avoir à deviner son orthographe.
  const gens = new Map();
  for (const l of filtre) {
    const cle = l.qui_id != null ? `id:${l.qui_id}` : `nom:${l.qui_nom}`;
    const e = gens.get(cle) || { id: l.qui_id ?? null, nom: l.qui_nom, gestes: 0 };
    e.gestes++;
    gens.set(cle, e);
  }

  res.json({
    total: filtre.length,
    tronque: filtre.length > Number(limit),
    lignes: filtre.slice(0, Number(limit)),
    personnes: [...gens.values()].sort((a, b) => b.gestes - a.gestes),
    registres: [...new Set(SOURCES.map(s => s.cle))].map(cle => ({ cle }) ).map(s => ({
      cle: s.cle,
      gestes: parties.filter(l => l.registre === s.cle).length,
    })),
  });
});

export default r;
