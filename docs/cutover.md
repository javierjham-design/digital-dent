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
  clariva.cl / www  →  LANDING promocional (se mantiene como está hoy; NO la sirve
                       el frontend nuevo). El apex no lo toca el cutover.

  <slug>.clariva.cl      ┐
  super-admin.clariva.cl ┘→ ┌──────────────────────────┐   (Railway, root dir: frontend/)
                            │ Frontend SPA (Vite/React) │   dominio wildcard *.clariva.cl
                            │  sirve dist/ vía server.mjs│
                            └─────────────┬──────────────┘
                                  │ fetch https://api.clariva.cl/api/v1 (Bearer JWT)
                    ┌─────────────▼──────────────┐
   api.clariva.cl → │ Backend API (Express+tsx)  │  (Railway, root dir: backend/)
                    └─────────────┬──────────────┘
                                  │ Prisma
                    ┌─────────────▼──────────────┐
                    │  PostgreSQL (Railway)       │  ← la MISMA que usa el monolito
                    └────────────────────────────┘
```

- **Tenancy por SUBDOMINIO, igual que el monolito**: `<slug>.clariva.cl` es la
  clínica `<slug>`; `super-admin.clariva.cl` es la plataforma; `clariva.cl`/`www`
  es la landing. La SPA deriva el slug del subdominio (`VITE_PLATFORM_DOMAIN`) y lo
  fija en el login. El `clinicaId` real sigue viajando en el **JWT** (no se tocó la
  lógica de tenancy).
- Token en `localStorage` (no cookies) → como `localStorage` es **por-origen**, cada
  subdominio aísla su sesión automáticamente (igual que el monolito por cookie de
  subdominio). CORS cross-origin funciona sin problemas de SameSite.
- Subdominios reservados (no-clínica), idénticos al monolito: `super-admin, www,
  admin, api, app, mail`.

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
   | `PLATFORM_DOMAIN` | `clariva.cl` → CORS permite el apex y **todos** los subdominios (cada clínica es un origin distinto) |
   | `CORS_ORIGINS` | orígenes extra puntuales; durante la validación, la `*.up.railway.app` del frontend |
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
   | `VITE_PLATFORM_DOMAIN` | `clariva.cl` → la SPA deriva la clínica del subdominio. (Vacío en la `*.up.railway.app`: cae a modo manual y se escribe el slug.) |
5. Networking → **Generate Domain** (`…-frontend.up.railway.app`).
6. Para validar antes del DNS: en el **backend**, agregar la `*.up.railway.app` del
   frontend a `CORS_ORIGINS` (en el preview no aplica `PLATFORM_DOMAIN`). Redeploy.

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

## 5. DNS y dominios propios (modelo de subdominios)

Las clínicas entran por `<slug>.clariva.cl` → el frontend nuevo se sirve en un
**dominio wildcard**. El apex y `www` siguen en la landing actual (no se tocan).

1. En Railway, Custom Domains:
   - Backend → `api.clariva.cl`
   - Frontend → `*.clariva.cl` (wildcard) — cubre todas las clínicas y `super-admin`.
2. En el DNS de `clariva.cl` (un registro **exacto gana sobre el wildcard**):
   ```
   *      CNAME   <target del FRONTEND en Railway>     ← todas las clínicas + super-admin
   api    CNAME   <target del BACKEND en Railway>      ← exacto, gana sobre *
   www    (sin cambios)                                ← landing actual
   @ / clariva.cl  (sin cambios)                       ← landing actual (apex)
   ```
   > Verificar que el registro de `www` y del apex **siguen apuntando a la landing**
   > actual (no al wildcard). El wildcard `*` no afecta al apex; `www` se mantiene por
   > su registro propio.
3. Esperar propagación + emisión de TLS (Railway lo hace automático; el wildcard
   requiere validación DNS del dominio, que Railway guía).
4. Actualizar:
   - Backend: `PLATFORM_DOMAIN=clariva.cl` (ya permite todos los subdominios por CORS).
   - Frontend: `VITE_API_URL=https://api.clariva.cl/api/v1` y `VITE_PLATFORM_DOMAIN=clariva.cl`, y **rebuild**.
   - Google `GOOGLE_OAUTH_REDIRECT_URI` + Google Cloud Console → `https://api.clariva.cl/api/v1/google/callback`.
5. Smoke sobre dominios definitivos: entrar a `https://<una-clinica>.clariva.cl` (login
   con slug fijado por el subdominio) y a `https://super-admin.clariva.cl` (plataforma).

---

## 6. Switch de tráfico

- El cutover real es **mover el wildcard `*.clariva.cl` al frontend nuevo**. A partir
  de ahí, cada `<slug>.clariva.cl` sirve la SPA.
- La **landing** (`clariva.cl` / `www`) **no se mueve**: sigue donde está hoy.
- Recomendado: mantener el monolito accesible en un dominio alterno
  (`legacy.clariva.cl`) unos días por si hay que volver.

---

## 7. Rollback (si algo falla)

1. **Volver el dominio** de las clínicas al servicio del monolito (revertir el
   CNAME / custom domain). El monolito nunca se tocó: sigue operativo.
2. No hay migración de datos que revertir: **ambos stacks usan la misma DB**.
3. Investigar con los logs del backend nuevo (Railway → Deployments → Logs).

---

## 8. Retiro del monolito (solo cuando el nuevo stack esté estable)

> ⚠️ **La landing de `clariva.cl` / `www` vive HOY en el monolito.** Si se retira el
> monolito por completo, se cae la landing. Antes de retirarlo hay que decidir cómo
> preservar la landing (las clínicas YA están servidas por el frontend nuevo):
> - **Opción A (mínimo esfuerzo):** mantener el monolito desplegado **solo** para el
>   apex/`www` (la landing), y dejar el wildcard `*` en el frontend nuevo. El monolito
>   deja de servir clínicas pero sigue sirviendo la página promocional.
> - **Opción B:** portar la landing a un sitio estático aparte y recién ahí apagar el
>   monolito. (Trabajo adicional, fuera de este cutover.)

- [ ] Confirmar varios días de operación sin incidencias en el stack nuevo.
- [ ] Resolver la landing del apex (Opción A u B de arriba).
- [ ] El backend pasa a ser **dueño del schema**: a partir de acá, los cambios de
      schema se hacen en `backend/prisma/schema.prisma` (sincronizado con
      `npm run prisma:sync`) y se aplican con `prisma db push` (mismo flujo que
      tenía el monolito). Documentar el cambio en `docs/AI_CHANGELOG.md`.
- [ ] Apagar el rol de **app de clínica** del monolito (el wildcard ya apunta al
      frontend nuevo). Mantener el monolito solo si sirve la landing (Opción A).
- [ ] (Opcional) archivar el código del monolito una vez resuelta la landing.

---

## Notas y gotchas

- **Mismo `ENCRYPTION_KEY` y `JWT_SECRET`/`NEXTAUTH_SECRET`** entre monolito y
  backend: imprescindible para descifrar secretos guardados y compartir sesiones.
- **No `db push` desde el backend** durante el cutover: la DB ya está en sync.
- **Monorepo paths**: el backend necesita `../shared` y `../prisma` presentes.
- **Frontend build-time env**: `VITE_API_URL` se inyecta al construir; cambiarla
  requiere **rebuild** del servicio frontend.
- **Healthchecks**: backend `/health`, frontend `/` (definidos en sus `railway.json`).
