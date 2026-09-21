# Le compte `lucie-ops` — l'accès limité de Claude au VPS

Deux comptes sur le serveur, et ce n'est pas un détail :

- **`debian`** — Jérôme. Accès complet, mot de passe ou clé personnelle.
- **`lucie-ops`** — les interventions de Claude. **Aucun shell** : sa clé SSH
  est liée au script `/usr/local/sbin/lucie-ops`, et sudo ne lui permet de
  lancer que ce fichier. Cinq verbes, rien d'autre :

| Verbe | Effet |
|---|---|
| `version` | version servie par www et dev |
| `sauvegarde` | sauvegarde cohérente de la base de prod dans `prod/backups/` |
| `maj-dev` | `pull` + `--force-recreate` de dev |
| `maj-prod` | **sauvegarde d'abord**, puis `pull` + `--force-recreate` de prod |
| `lecture "<SQL>"` | requête SELECT/WITH/PRAGMA, base ouverte en lecture seule |

Pourquoi pas le groupe `docker` : y être, c'est être root. Pourquoi une clé
liée à une commande : si elle fuyait, elle ne pourrait rien faire d'autre.

Toute écriture en base (un nettoyage comme celui du 21 septembre 2026) reste
un geste de Jérôme, sous `debian`.

## Installation (une fois, sous `debian`)

**1. Depuis le Mac** — envoyer le script et la clé publique :

```bash
scp ~/Projets/Lucie/scripts/vps/lucie-ops ~/.ssh/lucie_vps.pub debian@www.lucie-iip.be:/tmp/
```

**2. Sur le VPS**, connecté en `debian` :

```bash
# Le compte, sans mot de passe utilisable
sudo adduser --disabled-password --gecos "Interventions Claude (Lucie)" lucie-ops
sudo passwd -l lucie-ops

# Le script, propriété de root, non modifiable par lucie-ops
sudo install -o root -g root -m 0755 /tmp/lucie-ops /usr/local/sbin/lucie-ops

# sudo : CE script et rien d'autre ; la commande SSH doit le traverser
echo 'Defaults:lucie-ops env_keep += "SSH_ORIGINAL_COMMAND"
lucie-ops ALL=(root) NOPASSWD: /usr/local/sbin/lucie-ops' | sudo tee /etc/sudoers.d/lucie-ops
sudo chmod 0440 /etc/sudoers.d/lucie-ops
sudo visudo -cf /etc/sudoers.d/lucie-ops

# La clé, liée au script, sans terminal ni redirection
sudo install -d -o lucie-ops -g lucie-ops -m 0700 /home/lucie-ops/.ssh
echo "command=\"sudo /usr/local/sbin/lucie-ops\",restrict $(cat /tmp/lucie_vps.pub)" \
  | sudo tee /home/lucie-ops/.ssh/authorized_keys
sudo chown lucie-ops:lucie-ops /home/lucie-ops/.ssh/authorized_keys
sudo chmod 0600 /home/lucie-ops/.ssh/authorized_keys

rm /tmp/lucie-ops /tmp/lucie_vps.pub
```

**3. Test** — depuis le Mac :

```bash
ssh -i ~/.ssh/lucie_vps lucie-ops@www.lucie-iip.be version
```

Doit afficher les versions de www et de dev. Et ceci doit être **refusé** :

```bash
ssh -i ~/.ssh/lucie_vps lucie-ops@www.lucie-iip.be "lecture DELETE FROM etudiant"
```

## Surveiller, retirer

- Ce que lucie-ops a fait : `sudo journalctl -t lucie-ops`
- Couper l'accès : `sudo rm /home/lucie-ops/.ssh/authorized_keys`
  (ou `sudo deluser --remove-home lucie-ops` et `sudo rm /etc/sudoers.d/lucie-ops`)
- Mettre le script à jour : refaire `scp` puis `sudo install …` de l'étape 2.

## Et ensuite, pour `debian`

Une fois les clés en place, désactiver la connexion par mot de passe
(`PasswordAuthentication no` dans `/etc/ssh/sshd_config.d/`) — **après** avoir
vérifié que `debian` entre par sa propre clé, sans quoi on s'enferme dehors.
