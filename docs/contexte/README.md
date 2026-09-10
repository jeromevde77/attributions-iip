# Le contexte de Lucie

Ce dossier contient ce qui, longtemps, **n'a existé que dans un compte
d'assistant** : les décisions, les règles, les pièges, l'état des chantiers.
Le code ne risquait rien ; ce contexte-là se perdait à chaque changement de
compte. Il vit désormais ici, versionné avec le code qu'il explique.

| Fichier | Ce que c'est |
|---|---|
| [`../../CLAUDE.md`](../../CLAUDE.md) | **Le contexte permanent** — à la racine, pour être lu en premier |
| [`audit-documents-impression.md`](audit-documents-impression.md) | Les 9 enveloppes, 4 pieds de page, 7 sorties, et la stratégie d'unification en 5 chantiers |
| [`passation-2026-09-04.md`](passation-2026-09-04.md) | État des branches, chantier des notes par acquis, questions restées ouvertes |
| [`conformite-deliberation.md`](conformite-deliberation.md) | Note au CA : les exigences réglementaires, couvertes / partielles / absentes |
| [`procedures-deliberation.md`](procedures-deliberation.md) | La chaîne paramétrage → encodage → délibération → attestation |

## Règle

**Aucun secret ici.** Un jeton GitHub a figuré en clair dans une version
antérieure de la note de passation ; il en a été retiré et doit être considéré
comme compromis. Les jetons vivent dans l'environnement du conteneur ou dans
les secrets GitHub — jamais dans un document, un commit ou une conversation.

## Quand mettre à jour

Une décision de fond — une règle métier tranchée, un standard adopté, un piège
rencontré deux fois — se note ici **dans le même commit** que le code qu'elle
justifie. Un contexte qu'on met à jour « plus tard » est un contexte qui ment.
