#!/bin/bash
# auto-update-vps.sh — mise à jour automatique sur VPS (cron, toutes les 5 min).
# Tire les images :latest depuis ghcr.io et ne redémarre que ce qui a changé.
#   */5 * * * * /opt/lucie/scripts/auto-update-vps.sh

set -u

PROJECT_DIR="/opt/lucie"
LOG_FILE="$PROJECT_DIR/auto-update.log"

cd "$PROJECT_DIR" || exit 1

if [ -f "$LOG_FILE" ] && [ "$(stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)" -gt 5242880 ]; then
    tail -1000 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
fi

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"; }

digest() { docker image inspect "$1" --format='{{.Id}}' 2>/dev/null || echo none; }

BACKEND_BEFORE=$(digest ghcr.io/jeromevde77/attributions-backend:latest)
FRONTEND_BEFORE=$(digest ghcr.io/jeromevde77/attributions-frontend:latest)

docker compose pull --quiet 2>> "$LOG_FILE" || { log "ERREUR pendant docker compose pull"; exit 1; }

UPDATED=0
if [ "$(digest ghcr.io/jeromevde77/attributions-backend:latest)" != "$BACKEND_BEFORE" ]; then
    log "Nouvelle image BACKEND — redémarrage"
    docker compose up -d --no-deps backend >> "$LOG_FILE" 2>&1
    UPDATED=1
fi
if [ "$(digest ghcr.io/jeromevde77/attributions-frontend:latest)" != "$FRONTEND_BEFORE" ]; then
    log "Nouvelle image FRONTEND — redémarrage"
    docker compose up -d --no-deps frontend >> "$LOG_FILE" 2>&1
    UPDATED=1
fi

[ $UPDATED -eq 1 ] && { docker image prune -f >/dev/null 2>&1; log "Mise à jour terminée"; }
exit 0
