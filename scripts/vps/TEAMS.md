# Les invitations Teams des délibérations et des examens (3.5.666)

Lucie crée une **vraie réunion Microsoft Teams** pour une délibération ou un examen daté dans l'agenda de l'école, et
l'envoie aux professeurs attribués à l'unité (ou au cours). Elle passe par **la même application Microsoft Entra** que
l'envoi des courriels (Configuration → Courriels → Expéditeur, mode « Microsoft 365 (API Graph) ») : aucun nouveau
secret, aucune variable d'environnement, rien à changer sur le VPS.

Il reste trois gestes, dans Microsoft 365, puis un dans Lucie.

> Ce document ne nomme aucun compte réel et ne contient aucun secret. Les adresses ci-dessous sont des exemples.

---

## 1. Ajouter la permission à l'application de Lucie (Microsoft Entra)

1. Centre d'administration Microsoft Entra → **Applications** → **Inscriptions d'applications** → l'application de Lucie
   (celle dont l'identifiant figure dans Configuration → Courriels → Expéditeur).
2. **Autorisations de l'API** → **Ajouter une autorisation** → **Microsoft Graph** → **Autorisations d'application**
   (pas « déléguées ») → cocher **`Calendars.ReadWrite`** → Ajouter.
3. **Accorder le consentement administrateur** pour le locataire (bouton à côté de la liste). La ligne doit passer au vert,
   « Accordé ».

L'application a déjà `Mail.Send` (courriels) ; on n'y touche pas.

## 2. Choisir la boîte organisatrice

La réunion naît **dans le calendrier d'une boîte**, qui en est l'organisatrice : c'est elle que les professeurs voient comme
« organisateur » et c'est dans son agenda que les réunions s'accumulent.

- Une **boîte partagée** ou une boîte de service dédiée (par exemple `deliberations@<domaine>`) est le meilleur choix :
  personne ne reçoit les réponses des invités dans sa boîte personnelle.
- La boîte doit pouvoir porter des réunions **Teams** (licence avec Teams). Sans elle, l'événement se crée mais **sans lien
  Teams** — le bouton « Tester la permission » le dit.

## 3. (Facultatif, recommandé) Limiter l'application à cette seule boîte

`Calendars.ReadWrite` en permission d'application ouvre **tous** les calendriers du locataire. Une stratégie d'accès
d'application Exchange la restreint à la boîte organisatrice (Exchange Online PowerShell) :

```powershell
Connect-ExchangeOnline
# Un groupe de sécurité à extension messagerie qui contient la boîte organisatrice
# (et la boîte expéditrice des courriels, si la stratégie doit aussi couvrir Mail.Send).
New-ApplicationAccessPolicy -AppId <identifiant-de-l-application> `
  -PolicyScopeGroupId <groupe-des-boites-de-lucie@domaine> `
  -AccessRight RestrictAccess `
  -Description "Lucie : calendrier de la boîte organisatrice seulement"
# Vérifier :
Test-ApplicationAccessPolicy -Identity <boite-organisatrice@domaine> -AppId <identifiant-de-l-application>   # Granted
Test-ApplicationAccessPolicy -Identity <une-autre-boite@domaine>      -AppId <identifiant-de-l-application>   # Denied
```

Attention : une stratégie `RestrictAccess` vaut aussi pour l'envoi des courriels. **La boîte expéditrice des courriels
doit être dans le groupe**, sinon les courriels de Lucie cessent de partir.

La stratégie met jusqu'à une heure à s'appliquer.

## 4. Dans Lucie

1. **Configuration → Courriels → Invitations Teams** (direction) : la boîte organisatrice, la durée d'une délibération et
   d'un examen (120 minutes par défaut) → Enregistrer.
2. **Tester la permission** : Lucie crée un événement d'une minute, sans invité, dans la boîte organisatrice, puis
   l'efface. Réponses possibles :
   - « Permission en place … avec sa réunion Teams » : tout est prêt.
   - « … SANS réunion Teams » : la boîte n'a pas de licence Teams.
   - « la permission d'application Calendars.ReadWrite manque » : étape 1 (ou la stratégie de l'étape 3 exclut la boîte).
   - « ne trouve pas la boîte organisatrice » : adresse mal tapée, ou boîte inexistante.
3. **Configuration → Accès → Mise en service** : la fonction **« Les invitations Teams des délibérations et des examens »**
   naît **éteinte**. La mettre en **essai** pour un ou deux comptes (direction, secrétariat), puis **allumée**.

## Ce que fait Lucie ensuite

- Organisation → **Agenda de l'école** → une semaine des rangées Unités/Sessions → **Épreuves et délibérations** : un bouton
  **« Inviter sur Teams »** par délibération et par examen daté et à l'heure posée. Lucie montre d'abord qui sera invité
  (et qui n'a pas d'adresse), puis crée la réunion.
- Invités : les professeurs attribués à l'UE de l'année (de l'organisation de la séance quand elle en a une), hors congé —
  pour un examen, ceux du cours. Adresse : celle de la fiche du professeur, sinon celle de son compte Lucie.
- Une date déjà invitée **se met à jour** (même réunion, même lien) : nouvelle heure, professeurs ajoutés. Personne n'est
  retiré d'office.
- Une date retirée de Lucie dont la réunion court encore : la fenêtre de sa semaine propose **« Annuler la réunion »** ;
  Microsoft prévient les invités.
- Rien ne part sans le clic de confirmation ; la trace est dans la table `teams_invitation` (qui, quand, invités, lien).
