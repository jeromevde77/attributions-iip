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
import puppeteer from 'puppeteer-core';
import { piedDocument } from '../routes/parametres.js';
import { LOGO_IIP_JPEG } from './assets/logo_iip_jpeg.js';

let browserPromise = null;

function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--no-zygote',
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
      <div style="width:100%; font-size:6pt; color:#888; text-align:center; padding:0 16mm; box-sizing:border-box;">
        <div style="border-top:0.5pt solid #C9A84C; padding-top:2mm; display:inline-block; margin:0 auto;">
          <img src="${LOGO_IIP_JPEG}" style="height:8mm; display:block; margin:0 auto 1.5mm;" />
          <div>${piedDocument()}</div>
        </div>
      </div>`;

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', right: '16mm', bottom: '26mm', left: '16mm' },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate,
    });
    return pdf;
  } finally {
    await page.close();
  }
}
