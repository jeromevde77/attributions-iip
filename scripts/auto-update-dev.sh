#!/bin/bash
# auto-update-dev.sh — À planifier dans DSM Task Scheduler (toutes les 5 min)
# Met à jour l'environnement de développement (images :dev, port 10801 HTTPS).

DEV_DIR="/volume1/docker/attributions-dev"
COMPOSE_FILE="$DEV_DIR/docker-compose.dev.yml"
LOG="$DEV_DIR/update-dev.log"
TOKEN="***REMOVED***"
COMMIT_REF="develop"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Vérification mises à jour DEV..." >> "$LOG"

# Mettre à jour le docker-compose et la config nginx depuis GitHub (au cas où ils changent)
curl -s -H "Authorization: token $TOKEN" -H "Cache-Control: no-cache" \
  -o "$COMPOSE_FILE" \
  "https://raw.githubusercontent.com/jeromevde77/attributions-iip/$COMMIT_REF/docker-compose.dev.yml" 2>> "$LOG"

curl -s -H "Authorization: token $TOKEN" -H "Cache-Control: no-cache" \
  -o "$DEV_DIR/nginx-dev-ssl.conf" \
  "https://raw.githubusercontent.com/jeromevde77/attributions-iip/$COMMIT_REF/frontend/nginx-dev-ssl.conf" 2>> "$LOG"

# Tirer les nouvelles images :dev
docker compose -f "$COMPOSE_FILE" pull --quiet 2>> "$LOG"

# Redémarrer seulement si les images ont changé
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans 2>> "$LOG"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Done." >> "$LOG"
