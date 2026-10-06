// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Le diplôme d'un étudiant : deux questions, deux listes fermées
//
// (Charles, 6 octobre 2026 — conseil d'entreprise et AEQES : « sexe, âge
// moyen, diplôme… ».) Le TITRE D'ACCÈS dit ce qui a ouvert l'inscription ; le
// PLUS HAUT DIPLÔME dit le niveau atteint, quel que soit le chemin. Listes
// fermées : un texte libre ne se compte pas par section. Une seule source —
// l'écran les reçoit du serveur, l'import les reconnaît d'ici.
// ─────────────────────────────────────────────────────────────────────────────

export const TITRES_ACCES = [
  ['cess', "CESS (certificat d'enseignement secondaire supérieur)"],
  ['secondaire_etranger', 'Diplôme secondaire étranger (équivalence)'],
  ['bachelier', 'Bachelier ou graduat'],
  ['master', 'Master ou licence'],
  ['superieur_etranger', 'Diplôme supérieur étranger (équivalence)'],
  ['test_admission', "Test d'admission (capacités préalables)"],
  ['valorisation', 'Admission par valorisation des acquis'],
  ['autre', 'Autre'],
];

export const DIPLOMES_MAX = [
  ['aucun', 'Sans diplôme du secondaire'],
  ['secondaire_inferieur', 'Secondaire inférieur (CE1D, CESI)'],
  ['cess', 'Secondaire supérieur (CESS)'],
  ['bachelier', 'Bachelier ou graduat'],
  ['master', 'Master ou licence'],
  ['doctorat', 'Doctorat'],
  ['autre', 'Autre'],
];

const nu = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Reconnaît une valeur d'import : le code, le libellé, ou un mot clé. */
function reconnaitre(liste, motsCles) {
  return brut => {
    const v = nu(brut);
    if (!v) return null;
    const exact = liste.find(([c, l]) => v === c || v === nu(l));
    if (exact) return exact[0];
    for (const [re, code] of motsCles) if (re.test(v)) return code;
    return null;
  };
}
export const reconnaitreTitreAcces = reconnaitre(TITRES_ACCES, [
  [/valoris|\bva\b/, 'valorisation'], [/test|admission/, 'test_admission'],
  [/etrang|equival/, 'secondaire_etranger'], [/master|licen/, 'master'],
  [/bachel|gradu/, 'bachelier'], [/cess|secondaire/, 'cess'],
]);
export const reconnaitreDiplomeMax = reconnaitre(DIPLOMES_MAX, [
  [/doctor|phd/, 'doctorat'], [/master|licen/, 'master'], [/bachel|gradu/, 'bachelier'],
  [/cess|secondaire sup|humanites/, 'cess'], [/ce1d|cesi|secondaire inf/, 'secondaire_inferieur'],
  [/aucun|sans/, 'aucun'],
]);
/** « Femme », « Madame », « F », « V » → F ; « Homme », « Monsieur », « M » → M ;
 *  « X » → X, la troisième mention de la carte d'identité. */
export function reconnaitreSexe(brut) {
  const v = nu(brut);
  if (/^(x|autre|neutre|non binaire|non-binaire)$/.test(v)) return 'X';
  if (/^(f|v|femme|feminin|madame|mme|vrouw)$/.test(v)) return 'F';
  if (/^(m|h|homme|masculin|monsieur|man)$/.test(v)) return 'M';
  return null;
}
