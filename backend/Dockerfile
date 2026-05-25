FROM node:20-bookworm-slim
WORKDIR /app

# LibreOffice (headless) + polices, pour convertir les documents Word en PDF
# fidèles au gabarit officiel FWB. libreoffice-writer suffit (pas toute la suite).
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-writer-nogui \
      fonts-liberation fonts-dejavu \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .
RUN mkdir -p /app/data
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
CMD ["node", "src/server.js"]
