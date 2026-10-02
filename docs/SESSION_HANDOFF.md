# Session Handoff

> **Leé este archivo PRIMERO al iniciar una sesión.** Resume dónde quedó el trabajo,
> sin depender del historial de chat anterior. Rama de trabajo/deploy: `arch/split-frontend-backend`.

## Último trabajo: Asistencia / no-show — marcado + métrica por campaña + recaptura (MCP)

**Desplegado (2026-10-02).** Cierra el eslabón de la asistencia (antes el no-show no se medía).

- **Schema tenant ADITIVO** (se aplica en el prestart de cada deploy): `Lead.recapturaNoShowAt`,
  `Configuracion.noShowAutoHoras` (def 3) y `recapturaDiasPerdido` (def 5). `Lead.asistio` ya existía.
- **Marcar (A):** asistencia = `cita.estado` (ATENDIDA/NO_ASISTIO), motor existente; al marcar se propaga
  a `lead.asistio` (`propagarAsistenciaLead`). Job `cerrarNoShowsTodasLasClinicas` (cada 30 min): cita
  vencida +N h sin marcar → NO_ASISTIO (nunca asume asistió). UI Agenda: aviso de pendientes + botones
  rápidos Asistió/No asistió. Re-agenda → AGENDADO (`reengancharLeadReagenda` en `crearCita`).
- **Métrica (B):** `GET /ext/asistencia-por-campana` + tool MCP `asistencia_por_campana`.
- **Recaptura (C):** push inmediato = webhook `appointment.attendance` (no_show) que YA emitía
  `cambiarEstadoCita` (contrato en docs/TUBOT_AGENDA.md); idempotencia con `recapturaNoShowAt`. Pull:
  `GET /ext/no-shows` + tool MCP `no_shows`. No-show sin re-agendar > X días → PERDIDO (mismo job).
- **Acción del usuario:** reiniciar el cliente MCP para ver `asistencia_por_campana` y `no_shows`.
- Verde: typecheck (back+front) · unit 158 · integración 197 · contrato 294 · lint 0.

## Trabajo previo: ROI por campaña en el MCP + autolink desde agenda-online

**Desplegado (2026-10-01).** Cierre del ciclo de ROI por campaña.

- **MCP read-only (Parte A):** nuevos endpoints `GET /ext/ingresos-por-campana?desde=&hasta=`
  (nº leads, nº convertidos, `total_cobrado` = Σ cobros PAGADO de pacientes vinculados a leads
  convertidos, detalle por paciente) y `GET /ext/pagos-paciente/:pacienteId`, bajo el mismo
  `apiKeyScope` que `buscar_leads`. Tools MCP `ingresos_por_campana` y `pagos_paciente`
  (`mcp-server/src/index.mjs` + README). **El servidor MCP del cliente debe reiniciarse** para
  ver las tools nuevas (son del paquete `mcp-server`, que corre en la máquina del cliente).
- **Match robusto desde cualquier origen (Parte B):** `autolinkLeadAlCrearPaciente` ahora
  corre también al crear ficha desde **agenda-online** (antes: solo ficha manual / tubot / botón
  CRM). Email como 3ª llave + `telCanonico` robusto ya estaban. Diagnóstico `diag-pagos-sin-lead.ts`
  separa MATCH PERDIDO / DUPLICADO / WALK-IN y lo atribuye por campaña.
- **Dry-run histórico (digital-dent):** match perdido 0 · duplicado 4 · walk-in 89 · inequívocos 0 ·
  dudosos 21 · backfill 0. El backlog recuperable ya estaba agotado (apply previo + cron) → **no se
  aplicó nada** (no-op, sin backup necesario). Pendiente: resolver 21 dudosos a mano,
  de-dup de las 4 fichas duplicadas.
- **Parte C (asistencia) HECHA:** `marcarAsistenciaPorActividad` (`citas.service.ts`) marca ATENDIDA
  la cita del día cuando se registra un **pago presencial** (`cobros.service.ts`), de forma pasiva
  (sin webhooks TuBot/Google). Pago online Flow NO la dispara. Alimenta show-rate y costo-por-atendido
  vía la métrica `citas_atendidas`. Solo promueve desde estados pre-asistencia; no pisa NO_ASISTIO.
- Sin cambios de schema. Verde: typecheck · unit 158 · integración 193 · contrato 292 · lint 0.

## Trabajo previo: Atribución CRM — email como 3ª llave + reconciliación APLICADA en prod

**Desplegado y aplicado (2026-10-01).** Problema: pacientes de campaña Meta que pagaban no
quedaban CONVERTIDO cuando la ficha se creaba con teléfono en otro formato o sin RUT. 

- **Diagnóstico (solo lectura, `diag-pagos-sin-lead.ts`):** de 93 pagados-sin-lead en
  digital-dent, **89 son walk-ins reales** (no existe lead con su tel/correo). No era un bug
  masivo; el fix es preventivo + higiene.
- **Fix de raíz (`crm.service.ts`):** email como 3ª llave (+ tel normalizado robusto + RUT) en
  `mismaIdentidad`/`leadsSinVincularPorIdentidad`; `autolinkLeadAlCrearPaciente` al crear ficha;
  `marcarConvertidoPorCobro` vincula al cobrar si hay 1 match (ambiguo → NO adivina, aviso en
  ficha). Clasificador puro `clasificarVinculosHuerfanos` (RUT/email inequívoco, tel compartido
  dudoso). Cron `reconciliarVinculosTodasLasClinicas` (12 h, inequívocos recientes, no emite).
- **Aplicado con backup fresco OK (regla 10):** `backfill-conversiones --apply` = **5
  CONVERTIDO**; `reconciliar-vinculos --apply` = **18 vínculos**, **21 dudosos a resolver a
  mano** desde el aviso de la ficha. Ningún script emite a Meta (clamp 7 días). Atribución 23→23.
- **Pendiente opcional:** resolver los 21 dudosos a mano; de-dup de ~3-5 fichas duplicadas;
  Etapa 3 del prompt (marcar asistencia para show-rate / costo-por-atendido).
- Tests: `crm-match` (8 unit) + `crm-vinculo-email` (4 integración), verdes.

## Trabajo previo: Asistente de IA — etapas 1, 2 y 3 DESPLEGADAS + selector de modelo

**Backend + frontend + capa semántica en producción, con GPT-4o-mini.** Responde preguntas
en lenguaje natural sobre los datos de una clínica (solo lectura), con seudonimización,
límites de costo y la **capa semántica** (`consultar_metricas`: catálogo de métricas/
dimensiones → consulta estructurada → Prisma, sin SQL libre) que cubre preguntas no previstas
(ej. "pacientes con 1 sola cita en septiembre"). Pantalla `/asistente` (chat, tablas, Excel,
menciones `@`). **El super-admin ajusta el modelo por clínica** (tarjeta "Asistente de IA —
modelo"). Encendido a nivel API (`ASISTENTE_ENABLED=true` + `OPENAI_API_KEY` en Railway/BACKEND).
Arquitectura/runbook en `docs/ASISTENTE_IA.md`; decisiones fijas en `docs/PROMPT_ASISTENTE_IA.md`.
Falta el **piloto** (y la etapa 4 SQL RO es condicional — solo si la 3 se queda corta).

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
2. **Ajuste de modelo según el piloto**: si gpt-4o-mini elige mal las métricas, subir esa
   clínica desde el super-admin (tarjeta "Asistente de IA — modelo") a gpt-4.1-mini / gpt-4o /
   Claude. Las preguntas doradas (`test/integration/asistente-doradas.test.ts`) fijan las
   definiciones de negocio del compilador.
3. **ZDR/datos con OpenAI**: confirmar acuerdo de tratamiento de datos + retención con OpenAI
   antes de uso intensivo con una clínica productiva (trámite, no código).
4. **Etapa 4 (SQL RO) — CONDICIONAL**: solo si `AsistenteAuditoria` sigue mostrando
   `sin_herramienta` que el catálogo no cubra. Si no hay evidencia, no se hace.

## Contexto que no cambió
Database-per-tenant (control + `clariva_t_<slug>`), Railway auto-deploy desde `arch`,
operación autónoma autorizada (avisar solo antes de algo destructivo/irreversible en prod).
