#!/bin/bash
# =================================================================
# Script de mise à jour automatique — Attributions IIP
# À planifier toutes les 5 minutes via DSM Task Scheduler.
#
# Comportement :
#   1. Pull les images latest depuis ghcr.io
#   2. Si une nouvelle image existe, redémarre les conteneurs concernés
#   3. Log dans /volume1/docker/attributions-app/auto-update.log
# =================================================================

set -e

PROJECT_DIR="/volume1/docker/attributions-app"
LOG_FILE="$PROJECT_DIR/auto-update.log"

cd "$PROJECT_DIR"

# Tronquer le log s'il dépasse 5 Mo
if [ -f "$LOG_FILE" ] && [ "$(stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)" -gt 5242880 ]; then
    tail -1000 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
fi

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# Récupérer le digest actuel des images locales
BACKEND_BEFORE=$(docker image inspect ghcr.io/jeromevde77/attributions-backend:latest --format='{{.Id}}' 2>/dev/null || echo "none")
FRONTEND_BEFORE=$(docker image inspect ghcr.io/jeromevde77/attributions-frontend:latest --format='{{.Id}}' 2>/dev/null || echo "none")

# Pull silencieux
docker compose pull --quiet 2>/dev/null || {
    log "ERREUR pendant docker compose pull"
    exit 1
}

# Récupérer les digests après pull
BACKEND_AFTER=$(docker image inspect ghcr.io/jeromevde77/attributions-backend:latest --format='{{.Id}}' 2>/dev/null || echo "none")
FRONTEND_AFTER=$(docker image inspect ghcr.io/jeromevde77/attributions-frontend:latest --format='{{.Id}}' 2>/dev/null || echo "none")

UPDATED=0

if [ "$BACKEND_BEFORE" != "$BACKEND_AFTER" ] && [ "$BACKEND_AFTER" != "none" ]; then
    log "Nouvelle version BACKEND détectée — restart"
    docker compose up -d --no-deps backend
    UPDATED=1
fi

if [ "$FRONTEND_BEFORE" != "$FRONTEND_AFTER" ] && [ "$FRONTEND_AFTER" != "none" ]; then
    log "Nouvelle version FRONTEND détectée — restart"
    docker compose up -d --no-deps frontend
    UPDATED=1
fi

if [ $UPDATED -eq 1 ]; then
    # Nettoyer les anciennes images
    docker image prune -f >/dev/null 2>&1
    log "Mise à jour terminée"
else
    # Pas de log pour réduire le bruit quand rien ne change
    :
fi
