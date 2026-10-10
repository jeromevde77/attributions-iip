// ─────────────────────────────────────────────────────────────────────────────
// Lucie — L'IDENTITÉ DE L'ÉTABLISSEMENT SUR LES PIÈCES (3.1.253)
//
// Charles, 10 octobre 2026 : « il faut pouvoir importer un logo ; celui de l'atelier
// n'est pas le bon ; il faut aussi la signature et le cachet ». Les images vivaient
// dans des fichiers figés (services/assets/), importés par dix-sept modules. Plutôt
// que de réécrire chacun, ces fichiers exportent désormais des liaisons vivantes :
// ce qui est importé dans Configuration → Identité (établissement 1) les remplace
// au démarrage et à chaque enregistrement. Sans image importée, le fichier d'origine
// reste en vigueur. Les pièces d'une section rattachée à un AUTRE établissement
// liront le sien (`imagesEtablissement`).
// ─────────────────────────────────────────────────────────────────────────────
import db from '../db/index.js';
import { poserLogoJpeg } from '../services/assets/logo_iip_jpeg.js';
import { rafraichirLogo } from '../services/assets/logo_iip.js';
import { poserLogoBlanc } from '../services/assets/logo_iip_blanc.js';
import { poserSignature, poserCachet } from '../services/assets/signature_sohet.js';

export function imagesEtablissement(id = 1) {
  try { return db.prepare('SELECT logo, logo_blanc, signature, cachet FROM etablissement WHERE id = ?').get(id) || {}; }
  catch { return {}; }
}
/** L'établissement d'une section (1 à défaut). */
export function etablissementDeSection(section) {
  try { return db.prepare('SELECT COALESCE(etablissement_id, 1) id FROM section WHERE code = ?').get(section)?.id || 1; }
  catch { return 1; }
}
export function appliquerIdentite() {
  const i = imagesEtablissement(1);
  if (i.logo) { poserLogoJpeg(i.logo); rafraichirLogo(i.logo); }
  if (i.logo_blanc) poserLogoBlanc(i.logo_blanc);
  if (i.signature) poserSignature(i.signature);
  if (i.cachet) poserCachet(i.cachet);
}
