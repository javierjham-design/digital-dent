# Dental Platform — Estado actual

> **Última actualización:** 2026-05-12
> **Mantén este archivo corto.** Es para diagnóstico rápido al inicio de cada sesión. Histórico detallado va en `AI_CHANGELOG.md`.

---

## Resumen ejecutivo

Plataforma **operativa en producción** (Vercel + Neon Postgres). Todos los módulos de UI están implementados y conectados a la base de datos. El último cambio relevante fue cargar **764 prestaciones** del arancel real al catálogo, integrado al pipeline de build de Vercel para que el seed corra en cada deploy de forma idempotente.

Hay una **tarea pendiente activa**: añadir importación / exportación de pacientes en el módulo `/pacientes`. Se solicitó pero **no se ha iniciado**.

---

## Lo que funciona hoy (verificado)

| Módulo            | Estado | Notas                                                                                 |
| ----------------- | :----: | ------------------------------------------------------------------------------------- |
| Login / Auth      |   ✅   | NextAuth + Credentials + JWT. Middleware `proxy.ts` protege todo.                     |
| Pacientes (CRUD)  |   ✅   | Listado, alta, edición, ficha clínica, odontograma, tratamientos asociados.           |
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

- **2026-05-12 (sesión actual):** Sistema de continuidad documental creado (`CLAUDE.md`, `docs/PROJECT_CONTEXT.md`, `docs/PROJECT_STATUS.md`, `docs/AI_CHANGELOG.md`, `docs/SESSION_HANDOFF.md`). Sin cambios funcionales.
- **2026-05-12 (sesión previa, commit `6a2580c`):** Importadas 764 prestaciones (`prisma/seed-aranceles.ts`). Modificado `package.json` para incluir el seed en el build de Vercel.

---

## Qué falta por construir

### Pendiente inmediato (próxima tarea)

- 🚧 **Gestión de base de pacientes en `/pacientes`**:
  - [ ] Botón "Importar archivo" → upload Excel/CSV → endpoint `POST /api/pacientes/import`.
  - [ ] Botón "Descargar plantilla" → archivo base con columnas: Nombres, Apellidos, Teléfono, Dirección, Correo Electrónico, RUT, Fecha de Nacimiento.
  - [ ] Botón "Exportar Excel" → descarga la base actual de pacientes.
  - [ ] Decidir formato (Excel real con `xlsx` vs CSV simple sin dependencia extra).

### Planificado (no urgente)

- [ ] Integración WhatsApp real (hoy `confirmadoWA` es toggle manual).
- [ ] Dashboard KPI en `/` (hoy solo redirige a `/agenda`).
- [ ] Reportes financieros con recharts.
- [ ] Recordatorios automáticos de cita.
- [ ] Backup automático fuera de Neon.

---

## Errores conocidos / áreas a revisar

- ⚠️ **Seed corre en cada build.** Si el archivo `seed-aranceles.ts` se corrompe, todos los deploys fallan hasta arreglarlo. Mantener idempotente (`skipDuplicates: true`).
- ⚠️ **`prisma db push --accept-data-loss` en build:** renombrar o eliminar campos en `schema.prisma` borra datos en prod. Hacer cambios en dos pasos.
- ⚠️ **`Diente @@unique([fichaId, numero, cara])` con `cara = null`:** PostgreSQL trata NULLs como distintos, así que pueden crearse duplicados de cara nula. Revisar si es un problema en la práctica.
- ⚠️ **`numero` correlativo en Presupuesto/Cobro:** se calcula con `max + 1` sin transacción explícita. Bajo concurrencia podría colisionar. Hoy no es problema (uso bajo).
- ⚠️ **Local dev con SQLite no funciona** porque el schema declara `provider = "postgresql"`. Para correr local hay que apuntar a Postgres real (Neon dev o local).

---

## Próximos pasos recomendados

1. **Implementar importación/exportación de pacientes** (tarea explícita pendiente del usuario).
2. Decidir librería para Excel: opciones rápidas:
   - `xlsx` (SheetJS) — robusto, ~1MB, soporta `.xlsx` real.
   - CSV manual — cero dependencias, pero no es Excel "de verdad".
3. Tras eso, evaluar dashboard KPI con `recharts` (ya instalado).
4. Plan a futuro: integración WhatsApp.

---

## Estado de deploy

- **Última build exitosa:** commit `6a2580c` (seed aranceles).
- **Branch:** `master`.
- **Próximo deploy disparará:** seed idempotente + build normal.
- **Variables de entorno en Vercel:** `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` (todas configuradas).
