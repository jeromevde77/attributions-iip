/**
 * grilleEntretienDefaut.js — La grille d'entretien de référence.
 *
 * QUATRE axes, deux questions tirées dans chacun : huit questions par
 * entretien. La grille en comptait huit, soit seize questions — un entretien
 * de sélection ne s'y tient pas, et les derniers axes se bâclaient.
 *
 * Rien n'est perdu : les soixante et une questions des huit axes d'origine
 * sont reprises, regroupées par parenté. Le tirage aléatoire fait le reste,
 * et deux entretiens successifs ne posent pas les mêmes questions.
 *
 * Source unique : l'amorçage de la base et la remise à zéro depuis l'éditeur
 * lisent tous deux ce fichier, pour qu'ils ne puissent pas diverger.
 */
export const GRILLE_DEFAUT = [
  {
    libelle: "Axe 1 — Contexte de l'IIP, enseignement pour adultes et motivation",
    couleur: '#0369a1', nb: 2, type: 'contexte',
    questions: [
      "Que savez-vous de l'enseignement de promotion sociale et de sa différence avec l'enseignement supérieur ordinaire ?",
      "Selon vous, quelles sont les caractéristiques spécifiques d'un public adulte en reprise d'études ?",
      "Quel est le positionnement de l'Institut Ilya Prigogine dans le paysage de l'enseignement supérieur en FWB ?",
      "Que savez-vous du cadre décrétuel qui régit nos formations (décret du 16 avril 1991) ?",
      "En quoi le rapport entre un enseignant et un étudiant adulte diffère-t-il de ce qu'on observe dans l'enseignement secondaire ?",
      "Quelle vision avez-vous du rôle de l'enseignant dans un établissement de promotion sociale par rapport à l'institution elle-même ?",
      "Qu'est-ce qui vous motive à rejoindre l'équipe de l'Institut Ilya Prigogine ? Qu'espérez-vous y apporter, et qu'espérez-vous en retirer ?",
      "Pourquoi l'enseignement pour adultes plutôt qu'un autre type d'enseignement ou qu'une activité professionnelle classique ?",
    ],
  },
  {
    libelle: "Axe 2 — Expertise professionnelle et compétences pédagogiques",
    couleur: '#7c3aed', nb: 2, type: 'expertise',
    questions: [
      "Décrivez votre parcours professionnel et les compétences que vous y avez développées en lien avec le cours proposé.",
      "Dans quels contextes cliniques ou professionnels avez-vous exercé, et pendant combien de temps ?",
      "Avez-vous une expérience d'encadrement de stagiaires, d'étudiants ou de collègues juniors ? Décrivez-la.",
      "Quel est, selon vous, le lien entre votre pratique professionnelle actuelle et le cours que vous pourriez enseigner ?",
      "Comment vous tenez-vous informé·e des évolutions de votre domaine professionnel ? Donnez un exemple récent.",
      "Quelle est votre expérience en matière de rédaction professionnelle, de protocoles ou de documentation clinique ?",
      "Avez-vous déjà participé à des projets de recherche, des publications ou des formations continues dans votre domaine ?",
      "Comment concevez-vous la différence entre enseigner à des adultes (andragogie) et enseigner à des jeunes (pédagogie) ?",
      "Comment organiseriez-vous concrètement un cours de 3h pour un groupe de 40 adultes en reprise d'études ?",
      "Quelle est votre approche de l'évaluation formative par rapport à l'évaluation certificative ? Donnez un exemple.",
      "Comment gérez-vous l'hétérogénéité d'un groupe : niveaux différents, expériences variées, âges mêlés ?",
      "Selon vous, quelle place doit avoir le numérique dans l'enseignement supérieur pour adultes aujourd'hui ?",
      "Comment favoriseriez-vous la participation active d'adultes qui ont peur de 'ne plus être à niveau' ?",
      "Comment articulez-vous théorie et pratique dans votre vision de l'enseignement ?",
      "Quelle approche utiliseriez-vous pour préparer des étudiants à un stage ou à une situation professionnelle complexe ?",
    ],
  },
  {
    libelle: "Axe 3 — Posture relationnelle, communication et gestion de soi",
    couleur: '#15803d', nb: 2, type: 'posture',
    questions: [
      "Comment détectez-vous qu'un étudiant est en difficulté ? Quelle est votre démarche ensuite ?",
      "Comment gérez-vous un étudiant qui conteste votre expertise ou votre méthode devant le groupe ?",
      "Décrivez comment vous établissez une relation de confiance avec un groupe que vous rencontrez pour la première fois.",
      "Que faites-vous lorsque vous percevez une tension ou un conflit au sein d'un groupe d'étudiants ?",
      "Comment expliquez-vous un concept complexe à quelqu'un qui ne comprend pas après une première explication ?",
      "Quelle importance accordez-vous au feedback des étudiants sur votre enseignement ? Comment le recueillez-vous ?",
      "Comment adaptez-vous votre communication selon le profil et les besoins de votre interlocuteur ?",
      "Quel est votre mode de fonctionnement sous pression ou face à une charge de travail imprévue ?",
      "Comment gérez-vous l'incertitude : un cours à préparer en urgence, un programme modifié en dernière minute ?",
      "Avez-vous déjà vécu un échec professionnel ou pédagogique significatif ? Comment l'avez-vous traversé et qu'en avez-vous retiré ?",
      "Qu'est-ce qui, selon vous, vous rendrait vulnérable dans ce rôle d'enseignant·e ? Comment vous en prémunissez-vous ?",
      "Comment maintenez-vous votre motivation et votre énergie sur la durée, notamment dans un contexte de travail partiel à côté d'une activité principale ?",
      "Comment réagissez-vous lorsque vos valeurs professionnelles entrent en tension avec les contraintes institutionnelles ?",
      "Quelle est votre rapport à l'autorité, à la hiérarchie et aux règles institutionnelles dans un établissement scolaire ?",
    ],
  },
  {
    libelle: "Axe 4 — Mise en situation, expérience vécue et réflexivité",
    couleur: '#b45309', nb: 2, type: 'reflexif',
    questions: [
      "Un étudiant adulte s'effondre émotionnellement en classe après avoir évoqué une situation personnelle difficile. Que faites-vous ?",
      "Vous vous rendez compte, au milieu de votre cours, que le groupe n'a pas du tout le niveau prérequis pour comprendre la matière. Quelle est votre réaction immédiate ?",
      "Un étudiant vous accuse publiquement d'avoir été injuste dans une notation. Quelle est votre démarche ?",
      "Vous devez remplacer au pied levé un collègue sur un cours que vous ne maîtrisez pas parfaitement. Comment procédez-vous ?",
      "Deux étudiants ont manifestement copié l'un sur l'autre lors d'un travail. Comment gérez-vous cette situation ?",
      "Un étudiant très avancé monopolise les échanges et démotive le reste du groupe. Que faites-vous ?",
      "Vous réalisez en cours d'année que votre méthode d'évaluation est inadaptée au groupe. Que faites-vous ?",
      "Un étudiant handicapé ou en situation de vulnérabilité réclame des aménagements que vous ne savez pas comment mettre en œuvre. Quelle est votre démarche ?",
      "Décrivez une situation où vous avez dû adapter votre communication pour vous faire comprendre d'un public très hétérogène.",
      "Racontez une expérience où vous avez fait face à une résistance forte de la part d'un apprenant ou d'un groupe. Qu'avez-vous fait ?",
      "Donnez un exemple d'une situation où vous avez commis une erreur professionnelle ou pédagogique. Comment l'avez-vous gérée ?",
      "Décrivez une situation où vous avez dû prendre une décision difficile sous pression, avec peu d'informations. Quel a été votre processus ?",
      "Racontez une expérience où vous avez travaillé en équipe avec des collègues aux approches ou valeurs très différentes des vôtres.",
      "Donnez un exemple d'une situation dans laquelle vous avez dû innover ou improviser face à un imprévu dans un contexte professionnel ou d'enseignement.",
      "Décrivez une situation où vous avez accompagné quelqu'un (étudiant, collègue, patient) vers une évolution ou une prise de conscience significative.",
      "Racontez un moment où vous avez reçu un feedback difficile à accepter sur votre travail. Comment l'avez-vous intégré ?",
      "Qu'est-ce qui, dans votre parcours, vous a le plus transformé en tant que professionnel·le ? Pourquoi ?",
      "Comment envisagez-vous votre propre développement en tant qu'enseignant·e ? Quelles compétences souhaitez-vous développer ?",
      "Quelle est, selon vous, la différence entre un bon praticien et un bon enseignant ?",
      "Que pensez-vous apporter à vos étudiants que les livres ou les cours en ligne ne peuvent pas donner ?",
      "Comment définiriez-vous votre propre style d'enseignement, et sur quoi repose-t-il ?",
      "Quelle est votre conception de l'erreur dans le processus d'apprentissage, tant pour vous que pour vos étudiants ?",
      "Si vous deviez vous définir en trois mots en tant qu'enseignant·e, lesquels choisiriez-vous et pourquoi ?",
      "Qu'est-ce qui vous rendrait fier·ère de votre passage à l'IIP dans 5 ans ?",
    ],
  },
];
