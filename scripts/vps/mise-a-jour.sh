#!/bin/bash
# /opt/lucie/mise-a-jour.sh — remplace update-prod.sh et update-dev.sh.
# Cron, toutes les 5 minutes :
#   */5 * * * * /opt/lucie/mise-a-jour.sh >> /opt/lucie/mise-a-jour.log 2>&1
#
# Pourquoi (5 novembre 2026, 19 h 06 – 19 h 17) : les deux anciens scripts
# partaient à la même seconde toutes les 2 minutes, sans verrou. Une image
# lourde (le backend porte LibreOffice) met plus de 2 minutes à descendre :
# cron relançait des pulls par-dessus les pulls, prod et dev ensemble, et le
# VPS (2 vCores) est resté figé onze minutes. Des « up -d » simultanés
# expliquent aussi, sans doute, « The container name /attributions-backend is
# already in use » (25 septembre).
#
# Ici : une seule instance à la fois (flock), la prod PUIS la dev — jamais
# ensemble —, et le backend ET le frontend comparés (avant, un frontend seul
# ne redémarrait pas). Le portail (étudiants ET enseignants : le même
# portail-frontend sert les deux adresses) a son propre tour, pour qu'une
# image du portail ne redémarre pas Lucie, et inversement.

set -u
cd /opt/lucie || exit 1

exec 9>/opt/lucie/.mise-a-jour.lock
flock -n 9 || exit 0   # la précédente tourne encore : on passe ce tour-ci

horo() { date '+%F %T'; }
id_image() { docker image inspect "$1" --format '{{.Id}}' 2>/dev/null; }

CHANGE=0

maj() { # $1 = nom du tour, $2 = images « backend:tag frontend:tag », puis les services
  local nom=$1 images=$2; shift 2
  local img avant="" apres=""
  for img in $images; do avant="$avant $(id_image "ghcr.io/jeromevde77/$img")"; done
  docker compose pull --quiet "$@" || { echo "$(horo) $nom : échec du pull"; return; }
  for img in $images; do apres="$apres $(id_image "ghcr.io/jeromevde77/$img")"; done
  [ "$avant" = "$apres" ] && return

  echo "$(horo) $nom : nouvelle image, mise à jour"
  if [ "$nom" = prod ] && ! ./backup.sh; then
    echo "$(horo) prod : SAUVEGARDE EN ÉCHEC, mise à jour annulée"
    return
  fi
  docker compose up -d "$@"
  echo "$(horo) $nom : terminé"
  CHANGE=1
}

# La production d'abord, Lucie puis le portail ; la dev ensuite.
maj prod        "attributions-backend:latest attributions-frontend:latest"   backend frontend
maj portail     "lucie-portail-backend:latest lucie-portail-frontend:latest" portail-backend portail-frontend
maj dev         "attributions-backend:dev attributions-frontend:dev"         backend-dev frontend-dev
maj portail-dev "lucie-portail-backend:dev lucie-portail-frontend:dev"       portail-backend-dev portail-frontend-dev

[ "$CHANGE" -eq 1 ] && docker image prune -f >/dev/null
exit 0
