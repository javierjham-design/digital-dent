# Dental Platform — Estado actual

> **Última actualización:** 2026-05-13
> **Mantén este archivo corto.** Es para diagnóstico rápido al inicio de cada sesión. Histórico detallado va en `AI_CHANGELOG.md`.

---

## Resumen ejecutivo

Plataforma **operativa en producción como SaaS multi-tenant** (Vercel + Neon Postgres). La Fase 1 (multi-tenancy) está completa: cada clínica es un tenant aislado, el onboarding `/registro` permite crear clínicas nuevas con 30 días de trial, y los datos existentes están preservados en la "Clínica Digital-Dent" inicial.

Próximo paso: **Fase 1B — Panel super-admin (`/admin`)** para que el dueño de la plataforma pueda gestionar todas las clínicas (listado, métricas, suspender, ver almacenamiento usado).

---

## Lo que funciona hoy (verificado)

| Módulo            | Estado | Notas                                                                                 |
| ----------------- | :----: | ------------------------------------------------------------------------------------- |
| **Multi-tenant**  |   ✅   | Modelo `Clinica`, scope por `clinicaId` en todo. JWT incluye clínica. Trial 30 días. |
| **Onboarding**    |   ✅   | `/registro` público. Crea clínica + admin + copia catálogo + auto-login.             |
| Login / Auth      |   ✅   | NextAuth + Credentials + JWT con `clinicaId`. Middleware permite `/registro` público. |
| Pacientes (CRUD)  |   ✅   | Scope por clínica. RUT único POR clínica. Import/export Excel.                       |
| Agenda            |   ✅   | FullCalendar, horarios por doctor, log de citas — todo scoped.                       |
| Prestaciones      |   ✅   | Catálogo propio por clínica. Plantilla con 764 ítems para nuevas clínicas.           |
| Presupuestos      |   ✅   | Numeración correlativa **por clínica**. Vista imprimible con header dinámico.        |
| Cobros            |   ✅   | Medios de pago propios. Numeración correlativa por clínica.                          |
| Liquidaciones     |   ✅   | Por doctor × período × clínica.                                                       |
| Equipo (Usuarios) |   ✅   | Cada usuario pertenece a una clínica. Email único global.                            |
| Configuración     |   ✅   | Edita los datos de la clínica del usuario.                                            |
| Deploy Vercel     |   ✅   | Auto-deploy desde `master`. Build incluye `seed-multi-tenant` idempotente.           |

---

## Cambios recientes

- **2026-05-13 (commits `e6d6de6` + `f919fcc`):** Multi-tenancy completa (50 archivos modificados). Modelo `Clinica`, `clinicaId` en todos los modelos, JWT con scope, `/registro` público, refactor de 15+ APIs y 10+ páginas.
- **2026-05-12 (commit `1694069`):** RUT de paciente opcional + dedupe contra DB.
- **2026-05-12 (commit `7d6f490`):** Import/export Excel de pacientes.
- **2026-05-12 (commit `6a2580c`):** 764 prestaciones cargadas vía seed.

---

## Próximos pasos (Fase 1B)

### Panel super-admin `/admin`

- [ ] Layout exclusivo para `User.isPlatformAdmin === true`.
- [ ] Dashboard: total clínicas, activas, en trial, ingresos, almacenamiento agregado.
- [ ] Listado de clínicas con: nombre, slug, plan, trial, # pacientes, # citas, último login.
- [ ] Detalle de clínica: editar datos, suspender, ver storage, ver actividad.
- [ ] Suspensión: setear `Clinica.activo = false` — el middleware ya bloquea login.
- [ ] Buscador y filtros (por plan, estado, fecha de registro).
- [ ] Modo "impersonar" para soporte: entrar como admin de la clínica sin saber su password.

### Después de Fase 1B

- **Fase 2:** Módulo de archivos (radiografías, documentos clínicos).
- **Fase 3:** Migración a Hetzner VPS todo-en-uno (~$14/mes).
- **Fase 4:** Pasarela de pagos (Stripe / Khipu / MercadoPago) para cobrar suscripciones.

---

## Errores conocidos / áreas a revisar

- ⚠️ **`clinicaId` es nullable en DB.** A nivel de código se valida siempre que esté presente. Endurecer a NOT NULL en un segundo paso una vez verificada la migración.
- ⚠️ **Cliente Prisma local no se puede regenerar** en Windows (`.dll` bloqueado). Vercel lo regenera limpio en cada build.
- ⚠️ **Modelo `Configuracion` legacy** se mantiene temporalmente. Eliminar en Fase 1.5.
- ⚠️ **`numero` correlativo** en Presupuesto/Cobro sin transacción explícita. Aceptable para uso bajo.
- ⚠️ **`prisma db push --accept-data-loss`** corre en cada build — cuidado al renombrar/eliminar columnas.
- ⚠️ **`xlsx` tiene 3 CVE conocidos** (aceptables en endpoint autenticado).

---

## Estado de deploy

- **Última build:** commit `f919fcc` (multi-tenancy + chore).
- **Branch:** `master`.
- **Variables de entorno en Vercel:** sin cambios respecto al deploy anterior.
- **Migración automática:** `seed-multi-tenant.ts` crea la clínica inicial y migra todos los registros existentes al primer deploy.
