# L'espace enseignant — mise en place (3.5.076)

L'espace enseignant vit **dans le portail des étudiants déjà installé** (même conteneur, même base `portail.db`,
mêmes secrets), derrière le même mur. Il a seulement **son adresse** : `enseignants.lucie-iip.be` (et
`enseignants-dev.lucie-iip.be` pour la dev). Rien de Lucie n'y entre ; Lucie relève et dépose comme pour les étudiants.

## Ce qu'il faut faire, dans l'ordre (dev d'abord)

1. **DNS** : deux enregistrements vers le VPS, comme `etudiants` et `etudiants-dev` :
   `enseignants-dev.lucie-iip.be` et `enseignants.lucie-iip.be`.
2. **Caddy** : reprendre dans `/opt/lucie/Caddyfile` les deux blocs `enseignants…` de `Caddyfile.vps` (ils renvoient vers
   `portail-frontend-dev` et `portail-frontend`), puis recharger Caddy.
3. **docker-compose** : ajouter `ENSEIGNANTS_URL_PUBLIQUE` aux quatre services, comme dans `docker-compose.vps.yml`
   (backend de Lucie et backend du portail, dev et production). Aucun nouveau secret.
4. **Images** : `pull` puis `up -d --force-recreate` des conteneurs du portail (backend et frontend) et du backend de Lucie.
5. **Vérifier** : `https://enseignants-dev.lucie-iip.be` montre « Lucie · espace enseignant » ; `/api/enseignant/appareil`
   répond `{"reconnu":false}`.

## Le QR de présence dans l'espace (3.5.136) — un secret de plus

L'espace signe lui-même le QR de présence avec une clé **à part**, qui ne sert qu'à ce QR. Elle doit être **la même** sur le
backend de Lucie et sur le backend du portail, une valeur pour la dev, une autre pour la production (32 caractères au moins) :

```
openssl rand -base64 48
```

Dans `/opt/lucie/.env` : `PRESENCE_QR_ESPACE_SECRET_DEV=…` et `PRESENCE_QR_ESPACE_SECRET_PROD=…` ; dans le docker-compose,
`PRESENCE_QR_ESPACE_SECRET` aux quatre services, comme dans `docker-compose.vps.yml`. Sans elle, l'espace le dit (« le QR
n'est pas encore installé ») et rien d'autre ne change. Ne jamais l'écrire dans le dépôt.

## Puis, dans Lucie (la direction)

Configuration → Accès → **Mise en service** → « L'espace enseignant » : d'abord **en essai** pour quelques comptes, puis
pour tous. Seuls les comptes **reliés à une fiche de professeur** (Personnel → fiche → Accès Lucie) ont un espace.
L'enseignant demande son lien de première visite sur le site, avec son adresse de l'institut, et choisit son mot de passe.
