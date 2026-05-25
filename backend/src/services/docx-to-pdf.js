/**
 * docx-to-pdf.js — Conversion d'un document Word (.docx) en PDF via LibreOffice.
 *
 * Pour les documents officiels FWB (EA12, fiche signalétique…), la FWB exige
 * un PDF rigoureusement fidèle au gabarit. On part donc du .docx généré (qui
 * remplit le gabarit officiel) et on le convertit en PDF avec LibreOffice
 * headless — aucune redessine, fidélité parfaite.
 *
 * Prérequis : LibreOffice installé dans le conteneur (voir backend/Dockerfile).
 */
import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const execFileAsync = promisify(execFile);

// Binaire LibreOffice : 'soffice' en général ; fallback 'libreoffice'
const SOFFICE_CANDIDATES = ['soffice', 'libreoffice'];

let sofficeBin = null;
async function findSoffice() {
  if (sofficeBin) return sofficeBin;
  for (const bin of SOFFICE_CANDIDATES) {
    try {
      await execFileAsync(bin, ['--version'], { timeout: 15000 });
      sofficeBin = bin;
      return bin;
    } catch { /* essai suivant */ }
  }
  throw new Error("LibreOffice introuvable dans le conteneur (soffice/libreoffice). Vérifiez le Dockerfile.");
}

/**
 * Convertit un buffer .docx en buffer PDF.
 * @param {Buffer} docxBuffer - le document Word généré
 * @returns {Promise<Buffer>} le PDF
 */
// Profil LibreOffice PERSISTANT réutilisé entre les conversions.
// Le coût élevé de LibreOffice est l'initialisation du profil ; en le
// réutilisant, seule la 1re conversion est lente, les suivantes sont rapides.
const PERSIST_PROFILE = join(tmpdir(), 'lo-profile-ea12-persistent');

export async function docxToPdf(docxBuffer) {
  const bin = await findSoffice();
  // Dossier temporaire pour les fichiers (docx d'entrée / pdf de sortie)
  const dir = await mkdtemp(join(tmpdir(), 'ea12pdf-'));
  const docxPath = join(dir, 'document.docx');
  const pdfPath = join(dir, 'document.pdf');

  try {
    await writeFile(docxPath, docxBuffer);
    // Conversion headless. Profil PERSISTANT (réutilisé) = conversions suivantes
    // bien plus rapides. -env:UserInstallation pointe vers le profil partagé.
    await execFileAsync(bin, [
      '--headless',
      '--norestore',
      '--nolockcheck',
      '--nodefault',
      '--nologo',
      `-env:UserInstallation=file://${PERSIST_PROFILE}`,
      '--convert-to', 'pdf:writer_pdf_Export',
      '--outdir', dir,
      docxPath,
    ], { timeout: 120000 });

    const pdf = await readFile(pdfPath);
    return pdf;
  } finally {
    // Nettoyage du dossier de travail (PAS le profil persistant)
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
