# Integración de Agenda con TuBot (TuBot → Cláriva)

> **Integración inversa** de `docs/TUBOT_WHATSAPP.md`: acá **TuBot consume la API de
> Cláriva** para leer la agenda, **agendar de forma autónoma**, y Cláriva le hace feedback
> al CRM por webhooks. Contrato y mock de referencia: en el repo de TuBot (Conversia)
> `docs/CLARIVA.md` + `apps/mock-clariva` (implementa el contrato; puerto 4010).

## Contrato

- **Base**: el cliente de TuBot llama `{baseUrl}/api/v1{path}` → en prod `baseUrl =
  https://api.clariva.cl`. Los endpoints van montados EXACTOS bajo `/api/v1`.
- **Auth**: `Authorization: Bearer <token>`. **Token dedicado por clínica** (`tbk_…`,
  hash sha256 en `Clinica.tubotApiKeyHash`, separado de la API key del CRM/MCP). Se genera
  en el Super Admin → detalle de la clínica → "Agenda TuBot" (se muestra sólo al generarlo).
- **Errores**: JSON `{error, message}`; `401` sin/mal token; `409 slot_taken` en doble reserva.
- **Idempotencia**: aceptar `Idempotency-Key` en los POST (Fase 3).

## Mapeo Cláriva → contrato

| Contrato | Cláriva | Nota |
|---|---|---|
| `clinicId` | **slug de la clínica** | 1 tenant = 1 clínica (no hay "sedes"); boxes ≠ clinics |
| `GET /clinics` | Configuracion | `{id:slug, name, address, timezone(por país)}` |
| `GET /professionals` | `User` doctor/medico activos | `especialidad`→specialty, `clinicIds:[slug]` |
| `GET /services` | `Prestacion` activas | `duracion`→durationMin, `precio`→price, `currency:'CLP'` |
| `GET /professionals/:id/services` | prestaciones por **área** del doctor | flags `areaDental/Estetica/Medico` ∩ `Prestacion.area` |
| `GET /availability` | slots de `HorarioDoctor` + ocupación | usa la duración del servicio (Fase 2) |
| `POST /appointments` | upsert paciente por teléfono → `crearCita` (origen TUBOT) | `findSolapada`→409 (Fase 3) |
| `GET/PATCH /appointments/:id`, `cancel/confirm/attendance` | `editarCita`/`cambiarEstadoCita` | mapeo de estados (Fase 3) |
| `PUT /patients`, `GET /patients/:phone/appointments` | `crearPaciente`/`actualizarPaciente`, `listarCitas` | (Fase 3) |
| CRM: `/patients?query`, `/patients/:id`, `/patients/:id/notes` | `listarPacientesPaginado`, ficha, `ComentarioAdministrativo` | (Fase 4) |
| **Webhooks** `POST {TUBOT}/webhooks/clariva/{connectionId}` firmados `X-Clariva-Signature: sha256=HMAC(secret, raw)` | emitidos desde crear/editar/estado de cita + paciente | `appointment.*` + `patient.updated` (Fase 5) |

**Mapeo de estados** (Cláriva → contrato): PENDIENTE→`pending`, CONFIRMADA→`pending`,
CONFIRMADO/EN_ESPERA/EN_ATENCION→`confirmed`, ATENDIDA→`completed`, NO_ASISTIO→`no_show`,
CANCELADA→`cancelled`. Reagendar (PATCH) deja la cita en PENDIENTE.

## Estado por fase

- **✅ Fase 1 — Catálogo (lectura)**: `GET /clinics /professionals /professionals/:id/services
  /services` + auth por token dedicado + gestión del token en el Super Admin.
- **✅ Fase 2 — Disponibilidad**: `GET /availability?clinicId&professionalId&serviceId&from&to`
  → `SchedSlot[]` (`{start,end,professionalId,clinicId,serviceId?}`, `start/end` ISO 8601 UTC).
  Slots del `HorarioDoctor` (con receso partido) en pasos de la duración del servicio (o 30'),
  menos la ocupación (citas que ocupan + bloqueos). Sin `professionalId` → todos los
  profesionales. Rango en fechas civiles (hora clínica), acotado a hoy…hoy+62d; descarta
  slots pasados. Lógica reusada de `agenda-online.service` (`slotsLibres`).
- **✅ Fase 3 — Citas (escritura, TuBot agenda solo)** + pacientes por teléfono:
  `POST /appointments` (201 · `Idempotency-Key` best-effort en memoria · doble reserva → `409 slot_taken`),
  `GET /appointments?from&to&clinicId?&professionalId?&serviceId?` (lista por rango de `start`,
  TODOS los estados, enriquecida con `professionalName`/`clinicName`; `serviceId` no se persiste
  en la cita → se ignora como filtro; `clinicId` = slug, un solo tenant),
  `GET /appointments/:id`, `PATCH /appointments/:id` (reagenda → vuelve a `pending`),
  `POST /appointments/:id/{cancel|confirm|attendance}` (attended:false → `no_show`;
  `cancel` acepta en el body `{ reason: "patient_reschedule" | "patient_cancel" }` → se persiste en
  `Cita.motivoCancelacion`. `patient_reschedule` alimenta la lista interna "Pacientes pendientes de
  reagendar" del panel (ver abajo); cualquier otro valor se ignora),
  `PUT /patients` (upsert por documento/teléfono; no pisa datos de la ficha),
  `GET /patients/:phone/appointments`. Reusa `crearCita`/`editarCita`/`cambiarEstadoCita`
  (validan horario de atención + solapamiento). El paciente se resuelve por RUT o por los
  últimos 8 dígitos del teléfono, o se crea (`crearPaciente` → correlativo + autolink CRM).
  Duración de la cita = `end−start`, o la del servicio, o 30'. `userName` de los logs = "TuBot".
- **✅ Fase 4 — CRM** (buscar/ficha/notas de pacientes). **No** estaba en el `CLARIVA.md`
  canónico pero sí en los requerimientos de TuBot; shapes definidos por Cláriva:
  - `GET /patients?query=&page=&pageSize=` → `{items: CrmPatient[], total, page, pageSize}`
    (`CrmPatient {id, firstName, lastName?, phone?, email?, documentId?}`).
  - `GET /patients/:id` → `CrmPatient & {appointments: SchedAppointment[]}` (404 si no existe).
  - `GET /patients/:id/notes` → `CrmNote[]` (`{id, text, author?, createdAt}`).
  - `POST /patients/:id/notes` `{text}` → 201 `CrmNote` (autor "TuBot"; se guarda como
    ComentarioAdministrativo en el historial del paciente).
- **✅ Fase 5 — Webhooks salientes** Cláriva→TuBot (firmados). Config por clínica en la
  Configuracion del tenant: `agendaWhEnabled` / `agendaWhConnectionId` / `agendaWhSecret`
  (cifrado). Se emiten best-effort (nunca hacen fallar la operación) desde los puntos de
  mutación (`crearCita`→created, `editarCita`→rescheduled|updated, `cambiarEstadoCita`→
  confirmed|cancelled|attendance|updated, `actualizarPaciente`→patient.updated). Firma
  `X-Clariva-Signature: sha256=HMAC(secret, body)`; destino
  `${env.tubotBaseUrl}/webhooks/clariva/{connectionId}` (reusa el env de TuBot, sin var nueva).
  Payload `{event, occurredAt, data}`. `data` de citas = MISMA forma que `GET /appointments`
  (con `professionalName`/`clinicName`); en `appointment.attendance` agrega `attended: bool`
  (true=ATENDIDA, false=NO_ASISTIO); `patient.updated` = `{firstName, lastName?, phone, email?, documentId?}`.
  `clinicId` = slug (request-context). Mapper compartido `citaToAppointment` en `lib/tubot-webhooks.ts`.
  Gestión self-serve (Configuración → Agenda TuBot) o Super Admin.

## Pacientes pendientes de reagendar

Lista de trabajo del panel (Pacientes → pestaña "Pendientes de reagendar") para no perder al
paciente que quedó sin hora futura. Es **derivada de la agenda** (no hay tabla de "la lista"): un
paciente está pendiente cuando su **última cita** (por `updatedAt`) es:
- una **cancelación para reagendar** (`Cita.motivoCancelacion = 'patient_reschedule'`, que manda
  TuBot en el `cancel`), o
- una **inasistencia** (`NO_ASISTIO`, que marca el cron de no-show o recepción),

y **no** tiene ninguna cita futura activa. Así el histórico aparece solo (retroactivo) y la lista
se vacía sola cuando el paciente toma una hora nueva (la crea Cláriva). Ventana: último año; sólo
pacientes activos; excluye cancelaciones administrativas (sin motivo). Cada fila trae `origen`
(`patient_reschedule` | `no_show`) y `desde` (cuándo quedó pendiente); los que llevan más de 30
días se marcan en alerta.

Recepción puede **clasificar** a un paciente para sacarlo de la lista (pasa al listado general):
`AGENDADO` = se le dio hora o ya no corresponde · `NO_REAGENDA` = el paciente no quiere/va a
reagendar · `PERDIDO` = no se logró recuperar. Eso se guarda en la tabla `ReagendaResolucion`
(aditiva, sin FK a la agenda): oculta al paciente si la resolución es **posterior** al evento que
lo puso pendiente; si vuelve a no-asistir/cancelar después, **reaparece solo**. "Reabrir" borra la
última resolución.

**Permiso "Gestión de pacientes"** (`User.puedeGestionarPacientes`, el admin lo tiene siempre):
habilita en el panel las pestañas *Sin próxima cita* y *Pendientes de reagendar* y el **aviso ⚠**
del menú (cuántos hay pendientes; rojo si alguno lleva +1 mes). El **listado de pacientes NO se
gatea**: lo ve todo el equipo. En el backend protege `GET /pacientes/sin-proxima-cita` y las 4 rutas
`/citas/pendientes-reagendar*` (middleware `requirePermiso('puedeGestionarPacientes')`).

Endpoints (scope `pacientesGestionTenant` = auth + tenant + permiso):
`GET /citas/pendientes-reagendar?q=&page=&pageSize=&soloAlerta=` →
`{items, total, conAlerta, page, pageSize}`; `POST /citas/pendientes-reagendar/resolver`
`{pacienteId, estado, nota?}` (`estado` ∈ AGENDADO|NO_REAGENDA|PERDIDO);
`POST /citas/pendientes-reagendar/reabrir` `{pacienteId}`;
`GET /citas/pendientes-reagendar/resueltos?q=&page=&pageSize=`.

## Alta de una clínica

El token es **por clínica** (1 tenant = 1 token, hash en control `Clinica.tubotApiKeyHash`, scopeado a
su base). Se gestiona por **DOS vías equivalentes** (escriben el mismo token/config):

- **Self-serve (recomendado)**: la clínica, en **Configuración → Agenda TuBot** (permiso
  "Configurar la clínica"). Endpoints `/api/v1/integraciones/tubot-agenda*` (scope `configTenant`,
  operan sobre la clínica del JWT).
- **Super Admin**: detalle de la clínica → card "Agenda TuBot". Endpoints
  `/api/v1/admin/clinicas/:id/tubot*` (scope `sa`, con auditoría).

Pasos:
1. Generar el token (`tbk_…`, se muestra una vez → copiar).
2. En TuBot: cargar `baseUrl=https://api.clariva.cl` + ese token → TuBot crea la conexión y
   devuelve un `connectionId` + un `secret`.
3. Cargar el `connectionId` + el `secret` en la sección de webhooks ("Avisos a TuBot" / "Webhooks
   Cláriva → TuBot") y activar. Desde ahí, cada cambio de cita/paciente en el panel se le avisa a
   TuBot firmado.
