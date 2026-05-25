#!/bin/bash
# auto-update-dev.sh — À planifier dans DSM Task Scheduler (toutes les 5 min)
# Met à jour l'environnement de développement (images :dev, port 10801).

COMPOSE_FILE="/volume1/docker/attributions/docker-compose.dev.yml"
LOG="/volume1/docker/attributions/update-dev.log"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Vérification mises à jour DEV..." >> "$LOG"

# Tirer les nouvelles images :dev
docker compose -f "$COMPOSE_FILE" pull --quiet 2>> "$LOG"

# Redémarrer seulement si les images ont changé
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans 2>> "$LOG"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Done." >> "$LOG"
