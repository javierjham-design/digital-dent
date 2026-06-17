# Matriz de paridad — Monolito vs. nuevo stack (Etapa 4-1)

> Auditoría de contrato entre el **monolito Next.js** (producción) y el **nuevo
> stack** (backend Express `/api/v1` + frontend SPA). Objetivo: detectar gaps
> antes del cutover (Etapa 5).
>
> Fecha auditoría: 2026-06-17 · Rama: `arch/split-frontend-backend`

## Resumen ejecutivo

- **Backend (API):** prácticamente 100% portado. 5 endpoints del monolito **sin
  equivalente** en `/api/v1`, todos de severidad media/baja y **ninguno usado por
  la SPA actual** (no hay features rotas, sí features ausentes).
- **Frontend (UI):** 4 vistas del monolito **sin equivalente** SPA. Las dos de
  severidad media (**Presupuestos**, **Reportes**) ya tienen el cliente de
  servicio listo en el front — solo falta la página.
- **Sin regresiones detectables por lectura de código.** Todo lo migrado tiene su
  contraparte funcional.

## A. Endpoints API

### A.1 Portados / equivalentes (sin acción)

| Dominio | Monolito `/api/*` | Backend `/api/v1/*` | Notas |
|--------|-------------------|---------------------|-------|
| Auth | `auth/[...nextauth]`, `auth/whoami` | `POST /auth/login`, `GET /auth/me` | NextAuth → JWT propio. Login dual (clínica/super-admin). |
| Pacientes | `pacientes`, `pacientes/[id]`, `pacientes/search` | `GET/POST /pacientes`, `GET/PATCH /pacientes/:id` | **search fusionado** en `GET /pacientes?q=`. |
| Ficha | (en `pacientes/[id]`) | `GET/PUT /pacientes/:id/ficha` | Flags clínicos + odontograma. |
| Citas | `citas`, `citas/[id]` | `GET/POST /citas`, `PATCH/DELETE /citas/:id`, `PATCH /citas/:id/estado` | Filtro `?pacienteId=`. |
| Equipo | `usuarios`, `usuarios/[id]` | `GET/POST /usuarios`, `GET /doctores`, `PATCH /usuarios/:id` | |
| Agenda | `horarios`, `bloqueos`, `bloqueos/[id]` | `GET/POST /horarios`, `GET/POST /bloqueos`, `PATCH/DELETE /bloqueos/:id` | |
| Catálogo | `prestaciones[/id]`, `medios-pago[/id]`, `clinica`, `configuracion` | `/prestaciones`, `/medios-pago`, `GET/PATCH /clinica` | **`configuracion` ya estaba DEPRECADO** en el monolito (gateway a `/clinica`). |
| Clínico | `planes-tratamiento[/id][/secciones]`, `secciones-plan/[id]`, `tratamientos[/id]`, `evoluciones[/id]`, `odontograma` | idénticos | |
| Presupuestos | `presupuestos`, `presupuestos/[id]` | `GET/POST /presupuestos`, `GET/PATCH /presupuestos/:id` | Backend ✓; falta **UI** (ver B). |
| Caja | `cajas[/id]`, `…/abrir`, `…/cerrar`, `…/sesiones[…]`, `…/movimientos[…]/anular` | idénticos | |
| Cobros | `cobros[/id]`, `cobros/[id]/anular` | idénticos | |
| Contratos | `contratos[/id]` | idénticos (+`DELETE`) | |
| Liquidaciones | `liquidaciones[/id]` | idénticos | |
| Reportes | `reportes/{pacientes,citas,cobros,tratamientos,liquidaciones,caja,morosos}` | idénticos (7 XLSX) | Backend ✓; falta **UI** (ver B). |
| Super-admin | `admin/*` (clínicas, plan, estado, trial, password, pagos, extras, whatsapp, planes-suscripción, leads, resumen, stats) | idénticos | |
| Google | `google/{connect,callback,disconnect,calendars,sync,reconcile-bloqueos}` | idénticos | |
| WhatsApp | `whatsapp/{webhook,recordatorios}` | idénticos | |
| Demo | `demo`, `demo/cleanup` | idénticos | |

### A.2 Gaps de endpoint (en el backend nuevo)

| # | Endpoint monolito | Modelo | ¿La SPA lo invoca? | Severidad | Recomendación |
|---|-------------------|--------|--------------------|-----------|---------------|
| E1 | `POST /auth/cambiar-password` | User | No (no hay UI) | **Media** | Cerrar antes de cutover: es self-service de seguridad (verifica pass actual + política + rate-limit). |
| E2 | `GET/POST /pacientes/[id]/comentarios` | ComentarioAdministrativo | No | **Media** | Cerrar antes de cutover si la clínica usa comentarios administrativos. |
| E3 | `GET/POST /pacientes/[id]/mensajes` | MensajePaciente | No | Baja | Diferible (historial de mensajes; lo alimenta el flujo WhatsApp). |
| E4 | `GET /pacientes/[id]/resumen` | (KPIs derivados) | No | Baja | Diferible (KPIs de fila expandida; nice-to-have). |
| E5 | `pacientes/{import,export,template}` | Paciente (CSV) | No | Baja | Diferible (carga/descarga masiva; conveniencia admin). |

## B. Páginas / vistas

| Página monolito | Vista SPA | Estado | Severidad |
|-----------------|-----------|--------|-----------|
| `agenda` | `Agenda.tsx` | ✅ | |
| `pacientes` | `Pacientes.tsx` | ✅ | |
| `pacientes/[id]` | `FichaPaciente.tsx` | ✅ | |
| `cobros` + `cobros/caja[…]` | `Cobros.tsx` | ✅ (3 páginas fusionadas en 1) | |
| `liquidaciones` | `Liquidaciones.tsx` | ✅ | |
| `prestaciones` | `Prestaciones.tsx` | ✅ | |
| `usuarios` | `Equipo.tsx` | ✅ | |
| `configuracion` | `Configuracion.tsx` | ✅ | |
| (super-admin) | `admin/*` (5 vistas) | ✅ | |
| **`presupuestos`** | — | ❌ **GAP** (servicio FE listo) | **Media** |
| **`reportes`** | — | ❌ **GAP** (servicio FE listo) | **Media** |
| `(dashboard)/` (home/KPIs) | — | ❌ (la SPA redirige a `/agenda`) | Baja |
| `ayuda` | — | ❌ | Baja |

## C. Plan de remediación (paridad funcional)

**Cerrar antes del cutover (severidad media):**
- **P1 — Página Presupuestos** (SPA): lista + crear/editar, usando `presupuestosService` (ya existe).
- **P2 — Página Reportes** (SPA): grilla de los 7 reportes XLSX con `descargarReporte` (ya existe) + filtros de fecha.
- **E1 — `cambiar-password`** (backend + UI): endpoint con verificación de pass actual, política (8+, letra+número) y rate-limit; UI mínima en Configuración o menú de perfil.
- **E2 — `comentarios`** (backend + tab en ficha): si se confirma uso real.

**Diferibles (documentados, fast-follow post-cutover):**
- E3 mensajes, E4 resumen/KPIs, E5 import/export/template, home de dashboard, ayuda.

> Las fases 4-2 y 4-3 (tests automatizados) **no dependen** de cerrar estos gaps:
> validan el backend ya portado (que es lo crítico para el cutover). El cierre de
> gaps de UI corre en paralelo a la batería de pruebas.
