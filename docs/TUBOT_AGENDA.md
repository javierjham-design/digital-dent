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
  `GET /appointments/:id`, `PATCH /appointments/:id` (reagenda → vuelve a `pending`),
  `POST /appointments/:id/{cancel|confirm|attendance}` (attended:false → `no_show`),
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
  Payload `{event, occurredAt, data}` con `data` = `SchedAppointment` | `SchedPatient`
  (`clinicId` = slug, del request-context). Gestión en el Super Admin (card "Agenda TuBot" →
  sección "Webhooks Cláriva → TuBot": connectionId + secreto + activar).

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
