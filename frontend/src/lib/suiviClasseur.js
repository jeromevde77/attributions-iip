/* ─────────────────────────────────────────────────────────────────────────────
 * LA GÉOMÉTRIE DU CLASSEUR DE SUIVI
 *
 * Les classeurs « Suivi_etudiants_<SECTION>_<AA>.xlsm » tenus par la direction
 * ont une forme fixe, reconduite d'année en année depuis la feuille UE_vide.
 * Ce module la connaît, et rien d'autre : il lit, il ne décide pas. Ce qu'il
 * produit part au serveur, qui rapproche les étudiants et écrit.
 *
 * UNE FEUILLE PAR UNITÉ, et le nom de la feuille est le numéro de l'unité —
 * « 251 », « 263 ». Les feuilles suffixées (_old) et les feuilles de service
 * (Inscriptions, PAE, AA, Impression, donnees…) sont ignorées.
 *
 * DANS CHAQUE FEUILLE, une grille invariable de 6 cours × 15 acquis :
 *
 *   ligne 8   le code du cours          251.1, 251.2 …
 *   ligne 10  la pondération du cours   70, 30 …            somme = 100
 *   ligne 11  la pondération de l'acquis DANS le cours       somme = 100
 *   ligne 12  le code de l'acquis       AA251.1 …
 *   ligne 13+ un étudiant par ligne     matricule en B, nom en C, prénom en D
 *
 *   L → CW    les 90 colonnes de saisie de la PREMIÈRE session
 *   IM → LX   les 90 colonnes de saisie de la SECONDE
 *
 * Les blocs qui suivent (CX→GJ pour la première, LY→PJ pour la seconde) sont
 * des CALCULS — la ligne 9 y vaut le produit des deux pondérations. On ne les
 * lit pas : on recalculerait ce que Lucie sait faire, et l'on importerait des
 * arrondis. Compter 90 colonnes plutôt que se fier à la lettre de fin évite
 * l'erreur : IM→PJ, qui semble naturel, couvre les DEUX blocs et compte donc
 * chaque acquis deux fois.
 *
 * L'ÉCHELLE DES NOTES est la principale chausse-trappe. Le classeur ne note pas
 * sur 20 : il note DANS L'ÉCHELLE DU POIDS. Un acquis qui pèse 40 se note sur
 * 40, un acquis qui pèse 100 se note sur 100. La note sur 20 vaut donc
 * `valeur / poids × 20`, ce que les colonnes de contrôle du classeur (HN, HQ …,
 * marquées « /20 ») confirment à l'arrondi près.
 *
 * LES DÉCISIONS DU JURY se lisent en II pour la première session et en WW pour
 * la seconde — toutes deux marquées « D » en ligne 12. C pour réussi, AJ pour
 * ajourné, R pour refusé. On les importe telles quelles : le Conseil a
 * délibéré, il n'a pas à recommencer parce qu'on change d'outil.
 *
 * LES COURS À REPRÉSENTER sont les croix du bloc HN→IE, en triplets par cours :
 * la note du cours sur 20, la mention NP, puis la croix AJn. La croix qui suit
 * la note du cours n porte donc sur CE cours-là.
 * ───────────────────────────────────────────────────────────────────────────── */

/** Colonne « L » → 12, « CW » → 101. */
export function colIndex(lettres) {
  let n = 0;
  for (const c of String(lettres).toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64);
  return n;
}

/** 12 → « L ». */
export function colNom(n) {
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - r - 1) / 26; }
  return s;
}

export const GEOMETRIE = {
  ligne: { cours: 8, poidsCours: 10, poidsAA: 11, codeAA: 12, premierEtudiant: 13 },
  col: {
    matricule: 'B', nom: 'C', prenom: 'D',
    // Les blocs de SAISIE, 90 colonnes chacun (6 cours × 15 acquis).
    s1: { de: 'L', a: 'CW' },
    s2: { de: 'IM', a: 'LX' },
    // Le bloc des notes de cours et des ajournements de première session,
    // en triplets « note /20 | NP | AJn ».
    ajournementsS1: { de: 'HN', a: 'IE' },
    // LA COTE DE L'UNITÉ ET LA JUSTIFICATION DU JURY. Le classeur les porte
    // à côté de la décision ; Lucie ne les lisait pas, faute d'en avoir eu
    // l'usage tant qu'elle recalculait tout. Une année reprise d'Excel a été
    // délibérée AU NIVEAU DE L'UNITÉ : ces deux colonnes sont alors la seule
    // trace de ce que le jury a décidé, et de pourquoi.
    noteS1: 'IH',
    decisionS1: 'II',
    justifS1: 'IJ',
    noteS2: 'WV',
    decisionS2: 'WW',
    justifS2: 'WX',
    faveurS2: 'WU',
  },
  // Une feuille dont le nom n'est pas un numéro d'unité n'est pas une unité.
  estFeuilleUE: (nom) => /^\d{2,4}$/.test(String(nom).trim()),
};

const DECISIONS = { C: 'reussi', AJ: 'ajourne', R: 'refuse' };

const txt = (v) => (v == null ? '' : String(v).trim());
const nombre = (v) => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/**
 * Lit une feuille d'unité.
 *
 * `cell(colonne, ligne)` rend la valeur brute — c'est l'appelant qui sait s'il
 * parle à SheetJS, à openpyxl ou à un tableau de test.
 */
export function lireFeuilleUE(nomFeuille, cell) {
  const G = GEOMETRIE;
  const ueNum = Number(String(nomFeuille).trim());

  // ── La grille : un couple (cours, acquis) par colonne de saisie ───────────
  function grille({ de, a }) {
    const cols = [];
    for (let c = colIndex(de); c <= colIndex(a); c++) {
      const L = colNom(c);
      const cours = txt(cell(L, G.ligne.cours));
      const aa = txt(cell(L, G.ligne.codeAA));
      const poidsAA = nombre(cell(L, G.ligne.poidsAA)) || 0;
      const poidsCours = nombre(cell(L, G.ligne.poidsCours)) || 0;
      // Poids nul : la case existe dans le gabarit mais ne sert pas.
      if (!cours || !aa || poidsAA <= 0) continue;
      cols.push({ col: L, cours_code: cours, aa_code: aa, poids_aa: poidsAA, poids_cours: poidsCours });
    }
    return cols;
  }

  const colsS1 = grille(G.col.s1);
  const colsS2 = grille(G.col.s2);

  // ── Les cours, dans l'ordre du classeur, avec leur poids ─────────────────
  const cours = [];
  for (const c of colsS1) {
    if (!cours.some(x => x.cours_code === c.cours_code)) {
      cours.push({ cours_code: c.cours_code, poids_cours: c.poids_cours });
    }
  }

  // ── Les croix d'ajournement : « la note du cours n, puis sa croix » ───────
  //
  // Le bloc alterne par triplets. On retient, pour chaque colonne de croix, le
  // cours dont la note vient d'être lue : c'est celui que la croix ajourne.
  const croix = [];
  {
    let coursCourant = null;
    for (let c = colIndex(G.col.ajournementsS1.de); c <= colIndex(G.col.ajournementsS1.a); c++) {
      const L = colNom(c);
      const enTete8 = txt(cell(L, G.ligne.cours));
      const enTete12 = txt(cell(L, G.ligne.codeAA));
      if (enTete8) coursCourant = enTete8;                 // « 251.1 » : la note
      else if (/^AJ\d+\.S1$/i.test(enTete12) && coursCourant) {
        croix.push({ col: L, cours_code: coursCourant });  // « AJ1.S1 » : la croix
      }
    }
  }

  // ── Les étudiants ────────────────────────────────────────────────────────
  const etudiants = [];
  for (let r = G.ligne.premierEtudiant; r < G.ligne.premierEtudiant + 400; r++) {
    const nom = txt(cell(G.col.nom, r));
    const prenom = txt(cell(G.col.prenom, r));
    if (!nom && !prenom) {
      // Deux lignes vides d'affilée : la liste est finie.
      const suivant = txt(cell(G.col.nom, r + 1));
      if (!suivant) break;
      continue;
    }

    // La note d'un acquis, ramenée sur 20 depuis l'échelle de son poids.
    const notes = (cols) => cols.map(c => {
      const brut = nombre(cell(c.col, r));
      if (brut == null) return null;
      return {
        cours_code: c.cours_code, aa_code: c.aa_code,
        brut, poids_aa: c.poids_aa,
        valeur: Math.round((brut / c.poids_aa) * 20 * 100) / 100,
      };
    }).filter(Boolean);

    const dec = (col) => DECISIONS[txt(cell(col, r)).toUpperCase()] || null;
    const d1 = dec(G.col.decisionS1);

    etudiants.push({
      ligne: r,
      matricule: txt(cell(G.col.matricule, r)),
      nom, prenom,
      s1: {
        decision: d1,
        note_ue: nombre(cell(G.col.noteS1, r)),
        justification: txt(cell(G.col.justifS1, r)) || null,
        notes: notes(colsS1),
        // LES CROIX NE COMPTENT QUE SI LE JURY A AJOURNÉ. Une croix résiduelle
        // à côté d'une décision de réussite est un reste de travail, pas un
        // ajournement : la décision du Conseil prime sur la case cochée.
        a_representer: d1 === 'ajourne'
          ? croix.filter(x => /^x$/i.test(txt(cell(x.col, r)))).map(x => x.cours_code)
          : [],
      },
      s2: {
        decision: dec(G.col.decisionS2),
        note_ue: nombre(cell(G.col.noteS2, r)),
        justification: txt(cell(G.col.justifS2, r)) || null,
        notes: notes(colsS2),
        faveur: /^(x|f|1|oui)$/i.test(txt(cell(G.col.faveurS2, r))),
      },
    });
  }

  return {
    ue_num: ueNum,
    cours,
    // La pondération telle que Lucie la tient : cours × acquis. Les poids du
    // classeur totalisent 100 ; Lucie compte sur 10, d'où le dixième — et
    // d'où les demi-points, car 45 sur 100 fait 4,5.
    ponderations: colsS1.map(c => ({
      cours_code: c.cours_code, aa_code: c.aa_code,
      poids_aa: Math.round((c.poids_aa / 10) * 10) / 10,
      poids_cours: Math.round((c.poids_cours / 10) * 10) / 10,
    })),
    etudiants,
    // De quoi vérifier d'un coup d'œil que la feuille a été lue comme il faut.
    resume: {
      cours: cours.length,
      couples_s1: colsS1.length,
      couples_s2: colsS2.length,
      etudiants: etudiants.length,
      decides_s1: etudiants.filter(e => e.s1.decision).length,
      decides_s2: etudiants.filter(e => e.s2.decision).length,
    },
  };
}

/**
 * LE RÉFÉRENTIEL DES ACQUIS — la feuille « AA ».
 *
 * C'est elle qui dit quels acquis EXISTENT, et ce qu'ils énoncent. Un acquis
 * sans poids dans la grille d'une unité n'existe pas : les quinze colonnes du
 * gabarit sont un cadre, pas une liste. Sans cette feuille, Lucie reçoit des
 * codes nus — AA251.1 — sans le texte qui dit ce que l'étudiant doit savoir
 * faire, et une notification d'ajournement ne peut plus nommer ce qui n'est pas
 * maîtrisé, alors que le règlement l'exige (RGE art. 78 §2).
 *
 *   A  numéro de l'acquis dans son unité
 *   B  l'unité
 *   C  le code de l'acquis
 *   D  le cours attribué (rarement rempli — la pondération fait foi)
 *   E  l'énoncé de l'acquis
 *
 * L'en-tête de la colonne E annonce « Pondération dans le cours » ; elle
 * contient en réalité l'énoncé. On lit le contenu, pas l'en-tête.
 */
export function lireReferentielAA(cell, maxLignes = 600) {
  const acquis = [];
  let vides = 0;
  for (let r = 2; r <= maxLignes; r++) {
    const code = txt(cell('C', r));
    if (!code) { if (++vides > 20) break; continue; }
    vides = 0;
    acquis.push({
      aa_num: nombre(cell('A', r)),
      ue_num: nombre(cell('B', r)),
      aa_code: code,
      description: txt(cell('E', r)) || null,
    });
  }
  return acquis;
}

/**
 * Toutes les feuilles d'unité d'un classeur, enrichies du référentiel.
 * `feuilles` : [{ nom, cell }].
 */
export function lireClasseur(feuilles) {
  const refFeuille = feuilles.find(f => String(f.nom).trim().toUpperCase() === 'AA');
  const referentiel = refFeuille ? lireReferentielAA(refFeuille.cell) : [];

  return feuilles
    .filter(f => GEOMETRIE.estFeuilleUE(f.nom))
    .map(f => {
      const u = lireFeuilleUE(f.nom, f.cell);
      // Les acquis déclarés pour CETTE unité, avec leur énoncé.
      u.acquis = referentiel.filter(a => a.ue_num === u.ue_num);
      // Ce que la grille pondère sans que le référentiel le connaisse : à
      // signaler plutôt qu'à inventer.
      const declares = new Set(u.acquis.map(a => a.aa_code));
      u.acquis_hors_referentiel = [
        ...new Set(u.ponderations.map(p => p.aa_code).filter(c => !declares.has(c))),
      ];
      u.resume.acquis_declares = u.acquis.length;
      return u;
    });
}
