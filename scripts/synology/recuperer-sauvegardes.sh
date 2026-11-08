#!/bin/bash
# Synology — rapatrie chaque nuit les sauvegardes de Lucie depuis le VPS, les
# vérifie, et prévient sur le téléphone (ntfy) si quelque chose ne va pas.
# Planificateur de tâches DSM, chaque jour à 04:00 (heure de Bruxelles) :
# backup.sh tourne sur le VPS à 02:00 UTC (03:00 à Bruxelles en hiver).
#
#   bash /volume1/scripts/lucie/recuperer-sauvegardes.sh <sujet-ntfy>
#
# PAS DE --delete : la copie du Synology doit survivre à ce qui arrive au VPS.
# Avec --delete, des sauvegardes effacées là-bas (fausse manœuvre, disque
# perdu, intrusion) l'étaient ici la nuit suivante. Le Synology garde ses
# propres copies JOURS_GARDES jours.

SUJET=${1:-}
DEST=${DEST:-/volume1/backups/lucie-vps}
# Le compte de sauvegarde du VPS (lecture seule de /opt/lucie/backups) : son
# nom ne s'écrit pas dans le dépôt — il est renseigné dans la copie du Synology.
SOURCE=${SOURCE:-<compte-sauvegarde>@dev.lucie-iip.be:/opt/lucie/backups/}
CLE=${CLE:-/root/.ssh/lucie_vps}
JOURS_GARDES=90
AGE_MAX_H=26
JOURNAL="$DEST/recuperation.log"

mkdir -p "$DEST"
noter() { echo "$(date '+%F %T')  $1" >> "$JOURNAL"; }
alerter() { # $1 = message
  noter "ALERTE  $1"
  echo "ALERTE Lucie : $1"
  [ -n "$SUJET" ] && curl -fsS -m 30 -H "Title: Lucie - sauvegarde" -H "Priority: urgent" \
    -H "Tags: floppy_disk,warning" --data-binary "$1" "https://ntfy.sh/$SUJET" >/dev/null
}

# 1. Rapatrier (sans jamais effacer ici ce qui a disparu là-bas)
if [ -n "${RSYNC_LOCAL:-}" ]; then
  sortie=$(rsync -a "$SOURCE" "$DEST/" 2>&1); code=$?        # essais en local
else
  sortie=$(rsync -az -e "ssh -i $CLE -o StrictHostKeyChecking=accept-new -o ConnectTimeout=30" \
    "$SOURCE" "$DEST/" 2>&1); code=$?
fi
if [ $code -ne 0 ]; then
  alerter "rsync a échoué (code $code) : $(echo "$sortie" | tail -1)"
  exit 1
fi

# 2. La dernière copie de chaque base de PRODUCTION — Lucie (prod_) et le
#    portail des étudiants et des enseignants (portail_) : assez récente, et lisible
probleme=0
for base in prod portail; do
  dernier=$(ls -1t "$DEST"/${base}_*.db 2>/dev/null | head -1)
  if [ -z "$dernier" ]; then
    alerter "aucune sauvegarde « $base » dans $DEST"; probleme=1; continue
  fi
  age_h=$(( ( $(date +%s) - $(stat -c %Y "$dernier") ) / 3600 ))
  if [ "$age_h" -ge "$AGE_MAX_H" ]; then
    alerter "la dernière sauvegarde « $base » a ${age_h} h ($(basename "$dernier")) : backup.sh ne tourne plus sur le VPS ?"
    probleme=1; continue
  fi
  verdict=$(python3 - "$dernier" <<'EOF' 2>&1
import sqlite3, sys
try:
    # immutable=1 : la copie (en mode WAL) s'ouvre sans créer de -shm ni de -wal à côté
    c = sqlite3.connect("file:" + sys.argv[1] + "?mode=ro&immutable=1", uri=True)
    ok = c.execute("pragma integrity_check").fetchone()[0]
    n = c.execute("select count(*) from sqlite_master where type='table'").fetchone()[0]
    print(f"ok {n}" if ok == "ok" and n > 0 else f"KO {ok}, {n} tables")
except Exception as e:
    print(f"KO {e}")
EOF
)
  case "$verdict" in
    "ok "*) noter "ok  $(basename "$dernier"), ${age_h} h, ${verdict#ok } tables" ;;
    *) alerter "sauvegarde « $base » illisible ($(basename "$dernier")) : $verdict"; probleme=1 ;;
  esac
done
[ "$probleme" -eq 0 ] || exit 1

# 3. Ménage côté Synology, indépendant du VPS
find "$DEST" -maxdepth 1 -name '*.db' -mtime +$JOURS_GARDES -delete
# Les copies d'avant mise à jour de la prod (prod-avant-maj_*) : 14 jours suffisent,
# la sauvegarde de la nuit couvre le reste.
find "$DEST" -maxdepth 1 -name 'prod-avant-maj_*.db' -mtime +14 -delete
exit 0
