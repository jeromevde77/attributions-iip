#!/bin/bash
# /opt/lucie/backup.sh — sauvegarde des bases de Lucie ET du portail.
# Cron 02:00 UTC, et avant chaque mise à jour de la prod (mise-a-jour.sh).
# Le Synology rapatrie /opt/lucie/backups/ chaque nuit à 03:00 UTC.
#
# Copie cohérente par l'API de sauvegarde de SQLite, faite DANS le conteneur
# (base ouverte en lecture seule), vérifiée (integrity_check + taille) avant
# d'être rangée. Un verrou évite que la sauvegarde de 02:00 et celle d'une
# mise à jour n'écrivent le même fichier temporaire en même temps.
#
# Deux usages :
#   backup.sh            la nuit : les QUATRE bases — prod_*, dev_* (Lucie),
#                        portail_*, portail-dev_* (le portail des étudiants et des
#                        enseignants : accusés, confirmations). 7 jours gardés ici,
#                        90 sur le Synology.
#   backup.sh avant-maj  avant une nouvelle version de la prod : la PROD SEULE
#                        (c'est la seule base qu'elle peut abîmer), dans
#                        prod-avant-maj_*, et seulement les 3 dernières gardées ici.
#
# Pourquoi (8 novembre 2026) : la prod changeait de version 15 à 20 fois par jour
# et chaque fois les quatre bases étaient copiées (340 Mo) et gardées 7 jours —
# 12 Go en deux jours, le disque (40 Go) plein en moins d'une semaine.
set -e
D=/opt/lucie/backups
mkdir -p $D
STAMP=$(date +%F_%H%M)
MODE=${1:-nuit}
case "$MODE" in nuit|avant-maj) ;; *) echo "usage : $0 [avant-maj]" >&2; exit 2 ;; esac
GARDER_AVANT_MAJ=3

exec 9>/opt/lucie/.backup.lock
flock -w 600 9 || { echo "$(date '+%F %T') ALERTE: une autre sauvegarde tourne encore"; exit 1; }

# nom | conteneur | base | copie temporaire (dans le conteneur) | la même, vue de l'hôte | taille min. (o)
# Lucie : la copie passe par son dossier backups monté (comme avant) ;
# le portail (read_only) n'a que /app/data d'inscriptible.
CIBLES="
prod|attributions-backend|/app/data/attributions.db|/app/data/backups/sauvegarde-en-cours.db|/opt/lucie/prod/backups/sauvegarde-en-cours.db|100000
dev|attributions-backend-dev|/app/data/attributions.db|/app/data/backups/sauvegarde-en-cours.db|/opt/lucie/dev/backups/sauvegarde-en-cours.db|100000
portail|lucie-portail-backend|/app/data/portail.db|/app/data/sauvegarde-en-cours.db|/opt/lucie/portail/data/sauvegarde-en-cours.db|4096
portail-dev|lucie-portail-backend-dev|/app/data/portail.db|/app/data/sauvegarde-en-cours.db|/opt/lucie/portail-dev/data/sauvegarde-en-cours.db|4096
"

[ "$MODE" = avant-maj ] && CIBLES=$(echo "$CIBLES" | grep '^prod|')

echo "$CIBLES" | while IFS='|' read -r NOM C BASE TMP TMP_HOTE MIN; do
  [ -n "$NOM" ] || continue
  FICHIER=$D/${NOM}_${STAMP}.db
  [ "$MODE" = avant-maj ] && FICHIER=$D/${NOM}-avant-maj_${STAMP}.db
  docker ps --format '{{.Names}}' | grep -qx "$C" || { echo "$(date '+%F %T') $NOM : conteneur absent, ignoré"; continue; }

  # Copie, puis contrôle d'intégrité sur la copie, dans le conteneur.
  docker exec "$C" node -e "
    const D=require('better-sqlite3');
    new D('$BASE',{readonly:true}).backup('$TMP')
      .then(()=>{
        const r=new D('$TMP',{readonly:true}).pragma('integrity_check',{simple:true});
        if(r!=='ok'){console.error('integrity_check: '+r);process.exit(1)}
        process.exit(0)})
      .catch(e=>{console.error(e);process.exit(1)});
  " || { rm -f "$TMP_HOTE"; echo "$(date '+%F %T') ALERTE: sauvegarde $NOM en échec"; exit 1; }

  mv "$TMP_HOTE" "$FICHIER"
  rm -f "$TMP_HOTE-shm" "$TMP_HOTE-wal"   # laissés par l'integrity_check (copie en mode WAL)
  SIZE=$(stat -c%s "$FICHIER")
  [ "$SIZE" -lt "$MIN" ] && { echo "$(date '+%F %T') ALERTE: sauvegarde $NOM trop petite ($SIZE o)"; exit 1; }
  echo "$(date '+%F %T') $NOM ok ($((SIZE/1024)) Ko)"
done

# Les copies d'avant mise à jour : les 3 dernières (le Synology emporte celles
# présentes à 04:00). Puis tout ce qui a plus de 7 jours.
ls -1t $D/prod-avant-maj_*.db 2>/dev/null | tail -n +$((GARDER_AVANT_MAJ + 1)) | xargs -r rm -f
find $D -name '*.db' -mtime +7 -delete   # le Synology garde 90 jours
