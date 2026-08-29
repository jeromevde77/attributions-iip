// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Modules d'accès, partagés entre la fiche et la vue d'ensemble
//
// Cette liste vivait en double : dans le panneau « Accès Lucie » et dans
// l'écran de Configuration. Deux copies d'une même vérité finissent toujours
// par diverger — un module ajouté d'un côté, oublié de l'autre.
// ─────────────────────────────────────────────────────────────────────────────

export const MODULES_ACCES = [
  { key: 'etudiants',    label: 'Étudiants',     icon: '🎓', desc: 'Parcours, PAE, résultats, dossiers' },
  { key: 'attributions', label: 'Attributions',  icon: '📋', desc: 'Voir et/ou modifier les attributions' },
  { key: 'personnel',    label: 'Personnel',     icon: '👥', desc: 'Voir et/ou modifier les fiches membres' },
  { key: 'organisation', label: 'Organisation',  icon: '🗂️', desc: "Dates d'UE, structure des sections, rentrée" },
  { key: 'planification',label: 'Horaires',      icon: '📅', desc: 'Groupes, horaires et planification' },
  { key: 'communication',label: 'Communication', icon: '✉️', desc: 'Listes, courriers, documents produits' },
  { key: 'listes',       label: 'Listes',        icon: '📄', desc: 'Accès aux listes et documents' },
  { key: 'procedures',   label: 'Procédures',    icon: '📑', desc: 'Accès aux procédures' },
  { key: 'pilotage',     label: 'Pilotage',      icon: '📊', desc: 'Dotation, statistiques' },
  { key: 'budget',       label: 'Budget',        icon: '💶', desc: 'Prévisions et dépenses de la section' },
  { key: 'recrutement',  label: 'Recrutement',   icon: '💼', desc: 'Accès au module recrutement' },
];

export const ROLES_LUCIE = [
  ['consultation', 'Consultation — lecture seule'],
  ['professeur',   'Professeur — ses attributions et ses données'],
  ['coordination', 'Coordination — encode, sous validation de la direction'],
  ['secretariat',  'Secrétariat — lit partout, produit les documents'],
  ['admin',        'Direction — accès complet et validation des demandes'],
];

// Ce que chaque rôle permet AU MIEUX. Repris du serveur, qui reste seul juge :
// l'écran s'en sert pour ne pas laisser cocher une case qui serait refusée.
export const PLAFOND_ROLE = {
  admin:        () => 'ecrit',
  editeur:      () => 'ecrit',
  secretariat:  m => (['communication', 'listes', 'procedures'].includes(m) ? 'ecrit' : 'lit'),
  coordination: m => (m === 'recrutement' ? 'rien' : 'validation'),
  professeur:   m => (['attributions', 'personnel', 'planification'].includes(m) ? 'lit' : 'rien'),
  consultation: () => 'lit',
};

/** Ce qu'une personne peut réellement sur un module, cases et rôle combinés. */
export function droitEffectif(user, module) {
  const plafond = (PLAFOND_ROLE[user?.role] || PLAFOND_ROLE.consultation)(module);
  if (plafond === 'rien') return 'rien';

  let perms = {};
  try {
    perms = user?.permissions_json
      ? (typeof user.permissions_json === 'string'
          ? JSON.parse(user.permissions_json) : user.permissions_json)
      : {};
  } catch { /* illisible : on s'en tient au rôle */ }

  const p = perms[module];
  // Sans cases enregistrées, le rôle fait foi : ne rien cocher ne ferme pas tout.
  if (!p) return plafond;
  if (p.lire === false && p.ecrire !== true) return 'rien';
  if (p.ecrire === false) return plafond === 'lit' ? 'lit' : 'lit';
  return plafond;
}

export const LIBELLE_DROIT = {
  ecrit:      { texte: 'écrit',      cls: 'bg-emerald-100 text-emerald-800' },
  validation: { texte: 'validation', cls: 'bg-amber-100 text-amber-800' },
  lit:        { texte: 'lit',        cls: 'bg-sky-100 text-sky-800' },
  rien:       { texte: '—',          cls: 'text-slate-300' },
};
