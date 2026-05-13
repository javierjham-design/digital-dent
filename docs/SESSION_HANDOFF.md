# Session Handoff

> **Lee este archivo PRIMERO al iniciar una sesión.** Resume exactamente dónde quedó el trabajo, sin depender del historial de chat anterior.

---

## Última actualización

- **Fecha:** 2026-05-13
- **Sesión:** larga. Se completó Fase 1 (multi-tenancy) + Fase 1B (panel super-admin) en el mismo día.

---

## Qué se hizo en esta sesión

1. **Decisiones estratégicas**: SaaS multi-tenant, destino Hetzner, Bluehost solo para landing.
2. **Fase 1 — Multi-tenancy** (commit `e6d6de6`).
3. **Fase 1B — Panel super-admin** en `/digital-dent-super-admin` (commit `e242eb9`).
4. **Rename genérico**: "Digital-Dent" en login/registro → "Plataforma Dental". El nombre comercial definitivo está pendiente.

---

## Configuración pendiente en Vercel (CRÍTICO para que el super-admin exista)

El próximo deploy ejecutará `seed-super-admin.ts` que lee dos env vars. Hay que añadirlas en Vercel:

```
SUPER_ADMIN_EMAIL=superadmin@digital-dent.cl
SUPER_ADMIN_PASSWORD=<elegir contraseña segura>
```

Sin esas env vars, el seed termina sin error pero no crea el super-admin.

---

## Qué quedó pendiente

### Pendiente inmediato (Fase 1B+)

- [ ] Modo "impersonar" — super-admin entra como admin de cualquier clínica sin saber su password (útil para soporte).
- [ ] Botón "extender trial X días" en detalle de clínica.
- [ ] Métrica "último login" por clínica.
- [ ] Vista de actividad reciente / logs de la clínica.

### Fase 2 — Módulo de archivos (radiografías)

- Modelo `Archivo` (con clinicaId, pacienteId, tratamientoId opcional).
- Endpoint upload con validación de tamaño.
- UI en ficha clínica para subir/visualizar.
- Visor simple (zoom, comparar antes/después).
- Decisión técnica: dónde guardar (local en VPS futuro vs Cloudflare R2 transición).

### Fase 3 — Migración a Hetzner

### Fase 4 — Pasarela de pagos (Stripe / Khipu / MercadoPago)

### Mejoras menores opcionales

- [ ] Endurecer `clinicaId` a NOT NULL una vez verificada migración.
- [ ] Eliminar modelo `Configuracion` legacy.
- [ ] Numeración correlativa con transacción explícita.
- [ ] Elegir y aplicar nombre comercial definitivo de la plataforma (hoy: "Plataforma Dental").

---

## Archivos relevantes de la última sesión

**Fase 1 (e6d6de6):** 50 archivos. Multi-tenancy completa.

**Fase 1B (e242eb9):** 16 archivos nuevos / modificados. Resumen:
- `prisma/seed-super-admin.ts`
- `lib/auth.ts` (helper `requireSuperAdmin`, `isPlatformAdmin` en session)
- `app/digital-dent-super-admin/*` (layout, topbar, dashboard, clinicas + detalle)
- `app/api/admin/clinicas/[id]/route.ts`
- `app/api/auth/whoami/route.ts`
- `app/(auth)/login/page.tsx` (redirect post-login según rol + rename)
- `app/(auth)/registro/page.tsx` (rename)
- `app/(dashboard)/layout.tsx` (redirige super-admin al panel)
- `package.json` (build con seed-super-admin)
- `.gitignore` (`*.tmp`)

**Commits cronológicos esta sesión:**
- `e6d6de6` — feat: multi-tenancy
- `f919fcc` — chore: cleanup
- `d4b98b5` — docs
- `e242eb9` — feat: panel super-admin

---

## Qué debe hacer la próxima sesión

### Paso 1 — Cargar contexto

1. `CLAUDE.md`
2. Este `docs/SESSION_HANDOFF.md`
3. `docs/PROJECT_STATUS.md`
4. Si toca arquitectura: `docs/PROJECT_CONTEXT.md` (sección 12 roadmap SaaS)

### Paso 2 — Verificar que el usuario configuró env vars

Antes de seguir, confirmar con el usuario que:
- Las env vars `SUPER_ADMIN_EMAIL` y `SUPER_ADMIN_PASSWORD` están en Vercel.
- Pudo entrar a `/digital-dent-super-admin` con esas credenciales.
- El dashboard muestra las clínicas correctamente.

### Paso 3 — Decidir próxima tarea con el usuario

Opciones probables:
- **Modo impersonar** (más corto, ~1 sesión).
- **Fase 2: módulo de archivos / radiografías** (más largo, 2 sesiones).
- **Nombre comercial + landing** en Bluehost.
- **Migración a Hetzner** (técnica, requiere acceso SSH).

---

## Información clave que no debes pedir de nuevo

- **Cliente:** Clínica Dental Digital-Dent, Temuco, Chile (también es la clínica plantilla del SaaS).
- **Nombre comercial de la plataforma:** PENDIENTE. Por ahora "Plataforma Dental" como placeholder.
- **URL del panel super-admin:** `/digital-dent-super-admin`.
- **Repo:** GitHub `javierjham-design/digital-dent`, rama `master`, auto-deploy Vercel.
- **Git:** `C:\Program Files\Git\bin\git.exe`. **Commits multilínea con comillas dobles: usar `git commit -F archivo.tmp`, no here-string PowerShell.** Confirmar que `.tmp` esté en `.gitignore`.
- **Node:** `C:\Program Files\nodejs\node.exe`.
- **Shell:** PowerShell 5.1.
- **El usuario autorizó operación autónoma.**
- **Idioma:** español Chile.
- **Decisiones firmes:**
  - SaaS multi-tenant.
  - Destino futuro Hetzner (cuando esté validado el producto).
  - Bluehost solo para landing.
  - Excel real con `xlsx`.
  - `Paciente.rut` opcional, único por clínica.
  - Email único global por usuario.
  - Trial 30 días.
  - `clinicaId` nullable en DB (validar en código).

---

## Notas técnicas

- Build Vercel: `prisma db push --accept-data-loss && prisma generate && ts-node --transpile-only prisma/seed-multi-tenant.ts && ts-node --transpile-only prisma/seed-super-admin.ts && next build`
- El seed super-admin es idempotente: si el usuario existe, solo asegura `isPlatformAdmin=true` (no resetea el password).
- Si quieres rotar la password del super-admin: cambia `SUPER_ADMIN_PASSWORD` en Vercel, **borra el usuario** (`DELETE FROM "User" WHERE email = ...`), y el próximo deploy lo recrea con la nueva password.
- Cliente Prisma local sigue desactualizado en Windows (`.dll` bloqueado). Vercel lo regenera limpio.
