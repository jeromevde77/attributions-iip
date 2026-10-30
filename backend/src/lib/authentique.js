/**
 * L'AUTHENTICITÉ D'UNE PIÈCE — UN QR, UNE RÉFÉRENCE, UN REGISTRE (Charles, 30 octobre 2026 : « un petit QR qui
 * permet d'authentifier le document, pour éviter la fraude ; si quelqu'un scanne, il sait que c'est un vrai » ;
 * « les attestations et documents légaux ; les diplômes, eux, ont la signature manuscrite »).
 *
 * Chaque bloc de clôture (cachet, date, signature) porte sa référence — celle de ses vagues de micro-texte — et, juste
 * au-dessus, un QR qui mène à la page publique de vérification du portail des étudiants (`/?v=<référence>`). La pièce
 * s'inscrit au registre `piece_authentique` au moment où Lucie la compose : nature, objet, personne, date, auteur.
 * Lucie le DÉPOSE au portail, à sens unique, comme le reste (le mur tient) ; c'est le portail qui répond au scan.
 * Une référence inconnue = une pièce que Lucie n'a jamais produite. Le diplôme n'a pas de bloc de clôture : il n'en a
 * pas.
 */
import QRCode from 'qrcode';
import db from '../db/index.js';
import { utilisateurCourant } from './contexteRequete.js';

export const urlPortail = () => (process.env.PORTAIL_URL_PUBLIQUE || 'https://etudiants.lucie-iip.be').replace(/\/$/, '');
export const urlVerification = ref => `${urlPortail()}/?v=${encodeURIComponent(ref)}`;

let migre = false;
export function migrerAuthentique(dbx = db) {
  if (migre && dbx === db) return;
  dbx.exec(`CREATE TABLE IF NOT EXISTS piece_authentique (reference TEXT PRIMARY KEY, nature TEXT, objet TEXT, personne TEXT,
    emise_le TEXT NOT NULL DEFAULT (datetime('now')), emise_par TEXT, transmise_le TEXT)`);
  if (dbx === db) migre = true;
}

const net = t => String(t || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’')
  .replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim().slice(0, 300);

/** Inscrit une pièce au registre. Ne lève jamais : une pièce se produit même si le registre manque. */
export function enregistrerPiece({ reference, nature, objet, personne }) {
  try {
    migrerAuthentique();
    const u = utilisateurCourant();
    db.prepare(`INSERT OR IGNORE INTO piece_authentique (reference, nature, objet, personne, emise_par) VALUES (?,?,?,?,?)`)
      .run(reference, net(nature) || 'Pièce de l’Institut', net(objet) || null, net(personne) || null, u?.nom || u?.email || null);
  } catch (e) { console.error('[authentique] registre :', e.message); }
}

/** Le QR en SVG, net à l'impression (sans police ni image). */
export function qrSvg(texte) {
  const q = QRCode.create(texte, { errorCorrectionLevel: 'M' });
  const n = q.modules.size, m = 2, t = n + 2 * m;
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.modules.get(x, y)) d += `M${x + m},${y + m}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${t} ${t}" shape-rendering="crispEdges"><rect width="${t}" height="${t}" fill="#fff"/><path d="${d}" fill="#1B2B4B"/></svg>`;
}

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** La ligne d'authenticité, posée juste avant le bloc de clôture. */
export function blocAuthenticite(ref) {
  const url = urlVerification(ref);
  return `<div class="authenticite"><div class="authenticite-t">Pièce authentifiable · réf. <b>${esc(ref)}</b><br>
Scannez le code, ou rendez-vous sur <span>${esc(url.replace(/^https?:\/\//, ''))}</span></div><div class="authenticite-qr">${qrSvg(url)}</div></div>`;
}

export const STYLE_AUTHENTICITE = `
  .authenticite{display:flex;justify-content:flex-end;align-items:center;gap:2.5mm;margin:1.5mm 0 1mm;break-inside:avoid;
    font:6.5pt/1.35 Arial,Helvetica,sans-serif;color:#64748b;text-align:right}
  .authenticite b{color:#1B2B4B;letter-spacing:.2px}
  .authenticite span{color:#1B2B4B}
  .authenticite-qr{width:15mm;height:15mm;flex:none}
  .authenticite-qr svg{width:100%;height:100%;display:block}`;

/** Ce que le portail doit connaître : les pièces pas encore transmises. */
export function piecesATransmettre(limite = 500) {
  migrerAuthentique();
  return db.prepare(`SELECT reference, nature, objet, personne, emise_le FROM piece_authentique WHERE transmise_le IS NULL
    ORDER BY emise_le LIMIT ?`).all(limite);
}
export function marquerTransmises(refs) {
  const m = db.prepare("UPDATE piece_authentique SET transmise_le = datetime('now') WHERE reference = ?");
  db.transaction(() => { for (const r of refs) m.run(r); })();
}
