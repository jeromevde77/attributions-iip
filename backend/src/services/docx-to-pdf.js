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
 * Convertit un buffer .docx en buffer PDF via LibreOffice headless.
 * @param {Buffer} docxBuffer
 * @returns {Promise<Buffer>}
 */
export async function docxToPdf(docxBuffer) {
  const bin = await findSoffice();
  // Dossier temporaire pour les fichiers (docx d'entrée / pdf de sortie)
  const dir = await mkdtemp(join(tmpdir(), 'ea12pdf-'));
  const docxPath = join(dir, 'document.docx');
  const pdfPath = join(dir, 'document.pdf');
  // Profil isolé par conversion (évite les verrous en cas d'appels concurrents).
  const profileDir = join(dir, 'lo-profile');

  try {
    await writeFile(docxPath, docxBuffer);
    let stderr = '';
    try {
      const r = await execFileAsync(bin, [
        '--headless', '--norestore', '--nolockcheck', '--nodefault', '--nologo',
        `-env:UserInstallation=file://${profileDir}`,
        '--convert-to', 'pdf:writer_pdf_Export',
        '--outdir', dir,
        docxPath,
      ], { timeout: 120000, maxBuffer: 10 * 1024 * 1024 });
      stderr = r.stderr || '';
    } catch (e) {
      throw new Error(`LibreOffice a échoué : ${e.message}${e.stderr ? ' | ' + e.stderr : ''}`);
    }

    // Vérifier que le PDF a bien été produit
    let pdf;
    try {
      pdf = await readFile(pdfPath);
    } catch {
      throw new Error(`LibreOffice n'a pas produit de PDF (sortie : ${stderr || 'aucune'})`);
    }
    if (!pdf || pdf.length === 0) throw new Error('PDF vide produit par LibreOffice');
    return pdf;
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
