/* config.mjs — chapitre « Configuration (direction) » : ajouts et corrections.
 *
 * ORDRE PROPOSÉ des points du chapitre 'config', calqué sur les familles du rail de l'écran
 * (Établissement · Enseignement · Documents et envois · Accès · Système) :
 *
 *   — vue d'ensemble —
 *    1. Les cinq familles                                   (remplacé)
 *   — Établissement —
 *    2. Identité fait foi                                   (remplacé)
 *    3. Plusieurs établissements                            (remplacé)
 *    4. Années et calendrier : créer, renommer, supprimer une année   (ajout)
 *    5. Le calendrier des sessions                          (ajout)
 *    6. Coût des périodes                                   (ajout)
 *    7. Les inscrits prévus                                 (ajout)
 *   — Enseignement —
 *    8. Enseignement : le référentiel et les règles         (remplacé)
 *    9. Prérequis d'UE : le schéma et la liste              (ajout)
 *   10. Cursus compatibles                                  (ajout)
 *   11. Règles de délibération : ce que le Conseil ajourne  (ajout)
 *   12. Procédures et délais                                (remplacé)
 *   13. Planification : les valeurs de la grille            (ajout)
 *   — Documents et envois —
 *   14. Documents et envois                                 (existant)
 *   15. L'atelier de Lucie : les modèles de lettres         (ajout)
 *   16. La galerie des pièces, et corriger un modèle        (ajout)
 *   17. Le contrat de travail et les textes d'entretien     (ajout)
 *   18. Le modèle de diplôme et ses signataires             (ajout)
 *   19. Descriptifs d'UE                                    (ajout)
 *   20. Courriels : l'interrupteur, l'expéditeur, la redirection   (ajout)
 *   21. Le récapitulatif quotidien                          (ajout)
 *   22. Les rappels par courriel                            (existant)
 *   23. Réponses types : le catalogue commun                (ajout)
 *   — Accès —
 *   24. Accès, fonctions, sécurité                          (existant)
 *   25. Créer un rôle, et voir ce qu'un plafond fermerait   (ajout)
 *   26. Sécurité : le blocage et la vérification en deux temps   (ajout)
 *   27. Ouvrir Configuration en lecture (le service informatique) (existant)
 *   28. La mise en service des fonctions                    (existant)
 *   29. Les attestations des années passées dans les espaces (existant)
 *   — Système —
 *   30. Thèmes et couleurs                                  (existant)
 *   31. Régler l'apparence (administrateur)                 (existant)
 *   32. Revenir sur un réglage d'apparence                  (ajout)
 *   33. Le mode « Mise en page » : ranger barre, rails et blocs   (ajout)
 *   34. Sauvegardes                                         (remplacé)
 *   35. Transferts : fermer les portes du passé             (ajout)
 *   36. Traces et historique                                (ajout)
 *   37. Registre des envois                                 (ajout)
 *   38. Journal des modifications                                     (ajout)
 *   39. Nouveautés                                          (ajout)
 *   40. Traces                                              (remplacé : devient la synthèse des registres)
 *
 * Les remplacements qui portaient une capture la gardent telle quelle (même src, même légende) : rien n'est perdu.
 */

export const chapitres = [];

export const ajouts = {
  config: [
    /* ── Établissement ───────────────────────────────────────────────────── */
    {
      titre: "Années et calendrier : créer, renommer, supprimer une année",
      ou: "Configuration → Établissement → Années et calendrier.",
      texte: "La liste des années scolaires, avec leur libellé et leur date de création. [[Nouvelle année|IconPlus]] ouvre la fenêtre « Nouvelle année scolaire » : un code au format AAAA-AAAA, un libellé, puis les données de départ — « Page blanche », « Copier tout depuis une année existante » (sections, unités, cours, points des acquis et lignes d'attribution, sans les professeurs), ou « Choisir les UE à reprendre », qui crée l'année vide puis ouvre un assistant pour cocher, section par section, les unités à importer. Sur chaque ligne : [[Activer]], [[Renommer|IconPencil]], [[Supprimer|IconTrash]].",
      savoir: [
        "« Activer » change l'année de travail de cet écran, sur cet appareil : la page se recharge sur l'année choisie. Les autres personnes gardent la leur.",
        "Copier ne reprend pas le poids des cours : à partir de 2026-2027, ce sont les périodes du dossier pédagogique qui font foi ; seuls les points des acquis suivent.",
        "Renommer réécrit l'année partout dans Lucie. Refusé si le nouveau code existe déjà.",
        "Supprimer efface les attributions, organisations, unités, cours et EA12 de l'année, après confirmation. Lucie refuse de supprimer la dernière année restante. Irréversible : faites une sauvegarde d'abord.",
        "Créer, renommer et supprimer sont réservés à la direction.",
      ],
    },
    {
      titre: "Le calendrier des sessions",
      ou: "Configuration → Établissement → Années et calendrier, carte « Calendrier des sessions ».",
      texte: "Sous la liste des années, les délais qui fixent la dernière semaine de cours possible. On part du dernier jour de travail du personnel administratif, puis on remonte : jours ouvrables réservés aux recours, délai entre la délibération de seconde session et les recours, durée de cette délibération, corrections avant elle, écart entre la visite des copies de première session et la seconde session, entre la délibération et la visite des copies, entre l'examen et la délibération, et enfin entre le dernier cours et l'examen. Le planificateur en déduit chaque date de la chaîne.",
      savoir: [
        "Tant que le dernier jour administratif est vide, la chaîne ne se calcule pas.",
        "Une valeur modifiée se marque « modifié » ; la barre en tête dit combien de changements attendent, et [[Enregistrer|fort]] les écrit ensemble. La croix d'une ligne annule sa modification avant l'enregistrement.",
      ],
    },
    {
      titre: "Coût des périodes",
      ou: "Configuration → Établissement → Coût des périodes.",
      texte: "Les montants en euros d'une période de cours, par niveau (supérieur de type court, secondaire supérieur, secondaire inférieur) et par type de cours (généraux, spéciaux, pratique professionnelle), avec le texte de référence de la circulaire et sa date d'effet ; le coût moyen brut pondéré d'une période par niveau ; les taux des experts et leurs plafonds ; le coût annuel d'un temps plein par fonction ; et quelques valeurs de gestion — forfaits de la valorisation des acquis (par UE, supplément, admission), date limite des demandes de VA de l'année, sections sans frais complémentaires, sections dont un tiers perçoit les droits. À corriger à chaque nouvelle circulaire.",
      savoir: [
        "Ces montants font les « Rapport statistique » d'Éditions → Gestion, le coût des formations de Gestion, la note de frais et l'accusé de réception d'une demande de VA.",
        "Un coût moyen brut à 0 veut dire « à régler », jamais zéro euro.",
        "Seule la direction modifie ces valeurs ; elles valent pour toutes les sections.",
      ],
    },
    {
      titre: "Les inscrits prévus",
      ou: "Configuration → Établissement → Coût des périodes, carte « Inscrits prévus » (aussi dans Éditions, avant le rapport).",
      texte: "Pour une section ou une unité qui n'a encore aucun inscrit encodé, on pose à la main le nombre attendu : choisir la section, puis la section entière et chaque unité. [[Déposer les pré-inscriptions (.xlsx)]] lit un fichier de pré-inscriptions et propose un nombre par section, que « reprendre » recopie dans la case. [[Enregistrer|fort]] garde les chiffres de l'année de travail.",
      savoir: [
        "Ces chiffres ne servent qu'au « Rapport statistique », où ils sont marqués « prévu ».",
        "Un inscrit réel l'emporte toujours : la case se ferme dès qu'il en existe un.",
        "Les pré-inscriptions sont proposées, jamais enregistrées d'office.",
      ],
    },

    /* ── Enseignement ────────────────────────────────────────────────────── */
    {
      titre: "Prérequis d'UE : le schéma et la liste",
      ou: "Configuration → Enseignement → Prérequis d'UE.",
      texte: "Choisir une section, puis l'une des deux faces. « Schéma » : le schéma de capitalisation de la section ; [[Modifier les prérequis]] passe en mode liens, on choisit « Dossier pédagogique » ou « Règle interne », puis on tire depuis la pastille droite d'une UE vers celle qu'elle conditionne ; un clic sur un trait le supprime ; [[Terminer les liens]] referme. « Liste » : « UE qui dépend de… » et « …doit être terminée après », puis [[+ Ajouter|fort]] ; chaque ligne se retire par sa croix.",
      savoir: [
        "Un prérequis du dossier pédagogique BLOQUE l'unité tant qu'il n'est pas acquis ; une règle interne AVERTIT sans interdire, et demande un motif, qu'on relit au survol du trait (dessiné en pointillé).",
        "Les prérequis valent pour toutes les années : les modifier fait bouger les schémas, le PAE et les propositions déjà établis.",
        "Lucie refuse un lien qui formerait une boucle (l'UE visée dépend déjà de celle qu'on veut conditionner) et une UE prérequise d'elle-même.",
        "Réservé à la direction.",
      ],
    },
    {
      titre: "Cursus compatibles",
      ou: "Configuration → Enseignement → Cursus compatibles.",
      texte: "Quand un étudiant change de section, son cursus précédent est archivé : il sort du schéma et du PAE. Deux sections déclarées compatibles se suivent ensemble, sans que l'une archive l'autre. On choisit deux sections, puis [[Déclarer compatibles|fort]] ; une paire se défait par [[Retirer]].",
      savoir: [
        "Aucune paire n'est déclarée d'office : sans paire, tout changement de section archive le cursus précédent.",
        "Réservé à la direction.",
      ],
    },
    {
      titre: "Règles de délibération : ce que le Conseil ajourne",
      ou: "Configuration → Enseignement → Règles de délibération.",
      texte: "Une règle de l'établissement que le décret ne fixe pas, et qui fait le contenu de la notification d'ajournement. « Ajournement par cours » : le Conseil ajourne un cours, et TOUS ses acquis sont à représenter avec lui. « Ajournement par acquis » : il ajourne un acquis, et l'étudiant ne représente que ce qui n'est pas maîtrisé. Par acquis, une seconde question : une épreuve unique par acquis, ou une épreuve dans chaque cours où l'acquis est évalué. [[Enregistrer|fort]].",
      savoir: [
        "La règle vaut pour toutes les délibérations de l'établissement, quelle que soit l'année affichée en tête de la rubrique.",
        "Le reste des règles — sur quoi le Conseil délibère en première et en seconde session, l'arrondi — se règle dans Étudiants → Délibération, entrée « Règles de délibération ».",
        "Le seuil de réussite de l'unité (10/20) est celui du décret : il ne se règle nulle part.",
      ],
    },
    {
      titre: "Planification : les valeurs de la grille",
      ou: "Configuration → Enseignement → Planification.",
      texte: "Les valeurs que la planification et la grille d'organisation emploient au lieu de les deviner : les heures comptées pour l'examen de première session (EV1), de seconde session (EV2) et pour la visite des copies (VC), la durée d'une période en minutes, le nombre de périodes proposées pour l'examen de fin d'UE et la visite des copies, et le nombre minimal de semaines libres entre les deux sessions.",
      savoir: [
        "La durée d'une période (50 minutes chez nous) sert à toutes les conversions entre périodes et heures de la grille : la changer change tous les calculs.",
        "Mêmes gestes que les autres paramètres : « modifié » sur la ligne, [[Enregistrer|fort]] dans la barre en tête. Direction seule.",
      ],
    },

    /* ── Documents et envois ─────────────────────────────────────────────── */
    {
      titre: "L'atelier de Lucie : les modèles de lettres",
      ou: "Configuration → Documents et envois → Modèles de pièces, face « L’atelier de Lucie ».",
      texte: "Ici s'écrivent les modèles libres — une confirmation d'inscription, un courrier — que l'on produit ensuite pour chaque étudiant dans Éditions → Étudiants → Divers. La barre : « Modèles » ouvre un modèle enregistré (avec une recherche), [[Nouveau|IconPlus]] en commence un, « Word » importe un document .docx comme nouveau modèle, « Page » règle le format et les marges. Trois façons de composer : « Atelier » (des éléments tout faits glissés sur la feuille), « Texte » (comme un traitement de texte, avec les champs et les listes répétées du panneau de droite), « HTML ». [[Aperçu|IconEye]] compose la pièce sur des données d'exemple choisies (section, membre du personnel, étudiant, unité) ; [[Enregistrer|IconDeviceFloppy|fort]].",
      savoir: [
        "Les champs s'insèrent d'un clic depuis le panneau de droite (étudiant, établissement, professeur, unité, contrat…) et se remplissent à la production.",
        "Quitter l'atelier pour le texte libre est sans retour : le modèle ne se rouvrira plus dans l'atelier avec ses éléments ; Lucie le demande avant.",
        "Supprimer un modèle est réservé à la direction.",
      ],
    },
    {
      titre: "La galerie des pièces, et corriger un modèle",
      ou: "Configuration → Documents et envois → Modèles de pièces, face « Galerie des pièces ».",
      texte: "Un exemple de chaque document que Lucie sait produire, rangé par domaine, avec une recherche. Chaque pièce s'ouvre sur un dossier tiré de la base ; la barre permet de choisir l'année, la section, l'étudiant, l'unité, la session… L'aperçu passe par la même fonction que la vraie pièce : ce qu'on voit est ce qui sortira. Rien ne s'enregistre ni ne s'archive. Les icônes du bandeau ouvrent l'aperçu ou le PDF.",
      savoir: [
        "[[Modifier le modèle|IconPencil]] (direction) ouvre l'éditeur à gauche : police et taille du texte, champs à insérer, blocs calculés à déplacer — les blocs au cadenas sont obligatoires et un modèle qui en perd un ne s'enregistre pas.",
        "On corrige aussi une phrase en cliquant dessus dans la pièce : elle rejoint la liste « Phrases réécrites », rejouée à chaque sortie. Une phrase qui porte un nom ou une date ne vaut que pour cet exemple.",
        "[[Enregistrer la version|fort]] crée une version nouvelle, avec « ce qui change » : c'est elle que portent désormais les pièces. « Historique » liste les versions, qui et quand ; [[Reprendre]] en rétablit une ; [[Modèle d’origine|IconArrowBackUp]] revient au modèle de Lucie, l'historique restant gardé.",
        "Si l'exemple choisi ne permet pas de produire la pièce, elle est composée sur un dossier inventé et marquée « Spécimen — données factices ». Les pièces composées à l'écran sont listées à part et renvoient vers leur écran.",
      ],
    },
    {
      titre: "Le contrat de travail et les textes d'entretien",
      ou: "Configuration → Documents et envois → Pièces officielles, faces « Contrat » et « Recrutement ».",
      texte: "« Contrat » : le modèle HTML du contrat de travail des membres du personnel. Les variables (nom, adresse, NISS, année, cours attribués, total des périodes, ETP, phrase temps plein ou incomplet, établissement…) s'insèrent d'un clic. [[Prévisualiser]], [[Réinitialiser]] (retour au modèle par défaut, après confirmation), [[Enregistrer|fort]]. « Recrutement » : l'introduction et le mot de fin lus au candidat pendant l'entretien, chacun avec son [[Enregistrer|fort]], le nombre de caractères et la durée de lecture à voix haute.",
      savoir: [
        "Le contrat produit depuis la fiche d'un membre du personnel lit ce modèle.",
        "La face « Attestation » ne règle plus rien : nom, adresse, ECOT, FASE et signataire viennent d'Identité ; intitulé, titre, grade, durée, ECTS et périodes se règlent dans la fiche de chaque section (Organisation → la section → « Diplôme et attestation de section »).",
        "Réservé à la direction.",
      ],
    },
    {
      titre: "Le modèle de diplôme et ses signataires",
      ou: "Configuration → Documents et envois → Pièces officielles, face « Diplôme ».",
      texte: "Une page identique pour toutes les sections ; ce qui change se remplit seul (données de l'étudiant et de la section, mention, date de délibération). On choisit d'abord une section à prévisualiser : la case « Co-diplomation HELB » pose les deux logos et les signataires de la HELB, et le logo de co-diplomation s'importe juste en dessous. « Signataires par section » : le président ou la présidente du jury d'épreuve intégrée ([[Enregistrer le président]]), puis la rangée des signatures, où l'on glisse les signataires disponibles, de gauche à droite. [[Aperçu|IconEye]], [[Défaut|IconRefresh]], [[Enregistrer|IconDeviceFloppy|fort]].",
      savoir: [
        "Le titulaire, le président du jury et la direction sont trois personnes différentes : un diplôme qui porterait deux fois le même nom ne sort pas. L'écran prévient si le président saisi est le directeur.",
        "[[Revenir à la liste d’origine]] efface la liste propre d'une section.",
        "Lecture seule pour tout autre rôle que la direction. Le diplôme garde sa mise en page propre (paysage, sans pied de page).",
      ],
    },
    {
      titre: "Descriptifs d'UE",
      ou: "Configuration → Documents et envois → Descriptifs d'UE.",
      texte: "Les textes fixes du descriptif d'unité (DUE) : les finalités générales du décret, la mention sous les supports de cours, la règle d'évaluation par défaut (chaque UE peut la remplacer). Et une date : à partir d'elle, une séance de délibération de 2026-2027 ou après ne se clôt que sur une unité dont la DUE — et donc les pondérations — est validée.",
      savoir: [
        "Date vide : la délibération avertit seulement. Date posée et dépassée : la clôture est refusée, avec le numéro de l'UE à valider.",
        "Ces textes changent tous les descriptifs produits ensuite, pas ceux déjà sortis.",
      ],
    },
    {
      titre: "Courriels : l'interrupteur, l'expéditeur, la redirection",
      ou: "Configuration → Documents et envois → Courriels.",
      texte: "En tête, l'interrupteur « Envoi de documents par courriel » : allumé, les boutons « Envoyer » paraissent dans les aperçus et Éditions ; éteint, aucun n'apparaît et le serveur refuse tout envoi. « Expéditeur » : Microsoft 365 (recommandé, une application Entra sans mot de passe de boîte) ou un serveur SMTP ; [[Enregistrer|fort]], [[Vérifier la connexion]], puis [[Envoyer un essai|IconSend]] à une adresse. « Redirection de test » : une adresse saisie reçoit TOUS les courriels, le vrai destinataire écrit dans l'objet. « Journal des envois » : les 100 derniers, à qui, quand, et si c'est parti. Plus bas, le mot qui accompagne une pièce envoyée et la signature du courriel.",
      savoir: [
        "Un message en tête prévient quand l'envoi est impossible (pas de PDF sur ce serveur), simulé (aucun expéditeur enregistré) ou redirigé.",
        "La redirection vit dans la base du serveur : posée sur la version de test, elle n'existe pas en production. À vider pour envoyer réellement.",
        "La signature du courriel (« Le service administratif » par défaut ; vide = le nom de qui envoie) n'efface pas l'auteur : le registre des envois garde toujours la personne connectée.",
        "Les secrets de la messagerie ne se réaffichent jamais. Réglages réservés à la direction.",
      ],
    },
    {
      titre: "Le récapitulatif quotidien",
      ou: "Configuration → Documents et envois → Courriels, carte « Récapitulatif quotidien ».",
      texte: "Chaque matin, après 7 h, un courriel à chaque compte actif — seulement si une chose NOUVELLE l'attend depuis le précédent : une tâche, un texte à confirmer, un message non lu, une réponse à une de ses idées ; et, pour la direction, les idées déposées. Des intitulés et des nombres, un lien vers le tableau de bord, rien de sensible. Les rappels ordinaires y entrent aussi. L'interrupteur de la carte l'allume ou le coupe ; la carte dit ce que serait le vôtre aujourd'hui et la date du dernier envoi ; [[M’envoyer le mien maintenant]] l'essaie.",
      savoir: [
        "Un seul par personne et par jour.",
        "Automatique en production seulement : la version de test redirige tout vers une seule boîte.",
        "L'interrupteur est réservé à la direction ; l'essai, chacun peut se l'envoyer.",
      ],
    },
    {
      titre: "Réponses types : le catalogue commun",
      ou: "Configuration → Documents et envois → Réponses types.",
      texte: "Les phrases que tout le monde retrouve sous le bouton « Réponses types » des zones de texte, rangées champ par champ, avec une recherche. Par champ, [[Ajouter|IconPlus]] (la phrase, puis un intitulé de rangement facultatif, ex. Fraude, Délai) ; par phrase, le crayon pour la corriger et la corbeille pour la retirer. Les variables entre accolades — {etudiant}, {matricule}, {ue}, {ue_nom}, {section}, {session}, {annee}, {date}, {moi}… — se remplissent à l'insertion.",
      savoir: [
        "Un champ paraît ici dès qu'on lui a donné une première phrase — depuis le champ lui-même (« Enregistrer le texte du champ »), en la mettant au catalogue commun.",
        "Le catalogue commun est tenu par la direction seule ; les phrases personnelles de chacun ne figurent pas ici.",
      ],
    },

    /* ── Accès ───────────────────────────────────────────────────────────── */
    {
      titre: "Créer un rôle, et voir ce qu'un plafond fermerait",
      ou: "Configuration → Accès → Accès, cartes « Plafonds par rôle » et « Ce que le contrôle a vu ».",
      texte: "[[+ Nouveau rôle]] : un libellé (ex. Conseiller numérique), puis « Partir des plafonds de » un rôle existant, ou de rien (tout fermé) ; [[Créer|fort]]. Le rôle prend sa ligne dans la grille, et chaque case se règle d'un clic. La carte « Ce que le contrôle a vu » dit, personne par personne, ce qu'elle perdrait si les refus s'appliquaient : chaque ligne est une question — « cette personne devrait-elle y avoir accès ? » —, et la réponse est de relever un plafond, ou non.",
      savoir: [
        "La carte dit dans quel mode tourne le serveur : « mode strict — les refus s'appliquent » ou « mode constat — rien n'est refusé ».",
        "[[Vider|IconTrash]] repart d'une page blanche après avoir corrigé un plafond, pour mesurer l'effet du changement.",
        "Une liste vide ne veut pas dire que tout est réglé : seulement que personne n'a encore touché à ce qui lui est fermé.",
      ],
    },
    {
      titre: "Sécurité : le blocage et la vérification en deux temps",
      ou: "Configuration → Accès → Sécurité ; pour la vérification en deux temps, Configuration → Accès → Accès, colonne « 2 temps ».",
      texte: "« Sécurité » règle le blocage d'un compte après des mots de passe erronés : le blocage en service ou non, le nombre d'erreurs avant blocage (5 par défaut), et les durées successives en minutes (15, 60, 1440 par défaut) — le blocage s'aggrave à chaque série, et le compteur repart de zéro après vingt-quatre heures sans erreur. Dans la grille « Accès par personne », la colonne « 2 temps » dit qui a activé la vérification en deux temps ; « débloquer » la réinitialise.",
      savoir: [
        "Désactiver le blocage rouvre la porte aux essais en série : à ne faire que le temps de régler un incident. Une valeur absurde retombe sur le défaut, jamais sur une porte ouverte.",
        "La vérification en deux temps s'active par chacun, depuis « Mon compte » : il y faut son téléphone. Personne ne l'active à la place d'un autre.",
        "Réinitialiser le second facteur d'une personne : direction seule, jamais sur son propre compte, avec un motif conservé au journal ; la personne en est avisée par courriel — si le courriel ne part pas, Lucie le dit et il faut la prévenir.",
        "« Envoyer le lien » adresse à la personne un lien pour choisir son mot de passe : on ne choisit jamais celui d'un autre.",
      ],
    },

    /* ── Système ─────────────────────────────────────────────────────────── */
    {
      titre: "Revenir sur un réglage d'apparence",
      ou: "Configuration → Système → Formes et composants · Thèmes et couleurs · Catalogue des éléments : [[↶ Annuler le dernier changement]].",
      texte: "Les réglages d'apparence s'enregistrent sans bouton, dès qu'on touche un curseur ou une couleur. Chaque écriture garde d'abord l'état qu'elle remplace : le bouton rétablit le dernier, et se répète pour reculer encore. Il dit combien de pas restent possibles.",
      savoir: [
        "Un curseur qu'on fait glisser compte pour un seul changement : les écritures d'une même personne à moins de vingt secondes forment un seul pas.",
        "Cinquante pas sont gardés, par famille de réglages (formes, couleurs, mise en page), même le lendemain.",
        "Annuler demande les mêmes droits que le réglage qu'on annule.",
      ],
    },
    {
      titre: "Le mode « Mise en page » : ranger la barre, les rails et les blocs",
      pour: "dir",
      ou: "Barre du haut, l'icône de mise en page (compte administrateur).",
      texte: "Allumé, le bouton devient « Mise en page » et l'on range à la souris, sur les pages elles-mêmes : l'ordre des métiers de la barre du haut, l'ordre des rubriques dans chaque rail, et les blocs des pages qui les déclarent (aujourd'hui le tableau de bord : déplacer, masquer, demi-largeur). Ce qu'on range vaut pour toute l'école. Un second clic termine.",
      savoir: [
        "Réservé au compte administrateur : les autres ne voient pas le bouton.",
        "Pendant la mise en page, [[↶ Annuler]] paraît à côté et défait le dernier rangement.",
        "Ranger ne change aucun droit : une rubrique fermée à un rôle le reste.",
      ],
    },
    {
      titre: "Transferts : fermer les portes du passé",
      pour: "dir",
      ou: "Configuration → Système → Transferts (compte administrateur).",
      texte: "Les portes qui ont fait entrer le passé dans Lucie : le classeur de suivi et le tableau plat, les décisions délibérées dans le classeur, l'historique depuis les classeurs, le classeur de PAE de la coordination, la clôture d'une année reprise d'archives. Une ligne par porte, une colonne par année ; un clic sur « ouvert » la ferme, un clic sur « fermé » la rouvre. Une porte fermée pour une année disparaît des écrans et le serveur la refuse ; ce qui est déjà entré reste intact et lisible.",
      savoir: [
        "Rouvrir se motive (cinq caractères au moins) ; le journal sous la grille garde chaque geste, qui, quand et pourquoi.",
        "Les imports courants (eCampus, signalétique, liste HELB, dossier pédagogique, notes d'une unité) ne sont pas ici : ils restent là où l'on s'en sert.",
        "Visible du seul compte administrateur.",
      ],
    },
    {
      titre: "Traces et historique",
      ou: "Configuration → Système → Traces et historique.",
      texte: "Quatre cartes. « Conservation des traces » : après combien de mois l'historique des attributions ne garde plus que qui, quand et quoi (18 par défaut ; 0 = jamais). « Historique des modifications » : l'interrupteur qui garde une copie complète de chaque attribution avant toute modification, pour pouvoir revenir en arrière. « Sauvegarde de la base de données » : [[Télécharger|IconDownload|fort]] une copie complète de la base sur l'ordinateur. « Purge d'une année scolaire » : supprimer toutes les attributions, UE, cours, organisations et EA12 d'une année — pour nettoyer une année d'essai.",
      savoir: [
        "Passé le délai de conservation, une ligne d'attribution aussi ancienne ne se restaure plus.",
        "Télécharger la base est réservé à la direction, même quand Configuration est ouverte en lecture à d'autres : elle contient tout.",
        "La purge demande une confirmation nommant l'année ; elle est irréversible — faites une sauvegarde d'abord.",
      ],
    },
    {
      titre: "Registre des envois",
      ou: "Configuration → Système → Registre des envois.",
      texte: "Tout courriel parti de Lucie — délibération, Éditions, aperçus, diplomation, aménagements — et toute pièce déposée dans l'espace d'un étudiant : quand, par qui, à qui, ce qu'il contenait. Une ligne par envoi groupé, qui se déplie destinataire par destinataire, avec son état (envoyé, simulé, échec, dans l'espace). Filtres : du… au… (les trente derniers jours par défaut), l'expéditeur, une recherche (nom, sujet, contenu, référence). Quatre tuiles : envois, courriels, en échec, sans copie.",
      savoir: [
        "Depuis le 30 septembre 2026, chaque envoi garde une copie du document, refaite à l'identique (même signature, même référence) : [[Copie]] la rouvre. Les envois antérieurs disent à qui et quand, pas quoi.",
        "Le registre garde le nom de la personne connectée qui a envoyé, quelle que soit la signature du courriel.",
      ],
    },
    {
      titre: "Journal des modifications",
      pour: "dir",
      ou: "Configuration → Système → Journal des modifications (compte administrateur).",
      texte: "Un seul écran qui réunit les registres déjà tenus ailleurs — attributions, valorisation, procédures, comptes, dossiers, documents, parcours, envois, PAE, délibération, conventions, présences, suivi, fiches, PAE et notes — pour répondre à la question qu'on se pose après coup : qu'a fait cette personne ? Filtres : « Tout le monde » ou une personne (avec son nombre de gestes), « Tous les registres » ou un seul, du… au… ; [[Tout afficher]] les efface.",
      savoir: [
        "Il ne crée aucun registre de plus : il lit ceux qui s'écrivent déjà, et rien n'y est modifiable.",
        "Une personne est reconnue à son compte, pas à la façon dont son nom s'écrit d'un registre à l'autre.",
        "Visible du seul compte administrateur.",
      ],
    },
    {
      titre: "Nouveautés",
      ou: "Configuration → Système → Nouveautés.",
      texte: "Le journal des versions de Lucie, jour par jour, du plus récent au plus ancien : chaque changement livré, marqué « Correctif », « Nouveauté » ou « Amélioration ». C'est la liste technique et complète ; le guide des nouveautés, rédigé par public, est la tuile « Quoi de neuf » du tableau de bord.",
    },
  ],
};

export const remplacements = {
  "config|Les cinq familles": {
    titre: "Les cinq familles",
    ou: "Configuration (barre du haut) → rail : une icône par famille ; la famille ouverte se déplie, avec une icône par rubrique.",
    texte: "Établissement : Identité · Années et calendrier · Coût des périodes. Enseignement : Unités et cours · Prérequis d'UE · "
         + "Cursus compatibles · Règles de délibération · Procédures et délais · Planification. Documents et "
         + "envois : Modèles de pièces · Pièces officielles · Descriptifs d'UE · Courriels · Réponses types. "
         + "Accès : Accès · Sécurité · Mise en service. Système : Thèmes et couleurs · Formes et composants · Catalogue des éléments · "
         + "Sauvegardes · Transferts · Traces et historique · Registre des envois · Journal des modifications · Nouveautés.",
    savoir: [
      "On y règle des MODÈLES et des règles ; on n'y produit pas de pièces (c'est l'avion).",
      "Le titre de l'écran dit la famille et la rubrique ouvertes. Les rubriques annuelles (Unités et cours, Prérequis d'UE, Règles de délibération) portent l'année de travail en tête ; la changer là change l'année de travail.",
      "Transferts et Journal des modifications ne paraissent que pour le compte administrateur.",
    ],
  },

  "config|Identité fait foi": {
    titre: "Identité fait foi",
    ou: "Configuration → Établissement → Identité.",
    texte: "« Identification de l'établissement » : Pouvoir organisateur (nom et type), nom de l'établissement, adresse, n° ECOT, FASE, n° d'entreprise, site web, adresse de contact, adresses officielles, nombre de jours de fonctionnement par semaine, et le compte des frais étudiants (IBAN). « Direction » : le nom porté sous la signature et le sceau des pièces. « Gestionnaire du dossier » : la personne joignable par l'Administration. « Mise en page des documents » : le logo en en-tête et les champs du pied de page, avec l'aperçu du pied. Un seul [[Enregistrer|fort]] en bas.",
    savoir: [
      "Toutes les pièces lisent ici : corriger ici corrige tout ce qui sort ensuite.",
      "L'IBAN est contrôlé : un numéro invalide est refusé. Il s'imprime sur la note de frais, avec la communication structurée de l'étudiant et le QR de paiement ; sans IBAN, pas de QR.",
      "Le nombre de jours de fonctionnement se reporte sur les EA12. Un champ vide du pied de page se signale « (vide) ».",
      "Le nom du bloc « Direction » est celui de l'IIP ; la fiche d'un autre établissement n'a pas encore de champ de signataire à l'écran.",
    ],
  },

  "config|Plusieurs établissements": {
    titre: "Plusieurs établissements",
    ou: "Configuration → Établissement → Identité, en tête de l'écran.",
    texte: "Plusieurs établissements gérés par le même conseil d'administration, aux étudiants séparés ou partagés. Un onglet par établissement (son code court) ; on choisit celui dont on règle la fiche. [[+ Établissement]] en crée un (son nom, puis son code court, ex. HELB, EPFC). Chacun a quatre images : logo, logo blanc, signature de la direction, cachet — [[Importer une image]] sous chacune, « retirer » pour l'ôter. Dès qu'il y a deux établissements, la carte « Sections et établissements » rattache chaque section au sien : ses pièces en portent alors l'identité.",
    savoir: [
      "Les images et les établissements se gèrent au compte administrateur : 2 Mo au plus, PNG, JPEG, WebP ou SVG, contrôlés à leur contenu.",
      "Une image retirée de l'IIP laisse revenir l'image d'origine ; pour un autre établissement, une image absente retombe sur celle de l'IIP.",
      "L'IIP, premier établissement, ne se retire pas ; un autre ne se retire que s'il ne porte plus aucune section ([[Retirer cet établissement]]).",
    ],
    images: [
      { src: "/guide/config-identite.png", legende: "Configuration → Identité : un onglet par établissement et [[+ Établissement]] pour en ajouter un ; ses quatre images (logo, logo blanc, signature, cachet), chacune avec [[Importer une image]], puis sa fiche d'identification." },
    ],
  },

  "config|Enseignement : le référentiel et les règles": {
    titre: "Enseignement : le référentiel et les règles",
    ou: "Configuration → Enseignement.",
    texte: "« Unités et cours » : sections, unités et cours de l'année ([[Nouvelle section|IconPlus]], [[Nouvelle UE|IconPlus|fort]], « Importer des UE », effectifs), fiche de section. « Prérequis d'UE ». « Cursus compatibles » : deux sections qu'un étudiant suit ensemble, sans que l'une archive l'autre. « Règles de délibération » : ce que le Conseil ajourne. « Procédures et délais ». « Planification » : ses paramètres.",
    savoir: [
      "Le seuil de réussite de l'unité (10/20) est celui du décret : il ne se règle pas.",
      "Unités et cours se lisent pour l'année de travail affichée en tête ; prérequis, cursus compatibles et règles de délibération valent pour toutes les années.",
    ],
    images: [
      { src: "/guide/config-unites.png", legende: "Configuration → Unités et cours : l'année de travail, [[Importer effectifs étudiants]], [[Nouvelle section|IconPlus]], [[Import DP|IconUpload]], [[Nouvelle UE|IconPlus|fort]], et les faces Sections · UE · Tableau global · Activités." },
    ],
  },

  "config|Procédures et délais": {
    titre: "Procédures et délais",
    ou: "Configuration → Enseignement → Procédures et délais.",
    texte: "Les délais du recours (introduction, décision interne, recours externe en jours calendrier et en jours ouvrables) et l'adresse de la direction portée dans les procès-verbaux. Les listes types : motifs de refus et remarques de dispense partielle de la valorisation, avis types du chargé de cours, catalogue des mesures d'aménagement raisonnable, mention des voies de recours d'une décision d'aménagement, exemples montrés aux candidats pour l'épreuve d'admission de chaque section ; et l'interrupteur qui prévient par courriel les chargés de cours appelés à rendre un avis de VA. En dessous, les « Justifications types — Procédure de recours », proposées en cases à cocher dans le formulaire de recours : chacune se corrige sur place, monte ou descend, se supprime ; [[Ajouter|IconPlus|fort]] en ajoute une.",
    savoir: [
      "Dans une liste, une ligne « # Titre » ouvre un groupe.",
      "Les justifications de recours s'enregistrent dès qu'on quitte le champ ; « Sauvegardé » ne s'affiche que si le serveur l'a confirmé.",
      "La mention des voies de recours des aménagements n'est pas écrite dans le code : c'est ce texte-ci qui s'imprime sur la décision et la notification.",
    ],
    images: [
      { src: "/guide/config-procedures.png", legende: "Configuration → Procédures et délais : une liste type (ici les justifications de la procédure de recours), chaque phrase modifiable ou supprimée ; en bas, la nouvelle phrase et [[Ajouter|IconPlus|fort]]." },
    ],
  },

  "config|Sauvegardes": {
    titre: "Sauvegardes",
    ou: "Configuration → Système → Sauvegardes.",
    texte: "Des copies cohérentes de la base, contrôlées à chaque exécution (intégrité et décompte des lignes principales). « Planification » : la sauvegarde quotidienne et son heure, puis combien en garder — quotidiennes, hebdomadaires, mensuelles : les plus récentes au jour le jour, puis une par semaine, puis une par mois. La liste dit, pour chaque copie, son déclencheur, son intégrité et son contenu ; la flèche la télécharge, la corbeille la supprime. [[Sauvegarder maintenant|fort]] en fait une sur-le-champ.",
    savoir: [
      "Un avertissement paraît en tête quand la dernière sauvegarde a plus de vingt-six heures ou n'a pas passé le contrôle.",
      "Télécharger une copie est réservé à la direction : elle contient toute la base.",
      "La restauration reste manuelle, sur le serveur. Indépendamment de Lucie, le serveur envoie aussi une copie de la base vers le NAS de l'école.",
    ],
    images: [
      { src: "/guide/config-sauvegardes.png", legende: "Configuration → Sauvegardes : la planification (heure, nombre de copies gardées) et la liste des copies avec leur contrôle d'intégrité ; la flèche de chaque ligne la télécharge, [[Sauvegarder maintenant|fort]] en haut à droite." },
    ],
  },

  "config|Traces": {
    titre: "Traces",
    ou: "Configuration → Système → Traces et historique · Registre des envois · Journal des modifications · Transferts.",
    texte: "Où relire ce qui s'est passé : l'historique des attributions et sa conservation (Traces et historique), tout ce qui est parti par courriel ou a été déposé dans un espace étudiant (Registre des envois), tous les gestes d'une personne à travers les registres (Journal des modifications), les portes de reprise du passé fermées ou rouvertes (Transferts). Les fiches, PAE et notes ont en plus leur journal de modifications, champ par champ, lu dans « Journal des modifications ».",
    savoir: [
      "Ces registres se lisent ; aucun ne se corrige ni ne s'efface depuis l'écran.",
    ],
    images: [
      { src: "/guide/config-traces.png", legende: "Configuration → Journal des modifications : tous les registres réunis, filtrés par personne, registre et dates — quand, qui, quel geste, sur quoi." },
    ],
  },
};
