# Installation sur un VPS OVH

> Déploiement de Lucie sur un VPS OVH sous Debian 12, avec Caddy en frontal pour
> le TLS. Même principe que sur le NAS : **rien ne se construit sur le serveur**,
> GitHub Actions publie les images sur `ghcr.io` et le serveur les tire.
>
> Installation sur NAS : [`GUIDE-INSTALLATION-SYNOLOGY.md`](GUIDE-INSTALLATION-SYNOLOGY.md).
> Chaîne de construction : [`docs/CI-CD-SETUP.md`](docs/CI-CD-SETUP.md).

> ⚠️ **Avant de déplacer des données réelles.** Lucie contient des données à
> caractère personnel d'étudiants et de membres du personnel. Changer
> d'hébergeur change de sous-traitant au sens de l'article 28 du RGPD : le
> registre des traitements et le contrat de sous-traitance doivent être à jour,
> et la décision validée par l'établissement, **avant** la première restauration
> de base sur le VPS. Une instance vide peut être montée et testée sans cela.

---

## Prérequis

| Élément | Détail |
|---|---|
| **VPS** | OVH VPS-2 ou supérieur, Debian 12, 2 vCPU / 4 Go / 40 Go |
| **DNS** | enregistrement A (et AAAA) pointant sur le VPS **avant** de démarrer Caddy |
| **Ports** | 22, 80 et 443 ouverts ; rien d'autre |
| **Accès** | clé SSH ; authentification par mot de passe désactivée |

Le dépôt étant public, aucun jeton GitHub n'est nécessaire pour tirer les
images ni les fichiers de configuration.

---

## 1. Préparer le serveur

```bash
apt update && apt upgrade -y
apt install -y ca-certificates curl gnupg ufw fail2ban unattended-upgrades

# Docker (dépôt officiel)
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  > /etc/apt/sources.list.d/docker.list
apt update && apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

timedatectl set-timezone Europe/Brussels
```

Pare-feu :

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp
ufw enable
```

> **UFW ne protège pas les ports publiés par Docker.** Docker écrit ses propres
> règles iptables en amont de la chaîne d'UFW : un conteneur publié sur
> `0.0.0.0` est joignable depuis Internet même avec `ufw deny`. C'est pourquoi
> le compte du frontend est publié sur `127.0.0.1:8080` et pas autrement.
> Vérifier après coup avec `ss -tlnp` : seuls 22, 80 et 443 doivent écouter sur
> une adresse publique.

## 2. Déposer l'application

```bash
mkdir -p /opt/lucie/{data,backups,scripts}
cd /opt/lucie

curl -fsSL -o docker-compose.yml \
  https://raw.githubusercontent.com/jeromevde77/attributions-iip/main/docker-compose.vps.yml
curl -fsSL -o scripts/auto-update-vps.sh \
  https://raw.githubusercontent.com/jeromevde77/attributions-iip/main/scripts/auto-update-vps.sh
chmod +x scripts/auto-update-vps.sh
```

Le fichier `.env`, à côté du compose, **jamais dans le dépôt** :

```env
JWT_SECRET=<openssl rand -hex 32>
CORS_ORIGIN=https://lucie.example.be
```

```bash
chmod 600 /opt/lucie/.env
docker compose pull
docker compose up -d
docker compose ps          # lucie-backend et lucie-frontend en Up
curl -I http://127.0.0.1:8080   # doit répondre 200
```

Le compose refuse de démarrer si `JWT_SECRET` ou `CORS_ORIGIN` manquent : c'est
volontaire, le secret par défaut du dépôt ne doit jamais se retrouver en
production.

## 3. Caddy en frontal

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
  > /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy

curl -fsSL -o /etc/caddy/Caddyfile \
  https://raw.githubusercontent.com/jeromevde77/attributions-iip/main/Caddyfile.vps
# remplacer lucie.example.be par le vrai nom d'hôte
systemctl reload caddy
```

Caddy obtient et renouvelle le certificat Let's Encrypt tout seul : **pas de
tâche de rechargement à planifier**, contrairement au NAS. Il faut en revanche
que le DNS pointe déjà sur le VPS, sinon la demande de certificat échoue et
Caddy réessaie en boucle (`journalctl -u caddy -f`).

Le proxy est réglé sur 900 s de lecture : un lot d'impression peut demander
plusieurs minutes de rendu, et une coupure à 60 s tronquerait le PDF.

## 4. Mise à jour automatique

```bash
crontab -e
# */5 * * * * /opt/lucie/scripts/auto-update-vps.sh
```

Le script compare les identifiants d'image avant et après le `pull` et ne
redémarre que ce qui a réellement changé ; il journalise dans
`/opt/lucie/auto-update.log` et tronque ce fichier au-delà de 5 Mo. Comptez
2–3 minutes entre la poussée sur `main` et l'apparition du nouveau SHA en bas
de l'écran de Lucie. **Pas de `docker compose up` manuel pendant qu'il tourne.**

## 5. Sauvegardes

La base est un fichier SQLite dans `/opt/lucie/data`. Une sauvegarde locale ne
protège de rien si le VPS disparaît : prévoir une copie **hors du serveur**.

```bash
# /opt/lucie/scripts/backup.sh — quotidien, 03:00
STAMP=$(date +%Y%m%d-%H%M)
docker exec lucie-backend node -e "
const Database = require('better-sqlite3');
new Database('/app/data/attributions.db').backup('/app/data/backups/attributions-$STAMP.db');
"
find /opt/lucie/backups -name 'attributions-*.db' -mtime +30 -delete
```

`.backup()` prend une copie cohérente base ouverte ; un `cp` du fichier pendant
une écriture donne une base tronquée. Ajouter ensuite une synchronisation vers
un espace distant (OVH Object Storage, rsync vers le NAS) sur
`/opt/lucie/backups`.

Souscrire en complément l'option **snapshot** ou **sauvegarde automatisée** OVH
sur le VPS : elle couvre le système, pas la cohérence de la base.

## 6. Reprise des données depuis le NAS

1. Sur le NAS, Configuration → Sauvegardes → *Télécharger*.
2. Vérifier que l'approbation article 28 est acquise (voir l'avertissement en tête).
3. Déposer le fichier sur le VPS (`scp`), puis restaurer par l'écran
   Configuration → Sauvegardes de l'instance VPS.
4. Contrôler le nombre d'étudiants, d'attributions et le journal des
   modifications **avant** de basculer le DNS de production.

---

## Vérifier que l'installation est saine

1. `docker compose ps` : les deux conteneurs en `Up`.
2. `ss -tlnp` : rien d'autre que 22, 80 et 443 sur adresse publique.
3. `https://<nom-d-hôte>` répond avec un certificat valide.
4. Le **SHA affiché en bas de Lucie** correspond au dernier commit de `main`.
5. Configuration → Sauvegardes : le téléchargement produit un fichier lisible.

## Premier compte administrateur

```bash
docker compose exec backend node scripts/seed-admin.js \
    admin@example.be "<mot de passe fort>" "Administrateur"
```

À n'utiliser qu'à la création de l'instance ou pour reprendre la main après
perte d'accès.

---

## Dépannage

**Caddy boucle sur l'obtention du certificat** — DNS pas encore propagé, ou port
80 fermé : `dig +short <nom-d-hôte>` puis `journalctl -u caddy -f`.

**502 derrière Caddy** — le frontend n'écoute pas : `curl -I http://127.0.0.1:8080`
et `docker compose logs frontend`.

**« Network error » dans l'application** — `CORS_ORIGIN` ne correspond pas à
l'URL réellement utilisée (schéma et sous-domaine compris).

**« Token invalide ou expiré »** — le `JWT_SECRET` a changé entre deux
démarrages ; se reconnecter.

**Interroger la base** — `sqlite3` n'est pas installé dans l'image :

```bash
docker exec lucie-backend node -e "
const Database = require('better-sqlite3');
const db = new Database('/app/data/attributions.db', { readonly: true });
console.log(db.prepare('SELECT COUNT(*) n FROM attribution').get());
"
```

**Horodatages décalés de deux heures** — le conteneur vit en UTC ; c'est
`TZ: Europe/Brussels` dans le compose qui corrige.

---

## Différences avec le NAS

| | Synology | VPS OVH |
|---|---|---|
| TLS | certificat DSM monté en volume, rechargé par tâche hebdomadaire | Caddy, renouvellement automatique |
| Publication | `10800:443` sur nginx | `127.0.0.1:8080` derrière Caddy |
| Mise à jour | Planificateur de tâches DSM | `cron` |
| Sauvegarde | volume NAS + synchronisation nuage | `/opt/lucie/backups` + copie hors serveur **obligatoire** |
| Pare-feu | routeur + DSM | UFW, avec la réserve Docker/iptables |
