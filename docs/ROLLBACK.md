# Runbook : Mise en production & rollback — Attributions IIP (GestIIP)

**Responsable :** Jérôme · **Fréquence :** à chaque promotion dev → prod
**Dernière mise à jour :** 2026-05-30

---

## Objectif

Promouvoir en prod une fonctionnalité testée et validée en dev (`develop`), tout
en gardant un filet de sécurité : pouvoir revenir à la version précédente en
quelques minutes si la fonctionnalité casse une fois en production.

Le principe : **avant** la mise en prod on note la version de repli et on
sauvegarde la base ; **après**, on vérifie ; si ça casse, on rollback.

---

## Rappels infra (pour comprendre les commandes)

- **Repo :** `jeromevde77/attributions-iip` — branche `main` = prod, `develop` = dev.
- **Images :** publiées sur ghcr à chaque push. Taguées `:latest` **et** avec le
  **SHA complet du commit** (ex. `:6dc83ba7a21f55adf93c1b3c6209adccd0e32959`).
  → on peut donc toujours redéployer une version précise par son SHA.
- **Prod sur le NAS :** `/volume1/docker/attributions-app/` — compose pointe sur
  `ghcr.io/jeromevde77/attributions-{backend,frontend}:latest`.
- **Déploiement :** `auto-update.sh` (cron DSM, ~chaque minute) pull `:latest` et
  redémarre uniquement les conteneurs dont l'image a changé.
- **Base prod :** volume SQLite à `/volume1/docker/attributions-app/backend/data/attributions.db`.
- **Version visible :** affichée en bas de la fenêtre = SHA court (7 car.) du
  commit depuis lequel le frontend a été buildé.

---

## Prérequis

- [ ] Accès SSH au NAS (`admin@PowerXHD`)
- [ ] Accès au repo (clone local + droits de push sur `main`)
- [ ] La fonctionnalité fonctionne **en dev** (port `10801`) avant de promouvoir

---

## Procédure de mise en production

### Étape 1 : Noter la version de repli (rollback point)

Avant tout, on capture le SHA prod actuel — c'est la cible du rollback.

```bash
git fetch origin
git log --oneline origin/main -1
```

**Résultat attendu :** un SHA (ex. `6dc83ba ...`). **Note-le quelque part.**
(C'est aussi celui affiché en bas de la fenêtre de la prod en ce moment.)

### Étape 2 : Sauvegarder la base prod

```bash
ssh admin@PowerXHD
cd /volume1/docker/attributions-app
sudo cp backend/data/attributions.db "backend/data/attributions.db.bak-$(date +%Y%m%d-%H%M)"
ls -lh backend/data/attributions.db.bak-*
```

**Résultat attendu :** un fichier `.bak-AAAAMMJJ-HHMM` créé.
**Pourquoi :** un rollback de code ne défait PAS une migration de schéma/données.
Cette copie permet de restaurer la DB si besoin (voir Rollback C).

### Étape 3 : Promouvoir dev → prod

Depuis ton clone local :

```bash
git checkout main
git merge develop
git push origin main
```

**Résultat attendu :** push accepté. Le CI rebuild les images `:latest`.
**Si échec (conflit) :** résous le conflit, `git commit`, puis `git push`.

### Étape 4 : Attendre le déploiement

Compter **2 à 3 minutes** (build CI + cycle du cron).

---

## Vérification

- [ ] En bas de la fenêtre prod (après `Ctrl+Shift+R`), le SHA = le **nouveau** commit
- [ ] La fonctionnalité promue marche en prod (smoke test)
- [ ] Les fonctions critiques marchent toujours (connexion, génération PV, attributions)

Si tout est OK → terminé. Sinon → Rollback ci-dessous.

---

## Rollback

### Rollback A — `git revert` (chemin standard, propre)

À privilégier dès que la prod n'est pas totalement à terre. Garde git, images et
prod cohérents. Coût : ~2-3 min (CI + cron).

```bash
git checkout main

# Cas 1 : annuler un commit simple
git revert --no-edit <SHA_du_commit_fautif>

# Cas 2 : annuler un merge (le merge dev→prod de l'étape 3)
git revert --no-edit -m 1 <SHA_du_merge>

git push origin main
```

**Résultat attendu :** après 2-3 min, la prod revient au comportement précédent
(le footer affiche un nouveau SHA = le commit de revert, mais le code est l'ancien).

### Rollback B — épinglage sur le SHA de repli (urgence, instantané)

Quand la prod est cassée et qu'on ne peut pas attendre le CI. Redéploie
directement l'image known-good (déjà sur ghcr).

1. **Mettre en pause** la tâche `auto-update` dans **DSM → Planificateur de tâches**
   (sinon le cron re-pull `:latest` = la version cassée et écrase le rollback).

2. Récupérer le SHA complet de la version de repli (notée à l'étape 1) :
   ```bash
   git rev-parse <SHA_court_de_repli>   # ex. git rev-parse 6dc83ba
   ```

3. Sur le NAS, éditer le compose pour pointer sur ce SHA :
   ```bash
   cd /volume1/docker/attributions-app
   sudo cp docker-compose.yml docker-compose.yml.bak
   # Remplacer ':latest' par ':<SHA_complet>' sur les lignes image: backend ET frontend
   sudo vi docker-compose.yml
   sudo docker compose pull
   sudo docker compose up -d
   ```

4. **Vérifier :** le footer affiche le SHA de repli, la prod refonctionne.

5. **Une fois `main` réparé** (Rollback A poussé + CI terminé) : remettre
   `:latest` dans le compose, `docker compose up -d`, puis **réactiver** la tâche
   `auto-update` dans DSM.

### Rollback C — restaurer la base (seulement si migration de données)

À faire UNIQUEMENT si le déploiement a modifié/corrompu la DB et que A ou B ne
suffit pas. **Destructif** : on écrase la DB courante.

```bash
cd /volume1/docker/attributions-app
sudo docker compose stop backend
sudo cp backend/data/attributions.db.bak-AAAAMMJJ-HHMM backend/data/attributions.db
sudo docker compose up -d backend
```

**Résultat attendu :** la DB revient à l'état d'avant la promotion.
**Attention :** toutes les données saisies en prod APRÈS la sauvegarde sont perdues.

---

## Dépannage

| Symptôme | Cause probable | Fix |
|----------|----------------|-----|
| Footer affiche encore l'ancien SHA après 3 min | Cron pas encore passé / cache navigateur | Attendre 1-2 min, puis `Ctrl+Shift+R` |
| Footer ne change jamais | CI échoué (image jamais publiée) | Vérifier l'onglet Actions du repo ; corriger et re-pusher |
| Rollback B annulé tout seul | Tâche `auto-update` toujours active → re-pull `:latest` | Mettre la tâche en pause dans DSM avant d'épingler |
| `no such column` / erreur SQL après déploiement | Migration partielle / schéma incohérent | Rollback A, et si la DB est touchée, Rollback C |
| `docker compose pull` échoue | ghcr inaccessible / login expiré | Vérifier la connexion ; `docker login ghcr.io` si besoin |

---

## Historique

| Date | Par | Notes |
|------|-----|-------|
| 2026-05-30 | Jérôme | Création du runbook après session de hotfix PV recours/fraude |
