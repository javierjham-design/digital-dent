# Dental Platform — Estado actual

> **Última actualización:** 2026-05-12
> **Mantén este archivo corto.** Es para diagnóstico rápido al inicio de cada sesión. Histórico detallado va en `AI_CHANGELOG.md`.

---

## Resumen ejecutivo

Plataforma **operativa en producción** (Vercel + Neon Postgres). Todos los módulos de UI están implementados y conectados a la base de datos. Cambios recientes: catálogo completo del arancel (764 prestaciones) cargado automáticamente en cada deploy, y módulo de **import/export de pacientes en Excel** ya en producción (`/pacientes` con plantilla, importar y exportar).

Sin pendientes urgentes. El proyecto está en estado estable.

---

## Lo que funciona hoy (verificado)

| Módulo            | Estado | Notas                                                                                 |
| ----------------- | :----: | ------------------------------------------------------------------------------------- |
| Login / Auth      |   ✅   | NextAuth + Credentials + JWT. Middleware `proxy.ts` protege todo.                     |
| Pacientes (CRUD)  |   ✅   | Listado, alta, edición, ficha clínica, odontograma, tratamientos asociados.           |
| **Pacientes Import/Export** | ✅ | Plantilla `.xlsx`, importar Excel/CSV con validación, exportar base completa. |
| Agenda            |   ✅   | FullCalendar, horarios por doctor, log de citas, flag confirmación WA manual.         |
| Prestaciones      |   ✅   | CRUD + **764 ítems del arancel** seedeados automáticamente en cada deploy.            |
| Presupuestos      |   ✅   | CRUD, numeración correlativa, vista imprimible (`/print/presupuesto`).                |
| Cobros            |   ✅   | CRUD con medios de pago, comisiones, recibo.                                          |
| Liquidaciones     |   ✅   | Por doctor × período. Contratos % / monto fijo. Vista imprimible.                     |
| Equipo (Usuarios) |   ✅   | Roles admin / doctor / staff, flag `puedeRecibirPagos`.                               |
| Configuración     |   ✅   | Singleton con datos clínica, logo (base64) y plantilla WA.                            |
| Deploy Vercel     |   ✅   | Auto-deploy desde GitHub `master`, build incluye seed de aranceles.                   |

---

## Cambios recientes

- **2026-05-12 (commit `7d6f490`):** Import/export Excel de pacientes (3 endpoints + UI) + sistema de continuidad documental (`CLAUDE.md` + `docs/`). Nueva dependencia: `xlsx` (SheetJS).
- **2026-05-12 (commit `6a2580c`):** 764 prestaciones del arancel cargadas vía seed automático en build.

---

## Qué falta por construir

### Pendiente inmediato

- Sin pendientes urgentes. Esperar feedback del usuario tras probar import/export.

### Mejoras opcionales sobre import/export de pacientes

- [ ] Modo "actualizar existentes" (hoy solo crea nuevos vía `skipDuplicates`).
- [ ] Validación de dígito verificador del RUT chileno antes de aceptar.
- [ ] Permitir reimportar y mostrar diff antes de confirmar.

### Planificado (no urgente)

- [ ] Integración WhatsApp real (hoy `confirmadoWA` es toggle manual).
- [ ] Dashboard KPI en `/` (hoy solo redirige a `/agenda`).
- [ ] Reportes financieros con recharts.
- [ ] Recordatorios automáticos de cita.
- [ ] Backup automático fuera de Neon.

---

## Errores conocidos / áreas a revisar

- ⚠️ **`xlsx` tiene 3 CVE conocidos** (1 moderado, 2 altos: prototype pollution + ReDoS). Aceptable en endpoint autenticado; si se vuelve crítico, migrar a `exceljs`.
- ⚠️ **Seed corre en cada build.** Mantener idempotente.
- ⚠️ **`prisma db push --accept-data-loss` en build:** renombrar/eliminar campos borra datos en prod. Hacer cambios en dos pasos.
- ⚠️ **`Diente @@unique([fichaId, numero, cara])` con `cara = null`:** PostgreSQL trata NULLs como distintos.
- ⚠️ **`numero` correlativo en Presupuesto/Cobro:** se calcula con `max + 1` sin transacción.
- ⚠️ **Local dev con SQLite no funciona** porque el schema declara `provider = "postgresql"`.
- ⚠️ **Cliente Prisma local desactualizado**: `prisma generate` puede fallar en Windows por `query_engine.dll` bloqueado. Cerrar dev server, eliminar `node_modules/.prisma`, reinstalar.

---

## Próximos pasos recomendados

1. Verificar deploy en Vercel del commit `7d6f490` y probar import/export con archivo real.
2. Confirmar con el usuario si quiere modo "actualizar existentes" o se queda con `skipDuplicates`.
3. Si todo OK → evaluar dashboard KPI con recharts (ya instalado).

---

## Estado de deploy

- **Última build:** commit `7d6f490` (import/export pacientes + docs).
- **Branch:** `master`.
- **Dependencias nuevas:** `xlsx` (SheetJS).
- **Variables de entorno en Vercel:** sin cambios.
