# Changelog

## v3.9.19 — 29 juin 2026

### Attestations — signature du directeur
- Signature de Charles Sohet (fond transparent) intégrée au-dessus de la ligne dorée du bloc directeur

## v3.9.18 — 29 juin 2026

### Attestations — équilibrage vertical
- Contenu réparti sur toute la hauteur de page (retour à une distribution équilibrée), pied de page maintenu remonté

## v3.9.17 — 29 juin 2026

### Attestations — pondération figée (cours + autonomie)
- Périodes pondérantes fixées aux totaux confirmés : UE 251/252/253/259 = 80, UE 256 = 60, UE 263 = 600 (total déterminantes 980)
- Retrait du chargement depuis le référentiel qui renvoyait l'autonomie à 0 (écrasait avec les périodes de cours seules)

## v3.9.16 — 29 juin 2026

### Attestations — fix export & mise en page PDF
- Export liste : correction du bug (id numérique) ; matricule désormais fiable (champ dédié)
- Mise en page : flux naturel (fin des grands espaces irréguliers), date + signatures poussées en bas, pied de page remonté (8 mm de marge inférieure)
- « Né·e à … » : plus de virgule orpheline quand le lieu de naissance est absent

## v3.9.15 — 29 juin 2026

### Attestations — génération en PDF
- « Générer les attestations » produit désormais un ZIP de fichiers PDF A4 (un par étudiant) au lieu de HTML
- Rendu via jsPDF + html2canvas (mise en page identique à l'aperçu) ; règle UE 264 ≥ 10 maintenue

## v3.9.14 — 29 juin 2026

### Attestations — autonomie, année, signatures, export
- Pondération : correction du chargement de l'autonomie (lignes UE dupliquées ; on garde le total cours+autonomie, ex. UE252/253 = 80)
- Référentiel chargé selon l'année active ; année désormais éditable dans l'en-tête
- Signatures : directeur centré en bas, +5 mm d'espace pour signer, fine ligne dorée sous chaque nom
- Export liste : téléchargement fiabilisé (+ message d'erreur explicite si échec)

## v3.9.13 — 29 juin 2026

### Attestations — corrections mise en page & règles
- Export liste/attestations : téléchargement corrigé (compatibilité navigateurs)
- Bandeau « Communauté française … Année académique » forcé sur une seule ligne
- Texte du corps : ponctuation/majuscules harmonisées (phrase continue, minuscules de continuité)
- Impression : marges/espacements ajustés pour tenir sur une seule page A4 (sans réduire à 99%)
- Signatures : barres uniformisées (40 mm) et raccourcies, identiques pour tous les signataires
- Directeur affiché « Charles Sohet » (prénom nom, comme les autres signataires)
- Génération/prévisualisation d'attestation réservée aux étudiants ayant une note UE 264 ≥ 10 (réussie)

## v3.9.12 — 29 juin 2026

### Attestations — pondération cours + autonomie
- La pondération des UE déterminantes utilise désormais les périodes cours + autonomie (ue_per_etudiants + ue_aut) lues dans le référentiel, au lieu des seules périodes de cours
- Périodes chargées dynamiquement via /api/referentiels/ue ; mentions recalculées automatiquement

## v3.9.11 — 29 juin 2026

### Attestations — export de la liste
- Nouveau bouton « Exporter la liste » : génère un CSV (ouvrable dans Excel) des étudiants actuellement affichés (filtres et tri appliqués), avec matricule, identité, notes /20 par UE, moyenne % et mention — pour vérification par le secrétariat/coordination avant génération des attestations

## v3.9.10 — 29 juin 2026

### Attestations — document épuré
- L'attestation n'affiche plus le détail des notes d'UE (ni déterminantes ni épreuve intégrée) ; seule la mention est indiquée

## v3.9.9 — 29 juin 2026

### Attestations — persistance + filtres
- La liste (étudiants, notes, mentions) est désormais sauvegardée en base : rechargement automatique à l'ouverture, autosave après chaque modification + bouton « Enregistrer » manuel
- Barre de filtres/tri : recherche par nom, filtre par UE (avec/sans note encodée), tri par nom, mention ou note de l'UE sélectionnée
- Compteur « affichés / total »

## v3.9.8 — 29 juin 2026

### Attestations — import UE 264 (épreuve intégrée)
- Note UE 264 (Total /20) importée pour 26 étudiants TIM BA1 ; mention recalculée automatiquement (2/3 déterminantes + 1/3 UE 264)

## v3.9.7 — 29 juin 2026

### Attestations — import dates de naissance + genre
- Date de naissance et genre importés depuis l'onglet Coordonnées du suivi TIM (jointure Nom+Prénom) : 90/101 étudiants
- Genre déduit de la civilité (Madame/Monsieur)
- Lieu de naissance non disponible (colonne LieuNais vide dans la source) ; 11 étudiants absents du fichier de coordonnées — à compléter manuellement

## v3.9.6 — 29 juin 2026

### Attestations — saisie des notes en tableau
- Saisie des résultats UE repensée en tableau : 1 ligne par étudiant, colonnes propriétés + 1 colonne par UE déterminante (note /20) + UE 264
- Notes saisies sur /20 (conversion ×5 automatique pour le calcul de mention en %)
- Mention calculée et affichée automatiquement par ligne ; suppression de l'ancien panneau en cartes

## v3.9.5 — 29 juin 2026

### Attestations — promotion TIM BA1 2025-2026
- Cohorte du module Attestation remplacée par les 101 étudiants TIM BA1 (matricule année courante, redoublants résolus)
- UE déterminantes alignées sur le programme BA1 : 251, 252, 253, 256, 259, 263 — total 900 périodes (+ UE 264 épreuve intégrée, pondération 1/3)
- Notes de délibération converties de /20 en % (×5) ; UE 264 à encoder en délibération

## v3.0 — 20 mai 2026

### Gestion de la structure académique (nouveau module « Référentiels »)
- Ajout, modification et suppression des UE, cours et sections directement depuis l'application, sans passer par Excel
- Définition des périodes prévues par cours (Cours_per), du niveau (SUP/DS), du quadrimestre et de l'autonomie
- Suppression bloquée s'il existe encore des attributions liées (protection contre les effacements accidentels)

### Gestion multi-années
- Sélecteur d'année scolaire dans l'en-tête (2025-2026, 2026-2027, …)
- Création d'une nouvelle année soit vide, soit par copie complète d'une année existante (structure + attributions)
- Chaque année est totalement indépendante : les UE, cours et calculs ne se mélangent jamais entre années

### Affichage des attributions
- Vue par section en accordéons : Section → UE → Cours, repliables à tous les niveaux
- Vue mobile repliable avec en-têtes de section, cartes détaillées et édition complète au toucher
- Colonnes redondantes masquées dans la vue accordéon pour plus de lisibilité
- Numéro d'organisation : une même UE peut être organisée plusieurs fois (sept./janv., sections différentes, jurys multiples)
- Filtres (section, UE, professeur, contrat, type) appliqués immédiatement

### Contrats HELB
- Coloration rose des lignes HELB pour les repérer d'un coup d'œil
- Statut « PI » (professeur invité) affiché à la place de « EXP » pour les contrats HELB
- Champ statut HELB (MFP/MA) actif uniquement pour les attributions HELB

### Professeurs
- Édition complète des coordonnées : nom, prénom, emails, statut, adresse, CAPAES, ancienneté
- Création et suppression de professeurs depuis l'application

### Pilotage
- Tableau de bord revu : indicateurs clés, récapitulatif par section, détail par niveau
- Calcul de la dotation en année civile : répartition Sept-Déc / Jan-Juin selon le quadrimestre
- Concordance DOC 2-3 (prévu vs attribué) avec mise en évidence des écarts

### Sécurité et confort
- Accès en HTTPS sécurisé (certificat Let's Encrypt)
- Session prolongée à 30 jours (moins de reconnexions)
- Historique des modifications activable, avec retour arrière possible
- Sauvegarde de la base de données par téléchargement direct
- Gestion des utilisateurs intégrée dans le menu Configuration
- Badge de version en bas d'écran pour vérifier la version déployée
- Police unifiée (Aptos / Arial) sur toute l'application

## v2.0 — 14 mai 2026

### Nouvelles fonctionnalités

#### Page Planning hebdomadaire (nouvelle)
- Grille des 43 semaines (S0 → S42) pour chaque attribution
- Édition inline cellule par cellule, sauvegarde au blur
- Calcul automatique du solde : `Heures cibles − Heures placées`
- Code couleur du solde : vert (0), rouge (reste à placer), orange (sur-placement)
- Colonne professeur figée à gauche
- Filtrage par section et par professeur

#### Création d'attribution (formulaire structuré)
- Modale dédiée avec champs groupés (Contexte / UE-Cours / Groupe / Professeur / Charge)
- Dropdowns en cascade : section → UE → cours
- Aperçu temps réel des calculs (Total, Heures, Coût dotation) pendant la saisie
- Validation des champs obligatoires (section, UE, cours, professeur)

#### Suppression d'attribution
- Bouton 🗑 par ligne dans la grille
- Confirmation avant suppression
- Audit log automatique

#### Gestion utilisateurs (page Utilisateurs)
- Réservée aux administrateurs
- Création d'utilisateurs avec rôle (admin / éditeur / consultation)
- Changement de rôle en ligne (dropdown direct dans la liste)
- Réinitialisation de mot de passe en un clic
- Désactivation / réactivation (sans suppression)
- Suppression définitive (sauf compte courant)
- Affichage de la dernière connexion

### Routes backend ajoutées
- `GET /api/planning` — Récupération du planning hebdomadaire
- `PATCH /api/planning/:attributionId/:semaine` — Modification d'une cellule
- `GET /api/users` — Liste des utilisateurs (admin)
- `POST /api/users` — Création (admin)
- `PATCH /api/users/:id` — Modification (admin)
- `DELETE /api/users/:id` — Suppression (admin, sauf soi-même)

### Améliorations v1
- Routing React Router avec lien "Utilisateurs" visible uniquement pour les admins
- Filtrage de la grille Attributions amélioré (5 critères + recherche libre)
- Bouton "Nouvelle" intégré dans la barre de filtres
- Statistiques résumées au-dessus de la grille (lignes, IIP, HELB)
- Style général affiné (cohérence des badges, tabular-nums sur les colonnes numériques)

### Documentation
- `GUIDE-INSTALLATION-SYNOLOGY.md` — guide pas-à-pas complet (8 étapes + dépannage + sauvegarde automatique)
- `MAQUETTE-V2.html` — aperçu visuel statique de toutes les pages, ouvrable sans installation
- `CHANGELOG.md` — ce fichier

### Tests réalisés
Validation sur les vrais fichiers `Attributions.xlsm` et `BD_UE_COURS.xlsx` :
- 435 attributions importées sans perte (sauf 6 lignes sans UE valide en source)
- 514 lignes de planning hebdomadaire détectées
- Calculs vérifiés : Prof A 217h/217h placées, MAIGRE 72h/73h cibles
- Création test : 25 périodes → 21h → 37,5 coût dotation ✓

---

## v1.0 — 14 mai 2026

### Initiale
- Architecture Node.js/Express + better-sqlite3 + React/Vite/Tailwind
- Schéma SQLite 14 tables + 2 vues calculées
- Import automatique depuis Excel (Attributions.xlsm + BD_UE_COURS.xlsx)
- Pages : Login, Dashboard, Attributions (lecture + édition cellule), Professeurs, Pilotage
- Authentification JWT + 3 rôles (admin/editeur/consultation)
- Export Excel complet
- Conteneurisation Docker Compose (backend + frontend nginx)
- 435 attributions, 131 professeurs, 120 UE importées avec succès
