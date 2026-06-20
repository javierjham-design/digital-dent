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
  (DRY-RUN por defecto, `-- --apply` para escribir; idempotente). **Aún NO ejecutado
  contra prod** (sin credenciales en la sesión).

## Verificación (verde hoy)

- `npm --prefix backend run typecheck` limpio (incl. sin el cliente legacy generado).
- `npm --prefix backend test` → 67/67 unit/smoke.
- `npm --prefix backend run test:integration` → 11/11 aislamiento físico.
- `npm --prefix backend run test:contract` → contrato FE↔BE OK (130/116).

## Lo único pendiente: CUTOVER (manual, requiere prod) — `docs/cutover.md`

`cutover.md` quedó **actualizado para database-per-tenant** (2026-06-20). Pasos clave:

1. Crear/definir bases: `CONTROL_DATABASE_URL`, `TENANT_DB_SERVER_URL` (con permiso
   `CREATE DATABASE`), `LEGACY_DATABASE_URL` (= `DATABASE_URL` del monolito).
   `JWT_SECRET`/`ENCRYPTION_KEY` idénticos al monolito.
2. Levantar los 3 servicios Railway (backend/frontend/web) + `control:push`.
3. **Ventana de solo-lectura** en el monolito → `migrate:data` (dry-run y luego `--apply`).
4. Validar el stack nuevo con datos migrados → mover DNS (`api`, `*.clariva.cl`, apex).
5. Rollback limpio solo ANTES de aceptar escrituras nuevas (después hay divergencia de datos).

## Pendientes operativos (no bloquean el cutover)

- 2FA TOTP super-admin · Sentry + uptime · verificar backups Postgres · Google OAuth
  verification (sacar de modo Testing) · ejecutar `docs/QA_CHECKLIST_LANZAMIENTO.md`.

## Notas

- Nunca pushear a `master` (deploya el monolito). Trabajo en `arch/split-frontend-backend`.
- `docs/PROJECT_STATUS.md` está desactualizado (era del monolito Fase 1B); la fuente de
  verdad del estado actual son `docs/AI_CHANGELOG.md`, `docs/parity-matrix.md` y este archivo.
