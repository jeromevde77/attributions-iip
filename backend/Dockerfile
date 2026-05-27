FROM node:20-bookworm-slim
WORKDIR /app


COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .
RUN mkdir -p /app/data
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
CMD ["node", "src/server.js"]
