/**
 * Chapitre « Les documents qui sortent de Lucie » — le CATALOGUE de ce que l'école sait produire.
 * Le chapitre « editions » explique COMMENT on produit (Éditions, « Pour qui ? ») ; celui-ci dit CE QUI EXISTE :
 * ce que chaque pièce atteste, qui la produit, d'où, ce qu'elle exige pour sortir, à qui elle part.
 * Icône proposée : IconFileCertificate (Tabler) ; à défaut, IconCertificate (déjà importée).
 */
export const chapitres = [
  {
    id: 'pieces', pour: 'sec coo dir', titre: 'Les documents qui sortent de Lucie', icone: 'IconFileCertificate',
    resume: "Le catalogue de toutes les pièces que l'école produit : pour l'étudiant, pour le Conseil, pour la valorisation, pour le personnel, pour la gestion — ce que chacune atteste, qui la sort, ce qu'elle exige, à qui elle part.",
    points: [
      // ── Ce qui vaut pour toutes les pièces ────────────────────────────────────────────────────────────
      {
        titre: "Le catalogue en un coup d'œil",
        ou: "L'avion → Éditions : Étudiants · Personnel · Organisation · Gestion (et Envois).",
        texte: "Lucie produit plusieurs dizaines de pièces, toutes dans la même mise en page. Elles se rangent en six familles : les pièces de l'étudiant (attestations, motivations, bulletin, PAE, inscription, frais, annexes de l'Office des Étrangers, congé-éducation, aménagements, procédures) ; les pièces du Conseil (procès-verbal, composition, grille, listes des ajournés) ; la valorisation des acquis (PV d'annexe 4, attestations, notification) ; les diplômes et titres ; les pièces du personnel (fiches d'attributions, contrats, EA12, annexes de la circulaire 9760, recrutement) ; et la gestion (dotation, rapports, listes). Une même pièce se produit du même modèle, qu'on la demande depuis Éditions, depuis la fiche de l'étudiant ou depuis l'écran où l'on travaille.",
        savoir: [
          "Ce que votre rôle ne permet pas de produire n'apparaît pas : pas de bouton refusé après le clic.",
          "Chaque pièce déclare à qui elle s'adresse — l'étudiant qu'elle nomme, le professeur concerné, ou le Conseil : ce n'est pas un choix de l'écran.",
          "Quand une pièce ne peut pas sortir, Lucie nomme ce qui manque, étudiant par étudiant : on complète au dossier, pas à la main sur le papier.",
          "Les droits cités dans ce chapitre sont ceux par défaut : la direction les règle geste par geste dans Configuration → Accès.",
        ],
      },
      {
        titre: "Une seule mise en page, et « Produit par… » en pied",
        texte: "Toutes les pièces administratives partagent la même enveloppe : format A4, mêmes marges, même en-tête d'établissement, même pied. L'identité imprimée (nom, adresse, n° ECOT, FASE, signataire, logo, signature, cachet) est celle de l'établissement de la section concernée, telle que réglée dans Configuration → Identité. Le pied dit qui a produit la pièce et quand : « Produit par … le … à … ». Une pièce imprimée quitte Lucie, et c'est hors de Lucie qu'on se demande d'où elle vient.",
        savoir: [
          "Corriger l'identité dans Configuration corrige toutes les pièces produites ensuite ; une pièce déjà produite ne change pas.",
          "Le nom imprimé dans le pied est celui de la personne connectée, jamais un nom choisi.",
          "Deux exceptions à la mise en page commune : le diplôme (A4 paysage, sans marge ni pied, sur le papier à diplôme) et le corps d'un courriel.",
          "Les documents produits sont gardés au registre « documents » de Configuration → Système → Journal des modifications (administrateur).",
          "Sur les écrans les noms s'écrivent « NOM Prénom » ; sur les pièces, « Prénom NOM ».",
        ],
      },
      {
        titre: "Aperçu, PDF du serveur ou impression du navigateur",
        ou: "Toute pièce produite s'ouvre dans l'aperçu ; ses actions sont dans la barre bleue du haut.",
        texte: "Une pièce s'ouvre d'abord en aperçu, page par page. De là, [[PDF|IconFileTypePdf]] demande au serveur un PDF au format A4 imposé, avec le pied sur chaque feuille et la numérotation au-delà d'une page ; [[Imprimer|IconPrinter]] passe par l'impression du navigateur ; [[Envoyer|IconSend]] l'envoie par courriel à qui elle nomme. Quand un lot porte plusieurs pièces, les flèches de la barre passent de l'une à l'autre.",
        savoir: [
          "Le PDF du serveur est la sortie qui fait foi pour la mise en page : format, marges et échelle ne dépendent plus de l'imprimante de chacun.",
          "Si le serveur ne sait pas produire de PDF, l'impression du navigateur reste disponible : c'est le même repli partout.",
          "Le bouton d'envoi ne paraît que pour qui a le droit d'envoyer, et quand l'envoi par courriel est allumé.",
        ],
      },
      {
        titre: "Envoyer par courriel",
        ou: "L'aperçu ou le volet « Quoi ? » d'Éditions → [[Envoyer|IconSend]] → fenêtre « Envoyer par courriel ».",
        texte: "Une pièce part à la personne qu'elle nomme : un courriel par personne, jamais de copie collective. On choisit la forme : « en PDF joint » ou « dans le corps du courriel (mis en page, sans pièce jointe) ». Chaque envoi reçoit sa référence et son propre fac-similé de signature, qui porte le destinataire, la date et la référence. Le mot d'accompagnement est servi par Lucie : il annonce la pièce, il ne la résume pas.",
        savoir: [
          "Envoyer est réservé au secrétariat, à la direction adjointe, à la direction et à l'administrateur.",
          "L'envoi par courriel s'allume dans Configuration → Courriels ; éteint, les boutons d'envoi n'apparaissent pas et le serveur refuse.",
          "Au plus 200 envois par lot. Une adresse invalide ou une pièce absente se note « échec » dans le registre, sans arrêter les autres.",
          "Pour un étudiant, l'adresse est celle de l'école ; la liste des destinataires se montre avant l'envoi, et l'on peut en retirer quelqu'un — jamais ajouter une personne que la pièce ne concerne pas.",
          "Une pièce « pour le Conseil » part à toute la composition de la séance (présents et absents), à la boîte de service des examens et à la direction adjointe.",
        ],
      },
      {
        titre: "Le registre des envois",
        ou: "L'avion → Éditions → Envois ; ou Configuration → Système → Registre des envois.",
        texte: "Tout ce qui est parti se relit : quand, par qui, à qui, quoi, et si c'est parti. Chaque envoi garde une copie du document tel qu'il a été remis, signature comprise ([[Copie]] sur la ligne). On cherche par nom, sujet, contenu ou référence, et on filtre par expéditeur. C'est là qu'on vérifie qu'un étudiant a bien reçu la pièce qu'il réclame, avant de la renvoyer.",
        savoir: [
          "Le registre se lit par ceux qui ont le droit d'envoyer : il porte les adresses de tous les destinataires.",
          "Les envois antérieurs au 30 septembre 2026 n'ont pas de copie conservée : ils sont comptés « Sans copie ».",
          "Les pièces déposées dans l'espace de l'étudiant y paraissent aussi, avec la mention qu'elles sont « dans l'espace ».",
          "Une copie est gardée même quand l'envoi échoue : on sait ce qu'on a tenté d'envoyer.",
        ],
      },
      {
        titre: "Plusieurs pièces, un seul courriel",
        texte: "Certaines pièces partent ensemble, chacune dans son propre PDF avec sa propre référence : « Envoyer les attestations — toutes les années » joint une attestation par unité réussie à un seul courriel ; l'accusé de réception d'un aménagement raisonnable part avec le formulaire de la demande. Le registre garde une ligne par pièce.",
        savoir: [
          "Chaque document reste indépendant : on peut en remettre un seul plus tard, il porte sa propre référence.",
          "L'accusé de réception d'un aménagement exige la date de la demande ; une fois envoyé, le dossier garde la date et le nom de qui l'a envoyé.",
        ],
      },
      {
        titre: "Le filigrane, la référence et le QR d'authenticité",
        texte: "Derrière le bloc de clôture d'une pièce signée (cachet, lieu et date, signature), Lucie pose un filigrane « façon billet de banque » : des vagues de micro-texte qui portent la référence, la pièce, la personne et la date, et un petit cartouche derrière chaque cote. Le dessin dépend de la référence : deux pièces ne portent jamais le même, et une pièce découpée ou recollée se voit. Chaque bloc de clôture reçoit aussi sa référence, inscrite au registre des pièces authentiques, et un QR qui mène à la page publique de vérification du site des étudiants.",
        savoir: [
          "La référence d'une pièce envoyée est celle de l'envoi ; sinon, elle naît au moment où la pièce est produite.",
          "Celui qui scanne voit la nature de la pièce, la personne, l'objet, la date et qui l'a produite — rien d'autre que ce qui est imprimé ; une référence inconnue est dite telle.",
          "Le diplôme ne porte pas de QR : il a la signature manuscrite.",
          "Le filigrane rend une falsification visible ; il n'empêche pas la photocopie.",
        ],
      },
      {
        titre: "Ce que toute pièce remise à l'étudiant respecte",
        texte: "Les règles de la circulaire « Sanction des études » sont appliquées par Lucie, pièce par pièce, sans qu'on ait à y penser. Elles valent pour l'attestation, la motivation, le bulletin, l'espace de l'étudiant ; la grille de délibération, document du Conseil, garde les cotes de travail.",
        savoir: [
          "Jamais de cote sous 10 : « NA ».",
          "Une unité octroyée par faveur vaut 10 partout — chaque acquis, chaque cours, l'unité —, sans quoi la pièce se contredirait.",
          "Une attestation de réussite ne porte jamais moins de 50 % : une cote incohérente avec la décision est ramenée au seuil.",
          "Une motivation de refus ou d'ajournement ne porte aucun point : elle dit, acquis par acquis, ce qui n'est pas maîtrisé.",
          "Une année reprise d'Excel porte la mention qui le dit : elle ne se fait pas passer pour une délibération tenue.",
          "Lieu ou date de naissance absents : Lucie le signale avec le nom de l'étudiant, avant d'imprimer.",
        ],
      },
      {
        titre: "Le dépôt dans l'espace de l'étudiant",
        texte: "Une pièce envoyée par Lucie se retrouve aussi dans l'espace de l'étudiant, avec sa référence. À la clôture d'une délibération, chaque délibéré reçoit d'office la pièce de sa décision — attestation de réussite, ou motivation d'ajournement ou de refus —, la même que celle d'Éditions, puis un seul courriel l'avertit. La direction peut aussi y verser, en une fois, les attestations des années passées.",
        savoir: [
          "Une pièce ne se dépose qu'une fois ; une motivation que Lucie ne peut pas composer (aucun acquis en échec) ne se dépose pas.",
          "Ces dépôts ne tournent que pour les étudiants à qui « Mes documents » est ouvert (Configuration → Accès → Mise en service).",
          "Le détail de l'espace (téléchargement, 90 jours, accusé de réception) est au chapitre « L'espace de l'étudiant ».",
        ],
      },

      // ── Les pièces de l'étudiant ──────────────────────────────────────────────────────────────────────
      {
        titre: "Toutes les pièces d'une personne",
        ou: "Fiche de l'étudiant → l'avion ; ou Éditions → Étudiants → Documents → « Une personne » → « ouvrir ses pièces ».",
        texte: "Ouverte pour une personne, Éditions range ses pièces en groupes : Résultats (attestations de l'année ou de toutes les années, un PDF par unité en archive, bulletin, parcours de formation, motivation), Inscription (fiche d'inscription, frais de scolarité), Office des Étrangers (annexes 1 et 2), Congé-éducation payé et Aménagements raisonnables quand l'étudiant en a un dossier. On choisit la sortie en tête : « PDF avec bas de page » ou « Aperçu à l'écran (pour envoyer par courriel) ».",
        savoir: [
          "Le groupe Congé-éducation n'apparaît que pour un étudiant au CEP de l'année, hors Flandre ; le groupe Aménagements, que s'il a un dossier.",
          "« Envoyer les attestations — toutes les années » : un seul courriel, un PDF par attestation.",
        ],
      },
      {
        titre: "Attestation de réussite d'unité",
        ou: "Éditions → Étudiants → Documents → « Attestations » (Réussites) ; ou « Une séance » → « Pour ses étudiants ».",
        texte: "Une attestation par unité réussie : l'intitulé, le code approuvé, la section, le domaine, les périodes et leur répartition par activité, les acquis, le pourcentage obtenu. Elle sort pour l'année choisie ou pour tout le parcours, et une unité valorisée en entier y figure avec le pourcentage arrêté par le Conseil. Elle porte la signature sous fac-similé, le filigrane et le QR d'authenticité.",
        savoir: [
          "Pas d'unité réussie, pas d'attestation : « Aucune unité réussie pour cet étudiant ».",
          "Les mentions manquantes de l'unité (code, ECTS, répartition par activité…) sont nommées avant l'impression.",
          "Destinataire : l'étudiant qu'elle nomme.",
        ],
      },
      {
        titre: "Motivation d'une décision — ajournement ou refus (annexes 8 et 9)",
        ou: "Éditions → Étudiants → Documents → « Attestations » (Ajournements, Refus) ; ou la fiche → « Motiver un refus ou un ajournement ».",
        texte: "La pièce qui notifie un échec : pour chaque acquis en échec ou ajourné, le motif délibéré — celui du Conseil, ou à défaut le justificatif du chargé de cours, ou la proposition de Lucie confirmée à la clôture. Elle ne porte aucun point. Elle sort pour la session de la séance (première ou seconde).",
        savoir: [
          "Refusée sans acquis en échec ni ajourné : « la notification n'a pas lieu d'être. Vérifiez la décision encodée. »",
          "Une séance dont un échec n'est pas motivé le signale dans le lot (« dont un échec n'est pas motivé »).",
          "Destinataire : l'étudiant ; elle est aussi déposée d'office dans son espace à la clôture.",
        ],
      },
      {
        titre: "Bulletin de parcours",
        ou: "Éditions → Étudiants → Documents → Résultats → « Bulletin de parcours ».",
        texte: "Toutes les unités du cursus, rangées par bloc, l'épreuve intégrée au bout, une colonne par année suivie : une unité suivie deux ans porte ses deux cotes. Quatre chiffres en tête (ECTS acquis, unités acquises, ECTS inscrits cette année, moyenne générale pondérée par les périodes, la seule qui garde ses décimales), une rubrique pour les unités suivies hors du cursus, et le schéma de capitalisation en annexe.",
        savoir: [
          "NA sous 10, 10 pour une faveur, comme toute pièce remise à l'étudiant.",
          "Refusé pour un étudiant sans section : « aucune section pour cet étudiant ».",
        ],
      },
      {
        titre: "Parcours de formation",
        ou: "Fiche → l'avion → « ouvrir ses pièces » → Résultats → « Parcours de formation ».",
        texte: "Une page A4 paysage : le schéma de capitalisation de l'étudiant avec ses prérequis, ce qu'il a acquis et son programme de l'année. Ni cote d'échec ni décision : c'est la feuille que l'étudiant emporte pour comprendre où il en est.",
      },
      {
        titre: "Programme annuel (PAE)",
        ou: "Éditions → Étudiants → Documents → Inscription → « Programme annuel (PAE) » ; ou l'avion de la Revue des PAE.",
        texte: "Le programme de l'étudiant pour l'année, détaillé par cours : unités, ECTS, périodes, et sur chaque cours ce qui est reporté ou dispensé (RP report de note, VAP / VAEP valorisation partielle, D dispense, VA / VAE unité valorisée). Quand le PAE a été validé, la pièce le dit : « PAE validé le … par … ».",
        savoir: [
          "Les périodes sont celles de l'étudiant ; une dispense vaut 10/20.",
          "Seuls les étudiants de votre périmètre sortent ; les autres sont écartés.",
        ],
      },
      {
        titre: "Fiche d'inscription / reçu",
        ou: "Éditions → Étudiants → Documents → Inscription → « Fiche d'inscription / reçu ».",
        texte: "Le récapitulatif de l'inscription de l'année : les unités inscrites, les acquis antérieurs (réussites et valorisations), l'historique des unités ajournées ou abandonnées, les unités prises « sous réserve » d'un prérequis encore à acquérir, les droits d'inscription et l'engagement de l'étudiant.",
        savoir: [
          "Elle ne porte pas le détail des frais de scolarité : c'est une pièce distincte.",
        ],
      },
      {
        titre: "Frais de scolarité — la note de frais",
        ou: "Éditions → Étudiants → Documents → Inscription → « Frais de scolarité » ; ou Fiche → Finances.",
        texte: "Le détail de ce que l'étudiant doit pour l'année — droit d'inscription, frais fixes et variables, forfait de valorisation s'il en a demandé une —, l'acompte, le solde et son échéance, et les versements déjà encodés. Sous « Pour payer par virement », la pièce imprime l'IBAN de l'établissement, la communication structurée propre à l'étudiant et à l'année, et un QR de paiement que l'application bancaire lit directement (bénéficiaire, montant, communication).",
        savoir: [
          "Pas d'IBAN réglé dans Configuration → Identité, pas de QR.",
          "Le montant du QR est l'acompte qui manque, sinon le reste dû.",
          "Production réservée au secrétariat et à la direction.",
        ],
      },
      {
        titre: "Annexes 1 et 2 de l'Office des Étrangers",
        pour: 'sec dir',
        ou: "Éditions → Étudiants → Documents → Inscription → « Annexe 1 » / « Annexe 2 » ; ou la fiche → Office des Étrangers.",
        texte: "Les deux formulaires officiels pour l'étudiant en séjour limité aux études : l'annexe 1 (visa ou titre de séjour étudiant) et l'annexe 2 (attestation du progrès des études). Ce que Lucie ne peut pas déduire — situation, raisons sous 54 crédits, motif et avis de l'annexe 2 — vient de l'onglet SLE de la fiche ; le motif de l'annexe 2 y est proposé à partir des résultats.",
        savoir: [
          "Réservées au secrétariat et à la direction ; le serveur refuse les autres rôles.",
          "En nombre, seuls les étudiants en séjour limité aux études reçoivent une annexe : les autres sont écartés et nommés.",
          "L'annexe 2 réclame la nationalité de l'étudiant.",
        ],
      },
      {
        titre: "Congé-éducation payé — trois attestations",
        pour: 'sec dir',
        ou: "Fiche → Congé-éducation ; en nombre, Éditions → Étudiants → Documents → « CEP — … ».",
        texte: "L'attestation d'inscription régulière, l'attestation d'assiduité (par période de trois mois depuis le début de l'unité) et l'attestation de seconde session, sur le modèle officiel de l'arrêté du 20 août 1985, chacune suivie de l'horaire détaillé de l'unité. Le fonctionnement complet est au chapitre « Congé-éducation payé ».",
        savoir: [
          "L'assiduité ne sort pas tant qu'une séance passée n'a pas ses présences.",
          "La Flandre n'utilise pas ces pièces : Lucie refuse.",
        ],
      },
      {
        titre: "Aménagements raisonnables — cinq pièces",
        pour: 'sec dir',
        ou: "Fiche → Aménagements → Pièces du dossier.",
        texte: "La demande (cadres A et B, pièce confidentielle), l'accusé de réception de la demande, la décision motivée du Conseil des études, la notification (lettre et décision, avec les voies de recours) et la fiche « mesures » pour les chargés de cours. [[Accusé de réception à l’étudiant|IconSend]] envoie l'accusé et la demande dans un seul courriel, chacun dans son PDF.",
        savoir: [
          "Décision et notification ne sortent pas tant que manquent la décision, sa date, la motivation, une mesure accordée (si accordé) ou le motif d'une mesure refusée.",
          "La fiche « mesures » ne porte que les mesures accordées — jamais la situation de l'étudiant ni la motivation (secret professionnel) ; elle part aux chargés de cours des unités concernées.",
          "L'accusé de réception exige la date de la demande.",
        ],
      },
      {
        titre: "Recours et discipline — six pièces",
        pour: 'sec dir',
        ou: "Étudiants → Procédures → le dossier → Pièces.",
        texte: "Pour un recours : l'accusé de réception d'une plainte, la décision d'irrecevabilité, la décision motivée sur recours interne. Pour une procédure disciplinaire : la convocation à une audition, le procès-verbal d'audition, la décision motivée. Chacune porte les voies de recours qui conviennent.",
        savoir: [
          "Une pièce ne sort pas tant que l'étape qu'elle relate n'est pas posée dans le dossier.",
        ],
      },
      {
        titre: "Les lettres de l'atelier",
        ou: "Éditions → Étudiants → Divers.",
        texte: "Une lettre individuelle — une confirmation d'inscription, un courrier à toute une section — composée une fois comme modèle dans l'atelier de Lucie (Configuration), puis produite pour chaque étudiant choisi, rempli de ses données. On choisit le modèle, la section, éventuellement une unité, on coche les destinataires, puis « Produire … lettre(s) » ; chaque lettre s'imprime ou part à l'étudiant qu'elle nomme.",
        savoir: [
          "Sans modèle choisi, rien ne se produit : le modèle se compose d'abord dans l'atelier.",
          "L'adresse de l'école de chaque étudiant est affichée dans la liste avant l'envoi.",
        ],
      },

      // ── Les pièces du Conseil ─────────────────────────────────────────────────────────────────────────
      {
        titre: "Les pièces d'une séance de délibération",
        ou: "Éditions → Étudiants → Documents → « Une séance » → « Pour le Conseil » ; ou Délibération → la feuille → Clôture → [[Générer les documents]].",
        texte: "Pour une unité, une session et, le cas échéant, une organisation : le procès-verbal de délibération (et sa version anonymisée, matricules seulement), la composition du Conseil de la session, la grille de délibération et les ajournés par cours, qui disent à chaque chargé de cours qui revient en seconde session et pour quels acquis. Ces pièces portent toute la séance, jamais une sélection d'étudiants.",
        savoir: [
          "Le procès-verbal signale ce qui lui manque : date de délibération, présences du Conseil, date de communication des résultats, code de l'unité, périodes, décisions non enregistrées.",
          "La composition signale une unité sans professeur attribué : le Conseil ne peut pas siéger.",
          "La grille de délibération est un document du Conseil : elle garde les cotes de travail, sous 10 comprises.",
          "Les pièces « pour le Conseil » partent à toute la composition, à la boîte de service des examens et à la direction adjointe.",
          "Sans décision enregistrée pour la session, rien ne sort : Lucie le dit.",
        ],
      },
      {
        titre: "Diplômes et titres — six pièces",
        pour: 'sec dir',
        ou: "Éditions → Étudiants → Diplômes et titres : la section, la date de délibération, puis les pièces.",
        texte: "Le diplôme (A4 paysage, sans marge, sur le papier à diplôme), l'attestation provisoire (remise le jour même, en attendant la signature du diplôme), l'attestation de réussite de section, le supplément au diplôme Europass (huit rubriques, plusieurs pages par étudiant), la liste des étudiants diplômés (formulaire de la Fédération) et le procès-verbal de délibération de section (fait en deux exemplaires). Lucie propose les diplômables de la section : toutes les unités requises réussies, ou l'épreuve intégrée réussie.",
        savoir: [
          "Réservé à la direction et au secrétariat, dans les sections de leur périmètre.",
          "Une section dont le titre est délivré par un autre établissement est refusée : l'IIP n'en fait ni la diplomation ni les pièces de section.",
          "Le président du jury de l'épreuve intégrée doit être connu et différent du directeur ; s'il manque, Lucie le demande, puis le retient pour la section. Les signataires d'un diplôme sont trois personnes différentes.",
          "L'attestation provisoire réclame le nombre de périodes et le code de la section (fiche de section).",
          "Ce qui rendrait une pièce inexacte se signale par étudiant : unité déterminante sans cote, cote recalculée jamais arrêtée, séance non clôturée, lieu ou date de naissance, genre.",
          "Le bas de page du diplôme ne s'imprime que si on coche « Imprimer le bas de page du diplôme » (papier sans pied pré-imprimé).",
        ],
      },

      // ── La valorisation des acquis ────────────────────────────────────────────────────────────────────
      {
        titre: "PV de valorisation (annexe 4) et attestations (annexes 14 et 15)",
        ou: "Éditions → Étudiants → Valorisation des acquis → « Par unité » → [[PV et attestations]].",
        texte: "Le procès-verbal du Conseil des études pour une unité — tous les étudiants valorisés dans l'unité cette année-là — et les attestations de réussite par valorisation (annexe 15 pour le supérieur, 14 pour le secondaire). Une dispense partielle s'y lit « Réussite partielle — dispense », avec un renvoi vers une remarque qui dit ce qui est dispensé. Le nombre de pages se constate, il ne se saisit pas.",
        savoir: [
          "Aucune pièce signée ne sort si le circuit n'a pas été parcouru : recevabilité, avis, base de la décision, motivation — Lucie nomme l'étudiant et ce qui manque.",
          "La séance doit porter sa date, la date de communication, le président, des présents et le quorum des deux tiers ; l'unité, son code approuvé, ses périodes par cours, ses ECTS (supérieur).",
          "Deux décisions contraires pour un même étudiant bloquent l'impression : on n'en garde qu'une dans Valorisation des acquis.",
          "Produit par la coordination, le secrétariat et la direction, pour les unités de leur périmètre. Destinataire : le Conseil.",
        ],
      },
      {
        titre: "Notification des décisions de valorisation",
        ou: "Éditions → Étudiants → Valorisation des acquis → « Par étudiant » ; ou la fiche → Valorisation → [[Notifier les décisions|IconSend]].",
        texte: "La lettre de la direction à l'étudiant : chaque unité demandée, la décision du Conseil, sa motivation et sa base, avec la mention de l'absence de recours. Les demandes encore à l'examen sont signalées comme telles ; l'avis des chargés de cours n'y figure pas.",
        savoir: [
          "Seules y entrent les décisions validées par la direction (et les demandes déclarées irrecevables) ; sans elles, rien ne sort.",
          "Un refus sans motif, une irrecevabilité sans motif bloquent la pièce.",
          "L'envoi par courriel enregistre la date de notification sur chaque dossier.",
          "Réservée au secrétariat et à la direction.",
        ],
      },

      // ── Le personnel ──────────────────────────────────────────────────────────────────────────────────
      {
        titre: "Fiche d'attributions",
        pour: 'sec dir',
        ou: "Éditions → Personnel → Pièces par membre → un membre → « Fiche d'attributions » ; plusieurs membres cochés : « Fiches d'attributions ».",
        texte: "Le relevé de ce qui est confié au membre pour l'année : unités, cours, périodes. Elle vaut pour tout membre, chargé de cours comme expert, avant tout contrat. Un membre qui a des attributions à l'Institut et à la Haute École choisit sa fiche : IIP, HELB, ou globale.",
        savoir: [
          "Un membre sans attribution du type choisi n'a pas de fiche.",
          "En série, une fiche par membre, chacune sur sa page.",
        ],
      },
      {
        titre: "Contrats de travail",
        pour: 'sec dir',
        ou: "Éditions → Personnel → Pièces par membre → un membre ; ou cochez plusieurs membres → « Contrats de travail ».",
        texte: "Le statut du membre dit ses pièces. Chargé de cours : le contrat de travail sur ses seules périodes de chargé de cours. Expert : un contrat d'emploi par niveau (secondaire, supérieur), avec ses périodes, ses unités et le taux par période. En série, un seul document, une pièce par page, chacune seulement si le statut du membre l'appelle.",
        savoir: [
          "Réservés au secrétariat et à la direction (administrateur).",
          "« Aucune prestation d'expert à ce niveau pour cette année » : pas de contrat d'expert sans périodes.",
          "Les membres sans contrat à produire sont nommés à part.",
        ],
      },
      {
        titre: "EA12 et annexes de la circulaire 9760",
        pour: 'sec dir',
        ou: "Éditions → Personnel → Pièces par membre → un membre (EA12 — Doc12 supérieur ; Expert ; Autres annexes de la circulaire 9760).",
        texte: "L'EA12 (Doc12 supérieur, et sa variante expert) et les annexes de la circulaire 9760 sont les modèles Word officiels de la Fédération, remplis par Lucie : établissement, identité, et pour plusieurs d'entre elles le contenu propre (marquées « pré-rempli »). Le Word se dépose dans GEDI ; [[Aperçu]] montre d'abord le formulaire rempli en PDF. L'EA12 s'ouvre, se complète et se produit dans Lucie.",
        savoir: [
          "Annexes disponibles : A2 cumul interne, A3 fiche signalétique, A4 prestation de serment, A5 et A5 bis services antérieurs, A6 admissibilité des services, A7 allocation de foyer, A8 précompte, A9 dérogation linguistique, A10 pécule jeune diplômé, A11 à A13 bis maladie et accidents, A14 relevé des ANRJ, A15 absences pour grève, A16 à A19 dérogations, cumul et titre suffisant, A20, A21, A24 à A26 bis engagements et mutations, A27 prestations de l'expert, A28 dérogation expert, A29 à A33 expérience utile, A34 dépassement du tiers.",
          "A1 ter (EA12 expert) et A27 (prestations mensuelles de l'expert) se complètent d'abord dans Lucie : tant que ce n'est pas fait, la pièce le dit. A27 se remplit depuis l'horaire, seulement les séances qui nomment l'expert, annulées exclues.",
          "A14, A15 et A27 valent pour un mois : choisissez le « Mois des relevés ».",
          "En série : une archive Word, un dossier par personne ; ce qui n'a pas pu être produit est nommé.",
          "Annexes réservées au secrétariat et à la direction.",
        ],
      },
      {
        titre: "Coordonnées du personnel",
        pour: 'sec dir',
        ou: "Personnel → cochez des membres → [[Coordonnées]].",
        texte: "La liste imprimable des adresses électroniques, GSM et adresses des membres cochés. Elle vient du serveur : la liste de l'écran ne porte ni GSM ni adresse, et c'est voulu.",
      },
      {
        titre: "Les pièces du recrutement",
        pour: 'dir',
        ou: "Personnel → Recrutement : rail → « Rapport PDF » ; la fiche d'un candidat ; Vue parallèle ; Grille d'entretien.",
        texte: "Le rapport d'entretiens (tous les candidats, « Confidentiel — usage interne »), la fiche d'un candidat, le recrutement comparatif d'un poste (les candidats côte à côte) et la grille d'entretien d'un poste, prête à remplir pendant l'entretien.",
        savoir: [
          "Ces pièces ne s'envoient pas par courriel : elles s'impriment.",
          "Réservées à la direction, ou à qui a l'accès « recrutement ».",
        ],
      },

      // ── Organisation, enseignement, gestion ───────────────────────────────────────────────────────────
      {
        titre: "Les pièces de l'organisation",
        ou: "Organisation → Schéma de capitalisation · Descriptifs d'UE · Attributions · Le laboratoire temporel.",
        texte: "Le schéma de capitalisation d'une section, en A4 paysage avec sa légende ([[Imprimer le schéma]], ou Éditions → Organisation → Schémas de capitalisation). Le descriptif d'une unité (DUE), par l'avion de l'écran « Descriptifs d'UE ». Les documents 2 et 3 d'une unité — déclaration de la dotation, liste des attributions —, par le menu de l'unité dans Attributions → « DOC2 / DOC3 ». L'horaire proposé d'un bloc, semaine type et séances de l'année, par Le laboratoire temporel → « 6. La semaine » → [[Imprimer l’horaire]].",
        savoir: [
          "Un DUE ne s'imprime que pour une unité que votre rôle peut lire ; sinon : « Cette unité ne figure pas dans vos attributions. »",
          "L'horaire proposé est une proposition de la simulation : il ne s'envoie pas.",
        ],
      },
      {
        titre: "Liste de cours et grille de présence",
        pour: 'coo dir',
        ou: "Mes cours → un cours → « Imprimer la liste (PDF) » ; Mes cours → un cours → Présences → Grille de présence ; Éditions → Étudiants → Listes et rapports → « Grille de présence ».",
        texte: "La liste des étudiants d'un cours ou d'un groupe, avec une colonne de signature. La grille de présence : étudiants en lignes, séances en colonnes (P, P*, A, J, D, —), pour un cours ou pour toute l'unité — avec alors le récapitulatif des heures par cours, le premier dixième marqué, et les motifs des absences justifiées —, toute l'année ou du … au …, en PDF paysage ou en Excel.",
        savoir: [
          "La grille d'une unité entière est réservée au secrétariat, à la coordination et à la direction ; c'est celle que demande la vérificatrice.",
          "Le secrétariat la sort par Éditions, sans passer par Mes cours.",
        ],
      },
      {
        titre: "Les pièces de la gestion et du suivi d'équipe",
        pour: 'coo dir',
        ou: "Gestion → [[Imprimer des parties…|IconPrinter]] ; Tableau de bord → Suivi d'équipe.",
        texte: "« Imprimer des parties de la Gestion » : on coche les parties voulues, on peut retirer des blocs (« Choisir les blocs »), puis aperçu ou PDF — un document unique, « Données de l'établissement ». Le Suivi d'équipe produit le procès-verbal d'une réunion (sans les notes confidentielles), la feuille des tâches en cours par personne, la liste « Échéances et tâches » telle qu'elle est filtrée, et, pour la direction, le « Rapport du mois » (réunions, tâches, étudiants, délibérations, valorisations, personnel).",
      },
      {
        titre: "Les rapports prêts à imprimer",
        ou: "Éditions → Étudiants · Personnel · Organisation · Gestion → Listes et rapports → « Prêts à imprimer ».",
        texte: "Chaque axe a ses rapports mis en page, qu'on règle (année, section, session…), qu'on voit en aperçu puis qu'on imprime ou qu'on prend en tableur. Étudiants : résultats de délibération par unité (pour la session choisie), listes par unité (à suivre, dispenses, déjà acquises), inscrits par unité, PAE hors règle de prérequis, effectifs par unité, grille de présence. Personnel : membres et leur charge, temporaires et ancienneté, attributions par professeur, statistiques du personnel, professeurs par section, synthèse de charge par professeur, encadrements (TFE, stages, épreuves). Organisation : unités du référentiel, grille de cours, poids des unités, grille de section, enseignants par unité, acquis d'apprentissage, répartition des acquis par cours et par unité, unités sans attribution, calendrier des délibérations, locaux. Gestion : emploi de la dotation par section, charge en ETP (de l'établissement jusqu'au cours), rapport statistique (coûts et recettes des formations), chiffres clés par section.",
        savoir: [
          "Le taux de réussite des résultats de délibération se calcule sur les délibérés, non sur les inscrits.",
          "Un rapport réservé à certains rôles n'apparaît pas aux autres.",
          "« Mis en page » regroupe en plus les rapports historiques du générateur : grille de cours, grille de section, rapport par section, rapport par UE, rapport ETP.",
        ],
      },
      {
        titre: "Les listes à composer",
        ou: "Éditions → un axe → Listes et rapports → « À composer — colonnes au choix ».",
        texte: "Une liste dont on choisit les lignes (étudiants, professeurs, unités, cours…), les critères (section, unité, cours, statut, primo-inscrit, niveau) et les colonnes, puis [[Générer|fort]] : elle s'imprime dans l'enveloppe commune ou sort en CSV et en Excel. L'année fait la liste : les étudiants d'une année sont ceux qui y sont inscrits. Sur une liste par unité ou par cours, ceux qui ont déjà l'unité paraissent à part, avec leur provenance (report, VA).",
        savoir: [
          "N° national et adresse postale : administrateur et direction seulement ; e-mail privé : aussi secrétariat et coordinations — le serveur trie, pas l'écran.",
          "Un professeur qui donne plusieurs cours dans une section n'y paraît qu'une fois ; ses cours se mettent en colonne au choix.",
        ],
      },
      {
        titre: "Le mode d'emploi et les textes de l'école",
        ou: "Documentation → Mode d'emploi → « Tout le mode d’emploi (PDF) » ; Documentation → un texte → [[Imprimer|IconPrinter]].",
        texte: "Le mode d'emploi sort en un seul PDF — couverture, mot de la direction, sommaire paginé, un chapitre par page et ses captures —, composé pour le public de qui le demande. Chaque texte de la Documentation (procédure, règlement, note) s'imprime dans sa version publiée, avec son numéro de version et le pied commun.",
        savoir: [
          "La direction peut sortir le mode d'emploi tel que le reçoit un public précis (enseignants, secrétariat, coordination).",
        ],
      },
    ],
  },
];

export const ajouts = {};

export const remplacements = {};
