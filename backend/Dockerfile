# Dockerfile del BACKEND. Contexto de build = raíz del repo (dental-platform/),
# porque el backend importa ../shared. En Railway: Root Directory = raíz del repo
# y Dockerfile Path = backend/Dockerfile.
FROM node:20-slim
# openssl: requerido por los engines de Prisma.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY shared ./shared
COPY backend ./backend
WORKDIR /app/backend
RUN npm ci          # postinstall corre `prisma generate`
ENV NODE_ENV=production
EXPOSE 4000
CMD ["npm", "start"]
