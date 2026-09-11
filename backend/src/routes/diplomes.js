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
import { anneeDeTravail } from '../helpers/annee.js';
import { envelopper } from './attestations.js';
import { identiteEtablissement } from './config.js';
import { calculerMention, reglesMention } from '../lib/mention.js';

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
function unitesDeLaSection(sectionCode, annee) {
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
r.get('/candidats', authRequired, (req, res) => {
  const annee = req.query.annee || anneeDeTravail(req);
  const section = req.query.section;
  if (!section) return res.status(400).json({ error: 'section requise' });

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
function determinantesDe(unites, annee) {
  if (!unites.length) return [];
  const m = unites.map(() => '?').join(',');
  return db.prepare(`
    SELECT ue_num,
           MAX(COALESCE(ue_per_etudiants, 0)) AS periodes,
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

r.get('/dossier', authRequired, (req, res) => {
  const annee = req.query.annee || anneeDeTravail(req);
  const section = req.query.section;
  if (!section) return res.status(400).json({ error: 'section requise' });

  const perim = getUserSections(req.user);
  if (perim && !perim.includes(section)) {
    return res.status(403).json({ error: 'section hors de votre périmètre' });
  }

  const sec = db.prepare(`SELECT code, libelle, niveau, code_fwb, domaine,
    type_enseignement FROM section WHERE code = ?`).get(section) || { code: section };
  const requises = unitesDeLaSection(section, annee);
  const ei = epreuveIntegreeDe(requises);
  const det = determinantesDe(requises, annee);
  const regles = reglesMention();

  if (!requises.length) {
    return res.json({ annee, section: sec, requises: [], diplomables: [],
      avertissement: "Aucune unité n'est rattachée à cette section." });
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
    const cEI = ei ? { ue_num: ei, ...coteArretee(e.id, ei) } : null;
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

  res.json({
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
  });
});

/**
 * LE DOCUMENT.
 *
 * La liste porte les étudiants qu'on lui donne, dans l'ordre alphabétique, et
 * rien d'autre : c'est la direction qui a arrêté qui figure dessus.
 */
r.post('/document', authRequired,
       roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur'), (req, res) => {
  const { section, annee, etudiants: ids, lieu, date } = req.body || {};
  if (!section) return res.status(400).json({ error: 'section requise' });
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

export default r;
