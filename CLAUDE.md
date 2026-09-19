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
dossier pédagogique, tables de pondération vides.

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
occasions de se tromper d'une case. Depuis 2.12.36, *Valoriser en série* —
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
- **Deux formes d'onglet, et une règle qui dit laquelle.** La **pastille**
  (fond clair, coins arrondis) dit *où l'on est* — barre du haut, rail : on
  change de territoire. Le **soulignement** (`.onglet-page` /
  `.onglet-page-actif`) dit *quelle face du même objet* on regarde — les
  onglets d'une fiche, d'une fenêtre, d'un écran : on tourne une page. Le
  désordre ne venait pas d'avoir deux formes, mais de n'avoir aucune règle :
  douze barres d'onglets, cinq couleurs de soulignement, quatre hauteurs.
- **Une fenêtre ne bouge pas une fois ouverte.** Elle s'ancre en haut à une
  distance fixe (6 vh) et les grandes ont une **hauteur fixe** (88 vh) : c'est
  le contenu qui défile. Centrée verticalement, elle se recentrait à chaque
  changement d'onglet — un onglet court la faisait monter, un long descendre,
  et le bouton qu'on visait n'était plus là où on l'avait laissé.
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
- **Le rail s'ouvre en son milieu.** Les outils de l'écran ouvert étaient une
  section ajoutée SOUS les rubriques : le rail semblait se réécrire tout seul à
  chaque clic, et rien ne disait que ces icônes-là appartenaient à l'écran
  plutôt qu'à l'axe. Ils se déplient désormais **sous leur rubrique**, entre
  deux filets teintés (`--menu-sous`, déclaré dans les deux modes) ; ce
  qui suit glisse vers le bas. Le tiroir se monte **fermé** et s'ouvre à l'image
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
- **Le même ordre dans tous les rails, et il ne se discute pas** : SORTIR
  d'abord — « Imprimer ou envoyer », l'avion plutôt que l'imprimante depuis que
  le centre fait les deux, et le libellé suit le dessin —, puis les outils de
  l'écran, puis *Proposer une amélioration*, puis **DÉTRUIRE, toujours en
  dernier**. Le tri se fait sur un drapeau `destructif`, pas sur la place où
  chaque écran a rangé son entrée : une règle qui n'est juste que si l'on y
  pense est une règle fausse.
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

1. Lire ce fichier.
2. Vérifier l'écart `develop` / `main` et les questions ouvertes non tranchées
   (`docs/contexte/`).
3. Poser d'abord les questions **bloquantes** — celles qui coûtent une minute à
   Jérôme et évitent une demi-journée de code faux.
4. `grep` les définitions avant toute requête ; chercher l'existant avant de
   construire.
5. Ne conclure « fait » qu'après vérification **et** confirmation à l'écran.
