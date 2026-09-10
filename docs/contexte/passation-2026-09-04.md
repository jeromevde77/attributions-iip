# Lucie — dossier de passation

**Date :** 4 septembre 2026
**Interlocuteur :** Jérôme, Institut Ilya Prigogine

> Note de reprise. Les versions et les SHA cités sont ceux du 4 septembre et
> ont été dépassés depuis ; ce qui reste utile, ce sont les **questions
> ouvertes** (§3) et les **pièges** (§5).

---

## 1. Où en étaient les branches

`main` (prod) très en retard sur `develop` (dev). Tous les builds dev passaient.

Dépôt : `jeromevde77/attributions-iip` (privé).

> ⚠️ **Un jeton GitHub figurait ici en clair.** Il en a été retiré et doit être
> considéré comme compromis : **le révoquer et en régénérer un**. Ne plus jamais
> écrire de jeton dans un document, un commit ou une conversation.

---

## 2. La décision qui attendait

**Que porter vers `main` ?**

Éprouvé sur données réelles TIM : import des classeurs de suivi, pondérations,
feuille de délibération avec notes par cours et par unité.

Livré mais jamais vu tourner : aménagements en trois étapes, fiche de parcours
imprimable, synthèse financière, réorganisation des onglets, pastille des UE
déterminantes.

Deux réserves posées :

- La réorganisation des onglets change les habitudes du secrétariat du jour au
  lendemain. **Risque humain, pas technique.**
- Les migrations sont additives et protégées par contrôle d'existence, mais
  **sauvegarde recommandée avant merge**.

---

## 3. Questions ouvertes — non tranchées

| # | Question | Pourquoi elle bloque |
|---|---|---|
| 1 | Comment les **périodes Z hors droit d'inscription** sont-elles marquées en base ? | Bloquant, une minute de réponse — à demander avant tout code |
| 2 | La note **par cours** affichée concorde-t-elle avec le classeur sur l'UE 248 ? | Si non, il faut aussi importer les notes par cours (colonnes 12→206) |
| 3 | Un professeur ne voit-il que **ses** cours à l'encodage ? | Touche au filtrage de périmètre |
| 4 | Un **acquis** ajourné — et non un cours entier — rend-il l'unité NA ? | Règle métier, pas choix d'implémentation |
| 5 | **Personnel** : une coordination voit le détail de ses sections, et seulement nom + périodes pour les autres | À traiter seul et avec soin |
| 6 | Vérifier les procédures et l'onglet **Recours** contre le RDE 2026-2027 (art. 87-91) | Le texte exact doit être confirmé |

---

## 4. Le modèle de calcul

Repris et complété dans [`../../CLAUDE.md`](../../CLAUDE.md) §4. Point vérifié à
l'époque : sur l'UE 248, notes de cours 14,8 / 13,0 / 10,1 pour des poids
47 / 31 / 22 → note d'unité 13,2, identique à la moyenne des notes de cours
pondérée. **Les deux voies concordent.**

La répartition 47/31/22 de l'UE 248 **ne coïncide pas** avec celle des périodes :
c'est ce qui justifie la bascule par millésime.

---

## 5. Pièges — repris dans CLAUDE.md

Supposer une structure au lieu de la lire (sept fois en une journée), pousser
VERSION et le code dans deux commits, refs locaux périmés, routes Express
paramétriques avant les spécifiques, `git pull -X theirs`.

---

## 6. Le mode d'emploi

`Lucie_Mode_emploi.docx`, 10 pages, public secrétaires et enseignants.

**Deux corrections avant diffusion :**

1. Il annonce un « liseré doré » pour les UE inscrites. **C'est faux** : les UE
   inscrites portent une **pastille ronde**, le cadre doré est réservé à
   l'épreuve intégrée.
2. Il décrit l'état de **dev**, pas de la production. À rediffuser après merge.

Les captures d'écran doivent venir de Jérôme — une quinzaine —, et il faut
d'abord décider **sur quelle version** les prendre.
