# Inventaire du design de Lucie — vers des réglages par école

10 octobre 2026. Demande de Charles : « répertorie tous les modules ou icônes (tuiles, wagons…) dans la
configuration, partie design ; je veux que tout soit standard ; et pouvoir, comme dans l'atelier, changer
les designs — l'idée est de rendre Lucie paramétrable pour chaque école ».

Inventaire fait en lecture seule. Rien n'est encore branché.

## Ce qui se règle aujourd'hui

- **Les couleurs seulement** : 22 clés `--c-*` et le jeu de gris.
  - Serveur : `backend/src/lib/couleurs.js` (`COULEURS_DEFAUT`, clé `lucie_config` `'couleurs'`).
  - Routes `GET` et `PUT /api/config/couleurs` (geste `configuration.couleurs`).
  - Écran : `frontend/src/lib/couleurs.js` (`poser()`, échelles `--e-*`).
  - Réglage dans Configuration → Thèmes et couleurs (`ReglageCouleurs`, `Configuration.jsx` vers la ligne 2164).
- **Tout le reste est écrit en dur**, à trois endroits :
  - `frontend/src/index.css` ;
  - `frontend/tailwind.config.js` (rayons 8, 14, 22 et 26 ; ombres `pose`, `flottant`, `dessus` ; tailles 11, 13, 15, 17… ; police Inter) ;
  - `components/ui.jsx`.

## Les composants standard (`ui.jsx`, `index.css`)

| Élément | Où | Forme en dur | Usages |
|---|---|---|---|
| Tuile (`TuileEtat`) | `ui.jsx` (932), `.bloc-etat` | liseré 4 px, rayon 0 10 10 0, contour 1 px, chiffre 17 px | 46 |
| Encadré (`Encadre`) | `ui.jsx` (954) | même forme que la tuile | 32 |
| Pastille d'état (`PastilleEtat`, `.pastille-etat`) | `ui.jsx` (969) | rayon 4, 10 px, pleine, texte blanc | 16 + 8 |
| Bouton (`.bouton`, `-fort`, `-sortir`, `-detruire`, `-compact`, `-icone`) | `index.css` (914-939) | 36 px, rayon 8, graisse 600 | ~718 |
| Contrôle (`.controle`, `-icone`, `-fort`), `select` | `index.css` (816-891) | 36 px, rayon 8 | ~415 |
| Segments (`.segments`) | `index.css` (644) | 36 px, bord #cbd5e1 en dur ; l'aplat actif est posé écran par écran | 54 |
| Carte (`.carte`, `.carte-plate`) | `index.css` (1019) | rayon 14, filet, pas d'ombre | ~186 |
| Tableaux (`.tab-entete`, `.tab-repere`, `Tableau`/`Th`/`Td`…) | `index.css`, `ui.jsx` (814-887) | en-tête 11 px majuscules | ~103 / ~240 |
| Onglets (`.onglet-page`, `.onglet-actif`) | `index.css` (600, 788) | trait 2 px, 13,5 px | 14 + 4 |
| Fenêtre (`Fenetre`, `GroupeFenetre`, `PieceFenetre`, `BoutonFenetre`) | `ui.jsx` (1083-1287) | voile rgba(11,21,45,.32) avec flou de 3 px, ancrage 6vh, max 88vh, bandeau principal plein | 155 |
| Bulle d'aide (`BulleAide`) | `ui.jsx` (1032) | panneau `.carte` de 26rem | 5 |
| Rail (`RailLateral`, `RailDessine`) | `ui.jsx` (195-344), `lib/railEpingle.js` | 3.5rem / 14.5rem | 12 |
| Badges (`.badge-*`, `Badge`) | `index.css` (264), `ui.jsx` (907) | rayon 6, fonds pâles en dur | ~49 + 11 |
| Gélule, puce d'UE | `index.css` (1123, 1146) | liseré 2,5 / 3 px | 3 |
| Agenda de la semaine (`AgendaSemaine`) | `components/AgendaSemaine.jsx` | nouveau, 3.1.243 | 3 |

## L'atelier des pièces (`lib/atelier.js`)

- **Palette** : en-tête, titre, texte, tuile, rangée, petit train (wagons), encadré, tableau, logo, signature, signature de la direction, filet, pied.
- **Forme par défaut** : `FORME = { rayon: 10, coins, bande: 4, pos: 'gauche' }`.
- **Réglages par bloc** : couleur d'état, couleur par wagon, largeur, hauteur, coins, rayon (0 à 28), bande (position et épaisseur 1 à 14), style de tableau, taille et couleur du texte.
- **Les couleurs de l'atelier (`ETATS`) sont celles de « Lucie d'origine », en dur**. Elles ne suivent pas Thèmes et couleurs.
- **Stockage** : par modèle (`document_template.contenu`). Il n'existe aucun défaut d'atelier global ni par école.

## Doublons à résorber avant de brancher des réglages

| Doublon | Fichiers | Remplacer par |
|---|---|---|
| `KpiCard` ; `Kpi` (Dashboard, Pilotage) ; `Tuile` (`statsUi`, PonderationsUE) ; `TuileSomme`, `TuileUE` (FeuilleDeliberation) | ~10 composants | `TuileEtat` |
| `Btn` (23), `BoutonFenetre` (15), `bg-iip-blue` / `bg-iip-gold` pleins (~154) | — | `.bouton*` |
| `Tabs`, `border-b-2` faits main (~17) | — | `.onglet-page` |
| Pastilles maison (~26 en ligne, ~15 composants) | — | `PastilleEtat` |
| `border-l-4` sur fond pâle (~201) | — | `Encadre` |
| Voiles et fenêtres hors `Fenetre` | 21 occurrences, 12 fichiers | `Fenetre` |

- Rayons hors échelle : 4, 6, 7 et 10.
- Une copie de `.segments` traîne dans `@media (prefers-reduced-motion)` (`index.css` 692-748).
- ~1 066 couleurs hexadécimales en dur dans les `.jsx`.
- Code mort : `.hover-darken`, `.nav-underline`, `.entete-panneau`, `Mention`, `TrGroupe`, `TrTotal`.

## Proposition : « Formes et composants », à côté de « Thèmes et couleurs »

Même mécanisme que les couleurs :
- clé `lucie_config` `'design'`, catalogue `DESIGN_DEFAUT` (`backend/src/lib/design.js`) ;
- routes `GET` et `PUT /api/config/design` (geste `configuration.design`) ;
- `poser()` écrit des `--d-*` ; Tailwind et `index.css` lisent `var(--d-…, repli)` — aucune classe n'est réécrite.

Thèmes possibles : Maison IIP, Arrondi, Anguleux, Compact. L'aperçu se fait avec les vrais composants.

| Groupe | Réglages |
|---|---|
| **Rayons** | champ 8, carte 14, fenêtre 22, panneau 26, tuile 10, pastille 4 |
| **Tuile et encadré** | épaisseur du liseré (4), coins côté liseré, fond (blanc ou pâle), contour, taille du chiffre (17) |
| **Pastilles** | style (pleine, contour ou pâle), corps (10) |
| **Boutons et contrôles** | hauteur (36), hauteur compacte (32), graisse, marge intérieure, style du bouton « sortir », aplat du segment actif |
| **Onglets et tableaux** | trait (2), corps (13,5), casse de l'en-tête, lignes alternées |
| **Fenêtres** | opacité et flou du voile, bandeau (plein ou blanc), ancrage, hauteur maximale |
| **Élévations** | ombres posée, flottante et du dessus ; ombre des cartes |
| **Navigation** | largeur du rail (replié, ouvert), rail détaché, mode des menus par défaut, marge de page |
| **Typographie** (en option) | police, corps, titre d'écran |
| **Pièces (atelier, papier)** | liseré 1 mm, rayon 2,6 mm, couleurs de l'atelier lues du réglage, filet doré |

> **À trancher avec Charles :** CLAUDE.md dit « On ne touche ni aux polices, ni aux icônes, ni aux tailles »
> (chantier des couleurs). La typographie reste donc en option tant que cette règle n'est pas levée.

**Ordre conseillé :**
1. Ramener les rayons hors échelle sur des jetons.
2. Faire porter l'aplat actif par `.segments`.
3. Migrer les doublons les plus utilisés : `KpiCard`, `Btn`, `Tabs`, `Badge`, `BoutonFenetre`, `Tuile` de `statsUi`.
4. Factoriser le voile.
5. Seulement ensuite, brancher les réglages.

## Les zones de l'écran et leur réglage (3.1.250)

Toutes se règlent dans Configuration → Thèmes et couleurs. Sans réglage, une zone **suit** celle qu'on indique : par défaut, l'écran ne change pas.

| Groupe | Zone | Variable | Par défaut | Qui la lit |
|---|---|---|---|---|
| Fonds | Fond de la page | `--c-fond_page` | #FFFFFF | `body`, `--page-fond` |
| Fonds | Pas encore atteignable | `--c-fond_indispo` | #F4F5F7 | `.bloc-etat[indisponible]`, frises |
| Surfaces | Rail et barre du haut | `--c-fond_menus` | suit le fond de la page | `--menu-fond`, `--barre-fond` |
| Surfaces | Cartes, listes, panneaux | `--c-fond_carte` | suit le fond de la page | `--tab-repere` (`.carte`) |
| Surfaces | En-têtes de tableau, regroupements | `--c-fond_entete` | suit les cartes | `.tab-entete`, `.tab-repere` |
| Surfaces | Lignes de tableau | `--c-fond_ligne` | #FFFFFF | `Tableau`, `.grid-excel-soft` |
| Surfaces | Survol | `--c-fond_survol` | suit le texte à 6 % | `--menu-survol`, lignes de grille |
| Surfaces | Tuiles et encadrés | `--c-fond_tuile` | #FFFFFF | `.bloc-etat` (TuileEtat, Encadre) |
| Surfaces | Champs et boutons neutres | `--c-fond_champ` | #FFFFFF | `--champ-fond`, `.segments` |
| Surfaces | Filets et contours | `--c-filet` | suit le texte à 10 % | `--menu-bord`, contours des tuiles, tableaux, pied des fenêtres |
| Surfaces | Sous-menu déplié du rail | `--c-sous_menu` | #3E7FB8 | `--menu-sous` (filets dérivés) |
| Composants | Fenêtre — bandeau | `--c-fenetre_bandeau` | suit le principal | `Fenetre` |
| Composants | Fenêtre — texte du bandeau | `--c-fenetre_titre` | #FFFFFF | `Fenetre` |
| Composants | Fenêtre — corps | `--c-fenetre_corps` | #FFFFFF | `Fenetre` |
| Composants | Fenêtre — pied | `--c-fenetre_pied` | suit le corps | `Fenetre` (barre des boutons) |
| Composants | Bouton principal | `--c-bouton_fort` | suit le principal | `.bouton-fort` |
| Composants | Bouton « produire une pièce » | `--c-bouton_sortir` | suit le principal | `.bouton-sortir` |
| Composants | Bouton « détruire » | `--c-bouton_detruire` | suit « à corriger » | `.bouton-detruire` |
| Composants | Segment choisi | `--c-segment_actif` | suit le principal | `.segments > .bg-iip-blue` |

Les formes (rayons, hauteurs, liseré, ombres, voile, police, texte) se règlent dans Configuration → Formes et composants.
