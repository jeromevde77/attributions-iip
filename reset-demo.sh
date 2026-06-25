#!/bin/bash
# reset-demo.sh — Recopie la DB de départ sur la DB démo active
# À lancer via cron NAS chaque nuit à 3h00
# Exemple crontab : 0 3 * * * /volume1/docker/attributions-app/reset-demo.sh

DEMO_DIR="/volume1/docker/attributions-app/backend/data-demo"
SEED_DB="/volume1/docker/attributions-app/backend/data-demo/demo-seed.db"
ACTIVE_DB="${DEMO_DIR}/demo.db"

echo "[$(date)] Début reset démo"

if [ ! -f "$SEED_DB" ]; then
  echo "[$(date)] ERREUR : fichier seed introuvable : $SEED_DB"
  exit 1
fi

# Arrêter le backend démo pour éviter les locks
docker stop attributions-backend-demo 2>/dev/null

# Copier la DB de départ
cp "$SEED_DB" "$ACTIVE_DB"
echo "[$(date)] DB démo réinitialisée"

# Redémarrer le backend démo
docker start attributions-backend-demo 2>/dev/null

echo "[$(date)] Reset démo terminé"
