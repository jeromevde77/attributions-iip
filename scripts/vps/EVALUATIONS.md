# L'évaluation du personnel — la clé de chiffrement (Jérôme)

Version 3.5.605. Les grilles, comptes rendus et observations sont chiffrés en base par une clé **propre au module**, posée
**sur la production seule**. Sans elle, le module de la production refuse d'écrire (message à l'écran : « Clé de chiffrement des
évaluations absente »). La dev n'en a pas besoin : elle prend une clé d'essai, et les évaluations réelles recopiées depuis la
production y restent illisibles — c'est voulu.

1. Fabriquer la clé (une fois) :

   ```bash
   openssl rand -base64 32
   ```

   (Node n'est pas installé sur le VPS : `node -e …` y répond « command not found ».)

2. L'ajouter au `.env` de `/opt/lucie` : `EVAL_KEY=<la valeur>`. Ne l'écrire nulle part ailleurs (ni dépôt, ni courriel, ni
   conversation). La garder aussi dans le coffre de l'école : **perdue, elle rend toutes les évaluations illisibles ; elle ne se
   régénère pas.**
3. Dans `/opt/lucie/docker-compose.yml`, service `backend` (production), sous `MFA_KEY`, ajouter : `EVAL_KEY: ${EVAL_KEY:-}`
   (copie de référence : `docker-compose.vps.yml`).
4. `cd /opt/lucie && sudo docker compose up -d --force-recreate backend`.
5. Vérifier : Personnel → Évaluations, après le code, n'affiche plus l'encadré rouge.

Les sauvegardes vers le NAS emportent le contenu chiffré ; la clé n'y est pas.
