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
import { etablissementCourant, poserEtablissementCourant, fournirDeduction } from './contexteRequete.js';
import { LOGO_IIP_JPEG } from '../services/assets/logo_iip_jpeg.js';
import { LOGO_IIP_HTML } from '../services/assets/logo_iip.js';
import { LOGO_IIP_BLANC_B64, LOGO_IIP_BLANC_HTML } from '../services/assets/logo_iip_blanc.js';
import { SIGNATURE_SOHET, SCEAU_IIP } from '../services/assets/signature_sohet.js';
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

/* ── LES IMAGES DE LA PIÈCE EN COURS (3.1.443) ─────────────────────────────────────────────
 * Les pièces lisaient les images de l'établissement 1 dans des variables de module. Une variable
 * ne change pas d'une requête à l'autre sans que deux pièces produites en même temps puissent
 * échanger leurs logos : on lit donc, à l'instant de composer, l'établissement de la pièce
 * (contexte de requête) — le sien s'il a son image, celle de l'IIP sinon. */
const imageDe = champ => {
  const id = etablissementCourant();
  return id > 1 ? (imagesEtablissement(id)[champ] || null) : null;
};
const html = (src, h = 60) => `<img src="${src}" alt="" style="height:${h}px;width:auto;">`;
export const logoCourant = () => imageDe('logo') || LOGO_IIP_JPEG;
export const logoHtmlCourant = () => { const l = imageDe('logo'); return l ? html(l) : LOGO_IIP_HTML; };
export const logoBlancCourant = () => imageDe('logo_blanc') || LOGO_IIP_BLANC_B64;
export const logoBlancHtmlCourant = () => { const l = imageDe('logo_blanc'); return l ? html(l) : LOGO_IIP_BLANC_HTML; };
export const signatureCourante = () => imageDe('signature') || SIGNATURE_SOHET;
export const cachetCourant = () => imageDe('cachet') || SCEAU_IIP;

/** La pièce parle de cette section (ou de cet étudiant) : elle porte l'identité de son établissement. */
export function poserEtablissementDe({ section = null, etudiantId = null } = {}) {
  let sec = section;
  if (!sec && etudiantId) {
    try { sec = db.prepare('SELECT section_rattachement s FROM etudiant WHERE id = ?').get(Number(etudiantId))?.s || null; } catch { /* */ }
  }
  const id = sec ? etablissementDeSection(sec) : 1;
  poserEtablissementCourant(id);
  return id;
}

/* LA DÉDUCTION (3.1.443) : section nommée, sinon étudiant (sa section de rattachement), sinon UE (sa
   section). Tant qu'il n'existe qu'un établissement, rien n'est cherché : l'IIP. */
let nbEtab = { n: 1, le: 0 };
function combienEtablissements() {
  if (Date.now() - nbEtab.le > 60000) {
    try { nbEtab = { n: db.prepare('SELECT COUNT(*) n FROM etablissement').get().n, le: Date.now() }; } catch { nbEtab = { n: 1, le: Date.now() }; }
  }
  return nbEtab.n;
}
/** À appeler quand un établissement naît ou disparaît : la déduction relit le compte aussitôt. */
export function oublierCompteEtablissements() { nbEtab = { n: 1, le: 0 }; }
fournirDeduction(req => {
  if (combienEtablissements() <= 1) return 1;
  const p = req.params || {}, q = req.query || {}, b = (req.body && typeof req.body === 'object') ? req.body : {};
  const section = p.section || q.section || b.section;
  if (section) return etablissementDeSection(section);
  const etud = p.etudId || p.etudiantId || p.etudiant_id || q.etudiant_id || q.etudiant || b.etudiant_id
    || (/etudiants|attestations|diplomes|frais|annexe|sle|cep/.test(req.baseUrl || '') ? p.id : null);
  if (etud) {
    const s = db.prepare('SELECT section_rattachement s FROM etudiant WHERE id = ?').get(Number(etud))?.s;
    if (s) return etablissementDeSection(s);
  }
  const ue = p.ueNum || p.ue_num || q.ue_num || q.ue || b.ue_num;
  if (ue) {
    const s = db.prepare('SELECT section FROM ue WHERE ue_num = ? ORDER BY annee_scolaire DESC LIMIT 1').get(Number(ue))?.section;
    if (s) return etablissementDeSection(s);
  }
  return 1;
});
