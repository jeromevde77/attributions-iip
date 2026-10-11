# Passation — 11 octobre 2026

Production et développement : **3.1.283** (serveur et écran vérifiés).
Guide des nouveautés depuis le 8 octobre : tuile « Quoi de neuf dans Lucie ? » du
tableau de bord (`frontend/public/nouveautes/2026-10.html`, `TuileNouveautes.jsx`) ;
copie externe : https://claude.ai/artifact/3M7nL6foKV9AcHXRRtBu6z (privée).

## Livré les 10 et 11 octobre (3.1.242 → 3.1.283)
Disponibilités et planning de l'école ; UE et stages en deux organisations ; organisation
de base ; design paramétrable (formes, zones, catalogue, thème sombre, Personnalisé) ; mode
mise en page ; plusieurs établissements ; « Annuler » des réglages puis général (↶) ;
groupes qui font foi ; bloc et quadrimestre lus du schéma par section ; primo ; nombre
d'étudiants au labo ; anniversaires et vœux ; budget (section, Autres, recherche,
référentiel) ; Communication et ménage ; compte neuf = tableau de bord propre ; cohortes
lots 1 et 2.

## À faire par Charles
1. Communication : essai à soi seul avec copie courriel (jamais testée en prod), puis
   message de bienvenue aux profs (lundi 12/10).
2. Publier la circulaire de rentrée v2 (corrections : `corrections-circulaire-examens-2026-10-10.md`) ;
   aligner le tableau de sa procédure examens v2 sur le point 14.
3. Taille des boutons : 36 px (Formes et composants) ou « Maison IIP ».
4. Budget : ligne Pôle académique RESTART → « Autres ».
5. Lundi de Pentecôte : /planification → Calendrier → semaine du 17 mai en « Cours ».
6. UE 77 : Q2 au schéma de Psychomotricité ; « Transition BA2 » (cohorte 2) et org 2 ; primo.
7. Attribution 3630 (333.2 groupe C) : organisation 2 et ses périodes.
8. AESI : cohorte 2 « Carnaval à Pâques », organisations 2 rattachées, étudiants placés.

## Questions ouvertes
- ZAUDIG Vanessa : nommée 40 p. sans cours précis, 20 attribuées.
- Ouverture du bâtiment (7h45 / 7h30) ; renvoi vers le technopédagogue (hybride).

## Prochains chantiers
- Cohortes lot 3 : laboratoire, simulation et organisation de base par cohorte ; cohorte
  de janvier sur deux années ; « Reprendre l'an dernier » pour une cohorte ≥ 2.
- Badge primo dans toutes les listes ; blocs rangeables sur d'autres pages ;
  horaire de chacun au secrétariat.

## À savoir
- Toute correction en `node -e` qui écrit en base déclare aussi `lucie_geste` (CLAUDE.md).
- La mise à jour automatique du VPS ne remplace parfois que le serveur : toujours
  contrôler le bundle servi (version de l'écran) après une mise en production.
