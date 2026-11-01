// Mode d'emploi — « Mon espace » (chaque membre du personnel) et « Le travail d'équipe ».
// Rédigé d'après le code (frontend/src/App.jsx, components/MonCompte.jsx, pages/Accueil.jsx, MessagesRecus,
// TuileQuiEstLa, TuileNouveautes, MesPropositions, Ameliorations, AgendaAbonnement, Professeurs.jsx (MaFiche),
// pages/SuiviEquipe.jsx, ConfierTache, pages/Echeancier.jsx, pages/Communication.jsx ; backend routes/auth.js,
// lib/motDePasse.js, routes/suggestions.js, routes/reunions.js, routes/echeancier.js, routes/equipe.js,
// routes/referentiels.js, lib/recapQuotidien.js, lib/rappels.js).

export const chapitres = [
  {
    id: 'moi', pour: 'ens sec coo dir', titre: 'Mon espace', icone: 'IconUserCircle',
    resume: "Mon compte, mon tableau de bord, ce que Lucie m'envoie, mon horaire, ma fiche et mes idées.",
    points: [
      {
        titre: "Mon compte : changer mon mot de passe",
        ou: "Barre du haut, le bouclier à côté de la porte de sortie → fenêtre « Mon compte ».",
        texte: "Le mot de passe se choisit soi-même : personne d'autre n'a à le connaître. Dans « Mon compte », bloc « Mot de passe », [[Changer]] ; tapez le mot de passe actuel, le nouveau deux fois, puis [[Changer le mot de passe|fort]]. Il sera demandé à la prochaine connexion.",
        savoir: [
          "Le mot de passe actuel est exigé même quand on est connecté : un poste laissé ouvert deux minutes ne suffit pas à s'approprier le compte.",
          "Au moins 12 caractères, et ni votre nom ni le début de votre adresse. Une phrase dont on se souvient vaut mieux qu'un mot compliqué.",
          "Lucie refuse un nouveau mot de passe identique à l'ancien. Le changement est inscrit au journal du compte.",
          "Tant que le bouton reste gris, la phrase à côté dit ce qui manque (mot de passe actuel, longueur, saisies différentes).",
        ],
      },
      {
        titre: "Mon compte : la vérification en deux temps",
        ou: "Fenêtre « Mon compte » → bloc « Vérification en deux temps ».",
        texte: "Avec elle, un mot de passe volé ne suffit plus : chaque connexion demande aussi le code à six chiffres de votre application d'authentification (Microsoft Authenticator, Google Authenticator, un gestionnaire de mots de passe…). [[Configurer|fort]] montre un QR code à scanner (ou une clé à recopier) ; tapez le code affiché, puis [[Activer|fort]]. Lucie vous donne alors dix codes de secours.",
        savoir: [
          "Les dix codes de secours ne s'affichent qu'une fois : notez-les ou copiez-les tout de suite. Chacun ouvre une seule connexion, le jour où le téléphone est perdu (« Téléphone perdu ? Code de secours » sur l'écran de connexion).",
          "La fenêtre dit combien de codes de secours il vous reste. [[Nouveaux codes de secours]] en refait dix, sur le code de l'application ; les anciens cessent aussitôt.",
          "[[Désactiver]] demande votre mot de passe et efface les codes de secours.",
          "Si la fenêtre annonce que la clé de chiffrement du serveur n'est pas configurée, la vérification est indisponible : prévenez la direction.",
        ],
      },
      {
        titre: "Mot de passe oublié",
        ou: "Écran de connexion → « Mot de passe oublié ? ».",
        texte: "Tapez votre adresse : un lien part dans votre boîte. Il permet de choisir un nouveau mot de passe ; il ne vous connecte pas.",
        savoir: [
          "Le lien vaut 60 minutes et ne sert qu'une fois.",
          "La réponse à l'écran est toujours la même, que l'adresse soit connue ou non : l'écran ne dit pas qui a un compte.",
          "Trois demandes par heure au plus pour un même compte : au-delà, rien ne part.",
          "La vérification en deux temps reste demandée à la connexion suivante.",
        ],
      },
      {
        titre: "Ce que j'ai sous les yeux en arrivant",
        ou: "Tableau de bord → Ce qui m'attend.",
        texte: "Le tableau de bord commence par vous saluer, avec la date. Viennent d'abord, toujours en tête et sans qu'on puisse les déplacer, les messages de l'école, les présences à compléter après un QR (enseignants) et la tuile « Qui est là ? ». Puis les blocs, qui n'apparaissent que s'ils ont quelque chose à dire : Quoi de neuf dans Lucie, Conventions à signer, Textes à confirmer, Demandes à valider (direction), Mes propositions, Mes tâches, et le fil d'activité.",
        savoir: [
          "L'ordre des blocs se règle pour toute l'école par l'administrateur (mode mise en page) ; les messages, les présences à compléter et « Qui est là ? » ne se masquent jamais.",
          "Un compte créé aujourd'hui arrive sur un tableau de bord propre : les notifications antérieures n'y paraissent pas, les messages et les vœux si.",
        ],
      },
      {
        titre: "Mes tâches, ce dont on me tient au courant, ce que j'ai confié",
        ou: "Tableau de bord → Ce qui m'attend → bloc « Ce qui m'attend ».",
        texte: "Vos tâches ouvertes, avec ce qu'elles servent (« pour : » une obligation de l'échéancier, ou « décidée le » en réunion) et leur échéance : « J-5 », « aujourd'hui », « en retard de 3 jours ». La case à droite les marque faites. Quand l'échéance approche, « pas encore fait ? » permet de signaler le retard plutôt que de le taire. Dessous, « Pour information » (les tâches des autres dont on vous tient au courant, sans case : ce n'est pas à vous de dire que c'est fait) et « Ce que j'ai confié » (vos tâches chez d'autres, avec leur signal « pas encore fait »).",
        savoir: [
          "« Les miennes », ce sont les tâches confiées à votre nom, à votre fiche du personnel, à plusieurs dont vous, ET celles confiées à votre service (« le secrétariat », « la coordination »…).",
          "Dès qu'une tâche est à trois jours ou moins, ou dépassée, un bandeau « Urgent » le dit en tête du bloc.",
          "Une tâche jamais vue porte « nouveau » à sa première apparition, puis cesse de l'être.",
          "Cocher « faite » est daté et signé à votre nom ; le signal « pas encore fait » aussi, et il s'efface quand la tâche est faite. Un clic sur le signal le retire.",
          "Si une réunion a fixé sa prochaine séance et vous y attend, une ligne « Prochaine réunion » donne la date, l'heure et le lieu.",
        ],
      },
      {
        titre: "Les messages de l'école",
        ou: "Tableau de bord, en tête : une ligne par message.",
        texte: "La direction, le secrétariat et les coordinations écrivent au tableau de bord (voir « Le travail d'équipe »). Chaque message tient sur une ligne : son titre, son auteur, l'heure, le début du texte ; l'icône et la couleur disent son importance (Information, Important, Urgent, Bonne nouvelle). Un clic l'ouvre en entier : [[Marquer comme lu|IconCheck|fort]] — ou, si l'auteur demande un accusé, [[J'en ai pris connaissance|IconCheck|fort]].",
        savoir: [
          "Un message qui demande un accusé porte « À confirmer » tant que vous n'avez pas confirmé ; les autres portent « Nouveau » tant qu'ils ne sont pas lus.",
          "Lu, la ligne dit « Lu » ; confirmé, « Confirmé ». L'auteur voit qui a lu et qui a confirmé.",
          "Un message reste affiché jusqu'à la date choisie par l'auteur (60 jours par défaut), ou jusqu'à ce qu'il le retire.",
        ],
      },
      {
        titre: "Le fil d'activité et les notifications",
        ou: "Tableau de bord → Ce qui m'attend, sous les blocs ; « Filtrer » dans le rail.",
        texte: "Ce qui s'est passé et qui vous concerne : attributions, notes encodées, recrutement, système, anniversaires. Les encodages de notes se lisent en tableau, un cours par groupe et une ligne par professeur, avec le nombre de notes et d'étudiants ; « Voir » ouvre le cours. [[Filtrer|IconFilter]] choisit les événements (Tout, Attributions, Notes, Recrutement, Système) et la durée (7 jours, 30 jours, 3 mois).",
        savoir: [
          "Un filtre actif s'écrit sous le titre de la page : on ne croit pas un fil vide alors qu'il est filtré. « Tout revoir » remet le réglage par défaut.",
          "« Tout marquer comme lu » vide le compte des non-lus, que la pastille de l'icône du Tableau de bord affiche.",
        ],
      },
      {
        titre: "Qui est là ? — en cas de souci",
        ou: "Tableau de bord, la tuile « Qui est là ? » ; ou le bouton « Urgence » / « Contact now » de la barre du haut, sur tous les écrans.",
        texte: "Qui est là maintenant, et qui est de permanence, avec un bouton pour l'appeler (le téléphone appelle ; sur ordinateur, l'application d'appel). La frise de la journée montre, personne par personne, quand on peut la trouver et sa pause ; les jours de la semaine se choisissent au-dessus. [[J'arrive]] et [[Je pars]], au pied de la fenêtre, signalent votre présence du jour : elle corrige votre horaire pour aujourd'hui.",
        savoir: [
          "Le bouton de la barre dit « Contact now » quand le secrétariat est ouvert, « Urgence » sinon (il mène alors à la permanence). Il se relit chaque minute.",
          "Un numéro ne s'affiche que quand la personne est là ou de permanence. Une personne « selon l'agenda » sans numéro est signalée injoignable.",
          "Les horaires, les numéros et les permanences se règlent par la direction et la direction adjointe (voir « Le travail d'équipe »). Les autres ne voient que « Maintenant ».",
        ],
      },
      {
        titre: "Le récapitulatif du matin, par courriel",
        ou: "Votre boîte de l'institut, chaque matin après 7 h.",
        texte: "Un courriel « Lucie — ce qui vous attend », SEULEMENT si quelque chose de nouveau vous attend depuis le précédent : les rappels du jour, vos tâches ouvertes (« en retard » s'il le faut), les textes à lire et confirmer, les messages non lus, les réponses de la direction à vos idées — et, pour la direction, les idées déposées. Des intitulés et des nombres, « nouveau » à côté de ce qui l'est, et un lien vers le tableau de bord.",
        savoir: [
          "Rien de nouveau, rien ne part. Un seul courriel par personne et par jour.",
          "Il ne recopie aucun contenu sensible : le détail est dans Lucie.",
          "Il part en production seulement, et la direction peut l'éteindre (Configuration → Courriels → Récapitulatif quotidien).",
        ],
      },
      {
        titre: "Les rappels que je reçois",
        ou: "Dans le récapitulatif du matin, ou aussitôt pour l'urgent.",
        texte: "Selon votre rôle et vos sections, Lucie vous rappelle ce qui vous revient : une échéance de l'échéancier dont vous êtes responsable ; pour un enseignant, la date de la délibération (J-10, J-3) avec ce qui reste à encoder, le dernier délai (J-2) et « délai dépassé » ; les présences d'une séance passée à compléter ; un avis attendu de vous (valorisation, aménagement raisonnable). Le secrétariat, la coordination et la direction reçoivent en plus les dates de délibération à poser, les séances passées non closes, les propositions de PAE en ligne, les délais de procédure et, chaque lundi, un bilan.",
        savoir: [
          "Un rappel ordinaire entre dans le récapitulatif du matin ; l'urgent (jour J, dernier délai, délai dépassé, délai d'un recours) part aussitôt.",
          "On ne se désabonne pas : la direction seule règle les rappels, un par un (Configuration → Courriels → Rappels).",
          "Une coordination ne reçoit que les rappels de ses sections.",
          "Les rappels naissent éteints : rien ne part tant que la direction ne les a pas allumés.",
        ],
      },
      {
        titre: "Quoi de neuf dans Lucie ?",
        ou: "Tableau de bord, la tuile « Quoi de neuf dans Lucie ? ».",
        texte: "Le guide des nouveautés, en onglets : « En bref », une partie par thème (chaque nouveauté en carte, avec son chemin « Où »), puis « Ensuite » — ce qui est en préparation et pas encore dans Lucie. Chacun ne reçoit que ce qui le concerne : un enseignant ne lit pas les nouveautés du secrétariat.",
        savoir: [
          "La tuile porte « Nouveau » jusqu'à ce que vous l'ouvriez ; elle se rallume quand le guide s'enrichit. Ce « vu » est gardé par l'appareil : sur un autre ordinateur ou sur le téléphone, la tuile peut redire « Nouveau ».",
          "La direction choisit en tête de la fenêtre le public pour voir le guide tel que chacun le reçoit.",
        ],
      },
      {
        titre: "Mon horaire dans l'agenda du téléphone — en détail",
        pour: 'ens coo dir',
        ou: "Mes cours → rail → « Mon horaire dans mon agenda ».",
        texte: "Ajouté une fois à l'agenda, le lien y fait paraître vos cours avec l'heure et le local ; un cours déplacé ou annulé s'y met à jour de lui-même. [[Créer mon lien|fort]], puis [[Copier|IconCopy]] ou, depuis le téléphone, « Ouvrir dans l'agenda de cet appareil ». La fenêtre donne la marche à suivre pour iPhone/iPad/Mac, Google Agenda et Outlook.",
        savoir: [
          "Le lien ne s'affiche qu'à sa création. Perdu, on en crée un nouveau ([[Nouveau lien|IconRefresh]]) : l'ancien cesse aussitôt. [[Désactiver le lien]] l'arrête sans le remplacer.",
          "Il porte vos séances des deux derniers mois et celles à venir : cours, heures, locaux — ni étudiant, ni note. Il est personnel : ne le partagez pas.",
          "L'agenda relit le lien toutes les quelques heures ; Google, moins souvent (jusqu'à un jour).",
          "Un compte relié à aucune fiche d'enseignant n'a pas d'horaire à publier : la direction fait le lien dans Personnel → fiche → Accès Lucie, sans changer le rôle du compte.",
        ],
      },
      {
        titre: "Ma fiche (enseignant) : proposer une correction",
        pour: 'ens',
        ou: "Barre du haut → Ma fiche → [[Modifier la fiche]].",
        texte: "« Ma fiche » montre vos attributions de l'année. [[Modifier la fiche]] ouvre votre identité civile, vos coordonnées, votre compte bancaire, votre situation fiscale et vos titres. Corrigez puis [[Enregistrer|fort]] : rien ne s'écrit tout de suite, la modification part en demande (« Modification transmise ») et la direction la valide ou la refuse.",
        savoir: [
          "Se proposent : adresse, téléphone, adresse privée, état civil et identité, numéro national, compte bancaire, situation fiscale et du conjoint, règlement européen 883/2004, titres de capacité. Statut, ancienneté et matricule restent à l'administration : signalez-les au secrétariat.",
          "Si rien n'a changé, Lucie le dit (« Rien à transmettre ») et ne dépose rien.",
          "Si votre compte n'est pas encore relié à votre fiche, l'écran le dit : le secrétariat fait le lien.",
        ],
      },
      {
        titre: "Mes idées : suivre, corriger, retirer",
        ou: "L'ampoule « Proposer une amélioration » (fenêtre « Améliorations ») ; Tableau de bord → bloc « Mes propositions ».",
        texte: "La fenêtre « Améliorations » liste vos idées, avec leur état : Nouvelle, Retenue, En cours, Faite, Écartée. « Lire le fil » ouvre la conversation avec la direction ; « Écrire » y ajoute un message. L'écran d'où l'idée est partie est enregistré avec elle. Dès que la direction répond, l'idée paraît au tableau de bord, bloc « Mes propositions », marquée « nouveau ».",
        savoir: [
          "« Modifier » corrige l'intitulé et le contexte de votre idée tant que la direction n'y a pas répondu ; ensuite, on écrit dans le fil.",
          "La corbeille retire une idée tant que la direction n'y a pas répondu ; après, Lucie refuse : la réponse partirait avec.",
          "Une idée faite ou écartée, dont le dernier échange est lu depuis plus de trente jours, quitte « Mes propositions » ; elle reste dans la fenêtre.",
          "Seule la direction donne un état et répond au nom de l'école ; on ne réécrit pas l'idée d'un autre.",
        ],
      },
      {
        titre: "Les idées à traiter (direction)",
        pour: 'dir',
        ou: "Tableau de bord → bloc « Idées à traiter » ; « Toutes les idées » ouvre la fenêtre.",
        texte: "Chaque idée nouvelle, ou dont l'auteur vous a écrit sans être lu, avec son auteur et l'écran d'où elle vient. Dépliée, elle montre son texte, une liste « État » et le fil : la réponse s'écrit dessous — même pour dire non, et pourquoi. L'idée quitte le bloc quand elle a un état et que son fil est lu.",
        savoir: [
          "Votre réponse paraît au tableau de bord de l'auteur et dans son récapitulatif du matin.",
          "Le fil d'une idée est marqué lu par Lucie quand il vous est servi, pas par un clic.",
        ],
      },
    ],
  },

  {
    id: 'equipe', pour: 'sec coo dir', titre: "Le travail d'équipe", icone: 'IconUsersGroup',
    resume: "Les tâches et leur frise, les réunions et leurs procès-verbaux, l'échéancier légal, la communication interne, la permanence.",
    points: [
      {
        titre: "Échéances et tâches : la frise et la liste",
        ou: "Tableau de bord → Suivi d'équipe → rail « Échéances et tâches ».",
        texte: "En tête, la frise : trente jours devant et sept derrière, une boule par tâche. Dessous, les tâches, rangées et filtrées dans la barre : « Chercher une tâche… », une personne ou un service (le secrétariat, la coordination, la direction adjointe, la direction), une section ; « Par personne », « Par échéance », « Par section » ou « Sans regroupement » ; « Trier par » échéance, priorité, intitulé ou date de création. Trois segments au-dessus : Ouvertes · En retard (avec leur nombre) · Toutes.",
        savoir: [
          "« Effacer les filtres » rend toute la liste ; le nombre de tâches affichées est à droite.",
          "L'avion sort « Échéances et tâches », la liste telle qu'elle est filtrée ; la « Feuille des tâches » (toutes les tâches en cours, par personne) sort par l'avion du rail.",
          "La section d'une tâche est celle de sa réunion et celles de ses responsables.",
        ],
      },
      {
        titre: "Une tâche se travaille sur sa ligne",
        ou: "Suivi d'équipe → Échéances et tâches, ou les décisions d'une réunion.",
        texte: "Sur chaque ligne : l'intitulé (il se corrige sur place), les responsables, la date « Pour quand », le statut — à faire, en cours, fait, abandonnée — et la case qui marque la tâche faite ou la rouvre. Le bouton « ⋯ » ouvre le reste : l'obligation de l'échéancier que la tâche sert (« — ne sert aucune obligation — » sinon) et les personnes « au courant ».",
        savoir: [
          "Le premier responsable nommé répond de la tâche ; les autres la portent avec lui.",
          "« Au courant » : la personne voit la tâche à son tableau de bord sous « Pour information », sans en répondre.",
          "Faite, la tâche garde la date et le nom de qui l'a cochée ; la rouvrir efface cette marque.",
          "Une tâche ne se supprime que par la direction ; sinon, on la passe « abandonnée », ce qui laisse une trace.",
          "Toute tâche du suivi paraît aussi dans l'échéancier, zone « Suivi d'équipe », marquée « suivi », à sa date (à défaut, celle de sa séance).",
        ],
      },
      {
        titre: "Confier une tâche",
        ou: "Suivi d'équipe → rail → « Confier une tâche ».",
        texte: "Une consigne donnée hors réunion se consigne ici. À gauche, « À qui » : la liste du personnel et des comptes, filtrable par section et par nom ; cochez qui fait la tâche, et « au courant » pour qui doit seulement savoir. À droite : « Quoi », « Pour quand » (facultatif), « Priorité » (Basse, Normale, Haute), « Précision ». Puis [[Confier|fort]] — ou « Confier à 3 personnes ».",
        savoir: [
          "Une tâche se confie à des personnes cochées, jamais à un nom tapé.",
          "Plusieurs personnes cochées font UNE tâche portée à plusieurs ; la première cochée en répond.",
          "Le bouton reste gris tant que « Quoi » est vide ou que personne n'est coché, et la phrase à côté le dit.",
          "La tâche paraît aussitôt chez ses responsables (« nouveau »), dans leur récapitulatif du matin, et chez vous sous « Ce que j'ai confié ».",
        ],
      },
      {
        titre: "Les réunions : la liste et une nouvelle séance",
        ou: "Suivi d'équipe → rail « Réunions » ; « + Nouvelle réunion… » en haut de la liste, ou « Nouvelle réunion » dans le rail.",
        texte: "Les séances de l'année, de la plus récente à la plus ancienne : date, titre, qui l'a organisée, section et unités, les présents et les excusés, le nombre de tâches et de tâches encore ouvertes ; un cadenas signale des notes confidentielles. Une nouvelle réunion se crée en choisissant son type : Secrétariat, Coordination de section, Coordination de stage, COPIL, Conseil d'administration, Bilatérale direction — coordination, Bilatérale de direction, Conseil des études (hors délibération), Équipe d'unité, Démarche qualité (AEQES), Autre réunion.",
        savoir: [
          "On choisit le type, on n'écrit pas l'intitulé : c'est ce qui permet de retrouver l'historique d'un même type de réunion.",
          "Chacun voit les réunions qu'il a organisées, celles où il était convoqué, et celles qui portent sur ses sections ; la direction et le secrétariat voient tout.",
          "Une réunion se remplit pendant la séance : chaque champ s'enregistre quand on le quitte, « Enregistré » le confirme.",
        ],
      },
      {
        titre: "La séance : qui, quand, où",
        ou: "Suivi d'équipe → Réunions → une séance.",
        texte: "En tête : l'intitulé, le type, la date, l'heure, le lieu ; « ▸ Organisateur, section, unités » déplie qui organise, la section (ou « Toutes — portée générale ») et les unités concernées. Puis « Présences » : une pastille par personne, un clic la fait passer de présent à excusé puis absent ; on ajoute quelqu'un de tout le personnel, on retire d'un clic. Si des tâches des séances précédentes restent ouvertes, « Suivi des séances précédentes » les rappelle, à déplier en début de séance.",
        savoir: [
          "Les noms des présents s'affichent ensuite dans la liste des réunions : c'est ce qui distingue deux séances du même type.",
          "[[Réunions|IconArrowLeft]] revient à la liste ; [[Enregistrer|fort]] enregistre tout d'un coup.",
        ],
      },
      {
        titre: "Les points, les décisions, la suite",
        ou: "Une séance → sous les présences.",
        texte: "[[Ajouter un point|IconPlus]] : un intitulé, ce qui s'est dit et ce qui a été tranché, puis ses « Décisions » — chaque décision est une tâche, avec ses responsables et sa date, qui rejoint aussitôt le suivi. Le cadenas d'un point le rend confidentiel. En bas : « Prochaine séance » (date, heure, lieu, qui est attendu), « Décisions hors des points », « Notes générales » et, pour qui y a droit, « Notes confidentielles ».",
        savoir: [
          "Retirer un point garde les tâches décidées dessous.",
          "La prochaine séance s'affiche au tableau de bord de ceux qui y sont attendus.",
          "Les notes et les points confidentiels ne se lisent que par la direction, l'organisateur et les participants convoqués ; pour les autres, Lucie ne les envoie même pas à l'écran.",
        ],
      },
      {
        titre: "Le procès-verbal",
        ou: "Une séance → l'avion « Procès-verbal de la réunion » ; « PV intégral » à côté.",
        texte: "L'avion sort le procès-verbal à diffuser : points, décisions, présences — sans les notes confidentielles. [[PV intégral|IconLock]], réservé à qui lit le confidentiel, les comprend : il n'est pas à diffuser.",
        savoir: [
          "Supprimer une réunion est réservé à la direction (la corbeille, en fin de barre) : points, notes et présences sont effacés ; les tâches décidées restent dues, sans réunion.",
        ],
      },
      {
        titre: "Le rapport du mois",
        pour: 'dir',
        ou: "Suivi d'équipe → rail → « Rapport du mois ».",
        texte: "Choisissez le mois, puis l'imprimante du bandeau, « Produire le rapport » : réunions, tâches faites et en retard, étudiants, délibérations, valorisations, personnel.",
        savoir: [
          "Il part aussi tout seul, la première semaine de chaque mois, par courriel à la direction pour le mois écoulé — une fois, si l'envoi des courriels est configuré.",
        ],
      },
      {
        titre: "L'échéancier : lire les obligations de l'année",
        ou: "Tableau de bord → Échéancier.",
        texte: "Les obligations réglementaires et les jalons de l'année (circulaire 9760, décret du 16 avril 1991, RGE, statut du 1er février 1993), avec les actions du suivi d'équipe qui s'y rattachent. Cinq compteurs : En retard, Dans 7 jours, Dans 30 jours, Faites, Total de l'année. Quatre onglets : Timeline (par mois) · Liste · Mes tâches · Référentiel. Trois filtres : la zone (Personnel, Documents, Travail administratif UE, Établissement, Suivi d'équipe), le statut, le responsable ; « Tout afficher » les retire.",
        savoir: [
          "Un clic sur une échéance ouvre son détail : description, date, zone, responsable, base légale, qui l'a faite et quand ; « Ouvrir la page concernée » mène à l'écran où on la traite.",
          "« Marquer fait » sur une échéance : réservé à son responsable (son nom ou son rôle) et à l'administrateur. Une action du suivi d'équipe se coche comme dans le suivi.",
          "« Mes tâches » ne garde que ce qui reste à faire pour vous.",
          "« auto » marque une échéance calculée par Lucie ; « suivi », une action décidée en réunion.",
          "Une coordination ne voit que les échéances de ses sections et celles de l'école entière.",
        ],
      },
      {
        titre: "L'échéancier : régénérer et le référentiel",
        ou: "Échéancier → [[Régénérer|IconPlayerPlay|fort]] ; onglet « Référentiel ».",
        texte: "[[Régénérer|IconPlayerPlay|fort]] recalcule l'échéancier de l'année d'après les dates des unités, les séances de délibération et le calendrier, met les retards à jour et relance tous les rappels ; Lucie dit combien d'échéances ont été ajoutées, combien sont en retard, combien de rappels sont partis. « Référentiel » liste les obligations types : règle de date, zone, responsable, base légale, nombre d'échéances tirées de chacune.",
        savoir: [
          "Régénérer : direction et secrétariat. Le référentiel se modifie par l'administrateur, à la lecture d'une nouvelle circulaire.",
          "Sans dates d'UE encodées (Organisation → Planification → Dates des UE), l'échéancier reste vide.",
          "Une échéance d'unité dont la date bouge remplace l'ancienne, tant que personne n'y a touché.",
        ],
      },
      {
        titre: "La communication : composer le message",
        ou: "Tableau de bord → Communication.",
        texte: "En plus du titre, du message et des destinataires : l'« Importance » donne sa couleur à la carte chez le destinataire (Information, Important, Urgent, Bonne nouvelle) ; l'« Icône » dit de quoi il s'agit (réunion, examens, document, horaire, fête…). Cochez « Demander un accusé de lecture » quand chacun doit confirmer « J'en ai pris connaissance ». « Afficher jusqu'au » fixe la date de retrait ; vide, 60 jours.",
        savoir: [
          "Les groupes s'additionnent ; une personne comprise dans deux groupes n'est comptée qu'une fois.",
          "Ceux qui n'ont pas encore de compte Lucie sont comptés à part : le message les attendra, et la copie par courriel les prévient.",
          "Sur la version de développement, les copies par courriel sont redirigées.",
        ],
      },
      {
        titre: "La communication : suivre, retirer, faire le ménage",
        ou: "Tableau de bord → Communication → « Messages envoyés ».",
        texte: "Chaque message envoyé dit combien l'ont lu et, s'il demande un accusé, combien ont confirmé. Un clic ouvre la liste nominative, une coche devant chaque lecture, une double coche devant chaque confirmation. [[Retirer|IconTrash]] l'enlève des tableaux de bord.",
        savoir: [
          "Un message retiré reste au registre : on sait qu'il a été envoyé, à qui, et qui l'avait lu.",
          "[[Vider leurs tableaux de bord]] retire les notifications reçues jusqu'ici par les comptes des groupes choisis ; messages et vœux restent. Le bouton ↶ défait ce ménage.",
        ],
      },
      {
        titre: "Qui est là ? : horaires, numéros, permanences",
        pour: 'dir',
        ou: "Tableau de bord → tuile « Qui est là ? » (ou bouton « Urgence ») → onglets.",
        texte: "Trois onglets de plus pour la direction et la direction adjointe. « Mon horaire et mon numéro » : vos plages de la semaine (jour, début, fin, lieu, pause) et le numéro que vous acceptez d'afficher. « Horaires de l'équipe » : « La semaine de l'équipe » (une ligne par personne, une colonne par jour, [[Enregistrer la semaine|fort]] — seules les lignes modifiées partent ; « lundi → toute la semaine » recopie le lundi) ou « Une personne » (son numéro, plusieurs plages par jour). « Permanences » : habituelles (des jours de la semaine) ou à une date (répétable sur plusieurs semaines), avec la personne de permanence, deux secours et une note.",
        savoir: [
          "Le lieu se choisit dans une liste ; « Selon l'agenda — joindre par téléphone » sert pour qui est en réunion dehors : sans numéro, il est signalé injoignable.",
          "Un numéro belge incomplet est signalé à la saisie. Il ne s'affiche que quand la personne est là ou de permanence.",
          "« Ajouter la pause de midi (12 h 00 – 12 h 30) à toute l'équipe » la pose sur les plages qui passent midi sans pause ; les pauses déjà posées ne changent pas.",
          "Dans la frise, le crayon à côté d'un nom ouvre directement son horaire ou sa permanence.",
        ],
      },
    ],
  },
];

export const ajouts = {};

// Des points du guide existant, allégés : « Mon espace » et « Le travail d'équipe » deviennent la référence.
export const remplacements = {
  "demarrage|Votre compte et la connexion": {
    titre: "Votre compte et la connexion",
    ou: "Le bouclier, à côté de la déconnexion (« Mon compte ») ; l'écran de connexion.",
    texte: "La connexion demande votre mot de passe puis, si elle est activée, un code à six chiffres de votre application d'authentification (vérification en deux temps). Le mot de passe se change et la vérification en deux temps s'active dans « Mon compte » : voir le chapitre « Mon espace ».",
    savoir: [
      "Après plusieurs mots de passe erronés, le compte se bloque un temps (réglé dans Configuration → Accès → Sécurité).",
      "Le numéro de version, en haut à droite, dit quelle Lucie vous utilisez. Sur la version de développement, une pastille orange « DEV » l'accompagne.",
    ],
  },
  "accueil|Quoi de neuf dans Lucie ?": {
    titre: "Quoi de neuf dans Lucie ?",
    ou: "Tableau de bord, la tuile « Quoi de neuf dans Lucie ? ».",
    texte: "Les nouveautés récentes, rangées par public, avec où les trouver. Voir le chapitre « Mon espace ».",
  },
  "accueil|Les messages de l'école": {
    titre: "Les messages de l'école",
    ou: "Tableau de bord, en tête.",
    texte: "La direction, le secrétariat et les coordinations écrivent directement au tableau de bord : [[Marquer comme lu|IconCheck|fort]], ou « J'en ai pris connaissance » quand l'auteur demande un accusé. Le détail est au chapitre « Mon espace ».",
    savoir: [
      "Un compte créé aujourd'hui arrive sur un tableau de bord propre : les notifications antérieures ne s'y affichent pas, les messages et les vœux si.",
    ],
  },
  "accueil|Échéancier": {
    titre: "Échéancier",
    pour: "sec coo dir",
    ou: "Tableau de bord → Échéancier.",
    texte: "Les obligations légales et internes de l'établissement, avec leurs délais : qui en répond, pour quand, sur quelle base. Le détail (lecture, filtres, Régénérer, référentiel) est au chapitre « Le travail d'équipe ».",
  },
  "accueil|Suivi d'équipe": {
    titre: "Suivi d'équipe",
    pour: "sec coo dir",
    ou: "Tableau de bord → Suivi d'équipe.",
    texte: "« Échéances et tâches » (la frise et la liste), « Réunions » (séances, décisions, procès-verbaux), « Confier une tâche » et, pour la direction, « Rapport du mois ». Tout est décrit au chapitre « Le travail d'équipe ».",
  },
};
