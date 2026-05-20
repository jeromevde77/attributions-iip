#!/bin/bash
# =================================================================
# Script de mise à jour automatique — Attributions IIP
# À planifier toutes les 5 minutes via DSM Task Scheduler.
#
# Comportement :
#   1. Pull les images latest depuis ghcr.io
#   2. Si une nouvelle image existe, redémarre les conteneurs concernés
#   3. Log dans /volume1/docker/attributions-app/auto-update.log
#   4. Envoie un email de notification si mise à jour
#
# Prérequis pour les notifications :
#   - Configurer le serveur SMTP dans DSM > Panneau de configuration
#     > Notifications > Email (paramètres du serveur mail)
#   - Définir NOTIFY_EMAIL ci-dessous
# =================================================================

set -e

PROJECT_DIR="/volume1/docker/attributions-app"
LOG_FILE="$PROJECT_DIR/auto-update.log"

# ── À CONFIGURER ──────────────────────────────────────────────────
NOTIFY_EMAIL="redacted@example.com"   # adresse de destination
# ──────────────────────────────────────────────────────────────────

cd "$PROJECT_DIR"

# Tronquer le log s'il dépasse 5 Mo
if [ -f "$LOG_FILE" ] && [ "$(stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)" -gt 5242880 ]; then
    tail -1000 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
fi

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

send_email() {
    local subject="$1"
    local body="$2"

    if [ -x /usr/syno/bin/synodsmnotify ]; then
        /usr/syno/bin/synodsmnotify admin "$subject" "$body" 2>/dev/null \
            && log "Notification envoyée via synodsmnotify" \
            || log "AVERTISSEMENT : synodsmnotify a échoué"
    else
        log "AVERTISSEMENT : synodsmnotify introuvable — notification non envoyée"
    fi
}

# Récupérer le digest actuel des images locales
BACKEND_BEFORE=$(docker image inspect ghcr.io/jeromevde77/attributions-backend:latest --format='{{.Id}}' 2>/dev/null || echo "none")
FRONTEND_BEFORE=$(docker image inspect ghcr.io/jeromevde77/attributions-frontend:latest --format='{{.Id}}' 2>/dev/null || echo "none")

# Pull silencieux
docker compose pull --quiet 2>/dev/null || {
    log "ERREUR pendant docker compose pull"
    send_email \
        "[Attributions IIP] ❌ Echec du pull" \
        "Le script auto-update a échoué lors du docker compose pull sur $(hostname) à $(date '+%d/%m/%Y %H:%M:%S')."
    exit 1
}

# Récupérer les digests après pull
BACKEND_AFTER=$(docker image inspect ghcr.io/jeromevde77/attributions-backend:latest --format='{{.Id}}' 2>/dev/null || echo "none")
FRONTEND_AFTER=$(docker image inspect ghcr.io/jeromevde77/attributions-frontend:latest --format='{{.Id}}' 2>/dev/null || echo "none")

UPDATED=0
UPDATE_DETAILS=""

if [ "$BACKEND_BEFORE" != "$BACKEND_AFTER" ] && [ "$BACKEND_AFTER" != "none" ]; then
    log "Nouvelle version BACKEND détectée — restart"
    docker compose up -d --no-deps backend
    UPDATED=1
    UPDATE_DETAILS="${UPDATE_DETAILS}  • Backend  : ${BACKEND_AFTER:7:12}\n"
fi

if [ "$FRONTEND_BEFORE" != "$FRONTEND_AFTER" ] && [ "$FRONTEND_AFTER" != "none" ]; then
    log "Nouvelle version FRONTEND détectée — restart"
    docker compose up -d --no-deps frontend
    UPDATED=1
    UPDATE_DETAILS="${UPDATE_DETAILS}  • Frontend : ${FRONTEND_AFTER:7:12}\n"
fi

if [ $UPDATED -eq 1 ]; then
    # Nettoyer les anciennes images
    docker image prune -f >/dev/null 2>&1
    log "Mise à jour terminée"

    send_email \
        "[Attributions IIP] ✅ Nouvelle version déployée" \
        "$(printf 'Mise à jour automatique effectuée sur %s le %s.\n\nComposants mis à jour :\n%b\nL'\''application est disponible sur http://localhost:8080' "$(hostname)" "$(date '+%d/%m/%Y à %H:%M:%S')" "$UPDATE_DETAILS")"
fi
