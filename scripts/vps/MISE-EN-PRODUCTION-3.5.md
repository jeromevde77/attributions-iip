# Mise en production 3.5.001 et installation de l'espace des étudiants — pas à pas (Jérôme)

Rédigé le 30 octobre 2026 pour la version **3.5.001** (`main` = `develop`).
Tout se fait sur le VPS, sous `<compte-jerome>`, dans `/opt/lucie`. **Une commande à la fois** : on lit la réponse
avant de passer à la suivante.

Les noms réels des comptes ne s'écrivent pas ici : `<compte-admin>` est le compte d'origine OVH (celui qui détient
l'identifiant du registre des images), `<compte-jerome>` est le tien.

---

## Ce qui change

| | Avant | Après |
|---|---|---|
| Lucie (personnel) | 3.1.496 | **3.5.001** |
| Espace des étudiants | n'existe pas | **etudiants.lucie-iip.be** (et `etudiants-dev.lucie-iip.be`) |
| Ce que voient les étudiants | — | **rien** : toutes les fonctions naissent éteintes |
| Rappels par courriel | — | éteints (Configuration → Courriels → Rappels) |
| Présence par QR | allumée | **éteinte** (Configuration → Accès → Mise en service) |

L'espace est mis en ligne mais **pas annoncé**. Charles allume les fonctions une à une, d'abord en essai pour quelques
étudiants désignés, depuis Configuration → Accès → **Mise en service**. Tant qu'aucune fonction n'est ouverte pour un
étudiant, il ne peut même pas entrer.

**Le mur** : l'espace a ses propres conteneurs, sa propre base (`portail.db`), son propre réseau Docker
(`lucie-portail`) et ses propres secrets. Aucun conteneur de Lucie n'est sur son réseau ; seul Caddy touche les deux.
C'est Lucie qui va vers l'espace (par `http://caddy:8443`, port non publié, avec un jeton), jamais l'inverse.

---

## Étape 0 — Sauvegarder la base de production

```bash
cd /opt/lucie
cp prod/data/attributions.db prod/backups/avant_merge_$(date +%Y%m%d).db
ls -lh prod/backups/avant_merge_*.db | tail -1
```

La dernière ligne doit montrer le fichier du jour, d'une taille comparable aux précédents.

Garder aussi les deux fichiers de configuration actuels (on les remplace à l'étape 4) :

```bash
sudo cp /opt/lucie/docker-compose.yml /opt/lucie/docker-compose.yml.avant-3.5
sudo cp /opt/lucie/Caddyfile /opt/lucie/Caddyfile.avant-3.5
```

---

## Étape 1 — Les deux adresses (DNS)

Chez le gestionnaire du domaine `lucie-iip.be`, deux enregistrements **A** vers l'adresse IP du VPS (la même que
`www.lucie-iip.be`) :

- `etudiants.lucie-iip.be`
- `etudiants-dev.lucie-iip.be`

Vérifier (peut prendre quelques minutes) :

```bash
getent hosts etudiants.lucie-iip.be etudiants-dev.lucie-iip.be www.lucie-iip.be
```

Les trois lignes doivent donner la même adresse. Caddy obtiendra seul les certificats à l'étape 5.

---

## Étape 2 — Quatre secrets, AVANT de toucher au docker-compose

Le nouveau `docker-compose.yml` **refuse de démarrer quoi que ce soit** tant que ces quatre valeurs manquent dans
`/opt/lucie/.env` — même une simple mise à jour de Lucie. Elles doivent donc y être d'abord.

Fabriquer **quatre valeurs différentes**, une par commande (ne jamais réutiliser l'une pour l'autre, ne les écrire
nulle part ailleurs que dans `.env`) :

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

S'il n'y a pas `node` sur l'hôte : `openssl rand -hex 24`.

Les ajouter à la fin de `/opt/lucie/.env` (`sudo nano /opt/lucie/.env`) :

```
PORTAIL_SECRET_PROD=<valeur 1>
PORTAIL_JETON_PROD=<valeur 2>
PORTAIL_SECRET_DEV=<valeur 3>
PORTAIL_JETON_DEV=<valeur 4>
```

- `PORTAIL_SECRET_*` signe les sessions des étudiants : il ne sert qu'à l'espace.
- `PORTAIL_JETON_*` est partagé par Lucie et l'espace : c'est la clé du passage.
- Un secret et un jeton doivent différer (l'espace refuse de démarrer sinon).

Vérifier qu'ils sont là, sans les afficher :

```bash
sudo grep -c '^PORTAIL_\(SECRET\|JETON\)_\(PROD\|DEV\)=.\{32,\}' /opt/lucie/.env
```

Réponse attendue : **4**.

---

## Étape 3 — Les dossiers de données de l'espace

Les conteneurs de l'espace ne tournent pas en root (utilisateur 1000) :

```bash
sudo mkdir -p /opt/lucie/portail/data /opt/lucie/portail-dev/data
sudo chown -R 1000:1000 /opt/lucie/portail /opt/lucie/portail-dev
```

---

## Étape 4 — Les fichiers de configuration de référence

Le dépôt porte les copies de référence : `docker-compose.vps.yml` et `Caddyfile.vps`. Les récupérer depuis `main`
(par un clone, ou en téléchargeant les deux fichiers depuis GitHub), puis :

```bash
sudo cp docker-compose.vps.yml /opt/lucie/docker-compose.yml
sudo cp Caddyfile.vps /opt/lucie/Caddyfile
```

Regarder ce qui change par rapport à l'ancien, avant d'aller plus loin :

```bash
sudo diff /opt/lucie/docker-compose.yml.avant-3.5 /opt/lucie/docker-compose.yml
sudo diff /opt/lucie/Caddyfile.avant-3.5 /opt/lucie/Caddyfile
```

On doit y voir : les services `portail-backend`, `portail-frontend`, `portail-backend-dev`, `portail-frontend-dev`,
les réseaux `lucie-portail` et `lucie-portail-dev`, Caddy branché sur eux, les variables `PORTAIL_*` dans les deux
backends de Lucie ; dans le Caddyfile, les blocs `etudiants…` et les ports internes `:8443` / `:8444`.
**Si le diff montre autre chose** (un réglage fait sur le VPS et absent du dépôt), s'arrêter et le reporter dans le
nouveau fichier — le dépôt doit décrire ce qui tourne.

Contrôler que le fichier se lit (aucun secret ne s'affiche avec `--quiet`) :

```bash
cd /opt/lucie && sudo docker compose config --quiet && echo "compose OK"
```

---

## Étape 5 — La dev d'abord

Images privées : `sudo` seul ne suffit pas, l'identifiant du registre est celui de `<compte-admin>`.

```bash
cd /opt/lucie
sudo DOCKER_CONFIG=/home/<compte-admin>/.docker docker compose pull backend-dev frontend-dev portail-backend-dev portail-frontend-dev
sudo docker compose up -d --force-recreate caddy backend-dev frontend-dev portail-backend-dev portail-frontend-dev
```

Vérifier :

```bash
sudo docker ps --format '{{.Names}}  {{.Status}}' | sort
curl -s https://dev.lucie-iip.be/api/version
curl -s https://etudiants-dev.lucie-iip.be/api/portail/sante
curl -s -o /dev/null -w '%{http_code}\n' https://etudiants-dev.lucie-iip.be/api/etudiants
sudo docker logs attributions-backend-dev 2>&1 | grep -i portail | tail -3
```

Attendu :
- tous les conteneurs « Up », aucun nom provisoire du genre `3b187e036e7d_…` (sinon `sudo docker rename`) ;
- la version de la dev commence par `3.5.001` (suivie de `-dev`) ;
- `sante` répond `{"ok":true,…}` (les listes de la Belgique viennent à l'étape 7 : à zéro pour l'instant, c'est normal) ;
- l'adresse des étudiants qui imite une route de Lucie répond **404** : rien de Lucie n'est joignable par là ;
- le journal de Lucie ne dit **plus** « [portail] non configuré ».

Le mur, vu de l'intérieur — l'espace ne doit pas atteindre Lucie :

```bash
sudo docker exec lucie-portail-backend-dev node -e "fetch('http://backend:3001/api/health').then(()=>console.log('JOIGNABLE — ANOMALIE')).catch(()=>console.log('injoignable : bien'))"
```

Attendu : **injoignable : bien**.

Dans un navigateur : `https://etudiants-dev.lucie-iip.be` affiche « Mon espace étudiant ».

---

## Étape 6 — La production

Seulement si l'étape 5 est propre. **Pas de `maj-prod`** (le conflit de nom du 25 septembre n'est pas élucidé) : à la
main, comme d'habitude.

```bash
cd /opt/lucie
sudo docker ps -a --filter name=attributions-backend --format '{{.Names}}  {{.Status}}'
```

S'il reste un conteneur arrêté ou au nom provisoire : `sudo docker rm -f <nom>`.

```bash
sudo DOCKER_CONFIG=/home/<compte-admin>/.docker docker compose pull backend frontend portail-backend portail-frontend
sudo docker compose up -d --force-recreate caddy backend frontend portail-backend portail-frontend
```

Vérifier :

```bash
sudo docker ps --format '{{.Names}}  {{.Status}}' | sort
curl -s https://www.lucie-iip.be/api/version
curl -s https://etudiants.lucie-iip.be/api/portail/sante
curl -s -o /dev/null -w '%{http_code}\n' https://etudiants.lucie-iip.be/api/etudiants
sudo docker logs attributions-backend 2>&1 | grep -i "portail\|error" | tail -5
sudo docker exec lucie-portail-backend node -e "fetch('http://backend:3001/api/health').then(()=>console.log('JOIGNABLE — ANOMALIE')).catch(()=>console.log('injoignable : bien'))"
```

Attendu : mêmes réponses qu'en dev, et **`3.5.001`** pour la version. Sur `https://www.lucie-iip.be`, le badge de
version doit dire `v3.5.001` **sans écart** (pas de `≠` cerclé d'ocre). S'il y a un écart, une moitié n'a pas été
remplacée : relancer le `up -d --force-recreate` de cette moitié.

---

## Étape 7 — L'espace ne s'ouvre que depuis la Belgique

Le script pose, chaque semaine, la liste des adresses belges et celle des VPN et hébergeurs dans le dossier de
chaque espace. L'espace les relit seul (dans la minute), sans redémarrage.

```bash
sudo cp scripts/vps/geo-portail.sh /opt/lucie/geo-portail.sh
sudo sh /opt/lucie/geo-portail.sh
```

Attendu : « listes posées : … blocs belges, … blocs VPN et hébergeurs ».

Puis chaque lundi à 4 h 17, dans la crontab de root (`sudo crontab -e`) :

```
17 4 * * 1  sh /opt/lucie/geo-portail.sh >> /var/log/geo-portail.log 2>&1
```

Vérifier : `curl -s https://etudiants.lucie-iip.be/api/portail/sante` — les nombres `belgique` et `vpn` ne sont plus
à zéro. **Sans ces listes, rien n'est bloqué** : une installation incomplète ne ferme pas l'espace, elle le laisse
ouvert au monde entier.

---

## Étape 8 — Rendre la main à Charles

Lui dire que c'est fait. De son côté, dans Lucie (production) :

1. Configuration → Accès → **Mise en service** : tout est « Éteinte ». Il ajoute un **étudiant d'essai** (un dossier
   fictif ou un volontaire) et met **Mes documents** en « Essai ».
2. Fiche de cet étudiant → Suivi → **Voir son espace** : l'espace s'ouvre en aperçu, avec le seul onglet ouvert.
3. Configuration → Courriels → **Rappels** : l'interrupteur général est coupé ; il le reste jusqu'à décision.

---

## Si quelque chose tourne mal

- **Lucie ne démarre plus après l'étape 4** : un secret manque dans `.env` (le message de `docker compose` le nomme).
  Compléter l'étape 2. En urgence, remettre l'ancien fichier :
  `sudo cp /opt/lucie/docker-compose.yml.avant-3.5 /opt/lucie/docker-compose.yml` puis `up -d` de `backend frontend`.
- **L'espace répond 502** : ses conteneurs ne sont pas « Up » (`sudo docker logs lucie-portail-backend`) ; le plus
  souvent, les droits du dossier (étape 3) ou un secret identique au jeton.
- **Certificat absent sur `etudiants…`** : le DNS n'était pas encore propagé quand Caddy a démarré.
  `sudo docker exec lucie-caddy caddy reload --config /etc/caddy/Caddyfile` une fois `getent hosts` correct.
- **Revenir à 3.1.496** : remettre les deux fichiers `.avant-3.5`, puis la base de l'étape 0 (Lucie arrêtée, WAL et SHM
  effacés), et les images de la version précédente. À ne faire qu'après en avoir parlé à Charles.

Le détail de ce qui passe le mur (et de ce qui ne le passe pas) : `scripts/vps/PORTAIL-ETUDIANTS.md`.
