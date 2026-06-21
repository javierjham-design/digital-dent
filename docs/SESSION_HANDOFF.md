# Session Handoff

> **Lee este archivo PRIMERO al iniciar una sesión.** Resume exactamente dónde quedó
> el trabajo, sin depender del historial de chat anterior.

---

## Última actualización

- **Fecha:** 2026-06-20
- **Rama:** `arch/split-frontend-backend` (último commit `11c7730`).
- **Foco:** re-arquitectura database-per-tenant COMPLETA en código; pendiente solo el cutover.

---

## El hilo grande (para no perderse)

Hay DOS trabajos encadenados:

1. **Split del monolito → stack separado** (`web/` + `frontend/` SPA + `backend/` Express + `shared/`).
   **Estado: CÓDIGO TERMINADO.** Paridad funcional 100% (ver `docs/parity-matrix.md`,
   2026-06-17): GAPS P1 (Presupuestos) y P2 (Reportes) cerrados, contrato FE↔BE verde
   (130 rutas / 116 llamadas). Lo que NUNCA se ejecutó es la **Etapa 5 (cutover)**.

2. **Database-per-tenant (modelo C)** — pivote que metimos JUSTO ANTES del cutover.
   Cada clínica con base física propia (control-plane DB + 1 DB por clínica).
   **Estado: CÓDIGO TERMINADO (F1–F7).**

## Estado de la re-arquitectura DB-por-tenant (F1–F7)

- **F1–F3:** schemas control/tenant, capa de conexión + cache de PrismaClient, provisión
  automática (`CREATE DATABASE`) + middleware `requireTenant`.
- **F4:** 11 dominios + auth + demo + super-admin + integraciones **Google y WhatsApp**
  convertidos al cliente por-request. Push/pull de Google reconectado en citas/bloqueos.
  WhatsApp: routing por `waNumero`/`waEnabled` denormalizados en `control.Clinica`.
- **Limpieza:** borrados `lib/prisma.ts`, `prisma/schema.prisma` (shared), código muerto
  (`demo-seed`/`demo-cleanup`), helpers huérfanos y scripts `prisma:sync`/`prisma:generate`.
- **F5:** `npm run migrate:tenants` (aplica el schema tenant a todas las bases).
- **F6:** tests de aislamiento físico (sqlite por clínica) — 11/11.
- **F7:** `npm run migrate:data` — script de migración monolito → control + tenants
  (DRY-RUN por defecto, `-- --apply` para escribir; idempotente). **Ya EJECUTADO contra
  producción** en el cutover (ver sección "CUTOVER EJECUTADO" abajo).

## Verificación (verde hoy)

- `npm --prefix backend run typecheck` limpio (incl. sin el cliente legacy generado).
- `npm --prefix backend test` → 67/67 unit/smoke.
- `npm --prefix backend run test:integration` → 11/11 aislamiento físico.
- `npm --prefix backend run test:contract` → contrato FE↔BE OK (130/116).

## CUTOVER EJECUTADO ✅ (2026-06-20) — EN PRODUCCIÓN

El stack nuevo está **vivo en producción** en Railway (proyecto `amused-recreation`),
desplegando desde la rama `arch/split-frontend-backend`. El monolito (`digital-dent`)
quedó **offline** (sus dominios los tiene el stack nuevo).

- **Backend** → `api.clariva.cl` · **Frontend** (app clínicas) → `*.clariva.cl`
  (subdominio por clínica) · **Web/landing** → `clariva.cl` + `www`. DNS en Cloudflare
  (registros en **gris/DNS-only**; el wildcard obligatorio gris).
- **Postgres:** un servidor, 3 roles de base → `clariva_control` (control-plane) +
  `clariva_t_digital_dent` + `clariva_t_clinica_montenegro` (una física por clínica).
- **Datos migrados** con `migrate:data --apply` (digital-dent: 6.548 pacientes, 139
  citas, equipo 5, Google token migrado; montenegro: su propia base). Verificado el
  aislamiento físico con `verify-migration`.
- **Backend env (a prueba de rotación):** `TENANT_DB_SERVER_URL=${{Postgres.DATABASE_URL}}`,
  `CONTROL_DATABASE_URL=postgresql://${{Postgres.PGUSER}}:${{Postgres.PGPASSWORD}}@postgres.railway.internal:5432/clariva_control`.
  `LEGACY_DATABASE_URL` removido del backend (solo lo usó el script de migración).
  Password de Postgres **rotada** post-cutover.
- **Smoke de producción** (`scripts/smoke-deploy.mjs`) verde: health, planes públicos,
  401 sin token, CORS por subdominio.
- **Crons:** workflow GitHub Actions (`.github/workflows/clariva-cron.yml`, sync + cleanup)
  — ⚠️ se **activa solo al mergear a `master`** (GitHub corre `schedule` solo en la rama
  default). Secreto `CRON_SECRET` ya cargado en GitHub.

### Lo que queda
1. **QA en producción** (usuario): agenda, cobros/caja, liquidaciones, reportes, super-admin,
   y **probar "Conectar Google"** (redirect ya en `api.clariva.cl`). Irán saliendo ajustes
   menores vs. el monolito.
2. **Cierre final:** merge `arch → master` + retirar el servicio monolito en Railway.
   Esto **activa los crons** automáticamente. Sin apuro (ya corre desde la rama).
3. Opcional: **Watch Paths** por servicio en Railway (hoy cada push redeploya los 3).

> Fixes ya hechos durante el QA inicial: búsqueda de pacientes server-side + paginación
> (25/50/100); selectores de paciente (cita/presupuesto/cobro) server-side (antes veían
> solo los primeros 500). Ver `AI_CHANGELOG.md`.

## Pendientes operativos (no bloquean el cutover)

- 2FA TOTP super-admin · Sentry + uptime · verificar backups Postgres · Google OAuth
  verification (sacar de modo Testing) · ejecutar `docs/QA_CHECKLIST_LANZAMIENTO.md`.

## Notas

- Nunca pushear a `master` (deploya el monolito). Trabajo en `arch/split-frontend-backend`.
- `docs/PROJECT_STATUS.md` está desactualizado (era del monolito Fase 1B); la fuente de
  verdad del estado actual son `docs/AI_CHANGELOG.md`, `docs/parity-matrix.md` y este archivo.
