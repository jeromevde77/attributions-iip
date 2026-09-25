# Passation du 25 septembre 2026

Session Cowork (Charles + Claude). `develop` = **2.12.177**, poussé sur GitHub.
`main` reste à 2.12.172 : rien n'est encore passé en production.
**Rien n'a été vérifié à l'écran** — à faire sur dev après `ssh lucie-vps maj-dev`.

## Décisions tranchées par Charles (questions de la passation du 4 septembre)

1. Périodes Z : travail en autonomie, **pas à planifier** — et elles **ne comptent pas**
   (AESI, activités de développement professionnel).
2. Arrondi : 9,6 → **10** (règle de l'arrondi à l'unité).
3. Le professeur ne voit **que ses attributions**.
4. Cours ajourné : tout est ajourné par défaut, le professeur peut **lever** acquis par acquis.
5. Visibilité du personnel : **non tranché** (question à reformuler).
6. Recours : renvoyé au **RDE 2026-27**.

## Livré ce jour

- **2.12.173 Diplomation** — tout cocher / aucun / terminé cette année ; les pièces se
  produisent puis attendent leur geste (aperçu-impression, PDF, envoi) : plus de fenêtre
  bloquée. Diplômes en un seul PDF A4 paysage sans marge (`page_css` sur
  `/api/impression/pdf`). Attestations de section envoyables, une par étudiant.
  « Liste » ne produisait rien : corrigé ; PV de section (annexe 6/7) ajouté.
- **2.12.174 Chapeaux des acquis** — `aa.chapeau`, porté par le premier acquis du groupe
  (`frontend/src/lib/chapeaux.js`). Repris à l'import du DP, corrigible sur l'écran des
  acquis, affiché dans la DUE, le panneau des grilles et l'onglet « Acquis » du classeur.
- **2.12.175 Activités Z** — hors grille, document 2/dotation, charge, totaux du
  référentiel, poids du cours. L'import DP range leurs périodes en `per_etudiant`.
- **2.12.176 Liens acquis → cours** — une couleur par acquis (flèche comprise) ;
  case **« pas évalué »** par cours (`cours.non_evalue`, par année, jamais déduite de Z).
- **2.12.177 Configuration** — une seule rangée d'onglets pour le référentiel ;
  attestations sans seconde rangée.

## Questions ouvertes

- Diplôme envoyable par courriel, ou seulement l'attestation de section ?
- Périodes Z dans le total des périodes des pièces de l'étudiant (attestation, DUE, PV VA) ?
- Point 5 ci-dessus (visibilité du personnel).
- Import du classeur UE 264 : Charles utilisait l'importateur « fichier externe » sur la
  mauvaise UE (80) — le bon chemin est le bouton Exporter/Importer de la grille de l'UE 264.
  À confirmer qu'il passe.
