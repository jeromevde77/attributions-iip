/* Les points du 1er novembre 2026 (3.5.037 → 3.5.039, temps de travail revu en 3.5.057) : le temps de travail du secrétariat, le thème de chacun, la bande
   des en-têtes. Même forme que les autres compléments. */
export const chapitres = [];
export const ajouts = {
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
        "Le module a sa propre année (en tête d'écran) : on prépare l'année suivante sans changer l'année de travail du reste de Lucie.",
      ],
    },
    {
      titre: "Préparer l'année, en quatre étapes",
      pour: 'dir',
      ou: "Personnel → Temps de travail → Préparer l'année.",
      texte: "Quatre étapes numérotées, dans l'ordre où elles se font : 1 Personnes et règles (qui entre dans le module, sa formule, sa part de temps plein ; l'horaire variable au règlement de travail ; le minimum de présents) · 2 Congés (les 13 semaines, été compris, puis [[Fixer les congés|fort]]) · 3 Grands moments (rentrée, inscriptions, examens, remise des diplômes, portes ouvertes… ; les délibérations se lisent seules des séances) · 4 Générer les années ([[Calculer]], puis [[Enregistrer l'année|fort]], qui reste gris tant qu'une règle n'est pas tenue). « Étape suivante » mène à la suivante.",
      images: [{ src: "/guide/temps-moments.png", legende: "Étape 3, les grands moments (données d'essai) : ceux que la direction pose, et les délibérations, lues des séances." }],
      savoir: [
        "Une personne peut travailler pendant une semaine de congé scolaire (Carnaval, par exemple) : on la coche au générateur, et son été s'allonge d'autant. Le total ne change pas.",
        "Régénérer une année remplace ses semaines, modulations comprises ; les écarts déjà encodés au relevé restent.",
      ],
    },
    {
      titre: "La ligne du temps : l'année, les semaines, la semaine",
      pour: 'sec dir',
      ou: "Personnel → Temps de travail → Ligne du temps.",
      texte: "Trois zooms. [[Année]] : les 52 semaines, une barre par personne et par semaine (sa hauteur, ses heures ; le pointillé, les 36 h de référence), les congés hachurés, le total de l'année face au dû, et la ligne des personnes au travail. [[Semaines]] : huit semaines, une barre par jour. [[Semaine]] : l'horaire de chaque jour, de 7 h à 19 h, la pause en blanc et, en cadre ocre, les heures réelles encodées au relevé. Au-dessus de chaque zoom, les grands moments et la chaleur des semaines. Toucher une semaine de l'année ouvre son détail : pourquoi elle est chaude ou creuse, qui fait combien.",
      images: [{ src: "/guide/temps-ligne-annee.png", legende: "L'année de l'équipe (données d'essai) : les grands moments, la chaleur (ocre : chaude, bleu : creuse), les heures de chacun, et le détail d'une semaine choisie." },
        { src: "/guide/temps-ligne-semaine.png", legende: "Le zoom Semaine : l'horaire de chacun, jour par jour, de 7 h à 19 h." }],
      savoir: [
        "La chaleur se calcule : l'activité de la même semaine l'an dernier (dossiers d'étudiants touchés, pièces envoyées, demandes de VA) et ce que l'année annonce (délibérations, unités qui s'ouvrent, échéances du secrétariat, grands moments). Un quart des semaines de travail est « chaud », un quart « creux ».",
        "La direction peut fixer une semaine en chaude, normale ou creuse ([[Calcul de Lucie]] rend la main au calcul).",
      ],
    },
    {
      titre: "Moduler son année avec l'assistant",
      pour: 'sec dir',
      ou: "Ligne du temps → [[Moduler mon année|fort]].",
      texte: "On donne un jour (zoom Semaines ou Semaine : toucher le jour), on donne une semaine, ou on charge une semaine à 40 h (zoom Année : toucher la semaine). L'assistant remet aussitôt la différence ailleurs : dans les semaines à venir, les CHAUDES d'abord quand il faut ajouter des heures, les plus calmes d'abord quand il faut en retirer ; il montre chaque semaine touchée, avant → après, sur la ligne du temps et dans son panneau. Une semaine qui ne convient pas s'écarte (la croix) : il cherche ailleurs. L'année garde toujours 1 404 h.",
      images: [{ src: "/guide/temps-ligne-assistant.png", legende: "Un vendredi donné (données d'essai) : ses 7 h 12 vont aux semaines chaudes de fin janvier ; l'année compte toujours 1 404 h." }],
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
