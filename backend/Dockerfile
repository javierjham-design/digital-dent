# Dockerfile del BACKEND. Contexto de build = raíz del repo (dental-platform/),
# porque el backend importa ../shared. En Railway: Root Directory = raíz del repo
# y Dockerfile Path = backend/Dockerfile.
# Usamos node:20 (full): ya incluye openssl (requerido por los engines de Prisma),
# así evitamos un `apt-get install` que falla intermitentemente en el build de Railway.
FROM node:20
WORKDIR /app

# pg_dump / pg_restore para los backups (capa 2) y el restore (capa 3). NO vienen
# en la imagen node:20. El MAJOR del cliente debe ser >= al del servidor Postgres de
# Railway. Verificado 2026-08-04: el server de Railway es **Postgres 18.3**, así que
# instalamos postgresql-client-18 desde el repo oficial PGDG. Si Railway sube el server
# a 19+, cambiar el major acá (si no, pg_dump falla con "server version mismatch").
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
 && install -d /usr/share/postgresql-common/pgdg \
 && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
 && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update && apt-get install -y --no-install-recommends postgresql-client-18 \
 && rm -rf /var/lib/apt/lists/*

COPY shared ./shared
COPY backend ./backend
WORKDIR /app/backend
RUN npm ci          # postinstall corre `prisma generate`
ENV NODE_ENV=production
EXPOSE 4000
CMD ["npm", "start"]
