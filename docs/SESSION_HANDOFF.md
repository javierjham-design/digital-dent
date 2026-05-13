# Session Handoff

> **Lee este archivo PRIMERO al iniciar una sesión.** Resume exactamente dónde quedó el trabajo, sin depender del historial de chat anterior.

---

## Última actualización

- **Fecha:** 2026-05-13
- **Sesión:** larga. Se completó la Fase 1 (multi-tenancy) en una sola pasada.

---

## Qué se hizo en esta sesión

### 1. Decisiones estratégicas (consensuadas con el usuario)

- **Roadmap a SaaS firmado:** la plataforma se va a vender a múltiples clínicas dentales.
- **Destino futuro:** Hetzner VPS todo-en-uno (~$14/mes). Una sola factura, almacenamiento propio para radiografías.
- **Bluehost** del usuario solo sirve para landing pública en `digital-dent.cl` (es shared WP, no soporta Node.js). App va en `app.digital-dent.cl`.
- **Orden de trabajo:**
  1. Fase 1 (multi-tenancy) ← terminada
  2. Fase 1B (panel super-admin) ← siguiente
  3. Fase 2 (archivos / radiografías)
  4. Fase 3 (migración a Hetzner)
  5. Fase 4 (pasarela de pagos)

### 2. Fase 1 — Multi-tenancy completa ✅ (commits `e6d6de6` + `f919fcc`)

- Modelo `Clinica` (slug, plan, trialHasta, etc.).
- `clinicaId` nullable en cada modelo de datos.
- Auth con JWT que incluye `clinicaId`; helpers `getSessionUser()` y `requireClinicaId()`.
- 15+ endpoints API refactorizados con scope por clínica.
- 10+ páginas server-component refactorizadas.
- `/registro` público en 2 pasos.
- `/api/clinicas` POST para registro + admin + copia catálogo + trial 30 días.
- `seed-multi-tenant.ts` corre en cada build, idempotente.
- 6 decisiones técnicas confirmadas (RUT por clínica, catálogo por clínica, email global, trial 30 días, etc.).

### 3. Adelanto para Fase 1B

- Campo `isPlatformAdmin: Boolean` añadido a `User` en el schema, pero **sin UI ni endpoints todavía**.

---

## Qué quedó pendiente exactamente

### Tarea siguiente: **Fase 1B — Panel super-admin `/admin`**

Esto fue una idea del usuario para "tener una plataforma de administración de las plataformas" que gestione todas las clínicas. **No se empezó la implementación todavía.**

Cosas a construir:

1. **Layout `/admin`** — verifica `getSessionUser().isPlatformAdmin === true`, sino redirect.
2. **API `/api/admin/clinicas`** — GET listado, GET/PATCH detalle, POST suspender/reactivar.
3. **API `/api/admin/stats`** — métricas globales.
4. **Páginas:**
   - `/admin` — dashboard con KPIs (total clínicas, activas, en trial, ingresos estimados).
   - `/admin/clinicas` — listado con buscador y filtros.
   - `/admin/clinicas/[id]` — detalle: datos, métricas, suspender, ver storage, ver actividad.
5. **Crear primer super-admin** vía script o seed: `UPDATE User SET isPlatformAdmin = true WHERE email = '...'`.
6. **Modo impersonación** (opcional pero útil): super-admin entra como admin de cualquier clínica para dar soporte sin saber la contraseña.

**Métricas a mostrar por clínica:**
- Plan + estado (TRIAL, BASICO, PRO, suspendida).
- Días restantes de trial.
- # pacientes, # citas, # presupuestos, # cobros.
- Último login del admin.
- Storage usado (placeholder hasta Fase 2).
- Suma de cobros del mes (revenue de la clínica).

### Mejoras menores opcionales

1. [ ] Endurecer `clinicaId` a NOT NULL en DB tras verificar migración.
2. [ ] Eliminar modelo `Configuracion` legacy.
3. [ ] Renombrar TopBar "Config." → "Clínica" (o dejar como está).
4. [ ] Botón "Cerrar trial / pasar a Pro" en `/clinica`.
5. [ ] Numeración correlativa con transacción explícita.

---

## Archivos tocados en esta sesión

Demasiados para listar. Resumen:
- `prisma/schema.prisma` (modelo Clinica + clinicaId todos los modelos)
- `prisma/seed-multi-tenant.ts` (nuevo)
- `lib/auth.ts` (helpers + JWT con clinicaId)
- `app/api/clinicas/route.ts` (nuevo, público)
- `app/api/clinica/route.ts` (nuevo)
- `app/api/configuracion/route.ts` (pasarela legacy)
- 14 endpoints API refactorizados
- 10 páginas (dashboard) refactorizadas
- 3 páginas print refactorizadas
- `app/(auth)/registro/page.tsx` (nuevo)
- `app/(auth)/login/page.tsx` (link a registro)
- `proxy.ts` (rutas públicas)
- `app/(dashboard)/layout.tsx` (carga clínica)
- `package.json` (build script)

**Commits cronológicos esta sesión:**
- `e6d6de6` — feat: multi-tenancy completa (50 archivos)
- `f919fcc` — chore: eliminar commit-msg.tmp accidental

---

## Qué debe hacer la próxima sesión

### Paso 1 — Cargar contexto

1. Leer `CLAUDE.md`.
2. Leer este `docs/SESSION_HANDOFF.md`.
3. Leer `docs/PROJECT_STATUS.md`.
4. Si vas a tocar arquitectura, leer también `docs/PROJECT_CONTEXT.md` (sección 12 tiene el roadmap a SaaS).

### Paso 2 — Verificar que el deploy `f919fcc` se completó

Antes de implementar la Fase 1B, confirmar en Vercel que:
- El build pasó.
- `seed-multi-tenant` creó la "Clínica Digital-Dent" correctamente.
- Los pacientes existentes quedaron asignados a esa clínica.
- Login con el admin existente sigue funcionando (con `clinicaId` en el JWT).

### Paso 3 — Implementar Fase 1B

Estructura mínima viable:
1. Crear primer super-admin manualmente (insert directo en DB o seed dedicado).
2. Crear layout `app/(admin)/admin/layout.tsx` con guard `isPlatformAdmin`.
3. Crear página `/admin` con métricas y listado.
4. Crear API `/api/admin/clinicas` con GET, PATCH (suspender/reactivar).
5. Probar con super-admin real.
6. Documentar y push.

### Paso 4 — Antes de cerrar la sesión

Siempre actualizar:
1. `docs/AI_CHANGELOG.md` (nueva entrada arriba).
2. `docs/PROJECT_STATUS.md`.
3. `docs/SESSION_HANDOFF.md`.

---

## Información clave que no debes pedir de nuevo

- **Cliente:** Clínica Dental Digital-Dent, Temuco, Chile (cliente actual + clínica plantilla del SaaS).
- **Repo:** GitHub `javierjham-design/digital-dent`, rama `master`, auto-deploy Vercel.
- **Git:** `C:\Program Files\Git\bin\git.exe`. **Para commits multilínea con comillas: usar archivo temporal `git commit -F`, no here-string PowerShell.**
- **Node:** `C:\Program Files\nodejs\node.exe`.
- **Shell:** PowerShell 5.1.
- **El usuario autorizó operación autónoma.** No pedir confirmación para tareas claras; sí preguntar si hay decisión técnica genuinamente ambigua.
- **Idioma:** español Chile.
- **Decisiones firmes:**
  - SaaS multi-tenant. Aislamiento por `clinicaId`.
  - Excel real con `xlsx`, no CSV.
  - `Paciente.rut` opcional, único por clínica (no global).
  - Email de usuario único global.
  - Trial 30 días al registrarse.
  - Destino futuro: Hetzner VPS. Vercel solo durante validación de producto.

---

## Notas técnicas

- Build de Vercel: `prisma db push --accept-data-loss && prisma generate && ts-node --transpile-only prisma/seed-multi-tenant.ts && next build`.
- `seed-aranceles.ts` ya no se ejecuta. Sus 764 prestaciones quedan en la clínica inicial; nuevas clínicas las heredan via `/api/clinicas` POST.
- Cliente Prisma local no se regenera bien en Windows (`.dll` bloqueado). Vercel lo regenera limpio.
- `clinicaId` nullable en DB; validar siempre en código.
- `Configuracion` legacy se mantiene mientras `seed-multi-tenant` haga uso de él.
