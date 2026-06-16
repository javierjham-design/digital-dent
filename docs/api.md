# API del Backend de Cláriva

Base URL: `/api/v1` (dev: `http://localhost:4000/api/v1`).
Autenticación: `Authorization: Bearer <jwt>` (salvo login y health).
Errores: siempre `{ "error": "mensaje" }` con el status HTTP correspondiente.

## Salud

### `GET /health`
Sin auth. → `{ "ok": true, "service": "clariva-backend", "ts": <epoch> }`

## Autenticación

### `POST /api/v1/auth/login`
Login dual.
- Clínica: `{ "slug": "mi-clinica", "username": "Administrador", "password": "…" }`
- Super-admin / legacy: `{ "email": "…", "password": "…" }`

Respuesta `200`:
```json
{ "token": "<jwt>", "user": { "id": "...", "name": "...", "role": "admin", "clinicaId": "...", "isPlatformAdmin": false, "requirePasswordChange": false, "permisos": { } } }
```
Errores: `400` datos inválidos · `401` credenciales incorrectas · `429` demasiados intentos.

### `GET /api/v1/auth/me`
Requiere token. → `{ "user": SessionUserDTO }`

## Pacientes  *(requiere sesión de clínica)*

### `GET /api/v1/pacientes?q=<texto>`
Lista pacientes activos de la clínica. `q` (opcional, ≥2 chars) filtra por nombre o RUT (ignora tildes). → `PacienteDTO[]`

### `GET /api/v1/pacientes/:id`
→ `PacienteDTO` · `404` si no pertenece a la clínica.

### `POST /api/v1/pacientes`
Body: `{ "nombre", "apellido", "rut?", "telefono?", "email?", "prevision?" }`
→ `201 PacienteDTO`. Valida RUT único por clínica y asigna correlativo `numero`.

## Citas / Agenda  *(requiere sesión de clínica)*

### `GET /api/v1/citas?from=<ISO>&to=<ISO>`
Lista citas (rango opcional). → `CitaDTO[]`

### `POST /api/v1/citas`
Body: `{ "pacienteId", "doctorId", "fecha" (ISO), "duracion?"=30, "tipo?", "notas?", "sobrecupo?" }`
→ `201 CitaDTO`.
Reglas de negocio: valida que paciente y doctor sean de la clínica; rechaza
(`409`) si choca con un bloqueo de agenda o, salvo sobrecupo, si se solapa con
otra cita activa del profesional.

### `PATCH /api/v1/citas/:id`  *(editar / reagendar)*
Body (todos opcionales): `{ "fecha", "duracion", "doctorId", "tipo", "notas", "sobrecupo" }`
→ `CitaDTO`. Revalida solape/bloqueo si cambia horario/duración/doctor; loguea "Reagendada de X a Y".

### `DELETE /api/v1/citas/:id`
→ `{ ok: true }`. Borra la cita y sus logs.

### `PATCH /api/v1/citas/:id/estado`
Body: `{ "estado": "CONFIRMADA" | "EN_ESPERA" | "EN_ATENCION" | "ATENDIDA" | "NO_ASISTIO" | "CANCELADA" | "PENDIENTE" }`
→ `CitaDTO`. Registra el cambio en el historial.

## Equipo / Usuarios  *(scope clínica)*

### `GET /api/v1/usuarios` → `UsuarioDTO[]`
### `GET /api/v1/doctores` → `DoctorDTO[]` (rol doctor/médico, activos — para selectores de agenda)
### `POST /api/v1/usuarios`  *(admin)*
Body: `{ "name", "username", "password", "role?", "email?", "rut?", "especialidad?", "telefono?" }` → `201 UsuarioDTO`
### `PATCH /api/v1/usuarios/:id`  *(self o admin)*
Campos según rol: el usuario edita los propios (name/rut/especialidad/telefono); admin edita todo + permisos + `googleCalendarId`. `password` opcional (≥8). → `UsuarioDTO`

## Horarios  *(scope clínica)*

### `GET /api/v1/horarios?doctorId=` → `HorarioDTO[]`
### `POST /api/v1/horarios`
Body: `{ "doctorId", "days": DiaHorario[] }` (upsert por día). Solo doctores/médicos. → `HorarioDTO[]`

## Bloqueos de agenda  *(scope clínica; doctor solo los propios, admin todos)*

### `GET /api/v1/bloqueos?from=&to=&doctorId=` → `BloqueoDTO[]`
### `POST /api/v1/bloqueos` → `201 BloqueoDTO`
### `PATCH /api/v1/bloqueos/:id` → `BloqueoDTO`
### `DELETE /api/v1/bloqueos/:id` → `{ ok: true }`

## Prestaciones  *(scope clínica)*

### `GET /api/v1/prestaciones` → `PrestacionDTO[]`
### `POST /api/v1/prestaciones` → `201 PrestacionDTO`
### `PATCH /api/v1/prestaciones/:id` → `PrestacionDTO`
### `DELETE /api/v1/prestaciones/:id` → `{ ok: true }`

## Configuración de la clínica  *(scope clínica)*

### `GET /api/v1/clinica` → `ClinicaConfigDTO`
### `PATCH /api/v1/clinica`  *(admin)* → `ClinicaConfigDTO`

---

## Pendiente de portar (próximas tandas)

- **Clínico/financiero**: tratamientos, presupuestos, cobros, caja, liquidaciones, ficha clínica + odontograma, evoluciones, reportes.
- **Super-admin**: clínicas, planes, extras, pagos de suscripción, leads/demos.
- **Integraciones**: Google Calendar (push/sync), WhatsApp/Twilio, generación de demos.

Los efectos hacia Google (push de citas/bloqueos, reset+sync de calendario al
asignar `googleCalendarId`) están **diferidos** al portar el dominio de
integraciones; por ahora el backend persiste los datos sin disparar Google.

Convención al portar: `routes → controller (valida zod) → service (lógica) → prisma`,
con DTOs en `/shared` y `requireClinica` / `requireAdmin` / `requireSuperAdmin` según corresponda.
