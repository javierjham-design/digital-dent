@AGENTS.md

# Dental Platform — Guía de sesión para Claude

> Léeme primero. Soy una guía corta y operativa. Si necesitas profundidad, ve a `docs/PROJECT_CONTEXT.md`.

## 1. Objetivo general

Plataforma SaaS interna de gestión para **Clínica Dental Digital-Dent** (Temuco, Chile).
Cubre: agenda de citas, fichas clínicas con odontograma, presupuestos, prestaciones, cobros, liquidaciones de doctores y configuración de clínica.

## 2. Arquitectura (resumen)

App **monolítica Next.js 16 App Router** desplegada en Vercel.
Una sola base de código contiene frontend (React Server/Client Components) y backend (API routes en `app/api/*`).
Persistencia en **PostgreSQL** (Neon / Vercel Postgres) vía **Prisma 5**.
Autenticación con **NextAuth (Credentials + JWT)**, protegida por el middleware `proxy.ts` (matcher global, redirige a `/login` si no hay sesión).
Build de Vercel: `prisma db push --accept-data-loss && prisma generate && ts-node --transpile-only prisma/seed-aranceles.ts && next build`.

## 3. Stack tecnológico real

| Capa            | Tecnología                                                        |
| --------------- | ----------------------------------------------------------------- |
| Framework       | Next.js **16.2.4** (App Router) + React **19.2.4** + TS **5**     |
| Estilos         | Tailwind CSS **4**, Radix UI primitives, `class-variance-authority`, `clsx`, `tailwind-merge` |
| Auth            | next-auth **4.24** (Credentials provider, JWT), bcryptjs          |
| ORM / DB        | Prisma **5.22** + PostgreSQL (prod) / SQLite (dev local opcional) |
| Calendario      | FullCalendar 6 (`daygrid`, `timegrid`, `interaction`, `react`)    |
| Formularios     | react-hook-form 7 + zod 4 + @hookform/resolvers                   |
| Gráficos        | recharts 3                                                        |
| Fechas          | date-fns 4                                                        |
| Iconos          | lucide-react                                                      |
| Hosting         | Vercel (auto-deploy desde GitHub `master`)                        |

## 4. Estructura del proyecto

```
dental-platform/
├── app/
│   ├── (auth)/login/                # Login público
│   ├── (dashboard)/                 # Layout protegido con TopBar
│   │   ├── agenda/                  # Calendario FullCalendar
│   │   ├── pacientes/               # Listado + ficha [id] con odontograma
│   │   ├── presupuestos/
│   │   ├── cobros/
│   │   ├── prestaciones/
│   │   ├── usuarios/                # "Equipo" en UI
│   │   ├── liquidaciones/
│   │   └── configuracion/
│   ├── api/                         # API routes (backend)
│   │   ├── auth/[...nextauth]/
│   │   ├── pacientes/[id?]/
│   │   ├── citas/[id?]/
│   │   ├── presupuestos/[id?]/
│   │   ├── tratamientos/[id?]/
│   │   ├── prestaciones/[id?]/
│   │   ├── cobros/[id?]/
│   │   ├── medios-pago/[id?]/
│   │   ├── contratos/[id?]/
│   │   ├── liquidaciones/[id?]/
│   │   ├── horarios/
│   │   ├── odontograma/
│   │   ├── usuarios/[id?]/
│   │   ├── configuracion/
│   │   └── dashboard/
│   ├── print/                       # Vistas imprimibles (presupuesto, plan, liquidación)
│   ├── layout.tsx                   # Root
│   └── providers.tsx                # SessionProvider
├── components/                      # TopBar, Sidebar, Odontograma, PlanTratamiento, etc.
├── lib/                             # prisma.ts, auth.ts, utils.ts
├── prisma/
│   ├── schema.prisma                # 18 modelos
│   ├── seed.ts                      # Admin + 12 prestaciones base
│   └── seed-aranceles.ts            # 764 prestaciones idempotente
├── public/
├── proxy.ts                         # Middleware NextAuth
└── docs/                            # Contexto de continuidad (leer al inicio)
```

## 5. Convenciones de código

- **Server Component por defecto.** Sólo añadir `'use client'` cuando se requiera estado / efectos / hooks de React.
- **Páginas dinámicas:** todas las páginas del dashboard usan `export const dynamic = 'force-dynamic'` para evitar caché agresiva.
- **Patrón página → cliente:** `page.tsx` (Server) consulta Prisma → pasa props serializadas → `*-client.tsx` (Client) renderiza UI interactiva.
- **Imports con alias `@/*`** (configurado en `tsconfig.json`).
- **Prisma singleton** vía `lib/prisma.ts` (no instanciar `PrismaClient` directo).
- **Auth en API routes:** validar sesión con `getServerSession(authOptions)`. Para acciones admin chequear `session.user.role === 'admin'`.
- **Fechas a UI:** serializar con `.toISOString()` en el server, parsear en cliente con `date-fns`.
- **Dinero:** se almacena como `Float` (CLP enteros). UI formatea como `$1.234.567` (separador miles `.`).
- **Idioma de la UI y modelos:** español Chile. Mantén nombres de campos consistentes (`pacienteId`, `nombre`, `apellido`, `rut`, etc.).
- **Comentarios:** mínimos. El código bien nombrado documenta lo que hace.

## 6. Reglas para NO romper funcionalidades existentes

1. **No cambiar `schema.prisma` sin documentarlo** en `docs/AI_CHANGELOG.md`. Cada cambio dispara `prisma db push --accept-data-loss` en Vercel — un campo mal renombrado **destruye datos en producción**.
2. **No tocar `proxy.ts`** salvo para añadir rutas públicas. El matcher global es lo único que protege todo el dashboard.
3. **No introducir nuevas dependencias pesadas** sin necesidad. Antes de instalar `xlsx`, `puppeteer`, etc., revisa si Next o un módulo ya existente lo resuelve.
4. **El seed `seed-aranceles.ts` corre en cada build.** Mantenlo idempotente (`skipDuplicates: true` o `findFirst` antes de crear).
5. **`Configuracion` es un singleton** (`id = "singleton"`). Nunca crear segundo registro.
6. **El campo `numero` en `Presupuesto` y `Cobro` es `@unique` autoincremental manual.** Al crear nuevos registros, calcular `max(numero) + 1`.
7. **Categorías de prestaciones** vienen del arancel real (24 categorías). No inventar categorías.
8. **Antes de eliminar un endpoint o componente**, busca usos con Grep en todo `app/` y `components/`.
9. **Next.js 16 trae breaking changes**: antes de usar APIs avanzadas (cache, headers, params async, etc.) revisa `node_modules/next/dist/docs/` o documentación oficial. **No confíes en patrones de Next 13/14.**
10. **Windows + PowerShell 5.1**: no usar `&&`, ni redirigir stderr de ejecutables nativos (`2>&1`), ni esperar `npx`/`git` en PATH (rutas completas: `C:\Program Files\nodejs\node.exe`, `C:\Program Files\Git\bin\git.exe`).

## 7. Reglas de continuidad (OBLIGATORIO)

### Antes de cambios grandes

> **Si la tarea toca más de 1 módulo, modifica el schema, o introduce una nueva dependencia: PRIMERO lee `docs/PROJECT_CONTEXT.md` y `docs/PROJECT_STATUS.md`.**
> No empieces a editar sin haberlo hecho. Estos documentos contienen decisiones técnicas ya tomadas y trabajo en curso que NO debes duplicar ni romper.

### Al cerrar una tarea importante

> **Después de completar cualquier tarea no trivial, actualiza estos archivos:**
> - `docs/AI_CHANGELOG.md` → añade una entrada nueva al inicio con fecha, archivos tocados, riesgos y pendientes.
> - `docs/PROJECT_STATUS.md` → mueve lo que se completó al bloque "Funcionando hoy", ajusta "Próximos pasos".
> - `docs/SESSION_HANDOFF.md` → sobrescribe con el estado real de fin de sesión, para que la próxima sesión retome sin contexto previo.
> - `docs/PROJECT_CONTEXT.md` → sólo si cambió la arquitectura, el stack o una decisión técnica de alto nivel.

### Antes de hacer `/compact` o cerrar la sesión

> Actualiza `docs/SESSION_HANDOFF.md` **siempre**. Es el primer archivo que la próxima sesión leerá.

## 8. Comandos útiles

```powershell
# Dev local
npm run dev                              # next dev (puerto 3000)

# Base de datos
npm run db:push                          # prisma db push (sincroniza schema)
npm run db:seed                          # corre prisma/seed.ts (admin + 12 prestaciones)

# Build local (replica el de Vercel)
npm run build

# Git (ruta completa porque no está en PATH)
& "C:\Program Files\Git\bin\git.exe" status
& "C:\Program Files\Git\bin\git.exe" add -A
& "C:\Program Files\Git\bin\git.exe" commit -m "..."
& "C:\Program Files\Git\bin\git.exe" push
```

## 9. Información que NO debes pedir

- **Cliente:** Clínica Dental Digital-Dent, Temuco, Chile.
- **Idioma:** español Chile.
- **Moneda:** CLP, formato `$1.234.567`.
- **RUT:** formato chileno (con DV).
- **Hosting:** Vercel + Neon Postgres.
- **Repo:** GitHub, rama `master`, auto-deploy.
- **Modo de trabajo:** el usuario autorizó operación autónoma; no pedir confirmación para tareas claras.
