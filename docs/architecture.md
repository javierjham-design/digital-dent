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
| 3 | Migrar el resto de vistas del frontend (ficha clínica + odontograma, presupuestos, cobros, super-admin, configuración) | ⏳ Pendiente |

> **Backend 100% portado.** Todas las rutas del monolito (`/api/*`) tienen su
> equivalente en `/api/v1/*`. Falta la Etapa 3 (frontend) y la 5 (cutover).
| 4 | Paridad funcional + QA exhaustivo contra el monolito | ⏳ Pendiente |
| 5 | **Cutover**: 2 servicios en Railway (backend + frontend), DNS, retirar el monolito | ⏳ Pendiente |

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
