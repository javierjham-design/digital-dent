# Session Handoff

> **Leé este archivo PRIMERO al iniciar una sesión.** Resume dónde quedó el trabajo,
> sin depender del historial de chat anterior.

---

## Última actualización

- **Fecha:** 2026-08-03
- **Rama:** `feat/backups` (sale de `arch` con observabilidad ya mergeada). **Sin mergear
  todavía.** Requiere configuración operativa (bucket R2 + env en Railway) antes de servir.
- **Foco de esta sesión:** sistema de backups y restauración quirúrgica por clínica.

## Backups — HECHO en código (2026-08-03, rama `feat/backups`)

Detalle en `docs/BACKUPS.md` y `docs/AI_CHANGELOG.md`. Verde: typecheck backend, unit
87/87 (incl. crypto round-trip, poda con piso, manifiesto). 3 capas: (1) volumen Railway
+ PITR [doc]; (2) dump lógico por base cifrado AES-256-GCM en R2, con manifiesto (sha256 +
censo de filas); (3) restore quirúrgico por clínica (`npm run restore -- --slug X`,
dry-run por defecto, `--switch` para el corte, no destruye — la base vieja se conserva).
Poda GFS con creds separadas; ensayo de restauración semanal; barreras en
`dropTenantDatabase` y `migrate-tenants`; endpoint `POST /admin/backups/run`.

**Falta para cerrarlo (operativo, fuera del repo — pasos en `docs/BACKUPS.md`):**
1. Crear bucket **Cloudflare R2** + **object-lock por prefijo** (7 d diarios / 30 d
   semanales / 180 d mensuales; < retención GFS 14/56/365).
2. Generar `BACKUP_ENCRYPTION_KEY` (guardarla en gestor de secretos aparte) y cargar las
   `BACKUP_S3_*` en Railway. Credenciales de **poda separadas** (`BACKUP_S3_PRUNE_*`).
3. Crear los **servicios cron** en Railway (mismo Dockerfile del backend, distinto start
   command + schedule): `backup` (diario), `backup-prune` (semanal, con `--apply`),
   `backup-drill` (semanal).
4. **Verificar la versión de Postgres** del server (`SELECT version();`) y ajustar
   `postgresql-client-16` en el Dockerfile si es 17+.
5. Activar la **capa 1** en Railway (backups de volumen diarios + PITR).
6. Mergear `feat/backups` → `arch` y pushear (redeploy). El backend arranca aunque los
   backups no estén configurados (el guard de migrate-tenants no bloquea el bootstrap).

## Observabilidad — HECHO y DESPLEGADO (2026-08-03)

`feat/observabilidad` fue **mergeada a `arch` y desplegada** (commit `ea3e536`); se
verificó `api.clariva.cl/health` → 200 con header `X-Request-Id` (deploy nuevo vivo).
Incluye el scrubber de PII extra (querystring fuera de breadcrumbs; mensajes de Prisma
redactados). Detalle en `docs/OBSERVABILIDAD.md`. **Falta operativo:** crear los proyectos
Sentry + cargar `SENTRY_DSN`/`VITE_SENTRY_DSN` en Railway (build-time → redeploy) y
configurar UptimeRobot → `/health`. El código corre con o sin los DSN.

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
