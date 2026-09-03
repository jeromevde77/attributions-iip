/**
 * pdf.js — Rendu PDF, facultatif.
 *
 * Lucie doit pouvoir tourner sur n'importe quel serveur. Chromium pèse environ
 * 170 Mo et réclame une quinzaine de bibliothèques système ; en faire une
 * dépendance dure interdirait les installations modestes, et le Dockerfile
 * rappelle que le paquet Debian standard plantait sur le noyau de ce NAS.
 *
 * Le rendu PDF est donc une CAPACITÉ : présente, les documents sortent en PDF
 * avec une pagination maîtrisée ; absente, Lucie retombe sur l'impression HTML,
 * qui fonctionne partout sans rien installer.
 */

let etat = null;          // { disponible, raison }
let navigateur = null;    // instance réutilisée
let puppeteer = null;

const ARGS = [
  '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
  '--disable-gpu', '--disable-software-rasterizer', '--no-zygote',
  '--disable-background-networking', '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows', '--disable-breakpad',
  '--disable-component-update', '--disable-default-apps', '--disable-extensions',
  '--disable-ipc-flooding-protection', '--disable-renderer-backgrounding',
  '--disable-sync', '--metrics-recording-only', '--mute-audio', '--no-first-run',
  '--safebrowsing-disable-auto-update', '--password-store=basic',
  '--use-mock-keychain',
];

/**
 * Le module peut être absent : il est en dépendance facultative. Un import
 * statique ferait échouer le démarrage entier de Lucie.
 */
async function chargerPuppeteer() {
  if (puppeteer !== null) return puppeteer;
  try {
    puppeteer = (await import('puppeteer')).default;
  } catch {
    puppeteer = false;
  }
  return puppeteer;
}

async function obtenirNavigateur() {
  if (navigateur) {
    // Un Chromium peut mourir en cours de route ; on ne le découvre qu'ici.
    if (navigateur.connected !== false) return navigateur;
    navigateur = null;
  }
  const p = await chargerPuppeteer();
  if (!p) throw new Error("Le module de rendu PDF n'est pas installé sur ce serveur.");
  // protocolTimeout : c'est LUI qui plafonnait le rendu à 30 s par défaut.
  // Un lot de plusieurs centaines de pages dépasse largement ce délai.
  navigateur = await p.launch({
    headless: true, timeout: 120000, protocolTimeout: 15 * 60 * 1000, args: ARGS,
  });
  navigateur.on('disconnected', () => { navigateur = null; });
  return navigateur;
}

/**
 * Le PDF est-il possible ici ? La réponse est mise en cache : inutile de
 * relancer Chromium à chaque appel, et sur un serveur qui en est dépourvu il
 * ne faut pas payer l'échec à répétition.
 */
export async function capacitePdf() {
  if (etat) return etat;
  const p = await chargerPuppeteer();
  if (!p) {
    etat = { disponible: false, raison: 'module absent' };
    return etat;
  }
  try {
    await obtenirNavigateur();
    etat = { disponible: true, raison: null };
  } catch (e) {
    // Le module est là mais le binaire ne démarre pas : bibliothèques
    // manquantes, noyau incompatible, mémoire insuffisante.
    etat = { disponible: false, raison: String(e.message).slice(0, 160) };
  }
  return etat;
}

/**
 * Rend un document HTML en PDF.
 *
 * @param {string} html      document complet, styles compris
 * @param {object} [options]
 * @param {object} [options.marges]      marges CSS ; par défaut celles de l'enveloppe
 * @param {string} [options.orientation] 'portrait' (défaut) ou 'paysage'
 * @param {string} [options.pagination]  'jamais' (défaut), 'toujours', ou 'si-plusieurs'
 * @returns {Promise<Buffer>}
 */
export async function rendrePdf(html, options = {}) {
  const {
    marges = { top: '12mm', right: '15mm', bottom: '12mm', left: '15mm' },
    orientation = 'portrait',
    pagination = 'jamais',
  } = options;

  const nav = await obtenirNavigateur();
  const page = await nav.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 120000 });

    // Le délai s'adapte au volume : une minute de base, plus une seconde par
    // page estimée. Mieux vaut un rendu long qu'une expiration à mi-course.
    const pagesEstimees = Math.max(1, (html.match(/class="saut"/g) || []).length + 1);
    const delai = Math.min(15 * 60 * 1000, 60000 + pagesEstimees * 1000);

    const commun = {
      timeout: delai,
      format: 'A4',
      landscape: orientation === 'paysage',
      printBackground: true,
      margin: marges,
      // Ce qui supprime le titre, le lieu d'impression et la numérotation que
      // le navigateur ajoute de lui-même à l'impression.
      displayHeaderFooter: false,
    };

    if (pagination === 'jamais') return Buffer.from(await page.pdf(commun));

    // Pour ne numéroter qu'au-delà d'une page, il faut d'abord savoir combien
    // il y en a : on rend une première fois pour compter.
    if (pagination === 'si-plusieurs') {
      const essai = await page.pdf(commun);
      if (compterPages(essai) <= 1) return Buffer.from(essai);
    }

    return Buffer.from(await page.pdf({
      ...commun,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate:
        '<div style="width:100%;font-size:7pt;color:#94a3b8;text-align:center;'
        + 'font-family:Arial,sans-serif;padding-bottom:4mm">'
        + '<span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      margin: { ...marges, bottom: sommeMm(marges.bottom, 6) },
    }));
  } finally {
    await page.close().catch(() => {});
  }
}

/** Compte les pages d'un PDF sans dépendance : le nombre est dans le catalogue. */
function compterPages(buf) {
  const s = Buffer.from(buf).toString('latin1');
  const m = [...s.matchAll(/\/Type\s*\/Page[^s]/g)];
  if (m.length) return m.length;
  const c = /\/Count\s+(\d+)/.exec(s);
  return c ? Number(c[1]) : 1;
}

function sommeMm(valeur, ajout) {
  const n = parseFloat(String(valeur)) || 0;
  return `${n + ajout}mm`;
}

/** Ferme proprement le navigateur — appelé à l'arrêt du serveur. */
export async function fermerPdf() {
  if (navigateur) { await navigateur.close().catch(() => {}); navigateur = null; }
}
