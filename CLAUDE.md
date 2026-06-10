# Contexte projet — Institut Ilya Prigogine (IIP)

## Qui suis-je

Jérôme (jeromevde77), administrateur et développeur à l’Institut Ilya Prigogine (IIP), établissement belge d’enseignement supérieur de promotion sociale à Bruxelles (réseau FELSI).

-----

## Projets en cours

### 1. Lucie / GestIIP

Application web de gestion des attributions, staffing, horaires et procédures administratives de l’IIP.

**Stack**

- Frontend : React + Vite, `@tabler/icons-react` (installé avec `--legacy-peer-deps` à cause de TipTap), TipTap v3.x
- Backend : Node.js + Express + better-sqlite3
- Infrastructure : Synology NAS, Docker Compose, GitHub Actions, GHCR (`ghcr.io/jeromevde77/`)

**URLs**

- Prod : `https://server.domobel.be:10800`
- Dev : `https://server.domobel.be:10801`

**Repo** : `jeromevde77/attributions-iip` (privé)

**Déploiement**

1. Push sur `develop` → GitHub Actions build image `:dev`
1. NAS cron (toutes les minutes, lag ~2-3 min) pull via `auto-update.sh` depuis GHCR
1. Valider sur dev (port 10801)
1. Merger sur `main` pour prod

**Containers Docker sur le NAS**

- Prod : `/volume1/docker/attributions-app/` → `attributions-frontend`, `attributions-backend`
- Dev : `/volume1/docker/attributions-dev/` → `attributions-frontend-dev`, `attributions-backend-dev`
- Commandes Docker sur NAS nécessitent `sudo`

**Base de données**

- Fichier : `/app/data/attributions.db` (dans le container backend)
- Pas de CLI sqlite3 dans le container → utiliser `node -e "const db = require('better-sqlite3')('/app/data/attributions.db'); ..."`
- Backups auto dans `data/backups-auto/` avant opérations destructives

**Vérification version déployée**

- SHA court affiché en bas de l’interface Lucie

-----

### 2. eID Reader

Application Electron (Mac/Windows) qui lit les cartes d’identité belges et alimente Lucie.

**Repo** : `jeromevde77/eid-app` (public)

- HTTPS local sur `localhost:9140` (cert auto-signé ajouté au Keychain macOS)
- BEIDToken.app tué avant chaque lecture sur macOS
- GitHub Actions : workflow Mac universal DMG + Windows EXE déjà committé
- **TODO** : build Windows → `git tag v1.0.0 && git push --tags`

-----

## État actuel des chantiers

- **Uniformisation emoji → icônes Tabler** : ~278 occurrences restantes dans ~30 fichiers (prérequis pour v2.0)
- **Accès Lucie / Membres du personnel** : redesign approuvé, pas encore implémenté
  - Renommer onglet “Professeurs” → “Membres du personnel”
  - Lier `utilisateur` à `professeur` via `professeur_id`
  - Panel “Accès Lucie” par personne (activer/désactiver, rôle, sections, mot de passe unique)
  - Email format `prenom.nom@institut-prigogine.be`
- **Procédures recours** : template `pv-recours-25-26` créé en DB pour l’année 2025-2026 (ROI/RGE Art. 65-68), à tester avant merge sur main

-----

## Pièges connus

- **Ordre des routes Express** : routes spécifiques AVANT les routes paramétriques (ex: `GET /annees-par-section` avant `GET /:id`)
- **React falsy rendering** : utiliser `{!!value && <Component />}` pas `{value && <Component />}` (évite le rendu du `0`)
- **`git pull -X theirs`** : DANGEREUX — écrase les changements locaux silencieusement
- **Safari `document.write()` après `await`** : page blanche à l’impression → utiliser `PreviewModal` avec iframe
- **SQLite migrations** : `ALTER TABLE ... ADD COLUMN col TEXT UNIQUE` non supporté → `PRAGMA table_info` + `ALTER TABLE` sans UNIQUE
- **GitHub Actions tags** : le workflow doit être commité AVANT de créer le tag
- **TipTap v3** : `commandManager.can()` nécessite optional chaining (`?.`)
- **CORS eID Reader** : origin dev `https://server.domobel.be:10801` (avec port) doit être explicitement listée

-----

## Identité visuelle IIP (documents Word/PDF)

- Bleu foncé : `#1F3864`
- Bleu moyen : `#2E5C9E`
- Bleu clair : `#D9E2F3`
- Or : `#C9A84C`
- Police : Arial
- Librairie : `docx` (Node.js)

-----

## GitHub

- Repo : `jeromevde77/attributions-iip` (privé)
- Token disponible en mémoire Claude (ne pas demander à Jérôme)
- Branche de travail : `develop` → merger sur `main` après validation

-----

## Contacts IIP

- Charles Sohet : Directeur a.i.
- Nicolas Vandecauter : Direction adjointe / RH

-----

## Cadre légal

- Décret du 16 avril 1991 (enseignement de promotion sociale)
- A.Gt 22-11-2002
- A.Gt 27-10-2022 (dérogations COVID)
- Co-diplomation avec HELB
- ROI/RGE 2024 utilisé pour l’année 2025-2026 (procédure temporaire)
- Nouveau RDE/ROI utilisé à partir de 2026-2027

-----

## Conventions de travail

- Langue : français
- Diagnostic avant solution — ne pas sauter aux conclusions
- Icônes : actions neutres → monochrome ; destructif → rouge ; badges statut → colorés ; navigation → monochrome avec couleur sur état actif