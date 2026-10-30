# Audit « la boucle est-elle bouclée ? » — 28 octobre 2026 (Lucie 3.1.423 → 3.1.426)

Relevé en lecture seule : routes sans écran, tables écrites sans lecteur, chaînes
métier rompues. Les preuves (fichier:ligne) valent pour la version 3.1.423.

## Fermées en 3.1.426
- Configuration → Sections & diplômes : la liste « section d'attestation ↔ section UE »
  appelait `/api/referentiels/ue-sections` (inexistant) → `/api/ref/ue-sections`.
- Recrutement : l'analyse de CV et les questions d'entretien appelaient le service d'IA
  depuis le navigateur, sans clé (échec garanti, données hors de Lucie) → par le serveur
  (`/api/analyse-cv`, `/api/analyse-cv/questions`, demande composée côté serveur).
- Le commentaire du Conseil des études (importé, jamais lu) → fiche, onglet Parcours.
- Le motif de réouverture d'une séance close (écrit, jamais relu) → feuille de délibération.
- Les corrections du calendrier après clôture (écrites, jamais lues) → écran Sessions.
- Le registre du congé-éducation payé (route sans écran) → Suivi des présences → Congé-éducation.

## Restent ouvertes, par ordre d'importance
1. Régularité au 1/10 → dotation de Pilotage (la dotation compte les inscriptions).
2. Démarche qualité AEQES : table `action` jamais remplie ni lue ; ni écran Qualité, ni
   indicateurs, ni rapport des inscrits sur cinq ans. Urgent pour 2028-2029.
3. Frais de scolarité : saisie des versements sans écran (`POST/DELETE /api/frais-scolarite/paiement`),
   barèmes non réglables à l'écran.
4. Valorisation → parcours : aucune route n'écrit `resultat = 'valorise'` (annexe 2, statistiques à zéro).
5. ~~Pièces d'un autre établissement : `etablissementDeSection` jamais appelée.~~ Fait en 3.1.443.
6. Motifs par défaut des acquis (`/api/acquis/motifs-defaut`) sans écran.
7. Ménage : ~20 routes sans appelant (attestations/candidats|lot|pdf, ref/personnel-etablissement,
   horaire/seances, grille/calendrier, planification/synthese, impression/valeurs|destinataires,
   notes-doubles/journal, apercu/catalogue, exports/professeurs, prerequis/disponibilites…) et
   fichiers orphelins (TexteDossierPedagogique.jsx — demandé le 14 octobre —, CentreImpression.jsx,
   CentreDocumentsUE.jsx, LiensCoursAcquis.jsx, pages/PonderationsAA.jsx, lib/routage.js, lib/lireSuivi.js).
8. Chantiers de conformité de la délibération : gel et historisation des décisions, PV figé
   et horodaté, bloc de signatures nominatif, mode de publication.
9. Questions à trancher (Charles) : cote d'un ajourné à moyenne > 10 ; périodes Z sur les
   pièces ; note d'attribution par une coordination ; 1er dixième (vérificatrice ou RGE) ;
   transfert d'autonomie entre UE ; voies de recours des aménagements ; procédure PO.

## Deuxième relevé : une chose, deux portes (3.1.427-3.1.428)

Demande de Charles : « vérifier qu'il n'y a pas pour une chose deux entrées possibles ». Fermé :
- **Grille du parcours** : chaque choix effaçait la valorisation de l'unité et son journal ; refus
  désormais sur un dossier du circuit (≥ 2026-2027) ou validé/notifié (« inscrit » coexiste).
- **Séances d'horaire** : la présence tombait avec la séance (cascade). Déclencheur
  `garde_seance_presences` ; réimport, retrait d'un lot, versement du plan et import CSV
  épargnent les séances qui portent des présences (et le réimport ne les double pas) ;
  `DELETE /horaire/seance/:id` demande d'annuler plutôt.
- **Valorisation validée** : déclencheur `garde_va_validee` — aucune porte ne la supprime.
- **Création de VA** : la fiche refuse un second dossier sur la même unité ; fiche et lot
  écrivent la ligne « introduction » du journal.
- **Report de notes** : `PUT /acquis/reports` copie les notes des acquis comme le report
  d'office, et ne renverse un refus qu'avec un motif.
- **Fusion d'étudiants** : `/import-historique/fusionner` délègue à la fusion des doublons.
- **Section d'un dossier de procédure** : la règle commune (`lib/sectionDossier.js`).
- **`copier-section`** déclarée deux fois : une seule route (colonnes de travail, périmètre,
  écrasement admin dans la transaction). **`creer-depuis-cours`** pose le périmètre.

Restent, plus lourds — à décider :
1. **Créer un étudiant** : six portes (fiche, imports eCampus/Excel/HELB/historique, portail) ;
   `POST` ne pose pas `rn_norm`, `/import-excel` peut écraser une adresse par NULL. À unifier
   dans `trouverOuCreerEtudiant()` sur `rapprocher()`.
2. **Notes après clôture** : plusieurs portes écrivent une note sans regarder si la séance est
   close (acquis.js — encodage direct, import des notes —, grille/detail du parcours).
3. **Programmes hors `ecrireProgramme()`** : /matrice, /pae-resultats, /encodage-direct, la grille,
   /grille/deplacer ; `/doubles-programmes` garde la confirmation du PAE ; `/repartition` et
   `/grille/cohortes` écrivent tous deux `num_organisation`.
4. **Dates de l'UE** : `PUT /grille/ue` et `/organisation-de-base` passent outre la demande de la
   coordination et le périmètre que respecte `PUT /annuel/dates-ue`.
5. **Professeurs** : `UNIQUE(nom, prenom)` sensible à la casse (« Dupont » ≠ « DUPONT »).

## Troisième passe (3.1.432 → 3.1.440) — fermé

- Notes d'une séance close : `lib/gardeNotes.js` (déclencheurs qui ignorent, écrans qui refusent en 409).
- Routes de résultats (matrice, encodage direct, résultats du PAE, grille) : `refusResultat()` — ni
  délibération close rejugée, ni inscription créée hors du PAE pour l'année de travail.
- Doubles programmes par `ecrireProgramme()`.
- Dates d'UE du laboratoire : périmètre, fin après début, demande de la coordination.
- Création d'étudiant : `trouverOuCreerEtudiant()` pour la liste et l'Excel eCampus ; `rn_norm` par déclencheur.
- Professeurs : `professeurExistant()`, casse et accents ignorés.
- Versements : saisie dans Finances ; annulation motivée, jamais d'effacement.
- VA dans le parcours : `uesValorisees()` (crédits de l'annexe 2, schéma, motif) au lieu d'un `'valorise'`.
- Motif par défaut d'un acquis : son écran, dans la fiche de l'UE.
- Ménage : sept fichiers jamais importés retirés ; banc `reports.mjs` remis d'aplomb (15/15).

## Restent — à décider par Charles
1. **Dotation / PEP** : Lucie ne calcule pas les périodes-élèves (saisies d'après eProm, Menus 7 et 5.5).
   Pour y brancher les réguliers au 1er dixième, il faut la formule : réguliers × périodes de l'UE
   (lesquelles : professeur, étudiant ?) et la pondération du Menu 5.5.
2. ~~**Pièces d'un autre établissement**~~ — fait en 3.1.443 (Charles : une section cette année) :
   l'établissement se déduit de la section, de l'étudiant ou de l'UE de la requête.
3. **Démarche qualité AEQES** : un module à concevoir (registre des actions dans l'échéancier,
   indicateurs, inscrits sur cinq ans).
4. **Routes sans appelant** (~20) : à retirer après vérification qu'aucun script ni le script des gestes du VPS ne s'en sert.
