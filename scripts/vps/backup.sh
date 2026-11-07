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
# Fichiers : prod_*, dev_* (Lucie), portail_*, portail-dev_* (le portail des
# étudiants et des enseignants : accusés, confirmations). 7 jours gardés ici,
# 90 sur le Synology.
set -e
D=/opt/lucie/backups
mkdir -p $D
STAMP=$(date +%F_%H%M)

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

echo "$CIBLES" | while IFS='|' read -r NOM C BASE TMP TMP_HOTE MIN; do
  [ -n "$NOM" ] || continue
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

  mv "$TMP_HOTE" "$D/${NOM}_${STAMP}.db"
  SIZE=$(stat -c%s "$D/${NOM}_${STAMP}.db")
  [ "$SIZE" -lt "$MIN" ] && { echo "$(date '+%F %T') ALERTE: sauvegarde $NOM trop petite ($SIZE o)"; exit 1; }
  echo "$(date '+%F %T') $NOM ok ($((SIZE/1024)) Ko)"
done

find $D -name '*.db' -mtime +7 -delete   # le Synology garde 90 jours
