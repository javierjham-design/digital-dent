# AI Changelog

> Historial cronológico de cambios realizados con asistencia de Claude.
> **Las entradas más recientes van arriba.** Añade entradas nuevas insertándolas debajo del encabezado.

---

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
