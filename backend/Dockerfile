FROM node:20-bookworm-slim
WORKDIR /app

# Bibliothèques système requises pour que Chromium (téléchargé par Puppeteer à l'installation
# des dépendances npm) puisse démarrer en mode headless dans le conteneur — le paquet Debian
# "chromium" lui-même s'est révélé incompatible avec le noyau de ce NAS (crash SIGTRAP au
# démarrage), on utilise donc le binaire propre à Puppeteer, plus portable, mais il a besoin
# des mêmes bibliothèques partagées que n'importe quel Chromium (liste standard Puppeteer).
RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-liberation \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
    libpangocairo-1.0-0 libpango-1.0-0 libcairo2 libgtk-3-0 libx11-xcb1 \
    libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .
RUN mkdir -p /app/data
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
CMD ["node", "src/server.js"]
