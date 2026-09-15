# Tout ce que Lucie sait sortir — inventaire

*État au 15 septembre 2026, branche `develop` (2.2.5). Établi par dépouillement
du code, pas de mémoire.*

Une « sortie », ici, c'est ce qui quitte l'écran : un document imprimable, un
PDF, un tableur, un CSV, une archive. La question posée était simple — **que
savais-je sortir, et où est-ce passé ?** Trois réponses possibles pour chaque
pièce : elle est au centre d'impression, elle est derrière un bouton d'un autre
écran, ou elle n'a plus de porte.

---

## A. Au centre d'impression — la porte de référence

Le catalogue (`backend/src/routes/rapports.js`) donne chaque rapport **en pièce
imprimée et en tableur**, avec aperçu des cinquante premières lignes.

### Pilotage

| Rapport | Ce qu'il dit |
|---|---|
| ETP et périodes par section | Périodes attribuées, part IIP / HELB, ETP, coût dotation |
| Périodes et ETP par unité | Le détail unité par unité, pour repérer ce qui pèse |
| ETP par établissement référent | La répartition entre l'Institut et la Haute École |
| **Rapport de charge ETP par cursus** | **La pièce du COPIL** : blocs, CT/PP, parts, ratios étudiants par ETP |
| Résultats de délibération par unité | Réussites, ajournements, refus, taux — pour la session choisie |
| Emploi de la dotation par section | Ce qui est engagé sur la dotation |

### Personnel

| Rapport | Ce qu'il dit |
|---|---|
| Membres du personnel et leur charge | Statut, référent, sections, périodes, ETP |
| Temporaires et ancienneté | Les non-définitifs, années de service et périodes cumulées |
| Attributions par professeur | Le détail ligne à ligne |
| Professeurs par section | Qui enseigne dans un cursus, sur combien d'unités |
| Synthèse de charge par professeur | Cours, périodes, heures, ETP |
| Encadrements — TFE, stages, épreuves | Ce qui s'attribue hors cours |

### Référentiels

Unités d'enseignement du référentiel · Grille de cours · Acquis d'apprentissage ·
Unités sans attribution.

### Organisation

Calendrier des délibérations · Locaux de l'Institut.

### Éditions de délibération (onglet Étudiants)

Attestations de réussite · Motivations d'ajournement · Motivations de refus ·
Procès-verbal de délibération · Composition du Conseil · Grille de délibération.

---

## B. Derrière le bouton d'un autre écran

Ces pièces sont vivantes, mais leur porte est ailleurs que le catalogue.

| Écran | Ce qu'on en sort |
|---|---|
| **Étudiants** | Export de section (.xlsx) · Rapport PAE (+ Excel) · Parcours des étudiants · Fiche de parcours · Fiche d'inscription · Frais de scolarité · Annexe 2 · Motivation de décision · Centre de diplomation |
| **Attestations / diplômes** | PDF unique · ZIP séparés · Export CSV de la liste · Éditeur de diplôme |
| **Professeurs** | Contrat (.docx et .pdf) · Fiche signalétique · Fiche d'attributions · Fiches de sélection GLOBAL / IIP / HELB en ZIP · Contrats en lot · Impression de la liste |
| **Attributions** | Export Excel global · Export Excel par section · Rapport d'attributions · Doc 2/3 |
| **Référentiels** | Grille de section |
| **Pilotage / Gestion** | Rapport de dotation (portrait et paysage) · Export CSV des statistiques de délibération |
| **DUE** | Impression du DUE |
| **Suivi d'équipe** | Procès-verbal de réunion · Feuille des tâches en cours |
| **Procédures** | PV de recours · PV de fraude · Documents d'archive · Trace PDF |
| **Disciplinaire** | Courriers et pièces jointes |
| **Besoins / Recrutement** | Offre d'emploi · Rapport PDF · Grille d'entretien · Fiches candidat |
| **EA12** | Aperçu · .docx · .pdf · version imprimable |
| **Éditeur libre** | Document A4, portrait ou paysage |
| **Encodage UE / cours** | Classeur de notes (.xlsx) |
| **Configuration** | Galerie d'aperçus — 7 modèles de pièces |
| **Sauvegardes** | Archive de la base |

---

## C. Sans porte — le code existe, aucun écran ne l'ouvre

C'est la réponse à « tout a disparu » : **rien n'a été supprimé**. Ce qui suit
fonctionne encore et n'attend qu'un chemin.

| Ce que c'est | Où c'est |
|---|---|
| L'écran « Listes » et ses 16 modèles (route `/listes`, plus référencée nulle part) | `frontend/src/pages/Listes.jsx` |
| — dont **grille de section**, **rapport par section**, **rapport par UE** | mises en page, pas encore portées au catalogue |
| — dont **grille de cours**, **rapport ETP**, listes de professeurs, UE sans attribution, encadrements | **déjà repris au catalogue** (section A) |
| Étudiants diplômés — liste et PV de section | `components/ListeDiplomes.jsx` |
| L'ancien centre d'impression | `components/CentreImpression.jsx` |
| Les documents de délibération par UE | `components/CentreDocumentsUE.jsx` |
| Le catalogue des pièces nominatives (`/api/impression/catalogue`) | `backend/src/lib/documents.js` — aucun écran ne l'appelle |
| Export des professeurs (`/api/exports/professeurs`) | `backend/src/routes/exports.js` |
| PDF d'attestations en lot (`/api/attestations/pdf`) | `backend/src/routes/attestations.js` |
| Documents de valorisation par UE | `backend/src/routes/attestations.js` |
| PV de délibération par UE (`/deliberation/ue/:num/pv`) | `backend/src/routes/acquis.js` — le PV passe aujourd'hui par le lot |

---

## Ce qu'il reste à faire, dans l'ordre

1. **Porter les trois mises en page** qui restent sans porte — grille de
   section, rapport par section, rapport par UE — par le chemin ouvert pour le
   rapport ETP : un corps de document écrit côté serveur, dans l'enveloppe de
   la maison.
2. **Décider du sort de l'écran `/listes`** une fois ces trois pièces portées :
   il n'aura plus rien que le catalogue ne sache faire.
3. **Rapatrier vers le catalogue** ce qui, en section B, est une *pièce* et non
   une commande d'écran — le rapport de dotation en premier.
4. **Retirer le code mort** de la section C une fois (1) et (2) faits : ancien
   centre d'impression, centre de documents par UE, routes sans appelant.

> Le principe ne change pas : **le catalogue est la seule porte**. Une pièce qui
> n'y figure pas finit par n'être ouverte par personne — c'est exactement ce qui
> est arrivé ici.
