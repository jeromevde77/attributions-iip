FROM node:20-bookworm-slim
WORKDIR /app

# Chromium pour la génération de PDF côté serveur (Puppeteer, contrats en PDF).
# On installe le Chromium système au lieu de laisser Puppeteer télécharger le sien
# (plus léger, plus rapide à builder), plus les bibliothèques système requises
# pour qu'il puisse effectivement démarrer en mode headless dans le conteneur
# (liste standard documentée par Puppeteer pour Debian/Ubuntu).
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium fonts-liberation \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
    libpangocairo-1.0-0 libpango-1.0-0 libcairo2 libgtk-3-0 libx11-xcb1 \
    libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .
RUN mkdir -p /app/data
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
CMD ["node", "src/server.js"]
