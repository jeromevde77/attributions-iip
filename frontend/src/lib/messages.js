import { IconSpeakerphone, IconInfoCircle, IconCalendarEvent, IconSchool, IconFileText, IconAlertTriangle, IconConfetti, IconUsers, IconClock, IconSparkles } from '@tabler/icons-react';

/* LES MESSAGES DE LA COMMUNICATION (3.1.286) : une icône au choix et une importance, qui
   donne sa couleur à la carte. Les mêmes listes que le serveur (routes/communication.js). */
export const ICONES_MESSAGE = {
  'porte-voix': { Icone: IconSpeakerphone, libelle: 'Message (porte-voix)' },
  info: { Icone: IconInfoCircle, libelle: 'Information' },
  calendrier: { Icone: IconCalendarEvent, libelle: 'Date, calendrier' },
  examen: { Icone: IconSchool, libelle: 'Examens, cours' },
  document: { Icone: IconFileText, libelle: 'Document, procédure' },
  alerte: { Icone: IconAlertTriangle, libelle: 'Attention' },
  fete: { Icone: IconConfetti, libelle: 'Événement, fête' },
  reunion: { Icone: IconUsers, libelle: 'Réunion' },
  horaire: { Icone: IconClock, libelle: 'Horaire' },
  lucie: { Icone: IconSparkles, libelle: 'Lucie' },
};
/* L'importance se dit avec les états de Lucie, et rien d'autre. */
export const IMPORTANCES_MESSAGE = {
  info: { libelle: 'Information', etat: 'disponible', couleur: 'var(--c-disponible)' },
  important: { libelle: 'Important', etat: 'surveiller', couleur: 'var(--c-attente)' },
  urgent: { libelle: 'Urgent', etat: 'corriger', couleur: 'var(--c-refuse)' },
  positif: { libelle: 'Bonne nouvelle', etat: 'reussi', couleur: 'var(--c-reussi)' },
};
