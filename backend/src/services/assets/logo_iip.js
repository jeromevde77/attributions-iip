// Logo IIP — FOND BLANC (27 septembre 2026).
// Ce fichier portait un PNG SANS TRANSPARENCE, sur fond noir : le diplôme et
// les modèles de l'éditeur sortaient avec un pavé noir autour du logo. Il
// renvoie désormais le même logo que toutes les autres pièces (logo_iip_jpeg).
import { LOGO_IIP_JPEG } from './logo_iip_jpeg.js';

export const LOGO_IIP_B64 = LOGO_IIP_JPEG;
export const LOGO_IIP_HTML = `<img src="${LOGO_IIP_JPEG}" alt="Institut Ilya Prigogine" style="height:60px;width:auto;display:block" />`;
