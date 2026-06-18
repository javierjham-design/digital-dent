# Dockerfile del sitio WEB (landing + campañas). No depende de ../shared, así que
# el contexto puede ser raíz del repo o web/. En Railway: Root Directory = raíz del
# repo y Dockerfile Path = web/Dockerfile. Las VITE_* se inyectan en build.
FROM node:20-slim AS build
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web ./
ARG VITE_API_URL
ARG VITE_PLATFORM_DOMAIN
ENV VITE_API_URL=$VITE_API_URL VITE_PLATFORM_DOMAIN=$VITE_PLATFORM_DOMAIN
RUN npm run build

# Runtime: solo sirve dist/ con el server estático.
FROM node:20-slim
WORKDIR /app
COPY --from=build /app/web/dist ./dist
COPY --from=build /app/web/server.mjs ./server.mjs
RUN npm install express@^4
ENV NODE_ENV=production
EXPOSE 4175
CMD ["node", "server.mjs"]
