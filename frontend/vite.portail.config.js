// LE SITE DES ÉTUDIANTS SE CONSTRUIT SEUL (3.1.477, le mur) : une entrée (portail.html → src/portail/), une sortie
// (dist-portail), et le serveur de développement renvoie /api vers le portail (3101), jamais vers Lucie.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  plugins: [react()],
  server: { port: 5174, proxy: {
    '/api/portail': { target: process.env.VITE_PORTAIL_URL || 'http://localhost:3101', changeOrigin: true },
    '/api/enseignant': { target: process.env.VITE_PORTAIL_URL || 'http://localhost:3101', changeOrigin: true } } },
  // Pas le dossier public/ du personnel (le guide « Quoi de neuf » y a vécu) : rien ne passe le mur par là.
  publicDir: false,
  build: { outDir: 'dist-portail', sourcemap: false, // Deux entrées, un seul site derrière le mur : les étudiants (portail.html) et les enseignants (enseignants.html, 3.5.076).
  rollupOptions: { input: { portail: resolve(__dirname, 'portail.html'), enseignants: resolve(__dirname, 'enseignants.html') } } },
});
