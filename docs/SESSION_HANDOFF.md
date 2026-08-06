# Session Handoff

> **Leé este archivo PRIMERO al iniciar una sesión.** Resume dónde quedó el trabajo,
> sin depender del historial de chat anterior.

---

## Última actualización

- **Fecha:** 2026-08-06
- **Defensa en profundidad de cajas + provisión (DESPLEGADO 2026-08-06).** Dos tareas, commits
  separados en `arch`:
  - **`@unique` en `Caja.numero` y `SesionCaja.numero`**: red del correlativo (ya era race-safe por
    advisory lock, pero un duplicado por otro camino pasaba en silencio). Se **conserva `@default(0)`**
    (inerte; ver comentario en el schema): quitarlo obligaría a `db push --accept-data-loss` (regla 1).
    El `@unique` sobre columna poblada **no pasa por migrate-tenants** (Prisma lo marca data-loss), así
    que se aplicó con **`CREATE UNIQUE INDEX` directo** (todo-o-nada, pre-chequeo + rollback,
    `src/scripts/aplicar-caja-unique.ts`) a las 3 bases, con backup fresco antes. init.sql regenerado.
  - **Self-check en `provisionTenant()`**: tras el DDL verifica que la base tenga todas las columnas
    del schema (DMMF vs `information_schema`); si falta algo o el DDL falló, **borra la base y aborta**
    (Sentry con `db=<dbName>`). Demo/alta muestran **503 limpio**, no un 500 crudo. Cubre el "DDL a
    medias" (la demo con 491 de 588 columnas).
  - **Validado end-to-end**: prestart `migrate:tenants` **3/3 OK**, `/health` 200, **demo real creada
    desde la landing** → su base nació con **ambos índices** + self-check 0 faltantes + navegable (5
    pacientes por la API); demo **borrada** por el flujo real de `/demo/cleanup` (registro + base
    físicos eliminados). Scripts útiles quedaron: `src/scripts/caja-numeros.ts` (reporte/backfill),
    `aplicar-caja-unique.ts` (migración del índice).

- **Fecha previa:** 2026-08-05
- **Rama:** `arch/split-frontend-backend` (**mergeado y desplegado** a prod). **`master`
  quedó al día**: fast-forward `arch` → `master` (era ancestro limpio, 341 commits detrás),
  pusheado. Ojo: eso **activa los workflows de GitHub Actions** que dormían en master.
- **Foco del día:** **2FA TOTP obligatorio para super-admin** (schema de CONTROL). Login en
  dos pasos: la contraseña emite un **desafío** (JWT `stage:2fa`, TTL 10m) en vez de sesión;
  la sesión sale de `/auth/2fa/verify`. Alta = QR una sola vez + 10 códigos de respaldo de un
  solo uso (bcrypt). Secreto TOTP **cifrado AES-256-GCM**. Rate limit propio (5/15m por sub e
  IP, solo fallos). **El login de las clínicas NO se tocó.** Deploy verificado: `/auth/2fa/setup`
  responde 400 (existe) y `/health` OK → el `control:push` del prestart aplicó las columnas.
  Ver `docs/SECURITY.md` §7 (incl. **recuperación** si se pierden authenticator + todos los códigos).

  ⚠️ **Acción para el super-admin en el primer login tras este deploy:** la primera vez cae en
  el flujo de **alta** → hay que escanear el QR con Google Authenticator/Authy y **guardar los
  10 códigos de respaldo** (se muestran una sola vez). Sin eso, recuperar el acceso implica tocar
  la base de control a mano (SECURITY.md §incidentes).

- **Crons consolidados en Railway (2026-08-05).** El merge a master activó
  `.github/workflows/clariva-cron.yml`, que duplicaba el `sync` y disparaba el `cleanup`.
  Se **retiró el workflow** (ya no hay ninguno en `.github/workflows/`). Antes de borrarlo se
  verificó Railway: `sync` estaba (`cron-google-sync`) pero **`cleanup` no tenía servicio** →
  se creó **`cron-demo-cleanup`** (JOB=cleanup, `0 6 * * *`, rootDir=cron, branch arch,
  `CRON_SECRET=${{BACKEND.CRON_SECRET}}`). Build SUCCESS y **disparo verificado** (corrida de
  prueba forzada + secreto resuelto = al del BACKEND). **Los 5 crons viven en Railway**
  (`cron-google-sync`, `cron-demo-cleanup`, `backup`, `backup-drill`, `backup-prune`); ver
  `docs/deploy-extras.md` §C. **No revivir el workflow.** Estado de demos: 0 expiradas, 0 bases
  huérfanas (censo corrido). Script de un solo uso `backend/limpieza-duplicados-google.mjs`
  borrado (ya se había corrido).

  _Historial previo (2026-08-04) más abajo: resiliencia (backups 3 capas + Sentry + UptimeRobot),
  Google Calendar reparado, correlativos seguros, LRU de clientes, init.sql resync, ESLint 9._

## Backups — CÓDIGO DESPLEGADO + PRIMER BACKUP REAL OK (2026-08-04)

Detalle en `docs/BACKUPS.md` y `docs/AI_CHANGELOG.md`. Código mergeado a `arch` y en prod.
**Cloudflare R2 configurado** (bucket `clariva-backups`, bucket-lock 7 días, 2 tokens:
daily R&W + prune R&W) y variables `BACKUP_*` cargadas en el servicio `backend`.
**Primer backup manual (`POST /admin/backups/run`) = OK: 4/4 bases, 31,6 MB** (control +
digital-dent 31,4 MB + montenegro + una demo huérfana). pg_dump/pg_restore fijados a
**`postgresql-client-18`** (el server de Railway resultó ser Postgres **18.3**).

**Los 3 servicios cron en Railway — CREADOS Y VALIDADOS EN PROD (2026-08-04):**
- ✅ **`backup`** (diario `0 7 * * *`): `npm run backup`. Corrió `estado=OK` 4/4.
- ✅ **`backup-drill`** (lunes `0 8 * * 1`): `npm run backup:drill`. Restauró control +
   clínica más chica a bases efímeras, verificó el censo y las borró → **el restore está
   PROBADO** de punta a punta dentro de Railway.
- ✅ **`backup-prune`** (domingo `30 8 * * 0`): `npm run backup:prune -- --apply`. Conectó
   con las creds de poda y el **piso mínimo** (minKeep=3) evitó borrar (hay 2 backups/base).

Los tres usan el Dockerfile del backend (`postgresql-client-18`), sin healthcheck, y sus
env son **referencias al backend**: `${{BACKEND.…}}`. ⚠️ **El servicio backend se llama
`BACKEND` en MAYÚSCULAS** — las referencias de Railway son case-sensitive. El `backup-prune`
además tiene 2 secretos propios (`BACKUP_S3_PRUNE_ACCESS_KEY_ID/SECRET`, token de poda).

**Capa 1 (volumen Railway + PITR) — ✅ ACTIVADA (2026-08-04).** Snapshots de volumen
(Daily 6d / Weekly 1mo / Monthly 3mo) + Point-in-Time Recovery encendido. El activar PITR
regeneró credenciales y disparó un redeploy de Postgres (~30s de blip, con clínicas
cerradas); la cobertura quedó verde ~1h después (esperado). Detalle en `docs/BACKUPS.md`.

**Pendientes (menores, no urgentes):**
- ⚠️ **`clariva_t_demo_ul2uzu` NO es una demo huérfana — es la base productiva de
   `orodent`** (clínica real, `esDemo=false`). Se descubrió el 2026-08-04 al derivar los
   dbName reales. **NO marcarla `esDemo=true` ni borrarla**: destruiría una clínica. La
   nota vieja que la llamaba "demo huérfana para limpiar" era incorrecta y peligrosa.
- **`Paciente.numero` y `Caja.numero`**: mismo patrón de carrera que se arregló en cobros;
   aplicarles el helper `siguienteNumero` es directo (ver `docs/AI_CHANGELOG.md` 2026-08-04).

## Google Calendar — REPARADO y OPERATIVO (2026-08-04)

Detalle en `docs/AI_CHANGELOG.md`. Diagnóstico: solo `digital-dent` la usa (2 doctores,
~500 eventos). Se hizo:
- **Cron `sync` recreado** en Railway (`cron-google-sync`, `JOB=sync`, `*/15`,
  `CRON_SECRET=${{BACKEND.CRON_SECRET}}`). El sync corre cada 15 min.
- **Fallas visibles** en push y pull (log + Sentry), **dead-man's switch** por frescura
  (no solo por error) y **aviso a recepción en la agenda**. Endpoint `GET /google/health`.
- **`force full resync`** (`POST /google/sync {full:true}`) como recuperación cuando el
  token incremental queda "ciego" (Google devuelve 0 aunque haya eventos nuevos).
- **Reconcile idempotente**: un full resync ya NO duplica citas (chequea por
  `googleEventId`). Antes sí duplicaba — ver el punto siguiente.
- **App OAuth de Google: pasada a "En producción"** (en Testing los refresh tokens
  caducaban a los 7 días — era la causa de que se cayera sola cada semana). digital-dent
  reconectada → token de larga duración. **Verificación de marca/OAuth ENVIADA, en
  revisión manual** de Google (semanas). Páginas legales creadas y en prod:
  `clariva.cl/privacidad` y `/terminos`.

**Pendientes de Google (no urgentes, la app ya funciona):**
- **Limpiar 11 citas DUPLICADAS en digital-dent** que generó una prueba de full resync
  contra producción (antes del fix idempotente). Script listo y NO ejecutado:
  `backend/limpieza-duplicados-google.mjs` (borra por lista explícita de 11 ids, en
  transacción, sin tocar Google). Hay backup fresco en R2 de red. **Lo corre el usuario.**
- **Decidir scope** `calendar` → `calendar.calendarlist.readonly` antes del video de
  verificación (si Google lo pide). Es 1 línea + deploy.
- Si Google rechaza la home por "no explica el propósito", **prerenderizar** la home
  completa (hoy tiene un bloque estático de respaldo en `web/index.html`).

## Observabilidad — HECHA, DESPLEGADA y ENCENDIDA (2026-08-03 → 2026-08-04)

`feat/observabilidad` fue **mergeada a `arch` y desplegada** (commit `ea3e536`), y el
**2026-08-04 se puso en marcha operativamente**: 3 proyectos Sentry creados (plan
Developer gratis) + DSN cargados en Railway + UptimeRobot activo + fire-drill de PII
pasado. Detalle completo en `docs/OBSERVABILIDAD.md` §0 y en `docs/AI_CHANGELOG.md`
(entrada 2026-08-04).

- **Sentry**: `Clariva Backend`/`Clariva Front End`/`Clariva WEB`. `SENTRY_DSN` en `BACKEND`,
  `VITE_SENTRY_DSN` en `FRONTEND` y `WEB Service` (build-time → van como `ARG` en el
  Dockerfile). `environment=production`.
- **UptimeRobot** (free): `Cláriva API` → `https://api.clariva.cl/health` (HEAD, 5 min, un
  503 alerta a `javier.jham@gmail.com`).
- **Scrubber PII** `redactPII` (RUT/email/monto) en backend+frontend+web + test 5/5.
- ⚠️ **Dos trampas ya resueltas, no repetir:** las `VITE_SENTRY_DSN` necesitan `ARG` en el
  Dockerfile para llegar al build (`cfd5067`); el CSP `connect-src` debe permitir
  `https://*.ingest.us.sentry.io` o el browser bloquea el ingest (`89f50d7`).
- **Del error a la clínica:** tag `clinica` (slug) → base `clariva_t_<slug>`; tag
  `request_id` → buscarlo en los logs de Railway del `BACKEND` para la secuencia completa
  (también viaja en el header `X-Request-Id` y en el cuerpo del 500).
- **Opcional pendiente:** borrar los 3 issues `FIREDRILL` de prueba en Sentry.

---

## Estado: EN PRODUCCIÓN

El stack nuevo está vivo en Railway (proyecto `amused-recreation`), desplegando desde
`arch/split-frontend-backend`, con **dos clínicas reales usándolo a diario**.

- **Backend** → `api.clariva.cl` · **Frontend** (app clínicas) → `*.clariva.cl`
  (subdominio por clínica) · **Web/landing** → `clariva.cl` + `www`. DNS en Cloudflare
  (registros en gris/DNS-only; el wildcard obligatorio gris).
- **Postgres:** un servidor, con `clariva_control` (control-plane) + una base física por
  clínica (`clariva_t_<slug>`). Aislamiento **físico** entre clínicas.
- **Crons:** ver "A verificar" más abajo.

## Qué pasó desde el cutover (2026-06-20 → 2026-07-31)

Seis semanas de trabajo de producto que no estaban registradas en este archivo. El detalle
está en `docs/AI_CHANGELOG.md` (entradas más recientes arriba); en grueso:

CRM con Meta Lead Ads (webhook nativo, identidad por teléfono normalizado, eventos de
ciclo al CAPI, merge de duplicados) · agendamiento online público y reserva de leads ·
consentimientos y documentos clínicos · planes de tratamiento (finalizar/reabrir,
auto-consulta, pestaña Finalizados, evolución con trazabilidad) · pacientes dar de
baja/reactivar y aviso proactivo de RUT duplicado · recaudación (cobro de varios planes en
un pago, abono libre como pie, segundo medio de pago) · gestión de cajas y boxes ·
suscripciones y pagos con Flow · permisos granulares por usuario (el último:
`puedeGestionarAgenda`).

## Limpieza hecha hoy (2026-08-03)

Rama `chore/limpieza-monolito`, tres commits:

1. **`.gitattributes` + renormalización a LF.** Los 41 archivos que aparecían modificados
   eran ruido CRLF/LF, no cambios reales (verificado con `git diff --ignore-cr-at-eol`,
   que daba vacío). El `git status` ahora queda limpio y los cambios verdaderos se ven.
2. **Eliminado el monolito Next.js** (219 archivos, ~42.000 líneas): `app/`, `components/`,
   `lib/`, `prisma/`, `public/`, `proxy.ts`, `next.config.ts`, `postcss.config.mjs`,
   `next-env.d.ts`, `eslint.config.mjs`, `tsconfig.json`, `package.json`,
   `package-lock.json`, `AGENTS.md`. Estaba muerto desde el cutover pero seguía versionado.
   Preservado en el tag **`monolito-final`** (`67b0332`) y en un `.tar.gz` fuera del repo.
   Para recuperar cualquier archivo: `git show monolito-final:<ruta>`.
3. **`CLAUDE.md` reescrito** para el stack real (antes describía el monolito: base
   compartida con `clinicaId`, NextAuth, `prisma/` en la raíz — nada de eso existe hoy).

Verificado antes de borrar: ningún servicio construye desde la raíz (no hay `railway.json`
ahí), el alias `@/` de frontend apunta a su propio `src`, ningún tsconfig del stack nuevo
extiende el de la raíz, el monolito no importaba `shared/`, `scripts/*.mjs` solo usa
builtins de node, y las prestaciones de una clínica nueva salen de
`backend/src/lib/verticales.ts` (no del `seed-aranceles.ts` que se borró).

> **Dato a no perder:** el arancel chileno de 764 prestaciones vivía en
> `prisma/seed-aranceles.ts` y hoy no lo usa nadie. Si alguna vez se quiere sembrar
> clínicas nuevas con el arancel real:
> `git show monolito-final:prisma/seed-aranceles.ts > backend/src/data/aranceles-cl.ts`

### Cierre de la limpieza (2026-08-03) — HECHO ✅

- **Verificación completa en local (todo verde):** `backend typecheck` ✓ · `backend test`
  73/73 ✓ · `backend test:integration` 48/50 (los 2 fallos —consentimientos y conversión
  de lead— son **pre-existentes**; la limpieza no tocó ni un archivo de
  `backend/frontend/web/shared`, verificado con `git diff --stat 67b0332..limpieza -- backend frontend web shared` = vacío) · `frontend typecheck` ✓ · `web typecheck` ✓.
- **Merge:** fast-forward de `chore/limpieza-monolito` → `arch/split-frontend-backend`
  (`67b0332..3788f0c`, 225 archivos, −42.253 líneas) y **pusheado** → redeploy de los 3
  servicios.
- **Verificado en producción tras el deploy:** `api.clariva.cl/health` → 200 ·
  `POST /auth/login` (creds inválidas) → 401 con JSON estructurado (auth vivo) ·
  `app.clariva.cl` → 200 · `clariva.cl` → 200.
- **Artefactos locales borrados:** `_to_delete/` (monolito movido + node_modules viejo +
  locks) y `monolito-final.tar.gz` de la raíz (el código sigue en el tag `monolito-final`
  = `67b0332`). Ambos estaban gitignoreados y sin trackear.

## A verificar (fuera del repo, no lo pude comprobar desde la sesión)

1. **Crons en Railway.** El workflow `.github/workflows/clariva-cron.yml` está solo en
   `arch/split-frontend-backend`, y GitHub dispara `schedule` únicamente desde la rama por
   defecto (`master`, congelada en `528cc54` del 2026-06-15). Por ese camino no corre nada.
   El otro camino son los cron services de Railway (`docs/deploy-extras.md`): `cron/railway.json`
   trae `cronSchedule: "0 6 * * *"`, así que `cleanup` puede estar activo, pero `sync`
   (Google Calendar, cada 15 min) y `recordatorios` necesitan **cada uno su propio servicio**.
   Si `sync` no existe, la agenda no se sincroniza con Google desde el cutover.
2. **Google OAuth:** ¿sigue en modo *Testing*? En ese modo Google caduca los refresh tokens
   a los 7 días y la integración se rompe sola cada semana. Sacarlo tarda 1–6 semanas.
3. **Backups de Postgres en Railway:** qué está activo y con qué retención.

## Prioridades (detalle en `docs/AUDITORIA_2026-08.md`)

1. Verificar los crons de Railway (30 min).
2. **Backups lógicos por clínica + restore probado** — prompt listo para pegar en
   `docs/PROMPT_BACKUPS.md`. Los backups de Railway restauran el volumen entero (a las dos
   clínicas juntas) y retienen 6 días.
3. Sentry + `/health` con `SELECT 1` + UptimeRobot.
4. Aserción defensiva en `dropTenantDatabase`.
5. Correlativo de cobros dentro de la transacción (`cobros.service.ts:185`).
6. LRU en el caché de clientes por tenant (`db/tenant.ts`) — techo a ~30 clínicas.

## Notas

- `docs/PROJECT_STATUS.md` y `docs/PROJECT_CONTEXT.md` son del monolito y están obsoletos;
  no los uses como fuente de verdad. Sirven: este archivo, `docs/AI_CHANGELOG.md`,
  `docs/architecture.md` (con su tabla de etapas ya cerrada) y `docs/AUDITORIA_2026-08.md`.
- Pendiente de fondo: mergear `arch → master` y retirar lo que quede del monolito en
  Railway. Eso activa además los crons de GitHub Actions.
