# Le portail des étudiants — mise en place sur le VPS (Jérôme)

Version 3.1.477. Charles, 30 octobre 2026 : « un mur de Berlin infranchissable entre la version de Lucie pour les
MDP et la version accessible aux étudiants ».

## Ce qui est séparé

| | Lucie (personnel) | Portail (étudiants) |
|---|---|---|
| Adresse | www.lucie-iip.be / dev.lucie-iip.be | **etudiants.lucie-iip.be** / **etudiants-dev.lucie-iip.be** |
| Code | `backend/`, `frontend/` | `portail/` (serveur), `frontend/src/portail/` (site, construit seul) |
| Images | attributions-backend / -frontend | **lucie-portail-backend** / **lucie-portail-frontend** |
| Base | `prod/data/attributions.db` | `portail/data/portail.db` (la sienne, rien d'autre) |
| Réseau Docker | lucie-prod | **lucie-portail** (aucun conteneur de Lucie dessus) |
| Clés | JWT_SECRET, MFA_KEY, SMTP | PORTAIL_SECRET (à lui seul) ; aucune clé de Lucie |

Seul **Caddy** est sur les deux réseaux. Lucie atteint le portail par `http://caddy:8443` (port non publié), qui ne
mène qu'au port interne du portail, et avec le jeton `PORTAIL_JETON`. Le portail ne peut pas appeler Lucie : il
n'envoie même pas de courriel — il inscrit une demande que Lucie relève, vérifie et compose.

## Installation (une fois, sous `<compte-jerome>`, dans /opt/lucie)

1. **DNS** : deux enregistrements A (ou CNAME) vers le VPS : `etudiants.lucie-iip.be` et `etudiants-dev.lucie-iip.be`.
2. **Quatre secrets** dans `/opt/lucie/.env` (chacun fabriqué séparément, jamais réutilisé, jamais écrit ailleurs) :
   ```
   node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
   ```
   `PORTAIL_SECRET_PROD`, `PORTAIL_JETON_PROD`, `PORTAIL_SECRET_DEV`, `PORTAIL_JETON_DEV`.
3. **Les dossiers des bases**, au propriétaire du conteneur (il ne tourne pas en root) :
   ```
   sudo mkdir -p /opt/lucie/portail/data /opt/lucie/portail-dev/data
   sudo chown -R 1000:1000 /opt/lucie/portail /opt/lucie/portail-dev
   ```
4. **Recopier** `docker-compose.vps.yml` → `/opt/lucie/docker-compose.yml` et `Caddyfile.vps` → `/opt/lucie/Caddyfile`
   (ce sont les copies de référence du dépôt).
5. **Démarrer** (images privées : l'identifiant du registre est celui de `<compte-admin>`) :
   ```
   cd /opt/lucie
   sudo DOCKER_CONFIG=/home/<compte-admin>/.docker docker compose pull portail-backend-dev portail-frontend-dev backend-dev
   sudo docker compose up -d --force-recreate caddy portail-backend-dev portail-frontend-dev backend-dev
   ```
   Puis, une fois la dev vérifiée, la même chose pour la production (`portail-backend portail-frontend backend`).

## Vérifier

- `https://etudiants-dev.lucie-iip.be` affiche « Mon espace étudiant ».
- `curl -s https://etudiants-dev.lucie-iip.be/api/portail/sante` → `{"ok":true}`.
- `curl -s -o /dev/null -w '%{http_code}' https://etudiants-dev.lucie-iip.be/api/etudiants` → **404** (aucune route de Lucie).
- Le journal de Lucie ne dit plus « [portail] non configuré ».
- Depuis le conteneur du portail, Lucie est injoignable :
  `sudo docker exec lucie-portail-backend-dev node -e "fetch('http://backend:3001/api/health').then(()=>console.log('JOIGNABLE — ANOMALIE')).catch(()=>console.log('injoignable : bien'))"`

## Ce qui passe le mur, et rien d'autre

Vers le portail (déposé par Lucie) : les étudiants actifs non archivés qui ont une adresse d'école (nom, prénom,
adresse d'école, matricules) ; leurs résultats **publiés** (séance close) ; les PDF des pièces qu'on leur a envoyées ;
les règlements que la Documentation destine aux « Étudiants ».

Vers Lucie (relevé par Lucie) : les demandes de lien et de code (Lucie vérifie l'étudiant et compose le courriel),
les accusés de réception, les connexions.
