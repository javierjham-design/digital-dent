# Runbook de cutover — Etapa 5

> Migrar producción del **monolito Next.js** (un servicio Railway, raíz del repo)
> al **stack separado**: 3 servicios Railway (web + frontend SPA + backend Express).
>
> ⚠️ **ACTUALIZADO para database-per-tenant (2026-06-20).** El backend nuevo ya
> **NO comparte la base del monolito**: usa una **DB de control-plane** + **una DB
> física por clínica**. Eso cambia dos cosas de este runbook respecto a su versión
> original (que asumía DB compartida):
>
> 1. **Hay migración de datos obligatoria** (paso §2.6, `npm run migrate:data`):
>    copia el contenido de la DB del monolito a la DB de control + las DBs por
>    clínica. No es "la misma DB".
> 2. **El rollback ya no es gratis tras mover tráfico:** apenas las clínicas
>    empiezan a escribir en sus tenant DBs, esos datos NO existen en la DB del
>    monolito. Por eso el switch se hace con **ventana de congelación de escrituras**
>    (§6): migrar con el monolito en solo-lectura, validar, recién ahí abrir el stack
>    nuevo. Rollback limpio solo es posible ANTES de aceptar la primera escritura nueva.
>
> Principio rector: **el monolito sigue sirviendo a las clínicas hasta el switch**.
> Los servicios nuevos se levantan en paralelo y se validan antes de mover tráfico.

---

## 0. Arquitectura objetivo

**3 servicios** en Railway (mismo repo, distinto *root directory*), todos sobre la
misma base de datos. El monolito se puede **retirar por completo** tras el cutover.

```
  clariva.cl / www  →  ┌──────────────────────────┐  WEB / marketing (Railway, root: web/)
  clariva.cl/landing-1 │ Sitio web (Vite/React)    │  landing + landing pages de campaña
                       └────────────┬──────────────┘
                                    │ fetch público: GET /planes, POST /demo
  <slug>.clariva.cl      ┐          │  (demo → redirige a <slug>.clariva.cl/#token=…)
  super-admin.clariva.cl ┘→ ┌───────▼──────────────────┐  Frontend SPA (Railway, root: frontend/)
                            │ App de clínicas (SPA)     │  dominio wildcard *.clariva.cl
                            └─────────────┬─────────────┘
                                  │ fetch https://api.clariva.cl/api/v1 (Bearer JWT)
                    ┌─────────────▼──────────────┐
   api.clariva.cl → │ Backend API (Express+tsx)  │  (Railway, root dir: backend/)
                    └─────────────┬──────────────┘
                                  │ Prisma (control + tenant)
                    ┌─────────────▼──────────────────────────────┐
                    │  PostgreSQL (Railway)                       │
                    │   • clariva_control  (registro/planes/…)    │
                    │   • clariva_t_<slug>  × N  (1 por clínica)   │
                    └─────────────────────────────────────────────┘
```

> **Database-per-tenant:** un solo servidor Postgres, muchas bases. El backend
> resuelve la clínica por subdominio → su `dbName` en el control-plane → abre/cachea
> el `PrismaClient` de esa base. Provisión automática al crear clínica/demo
> (`TENANT_DB_SERVER_URL` necesita permiso `CREATE DATABASE`).

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
- [ ] **Database-per-tenant — definir el destino:**
      - `CONTROL_DATABASE_URL` → base del control-plane (p.ej. `clariva_control` en el
        mismo Postgres). Crearla: `createdb clariva_control` o `CREATE DATABASE`.
      - `TENANT_DB_SERVER_URL` → URL del **servidor** Postgres (la base del path da igual;
        el backend la cambia por el `dbName` de cada clínica). **Requiere permiso
        `CREATE DATABASE`** (provisión automática de clínicas/demos).
      - `LEGACY_DATABASE_URL` → la `DATABASE_URL` del monolito (origen de la migración §2.6).
      - Aplicar el schema al control-plane: `npm --prefix backend run control:push`.

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
   | `CONTROL_DATABASE_URL` | base del control-plane (registro de clínicas, planes, leads, facturación, super-admins). |
   | `TENANT_DB_SERVER_URL` | URL del servidor Postgres para las bases por clínica. **Con permiso `CREATE DATABASE`.** |
   | `DATABASE_URL` | fallback de las dos anteriores si no se setean (no recomendado en prod: déjalas explícitas). |
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
6. **Schema de control-plane:** `npm --prefix backend run control:push` (crea las
   tablas de `CONTROL_DATABASE_URL`). Las bases por clínica se crean en la migración
   (§2.6) o automáticamente al crear clínica/demo. **No** hay un `db push` global
   contra la base del monolito (ya no la usamos).
7. Validar: `GET https://<backend>/health` → `{ ok: true }`.

---

## 2.6 Migración de datos (monolito → control + tenants) — F7

> Paso **obligatorio** del modelo database-per-tenant: copia el contenido de la DB
> del monolito a la DB de control + una DB por clínica. Idempotente y reejecutable.
> Script: `backend/src/scripts/migrate-data.ts` (ver cabecera para detalle del mapeo).

1. Generar el cliente de lectura del monolito (deriva el schema del monolito):
   ```
   npm --prefix backend run prisma:generate:legacy
   ```
2. **Dry-run** (no escribe; reporta conteos por modelo). Con las env del backend
   (`CONTROL_DATABASE_URL`, `TENANT_DB_SERVER_URL`) + `LEGACY_DATABASE_URL` = DB del monolito:
   ```
   npm --prefix backend run migrate:data
   ```
   Revisar que los conteos cuadren con lo esperado (clínicas, pacientes, citas, …).
3. **Aplicar** (provisiona cada base, registra las clínicas en el control-plane y
   vuelca los datos). Hacerlo con el monolito en **solo-lectura** (ventana de §6):
   ```
   npm --prefix backend run migrate:data -- --apply
   ```
4. Mapeo clave (por si hay que auditar): la `Clinica` del monolito se reparte en
   `control.Clinica` (perfil + routing WhatsApp `waEnabled`/`waNumero`) y en la
   `Configuracion` del tenant (perfil + WhatsApp completo + tokens Google); los
   super-admins (`User.isPlatformAdmin`) → `control.PlatformAdmin`.

> Re-correr el script es seguro (provisión idempotente + `createMany skipDuplicates`
> + upserts): solo agrega lo que falte. Pero los datos escritos en los tenants tras
> el switch NO vuelven al monolito (ver rollback §7).

---

## 2.5 Tareas programadas (cron)

El monolito ejecutaba tareas periódicas que hay que **recrear** apuntando al
backend nuevo. Todas se autentican con el header `x-cron-secret: <CRON_SECRET>`.
Usar Railway Cron (un servicio con schedule) o un scheduler externo (cron-job.org,
GitHub Actions) que haga el `POST`:

| Tarea | Endpoint | Frecuencia sugerida |
|-------|----------|---------------------|
| Recordatorios WhatsApp | `POST https://api.clariva.cl/api/v1/whatsapp/recordatorios` | cada 15–30 min |
| Sync Google Calendar | `POST https://api.clariva.cl/api/v1/google/sync` | cada 15 min |
| Limpieza de demos expiradas | `POST https://api.clariva.cl/api/v1/demo/cleanup` | diaria |

Ejemplo de invocación:
```
curl -X POST https://api.clariva.cl/api/v1/whatsapp/recordatorios \
     -H "x-cron-secret: $CRON_SECRET"
```

> Si hoy no usas WhatsApp ni Google, basta con la limpieza de demos. Activa las
> otras cuando habilites esas integraciones.
>
> **Forma lista para usar:** paquete `cron/` (un servicio Railway por job) +
> opción **Docker** por servicio → ver `docs/deploy-extras.md`.

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

## 3.5 Servicio WEB (landing + campañas)

1. Railway → **New Service → GitHub repo** (mismo repo). Root Directory = `dental-platform/web`.
2. Build/Start: cubiertos por `web/railway.json` (NIXPACKS, `npm start` → `server.mjs`,
   healthcheck `/`). Igual que el frontend: **no setear `NODE_ENV=production`** (el build
   usa devDependencies; `express` está en `dependencies`).
3. **Variables** (build-time):
   | Variable | Valor |
   |----------|-------|
   | `VITE_API_URL` | `https://api.clariva.cl/api/v1` (precios públicos + crear demo) |
   | `VITE_PLATFORM_DOMAIN` | `clariva.cl` (enlaces a `app.` y a `<slug>.` con handoff de demo) |
4. Networking → **Generate Domain** para validar; luego dominios propios `clariva.cl` + `www`.
5. Landing pages de campaña: se publican en `clariva.cl/<slug>` agregando entradas a
   `web/src/landings/registry.ts` (ej. `clariva.cl/landing-1`). No requiere config extra.

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

**Smoke automático** de los 3 servicios (health, planes públicos, 401 sin token,
CORS por subdominio, web y SPA sirviendo): correr tras cada despliegue:
```
API_URL=https://api.clariva.cl WEB_URL=https://clariva.cl \
APP_URL=https://demo.clariva.cl PLATFORM_DOMAIN=clariva.cl \
npm --prefix backend run smoke:deploy
```
(Antes del DNS, usar las URLs `*.up.railway.app`.)

---

## 5. DNS y dominios propios (modelo de subdominios)

Las clínicas entran por `<slug>.clariva.cl` → el frontend nuevo se sirve en un
**dominio wildcard**. El apex y `www` siguen en la landing actual (no se tocan).

1. En Railway, Custom Domains:
   - Backend → `api.clariva.cl`
   - Frontend → `*.clariva.cl` (wildcard) — cubre todas las clínicas y `super-admin`.
   - Web → `clariva.cl` (apex) y `www.clariva.cl`.
2. En el DNS de `clariva.cl` (un registro **exacto gana sobre el wildcard**):
   ```
   @ / clariva.cl  ALIAS/ANAME/A  <target del WEB en Railway>   ← landing (apex)
   www    CNAME   <target del WEB en Railway>      ← landing
   api    CNAME   <target del BACKEND en Railway>  ← exacto, gana sobre *
   *      CNAME   <target del FRONTEND en Railway> ← clínicas + super-admin
   ```
   > El apex (`@`) suele requerir ALIAS/ANAME (o A) según el proveedor de DNS, porque
   > CNAME en el apex no está permitido en DNS clásico. Railway indica el target.
   > Las landing pages de campaña viven en `clariva.cl/landing-1` (mismo servicio web).
3. Esperar propagación + emisión de TLS (Railway lo hace automático; el wildcard
   requiere validación DNS del dominio, que Railway guía).
4. Actualizar:
   - Backend: `PLATFORM_DOMAIN=clariva.cl` (ya permite todos los subdominios por CORS).
   - Frontend: `VITE_API_URL=https://api.clariva.cl/api/v1` y `VITE_PLATFORM_DOMAIN=clariva.cl`, y **rebuild**.
   - Google `GOOGLE_OAUTH_REDIRECT_URI` + Google Cloud Console → `https://api.clariva.cl/api/v1/google/callback`.
5. Smoke sobre dominios definitivos: entrar a `https://<una-clinica>.clariva.cl` (login
   con slug fijado por el subdominio) y a `https://super-admin.clariva.cl` (plataforma).

---

## 6. Switch de tráfico (con ventana de congelación de escrituras)

> Como el stack nuevo usa OTRAS bases (control + tenants), el orden importa:
> migrar con el monolito en solo-lectura para no perder escrituras.

1. **Congelar escrituras** en el monolito (ventana de bajo uso): suspender las
   clínicas o poner el monolito en modo mantenimiento/solo-lectura. A partir de acá
   nadie escribe en la DB del monolito.
2. **Migrar** los datos (§2.6, `migrate:data --apply`). Validar conteos.
3. **Validar** el stack nuevo contra los dominios de prueba (§4) leyendo datos reales
   ya migrados.
4. **Mover los 3 dominios** al stack nuevo: el apex/`www` al **web**, el wildcard
   `*.clariva.cl` al **frontend** (clínicas), y `api` al **backend**. Recién acá se
   aceptan escrituras nuevas (en los tenants).
5. Recomendado: mantener el monolito accesible en un dominio alterno
   (`legacy.clariva.cl`) unos días en solo-lectura por si hay que consultar.

---

## 7. Rollback (si algo falla)

- **Antes de aceptar escrituras nuevas** (durante la validación del paso §6.3, con el
  monolito aún en solo-lectura): rollback **limpio** = reapuntar el DNS al monolito y
  reactivar sus escrituras. Los tenants quedan como copia descartable; el monolito
  sigue siendo la fuente de verdad. El monolito nunca se tocó (solo se leyó).
- **Después de aceptar escrituras nuevas** (§6.4 ya hecho): las clínicas escribieron
  en sus tenant DBs; esos datos **no están** en la DB del monolito. Volver al monolito
  perdería todo lo escrito post-switch. Opciones: (a) arreglar hacia adelante en el
  stack nuevo (preferido), o (b) si es inevitable volver, migrar de vuelta los deltas
  de los tenants al monolito (manual). Por eso la ventana de §6 y validar bien antes.
- Investigar con los logs del backend nuevo (Railway → Deployments → Logs).

---

## 8. Retiro del monolito (solo cuando el nuevo stack esté estable)

> La landing ya está portada al **servicio web** (apex/`www`/campañas), así que el
> monolito **se puede retirar por completo** una vez estable el stack nuevo.

- [ ] Confirmar varios días de operación sin incidencias en los 3 servicios nuevos.
- [ ] El backend ya es **dueño del schema** (database-per-tenant). Los cambios se
      hacen en `backend/prisma/control/schema.prisma` (control-plane) o
      `backend/prisma/tenant/schema.prisma` (clínicas):
      - control: `npm run control:push`.
      - tenants: regenerar `prisma/tenant/init.sql` (`npm run tenant:initsql`) y aplicar
        a TODAS las bases con `npm run migrate:tenants`.
      - Documentar el cambio en `docs/AI_CHANGELOG.md`. (El `prisma:sync` del monolito
        ya no existe; el schema compartido fue retirado.)
- [ ] Pausar/eliminar el servicio del **monolito** en Railway (los 3 dominios ya
      apuntan al stack nuevo). Conservar un backup de su DB por si se necesita auditar.
- [ ] (Opcional) archivar el código del monolito (`app/`, `proxy.ts`, etc.).

---

## Notas y gotchas

- **Mismo `ENCRYPTION_KEY` y `JWT_SECRET`/`NEXTAUTH_SECRET`** entre monolito y
  backend: imprescindible para descifrar secretos guardados y compartir sesiones.
- **No `db push` desde el backend** durante el cutover: la DB ya está en sync.
- **Monorepo paths**: el backend necesita `../shared` y `../prisma` presentes.
- **Frontend build-time env**: `VITE_API_URL` se inyecta al construir; cambiarla
  requiere **rebuild** del servicio frontend.
- **Healthchecks**: backend `/health`, frontend `/` (definidos en sus `railway.json`).
