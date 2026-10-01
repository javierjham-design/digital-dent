# Session Handoff

> **Leé este archivo PRIMERO al iniciar una sesión.** Resume dónde quedó el trabajo,
> sin depender del historial de chat anterior. Rama de trabajo/deploy: `arch/split-frontend-backend`.

## Último trabajo: Asistente de IA — etapas 1 y 2 DESPLEGADAS (falta el piloto)

**Backend (etapa 1) + frontend (etapa 2) en producción, con GPT-4o-mini.** Responde
preguntas en lenguaje natural sobre los datos de una clínica, solo lectura, con
seudonimización de pacientes y límites de costo duros. Pantalla `/asistente` (chat, tablas
exportables, menciones `@`). **Encendido a nivel API** (`ASISTENTE_ENABLED=true` +
`OPENAI_API_KEY` cargadas en Railway/BACKEND). Arquitectura y runbook en `docs/ASISTENTE_IA.md`;
decisiones fijas en `docs/PROMPT_ASISTENTE_IA.md`. Faltan el **piloto**, la etapa 3 (capa
semántica) y la 4 (SQL RO, condicional).

**Deploy/infra (aprendido el 2026-10-01):** el auto-deploy de Railway funciona (push a `arch`
o `master` dispara). Los servicios reales son **BACKEND** (`fb40b407`, dominio
backend-production-4f47 / api.clariva.cl), **FRONTEND**, **WEB Service**; hay crons y Postgres.
El servicio viejo **`digital-dent`** (monolito, deploya de `master`, port 8080) da FAILED y es
vestigial — Javier lo iba a borrar. Railway CLI logueado como javier.jham@gmail.com, proyecto
`amused-recreation`.

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

### Decisión confirmada con Javier (2026-09-07)
Motor detrás de `ProveedorModelo` (TuBot y el console quedan **fuera del camino del dato**).
Proveedor elegido: **OpenAI `gpt-4o-mini`** por costo (`ASISTENTE_PROVEEDOR=openai`, default).
Anthropic queda disponible cambiando la env (`ASISTENTE_PROVEEDOR=anthropic`). La
seudonimización protege igual con cualquier proveedor. Se decide con datos (piloto + preguntas
doradas) si mini alcanza o hay que subir de modelo — es una variable, no código.

## PENDIENTE (próxima sesión / Javier)

1. **Piloto en una demo**: desde el super-admin, activar el módulo `asistente` en una **demo**
   (no en digital-dent todavía), entrar a `/asistente` y probar las 9 herramientas con
   GPT-4o-mini. Anotar en `docs/ASISTENTE_IA.md` qué respondió bien/mal y el **costo por
   consulta** que aparece en `AsistenteAuditoria`. Recién después, confirmar en digital-dent.
   (Nota: digital-dent ya tiene el módulo encendido y `ASISTENTE_ENABLED=true`, así que su
   asistente está vivo a nivel API; al ser solo lectura es de bajo riesgo.)
2. **Etapa 3 — capa semántica** (`consultar_metricas`): la que lo hace "análisis completo".
   Con el piloto se evalúa si `gpt-4o-mini` alcanza o hay que subir de modelo (una env).
   Prompt en `docs/PROMPT_ASISTENTE_IA.md`.
3. **ZDR/datos con OpenAI**: confirmar acuerdo de tratamiento de datos + retención con OpenAI
   antes de uso intensivo con una clínica productiva (trámite, no código).

## Contexto que no cambió
Database-per-tenant (control + `clariva_t_<slug>`), Railway auto-deploy desde `arch`,
operación autónoma autorizada (avisar solo antes de algo destructivo/irreversible en prod).
