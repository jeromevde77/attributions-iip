/* Les points du 1er et du 2 novembre 2026 (3.5.037 → 3.5.071 ; stages, TFE, qui fait quoi et rail en 3.5.066-071 ; temps de travail revu en 3.5.057, visites de stage en 3.5.058) : le temps de travail du secrétariat, le thème de chacun, la bande
   des en-têtes. Même forme que les autres compléments. */
export const chapitres = [];
export const ajouts = {
  etudiants: [
    {
      titre: "Le rail Étudiants, par étape du parcours",
      pour: 'sec coo dir',
      ou: "Étudiants → le rail de gauche.",
      texte: "Cinq groupes, séparés par un filet, dans l'ordre de l'année. Inscrire : Créer un étudiant, Contrôler les dossiers, Inscriptions & PAE (son tiroir : Composer le PAE, Revue des PAE, PAE en ligne, Inscrits par unité, Refus en 2e session), Frais — extraits de compte. Accompagner : Valorisation des acquis, Aménagements raisonnables, Suivi des présences, Écrire aux étudiants. Évaluer : Délibération (son tiroir : Encodage rapide, Contrôles des notes et des décisions, Où sont les notes ?, Règles de délibération, Reports de notes). Recours : Procédures (Registre, Anciens dossiers). Enfin, Vider des résultats, sur la liste des étudiants seulement.",
      savoir: [
        "Les outils restent à leur place quel que soit l'écran ouvert : Suivi des présences, par exemple, s'ouvre aussi depuis la Délibération.",
        "Les visites de stage ne sont plus dans ce rail : Organisation → Stages → Visites et trajets.",
      ],
    },
  ],
  demarrage: [
    {
      titre: "Qui a accès à quoi : les écrans de novembre",
      pour: 'sec coo dir',
      ou: "Configuration → Accès règle les cases de chacun ; ce point dit ce qui s'ouvre à qui.",
      texte: "Les écrans ajoutés depuis la reprise de novembre ne s'ouvrent pas à tout le monde. La règle tient en une ligne par écran ; la direction adjointe peut ce que peut la direction, sauf où c'est dit.",
      savoir: [
        "Temps de travail : la direction et la direction adjointe préparent l'année, voient les heures de tous, forcent tension et calme et valident les modulations ; chaque personne désignée dans le module voit ses heures, et des autres seulement qui travaille et qui est en congé ; elle propose une modulation.",
        "Agenda de l'école : la direction et la direction adjointe peignent l'école (fermetures, cours, jours fermés, grands moments, séries) ; la coordination peint la rangée des sections pour les siennes ; tout compte connecté le lit, et ne voit des grands moments que ceux qui le concernent (« pour qui »).",
        "Stages (vue, pièces, lot, propositions) et Travaux de fin d'études : la direction et le secrétariat, tout ; TOUTE coordination, ses sections, quelles que soient les cases de sa fiche ; pas les enseignants. L'import d'une liste de TFE reste au secrétariat et à la direction.",
        "Visites et trajets : le professeur de stage, ses visites et sa fiche de transport (Mes cours) ; le secrétariat et la direction, tout, et la règle de remboursement ; la coordination, ses sections ; la direction approuve la fiche après la signature de la personne.",
        "Qui fait quoi (Gestion → Équipe) : la direction et la direction adjointe.",
        "La personne responsable d'un type d'échéance se choisit dans le référentiel de l'échéancier : direction et secrétariat.",
      ],
    },
    {
      titre: "Un tiroir du rail se referme d'un clic",
      ou: "Le rail de gauche, sur tous les écrans.",
      texte: "Certaines entrées du rail déplient leurs rubriques en dessous, dans un tiroir : le laboratoire temporel et ses sept étapes, les horaires, l'unité, Inscriptions & PAE, les familles de Gestion et de Configuration. Un clic sur l'entrée qui porte le tiroir le referme, un second le rouvre — même quand on travaille dans l'une de ses rubriques. Le tiroir refermé revient de lui-même quand on passe à une autre entrée.",
    },
  ],
  organisation: [
    {
      titre: "Le rail d'Organisation, dans l'ordre du travail",
      pour: 'sec coo dir',
      ou: "Organisation → le rail de gauche.",
      texte: "Les entrées se rangent en quatre groupes, séparés par un filet, de ce qui se décide d'abord à ce qui se vit : le programme (Schéma de capitalisation, Unité : croiser, pondérer, décrire) ; l'année (Agenda de l'école, Planification, Effectifs et postes) ; qui enseigne et quand (Attributions, Laboratoire temporel, Horaires) ; les étudiants (Rentrée, Répartition des étudiants, Stages, Travaux de fin d'études).",
    },
    {
      titre: "Encoder un stage, pas à pas",
      pour: 'sec coo dir',
      ou: "Organisation → Stages (pour plusieurs étudiants) · fiche de l'étudiant → onglet Stages (pour un seul).",
      texte: "Un stage, c'est un étudiant dans un LIEU, pour une UE de stage, à des dates. 1 Le lieu : il se choisit dans le répertoire de la section ; s'il n'y est pas, [[Nouveau lieu]] le crée (nom, service, adresse complète — elle figure au supplément au diplôme —, contact). Le répertoire entier s'importe d'un classeur (Étudiants → rail → Importer → « Répertoire de lieux de stage »). 2 Le stage : pour une cohorte, Organisation → Stages → Propositions crée un stage par inscrit de l'UE de stage, aux dates de son organisation, puis Affecter en lot donne à tous le même lieu, les mêmes dates, le même professeur ; pour un seul étudiant, fiche → Stages → [[Ajouter un stage|IconPlus|fort]]. 3 Le détail, dans la fiche (la ligne du stage s'ouvre d'un clic) : intitulé, UE, dates, heures prévues, statut, professeur de stage (IIP), maître de stage. 4 Les pièces, au fur et à mesure : autorisation et convention (art. 51), casier modèle 2, médecine du travail, vaccination (art. 55) ; la convention se dépose en PDF et part à la signature de la direction. 5 Le suivi : le professeur de stage planifie ses visites (Mes cours → Mes visites de stage) ; en fin de stage, heures effectuées, évaluation et note du tuteur, statut « Terminé ».",
      images: [{ src: "/guide/etudiants-stages.png", legende: "Fiche → Stages : la ligne ouverte porte le lieu, l'UE, les dates, les heures, le statut, le professeur de stage et les pièces." }],
      savoir: [
        "Organisation → Stages → Pièces manquantes dit, stage par stage, ce qui reste à encoder ; « Relancer » écrit à l'étudiant ce qui est de son ressort.",
        "Aucun stage ne commence sans autorisation écrite et convention signée (RDE, art. 51) ; le casier de moins de six mois est exigé avant le premier dixième de l'unité (art. 55).",
        "Le professeur de stage marqué ★ est attribué à une UE de stage cette année. C'est lui qui verra le stage dans ses visites.",
      ],
    },
    {
      titre: "Les stages de l'année, au même endroit",
      pour: 'sec coo dir',
      ou: "Organisation → Stages → Vue d'ensemble.",
      texte: "Tous les stages de l'année : les chiffres clés en tête (stages, en cours, sans lieu, incomplets, à relancer d'urgence), puis « Qui est en stage, quand » — le nombre d'étudiants en stage chaque semaine, par section —, puis la liste, filtrable par étudiant, lieu, UE, section et statut, avec le professeur de stage, les visites faites sur prévues et ce qui manque. Le stage d'un étudiant se retouche dans sa fiche, onglet Stages.",
      images: [{ src: "/guide/stages-ensemble.png", legende: "La vue d'ensemble (données d'essai) : huit stages de l'UE 336 en deux organisations, Toussaint–Noël et Carnaval–Pâques." }],
      savoir: [
        "La coordination voit et gère les stages et les TFE de ses sections, quelles que soient les cases de sa fiche ; le secrétariat et la direction, tous.",
      ],
    },
    {
      titre: "Ce qui manque avant de commencer (art. 51 et 55)",
      pour: 'sec coo dir',
      ou: "Organisation → Stages → Pièces manquantes.",
      texte: "Pour chaque stage, ce qui manque : le lieu, les dates, le professeur de stage, l'autorisation et la convention signée (RDE, art. 51 : aucun stage ne commence sans elles), le casier judiciaire de moins de six mois, la médecine du travail et la vaccination (art. 55). En rouge, ce qui presse : un début dans moins de quatorze jours, ou le premier dixième de l'unité passé sans casier — celui de l'organisation de l'étudiant. [[Relancer|IconSend]] écrit à l'étudiant, à son adresse d'école, la liste des pièces qui sont de son ressort ; la date de la relance reste sur la ligne.",
      images: [{ src: "/guide/stages-pieces.png", legende: "Les pièces manquantes (données d'essai), les plus urgentes en tête." }],
    },
    {
      titre: "Affecter en lot, et les stages proposés",
      pour: 'sec coo dir',
      ou: "Organisation → Stages → Affecter en lot · Propositions.",
      texte: "Affecter en lot : on choisit une UE de stage ; ses inscrits paraissent, avec leur organisation (un bouton par organisation coche ses étudiants et reprend ses dates) ; à droite, ce qu'ils reçoivent tous — le lieu, les dates, le professeur de stage, le maître de stage, l'intitulé. [[Voir ce qui sera écrit]] montre le résultat, étudiant par étudiant, puis [[Affecter|IconCheck|fort]] l'écrit. Seuls les champs remplis s'écrivent : un stage qui existe déjà est complété, jamais vidé. Propositions : un stage par inscrit d'une UE de stage qui n'en a pas encore, aux dates de son organisation (en AESI, Toussaint–Noël ou Carnaval–Pâques) ; on coche ceux qu'on crée.",
      images: [{ src: "/guide/stages-lot.png", legende: "Affecter en lot (données d'essai) : l'UE 336, ses deux organisations, ses inscrits ; à droite, ce qu'ils reçoivent." },
        { src: "/guide/stages-propositions.png", legende: "Les propositions (données d'essai) : un stage par inscrit d'une UE de stage qui n'en a pas." }],
      savoir: [
        "Le professeur de stage marqué d'une étoile est attribué à une UE de stage cette année.",
      ],
    },
    {
      titre: "Les visites et les trajets de tous",
      pour: 'sec coo dir',
      ou: "Organisation → Stages → Visites et trajets (l'entrée « voiture » du rail Étudiants y mène aussi).",
      texte: "Le même écran que celui du professeur, pour tous les professeurs de stage : les visites du mois, [[Planifier une visite|IconPlus|fort]], la liste des stages sans visite avec [[Visite|IconPlus]] sur chaque ligne, la fiche de transport du mois de chacun et les frais de déplacement (qui est remboursé, depuis où, à quel taux). Le menu à droite choisit un professeur. La fiche se signe par la personne, puis la direction l'approuve ; l'imprimante du bandeau la sort.",
      images: [{ src: "/guide/stages-trajets.png", legende: "Visites et trajets (données d'essai) : les stages qui n'ont encore aucune visite." }],
      savoir: [
        "Le professeur garde ses propres visites dans Mes cours → Mes visites de stage.",
      ],
    },
    {
      titre: "Les travaux de fin d'études : la vue de l'année",
      pour: 'sec coo dir',
      ou: "Organisation → Travaux de fin d'études → Vue d'ensemble.",
      texte: "Tous les TFE de l'année — les mêmes que dans la fiche de chaque étudiant, onglet TFE : rien n'est en double. En tête, les TFE encodés, les inscrits d'une épreuve intégrée sans TFE, ceux sans promoteur, ceux dont une remise est en retard et les défenses fixées. Une ligne par TFE : l'étudiant, sa section, le titre, le promoteur, les remises reçues, la défense et la décision de l'épreuve intégrée — lue de la délibération de l'unité, jamais écrite ici. [[Jury|IconUsers]] compose le jury : promoteur, copromoteur, lecteur, auditeur, président, choisis dans le personnel.",
      images: [{ src: "/guide/tfe-ensemble.png", legende: "La vue d'ensemble des TFE (données d'essai) : un promoteur à désigner, des remises en retard, une épreuve intégrée réussie." }],
      savoir: [
        "La coordination voit et tient les TFE de ses sections ; le secrétariat et la direction, tous. L'import d'une liste de TFE (Étudiants → rail → Importer) reste au secrétariat et à la direction.",
      ],
    },
    {
      titre: "Qui encode un TFE ?",
      pour: 'sec coo dir',
      ou: "Organisation → Travaux de fin d'études, ou fiche de l'étudiant → onglet TFE.",
      texte: "L'école, pas l'étudiant : le secrétariat ou la coordination pose le titre, le jury, les remises et la défense ; une liste entière s'importe (Étudiants → rail → Importer → « Importer des TFE »). L'étudiant n'encode rien dans Lucie ; il reçoit les relances de remise et sa convocation à son adresse d'école. Les membres du jury reçoivent leur convocation à l'adresse de leur fiche du personnel.",
      savoir: [
        "Aujourd'hui, le promoteur et le jury n'ont pas d'écran à eux dans Lucie : ils sont prévenus par courriel.",
      ],
    },
    {
      titre: "Ceux qui n'ont pas encore de TFE",
      pour: 'sec coo dir',
      ou: "Organisation → Travaux de fin d'études → Sans TFE.",
      texte: "Les étudiants inscrits cette année à une épreuve intégrée dont aucun TFE n'est encodé. Le titre est la seule chose demandée : on le tape sur la ligne, [[Créer|IconPlus]] (ou Entrée). Le promoteur, le jury et les dates se posent ensuite.",
      images: [{ src: "/guide/tfe-sans.png", legende: "Les inscrits d'une épreuve intégrée sans TFE (données d'essai)." }],
    },
    {
      titre: "Les remises : le calendrier de la section, et ce qui est reçu",
      pour: 'sec coo dir',
      ou: "Organisation → Travaux de fin d'études → Remises.",
      texte: "Chaque section fixe ce que ses étudiants remettent, et pour quand : [[Remise|IconPlus]] ajoute une ligne (projet de TFE, version intermédiaire, version finale…) et sa date limite, [[Enregistrer|fort]] la garde. Dessous, une ligne par TFE de la section et une colonne par remise : un clic sur la case la marque reçue aujourd'hui, un second l'efface. Passée la date, la case vide devient « en retard », en rouge, et [[Relancer|IconSend]] écrit à l'étudiant, à son adresse d'école, ce qui n'a pas été reçu.",
      images: [{ src: "/guide/tfe-remises.png", legende: "Le calendrier de la section et les remises de chacun (données d'essai)." }],
      savoir: [
        "Une remise déjà reçue par quelqu'un ne se retire plus du calendrier : on change sa date ou son nom.",
      ],
    },
    {
      titre: "Les défenses et les convocations",
      pour: 'sec coo dir',
      ou: "Organisation → Travaux de fin d'études → Défenses.",
      texte: "Le planning des défenses, dans l'ordre des dates : date, heure et local s'écrivent sur la ligne et s'enregistrent en quittant la case ; le bouton du jury l'ouvre. Les TFE dont la défense est fixée et qui ne sont pas encore convoqués sont cochés d'office. [[Convoquer|IconSend|fort]] montre d'abord, TFE par TFE, qui recevra la convocation et ce qui manque (date, heure, local, jury, adresse) ; l'avion du bandeau l'envoie alors à l'étudiant, à son adresse d'école, et à chaque membre du jury, à l'adresse de sa fiche du personnel. La date de convocation reste sur la ligne.",
      images: [{ src: "/guide/tfe-defenses.png", legende: "Le planning des défenses (données d'essai)." },
        { src: "/guide/tfe-convoquer.png", legende: "Avant d'envoyer (données d'essai) : une convocation prête, une autre à laquelle il manque le local." }],
      savoir: [
        "Un TFE à qui il manque la date, l'heure, le local ou le jury ne part pas ; les autres partent.",
        "Un membre du jury sans adresse dans sa fiche n'est pas prévenu : l'aperçu le nomme.",
      ],
    },
  ],
  gestion: [
    {
      titre: "Qui fait quoi : ce qui a été fait, ce qui attend, et à qui le confier",
      pour: 'dir',
      ou: "Gestion → rail → Équipe → Qui fait quoi.",
      texte: "Trois blocs. Ce qui attend : les VA à valider, à notifier et à encoder dans eProm, les PAE à revoir, les séances de délibération à clore, les échéances et les tâches en retard — par section, avec à qui cela revient ; [[Confier|IconSend]] en fait une tâche pour quelqu'un, qui paraît à son Accueil. Les présences à encoder : les séances passées sans présence, par enseignant. Ce qui a été fait ces 7, 30 ou 90 derniers jours : par personne, les fiches, PAE, résultats et notes touchés, les PAE revus, les VA décidées, les tâches et échéances cochées. Sous les blocs, les sections qui n'ont aucune coordination dans Lucie.",
      images: [{ src: "/guide/gestion-qui-fait-quoi.png", legende: "Qui fait quoi (données d'essai)." }],
      savoir: [
        "Une trace absente n'est pas un travail absent : ce qui se fait hors de Lucie ne se voit pas ici.",
        "Réservé à la direction et à la direction adjointe.",
      ],
    },
  ],
  equipe: [
    {
      titre: "Une personne par type d'échéance, et les échéances que Lucie coche seule",
      pour: 'sec coo dir',
      ou: "Suivi d'équipe → Échéancier.",
      texte: "Chaque type d'échéance (préparer une unité, compter au premier dixième, publier les résultats…) peut nommer UNE personne : ses échéances ouvertes et les suivantes lui reviennent, et ses rappels aussi. La direction la choisit dans le référentiel de l'échéancier. Lucie coche elle-même ce qu'elle voit fait, au nom de « Lucie (constaté) », avec ce qu'elle a constaté en commentaire : une unité préparée (chaque cours attribué, des séances à l'horaire), ouverte (présences de la première séance), comptée au premier dixième (présences jusqu'à ce jour), son conseil tenu (séance close) et ses résultats publiés. Elle ne décoche jamais.",
      savoir: [
        "Ce que Lucie ne peut pas voir — un local réservé, une convocation envoyée hors de Lucie — se coche toujours à la main.",
      ],
    },
  ],
  personnel: [
    {
      titre: "Le temps de travail du secrétariat : le cadre",
      pour: 'sec dir',
      ou: "Personnel → rail → Temps de travail.",
      texte: "Le temps de travail et les congés du personnel administratif suivent la réglementation, au jour près : 36 h de travail effectif par semaine pour un temps plein (circulaire 9760, point 1.3.8), en proportion pour un temps partiel ; une pause d'au moins 15 minutes dès que la journée dépasse 6 heures, jamais plus de 6 heures d'affilée ; 8 heures par jour au plus, 9 heures en semaine de 4 jours ou en horaire variable inscrit au règlement de travail ; 11 heures de repos entre deux journées. Trois faces, dans l'ordre du travail : la ligne du temps, le relevé et ses signatures, et, pour la direction, la préparation de l'année.",
      savoir: [
        "13 semaines de congé par an, été compris ; le dû est toujours de 36 h × 39 semaines = 1 404 heures par temps plein, en proportion pour un temps partiel. On module les semaines, jamais le total.",
        "Un jour férié pendant une semaine de travail compte pour ses heures prévues : il ne se récupère pas.",
        "Chaque membre désigné voit ses heures et, des autres, seulement qui travaille et qui est en congé.",
        "Le module a sa propre année (en tête d'écran) : elle commence le premier lundi à partir du 15 août — le lendemain de la fermeture d'été — et finit le 15 août suivant ; on prépare l'année suivante sans changer l'année de travail du reste de Lucie.",
      ],
    },
    {
      titre: "Préparer l'année, en quatre étapes",
      pour: 'dir',
      ou: "Personnel → Temps de travail → Préparer l'année.",
      texte: "Quatre étapes numérotées, dans l'ordre où elles se font : 1 Personnes et règles (qui entre dans le module, sa formule, sa part de temps plein ; l'horaire variable au règlement de travail ; le minimum de présents) · 2 Congés (ils se peignent dans l'agenda de l'école : fermée pour Noël et l'été, en partie pour Toussaint, Carnaval et Pâques) · 3 Grands moments (rentrée, inscriptions, examens, remise des diplômes, portes ouvertes… ; les délibérations se lisent seules des séances) · 4 Générer les années ([[Calculer]], puis [[Enregistrer l'année|fort]], qui reste gris tant qu'une règle n'est pas tenue). « Étape suivante » mène à la suivante.",
      images: [{ src: "/guide/temps-moments.png", legende: "Étape 3, les grands moments (données d'essai) : ceux que la direction pose, et les délibérations, lues des séances." }],
      savoir: [
        "Fermée : congé pour tout le personnel. En partie : au choix de chacun — sur la ligne du temps, « Prendre cette semaine en congé » et « Travailler cette semaine », une prise pour une rendue ; la direction adjointe contrôle, la direction accepte. Treize semaines de congé, toujours.",
        "Régénérer une année remplace ses semaines, modulations comprises ; les écarts déjà encodés au relevé restent.",
      ],
    },
    {
      titre: "L'agenda de l'école : peindre l'année",
      pour: 'sec coo dir',
      ou: "Organisation → Agenda de l'école (et en tête du Temps de travail).",
      texte: "Un seul agenda pour toute l'école, sur la ligne du temps de l'année : les grands moments, la période des semaines (tension, calme), le calendrier des cours, la fermeture de l'école, les sections et le personnel qu'elles demandent. Le plus simple : à la souris (ou au doigt), on appuie sur une semaine, on glisse jusqu'à la dernière et on lâche ; un menu propose quoi y mettre — Tension, Calme, un grand moment (Examens, Inscriptions, Remise des diplômes…), l'école fermée ou en partie, le type des cours, une section. [[Peindre]] garde un pinceau pour poser la même chose plusieurs fois : on touche la première semaine puis la dernière. [[Saisir|IconCalendarPlus]] ouvre le même geste avec un mini calendrier : grand moment, jour fermé (mardi gras, 2 novembre…), fermeture, chaleur, cours ou section, du premier au dernier jour.",
      images: [{ src: "/guide/agenda-saisir.png", legende: "Saisir dans l'agenda (données d'essai) : quoi, sa nature, son nom, et les jours au mini calendrier ; en rouge les fériés et jours fermés, grisé l'école fermée." }],
      savoir: [
        "La rangée « Stages » compte les étudiants en stage chaque semaine (en vert) et marque en beige les deux semaines qui précèdent un début de stage (autorisation, convention, pièces des art. 51 et 55) ; préparation et suivi entrent dans le calcul des semaines en tension.",
        "Une section est active la semaine où l'horaire lui donne des séances ; on la force pour une semaine sans séance (un stage) ou pour corriger. La rangée « Sections » compte les sections actives ; elles disent combien de personnes le secrétariat doit garder (le minimum réglé quand une section est active, une permanence quand l'école est en partie fermée, personne quand elle est fermée). La ligne « Au travail » passe en rouge en dessous.",
        "Un jour fermé par l'école compte comme presté pour le personnel ; le relevé dit qui l'a posé et quand. Il s'ajoute aux fériés légaux pour l'horaire, la simulation et le congé-éducation.",
        "La direction et la direction adjointe peignent l'établissement ; la coordination force les semaines de ses sections ; le secrétariat lit. Chaque geste entre au journal de l'agenda.",
      ],
    },
    {
      titre: "L'agenda en vue Mois : réunions, échéances, événements",
      pour: 'sec coo dir',
      ou: "Organisation → Agenda de l'école → [[Mois]] (ou Temps de travail → Ligne du temps → [[Mois]]).",
      texte: "Un mois par ligne, les jours en colonnes, chaque élément à son jour. La couleur dit la nature : événement, échéance (un document à remettre), réunion, conseil, horaires ; les boutons de couleur masquent une nature, les domaines (administratif, pédagogique, ASBL, HE) filtrent. On glisse sur des jours — ou on touche un jour — et la saisie s'ouvre à ces dates : le nom, le type, le domaine, l'heure, pour qui, et si l'élément revient (chaque semaine, une semaine sur deux, chaque mois le n-ième jour). Un élément touché se lit ; on le retire, et pour une série on déplace ou on annule une seule date, ou on retire la série.",
      images: [{ src: "/guide/agenda-mois.png", legende: "La vue Mois (données d'essai) : Collège et Coordination en séries, échéances, salon, examens, inscriptions, délibérations." }],
      savoir: [
        "« Pour qui » : la direction, le secrétariat, la coordination, les enseignants ; rien coché, tout le monde. Chacun ne voit que ce qui le concerne ; la direction voit tout.",
        "Une série saute les semaines où l'école est fermée et les jours fermés ; elle ne réchauffe pas la période (une réunion ne fait pas une semaine de tension).",
        "Les délibérations viennent des séances : elles se lisent, elles ne se posent pas ici.",
      ],
    },
    {
      titre: "La ligne du temps : l'année, les semaines, la semaine",
      pour: 'sec dir',
      ou: "Personnel → Temps de travail → Ligne du temps.",
      texte: "Trois zooms. [[Année]] : les 52 semaines, une barre par personne et par semaine (sa hauteur, ses heures ; le pointillé, les 36 h de référence), les congés hachurés, le total de l'année face au dû, et la ligne des personnes au travail. [[Semaines]] : huit semaines, une barre par jour. [[Semaine]] : l'horaire de chaque jour, de 7 h à 19 h, la pause en blanc et, en cadre ocre, les heures réelles encodées au relevé. Au-dessus de chaque zoom, les grands moments et la période de chaque semaine (tension, calme). Toucher une semaine de l'année ouvre son détail : pourquoi elle est en tension ou calme, qui fait combien.",
      images: [{ src: "/guide/temps-ligne-annee.png", legende: "L'année de l'équipe (données d'essai) : les grands moments, la période (ocre : tension, bleu : calme), les heures de chacun, et le détail d'une semaine choisie." },
        { src: "/guide/temps-ligne-semaine.png", legende: "Le zoom Semaine : l'horaire de chacun, jour par jour, de 7 h à 19 h." }],
      savoir: [
        "La chaleur se calcule : l'activité de la même semaine l'an dernier (dossiers d'étudiants touchés, pièces envoyées, demandes de VA) et ce que l'année annonce (délibérations, unités qui s'ouvrent, échéances du secrétariat, grands moments). Un quart des semaines de travail est en « tension », un quart « calme ».",
        "La direction peut fixer une semaine en tension, normale ou calme ([[Calcul de Lucie]] rend la main au calcul).",
      ],
    },
    {
      titre: "Moduler son année avec l'assistant",
      pour: 'sec dir',
      ou: "Ligne du temps → [[Moduler mon année|fort]].",
      texte: "On donne un jour (zoom Semaines ou Semaine : toucher le jour), on donne une semaine, ou on charge une semaine à 40 h (zoom Année : toucher la semaine). L'assistant remet aussitôt la différence ailleurs : dans les semaines à venir, celles en TENSION d'abord quand il faut ajouter des heures, les plus calmes d'abord quand il faut en retirer ; il montre chaque semaine touchée, avant → après, sur la ligne du temps et dans son panneau. Une semaine qui ne convient pas s'écarte (la croix) : il cherche ailleurs. L'année garde toujours 1 404 h.",
      images: [{ src: "/guide/temps-ligne-assistant.png", legende: "Un vendredi donné (données d'essai) : ses 7 h 12 vont aux semaines en tension de fin janvier ; l'année compte toujours 1 404 h." }],
      savoir: [
        "Un jour donné est un repos compensatoire. Les bornes de l'horaire variable (art. 20bis) tiennent : 9 h par jour, 2 h de plus que l'horaire de référence, 5 h de plus ou de moins par semaine, 45 h au plus.",
        "La personne propose ([[Envoyer à la direction|IconSend|fort]]) ; la direction adjointe contrôle, la direction accepte ; la modulation s'applique alors. Un refus se motive et se lit dans la ligne du temps.",
        "La direction peut moduler directement l'année d'une autre personne ([[Appliquer|fort]]).",
        "Moduler suppose l'horaire variable inscrit au règlement de travail ; une année modulée suit les règles de l'horaire annualisé.",
      ],
    },
    {
      titre: "Le relevé du mois : n'encoder que les écarts",
      pour: 'sec dir',
      ou: "Personnel → Temps de travail → Relevé et signatures.",
      texte: "L'horaire prévu fait foi : il compte tout seul. On n'encode que ce qui en diffère, jour par jour, avec [[Écart]] : des heures réelles (arrivée, départ, pause), ou une absence — maladie, congé de circonstance, mission ou formation (comptées comme prestées), récupération ou absence non rémunérée (non comptées). Le relevé donne le prévu, le presté, l'écart du mois et le solde de l'année, qui doit revenir à zéro en fin de période. Pour la direction, le suivi de l'équipe est en tête : une ligne par personne (solde, signatures), qu'on touche pour ouvrir son relevé.",
      images: [{ src: "/guide/temps-releve.png", legende: "Le relevé et signatures (données d'essai) : le suivi de l'équipe en tête, puis le relevé du mois de la personne choisie." }],
      savoir: [
        "Un jour qui enfreint une règle s'affiche en rouge, et le relevé ne peut pas être signé tant qu'il n'est pas corrigé.",
        "Le relevé se signe dans l'ordre : la personne, la direction adjointe (contrôle), la direction (accord). Chaque signature porte le nom de qui a cliqué et l'heure ; si le relevé change ensuite, elle tombe et se refait. Signé par la direction, le mois est verrouillé.",
        "La fiche de congés, sous le relevé, se signe par la direction adjointe puis la direction ; [[Relevé du mois|IconPrinter]] et [[Fiche de congés|IconPrinter]] sortent les pièces.",
      ],
    },
  ],
  mescours: [
    {
      titre: "Le carnet : noter acquis par acquis (l’écrit et l’oral d’une épreuve intégrée)",
      pour: 'ens coo dir',
      ou: "Mes cours → le cours → Carnet → [[Évaluation|IconPlus]] → cocher les acquis, puis « Noter acquis par acquis ».",
      texte: "Certaines lignes d’une UE ne sont pas évaluées pour elles-mêmes (la préparation d’une épreuve intégrée, l’encadrement d’un stage) : ce qu’on note, ce sont des épreuves — l’écrit, l’oral, des séances. Dans le carnet du cours qui porte l’évaluation (ex. 264.2), on crée « Écrit » et « Oral », on coche les acquis que chacun évalue avec leur poids, et on coche « Noter acquis par acquis ». Le carnet ouvre alors une colonne par acquis : on y met une note par acquis ; la note de l’écrit (et de l’oral) en est la moyenne pondérée. Un acquis évalué à l’écrit et à l’oral reçoit une proposition qui combine les deux. [[Reprendre dans la feuille de notes|IconArrowRight]] verse ces propositions dans la feuille, comme pour toute évaluation — le calcul de la délibération ne change pas.",
      savoir: [
        "La coordination de la section et le titulaire du cours créent ces évaluations ; pour un TFE, le promoteur encodera la fiche de notation depuis l’espace enseignant, et elle arrivera dans ce carnet.",
        "Une évaluation déjà notée ne passe pas d’une note unique à une note par acquis (ni l’inverse) : on en crée une autre.",
      ],
    },
    {
      titre: "L'espace enseignant : un site à part, plus simple",
      pour: 'ens coo dir',
      ou: "enseignants.lucie-iip.be — sur téléphone, tablette ou ordinateur.",
      texte: "Un site à part, réservé aux enseignants, sans les menus de gestion de Lucie. Il s'ouvre sur Ma journée : les séances du jour avec [[Prendre les présences|IconUserCheck|fort]], et « Ce qui m'attend » (les séances passées dont les présences manquent). Les présences se prennent d'un toucher par étudiant — P présent, P* en retard, A absent, J absence justifiée avec son motif —, [[Tous présents]] d'abord pour aller vite. Mon horaire montre la semaine, visites de stage comprises ; Mon compte, ses appareils et son mot de passe. La première fois : « Première visite » → un lien arrive à votre adresse de l'institut → vous choisissez un mot de passe pour cet espace (celui de Lucie ne change pas) ; sur un nouvel appareil, un code à six chiffres en plus.",
      savoir: [
        "Ce que vous enregistrez dans l'espace part dans Lucie en quelques secondes, à votre nom ; si Lucie refuse (séance qui ne vous appartient plus, par exemple), l'espace le dit sur la séance.",
        "Il ne s'ouvre que depuis la Belgique, comme l'espace des étudiants.",
        "La direction l'ouvre dans Configuration → Accès → Mise en service, d'abord en essai pour quelques comptes. Les notes, le carnet, les TFE, les stages et les avis y viendront ensuite ; en attendant, ils restent dans Mes cours.",
      ],
    },
    {
      titre: "Mes visites de stage : dans l'agenda, avec le lieu de l'étudiant",
      pour: 'ens coo sec dir',
      ou: "Mes cours → rail → Mes visites de stage (secrétariat, coordination, direction : Organisation → Stages → Visites et trajets).",
      texte: "Le professeur de stage pose ses visites : [[Planifier une visite|IconPlus|fort]], il choisit le stage — l'étudiant et son lieu, repris de la fiche du stage, avec l'adresse —, la date, l'heure, le départ du trajet (l'école, le domicile ou un autre lieu) et les kilomètres aller-retour. La visite paraît dans Mon horaire de la semaine et dans l'agenda du téléphone (Mon horaire dans mon agenda), à l'adresse du lieu. Une fois faite, [[Faite|IconCheck]] la marque, avec ses kilomètres.",
      images: [{ src: "/guide/visites-planifier.png", legende: "Planifier une visite (données d'essai) : le stage, son adresse, la date, le départ et les kilomètres — Lucie propose ceux de la dernière visite au même lieu." },
        { src: "/guide/visites-semaine.png", legende: "Les visites dans Mon horaire de la semaine, liseré cyan, à côté des séances." }],
      savoir: [
        "Les stages proposés sont ceux dont vous êtes le professeur de stage (fiche de l'étudiant → onglet Stages). Un stage sans professeur désigné ne paraît pas.",
        "Lucie CALCULE les kilomètres aller-retour par la route (OpenStreetMap), depuis l'école, le domicile de la fiche ou l'adresse tapée, jusqu'au lieu de stage : ils se proposent dans le champ, « reprendre » les remet. Le chiffre tapé reste celui qui compte ; s'il s'écarte de plus de 10 % (et de plus de 3 km) de l'itinéraire calculé, la fiche le signale à la direction, sans bloquer la signature. Les adresses quittent Lucie le temps du calcul.",
        "Un départ « autre » se donne comme une adresse de fiche : code postal d’abord, qui propose la localité (bpost), puis la rue (BeST). Lucie cherche en Belgique d’abord, puis chez nos voisins, jamais plus loin ; un itinéraire de plus de 800 km aller-retour est refusé comme une adresse mal comprise.",
        "Sans calcul possible (adresse incomplète, service injoignable), Lucie le dit et propose la dernière distance tapée pour ce lieu.",
        "Une visite à venir ne se marque pas « faite » ; une visite faite ne se supprime pas (elle peut être annulée).",
        "Le secrétariat, la coordination (ses sections) et la direction voient et posent les visites de tous.",
      ],
    },
    {
      titre: "La fiche de transport du mois",
      pour: 'ens coo sec dir',
      ou: "Visites de stage (ou Organisation → Stages → Visites et trajets) → onglet « Fiche de transport ».",
      texte: "La fiche reprend les visites faites du mois : date, étudiant, lieu et adresse, départ et son adresse, kilomètres aller-retour et — si l'école rembourse vos déplacements — le montant (kilomètres × taux). La personne certifie ses déplacements ([[Je certifie|fort]]), puis la direction approuve ; la pièce sort par l'imprimante du bandeau, avec les deux signatures.",
      images: [{ src: "/guide/visites-fiche.png", legende: "La fiche d'octobre (données d'essai) : deux visites depuis le domicile, 140 km, 60,56 €." }],
      savoir: [
        "Lucie refuse de signer une fiche où manquent des kilomètres, où le taux n'est pas réglé, ou dont une visite part d'un autre départ que celui qui est remboursé.",
        "Chaque signature porte le nom de qui a cliqué et l'heure ; elle tombe si une visite du mois change, et se refait.",
        "Approuvée par la direction, la fiche verrouille le mois : ses visites ne se modifient plus.",
      ],
    },
    {
      titre: "Qui est remboursé, et depuis où",
      pour: 'sec dir',
      ou: "Organisation → Stages → Visites et trajets → onglet « Frais de déplacement » (secrétariat et direction).",
      texte: "Une ligne par professeur de stage : son adresse de domicile (fiche du professeur) et ce que l'école rembourse — rien, le trajet depuis l'école, ou le trajet depuis le domicile. Le taux au kilomètre se règle au-dessus, par la direction ; vide, il reste « à régler » et aucune fiche remboursée ne se signe.",
      images: [{ src: "/guide/visites-frais.png", legende: "Le taux et la règle de chacun (données d'essai)." }],
      savoir: [
        "Sans remboursement, la fiche se tient quand même (kilomètres, sans montant) : elle sert de trace des visites.",
      ],
    },
  ],
  moi: [
    {
      titre: "Mon thème : Maison IIP, Sombre, Métal ou Pastel",
      ou: "Barre du haut → la palette.",
      texte: "Chacun choisit l'aspect de Lucie pour lui-même : Maison IIP (les couleurs de l'école), Sombre (gris foncés, texte clair), Métal (blanc et gris d'Apple, sans bordure) ou Pastel (tons doux sur fond blanc). Le choix vaut pour vous seul, sur cet appareil ; il ne change rien pour les autres, ni aux pièces imprimées, qui gardent la charte de l'Institut.",
      images: [{ src: "/guide/moi-theme.png", etroite: true, legende: "La palette de la barre du haut : quatre thèmes, le vôtre coché." }],
      savoir: [
        "Les états gardent leur sens dans tous les thèmes : vert réussi, ocre à surveiller, brique à corriger, violet faveur.",
        "Sur iPad et téléphone, les quatre thèmes sont dans le menu déroulant de la barre.",
        "La direction règle les couleurs de l'école dans Configuration → Thèmes et couleurs ; Métal et Pastel peuvent aussi y être adoptés pour tout le monde.",
      ],
    },
  ],
  documentation: [
    {
      titre: "Le mode d'emploi en PDF : quatre versions, et ses annexes",
      ou: "Documentation → Mode d'emploi → les boutons PDF, à droite de la recherche.",
      texte: "Le PDF reprend tout le guide en ligne, dans la mise en page de l'Institut : couverture, mot de la direction, sommaire, un chapitre par partie, aide-mémoire. La direction en a quatre versions : [[Complet (direction) (PDF)|IconFileTypePdf]] — tout Lucie, Configuration comprise —, Secrétariat, Coordination et Enseignants ; chacun d'autre reçoit la sienne. Les versions direction, secrétariat et coordination se terminent par deux annexes : A, le catalogue de toutes les pièces que Lucie produit (plus de cent vingt, par domaine) ; B, leurs spécimens — la pièce elle-même, composée par Lucie sur un dossier inventé.",
      savoir: [
        "La première composition prend une à deux minutes (l'onglet le dit) ; ensuite le PDF ressort aussitôt, jusqu'à la version suivante de Lucie.",
        "Un spécimen ne porte jamais un vrai nom (« SPÉCIMEN Camille », unité 999) ni de QR d'authenticité : il dit « Spécimen — sans valeur ».",
        "Si le serveur ne parvient pas à composer le PDF, l'écran le dit : il ne sort jamais une autre mise en page à la place.",
      ],
    },
  ],
  config: [
    {
      titre: "Une seule bande pour les en-têtes, partout",
      pour: 'dir',
      ou: "Configuration → Thèmes et couleurs → Les surfaces · Formes et composants → Tableaux.",
      texte: "L'en-tête de chaque tableau, l'en-tête des cartes et des panneaux portent la même bande, réglée une fois : « En-têtes de tableau et de carte » (par défaut, le bleu de l'école très pâle). Les lignes qui regroupent et se replient (les sections des attributions, par exemple) ne sont pas des en-têtes : elles restent blanches, et ont leur propre réglage, « Lignes de regroupement ». La taille et la casse du texte d'en-tête, les filets, les lignes alternées et le survol se règlent dans Formes et composants → Tableaux — et valent pour TOUS les tableaux de Lucie, y compris les plus anciens.",
      savoir: [
        "Les textes publiés de la Documentation gardent les tableaux de leur document d'origine.",
      ],
    },
  ],
};
export const remplacements = {};
