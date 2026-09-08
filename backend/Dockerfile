FROM node:20-bookworm-slim
WORKDIR /app

# poppler-utils fournit pdftotext : les dossiers pédagogiques publiés par la
# Fédération circulent en PDF, et c'est par lui qu'on en extrait le texte.
#
# Bibliothèques système requises pour que Chromium (téléchargé par Puppeteer à l'installation
# des dépendances npm) puisse démarrer en mode headless dans le conteneur — le paquet Debian
# "chromium" lui-même s'est révélé incompatible avec le noyau de ce NAS (crash SIGTRAP au
# démarrage), on utilise donc le binaire propre à Puppeteer, plus portable, mais il a besoin
# des mêmes bibliothèques partagées que n'importe quel Chromium (liste standard Puppeteer).
#
# LES POLICES, ET CE QUI LES RÉSOUT. « fonts-liberation » ne suffit pas : sans
# fontconfig, Chromium ne sait pas qu'Arial se substitue par Liberation Sans —
# il retombe sur une police par défaut qu'il étire pour approcher les largeurs
# demandées. C'est ce qui donnait ce texte élargi dans les PDF exportés.
RUN apt-get update && apt-get install -y --no-install-recommends \
    fontconfig fonts-liberation fonts-dejavu-core \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
    libpangocairo-1.0-0 libpango-1.0-0 libcairo2 libgtk-3-0 libx11-xcb1 \
    libxshmfence1 \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .
RUN mkdir -p /app/data
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
CMD ["node", "src/server.js"]
