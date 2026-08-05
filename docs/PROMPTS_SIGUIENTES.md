# Prompts para continuar — Cláriva

> Actualizado: 2026-08-04. Refleja lo que ya se hizo, no el plan original.
>
> Cada bloque de código es un prompt **autónomo**: se pega tal cual en una sesión nueva
> de Claude Code abierta en la raíz del repo. Uno por sesión — cada uno termina con
> verificación y commit, y mezclarlos hace que se pisen.

---

## Estado: qué ya está cerrado

**Limpieza del monolito** ✅ — 219 archivos y ~42.000 líneas fuera del árbol, preservados
en el tag `monolito-final`. `.gitattributes` con `eol=lf` (se acabaron los diffs fantasma
CRLF). `CLAUDE.md` reescrito para el stack real. Mergeado y desplegado.

**Backups (las 3 capas)** ✅ — lo más grande. Backup diario cifrado AES-256-GCM de las 4
bases a Cloudflare R2, fuera de Railway, inmutable 7 días por bucket lock. Restore
quirúrgico por clínica con dry-run por defecto. Poda GFS con credenciales separadas y
piso mínimo. Ensayo semanal de restauración que **ya restauró de verdad** y validó el
censo de filas. Tres servicios cron creados y validados en producción. Runbooks en
`docs/BACKUPS.md`.

**Barrera en `dropTenantDatabase`** ✅ — se niega a borrar una base de clínica no-demo o
con pacientes, salvo `confirmarBorradoProductivo` + dump pre-drop reciente. Esto era la
mitad del prompt 3 original; ya no hace falta.

**`migrate-tenants` seguro** ✅ — el chequeo de frescura de backups solo aborta con
`--strict` (invocación manual y deliberada). El `prestart` nunca tumba la plataforma.

**Observabilidad (código + encendido)** ✅ — `/health` con `SELECT 1` real, Sentry con
filtros de PII (breadcrumbs sin querystring, mensajes de Prisma redactados, scrubber
`redactPII` de RUT/email/monto), logging JSON con request-id propagado por
`AsyncLocalStorage`. **Encendido en prod el 2026-08-04:** 3 proyectos Sentry + DSN en
Railway + UptimeRobot a `/health` + fire-drill de PII pasado. Ver `docs/OBSERVABILIDAD.md`
§0.

**Capa 1 backups (volumen Railway + PITR)** ✅ — activada el 2026-08-04. Snapshots de
volumen (Daily 6d / Weekly 1mo / Monthly 3mo) + Point-in-Time Recovery. Red contra la
caída total del servidor; las capas 2 y 3 cubren la pérdida por clínica.

---

## Google Calendar — RESUELTO (2026-08-04)

Diagnóstico: solo `digital-dent` la usa, con 2 doctores mapeados y ~500 eventos espejados.
Se recreó el cron de sync, se hicieron visibles las fallas de las dos direcciones (push y
pull) con log + Sentry, se agregó dead-man's switch por frescura —no solo por error, que
era el modo de falla real— y aviso para la recepción en la propia agenda, no solo en
Configuración. El reconcile quedó idempotente: un full resync ya no duplica.

**Lección que costó 11 citas duplicadas en producción:** las pruebas de escritura van
contra una clínica demo, nunca contra una productiva. Quedó como regla 9 en `CLAUDE.md`.

---

## ✅ RESUELTO (2026-08-04) — `init.sql` resincronizado con el schema tenant

`init.sql` se regeneró (`tenant:initsql`), el diff resultó puramente aditivo (+2 tablas:
`AuditLog`, `LiquidacionAdjunto`), y se **verificó** provisionando una base descartable
cuyo schema físico salió idéntico a digital-dent (588 col / 85 idx / 54 FK). Se endureció
el parser (`lib/sql-split.ts`) y se agregó una **guarda** (`test/init-sql-sync.test.ts`)
que falla si alguien cambia el schema tenant y no corre `tenant:initsql`. Las 3 clínicas
reales están completas; solo un demo expirado (`demo-dv20mz`) quedó incompleto y
`migrate:tenants` lo salta a propósito (descartable). Ver `docs/AI_CHANGELOG.md`
(2026-08-04) y `CLAUDE.md` regla 2. **Pendiente opcional:** self-check de schema en
`provisionTenant()` (propuesta en el changelog).

```
Contexto: Cláriva, database-per-tenant. Leé CLAUDE.md y docs/SESSION_HANDOFF.md.

backend/prisma/tenant/init.sql está ~630 líneas atrás de prisma/tenant/schema.prisma.
Ese archivo es el DDL que usa applyTenantSchema() en lib/provision.ts para crear la base
de una clínica NUEVA, así que hoy toda clínica que se provisione nace con columnas
faltantes y el código que las lee le falla hasta el próximo deploy. Lo mismo aplica a las
demos de la landing, que también pasan por provisionTenant.

1. Regenerá init.sql con `npm run tenant:initsql` y revisá el diff: confirmame que es
   puramente aditivo respecto del commiteado y que no hay nada raro arrastrado.

2. VERIFICACIÓN REAL, no basta con que el archivo cambie: provisioná una clínica
   descartable con el init.sql nuevo y compará su schema físico contra el de una base
   productiva que ya pasó por migrate:tenants (columnas, tipos, nullability, índices y
   constraints). Tienen que ser idénticos. Si no lo son, el bug está en otro lado y
   quiero saberlo antes de seguir. Después borrá la base descartable (ojo: la barrera de
   dropTenantDatabase te va a pedir confirmarBorradoProductivo si tiene pacientes).

3. EL FIX QUE IMPORTA — que no pueda volver a pasar: agregá un test que regenere el DDL
   a un archivo temporal y falle si difiere del init.sql commiteado. Así, el día que
   alguien cambie el schema tenant y se olvide de correr tenant:initsql, se entera en la
   suite y no cuando una clínica nueva nace rota. Es el mismo principio del ensayo de
   restore: la garantía no es haberlo hecho una vez, es que se compruebe solo.

4. Evaluá si conviene además que provisionTenant verifique el schema resultante después
   de aplicar el DDL, como red de último momento. Proponémelo antes de implementarlo.

5. Revisá si alguna de las clínicas o demos existentes se creó con un init.sql viejo y
   quedó con columnas faltantes que migrate:tenants no haya alcanzado a agregar.

Verificá con typecheck + tests. Rama aparte. No toques migrate-tenants.ts.
```

---

## Prompt A — Correlativo de cobros dentro de la transacción

> Es lo único que quedó del prompt 3 original (la barrera de `dropTenantDatabase` ya se
> hizo junto con los backups).

```
Contexto: Cláriva, SaaS multi-tenant en producción con dos clínicas reales,
database-per-tenant. Leé docs/SESSION_HANDOFF.md y CLAUDE.md antes de empezar.

En backend/src/services/cobros.service.ts:185 el número de comprobante sale de
findFirst({ orderBy: { numero: 'desc' } }) más uno, y recién después empieza el
$transaction que crea el cobro. Dos cobros simultáneos en la misma clínica (recepción
y box cobrando a la vez) leen el mismo máximo. Como `numero` es @unique en el schema
tenant, no se corrompe nada: el segundo cobro falla con error de constraint, y para la
recepcionista se ve como "el sistema se cayó justo cuando cobraba".

Movelo adentro de la transacción con un bloqueo, o usá una secuencia de Postgres.
El mismo patrón está en las líneas 242 y 276 — revisá qué hacen antes de tocarlas.
Fijate también si SesionCaja.numero y Presupuesto.numero tienen el mismo problema y
aplicá la misma corrección si corresponde.

Agregá un test que simule dos creaciones concurrentes y verifique que ambas obtienen
números distintos.

Verificá con typecheck + tests, actualizá docs/AI_CHANGELOG.md. Rama aparte.
No toques backend/src/scripts/migrate-tenants.ts.
```

---

## Prompt B — Techo de escalamiento: caché de conexiones por tenant

> Con dos clínicas no molesta. Antes de vender la décima, tiene que estar hecho.

```
Contexto: Cláriva, SaaS multi-tenant en producción, database-per-tenant. Leé
docs/SESSION_HANDOFF.md y CLAUDE.md antes de empezar.

backend/src/db/tenant.ts cachea un PrismaClient por dbName en un Map, sin límite ni
expiración, y cada cliente abre su propio pool. Con dos clínicas es irrelevante; a
treinta o cuarenta se agota el max_connections del Postgres de Railway y la plataforma
entera deja de responder. Es el techo de escalamiento más cercano que tiene el sistema.

Además dedupePrestacionesTodasLasClinicas() (backend/src/lib/maintenance.ts, se dispara
en cada arranque desde src/index.ts) abre un cliente por clínica que nunca se descarta,
así que alimenta ese caché desde el primer segundo de vida del proceso.

Implementá:

1. Convertí el Map en un LRU con tope configurable por env (TENANT_CLIENT_MAX, default
   ~20) que al desalojar llame a $disconnect(). Sumá expiración por inactividad
   (TENANT_CLIENT_TTL_MS). Ojo: disposeTenant() ya existe y lo usan la provisión y el
   restore de backups — mantené su semántica.

2. Limitá el pool de cada cliente por tenant (connection_limit en la URL, ver
   tenantUrl()). Calculá y documentá el máximo teórico: TENANT_CLIENT_MAX ×
   connection_limit + el pool del control-plane, contra el max_connections real del
   Postgres de Railway (server 18.3).

3. Hacé que dedupePrestacionesTodasLasClinicas() llame a disposeTenant() después de cada
   clínica, y envolvé dedupePrestaciones (backend/src/services/catalogo.service.ts) en
   $transaction: hoy reasigna tratamiento e itemPresupuesto y después borra las
   duplicadas en tres operaciones sueltas, así que si el proceso muere en el medio —y
   corre en cada arranque, incluso durante un deploy— queda a medio camino.

4. Documentá en docs/architecture.md el techo de conexiones y cuándo revisarlo.

Agregá tests del LRU (desaloja el menos usado, llama a disconnect, respeta el TTL).
Verificá con typecheck + tests. Rama aparte.
```

---

## Prompt C — Los dos tests de integración en rojo

> Chico, pero un test que se acepta en rojo deja de avisar cuando se rompe de verdad.

```
Contexto: Cláriva, SaaS multi-tenant en producción. Leé docs/SESSION_HANDOFF.md y
CLAUDE.md antes de empezar.

`npm --prefix backend run test:integration` da 48/50. Los dos fallos —consentimientos y
conversión de lead— son preexistentes: vienen fallando desde antes de la limpieza del
monolito, de la observabilidad y de los backups (verificado contra 67b0332 y 3788f0c).
Justamente por eso hay que arreglarlos: llevan semanas en rojo y ya nadie los mira, así
que si mañana se rompe algo de verdad en esos flujos, la suite no lo va a distinguir.

Diagnosticá cada uno y decidí, con argumento:
- Si el test está mal (fixture desactualizado, expectativa vieja) → arreglá el test.
- Si el test está bien y el código tiene un bug → arreglá el código, que es lo que
  importa: consentimientos y conversión de lead son flujos que las clínicas usan.

No los marques como skip para poner la suite en verde. Si alguno no se puede arreglar
ahora, dejalo fallando y anotá en docs/AI_CHANGELOG.md por qué y qué haría falta.

Verificá con typecheck + toda la suite. Rama aparte.
```

---

## Prompt D — ESLint para el stack nuevo

```
Contexto: Cláriva, monorepo con backend/ (Express + TypeScript), frontend/ y web/
(Vite + React + TypeScript) y shared/ (DTOs). Leé CLAUDE.md antes de empezar.

La única configuración de ESLint que existía era la del monolito Next.js, que se eliminó
del repo. Hoy no hay linter para ninguno de los tres servicios vivos.

Configurá ESLint 9 (flat config) para el monorepo:
- Una base compartida con typescript-eslint.
- backend/: reglas de Node/Express. Marcá como error las promesas sin await
  (no-floating-promises) — en un backend con Prisma es una fuente real de bugs.
- frontend/ y web/: reglas de React + hooks.
- shared/: solo tipos, config mínima.

Agregá el script `lint` al package.json de cada servicio. Corré el lint y arreglá lo que
salga, PERO: si aparecen más de ~30 advertencias, no las arregles todas de una — dejá
esas reglas en `warn`, anotá en docs/AI_CHANGELOG.md cuáles quedaron pendientes, y
subilas a `error` en una tanda posterior. No quiero un commit gigante de cambios
automáticos mezclado con la configuración.

No cambies comportamiento de runtime: solo configuración y arreglos de lint evidentes.
Verificá con typecheck + tests. Rama aparte.
```

---

## Prompt E — 2FA TOTP para el super-admin

> Cuando las dos clínicas sean cinco, esta cuenta pasa a ser el activo más valioso.

```
Contexto: Cláriva, SaaS multi-tenant en producción. El super-admin ve TODAS las clínicas
(pacientes, cobros, suscripciones) y hoy entra solo con email y contraseña. Leé
docs/SESSION_HANDOFF.md, docs/SECURITY.md y CLAUDE.md antes de empezar.

Implementá 2FA TOTP obligatorio para las cuentas de super-admin (schema de CONTROL, no
el de tenant):
- Alta: mostrar el QR una sola vez + códigos de respaldo de un solo uso (hasheados).
- Login: segundo paso tras la contraseña, con rate limit propio (reusá lib/rate-limit.ts,
  que ya solo consume cupo con los fallos).
- Recuperación: los códigos de respaldo. Documentá en docs/SECURITY.md qué hacer si se
  pierden todos (implica acceso directo a la base de control).
- El secreto TOTP va cifrado con la misma AES-256-GCM que ya usa lib/crypto.ts para los
  tokens de Google.

NO toques el login de las clínicas: el 2FA es solo para super-admin. Cuidado con no
romper el login dual (slug+username para clínica, email para super-admin) que vive en
auth.service.ts.

Migración aditiva en prisma/control/schema.prisma. Tests del flujo completo (alta,
login con código válido/inválido/reusado, código de respaldo consumido una sola vez).
Verificá con typecheck + tests. Rama aparte.
```

---

## Cosas menores, cuando haya un rato

**Demo huérfana `clariva_t_demo_u12uzu`.** Quedó con `esDemo = false` (probablemente
arrastrada por el `migrate:data` del cutover, porque el alta de demos sí marca el flag
correctamente en `demo.service.ts:70`). Con ese flag en falso: la limpieza diaria no la
toma nunca, la barrera nueva la considera productiva y se niega a borrarla, y el backup
se la lleva a R2 todos los días para siempre. **Antes de marcarla `esDemo = true`, mirá
qué tiene adentro** — marcarla la vuelve elegible para el borrado automático y le saca la
protección de la barrera; si no fuera una demo sino una clínica real que perdió el flag,
marcarla es programar su destrucción.

**Redondeo explícito en porcentajes.** El dinero es `Float` (34 campos, ningún `Decimal`).
Las comisiones de medios de pago (`monto * comision / 100`) y los porcentajes de
liquidación generan residuos de coma flotante que reaparecen como descuadres de uno o dos
pesos en los cierres de caja. Migrar a `Decimal` es invasivo; redondear explícitamente en
cada cálculo de porcentaje resuelve el 95%.

**`serializeError` en los logs.** `backend/src/lib/logger.ts:18` escribe `e.message` tal
cual. El `beforeSend` de Sentry ya redacta los mensajes de Prisma, pero los logs de
Railway no: un `PrismaClientValidationError` sobre un paciente todavía vuelca sus datos
ahí. Menos grave que mandarlo a un tercero, pero conviene aplicar la misma redacción.

**Merge `arch → master`.** `master` sigue congelada en el monolito, 290+ commits atrás, y
es la rama por defecto del repo. Cerrarlo ordena el repositorio y activaría los workflows
de GitHub Actions (que hoy solo corren desde la rama default).

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
cada push a `arch/split-frontend-backend` redeploya los 3 servicios de producción.

**Ante un incidente de datos:** `docs/BACKUPS.md` tiene los runbooks de "una clínica
perdió datos" y "se cayó el Postgres entero", con los comandos exactos.

**Al cerrar cada tarea:** entrada nueva arriba en `docs/AI_CHANGELOG.md` y
`docs/SESSION_HANDOFF.md` sobrescrito con el estado real.
