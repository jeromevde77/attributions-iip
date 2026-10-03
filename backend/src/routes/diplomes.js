// ─────────────────────────────────────────────────────────────────────────────
// Lucie — La liste des étudiants diplômés
//
// Le document que la Fédération réclame en fin de cycle : nom, prénom et
// initiales des autres prénoms, lieu et date de naissance, genre. Il se tapait
// à la main dans un Word recopié d'année en année, en relisant les dossiers un
// par un pour savoir qui avait terminé.
//
// Lucie sait déjà qui a réussi quoi. Elle PROPOSE donc les diplômables — ceux
// dont toutes les unités de la section sont acquises — et c'est la direction
// qui arrête la liste. La proposition n'engage rien : une valorisation, une
// dispense ou une unité d'un autre millésime peuvent échapper au calcul, et
// c'est le Conseil qui délivre le titre, pas une requête.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired, getUserSections } from '../middleware/auth.js';
import { gesteRequis } from '../lib/gestes.js';
import { anneeDeTravail } from '../helpers/annee.js';
import { envelopper } from './attestations.js';
import { enteteDocument } from '../lib/document.js';
import { identiteEtablissement } from './config.js';
import { calculerMention, reglesMention } from '../lib/mention.js';
import { presidenceConseil } from './acquis.js';

const r = Router();

const esc = s => String(s ?? '').replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// « le 1 janvier 2002 » — la forme du document officiel, en toutes lettres.
function enToutesLettres(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  return `le ${Number(m[3])} ${MOIS[Number(m[2]) - 1]} ${m[1]}`;
}

// Le genre attendu par la Fédération : H, F ou X. Lucie ne tient qu'une
// civilité ; on la traduit, et l'on n'invente rien quand elle manque.
function genre(titre) {
  const t = String(titre || '').trim().toLowerCase();
  if (/^(m|mr|monsieur)\.?$/.test(t)) return 'H';
  if (/^(mme|mlle|madame|mademoiselle)\.?$/.test(t)) return 'F';
  return '';
}

/**
 * LES UNITÉS QUE LA SECTION EXIGE, POUR UN MILLÉSIME DONNÉ.
 *
 * Le rattachement explicite (ue_section) fait foi quand il existe : une unité
 * peut servir plusieurs sections. À défaut, la colonne section de l'unité.
 *
 * L'ANNÉE EST DÉTERMINANTE, et son oubli a longtemps vidé cette liste de tout
 * candidat : ue_section est tenue par millésime, si bien qu'interroger la table
 * sans année renvoyait la RÉUNION de toutes les grilles jamais organisées. Une
 * unité supprimée du programme en 2019 restait alors exigée, et plus personne
 * n'avait « tout réussi ». On prend donc la grille de l'année demandée, et à
 * défaut la dernière grille renseignée avant elle.
 */
/* UN TITRE QUE L'IIP NE DÉLIVRE PAS (Charles, 30 septembre 2026 : l'Orthoptie
   suit le tronc commun chez nous, mais c'est la HELB qui délivre les papiers).
   Une case sur la section, pas un nom écrit dans le code : le jour où une autre
   section est dans ce cas, il suffit de la cocher. */
try { db.exec('ALTER TABLE section ADD COLUMN titre_externe INTEGER NOT NULL DEFAULT 0'); } catch { /* déjà là */ }
function titreExterne(sectionCode) {
  try { return !!db.prepare('SELECT titre_externe FROM section WHERE code = ?').get(sectionCode)?.titre_externe; }
  catch { return false; }
}
const REFUS_TITRE_EXTERNE = s0 => ({ error: `Le titre de la section ${s0} est délivré par un autre établissement : `
  + "l'IIP n'en fait ni la diplomation, ni les pièces de section (Organisation → Unités et cours → la section).", titre_externe: true });

/* LES UE PROPRES DE LA SECTION ET SES UE RATTACHÉES, ENSEMBLE (30 septembre
   2026). Les rattachements REMPLAÇAIENT les UE propres dès qu'il en existait
   un : enregistrer la composition d'une section avec une seule UE partagée
   aurait réduit son diplôme à cette UE. */
function unitesDeLaSection(sectionCode, annee) {
  const propres = db.prepare('SELECT DISTINCT ue_num FROM ue WHERE section = ? AND annee_scolaire = ?')
    .all(sectionCode, annee).map(x => x.ue_num);
  return [...new Set([...propres, ...rattacheesDeLaSection(sectionCode, annee)])].sort((a, b) => a - b);
}
function rattacheesDeLaSection(sectionCode, annee) {
  const parAnnee = db.prepare(`
    SELECT DISTINCT ue_num FROM ue_section
    WHERE section_code = ? AND annee_scolaire = ?
  `).all(sectionCode, annee).map(x => x.ue_num);
  if (parAnnee.length) return parAnnee;

  const derniere = db.prepare(`
    SELECT MAX(annee_scolaire) AS a FROM ue_section
    WHERE section_code = ? AND annee_scolaire <= ?
  `).get(sectionCode, annee)?.a
    || db.prepare('SELECT MAX(annee_scolaire) AS a FROM ue_section WHERE section_code = ?')
      .get(sectionCode)?.a;
  if (derniere) {
    const l = db.prepare(`
      SELECT DISTINCT ue_num FROM ue_section
      WHERE section_code = ? AND annee_scolaire = ?
    `).all(sectionCode, derniere).map(x => x.ue_num);
    if (l.length) return l;
  }
  return db.prepare('SELECT DISTINCT ue_num FROM ue WHERE section = ?')
    .all(sectionCode).map(x => x.ue_num);
}

/**
 * L'ÉPREUVE INTÉGRÉE DE LA SECTION.
 *
 * C'est elle qui sanctionne la section : on ne s'y présente qu'après le reste,
 * et le jury qui la délibère est celui qui confère le grade. L'étudiant qui l'a
 * réussie a donc terminé, même quand le décompte des unités ne tombe pas juste
 * — une valorisation, une dispense ou une unité d'un millésime abandonné
 * échappent au calcul, jamais au jury.
 */
function epreuveIntegreeDe(unites) {
  if (!unites.length) return null;
  const m = unites.map(() => '?').join(',');
  return db.prepare(`
    SELECT ue_num FROM ue WHERE ue_num IN (${m}) AND is_epreuve_integree = 1
    ORDER BY annee_scolaire DESC LIMIT 1
  `).get(...unites)?.ue_num ?? null;
}

/**
 * LES CANDIDATS AU DIPLÔME.
 *
 * On regarde TOUT le parcours, non la seule année en cours : un cycle
 * s'étale sur plusieurs millésimes, et l'étudiant qui a fini cette année a
 * réussi le gros de ses unités les années précédentes.
 */
/* LES DONNÉES DE SECTION DU DIPLÔME — UNE FONCTION, DEUX LECTEURS (le diplôme
 * produit et l'aperçu de l'éditeur). Elles vivaient à deux endroits : la table
 * des sections (où le « grade » ne dit que « Bachelier ») et Configuration →
 * Attestation → Sections & Diplômes, qui porte l'intitulé du titre, le code
 * approuvé, les ECTS, la date d'approbation et la durée — et que le diplôme ne
 * lisait pas. La fiche d'attestation fait foi ; la table sert de repli. La
 * fiche se reconnaît par sa section Lucie, sinon par son code FWB. */
const sansAccents = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
export function donneesSectionDiplome(code) {
  const sec = db.prepare(`SELECT code, libelle, niveau, code_fwb, domaine, type_enseignement
    FROM section WHERE code = ?`).get(code) || { code };
  let fiches = [];
  try { fiches = JSON.parse(db.prepare("SELECT valeur FROM lucie_config WHERE cle = 'attestation_sections'").get()?.valeur || '[]') || []; } catch { fiches = []; }
  const f = fiches.find(x => x.ue_section && x.ue_section === sec.code)
    || fiches.find(x => sec.code_fwb && x.code === sec.code_fwb)
    || fiches.find(x => sansAccents(x.section).endsWith(sansAccents(sec.libelle || sec.code)))
    || {};
  return {
    code: sec.code, libelle: sec.libelle,
    intitule_section: f.section || sec.libelle,
    grade_academique: f.grade_academique || f.diplome || sec.niveau || '',
    code_section: f.code || sec.code_fwb || '',
    domaine: f.domaine || sec.domaine || '',
    date_approbation: f.date_approbation || '',
    duree_annees: f.duree_annees || '',
    total_ects: f.ects || '',
    total_periodes: f.periodes || '',
    intitule_diplome: f.diplome || f.grade_academique || f.section || sec.libelle || '',
    type_enseignement: sec.type_enseignement || '',
    fiche_trouvee: !!f.code,
  };
}
r.get('/donnees-section', authRequired, (req, res) => {
  if (!req.query.section) return res.status(400).json({ error: 'section requise' });
  res.json(donneesSectionDiplome(String(req.query.section)));
});

r.get('/candidats', authRequired, (req, res) => {
  const annee = req.query.annee || anneeDeTravail(req);
  const section = req.query.section;
  if (!section) return res.status(400).json({ error: 'section requise' });
  if (titreExterne(section)) return res.status(409).json(REFUS_TITRE_EXTERNE(section));

  const perim = getUserSections(req.user);
  if (perim && !perim.includes(section)) {
    return res.status(403).json({ error: 'section hors de votre périmètre' });
  }

  const sec = db.prepare('SELECT code, libelle, niveau, code_fwb, domaine FROM section WHERE code = ?')
    .get(section) || { code: section };
  const requises = unitesDeLaSection(section, annee);
  if (!requises.length) {
    return res.json({ annee, section: sec, requises: [], candidats: [],
      avertissement: "Aucune unité n'est rattachée à cette section." });
  }
  const marques = requises.map(() => '?').join(',');

  // Tout étudiant ayant touché à une unité de la section, où qu'il en soit.
  const etudiants = db.prepare(`
    SELECT DISTINCT e.id, e.nom, e.prenom, e.titre, e.date_naissance,
           e.lieu_naissance, e.id_ecampus
    FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
    WHERE i.ue_num IN (${marques})
    ORDER BY e.nom, e.prenom
  `).all(...requises);

  const ects = Object.fromEntries(db.prepare(
    `SELECT ue_num, MAX(ects) AS n FROM ue WHERE ue_num IN (${marques}) GROUP BY ue_num`)
    .all(...requises).map(x => [x.ue_num, Number(x.n) || 0]));

  const reussiesDe = db.prepare(`
    SELECT DISTINCT ue_num, MAX(annee_scolaire) AS derniere
    FROM etudiant_inscription
    WHERE etudiant_id = ? AND resultat = 'reussi' AND ue_num IN (${marques})
    GROUP BY ue_num
  `);

  const ei = epreuveIntegreeDe(requises);

  const candidats = etudiants.map(e => {
    const reussies = reussiesDe.all(e.id, ...requises);
    const codes = reussies.map(x => x.ue_num);
    const manquantes = requises.filter(u => !codes.includes(u));
    // L'année de fin : le millésime de la dernière unité acquise.
    // L'année de fin : celle de l'épreuve intégrée quand elle est réussie —
    // c'est elle qui clôt le cycle — sinon le millésime de la dernière unité.
    const anEI = ei ? reussies.find(x => x.ue_num === ei)?.derniere : null;
    const fin = anEI || reussies.map(x => x.derniere).sort().pop() || null;
    const integree = !!anEI;
    return {
      ...e,
      genre: genre(e.titre),
      reussies: codes.length,
      total: requises.length,
      manquantes,
      ects: codes.reduce((n, u) => n + (ects[u] || 0), 0),
      // Complet par le décompte OU par l'épreuve intégrée : le jury a tranché.
      complet: manquantes.length === 0 || integree,
      toutes_unites: manquantes.length === 0,
      integree,
      annee_fin: fin,
      // Ce qui empêcherait le document d'être juste, dit avant de l'imprimer.
      manques: [
        !e.date_naissance && 'date de naissance',
        !e.lieu_naissance && 'lieu de naissance',
        !genre(e.titre) && 'genre',
      ].filter(Boolean),
    };
  })
    // SEULS LES PARCOURS COMPLETS. Un diplôme ne se délivre pas à moitié :
    // faire défiler ceux qui n'ont pas tout acquis, c'est offrir de les cocher,
    // et c'est le genre d'erreur qu'un document officiel ne pardonne pas.
    .filter(c => c.complet);

  res.json({
    annee, section: sec, requises, epreuve_integree: ei,
    ects_total: requises.reduce((n, u) => n + (ects[u] || 0), 0),
    candidats,
    // Cochés d'office : ceux qui ont TERMINÉ cette année. Les diplômés des
    // années précédentes restent listés — on réédite parfois une liste — mais
    // décochés, pour ne pas les glisser par inadvertance dans celle-ci.
    proposes: candidats.filter(c => c.annee_fin === annee).map(c => c.id),
  });
});

/* ═══ LE DOSSIER DE DIPLOMATION ═══════════════════════════════════════════
 *
 * Ce que la route « candidats » dit déjà : qui a terminé. Ce qu'elle ne disait
 * pas : SUR QUOI. Or un diplôme porte une mention, et cette mention se calcule
 * sur les unités déterminantes et l'épreuve intégrée — des cotes qui, jusqu'ici,
 * se retapaient à la main dans un écran, à côté de celles que le Conseil avait
 * arrêtées, sans que rien ne garantisse qu'elles concordent.
 *
 * Elles viennent désormais d'où elles doivent venir : la délibération.
 */

/** Les unités déterminantes de la section, avec leurs périodes. */
/* LE POIDS D'UNE UNITÉ DÉTERMINANTE (Charles, 2 octobre 2026) : « pondération
 * sur base des périodes des étudiants — TOUTE l'UE — des UE déterminantes =
 * 2/3 ; TFE = 1/3 ». Les périodes étudiant ET l'autonomie : 64 + 16 = 80 pour
 * une unité de cours, 600 pour le stage. Deux calculs coexistaient — la
 * diplomation lisait les périodes étudiant sans l'autonomie, le PV de section
 * les périodes professeur plus l'autonomie — : le PV et le diplôme pouvaient
 * porter deux mentions. Une seule expression, ici, pour les deux. */
const POIDS_DETERMINANTE = 'MAX(COALESCE(ue_per_etudiants, 0)) + MAX(COALESCE(ue_aut, 0))';
function determinantesDe(unites, annee) {
  if (!unites.length) return [];
  const m = unites.map(() => '?').join(',');
  return db.prepare(`
    SELECT ue_num,
           ${POIDS_DETERMINANTE} AS periodes,
           (SELECT ue_nom FROM ue x WHERE x.ue_num = u.ue_num AND x.ue_nom IS NOT NULL
             ORDER BY (x.annee_scolaire = ?) DESC, x.annee_scolaire DESC LIMIT 1) AS ue_nom
    FROM ue u
    WHERE ue_num IN (${m}) AND ue_det = 'x'
    GROUP BY ue_num ORDER BY ue_num
  `).all(annee, ...unites);
}

/**
 * LA COTE D'UNE UNITÉ, TELLE QUE LE CONSEIL L'A ARRÊTÉE.
 *
 * La trace de séance fait foi ; le dossier de l'étudiant ne la complète que là
 * où elle se tait — une année reprise d'un classeur ne porte sa décision qu'au
 * dossier. Entre deux sessions, la plus avancée l'emporte : c'est septembre qui
 * clôt l'affaire quand septembre a eu lieu.
 */
function coteArretee(etudId, ueNum) {
  const t = db.prepare(`
    SELECT points, annee_scolaire, session FROM deliberation_resultat
    WHERE etudiant_id = ? AND ue_num = ? AND resultat = 'reussi' AND points IS NOT NULL
    ORDER BY annee_scolaire DESC, session DESC LIMIT 1
  `).get(etudId, ueNum);
  if (t) {
    return { cote: t.points, annee: t.annee_scolaire, session: t.session,
             source: 'seance' };
  }

  const i = db.prepare(`
    SELECT points, annee_scolaire FROM etudiant_inscription
    WHERE etudiant_id = ? AND ue_num = ? AND resultat = 'reussi' AND points IS NOT NULL
    ORDER BY annee_scolaire DESC LIMIT 1
  `).get(etudId, ueNum);
  if (i) {
    return { cote: i.points, annee: i.annee_scolaire, session: null,
             source: 'dossier' };
  }

  return { cote: null, annee: null, session: null, source: null };
}

/**
 * LA SÉANCE QUI A ARRÊTÉ CETTE COTE-LÀ est-elle close ?
 *
 * Celle-là, et non toutes les séances de l'unité. Fin juin, la seconde session
 * est souvent déjà ouverte pour les ajournés : exiger qu'elle soit close aussi
 * marquerait « provisoire » TOUS les dossiers de la section, y compris ceux que
 * le Conseil a définitivement arrêtés en première session. Un avertissement que
 * tout le monde reçoit ne prévient plus personne.
 *
 * Renvoie null quand il n'y a rien à dire : une année reprise d'un classeur
 * porte ses décisions sans séance, et une absence de séance n'est pas une
 * séance ouverte.
 */
function seanceClose(ueNum, annee, session) {
  if (!annee) return null;
  if (session == null) return null;       // décision au dossier : pas de séance
  const s = db.prepare(`
    SELECT cloturee FROM deliberation_seance
    WHERE ue_num = ? AND annee_scolaire = ? AND session = ?
  `).get(ueNum, annee, session);
  return s ? !!s.cloturee : null;
}

/**
 * LE DOSSIER DE DIPLOMATION D'UNE SECTION — extrait de sa route pour servir
 * AUSSI à la production des pièces.
 *
 * Les pièces doivent reposer sur exactement ce que l'écran a montré. Les faire
 * calculer une seconde fois, ailleurs, c'est accepter que les deux calculs
 * divergent un jour — et ce jour-là, c'est un diplôme qui porte une mention
 * que personne n'a vue.
 */
export function dossierDiplomation(section, annee) {
  const sec = db.prepare(`SELECT code, libelle, niveau, code_fwb, domaine,
    type_enseignement FROM section WHERE code = ?`).get(section) || { code: section };
  const requises = unitesDeLaSection(section, annee);
  const ei = epreuveIntegreeDe(requises);
  const det = determinantesDe(requises, annee);
  const periodesEI = ei ? (db.prepare(`SELECT ${POIDS_DETERMINANTE} p FROM ue WHERE ue_num = ?`).get(ei)?.p || null) : null;
  const regles = reglesMention();

  if (!requises.length) {
    return { annee, section: sec, requises: [], determinantes: [], diplomables: [],
      total: { diplomables: 0, provisoires: 0, sans_mention: 0 }, proposes: [],
      avertissement: "Aucune unité n'est rattachée à cette section." };
  }

  const etudiants = db.prepare(`
    SELECT DISTINCT e.id, e.nom, e.prenom, e.titre, e.date_naissance,
           e.lieu_naissance, e.id_ecampus
    FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
    WHERE i.ue_num IN (${requises.map(() => '?').join(',') || 'NULL'})
    ORDER BY e.nom, e.prenom
  `).all(...requises);

  const reussiesDe = db.prepare(`
    SELECT DISTINCT ue_num, MAX(annee_scolaire) AS derniere
    FROM etudiant_inscription
    WHERE etudiant_id = ? AND resultat = 'reussi'
      AND ue_num IN (${requises.map(() => '?').join(',') || 'NULL'})
    GROUP BY ue_num`);

  const diplomables = [];
  for (const e of etudiants) {
    const reussies = reussiesDe.all(e.id, ...requises);
    const codes = reussies.map(x => x.ue_num);
    const anEI = ei ? reussies.find(x => x.ue_num === ei)?.derniere : null;
    const manquantes = requises.filter(u => !codes.includes(u));
    // L'épreuve intégrée réussie vaut parcours complet : le jury a tranché,
    // et une valorisation ou une dispense échappe au décompte, jamais à lui.
    if (!(manquantes.length === 0 || anEI)) continue;

    const lignes = det.map(u => {
      const c = coteArretee(e.id, u.ue_num);
      return { ...u, ...c, close: seanceClose(u.ue_num, c.annee, c.session) };
    });
    // L'ÉPREUVE A SES PÉRIODES, COMME LES AUTRES UNITÉS (2 octobre 2026 : la
    // ligne de l'attestation portait « — » en dur).
    const cEI = ei ? { ue_num: ei, periodes: periodesEI, ...coteArretee(e.id, ei) } : null;
      if (cEI) cEI.close = seanceClose(ei, cEI.annee, cEI.session);

    const m = calculerMention(lignes, cEI?.cote ?? null, regles);

    // CE QUI EMPÊCHERAIT LA PIÈCE D'ÊTRE JUSTE, dit avant de l'imprimer.
    const reserves = [];
    if (!m.complet) {
      if (m.manquantes.length) {
        reserves.push(`${m.manquantes.length} unité(s) déterminante(s) sans cote `
          + `(${m.manquantes.join(', ')}) : la mention est calculée sur le reste`);
      }
      if (m.sans_epreuve) reserves.push("l'épreuve intégrée n'a pas de cote");
    }
    const ouvertes = [...lignes, ...(cEI ? [cEI] : [])]
      .filter(x => x.close === false).map(x => x.ue_num);
    if (ouvertes.length) {
      reserves.push(`séance non clôturée pour ${ouvertes.join(', ')} — la `
        + 'décision peut encore changer');
    }
    for (const c of ['date_naissance', 'lieu_naissance']) {
      if (!e[c]) reserves.push(`${c.replace('_', ' ')} manquant`);
    }
    if (!genre(e.titre)) reserves.push('genre manquant');

    diplomables.push({
      ...e, genre: genre(e.titre),
      annee_fin: anEI || reussies.map(x => x.derniere).sort().pop() || null,
      par_epreuve: !!anEI,
      toutes_unites: manquantes.length === 0,
      determinantes: lignes,
      epreuve: cEI,
      mention: m,
      reserves,
      // Une décision encore ouverte n'interdit pas d'imprimer — la direction
      // tranche —, mais elle doit se voir.
      provisoire: ouvertes.length > 0,
    });
  }

  return {
    annee, section: sec,
    requises, epreuve_integree: ei,
    determinantes: det,
    regles_mention: regles,
    // Une déterminante sans périodes fausse la pondération sans rien dire :
    // on le signale ici, une fois, plutôt que dans chaque dossier.
    determinantes_sans_periodes: det.filter(u => !u.periodes).map(u => u.ue_num),
    diplomables,
    total: {
      diplomables: diplomables.length,
      provisoires: diplomables.filter(d => d.provisoire).length,
      sans_mention: diplomables.filter(d => !d.mention.mention).length,
    },
    proposes: diplomables.filter(d => d.annee_fin === annee).map(d => d.id),
  };
}

r.get('/dossier', authRequired, (req, res) => {
  const annee = req.query.annee || anneeDeTravail(req);
  const section = req.query.section;
  if (!section) return res.status(400).json({ error: 'section requise' });
  if (titreExterne(section)) return res.status(409).json(REFUS_TITRE_EXTERNE(section));

  const perim = getUserSections(req.user);
  if (perim && !perim.includes(section)) {
    return res.status(403).json({ error: 'section hors de votre périmètre' });
  }
  res.json(dossierDiplomation(section, annee));
});

/* ═══ LES PIÈCES DU TITRE ══════════════════════════════════════════════════
 *
 * Trois pièces, UNE SEULE SÉLECTION. Le diplôme, l'attestation de réussite de
 * la section et la liste destinée à la Fédération portent les mêmes noms, les
 * mêmes mentions et la même date — parce qu'elles sont produites du même
 * appel, sur les mêmes dossiers.
 *
 * Les tirer séparément, comme on le faisait, c'était accepter qu'elles
 * divergent : une correction faite d'un côté et pas de l'autre, et l'on
 * délivre un diplôme qui ne figure pas sur la liste.
 */

/** « 15 juin 2026 » — la date telle qu'on l'écrit sur une pièce officielle. */
function dateLongue(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  return `${Number(m[3])} ${MOIS[Number(m[2]) - 1]} ${m[1]}`;
}

/**
 * Remplir un modèle à variables.
 *
 * UNE VARIABLE INCONNUE NE S'EFFACE PAS. La remplacer par du vide produirait
 * un document qui a l'air complet et ne l'est pas — « né·e à , le  ». On la
 * laisse visible, entre crochets : sur une pièce officielle, un trou qui se
 * voit vaut mieux qu'un trou qui ne se voit pas.
 */
function remplir(modele, valeurs) {
  const manques = new Set();
  const html = String(modele || '').replace(/\{\{\s*([a-z_0-9]+)\s*\}\}/gi, (_, cle) => {
    const v = valeurs[cle];
    if (v == null || v === '') { manques.add(cle); return `[${cle} à compléter]`; }
    return String(v);
  });
  return { html, manques: [...manques] };
}

/**
 * LES SIGNATAIRES DU DIPLÔME — PAR SECTION.
 *
 * Demandé par Charles le 21 septembre 2026 : « le bloc de signature change
 * d'une section à l'autre ». Une co-diplomation avec la HELB signe à quatre,
 * un titre propre de l'IIP à deux ; le modèle, unique, les écrivait en dur.
 * La liste vit dans `lucie_config.diplome_signatures` : { [section]: [{ qualite,
 * nom }] }. Une qualité sur deux lignes s'écrit avec un retour à la ligne ; un
 * nom peut être {{president_jury}} ou {{directeur}}, résolus comme ailleurs.
 *
 * Le bloc « Au nom du Gouvernement… le titulaire » n'en fait pas partie : il
 * est le même pour toutes les sections, et il reste dans le modèle.
 */
/* LA CO-DIPLOMATION SE RÈGLE PAR SECTION, ET ELLE COMMANDE TOUT (Charles, 27
 * septembre 2026 : « en fonction de la section, le contenu est différent ;
 * TIM est HELB/IIP, le reste c'est IIP »). Un seul réglage — co-diplômée ou
 * titre propre — décide du logo, des signataires par défaut et, si la section
 * a le sien, du modèle. Absent, il vaut oui pour TIM seulement. */
function coDiplomee(sectionCode) {
  let coche = {};
  try { coche = JSON.parse(db.prepare("SELECT valeur FROM lucie_config WHERE cle = 'diplome_cologo_helb'").get()?.valeur || '{}') || {}; } catch { coche = {}; }
  return coche[sectionCode] ?? sectionCode === 'TIM';
}
export const SIGNATAIRES_IIP = [
  { qualite: "La Présidente du jury\nd'épreuve intégrée,", nom: '{{president_jury}}' },
  { qualite: "Le Directeur\nde l'Institut Ilya Prigogine,", nom: '{{directeur}}' },
];

async function signatairesDe(sectionCode) {
  let config = {};
  try {
    const row = db.prepare("SELECT valeur FROM lucie_config WHERE cle = 'diplome_signatures'").get();
    config = row?.valeur ? JSON.parse(row.valeur) : {};
  } catch { config = {}; }
  const liste = Array.isArray(config?.[sectionCode]) ? config[sectionCode]
    .filter(x => String(x?.qualite || '').trim() || String(x?.nom || '').trim()) : null;
  if (liste?.length) return { liste, propre: true };
  const { SIGNATAIRES_DEFAUT } = await import('../services/diplome_template.js');
  return { liste: coDiplomee(sectionCode) ? SIGNATAIRES_DEFAUT : SIGNATAIRES_IIP, propre: false };
}

function blocSignatures(liste, jetons) {
  const resoudre = v => String(v || '').replace(/\{\{\s*([a-z_]+)\s*\}\}/gi,
    (_, k) => (jetons[k] != null && jetons[k] !== '' ? jetons[k] : `[${k} à compléter]`));
  const e = v => esc(resoudre(v));
  return liste.map(x => `<div class="sig-col">
      <div class="role">${e(x.qualite).replace(/\n/g, '<br>')}</div>
      <div class="nom">${e(x.nom)}</div>
    </div>`).join('\n    ');
}

/* Poser le bloc dans le modèle. Le modèle d'origine porte {{signatures}} ; un
 * modèle enregistré avant 2.12.100 ne le porte pas, il a ses quatre
 * signataires en dur entre <div class="signatures"> et <div class="gouv"> — on
 * les remplace, mais SEULEMENT pour une section qui a sa propre liste : sans
 * elle, on ne touche pas à ce que la maison a écrit. */
function poserSignatures(modele, bloc, propre) {
  if (/\{\{\s*signatures\s*\}\}/.test(modele)) {
    return { html: modele.replace(/\{\{\s*signatures\s*\}\}/g, bloc), pose: true };
  }
  if (!propre) return { html: modele, pose: true };
  const re = /(<div class="signatures">)[\s\S]*?(<div class="gouv">)/;
  if (re.test(modele)) return { html: modele.replace(re, `$1\n    ${bloc}\n    $2`), pose: true };
  return { html: modele, pose: false };
}

/* LES LOGOS DU DIPLÔME — ET IL N'Y EN AVAIT AUCUN.
 * Le modèle ne prévoyait qu'un emplacement, celui de la HELB, et la route le
 * remplissait d'une valeur VIDE écrite en dur (`logo_helb: ''`) — le logo
 * importé dans l'éditeur n'était jamais lu. Celui de l'IIP n'avait pas même de
 * place. Constaté par Charles le 21 septembre 2026.
 * Désormais : l'IIP toujours ; la HELB pour une section cochée « co-diplomation »
 * (lucie_config.diplome_cologo_helb : { section: bool }) — absente, la case
 * vaut oui pour TIM seulement, la seule section co-diplômée (27 septembre 2026). */
async function logosDe(sectionCode) {
  const { LOGO_IIP_B64 } = await import('../services/assets/logo_iip.js');
  let co = '';
  try { co = db.prepare("SELECT valeur FROM lucie_config WHERE cle = 'diplome_logo_helb'").get()?.valeur || ''; } catch { /* rien */ }
  /* L'IMAGE IMPORTÉE EST LE LOGO DE CO-DIPLOMATION, IIP ET HELB ENSEMBLE — elle
     REMPLACE le logo de l'IIP, elle ne s'y ajoute pas : posée à côté, l'IIP
     paraissait deux fois sur le diplôme de TIM. */
  if (co && coDiplomee(sectionCode)) return `<img src="${co}" class="logo-img" alt="Institut Ilya Prigogine — HELB" />`;
  return `<img src="${LOGO_IIP_B64}" class="logo-img" alt="Institut Ilya Prigogine" />`;
}
/* Un modèle enregistré avant 2.12.108 n'a que l'image HELB : on la remplace
 * par le bloc des logos, sans quoi l'IIP n'y paraîtrait toujours pas. */
function poserLogos(modele, logos) {
  if (/\{\{\s*logos\s*\}\}/.test(modele)) return modele.replace(/\{\{\s*logos\s*\}\}/g, logos);
  return modele.replace(/<img[^>]*\{\{\s*logo_helb\s*\}\}[^>]*>/, logos);
}

/** Le modèle de diplôme retenu : celui de la maison, sinon celui d'origine. */
/* UN SEUL MODÈLE (Charles, 27 septembre 2026 : « le diplôme de base est une
   page au contenu identique partout ; ce qui change, ce sont les données de la
   section et de l'étudiant, le logo si co-diplomation, les signatures »). Ce
   qui diffère d'une section à l'autre passe par un champ, jamais par une copie
   du modèle : deux modèles finissent par dire deux choses. */
async function modeleDiplome() {
  try {
    const row = db.prepare(
      "SELECT valeur FROM lucie_config WHERE cle = 'diplome_template'").get();
    if (row?.valeur) return row.valeur;
  } catch { /* configuration illisible : le modèle d'origine fera l'affaire */ }
  const { genererTemplateDiplome } = await import('../services/diplome_template.js');
  return genererTemplateDiplome();
}

/**
 * L'ATTESTATION DE RÉUSSITE DE LA SECTION.
 *
 * À ne pas confondre avec l'attestation par UNITÉ, qui existe déjà : celle-ci
 * sanctionne le cycle entier et détaille ce sur quoi la mention repose — les
 * unités déterminantes et l'épreuve intégrée, avec leurs cotes. C'est la pièce
 * qu'on produit quand on nous demande « sur quoi ce titre est-il fondé ? ».
 *
 * Elle emprunte l'enveloppe des attestations : l'audit en a relevé neuf
 * concurrentes, on n'en crée pas une dixième.
 */
function attestationSection(d, ctx) {
  const { section, annee, ident, dateDelib } = ctx;
  const e0 = d.genre === 'F' ? 'e' : '';
  // LE CARTOUCHE SE POSE SUR LA COTE, PAS SUR LA CELLULE (2 octobre 2026) :
  // la classe « cote » sur le <td> en faisait un bloc en ligne, et les
  // rectangles guillochés sortaient de la grille du tableau.
  const cote = v => v == null ? '………' : `<span class="cote">${Math.round(Number(v))}/20</span>`;

  return `<div class="attestation piece">
    ${enteteDocument({
      titre: 'Attestation de réussite de section',
      sous: section.libelle || section.code,
      ligne: annee ? `Année ${String(annee).replace('-', '/')}` : null,
    })}

    <p class="corps">Le Conseil des études atteste que</p>
    <div class="etudiant">
      <div class="nom">${esc((d.nom || '').toUpperCase())} ${esc(d.prenom || '')}</div>
      <div class="naissance">Né${e0} à ${esc(d.lieu_naissance) || '………'},
        ${enToutesLettres(d.date_naissance)}</div>
    </div>

    <p class="corps indente">a satisfait aux conditions de sanction de la section
      susvisée, ${d.par_epreuve
        ? "ayant réussi l'épreuve intégrée qui la sanctionne"
        : 'ayant acquis l’ensemble des unités qui la composent'}.</p>

    <table class="doc">
      <thead><tr><th style="width:16mm">UE</th><th>Unité d'enseignement</th>
        <th style="width:22mm">Périodes</th><th style="width:20mm">Résultat</th></tr></thead>
      <tbody>
        ${d.determinantes.map(u => `<tr>
          <td>${u.ue_num}</td><td>${esc(u.ue_nom || '')}
            <span class="ref">unité déterminante</span></td>
          <td class="n">${u.periodes || '—'}</td>
          <td class="n">${cote(u.cote)}</td></tr>`).join('')}
        ${d.epreuve ? `<tr class="ei">
          <td>${d.epreuve.ue_num}</td><td>Épreuve intégrée</td>
          <td class="n">${d.epreuve.periodes || '—'}</td><td class="n">${cote(d.epreuve.cote)}</td></tr>` : ''}
      </tbody>
    </table>

    <div class="resultat">
      Résultat global : <span class="pct">${d.mention.pourcent != null
        ? `${Math.round(Number(d.mention.pourcent))} %` : '………'}</span>
      ${d.mention.mention ? `<br>Mention : <b>${esc(d.mention.mention)}</b>` : ''}
    </div>

    <!-- LE BLOC DES ATTESTATIONS : sceau, signature (protégée par le
         fac-similé au PDF, à l'aperçu et à l'envoi), lieu et date, qualité.
         Cette pièce n'avait que le lieu et le nom — rien à signer. -->
    <div class="cloture">
      <div class="sceau"></div>
      <div class="paraphe"></div>
      <div class="lieu">Fait à ${esc(ident.ville)}, le ${dateLongue(dateDelib)}.</div>
      <div class="legende">
        <div class="qualite">Pour le Conseil des études,<br>le Directeur</div>
        <div class="nom">${esc(ident.directeur)}</div>
      </div>
    </div>
  </div>`;
}

/**
 * L'ATTESTATION PROVISOIRE DE DIPLÔME (Charles, 2 octobre 2026 : « j'avais
 * cela, à mettre au goût du jour » — le générateur de juin, `pages/
 * Attestation.jsx`, où tout se saisissait à la main). Elle se remet le jour de
 * la délibération, en attendant le diplôme que l'autorité doit encore signer.
 * Tout vient du dossier de diplomation : identité, mention, section ; le code,
 * l'intitulé, les périodes et les ECTS de la fiche de section (Configuration
 * → Attestation → Sections & diplômes) ; les cosignataires du diplôme
 * (réglés par section) se nomment dans la formule « Pour … et pour … ».
 * La signature du directeur suit la règle commune : sous fac-similé.
 */
function attestationProvisoire(d, ctx) {
  const { section, annee, ident, dateDelib, ds, cosignataires } = ctx;
  const ne = d.genre === 'F' ? 'Née' : d.genre === 'H' ? 'Né' : 'Né·e';
  const lui = d.genre === 'F' ? "de l'intéressée" : d.genre === 'H' ? "de l'intéressé" : "de l'intéressé·e";
  const manque = '<span class="manque">……………</span>';
  const v = x => (x != null && x !== '' ? `<b>${esc(x)}</b>` : manque);
  const pour = cosignataires.length
    ? `<p class="pour">Pour ${cosignataires.map(c => `${esc(c.qualite)}, <b>${esc(c.nom)}</b>`).join(', et pour ')}.</p>` : '';
  return `<div class="attestation piece provisoire">
    ${enteteDocument({
      titre: 'Attestation provisoire de diplôme',
      sous: section.libelle || section.code,
      ligne: annee ? `Année académique ${String(annee).replace('-', '/')}` : null,
    })}
    <p class="corps">Je soussigné, ${esc(ident.directeur || '')}, Directeur de l'établissement, certifie que</p>
    <div class="etudiant">
      <div class="nom">${esc((d.nom || '').toUpperCase())} ${esc(d.prenom || '')}</div>
      <div class="naissance">${ne}${d.lieu_naissance ? ` à ${esc(d.lieu_naissance)}` : ''}, ${enToutesLettres(d.date_naissance) || '………'}</div>
    </div>
    <p class="corps">a obtenu, le ${dateLongue(dateDelib)}, le <b>diplôme de ${esc(String(ds.intitule_diplome || ds.intitule_section || '').toLocaleLowerCase('fr'))}</b>${
      d.mention?.mention ? `, avec la mention <b>${esc(d.mention.mention)}</b>` : ''},</p>
    <p class="corps">à l'issue de la section ${v(ds.intitule_section)}, approuvée par le Gouvernement sous le numéro de code ${v(ds.code_section)}.
      Ladite section comporte ${v(ds.total_periodes)} périodes et ${v(ds.total_ects)} crédits ECTS.</p>
    <p class="corps avis">Le diplôme ${lui} est actuellement soumis à la signature de l'autorité compétente.
      La présente attestation en tient lieu jusqu'à sa délivrance.</p>
    ${pour}
    <div class="cloture">
      <div class="sceau"></div>
      <div class="paraphe"></div>
      <div class="lieu">Fait à ${esc(ident.ville || 'Bruxelles')}, le ${dateLongue(dateDelib)}.</div>
      <div class="legende">
        <div class="qualite">Le Directeur<br>de l'Institut Ilya Prigogine</div>
        <div class="nom">${esc(ident.directeur || '')}</div>
      </div>
    </div>
  </div>`;
}

const STYLE_SECTION = `<style>
  .titre-piece { border: 0.4mm solid #1B2B4B; border-radius: 1.5mm; padding: 3mm 4mm;
    margin: 5mm 0 1mm; text-align: center; font-size: 12pt; font-weight: 700;
    color: #1B2B4B; letter-spacing: .3pt; }
  .sous-piece { text-align: center; font-size: 9.5pt; color: #475569; margin-bottom: 4mm; }
  table.doc td.n { text-align: right; white-space: nowrap; }
  table.doc tr.ei td { background: #F8F5EC; font-weight: 600; }
  table.doc .ref { display: block; font-size: 7pt; color: #8a6d2f; }
  .resultat { margin-top: 4mm; padding: 2.5mm 4mm; border: 0.3mm solid #C9A84C;
    border-radius: 1.5mm; text-align: right; font-size: 10pt; }
  .resultat .pct { font-size: 13pt; font-weight: 700; color: #1B2B4B; }
  .provisoire .corps { font-size: 10pt; line-height: 1.6; }
  .provisoire .avis { font-style: italic; color: #475569; margin-top: 4mm; }
  .provisoire .pour { font-size: 9.5pt; text-align: center; margin: 6mm 6mm 0; line-height: 1.6; }
  .provisoire .manque { color: #b45309; font-style: italic; }
</style>`;

/**
 * RÉUNIR DES DIPLÔMES EN UN DOCUMENT.
 *
 * Chaque diplôme est une page HTML COMPLÈTE, composée depuis le modèle réglé
 * en configuration — qu'on ne connaît donc pas d'avance. On garde l'en-tête du
 * premier (ils sortent tous du même modèle), on met les corps bout à bout, et
 * un saut de page les sépare : jamais après le dernier, qui ferait sortir une
 * feuille blanche sur le papier à diplôme.
 */
export function reunirDiplomes(htmls) {
  if (!htmls.length) return null;
  if (htmls.length === 1) return htmls[0];
  const tete = (htmls[0].match(/<head[^>]*>([\s\S]*?)<\/head>/i) || [])[1] || '';
  const corps = htmls.map(h => (h.match(/<body[^>]*>([\s\S]*?)<\/body>/i) || [, h])[1]);
  return `<!DOCTYPE html><html lang="fr"><head>${tete}
<style>.saut-diplome{break-after:page;page-break-after:always;height:0;}</style>
</head><body>${corps.join('<div class="saut-diplome"></div>')}</body></html>`;
}

/**
 * LES PIÈCES, EN LOT.
 *
 * Rien n'est produit pour un dossier que la sélection n'a pas retenu : c'est la
 * direction qui arrête qui reçoit un titre, pas une requête.
 */
r.post('/pieces', authRequired,
       gesteRequis('diplomes.produire'),
       async (req, res) => {
  const { section, annee, etudiants: ids, pieces, date_deliberation } = req.body || {};
  if (!section) return res.status(400).json({ error: 'section requise' });
  if (titreExterne(section)) return res.status(409).json(REFUS_TITRE_EXTERNE(section));
  if (!Array.isArray(ids) || !ids.length) {
    return res.status(400).json({ error: 'aucun étudiant sélectionné' });
  }
  const veut = Array.isArray(pieces) && pieces.length
    ? pieces : ['diplome', 'attestation', 'liste'];
  const an = annee || anneeDeTravail(req);

  const perim = getUserSections(req.user);
  if (perim && !perim.includes(section)) {
    return res.status(403).json({ error: 'section hors de votre périmètre' });
  }

  // ON REPART DU DOSSIER, jamais de ce que le client a calculé : une mention
  // envoyée par l'écran serait une mention qu'on ne peut pas défendre.
  const dossier = dossierDiplomation(section, an);

  const retenus = new Set(ids.map(Number));
  const choisis = (dossier.diplomables || []).filter(d => retenus.has(d.id));
  if (!choisis.length) {
    return res.status(400).json({
      error: 'Aucun des étudiants retenus ne figure parmi les diplômables.' });
  }

  const ident = identiteEtablissement();
  const sec = dossier.section || {};
  const dateDelib = date_deliberation || new Date().toISOString().slice(0, 10);
  const presidence = (() => { try { return presidenceConseil(); } catch { return {}; } })();
  const ctx = { section: sec, annee: an, ident, dateDelib };
  /* L'ANNÉE DU TITRE EST CELLE DE LA RÉUSSITE (Charles, 2 octobre 2026 : « la
     date est en dur, pas liée à l'année de réussite de l'épreuve intégrée »).
     Le diplôme portait l'année choisie à l'écran ; il porte désormais celle où
     l'épreuve intégrée a été réussie — à défaut, celle de la dernière unité
     acquise. Même règle pour l'attestation de section et la provisoire. */
  const anneeDe = d => d.epreuve?.annee || d.annee_fin || an;
  const ctxDe = d => ({ ...ctx, annee: anneeDe(d) });

  const pages = [];
  const styles = new Set();
  const manques = [];

  if (veut.includes('diplome')) {
    const modele = await modeleDiplome();
    const ectsTotal = dossier.requises.length
      ? db.prepare(`SELECT SUM(n) AS t FROM (SELECT ue_num, MAX(ects) AS n FROM ue
          WHERE ue_num IN (${dossier.requises.map(() => '?').join(',')})
          GROUP BY ue_num)`).get(...dossier.requises)?.t : null;

    const sig = await signatairesDe(sec.code);
    const ds = donneesSectionDiplome(sec.code);
    const jetonsSig = {
      president_jury: presidence?.titulaire?.nom || ident.directeur,
      directeur: ident.directeur,
    };
    const { html: modeleSigneSansLogo, pose } = poserSignatures(modele, blocSignatures(sig.liste, jetonsSig), sig.propre);
    const modeleSigne = poserLogos(modeleSigneSansLogo, await logosDe(sec.code));
    if (!pose) {
      manques.push(`Signataires de ${sec.libelle || sec.code} : le modèle de diplôme n’a ni `
        + 'emplacement {{signatures}} ni bloc de signatures reconnaissable — la liste réglée '
        + 'pour cette section n’a pas pu être posée.');
    }

    for (const d of choisis) {
      const { html, manques: m } = remplir(modeleSigne, {
        nom_etudiant: d.nom, prenom_etudiant: d.prenom,
        genre: d.genre === 'F' ? 'F' : d.genre === 'H' ? 'H' : '',
        lieu_naissance: d.lieu_naissance, date_naissance: dateLongue(d.date_naissance),
        annee: anneeDe(d), mention: d.mention.mention,
        intitule_section: ds.intitule_section, code_section: ds.code_section,
        domaine: ds.domaine, grade_academique: ds.grade_academique,
        type_enseignement: ds.type_enseignement,
        total_ects: ectsTotal || ds.total_ects, duree_annees: ds.duree_annees,
        date_deliberation: dateLongue(dateDelib),
        ville_etab: ident.ville, directeur: ident.directeur,
        president_jury: presidence?.titulaire?.nom || ident.directeur,
        titulaire_nom: presidence?.titulaire?.nom || '',
        article_titulaire: 'Le', date_approbation: ds.date_approbation,
        // Posés par poserLogos() ; ces jetons restent pour un modèle qui les
        // citerait ailleurs, et ne doivent jamais partir vides.
        logo_helb: ' ', logo_iip: ' ',
      });
      pages.push({ t: `Diplôme — ${d.nom} ${d.prenom}`, h: html, entier: true });
      if (m.length) manques.push(`Diplôme de ${d.nom} ${d.prenom} : ${m.join(', ')}`);
    }
  }

  if (veut.includes('provisoire')) {
    styles.add(STYLE_SECTION);
    const dsP = donneesSectionDiplome(sec.code);
    const sigP = await signatairesDe(sec.code);
    const jetonsP = { president_jury: presidence?.titulaire?.nom || ident.directeur, directeur: ident.directeur };
    const resoudre = t => String(t || '').replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, k) => jetonsP[k] || '');
    // Les cosignataires : tous ceux du diplôme, sauf le directeur, qui signe la pièce.
    ctx.cosignataires = (sigP.liste || [])
      .map(x => ({ qualite: resoudre(x.qualite).replace(/\s*\n\s*/g, ' ').replace(/[,\s]+$/, ''), nom: resoudre(x.nom).trim() }))
      .filter(x => x.nom && x.nom !== ident.directeur)
      .map(x => ({ ...x, qualite: x.qualite.charAt(0).toLocaleLowerCase('fr') + x.qualite.slice(1) }));
    // Les ECTS : la fiche, à défaut la somme des unités de la section — le calcul du diplôme.
    const ectsP = dossier.requises.length ? db.prepare(`SELECT SUM(n) AS t FROM (SELECT ue_num, MAX(ects) AS n FROM ue
        WHERE ue_num IN (${dossier.requises.map(() => '?').join(',')}) GROUP BY ue_num)`).get(...dossier.requises)?.t : null;
    ctx.ds = { ...dsP, total_ects: dsP.total_ects || ectsP || '' };
    if (!dsP.total_periodes) manques.push(`Attestation provisoire : le nombre de périodes de ${sec.libelle || sec.code} manque à la fiche de section (Configuration → Attestation → Sections & diplômes).`);
    if (!dsP.code_section) manques.push(`Attestation provisoire : le code de la section ${sec.libelle || sec.code} manque.`);
    for (const d of choisis) {
      pages.push({ t: `Attestation provisoire — ${d.nom} ${d.prenom}`, h: attestationProvisoire(d, ctxDe(d)) });
    }
  }

  if (veut.includes('attestation')) {
    styles.add(STYLE_SECTION);
    for (const d of choisis) {
      pages.push({ t: `Attestation de section — ${d.nom} ${d.prenom}`,
                   h: attestationSection(d, ctxDe(d)) });
    }
  }

  // UNE PIÈCE PAR PERSONNE, pour l'envoi : on n'adresse pas à quelqu'un un
  // fichier qui porte vingt noms. L'attestation de chacun est enveloppée seule.
  const parEtudiant = veut.includes('attestation') || veut.includes('provisoire')
    ? choisis.map(d => ({
      id: d.id, nom: d.nom, prenom: d.prenom,
      ...(veut.includes('attestation') ? { attestation: envelopper(STYLE_SECTION + attestationSection(d, ctxDe(d)),
        `Attestation de réussite de section — ${d.nom} ${d.prenom}`) } : {}),
      ...(veut.includes('provisoire') ? { provisoire: envelopper(STYLE_SECTION + attestationProvisoire(d, ctxDe(d)),
        `Attestation provisoire de diplôme — ${d.nom} ${d.prenom}`) } : {}),
    }))
    : [];
  const diplomes = pages.filter(p => p.entier).map(p => p.h);

  res.json({
    section: sec.code, annee: an, date_deliberation: dateDelib,
    pieces: pages.map(p => p.t),
    // TOUS LES DIPLÔMES EN UN SEUL DOCUMENT. Une fenêtre par diplôme, c'était
    // une seule fenêtre : le navigateur bloque les suivantes, et les autres
    // titres ne sortaient jamais. Le lot garde la page du modèle (A4 paysage,
    // sans marge) et saute une page entre deux diplômes.
    diplomes_lot: diplomes.length ? reunirDiplomes(diplomes) : null,
    par_etudiant: parEtudiant,
    // Le diplôme porte sa propre page complète (paysage, sans marge ni pied) :
    // il ne s'enveloppe pas comme les autres et ne se mêle pas à elles.
    diplomes,
    html: pages.some(p => !p.entier)
      ? envelopper([...styles].join('') + pages.filter(p => !p.entier)
        .map(p => p.h).join(''), `Titres — ${sec.libelle || sec.code}`)
      : null,
    nom: `Titres_${sec.code}_${String(an).replace('-', '')}`,
    total: choisis.length,
    provisoires: choisis.filter(d => d.provisoire).map(d => `${d.nom} ${d.prenom}`),
    manques,
  });
});

/**
 * LE DOCUMENT.
 *
 * La liste porte les étudiants qu'on lui donne, dans l'ordre alphabétique, et
 * rien d'autre : c'est la direction qui a arrêté qui figure dessus.
 */

/**
 * ANNEXES 6 ET 7 — LE PROCÈS-VERBAL DE DÉLIBÉRATION D'UNE SECTION.
 *
 * C'est l'acte par lequel le Conseil constate qu'un étudiant a terminé, et qui
 * FONDE la délivrance du titre. Lucie n'imprimait qu'une « Liste des étudiants
 * diplômés », qui n'est aucun modèle de la circulaire : le diplôme reposait
 * donc sur une pièce inexistante.
 *
 * Deux modèles pour un même acte, selon que la section comporte ou non une
 * unité « épreuve intégrée » : l'annexe 6 en ajoute le seuil (A/NA) et le
 * pourcentage, et c'est le Jury qui délibère plutôt que le Conseil. Le reste
 * est commun — les six alinéas de mention, le nombre de pages, la
 * communication des résultats au ROI, et « Fait en DEUX exemplaires ».
 */
const MENTIONS_PV = [
  'La plus grande distinction', 'Grande distinction', 'Distinction',
  'Satisfaction', 'Fruit',
];

export function pvDeSection(sectionCode, annee, lignes, { session = 1, lieu = null,
                                                          date = null } = {}) {
  const ident = identiteEtablissement();
  const sec = db.prepare('SELECT code, libelle, code_fwb, niveau FROM section WHERE code = ?')
    .get(sectionCode) || { code: sectionCode };
  const requises = unitesDeLaSection(sectionCode, annee);
  const ei = epreuveIntegreeDe(requises);
  const avecEI = !!ei;
  const organe = avecEI ? "Jury d'épreuve intégrée" : 'Conseil des études';

  const parMention = {};
  for (const l of lignes) {
    if (!l.mention) continue;
    (parMention[l.mention] = parMention[l.mention] || []).push(
      `${(l.nom || '').toUpperCase()} ${l.prenom || ''}`.trim());
  }
  const aRepresenter = lignes.filter(l => l.a_representer)
    .map(l => `${(l.nom || '').toUpperCase()} ${l.prenom || ''}`.trim());

  const rangs = MENTIONS_PV.map((m, i) => `
    <div class="alinea">${'abcde'[i]}) ${avecEI ? 'Conférons le grade / délivrons'
      : 'Délivrons'} le certificat avec la mention « ${esc(m)} » à :
      <span class="noms">${esc((parMention[m] || []).join(' · ')) || '—'}</span></div>`).join('');

  const corps = `<div class="attestation">
    <div class="entete">
      <div class="nom">COMMUNAUTÉ FRANÇAISE DE BELGIQUE</div>
      <div class="sous">ENSEIGNEMENT POUR ADULTES</div>
      <div class="sous">ANNÉE SCOLAIRE / ANNÉE ACADÉMIQUE : ${esc(String(annee).replace('-', '/'))}</div>
      <div class="sous">${esc(/SUP|BES|BAC/i.test(String(sec.niveau || ''))
        ? 'ENSEIGNEMENT SUPÉRIEUR' : 'ENSEIGNEMENT SECONDAIRE')}</div>
    </div>

    <table class="doc etab-liste">
      <tr><th>Établissement</th><td>${esc(ident.nom || '')}</td></tr>
      <tr><th>Adresse</th><td>${esc(ident.adresse || '')}</td></tr>
      <tr><th>Numéro de matricule</th><td>${esc(ident.matricule || '')}</td></tr>
      <tr><th>Numéro FASE</th><td>${esc(ident.fase || '')}</td></tr>
      <tr><th>Date de délibération de la ${session === 2 ? '2<sup>e</sup>' : '1<sup>re</sup>'} session</th>
          <td>${esc(date ? enToutesLettres(date) : '……………………')}</td></tr>
    </table>

    <div class="titre-dip">PROCÈS-VERBAL DE DÉLIBÉRATION D'UNE SECTION</div>

    <p class="corps">
      Nous, soussignés, Président-e et Membres du ${esc(organe)} constitué par le
      Pouvoir organisateur de l'établissement précité en vue de
      ${avecEI ? "conférer le grade de / délivrer le certificat de"
               : 'la délivrance du certificat de la section'} :
    </p>

    <div class="carac">
      <div class="large">Intitulé de la section :
        <b>${esc(sec.libelle || sec.code || '……………………')}</b></div>
      <div class="large">Section approuvée par le Gouvernement sous le numéro de
        code : ${sec.code_fwb ? `<b>${esc(sec.code_fwb)}</b>`
          : '<span class="manque">à compléter au référentiel</span>'}</div>
    </div>

    <p class="corps">Après en avoir délibéré, avons pris les décisions suivantes :</p>

    <table class="doc">
      <thead><tr>
        <th style="width:30%">Nom, prénom et initiales des autres prénoms,<br>
          lieu et date de naissance (pays si pas la Belgique)</th>
        ${avecEI ? `<th>Seuil de réussite de l'épreuve intégrée<sup>1</sup></th>
        <th>% du total des points de l'épreuve intégrée</th>` : ''}
        <th>Total général en %<sup>${avecEI ? '2' : '1'}</sup></th>
        <th>Décision finale</th>
        <th>Mention</th>
      </tr></thead>
      <tbody>${lignes.map(l => `<tr>
        <td><b>${esc((l.nom || '').toUpperCase())} ${esc(l.prenom || '')}</b><br>
          <span class="detail">${esc(l.lieu_naissance || '')}${
            l.date_naissance ? `, ${esc(enToutesLettres(l.date_naissance))}` : ''}</span></td>
        ${avecEI ? `<td class="c">${l.ei_atteint == null ? ''
          : (l.ei_atteint ? 'A' : 'NA')}</td>
        <td class="c">${l.ei_atteint && l.ei_pourcent != null
          ? `${l.ei_pourcent} %` : ''}</td>` : ''}
        <td class="c">${l.reussi && l.pourcent != null ? `${l.pourcent} %` : ''}</td>
        <td class="c">${esc(l.decision || '')}</td>
        <td class="c">${esc(l.mention || '')}</td>
      </tr>`).join('') || `<tr><td colspan="${avecEI ? 6 : 4}" class="c vide">
        Aucun étudiant.</td></tr>`}</tbody>
    </table>
    <p class="champ" style="font-size:7.5pt;color:#64748b">
      ${avecEI ? `<sup>1</sup> Mentionner A pour atteint et NA pour non atteint.<br>
        <sup>2</sup> Ne mentionner de pourcentage qu'en cas de A pour atteint.`
        : `<sup>1</sup> Ne mentionner de pourcentage qu'en cas de « Réussite ».`}</p>

    ${rangs}
    ${avecEI ? `<div class="alinea">f) Autorisons les étudiants suivants à
      représenter l'épreuve intégrée :
      <span class="noms">${esc(aRepresenter.join(' · ')) || '—'}</span></div>` : ''}

    <div class="info">
      <div class="ligne">Le présent procès-verbal comporte …… page(s).</div>
      <div class="ligne">Le ${esc(organe)} a délibéré le
        <b>${esc(date ? enToutesLettres(date) : '……………………')}</b>.</div>
      <div class="ligne">Les résultats sont communiqués conformément au ROI de
        l'établissement le ……………………</div>
    </div>

    <div class="cloture sans-paraphe">
      <div class="sceau"></div>
      <div class="paraphe"></div>
      <div class="lieu">Fait en deux exemplaires à ${esc(lieu || ident.ville || 'Anderlecht')},
        le ${esc(date ? enToutesLettres(date) : '……………………')}</div>
      <div class="legende">
        <div class="qualite">Pour le ${esc(organe)},<br>le Directeur</div>
        <div class="nom">${esc(ident.directeur || '……………………')}</div>
      </div>
    </div>
  </div>`;

  // Les classes propres au PV de section : ce module n'avait que de quoi
  // composer une liste.
  const style = `<style>
    /* LE BANDEAU DES FORMULAIRES IMPOSÉS, LOCALEMENT.
       Ces deux pièces — le procès-verbal du jury et la liste des diplômés —
       ne suivent PAS notre charte, et c'est voulu : leur forme est celle du
       formulaire de la Fédération, tableau « Établissement / Adresse /
       Matricule / FASE » compris. Leur bandeau empruntait celui de l'enveloppe
       des attestations, qui vient d'être remplacé par l'en-tête commun : il se
       déclare donc ici, là où il est employé, plutôt que de retenir dans
       l'enveloppe de tout le monde un dessin qui ne sert qu'à deux pièces. */
    .entete { text-align:center; padding: 3mm 6mm; margin-bottom: 4mm;
              border-top: 0.3mm solid #C9A84C; border-bottom: 0.3mm solid #C9A84C; }
    .entete .nom { font-size: 10pt; font-weight: 700; letter-spacing:.5pt;
                   color:#1B2B4B; }
    .entete .sous { font-size: 8.5pt; color:#475569; margin-top: .8mm;
                    letter-spacing:.3pt; }
    .titre-dip { text-align:center; font-size:13pt; font-weight:700; color:#1B2B4B;
                 margin: 6mm 0 4mm; letter-spacing:.02em; }
    table.doc.etab-liste th { width: 62mm; text-align:left; }
    .corps { font-size: 9.5pt; line-height: 1.45; margin: 3mm 0; }
    .carac { display:grid; grid-template-columns:1fr 1fr; gap:1mm 5mm;
             font-size:9pt; margin: 2mm 0 3mm; }
    .carac .large { grid-column: 1 / -1; }
    .manque { color:#b45309; font-style:italic; }
    .detail { color:#5b6577; font-size:8pt; }
    .doc .c { text-align:center; }
    .doc .vide { color:#7a8699; font-style:italic; }
    .alinea { font-size:9pt; margin: 1.5mm 0; }
    .alinea .noms { font-weight:600; color:#1B2B4B; }
    .champ { margin: 1mm 0 3mm; }
    .info { border:0.3mm solid #cbd5e1; border-radius:1.5mm; padding:2mm 3mm;
            margin: 3mm 0; font-size:9pt; }
    .info .ligne { margin: .8mm 0; }
    .cloture { display:grid; grid-template-columns:auto 1fr auto; gap:4mm;
               align-items:end; margin-top:6mm; font-size:9pt; break-inside:avoid; }
    .cloture .sceau, .cloture .paraphe { height:16mm; }
    .cloture { --filigrane-h:16mm; }
    .cloture .legende { text-align:center; }
    .cloture .legende .nom { font-weight:700; color:#1B2B4B; }
  </style>`;

  return { corps, style, avec_epreuve_integree: avecEI, section: sec, organe };
}

r.post('/document', authRequired,
       gesteRequis('diplomes.produire'), (req, res) => {
  const { section, annee, etudiants: ids, lieu, date } = req.body || {};
  if (!section) return res.status(400).json({ error: 'section requise' });
  if (titreExterne(section)) return res.status(409).json(REFUS_TITRE_EXTERNE(section));
  if (!Array.isArray(ids) || !ids.length) {
    return res.status(400).json({ error: 'aucun étudiant sélectionné' });
  }
  const an = annee || anneeDeTravail(req);
  const ident = identiteEtablissement();
  const sec = db.prepare('SELECT * FROM section WHERE code = ?').get(section) || {};

  const marques = ids.map(() => '?').join(',');
  const liste = db.prepare(`
    SELECT id, nom, prenom, titre, date_naissance, lieu_naissance
    FROM etudiant WHERE id IN (${marques}) ORDER BY nom, prenom
  `).all(...ids);

  const lignes = liste.map(e => `<tr>
    <td>${esc(e.nom)}</td>
    <td>${esc(e.prenom)}</td>
    <td>${esc(e.lieu_naissance || '')}</td>
    <td>${esc(enToutesLettres(e.date_naissance))}</td>
    <td class="c">${esc(genre(e.titre))}</td>
  </tr>`).join('');

  // L'année académique s'écrit 2025/2026, comme le veut le formulaire.
  const academique = String(an).replace('-', '/');

  const corps = `<div class="attestation">
    <div class="entete">
      <div class="nom">COMMUNAUTÉ FRANÇAISE DE BELGIQUE</div>
      <div class="sous">ENSEIGNEMENT POUR ADULTES</div>
      <div class="sous">ANNÉE ACADÉMIQUE : ${esc(academique)}</div>
    </div>

    <table class="doc etab-liste">
      <tr><th>Établissement</th><td>${esc(ident.nom || '')}</td></tr>
      <tr><th>Adresse</th><td>${esc(ident.adresse || '')}</td></tr>
      <tr><th>Numéro de matricule</th><td>${esc(ident.matricule || '')}</td></tr>
      <tr><th>Numéro FASE</th><td>${esc(ident.fase || '')}</td></tr>
    </table>

    <div class="titre-dip">LISTE DES ÉTUDIANTS DIPLÔMÉS</div>

    <table class="doc etab-liste">
      <tr><th>Intitulé de la section</th><td>${esc(sec.libelle || section)}</td></tr>
      <tr><th>Classement de la section suivant la catégorie / le domaine</th>
          <td>${esc(sec.domaine || sec.niveau || '')}</td></tr>
      <tr><th>Section approuvée par le Gouvernement sous le numéro de code</th>
          <td>${esc(sec.code_fwb || '')}</td></tr>
    </table>

    <table class="doc liste-dip">
      <tr>
        <th>Nom</th>
        <th>Prénom, initiales des autres prénoms</th>
        <th>Lieu de naissance<br><span class="pt">(indication du pays si hors Belgique)</span></th>
        <th>Date de naissance</th>
        <th class="c">Genre<br><span class="pt">(H/F/X)</span></th>
      </tr>
      ${lignes}
    </table>

    <div class="fin-dip">
      <div>Fait en deux exemplaires à ${esc(lieu || ident.ville || 'Anderlecht')},
        le ${esc(date || '……………………')}</div>
      <div class="sign-dip">Le Directeur,<br><b>${esc(ident.directeur || '')}</b></div>
    </div>
  </div>

  <style>
    /* LE BANDEAU DES FORMULAIRES IMPOSÉS, LOCALEMENT.
       Ces deux pièces — le procès-verbal du jury et la liste des diplômés —
       ne suivent PAS notre charte, et c'est voulu : leur forme est celle du
       formulaire de la Fédération, tableau « Établissement / Adresse /
       Matricule / FASE » compris. Leur bandeau empruntait celui de l'enveloppe
       des attestations, qui vient d'être remplacé par l'en-tête commun : il se
       déclare donc ici, là où il est employé, plutôt que de retenir dans
       l'enveloppe de tout le monde un dessin qui ne sert qu'à deux pièces. */
    .entete { text-align:center; padding: 3mm 6mm; margin-bottom: 4mm;
              border-top: 0.3mm solid #C9A84C; border-bottom: 0.3mm solid #C9A84C; }
    .entete .nom { font-size: 10pt; font-weight: 700; letter-spacing:.5pt;
                   color:#1B2B4B; }
    .entete .sous { font-size: 8.5pt; color:#475569; margin-top: .8mm;
                    letter-spacing:.3pt; }
    .titre-dip { text-align:center; font-size:13pt; font-weight:700; color:#1B2B4B;
                 margin: 6mm 0 4mm; letter-spacing:.02em; }
    table.doc.etab-liste th { width: 62mm; text-align:left; }
    table.doc.liste-dip th { font-size: 8pt; }
    table.doc.liste-dip .pt { font-weight:400; font-size:7pt; }
    .fin-dip { margin-top: 14mm; display:flex; justify-content:space-between;
               align-items:flex-start; gap:10mm; font-size:9.5pt; break-inside: avoid; }
    .sign-dip { text-align:center; }
  </style>`;

  res.json({
    html: envelopper(corps, `Liste des diplômés — ${sec.libelle || section}`),
    nom: `Diplomes_${String(section).replace(/\W/g, '')}_${String(an).replace(/\W/g, '')}.html`,
    nb: liste.length,
    manques: liste.filter(e => !e.date_naissance || !e.lieu_naissance || !genre(e.titre))
      .map(e => `${e.nom} ${e.prenom} : ${[
        !e.date_naissance && 'date de naissance',
        !e.lieu_naissance && 'lieu de naissance',
        !genre(e.titre) && 'genre',
      ].filter(Boolean).join(', ')}`),
  });
});

/**
 * Le PV de section, pour les étudiants qu'on lui donne. La direction arrête qui
 * y figure : on ne devine pas une délibération.
 */
r.post('/pv-section', authRequired,
       gesteRequis('diplomes.produire'), (req, res) => {
  const { section, annee, etudiants: ids, session, lieu, date } = req.body || {};
  if (!section) return res.status(400).json({ error: 'section requise' });
  if (titreExterne(section)) return res.status(409).json(REFUS_TITRE_EXTERNE(section));
  if (!Array.isArray(ids) || !ids.length) {
    return res.status(400).json({ error: 'aucun étudiant sélectionné' });
  }
  const an = annee || anneeDeTravail(req);
  const perim = getUserSections(req.user);
  if (perim && !perim.includes(section)) {
    return res.status(403).json({ error: 'section hors de votre périmètre' });
  }

  const requises = unitesDeLaSection(section, an);
  const ei = epreuveIntegreeDe(requises);
  const marques = ids.map(() => '?').join(',');
  const liste = db.prepare(`SELECT id, nom, prenom, titre, date_naissance, lieu_naissance
    FROM etudiant WHERE id IN (${marques}) ORDER BY nom, prenom`).all(...ids);

  // Les unités DÉTERMINANTES de la section, avec leurs périodes : ce sont
  // elles qui pondèrent la mention.
  // « ue_det » est un TEXTE qui vaut 'x' — non un booléen. Écrit « = 1 », le
  // filtre n'aurait jamais rien retourné et la mention se serait calculée sur
  // la seule épreuve intégrée, en silence.
  const det = determinantesDe(requises, an);

  const resultatUE = db.prepare(`SELECT resultat FROM etudiant_inscription
    WHERE etudiant_id = ? AND ue_num = ? ORDER BY annee_scolaire DESC LIMIT 1`);

  const lignes = liste.map(e => {
    const determinantes = det.map(u => ({
      ue_num: u.ue_num, periodes: u.periodes,
      cote: coteArretee(e.id, u.ue_num).cote,
    }));
    const coteEI = ei ? coteArretee(e.id, ei).cote : null;
    const m = calculerMention(determinantes, coteEI);
    const resEI = ei ? resultatUE.get(e.id, ei)?.resultat : null;
    return {
      ...e,
      ei_atteint: ei ? resEI === 'reussi' : null,
      ei_pourcent: coteEI == null ? null : Math.round(Number(coteEI) * 5),
      pourcent: m.pourcent,
      reussi: !ei || resEI === 'reussi',
      decision: !ei ? 'Réussite'
        : resEI === 'reussi' ? 'Réussite' : resEI === 'ajourne' ? 'Ajournement' : 'Refus',
      mention: (!ei || resEI === 'reussi') ? m.mention : null,
      a_representer: ei && resEI === 'ajourne',
      mention_complete: m.complet,
    };
  });

  const d = pvDeSection(section, an, lignes,
    { session: Number(session) === 2 ? 2 : 1, lieu, date });

  res.json({
    html: envelopper(d.corps + d.style, `PV de section — ${d.section.libelle || section}`),
    nom: `PV_section_${String(section).replace(/\W/g, '')}_${String(an).replace(/\W/g, '')}.html`,
    annexe: d.avec_epreuve_integree ? 6 : 7,
    nb: lignes.length,
    // Ce qui rendrait la pièce fausse, dit avant de l'imprimer.
    manques: lignes.flatMap(l => [
      !l.date_naissance && `${l.nom} ${l.prenom} : date de naissance`,
      !l.lieu_naissance && `${l.nom} ${l.prenom} : lieu de naissance`,
      !l.mention_complete && l.reussi
        && `${l.nom} ${l.prenom} : mention calculée sur un parcours incomplet`,
    ].filter(Boolean)),
  });
});

export default r;

// Exportées pour être éprouvées isolément (et réutilisables par un aperçu).
export { signatairesDe, blocSignatures, poserSignatures };
