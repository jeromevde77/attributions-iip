# Le compte de service — l'accès limité de Claude au VPS

> **Les noms des comptes ne s'écrivent pas dans ce dépôt** (Charles, 30 octobre 2026). Ce document dit
> `<compte-admin>` (le compte d'administration d'origine OVH), `<compte-jerome>` (celui de Jérôme) et
> `<compte-service>` (celui des interventions de Claude). Les commandes ci-dessous les lisent dans deux
> variables, à poser au début de la session de terminal ; les vrais noms vivent sur le VPS et chez Jérôme.

Sur le serveur, deux sortes d'accès, et ce n'est pas un détail :

- **`<compte-admin>`, `<compte-jerome>`** — accès complet, mot de passe ou clé personnelle.
- **`<compte-service>`** — les interventions de Claude. **Aucun shell** : sa clé SSH est liée au script
  `/usr/local/sbin/gestes-vps` (copie de référence : `scripts/vps/gestes-vps`), et sudo ne lui permet de
  lancer que ce fichier. Cinq verbes, rien d'autre :

| Verbe | Effet |
|---|---|
| `version` | version servie par www et dev |
| `sauvegarde` | sauvegarde cohérente de la base de prod dans `prod/backups/` |
| `maj-dev` | `pull` + `--force-recreate` de dev |
| `maj-prod` | **sauvegarde d'abord**, puis `pull` + `--force-recreate` de prod |
| `lecture "<SQL>"` | requête SELECT/WITH/PRAGMA, base ouverte en lecture seule |

Pourquoi pas le groupe `docker` : y être, c'est être root. Pourquoi une clé liée à une commande : si elle
fuyait, elle ne pourrait rien faire d'autre.

Toute écriture en base reste un geste de Jérôme.

## Installation (une fois, sous `<compte-admin>`)

Dans chaque terminal (Mac puis VPS), poser d'abord les deux noms :

```bash
SERVICE='<compte-service>'   # le nom réel, choisi par Jérôme
ADMIN='<compte-admin>'
```

**1. Depuis le Mac** — envoyer le script et la clé publique :

```bash
scp ~/Projets/Lucie/scripts/vps/gestes-vps ~/.ssh/lucie_vps.pub "$ADMIN@www.lucie-iip.be:/tmp/"
```

**2. Sur le VPS**, connecté sous `<compte-admin>` :

```bash
# Le compte, sans mot de passe utilisable
sudo adduser --disabled-password --gecos "Interventions Claude (Lucie)" "$SERVICE"
sudo passwd -l "$SERVICE"

# Le réglage du script (hors dépôt) : où lire l'identifiant du registre des images
sudo install -d -m 0755 /etc/lucie
echo "DOCKER_CONFIG_REGISTRE=/home/$ADMIN/.docker" | sudo tee /etc/lucie/gestes.conf
sudo chmod 0644 /etc/lucie/gestes.conf

# Le script, propriété de root, non modifiable par le compte de service
sudo install -o root -g root -m 0755 /tmp/gestes-vps /usr/local/sbin/gestes-vps

# sudo : CE script et rien d'autre ; la commande SSH doit le traverser
printf 'Defaults:%s env_keep += "SSH_ORIGINAL_COMMAND"\n%s ALL=(root) NOPASSWD: /usr/local/sbin/gestes-vps\n' \
  "$SERVICE" "$SERVICE" | sudo tee /etc/sudoers.d/gestes-vps
sudo chmod 0440 /etc/sudoers.d/gestes-vps
sudo visudo -cf /etc/sudoers.d/gestes-vps

# La clé, liée au script, sans terminal ni redirection
sudo install -d -o "$SERVICE" -g "$SERVICE" -m 0700 "/home/$SERVICE/.ssh"
echo "command=\"sudo /usr/local/sbin/gestes-vps\",restrict $(cat /tmp/lucie_vps.pub)" \
  | sudo tee "/home/$SERVICE/.ssh/authorized_keys"
sudo chown "$SERVICE:$SERVICE" "/home/$SERVICE/.ssh/authorized_keys"
sudo chmod 0600 "/home/$SERVICE/.ssh/authorized_keys"

rm /tmp/gestes-vps /tmp/lucie_vps.pub
```

**3. Test** — depuis le Mac (l'alias `lucie-vps` de `~/.ssh/config` porte le nom du compte) :

```bash
ssh lucie-vps version
```

Doit afficher les versions de www et de dev. Et ceci doit être **refusé** :

```bash
ssh lucie-vps "lecture DELETE FROM etudiant"
```

## Surveiller, retirer

- Ce que le compte de service a fait : `sudo journalctl -t lucie-gestes`
- Couper l'accès : `sudo rm "/home/$SERVICE/.ssh/authorized_keys"`
  (ou `sudo deluser --remove-home "$SERVICE"` et `sudo rm /etc/sudoers.d/gestes-vps`)
- Mettre le script à jour : refaire `scp` puis `sudo install …` de l'étape 2.

## Passer de l'ancienne installation à celle-ci

Jusqu'au 30 octobre 2026, le script s'appelait autrement et portait le nom du compte en dur ; ces noms restent
dans l'historique git. Pour qu'ils ne servent plus à rien : créer le compte de service sous un **nouveau nom**
(étape 2), installer `/etc/lucie/gestes.conf` et `gestes-vps`, mettre à jour l'alias `lucie-vps` du Mac, vérifier
`ssh lucie-vps version`, puis supprimer l'ancien compte, son fichier sudoers et l'ancien script.

## Et ensuite, pour `<compte-admin>`

Une fois les clés en place, désactiver la connexion par mot de passe (`PasswordAuthentication no` dans
`/etc/ssh/sshd_config.d/`) — **après** avoir vérifié que `<compte-admin>` entre par sa propre clé, sans quoi on
s'enferme dehors. (Choix actuel de Jérôme : la connexion par mot de passe reste ouverte.)
