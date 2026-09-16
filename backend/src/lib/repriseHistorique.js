import db from '../db/index.js';

/**
 * CLÔTURER UNE ANNÉE QU'AUCUN CONSEIL N'A CLÔTURÉE DANS LUCIE.
 *
 * Les années reprises d'Excel portent des décisions — réussi, ajourné, refusé —
 * mais aucune motivation : le Conseil s'est tenu, il a décidé, et ce qu'il a
 * dit n'a jamais été consigné ailleurs que dans la mémoire de ceux qui y
 * étaient. Les dossiers sont donc incomplets là où le règlement exige une
 * motivation acquis par acquis (RDE art. 88 §3), et le rester ne les répare
 * pas.
 *
 * ON PEUT DONC ÉCRIRE — À UNE CONDITION. Ce qui s'écrit ici n'est pas une
 * motivation du Conseil : c'est une reconstitution faite après coup, par
 * l'administration, sur la base des seules notes. La faire passer pour l'autre
 * serait le seul vrai danger — « une reprise d'historique ne doit jamais
 * pouvoir se faire passer pour une délibération tenue ». D'où trois marques,
 * et pas une de moins :
 *
 *  · `decision_motivation.source = 'reprise'` — la ligne se distingue pour
 *    toujours de ce que le Conseil a rédigé (`conseil`) et de ce qu'il a
 *    accepté en bloc à la clôture (`propose`).
 *  · `deliberation_seance.reprise = 1` — la séance elle-même dit qu'elle n'a
 *    pas été tenue dans Lucie : elle est reconstituée d'archives.
 *  · Une MENTION sur la pièce remise à l'étudiant. C'est celle-là qui compte :
 *    les deux autres protègent la base, celle-ci protège l'étudiant, qui doit
 *    savoir ce qu'il a entre les mains avant de décider d'un recours.
 *
 * CE QU'ELLE NE FAIT JAMAIS :
 *  · elle n'octroie aucune faveur — un octroi est une décision du Conseil, et
 *    le Conseil ne se rejoue pas quinze mois plus tard ;
 *  · elle ne change aucune décision — ni un résultat, ni une note ;
 *  · elle n'écrase aucune motivation existante, de quelque source qu'elle soit.
 *
 * Elle est donc strictement ADDITIVE : elle ne remplit que des blancs.
 */

/**
 * L'ÉNONCÉ DE REPRISE, décidé par la direction et volontairement UNIFORME.
 *
 * On pourrait calculer une phrase par acquis, comme le fait `motifPropose`
 * pour une délibération en cours. Ce serait une erreur ici : une phrase
 * individualisée laisse croire à un examen individuel qui n'a pas eu lieu
 * sous cette forme. L'uniformité est ce qui rend la reprise lisible pour ce
 * qu'elle est.
 */
export const MOTIF_REPRISE =
  'Les compétences ne sont pas acquises : la théorie n’est pas suffisamment '
  + 'bien appliquée à la pratique.';

/** La mention portée par toute pièce issue d'une séance reprise. */
export const MENTION_REPRISE =
  'Décision reprise des archives de l’établissement. La motivation a été '
  + 'reconstituée a posteriori par l’administration sur la base des '
  + 'évaluations consignées ; elle ne reproduit pas les termes employés par '
  + 'le Conseil des études en séance.';

export function migrerReprise(dbx = db) {
  try {
    const cols = dbx.prepare('PRAGMA table_info(deliberation_seance)').all().map(c => c.name);
    if (cols.length && !cols.includes('reprise')) {
      dbx.exec('ALTER TABLE deliberation_seance ADD COLUMN reprise INTEGER NOT NULL DEFAULT 0');
      console.log('[migration] deliberation_seance.reprise ajoutée');
    }
    if (cols.length && !cols.includes('reprise_motif')) {
      dbx.exec('ALTER TABLE deliberation_seance ADD COLUMN reprise_motif TEXT');
      console.log('[migration] deliberation_seance.reprise_motif ajoutée');
    }
  } catch (e) { console.error('[migration] reprise :', e.message); }
}

/** Une séance est-elle reconstituée d'archives ? Lu par les pièces. */
export function seanceReprise(ueNum, annee, session = 1) {
  try {
    const l = db.prepare(`
      SELECT reprise FROM deliberation_seance
      WHERE ue_num = ? AND annee_scolaire = ? AND session = ?
    `).get(ueNum, annee, session);
    return !!l?.reprise;
  } catch { return false; }
}

/**
 * LE RELEVÉ DE CE QUI SERAIT ÉCRIT — et rien d'autre.
 *
 * « Rien ne s'écrit sans qu'on ait vu ce qui sera écrit » : la simulation
 * n'est pas une politesse, c'est la seule façon de voir qu'on s'apprête à
 * motiver trois cents dossiers d'un coup.
 *
 * @param {string} annee   l'année scolaire, p. ex. '2024-2025'
 * @param {object} opts    { motif }
 */
export function simulerReprise(annee, opts = {}) {
  const motif = (opts.motif || MOTIF_REPRISE).trim();

  // LES ACQUIS À MOTIVER SE DÉDUISENT DES DÉCISIONS DÉFAVORABLES, et d'elles
  // seules. Une unité réussie ne se motive pas ; une unité octroyée non plus —
  // la faveur est l'inverse d'un échec.
  const inscriptions = db.prepare(`
    SELECT i.etudiant_id, i.ue_num, i.resultat,
           e.nom, e.prenom
      FROM etudiant_inscription i
      JOIN etudiant e ON e.id = i.etudiant_id
     WHERE i.annee_scolaire = @annee
       AND i.resultat IN ('ajourne', 'refuse')
     ORDER BY e.nom, e.prenom, i.ue_num
  `).all({ annee });

  const dejaMotive = new Set(db.prepare(`
    SELECT etudiant_id || '|' || ue_num || '|' || aa_code AS k
      FROM decision_motivation WHERE annee_scolaire = ?
  `).all(annee).map(l => l.k));

  // Les acquis en défaut : sous le seuil, ou sans note. On ne relit PAS les
  // notes pour notre compte — la note consolidée par acquis fait foi.
  const acquisEnDefaut = db.prepare(`
    SELECT aa.aa_code
      FROM aa
     WHERE aa.ue_num = @ue
       AND NOT EXISTS (
         SELECT 1 FROM etudiant_note_detail n
          WHERE n.etudiant_id = @etud AND n.annee_scolaire = @annee
            AND n.ue_num = @ue AND n.type = 'aa'
            AND (n.code = aa.aa_code OR n.code LIKE '%|' || aa.aa_code)
            AND n.points IS NOT NULL AND CAST(n.points AS REAL) >= 10
       )
     ORDER BY aa.aa_code
  `);

  const aEcrire = [];
  const sansAcquis = [];
  for (const i of inscriptions) {
    const codes = acquisEnDefaut.all({ etud: i.etudiant_id, ue: i.ue_num, annee })
      .map(a => a.aa_code)
      .filter(c => !dejaMotive.has(`${i.etudiant_id}|${i.ue_num}|${c}`));
    if (!codes.length) {
      // Soit tout est déjà motivé, soit le référentiel de l'unité est vide :
      // dans le second cas la reprise ne peut rien écrire, et le dire vaut
      // mieux que de laisser croire le dossier complet.
      const total = db.prepare('SELECT COUNT(*) n FROM aa WHERE ue_num = ?').get(i.ue_num)?.n || 0;
      if (!total) sansAcquis.push(i);
      continue;
    }
    aEcrire.push({ ...i, acquis: codes });
  }

  // Les séances à marquer : celles des unités touchées, plus toutes celles de
  // l'année qui ne sont pas closes — clôturer, c'est clôturer l'année.
  const seances = db.prepare(`
    SELECT s.ue_num, s.session, s.cloturee, s.reprise
      FROM deliberation_seance s WHERE s.annee_scolaire = ?
  `).all(annee);
  const unites = [...new Set(inscriptions.map(i => i.ue_num))];
  const aClore = unites.filter(u =>
    !seances.some(s => s.ue_num === u && s.session === 1 && s.cloturee));

  return {
    annee, motif,
    motivations: aEcrire,
    nb_motivations: aEcrire.reduce((n, e) => n + e.acquis.length, 0),
    nb_dossiers: aEcrire.length,
    nb_etudiants: new Set(aEcrire.map(e => e.etudiant_id)).size,
    unites_sans_referentiel: sansAcquis,
    seances_a_clore: aClore,
    deja_motivees: dejaMotive.size,
  };
}

/**
 * L'ÉCRITURE. Elle n'accepte que ce que la simulation a montré, et n'écrit
 * que là où la base est vide.
 */
export function appliquerReprise(annee, opts = {}) {
  migrerReprise();
  const plan = simulerReprise(annee, opts);
  const qui = opts.par || null;

  const ecrit = db.transaction(() => {
    const poser = db.prepare(`
      INSERT INTO decision_motivation
        (etudiant_id, annee_scolaire, ue_num, aa_code, motif, portee, source, maj_le, maj_par)
      VALUES (?,?,?,?,?,'aa','reprise',datetime('now'),?)
      ON CONFLICT(etudiant_id, annee_scolaire, ue_num, aa_code) DO NOTHING`);
    let n = 0;
    for (const e of plan.motivations) {
      for (const code of e.acquis) {
        n += poser.run(e.etudiant_id, annee, e.ue_num, code, plan.motif, qui).changes;
      }
    }

    // La séance : close, et MARQUÉE reprise. On ne lui invente ni date ni
    // président — une date fausse sur une pièce qui ouvre un recours est pire
    // que pas de date du tout.
    const seance = db.prepare(`
      INSERT INTO deliberation_seance
        (ue_num, annee_scolaire, session, cloturee, reprise, reprise_motif, maj_le, maj_par)
      VALUES (?,?,1,1,1,?,datetime('now'),?)
      ON CONFLICT(ue_num, annee_scolaire, session) DO UPDATE SET
        cloturee = 1, reprise = 1,
        reprise_motif = COALESCE(deliberation_seance.reprise_motif, excluded.reprise_motif),
        maj_le = datetime('now'), maj_par = excluded.maj_par`);
    let s = 0;
    for (const u of plan.seances_a_clore) {
      s += seance.run(u, annee, MENTION_REPRISE, qui).changes;
    }
    return { motivations: n, seances: s };
  })();

  return { ...plan, ecrit };
}

export default { simulerReprise, appliquerReprise, MOTIF_REPRISE, MENTION_REPRISE };
