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
  const dansSections = sections?.length
    ? ` AND u.section IN (${sections.map(() => '?').join(',')})` : '';
  const args = sections?.length ? [annee, ...sections] : [annee];

  const lignes = db.prepare(`
    SELECT i.etudiant_id, i.ue_num, u.section, u.ue_nom, u.ue_niv,
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
    return { ...l, s1, s2,
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

/** L'année d'un étudiant dans sa section, telle que l'unité la porte. */
const niveauDe = l => (l.ue_niv ? `BA${String(l.ue_niv).replace(/\D/g, '') || '?'}` : null);

r.get('/', authRequired, (req, res) => {
  const annee = req.query.annee || anneeDeTravail(req);
  const perim = getUserSections(req.user);
  const demandee = req.query.section ? [req.query.section] : null;
  const sections = demandee
    ? (perim ? demandee.filter(s => perim.includes(s)) : demandee)
    : (perim || null);

  const lignes = decisions(annee, sections);

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
