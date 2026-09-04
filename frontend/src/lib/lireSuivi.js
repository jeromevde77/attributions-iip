/**
 * Lecture d'un classeur « Suivi étudiants » — une feuille par unité.
 *
 * Structure établie sur les classeurs 2024 et 2025, seize et quinze unités,
 * toutes de forme identique :
 *
 *   ligne 1   les bandeaux de bloc : « Première session », « Deuxième Session »,
 *             « Final », qui donnent la colonne de départ de chaque bloc
 *   ligne 11  « /20 » au-dessus des notes ramenées sur vingt
 *   ligne 12  le code de l'acquis — AA246.1, AA246.2 — et, en fin de bloc,
 *             les trois colonnes F (note brute), N (note sur 20), D (décision)
 *   ligne 14+ les étudiants : matricule en 2, nom en 3, prénom en 4
 *
 * Seuls DEUX blocs portent une décision : la première session et le Final. La
 * deuxième session n'en a pas — la décision de S2 EST la décision finale.
 */

/** Les bornes de chaque bloc, d'après les bandeaux de la première ligne. */
export function repererBlocs(lignes) {
  const l1 = lignes[0] || [];
  const trouves = [];
  for (let i = 0; i < l1.length; i++) {
    const v = String(l1[i] ?? '');
    if (/premi[eè]re\s+session/i.test(v)) trouves.push({ cle: 's1', debut: i });
    else if (/deuxi[eè]me\s+session/i.test(v)) trouves.push({ cle: 's2', debut: i });
    else if (/^final/i.test(v.trim())) trouves.push({ cle: 'final', debut: i });
  }
  return trouves.map((b, k) => ({
    ...b,
    fin: k + 1 < trouves.length ? trouves[k + 1].debut - 1 : l1.length - 1,
  }));
}

/**
 * Dans un bloc : les colonnes d'acquis et les trois colonnes de décision.
 *
 * Une colonne d'acquis porte « /20 » en ligne 11 ET un code AA en ligne 12 —
 * les deux, car la ligne 12 porte aussi les codes de pondération.
 */
export function analyserBloc(lignes, bloc) {
  const l11 = lignes[10] || [];
  const l12 = lignes[11] || [];
  const acquis = [];
  const decision = {};
  const ponderations = {};

  // Les PONDÉRATIONS, que le classeur porte : ligne 9 le total, ligne 10 le
  // poids du cours, ligne 11 celui de l'acquis. Elles manquent au référentiel
  // de Lucie, alors qu'elles sont là.
  const l9 = lignes[8] || [];
  const l10 = lignes[9] || [];
  const nombre = v => {
    const n = Number(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };

  for (let i = bloc.debut; i <= bloc.fin; i++) {
    const code = String(l12[i] ?? '').trim();
    if (/^AA[\d.]+$/i.test(code) && String(l11[i] ?? '').includes('/20')) {
      // Le code est conservé TEL QUEL : le référentiel enregistre « AA246.1 »
      // avec son préfixe, et retirer celui-ci faisait que les notes importées
      // ne correspondaient à aucun acquis — colonnes vides dans la feuille.
      acquis.push({ colonne: i, aa_code: code });
    }
    // La pondération se lit sur la colonne du CODE, non sur celle des notes :
    // les deux ne coïncident pas, la ligne 12 porte le code partout.
    if (/^AA[\d.]+$/i.test(code)) {
      // l9 = pondération totale, l10 = poids du COURS, l11 = poids de l'ACQUIS.
      // Je les avais interverties : toutes les pondérations sortaient à zéro.
      const p = nombre(l11[i]);
      if (p != null) {
        ponderations[code] = {
          poids_aa: p,
          poids_cours: nombre(l10[i]),
          total: nombre(l9[i]),
        };
      }
    }
    if (code === 'F') decision.brute = i;
    if (code === 'N') decision.note = i;
    if (code === 'D') decision.decision = i;
  }
  return { acquis, decision, ponderations };
}

/** La lettre du classeur vers le vocabulaire de Lucie. */
export function versResultat(lettre) {
  const v = String(lettre ?? '').trim().toUpperCase();
  if (v === 'C') return 'reussi';
  if (v === 'R') return 'refuse';
  if (v === 'AJ') return 'ajourne';
  if (v === 'A' || v === 'NP') return 'absent';
  return null;
}

/** Une note : « NA » et le vide ne valent pas zéro, ils valent RIEN. */
export function versNote(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s || /^(NA|N\/A|-)$/i.test(s)) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 && n <= 20 ? n : null;
}

/**
 * Lit une feuille d'unité et rend une ligne par étudiant.
 *
 * @param {any[][]} lignes  la feuille, en tableau de tableaux
 * @param {number}  ueNum   le numéro d'unité, tiré du nom de la feuille
 */
export function lireFeuilleUE(lignes, ueNum) {
  const blocs = repererBlocs(lignes);
  if (!blocs.length) return { erreur: 'Aucun bandeau de session trouvé.', etudiants: [] };

  const analyse = {};
  for (const b of blocs) analyse[b.cle] = { ...b, ...analyserBloc(lignes, b) };

  const etudiants = [];
  // Les étudiants commencent ligne 14 ; on s'arrête à la première ligne sans
  // matricule ET sans nom, plutôt qu'à un nombre fixe.
  for (let r = 13; r < lignes.length; r++) {
    const L = lignes[r] || [];
    const matricule = String(L[1] ?? '').trim();
    const nom = String(L[2] ?? '').trim();
    if (!matricule && !nom) continue;
    if (!matricule) continue;   // ligne de service : on l'ignore sans bruit

    const e = {
      ligne: r + 1, matricule, nom, prenom: String(L[3] ?? '').trim(),
      ue_num: ueNum, sessions: {},
    };

    for (const cle of ['s1', 's2', 'final']) {
      const a = analyse[cle];
      if (!a) continue;
      const notes = {};
      for (const { colonne, aa_code } of a.acquis) {
        const n = versNote(L[colonne]);
        if (n != null) notes[aa_code] = n;
      }
      const bloc = { notes };
      if (a.decision.note != null) bloc.note_ue = versNote(L[a.decision.note]);
      if (a.decision.decision != null) {
        bloc.decision = versResultat(L[a.decision.decision]);
        bloc.decision_brute = String(L[a.decision.decision] ?? '').trim() || null;
      }
      // La justification suit la colonne D : c'est la motivation du Conseil.
      if (a.decision.decision != null) {
        const j = String(L[a.decision.decision + 1] ?? '').trim();
        if (j) bloc.justification = j;
      }
      // Un bloc vide n'est pas une information : on ne le retient pas.
      if (Object.keys(notes).length || bloc.note_ue != null || bloc.decision) {
        e.sessions[cle] = bloc;
      }
    }

    if (Object.keys(e.sessions).length) etudiants.push(e);
  }

  // Les pondérations viennent du bloc « Final » s'il en porte, sinon de la
  // première session : elles décrivent l'unité, non une session.
  const ponderations = analyse.final?.ponderations && Object.keys(analyse.final.ponderations).length
    ? analyse.final.ponderations
    : (analyse.s1?.ponderations || {});

  return {
    ue_num: ueNum,
    ponderations,
    blocs: Object.fromEntries(Object.entries(analyse).map(([k, v]) => [k, {
      acquis: v.acquis.length,
      decision: v.decision.decision != null,
    }])),
    etudiants,
  };
}

/**
 * La décision qui fait foi, et sa session d'origine.
 *
 * Le bloc « Final » l'emporte : vous l'avez confirmé, c'est lui qui fait foi.
 * À défaut, la première session. La deuxième n'a pas de décision propre.
 */
export function decisionRetenue(sessions) {
  if (sessions.final?.decision) {
    // D'où vient la décision finale ? Si la première session CAPITALISE, le
    // bloc Final n'est qu'une recopie : la décision reste de session 1. Si la
    // première session AJOURNE, ce sont bien les dernières cellules qui
    // comptent, et la décision vient de la seconde session.
    const s1 = sessions.s1?.decision || null;
    const session = s1 === 'reussi' ? 's1'
      : s1 === 'ajourne' ? 's2'
      // Un refus en première session est définitif : il n'ouvre pas de
      // seconde session, la décision lui appartient.
      : s1 === 'refuse' ? 's1'
      : 's2';
    return {
      resultat: sessions.final.decision,
      points: sessions.final.note_ue ?? null,
      session,
      justification: sessions.final.justification || null,
      // Une recopie n'est pas une délibération : on le signale, cela évitera
      // d'attribuer à la seconde session ce qui s'est joué en première.
      recopie: s1 === 'reussi' && sessions.final.decision === 'reussi',
    };
  }
  if (sessions.s1?.decision) {
    return {
      resultat: sessions.s1.decision,
      points: sessions.s1.note_ue ?? null,
      session: 's1',
      justification: sessions.s1.justification || null,
    };
  }
  return null;
}
