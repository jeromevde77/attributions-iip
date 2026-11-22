/* (CS) Les points du 21 et du 22 novembre 2026 (3.5.613 → 3.5.645) : la demande de pièce de l'étudiant, Mes cours par bloc, les Éditions
   des professeurs en volets, le budget modifiable dans la liste, les attributions, « Qui s'est connecté », le thème Lucie V4. Même forme
   que les autres compléments. */
export const chapitres = [];
export const ajouts = {
  espace: [
    {
      titre: "Demander une pièce qui n'est pas dans la liste",
      pour: 'sec coo dir',
      ou: "L'espace de l'étudiant → Mes documents → « Une pièce qui n'est pas dans la liste ? ».",
      texte: "Sous les pièces qu'il obtient seul, l'étudiant peut demander une autre pièce au secrétariat : il la choisit dans une liste — attestation d'inscription d'une autre année, attestation de fréquentation, relevé de notes détaillé, attestation de réussite, duplicata de diplôme, document pour un employeur, document pour un organisme (CPAS, ONEM, allocations…), autre document — ajoute une précision s'il le veut (obligatoire pour « autre ») et clique sur [[Demander|IconSend|fort]]. Il suit ensuite l'état de chaque demande : en cours au secrétariat, traitée ou refusée, avec le mot du secrétariat.",
      savoir: [
        "Rien ne sort tout seul : c'est le secrétariat qui prépare la pièce.",
        "Dix demandes par jour au plus.",
        "En aperçu « voir comme », la direction voit le bloc et les demandes, sans pouvoir en envoyer.",
      ],
    },
  ],
  etudiants: [
    {
      titre: "Les pièces demandées par les étudiants",
      pour: 'sec dir',
      ou: "Étudiants → le rail → « Pièces demandées par les étudiants » (ou la notification du tableau de bord).",
      texte: "Chaque demande faite depuis un espace étudiant arrive au tableau de bord du secrétariat et dans cette liste : l'étudiant (un clic ouvre sa fiche), la pièce, sa précision, la date. On prépare la pièce (Éditions, ou la fiche → Imprimer ou envoyer), puis [[Traitée|IconCheck|fort]] — un mot est proposé, qu'on peut changer — ou [[Refuser|IconX]], avec un motif obligatoire. L'étudiant lit l'état et le mot dans son espace. « Rouvrir » remet une demande à traiter.",
      savoir: ["La liste s'ouvre sur ce qui reste à traiter ; « Toutes » montre aussi les demandes traitées et refusées, avec qui les a traitées."],
    },
  ],
  mescours: [
    {
      titre: "Mes cours rangés par bloc, ou par section",
      pour: 'ens coo dir',
      ou: "Mes cours → la barre : « Par bloc · Par section ».",
      texte: "Les cours se lisent par tuile : une tuile par bloc (Bloc 1, Bloc 2, Bloc 3), à la couleur du bloc, ou une tuile par section. Dans la tuile, chaque unité a son titre et ses cours en dessous, un par morceau ; un clic sur un cours l'ouvre. Le choix est gardé sur l'appareil. Pour une coordination, « Les cours de ma section » suit le même rangement.",
    },
    {
      titre: "Les Éditions du professeur, en trois volets",
      pour: 'ens coo dir',
      ou: "Mes cours → le rail → [[Éditions|IconSend]].",
      texte: "Trois volets côte à côte, de gauche à droite : 1 Quelle pièce ? (Mes examens, Mes résultats, Mes statistiques) · 2 Pour quels cours ? (et la session quand la pièce en a une) · 3 Sortir : [[Aperçu|IconEye|fort]], [[PDF|IconFileTypePdf]], [[Excel|IconFileSpreadsheet]]. Chaque volet défile seul ; sur téléphone, ils se suivent de haut en bas.",
    },
  ],
  organisation: [
    {
      titre: "Attributions — le plafond dans le titre de la colonne, l'UE ouverte",
      pour: 'sec coo dir',
      ou: "Organisation → Attributions → une UE ouverte.",
      texte: "Le titre des colonnes d'un cours porte son plafond : « Per. / 20 », « Aut. / 34 » — une seule ligne d'en-tête. L'UE qu'on ouvre se détache des autres par une légère avancée et une ombre, sans cadre.",
    },
  ],
  gestion: [
    {
      titre: "Le budget : modifier dans la liste, réimporter un tableau",
      pour: 'coo dir',
      ou: "Gestion → Budget → les lignes → [[Modifier dans la liste]] ; [[Importer un fichier Excel|IconUpload]].",
      texte: "« Modifier dans la liste » montre toutes les lignes de l'année, chaque case modifiable sur place : section, compte, prévision, catégorie, à charge de, priorité, mois, prix unitaire, quantité, TVA, justification, devis, remarque. Une ligne s'enregistre quand on quitte la case (ou au choix d'une liste) ; à gauche, un point dit qu'elle attend, une coche verte qu'elle est enregistrée, un point d'exclamation rouge qu'elle est refusée (le motif au survol). Le bouton Excel sort la même liste ; corrigée dans Excel, elle se réimporte entière par « Importer un fichier Excel » : les lignes de l'année des sections qu'elle porte sont remplacées, catégorie, priorité, mois, justification et devis compris.",
      savoir: [
        "Le Budget s'ouvre sur l'année civile en cours : choisissez l'année suivante pour préparer son budget.",
        "Un fichier dont une ligne n'a pas de section n'est pas importé : Lucie nomme la ligne.",
      ],
    },
    {
      titre: "Qui s'est connecté à son espace : la section de chacun",
      pour: 'sec dir',
      ou: "Configuration → Accès → Mise en service → « Qui s'est connecté à son espace ».",
      texte: "La colonne Section porte la section de chaque étudiant, posée sur la fiche ou déduite de son programme — comme partout dans Lucie.",
    },
  ],
  moi: [
    {
      titre: "Le thème « Lucie V4 » (à l'essai, direction)",
      pour: 'dir',
      ou: "Barre du haut → la palette → Lucie V4.",
      texte: "Le dessin des documents porté à l'écran, en trois niveaux. La zone : un titre, sans trait. La tuile : un bord gauche coloré, l'angle supérieur gauche arrondi d'où le trait remonte sur une partie du haut, et un rappel en bas à droite (un arc et un centimètre de trait) ; des tuiles de même nature qui se touchent n'en font qu'une. Le morceau : ce qu'il y a dans une tuile, séparé par un filet fin qui part de la première lettre ; un état s'y dit par un point de couleur, et le chiffre prend sa couleur. Jamais une tuile dans une tuile.",
      savoir: ["Le thème ne change rien aux pièces imprimées ni aux données ; il se quitte d'un clic dans la palette."],
    },
  ],
};
