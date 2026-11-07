// LE SITE DES ÉTUDIANTS SE CONSTRUIT SEUL (3.1.477, le mur) : une entrée (portail.html → src/portail/), une sortie
// (dist-portail), et le serveur de développement renvoie /api vers le portail (3101), jamais vers Lucie.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'path';
import { cpSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
/* LES CAPTURES DU MODE D'EMPLOI (3.5.161) : l'aide de l'espace enseignant est celle de Lucie, et ses images (`/guide/*.png`)
   doivent venir du même site (la politique de sécurité n'admet que 'self'). Copiées à la construction — rien d'autre du
   dossier public du personnel ne passe. */
const copierGuide = () => ({ name: 'copier-guide', closeBundle() {
  const src = resolve(__dirname, 'public/guide');
  if (existsSync(src)) cpSync(src, resolve(__dirname, 'dist-portail/guide'), { recursive: true });
  // Et pdf.js (3.5.162) : un PDF joint à un message se dessine page par page, comme dans Lucie — sans lui, la case restait blanche.
  const pdf = resolve(__dirname, 'public/vendor');
  if (existsSync(pdf)) cpSync(pdf, resolve(__dirname, 'dist-portail/vendor'), { recursive: true });
} });
export default defineConfig({
  plugins: [react(), copierGuide()],
  server: { port: 5174, proxy: {
    '/api/portail': { target: process.env.VITE_PORTAIL_URL || 'http://localhost:3101', changeOrigin: true },
    '/api/enseignant': { target: process.env.VITE_PORTAIL_URL || 'http://localhost:3101', changeOrigin: true } } },
  // Pas le dossier public/ du personnel (le guide « Quoi de neuf » y a vécu) : rien ne passe le mur par là.
  // Ses propres fichiers publics (icônes, manifestes de l'écran d'accueil, 3.5.090) — jamais ceux du personnel.
  publicDir: 'public-portail',
  build: { outDir: 'dist-portail', sourcemap: false, // Deux entrées, un seul site derrière le mur : les étudiants (portail.html) et les enseignants (enseignants.html, 3.5.076).
  rollupOptions: { input: { portail: resolve(__dirname, 'portail.html'), enseignants: resolve(__dirname, 'enseignants.html') } } },
});
