# AI Changelog

> Historial cronológico de cambios realizados con asistencia de Claude.
> **Las entradas más recientes van arriba.** Añade entradas nuevas insertándolas debajo del encabezado.

---

## Formato de cada entrada

```markdown
## YYYY-MM-DD — Título corto

**Solicitud:** [lo que pidió el usuario, en una línea]

**Archivos modificados:**
- `ruta/archivo.ext` — qué se hizo
- ...

**Resumen de cambios:**
[2–5 líneas sobre qué se hizo y por qué]

**Riesgos / consideraciones:**
- [si aplica]

**Pendientes derivados:**
- [si aplica]
```

---

## 2026-05-12 — Importación/exportación de pacientes (Excel)

**Solicitud:** En `/pacientes`: botón para subir archivo y cargar base de pacientes, otro para descargar plantilla base con columnas (Nombres, Apellidos, Teléfono, Dirección, Correo Electrónico, RUT, Fecha de Nacimiento), y otro para exportar la base actual a Excel.

**Archivos modificados:**
- `package.json` — agregada dependencia `xlsx` (SheetJS).
- `app/api/pacientes/template/route.ts` — creado. GET. Genera `plantilla-pacientes.xlsx` con cabeceras + fila de ejemplo.
- `app/api/pacientes/export/route.ts` — creado. GET. Exporta toda la tabla `Paciente` (ordenada por apellido, nombre) a `pacientes-YYYY-MM-DD.xlsx`. Incluye campos adicionales: previsión, género, activo, creado.
- `app/api/pacientes/import/route.ts` — creado. POST multipart `file`. Lee xlsx/xls/csv, normaliza RUT (`12345678-9`), parsea fecha flexible (ISO, dd/mm/yyyy, serial de Excel), valida nombre/apellido/RUT, detecta duplicados en archivo, usa `prisma.paciente.createMany({ skipDuplicates: true })` para evitar choque con RUTs ya existentes. Retorna `{ total, creados, duplicados, errores[] }`.
- `app/(dashboard)/pacientes/pacientes-client.tsx` — añadidos 3 botones (Plantilla / Importar / Exportar Excel) en el header. Modal de resultado de importación con KPIs (filas, creados, duplicados) y listado de errores por fila. Recarga la tabla si hubo creados.

**Resumen de cambios:**
Tres endpoints serverless usando `xlsx` (SheetJS). Template usa nombres de columnas exactos solicitados (con tilde y ñ). Importación es **idempotente por RUT**: si un paciente ya existe en DB se cuenta como duplicado y no rompe el flujo. El parser de fecha acepta tres formatos comunes (ISO, dd/mm/yyyy, serial numérico de Excel) más fallback a `new Date()`. Auth verificada con `getServerSession` en los 3 endpoints.

**Riesgos / consideraciones:**
- `xlsx` tiene 3 vulnerabilidades conocidas (1 moderada, 2 altas) por CVE de prototype pollution y ReDoS — aceptables en un endpoint autenticado con archivos de clínica. Si más adelante se exigiera depurar, alternativa es migrar a `exceljs`.
- `prisma.paciente.createMany({ skipDuplicates: true })` requiere Postgres (en SQLite no funciona). El proyecto ya corre Postgres en prod, así que ok.
- Import no actualiza pacientes existentes — solo crea nuevos. Si el cliente necesita "merge/upsert", hay que iterar y hacer `upsert` (más lento, pero posible).
- El cliente Prisma local quedó desactualizado y `prisma generate` falla por `.dll` bloqueado en Windows — no bloquea Vercel pero hay que regenerarlo localmente cuando se quiera correr `tsc` limpio.

**Pendientes derivados:**
- Verificar deploy en Vercel y probar import con archivo real.
- Opcional: añadir botón "Reemplazar existentes" que haga upsert en lugar de skipDuplicates.
- Opcional: validar formato de RUT chileno con dígito verificador antes de aceptar (hoy solo se normaliza, no se valida el DV).

---

## 2026-05-12 — Sistema de continuidad documental

**Solicitud:** Preparar el proyecto para trabajo prolongado sin perder contexto entre sesiones, compactaciones o reinicios. Crear `CLAUDE.md` + 4 documentos en `docs/`.

**Archivos modificados:**
- `CLAUDE.md` (raíz) — sobrescrito con guía de sesión (objetivo, arquitectura, stack, convenciones, reglas, comandos).
- `docs/PROJECT_CONTEXT.md` — creado. Contexto completo: problema, stack, modelos, flujos, decisiones, funcionalidades, puntos delicados.
- `docs/PROJECT_STATUS.md` — creado. Estado actual: qué funciona, qué cambió, qué falta, errores conocidos, próximos pasos.
- `docs/AI_CHANGELOG.md` — creado (este archivo).
- `docs/SESSION_HANDOFF.md` — creado. Plantilla de traspaso entre sesiones.

**Resumen de cambios:**
Sólo documentación. No se tocó código funcional, schema, dependencias ni rutas. El objetivo es que cualquier sesión futura de Claude pueda reabrir el proyecto leyendo `CLAUDE.md` → `docs/SESSION_HANDOFF.md` → `docs/PROJECT_STATUS.md` y retomar sin depender del historial de chat.

**Riesgos / consideraciones:**
- Ninguno funcional. Mantenimiento: hay que actualizar `SESSION_HANDOFF.md` y `PROJECT_STATUS.md` al final de cada tarea importante o el sistema pierde valor rápido.

**Pendientes derivados:**
- Próxima tarea real: importación/exportación de pacientes en `/pacientes`.

---

## 2026-05-12 — Carga del arancel real (764 prestaciones)

**Solicitud:** Importar el arancel dental depurado (`Arancel depurado 05 26.txt`, UTF-16 LE, tab-separado) al catálogo de Prestaciones, organizado por categoría y precio.

**Archivos modificados:**
- `prisma/seed-aranceles.ts` — creado. 791 líneas con 764 prestaciones distribuidas en 24 categorías. Idempotente vía `createMany({ skipDuplicates: true })`.
- `package.json` — modificado el script `build` para incluir el seed antes de `next build`:
  `prisma db push --accept-data-loss && prisma generate && ts-node --transpile-only prisma/seed-aranceles.ts && next build`

**Resumen de cambios:**
Se parseó el TXT UTF-16 LE chileno (precio formato `$29.900`, `$-` = 0), se generó un seed TypeScript con todas las prestaciones, y se integró al pipeline de Vercel para que el catálogo se sincronice en cada deploy sin riesgo de duplicar registros.

**Riesgos / consideraciones:**
- El seed corre en cada build. Si se corrompe, ningún deploy podrá completarse.
- `--transpile-only` salta type-checking del seed; cualquier error de tipos solo aparecerá en runtime.
- Local dev con SQLite no permite correr el seed (schema = postgresql).

**Pendientes derivados:**
- Verificar que el deploy de Vercel haya creado las 764 prestaciones en la DB de producción.

---

<!-- Plantilla para próximas entradas (copiar arriba del histórico):

## YYYY-MM-DD — Título corto

**Solicitud:**

**Archivos modificados:**
-

**Resumen de cambios:**

**Riesgos / consideraciones:**
-

**Pendientes derivados:**
-

-->
