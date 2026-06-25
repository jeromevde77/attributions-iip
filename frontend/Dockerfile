FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . .
ARG BUILD_VERSION=dev
ARG VITE_DEMO_MODE=false
ARG VITE_BUILD_VERSION=${BUILD_VERSION}
ENV BUILD_VERSION=${BUILD_VERSION}
ENV VITE_DEMO_MODE=${VITE_DEMO_MODE}
ENV VITE_BUILD_VERSION=${VITE_BUILD_VERSION}
RUN npm run build

FROM nginx:stable
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
