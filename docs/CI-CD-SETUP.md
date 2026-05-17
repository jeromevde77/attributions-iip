# Configuration du déploiement automatique

À chaque `git push` sur la branche `main`, GitHub Actions construit les images Docker et les publie sur GitHub Container Registry (ghcr.io). Le Synology les récupère ensuite via une tâche planifiée toutes les 5 minutes.

## 1. Côté GitHub — rien à faire

Le fichier `.github/workflows/build.yml` est déjà dans le repo. Au premier push après son ajout, GitHub Actions se lance automatiquement.

**Vérifier que ça marche** : aller sur https://github.com/jeromevde77/attributions-iip/actions

## 2. Rendre les images privées accessibles au Synology

Par défaut, les images publiées sur ghcr.io héritent de la visibilité du repo (privé donc privées). Le Synology aura besoin d'un token pour les télécharger.

### Créer un Personal Access Token (PAT) classique avec scope `read:packages`

1. https://github.com/settings/tokens/new
2. **Note** : `synology-pull-attributions`
3. **Expiration** : 1 an (ou aucune)
4. **Cocher** : `read:packages` uniquement
5. Cliquer **Generate token**
6. **Copier le token** (commence par `ghp_...`)

### Login Docker sur le Synology

```bash
# En SSH sur le Synology
echo "VOTRE-TOKEN" | sudo docker login ghcr.io -u jeromevde77 --password-stdin
```

Vous devez voir `Login Succeeded`. Le token est sauvegardé dans `~/.docker/config.json` du root, donc plus besoin de le retaper.

## 3. Migrer le docker-compose.yml du Synology

Le compose actuel contient `build: ./backend` et `build: ./frontend`. On le remplace par celui qui pointe vers les images ghcr.io.

```bash
cd /volume1/docker/attributions-app/

# Sauvegarder l'ancien
sudo cp docker-compose.yml docker-compose.yml.local-build

# Mettre le nouveau (le fichier est dans le repo sous docker-compose.synology.yml)
# Via File Station, déposer ce fichier en tant que docker-compose.yml
```

Ou directement :

```bash
sudo curl -fsSL \
  -H "Authorization: token VOTRE-TOKEN-READONLY" \
  -o /volume1/docker/attributions-app/docker-compose.yml \
  https://raw.githubusercontent.com/jeromevde77/attributions-iip/main/docker-compose.synology.yml
```

## 4. Premier pull manuel et démarrage

```bash
cd /volume1/docker/attributions-app/
sudo docker compose pull
sudo docker compose up -d
sudo docker compose ps
```

Les deux conteneurs doivent passer en `Up`.

## 5. Planifier l'auto-update toutes les 5 minutes

### Copier le script sur le Synology

```bash
cd /volume1/docker/attributions-app/
sudo mkdir -p scripts
sudo cp scripts/auto-update.sh scripts/

# Si le script n'est pas dans votre dossier, le télécharger :
sudo curl -fsSL \
  -H "Authorization: token VOTRE-TOKEN-READONLY" \
  -o scripts/auto-update.sh \
  https://raw.githubusercontent.com/jeromevde77/attributions-iip/main/scripts/auto-update.sh

sudo chmod +x scripts/auto-update.sh
```

### Créer la tâche planifiée DSM

1. **DSM → Panneau de configuration → Planificateur de tâches**
2. **Créer → Tâche planifiée → Script personnalisé**
3. **Général** :
   - Nom : `Attributions IIP — auto-update`
   - Utilisateur : `root`
4. **Programmer** :
   - Exécuter le : tous les jours
   - Première heure de fonctionnement : `00:00`
   - Fréquence : **Toutes les 5 minutes**
   - Dernière heure de fonctionnement : `23:55`
5. **Paramètres de tâche** :
   - Script :
     ```bash
     /volume1/docker/attributions-app/scripts/auto-update.sh
     ```

### Tester immédiatement

Clic droit sur la tâche → **Exécuter**. Puis :

```bash
tail -f /volume1/docker/attributions-app/auto-update.log
```

S'il y a une mise à jour disponible, vous verrez quelque chose comme :
```
[2026-05-17 14:23:01] Nouvelle version FRONTEND détectée — restart
[2026-05-17 14:23:08] Mise à jour terminée
```

## 6. Workflow final

```
Mac → git push origin main
         ↓ (5 min)
GitHub Actions → ghcr.io
         ↓ (max 5 min)
Synology pull → restart auto
```

Total : application à jour 5-10 min après le push.

## Dépannage

### Le workflow GitHub Actions échoue

Vérifier sur https://github.com/jeromevde77/attributions-iip/actions, cliquer sur le run en rouge, voir l'erreur. Les causes les plus fréquentes :
- Erreur de syntaxe dans le code → corriger localement et `git push` à nouveau
- Quota Actions dépassé → attendre le mois suivant ou passer en plan payant

### Le pull manuel sur le Synology échoue avec "unauthorized"

Le token Synology est mauvais ou expiré. Refaire l'étape 2 (docker login).

### L'auto-update tourne mais ne fait rien

C'est normal s'il n'y a pas de nouvelle image. Vérifiez :
```bash
docker image inspect ghcr.io/jeromevde77/attributions-backend:latest --format='{{.Created}}'
```

Compare avec la date du dernier push GitHub.

### Voir le log d'auto-update

```bash
tail -50 /volume1/docker/attributions-app/auto-update.log
```

## Sécurité

- **Token Synology** : scope `read:packages` uniquement (pas de write, pas d'accès au code)
- **Token GitHub Actions** : `secrets.GITHUB_TOKEN` automatique, propre à chaque run, pas à gérer
- **Images privées** : héritent de la visibilité du repo (privé)
- **Pas d'exposition** du Synology sur Internet : c'est lui qui sort, pas l'inverse
