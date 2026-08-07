# AI Changelog

> Historial cronológico de cambios realizados con asistencia de Claude.
> **Las entradas más recientes van arriba.** Añade entradas nuevas insertándolas debajo del encabezado.

---

## 2026-08-07 — Editar username + contratos robustos por profesional (Equipo)

Dos ajustes de organización (frontend-only, sin cambios de backend/endpoints). Rama
`feat/equipo-contratos-robustos`, desplegado.

- **Editar el usuario (login).** El editor de usuario (Equipo → Editar → pestaña Datos) no
  exponía el `username`: no se podía agregar (a quien lo tenía vacío) ni cambiar. Se agregó el
  campo; se envía solo si tiene contenido (no se puede vaciar por error). El backend ya validaba
  formato + unicidad en `actualizarUsuario` — solo faltaba el campo en la UI.
- **Montos fijos por prestación → pestaña Contrato del profesional.** La config de montos fijos
  vivía en el modal "Contratos" de Liquidaciones, donde no corresponde (y duplicaba la pestaña
  "Contrato" que ya existía en Equipo). Se movió a **Equipo → (profesional) → Editar → Contrato**,
  que ahora es el único lugar de configuración: **contrato base (%/fijo) + montos fijos por
  prestación**, por profesional. Se quitó el botón/modal "Contratos" de Liquidaciones (queda solo
  Activas/Finalizadas).
  - **Implicación de permisos:** configurar contratos pasó de `puedeGestionarLiquidaciones` (el
    modal viejo) a `puedeGestionarEquipo` (la pestaña de Equipo). En las 3 clínicas los admin lo
    tienen. Caso puntual: **José Araya (orodent)** tiene liquidaciones pero no equipo → ya no
    configura contratos; **orodent está inactiva**, y cuando se reactive se le creará un usuario
    admin (decisión del usuario, no se pre-habilitó nada).
- **Verificación:** typecheck be/fe/web ✓ · integración 68/68 · contrato ✓ · lint 0 errores.
  Deploy FE+BE SUCCESS, `/health` 200. Sin migración (frontend-only).

---

## 2026-08-06 — Ordenamiento de la navegación del panel (+ permiso de Reportes)

Reorganización de la navegación de las clínicas (mismos componentes/colores; cambia dónde
vive cada cosa y quién la ve). Rama `chore/nav-reorg`, commits separados A–E.

- **A) Permiso `puedeVerReportes` (seguridad, no cosmético).** Los 7 endpoints `/reportes/*`
  usaban solo la cadena `tenant`: **cualquier** usuario con login de la clínica podía descargar
  la nómina de pacientes (con teléfono/previsión), cobros y morosos. Se creó el permiso (patrón
  de `puedeGestionarAgenda`: schema, permiso.ts union+select, auth.service, usuarios.service,
  shared/types, Equipo.tsx) y la cadena `reportesTenant = [requireAuth, requireTenant,
  requirePermiso('puedeVerReportes')]` aplicada a las 7 rutas. Default false; admin siempre true.
  Test de integración: staff sin permiso → **403**; admin y staff habilitado → no 403.
- **B) CRM al header.** `CRM · Leads` salió del desplegable y quedó anclado en el header (trabajo
  diario: 495 leads). Misma condición `modCrm && (esAdmin || puedeCrm)`.
- **C) Menú agrupado + rename a "Gestión".** El desplegable (antes "Administración", 13 ítems
  planos) se agrupó en secciones con título+separador: Clínica · Documentos · Captación · Dinero
  · Análisis · Cuenta. Sección sin ítems visibles no muestra el título. Reportes gateado por el
  permiso nuevo.
- **D) Configuración en pestañas.** `Configuracion.tsx` (scroll largo, 4 bloques) → pestañas
  Datos y mensajes · Medios de pago · Pagos online · Google Calendar, con la activa en `?tab=`.
  Sin cambios de lógica/endpoints: solo se reordenó el render.
- **E) Liquidaciones unificadas.** Una sola entrada "Liquidaciones"; `/liquidaciones` renderiza
  la vista de gestión (todo el equipo) si `puedeGestionarLiquidaciones`, si no la propia.
  `/mis-liquidaciones` redirige. Componentes intactos.
- **Habilitación inicial de Reportes (decisión):** en el deploy se pre-habilita `puedeVerReportes`
  a los operadores que hoy lo usan — **orodent: José Andrés Araya** (opera la clínica, role doctor,
  sin admin), **digital-dent: Katherine Beltran + Javier Aedo**. El resto queda en false (los
  admins siempre ven). montenegro no tiene usuarios no-admin.
- **Verificación:** typecheck be/fe/web ✓ · unit **118/118** · integración **68/68** (+4 del 403)
  · contrato ✓ · lint backend 0 / frontend 0 errores.

---

## 2026-08-06 — Montos fijos por prestación en liquidaciones (override del contrato)

Nuevo item de liquidación: un profesional puede cobrar un **monto fijo por una prestación
específica**, configurado en la sección de contratos. Rama `feat/montos-fijos-prestacion`.

- **Regla de cálculo** (confirmada con el usuario): al liquidar un tratamiento de una
  prestación con monto fijo `F` configurado, se paga **min(F, lo cobrado) − retención del
  medio de pago**. Si lo cobrado ≥ F → `F − retención`; si lo cobrado < F → `lo cobrado −
  retención` (el máximo disponible). Es una **capa de override sobre el contrato base**: las
  prestaciones sin fijo siguen el % / monto fijo general.
- **Modelo** (`MontoFijoPrestacion`, aditivo): `doctorId + prestacionId + montoFijo`, único por
  `(doctorId, prestacionId)`. Se ata al **profesional** (no al Contrato) para sobrevivir a la
  recreación del contrato al editar el % base. `LiquidacionItem.origenCalculo` (nullable) guarda
  qué regla aplicó (`PORCENTAJE | MONTO_FIJO | MONTO_FIJO_PRESTACION`) en el snapshot.
- **Cálculo** en `liquidaciones.service.ts` (`calcAccion` recibe el mapa prestacionId→fijo del
  doctor); el override manda sobre el contrato base cuando aplica. Endpoints `GET/POST/DELETE
  /montos-fijos` (upsert por doctor+prestación; guardados con el permiso de liquidaciones).
- **Frontend**: en `ContratosModal` se configura la lista de montos fijos por prestación del
  profesional; en la liquidación activa el item se marca con un badge "Monto fijo" y su
  explicación detalla min(fijo, cobrado) − retención.
- **FK-seguro**: el seed de tests, `eliminarPrestacion` y el `dedupe` de prestaciones limpian los
  montos fijos antes de borrar la prestación (config, no dato clínico; los tratamientos siguen
  bloqueando el borrado como antes).
- **Migración aditiva** (tabla + columna nullable): la aplica `migrate:tenants` por el flujo
  normal (no es el caso del `@unique` sobre columna poblada). init.sql regenerado.
- **Verificación**: typecheck (be/fe/web) ✓ · unit **118/118** · integración **64/64** (+4:
  fijo ≤ cobrado, fijo > cobrado, upsert, borrado→vuelve al %) · contrato ✓ · lint backend 0.
  Falta prueba manual en la UI desplegada.

---

## 2026-08-05 — Self-check de schema en provisionTenant()

`provisionTenant()` hacía `createTenantDatabase` + `applyTenantSchema` y nada más. La guarda
anti-drift cubre el init.sql desactualizado en el repo, pero NO que el DDL se aplique a
medias en runtime — así nació una demo con **491 columnas en vez de 588**. Rama
`defense/caja-unique-provision-selfcheck`.

- **`verificarSchemaTenant(dbName)`** (`lib/provision.ts`): tras aplicar el DDL, compara las
  columnas que el schema **declara** (vía `Prisma.dmmf` del cliente generado — misma fuente que
  usa el código, respeta `@map/@@map`, saltea relaciones) contra las que **existen** de verdad
  (`information_schema.columns`). Devuelve las faltantes (`Tabla.columna`). La lógica de
  comparación se extrajo a **`columnasFaltantes(existentes)`** (pura, testeable sin base).
- **`provisionTenant()` ahora es ATÓMICO**: si el DDL falla o el self-check encuentra faltantes,
  **borra la base que acababa de crear** (mejor no crear la clínica que crearla rota — la base
  recién creada, sin registro ni pacientes, cae por el camino no-productivo de
  `dropTenantDatabase`) y relanza `ProvisionIncompletaError` (con la lista de lo que faltó).
  Reporta a **Sentry** con tag `db=<dbName>` (nuevo parámetro `dbName` en `captureError`).
- **Error limpio al lead**: `crearDemo` (y el alta admin en `clinicas-registry`) envuelven
  `provisionTenant` y, ante un fallo de provisión, lanzan `serviceUnavailable` (**503**, nuevo
  helper en `lib/errors`) — el lead ve "probá de nuevo en unos minutos", no un **500** crudo.
- **Sin falsos positivos**: verificado read-only que `verificarSchemaTenant` da **0 faltantes**
  en las 3 bases reales (completas) → el self-check no rompe el alta de clínicas/demos correctas.
- **Test**: `provision.test.ts` cubre `columnasFaltantes` (base vacía → cientos de faltantes;
  completa → 0; falta puntual detectada; tabla entera ausente).
- **Verificación**: typecheck ✓ · unit **118/118** · integración **60/60** · contrato ✓. Falta
  la prueba end-to-end desde la landing (requiere deploy).

---

## 2026-08-05 — @unique en Caja.numero y SesionCaja.numero (red del correlativo)

El correlativo de caja/sesión ya era race-safe (helper `siguienteNumero` con advisory
lock), pero el campo era `Int @default(0)` sin restricción: un duplicado por otro camino
pasaría en silencio. Se agrega la red del constraint. Rama `defense/caja-unique-provision-selfcheck`.

- **Schema** (`prisma/tenant/schema.prisma`): `Caja.numero` y `SesionCaja.numero` → `Int @unique @default(0)`.
  Se **conserva** el `@default(0)` (con comentario que explica por qué): quitarlo obligaría a un
  `db push --accept-data-loss` sobre bases productivas, y `migrate-tenants` nunca usa ese flag
  (regla 1). El default quedó **inerte** (los 3 paths de inserción setean numero explícito; ningún
  seed crea cajas), y el `@unique` lo auto-protege: un segundo `0` rebota contra el índice.
- **Precondición verificada**: script `src/scripts/caja-numeros.ts` recorrió las 3 clínicas →
  **0 filas con numero=0** en Caja y SesionCaja (nada que backfillear). El backfill perezoso
  (`asegurarNumerosCaja`/`asegurarNumerosSesion`, ahora exportados) ya había corrido.
- **Aplicación del índice**: `prisma db push` marca el `@unique` sobre columna poblada como
  "data loss" (falso positivo), así que NO pasa por `migrate-tenants`. Se aplicó con
  `CREATE UNIQUE INDEX` explícito (aditivo, no destructivo) vía `src/scripts/aplicar-caja-unique.ts`,
  **todo-o-nada** con pre-chequeo de duplicados + rollback: las **3 bases** quedaron con
  `Caja_numero_key` y `SesionCaja_numero_key` (nombres que Prisma espera). Backup fresco antes
  (regla 10). Verificado: `migrate-tenants` da **diff vacío** en las 3 (bases existentes + init.sql
  de nuevas alineados).
- **init.sql** regenerado (`tenant:initsql`) con los 2 índices → clínicas/demos nuevas nacen con
  la restricción. Guarda anti-drift (`init-sql-sync.test.ts`) verde.
- **`asegurarNumerosCaja`/`asegurarNumerosSesion`**: siguen alcanzables (el default existe); quedan
  como **defensa histórica** (backfill de filas viejas en 0), ya sin trabajo pendiente.
- **Test**: `correlativo-concurrente.test.ts` ahora pasa `numero` explícito a las cajas-fixture
  (con `@unique`, dos creates sin numero colisionarían en 0 — que es la protección buscada).
- **Verificación**: typecheck ✓ · unit **114/114** · integración **60/60** · contrato ✓.

---

## 2026-08-05 — 2FA TOTP obligatorio para super-admin

El super-admin (schema de CONTROL) ve todas las clínicas: era la cuenta sin segundo factor.
Ahora su login es en dos pasos. **El login de las clínicas (slug+usuario) NO se toca.**
Rama `feat/2fa-superadmin`.

- **Schema (aditivo)** — `prisma/control/schema.prisma`, modelo `PlatformAdmin`: `totpSecret`
  (cifrado), `totpEnabled`, `totpBackupCodes` (JSON de hashes bcrypt), `totpEnrolledAt`. Se
  aplica en deploy con `control:push` (prestart); no requiere `migrate:tenants`.
- **Helpers** — `lib/totp.ts` (NUEVO): `otplib@^12` (API `authenticator`; v13 rompía el
  import) + `qrcode`. Genera secreto, `otpauth://` URI, QR data-URL, verifica TOTP (ventana ±1)
  y genera/normaliza/hashea (bcrypt) los códigos de respaldo.
- **auth.service.ts** — el login por email **no emite sesión**: firma un **desafío** JWT
  (`stage:'2fa'`, TTL 10 min, `modo: 'alta'|'codigo'`) que `verifyToken` **rechaza como Bearer**.
  `setup2FA(desafio)` (solo modo alta) devuelve QR+secreto+10 códigos una vez y persiste el
  secreto **cifrado AES-256-GCM** (mismo `lib/crypto` que Google) + los hashes. `verify2FA`
  valida TOTP **o** un código de respaldo de un solo uso (lo consume), con **rate limit propio**
  (`lib/rate-limit`, 5/15 min por `sub` y por IP; solo fallos gastan cupo) y emite la sesión;
  en el alta, además habilita el 2FA.
- **Rutas/controllers** — `POST /auth/2fa/setup` y `POST /auth/2fa/verify`.
- **Shared** — `Login2FAChallenge`, `LoginResult = LoginResponse | Login2FAChallenge`, `Setup2FAResponse`.
- **Frontend** — `authService.login` devuelve `LoginResult` (setea token solo si viene `token`);
  `setup2FA`/`verify2FA`; `useAuth` expuesto; `Login.tsx` con sub-vista de segundo paso (QR +
  códigos en el alta, input de código en logins siguientes). Login de clínica intacto.
- **Docs** — `docs/SECURITY.md` §7 + procedimiento de recuperación si se pierden authenticator
  Y todos los códigos (reset manual del 2FA vía acceso directo a `clariva_control`).
- **Verificación** — typecheck (backend/frontend/web) ✓ · unit **114/114** · integración
  **60/60** (5 tests nuevos del flujo completo: alta, login válido/inválido, respaldo de un solo
  uso; `multitenant.test.ts` adaptado con helper `loginSuper()`) · contrato ✓ · lint backend 0.
- **Riesgos/pendientes** — al desplegarse, el primer login del super-admin cae en **alta**: hay
  que escanear el QR y **guardar los códigos** en ese momento. No hay reset self-service por
  diseño (ver SECURITY.md).

---

## 2026-08-04 — ESLint 9 (flat config) para el monorepo

El único ESLint que había era el del monolito Next.js (borrado). Ninguno de los 3 servicios
vivos tenía linter. Rama `chore/eslint-flat-config`.

- **Base compartida** (`eslint.base.mjs`, en la raíz): NO importa dependencias (cada servicio
  tiene su propio `node_modules`); exporta bloques comunes (ignores + ajustes de reglas) que
  cada servicio compone con su `typescript-eslint`. Reglas comunes: `no-unused-vars` warn
  (ignora `_`-prefijados), `no-explicit-any` off (el código lo usa a propósito),
  `no-unused-expressions` con `allowShortCircuit/allowTernary` (patrones `a && f()` / `a ? f() : g()`).
- **Por servicio** (`eslint.config.mjs` + script `lint` en cada `package.json`, ESLint `^9`):
  - **backend/**: `recommended` + globals de Node + **`no-floating-promises` como ERROR**
    (type-aware vía `projectService`) — en un backend con Prisma, una promesa sin await/void es
    fuente real de bugs. Resultado: **0 promesas flotantes** (el código ya estaba limpio).
  - **frontend/** y **web/**: `recommended` + reglas de React (`eslint-plugin-react`) y de hooks
    (`react-hooks/rules-of-hooks` error, `exhaustive-deps` warn), apagando lo que no aplica al
    stack (JSX runtime automático, prop-types de TS, `no-unescaped-entities` en UI en español).
  - **shared/**: config mínima (solo tipos), `recommended`.
- **Arreglos evidentes** (sin cambiar runtime): `let`→`const` (1), quitar directivas
  `eslint-disable` muertas del viejo config (no-console/no-explicit-any), prefijar `_` un param
  sin usar, e `eslint-disable` inline en el snippet oficial del Meta Pixel (`prefer-spread`).
- **Estado final del lint:** backend/web/shared **0 problemas**; frontend **0 errores, 6
  warnings** — 5 `react-hooks/exhaustive-deps` (intencionales; arreglarlas a mano puede cambiar
  runtime) + 1 `no-unused-vars`. Bien por debajo de 30, así que quedan como **warnings** (no se
  forzó un commit gigante de auto-fixes). **Diferido:** endurecer `exhaustive-deps` (revisar caso
  por caso) y el `no-unused-vars` restante.

**Verificación:** typecheck backend/frontend/web ✓ · unit 114/114 ✓ · integración 54/54 ✓.
No se cambió comportamiento de runtime. No se tocó `migrate-tenants.ts`.

---

## 2026-08-04 — Limpieza de demos: arreglado el criterio de la barrera + red de seguridad

La barrera de `dropTenantDatabase` (2026-08-03) rompió la limpieza de demos: `esBaseProductiva()`
consideraba productiva a cualquier base "no-demo **O con pacientes**", y una demo se siembra
con 5 pacientes por diseño. Así `limpiarDemosExpiradas()` lanzaba y **ninguna demo expirada se
borraba** — cada demo de la landing quedaba como una base Postgres permanente. Rama `fix/limpieza-demos`.

- **Fix del CRITERIO** (`lib/provision.ts`, función pura `evaluarProductiva`): si hay registro
  en el control-plane, **el flag `esDemo` manda** (demo → NO productiva, sus pacientes son del
  seed; clínica real → productiva, requiere el flag). Solo una base **huérfana** (sin registro)
  cae a la heurística de conteo de pacientes. NO se resolvió pasando `confirmarBorradoProductivo:
  true` a la limpieza (eso le daría a un job diario permiso para borrar bases productivas, justo
  lo que la barrera evita, y el flag `esDemo` puede estar mal).
- **Red contra el flag mal puesto** (`demo.service.ts`, función pura `pareceDemo`): la limpieza
  se **niega** a borrar una base que no parezca un demo aunque esté marcada como tal —
  `> 50 pacientes` (seed=5, margen 10×; una clínica real nunca pasa) o vida útil que no condice
  con un demo (`demoExpiraEn − createdAt` fuera de ~30 d, o sin `demoExpiraEn`). Al rechazar,
  **loguea (`log.error`) y reporta a Sentry** (`captureError`) en vez de fallar en silencio — así
  una base rara sale a la superficie. `limpiarDemosExpiradas()` ahora devuelve `rechazadas[]`.
- **Tests** (`test/limpieza-demos.test.ts`, 8): demo (con pacientes de seed) se puede borrar ·
  clínica real no · base marcada demo con volumen de clínica real → rechazada · huérfana con
  pacientes → requiere flag · + los rechazos de `pareceDemo` (volumen, sin expiry, vida útil).

**Verificación:** typecheck ✓ · unit 114/114 ✓ · integración 54/54 ✓. No se tocó `migrate-tenants.ts`.
**Pendiente (tras deploy):** correr la limpieza en prod y reportar cuántas demos colgadas se
borraron + auditar bases huérfanas de demos viejas sin registro en el control-plane.

---

## 2026-08-04 — `init.sql` resincronizado con el schema tenant + guarda anti-drift

`prisma/tenant/init.sql` estaba ~630 líneas atrás del schema (el último cambio fue meter 2
columnas a mano en `364b674`). Ese archivo es el DDL con el que `applyTenantSchema()`
(`lib/provision.ts`) crea la base de una clínica **nueva** y de cada **demo** de la landing,
así que toda clínica/demo nueva nacía con columnas faltantes. NO afecta a las clínicas
existentes (sincronizadas por `migrate:tenants`). Rama `fix/init-sql-sincronizado`.

- **Regenerado** con `npm run tenant:initsql`. El diff es **puramente aditivo**: 0 tablas y
  0 columnas removidas; **+2 tablas** (`AuditLog`, `LiquidacionAdjunto`) + columnas/índices.
  Los "borrados" del diff textual eran reordenamiento de Prisma.
- **Parser endurecido** (`lib/sql-split.ts`): `applyTenantSchema()` hacía `sql.split(';')` a
  secas — se rompería si el DDL trajera un `;` dentro de un string, comentario o cuerpo de
  función. El DDL de hoy no tiene esos casos, pero el split ahora respeta strings (con
  escape `''`), dollar-quotes y comentarios. Test `test/sql-split.test.ts` (7).
- **Verificación real:** se provisionó una base **descartable** con el init.sql nuevo (server
  de prod) y su schema físico resultó **IDÉNTICO** a digital-dent (clínica productiva):
  588 columnas, 85 índices, 54 FKs — 0 diferencias. Base descartable borrada.
- **Guarda anti-drift** (`test/init-sql-sync.test.ts`): regenera el DDL desde el schema y
  falla si difiere del `init.sql` commiteado. Así, olvidarse de `tenant:initsql` al cambiar
  el schema tenant se detecta en la suite (que quedó 100% verde).
- **Auditoría de las bases existentes** (paso 6): las 3 clínicas reales (montenegro,
  digital-dent, orodent) están completas (588/85/54). El único con schema incompleto es la
  demo **`demo-dv20mz`** (491/588) — un **demo expirado** que `migrate:tenants` **salta a
  propósito** (los demos son descartables y su base puede ya no existir). Con el init.sql
  sincronizado, los demos nuevos nacen completos.
- **Doc:** `CLAUDE.md` regla 2 reforzada (`tenant:initsql` no es opcional + la guarda).

**Propuesta pendiente (paso 5, NO implementada):** que `provisionTenant()` verifique el
schema resultante tras aplicar el DDL, como red de último momento. Ver la propuesta al final.

**Verificación:** typecheck ✓ · unit 106/106 ✓ · integración 54/54 ✓. No se tocó
`migrate-tenants.ts`.

> **Propuesta — self-check en `provisionTenant()`:** tras `applyTenantSchema()`, contar
> columnas/tablas contra un valor esperado (o comparar contra el DDL) y **fallar la
> provisión** si no coincide, en vez de dejar una base a medio crear. Pro: atrapa un
> init.sql corrupto/incompleto en el acto (la clínica no se crea rota). Contra: acopla un
> "número esperado" que hay que mantener (o una introspección más cara en cada alta). Con la
> guarda de test + el init.sql ya sincronizado, el riesgo es bajo; lo dejo propuesto para
> decidir si vale el costo.

---

## 2026-08-04 — Los 2 tests de integración en rojo: arreglados (eran tests desactualizados)

`test:integration` daba 48/50 desde hacía semanas (consentimientos + conversión de lead).
Diagnóstico: **ambos eran tests viejos que asumían un contrato que el código cambió a
propósito** — el código estaba bien, no había bug. No se tocó código de producción; se
actualizaron los tests. Rama `fix/tests-integracion-rojos`.

- **Conversión de lead** (`pagos-liquidaciones.test.ts` "capta un lead… y lo convierte"):
  el test esperaba `lead.estado === 'CONVERTIDO'` tras `POST /crm/leads/:id/convertir`. Pero
  el 2026-07-27 `convertirEnPaciente` ("Solo crear paciente") pasó a ser **administrativo por
  diseño**: vincula el paciente y **CONSERVA** el estado (no marca CONVERTIDO ni dispara el
  evento "customer" de Meta antes de tiempo). Fix: el test ahora asegura que el estado se
  **conserva** (`NUEVO`) y que `lead.pacienteId` queda vinculado.
- **Consentimientos** (`pagos-liquidaciones.test.ts` "valida datos faltantes, genera…"):
  el test mandaba `generar` con solo `{pacienteId, plantillaId}`. Pero `generar` hoy **exige
  un profesional responsable** (`responsableId`, con agenda) y, para plantillas de categoría
  CONSENTIMIENTO, **un plan de tratamiento asociado** (`planId`) — requisitos de producto con
  mensajes de usuario claros. Fix: el test crea un plan y pasa `responsableId` (un doctor) +
  `planId`; así prueba de verdad el gate de datos faltantes (400) y luego el 201.

**Verificación:** typecheck ✓ · unit 98/98 ✓ · **integración 54/54** (antes 52/54). La suite
de integración queda **100% verde**. No se tocó código de producción ni `migrate-tenants.ts`.

---

## 2026-08-04 — Techo de conexiones: caché LRU de clientes por tenant + pool acotado

`db/tenant.ts` cacheaba un `PrismaClient` por `dbName` en un `Map` **sin límite ni
expiración**, y cada cliente abría su pool con el default de Prisma. Con 2 clínicas da
igual; a decenas se agota el `max_connections` del Postgres y la plataforma entera deja de
responder — el techo de escalamiento más cercano. Rama `perf/tenant-client-lru`.
Doc: `docs/architecture.md` "Techo de conexiones".

- **LRU genérico** (`lib/lru.ts`, `AsyncLru`): tope de tamaño (desaloja el **menos usado**
  y llama a `$disconnect()`) + **expiración por inactividad** (TTL, con barrido periódico).
  Reloj y `dispose` inyectables para testear. `disposeTenant()` mantiene su semántica
  (delete + disconnect), que usan provisión/restore/sync.
- **`tenant.ts`**: el `Map` pasó a `AsyncLru` (`TENANT_CLIENT_MAX`=20, `TENANT_CLIENT_TTL_MS`
  =5 min). Cada cliente acota su pool con `connection_limit` (`TENANT_CLIENT_POOL`=3) **solo
  en la URL de Prisma** — `tenantUrl()` cruda (pg_dump/`db push`) queda sin ese parámetro,
  que libpq no acepta. Timer `unref()` para el barrido (no en tests).
- **Control-plane** (`db/control.ts`): también acota su pool (`CONTROL_DB_POOL`=10).
- **Máximo teórico:** `20×3 + 10 = 70` conexiones desde el backend, contra `max_connections`
  (verificar `SHOW max_connections;`, default ~100; dejar headroom para los crons).
- **`dedupePrestacionesTodasLasClinicas()`** (corre en cada arranque) ahora hace
  `disposeTenant()` por clínica (`finally`), para no alimentar el LRU desde el arranque.
- **`dedupePrestaciones()`** (`catalogo.service.ts`): las 3 operaciones por grupo (reasignar
  `tratamiento` + `itemPresupuesto`, borrar duplicadas) van ahora en **`$transaction`** —
  si el proceso muere a mitad (corre en cada deploy) ya no deja datos apuntando a una
  prestación borrada. Se lee afuera y se transacciona solo si hay duplicados.
- **Tests** (`test/lru.test.ts`, 6): desaloja el menos usado y lo dispone; TTL expira e
  crea nuevo; `sweepExpired`; reusar no recrea; `delete()` dispone.

**Verificación:** typecheck backend ✓ · unit 98/98 ✓ · integración 52/54 (los 2 fallos
—consentimientos y conversión de lead— son preexistentes). No se tocó `migrate-tenants.ts`.

---

## 2026-08-04 — Correlativos: `Paciente.numero` y `Caja.numero` al mismo helper

Cierre de los dos correlativos que habían quedado con el patrón viejo de carrera (ver la
entrada "Correlativos seguros ante creación concurrente"). Rama `fix/correlativo-paciente-caja`.

- **Helper extendido** (`lib/correlativo.ts`): tipos `paciente` y `caja` + un **piso por
  tipo** (`PISO`) — `paciente: 1000` (las fichas arrancan en 1000 por convención de la
  clínica), el resto `1`. `siguienteNumero` ahora devuelve `Math.max(PISO, max+1)` (el
  comportamiento previo de cobro/sesión/presupuesto no cambia: piso 1). Para `paciente`,
  el read del máximo filtra `numero != null` (es `Int?`; en Postgres `orderBy desc`
  pondría los NULL primero y devolvería null) — corrige un bug latente del cálculo viejo.
- **`Paciente.numero`** (`@unique`) — los **3** generadores se movieron a `$transaction`
  con `siguienteNumero(tx, 'paciente')`: `pacientes.service.ts` `crearPaciente`,
  `agenda-online.service.ts` (reserva online) y `crm.service.ts` (conversión de lead).
  Antes dos altas simultáneas (recepción + reserva online) chocaban con el `@unique`.
- **`Caja.numero`** (`Int @default(0)`, SIN unique — la carrera duplicaba en silencio):
  `crearCaja` y `abrirCajaParaUsuario` ahora generan el número en `$transaction`. Se
  eliminó `siguienteNumeroCaja`. Los **backfills** `asegurarNumerosCaja` /
  `asegurarNumerosSesion` (asignan número a filas `numero=0`) corren dentro de una
  transacción con el advisory lock, para no colisionar con una creación concurrente.
- **Tests** (`correlativo-concurrente.test.ts`): dos altas de paciente simultáneas →
  números distintos **y ambos ≥ 1000** (piso); dos cajas simultáneas (usuarios distintos)
  → números distintos.

**Verificación:** typecheck backend ✓ · unit 92/92 ✓ · integración 52/54 (los 2 fallos
—consentimientos y conversión de lead— son preexistentes). No se tocó `migrate-tenants.ts`.

> **Propuesta `@unique` en `Caja.numero` (NO aplicada):** conviene como red, pero requiere
> orden. (1) Correr el backfill en TODAS las clínicas hasta que no queden filas con
> `numero=0` ni duplicados; (2) verificar por clínica que
> `SELECT numero, count(*) FROM "Caja" GROUP BY numero HAVING count(*)>1` da vacío;
> (3) recién ahí agregar `@unique` al schema + `tenant:initsql` + `migrate:tenants`. Si se
> agrega antes, el `db push` aborta en las bases con duplicados/ceros.

---

## 2026-08-04 — Google OAuth a producción + páginas legales + verificación enviada

Cierre operativo de Google Calendar (el código ya estaba; ver la entrada de "sync visible").

- **App OAuth pasada de "Testing" a "En producción"** en Google Cloud Console (nueva UI
  "Google Auth Platform" → pestaña "Público" → "Publicar app"). En Testing los refresh
  tokens caducan a los **7 días** — era la causa raíz de que la sync se cayera sola cada
  semana. En producción son de larga duración. digital-dent **reconectada** para emitir un
  token nuevo (el viejo arrastraba la caducidad de Testing).
- **Páginas legales** creadas y desplegadas (`web/`): `clariva.cl/privacidad` y
  `clariva.cl/terminos` (+ layout legal compartido, links en el footer). La Política de
  Privacidad incluye la sección de datos de Google (scopes, uso, tokens cifrados) y la
  **declaración de Uso Limitado** de la Google API Services User Data Policy. **Borradores:
  revisar con abogado.**
- **Home con contenido estático** (`web/index.html`): el `#root` estaba vacío para crawlers
  sin JS, y la verificación de marca objetaba "la home no explica el propósito" y "el nombre
  no coincide". Se agregó un bloque estático (nombre "Cláriva" + propósito + links legales)
  que React reemplaza al montar; ahora es visible sin ejecutar JS.
- **Verificación de marca/OAuth: ENVIADA a revisión manual** de Google (los scopes de
  Calendar son *sensibles*, no *restringidos* → sin auditoría de seguridad CASA). Requisitos
  armados: dominio verificado en Search Console, pantalla de consentimiento (nombre
  "Cláriva", privacidad, términos, dominio autorizado), justificaciones de scopes. Tarda
  semanas; la app funciona igual mientras tanto (con aviso de "app no verificada" al conectar).

**Scopes usados** (`backend/src/lib/google.ts`): `calendar`, `calendar.events`,
`userinfo.email`, `openid`. Pendiente evaluar angostar `calendar` → `calendar.calendarlist.readonly`.

---

## 2026-08-04 — Correlativos (`numero`) seguros ante creación concurrente

El número de comprobante de cobro (y de apertura de caja y de presupuesto) se calculaba
con `findFirst({ orderBy: { numero: 'desc' } }) + 1` **fuera** de la transacción. Dos
operaciones simultáneas en la misma clínica (recepción y box cobrando a la vez) leían el
mismo máximo; como `Cobro.numero`/`Presupuesto.numero` son `@unique`, la segunda fallaba
con error de constraint — para la recepcionista, "el sistema se cayó justo al cobrar".
Rama `fix/correlativo-cobros`.

- **Helper `siguienteNumero(tx, tipo)`** (`backend/src/lib/correlativo.ts`): genera el
  correlativo **dentro** de la transacción, serializando con un **advisory lock
  transaccional de Postgres** (`pg_advisory_xact_lock`, una clave por tipo para que
  cobros/sesiones/presupuestos no se bloqueen entre sí). El lock se libera al cerrar la
  transacción, así que read del máximo + insert quedan atómicos frente a otra transacción
  del mismo tipo. En los tests (SQLite) la función no existe → se omite; SQLite ya
  serializa las escrituras.
- **Sitios corregidos** (el read del número se movió adentro del `$transaction` con el
  create): `cobros.service.ts` `crearCobro` (185), `crearCobroLinkPago` (242),
  `crearCobroLibreConLink` (276); `agenda-online.service.ts` (abono de reserva online, 4º
  sitio de `Cobro.numero`); `lib/caja.ts` `abrirSesion` (`SesionCaja.numero`);
  `presupuestos.service.ts` `crearPresupuesto` (`Presupuesto.numero`).
- **Test de concurrencia** (`test/integration/correlativo-concurrente.test.ts`): dos
  creaciones simultáneas de Presupuesto y de apertura de caja (cajas distintas) obtienen
  números distintos. Sin el fix, una rechaza con P2002. Ambos usan el mismo `siguienteNumero`
  que los 4 sitios de cobro.
- **`Paciente.numero` y `Caja.numero`:** quedaron con el patrón viejo en esta tanda; se
  aplicaron el mismo helper en un follow-up (ver la entrada del 2026-08-04 "Correlativos:
  `Paciente.numero` y `Caja.numero` al mismo helper").

**Verificación:** typecheck backend ✓ · unit 92/92 ✓ · integración 50/52 (los 2 fallos
—consentimientos y conversión de lead— son preexistentes, ver `PROMPTS_SIGUIENTES.md`).
No se tocó `migrate-tenants.ts`.

---

## 2026-08-04 — Observabilidad ENCENDIDA en prod + endurecimiento de PII

Puesta en marcha operativa de la observabilidad (el código ya estaba desde el 2026-08-03).
Doc: `docs/OBSERVABILIDAD.md` §0. **En producción, sin cortar servicio** (dos clínicas reales).

- **Capa 1 backups** (volumen Railway + PITR) activada — ver `docs/BACKUPS.md`.
- **3 proyectos Sentry** creados (plan Developer, gratis): `Clariva Backend` (Node),
  `Clariva Front End` y `Clariva WEB` (React). DSN cargados en Railway: `SENTRY_DSN` +
  `SENTRY_ENVIRONMENT=production` en `BACKEND`; `VITE_SENTRY_DSN` + `VITE_SENTRY_ENVIRONMENT=production`
  en `FRONTEND` y `WEB Service`.
- **UptimeRobot** (free) → monitor `Cláriva API` a `https://api.clariva.cl/health`, HTTP(s)
  HEAD, 5 min, `2xx`/`3xx` = up (un 503 alerta), mail a `javier.jham@gmail.com`.
- **Scrubber de PII por patrón** `redactPII` (RUT/email/monto) en `beforeSend` de backend
  (`lib/observability.ts`, exportado) y duplicado inline en `frontend/src/lib/sentry.ts` y
  `web/src/lib/sentry.ts`. Test `backend/test/observability-scrub.test.ts` (5/5). Se aplica a
  valores de excepción, `message` y breadcrumbs; los mensajes de Prisma se redactan enteros.
  **Límite aceptado:** nombres y "otro documento" no son regexeables — cubiertos
  estructuralmente (no se adjunta el cuerpo + Prisma redactado). Commit `547b322`.
- **Dos gaps que atrapó el fire-drill** (ambos silenciosos: "Sentry configurado pero los
  errores del navegador nunca llegaban"):
  1. `frontend/Dockerfile` y `web/Dockerfile` no declaraban `ARG VITE_SENTRY_DSN` /
     `ARG VITE_SENTRY_ENVIRONMENT`, así que Vite construía **sin** el DSN. Fix `cfd5067`.
  2. El CSP `connect-src` de `frontend/server.mjs` y `web/server.mjs` no permitía el ingest
     de Sentry → el browser bloqueaba el `POST`. Agregado `https://*.ingest.us.sentry.io`.
     Fix `89f50d7`.
- **Fire-drill**: errores sintéticos con PII **falsa** (nunca de un paciente) → verificado en
  Sentry que los eventos llegan, la PII queda redactada y están los tags `clinica` /
  `request_id` / `route` / `user_id`. Script temporal, borrado, **no** commiteado.

**Verificación:** `/health` 200 estable durante todo el proceso · login de clínica 401
(vivo) · bundles de frontend/web contienen el DSN + el scrubber · header CSP permite el
ingest de Sentry · fire-drill pasado. **Pendiente operativo (opcional):** borrar los 3
issues `FIREDRILL` de prueba en Sentry.

---

## 2026-08-03 — Sistema de backups y restauración quirúrgica por clínica

La brecha operativa más grave: clínicas reales en prod sin forma de recuperar UNA
clínica sin hacer retroceder a las demás (los snapshots de Railway restauran el volumen
entero; retención 6 días). Rama `feat/backups`. Doc completa: `docs/BACKUPS.md`.

**Arquitectura de 3 capas:** (1) volumen Railway + PITR — solo doc; (2) dump lógico por
base cifrado y fuera de Railway; (3) restauración quirúrgica por clínica.

- **Cifrado en streaming** (`lib/backup/crypto-stream.ts`): `pg_dump -Fc` → AES-256-GCM
  (`IV||ct||authTag`) → subida multipart, sin cargar el dump en memoria ni a disco.
  Round-trip testeado (buffer grande, vacío, clave/archivo alterados).
- **Job diario** (`lib/backup/runner.ts`, `scripts/backup.ts`): descubre las bases desde
  el control-plane (nunca hardcodea) + la base de control, excluye demos salvo
  `--incluir-demos`, escribe manifiesto (sha256 + **censo de filas** de Paciente/Cita/
  Cobro/Tratamiento/PlanTratamiento/Liquidacion) y registra `BackupRun`. Alerta por email
  en PARCIAL/ERROR y **dead-man's switch** (>36 h sin OK).
- **Restore quirúrgico** (`scripts/restore.ts`): `npm run restore -- --slug X --at latest`.
  Descarga+descifra (verifica sha256), restaura en base NUEVA, compara censo (aborta si no
  calza), imprime diff restaurado vs. producción. **Dry-run por defecto**; `--switch`
  renombra la viva a `_prev<ts>` (se conserva), repunta `Clinica.dbName` e invalida el
  cache. Rollback = repuntar dbName. `--drop-pre-restore` (con pre-drop previo) para limpiar.
- **Poda GFS** (`lib/backup/retention.ts`, `scripts/backup-prune.ts`): 14/8/12 por bandas de
  edad, **servicio separado con credenciales propias** (el backend no puede borrar),
  dry-run por defecto, se niega si no hay manifiesto válido o si dejaría <N (test incluido).
- **Ensayo semanal** (`scripts/restore-drill.ts`): restaura control + clínica más chica a
  bases efímeras, valida censo, borra; alerta si falla.
- **Barreras**: `dropTenantDatabase` se niega a borrar una base productiva (clínica no-demo
  o con pacientes) sin `confirmarBorradoProductivo` + un pre-drop reciente (los call sites
  de demo/rollback no cambian). `migrate-tenants` chequea frescura de backups: **solo aborta
  con `--strict`** (invocación manual deliberada); en el **prestart** (cada deploy/reinicio)
  NUNCA aborta —solo avisa por log `error` + alerta por email y deja arrancar el server—,
  para no dejar la plataforma caída por un backup atrasado. Override
  `SKIP_BACKUP_FRESHNESS_CHECK=1`. NO se tocó el `prisma db push` sin `--accept-data-loss`.
- **Endpoint** `POST /api/v1/admin/backups/run` (x-cron-secret con `timingSafeEqual`, o
  super-admin) para backup manual antes de algo riesgoso.
- **Infra**: `BackupRun` en control (aditivo), `postgresql-client-16` (PGDG) en el
  `backend/Dockerfile`, deps `@aws-sdk/client-s3` + `lib-storage`, scripts npm
  (`backup`, `backup:prune`, `backup:drill`, `restore`), env en `.env.example`.

**Verificación:** typecheck backend ✓ · unit 87/87 (incl. crypto round-trip, poda que no
borra bajo el piso, parseo de manifiesto). Tests nuevos: `backup-crypto`, `backup-retention`,
`backup-manifest`. **Pendiente operativo (fuera del repo):** crear bucket R2 con object-lock
por prefijo (7/30/180 d), cargar env en Railway, crear los servicios cron (backup/prune/
drill), verificar la versión de Postgres del server, y activar capa 1 (volumen + PITR).
`docs/SECURITY.md` #3 → resuelto.

---

## 2026-08-03 — Observabilidad: healthcheck real, Sentry y logging con request-id

Antes no había forma de enterarse de una falla salvo que una clínica llamara: sin
Sentry, sin logging estructurado, sin request-id, y `/health` devolvía 200 aunque
Postgres estuviera caído. Rama `feat/observabilidad`. Doc: `docs/OBSERVABILIDAD.md`.

**1. Healthcheck real** (`backend/src/app.ts`): `/health` ahora hace `SELECT 1`
contra el control-plane con timeout de 2 s y devuelve **503** si la base no responde
(antes 200 siempre). Railway y el monitor externo detectan la caída. No se tocó
`railway.json` (healthcheckTimeout 300 intacto).

**2. Sentry backend** (`instrument.ts`, `lib/observability.ts`, `middlewares/error.ts`,
`index.ts`): captura **solo 5xx** + excepciones no manejadas (`uncaughtException`
sale con exit 1 para que Railway reinicie; `unhandledRejection` se loguea/reporta sin
tumbar el server). Los `AppError` 4xx y `ZodError` NO generan ruido. Cada evento se
etiqueta con `clinica` (slug), `user_id`, `request_id`, `route`. **Nunca** envía datos
de pacientes: capturamos sin el body y `beforeSend` limpia body/cookies/query/headers.
Opcional: sin `SENTRY_DSN` queda apagado.

**3. Sentry frontend + web** (`src/lib/sentry.ts` + `main.tsx` en ambos): init con la
misma regla de privacidad — **sin Session Replay**, sin cuerpos de request, sin
breadcrumbs de consola. Opcional vía `VITE_SENTRY_DSN` (build-time).

**4. Logging con request-id** (`lib/logger.ts`, `lib/request-context.ts`,
`middlewares/request-context.ts`): request-id por request (heredado de `X-Request-Id`
o generado), propagado por `AsyncLocalStorage` para que TODO log lleve requestId +
slug de la clínica sin pasar `req` por las capas. Logger propio (JSON en prod, texto
en dev, `LOG_LEVEL` configurable). Se reemplazaron los `console.*` de
services/lib/middlewares (crm, meta-leadads, meta.controller, maintenance, audit-admin,
error). Los `console.*` de `scripts/*` quedan (son CLI). El request-id se devuelve en
el header `X-Request-Id` y en el cuerpo del 500 (`requestId`).

**Deps nuevas:** `@sentry/node` (backend), `@sentry/react` (frontend, web) — v10.69.
**Env nuevas** (en `.env.example` de cada servicio; cargar en Railway): `SENTRY_DSN`,
`SENTRY_ENVIRONMENT`, `LOG_LEVEL` (backend); `VITE_SENTRY_DSN`, `VITE_SENTRY_ENVIRONMENT`
(frontend/web).

**Verificación:** typecheck backend+frontend+web ✓ · unit 73/73 ✓ (incluye smoke
ajustado: `/health`→503 sin base, con `CONTROL_DATABASE_URL` a puerto muerto para ser
determinista) · integración 48/50 (los 2 fallos —consentimientos y conversión de lead—
son **pre-existentes**, sin relación con este cambio). **Pendiente operativo (fuera del
repo):** crear los 3 proyectos en Sentry, cargar los DSN en Railway y configurar
UptimeRobot → `api.clariva.cl/health` (pasos en `docs/OBSERVABILIDAD.md`).

---

## 2026-08-03 — Limpieza del monolito: verificada, mergeada y desplegada

Cierre de la rama `chore/limpieza-monolito` (auditoría + borrado del código muerto).

- **Qué borró la limpieza** (ya estaba muerto desde el cutover del 2026-06-20): el
  monolito Next.js de la raíz — `app/`, `components/`, `lib/`, `prisma/`, `public/`,
  `proxy.ts`, configs (`next.config.ts`, `tsconfig.json`, `package*.json`, etc.) y
  `AGENTS.md`. 219 archivos / ~42.000 líneas. Preservado en el tag `monolito-final`
  (`67b0332`); recuperar con `git show monolito-final:<ruta>`.
- **Además:** `.gitattributes` con `eol=lf` + renormalización (los 41 archivos que
  aparecían "modificados" eran ruido CRLF/LF), y `CLAUDE.md` reescrito para el stack real
  (antes describía el monolito: base compartida con `clinicaId`, NextAuth, `prisma/` en la
  raíz — nada de eso existe hoy).
- **Verificación (todo verde):** backend typecheck · backend test 73/73 · integración
  48/50 (los 2 fallos —consentimientos y conversión de lead— son **pre-existentes**: la
  limpieza no tocó `backend/frontend/web/shared`, `git diff --stat 67b0332..limpieza` sobre
  esas carpetas da vacío) · frontend typecheck · web typecheck.
- **Merge + deploy:** fast-forward `67b0332..3788f0c` a `arch/split-frontend-backend`,
  pusheado (redeploy de los 3 servicios). Verificado en prod: `/health` 200, `/auth/login`
  401 JSON (auth vivo), `app.clariva.cl` 200, `clariva.cl` 200.
- **Artefactos locales borrados:** `_to_delete/` y `monolito-final.tar.gz` de la raíz
  (gitignoreados, sin trackear; el código vive en el tag).

Nota: `backend/src/scripts/migrate-tenants.ts` se dejó intacto a propósito (corre
`prisma db push` sin `--accept-data-loss`).

---

## 2026-07-29 — Permiso "Gestión de agenda": recepción/staff puede gestionar bloqueos de cualquier profesional

La clínica necesita que usuarios NO admin (recepción) puedan gestionar la agenda
completa. Antes, un no-admin solo podía crear/editar bloqueos de **su propio**
horario (`bloqueos.service`: "Solo puedes bloquear tu propio horario"), así que un
recepcionista viendo la agenda de un doctor recibía ese error. (Las **citas** ya no
tenían restricción de rol en el backend — crear/editar/eliminar estaban abiertas a
cualquier usuario autenticado; el error que se veía venía de los bloqueos.)

Nuevo permiso **`puedeGestionarAgenda`**:
- **Schema tenant** (`prisma/tenant/schema.prisma`): `puedeGestionarAgenda Boolean
  @default(false)` en `User`. Migración aditiva (segura; se aplica con
  `migrate:tenants` en el deploy).
- **Backend** (`bloqueos.service.ts`): helper `puedeGestionarAgenda(db, actor)` (admin
  o el flag; el JWT solo trae el rol, así que el permiso se consulta en la base).
  `crearBloqueo`/`actualizarBloqueo` ahora permiten gestionar el bloqueo de CUALQUIER
  profesional si el actor es admin o tiene el permiso; el resto sigue limitado a su
  propio horario. `eliminarBloqueo` ya estaba abierto a toda la clínica.
- **Sesión** (`auth.service.ts`): el permiso viaja en `SessionUserDTO.permisos`
  (admin/plataforma = true).
- **Usuarios** (`usuarios.service.ts`): el campo se puede asignar al editar
  (SELECT + CAMPOS_ADMIN).
- **Frontend** (`Equipo.tsx`): nuevo toggle "Gestión de agenda (bloqueos y citas de
  cualquier profesional: crear, editar y eliminar)" en la pestaña Permisos.
- **Shared** (`types/index.ts`): `puedeGestionarAgenda` en permisos y `UsuarioDTO`.

Verde: typecheck backend + frontend, 73/73 unit. Integración: 48/50 (los 2 fallos
—consentimientos y conversión de lead— son **pre-existentes**, verificado con stash;
no tocan agenda).

---

## 2026-07-29 — Pacientes sin duplicar por RUT · plan pregunta profesional · trazabilidad de acciones realizadas

Tres funcionalidades pedidas por la clínica:

- **No duplicar pacientes por RUT (aviso proactivo).** El backend ya bloqueaba el
  duplicado en todas las capas (constraint `rut @unique`, chequeo en `crearPaciente`/
  `actualizarPaciente`, y reutilización por RUT en conversión de lead y reserva
  online), pero solo avisaba al guardar. Ahora el formulario "Paciente nuevo" de la
  agenda (`CrearCitaModal` en `frontend/src/pages/Agenda.tsx`) busca en vivo (debounce
  350 ms) si ya existe un paciente con ese RUT: muestra su nombre + N° de ficha,
  **deshabilita "Agendar"** y ofrece "Usar este paciente" (cambia a modo existente).
- **El plan de tratamiento pregunta el profesional a cargo al crearlo.** Antes caía
  por defecto al primer doctor (Dr Aedo). Nuevo `NuevoPlanModal` en
  `frontend/src/pages/FichaPaciente.tsx`: el botón "+ Nuevo plan" abre un modal que
  exige elegir el profesional; el plan se crea ya asignado a ese profesional (sigue
  editable luego en el detalle).
- **Trazabilidad al pinchar una acción realizada.** `TRAT_INCLUDE`
  (`backend/src/services/tratamientos.service.ts`) ahora incluye `evoluciones`
  (fecha, texto, autor). En la ficha, al pinchar el nombre de una acción COMPLETADA se
  despliega un panel con **fecha de realización** (`fechaCompletado`), **profesional a
  cargo** (`doctor`) y la **evolución anotada** (texto + fecha + quién la registró).
  Antes al pinchar no se veía nada (el ✓ solo servía para desevolucionar, y sin permiso
  quedaba deshabilitado).

Verde: typecheck backend + frontend, 73/73 tests backend. Cambio de `TRAT_INCLUDE` es
aditivo y solo lo consume `obtenerPlan` (detalle del plan).

---

## 2026-07-29 — Planes: finalizar plan + auto-consulta + pestaña "Finalizados"

Backend ya tenía `PlanTratamiento.estado` (default ACTIVO) y `actualizarPlan` lo
acepta; solo se agregó UI.

- **Finalizar / Reabrir**: botón en el detalle del plan que setea
  `estado='FINALIZADO'` (o 'ACTIVO' al reabrir), con confirmación. Badge
  "Finalizado" en el encabezado del plan.
- **Auto-consulta**: al evolucionar una acción, si quedó completada la ÚLTIMA
  pendiente del plan (todas COMPLETADO), se relee el plan y aparece un confirm
  "¿Finalizar este plan?". Si acepta, se finaliza.
- **Pestaña "Finalizados"**: `PlanLista` pasó de secciones a pestañas "En
  ejecución (N)" / "Finalizados (N)" para ver los planes ya finalizados.

---

## 2026-07-28 — Planes: barras completas + la selección de dientes se mantiene

- **Layout**: la columna derecha del detalle del plan (odontograma + acciones) no
  podía encogerse (grid `1fr` sin `min-w-0`), así el contenido empujaba el ancho y
  cortaba las barras de acciones a la derecha. Se cambió a
  `grid-cols-[280px_minmax(0,1fr)]` + `min-w-0` en ambas columnas → las barras se
  ven completas y el odontograma scrollea solo si hace falta.
- **Selección de dientes persistente**: al agregar una acción, `recargar()` hacía
  `abrir()` que llamaba `clearSel()` → borraba la selección. Ahora `recargar()`
  recarga los datos SIN limpiar la selección (solo `abrir` otro plan / "Limpiar
  selección" la borran). Además el form "Agregar prestación" queda ABIERTO tras
  agregar (resetea solo la prestación, muestra "✓ N agregadas · la selección se
  mantiene"), para cargar 4-5 acciones a los mismos dientes sin re-seleccionar.

---

## 2026-07-28 — Pacientes: dar de baja / reactivar (para duplicados)

El backend ya tenía `Paciente.activo` y el listado filtraba `activo: true`; faltaba
la UI para darlos de baja (útil para duplicados, sin borrar el historial).

- Ficha del paciente (DatosTab, solo admin): botón "Dar de baja" (confirm →
  `activo:false` → vuelve al listado; queda oculto de listas y búsqueda) y
  "Reactivar paciente" cuando está de baja. Badge "Dado de baja" en el encabezado.
- Listado de pacientes: toggle "Ver dados de baja" (solo admin) para encontrarlos y
  reactivarlos. `listarPacientesPaginado` acepta `inactivos`; el controller lee
  `?inactivos=1`. El detalle (`obtenerPaciente`) ya cargaba sin importar el estado.

---

## 2026-07-27 — Fix (causa real): "Solo crear paciente" ya no dispara customer

Corrección del anterior: la causa NO era la reserva online, sino el flujo MANUAL.
La clínica usa "Solo crear paciente" (convertirEnPaciente) para registrar la ficha
y agendar; eso marcaba el lead CONVERTIDO y disparaba "customer", y luego lo
marcaban AGENDADO → quedaba "AGENDADO con customer, pacienteId, citaId null".

- `convertirEnPaciente` ("Solo crear paciente") ahora es SOLO administrativo:
  vincula/crea el paciente y CONSERVA el estado del lead. NO marca CONVERTIDO ni
  dispara customer. (Crear la ficha ≠ conversión del embudo.)
- El evento `customer` queda con UNA sola fuente: el cambio de estado deliberado a
  CONVERTIDO (`CRM_ETAPA_EVENTO`), reforzado por el guard `dispararEtapaCrmMeta`
  (solo si estado=CONVERTIDO). Reproducción (trazado estático): "Solo crear
  paciente" + marcar AGENDADO → dispara `lead`/`Schedule`, NUNCA `customer`.
- Frontend: el aviso de "Solo crear paciente" pasa a "Paciente creado".

---

## 2026-07-27 — Fix: evento "customer" solo en CONVERTIDO (no en AGENDADO)

10 leads AGENDADO recibieron "customer" en el dataset CRM. Origen: la reserva
online forzaba AGENDADO incondicionalmente (degradaba incluso un lead ya
CONVERTIDO), dejando "AGENDADO + customer"; el customer había salido al convertir.

- **Guard duro** en `dispararEtapaCrmMeta`: el evento `customer` SOLO se emite si
  el lead está en estado `CONVERTIDO`. En cualquier otro estado (AGENDADO, etc.)
  se omite (`no-aplica`) y se loguea. Estructuralmente imposible mandar customer
  fuera de CONVERTIDO. AGENDADO sigue disparando solo `Schedule` (+`lead` de
  entrada).
- **Reserva online** ya no degrada un lead CONVERTIDO a AGENDADO (conserva la
  conversión; igual dispara Schedule). Evita el estado inconsistente.
- Los eventos ya enviados a Meta no se borran; esto frena que siga.

---

## 2026-07-27 — Recaudación: cobrar acciones de VARIOS planes en un solo pago

Ej.: radiografías en un plan y limpieza en otro → un solo cobro. El backend
(`crearCobro`/`validarItemsCobro`) ya validaba por paciente (no exigía un solo
plan); el cambio es de UI.

- `RecaudacionTab` carga el detalle de TODOS los planes del paciente y los muestra
  en cards separadas (por plan → sección). El carrito (`sel`) es global por acción,
  así se marcan acciones de distintos planes en un mismo cobro.
- Abono libre como pie: se aplica POR plan (min(abono libre del plan, seleccionado
  de ese plan)); el `aplicarAbonoLibreAAccion` del backend usa el plan de cada
  acción. Se muestra el total disponible y el descuento combinado.
- "Abono libre a un plan" ahora tiene selector de plan destino; "Derivar entre
  planes" toma el plan elegido. Deuda y total suman todos los planes.

---

## 2026-07-27 — Recaudación: abono libre como "pie" (descuento automático del cobro)

El abono libre del plan (crédito ya pagado sin asignar) se aplica automáticamente
como pie de las acciones que se cobran. Ej: 200 de abono libre + implante 299 →
se cobran solo 99 (antes se calculaba a mano).

- `aplicarAbonoLibreAAccion` acepta `maxAplicar` (topa al monto que se cobra) y
  devuelve lo aplicado. Money-neutral (reasigna crédito ya recibido).
- `crearCobro` acepta `aplicarAbonoLibre`: por cada acción cobrada aplica el abono
  libre (capado a lo que se cobra), reduce el ítem por lo aplicado, y el cobro
  nuevo es la diferencia. Si el abono cubre TODO → no crea cobro ni usa caja
  (devuelve `{ cubiertoConAbono, montoAplicado }`). `cajaId` pasa a opcional
  (runtime exige caja solo si hay pago nuevo). Limpia `paraCobro` de todas las
  acciones originales (incluidas las cubiertas por crédito).
- UI (RecaudacionTab): checkbox "Usar abono libre como pie" (on por defecto si hay
  crédito) + descuento visible y total neto; maneja el caso "cubierto sin pago".

---

## 2026-07-25 — Schedule CRM: event_time nunca fechaAgenda + reenvío de rechazados + warnings

3 de 4 Schedules (Ma Paz/Fernando/Ivonne, con cita a futuro) los aceptó el POST
pero Meta los descartó por event_time FUTURO; quedaron con crmScheduleEnviado=true.

- **event_time**: se saca `fechaAgenda` de la base por completo (era un dato de
  negocio, no el timestamp). Ahora = `ultimaGestionAt / now`, clamp [now−6d, now],
  en el emisor CRM (`dispararEtapaCrmMeta`) y en el landing (`scheduleEventTime`).
- **Warnings de Meta**: `postEventoCrm` ahora trata como NO ok una respuesta con
  `messages` (warnings, ej. "event_time is in the future") aunque events_received≥1,
  y surfacea el detalle → así `crmScheduleEnviado` NO se marca en falso y el error
  se ve en el backfill.
- **Reenvío forzado**: `dispararEtapaCrmMeta` acepta `{ force }` (salta la
  idempotencia local; Meta deduplica por event_id lo ya recibido). El backfill
  REENVÍA forzado los AGENDADO con Schedule marcado PERO cita a futuro (los
  rechazados), con el event_time corregido; omite los ya aceptados (ej. Roberto).

Tras correr el backfill: "Programar" en el dataset 1156… debería subir a 4.

---

## 2026-07-25 — Identidad robusta + modelo de ciclo/flujo + merge de duplicados

- **FIX A (identidad robusta)**: `telCanonico` (quita no-dígitos, código país 56,
  ceros iniciales; compara los últimos 8) + `emailCanonico` (lowercase+trim).
  `buscarLeadParaReserva` y `buscarDuplicadoReciente` ahora matchean por teléfono
  normalizado O email → "954814817" = "+56954814817". Una persona = un registro.
  Esto causaba el duplicado de Ivonne.
- **FIX B (ciclo/flujo)**: el primer inbound fija el flujo; ventana de 7 días
  (`abreReingreso`). Una nueva captura del MISMO flujo dentro de la ventana NO abre
  reingreso (mismo ciclo, solo sube); fuera de la ventana o por OTRO flujo →
  reingreso (nuevo ciclo). `construirReingreso` acepta `nuevoCiclo`. El intake de
  la landing (`crearLead` con `reingresarSiExiste`) ya NO duplica: reingresa/cicla
  sobre el registro existente. La reserva online ya era progresión (no reingreso).
- **FIX C (merge)**: `fusionarLeadsDuplicados` (`POST /crm/leads/fusionar-duplicados`,
  botón en Config): agrupa por identidad, conserva el META_FORM (leadgenId) como
  canónico, absorbe del duplicado la cita real (citaId/pacienteId/fechaAgenda) +
  datos faltantes, mueve las notas, borra el duplicado, y dispara el Schedule CRM
  si quedó AGENDADO (sin repetir el landing ya disparado). Fusiona a Ivonne y a
  cualquier otro con el mismo patrón.

---

## 2026-07-25 — Fix: Schedule CRM no se enviaba (event_time futuro) + flag dedicado + surface de error

Ma Paz quedaba limpia pero el Schedule CRM no se disparaba (metaCrmEtapas="lead_1").
El guard ya era por metaCrmEtapas (no scheduleCapiEnviado); el envío FALLABA en
silencio.

- **Causa raíz (event_time futuro)**: el event_time usaba `fechaAgenda` como base;
  si la cita es a FUTURO, el event_time quedaba en el futuro y **Meta rechaza** el
  evento (`res.ok=false` → 'error', sin persistir). Se capa a **[now−6d, now]** en
  el emisor CRM (`dispararEtapaCrmMeta`) y en el landing (`scheduleEventTime`).
- **Flag dedicado**: `Lead.crmScheduleEnviado Boolean` (SEPARADO de
  `scheduleCapiEnviado` del landing); se marca al confirmar el Schedule CRM.
- **Surface de error**: `dispararEtapaCrmMeta` ahora devuelve `{ estado, error }` y
  loguea el rechazo de Meta con event_id. `backfillCrmSchedule` devuelve
  `detalleErrores[]` y la UI los muestra (fin de fallos mudos).

---

## 2026-07-25 — Fix backfill CRM Schedule: recupera leadgenId base perdido

El backfill anterior filtraba `leadgenId IS NOT NULL` (base), pero en los leads
afectados el leadgenId BASE se perdió en el reingreso (quedó null), así que el
query los dejaba fuera (caso Ma Paz).

- Selección robusta: `estado='AGENDADO'` AND (leadgenId base, o ultimoLeadgenId,
  o `metaCrmEtapas LIKE '%lead%'`, o `ingresos LIKE '%leadgenId%'`). "Sin Schedule
  CRM" se mide SOLO por `metaCrmEtapas` (no scheduleCapiEnviado del landing).
- Recupera el leadgenId efectivo del historial `ingresos` / `ultimoLeadgenId` si el
  base es null, RESTAURA el base, y dispara `dispararEtapaCrmMeta('Schedule')` (que
  usa el leadgenId base ya restaurado). event_id `crm_{id}_Schedule_1`.
- Tras correr: el lead pasa a `metaCrmEtapas="lead_1,Schedule_1"`, `vecesIngresado=1`,
  `ultimoLeadgenId` restaurado, y el dataset CRM recibe 1 "Programar".

---

## 2026-07-24 — Fix: agendamiento online de leads META_FORM (Schedule CRM + no reingreso)

Un lead de Meta Form (con leadgenId) que agendaba por AGENDA_ONLINE disparaba el
Schedule LANDING (dataset web) en vez del CRM, y se contaba como reingreso.

- **FIX 1 (una sola vía por ORIGEN)**: `dispararScheduleMeta` (landing) ahora OMITE
  los leads con leadgenId (`sin-leadgen`) → esos van SIEMPRE al dataset de CRM vía
  `dispararEtapaCrmMeta('Schedule')`. En agenda-online el Schedule se rutea por
  `lead.leadgenId` (CRM) vs. landing. Nunca ambas. Manual (actualizar/agendar) ya
  llamaba a las dos funciones; el guard hace que solo dispare la correcta.
- **FIX 2 (progresión, no reingreso)**: la reserva online de un lead existente ya
  NO usa `construirReingreso`: no incrementa `vecesIngresado`, no marca reingreso,
  no pisa origen/ultimoOrigen/ultimoLeadgenId. Solo transiciona a AGENDADO en el
  mismo ciclo (fechaAgenda + cita). El contador de reingreso solo sube ante inbound
  real (webhook META_FORM / intake landing), nunca ante progresiones internas.
- **FIX 3 (backfill)**: `backfillCrmSchedule` (`POST /crm/crm-schedule/backfill`,
  botón en Config): para leads META_FORM ya AGENDADO sin Schedule CRM, limpia los
  toques AGENDA_ONLINE del historial, recalcula `vecesIngresado`, restaura
  `ultimoLeadgenId`, y dispara el Schedule CRM (`crm_{id}_Schedule_{ciclo}`).
  Corrige a Ma Paz y a cualquier otro en el mismo estado.
- **FIX 4 (UI)**: el badge de Schedule del lead, para leads con leadgenId, refleja
  el Schedule del dataset de CRM (`metaCrmEtapas` contiene `Schedule_N`), no el
  `scheduleCapiEnviado` del landing (evita falsa confianza).

---

## 2026-07-24 — Recaudación 2do medio de pago + comentario de cita + amarillo abono parcial

Tres ajustes:
1. **Segundo medio de pago (pago dividido)** en Recaudación: `Cobro` gana
   `medioPago2Id`/`monto2`/`numeroReferencia2` (aditivos; relaciones nombradas
   CobroMedio/CobroMedio2). `crearCobro` valida `0 < monto2 < total` y 2do medio
   distinto; comisión y N° de referencia se calculan POR medio (monto1 = total −
   monto2 al 1ro); `comisionMonto/montoNeto` agregan ambos tramos. La suma siempre
   iguala el total (acciones seleccionadas / abono libre). UI en RecaudacionTab
   ("+ Agregar segundo medio") + se muestra en la lista de Cobros y el comprobante.
2. **Comentario de la cita** (`notas`) visible en la pestaña Citas del paciente.
3. **Amarillo** en el punto de estado del plan cuando la acción está realizada con
   **abono parcial** (pagó algo pero no cubre el neto): verde=pagada ·
   amarillo=abono parcial · rojo=deuda · azul=sin realizar.

---

## 2026-07-23 — test_event_code: auto-expira + aviso visible (no arruinar optimización)

Si el test_event_code queda seteado, todos los eventos van a Test Events y NO
cuentan para optimización ni atribución. Se blinda para que no quede activo por
accidente.

- **Schema**: `Configuracion.metaTestCodeHasta DateTime?`. El código SOLO se aplica
  mientras `metaTestCodeHasta > ahora` (helper `testCodeVigente`, usado en
  `getMetaConfig` y `getMetaCrmConfig`). Pasada la ventana se ignora → los eventos
  vuelven a contar. Aditivo.
- **Auto-expiración**: al guardar un test code, `guardarConfigCrm` fija
  `metaTestCodeHasta = ahora + 120 min`. Al vaciarlo, se apaga de inmediato.
- **UI** (`Crm.tsx`): banner ámbar visible mientras está activo (con la hora de
  auto-desactivación) + botón "Desactivar ahora". El input se precarga solo si
  sigue activo (un "Guardar" de otra config no lo reactiva). Label/ayuda: "vacío
  en producción".
- **event_time clamp**: confirmado en `now − 6 días` (dentro del límite de 7 d de
  Meta, con margen ante demoras/skew) en Schedule y en eventos de etapa CRM. Sin
  cambios.

---

## 2026-07-23 — Eventos de etapa CRM: nombres del embudo + event_id + solo leadgenId

Alinea el emisor de etapas de CRM con el embudo de "clientes potenciales
calificados" de Meta. (El "TestEvent/TestCRM" que se veía era del botón Test
Events de Meta, no del código.)

- **event_name EXACTO** (case-sensitive): `lead` (entrada), `Schedule` (AGENDADO),
  `customer` (CONVERTIDO). Se elimina el evento de CONTACTADO (no es etapa del
  embudo). Antes eran Lead/Contactado/Agendado/Cliente.
- **event_id** = `crm_{leadId}_{eventName}_{vecesIngresado}` (dedup con reintentos;
  un reingreso reavanzado genera event_id nuevo → Meta no lo descarta). Idempotencia
  local por ciclo (`metaCrmEtapas` guarda `evento_veces`).
- **Solo leads con leadgenId** (Formulario Instantáneo) van al dataset de CRM
  (guard `sin-leadgen`). Los de la landing siguen su flujo actual al pixel/dataset
  web, sin `lead_id`.
- Se mantienen `custom_data.event_source='crm'`, `lead_event_source='Clariva'`,
  `action_source='system_generated'`, `user_data.lead_id`=leadgenId + em/ph/fn/ln
  SHA-256. Reingreso por Instant Form reemite `lead`. Test event usa `lead`.

---

## 2026-07-23 — Reingreso de contactos (leads repetidos) en el CRM

Un contacto cuyo teléfono/email ya existe NO se duplica, pero ahora "vuelve a
entrar": sube al tope del listado y se ve que volvió (oportunidad caliente).

- **Schema (Lead)**: `ultimoIngresoAt DateTime?`, `vecesIngresado Int @default(1)`,
  `ingresos String?` (JSON historial de toques), `ultimoOrigen/ultimaCampana/
  ultimoLeadgenId` (atribución de ÚLTIMO toque, sin pisar la original). Aditivo.
  Backfill en `migrate-tenants` (ultimoIngresoAt = createdAt para leads previos).
- **Detección**: `buscarLeadParaReserva` con opción `incluirConvertidos`. Helper
  `construirReingreso` aplicado en la reconciliación de `ingestarLeadMeta` (form
  Meta) y en la reserva online (`agenda-online`, estado forzado AGENDADO).
  `crearLead` setea el primer toque en la creación.
- **Orden**: `listarLeads` ordena por `ultimoIngresoAt` DESC (nulls last +
  createdAt de respaldo). `resumenCrm` cuenta reingresos; filtro `reingresos`.
- **Regla de estado (item 3)**: PERDIDO/CONVERTIDO → NUEVO (conserva pacienteId);
  NUEVO/CONTACTADO → se mantiene; AGENDADO con cita futura pendiente → se mantiene
  (no falsear agendamiento), si la cita pasó o no asistió → NUEVO. Reingreso
  pendiente (volvió y nadie gestionó) entra a la cola (`sinGestionar`).
- **Schedule CAPI (item 5)**: event_id ahora `sched_{leadId}_{vecesIngresado}` para
  que un reagendamiento tras reingreso NO se deduplique en Meta. Al reingresar se
  resetea `scheduleEventId=null`+`scheduleCapiEnviado=false` (salvo AGENDADO-keep).
  Leads existentes conservan su event_id actual (sin reenvío retroactivo).
- **Atribución (item 6)**: se implementó la propuesta de campos de ÚLTIMO toque
  (ultimoOrigen/ultimaCampana/ultimoLeadgenId) que sí se actualizan; los originales
  (primer toque) quedan intactos → el reporte puede mirar primer o último toque.
- **UI**: badge "↩ Reingreso" (×N si >2) en la fila, filtro "Reingresos" con
  contador, y línea de tiempo del historial `ingresos` en el detalle.

---

## 2026-07-23 — Reproceso de Lead Ads: respuesta de diagnóstico completa

Refina el reproceso ya existente para diagnosticar el fetch a Graph (el paso que
la herramienta de prueba de Meta NO valida: manda un leadgen_id sintético que da
code 100/subcode 33). El pipeline es el MISMO que corre el webhook.

- `traerLeadDeGraph` devuelve `status` + `request` (URL SIN access_token) + error
  con `code/subcode`. `ejecutarPipeline` (compartido webhook/reproceso) devuelve el
  contrato de diagnóstico: `graphRequest`, `graphStatus`, `graphError` (o null),
  `fieldDataCrudo`, `mapeo` (con `noReconocidos`), `resultado`
  (creado|duplicado|error), `leadId`.
- `reprocesarLead` (`POST /admin/meta/reprocesar-lead`, crmAdmin, config del tenant
  activo) devuelve ese objeto + el `lead` completo. Dedup por leadgenId → `duplicado`
  (seguro apretar dos veces). Token nunca en la respuesta ni en logs.
- Webhook: logging con `page_id/leadgen_id/form_id/tenant` + resultado del fetch
  (éxito o error de Graph con code/subcode). Fin de los fallos silenciosos.
- UI: input "Leadgen ID" + botón "Reprocesar lead" + área con la **respuesta JSON
  completa** (no un toast), resumen y `field_data` crudo. Mapeo tolerante ES/tildes
  ya vigente (normName + ALIAS); lo no reconocido va a `Lead.camposExtra`.

---

## 2026-07-23 — Lead Ads: mapeo tolerante (ES+tildes), reproceso manual y logging

1. **Mapeo de field_data tolerante** (`meta-leadads.service`): `normName`
   (minúsculas, sin diacríticos, separadores→`_`) + tabla `ALIAS` ES/EN (match
   exacto + respaldo por substring). Cubre `nombre_completo`,
   `número_de_teléfono`, `correo_electrónico`, etc. Lo que no matchea NO se
   descarta: va a `Lead.camposExtra` (nuevo campo JSON, nullable/aditivo) y se
   loga el name crudo. `IngestaMetaInput`/`CrearLeadInput` plumbean `camposExtra`.
2. **Reproceso manual** `POST /admin/meta/reprocesar-lead` (crmAdmin): mismo
   pipeline que el webhook (fetch Graph → mapeo → dedup/ingesta) usando el token
   de página del tenant. Devuelve `field_data` crudo + lo mapeado + `camposExtra`
   + el lead resultante, para validar sin gastar en anuncios. UI en Configuración
   (input leadgen_id + resultado con field_data crudo).
3. **Logging del webhook**: se registra cada POST con page_id/leadgen_id/form_id;
   el fetch a Graph ahora devuelve error estructurado (message/code/subcode/status)
   y se loga en el fallo (antes era silencioso: Meta reportaba éxito y no aparecía
   nada). Pipeline extraído a `ejecutarPipeline` (compartido webhook + reproceso).

Aditivo; no toca el CAPI web ni el emisor de CRM. Sin PII en logs (solo names).

---

## 2026-07-23 — Ajustes finos de la integración con Meta (match quality, versión, dedup)

Mejoras puntuales sobre lo ya construido; no rehace nada.

1. **fn/ln en eventos de etapa de CRM** (`lib/meta.ts` `MetaCrmEvent` +
   `dispararEtapaCrmMeta`): se agregan `fn`/`ln` (nombre/apellido) hasheados con el
   mismo helper del CAPI web. Suben el Event Match Quality. Solo si existen.
2. **Versión ÚNICA de Graph API**: `env.metaGraphVersion` (`META_GRAPH_VERSION`,
   default `v25.0`) + `graphBase()` en `lib/meta.ts`, reutilizado por el CAPI web,
   el emisor de CRM y el webhook de Lead Ads. Antes el web iba en v19.0 y el
   webhook en v25.0.
3. **No emitir sin llaves de match**: helper `tieneMatchKeys` (email/teléfono/
   leadgen/fbc/fbp/external real; el external sintetizado = id NO cuenta). Guarda
   en `dispararScheduleMeta`, `dispararEtapaCrmMeta` y el "Lead" web de `crearLead`
   → si no hay ninguna llave, se omite y se loguea (nuevo outcome `sin-match`).
4. **fechaAgenda**: al marcar AGENDADO manual sin fecha, se deriva de la cita
   vinculada; se usa como `event_time` del evento de etapa (más preciso) y habilita
   la reportería de asistencia. (`agendarLead` ya la fijaba; el input datetime-local
   ya existe en la UI para el caso sin cita.)
5. **Anti-duplicado del intake**: `crearLead` acepta `antiDuplicadoMin` (el intake
   público de la landing pasa 10 min): si el mismo teléfono/email llegó en la
   ventana, actualiza el lead existente en vez de crear otro (doble submit) y no
   reemite el evento Lead. Helper `buscarDuplicadoReciente`.

No toca funcionalidades validadas. Multi-tenant, secretos por env/DB, sin PII en logs.

---

## 2026-07-23 — Recepción NATIVA de leads de Meta Lead Ads (webhook, sin Make)

Dirección ENTRANTE del canal Meta: los leads del Formulario Instantáneo llegan
solos a Cláriva vía el webhook `leadgen` de una App de Meta compartida, sin
Make/Zapier. Multi-tenant: cada clínica autoriza su página. Complementa el
emisor de etapas de CRM (saliente) ya existente.

- **Env (plataforma)**: `META_APP_ID`, `META_APP_SECRET` (valida firma HMAC),
  `META_WEBHOOK_VERIFY_TOKEN`. Una sola App para toda la plataforma.
- **Schema (tenant, Configuracion)**: `metaLeadAdsEnabled Boolean`, `metaPageId
  String?`, `metaPageAccessToken String?` (encriptado, write-only),
  `metaLeadAdsUltimo String?` (diagnóstico). **Control (Clinica)**: `metaPageId`,
  `metaLeadAdsEnabled` **denormalizados** (como `waNumero`) para enrutar por
  page_id SIN abrir cada base. Todo aditivo/nullable; `control:push` y
  `migrate:tenants` corren `db push` sin `--accept-data-loss`. `init.sql` +
  ambos `schema.prisma`.
- **Webhook** (`meta.controller` + `meta-leadads.service`, ruta pública
  cross-tenant `/public/meta/leadgen-webhook`): GET verifica (hub.challenge en
  texto plano, 403 si el verify_token no coincide); POST **valida la firma
  `X-Hub-Signature-256`** (HMAC-SHA256 del `req.rawBody`, 401 si no; comparación
  en tiempo constante), responde 200 al instante y procesa async.
- **Enrutado**: `control.clinica.findFirst({ metaPageId, metaLeadAdsEnabled,
  activo })` → `tenantClient(dbName)`. Sin match → se loguea y descarta.
- **Graph API** v25.0: `GET /{leadgen_id}?fields=...,field_data,...` con el token
  de página del tenant → mapea `field_data` a nombre/apellido/telefono/email/rut
  de forma tolerante (loga names desconocidos, nunca valores/PII).
- **Creación**: reutiliza `ingestarLeadMeta` (origen META_FORM, IDs en utm*,
  dedup por teléfono/email/rut, y ahora **idempotencia por leadgenId** — si ya
  existe, no recrea). Al crearse dispara la etapa "Lead" del emisor de CRM.
- **UI** (`Crm.tsx`): en "Integración con Meta Ads", subsección de recepción con
  toggle + Page ID + token de página (write-only) + URL del webhook (de
  plataforma, no per-slug) + botón "Probar recepción" (`POST
  /crm/meta-leadads/test`) que valida la página en Graph y muestra el último
  lead recibido.
- **No toca** el CAPI web ni el emisor de etapas de CRM. Secretos por env/DB
  encriptada, nunca en logs. Nota externa: requiere App de Meta suscrita al
  campo `leadgen` y token de página (MVP manual para Digital-Dent).

---

## 2026-07-23 — Integración de CRM con Meta (Conversions API para "Leads de conversión")

Emisor NUEVO e independiente del CAPI web (Lead/Schedule de la landing). Cada
clínica lo activa con su **propio dataset + token** (multi-tenant, nada
hardcodeado). Emite un evento por CADA cambio de etapa del embudo al dataset de
CRM de Meta, atado al `leadgen_id` cuando existe → optimización por agendamiento.

- **Schema (tenant)**: `Configuracion.metaCrmEnabled Boolean`, `metaCrmDatasetId
  String?`, `metaCrmAccessToken String?` (encriptado con `lib/crypto`, write-only);
  `Lead.metaCrmEtapas String?` (CSV de etapas ya enviadas — idempotencia). Campos
  **separados** del pixel/token web (el dataset de CRM es otro objeto de Meta).
  Todos nullable/aditivos. ⚠️ PROD: `migrate:tenants` = `prisma db push` **SIN**
  `--accept-data-loss`. `schema.prisma` + `init.sql` actualizados.
- **Emisor** (`lib/meta.ts`): `enviarEventoCrmMeta` / `probarConexionCrmMeta` →
  `POST graph.facebook.com/v25.0/{datasetId}/events`. Payload:
  `action_source=system_generated`, `custom_data={event_source:'crm',
  lead_event_source:'Clariva'}`, `user_data={lead_id (número, sin hashear),
  em, ph (SHA-256)}`. Clamp de `event_time ≥ now−6d`.
- **Etapas** (`crm.service.ts`): `crearLead → "Lead"`; `actualizarLead` mapea
  `CONTACTADO→Contactado / AGENDADO→Agendado / CONVERTIDO→Cliente`;
  `agendarLead → "Agendado"`; `convertirEnPaciente → "Cliente"`. Idempotente por
  etapa (`metaCrmEtapas`), best-effort (`void`), sin PII en logs. Si el CRM no
  está activo o falta dataset/token → no-op silencioso (guard `crmMetaHabilitado`).
- **Config**: `obtenerConfigCrm` expone `metaCrmEnabled/metaCrmDatasetId/
  hasCrmToken/crmTokenLast4` (token nunca en claro); `guardarConfigCrm` encripta
  el token entrante (solo si viene valor). Test: `POST /crm/meta-crm/test`
  (`probarMetaCrm`) reusa el `metaTestCode`.
- **UI** (`Crm.tsx` → Configuración): sección "Integración con Meta Ads" con
  toggle + Dataset ID + token (write-only) + "Enviar evento de prueba" + URL del
  intake `/meta-lead`. Instrucción: Events Manager → Conectar datos → CRM.
- **No toca** el CAPI web existente. Riesgo: bajo (todo aditivo y detrás de guard).
  Pendiente validación: probar con 2 tenants que cada uno va a SU dataset.

---

## 2026-07-23 — Canal nuevo de leads: Formulario Instantáneo de Meta (Instant Form)

Nuevo canal además de la landing. Los leads del Instant Form entran vía Make al
intake público, se gestionan igual, y al agendar el Schedule vuelve a Meta **atado
al leadgen_id** para optimizar por AGENDAMIENTO ("Leads de conversión").

- **Schema (tenant, Lead)**: nuevo campo `leadgenId String?` (nullable, aditivo).
  ⚠️ Schema en PROD: `migrate:tenants` corre `prisma db push` **SIN**
  `--accept-data-loss`; una columna nullable es aditiva y segura. `init.sql` +
  `prisma/tenant/schema.prisma` actualizados.
- **Ingesta** `POST /public/crm/:slug/:token/meta-lead` (`crm.controller.postMetaLead`
  → `crm.service.ingestarLeadMeta`): acepta `nombre/apellido/telefono/email/rut` +
  `leadgenId` (obligatorio) + `formId/adId/adsetId/campaignId/pageId`. Mapea
  `campaignId→utmCampaign`, `adsetId→utmTerm`, `adId→utmContent` (igual que la
  landing). Origen `META_FORM` (distinto de `FORMULARIO`, para medir separado).
  Dedup por teléfono/rut/email (`buscarLeadParaReserva`): si la persona ya existe,
  NO duplica → completa el `leadgenId` y datos faltantes. No emite "Lead" por CAPI
  (Meta ya lo contó al enviarse el form; evita doble conteo).
- **Schedule → Meta con lead_id** (`dispararScheduleMeta` + `lib/meta.ts`): si el
  lead tiene `leadgenId`, el evento Schedule incluye `user_data.lead_id` (sin
  hashear, numérico). Los leads de la landing (sin leadgenId) NO cambian (fbc/fbp/
  external_id). Se mantiene la idempotencia (`scheduleCapiEnviado`) y el clamp de
  event_time. Token/secretos solo por ENV; nunca se loguea token ni PII.

## 2026-07-04 — Consentimientos informados (generación, firma y PDF) + almacenamiento por clínica

**Consentimientos informados** (15 formatos base Digital Dent, Ley 20.584, sirven para LatAm):
- Convertidos desde los Word a plantillas HTML con variables `{{...}}`, precargados por
  clínica (seed lazy) y **editables** en Administración → Consentimientos (editor rich text).
- Se generan desde la **ficha del paciente** (pestaña Consentimientos): auto-completa datos
  del paciente/clínica/profesional/fecha; **valida datos faltantes** (mínimo nombre/documento/
  fecha nac., documento país-aware) y bloquea con aviso si falta algo.
- **Firma digital** (pad en pantalla → imagen incrustada) o **manual** (línea para firmar en
  papel). **PDF descargable** (html2pdf) con logo + datos + firma.
- **Snapshot inmutable** del texto firmado (integridad legal). **Eliminar solo admin** +
  auditoría en el historial del paciente.
- Backend: modelos PlantillaConsentimiento + Consentimiento, servicio (motor de variables),
  endpoints CRUD/generar/firmar/eliminar. Frontend: página admin, tab en la ficha,
  DocumentoConsentimiento + SignaturePad. Tests 49/49.

**Almacenamiento por clínica** (super-admin): `pg_database_size` real por base (control +
tenants). KPI total + tamaño por clínica en la lista y el detalle. Es lo que se factura en Railway.

---

## 2026-07-03 — Multi-país por clínica (super-admin): documento, teléfono y moneda

La base sigue siendo Chile, pero el super-admin puede fijar el país de operación de
cada clínica (Costa Rica y Panamá como demos; toda LatAm/Centroamérica seleccionable).

- **`shared/src/constants/paises.ts`** (nuevo): catálogo único. Por país: documento
  (etiqueta + validación), teléfono (código + largo) y moneda (código/símbolo/locale/
  decimales) + helpers `formatMoneda`, `validarDoc`, `formatDoc`, `getPais`. Validación
  fina para CL (RUT con DV) / CR (cédula-DIMEX) / PA (cédula); el resto usa validación
  genérica (formato/largo). Panamá muestra la moneda en **B/.**.
- **Backend:** `pais` en `control.clinica` + `Configuracion` del tenant (denormalizado).
  Endpoint super-admin `PATCH /admin/clinicas/:id/pais` (escribe ambos + invalida cache +
  audita `CAMBIAR_PAIS`). La sesión (`SessionUserDTO.pais`) y la config de clínica exponen
  el país. La validación de documento del paciente es país-aware (Chile estricto, resto
  flexible). El super-admin de facturación **sigue en CLP** (moneda de la plataforma).
- **Frontend:** `lib/money.ts` (moneda país-aware, se fija en `ProtectedRoute` desde la
  sesión); las ~10 pantallas de dinero de la app formatean con `fmtMonto`. `RutField` y
  los guards de FichaPaciente/Agenda usan la validación del país. Selector "País de
  operación" en el detalle de clínica del super-admin.
- Tests 48/48 (nuevo: cambio a Panamá → sesión PA + documento no-RUT aceptado).

---

## 2026-07-02 — CORS abierto para el intake público del CRM (landings externas)

Las landings externas (p. ej. `https://digital-dent.cl`) que postean leads al intake público
`POST /api/v1/public/crm/:slug/:token/lead` eran bloqueadas por CORS: el middleware global usa
`credentials: true` y sólo permite el dominio de la plataforma + subdominios, así que un
`Origin` externo no recibía `Access-Control-Allow-Origin` y el preflight fallaba.

- **`backend/src/app.ts`:** se separó el CORS en dos. `publicCors` (abierto, `origin: true` que
  refleja el Origin, `credentials: false`, métodos GET/POST/OPTIONS, header `Content-Type`) montado
  en `/api/v1/public` — resuelve el preflight (OPTIONS → 204). El CORS estricto con credenciales
  se aplica al resto vía un middleware que **se salta** las rutas `/api/v1/public/*` para no pisar
  los headers. Las rutas autenticadas quedan igual (sólo dominio/subdominios de la plataforma).
- **Test:** `pagos-liquidaciones.test.ts` — preflight 204 + `Access-Control-Allow-Origin` reflejado,
  POST cross-origin crea el lead, y una ruta autenticada NO se abre a ese origin. 39/39.
- Rama de deploy: `arch/split-frontend-backend` (backend split en Railway). No se toca `master`.

---

## 2026-06-20 — CUTOVER EJECUTADO: stack split + DB-por-tenant en PRODUCCIÓN

Se ejecutó el cutover completo (Railway, proyecto `amused-recreation`, desde la rama
`arch/split-frontend-backend`). El monolito quedó offline; sus dominios pasaron al stack nuevo.

- **3 servicios live:** backend → `api.clariva.cl`, frontend (SPA por subdominio) → `*.clariva.cl`,
  web/landing → `clariva.cl`/`www`. Dockerfiles con Root Directory vacío + `RAILWAY_DOCKERFILE_PATH`
  por servicio (contexto = raíz, por el `../shared`). DNS en Cloudflare en gris/DNS-only.
- **Postgres:** un servidor, varias bases → `clariva_control` + `clariva_t_<slug>` por clínica.
  `migrate:data --apply` corrido en ventana de solo-lectura del monolito. 2 clínicas migradas
  (digital-dent 6.548 pacientes + montenegro), aislamiento físico verificado (`verify-migration`).
- **Backend env a prueba de rotación** (referencias `${{Postgres.*}}`); `LEGACY_DATABASE_URL`
  removido del runtime; password de Postgres rotada.
- **Crons** vía GitHub Actions (`.github/workflows/clariva-cron.yml`): se activan al mergear a master.
- **Smoke de producción** verde (`scripts/smoke-deploy.mjs`): health, planes, 401, CORS por subdominio.
- **Fixes durante QA inicial (en prod):** lista de pacientes con **búsqueda server-side** (antes
  filtraba un tope de 500 → solo "A") + **paginación 25/50/100** con total; **selectores de paciente**
  de cita/presupuesto/cobro ahora buscan en el servidor (componente `PacienteBuscador`) — antes solo
  veían los primeros 500. Bug de migración corregido: modelos hijos sin `clinicaId` se scopean por la
  relación al padre. Verde: typecheck · 67/67 unit · contrato 130/117.

Pendiente: QA en producción (incl. probar Google Calendar) y cierre final (merge `arch → master` +
retirar el servicio monolito, que además activa los crons).

## 2026-06-20 — [rama arch/split] DB-por-clínica F7: script de migración de datos monolito → per-tenant (dry-run)

Script idempotente para volcar la base COMPARTIDA del monolito (con `clinicaId`) a la arquitectura per-tenant, listo para correr en el cutover. **No toca producción todavía** (requiere credenciales prod). Typecheck limpio (incl. con el cliente legacy ausente) y 67/67 unit/smoke.

- **Fuente de lectura legacy:** `prisma/legacy/build-schema.mjs` deriva un schema Prisma de solo lectura desde `prisma/schema.prisma` del monolito (mismo modelo, output dedicado `prisma/generated/legacy`, datasource `LEGACY_DATABASE_URL`). Scripts npm `prisma:generate:legacy` y `migrate:data`. El schema derivado y el cliente quedan gitignoreados.
- **`src/scripts/migrate-data.ts`:** por cada clínica del monolito → registra `control.Clinica` (inyecta `dbName`, espeja routing `waEnabled`/`waNumero`), provisiona su base física (idempotente), y vuelca los 27 modelos operativos al tenant en **orden FK-safe**, descartando `clinicaId` automáticamente vía el DMMF del cliente destino (pick de campos escalares). Mapeo no obvio resuelto: la `Clinica` legacy concentraba perfil + WhatsApp + tokens Google → se reparte en `control.Clinica` (routing) y `tenant.Configuracion` (perfil + WA completo + Google); los super-admins (`User.isPlatformAdmin`) → `control.PlatformAdmin`; la `Configuracion` legacy singleton se ignora (remanente pre-multitenant). Control-plane global: planes, leads, pagos, extras, auditoría.
- **Seguridad:** **DRY-RUN por defecto** (solo lee y reporta conteos por modelo, con passwords enmascarados); escribe solo con `-- --apply`. Idempotente (provisión idempotente + `createMany skipDuplicates` + upserts), reejecutable. Cliente legacy cargado por import dinámico de ruta computada → el typecheck/CI no depende de generarlo.
- `config/env.ts`: + `legacyDatabaseUrl` (fallback a `DATABASE_URL`).

Pendiente: ejecutar `migrate:data --apply` con credenciales reales y el cutover 5-4 (Railway + DNS, manual).

## 2026-06-20 — [rama arch/split] DB-por-clínica F4 cierre: integraciones Google + WhatsApp convertidas + limpieza del prisma compartido

Cerrado el último pendiente de F4. Las dos integraciones cross-DB ahora operan en database-per-tenant y se eliminó todo el rastro del modelo compartido. **Verde en cada paso: typecheck limpio, 67/67 unit/smoke, 11/11 aislamiento físico.**

- **Control-plane (`Clinica`) — routing de WhatsApp denormalizado:** nuevos campos `waEnabled Boolean @default(false)` y `waNumero String? @unique`. El webhook de Twilio resuelve la clínica por su número emisor sin abrir cada base, y el cron filtra por `waEnabled` en el control-plane. `admin.service.putWhatsapp` escribe la config completa en la `Configuracion` del tenant **y** espeja `waEnabled`/`waNumero` al control-plane.
- **`lib/whatsapp.ts` → tenant:** `enviarRecordatorioCita(db, citaId, creds, nombre)` (credenciales y nombre resueltos una vez por clínica); `enviarRecordatoriosPendientes()` recorre `control.clinica` (waEnabled/activo/no-demo) → abre cada base → lee `Configuracion` + citas due; `procesarRespuestaEntrante(db, …)` sin `clinicaId`. `whatsapp.controller.postWebhook` resuelve clínica vía control (waNumero) → `tenantClient(dbName)` → token desde `Configuracion`.
- **`lib/google.ts` → tenant:** `saveTokensForClinica`/`getAuthorizedClient`/`disconnectClinica`/`listCalendars` reciben el cliente del tenant; los tokens viven en la `Configuracion` singleton (no en Clinica).
- **`lib/google-sync.ts` → tenant:** push/pull (`pushCita`, `deleteCitaInGoogle`, `pushBloqueo`, `deleteBloqueoInGoogle`, `syncCalendar`, `reconcileEvent`, `findMatchingPaciente`) operan sobre `db` y sin `clinicaId`. `syncAllMappedUsers()` (cron) recorre el control-plane → abre cada base con Google conectado → sincroniza sus doctores mapeados.
- **`google.controller.ts` → tenant:** connect/disconnect/calendars/reconcile-bloqueos pasan a `requireTenant` (usan `req.clinica`/`tenantDb(req)`); el callback público resuelve `dbName` desde el control-plane por el `state` firmado y valida el user en la base del tenant; `sync` público distingue cron (todas las clínicas) vs trigger manual (resuelve la base por el `clinicaId` del token).
- **Push reconectado en los services (best-effort, fire-and-forget):** `citas.service` (`pushCita` en crear/editar; `deleteCitaInGoogle` al eliminar y al pasar a CANCELADA) y `bloqueos.service` (`pushBloqueo` en crear/editar; `deleteBloqueoInGoogle` al eliminar). Nunca hacen fallar la operación primaria.
- **Limpieza del modelo compartido:** eliminados `src/lib/prisma.ts`, `prisma/schema.prisma` (schema shared, 31 KB) y el código muerto `lib/demo-seed.ts` + `lib/demo-cleanup.ts` (el flujo demo ya usa `tenant-seed`/`demo.service`). Retirados de `auth.ts` los huérfanos `requireClinica`/`clinicaId` y del router el array `clinica`/import `requireClinica`. Scripts npm `prisma:sync` y `prisma:generate` (apuntaban al schema viejo) borrados; `prisma:generate:all` ya no invoca el `prisma generate` por defecto. **Cero referencias a `@/lib/prisma` o al cliente por defecto en `src/`.**

Con esto **todo el backend corre en database-per-tenant**. Pendiente: F7 (migrar datos de clínicas existentes de la DB compartida a su base, si las hay) y el cutover 5-4 (Railway + DNS, manual).

## 2026-06-19 — [rama arch/split] DB-por-clínica F3 (cimientos): provisión automática + middleware de tenant

Sigue aditivo y no disruptivo (backend actual verde, 64/64). El backend **crea la base de cada clínica automáticamente** (la credencial de `TENANT_DB_SERVER_URL` debe poder `CREATE DATABASE`).

- **`prisma/tenant/init.sql`**: DDL completo del schema tenant (generado con `prisma migrate diff`), para provisionar bases nuevas sin depender del CLI de Prisma en runtime.
- **`lib/provision.ts`**: `dbNameForSlug` (nombre determinístico y Postgres-válido), `createTenantDatabase` (CREATE DATABASE idempotente), `applyTenantSchema` (ejecuta init.sql sobre la base nueva), `dropTenantDatabase` (corta conexiones + DROP, para limpieza de demos), `provisionTenant` (crea + aplica), `pingTenantServer`. Validación estricta del nombre de base (anti-inyección en identificador).
- **`middlewares/tenant.ts`**: `requireTenant` resuelve la clínica del JWT (control-plane, con cache + TTL) → adjunta `req.tenant` (cliente Prisma de esa base) y `req.clinica`. `tenantDb(req)` accesor; `invalidateClinicaCache`. Reemplazará a `requireClinica`.
- `types/express.d.ts`: `req.tenant` + `req.clinica`. Test `provision.test.ts` (6) de la lógica de nombres.

Pendiente F4 (corte real): refactor de auth (admins de plataforma en control / staff en tenant) y de todos los services de clínica al cliente por-request; wiring de `requireTenant`; provisión enganchada en crearClinica/crearDemo.

**Puente F3→F4 (aditivo, 67/67):** `lib/tenant-seed.ts` (siembra Configuracion + admin en la base nueva) y `services/clinicas-registry.service.ts` (`crearClinicaConProvision`: slug único → dbName → provisión de la base → seed → registro en control-plane, con rollback `dropTenantDatabase` si falla). Test `clinicas-registry` (slugify). Listos para que el controller admin de F4 los use.

**F5 — runner de migraciones por tenant:** `src/scripts/migrate-tenants.ts` (`npm run migrate:tenants`) aplica el schema tenant actual a TODAS las bases de las clínicas (listadas del control-plane) vía `prisma db push` idempotente. Scripts `tenant:initsql` (regenera el DDL para clínicas nuevas) y `control:push` (provisiona el control-plane).

**F6 — tests de aislamiento FÍSICO (11/11):** reescrito el arnés de integración para database-per-tenant. `globalSetup` deriva schemas sqlite de control + tenant, genera clientes y crea **una base sqlite de control + una base sqlite SEPARADA por clínica** (`clariva_t_<slug>.db`). El config aliasa `@/db/control` y `@/db/tenant` a clientes de prueba; `tenantClient(dbName)` abre el archivo de cada clínica. Tests (supertest, stack completo): login dual (control/tenant), **aislamiento físico** (clínica A no ve datos de B porque están en archivos distintos; `GET /pacientes/:idB` → 404; crear en A no aparece en B), no agendar con paciente de otra clínica, gating de roles, `/planes` público. Es la prueba de que el aislamiento es físico, no por columna.

**F4 — conversión masiva de dominios al cliente por-request (67/67 verde en cada paso):**
- **Datos de clínica (11 dominios) → `req.tenant`** (sin `clinicaId`; service usa el cliente de la base de la clínica, controller usa `tenantDb(req)`, rutas a `requireTenant`): pacientes (+ficha/comentarios/mensajes/resumen/export/import), citas, usuarios (equipo), catálogo (prestaciones/medios/config — la config de clínica ahora es la `Configuracion` singleton del tenant), agenda (horarios/bloqueos), clínico (planes/secciones/tratamientos/evoluciones/odontograma), presupuestos, caja (+`lib/caja`), cobros, liquidaciones/contratos, reportes (7 XLSX).
- **Super-admin (`admin.service`) → split control/tenant:** registro de clínicas, planes, leads, pagos, extras y facturación en el **control-plane**; reset de contraseña y config WhatsApp sobre la **base del tenant** (resuelta por `dbName`); `crearClinica` usa `crearClinicaConProvision` (provisión automática de la base). `lib/plans` y `lib/audit-admin` → control-plane.
- Wiring: arrays `tenant`/`adminTenant` en el router; `requireClinica`/`clinica` solo quedan en google/whatsapp (aún sin convertir).
- **Pendiente F4:** integraciones **google** (connect/callback/sync + libs) y **whatsapp** (webhook/recordatorios + lib) — requieren iteración cross-DB en los crons y, para el webhook de WA, una decisión de routing (mapear `waNumero` → clínica en el control-plane). Son opcionales para la marcha blanca. Luego: limpieza (quitar `lib/prisma` viejo + schema compartido), F5–F7.

**F4 (inicio) — auth + demo al modelo control/tenant (67/67, `npm test` verde):**
- `auth.service` reescrito: login dual (clínica → su base tenant resuelta por slug en el control-plane; plataforma → `PlatformAdmin`), `getSessionUser(payload)` rehidrata desde la base correcta, `cambiarPassword` por contexto, `issueTokenForTenantUser` (auto-login de demo). JWT ahora lleva `slug`; `clinicaId` = id en el control-plane.
- `demo.service` convertido: cada demo **provisiona su propia base** + seed (admin + prestaciones del rubro + pacientes de muestra vía `seedDemoTenant`) + registra clínica/lead en el control-plane + emite token; `limpiarDemosExpiradas` borra la base física + el registro.
- `tratamientos`/`liquidaciones` (aún sin convertir) leen permisos del prisma compartido (helper local) para no acoplarse a medias al nuevo auth.
- **Pendiente del corte:** convertir los services de datos de clínica (pacientes, citas, caja, cobros, etc.) al cliente por-request, cablear `requireTenant` en las rutas, y enganchar `crearClinicaConProvision` en el admin. Hasta entonces las rutas de datos de clínica no son runtime-coherentes (no desplegar).

Inicio de la re-arquitectura a **base de datos física por clínica** (decisión registrada en memoria). Cambios **aditivos y no disruptivos**: el backend actual (DB compartida + clinicaId) sigue intacto y verde hasta completar el corte en F4.

- **F1 — Dos schemas Prisma:**
  - `prisma/control/schema.prisma` → cliente `prisma/generated/control`: Clinica (registro, con `dbName` único), PlanSuscripcion, Lead, PagoSuscripcion, ExtraSuscripcion, **PlatformAdmin** (super-admins, login por email), AuditLogAdmin. Datasource `CONTROL_DATABASE_URL`.
  - `prisma/tenant/schema.prisma` → cliente `prisma/generated/tenant`: TODOS los modelos operativos **sin `clinicaId`** (cada base = una clínica) + `Configuracion` singleton con perfil + WhatsApp + tokens Google. Datasource `TENANT_DATABASE_URL` (dinámica en runtime).
- **F2 — Capa de conexión:** `src/db/control.ts` (singleton del control-plane) y `src/db/tenant.ts` (factory + cache de PrismaClient por `dbName`, URL construida desde `TENANT_DB_SERVER_URL`). Env nuevas: `CONTROL_DATABASE_URL`, `TENANT_DB_SERVER_URL` (con fallback a `DATABASE_URL`).
- Scripts `prisma:generate:control/tenant/all`; `build`/`postinstall` generan los 3 clientes (el viejo sigue para no romper). `prisma/generated/` gitignoreado. `prisma generate` funciona sin env (no rompe el build en Railway).
- Fix menor de test: `hookTimeout` en `vitest.config.ts` (el smoke arranca toda la app; expiraba bajo carga paralela).

Verificación: backend typecheck + **58/58** verdes. Pendiente F3–F7 (provisión, refactor de services, migration runner, tests de aislamiento físico, migración de datos).

Dos extras de despliegue listos (opcionales; NIXPACKS sigue siendo el default):
- **Dockerfiles** `backend/`, `frontend/`, `web/` (multi-stage para los estáticos). Contexto de build = raíz del repo (backend/frontend importan `../shared`); `VITE_*` como build args. `.dockerignore` en la raíz.
- **Paquete `cron/`**: `run.mjs` hace POST al backend según `JOB` (`cleanup`/`recordatorios`/`sync`) con `x-cron-secret`; `railway.json` con `cronSchedule` + `restartPolicyType: NEVER`. Un servicio Railway por job.
- **`docs/deploy-extras.md`**: cómo usar Docker (Root Directory = raíz + Dockerfile Path) y cómo configurar los servicios cron (vars + schedules sugeridos). Enlazado desde `cutover.md`.

Scripts `cron/run.mjs` y `scripts/smoke-deploy.mjs` verificados con `node --check`.

Preparativos finales para ejecutar el cutover.

- **Tareas programadas (cron)** documentadas en `cutover.md` (§2.5): recordatorios WhatsApp, sync Google y limpieza de demos — todas vía `POST` con header `x-cron-secret`. Hay que recrearlas (Railway Cron o scheduler externo) apuntando al backend nuevo.
- **`scripts/smoke-deploy.mjs`** (`npm run smoke:deploy`): valida los 3 servicios en vivo (health, `/planes` público, 401 sin token, CORS por subdominio, web y SPA sirviendo con fallback). Para correr tras cada deploy; referenciado en la validación del runbook.
- **Fix subdominios**: el callback de Google (`google.controller`) ahora redirige al **subdominio de la clínica** (`<slug>.dominio/configuracion`) usando el `slug` del state firmado, en vez de un origen único. Coherente con la tenancy por subdominio.

Verificación: backend typecheck + 58/58.

---

## 2026-06-18 — [rama arch/split] Sitio web separado (`web/`): landing + campañas

Se separa el **sitio web/marketing** de la plataforma en un tercer servicio
independiente, para poder crear landing pages sin tocar la app. Tras esto el
monolito se puede retirar por completo.

**Nuevo paquete `web/`** (Vite + React + Tailwind + react-router, mismo stack que el frontend; sin FullCalendar):
- Landing principal portada del monolito (multi-rubro dental/médico/estética, hero, funciones, planes, testimonios, FAQ, CTA) en `src/pages/Landing.tsx` + `src/lib/verticales.ts` (sin la parte `seed`).
- **Precios dinámicos** desde la API pública; **demo** vía `POST /api/v1/demo`. Tras crear la demo, redirige a `https://<slug>.clariva.cl/agenda#token=…` para **auto-login cross-subdominio** (la SPA lee el `#token`). Si no hay dominio (dev), muestra credenciales.
- "Iniciar sesión" → `https://app.<dominio>` (SPA en modo manual).
- **Landing pages de campaña** data-driven: `src/landings/registry.ts` + plantilla `CampaignLanding.tsx`. Agregar una landing = una entrada en el registro → se publica en `clariva.cl/<slug>` (incluida `landing-1` de ejemplo).
- `server.mjs` (estático + fallback SPA), `railway.json`, `.env.example` (`VITE_API_URL`, `VITE_PLATFORM_DOMAIN`).

**Backend:** endpoint **público** `GET /planes` (`public.controller.ts`) con planes activos para la landing (sin auth).

**Frontend (SPA):** `useAuth` lee `#token=` de la URL al iniciar (handoff de sesión desde la demo, cross-origin) y limpia el hash.

**Runbook (`cutover.md`):** ahora **3 servicios** — web (apex/`www`/campañas), frontend SPA (wildcard `*.clariva.cl`), backend (`api`). DNS del apex vía ALIAS/ANAME. El monolito queda **totalmente retirable**.

Verificación: web build verde (269 KB) · frontend build verde · backend typecheck + **58/58** unit+smoke + **23/23** integración (incluye `GET /planes` público) · contrato 116/116 (130 rutas).

---

## 2026-06-17 — [rama arch/split] Tenancy por subdominio (paridad con el monolito)

Las clínicas entran por `<slug>.clariva.cl` (como el monolito); `super-admin.clariva.cl` = plataforma; `clariva.cl`/`www` = landing (se mantiene). **No se cambió la lógica de tenancy** (el `clinicaId` sigue en el JWT); el subdominio solo decide el slug del login.

**Frontend:**
- `lib/tenant.ts`: deriva la clínica del subdominio según `VITE_PLATFORM_DOMAIN`, replicando `extractSubdomain` y los subdominios reservados del monolito (`super-admin, www, admin, api, app, mail`).
- `Login.tsx`: en `<slug>.clariva.cl` fija el slug (no editable, muestra la clínica) y pide solo usuario+contraseña; en `super-admin.clariva.cl` entra en modo plataforma; en apex/localhost (sin dominio) cae a **modo manual** (slug a mano + toggle) — fallback para dev.
- Sesión aislada por clínica "gratis": `localStorage` es por-origen, así que cada subdominio tiene su token (igual que la cookie por subdominio del monolito).

**Backend:**
- CORS por **función de origen**: permite los `corsOrigins` explícitos **o** el apex y cualquier subdominio de `PLATFORM_DOMAIN` (cada clínica es un origin distinto). Sin Origin (curl/healthcheck) se permite.
- `env.platformDomain` desde `PLATFORM_DOMAIN`.

**Runbook (`cutover.md`):** modelo de subdominios — frontend en **wildcard `*.clariva.cl`**, `api` exacto al backend, `www`/apex intactos en la landing; nota de que la landing vive en el monolito (preservarla al retirarlo). `.env.example` de ambos con `PLATFORM_DOMAIN`/`VITE_PLATFORM_DOMAIN`.

Verificación: backend typecheck + **58/58** (incluye CORS por subdominio: clínica/super-admin/apex permitidos, ajeno rechazado); frontend build verde; contrato 116/116.

---

## 2026-06-17 — [rama arch/split] Etapa 5 (cutover): preparación de despliegue

Preparación completa para el cutover a 2 servicios Railway (backend + frontend) sobre la misma DB. **La ejecución (crear servicios/env/dominios/DNS, retirar monolito) es manual** — runbook en `docs/cutover.md`. El monolito queda intacto.

**Backend deploy-ready:**
- `backend/railway.json` (NIXPACKS, `npm start`, healthcheck `/health`, restart ON_FAILURE).
- `package.json`: `tsx` y `prisma` movidos a `dependencies` (sobreviven a poda de devDeps con `NODE_ENV=production`); `postinstall`/`build` = `prisma generate`.
- `app.ts`: `trust proxy` (IP real tras el proxy de Railway, para rate-limit por IP).
- `.env.example` completo (incluye Google OAuth + nota de reusar `NEXTAUTH_SECRET`/`ENCRYPTION_KEY` del monolito).

**Frontend deploy-ready:**
- `frontend/server.mjs`: servidor estático Express que sirve `dist/` con **fallback SPA** y cache por tipo (assets hash inmutables, index sin cache). `express` añadido a `dependencies`. `start` = `node server.mjs`.
- `frontend/railway.json` (healthcheck `/`).
- **Code-split** en `vite.config.ts` (`manualChunks`: react / fullcalendar) → bundle principal 325 KB (antes 632), todos los chunks bajo el umbral; warning eliminado.
- `.env.example`: `VITE_API_URL` (build-time → URL pública del backend).

**Runbook `docs/cutover.md`:** arquitectura objetivo (app + api), pasos Railway por servicio (root dir, env, dominios), CORS, validación con `*.up.railway.app`, DNS (CNAME), switch de tráfico, **rollback** (re-apuntar dominio al monolito; misma DB, sin migración que revertir) y retiro del monolito + traspaso de ownership del schema.

Verificación: backend typecheck + 55/55 tests verdes (con `trust proxy`); frontend build verde con code-split; `server.mjs` probado localmente (`/` y rutas SPA → 200, fallback OK). `architecture.md` marca 5-1..5-3 hechas, 5-4 manual.

---

## 2026-06-17 — [rama arch/split] Paridad 100%: cierre de TODOS los gaps restantes (E1–E5 + Ayuda)

Cierre del resto de gaps de la matriz. **Paridad funcional al 100%.**

**Backend (nuevos endpoints):**
- `POST /auth/cambiar-password` (E1): verifica contraseña actual, política (8+/letra+número), rate-limit 5/15min por usuario, marca `passwordChangedAt`.
- `GET/POST /pacientes/:id/comentarios` (E2), `GET/POST /pacientes/:id/mensajes` (E3), `GET /pacientes/:id/resumen` (E4: KPIs tratamientos/montos/saldo) — todos tenant-scoped.
- `GET /pacientes/export`, `GET /pacientes/template`, `POST /pacientes/import` (E5): XLSX. Import con **multer** (memoria, 5MB) + validación/normalización de RUT + dedup en archivo y DB. Rutas estáticas registradas **antes** de `/pacientes/:id`. Import gateado a admin.

**Frontend:**
- `CambiarPasswordModal` + enlace en el header + **gate de cambio forzado** cuando `requirePasswordChange` (primer ingreso / reset por admin). `useAuth` ahora expone `refrescar()`.
- Ficha: encabezado con **KPIs** (resumen) + tabs **Comentarios** y **Mensajes**.
- Pacientes: barra **Exportar / Plantilla / Importar** (import solo admin, con resumen de resultado y errores por fila).
- **`Ayuda.tsx`** (`/ayuda`): centro de ayuda con búsqueda + categorías, escrito para la UI de la SPA (no copiado del monolito). Home no era gap (el monolito solo redirige a /agenda).
- Servicios: `authService.cambiarPassword`, `pacientesService.{resumen,comentarios,agregarComentario,mensajes}`, `pacientesIO.{exportar,plantilla,importar}`.

**Verificación:** frontend build verde · backend typecheck verde · **55/55** unit+smoke · **22/22** integración (incluye aislamiento multi-tenant de comentarios/resumen y flujo de cambio de contraseña) · contrato FE↔BE **116/116** (129 rutas). Dependencia nueva: `multer` (multipart). Docs `parity-matrix.md` y `qa-report.md` → paridad 100%, veredicto GO.

---

## 2026-06-17 — [rama arch/split] Paridad: cierre de gaps P1 (Presupuestos) + P2 (Reportes)

Cierre de los 2 gaps de UI de severidad media detectados en la matriz de paridad. Veredicto del informe de QA pasa a **GO** (de GO condicional).

- **`Presupuestos.tsx`** (`/presupuestos`): tabla de presupuestos (Nº, paciente, ítems, total, estado, fecha) con **estado editable inline** (PENDIENTE/APROBADO/RECHAZADO/COMPLETADO) y **modal de creación** (selector de paciente + agregar ítems de prestación con cantidad/precio/descuento, subtotal y total en vivo). Usa `presupuestosService` + `prestacionesService` + `pacientesService`.
- **`Reportes.tsx`** (`/reportes`): los 7 reportes XLSX (pacientes, citas, cobros, tratamientos, liquidaciones, caja, morosos) con `descargarReporte` y filtro de **rango de fechas** (`desde`/`hasta`, aplica a los que lo soportan).
- Nav del `DashboardLayout` + rutas en `App.tsx` actualizados.

Build del frontend verde. Contrato FE↔BE sigue 111/111 (usan endpoints ya existentes). `parity-matrix.md` y `qa-report.md` actualizados. Rama respaldada en GitHub (`origin/arch/split-frontend-backend`).

---

## 2026-06-17 — [rama arch/split] QA Etapa 4-5: informe de paridad + go/no-go (Etapa 4 COMPLETA)

`docs/qa-report.md`: cierre de la Etapa 4. **Veredicto: GO condicional** al cutover — backend 100% portado y verificado en sus propiedades críticas (auth, aislamiento multi-tenant en runtime, doble reserva, facturación); condición = cerrar 2 gaps de UI media (Presupuestos, Reportes) y decidir E1/E2 antes de retirar el monolito. **70/70 tests automatizados verdes** (44 lógica pura + 11 smoke + 15 integración) + contrato FE↔BE 111/111 + typecheck/build. Documenta riesgos residuales (datos prod/staging, CORS, ownership de schema, bundle, secretos) y recomendación. `architecture.md` marca Etapa 4 completa.

---

## 2026-06-17 — [rama arch/split] QA Etapa 4-4: contrato FE↔BE + checklist E2E

**Verificador de contrato** (`scripts/contract-check.mjs`, `npm run test:contract`): parsea las llamadas `api.*` de los service clients del frontend y las rutas `apiRouter.*` del backend, normaliza paths (`${...}`/`:param` → `:x`, sin query) y comprueba que **toda llamada del front tenga ruta en el back**. Resultado: **111/111 llamadas mapeadas** (120 rutas BE). Incluye los 7 reportes XLSX (que usan fetch directo). Detecta drift sin levantar nada.

**Checklist de QA E2E** (`docs/qa-checklist.md`): parte automática (resumen de las suites verdes) + puesta en marcha local + flujos manuales por módulo (auth/ruteo, agenda, ficha+odontograma, cobros/caja, liquidaciones, catálogo, reportes, super-admin) con recordatorio de los gaps conocidos (Presupuestos/Reportes sin página).

---

## 2026-06-17 — [rama arch/split] QA Etapa 4-3: tests de integración (multi-tenant + auth)

DB de prueba **SQLite efímera** (el schema no usa features Postgres-only), con el cliente Prisma redirigido **solo bajo el config de integración** (alias `@prisma/client` → cliente sqlite generado en `prisma/.test-client`). **Producción intacta** y **nunca toca la DB de Railway**.

- `test/integration/globalSetup.ts` deriva el schema sqlite del real (`gen-schema.mjs`), genera el cliente y hace `db push --force-reset`.
- `seed.ts`: 2 clínicas aisladas (A/B) + super-admin + planes base.
- `multitenant.test.ts` (supertest, stack completo HTTP→middleware→service→Prisma): **15 tests verdes**.
  - **Login dual**: clínica (slug+usuario) y plataforma (email); contraseña incorrecta y usuario inexistente → 401.
  - **Aislamiento multi-tenant**: `GET /pacientes` no cruza clínicas; `GET/PATCH /pacientes/:id` de otra clínica → 404 (y verifica que el registro ajeno queda intacto); agendar con paciente/doctor de otra clínica → 404; `GET /citas` no cruza.
  - **Doble reserva**: segunda cita solapada del mismo doctor → 409; con `sobrecupo` se permite.
  - **Gating de roles**: admin de clínica → `/admin/*` 403; super-admin → `/admin/stats` 200; super-admin → rutas de clínica 400/403.

Scripts: `npm run test:integration`. Nota: `ensureDefaultPlans()` usa `createMany({skipDuplicates})` (no soportado en sqlite) → el seed inserta los planes para que salga temprano; es un detalle solo-test (prod usa Postgres). Artefactos (`.test-client`, `test.db`, `schema.test.prisma`) gitignoreados.

---

## 2026-06-17 — [rama arch/split] QA Etapa 4-1 + 4-2: matriz de paridad + arnés de pruebas

**4-1 — Matriz de paridad** (`docs/parity-matrix.md`): auditoría de contrato monolito vs nuevo stack. Backend ~100% portado; 5 endpoints sin equivalente (todos sin uso en la SPA: `cambiar-password`, `comentarios`, `mensajes`, `[id]/resumen`, import/export) y 4 vistas sin portar (Presupuestos y Reportes ya tienen el cliente FE listo; home y ayuda son menores). Plan de remediación por severidad.

**4-2 — Arnés de pruebas (Vitest) + lógica pura + smoke, sin DB:**
- Helper puro nuevo `lib/overlap.ts` (`intervalsOverlap` half-open + `addMinutes`); `citas.service` refactorizado para usarlo (de-duplica la regla de doble reserva que compartían cita y bloqueo).
- `test/billing.test.ts` — estado de pago, precio efectivo/período, extras, MRR, `calcularProximoCobro` (al día/atrasado/anual), días para cobro.
- `test/overlap.test.ts` — solapamiento de intervalos (bordes half-open, contención, simetría).
- `test/cita-estados.test.ts` — catálogo + máquina de estados + fallback.
- `test/crypto.test.ts` — AES-256-GCM roundtrip, IV aleatorio, detección de adulteración (authTag), unicode, helpers nullable.
- `test/smoke.test.ts` (supertest, sin DB) — `/health`, headers de seguridad (helmet, sin x-powered-by), 401 en rutas protegidas y super-admin, 401 con JWT inválido, 404 en rutas desconocidas. Verifica además que **todo el grafo de imports del backend ensambla**.

Scripts: `npm test` (lógica pura + smoke), `npm run test:integration` (reservado para 4-3). **55/55 verdes.** Typecheck del backend verde. master intacto.

---

## 2026-06-17 — [rama arch/split] Frontend Etapa 3-5: super-admin (Etapa 3 COMPLETA)

Cierre del frontend de la plataforma. Login dual y panel de administración global.

**Login (`/login`)**: modo dual — acceso de clínica (slug + usuario) o de plataforma (email). Tras autenticar, redirección por rol: `isPlatformAdmin` → `/plataforma`, resto → `/agenda`. `DashboardLayout` también redirige a `/plataforma` si el usuario es admin de plataforma (evita que un super-admin caiga en la UI de clínica).

**SuperAdminLayout** (tema oscuro, guardado por `isPlatformAdmin`): nav Dashboard / Clínicas / Leads / Planes. Rutas `/plataforma/*` en `App.tsx`.

**Dashboard (`/plataforma`)**: KPIs (activas / en trial / suspendidas / demos / total) + tarjeta de **MRR**, desde `GET /admin/stats`.

**Clínicas (`/plataforma/clinicas`)**: KPIs de cartera + MRR y tabla con estado de pago (Al día / Atrasado / Trial / Suspendido) desde `GET /admin/suscripciones/resumen`. Modal **Nueva clínica** (`POST /admin/clinicas`) que muestra las credenciales generadas una sola vez.

**Detalle de clínica (`/plataforma/clinicas/:id`)** — gestión completa: cambiar **plan/ciclo/precio acordado/próximo cobro**, **suspender/reactivar** + notas internas, **extender trial**, **restablecer contraseña** del administrador (muestra la temporal), **pagos** de suscripción (registrar/listar/eliminar), **extras facturables** (crear/pausar/eliminar) y **configuración WhatsApp/Twilio** (SID, número E.164, template, horas, token cifrado opcional).

**Leads (`/plataforma/leads`)**: prospectos capturados desde la landing/demo. **Planes (`/plataforma/planes`)**: alta + edición inline de precio + activar/desactivar.

`adminService` ya tenía todos los métodos (3-1). Build del frontend verde (sólo persiste el warning conocido de tamaño de bundle por FullCalendar → code-split pendiente). **Etapa 3 completa: frontend 100% portado.** master intacto.

---

## 2026-06-17 — [rama arch/split] Frontend Etapa 3-4: cobros/caja + liquidaciones

**Cobros (`/cobros`)**: selector de caja; estado de la sesión (ABIERTA/CERRADA/SIN_SESION) con abrir (conteo declarado + saldo sugerido) y cerrar (arqueo con diferencia); panel de resumen (apertura/ingresos/egresos/saldo esperado); registrar movimiento (egreso/ingreso); **recibir pago** (buscador de paciente + ítems + medio de pago); lista de movimientos de la sesión y de cobros recientes con anulación.

**Liquidaciones (`/liquidaciones`)**: lista con estado editable inline (BORRADOR/APROBADA/PAGADA), generar por profesional + período, detalle con ítems y totales, y gestión de **contratos** (listar activos + crear porcentaje/monto fijo).

Nav + router actualizados. Build del frontend verde. Solo queda 3-5 (super-admin) para paridad.

---

## 2026-06-17 — [rama arch/split] Frontend Etapa 3-3: ficha clínica + odontograma

**Backend (endpoints de lectura que faltaban):** `GET /citas?pacienteId=` (filtro), `PATCH /pacientes/:id` (editar datos, mismo set de campos que el monolito), `GET/PUT /pacientes/:id/ficha` (flags clínicos + odontograma).

**Frontend — `FichaPaciente` (`/pacientes/:id`)** con header e historia por pestañas:
- **Datos**: editar demográficos + flags clínicos (fumador/diabético/etc., alertas, medicamentos).
- **Citas**: historial de citas del paciente (read-only con badge de estado).
- **Planes**: crear plan, abrir detalle, agregar acciones (prestación + pieza), cambiar estado de cada tratamiento (PLANIFICADO/EN_PROGRESO/COMPLETADO).
- **Evoluciones**: listar + agregar nota clínica.
- **Odontograma**: arcadas FDI interactivas (32 piezas); click en pieza → selector de estado (Sano/Caries/Obturado/Corona/Endodoncia/Implante/Ausente) → upsert al backend; leyenda de colores.

La lista de Pacientes ahora enlaza a la ficha. Builds verdes (frontend + backend). master intacto.

---

## 2026-06-17 — [rama arch/split] Frontend Etapa 3-2: agenda completa

**Agenda SPA** (FullCalendar instalado en el frontend): vista **semanal** (timeGridWeek de un profesional, business hours desde los horarios del doctor, drag&drop y resize → reagendar contra el backend con revert si choca) y vista **diaria** (lista con acción rápida de estado). Selector de profesional, filtros de estado con "Todos", navegación de fecha.

**Modales**: crear cita (paciente existente con buscador o paciente nuevo + profesional + motivo + duración + sobrecupo), detalle de cita (flujo de estados con acción siguiente destacada, grilla de estados, link WhatsApp, eliminar), detalle/crear bloqueo. Avisos transitorios in-page.

Servicios extendidos: `citas.editar/eliminar`, `bloqueosService`, `horariosLectura`. Build del frontend verde.

---

## 2026-06-17 — [rama arch/split] Frontend Etapa 3-1: capa de servicios + Equipo/Prestaciones/Config

**Capa de servicios API del SPA** (`frontend/src/services/`): equipo (usuarios, doctores, horarios), catálogo (prestaciones, medios de pago, clínica), clínico (planes, secciones, tratamientos, evoluciones, odontograma, presupuestos), caja (cobros, cajas, sesiones, movimientos, liquidaciones, contratos), reportes (descarga XLSX autenticada vía blob), admin (super-admin). Toda la superficie del backend queda consumible de forma tipada.

**Pantallas nuevas**: Equipo (listar/crear/activar usuarios), Prestaciones (catálogo agrupado por categoría, crear/eliminar), Configuración (datos de la clínica + plantilla WhatsApp). Nav y router actualizados.

Build del frontend verde. **Pendiente Etapa 3**: agenda completa (3-2), ficha clínica + odontograma (3-3), cobros/caja/liquidaciones (3-4), super-admin (3-5).

---

## 2026-06-17 — [rama arch/split] Backend Etapa 2B-4: integraciones + demo (backend 100%)

**2B-4a — WhatsApp + Demo:** libs `verticales`, `whatsapp`, `demo-seed`, `demo-cleanup` copiadas. `demo.service` (crear sandbox + lead + seed por rubro + auto-login con token; cleanup). Controllers públicos con auth interna: demo (rate-limited), demo/cleanup y whatsapp/recordatorios (cron-secret o admin), whatsapp/webhook (firma Twilio HMAC). `express.urlencoded` para el webhook.

**2B-4b — Google Calendar:** `googleapis` agregado; libs `google.ts` y `google-sync.ts` copiadas (tipo OAuth2Client derivado de googleapis para evitar choque de versiones de google-auth-library). `google.controller`: connect (devuelve authUrl para el SPA), callback (redirect público validado por state firmado), disconnect, calendars, sync (cron o admin), reconcile-bloqueos. **Efectos diferidos cableados**: `pushCita`/`deleteCitaInGoogle` en crear/editar/cambiar-estado/eliminar cita; `pushBloqueo`/`deleteBloqueoInGoogle` en bloqueos.

**Verificación:** typecheck OK; smoke (health, 401 en connect/sync, redirect correcto del callback). master/monolito intactos.

**🎉 Backend 100% portado**: todas las rutas del monolito tienen equivalente en `/api/v1/*`. Próximo: Etapa 3 (migrar vistas del frontend) y Etapa 5 (cutover).

---

## 2026-06-17 — [rama arch/split] Backend Etapa 2B-3b: super-admin

**Portado** (`admin.service` + `admin.controller` + rutas `/api/v1/admin/*`, guard `requireSuperAdmin`):
- Clínicas: listar (excluye demos, con _count), detalle, crear (slug único, copia catálogo de la plantilla digital-dent, genera admin + password aleatoria), editar, cambiar plan (con cálculo de próximo cobro), estado (suspender/reactivar), extender trial, reset de contraseña admin.
- Pagos de suscripción: listar, registrar (recalcula próximo cobro, reactiva, trial→básico, tope $20M), eliminar (recalcula).
- Extras facturables: CRUD.
- Configuración WhatsApp por clínica: GET/PUT (token cifrado).
- Planes de suscripción: CRUD (no borra si hay clínicas usándolo).
- Resumen de suscripciones (MRR/ARR + extras, excluye demos), stats del dashboard, leads.
- Libs portadas: `billing.ts`, `plans.ts` (copiadas, agnósticas), `audit-admin.ts` (adaptada: recibe ip/userAgent del request Express). Auditoría de todas las acciones sensibles.

Typecheck OK + smoke (401 en rutas admin). master/monolito intactos.
**Con 2B-3 el backend cubre clínico + financiero + reportes + super-admin.** Pendiente: 2B-4 (integraciones Google/WhatsApp + demo).

---

## 2026-06-17 — [rama arch/split] Backend Etapa 2B-2 (parte 2): flujo financiero

**Portado** (el bloque más delicado — dinero):
- `caja.service` + `lib/caja.ts` (copiado): cajas (CRUD, soft-delete, acceso por miembro/admin), sesiones (saldo sugerido, abrir con conteo declarado, cerrar transaccional con back-fill de huérfanos + arqueo/diferencia), movimientos (listar, crear manual con sesión abierta obligatoria, anular con permiso `puedeEditarPagos`).
- `cobros.service`: listar, detalle, crear (permiso `puedeRecibirPagos`, exige caja con sesión abierta, transacción cobro + MovimientoCaja por el neto), editar (campos libres vs privilegiados), anular (transacción que también anula el movimiento), eliminar (solo admin).
- `liquidaciones.service`: contratos (CRUD, un activo por doctor), liquidaciones (generar por período desde tratamientos COMPLETADOS no liquidados según contrato %/fijo, listar/detalle con scope por rol, cambiar estado).
- Controllers + validators zod + rutas `/api/v1/{cajas,cobros,contratos,liquidaciones}`.

Typecheck OK + smoke (auth en todas las rutas). master/monolito intactos.
Con esto el backend cubre todo el flujo clínico-financiero del día a día.

**Pendiente:** 2B-3 (reportes + super-admin) y 2B-4 (integraciones + demo).

---

## 2026-06-17 — [rama arch/split] Backend Etapa 2B-2 (parte 1): presupuestos

**Portado:** `presupuestos.service` + controller + rutas — listar (por paciente), detalle (con items + prestación + paciente), crear (numero correlativo por clínica, items), editar (estado/notas/vigencia/total con validación de estado).

**Pendiente 2B-2 (parte 2):** cobros + caja (sesiones, movimientos, abrir/cerrar, arqueo, `lib/caja.ts`) + liquidaciones. Es un bloque interdependiente (cobro exige sesión de caja abierta y genera MovimientoCaja); se porta en una sub-tanda enfocada para no introducir errores.

Typecheck OK. master/monolito intactos.

---

## 2026-06-17 — [rama arch/split] Backend Etapa 2B-1: dominio clínico

**Portado al backend** (`tratamientos.service` + `clinico.controller` + rutas):
- Planes de tratamiento: listar (por paciente), crear, detalle (árbol con secciones + tratamientos + cobroItems), editar, eliminar.
- Secciones de plan: crear (orden auto), editar, eliminar.
- Tratamientos (acciones): crear (soporta múltiples piezas, hereda doctor titular del plan, respeta permisos de precio/descuento), editar (permiso para revertir COMPLETADO, precio, descuento), eliminar.
- Evoluciones: listar, crear, eliminar (autor o admin).
- Odontograma: upsert de diente (auto-crea ficha clínica si falta).
- Medios de pago (en `catalogo.service`): CRUD.
- Permisos finos (precio/descuento/revertir) se leen frescos vía `getSessionUser` (no del JWT), igual que el monolito.

Validators zod nuevos. Rutas `/api/v1/{planes-tratamiento,secciones-plan,tratamientos,evoluciones,odontograma,medios-pago}`. Typecheck OK + smoke (auth/404 correctos). master/monolito intactos.

---

## 2026-06-16 — [rama arch/split] Backend Etapa 2A: equipo, agenda, catálogo, config

**Solicitud:** Continuar la Etapa 2 — portar más dominios al backend Express.

**Dominios portados (en `backend/src`):**
- `usuarios.service` — listar equipo, listar doctores (para selectores de agenda), crear (admin) y editar usuario (self/admin, con validación de username/email único, permisos, password ≥8, reset de syncToken al cambiar calendario).
- `horarios.service` — listar y upsert de horarios por día (solo doctor/médico).
- `bloqueos.service` — listar (doctor ve los suyos / admin todos), crear, editar, eliminar con reglas de permiso.
- `catalogo.service` — prestaciones (CRUD) + configuración de la clínica (GET/PATCH).
- `citas.service` — +editar/reagendar (revalida solape y bloqueo, loguea reagendado) y +eliminar.
- Controllers + validators zod + rutas `/api/v1/{usuarios,doctores,horarios,bloqueos,prestaciones,clinica,citas}`.
- JWT ahora incluye `name`/`email` (para logs y "creado por" sin queries extra); helper `actorName`.
- DTOs nuevos en `/shared`: Usuario, Horario, Bloqueo, Prestacion, ClinicaConfig.

**Diferido a 2B:** efectos hacia Google (push de citas/bloqueos, sync de calendario) — se portan con el dominio de integraciones. Por ahora el backend persiste sin disparar Google.

**Verificación:** `npm run typecheck` OK; boot + health + protección 401 de rutas nuevas verificados. Monolito y `master` intactos. `docs/api.md` actualizado.

---

## 2026-06-16 — [rama arch/split] Separación física frontend/backend — Etapa 1

**Solicitud:** Refactorización estructural a arquitectura separada frontend (SPA) + backend (API REST), profesional y escalable, por etapas y sin romper producción.

**Decisión de arquitectura:** Se evaluó el split físico vs. capas dentro de Next. El usuario eligió el **split físico real** (Vite + Express). Para cumplir "migración segura por etapas sin romper lo que funciona", se construye el nuevo stack **en paralelo en la rama `arch/split-frontend-backend`**, dejando el monolito Next vivo en producción hasta el *cutover* (etapa 5). **No se toca `master`.**

**Trabajo de la Etapa 1 (esta entrada):**
- `shared/` (NUEVO) — DTOs y constantes de dominio (estados de cita) compartidos.
- `backend/` (NUEVO) — Express + TS + Prisma. Config, prisma singleton, errores tipados (`AppError`), middlewares (async-handler, error, auth JWT, multi-tenant `requireClinica`/`requireSuperAdmin`/`requireAdmin`). Servicios de negocio portados: `auth` (login dual + JWT + rate-limit), `pacientes` (CRUD + RUT único + correlativo), `citas` (listar/crear con anti doble-reserva + cambio de estado con log). Controllers + validators (zod) + rutas `/api/v1/*`. Probado: `/health` y validación de login OK.
- `frontend/` (NUEVO) — Vite + React 19 + TS + Tailwind 4. Cliente API tipado (`services/api.ts`), `useAuth` (contexto), `ProtectedRoute`, `DashboardLayout`, páginas Login/Agenda/Pacientes consumiendo el backend. Build verde.
- `tsconfig.json` (monolito) — excluye `backend`, `frontend`, `shared` para no contaminar el build de Next.
- `docs/architecture.md` + `docs/api.md` (NUEVOS) — arquitectura objetivo, reglas, plan de etapas y referencia de la API.

**Verificación:** backend `typecheck` OK + boota; frontend `build` OK; **monolito `next build` sigue verde** (producción intacta).

**Pendiente (etapas 2-5):** portar el resto de dominios y vistas, paridad + QA, y cutover (2 servicios en Railway). Hasta entonces, producción = monolito.

---

## 2026-06-15 — Landing y demos multi-rubro (dental · médico · estética)

**Solicitud:** Vender la plataforma a 3 segmentos. La landing debe adaptarse a cada uno y la demo debe sembrar datos propios de cada rubro.

**Archivos modificados:**
- `lib/verticales.ts` (NUEVO) — Fuente única de los 3 rubros: copy de landing (badge, titular, subtítulo, features, testimonios, terminología paciente/cliente, clínica/centro) + config de seed (profesionales, prestaciones y motivos por rubro). `getVertical()`, `esVertical()`.
- `app/page.tsx` — Lee `?rubro=` (dental|medico|estetica) y pasa el vertical inicial (para campañas: `clariva.cl/?rubro=estetica`).
- `app/landing-client.tsx` — Selector de rubro visible (3 pills); todo el copy (hero, features, pasos, FAQ, testimonios, formulario de demo) se adapta al rubro elegido en vivo. El modal envía el `vertical`.
- `lib/demo-seed.ts` — `seedDemoClinica(clinicaId, vertical)`: profesionales, prestaciones y motivos del rubro. (Dental: odontología/endodoncia/orto; Médico: medicina general/pediatría/nutrición; Estética: cosmetología/dermatología/láser.)
- `app/api/demo/route.ts` — Acepta y valida `vertical`, lo guarda en `Lead.rubro` y lo pasa al seed.
- `prisma/schema.prisma` — `Lead.rubro` (aditivo).
- `app/digital-dent-super-admin/leads/page.tsx` — Columna "Rubro" con badge por segmento.

**Pendientes derivados:** los mismos de la entrada anterior (precios, testimonios reales, WhatsApp de ventas, cron de limpieza).

---

## 2026-06-15 — Landing comercial + demo self-service con captura de leads

**Solicitud:** Página web de venta de Cláriva (dinámica, precios desde la DB) con generación de "demo" self-service: cada demo crea una clínica sandbox con pacientes ficticios y captura los datos del prospecto como lead.

**Archivos modificados:**
- `prisma/schema.prisma` — NUEVO modelo `Lead` (nombre, email, telefono, nombreClinica, origen, clinicaId/Slug, ip). `Clinica`: + `esDemo`, `demoExpiraEn`. Aditivo.
- `app/page.tsx` + `app/landing-client.tsx` (NUEVO) — Landing de venta: hero con "desde $X/mes" (mínimo plan pagado de la DB), funciones, cómo funciona, planes (toggle mensual/anual, leídos de PlanSuscripcion), testimonios placeholder, FAQ, CTA, footer. Modal de demo con auto-login.
- `lib/demo-seed.ts` (NUEVO) — `seedDemoClinica`: 3 profesionales + horarios, 18 pacientes con RUT chileno válido (módulo 11), citas de la semana actual en varios estados, prestaciones, planes de tratamiento y cobros pagados.
- `lib/demo-cleanup.ts` (NUEVO) — `borrarClinicaDemo`: borra en cascada respetando FKs; el Lead sobrevive (clinicaId→null).
- `app/api/demo/route.ts` (NUEVO) — POST público rate-limited (3/h por IP, 2/día por email): crea clínica esDemo TRIAL (7 días), admin sin cambio forzado, Lead, y siembra datos. Devuelve credenciales para auto-login.
- `app/api/demo/cleanup/route.ts` (NUEVO) — borra demos expiradas (x-cron-secret o super-admin).
- `proxy.ts` — `/api/demo` en PUBLIC_API.
- `app/digital-dent-super-admin/leads/page.tsx` (NUEVO) + link en topbar — vista de leads con estado de la demo.
- Dashboard super-admin, clínicas list y `suscripciones/resumen` — excluyen `esDemo` de KPIs/MRR; KPI "Demos activas".
- `components/DemoBanner.tsx` (NUEVO) — banner de modo demo dentro del dashboard (CTA Contratar por WhatsApp).

**Pendientes derivados (manuales del usuario):**
- Ajustar precios reales en super-admin → Planes (el "desde" del hero usa el menor plan pagado; hoy puede mostrar el valor actual de BASICO).
- Reemplazar testimonios placeholder y el número de WhatsApp de ventas (en DemoBanner y CTA del dashboard, placeholder 56900000000).
- Cron diario en Railway → POST `/api/demo/cleanup` con `x-cron-secret`.
- Verificar que PLATFORM_DOMAIN siga sin configurarse (la demo redirige a `/c/<slug>/agenda`, modo path).

---

## 2026-06-12 — Confirmaciones WhatsApp (Twilio) + extras facturables por clínica

**Solicitud:** Automatizar envío/recepción de confirmaciones por WhatsApp vía Twilio (oficial). Como tiene costo por volumen, debe cobrarse como "extra" por clínica en el Super Admin e incluirse en la facturación mensual.

**Archivos modificados:**
- `prisma/schema.prisma` — NUEVO modelo `ExtraSuscripcion` (cargo recurrente por clínica: nombre, montoMensual, activo). `Clinica`: + `waEnabled`, `waTwilioSid`, `waTwilioToken` (cifrado AES-256-GCM), `waNumero`, `waTemplateSid`, `waHorasAntes`, relación `extras`. `Cita`: + `waMessageSid` (indexado, evita doble envío y correlaciona respuestas). **Todo aditivo, sin riesgo de datos.**
- `lib/whatsapp.ts` (NUEVO) — Envío de plantilla Twilio Content API vía fetch (sin SDK): `enviarRecordatorioCita`, `enviarRecordatoriosPendientes` (cron), `procesarRespuestaEntrante` (confirma/cancela/reagenda + CitaLog), `validarFirmaTwilio` (HMAC-SHA1 de X-Twilio-Signature), `interpretarRespuesta`, `fonoAE164`.
- `app/api/whatsapp/webhook/route.ts` (NUEVO) — Webhook de respuestas: resuelve clínica por número receptor, valida firma Twilio con el token de esa clínica, actualiza la cita y responde TwiML al paciente.
- `app/api/whatsapp/recordatorios/route.ts` (NUEVO) — Disparo de envíos: header `x-cron-secret` (cron) o sesión admin (botón manual).
- `app/api/admin/clinicas/[id]/extras/` + `[extraId]/` (NUEVOS) — CRUD de extras con auditoría.
- `app/api/admin/clinicas/[id]/whatsapp/route.ts` (NUEVO) — GET/PUT config Twilio (token nunca se devuelve; solo se pisa si viene uno nuevo).
- `lib/billing.ts` — `montoExtrasMensual()`, `precioMensualTotal()`.
- Super Admin: dashboard y `suscripciones/resumen` suman extras activos al MRR/ARR; `suscripcion-panel` muestra "plan + extras" y sugiere el pago con extras; `extras-whatsapp-panels.tsx` (NUEVO) con los dos paneles en el detalle de clínica.
- `proxy.ts` — `/api/whatsapp` en PUBLIC_API (firma Twilio + CRON_SECRET protegen).
- `lib/audit-admin.ts` — acciones CREAR/EDITAR/ELIMINAR_EXTRA y CONFIGURAR_WHATSAPP.

**Convención de plantilla Twilio:** variables {{1}} paciente, {{2}} clínica, {{3}} fecha, {{4}} hora; botones quick-reply Confirmar / Reagendar / Cancelar. Webhook entrante: `https://app.clariva.cl/api/whatsapp/webhook`.

**Pendientes derivados:**
- Configurar cron de Railway (cada hora) → POST `/api/whatsapp/recordatorios` con header `x-cron-secret`.
- Piloto Digital Dent: agregar 2º número a su WABA, conectarlo a Twilio, crear la plantilla, cargar credenciales en el panel.

---

## 2026-06-12 — Agenda semanal por profesional + vista diaria estilo planilla clínica

**Solicitud:** (con capturas de Dentalink como referencia) La semanal con todos los doctores superpuestos era ilegible → dejar un solo profesional. La diaria → lista de trabajo con datos del paciente y cambio de estado inline.

**Archivos modificados:**
- `app/(dashboard)/agenda/agenda-client.tsx`:
  - Semanal SIEMPRE de un profesional: selector en el header, sin opción "Todos" (que sigue en Diaria/Global). Default = el propio usuario si es doctor.
  - ListaDiaria rediseñada: hora en bloque coloreado por estado (inicio→fin), RUT formateado + teléfono + motivo, dropdown de estado inline por fila, buscador del día (nombre/RUT/teléfono, ignora tildes), bloqueos ocultos durante búsqueda.
  - Panel lateral: "Marcar todos" para los filtros de estado.

**Riesgos / consideraciones:**
- `doctorFilter` ahora inicia en un doctor concreto (la vista inicial es semanal). Al cambiar a Diaria/Global se puede elegir "Todos" manualmente.

---

## 2026-06-12 — Drag & drop en agenda, toasts globales y hardening de seguridad

**Solicitud:** Drag & drop para reagendar, toasts en el resto de módulos, y "seguridad cibernética robusta" pre-comercialización.

**Archivos modificados:**
- `app/(dashboard)/agenda/agenda-client.tsx` — FullCalendar con `editable`: arrastrar cita = reagendar, estirar borde = cambiar duración. El backend valida solapes/bloqueos; si rechaza, el evento vuelve a su lugar con toast de error. Bloqueos no arrastrables.
- `components/Evoluciones.tsx`, `components/PlanesTratamiento.tsx`, `pacientes-client.tsx`, `ficha-client.tsx`, super-admin (`planes-client`, `suscripcion-panel`, `clinica-detail-client`) — 15 `alert()` convertidos a `toast.error`.
- `next.config.ts` — Security headers globales: HSTS (2 años, subdominios, preload), X-Frame-Options DENY + CSP frame-ancestors, nosniff, Referrer-Policy, Permissions-Policy, sin X-Powered-By.
- `lib/rate-limit.ts` (NUEVO) — Limitador en memoria con ventana deslizante (`rateLimit`, `peekLimit`, `registerFailure`, `resetLimit`). Edge-safe.
- `lib/auth.ts` — Login con anti fuerza bruta: 5 fallos/15min por usuario + 30/15min por IP (solo fallos consumen cupo; éxito resetea). Sesiones JWT expiran a las 12 h.
- `app/(auth)/login/login-client.tsx` + `app/digital-dent-admin-login/admin-login-client.tsx` — Mensaje claro de bloqueo temporal con minutos de espera.
- `app/api/auth/cambiar-password/route.ts` — Política nueva: mínimo 8 caracteres con letra y número; rate limit 5/15min; bcrypt cost 12; rechaza reutilizar la actual.
- `app/api/usuarios/*`, `app/api/admin/clinicas/[id]/reset-admin-password`, `app/cambiar-password/page.tsx`, `mi-cuenta-client.tsx`, `reset-pass-card.tsx` — Mínimo de contraseña subido de 6 a 8 en validaciones y UI.
- `proxy.ts` — Rate limit global de API: 300 req/min por IP (429 + Retry-After).
- `docs/SECURITY.md` (NUEVO) — Postura de seguridad completa, limitaciones conocidas, runbook de incidentes.

**Riesgos / consideraciones:**
- Rate limiting en memoria: efectivo con 1 instancia (configuración actual de Railway). Si se escala a réplicas, migrar a Redis (documentado en SECURITY.md).
- Sesiones existentes emitidas antes del cambio conservan su expiración original (30 días NextAuth default) hasta re-login.
- Contraseñas existentes de 6-7 caracteres siguen funcionando; la política aplica a cambios nuevos.

**Pendientes derivados:**
- 2FA TOTP para super-admin.
- Sentry + UptimeRobot.
- Verificar retención de backups Postgres en Railway.

---

## 2026-06-11 — Fase de maduración comercial: agenda fluida, estados clínicos, anti doble-reserva, Inter + toasts

**Solicitud:** Optimización general pre-lanzamiento: agenda más funcional para uso clínico real, consistencia visual premium (estilo Linear/Notion), estados de carga/error/éxito, sin romper lo existente.

**Archivos modificados:**
- `lib/cita-estados.ts` (NUEVO) — Fuente única de los 7 estados de cita (incluye `EN_ESPERA` y `EN_ATENCION`, label de PENDIENTE pasa a "Agendada"). `siguienteEstado()` define el flujo de recepción.
- `lib/citas.ts` (NUEVO) — `findCitaSolapada()` + `mensajeSolape()`: detección de doble reserva (sobrecupos exentos; CANCELADA/NO_ASISTIO liberan horario).
- `app/api/citas/route.ts` — POST valida solape contra otras citas activas (409 con mensaje claro).
- `app/api/citas/[id]/route.ts` — PATCH: estados nuevos en whitelist, valida solape y bloqueos al reagendar/cambiar doctor, log automático "Reagendada de X a Y".
- `app/(dashboard)/agenda/agenda-client.tsx` — Eliminados todos los `window.location.reload()` (ahora `router.refresh()` + toasts: no se pierden filtros/vista/scroll). Modal nuevo "Editar / Reagendar cita" (fecha, hora, duración, doctor, motivo, notas). Acción principal del flujo destacada en detalle (Confirmar→Llegó→Pasar al sillón→Finalizar) y quick-action por fila en vista Diaria. `saveCita` ahora maneja errores del API (antes los ignoraba). Búsqueda de paciente normaliza tildes. Emojis reemplazados por SVG.
- `components/ui/Toaster.tsx` (NUEVO) — Sistema de toasts global sin dependencias (`toast.success/error/info`), montado en layout dashboard y super-admin.
- `app/layout.tsx` + `app/globals.css` — Tipografía **Inter** vía next/font (toda la app), `tabular-nums` en tablas/montos, focus-visible consistente, `prefers-reduced-motion`.
- `app/(dashboard)/dashboard-client.tsx`, `app/(dashboard)/pacientes/[id]/ficha-client.tsx`, `app/(dashboard)/reportes/reportes-client.tsx` — Estados de cita importados del módulo compartido (labels y colores consistentes; ficha ahora muestra label legible, no la constante).

**Resumen de cambios:**
La agenda pasa de "calendario genérico" a herramienta de recepción: flujo de estados clínicos completo con un clic, edición/reagendado sin salir de la vista, prevención de doble reserva en el backend y feedback inmediato con toasts. Base visual unificada con Inter y tokens.

**Riesgos / consideraciones:**
- `Cita.estado` es String en Prisma → estados nuevos son no-destructivos; datos históricos no cambian.
- Citas que ya estaban solapadas ANTES de este cambio siguen existiendo (la validación es para escrituras nuevas).
- `next/font` descarga Inter en build de Railway (si Google Fonts fallara, el build falla; riesgo bajo, Inter es estable).

**Pendientes derivados:**
- Drag & drop para reagendar directo en el calendario semanal (FullCalendar `editable`).
- Aplicar toasts al resto de módulos que aún usan `alert()`.

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

## 2026-05-14 — Subdominios por clínica + login dual + cambio forzado de contraseña

**Solicitud:** Cada clínica accede por su propia URL (`cumbres.tudominio.cl`, etc.). Al crear una clínica nueva, generar un usuario `Administrador` con contraseña `ADMIN22`, que la plataforma obliga a cambiar en el primer login. Mantener funcionando un modo fallback `/c/<slug>/login` mientras no haya dominio configurado.

**Archivos modificados:**
- `prisma/schema.prisma`:
  - `User`: `email` ahora opcional, +`username String?`, +`passwordChangedAt DateTime?`, `@@unique([clinicaId, username])`.
- `lib/auth.ts`:
  - Login dual: `slug+username+password` (clínica) o `email+password` (super-admin / legacy).
  - JWT/session: añade `clinicaId`, `isPlatformAdmin`, `requirePasswordChange` (true si `passwordChangedAt` es null).
- `proxy.ts`:
  - Detecta subdominio cuando `PLATFORM_DOMAIN` está set. Detecta path `/c/<slug>/...` siempre. Reescribe internamente e inyecta header `x-clinica-slug`. Redirige `/login` al contexto correcto (`/c/<slug>/login` si vino por path).
- `lib/clinica-context.ts`: helper `getClinicaSlugFromContext()` para server components.
- `app/(auth)/login/page.tsx` + `login-client.tsx`: formulario adaptativo según haya slug en el header.
- `app/api/admin/clinicas/route.ts`: auto-crea usuario `Administrador` con hash de `ADMIN22` y `passwordChangedAt: null`. Devuelve `credenciales` con `url_subdominio`, `url_fallback`, `usuario`, `contrasena`.
- `app/digital-dent-super-admin/clinicas/nueva/page.tsx`: formulario simplificado (sin campos de admin/email/password); muestra credenciales generadas con botones de copiar.
- `app/(dashboard)/layout.tsx`: redirige a `/cambiar-password` si `requirePasswordChange`.
- `app/cambiar-password/page.tsx` + `app/api/auth/cambiar-password/route.ts`: UI y endpoint para cambio forzado de contraseña; tras éxito hace `signOut` para refrescar el JWT.
- `prisma/seed-admin-existing-clinics.ts`: script idempotente para crear `Administrador` en clínicas activas existentes.
- `docs/DNS_SETUP.md`: guía completa de DNS, wildcard, `PLATFORM_DOMAIN`, modo path vs subdominio.
- Eliminados: `app/(auth)/registro/`, `app/api/clinicas/` (registro público — sólo super-admin crea clínicas ahora).

**Resumen de cambios:**
La plataforma ahora es de verdad multi-tenant con login segmentado por clínica. Cada clínica recibe una URL única (`cumbres.tudominio.cl` cuando haya dominio, `/c/cumbres/login` mientras tanto) y un usuario `Administrador` con clave temporal `ADMIN22` que debe cambiarse al entrar. El header `x-clinica-slug` injectado por el middleware permite al formulario de login y a los server components conocer el tenant sin sesión previa. El modo subdominio se activa con la env `PLATFORM_DOMAIN`; ambos modos conviven.

**Riesgos / consideraciones:**
- Se aplicó `prisma db push --accept-data-loss` contra Railway: campos `username` y `passwordChangedAt` agregados a `User`, `email` ahora nullable. El `Administrador` para la clínica `digital-dent` existente se creó vía `seed-admin-existing-clinics.ts`.
- Para activar subdominios falta: comprar dominio, apuntar wildcard `*.tudominio.cl` a Railway, configurar `PLATFORM_DOMAIN` en variables. Documentado en `docs/DNS_SETUP.md`.
- `NEXTAUTH_URL` actualmente apunta a `digital-dent-production.up.railway.app`; al migrar a dominio propio debe actualizarse.
- Las cookies de NextAuth son por dominio: cada subdominio tendrá su propia sesión (deseado).

**Pendientes derivados:**
- Apagar Vercel y rotar credenciales de Neon (la plataforma vive 100% en Railway ahora).
- Cuando exista el dominio: añadir custom domain + wildcard en Railway, setear `PLATFORM_DOMAIN`, actualizar `NEXTAUTH_URL`.
- Validación de slug en superadmin: avisar si el slug colisiona con un subdominio reservado (www, app, api, etc.).

---

## 2026-05-13 — Módulo Pacientes rediseñado (Fase 2A)

**Solicitud:** Mejorar listado de pacientes con fila expandible mostrando indicadores (RUT, email, teléfono, convenio, tratamientos activos/finalizados/expirados, recaudación). Rediseñar ficha del paciente con tabs principales (Datos personales / Ficha clínica / Planes / Facturación / Recibir pago), subtabs (Datos / Citas / Comentarios administrativos / Mensajes — omitir "Tareas de gestión"), indicadores médicos en el header (Alertas / Enfermedades / Medicamentos), y historial unificado de mensajes (emails con planes, documentos, recetas + confirmaciones WhatsApp).

**Archivos modificados:**
- `prisma/schema.prisma`:
  - `Paciente`: +18 campos (numero correlativo, nombreSocial, sexo, nacionalidad, migrante, puebloOriginario, telefonoFijo, ciudad, comuna, actividad, empleador, apoderado, rutApoderado, referencia, tipoPaciente, numeroInterno, otroDocId). `@@unique([clinicaId, numero])`.
  - `FichaClinica`: +`alertasMedicas`, +`enfermedadesNotas` (texto libre).
  - Nuevo `ComentarioAdministrativo` (autor + texto + timestamp por paciente).
  - Nuevo `MensajePaciente` (tipo EMAIL/WHATSAPP/SMS × categoría CONFIRMACION_CITA/PLAN_TRATAMIENTO/DOCUMENTO/RECETA/OTRO).
- `prisma/seed-multi-tenant.ts` — asigna `numero` correlativo a pacientes existentes por clínica, ordenados por `createdAt`.
- `app/api/pacientes/route.ts` — POST asigna `numero` automáticamente. Acepta todos los nuevos campos.
- `app/api/pacientes/[id]/route.ts` — PATCH con todos los campos nuevos.
- `app/api/pacientes/[id]/comentarios/route.ts` — creado. GET/POST con autor de la sesión.
- `app/api/pacientes/[id]/mensajes/route.ts` — creado. GET/POST.
- `app/(dashboard)/pacientes/page.tsx` — incluye tratamientos, cobros y presupuestos para calcular KPIs por paciente.
- `app/(dashboard)/pacientes/pacientes-client.tsx` — listado completo rediseñado: filtros (búsqueda, número, tratamientos con/sin), tabla con columnas #/Nombre/Apellidos/Tratamientos/Deudas, fila expandible al click con avatar + contacto + KPIs tratamientos + recaudación + links rápidos.
- `app/(dashboard)/pacientes/[id]/page.tsx` — incluye comentarios admin y mensajes en el query.
- `app/(dashboard)/pacientes/[id]/ficha-client.tsx` — reescrito completo:
  - Header azul con ID, avatar, nombre, RUT, edad, previsión.
  - 3 indicadores médicos (Alertas / Enfermedades / Medicamentos) que cambian color si tienen contenido.
  - 5 tabs principales: Datos personales | Ficha clínica | Planes de tratamiento | Facturación y pagos | Recibir pago.
  - Acciones Agendar (→ /agenda?pacienteId) y Historia clínica (→ print plan).
  - Subtabs de Datos personales: Datos | Citas (N) | Comentarios | Mensajes (N).
  - Formulario completo con todos los campos nuevos (datos requeridos + opcionales).
  - Comentarios: textarea + listado con autor y fecha.
  - Mensajes: timeline con badge tipo (EMAIL/WHATSAPP/SMS) + categoría + estado.

**Resumen de cambios:**
Módulo pacientes pasa de un listado simple + ficha plana a una experiencia rica como SaaS comercial. El listado da overview rápido con todo lo importante al expandir una fila. La ficha tiene la profundidad necesaria para que un doctor opere todo desde un solo lugar. Comentarios administrativos y historial de mensajes son trazables para auditoría.

**Riesgos / consideraciones:**
- `numero` correlativo se asigna en el seed (existentes) y en el POST (nuevos). Si dos POST llegan al mismo milisegundo a la misma clínica, podrían colisionar por `@@unique([clinicaId, numero])`. Aceptable por la baja concurrencia esperada en una clínica.
- El historial de mensajes está listo para recibir entradas pero **nadie las crea automáticamente todavía**. Cuando enviemos confirmaciones WhatsApp en el módulo agenda, hay que insertar en `MensajePaciente`. Pendiente para integración real.
- "Tareas de gestión" omitido por pedido explícito del usuario.
- La edición de la ficha clínica completa (alergias, enfermedades, medicamentos) aún es solo lectura — el formulario completo de ficha clínica es Fase 2B.

**Pendientes derivados:**
- Editor completo de ficha clínica (alertas, enfermedades, medicamentos editable).
- Auto-registrar mensajes WhatsApp al confirmar cita.
- Auto-registrar email cuando se envía presupuesto/plan.
- Pre-seleccionar paciente en `/agenda?pacienteId=X` (hoy el query string llega pero no se usa en agenda).

---

## 2026-05-13 — Panel super-admin: crear clínicas + detalle enriquecido

**Solicitud:** Tras feedback de uso del panel: quitar KPIs operativos del dashboard global (no le interesan citas/usuarios/pacientes globales), agregar opción para crear clínicas desde el panel, y en el detalle de cada clínica mostrar: detalle de plan + cobros mensuales, resumen de pacientes con/sin agenda, y almacenamiento usado.

**Archivos modificados:**
- `lib/plans.ts` — creado. `PLAN_PRICES` (TRIAL 0, BASICO 19900, PRO 39900 CLP), `PLAN_LABELS`, `PLAN_DESCRIPCIONES`.
- `app/digital-dent-super-admin/page.tsx` — simplificado: 4 KPIs (activas/trial/suspendidas/total) + tarjeta destacada de MRR estimado.
- `app/api/admin/clinicas/route.ts` — creado. POST protegido por `requireSuperAdmin` para crear clínica desde panel con plan y días de trial configurables.
- `app/digital-dent-super-admin/clinicas/nueva/page.tsx` — creado. Formulario completo: datos clínica + admin inicial + selector visual de plan + días trial.
- `app/digital-dent-super-admin/clinicas/clinicas-list-client.tsx` — botón "Nueva clínica" en el header del listado.
- `app/digital-dent-super-admin/clinicas/[id]/page.tsx` — añadidas queries: `pacientesConAgenda`, `pacientesSinAgenda`, `cobrosUltimos90Dias`, storage placeholder con cuota según plan.
- `app/digital-dent-super-admin/clinicas/[id]/clinica-detail-client.tsx` — 4 secciones nuevas:
  - **Suscripción**: plan, cobro mensual, trial vence / próximo cobro.
  - **Pacientes**: total, con citas, sin citas, + nota de usuarios y citas totales.
  - **Cobros a pacientes**: histórico, últimos 90 días, # cobros.
  - **Almacenamiento**: barra de progreso con cuota por plan (TRIAL 1GB, BASICO 10GB, PRO 50GB), placeholder a 0 B.

**Resumen de cambios:**
El panel super-admin ahora es un control plane real:
- Dashboard global con foco en negocio (clínicas + MRR).
- Crear clínica desde adentro sin pasar por `/registro` público.
- Detalle de cada clínica muestra: cuánto paga (estimado), cómo usan la plataforma (pacientes con/sin agenda), cuánto cobran a sus pacientes, y cuánto storage consumen.

Las cuotas de storage están hardcodeadas en código (no en DB); cuando exista módulo de archivos en Fase 2, calcular `bytesUsados` real sumando los archivos por clínica.

**Riesgos / consideraciones:**
- `PLAN_PRICES` es hardcoded. Sería mejor en DB cuando llegue la pasarela (Fase 4) para que el super-admin pueda editar precios.
- Storage es siempre 0 hasta Fase 2.
- Las cuotas (1/10/50 GB) son arbitrarias — ajustar cuando definamos packaging real.
- `pacientesSinAgenda` se calcula como `total - conAgenda`, lo cual es correcto pero asume que ambas queries son consistentes (no hay concurrencia entre ellas).

**Pendientes derivados:**
- Editar `PLAN_PRICES` desde el panel (modelo `Plan` en DB).
- Tracking de cobros mensuales reales (cuando exista pasarela).
- Storage real cuando exista módulo de archivos.
- Modo "impersonar" para soporte.

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
