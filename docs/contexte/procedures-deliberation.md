# Du paramétrage à l'attestation — la chaîne complète

Trois temps, trois publics, trois écrans. Ils ne doivent jamais se mélanger :
le paramétrage est un acte de direction, l'encodage un acte de professeur, la
délibération un acte de Conseil.

> Note du 6 septembre 2026. Les états marqués « à faire » ont pu être traités
> depuis — la valeur de cette note est dans **l'enchaînement** et dans les deux
> questions ouvertes de la fin.

---

## 1. PARAMÉTRAGE — avant l'année (direction / secrétariat)

**Où :** Organisation de l'année → paramétrage de l'UE (schéma à flèches).

| Étape | Remarque |
|---|---|
| Référentiel : sections, UE, cours, périodes | les périodes donnent le poids du cours dans l'UE |
| Acquis d'apprentissage de l'UE | importés ou saisis |
| Lier cours ↔ AA par flèches | `SchemaLiensAA` |
| Pondérer chaque AA dans son cours | 10 points à répartir, entiers ; barème 100 des classeurs encore accepté |
| Cocher « épreuve intégrée d'UE » | |
| Schéma de capitalisation (prérequis entre UE) | indépendant du reste |
| Blocage si l'UE n'est pas paramétrée | présent en délibération, pas au référentiel |

**Contrôle de sortie :** une UE est *prête* si tout AA est rattaché à au moins un
cours, et si chaque cours totalise ses points. Sinon l'encodage n'a rien à
montrer — c'est exactement le message « aucun AA lié à ce cours ».

**Épreuve intégrée d'UE** — tous les professeurs de l'UE font un examen commun.
On coche l'UE. Dès lors :

- on n'encode plus par cours, mais **une note par AA pour l'UE entière** ;
- la note de l'UE se calcule sur ces AA pondérés ;
- **chaque cours de l'UE reçoit la note de l'UE**, identique.

Les liens cours ↔ AA restent utiles — ils disent qui enseigne quoi — mais ne
servent plus au calcul.

---

## 2. ENCODAGE — en fin de session (professeurs, secrétariat)

**Où :** Étudiants → Délibération → UE → « Encoder par cours ».

- Grille par cours : étudiants × AA de ce cours, notes /20.
- **Épreuve intégrée : une seule grille**, celle de l'unité — ses acquis, une
  note commune, aucun cours en colonne. La note s'écrit sans cours (`s1|aa`) et
  chaque cours de l'unité reçoit ensuite la note de l'unité.
- Enregistrement à la sortie du champ, pas de bouton global.
- Sessions 1 et 2 distinguées.
- Import depuis le classeur de suivi (`Repartition_AA_UE`).
- Export / réimport d'un classeur pour les professeurs qui corrigent chez eux.

Le stockage supporte les deux formes : `s1|cours|aa` pour l'encodage par cours,
`s1|aa` pour l'encodage d'UE. **La plus précise l'emporte.**

---

### Le calendrier, hors de la délibération

Les dates d'épreuve, de visite des copies et de séance se posent depuis
**Étudiants → Calendrier des sessions** : toute la section sur une page, les
unités puis leurs cours, et une valeur applicable d'un coup à ce qui est coché.
Deux dispositions, au choix, retenu d'une visite à l'autre : **côte à côte**
(par défaut) met juin et septembre sur la même ligne — replié, chaque unité ne
montre que ses deux délibérations, ce qui tient sur un écran ; **empilée** met
la première session en bleu au-dessus de la seconde en gris, et laisse plus de
largeur pour saisir.

- **L'unité** porte la délibération — le Conseil siège par unité, et il n'y a
  qu'une décision.
- **Le cours** porte l'épreuve **et la visite des copies**, dans les deux
  sessions : on vient consulter la copie d'une épreuve, et deux professeurs
  qui n'interrogent pas le même jour ne montrent pas les copies le même jour.
  La visite était rangée sur l'unité ; elle est descendue au cours
  (`s1_visite_*`, `s2_visite_*`). Les notifications ne montrent encore qu'un
  bloc de visite : elles prennent celle de l'unité, à défaut la première posée
  au cours. **Un bloc par cours reste à faire.**
- **Le local se choisit** dans la liste des 55 locaux de l'Institut (table
  `local`), groupée par type et annotée du nombre de places — il ne se tape
  plus.
- Une **séance close** se corrige, mais seulement avec un **motif écrit**,
  conservé dans `calendrier_correction`. Corriger une date n'est pas rouvrir
  une délibération : la séance reste close.

---

## 3. DÉLIBÉRATION — le Conseil des études

**Où :** Étudiants → Délibération → section → UE → « Délibérer ».

La fiche montre, dans cet ordre de lecture :

1. **l'acquis au global** — sa note consolidée sur tous les cours qui l'évaluent ;
2. **la note de chaque cours** ;
3. **la note de l'unité**.

Tout élément sous le seuil est encadré de rouge.

**Deux gestes du Conseil :**

- **Faveur** — lever l'unité en échec. Conséquence, non négociable : l'unité
  vaut **exactement 10**, et sur les documents de l'étudiant **tout ce qu'elle
  contient vaut 10** — sans quoi le document se contredit. *Décret du
  16/04/1991 : le Conseil ne peut ni attester la réussite sans maîtrise de tous
  les acquis, ni donner plus de 10/20 quand l'un d'eux n'est pas maîtrisé.*
- **Ajournement** — l'élément passe à **NA**, sort du calcul, et l'unité devient
  NA tant qu'il est à représenter. Un cours ajourné emporte tous ses acquis.
  **N'existe pas en seconde session** : il n'y a rien après.

---

## 4. SUITES — après la délibération

- Report des résultats sur l'inscription (résultat + points).
- Capitalisation : l'UE réussie alimente le schéma de l'étudiant.
- Attestation de réussite d'UE.
- Notification d'ajournement ou de refus (annexes 8 et 9).
- Composition des PAE de l'année suivante, parcours individuels.
- Procédures : recours, fraude, aménagements raisonnables.
- Titre de section (fin de parcours) — **non traité**.

---

## Deux questions ouvertes

- Un professeur doit-il ne voir **que ses propres cours** à l'encodage ?
- Un **acquis** ajourné — et non un cours entier — doit-il rendre l'unité NA ?
  Appliqué par symétrie, **à confirmer**.
