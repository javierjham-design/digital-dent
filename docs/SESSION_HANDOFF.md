# Session Handoff

> **Lee este archivo PRIMERO al iniciar una sesión.** Resume exactamente dónde quedó el trabajo, sin depender del historial de chat anterior.

---

## Última actualización

- **Fecha:** 2026-05-14
- **Sesión:** larga. Migración Neon → Railway + arquitectura multi-tenant por subdominio + login dual + cambio forzado de contraseña.

---

## Qué se hizo en esta sesión

1. **Migración Neon → Railway completada.**
   - Dump 2.98 MB → restore: 6548 pacientes, 4596 prestaciones, 1 clínica (digital-dent), 3 users.
   - App corriendo en `https://digital-dent-production.up.railway.app`.
   - Aprendizaje: Railway usa puerto 8080 por defecto (no 3000). Build de Railway: `prisma generate && next build` (sin db push — db push se ejecuta manual cuando hace falta).

2. **Multi-tenancy por subdominio + path fallback.**
   - `proxy.ts` detecta `cumbres.tudominio.cl` (si `PLATFORM_DOMAIN` está set) o `/c/cumbres/...` (siempre). Inyecta `x-clinica-slug` header.
   - `lib/auth.ts` ahora hace login dual: `slug+username+password` (clínica) o `email+password` (super-admin / legacy).
   - JWT añade `requirePasswordChange` cuando `passwordChangedAt` es null.
   - Schema: `User.email` ahora opcional, +`username String?`, +`passwordChangedAt DateTime?`, `@@unique([clinicaId, username])`.

3. **Auto-creación de Administrador por clínica.**
   - Al crear una clínica en `/digital-dent-super-admin/clinicas/nueva`, la plataforma genera automáticamente un usuario `Administrador` con clave `ADMIN22` y `passwordChangedAt=null`.
   - El primer login fuerza redirect a `/cambiar-password`.
   - Página `/cambiar-password` + endpoint `/api/auth/cambiar-password` + `signOut` para refrescar JWT tras el cambio.

4. **Eliminado registro público.** `/registro` y `/api/clinicas` borrados; sólo super-admin crea clínicas.

5. **Aplicado `db push` contra Railway** y creado `Administrador` para la clínica `digital-dent` existente (vía `prisma/seed-admin-existing-clinics.ts`).

6. **Documentación de DNS:** `docs/DNS_SETUP.md` con guía completa de wildcard, `PLATFORM_DOMAIN`, modo path vs subdominio, checklist de migración.

---

## Cómo entra cada clínica HOY (modo path, sin dominio aún)

- **Super-admin:** `https://digital-dent-production.up.railway.app/login` con `admin@digitaldent.cl` / `Clinica22DD**`.
- **Clínica `digital-dent`:** `https://digital-dent-production.up.railway.app/c/digital-dent/login` con `Administrador` / `ADMIN22` (debe cambiar al primer login).
- **Nueva clínica (cuando el super-admin la crea):** se le muestra la URL `/c/<slug>/login` con usuario `Administrador` y password `ADMIN22`.

Cuando exista dominio propio: ver `docs/DNS_SETUP.md` paso a paso.

---

## Qué quedó pendiente

### Pendiente inmediato

- [ ] **Apagar Vercel y rotar credenciales de Neon.** La plataforma vive 100% en Railway ahora. Las DB credentials de Neon siguen en el .env de Vercel — riesgo de exposición.
- [ ] **Reiniciar dev server local.** Esta sesión lo terminó para liberar el `query_engine-windows.dll.node` y poder regenerar Prisma. Hay que volver a levantarlo con `npm run dev`.
- [ ] **Comprar dominio y configurar wildcard** cuando esté listo (ver `docs/DNS_SETUP.md`).

### Mejoras del módulo multi-tenant

- [ ] Validación de slug en super-admin: avisar si el slug colisiona con un subdominio reservado (`www`, `app`, `api`, `admin`, etc.).
- [ ] Modo "impersonar" — super-admin entra como admin de cualquier clínica sin saber su password.
- [ ] Botón "extender trial X días" en detalle de clínica.
- [ ] Métrica "último login" por clínica.

### Fase 2 — Módulo de archivos (radiografías)

- Modelo `Archivo` (clinicaId, pacienteId, tratamientoId opcional).
- Endpoint upload con validación de tamaño.
- UI en ficha clínica para subir/visualizar.
- Decisión técnica: dónde guardar (Railway volume vs Cloudflare R2).

### Fase 4 — Pasarela de pagos (Stripe / Khipu / MercadoPago)

---

## Archivos clave modificados esta sesión

- `proxy.ts` — middleware de detección de tenant.
- `prisma/schema.prisma` — User multi-tenant (username, passwordChangedAt, email opcional).
- `lib/auth.ts` — login dual + `requirePasswordChange`.
- `lib/clinica-context.ts` — helper `getClinicaSlugFromContext()`.
- `app/(auth)/login/page.tsx` + `login-client.tsx` — formulario adaptativo.
- `app/api/admin/clinicas/route.ts` — auto-crea Administrador.
- `app/digital-dent-super-admin/clinicas/nueva/page.tsx` — formulario + UI de credenciales.
- `app/(dashboard)/layout.tsx` — redirige a `/cambiar-password`.
- `app/cambiar-password/page.tsx` + `app/api/auth/cambiar-password/route.ts`.
- `prisma/seed-admin-existing-clinics.ts` — script idempotente.
- `docs/DNS_SETUP.md` — guía de DNS.
- Eliminados: `app/(auth)/registro/`, `app/api/clinicas/`.

---

## Qué debe hacer la próxima sesión

### Paso 1 — Cargar contexto

1. `CLAUDE.md`
2. Este `docs/SESSION_HANDOFF.md`
3. `docs/DNS_SETUP.md` si la tarea toca dominios.
4. `docs/PROJECT_STATUS.md` para estado general.

### Paso 2 — Verificar que la app sigue operativa

- `https://digital-dent-production.up.railway.app/login` → carga.
- Login con `admin@digitaldent.cl` / `Clinica22DD**` → entra al panel super-admin.
- Crear una clínica de prueba → verificar que aparecen las credenciales.
- Entrar a `https://digital-dent-production.up.railway.app/c/<slug-de-prueba>/login` con `Administrador` / `ADMIN22` → debe redirigir a `/cambiar-password`.

### Paso 3 — Decidir próxima tarea con el usuario

Opciones probables (orden tentativo):
- Apagar Vercel + rotar Neon.
- Comprar dominio y configurar wildcard.
- Validación de slug reservado en super-admin.
- Modo impersonar.
- Fase 2: módulo de archivos / radiografías.

---

## Información clave que no debes pedir de nuevo

- **Cliente:** Clínica Dental Digital-Dent, Temuco, Chile (también es la clínica plantilla del SaaS).
- **Nombre comercial de la plataforma:** PENDIENTE. Por ahora "Plataforma Dental" como placeholder. El usuario tiene una idea pero busca un nombre definitivo.
- **URL del panel super-admin:** `/digital-dent-super-admin`.
- **Hosting:** Railway (`digital-dent-production.up.railway.app`). Puerto 8080. Postgres incluido.
- **Repo:** GitHub `javierjham-design/digital-dent`, rama `master`, auto-deploy Railway.
- **Git:** `C:\Program Files\Git\bin\git.exe`. Commits multilínea: `git commit -F archivo.tmp`.
- **Node:** `C:\Program Files\nodejs\node.exe`. `npx` y `psql` NO están en PATH — usar rutas completas o scripts Node.
- **Shell:** PowerShell 5.1. No usar `&&`, no redirigir stderr de nativos.
- **El usuario autorizó operación autónoma.**
- **Idioma:** español Chile.
- **Credenciales por defecto de cada clínica nueva:** Usuario `Administrador`, clave `ADMIN22` (forzado a cambiar al primer login).
- **Env vars en Railway (actuales):** `DATABASE_URL` (Postgres Railway), `NEXTAUTH_URL`, `NEXTAUTH_SECRET=Tj9oF2Gxy6Dw4hasjbI4+RFkc9I27GiWxBb6OYo7r+E=`. Falta cuando exista dominio: `PLATFORM_DOMAIN=tudominio.cl`.
- **Decisiones firmes:**
  - SaaS multi-tenant, login segmentado por clínica.
  - Modo subdominio (final) + modo path `/c/<slug>/` (fallback). Ambos coexisten.
  - Cada clínica recibe usuario `Administrador` / `ADMIN22` autogenerado.
  - Cambio forzado de contraseña al primer login.

---

## Notas técnicas

- Build Railway: `prisma generate && next build`. **NO** ejecuta `db push`. Cuando el schema cambia hay que aplicar `db push` manualmente contra Railway con `$env:DATABASE_URL=<url-railway>; node node_modules/prisma/build/index.js db push --accept-data-loss`.
- DATABASE_URL Railway (interno): `postgresql://postgres:IOVTDVfQmcsCUPaQQBYoucjCcNtwRZev@switchyard.proxy.rlwy.net:56335/railway`.
- El cliente Prisma local en Windows a veces queda bloqueado por el dev server (`query_engine-windows.dll.node`). Si `prisma generate` falla con EPERM, parar los procesos `node.exe` que corren `next dev`.
- NextAuth con cookies por dominio: cada subdominio tiene sesión propia (deseado).
- El header `x-clinica-slug` es inyectado por `proxy.ts` y leído por server components vía `getClinicaSlugFromContext()`.
