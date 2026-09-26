// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Modules d'accès, partagés entre la fiche et la vue d'ensemble
//
// Cette liste vivait en double : dans le panneau « Accès Lucie » et dans
// l'écran de Configuration. Deux copies d'une même vérité finissent toujours
// par diverger — un module ajouté d'un côté, oublié de l'autre.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { authHeaders, isAuthenticated } from './api.js';

// Icônes Tabler, monochromes : les émojis coloraient le tableau et juraient
// avec le reste de l'application, tenue en aplats et en traits.
import {
  IconSchool, IconClipboardList, IconUsers, IconFolders, IconCalendar,
  IconMail, IconFileText, IconGavel, IconChartBar, IconCalendarStats, IconCoin, IconBriefcase,
  IconAccessible,
} from '@tabler/icons-react';

export const MODULES_ACCES = [
  { key: 'etudiants',    label: 'Étudiants',     Icone: IconSchool,        desc: 'Parcours, PAE, résultats, dossiers' },
  { key: 'attributions', label: 'Attributions',  Icone: IconClipboardList, desc: 'Voir et/ou modifier les attributions' },
  { key: 'personnel',    label: 'Personnel',     Icone: IconUsers,         desc: 'Voir et/ou modifier les fiches membres' },
  { key: 'organisation', label: 'Organisation',  Icone: IconFolders,       desc: "Dates d'UE, structure des sections, rentrée" },
  { key: 'planification',label: 'Horaires',      Icone: IconCalendar,      desc: 'Groupes, horaires et planification' },
  /* « Listes » ne désignait plus rien qu'on puisse montrer. L'axe Communication
     a disparu et l'écran est devenu une bascule du centre d'impression : le
     module gardait son objet — produire et envoyer des pièces — mais plus son
     nom, et c'est dans l'écran des DROITS que le mot était faux, là où l'on
     vient justement vérifier qui peut quoi.
     LA CLÉ RESTE `listes` : elle porte les droits déjà enregistrés sur chaque
     fiche, et la renommer les effacerait tous en silence. Seul le mot change. */
  { key: 'listes',       label: 'Impression & envois', Icone: IconFileText,
    desc: 'Produire une pièce et l’envoyer — bouton « Imprimer ou envoyer »' },
  { key: 'procedures',   label: 'Procédures',    Icone: IconGavel,         desc: 'Accès aux procédures' },
  // PILOTAGE SE LIT, DOTATION S'ENGAGE — et ce n'est pas le même cadenas.
  // Tant que la dotation vivait dans « pilotage », ouvrir le reporting à une
  // coordination lui ouvrait la dotation : la règle de la maison — elle
  // consulte, elle propose, elle n'engage pas — était inexprimable.
  /* « Reporting » n'existait nulle part dans l'interface : l'onglet s'appelle
     « Chiffres de l'école ». Même défaut que « Listes » — un mot qui ne
     désigne rien qu'on puisse montrer, dans l'écran où l'on vient justement
     vérifier qui peut quoi. LA CLÉ RESTE `pilotage` : elle porte les plafonds
     et les permissions déjà enregistrées. */
  { key: 'pilotage',     label: 'Chiffres de l’école', Icone: IconChartBar,
    desc: 'Synthèse, ETP, résultats — en lecture' },
  { key: 'dotation',     label: 'Dotation',      Icone: IconCoin,          desc: "Ce qui engage l'établissement — réservé" },
  { key: 'repartition',  label: 'Répartition',   Icone: IconCalendarStats, desc: 'Périodes entre années civiles — document 2' },
  { key: 'budget',       label: 'Budget',        Icone: IconCoin,          desc: 'Prévisions et dépenses de la section' },
  { key: 'recrutement',  label: 'Recrutement',   Icone: IconBriefcase,     desc: 'Accès au module recrutement' },
  // UN DROIT PAR ÉCRAN, ACCORDÉ À LA PERSONNE (2.12.207) : pour une
  // coordination, « écrire » ne vaut que si cette case est cochée sur sa fiche.
  { key: 'amenagements', label: 'Aménagements raisonnables', Icone: IconAccessible,
    desc: 'Créer et modifier les aménagements (besoins spécifiques) — sur octroi pour la coordination' },
];

export const ROLES_LUCIE = [
  ['consultation',      'Consultation — lecture seule'],
  ['professeur',        'Professeur — ses attributions et ses données'],
  ['coordination',      'Coordination — encode, la direction valide'],
  ['secretariat',       'Secrétariat — écrit sur les étudiants et les documents'],
  ['directeur_adjoint', 'Directeur adjoint — accès complet, valide les demandes'],
  ['directeur',         'Directeur — accès complet, valide les demandes'],
  ['admin',             'Administrateur technique — compte sans fiche'],
];

// ─── LES PLAFONDS VIENNENT DU SERVEUR, ET DE NULLE PART AILLEURS ─────────────
//
// Ils vivaient ici, écrits en dur, pendant que le serveur les lisait en base
// (`role_plafond`, réglable depuis Configuration → Rôles). Deux sources pour un
// même fait, c'est une source de moins : la direction abaissait un plafond, la
// base changeait, et cet écran continuait d'afficher l'amorce. Il ne se
// trompait pas sur un détail — il affirmait des droits que le serveur
// n'appliquait pas, ce qui est la pire façon de se tromper sur des droits.
//
// Le serveur reste seul juge. Ce cache ne sert qu'à ne pas laisser cocher une
// case qui serait refusée, et à masquer ce qui est fermé.
// ─────────────────────────────────────────────────────────────────────────────

// REPLI, ET RIEN D'AUTRE. Ces valeurs ne servent que le temps que le serveur
// réponde, ou s'il ne répond pas. Elles recopient l'amorce de
// `middleware/permissions.js` ; le jour où elles en divergeraient, c'est le
// serveur qui aurait raison, et c'est lui qui applique.
const AMORCE = {
  directeur:         () => 'ecrit',
  directeur_adjoint: () => 'ecrit',
  admin:             () => 'ecrit',
  editeur:           () => 'ecrit',
  secretariat:  m => (['etudiants', 'listes', 'procedures'].includes(m)
    ? 'ecrit' : 'lit'),
  coordination: m => (['recrutement', 'repartition', 'dotation'].includes(m)
    ? 'rien' : m === 'pilotage' ? 'lit' : 'validation'),
  professeur:   m => (['attributions', 'personnel', 'planification'].includes(m) ? 'lit' : 'rien'),
  consultation: () => 'lit',
};

let cache = null;          // { role: { module: niveau } }, tel que le serveur le rend
let enVol = null;          // la requête en cours, pour n'en lancer qu'une
const abonnes = new Set();

/** Ce que ce rôle permet AU MIEUX sur ce module, selon le serveur. */
export function plafondDe(role, module) {
  const n = cache?.[role]?.[module];
  if (n) return n;
  return (AMORCE[role] || AMORCE.consultation)(module);
}

/** Charge les plafonds une fois, et prévient ceux qui les attendent. */
export function chargerPlafonds() {
  if (cache) return Promise.resolve(cache);
  if (enVol) return enVol;
  // SANS JETON, ON NE DEMANDE RIEN. L'appel partait depuis l'écran de
  // connexion et revenait 401 : un échec laisse le cache vide, donc l'amorce
  // s'applique — en silence, et c'est précisément ce que ce cache corrige.
  if (!isAuthenticated()) return Promise.resolve(null);
  enVol = fetch('/api/profils-acces/plafonds', { headers: authHeaders() })
    .then(r => (r.ok ? r.json() : null))
    .then(d => {
      if (d?.plafonds && Object.keys(d.plafonds).length) {
        cache = d.plafonds;
        abonnes.forEach(f => f());
      }
      return cache;
    })
    .catch(() => null)            // hors ligne : l'amorce tient lieu de repli
    .finally(() => { enVol = null; });
  return enVol;
}

/**
 * À la déconnexion, et après toute modification des plafonds.
 * Les droits du suivant ne sont pas ceux du précédent.
 */
export function oublierPlafonds() {
  cache = null;
  abonnes.forEach(f => f());
}

/**
 * Le rendu lit `plafondDe` de façon SYNCHRONE — un menu se calcule avant que
 * le serveur ait répondu. Sans abonnement, il resterait celui de l'amorce
 * jusqu'au prochain clic : c'est-à-dire faux, et sans que rien ne le dise.
 */
export function usePlafonds() {
  const [, redessiner] = useState(0);
  useEffect(() => {
    const f = () => redessiner(n => n + 1);
    abonnes.add(f);
    chargerPlafonds();
    return () => { abonnes.delete(f); };
  }, []);
  return cache;
}

/** Ce qu'une personne peut réellement sur un module, cases et rôle combinés. */
export function droitEffectif(user, module) {
  const plafond = plafondDe(user?.role, module);
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
  // Case d'écriture explicitement retirée : il reste la lecture, quel que soit
  // le plafond — un plafond 'ecrit' ou 'validation' retombe à 'lit'.
  if (p.ecrire === false) return 'lit';
  return plafond;
}

export const LIBELLE_DROIT = {
  ecrit:      { texte: 'écrit',      cls: 'bg-emerald-100 text-emerald-800' },
  validation: { texte: 'validation', cls: 'bg-amber-100 text-amber-800' },
  lit:        { texte: 'lit',        cls: 'bg-sky-100 text-sky-800' },
  rien:       { texte: '—',          cls: 'text-slate-300' },
};


// Directeur, directeur adjoint et administrateur technique ont les mêmes
// droits. Comparer à la seule chaîne 'admin' écartait la direction des écrans
// qui lui sont pourtant destinés.
export const ROLES_DIRECTION = ['admin', 'directeur', 'directeur_adjoint'];
export const estDirection = u => ROLES_DIRECTION.includes(u?.role);
