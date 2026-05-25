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
export async function docxToPdf(docxBuffer) {
  const bin = await findSoffice();
  // Dossier temporaire isolé (profil utilisateur LibreOffice + fichiers)
  const dir = await mkdtemp(join(tmpdir(), 'ea12pdf-'));
  const docxPath = join(dir, 'document.docx');
  const pdfPath = join(dir, 'document.pdf');
  const profileDir = join(dir, 'lo-profile');

  try {
    await writeFile(docxPath, docxBuffer);
    // Conversion headless. -env:UserInstallation isole le profil (nécessaire
    // pour exécutions concurrentes et conteneur sans HOME inscriptible).
    await execFileAsync(bin, [
      '--headless',
      '--norestore',
      '--nolockcheck',
      `-env:UserInstallation=file://${profileDir}`,
      '--convert-to', 'pdf:writer_pdf_Export',
      '--outdir', dir,
      docxPath,
    ], { timeout: 120000 });

    const pdf = await readFile(pdfPath);
    return pdf;
  } finally {
    // Nettoyage du dossier temporaire (toujours, même en cas d'erreur)
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
