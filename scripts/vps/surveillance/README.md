# Surveillance du VPS — ce qui tourne en dehors de Docker

En place depuis le 7 novembre 2026. Les alertes partent vers un sujet **ntfy**
(app ntfy sur le téléphone) ; le sujet est un secret : il vit dans
`/etc/lucie-disque.conf` (root, chmod 600), jamais dans ce dépôt.

| Quoi | Fichiers | Quand | Alerte |
|---|---|---|---|
| Disque de `/` | `lucie-disque` + `.service` + `.timer` | toutes les 30 min | ≥ 80 %, ≥ 90 % (répétée chaque jour), retour à la normale |
| Mise à jour en échec (pull, sauvegarde, démarrage) | `../mise-a-jour.sh` (sujet : `NTFY_SUJET` dans `/opt/lucie/.env`) | toutes les 5 min | une même alerte au plus une fois par heure |
| Redémarrage nécessaire, correctifs de sécurité bloqués | `lucie-systeme` + `.service` + `.timer` | chaque jour, 08:00 UTC | redémarrage en attente ; correctifs `-security` en attente depuis plus de 2 jours |

Complètent ces deux scripts :
- **Beszel** (`docker-compose.vps.yml`, https://monitor.lucie-iip.be) : RAM, CPU,
  réseau, avec historique et ses propres alertes. Son alerte Disque reste
  **désactivée** : quand le disque est plein, Beszel (qui écrit sa base sur ce
  disque) est le premier à ne plus pouvoir prévenir ; `lucie-disque` ne dépend
  pas de Docker.
- **unattended-upgrades** (déjà actif sur l'image Debian 13 d'OVH) : correctifs
  de sécurité chaque nuit. JAMAIS de redémarrage automatique — il coupe Lucie et
  peut laisser un conteneur sous un nom provisoire ; `lucie-systeme` prévient.
- **Depuis l'extérieur** (Synology) : une tâche vérifie toutes les 5 minutes que
  les sites répondent. Aucun de ces outils, sur le VPS, ne peut prévenir d'une
  panne du VPS lui-même.

## Installer

```bash
sudo install -m 755 lucie-disque lucie-systeme /usr/local/bin/
sudo install -m 644 lucie-*.service lucie-*.timer /etc/systemd/system/
printf 'SUJET=<sujet-ntfy>\nSEUIL_ALERTE=80\nSEUIL_CRITIQUE=90\n' | sudo tee /etc/lucie-disque.conf >/dev/null
sudo chmod 600 /etc/lucie-disque.conf
sudo systemctl daemon-reload
sudo systemctl enable --now lucie-disque.timer lucie-systeme.timer
sudo lucie-disque --essai && sudo lucie-systeme --essai
```
