/* UNE CASE COCHÉE SE NOIRCIT, ELLE NE SE CROISE PAS (3.5.678, Charles, 24 novembre 2026 : « pour le formulaire carte
   bancaire, tu mets des moches croix. Je préfère que tu complètes la case en la noircissant. D'ailleurs pour TOUS les
   formulaires avec cases »). Une seule règle pour les trois façons dont Lucie coche :
   - les pièces composées (HTML, Word écrit par Lucie) emploient le glyphe CASE_NOIRE au lieu de ☒ / ☑ ;
   - les formulaires Word officiels (cases « FORMCHECKBOX » des modèles FWB, STIB…) : `noircirWord` remplace, à la
     dernière étape, chaque case cochée par un carré plein dans la police et la taille de la case ; une case vide reste
     un champ de Word, que l'on peut encore cocher ;
   - les formulaires PDF (pdf-lib) : `noircirPdf` remplit l'intérieur de la case. */

export const CASE_NOIRE = '■';
export const CASE_VIDE = '☐';
export const caseTexte = v => (v ? CASE_NOIRE : CASE_VIDE);

/** Les cases cochées d'un document.xml de Word, rendues en carré plein. */
export function noircirWord(xml) {
  return String(xml).replace(
    /<w:r\b(?:(?!<\/w:r>)[\s\S])*?<w:fldChar w:fldCharType="begin"[^>]*>(?:(?!<\/w:r>)[\s\S])*?<w:checkBox>([\s\S]*?)<\/w:checkBox>[\s\S]*?<w:fldChar w:fldCharType="end"\s*\/>\s*<\/w:r>/g,
    (tout, corps) => {
      const coche = /<w:checked(?:\s+w:val="(?:1|true)")?\s*\/>/.test(corps)
        || (!/<w:checked\s+w:val="(?:0|false)"/.test(corps) && /<w:default w:val="(?:1|true)"\s*\/>/.test(corps));
      if (!coche) return tout;
      // La première exécution porte la mise en forme de la case (police, taille) : on la garde.
      const rPr = (/<w:rPr>[\s\S]*?<\/w:rPr>/.exec(tout.slice(0, tout.indexOf('<w:fldChar'))) || [''])[0];
      return `<w:r>${rPr}<w:t>${CASE_NOIRE}</w:t></w:r>`;
    });
}

/** Une case de PDF (coin haut gauche x, haut ; côté en points) remplie de la couleur donnée. pdf-lib : y compte du bas. */
export function noircirPdf(page, x, haut, cote, couleur) {
  const H = page.getSize().height;
  const marge = Math.max(1.2, cote * 0.16);
  page.drawRectangle({ x: x + marge, y: H - haut - cote + marge, width: cote - 2 * marge, height: cote - 2 * marge, color: couleur });
}
