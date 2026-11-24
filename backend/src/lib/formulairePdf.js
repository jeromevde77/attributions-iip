/* REMPLIR UN FORMULAIRE PDF OFFICIEL, BIEN (3.5.696, Charles, 24 novembre 2026 : « tu peux supprimer les …… ; les données que nous
   remplissons, tu les mets en gras ; veille à ce que toutes les polices soient identiques — j'aime les choses bien faites »).
   Une seule boîte à outils pour les formulaires de l'ASBL (note de frais, dépense par carte) :
   - la POLICE du formulaire — Calibri — en GRAS pour ce que Lucie écrit : Carlito (mêmes largeurs, libre, installée dans l'image
     du serveur) ; à défaut Calibri de Word (poste de développement), à défaut Helvetica gras ;
   - les POINTILLÉS d'une ligne se retirent (un aplat blanc à leur place) : la donnée se lit seule, sans points autour ;
   - une case cochée se NOIRCIT (lib/casesNoircies.js).
   Les positions se donnent comme on les relève sur le PDF : x depuis la gauche, « haut » depuis le haut de la page. */
import fs from 'node:fs';
import { noircirPdf } from './casesNoircies.js';

const POLICES_GRAS = [
  process.env.LUCIE_POLICE_FORMULAIRE,
  '/usr/share/fonts/truetype/crosextra/Carlito-Bold.ttf',
  '/Applications/Microsoft Word.app/Contents/Resources/DFonts/Calibrib.ttf',
].filter(Boolean);

export const BLEU_FORMULAIRE = [0.05, 0.16, 0.36];

export async function outilsFormulaire(doc, pg) {
  const { StandardFonts, rgb } = await import('pdf-lib');
  let police = null; let calibri = false;
  for (const chemin of POLICES_GRAS) {
    try {
      if (!fs.existsSync(chemin)) continue;
      const fontkit = (await import('@pdf-lib/fontkit')).default;
      doc.registerFontkit(fontkit);
      police = await doc.embedFont(fs.readFileSync(chemin), { subset: true });
      calibri = true; break;
    } catch (e) { console.error('[formulaire] police', chemin, e.message); }
  }
  if (!police) police = await doc.embedFont(StandardFonts.HelveticaBold);
  const H = pg.getSize().height;
  const bleu = rgb(...BLEU_FORMULAIRE);
  const blanc = rgb(1, 1, 1);
  // Helvetica ne connaît que le latin-1 : on y remplace ce qu'elle ne sait pas dessiner. Carlito dessine tout le français.
  const propre = s => (calibri ? String(s ?? '') : String(s ?? '').replace(/[^\x20-\x7E -ÿ’€–—…Œœ]/g, '?'))
    .replace(/[\r\n\t]+/g, ' ');
  const largeur = (s, taille = 10) => police.widthOfTextAtSize(propre(s), taille);
  return {
    police, calibri, H, propre, largeur,
    /** Écrit en gras, ligne de base à `haut` depuis le haut de la page. */
    texte(s, x, haut, taille = 10.5) {
      const t = propre(s); if (!t) return;
      pg.drawText(t, { x, y: H - haut, size: taille, font: police, color: bleu });
    },
    /** Retire les pointillés d'une ligne : un aplat blanc de (x0, haut0) à (x1, haut1). */
    effacer(x0, haut0, x1, haut1) {
      pg.drawRectangle({ x: x0, y: H - haut1, width: x1 - x0, height: haut1 - haut0, color: blanc });
    },
    noircir(x, haut, cote) { noircirPdf(pg, x, haut, cote, bleu); },
    /** Une case du glyphe Wingdings (coin haut gauche du glyphe tel que le lit pdftotext, sa largeur) : le carré mesuré sur le
       modèle — 7,92 pt dans un glyphe de 9,8, décalé de 0,95 et 1,35 pt (mesuré au 1/1200 de pouce) — rempli EN ENTIER, trait compris (3.5.697, Charles : « le carré n'est pas bien rempli »). */
    cocher(x0, haut0, largeurGlyphe = 9.8) {
      const k = largeurGlyphe / 9.8, cote = 7.92 * k, x = x0 + 0.95 * k, h = haut0 + 1.35 * k, r = -0.15;
      pg.drawRectangle({ x: x + r, y: H - h - cote + r, width: cote - 2 * r, height: cote - 2 * r, color: bleu });
    },
    /** Un carré mesuré (son coin haut gauche, son côté) rempli EN ENTIER, trait compris (3.5.697, Charles : « le carré n'est pas bien rempli »). */
    remplirCarre(x, h, cote) {
      const r = -0.15;
      pg.drawRectangle({ x: x + r, y: H - h - cote + r, width: cote - 2 * r, height: cote - 2 * r, color: bleu });
    },
    /** Un texte réparti sur des lignes de `max` points ; rend les lignes. */
    lignes(s, max, taille = 10.5) {
      const mots = propre(s).split(/\s+/).filter(Boolean); const out = []; let l = '';
      for (const m of mots) { const t = l ? `${l} ${m}` : m; if (largeur(t, taille) > max && l) { out.push(l); l = m; } else l = t; }
      if (l) out.push(l);
      return out;
    },
    async signature(dataUrl, x, haut, hauteurMax = 40, largeurMax = 150) {
      const m = /^data:image\/(png|jpe?g);base64,(.*)$/i.exec(dataUrl || '');
      if (!m) return;
      const img = m[1].toLowerCase() === 'png' ? await doc.embedPng(Buffer.from(m[2], 'base64')) : await doc.embedJpg(Buffer.from(m[2], 'base64'));
      const k = Math.min(hauteurMax / img.height, largeurMax / img.width);
      pg.drawImage(img, { x, y: H - haut - img.height * k, width: img.width * k, height: img.height * k });
    },
  };
}
