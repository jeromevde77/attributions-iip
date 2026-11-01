// Rédaction — clé `finances` : l'argent et les moyens de l'école.
// Deux chapitres nouveaux (« dotation », « frais ») et deux remplacements de points devenus inexacts.

export const chapitres = [
  {
    // Icône proposée : IconBuildingBank (celle de la rubrique « Dotation » du rail de Gestion).
    id: 'dotation', pour: 'coo dir', titre: 'Dotation, ETP et coûts', icone: 'IconBuildingBank',
    resume: "Ce que la Fédération accorde en périodes, ce que l'école en emploie, la charge en équivalents temps plein et ce que coûtent les formations — lu de l'encodage des attributions, sans rien ressaisir.",
    points: [
      {
        titre: "Où se trouvent ces écrans",
        ou: "Gestion → rail → Données de l'établissement → Dotation (faces Dotation · ETP · Comparaison · Répartition des périodes · Configuration) et → Finances (faces Coûts des formations · Budget).",
        texte: "Tout part des attributions encodées : Lucie compte les périodes confiées, les pondère et les compare à la dotation. Choisissez la rubrique dans le rail, puis la face en tête de l'écran. La face Dotation suit l'année CIVILE choisie dans le rail ; les autres suivent l'« Année scolaire » choisie en tête de page.",
        savoir: [
          "La coordination voit ETP et Comparaison ; Dotation et Configuration suivent le droit « dotation » de son rôle ; la Répartition des périodes et les Coûts des formations ne lui sont pas proposés.",
          "Une attribution d'un enseignant en congé ne compte pas : seul son remplaçant pèse sur la dotation.",
          "Les attributions HELB s'affichent à part et ne pèsent pas sur la dotation organique.",
        ],
      },
      {
        titre: "La dotation de l'année civile",
        pour: "dir",
        ou: "Gestion → Dotation → face « Dotation » ; l'année civile se choisit dans le rail.",
        texte: "La carte « Dotation organique · Civile » donne cinq chiffres : la Dotation (en périodes B), les périodes Utilisées, les Charges fixes, le Solde réel et le Taux. Les périodes utilisées sont celles des attributions IIP, pondérées : × 1,5 pour une unité du supérieur, × 1,25 pour une unité du secondaire supérieur. Une unité sur les deux quadrimestres se partage 40 % sur le premier, 60 % sur le second.",
        savoir: [
          "Une année civile chevauche deux années scolaires : janvier-juin est le second quadrimestre de l'année qui s'achève, septembre-décembre le premier de celle qui commence.",
          "Charges fixes : 1 % de la dotation (FELSI) plus 40 périodes (GIPS), retirées avant le solde réel ; sous −200, la carte rappelle la pénalité × 1,5.",
          "Le taux se lit en état : de 95 à 100 %, la dotation est employée ; de 85 à 95 %, il reste de la marge ; sous 85 %, des périodes restent sur la table ; au-delà de 100 %, c'est un dépassement.",
          "Dans le rail, une année dont le taux dépasse 95 % porte un ⚠.",
          "Le bouton « Retourner la carte » montre au verso la comparaison pluriannuelle : dotation, usage calculé et usage constaté, année par année.",
        ],
      },
      {
        titre: "L'année civile en deux moitiés",
        pour: "dir",
        ou: "Gestion → Dotation → face « Dotation » → bloc « L'année civile en deux moitiés ».",
        texte: "Quatre cases répondent à la question de juillet : la première moitié est jouée, combien reste-t-il pour la rentrée ? Janvier – juin (consommé), Septembre – décembre (engagé, encore mouvant), Janvier – juin de l'année suivante (le second quadrimestre de l'année en cours, déjà attribué, qui pèsera sur la dotation suivante) et « Reste pour la rentrée », après décompte de janvier – juin.",
        savoir: [
          "Les dépassements des enveloppes extérieures sont imputés au total de l'année.",
        ],
      },
      {
        titre: "Le solde constaté, en face du calcul",
        pour: "dir",
        ou: "Gestion → Dotation → face « Configuration » → Dotations organiques par année civile → colonne « Solde constaté » ; lu sur la face « Dotation ».",
        texte: "Pour une année que la base ne connaît pas encore en entier, la direction note ce qu'elle constate (« tout utilisé sauf cinq périodes »). La face Dotation montre alors trois chiffres côte à côte : le Solde constaté, la « Consommation qu'il implique » et l'« Écart avec la base ». Le constat ne corrige pas le calcul : l'écart mesure ce qui reste à encoder, et se referme à mesure qu'on encode.",
      },
      {
        titre: "Les enveloppes extérieures",
        pour: "dir",
        ou: "Gestion → Dotation → face « Dotation » → bloc « Enveloppes extérieures » ; réglage dans la face « Configuration ».",
        texte: "Certaines unités ne sont pas financées par la dotation organique mais par une enveloppe fermée : qualité (QUAL), conseil de formation (CF), inclusion (INCL), AESI. Chaque enveloppe montre son allocation, ce qui est utilisé, son solde et un taux. L'usage d'une enveloppe sur l'année civile N est celui de toute l'année scolaire N-1 / N.",
        savoir: [
          "Ce qui dépasse une enveloppe retombe sur la dotation organique : la case « Utilisées » le dit (« dont … pér. de dépassement »). Une enveloppe illimitée ne déborde jamais.",
          "L'enveloppe d'une unité se déduit de son code FWB ; la face Configuration permet de la forcer, unité par unité (liste « Override » : Auto, QUAL, CF, INCL, AESI, organique).",
        ],
      },
      {
        titre: "Le détail par section et le rapport de dotation",
        pour: "dir",
        ou: "Gestion → Dotation → face « Dotation » → « Détail par section ».",
        texte: "Chaque section se déplie sur ses unités, rangées par bloc : périodes, part de la dotation de la section et évolution (Δ %) par rapport à l'année précédente. Pour la pièce, choisissez [[Portrait]] ou [[Paysage]], puis l'avion [[Imprimer ou envoyer|IconSend]] : le centre d'édition propose le « Rapport de dotation (A4) ».",
        savoir: [
          "Le rapport se lit en ETP d'abord, puis en périodes ; il porte l'en-tête de l'établissement et le pied commun (« produit par… »).",
        ],
      },
      {
        titre: "La PEP et le mécanisme d'ajustement",
        pour: "dir",
        ou: "Gestion → Dotation → face « Dotation » → cartes « Périodes-élèves pondérées (PEP) » et « Mécanisme d'ajustement de dotation ».",
        texte: "Le graphique suit, année par année, la PEP brute, la PEP pondérée, la PEP de référence et la dotation. Le tableau dit, pour chaque dotation, la PEP utilisée (celle de deux ans plus tôt), son écart à la référence et la zone : neutre dans ± 8 %, hausse au-delà de + 8 %, baisse sous − 8 %. En baisse, il estime les périodes perdues : un quart de la dotation × l'écart, plafonné à 50 %.",
        savoir: [
          "La PEP officielle, la PEP de référence et l'année de PEP utilisée se SAISISSENT dans la face Configuration : Lucie ne les invente pas.",
          "La PEP estimée d'après les présences (réguliers au premier dixième) est dans Gestion → Présences : elle se compare à l'officielle, elle ne la remplace pas.",
        ],
      },
      {
        titre: "Régler la dotation : la face Configuration",
        pour: "dir",
        ou: "Gestion → Dotation → face « Configuration ».",
        texte: "Trois cartes. « Dotations organiques par année civile » : une année s'ajoute (« Ex: 2027 », [[Ajouter|fort]]), puis chaque ligne se modifie — Dotation (pér. B), PEP, PEP réf., PEP an. utilisée, Usage historique, Solde constaté, Notes. « Enveloppes extérieures » : [[+ Ajouter]] (code, libellé, année civile, périodes B), [[Modifier]], corbeille. « Attribution des enveloppes par UE » : l'enveloppe de chaque unité, filtrable par section.",
        savoir: [
          "Laissé vide, l'usage historique se calcule depuis les attributions ; rempli, il remplace le calcul pour cette année (années anciennes que la base n'a pas).",
          "La direction et le secrétariat règlent ; supprimer une année civile (avec ses enveloppes) ou une enveloppe est réservé à la direction, après confirmation.",
          "Cette face ne s'imprime pas : elle règle, elle ne rapporte rien.",
        ],
      },
      {
        titre: "L'ETP : la charge en équivalents temps plein",
        ou: "Gestion → Dotation → face « ETP ».",
        texte: "Quatre tuiles d'abord : étudiants par ETP de cours, étudiants par ETP administratif (direction, direction adjointe, secrétariat — les fonctions d'établissement de l'année), étudiants par ETP tout le monde compris, étudiants inscrits. Puis le tableau, section par section et unité par unité : ETP CT, ETP PP, ETP IIP, ETP HELB, ETP total, part du total, inscrits et étudiants par ETP.",
        savoir: [
          "ETP = périodes de cours techniques ÷ 800 + périodes de pratique professionnelle ÷ 1 000, autonomie comprise ; même base pour la HELB.",
          "L'inscrit est compté hors archivés ; dans deux sections, il compte dans chacune, et une seule fois pour l'école.",
          "Les coordinations sont des attributions : elles sont déjà dans les ETP de cours, pas dans l'administratif.",
          "Les ETP administratifs viennent des fonctions encodées dans Personnel → fiche → Fonctions.",
        ],
      },
      {
        titre: "La comparaison entre deux années",
        ou: "Gestion → Dotation → face « Comparaison ».",
        texte: "Choisissez l'année de référence et l'année comparée, la Période (Scolaire ou Civile), le Mode (Pér. B pondérées ou Pér. brutes) et l'Enveloppe (Tout IIP + HELB, Toutes IIP, Organique, AESI, QUAL, CF, INCL, HELB). Le tableau donne, section par section puis unité par unité, le premier et le second quadrimestre et le total de chaque année, et l'écart. « Tout ouvrir » et « Tout fermer » déplient les sections.",
        savoir: [
          "Les périodes HELB se comparent toujours en périodes brutes : elles ne sont pas pondérées.",
          "En mode Civile, une année réunit janvier-juin d'une année scolaire et septembre-décembre de la suivante.",
        ],
      },
      {
        titre: "La répartition des périodes (document 2)",
        pour: "dir",
        ou: "Gestion → Dotation → face « Répartition des périodes ».",
        texte: "La dotation est civile, l'enseignement académique : le document 2 réclame, par activité d'enseignement, les périodes prévues (colonnes 16 et 17) et réellement organisées (18 et 19), réparties entre les deux années civiles. Lucie propose 40 % sur la première et 60 % sur la seconde ; à côté de chaque organisation, le bouton « dates : … % » applique la part que donnent ses dates réelles. Les cases se corrigent une à une — le complément se déduit sur l'autre année —, puis [[Enregistrer|IconDeviceFloppy|fort]].",
        savoir: [
          "Le contrôle qui compte : les périodes réparties doivent égaler les périodes attribuées. Le bandeau le dit, et l'écart est « à résorber avant de déclarer ».",
          "Autres contrôles : la somme des colonnes 16 et 17 doit atteindre le dossier pédagogique ; le rapport réel ÷ prévu compte les dédoublements et doit être entier (× 1, × 2…) ; une organisation tenue entièrement sur une année civile ne porte rien sur l'autre, sauf séance réellement organisée.",
          "En tête, « Dotation de l'année civile » : janvier-juin et septembre-décembre, le total, et les enveloppes fermées, financées à part.",
          "Une unité financée par une enveloppe porte son nom ; les périodes HELB sont marquées « hors dotation » et n'entrent pas dans la répartition.",
          "Réservée à la direction et au secrétariat : la coordination reçoit un refus qui le dit.",
        ],
      },
      {
        titre: "Les coûts des formations",
        pour: "dir",
        ou: "Gestion → Finances → face « Coûts des formations ».",
        texte: "Ce que coûtent les cours et les fonctions, et ce que rapportent droits et frais, au coût de convention : le prix d'une période quand l'établissement l'achète à la Fédération, pas les traitements versés. En tête, six tuiles : Coût complet, Cours, Fonctions, ETP enseignants (chargés de cours et experts), Par étudiant, Perçu (DI et frais). Puis le coût poste par poste, par section et par étudiant ; les personnes (sexe, nationalités) ; les ETP par section ; ce que coûte et rapporte chaque formation ; section par section ; droits d'inscription et frais ; personnel administratif et coordinations (sans les noms) ; unité par unité.",
        savoir: [
          "Une unité partagée entre sections (le tronc commun d'optométrie et d'orthoptie) se répartit au prorata de leurs étudiants.",
          "« Ce que coûte et rapporte chaque formation » distingue le coût salarial (payé par la FWB, la HELB, ou sur fonds propres quand l'attribution est cochée ainsi) du coût véritable pour l'école (fonds propres et budget) ; [[Prévisionnel]] lit le budget prévu, [[Réalisé]] les dépenses encodées dans Budget ; l'année civile du budget se choisit à côté.",
          "Les ratios d'encadrement se lisent en quatre vues — Profs, Profs + coordination, Tout le personnel, Taille des groupes — en étudiants ou en étudiants équivalents temps plein.",
          "« Inscrits prévus » (repliable, en tête) donne un effectif aux sections ou unités qui n'ont pas encore d'inscrit encodé ; un fichier de pré-inscriptions peut proposer les chiffres, rien ne s'écrit sans [[Enregistrer]].",
          "[[Recalculer|IconRefresh]] relit tout ; [[Imprimer ou envoyer|IconSend]] compose la pièce mise en page (A4 paysage), qui peut aussi partir par courriel.",
        ],
      },
      {
        titre: "Le coût moyen brut pondéré, à côté du coût détaillé",
        pour: "dir",
        ou: "Gestion → Finances → face « Coûts des formations » → carte « Coût moyen brut pondéré, par niveau ».",
        texte: "La haute école raisonne en coût moyen brut : une seule valeur par période et par niveau (106 € pour le supérieur), multipliée par toutes les périodes attribuées. La carte le calcule, IIP et HELB séparés, et met en regard le coût détaillé de la circulaire. Les deux chiffres portent sur les mêmes périodes : l'écart vient de la méthode, pas du comptage.",
        savoir: [
          "Un niveau dont la valeur vaut 0 est « à régler » : ses périodes sont comptées, sans montant, et la carte le nomme.",
          "Ni l'un ni l'autre ne compte les activités Z (sans enseignant) ni les attributions en congé.",
        ],
      },
      {
        titre: "Les montants : Configuration → Coût des périodes",
        pour: "dir",
        ou: "Configuration → Établissement → Coût des périodes.",
        texte: "Les montants qui font les coûts ne sont pas écrits dans le code : ils se corrigent ici à chaque nouvelle circulaire, sans mise à jour de Lucie. Le prix d'une période par niveau (supérieur, secondaire supérieur, secondaire inférieur) et par type de cours (généraux et techniques, spéciaux, pratique professionnelle), le texte de référence et la date d'effet ; le coût moyen brut de chaque niveau ; le coût annuel d'un temps plein par fonction et les périodes B d'un temps plein pour les emplois d'établissement ; le délai de remplacement sans coût. On y règle aussi les frais d'instruction d'une valorisation, les sections sans frais complémentaires et les sections dont les droits sont perçus par un tiers.",
        savoir: [
          "Les montants amorcés sont ceux de la circulaire n° 9789 (1er septembre 2026).",
          "Plus bas sur la même page : les inscrits prévus, comme dans les Coûts des formations.",
          "Écrire est réservé à la direction ; un rôle qui lit Configuration voit les montants sans pouvoir les changer.",
        ],
      },
      {
        titre: "Imprimer des parties de la Gestion",
        ou: "Gestion → [[Imprimer des parties…|IconPrinter]] (en tête de chaque face).",
        texte: "La fenêtre « Imprimer des parties de la Gestion » liste les rubriques et leurs faces à cocher ([[Tout cocher]], [[Tout décocher]]) ; l'œil du bandeau compose l'aperçu, chaque partie sur sa page. Dans l'aperçu, « Éléments à imprimer » liste chaque carte et chaque rangée de tuiles, à décocher ; [[Choisir les blocs]] permet aussi de retirer un bloc d'un clic. [[PDF|IconPrinter|fort]] produit l'A4 paysage avec le pied et le numéro sur chaque feuille ; « Imprimer (navigateur) » reste le repli, sans pied garanti.",
        savoir: [
          "Attendez que les graphiques soient chargés avant le PDF.",
          "La face Configuration ne figure pas dans la liste.",
        ],
      },
      {
        titre: "Les rapports de gestion du centre d'édition",
        pour: "dir",
        ou: "Éditions → Gestion → Listes et rapports.",
        texte: "Quatre pièces chiffrées sortent par l'avion, mises en page par Lucie : « Charge en ETP » (l'établissement, une section, une unité ou un cours), « Rapport statistique » (coûts et recettes des formations), « Chiffres clés par section » (étudiants, personnel, ETP et offre, avec le taux de remplissage de chaque donnée) et « Emploi de la dotation par section » (organisé, attribué, écart). Le Rapport ETP donne aussi le ratio étudiants / ETP.",
        savoir: [
          "Les chiffres sont ceux des écrans de Gestion, au même calcul : rien n'est ressaisi pour la pièce.",
        ],
      },
    ],
  },

  {
    // Icône proposée : IconCoin (celle de la rubrique « Finances » du rail de Gestion).
    id: 'frais', pour: 'sec dir', titre: 'Frais de scolarité et paiements', icone: 'IconCoin',
    resume: "Ce que l'étudiant doit, comment il paie, ce qui est versé et ce qui reste : le calcul du droit d'inscription et des frais, la note de frais avec son QR de paiement, les versements, les extraits de compte, les frais d'instruction des valorisations et les remboursements.",
    points: [
      {
        titre: "Ce que l'étudiant paie : trois montants",
        ou: "Fiche de l'étudiant → onglet « Finances » → carte « Montant à payer ».",
        texte: "Le total réunit le droit d'inscription (fixé par la Fédération), le droit d'inscription spécifique s'il y est soumis, et les frais administratifs de l'établissement. Dessous : l'acompte à l'inscription, le solde et sa date, ce qui est versé et ce qui reste. Tout se calcule sur le programme de l'année (PAE) : changer le programme change les montants.",
        savoir: [
          "L'acompte n'est pas un supplément : droit d'inscription, droit spécifique et partie fixe des frais, il s'impute sur le total.",
          "Le solde est dû au 1er octobre, ou plus tôt si le premier dixième d'une unité du programme tombe avant — la même règle du premier dixième que partout dans Lucie.",
          "Une unité en dispense complète (valorisée) n'entre dans aucun montant.",
        ],
      },
      {
        titre: "Le droit d'inscription",
        ou: "Fiche → Finances → carte « Droit d'inscription ».",
        texte: "Un forfait par étudiant et par année, plus un montant par période de cours : un tarif pour les unités du secondaire, un autre pour celles du supérieur. La carte écrit la formule — forfait, périodes × tarif de chaque niveau — et « Détail des … UE » donne la ligne de chaque unité. Le forfait est porté par l'unité dont le premier dixième vient le plus tôt (à égalité, celle qui finit d'abord).",
        savoir: [
          "Le plafond de 800 périodes est global et s'épuise d'abord sur les périodes du secondaire, comme dans l'exemple de la circulaire ; la carte le signale quand il est atteint.",
          "Le droit d'inscription se calcule sur les périodes du dossier pédagogique (côté enseignant) ; le montant perçu est arrondi aux 5 cents.",
          "« Exonéré du paiement » se coche avec un motif choisi dans la liste de la circulaire (chômeur indemnisé, demandeur d'emploi, revenu d'intégration, situation de handicap…) : le montant dû tombe à zéro, le montant constaté reste lisible, barré.",
          "Le barème de l'année est celui de la circulaire 9731 ; s'il n'a pas été posé pour l'année, la carte le dit (« barème par défaut »).",
        ],
      },
      {
        titre: "Le droit d'inscription spécifique et les droits perçus par un tiers",
        ou: "Fiche → Finances → cartes « Droit d'inscription spécifique » et « Droit d'inscription » (« perçus par un tiers »).",
        texte: "Le droit spécifique concerne l'étudiant de nationalité étrangère non exempté : cochez « Étudiant de nationalité étrangère, concerné par ce droit », puis choisissez l'exemption s'il y en a une (ressortissant de l'Union, réfugié, pris en charge par un CPAS…) ; il se calcule par période hebdomadaire, plafonné. Quand les droits et frais d'un étudiant sont perçus par un autre établissement — l'orthoptie par la HELB —, la fiche le dit : par défaut celui de la section, sinon celui qu'on pose sur la fiche avec sa raison.",
        savoir: [
          "Un étudiant dont les droits sont perçus par un tiers ne paie aucun frais administratif à l'IIP, et ses droits sortent des recettes de l'établissement.",
          "La raison posée est celle que lira la vérification : dites d'où vient le droit d'inscription.",
          "Exonérations et tiers se posent par la direction et le secrétariat.",
        ],
      },
      {
        titre: "Les frais administratifs (frais de scolarité)",
        ou: "Fiche → Finances → « Frais de scolarité » → carte « Calcul des frais ».",
        texte: "Les frais de l'établissement (règlement des études, art. 16 à 20) : une partie fixe (150 €) et une partie variable, les périodes étudiant du programme × 0,25 €. La carte écrit le calcul, puis l'acompte, le solde avec sa date et le total dû, versé et restant. En pied, le barème des petits frais : duplicata de carte, duplicata de document, copie d'épreuve à la page.",
        savoir: [
          "Les frais se calculent sur les périodes ÉTUDIANT de l'unité ; le droit d'inscription, sur les périodes du dossier côté enseignant.",
          "Certaines sections ne perçoivent aucun frais complémentaire (l'AeSI par défaut) : la carte le dit, le droit d'inscription reste dû. La liste se règle dans Configuration → Coût des périodes.",
          "Quand l'acompte n'est pas entièrement versé, la carte le signale.",
        ],
      },
      {
        titre: "La note de frais",
        ou: "Fiche → Finances → [[Produire le document]] ; aussi par Éditions → Étudiants → Documents (les frais, parmi les pièces d'un ou de plusieurs étudiants).",
        texte: "La pièce remise à l'étudiant : son programme, le décompte (droit d'inscription, droit spécifique, frais administratifs, frais d'instruction des valorisations), l'acompte à verser pour valider l'inscription et le solde avec sa date, le cadre « Pour payer par virement », les versements enregistrés et le restant dû, ce que couvrent les frais, et deux signatures. [[Fiche d'inscription / reçu]], juste en dessous, sort le récapitulatif du programme, des droits et de l'engagement signé.",
        savoir: [
          "Ce document est distinct du droit d'inscription : la Fédération ne connaît pas les frais de l'établissement.",
          "Le calcul est le même à l'écran et sur la pièce : le secrétariat peut répondre à un étudiant sans produire de PDF.",
        ],
      },
      {
        titre: "Payer par virement : communication structurée, compte et QR",
        ou: "Fiche → Finances → « Frais de scolarité » (sous le calcul) ; et sur la note de frais.",
        texte: "Chaque étudiant a, pour chaque année, sa communication structurée belge (+++…/…/…+++) : elle dit à elle seule quel étudiant et quelle année le virement paie. Elle s'affiche avec le compte de l'établissement et un QR code de paiement au format européen, que l'application bancaire lit d'un geste : bénéficiaire, compte, montant et communication se remplissent seuls. Le QR porte l'acompte qui manque, sinon le reste dû.",
        savoir: [
          "Le compte est celui de l'établissement de la section de l'étudiant : « Compte des frais étudiants (IBAN) », dans Configuration → Identité. Un IBAN invalide est refusé.",
          "Sans compte, pas de QR code : la fiche le dit en clair.",
          "La communication se calcule, elle ne se tape pas : rien à attribuer, rien à retenir.",
          "À vérifier avec une application bancaire réelle : que la communication arrive reconnue comme structurée.",
        ],
      },
      {
        titre: "Encoder un versement",
        ou: "Fiche → Finances → « Frais de scolarité » → Versements → [[Encoder un versement]].",
        texte: "La ligne de saisie s'ouvre avec la date du jour, le montant proposé (ce qui manque à l'acompte, sinon le reste), la nature (Acompte, Solde, Analyse VA, Duplicata, Autre, Remboursement) et le moyen (Virement, Bancontact, Espèces, Autre) ; une remarque au besoin. [[Enregistrer|fort]]. Le versement s'inscrit au nom de la personne connectée, avec la date de saisie, et « reste à payer » se met à jour partout.",
        savoir: [
          "Un montant nul est refusé ; un montant négatif ne s'accepte que pour un remboursement.",
          "Encoder est réservé au secrétariat et à la direction ; les autres lisent.",
        ],
      },
      {
        titre: "Annuler un versement",
        ou: "Fiche → Finances → Versements → « annuler » sur la ligne.",
        texte: "Un versement ne s'efface jamais : c'est de l'argent. « annuler » demande un motif ; le versement sort des totaux mais reste lisible, barré, avec la date, le nom de qui l'a annulé et le motif (« … versement(s) annulé(s) » sous la liste).",
        savoir: [
          "Sans motif (trois caractères au moins), le serveur refuse.",
          "Un virement venu d'un extrait puis annulé n'est pas réimporté : l'extrait le montre « déjà importé, puis annulé ».",
        ],
      },
      {
        titre: "Importer les extraits de compte",
        ou: "Étudiants → rail → Extraits de compte — versements des étudiants.",
        texte: "Dans la banque en ligne, téléchargez l'extrait du compte qui reçoit les frais — au format CODA, XML (CAMT.053) ou CSV — et déposez-le par [[Choisir l'extrait|IconUpload|fort]]. Lucie ne fait que LIRE et proposer : chaque mouvement avec sa date, son montant, le donneur d'ordre, la communication, l'étudiant trouvé, ce qui lui reste dû et un état. Cochez, puis [[Enregistrer les versements cochés|fort]] ; « Autre extrait » recommence.",
        savoir: [
          "Reconnu : la communication structurée est valide — la ligne part cochée. À vérifier : le montant dépasse ce qui reste dû, ou il n'y a pas de communication et le nom du donneur d'ordre ne désigne qu'un seul inscrit de l'année — à cocher à la main. Non rattaché : ni l'un ni l'autre.",
          "Les débits sont ignorés ; un virement déjà importé ne s'importe jamais une seconde fois. « voir les … déjà importé(s) et … débit(s) » les remontre.",
          "Le CSV se lit d'après les intitulés de ses colonnes, en français ou en néerlandais (BNP Paribas Fortis, Belfius, KBC, ING) : gardez la ligne des titres telle que la banque la donne.",
          "Chaque versement s'enregistre au nom de la personne connectée, moyen « virement », nature « acompte » tant que l'acompte n'est pas couvert, sinon « solde ».",
          "Un virement non rattaché s'encode à la main dans la fiche, après avoir retrouvé qui l'a fait.",
          "Les positions du format CODA suivent la norme Febelfin : elles restent à vérifier sur un vrai extrait de la banque de l'école.",
        ],
      },
      {
        titre: "Les frais d'instruction des valorisations",
        ou: "Fiche → Finances → « Frais de scolarité » → bloc « Analyse des demandes de valorisation ».",
        texte: "Toute demande de valorisation (VA ou VAE) se paie, quelle que soit la décision : c'est l'examen du dossier qui est payé, dès la demande. Lucie compte 30 € par unité demandée et 50 € pour une admission. Chaque demande a sa ligne, avec son calcul ; le total s'ajoute à la note de frais et se paie avec le solde.",
        savoir: [
          "Une demande peut être dispensée : [[Dispenser…]] demande un motif, la ligne dit « dispensée du forfait : … » ; [[Rétablir]] l'annule. Direction et secrétariat.",
          "Les montants se règlent dans Configuration → Coût des périodes.",
          "Le prix est annoncé à l'étudiant dans son espace avant qu'il envoie sa demande en ligne, et figure sur l'accusé de réception.",
          "Le texte d'explication sous le titre décrit encore l'ancienne règle (comparaison aux frais de l'unité, 15 € de supplément) : c'est le calcul de chaque ligne qui fait foi.",
        ],
      },
      {
        titre: "Les remboursements",
        ou: "Fiche → Finances → bandeau « Remboursement à faire », puis Versements → [[Encoder un versement]], nature « Remboursement (négatif) ».",
        texte: "Un remboursement s'encode comme un versement, en montant négatif, nature « Remboursement ». Après un refus en seconde session, les unités retirées du PAE par le secrétariat donnent un remboursement calculé (voir le chapitre Délibération) : le bandeau de la fiche le montre avec son montant et l'unité refusée, jusqu'à ce que le remboursement soit encodé.",
        savoir: [
          "Ce qui est remboursé : le droit d'inscription et les frais variables des unités retirées — jamais la partie fixe ni les frais d'instruction d'une valorisation ; si l'étudiant doit encore de l'argent, cela s'en déduit d'abord.",
          "Les autres remboursements (désinscription) suivent l'article 19 du règlement des études : Lucie ne les calcule pas, on les encode.",
        ],
      },
      {
        titre: "Les rappels de paiement",
        ou: "Configuration → Courriels → Rappels (réglage de la direction).",
        texte: "Quand la direction allume les rappels, l'étudiant qui a encore un solde est prévenu dans son espace sept jours avant l'échéance du solde, puis trois jours après ; et chaque lundi, le bilan envoyé au secrétariat et à la direction compte les frais échus restés impayés.",
        savoir: [
          "Les rappels naissent éteints ; ceux des étudiants ne partent que si l'espace de l'étudiant est en service et « Mes frais » ouvert pour eux.",
          "L'avis à l'étudiant est sans contenu sensible : un intitulé et le lien de son espace, un seul avis par jour.",
        ],
      },
      {
        titre: "Les frais dans les chiffres de l'école",
        pour: "dir",
        ou: "Gestion → Finances → face « Coûts des formations » → carte « Droits d'inscription et frais ».",
        texte: "Par section : droit d'inscription, droit spécifique, frais administratifs, total dû, versé et par étudiant — le même calcul que la fiche de chaque étudiant. Les droits perçus par un tiers (l'orthoptie par la HELB) sont signalés et comptés à part.",
        savoir: [
          "Le droit d'inscription spécifique revient à la Fédération : il est dû par l'étudiant, il ne fait pas une recette de l'école.",
        ],
      },
    ],
  },
];

export const ajouts = {};

export const remplacements = {
  // Le point disait « Tableau de bord → Chiffres de l'école » : ces lectures ont rejoint Gestion (14 octobre 2026).
  "accueil|Chiffres de l'école": {
    pour: 'sec coo dir', titre: "Chiffres de l'école",
    ou: "Gestion → rail → Données de l'établissement (si votre rôle y a accès).",
    texte: "Les chiffres de l'école vivent dans Gestion, en rubriques : « Population » (Qui sont nos étudiants — sections, sexe, âge, domicile, nationalité, nouveaux et diplômants sur cinq ans ; Notre personnel ; Places par unité — les étudiants au programme confirmé, face à l'effectif prévu) · « Présences » · « Résultats » (Décisions et taux de réussite ; Distributions des cotes) · « Dotation » (dotation, ETP, comparaison) · « Qualité » · « Finances » (coûts des formations, budget). Chaque face suit l'année choisie en tête de page.",
    savoir: [
      "ETP = cours techniques / 800 + pratique professionnelle / 1000, autonomie comprise — la même formule partout dans Lucie.",
      "Un taux se calcule sur les dossiers décidés, jamais sur les inscrits : un dossier sans décision se compte à part.",
      "Ce sont les chiffres que demande la démarche qualité (AEQES) : inscrits par section, ETP, résultats.",
      "La coordination ne voit ni « Notre personnel », ni les Présences, ni les coûts des formations.",
    ],
  },
  // Le point disait « Dotation · Budget · Répartition · Configuration » et renvoyait l'ETP au Tableau de bord.
  "gestion|Les écrans": {
    pour: 'coo dir', titre: "Les écrans",
    ou: "Gestion → rail → Données de l'établissement.",
    texte: "Une entrée de rail se déplie en rubriques — Population · Présences · Résultats · Dotation · Qualité · Finances —, et les faces d'une rubrique se choisissent en tête de l'écran. Les faces suivent l'« Année scolaire » choisie en tête de page ; la Dotation suit l'année civile du rail, le Budget la sienne. [[Imprimer des parties…|IconPrinter]] compose une pièce de plusieurs faces. Dotation, ETP, coûts : voir le chapitre « Dotation, ETP et coûts ».",
    savoir: [
      "Chaque rubrique ne paraît qu'à qui a le droit de la lire : la dotation, la répartition et le budget suivent leur propre droit.",
    ],
  },
};
