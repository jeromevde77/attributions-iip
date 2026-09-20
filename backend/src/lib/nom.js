// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Nom et prénom, écrits pareil pour tout le monde
//
// Ces fonctions vivaient dans `routes/acquis.js`, six mille lignes de
// délibération, parce que c'est là qu'on en avait eu besoin en premier. Elles
// n'y avaient rien à faire : ce sont des règles d'écriture pures, sans base de
// données, et le jour où l'écran d'accueil a voulu dire « Bonjour, Florian »,
// il a réinventé la sienne — le premier mot de la chaîne — qui rend le NOM de
// famille dès que l'identité s'écrit « DAELEMAN Florian », c'est-à-dire chez
// nous, toujours.
//
// DEUX SOURCES POUR UN MÊME FAIT, C'EST UNE SOURCE DE MOINS. Une seule règle,
// dans un seul fichier, que tout le monde importe.
//
// La règle elle-même : les professeurs viennent de la base en « NOM Prénom » ;
// la direction, d'un champ de configuration où elle s'écrit « Charles SOHET ».
// Le même conseil portait donc deux conventions à la fois — ordre inversé,
// casse différente —, et cela se voyait sur chaque procès-verbal. Désormais :
// le NOM en capitales (particules comprises, car « DE WILDE » et
// « VAN DEN BERGHE » s'écrivent ainsi sur les listes), le prénom capitalisé.
// ─────────────────────────────────────────────────────────────────────────────

/** Plusieurs mots capitalisés : « jean-pierre marie » → « Jean-Pierre Marie ». */
function capitaliserMots(texte) {
  return String(texte || '').trim().split(/\s+/).filter(Boolean)
    .map(capitaliser).join(' ');
}

function capitaliser(mot) {
  const m = String(mot || '').trim();
  if (!m) return '';
  // « Jean-Pierre », « M'Barek » : chaque segment prend sa majuscule.
  return m.toLowerCase().replace(/(^|[-'’\s])([\p{L}])/gu,
    (_, sep, c) => sep + c.toLocaleUpperCase('fr'));
}

export function nomPropre(nom, prenom) {
  const N = String(nom || '').trim().toLocaleUpperCase('fr').split(/\s+/)
    .filter(Boolean).join(' ');
  const P = String(prenom || '').trim().split(/\s+/).filter(Boolean)
    .map(capitaliser).join(' ');
  // PRÉNOM D'ABORD, NOM EN CAPITALES. C'est l'usage administratif, et il a une
  // vertu pratique : dans une liste, l'œil trouve le nom de famille sans le
  // chercher, parce qu'il est le seul en capitales.
  return [P, N].filter(Boolean).join(' ');
}

/**
 * Une identité donnée en une seule chaîne — « Charles SOHET », « SOHET
 * Charles », « charles sohet » — ramenée à la même forme que les autres.
 * Ce qui est TOUT EN CAPITALES est le nom ; à défaut, le dernier mot l'est,
 * car c'est ainsi qu'on écrit une signature.
 */
export function nomPropreDepuisChaine(texte) {
  const mots = String(texte || '').trim().split(/\s+/).filter(Boolean);
  if (!mots.length) return '';
  const capitales = mots.filter(m => m.length > 1 && m === m.toLocaleUpperCase('fr')
    && /\p{L}/u.test(m));
  if (capitales.length && capitales.length < mots.length) {
    return nomPropre(capitales.join(' '),
      mots.filter(m => !capitales.includes(m)).join(' '));
  }
  if (mots.length === 1) return nomPropre(mots[0], '');
  // Rien en capitales : une particule marque alors le début du nom —
  // « marie-claire de wilde » n'a pas pour nom « wilde ».
  const PART = new Set(['de', 'du', 'des', 'le', 'la', 'van', 'von', 'den', 'der',
    'di', 'da', 'el', 'ben', 'al', 'vander', 'vande']);
  const i = mots.findIndex((m, k) => k < mots.length - 1 && PART.has(m.toLowerCase()));
  if (i > 0) return nomPropre(mots.slice(i).join(' '), mots.slice(0, i).join(' '));
  return nomPropre(mots[mots.length - 1], mots.slice(0, -1).join(' '));
}

/**
 * COUPER UNE IDENTITÉ EN DEUX — et savoir de quel côté est le prénom.
 *
 * C'est la même règle que ci-dessus, rendue en deux morceaux plutôt qu'en une
 * chaîne. « VERHOEVEN Anne » donne { nom: 'VERHOEVEN', prenom: 'Anne' } quel
 * que soit l'ordre des mots : ce sont les CAPITALES qui désignent le nom de
 * famille, jamais la position.
 */
export function separerNomPrenom(brut) {
  const t = String(brut ?? '').trim().replace(/\s+/g, ' ');
  if (!t) return { nom: null, prenom: null };
  const mots = t.split(' ');
  if (mots.length === 1) return { nom: nomPropreDepuisChaine(t), prenom: null };

  /* LE PRÉNOM SE CAPITALISE, IL NE SE MET PAS EN CAPITALES — ET CE POINT
   * ÉTAIT FAUX DEPUIS L'ORIGINE. Les deux morceaux passaient par
   * `nomPropreDepuisChaine`, qui suppose une identité ENTIÈRE et traite un mot
   * isolé comme un nom de famille : « DUPONT Marie » rendait donc
   * prenom = « MARIE ». Ce champ part sur le procès-verbal, dans le bloc de
   * signatures. Le nom se met en capitales, le prénom se capitalise — ce sont
   * deux règles différentes, et il leur faut deux fonctions. */
  const capitales = mots.filter(m => m.length > 1 && m === m.toUpperCase()
    && /[A-ZÀ-Ý]/.test(m));
  if (capitales.length && capitales.length < mots.length) {
    const reste = mots.filter(m => !capitales.includes(m));
    return { nom: capitales.join(' ').toLocaleUpperCase('fr'),
             prenom: capitaliserMots(reste.join(' ')) };
  }
  if (mots.length === 2) {
    // Rien en capitales : « NOM Prénom » reste la convention de la maison.
    return { nom: mots[0].toLocaleUpperCase('fr'),
             prenom: capitaliserMots(mots[1]) };
  }
  // Trois mots ou plus sans capitales : on ne sait pas où couper.
  return { nom: nomPropreDepuisChaine(t), prenom: null };
}

/**
 * LE PRÉNOM SEUL, POUR SALUER QUELQU'UN.
 *
 * « Bonjour, DAELEMAN ! » — l'accueil prenait le premier mot de l'identité, ce
 * qui donne le nom de famille dès qu'elle s'écrit « NOM Prénom », c'est-à-dire
 * partout chez nous. On rend une chaîne vide plutôt qu'un nom de famille quand
 * la coupe est impossible : l'appelant sait alors se rabattre, au lieu de
 * tutoyer quelqu'un par son patronyme.
 */
export function prenomSeul(brut) {
  const { prenom } = separerNomPrenom(brut);
  if (!prenom) return '';
  // Un seul prénom à l'écran : « Marie-Claire Anne » se salue « Marie-Claire ».
  return prenom.split(/\s+/)[0] || '';
}
