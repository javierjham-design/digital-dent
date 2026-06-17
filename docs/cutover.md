# Runbook de cutover — Etapa 5

> Migrar producción del **monolito Next.js** (un servicio Railway, raíz del repo)
> al **stack separado**: 2 servicios Railway (backend Express + frontend SPA),
> compartiendo la MISMA base de datos Postgres.
>
> Principio rector: **el monolito sigue sirviendo a las clínicas hasta el último
> paso**. Los servicios nuevos se levantan en paralelo y se validan antes de
> mover tráfico. Rollback = volver a apuntar el dominio al monolito.

---

## 0. Arquitectura objetivo

```
                    ┌──────────────────────────┐
   app.clariva.cl → │ Frontend SPA (Vite/React) │  (Railway, root dir: frontend/)
                    │  sirve dist/ vía server.mjs│
                    └─────────────┬──────────────┘
                                  │  fetch  https://api.clariva.cl/api/v1  (Bearer JWT)
                    ┌─────────────▼──────────────┐
   api.clariva.cl → │ Backend API (Express+tsx)  │  (Railway, root dir: backend/)
                    └─────────────┬──────────────┘
                                  │ Prisma
                    ┌─────────────▼──────────────┐
                    │  PostgreSQL (Railway)       │  ← la MISMA que usa el monolito
                    └────────────────────────────┘
```

- Tenancy: el `clinicaId` viaja en el **JWT** (no por subdominio). El frontend es
  de **dominio único**; la clínica se elige en el login (campo *código/slug*).
- Token en `localStorage` + header `Authorization` (no cookies) → CORS cross-origin
  funciona sin problemas de SameSite.

> Si más adlante se quiere `clinica.clariva.cl` por clínica, es un wildcard DNS +
> que la SPA lea el subdominio como slug. **Fuera de alcance de este cutover.**

---

## 1. Pre-requisitos (antes de tocar Railway)

- [ ] Rama `arch/split-frontend-backend` mergeada a `master` **o** los servicios
      apuntados a esa rama. (Railway puede desplegar desde una rama no-default.)
- [ ] Tener a mano los secretos del monolito (Railway → servicio actual → Variables):
      `DATABASE_URL`, `NEXTAUTH_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET` y, si se usa
      Google, `GOOGLE_OAUTH_CLIENT_ID/SECRET`.
- [ ] **`ENCRYPTION_KEY` y el secreto JWT deben ser idénticos a los del monolito**
      (si no, no se descifran los tokens de Twilio/Google ya guardados, y las
      sesiones no son compatibles). Reusar `NEXTAUTH_SECRET` como `JWT_SECRET`.

---

## 2. Servicio BACKEND (api)

1. Railway → proyecto actual → **New Service → GitHub repo** (mismo repo `digital-dent`).
2. Settings → **Root Directory** = `dental-platform/backend` (o `backend` según cómo
   esté el repo). Esto hace que Railway construya/arranque dentro de `backend/`.
   - El backend importa `../shared` y `../prisma` → **el repo completo debe estar
     disponible** (Railway clona todo el repo; las carpetas hermanas existen). Si
     Railway aislara el root dir, alternativa: vendorizar `shared` dentro de `backend`.
3. Build/Start: ya cubiertos por `backend/railway.json` (NIXPACKS, `npm start`,
   healthcheck `/health`). `postinstall` corre `prisma generate`.
4. **Variables** (Settings → Variables):
   | Variable | Valor |
   |----------|-------|
   | `DATABASE_URL` | la misma del monolito (o `${{Postgres.DATABASE_URL}}` si está en el mismo proyecto) |
   | `JWT_SECRET` | **el mismo** `NEXTAUTH_SECRET` del monolito |
   | `ENCRYPTION_KEY` | **el mismo** del monolito |
   | `CRON_SECRET` | el mismo del monolito |
   | `CORS_ORIGINS` | URL pública del frontend (se completa en el paso 3; al inicio puede ser la `*.up.railway.app` del frontend) |
   | `JWT_EXPIRES_IN` | `12h` |
   | `GOOGLE_OAUTH_CLIENT_ID/SECRET` | si se usa Google |
   | `GOOGLE_OAUTH_REDIRECT_URI` | `https://<dominio-backend>/api/v1/google/callback` |
   - **No** definir `NODE_ENV=production` en el install si causara poda de
     devDependencies; aquí no afecta porque `tsx` y `prisma` están en
     `dependencies`. (Puede setearse `NODE_ENV=production` sin problema.)
5. Networking → **Generate Domain** (queda `…-backend.up.railway.app`). Más tarde
   se le agrega el dominio propio `api.clariva.cl`.
6. **NO correr `prisma db push` desde el backend.** La DB ya está en sync (la maneja
   el monolito). El backend solo genera el cliente y se conecta.
7. Validar: `GET https://<backend>/health` → `{ ok: true }`.

---

## 3. Servicio FRONTEND (app)

1. Railway → **New Service → GitHub repo** (mismo repo).
2. Settings → **Root Directory** = `dental-platform/frontend`.
3. Build/Start: cubiertos por `frontend/railway.json` (NIXPACKS, `npm start` →
   `server.mjs`). El build (`npm run build`) usa devDependencies (vite, tsc):
   **no setear `NODE_ENV=production`** en este servicio (podaría las build-tools
   y fallaría el build). `express` está en `dependencies` (runtime).
4. **Variables** (build-time, las lee Vite al construir):
   | Variable | Valor |
   |----------|-------|
   | `VITE_API_URL` | `https://<dominio-backend>/api/v1` (la URL pública del backend) |
5. Networking → **Generate Domain** (`…-frontend.up.railway.app`).
6. Volver al **backend** y poner `CORS_ORIGINS` = la URL pública del frontend
   (ambas: la `*.up.railway.app` y, luego, `https://app.clariva.cl`, separadas por coma).
   Redeploy del backend para que tome el cambio.

---

## 4. Validación (con dominios `*.up.railway.app`, antes de DNS)

Recorrer contra el frontend nuevo (`…-frontend.up.railway.app`):
- [ ] Login de clínica (slug + usuario + contraseña) entra a `/agenda`.
- [ ] Login de plataforma (email) entra a `/plataforma`.
- [ ] Agenda carga y permite crear/reagendar una cita.
- [ ] Ficha de un paciente real (datos, KPIs, odontograma).
- [ ] Recibir un pago / abrir-cerrar caja.
- [ ] Descargar un reporte XLSX.
- [ ] Super-admin: dashboard + listado de clínicas.
- [ ] Si se usa Google: actualizar el **Authorized redirect URI** en Google Cloud
      Console a `https://<dominio-backend>/api/v1/google/callback` y probar conectar.

> Checklist completo en `docs/qa-checklist.md`. Idealmente hacer este pase contra
> una **DB de staging**; si es contra producción, en horario de bajo uso (las
> operaciones son las normales, no destructivas).

---

## 5. DNS y dominios propios

1. En Railway, agregar Custom Domains:
   - Backend → `api.clariva.cl`
   - Frontend → `app.clariva.cl` (y/o `clariva.cl`)
2. En el registrador/DNS de `clariva.cl`, crear los **CNAME** que Railway indique:
   ```
   api    CNAME   <target que muestra Railway>
   app    CNAME   <target que muestra Railway>
   ```
3. Esperar propagación + emisión de certificados TLS (Railway lo hace automático).
4. Actualizar:
   - Backend `CORS_ORIGINS` → incluir `https://app.clariva.cl` (y `https://clariva.cl`).
   - Frontend `VITE_API_URL` → `https://api.clariva.cl/api/v1` y **rebuild**.
   - Google `GOOGLE_OAUTH_REDIRECT_URI` + Google Cloud Console → dominio final.
5. Repetir el smoke del paso 4 sobre los dominios definitivos.

---

## 6. Switch de tráfico

- El monolito vive hoy en el dominio de producción actual. El cutover real es
  **apuntar el dominio que usan las clínicas al frontend nuevo**.
- Recomendado: mantener el monolito accesible en un dominio alterno
  (`legacy.clariva.cl`) durante unos días por si hay que volver.

---

## 7. Rollback (si algo falla)

1. **Volver el dominio** de las clínicas al servicio del monolito (revertir el
   CNAME / custom domain). El monolito nunca se tocó: sigue operativo.
2. No hay migración de datos que revertir: **ambos stacks usan la misma DB**.
3. Investigar con los logs del backend nuevo (Railway → Deployments → Logs).

---

## 8. Retiro del monolito (solo cuando el nuevo stack esté estable)

- [ ] Confirmar varios días de operación sin incidencias en el stack nuevo.
- [ ] El backend pasa a ser **dueño del schema**: a partir de acá, los cambios de
      schema se hacen en `backend/prisma/schema.prisma` (sincronizado con
      `npm run prisma:sync`) y se aplican con `prisma db push` (mismo flujo que
      tenía el monolito). Documentar el cambio en `docs/AI_CHANGELOG.md`.
- [ ] Pausar/eliminar el servicio del monolito en Railway.
- [ ] (Opcional) archivar el código del monolito (carpetas `app/`, `proxy.ts`, etc.).

---

## Notas y gotchas

- **Mismo `ENCRYPTION_KEY` y `JWT_SECRET`/`NEXTAUTH_SECRET`** entre monolito y
  backend: imprescindible para descifrar secretos guardados y compartir sesiones.
- **No `db push` desde el backend** durante el cutover: la DB ya está en sync.
- **Monorepo paths**: el backend necesita `../shared` y `../prisma` presentes.
- **Frontend build-time env**: `VITE_API_URL` se inyecta al construir; cambiarla
  requiere **rebuild** del servicio frontend.
- **Healthchecks**: backend `/health`, frontend `/` (definidos en sus `railway.json`).
