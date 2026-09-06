/**
 * motifsEchec.js — Catalogue des motivations d'échec, par acquis d'apprentissage.
 *
 * La circulaire exige une justification PAR ACQUIS : une décision de refus ou
 * d'ajournement non motivée est attaquable, et le recours interne se gagne
 * précisément sur ce terrain (RDE art. 88 §3 — « les irrégularités procédurales
 * précises qui motivent le recours »).
 *
 * Chaque énoncé est donc écrit pour se rapporter à UN acquis, jamais à
 * l'étudiant : « l'acquis n'est pas maîtrisé », et non « l'étudiant est
 * insuffisant ». C'est ce qui distingue une motivation défendable d'un
 * jugement de personne.
 *
 * Ces phrases sont un point de départ, pas un formulaire fermé : elles se
 * cochent, puis se complètent en toutes lettres. Deux motivations identiques
 * mot pour mot sur deux dossiers différents affaiblissent l'une et l'autre.
 */

export const MOTIFS_ECHEC = [
  {
    cle: 'theorie',
    libelle: 'Maîtrise des notions théoriques',
    couleur: '#0369a1',
    motifs: [
      { cle: 'th_restitution', texte: "Les notions théoriques que mobilise cet acquis ne sont pas restituées avec exactitude." },
      { cle: 'th_lacunes', texte: "Des lacunes portant sur les fondements de cet acquis subsistent au terme de l'unité." },
      { cle: 'th_confusion', texte: "Les concepts centraux de cet acquis sont confondus entre eux ou employés hors de leur sens." },
      { cle: 'th_vocabulaire', texte: "La terminologie propre au domaine n'est pas employée de façon rigoureuse." },
      { cle: 'th_partiel', texte: "La maîtrise démontrée ne couvre qu'une partie du champ de cet acquis." },
    ],
  },
  {
    cle: 'integration',
    libelle: 'Intégration et mise en relation',
    couleur: '#7c3aed',
    motifs: [
      { cle: 'in_juxtapose', texte: "Les éléments de cet acquis sont juxtaposés sans être mis en relation." },
      { cle: 'in_lien', texte: "Le lien entre les notions de cet acquis et celles des autres acquis de l'unité n'est pas établi." },
      { cle: 'in_ensemble', texte: "La vue d'ensemble que suppose cet acquis n'est pas construite : le détail est connu, la logique d'ensemble ne l'est pas." },
      { cle: 'in_prerequis', texte: "Les prérequis sur lesquels cet acquis s'appuie ne sont pas mobilisés." },
    ],
  },
  {
    cle: 'transfert',
    libelle: 'Transfert en situation',
    couleur: '#15803d',
    motifs: [
      { cle: 'tr_situation', texte: "Cet acquis n'est pas transféré à une situation professionnelle nouvelle : la restitution reste théorique." },
      { cle: 'tr_choix', texte: "Le choix de la démarche adaptée à la situation proposée n'est pas justifié." },
      { cle: 'tr_adaptation', texte: "La procédure est appliquée telle quelle, sans adaptation au contexte présenté." },
      { cle: 'tr_priorites', texte: "Les priorités ne sont pas hiérarchisées face à la situation soumise." },
      { cle: 'tr_securite', texte: "La mise en œuvre de cet acquis ne garantit pas les conditions de sécurité attendues." },
    ],
  },
  {
    cle: 'methode',
    libelle: 'Méthode et démarche',
    couleur: '#b45309',
    motifs: [
      { cle: 'me_demarche', texte: "La démarche attendue par cet acquis n'est pas conduite jusqu'à son terme." },
      { cle: 'me_etapes', texte: "Les étapes de la démarche sont omises ou inversées." },
      { cle: 'me_sources', texte: "Les sources mobilisées ne sont pas identifiées ni évaluées." },
      { cle: 'me_rigueur', texte: "Le travail présenté ne satisfait pas aux exigences de rigueur méthodologique de cet acquis." },
    ],
  },
  {
    cle: 'communication',
    libelle: 'Communication et argumentation',
    couleur: '#be185d',
    motifs: [
      { cle: 'co_clarte', texte: "La communication des éléments de cet acquis manque de clarté : le propos n'est pas intelligible pour son destinataire." },
      { cle: 'co_argument', texte: "Les affirmations ne sont pas étayées : l'argumentation attendue par cet acquis fait défaut." },
      { cle: 'co_ecrit', texte: "L'expression écrite ne permet pas d'attester la maîtrise de cet acquis." },
      { cle: 'co_adaptation', texte: "Le propos n'est pas adapté à l'interlocuteur que la situation désigne." },
    ],
  },
  {
    cle: 'posture',
    libelle: 'Posture professionnelle et réflexivité',
    couleur: '#0891b2',
    motifs: [
      { cle: 'po_reflexif', texte: "Le retour réflexif attendu par cet acquis reste descriptif : les faits sont rapportés, non analysés." },
      { cle: 'po_limites', texte: "Les limites de sa propre pratique ne sont pas identifiées." },
      { cle: 'po_deonto', texte: "Les exigences déontologiques que porte cet acquis ne sont pas prises en compte." },
      { cle: 'po_remediation', texte: "Les remédiations proposées en cours d'unité n'ont pas été mises à profit." },
    ],
  },
  {
    cle: 'evaluation',
    libelle: "Conditions de l'évaluation",
    couleur: '#64748b',
    motifs: [
      { cle: 'ev_absence', texte: "L'acquis n'a pu être évalué : l'étudiant ne s'est pas présenté à l'épreuve le concernant." },
      { cle: 'ev_remise', texte: "Le travail attestant de cet acquis n'a pas été remis dans le délai fixé." },
      { cle: 'ev_incomplet', texte: "Le travail remis ne couvre pas les éléments par lesquels cet acquis devait être attesté." },
      { cle: 'ev_stage', texte: "Les heures de stage requises pour attester cet acquis n'ont pas été prestées." },
    ],
  },
];

/** Retrouve un énoncé par sa clé, tous groupes confondus. */
export const texteDuMotif = (cle) => {
  for (const g of MOTIFS_ECHEC) {
    const m = g.motifs.find(x => x.cle === cle);
    if (m) return m.texte;
  }
  return null;
};

/**
 * Compose la motivation enregistrée : les énoncés cochés, puis les précisions.
 * Le texte reste UNE chaîne — c'est ce que la base et les annexes attendent.
 */
export const composerMotif = (cles, libre) => {
  const phrases = (cles || []).map(texteDuMotif).filter(Boolean);
  const p = (libre || '').trim();
  return [...phrases, p].filter(Boolean).join(' ');
};

/**
 * Opération inverse, à la relecture d'un dossier : on retrouve les énoncés
 * cochés et ce qui a été ajouté à la main. Sans cela, rouvrir une motivation
 * l'aurait affichée comme du texte libre et les cases seraient reparties vides.
 */
export const decomposerMotif = (texte) => {
  let reste = String(texte || '');
  const cles = [];
  for (const g of MOTIFS_ECHEC) {
    for (const m of g.motifs) {
      if (reste.includes(m.texte)) {
        cles.push(m.cle);
        reste = reste.replace(m.texte, ' ');
      }
    }
  }
  return { cles, libre: reste.replace(/\s+/g, ' ').trim() };
};
