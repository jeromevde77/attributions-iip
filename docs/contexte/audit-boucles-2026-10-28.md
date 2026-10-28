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
5. Pièces d'un autre établissement : `etablissementDeSection` jamais appelée.
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
