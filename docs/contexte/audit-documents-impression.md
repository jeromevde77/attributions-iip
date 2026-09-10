# Lucie — audit de la communication, de l'export et de l'impression

Relevé sur `develop`. Référence pour les chantiers d'unification.

## Chiffres

- **9** enveloppes de document distinctes, pour une seule déclarée
- **4** techniques de pied de page, contradictoires entre elles
- **7** façons de déclencher une sortie côté écran, sur ~40 sites d'appel
- **5 documents sur ~20** inscrits au catalogue d'impression
- **3** composants « tuile d'indicateur » concurrents

## Constat 1 — neuf enveloppes, et la bonne est la moins employée

| Enveloppe | Définie dans | Usages | Distinction |
|---|---|---|---|
| A générique | `lib/document.js` | 2 | La « bonne ». Paramétrable, pied standard, Arial 10 pt. |
| B attestations | `routes/attestations.js` | 7 | Segoe UI 9 pt, bandeau CF, sceau. Pied dans le flux. |
| C ad hoc ×3 | `etudiants.js` ×2, `fraisScolarite.js` | 3 | Recopiée 3×. Tailles en **pixels**, non en points. |
| D procédures | `routes/procedures.js` | 2 | Marges en dur, pied `.footer-iip`, bleu `#1F3864`. |
| E EA12 | `services/ea12_html.js` | 1 | Marge 7 mm, aucun pied. |
| F contrat | `services/contrat_preview.js` | 1 | Pied en `table-footer-group`. |
| G diplôme | `services/diplome_template.js` | 1 | Paysage, marge nulle, aucun pied — **voulu**. |
| H offre | `services/offreDocument.js` | 1 | Styles inline, 640 px, esthétique courriel. |
| I courriel | `routes/envois.js` | 1 | Corps de message. Légitimement à part. |

**Le même en-tête écrit deux fois** : `.entete`/`.etab` (enveloppe B) et
`.delib-cf`/`.delib-etab` (`acquis.js`) produisent le même dessin — mêmes filets
`#C9A84C`, mêmes tailles 8/10,5/8,5 pt. Deux jeux de classes, un résultat.

## Constat 2 — quatre pieds de page contradictoires

| Technique | Où | Conséquence |
|---|---|---|
| `position:fixed; bottom:-16mm` | A, C | Descend dans la marge. **Bon comportement.** |
| `position:static` | B | Suit le contenu : position variable d'une page à l'autre. |
| `position:fixed; bottom:0` | D | S'arrête au bas de la zone de texte : blanc dessous. |
| `table-footer-group` | F | Se répète à chaque page, mais impose un tableau. |

Les commentaires de `lib/document.js` et `attestations.js` aboutissent à des
conclusions **opposées** sur la même question.

Marges basses divergentes pour le **même document** : 22 mm par la route des
attestations, 24 mm par le centre d'impression, 12 mm par défaut du moteur PDF.
La pièce ne sort pas pareil selon le bouton pressé.

La fiche d'inscription porte **deux pieds** superposés.

## Constat 3 — sept façons d'imprimer

| Technique | Sites | Ce que voit l'utilisateur |
|---|---|---|
| Onglet + impression auto | 14 | Boîte d'impression après 300/350/400/500/600 ms selon l'écran |
| Onglet **sans** impression | 6 | Un onglet s'ouvre, rien ne se passe |
| PDF par le serveur | 3 | Un vrai PDF. **La bonne voie, la plus rare.** |
| Téléchargement direct | 12 | Un fichier arrive |
| Excel côté navigateur | 4 | Un classeur arrive |
| CSV à la main | 3 | Trois conventions de séparateur et d'accents |
| PDF côté navigateur | 1 | Capture d'image, texte non sélectionnable |

**Deux centres copiés l'un sur l'autre** : `CentreImpression.jsx` et
`CentreDocumentsUE.jsx` portent la même liste de 9 pièces, recopiée, et gardent
deux états incompatibles (`{session,total}` vs `lecture:'1'|'2'|'T'`).

## Constat 4 — le catalogue ne catalogue presque rien

`lib/documents.js` recense **5 entrées**, consommées par `routes/impression.js`
seulement. Absents : PV de délibération, listes d'ajournés, dossier d'UE, DUE,
liste des diplômés, parcours de section, fiche de parcours, PV recours/fraude,
contrat, EA12, diplôme, offre d'emploi, fiche signalétique.

La portée `'etablissement'` est déclarée mais jamais utilisée — c'est celle
qu'il faut pour Pilotage.

## Constat 5 — doublons et manques

- **Deux moteurs PDF** : `services/pdf.js` (avec repli) et
  `services/contrat_pdf.js` (sans). `procedures.js` utilise le second.
- **Deux bibliothèques Excel** : `exceljs` au serveur, `xlsx` au navigateur.
- **Trois voies vers le PDF** : Chromium, LibreOffice, `jspdf`+`html2canvas`.
- **Archivage partiel** : `archiverDocument()` n'est appelé que deux fois.
  Attestations, PV, contrats, procédures ne laissent aucune trace.
- **`iip-gold` vaut `#1B2B4B`** — le nom ment.
- `due.js` place un `<style>` **après `</html>`** ; `diplomes.js` en injecte un
  au milieu du corps — le motif qui avait cassé le saut de page ailleurs.

## Stratégie — cinq chantiers, dans cet ordre

1. **Une seule enveloppe.** Partir de A, y verser ce que B sait faire (bandeau
   CF, cadre de titre, bloc de clôture), paramétrable par famille de pièce.
2. **Un pied, une technique.** Le pied fixe descendant dans la marge. Une seule
   marge basse quel que soit le chemin. Supprimer le pied en double.
3. **Le catalogue devient la seule porte.** Y inscrire les ~20 documents avec
   portée (dont `etablissement`), paramètres, rôles, route.
4. **Un seul centre d'impression**, alimenté par le catalogue, filtré par la
   portée de l'écran. Deux sorties : PDF si le serveur peut, impression
   navigateur sinon — même repli partout.
5. **Toute pièce laisse une trace** via `archiverDocument()`.

Les chantiers 1 et 2 sont invisibles pour l'utilisateur et ne touchent aucun
écran : ils se mènent pendant que tout continue à sortir.

## Standard de mise en page

Voir [`../../CLAUDE.md`](../../CLAUDE.md) §6.

## Réserve

L'enveloppe du **diplôme** (paysage, sans marge ni pied) et celle du **corps de
courriel** restent à part. L'unité vaut pour les pièces administratives.
