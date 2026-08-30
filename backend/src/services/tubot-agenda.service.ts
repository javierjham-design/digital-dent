import type { TenantClient } from '@/db/tenant'
import { conTitulo } from '@shared/utils/nombre'
import { slotsLibres } from '@/services/agenda-online.service'
import { crearCita, editarCita, cambiarEstadoCita } from '@/services/citas.service'
import { crearPaciente, listarPacientesPaginado, obtenerPaciente, listarComentarios, crearComentario } from '@/services/pacientes.service'
import { todayYmd, addDaysYmd } from '@/lib/tz'
import { badRequest } from '@/lib/errors'
import { encryptNullable } from '@/lib/crypto'
import { citaToAppointment, CITA_FULL_SEL, type CitaFullRow } from '@/lib/tubot-webhooks'
import { validarRut, formatRut } from '@shared/utils/rut'

// Adaptadores del modelo de Cláriva al CONTRATO de TuBot (docs/TUBOT_AGENDA.md).
// Cada token = una clínica (un tenant); Cláriva no tiene "múltiples sedes", así que
// `clinicId` == el slug de la clínica. Lectura de catálogo (Fase 1) + disponibilidad (Fase 2).

export interface SchedClinic { id: string; name: string; address?: string; timezone: string }
export interface SchedProfessional { id: string; name: string; specialty?: string; clinicIds?: string[] }
export interface SchedService { id: string; name: string; durationMin: number; price?: number; currency?: string }
export interface SchedSlot { start: string; end: string; professionalId: string; clinicId: string; serviceId?: string }
export type SchedStatus = 'pending' | 'confirmed' | 'cancelled' | 'rescheduled' | 'completed' | 'no_show'
export interface SchedPatient { externalId?: string; firstName: string; lastName?: string; phone: string; email?: string; documentId?: string }
export interface SchedAppointment {
  id: string; clinicId: string; professionalId: string; serviceId?: string
  patient: SchedPatient; start: string; end: string; status: SchedStatus; notes?: string
}
export interface CreateAppointmentInput {
  clinicId?: string; professionalId: string; serviceId?: string; patient: SchedPatient; start: string; end?: string; notes?: string
}

// Zona horaria IANA por país (Configuracion.pais). Chile por defecto.
const TZ: Record<string, string> = {
  CL: 'America/Santiago', CR: 'America/Costa_Rica', PA: 'America/Panama',
  PE: 'America/Lima', MX: 'America/Mexico_City', AR: 'America/Argentina/Buenos_Aires', CO: 'America/Bogota',
}
const tzDe = (pais?: string | null) => TZ[(pais ?? 'CL').toUpperCase()] ?? 'America/Santiago'

const ROLES_CON_AGENDA = ['doctor', 'medico']

// GET /clinics → la clínica (tenant) como única "sede".
export async function clinics(db: TenantClient, slug: string): Promise<SchedClinic[]> {
  const c = await db.configuracion.findUnique({
    where: { id: 'singleton' },
    select: { nombre: true, direccion: true, ciudad: true, pais: true },
  })
  const address = [c?.direccion, c?.ciudad].filter(Boolean).join(', ') || undefined
  return [{ id: slug, name: c?.nombre || slug, address, timezone: tzDe(c?.pais) }]
}

// GET /professionals → profesionales con agenda (doctores/médicos activos).
export async function professionals(db: TenantClient, slug: string): Promise<SchedProfessional[]> {
  const docs = await db.user.findMany({
    where: { role: { in: ROLES_CON_AGENDA }, activo: true },
    select: { id: true, name: true, titulo: true, especialidad: true },
    orderBy: { name: 'asc' },
  })
  return docs.map((d) => ({
    id: d.id,
    name: conTitulo(d.titulo, d.name) || d.name || '',
    specialty: d.especialidad || undefined,
    clinicIds: [slug],
  }))
}

// GET /services → prestaciones activas (una prestación = un "servicio" agendable).
export async function services(db: TenantClient): Promise<SchedService[]> {
  const ps = await db.prestacion.findMany({
    where: { activo: true },
    select: { id: true, nombre: true, duracion: true, precio: true },
    orderBy: { nombre: 'asc' },
  })
  return ps.map((p) => ({ id: p.id, name: p.nombre, durationMin: p.duracion, price: p.precio, currency: 'CLP' }))
}

// GET /professionals/:id/services → prestaciones de las ÁREAS habilitadas del
// profesional (no hay tabla doctor↔prestación; se mapea por área).
export async function professionalServices(db: TenantClient, professionalId: string): Promise<SchedService[]> {
  const doc = await db.user.findUnique({
    where: { id: professionalId },
    select: { role: true, activo: true, areaDental: true, areaEstetica: true, areaMedico: true },
  })
  if (!doc || !doc.activo || !ROLES_CON_AGENDA.includes(doc.role)) return []
  const areas: string[] = []
  if (doc.areaDental) areas.push('DENTAL')
  if (doc.areaEstetica) areas.push('ESTETICA')
  if (doc.areaMedico) areas.push('MEDICO')
  if (areas.length === 0) return []
  const ps = await db.prestacion.findMany({
    where: { activo: true, categoriaRef: { area: { in: areas } } },
    select: { id: true, nombre: true, duracion: true, precio: true },
    orderBy: { nombre: 'asc' },
  })
  return ps.map((p) => ({ id: p.id, name: p.nombre, durationMin: p.duracion, price: p.precio, currency: 'CLP' }))
}

const YMD = /^\d{4}-\d{2}-\d{2}$/
const MAX_DIAS = 62 // tope del rango consultable (evita barridos enormes)
const DURACION_DEFECTO = 30

// GET /availability → slots libres, según HorarioDoctor + ocupación, en pasos de la
// duración del servicio (o 30'). Sin `professionalId` devuelve los de todos los
// profesionales; el rango [from,to] son fechas civiles (hora de la clínica) y se
// acota a hoy…hoy+MAX_DIAS. `start`/`end` en ISO 8601 UTC.
export async function availability(
  db: TenantClient, slug: string, q: { professionalId?: string; serviceId?: string; from?: string; to?: string },
): Promise<SchedSlot[]> {
  const from = q.from && YMD.test(q.from) ? q.from : todayYmd()
  let to = q.to && YMD.test(q.to) ? q.to : from
  if (to < from) to = from
  const maxTo = addDaysYmd(from, MAX_DIAS)
  if (to > maxTo) to = maxTo

  let durationMin = DURACION_DEFECTO
  if (q.serviceId) {
    const p = await db.prestacion.findUnique({ where: { id: q.serviceId }, select: { duracion: true } })
    if (p?.duracion) durationMin = p.duracion
  }

  const docs = await db.user.findMany({
    where: { role: { in: ROLES_CON_AGENDA }, activo: true, ...(q.professionalId ? { id: q.professionalId } : {}) },
    select: { id: true },
  })

  const out: SchedSlot[] = []
  for (const d of docs) {
    const libres = await slotsLibres(db, d.id, durationMin, from, to)
    for (const s of libres) {
      out.push({ start: s.start.toISOString(), end: s.end.toISOString(), professionalId: d.id, clinicId: slug, ...(q.serviceId ? { serviceId: q.serviceId } : {}) })
    }
  }
  out.sort((a, b) => a.start.localeCompare(b.start))
  return out
}

// ── Fase 3: pacientes + citas (TuBot agenda de forma autónoma) ─────────────────

// Estado interno de Cláriva → estado del contrato de TuBot (ver docs/TUBOT_AGENDA.md).
const ESTADO_A_STATUS: Record<string, SchedStatus> = {
  PENDIENTE: 'pending', CONFIRMADA: 'pending',
  CONFIRMADO: 'confirmed', EN_ESPERA: 'confirmed', EN_ATENCION: 'confirmed',
  ATENDIDA: 'completed', NO_ASISTIO: 'no_show', CANCELADA: 'cancelled',
}

const soloDigitos = (t?: string | null) => (t ?? '').replace(/\D/g, '')

type PacienteRow = { id: string; nombre: string; apellido: string; telefono: string | null; email: string | null; rut: string | null }
type CitaConPaciente = { id: string; doctorId: string; fecha: Date; duracion: number; estado: string; notas: string | null; paciente: PacienteRow }
const CITA_SEL = {
  id: true, doctorId: true, fecha: true, duracion: true, estado: true, notas: true,
  paciente: { select: { id: true, nombre: true, apellido: true, telefono: true, email: true, rut: true } },
} as const

function toSchedPatient(p: PacienteRow): SchedPatient {
  return { firstName: p.nombre, lastName: p.apellido || undefined, phone: p.telefono || '', email: p.email || undefined, documentId: p.rut || undefined }
}

function toAppointment(c: CitaConPaciente, slug: string, serviceId?: string): SchedAppointment {
  return {
    id: c.id, clinicId: slug, professionalId: c.doctorId,
    ...(serviceId ? { serviceId } : {}),
    patient: toSchedPatient(c.paciente),
    start: c.fecha.toISOString(),
    end: new Date(c.fecha.getTime() + c.duracion * 60000).toISOString(),
    status: ESTADO_A_STATUS[c.estado] ?? 'pending',
    notes: c.notas || undefined,
  }
}

// El contrato manda un solo `firstName` (+ `lastName` opcional). Si no viene apellido,
// partimos el nombre completo; como último recurso un placeholder visible que la
// clínica pueda corregir (Paciente exige apellido no vacío).
function partirNombre(firstName?: string, lastName?: string): { nombre: string; apellido: string } {
  const fn = (firstName ?? '').trim()
  const ln = (lastName ?? '').trim()
  if (ln) return { nombre: fn || 'Paciente', apellido: ln }
  const parts = fn.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return { nombre: parts[0], apellido: parts.slice(1).join(' ') }
  return { nombre: fn || 'Paciente', apellido: '(sin apellido)' }
}

async function buscarPacientePorTelefono(db: TenantClient, phone?: string): Promise<PacienteRow | null> {
  const d = soloDigitos(phone)
  if (d.length < 8) return null
  const cola = d.slice(-8) // tolera diferencias de prefijo país (+56 9 vs 9…)
  const cands = await db.paciente.findMany({
    where: { telefono: { not: null } },
    select: { id: true, nombre: true, apellido: true, telefono: true, email: true, rut: true },
  })
  return cands.find((p) => soloDigitos(p.telefono).slice(-8) === cola) ?? null
}

// Busca (por documento o teléfono) o crea el paciente. Con `actualizar`, completa
// email/teléfono que falten (no pisa datos existentes de la ficha).
async function resolverPaciente(db: TenantClient, patient: SchedPatient, opts: { actualizar?: boolean } = {}): Promise<PacienteRow> {
  const rut = patient.documentId && validarRut(patient.documentId) ? formatRut(patient.documentId) : null
  let existing: PacienteRow | null = null
  if (rut) existing = await db.paciente.findFirst({ where: { rut }, select: { id: true, nombre: true, apellido: true, telefono: true, email: true, rut: true } })
  if (!existing) existing = await buscarPacientePorTelefono(db, patient.phone)
  if (existing) {
    if (opts.actualizar) {
      const data: Record<string, string> = {}
      if (patient.email?.trim() && !existing.email) data.email = patient.email.trim()
      if (patient.phone?.trim() && !existing.telefono) data.telefono = patient.phone.trim()
      if (Object.keys(data).length) {
        existing = await db.paciente.update({ where: { id: existing.id }, data, select: { id: true, nombre: true, apellido: true, telefono: true, email: true, rut: true } })
      }
    }
    return existing
  }
  const { nombre, apellido } = partirNombre(patient.firstName, patient.lastName)
  const dto = await crearPaciente(db, { nombre, apellido, telefono: patient.phone?.trim() || null, email: patient.email?.trim() || null, rut })
  return { id: dto.id, nombre: dto.nombre, apellido: dto.apellido, telefono: dto.telefono, email: dto.email, rut: dto.rut }
}

// PUT /patients → alta/actualización por teléfono/documento.
export async function upsertPatient(db: TenantClient, patient: SchedPatient): Promise<SchedPatient> {
  if (!patient?.firstName?.trim() || !patient?.phone?.trim()) throw badRequest('Faltan firstName y phone')
  return toSchedPatient(await resolverPaciente(db, patient, { actualizar: true }))
}

// POST /appointments → TuBot agenda. Duración = end−start (o la del servicio, o 30').
// Reusa crearCita: valida horario de atención y doble reserva (conflict → 409 slot_taken).
export async function createAppointment(db: TenantClient, slug: string, input: CreateAppointmentInput): Promise<SchedAppointment> {
  if (!input?.professionalId || !input?.start || !input?.patient) throw badRequest('Faltan professionalId, start y patient')
  const doctor = await db.user.findFirst({ where: { id: input.professionalId, activo: true, role: { in: ROLES_CON_AGENDA } }, select: { id: true } })
  if (!doctor) throw badRequest('professionalId inválido')
  const start = new Date(input.start)
  if (Number.isNaN(start.getTime())) throw badRequest('start inválido')

  let dur = 0
  if (input.end) { const e = new Date(input.end); if (!Number.isNaN(e.getTime())) dur = Math.round((e.getTime() - start.getTime()) / 60000) }
  if (dur <= 0 && input.serviceId) {
    const pr = await db.prestacion.findUnique({ where: { id: input.serviceId }, select: { duracion: true } })
    if (pr?.duracion) dur = pr.duracion
  }
  if (dur <= 0) dur = 30

  const pac = await resolverPaciente(db, input.patient, { actualizar: true })
  const notas = input.notes?.trim() || 'Agendada por TuBot'
  const cita = await crearCita(db, 'TuBot', {
    pacienteId: pac.id, doctorId: doctor.id, fecha: start.toISOString(), duracion: dur, tipo: 'CONSULTA', notas,
  })
  return {
    id: cita.id, clinicId: slug, professionalId: doctor.id,
    ...(input.serviceId ? { serviceId: input.serviceId } : {}),
    patient: toSchedPatient(pac),
    start: cita.inicio, end: cita.fin, status: ESTADO_A_STATUS[cita.estado] ?? 'pending', notes: cita.notas || undefined,
  }
}

// GET /appointments?from&to&professionalId&serviceId → citas cuyo `start` cae en
// [from,to] (para pintar la agenda en el panel de TuBot). Devuelve TODOS los estados,
// enriquecido con professionalName/clinicName. serviceId/clinicId: filtros opcionales
// (serviceId no se persiste en la cita → se ignora; clinicId = slug, un solo tenant).
export async function listAppointments(
  db: TenantClient, slug: string, q: { from?: string; to?: string; professionalId?: string; serviceId?: string },
): Promise<ReturnType<typeof citaToAppointment>[]> {
  const from = q.from ? new Date(q.from) : null
  const to = q.to ? new Date(q.to) : null
  if (!from || Number.isNaN(from.getTime()) || !to || Number.isNaN(to.getTime())) {
    throw badRequest('from y to (ISO 8601) son requeridos')
  }
  const [cfg, citas] = await Promise.all([
    db.configuracion.findUnique({ where: { id: 'singleton' }, select: { nombre: true } }),
    db.cita.findMany({
      where: { fecha: { gte: from, lte: to }, ...(q.professionalId ? { doctorId: q.professionalId } : {}) },
      select: CITA_FULL_SEL,
      orderBy: { fecha: 'asc' },
    }),
  ])
  const clinicName = cfg?.nombre ?? undefined
  return citas.map((c) => citaToAppointment(c as CitaFullRow, { slug, clinicName }))
}

// GET /appointments/:id
export async function getAppointment(db: TenantClient, slug: string, id: string): Promise<SchedAppointment | null> {
  const c = await db.cita.findUnique({ where: { id }, select: CITA_SEL })
  return c ? toAppointment(c, slug) : null
}

// PATCH /appointments/:id → reagenda/mueve (reusa editarCita: valida y maneja conflictos).
export async function updateAppointment(db: TenantClient, slug: string, id: string, changes: Partial<CreateAppointmentInput>): Promise<SchedAppointment | null> {
  const exists = await db.cita.findUnique({ where: { id }, select: { id: true } })
  if (!exists) return null
  const patch: { fecha?: string; duracion?: number; doctorId?: string; notas?: string | null } = {}
  if (changes.start) {
    patch.fecha = new Date(changes.start).toISOString()
    if (changes.end) patch.duracion = Math.round((new Date(changes.end).getTime() - new Date(changes.start).getTime()) / 60000)
  }
  if (changes.professionalId) patch.doctorId = changes.professionalId
  if (changes.notes !== undefined) patch.notas = changes.notes
  await editarCita(db, id, 'TuBot', patch)
  const c = await db.cita.findUnique({ where: { id }, select: CITA_SEL })
  return c ? toAppointment(c, slug, changes.serviceId) : null
}

// POST /appointments/:id/{cancel|confirm|attendance} → mapea al estado interno.
export async function setEstadoAppointment(db: TenantClient, slug: string, id: string, estado: string): Promise<SchedAppointment | null> {
  const exists = await db.cita.findUnique({ where: { id }, select: { id: true } })
  if (!exists) return null
  await cambiarEstadoCita(db, id, estado, 'TuBot')
  const c = await db.cita.findUnique({ where: { id }, select: CITA_SEL })
  return c ? toAppointment(c, slug) : null
}

// GET /patients/:phone/appointments
export async function patientAppointments(db: TenantClient, slug: string, phone: string): Promise<SchedAppointment[]> {
  const pac = await buscarPacientePorTelefono(db, phone)
  if (!pac) return []
  const citas = await db.cita.findMany({ where: { pacienteId: pac.id }, select: CITA_SEL, orderBy: { fecha: 'desc' } })
  return citas.map((c) => toAppointment(c, slug))
}

// ── Fase 4: CRM (lectura de pacientes + notas) ─────────────────────────────────
// No estaba en el CLARIVA.md canónico pero sí en los requerimientos de TuBot; shapes
// definidos acá (documentados en docs/TUBOT_AGENDA.md) para que el consumidor los calce.

export interface CrmPatient { id: string; firstName: string; lastName?: string; phone?: string; email?: string; documentId?: string }
export interface CrmNote { id: string; text: string; author?: string; createdAt: string }

function toCrmPatient(p: { id: string; nombre: string; apellido: string; telefono: string | null; email: string | null; rut: string | null }): CrmPatient {
  return { id: p.id, firstName: p.nombre, lastName: p.apellido || undefined, phone: p.telefono || undefined, email: p.email || undefined, documentId: p.rut || undefined }
}
function toCrmNote(n: { id: string; texto: string; autorNombre: string | null; createdAt: Date }): CrmNote {
  return { id: n.id, text: n.texto, author: n.autorNombre || undefined, createdAt: n.createdAt.toISOString() }
}

// GET /patients?query=&page=&pageSize= → búsqueda paginada (reusa el listado del CRM).
export async function crmSearchPatients(db: TenantClient, q: { query?: string; page?: number; pageSize?: number }): Promise<{ items: CrmPatient[]; total: number; page: number; pageSize: number }> {
  const pagina = await listarPacientesPaginado(db, { q: q.query, page: q.page, pageSize: q.pageSize })
  return { items: pagina.items.map(toCrmPatient), total: pagina.total, page: pagina.page, pageSize: pagina.pageSize }
}

// GET /patients/:id → ficha + sus citas (404 si no existe).
export async function crmPatient(db: TenantClient, slug: string, id: string): Promise<CrmPatient & { appointments: SchedAppointment[] }> {
  const p = await obtenerPaciente(db, id)
  const citas = await db.cita.findMany({ where: { pacienteId: id }, select: CITA_SEL, orderBy: { fecha: 'desc' }, take: 100 })
  return { ...toCrmPatient(p), appointments: citas.map((c) => toAppointment(c, slug)) }
}

// GET /patients/:id/notes → comentarios administrativos (404 si el paciente no existe).
export async function crmNotes(db: TenantClient, id: string): Promise<CrmNote[]> {
  const notas = await listarComentarios(db, id)
  return notas.map(toCrmNote)
}

// POST /patients/:id/notes {text} → agrega una nota al historial (autor "TuBot").
export async function crmAddNote(db: TenantClient, id: string, text: string): Promise<CrmNote> {
  const n = await crearComentario(db, id, { id: 'tubot', nombre: 'TuBot' }, text)
  return toCrmNote(n)
}

// ── Config de webhooks salientes (por clínica, en su Configuracion) ────────────
// Core compartido por el panel del tenant (self-serve) y el Super Admin.
const AGW_SEL = { agendaWhEnabled: true, agendaWhConnectionId: true, agendaWhSecret: true } as const

export async function getWebhookConfig(db: TenantClient): Promise<{ enabled: boolean; connectionId: string | null; secretConfigurado: boolean }> {
  const c = await db.configuracion.findUnique({ where: { id: 'singleton' }, select: AGW_SEL })
  return { enabled: Boolean(c?.agendaWhEnabled), connectionId: c?.agendaWhConnectionId ?? null, secretConfigurado: Boolean(c?.agendaWhSecret) }
}

export async function setWebhookConfig(db: TenantClient, body: Record<string, unknown>): Promise<{ ok: true }> {
  const enabled = Boolean(body.enabled)
  const connectionId = body.connectionId ? String(body.connectionId).trim() : null
  const secretNuevo = typeof body.secret === 'string' && body.secret.trim() ? body.secret.trim() : undefined
  const data: Record<string, unknown> = { agendaWhEnabled: enabled, agendaWhConnectionId: connectionId }
  if (secretNuevo) data.agendaWhSecret = encryptNullable(secretNuevo)
  if (enabled) {
    const actual = await db.configuracion.findUnique({ where: { id: 'singleton' }, select: AGW_SEL })
    const secretOk = Boolean(secretNuevo || actual?.agendaWhSecret)
    if (!connectionId || !secretOk) throw badRequest('Para habilitar los webhooks se necesitan el connectionId y el secreto de la conexión.')
  }
  await db.configuracion.update({ where: { id: 'singleton' }, data })
  return { ok: true as const }
}
