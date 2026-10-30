// ─────────────────────────────────────────────────────────────────────────────
// DEPUIS LA BELGIQUE, ET PAS PAR UN VPN (Charles, 30 octobre 2026 : « peut-on interdire un accès en dehors de la
// Belgique ? et même VPN ? » ; tranché : bloquer, exception accordée par le secrétariat pour une période).
//
// Deux listes d'adresses, posées sur disque par `scripts/vps/geo-portail.sh` (chaque semaine) :
//   be.cidr  — les blocs d'adresses attribués à la Belgique (IPv4 et IPv6) ;
//   vpn.cidr — les blocs des hébergeurs et des VPN connus.
// Une adresse passe si elle est belge ET absente de la seconde liste. Une liste ne voit pas TOUS les VPN : elle en
// arrête la plupart ; c'est un frein, pas une preuve. Le roaming passe (l'adresse reste celle de l'opérateur belge).
//
// PORTAIL_GEO : « bloquer » (défaut), « constat » (on note, on laisse passer), « non ». Sans liste sur disque, rien
// n'est bloqué — et le journal le dit — : une installation incomplète ne doit pas fermer l'espace à tout le monde.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import net from 'net';
import path from 'path';

const DIR = process.env.PORTAIL_GEO_DIR || '/app/data/geo';
export const MODE = ['bloquer', 'constat', 'non'].includes(process.env.PORTAIL_GEO) ? process.env.PORTAIL_GEO : 'bloquer';

function v6EnBig(ip) {
  let [g, d = ''] = ip.split('::');
  const a = g ? g.split(':') : [], b = ip.includes('::') ? (d ? d.split(':') : []) : [];
  // Une fin en IPv4 (::ffff:1.2.3.4) compte pour deux groupes.
  const fin = (b.length ? b : a);
  const dernier = fin[fin.length - 1] || '';
  if (dernier.includes('.')) {
    const o = dernier.split('.').map(Number);
    fin.splice(fin.length - 1, 1, ((o[0] << 8) | o[1]).toString(16), ((o[2] << 8) | o[3]).toString(16));
  }
  const groupes = ip.includes('::') ? [...a, ...Array(8 - a.length - b.length).fill('0'), ...b] : a;
  return groupes.reduce((n, x) => (n << 16n) + BigInt(parseInt(x || '0', 16)), 0n);
}
const v4EnBig = ip => ip.split('.').reduce((n, x) => (n << 8n) + BigInt(Number(x)), 0n);

/** Une adresse en { v6, n } ; une IPv4 « mappée » (::ffff:a.b.c.d) redevient IPv4. */
export function lireIp(ip) {
  const s = String(ip || '').trim().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  const m = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (m) return { v6: false, n: v4EnBig(m[1]) };
  if (net.isIPv4(s)) return { v6: false, n: v4EnBig(s) };
  if (net.isIPv6(s)) return { v6: true, n: v6EnBig(s) };
  return null;
}

function lireBloc(ligne) {
  const [ip, l] = ligne.trim().split('/');
  const a = lireIp(ip);
  if (!a) return null;
  const bits = a.v6 ? 128 : 32, len = l === undefined ? bits : Number(l);
  if (!(len >= 0 && len <= bits)) return null;
  const masque = ((1n << BigInt(bits - len)) - 1n);
  return { v6: a.v6, debut: a.n & ~masque, fin: (a.n & ~masque) | masque };
}

function charger(fichier) {
  const p = path.join(DIR, fichier);
  let st; try { st = fs.statSync(p); } catch { return null; }
  const blocs = { v4: [], v6: [] };
  for (const ligne of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    if (!ligne.trim() || ligne.trim().startsWith('#')) continue;
    const b = lireBloc(ligne);
    if (b) blocs[b.v6 ? 'v6' : 'v4'].push(b);
  }
  for (const k of ['v4', 'v6']) blocs[k].sort((x, y) => (x.debut < y.debut ? -1 : x.debut > y.debut ? 1 : 0));
  return { mtime: st.mtimeMs, blocs, n: blocs.v4.length + blocs.v6.length };
}

function contient(liste, a) {
  if (!liste) return false;
  const l = liste.blocs[a.v6 ? 'v6' : 'v4'];
  let g = 0, d = l.length - 1, r = -1;
  while (g <= d) { const m = (g + d) >> 1; if (l[m].debut <= a.n) { r = m; g = m + 1; } else d = m - 1; }
  // Des blocs peuvent se chevaucher : on regarde quelques voisins en arrière.
  for (let i = r; i >= 0 && i > r - 64; i--) if (l[i].fin >= a.n) return true;
  return false;
}

const PRIVES = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '127.0.0.0/8', '169.254.0.0/16', '100.64.0.0/10', '::1/128', 'fc00::/7', 'fe80::/10']
  .map(lireBloc);
const prive = a => PRIVES.some(b => b.v6 === a.v6 && a.n >= b.debut && a.n <= b.fin);

let listes = { be: null, vpn: null }, lu = 0, averti = false;
function aJour() {
  if (Date.now() - lu < 60_000) return;
  lu = Date.now();
  for (const [k, f] of [['be', 'be.cidr'], ['vpn', 'vpn.cidr']]) {
    let mt = null; try { mt = fs.statSync(path.join(DIR, f)).mtimeMs; } catch { /* absent */ }
    if (mt === null) listes[k] = null;
    else if (!listes[k] || listes[k].mtime !== mt) listes[k] = charger(f);
  }
  if (!listes.be && MODE !== 'non' && !averti) {
    averti = true;
    console.error(`[portail] AUCUNE LISTE D'ADRESSES BELGES dans ${DIR} : l'accès n'est PAS limité à la Belgique (scripts/vps/geo-portail.sh).`);
  }
}

/** « local », « belgique », « vpn », « etranger », ou « sans-liste » (rien sur disque). */
export function provenance(ip) {
  const a = lireIp(ip);
  if (!a) return 'etranger';
  if (prive(a)) return 'local';
  aJour();
  if (!listes.be) return 'sans-liste';
  if (contient(listes.vpn, a)) return 'vpn';
  return contient(listes.be, a) ? 'belgique' : 'etranger';
}

/** Laisse-t-on passer ? `exception` : l'étudiant a une ouverture en cours (stage, Erasmus). */
export function autorise(ip, exception = false) {
  if (MODE === 'non' || exception) return true;
  const p = provenance(ip);
  if (p === 'local' || p === 'belgique' || p === 'sans-liste') return true;
  if (MODE === 'constat') { console.log(`[portail] accès ${p} (${ip}) : noté, laissé passer (PORTAIL_GEO=constat).`); return true; }
  return false;
}

export const etatGeo = () => { aJour(); return { mode: MODE, belgique: listes.be?.n || 0, vpn: listes.vpn?.n || 0 }; };
