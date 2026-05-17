# Changelog

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
