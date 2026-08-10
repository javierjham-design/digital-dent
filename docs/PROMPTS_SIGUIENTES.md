# Estado y trabajo pendiente — Cláriva

> Actualizado: 2026-08-05. **Sin letras ni números**: los ítems se identifican por su
> nombre, así la lista no se desordena cuando aparece algo nuevo en el medio.
>
> Los bloques de código son prompts autónomos: se pegan tal cual en una sesión nueva de
> Claude Code abierta en la raíz del repo. Uno por sesión.

---

## ✅ Cerrado

| Trabajo | Qué quedó |
|---|---|
| **Limpieza del monolito** | 219 archivos y ~42.000 líneas fuera del árbol (tag `monolito-final`). `.gitattributes` con `eol=lf`. `CLAUDE.md` reescrito para el stack real. |
| **Backups (3 capas)** | Dump diario cifrado AES-256-GCM de todas las bases a Cloudflare R2, fuera de Railway, con bucket locks. Restore quirúrgico por clínica, dry-run por defecto. Poda GFS con credenciales separadas. Ensayo semanal que **restaura de verdad**. Capa 1 de Railway (volumen + PITR) activada. Runbooks en `docs/BACKUPS.md`. |
| **Observabilidad** | `/health` con `SELECT 1` real, Sentry en los 3 servicios con scrubber de PII **verificado con datos falsos**, logging JSON con request-id vía `AsyncLocalStorage`, UptimeRobot sobre `/health`. Ver `docs/OBSERVABILIDAD.md`. |
| **Google Calendar** | Cron de sync recreado. Fallas visibles en las dos direcciones (log + Sentry), dead-man's switch por frescura, aviso para la recepción en la propia agenda. Reconcile idempotente: un full resync ya no duplica. Verificación OAuth **enviada a Google** con páginas legales publicadas. |
| **Correlativos seguros** | Helper `siguienteNumero()` con advisory lock transaccional en `lib/correlativo.ts`, aplicado a Cobro, Presupuesto, SesionCaja, Caja y Paciente. Tests de concurrencia. |
| **Barreras de datos** | `dropTenantDatabase()` se niega a borrar una base productiva sin confirmación explícita; el criterio usa el registro del control-plane y cae al conteo de pacientes solo para bases huérfanas. Limpieza de demos con red contra el flag mal puesto. |
| **`init.sql` sincronizado** | Resincronizado con el schema tenant, parser endurecido, **guarda anti-drift en la suite**, y verificado creando una demo real desde la landing de punta a punta. |
| **Suite de tests** | 114/114 unit · 54/54 integración. Los dos fallos crónicos eran tests desactualizados. |
| **Techo de conexiones** | Caché LRU de clientes por tenant con pool acotado. |
| **Navegación reordenada** | CRM anclado en el header · menú agrupado por secciones · Configuración en pestañas · permiso `puedeVerReportes` (los 7 endpoints de reportes estaban sin protección) · liquidaciones unificadas. |
| **CRM: conversión automática** | Un lead pasa a CONVERTIDO solo cuando su paciente registra el primer cobro pagado, por el mismo camino que la marca manual. Vínculo lead→paciente automático por teléfono/RUT al crear ficha, con aviso para los ambiguos. Reconciliación histórica: 72 vínculos recuperados. |
| **ESLint** | Flat config 9 para backend/frontend/web/shared. `no-floating-promises` como error en backend. 6 warnings, ninguno bloqueante. *(rama `chore/eslint-flat-config`, falta mergear)* |

---

| **2FA super-admin** | TOTP obligatorio en dos pasos, códigos de respaldo de un solo uso, secreto cifrado AES-256-GCM, rate limit propio. El login de las clínicas quedó intacto. |
| **Crons unificados** | Los 5 viven en Railway (backup, drill, prune, sync, demo-cleanup). Se retiró el workflow de GitHub Actions, que duplicaba el sync y dependía de que `master` fuera la rama default. |
| **Google verificado** | Verificación de marca aprobada. Páginas legales publicadas. `arch` mergeado a `master`. |

---

## Pendiente

### En curso: módulo de áreas clínicas (Dental / Estética facial / Médico)

**El prompt completo y definitivo está en `docs/PROMPT_MODULO_AREAS.md`.** Es la
funcionalidad más grande del proyecto: catálogo, ficha y diagrama diferenciados por área,
habilitación en dos niveles (módulo por clínica + toggle por profesional), y gráfico facial
con zonas clicables más capa de dibujo.

Va en una sola rama, en seis fases y con dos checkpoints. La fase 0 (blindar
`dedupePrestaciones` y la unicidad de nombres por área) va antes que todo lo demás: hoy es
inofensiva, y en cuanto exista la primera prestación estética homónima se vuelve un borrado
silencioso de datos clínicos.

Antes de encargar la ilustración SVG, esperá el checkpoint 1 — ahí salen los códigos de zona
exactos. Y hacé validar la lista de zonas con un profesional de estética antes de
congelarla: se siembra en la base de cada clínica.

### Decisiones esperando tu OK

**Self-check de schema en `provisionTenant()`.** Que después de aplicar el DDL verifique que
la base quedó completa, como red de último momento. La guarda anti-drift ya cubre el caso
normal; esto sería defensa en profundidad.

### Esperando a terceros

**Verificación OAuth de Google** — enviada, en revisión.

## Cosas menores, cuando haya un rato

**Redondeo explícito en porcentajes.** El dinero es `Float` (34 campos, ningún `Decimal`).
Las comisiones de medios de pago y los porcentajes de liquidación generan residuos de coma
flotante que reaparecen como descuadres de uno o dos pesos en los cierres de caja. Migrar
a `Decimal` es invasivo; redondear explícitamente en cada cálculo resuelve el 95%.

**`serializeError` en los logs.** `backend/src/lib/logger.ts` escribe `e.message` tal cual.
El `beforeSend` de Sentry ya redacta los mensajes de Prisma, pero los logs de Railway no:
un `PrismaClientValidationError` sobre un paciente todavía vuelca sus datos ahí.

**Merge `arch` → `master`.** `master` sigue congelada en el monolito y es la rama por
defecto del repo. Cerrarlo ordena el repositorio y activaría los workflows de GitHub
Actions, que solo corren desde la rama default.

---

## Referencia rápida

**Antes de cualquier cambio:** leer `docs/SESSION_HANDOFF.md` y `CLAUDE.md`.

**Verificación (siempre, antes de commitear):**

```powershell
npm --prefix backend run typecheck
npm --prefix backend test
npm --prefix backend run test:integration
npm --prefix frontend run typecheck
npm --prefix web run typecheck
```

**Reglas que no se negocian:** no tocar `migrate-tenants.ts` (el hard-abort vive solo
detrás de `--strict`; el `prestart` nunca debe tumbar la plataforma) · no debilitar el
aislamiento físico entre clínicas · no agregar call sites de `dropTenantDatabase()` ·
**nunca probar algo que escribe contra una clínica productiva** (usar una demo) · backup
fresco antes de cualquier operación destructiva deliberada · cada push a
`arch/split-frontend-backend` redeploya los 3 servicios de producción.

**Ante un incidente de datos:** `docs/BACKUPS.md` tiene los runbooks de "una clínica
perdió datos" y "se cayó el Postgres entero", con los comandos exactos.

**Al cerrar cada tarea:** entrada nueva arriba en `docs/AI_CHANGELOG.md` y
`docs/SESSION_HANDOFF.md` sobrescrito con el estado real.
