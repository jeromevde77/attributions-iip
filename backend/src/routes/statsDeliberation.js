// ─────────────────────────────────────────────────────────────────────────────
// Lucie — LES CHIFFRES DE LA DÉLIBÉRATION
//
// Combien réussissent, combien sont ajournés, combien refusés — par unité, par
// cours, par section et par année. Ces chiffres se reconstituaient à la main,
// classeur par classeur, une fois l'an, pour le rapport d'activité. Ils sont
// pourtant DÉJÀ EN BASE : c'est ce que le Conseil a décidé.
//
// SUR CE QUE LUCIE DÉLIBÈRE, ET RIEN D'AUTRE. La source est
// « deliberation_resultat » — la trace de séance, décision par décision, avec
// sa session. Le dossier de l'étudiant ne la complète que là où elle se tait :
// une année reprise du classeur porte souvent sa décision au seul dossier, et
// l'ignorer viderait de moitié les statistiques d'une section entière.
//
// LA SECONDE SESSION NE SE COMPTE QUE SUR LES AJOURNÉS. Le classeur Excel
// recopiait en septembre la décision de juin pour toute la promotion : compter
// ces lignes donnait des taux de réussite au-delà de cent pour cent. Ici, ne
// compte en S2 que celui qui était ajourné en S1 — les autres ne repassent
// rien, le refus étant définitif (RGE art. 69 §2) et la réussite non rejugée.
//
// LE TAUX SE CALCULE SUR LES DÉCIDÉS, jamais sur les inscrits : un inscrit sans
// décision n'est pas un échec, c'est un dossier à finir. Il se compte à part,
// et c'est souvent lui qu'on cherchait sans le savoir.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, getUserSections } from '../middleware/auth.js';
import { anneeDeTravail } from '../helpers/annee.js';

const r = Router();

const SEUIL = 10;

/**
 * DE QUELLE SECTION EST CE DOSSIER ?
 *
 * Par défaut, de celle de l'unité : une unité appartient à un cursus, et ses
 * inscrits sont les étudiants de ce cursus. Mais certaines unités s'ajoutent au
 * programme d'étudiants de plusieurs sections — l'UE 95 porte « Restart »
 * parce que l'import de mai l'a rangée là, non parce qu'elle lui appartient.
 * Tant que sa section déclarée comptait, chaque inscrit tombait dans Restart :
 * effectifs, taux de réussite et cotes d'une section entière s'en trouvaient
 * faussés, en silence.
 *
 * Pour ces unités-là — celles marquées « hors cursus » —, c'est la SECTION DE
 * L'ÉTUDIANT qui compte : inscrit en Restart, il compte en Restart ; inscrit
 * ailleurs, il compte ailleurs. Le rattachement explicite fait foi, la
 * déduction ne sert qu'à défaut, et elle ignore elle-même les unités hors
 * cursus — sans quoi l'héritage d'import trancherait encore.
 *
 * Un étudiant qui ne porte QUE des unités hors cursus n'a pas de cursus : sa
 * section reste nulle, et son dossier se compte à part plutôt que d'être
 * attribué au hasard.
 */
function resolveurSection(annee) {
  const parEtudiant = new Map();
  for (const e of db.prepare(`
    SELECT id, section_rattachement FROM etudiant WHERE section_rattachement IS NOT NULL
  `).all()) parEtudiant.set(e.id, e.section_rattachement);

  // La déduction, en un seul passage plutôt qu'une requête par étudiant.
  const compte = new Map();
  for (const l of db.prepare(`
    SELECT i.etudiant_id, u.section
      FROM etudiant_inscription i
      JOIN ue u ON u.ue_num = i.ue_num AND u.annee_scolaire = i.annee_scolaire
     WHERE i.annee_scolaire = ? AND u.section IS NOT NULL
       AND COALESCE(u.hors_cursus, 0) = 0
  `).all(annee)) {
    if (!compte.has(l.etudiant_id)) compte.set(l.etudiant_id, new Map());
    const m = compte.get(l.etudiant_id);
    m.set(l.section, (m.get(l.section) || 0) + 1);
  }
  for (const [id, m] of compte) {
    if (parEtudiant.has(id)) continue;
    const gagnante = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    if (gagnante) parEtudiant.set(id, gagnante[0]);
  }

  return (ligne) => (Number(ligne.hors_cursus) === 1
    ? (parEtudiant.get(ligne.etudiant_id) || null)
    : (ligne.section || null));
}
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);

/** Un compteur vide, pour n'avoir jamais à tester l'existence d'une case. */
const vide = () => ({
  inscrits: 0,
  s1: { reussi: 0, ajourne: 0, refuse: 0, absent: 0, decides: 0, sans_decision: 0 },
  s2: { reussi: 0, refuse: 0, ajourne: 0, absent: 0, decides: 0, attendus: 0 },
  final: { reussi: 0, refuse: 0, en_attente: 0 },
});

function taux(c) {
  return {
    ...c,
    s1: { ...c.s1,
      taux_reussite: pct(c.s1.reussi, c.s1.decides),
      taux_ajournement: pct(c.s1.ajourne, c.s1.decides),
      taux_refus: pct(c.s1.refuse, c.s1.decides) },
    s2: { ...c.s2,
      taux_reussite: pct(c.s2.reussi, c.s2.decides),
      taux_refus: pct(c.s2.refuse, c.s2.decides),
      // Combien des ajournés de juin sont effectivement revenus être décidés.
      taux_retour: pct(c.s2.decides, c.s2.attendus) },
    final: { ...c.final,
      taux_reussite: pct(c.final.reussi,
        c.final.reussi + c.final.refuse) },
  };
}

/**
 * LA LECTURE DE BASE : une décision par (étudiant, unité, session).
 *
 * La trace de séance fait foi ; le dossier ne comble que ses silences. On sort
 * une ligne par étudiant et par unité, portant sa décision de juin, celle de
 * septembre s'il y en a une, et le résultat final qui en découle.
 */
function decisions(annee, sections) {
  // LE FILTRE NE PEUT PLUS SE FAIRE EN SQL SEUL : pour une unité hors cursus,
  // la section n'est connue qu'une fois l'étudiant résolu. On ramène donc ces
  // lignes-là dans tous les cas, et on filtre après résolution.
  const dansSections = sections?.length
    ? ` AND (u.section IN (${sections.map(() => '?').join(',')})`
      + ' OR COALESCE(u.hors_cursus, 0) = 1)' : '';
  const args = sections?.length ? [annee, ...sections] : [annee];
  const sectionDe = resolveurSection(annee);

  const lignes = db.prepare(`
    SELECT i.etudiant_id, i.ue_num, u.section, u.ue_nom, u.ue_niv,
           COALESCE(u.hors_cursus, 0) AS hors_cursus,
           i.resultat AS dossier,
           (SELECT resultat FROM deliberation_resultat d
             WHERE d.etudiant_id = i.etudiant_id AND d.annee_scolaire = i.annee_scolaire
               AND d.ue_num = i.ue_num AND d.session = 1) AS trace1,
           (SELECT resultat FROM deliberation_resultat d
             WHERE d.etudiant_id = i.etudiant_id AND d.annee_scolaire = i.annee_scolaire
               AND d.ue_num = i.ue_num AND d.session = 2) AS trace2
    FROM etudiant_inscription i
    LEFT JOIN ue u ON u.ue_num = i.ue_num AND u.annee_scolaire = i.annee_scolaire
    WHERE i.annee_scolaire = ?${dansSections}
  `).all(...args);

  const net = v => {
    const t = String(v || '').trim().toLowerCase();
    return ['reussi', 'ajourne', 'refuse', 'absent', 'valorise'].includes(t) ? t : null;
  };

  return lignes.map(l => {
    // La trace d'abord, le dossier ensuite — et jamais l'union des deux, qui
    // faisait revenir en septembre des étudiants refusés en juin.
    const s1 = net(l.trace1) || net(l.dossier);
    const s2 = net(l.trace2);
    return { ...l, section: sectionDe(l), s1, s2,
      // Une valorisation est une réussite acquise autrement : elle compte comme
      // telle au final, mais elle n'a pas été délibérée en séance.
      final: s2 || (s1 === 'ajourne' ? null : s1) };
  });
}

/**
 * LES CHIFFRES, PAR CE QU'ON VEUT.
 * `clef` dit comment regrouper : par unité, par section, par niveau d'année.
 */
function agreger(lignes, clef) {
  const par = new Map();
  for (const l of lignes) {
    const k = clef(l);
    if (k == null) continue;
    const c = par.get(k) || par.set(k, vide()).get(k);
    c.inscrits++;

    if (!l.s1) { c.s1.sans_decision++; }
    else {
      c.s1.decides++;
      if (l.s1 === 'valorise') c.s1.reussi++;
      else c.s1[l.s1] = (c.s1[l.s1] || 0) + 1;
    }

    // N'est attendu en septembre que l'ajourné de juin.
    if (l.s1 === 'ajourne') {
      c.s2.attendus++;
      if (l.s2) { c.s2.decides++; c.s2[l.s2] = (c.s2[l.s2] || 0) + 1; }
    }

    if (l.final === 'reussi' || l.final === 'valorise') c.final.reussi++;
    else if (l.final === 'refuse' || l.final === 'absent') c.final.refuse++;
    else c.final.en_attente++;
  }
  return par;
}


/*
 * ── LA DISTRIBUTION, ET PAS SEULEMENT LA MOYENNE ──────────────────────────
 *
 * Une moyenne seule ment par omission. Deux cours à 12 de moyenne peuvent
 * cacher, l'un une promotion homogène, l'autre deux paquets d'étudiants à 6 et
 * à 18 — et ce n'est pas la même conversation en Conseil. D'où trois mesures,
 * qui ne disent pas la même chose :
 *
 *  · LA MOYENNE se déplace avec les extrêmes. Trois absents notés zéro la font
 *    chuter de deux points sans que personne n'ait moins bien travaillé.
 *  · LA MÉDIANE coupe la promotion en deux : la moitié fait mieux, la moitié
 *    fait moins bien. Elle ne bouge pas parce qu'un étudiant a eu 2.
 *  · LE MODE est la note la plus fréquente. Sur des cotes arrondies, c'est
 *    souvent le chiffre que le correcteur a le plus écrit — et l'écart entre
 *    le mode et la moyenne en dit long sur la forme de la distribution.
 *
 * Quand deux valeurs sont également fréquentes, il n'y a pas UN mode : on les
 * rend toutes plutôt que d'en choisir une au hasard.
 */
function distribution(valeurs) {
  const v = valeurs.filter(x => x !== null && x !== undefined && Number.isFinite(Number(x)))
    .map(Number).sort((a, b) => a - b);
  if (!v.length) return { n: 0, moyenne: null, mediane: null, mode: null, min: null, max: null };

  const somme = v.reduce((t, x) => t + x, 0);
  const m = v.length % 2
    ? v[(v.length - 1) / 2]
    : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;

  const freq = new Map();
  for (const x of v) freq.set(x, (freq.get(x) || 0) + 1);
  const maxi = Math.max(...freq.values());
  // Un mode qui n'apparaît qu'une fois n'est pas un mode : c'est une liste de
  // valeurs toutes distinctes, et le dire vaut mieux que d'en désigner une.
  const modes = maxi < 2 ? [] : [...freq.entries()].filter(([, n]) => n === maxi).map(([x]) => x);

  const r1 = x => Math.round(x * 10) / 10;
  return {
    n: v.length,
    moyenne: r1(somme / v.length),
    mediane: r1(m),
    mode: modes.length ? modes.map(r1) : null,
    mode_effectif: modes.length ? maxi : null,
    min: v[0], max: v[v.length - 1],
  };
}

/** Regrouper des valeurs par une clé, puis en donner la distribution. */
function distributions(lignes, clef, valeur) {
  const par = new Map();
  for (const l of lignes) {
    const k = clef(l);
    if (k == null) continue;
    if (!par.has(k)) par.set(k, []);
    par.get(k).push(valeur(l));
  }
  return par;
}

/**
 * LA CATÉGORIE DE FORMATION — bachelier, BES, formation continue.
 *
 * Elle vit dans `section.niveau`, et elle n'est remplie que si quelqu'un l'a
 * saisie : aucun import ne l'alimente. Une section non qualifiée n'est donc pas
 * rangée d'office quelque part — elle est rendue sous « (non qualifiée) », ce
 * qui se voit et se corrige, au lieu de fausser un total en silence.
 */
function categories() {
  const m = new Map();
  try {
    for (const s of db.prepare('SELECT code, niveau FROM section').all()) {
      m.set(s.code, s.niveau || null);
    }
  } catch { /* table absente : tout sera « non qualifiée » */ }
  return m;
}
const CATEGORIES = {
  tout: () => true,
  bachelier: n => n === 'Bachelier',
  bes: n => n === 'BES',
  master: n => n === 'Master',
  continue: n => typeof n === 'string' && n.startsWith('FC'),
  non_qualifiee: n => !n,
};

/** L'année d'un étudiant dans sa section, telle que l'unité la porte. */
const niveauDe = l => (l.ue_niv ? `BA${String(l.ue_niv).replace(/\D/g, '') || '?'}` : null);


/**
 * ── GET /distributions ────────────────────────────────────────────────────
 *
 * Moyenne, médiane et mode — de quatre choses qui n'ont rien à voir entre
 * elles, et qu'il faut donc nommer :
 *
 *  · COTES D'UNITÉ : les points de la délibération, ce qui fait foi.
 *  · COTES DE COURS : les notes encodées par acquis. N'existent que pour les
 *    unités dont les acquis ont été saisis — une section qui délibère sans
 *    encoder n'y apparaît pas, et c'est un fait, pas un oubli.
 *  · EFFECTIFS : la taille des groupes. La médiane y est plus parlante que la
 *    moyenne, qu'une seule grosse unité suffit à tirer vers le haut.
 *  · UNITÉS PAR ÉTUDIANT : combien d'UE chacun porte dans son PAE.
 *
 * `categorie` filtre sur le niveau de la section (bachelier, BES, formation
 * continue). `tout` par défaut.
 */
r.get('/distributions', authRequired, (req, res) => {
  const annee = req.query.annee || anneeDeTravail(req);
  const perim = getUserSections(req.user);
  const demandee = req.query.section ? [req.query.section] : null;
  const sections = demandee
    ? (perim ? demandee.filter(s => perim.includes(s)) : demandee)
    : (perim || null);

  const cat = CATEGORIES[req.query.categorie] ? req.query.categorie : 'tout';
  const niveaux = categories();
  const retenue = (section) => CATEGORIES[cat](niveaux.get(section) ?? null);

  // Même règle qu'ailleurs : une unité hors cursus revient dans tous les cas,
  // sa section n'étant connue qu'une fois l'étudiant résolu.
  const dansSections = sections?.length
    ? ` AND (u.section IN (${sections.map(() => '?').join(',')})`
      + ' OR COALESCE(u.hors_cursus, 0) = 1)' : '';
  const args = sections?.length ? [annee, ...sections] : [annee];
  const sectionDe = resolveurSection(annee);
  // Retenue = dans la catégorie demandée ET, s'il y a un périmètre, dedans.
  const garde = (l) => {
    const sec = sectionDe(l);
    if (sections?.length && !(sec && sections.includes(sec))) return false;
    return retenue(sec);
  };

  // ── LES COTES D'UNITÉ ───────────────────────────────────────────────────
  // La trace de séance d'abord ; le dossier ne comble que ses silences —
  // la même règle que partout ailleurs dans ce module.
  const cotesUe = db.prepare(`
    SELECT i.ue_num, u.section, u.ue_nom, i.etudiant_id,
           COALESCE(u.hors_cursus, 0) AS hors_cursus,
           COALESCE((SELECT d.points FROM deliberation_resultat d
                      WHERE d.etudiant_id = i.etudiant_id
                        AND d.annee_scolaire = i.annee_scolaire
                        AND d.ue_num = i.ue_num AND d.session = 1),
                    i.points) AS points
      FROM etudiant_inscription i
      LEFT JOIN ue u ON u.ue_num = i.ue_num AND u.annee_scolaire = i.annee_scolaire
     WHERE i.annee_scolaire = ?${dansSections}
  `).all(...args).filter(garde).map(l => ({ ...l, section: sectionDe(l) }));

  // ── LES COTES DE COURS ──────────────────────────────────────────────────
  const cotesCours = db.prepare(`
    SELECT n.code, n.points, n.ue_num, u.section, u.ue_nom, n.etudiant_id,
           COALESCE(u.hors_cursus, 0) AS hors_cursus
      FROM etudiant_note_detail n
      LEFT JOIN ue u ON u.ue_num = n.ue_num AND u.annee_scolaire = n.annee_scolaire
     WHERE n.annee_scolaire = ? AND n.type = 'aa' AND n.points IS NOT NULL${dansSections}
  `).all(...args)
    .filter(garde)
    .map(l => ({ ...l, section: sectionDe(l) }))
    // Le code d'un acquis s'écrit « CODECOURS|ACQUIS » : le cours est devant.
    .map(l => ({ ...l, cours_code: String(l.code || '').split('|')[0] || null }))
    .filter(l => l.cours_code);

  // ── LES EFFECTIFS ───────────────────────────────────────────────────────
  const effectifs = db.prepare(`
    SELECT i.ue_num, u.section, u.ue_nom, COALESCE(u.hors_cursus, 0) AS hors_cursus,
           COUNT(DISTINCT i.etudiant_id) AS n
      FROM etudiant_inscription i
      LEFT JOIN ue u ON u.ue_num = i.ue_num AND u.annee_scolaire = i.annee_scolaire
     WHERE i.annee_scolaire = ?${dansSections}
     GROUP BY i.ue_num
  `).all(...args)
    // UN EFFECTIF EST LA TAILLE D'UN GROUPE, et un groupe hors cursus est
    // réellement mixte : l'attribuer à une section serait inventer. Il sort
    // donc des effectifs par section, et reste dans l'ensemble.
    .map(l => ({ ...l, section: Number(l.hors_cursus) === 1 ? null : l.section }))
    .filter(l => retenue(l.section));

  // ── LES UNITÉS PAR ÉTUDIANT ─────────────────────────────────────────────
  // Un étudiant peut suivre des unités de plusieurs sections : on le compte
  // une fois, et sa section est celle où il porte le plus d'unités.
  // LA SECTION D'UN ÉTUDIANT NE SE DEVINE PLUS ICI : le résolveur la donne,
  // rattachement explicite d'abord, déduction ensuite — une seule règle pour
  // tout le module, au lieu d'une majorité recalculée dans son coin.
  const lignesEtu = db.prepare(`
    SELECT i.etudiant_id, i.ue_num, u.section,
           COALESCE(u.hors_cursus, 0) AS hors_cursus
      FROM etudiant_inscription i
      LEFT JOIN ue u ON u.ue_num = i.ue_num AND u.annee_scolaire = i.annee_scolaire
     WHERE i.annee_scolaire = ?${dansSections}
  `).all(...args);
  const parEtudiant = new Map();
  for (const l of lignesEtu) {
    if (!parEtudiant.has(l.etudiant_id)) parEtudiant.set(l.etudiant_id, { n: 0, ligne: l });
    parEtudiant.get(l.etudiant_id).n++;
  }
  const etudiants = [...parEtudiant.entries()].map(([id, e]) => ({
    etudiant_id: id, n: e.n,
    section: sectionDe({ ...e.ligne, hors_cursus: 1, etudiant_id: id }),
  })).filter(e => (!sections?.length || (e.section && sections.includes(e.section)))
                  && retenue(e.section));

  const sortir = (map, libelle) => [...map.entries()]
    .map(([cle, valeurs]) => ({ cle, libelle: libelle ? libelle(cle) : String(cle),
                                ...distribution(valeurs) }))
    .filter(x => x.n > 0)
    .sort((a, b) => String(a.cle).localeCompare(String(b.cle), 'fr', { numeric: true }));

  const nomUe = new Map(cotesUe.concat(effectifs).map(l => [l.ue_num, l.ue_nom]));
  const titreUe = k => `UE ${k}${nomUe.get(Number(k)) ? ` — ${nomUe.get(Number(k))}` : ''}`;

  res.json({
    annee,
    categorie: cat,
    sections: sections || 'toutes',
    // Ce qui n'est pas qualifié se dit : sans quoi un filtre « bachelier »
    // paraîtrait exhaustif alors qu'il ignore les sections non renseignées.
    sections_non_qualifiees: [...new Set(
      [...cotesUe, ...effectifs].map(l => l.section)
        .filter(sec => sec && !niveaux.get(sec)))].sort(),

    cotes_ue: {
      ensemble: distribution(cotesUe.map(l => l.points)),
      par_ue: sortir(distributions(cotesUe, l => l.ue_num, l => l.points), titreUe),
      par_section: sortir(distributions(cotesUe, l => l.section, l => l.points)),
    },
    cotes_cours: {
      ensemble: distribution(cotesCours.map(l => l.points)),
      par_cours: sortir(distributions(cotesCours, l => l.cours_code, l => l.points)),
      par_ue: sortir(distributions(cotesCours, l => l.ue_num, l => l.points), titreUe),
      par_section: sortir(distributions(cotesCours, l => l.section, l => l.points)),
    },
    effectifs: {
      ensemble: distribution(effectifs.map(l => l.n)),
      par_section: sortir(distributions(effectifs, l => l.section, l => l.n)),
      detail_ue: effectifs.map(l => ({ ue_num: l.ue_num, libelle: titreUe(l.ue_num),
                                       section: l.section, n: l.n }))
        .sort((a, b) => b.n - a.n),
    },
    ue_par_etudiant: {
      ensemble: distribution(etudiants.map(e => e.n)),
      par_section: sortir(distributions(etudiants, e => e.section, e => e.n)),
      etudiants: etudiants.length,
    },
  });
});

r.get('/', authRequired, (req, res) => {
  const annee = req.query.annee || anneeDeTravail(req);
  const perim = getUserSections(req.user);
  const demandee = req.query.section ? [req.query.section] : null;
  const sections = demandee
    ? (perim ? demandee.filter(s => perim.includes(s)) : demandee)
    : (perim || null);

  // Le filtre s'achève ici : une unité hors cursus n'est retenue que si la
  // section de SON étudiant est dans le périmètre demandé.
  const lignes = decisions(annee, sections)
    .filter(l => !sections?.length || (l.section && sections.includes(l.section)));

  const nomsUE = new Map(lignes.map(l => [l.ue_num, l.ue_nom]));
  const secUE = new Map(lignes.map(l => [l.ue_num, l.section]));

  const sortir = (m, nom) => [...m.entries()]
    .map(([k, c]) => ({ cle: k, libelle: nom ? nom(k) : String(k), ...taux(c) }))
    .sort((a, b) => String(a.cle).localeCompare(String(b.cle), 'fr', { numeric: true }));

  // ── PAR COURS ────────────────────────────────────────────────────────────
  //
  // Un cours n'a pas de décision : le Conseil délibère l'unité. Ce qu'on peut
  // dire d'un cours, c'est la note qu'il a produite — combien l'ont eu au
  // seuil, combien en dessous, et sa moyenne. C'est un indicateur d'évaluation,
  // pas de délibération, et le distinguer évite de faire dire à ces chiffres
  // ce qu'ils ne disent pas.
  const dansSections = sections?.length
    ? ` AND u.section IN (${sections.map(() => '?').join(',')})` : '';
  const argsC = sections?.length ? [annee, ...sections] : [annee];
  const parCours = db.prepare(`
    SELECT c.cours_code, c.cours_nom, c.ue_num, u.section,
           COUNT(n.points) AS notes,
           AVG(n.points) AS moyenne,
           SUM(CASE WHEN n.points >= ${SEUIL} THEN 1 ELSE 0 END) AS au_seuil
    FROM cours c
    LEFT JOIN ue u ON u.ue_num = c.ue_num AND u.annee_scolaire = c.annee_scolaire
    LEFT JOIN etudiant_note_detail n
      ON n.annee_scolaire = c.annee_scolaire AND n.ue_num = c.ue_num
     AND n.type = 'aa' AND n.code LIKE c.cours_code || '|%'
    WHERE c.annee_scolaire = ?${dansSections}
    GROUP BY c.cours_code
    HAVING notes > 0
    ORDER BY c.cours_code
  `).all(...argsC).map(c => ({
    ...c,
    moyenne: c.moyenne == null ? null : Math.round(c.moyenne * 10) / 10,
    taux_au_seuil: pct(c.au_seuil, c.notes),
  }));

  const total = taux([...agreger(lignes, () => 'tout').values()][0] || vide());

  res.json({
    annee,
    sections: sections || 'toutes',
    total,
    par_ue: sortir(agreger(lignes, l => l.ue_num),
      k => `UE ${k}${nomsUE.get(Number(k)) ? ` — ${nomsUE.get(Number(k))}` : ''}`)
      .map(x => ({ ...x, section: secUE.get(Number(x.cle)) || null })),
    par_section: sortir(agreger(lignes, l => l.section)),
    par_niveau: sortir(agreger(lignes, niveauDe)),
    par_cours: parCours,
    // Ce qui n'est pas fini se compte à part : ce n'est pas un échec.
    dossiers_ouverts: total.s1.sans_decision,
  });
});

export default r;
