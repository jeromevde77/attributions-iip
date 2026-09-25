# CLAUDE.md — Lucie / Institut Ilya Prigogine

Contexte permanent pour toute session d'assistance travaillant sur **Lucie**,
l'application de gestion académique de l'Institut Ilya Prigogine (IIP).
À lire avant d'écrire une ligne de code ou de produire un document.

> **Pourquoi ce fichier est dans le dépôt et non ailleurs.** Ce contexte a
> longtemps vécu dans un compte d'assistant : il se perdait à chaque changement
> de compte, alors que le code, lui, ne risquait rien. Il vit désormais avec le
> code, versionné comme lui.

---

## 1. Qui est qui

| Rôle | Personne |
|---|---|
| Technicien / développeur | **Jérôme** (Directeur IT & Facilities EPFC, ingénieur civil, 25 ans en sécurité IT) |
| Analyste fonctionnel, décideur métier | **Charles Sohet**, directeur de l'IIP |
| Conseillère qualité | **Amélie Verkest** — également chargée du développement des compétences du personnel. Elle observe, rapporte, et donne l'image de ce qui est fait et de ce qui doit l'être : c'est elle que sert la démarche qualité |
| Utilisateurs | secrétariat (2 secrétaires + 1 adjoint), enseignants, direction |

**Langue de travail : le français.** Style direct, exécutif. Les documents
destinés à l'école expliquent **le travail, pas l'informatique**.

**Établissement :** IIP — N° ECOT 5222132070, FASE 292, Campus Erasme,
Route de Lennik 808, 1070 Anderlecht. Enseignement pour adultes (FWB).
Sections : TIM (la plus grande), Psychomotricité, AeSI (soins infirmiers,
ouverte en 2026-2027). ~588 étudiants.

---

## 2. Les règles de travail qui priment

1. **Ne jamais dire « c'est corrigé » sans vérification concrète.**
   Vérifier en base, contrôler la version affichée dans Lucie, et **faire
   confirmer à l'écran** avant d'affirmer quoi que ce soit.
2. **Lire le code, ne pas supposer la structure.** `grep` la définition
   (contrainte SQL, clé de map, nom de colonne) *avant* d'écrire la requête.
   C'est la source d'erreur n°1 historiquement.
3. **Ne rien trancher à sa place.** « À méditer » est une question ouverte, pas
   une commande. Poser la question bloquante (une minute) plutôt que coder trois
   heures sur une hypothèse.
4. **Chercher avant de construire.** Deux fonctions déjà écrites ont été
   redéveloppées en double faute d'avoir cherché au bon endroit : la
   restauration de sauvegarde (elle était dans `historique.js`, pas dans
   `sauvegardes.js`) et une seconde enveloppe de document. Avant d'écrire une
   fonctionnalité, chercher son nom **et ses synonymes** dans tout le dépôt.
5. **Ne jamais porter vers `main` ce qui est marqué « à venir ».**

### Le catalogue des erreurs déjà commises

- `ON CONFLICT(ue_num, cours_code, aa_code)` alors que la contrainte réelle est
  `(cours_code, aa_code)` → **tout l'import échouait silencieusement**.
- Codes d'acquis écrits `246.1` au lieu de `AA246.1` → colonnes vides.
- Notes écrites sous la clé `session|acquis` alors que le calcul cherche
  `cours|acquis` → « aucune note » sur des données pourtant présentes.
- `sticky` posé sans vérifier quel conteneur défile réellement → sans effet.
- Un `<style>` injecté **après `</html>`** (`due.js`) ou au milieu du corps
  (`diplomes.js`) → casse le saut de page.
- Une règle de mise en page laissée **à la charge de chaque écran** : sept
  écrans sans rail propre sont passés sous le rail. Une règle qui n'est juste
  que si l'on y pense est une règle fausse — **le défaut doit être correct**.
- Affirmer un détail visuel sans capture : un guide a annoncé un « liseré
  doré » pour les UE inscrites alors que c'est une **pastille ronde** (le cadre
  doré est réservé à l'épreuve intégrée).
- **La section d'une UE n'est pas toujours un rattachement.** L'UE 95 portait
  « Restart » parce que l'import de mai l'avait rangée là ; elle s'ajoute au
  programme d'étudiants de plusieurs sections. Compter par `ue.section` versait
  donc TOUTES ses inscriptions dans Restart — effectifs, taux et cotes d'une
  section entière faussés en silence. Depuis 2.11.1, une case **« hors
  cursus »** sur l'unité : ses dossiers se comptent dans la section **de
  l'étudiant** (`etudiant.section_rattachement`, déduction à défaut — et la
  déduction ignore les unités hors cursus). Un effectif, lui, reste la taille
  d'un groupe : un groupe hors cursus est mixte, il sort des effectifs par
  section au lieu d'être attribué à l'une d'elles.

### Ce qui est décidé dans le code et devrait se régler à l'écran

Deux réglages attendus se sont révélés **codés en dur**, donc invisibles et
indiscutables. Il en reste sans doute : les nommer plutôt que les découvrir.

- ~~La base de délibération de **seconde session**~~ — réglable depuis 1.27.0.
- Le **seuil de réussite de l'unité** (10/20) : c'est le décret, il ne doit
  **pas** devenir réglable.
- ~~La règle de **report des notes** d'une session à l'autre~~ — vérifiée et
  corrigée en 2.9.5. La préséance se faisait au seul RANG DE SESSION : une
  note « s2| » recouvrait celle de juin pour toujours. On corrigeait donc une
  note de première session, on retirait l'ajournement du cours, et la note de
  septembre — qui ne correspondait plus à aucune épreuve — continuait de
  gagner, en silence. **Une note de seconde session ne vaut que pour ce qui a
  été représenté** : retirer l'ajournement rend la main à la note de juin.
  Garde-fou : si la première session n'a laissé aucune trace d'ajournement —
  ni cours, ni acquis —, l'ancienne règle s'applique, faute de savoir ce qui
  était à représenter ; mieux vaut ne rien changer que modifier à l'aveugle
  une décision déjà notifiée.
- La cote montrée à un **ajourné dont la moyenne d'unité dépasse dix** : elle
  vaut aujourd'hui cette moyenne, alors que l'unité n'est pas acquise. À
  trancher avec Charles.

**Deux sources pour un même fait, c'est une source de moins.** L'épreuve
intégrée s'écrivait dans `ue.is_epreuve_integree` (case du référentiel) et se
lisait dans `ue_epreuve_integree` (table annuelle) : la case ne faisait rien,
en silence. Les deux s'écrivent et se lisent désormais ensemble — la ligne
annuelle l'emporte quand elle existe.

---

## 3. Environnement technique

**Stack** : Node/Express + `better-sqlite3` · React/Vite · Tailwind · Docker sur
NAS Synology.

| Environnement | Branche | Image | Adresse | Données |
|---|---|---|---|---|
| Production | `main` | `:latest` | **https://www.lucie-iip.be** | réelles |
| Développement | `develop` | `:dev` | **https://dev.lucie-iip.be** | copie synchronisée |

> **Déménagement du 17 septembre 2026.** Le service a quitté le NAS pour un
> **VPS OVH**, derrière **Caddy** (TLS, certificats Let's Encrypt automatiques).
> Les bases ont été synchronisées et la **sauvegarde de la base part vers le
> NAS**. **Dev ET prod vivent sur le même VPS**, chacun sur son réseau Docker
> (`lucie-prod`, `lucie-dev`) ; Caddy rejoint les deux et publie seul 80 et 443,
> aucun autre port n'étant exposé. Le frontend (nginx) fait lui-même le
> `proxy_pass` de `/api/` vers l'alias réseau `backend:3001` : **le navigateur
> ne parle qu'à une seule origine, et le CORS n'entre pas en jeu** en usage
> normal. `Caddyfile.vps` et `docker-compose.vps.yml` sont les **copies de
> référence** de `/opt/lucie/Caddyfile` et `/opt/lucie/docker-compose.yml` — à
> tenir à jour avec eux, sans quoi le dépôt décrit une installation qui
> n'existe pas. Les `docker-compose` du NAS sont conservés pour mémoire et
> marqués **héritage**. Les images ne se mettent pas à jour seules :
> `docker compose pull` puis `up -d`. Les anciennes adresses `server.domobel.be:10800` et `:10801`
> ne valent plus. Trois endroits portaient une adresse en dur et ont été
> repris : `CORS_ORIGIN` dans les deux `docker-compose` (qui accepte désormais
> une **liste séparée par des virgules** — avec et sans `www`), le repli de
> `LUCIE_URL` dans `services/mailer.js` (les liens des courriels), et la note
> sur l'allowlist de l'eID Reader dans `frontend/src/lib/eid.js`.
> **L'allowlist de l'app eID Reader n'est pas dans ce dépôt** : tant qu'elle
> porte l'ancienne adresse, la lecture de carte échoue en silence.
> La restauration de sauvegarde reste gardée par `NODE_ENV`, non par l'adresse :
> le déménagement ne l'affaiblit pas.

- **Trois comptes sur le VPS** (21 septembre 2026) : `debian` (compte d'origine
  OVH, sudo sans mot de passe), `jeromevde` (Jérôme, mot de passe, groupes
  `sudo` et `docker`), et **`lucie-ops`** — Claude, **sans shell**, clé liée au
  script `/usr/local/sbin/lucie-ops` : `version`, `sauvegarde`, `maj-dev`,
  `maj-prod` (qui sauvegarde d'abord), `lecture "<SELECT…>"`. Depuis le Mac :
  `ssh lucie-vps <verbe>`. Toute écriture en base reste un geste de Jérôme.
  Détail et révocation : `scripts/vps/INSTALLATION.md` ; journal :
  `sudo journalctl -t lucie-ops`. La connexion par mot de passe reste ouverte
  (choix de Jérôme) : ne pas poser `PasswordAuthentication no`.
- Base : `/app/data/attributions.db` dans le conteneur. **SQLite3 n'est pas
  installé** → interroger via `node -e "const Database = require('better-sqlite3') …"`.
- La **base de dev est séparée** (volume `attributions-data-dev`) : aucun risque
  pour la production.
- Chaque poussée sur `develop` déclenche la construction des images `:dev`
  (GitHub Actions, `build-dev.yml`). Compter quelques minutes, puis un `pull`.
- **VERSION est à la racine** et alimente le badge de version de l'interface.
  Pousser VERSION et le code **dans un seul commit** : le tag est partagé, et
  « le dernier build qui finit gagne ».
- `git fetch origin 'main:refs/remotes/origin/main' --force` **avant** tout
  checkout — refs locaux périmés, vécu plus de cinq fois.
- Routes Express : les **spécifiques avant les paramétriques**.
- `git pull -X theirs` : **interdit**.
- **Ne jamais écrire un jeton en clair** dans un document, un commit ou une
  conversation. Un jeton l'a été ; il doit être révoqué.

> **LE BADGE NE PARLAIT QUE DE LA MOITIÉ, ET ON A CHERCHÉ TROIS FOIS DANS DU
> CODE QUI NE TOURNAIT PAS.** Le numéro de version affiché est compilé DANS
> l'image du frontend (`BUILD_VERSION`, passé en build-arg par l'action) : il
> dit ce que sert nginx, et rien d'autre. Le backend, lui, n'avait AUCUN moyen
> de se nommer — le fichier `VERSION` est à la racine du dépôt, le contexte de
> construction de son image est `./backend`, il n'y entrait donc jamais, et
> `/api/info` annonçait « 1.0.0 » écrit en dur depuis toujours. Or les deux
> moitiés se déploient séparément et se sont retrouvées sur deux versions
> différentes plusieurs fois dans la même journée, `docker compose up -d`
> répondant « Running » sans avoir remplacé le conteneur.
>
> Depuis 2.12.61 : `BUILD_VERSION` et `GIT_SHA` sont passés aussi à l'image du
> backend, **`GET /api/version` les rend sans authentification** (comme
> `/api/health` — la version du frontend est déjà publique dans le bundle, et
> le contrôle doit pouvoir se faire depuis le VPS, qui n'a pas de session), et
> **le badge affiche l'écart** : `v2.12.61 ≠ 2.12.57`, cerclé d'ocre, avec au
> survol la commande qui le répare. Un écart de déploiement ne se cherche plus,
> il se voit.
>
> **Et `docker compose up -d` ne suffit pas** : c'est
> `docker compose up -d --force-recreate` qui garantit le remplacement.

### Restaurer des données réelles en dev

Configuration → Sauvegardes → *Télécharger* en **prod**
(www.lucie-iip.be), puis, sur **dev** (dev.lucie-iip.be), même écran, section
rouge « Restauration de la base ». La route valide
le fichier, sauvegarde l'état courant sous `backups-auto/`, remet l'ancienne
base si la nouvelle s'avère illisible, et redémarre. **Elle refuse de
s'exécuter hors développement**, côté serveur.

### Sauvegarde avant tout merge vers `main`

Sur le VPS OVH, la base de production vit dans `/opt/lucie/prod/data/` :

```bash
cd /opt/lucie
cp prod/data/attributions.db prod/backups/avant_merge_$(date +%Y%m%d).db
ls -lh prod/backups/avant_merge_*.db | tail -1
```

> La copie va dans `prod/backups/`, qui est monté hors du dossier de la base :
> une sauvegarde rangée à côté de ce qu'elle protège disparaît avec lui. C'est
> aussi ce dossier que la sauvegarde automatique vers le NAS surveille.
> La ligne `ls` n'est pas une politesse : une copie qu'on ne regarde pas est
> une copie dont on ignore si elle a eu lieu.
>
> Pour mémoire, avant le déménagement, c'était
> `/volume1/docker/attributions-app/backend/data/attributions.db`.

### Workflow de branches

`develop` (validation à l'écran par Jérôme) → **puis seulement** `main`.
Jamais de poussée directe en production. Les migrations sont additives et
protégées par contrôle d'existence, mais restent à surveiller.

---

## 4. Le modèle de calcul — dicté par le métier, à ne pas réinventer

Trois niveaux :

1. **Note par cours** — affichée, **indicative**. Moyenne des acquis pondérée
   par leur poids *dans ce cours* (les poids somment à 100 par cours).
2. **Note consolidée par acquis** — **calculée par le classeur Excel**
   (colonnes `/20`). C'est elle que l'import reprend, **c'est elle qui fait foi
   légalement**.
3. **Note d'unité** :

   ```
   Σ ( note_AA × poids_AA_dans_le_cours × poids_du_cours )
   ───────────────────────────────────────────────────────
   Σ ( 20      × poids_AA_dans_le_cours × poids_du_cours )
   ```

   **Un acquis non évalué sort du dénominateur** — il ne vaut pas zéro.

**Arrondi à l'unité.** 9,6 devient 10 et l'étudiant réussit. Seule la moyenne
générale de tout le parcours garde ses décimales.

**Bascule par millésime :** 2024-25 et 2025-26 → pondération **du classeur**
(`cours_ponderation`, `aa_ponderation`) ; à partir de 2026-27 → **périodes** du
dossier pédagogique pour le poids des COURS (un poids saisi reste permis, UE
par UE, comme exception), et **10 points par cours**, par pas de 0,5, répartis
entre ses acquis (Charles, 25 septembre 2026).

> **LES POIDS ONT UNE ANNÉE** (2.12.179). Les deux tables n'en avaient pas :
> régler 2026-2027 aurait réécrit les notes de 2024-2025 et 2025-2026. Toute
> requête sur `aa_ponderation` ou `cours_ponderation` porte désormais
> `annee_scolaire`, et leurs clés d'unicité aussi —
> `(annee_scolaire, cours_code, aa_code)` et `(annee_scolaire, ue_num,
> cours_code)`. La migration a recopié les lignes existantes dans chaque
> année antérieure (calcul inchangé, vérifié avant/après) ; en 2026-2027, les
> points des acquis sont repris, pas les poids des cours. La création d'une
> année reprend les points des acquis, jamais les poids des cours.
> **À venir :** l'écran Organisation → Pondérations (maquette validée le
> 25/09), puis la validation par la direction ou la direction adjointe, qui
> gèle l'UE et, à partir de 2026-2027, conditionne la délibération.

**Structure du classeur de suivi** (établie par lecture, pas supposée) :
feuille d'une UE — ligne 8 cours, ligne 10 poids du cours, ligne 11 poids de
l'acquis dans le cours, ligne 12 code de l'acquis ; colonnes 12→206 notes par
cours (non importées), colonnes 207+ notes consolidées `/20` (importées).
Onglet `Repartition_AA_UE` — ligne 4 n° d'UE, ligne 7 codes de cours, ligne 15
poids du cours, lignes 17+ poids des acquis.

---

## 5. Règles métier de la délibération

*(décret du 16/04/1991, RGE/ROI IIP, circulaire Sanction des études)*

- **Pas de compensation entre acquis.** L'attestation va à qui maîtrise **tous**
  les acquis (art. 77 §1, 78 §2). Un seul acquis en défaut → « ajourné » en 1ʳᵉ
  session, « refusé » en 2ᵈᵉ (art. 69 §2). La note d'unité ne rattrape rien.
- **En seconde session, « ajourné » n'existe pas** : il n'y a rien après. Aucun
  bouton d'ajournement ni de « à représenter » ne doit y apparaître.
- **La faveur est un octroi**, le seul levier du Conseil : elle porte l'unité
  **exactement au seuil** et laisse trace. Sur les documents de l'étudiant, une
  unité octroyée vaut **10 partout** — chaque acquis, chaque cours, l'unité —
  sans quoi le document se contredit lui-même. Couleur : **violet**, icône
  cadeau (l'orange sert aux cotes tout justes).
- **Jamais de cote sous 10 sur un document remis à l'étudiant** : c'est « NA »
  (circulaire Sanction des études). La grille de délibération, elle, est un
  document du Conseil et garde les cotes de travail.
- **Quorum des deux tiers** sur les voix délibératives, opposé **à la clôture**
  (art. 25 §1). Distinguer « quorum manquant » de « appel des présences jamais
  fait ».
- **Toute décision défavorable est motivée**, acquis par acquis (RDE art. 88 §3).
  Lucie propose un énoncé quand la case reste vide — l'annexe ne part jamais
  avec un blanc — mais **ne l'écrit pas** : la proposition se calcule à la
  lecture, et la clôture demande **une seule fois** de confirmer celles restées
  telles quelles. Confirmées, elles s'enregistrent avec `source = 'propose'` :
  un an plus tard, ce que le Conseil a rédigé se distingue encore de ce qui a
  été accepté en bloc.
- **Réouverture d'une séance close** : réservée à la direction, **motif écrit
  obligatoire**, conservé au dossier.
- **Une motivation inventée se défend plus mal qu'un motif absent.**
- Une reprise d'historique ne doit **jamais** pouvoir se faire passer pour une
  délibération tenue. Les années importées d'Excel se clôturent donc par la
  **reprise d'archives** (Configuration → *Clôturer une année reprise*) : elle
  écrit un énoncé **uniforme** — volontairement, une phrase individualisée
  laisserait croire à un examen qui n'a pas eu lieu — sous la provenance
  `source = 'reprise'`, marque la séance `reprise = 1`, et fait porter à la
  pièce remise à l'étudiant la mention qui le lui dit. Elle est **additive** :
  aucune décision changée, aucune faveur octroyée, aucune motivation écrasée.
  Trois provenances désormais, et elles ne se valent pas : `conseil` (rédigée
  en séance), `propose` (proposée par Lucie, acceptée en bloc à la clôture),
  `reprise` (reconstituée après coup par l'administration).

**La valorisation des acquis a sa séance.** Le procès-verbal d'annexe 4 et les
attestations qui en découlent (annexe 15 pour le supérieur, 14 pour le
secondaire) existaient côté serveur sans qu'aucun écran ne les demande : une
pièce que personne ne peut produire n'existe pas. Depuis 2.11.7, une table
`valorisation_seance` propre — et non la séance de délibération, dont la clé
unique porte la SESSION, que la valorisation n'a pas — porte la date de séance,
la date de communication et la présidence ; `valorisation_presence` porte les
présences, et le quorum se calcule avec la même fonction que la délibération.
**Le serveur refuse de produire tant qu'il manque une valeur** : un PV sorti à
trous se complète à la main, et c'est cette main qu'on ne retrouve plus un an
après. Le **nombre de pages**, lui, ne se saisit pas : il se constate — la pièce
est composée une première fois pour être comptée. L'écran est le bouton
*Documents* de l'onglet VA de la fiche étudiant, et ce qui en sort concerne
**l'unité entière**, pas le seul étudiant dont on a la fiche sous les yeux.

**Une valorisation se décide sur pièces, et elle se motive.** Depuis 2.11.8, le
numéro d'unité ne se tape plus : **section → unité**, liste filtrée, celles du
PAE en tête — on ne valorise qu'une unité de chez nous, et le serveur refuse un
numéro inconnu du référentiel. Les **acquis reconnus équivalents** se cochent un
à un (tous en dispense complète, c'est ce que le mot veut dire), chacun avec son
constat écrit : une phrase proposée **par le serveur** — deux libellés, un
affiché et un enregistré, finiraient par diverger — remplaçable, jamais un
blanc. Les **preuves** (PDF, image, Word, tableur ; 25 Mo) se déposent sur
chaque valorisation et partent avec elle, disque compris. Leur **nom se
construit** — `CI_DE-WILDE_Jean-Eric_UE95_20252026.pdf` — à partir de la nature
demandée au dépôt : « 23453.docx » ne dit rien, et six mois plus tard on ouvre
douze fichiers un par un pour retrouver la carte d'identité. Le procès-verbal porte
enfin les mentions que le modèle exige : code approuvé par le Gouvernement,
ECTS, total des périodes **et leur répartition par activité d'enseignement**,
cours par cours — leur absence bloque l'impression comme le reste.

**Une attestation ne se produisait pas, et rien ne le disait.** Les attestations
de valorisation passaient par `unitesReussies()`, qui ne lit que les
inscriptions marquées « réussi » **par une délibération** ; une unité acquise
par valorisation n'en a pas, la description revenait vide, le filtre écartait
l'étudiant — zéro attestation, en silence. Depuis 2.11.10, la description d'une
unité est `decrireUnite()`, commune aux deux voies : la délibération y entre
avec des points sur 20, la valorisation avec le pourcentage arrêté par le
Conseil. Les mentions manquantes de l'attestation rejoignent la barrière du PV —
elles étaient signalées dans un coin de la réponse que personne ne lisait.
**Une pièce par onglet, c'est une pièce tout court** : le navigateur bloque les
fenêtres successives, si bien que seul le PV sortait. Depuis 2.11.11, les pièces
d'une même production partent dans **une seule enveloppe**, chacune sur sa page —
la règle que suivait déjà le centre d'impression des unités.

**Une pièce s'envoie à qui elle nomme, et cela ne se choisit pas.** Depuis
2.11.12, le catalogue déclare le destinataire de chaque document : `etudiant`
(la personne nommée dessus), `professeur`, ou `conseil` — et « conseil » veut
dire **toute la composition**, présents et absents, plus la **boîte de service
des examens** (en configuration, jamais en dur) et la **direction adjointe par
rôle**. La direction y figure parce qu'elle est membre du Conseil, non parce
qu'elle est la direction. `GET /api/envois/destinataires` calcule la liste ;
l'écran la montre et permet d'en retirer quelqu'un, jamais d'ajouter un
destinataire que la pièce ne concerne pas. **Adresse école uniquement** pour un
étudiant : l'adresse privée n'est pas un repli, c'est une autre destination — et
celui qui n'a pas d'adresse d'école reste **visible** dans la liste, marqué,
plutôt que d'en disparaître. Envoyer est réservé au secrétariat, à la direction
adjointe, à la direction et à l'administrateur ; **un seul mot
d'accompagnement**, servi par le serveur : il annonce la pièce, il ne la résume
pas — ce qui fait foi est le document. Enfin, un envoi force **un document par
personne** : on n'adresse à quelqu'un un fichier qui porte vingt noms.

**Une consigne donnée dans un couloir doit pouvoir se consigner.** Le modèle
permettait depuis l'origine une tâche sans réunion — `reunion_id` est facultatif
sur la table `tache` —, mais le seul écran qui en créait était celui d'une
réunion : la consigne n'avait nulle part où aller, et « je te l'avais demandé »
ne se vérifie pas. Depuis 2.11.13, **Accueil → Action → Confier une tâche** :
quoi, à qui, pour quand, priorité. Elle rejoint le même registre et paraît
aussitôt dans « Ce que j'ai confié ». **Une personne, jamais un texte libre** —
et la liste vient du personnel *et* des comptes, les enseignants n'en ayant pas.

**La liste d'une dispense partielle vient de l'UNITÉ, pas du programme.** Elle
était chargée depuis « les cours auxquels l'étudiant est inscrit » — cohérent
tant que l'unité se devinait de ce programme. Depuis que l'unité se choisit
dans le catalogue de la section (2.11.8), une unité pas encore au PAE rendait
une liste **vide** : on cochait « par cours » et il ne restait à l'écran que les
acquis, plus bas — d'où l'impression que Lucie proposait les AA au lieu des
cours. Corrigé en 2.11.14 : les composantes de l'unité font foi, les notes déjà
obtenues s'y ajoutent quand il y en a, et le champ de note disparaît en mode
« par acquis » — le report se fait par COURS, c'est ce que porte
`etudiant_report_note`.

**Le procès-verbal d'une dispense partielle doit dire TROIS choses**, et il
n'en disait que deux. Le texte est explicite : les activités d'enseignement
dispensées, les acquis d'apprentissage maîtrisés, **et les acquis qui restent
encore à évaluer**. La troisième n'existait nulle part — sans elle, une dispense
partielle se lit comme une dispense d'unité. Depuis 2.11.16 elle se **déduit**
(tous les acquis de l'unité, moins ceux reconnus) plutôt que de se saisir : une
mention qu'il faut penser à écrire est une mention oubliée une fois sur deux. La
**remarque du Conseil** s'imprime enfin — elle était enregistrée et jamais lue,
alors que c'est là qu'on écrit « dispensé des heures de stage, mais doit
présenter l'examen » : une condition que le PV tait n'a jamais été posée. Deux
mentions de cadre l'accompagnent, quand au moins une dispense est partielle : le
fondement de l'évaluation, et l'exclusion — **la dispense ne s'applique jamais
aux évaluations, tests, rapports ou épreuves de stage ou d'activités
professionnelles**. Le fondement distingue « sur dossier » de « après test
complémentaire », d'où une colonne `test_complementaire` sur la séance et une
case à l'écran : la mention aurait été muette pour toujours.

**« Promotion sociale » est devenu « Enseignement pour adultes »**, et le nom de
l'établissement est **Institut Ilya Prigogine** — l'en-tête des attestations, des
PV, des diplômes, les pieds de page et le contrat de travail en portaient encore
l'ancien. Deux endroits n'ont **pas** été renommés, et ce n'est pas un oubli :
le **visa du décret du 16 avril 1991**, dont c'est le titre officiel — un visa
faux fait tomber la pièce —, et la valeur `etab_nom` en base, qui vit dans
Configuration → Établissement et écrase celle du code.

**Une valorisation se corrige, et une demande peut se refuser.** La table ne
connaissait que des dispenses accordées et n'offrait aucune modification : une
faute de frappe imposait de SUPPRIMER — ce qui emporte les preuves déposées avec
la décision —, et un refus n'avait nulle part où s'écrire, donc il ne s'écrivait
pas. Une demande dont rien ne garde trace se réintroduit l'année suivante, sans
qu'on sache qu'elle a déjà été examinée. Depuis 2.11.17 : `PUT
/valorisations/:vid` corrige sans toucher aux preuves — **la même règle de
validation qu'à la création**, sans quoi on aurait bâti une porte dérobée pour
écrire ce que la porte d'entrée refuse —, et deux colonnes (`decision`,
`motif_refus`) portent le refus. **Un refus se motive** (RDE art. 88 §3) : le
bouton reste gris tant que le motif est vide. Sur le procès-verbal, la colonne
« Réussite / Refus » dit *Refus*, la colonne de dispense porte le motif, le
garde-fou n'exige plus de pourcentage là où il n'y a rien à porter, et aucune
attestation de réussite ne se tire d'un refus.

**UNE SÉANCE DE VALORISATION SE TIENT PAR UNITÉ, PAS PAR DOSSIER.** Le conseil
des études d'une unité examine les demandes en SÉRIE : même unité, même séance,
même dispense, souvent le même constat d'équivalence — huit dossiers de reprise
d'études qui portent le même diplôme antérieur. Lucie faisait naître huit
valorisations « partielles et vides », qu'il fallait ensuite ouvrir et remplir
huit fois : on écrivait huit fois ce que le Conseil a décidé une fois, avec huit
occasions de se tromper d'une case. Depuis 2.12.36, *Créer avec la même
dispense* (nommé *Valoriser en série* jusqu'en 2.12.67) —
l'action principale de l'écran, et il n'y en a qu'une : l'UNITÉ d'abord (elle
convoque le conseil), puis les ÉTUDIANTS qu'elle concerne, cochés dans un
tableau, puis LA DÉCISION saisie une fois et portée par tous. Les étudiants
proposés ne se cherchent plus dans les 588 du fichier : ce sont ceux qui ont
l'unité à leur programme.

> **TOUS LES ACQUIS, C'EST L'UNITÉ ENTIÈRE.** Cocher un à un tous les acquis
> d'une unité n'est pas une dispense partielle exhaustive : c'est une dispense
> d'unité, et la pièce doit le dire ainsi — PV d'annexe 4 et attestation de
> réussite. Le choix « toute l'unité » écrit donc une valorisation COMPLÈTE, et
> non une partielle qui lui ressemblerait. Trois portées, et pas une de plus :
> toute l'unité, des cours, des acquis au choix.

> **LE LOT EST TOUT OU RIEN, ET UN DOUBLON L'ARRÊTE.** Une écriture partielle
> serait pire que le refus : on ne saurait pas lesquels sont passés, on
> recommencerait, et les premiers se retrouveraient en double — or deux
> décisions contraires sur une même unité bloquent l'impression du PV, sans
> qu'on sache pourquoi. Un étudiant qui porte déjà une décision sur cette unité
> et cette année A ÉTÉ EXAMINÉ : l'écraser ferait disparaître une décision du
> Conseil sans trace, l'ignorer laisserait croire qu'il a reçu celle du lot. Le
> serveur rend la liste nommée, n'écrit rien, et le secrétariat décoche ou
> corrige à la main. Ces étudiants sont d'ailleurs **décochables mais non
> cochables** dans le tableau : le blocage se voit avant d'être subi.

**UNE VALORISATION EST UN CIRCUIT, PAS UNE DÉCISION — ET C'EST UNE FAUTE RÉELLE
QUI L'A APPRIS.** En septembre 2026, une attestation de réussite
« Valorisation » erronée est sortie de Lucie. En amont, la procédure avait été
contournée par la coordination : pas d'avis écrit du chargé de cours, pas de
base légale, pas de motivation. **La signature de la direction et le cachet de
l'établissement ont pourtant été apposés** — parce que rien, dans le logiciel,
ne savait ce qui aurait dû précéder. Lucie enregistrait UNE DÉCISION ; la
procédure de l'IIP décrit DIX ÉTAPES, avec des délais, des rôles et des motifs
de nature différente. Depuis 2.12.38, `lib/valorisation.js` porte le circuit, et
la règle tient en une phrase :

> **AUCUNE PIÈCE PORTANT UNE SIGNATURE NE SE PRODUIT SI LE CIRCUIT N'A PAS ÉTÉ
> PARCOURU — ET CHAQUE ÉTAPE PORTE LE NOM DE CELUI QUI L'A FAITE.**

Ce que le serveur refuse désormais, et qu'il refusait pas :

- **Ce qui ne peut jamais être valorisé.** L'épreuve intégrée (AGCF art. 4 §3,
  1°) se reconnaît seule ; les trois autres exclusions — UE sans prestations
  d'étudiants, UE qu'une réglementation impose de suivre, et à l'IIP la
  méthodologie de la recherche — se cochent sur l'unité (`ue.valorisation_exclue`
  + motif), parce que les écrire en dur ferait mentir Lucie dès la première
  section qui change. Le motif coché s'imprime tel quel dans le refus.
- **Une dispense partielle ne peut pas couvrir TOUTES les activités de l'UE**
  (RGE art. 29 §2) : c'est une dispense complète déguisée — mêmes effets, sans
  l'attestation, sans le PV d'unité, et l'étudiant reste compté comme régulier.
- **La base de la décision est obligatoire** dès qu'on accorde : VAF V1-V4 ou
  VANFI D/E. C'est elle qui part dans eProm, et **« une décision non encodée est
  une décision non conforme »** (AGCF art. 5 al. 3) — positives ET négatives.
- **Les 50 % ne se saisissent pas** (RDE art. 29 §3 et 30). C'était un champ
  libre pré-rempli : un chiffre modifiable finit par être modifié, et il part
  sur une pièce signée. Le verrou protège l'avenir ; un contrôle à la LECTURE
  signale les lignes déjà écrites hors norme — la barrière rattrape le passé.
- **L'ordre des étapes.** La recevabilité avant l'avis, l'avis avant la
  décision. Un avis sans texte n'est pas un avis : les décisions de VA ne sont
  **pas susceptibles de recours** (RDE art. 30 et 87 §2), la motivation est
  tout ce qui reste.
- **Un refus de forme n'est pas un refus pédagogique.** L'irrecevabilité
  (hors délai, dossier incomplet, pièces non officielles) a sa colonne et son
  motif propres — les confondre produisait des refus dont on ne savait plus, un
  an après, s'ils portaient sur le fond ou sur la procédure. Et toute demande
  s'encode, **recevable ou non**.
- **Le délai (RDE art. 28) se calcule** : ouverture de l'UE si elle est encodée,
  sinon le quinzième jour suivant le premier jour de l'année. La date d'ENVOI
  prime sur celle du formulaire — sans quoi il suffirait d'antidater.

> **L'ÉTAT SE DÉDUIT, IL NE SE DÉCLARE PAS.** Un état qu'on peut poser à la main
> est un état qu'on peut poser à tort, et c'est la faute même qu'on cherche à
> empêcher. Il se lit des traces, dans l'ordre inverse du circuit.

> **LE JOURNAL EST EN AJOUT SEUL** (`valorisation_journal`). Aucune route ne le
> modifie ni ne l'efface, administrateur compris : une trace qu'on peut corriger
> ne prouve rien. Une procédure contournée ne se voit JAMAIS dans l'état final —
> le dossier ressemble à un dossier normal ; c'est la suite des gestes, qui et
> quand, qui la révèle.

> **ET LE TABLEAU DE CE QUI RESTE À FAIRE** (en tête de l'écran) : recevabilités
> non contrôlées, avis en attente, décisions non notifiées, décisions non
> encodées dans eProm, demandes hors délai, dossiers sans preuve. Un retard ne
> se voit pas dossier par dossier ; sans ce bloc, la non-conformité se découvre
> à l'inspection, et il est alors trop tard.

**LA COORDINATION INSTRUIT, LA DIRECTION VALIDE — DEUX GESTES, DEUX MAINS.**
Le circuit de 2.12.38 vérifiait que le dossier était instruit ; il ne disait pas
QUI avait regardé le tout avant que la pièce parte. Or c'est le geste qui manque
quand une signature se retrouve sur une décision que son titulaire n'a pas vue.
Depuis 2.12.39, une **étape 6 bis** : la validation.

- **Instruire** (introduction, recevabilité, avis, décision) : coordination,
  secrétariat, direction — `PEUT_INSTRUIRE`. C'est une **exception explicite** à
  la doctrine générale de Lucie (« un coordinateur n'écrit jamais directement,
  ses modifications passent par une demande »), parce qu'à l'IIP ce sont les
  coordinations qui instruisent les VA. L'exception est écrite dans
  `lib/valorisation.js`, pas cachée dans une route.
- **Valider** : `PEUT_VALIDER` = direction et direction adjointe, **et personne
  d'autre**. Charles a tranché le 19 septembre 2026 contre deux autres options —
  « chacun valide, y compris son propre travail », écarté parce qu'il ne protège
  que de l'oubli ; « quatre yeux » (valider oui, mais jamais son propre
  dossier), écarté parce que moins lisible.
- **Dévalider** : direction seule, **motif écrit obligatoire** — une pièce a pu
  partir sur la foi de cette validation. Le journal garde les deux gestes.

> **UN DOSSIER VALIDÉ EST GELÉ.** Recevabilité, avis et décision ne se modifient
> plus. Sans ce gel, la validation ne garantirait rien : on validerait un
> dossier propre puis on corrigerait derrière, et la pièce déjà partie
> reposerait sur autre chose que ce qui a été validé.

> **ON NE VALIDE PAS CE QUI N'EST PAS INSTRUIT.** Une case cochable sur un
> dossier incomplet donnerait une fausse garantie : le serveur refuse et nomme
> ce qui manque.

> **LE LOT NE DILUE PAS LA RESPONSABILITÉ.** Valider ou corriger en série écrit
> **une ligne de journal par dossier**, avec le nom de celui qui a posé le
> geste : un an après, on lit « validé par Untel le 20 septembre » sur CE
> dossier-là, et non un geste collectif dont plus personne ne répond. Tout ou
> rien, comme la création en lot, et les dossiers qui bloquent sont nommés.

> **ON NE RÉCLAME PAS CE QU'ON NE DONNE PAS À SAISIR.** La fenêtre proposait
> « dispense partielle » sans aucun moyen de désigner les activités ou les
> acquis : le serveur refusait — à juste titre — et l'écran ne laissait aucune
> issue. Un message qui réclame ce qu'aucun champ ne permet d'entrer est un
> cul-de-sac, pas un garde-fou.

**UN CONSTAT SANS PORTE EST UN CONSTAT QU'ON RELIT CHAQUE MATIN.** Le tableau
de ce qui reste à faire nommait le retard — « 17 recevabilités à contrôler » —
sans donner nulle part où le traiter : il fallait déplier dix-sept lignes et
ouvrir dix-sept fenêtres pour poser dix-sept fois le même geste. Depuis
2.12.52, *Analyser en série* : une ligne par demande, à plat sur toute l'année,
filtrable par nom, section, unité et état, avec l'état et ce qui manque sur la
même ligne. On choisit d'abord LE GESTE — il commande ce qui est cochable :
une case cochable sur un dossier que le serveur refusera est une fausse
promesse, et le refus arrive alors après coup.

> **UNE SÉANCE, C'EST UNE SECTION ET UNE DATE — PAS UNE UNITÉ** (2.12.93,
> Charles, 21 septembre 2026). La borne ci-dessous disait « par unité », et
> elle était fausse pour l'IIP : *« on reçoit un dossier pour un étudiant et
> plusieurs UE ; on traite toutes les UE de tout le monde en même temps ; on
> sort le PV quand tout est fait »*. `memeSeance()` borne désormais un lot de
> décision ou de validation à **une section** (celle de l'unité ; celle de
> l'étudiant pour une unité hors cursus) **et une date de séance**. Chaque
> unité garde son PV d'annexe 4, daté de cette séance. Ce qu'elle protège
> reste vrai : un lot n'attribue pas à une réunion ce qu'une autre a décidé.
>
> **DÉCIDER PAR ÉTUDIANT** (rail *Valorisation*, le tampon) : un étudiant, une
> ligne par unité, **une décision par ligne** — totale, partielle avec SES
> cours ou SES acquis, refusée avec son motif —, un seul enregistrement
> (`POST /valorisations/lot/decisions`), puis la validation des dossiers prêts.
> Mêmes contrôles qu'un à un (`verifierValorisation`, `verifierDecisionCE`),
> une ligne de journal par dossier, tout ou rien. **Seules les lignes
> modifiées partent** : un étudiant inscrit dans deux sections se décide en
> deux fois, sans que la seconde renvoie la première. `decision` vaut
> « accordee » PAR DÉFAUT en base : c'est `decision_le` qui dit qu'une
> décision a été posée — lire `decision` seul présentait chaque unité à
> décider comme « totale ».

> **LA VUE EST À PLAT, L'ÉCRITURE EST BORNÉE.** Décider et valider sont des
> gestes de SÉANCE, et une séance de valorisation se tient PAR UNITÉ : cocher
> en travers de trois unités puis appliquer une décision unique attribuerait à
> trois conseils une délibération qu'un seul a tenue — et le procès-verbal le
> dirait ainsi, sans que rien ne le démente. `memeSeance()` refuse le lot qui
> traverse, et l'admission (`ue_num = 0`) ne mêle pas non plus deux sections.
> L'écran le dit AVANT le clic : composer un lot entier pour apprendre ensuite
> qu'il ne passe pas est une leçon qu'on ne donne qu'une fois.

> **LA RECEVABILITÉ, ELLE, TRAVERSE LES UNITÉS — ET C'EST VOULU.** C'est un
> contrôle de FORME (délai, pièces officielles, dossier complet) posé par le
> secrétariat : aucun conseil des études n'est convoqué. La borner à une unité
> aurait été une contrainte sans raison derrière, et ce sont celles-là qu'on
> finit par contourner. Quinze dossiers reçus le même jour se pointent
> ensemble. L'irrecevabilité se motive même en série, du même motif pour tout
> le lot : si le motif diffère d'un dossier à l'autre, ce ne sont plus des
> dossiers d'un même lot.

> **LE TABLEAU NE PROPOSE PAS LA DISPENSE PARTIELLE**, et c'est la règle « on ne
> réclame pas ce qu'on ne donne pas à saisir » appliquée d'avance : une
> partielle demande de désigner les cours ou les acquis dispensés, et ce
> tableau n'a pas où les cocher. Totale ou refusée ici ; la partielle se pose
> dans *Créer avec la même dispense*, qui porte les listes.

> **LE MOT DE L'ÉCRAN N'EST PAS LA VALEUR DU SERVEUR — ET CE POINT A ÉTÉ LIVRÉ
> EN PRODUCTION.** La fenêtre d'analyse envoyait `type: 'totale'`, parce que
> c'est le mot qu'on lit à l'écran ; le serveur ne connaît que `complete`,
> `partielle` et `admission` — dans la contrainte de la table ET dans
> `verifierValorisation`. Toute dispense totale posée en série était refusée en
> bloc. **Les essais n'avaient rien vu : ils appelaient la ROUTE avec la bonne
> valeur, jamais l'écran.** Un test qui contourne l'interface teste le serveur,
> pas la fonction — et c'est la fonction que l'utilisateur emploie. Corrigé en
> 2.12.53.

> **LA PORTÉE BASCULE LE TYPE, ET ELLE S'APPLIQUE À TOUT LE LOT.** Depuis
> 2.12.53, *Analyser en série* porte les trois portées — toute l'unité, des
> cours, des acquis — avec les listes à cocher chargées depuis l'unité du lot
> (que le bornage à une séance rend toujours connue). On bascule donc
> complète ↔ partielle en série, et la **remarque du Conseil** se saisit une
> fois pour tous : c'est là qu'on écrit « dispensé des heures de stage, mais
> doit présenter l'examen », et le Conseil l'a formulée une fois, pas huit.
> Revenir à « toute l'unité » **efface la cible** — sans quoi une dispense
> complète traînerait la liste de cours de la partielle qu'elle remplace.

> **LE CIRCUIT SUPPOSAIT QU'ON AVANCE DEPUIS RIEN — ET IL ENFERMAIT TOUT LE
> PASSÉ.** Sur un dossier antérieur à 2.12.38, une décision existe mais les
> étapes qui auraient dû la précéder, non. Les trois gestes se bloquaient alors
> l'un l'autre : la recevabilité refusée parce qu'une décision est déjà là, la
> décision refusée parce que la recevabilité manque, la validation refusée
> parce que le dossier est incomplet. **Aucune issue, dans aucun sens** — et
> c'était précisément la passe de rattrapage annoncée au secrétariat. Constaté
> le 20 septembre sur les dix-sept dossiers ATNUP de l'UE 225, encodés en
> dispense globale.
>
> `decideHorsCircuit(v)` le **déduit** — décision posée sans recevabilité ET
> sans avis —, comme l'état se déduit : ce n'est pas une case qu'on coche, donc
> on ne peut pas s'en servir pour rouvrir un dossier réellement instruit, qui
> reste protégé. Sur ces dossiers-là seulement, recevabilité et avis se posent
> encore, et la décision se corrige. Depuis 2.12.57.

> **L'AVIS ET LES DATES SE POSENT AUSSI EN SÉRIE.** Sans eux, le rattrapage
> imposait d'ouvrir dix-sept dossiers un par un AVANT de pouvoir seulement
> cocher la décision — le lot ne servait à rien. Deux réserves tenues : un avis
> rendu en lot porte le **même texte pour tous** et n'a de sens que sur une
> cohorte homogène (même unité, même diplôme antérieur) ; et **le chargé de
> cours qui rend l'avis est NOMMÉ**, distinct de celui qui le saisit — sans
> quoi la pièce attribue l'analyse pédagogique à qui a tenu le clavier. Les
> cinq gestes de l'écran suivent désormais l'ordre du circuit : dates ·
> recevabilité · avis · décision · validation.

> **UNE SEULE QUESTION AU NIVEAU DE LA DÉCISION : TOTALE · PARTIELLE ·
> REFUSÉE.** *Analyser en série* posait d'abord « accordée / refusée », puis une
> portée par-dessus — deux questions là où le Conseil n'en tranche qu'une.
> Charles l'a dit dans ses mots le 20 septembre : *« dispense totale, c'est
> VA/VAE totale ; sinon c'est une dispense partielle, et là ce sera un ou des
> cours, ou un ou des AA »*. C'est aussi ce que disait déjà la constante
> `DECISIONS` du fichier — **le vocabulaire existait, l'écran en avait inventé
> un second.** La totale n'a rien à cocher, c'est ce que le mot veut dire ; la
> partielle seule ouvre ses cours ou ses acquis. Et **changer de branche efface
> ce que la précédente avait laissé**, sans quoi une totale partirait en
> traînant la cible d'une partielle.

> **UN MÊME NUMÉRO D'UNITÉ EXISTE SOUS PLUSIEURS SECTIONS, ET CE POINT A ÉTÉ
> CODÉ FAUX UNE FOIS DE PLUS.** La vue à plat joignait `ue` : trois lignes de
> référentiel pour l'UE 95 « Restart » rendaient trois lignes pour un seul
> dossier — le même étudiant coché trois fois, envoyé trois fois, journalisé
> trois fois. C'est la leçon de 2.11.1, repayée. **Sous-requête avec LIMIT 1,
> jamais de jointure sur `ue`** quand on compte ou qu'on liste des dossiers.

> **UNE DISPENSE PARTIELLE N'EST PAS UNE RÉUSSITE, ET SES 50 % NE SONT PAS UNE
> NOTE D'UNITÉ.** Le procès-verbal portait « Réussite » et 50 % en face d'un
> étudiant dont l'unité n'est PAS acquise : la pièce se lisait comme une
> réussite d'unité à 50 %, faux deux fois — l'unité reste à présenter, et le
> pourcentage ne porte que sur les activités dispensées. Un lecteur extérieur
> n'avait rien pour le détromper. Depuis 2.12.59 : **« Réussite partielle —
> dispense »**, et à la place de la note un **renvoi vers une remarque
> numérotée** sous le tableau, qui dit ce qui est dispensé et à quoi le
> pourcentage s'applique. **Les renvois se regroupent par DÉCISION identique,
> pas par étudiant** : dix-sept dossiers portant la même dispense partagent la
> remarque 1, et celui que le Conseil a tranché autrement porte la remarque 2 —
> une remarque par étudiant en ferait dix-sept identiques, et le renvoi ne
> distinguerait plus ce qui diffère, sa seule raison d'être. La **remarque du
> Conseil** n'y entre pas : elle s'imprime déjà dans la colonne « Dispense(s) »,
> et l'écrire deux fois sur la même pièce est le plus sûr moyen d'en avoir un
> jour deux versions.

> **LA DATE DU PROCÈS-VERBAL SE DÉDUIT DES DÉCISIONS ENCODÉES, PAS DU JOUR OÙ
> L'ON IMPRIME.** Le PV atteste d'une séance TENUE ; proposer la date du jour
> lui faisait dire que le Conseil s'est réuni le jour où le secrétariat a
> cliqué sur « imprimer », parfois des semaines après. Elle se reprend de
> `decision_ce_date`, et **seulement si les dossiers de l'unité s'accordent sur
> UNE date** : deux dates veulent dire deux séances, et en choisir une écrirait
> une date fausse pour les autres — le champ reste alors vide et l'écran le dit.

> **CINQ BOUTONS NE FONT PAS UNE PROCÉDURE.** Les cinq gestes d'*Analyser en
> série* s'alignaient comme cinq boutons indifférents : rien ne disait lequel
> avait été posé, lequel venait ensuite, ni qu'ils formaient un circuit — on
> reprenait de mémoire, chaque matin, ce qu'on avait fait la veille, et c'est
> ainsi qu'une étape se saute. Depuis 2.12.58, une **frise numérotée** :
> l'étape franchie s'efface et porte sa coche, l'étape courante est en relief,
> les autres attendent, et **toutes restent cliquables** — on revient en arrière
> pour corriger, c'est ce que la régularisation demande ; ce qui bloque est le
> serveur, dossier par dossier. L'avancement **se lit des traces**, comme
> l'état, et il se calcule sur les dossiers CONCERNÉS — cochés s'il y en a,
> visibles sinon : une frise calculée sur les 588 dossiers de l'année ne dirait
> rien de la liasse qu'on a en main. **Changer d'étape ÉLAGUE la sélection, il
> ne l'efface plus** : elle s'effaçait, et il fallait recocher les dix-sept
> dossiers à chaque étape — cinq fois la même liasse, ce que le lot devait
> précisément épargner. On garde ce qui reste éligible, et l'on avance d'une
> étape après chaque geste posé.

> **UNE FONCTION QUE SON AUTEUR NE RETROUVE PAS N'EST PAS LIVRÉE.** La frise des
> échéances vivait derrière une entrée de rail nommée « Tâches » portant
> `IconChecklist` — **la même icône que le titre de l'écran** : rail replié, le
> libellé disparaît, et il restait deux cases à cocher identiques dont l'une ne
> menait nulle part de visible. Jérôme ne l'a pas retrouvée deux jours après
> l'avoir demandée ; le secrétariat ne l'aurait jamais trouvée. Suivi d'équipe
> ouvre donc sur **« Échéances et tâches »**, sous l'icône du temps : la
> question de l'écran est « où en sommes-nous ? », la réponse est le TEMPS, et
> la liste des réunions est la matière, pas la réponse. **Corollaire de la règle
> « une entrée de rail sans icône est invisible » : une entrée qui porte l'icône
> de l'écran l'est aussi.**

> **LE PIED D'UNE FENÊTRE NE SE CHEVAUCHE PAS.** Le bouton et la phrase qui dit
> pourquoi il est gris vivent côte à côte ; la phrase est longue, et rien ne lui
> disait de se réduire — **un enfant de boîte flex ne descend pas sous la
> largeur de son contenu sans `min-w-0`**. Le texte passait donc sous le bouton.
> Les boutons ne se compriment jamais (`.bouton` est en `nowrap`) : c'est au
> texte de céder. Réglé sur `Fenetre`, une fois, pour toutes les fenêtres.
> Et trois fenêtres de valorisation portaient un **second ascenseur et une
> seconde marge** — `flex-1 min-h-0 overflow-auto p-5` dans un parent qui n'est
> pas une boîte flex : `flex-1` ne faisait rien, les marges se cumulaient à
> 36 px, et deux ascenseurs se chevauchaient au pied de la fenêtre.

**Le registre des valorisations** (rail *Étudiants → Valorisation*) : elles ne se
lisaient que fiche par fiche, donc elles ne se lisaient pas — personne n'ouvre
588 dossiers pour savoir qui a demandé quoi. Une ligne par demande, filtrable par
année, section et décision, cliquable vers la fiche, et les valorisations **sans
aucune preuve** signalées en ocre : une décision sans dossier se voit là plutôt
qu'au moment du contrôle.

**Créer un étudiant** (rail *Étudiants → Inscrire*) : la route `POST
/api/etudiants` existait depuis l'origine sans qu'aucun écran ne l'appelle —
tout entrait par l'import eCampus, et l'inscription tardive n'avait nulle part
où aller. **Le doublon est le vrai risque** de la saisie manuelle : on ne trouve
pas quelqu'un, on le recrée, et son parcours se coupe en deux — ce que nous
avons passé une journée à réparer pour TIM. Le serveur cherche donc avant
d'écrire (registre national d'abord, chiffres seuls ; puis nom + prénom + date
de naissance, casse ignorée), rend un 409 avec les dossiers trouvés, et l'écran
propose de les ouvrir. Il **signale**, il ne bloque pas : deux homonymes nés le
même jour existent, et un lien permet de passer outre.

**La valorisation a son écran, et la décision a trois branches.** Elle se
saisissait dans une modale ouverte depuis la fiche d'un étudiant : pour encoder
dix dossiers, il fallait ouvrir dix fiches, et rien ne se lisait d'ensemble — or
c'est un travail de SÉRIE, on traite les demandes d'une section l'une après
l'autre en regardant les mêmes unités. Depuis 2.11.19, un onglet plein de l'axe
Étudiants, lu en trois niveaux : l'étudiant, l'unité qu'il demande, ce qui lui
est dispensé. Une seule question au niveau de l'UNITÉ — **totale** (l'unité et
tous ses acquis, rien à cocher), **partielle** (cours, acquis, *ou les deux* :
les deux coexistaient déjà en base, l'écran les donnait exclusifs par un bouton
radio alors que le modèle ne l'exige pas), **refusée** (rien de dispensé, motif
obligatoire). Chaque cours porte SES acquis, et un acquis coché ouvre sa
motivation. Une unité ajoutée naît **partielle et vide** : naître totale ferait
accorder l'unité entière d'un clic distrait.

**Le procès-verbal ne portait son pied qu'une fois, à la fin.** En HTML il ne
peut être qu'en fin de document — un commentaire du code le disait déjà : *« un
pied répété demanderait de produire le PDF côté serveur, où l'on dispose d'un
vrai gabarit »*. Ce gabarit existe (`piedGabaritPdf`, employé par
`/api/impression/pdf`) ; la fenêtre de valorisation ne passait simplement pas par
là, elle ouvrait un onglet et laissait le navigateur imprimer — format, marges et
échelle rendus à la boîte d'impression de chacun. Elle propose désormais le PDF
serveur : **A4 imposé, pied sur chaque feuille**, numérotation au-delà d'une
page ; l'onglet reste, annoncé pour ce qu'il est — un aperçu.
**Et le nombre de pages pouvait être faux** : le comptage réservait 22 mm en bas
là où le rendu réel en réserve 24 (`BANDE_PIED_MM`). Deux millimètres, et un PV
qui finit près du bas se comptait en deux pages pour en sortir trois — sur une
mention réglementaire, portée par une pièce signée. Le comptage emploie
désormais **exactement** les options du rendu réel.

**Le suivi des tâches se lit dans le temps, pas seulement par personne.** La
liste groupée par personne répond à « qu'a Untel en charge ? » et cache
précisément l'autre question — « qu'est-ce qui tombe la semaine prochaine ? » —,
celle d'une réunion de service, et la seule qui fasse déplacer une date avant
qu'il ne soit trop tard. La **frise** (Suivi d'équipe → Tâches) porte trente
jours devant et sept derrière : une tâche dépassée de trois jours se traite
encore. L'échelle est le TEMPS, pas le nombre — un jour garde la même largeur
qu'il porte une tâche ou dix, et c'est ainsi qu'un amas se voit. Couleurs de
`lib/urgence.js`, vert pour ce qui est fait.
**Le titre d'une tâche se corrige** : tout était modifiable sur la ligne —
responsable, échéance, statut, obligation — sauf ce qu'on lit en premier, donc
le seul champ dont la faute de frappe se voit ; la corriger imposait de
supprimer et refaire, ce qui perd la date de création et le lien à la réunion.
**Ce qui vient d'arriver se voit** : `tache_personne.vu_le` par PERSONNE — une
tâche confiée vendredi doit être encore signalée lundi, et « récente » ne dit
pas cela. L'équipage se réécrivant en entier, `vu_le` est préservé : sans quoi
ajouter quelqu'un rallumerait le signal chez tous les autres.

**Confier, filtrer, tenir au courant** (2.12.110, Charles, 21 septembre 2026).
*Confier une tâche* a quitté l'Accueil pour le rail de Suivi d'équipe — la
tâche se donne là où elle se suit. Une tâche porte désormais des personnes
**« au courant »** (`tache_informe`) : elles la voient à l'Accueil sous *Pour
information*, signalée « nouveau » comme les autres, mais n'en répondent pas —
les mettre dans l'équipage (`tache_personne`) les aurait rendues
responsables, et la tâche serait tombée dans « les miennes ». Échéances et
tâches se filtre (texte, personne, section) et se range (par personne, par
échéance, par section, sans regroupement ; tri par échéance, priorité,
intitulé, création). La section d'une tâche : celle de sa réunion, et celles
de ses responsables. En VA, le chargé de cours qui rend l'avis **se choisit
dans le personnel** ; le « + » ouvre la saisie libre pour qui n'y est pas.

**LE PÉRIMÈTRE SE POSE SUR CHAQUE PORTE, PAS SUR LA PORTE D'ENTRÉE.** Le filtre
par section existait et était juste (`withSectionScope` / `req.allowedSections`
— chercher `perimetre(` ou `getUserSections` ne le trouve pas, et cette erreur
a été commise), mais sur les trente-trois routes d'attribution **une seule**
l'appliquait : la liste. Les écrans de contrôle et les rapports rendaient tout,
et `/:id` laissait lire n'importe quelle attribution en devinant un numéro. Un
cadenas sur la porte et six fenêtres ouvertes au rez-de-chaussée. Depuis
2.11.26, les onze routes de lecture le posent, par trois aides écrites **une
fois** (`sectionsDe`, `sectionPermise`, `clausePerimetre`) : un filtre réécrit
onze fois finit par différer onze fois. Deux règles de réponse : **404 et non
403 sur `/:id`** — « interdit » confirmerait que l'attribution existe —, et
**403 et non une liste vide** sur une section refusée — une liste vide se lit
« ce cours n'a aucune attribution », et l'on décide là-dessus.

**COMPTER SANS ÉNUMÉRER.** Une coordination limitée à TIM ne doit pas lire les
attributions d'optométrie — quelle unité, quel cours, combien d'heures ne la
regardent pas. Mais quand elle compose un horaire, elle DOIT savoir que son
professeur est déjà chargé ailleurs : lui cacher ce total ne protège rien et
lui fait bâtir un horaire faux. Le **détail** d'une autre section se cache,
l'**agrégat** se montre — `GET /api/attributions/charge/:profId` rend l'ETP
total, les sections **nommées sans leur volume**, et celles que le demandeur
peut détailler. L'ETP est celui de Pilotage (CT/800 + PP/1000), repris et non
réécrit : deux formules pour une même grandeur donneraient deux chiffres, et
c'est celui qu'on ne regarde pas qui serait le bon.

**LA DOCUMENTATION — LE CORPUS, ET LA PRISE DE CONNAISSANCE QUI L'OPPOSE.**
Demandé par Charles le 20 septembre : *« Une circulaire examens doit être
consultée par les MDP en début d'année. Ce sont les règles du jeu, donc elles
doivent être maîtrisées. Le professeur DOIT cocher "je confirme avoir pris
connaissance du document". »* Tranche 1 livrée en 2.12.70 : corpus en base
(`corpus_document`, `corpus_version`, `corpus_destinataire`, `corpus_lecture`),
écran `/documentation`, dépôt et publication réservés à la direction.

> **DEUX TRACES, PAS UNE — ET C'EST TOUT CE QUI TIENT.** Ce qui s'oppose à
> quelqu'un n'est pas qu'il ait coché : c'est que le document LUI AIT ÉTÉ
> PRÉSENTÉ et qu'il en ait accusé réception. `ouvert_le` est posé **par la
> route qui rend le contenu**, jamais par un clic de l'écran — un écran peut
> prétendre avoir affiché ce qu'il n'a pas reçu. Et le serveur **refuse** la
> confirmation tant que le texte n'a pas été servi. Cela ne prétend pas prouver
> la LECTURE : coché sans lire, c'est le problème de celui qui a coché.

> **UNE VERSION PUBLIÉE NE SE MODIFIE PLUS.** Aucune route ne l'altère ni ne
> l'efface : une personne s'est engagée sur CE texte-là, et un texte
> retouchable après coup ne prouve plus rien — même raison que le journal de
> valorisation. Corriger se fait en publiant la suivante. Republier un texte
> IDENTIQUE est refusé, et une nouvelle version **exige de dire ce qui change**.
>
> **LA RECONFIRMATION EST UNE CASE, PAS UNE FATALITÉ** (Charles, 21 septembre
> 2026 — la règle disait jusque-là « toute version remet le compteur à zéro »).
> Celui qui publie coche si le personnel doit relire ; le serveur **exige la
> réponse** dès la version 2 (`reconfirmer`, booléen obligatoire) et la version
> la garde. Une confirmation couvre les versions suivantes **tant qu'aucune ne
> demande de relire** — cela se DÉDUIT (`etatLecture()` dans
> `routes/documentation.js`, la seule fonction qui en décide, pour les cinq
> routes qui posaient la question chacune à sa façon), on ne recopie aucune
> confirmation. Le registre et la fenêtre de lecture disent QUELLE version a
> été confirmée.

> **LE TEXTE S'IMPOSE PAR RÔLE, JAMAIS PAR PERSONNE.** Nommer les gens un à un,
> c'est oublier celui qui arrive en octobre. Un document sans destinataire
> reste consultable : il n'est simplement pas opposable — un mode d'emploi n'a
> pas à être accusé réception. Et le registre **NOMME les non-confirmés** :
> « 9 sur 12 » ne sert à rien, ce sont les trois autres qu'on ira voir.

> **RETIRER N'EST PAS SUPPRIMER.** Un texte retiré cesse de s'imposer et sort
> des listes, mais reste lisible : les confirmations posées dessus doivent
> pouvoir se justifier.

> **L'AIDE EST ABSORBÉE, ET C'EST ELLE QUI A PROUVÉ LE BESOIN.** Son contenu
> vivait dans un TABLEAU JAVASCRIPT compilé dans l'application : le modifier
> demandait un commit, une construction et un déploiement. Au 20 septembre elle
> ne disait pas un mot de la valorisation, de la délibération, des diplômes, de
> l'échéancier ni du suivi d'équipe — dernière mise à jour le 14, la semaine où
> Lucie a le plus changé. **UN TEXTE QUI COÛTE UN DÉPLOIEMENT NE SE MET JAMAIS
> À JOUR.** Deux portes pour « savoir » en auraient fait une de trop : un
> enseignant aurait cherché la circulaire examens dans l'une et le mode d'emploi
> du PAE dans l'autre. Un seul écran, deux faces, et il garde la place et
> l'icône que l'aide occupait dans la barre ; `/aide` y redirige.

**LE TEXTE VIT DANS LUCIE, LE FICHIER N'EST QU'UNE PORTE D'ENTRÉE** (2.12.91).
Demandé par Charles le 21 septembre : *« comme avec l'import DP — je dépose, tu
analyses et tu intègres à Lucie avec mise en page, mais DANS Lucie. Après, je
peux corriger année après année dans Lucie. »* On dépose un **Word ou un PDF**,
le serveur l'analyse (`lib/texteCorpus.js`), l'éditeur montre le résultat, **rien
ne s'écrit avant la publication**. Le fichier n'est pas conservé — le PDF d'un
décret est en ligne, Charles ne veut pas qu'il alourdisse la base : un champ
`source_url` y renvoie. Qui publie et corrige : admin (le compte de Charles),
directeur, direction adjointe — « accès niveau 1 ».

> **CE N'EST PAS UN SECOND ÉDITEUR.** La barre et les cellules de tableau sont
> celles de Configuration → Éditeur (`Toolbar` exportée, mode `sobre`, qui
> masque ce que le serveur retirerait : police, taille, retrait, saut de page,
> logo, en-tête). Et UNE classe `.texte-corpus` sert à écrire ET à lire : ce que
> la direction voit en écrivant est ce que le personnel lit.

> **LE HTML SE FILTRE À L'ÉCRITURE**, par une liste fermée (`assainir()`) :
> `<script>`, `onerror=`, `javascript:` et tout style qui positionne ne
> passent pas. La base ne contient donc jamais que du texte sûr, et la lecture
> peut l'afficher tel quel.

> **WORD MET EN PAGE AVEC DES TABLEAUX D'UNE CASE** — bandeau de titre,
> parties (« PHASE 1 — … »), encadrés (« ⚠ Attention »). Transposés tels quels,
> vingt-quatre tableaux pour neuf vrais. L'analyse les reconnaît : titre,
> partie, encadré. **Le rang d'un titre se lit du document, pas d'une règle
> fixe** — « 1. » en h3 partout inversait la hiérarchie de la circulaire, où
> les sections numérotées sont le sommet. On repère les sortes de titres
> présentes, puis on les range dans un ordre fixe.

> **LE PDF SE RECOMPOSE LIGNE PAR LIGNE** : pdftotext rend rarement une ligne
> vide entre deux paragraphes. Titres de chapitre et d'article, puces, fin de
> phrase suivie d'une majuscule — rien d'autre n'est deviné. Les tableaux d'un
> PDF ne se reconstituent pas, et l'écran le dit.

> **L'IMPORT MARCHAIT PAR LA ROUTE ET PAS PAR L'ÉCRAN** — la leçon de
> `totale`/`complete`, repayée le jour même : `authHeaders()` impose
> `application/json`, le fichier partait donc déclaré en JSON. Un envoi de
> fichier retire cet en-tête et laisse le navigateur écrire la frontière du
> multipart.

**Le signal à l'Accueil** (2.12.90) : un bloc « À confirmer » en tête, au-dessus
des tâches. La route `/moi/attente` existait depuis 2.12.70 et **aucun écran ne
l'appelait** — une obligation dont personne n'est prévenu n'oblige personne.
Un BLOC et non une entrée du fil : une notification se marque « lue » d'un clic,
et « lue » n'est pas « confirmée ». Le bloc ne s'efface que quand le serveur ne
le rend plus. Chaque ligne ouvre le texte lui-même (`/documentation?doc=<clé>`),
pas la liste. Ocre, comme dans Documentation : un même état, une même couleur.

**Reste au module :** le versement du mode d'emploi dans le corpus, pour qu'il cesse de
dépendre d'un déploiement ; la péremption (tranche 2) ; le questionnaire
(tranche 3). Et **le registre des références** — le menu d'obligation d'une
tâche doit renvoyer vers un point du RDE, de la circulaire ou d'une procédure,
et non vers une instance datée de l'échéancier : voir
`Lucie_registre_references.md`.

**Chantiers de conformité ouverts, dans l'ordre :** geler les décisions à la
clôture et historiser par ajout ; figer et horodater le PV ; bloc de signatures
nominatif ; date d'affichage et mode de publication en champs propres ; écrire
`'valorise'` dans le parcours ; raccorder la mention au PV.

---

## 5 bis. La démarche qualité — AEQES

L'IIP relève de l'**AEQES** (enseignement supérieur). Psychomotricité a été
évaluée ; une **évaluation institutionnelle** vient en **2028-2029**.

- Cinq critères, dont l'**amélioration continue**, traités en *description →
  évaluation → action*.
- Un **dossier d'auto-évaluation** (19-20 000 mots hors annexes) dont la pièce
  maîtresse est un **plan d'action priorisé assorti d'indicateurs**, couvrant
  deux ans au minimum (action, responsable, priorité, échéance, indicateur).
- Le dossier demande les **inscrits par section sur cinq ans**, les ETP par
  catégorie, et une **vingtaine d'annexes**.
- L'**évaluation continue** ne réévalue pas le programme : elle vérifie
  **l'état de réalisation du plan d'action**.
- Après visite : rapport, droit de réponse de trois semaines, **plan publié sur
  le site de l'école** dans les six mois, point d'étape à mi-parcours.

**Conséquence : la pièce centrale est l'ACTION**, pas la réunion. Réunions,
retours d'étudiants et constats chiffrés en sont les *sources* ; le dossier et
le plan publié, les *sorties*. **Une action est une échéance** : l'échéancier
porte déjà responsable, rappels, base légale et une catégorie `qualite` — un
seul registre, deux lentilles (l'Accueil montre *les miennes*, la Qualité
*celles de la démarche*).

**Ce qui n'est pas rattrapable :** ce qui n'est pas consigné en 2026-2027 ne
sera pas récupérable en 2028. Détail dans `docs/contexte/qualite-aeqes.html`.

---

## 6. Design — la façon de faire

### Documents

L'audit (`docs/contexte/audit-documents-impression.md`) a relevé **9 enveloppes
concurrentes, 4 techniques de pied de page contradictoires, 7 façons d'imprimer
et 3 composants de tuile**. La stratégie tient en cinq chantiers, dans cet ordre :

1. **Une seule enveloppe**, celle de `lib/document.js`, paramétrable par famille.
   **On n'en recrée pas une dixième.**
2. **Un seul pied de page**, une seule technique, une seule marge basse quel que
   soit le chemin emprunté.
3. **Le catalogue est la seule porte** (`lib/documents.js`) : toute pièce s'y
   déclare — portée, paramètres, rôles, route —, y compris la portée
   `'etablissement'`, qui est celle de Pilotage.
4. **Un seul centre d'impression**, alimenté par le catalogue et filtré par la
   portée de l'écran. Deux sorties seulement : **PDF serveur** si le serveur
   peut, **impression navigateur** sinon — le même repli partout.
5. **Toute pièce laisse une trace** via `archiverDocument()`.

### Standard de mise en page

- A4 portrait ; marges **18 mm** haut et côtés.
- Bande de pied **24 mm**, texte à **−16 mm**, pied `position:fixed` descendant
  dans la marge.
- Corps **9-10 pt** — **jamais en pixels**.
- Marine `#1B2B4B` · filet doré `#C9A84C` 0,3 mm.
  ⚠️ Dans `tailwind.config.js`, `iip-gold` vaut `#1B2B4B` : **le nom ment**.
- Cadre de titre : 0,4 mm marine, rayon 1,5 mm.
- Ordre d'en-tête : bandeau CF entre deux filets → identité de l'établissement →
  cadre de titre portant **section, nature de la pièce, unité**.
- **Réserve :** le **diplôme** (paysage, sans marge ni pied) et le **corps de
  courriel** restent hors standard. L'unité vaut pour les pièces administratives.

### Tuiles d'indicateur

- Fond **blanc**, **filet gauche 3 px** teinté selon l'état. Pas de fond coloré,
  pas d'ombre, pas de dégradé.
- Trois tons **désaturés** seulement (vert, ocre, brique) ; neutre par défaut —
  si tout est coloré, plus rien ne signale.
- **Chiffre d'abord, libellé dessous.**
- Icône en aplat, **grise** — jamais dans la couleur d'état.

### Navigation

- **Seul le menu principal est horizontal** : il dit dans quel métier on est.
  Tout le reste vit dans le **rail latéral** — les rubriques de l'axe d'abord,
  puis les outils de l'écran ouvert, qui s'y inscrivent d'eux-mêmes.
- **Le rail est un panneau posé sur la page**, non une colonne collée au bord :
  détaché de 12 px, coins arrondis, **haut de ce qu'il contient**, translucide,
  porté par une ombre douce, et **en `position: fixed`** — en `absolute` il se
  centrait sur la hauteur du CONTENU et son pied passait sous la fenêtre.
- **Il reste étroit** : pas d'élargissement au survol, le libellé dans une
  bulle. Une icône se mérite — ce qui ne tient pas dans une colonne d'icônes va
  dans une fenêtre, pas dans le menu.
- **Deux modes pour les menus**, un seul jeu de jetons (`--menu-*` dans
  `index.css`, mode écrit sur `data-mode` par `lib/theme.js`) : **clair**, gris
  pâle tenu par un filet, et **sombre**, marine. Un composant ne connaît jamais
  le mode — il lit ses jetons. La bascule est en pied de rail.
- **La couleur est une dépense** : dans les menus elle ne sert qu'à ce qui doit
  être vu — la rubrique ouverte, une alerte. Une icône sans rien à signaler
  reste grise, et l'accent va sur l'icône, non sur toute la pastille.
- **La barre du haut reste entière**, d'un bord à l'autre : deux panneaux
  détachés sur un écran, c'est un de trop — il faut un point fixe. Elle suit en
  revanche le mode.
- **Une seule échelle, et rien en dehors** (`tailwind.config.js`) : rayons
  `champ` 8 / `carte` 14 / `fenetre` 22 / `panneau` 26 ; ombres `pose`,
  `flottant`, `dessus` ; courbe `ease-ios`. Un seul voile de fenêtre : marine
  translucide, flou léger.
  **Les rayons de Tailwind sont ramenés sur l'échelle** : `rounded`, `-sm`,
  `-md`, `-lg` valent 8 ; `-xl` et `-2xl` valent 14. L'échelle existait et
  servait soixante et une fois pendant que deux mille trois cents classes
  employaient huit valeurs au hasard — des boutons pointus à côté de boutons
  ronds. On ne réécrit pas deux mille trois cents classes : **on redéfinit le
  défaut**, et tout y tombe, aujourd'hui comme demain.
- **Ce qui vaut à gauche vaut à droite.** La gouttière du rail vaut
  **exactement** la largeur du rail (`LARGEUR_RAIL`), et rien de plus : c'est
  le retrait que l'écran se donne — le même des deux côtés — qui fait l'écart.
  Elle ajoutait 1,5 rem « pour respirer » : 40 px à gauche, 16 à droite, un
  cadre qui n'est pas d'équerre sans qu'on puisse dire pourquoi.
- **Le filet de la barre s'aligne sur la colonne de contenu** :
  `left: calc(var(--rail) + 1rem)`. Posé à une marge choisie, il ne répondait à
  rien — ni au rail, ni au titre, ni au tableau. Il suit maintenant quand le
  rail s'élargit, sans que personne ait à y penser.
- **Le blanc porte ce qui est isolé, pas ce qui regroupe.** Deux objets sont
  blancs, et eux seuls : le **champ** où l'on écrit ou choisit, et la **tuile**
  qui détache un chiffre. Tout ce qui regroupe — cartes, tableaux, listes,
  panneaux — est **ton sur ton** avec la page, et ce sont les filets qui
  séparent (`.carte`, `.carte-plate`). Un aplat blanc sur un fond presque blanc
  ne sépare rien ; il ajoute une ombre de différence que l'œil enregistre sans
  pouvoir l'expliquer. Conséquence : une carte n'a plus besoin d'ombre — un
  filet et un rayon suffisent.
  > Cette règle disait auparavant « le blanc est réservé à ce qui se remplit »
  > tout en donnant un fond blanc aux tuiles : deux phrases, deux dessins, et
  > le désordre constaté entre l'écran et le papier. Tranché en septembre 2026 :
  > **la tuile garde son fond blanc**, et la règle est réécrite pour dire ce que
  > l'on fait réellement.

- **Un seul objet pour signaler : le bloc signalé.** Tuile d'indicateur à
  l'écran, encadré de caractéristiques sur un document : c'est le même geste, il
  se dessine une fois. Cinq pièces, jamais une de plus — un **rail à gauche**
  qui porte l'état *et lui seul* (la couleur ne va ni au fond, ni au texte, ni à
  l'icône), un **fond** selon la règle du blanc ci-dessus, un **filet de
  contour** fin qui ferme la forme et remplace l'ombre, un **rayon** pris sur
  l'échelle, et un **contenu toujours dans le même ordre** : valeur ou intitulé,
  libellé dessous, précision en gris. Seules les **mesures** changent de support
  à l'autre, parce que l'encre n'a pas un rayon de 14 px :

  | | Écran | Papier |
  |---|---|---|
  | Rail | 3 px | 1,6 mm |
  | Rayon | 14 px (`carte`) | 1,5 mm |
  | Fond | blanc (tuile, champ) | `#FAFAFB` — le blanc est déjà celui de la feuille |
  | Contour | 1 px `#D8DCE4` | 0,3 mm, même gris |
  | Corps | 13 px | 9 pt |
  | Rail teinté | marine, vert, ocre, brique | marine à l'intérieur, **or** sur la pièce extérieure |
- **Un tableau n'a que deux tons** (`.tab-entete`, `.tab-repere`). L'en-tête
  et la ligne de regroupement sont le **même objet** — l'un nomme les colonnes,
  l'autre nomme un paquet de lignes : même fond, celui du cadre de titre. La
  donnée reste blanche, et c'est le seul contraste dont un tableau a besoin.
  Une même liste montrait cinq valeurs de gris et de bleuté pour dire deux
  choses.
- **Une seule échelle typographique** (`tailwind.config.js`) : **10** la
  mention · **11** l'étiquette · **12** le second plan · **13** LE CORPS ·
  **15** le titre d'une carte · **17** le titre d'un écran, et il n'y en a
  qu'un. Les noms de Tailwind y tombent aussi — `text-sm` vaut 13, pas 14.
  Dix-neuf tailles cohabitaient, employées 2 500 fois : une même information
  n'avait pas la même taille selon l'écran.
- **Trois emplois de bouton, trois couleurs** (`.bouton`, `.bouton-fort`,
  `.bouton-sortir`, `.bouton-detruire`). Neutre : ça n'engage rien. Fort :
  l'action principale de l'écran, et il n'y en a **qu'une**. Sortir
  (turquoise) : ce qui produit une pièce. Détruire (brique) : ce qui efface.
  Dix fonds cohabitaient, dont `iip-gold` qui vaut du marine. **Un état ne se
  dit pas avec un bouton** : « réussi » en vert est une information, pas une
  action.
- **Une seule hauteur de contrôle** (`.controle`, 36 px, dans `index.css`).
  Une liste déroulante porte les métriques natives du navigateur, un bouton
  celles qu'on lui a écrites : côte à côte, ils ne font pas la même hauteur et
  leurs lignes de base ne se répondent pas. Le rayon se règle en redéfinissant
  le défaut de Tailwind ; la hauteur ne le peut pas — un bouton dans une
  cellule de tableau n'a rien à faire à 36 px. C'est donc une **classe**, à
  poser sur les contrôles d'une barre d'outils. `.controle-fort` pour le
  principal, et il n'y en a qu'un.
- **UN UTILITAIRE TAILWIND NE GAGNE PAS CONTRE `.controle` — ET HUIT CHAMPS LE
  PAYAIENT EN SILENCE.** On posait `pl-7` ou `pl-8` sur un champ de recherche
  pour laisser la place à la loupe, et il ne se passait RIEN : `.controle`
  déclare `padding-inline`, la propriété RACCOURCIE, qui écrase les deux côtés,
  et comme elle vit dans le CSS applicatif elle passe après les utilitaires. La
  loupe se posait donc sur la première lettre du texte d'invite — à huit
  endroits, dans quatre fichiers, sans que personne l'ait jamais écrit à
  l'envers : chacun avait ajouté le padding qu'il fallait, et chacun avait été
  ignoré. D'où **`.controle-icone`** (2 rem), à poser avec `.controle` dès qu'une
  icône est posée en absolu dans le champ.
  > **RÈGLE GÉNÉRALE : une propriété raccourcie dans une classe de la maison
  > annule l'utilitaire correspondant.** Avant d'ajouter un utilitaire à un
  > élément qui porte `.controle`, `.bouton` ou `.carte`, vérifier que la classe
  > ne déclare pas déjà la propriété — sinon l'utilitaire ne fait rien, et rien
  > ne le dit.
- **Deux formes d'onglet, et une règle qui dit laquelle.** La **pastille**
  (fond clair, coins arrondis) dit *où l'on est* — barre du haut, rail : on
  change de territoire. Le **soulignement** (`.onglet-page` /
  `.onglet-page-actif`) dit *quelle face du même objet* on regarde — les
  onglets d'une fiche, d'une fenêtre, d'un écran : on tourne une page. Le
  désordre ne venait pas d'avoir deux formes, mais de n'avoir aucune règle :
  douze barres d'onglets, cinq couleurs de soulignement, quatre hauteurs.
- **Une fenêtre ne bouge pas une fois ouverte, et elle fait la hauteur de ce
  qu'elle dit.** Elle s'ancre en haut à une distance fixe (6 vh) : centrée
  verticalement, elle se recentrait à chaque changement d'onglet — un onglet
  court la faisait monter, un long descendre, et le bouton qu'on visait n'était
  plus là où on l'avait laissé. Les grandes ont longtemps eu en plus une
  **hauteur fixe** de 88 vh, pour la même raison ; mais l'ancrage en haut règle
  déjà le problème — le sommet ne bouge plus quand la hauteur change. Ce qu'il
  restait de la hauteur fixe se voyait : *Améliorations*, trois champs et un
  bouton, occupait les neuf dixièmes de l'écran, dont les deux tiers de blanc
  sous le pied. Toutes **plafonnent à 88 vh** et s'arrêtent à leur contenu ;
  `hauteurFixe` reste disponible pour celles dont le contenu change vraiment de
  hauteur sous l'utilisateur — c'est alors un choix écrit, non un défaut subi.
- **L'ACTION D'UNE FENÊTRE NE DÉFILE JAMAIS AVEC SON CONTENU.** Elle vit dans
  le **pied** (`pied={…}` sur `Fenetre`), une bande fixe au bas du panneau.
  Posé au bas du contenu, un bouton descend avec lui : pour valider trois cases
  cochées en haut d'une liste de cinq cents étudiants, il fallait dérouler tout
  le fichier. Le pied existait depuis le début et **personne ne s'en servait** —
  chaque fenêtre rangeait ses boutons dans `children`, qui est la zone qui
  défile. Corollaire : le pied porte aussi **ce qui dit pourquoi le bouton est
  gris** (« coche au moins une personne »), au même endroit que le bouton, sinon
  l'explication reste elle aussi hors de vue.
- **Une seule fenêtre** (`Fenetre`, `GroupeFenetre`, `PieceFenetre`,
  `BoutonFenetre` dans `ui.jsx`). Soixante et onze fichiers posaient leur
  propre `fixed inset-0`. Le voile est une **couche à part** : porté par le
  conteneur, son flou fait de lui le cadre de référence de tout `fixed` rendu
  dedans — une fenêtre ouverte depuis une fenêtre s'y retrouve enfermée.
- **On ne compte pas les pixels, on les mesure.** La hauteur de la barre du
  haut était écrite « 64 px » à la main ; elle ne les fait pas toujours, et le
  rail passait dessous. La barre publie sa hauteur (`--barre-h`), le rail la
  lit. Même principe pour `--rail-largeur`, que le filet du haut consomme.
- **Le rail se lit d'abord en entier, puis il s'ouvre.** Les outils de l'écran
  ouvert étaient une section ajoutée SOUS les rubriques, sans rien qui dise
  qu'ils appartenaient à l'écran plutôt qu'à l'axe. On les a d'abord dépliés
  **sous la rubrique ouverte** — la parenté se lisait, mais toutes les
  rubriques suivantes passaient derrière une demi-douzaine d'icônes d'écran :
  sur l'axe Étudiants, *Valorisation*, *Délibération* et *Procédures* se
  retrouvaient APRÈS *Diplômes et titres* et la corbeille, et le parcours de
  l'étudiant — qui est l'ordre même du rail — était coupé en deux par les
  outils d'un seul écran. Tranché le 19 septembre 2026 : **les rubriques de
  l'axe passent devant**, et le tiroir se déplie sous la liste complète, entre
  ses deux filets teintés (`--menu-sous`, déclaré dans les deux modes). La
  parenté se lit encore par le filet et par le mouvement ; ce qu'elle ne fait
  plus, c'est couper la liste. Le tiroir se monte **fermé** et s'ouvre à l'image
  suivante — c'est le mouvement qui dit la parenté, pas la présence ; monté à sa
  hauteur finale, il surgissait d'un bloc. La hauteur passe de `0fr` à `1fr` :
  la seule transition qui n'oblige pas à mesurer le contenu, donc la seule qui
  reste juste le jour où une entrée s'ajoute. **Les icônes du sous-menu restent
  grises** : les peindre toutes en bleu en faisait un autre menu, et cinq icônes
  colorées côte à côte ne signalent plus rien. Seuls les deux filets portent la
  teinte. **Les intertitres des sections
  d'écran disparaissent** — rail replié, le libellé est masqué, et un séparateur
  invisible n'est pas un séparateur.
- **La tuile active garde son dessin ; c'est un FILET qui dit qu'elle a
  ouvert quelque chose.** Le rail de trois pixels du bloc signalé a été essayé
  ici : collé au bord de la tuile, il en barre le côté gauche et écrase la
  forme — ce n'est plus une tuile, c'est un onglet. La règle du bloc signalé
  vaut pour ce qui PORTE UN ÉTAT (une tuile d'indicateur, une ligne en retard) ;
  une entrée de menu n'a pas d'état, elle a une position. Elle porte donc un
  **filet fin de deux pixels, posé à côté, plus court que la tuile et terminé en
  arc aux deux bouts**, et seulement quand un sous-menu est ouvert dessous.
- **L'ORDRE DU RAIL EST CELUI DU TRAVAIL, PAS CELUI DE LA MÉCANIQUE.** En tête,
  ce qui vaut partout : SORTIR — « Imprimer ou envoyer », l'avion plutôt que
  l'imprimante depuis que le centre fait les deux —, l'import, *Proposer une
  amélioration*. Puis la suite des gestes de l'axe. Et **DÉTRUIRE, toujours en
  dernier** : le tri se fait sur un drapeau `destructif`, pas sur la place où
  chaque écran a rangé son entrée.
  On a d'abord rangé les rubriques de l'axe d'un côté et les outils de l'écran
  de l'autre, en deux blocs. C'était propre pour le code et **faux pour
  l'usage** : sur Étudiants, « Composer les PAE de l'année suivante »
  appartient au PAE, « Diplômes et titres » suit la délibération. Les séparer
  par NATURE coupait une suite de gestes en deux listes qu'il fallait recoller
  de tête. Un axe déclare donc `ordreRail` — des **groupes de clés mêlant
  rubriques et outils**, séparés à l'écran par un filet. Étudiants, arrêté le
  19 septembre 2026 : *créer un étudiant · PAE · composer le PAE suivant ·
  valorisation · délibération · diplômes* — puis *procédures* — puis la
  corbeille. Ce qui n'est pas listé garde sa place : un écran qui ajoute un
  outil demain ne disparaît pas du rail parce que personne n'a pensé à le
  lister. Sans `ordreRail`, on retombe sur les rubriques puis le tiroir.
- **UN FILET ENTRE LES GROUPES, ET AUCUN À LA FIN.** Une barre posée après le
  dernier groupe ne sépare de rien et ferme la liste sur du vide.
- **Les rubriques « à venir » ont quitté les rails.** Une place réservée
  annonçant un écran qui n'existe pas est une promesse faite à qui n'a rien
  demandé, et son icône occupait une place dans le rail replié de ceux qui
  travaillent. Les idées ont leur porte : *Proposer une amélioration*, présente
  sur TOUS les écrans au même endroit — une demande s'écrit au moment où l'on
  bute, pas trois jours plus tard en réunion, et si la porte n'est pas là où
  l'on est, elle n'est nulle part. Le registre (`suggestion`) garde l'auteur,
  l'écran d'où elle part, l'état et **la réponse qu'on lui a faite** : on répond
  même pour dire non — une idée jamais commentée n'apprend qu'une chose à son
  auteur, que cela ne sert à rien d'écrire.
- **L'icône d'un axe est la même dans la barre du haut et dans la porte de son
  rail, et elle n'appartient qu'à lui.** Organisation portait
  `IconClipboardList` dans la barre et `IconBooks` dans son rail — deux dessins
  pour un même territoire —, et le presse-papiers désignait DÉJÀ l'onglet
  « Inscriptions & PAE » de l'axe Étudiants. Tranché : Organisation est l'axe
  des unités, des cours et des référentiels, donc `IconBooks` des deux côtés ;
  le presse-papiers revient au PAE, qui est littéralement une liste à cocher.
  Sans cette règle, on réaligne à la main tous les six mois.
- **UNE NOTE SE POSE OÙ L'ON TRAVAILLE, et on ne crée pas un champ pour cela.**
  `attribution.commentaire` existait depuis l'origine, partait dans la vue et
  figurait dans la liste blanche du `PATCH` — mais il ne s'atteignait qu'en
  ouvrant la fiche complète : quarante champs pour écrire « accord verbal du
  3/9 », et **rien dans la grille ne disait qu'une note existait**. Une
  remarque qu'on ne voit pas n'a pas été écrite. Un second champ « note »
  aurait fait deux sources pour un même fait ; depuis 2.12.1 une colonne
  `__note` donne une porte à celui qui existe : `IconInfoCircle` **grise quand
  la note est vide, marine quand elle porte un texte** — la couleur ne dit que
  cela, trente icônes colorées ne signalant plus rien —, le **survol affiche la
  note** (on parcourt une grille, on ne l'ouvre pas trente fois pour savoir
  laquelle parle), et le clic ouvre une **bulle ancrée sur la ligne**, non une
  fenêtre : un voile fait perdre de vue la ligne qu'on annotait. Ses boutons
  sont dans la bulle, jamais sous un contenu qui défile, et *Effacer* ne paraît
  que s'il y a quelque chose à effacer. **À trancher :** une modification par
  une coordination repasse l'attribution en « à valider » (règle du `PATCH`) —
  écrire une note fait donc retomber la validation.
- **UNE UNITÉ SE CHOISIT, ELLE NE SE TAPE PAS.** La règle avait été posée pour
  la valorisation en 2.11.8 et n'avait jamais été généralisée : trois écrans
  gardaient un champ libre « ex: 95 » — le générateur de listes, l'éditeur de
  modèles et les séances DCPP. On tape 95, l'unité n'est pas de cette section ou
  de ce millésime, et la liste sort vide **sans rien dire** ; côté DCPP, la
  séance restait rattachée à une unité qui n'existe pas. Depuis 2.12.32, la
  liste des unités du millésime — restreinte à la section quand elle est
  choisie. **Et pas de repli en saisie libre quand la liste est vide** : on
  écrit qu'il n'y a rien à choisir, un champ ouvert ne ferait qu'inviter à
  taper un numéro qui ne mène nulle part.
- **AD VERT, VA BLEU, VAE VIOLET — ÉCRIT UNE FOIS.** `TEINTE_PORTE`, exporté
  par `pages/Valorisations.jsx`. La table vivait en double (matrice
  d'introduction et étape de la demande) : deux copies d'une même convention
  finissent par différer, et c'est l'écran qu'on regarde le moins qui garde
  l'ancienne teinte.
- **UNE BULLE QU'IL FAUT CHERCHER N'EST PAS UN LIBELLÉ.** Le menu qui rattache
  une tâche à une obligation de l'échéancier s'intitulait « — sans obligation — » :
  rien ne disait de quoi il parlait, et la seule explication vivait dans un
  `title` au survol. Renommé « — ne sert aucune obligation — » : le libellé
  porte la question, pas seulement la réponse par défaut.
- **LE TIROIR PORTE SON PROPRE REPÈRE — IL N'APPARTIENT À AUCUNE RUBRIQUE.**
  Premier essai (2.12.54) : étirer le filet de la rubrique jusqu'au bas du
  tiroir, pour en faire un bloc. **La prémisse était fausse.** Le tiroir ne se
  rattache pas à l'icône qu'on a cliquée, mais à la DERNIÈRE rubrique de l'axe,
  parce que l'axe se lit d'abord en entier — la décision du 19 septembre, que
  j'avais oubliée en codant. Le repère désignait donc une icône qui ne possède
  rien, et, allongé, il balayait tout le rail. **Tant qu'il faisait seize
  pixels, l'erreur ne se voyait pas ; c'est l'allongement qui l'a révélée.**
  Depuis 2.12.56, le filet vit sur le TIROIR et longe sa seule hauteur : les
  outils de l'écran forment un bloc à eux. L'accent retourne à la rubrique
  ACTIVE, et à elle seule.
  > **UN REPÈRE DISCRET PEUT CACHER UNE ERREUR DE MODÈLE.** Avant de rendre un
  > signal plus visible, vérifier que ce qu'il désigne est bien ce qu'on croit.
- **UN CHAMP RÉGLEMENTAIRE SE REMPLIT AU JUGÉ SI RIEN NE DIT CE QU'IL EST.**
  « Base légale de la décision » ne parle qu'à celui qui l'a écrit, et une
  valeur fausse part alors sur une pièce signée. D'où `BulleAide` (`ui.jsx`) :
  un point d'interrogation discret, la phrase au clic, **ancrée sur le champ**
  et non dans une fenêtre — un voile ferait perdre de vue ce qu'on remplissait.
  Elle dit ce que la chose EST et ce qu'elle engage, jamais comment cliquer.
- **UN CODE SANS LIBELLÉ EST UNE LISTE QU'ON REMPLIT À L'AVEUGLE.** La liste des
  bases s'affichait « V1 — », « V2 — » : le champ s'appelle `libelle`, l'écran
  lisait `label`. Six lignes à choisir sans savoir ce qu'elles sont, sur une
  valeur qui part dans eProm. **Même faute que `totale`/`complete`, même
  famille : le nom qu'on croit plutôt que celui qui existe.** Vérifier la forme
  réelle de l'objet, pas celle qu'on suppose.
- **FILTRER N'EST PAS NAVIGUER — ET LE RAIL DE L'ÉCHÉANCIER ÉTAIT DEVENU UN
  PANNEAU DE FILTRES.** Il portait les zones, trois statuts et jusqu'à HUIT
  responsables : onze entrées, dont sept partageant `IconChevronRight` faute
  d'avoir un dessin à elles. Rail replié — c'est-à-dire presque toujours — cela
  donnait une colonne de flèches identiques ne menant nulle part de
  reconnaissable. *« Trop d'icônes, personne ne trouve »* (Charles, 20
  septembre), et c'est exact : **une icône répétée sept fois n'est plus une
  icône, c'est du bruit.** Le rail dit OÙ L'ON EST ; réduire une liste est un
  geste de l'écran, qui se fait dans sa barre d'outils, avec des menus qui
  portent des MOTS. Trois listes déroulantes ont remplacé les onze entrées —
  et la liste des responsables a cessé d'être tronquée à huit, limite que
  seule la place dans le rail imposait : le neuvième était invisible sans que
  rien ne le dise.
  > **COROLLAIRE DE « UNE ICÔNE SE MÉRITE » : si une entrée doit emprunter le
  > chevron générique, c'est qu'elle n'a rien à faire dans le rail.**
- **TROIS ENTRÉES QUI SE RESSEMBLENT NE SE DISTINGUENT PLUS.** Le rail de la
  valorisation portait « Introduire des demandes », « Valoriser en série » et
  « Analyser les demandes en série » : même longueur, même structure, deux fois
  « en série ». Charles a demandé si le deuxième servait encore à quelque
  chose — la vraie question était : lequel fait quoi ? Chacun fait pourtant
  autre chose, et il a fallu lire le code pour le retrouver :
  la **matrice** ouvre des dossiers VIDES (une case AD/VA/VAE par étudiant et
  par unité) ; **Créer avec la même dispense** les ouvre DÉJÀ PORTEURS du
  détail — mêmes cours, mêmes acquis, même remarque pour toute une cohorte ;
  **Analyser en série** INSTRUIT ce qui existe. Renommé en 2.12.67 pour dire ce
  qui le distingue, et non ce qu'il a en commun avec les deux autres.
  > **DEUX RÉPONSES FAUSSES DONNÉES CE JOUR-LÀ, FAUTE D'AVOIR CHERCHÉ.** J'ai
  > d'abord affirmé que sans ce bouton on ne pouvait pas créer dix-sept
  > dossiers d'un coup — c'est la matrice qui le fait. Puis j'allais annoncer
  > qu'il fabriquait les dossiers hors circuit : vérification faite, la route
  > n'écrit PAS `decision_le`, elle ne contourne donc rien. **Avant de proposer
  > de renommer ou de retirer un outil, lire ce qu'il fait** — un libellé ne
  > dit pas une fonction, et un raisonnement sur un libellé ne vaut rien.
- **Une entrée de rail sans icône est invisible** une fois le rail replié.
- **Un titre ne s'écrit qu'une fois** par écran.
- Un libellé ne promet que ce que la modale fait réellement.
- Une réorganisation d'onglets change les habitudes du secrétariat du jour au
  lendemain : **risque humain, pas technique** — à annoncer, pas à livrer en
  silence.

### Les trois gabarits de pièce — et rien d'autre

Quarante et une pièces sortent de Lucie, par trois mécanismes : les **pièces**
(un modèle écrit d'avance), les **rapports** du catalogue (colonnes fixées), les
**listes** du générateur (colonnes au choix). Elles n'ont pas besoin de trois
dessins : l'en-tête, le filet doré, le pied et les marges sont **identiques** —
ils viennent déjà de la même enveloppe. Seul le CORPS change, et il n'en existe
que trois formes :

- **A — la liste.** Un tableau, éventuellement groupé, avec sous-totaux et total.
- **B — le rapport.** Une liste précédée de ce qu'elle démontre : une rangée de
  tuiles d'indicateur. La tuile porte l'état par son **rail gauche**, et lui
  seul — ni le fond, ni le chiffre.
- **C — la pièce nominative.** Ce qui nomme quelqu'un et l'engage : du texte, un
  tableau court, la mention réglementaire, un bloc de signatures.

**Une quatrième forme ne s'invente pas** : elle se discute, et elle entre ici.

**LE REPÈRE DE BLOC : la bande PORTE la couleur.** BA1/BE1 **orange** `#E8890C`,
BA2 **bleu clair** `#7FB3D5` (texte foncé, sinon illisible), BA3 **marine**
`#1B2B4B`, celui du logo. Premier essai : un filet de 4 px sur une bande marine
— au premier coup d'œil tout restait marine, et *un repère qu'il faut chercher
n'est pas un repère*. Ces trois teintes ne servent **qu'à ça** : elles ne disent
jamais un état, ce qui laisse vert, ocre et brique libres pour ce qui alerte.

**LE SOUS-TOTAL ADDITIONNE, IL N'ALERTE PAS.** Il se dessinait en jaune-marron.
Or l'ocre veut dire « regarde ça » partout ailleurs dans Lucie, et un sous-total
ne demande rien. Bleu très pâle `#EDF2F8` : il se détache de la donnée sans
prendre un sens qu'il n'a pas.

**LES DOMAINES D'ÉDITIONS SONT LES AXES DE LUCIE, ET RIEN D'AUTRE.** Le centre
rangeait en *Étudiants · Personnel · Pilotage · Organisation · Référentiels*
pendant que l'application a *Étudiants · Personnel · Organisation · Gestion* :
on apprenait un rangement pour travailler et un autre pour imprimer, et quand on
cherchait la dotation on essayait les deux. « Pilotage » devient **Gestion** —
même territoire, celui de ce qu'on engage. « Référentiels » rentre dans
**Organisation** : une unité, un cours, une grille, un acquis sont les objets de
cet axe, pas un métier séparé. **Configuration ne reçoit rien** : on y règle des
MODÈLES, on n'y produit pas de pièces.

---

## 6 bis. Les trois couches : dossier, organisation, attribution

Le **dossier pédagogique** dit ce qu'EST l'unité. Il ne bouge pas : c'est le
référentiel, approuvé par le Gouvernement.

La **grille d'organisation** dit ce qu'on en FAIT cette année — comment les
périodes se découpent, où l'autonomie se place, quand l'unité tombe dans
l'année. Elle se planifie AVANT d'attribuer : c'est la structure de l'année.
Elle se reprend d'une année sur l'autre comme le reste.

L'**attribution** dit QUI le fait.

Le `PlanificateurVisuel` existant a été bâti sur la troisième pour faire le
travail de la deuxième — `const voie = l.attribution_id`. On ne pouvait donc
planifier qu'après avoir attribué, et chaque bloc pendait à une ligne
d'attribution : c'est pour cela qu'il n'a jamais été fini, et non par manque de
courage. Il est remplacé, pas conservé à côté.

**LA GRILLE PROPOSE, ELLE N'IMPOSE PAS.** Ajouter une unité aux attributions
pose la question — « selon la planification ? » : oui, les lignes prévues sont
créées ; non, on garde la structure du dossier pédagogique. Jamais de
pré-remplissage muet, jamais de simple comparaison non plus.

**LA RÈGLE DES MULTIPLES EST OBLIGATOIRE, ET L'AUTONOMIE N'Y ENTRE PAS.** Les
périodes d'un COURS doivent être un multiple de ce que fixe le dossier. L'écran
annonce de combien on s'écarte.

> **L'AUTONOMIE SE COMPTE À PART, ET CE POINT A ÉTÉ CODÉ FAUX.** Elle était
> additionnée aux périodes du cours avant le modulo : un cours de 64 découpé en
> 64 périodes de théorie est conforme, mais y poser 4 périodes d'autonomie le
> portait à 68 et déclenchait « il manque 60 pour un multiple de 64 ». On
> demandait donc de casser une grille juste pour satisfaire un contrôle qui
> l'était moins. Ce sont **deux grandeurs distinctes** : les périodes de cours,
> qui tombent sur un multiple ; et l'autonomie de l'unité, qui se répartit sur
> ses cours et se contrôle **contre son propre plafond**. Les additionner
> revient à comparer des heures de cours à des heures de travail autonome.
> Corrigé en 2.12.30, après que la règle eut été écrite ici à l'envers — c'est
> ce texte qui avait fait écrire le code faux.

L'autonomie non placée est **signalée**, jamais répartie d'office ; en placer
plus que l'unité n'en porte est une anomalie à part entière.

**UN COURS NE SE SUPPRIME PAS, DONC IL NE S'ENREGISTRE PAS À ZÉRO.** Le cours
vient du dossier pédagogique : il existe, qu'on l'ait découpé ou non. On pouvait
pourtant retirer toutes ses activités, enregistrer, et le laisser à zéro période
— où **le contrôle le déclarait « conforme »**, zéro passant le modulo sans
bruit. Depuis 2.12.33 : **au pire, on revient au contenu du cours**, une ligne de
matière aux périodes du dossier, et la réponse le dit pour que l'écran n'ait pas
l'air d'avoir enregistré autre chose. Le contrôle, lui, signale « plus aucune
période » comme une anomalie propre — il rattrape ce qui a pu être écrit avant.

> **ANNONCER UN REPLI N'EST PAS LE FAIRE.** Première tentative : la fenêtre
> s'ouvrait sur un cours vidé à ZÉRO, avec une phrase en bas disant que le
> contenu reviendrait à l'enregistrement. On ouvrait donc sur un cours qui
> n'existe pas, et il fallait deviner qu'un clic sur *Enregistrer* le
> réparerait. **Le contenu du dossier EST la ligne**, posée et modifiable dès
> l'ouverture. La condition ne porte pas sur « ce cours a-t-il déjà été
> ouvert » mais sur **« y a-t-il une ligne ? »** : un cours qui garde les
> siennes n'est pas touché, et ce qu'on a sciemment retiré ne ressuscite pas.

**LES ACTIVITÉS Z NE SE PLANIFIENT PAS ET NE COMPTENT PAS** (Charles, 25
septembre 2026 — « les activités de développement professionnel en AESI,
périodes Z, ne comptent pas »). Ce sont des périodes ÉTUDIANT (7.3 du
dossier), du travail en autonomie, sans enseignant. Elles sortent donc de la
grille d'organisation, du document 2 et de la dotation, de la charge, des
totaux du référentiel et du poids d'un cours dans son unité. Elles se rangent
en `cours.per_etudiant`, jamais en `cours_per` — l'import du dossier les y
mettait, et c'est ainsi qu'elles s'étaient mises à compter. **Reste à trancher :**
figurent-elles dans le total des périodes porté par les pièces de l'étudiant
(attestation, DUE, PV de valorisation) ?

**LA FRISE PORTE DEUX GRANDEURS.** La **longueur** d'une barre est sa durée sur
l'année ; son **épaisseur**, son intensité — 5 px pour 2 h par semaine. Une
unité étalée sur deux quadrimestres est longue et fine, la même massée sur six
semaines est courte et épaisse, un stage à 22 h par semaine devient un pavé
qu'on ne peut pas rater. On voit la charge, pas seulement le calendrier.

**UNE SEULE GRILLE, DEUX LECTURES.** Ce qui est confié au professeur et ce que
vit l'étudiant coïncident presque toujours — presque : sur un stage, les heures
d'encadrement du superviseur ne sont pas les heures de l'étudiant. D'où une
BASCULE, pas deux grilles : deux grilles finiraient par diverger, et c'est celle
qu'on ne regarde pas qui serait affichée aux étudiants.

**UNE ACTIVITÉ EST UN SOUS-COURS, ET ELLE NE PARAÎT SUR AUCUNE PIÈCE
OFFICIELLE.** Théorie, TP, remédiation, évaluation, visite des copies : leur
somme retombe sur les périodes du cours, et c'est le COURS qui figure au contrat
de travail, sur l'attestation et sur le procès-verbal. C'est un choix
pédagogique, il peut différer d'un professeur à l'autre — la grille en propose
un, l'attribution peut en retenir un autre.

---

### Les traces — trois règles générales, valables partout dans Lucie

Posées par Charles le 19 septembre 2026, après qu'une attestation erronée eut
circulé sans qu'on puisse dire qui l'avait sortie. « Je veux des traces. »

- **LA DATE DU JOUR EST LE DÉFAUT.** Un champ de date vide impose un clic, un
  calendrier et un repérage visuel pour écrire ce que Lucie sait déjà. Et comme
  il coûte, il reste vide — si bien que les dates manquent précisément là où
  elles prouvent quelque chose. On propose **aujourd'hui**, et l'on corrige
  quand ce n'est pas le bon jour (`aujourdHui()` dans `pages/Valorisations.jsx`,
  à généraliser). Le défaut doit être correct.
- **LE NOM SE MET EN CAPITALES, LE PRÉNOM SE CAPITALISE — DEUX RÈGLES, DEUX
  FONCTIONS.** `lib/nom.js` les porte, sorties de `routes/acquis.js` où elles
  étaient enfermées : ce sont des règles d'écriture pures, et l'accueil en avait
  réinventé une troisième — le premier mot de l'identité —, qui salue les gens
  par leur nom de famille dès qu'elle s'écrit « DAELEMAN Florian ». Le serveur
  livre désormais `prenom` avec la session (`profilPublic`), l'écran ne devine
  plus. **Et `separerNomPrenom` rendait un prénom EN CAPITALES** — « DUPONT
  Marie » donnait `prenom: "MARIE"` — parce que les deux morceaux passaient par
  `nomPropreDepuisChaine`, qui suppose une identité entière. Ce champ part sur
  le bloc de signatures du procès-verbal.
- **CELUI QUI CLIQUE EST CELUI QUI SIGNE.** La personne qui accepte, valide ou
  coche est **la personne connectée** — jamais un nom choisi dans une liste, ni
  un champ libre. Un nom qu'on saisit est un nom qu'on peut mettre à la place
  d'un autre. Son nom est enregistré avec l'heure, et il paraît à l'écran.
- **TOUTE PIÈCE DIT QUI L'A PRODUITE.** *« Produit par Charles Sohet le
  19/09/2026 à 11:42 »*, dans le pied commun. Écrite **une fois**, dans
  `piedDocument()`, et non pièce par pièce : quarante et une pièces, ce sont
  quarante et une occasions d'oublier — et ce serait celle qu'on a oubliée qui
  circulerait sans qu'on sache d'où elle vient. Une pièce imprimée quitte
  Lucie, et c'est **hors** de Lucie qu'on se demande qui l'a sortie ; un
  registre interne ne suffit donc pas.

> **COMMENT L'UTILISATEUR ARRIVE JUSQU'AU PIED DE PAGE.**
> `lib/contexteRequete.js` porte la requête dans un `AsyncLocalStorage` ouvert
> par un middleware global. Passer l'utilisateur en paramètre aurait demandé de
> modifier les quarante et une pièces et tous leurs appels : on en aurait
> oublié la moitié — c'est la leçon des trente-trois routes d'attribution dont
> une seule filtrait. **Le contexte garde `req`, pas `req.user`** : le
> middleware s'exécute AVANT l'authentification, qui a lieu route par route, et
> copier la valeur y aurait figé un `null` pour toute la requête — toutes les
> pièces seraient sorties sans nom, sans que rien ne le signale.
> Ce n'est **pas** un mécanisme d'autorisation : aucun droit ne se décide
> d'après ce contexte. Les droits se contrôlent sur la porte, avec `req.user`.

---

### Écritures et garde-fous

- **Rien ne s'écrit sans qu'on ait vu ce qui sera écrit** : tout import et tout
  traitement en lot passe par une simulation.
- **Un bouton caché n'est pas une protection** : une opération réservée au
  développement se refuse **côté serveur**.
- Une opération irréversible se nomme, se motive et laisse une trace.

---

## 7. Documentation destinée à l'école

- Public : secrétaires et enseignants. **Expliquer le travail, pas l'informatique.**
- Toujours préciser **quelle version** est décrite (dev ou prod) — un guide écrit
  sur dev montre des écrans que l'équipe n'a pas.
- Les captures d'écran viennent de Jérôme. **Ne pas décrire un détail visuel
  sans capture.**

---

## 8. Réflexe de démarrage de session

1. Lire ce fichier, puis **la passation la plus récente**
   (`docs/contexte/passation-AAAA-MM-JJ.md`, la dernière par date) : c'est elle
   qui dit ce qui a été livré depuis et ce qui reste ouvert.
2. Vérifier l'écart `develop` / `main` et les questions ouvertes non tranchées
   (`docs/contexte/`).
3. Poser d'abord les questions **bloquantes** — celles qui coûtent une minute à
   Jérôme et évitent une demi-journée de code faux.
4. `grep` les définitions avant toute requête ; chercher l'existant avant de
   construire.
5. Ne conclure « fait » qu'après vérification **et** confirmation à l'écran.
