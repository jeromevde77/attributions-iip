/* Les points du 1er novembre 2026 (3.5.037 → 3.5.039) : le temps de travail du secrétariat, le thème de chacun, la bande
   des en-têtes. Même forme que les autres compléments. */
export const chapitres = [];
export const ajouts = {
  personnel: [
    {
      titre: "Le temps de travail du secrétariat : le cadre",
      pour: 'sec dir',
      ou: "Personnel → rail → Temps de travail.",
      texte: "Le temps de travail et les congés du personnel administratif suivent la réglementation, au jour près : 36 h de travail effectif par semaine pour un temps plein (circulaire 9760, point 1.3.8), en proportion pour un temps partiel ; une pause d'au moins 15 minutes dès que la journée dépasse 6 heures, jamais plus de 6 heures d'affilée ; 8 heures par jour au plus, 9 heures en semaine de 4 jours ou en horaire variable inscrit au règlement de travail ; 11 heures de repos entre deux journées. Lucie connaît ces règles : elle les applique à l'année, au jour et au relevé du mois.",
      savoir: [
        "La direction désigne les personnes concernées, leur formule (36 h sur 5 jours, 36 h sur 4 jours de 9 h, ou horaire annualisé) et leur part de temps plein (face « Personnes et réglages »).",
        "L'année compte 52 semaines, moins les congés scolaires fixés par l'école (lus du calendrier de l'école) et cinq semaines consécutives d'été dans la fenêtre réglée (5 juillet – 15 août) : 39 semaines, 1 404 heures pour un temps plein. Rien de plus, rien de moins.",
        "Un jour férié pendant une semaine de travail compte pour ses heures prévues : il ne se récupère pas.",
        "L'horaire annualisé (semaines jusqu'à 45 h, au plus 5 h d'écart par semaine et 2 h par jour avec l'horaire prévu) ne s'applique qu'une fois coché « l'horaire variable est inscrit au règlement de travail ».",
        "Chaque membre désigné voit son année, son relevé et le planning de l'équipe (qui est présent, qui est en congé) ; il ne voit pas les heures des autres.",
      ],
    },
    {
      titre: "Générer l'année",
      pour: 'dir',
      ou: "Personnel → Temps de travail → face « Générer l'année ».",
      texte: "On choisit la personne, sa formule, sa part de temps plein, le jour libre (en 4 jours) et la première semaine des vacances d'été, puis [[Calculer]]. Lucie pose les 52 semaines — congés scolaires, été, semaines de travail avec leurs heures jour par jour — et contrôle chaque règle : la pause, les 8 ou 9 heures, le repos, la semaine, le total de l'année. En annualisé, on indique les semaines chargées (rentrée, sessions) ; les autres semaines compensent d'elles-mêmes. Rien ne s'écrit avant [[Enregistrer l'année|fort]], et le bouton reste gris tant qu'une règle n'est pas tenue.",
      images: [{ src: "/guide/temps-generer.png", legende: "Le générateur (données d'essai) : la personne, la formule, le temps, la première semaine d'été, [[Calculer]] ; puis les 52 semaines et leurs contrôles, et [[Enregistrer l'année|fort]]." }],
      savoir: [
        "Si le calendrier de l'école ne compte pas huit semaines de congés scolaires (deux à Toussaint, Noël, Carnaval et Pâques), Lucie le dit et calcule sur le calendrier tel qu'il est : c'est lui qui fait foi, il se corrige dans Organisation → Planification.",
        "Régénérer une année remplace ses semaines ; les écarts déjà encodés restent.",
        "La face « Année » montre ensuite les 52 semaines d'un coup d'œil, avec le total prévu face au total dû.",
      ],
    },
    {
      titre: "Le relevé du mois : n'encoder que les écarts",
      pour: 'sec dir',
      ou: "Personnel → Temps de travail → face « Relevé du mois ».",
      texte: "L'horaire prévu fait foi : il compte tout seul. On n'encode que ce qui en diffère, jour par jour, avec [[Écart]] : des heures réelles (arrivée, départ, pause), ou une absence — maladie, congé de circonstance, mission ou formation (comptées comme prestées), récupération ou absence non rémunérée (non comptées). Le relevé donne le prévu, le presté, l'écart du mois et le solde de l'année, qui doit revenir à zéro en fin de période.",
      images: [{ src: "/guide/temps-releve.png", legende: "Le relevé de novembre (données d'essai) : une semaine de congé scolaire, puis les jours prévus, une journée plus longue encodée en réel, l'Armistice compté ; en tête, le solde de l'année." }],
      savoir: [
        "Un jour qui enfreint une règle (pas de pause, plus de 8 h en semaine de 5 jours…) s'affiche en rouge, et le relevé ne peut pas être signé tant qu'il n'est pas corrigé.",
        "Le relevé se signe dans l'ordre : la personne ([[Je confirme mon relevé]]), la direction adjointe (contrôle), la direction (accord). Chaque signature porte le nom de qui a cliqué et l'heure ; elle ne se modifie ni ne s'efface.",
        "Si le relevé change après une signature, la signature tombe et se refait : on signe ce que l'on voit.",
        "Signé par la direction, le mois est verrouillé : plus aucun écart ne s'y encode.",
        "[[Relevé du mois|IconPrinter]] sort la pièce, avec le bloc des trois signatures.",
      ],
    },
    {
      titre: "L'équipe sur toute l'année, semaine par semaine",
      pour: 'sec dir',
      ou: "Personnel → Temps de travail → faces « L'équipe : l'année » · « L'équipe : une semaine » · « L'équipe : un mois ».",
      texte: "« L'année » : une ligne par personne, une colonne par semaine des 52 ; la direction y lit les heures prestées de chacun, semaine par semaine (le prévu corrigé des écarts encodés), et au bout de la ligne le presté de l'année, le dû et le solde. La dernière ligne compte les personnes au travail chaque semaine : le roulement de l'été s'y vérifie d'un coup d'œil. Un clic sur une semaine l'ouvre jour par jour : « Une semaine » donne, pour chacun, l'horaire de chaque jour, le réel encodé, et le total prévu et presté de la semaine ; « Un mois » montre qui est présent chaque jour ouvrable.",
      images: [{ src: "/guide/temps-equipe-annee.png", legende: "L'année de l'équipe (données d'essai) : les heures de chacun par semaine, les congés, et la ligne des personnes au travail." }, { src: "/guide/temps-semaine.png", legende: "Une semaine, jour par jour : l'horaire de chacun, le réel encodé, le prévu et le presté de la semaine." }],
      savoir: [
        "Une personne désignée voit, des autres, seulement qui travaille et qui est en congé : les heures sont à la direction.",
        "Une semaine dont le presté diffère du prévu s'écrit en gras ; un solde annuel non nul se signale.",
        "Une semaine sous le minimum de présents (deux par défaut) se signale ; sans personne, en rouge.",
      ],
    },
    {
      titre: "La fiche de congés et le planning de l'équipe",
      pour: 'sec dir',
      ou: "Personnel → Temps de travail → faces « Année » et « L'équipe ».",
      texte: "La fiche de congés reprend les périodes de l'année (congés scolaires et été) ; elle se signe par la direction adjointe, puis par la direction pour accord, et sort en pièce ([[Fiche de congés|IconPrinter]]). « L'équipe » montre, jour par jour, qui est prévu présent, en congé ou absent, et compte les présents : un jour sous le minimum réglé (deux par défaut) se signale, un jour sans personne aussi — le secrétariat doit rester ouvert cinq jours par semaine.",
      images: [{ src: "/guide/temps-suivi.png", legende: "Le suivi de la direction (données d'essai) : la formule, l'année générée, le solde, les signatures du relevé et de la fiche de congés." }],
      savoir: [
        "La face « Suivi » (direction) dit pour chacun : l'année générée ou non, le solde, les signatures du mois et de la fiche de congés, les jours en défaut.",
        "Le module a sa propre année (en tête d'écran) : on prépare l'année suivante sans changer l'année de travail du reste de Lucie.",
      ],
    },
  ],
  moi: [
    {
      titre: "Mon thème : Maison IIP, Sombre, Métal ou Pastel",
      ou: "Barre du haut → la palette.",
      texte: "Chacun choisit l'aspect de Lucie pour lui-même : Maison IIP (les couleurs de l'école), Sombre (gris foncés, texte clair), Métal (acier et gris froids) ou Pastel (tons doux sur fond blanc). Le choix vaut pour vous seul, sur cet appareil ; il ne change rien pour les autres, ni aux pièces imprimées, qui gardent la charte de l'Institut.",
      images: [{ src: "/guide/moi-theme.png", etroite: true, legende: "La palette de la barre du haut : quatre thèmes, le vôtre coché." }],
      savoir: [
        "Les états gardent leur sens dans tous les thèmes : vert réussi, ocre à surveiller, brique à corriger, violet faveur.",
        "Sur iPad et téléphone, les quatre thèmes sont dans le menu déroulant de la barre.",
        "La direction règle les couleurs de l'école dans Configuration → Thèmes et couleurs ; Métal et Pastel peuvent aussi y être adoptés pour tout le monde.",
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
