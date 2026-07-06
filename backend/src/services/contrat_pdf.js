/**
 * contrat_pdf.js — Génère le contrat en PDF via Chrome headless (Puppeteer).
 *
 * Le pied de page est injecté nativement par Puppeteer (option footerTemplate
 * de page.pdf()), une fonctionnalité de Chrome DevTools Protocol conçue
 * exactement pour ça : elle est répétée de façon fiable sur CHAQUE page,
 * contrairement aux techniques CSS pures (position:fixed, tfoot) qui dépendent
 * du moteur d'impression du navigateur et peuvent se comporter différemment
 * selon le contexte (impression directe, impression depuis une iframe, etc.).
 */
import puppeteer from 'puppeteer';
import { piedDocument } from '../routes/parametres.js';
import { LOGO_IIP_JPEG } from './assets/logo_iip_jpeg.js';

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
 * @param {string} htmlContrat - HTML complet généré par genererApercu() (contrat_preview.js).
 * @returns {Promise<Buffer>} Buffer PDF.
 */
export async function genererContratPdf(htmlContrat) {
  // On retire le <tfoot> du template : le pied de page est désormais fourni
  // par Puppeteer (footerTemplate) pour garantir sa répétition sur chaque page.
  const htmlSansTfoot = htmlContrat.replace(/<tfoot>[\s\S]*?<\/tfoot>/, '');

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(htmlSansTfoot, { waitUntil: 'networkidle0' });

    const footerTemplate = `
      <div style="width:100%; font-family: Arial, Helvetica, sans-serif; font-size:8px; color:#888; padding:0 60px; box-sizing:border-box;">
        <img src="${LOGO_IIP_JPEG}" style="height:26px; width:auto; display:block; margin-bottom:5px;" />
        <div style="border-top:1px solid #C9A84C; padding-top:6px; text-align:center; line-height:1.4;">${piedDocument()}</div>
      </div>`;

    const pdfData = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', right: '16mm', bottom: '32mm', left: '16mm' },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate,
    });
    // Puppeteer récent renvoie parfois un Uint8Array plutôt qu'un vrai Buffer Node —
    // sans cette conversion explicite, Express peut mal sérialiser le binaire (fichier corrompu).
    return Buffer.from(pdfData);
  } finally {
    await page.close();
  }
}
