/**
 * LE MODE D'EMPLOI DE LUCIE — son contenu, servi par le serveur (3.1.467, Charles, 29 octobre 2026 : « un vrai
 * guide illustré et joli » ; « filtré par rôle »). Il vivait dans `pages/Aide.jsx`, donc dans le paquet de l'écran :
 * tout le monde pouvait tout lire. `GET /api/documentation/mode-emploi` ne rend à chacun que ses chapitres
 * (`pour` : ens · sec · coo · dir, sur le chapitre et, au besoin, sur le point).
 *
 * Un point : { titre, ou?, texte, savoir?: [], pour? }.
 *   ou     — le chemin, avec les libellés de l'écran ;
 *   texte  — ce qu'on y fait ;
 *   savoir — ce qu'il faut savoir : les règles qui bloquent ou qui surprennent.
 * Il explique le travail, pas l'informatique (CLAUDE.md, § 7). La version décrite se dit en tête.
 */
export const VERSION_DECRITE = '3.1.502';

export const RUBRIQUES = [
  {
    id: 'ensemble', pour: 'ens sec coo dir', titre: 'Lucie en un coup d’œil', icone: 'IconLayoutGrid',
    resume: "Ce que Lucie couvre, pour qui, et les garde-fous qu'elle tient.",
    points: [
      {
        titre: "Ce que Lucie couvre",
        texte: "Lucie est l'application de gestion académique de l'Institut Ilya Prigogine. Elle tient, en un seul endroit, tout le parcours de l'étudiant et toute l'organisation de l'enseignement : inscription et programme annuel (PAE), valorisation des acquis, aménagements raisonnables, notes et délibérations, recours et discipline, diplômes, stages et conventions, congé-éducation payé ; et, côté école, le personnel et son recrutement, les attributions, la planification, les horaires, la dotation, les chiffres de l'école, la documentation réglementaire et le suivi d'équipe.",
        savoir: [
          "Étudiants : liste et fiche, PAE, valorisation (VA / VAE), aménagements (AR), délibération, recours et discipline, diplômes, stages, congé-éducation, finances.",
          "Personnel : fiches, dossier administratif, absences, entretiens, contrats, besoins, recrutement, classement.",
          "Organisation : attributions, planification, horaires, répartition des étudiants, pondérations, descriptifs d'UE, effectifs.",
          "Gestion et chiffres : dotation, budget, répartition des périodes, ETP, résultats, population réelle.",
          "Documentation : textes réglementaires avec accusé de lecture, conventions et leur signature, ce mode d'emploi.",
          "Tableau de bord : ce qui attend chacun, l'échéancier légal, les réunions et les tâches de l'équipe.",
        ],
        images: [
          { src: "/guide/ensemble-barre-direction.png", legende: "La barre du haut de la direction : un axe par métier (Tableau de bord, Mes cours, Étudiants, Personnel, Organisation, Gestion, Documentation, Configuration), puis la recherche, le bouton ↶ et le compte." },
        ],
      },
      {
        titre: "Pour qui",
        texte: "La direction et la direction adjointe, le secrétariat, les coordinations de section et les enseignants. Chacun voit son métier : un rôle dit ce qu'on peut faire, un périmètre quelles sections on voit. Les étudiants n'ont qu'une porte, publique : la demande de valorisation en ligne.",
        savoir: [
          "Ce qu'un rôle ne peut pas faire n'apparaît pas à l'écran : pas de bouton qui serait refusé après le clic.",
          "La direction règle elle-même, sans développeur, les droits de chaque rôle, geste par geste.",
        ],
        images: [
          { src: "/guide/ensemble-barre-enseignant.png", legende: "La même barre pour un enseignant : Tableau de bord, Mes cours, Ma fiche, Organisation, Documentation — ce que son rôle ne permet pas n'apparaît pas." },
        ],
      },
      { titre: "Les garde-fous",
        texte: "Lucie applique les textes plutôt que de les rappeler : décret du 16 avril 1991, règlement des "
             + "études (RDE), circulaires de la Fédération Wallonie-Bruxelles, procédures de l'Institut.",
        savoir: [
          "Aucune pièce signée ne sort si la procédure qui doit la précéder n'a pas été parcourue (valorisation, aménagements, recours, discipline).",
          "Celui qui clique est celui qui signe : chaque validation, décision ou confirmation porte un nom et une heure, et les journaux ne s'effacent pas.",
          "Toute pièce imprimée dit qui l'a produite et quand.",
          "Rien ne s'écrit en lot sans simulation préalable : on voit ce qui sera fait avant que ce soit fait.",
          "Jamais de cote sous 10 sur un document remis à l'étudiant, pas de compensation entre acquis, motivation obligatoire de toute décision défavorable.",
          "Une sauvegarde quotidienne de la base part hors du serveur.",
        ] },
    ],
  },
  {
    id: 'demarrage', pour: 'ens sec coo dir', titre: 'Pour commencer', icone: 'IconChevronRight',
    resume: "L'année de travail, le menu, la recherche, l'avion et les idées.",
    points: [
      {
        titre: "Lucie sur l'écran d'accueil du téléphone ou de l'iPad",
        ou: "Dans le navigateur du téléphone, à l'adresse de Lucie.",
        texte: "Lucie s'installe comme une application : une icône sur l'écran d'accueil, et elle s'ouvre en plein écran, sans barre d'adresse. Sur iPhone et iPad, ouvrez Lucie dans Safari, touchez Partager (le carré à flèche), puis « Sur l'écran d'accueil ». Sur Android, dans Chrome, touchez « Installer l'application » ou le menu ⋮ → Installer.",
        savoir: [
          "Sur iPhone et iPad, il faut passer par Safari : les autres navigateurs ne proposent pas l'installation.",
          "La première fois, connectez-vous dans l'application : l'iPhone ne lui donne pas la connexion de Safari. Elle la garde ensuite.",
          "C'est toujours la Lucie du serveur : rien à mettre à jour, et rien ne fonctionne sans connexion internet.",
        ],
      },
      {
        titre: "Revenir en arrière : le bouton ↶",
        ou: "Barre du haut, à côté de la loupe.",
        texte: "Vos 10 derniers enregistrements, dits en mots, avec l'heure. [[Revenir avant ce geste|IconArrowBackUp]] défait ce geste et ceux qui ont suivi, du plus récent au plus ancien. Un clic compte pour un seul geste, même s'il a modifié trente lignes.",
        savoir: [
          "Lucie refuse si quelqu'un a modifié la même chose depuis, et dit qui : rien n'est alors changé.",
          "Les actes officiels ne s'annulent jamais ici (séance close, valorisation validée ou notifiée, présences, recours, courriels envoyés, textes publiés) : ils se reprennent par leur procédure.",
          "La direction voit aussi « Toute l'équipe » et peut annuler le geste d'un autre, avec un motif écrit.",
        ],
        images: [
          { src: "/guide/demarrage-annuler.png", legende: "La fenêtre « Annuler mes derniers gestes » : vos dix derniers enregistrements, et sur chaque ligne [[Revenir avant ce geste|IconArrowBackUp]]." },
        ],
      },
      { titre: "Les longues listes se cherchent",
        texte: "Là où une liste est longue (le compte général du budget, les UE et les personnes de la "
             + "Communication…), on tape un mot, un morceau de mot ou un numéro, dans n'importe quel ordre et "
             + "sans accents : la liste se réduit. ↑ ↓ pour choisir, Entrée pour valider, Échap pour refermer.",
        savoir: [] },
      {
        titre: "L'année de travail",
        ou: "En haut de l'écran, le sélecteur d'année.",
        texte: "Il fixe l'année sur laquelle porte tout ce que vous voyez. Changer d'année change tous les écrans. Si vous n'y touchez pas, Lucie prend l'année active de l'établissement.",
        savoir: [
          "Avant de corriger quoi que ce soit, regardez l'année affichée.",
        ],
        images: [
          { src: "/guide/demarrage-annee.png", legende: "Le sélecteur d'année, en haut à gauche, à côté du logo.", etroite: true },
        ],
      },
      {
        titre: "Le menu du haut et le rail",
        ou: "Barre du haut : Tableau de bord · Mes cours · Étudiants · Personnel · Organisation · Gestion · Documentation · Configuration (direction).",
        texte: "La barre du haut dit dans quel métier vous êtes : des icônes, dont le nom paraît au survol ; seul l'axe ouvert écrit le sien. Quand un écran a plusieurs faces (Configuration, par exemple), elles se glissent dans la barre, à droite de l'axe. Tout le reste est dans le rail, la colonne d'icônes à gauche : les rubriques de l'axe, puis les outils de l'écran ouvert.",
        savoir: [
          "En tête de chaque rail : « Imprimer ou envoyer » (l'avion), « Importer » quand l'écran en a, « Proposer une amélioration » (l'ampoule).",
          "Ce qui efface est toujours en dernier dans le rail, en rouge brique.",
          "Une rubrique qui a des outils (« Inscriptions & PAE ») les déplie sous elle : un second clic sur la rubrique, quand on y est déjà, ouvre ou referme le tiroir. Il est fermé à l'arrivée.",
          "L'épingle en pied de rail le garde ouvert, avec les libellés ; la lune ou le soleil bascule les menus en marine ou en gris pâle.",
          "Mes cours paraît pour qui enseigne, pour les coordinations (les cours de leur section) et pour la direction (tous les cours).",
        ],
        images: [
          { src: "/guide/demarrage-menu.png", legende: "Mes cours, rail épinglé : en tête « Imprimer ou envoyer » et « Proposer une amélioration », puis les rubriques de l'écran, avec leurs libellés (données d'essai)." },
        ],
      },
      {
        titre: "Où aller ? — trouver un écran",
        ou: "La loupe de la barre du haut, ou ⌘K (Mac) / Ctrl+K (Windows).",
        texte: "Tapez un mot avec vos mots : « PAE », « couleurs », « recours », « convention ». Lucie liste les écrans et les outils qui en parlent. Flèches pour choisir, Entrée pour y aller.",
        savoir: [
          "La recherche trouve des ENDROITS, pas des étudiants. Un étudiant se cherche dans la liste des étudiants.",
        ],
        images: [
          { src: "/guide/demarrage-oualler.png", legende: "« Où aller ? » : on tape « présences », Lucie propose les écrans qui en parlent ; Entrée y mène." },
        ],
      },
      {
        titre: "L'avion : imprimer ou envoyer",
        ou: "L'avion (carré bleu) sur les écrans, les fiches et les fenêtres.",
        texte: "Toute pièce sort par le même centre, « Éditions ». L'avion l'ouvre sur ce que vous regardez : un étudiant, une unité, un membre du personnel. Voir la rubrique « Éditions ».",
        images: [
          { src: "/guide/demarrage-avion.png", legende: "Le centre « Éditions », ouvert par l'avion : les domaines en haut, les familles de pièces, le périmètre à gauche, puis « Aperçu » ou « Produire »." },
        ],
      },
      {
        titre: "Proposer une amélioration",
        ou: "L'ampoule « Proposer une amélioration », sur tous les rails.",
        texte: "Écrivez au moment où vous butez : en une phrase ce qui manque ou ce qui gêne, puis le contexte. [[Déposer l'idée|fort]]. Chaque proposition devient une conversation avec la direction.",
        savoir: [
          "La réponse de la direction paraît sur votre Tableau de bord, bloc « Mes propositions », marquée nouveau. Vous pouvez y répondre.",
          "Les messages sont signés au nom de qui écrit. Ils ne se modifient pas et ne s'effacent pas.",
        ],
        images: [
          { src: "/guide/demarrage-idee.png", legende: "La fenêtre « Améliorations » : une phrase, le contexte, puis [[Déposer l'idée|fort]] en pied de fenêtre." },
        ],
      },
      {
        titre: "Réponses types — des phrases toutes faites",
        ou: "Dans toute zone de texte : le bouton « Réponses types », en haut à droite du champ, dès qu'on clique dedans.",
        texte: "Une liste de phrases pré-établies pour ce champ, avec une recherche. Un clic insère la phrase à l'endroit du curseur, sans effacer ce qui est écrit ; on la relit et on la corrige sur place. [[Enregistrer le texte du champ|IconPlus]] garde ce que vous venez d'écrire dans vos réponses personnelles.",
        savoir: [
          "Les variables se remplissent seules : nom de l'étudiant, matricule, unité, section, session, année, date du jour, votre nom. Ce que Lucie ne sait pas reste entre crochets, [à compléter] : relisez avant d'enregistrer.",
          "Le catalogue commun est tenu par la direction (Configuration → Documents et envois → Réponses types) ; chacun garde en plus ses propres phrases, qu'il est seul à voir.",
          "Une réponse type est un point de départ, jamais une décision : la motivation reste celle qu'on relit et qu'on signe.",
        ],
        images: [
          { src: "/guide/demarrage-reponses.png", legende: "[[Réponses types]] ouvert sur le champ d'un avis : la recherche, « Mes réponses », et [[Enregistrer le texte du champ|IconPlus]] au pied." },
        ],
      },
      {
        titre: "Votre compte et la connexion",
        ou: "Le bouclier, à côté de la déconnexion (« Mon compte ») ; l'écran de connexion.",
        texte: "La connexion demande votre mot de passe puis, si elle est activée, un code à six chiffres de votre application d'authentification (vérification en deux temps). « Mon compte » l'active : [[Configurer|fort]], un QR code à scanner, puis des codes de secours à garder en lieu sûr.",
        savoir: [
          "« Mot de passe oublié » envoie un lien par courriel pour en choisir un nouveau ; la vérification en deux temps reste exigée ensuite.",
          "Après plusieurs mots de passe erronés, le compte se bloque un temps (réglé dans Configuration → Accès → Sécurité).",
          "Le numéro de version, en haut à droite, dit quelle Lucie vous utilisez. Sur la version de développement, une pastille orange « DEV » l'accompagne.",
        ],
        images: [
          { src: "/guide/demarrage-compte.png", legende: "« Mon compte » (le bouclier) : la vérification en deux temps, [[Configurer|fort]], et le mot de passe, [[Changer]].", etroite: true },
        ],
      },
      {
        titre: "Voir comme… (direction)",
        pour: "dir",
        ou: "Un clic sur vos initiales, en haut à droite → « Voir comme… ».",
        texte: "Montre Lucie telle que la voit un autre compte — une secrétaire, une coordination, un enseignant — pour vérifier ce qu'il voit et ce qu'il peut faire. Un bandeau orange le rappelle ; « Revenir à mon compte » en sort.",
        savoir: [
          "En « voir comme », rien ne s'écrit : c'est une lecture.",
        ],
        images: [
          { src: "/guide/demarrage-voircomme.png", legende: "Le menu des initiales : « Voir comme… » et la liste des comptes, avec leur rôle.", etroite: true },
        ],
      },
      {
        titre: "Les fenêtres et les questions de Lucie",
        texte: "Toutes les fenêtres ont le même dessin : un en-tête bleu marine, le contenu qui défile, et les boutons d'action dans un pied fixe, en bas. Quand Lucie vous pose une question ou vous informe, c'est une boîte à ses couleurs : un liseré à gauche dit le ton — rouge brique pour ce qui efface ou pour une erreur, vert pour une réussite, bleu marine sinon.",
        savoir: [
          "Entrée confirme, Échap annule. Échap ne ferme que la fenêtre du dessus, jamais celle qui est dessous.",
          "Une question qui efface quelque chose a son bouton en rouge brique : lisez-la avant de confirmer.",
          "Après une mise à jour de Lucie, une page restée ouverte se recharge d'elle-même la première fois qu'elle en a besoin.",
          "Sur la version de développement, une pastille orange « DEV » est collée au numéro de version : ce n'est pas la production.",
        ],
        images: [
          { src: "/guide/demarrage-question.png", legende: "Une question de Lucie avant d'envoyer un message : [[Annuler]] ou [[Envoyer|fort]] — Entrée confirme, Échap annule.", etroite: true },
        ],
      },
      { titre: "Votre rôle et votre périmètre",
        texte: "Le rôle dit ce que vous pouvez faire ; le périmètre, quelles sections vous voyez. Une coordination "
             + "limitée à TIM ne voit pas les étudiants des autres sections : c'est voulu.",
        savoir: [
          "Pas de droit, pas de bouton : ce que votre rôle ne permet pas n'est pas affiché. Si un outil vous manque, c'est le réglage des droits (Configuration → Accès), pas une panne.",
          "Une grille que vous pouvez lire sans l'écrire (les attributions pour le secrétariat, par exemple) s'affiche en lecture : ni liste déroulante, ni champ, ni corbeille.",
          "Celui qui clique est celui qui signe : chaque validation, accord ou confirmation s'enregistre à votre nom, avec l'heure.",
          "À l'écran, les personnes s'écrivent « NOM Prénom ». Les pièces officielles gardent « Prénom NOM ».",
        ] },
    ],
  },
  {
    id: 'accueil', pour: 'ens sec coo dir', titre: 'Tableau de bord', icone: 'IconHome',
    resume: "Ce qui m'attend, ce que l'équipe doit faire, les chiffres de l'école.",
    points: [
      {
        titre: "Quoi de neuf dans Lucie ?",
        ou: "Tableau de bord, la tuile en tête.",
        texte: "Les nouveautés récentes, rangées par public : où les trouver, comment s'en servir. La tuile porte « Nouveau » tant que vous ne l'avez pas ouverte ; le guide s'ouvre sur votre public (enseignants, secrétariat, coordinations), les autres restent à un clic.",
        images: [
          { src: "/guide/accueil-nouveautes.png", legende: "« Quoi de neuf dans Lucie ? » vu par un enseignant : « En bref », ce que Lucie refuse désormais, puis les nouveautés de son public." },
        ],
      },
      {
        titre: "Les messages de l'école",
        ou: "Tableau de bord, carte « Message ».",
        texte: "La direction, le secrétariat et les coordinations vous écrivent directement dans Lucie ; une copie par courriel peut l'accompagner. [[Marquer comme lu|IconCheck|fort]] : la carte affiche ✓ Lu en vert, et l'auteur sait que vous l'avez lu.",
        savoir: [
          "Un compte créé aujourd'hui arrive sur un tableau de bord propre : les notifications antérieures ne s'y affichent pas, les messages et les vœux si.",
        ],
        images: [
          { src: "/guide/accueil-message.png", legende: "Un message ouvert depuis sa carte : l'auteur, la date, l'importance, puis [[Marquer comme lu|IconCheck|fort]].", etroite: true },
        ],
      },
      {
        titre: "Écrire à l'équipe — Communication",
        pour: "sec coo dir",
        ou: "Tableau de bord → Communication (direction, secrétariat, coordinations).",
        texte: "Un titre, un message (une ligne vide sépare deux paragraphes), puis les destinataires en groupes qui s'additionnent : tout le personnel de l'année, des sections, les enseignants d'une UE, des rôles, des personnes. Lucie dit combien de personnes recevront le message, et combien n'ont pas encore de compte ; « voir la liste » les nomme. « Copie par courriel » si vous le voulez, puis [[Envoyer|IconSend|fort]].",
        savoir: [
          "« Messages envoyés » : combien l'ont lu ; un clic montre la liste, ✓ vert devant chaque lecture. « Retirer » enlève un message envoyé par erreur des tableaux de bord ; il reste au registre.",
          "[[Vider leurs tableaux de bord]] : pour les comptes existants parmi ces groupes (vous compris si vous y êtes), les notifications reçues jusqu'ici disparaissent. Les messages et les vœux restent ; le bouton ↶ défait ce ménage.",
          "Une coordination écrit aux personnes de ses sections seulement.",
        ],
        images: [
          { src: "/guide/accueil-communication.png", legende: "Communication : titre, message, importance et icône, les groupes de destinataires (ici une personne), puis [[Envoyer|IconSend|fort]] (données d'essai)." },
        ],
      },
      { titre: "Les anniversaires et les vœux",
        ou: "Tableau de bord, le jour même.",
        texte: "La carte d'un anniversaire du jour se met en fête. « ♡ Souhaiter » : un vœu d'un clic ; « Un petit "
             + "mot » : 100 caractères au plus. La personne fêtée reçoit une seule carte, « Vous avez reçu … vœux », "
             + "avec les noms et les mots, sans pastille de notification.",
        savoir: [
          "Tout le personnel de l'année voit les anniversaires ; l'âge n'est jamais affiché.",
        ] },
      {
        titre: "Ranger le tableau de bord (administrateur)",
        pour: "dir",
        ou: "Barre du haut, l'icône de mise en page.",
        texte: "Mode allumé, chaque bloc porte une petite barre : la poignée pour le déplacer, l'œil pour le masquer ou le réafficher, la demi-largeur. Ce qu'on range vaut pour toute l'école.",
        savoir: [
          "Un bloc masqué est signalé à l'administrateur au bas de l'accueil (« 2 bloc(s) masqué(s)… »), avec un lien vers la mise en page.",
        ],
        images: [
          { src: "/guide/accueil-miseenpage.png", legende: "Le mode « Mise en page » allumé : chaque bloc porte sa barre — la poignée à gauche, la demi-largeur et l'œil à droite." },
        ],
      },
      {
        titre: "Ce qui m'attend",
        ou: "Tableau de bord → Ce qui m'attend.",
        texte: "Ce que VOUS devez faire, avant le fil de ce qui s'est passé. Les blocs n'apparaissent que s'il y a quelque chose à faire.",
        savoir: [
          "« À signer » : les conventions de stage préparées, pour le seul signataire de l'établissement. Cochez, ouvrez l'« Aperçu » au besoin, puis « Signer ». Le fac-similé protégé est apposé en bas de la dernière page ; l'original reçu reste intact.",
          "« À confirmer » : les textes de Documentation dont vous devez prendre connaissance. Chaque ligne ouvre le texte. Le bloc ne disparaît qu'une fois la confirmation enregistrée.",
          "« À valider » (direction) : les modifications proposées par les coordinations. « Ouvrir » affiche les demandes à trancher.",
          "« Mes propositions » : vos idées et les réponses de la direction.",
          "Vos tâches : cochez « faite » ou signalez « pas encore faite ». Le geste est daté et visible dans le suivi.",
          "Sous les blocs, le fil d'activité : attributions, recrutement, système, anniversaires du personnel (« Aujourd'hui », « Demain »). « Tout marquer comme lu », « Actualiser » ; une pastille sur l'icône du Tableau de bord compte les non-lus.",
          "« Filtrer » (rail) règle le fil d'activité : quels événements, sur quelle durée.",
        ],
        images: [
          { src: "/guide/accueil-attente.png", legende: "Le tableau de bord d'un enseignant : un message nouveau, des présences à compléter, les nouveautés, et un texte « À confirmer » (données d'essai)." },
        ],
      },
      {
        titre: "Échéancier",
        pour: "sec coo dir",
        ou: "Tableau de bord → Échéancier.",
        texte: "Les obligations légales et internes de l'établissement, avec leurs délais : qui en répond, pour quand, sur quelle base. En tête, les compteurs : en retard, dans 7 jours, dans 30 jours, faites. Quatre lectures : Timeline · Liste · Mes tâches · Référentiel (la liste des obligations types).",
        savoir: [
          "[[Régénérer|IconPlayerPlay|fort]] recalcule les échéances de l'année d'après les dates des UE (Organisation → Planification → Dates des UE) et le calendrier.",
          "Une obligation se rattache à ses tâches : le suivi d'équipe dit qui s'en occupe.",
        ],
        images: [
          { src: "/guide/accueil-echeancier.png", legende: "L'échéancier : les compteurs en tête, les quatre lectures, les filtres, puis les obligations datées avec leur base légale ; [[Actualiser|IconRefresh]] et [[Régénérer|IconPlayerPlay|fort]] en haut à droite." },
        ],
      },
      {
        titre: "Suivi d'équipe",
        pour: "sec coo dir",
        ou: "Tableau de bord → Suivi d'équipe.",
        texte: "« Échéances et tâches » s'ouvre sur une frise de trente jours devant et sept derrière : une boule par tâche, fraise si elle est en retard ou tombe dans les trois jours, orange dans la semaine, verte plus tard — cochée quand elle est faite. Dessous, les tâches en colonnes : tâche, responsables, échéance, statut ; tout se modifie sur la ligne. « Réunions » garde les séances et leurs décisions. « Confier une tâche » : quoi, à qui, pour quand.",
        savoir: [
          "Une tâche se confie à une personne, jamais à un texte libre. Le premier nom, en gras, répond de la tâche.",
          "On peut mettre quelqu'un « au courant » (sous « ⋯ ») : il voit la tâche sous « Pour information », sans en répondre.",
          "Une séance de réunion : type, date, heure et lieu en tête, présences en pastilles (un clic : présent, excusé, absent), puis les points numérotés et leurs décisions.",
          "Supprimer une réunion : direction seule, la corbeille en fin de barre. Les tâches décidées en séance sont conservées.",
          "« Nouvelle réunion » (rail) ouvre une séance ; « Rapport du mois » (direction) résume tâches et réunions du mois ; la « Feuille des tâches » sort par l'avion.",
        ],
        images: [
          { src: "/guide/accueil-suivi.png", legende: "« Échéances et tâches » : la frise des trente jours, les filtres, puis les tâches par personne — responsables, échéance et statut se modifient sur la ligne (données d'essai)." },
        ],
      },
      { pour: 'sec coo dir', titre: "Chiffres de l'école",
        ou: "Tableau de bord → Chiffres de l'école (si votre rôle y a accès) → rail.",
        texte: "Cinq lectures : « ETP » (la charge du personnel en équivalents temps plein, par section) · "
             + "« Comparaison » (la dotation d'une année face à une autre, unité par unité) · « Résultats » (réussis, "
             + "ajournés, refusés par unité, année d'études et section, d'après les décisions du Conseil) · "
             + "« Distributions » (la répartition des cotes) · « Population réelle » (les étudiants réellement "
             + "inscrits, comptés dans leur section de rattachement).",
        savoir: [
          "ETP = cours techniques / 800 + pratique professionnelle / 1000, autonomie comprise — la même formule partout dans Lucie.",
          "Un taux se calcule sur les dossiers décidés, jamais sur les inscrits : un dossier sans décision se compte à part.",
          "Ce sont les chiffres que demande la démarche qualité (AEQES) : inscrits par section, ETP, résultats.",
        ] },
    ],
  },
  {
    id: 'etudiants', pour: 'sec coo dir', titre: 'Étudiants — la liste et la fiche', icone: 'IconChecklist',
    resume: "Trouver un étudiant, lire sa fiche, agir sur plusieurs, importer, créer, réparer les dossiers.",
    points: [
      {
        titre: "Le rail de l'axe Étudiants",
        ou: "Étudiants → rail.",
        texte: "Dans l'ordre du travail : « Créer un étudiant » · « Contrôler les dossiers » · « Inscriptions & PAE », avec son tiroir (Composer le PAE · Revue des PAE · Reports de notes · Valorisation des acquis (VA) · Aménagements raisonnables (AR)) · « Délibération » · « Procédures » (recours et discipline) · et, en dernier, « Vider des résultats ou des inscriptions ». En tête : Importer, Imprimer ou envoyer, Proposer une amélioration.",
        savoir: [
          "Chacun ne voit que les outils que son rôle permet.",
        ],
        images: [
          { src: "/guide/etudiants-rail.png", legende: "Le rail de l'axe Étudiants, tiroir « Inscriptions & PAE » ouvert : le nom de chaque icône paraît au survol.", etroite: true },
        ],
      },
      {
        titre: "La liste des étudiants",
        ou: "Étudiants → Inscriptions & PAE.",
        texte: "Les étudiants par section. Au-dessus : « En cours · Diplômés · Sortis · Archivés · Tous » (le statut du parcours). Filtres : niveau, UE (avec ou sans), rattachement, primo, doublons, « Plus de 60 ECTS ». Un clic sur le nom ouvre la fiche.",
        savoir: [
          "Le crayon du PAE est vert quand le PAE de l'année est validé, gris sinon. Un clic ouvre la revue du PAE de l'étudiant.",
          "Le niveau s'écrit « Parcours B1 », « Parcours B2 » ou « Diplômant » : l'épreuve intégrée au PAE donne « Diplômant » ; sinon, le stage le plus avancé du PAE décide.",
        ],
        images: [
          { src: "/guide/etudiants-liste.png", legende: "La liste des étudiants (données d’essai) : recherche, section, niveau, [[Filtres]], puis les statuts du parcours ; la colonne PAE porte le crayon." },
          { src: "/guide/etudiants-filtres.png", legende: "Le panneau [[Filtres]] : inscription (primo), programme, section, dossier, doublons et plus de 60 ECTS." },
        ],
      },
      {
        titre: "Agir sur plusieurs étudiants",
        ou: "Liste des étudiants : cochez des lignes — une barre d'actions apparaît.",
        texte: "Avion « PAE des étudiants cochés » · [[Coordonnées]] (liste imprimable des courriels, GSM et adresses) · [[Composer les PAE|IconChecklist]] de la sélection · menu [[Statut]] : Marquer diplômé, Sortir du cursus (avec motif), Archiver, Réintégrer · [[Fusionner|IconUserPlus]] deux fiches (direction) · [[Supprimer|IconTrash|detruire]] (direction, secrétariat).",
        savoir: [
          "Supprimer montre d'abord tout ce qui serait emporté (résultats, notes, inscriptions), puis demande de confirmer dossier par dossier.",
          "Fusionner rassemble deux fiches d'une même personne en une seule : son parcours ne reste pas coupé en deux.",
          "« Ne garder que les affichés » réduit la sélection à ce que montrent les filtres.",
        ],
        images: [
          { src: "/guide/etudiants-selection.png", legende: "Deux étudiants cochés : la barre d’actions apparaît au-dessus de la liste." },
        ],
      },
      {
        titre: "La fiche d'un étudiant",
        ou: "Un clic sur un étudiant de la liste.",
        texte: "Onglets : Parcours · Identité · Valorisation · Finances · Stages · Aménagements · Congé-éducation · Suivi · Dossier. Au bout de la rangée : l'œil et l'avion. [[Parcourir]] passe à l'étudiant précédent ou suivant, ou change de cohorte (section, année, UE) sans fermer la fiche.",
        savoir: [
          "L'œil ouvre la revue du PAE sur cet étudiant : on y compose et on y valide le PAE. La fiche ne le compose plus ; l'onglet Parcours le résume en une ligne.",
          "L'avion ouvre Éditions sur cet étudiant : toutes ses pièces.",
          "[[Changer de section…]] (dans la rangée des onglets) : vers une section jamais suivie. L'ancienne devient un cursus archivé ; ses réussites restent. Les inscriptions de l'année se retirent ensuite par « Retirer ces inscriptions ».",
          "« Suivi » est confidentiel : seuls ses enseignants, sa coordination et la direction y entrent.",
        ],
        images: [
          { src: "/guide/etudiants-fiche.png", legende: "L’en-tête de la fiche : les onglets, puis [[Changer de section…]], l’œil, [[Parcourir]] et l’avion." },
        ],
      },
      {
        titre: "Parcours : le schéma et la grille",
        ou: "Fiche → Parcours.",
        texte: "Le schéma de capitalisation montre les unités de la section, acquises ou non, et leurs prérequis ; il se retourne sur la grille du parcours, une colonne par année. Chaque case s'encode : Inscrit, Réussi, VA, Ajourné, Refusé, Absent, avec la note.",
        savoir: [
          "« Effacer le résultat » garde l'inscription ; « Supprimer l'inscription » retire l'unité de l'année.",
          "Une ou plusieurs cases (Ctrl / ⌘-clic) se glissent vers une autre année : simulation d'abord, motif obligatoire.",
          "Ces gestes sont réservés à l'administration des études et à la direction.",
        ],
        images: [
          { src: "/guide/etudiants-schema.png", legende: "Fiche → Parcours : le schéma de capitalisation ; un clic sur une tuile le retourne sur la grille." },
          { src: "/guide/etudiants-grille.png", legende: "La grille du parcours : une colonne par année ; un clic sur une case l’encode. [[Retourner au schéma]] revient au schéma." },
        ],
      },
      {
        titre: "Finances, dossier et suivi",
        ou: "Fiche → Finances · Dossier · Suivi.",
        texte: "« Finances » : droit d'inscription (exonération avec motif, droit spécifique quand l'étudiant y est soumis), frais de scolarité calculés, [[Produire le document]], fiche d'inscription et reçu. « Dossier » : les pièces du dossier individuel (circulaire 9764), chacune Manquant · Reçu · N/A. « Suivi » : des notes datées sur l'accompagnement de l'étudiant (« Ajouter au dossier »).",
        savoir: [
          "Le suivi est confidentiel : ses enseignants, sa coordination et la direction seulement. Une note s'efface par son auteur ou par la direction.",
        ],
        images: [
          { src: "/guide/etudiants-finances.png", legende: "Fiche → Finances : le montant à payer, puis le droit d’inscription calculé UE par UE." },
          { src: "/guide/etudiants-dossier.png", legende: "Fiche → Dossier : chaque pièce du dossier individuel, Manquant · Reçu · N/A." },
          { src: "/guide/etudiants-suivi.png", legende: "Fiche → Suivi : une note de suivi ou un rapport, puis [[Enregistrer]]." },
        ],
      },
      {
        titre: "Les versements et le paiement par virement",
        pour: "sec dir",
        ou: "Fiche → Finances → Versements.",
        texte: "[[Encoder un versement]] : la date du jour, le montant (Lucie propose ce qui manque à l'acompte, ou le reste), la nature et le moyen. Chaque étudiant a sa communication structurée pour l'année ; la note de frais porte le compte de l'école et un QR code de paiement, que l'application bancaire lit d'un geste.",
        savoir: [
          "Un versement ne s'efface jamais : « annuler » demande un motif, la ligne reste lisible, barrée.",
          "Un remboursement s'encode en montant négatif.",
          "Sans compte de l'école dans Configuration → Identité, pas de QR code.",
        ],
        images: [
          { src: "/guide/etudiants-versements.png", legende: "Fiche → Finances : la communication structurée et le QR code de paiement, puis les versements ; [[Encoder un versement]] ouvre la ligne de saisie, qu’on valide par [[Enregistrer|fort]]." },
        ],
      },
      {
        titre: "Les extraits de compte",
        pour: "sec dir",
        ou: "Étudiants → rail → Extraits de compte.",
        texte: "Déposez l'extrait téléchargé de la banque en ligne (CODA, XML ou CSV). Lucie montre chaque virement : reconnu (bonne communication), à vérifier, ou non rattaché. Cochez, puis « Enregistrer les versements cochés ».",
        savoir: [
          "Rien ne s'enregistre avant votre confirmation, et un même virement ne s'importe jamais deux fois.",
          "Un virement non rattaché s'encode à la main dans la fiche, après avoir retrouvé qui l'a fait.",
        ],
        images: [
          { src: "/guide/etudiants-extraits.png", legende: "La fenêtre Extraits de compte : [[Choisir l’extrait|IconUpload|fort]] pour déposer le fichier téléchargé de la banque." },
        ],
      },
      {
        titre: "Le suivi des présences",
        pour: "sec coo dir",
        ou: "Étudiants → rail → Suivi des présences.",
        texte: "Les absences au-delà du seuil (10 % d'absences injustifiées, 40 % de toutes les absences), unité par unité ; la grille d'une unité, case par case (P, P* en retard, A, J) ; la régularité au premier et au cinquième dixième (R ou IR, qui s'inverse d'un clic) ; le registre du congé-éducation.",
        savoir: [
          "[[Prévenir l’étudiant|IconMail]] montre l'avis avant de l'envoyer à son adresse d'école ; rien ne part tout seul.",
          "La coordination lit les étudiants de ses sections ; envoyer et régler restent au secrétariat et à la direction.",
        ],
        images: [
          { src: "/guide/etudiants-presences-ue.png", legende: "Suivi des présences → Par UE (données d’essai) : une ligne par étudiant, une colonne par séance, et la régularité (R ou IR) au 1er et au 5e dixième." },
          { src: "/guide/etudiants-presences-seuil.png", legende: "Absences au-delà du seuil : les deux taux par unité ; [[Prévenir l’étudiant|IconMail]] montre l’avis avant l’envoi." },
        ],
      },
      {
        titre: "Stages et conventions de stage",
        ou: "Fiche → Stages.",
        texte: "Un stage par unité de stage, avec son statut : Prévu, Autorisé, En cours, Terminé, Rompu, Annulé. Le lieu se choisit dans le répertoire de la section, ou se crée. Les jalons de l'article 51 — autorisation écrite, convention signée — se cochent avec leur date.",
        savoir: [
          "La convention reçue du lieu se dépose en PDF ; elle part à la signature du directeur (Tableau de bord → « À signer »), qui y appose le fac-similé.",
          "Le répertoire des lieux de stage d'une section s'importe d'un classeur (Importer → « Répertoire de lieux de stage »).",
        ],
        images: [
          { src: "/guide/etudiants-stages.png", legende: "Fiche → Stages : [[Ajouter un stage|IconPlus|fort]] ; la ligne s’ouvre sur le lieu, l’unité, les dates, les heures et le statut." },
        ],
      },
      {
        titre: "Identité : adresse et nationalité",
        ou: "Fiche → Identité.",
        texte: "L'adresse commence par le code postal : il pose la localité, puis Lucie propose les rues pendant la frappe. La nationalité se choisit dans la liste des pays.",
        savoir: [
          "Une adresse à l'étranger reste libre.",
          "Une nationalité saisie avant la liste reste affichée, marquée « saisie à remplacer ».",
          "La carte d'identité belge lue donne « Belgique ».",
        ],
        images: [
          { src: "/guide/etudiants-identite.png", legende: "Fiche → Identité : le code postal 1070 a posé la localité ; [[Enregistrer|IconDeviceFloppy|fort]] compte les champs modifiés." },
        ],
      },
      {
        titre: "Créer un étudiant",
        ou: "Étudiants → rail → Créer un étudiant.",
        texte: "Pour une inscription tardive ou hors eCampus. [[Lire la carte d'identité]] remplit la fiche depuis la carte eID, avec le lecteur de carte.",
        savoir: [
          "Avant d'écrire, Lucie cherche un dossier existant (registre national, puis nom, prénom et date de naissance). S'il en trouve, il les propose : ouvrez-les plutôt que de créer un doublon.",
        ],
        images: [
          { src: "/guide/etudiants-creer.png", legende: "La fenêtre Nouvel étudiant : [[Lire la carte d'identité]], ou nom, prénom, section (obligatoire) et première UE, puis [[Créer et aller à la fiche|fort]].", etroite: true },
        ],
      },
      {
        titre: "Contrôler les dossiers",
        ou: "Étudiants → rail → Contrôler les dossiers.",
        texte: "Cinq contrôles : Dossiers dédoublés · Programmes sur deux sections · Au-delà du bloc atteint · Décisions sans inscription · Nationalités.",
        savoir: [
          "Rien ne s'écrit sans simulation : Lucie montre d'abord ce qu'elle ferait.",
          "Nationalités : Lucie propose le pays pour chaque saisie ancienne ; ce qu'elle ne reconnaît pas reste nommé.",
        ],
        images: [
          { src: "/guide/etudiants-controle.png", legende: "La fenêtre Contrôler les dossiers : un onglet par contrôle ; ici, les dossiers dédoublés et [[Relire|IconRefresh]]." },
        ],
      },
      {
        titre: "Importer",
        ou: "Étudiants → rail → Importer.",
        texte: "Le centre des imports, chacun avec ce qu'il attend : « Créer des étudiants sur base d'une base de données externe » (export eCampus) · « Créer les étudiants d'orthoptie (HELB) » · « Placer les étudiants dans leur section » (rapport Pack UF) · « Liste eCampus » · « Classeur PAE » · « Classeur de suivi » (notes et décisions d'une année) · « Reconstruire l'historique » (plusieurs années d'un coup) · « Reprendre une année depuis un tableau plat » · « Répertoire de lieux de stage » · « Compléter les dossiers » · « Comparer un classeur » (sans rien écrire) · « Importateur sur mesure ». « Export de la section » sort la liste en Excel.",
        savoir: [
          "Tout import montre d'abord ce qu'il ferait (simulation) ; rien ne s'écrit avant la confirmation.",
          "Un dossier existant est complété, jamais dédoublé : le rapprochement se fait par numéro national ou matricule.",
          "Classeur de suivi et tableau plat : direction. Lieux de stage : aussi secrétariat et coordinations. Le reste : administration des études et direction.",
        ],
        images: [
          { src: "/guide/etudiants-importer.png", legende: "Le centre des imports : chaque carte dit ce qu’elle fait et le fichier qu’elle attend ; les opérations destructrices sont rangées à part." },
        ],
      },
      {
        titre: "Vider des résultats ou des inscriptions",
        ou: "Étudiants → rail → la corbeille brique, en dernier.",
        texte: "Choisissez le périmètre (année, section, unité ou cours) et les étudiants ; Lucie compte ce qui sera touché — résultats, notes, reports, inscriptions — avant toute suppression, puis demande de confirmer.",
        savoir: [
          "Réservé à l'administration des études et à la direction. À n'employer que pour réparer un import erroné.",
        ],
        images: [
          { src: "/guide/etudiants-vider.png", legende: "La fenêtre Vider : année, section, étendue, étudiants, ce qui est supprimé ; [[Calculer le périmètre]] avant [[Supprimer|detruire]]." },
        ],
      },
    ],
  },
  {
    id: 'pae', pour: 'sec coo dir', titre: 'Le PAE', icone: 'IconStairsUp',
    resume: "Composer, revoir et valider le programme annuel ; les reports de notes.",
    points: [
      {
        titre: "Revue des PAE — parcourir et valider",
        ou: "Étudiants → Inscriptions & PAE → Revue des PAE (ou l'œil de la fiche, ou le crayon de la liste).",
        texte: "Les étudiants cochés, sinon la liste filtrée, l'un après l'autre. À gauche, le PAE de l'année cours par cours ; à droite, le parcours. [[Valider · étudiant suivant ▶]] enregistre et passe au suivant ; [[◀ Précédent]] et [[Passer ▶]] ne valident rien.",
        savoir: [
          "Valider confirme aussi le programme : un seul geste. Le bandeau dit « Ce PAE a été validé le … par … ». « retirer la validation » l'efface.",
          "Un programme modifié perd sa validation : il faut revalider.",
          "Ajouter une UE : « Ajouter une UE au PAE », ou un clic sur une tuile du parcours. Retirer : « retirer » sur la ligne de l'UE. Ce qui enfreint une règle demande un motif.",
          "Plus de 60 ECTS : la tuile « ECTS en cours » passe en orange. Valider demande de confirmer en connaissance de cause ; le nombre d'ECTS confirmé reste écrit dans le bandeau.",
          "Filtres de la revue : année, section, bloc, « Avec reports », « À vérifier », « Pas encore validés ».",
          "L'avion de la revue ouvre Éditions avec la pièce « Programme annuel (PAE) » et les étudiants de la revue cochés.",
        ],
        images: [
          { src: "/guide/pae-revue.png", legende: "La revue des PAE (données d’essai) : filtres en tête, le PAE à gauche cours par cours, le parcours à droite, et [[Valider · étudiant suivant ▶]]." },
        ],
      },
      {
        titre: "Lire le parcours",
        ou: "Revue des PAE, colonne de droite.",
        texte: "Une tuile par UE, rangée par bloc. Les couleurs suivent Configuration → Thèmes et couleurs.",
        savoir: [
          "Tuile pleine verte : acquise. Violette : acquise par faveur. Bleue pleine : au PAE de l'année.",
          "Tuile blanche : accessible. Grise : pas encore accessible.",
          "Point rouge en haut à gauche : UE déjà refusée une fois. Point marine en haut à droite : UE déterminante. Petit point en bas : report ou VA.",
          "Flèches : prérequis. Pleines et bleues quand elles touchent le PAE, grises sinon ; en pointillé, une règle interne de l'Institut, qui avertit sans interdire.",
        ],
        images: [
          { src: "/guide/pae-parcours.png", legende: "La colonne de droite de la revue : les tuiles du parcours et leur légende ; ici l’UE 333, bleue, au PAE de l’année." },
        ],
      },
      {
        titre: "Reports et dispenses sur la ligne du cours",
        ou: "Revue des PAE, ligne de chaque cours.",
        texte: "Un cours dont tous les acquis sont maîtrisés se reporte : « Reporter » avec la note et l'année d'origine. Pour 2024-2025 et 2025-2026, une VA accordée sans dossier se pose aussi ici : « VAP / dispense » sur un cours, « VA / VAE » sur l'UE entière — les cours valent alors 10/20.",
        savoir: [
          "Encoder un report est réservé à la direction, à la coordination et à l'administration des études.",
          "Un report « retiré » est refusé : Lucie ne le reposera pas d'office.",
          "À partir de 2026-2027, une VA sans dossier est refusée : elle passe par la Valorisation des acquis.",
        ],
        images: [
          { src: "/guide/pae-reports-ligne.png", legende: "Une UE dépliée dans la revue : sur chaque cours, « encoder un report » et « VAP / dispense » ; « VA / VAE » sur la ligne de l’UE." },
        ],
      },
      {
        titre: "Composer les PAE",
        ou: "Étudiants → Inscriptions & PAE → Composer le PAE (l'escalier).",
        texte: "Une ligne par étudiant, une colonne par UE de la section. Trois modes : « Composer », « Encoder l'historique » (résultats d'une année passée), « Valider en groupe ». [[Passage à l’année suivante…]] propose le programme d'après les résultats.",
        savoir: [
          "Rien n'est écrit avant « Vérifier … changement(s) » puis « Enregistrer ».",
          "« Valider en groupe » écrit la même validation que l'œil, à votre nom. Au-delà de 60 ECTS, le lot nomme les programmes concernés avant d'écrire.",
          "Un bloc s'ouvre quand une part du bloc précédent est ACQUISE (50 % de ses ECTS par défaut). Avoir suivi un bloc sans le réussir n'ouvre pas le suivant.",
          "L'épreuve intégrée n'est proposée qu'une fois tout le reste acquis.",
        ],
        images: [
          { src: "/guide/pae-composer.png", legende: "La fenêtre Composer les PAE : une ligne par étudiant, une colonne par UE, les trois modes en haut à droite et [[Passage à l’année suivante…]] au pied." },
        ],
      },
      { titre: "Reports de notes (d'office)",
        ou: "Étudiants → Inscriptions & PAE → Reports de notes.",
        texte: "Une UE refusée : chaque cours dont tous les acquis sont maîtrisés est dispensé l'année suivante, "
             + "avec ses notes. Lucie le fait seule à chaque PAE enregistré. Cet outil rattrape les PAE composés "
             + "avant : face « À poser », puis « Poser … report(s) » ; face « Déjà posés » pour relire.",
        savoir: [
          "Tant que le report est accordé, ses notes sont protégées : un import ou un encodage ne les remplace pas.",
        ] },
    ],
  },
  {
    id: 'valorisation', pour: 'sec coo dir', titre: 'Valorisation des acquis (VA / VAE)', icone: 'IconCertificate',
    resume: "Un circuit : demande, recevabilité, avis, séance du conseil, validation.",
    points: [
      {
        titre: "Le circuit",
        ou: "Étudiants → Inscriptions & PAE → Valorisation des acquis (VA).",
        texte: "Trois portes, dans l'ordre : « 1 · Introduire des demandes », « 2 · Instruire en série », « 3 · Séance du conseil ». Chaque demande suit cinq étapes : dates de la demande · recevabilité · avis du chargé de cours · décision du Conseil · validation direction.",
        savoir: [
          "Aucune pièce signée ne sort tant que le circuit n'est pas parcouru. Chaque étape porte le nom de qui l'a faite.",
          "Instruire : coordination, secrétariat, direction. Valider : direction et direction adjointe seulement. Dévalider : direction, avec un motif écrit.",
          "Un dossier validé est gelé : recevabilité, avis et décision ne se modifient plus.",
          "Toute demande s'encode, recevable ou non. Le délai se calcule ; la date d'envoi prime sur celle du formulaire.",
          "L'épreuve intégrée ne se valorise jamais.",
        ],
        images: [
          { src: "/guide/valorisation-circuit.png", legende: "L’écran Valorisation des acquis (données d’essai) : les trois portes, puis le tableau de ce qui reste à faire, étape par étape." },
        ],
      },
      {
        titre: "1 · Introduire des demandes",
        ou: "Valorisation des acquis → 1 · Introduire des demandes.",
        texte: "La matrice : un étudiant par ligne, une UE par colonne, VA ou VAE. On y ajoute aussi des étudiants. Depuis la fiche (onglet Valorisation), [[Introduire une demande|IconPlus]] ouvre un dossier vide pour un étudiant.",
        savoir: [
          "Sur la ligne d'un étudiant du registre : « Ajouter une ou plusieurs unités à valoriser », ou « Retirer cet étudiant du registre pour cette année ».",
          "Trois natures de demande : dispense complète, dispense partielle, et admission (capacités préalables, sans unité).",
          "Les étudiants peuvent aussi demander en ligne, sur la page publique /demande-va de Lucie : matricule, lien envoyé à l'adresse du dossier (valable 30 minutes), unités demandées, pièces. Ils reçoivent un accusé de réception. Ils peuvent compléter tant que la recevabilité n'est pas posée.",
        ],
        images: [
          { src: "/guide/valorisation-registre.png", legende: "Le registre : une ligne par étudiant, une frise par unité ; [[Unités|IconPlus]] ajoute des unités à valoriser, [[Délibérer]] ouvre la séance sur lui." },
          { src: "/guide/valorisation-introduire.png", legende: "Fiche → Valorisation → [[Introduire une demande|IconPlus]] : section, unité, porte AD · VA · VAE, puis [[Introduire]]." },
        ],
      },
      {
        titre: "2 · Instruire en série",
        ou: "Valorisation des acquis → 2 · Instruire en série.",
        texte: "Dates, recevabilité, avis : en lot, sur les demandes cochées. Une frise numérotée dit l'étape où en est la liasse.",
        savoir: [
          "Une irrecevabilité (hors délai, dossier incomplet, pièces non officielles) se motive, même en série.",
          "Les chargés de cours rendent leur avis dans Mes cours → Avis de valorisation : favorable, partiel ou défavorable, toujours motivé. Le plus prudent l'emporte.",
          "Le chargé de cours qui rend l'avis est NOMMÉ ; Lucie propose ceux attribués aux cours visés.",
        ],
        images: [
          { src: "/guide/valorisation-instruire.png", legende: "La fenêtre Instruire en série : la frise des étapes en tête, les demandes à cocher, et le geste au pied — ici [[Déclarer recevable|fort]]." },
        ],
      },
      {
        titre: "3 · Séance du conseil",
        ou: "Valorisation des acquis → 3 · Séance du conseil (ou « Délibérer cet étudiant » sur la fiche).",
        texte: "Lecture « Par étudiant » ou « Par UE ». Une décision par UE : Totale, Partielle (des cours, des acquis) ou Refusée, préremplie depuis l'avis. « Arrêter … décision(s) · suivant » enregistre. Par UE, « la même décision pour les autres étudiants de l'UE » recopie une décision.",
        savoir: [
          "Une séance, c'est une section et une date : un lot ne mélange pas deux séances.",
          "La base légale (VAF V1-V4 ou VANFI) est obligatoire dès qu'on accorde : elle part dans eProm.",
          "Un refus se motive. Motifs et remarques types : Configuration → Procédures et délais.",
          "Un stage dispensé en partie s'écrit en heures dans la remarque du Conseil.",
          "La validation de la direction est un geste à part : « Valider … dossier(s) ».",
        ],
        images: [
          { src: "/guide/valorisation-seance.png", legende: "La séance du conseil, lecture « Par étudiant » : l’avis à gauche, la décision Totale · Partielle · Refusée, avec sa base, et ce qui manque à droite." },
        ],
      },
      {
        titre: "Les pièces de valorisation",
        ou: "Éditions → Étudiants → Valorisation des acquis.",
        texte: "Le procès-verbal (annexe 4) et les attestations, par unité.",
        savoir: [
          "Le PV ne sort pas tant qu'il manque une mention. La date du PV vient des décisions encodées, pas du jour où l'on imprime.",
          "Une dispense partielle se lit « Réussite partielle — dispense », avec un renvoi vers une remarque : ce n'est pas une réussite d'unité.",
        ],
        images: [
          { src: "/guide/valorisation-editions.png", legende: "Éditions → Étudiants → Valorisation des acquis : une ligne par unité qui porte des demandes, avec [[PV et attestations]]." },
          { src: "/guide/valorisation-pv.png", legende: "La fenêtre du PV d’une unité : séance, présidence, présences ; la liste « À encoder avant impression » dit ce qui manque avant [[Produire le PV et les attestations|IconPrinter|sortir]].", etroite: true },
        ],
      },
    ],
  },
  {
    id: 'amenagements', pour: 'sec coo dir', titre: 'Aménagements raisonnables', icone: 'IconAccessible',
    resume: "Demande, rapport, avis des chargés de cours, décision du Conseil.",
    points: [
      {
        titre: "Le registre",
        ou: "Étudiants → Inscriptions & PAE → Aménagements raisonnables (AR).",
        texte: "Les dossiers de l'année, filtrables par section et par état. [[Créer un aménagement|fort]] : choisissez l'étudiant ; son dossier de l'année s'ouvre, ou se crée. Chaque ligne ouvre la fiche sur l'onglet Aménagements.",
        savoir: [
          "Supprimer un dossier : sans décision, par qui instruit ; décidé, notifié ou communiqué, par la direction seule, avec un motif.",
        ],
        images: [
          { src: "/guide/amenagements-registre.png", legende: "Le registre des aménagements raisonnables (données d’essai) : tuiles en tête, filtres, une ligne par dossier ; [[Créer un aménagement|fort]] à droite." },
          { src: "/guide/amenagements-creer.png", legende: "La fenêtre Créer un aménagement raisonnable : on tape un nom ou un matricule, puis on choisit l’étudiant.", etroite: true },
        ],
      },
      {
        titre: "Le circuit, une étape à la fois",
        ou: "Fiche → Aménagements.",
        texte: "1 Demande (cadre A) · 2 Rapport (cadre B, personne de référence) · 3 Avis des chargés de cours · 4 Décision du Conseil des études. Les étapes suivantes restent sous cadenas tant que la précédente n'est pas validée (« ✓ Valider … »).",
        savoir: [
          "Cadre A : les aménagements se cochent dans la liste courte, rangée par moment, avec une précision ; « Autre » se décrit. Au moins un aménagement est demandé.",
          "« Soins spécifiques » est confidentiel et n'est jamais transmis. Une mesure se coche dans la liste ou s'écrit dans « Autre ».",
          "Le rapport (cadre B) se valide par la personne de référence ou la direction.",
          "Les chargés de cours des unités concernées rendent leur avis mesure par mesure dans Mes cours : réalisable, avec adaptation, pas réalisable (motivé).",
          "Le Conseil accorde ou refuse mesure par mesure. Un refus se motive. La motivation de la décision est obligatoire.",
        ],
        images: [
          { src: "/guide/amenagements-demande.png", legende: "Fiche → Aménagements : les quatre étapes en tête (ici demande et rapport validés) ; le cadre A, ses aménagements rangés par moment." },
          { src: "/guide/amenagements-avis.png", legende: "Étape 3 · Avis : mesure par mesure, l’avis de chaque chargé de cours, rendu dans Mes cours." },
          { src: "/guide/amenagements-decision.png", legende: "Étape 4 · Décision : chaque mesure Accordée ou Refusée (un refus se motive), les dates et la motivation obligatoire." },
        ],
      },
      {
        titre: "Pièces et communication",
        ou: "Fiche → Aménagements, puis l'avion.",
        texte: "Quatre pièces : formulaire (cadres A et B), décision motivée, notification, fiche « mesures ». [[Communiquer aux chargés de cours|IconUsers|fort]] envoie à chacun les seules mesures accordées.",
        savoir: [
          "Décision et notification ne sortent pas tant que manquent statut, date, motivation ou une mesure accordée : Lucie dit ce qui manque.",
          "Secret professionnel : les chargés de cours ne voient QUE les mesures accordées, jamais la pièce ni la motivation.",
          "Le recours a sa date, la date de décision de la Commission et son issue.",
          "Le catalogue des mesures se règle dans Configuration → Procédures et délais.",
        ],
        images: [
          { src: "/guide/amenagements-pieces.png", legende: "Le bloc « Pièces du dossier », sous la décision : [[Demande (A et B)|IconSend|sortir]], [[Décision|IconSend|sortir]], [[Notification|IconSend|sortir]], [[Fiche « mesures »|IconSend|sortir]], et [[Communiquer aux chargés de cours|IconUsers|fort]], grisé tant qu’aucune mesure n’est accordée." },
        ],
      },
    ],
  },
  {
    id: 'deliberation', pour: 'sec coo dir', titre: 'Délibération', icone: 'IconScale',
    resume: "La feuille d'une unité, la décision du Conseil, la clôture, les contrôles.",
    points: [
      {
        titre: "Délibérer une unité",
        ou: "Étudiants → Délibération : une section, puis l'unité.",
        texte: "La feuille montre l'étudiant, ses acquis par cours, la note d'unité et le choix du Conseil : Réussi, Ajourné, Refusé, et « Faveur ». Précédent / suivant pour passer d'un étudiant à l'autre. Le sélecteur en haut à droite change de vue : « Fiche » (un étudiant), « Tableau » (tous les étudiants d'un coup d'œil : une note juste à l'encre, un acquis en défaut en pastille fraise, la faveur en violet), « En lot » (ajourner plusieurs étudiants avec une justification commune), « Clôture ».",
        savoir: [
          "Pas de compensation entre acquis : un seul acquis en défaut, c'est « ajourné » en 1re session, « refusé » en 2e.",
          "En 2e session, « ajourné » n'existe pas.",
          "La faveur porte l'unité au seuil ; sur les documents de l'étudiant, tout vaut alors 10.",
          "Jamais de cote sous 10 sur un document remis à l'étudiant : c'est « NA ».",
          "Le justificatif d'échec écrit par le chargé de cours dans Mes cours EST la motivation. Le Conseil peut la réécrire.",
          "Une unité NON PARAMÉTRÉE (acquis non rattachés aux cours) s'annonce en orange : on ne peut alors ni ajourner ni refuser, faute de pouvoir motiver acquis par acquis. On rattache d'abord les acquis aux cours.",
        ],
        images: [
          { src: "/guide/deliberation-unites.png", legende: "La liste des unités d'une section (données d'essai) : [[Délibérer S1]] ouvre la feuille de l'unité, l'avion produit ses pièces." },
          { src: "/guide/deliberation-fiche.png", legende: "La vue « Fiche » : les acquis par cours, la note d'unité en haut à droite, la motivation proposée pour l'acquis en échec, et en bas le choix du Conseil — [[Faveur|IconGift]] [[Réussi]] [[Ajourné]] [[Refusé]] [[Absent]]." },
          { src: "/guide/deliberation-tableau.png", legende: "La vue « Tableau » : tous les étudiants d'un coup d'œil, l'acquis en défaut en pastille, la note d'unité à droite ; un clic sur un nom ouvre sa fiche." },
        ],
      },
      {
        titre: "Clore la délibération",
        ou: "Feuille de l'unité → Clôture.",
        texte: "Appel des présences, séance du Conseil et date de publication des résultats, visite des copies, dates de seconde session, documents, puis « Clore la délibération ».",
        savoir: [
          "La date de publication des résultats (aujourd'hui par défaut) fait courir les quatre jours de recours : corrigez-la si les résultats ont été affichés un autre jour.",
          "Quorum des deux tiers des voix délibératives, contrôlé à la clôture.",
          "Les motivations proposées par Lucie et restées telles quelles se confirment une seule fois, à la clôture.",
          "Rouvrir une séance close : direction seule, motif écrit obligatoire.",
          "Un ajourné dont un acquis en échec n'est pas ajourné bloque la clôture : la liste s'affiche, et « Ajourner aussi leurs acquis en échec » règle tout le monde d'un coup.",
          "La clôture ouvre la seconde session dès qu'il y a des ajournés ; une séance « Toute l'unité » close vaut pour toute l'unité.",
        ],
        images: [
          { src: "/guide/deliberation-cloture.png", legende: "La vue « Clôture » d'une séance déjà close : date de la séance, date de publication des résultats, visite des copies, puis [[Générer les documents]]." },
        ],
      },
      {
        titre: "Contrôles des notes et des décisions",
        ou: "Délibération → rail → Contrôles des notes et des décisions (direction et secrétariat).",
        texte: "Trois faces. « Notes en double » : une note d'épreuve existe sous deux formes avec deux valeurs ; la direction choisit la bonne, avec un motif, et Lucie aligne. « Contrôle des notes de décision » : la note enregistrée avec la décision face à celle que Lucie calcule ; correction motivée. « Clôturer une année reprise » : clôture des années importées d'Excel.",
        savoir: [
          "Après « Notes en double », la cote se corrige dans « Contrôle des notes de décision ».",
          "Chaque correction entre dans un journal qui ne s'efface pas.",
          "Une année reprise reçoit un énoncé uniforme : elle ne se fait pas passer pour une délibération tenue.",
        ],
        images: [
          { src: "/guide/deliberation-controles.png", legende: "La fenêtre « Contrôles de la délibération » et ses trois onglets : Notes en double, Contrôle des notes de décision, Clôturer une année reprise." },
        ],
      },
      {
        titre: "Les outils de la délibération",
        ou: "Le rail, sous Délibération.",
        texte: "« Encodage rapide » pour saisir vite. « Contrôles des notes et des décisions ». « Où sont les notes ? » quand des notes semblent rangées dans la mauvaise année. « Règles de délibération ».",
        savoir: [
          "Le classeur de suivi et la reprise d'une année depuis un tableau plat sont dans « Importer » (rail de l'axe Étudiants).",
          "L'impression des pièces se fait toujours par l'avion.",
        ],
        images: [
          { src: "/guide/deliberation-regles.png", legende: "La fenêtre « Règles de délibération de l'établissement » : on fait glisser les niveaux (unité, cours, acquis) sur lesquels le Conseil délibère, pour la première puis la seconde session, puis [[Enregistrer|fort]]." },
        ],
      },
    ],
  },
  {
    id: 'procedures', pour: 'sec dir', titre: 'Recours et discipline', icone: 'IconShieldExclamation',
    resume: "Recours contre un refus, ou procédure disciplinaire (dont la fraude), selon le RDE 2026-2027.",
    points: [
      {
        titre: "Le registre",
        ou: "Étudiants → Procédures.",
        texte: "Tous les dossiers de l'année, de deux types : RECOURS, ou DISCIPLINAIRE — la fraude est une procédure disciplinaire, marquée « fraude ». Pour chacun, l'étudiant, la section et l'unité, l'étape en cours et la prochaine échéance légale, en couleur : fraise si elle est dépassée ou à trois jours, orange dans la semaine. Les dossiers d'avant le 3 octobre 2026 restent lisibles sous « Anciens dossiers ».",
        savoir: [
          "Ouvrir un dossier : direction et secrétariat. Décider (recevabilité, décision, sanction) : la direction.",
        ],
        images: [
          { src: "/guide/procedures-registre.png", legende: "Le registre (données d'essai) : type, étudiant, unité, objet, étape en cours et échéance ; [[Ouvrir un dossier|IconPlus|fort]] en haut à droite." },
        ],
      },
      {
        titre: "Ouvrir un dossier",
        ou: "Procédures → « Ouvrir un dossier ».",
        texte: "On choisit l'étudiant, puis le type — Recours ou Disciplinaire, et pour ce dernier la nature : comportement ou fraude —, puis l'unité parmi SES unités de l'année, avec leur décision. Lucie remplit le reste : section, session, chargés de cours, président de la séance.",
        savoir: [
          "Un recours ne vise qu'un REFUS (RDE art. 87). Un ajournement ou une décision de valorisation se motive, mais ne se conteste pas : ces unités sont grisées.",
          "Une fraude porte sur l'épreuve d'une unité : on coche les acquis qu'elle visait (art. 75 §1).",
        ],
        images: [
          { src: "/guide/procedures-ouvrir.png", legende: "La fenêtre « Ouvrir un dossier » : l'étudiant, le type (ici Disciplinaire, nature Fraude), l'objet, l'unité de l'épreuve et les acquis visés, puis [[Ouvrir le dossier|fort]]." },
        ],
      },
      { titre: "Le recours (art. 87 à 91)",
        ou: "Le dossier : une frise d'étapes.",
        texte: "Plainte reçue → recevabilité → CDE restreint → décision motivée → envoi recommandé → recours "
             + "externe éventuel. Chaque étape porte la date et le nom de celui qui l'a posée. À droite : les "
             + "échéances calculées, les personnes, les pièces, le journal.",
        savoir: [
          "Plainte au plus tard 4 jours calendrier après la publication des résultats ; décision envoyée dans les 7 jours calendrier hors congés scolaires.",
          "Irrecevable : le motif précis est obligatoire (art. 88 §4).",
          "Le CDE restreint compte un président et au moins deux membres présents (art. 89 §1) : Lucie le vérifie.",
          "Un recours ACCUEILLI rouvre la délibération de l'unité : le Conseil re-délibère l'étudiant, et la réouverture garde la trace du dossier.",
        ] },
      {
        titre: "La discipline et la fraude (art. 72 à 75, 115 à 119)",
        ou: "Le dossier : une frise d'étapes.",
        texte: "Faits établis → convocation → audition et procès-verbal → avis du CDE (fraude ou renvoi définitif) → décision motivée → notification → recours au Pouvoir organisateur en cas de renvoi définitif. L'écartement provisoire (15 jours ouvrables au plus) se pose à part.",
        savoir: [
          "Une fraude sanctionnée AJOURNE les acquis visés dans la délibération (1re session), ou mène au refus (2e session ou récidive). La récidive se lit dans les dossiers antérieurs.",
          "Pour un renvoi définitif, la convocation part au moins huit jours ouvrables avant l'audition : Lucie refuse une date trop proche.",
          "Le procès-verbal d'audition se rédige avec un membre du personnel ; un refus de signer se constate par deux membres.",
        ],
        images: [
          { src: "/guide/procedures-dossier.png", legende: "Un dossier disciplinaire : la frise des six étapes (la première posée, avec date et nom), le formulaire de l'étape suivante et [[Poser l’étape|fort]] ; à droite, échéances, personnes et acquis visés." },
        ],
      },
      {
        titre: "Les pièces",
        ou: "Le dossier → Pièces → « Produire ».",
        texte: "Accusé de réception, décision d'irrecevabilité, décision motivée du CDE restreint ; convocation, procès-verbal d'audition, décision disciplinaire. Elles sortent dans la mise en page commune, avec les voies de recours qui conviennent. On dépose aussi la plainte reçue, le PV de surveillance, les preuves.",
        savoir: [
          "Une pièce ne sort pas tant que l'étape qu'elle relate n'est pas posée.",
        ],
        images: [
          { src: "/guide/procedures-pieces.png", legende: "Le bloc « Pièces » du dossier : chaque pièce dit après quelle étape elle peut sortir ; on choisit la nature d'un document reçu puis [[Déposer|IconUpload]].", etroite: true },
        ],
      },
      {
        titre: "Supprimer un dossier ouvert par erreur",
        ou: "Le dossier → « Supprimer le dossier » (bouton brique, en haut à droite).",
        texte: "Mauvais étudiant, mauvaise unité, doublon : le dossier se supprime. Lucie demande pourquoi ; le dossier sort du registre, mais la trace de sa suppression — qui, quand, pourquoi — reste en base.",
        savoir: [
          "Un dossier où une décision a été posée ne se supprime que par la direction, qui confirme savoir que ses effets (séance rouverte, acquis ajournés, pièce notifiée) ne sont PAS défaits.",
          "Les anciens dossiers (avant le 3 octobre 2026) se suppriment aussi, par la direction seule.",
        ],
        images: [
          { src: "/guide/procedures-supprimer.png", legende: "Après [[Supprimer le dossier|IconTrash|detruire]], Lucie demande pourquoi : [[Valider]] reste gris tant que le motif est vide.", etroite: true },
        ],
      },
    ],
  },
  {
    id: 'diplomes', pour: 'sec dir', titre: 'Diplômes et titres', icone: 'IconAward',
    resume: "Diplôme, attestation provisoire, attestation de section, PV de section.",
    points: [
      {
        titre: "Produire les pièces de diplomation",
        ou: "L'avion (Éditions) → famille « Diplômes et titres ».",
        texte: "Diplôme, attestation provisoire, attestation de réussite de section, liste des diplômés, PV de section.",
        savoir: [
          "L'année portée par ces pièces est celle de la réussite de l'épreuve intégrée (à défaut, de la dernière unité acquise), pas l'année choisie à l'écran.",
          "Mention : unités déterminantes pour 2/3, épreuve intégrée pour 1/3. La note finale s'arrondit à l'unité : 69,7 devient 70, Distinction.",
          "Ce qui manque à une pièce est nommé : complétez avant de produire.",
        ],
        images: [
          { src: "/guide/diplomes-pieces.png", legende: "Éditions → Diplômes et titres : la section, la date de délibération, puis les pièces à cocher — diplôme, attestation provisoire, attestation de section, supplément, liste des diplômés, PV de section." },
        ],
      },
    ],
  },
  {
    id: 'editions', pour: 'sec coo dir', titre: 'Éditions — imprimer ou envoyer', icone: 'IconSend',
    resume: "Un seul centre pour toutes les pièces, d'où qu'on l'ouvre.",
    points: [
      {
        titre: "Le centre",
        ou: "L'avion, ou « Imprimer ou envoyer » en tête du rail.",
        texte: "Une fenêtre « Éditions » à quatre onglets : Étudiants · Personnel · Organisation · Gestion. Ouvert depuis un écran, il met en tête « De cet écran » : les pièces propres à cet écran.",
        savoir: [
          "Une pièce produite s'ouvre dans un onglet ; « Ouvrir » et « Enregistrer » restent en tête.",
          "La signature du directeur est toujours sous fac-similé protégé.",
          "Toute pièce porte en pied « Produit par … le … à … ».",
        ],
        images: [
          { src: "/guide/editions-centre.png", legende: "La fenêtre « Éditions » : les onglets Étudiants, Personnel, Organisation, Gestion (et Envois), puis les familles de pièces de l'onglet." },
        ],
      },
      {
        titre: "Étudiants : « Pour qui ? »",
        ou: "Éditions → Étudiants → Documents.",
        texte: "La première question est « Pour qui ? ». « Une personne » : cherchez-la par son nom ou son matricule dans toute l'école, puis « ouvrir ses pièces » — de l'année, ou de tout son parcours. « Des étudiants » : une section, ses unités, des cases à cocher — leurs attestations de réussite, bulletin, PAE, fiche, frais, annexes, pièces CEP, de l'année ou de tout le parcours (une inspection : tout sortir vite). « Une séance » : l'année, la session, l'unité — « Pour le Conseil » (PV, composition, grille, ajournés par cours) et « Pour ses étudiants » (attestations, motivations d'ajournement et de refus). Les autres onglets : « Valorisation des acquis » (par unité), « Diplômes et titres », « Listes et rapports », « Divers » (les lettres composées dans l'atelier).",
        savoir: [
          "La session n'appartient qu'à la séance : une attestation de réussite n'en a pas besoin.",
          "Trois volets, de gauche à droite : 1 pour qui · 2 les étudiants (tous cochés, on décoche ; pour une personne, pas de volet 2 ; pour une séance, les délibérés et leur résultat, sans case — tout part pour toute l'unité) · 3 quoi (les pièces, groupées : « Résultats » et « Inscription » ; pour une séance, « Pour le Conseil » et « Pour ses étudiants »). Trois zones numérotées, toujours visibles : le numéro devient une coche verte quand l'étape est faite ; on revient en arrière d'un clic pour cocher un étudiant oublié.",
          "Une pièce sans rien à produire est grisée (attestation sans réussite, motivation de refus sans refus…).",
          "Mode SLE : cocher une annexe 1 ou 2 ne montre que les étudiants en séjour limité aux études. Mode CEP : cocher une pièce CEP ne montre que les étudiants au congé-éducation payé de l'année (hors Flandre).",
          "Dans la barre bleue : [[Aperçu|IconZoomIn]], [[Produire|IconPrinter]] et [[Envoyer|IconSend]] — par courriel, un document par personne, jamais de copie collective, à l'adresse d'école.",
        ],
        images: [
          { src: "/guide/editions-personne.png", legende: "« Une personne » (données d'essai) : le nom cherché à gauche, « ouvrir ses pièces » à droite." },
          { src: "/guide/editions-groupe.png", legende: "« Des étudiants » : l'année ou tout le parcours, la section et ses unités ; 1 le périmètre, 2 les étudiants à cocher, 3 les pièces — Résultats et Inscription." },
          { src: "/guide/editions-seance.png", legende: "« Une séance » : l'année, la session, l'unité ; 2 les délibérés et leur résultat, sans case ; 3 « Pour le Conseil » et « Pour ses étudiants »." },
        ],
      },
      {
        titre: "Listes et rapports",
        ou: "Éditions → un onglet → Listes et rapports.",
        texte: "« Prêts à imprimer » : les rapports mis en page. « À composer — colonnes au choix » : une liste dont vous choisissez les colonnes.",
        savoir: [
          "N° national et adresse postale : administrateur et direction seulement. E-mail privé : aussi secrétariat et coordinations.",
          "Personnel a en plus « Pièces par membre » (contrats, fiche d'attributions, EA12).",
        ],
        images: [
          { src: "/guide/editions-listes.png", legende: "Listes et rapports : à gauche les rapports prêts à imprimer et la liste à composer ; filtres, puis [[Générer|fort]], les colonnes à cocher, et la sortie [[Imprimer / PDF|IconPrinter]], [[Envoyer|IconSend|sortir]], [[CSV|IconDownload]] ou [[Excel|IconFileSpreadsheet]]." },
        ],
      },
    ],
  },
  {
    id: 'mescours', pour: 'ens coo dir', titre: 'Mes cours', icone: 'IconPencil',
    resume: "Pour les enseignants, les coordinations et la direction : notes, avis, aménagements, présences, listes.",
    points: [
      { titre: "Les cours",
        ou: "Mes cours (barre du haut).",
        texte: "D'abord VOS cours ; puis, pour une coordination, les cours de sa section, et pour la direction tous "
             + "les cours — filtrables par section et par texte. L'écran a son propre sélecteur d'année : il ne "
             + "change pas l'année de travail du reste de Lucie.",
        savoir: [
          "Dans un cours : filtre par groupe (Tous, A, B…), et l'avion « Listes du cours », une feuille par groupe avec une colonne de signature.",
        ],
        image: "/guide/mescours-liste.png", legende: "Mes cours : le bouton « Mon horaire de la semaine », la journée, puis vos cours (données d'essai)." },
      {
        titre: "Encoder les notes",
        ou: "Mes cours → un cours → Notes du cours.",
        texte: "Une note entière sur 20 par acquis. PP : pas présenté. NP : note de présence. CM : certificat médical. [[Enregistrer|fort]].",
        savoir: [
          "Vos notes sont des propositions : la coordination les reprend dans l'encodage officiel.",
          "Une note sous 10 ne s'enregistre pas sans son « Justificatif d'échec » (panneau de droite). Écrivez-le, ou « Choisir dans la liste ».",
          "Ce justificatif devient la motivation de l'échec en délibération. Le Conseil peut la réécrire.",
          "Unité en évaluation unique : la note d'un acquis encodée sur un cours vaut pour tous les cours qui le portent.",
        ],
        image: "/guide/mescours-notes.png",
        legende: "Un cours ouvert, face « Notes » : une case par étudiant et par acquis ; à droite, ce que vous évaluez.",
        images: [
          { src: "/guide/mescours-justificatif.png", legende: "Une note sous 10 ouvre à droite le « Justificatif d'échec » : une phrase de la liste, ou la vôtre, puis [[Enregistrer|fort]] (données d'essai)." },
        ],
      },
      {
        titre: "Avis de valorisation",
        ou: "Mes cours → rail → Avis de valorisation.",
        texte: "Les demandes de VA recevables pour vos cours. Ouvrez les pièces déposées, puis [[Rendre mon avis]] : Favorable, Partiel ou Défavorable, avec ce que vous avez comparé au dossier pédagogique.",
        savoir: [
          "L'avis se corrige jusqu'à la décision du Conseil, puis il est figé.",
        ],
        images: [
          { src: "/guide/mescours-avis-va.png", legende: "Une demande ouverte : à gauche les pièces déposées, à droite le sens de l'avis et sa motivation, puis [[Rendre mon avis|fort]]." },
        ],
      },
      {
        titre: "Aménagements raisonnables",
        ou: "Mes cours → rail → Aménagements raisonnables.",
        texte: "Les mesures demandées pour vos étudiants. Pour chaque mesure : Réalisable, Avec adaptation, ou pas réalisable. [[Rendre mon avis|fort]].",
        savoir: [
          "Une adaptation ou un refus s'explique.",
          "Vous ne voyez que les mesures, rien d'autre du dossier.",
        ],
        images: [
          { src: "/guide/mescours-avis-ar.png", legende: "Une ligne par mesure : « Avec adaptation » ou « Pas réalisable » ouvre un champ pour l'expliquer, puis [[Rendre mon avis|fort]]." },
        ],
      },
      {
        titre: "Ma journée et la présence par QR code",
        ou: "Mes cours → Ma journée (en tête de la page).",
        texte: "Les séances du jour. [[Afficher le QR|IconQrcode|fort]] le projette en classe : chaque étudiant le scanne avec son téléphone et sa présence s'encode. La première fois, il donne son adresse d'école et un code reçu par courriel ; ensuite son téléphone est reconnu. Après la séance, Lucie demande de compléter les absents.",
        savoir: [
          "Le code change toutes les quinze secondes : une photo envoyée à un absent ne sert à rien.",
          "Un étudiant qui change de téléphone passe par le secrétariat (Suivi des présences → Téléphones liés).",
        ],
        images: [
          { src: "/guide/mescours-journee.png", legende: "Ma journée : un clic sur une séance, puis [[Afficher le QR|IconQrcode|fort]], [[Présences|IconUserCheck]], [[Ticket de sortie|IconTicket]], [[Notes|IconPencil]] ou [[Étudiants|IconUsers]]." },
          { src: "/guide/mescours-qr.png", legende: "Le QR projeté en classe : le compteur des présents et l'heure de fermeture du scan, sous le code.", etroite: true },
          { src: "/guide/mescours-absents.png", legende: "Au tableau de bord, après la séance : les étudiants qui n'ont pas scanné, un statut pour chacun, puis [[Enregistrer|fort]].", etroite: true },
        ],
      },
      {
        titre: "Le ticket de sortie",
        ou: "Mes cours → Ma journée → une séance → Ticket de sortie.",
        texte: "Jusqu'à quatre questions en fin de cours (échelle, réponse courte, choix multiple), posées par le même QR et le même téléphone que la présence. Anonyme par défaut : vous voyez les totaux et les textes.",
        savoir: [
          "En mode nominatif, un QCM corrigé peut se verser dans le carnet de cotes.",
          "Les questions ne changent plus après la première réponse.",
        ],
        images: [
          { src: "/guide/mescours-ticket.png", legende: "Le ticket : deux questions proposées d'office, [[Question|IconPlus]] pour en ajouter, la case « Anonyme », puis [[Projeter le ticket|fort]]." },
        ],
      },
      {
        titre: "Le carnet de cotes",
        ou: "Mes cours → un cours → Carnet de cotes.",
        texte: "Une colonne par évaluation (intitulé, date, sur combien, poids) ; des points, ou PP, NP, CM. On peut coller une colonne d'Excel et sortir le carnet en Excel ([[Excel|IconFileSpreadsheet|sortir]]). Rattachée à des acquis, une évaluation propose une note par acquis ; [[Reprendre dans la feuille de notes]] remplit les cases.",
        savoir: [
          "Le carnet ne remplace pas la feuille de notes : c'est vous qui enregistrez, avec le justificatif sous 10.",
          "« Reprendre 2025-2026 » (l'année précédente, avec le nombre d'évaluations) reprend la structure, jamais les notes.",
        ],
        image: "/guide/mescours-carnet.png",
        legende: "Le carnet : une colonne par évaluation, la moyenne, et la proposition par acquis.",
      },
      {
        titre: "Mon horaire de la semaine, et dans l'agenda du téléphone",
        ou: "Mes cours → Mon horaire de la semaine.",
        texte: "Vos séances de la semaine, à l'échelle du temps, avec le cours, l'activité et le local ; les flèches passent d'une semaine à l'autre. Le lien d'agenda met le même horaire dans l'agenda du téléphone, qui suit seul les déplacements et les annulations.",
        savoir: [
          "Le bouton [[Mon horaire de la semaine|IconCalendarWeek|fort]] est en haut à droite de Mes cours ; « Toute ma semaine », dans Ma journée, y mène aussi.",
          "Le lien pour l'agenda du téléphone : Mes cours, rail, « Mon horaire dans mon agenda », puis [[Créer mon lien|fort]].",
          "Vous ne voyez que les séances où l'horaire vous nomme. Si rien n'apparaît, l'écran dit pourquoi.",
          "Le lien d'agenda ne s'affiche qu'une fois ; « Nouveau lien » annule l'ancien.",
        ],
        image: "/guide/mescours-semaine.png",
        legende: "Mon horaire de la semaine : les séances à l'échelle du temps, le local, les flèches pour changer de semaine.",
        images: [
          { src: "/guide/mescours-agenda.png", legende: "La fenêtre « Mon horaire dans mon agenda » : comment l'ajouter à l'iPhone, à Google Agenda ou à Outlook, puis [[Créer mon lien|fort]].", etroite: true },
        ],
      },
      {
        titre: "Présences",
        ou: "Mes cours → un cours → Présences.",
        texte: "Séance par séance : [[Tous présents]], puis corrigez les absents (A), les retards (P*) et les absences justifiées (J), et [[Enregistrer|fort]].",
        savoir: [
          "Une absence se justifie par un motif de la liste, jamais par un texte libre.",
          "Une séance à venir ne s'encode pas.",
          "Une note d'une unité dont la délibération est close ne se modifie plus ; la seconde session s'ouvre d'elle-même pour les ajournés.",
          "Les étudiants marqués CEP : leurs présences partent sur l'attestation d'assiduité du congé-éducation, qui ne sort pas tant qu'une séance passée n'a pas ses présences.",
        ],
        image: "/guide/mescours-presences.png",
        legende: "Les présences : les séances à gauche, la séance choisie à droite — P, P*, A, J, ou non concerné.",
      },
    ],
  },
  {
    id: 'cep', pour: 'sec dir', titre: 'Congé-éducation payé (CEP)', icone: 'IconUserCheck',
    resume: "La case sur la fiche, les présences, les deux attestations.",
    points: [
      {
        titre: "Le dossier CEP d'un étudiant",
        ou: "Fiche → Congé-éducation.",
        texte: "Marquez l'étudiant au CEP pour l'année, avec la région du lieu de travail et l'employeur. L'onglet montre ses unités, ses heures et ses absences, et produit les pièces [[Inscription]] et [[Assiduité]] par unité.",
        savoir: [
          "La région est celle du LIEU DE TRAVAIL. La Flandre n'utilise pas ces pièces : Lucie refuse.",
          "Attestation d'inscription régulière : à l'employeur au plus tard le 31 octobre (ou 15 jours après une inscription tardive).",
          "Assiduité : par période de trois mois à compter du début de l'UE. Les heures viennent de l'horaire.",
          "En nombre : Éditions → Étudiants → Dossiers étudiants, pièces « CEP — … ».",
        ],
        images: [
          { src: "/guide/cep-onglet.png", legende: "L'onglet Congé-éducation de la fiche (données d'essai) : la région et l'employeur ([[Modifier]]), le taux d'absences injustifiées, ce qui manque pour que les pièces sortent, les heures par unité et période de trois mois, et la justification de chaque absence." },
        ],
      },
    ],
  },
  {
    id: 'personnel', pour: 'sec dir', titre: 'Personnel', icone: 'IconUsers',
    resume: "Les membres, leurs fiches, leurs accès, le recrutement.",
    points: [
      {
        titre: "La liste et la fiche",
        ou: "Personnel.",
        texte: "La liste dit le nom, le statut, l'employeur (IIP ou HELB), les sections et l'ETP de l'année. La fiche a ses onglets : Attributions · Dossier admin. (pièces) · Absences · Journal & entretiens ; et, pour la direction, Fonctions · Accès Lucie · Disciplinaire (dossiers RH). « Nouveau membre » dans le rail. Les contrats ne sont pas un onglet : ils sortent par l'avion (Éditions → Personnel → « Pièces par membre »).",
        savoir: [
          "ETP = cours techniques / 800 + pratique professionnelle / 1000, autonomie comprise.",
          "L'accès à Lucie se donne sur la fiche, onglet « Accès Lucie ». La fiche suit le profil de son rôle ; ce qui est propre à la personne est nommé, et « Revenir au profil » l'efface.",
          "Un compte qui a signé des décisions se désactive, il ne se supprime pas.",
          "Un enseignant ne voit, dans Personnel, que SA fiche. Il peut proposer de corriger ses coordonnées, son état civil, son compte ou sa situation fiscale : la modification part en demande, et la direction la valide dans « Demandes ».",
        ],
        images: [
          { src: "/guide/personnel-nouveau.png", legende: "La fenêtre « Nouveau membre du personnel » (rail → Nouveau membre) : identité, coordonnées, titres, situation fiscale, fonctions ; [[Lire la carte|fort]] pré-remplit depuis la carte eID, et rien n'est enregistré avant [[Créer la fiche|fort]]." },
        ],
      },
      {
        titre: "Besoins, recrutement, classement",
        ou: "Personnel → rail : Besoins & offres · Recrutement · Classement & prioritaires.",
        texte: "« Besoins & offres » : un besoin naît des attributions non pourvues, une offre par cours ; publier l'offre ouvre le recrutement. « Recrutement » : Candidats · Cours à pourvoir · Vue parallèle · Grille d'entretien ; « Nouveau candidat », « Rapport PDF ». « Classement & prioritaires » : le classement d'ancienneté (art. 34) et les candidatures prioritaires (art. 34ter).",
        savoir: [
          "Besoins et recrutement : direction, ou qui a l'accès « recrutement ». Classement : direction seule.",
          "Les pièces du candidat se déposent sur sa fiche : CV, lettre, diplômes, titre pédagogique, casier, ancienneté, déclaration.",
          "Un CV déposé en PDF pré-remplit la fiche du candidat : vérifiez, c'est une lecture automatique.",
          "Un candidat retenu se « pioche » depuis la ligne d'attribution du cours (Organisation → Attributions) : il devient recruté et lié au groupe.",
        ],
        images: [
          { src: "/guide/personnel-candidat.png", etroite: true, legende: "La fenêtre « Nouveau candidat » (Recrutement → rail) : « Analyser un CV avec Lucie » lit un CV en PDF et pré-remplit les champs ; vérifiez, puis [[Créer|IconCheck|fort]]." },
          { src: "/guide/personnel-entretien.png", legende: "Recrutement → Grille entretien : les axes et leurs questions, appliqués à tous les entretiens ; [[Grille de référence]] pour repartir du modèle, [[Enregistrer|IconCheck|fort]] pour garder vos changements." },
        ],
      },
      { titre: "Contrats, EA12 et annexes",
        ou: "L'avion → Éditions → Personnel → « Pièces par membre » (un membre) ou cochez plusieurs membres.",
        texte: "Contrat de travail (chargé de cours ou expert, selon le statut), fiche d'attributions, EA12 — Doc12 "
             + "supérieur (le Word officiel, rempli par Lucie, qu'on complète puis produit) et les annexes de la "
             + "circulaire 9760. En nombre : un document, une pièce par page ; les annexes en archive Word.",
        savoir: [
          "Ces pièces sont réservées à l'administration et à la direction.",
        ] },
    ],
  },
  {
    id: 'organisation', pour: 'sec coo dir', titre: 'Organisation', icone: 'IconBooks',
    resume: "Attributions, planification, horaires, effectifs.",
    points: [
      {
        titre: "Le laboratoire temporel",
        ou: "Organisation → Le laboratoire temporel (erlenmeyer et horloge).",
        texte: "L'outil qui CRÉE l'horaire, en sept étapes numérotées, dans l'ordre du travail : 1 le schéma de capitalisation · 2 le temps (les dates des UE) · 3 les groupes · 4 le planning de l'école · 5 les disponibilités des enseignants · 6 la semaine (Lucie la calcule, on l'adopte et on la verse) · 7 l'horaire. Une frise en tête dit où l'on est ; « Étape suivante » mène à la suivante.",
        savoir: [
          "Chaque tuile dit le nombre d'étudiants de l'UE ou de l'organisation (selon les groupes quand ils existent, sinon les inscriptions).",
          "« Organisation de base » : Lucie propose les dates d'après le quadrimestre prévu, les prérequis et l'épreuve intégrée ; elle montre d'abord, et sauvegarde avant d'écrire.",
          "« Remplir les verres depuis les attributions », « Grand nettoyage du labo » (sauvegarde d'abord, restaurable).",
        ],
        images: [
          { src: "/guide/organisation-labo.png", legende: "La frise des sept étapes en tête du laboratoire : l'étape en cours est en marine, une phrase dit ce qu'on y fait, et [[Étape suivante : Le temps|IconArrowRight|fort]] mène à la suivante." },
        ],
      },
      {
        titre: "Disponibilités et planning de l'école",
        ou: "Le laboratoire temporel → Les disponibilités · Le planning ; fiche de l'enseignant.",
        texte: "Les disponibilités : une semaine type où l'on peint chaque créneau — vert disponible, orange à éviter, rouge jamais ; l'agenda d'un enseignant vaut pour toutes ses sections. Le planning : d'abord la base (les blocs de cours de l'école, jour par jour), puis des contraintes peintes pour une section, un bloc, une UE, un cours, une activité, un enseignant ou un local.",
        savoir: [
          "Ce qui n'est pas peint reste au choix de la simulation.",
        ],
        images: [
          { src: "/guide/organisation-planning.png", legende: "Étape 4, Le planning, face « La base » : les blocs de cours de l'école, jour par jour ; un clic sur un bloc le retire, [[Lu–ve]] le pose sur toute la semaine, [[Ajouter]] en crée un. Les onglets Section · Bloc · UE · Cours · Activité · Enseignant · Local servent à peindre les contraintes ; puis [[Enregistrer|fort]]." },
        ],
      },
      {
        titre: "Une UE en deux organisations, et les cohortes",
        ou: "Le laboratoire → fiche de l'UE (Dédoubler, Retirer l'org, Cohorte) ; Schéma de capitalisation (sélecteur de cohortes) ; fenêtre Cohortes.",
        texte: "Une UE ou un stage peut se donner deux fois (AESI : stage de Toussaint à Noël ou de Carnaval à Pâques ; UE 77 : en BA1 pour les nouveaux, en BA2 pour la transition). Chaque organisation a ses dates et ses étudiants, et sert une COHORTE de la section. Chaque cohorte a son schéma de capitalisation de l'année : la classe de l'organisation s'en déduit.",
        savoir: [
          "[[+ Cohorte]] dans le schéma : elle naît copie du schéma de la cohorte 1 ; on retire ou on décale ensuite. Double-clic pour la nommer.",
          "Fenêtre Cohortes : chaque étudiant reçoit sa cohorte pour l'année (il peut en changer l'année suivante) et passe dans l'organisation qui la sert. Les groupes, cours par cours, gardent le dernier mot.",
          "Badge « primo » et filtre : pour placer d'un coup les primo-inscrits.",
        ],
        images: [
          { src: "/guide/organisation-cohortes.png", legende: "Le sélecteur de cohortes du schéma de capitalisation : « Cohorte 1 » (double-clic pour la nommer) et [[+ Cohorte]] pour en ajouter une." },
        ],
      },
      { titre: "Le bloc et le quadrimestre viennent de la section",
        ou: "Organisation → Schéma de capitalisation ; cliquez une UE.",
        texte: "Une UE n'a de bloc que dans une section et une année (l'UE 95 : BA1 chez les bacheliers, FC chez "
             + "Restart). Le schéma de chaque section règle le bloc et le quadrimestre prévu (Q1, Q2, AN) ; le "
             + "laboratoire les lit. Les dates restent libres.",
        savoir: [] },
      { titre: "Attributions",
        ou: "Organisation → Attributions.",
        texte: "Qui donne quoi, avec quelles périodes, par section et par UE. Trois vues : « Par section », « Vue "
             + "complète », « Coordination » (UE et cours regroupés). « Nouveau » ajoute une ligne, « + » sur une UE "
             + "ajoute une attribution ou un cours, « Annuler » défait une modification récente, « Export » sort "
             + "l'Excel. Le bouton des groupes organise les groupes d'une UE ou de toute la section.",
        savoir: [
          "Sur une ligne : « C » met le titulaire en congé et crée une ligne de remplacement (R) ; le cadenas signale une nomination définitive ; RT, une remise au travail ; la mallette pioche un candidat du recrutement.",
          "Par UE : « Réouvrir cette UE » crée une nouvelle organisation. Par section (direction) : remplir les périodes, rapport d'attributions, Excel, suppression avec sauvegarde.",
          "Ce qu'une coordination modifie part en demande : la direction le valide dans Tableau de bord → « À valider ». Qui ne peut que lire voit la grille en lecture.",
          "La numérotation des NOUVEAUX groupes se règle par section (Configuration → Unités et cours, fiche de la section, « Numérotation des groupes ») : A, B… ; A1, A2, B1… ; ou 1, 2, 3. Les groupes déjà créés se renomment dans Organisation → Répartition des étudiants.",
          "« Répartir entre organisations » (menu de l'UE) recopie, modifie ou déplace des lignes d'une organisation à l'autre. Lucie signale ce qui ne tombe pas sur un multiple du dossier pédagogique ; elle n'empêche pas.",
          "Les périodes d'un cours tombent sur un multiple du dossier pédagogique ; l'autonomie se compte à part.",
          "Les attributions HELB s'affichent mais ne pèsent pas sur la dotation.",
          "Une note sur une ligne : l'icône « i » grise est vide, marine quand elle porte un texte.",
        ] },
      {
        titre: "Planification",
        ou: "Organisation → Planification.",
        texte: "Trois faces : « Planification des UE et cours » (la grille d'organisation de l'année : comment les périodes se découpent, où va l'autonomie) · « Dates des UE » · « Sessions ». Elle se fait AVANT d'attribuer.",
        savoir: [
          "Les dates des UE commandent les comptages, donc la subvention.",
        ],
        images: [
          { src: "/guide/organisation-dates.png", legende: "Planification → Dates des UE (données d'essai) : début et fin de chaque organisation, rangées par section ; [[Initialiser depuis les attributions|IconPlus]], [[Reprendre l'an dernier]], [[Comparer à l'horaire réel|IconCalendar]], puis [[Enregistrer|IconDeviceFloppy|fort]]." },
        ],
      },
      {
        titre: "Horaires",
        ou: "Organisation → Horaires.",
        texte: "« Consulter l'horaire » (ce qui s'ouvre) : la semaine par classe, par professeur ou par local, en lecture seule. « Composer la semaine » : par classe, professeur ou local ; des tuiles qu'on déplace et rallonge ; recopie sur les semaines suivantes ([[Recopier cette semaine…|IconCopy]]) ; import de l'export « liste » d'Hyperplanning ([[Importer d'Hyperplanning…|IconUpload]]). « Contrôler contre les attributions » : ce que l'horaire dépense face à ce qui est attribué.",
        savoir: [
          "Un conflit (même professeur, même local, même classe) se signale, il ne s'empêche pas.",
          "Une séance posée ou retouchée dans Lucie n'est jamais écrasée par un import.",
        ],
        images: [
          { src: "/guide/organisation-controle.png", legende: "Horaires → Contrôler contre les attributions : [[Lire un emploi du temps|IconUpload|fort]] lit l'export PDF, [[Relire|IconRefresh]] recalcule ; chaque cours reçoit son verdict (« Concordant », « Hors attribution »…)." },
        ],
      },
      {
        titre: "Les autres onglets",
        ou: "Organisation → rail.",
        texte: "« Rentrée » : reconduit d'un clic les échéances légales et reporte les événements de l'établissement de l'an dernier. « Répartition des étudiants » : croise attributions et PAE — on coche qui suit quel groupe, avec un plafond suggéré. « Schéma de capitalisation » : place les unités par année d'études et par section. « Pondérations » : la part de chaque cours dans l'unité et des acquis dans le cours. « Descriptifs d'UE » : la partie grise vient du référentiel, la partie blanche est rédigée par le titulaire. « Effectifs et postes PNCC ».",
        savoir: [
          "Répartition des étudiants : le crayon d'un en-tête « Org 1 · Gr. A » renomme le groupe (A1, A2…) ; l'icône à côté du nom du cours renumérote tous ses groupes d'un coup — A, B… · A1, A2… (la lettre est l'organisation : Org 2 donne B1, B2) · 1, 2…. La ligne d'attribution est renommée et les étudiants placés suivent leur groupe. Un nom déjà pris : les deux groupes s'échangent.",
          "Les pondérations ont une année : régler 2026-2027 ne touche pas aux années passées. À partir de 2026-2027, dix points par cours, répartis entre ses acquis.",
          "Les rapports d'Organisation (unités, grilles de cours, enseignants par unité, acquis, unités sans attribution, calendrier des délibérations, locaux) sortent par l'avion → Organisation → Listes et rapports.",
        ],
        images: [
          { src: "/guide/organisation-rentree.png", legende: "Organisation → Rentrée : [[Rien n'a changé — reconduire]] reconduit les échéances légales, [[Reporter depuis 2025-2026|IconCopy]] reporte les événements de l'établissement ; en dessous, les étapes pour ouvrir l'année, chacune avec [[Ouvrir|IconArrowRight]]." },
        ],
      },
    ],
  },
  {
    id: 'gestion', pour: 'coo dir', titre: 'Gestion', icone: 'IconChartBar',
    resume: "Dotation, budget, répartition des périodes.",
    points: [
      {
        titre: "Le budget",
        pour: "dir",
        ou: "Gestion → Budget.",
        texte: "La section d'une prévision se corrige dans son formulaire (ses dépenses la suivent) ; « Autres » accueille ce qui ne relève d'aucune section. Le compte général se cherche en tapant (« matériel », « 6124 »).",
        savoir: [
          "L'import du canevas prend aussi les comptes utilisés dans la colonne A hors de sa liste ; les comptes HELB ne sont plus proposés.",
        ],
        images: [
          { src: "/guide/gestion-budget.png", legende: "Gestion → Finances → Budget : [[Ajouter une prévision|IconPlus|fort]] ouvre le formulaire (section, compte général qu'on cherche en tapant, détail, montants) ; [[Importer le canevas (2026)|IconUpload]] reprend le tableur, [[Reprendre 2025|IconCopy]] l'année précédente." },
        ],
      },
      {
        titre: "Les écrans",
        pour: "dir",
        ou: "Gestion → rail (écran « Pilotage des dotations »).",
        texte: "Dotation · Budget · Répartition des périodes · Configuration, avec le choix de l'année civile dans le rail. L'ETP, la comparaison, les résultats, les distributions et la population réelle sont dans Tableau de bord → Chiffres de l'école.",
        savoir: [
          "La répartition des périodes n'est pas proposée aux coordinations.",
          "La dotation se lit par année civile, en périodes pondérées.",
          "La répartition des périodes prépare le document 2 sur deux années civiles.",
        ],
        images: [
          { src: "/guide/gestion-ecrans.png", legende: "Gestion → Dotation : les faces Dotation · ETP · Comparaison · Répartition des périodes · Configuration ; [[Imprimer des parties…|IconPrinter]] sort la pièce." },
        ],
      },
      {
        titre: "Les présences et la PEP estimée",
        pour: "dir",
        ou: "Gestion → Présences.",
        texte: "Présences encodées, alertes (séances sans présences, plus de 20 % d'irréguliers au premier dixième), réguliers par section et par unité, et la PEP estimée (réguliers × périodes de l'unité) à côté de la PEP officielle d'eProm.",
        images: [
          { src: "/guide/gestion-presences.png", legende: "Gestion → Présences (données d'essai) : les tuiles, ce qui est à regarder, le comptage au premier dixième par section avec la PEP estimée, puis une ligne par unité." },
        ],
      },
      {
        titre: "Le plan d'action qualité",
        pour: "coo dir",
        ou: "Gestion → Qualité → Plan d'action.",
        texte: "Chaque action porte son critère AEQES, son périmètre (l'école ou une section), un responsable, une échéance, une priorité, un indicateur et sa cible. L'avancement se pose par des points de suivi.",
        savoir: [
          "Un point de suivi ne s'efface pas, et une action ne se supprime pas : elle s'abandonne, avec un motif.",
          "La coordination tient les actions de ses sections.",
        ],
        images: [
          { src: "/guide/gestion-qualite.png", legende: "Gestion → Qualité : les tuiles du plan, les filtres, [[Nouvelle action|IconPlus|fort]] ; sur chaque ligne, [[Suivi]] pose un point d'avancement et [[Modifier]] corrige l'action." },
          { src: "/guide/gestion-qualite-suivi.png", legende: "La fenêtre « Suivi » : les points déjà posés (qui, quand, statut, avancement), puis ce qui a été fait, le pourcentage et le statut ; [[Ajouter le point|fort]]." },
        ],
      },
      { pour: 'dir', titre: "Rapport ETP et ratio étudiants / ETP",
        ou: "Éditions → Gestion → Listes et rapports → Rapport ETP.",
        texte: "La charge par section, en ETP, avec le ratio étudiants / ETP.",
        savoir: [
          "Le ratio compte les étudiants réellement inscrits cette année, dans leur section de rattachement. L'estimation par UE ne sert qu'à défaut.",
        ] },
    ],
  },
  {
    id: 'documentation', pour: 'ens sec coo dir', titre: 'Documentation', icone: 'IconBook',
    resume: "Les textes à connaître, ce mode d'emploi, les conventions.",
    points: [
      {
        titre: "Textes et procédures",
        ou: "Documentation → Textes et procédures (les trois faces : Textes et procédures · Mode d'emploi de Lucie · Conventions).",
        texte: "Décrets, circulaires, règlements et procédures de l'Institut. Ce qui vous attend passe en tête. Ouvrez le texte ([[Lire]]), puis cochez « Je confirme avoir pris connaissance de ce document » et [[Confirmer|fort]].",
        savoir: [
          "La case ne se coche qu'une fois le texte affiché.",
          "Une version publiée ne se modifie plus. Une nouvelle version dit si elle demande une nouvelle confirmation.",
          "Écrire et publier un texte : direction ([[Écrire un texte|IconPlus]], dans le rail). Un décret ou une circulaire se recopie, ou se dépose depuis un Word ou un PDF ; rien ne s'écrit avant la publication.",
          "Chaque texte s'imprime : [[Imprimer|IconSend|sortir]], au pied du texte ouvert — sommaire, version et « produit par » sur la pièce.",
        ],
        images: [
          { src: "/guide/documentation-textes.png", legende: "Le texte à confirmer est signalé en tête et dans la liste ; [[Lire]] l'ouvre (données d'essai)." },
          { src: "/guide/documentation-lire.png", legende: "Le texte ouvert : la case « Je confirme avoir pris connaissance de ce document », puis [[Confirmer|fort]] ; [[Imprimer|IconSend|sortir]] à droite." },
        ],
      },
      {
        titre: "Écrire une procédure par parties", pour: 'dir',
        ou: "Documentation → rail → Écrire un texte (procédure, règlement, note de service).",
        texte: "Les textes de l'IIP s'écrivent dans Lucie, partie par partie, comme ce mode d'emploi : chaque partie a un titre et un court résumé, puis des points — un titre, Qui, Où dans Lucie, le texte, « À savoir ». [[Ajouter une partie|IconPlus]], [[Ajouter un point|IconPlus]] ; les flèches montent ou descendent. Écrire [[Enregistrer]] entre doubles crochets dessine le bouton.",
        savoir: [
          "Un texte déjà déposé : ouvrez-le, puis [[Réécrire par parties]]. Lucie le coupe à ses titres ; relisez, puis publiez la version suivante.",
          "La publication suit la règle du corpus : ce qui change, en une phrase ; et la case qui dit si le personnel doit reconfirmer.",
          "Le personnel lit le texte comme le mode d'emploi : sommaire à gauche, une page par partie, points numérotés 1.1, 1.2…",
        ],
      },
      {
        titre: "Conventions",
        ou: "Documentation → Conventions (direction, secrétariat, coordination).",
        texte: "Le registre de l'année, filtrable par famille, état et section. États : Déposée — à signer · Signée par l'IIP · Contresignée · Échue · Retirée. Rail : « Nouvelle convention », « Déposer un document du partenaire », « Modèles de convention ».",
        savoir: [
          "« Nouvelle convention » : choisissez la famille (convention-cadre de stage, partenariat pédagogique, convention entre établissements), remplissez, « Aperçu », puis « Composer ».",
          "Une convention de stage reçue d'un lieu se dépose aussi sur le stage (fiche → Stages).",
          "La signature se fait sur le Tableau de bord, bloc « À signer », par le signataire de l'établissement, en un clic.",
          "L'exemplaire revenu signé par le partenaire se dépose sur la ligne : la convention passe « Contresignée ».",
          "Retirer une convention signée : motif écrit. Chaque convention a son journal, qui ne s'efface pas.",
          "Les modèles sont versionnés ; les modifier est réservé à la direction.",
        ],
        images: [
          { src: "/guide/documentation-conventions.png", legende: "« Nouvelle convention » (rail) : on choisit d'abord la famille — convention-cadre de stage, partenariat pédagogique, convention entre établissements." },
        ],
      },
    ],
  },
  {
    id: 'config', pour: 'dir', titre: 'Configuration (direction)', icone: 'IconSettings',
    resume: "Établissement, enseignement, documents et envois, accès, système.",
    points: [
      {
        titre: "Régler l'apparence (administrateur)",
        pour: "dir",
        ou: "Configuration → Formes et composants · Thèmes et couleurs · Catalogue des éléments.",
        texte: "Formes et composants : rayons, tuiles (grande et compacte), boutons, champs, titres, tableaux, graphiques, fenêtres ; thèmes Maison IIP, Arrondi, Anguleux, Compact, Confort — et « Personnalisé », qui s'allume dès qu'on touche un curseur et garde vos réglages. Thèmes et couleurs : chaque zone de l'écran, les jeux de couleurs des graphiques, un thème Sombre. Catalogue : chaque composant avec sa boîte de propriétés.",
        savoir: [
          "[[↶ Annuler le dernier changement]] sur ces trois écrans ; on recule réglage par réglage.",
          "Chaque changement vaut aussitôt pour toute l'école.",
        ],
        images: [
          { src: "/guide/config-formes.png", legende: "Configuration → Formes et composants : le thème en tête (Maison IIP, Arrondi, Anguleux, Compact, Confort), les curseurs par famille et l'aperçu à droite ; [[↶ Annuler le dernier changement]] en haut." },
        ],
      },
      {
        titre: "Plusieurs établissements",
        ou: "Configuration → Identité.",
        texte: "Plusieurs établissements gérés par le même conseil d'administration, aux étudiants séparés ou partagés. Chacun a son logo couleur, son logo blanc, sa signature et son cachet ; chaque section est rattachée à son établissement.",
        images: [
          { src: "/guide/config-identite.png", legende: "Configuration → Identité : un onglet par établissement et [[+ Établissement]] pour en ajouter un ; ses quatre images (logo, logo blanc, signature, cachet), chacune avec [[Importer une image]], puis sa fiche d'identification." },
        ],
      },
      { titre: "Les cinq familles",
        ou: "Configuration (barre du haut, direction) → rail : la famille ouverte se déplie en plateau, avec une icône par rubrique.",
        texte: "Établissement : Identité · Années et calendrier. Enseignement : Unités et cours · Prérequis d'UE · "
             + "Cursus compatibles · Règles de délibération · Procédures et délais · Planification. Documents et "
             + "envois : Modèles de pièces · Pièces officielles · Descriptifs d'UE · Courriels · Réponses types. "
             + "Accès : Accès · Sécurité. Système : Thèmes et couleurs · Sauvegardes · Traces et "
             + "historique · Registre des envois · Qui a fait quoi · Nouveautés.",
        savoir: [
          "On y règle des MODÈLES et des règles ; on n'y produit pas de pièces (c'est l'avion).",
        ] },
      {
        titre: "Enseignement : le référentiel et les règles",
        ou: "Configuration → Enseignement.",
        texte: "« Unités et cours » : sections, unités et cours de l'année ([[Nouvelle section|IconPlus]], [[Nouvelle UE|IconPlus|fort]], « Importer des UE », effectifs), fiche de section. « Prérequis d'UE ». « Cursus compatibles » : deux sections qu'un étudiant suit ensemble, sans que l'une archive l'autre. « Règles de délibération », par année. « Planification » : ses paramètres.",
        savoir: [
          "Le seuil de réussite de l'unité (10/20) est celui du décret : il ne se règle pas.",
        ],
        images: [
          { src: "/guide/config-unites.png", legende: "Configuration → Unités et cours : l'année de travail, [[Importer effectifs étudiants]], [[Nouvelle section|IconPlus]], [[Import DP|IconUpload]], [[Nouvelle UE|IconPlus|fort]], et les faces Sections · UE · Tableau global · Activités." },
        ],
      },
      { titre: "Identité fait foi",
        ou: "Configuration → Établissement → Identité.",
        texte: "Nom, adresse, n° ECOT, FASE, téléphone et site : toutes les pièces les lisent ici. Le signataire des "
             + "pièces se règle dans la section Direction.",
        savoir: [
          "Corriger ici corrige toutes les pièces produites ensuite.",
        ] },
      {
        titre: "Documents et envois",
        ou: "Configuration → Documents et envois.",
        texte: "Cinq onglets : Modèles de pièces · Pièces officielles (contrat, attestation, diplôme, recrutement) · Descriptifs d'UE · Courriels (expéditeur, redirection de test, journal) · Réponses types (le catalogue commun des phrases toutes faites, champ par champ).",
        savoir: [
          "Ce qui est parti par courriel se relit dans Configuration → Système → Registre des envois : quand, par qui, à qui, quoi, avec une copie.",
        ],
        images: [
          { src: "/guide/config-courriels.png", legende: "Configuration → Courriels : l'envoi de documents par courriel, le récapitulatif quotidien ([[M’envoyer le mien maintenant]] pour l'essayer) et l'expéditeur — Microsoft 365 ou serveur SMTP." },
        ],
      },
      {
        titre: "Accès, fonctions, sécurité",
        ou: "Configuration → Accès → Accès · Sécurité.",
        texte: "« Plafonds par rôle » : ce que chaque rôle autorise au mieux, module par module. « Accès par personne » : ce que chaque compte a réellement. « Les gestes » : pour chaque geste et chaque rôle, oui, non, ou par demande pour la coordination.",
        savoir: [
          "Un clic sur une case ouvre un menu : Oui, Non, Par demande (coordination), ou « Revenir au défaut ». Le réglage en vigueur est coché.",
          "Les cases au cadenas restent à la direction : configuration, validation et décision ne se retirent pas.",
          "Chaque changement entre dans le « Journal des réglages », sous la grille.",
          "L'accès d'une personne se modifie sur sa fiche, onglet « Accès Lucie ». Les comptes : réinitialiser un mot de passe (lien par courriel) ou la vérification en deux temps, retirer un accès.",
          "Les fonctions (secrétaire, coordination…) se règlent sur la fiche du membre, onglet « Fonctions », et se lisent par le filtre « Fonction » de la liste du Personnel. « Sécurité » : combien de mots de passe erronés bloquent un compte, et pour combien de temps.",
          "Ce que voit un rôle se vérifie par « Voir comme… » (vos initiales, en haut à droite).",
        ],
        images: [
          { src: "/guide/config-acces.png", legende: "Configuration → Accès, « Plafonds par rôle » : une ligne par rôle, une colonne par module — écrit, validation, lit ou aucun accès ; un clic sur une case la change. [[+ Nouveau rôle]] en haut à droite." },
        ],
      },
      {
        titre: "Procédures et délais",
        ou: "Configuration → Enseignement → Procédures et délais.",
        texte: "Délais légaux et listes types : motifs de refus et remarques de dispense partielle en VA, catalogue des aménagements raisonnables, mention des voies de recours.",
        savoir: [
          "Dans une liste, une ligne « # Titre » ouvre un groupe.",
        ],
        images: [
          { src: "/guide/config-procedures.png", legende: "Configuration → Procédures et délais : une liste type (ici les justifications de la procédure de recours), chaque phrase modifiable ou supprimée ; en bas, la nouvelle phrase et [[Ajouter|IconPlus|fort]]." },
        ],
      },
      {
        titre: "Thèmes et couleurs",
        ou: "Configuration → Système → Thèmes et couleurs.",
        texte: "Toutes les couleurs de Lucie se règlent ici : écran, états, repères, fonds. Le thème « Maison IIP » (couleurs du logo) est le défaut ; « Lucie d'origine », les gris clairs et « Gris Apple » (gris système d'Apple, bleu Apple) restent disponibles. Le jeu de gris de l'interface se choisit à part : Ardoise, Neutre ou Apple.",
        savoir: [
          "Les pièces imprimées gardent la charte de l'Institut, quel que soit le thème.",
        ],
        images: [
          { src: "/guide/config-couleurs.png", legende: "Configuration → Thèmes et couleurs : les thèmes en cartes (le thème en cours est marqué), les gris de l'interface (Ardoise, Neutre, Apple), chaque couleur de l'écran et un aperçu à droite." },
        ],
      },
      {
        titre: "Sauvegardes",
        ou: "Configuration → Système → Sauvegardes.",
        texte: "Une copie quotidienne, contrôlée à chaque exécution, envoyée hors du serveur. [[Sauvegarder maintenant|fort]] en fait une sur-le-champ ; « Télécharger » la récupère.",
        savoir: [
          "La restauration reste manuelle, sur le serveur.",
        ],
        images: [
          { src: "/guide/config-sauvegardes.png", legende: "Configuration → Sauvegardes : la planification (heure, nombre de copies gardées) et la liste des copies avec leur contrôle d'intégrité ; la flèche de chaque ligne la télécharge, [[Sauvegarder maintenant|fort]] en haut à droite." },
        ],
      },
      {
        titre: "Traces",
        ou: "Configuration → Système → Traces et historique · Registre des envois · Qui a fait quoi · Nouveautés.",
        texte: "L'historique des modifications, le registre de tout ce qui est parti par courriel, le journal de qui a fait quoi (administrateur), et le journal des versions de Lucie.",
        images: [
          { src: "/guide/config-traces.png", legende: "Configuration → Qui a fait quoi : tous les registres réunis, filtrés par personne, registre et dates — quand, qui, quel geste, sur quoi." },
        ],
      },
    ],
  },
];

const PUBLIC_DU_ROLE = { professeur: ['ens'], secretariat: ['sec'], coordination: ['coo'], consultation: ['ens'] };
export const ROLES_TOUT = ['admin', 'directeur', 'directeur_adjoint', 'editeur'];

/** Les chapitres et points qu'un public peut lire. `voir` : la direction regarde « comme » un public. */
export function modeEmploiPour(role, voir = null) {
  const tout = ROLES_TOUT.includes(role);
  const pub = tout ? (voir && voir !== 'tous' ? [voir] : null) : (PUBLIC_DU_ROLE[role] || []);
  const garde = pour => !pub || String(pour || 'ens sec coo dir').split(/\s+/).some(x => pub.includes(x));
  return {
    version: VERSION_DECRITE,
    filtrable: tout,
    publics: pub,                      // null : tous les publics
    rubriques: RUBRIQUES.filter(r => garde(r.pour))
      .map(r => ({ ...r, points: r.points.filter(p => garde(p.pour)) }))
      .filter(r => r.points.length),
  };
}
