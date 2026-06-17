# Matriz de paridad — Monolito vs. nuevo stack (Etapa 4-1)

> Auditoría de contrato entre el **monolito Next.js** (producción) y el **nuevo
> stack** (backend Express `/api/v1` + frontend SPA). Objetivo: detectar gaps
> antes del cutover (Etapa 5).
>
> Fecha auditoría: 2026-06-17 · Rama: `arch/split-frontend-backend`

## Resumen ejecutivo

> **Actualización 2026-06-17: paridad funcional al 100%.** Todos los gaps
> detectados en la auditoría inicial fueron cerrados (ver §C). Lo que sigue es el
> registro de la auditoría original y su resolución.

- **Backend (API):** 100% portado. Los 5 endpoints que faltaban (cambiar-password,
  comentarios, mensajes, resumen, import/export/template) ya están implementados.
- **Frontend (UI):** todas las vistas portadas. Las que faltaban (Presupuestos,
  Reportes, Ayuda) ya existen; "home" no era gap (el monolito solo redirige).
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

### A.2 Gaps de endpoint — TODOS CERRADOS (2026-06-17)

| # | Endpoint | Estado |
|---|----------|--------|
| E1 | `POST /auth/cambiar-password` | ✅ Backend (verifica pass actual + política 8+/letra+número + rate-limit) + UI (modal en header, con gate de cambio forzado por `requirePasswordChange`). |
| E2 | `GET/POST /pacientes/:id/comentarios` | ✅ Backend + tab "Comentarios" en la ficha. |
| E3 | `GET/POST /pacientes/:id/mensajes` | ✅ Backend + tab "Mensajes" (historial, solo lectura) en la ficha. |
| E4 | `GET /pacientes/:id/resumen` | ✅ Backend + KPIs en el encabezado de la ficha. |
| E5 | `GET /pacientes/{export,template}`, `POST /pacientes/import` | ✅ Backend (XLSX, import con multer + validación/dedup) + botones en Pacientes (import solo admin). |

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
| `presupuestos` | `Presupuestos.tsx` | ✅ (cerrado 2026-06-17) | |
| `reportes` | `Reportes.tsx` | ✅ (cerrado 2026-06-17) | |
| `(dashboard)/` (home) | — (catch-all → `/agenda`) | ✅ No es gap: el monolito **solo hace `redirect('/agenda')`**; la SPA replica ese comportamiento. | |
| `ayuda` | `Ayuda.tsx` | ✅ (cerrado 2026-06-17; centro de ayuda con búsqueda + categorías, escrito para la UI de la SPA) | |

## C. Plan de remediación — COMPLETADO (2026-06-17)

**Todos los gaps cerrados.** Paridad funcional al 100%:
- ✅ P1 Presupuestos, ✅ P2 Reportes (páginas SPA).
- ✅ E1 cambiar-password, ✅ E2 comentarios, ✅ E3 mensajes, ✅ E4 resumen/KPIs, ✅ E5 import/export/template.
- ✅ Ayuda (centro de ayuda de la SPA).
- Home no era gap (el monolito solo redirige a `/agenda`).

> Verificación: build del frontend verde · backend typecheck verde · 55/55 unit+smoke ·
> 22/22 integración (incluye aislamiento multi-tenant de los endpoints nuevos) ·
> contrato FE↔BE 116/116. **No quedan gaps pendientes para el cutover.**
