// LES PRÉSENCES — chapitre de référence (rédaction pour le mode d'emploi, 1er novembre 2026).
// Vérifié dans : frontend components/PresencesCours, MaJournee, PresencesACompleter, GrillePresence, PresenceQRSuivi,
// PresencesUE, PilotagePresences, TicketSortie, RegistreCep ; pages MesCours, Etudiants, Pilotage, Accueil, PresenceQR ;
// backend lib/presenceQr, cep (MOTIFS_JUSTIFIES, ecrirePresences), grillePresence, alertesAbsences, regularite,
// ticketSortie, rappelsPersonnel, fonctions ; routes mesCours, presencesUE, presenceQrSuivi, ticketSortie, rapports.

export const chapitres = [
  {
    id: 'presences', pour: 'ens sec coo dir', titre: 'Les présences', icone: 'IconCalendarCheck',
    resume: "Prendre les présences, à la main ou par QR code ; sortir la grille pour la vérification ; suivre les absences, la régularité au premier dixième et la PEP estimée.",
    points: [
      {
        titre: "Pourquoi les présences, et d'où viennent les séances",
        texte: "Le registre des présences sert à trois choses : la régularité des étudiants, que la vérificatrice contrôle unité par unité ; les attestations d'assiduité du congé-éducation payé ; et le suivi des absences, pour prévenir un étudiant à temps. Les présences se prennent sur les séances de l'horaire de Lucie (Organisation → Horaires) : un cours absent de l'horaire n'a rien à cocher. Quatre portes, un seul registre : Mes cours (le professeur), le QR projeté (l'étudiant), le tableau de bord (les absents d'une séance projetée) et Suivi des présences → Par UE (le secrétariat).",
        savoir: [
          "Les codes, partout les mêmes : P présent · P* présent, arrivé en retard (ses heures comptent) · A absent · J absence justifiée · — non concerné (autre sous-groupe) · D dispensé (valorisation accordée ou report de notes : hors des heures dues) · case vide : pas encore encodée.",
          "Une absence justifiée porte toujours un motif de la liste fermée du congé-éducation : certificat médical (le travailleur ou un membre de sa famille), grève des transports publics ou des enseignants, fermeture de l'établissement, intempéries hivernales graves, motif professionnel attesté par l'employeur, petit chômage. Jamais un texte libre : Lucie refuse un J sans motif.",
          "Une séance à venir ou annulée ne s'encode pas, par aucune porte.",
          "Chaque changement s'écrit au journal des présences, avec son auteur et sa source (à la main ou par QR) : on sait toujours qui a posé quoi.",
        ],
      },
      {
        titre: "Prendre les présences dans Mes cours",
        pour: "ens coo dir",
        ou: "Mes cours → un cours → onglet « Présences » (ou rail → Présences).",
        texte: "À gauche, les séances du cours, avec leur état : « ✓ » quand tout le monde est encodé, « 3/18 » quand il en manque, « à venir », « annulée ». La dernière séance passée s'ouvre d'office. À droite, un étudiant par ligne et cinq boutons : P, P*, A, J, —. [[Tous présents]] met « présent » sur les cases encore vides ; corrigez ensuite les absents, les retards et les justifiés, puis [[Enregistrer|IconDeviceFloppy|fort]].",
        savoir: [
          "Un J ouvre la liste des motifs ; tant qu'un motif manque, [[Enregistrer]] reste gris et l'écran dit combien il en manque.",
          "Recliquer sur le bouton choisi efface la case.",
          "Seules les lignes changées partent ; l'écran confirme « N présence(s) enregistrée(s) pour la séance du … ».",
          "Un étudiant marqué « CEP » est au congé-éducation payé : ses présences partent sur son attestation d'assiduité.",
          "Vous ne voyez que les séances de l'horaire qui vous nomment. Si la liste est vide alors que le cours a des séances, l'écran dit au nom de qui elles sont, et si votre compte n'est relié à aucune fiche de professeur (la direction le relie dans Personnel → fiche → Accès Lucie).",
          "Le professeur encode ses cours ; la coordination, les cours de ses sections ; la direction, tous.",
        ],
      },
      {
        titre: "Ma journée : la séance du moment, sans rien chercher",
        pour: "ens coo dir",
        ou: "Mes cours → Ma journée (en tête de la page).",
        texte: "Les séances du jour à l'échelle du temps, avec un trait qui marque l'heure ; sur un téléphone, une liste. Les flèches et [[Aujourd’hui]] changent de jour. Un clic sur une séance dit où en sont ses présences (« présences 12 / 18 ») et propose [[Afficher le QR|IconQrcode]], [[Présences|IconUserCheck]], [[Ticket de sortie|IconTicket]], [[Notes|IconPencil]] et [[Étudiants|IconUsers]].",
        savoir: [
          "[[Présences|IconUserCheck]] ouvre le cours directement sur la bonne séance, même si elle est d'une autre année que celle affichée.",
          "Le bouton du QR est mis en avant quand le scan est ouvert ; au survol, il dit l'heure d'ouverture et de fermeture.",
          "[[Afficher le QR|IconQrcode]] et [[Ticket de sortie|IconTicket]] ne paraissent que si la présence par QR est ouverte pour votre compte (voir « La mise en service »), et le QR seulement le jour de la séance.",
        ],
      },
      {
        titre: "Projeter le QR en classe",
        pour: "ens coo dir",
        ou: "Mes cours → Ma journée → une séance → Afficher le QR.",
        texte: "Le QR occupe tout l'écran, avec le cours, l'heure et « scannez pour noter votre présence ». Sous le code, le compteur « X / Y présents » suit tout seul, et une ligne dit si le scan est ouvert (« Scan ouvert jusqu’à … »), pas encore ouvert, ou fermé. [[Plein écran]] pour le projecteur, [[Fermer|IconX]] (ou Échap) pour sortir.",
        savoir: [
          "Le code change toutes les 15 secondes : une photo envoyée à un absent ne sert à rien. Un QR scanné reste valable 30 secondes, le temps que le réseau réponde.",
          "Le scan s'ouvre 10 minutes avant le début du cours et se ferme 20 minutes après le début. Hors de cette fenêtre, l'étudiant est renvoyé vers son enseignant, qui note sa présence à la main.",
          "Un étudiant ne peut se déclarer présent qu'à une séance où il est attendu ; un téléphone n'enregistre que l'étudiant auquel il est lié ; scanner deux fois ne double rien.",
          "Un scan tardif peut être marqué en retard (P*) d'office si la direction l'a réglé ; par défaut, jamais.",
          "Ces durées se règlent dans Suivi des présences → Réglages (direction).",
        ],
      },
      {
        titre: "Ce que fait l'étudiant",
        texte: "Aucune application : l'appareil photo du téléphone suffit. La première fois, l'étudiant tape son adresse d'école (@institut-prigogine.be ou @helb-prigogine.be), reçoit un code à six chiffres et le recopie : sa présence s'enregistre et son téléphone est reconnu. Ensuite, un scan suffit, et l'écran lui confirme sa présence avec le cours et l'heure.",
        savoir: [
          "Le code est valable 10 minutes, cinq essais ; trois codes par heure au plus.",
          "L'adresse doit être celle de sa fiche : une fiche sans adresse d'école, ou une adresse portée par deux dossiers, bloque — le secrétariat corrige la fiche.",
          "Un téléphone ne sert qu'à un étudiant. Lier un nouveau téléphone désactive l'ancien ; un seul nouveau lien par semaine, au-delà le secrétariat l'autorise.",
          "Le téléphone reste reconnu jusqu'au 15 septembre qui suit l'année.",
          "Pas de téléphone, plus de batterie : le professeur encode à la main. Le QR n'est jamais une obligation pour l'étudiant.",
        ],
      },
      {
        titre: "Après le QR : les absents à compléter",
        pour: "ens coo dir",
        ou: "Tableau de bord → fenêtre « Présences à compléter ».",
        texte: "Quand la fenêtre de scan d'une séance que vous avez projetée est fermée, Lucie liste ceux qui n'ont pas scanné et demande ce qu'il en est : Présent, Absent, Justifié (avec son motif) ou Non concerné. [[Les autres absents]] met « Absent » sur ceux qu'on n'a pas encore choisis ; [[Enregistrer|IconDeviceFloppy|fort]].",
        savoir: [
          "Rien ne passe « absent » tout seul : c'est vous qui choisissez.",
          "[[Plus tard]] referme la fenêtre jusqu'à la prochaine ouverture du navigateur ; un rappel « N présences à compléter » reste sur le tableau de bord et la rouvre d'un clic.",
          "Une séance entièrement complétée ne revient plus.",
        ],
      },
      {
        titre: "Le rappel des présences oubliées",
        pour: "ens coo dir",
        texte: "Une séance passée (dans les 30 derniers jours) de vos cours où aucune présence n'est encodée vous est rappelée par courriel, dans le récapitulatif du matin : le lendemain de la séance oubliée, sinon chaque lundi tant qu'il en reste. Le rappel nomme les séances et renvoie à Mes cours.",
        savoir: [
          "Les rappels sont réglés par la direction (Configuration → Courriels → Rappels) : tant qu'elle ne les a pas allumés, rien ne part.",
          "Le bilan du lundi du secrétariat et de la direction compte aussi les étudiants au-delà du seuil d'absences qui n'ont pas encore été prévenus.",
        ],
      },
      {
        titre: "La grille de présence d'un cours ou d'une UE",
        ou: "Mes cours → un cours → Présences → bloc « Grille de présence ».",
        texte: "Le registre en tableau, comme le demande la vérificatrice : les étudiants en lignes, les séances en colonnes, puis les heures présentes sur les heures dues et le taux d'absences injustifiées. Choisissez la période (du … au …, vide = toute l'année), puis [[Ce cours]] (aperçu, PDF A4 paysage) ou [[Excel|IconFileSpreadsheet]]. Pour qui y a droit : [[Toute l’UE …]] et [[Excel UE|IconFileSpreadsheet]] — toutes les séances de tous les cours de l'unité, dans l'ordre du temps, et un récapitulatif des heures cours par cours.",
        savoir: [
          "La grille de l'UE se sort au secrétariat, à la direction, ou par la coordination de la section ; un professeur sort celle de son cours.",
          "Le premier dixième de l'UE est annoncé en tête et sa colonne marquée « 1/10 ». Il se lit dans l'horaire : un dixième de l'écart entre la première et la dernière séance de l'unité ; si ce jour n'a pas cours, la séance la plus proche.",
          "Les activités dont l'étudiant est dispensé (valorisation, report) sont marquées D et sortent des heures dues, comme le veut le règlement des études.",
          "Les motifs des absences justifiées sont listés sous le tableau ; les absences injustifiées au-delà de 10 % sont signalées.",
          "Le classeur Excel a trois onglets : la grille, le récapitulatif de l'UE, les absences justifiées.",
        ],
      },
      {
        titre: "La grille au centre d'impression",
        pour: "sec coo dir",
        ou: "Éditions → Étudiants → Listes et rapports → Grille de présence.",
        texte: "Le secrétariat, qui répond à la vérificatrice, n'entre pas dans Mes cours : la même grille sort d'Éditions. Choisissez la portée (« Une unité » ou « Un cours »), l'unité ou le cours, la période (du … au …, vide = toute l'année), puis [[Imprimer|IconPrinter]] (PDF paysage) ou [[Tableur|IconDownload]] (le classeur Excel).",
        savoir: [
          "Même pièce, mêmes chiffres et même règle d'accès que dans Mes cours : direction, secrétariat, coordination de la section. Les autres rôles ne voient pas ce rapport.",
        ],
      },
      {
        titre: "Suivi des présences : la fenêtre du secrétariat",
        pour: "sec coo dir",
        ou: "Étudiants → rail → Suivi des présences — par UE, régularité, absences.",
        texte: "Une fenêtre à faces : « Par UE », « Absences au-delà du seuil », « Congé-éducation », « Téléphones liés », « Journal », « Réglages ». Le secrétariat et la direction y ont toutes les faces ; la coordination lit « Absences au-delà du seuil », « Téléphones liés » et « Journal », pour les étudiants de ses sections.",
        savoir: [
          "Le périmètre d'une coordination se juge sur la section de l'ÉTUDIANT, pas sur celle de ses unités.",
          "Les gestes — corriger une case, envoyer un avis, désactiver ou autoriser un téléphone — restent au secrétariat et à la direction ; les réglages, à la direction.",
        ],
      },
      {
        titre: "Par UE : corriger les présences d'une unité",
        pour: "sec dir",
        ou: "Étudiants → rail → Suivi des présences → face « Par UE ».",
        texte: "Choisissez la section, puis l'unité (avec ses inscrits et ses séances). Ses inscrits en lignes, toutes les séances de tous ses cours en colonnes. Un clic sur une case ouvre un petit menu : P, P*, A, — ou × (effacer) ; pour J, choisissez le motif dans la liste puis [[J]]. En bout de ligne : heures présentes sur dues, et le taux d'absences injustifiées.",
        savoir: [
          "Pour rattraper vite : « tous P » sous une date met « présent » dans les cases VIDES de cette séance ; « Cases vides en « présent » jusqu’au … » puis [[Remplir]] fait de même pour toutes les séances jusqu'à cette date. Lucie dit d'abord combien de cases seront remplies et demande de confirmer.",
          "Rien de déjà encodé ne change ; une dispense reste D ; les séances d'avant la date d'inscription de l'étudiant restent vides.",
          "Une séance de sous-groupe, ou une unité donnée en plusieurs organisations, ne se remplit pas d'office : l'horaire ne dit pas qui la suit. Elle s'encode case par case.",
          "Une case de séance annulée, à venir ou dispensée ne s'ouvre pas.",
        ],
      },
      {
        titre: "La régularité au premier et au cinquième dixième",
        pour: "sec dir",
        ou: "Suivi des présences → Par UE → colonnes « Rég. 1/10 » et « Rég. 5/10 ».",
        texte: "Juste après la séance du premier dixième, puis après celle du cinquième, une colonne dit si l'étudiant est régulier : R ou IR. Il est régulier quand ses présences et ses absences justifiées atteignent 60 % des heures encodées jusqu'au jalon inclus. C'est une indication pour la vérification, pas une décision : un clic inverse le badge, sans motif à donner.",
        savoir: [
          "Les jalons se lisent dans l'horaire : 1/10 et 5/10 de l'écart entre la première et la dernière séance de l'unité, séance la plus proche. Les dates sont rappelées en tête de la grille.",
          "Les activités dispensées sortent du compte ; une séance non encodée ne pèse ni pour ni contre, elle est signalée par un point après R ou IR. « ? » : rien d'encodé avant le jalon ; « — » : le jalon n'est pas encore passé.",
          "Un badge inversé à la main est entouré de pointillés ; au survol, Lucie dit qui l'a inversé, quand, et ce que donnait le calcul. Revenir à la valeur calculée efface la marque.",
        ],
      },
      {
        titre: "Les absences au-delà du seuil, et l'avis à l'étudiant",
        pour: "sec coo dir",
        ou: "Suivi des présences → face « Absences au-delà du seuil ».",
        texte: "Les étudiants dont les absences dépassent un seuil, unité par unité, calculées comme la grille sur les heures tenues de l'année. Deux colonnes : « Sans justificatif » (au-delà de 10 %, le seuil du congé-éducation) et « Assiduité (40 %) » — au-delà, l'étudiant ne remplit plus la condition d'assiduité du règlement général des études du supérieur (art. 5 et 6 : pas plus de quatre dixièmes d'absences sans motif valable, hors activités dispensées). [[Prévenir l’étudiant|IconMail]] montre l'avis — les séances manquées, le taux, la mention réglementaire au-delà de 40 % — puis l'envoie à son adresse d'école.",
        savoir: [
          "Rien ne part jamais tout seul : l'avis se lit, puis s'envoie d'un clic. La colonne « Prévenu » garde la date du dernier avis, et l'envoi s'écrit au journal, au nom de la personne connectée.",
          "La coordination lit l'avis ([[Lire l’avis]]) ; l'envoi passe par le secrétariat ou la direction.",
          "Un étudiant sans adresse d'école ne peut pas être prévenu : Lucie le dit.",
          "Les deux seuils, la base du second (absences sans motif valable, ou toutes les absences) et le texte de la mention se règlent dans « Réglages » ; sans mention rédigée, l'avis part sans elle et l'écran l'annonce.",
          "L'avis invite l'étudiant à transmettre au secrétariat le justificatif d'une absence justifiée : la présence se corrige alors en J.",
        ],
      },
      {
        titre: "Les téléphones liés",
        pour: "sec coo dir",
        ou: "Suivi des présences → face « Téléphones liés ».",
        texte: "Qui a lié quel téléphone (son type, « iPhone · Safari »), depuis quand, son dernier scan et le nombre de présences prises par QR ; l'état : actif, expiré, désactivé. Recherche par nom, matricule ou adresse ; « Montrer aussi les anciens téléphones ». Deux gestes : [[Désactiver]] un téléphone perdu, prêté ou changé, et [[Autoriser un nouveau]] téléphone au-delà de la limite d'un par semaine.",
        savoir: [
          "Chaque geste demande un motif, gardé au journal au nom de la personne connectée.",
          "L'autorisation vaut pour le PROCHAIN téléphone lié, une fois : l'étudiant scanne le QR en classe et suit les étapes habituelles.",
          "Désactiver et autoriser : secrétariat et direction ; la coordination lit.",
        ],
      },
      {
        titre: "Le journal et les réglages",
        pour: "sec coo dir",
        ou: "Suivi des présences → faces « Journal » et « Réglages ».",
        texte: "Le journal garde chaque événement de la présence par QR : téléphone lié, ancien téléphone désactivé, désactivation et autorisation par le secrétariat, lien, code ou scan refusé (avec la raison), avis d'absences envoyé — filtrable par type d'événement. Les réglages : durée d'un QR, validité d'un QR scanné, ouverture et fermeture du scan, retard d'office (P*), téléphones par semaine, les deux seuils d'absences et la mention réglementaire, les domaines d'adresse d'école acceptés.",
        savoir: [
          "Le journal ne se modifie ni ne s'efface.",
          "Les réglages sont lus par le secrétariat et changés par la direction ; chaque valeur a ses bornes, rappelées à côté du champ avec la valeur par défaut. Ils valent dès le prochain QR projeté.",
          "Un QR doit rester valable au moins le temps de sa rotation : Lucie refuse le contraire.",
        ],
      },
      {
        titre: "Le congé-éducation payé, vu des présences",
        pour: "sec dir",
        ou: "Suivi des présences → face « Congé-éducation ».",
        texte: "Le registre des étudiants au congé-éducation payé de l'année : région du lieu de travail, employeur, et unité par unité où en est leur assiduité. Le seuil de 10 % d'absences injustifiées, qui suspend le droit, se voit ici avant d'être découvert par l'employeur. Les attestations se produisent depuis la fiche (voir le chapitre « Congé-éducation payé »).",
        savoir: [
          "L'attestation d'assiduité ne sort pas tant qu'une séance passée de l'unité n'a pas ses présences : une heure ni présente ni absente ne s'atteste pas.",
        ],
      },
      {
        titre: "Les présences dans Gestion, et la PEP estimée",
        pour: "sec dir",
        ou: "Gestion → Données de l'établissement → Présences → « Présences par UE ».",
        texte: "Écran « Présences et régularité ». Cinq tuiles : UE à l'horaire, réguliers au 1er dixième, présence moyenne, présences non encodées, PEP estimée. « À regarder » : les unités avec des présences non encodées, plus de 20 % d'irréguliers au premier dixième, ou un premier dixième passé sans séance tenue. Puis le comptage au 1er dixième par section, et une ligne par unité (inscrits, séances tenues, présence, réguliers et irréguliers à chaque jalon). Un clic sur une alerte ou une ligne ouvre l'unité dans la grille « Par UE », pour corriger sur place.",
        savoir: [
          "La PEP estimée = réguliers au premier dixième × périodes de l'unité (périodes professeur, autonomie comprise). Une estimation, à comparer à la PEP officielle d'eProm, qu'elle ne remplace pas.",
          "Une inscription par unité : un étudiant inscrit à trois unités compte trois fois. Une unité hors cursus est un groupe mixte : elle se compte à part.",
          "Direction et secrétariat, pour qui a accès à Gestion ; la coordination ne voit pas cette rubrique.",
        ],
      },
      {
        titre: "Le ticket de sortie",
        pour: "ens coo dir",
        ou: "Mes cours → Ma journée → une séance → Ticket de sortie.",
        texte: "Jusqu'à quatre questions en fin de cours : échelle de 1 à 5, réponse courte, ou choix multiple (de 2 à 6 réponses, bonne réponse facultative). Deux questions sont proposées d'office ; [[Question|IconPlus]] en ajoute. [[Projeter le ticket|fort]] affiche un QR qui tourne comme celui de la présence ; [[Voir les résultats]] montre la moyenne de l'échelle, le pourcentage de bonnes réponses et les textes ; [[Fermer le ticket]] l'arrête.",
        savoir: [
          "L'étudiant répond depuis le téléphone déjà lié pour la présence ; un téléphone non lié est renvoyé vers le QR de présence. Une réponse par étudiant, inscrits de la séance seulement, 20 minutes pour répondre après le scan.",
          "Le ticket reste ouvert le jour de la séance, jusqu'à une heure après la fin du cours, ou jusqu'à ce que vous le fermiez. Fermé, il reste lisible depuis Ma journée.",
          "Anonyme par défaut : vous ne voyez que les totaux et les textes. Décoché, vous voyez les noms et [[Verser le QCM au carnet]] crée dans le carnet de cotes l'évaluation « Ticket du jj/mm », un point par bonne réponse, une seule fois.",
          "Les questions ne changent plus après la première réponse ; la bonne réponse n'est jamais envoyée au téléphone.",
        ],
      },
      {
        titre: "La mise en service de la présence par QR",
        pour: "dir",
        ou: "Configuration → Accès → Mise en service → « La présence par QR et le ticket de sortie ».",
        texte: "La présence par QR et le ticket de sortie forment une fonction qui s'allume : Éteinte, en Essai pour des comptes nommés (une phase pilote : un professeur, un cours), ou Allumée pour tous. Éteinte, les boutons du QR et du ticket disparaissent de Ma journée et les présences s'encodent à la main, comme avant.",
        savoir: [
          "Elle naît éteinte. Lucie refuse aussi de projeter un QR pour un compte où elle n'est pas ouverte : cacher le bouton ne suffit pas.",
          "La prise des présences à la main, la grille, le suivi et la régularité ne dépendent pas de cet interrupteur.",
        ],
      },
      {
        titre: "Ce que Lucie garde, et ce qu'elle ne garde pas",
        pour: "sec coo dir",
        texte: "Pour la présence par QR, Lucie garde la présence et son heure, son origine (QR ou à la main), le type de téléphone et ses dates de liaison et de dernier usage, et le journal des événements. Elle ne garde du téléphone qu'un identifiant chiffré, et du code qu'une empreinte. Ni position, ni numéro de téléphone. Une fiche de traitement (RGPD) décrit ce traitement : finalité, données, durées, qui voit quoi.",
        savoir: [
          "Le professeur voit les présences de ses cours ; la coordination celles de ses sections ; le secrétariat et la direction toute la grille, les téléphones et le journal.",
          "La fiche de traitement est à relire par la personne chargée de la protection des données avant l'ouverture à tous les cours.",
        ],
      },
    ],
  },
];

export const ajouts = {};

/* Les points existants qui feraient doublon, allégés et renvoyés au chapitre « Les présences ».
   Leurs captures (image / images) sont reprises TELLES QUELLES : ce ne sont pas des ajouts, et les retirer les perdrait. */
export const remplacements = {
  "mescours|Présences": {
    titre: "Présences",
    ou: "Mes cours → un cours → Présences.",
    texte: "Séance par séance : [[Tous présents]], puis corrigez les absents (A), les retards (P*) et les absences justifiées (J, avec leur motif), et [[Enregistrer|fort]]. La grille du cours (PDF ou Excel) sort du même onglet. Tout le détail — QR, grille, suivi, régularité — est au chapitre « Les présences ».",
    savoir: [
      "Une absence se justifie par un motif de la liste, jamais par un texte libre ; une séance à venir ne s'encode pas.",
    ],
    image: "/guide/mescours-presences.png",
    legende: "Les présences : les séances à gauche, la séance choisie à droite — P, P*, A, J, ou non concerné.",
  },
  "mescours|Ma journée et la présence par QR code": {
    titre: "Ma journée et la présence par QR code",
    ou: "Mes cours → Ma journée (en tête de la page).",
    texte: "Les séances du jour. [[Afficher le QR|IconQrcode|fort]] le projette en classe : chaque étudiant le scanne et sa présence s'encode ; après la séance, Lucie demande de compléter les absents. Le détail (fenêtre de scan, téléphone de l'étudiant, absents à compléter) est au chapitre « Les présences ».",
    savoir: [
      "[[Afficher le QR|IconQrcode]] et [[Ticket de sortie|IconTicket]] ne paraissent que si la direction a ouvert la présence par QR pour votre compte. Sinon, les présences s'encodent avec [[Présences|IconUserCheck]].",
    ],
    images: [
      { src: "/guide/mescours-journee.png", legende: "Ma journée : un clic sur une séance, puis [[Afficher le QR|IconQrcode|fort]], [[Présences|IconUserCheck]], [[Ticket de sortie|IconTicket]], [[Notes|IconPencil]] ou [[Étudiants|IconUsers]]." },
      { src: "/guide/mescours-qr.png", legende: "Le QR projeté en classe : le compteur des présents et l'heure de fermeture du scan, sous le code.", etroite: true },
      { src: "/guide/mescours-absents.png", legende: "Au tableau de bord, après la séance : les étudiants qui n'ont pas scanné, un statut pour chacun, puis [[Enregistrer|fort]].", etroite: true },
    ],
  },
  "mescours|Ce que voit l'étudiant quand il scanne": {
    titre: "Ce que voit l'étudiant quand il scanne",
    texte: "Aucune application : l'appareil photo suffit. La première fois, son adresse d'école et un code à six chiffres reçu par courriel ; ensuite, un scan suffit. Les règles (code, téléphone reconnu, changement de téléphone) sont au chapitre « Les présences ».",
    images: [
      { src: "/guide/presence-etudiant-adresse.png", legende: "Première fois : l'adresse d'école, puis « Recevoir mon code ».", etroite: true },
      { src: "/guide/presence-etudiant-code.png", legende: "Le code reçu par courriel, puis « Valider et enregistrer ma présence ».", etroite: true },
      { src: "/guide/presence-etudiant-ok.png", legende: "C'est fait : la présence est enregistrée, avec le cours et l'heure.", etroite: true },
    ],
  },
  "mescours|Le ticket de sortie": {
    titre: "Le ticket de sortie",
    ou: "Mes cours → Ma journée → une séance → Ticket de sortie.",
    texte: "Jusqu'à quatre questions en fin de cours, posées par le même QR et le même téléphone que la présence. Anonyme par défaut. Le détail est au chapitre « Les présences ».",
    images: [
      { src: "/guide/mescours-ticket.png", legende: "Le ticket : deux questions proposées d'office, [[Question|IconPlus]] pour en ajouter, la case « Anonyme », puis [[Projeter le ticket|fort]]." },
    ],
  },
  "etudiants|Le suivi des présences": {
    titre: "Le suivi des présences",
    pour: "sec coo dir",
    ou: "Étudiants → rail → Suivi des présences — par UE, régularité, absences.",
    texte: "La grille d'une unité case par case, la régularité au premier et au cinquième dixième, les absences au-delà du seuil et l'avis à l'étudiant, le registre du congé-éducation, les téléphones liés au QR, le journal et les réglages. Chaque face est décrite au chapitre « Les présences ».",
    images: [
      { src: "/guide/etudiants-presences-ue.png", legende: "Suivi des présences → Par UE (données d’essai) : une ligne par étudiant, une colonne par séance, et la régularité (R ou IR) au 1er et au 5e dixième." },
      { src: "/guide/etudiants-presences-seuil.png", legende: "Absences au-delà du seuil : les deux taux par unité ; [[Prévenir l’étudiant|IconMail]] montre l’avis avant l’envoi." },
    ],
  },
  "gestion|Les présences et la PEP estimée": {
    titre: "Les présences et la PEP estimée",
    pour: "dir",
    ou: "Gestion → Données de l'établissement → Présences → « Présences par UE ».",
    texte: "Les présences encodées, les alertes, les réguliers au premier dixième par section et par unité, et la PEP estimée à côté de la PEP officielle d'eProm. Le détail est au chapitre « Les présences ».",
    images: [
      { src: "/guide/gestion-presences.png", legende: "Gestion → Présences (données d'essai) : les tuiles, ce qui est à regarder, le comptage au premier dixième par section avec la PEP estimée, puis une ligne par unité." },
    ],
  },
};
