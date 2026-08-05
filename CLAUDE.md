# Cláriva — Guía de sesión para Claude

> Léeme primero. Soy corta y operativa. Para profundidad: `docs/SESSION_HANDOFF.md`
> (estado actual), `docs/architecture.md` (arquitectura) y `docs/AI_CHANGELOG.md`
> (historial, entradas nuevas arriba).

## 1. Qué es

SaaS multi-tenant de gestión para clínicas y centros (dental / médico / estética).
**En producción, con clínicas reales usándolo a diario.** Cubre agenda, fichas clínicas
con odontograma, planes de tratamiento, presupuestos, cobros y caja, liquidaciones de
profesionales, CRM con Meta Lead Ads, agendamiento online, consentimientos, reportes y
un panel de super-administración con suscripciones y pagos.

Cliente original: Clínica Dental Digital-Dent (Temuco, Chile). Hoy la plataforma es
multi-clínica y multi-rubro.

## 2. Arquitectura

Tres servicios independientes + un paquete compartido, desplegados en **Railway**
(auto-deploy desde GitHub):

| Servicio | Carpeta | Rol | Dominio |
|---|---|---|---|
| **backend** | `backend/` | API REST — toda la lógica de negocio, auth, datos | `api.clariva.cl` |
| **frontend** | `frontend/` | SPA de las clínicas (Vite + React) | `*.clariva.cl` (subdominio por clínica) |
| **web** | `web/` | Landing público + landings de campaña | `clariva.cl` |
| **shared** | `shared/` | DTOs y constantes compartidas (contrato tipado FE↔BE) | — |
| **cron** | `cron/` | Job que hace POST autenticado al backend según `JOB` | — |
| **mcp-server** | `mcp-server/` | Servidor MCP read-only del CRM (API key por clínica) | — |

**El monolito Next.js ya no existe.** Salió de producción en el cutover del 2026-06-20 y
su código se eliminó del árbol el 2026-08-03. Si necesitás consultarlo, está en el tag
`monolito-final` (`git show monolito-final:<ruta>`). No lo revivas.

### Database-per-tenant (esto es lo que más define al sistema)

No hay una base compartida con `clinicaId`. **Cada clínica tiene su propia base física
de Postgres.** Hay dos schemas de Prisma distintos:

- `backend/prisma/control/schema.prisma` → base `clariva_control` (8 modelos): registro
  de clínicas, planes de suscripción, leads, pagos, extras, admins de plataforma,
  auditoría. Cliente singleton en `backend/src/db/control.ts` (`control`).
- `backend/prisma/tenant/schema.prisma` → una base `clariva_t_<slug>` por clínica
  (42 modelos): pacientes, citas, cobros, planes, caja, todo lo clínico. Cliente
  **por request** vía `backend/src/db/tenant.ts` (`tenantClient(dbName)`), cacheado por
  `dbName`.

El aislamiento entre clínicas es **físico**, no un `where clinicaId`. No lo debilites.

## 3. Stack

| Capa | Tecnología |
|---|---|
| Backend | Node 20 + Express 4 + TypeScript 5 + Prisma 5.22 + Postgres |
| Frontend / Web | Vite + React 19 + TypeScript + Tailwind |
| Auth | JWT propio emitido por el backend (`jsonwebtoken`), bcrypt, sesión 12 h |
| Validación | zod 4 (`backend/src/validators/schemas.ts`) |
| Integraciones | Google Calendar (`googleapis`), WhatsApp/Twilio, Meta Lead Ads + CAPI, Flow (pagos) |
| Reportes | `xlsx` |
| Tests | Vitest — unit + integración con SQLite efímero por tenant |
| Hosting | Railway (3 servicios + Postgres + cron services) |

## 4. Convenciones

- **Lógica de negocio en `backend/src/services`.** Los controllers son finos: validan con
  zod, llaman al service, responden. Sin lógica en las rutas.
- **El frontend nunca toca Prisma.** Solo habla con la API vía `frontend/src/services/*`.
- **DTOs en `shared/src/types`.** No se exponen modelos Prisma al frontend.
- **Errores:** los services lanzan `AppError` (`backend/src/lib/errors.ts`:
  `badRequest`, `notFound`, `forbidden`, `conflict`, `tooMany`); el middleware de errores
  los traduce a `{ error }` sin filtrar internals.
- **Protección de rutas** (`backend/src/routes/index.ts`): se componen arrays de
  middlewares — `requireAuth`, `requireTenant`, `requireAdmin`, `requireSuperAdmin`,
  `requirePermiso('campo')`, `requireModulo('codigo')`. Hay combinaciones ya armadas
  (`tenant`, `adminTenant`, `crmTenant`, `agendaTenant`, `configTenant`…). **Reusalas**;
  no inventes una nueva cadena si ya existe la equivalente.
- **Acceso a la base del tenant:** `tenantDb(req)` dentro de un handler. Nunca instancies
  un `PrismaClient` a mano.
- **Dinero:** `Float` en el schema, enteros CLP. UI `$1.234.567` (separador de miles `.`).
  Al calcular porcentajes (comisiones, liquidaciones) **redondeá explícitamente**.
- **Fechas:** helpers en `backend/src/lib/tz.ts`. Chile es UTC−4/−3 según horario de verano.
- **Idioma:** español de Chile en UI, modelos y comentarios. RUT con DV.
- **Comentarios:** mínimos, y que expliquen el *por qué*. El código bien nombrado ya dice qué hace.

## 5. Reglas para no romper producción

1. **`backend/src/scripts/migrate-tenants.ts` NO se toca.** Corre `prisma db push` **sin**
   `--accept-data-loss` a propósito: si un cambio implicara perder datos de una clínica,
   falla esa base en vez de destruir en silencio. Es correcto. No lo "optimices".
2. **Cambio de schema tenant → `tenant:initsql` NO es opcional.** Editá
   `prisma/tenant/schema.prisma` y **siempre** corré los DOS pasos:
   - `npm run tenant:initsql` — regenera `prisma/tenant/init.sql`, el DDL con el que
     `applyTenantSchema()` (`lib/provision.ts`) crea la base de una clínica **NUEVA** y de
     cada **demo** de la landing. Si te lo saltás, `init.sql` queda atrás del schema y toda
     clínica/demo nueva **nace con columnas faltantes** (el código que las lee falla hasta
     el próximo deploy). Commiteá el `init.sql` regenerado. **Hay una guarda:** el test
     `backend/test/init-sql-sync.test.ts` falla si `init.sql` no coincide con el schema.
   - `npm run migrate:tenants -- --strict` — sincroniza las clínicas **existentes** (con
     `--strict` aborta si el último backup OK tiene >24 h — ver `docs/BACKUPS.md`). Nota:
     migrate-tenants **salta demos expirados** a propósito (su base puede ya no existir).
   Preferí cambios aditivos; un renombre destruye datos.
3. **`dropTenantDatabase()` borra una base de verdad.** Hoy solo la llaman rollbacks de
   creación fallida y la limpieza de demos expiradas. No agregues call sites nuevos.
4. **No debilites el aislamiento multi-tenant.** Nada de queries que crucen bases, ni de
   cachear datos de una clínica en un lugar compartido entre requests.
5. **`proxy.ts` ya no existe.** La protección es el middleware de Express, no un matcher
   de Next. Si necesitás una ruta pública, va bajo `/api/v1/public/*` (tiene CORS abierto
   a propósito, para landings externas).
6. **Antes de eliminar un endpoint o componente**, buscá usos con Grep en `backend/src`,
   `frontend/src`, `web/src` y `shared/src`.
7. **No agregues dependencias pesadas** sin necesidad. Revisá si algo del stack ya lo resuelve.
8. **Windows + PowerShell 5.1**: no uses `&&`, ni redirijas stderr de ejecutables nativos
   (`2>&1`), ni asumas `npx`/`git` en PATH. Rutas completas:
   `C:\Program Files\nodejs\node.exe`, `C:\Program Files\Git\bin\git.exe`.
9. **Nunca pruebes algo que ESCRIBE contra una clínica productiva.** Para probar syncs,
   importaciones, migraciones de datos o cualquier cosa que cree/modifique registros, usá
   una clínica **demo** (se generan solas desde la landing y son descartables). El
   2026-08-04 una prueba de sync bidireccional contra `digital-dent` creó 11 citas
   duplicadas que hubo que borrar a mano de producción.
10. **Antes de una operación destructiva deliberada en producción** (borrado de filas,
    migración de datos, backfill masivo): corré un backup fresco (`npm run backup` o el
    endpoint manual con `x-cron-secret`) y confirmá que terminó OK. Borrá por lista
    explícita de ids ya revisada, dentro de una transacción y con aserción de cuántas
    filas debe afectar. Ver `docs/BACKUPS.md`.

## 6. Comandos

```powershell
# Desarrollo
cd backend  ; npm run dev      # API en http://localhost:4000
cd frontend ; npm run dev      # SPA en http://localhost:5173
cd web      ; npm run dev      # Landing

# Verificación (correr SIEMPRE antes de commitear)
npm --prefix backend run typecheck
npm --prefix backend test                 # unit
npm --prefix backend run test:integration # SQLite efímero por tenant
npm --prefix backend run test:contract    # contrato FE↔BE
npm --prefix frontend run typecheck
npm --prefix web run typecheck

# Base de datos
npm --prefix backend run tenant:initsql    # DDL para clínicas nuevas
npm --prefix backend run migrate:tenants   # sincroniza clínicas existentes
npm --prefix backend run smoke:deploy      # smoke contra producción

# Git (ruta completa porque no está en PATH)
& "C:\Program Files\Git\bin\git.exe" status
```

## 7. Estado y continuidad (OBLIGATORIO)

**Antes de un cambio grande** (más de un módulo, cambio de schema, dependencia nueva):
leé `docs/SESSION_HANDOFF.md` y `docs/architecture.md`. Contienen decisiones ya tomadas
y trabajo en curso que no debés duplicar ni romper.

**Al cerrar una tarea no trivial**, actualizá:

- `docs/AI_CHANGELOG.md` → entrada nueva **al inicio**, con fecha, archivos tocados,
  verificación corrida, riesgos y pendientes.
- `docs/SESSION_HANDOFF.md` → sobrescribí con el estado real de fin de sesión. Es lo
  primero que lee la sesión siguiente.
- `docs/architecture.md` → solo si cambió la arquitectura o una decisión de alto nivel.

**Antes de `/compact` o de cerrar la sesión:** actualizá `docs/SESSION_HANDOFF.md` siempre.

## 8. Pendientes conocidos (ver `docs/AUDITORIA_2026-08.md`)

`@unique` en `Caja.numero` pendiente (requiere backfill previo,
ver `docs/AI_CHANGELOG.md`) · endurecer reglas de ESLint diferidas (`exhaustive-deps` y
algún `no-unused-vars` quedaron en `warn`).

ESLint 9 (flat config) configurado por servicio: `npm run lint` en backend/frontend/web/
shared. Base compartida en `eslint.base.mjs`.

Resueltos en la tanda 2026-08-04: `init.sql` resincronizado + guarda anti-drift · correlativos
(cobro/presupuesto/sesión/paciente/caja) seguros ante concurrencia · caché de clientes por
tenant con LRU + pool acotado · los 2 tests de integración en rojo (eran desactualizados).

Backups: **resueltos** (3 capas, restore probado, ensayo semanal) — ver `docs/BACKUPS.md`.
Google Calendar: **resuelto** (2026-08-04) — cron de sync recreado, fallas visibles con
dead-man's switch y aviso en la agenda.

Observabilidad (healthcheck real, Sentry, logging con request-id): implementada y
**encendida en prod (2026-08-04)** — 3 proyectos Sentry + DSN en Railway + UptimeRobot a
`/health` + scrubber de PII. Ver `docs/OBSERVABILIDAD.md` §0.

## 9. Información que NO debes pedir

- **Producto:** Cláriva. **Rubros:** dental / médico / estética.
- **Idioma:** español de Chile. **Moneda:** CLP, formato `$1.234.567`. **RUT** con DV.
- **Hosting:** Railway (app + Postgres). **Repo:** GitHub, auto-deploy.
- **Rama de trabajo:** `arch/split-frontend-backend` (es la que despliega a producción).
  El **2026-08-05** se puso `master` al día (fast-forward desde `arch`); ambas ramas están
  a la par. Ese merge **activó los workflows de GitHub Actions** que estaban dormidos en master.
- **Modo de trabajo:** el usuario autorizó operación autónoma; no pidas confirmación para
  tareas claras. Sí avisá antes de algo destructivo o irreversible en producción.
