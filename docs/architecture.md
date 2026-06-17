# Arquitectura — Separación Frontend / Backend

> Estado: **migración en curso** (rama `arch/split-frontend-backend`).
> El monolito Next.js sigue siendo el sistema en producción hasta el *cutover*.

## Objetivo

Separar Cláriva en dos capas físicas e independientes:

- **Backend** (`/backend`): API REST con toda la lógica de negocio, datos, auth,
  permisos y multi-tenant. Express + TypeScript + Prisma.
- **Frontend** (`/frontend`): SPA de UI pura que consume la API. Vite + React +
  TypeScript + Tailwind. No contiene lógica de negocio ni acceso a base de datos.
- **Shared** (`/shared`): tipos (DTOs) y constantes de dominio compartidos por
  ambos lados (fuente única de verdad).

## Estructura del monorepo

```
dental-platform/
├── app/  lib/  prisma/  proxy.ts …   ← MONOLITO Next.js (producción actual)
│
├── shared/
│   └── src/
│       ├── types/          DTOs de la API (SessionUser, Cita, Paciente…)
│       └── constants/      estados de cita, etc.
│
├── backend/                          ← API REST (nuevo)
│   ├── prisma/schema.prisma          copia sincronizada del schema del monolito
│   └── src/
│       ├── config/         env
│       ├── lib/            prisma, crypto, rate-limit, errors
│       ├── middlewares/    auth (JWT), tenant, error, async-handler
│       ├── services/       LÓGICA DE NEGOCIO (auth, pacientes, citas…)
│       ├── controllers/    adaptan req/res → services
│       ├── routes/         define endpoints y los protege
│       └── validators/     esquemas zod
│
└── frontend/                         ← SPA (nuevo)
    └── src/
        ├── services/       cliente API tipado (único punto de fetch)
        ├── hooks/          useAuth (contexto de sesión)
        ├── layouts/        DashboardLayout
        ├── pages/          Login, Agenda, Pacientes…
        ├── components/     ProtectedRoute…
        └── styles/
```

## Reglas de la arquitectura

1. **El frontend NUNCA toca Prisma ni la base de datos.** Solo habla con el
   backend a través de `src/services/*` (cliente API tipado).
2. **La lógica de negocio vive en `backend/src/services`.** Los controllers son
   finos: validan (zod), llaman al service, responden. Sin lógica en las rutas.
3. **Multi-tenant**: el `clinicaId` viaja dentro del JWT. Todo query del backend
   filtra por `clinicaId`. El middleware `requireClinica` lo garantiza.
4. **DTOs compartidos** en `/shared`: el contrato entre front y back es tipado de
   punta a punta. No se exponen modelos Prisma al frontend.
5. **Errores**: los services lanzan `AppError(status, msg)`; el middleware de
   errores los traduce a `{ error }` sin filtrar internals.

## Autenticación

- El backend emite **JWT** propio (`POST /api/v1/auth/login`), con login dual
  (slug+username para clínica, email para super-admin) — misma semántica que el
  monolito, reutilizando bcrypt y el modelo `User`.
- El frontend guarda el token y lo manda en `Authorization: Bearer`.
- Anti fuerza bruta: rate-limit por usuario e IP (solo fallos consumen cupo).
- Sesión de 12 h.

## Base de datos durante la migración

El backend usa **la misma base de datos** que el monolito (single source of
truth). El schema vive en el monolito (`prisma/schema.prisma`) y el backend tiene
una **copia sincronizada** en `backend/prisma/schema.prisma`.
Para resincronizar tras un cambio de schema: `cd backend && npm run prisma:sync`.

## Plan de migración por etapas

| Etapa | Descripción | Estado |
|------|-------------|--------|
| 1 | Monorepo + shared + backend (auth, pacientes, citas) + frontend (login, agenda, pacientes) | ✅ Hecho |
| 2A | Backend: equipo/usuarios + doctores, horarios, bloqueos, prestaciones, configuración de clínica, citas editar/reagendar/eliminar | ✅ Hecho |
| 2B-1 | Backend: clínico (planes, tratamientos, secciones, evoluciones, odontograma, medios de pago) | ✅ Hecho |
| 2B-2 | Backend: presupuestos, cobros, caja (sesiones/movimientos/cierre), contratos, liquidaciones | ✅ Hecho |
| 2B-3 | Backend: reportes (7 XLSX) + super-admin (clínicas, plan/estado/trial, pagos, extras, WhatsApp, planes-suscripción, leads, resumen, stats) | ✅ Hecho |
| 2B-4 | Backend: WhatsApp (webhook + recordatorios), Demo (crear + cleanup), Google Calendar (connect/callback/disconnect/calendars/sync/reconcile) + efectos diferidos (push a Google en citas/bloqueos) | ✅ Hecho |
| 3-1 | Frontend: capa de servicios API tipada + Equipo, Prestaciones, Configuración | ✅ Hecho |
| 3-2 | Frontend: agenda completa (FullCalendar semanal + lista diaria, crear/detalle/bloqueo, drag&drop, estados) | ✅ Hecho |
| 3-3 | Frontend: ficha clínica (datos, citas, planes, evoluciones) + odontograma FDI | ✅ Hecho |
| 3-4 | Frontend: cobros + caja (sesiones/movimientos) + liquidaciones + contratos | ✅ Hecho |
| 3-5 | Frontend: super-admin (dashboard/MRR, clínicas + detalle [plan, estado, trial, password, pagos, extras, WhatsApp], leads, planes-suscripción) + login dual con redirección por rol | ✅ Hecho |
| **3** | **Migrar el resto de vistas del frontend** | ✅ **Hecho** |

> **Backend 100% portado** y **frontend 100% portado** (Etapa 3 completa). Todas
> las rutas del monolito (`/api/*`) tienen su equivalente en `/api/v1/*` y todas
> las vistas tienen su equivalente SPA. Falta la Etapa 4 (QA) y la 5 (cutover).
| 4-1 | QA: matriz de paridad (endpoints + páginas) → `docs/parity-matrix.md` | ✅ Hecho |
| 4-2 | QA: arnés Vitest + lógica pura (billing/overlap/estados/crypto) + smoke HTTP sin DB | ✅ Hecho |
| 4-3 | QA: integración con DB sqlite efímera (multi-tenant + auth + doble reserva) | ✅ Hecho |
| 4-4 | QA: contrato FE↔BE (`test:contract`) + checklist E2E (`docs/qa-checklist.md`) | ✅ Hecho |
| 4-5 | QA: informe de paridad + go/no-go → `docs/qa-report.md` | ✅ Hecho |
| **4** | **Paridad funcional + QA exhaustivo** (70/70 tests verdes; GO condicional) | ✅ **Hecho** |
| 5-1 | Backend deploy-ready (railway.json, postinstall prisma, tsx/prisma runtime, trust proxy, .env.example) | ✅ Hecho |
| 5-2 | Frontend deploy-ready (server.mjs estático + fallback SPA, code-split, VITE_API_URL, railway.json) | ✅ Hecho |
| 5-3 | Runbook de cutover (`docs/cutover.md`): Railway + DNS + validación + rollback + retiro monolito | ✅ Hecho |
| 5-4 | **Ejecución del cutover** (crear servicios, env, dominios, DNS, retirar monolito) | ⏳ Manual (Railway + DNS) |

> Hasta la etapa 5, **producción sigue en el monolito**. El nuevo stack se
> desarrolla en paralelo sin afectar a las clínicas en uso.

## Desarrollo local

```bash
# Backend  (http://localhost:4000)
cd backend && npm install && npm run prisma:generate && npm run dev

# Frontend (http://localhost:5173, proxya /api al backend)
cd frontend && npm install && npm run dev
```

Variables del backend: ver `backend/.env.example`.

## Riesgos y mitigaciones

- **Divergencia de schema** entre monolito y backend → `npm run prisma:sync` y, al
  cutover, el backend pasa a ser el dueño único del schema.
- **Reescritura de UI**: las 26 páginas server del monolito se rehacen como vistas
  SPA por etapas; no hay big-bang.
- **Auth/multi-tenant**: reimplementados con la misma semántica y verificados
  endpoint por endpoint antes del cutover.
- **Costo/infra**: el cutover implica 2 servicios + CORS; documentado en etapa 5.
