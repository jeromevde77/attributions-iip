/* Les points du 1er et du 2 novembre 2026 (3.5.037 → 3.5.058 ; temps de travail revu en 3.5.057, visites de stage en 3.5.058) : le temps de travail du secrétariat, le thème de chacun, la bande
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
      titre: "Mes visites de stage : dans l'agenda, avec le lieu de l'étudiant",
      pour: 'ens coo sec dir',
      ou: "Mes cours → rail → Mes visites de stage (secrétariat, coordination, direction : Étudiants → rail → Visites de stage et frais de déplacement).",
      texte: "Le professeur de stage pose ses visites : [[Planifier une visite|IconPlus|fort]], il choisit le stage — l'étudiant et son lieu, repris de la fiche du stage, avec l'adresse —, la date, l'heure, le départ du trajet (l'école, le domicile ou un autre lieu) et les kilomètres aller-retour. La visite paraît dans Mon horaire de la semaine et dans l'agenda du téléphone (Mon horaire dans mon agenda), à l'adresse du lieu. Une fois faite, [[Faite|IconCheck]] la marque, avec ses kilomètres.",
      images: [{ src: "/guide/visites-planifier.png", legende: "Planifier une visite (données d'essai) : le stage, son adresse, la date, le départ et les kilomètres — Lucie propose ceux de la dernière visite au même lieu." },
        { src: "/guide/visites-semaine.png", legende: "Les visites dans Mon horaire de la semaine, liseré cyan, à côté des séances." }],
      savoir: [
        "Les stages proposés sont ceux dont vous êtes le professeur de stage (fiche de l'étudiant → onglet Stages). Un stage sans professeur désigné ne paraît pas.",
        "Lucie CALCULE les kilomètres aller-retour par la route (OpenStreetMap), depuis l'école, le domicile de la fiche ou l'adresse tapée, jusqu'au lieu de stage : ils se proposent dans le champ, « reprendre » les remet. Le chiffre tapé reste celui qui compte ; s'il s'écarte de plus de 10 % (et de plus de 3 km) de l'itinéraire calculé, la fiche le signale à la direction, sans bloquer la signature. Les adresses quittent Lucie le temps du calcul.",
        "Sans calcul possible (adresse incomplète, service injoignable), Lucie le dit et propose la dernière distance tapée pour ce lieu.",
        "Une visite à venir ne se marque pas « faite » ; une visite faite ne se supprime pas (elle peut être annulée).",
        "Le secrétariat, la coordination (ses sections) et la direction voient et posent les visites de tous.",
      ],
    },
    {
      titre: "La fiche de transport du mois",
      pour: 'ens coo sec dir',
      ou: "Visites de stage → onglet « Fiche de transport ».",
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
      ou: "Visites de stage → onglet « Frais de déplacement » (secrétariat et direction).",
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
