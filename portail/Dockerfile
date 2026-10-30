# LE PORTAIL DES ÉTUDIANTS — une image à part, qui ne contient que le dossier portail/ (aucune ligne de Lucie).
FROM node:20-bookworm-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY src ./src
RUN mkdir -p /app/data && chown -R node:node /app/data
# Il ne tourne pas en root : une faille ne donnerait même pas la main sur le conteneur entier.
USER node
ARG BUILD_VERSION=dev
ENV BUILD_VERSION=${BUILD_VERSION} NODE_ENV=production TZ=Europe/Brussels
EXPOSE 3101
CMD ["node", "src/serveur.js"]
