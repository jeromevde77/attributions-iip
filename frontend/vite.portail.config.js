// LE SITE DES ÉTUDIANTS SE CONSTRUIT SEUL (3.1.477, le mur) : une entrée (portail.html → src/portail/), une sortie
// (dist-portail), et le serveur de développement renvoie /api vers le portail (3101), jamais vers Lucie.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  plugins: [react()],
  server: { port: 5174, proxy: { '/api/portail': { target: process.env.VITE_PORTAIL_URL || 'http://localhost:3101', changeOrigin: true } } },
  // Pas le dossier public/ du personnel (le guide « Quoi de neuf » y a vécu) : rien ne passe le mur par là.
  publicDir: false,
  build: { outDir: 'dist-portail', sourcemap: false, rollupOptions: { input: resolve(__dirname, 'portail.html') } },
});
