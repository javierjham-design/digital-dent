# Session Handoff

> **Leé este archivo PRIMERO al iniciar una sesión.** Resume dónde quedó el trabajo,
> sin depender del historial de chat anterior. Rama de trabajo/deploy: `arch/split-frontend-backend`.

## Último trabajo: Asistente de IA — etapa 1/4 (backend, solo lectura)

**Hecho y verde localmente. Falta el despliegue (abajo).** Es el backend del Asistente de
IA: responde preguntas en lenguaje natural sobre los datos de una clínica, solo lectura,
con seudonimización de pacientes y límites de costo duros. Apagado por defecto y reversible.
Arquitectura y runbook en `docs/ASISTENTE_IA.md`; decisiones fijas en
`docs/PROMPT_ASISTENTE_IA.md` (sección "Decisiones de diseño"). Etapas 2 (frontend + piloto),
3 (capa semántica) y 4 (SQL RO, condicional) siguen pendientes, con sus prompts en ese doc.

### Qué quedó en el repo (todo commiteado en `arch`)
- `shared/src/constants/modulos.ts`: módulo `asistente` (grupo aparte, **fuera de
  `MODULOS_DEFAULT`**). El super-admin ya lo muestra/guarda (vía `sanitizarModulos`).
- `shared/src/types/asistente.ts`: DTOs (re-exportados por el barrel).
- `backend/prisma/tenant/schema.prisma`: 4 modelos (`AsistenteSesion`, `AsistenteMensaje`,
  `AsistenteResultado`, `AsistenteAuditoria`) + `init.sql` regenerado.
- `backend/src/services/asistente/`: `proveedor.ts` (interfaz + Anthropic + Falso + precios),
  `seudonimo.ts`, `tipos.ts`, `marco.ts`, `herramientas/` (9), `limites.ts`,
  `verificacion.ts`, `orquestador.ts`, `sesiones.ts`.
- `backend/src/{middlewares/asistente.ts, controllers/asistente.controller.ts,
  routes/index.ts, validators/schemas.ts, config/env.ts, lib/observability.ts}`.
- Refactor aditivo de services: `reportes` (`citasDatos`/`movimientosCajaDatos`/`morososDatos`),
  `tratamientos` (`totalesDePlan`), `crm` (`resumenCrm` con rango opcional).
- Tests: `backend/test/asistente-unit.test.ts` (15) + `backend/test/integration/asistente.test.ts` (8).
- Dep nueva: `@anthropic-ai/sdk`.

### Verificación (local, verde)
`typecheck` · `test` (149) · `test:integration` (161) · `test:contract` (289 rutas) · lint 0.

### Decisión confirmada con Javier (2026-09-04)
Motor = **API de Anthropic directa detrás de `ProveedorModelo`**. TuBot y el console de
Claude/GPT quedan **fuera del camino del dato** (protección de datos: nada identificable sale
de Cláriva). GPT queda abierto para más adelante implementando la interfaz, sin rediseñar.
Default de modelo `claude-sonnet-4-6`; los IDs `sonnet-5`/`opus-5` del diseño original no
existen aún en el catálogo, pero la tabla de precios los contempla por si se setean por env.

## PENDIENTE (próxima sesión / Javier)

1. **Desplegar etapa 1** (sigue apagada, es seguro): backup fresco (`npm run backup` o el
   endpoint con `x-cron-secret`) → confirmar OK → `npm run migrate:tenants -- --strict` →
   deploy. En Railway dejar `ASISTENTE_ENABLED=false` y **ninguna** clínica con el módulo.
   Smoke: `GET /api/v1/asistente/estado` con sesión válida → **503**.
2. **Prerrequisito de Javier antes de la etapa 2**: cargar `ANTHROPIC_API_KEY` en Railway
   (backend) y gestionar con Anthropic el acuerdo de tratamiento de datos + retención cero (ZDR).
3. **Etapa 2** (frontend + piloto en una demo): prompt en `docs/PROMPT_ASISTENTE_IA.md`.

## Contexto que no cambió
Database-per-tenant (control + `clariva_t_<slug>`), Railway auto-deploy desde `arch`,
operación autónoma autorizada (avisar solo antes de algo destructivo/irreversible en prod).
