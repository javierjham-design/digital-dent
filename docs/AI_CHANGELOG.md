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

## 2026-05-13 — Panel super-admin /digital-dent-super-admin (Fase 1B)

**Solicitud:** Crear panel para gestionar todas las clínicas (control plane), dejarlo en URL `/digital-dent-super-admin`, renombrar "Digital-Dent" en login/registro a algo genérico (el usuario decidirá nombre comercial después), y crear usuario super-admin con credenciales para entrar.

**Archivos modificados:**
- `prisma/seed-super-admin.ts` — creado. Idempotente. Lee `SUPER_ADMIN_EMAIL` y `SUPER_ADMIN_PASSWORD` del env. Si user existe, solo asegura `isPlatformAdmin=true`. Si no existe, lo crea.
- `package.json` — build incluye `seed-super-admin` después de `seed-multi-tenant`.
- `lib/auth.ts` — `isPlatformAdmin` en JWT y session. Helper `requireSuperAdmin()`.
- `app/digital-dent-super-admin/layout.tsx` — guard que redirige a `/login` o `/` si no es super-admin.
- `app/digital-dent-super-admin/topbar.tsx` — nav oscura con Dashboard / Clínicas / Salir.
- `app/digital-dent-super-admin/page.tsx` — dashboard con 8 KPIs globales (clínicas activas / en trial / suspendidas, usuarios, pacientes, citas totales y del mes, volumen cobrado) + tabla últimas 5 clínicas.
- `app/digital-dent-super-admin/clinicas/page.tsx` + `clinicas-list-client.tsx` — listado con buscador y filtros por plan / estado.
- `app/digital-dent-super-admin/clinicas/[id]/page.tsx` + `clinica-detail-client.tsx` — detalle con métricas, editor inline de datos y botón suspender/reactivar.
- `app/api/admin/clinicas/[id]/route.ts` — GET/PATCH protegidos por `requireSuperAdmin`.
- `app/api/auth/whoami/route.ts` — endpoint para que el login decida destino.
- `app/(auth)/login/page.tsx` — post-login consulta whoami y redirige a `/digital-dent-super-admin` o `/`. Renombrado "Digital-Dent" → "Plataforma Dental".
- `app/(auth)/registro/page.tsx` — renombrado a "Plataforma Dental".
- `app/(dashboard)/layout.tsx` — si usuario es platform admin, redirige al panel.
- `.gitignore` — añadido `*.tmp` para evitar commits accidentales del archivo de mensaje.

**Resumen de cambios:**
URL del panel: `/digital-dent-super-admin`. Visualmente oscuro (slate-900 + acento púrpura) para distinguir del dashboard de clínica. Acceso restringido por `isPlatformAdmin === true`. Dashboard muestra KPIs globales y listado/detalle de cada clínica permite editar datos, cambiar plan y suspender. El super-admin **no pertenece a ninguna clínica** (`clinicaId = null`), por lo que el dashboard normal lo redirige automáticamente al panel.

**Cómo crear el super-admin (instrucciones al usuario):**
Añadir en Vercel → Settings → Environment Variables (producción):
- `SUPER_ADMIN_EMAIL=superadmin@digital-dent.cl` (o el email que prefiera)
- `SUPER_ADMIN_PASSWORD=<password segura>`

Tras redeploy, el seed crea el user. Login en `/login` con esas credenciales redirige al panel.

**Riesgos / consideraciones:**
- `isPlatformAdmin` no tiene UI para auto-elevación — solo via seed/SQL directo.
- Si las env vars faltan, el seed termina sin error (no bloquea build, pero tampoco crea super-admin).
- El password en env vars de Vercel está cifrado en reposo, pero si alguien tiene acceso al proyecto Vercel lo puede leer. Aceptable para el caso.
- Modo "impersonar como admin de clínica" no implementado — pendiente para Fase 1B+.

**Pendientes derivados:**
- Modo impersonar (super-admin entra como admin de cualquier clínica sin saber su password).
- Storage por clínica (cuando exista módulo de archivos en Fase 2).
- Métrica "último login del admin de la clínica".
- Botón "extender trial" en detalle de clínica.

---

## 2026-05-13 — Multi-tenancy (Fase 1)

**Solicitud:** Convertir la plataforma de single-tenant a SaaS multi-tenant para vender a múltiples clínicas, manteniendo aislamiento de datos por clínica.

**Archivos modificados:** 50 archivos. Resumen:
- `prisma/schema.prisma` — Nuevo modelo `Clinica`. `clinicaId` nullable en cada modelo de datos. `@@unique([clinicaId, rut])` en Paciente, `@@unique([clinicaId, numero])` en Presupuesto y Cobro. `isPlatformAdmin` añadido a User para Fase 1B.
- `prisma/seed-multi-tenant.ts` — creado. Crea clínica "Clínica Digital-Dent" copiando datos del singleton `Configuracion`, y asigna todos los registros huérfanos a esa clínica.
- `lib/auth.ts` — JWT y session incluyen `clinicaId`. Helpers `getSessionUser()` y `requireClinicaId()`.
- `app/api/clinicas/route.ts` — creado. POST público para registro de clínica nueva + admin + copia del catálogo de la plantilla.
- `app/api/clinica/route.ts` — creado. GET/PATCH datos de la clínica actual.
- `app/api/configuracion/route.ts` — convertido en pasarela legacy al modelo `Clinica`.
- **15+ endpoints API** — todos filtran por `clinicaId` en GET/PATCH/DELETE y lo asignan en POST.
- **10+ páginas server-component** — agenda, pacientes, presupuestos, cobros, prestaciones, liquidaciones, usuarios, configuración: queries scope por clínica.
- **3 páginas print** — header dinámico con datos de la clínica del usuario.
- `app/(auth)/registro/page.tsx` — creado. Onboarding en 2 pasos (datos clínica → admin).
- `app/(auth)/login/page.tsx` — añadido link a /registro.
- `proxy.ts` — `/registro` y `/api/clinicas` son ahora públicos.
- `app/(dashboard)/layout.tsx` — carga la clínica del usuario; redirige si suspendida/sin clínica.
- `package.json` — build script reemplaza `seed-aranceles` por `seed-multi-tenant`.

**Resumen de cambios:**
La plataforma deja de ser single-tenant. Cada clínica es un tenant aislado con sus propios usuarios, pacientes, citas, aranceles, presupuestos, etc. El JWT lleva `clinicaId` y cada query filtra automáticamente por ese scope. Una clínica nueva se registra públicamente en `/registro`, recibe 30 días de trial, hereda el catálogo de aranceles de la plantilla, y se loguea automáticamente al terminar el flujo. Los datos existentes (3.980 pacientes, 764 prestaciones, etc.) quedan asignados a la "Clínica Digital-Dent" inicial creada por el seed.

**Decisiones técnicas confirmadas (6 puntos):**
1. RUT de paciente único por clínica (no global).
2. Aranceles propios por clínica (copia inicial desde plantilla).
3. Email de usuario único global.
4. Trial de 30 días al registrarse.
5. Login simple: cada usuario pertenece a una sola clínica.
6. Migración: nueva clínica "Clínica Digital-Dent" recibe todos los datos legacy.

**Riesgos / consideraciones:**
- `clinicaId` queda **nullable** en DB por la migración suave. A nivel de código siempre se valida que esté presente. Endurecer a NOT NULL en un segundo commit una vez verificada la migración en producción.
- El cliente Prisma local no se pudo regenerar (`.dll` bloqueado en Windows). Vercel lo regenera limpio en cada build, así que typecheck local muestra errores irreales pero el build de Vercel funcionará.
- `seed-aranceles.ts` ya no corre en cada build. Las 764 prestaciones quedaron asignadas a la clínica inicial. Clínicas nuevas reciben copia.
- Los `numero` correlativos de Presupuesto/Cobro siguen sin transacción explícita. Bajo concurrencia alta de dos usuarios creando al mismo tiempo en la misma clínica podría colisionar. Aceptable para clínicas pequeñas.
- El modelo `Configuracion` legacy se mantiene; eliminarlo en una segunda fase.

**Pendientes derivados:**
- **Fase 1B: Panel super-admin `/admin`** — pendiente. UI para gestionar todas las clínicas: listado, métricas, suspender, almacenamiento usado. Campo `isPlatformAdmin` ya añadido al schema.
- Fase 2: Módulo de archivos (radiografías, documentos).
- Fase 3: Migración a Hetzner.
- Fase 4: Pasarela de pagos.

---

## 2026-05-12 — RUT de paciente opcional + dedupe contra DB en import

**Solicitud:** Permitir importar (y crear) pacientes sin RUT, manteniendo la unicidad: si traen RUT y ya existe en la base, no importar esa fila.

**Archivos modificados:**
- `prisma/schema.prisma` — `Paciente.rut` cambió de `String @unique` a `String? @unique`. Postgres permite múltiples NULLs en una columna UNIQUE, así que la unicidad solo aplica a RUTs no-null.
- `app/api/pacientes/import/route.ts` — quitado el error "Falta RUT": ahora valida solo Nombres y Apellidos. Si la fila trae RUT, se normaliza y se dedupea dentro del archivo. Antes del `createMany`, consulta los RUTs no-null contra DB y descarta los que ya existen contándolos como `duplicados`. Añadido contador `sinRut` en la respuesta.
- `app/api/pacientes/route.ts` — POST acepta `rut` vacío → guarda `null`.
- `app/api/pacientes/export/route.ts` — `formatRUT` local maneja `null`.
- `lib/utils.ts` — `formatRUT` ahora acepta `string | null | undefined` y devuelve string vacío si no hay rut.
- `app/(dashboard)/pacientes/pacientes-client.tsx` — interface `rut: string | null`, filtro con `?? ''`, render con guard "—", form con label "RUT (opcional)" sin `required`, modal con grid 2×2 que incluye "Importados sin RUT".
- `app/(dashboard)/pacientes/[id]/ficha-client.tsx` — render "Sin RUT registrado" en encabezado y "—" en tabla de datos personales si no hay rut.
- `app/(dashboard)/agenda/agenda-client.tsx` — tipo `Cita.pacienteRut: string | null`, prop `pacientes` con rut nullable, filtro con `?? ''`, render "Sin RUT" en buscador, label "RUT (opcional)" en form, `canSave` ya no exige rut en modo "nuevo".
- `app/print/presupuesto/page.tsx`, `app/print/plan/page.tsx` — la línea "RUT:" se oculta si el paciente no tiene rut.

**Resumen de cambios:**
La unicidad de RUT se preserva: Postgres trata múltiples NULL como distintos, así que `@unique` sigue funcionando para los pacientes que sí tienen RUT, y los sin-RUT pueden ser N. El endpoint de import ahora hace dos chequeos: dedupe dentro del archivo (RUT duplicado en archivo → error de fila) y dedupe contra DB (RUT ya existente → cuenta como duplicado, no se inserta). `createMany skipDuplicates` queda como red de seguridad para condiciones de carrera.

**Riesgos / consideraciones:**
- `prisma db push --accept-data-loss` en el build de Vercel ejecuta `ALTER TABLE Paciente ALTER COLUMN rut DROP NOT NULL`. Operación segura sin pérdida de datos.
- El cliente Prisma local no se pudo regenerar (`.dll` bloqueado en Windows), por eso `tsc --noEmit` aún ve `rut: string`. No es bloqueante: Vercel hace `prisma generate` limpio en cada build.
- Algunos doctores/pacientes pueden coexistir sin RUT — si en el futuro se quiere validar dígito verificador del RUT, hacerlo *solo cuando se proporciona*.

**Pendientes derivados:**
- Verificar el deploy y probar importación con archivos que contengan filas sin RUT.
- Opcional: filtros en /pacientes para listar "Sin RUT" y completar manualmente más tarde.

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
