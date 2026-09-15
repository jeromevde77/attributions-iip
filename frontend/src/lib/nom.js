/**
 * LE NOM D'UNE PERSONNE S'ÉCRIT D'UNE SEULE FAÇON.
 *
 * Dans le même tableau se lisaient « Charles Sohet », « BOULENGIER Natacha » et
 * « Aevaliotis Malamati » : trois casses, deux ordres, trois personnes qu'on
 * croit issues de trois fichiers différents. Rien de tout cela ne vient du
 * code — ce sont des chaînes tapées à la main, un jour, par quelqu'un.
 *
 * LA RÈGLE, ET ELLE EST ABSOLUE :
 *
 *      Prénom NOM       —  « Natacha BOULENGIER »
 *
 * Le prénom d'abord, première lettre en capitale ; le nom ensuite, tout en
 * capitales. C'est l'usage administratif belge, et il a une vertu pratique :
 * dans une liste, l'œil trouve le nom de famille sans avoir à le chercher,
 * parce qu'il est le seul en capitales.
 *
 * ON NE CORRIGE PAS LA BASE, ON CORRIGE L'AFFICHAGE. Réécrire les chaînes
 * enregistrées reviendrait à trancher à la place de l'utilisateur sur des
 * noms composés, des particules et des accents — et une fois écrasé, l'original
 * ne revient pas. La normalisation se fait donc à la lecture, partout, et la
 * donnée reste telle qu'elle a été saisie.
 */

const PARTICULES = new Set(['de', 'du', 'des', 'le', 'la', 'van', 'von', 'den',
  'der', 'di', 'da', 'el', 'ben', 'al', 'vander', 'vande', "d'", 'ter']);

function capitaliser(mot) {
  // Les composés gardent leur charnière : « Marie-Claire », « N'Diaye ».
  return mot.split(/([-'’])/).map(part =>
    /[-'’]/.test(part) ? part
      : part.charAt(0).toLocaleUpperCase('fr') + part.slice(1).toLocaleLowerCase('fr')
  ).join('');
}

/** « Prénom NOM » à partir des deux champs. */
export function nomPropre(nom, prenom) {
  const N = String(nom || '').trim().split(/\s+/).filter(Boolean)
    .map(m => m.toLocaleUpperCase('fr')).join(' ');
  const P = String(prenom || '').trim().split(/\s+/).filter(Boolean)
    .map(capitaliser).join(' ');
  return [P, N].filter(Boolean).join(' ');
}

/**
 * « Prénom NOM » à partir d'une seule chaîne, dont on ignore l'ordre.
 *
 * Trois indices, dans cet ordre de confiance :
 *   1. ce qui est DÉJÀ en capitales est le nom — c'est une intention ;
 *   2. à défaut, une particule marque le début du nom : « marie-claire de
 *      wilde » n'a pas pour nom « wilde » ;
 *   3. à défaut encore, le dernier mot est le nom, ce qui est l'usage courant
 *      de saisie.
 */
export function nomDepuisChaine(texte) {
  const mots = String(texte || '').trim().split(/\s+/).filter(Boolean);
  if (!mots.length) return '';
  if (mots.length === 1) return nomPropre(mots[0], '');

  const capitales = mots.filter(m => m.length > 1
    && m === m.toLocaleUpperCase('fr') && /\p{L}/u.test(m));
  if (capitales.length && capitales.length < mots.length) {
    return nomPropre(capitales.join(' '),
      mots.filter(m => !capitales.includes(m)).join(' '));
  }

  const i = mots.findIndex((m, k) => k < mots.length - 1
    && PARTICULES.has(m.toLocaleLowerCase('fr')));
  if (i > 0) return nomPropre(mots.slice(i).join(' '), mots.slice(0, i).join(' '));

  return nomPropre(mots[mots.length - 1], mots.slice(0, -1).join(' '));
}

/**
 * « NOM Prénom » — la forme des LISTES DE CHOIX, et d'elles seules.
 *
 * Dans une phrase, on écrit « Charles SOHET » ; dans une liste déroulante de
 * quarante personnes, on cherche un nom de famille. Le prénom d'abord, l'œil
 * balaie « Charles, Florian, Natacha… » sans jamais tomber sur ce qu'il
 * cherche, et l'ordre alphabétique de la liste — qui est celui des noms —
 * paraît faux. Le nom passe donc devant, et la liste redevient lisible.
 *
 * Ce n'est pas une seconde façon d'écrire les noms : c'est la même règle vue
 * de la colonne de tri.
 */
export function nomListe(texte) {
  const propre = nomDepuisChaine(texte);
  const mots = propre.split(/\s+/).filter(Boolean);
  const nom = mots.filter(m => m === m.toLocaleUpperCase('fr') && /\p{L}/u.test(m));
  const prenom = mots.filter(m => !nom.includes(m));
  if (!nom.length) return propre;
  return [nom.join(' '), prenom.join(' ')].filter(Boolean).join(' ');
}

/** Trier une liste de personnes comme elle s'affiche : par nom de famille. */
export function parNom(a, b) {
  return nomListe(a).localeCompare(nomListe(b), 'fr');
}

export default nomPropre;
