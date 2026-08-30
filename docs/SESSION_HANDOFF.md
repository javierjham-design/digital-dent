# Session Handoff

> **Leé este archivo PRIMERO al iniciar una sesión.** Resume dónde quedó el trabajo,
> sin depender del historial de chat anterior.

---

## Última actualización

- **Fecha:** 2026-08-29
- **✅ Integración TuBot → Cláriva (agenda) — Fases 1–5 EN PRODUCCIÓN.** La integración
  INVERSA de WhatsApp: acá **TuBot consume la API REST de Cláriva** para agendar de forma
  autónoma y Cláriva le hace feedback por webhooks firmados. Contrato/mapeo/estado por fase:
  **`docs/TUBOT_AGENDA.md`** (fuente: repo conversia `docs/CLARIVA.md` + `apps/mock-clariva`).
  - **Auth**: token dedicado por clínica (`tbk_…`, hash en `Clinica.tubotApiKeyHash`, control-plane,
    separado del CRM/MCP). Se genera en Super Admin → clínica → card "Agenda TuBot". Middleware
    `requireTubotApiKey`. Endpoints EXACTOS bajo `/api/v1` (el cliente llama `{baseUrl}/api/v1{path}`).
  - **F1 catálogo**: `GET /clinics /professionals /professionals/:id/services /services`.
  - **F2 disponibilidad**: `GET /availability` → `SchedSlot[]` (slots del HorarioDoctor − ocupación,
    paso = duración del servicio o 30'; reusa `slotsLibres` de `agenda-online.service`).
  - **F3 citas (escritura)**: `POST /appointments` (201; upsert paciente por RUT/teléfono; reusa
    `crearCita` → valida atención+solape; **409 slot_taken**; `Idempotency-Key` best-effort en
    memoria), `GET/PATCH /appointments/:id`, `POST /:id/{cancel|confirm|attendance}`,
    `PUT /patients`, `GET /patients/:phone/appointments`.
  - **F4 CRM** (no estaba en CLARIVA.md, sí en los req de TuBot; shapes definidos por Cláriva):
    `GET /patients?query&page`, `GET /patients/:id` (+appointments), `GET/POST /patients/:id/notes`.
  - **F5 webhooks salientes** Cláriva→TuBot (firmados `X-Clariva-Signature: sha256=HMAC`):
    `lib/tubot-webhooks.ts`, emisión best-effort desde `crearCita/editarCita/cambiarEstadoCita/
    actualizarPaciente`. Destino `${env.tubotBaseUrl}/webhooks/clariva/{connectionId}` (reusa el
    env de TuBot, SIN var nueva). Config por clínica en `Configuracion`: `agendaWhEnabled/
    agendaWhConnectionId/agendaWhSecret` (cifrado) — **schema tenant aditivo aplicado a prod**
    (backup fresco 2026-08-30 → prestart `migrate:tenants` **3/3 OK**). UI en la card Agenda TuBot.
  - Verificado: typecheck be/fe, contrato (275 rutas), unit 134/134, integración **131/131**
    (`test/integration/tubot-agenda.test.ts`, 26 casos), build fe. Deploys F1–F5 verificados
    (404→401 + health 200). `clinicId` en payloads = slug (request-context, sembrado también en el
    middleware de TuBot).
  - **Gestión del token/webhooks por DOS vías equivalentes** (mismo token/config): **self-serve**
    de la clínica (Configuración → pestaña "Agenda TuBot", `/api/v1/integraciones/tubot-agenda*`,
    scope `configTenant`, opera sobre `req.clinica.id`) **y** Super Admin
    (`/api/v1/admin/clinicas/:id/tubot*`). El token es POR CLÍNICA (no global).
  - **⚠️ PENDIENTE del usuario para activar en una clínica**: generar el token `tbk_` (self-serve o
    Super Admin) y cargarlo en TuBot (baseUrl `https://api.clariva.cl`); TuBot devuelve un
    `connectionId` + `secret` → cargarlos en la sección de webhooks y activar. `TUBOT_BASE_URL` ya
    está en prod (lo usa WhatsApp); si el receptor de webhooks vive en otro host, habría que
    parametrizarlo. Reservas del agendamiento ONLINE (reservarPublico) NO emiten webhook (usa
    `db.cita.create` directo, no `crearCita`) — futura mejora si se necesita.

- **Fecha:** 2026-08-12
- **✅ WhatsApp: Twilio → TuBot (recordatorios por plantilla) — DESPLEGADO (2026-08-12).**
  Cambio EN FRÍO (WhatsApp apagado en las 3 clínicas, sin datos que migrar). Alcance estricto:
  recordatorio/confirmación por plantilla con botones; la integración inversa (TuBot agendando)
  es OTRO proyecto. Contrato `docs/TUBOT_WHATSAPP.md` + `mock-tubot/`. Schema aditivo aplicado a
  prod (backup OK → `control:push` + `migrate:tenants --strict` **4/4**): `Configuracion` suma
  wa* de TuBot (cifrados), `Cita` suma delivery status + reenvíos, tabla `WaEventoEntrante`
  (idempotencia), `Clinica.waConnectionId` (ruteo, sin @unique). **Columnas Twilio inertes**
  (regla 1). Frontera `lib/tubot.ts`; webhook `/whatsapp/webhook/:connectionId` (HMAC-SHA256 sobre
  raw, 401 uniforme, idempotente por providerMsgId); envío idempotente (`Idempotency-Key` con nº de
  intento; reenvío manual `n≥2`); `status failed` → "No se pudo entregar" en la agenda; degrade si
  la plantilla no está APPROVED. `express.urlencoded` **se conservó** (lo usa Flow, no era solo de
  Twilio). Deploy verificado (`/health` 200, ruta nueva 401). Verificado: unit 134/134, integración
  98/98 (circuito TuBot 6/6). **Las 3 clínicas siguen con WhatsApp apagado.**
  - **⚠️ Pendientes al habilitar la 1ª clínica** (hoy no-ops): crear el servicio Railway
    `cron-recordatorios` (`*/20`, config exacta en `docs/deploy-extras.md`) y setear
    `TUBOT_BASE_URL` con la URL real de TuBot. **La API SALIENTE de TuBot para este sentido aún NO
    existe** (contrato + mock listos para cuando la implementen).
  - **⚠️ Deuda anotada**: `WaEventoEntrante` crece 1 fila por evento entrante y **hay que purgarla
    periódicamente (90 días sobra; la ventana de dedupe es de horas)**. Con WhatsApp apagado no
    acumula nada. Falta también el botón de reenvío manual en la UI (endpoint ya existe).

- **Fecha previa:** 2026-08-11
- **✅ Módulo ESTÉTICA usable + optimizaciones de UX del plan (2026-08-11, todo DESPLEGADO).**
  Sesión larga probando estética en el demo `demo-l49j1s`. Lo que salió a prod hoy:
  - **Mapa facial con FOTO real licenciada** (comprada por Javier, `frontend/src/assets/
    rostro-base.jpg`) + 31 zonas calibradas a mano con un editor visual propio (`tmp-rostro/
    editor.html`, local). Reemplazó el placeholder. Trazo blanco tenue.
  - **Super Admin**: interruptores de ÁREA por clínica (Dental/Estética/Médico) en la tarjeta
    de módulos + **fix de pérdida de dato** en `cambiarModulos` (guardaba y borraba `area_*`;
    ahora los preserva, con test). **Extras facturables** predefinidos: Módulo Estética /
    Médico se cargan desde el catálogo de extras (suman al MRR); precio sugerido 14.900 CLP /
    18 USD, ajustable — **Javier no confirmó precio final**.
  - **Plan = UN área** (reemplaza la decisión previa "un plan mezcla áreas"): `PlanTratamiento.
    area` (columna aditiva, default DENTAL, migrada a las 4 bases, backfill DENTAL). Se elige
    al crear (si el profe tiene 2+ áreas), no cambia; el backend rechaza (400) acciones de
    otra área; el detalle muestra badge + solo su diagrama/catálogo; badge en la lista.
  - **Panel lateral de prestaciones** estilo "definir procedimiento" (drawer): abre al
    seleccionar pieza/zona o "+ Prestación", NO bloquea el diagrama, cierra al quedar sin
    selección; buscador + categorías + toggle una-por-cada/una-para-todas (piezas Y arcadas).
    **Mobile**: es un bottom-sheet (55vh) que sube el diagrama debajo del header al abrir y se
    **cierra deslizando la barra hacia abajo** (o botón "Cerrar").
  - Áreas del usuario = intersección clínica-contratada ∩ flags del user; el admin ve todas
    las de la clínica. Verificado en `auth.service.ts:85-88`.
- **✅ Zonas faciales CONGELADAS por el especialista (2026-08-11) — estética lista para clínica
  real.** Lista definitiva: **29 códigos** (labios en una sola zona `LABIOS`; masetero, bichectomía,
  alas nasales, cuello y escote FUERA; nombres visibles = anatómico + coloquial entre paréntesis).
  Se quitó el aviso "provisional" del toggle de Estética en el Super Admin. **Ojo con el seed
  lazy:** una demo/base YA sembrada conserva su lista vieja — para ver las 29 hay que usar una
  **demo/clínica nueva** (las reales aún no sembraron; siembran al habilitar estética). Migrar la
  foto a un recorte más ajustado (sin cuello) quedó como mejora opcional (requiere recalibrar zonas).
- **✅ Guarda `SELECT current_database()` en scripts de prod — HECHA (2026-08-12).**
  `backend/src/lib/db-guard.ts` (`assertBaseActual`/`assertControlActual`) cableada en los
  scripts re-ejecutables que escriben (aplicar-caja-unique, backfill-conversiones,
  reconciliar-vinculos, dedupe-prestaciones, areas-fase6). Aborta si la conexión no está en
  la base esperada o si es una base prohibida (`railway`, etc.). `migrate-tenants` NO se tocó.

- **Fecha previa:** 2026-08-10
- **✅ ÁREAS CLÍNICAS EN PRODUCCIÓN (2026-08-10, ventana completa con Javier presente).**
  DENTAL/ESTETICA/MEDICO en dos niveles (módulos `area_*` por clínica ∩ booleanos por usuario),
  catálogos por área, mapa facial con 2 capas. Secuencia ejecutada: backup OK 4/4 (35,1 MB) →
  `areas-fase6 --apply` verificado (columna+índice en las 3; secciones sembradas montenegro 33
  / orodent 7; backfill categoriaId 776/759/8 con 0 sin vincular; `area_dental` en el control
  de las 3) → `migrate:tenants --strict` **3/3** → deploy `5f138aa` SUCCESS + smoke 9/9 +
  `Clinica.vertical` creada → **verificación visual de Javier CONFIRMADA** (774 prestaciones /
  29 secciones, odontograma normal, sin pestañas con una sola área) → **e2e en demo
  `demo-l49j1s`: 24/24** (multi-zona con un precio, goma no toca acciones/zonas, presupuesto
  y liquidación cuadrando por área). Fix sobre la marcha `eaacaa3`: el plan ahora expone
  `zonas[]` de las acciones estéticas (antes la UI mostraba `—`). Detalle en AI_CHANGELOG.
  **⚠️ Pendientes:** zonas **PROVISIONALES** (28-vs-32, 6 preguntas) → **NO habilitar
  `area_estetica` a una clínica REAL hasta congelar la lista**; ilustración SVG después de
  congelar (`docs/SVG_ROSTRO_CONTRATO.md`); **guarda de identidad de base** en scripts de
  prod (`SELECT current_database()` vs esperado, abortar si difiere — pedido de Javier tras
  un casi-accidente de quoting que mandó una lectura a la base `railway` del monolito).
  Decisión vigente: **plan = capacidad comercial, área = naturaleza del negocio; no se
  mezclan**. Rollback en `docs/AREAS_ROLLBACK.md`.
- **Liquidaciones: fecha de corte + finalización masiva + finalizadas por mes — DESPLEGADO
  2026-08-10** (smoke verde). Finalizar (individual o "Finalizar todas…") pide **fecha de
  corte**: cierra solo lo evolucionado Y pagado hasta el fin de ese día (Chile); lo impago,
  parcial o posterior queda para el próximo ciclo; `periodo` = corte. Finalizadas agrupadas
  por mes; gestión (estado + factura/comprobante) en el detalle. Endpoint nuevo
  `POST /liquidaciones-activas/finalizar-todas`. Ver `docs/AI_CHANGELOG.md`.

- **Fecha previa:** 2026-08-08
- **Vínculo automático lead→paciente (Parte A DESPLEGADA 2026-08-08; Parte B dry-run pendiente de aplicar).**
  El vínculo se perdía cuando recepción crea la ficha desde cero (61/144 agendados sin pacienteId).
  **A)** Al crear un paciente, si hay EXACTAMENTE un lead sin vincular que coincide por teléfono
  (`telCanonico`) o RUT → se vincula solo (`autolinkLeadAlCrearPaciente`); si hay varios (familia),
  la **ficha muestra un aviso** para elegir (endpoints `/pacientes/:id/leads-sugeridos` y
  `/vincular-lead`). **B)** Script `reconciliar-vinculos.ts` (dry-run) separa INEQUÍVOCOS de
  DUDOSOS. **⚠️ vincularLeadPaciente marca CONVERTIDO SIN emitir a Meta** (conversión vieja; mismo
  clamp de 7 días). Verificado e2e en demo + integración 75/75. **Parte B APLICADA a prod
  (2026-08-09, backup fresco antes):** digital-dent 447→**375** leads sin vincular (72 vínculos),
  **2 marcados CONVERTIDO sin emitir** (verificado: sin `customer` en metaCrmEtapas), **8 dudosos**
  quedan para el aviso de la ficha. **Atribución de pacientes que pagaron: 8 → 11 (de 51).** Ver
  AI_CHANGELOG. (Los 40/51 restantes no vinieron del embudo — walk-in/derivación.)
- **Conversión automática del CRM (Paso 2 DESPLEGADO 2026-08-08; backfill Paso 3 pendiente de aplicar).**
  El primer cobro PAGADO de un paciente marca su lead `CONVERTIDO` (antes se hacía a mano y nadie lo
  hacía). Hook en `crearCobro` y en el webhook de Flow → `marcarConvertidoPorCobro` (crm.service), que
  va por el MISMO camino que el cambio manual (`actualizarLead`): estado + nota + `dispararEtapaCrmMeta('customer')`.
  **No se tocó el pipeline CAPI/Meta.** Emite `customer` solo en clínicas con CRM↔Meta habilitado
  (hoy solo digital-dent) y leads de Meta Form; estado se awaitea (consistencia), Meta en background
  (log+Sentry si rechaza); best-effort (nunca rompe el cobro). Anulación NO revierte. Verificado
  e2e en una demo real (lead→CONVERTIDO, sin emitir por falta de config). **Backfill histórico:**
  `src/scripts/backfill-conversiones.ts` (dry-run por defecto, **NO emite a Meta** a propósito).
  Dry-run en prod = **6 leads en digital-dent** (todos AGENDADO→CONVERTIDO, 1 de Meta Form). ⚠️
  **Falta correr `--apply`** (esperando OK del usuario). Ver `docs/AI_CHANGELOG.md`. **Hallazgo:** el
  vínculo lead→paciente es débil (61/144 agendados de digital-dent sin pacienteId) — recepción crea
  la ficha desde cero en vez de convertir; el embudo seguirá sub-reportando hasta arreglar ese flujo.
- **Editar username + contratos robustos por profesional — DESPLEGADO 2026-08-07** (frontend-only).
  (1) El editor de usuario (Equipo → Datos) ahora deja **editar/agregar el `username`** (el backend
  ya lo validaba). (2) Los **montos fijos por prestación** se movieron del modal "Contratos" de
  Liquidaciones a **Equipo → (profesional) → Editar → pestaña Contrato** (único lugar: contrato base
  + montos fijos, por profesional); se quitó el modal de Liquidaciones. **Ojo permiso:** configurar
  contratos pasó a `puedeGestionarEquipo` (antes `puedeGestionarLiquidaciones`); José/orodent ya no
  configura contratos, pero **orodent está inactiva** y cuando se reactive se le crea un admin. Ver
  `docs/AI_CHANGELOG.md`. Deploy FE+BE SUCCESS, `/health` 200, sin migración.
- **Ordenamiento de la navegación del panel — DESPLEGADO 2026-08-06.**
  Commits A–E: (A) **permiso `puedeVerReportes`** — los 7 `/reportes/*` estaban SIN permiso
  (cualquier usuario de la clínica bajaba la nómina de pacientes/cobros/morosos); ahora cadena
  `reportesTenant`, default false, admin true; test 403 verde. (B) CRM al header. (C) menú
  agrupado por secciones + rename "Administración"→**"Gestión"**. (D) `Configuracion.tsx` en
  pestañas (`?tab=`). (E) liquidaciones unificadas (una entrada, ruta según permiso;
  `/mis-liquidaciones` redirige). Verificación: typecheck be/fe/web, unit 118, integración 68,
  contrato, lint. **Deploy OK:** prestart `migrate:tenants` 3/3 (columna aditiva), `/health` 200,
  `/reportes/pacientes` sin token → 401. **Pre-habilitados** `puedeVerReportes`: orodent→José Araya,
  digital-dent→Katherine Beltran + Javier Aedo. El resto de no-admin (5 en digital-dent, 3 en
  orodent) queda en false → reciben 403 hasta que se les habilite por Equipo. Ver `docs/AI_CHANGELOG.md`.
- **Montos fijos por prestación en liquidaciones (DESPLEGADO 2026-08-06).** Nuevo item: un
  profesional puede cobrar un monto fijo por una prestación específica (config en la sección de
  contratos). Al liquidar, se paga **min(fijo, lo cobrado) − retención**; si lo cobrado < fijo, se
  otorga el máximo disponible − retención. Es una **capa de override** sobre el contrato base
  (modelo `MontoFijoPrestacion` atado al profesional; `LiquidacionItem.origenCalculo` en el
  snapshot). Endpoints `/montos-fijos`. Migración **aditiva** (tabla + columna nullable) → aplicada
  por `migrate:tenants` normal (prestart **3/3 OK**, `/health` 200, ruta viva). Ver
  `docs/AI_CHANGELOG.md`. **Pendiente del usuario:** probar el cálculo en la UI (idealmente en una
  demo). Rama `feat/montos-fijos-prestacion` mergeada a `arch` + `master`.
- **Defensa en profundidad de cajas + provisión (DESPLEGADO 2026-08-06).** Dos tareas, commits
  separados en `arch`:
  - **`@unique` en `Caja.numero` y `SesionCaja.numero`**: red del correlativo (ya era race-safe por
    advisory lock, pero un duplicado por otro camino pasaba en silencio). Se **conserva `@default(0)`**
    (inerte; ver comentario en el schema): quitarlo obligaría a `db push --accept-data-loss` (regla 1).
    El `@unique` sobre columna poblada **no pasa por migrate-tenants** (Prisma lo marca data-loss), así
    que se aplicó con **`CREATE UNIQUE INDEX` directo** (todo-o-nada, pre-chequeo + rollback,
    `src/scripts/aplicar-caja-unique.ts`) a las 3 bases, con backup fresco antes. init.sql regenerado.
  - **Self-check en `provisionTenant()`**: tras el DDL verifica que la base tenga todas las columnas
    del schema (DMMF vs `information_schema`); si falta algo o el DDL falló, **borra la base y aborta**
    (Sentry con `db=<dbName>`). Demo/alta muestran **503 limpio**, no un 500 crudo. Cubre el "DDL a
    medias" (la demo con 491 de 588 columnas).
  - **Validado end-to-end**: prestart `migrate:tenants` **3/3 OK**, `/health` 200, **demo real creada
    desde la landing** → su base nació con **ambos índices** + self-check 0 faltantes + navegable (5
    pacientes por la API); demo **borrada** por el flujo real de `/demo/cleanup` (registro + base
    físicos eliminados). Scripts útiles quedaron: `src/scripts/caja-numeros.ts` (reporte/backfill),
    `aplicar-caja-unique.ts` (migración del índice).

- **Fecha previa:** 2026-08-05
- **Rama:** `arch/split-frontend-backend` (**mergeado y desplegado** a prod). **`master`
  quedó al día**: fast-forward `arch` → `master` (era ancestro limpio, 341 commits detrás),
  pusheado. Ojo: eso **activa los workflows de GitHub Actions** que dormían en master.
- **Foco del día:** **2FA TOTP obligatorio para super-admin** (schema de CONTROL). Login en
  dos pasos: la contraseña emite un **desafío** (JWT `stage:2fa`, TTL 10m) en vez de sesión;
  la sesión sale de `/auth/2fa/verify`. Alta = QR una sola vez + 10 códigos de respaldo de un
  solo uso (bcrypt). Secreto TOTP **cifrado AES-256-GCM**. Rate limit propio (5/15m por sub e
  IP, solo fallos). **El login de las clínicas NO se tocó.** Deploy verificado: `/auth/2fa/setup`
  responde 400 (existe) y `/health` OK → el `control:push` del prestart aplicó las columnas.
  Ver `docs/SECURITY.md` §7 (incl. **recuperación** si se pierden authenticator + todos los códigos).

  ⚠️ **Acción para el super-admin en el primer login tras este deploy:** la primera vez cae en
  el flujo de **alta** → hay que escanear el QR con Google Authenticator/Authy y **guardar los
  10 códigos de respaldo** (se muestran una sola vez). Sin eso, recuperar el acceso implica tocar
  la base de control a mano (SECURITY.md §incidentes).

- **Crons consolidados en Railway (2026-08-05).** El merge a master activó
  `.github/workflows/clariva-cron.yml`, que duplicaba el `sync` y disparaba el `cleanup`.
  Se **retiró el workflow** (ya no hay ninguno en `.github/workflows/`). Antes de borrarlo se
  verificó Railway: `sync` estaba (`cron-google-sync`) pero **`cleanup` no tenía servicio** →
  se creó **`cron-demo-cleanup`** (JOB=cleanup, `0 6 * * *`, rootDir=cron, branch arch,
  `CRON_SECRET=${{BACKEND.CRON_SECRET}}`). Build SUCCESS y **disparo verificado** (corrida de
  prueba forzada + secreto resuelto = al del BACKEND). **Los 5 crons viven en Railway**
  (`cron-google-sync`, `cron-demo-cleanup`, `backup`, `backup-drill`, `backup-prune`); ver
  `docs/deploy-extras.md` §C. **No revivir el workflow.** Estado de demos: 0 expiradas, 0 bases
  huérfanas (censo corrido). Script de un solo uso `backend/limpieza-duplicados-google.mjs`
  borrado (ya se había corrido).

  _Historial previo (2026-08-04) más abajo: resiliencia (backups 3 capas + Sentry + UptimeRobot),
  Google Calendar reparado, correlativos seguros, LRU de clientes, init.sql resync, ESLint 9._

## Backups — CÓDIGO DESPLEGADO + PRIMER BACKUP REAL OK (2026-08-04)

Detalle en `docs/BACKUPS.md` y `docs/AI_CHANGELOG.md`. Código mergeado a `arch` y en prod.
**Cloudflare R2 configurado** (bucket `clariva-backups`, bucket-lock 7 días, 2 tokens:
daily R&W + prune R&W) y variables `BACKUP_*` cargadas en el servicio `backend`.
**Primer backup manual (`POST /admin/backups/run`) = OK: 4/4 bases, 31,6 MB** (control +
digital-dent 31,4 MB + montenegro + una demo huérfana). pg_dump/pg_restore fijados a
**`postgresql-client-18`** (el server de Railway resultó ser Postgres **18.3**).

**Los 3 servicios cron en Railway — CREADOS Y VALIDADOS EN PROD (2026-08-04):**
- ✅ **`backup`** (diario `0 7 * * *`): `npm run backup`. Corrió `estado=OK` 4/4.
- ✅ **`backup-drill`** (lunes `0 8 * * 1`): `npm run backup:drill`. Restauró control +
   clínica más chica a bases efímeras, verificó el censo y las borró → **el restore está
   PROBADO** de punta a punta dentro de Railway.
- ✅ **`backup-prune`** (domingo `30 8 * * 0`): `npm run backup:prune -- --apply`. Conectó
   con las creds de poda y el **piso mínimo** (minKeep=3) evitó borrar (hay 2 backups/base).

Los tres usan el Dockerfile del backend (`postgresql-client-18`), sin healthcheck, y sus
env son **referencias al backend**: `${{BACKEND.…}}`. ⚠️ **El servicio backend se llama
`BACKEND` en MAYÚSCULAS** — las referencias de Railway son case-sensitive. El `backup-prune`
además tiene 2 secretos propios (`BACKUP_S3_PRUNE_ACCESS_KEY_ID/SECRET`, token de poda).

**Capa 1 (volumen Railway + PITR) — ✅ ACTIVADA (2026-08-04).** Snapshots de volumen
(Daily 6d / Weekly 1mo / Monthly 3mo) + Point-in-Time Recovery encendido. El activar PITR
regeneró credenciales y disparó un redeploy de Postgres (~30s de blip, con clínicas
cerradas); la cobertura quedó verde ~1h después (esperado). Detalle en `docs/BACKUPS.md`.

**Pendientes (menores, no urgentes):**
- ⚠️ **`clariva_t_demo_ul2uzu` NO es una demo huérfana — es la base productiva de
   `orodent`** (clínica real, `esDemo=false`). Se descubrió el 2026-08-04 al derivar los
   dbName reales. **NO marcarla `esDemo=true` ni borrarla**: destruiría una clínica. La
   nota vieja que la llamaba "demo huérfana para limpiar" era incorrecta y peligrosa.
- **`Paciente.numero` y `Caja.numero`**: mismo patrón de carrera que se arregló en cobros;
   aplicarles el helper `siguienteNumero` es directo (ver `docs/AI_CHANGELOG.md` 2026-08-04).

## Google Calendar — REPARADO y OPERATIVO (2026-08-04)

Detalle en `docs/AI_CHANGELOG.md`. Diagnóstico: solo `digital-dent` la usa (2 doctores,
~500 eventos). Se hizo:
- **Cron `sync` recreado** en Railway (`cron-google-sync`, `JOB=sync`, `*/15`,
  `CRON_SECRET=${{BACKEND.CRON_SECRET}}`). El sync corre cada 15 min.
- **Fallas visibles** en push y pull (log + Sentry), **dead-man's switch** por frescura
  (no solo por error) y **aviso a recepción en la agenda**. Endpoint `GET /google/health`.
- **`force full resync`** (`POST /google/sync {full:true}`) como recuperación cuando el
  token incremental queda "ciego" (Google devuelve 0 aunque haya eventos nuevos).
- **Reconcile idempotente**: un full resync ya NO duplica citas (chequea por
  `googleEventId`). Antes sí duplicaba — ver el punto siguiente.
- **App OAuth de Google: pasada a "En producción"** (en Testing los refresh tokens
  caducaban a los 7 días — era la causa de que se cayera sola cada semana). digital-dent
  reconectada → token de larga duración. **Verificación de marca/OAuth ENVIADA, en
  revisión manual** de Google (semanas). Páginas legales creadas y en prod:
  `clariva.cl/privacidad` y `/terminos`.

**Pendientes de Google (no urgentes, la app ya funciona):**
- ✅ **Citas duplicadas de digital-dent — RESUELTO (Javier confirmó 2026-08-12).** Ya no queda
  nada pendiente por este lado.
- **Decidir scope** `calendar` → `calendar.calendarlist.readonly` antes del video de
  verificación (si Google lo pide). Es 1 línea + deploy.
- Si Google rechaza la home por "no explica el propósito", **prerenderizar** la home
  completa (hoy tiene un bloque estático de respaldo en `web/index.html`).

## Observabilidad — HECHA, DESPLEGADA y ENCENDIDA (2026-08-03 → 2026-08-04)

`feat/observabilidad` fue **mergeada a `arch` y desplegada** (commit `ea3e536`), y el
**2026-08-04 se puso en marcha operativamente**: 3 proyectos Sentry creados (plan
Developer gratis) + DSN cargados en Railway + UptimeRobot activo + fire-drill de PII
pasado. Detalle completo en `docs/OBSERVABILIDAD.md` §0 y en `docs/AI_CHANGELOG.md`
(entrada 2026-08-04).

- **Sentry**: `Clariva Backend`/`Clariva Front End`/`Clariva WEB`. `SENTRY_DSN` en `BACKEND`,
  `VITE_SENTRY_DSN` en `FRONTEND` y `WEB Service` (build-time → van como `ARG` en el
  Dockerfile). `environment=production`.
- **UptimeRobot** (free): `Cláriva API` → `https://api.clariva.cl/health` (HEAD, 5 min, un
  503 alerta a `javier.jham@gmail.com`).
- **Scrubber PII** `redactPII` (RUT/email/monto) en backend+frontend+web + test 5/5.
- ⚠️ **Dos trampas ya resueltas, no repetir:** las `VITE_SENTRY_DSN` necesitan `ARG` en el
  Dockerfile para llegar al build (`cfd5067`); el CSP `connect-src` debe permitir
  `https://*.ingest.us.sentry.io` o el browser bloquea el ingest (`89f50d7`).
- **Del error a la clínica:** tag `clinica` (slug) → base `clariva_t_<slug>`; tag
  `request_id` → buscarlo en los logs de Railway del `BACKEND` para la secuencia completa
  (también viaja en el header `X-Request-Id` y en el cuerpo del 500).
- **Opcional pendiente:** borrar los 3 issues `FIREDRILL` de prueba en Sentry.

---

## Estado: EN PRODUCCIÓN

El stack nuevo está vivo en Railway (proyecto `amused-recreation`), desplegando desde
`arch/split-frontend-backend`, con **dos clínicas reales usándolo a diario**.

- **Backend** → `api.clariva.cl` · **Frontend** (app clínicas) → `*.clariva.cl`
  (subdominio por clínica) · **Web/landing** → `clariva.cl` + `www`. DNS en Cloudflare
  (registros en gris/DNS-only; el wildcard obligatorio gris).
- **Postgres:** un servidor, con `clariva_control` (control-plane) + una base física por
  clínica (`clariva_t_<slug>`). Aislamiento **físico** entre clínicas.
- **Crons:** ver "A verificar" más abajo.

## Qué pasó desde el cutover (2026-06-20 → 2026-07-31)

Seis semanas de trabajo de producto que no estaban registradas en este archivo. El detalle
está en `docs/AI_CHANGELOG.md` (entradas más recientes arriba); en grueso:

CRM con Meta Lead Ads (webhook nativo, identidad por teléfono normalizado, eventos de
ciclo al CAPI, merge de duplicados) · agendamiento online público y reserva de leads ·
consentimientos y documentos clínicos · planes de tratamiento (finalizar/reabrir,
auto-consulta, pestaña Finalizados, evolución con trazabilidad) · pacientes dar de
baja/reactivar y aviso proactivo de RUT duplicado · recaudación (cobro de varios planes en
un pago, abono libre como pie, segundo medio de pago) · gestión de cajas y boxes ·
suscripciones y pagos con Flow · permisos granulares por usuario (el último:
`puedeGestionarAgenda`).

## Limpieza hecha hoy (2026-08-03)

Rama `chore/limpieza-monolito`, tres commits:

1. **`.gitattributes` + renormalización a LF.** Los 41 archivos que aparecían modificados
   eran ruido CRLF/LF, no cambios reales (verificado con `git diff --ignore-cr-at-eol`,
   que daba vacío). El `git status` ahora queda limpio y los cambios verdaderos se ven.
2. **Eliminado el monolito Next.js** (219 archivos, ~42.000 líneas): `app/`, `components/`,
   `lib/`, `prisma/`, `public/`, `proxy.ts`, `next.config.ts`, `postcss.config.mjs`,
   `next-env.d.ts`, `eslint.config.mjs`, `tsconfig.json`, `package.json`,
   `package-lock.json`, `AGENTS.md`. Estaba muerto desde el cutover pero seguía versionado.
   Preservado en el tag **`monolito-final`** (`67b0332`) y en un `.tar.gz` fuera del repo.
   Para recuperar cualquier archivo: `git show monolito-final:<ruta>`.
3. **`CLAUDE.md` reescrito** para el stack real (antes describía el monolito: base
   compartida con `clinicaId`, NextAuth, `prisma/` en la raíz — nada de eso existe hoy).

Verificado antes de borrar: ningún servicio construye desde la raíz (no hay `railway.json`
ahí), el alias `@/` de frontend apunta a su propio `src`, ningún tsconfig del stack nuevo
extiende el de la raíz, el monolito no importaba `shared/`, `scripts/*.mjs` solo usa
builtins de node, y las prestaciones de una clínica nueva salen de
`backend/src/lib/verticales.ts` (no del `seed-aranceles.ts` que se borró).

> **Dato a no perder:** el arancel chileno de 764 prestaciones vivía en
> `prisma/seed-aranceles.ts` y hoy no lo usa nadie. Si alguna vez se quiere sembrar
> clínicas nuevas con el arancel real:
> `git show monolito-final:prisma/seed-aranceles.ts > backend/src/data/aranceles-cl.ts`

### Cierre de la limpieza (2026-08-03) — HECHO ✅

- **Verificación completa en local (todo verde):** `backend typecheck` ✓ · `backend test`
  73/73 ✓ · `backend test:integration` 48/50 (los 2 fallos —consentimientos y conversión
  de lead— son **pre-existentes**; la limpieza no tocó ni un archivo de
  `backend/frontend/web/shared`, verificado con `git diff --stat 67b0332..limpieza -- backend frontend web shared` = vacío) · `frontend typecheck` ✓ · `web typecheck` ✓.
- **Merge:** fast-forward de `chore/limpieza-monolito` → `arch/split-frontend-backend`
  (`67b0332..3788f0c`, 225 archivos, −42.253 líneas) y **pusheado** → redeploy de los 3
  servicios.
- **Verificado en producción tras el deploy:** `api.clariva.cl/health` → 200 ·
  `POST /auth/login` (creds inválidas) → 401 con JSON estructurado (auth vivo) ·
  `app.clariva.cl` → 200 · `clariva.cl` → 200.
- **Artefactos locales borrados:** `_to_delete/` (monolito movido + node_modules viejo +
  locks) y `monolito-final.tar.gz` de la raíz (el código sigue en el tag `monolito-final`
  = `67b0332`). Ambos estaban gitignoreados y sin trackear.

## A verificar (fuera del repo, no lo pude comprobar desde la sesión)

1. **Crons en Railway.** El workflow `.github/workflows/clariva-cron.yml` está solo en
   `arch/split-frontend-backend`, y GitHub dispara `schedule` únicamente desde la rama por
   defecto (`master`, congelada en `528cc54` del 2026-06-15). Por ese camino no corre nada.
   El otro camino son los cron services de Railway (`docs/deploy-extras.md`): `cron/railway.json`
   trae `cronSchedule: "0 6 * * *"`, así que `cleanup` puede estar activo, pero `sync`
   (Google Calendar, cada 15 min) y `recordatorios` necesitan **cada uno su propio servicio**.
   Si `sync` no existe, la agenda no se sincroniza con Google desde el cutover.
2. **Google OAuth:** ¿sigue en modo *Testing*? En ese modo Google caduca los refresh tokens
   a los 7 días y la integración se rompe sola cada semana. Sacarlo tarda 1–6 semanas.
3. **Backups de Postgres en Railway:** qué está activo y con qué retención.

## Prioridades (detalle en `docs/AUDITORIA_2026-08.md`)

1. Verificar los crons de Railway (30 min).
2. **Backups lógicos por clínica + restore probado** — prompt listo para pegar en
   `docs/PROMPT_BACKUPS.md`. Los backups de Railway restauran el volumen entero (a las dos
   clínicas juntas) y retienen 6 días.
3. Sentry + `/health` con `SELECT 1` + UptimeRobot.
4. Aserción defensiva en `dropTenantDatabase`.
5. Correlativo de cobros dentro de la transacción (`cobros.service.ts:185`).
6. LRU en el caché de clientes por tenant (`db/tenant.ts`) — techo a ~30 clínicas.

## Notas

- `docs/PROJECT_STATUS.md` y `docs/PROJECT_CONTEXT.md` son del monolito y están obsoletos;
  no los uses como fuente de verdad. Sirven: este archivo, `docs/AI_CHANGELOG.md`,
  `docs/architecture.md` (con su tabla de etapas ya cerrada) y `docs/AUDITORIA_2026-08.md`.
- Pendiente de fondo: mergear `arch → master` y retirar lo que quede del monolito en
  Railway. Eso activa además los crons de GitHub Actions.
