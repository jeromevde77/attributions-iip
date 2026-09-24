# Lucie — dossier de passation

**Date :** 24 septembre 2026
**Interlocuteur :** Jérôme, Institut Ilya Prigogine

> Note de reprise, écrite au moment d'un **changement de compte d'assistant**.
> Tout le code est dans ce dépôt ; ce qui se serait perdu avec la
> conversation, c'est le **contexte** : ce qui a été livré et pourquoi, les
> questions ouvertes (§3), la manière de travailler (§4) et les pièges (§5).
> À lire après `CLAUDE.md`, avant toute nouvelle demande.

---

## 1. Où en sont les branches

| Branche | Commit | Version |
|---|---|---|
| `develop` | `e404cb2a` | 2.12.172 |
| `main` (prod) | `9f64b31c` | 2.12.172 — même arbre que `develop` |

**Aucun écart** entre dev et prod au 24 septembre au soir. Dernier build
`main` : vert.

### Mise en production — la routine suivie

1. Commit sur `develop` (message en français, version entre parenthèses), `VERSION` incrémenté.
2. `git push origin develop` (réessayer : GitHub renvoie parfois des 500).
3. Porter l'arbre exact vers `main` par un commit « squash » :
   ```bash
   git fetch origin main
   T=$(git rev-parse HEAD^{tree})
   C=$(git commit-tree $T -p refs/remotes/origin/main -m "Lucie X.Y.Z — mise en production (…)")
   git push origin $C:main
   ```
4. **Attendre le build vert** avant de dire à Jérôme de mettre à jour
   (≈ 1 min 30) — sinon `maj-prod` tire l'image précédente et le badge affiche
   « v2.12.168 ≠ 2.12.169 ». Vérifiable par l'API publique des Actions
   (`/repos/jeromevde77/attributions-iip/actions/runs?branch=main`).
5. Côté serveur, Jérôme : `sudo /usr/local/sbin/lucie-ops maj-prod`, puis
   Ctrl+Maj+R.

---

## 2. Ce qui a été livré depuis la passation du 4 septembre

Les grandes lignes (le détail, commit par commit, est en annexe) :

- **Rôles et permissions** : rôles paramétrables par écran/section, professeurs
  limités à leurs groupes et attributions ; contrôle strict des modules.
- **Mes cours** (professeurs) : leurs groupes, leurs listes, **notes proposées**
  par acquis — reprises par la coordination. Densifié le 24/09 (pleine largeur).
- **Délibération** : filtre par groupe, classeur des professeurs (export/import),
  épreuve intégrée (pondération des AA de l'UE, `cours_code = '__ue__'`),
  ligne de plan simplifiée (« Délibérer · Notes ▾ · Documents »).
- **Acquis (AA)** : renommer, renuméroter, supprimer (avec inventaire), et le
  renommage atteint les codes composites des notes (`FIN_AA`).
- **Étudiants** : statut (diplômé, sorti, archivé) en lot, segments, doublons
  et fusion, suppression ; **dossier de suivi confidentiel** (notes, rapports,
  pièces) réservé à ses enseignants, à la coordination de sa section et à la
  direction.
- **Groupes** : ce sont les **activités** (théorie, labo, stage…) qui se coupent
  en groupes (`etudiant_cours_groupe` clé : étudiant × année × cours ×
  activité). **Import d'un classeur de groupes** dans Répartition des étudiants
  (Groupe 1, 2, 3 ↔ attributions A, B, C, par rang).
- **PAE** : l'admissibilité à la promotion ne tient plus compte des unités
  étrangères à la section (cas Akabi : RESTART UE 95, stage opticien UE 185) ;
  **fenêtre « Valider les PAE »** par section (Étudiants → Fin de cycle), avec
  alertes « inscrit sans prérequis » ; `scripts/diag-pae.js` (lecture seule) :
  `docker exec attributions-backend node scripts/diag-pae.js AKABI 2026-2027`.
- **Réunions** : Conseil d'administration, notes et points confidentiels, PV
  intégral ; le 24/09 : **présents dans la liste**, écran de séance et PV
  simplifiés ; **rapport d'activité du mois** (tout Lucie), sur demande
  (Suivi d'équipe → Rapport du mois) et **envoyé en PDF à la direction la
  première semaine du mois** si un expéditeur est configuré
  (table `rapport_mensuel_envoi`).
- **Envoi par courriel** de tout document édité ; notifications d'accueil ;
  DUE paramétrable ; rapport ETP corrigé (organisations 2, `type_cours` NULL).

---

## 3. Questions ouvertes au 24 septembre

1. **« Il manque le nom de l'activité »** — l'écran n'a pas été identifié :
   partout où les groupes s'affichent, l'activité est présente sur les données
   de test. **Demander une capture** avant de toucher quoi que ce soit.
2. **Groupes 250 / 255 (TIM B2, 8 groupes)** : l'import est prêt, mais les
   attributions de 250.1 et 255.1 doivent porter **une ligne par groupe (A à H)**
   dans l'activité labo, sinon l'aperçu signale les groupes absents. L'import
   en production reste à faire par Jérôme.
3. **Promotion TIM 2025-2026 → 2026-2027** à relancer depuis 2.12.168 (les
   Akabi et les passés par RESTART deviennent « prêts »), puis **valider les
   PAE** dans la nouvelle fenêtre.
4. **Inscriptions suspectes** : les deux Akabi portent en 2025-2026 des
   inscriptions aux UE 95 (RESTART) et 185 (stage opticien) sans décision —
   probablement un héritage d'import. Elles ne bloquent plus ; **nettoyage à
   décider par Jérôme** (proposé pour toute la section).
5. **UE 264** : vérifier que les notes n'ont pas été détachées par le
   renommage de 2.12.161 (corrigé en 2.12.163 par la correspondance `FIN_AA`).
6. **Fusion d'acquis** : proposée, jamais demandée explicitement.
7. **« Voir comme » Loubna** : diagnostic SQL demandé, sorties jamais reçues.
8. **Rapport mensuel** : premier envoi attendu début octobre — vérifier qu'il
   est parti (`SELECT * FROM rapport_mensuel_envoi`).
9. **Densité** : principe posé par Jérôme (« optimiser sur l'espace, valable
   partout ») ; appliquer à chaque écran touché, et resserrer ceux qu'il
   signale par capture.

---

## 4. Travailler et tester

- **Base de test** : `backend/data/attributions.db` (données fictives,
  ancienne ; une migration `professeur.type_personnel` y échoue au démarrage —
  sans conséquence). La sauvegarder avant d'y semer des données, la restaurer
  après.
- **Serveur** : `PORT=4650 MFA_KEY=<32 octets hex> node src/server.js` ;
  frontend `VITE_API_URL=http://localhost:4650 npx vite --port 5173`.
- **Jetons de test** : JWT signé avec le secret de développement du dépôt ;
  en-tête `X-Annee: 2026-2027` pour les appels directs.
- **Captures** : `playwright-core` avec `executablePath: '/opt/pw-browsers/chromium'`.
  Le rail replié cache ses libellés : cliquer par `aria-label`/`title`.
  Viser `>> visible=true` (éléments dupliqués cachés).
- **Arrêter un serveur** : `pkill -f "^node src/server.js"` — sans l'ancre `^`,
  le motif tue aussi le shell qui lance la commande.
- **Branches distantes** : la référence locale `origin/develop` peut rester
  périmée ; faire foi avec `git ls-remote origin`.
- **Courriel** : un faux serveur SMTP local (sécurité `aucun`) suffit à éprouver
  un envoi réel de bout en bout.

---

## 5. Pièges appris pendant cette période

- Vocabulaire des résultats : `reussi`, `ajourne`, `refuse` (pas `reussite`).
- Code d'acquis dans les notes : composite (`AA`, `cours|AA`, `s1|cours|AA`,
  `s2|AA`) — le code est **le dernier segment**.
- Épreuve intégrée : pondérations dans `aa_ponderation` avec
  `cours_code = '__ue__'` ; ne jamais afficher ce code à l'écran.
- Les groupes des attributions TIM sont en **lettres** (A, B, C…), les
  classeurs de Jérôme en **chiffres** (Groupe 1, 2…).
- L'IIP relève de l'**enseignement pour adultes**, pas de la « promotion
  sociale ». Police : Aptos ou Arial. Couleurs : celles du logo de Lucie.
- Avant de refaire une fonction « manquante », la chercher : l'export Excel du
  classeur des professeurs existait déjà (2.12.159 l'avait doublé, retiré en
  2.12.160).

---

## Annexe — les livraisons, commit par commit

- 2026-09-20 — « Reporting » non plus ne se voyait nulle part (2.12.80)
- 2026-09-20 — Le contrôle des modules passe en strict, sur dev et sur dev seul (2.12.81)
- 2026-09-20 — On règle sur la fiche, on regarde en configuration (2.12.82)
- 2026-09-20 — Un compte désactivé sortait de l'écran, et du même coup de portée (2.12.83)
- 2026-09-20 — Le bouton disait « Réactiver » et désactivait (2.12.84)
- 2026-09-20 — Le mot de passe se change soi-même, et la porte cesse d'être ouverte (2.12.85)
- 2026-09-20 — Le bouton « MDP » ne faisait rien, et ce qu'il faisait était pire (2.12.86)
- 2026-09-20 — Le blocage des connexions se règle à l'écran (2.12.87)
- 2026-09-20 — Un oui/non se coche, il ne se tape pas (2.12.88)
- 2026-09-20 — Qui a fait quoi, et ce que les registres gardent (2.12.89)
- 2026-09-21 — Les textes à confirmer se voient à l'Accueil (2.12.90)
- 2026-09-21 — Le texte vit dans Lucie, le fichier n'est qu'une porte d'entrée (2.12.91)
- 2026-09-21 — La recherche ouvrait sa liste et cachait ce qu'elle avait trouvé (2.12.92)
- 2026-09-21 — Décider par étudiant, et une séance est une section et une date (2.12.93)
- 2026-09-21 — Une coordination ne voyait aucun de ses étudiants (2.12.94)
- 2026-09-21 — Les destinataires d'un texte se corrigent après publication (2.12.95)
- 2026-09-21 — La barre de l'éditeur prend la hauteur de ce qu'elle porte (2.12.96)
- 2026-09-21 — Une adresse sans https:// n'empêche plus de publier (2.12.97)
- 2026-09-21 — Un étudiant importé sans inscription restait invisible (2.12.98)
- 2026-09-21 — Créer des étudiants sur base d'une base de données externe (2.12.99)
- 2026-09-21 — Les signataires du diplôme se règlent par section (2.12.100)
- 2026-09-21 — La section se choisit par étudiant à l'import (2.12.101)
- 2026-09-21 — Placer les étudiants dans leur section d'après le rapport Pack UF (2.12.102)
- 2026-09-21 — La liste montre la section de l'étudiant, non celles de ses UE (2.12.103)
- 2026-09-21 — Filtrer la liste des étudiants : section, niveau, UE, rattachement (2.12.104)
- 2026-09-21 — Changer le numéro d'une UE change ses cours et ses acquis, partout (2.12.105)
- 2026-09-21 — Composer les PAE : une grille pour voir, revoir et changer (2.12.106)
- 2026-09-21 — L'année se choisit dans une liste, elle ne se tape plus (2.12.107)
- 2026-09-21 — Le diplôme porte le logo de l'IIP, celui de la HELB se règle par section (2.12.108)
- 2026-09-21 — Configuration : six familles dans le rail, le détail en feuilles (2.12.109)
- 2026-09-21 — Suivi d'équipe : confier, tenir au courant, filtrer et ranger ; le chargé de cours se choisit (2.12.110)
- 2026-09-21 — Une année sans inscription n'est pas un étudiant sans section (2.12.111)
- 2026-09-21 — Composer les PAE suivants : un étudiant ne reçoit que le programme de SA section (2.12.112)
- 2026-09-21 — Un second compte sur le VPS, limité à cinq gestes : lucie-ops
- 2026-09-21 — CLAUDE.md : les trois comptes du VPS
- 2026-09-21 — docker-compose.vps.yml : la production est en PERMISSIONS_MODE strict, la copie de référence le dit
- 2026-09-22 — Séance de valorisation, recours, fraude et disciplinaire : ceux qui instruisent, dans leurs sections ; effacer reste à la direction (2.12.113)
- 2026-09-22 — lucie-ops : lire l'identifiant du registre de debian, sans quoi maj-dev et maj-prod sont refusés
- 2026-09-22 — Chiffres de l'école : la population réelle — programmes confirmés par section, par niveau, et par UE face au prévu (2.12.114)
- 2026-09-22 — Contrat de travail : la génération échouait sur « near COALESCE : syntax error » — virgule manquante dans la requête des attributions, après la sous-requête titulaire_en_conge (2.12.115)
- 2026-09-22 — Coordonnées d'une sélection : la liste imprimable des étudiants ou des membres du personnel cochés — emails, GSM, adresse (2.12.116)
- 2026-09-22 — Import des dossiers pédagogiques : rattacher un dossier non reconnu à une UE existante (2.12.117)
- 2026-09-23 — Valorisations : le périmètre de section s'applique à toutes les portes (2.12.118)
- 2026-09-23 — L'année en cours est l'année de travail par défaut, toujours (2.12.119)
- 2026-09-23 — Délibérer par organisation : la répartition des inscrits et la feuille filtrée (2.12.120)
- 2026-09-23 — Import DP : le rattachement manuel s'offre aussi sur un dossier reconnu (2.12.121)
- 2026-09-23 — La séance de délibération par organisation : présences, quorum, clôture et PV distincts (2.12.122)
- 2026-09-23 — Import DP : la feuille de correspondance des cours — rattacher au lieu de doubler (2.12.123)
- 2026-09-23 — Année de travail : une fenêtre rouverte revient dans l'année en cours, vraiment (2.12.124)
- 2026-09-23 — La répartition dans les organisations se trouve depuis le plan de délibération (2.12.125)
- 2026-09-23 — Projet visuel : l'onglet « Répartition des étudiants » de l'axe Organisation
- 2026-09-23 — Organisation → Répartition des étudiants : le croisement attributions × PAE (2.12.126)
- 2026-09-23 — Composer les PAE : l'historique s'encode dans la grille, par année (2.12.127)
- 2026-09-23 — Accès : les droits du jour, pas ceux du jeton (2.12.128)
- 2026-09-23 — Le guide illustré de Lucie — huit écrans du quotidien
- 2026-09-23 — VA/VAE : un étudiant sans inscription existe aussi — la matrice et les candidats montrent les rattachés (2.12.129)
- 2026-09-23 — Le fil d'activité tient sa promesse de filtre, et le rattachement ignore la casse (2.12.130)
- 2026-09-23 — Le rattachement s'écrit en code de section — les libellés sont ramenés au code (2.12.131)
- 2026-09-23 — Répartition des étudiants : les UE se choisissent au sélecteur, pas au mur de pastilles (2.12.132)
- 2026-09-23 — Répartition : cocher des noms, cliquer l'en-tête d'un groupe — et enchaîner (2.12.133)
- 2026-09-23 — Étudiants : le filtre et le badge « primo-arrivés » sur la liste (2.12.134)
- 2026-09-23 — VA/VAE : les filtres primo et niveau sur la matrice (2.12.135)
- 2026-09-23 — VA/VAE : la section déduite compte aussi — matrice et candidats complets (2.12.136)
- 2026-09-23 — Les documents des années reconstruites : à défaut de référentiel, les inscriptions font foi (2.12.137)
- 2026-09-23 — Le générateur de listes : l'entité Étudiants, l'année qui fait la liste, les critères qui la réduisent (2.12.138)
- 2026-09-23 — Mes cours : la porte du professeur — ses groupes, ses listes, ses notes proposées (2.12.139)
- 2026-09-23 — Attributions : le tronc commun se filtre à l'écran (2.12.140)
- 2026-09-23 — Rapport ETP : aucune organisation ne se perd en route
- 2026-09-23 — Rapport ETP : les lignes sans type de cours comptent aussi (2.12.142)
- 2026-09-23 — Documentation : renommer un texte publié sans réécrire l'histoire (2.12.143)
- 2026-09-23 — Des rôles qui se créent, pas seulement se règlent (2.12.144)
- 2026-09-23 — Accueil : les notifications portent leur genre en couleur (2.12.145)
- 2026-09-23 — Envois : le document part en PDF joint OU dans le corps du courriel (2.12.146)
- 2026-09-23 — Le dossier de suivi de l'étudiant — confidentiel par construction (2.12.147)
- 2026-09-23 — DUE : la feuille se paramètre, la liste suit les droits (2.12.148)
- 2026-09-23 — Délibération : la feuille se scinde par groupe — quand on veut (2.12.149)
- 2026-09-23 — Mes cours : le professeur propose PAR ACQUIS D'APPRENTISSAGE (2.12.150)
- 2026-09-23 — Accueil : le « nouveau » rentre dans la ligne (2.12.151)
- 2026-09-23 — Tâches : « pas encore fait » se dit, l'urgent se rappelle (2.12.152)
- 2026-09-24 — Pied de page : la trace de production passe à droite (2.12.153)
- 2026-09-24 — Étudiants : la suppression directe, mais jamais à l'aveugle (2.12.154)
- 2026-09-24 — Étudiants : les doublons se filtrent, et se fusionnent sur place (2.12.155)
- 2026-09-24 — Réunions : le Conseil d'administration, et ce qui se dit à huis clos (2.12.156)
- 2026-09-24 — Étudiants : diplômer, sortir, archiver — en lot, et réversible (2.12.157)
- 2026-09-24 — Diplômés : la réussite de l'épreuve intégrée se lit partout où elle est (2.12.158)
- 2026-09-24 — Délibération : la grille Excel à envoyer aux professeurs (2.12.159)
- 2026-09-24 — Délibération : le classeur du professeur existait — on le rend visible (2.12.160)
- 2026-09-24 — Acquis : renommer, réordonner, renuméroter — et tout suit (2.12.161)
- 2026-09-24 — Épreuve intégrée : les cases de septembre s'ouvrent ; export et en-tête (2.12.162)
- 2026-09-24 — Acquis : la suppression, et un renommage qui atteint enfin les vraies notes (2.12.163)
- 2026-09-24 — Épreuve intégrée : les acquis de l'UE, chacun avec son poids — sans cours (2.12.164)
- 2026-09-24 — Groupes : ce sont les ACTIVITÉS qui se coupent, pas les cours (2.12.165)
- 2026-09-24 — Délibération : une ligne d'unité lisible — Délibérer · Notes ▾ · Documents (2.12.166)
- 2026-09-24 — Répartition : importer les groupes d'un classeur Excel ; diagnostic du PAE (2.12.167)
- 2026-09-24 — PAE : une unité étrangère à la section ne retient plus la promotion (2.12.168)
- 2026-09-24 — Valider les PAE par section ; groupes 1, 2, 3 = A, B, C à l'import (2.12.169)
- 2026-09-24 — Réunions : le nom des présents dans la liste (2.12.170)
- 2026-09-24 — Réunions : un écran et un PV qui se lisent ; le rapport d'activité du mois (2.12.171)
- 2026-09-24 — Mes cours : l'espace sert — pleine largeur, note à côté du nom (2.12.172)
