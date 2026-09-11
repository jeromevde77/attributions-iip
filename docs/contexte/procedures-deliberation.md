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
- **Une unité cochée après coup** garde en base les notes déjà encodées par
  cours (`s1|cours|aa`) : le calcul ne les lit plus, la grille ne les montre
  plus. Il faut réencoder l'unité — et supprimer les anciennes ensuite, sans
  quoi elles ressortiraient si la case était décochée. Vu sur l'UE 307
  (Optométrie, 2025-2026), cochée alors que 19 étudiants étaient déjà cotés.
- Enregistrement à la sortie du champ, pas de bouton global.
- Sessions 1 et 2 distinguées.
- Import depuis le classeur de suivi (`Repartition_AA_UE`).
- Export / réimport d'un classeur pour les professeurs qui corrigent chez eux.

Le stockage supporte les deux formes : `s1|cours|aa` pour l'encodage par cours,
`s1|aa` pour l'encodage d'UE. **La plus précise l'emporte.**

---

### La composition du Conseil, et qui préside

Les membres se recomposent depuis les attributions à chaque ouverture. C'est
juste pour ouvrir une séance, **insuffisant pour le jury d'épreuve intégrée** :
le décret y veut au moins un chargé de cours de l'UE « Épreuve intégrée », au
moins trois chargés de cours de la **section** — qu'aucune attribution ne
rattache à l'unité — et de une à trois personnes étrangères à l'établissement.
Ces membres-là s'ajoutent à la main.

- **On siège à un titre**, choisi dans la liste du décret (`CATEGORIES_MEMBRE`),
  et **la voix suit le titre** : seuls le délégué du Ministre et la coordination
  siègent avec voix consultative. Avant, tout ajout comptait au quorum.
- **La composition imprimée lit la séance**, non la théorie : elle ignorait les
  membres ajoutés, qui figuraient pourtant au procès-verbal.
- **Si la direction n'a pas siégé, la présidence se désigne** avant d'ouvrir.
  Le délégué ne peut appartenir au Conseil de l'unité ni de la section
  (décret art. 52 · AGCF art. 26) : la route `/deliberation/ue/:n/presidents`
  écarte les chargés de cours concernés **en disant pourquoi**.
#### Le procès-verbal de délibération de section — annexes 6 et 7

C'est l'acte par lequel le Conseil constate qu'un étudiant a terminé, et qui
**fonde la délivrance du titre**. Lucie n'imprimait qu'une « Liste des étudiants
diplômés », qui n'est aucun modèle de la circulaire : le diplôme reposait donc
sur une pièce inexistante.

Route `POST /api/diplomes/pv-section`. Deux modèles pour un même acte :
**annexe 6** quand la section comporte une épreuve intégrée — colonnes Seuil
(A/NA) et pourcentage de l'E.I., délibération du **Jury**, sixième alinéa
autorisant à représenter l'épreuve — et **annexe 7** sinon, délibéré par le
**Conseil**. Commun aux deux : les cinq mentions en alinéas, le nombre de pages,
la communication au ROI, et « Fait en **deux** exemplaires ».

Deux pièges rencontrés en l'écrivant, qui valent d'être notés :

- `ue_det` est un **TEXTE valant `'x'`**, non un booléen. Écrit `= 1`, le filtre
  ne retourne rien et la mention se calcule sur la seule épreuve intégrée, **en
  silence**.
- La cote d'une unité est celle **arrêtée par le Conseil** (`deliberation_resultat`,
  à défaut `etudiant_inscription`), jamais une note de cours.

**Reste à faire** : annexe 4 (PV d'une UE sur valorisation), annexes 14 et 15
(attestations sur valorisation), annexe 16 (validation d'une U.A.A.), annexes 19
et 20 (ambulancier ATNUP — certification de section signée du seul directeur, au
texte imposé par l'arrêté royal du 14 mai 2019).

---

#### Les modèles d'attestation ne sont pas un seul modèle

La circulaire en prévoit plusieurs, et le bon dépend de l'unité :

| Cas | Secondaire | Supérieur |
|---|---|---|
| UE ordinaire | annexe 10 | annexe 11 |
| UE stage / activités professionnelles | annexe 12 | annexe 13 |
| UE sur valorisation des acquis | annexe 14 | annexe 15 |
| UE « épreuve intégrée » | **annexe 17** | annexe 18 |
| Validation d'une UAA | annexe 16 | — |
| Ambulancier (ATNUP) | **annexe 19** (après 01/09/2019) · annexe 20 (avant) | — |

Lucie distinguait l'épreuve intégrée et le stage, mais **pas le niveau** : elle
visait « les articles 52, 53 et 58 » et affichait ECTS et domaine, mentions du
seul supérieur. Une section secondaire — ATNUP, par exemple — recevait une
attestation fondée sur les mauvais articles. Le niveau se déduit désormais de
`ue_niv`, à défaut de la présence d'ECTS et d'un domaine.

**L'annexe 19 reste à faire, et ce n'est pas une attestation d'unité.** C'est une
certification de **section** délivrée au titre de l'arrêté royal du 14 mai 2019,
signée du seul directeur (« Je soussigné(e) … certifie que »), au texte fixe :
288 périodes dont 86 de stage, et deux listes de formation imposées. Elle ne peut
pas sortir du modèle générique.

---

#### Corriger l'administratif sans rouvrir la séance

Une séance close refusait toute retouche : il fallait **annuler la
délibération** — donc repasser toutes les décisions — pour corriger une date mal
tapée ou un membre oublié. Deux actes étaient confondus : rejuger un étudiant
est une délibération, écrire le bon prénom ne l'est pas.

Le bandeau de séance close porte donc **deux** boutons : « Corriger
l'administratif » et « Rouvrir la séance ». Le premier ne touche que la date et
l'heure de séance, la visite des copies, la présidence et les membres. Les
décisions, les notes et les résultats lui sont inaccessibles. La séance **reste
close**, un motif écrit est exigé, et l'avant/après est conservé dans
`seance_correction` avec l'auteur et l'horodatage.

Une correction de composition **remplace** la liste : un membre ajouté par
erreur peut être retiré, sans quoi on ne pourrait jamais défaire une faute.

---

#### Ce que les modèles officiels prévoient — vérifié sur les annexes

Les fichiers `Sanction_études_avec_annexes.pdf` sont des **archives de pages
scannées**, non des PDF : l'extraction automatique en donne un texte fautif.
Les constats ci-dessous viennent de la lecture des images.

**Un seul document nomme les membres : l'annexe 2**, « Composition du Conseil
des études **de section** / Composition du jury d'épreuve intégrée » —
intitulé de la section, numéro de code approuvé, et un tableau
NOM · PRÉNOM · FONCTION/QUALITÉ · **SIGNATURE** (manuscrite), clos par le
sceau, la date et le Directeur. C'est une pièce **de section**, pas d'unité.

Les autres se contentent de « Nous, soussignés, Président-e et Membres… » sans
aucun nom : annexe 5 (PV d'une UE E.I.), annexes 8 et 9 (motivations), annexes
10 à 18 (attestations de réussite). Toutes portent deux signatures — le Conseil
ou le Jury d'un côté, **« La Directrice, / Le Directeur, »** de l'autre.

Corrigé en conséquence : l'attestation ne nomme plus personne et porte « Fait
en un exemplaire » ; le PV et les motivations portent la signature du
Directeur à côté de celle du président ; la composition suit le format de
l'annexe 2.

**Reste un écart connu** : la composition se produit encore par unité alors que
le modèle est par section. Le titre et le contenu suivent le modèle, le
périmètre non.

- **Trois pièces nommaient trois listes différentes.** Le procès-verbal lisait
  les présents, la composition recomposait depuis les attributions, et
  l'attestation de réussite nommait les enseignants de l'unité — donc, pour un
  jury d'épreuve intégrée, ni les chargés de cours de la section ni les
  personnes étrangères, tandis qu'un professeur absent y figurait. Les trois
  lisent désormais **les membres présents de la séance**, avec repli sur les
  enseignants de l'unité quand aucune séance n'est enregistrée.
- Un président désigné **signe de sa main** : aucun fac-similé. Et les
  **attestations de réussite restent signées du Directeur** — l'attestation est
  délivrée par l'établissement, le procès-verbal rend compte d'une séance.

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
