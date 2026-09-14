# CLAUDE.md — Lucie / Institut Ilya Prigogine

Contexte permanent pour toute session d'assistance travaillant sur **Lucie**,
l'application de gestion académique de l'Institut Ilya Prigogine (IIP).
À lire avant d'écrire une ligne de code ou de produire un document.

> **Pourquoi ce fichier est dans le dépôt et non ailleurs.** Ce contexte a
> longtemps vécu dans un compte d'assistant : il se perdait à chaque changement
> de compte, alors que le code, lui, ne risquait rien. Il vit désormais avec le
> code, versionné comme lui.

---

## 1. Qui est qui

| Rôle | Personne |
|---|---|
| Technicien / développeur | **Jérôme** (Directeur IT & Facilities EPFC, ingénieur civil, 25 ans en sécurité IT) |
| Analyste fonctionnel, décideur métier | **Charles Sohet**, directeur de l'IIP |
| Conseillère qualité | **Amélie Verkest** — également chargée du développement des compétences du personnel. Elle observe, rapporte, et donne l'image de ce qui est fait et de ce qui doit l'être : c'est elle que sert la démarche qualité |
| Utilisateurs | secrétariat (2 secrétaires + 1 adjoint), enseignants, direction |

**Langue de travail : le français.** Style direct, exécutif. Les documents
destinés à l'école expliquent **le travail, pas l'informatique**.

**Établissement :** IIP — N° ECOT 5222132070, FASE 292, Campus Erasme,
Route de Lennik 808, 1070 Anderlecht. Enseignement de promotion sociale (FWB).
Sections : TIM (la plus grande), Psychomotricité, AeSI (soins infirmiers,
ouverte en 2026-2027). ~588 étudiants.

---

## 2. Les règles de travail qui priment

1. **Ne jamais dire « c'est corrigé » sans vérification concrète.**
   Vérifier en base, contrôler la version affichée dans Lucie, et **faire
   confirmer à l'écran** avant d'affirmer quoi que ce soit.
2. **Lire le code, ne pas supposer la structure.** `grep` la définition
   (contrainte SQL, clé de map, nom de colonne) *avant* d'écrire la requête.
   C'est la source d'erreur n°1 historiquement.
3. **Ne rien trancher à sa place.** « À méditer » est une question ouverte, pas
   une commande. Poser la question bloquante (une minute) plutôt que coder trois
   heures sur une hypothèse.
4. **Chercher avant de construire.** Deux fonctions déjà écrites ont été
   redéveloppées en double faute d'avoir cherché au bon endroit : la
   restauration de sauvegarde (elle était dans `historique.js`, pas dans
   `sauvegardes.js`) et une seconde enveloppe de document. Avant d'écrire une
   fonctionnalité, chercher son nom **et ses synonymes** dans tout le dépôt.
5. **Ne jamais porter vers `main` ce qui est marqué « à venir ».**

### Le catalogue des erreurs déjà commises

- `ON CONFLICT(ue_num, cours_code, aa_code)` alors que la contrainte réelle est
  `(cours_code, aa_code)` → **tout l'import échouait silencieusement**.
- Codes d'acquis écrits `246.1` au lieu de `AA246.1` → colonnes vides.
- Notes écrites sous la clé `session|acquis` alors que le calcul cherche
  `cours|acquis` → « aucune note » sur des données pourtant présentes.
- `sticky` posé sans vérifier quel conteneur défile réellement → sans effet.
- Un `<style>` injecté **après `</html>`** (`due.js`) ou au milieu du corps
  (`diplomes.js`) → casse le saut de page.
- Une règle de mise en page laissée **à la charge de chaque écran** : sept
  écrans sans rail propre sont passés sous le rail. Une règle qui n'est juste
  que si l'on y pense est une règle fausse — **le défaut doit être correct**.
- Affirmer un détail visuel sans capture : un guide a annoncé un « liseré
  doré » pour les UE inscrites alors que c'est une **pastille ronde** (le cadre
  doré est réservé à l'épreuve intégrée).

### Ce qui est décidé dans le code et devrait se régler à l'écran

Deux réglages attendus se sont révélés **codés en dur**, donc invisibles et
indiscutables. Il en reste sans doute : les nommer plutôt que les découvrir.

- ~~La base de délibération de **seconde session**~~ — réglable depuis 1.27.0.
- Le **seuil de réussite de l'unité** (10/20) : c'est le décret, il ne doit
  **pas** devenir réglable.
- La règle de **report des notes** d'une session à l'autre : à vérifier.
- La cote montrée à un **ajourné dont la moyenne d'unité dépasse dix** : elle
  vaut aujourd'hui cette moyenne, alors que l'unité n'est pas acquise. À
  trancher avec Charles.

**Deux sources pour un même fait, c'est une source de moins.** L'épreuve
intégrée s'écrivait dans `ue.is_epreuve_integree` (case du référentiel) et se
lisait dans `ue_epreuve_integree` (table annuelle) : la case ne faisait rien,
en silence. Les deux s'écrivent et se lisent désormais ensemble — la ligne
annuelle l'emporte quand elle existe.

---

## 3. Environnement technique

**Stack** : Node/Express + `better-sqlite3` · React/Vite · Tailwind · Docker sur
NAS Synology.

| Environnement | Branche | Image | Port | Données |
|---|---|---|---|---|
| Production | `main` | `:latest` | 10800 | réelles |
| Développement | `develop` | `:dev` | 10801 | copie restaurée |

- Base : `/app/data/attributions.db` dans le conteneur. **SQLite3 n'est pas
  installé** → interroger via `node -e "const Database = require('better-sqlite3') …"`.
- La **base de dev est séparée** (volume `attributions-data-dev`) : aucun risque
  pour la production.
- Chaque poussée sur `develop` déclenche la construction des images `:dev`
  (GitHub Actions, `build-dev.yml`). Compter quelques minutes, puis un `pull`.
- **VERSION est à la racine** et alimente le badge de version de l'interface.
  Pousser VERSION et le code **dans un seul commit** : le tag est partagé, et
  « le dernier build qui finit gagne ».
- `git fetch origin 'main:refs/remotes/origin/main' --force` **avant** tout
  checkout — refs locaux périmés, vécu plus de cinq fois.
- Routes Express : les **spécifiques avant les paramétriques**.
- `git pull -X theirs` : **interdit**.
- **Ne jamais écrire un jeton en clair** dans un document, un commit ou une
  conversation. Un jeton l'a été ; il doit être révoqué.

### Restaurer des données réelles en dev

Configuration → Sauvegardes → *Télécharger* en **prod**, puis, sur **dev**
(10801), même écran, section rouge « Restauration de la base ». La route valide
le fichier, sauvegarde l'état courant sous `backups-auto/`, remet l'ancienne
base si la nouvelle s'avère illisible, et redémarre. **Elle refuse de
s'exécuter hors développement**, côté serveur.

### Sauvegarde avant tout merge vers `main`

```bash
cp /volume1/docker/attributions-app/backend/data/attributions.db \
   /volume1/docker/avant_merge_$(date +%Y%m%d).db
```

### Workflow de branches

`develop` (validation à l'écran par Jérôme) → **puis seulement** `main`.
Jamais de poussée directe en production. Les migrations sont additives et
protégées par contrôle d'existence, mais restent à surveiller.

---

## 4. Le modèle de calcul — dicté par le métier, à ne pas réinventer

Trois niveaux :

1. **Note par cours** — affichée, **indicative**. Moyenne des acquis pondérée
   par leur poids *dans ce cours* (les poids somment à 100 par cours).
2. **Note consolidée par acquis** — **calculée par le classeur Excel**
   (colonnes `/20`). C'est elle que l'import reprend, **c'est elle qui fait foi
   légalement**.
3. **Note d'unité** :

   ```
   Σ ( note_AA × poids_AA_dans_le_cours × poids_du_cours )
   ───────────────────────────────────────────────────────
   Σ ( 20      × poids_AA_dans_le_cours × poids_du_cours )
   ```

   **Un acquis non évalué sort du dénominateur** — il ne vaut pas zéro.

**Arrondi à l'unité.** 9,6 devient 10 et l'étudiant réussit. Seule la moyenne
générale de tout le parcours garde ses décimales.

**Bascule par millésime :** 2024-25 et 2025-26 → pondération **du classeur**
(`cours_ponderation`, `aa_ponderation`) ; à partir de 2026-27 → **périodes** du
dossier pédagogique, tables de pondération vides.

**Structure du classeur de suivi** (établie par lecture, pas supposée) :
feuille d'une UE — ligne 8 cours, ligne 10 poids du cours, ligne 11 poids de
l'acquis dans le cours, ligne 12 code de l'acquis ; colonnes 12→206 notes par
cours (non importées), colonnes 207+ notes consolidées `/20` (importées).
Onglet `Repartition_AA_UE` — ligne 4 n° d'UE, ligne 7 codes de cours, ligne 15
poids du cours, lignes 17+ poids des acquis.

---

## 5. Règles métier de la délibération

*(décret du 16/04/1991, RGE/ROI IIP, circulaire Sanction des études)*

- **Pas de compensation entre acquis.** L'attestation va à qui maîtrise **tous**
  les acquis (art. 77 §1, 78 §2). Un seul acquis en défaut → « ajourné » en 1ʳᵉ
  session, « refusé » en 2ᵈᵉ (art. 69 §2). La note d'unité ne rattrape rien.
- **En seconde session, « ajourné » n'existe pas** : il n'y a rien après. Aucun
  bouton d'ajournement ni de « à représenter » ne doit y apparaître.
- **La faveur est un octroi**, le seul levier du Conseil : elle porte l'unité
  **exactement au seuil** et laisse trace. Sur les documents de l'étudiant, une
  unité octroyée vaut **10 partout** — chaque acquis, chaque cours, l'unité —
  sans quoi le document se contredit lui-même. Couleur : **violet**, icône
  cadeau (l'orange sert aux cotes tout justes).
- **Jamais de cote sous 10 sur un document remis à l'étudiant** : c'est « NA »
  (circulaire Sanction des études). La grille de délibération, elle, est un
  document du Conseil et garde les cotes de travail.
- **Quorum des deux tiers** sur les voix délibératives, opposé **à la clôture**
  (art. 25 §1). Distinguer « quorum manquant » de « appel des présences jamais
  fait ».
- **Toute décision défavorable est motivée**, acquis par acquis (RDE art. 88 §3).
  Lucie propose un énoncé quand la case reste vide — l'annexe ne part jamais
  avec un blanc — mais **ne l'écrit pas** : la proposition se calcule à la
  lecture, et la clôture demande **une seule fois** de confirmer celles restées
  telles quelles. Confirmées, elles s'enregistrent avec `source = 'propose'` :
  un an plus tard, ce que le Conseil a rédigé se distingue encore de ce qui a
  été accepté en bloc.
- **Réouverture d'une séance close** : réservée à la direction, **motif écrit
  obligatoire**, conservé au dossier.
- **Une motivation inventée se défend plus mal qu'un motif absent.**
- Une reprise d'historique ne doit **jamais** pouvoir se faire passer pour une
  délibération tenue.

**Chantiers de conformité ouverts, dans l'ordre :** geler les décisions à la
clôture et historiser par ajout ; figer et horodater le PV ; bloc de signatures
nominatif ; date d'affichage et mode de publication en champs propres ; écrire
`'valorise'` dans le parcours ; raccorder la mention au PV.

---

## 5 bis. La démarche qualité — AEQES

L'IIP relève de l'**AEQES** (enseignement supérieur). Psychomotricité a été
évaluée ; une **évaluation institutionnelle** vient en **2028-2029**.

- Cinq critères, dont l'**amélioration continue**, traités en *description →
  évaluation → action*.
- Un **dossier d'auto-évaluation** (19-20 000 mots hors annexes) dont la pièce
  maîtresse est un **plan d'action priorisé assorti d'indicateurs**, couvrant
  deux ans au minimum (action, responsable, priorité, échéance, indicateur).
- Le dossier demande les **inscrits par section sur cinq ans**, les ETP par
  catégorie, et une **vingtaine d'annexes**.
- L'**évaluation continue** ne réévalue pas le programme : elle vérifie
  **l'état de réalisation du plan d'action**.
- Après visite : rapport, droit de réponse de trois semaines, **plan publié sur
  le site de l'école** dans les six mois, point d'étape à mi-parcours.

**Conséquence : la pièce centrale est l'ACTION**, pas la réunion. Réunions,
retours d'étudiants et constats chiffrés en sont les *sources* ; le dossier et
le plan publié, les *sorties*. **Une action est une échéance** : l'échéancier
porte déjà responsable, rappels, base légale et une catégorie `qualite` — un
seul registre, deux lentilles (l'Accueil montre *les miennes*, la Qualité
*celles de la démarche*).

**Ce qui n'est pas rattrapable :** ce qui n'est pas consigné en 2026-2027 ne
sera pas récupérable en 2028. Détail dans `docs/contexte/qualite-aeqes.html`.

---

## 6. Design — la façon de faire

### Documents

L'audit (`docs/contexte/audit-documents-impression.md`) a relevé **9 enveloppes
concurrentes, 4 techniques de pied de page contradictoires, 7 façons d'imprimer
et 3 composants de tuile**. La stratégie tient en cinq chantiers, dans cet ordre :

1. **Une seule enveloppe**, celle de `lib/document.js`, paramétrable par famille.
   **On n'en recrée pas une dixième.**
2. **Un seul pied de page**, une seule technique, une seule marge basse quel que
   soit le chemin emprunté.
3. **Le catalogue est la seule porte** (`lib/documents.js`) : toute pièce s'y
   déclare — portée, paramètres, rôles, route —, y compris la portée
   `'etablissement'`, qui est celle de Pilotage.
4. **Un seul centre d'impression**, alimenté par le catalogue et filtré par la
   portée de l'écran. Deux sorties seulement : **PDF serveur** si le serveur
   peut, **impression navigateur** sinon — le même repli partout.
5. **Toute pièce laisse une trace** via `archiverDocument()`.

### Standard de mise en page

- A4 portrait ; marges **18 mm** haut et côtés.
- Bande de pied **24 mm**, texte à **−16 mm**, pied `position:fixed` descendant
  dans la marge.
- Corps **9-10 pt** — **jamais en pixels**.
- Marine `#1B2B4B` · filet doré `#C9A84C` 0,3 mm.
  ⚠️ Dans `tailwind.config.js`, `iip-gold` vaut `#1B2B4B` : **le nom ment**.
- Cadre de titre : 0,4 mm marine, rayon 1,5 mm.
- Ordre d'en-tête : bandeau CF entre deux filets → identité de l'établissement →
  cadre de titre portant **section, nature de la pièce, unité**.
- **Réserve :** le **diplôme** (paysage, sans marge ni pied) et le **corps de
  courriel** restent hors standard. L'unité vaut pour les pièces administratives.

### Tuiles d'indicateur

- Fond **blanc**, **filet gauche 3 px** teinté selon l'état. Pas de fond coloré,
  pas d'ombre, pas de dégradé.
- Trois tons **désaturés** seulement (vert, ocre, brique) ; neutre par défaut —
  si tout est coloré, plus rien ne signale.
- **Chiffre d'abord, libellé dessous.**
- Icône en aplat, **grise** — jamais dans la couleur d'état.

### Navigation

- **Seul le menu principal est horizontal** : il dit dans quel métier on est.
  Tout le reste vit dans le **rail latéral** — les rubriques de l'axe d'abord,
  puis les outils de l'écran ouvert, qui s'y inscrivent d'eux-mêmes.
- **Le rail est un panneau posé sur la page**, non une colonne collée au bord :
  détaché de 12 px, coins arrondis, **haut de ce qu'il contient**, translucide,
  porté par une ombre douce, et **en `position: fixed`** — en `absolute` il se
  centrait sur la hauteur du CONTENU et son pied passait sous la fenêtre.
- **Il reste étroit** : pas d'élargissement au survol, le libellé dans une
  bulle. Une icône se mérite — ce qui ne tient pas dans une colonne d'icônes va
  dans une fenêtre, pas dans le menu.
- **Deux modes pour les menus**, un seul jeu de jetons (`--menu-*` dans
  `index.css`, mode écrit sur `data-mode` par `lib/theme.js`) : **clair**, gris
  pâle tenu par un filet, et **sombre**, marine. Un composant ne connaît jamais
  le mode — il lit ses jetons. La bascule est en pied de rail.
- **La couleur est une dépense** : dans les menus elle ne sert qu'à ce qui doit
  être vu — la rubrique ouverte, une alerte. Une icône sans rien à signaler
  reste grise, et l'accent va sur l'icône, non sur toute la pastille.
- **La barre du haut reste entière**, d'un bord à l'autre : deux panneaux
  détachés sur un écran, c'est un de trop — il faut un point fixe. Elle suit en
  revanche le mode.
- **Une seule échelle, et rien en dehors** (`tailwind.config.js`) : rayons
  `champ` 8 / `carte` 14 / `fenetre` 22 / `panneau` 26 ; ombres `pose`,
  `flottant`, `dessus` ; courbe `ease-ios`. Un seul voile de fenêtre : marine
  translucide, flou léger.
  **Les rayons de Tailwind sont ramenés sur l'échelle** : `rounded`, `-sm`,
  `-md`, `-lg` valent 8 ; `-xl` et `-2xl` valent 14. L'échelle existait et
  servait soixante et une fois pendant que deux mille trois cents classes
  employaient huit valeurs au hasard — des boutons pointus à côté de boutons
  ronds. On ne réécrit pas deux mille trois cents classes : **on redéfinit le
  défaut**, et tout y tombe, aujourd'hui comme demain.
- **Une seule hauteur de contrôle** (`.controle`, 36 px, dans `index.css`).
  Une liste déroulante porte les métriques natives du navigateur, un bouton
  celles qu'on lui a écrites : côte à côte, ils ne font pas la même hauteur et
  leurs lignes de base ne se répondent pas. Le rayon se règle en redéfinissant
  le défaut de Tailwind ; la hauteur ne le peut pas — un bouton dans une
  cellule de tableau n'a rien à faire à 36 px. C'est donc une **classe**, à
  poser sur les contrôles d'une barre d'outils. `.controle-fort` pour le
  principal, et il n'y en a qu'un.
- **Deux formes d'onglet, et une règle qui dit laquelle.** La **pastille**
  (fond clair, coins arrondis) dit *où l'on est* — barre du haut, rail : on
  change de territoire. Le **soulignement** (`.onglet-page` /
  `.onglet-page-actif`) dit *quelle face du même objet* on regarde — les
  onglets d'une fiche, d'une fenêtre, d'un écran : on tourne une page. Le
  désordre ne venait pas d'avoir deux formes, mais de n'avoir aucune règle :
  douze barres d'onglets, cinq couleurs de soulignement, quatre hauteurs.
- **Une seule fenêtre** (`Fenetre`, `GroupeFenetre`, `PieceFenetre`,
  `BoutonFenetre` dans `ui.jsx`). Soixante et onze fichiers posaient leur
  propre `fixed inset-0`. Le voile est une **couche à part** : porté par le
  conteneur, son flou fait de lui le cadre de référence de tout `fixed` rendu
  dedans — une fenêtre ouverte depuis une fenêtre s'y retrouve enfermée.
- **On ne compte pas les pixels, on les mesure.** La hauteur de la barre du
  haut était écrite « 64 px » à la main ; elle ne les fait pas toujours, et le
  rail passait dessous. La barre publie sa hauteur (`--barre-h`), le rail la
  lit. Même principe pour `--rail-largeur`, que le filet du haut consomme.
- **Une entrée de rail sans icône est invisible** une fois le rail replié.
- **Un titre ne s'écrit qu'une fois** par écran.
- Un libellé ne promet que ce que la modale fait réellement.
- Une réorganisation d'onglets change les habitudes du secrétariat du jour au
  lendemain : **risque humain, pas technique** — à annoncer, pas à livrer en
  silence.

### Écritures et garde-fous

- **Rien ne s'écrit sans qu'on ait vu ce qui sera écrit** : tout import et tout
  traitement en lot passe par une simulation.
- **Un bouton caché n'est pas une protection** : une opération réservée au
  développement se refuse **côté serveur**.
- Une opération irréversible se nomme, se motive et laisse une trace.

---

## 7. Documentation destinée à l'école

- Public : secrétaires et enseignants. **Expliquer le travail, pas l'informatique.**
- Toujours préciser **quelle version** est décrite (dev ou prod) — un guide écrit
  sur dev montre des écrans que l'équipe n'a pas.
- Les captures d'écran viennent de Jérôme. **Ne pas décrire un détail visuel
  sans capture.**

---

## 8. Réflexe de démarrage de session

1. Lire ce fichier.
2. Vérifier l'écart `develop` / `main` et les questions ouvertes non tranchées
   (`docs/contexte/`).
3. Poser d'abord les questions **bloquantes** — celles qui coûtent une minute à
   Jérôme et évitent une demi-journée de code faux.
4. `grep` les définitions avant toute requête ; chercher l'existant avant de
   construire.
5. Ne conclure « fait » qu'après vérification **et** confirmation à l'écran.
