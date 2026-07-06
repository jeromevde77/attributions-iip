/**
 * contrat_pdf.js — Génère le contrat en PDF via Chrome headless (Puppeteer).
 *
 * Le pied de page est le vrai <tfoot> HTML déjà présent dans le document généré
 * par contrat_preview.js (table CSS standard, display:table-footer-group).
 * On laisse le moteur de rendu PDF de Chromium (Page.printToPDF, un vrai moteur
 * de mise en page/pagination) le répéter nativement — plus prévisible que l'option
 * footerTemplate de Puppeteer, qui rend dans un contexte à part avec des soucis
 * d'unités/dimensionnement peu fiables (logo mal dimensionné, chevauchement avec
 * le corps du texte).
 */
import puppeteer from 'puppeteer';

let browserPromise = null;

function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      timeout: 120000, // le NAS peut être lent au premier démarrage de Chromium
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--no-zygote',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-breakpad',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-extensions',
        '--disable-ipc-flooding-protection',
        '--disable-renderer-backgrounding',
        '--disable-sync',
        '--metrics-recording-only',
        '--mute-audio',
        '--no-first-run',
        '--safebrowsing-disable-auto-update',
        '--password-store=basic',
        '--use-mock-keychain',
      ],
    }).catch(err => { browserPromise = null; throw err; });
  }
  return browserPromise;
}

/**
 * @param {string} htmlContrat - HTML complet généré par genererApercu() (contrat_preview.js),
 *   avec son <tfoot> intact (pied de page).
 * @returns {Promise<Buffer>} Buffer PDF.
 */
export async function genererContratPdf(htmlContrat) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(htmlContrat, { waitUntil: 'networkidle0' });

    const pdfData = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', right: '16mm', bottom: '12mm', left: '16mm' },
      displayHeaderFooter: false,
    });
    // Puppeteer récent renvoie parfois un Uint8Array plutôt qu'un vrai Buffer Node —
    // sans cette conversion explicite, Express peut mal sérialiser le binaire (fichier corrompu).
    return Buffer.from(pdfData);
  } finally {
    await page.close();
  }
}
