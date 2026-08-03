# PROMPT — Sistema de backups de Cláriva (database-per-tenant)

> Pega el bloque de abajo **completo** en una sesión de Claude Code abierta en la raíz
> del repo `dental-platform`, rama `arch/split-frontend-backend`.
> Antes de pegarlo, lee la sección "Contexto para vos" al final de este archivo:
> explica por qué el prompt está escrito así y qué decisiones ya vienen tomadas.

---

## ⬇️ COPIAR DESDE ACÁ ⬇️

Implementá el sistema de backups y restauración de Cláriva. Es la brecha operativa
más grave que tiene la plataforma hoy: hay clínicas reales en producción con fichas
clínicas y datos financieros, y **no existe ninguna forma de recuperar los datos de
UNA clínica** sin hacer retroceder a todas las demás.

Antes de escribir código leé, en este orden: `docs/SESSION_HANDOFF.md`,
`backend/src/db/tenant.ts`, `backend/src/db/control.ts`, `backend/src/lib/provision.ts`,
`backend/src/config/env.ts`, `backend/prisma/control/schema.prisma`,
`backend/src/services/demo.service.ts` y `backend/src/services/clinicas-registry.service.ts`.

### Por qué esto no es opcional

1. Los backups de Railway son **snapshots de volumen**: restauran el servicio Postgres
   entero. Como cada clínica tiene su **base física propia**
   (`clariva_t_<slug>`, ver `dbNameForSlug`), recuperar los datos de una clínica implicaría
   hacer retroceder en el tiempo también a la otra. Con dos clientes distintos en
   producción eso no es una opción.
2. La retención de los backups diarios de volumen de Railway es de **6 días**. El escenario
   real no es "se cayó el servidor" —eso se nota al instante—, es "la clínica descubre a
   fin de mes que falta un plan de tratamiento que alguien borró hace tres semanas". A esa
   altura el snapshot ya no existe.
3. Los caminos de pérdida son de **aplicación**, no de infraestructura: un borrado desde la
   ficha, una importación masiva mal armada (`/api/v1/pacientes/import` acepta archivo y
   escribe), un bug nuevo que corrompe datos de una clínica. Ningún snapshot de volumen
   ayuda con eso sin castigar a la otra clínica.
4. Los backups de Railway viven **en la misma cuenta** que los datos. No protegen contra el
   compromiso de esa cuenta. La copia fuera de Railway es la única defensa real.
5. Son datos de salud de pacientes chilenos: la retención y la trazabilidad no son un lujo,
   son parte de la responsabilidad frente a la clínica. Y el día que una clínica se vaya o
   pida sus datos, hoy no hay forma de entregárselos sin escribir el script en el momento.

### Arquitectura que quiero (tres capas, no una)

**Capa 1 — Railway (configuración, no código).**
Dejá documentado en `docs/BACKUPS.md` que hay que activar en el servicio Postgres:
backups de volumen diarios **y** Point-in-Time Recovery (pgBackRest, ~4 semanas de
ventana). Es la red contra la caída total del servidor. No sirve para recuperar una
sola clínica — por eso existe la capa 2.

**Capa 2 — Dump lógico por base, cifrado y fuera de Railway (esto es lo que programás).**
Un job diario que:

- Lee el registro de clínicas del control-plane
  (`control.clinica.findMany({ select: { id, slug, dbName, activo, esDemo } })`) —
  la lista de bases **nunca se hardcodea**, se descubre. Incluí también la base de
  control (`clariva_control`) en cada corrida: sin ella no se sabe qué clínica es cuál.
- Excluye por defecto las clínicas con `esDemo = true` (son efímeras y se recrean),
  salvo que se pase `--incluir-demos`.
- Por cada base corre `pg_dump -Fc --no-owner --no-privileges` y **stremea** la salida:
  `pg_dump → cifrado AES-256-GCM → subida multipart a object storage`. Nunca cargues el
  dump entero en memoria ni lo escribas completo a disco: el contenedor de Railway tiene
  disco y RAM acotados y las bases van a crecer.
- Cifrado con `node:crypto` (`createCipheriv('aes-256-gcm')`), clave de 32 bytes en base64
  desde `BACKUP_ENCRYPTION_KEY`. Formato del archivo: `IV (12 bytes) || ciphertext || authTag (16 bytes)`.
  Sin dependencias externas de cripto.
- Destino: storage **S3-compatible** vía `@aws-sdk/client-s3` + `@aws-sdk/lib-storage`
  (multipart streaming). Configurable por env para que funcione igual con Cloudflare R2,
  Backblaze B2 o S3. Recomendación por defecto: **Cloudflare R2** (sin costo de egreso,
  ~USD 0,015/GB-mes; con el volumen actual el gasto es de centavos).
  Ruta del objeto: `clariva/<YYYY>/<MM>/<DD>/<dbName>__<ISO8601>.dump.enc`.
- Escribe un **manifiesto** JSON por corrida
  (`clariva/<YYYY>/<MM>/<DD>/manifest__<ISO8601>.json`) con, por cada base:
  `dbName`, `slug`, `bytes`, `sha256` del archivo cifrado, duración, y un **censo de
  filas** de las tablas que importan (`Paciente`, `Cita`, `Cobro`, `Tratamiento`,
  `PlanTratamiento`, `Liquidacion`). Ese censo es lo que después permite verificar que
  una restauración quedó completa.

**Capa 3 — Restauración quirúrgica por clínica (el verdadero entregable).**
Acá está la ventaja que da la arquitectura database-per-tenant, aprovechala:

`npm run restore -- --slug <clinica> --at <ISO8601|latest>` debe, **sin tocar a
ninguna otra clínica y sin destruir nada**:

1. Descargar y descifrar el dump correspondiente, verificando el `sha256` del manifiesto.
2. `CREATE DATABASE clariva_t_<slug>_r<YYYYMMDDHHmm>` y `pg_restore` ahí dentro.
3. Comparar el censo de filas restaurado contra el manifiesto y **abortar si no calza**.
4. Imprimir un diff legible: qué se recuperaría vs. qué hay hoy en producción
   (pacientes, citas, cobros, montos totales).
5. **Por defecto termina acá (dry-run).** Solo con `--switch` hace el corte:
   renombra la base viva a `clariva_t_<slug>_pre_restore_<ts>`, actualiza
   `control.Clinica.dbName` al de la base restaurada, y llama a `disposeTenant()`
   (`backend/src/db/tenant.ts`) para invalidar el `PrismaClient` cacheado.
   La base vieja **se conserva** — el rollback es cambiar `dbName` de vuelta.
6. Un flag aparte `--drop-pre-restore` (nunca automático) para limpiar después.

Seguí el patrón de `migrate:data`, que ya usa dry-run por defecto y `--apply` para
escribir: mantené esa disciplina.

### Cambios obligatorios en el código existente

Ojo con esto, porque es fácil "arreglar" lo que ya está bien:

- **`migrate-tenants.ts` NO se toca.** Corre `prisma db push` sin `--accept-data-loss`
  a propósito, y el comentario explica por qué: si un cambio implicara pérdida de datos,
  falla esa base en vez de destruir en silencio. Es la decisión correcta. Lo único que
  puede agregarse es que **aborte si el último backup exitoso tiene más de 24 h**, como
  red adicional antes de aplicar DDL sobre bases productivas.

- **Aserción defensiva en `dropTenantDatabase()`** (`backend/src/lib/provision.ts:48`).
  Hoy ningún camino la llama sobre una clínica productiva —los tres call sites son
  rollback de creación fallida (`clinicas-registry.service.ts:99`, `demo.service.ts:87`)
  y limpieza de demos expiradas (`demo.service.ts:102`)—, así que no hay nada que reparar
  ahí. Pero la función no tiene ninguna barrera propia: depende enteramente de que quien
  la llame tenga razón. Agregale una verificación que **se niegue a borrar** una base cuya
  clínica en el control-plane no esté marcada `esDemo`, o que tenga filas en `Paciente`,
  salvo que se le pase un flag explícito `{ confirmarBorradoProductivo: true }` **y** haya
  un dump lógico reciente con prefijo `pre-drop/`. Veinte líneas que cierran la puerta a
  que un script futuro o un comando manual apurado hagan algo irreversible.

### Ejecución y monitoreo

- Nueva tabla `BackupRun` en el **schema de control** (`prisma/control/schema.prisma`):
  `id, iniciadoAt, terminadoAt, estado (OK|PARCIAL|ERROR), basesTotal, basesOk,
  bytesTotal, manifiestoKey, error?`. Es una migración aditiva, segura.
- Ejecutalo como **servicio cron propio en Railway** (`npm run backup`), no dentro del
  proceso de la API: un dump largo no debe competir con las requests de las clínicas.
  Podés reusar el patrón que ya existe en `cron/`. Horario sugerido: 07:00 UTC
  (03:00–04:00 en Chile, clínicas cerradas).
- Además exponé `POST /api/v1/admin/backups/run` protegido con `x-cron-secret`
  (mismo patrón que `/google/sync`) para poder disparar un backup a mano **antes de
  una operación riesgosa**. Compará el secreto con `crypto.timingSafeEqual`, no con `===`.
- **Alertas por email** (reusá `backend/src/lib/email.ts`) al super-admin cuando:
  una corrida termina en ERROR o PARCIAL, o cuando pasaron más de 36 h sin una corrida
  OK (dead-man's switch — el modo de falla real de los backups no es que fallen, es que
  dejen de correr y nadie se entere).
- **Ensayo de restauración automático, semanal.** Un job que restaura la base de control
  y la clínica más chica a bases efímeras, valida el censo de filas, y las borra. Si falla,
  alerta. Un backup que nunca se restauró no es un backup.
- **Retención GFS** con poda explícita en el script (no confíes solo en el lifecycle del
  bucket): 14 diarios, 8 semanales, 12 mensuales. Configurable por env.

### Detalles de infraestructura que te van a morder

- `pg_dump` **no está** en la imagen. El `backend/Dockerfile` es `node:20`. Hay que
  instalar `postgresql-client-<major>` y el major **debe coincidir o ser mayor** que el
  del servidor (`SHOW server_version`), o `pg_dump` falla con "server version mismatch".
  Averiguá la versión real del Postgres de Railway antes de fijarla, y dejala anotada en
  `docs/BACKUPS.md`.
- Conectate por la red interna de Railway (`postgres.railway.internal:5432`), no por el
  proxy público: es más rápido y no consume ancho de banda facturado.
- Las credenciales de `TENANT_DB_SERVER_URL` ya tienen permiso de `CREATE DATABASE`
  (lo usa la provisión), así que el restore no necesita permisos nuevos.
- Las claves del bucket deben ser de **escritura y lectura pero no de borrado** para el
  job diario, y la poda debe correr con credenciales separadas o vía lifecycle del bucket.
  Si un atacante llega al backend, no debe poder borrar los backups.

### Documentación (parte del entregable, no un extra)

Escribí `docs/BACKUPS.md` con: el diagrama de las tres capas, las variables de entorno
nuevas, el runbook de **"una clínica perdió datos, qué hago"** paso a paso con los comandos
exactos, el runbook de **"se cayó el Postgres entero"**, la política de retención, y el
registro de los ensayos de restauración (fecha, quién, resultado). Que lo pueda ejecutar
alguien a las 3 AM sin leer código.

Actualizá también `docs/AI_CHANGELOG.md` (entrada nueva arriba), `docs/SECURITY.md`
(el pendiente #3 pasa a resuelto) y `docs/SESSION_HANDOFF.md`.

### Cómo quiero que trabajes

Trabajá en la rama actual `arch/split-frontend-backend`. Antes de commitear:
`npm --prefix backend run typecheck` y `npm --prefix backend test` en verde, más tests
nuevos para el pipeline de cifrado/descifrado (round-trip de un buffer grande), para la
poda de retención (que no borre lo que no debe) y para el parseo del manifiesto.
No agregues dependencias más allá del SDK de S3. Commits chicos y descriptivos.

**Empezá proponiéndome el plan y la lista de archivos que vas a tocar antes de escribir
nada.** Si algo de lo que pedí choca con cómo está armado el código hoy, decímelo en vez
de forzarlo.

## ⬆️ COPIAR HASTA ACÁ ⬆️

---

## Contexto para vos (no es parte del prompt)

**Por qué el prompt insiste tanto en la capa 2.** Los backups de Railway restauran el
volumen completo, montando un volumen nuevo con el snapshot; no permiten recuperar una
base individual. Con tu arquitectura eso significa: si mañana la Clínica Montenegro borra
por error 300 fichas, la única herramienta que tenés hoy te obliga a hacer retroceder
también a Digital-Dent. Y si el error se descubre después de 6 días —que es lo habitual
con datos clínicos, se nota al mes— el snapshot ya venció. El dump lógico por base es lo
que convierte un desastre de plataforma en un incidente de una clínica.

**Por qué el restore crea una base nueva en vez de sobrescribir.** Porque database-per-tenant
te lo regala: restaurar es `CREATE DATABASE` + `pg_restore` + cambiar un string en
`control.Clinica.dbName`. Cero downtime para las otras clínicas, y el rollback es cambiar
el string de vuelta. Es la mejor propiedad que tiene tu arquitectura y hoy no la estás usando.

**Costo real.** Con 2 clínicas productivas los dumps comprimidos rondan decenas de MB.
En Cloudflare R2, con retención GFS completa, el gasto mensual es del orden de USD 0,05.
El servicio cron de Railway corre pocos minutos al día. No hay razón económica para postergarlo.

**Lo que el prompt deliberadamente NO pide.** No pide panel de backups en el super-admin
(útil, pero es fase 2 y agrega superficie), ni replicación en caliente a otro proveedor
(sobredimensionado para dos clínicas), ni backup de los archivos adjuntos — porque hoy
los consentimientos y PDFs viajan por correo y no hay object storage de archivos; si eso
cambia, hay que extender el alcance.
