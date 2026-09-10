# Lucie — Institut Ilya Prigogine

Application de gestion académique de l'IIP : attributions du personnel,
programmes annuels des étudiants, encodage des notes, délibérations, procédures
et production des pièces réglementaires.

Née de la migration des classeurs `Attributions.xlsm` et `BD_UE_COURS.xlsx`,
elle couvre aujourd'hui la chaîne complète, de l'attribution d'un cours à
l'attestation de réussite.

> **Enseignement de promotion sociale (FWB).** Ce que fait l'application est
> encadré par le décret du 16 avril 1991, le RGE/ROI de l'établissement et la
> circulaire *Sanction des études*. Les règles métier ne sont pas des choix
> d'implémentation : voir [`CLAUDE.md`](CLAUDE.md) §5 avant d'y toucher.

---

## Par où commencer

| Fichier | Pour quoi |
|---|---|
| **[`CLAUDE.md`](CLAUDE.md)** | **Le contexte permanent** — règles de travail, modèle de calcul, règles métier, standards de design, pièges déjà rencontrés. À lire avant d'écrire du code. |
| [`docs/contexte/`](docs/contexte/) | Les notes de fond : audit des documents, état de passation, conformité réglementaire. |
| [`docs/CI-CD-SETUP.md`](docs/CI-CD-SETUP.md) | La chaîne de construction et de déploiement. |
| [`docs/ROLLBACK.md`](docs/ROLLBACK.md) | Revenir en arrière quand une version pose problème. |
| [`GUIDE-INSTALLATION-SYNOLOGY.md`](GUIDE-INSTALLATION-SYNOLOGY.md) | Première installation sur le NAS. |

---

## Les sept axes

L'application s'organise par **métier**, non par table. Le menu principal porte
les axes ; le rail latéral porte les rubriques de l'axe et les outils de l'écran.

| Axe | La question à laquelle il répond |
|---|---|
| **Accueil** | « Qu'est-ce qui m'attend ? » — tableau de bord, échéancier réglementaire |
| **Étudiants** | « Où en est cet étudiant ? » — PAE et inscriptions, délibération, procédures |
| **Personnel** | attributions, dossiers, contrats, recrutement, EA12 |
| **Organisation** | « Qu'organise-t-on cette année ? » — attributions, organisations d'UE, rentrée, descriptifs, horaires |
| **Communication** | « Que dois-je produire ou envoyer ? » — listes, impressions, envois |
| **Pilotage** | dotations, ETP, budget, répartition des périodes, statistiques de délibération |
| **Configuration** | référentiels, années, établissement, modèles, sauvegardes |

---

## Ce que l'application sait faire

### Délibération

- Encodage **par acquis d'apprentissage**, par cours ou pour toute l'unité,
  au clavier ou par classeur Excel aller-retour.
- Feuille de délibération complète : acquis, cours, unité, décision, faveur.
- **Feuille de correction** — toute l'unité sur une page, pour reprendre une
  décision après un changement de note sans repasser devant chaque étudiant.
  Les écarts entre décision arrêtée et calcul sont comptés et filtrables.
- **Juin et septembre se règlent séparément** : chaque session a sa base de
  délibération, et un niveau retiré reste affiché à titre indicatif.
- Motivation par acquis, avec énoncé proposé quand la case reste vide et
  confirmation unique à la clôture.
- Quorum des deux tiers constaté à la clôture ; réouverture motivée et tracée.
- Statistiques : par section, par année d'études, par unité, par cours.

### Étudiants

- Programmes annuels (PAE), prérequis et schéma de capitalisation.
- **Passage à l'année suivante** pour une section entière : admissibilité,
  composition des programmes sur les résultats, parcours individuels imprimables.
- Détection et fusion des dossiers en double.
- Aménagements, frais de scolarité, droit d'inscription, valorisations.

### Pièces produites

Attestations de réussite, notifications d'ajournement et de refus (annexes 8-9),
procès-verbaux, grilles de délibération, listes, descriptifs d'unité, annexe 2,
fiches d'inscription, décomptes de frais, contrats, EA12, diplômes.

> ⚠️ **Chantier en cours.** Ces pièces se répartissent aujourd'hui sur neuf
> enveloppes de mise en page différentes. L'unification est décrite dans
> [`docs/contexte/audit-documents-impression.md`](docs/contexte/audit-documents-impression.md) —
> **toute nouvelle pièce part de l'enveloppe générique**, on n'en crée pas une dixième.

---

## Environnement

| | Branche | Image | Port | Base |
|---|---|---|---|---|
| **Production** | `main` | `:latest` | 10800 | réelle |
| **Développement** | `develop` | `:dev` | 10801 | copie restaurée, volume séparé |

Chaque poussée sur `develop` construit les images `:dev` ; chaque poussée sur
`main` construit `:latest`. Le fichier **`VERSION`** à la racine alimente le
badge affiché dans l'interface — le pousser **dans le même commit** que le code.

**Rien ne part en production sans validation à l'écran sur le 10801.**

### Démarrage local

```bash
cd backend  && npm install && npm start     # Express + SQLite, port 3000
cd frontend && npm install && npm run dev   # Vite
```

La base se crée seule au premier démarrage (`DB_PATH`, défaut
`backend/data/attributions.db`).

### Restaurer des données réelles en dev

Configuration → Sauvegardes → *Télécharger* en production, puis, sur le 10801,
même écran, section « Restauration de la base ». Le fichier est validé, l'état
courant sauvegardé, et l'ancienne base remise en place si la nouvelle s'avère
illisible. **La route refuse de s'exécuter hors développement.**

---

## Structure

```
├── CLAUDE.md                 le contexte permanent — à lire en premier
├── VERSION                   alimente le badge de version
├── docs/contexte/            audit, passation, conformité
├── backend/                  Express + better-sqlite3 + JWT
│   └── src/
│       ├── db/schema.sql     le socle ; le reste des tables naît des migrations
│       ├── lib/              enveloppe de document, catalogue, pied de page
│       ├── routes/           ~64 routes métier
│       └── services/         PDF, DOCX, courriel, modèles
└── frontend/                 React + Vite + Tailwind
    └── src/
        ├── components/ui.jsx système de design partagé (rail, tuiles, tableaux)
        ├── components/Axe.jsx la coquille d'un axe
        └── pages/            ~42 écrans
```

---

## Sécurité

- Authentification JWT, mots de passe hachés (bcrypt).
- Rôles : `admin`, `directeur`, `directeur_adjoint`, `editeur`, `secretariat`,
  `consultation` — avec **périmètre par section**.
- Journal des modifications.
- **Aucun secret dans le dépôt ni dans un document.** Les jetons vivent dans
  l'environnement du conteneur ou dans les secrets GitHub.

---

## Contribuer

1. Lire [`CLAUDE.md`](CLAUDE.md).
2. Travailler sur `develop`, jamais sur `main`.
3. Vérifier — banc d'essai sur une base d'essai réelle, pas une affirmation.
4. Faire valider à l'écran sur le 10801 **avant** de proposer le merge.
5. Sauvegarder la base avant tout merge vers `main`.
