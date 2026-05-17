# Guide d'installation sur Synology — Attributions IIP

> Guide pas-à-pas pour déployer l'application sur votre Synology NAS via Container Manager.
> Durée estimée : 30-45 minutes la première fois.

---

## 📋 Prérequis

| Élément | Détail |
|---|---|
| **DSM** | Version 7.2 ou supérieure |
| **Container Manager** | Installé via le Centre de paquets (anciennement "Docker") |
| **SSH** | Activé (Panneau de configuration → Terminal & SNMP → Activer SSH) |
| **Fichiers** | Vos `Attributions.xlsm` et `BD_UE_COURS.xlsx` |
| **Compte utilisateur** | Avec droits administrateur sur le NAS |

---

## 🚀 Installation en 8 étapes

### Étape 1 — Préparer le dossier sur le NAS

Connectez-vous en SSH au NAS :

```bash
ssh votre-user@nas-ip
```

Créez le dossier de l'application :

```bash
sudo mkdir -p /volume1/docker/attributions-app
sudo chown $USER:users /volume1/docker/attributions-app
cd /volume1/docker/attributions-app
```

### Étape 2 — Copier les fichiers du projet

**Option A — Via File Station (le plus simple)** :

1. Dézippez `attributions-app.zip` sur votre PC
2. Ouvrez File Station sur DSM
3. Naviguez vers `docker/attributions-app/`
4. Glissez-déposez tout le contenu du zip (les dossiers `backend/`, `frontend/`, le `docker-compose.yml`, le `README.md`, etc.)

**Option B — Via SCP depuis votre PC** :

```bash
# Depuis votre PC (pas le NAS)
scp -r ./attributions-app/* votre-user@nas-ip:/volume1/docker/attributions-app/
```

Vérifiez (en SSH sur le NAS) :

```bash
cd /volume1/docker/attributions-app
ls -la
# Vous devez voir : backend/  frontend/  docker-compose.yml  README.md  .env.example
```

### Étape 3 — Placer vos fichiers Excel sources

```bash
# Toujours en SSH dans /volume1/docker/attributions-app
ls backend/data/
# Devrait montrer Attributions.xlsm et BD_UE_COURS.xlsx
# Si ce n'est pas le cas, copiez-les via File Station dans backend/data/
```

### Étape 4 — Configurer l'environnement

Générez un secret JWT robuste :

```bash
# Sur le NAS
openssl rand -base64 48
# → copiez la chaîne générée
```

Créez le fichier `.env` :

```bash
cp .env.example .env
nano .env
```

Modifiez ces 3 lignes (sauvegardez avec `Ctrl+O`, `Entrée`, `Ctrl+X`) :

```env
JWT_SECRET=COLLEZ-ICI-LE-SECRET-GENERE-PLUS-HAUT
HTTP_PORT=8080
CORS_ORIGIN=http://nas-ip:8080
```

Si vous prévoyez d'utiliser HTTPS via reverse proxy (étape 8), mettez plutôt :
```env
CORS_ORIGIN=https://attributions.institut-prigogine.be
```

### Étape 5 — Construire et démarrer les conteneurs

```bash
# Construction (5-10 min la première fois — télécharge node:20-alpine et nginx:alpine)
sudo docker compose build

# Démarrage
sudo docker compose up -d
```

Vérifiez que les deux conteneurs tournent :

```bash
sudo docker compose ps
```

Vous devez voir :
```
NAME                       STATUS         PORTS
attributions-backend       Up (healthy)
attributions-frontend      Up (healthy)   0.0.0.0:8080->80/tcp
```

### Étape 6 — Initialiser la base et importer vos données

```bash
# 1. Créer le schéma SQLite (14 tables + 2 vues)
sudo docker compose exec backend npm run init-db

# 2. Importer Attributions.xlsm + BD_UE_COURS.xlsx
sudo docker compose exec backend npm run import-excel

# Vous devriez voir quelque chose comme :
#   [import] UE: 120
#   [import] Cours: 236
#   [import] Professeurs: 131
#   [import] Attributions: 435
#   ✅ Import terminé avec succès.
```

### Étape 7 — Créer votre compte administrateur

```bash
sudo docker compose exec backend node scripts/seed-admin.js \
    admin@example.be \
    UnMotDePasseFort2026! \
    "Admin Démo"
```

✅ Votre application est accessible sur **http://nas-ip:8080**

Première connexion :
- Email : `admin@example.be`
- Mot de passe : celui choisi ci-dessus

### Étape 8 (optionnel mais recommandé) — Reverse proxy HTTPS

Pour exposer l'application sous une vraie URL avec certificat Let's Encrypt, comme `rgpd.domobel.be` :

1. **DSM → Panneau de configuration → Portail de connexion → Avancé → Proxy inversé → Créer**
2. Remplissez :

   | Champ | Valeur |
   |---|---|
   | **Description** | Attributions IIP |
   | **Source — Protocole** | HTTPS |
   | **Source — Nom d'hôte** | `attributions.domobel.be` (ou autre) |
   | **Source — Port** | 443 |
   | **Destination — Protocole** | HTTP |
   | **Destination — Nom d'hôte** | localhost |
   | **Destination — Port** | 8080 |

3. **DSM → Sécurité → Certificat → Ajouter → Let's Encrypt** pour le sous-domaine
4. Modifiez `.env` :
   ```env
   CORS_ORIGIN=https://attributions.domobel.be
   ```
5. Redémarrez : `sudo docker compose restart`

---

## 🔧 Opérations courantes

### Voir les logs

```bash
cd /volume1/docker/attributions-app
sudo docker compose logs -f          # tout
sudo docker compose logs backend     # backend seulement
sudo docker compose logs frontend    # frontend seulement
```

### Redémarrer après modification

```bash
sudo docker compose restart
```

### Mettre à jour les Excel sources

Quand la FWB met à jour `BD_UE_COURS.xlsx`, ou quand vous voulez réimporter :

```bash
# 1. Sauvegardez la base actuelle (au cas où)
cp backend/data/attributions.db backend/data/attributions-$(date +%Y%m%d).db.bak

# 2. Remplacez le fichier source dans backend/data/

# 3. Relancez l'import (ATTENTION : écrase les UE et cours, conserve les attributions)
sudo docker compose exec backend npm run import-excel
```

### Sauvegarde automatique (recommandé)

Créez une tâche planifiée dans DSM :

1. **Panneau de configuration → Planificateur de tâches → Créer → Tâche planifiée → Script personnalisé**
2. **Général** : Nom = "Backup Attributions IIP", utilisateur = `root`
3. **Planification** : Tous les jours à 3h00
4. **Script** :

```bash
DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR=/volume1/docker/attributions-app/backups
mkdir -p $BACKUP_DIR

# Sauvegarder la DB (en utilisant l'utilitaire sqlite3 du conteneur)
docker compose -f /volume1/docker/attributions-app/docker-compose.yml exec -T backend \
    sqlite3 /app/data/attributions.db ".backup /app/data/backup-$DATE.db"

# Déplacer dans le dossier backups
mv /volume1/docker/attributions-app/backend/data/backup-$DATE.db $BACKUP_DIR/

# Supprimer les backups de plus de 30 jours
find $BACKUP_DIR -name "backup-*.db" -mtime +30 -delete

echo "Backup $DATE OK"
```

### Restaurer une sauvegarde

```bash
cd /volume1/docker/attributions-app
sudo docker compose stop backend
cp backups/backup-AAAAMMJJ-HHMMSS.db backend/data/attributions.db
sudo docker compose start backend
```

### Mettre à jour l'application (nouvelle version du code)

```bash
cd /volume1/docker/attributions-app

# 1. Sauvegarde
cp backend/data/attributions.db backend/data/attributions-pre-update.db.bak

# 2. Récupérer la nouvelle version (selon comment vous distribuez)
# (remplacer les fichiers depuis le nouveau zip, sauf backend/data/)

# 3. Rebuild
sudo docker compose down
sudo docker compose build
sudo docker compose up -d
```

### Réinitialiser un mot de passe utilisateur (en urgence)

Si quelqu'un perd son mot de passe et que l'admin n'est pas disponible :

```bash
# Régénère le compte admin avec un nouveau MDP
sudo docker compose exec backend node scripts/seed-admin.js \
    admin@institut-prigogine.be NouveauMotDePasse "Admin"
```

---

## 👥 Gestion des accès pour le secrétariat

Depuis votre compte admin, allez dans le menu **Utilisateurs** :

| Rôle | Permissions |
|---|---|
| **admin** | Tout — y compris gestion utilisateurs |
| **editeur** | Voir + créer/modifier/supprimer attributions |
| **consultation** | Lecture seule (parfait pour les enseignants ou la direction) |

Pour créer un compte secrétariat :
1. Cliquez sur **➕ Nouvel utilisateur**
2. Renseignez nom, email et mot de passe initial
3. Choisissez **Éditeur**
4. Communiquez les identifiants à votre secrétariat

L'utilisateur pourra changer son mot de passe (à venir dans une v3) ou vous demander de le réinitialiser depuis la liste.

---

## 🛠 Dépannage

### "Cannot connect to the Docker daemon"
→ Container Manager n'est pas démarré. DSM → Centre de paquets → Container Manager → Exécuter.

### Erreur "seccomp: config provided but seccomp not supported"
Symptôme : `runc run failed: unable to start container process: seccomp: config provided but seccomp not supported` pendant le `docker compose build`.

Cause : votre Synology a un noyau Linux compilé sans support seccomp (cas sur les modèles plus anciens ou certaines architectures ARM). Docker tente d'appliquer un profil de sécurité que le noyau refuse.

**Solution recommandée — Désactiver seccomp au niveau du démon Docker Synology :**

```bash
# 1. Arrêter Container Manager via DSM (Centre de paquets → Container Manager → Arrêter)

# 2. Éditer la config du démon Docker en SSH
sudo vi /var/packages/ContainerManager/etc/dockerd.json
```

Ajouter ou modifier ces lignes (le fichier doit contenir un JSON valide) :
```json
{
  "seccomp-profile": "",
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

Puis :
```bash
# 3. Redémarrer Container Manager via DSM
# 4. Relancer le build
cd /volume1/docker/attributions-app/
sudo docker compose build --no-cache
sudo docker compose up -d
```

**Solution complémentaire — `security_opt: seccomp:unconfined`** :

Le `docker-compose.yml` fourni inclut déjà `security_opt: ["seccomp:unconfined"]` pour les deux conteneurs au **runtime**. Cela règle le problème quand on lance les conteneurs, mais pas pendant le `RUN` du build. C'est pour ça qu'il faut **aussi** la config du démon ci-dessus.

**Pour vérifier que seccomp est bien désactivé** :
```bash
sudo docker info 2>&1 | grep -i seccomp
# Si seccomp est désactivé : pas de ligne "seccomp", ou "Profile: unconfined"
```

### Erreur "apk add" / "apt-get update"
Symptôme : `ERROR [backend stage-1 X/X] RUN apk add ...` ou problèmes DNS pendant `apt-get update`.

Cause : le Docker du Synology n'arrive pas à résoudre ou atteindre les dépôts des paquets système.

**Solution 1 — Forcer le DNS Docker :**
```bash
# Éditer le daemon Docker (créer le fichier s'il n'existe pas)
sudo nano /var/packages/ContainerManager/etc/dockerd.json
```

Ajouter ou modifier :
```json
{
  "dns": ["8.8.8.8", "1.1.1.1"]
}
```

Puis redémarrer Container Manager via DSM (Centre de paquets → Container Manager → Arrêter / Exécuter).

**Solution 2 — Vérifier la connectivité depuis le conteneur :**
```bash
# Tester si Docker peut atteindre le réseau
sudo docker run --rm node:20-bookworm-slim ping -c 2 deb.debian.org
sudo docker run --rm node:20-bookworm-slim apt-get update
```

Si le ping passe mais `apt-get` échoue, c'est probablement un proxy d'entreprise — voir le wiki Synology pour configurer `HTTP_PROXY` dans Docker.

**Solution 3 — Construire en deux temps :**
```bash
# Forcer le pull des images Docker en premier
sudo docker pull node:20-bookworm-slim
sudo docker pull nginx:stable

# Puis lancer le build
sudo docker compose build
```

### Le frontend affiche "Network error" / "Failed to fetch"
→ Vérifiez que les deux conteneurs tournent : `sudo docker compose ps`
→ Vérifiez les logs backend : `sudo docker compose logs backend`

### "Token invalide ou expiré"
→ Le JWT_SECRET a changé entre deux démarrages. Reconnectez-vous.

### "Permission denied" sur les fichiers
```bash
sudo chown -R $USER:users /volume1/docker/attributions-app/backend/data
sudo chmod 755 /volume1/docker/attributions-app/backend/data
```

### better-sqlite3 ne se compile pas
→ Très rare avec l'image Debian (prebuilds binaires fournis). Si jamais : vérifier que le Dockerfile installe bien `python3 make g++` dans l'étape `deps`. Sur Synology ARM, ajouter `--platform linux/amd64` à `sudo docker compose build` n'aide pas (votre Node tournerait alors en émulation). Préférer signaler le problème pour analyse.

### Vérifier le contenu de la base
```bash
sudo docker compose exec backend sqlite3 /app/data/attributions.db \
    "SELECT section, COUNT(*) FROM attribution GROUP BY section;"
```

---

## 📊 Vérifications post-installation

Une fois connecté à l'application, vérifiez :

1. **Tableau de bord** : doit afficher ~435 attributions, ~9 300 périodes IIP, ~2 800 périodes HELB
2. **Attributions** : la grille doit lister vos 435 lignes
3. **Professeurs** : 131 enseignants, dont Prof Démo en tête avec 448 périodes IIP
4. **Pilotage** : tableaux par section/niveau remplis, avec TIM en tête à 4 911 périodes
5. **Planning** : tableau 43 semaines, Prof Démo a 217h placées

Si l'un de ces chiffres diffère grossièrement, contactez-moi pour diagnostic.

---

## 📦 Que contient la base ?

| Table | Lignes attendues | Source Excel |
|---|---|---|
| `ue` | ~120 | BD_UE_COURS.xlsx onglet UE |
| `cours` | ~236 | BD_UE_COURS.xlsx onglet Cours |
| `aa` | ~259 | BD_UE_COURS.xlsx onglet AA |
| `professeur` | ~131 | Coordonnées_professeurs |
| `attribution` | ~435 | Attributions.xlsm onglet Attributions |
| `planning_hebdo` | ~514 | Colonnes "Semaine 0..42" de Attributions |
| `local` | ~55 | Locaux |
| `ue_inscription` | ~105 | UE_inscriptions |
| `section` | 11 | Déduit |
| `parametre_financier` | 17 | Constantes (DI FWB, FC, FI Mobile, coefs) |
| `type_encadrement` | 11 | Listes encadrement |
| `cle_ecampus` | ~14 | Clé eCampus (année 24-25) |

---

Bonne installation. Tout est testé sur vos vraies données : les chiffres affichés dans l'app correspondront à votre Excel actuel.
