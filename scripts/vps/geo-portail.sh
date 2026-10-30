#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# LES LISTES D'ADRESSES DU PORTAIL DES ÉTUDIANTS (3.1.513, Charles : « interdire un accès en dehors de la
# Belgique, et même VPN »). Le portail ne s'ouvre que depuis une adresse belge, hors hébergeurs et VPN connus
# (portail/src/geo.js). Ce script pose les deux listes dans le dossier de données de chaque portail :
#   be.cidr  — blocs attribués à la Belgique (ipdeny.com, IPv4 et IPv6 ; données RIR, libres d'usage) ;
#   vpn.cidr — VPN et centres de données connus (X4BNet/lists_vpn, licence MIT).
# Le portail relit les fichiers d'eux-mêmes (dans la minute) : aucun redémarrage.
# Une liste téléchargée vide ou trop courte N'EST PAS posée : l'ancienne reste.
#
# Une fois, sous <compte-jerome> :  sudo sh /opt/lucie/geo-portail.sh
# Chaque semaine (crontab de root) :  17 4 * * 1  sh /opt/lucie/geo-portail.sh >> /var/log/geo-portail.log 2>&1
# ─────────────────────────────────────────────────────────────────────────────
set -eu
BASE=${BASE:-/opt/lucie}
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
prendre() { curl -fsS --max-time 60 "$1" >> "$2"; }

prendre https://www.ipdeny.com/ipblocks/data/aggregated/be-aggregated.zone "$T/be.cidr"
prendre https://www.ipdeny.com/ipv6/ipaddresses/aggregated/be-aggregated.zone "$T/be.cidr"
prendre https://raw.githubusercontent.com/X4BNet/lists_vpn/main/output/vpn/ipv4.txt "$T/vpn.cidr"
prendre https://raw.githubusercontent.com/X4BNet/lists_vpn/main/output/datacenter/ipv4.txt "$T/vpn.cidr"

[ "$(wc -l < "$T/be.cidr")" -ge 500 ] || { echo "$(date) liste belge trop courte : rien n'est changé"; exit 1; }
[ "$(wc -l < "$T/vpn.cidr")" -ge 1000 ] || { echo "$(date) liste VPN trop courte : rien n'est changé"; exit 1; }

for d in "$BASE/portail/data" "$BASE/portail-dev/data"; do
  [ -d "$d" ] || continue
  mkdir -p "$d/geo"
  for f in be.cidr vpn.cidr; do cp "$T/$f" "$d/geo/$f.nouveau" && mv "$d/geo/$f.nouveau" "$d/geo/$f"; done
  chown -R 1000:1000 "$d/geo"
done
echo "$(date) listes posées : $(wc -l < "$T/be.cidr") blocs belges, $(wc -l < "$T/vpn.cidr") blocs VPN et hébergeurs"
