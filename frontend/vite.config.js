import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const buildDate = new Date().toISOString();

// Lire le numéro de version depuis le fichier VERSION à la racine du repo
let appVersion = 'dev';
try {
  appVersion = readFileSync(resolve(__dirname, '../VERSION'), 'utf8').trim();
} catch {
  try { appVersion = readFileSync(resolve(__dirname, 'VERSION'), 'utf8').trim(); } catch {}
}
const buildVersion = process.env.BUILD_VERSION || `${appVersion}+dev`;

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_DATE__: JSON.stringify(buildDate),
    __BUILD_VERSION__: JSON.stringify(buildVersion),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
});
