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

/** Le modèle de diplôme retenu : celui de la maison, sinon celui d'origine. */
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
  const cote = v => v == null ? '………' : `${Math.round(Number(v))}/20`;

  return `<div class="attestation piece">
    <div class="entete">
      <div class="cf">COMMUNAUTÉ FRANÇAISE DE BELGIQUE</div>
      <div class="epa">ENSEIGNEMENT DE PROMOTION SOCIALE</div>
    </div>
    <div class="etab">
      <div><b>${esc(ident.nom)}</b><br>${esc(ident.adresse)}</div>
      <div class="ident">${ident.matricule ? `Matricule : ${esc(ident.matricule)}<br>` : ''}
        ${ident.fase ? `FASE : ${esc(ident.fase)}` : ''}</div>
    </div>

    <div class="titre-piece">Attestation de réussite de section</div>
    <div class="sous-piece">${esc(section.libelle || section.code)}</div>

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
          <td class="n">—</td><td class="n">${cote(d.epreuve.cote)}</td></tr>` : ''}
      </tbody>
    </table>

    <div class="resultat">
      Résultat global : <span class="pct">${d.mention.pourcent != null
        ? `${String(d.mention.pourcent).replace('.', ',')} %` : '………'}</span>
      ${d.mention.mention ? `<br>Mention : <b>${esc(d.mention.mention)}</b>` : ''}
    </div>

    <div class="cloture">
      <div class="lieu">Fait à ${esc(ident.ville)}, le ${dateLongue(dateDelib)}.</div>
      <div class="sig"><div class="nom">${esc(ident.directeur)}</div>
        <div class="role">Directeur</div></div>
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
</style>`;

/**
 * LES PIÈCES, EN LOT.
 *
 * Rien n'est produit pour un dossier que la sélection n'a pas retenu : c'est la
 * direction qui arrête qui reçoit un titre, pas une requête.
 */
r.post('/pieces', authRequired,
       roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur'),
       async (req, res) => {
  const { section, annee, etudiants: ids, pieces, date_deliberation } = req.body || {};
  if (!section) return res.status(400).json({ error: 'section requise' });
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

  const pages = [];
  const styles = new Set();
  const manques = [];

  if (veut.includes('diplome')) {
    const modele = await modeleDiplome();
    const ectsTotal = dossier.requises.length
      ? db.prepare(`SELECT SUM(n) AS t FROM (SELECT ue_num, MAX(ects) AS n FROM ue
          WHERE ue_num IN (${dossier.requises.map(() => '?').join(',')})
          GROUP BY ue_num)`).get(...dossier.requises)?.t : null;

    for (const d of choisis) {
      const { html, manques: m } = remplir(modele, {
        nom_etudiant: d.nom, prenom_etudiant: d.prenom,
        genre: d.genre === 'F' ? 'F' : d.genre === 'H' ? 'H' : '',
        lieu_naissance: d.lieu_naissance, date_naissance: dateLongue(d.date_naissance),
        annee: an, mention: d.mention.mention,
        intitule_section: sec.libelle, code_section: sec.code_fwb || sec.code,
        domaine: sec.domaine, grade_academique: sec.niveau || sec.libelle,
        total_ects: ectsTotal, duree_annees: sec.duree_annees || 3,
        date_deliberation: dateLongue(dateDelib),
        ville_etab: ident.ville, directeur: ident.directeur,
        president_jury: presidence?.titulaire?.nom || ident.directeur,
        titulaire_nom: presidence?.titulaire?.nom || '',
        article_titulaire: 'Le', date_approbation: sec.date_approbation,
        logo_helb: '',
      });
      pages.push({ t: `Diplôme — ${d.nom} ${d.prenom}`, h: html, entier: true });
      if (m.length) manques.push(`Diplôme de ${d.nom} ${d.prenom} : ${m.join(', ')}`);
    }
  }

  if (veut.includes('attestation')) {
    styles.add(STYLE_SECTION);
    for (const d of choisis) {
      pages.push({ t: `Attestation de section — ${d.nom} ${d.prenom}`,
                   h: attestationSection(d, ctx) });
    }
  }

  res.json({
    section: sec.code, annee: an, date_deliberation: dateDelib,
    pieces: pages.map(p => p.t),
    // Le diplôme porte sa propre page complète (paysage, sans marge ni pied) :
    // il ne s'enveloppe pas comme les autres et ne se mêle pas à elles.
    diplomes: pages.filter(p => p.entier).map(p => p.h),
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
      <div class="sous">ENSEIGNEMENT DE PROMOTION SOCIALE</div>
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
    .cloture .legende { text-align:center; }
    .cloture .legende .nom { font-weight:700; color:#1B2B4B; }
  </style>`;

  return { corps, style, avec_epreuve_integree: avecEI, section: sec, organe };
}

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

/**
 * Le PV de section, pour les étudiants qu'on lui donne. La direction arrête qui
 * y figure : on ne devine pas une délibération.
 */
r.post('/pv-section', authRequired,
       roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur'), (req, res) => {
  const { section, annee, etudiants: ids, session, lieu, date } = req.body || {};
  if (!section) return res.status(400).json({ error: 'section requise' });
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
  const det = requises.length ? db.prepare(`
    SELECT ue_num,
           MAX(COALESCE(ue_tot_prf, COALESCE(ue_per_cours, 0) + COALESCE(ue_aut, 0))) AS periodes
    FROM ue WHERE ue_num IN (${requises.map(() => '?').join(',')})
      AND ue_det = 'x' GROUP BY ue_num`).all(...requises) : [];

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
      ei_pourcent: coteEI == null ? null : Math.round(Number(coteEI) * 5 * 10) / 10,
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
