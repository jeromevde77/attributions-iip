#!/bin/bash
# reload-ssl-cert.sh — Recharge le certificat SSL dans les conteneurs nginx.
# À planifier dans DSM Task Scheduler (hebdomadaire, ex. dimanche 04:00).
#
# DSM renouvelle le certificat Let's Encrypt automatiquement, mais nginx
# garde l'ancien en mémoire jusqu'au redémarrage du conteneur. Ce script
# redémarre les frontends pour recharger le certificat à jour.

LOG="/volume1/docker/attributions-app/ssl-reload.log"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Rechargement certificat SSL..." >> "$LOG"

# Redémarrer le frontend PROD (recharge le certificat monté)
docker restart attributions-frontend >> "$LOG" 2>&1

# Redémarrer le frontend DEV s'il existe
if docker ps -a --format '{{.Names}}' | grep -q attributions-frontend-dev; then
    docker restart attributions-frontend-dev >> "$LOG" 2>&1
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Done." >> "$LOG"
