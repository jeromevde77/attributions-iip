/**
 * LA DISTANCE ROUTIÈRE ENTRE DEUX ADRESSES (3.5.059, Charles, 2 novembre 2026 : « et tu calcules les kilomètres ? » ;
 * tranché : calculer, domicile compris ; la distance tapée par le professeur est gardée et l'écart signalé).
 *
 * Deux services d'OpenStreetMap, gratuits et sans compte : Nominatim (une adresse → des coordonnées ; Photon de Komoot
 * en repli) et OSRM (deux coordonnées → l'itinéraire en voiture le plus court en temps). LES ADRESSES QUITTENT LUCIE le temps
 * de la requête — dont le domicile d'un professeur : à porter dans la fiche RGPD. Rien d'autre ne part (ni nom, ni étudiant).
 *
 * Tout se garde (`geo_adresse`, `distance_route`) : une même adresse ne se géocode qu'une fois, un même trajet ne se calcule
 * qu'une fois — la politique d'usage de Nominatim demande au plus une requête par seconde et un en-tête qui nomme l'appli.
 * Un échec (réseau, adresse introuvable) rend `null` avec la raison : la saisie à la main reste toujours possible.
 */
import db from '../db/index.js';

export function migrerDistances(base = db) {
  base.exec(`
    CREATE TABLE IF NOT EXISTS geo_adresse (
      adresse  TEXT PRIMARY KEY,
      lat      REAL, lon REAL,
      source   TEXT,
      trouve_le TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS distance_route (
      depart   TEXT NOT NULL,
      arrivee  TEXT NOT NULL,
      km_aller REAL NOT NULL,
      calcule_le TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (depart, arrivee)
    );
  `);
}

const UA = 'Lucie-IIP/1.0 (gestion academique, Institut Ilya Prigogine)';
const norm = a => String(a || '').replace(/\s+/g, ' ').trim().toLowerCase();
let dernier = 0;
async function attendre() {           // une requête par seconde au plus vers Nominatim
  const d = Date.now() - dernier;
  if (d < 1100) await new Promise(r => setTimeout(r, 1100 - d));
  dernier = Date.now();
}
async function json(url, opts = {}) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal, headers: { 'User-Agent': UA, 'Accept-Language': 'fr', ...(opts.headers || {}) } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

/** Les coordonnées d'une adresse ({ lat, lon } ou null). */
export async function geocoder(adresse) {
  const cle = norm(adresse);
  if (!cle) return null;
  const vu = db.prepare('SELECT lat, lon FROM geo_adresse WHERE adresse = ?').get(cle);
  if (vu) return vu.lat == null ? null : vu;
  let pt = null, source = null, repondu = false;
  // L'adresse entière, puis sa forme courte (les deux derniers morceaux : rue et numéro, code postal et commune) —
  // « Campus Erasme, Bât. P, route de Lennik 808, 1070 Bruxelles » ne se trouve qu'ainsi.
  const morceaux = String(adresse).split(',').map(x => x.trim()).filter(Boolean);
  const essais = [...new Set([String(adresse).trim(), morceaux.slice(-2).join(', ')])].filter(Boolean);
  for (const q of essais) {
    if (pt) break;
    try {
      await attendre();
      const j = await json(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`);
      repondu = true;
      if (j?.[0]) { pt = { lat: Number(j[0].lat), lon: Number(j[0].lon) }; source = 'nominatim'; }
    } catch { /* repli */ }
    if (pt) break;
    try {
      const j = await json(`https://photon.komoot.io/api/?limit=1&q=${encodeURIComponent(q)}`);
      repondu = true;
      const c = j?.features?.[0]?.geometry?.coordinates;
      if (c) { pt = { lat: Number(c[1]), lon: Number(c[0]) }; source = 'photon'; }
    } catch { /* rien */ }
  }
  // Une adresse introuvable se garde aussi (lat nulle) quand un service a répondu : on ne la redemande pas à chaque
  // visite. Une panne de réseau, elle, ne se garde pas.
  if (repondu) {
    db.prepare(`INSERT INTO geo_adresse (adresse, lat, lon, source) VALUES (?, ?, ?, ?)
      ON CONFLICT(adresse) DO UPDATE SET lat = excluded.lat, lon = excluded.lon, source = excluded.source, trouve_le = datetime('now')`)
      .run(cle, pt?.lat ?? null, pt?.lon ?? null, source);
  }
  return pt;
}

/** Les kilomètres ALLER-RETOUR par la route, arrondis au kilomètre ({ km_ar } ou { km_ar: null, raison }). */
export async function kmAllerRetour(depart, arrivee) {
  const a = norm(depart), b = norm(arrivee);
  if (!a || !b) return { km_ar: null, raison: 'adresse manquante' };
  const vu = db.prepare('SELECT km_aller FROM distance_route WHERE depart = ? AND arrivee = ?').get(a, b);
  if (vu) return { km_ar: Math.round(vu.km_aller * 2) };
  const p1 = await geocoder(depart);
  if (!p1) return { km_ar: null, raison: `adresse de départ introuvable sur la carte (${depart})` };
  const p2 = await geocoder(arrivee);
  if (!p2) return { km_ar: null, raison: `adresse du lieu de stage introuvable sur la carte (${arrivee})` };
  try {
    const j = await json(`https://router.project-osrm.org/route/v1/driving/${p1.lon},${p1.lat};${p2.lon},${p2.lat}?overview=false`);
    const m = j?.routes?.[0]?.distance;
    if (!(m >= 0)) return { km_ar: null, raison: 'itinéraire introuvable' };
    const aller = Math.round(m / 100) / 10;
    db.prepare(`INSERT INTO distance_route (depart, arrivee, km_aller) VALUES (?, ?, ?)
      ON CONFLICT(depart, arrivee) DO UPDATE SET km_aller = excluded.km_aller, calcule_le = datetime('now')`).run(a, b, aller);
    return { km_ar: Math.round(aller * 2) };
  } catch (e) {
    return { km_ar: null, raison: `service d'itinéraire injoignable (${e.message})` };
  }
}

/** Un écart qui mérite d'être vu : plus de 3 km ET plus de 10 % de la distance calculée. */
export const ecartNotable = (tape, calcule) => tape != null && calcule != null
  && Math.abs(tape - calcule) > 3 && Math.abs(tape - calcule) > 0.1 * calcule;
