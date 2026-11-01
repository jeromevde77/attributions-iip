// Domaine : PERSONNEL et ORGANISATION (clé `ecole`).
// Écrit d'après le code (frontend/src/pages/Professeurs.jsx, ProfFicheModal.jsx, components/DossierPersonnel.jsx,
// FonctionsPanel.jsx, NominationsPanel.jsx, ImportPersonnelFwb.jsx, pages/Demandes.jsx, Accueil.jsx ;
// pages/Organisation.jsx, Attributions.jsx, CentrePlanification.jsx, GrilleOrganisation.jsx, components/DatesUE.jsx,
// ComparerHoraire.jsx, CalendrierSessions.jsx, LaboratoireTemporel.jsx, GroupesCommuns.jsx, StructureSection.jsx,
// AtelierUE.jsx, CroisementUE.jsx, PonderationsUE.jsx, DUE.jsx, HoraireSemaine.jsx, Configuration.jsx (effectifs),
// Referentiels.jsx, AcquisUE.jsx, MotifsDefautUE.jsx ; backend routes/attributions.js, annuel.js, grille.js,
// dossierAdmin.js, dossiersRh.js, demandes.js, due.js, horaire.js, referentiels.js).

export const chapitres = [];

export const ajouts = {
  personnel: [
    {
      titre: "Chercher et filtrer la liste du personnel",
      ou: "Personnel → barre de la liste.",
      texte: "La recherche et la section restent sur la ligne ; le reste se range derrière [[Filtres|IconFilter]] : fonction (qui est secrétaire, qui coordonne quelle section cette année), statut (chargé de cours ou expert), contrat (IIP seul, HELB seul, IIP + HELB), charge (avec ou sans charge), fiche identité (un champ manquant ou présent : registre national, IBAN, adresse, titres…) et « Avec ancienneté ». Chaque filtre actif se lit en pastille sous la barre et se retire d'un clic. Les membres sans charge cette année sont regroupés au bas de la liste, dans un volet replié « Sans charge cette année ».",
      savoir: [
        "La colonne ETP additionne IIP et HELB ; le survol donne le détail (cours techniques / 800 + pratique professionnelle / 1000, comme Gestion).",
        "Un expert au-delà de 260 périodes à l'IIP porte la mention « > 260 p. » à côté de son ETP, « > 360 p. » au-delà du plafond avec dérogation (A28) : le survol rappelle la règle.",
        "« NEW » signale un membre engagé depuis moins de trente jours ; « À désigner » est la ligne d'attente des cours sans titulaire.",
        "Le filtre « Fiche identité » ne montre jamais les valeurs : seulement si le champ est rempli ou non.",
      ],
    },
    {
      titre: "Agir sur plusieurs membres à la fois",
      ou: "Personnel → cochez des membres dans la liste.",
      texte: "Dès qu'une case est cochée, la barre propose : [[Contrats PDF]] (un PDF par membre, en archive), [[Imprimer|IconPrinter]] (un seul PDF des fiches d'attributions, au choix Global IIP + HELB, Contrat IIP ou Contrat HELB), [[ZIP|IconDownload]] (un fichier par membre, mêmes trois choix), [[Accès Lucie]] et [[Coordonnées|fort]] (la liste imprimable des courriels, GSM et adresses). Chaque bouton porte entre parenthèses le nombre de cochés.",
      savoir: [
        "Contrats PDF : direction et secrétariat seulement.",
        "Une fiche d'attributions d'un seul membre se sort aussi depuis sa ligne, avec les mêmes trois choix (Global, IIP, HELB).",
      ],
    },
    {
      titre: "Ouvrir l'accès à Lucie à plusieurs membres",
      ou: "Personnel → cochez des membres → [[Accès Lucie]].",
      pour: 'dir',
      texte: "La fenêtre « Ouvrir l'accès à Lucie » vérifie d'abord, sans rien écrire, ce qui arrivera à chacun : nouveau compte, compte existant laissé tel quel, aucune adresse (à compléter dans la fiche), adresse déjà prise. La confirmation crée les comptes « professeur » manquants et envoie à chacun le lien pour choisir son mot de passe. Une case permet de renvoyer le lien à ceux qui ont déjà un compte mais ne se sont jamais connectés.",
      savoir: [
        "Réservé à qui a le droit de gérer les comptes.",
        "Un compte existant n'est jamais modifié par ce geste : seul le lien peut lui être renvoyé.",
        "Si un lien ne part pas, il s'affiche dans la fenêtre pour être transmis autrement.",
      ],
    },
    {
      titre: "Compléter les fiches depuis les fichiers de l'école",
      ou: "Personnel → rail → Compléter les fiches (fichiers de l'école).",
      pour: 'sec dir',
      texte: "On dépose le fichier des professeurs (matricule, nom, adresse, téléphones, courriels) et, si on l'a, la liste des diplômes. [[Simuler]] montre combien de personnes sont retrouvées et ce qui sera rempli ; [[Compléter les fiches|fort]] l'écrit. Lucie ne remplit que les cases vides (matricule, sexe et date de naissance lus du matricule, adresse, GSM, courriels) ; les diplômes deviennent des titres de capacité pour qui n'en a aucun.",
      savoir: [
        "Une valeur déjà présente qui diffère du fichier est signalée comme « désaccord », jamais remplacée — sauf si l'on coche « Le fichier fait foi pour les coordonnées ».",
        "Un courriel invalide (accent, espace) est toujours remplacé.",
        "Les personnes du fichier introuvables dans Lucie sont nommées.",
      ],
    },
    {
      titre: "La fiche de saisie, section par section",
      ou: "Personnel → fiche d'un membre → [[Modifier la fiche]] (ou rail → Nouveau membre).",
      pour: 'sec dir',
      texte: "La fiche se déplie en sections numérotées : 1 Identité civile · 2 Coordonnées & compte bancaire · 3 Titres de capacité · 4 Situation fiscale · 5 Personnes fiscalement à charge · 6 Données internes IIP · 6 bis Ancienneté (chargés de cours) · 6 ter Fonctions · 7 Règlement CE 883/2004 · 8 Disponibilités horaires · 9 Engagement à titre définitif. Les flèches du bandeau passent à la fiche voisine en enregistrant d'abord ; [[Enregistrer|fort]] garde la fiche ouverte pour continuer.",
      savoir: [
        "Rien n'est écrit avant [[Enregistrer|fort]] (ou [[Créer la fiche|fort]] pour un nouveau membre).",
        "L'ancienneté = le report historique saisi + l'acquis de l'année, calculé par Lucie (décret du 1er février 1993 : 360 jours à partir d'une demi-charge, 180 jours à partir de 40 périodes), au niveau du pouvoir organisateur et cours par cours.",
        "Marié(e) ou cohabitant(e) légal(e) : sans la déclaration de précompte professionnel, les enfants ne sont pas renseignés à charge — la fiche le rappelle.",
        "Les sections 8 et 9 et les fonctions n'existent qu'une fois la fiche créée.",
      ],
    },
    {
      titre: "Lire la carte d'identité (eID)",
      ou: "Fiche de saisie → en tête, « Pré-remplir depuis la carte eID » → [[Lire la carte|fort]].",
      pour: 'sec dir',
      texte: "Avec un lecteur de carte et l'application « eID Reader » lancée sur l'ordinateur, Lucie lit l'identité et l'adresse de la carte et pré-remplit les champs. Elle dit à chaque instant où elle en est : connexion au lecteur, « Insérez votre carte », lecture, puis le nombre de champs remplis.",
      savoir: [
        "Les champs restent modifiables et rien n'est enregistré tant qu'on ne valide pas la fiche.",
        "Message « Service eID non joignable » : l'application n'est pas lancée, ou son certificat n'a pas été approuvé (menu de l'application, « Approuver le certificat »).",
        "Sans carte lisible après 30 secondes, la lecture s'arrête ; [[Annuler]] l'interrompt à tout moment.",
      ],
    },
    {
      titre: "Disponibilités horaires d'un enseignant",
      ou: "Fiche de saisie → 8 · Disponibilités horaires.",
      pour: 'sec coo dir',
      texte: "La semaine type de l'enseignant, posée sur les blocs de cours de l'école, pour Q1 et pour Q2. Un clic fait tourner la case : disponible, éventuellement, pas disponible. [[Tout vert]] remet tout disponible ; « Enregistrer Q1 » (ou Q2) enregistre le quadrimestre affiché.",
      savoir: [
        "Cet agenda vaut pour toutes les sections où la personne enseigne : c'est le même que l'étape 5 du laboratoire temporel.",
        "Chaque quadrimestre s'enregistre séparément.",
      ],
    },
    {
      titre: "Nominations, congé et remise au travail",
      ou: "Fiche de saisie → 9 · Engagement à titre définitif.",
      pour: 'sec dir',
      texte: "On y règle le statut de nomination (temporaire, temporaire prioritaire, engagé à titre définitif) et le statut HELB, puis on liste les nominations (« + Ajouter une nomination » : code FWB, UE, cours, périodes, type de charge). Lucie calcule la couverture en équivalent ETP : ce qui est nommé face à ce qui est attribué cette année, et ce qui manque. « Mettre en congé (C) » place toutes les heures de la personne en congé et crée une ligne de remplacement « À désigner » pour chacune.",
      savoir: [
        "Quand une UE nommée n'est plus organisée, l'icône de remise au travail ouvre une fenêtre : on réaffecte les périodes vers un cours (ou en autonomie) et [[Remettre au travail|fort]] crée une ligne marquée RT.",
        "Dans ses attributions, on peut aussi cocher celles qui sont de la remise au travail.",
        "Code FWB inconnu : le cours et les périodes se saisissent librement.",
        "Dans Organisation → Attributions, une ligne couverte par une nomination définitive porte un cadenas.",
      ],
    },
    {
      titre: "Fiche — l'onglet Attributions et la colonne de charge",
      ou: "Personnel → cliquez un nom → onglet « Attributions ».",
      texte: "À gauche, la charge : l'ETP total (IIP + HELB), son détail par type — périodes de cours techniques sur 800, de pratique professionnelle sur 1000, autonomie comprise —, les périodes IIP et leur équivalent en heures, les heures HELB, l'ancienneté au pouvoir organisateur et les fonctions de l'année. À droite, une ligne par cours attribué : contrat (IIP ou HELB), section, UE, cours, activité, type, groupes, total de périodes et heures. Les flèches du bandeau passent au membre voisin ; l'avion ouvre ses pièces dans Éditions.",
      savoir: [
        "Au survol d'une ligne : éditer le cours (direction et secrétariat), ou « Désattribuer tous les groupes » de ce cours après confirmation.",
        "Le HELB se compte en heures réelles, pas en périodes converties.",
        "Une période vaut 50 minutes : la conversion en heures sert à comparer avec le HELB.",
      ],
    },
    {
      titre: "Fiche — Dossier admin. : les pièces du dossier",
      ou: "Personnel → fiche → onglet « Dossier admin. ».",
      pour: 'sec dir',
      texte: "La liste des pièces attendues au dossier administratif, avec leur base légale, une jauge « n / N pièces » et le nombre de manquantes. Poser la date de réception marque la pièce « Au dossier » ; « GEDI » la marque transmise (avec la date du jour) ; « N/A » la marque non requise. Les états : Manquante, À demander, Au dossier, Transmise, Non requise, Expirée.",
      savoir: [
        "Une pièce non obligatoire pour le statut du membre (par exemple un expert) paraît d'office « Non requise ».",
        "Le titre de capacité encodé sur la fiche compte d'office comme reçu.",
        "Une pièce dont la date d'expiration est passée (extrait de casier) redevient « Expirée ».",
        "Écrire : direction et secrétariat ; les autres lisent.",
      ],
    },
    {
      titre: "Fiche — Absences",
      ou: "Personnel → fiche → onglet « Absences » → [[Déclarer une absence|IconPlus|fort]].",
      pour: 'sec dir',
      texte: "Type (maladie d'un jour ou plus, maternité, accident du travail ou hors service, absence non justifiée, grève, congé, autre), début, fin et code CAD / DI. L'en-tête compte les jours de l'année. Sur chaque absence, deux boutons se basculent d'un clic : « CAMMAT » (déclarée ou non) et « Certificat » (reçu ou non) ; « Remplacement requis » s'affiche quand il le faut.",
      savoir: [
        "L'enregistrement crée les échéances liées dans l'échéancier : la déclaration CAMMAT et, au-delà de dix jours ouvrables, l'organisation du remplacement.",
        "La fin ne peut précéder le début : le serveur refuse.",
        "Chaque absence entre aussi dans « Journal & entretiens ».",
      ],
    },
    {
      titre: "Fiche — Journal & entretiens",
      ou: "Personnel → fiche → onglet « Journal & entretiens ».",
      pour: 'sec dir',
      texte: "Une chronologie unique du dossier : les remarques datées qu'on y écrit ([[Ajouter au journal|fort]]), les rendez-vous ([[Planifier un rendez-vous|IconCalendarPlus]] : entretien de suivi, d'accueil, visite en classe, évaluation, recadrage, fin de fonction ; date, mené par, lieu), et, d'eux-mêmes, les absences, les pièces reçues ou transmises, les nominations définitives et l'entrée en fonction.",
      savoir: [
        "Une remarque est inaltérable après enregistrement ; seul l'administrateur peut la supprimer.",
        "Cochée « Confidentielle », elle n'est lisible dans Lucie que par l'administrateur et son auteur ; les autres voient « Remarque confidentielle ».",
        "La mention confidentielle ne retire pas au membre son droit légal de consulter son dossier.",
      ],
    },
    {
      titre: "Fiche — Fonctions de l'année",
      ou: "Personnel → fiche → onglet « Fonctions » (aussi dans la fiche de saisie, 6 ter).",
      pour: 'dir',
      texte: "Les fonctions que la personne tient cette année — direction, secrétariat, coordinations… —, par établissement ou par section : on coche la fonction et on indique son ETP (1 = temps plein), et pour une section la part financée par la HELB. « + Une fonction dans une autre section… » ouvre une section de plus.",
      savoir: [
        "L'ETP d'une fonction fait le coût des fonctions dans le « Rapport statistique ».",
        "Le filtre « Fonction » de la liste du personnel lit ce qui est coché ici.",
        "Régler : direction et secrétariat ; l'onglet de la fiche de consultation n'est montré qu'à la direction.",
      ],
    },
    {
      titre: "Fiche — Accès Lucie",
      ou: "Personnel → fiche → onglet « Accès Lucie ».",
      pour: 'dir',
      texte: "Sans compte : l'adresse de connexion (déduite du nom si la fiche n'en porte pas — à vérifier), le rôle, le périmètre et les droits par module, puis [[Créer l'accès & générer le mot de passe|IconPlus|fort]] — le mot de passe s'affiche une fois, à noter. Avec un compte : modifier l'adresse, le rôle, le périmètre et les droits ([[Sauvegarder|fort]]), [[Envoyer le lien|IconMail]] pour que la personne choisisse son mot de passe, et « Désactiver » ou « Réactiver ».",
      savoir: [
        "Chaque module se règle en Lecture, Écriture, Tout (toutes les sections) et, pour la direction, Valider.",
        "Le périmètre par sections vaut pour tous les modules et pour tous les rôles ; sans section, le compte ne voit rien. La direction n'est pas cloisonnable.",
        "Un compte désactivé reste listé et se réactive au même endroit.",
      ],
    },
    {
      titre: "Fiche — Disciplinaire : fin de contrat et dossier disciplinaire",
      ou: "Personnel → fiche → onglet « Disciplinaire ».",
      pour: 'dir',
      texte: "Deux sortes de dossiers RH, confidentiels : [[Fin de contrat]] (date d'ouverture, motif — fin de CDD, démission, licenciement, retraite, mutation, autre —, notes) et [[Dossier disciplinaire]] (date d'ouverture, notes), puis [[Ouvrir le dossier|fort]]. Un dossier disciplinaire avance par étapes datées ([[Étape|IconPlus]]) : ouverture, convocation, audition, décision, recours, clôture, chacune avec son auteur et ses notes.",
      savoir: [
        "Visible seulement par la direction (geste « dossiers RH »).",
        "Une étape « Clôture » ferme le dossier à sa date ; on n'y ajoute plus d'étape.",
        "Un dossier se supprime après confirmation : c'est définitif.",
      ],
    },
    {
      titre: "Valider les corrections proposées (Demandes)",
      ou: "Tableau de bord → bloc « À valider » → Ouvrir.",
      pour: 'dir',
      texte: "Les modifications proposées par les coordinations (dates d'UE) et par les enseignants (leur propre fiche : coordonnées, état civil, compte, situation fiscale, titres) attendent ici. Chaque demande montre l'avant et l'après, champ par champ, qui l'a faite et quand. [[Valider|IconCheck|fort]] l'applique aussitôt ; [[Refuser|IconX]] demande un motif, que l'auteur verra. Trois faces : En attente · Validées · Refusées.",
      savoir: [
        "Le bloc n'apparaît à l'Accueil que s'il y a quelque chose à trancher, et seulement pour la direction.",
        "Une demande tranchée ne se retranche pas ; son auteur peut retirer la sienne tant qu'elle attend.",
        "Les titres de capacité proposés remplacent la liste en place.",
      ],
    },
    {
      titre: "Expert et chargé de cours : deux contrats",
      ou: "L'avion → Éditions → Personnel → « Pièces par membre ».",
      pour: 'sec dir',
      texte: "Un même membre peut être chargé de cours sur une charge et expert sur une autre. Le contrat de travail classique ne porte que ses périodes de chargé de cours ; ses périodes d'expert vont sur un contrat d'emploi d'expert, un par niveau (supérieur, secondaire), parce que la période n'y est pas rétribuée au même taux. Éditions dit d'emblée si le membre est expert, chargé de cours ou les deux, et propose les pièces qui lui reviennent.",
      savoir: [
        "Quand le contrat classique écarte des lignes d'expert, l'aperçu le dit et les nomme : elles relèvent du contrat d'expert, à établir.",
        "Le statut (CC ou EXP) appartient à la personne ; une ligne d'attribution peut porter une exception (voir Organisation → Attributions).",
      ],
    },
  ],

  organisation: [
    {
      titre: "Attributions — la grille, colonne par colonne",
      ou: "Organisation → Attributions.",
      texte: "Chaque ligne porte : la validation (« Val. »), le contrat (IIP ou HELB), le groupe, le professeur (liste), le statut (« Stat. » : CC ou EXP), le titre (requis, suffisant, pénurie…), pour une ligne HELB sa nature (MFP, MA), les périodes et l'autonomie attribuées, puis le total et les heures, calculés. Un clic sur le cours, l'UE ou le total ouvre la ligne complète. La vue « à plat » ajoute section, UE, bloc, organisation, quadrimestre, type et la conformité du cours au dossier pédagogique.",
      savoir: [
        "Changer le statut d'une ligne demande d'abord ce qu'on modifie : le statut général de la personne (toutes ses charges), ou une exception pour cette seule attribution — qui peut ensuite se retirer.",
        "Pastilles à côté du professeur : R (remplacement d'un titulaire en congé), RT (remise au travail), cadenas (nomination définitive), cadenas ouvert (un autre est nommé à titre définitif sur ce cours), EXT (couvert par l'enveloppe externe), DOT (dépasse le plafond, sur la dotation organique).",
        "Le bouton Heures / Périodes bascule l'unité d'affichage de toute la grille.",
        "Filtres : professeur, tronc commun (uniquement ou hors), recherche libre ; [[Réinitialiser]].",
      ],
    },
    {
      titre: "Attributions — valider ce qu'une coordination a encodé",
      ou: "Organisation → Attributions → colonne « Val. ».",
      pour: 'coo dir',
      texte: "Une attribution créée ou modifiée par une coordination s'écrit tout de suite, mais repasse « à valider » : sa case « Val. » est décochée et la ligne est signalée. La direction (ou la direction adjointe, ou qui a reçu le droit de valider) coche la case pour valider ; la décocher invalide. Les autres voient la case grisée : « En attente de validation par la direction ».",
      savoir: [
        "Toute nouvelle modification par une coordination — y compris une note — fait retomber la validation.",
        "La validation garde qui l'a posée et quand.",
      ],
    },
    {
      titre: "Attributions — le menu d'une UE",
      ou: "Organisation → Attributions → « + » sur l'en-tête d'une UE.",
      texte: "Le menu de l'UE propose : une ligne sur un cours existant, « Rétablir » un cours du dossier pédagogique resté sans ligne, « Nouveau cours dans cette UE », « Lignes EPT (95-99) » (les lignes d'encadrement de l'épreuve, code et périodes), « Organisations (Doc A) » (début, fin, semaines, UE sur deux ans, intervention extérieure, pour chaque organisation), « Répartir entre organisations » et « DOC2 / DOC3 » (la déclaration de la dotation de l'UE, à imprimer). Sur l'en-tête : le quadrimestre et le numéro d'organisation se changent d'un clic ; « Réouvrir cette UE » crée l'organisation suivante.",
      savoir: [
        "Un bandeau « Autonomie » ne paraît que pour un écart : sous le plancher, au-delà du plafond, ou mal répartie entre cours.",
        "Les cours du dossier pédagogique sans aucune ligne sont listés « à rétablir » : un cours ne disparaît pas.",
      ],
    },
    {
      titre: "Attributions — organiser les groupes",
      ou: "Organisation → Attributions → icône des groupes sur une UE (ou sur la section, pour toutes ses UE).",
      texte: "Pour chaque cours, trois façons de se donner : « Ts » (tous ensemble, un professeur), « Split » (le même groupe partagé entre plusieurs professeurs) ou « Groupes » (étudiants répartis A, B, C… avec leur nombre). On peut aussi créer d'un coup une organisation 2, et changer la lettre d'un groupe. La fenêtre compte les changements avant de les appliquer.",
      savoir: [
        "Les lettres d'un cours doivent se suivre depuis A, sans trou ; une même lettre peut revenir (deux professeurs sur un même groupe).",
        "Changer de mode ou de nombre de groupes refait les lignes du cours.",
      ],
    },
    {
      titre: "Attributions — outils de la section",
      ou: "Organisation → Attributions → icônes de l'en-tête de section ; barre de l'écran.",
      texte: "Sur l'en-tête de chaque section : remplir automatiquement les périodes (chaque ligne encore à zéro reçoit les périodes du cours au dossier), organiser les groupes de toutes ses UE, le rapport d'attributions à imprimer, l'export Excel, retirer la section de la vue. Dans la barre : « Copier section » recopie les attributions d'une section d'une année vers une autre, professeurs compris.",
      savoir: [
        "« Copier section » refuse si la destination porte déjà des attributions ; seul l'administrateur peut forcer (les existantes sont alors supprimées et recopiées).",
        "Supprimer toutes les attributions d'une section (direction) demande de taper le nom de la section et fait une sauvegarde d'abord ; le référentiel (UE, cours) n'est pas touché.",
        "Les suppressions en masse (sélection, filtre, tout) demandent de taper SUPPRIMER et sont irréversibles.",
        "Seuls la direction et le secrétariat copient une section ; coordination comprise pour remplir les périodes, réouvrir une UE ou mettre en congé, dans son périmètre.",
      ],
    },
    {
      titre: "Attributions — les activités Z",
      ou: "Organisation → Attributions.",
      texte: "Les activités de développement professionnel (périodes Z, AESI) figurent dans la grille en lignes à part, sans enseignant, à zéro période attribuée : ce sont des périodes de l'étudiant, en autonomie. Elles ne se modifient pas ici.",
      savoir: [
        "Elles ne comptent ni dans la charge, ni dans la dotation, ni dans le poids d'un cours dans son unité.",
        "Elles sortent aussi de la grille d'organisation.",
      ],
    },
    {
      titre: "La grille d'organisation : découper un cours",
      ou: "Organisation → Planification → « Planification des UE et cours » → choisir la section → déplier une UE → cliquer un cours.",
      texte: "Chaque UE est une barre sur les semaines de l'année : sa longueur est sa durée, son épaisseur sa charge hebdomadaire. Le cours s'ouvre dans une fenêtre : ses activités (théorie, TP, remédiation, évaluation…) avec leurs périodes et, pour chacune, « Vue étudiant » (sur un stage, les heures d'encadrement du superviseur ne sont pas celles de l'étudiant). On choisit « Examen de fin d'UE » ou « Évaluation continue », et l'on glisse l'autonomie posée sur ce cours. [[Enregistrer|IconDeviceFloppy|fort]].",
      savoir: [
        "Le pied dit si les périodes du cours tombent sur un multiple du dossier pédagogique, ou combien il manque ; l'autonomie est comptée à part.",
        "Sans activité, le cours revient à son contenu du dossier : on ne supprime pas un cours.",
        "Placer plus d'autonomie que l'unité n'en porte est signalé.",
        "« Vue professeurs » / « Vue étudiants » bascule la lecture de toute la grille ; en tête, les UE qui ne respectent pas la règle des multiples et celles « sans dates — à poser ».",
      ],
    },
    {
      titre: "Dates des UE",
      ou: "Organisation → Planification → « Dates des UE ».",
      texte: "Le début et la fin de chaque organisation d'UE, en tableau ou en ligne du temps, par section, numéro, quadrimestre ou date de début. Les tuiles comptent les organisations, celles datées, celles sans dates et les incohérentes (fin avant début, un clic n'affiche qu'elles). [[Initialiser depuis les attributions|IconPlus]] crée une organisation sans dates pour chaque UE attribuée ; [[Reprendre l'an dernier]] pré-remplit les dates manquantes avec celles de l'an dernier décalées de 52 semaines ; [[Enregistrer|IconDeviceFloppy|fort]] porte le nombre de modifications.",
      savoir: [
        "Ces dates déclenchent le comptage au premier dixième, le conseil des études, la publication des résultats et les fenêtres de recours : l'icône de chaque ligne montre les échéances qu'elles génèrent.",
        "Une fin avant le début est refusée.",
        "Saisies par une coordination, les dates partent en demande : elles ne changent qu'après validation par la direction (« À valider »).",
        "Reprendre l'an dernier ne touche pas aux organisations déjà datées ; les dates obtenues sont à vérifier.",
      ],
    },
    {
      titre: "Comparer les dates des UE à l'horaire réel",
      ou: "Organisation → Planification → « Dates des UE » → [[Comparer à l'horaire réel|IconCalendar]].",
      texte: "Pour chaque organisation : ses dates, la première et la dernière séance de l'horaire, le premier dixième calculé sur les dates (RGE) et sur l'horaire (méthode de la vérificatrice), et les séances tombées hors des dates. Les faces filtrent : À voir · Écart · Sans dates · Plusieurs org. · Alignées · Sans séance · Toutes. On coche, puis [[Aligner les dates sur l'horaire|fort]] : la première et la dernière séance deviennent l'ouverture et la fermeture.",
      savoir: [
        "Alignées, les deux méthodes du premier dixième donnent le même jour.",
        "Une UE en plusieurs organisations ne s'aligne pas d'office : l'horaire ne dit pas quelle séance appartient à quelle organisation.",
        "Une séance hors des dates se corrige dans l'horaire. L'alignement d'une coordination part en demande, comme toute date d'UE.",
      ],
    },
    {
      titre: "Le calendrier des sessions",
      ou: "Organisation → Planification → « Sessions ».",
      texte: "Pour une section, les deux sessions l'une sous l'autre (ou côte à côte) : par UE, la date et l'heure de la délibération ; par cours, la date, l'heure et le local de l'épreuve et de la visite des copies. On coche des unités et la barre « Poser sur … cochée(s) » applique d'un coup une même valeur (session, champ, valeur). Recherche « Unité ou cours… », [[Tout cocher]], « Tout déplier ».",
      savoir: [
        "La délibération se pose par unité, l'épreuve et la visite des copies par cours : deux professeurs qui n'interrogent pas le même jour ne montrent pas les copies le même jour.",
        "Ces dates sont celles que lisent la délibération et les rappels.",
      ],
    },
    {
      titre: "Laboratoire, étape 2 : le temps, les couches, le verre",
      ou: "Organisation → Le laboratoire temporel → 2. Le temps (faces L'année · Les couches · Une UE).",
      texte: "L'année : chaque UE est une tuile posée sur ses semaines ; on la glisse ou on tire ses bords pour poser ses dates. Cliquer une tuile ouvre sa fiche : nombre d'étudiants, cohorte qu'elle sert, « Dédoubler », « Retirer l'org », et pour un stage « Stage bloquant » (aucun cours du bloc pendant ses semaines) ; pour une UE, « Donner cours pendant les congés ». [[Ouvrir le verre de l'UE|fort]] montre ses cours remplis de leurs activités : on y glisse une activité, on tire une couche pour changer ses périodes, on règle le nombre de groupes.",
      savoir: [
        "La burette, c'est l'autonomie de l'UE : un cours qui dépasse son verre y puise, et ne peut jamais prendre plus qu'elle ne contient.",
        "Toute l'autonomie doit être dépensée : à l'enregistrement, le reste se répartit sur les activités, devient une activité, ou se met de côté avec un motif — le laboratoire montre ce qui est mis de côté au niveau de la section.",
        "« Verres côte à côte » compare plusieurs UE à la même échelle.",
        "Une date posée par une coordination part en demande : la tuile reste où elle était jusqu'à la validation.",
      ],
    },
    {
      titre: "Laboratoire, étape 3 : les groupes en briques",
      ou: "Organisation → Le laboratoire temporel → 3. Les groupes (choisir un bloc).",
      texte: "Le bloc se coupe en briques ; chaque groupe de chaque activité est un assemblage fixe de briques, pour que les groupes de tous les cours s'emboîtent à l'horaire. [[Proposer les briques]] répartit les étudiants, on ajuste en glissant un étudiant d'une brique à l'autre (tous ses groupes suivent), [[Enregistrer|IconDeviceFloppy]], puis « Remplir les groupes… » montre d'abord ce qui sera placé ou changé, et [[Écrire ces groupes|fort]] l'écrit.",
      savoir: [
        "Le nombre de groupes de chaque activité est celui des attributions ; son quadrimestre se règle sur la ligne.",
        "« Plan des groupes » : glisser une barre sur une autre de sa ligne échange deux groupes.",
      ],
    },
    {
      titre: "Laboratoire, étape 6 : la semaine, du plan à l'horaire",
      ou: "Organisation → Le laboratoire temporel → 6. La semaine (choisir un bloc).",
      texte: "« Ouvrir le plan de l'année » : Lucie simule l'année (semaines de cours, congés et fériés déduits, un enseignant et une brique jamais à deux endroits) et propose ce qui n'est pas encore au plan. [[Adopter la proposition|fort]] l'enregistre ; changer le créneau ou le local d'une ligne la verrouille, et « Recalculer autour du verrouillé » repropose le reste. « Verser le plan dans l'horaire » écrit les séances dans l'horaire de la semaine à partir d'une date ; « Rétablir l'horaire importé » défait ce remplacement.",
      savoir: [
        "Adopter n'écrit rien dans l'horaire : seul le versement le fait.",
        "Les séances passées ne changent pas ; celles retouchées à la main restent telles quelles ; seules les séances adoptées sont versées.",
        "Un horaire importé (Hyperplanning) n'est remplacé que si on le choisit ; il est mis à l'abri et se rétablit.",
        "« Locaux des activités » : la liste des locaux possibles par activité, le premier étant le préféré.",
      ],
    },
    {
      titre: "Laboratoire : organisation de base, verres, sauvegardes et grand nettoyage",
      ou: "Organisation → Le laboratoire temporel → barre du haut.",
      texte: "[[Organisation de base]] : Lucie propose les dates de chaque UE d'après le schéma de capitalisation, le quadrimestre prévu et l'épreuve intégrée ; on lit la liste et les alertes, puis on pose seulement les UE sans dates ou on remplace tout. « Remplir les verres depuis les attributions » reprend activités, groupes et périodes déjà attribués. [[Sauvegardes]] restaure un état antérieur du laboratoire. [[Grand nettoyage du labo|IconTrash]] vide le laboratoire de la section, en gardant ou non les dates des UE, puis propose de réimporter.",
      savoir: [
        "Organisation de base : seule l'organisation 1 est proposée ; un prérequis du même bloc se termine avant l'UE qui en dépend ; ce qui ne tient pas est nommé. Tout remplacer sauvegarde d'abord.",
        "Remplir les verres : les cours déjà découpés ne sont remplacés que si on le demande.",
        "Le grand nettoyage sauvegarde d'abord (le numéro de sauvegarde est donné) ; une restauration sauvegarde aussi l'état qu'elle remplace : elle se défait.",
        "Coordination comprise, pour sa section.",
      ],
    },
    {
      titre: "Le schéma de capitalisation : l'écran",
      ou: "Organisation → Schéma de capitalisation.",
      texte: "Par section et par cohorte, les UE rangées par bloc avec leurs prérequis. Un clic sur une UE propose « placer en » un bloc et son quadrimestre prévu. [[Reprendre l'an dernier|IconCopy]] recopie les placements de l'année précédente (cohorte 1). [[Imprimer le schéma|IconSend]] sort le dessin en A4 paysage. « Mise en route de la section » ouvre l'assistant qui liste les étapes pour démarrer une section. Les « Incohérences de progression » (un prérequis placé après l'UE qui en dépend) s'affichent au-dessus.",
      savoir: [
        "Les liens de prérequis relèvent du référentiel : ils se règlent dans Configuration → Prérequis d'UE et valent pour toutes les années.",
        "Le bloc d'une UE change le schéma, la grille de parcours et la proposition de PAE des étudiants de la section, pour l'année seulement.",
        "Pour une cohorte autre que la 1 : « + Ajouter une UE à cette cohorte… », « Retirer de la cohorte », « Supprimer la cohorte ».",
      ],
    },
    {
      titre: "Unité, étape 1 : croiser les acquis et le programme",
      ou: "Organisation → Unité : croiser, pondérer, décrire → 1. Croiser les acquis et le programme.",
      texte: "On choisit l'unité (section, liste ou numéro tapé). Pour chaque cours, une grille : tous les acquis de l'unité en colonnes, tous les points de son programme en lignes ; on coche quels acquis sert chaque point, on ajoute un point si besoin. [[Enregistrer|IconDeviceFloppy|fort]] en tire la pondération (étape 2) et le tableau des critères du descriptif (étape 3).",
      savoir: [
        "La frise des trois étapes se lit des traces : une étape s'ouvre quand la précédente est faite. La direction peut les consulter dans le désordre sans rien valider.",
        "Une croix retirée retire sa ligne de critères tant qu'aucun indicateur n'y a été écrit ; les lignes posées à la main ne sont jamais touchées.",
        "Le croisement suit le descriptif : validé, il passe en lecture seule.",
      ],
    },
    {
      titre: "Unité, étape 2 : pondérer",
      ou: "Organisation → Unité : croiser, pondérer, décrire → 2. Pondérer.",
      pour: 'sec dir',
      texte: "Trois zones : A, l'unité d'un coup d'œil (cours évalués, acquis reliés à un cours, cours à 10 points, base du poids des cours) ; B, qui évalue quel acquis, avec le poids réel de chaque acquis dans la note d'unité ; C, un cours et ses dix points répartis entre ses acquis, par pas de 0,5. La base du poids des cours est « Poids = périodes du DP » ou « Poids saisis (exception) », pour l'année seulement. [[Reprendre de]] l'année précédente ; « Relier au tracé » relie acquis et cours en traçant les liens.",
      savoir: [
        "Un cours ne s'enregistre qu'à dix points exactement ; des poids saisis doivent totaliser 100 %.",
        "Une année reprise des classeurs se lit sans se modifier : ses délibérations sont tenues.",
        "Pour une épreuve intégrée, les acquis se pèsent pour l'unité, sans cours, au tracé.",
        "Régler : direction et secrétariat ; les pondérations se fixent par la direction et se gèlent avec la validation du descriptif.",
      ],
    },
    {
      titre: "Unité, étape 3 : décrire l'unité (DUE)",
      ou: "Organisation → Unité : croiser, pondérer, décrire → 3. Décrire l'unité (DUE).",
      texte: "Le descriptif de l'unité pour l'année, en deux modes : « Rédiger » et « Aperçu ». La partie reprise du dossier pédagogique peut être remplacée par celle du dossier ; le programme, les critères et le mode d'évaluation se rédigent. Le rédacteur [[Soumettre à la direction]] (ou retire sa soumission) ; la direction [[Valider|IconLock]] ou [[Rouvrir|IconLockOpen]].",
      savoir: [
        "La direction ne valide que ce qui est soumis par son rédacteur et dont les pondérations sont fixées ; sinon le serveur dit ce qui manque.",
        "Validée, la DUE passe en lecture seule et gèle les pondérations ; la rouvrir est réservé à la direction.",
        "Le mode d'évaluation se règle par la coordination ou la direction.",
      ],
    },
    {
      titre: "Horaires : retoucher une séance",
      ou: "Organisation → Horaires → Composer la semaine → cliquer une séance.",
      texte: "La séance s'ouvre : local, durée, « Séance annulée » (elle reste visible, barrée, et ne compte plus dans les heures posées) et remarque, puis [[Enregistrer|fort]] ou [[Supprimer|IconTrash]]. Le pied dit si la séance vient d'un import, qui l'a posée et qui l'a modifiée. Sur la grille, une séance en conflit est cerclée, et la liste des conflits de la semaine s'affiche sous la grille.",
      savoir: [
        "Composer : coordination, secrétariat et direction ; les autres lisent.",
        "Les flèches et le champ de date changent de semaine ; Classe · Professeur · Local change de lecture.",
        "Sans groupe dans les attributions, aucune classe n'existe : l'horaire se construit sur les groupes.",
      ],
    },
    {
      titre: "Horaires : recopier une semaine, importer d'Hyperplanning",
      ou: "Organisation → Horaires → Composer la semaine → vue Classe.",
      texte: "[[Recopier cette semaine…|IconCopy]] : on coche les semaines cibles (ou « Cocher toutes les semaines de cours suivantes »), [[Vérifier|fort]] dit, semaine par semaine, combien de séances seront créées et pourquoi certaines ne le seront pas, puis « Recopier N séance(s) ». [[Importer d'Hyperplanning…|IconUpload]] lit l'export « liste » : tout le fichier ou la seule classe affichée ; [[Vérifier|fort]] montre la correspondance des classes, les cours non reconnus et les professeurs inconnus, puis « Importer N séance(s) ».",
      savoir: [
        "La recopie saute les semaines sans cours, les jours fériés et les séances déjà posées : elle ne double rien.",
        "Un cours non reconnu est importé avec son libellé ; un professeur inconnu garde son nom en texte — corrigez l'orthographe dans sa fiche.",
        "Rien n'est écrit avant la confirmation.",
      ],
    },
    {
      titre: "Effectifs et postes PNCC",
      ou: "Organisation → Effectifs et postes PNCC.",
      texte: "Par année et par section, le nombre d'étudiants de chaque UE, rangées par bloc, avec les totaux par bloc et pour la section. Deux modes de saisie : « Par UE » (case par case, enregistrée en quittant la case, ou [[Sauvegarder tout|IconCheck|fort]]) et « Par section » (un total, puis « Répartir » au prorata des périodes de chaque UE, ou « Uniforme » : le même nombre partout). Dessous, les postes PNCC (personnel non chargé de cours) de l'année : secrétariat étudiant, secrétariat RH, direction, économat, autre, avec leur ETP.",
      savoir: [
        "Le secrétariat étudiant est proratisé par section pour le ratio étudiants / ETP.",
        "« Ajouter un poste » : la fonction, et la personne si on la connaît.",
      ],
    },
    {
      titre: "La fiche d'une UE au référentiel : cinq onglets",
      ou: "Configuration → Unités et cours → cliquer une UE.",
      pour: 'dir',
      texte: "Fiche (identification officielle : numéro, code FWB, niveau, bloc, ECTS ; sections de rattachement ; nom, quadrimestre, tronc commun, prérequis ; charge : autonomie, périodes étudiant, périodes Z ; cases « UE déterminante », « Épreuve intégrée de fin de section », « Unité hors cursus » ; à droite, l'horaire minimum du dossier) · Contenu (finalités, capacités préalables) · Acquis · Programme (une introduction commune, puis un éditeur par cours) · Organisation (constitution des groupes, chargés de cours). [[Enregistrer|fort]] dans le pied.",
      savoir: [
        "Une rubrique retouchée dans Lucie porte la mention « modifiée dans Lucie », qui montre la version lue du dossier ; seules les rubriques touchées partent à l'enregistrement.",
        "Les rubriques du dossier se modifient par la direction ; les cours se règlent dans Unités et cours.",
        "« Unité hors cursus » : ses dossiers se comptent dans la section de l'étudiant, pas dans celle de l'unité.",
      ],
    },
    {
      titre: "Les acquis d'une UE et leur motif d'échec",
      ou: "Configuration → Unités et cours → fiche de l'UE → onglet « Acquis ».",
      pour: 'dir',
      texte: "À gauche, le texte du dossier (acquis et degré de maîtrise) ; à droite, les acquis encodés dans Lucie, présentés comme dans le dossier : on les range en glissant, on les introduit par des chapeaux (« face à… », [[Chapeau|IconPlus]]), on en ajoute ([[Acquis|IconPlus]]), on corrige un code ou un libellé, on les renumérote ([[Renuméroter]] réécrit AA333.1, AA333.2… partout où ils sont cités). Dessous, « Motif proposé en cas d'échec, par acquis » : la phrase que la délibération proposera quand l'acquis est en échec et que le motif reste vide.",
      savoir: [
        "Ranger, chapeauter et corriger les acquis est réservé à la direction : ils viennent du dossier approuvé.",
        "Supprimer un acquis déjà évalué : Lucie dit d'abord ce qui serait emporté.",
        "Le motif proposé n'est jamais écrit d'office : il est proposé, et le Conseil le confirme ou le réécrit.",
        "Renuméroter demande d'avoir enregistré la mise en forme : les codes suivent l'ordre enregistré.",
      ],
    },
    {
      titre: "Forcer le numéro d'une UE",
      ou: "Configuration → Unités et cours → fiche de l'UE → crayon à côté du numéro → Portée.",
      pour: 'dir',
      texte: "Deux portées. « Toutes les années » : l'unité a toujours porté ce numéro (correction) — cours, acquis et tout ce qui s'y rattache sont renumérotés partout. « À partir de l'année de travail » : un nouveau numéro officiel FWB ; les années d'avant gardent l'ancien, les acquis et les textes du dossier sont copiés sous le nouveau numéro. Dans les deux cas, Lucie montre d'abord combien de lignes changeront, table par table, puis [[Forcer|fort]] écrit.",
      savoir: [
        "Réservé à la direction.",
        "Refusé si le nouveau numéro existe déjà ; un numéro ne porte que des chiffres.",
        "À partir d'une année : la base est sauvegardée avant d'écrire, et si une seule ligne refuse de changer, rien n'est écrit.",
        "Les pièces déjà délivrées portent l'ancien numéro.",
      ],
    },
  ],
};

export const remplacements = {
  "organisation|Attributions": {
    titre: "Attributions",
    ou: "Organisation → Attributions.",
    texte: "Qui donne quoi, avec quelles périodes, par section et par UE. Trois vues : « Par section », « Vue "
         + "complète », « Coordination » (UE et cours regroupés). « Nouveau » ajoute une ligne, « + » sur une UE "
         + "ouvre son menu, « Annuler » défait une modification récente, « Export » sort "
         + "l'Excel. Le bouton des groupes organise les groupes d'une UE ou de toute la section.",
    savoir: [
      "Sur une ligne : « C » met le titulaire en congé et crée une ligne de remplacement (R) ; le cadenas signale une nomination définitive ; RT, une remise au travail ; la mallette pioche un candidat du recrutement.",
      "Par UE : « Réouvrir cette UE » crée une nouvelle organisation. Par section (direction) : remplir les périodes, rapport d'attributions, Excel, suppression avec sauvegarde.",
      "Ce qu'une coordination crée ou modifie s'écrit, mais repasse « à valider » : la direction coche la case « Val. » de la ligne. Qui ne peut que lire voit la grille en lecture.",
      "La numérotation des NOUVEAUX groupes se règle par section (Configuration → Unités et cours, fiche de la section, « Numérotation des groupes ») : A, B… ; A1, A2, B1… ; ou 1, 2, 3. Les groupes déjà créés se renomment dans Organisation → Répartition des étudiants.",
      "« Répartir entre organisations » (menu de l'UE) recopie, modifie ou déplace des lignes d'une organisation à l'autre. Lucie signale ce qui ne tombe pas sur un multiple du dossier pédagogique ; elle n'empêche pas.",
      "Les périodes d'un cours tombent sur un multiple du dossier pédagogique ; l'autonomie se compte à part.",
      "Les attributions HELB s'affichent mais ne pèsent pas sur la dotation.",
      "Une note sur une ligne : l'icône « i » grise est vide, marine quand elle porte un texte ; le survol la lit.",
    ],
  },
  "organisation|Les autres onglets": {
    titre: "Les autres onglets",
    ou: "Organisation → rail.",
    texte: "« Rentrée » : reconduit d'un clic les échéances légales et reporte les événements de l'établissement de l'an dernier. « Répartition des étudiants » : croise attributions et PAE — on coche qui suit quel groupe, avec un plafond suggéré. « Schéma de capitalisation » : place les unités par année d'études et par section. « Unité : croiser, pondérer, décrire » : en trois étapes, le croisement des acquis et du programme, la pondération, puis le descriptif d'unité (DUE). « Effectifs et postes PNCC ».",
    savoir: [
      "Répartition des étudiants : le crayon d'un en-tête « Org 1 · Gr. A » renomme le groupe (A1, A2…) ; l'icône à côté du nom du cours renumérote tous ses groupes d'un coup — A, B… · A1, A2… (la lettre est l'organisation : Org 2 donne B1, B2) · 1, 2…. La ligne d'attribution est renommée et les étudiants placés suivent leur groupe. Un nom déjà pris : les deux groupes s'échangent.",
      "Les pondérations ont une année : régler 2026-2027 ne touche pas aux années passées. À partir de 2026-2027, dix points par cours, répartis entre ses acquis.",
      "Les rapports d'Organisation (unités, grilles de cours, enseignants par unité, acquis, unités sans attribution, calendrier des délibérations, locaux) sortent par l'avion → Organisation → Listes et rapports.",
    ],
    images: [
      { src: "/guide/organisation-rentree.png", legende: "Organisation → Rentrée : [[Rien n'a changé — reconduire]] reconduit les échéances légales, [[Reporter depuis 2025-2026|IconCopy]] reporte les événements de l'établissement ; en dessous, les étapes pour ouvrir l'année, chacune avec [[Ouvrir|IconArrowRight]]." },
    ],
  },
};
