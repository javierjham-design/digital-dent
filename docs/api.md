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

### `PATCH /api/v1/citas/:id/estado`
Body: `{ "estado": "CONFIRMADA" | "EN_ESPERA" | "EN_ATENCION" | "ATENDIDA" | "NO_ASISTIO" | "CANCELADA" | "PENDIENTE" }`
→ `CitaDTO`. Registra el cambio en el historial de la cita.

---

## Pendiente de portar (etapa 2)

Estos dominios del monolito aún no están expуestos en el backend nuevo:
tratamientos, presupuestos, cobros, caja, liquidaciones, usuarios/equipo,
horarios, configuración, super-admin (clínicas, planes, extras, leads),
reportes, e integraciones (Google Calendar, WhatsApp/Twilio, demo).

Convención al portarlos: `routes → controller (valida) → service (lógica) → prisma`,
con DTOs en `/shared`, y `requireClinica` / `requireSuperAdmin` según corresponda.
