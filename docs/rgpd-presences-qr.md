# Fiche de traitement — la présence par QR code

*Institut Ilya Prigogine — Lucie, version 3.1.419 (octobre 2026). À relire par la
personne chargée de la protection des données avant l'ouverture à tous les cours.*

## 1. Ce que fait le traitement

Le professeur projette en classe un QR code qui change toutes les 15 secondes.
L'étudiant le scanne avec son téléphone ; sa présence s'enregistre dans le
registre des présences de Lucie, avec l'heure. La première fois, l'étudiant
donne son adresse d'école et recopie un code à six chiffres reçu à cette
adresse : son téléphone est alors « lié » à son dossier jusqu'à la fin de
l'année académique.

## 2. Finalité et base

- **Finalité** : tenir le registre des présences des unités d'enseignement,
  qui sert au contrôle de la régularité des étudiants (vérification de la
  Fédération Wallonie-Bruxelles) et aux attestations d'assiduité du
  congé-éducation payé.
- **Base** : mission d'intérêt public de l'établissement d'enseignement pour
  adultes ; la présence par QR ne fait que remplacer l'encodage à la main d'un
  registre que l'établissement tient de toute façon. Le professeur peut
  toujours encoder les présences à la main : le QR n'est pas obligatoire pour
  l'étudiant (pas de téléphone, plus de batterie → encodage par le professeur).

## 3. Les données

| Donnée | Où | Pourquoi | Durée |
|---|---|---|---|
| Présence (présent, absent, justifié, non concerné), heure, origine « QR » ou « manuel » | `presence`, `presence_journal` | Le registre | Celle du registre des présences |
| Identifiant du téléphone | `presence_appareil.jeton_hash` | Reconnaître le téléphone sans redemander l'adresse | Jusqu'au 15 septembre suivant (`expire_le`) |
| Type du téléphone (« iPhone · Safari ») | `presence_appareil.appareil` | Permettre au secrétariat de reconnaître un téléphone perdu | Idem |
| Dates de liaison et de dernier usage | `presence_appareil` | Suivi par le secrétariat | Idem |
| Code à six chiffres | `presence_code.code_hash` | Prouver que l'étudiant lit sa boîte d'école | Valable 10 minutes ; la ligne reste, chiffrée |
| Événements (liaison, refus, désactivation, autorisation) | `presence_qr_journal` | Trace des gestes et des refus | Comme le registre |

**L'identifiant du téléphone n'est jamais stocké tel quel.** Le téléphone garde
un jeton aléatoire dans un cookie (`lucie_presence`, httpOnly, limité aux
routes de la présence) ; la base n'en garde que l'empreinte (SHA-256). Le code
à six chiffres est lui aussi gardé sous forme d'empreinte.

**Ce qui n'est PAS collecté** : la position (aucune géolocalisation), le numéro
de téléphone, l'adresse IP en base. L'adresse IP sert seulement, en mémoire et
pendant un quart d'heure, à freiner les robots (nombre de tentatives) ; elle
disparaît au redémarrage du serveur.

## 4. Qui voit quoi

- **Le professeur** : les présences de ses cours, le compteur pendant le scan.
- **La coordination** : les présences des cours de ses sections ; dans le suivi,
  les absences au-delà du seuil, les téléphones liés et le journal des étudiants
  de ses sections, en lecture seule.
- **Le secrétariat et la direction** : la grille des présences, les téléphones
  liés (type d'appareil, dates), le journal. Ils peuvent désactiver un
  téléphone ou autoriser un nouveau téléphone, toujours avec un motif écrit,
  au nom de la personne connectée.
- **La vérificatrice** (FWB) : la grille de présence qu'on lui remet.
- **L'étudiant** au-delà d'un seuil d'absences (10 % sans justificatif — congé-éducation ;
  40 % sans motif valable — condition d'assiduité, RGE du supérieur art. 6 ; réglables) peut recevoir, à son adresse d'école,
  un avis listant ses absences injustifiées : le secrétariat le lit avant de
  l'envoyer, rien ne part automatiquement, chaque envoi est journalisé.

L'étudiant ne voit que sa propre confirmation (« présence enregistrée »).

## 5. Sécurité

- Le QR est signé (HMAC) avec une clé du serveur (`PRESENCE_QR_SECRET`, ou une
  clé dérivée de `JWT_SECRET`), jamais écrite dans le dépôt. Sans clé, la
  fonction se refuse.
- Le QR change toutes les 15 secondes et le scan n'est ouvert qu'autour du
  début du cours (10 minutes avant, 20 minutes après) : une photo transmise à
  un absent ne sert pas.
- Un téléphone ne sert qu'à un étudiant ; un étudiant ne lie qu'un téléphone
  par semaine (au-delà, le secrétariat).
- L'adresse doit être une adresse d'école connue de Lucie et le code part à
  cette adresse : on ne peut pas se lier au dossier d'un autre.
- Le journal est en ajout seul : aucune route ne le modifie ni ne l'efface.

## 6. Information des étudiants

La page de scan dit, à chaque étape : « Lucie ne garde de ce téléphone qu'un
identifiant chiffré et son type (« iPhone · Safari »), jusqu'à la fin de
l'année académique. Aucune localisation. »

## 7. À trancher avant l'ouverture à tous

1. Mentionner le traitement dans le règlement d'ordre intérieur ou la notice
   vie privée de l'établissement.
2. Durée de conservation du journal et des codes chiffrés : aujourd'hui ils
   restent avec le registre ; une purge annuelle (codes de plus d'un an) peut
   s'ajouter si la personne chargée de la protection des données le demande.
3. Vérifier, sur le serveur de production, que la clé est posée et que les
   courriels du code partent bien vers les adresses d'école.

## 8. Où vit le code

`backend/src/lib/presenceQr.js` (métier), `backend/src/routes/presenceQr.js`
(porte publique de l'étudiant), `backend/src/routes/presenceQrSuivi.js` (suivi du
secrétariat), `frontend/src/pages/PresenceQR.jsx` (page du téléphone),
`frontend/src/components/PresenceQRSuivi.jsx` (écran du secrétariat). Essais :
`backend/test/presenceQr.mjs`.
