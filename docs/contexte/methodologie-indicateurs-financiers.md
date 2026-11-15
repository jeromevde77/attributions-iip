# Méthodologie des indicateurs financiers, de la dotation et de la comparaison IIP / HELB

Lucie 3.5.462 — 15 novembre 2026. Ce document dit, pour chaque chiffre de Gestion, d'où il vient et comment il se calcule.
Il décrit le code tel qu'il tourne en production ; les montants cités sont ceux réglés dans Configuration au 15 novembre 2026.

---

## 1. Les briques de base

### 1.1 La période attribuée

Tout part des **lignes d'attribution** de l'année (Organisation → Attributions) : une ligne = un enseignant, un cours, un
nombre de périodes, un contrat (IIP ou HELB), un type (CT = cours théorique / général, PP = pratique professionnelle).

- Une ligne **en congé ne compte pas** : son remplaçant est compté à sa place.
- Le type manquant sur une ligne est repris du cours ; à défaut, la ligne est comptée en CT.
- Les **activités Z** (développement professionnel, périodes étudiant) n'entrent jamais : elles n'ont pas d'enseignant.

### 1.2 L'ETP enseignant

```
ETP = périodes CT ÷ 800 + périodes PP ÷ 1 000
```

C'est la règle de Pilotage, reprise partout (Gestion, IIP et HELB, Lire et comparer).

### 1.3 Le prix d'une période — circulaire des conventions

Configuration → Coût des périodes. Référence : **circulaire n° 9789 du 31/08/2026**, en vigueur au 1er septembre 2026.

| Niveau | CT (général) | PP | Cours spéciaux |
|---|---|---|---|
| Supérieur (SUP) | 108,81 € | 92,07 € | 88,28 € |
| Secondaire supérieur (DS) | 96,13 € | 69,85 € | 88,28 € |
| Secondaire inférieur (DI) | 80,45 € | 68,26 € | — |

Le niveau d'une ligne est celui de son unité ; celui d'une section se lit de son niveau déclaré (bachelier, BES, formation
continue du supérieur → SUP).

Les **experts** (statut EXP) ont leurs propres montants (A.E. du 26/01/1993, art. 8, montants de base au 01/07/1991 :
SUP 28,44 € CT / 18,25 € PP), plafonnés à 260 périodes (360 par dérogation).

### 1.4 Le coût moyen brut pondéré (CMB)

Méthode de la haute école : **106 € par période** au supérieur (réglable ; DS et DI à 0 = « à régler »).
```
coût CMB = périodes attribuées du niveau × 106 €
```
Il ne remplace pas le coût détaillé : les deux se montrent côte à côte, l'écart vient de la méthode, pas des périodes.

---

## 2. Le coût d'une section (Gestion → Finances → Coûts des formations)

### 2.1 Le coût d'enseignement

```
coût d'enseignement = Σ (périodes de chaque ligne × prix de la période de son niveau et de son type)
```
séparé en **part IIP** (contrat IIP) et **part HELB** (contrat HELB).

### 2.2 Les fonctions (coordinations, direction, secrétariat)

Chaque fonction encodée pour l'année (Personnel → missions) est chiffrée selon sa nature :

| Fonction | Calcul |
|---|---|
| Direction, secrétariat (emplois PNCC, circ. 7949) | ETP × périodes B d'un temps plein × prix d'une période B. Directeur 1 200, directeur adjoint 1 000, secrétaire de direction / comptable / économe 900, éducateur-secrétaire / rédacteur / commis 800. Prix de la période B : le CT du secondaire inférieur (80,45 €) tant que le paramètre est vide. À défaut, ETP × coût annuel d'un temps plein (paramètre). |
| Coordinations d'une section | ETP × 800 × prix d'une période CT du niveau de la section. Si la coordination figure déjà en lignes d'attribution (codes COCUR, COSTA, COTFE…), elle n'est pas comptée deux fois. |

### 2.3 Le coût complet

```
part des fonctions de la section = coût total des fonctions × inscrits de la section ÷ inscrits de l'IIP
coût complet = coût d'enseignement + part des fonctions
```
La répartition au prorata des inscrits est un choix de Charles (6 octobre 2026).

### 2.4 Ce que la section rapporte (recettes théoriques)

Unité par unité :
```
droit d'inscription = périodes de l'unité (DI) × tarif du niveau
frais              = périodes étudiant de l'unité × montant par période
recette de l'unité = inscrits de l'unité × (droit + frais)
recettes            = Σ recettes des unités + inscrits × (forfait DI + frais fixes)
```
Calcul **théorique** : ni plafond, ni exonération. Une section dont un tiers perçoit les droits ne rapporte rien à l'IIP.

---

## 3. Les indicateurs de Lire et comparer (Gestion → Vue d'ensemble)

Pour chaque section et pour l'IIP entier, sur l'année choisie.

| Indicateur | Calcul |
|---|---|
| Inscrits | étudiants de la section (chiffres clés) |
| Croissance | inscrits ÷ inscrits de l'année d'avant − 1 |
| ETP enseignant | § 1.2 |
| **Taille moyenne des groupes** | Σ (inscriptions à chaque UE × périodes de cours de l'UE) ÷ périodes attribuées |
| **Étudiants temps plein (ETC)** | crédits suivis ÷ 60, où crédits suivis = Σ (inscriptions à chaque UE × ECTS de l'UE) |
| **Étudiants temps plein par ETP** | ETC ÷ ETP |
| Coût d'un étudiant | coût complet ÷ inscrits |
| **Coût d'un étudiant temps plein** | coût complet ÷ ETC |
| **Coût par crédit** | coût complet ÷ crédits suivis |
| Coût d'une formation de 180 crédits | coût par crédit × 180 |
| **Coût par période de la grille étudiant** | coût complet ÷ Σ (inscriptions × périodes étudiant de l'UE) — vaut aussi pour une formation sans crédits |
| Recettes par étudiant | recettes théoriques (§ 2.4) ÷ inscrits |
| Réussite finale, en 1re session, en 2e session | délibérations de l'année (unités réussies ÷ décisions) |

Une UE qui existe sous plusieurs sections n'est lue qu'une fois par numéro.

**Pourquoi le coût par crédit et par période plutôt que par étudiant** : un étudiant de Soins de plaies suit une seule unité,
un étudiant de TIM une année entière. Le coût par étudiant les mettrait côte à côte sans qu'ils soient comparables ; le crédit
et la période le sont.

### 3.1 Le verdict (vert / orange)

Pour chaque indicateur qui a un sens (« plus haut = mieux » ou l'inverse), la section est comparée à la référence choisie
(IIP, ASBL ou l'année d'avant) : **vert** si elle fait mieux ou égal, **orange** sinon. Les indicateurs neutres (sexe, âge,
nationalité…) disent l'écart sans le juger.

---

## 4. La référence ASBL (les deux établissements réunis)

Choix de Charles (14 novembre 2026) : on ne compare plus une section à la HELB, mais à l'**ASBL entière** (HELB + IIP), « pour
ne froisser personne ».

### 4.1 Les sources (Gestion → Les sources)

La direction y dépose les fichiers ; Lucie n'en garde que des **totaux**, jamais une donnée de personne.

| Source | Ce que Lucie en retient |
|---|---|
| COR de la HELB (septembre 2026) | rémunérations totales 18 682 191 €, enseignement 14 017 806 €, encadrement 4 664 385 €, 143,39 ETP statutaires |
| Attributions HELB 2026-2027 | 165,76 ETP dans les cursus (enseignement + fonctions), 89 417 heures données |
| Inscrits HELB (2 novembre 2026) | 3 093 dossiers (hors TIM, inscrits à l'IIP), dont 1 701 débutants |
| Comptes annuels de l'ASBL (BNB) | charges, produits, chiffre d'affaires, rémunérations, résultat — 2024 et 2025 |
| Synthèse des budgets et comptes | charges et produits par service et par section, exercice par exercice (réalisé, à défaut budget) |
| Comparaison ETP (HELB) | étudiants comptés et ETP par cursus, 2022-2023 à 2025-2026 |

### 4.2 Les calculs

```
coût de l'ASBL     = charges de l'ASBL (dernier exercice réalisé) + coût complet de l'IIP calculé par Lucie
étudiants          = inscrits HELB + inscrits IIP
crédits            = inscrits HELB × 60 + crédits suivis à l'IIP
ETP                = ETP des cursus de la HELB + ETP de l'IIP

coût par étudiant          = coût de l'ASBL ÷ étudiants
coût par crédit            = coût de l'ASBL ÷ crédits
coût d'un étudiant temps plein = coût de l'ASBL ÷ (inscrits HELB + ETC de l'IIP)
étudiants temps plein par ETP  = (inscrits HELB + ETC de l'IIP) ÷ ETP
taille moyenne des groupes = (périodes suivies IIP + inscrits HELB × p) ÷ (périodes données IIP + heures HELB × 1,2)
coût par période de la grille = coût de l'ASBL ÷ (périodes grille IIP + inscrits HELB × q)
croissance          = étudiants ÷ (inscrits HELB ÷ (1 + croissance HELB) + inscrits IIP de l'an dernier) − 1
primo-inscrits      = (débutants HELB + primo-inscrits IIP) ÷ étudiants
recettes par étudiant = chiffre d'affaires de l'ASBL ÷ étudiants
```

**Hypothèses, dites à l'écran** :
- Un étudiant de la HELB compte pour 60 crédits (temps plein).
- `p` et `q` : un étudiant de la HELB suit autant de périodes qu'un étudiant temps plein de l'IIP (≈ 568 périodes par an).
- Les heures HELB sont converties en périodes de 50 minutes (× 1,2).
- La croissance de la HELB est celle de ses étudiants comptés, de 2024-2025 à 2025-2026 (dernières années connues) ; celle de
  l'IIP porte sur l'année en cours — deux périodes différentes, faute d'inscrits HELB de l'an dernier.
- Le chiffre d'affaires de l'ASBL comprend des prestations en plus des droits et frais ; l'IIP, lui, compte ses droits et frais.
- **Sans référence ASBL** : réussite, sexe, âge, nationalité, domicile — les fichiers de la HELB n'en disent rien.

### 4.3 Pas de double compte (confirmé par Charles, 15 novembre 2026)

Tout le personnel de l'IIP — enseignants, direction, secrétariat — est payé par la dotation ou occupe des postes accordés par la
FWB : il a une valeur, mais elle ne passe pas dans les comptes de l'ASBL. Les charges de l'ASBL ne le contiennent donc pas, et
Lucie l'ajoute une seule fois, par le coût complet de l'IIP.

---

## 5. La codiplomation IIP / HELB (Gestion → Dotation → IIP et HELB, et sous TIM / Orthoptie dans Lire et comparer)

Une section en codiplomation (TIM, Orthoptie) a des enseignants des deux établissements. La page les sépare, année par
année (2023-2024 à 2026-2027 au choix).

### 5.1 Côté IIP

```
charge IIP (ETP)  = ETP des lignes au contrat IIP + ETP de coordination IIP
coût IIP          = coût d'enseignement IIP + coordinations IIP + part du cadre administratif
                   (en coût moyen brut : périodes IIP × 106 € + part du cadre administratif)
```
- **Cadre administratif** : coût de la direction et du secrétariat de l'IIP × part de la section dans les inscrits de l'IIP.
  Une année sans fonctions encodées reprend la structure de la dernière année encodée (marqué « repris »).
- **Aide à la réussite (UE 95)**, 100 % IIP : périodes attribuées de l'UE 95 × CT du supérieur × part de la section
  (réglable ; à défaut, sa part dans les inscrits de l'IIP).

### 5.2 Côté HELB

Un ETP de la HELB ne se compte pas comme un ETP de l'IIP (Charles, 15 novembre 2026) : **seule la théorie donnée par un
maître-assistant est payée en 480 heures** par an ; tout le reste (TP, maîtres de formation pratique, praticiens) en **750 heures**
(= 900 périodes) ; une coordination en 1 400 heures. C'est la règle que Lucie appliquait déjà dans Pilotage → ETP.

```
titre   = colonne « HELB » de la ligne d'attribution (MA / MFP), à défaut le statut HELB de la fiche de l'enseignant
nature  = colonne TH / TP de la ligne
heures  = périodes × 50/60          (ou les périodes telles quelles, si les lignes HELB sont en heures)
ETP     = heures ÷ 480 (MA et théorie) · ÷ 750 (tout le reste) · ÷ 1 400 (coordination)
charge HELB (ETP) = ETP des lignes HELB + ETP de coordination HELB
coût HELB (coût de la section) = coût d'enseignement HELB + coordinations HELB   (au tarif de la circulaire, ou × 106 € en CMB)
```

**ETP selon Lucie et ETP déclaré par la HELB, côte à côte** (choix de Charles) : pour TIM en 2025-2026, les lignes HELB de Lucie
donnent 1,75 ETP ; la comparaison ETP de la HELB en annonce 3,21. L'écart vient de ce que les attributions de Lucie ne portent pas
(lignes HELB manquantes, encadrement, stages…) : à éclaircir avec la HELB.

### 5.3 Ce que la section coûte et rapporte à la HELB et à l'ASBL

Paramètres par défaut, tous réglables dans la page :

| Paramètre | Valeur |
|---|---|
| Part des inscrits comptés pour la HELB | 50 % |
| Unité de charge (MUCE) | 3 837,18 € |
| Pondération santé | × 1,5 |
| Allocation à partir de | 2026-2027 |
| Lissage | 3 ans |
| Prix d'un ETP HELB | au choix : au titre (COR : maître-assistant 88 981 € ; tout le reste au prix d'un maître de formation pratique, 78 037 €), à la moyenne du COR (85 203 €), ou au montant réglé (90 000 €, courriel de F. Vanderoost du 27 août 2026) |
| Autres services | 0 % des salaires |
| Fonctionnement | réel (matériel des budgets), ou forfait 20,8 % de l'allocation |

```
étudiants comptés   = inscrits × 50 %
allocation          = moyenne des étudiants comptés des 3 années précédentes × MUCE × 1,5   (dès 2026-2027)
recettes HELB/ASBL  = allocation + droits et frais (§ 2.4)
salaires (au titre)    = ETP des maîtres-assistants × 88 981 € + tout le reste (MFP, praticiens, coordinations) × 78 037 €
salaires (moyenne)     = ETP HELB (coordinations comprises) × 85 203 €
salaires (montant réglé) = ETP HELB (coordinations comprises) × 90 000 €
fonctionnement      = matériel réel : 0 € (2023-24), 3 250 € (2024-25), 7 650 € (2025-26), 3 750 € (2026-27)
coût HELB           = salaires + autres services + fonctionnement
résultat            = recettes − coût
étudiants par ETP   = étudiants comptés ÷ ETP HELB      (moyenne de la HELB : 17)
```
Le matériel vient de la synthèse des budgets de l'ASBL (part HELB 50 % des lignes TIM) : réel pour 2023, budgets initiaux
ensuite. Les **inscrits retenus** peuvent être corrigés année par année dans la page (vide = le chiffre de Lucie).

### 5.3 bis Le résultat réel d'une codiplomation dans les comptes de l'ASBL

La synthèse des budgets et comptes de l'ASBL n'impute à TIM qu'une petite part de ses enseignants HELB : en 2025, 30 164 € de
personnel sur le code analytique 111066 (16 873 € de salaires, 13 291 € de professeurs invités et prestataires), pour environ
2 ETP. Les autres enseignants sont payés, mais leur coût est imputé à d'autres codes. Le résultat comptable de TIM (+218 065 € en
2025) est donc flatteur. Choix de Charles (15 novembre 2026) : « nos calculs doivent être réels ».

```
coût des enseignants HELB (année civile) = 8/12 × coût de l'année scolaire qui finit + 4/12 × coût de celle qui commence
   coût d'une année scolaire = ETP HELB de Lucie (lignes HELB + coordinations HELB, § 5.2) au prix du titre (COR)
déjà imputé = salaires (620 à 623) + professeurs invités (613) du code analytique de la section
imputé ailleurs = max(0, coût des enseignants HELB − déjà imputé)
résultat réel = résultat comptable − imputé ailleurs
```
Le personnel imputé se lit dans les feuilles analytiques (« ASBL23 », « ASBL24 »…) du classeur déposé ; le code d'une section est
connu (TIM : 111066) ou reconnu par l'égalité exacte des charges. Pour un exercice budgété, le personnel déjà imputé est inconnu :
tout le coût des enseignants HELB est ajouté. Montré dans Lire et comparer (comptabilité de la section) et dans la présentation au CA.

### 5.3 ter L'estimation d'un exercice non réalisé (2026, et l'année scolaire en cours)

Un budget ne dit pas le réel : pour une codiplomation, Lucie remplace un exercice seulement budgété par son estimation, pour toute
l'ASBL (côté HELB et côté IIP réunis), d'après les inscrits et les attributions :
```
produits = allocation de la HELB + droits et frais des inscrits (barème de Lucie)
   allocation : le calcul du § 5.3 dès 2026-2027 ; avant, le niveau réel des subsides du dernier exercice réalisé
   (TIM 2025 : 248 372 €, compte 737100)
charges  = enseignants HELB (ETP de Lucie, coordinations comprises, prix du titre) + matériel
année civile = 8/12 de l'année scolaire qui finit + 4/12 de celle qui commence
```
**Deux lectures du financement de la HELB, côte à côte** (Charles : « montre-moi les deux ») :
- **subsides réels** : ceux que les comptes attribuent à la section au dernier exercice réalisé, ramenés à un montant par inscrit
  (inscrits de l'année civile : 8/12 + 4/12), × les inscrits de l'année estimée ;
- **UCE** : 50 % des inscrits × MUCE 3 837,18 € × 1,5, lissé sur les 3 années précédentes (à défaut, avant 2026-2027, les subsides réels).
La présentation au CA retient les subsides réels et cite les UCE dans les notes de l'orateur.

La quote-part des frais généraux (626000, 152 707 € en 2025) est compensée dans les comptes par un produit du même montant
(737000) : l'estimation laisse cette paire de côté. Les enseignants de l'IIP, payés par la Fédération, ne sont pas une charge de l'ASBL.

### 5.4 Le coût d'un étudiant

```
coût d'un étudiant = (coût IIP + coût HELB) ÷ inscrits
apport de l'IIP sur la période = Σ coûts IIP des années choisies
```

### 5.5 La comparaison aux départements et aux cursus de la HELB

Étudiants **finançables** ÷ ETP enseignant.
- **Départements et ensemble de la HELB** : le document de la HELB « ratio par département » (Social, Technoeco, COMAV, Santé,
  2022-2023 à 2025-2026). L'ensemble de la HELB = la somme des quatre départements : 2 739,9 étudiants ÷ 169,05 ETP = **16,2** en
  2025-2026 (au lieu des 17,2 repris auparavant). Un nouveau fichier du même modèle se dépose dans Les sources.
- **Cursus** : la comparaison ETP de la HELB (Chiffres_Santé.xlsx, Évolution COMAV, Cor_HE_AE 2025-2026).
Données de référence, jamais recalculées par Lucie.

---

## 6. La dotation (Gestion → Dotation)

### 6.1 L'usage de la dotation organique, par année civile

L'année civile chevauche deux années scolaires : janvier-juin = 2e quadrimestre de l'année scolaire qui se termine ;
septembre-décembre = 1er quadrimestre de celle qui commence.

```
usage d'une ligne (contrat IIP, hors congé) = périodes × pondération du niveau
   pondération : supérieur × 1,5 ; secondaire supérieur × 1,25
   UE sur un quadrimestre : tout sur ce quadrimestre
   UE sur Q1/Q2 : 40 % au Q1, 60 % au Q2
```
Chaque ligne va dans son **pot** : organique, ou une enveloppe externe (qualité, formation continue, inclusion — reconnues au
code FWB de l'UE, ou au pot posé sur l'unité).

```
usage organique = usage direct des UE organiques + dépassements des enveloppes externes
dépassement d'une enveloppe = max(0, usage − périodes B de l'enveloppe)   (une enveloppe illimitée ne déborde jamais)
solde organique = dotation organique − usage organique
taux d'usage    = usage organique ÷ dotation organique
```
La moitié qui vient (janvier-juin de l'année suivante, déjà attribuée) est montrée à part : elle pèsera sur l'année civile
suivante.

À côté de ce calcul, la direction peut saisir un **solde constaté** : il ne corrige pas le calcul, il le confronte ; l'écart
mesure ce qui n'est pas encore encodé.

### 6.2 Pas de secondaire inférieur (confirmé par Charles, 15 novembre 2026)

L'IIP n'organise pas de degré inférieur : la dotation n'emploie que des périodes du secondaire supérieur (DS) et du supérieur
(SUP). La pondération 0 du DI dans le calcul est donc sans effet.

---

## 7. Ce qui reste ouvert

1. Un étudiant HELB = 60 crédits et 568 périodes par an : hypothèses à remplacer par les vrais chiffres de la HELB si on les obtient.
2. Le cadre administratif réparti au prorata des inscrits (et non des périodes) : avantage les sections à petits effectifs
   et beaucoup d'heures, pénalise celles à unités courtes (Soins de plaies).
