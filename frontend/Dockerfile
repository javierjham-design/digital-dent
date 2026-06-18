# Dockerfile del FRONTEND (SPA). Contexto de build = raíz del repo, porque la SPA
# importa ../shared. En Railway: Root Directory = raíz del repo y Dockerfile Path
# = frontend/Dockerfile. Las VITE_* se inyectan en build (build args).
FROM node:20-slim AS build
WORKDIR /app
COPY shared ./shared
COPY frontend ./frontend
WORKDIR /app/frontend
RUN npm ci
ARG VITE_API_URL
ARG VITE_PLATFORM_DOMAIN
ENV VITE_API_URL=$VITE_API_URL VITE_PLATFORM_DOMAIN=$VITE_PLATFORM_DOMAIN
RUN npm run build

# Runtime: solo sirve dist/ con el server estático.
FROM node:20-slim
WORKDIR /app
COPY --from=build /app/frontend/dist ./dist
COPY --from=build /app/frontend/server.mjs ./server.mjs
RUN npm install express@^4
ENV NODE_ENV=production
EXPOSE 4173
CMD ["node", "server.mjs"]
