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
- ⏳ **Fase 3 — Citas (escritura, TuBot agenda solo)** + pacientes por teléfono.
- ⏳ **Fase 4 — CRM** (buscar/ficha/notas de pacientes).
- ⏳ **Fase 5 — Webhooks salientes** Cláriva→TuBot (firmados) + alta por clínica
  (`tubotConnectionId`/`tubotWebhookSecret`/`tubotEnabled` en Configuracion + `TUBOT_URL`).
  Única fase con migración de tenant → ventana con backup.

## Alta de una clínica

1. Super Admin → clínica → **Agenda TuBot → Generar token** (`tbk_…`, copiar una vez).
2. En TuBot: cargar `baseUrl=https://api.clariva.cl` + ese token → TuBot crea la conexión y
   devuelve un `connectionId`.
3. (Fase 5) Cargar en el Super Admin el `connectionId` + el `webhookSecret` (lo genera Cláriva)
   para los webhooks salientes.
