# Dental Platform — Contexto completo del proyecto

> Última revisión: **2026-05-12**
> Documento de referencia largo. Para una guía operativa rápida, ver `CLAUDE.md` en la raíz.

---

## 1. Qué es esta plataforma

Sistema interno de gestión clínica para **Clínica Dental Digital-Dent**, ubicada en **Temuco, Chile**.
Es una herramienta operativa para el día a día de la clínica: registrar pacientes y su historial clínico, agendar y confirmar citas, levantar presupuestos con prestaciones del arancel chileno, cobrar consultas, liquidar pagos a doctores tratantes y administrar al equipo.

**Tipo:** SaaS interno, single-tenant (una clínica, una base de datos).
**Usuarios objetivo:** administrador de clínica, doctores tratantes, staff de recepción.
**Idioma:** español de Chile.
**Moneda:** CLP (pesos chilenos), formateados con separador miles `.` (`$29.900`).

---

## 2. Qué problema resuelve

La operación dental tradicional combina papel, Excel y software fragmentado. Este sistema unifica:

| Problema previo                                                    | Solución en la plataforma                                  |
| ------------------------------------------------------------------ | ---------------------------------------------------------- |
| Agenda en papel/Google Calendar sin trazabilidad                    | Módulo Agenda con FullCalendar + log de cambios por cita   |
| Fichas clínicas físicas, sin odontograma digital                    | Ficha clínica + odontograma interactivo por paciente       |
| Presupuestos en Word, sin numeración correlativa                    | Presupuestos con número único, items vinculados a prestaciones |
| Cobros sin trazabilidad de medio de pago ni comisión                | Cobros con `medioPago`, comisión calculada, recibo asociado |
| Liquidación de doctores a mano, sujeta a errores                    | Liquidaciones por período con contrato (porcentaje/monto fijo) |
| Arancel desactualizado y poco accesible                             | 764 prestaciones cargadas vía seed automático en cada build |
| Confirmación de citas por WhatsApp manual                           | Flag `confirmadoWA` + plantilla de mensaje configurable    |

---

## 3. Stack y arquitectura

### 3.1 Arquitectura general

**Aplicación monolítica Next.js** desplegada en Vercel. No hay separación física entre frontend y backend: ambos viven en la misma base de código.

```
Navegador
   │
   │ HTTPS
   ▼
Vercel Edge / Node Runtime
   │
   ├── Next.js Server Components ───► Prisma ───► PostgreSQL (Neon)
   ├── API routes (app/api/*)     ───► Prisma ───► PostgreSQL (Neon)
   ├── NextAuth (Credentials/JWT)
   └── React Client Components (interacción)
```

- **Frontend** = React 19 + Server Components + Client Components (`'use client'`) + Tailwind 4.
- **Backend** = API routes en `app/api/*/route.ts` (REST-ish) + lógica directamente en Server Components que consultan Prisma.
- **Base de datos** = PostgreSQL en Neon (Vercel Postgres compatible). Schema gestionado por Prisma.
- **Autenticación** = NextAuth con Credentials Provider, sesión JWT, password hasheado con bcryptjs.
- **Middleware** = `proxy.ts` con matcher global que redirige a `/login` cualquier request sin sesión, excepto `/api/auth/*` y la página de login.

### 3.2 Build de Vercel

Definido en `package.json → scripts.build`:

```
prisma db push --accept-data-loss
&& prisma generate
&& ts-node --transpile-only prisma/seed-aranceles.ts
&& next build
```

Esto significa que **cada deploy**:
1. Sincroniza el schema con la DB (puede destruir columnas eliminadas — cuidado al editar `schema.prisma`).
2. Regenera el cliente Prisma.
3. Corre el seed de aranceles (764 prestaciones, idempotente con `skipDuplicates`).
4. Hace el build de Next.

### 3.3 Stack completo

Ver `CLAUDE.md §3` para la tabla. Resumen:

- Next.js **16.2.4** / React **19.2.4** / TypeScript **5**
- Prisma **5.22** / PostgreSQL
- NextAuth **4.24** / bcryptjs **3**
- Tailwind **4** / Radix UI / lucide-react / class-variance-authority
- FullCalendar **6** / react-hook-form **7** / zod **4** / date-fns **4** / recharts **3**

---

## 4. Estructura de carpetas

```
dental-platform/
├── app/
│   ├── (auth)/login/page.tsx              # Login (público)
│   ├── (dashboard)/                       # Grupo de rutas protegido
│   │   ├── layout.tsx                     # Carga Configuracion singleton, renderiza TopBar
│   │   ├── page.tsx                       # redirect('/agenda')
│   │   ├── agenda/                        # Calendario citas
│   │   ├── pacientes/                     # Listado + ficha [id] con odontograma
│   │   ├── presupuestos/
│   │   ├── cobros/
│   │   ├── prestaciones/                  # CRUD de aranceles
│   │   ├── usuarios/                      # "Equipo" en UI (doctores/staff)
│   │   ├── liquidaciones/
│   │   └── configuracion/
│   ├── api/                               # Backend
│   │   ├── auth/[...nextauth]/route.ts
│   │   ├── pacientes/route.ts, [id]/route.ts
│   │   ├── citas/route.ts, [id]/route.ts
│   │   ├── presupuestos/route.ts, [id]/route.ts
│   │   ├── tratamientos/route.ts, [id]/route.ts
│   │   ├── prestaciones/route.ts, [id]/route.ts
│   │   ├── cobros/route.ts, [id]/route.ts
│   │   ├── medios-pago/route.ts, [id]/route.ts
│   │   ├── contratos/route.ts, [id]/route.ts
│   │   ├── liquidaciones/route.ts, [id]/route.ts
│   │   ├── horarios/route.ts
│   │   ├── odontograma/route.ts
│   │   ├── usuarios/route.ts, [id]/route.ts
│   │   ├── configuracion/route.ts
│   │   └── dashboard/route.ts
│   ├── print/                             # Vistas imprimibles
│   │   ├── presupuesto/page.tsx
│   │   ├── plan/page.tsx
│   │   └── liquidacion/page.tsx
│   ├── layout.tsx                         # Root layout (HTML + SessionProvider)
│   └── providers.tsx                      # SessionProvider de NextAuth
├── components/
│   ├── TopBar.tsx                         # Nav superior fija (8 ítems)
│   ├── Sidebar.tsx                        # (legacy, no usado actualmente en dashboard)
│   ├── Odontograma.tsx                    # Grilla 32 dientes interactiva
│   ├── OdontogramaSelector.tsx
│   └── PlanTratamiento.tsx
├── lib/
│   ├── prisma.ts                          # Singleton PrismaClient
│   ├── auth.ts                            # authOptions de NextAuth
│   └── utils.ts                           # cn() helper
├── prisma/
│   ├── schema.prisma                      # 18 modelos
│   ├── seed.ts                            # Admin + 12 prestaciones base (manual)
│   └── seed-aranceles.ts                  # 764 prestaciones (corre en cada build)
├── public/
├── proxy.ts                               # Middleware NextAuth (protege todo)
├── docs/                                  # ESTE DIRECTORIO
└── package.json
```

---

## 5. Modelos de datos (Prisma)

Schema en `prisma/schema.prisma`. **18 modelos** organizados así:

### 5.1 Autenticación y usuarios

- **`User`** — administradores, doctores, staff. Campos clave: `email` (único), `password` (bcrypt), `role` (`admin`|`doctor`|`staff`), `rut`, `especialidad`, `puedeRecibirPagos`. Relaciona con `Cita` (DoctorCitas), `Tratamiento` (DoctorTratamientos), `Contrato`, `Liquidacion`, `HorarioDoctor`, `Cobro` (CobroUsuario).
- **`Session`** — sesiones NextAuth (aunque uso JWT, está modelado).

### 5.2 Pacientes y ficha clínica

- **`Paciente`** — `rut` único, datos personales, previsión, alergias, antecedentes. Relaciona con `Cita`, `FichaClinica` (1:1), `Presupuesto`, `Cobro`.
- **`FichaClinica`** — 1:1 con paciente. Flags clínicos (fumador, embarazada, diabético…), medicamentos, notas. Contiene `Tratamiento[]` y `Diente[]` (odontograma).
- **`Diente`** — un registro por (ficha × número × cara). Estado y color para representar visualmente.

### 5.3 Agenda

- **`Cita`** — paciente × doctor × fecha. Estado (`PENDIENTE`/etc), duración, sala, flag `confirmadoWA`.
- **`CitaLog`** — historial de cambios por cita (tipo: `AGENDADA` | `ESTADO` | `WA_ENVIADO`).
- **`HorarioDoctor`** — bloque semanal por doctor (`@@unique([doctorId, diaSemana])`).

### 5.4 Prestaciones y tratamientos

- **`Prestacion`** — catálogo (arancel). 764 ítems cargados por seed automático. Campos: `nombre`, `precio` (Float CLP entero), `categoria`, `duracion`, `activo`.
- **`Tratamiento`** — instancia de prestación aplicada a un paciente (vía `FichaClinica`). Tiene `estado` (`PLANIFICADO`/etc), `diente`, `cara`, `doctor`, `fechaCompletado`. Es el origen de las liquidaciones y cobros.

### 5.5 Presupuestos

- **`Presupuesto`** — encabezado, `numero` único autoincremental, `total`, `estado`, `vigencia`.
- **`ItemPresupuesto`** — línea con cantidad, precio unitario, descuento, subtotal.

### 5.6 Cobros

- **`MedioPago`** — efectivo, débito, crédito, transferencia, etc. Tiene `comision` (porcentaje).
- **`Cobro`** — `numero` único, paciente, `monto` bruto, `montoNeto`, `comisionMonto`, `estado`, `medioPagoId`, `reciboUsuarioId` (quién recibió el pago).
- **`CobroItem`** — desglose por tratamiento o concepto libre.

### 5.7 Contratos y liquidaciones de doctores

- **`Contrato`** — relación clínica ↔ doctor. `tipo` = `PORCENTAJE` o `MONTO_FIJO`. Define cómo se calculan sus pagos.
- **`Liquidacion`** — por período (`YYYY-MM`), agrega tratamientos completados del doctor. Estados: `BORRADOR` → `APROBADA` → `PAGADA`.
- **`LiquidacionItem`** — congela el cálculo de cada tratamiento liquidado.

### 5.8 Configuración

- **`Configuracion`** — singleton (`id = "singleton"`). Datos de la clínica (nombre, dirección, teléfono, email, ciudad), `logoUrl` (data URL base64), plantilla de mensaje WhatsApp con placeholders `{nombre}`, `{fecha}`, `{clinica}`, `{direccion}`.

---

## 6. Flujo de funcionamiento

### Flujo principal (ciclo de paciente)

```
1. Recepción crea Paciente (RUT, datos)
2. Recepción agenda Cita (paciente × doctor × fecha)
   └─ se crea CitaLog (AGENDADA)
3. Doctor abre FichaClinica del paciente
   ├─ marca dientes en el Odontograma
   ├─ registra Tratamiento(s) PLANIFICADO
   └─ guarda observaciones
4. Recepción/Doctor genera Presupuesto
   └─ ItemPresupuesto por cada Prestacion sugerida
5. Paciente acepta → Tratamiento(s) pasan a CONFIRMADO
6. Tratamiento se ejecuta → estado COMPLETADO + fechaCompletado
7. Recepción genera Cobro vinculando tratamiento(s)
   └─ CobroItem por línea, comisión según MedioPago
8. Al cierre del mes, Liquidacion del doctor agrega sus
   tratamientos COMPLETADOS según su Contrato (% o monto fijo)
```

### Flujo de autenticación

```
Usuario → /login → POST /api/auth/callback/credentials
        → NextAuth valida con bcrypt
        → emite JWT con { id, email, role }
        → cookie httpOnly
        → proxy.ts revisa cookie en cada request
        → si no hay sesión → redirect /login
```

---

## 7. Decisiones técnicas importantes ya tomadas

| Decisión                                                                | Razón                                                                          |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Next.js App Router + Server Components**                              | Reduce JS al cliente, queries Prisma directas en `page.tsx`                    |
| **Patrón `page.tsx` (server) → `*-client.tsx` (client)**                | Server obtiene datos serializados, Client maneja interacción                   |
| **`export const dynamic = 'force-dynamic'` en todo el dashboard**       | Evita caché y datos obsoletos                                                  |
| **Prisma + PostgreSQL en Neon**                                         | Free tier, autoescala, compatible con Vercel                                   |
| **Build incluye `prisma db push --accept-data-loss`**                   | Auto-migración en cada deploy. ⚠️ Renombrar columna = perderla                |
| **`seed-aranceles.ts` corre en cada build**                             | El arancel completo siempre está sincronizado en producción                    |
| **NextAuth con JWT (no DB sessions)**                                   | Menos queries, suficiente para clínica pequeña                                 |
| **Middleware `proxy.ts` con matcher global**                            | Modelo "deny by default": cualquier ruta no listada como pública exige sesión |
| **Configuracion como singleton (`id = "singleton"`)**                   | Una sola clínica, evita lookup por id                                          |
| **Dinero como `Float` (CLP enteros)**                                   | CLP no tiene decimales; suficiente para el rango de precios                    |
| **TopBar fijo de 60px con 8 ítems**                                     | UX deseada por el usuario                                                       |
| **`numero` autoincremental manual** en Presupuesto/Cobro                | Permite reiniciar/migrar más fácil que usar autoincrement de DB                |

---

## 8. Funcionalidades

### 8.1 Funcionalidades terminadas y en producción

- ✅ Login + middleware de protección global.
- ✅ CRUD Pacientes con ficha clínica + odontograma + tratamientos.
- ✅ CRUD Citas + agenda visual (FullCalendar) + horarios por doctor + log.
- ✅ CRUD Prestaciones con 764 ítems precargados desde arancel real.
- ✅ CRUD Presupuestos con items, descuentos y vista imprimible.
- ✅ CRUD Cobros con medios de pago, comisiones y recibo.
- ✅ CRUD Usuarios/Equipo (admin/doctor/staff) con `puedeRecibirPagos`.
- ✅ Liquidaciones por doctor con contratos (% o monto fijo) y vista imprimible.
- ✅ Configuración de clínica (datos, logo, plantilla WA).
- ✅ Seed automático del arancel en cada deploy de Vercel.

### 8.2 Funcionalidades parcialmente implementadas

- ⚠️ **Confirmación por WhatsApp**: existe el flag `Cita.confirmadoWA` y la plantilla en `Configuracion.mensajeWA`, pero la integración con un proveedor (Twilio, WhatsApp Business API, etc.) **no está hecha**. Hoy es un toggle manual.
- ⚠️ **Dashboard `/api/dashboard`**: existe el endpoint pero la página `/` solo hace `redirect('/agenda')`. No hay panel de KPIs implementado.

### 8.3 Funcionalidades planificadas (no iniciadas)

- 📋 **Importar pacientes desde Excel/CSV** en `/pacientes` (botón "Importar archivo").
- 📋 **Descargar plantilla base** de pacientes (columnas: Nombres, Apellidos, Teléfono, Dirección, Correo, RUT, Fecha de Nacimiento).
- 📋 **Exportar pacientes a Excel** (descarga de la base actual).
- 📋 Recordatorios automáticos de citas (WA / email).
- 📋 Reportes financieros (recharts ya está instalado, pero sin vistas).
- 📋 Multi-clínica (hoy es single-tenant).
- 📋 Backup automático fuera de Neon.

---

## 9. Puntos delicados (no romper)

1. **`schema.prisma` + `prisma db push --accept-data-loss`** → cualquier renombrado/eliminación de columna en el schema **borra datos en prod** al desplegar. Si necesitas renombrar, hazlo en dos pasos: añadir nueva, migrar datos, eliminar vieja.
2. **`seed-aranceles.ts`** debe seguir siendo **idempotente** (`skipDuplicates: true`). Si lo rompes, el build de Vercel falla y no hay deploy.
3. **`proxy.ts` matcher global**: si añades una ruta pública nueva (callback de pago, webhook), debe excluirse explícitamente o el middleware la bloqueará.
4. **`Configuracion` es singleton**. No usar `create` simple, usar `upsert({ where: { id: 'singleton' } })`. Ya está implementado así en `(dashboard)/layout.tsx`.
5. **`numero` único en Presupuesto/Cobro**: si lo asignas, calcula `max(numero) + 1` dentro de una transacción o aceptarás colisiones bajo concurrencia.
6. **`Diente` tiene `@@unique([fichaId, numero, cara])`**: si la cara es `null`, PostgreSQL la trata como distinta cada vez (NULLs no son iguales). Sé explícito con un string vacío `""` o gestiona el caso.
7. **Estado de `Cita`/`Tratamiento`/`Presupuesto`/`Cobro`/`Liquidacion`** son strings libres. No hay enum de Prisma. Si introduces un nuevo estado, busca en todo el código antes para no romper filtros.
8. **`Configuracion.logoUrl` es data URL base64**. Subir imágenes grandes infla la respuesta del layout. Mantener ≤ 100KB.
9. **`Tratamiento.precio`** se **congela** en el momento de crearse (no se referencia `Prestacion.precio` en runtime). Igual para `LiquidacionItem.precioTratamiento`. Esto es **intencional** para no afectar liquidaciones pasadas al cambiar el arancel.
10. **Windows + PowerShell 5.1**: comandos sin `&&`, sin `2>&1` para nativos, sin esperar `npx`/`git` en PATH. Usar rutas completas a `node.exe` y `git.exe`.

---

## 10. Entorno de desarrollo

- **OS:** Windows 10 Pro.
- **Node:** `C:\Program Files\nodejs\node.exe`.
- **Git:** `C:\Program Files\Git\bin\git.exe`.
- **Repo:** GitHub, rama `master`, auto-deploy a Vercel.
- **Variables de entorno producción** (Vercel):
  - `DATABASE_URL` — Postgres de Neon
  - `NEXTAUTH_SECRET` — string aleatorio 32+ chars
  - `NEXTAUTH_URL` — dominio Vercel
  - `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` — sólo para el seed inicial
- **`.env` local** puede usar SQLite (`DATABASE_URL="file:./dev.db"`) para algunas pruebas, **pero el schema requiere `postgresql://`** — el seed local fallará a menos que apuntes a la DB de prod o uses una Postgres local.

---

## 11. Decisiones pendientes / abiertas

- ¿Mantener `seed-aranceles.ts` en cada build o moverlo a un script manual una vez estabilizado?
- ¿Migrar de Float a Int para dinero?
- Integración WhatsApp real: ¿Twilio, WhatsApp Business API, Z-API?
- ¿Implementar dashboard KPI en `/` con recharts?

---

## 12. Roadmap a SaaS (decisiones firmes)

El proyecto deja de ser una herramienta single-tenant para convertirse en un **SaaS multi-tenant** que se va a vender a múltiples clínicas. Plan firmado con el usuario el 2026-05-13:

### Destino final del hosting

**Hetzner VPS todo-en-uno** (~$14/mes total). Una sola factura, almacenamiento propio para radiografías y documentos.

```
Hetzner CCX13 (2 vCPU, 8 GB RAM, 80 GB SSD)
├── Next.js (Node.js + PM2)
├── PostgreSQL local
├── Almacenamiento de archivos en disco
├── Nginx + Let's Encrypt
└── Backups automáticos a Backblaze B2 (~$0,6/mes)
```

**Bluehost** (que ya está contratado) se reutiliza para la **landing pública** en `digital-dent.cl` (WordPress, marketing, blog SEO). Subdominio `app.digital-dent.cl` apunta al VPS.

### Fases de construcción

1. **Multi-tenancy** — modelo `Clinica`, scope de datos, onboarding "Crear nueva clínica". (Fase actual)
2. **Módulo de archivos** — radiografías, documentos clínicos.
3. **Migración a Hetzner** — última fase, ya con todo estable en Vercel.
4. **Pasarela de pagos** — Stripe / Khipu / MercadoPago para cobrar suscripciones.

### Por qué este orden

Multi-tenancy primero porque es el cambio más invasivo del schema. Hacerlo después de tener clientes reales mezclaría datos. Hetzner al final para no mezclar dos cambios grandes (refactor lógico + cambio de infraestructura) al mismo tiempo.
