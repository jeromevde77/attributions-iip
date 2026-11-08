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

# LE MÊME VERROU QUE LES GESTES maj-dev / maj-prod (gestes-vps, en root) : le
# 7 novembre 2026 à 23:00:24, un maj-dev et ce script ont recréé la dev à la
# même seconde → « The container name … is already in use » (comme le 25
# septembre et le 1er novembre). Ouvert en LECTURE : flock n'en demande pas
# plus, et le fichier reste utilisable que ce soit ce compte ou root qui l'ait créé.
VERROU=/opt/lucie/.mise-a-jour.lock
[ -e "$VERROU" ] || : > "$VERROU"
exec 9<"$VERROU"
flock -n 9 || exit 0   # une mise à jour (ce script ou un geste) tourne : on passe ce tour-ci

horo() { date '+%F %T'; }
id_image() { docker image inspect "$1" --format '{{.Id}}' 2>/dev/null; }

# Alertes ntfy : le sujet est NTFY_SUJET dans /opt/lucie/.env (lisible par le
# compte du cron, contrairement à /etc/lucie-disque.conf). Une même alerte au
# plus une fois par heure : un registre indisponible ne doit pas sonner toutes
# les 5 minutes.
SUJET=$(grep -s '^NTFY_SUJET=' /opt/lucie/.env | cut -d= -f2- | tr -d '"')
alerter() { # $1 = clé, $2 = message
  local marque=/opt/lucie/.alertes/$1
  mkdir -p /opt/lucie/.alertes
  [ -n "$(find "$marque" -mmin -60 2>/dev/null)" ] && return
  touch "$marque"
  [ -n "$SUJET" ] && curl -4 -fsS -m 30 -H "Title: Lucie - mise a jour" -H "Priority: high" \
    -H "Tags: arrows_counterclockwise,warning" --data-binary "$2" "https://ntfy.sh/$SUJET" >/dev/null
}

CHANGE=0

maj() { # $1 = nom du tour, $2 = images « backend:tag frontend:tag », puis les services
  local nom=$1 images=$2; shift 2
  local img avant="" apres=""
  for img in $images; do avant="$avant $(id_image "ghcr.io/jeromevde77/$img")"; done
  if ! docker compose pull --quiet "$@"; then
    echo "$(horo) $nom : échec du pull"
    # une seule clé pour les quatre tours : une panne du registre = une alerte, pas quatre
    alerter "pull" "$nom : les images ne se téléchargent plus (registre ghcr.io, identifiants ?). Journal : /opt/lucie/mise-a-jour.log"
    return
  fi
  for img in $images; do apres="$apres $(id_image "ghcr.io/jeromevde77/$img")"; done
  [ "$avant" = "$apres" ] && return

  echo "$(horo) $nom : nouvelle image, mise à jour"
  if [ "$nom" = prod ] && ! ./backup.sh avant-maj; then
    echo "$(horo) prod : SAUVEGARDE EN ÉCHEC, mise à jour annulée"
    alerter "sauvegarde" "prod : la sauvegarde a échoué, la nouvelle version n'est PAS installée. Voir /opt/lucie/mise-a-jour.log"
    return
  fi
  if ! docker compose up -d "$@"; then
    echo "$(horo) $nom : ÉCHEC du démarrage"
    alerter "up-$nom" "$nom : la nouvelle version n'a pas démarré (docker compose up). Vérifier docker ps et le journal."
    return
  fi
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
