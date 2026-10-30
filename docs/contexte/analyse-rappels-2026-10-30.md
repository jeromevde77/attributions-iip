# Les rappels — analyse complète (30 octobre 2026)

Demande de Charles : « points non encodés, notes non lues, documents non vus… délibération dans moins de 10 jours…
avec courriel automatique sur l'adresse Prigogine, prof ou étudiant le cas échéant, secrétariat ; ça doit être complet ».

Décisions déjà prises (30 octobre) :
- **destinataires** : professeurs, étudiants, secrétariat, coordination et direction ;
- **adresse** : celle d'institut ;
- **forme** : tout entre dans le récapitulatif du matin, seul l'urgent part aussitôt ;
- **délibération** : rappel de la date à J-10 et J-3, dernier délai d'encodage des points à J-2 ;
- **réglage** : par la direction seule, sans désabonnement possible.

Rien n'est codé.

## 1. Ce qui existe aujourd'hui

| Mécanisme | Où | Pour qui | Courriel | Limite constatée |
|---|---|---|---|---|
| Récapitulatif du matin | `lib/recapQuotidien.js` | comptes actifs | oui, en production seulement | Compte les tâches, les textes à confirmer, les messages et les idées. **Ignore** les échéances, les notes, les présences, les VA, le PAE et les notifications. |
| Rappels de l'échéancier (J-30/7/1, jour J, retard) | `services/echeancier.js` `genererRappels` | responsable ou rôle | **non** (tableau de bord seulement) | `rappel_envoye.canal = 'email'` est prévu, jamais utilisé. Les ancres `deliberation`, `publication`, `contrat_fin` et `evenement` ne sont **jamais déclenchées** : « publication des résultats » et « fenêtres de recours » ne naissent donc jamais. |
| Rapport du mois | `routes/reunions.js` | direction | oui | — |
| Avis « message » et « document déposé » | `messagesEtudiants.js`, `depotEspace.js` | étudiant | oui, un par jour au plus | Rien ne relance un document jamais ouvert. |
| Appel aux chargés de cours (avis VA) | `lib/avisVA.js` | chargé de cours | oui, mais l'interrupteur est éteint par défaut | Délai de 10 jours ouvrables annoncé, ni calculé ni relancé. |
| Avis d'absences au-delà du seuil | `alertesAbsences.js` | étudiant | manuel (« jamais d'envoi automatique ») | — |

Trois manques de fond :
- il n'existe aucune fonction « reste à encoder » réutilisable : la complétude n'est calculée qu'à l'enregistrement (`signalerSiComplet`) ;
- aucune requête ne repère une séance de délibération dont la date est passée et qui n'est pas close ;
- `deliberation_seance.date_seance` est souvent vide tant que la séance n'est pas préparée.

## 2. Le principe : un moteur, un catalogue

`lib/rappels.js` porte un **catalogue**. Chaque rappel y est décrit une fois :
- `cle`, `famille`, intitulé ;
- **destinataires** : un rôle, une personne, le professeur attribué ou l'étudiant ;
- **déclencheur** : une fonction qui rend `{ personne, objet, date }` ;
- **jalons** : J-10, J-3, J-2, retard… ;
- **urgence** : matin ou immédiat ;
- un lien vers l'écran.

Un passage toutes les 30 minutes calcule ce qui est dû. `rappel_envoye` (table existante) empêche tout doublon, à raison d'une ligne par personne, objet et jalon.

- **Matin** : les rappels dus entrent dans le récapitulatif, sous une rubrique « Rappels ». Le récapitulatif s'étend aux professeurs **sans compte**, à leur `professeur.adresse_mail` (à trancher, voir § 5).
- **Immédiat** : un seul courriel groupe tous les urgents d'une personne pour le même passage.
- **Étudiants** : un avis « des choses vous attendent dans votre espace », au plus un par jour. Il généralise l'avis des messages et passe par le portail, derrière le mur. Le courriel ne recopie aucun contenu.
- **Configuration → Courriels → Rappels** (direction seule) : un interrupteur et les délais de chaque rappel, ainsi que l'historique de ce qui est parti. Personne ne se désabonne.
- **En production seulement** : la dev redirige tout vers une seule boîte. Sur la dev, un bouton « m'envoyer un essai » permet de vérifier.
- **Une écriture que personne ne relit est une boucle ouverte** : chaque rappel mène à l'écran où l'on agit. L'historique des envois se lit dans Configuration.

## 3. Le catalogue

Légende : **M** = dans le courriel du matin ; **U** = urgent, part aussitôt.

### Professeurs (adresse d'institut)

| # | Rappel | Déclencheur (donnée) | Jalons | Forme |
|---|---|---|---|---|
| P1 | Délibération de votre UE le jj/mm | `deliberation_seance.date_seance` non close, UE où il est attribué | J-10, J-3 | M |
| P2 | Points à encoder : N étudiants, cours X | nouvelle fonction `resteAEncoder(cours, session)`, extraite de Mes cours (hors reportés et dispensés) | avec P1 à J-10 et J-3 ; **J-2 : dernier délai** | M, puis U à J-2 |
| P3 | Dernier délai dépassé | P2 non vide après J-2 | J-1, jour J | U (copie : voir § 5) |
| P4 | Seconde session : points à encoder | `deliberation_session2.s2_date` et ajournés du cours | J-10, J-3, J-2 | comme P2 |
| P5 | Présences à compléter | séances passées de ses cours sans présence (`donneesGrille` et `seancesDuCours`) | le lendemain, puis une fois par semaine | M |
| P6 | Avis demandé sur une VA | `valorisation_avis_appel` sans `valorisation_avis` | J+5, J+10 ouvrables (dépassé) | M ; à J+10, copie à la coordination |
| P7 | Avis demandé sur un aménagement raisonnable | `amenagement_avis` attendu | J+5, J+10 | M |
| P8 | Textes à confirmer, messages, tâches | existant (récapitulatif) | — | M |

### Secrétariat

| # | Rappel | Déclencheur | Jalons | Forme |
|---|---|---|---|---|
| S1 | Délibération sans date | UE dont `organisation_ue.date_fin` approche, sans `date_seance` | fin d'UE -15 j | M |
| S2 | Séance passée non close | `date_seance` < aujourd'hui, `cloturee = 0` | J+2, puis chaque semaine | M |
| S3 | Résultats à publier | séance close, `publie_le` vide | J+1 | M |
| S4 | Valorisations en retard | paquets de `/valorisations/en-retard` (recevabilité, notification, eProm, hors délai, sans preuve) | quand du nouveau entre | M |
| S5 | PAE en ligne à traiter | `pae_proposition` au statut `deposee` | dès le dépôt ; J+3 | M |
| S6 | Absences au-delà du seuil | nouveaux noms dans `alertesAbsences` | quand du nouveau entre | M (l'avis à l'étudiant reste manuel) |
| S7 | Congé-éducation | nouveaux types d'échéance : attestations d'inscription au 31/10 ; assiduité par tranche de 3 mois depuis le début de l'UE | J-15, J-7 | M |
| S8 | Frais impayés | `calculerFrais` : reste dû après `echeance_solde` (liste globale à écrire) | J+3, puis chaque semaine | M |
| S9 | Aménagements raisonnables | `a_faire` du registre : décision à rendre, à notifier, mesures à communiquer | quand du nouveau entre | M |
| S10 | Échéancier légal (GEDI, ANRJ, EA12…) | `genererRappels`, désormais **aussi par courriel** | jalons du type d'échéance | M ; U au jour J |

### Coordination (ses sections)

| # | Rappel | Déclencheur | Jalons | Forme |
|---|---|---|---|---|
| C1 | Encodage de l'UE : qui n'a pas encodé | P2 agrégé par UE, professeurs nommés | J-3, J-2 | M, puis U à J-2 |
| C2 | Valorisations à instruire | recevabilité, avis, décision (ses sections) | quand du nouveau entre | M |
| C3 | PAE en ligne à traiter | comme S5, dans son périmètre | dès le dépôt | M |
| C4 | Séance non close, date à poser | S1 et S2, dans son périmètre | comme S1 et S2 | M |
| C5 | Échéances d'UE (préparation, conseil des études) | `ue_preparation`, `ue_conseil_etudes` | existant, désormais par courriel | M |

### Direction

| # | Rappel | Déclencheur | Jalons | Forme |
|---|---|---|---|---|
| D1 | Valorisations à valider | décidées, non validées | quand du nouveau entre | M |
| D2 | Procédures : délai qui tombe | `echeances(d)` de `lib/procedures.js` (prochaine date, hors délai) | J-2, jour J | U |
| D3 | Réouvertures et séances non closes | S2, toute l'école | chaque semaine | M |
| D4 | Échéances statutaires (DPPR, classement…) | échéancier, désormais par courriel | jalons du type | M |
| D5 | Idées déposées | existant | — | M |

### Étudiants (adresse d'institut, par le portail)

| # | Rappel | Déclencheur | Jalons | Forme |
|---|---|---|---|---|
| E1 | Un document vous attend | `envoi_mail` vers l'étudiant sans `portail_accuse.presente_le` | J+7, J+30, puis J+80 (avant le code des 90 jours) | avis du jour |
| E2 | Accusé ou règlement à signer | `presente_le` sans `signe_le` ; règlement destiné aux étudiants non signé | J+3, J+10 | avis du jour |
| E3 | Votre PAE est à confirmer | `etudiant_pae.confirme_le` sans `pae_signature_etudiant` à jour | J+2, J+7 | avis du jour |
| E4 | La période du PAE en ligne s'ouvre / se ferme | fenêtre `pae_en_ligne` | ouverture, puis fermeture J-3 | avis du jour |
| E5 | Message non lu | `message_etudiant_dest.lu_le` vide | J+3 | avis du jour |
| E6 | Frais : acompte ou solde | `calculerFrais` | échéance J-7, J+3 | avis du jour |
| E7 | Demande de VA non terminée | gestes `va_geste` sans « terminer » | J+3, et J-3 avant la fin du délai (`controleDelai`) | avis du jour |
| E8 | Résultats publiés | `publie_le` posé (déjà couvert par le dépôt d'office) | — | existant |

## 4. Corrections nécessaires au passage

- **Échéancier** : déclencher les ancres `deliberation` (date de séance posée) et `publication` (`publie_le` posé). Sans cela, « publication des résultats » et « fenêtres de recours » n'apparaissent jamais.
- **Mes cours** : extraire `resteAEncoder()` de la feuille de notes. Une seule règle pour l'écran, la complétude et les rappels.
- **Frais** : une liste des impayés de l'année. Elle n'existe pas : tout se lit étudiant par étudiant.
- **CEP** : rien ne garde la trace d'une attestation émise. Le rappel ne peut dire que « l'échéance approche », pas « elle a été faite ».
- **Avis VA** : l'interrupteur `va_avis_courriel` est éteint par défaut. Avec les rappels, l'appel aux chargés de cours doit partir.

## 5. Tranché par Charles (30 octobre 2026)

1. **Sans date de délibération** : seulement l'alerte « date à poser » à la coordination et au secrétariat, 15 jours avant la
   fin de l'UE (S1, C4). Les professeurs ne reçoivent leurs rappels qu'une fois la date posée.
2. **Dernier délai dépassé** (P3) : copie à la **coordination de la section** de l'UE.
3. **Professeurs sans compte** : la question ne se pose pas, **tout le monde a un compte**. Les rappels vont aux comptes
   (`utilisateur.email`, relié à la fiche par `professeur_id`).
4. **Étudiants** : E1 à E7 partent tous d'office (documents et accusés, PAE, frais, messages et VA), au plus un avis par jour.

## 6. Ordre de construction proposé

1. Le moteur et le catalogue, l'écran Configuration → Rappels, le courriel pour l'échéancier (S10, C5, D4) et la correction des ancres.
2. La délibération : P1 à P4, C1, S1 à S3, D3.
3. Le reste du personnel : P5 à P7, S4 à S9, C2 et C3, D1 et D2.
4. Les étudiants : E1 à E7, par le portail.
