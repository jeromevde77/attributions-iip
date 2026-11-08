# Le Synology — sauvegardes hors site et surveillance depuis l'extérieur

En place depuis le 7 novembre 2026. Le Synology est le seul maillon qui ne
tourne PAS sur le VPS : c'est lui qui garde les sauvegardes si le VPS est perdu,
et lui seul peut prévenir d'une panne du VPS. Alertes vers le même sujet **ntfy**
que le VPS ; le sujet est un secret, passé en argument dans les tâches DSM,
jamais écrit dans ce dépôt.

Sur le Synology, les scripts vivent dans `/volume1/Divers/ovh-stock/` (deux y
portent un nom au singulier : `recuperer-sauvegarde.sh`, `surveillance-site.py`).
Tâches : **Panneau de configuration → Planificateur de tâches**, utilisateur root.

| Tâche | Script | Quand | Alerte |
|---|---|---|---|
| Rapatrier les sauvegardes | `recuperer-sauvegardes.sh <sujet>` | chaque jour, 04:00 (Bruxelles) | rsync en échec ; dernière copie de `prod_` ou `portail_` absente, de plus de 26 h, ou illisible |
| Sites et backends joignables, certificats | `python3 surveillance-sites.py <sujet>` | toutes les 5 min (certificats : une fois par jour) | une page OU une API (`/api/health`, `/api/portail/sante` : nginx répond 200 même backend mort) ne répond plus depuis 10 min ; puis son retour ; un certificat HTTPS à moins de 14 jours de sa fin |
| Stock VPS OVH | `python3 verifier-stock.py <sujet>` | chaque jour, 09:00 | VPS-2 ou VPS-3 de nouveau disponible en Europe |

## Les sauvegardes, de bout en bout

1. **VPS, 02:00 UTC** — `scripts/vps/backup.sh` : copie cohérente (API de
   sauvegarde SQLite, dans chaque conteneur) de `prod`, `dev`, `portail`,
   `portail-dev`, contrôlée par `integrity_check`, rangée dans
   `/opt/lucie/backups/`. **7 jours** gardés sur le VPS.
2. **Synology, 04:00 (Bruxelles)** — `recuperer-sauvegardes.sh` : rsync par le
   compte de sauvegarde du VPS (clé `/root/.ssh/lucie_vps`), vers
   `/volume1/backups/lucie-vps/`. **Sans `--delete`** : ce qui disparaît du VPS
   ne disparaît pas ici. **90 jours** gardés. Vérifie ensuite la dernière copie
   de prod et du portail (ouverture `immutable=1` : pas de `-shm`/`-wal` créés).
   Journal : `recuperation.log` dans le même dossier.

Avant le 7 novembre, le rsync tournait à la même minute que `backup.sh` (toujours
un jour de retard), avec `--delete`, sans contrôle de lecture et sans alerte ; le
portail n'était pas sauvegardé.

## Vérifier à la main

```bash
sudo tail -3 /volume1/backups/lucie-vps/recuperation.log
sudo ls -lt /volume1/backups/lucie-vps | head -6
```
