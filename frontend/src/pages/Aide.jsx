import { useMemo, useState } from 'react';
import {
  IconSearch, IconX, IconHelpCircle, IconChecklist, IconUsers, IconBooks,
  IconChartBar, IconSettings, IconChevronRight, IconHome, IconSend, IconPencil,
  IconBook, IconUserCheck, IconCertificate, IconAccessible, IconScale, IconAward, IconStairsUp,
  IconShieldExclamation,
} from '@tabler/icons-react';

/**
 * Mode d'emploi de Lucie — la face « Mode d'emploi de Lucie » de Documentation.
 *
 * Le parti reste celui du reste de l'application : aplats, gris, pas d'image.
 * Chaque point dit OÙ l'on va (les libellés tels qu'ils sont écrits à l'écran),
 * CE QU'ON Y FAIT, et CE QU'IL FAUT SAVOIR — les règles qui mordent. Il explique
 * le travail, pas l'informatique (CLAUDE.md, § 7).
 *
 * LA VERSION DÉCRITE SE DIT EN TÊTE : un mode d'emploi écrit sur la dev montre
 * des écrans que l'équipe n'a pas. À relire et à renuméroter à chaque mise en
 * production qui change un geste.
 */
const VERSION_DECRITE = '3.1.1';

/* Un point : { titre, ou?, texte, savoir?: [] }.
   ou     — le chemin, avec les libellés de l'écran ;
   texte  — ce qu'on y fait ;
   savoir — ce qu'il faut savoir : les règles qui bloquent ou qui surprennent. */
const RUBRIQUES = [
  {
    id: 'demarrage', titre: 'Pour commencer', Icone: IconChevronRight,
    resume: "L'année de travail, le menu, la recherche, l'avion et les idées.",
    points: [
      { titre: "L'année de travail",
        ou: "En haut de l'écran, le sélecteur d'année.",
        texte: "Il fixe l'année sur laquelle porte tout ce que vous voyez. Changer d'année change tous les écrans. "
             + "Si vous n'y touchez pas, Lucie prend l'année active de l'établissement.",
        savoir: [
          "Avant de corriger quoi que ce soit, regardez l'année affichée.",
        ] },
      { titre: "Le menu du haut et le rail",
        ou: "Barre du haut : Tableau de bord · Étudiants · Personnel · Organisation · Gestion · Documentation — et "
          + "Mes cours pour qui enseigne.",
        texte: "La barre du haut dit dans quel métier vous êtes. Tout le reste est dans le rail, la colonne "
             + "d'icônes à gauche : les rubriques de l'écran, puis ses outils. Survolez une icône pour lire son nom.",
        savoir: [
          "En tête de chaque rail : « Imprimer ou envoyer » (l'avion) et « Proposer une amélioration » (l'ampoule).",
          "Ce qui efface est toujours en dernier dans le rail.",
        ] },
      { titre: "Où aller ? — trouver un écran",
        ou: "La loupe de la barre du haut, ou ⌘K (Mac) / Ctrl+K (Windows).",
        texte: "Tapez un mot avec vos mots : « PAE », « couleurs », « recours », « convention ». Lucie liste les "
             + "écrans et les outils qui en parlent. Flèches pour choisir, Entrée pour y aller.",
        savoir: [
          "La recherche trouve des ENDROITS, pas des étudiants. Un étudiant se cherche dans la liste des étudiants.",
        ] },
      { titre: "L'avion : imprimer ou envoyer",
        ou: "L'avion (carré bleu) sur les écrans, les fiches et les fenêtres.",
        texte: "Toute pièce sort par le même centre, « Éditions ». L'avion l'ouvre sur ce que vous regardez : "
             + "un étudiant, une unité, un membre du personnel. Voir la rubrique « Éditions ».",
        savoir: [] },
      { titre: "Proposer une amélioration",
        ou: "L'ampoule « Proposer une amélioration », sur tous les rails.",
        texte: "Écrivez au moment où vous butez : en une phrase ce qui manque ou ce qui gêne, puis le contexte. "
             + "« Déposer l'idée ». Chaque proposition devient une conversation avec la direction.",
        savoir: [
          "La réponse de la direction paraît sur votre Tableau de bord, bloc « Mes propositions », marquée nouveau. Vous pouvez y répondre.",
          "Les messages sont signés au nom de qui écrit. Ils ne se modifient pas et ne s'effacent pas.",
        ] },
      { titre: "Les fenêtres et les questions de Lucie",
        texte: "Toutes les fenêtres ont le même dessin : un en-tête bleu marine, le contenu qui défile, et les "
             + "boutons d'action dans un pied fixe, en bas. Quand Lucie vous pose une question ou vous informe, "
             + "c'est une boîte à ses couleurs : un liseré à gauche dit le ton — rouge brique pour ce qui efface "
             + "ou pour une erreur, vert pour une réussite, bleu marine sinon.",
        savoir: [
          "Entrée confirme, Échap annule. Échap ne ferme que la fenêtre du dessus, jamais celle qui est dessous.",
          "Une question qui efface quelque chose a son bouton en rouge brique : lisez-la avant de confirmer.",
          "Après une mise à jour de Lucie, une page restée ouverte se recharge d'elle-même la première fois qu'elle en a besoin.",
          "Sur la version de développement, une pastille orange « DEV » est collée au numéro de version : ce n'est pas la production.",
        ] },
      { titre: "Votre rôle et votre périmètre",
        texte: "Le rôle dit ce que vous pouvez faire ; le périmètre, quelles sections vous voyez. Une coordination "
             + "limitée à TIM ne voit pas les étudiants des autres sections : c'est voulu.",
        savoir: [
          "Quand un geste vous est refusé, le message le dit. Ce n'est pas une panne : c'est le réglage des droits.",
          "Celui qui clique est celui qui signe : chaque validation, accord ou confirmation s'enregistre à votre nom, avec l'heure.",
          "À l'écran, les personnes s'écrivent « NOM Prénom ». Les pièces officielles gardent « Prénom NOM ».",
        ] },
    ],
  },
  {
    id: 'accueil', titre: 'Tableau de bord', Icone: IconHome,
    resume: "Ce qui m'attend, ce que l'équipe doit faire, les chiffres de l'école.",
    points: [
      { titre: "Ce qui m'attend",
        ou: "Tableau de bord → Ce qui m'attend.",
        texte: "Ce que VOUS devez faire, avant le fil de ce qui s'est passé. Les blocs n'apparaissent que s'il y a "
             + "quelque chose à faire.",
        savoir: [
          "« À signer » : les conventions de stage préparées, pour le seul signataire de l'établissement. Cochez, ouvrez l'« Aperçu » au besoin, puis « Signer ». Le fac-similé protégé est apposé en bas de la dernière page ; l'original reçu reste intact.",
          "« À confirmer » : les textes de Documentation dont vous devez prendre connaissance. Chaque ligne ouvre le texte. Le bloc ne disparaît qu'une fois la confirmation enregistrée.",
          "« À valider » (direction) : les modifications proposées par les coordinations. « Ouvrir » affiche les demandes à trancher.",
          "« Mes propositions » : vos idées et les réponses de la direction.",
          "Vos tâches : cochez « faite » ou signalez « pas encore faite ». Le geste est daté et visible dans le suivi.",
          "« Filtrer » (rail) règle le fil d'activité : quels événements, sur quelle durée.",
        ] },
      { titre: "Échéancier",
        ou: "Tableau de bord → Échéancier.",
        texte: "Les obligations de l'établissement et leurs délais : qui en répond, pour quand, sur quelle base.",
        savoir: [] },
      { titre: "Suivi d'équipe",
        ou: "Tableau de bord → Suivi d'équipe.",
        texte: "« Échéances et tâches » s'ouvre sur une frise de trente jours devant et sept derrière : une boule "
             + "par tâche, fraise si elle est en retard ou tombe dans les trois jours, orange dans la semaine, verte "
             + "plus tard — cochée quand elle est faite. Dessous, les tâches en colonnes : tâche, responsables, "
             + "échéance, statut ; tout se modifie sur la ligne. « Réunions » garde les séances et leurs décisions. "
             + "« Confier une tâche » : quoi, à qui, pour quand.",
        savoir: [
          "Une tâche se confie à une personne, jamais à un texte libre. Le premier nom, en gras, répond de la tâche.",
          "On peut mettre quelqu'un « au courant » (sous « ⋯ ») : il voit la tâche sous « Pour information », sans en répondre.",
          "Une séance de réunion : type, date, heure et lieu en tête, présences en pastilles (un clic : présent, excusé, absent), puis les points numérotés et leurs décisions.",
          "Supprimer une réunion : direction seule, la corbeille en fin de barre. Les tâches décidées en séance sont conservées.",
        ] },
      { titre: "Chiffres de l'école",
        ou: "Tableau de bord → Chiffres de l'école (si votre rôle y a accès).",
        texte: "Les grands nombres de l'année, en lecture.",
        savoir: [] },
    ],
  },
  {
    id: 'etudiants', titre: 'Étudiants — la liste et la fiche', Icone: IconChecklist,
    resume: "Trouver un étudiant, lire sa fiche, créer un dossier, réparer les dossiers.",
    points: [
      { titre: "La liste des étudiants",
        ou: "Étudiants → Inscriptions & PAE.",
        texte: "Les étudiants par section. Filtres : niveau, UE, rattachement, primo, doublons, « Plus de 60 ECTS ». "
             + "Un clic sur le nom ouvre la fiche.",
        savoir: [
          "Le crayon du PAE est vert quand le PAE de l'année est validé, gris sinon. Un clic ouvre la revue du PAE de l'étudiant.",
          "Le niveau s'écrit « Parcours B1 », « Parcours B2 » ou « Diplômant » : l'épreuve intégrée au PAE donne « Diplômant » ; sinon, le stage le plus avancé du PAE décide.",
        ] },
      { titre: "La fiche d'un étudiant",
        ou: "Un clic sur un étudiant de la liste.",
        texte: "Onglets : Parcours · Identité · Valorisation · Finances · Stages · Aménagements · Congé-éducation · "
             + "Suivi · Dossier. Au bout de la rangée : l'œil et l'avion.",
        savoir: [
          "L'œil ouvre la revue du PAE sur cet étudiant : on y compose et on y valide le PAE. La fiche ne le compose plus ; l'onglet Parcours le résume en une ligne.",
          "L'avion ouvre Éditions sur cet étudiant : toutes ses pièces.",
          "« Changer de section… » (dans la rangée des onglets) : vers une section jamais suivie. L'ancienne devient un cursus archivé ; ses réussites restent. Les inscriptions de l'année se retirent ensuite par « Retirer ces inscriptions ».",
          "« Suivi » est confidentiel : seuls ses enseignants, sa coordination et la direction y entrent.",
        ] },
      { titre: "Identité : adresse et nationalité",
        ou: "Fiche → Identité.",
        texte: "L'adresse commence par le code postal : il pose la localité, puis Lucie propose les rues pendant la "
             + "frappe. La nationalité se choisit dans la liste des pays.",
        savoir: [
          "Une adresse à l'étranger reste libre.",
          "Une nationalité saisie avant la liste reste affichée, marquée « saisie à remplacer ».",
          "La carte d'identité belge lue donne « Belgique ».",
        ] },
      { titre: "Créer un étudiant",
        ou: "Étudiants → rail → Créer un étudiant.",
        texte: "Pour une inscription tardive ou hors eCampus.",
        savoir: [
          "Avant d'écrire, Lucie cherche un dossier existant (registre national, puis nom, prénom et date de naissance). S'il en trouve, il les propose : ouvrez-les plutôt que de créer un doublon.",
        ] },
      { titre: "Contrôler les dossiers",
        ou: "Étudiants → rail → Contrôler les dossiers.",
        texte: "Cinq contrôles : Dossiers dédoublés · Programmes sur deux sections · Au-delà du bloc atteint · "
             + "Décisions sans inscription · Nationalités.",
        savoir: [
          "Rien ne s'écrit sans simulation : Lucie montre d'abord ce qu'elle ferait.",
          "Nationalités : Lucie propose le pays pour chaque saisie ancienne ; ce qu'elle ne reconnaît pas reste nommé.",
        ] },
    ],
  },
  {
    id: 'pae', titre: 'Le PAE', Icone: IconStairsUp,
    resume: "Composer, revoir et valider le programme annuel ; les reports de notes.",
    points: [
      { titre: "Revue des PAE — parcourir et valider",
        ou: "Étudiants → Inscriptions & PAE → Revue des PAE (ou l'œil de la fiche, ou le crayon de la liste).",
        texte: "Les étudiants cochés, sinon la liste filtrée, l'un après l'autre. À gauche, le PAE de l'année cours "
             + "par cours ; à droite, le parcours. « Valider · étudiant suivant » enregistre et passe au suivant ; "
             + "« Précédent » et « Passer » ne valident rien.",
        savoir: [
          "Valider confirme aussi le programme : un seul geste. Le bandeau dit « Ce PAE a été validé le … par … ». « retirer la validation » l'efface.",
          "Un programme modifié perd sa validation : il faut revalider.",
          "Ajouter une UE : « Ajouter une UE au PAE », ou un clic sur une tuile du parcours. Retirer : « retirer » sur la ligne de l'UE. Ce qui enfreint une règle demande un motif.",
          "Plus de 60 ECTS : la tuile « ECTS en cours » passe en orange. Valider demande de confirmer en connaissance de cause ; le nombre d'ECTS confirmé reste écrit dans le bandeau.",
          "Filtres de la revue : année, section, bloc, « Avec reports », « À vérifier », « Pas encore validés ».",
          "L'avion de la revue ouvre Éditions avec la pièce « Programme annuel (PAE) » et les étudiants de la revue cochés.",
        ] },
      { titre: "Lire le parcours",
        ou: "Revue des PAE, colonne de droite.",
        texte: "Une tuile par UE, rangée par bloc. Les couleurs suivent Configuration → Thèmes et couleurs.",
        savoir: [
          "Tuile pleine verte : acquise. Violette : acquise par faveur. Bleue pleine : au PAE de l'année.",
          "Tuile blanche : accessible. Grise : pas encore accessible.",
          "Point rouge en haut à gauche : UE déjà refusée une fois. Point marine en haut à droite : UE déterminante. Petit point en bas : report ou VA.",
          "Flèches : prérequis. Pleines et bleues quand elles touchent le PAE, grises sinon ; en pointillé, une règle interne de l'Institut, qui avertit sans interdire.",
        ] },
      { titre: "Reports et dispenses sur la ligne du cours",
        ou: "Revue des PAE, ligne de chaque cours.",
        texte: "Un cours dont tous les acquis sont maîtrisés se reporte : « Reporter » avec la note et l'année "
             + "d'origine. Pour 2024-2025 et 2025-2026, une VA accordée sans dossier se pose aussi ici : "
             + "« VAP / dispense » sur un cours, « VA / VAE » sur l'UE entière — les cours valent alors 10/20.",
        savoir: [
          "Encoder un report est réservé à la direction, à la coordination et à l'administration des études.",
          "Un report « retiré » est refusé : Lucie ne le reposera pas d'office.",
          "À partir de 2026-2027, une VA sans dossier est refusée : elle passe par la Valorisation des acquis.",
        ] },
      { titre: "Composer les PAE",
        ou: "Étudiants → Inscriptions & PAE → Composer le PAE (l'escalier).",
        texte: "Une ligne par étudiant, une colonne par UE de la section. Trois modes : « Composer », "
             + "« Encoder l'historique » (résultats d'une année passée), « Valider en groupe ». "
             + "« Passage à l'année suivante… » propose le programme d'après les résultats.",
        savoir: [
          "Rien n'est écrit avant « Vérifier … changement(s) » puis « Enregistrer ».",
          "« Valider en groupe » écrit la même validation que l'œil, à votre nom. Au-delà de 60 ECTS, le lot nomme les programmes concernés avant d'écrire.",
          "Un bloc s'ouvre quand une part du bloc précédent est ACQUISE (50 % de ses ECTS par défaut). Avoir suivi un bloc sans le réussir n'ouvre pas le suivant.",
          "L'épreuve intégrée n'est proposée qu'une fois tout le reste acquis.",
        ] },
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
    id: 'valorisation', titre: 'Valorisation des acquis (VA / VAE)', Icone: IconCertificate,
    resume: "Un circuit : demande, recevabilité, avis, séance du conseil, validation.",
    points: [
      { titre: "Le circuit",
        ou: "Étudiants → Inscriptions & PAE → Valorisation des acquis (VA).",
        texte: "Trois portes, dans l'ordre : « 1 · Introduire des demandes », « 2 · Instruire en série », "
             + "« 3 · Séance du conseil ». Chaque demande suit cinq étapes : dates de la demande · recevabilité · "
             + "avis du chargé de cours · décision du Conseil · validation direction.",
        savoir: [
          "Aucune pièce signée ne sort tant que le circuit n'est pas parcouru. Chaque étape porte le nom de qui l'a faite.",
          "Instruire : coordination, secrétariat, direction. Valider : direction et direction adjointe seulement. Dévalider : direction, avec un motif écrit.",
          "Un dossier validé est gelé : recevabilité, avis et décision ne se modifient plus.",
          "Toute demande s'encode, recevable ou non. Le délai se calcule ; la date d'envoi prime sur celle du formulaire.",
          "L'épreuve intégrée ne se valorise jamais.",
        ] },
      { titre: "1 · Introduire des demandes",
        ou: "Valorisation des acquis → 1 · Introduire des demandes.",
        texte: "La matrice : un étudiant par ligne, une UE par colonne, VA ou VAE. On y ajoute aussi des étudiants. "
             + "Depuis la fiche (onglet Valorisation), « Introduire une demande » ouvre un dossier vide pour un "
             + "étudiant.",
        savoir: [
          "Les étudiants peuvent aussi demander en ligne, sur la page publique /demande-va de Lucie : matricule, lien envoyé à l'adresse du dossier (valable 30 minutes), unités demandées, pièces. Ils reçoivent un accusé de réception. Ils peuvent compléter tant que la recevabilité n'est pas posée.",
        ] },
      { titre: "2 · Instruire en série",
        ou: "Valorisation des acquis → 2 · Instruire en série.",
        texte: "Dates, recevabilité, avis : en lot, sur les demandes cochées. Une frise numérotée dit l'étape où "
             + "en est la liasse.",
        savoir: [
          "Une irrecevabilité (hors délai, dossier incomplet, pièces non officielles) se motive, même en série.",
          "Les chargés de cours rendent leur avis dans Mes cours → Avis de valorisation : favorable, partiel ou défavorable, toujours motivé. Le plus prudent l'emporte.",
          "Le chargé de cours qui rend l'avis est NOMMÉ ; Lucie propose ceux attribués aux cours visés.",
        ] },
      { titre: "3 · Séance du conseil",
        ou: "Valorisation des acquis → 3 · Séance du conseil (ou « Délibérer cet étudiant » sur la fiche).",
        texte: "Lecture « Par étudiant » ou « Par UE ». Une décision par UE : Totale, Partielle (des cours, des "
             + "acquis) ou Refusée, préremplie depuis l'avis. « Arrêter … décision(s) · suivant » enregistre. "
             + "Par UE, « la même décision pour les autres étudiants de l'UE » recopie une décision.",
        savoir: [
          "Une séance, c'est une section et une date : un lot ne mélange pas deux séances.",
          "La base légale (VAF V1-V4 ou VANFI) est obligatoire dès qu'on accorde : elle part dans eProm.",
          "Un refus se motive. Motifs et remarques types : Configuration → Procédures et délais.",
          "Un stage dispensé en partie s'écrit en heures dans la remarque du Conseil.",
          "La validation de la direction est un geste à part : « Valider … dossier(s) ».",
        ] },
      { titre: "Les pièces de valorisation",
        ou: "Éditions → Étudiants → Valorisation des acquis.",
        texte: "Le procès-verbal (annexe 4) et les attestations, par unité.",
        savoir: [
          "Le PV ne sort pas tant qu'il manque une mention. La date du PV vient des décisions encodées, pas du jour où l'on imprime.",
          "Une dispense partielle se lit « Réussite partielle — dispense », avec un renvoi vers une remarque : ce n'est pas une réussite d'unité.",
        ] },
    ],
  },
  {
    id: 'amenagements', titre: 'Aménagements raisonnables', Icone: IconAccessible,
    resume: "Demande, rapport, avis des chargés de cours, décision du Conseil.",
    points: [
      { titre: "Le registre",
        ou: "Étudiants → Inscriptions & PAE → Aménagements raisonnables (AR).",
        texte: "Les dossiers de l'année, filtrables par section et par état. « Créer un aménagement » : choisissez "
             + "l'étudiant ; son dossier de l'année s'ouvre, ou se crée. Chaque ligne ouvre la fiche sur l'onglet "
             + "Aménagements.",
        savoir: [
          "Supprimer un dossier : sans décision, par qui instruit ; décidé, notifié ou communiqué, par la direction seule, avec un motif.",
        ] },
      { titre: "Le circuit, une étape à la fois",
        ou: "Fiche → Aménagements.",
        texte: "1 Demande (cadre A) · 2 Rapport (cadre B, personne de référence) · 3 Avis des chargés de cours · "
             + "4 Décision du Conseil des études. Les étapes suivantes restent sous cadenas tant que la précédente "
             + "n'est pas validée (« ✓ Valider … »).",
        savoir: [
          "Cadre A : les aménagements se cochent dans la liste courte, rangée par moment, avec une précision ; « Autre » se décrit. Au moins un aménagement est demandé.",
          "« Soins spécifiques » est confidentiel et n'est jamais transmis. Une mesure se coche dans la liste ou s'écrit dans « Autre ».",
          "Le rapport (cadre B) se valide par la personne de référence ou la direction.",
          "Les chargés de cours des unités concernées rendent leur avis mesure par mesure dans Mes cours : réalisable, avec adaptation, pas réalisable (motivé).",
          "Le Conseil accorde ou refuse mesure par mesure. Un refus se motive. La motivation de la décision est obligatoire.",
        ] },
      { titre: "Pièces et communication",
        ou: "Fiche → Aménagements, puis l'avion.",
        texte: "Quatre pièces : formulaire (cadres A et B), décision motivée, notification, fiche « mesures ». "
             + "« Communiquer aux chargés de cours » envoie à chacun les seules mesures accordées.",
        savoir: [
          "Décision et notification ne sortent pas tant que manquent statut, date, motivation ou une mesure accordée : Lucie dit ce qui manque.",
          "Secret professionnel : les chargés de cours ne voient QUE les mesures accordées, jamais la pièce ni la motivation.",
          "Le recours a sa date, la date de décision de la Commission et son issue.",
          "Le catalogue des mesures se règle dans Configuration → Procédures et délais.",
        ] },
    ],
  },
  {
    id: 'deliberation', titre: 'Délibération', Icone: IconScale,
    resume: "La feuille d'une unité, la décision du Conseil, la clôture, les contrôles.",
    points: [
      { titre: "Délibérer une unité",
        ou: "Étudiants → Délibération : une section, puis l'unité.",
        texte: "La feuille montre l'étudiant, ses acquis par cours, la note d'unité et le choix du Conseil : "
             + "Réussi, Ajourné, Refusé, et « Faveur ». Précédent / suivant pour passer d'un étudiant à l'autre. "
             + "Le sélecteur en haut à droite change de vue : « Fiche » (un étudiant), « Tableau » (tous les "
             + "étudiants d'un coup d'œil : une note juste à l'encre, un acquis en défaut en pastille fraise, la "
             + "faveur en violet), « En lot » (ajourner plusieurs étudiants avec une justification commune), "
             + "« Clôture ».",
        savoir: [
          "Pas de compensation entre acquis : un seul acquis en défaut, c'est « ajourné » en 1re session, « refusé » en 2e.",
          "En 2e session, « ajourné » n'existe pas.",
          "La faveur porte l'unité au seuil ; sur les documents de l'étudiant, tout vaut alors 10.",
          "Jamais de cote sous 10 sur un document remis à l'étudiant : c'est « NA ».",
          "Le justificatif d'échec écrit par le chargé de cours dans Mes cours EST la motivation. Le Conseil peut la réécrire.",
          "Une unité NON PARAMÉTRÉE (acquis non rattachés aux cours) s'annonce en orange : on ne peut alors ni ajourner ni refuser, faute de pouvoir motiver acquis par acquis. On rattache d'abord les acquis aux cours.",
        ] },
      { titre: "Clore la délibération",
        ou: "Feuille de l'unité → Clôture.",
        texte: "Appel des présences, séance du Conseil et date de publication des résultats, visite des copies, "
             + "dates de seconde session, documents, puis « Clore la délibération ».",
        savoir: [
          "La date de publication des résultats (aujourd'hui par défaut) fait courir les quatre jours de recours : corrigez-la si les résultats ont été affichés un autre jour.",
          "Quorum des deux tiers des voix délibératives, contrôlé à la clôture.",
          "Les motivations proposées par Lucie et restées telles quelles se confirment une seule fois, à la clôture.",
          "Rouvrir une séance close : direction seule, motif écrit obligatoire.",
        ] },
      { titre: "Contrôles",
        ou: "Délibération → Contrôles (direction et secrétariat).",
        texte: "Trois faces. « Notes en double » : une note d'épreuve existe sous deux formes avec deux valeurs ; "
             + "la direction choisit la bonne, avec un motif, et Lucie aligne. « Contrôle des notes de décision » : "
             + "la note enregistrée avec la décision face à celle que Lucie calcule ; correction motivée. "
             + "« Clôturer une année reprise » : clôture des années importées d'Excel.",
        savoir: [
          "Après « Notes en double », la cote se corrige dans « Contrôle des notes de décision ».",
          "Chaque correction entre dans un journal qui ne s'efface pas.",
          "Une année reprise reçoit un énoncé uniforme : elle ne se fait pas passer pour une délibération tenue.",
        ] },
      { titre: "Les outils de la délibération",
        ou: "Le rail, sous Délibération.",
        texte: "« Encodage rapide » pour saisir vite. « Contrôles des notes et des décisions ». « Où sont les "
             + "notes ? » quand des notes semblent rangées dans la mauvaise année. « Règles de délibération ».",
        savoir: [
          "Le classeur de suivi et la reprise d'une année depuis un tableau plat sont dans « Importer » (rail de l'axe Étudiants).",
          "L'impression des pièces se fait toujours par l'avion.",
        ] },
    ],
  },
  {
    id: 'procedures', titre: 'Recours et discipline', Icone: IconShieldExclamation,
    resume: "Recours contre un refus, ou procédure disciplinaire (dont la fraude), selon le RDE 2026-2027.",
    points: [
      { titre: "Le registre",
        ou: "Étudiants → Procédures.",
        texte: "Tous les dossiers de l'année, de deux types : RECOURS, ou DISCIPLINAIRE — la fraude est une procédure disciplinaire, marquée « fraude ». Pour chacun, l'étudiant, la section et "
             + "l'unité, l'étape en cours et la prochaine échéance légale, en couleur : fraise si elle est dépassée "
             + "ou à trois jours, orange dans la semaine. Les dossiers d'avant le 3 octobre 2026 restent lisibles "
             + "sous « Anciens dossiers ».",
        savoir: [
          "Ouvrir un dossier : direction et secrétariat. Décider (recevabilité, décision, sanction) : la direction.",
        ] },
      { titre: "Ouvrir un dossier",
        ou: "Procédures → « Ouvrir un dossier ».",
        texte: "On choisit l'étudiant, puis le type — Recours ou Disciplinaire, et pour ce dernier la nature : comportement ou fraude —, puis l'unité parmi SES unités de l'année, avec leur décision. "
             + "Lucie remplit le reste : section, session, chargés de cours, président de la séance.",
        savoir: [
          "Un recours ne vise qu'un REFUS (RDE art. 87). Un ajournement ou une décision de valorisation se motive, mais ne se conteste pas : ces unités sont grisées.",
          "Une fraude porte sur l'épreuve d'une unité : on coche les acquis qu'elle visait (art. 75 §1).",
        ] },
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
      { titre: "La discipline et la fraude (art. 72 à 75, 115 à 119)",
        ou: "Le dossier : une frise d'étapes.",
        texte: "Faits établis → convocation → audition et procès-verbal → avis du CDE (fraude ou renvoi définitif) "
             + "→ décision motivée → notification → recours au Pouvoir organisateur en cas de renvoi définitif. "
             + "L'écartement provisoire (15 jours ouvrables au plus) se pose à part.",
        savoir: [
          "Une fraude sanctionnée AJOURNE les acquis visés dans la délibération (1re session), ou mène au refus (2e session ou récidive). La récidive se lit dans les dossiers antérieurs.",
          "Pour un renvoi définitif, la convocation part au moins huit jours ouvrables avant l'audition : Lucie refuse une date trop proche.",
          "Le procès-verbal d'audition se rédige avec un membre du personnel ; un refus de signer se constate par deux membres.",
        ] },
      { titre: "Les pièces",
        ou: "Le dossier → Pièces → « Produire ».",
        texte: "Accusé de réception, décision d'irrecevabilité, décision motivée du CDE restreint ; convocation, "
             + "procès-verbal d'audition, décision disciplinaire. Elles sortent dans la mise en page commune, avec "
             + "les voies de recours qui conviennent. On dépose aussi la plainte reçue, le PV de surveillance, les preuves.",
        savoir: [
          "Une pièce ne sort pas tant que l'étape qu'elle relate n'est pas posée.",
        ] },
    ],
  },
  {
    id: 'diplomes', titre: 'Diplômes et titres', Icone: IconAward,
    resume: "Diplôme, attestation provisoire, attestation de section, PV de section.",
    points: [
      { titre: "Produire les pièces de diplomation",
        ou: "L'avion (Éditions) → famille « Diplômes et titres ».",
        texte: "Diplôme, attestation provisoire, attestation de réussite de section, liste des diplômés, PV de section.",
        savoir: [
          "L'année portée par ces pièces est celle de la réussite de l'épreuve intégrée (à défaut, de la dernière unité acquise), pas l'année choisie à l'écran.",
          "Mention : unités déterminantes pour 2/3, épreuve intégrée pour 1/3. La note finale s'arrondit à l'unité : 69,7 devient 70, Distinction.",
          "Ce qui manque à une pièce est nommé : complétez avant de produire.",
        ] },
    ],
  },
  {
    id: 'editions', titre: 'Éditions — imprimer ou envoyer', Icone: IconSend,
    resume: "Un seul centre pour toutes les pièces, d'où qu'on l'ouvre.",
    points: [
      { titre: "Le centre",
        ou: "L'avion, ou « Imprimer ou envoyer » en tête du rail.",
        texte: "Une fenêtre « Éditions » à quatre onglets : Étudiants · Personnel · Organisation · Gestion. "
             + "Ouvert depuis un écran, il met en tête « De cet écran » : les pièces propres à cet écran.",
        savoir: [
          "Une pièce produite s'ouvre dans un onglet ; « Ouvrir » et « Enregistrer » restent en tête.",
          "La signature du directeur est toujours sous fac-similé protégé.",
          "Toute pièce porte en pied « Produit par … le … à … ».",
        ] },
      { titre: "Étudiants : cinq familles",
        ou: "Éditions → Étudiants.",
        texte: "« Délibération » : choisissez la session, puis les pièces « À remettre aux étudiants » "
             + "(attestations de réussite, motivations d'ajournement et de refus) et « Pour le Conseil » (PV, "
             + "composition, grille). « Dossiers étudiants » : « Le parcours » (bulletin, PAE) et "
             + "« L'inscription » (fiche, frais, annexes 1 et 2, pièces CEP). « Valorisation des acquis » : par unité. "
             + "« Diplômes et titres ». « Listes et rapports ».",
        savoir: [
          "Le périmètre : la section au menu, puis ses UE à cocher, puis leurs cours. La colonne « Reçoit » dit qui reçoit quoi.",
          "Une pièce sans rien à produire est grisée (attestation sans réussite, ajournement hors 1re session…).",
          "Mode SLE : cocher une annexe 1 ou 2 ne montre que les étudiants en séjour limité aux études ; les autres pièces se grisent.",
          "Mode CEP : cocher une pièce CEP ne montre que les étudiants au congé-éducation payé de l'année (hors Flandre).",
          "Le champ « Un étudiant — toutes ses pièces… » fait d'un étudiant le périmètre ; « revenir au périmètre » le quitte.",
          "« Produire … pièce(s) · … étudiant(s) » imprime ; « Envoyer » expédie par courriel, un document par personne, jamais de copie collective, à l'adresse d'école.",
        ] },
      { titre: "Listes et rapports",
        ou: "Éditions → un onglet → Listes et rapports.",
        texte: "« Prêts à imprimer » : les rapports mis en page. « À composer — colonnes au choix » : une liste "
             + "dont vous choisissez les colonnes.",
        savoir: [
          "N° national et adresse postale : administrateur et direction seulement. E-mail privé : aussi secrétariat et coordinations.",
          "Personnel a en plus « Pièces par membre » (contrats, fiche d'attributions, EA12).",
        ] },
    ],
  },
  {
    id: 'mescours', titre: 'Mes cours', Icone: IconPencil,
    resume: "Pour les enseignants : notes, avis, présences.",
    points: [
      { titre: "Encoder les notes",
        ou: "Mes cours → un cours → Notes du cours.",
        texte: "Une note entière sur 20 par acquis. PP : pas présenté. NP : note de présence. CM : certificat "
             + "médical. « Enregistrer ».",
        savoir: [
          "Vos notes sont des propositions : la coordination les reprend dans l'encodage officiel.",
          "Une note sous 10 ne s'enregistre pas sans son « Justificatif d'échec » (panneau de droite). Écrivez-le, ou « Choisir dans la liste ».",
          "Ce justificatif devient la motivation de l'échec en délibération. Le Conseil peut la réécrire.",
          "Unité en évaluation unique : la note d'un acquis encodée sur un cours vaut pour tous les cours qui le portent.",
        ] },
      { titre: "Avis de valorisation",
        ou: "Mes cours → rail → Avis de valorisation.",
        texte: "Les demandes de VA recevables pour vos cours. Ouvrez les pièces déposées, puis « Rendre mon avis » : "
             + "Favorable, Partiel ou Défavorable, avec ce que vous avez comparé au dossier pédagogique.",
        savoir: [
          "L'avis se corrige jusqu'à la décision du Conseil, puis il est figé.",
        ] },
      { titre: "Aménagements raisonnables",
        ou: "Mes cours → rail → Aménagements raisonnables.",
        texte: "Les mesures demandées pour vos étudiants. Pour chaque mesure : Réalisable, Avec adaptation, ou "
             + "pas réalisable. « Rendre mon avis ».",
        savoir: [
          "Une adaptation ou un refus s'explique.",
          "Vous ne voyez que les mesures, rien d'autre du dossier.",
        ] },
      { titre: "Présences",
        ou: "Mes cours → un cours → Présences.",
        texte: "Séance par séance : « Tous présents », puis corrigez les absents, et « Enregistrer ».",
        savoir: [
          "Une absence se justifie par un motif de la liste, jamais par un texte libre.",
          "Une séance à venir ne s'encode pas.",
          "Les étudiants marqués CEP : leurs présences partent sur l'attestation d'assiduité du congé-éducation, qui ne sort pas tant qu'une séance passée n'a pas ses présences.",
        ] },
    ],
  },
  {
    id: 'cep', titre: 'Congé-éducation payé (CEP)', Icone: IconUserCheck,
    resume: "La case sur la fiche, les présences, les deux attestations.",
    points: [
      { titre: "Le dossier CEP d'un étudiant",
        ou: "Fiche → Congé-éducation.",
        texte: "Marquez l'étudiant au CEP pour l'année, avec la région du lieu de travail et l'employeur. L'onglet "
             + "montre ses unités, ses heures et ses absences, et produit les pièces « Inscription » et "
             + "« Assiduité » par unité.",
        savoir: [
          "La région est celle du LIEU DE TRAVAIL. La Flandre n'utilise pas ces pièces : Lucie refuse.",
          "Attestation d'inscription régulière : à l'employeur au plus tard le 31 octobre (ou 15 jours après une inscription tardive).",
          "Assiduité : par période de trois mois à compter du début de l'UE. Les heures viennent de l'horaire.",
          "En nombre : Éditions → Étudiants → Dossiers étudiants, pièces « CEP — … ».",
        ] },
    ],
  },
  {
    id: 'personnel', titre: 'Personnel', Icone: IconUsers,
    resume: "Les membres, leurs fiches, leurs accès, le recrutement.",
    points: [
      { titre: "La liste et la fiche",
        ou: "Personnel.",
        texte: "La liste dit le nom, le statut, l'employeur (IIP ou HELB), les sections et l'ETP de l'année. "
             + "La fiche porte les attributions, les fonctions, les contrats. « Nouveau membre » dans le rail.",
        savoir: [
          "ETP = cours techniques / 800 + pratique professionnelle / 1000, autonomie comprise.",
          "L'accès à Lucie se donne sur la fiche, onglet « Accès Lucie ». La fiche suit le profil de son rôle ; ce qui est propre à la personne est nommé, et « Revenir au profil » l'efface.",
          "Un compte qui a signé des décisions se désactive, il ne se supprime pas.",
          "Un enseignant ne voit, dans Personnel, que SA fiche. Il peut proposer de corriger ses coordonnées, son état civil, son compte ou sa situation fiscale : la modification part en demande, et la direction la valide dans « Demandes ».",
        ] },
      { titre: "Besoins, recrutement, classement",
        ou: "Personnel → rail : Besoins & offres · Recrutement · Classement & prioritaires.",
        texte: "Les postes à pourvoir, les candidatures, le classement.",
        savoir: [
          "Un CV déposé en PDF pré-remplit la fiche du candidat : vérifiez, c'est une lecture automatique.",
        ] },
    ],
  },
  {
    id: 'organisation', titre: 'Organisation', Icone: IconBooks,
    resume: "Attributions, planification, horaires, effectifs.",
    points: [
      { titre: "Attributions",
        ou: "Organisation → Attributions.",
        texte: "Qui donne quoi, avec quelles périodes, par section et par UE. Le bouton des groupes organise les "
             + "groupes d'une UE ou de toute la section.",
        savoir: [
          "La numérotation des groupes se règle par section (Configuration → Unités et cours, fiche de la section, « Numérotation des groupes ») : A, B… ; A1, A2, B1… ; ou 1, 2, 3. Les noms déjà posés ne sont pas renommés.",
          "« Répartir entre organisations » (menu de l'UE) recopie, modifie ou déplace des lignes d'une organisation à l'autre. Lucie signale ce qui ne tombe pas sur un multiple du dossier pédagogique ; elle n'empêche pas.",
          "Les périodes d'un cours tombent sur un multiple du dossier pédagogique ; l'autonomie se compte à part.",
          "Les attributions HELB s'affichent mais ne pèsent pas sur la dotation.",
          "Une note sur une ligne : l'icône « i » grise est vide, marine quand elle porte un texte.",
        ] },
      { titre: "Planification",
        ou: "Organisation → Planification.",
        texte: "La grille d'organisation de l'année (comment les périodes se découpent, où va l'autonomie) et les "
             + "dates des UE. Elle se fait AVANT d'attribuer.",
        savoir: [
          "Les dates des UE commandent les comptages, donc la subvention.",
        ] },
      { titre: "Horaires",
        ou: "Organisation → Horaires.",
        texte: "Deux faces. « Composer la semaine » : par classe, professeur ou local ; des tuiles qu'on déplace "
             + "et rallonge ; recopie sur les semaines suivantes ; import de l'export « liste » d'Hyperplanning. "
             + "« Contrôler contre les attributions » : ce que l'horaire dépense face à ce qui est attribué.",
        savoir: [
          "Un conflit (même professeur, même local, même classe) se signale, il ne s'empêche pas.",
          "Une séance posée ou retouchée dans Lucie n'est jamais écrasée par un import.",
        ] },
      { titre: "Les autres onglets",
        ou: "Organisation.",
        texte: "Rentrée · Répartition des étudiants · Schéma de capitalisation · Pondérations · Descriptifs d'UE · "
             + "Effectifs et postes PNCC.",
        savoir: [
          "Les pondérations ont une année : régler 2026-2027 ne touche pas aux années passées.",
        ] },
    ],
  },
  {
    id: 'gestion', titre: 'Gestion', Icone: IconChartBar,
    resume: "Dotation, ETP, budget, résultats.",
    points: [
      { titre: "Les écrans",
        ou: "Gestion → rail.",
        texte: "ETP · Comparaison · Dotation · Budget · Répartition des périodes · Résultats · Distributions · "
             + "Population réelle · Configuration.",
        savoir: [
          "La dotation se lit par année civile, en périodes pondérées.",
          "La répartition des périodes prépare le document 2 sur deux années civiles.",
        ] },
      { titre: "Rapport ETP et ratio étudiants / ETP",
        ou: "Éditions → Gestion → Listes et rapports → Rapport ETP.",
        texte: "La charge par section, en ETP, avec le ratio étudiants / ETP.",
        savoir: [
          "Le ratio compte les étudiants réellement inscrits cette année, dans leur section de rattachement. L'estimation par UE ne sert qu'à défaut.",
        ] },
    ],
  },
  {
    id: 'documentation', titre: 'Documentation', Icone: IconBook,
    resume: "Les textes à connaître, ce mode d'emploi, les conventions.",
    points: [
      { titre: "Textes et procédures",
        ou: "Documentation → Textes et procédures.",
        texte: "Décrets, circulaires, règlements et procédures de l'Institut. Ce qui vous attend passe en tête. "
             + "Ouvrez le texte, puis cochez « Je confirme avoir pris connaissance de ce document ».",
        savoir: [
          "La case ne se coche qu'une fois le texte affiché.",
          "Une version publiée ne se modifie plus. Une nouvelle version dit si elle demande une nouvelle confirmation.",
          "Déposer et publier un texte : direction (« Déposer un texte »). Un Word ou un PDF déposé est analysé ; rien ne s'écrit avant la publication.",
        ] },
      { titre: "Conventions",
        ou: "Documentation → Conventions (direction, secrétariat, coordination).",
        texte: "Le registre de l'année, filtrable par famille, état et section. États : Déposée — à signer · "
             + "Signée par l'IIP · Contresignée · Échue · Retirée. Rail : « Nouvelle convention », "
             + "« Déposer un document du partenaire », « Modèles de convention ».",
        savoir: [
          "« Nouvelle convention » : choisissez la famille (convention-cadre de stage, partenariat pédagogique, convention entre établissements), remplissez, « Aperçu », puis « Composer ».",
          "Une convention de stage reçue d'un lieu se dépose aussi sur le stage (fiche → Stages).",
          "La signature se fait sur le Tableau de bord, bloc « À signer », par le signataire de l'établissement, en un clic.",
          "L'exemplaire revenu signé par le partenaire se dépose sur la ligne : la convention passe « Contresignée ».",
          "Retirer une convention signée : motif écrit. Chaque convention a son journal, qui ne s'efface pas.",
          "Les modèles sont versionnés ; les modifier est réservé à la direction.",
        ] },
    ],
  },
  {
    id: 'config', titre: 'Configuration (direction)', Icone: IconSettings,
    resume: "Identité, documents et envois, rôles et accès, couleurs.",
    points: [
      { titre: "Identité fait foi",
        ou: "Configuration → Établissement → Identité.",
        texte: "Nom, adresse, n° ECOT, FASE, téléphone et site : toutes les pièces les lisent ici. Le signataire des "
             + "pièces se règle dans la section Direction.",
        savoir: [
          "Corriger ici corrige toutes les pièces produites ensuite.",
        ] },
      { titre: "Documents et envois",
        ou: "Configuration → Documents et envois.",
        texte: "Quatre onglets : Modèles de pièces · Pièces officielles (contrat, attestation, diplôme, recrutement) · "
             + "Descriptifs d'UE · Courriels.",
        savoir: [
          "Ce qui est parti par courriel se relit dans Configuration → Système → Registre des envois : quand, par qui, à qui, quoi, avec une copie.",
        ] },
      { titre: "Rôles et accès",
        ou: "Configuration → Accès → Rôles et accès.",
        texte: "« Plafonds par rôle » : ce que chaque rôle autorise au mieux, module par module. « Accès par "
             + "personne » : ce que chaque compte a réellement. « Les gestes » : pour chaque geste et chaque rôle, "
             + "oui, non, ou par demande pour la coordination.",
        savoir: [
          "Un clic sur une case ouvre un menu : Oui, Non, Par demande (coordination), ou « Revenir au défaut ». Le réglage en vigueur est coché.",
          "Les cases au cadenas restent à la direction : configuration, validation et décision ne se retirent pas.",
          "Chaque changement entre dans le « Journal des réglages », sous la grille.",
          "L'accès d'une personne se modifie sur sa fiche, onglet « Accès Lucie ».",
        ] },
      { titre: "Procédures et délais",
        ou: "Configuration → Enseignement → Procédures et délais.",
        texte: "Délais légaux et listes types : motifs de refus et remarques de dispense partielle en VA, catalogue "
             + "des aménagements raisonnables, mention des voies de recours.",
        savoir: [
          "Dans une liste, une ligne « # Titre » ouvre un groupe.",
        ] },
      { titre: "Thèmes et couleurs",
        ou: "Configuration → Système → Thèmes et couleurs.",
        texte: "Toutes les couleurs de Lucie se règlent ici : écran, états, repères, fonds. Le thème « Maison IIP » "
             + "(couleurs du logo) est le défaut ; « Lucie d'origine » reste disponible.",
        savoir: [
          "Les pièces imprimées gardent la charte de l'Institut, quel que soit le thème.",
        ] },
      { titre: "Sauvegardes",
        ou: "Configuration → Système → Sauvegardes.",
        texte: "Une copie quotidienne, contrôlée à chaque exécution.",
        savoir: [
          "La restauration reste manuelle, sur le serveur.",
        ] },
    ],
  },
];

// Aide contextuelle, affichée depuis l'en-tête d'une page.
export const AIDE_CONTEXTUELLE = {
  '/organisation': { titre: 'Organisation', lien: 'organisation', points: [
    "La numérotation des groupes se règle par section.",
    "Les périodes d'un cours tombent sur un multiple du dossier pédagogique ; l'autonomie se compte à part.",
    "Les attributions HELB ne pèsent pas sur la dotation de l'établissement.",
  ] },
  '/etudiants': { titre: 'Étudiants', lien: 'etudiants', points: [
    "L'œil de la fiche ouvre la revue du PAE : on y compose et on y valide.",
    "Un trait pointillé signale une règle interne : elle avertit sans interdire.",
    "Jamais de cote sous 10 sur un document remis à l'étudiant : c'est « NA ».",
  ] },
  '/professeurs': { titre: 'Personnel', lien: 'personnel', points: [
    "L'ETP de la liste porte sur l'année consultée.",
    "Les accès se règlent sur la fiche, onglet « Accès Lucie ».",
    "Un compte ayant signé des décisions est désactivé, non supprimé.",
  ] },
  '/gestion': { titre: 'Gestion', lien: 'gestion', points: [
    "La dotation se lit par année civile, en périodes pondérées.",
    "La répartition prépare le document 2 sur deux années civiles.",
    "Le Rapport ETP sort par Éditions → Gestion → Listes et rapports.",
  ] },
  '/configuration': { titre: 'Configuration', lien: 'config', points: [
    "Identité fait foi : toutes les pièces y lisent l'établissement.",
    "Chaque réglage d'un geste entre dans le journal des réglages.",
  ] },
};

export function BoutonAide({ page }) {
  const [ouvert, setOuvert] = useState(false);
  const aide = AIDE_CONTEXTUELLE[page];
  if (!aide) return null;

  return (
    <div className="relative">
      <button onClick={() => setOuvert(v => !v)}
        className="w-7 h-7 rounded-full bg-slate-100 hover:bg-iip-turquoise/20 flex items-center
                   justify-center text-slate-500 hover:text-iip-blue transition"
        title={`Aide — ${aide.titre}`}>
        <IconHelpCircle size={16} />
      </button>
      {ouvert && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOuvert(false)} />
          <div className="absolute right-0 top-9 z-50 bg-white border border-slate-200 rounded-xl
                          shadow-lg w-80 p-4">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[13px] font-semibold text-iip-blue">{aide.titre}</span>
              <button onClick={() => setOuvert(false)} className="text-slate-400 hover:text-slate-600">
                <IconX size={14} />
              </button>
            </div>
            <ul className="space-y-2">
              {aide.points.map((p, i) => (
                <li key={i} className="text-[12px] text-slate-600 leading-relaxed pl-3 border-l-2
                                       border-slate-200">
                  {p}
                </li>
              ))}
            </ul>
            <a href={`/aide#${aide.lien}`}
              className="mt-3 block text-[12px] text-iip-turquoise hover:underline text-center">
              Voir le mode d'emploi complet
            </a>
          </div>
        </>
      )}
    </div>
  );
}

/* La recherche lit tout ce que le point dit : titre, chemin, texte, règles. */
const texteDuPoint = p => [p.titre, p.ou, p.texte, ...(p.savoir || [])].filter(Boolean).join(' ').toLowerCase();

export default function Aide({ integre = false }) {
  const [recherche, setRecherche] = useState('');
  const [ouverte, setOuverte] = useState('demarrage');

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return RUBRIQUES;
    return RUBRIQUES
      .map(r => ({ ...r, points: r.points.filter(p => texteDuPoint(p).includes(q)) }))
      .filter(r => r.points.length || r.titre.toLowerCase().includes(q));
  }, [recherche]);

  return (
    // Intégré à Documentation, le cadre porte déjà la marge de page.
    <div className={`${integre ? '' : 'p-5 '}space-y-4 max-w-[1100px]`}>
      <div>
        <h2 className="titre-ecran mb-0">Mode d’emploi de Lucie</h2>
        <p className="text-sm text-slate-500">
          Ce mode d’emploi décrit Lucie {VERSION_DECRITE} (production). Pour chaque écran : où aller,
          ce qu’on y fait, et ce qu’il faut savoir.
        </p>
      </div>

      <div className="relative max-w-md">
        <IconSearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={recherche} onChange={e => setRecherche(e.target.value)}
          placeholder="Rechercher — PAE, valorisation, convention, présences…"
          className="w-full border border-slate-300 rounded-lg pl-9 pr-8 py-2 text-sm" />
        {recherche && (
          <button onClick={() => setRecherche('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <IconX size={15} />
          </button>
        )}
      </div>

      {!filtrees.length ? (
        <div className="py-10 text-center text-sm text-slate-400 border-2 border-dashed rounded-xl">
          Rien ne correspond à « {recherche} ».
        </div>
      ) : (
        <div className="space-y-2">
          {filtrees.map(r => {
            const deployee = !!recherche || ouverte === r.id;
            return (
              <div key={r.id} id={`aide-${r.id}`}
                className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                <button onClick={() => setOuverte(o => (o === r.id ? null : r.id))}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
                  <r.Icone size={18} stroke={1.6} className="text-slate-400 flex-none" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-iip-blue">{r.titre}</div>
                    <div className="text-[12px] text-slate-500">{r.resume}</div>
                  </div>
                  <span className="text-slate-400 text-[13px]">{deployee ? '−' : '+'}</span>
                </button>

                {deployee && (
                  <div className="border-t border-slate-100 divide-y divide-slate-100">
                    {r.points.map((p, i) => (
                      <div key={i} className="px-4 py-3">
                        <div className="text-[13px] font-medium text-slate-800 mb-0.5">{p.titre}</div>
                        {p.ou && (
                          <p className="text-[12px] text-slate-500 mb-1">
                            <span className="font-semibold text-slate-600">Où : </span>{p.ou}
                          </p>
                        )}
                        <p className="text-[12px] text-slate-600 leading-relaxed">{p.texte}</p>
                        {p.savoir?.length > 0 && (
                          <div className="mt-1.5">
                            <div className="text-[11px] font-semibold text-slate-500">Ce qu’il faut savoir</div>
                            <ul className="mt-0.5 space-y-1">
                              {p.savoir.map((s, k) => (
                                <li key={k} className="text-[12px] text-slate-600 leading-relaxed pl-3
                                                       border-l-2 border-slate-200">{s}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-slate-400 pt-2">
        Les règles citées renvoient au décret du 16 avril 1991, au règlement des études et aux
        circulaires applicables ; en cas de divergence, ce sont ces textes qui font foi.
      </p>
    </div>
  );
}
