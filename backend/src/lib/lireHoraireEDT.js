// ─────────────────────────────────────────────────────────────────────────────
// Lucie — LIRE UN EMPLOI DU TEMPS D'INDEX ÉDUCATION
//
// L'horaire est fait ailleurs — les coordinations le bâtissent dans
// Hyperplanning, à partir des attributions. Lucie ne le fabrique pas encore ;
// elle doit d'abord savoir le LIRE, pour dire si l'horaire dépense bien ce que
// les attributions ont accordé, et à qui.
//
// LE FICHIER EST UN PDF, ET C'EST UN TABLEAU DÉGUISÉ. Chaque ligne est une
// séance ; les colonnes sont posées à des abscisses fixes :
//
//     28    132       208      273        324           426        529
//     jour  classe    60/60    cours      professeur    local      -
//
// On ne lit donc pas le texte à plat — l'export TRONQUE le libellé du cours et
// le colle au nom du professeur (« Bio - .DIAZ VILLAMIL Esteban »), si bien
// qu'une lecture par espaces sépare mal les deux. On lit les MOTS AVEC LEUR
// ABSCISSE, et l'on retrouve le professeur au premier mot tout en capitales :
// l'export écrit toujours le nom de famille ainsi, et « DIAZ VILLAMIL » —
// deux mots — s'en trouve pris entier, ce qu'une coupure sur l'espace ratait.
//
// Ce que le fichier ne dit pas, on ne l'invente pas : une séance sans code de
// cours (« Matière à préciser », une séance d'information) est gardée telle
// quelle, signalée, et ne se rapproche de rien.
// ─────────────────────────────────────────────────────────────────────────────

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// Les abscisses des colonnes, mesurées sur l'export. Une marge est laissée de
// part et d'autre : un libellé plus long déborde un peu, jamais d'une colonne.
const COL = { heure: [0, 130], classe: [130, 200], quotite: [200, 265],
              matiere: [265, 420], local: [420, 520] };

const CAPS = /^[A-ZÀ-Ý][A-ZÀ-Ý'’-]+$/;
const JOURS = /^(lun|mar|mer|jeu|ven|sam|dim)\./;

/**
 * L'ANNÉE SCOLAIRE SE DÉDUIT DU MOIS. L'export ne date ses lignes que du jour
 * et du mois : « Le 14 septembre », « Le 12 janvier ». Septembre à décembre
 * appartiennent à la première année civile, janvier à août à la seconde.
 */
function anneeDuMois(mois, annee) {
  const [a1, a2] = String(annee || '').split('-').map(Number);
  if (!a1 || !a2) return new Date().getFullYear();
  return mois >= 9 ? a1 : a2;
}

/**
 * Les mots, regroupés en lignes. LA PAGE FAIT PARTIE DE LA CLÉ : deux pages
 * ont les mêmes ordonnées, et regrouper sur la seule ordonnée entrelaçait la
 * première ligne de chaque page en une bouillie de trois séances.
 */
function lignesDeMots(mots) {
  const par = new Map();
  for (const m of mots) {
    const k = `${m.page}|${Math.round(m.y / 3)}`;
    (par.get(k) || par.set(k, []).get(k)).push(m);
  }
  return [...par.entries()]
    .sort((a, b) => {
      const [pa, ya] = a[0].split('|').map(Number);
      const [pb, yb] = b[0].split('|').map(Number);
      return pa - pb || ya - yb;
    })
    .map(([, l]) => l.sort((a, b) => a.x - b.x));
}

/**
 * @param {Array<{x:number,y:number,page:number,text:string}>} mots
 * @param {string} annee année scolaire de travail, pour dater les lignes
 */
export function lireHoraire(mots, annee) {
  const seances = [];
  const ecartees = [];
  let jour = null;
  let classe = null;

  for (const ligne of lignesDeMots(mots)) {
    const plat = ligne.map(m => m.text).join(' ').trim();

    // L'en-tête du document porte la classe : « TIM 1 ».
    if (!classe) {
      const c = plat.match(/^(TIM|OPTO|PSY|AESI|BES)\s*\d*$/i);
      if (c) { classe = plat; continue; }
    }

    const d = plat.match(/^Le (\d{1,2})\s+(\S+)$/);
    if (d) {
      const mois = MOIS.indexOf(d[2].toLowerCase()) + 1;
      if (mois) {
        jour = `${anneeDuMois(mois, annee)}-${String(mois).padStart(2, '0')}`
             + `-${String(Number(d[1])).padStart(2, '0')}`;
      }
      continue;
    }
    if (!ligne.length || !JOURS.test(ligne[0].text)) continue;

    const col = ([a, b]) => ligne.filter(m => m.x >= a && m.x < b)
      .map(m => m.text).join(' ').trim();

    // L'HEURE DE FIN ET LE NUMÉRO DE SÉANCE SE DISPUTENT LA MÊME PLACE.
    //
    // L'export écrit tantôt « de 15h30 à 17h. 1 », tantôt « de 15h30 à 1 17. » :
    // le numéro de séance passe devant l'heure de fin selon la largeur du
    // texte. Lire « le premier nombre après à » donnait donc une séance qui
    // finit à une heure du matin. On distingue les deux par leur FORME —
    // l'heure porte un « h » ou un point final, le numéro est un entier nu.
    const zone = col(COL.heure);
    const mDeb = zone.match(/de\s+(\d{1,2})h(\d{2})?/);
    const apres = zone.slice(zone.search(/\sà\s/) + 1);
    const mFin = apres.match(/(\d{1,2})h(\d{2})?(?![\d])|(\d{1,2})\./);
    if (!mDeb || !mFin || !jour) { ecartees.push(plat); continue; }
    const h = [null, mDeb[1], mDeb[2], mFin[1] ?? mFin[3], mFin[2]];

    // LA COLONNE « COURS + PROFESSEUR », que l'export a tronquée et recollée.
    // On la remet à plat, puis on coupe au premier mot tout en capitales.
    // LE CODE SE PRÉLÈVE AVANT TOUT DÉCOUPAGE : « 246.1 » porte un point, et
    // séparer sur les points en aurait fait « 246 » suivi d'une matière « 1 ».
    const brut = col(COL.matiere);
    const mCode = brut.match(/^(\d+(?:\.\d+)*)\s*-?\s*/);
    const code = mCode ? mCode[1] : null;
    const reste = mCode ? brut.slice(mCode[0].length) : brut;
    const mots2 = reste.replace(/\./g, '. ').split(/\s+/).filter(Boolean);
    const iProf = mots2.findIndex(x =>
      CAPS.test(x.replace(/[.,]/g, '')) && !/^\d/.test(x));
    const prof = iProf >= 0 ? mots2.slice(iProf).join(' ').replace(/\s+\./g, '').trim() : '';
    const matiere = (iProf >= 0 ? mots2.slice(0, iProf) : mots2)
      .join(' ').replace(/\s+/g, ' ').trim().replace(/^[-.\s]+|[-.\s]+$/g, '');

    // « Nile Auditoire Nile Auditoire » : l'export répète le local quand la
    // séance en occupe deux identiques. Un local suffit.
    const local = col(COL.local).replace(/^(.+?)\s+\1$/, '$1').replace(/\s+-$/, '').trim();

    const hhmm = (a, b) => `${String(Number(a)).padStart(2, '0')}:${b || '00'}`;
    seances.push({
      date: jour,
      heure_debut: hhmm(h[1], h[2]),
      heure_fin: hhmm(h[3], h[4]),
      classe: col(COL.classe) || classe || null,
      cours_code: code,
      matiere: matiere || null,
      professeur: prof || null,
      local: local || null,
    });
  }

  return { seances, ecartees, classe };
}

/** Les minutes d'une séance, pour compter les périodes réellement posées. */
export function dureeMinutes(s) {
  const m = t => {
    const [h, mn] = String(t || '').split(':').map(Number);
    return (h || 0) * 60 + (mn || 0);
  };
  const d = m(s.heure_fin) - m(s.heure_debut);
  return d > 0 ? d : 0;
}
