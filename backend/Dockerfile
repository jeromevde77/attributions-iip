FROM node:20-bookworm-slim
WORKDIR /app

# Chromium pour la génération de PDF côté serveur (Puppeteer, contrats en PDF).
# On installe le Chromium système au lieu de laisser Puppeteer télécharger le sien
# (plus léger, plus rapide à builder).
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-liberation \
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
