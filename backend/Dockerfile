# Dockerfile del BACKEND. Contexto de build = raíz del repo (dental-platform/),
# porque el backend importa ../shared. En Railway: Root Directory = raíz del repo
# y Dockerfile Path = backend/Dockerfile.
# Usamos node:20 (full): ya incluye openssl (requerido por los engines de Prisma),
# así evitamos un `apt-get install` que falla intermitentemente en el build de Railway.
FROM node:20
WORKDIR /app
COPY shared ./shared
COPY backend ./backend
WORKDIR /app/backend
RUN npm ci          # postinstall corre `prisma generate`
ENV NODE_ENV=production
EXPOSE 4000
CMD ["npm", "start"]
