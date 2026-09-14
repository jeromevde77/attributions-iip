# Installation sur le NAS Synology

> Mise en place complète de Lucie sur un Synology : environnement de production
> (`main`, port 10800) et environnement de développement (`develop`, port 10801).
>
> **L'application ne se construit plus sur le NAS.** GitHub Actions publie les
> images sur `ghcr.io` ; le NAS ne fait que les tirer. Aucun `docker build`,
> aucun code source à copier, aucun import Excel : cette page décrit l'état
> actuel, pas l'installation d'origine.

Installation sur VPS : [`GUIDE-INSTALLATION-VPS.md`](GUIDE-INSTALLATION-VPS.md).
Chaîne de construction : [`docs/CI-CD-SETUP.md`](docs/CI-CD-SETUP.md).
Retour arrière : [`docs/ROLLBACK.md`](docs/ROLLBACK.md).

---

## Prérequis

| Élément | Détail |
|---|---|
| **DSM** | 7.2 ou supérieur |
| **Container Manager** | installé via le Centre de paquets |
| **SSH** | activé (Panneau de configuration → Terminal & SNMP) |
| **Certificat** | certificat DSM (Let's Encrypt) pour le nom d'hôte servi |
| **Compte** | administrateur du NAS |

Le dépôt étant public, **aucun jeton GitHub n'est nécessaire** : ni pour tirer
les images, ni pour récupérer les fichiers de configuration.

---

## Arborescence sur le NAS

```
/volume1/docker/
├── attributions-app/              PRODUCTION — branche main, images :latest
│   ├── docker-compose.yml
│   ├── backend/data/              base réelle
│   └── scripts/auto-update.sh
├── attributions-dev/              DÉVELOPPEMENT — branche develop, images :dev
│   ├── docker-compose.dev.yml
│   ├── nginx-dev-ssl.conf
│   └── scripts/auto-update-dev.sh
├── backups-dev/                   sauvegardes dev, hors volume Docker
└── certs/                         fullchain.pem + privkey.pem recopiés de DSM
```

Deux points valent d'être compris avant de bricoler quoi que ce soit :

- **Les sauvegardes vivent hors du volume Docker.** Une sauvegarde enfermée
  dans le volume disparaîtrait avec lui, donc en même temps que la base qu'elle
  protège.
- **Les certificats sont recopiés dans `/volume1/docker/certs`.** DSM réécrit
  `system/default` à chaque renouvellement Let's Encrypt ; un montage direct sur
  ce chemin fait échouer le démarrage du conteneur.

---

## 1. Production

```bash
sudo mkdir -p /volume1/docker/attributions-app/{backend/data,scripts}
cd /volume1/docker/attributions-app

sudo curl -fsSL -o docker-compose.yml \
  https://raw.githubusercontent.com/jeromevde77/attributions-iip/main/docker-compose.yml
sudo curl -fsSL -o nginx-prod-ssl.conf \
  https://raw.githubusercontent.com/jeromevde77/attributions-iip/main/frontend/nginx-prod-ssl.conf

sudo docker compose pull
sudo docker compose up -d
sudo docker compose ps        # attributions-backend et attributions-frontend en Up
```

Le frontend termine le TLS lui-même (`10800:443`), avec le certificat DSM
recopié dans `/volume1/docker/certs` ; le routeur redirige 443 vers ce port.
Le dépôt conserve deux variantes qui **ne sont pas celle qui tourne** :
`docker-compose.synology.yml` (ancienne exposition HTTP/8080 derrière le proxy
inversé DSM) et `docker-compose.ssl.yml` (identique à la prod, mais avec le
certificat monté directement depuis `/usr/syno` — c'est précisément ce qui
cassait au renouvellement).

Le secret JWT et l'origine CORS se posent dans un fichier `.env` à côté du
compose — **jamais dans le dépôt** :

```env
JWT_SECRET=<openssl rand -hex 32>
CORS_ORIGIN=https://<nom-d-hôte-de-production>:10800
```

Un `JWT_SECRET` changé invalide les sessions ouvertes : les utilisateurs se
reconnectent, rien n'est perdu.

## 2. Développement

```bash
sudo mkdir -p /volume1/docker/attributions-dev/scripts /volume1/docker/backups-dev
cd /volume1/docker/attributions-dev

sudo curl -fsSL -o docker-compose.dev.yml \
  https://raw.githubusercontent.com/jeromevde77/attributions-iip/develop/docker-compose.dev.yml
sudo curl -fsSL -o nginx-dev-ssl.conf \
  https://raw.githubusercontent.com/jeromevde77/attributions-iip/develop/frontend/nginx-dev-ssl.conf

sudo docker compose -f docker-compose.dev.yml pull
sudo docker compose -f docker-compose.dev.yml up -d
```

> Le compose du dev ne porte pas le nom par défaut : **le drapeau `-f` est
> obligatoire** dans toutes les commandes, sans exception.

Le dev sert en HTTPS directement dans nginx (`10801:443`), avec sa propre base
(volume `attributions-data-dev`) et son propre `JWT_SECRET_DEV`.

## 3. Tâches planifiées (DSM → Planificateur de tâches)

| Tâche | Script | Fréquence |
|---|---|---|
| Mise à jour prod | `/volume1/docker/attributions-app/scripts/auto-update.sh` | toutes les 5 min |
| Mise à jour dev | `/volume1/docker/attributions-dev/scripts/auto-update-dev.sh` | toutes les 5 min |
| Rechargement certificat | `scripts/reload-ssl-cert.sh` | hebdomadaire (dim. 04:00) |

Les scripts sont dans [`scripts/`](scripts/) ; à copier sur le NAS, `chmod +x`,
exécutés en `root`. Chacun écrit son journal à côté de lui (`auto-update.log`,
`update-dev.log`, `ssl-reload.log`) et le tronque de lui-même.

`auto-update.sh` compare les identifiants d'image avant et après le `pull` et ne
redémarre que ce qui a réellement changé, puis notifie via `synodsmnotify`.
`auto-update-dev.sh` rafraîchit aussi le compose et la config nginx depuis
`develop` : toute modification locale de ces deux fichiers est donc éphémère.

> **Pas de `docker compose up` manuel pendant qu'une tâche tourne** : les deux se
> marchent dessus. Laissez le cron déployer ; comptez 2–3 minutes entre la
> poussée et l'apparition du nouveau SHA en bas de l'écran de Lucie.

## 4. Reverse proxy

DSM → Panneau de configuration → Portail de connexion → Proxy inversé : source
HTTPS/443 sur le nom d'hôte, destination `localhost` sur le port du frontend
concerné. Le certificat s'obtient dans DSM → Sécurité → Certificat → Let's
Encrypt, puis doit être recopié dans `/volume1/docker/certs` (tâche planifiée).

---

## Vérifier que l'installation est saine

1. Les conteneurs attendus tournent (`docker ps`).
2. Le **SHA affiché en bas de Lucie** correspond au dernier commit de la branche
   servie — c'est le seul contrôle de déploiement qui fait foi.
3. La connexion aboutit et le journal des modifications se remplit.
4. Configuration → Sauvegardes : le téléchargement produit un fichier lisible.

## Premier compte administrateur

```bash
sudo docker compose exec backend node scripts/seed-admin.js \
    admin@example.be "<mot de passe fort>" "Administrateur"
```

À n'utiliser qu'à la création de l'instance ou pour reprendre la main après
perte d'accès. Les comptes suivants se créent dans l'application, avec rôle et
**périmètre par section** (voir [`README.md`](README.md) §Sécurité).

## Restaurer des données réelles en dev

Configuration → Sauvegardes → *Télécharger* en production, puis, sur le 10801,
même écran, section « Restauration de la base ». Le fichier est validé, l'état
courant sauvegardé, et l'ancienne base remise en place si la nouvelle s'avère
illisible. **La route refuse de s'exécuter hors développement.**

---

## Dépannage

**« Cannot connect to the Docker daemon »** — Container Manager est arrêté :
DSM → Centre de paquets → Container Manager → Exécuter.

**« seccomp: config provided but seccomp not supported »** — les composes
portent déjà `security_opt: seccomp:unconfined` ; si l'erreur persiste, c'est
que le compose déployé sur le NAS n'est pas celui du dépôt.

**Le conteneur frontend ne démarre pas** — presque toujours le certificat :
vérifier que `/volume1/docker/certs/fullchain.pem` et `privkey.pem` existent et
sont lisibles, puis relancer.

**« Network error » / « Failed to fetch »** — vérifier les deux conteneurs
(`docker compose ps`) et les journaux du backend (`docker compose logs backend`).

**« Token invalide ou expiré »** — le `JWT_SECRET` a changé entre deux
démarrages ; se reconnecter.

**« Permission denied » sur les données** —
`sudo chown -R $USER:users /volume1/docker/attributions-app/backend/data`.

**Interroger la base** — `sqlite3` n'est pas installé dans l'image :

```bash
sudo docker exec attributions-backend node -e "
const Database = require('better-sqlite3');
const db = new Database('/app/data/attributions.db', { readonly: true });
console.log(db.prepare('SELECT COUNT(*) n FROM attribution').get());
"
```

**Horodatages décalés de deux heures** — le conteneur vit en UTC ; c'est
`TZ: Europe/Brussels` dans le compose qui corrige.

---

## Ce que ce guide ne couvre plus

L'installation d'origine — copie du code source, construction locale des images,
import de `Attributions.xlsm` et `BD_UE_COURS.xlsx` — n'a plus cours : les
données vivent dans la base et les images sont construites par GitHub Actions.
La procédure reste consultable dans l'historique du dépôt.
