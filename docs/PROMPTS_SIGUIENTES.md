# Prompts para continuar — Cláriva

> Cada bloque es un prompt **autónomo**: se pega tal cual en una sesión nueva de Claude
> Code abierta en la raíz del repo, y no necesita el historial de ninguna conversación
> anterior. Van en orden; el 0 primero, el 1 apenas se pueda.
>
> Uno por sesión. No los encadenes en la misma conversación: cada uno termina con
> verificación y commit, y mezclarlos hace que se pisen los cambios.

**Estado de partida:** plataforma en producción con dos clínicas reales. La rama que
despliega es `arch/split-frontend-backend`. La rama `chore/limpieza-monolito` tiene 4
commits sin mergear. Contexto completo en `docs/SESSION_HANDOFF.md` y prioridades en
`docs/AUDITORIA_2026-08.md`.

---

## Prompt 0 — Cerrar la limpieza del monolito

> Este es el único que hay que correr **ya**, porque hay una rama sin mergear.

```
Leé primero docs/SESSION_HANDOFF.md — resume el estado exacto del proyecto.

Hay una rama `chore/limpieza-monolito` con 4 commits que sacaron el monolito Next.js
muerto del árbol (219 archivos, ~42.000 líneas), agregaron .gitattributes con eol=lf y
reescribieron CLAUDE.md para el stack real. Falta verificarla y mergearla.

Hacé esto, en orden, y frená si algo no da verde:

1. Verificación completa (no se pudo correr cuando se hizo la limpieza):
   - npm --prefix backend run typecheck
   - npm --prefix backend test
   - npm --prefix backend run test:integration
   - npm --prefix frontend run typecheck
   - npm --prefix web run typecheck
   Si algo falla, decime QUÉ falla antes de tocar nada. La limpieza solo borró código
   muerto, así que un fallo acá casi seguro es preexistente y no lo introdujo el borrado
   — comprobalo con `git stash` o comparando contra el commit 67b0332.

2. Si todo está verde: mergeá `chore/limpieza-monolito` en `arch/split-frontend-backend`
   y pusheá. Ojo: cada push redeploya los 3 servicios de Railway. Verificá después que
   api.clariva.cl/health responda y que una clínica pueda entrar.

3. Borrá la carpeta `_to_delete/` de la raíz (contiene el monolito movido, el node_modules
   viejo y locks de git). Está en .gitignore. También podés borrar monolito-final.tar.gz
   de la raíz: el código está preservado en el tag `monolito-final`.

4. Actualizá docs/SESSION_HANDOFF.md y agregá la entrada en docs/AI_CHANGELOG.md.

No toques backend/src/scripts/migrate-tenants.ts: corre `prisma db push` sin
--accept-data-loss a propósito y está bien así.
```

---

## Prompt 1 — Backups por clínica

> El más importante. Está escrito aparte porque es largo.

**Pegá el contenido de `docs/PROMPT_BACKUPS.md`** (la parte entre "COPIAR DESDE ACÁ" y
"COPIAR HASTA ACÁ"). Antes, si podés, verificá en el dashboard de Railway qué backups
están activos en el servicio Postgres y con qué retención, así el prompt arranca con
el dato real.

---

## Prompt 2 — Observabilidad: enterarse cuando algo se rompe

```
Contexto: Cláriva es un SaaS multi-tenant en producción con dos clínicas reales
(backend Express en api.clariva.cl, frontend SPA en *.clariva.cl, web en clariva.cl,
todo en Railway). Leé docs/SESSION_HANDOFF.md y CLAUDE.md antes de empezar.

Problema: hoy no hay ninguna forma de enterarse de que algo falló. No hay Sentry ni
equivalente, ni logging estructurado, ni request-id, ni alertas: 48 `console.*` sueltos
en backend/src son toda la observabilidad. El mecanismo real de detección de errores es
que la recepcionista de la clínica llame por teléfono.

Implementá, en este orden:

1. **Healthcheck real.** `backend/src/app.ts:68` responde `{ ok: true }` sin tocar la
   base. Si Postgres deja de responder, Railway sigue viendo el servicio en verde y su
   restartPolicy nunca se activa. Que `/health` haga un `SELECT 1` contra el control-plane
   con timeout corto (2s) y devuelva 503 si falla. Cuidado: el healthcheck de Railway
   tiene `healthcheckTimeout: 300` en backend/railway.json — no lo rompas.

2. **Sentry en el backend.** Captura de excepciones no manejadas y de los errores que
   pasan por `errorMiddleware`. IMPORTANTE por multi-tenancy: etiquetá cada evento con
   el `slug` de la clínica y el id de usuario (vienen en el JWT, ver middlewares/auth.ts
   y middlewares/tenant.ts), pero **NO envíes datos de pacientes** — nombres, RUT,
   diagnósticos ni montos. Configurá `beforeSend` para filtrar el body de las requests.
   Los AppError esperados (400/401/403/404, ver lib/errors.ts) NO deberían generar ruido:
   reportá solo 5xx.

3. **Sentry en el frontend** (frontend/ y web/), con la misma regla de no mandar datos
   de pacientes.

4. **Logging con request-id.** Un middleware que genere un id por request, lo propague
   en `req` y lo incluya en cada log del backend junto al slug de la clínica. Reemplazá
   los console.* de los services por un logger mínimo (no hace falta pino; un wrapper
   propio que emita JSON en producción y texto legible en dev alcanza).

5. **Documentá en docs/OBSERVABILIDAD.md** cómo configurar UptimeRobot (o similar)
   apuntando a api.clariva.cl/health, qué alertas llegan a dónde, y cómo interpretar
   un error en Sentry (cómo llegar de un evento a la clínica afectada).

Variables de entorno nuevas: agregalas a backend/.env.example, frontend/.env.example y
web/.env.example, y dejá anotado en el doc que hay que cargarlas en Railway.

Verificá con typecheck + tests antes de commitear, y actualizá docs/AI_CHANGELOG.md y
docs/SESSION_HANDOFF.md. Trabajá en una rama aparte.
```

---

## Prompt 3 — Dos correcciones de seguridad de datos

```
Contexto: Cláriva, SaaS multi-tenant en producción con dos clínicas reales, arquitectura
database-per-tenant (cada clínica tiene su base física de Postgres). Leé
docs/SESSION_HANDOFF.md y CLAUDE.md antes de empezar.

Dos correcciones acotadas. Hacelas en commits separados.

**A) Aserción defensiva en dropTenantDatabase.**
`backend/src/lib/provision.ts:48` ejecuta DROP DATABASE de verdad. Hoy ningún camino la
llama sobre una clínica productiva —los tres call sites son rollback de creación fallida
(clinicas-registry.service.ts:99, demo.service.ts:87) y limpieza de demos expiradas
(demo.service.ts:102, filtrada por esDemo: true)—, así que NO hay un bug que arreglar.
El problema es que la función no tiene ninguna barrera propia: depende enteramente de que
quien la llame tenga razón.

Agregale una verificación que se NIEGUE a borrar una base si la clínica correspondiente
en el control-plane no está marcada `esDemo`, o si la base tiene filas en `Paciente`.
Para saltarla hay que pasar explícitamente un flag tipo
`{ confirmarBorradoProductivo: true }`. Que el mensaje de error diga claramente qué base
se intentó borrar y por qué se rechazó.

Ajustá los tres call sites existentes para que sigan funcionando igual que hoy (ninguno
debería necesitar el flag). Agregá tests: que rechace una base con pacientes, que permita
una demo, que permita una base recién creada y vacía.

**B) Correlativo de cobros dentro de la transacción.**
En `backend/src/services/cobros.service.ts:185` el número de comprobante sale de
`findFirst({ orderBy: { numero: 'desc' } })` más uno, y recién en la línea 194 empieza el
`$transaction` que crea el cobro. Dos cobros simultáneos en la misma clínica (recepción y
box cobrando a la vez) leen el mismo máximo. Como `numero` es @unique en el schema tenant
(línea 472), no se corrompe nada: el segundo cobro falla con error de constraint y para
la recepcionista se ve como "el sistema se cayó justo cuando cobraba".

Movelo adentro de la transacción con un bloqueo, o usá una secuencia de Postgres.
El mismo patrón está en las líneas 242 y 276 (revisá qué hacen antes de tocarlas).
Fijate también si `SesionCaja.numero` (línea 525 del schema) y `Presupuesto.numero`
tienen el mismo patrón, y aplicá la misma corrección si corresponde.

Agregá un test que simule dos creaciones concurrentes y verifique que ambas obtienen
números distintos.

Verificá con typecheck + tests, actualizá docs/AI_CHANGELOG.md. Rama aparte.
No toques backend/src/scripts/migrate-tenants.ts.
```

---

## Prompt 4 — Techo de escalamiento: caché de conexiones por tenant

> Con dos clínicas no molesta. Antes de vender la décima, esto tiene que estar hecho.

```
Contexto: Cláriva, SaaS multi-tenant en producción, database-per-tenant. Leé
docs/SESSION_HANDOFF.md y CLAUDE.md antes de empezar.

`backend/src/db/tenant.ts` cachea un PrismaClient por dbName en un Map, sin límite ni
expiración, y cada cliente abre su propio pool de conexiones. Con dos clínicas es
irrelevante; a treinta o cuarenta se agota el max_connections del Postgres de Railway y
la plataforma entera deja de responder. Es el techo de escalamiento más cercano que tiene
el sistema.

Además `dedupePrestacionesTodasLasClinicas()` (backend/src/lib/maintenance.ts, se dispara
en cada arranque desde src/index.ts) abre un cliente por clínica que nunca se descarta,
así que alimenta ese caché desde el primer segundo de vida del proceso.

Implementá:

1. Convertí el Map en un **LRU con tope configurable por env** (`TENANT_CLIENT_MAX`,
   default razonable ~20) que al desalojar llame a `$disconnect()`. Sumá expiración por
   inactividad (`TENANT_CLIENT_TTL_MS`). Ojo: `disposeTenant()` ya existe y lo usan la
   provisión y el restore — mantené su semántica.

2. Limitá el pool de cada cliente por tenant (`connection_limit` en la URL de conexión,
   ver `tenantUrl()`), para que N clínicas activas no multipliquen conexiones sin techo.
   Calculá y documentá el máximo teórico: TENANT_CLIENT_MAX × connection_limit + el pool
   del control-plane, y comparalo contra el max_connections del Postgres de Railway.

3. Hacé que `dedupePrestacionesTodasLasClinicas()` llame a `disposeTenant()` después de
   cada clínica, y envolvé `dedupePrestaciones` (backend/src/services/catalogo.service.ts)
   en `$transaction`: hoy reasigna tratamiento e itemPresupuesto y después borra las
   prestaciones duplicadas en tres operaciones sueltas, así que si el proceso muere en el
   medio —y corre en cada arranque, incluso durante un deploy— queda a medio camino.

4. Documentá en docs/architecture.md el techo de conexiones y cuándo hay que revisarlo.

Agregá tests del LRU (desaloja el menos usado, llama a disconnect, respeta el TTL).
Verificá con typecheck + tests. Rama aparte.
```

---

## Prompt 5 — ESLint para el stack nuevo

> Chico, pero hoy el proyecto no tiene linter de ningún tipo.

```
Contexto: Cláriva, monorepo con backend/ (Express + TypeScript), frontend/ y web/
(Vite + React + TypeScript) y shared/ (DTOs). Leé CLAUDE.md antes de empezar.

La única configuración de ESLint que existía era la del monolito Next.js, que se eliminó
del repo el 2026-08-03. O sea: hoy no hay linter para ninguno de los tres servicios vivos.

Configurá ESLint 9 (flat config) para el monorepo:
- Una base compartida con typescript-eslint.
- backend/: reglas de Node/Express. Marcá como error las promesas sin await
  (no-floating-promises) — en un backend con Prisma eso es una fuente real de bugs.
- frontend/ y web/: reglas de React + hooks.
- shared/: solo tipos, config mínima.

Agregá el script `lint` al package.json de cada servicio. Corré el lint y arreglá lo que
salga, PERO: si aparecen más de ~30 advertencias, no las arregles todas de una — dejá
esas reglas en `warn`, anotá en docs/AI_CHANGELOG.md cuáles quedaron pendientes, y
subilas a `error` en una tanda posterior. No quiero un commit gigante de cambios
automáticos mezclado con la configuración.

No cambies comportamiento de runtime en este trabajo: solo configuración y arreglos de
lint evidentes. Verificá con typecheck + tests antes de commitear. Rama aparte.
```

---

## Referencia rápida para el desarrollador

**Antes de cualquier cambio:** leer `docs/SESSION_HANDOFF.md` y `CLAUDE.md`.

**Verificación (siempre, antes de commitear):**

```powershell
npm --prefix backend run typecheck
npm --prefix backend test
npm --prefix backend run test:integration
npm --prefix frontend run typecheck
npm --prefix web run typecheck
```

**Reglas que no se negocian:** no tocar `migrate-tenants.ts` (omite `--accept-data-loss`
a propósito) · no debilitar el aislamiento entre clínicas · no agregar call sites de
`dropTenantDatabase()` · cada push a `arch/split-frontend-backend` redeploya los 3
servicios de producción.

**Al cerrar cada tarea:** entrada nueva arriba en `docs/AI_CHANGELOG.md` y
`docs/SESSION_HANDOFF.md` sobrescrito con el estado real.
