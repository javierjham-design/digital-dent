import { createHmac } from 'crypto'
import { env } from '@/config/env'
import type { TenantClient } from '@/db/tenant'
import { decryptNullable } from '@/lib/crypto'
import { getRequestContext } from '@/lib/request-context'
import { conTitulo } from '@shared/utils/nombre'

// Webhooks de AGENDA salientes: Cláriva → TuBot. Se disparan desde los puntos de
// mutación de citas/pacientes (best-effort: NUNCA hacen fallar la operación). Firma
// `X-Clariva-Signature: sha256=HMAC(secret, body)`. Contrato: docs/TUBOT_AGENDA.md.
// No importa services (se usa DESDE citas/pacientes.service) para no crear ciclos.

export type WebhookEvent =
  | 'appointment.created' | 'appointment.updated' | 'appointment.confirmed'
  | 'appointment.cancelled' | 'appointment.rescheduled' | 'appointment.attendance'
  | 'patient.updated'

// Estado interno de Cláriva → estado del contrato de TuBot.
export const ESTADO_A_STATUS: Record<string, string> = {
  PENDIENTE: 'pending', CONFIRMADA: 'pending',
  CONFIRMADO: 'confirmed', EN_ESPERA: 'confirmed', EN_ATENCION: 'confirmed',
  ATENDIDA: 'completed', NO_ASISTIO: 'no_show', CANCELADA: 'cancelled',
}

const CFG_SEL = { agendaWhEnabled: true, agendaWhConnectionId: true, agendaWhSecret: true } as const

// Selección de cita ENRIQUECIDA (con profesional) — forma canónica del appointment
// del contrato, compartida por el listado (GET /appointments) y los webhooks.
export const CITA_FULL_SEL = {
  id: true, doctorId: true, fecha: true, duracion: true, estado: true, notas: true,
  doctor: { select: { name: true, titulo: true, email: true } },
  paciente: { select: { nombre: true, apellido: true, telefono: true, email: true, rut: true } },
} as const

export interface CitaFullRow {
  id: string; doctorId: string; fecha: Date; duracion: number; estado: string; notas: string | null
  doctor: { name: string | null; titulo: string | null; email: string | null } | null
  paciente: { nombre: string; apellido: string; telefono: string | null; email: string | null; rut: string | null }
}

type PacienteRow = { nombre: string; apellido: string; telefono: string | null; email: string | null; rut: string | null }
export function toSchedPatient(p: PacienteRow) {
  return { firstName: p.nombre, lastName: p.apellido || undefined, phone: p.telefono || '', email: p.email || undefined, documentId: p.rut || undefined }
}

// Cita → `SchedAppointment` del contrato (forma del punto 1). `start/end` en ISO 8601
// UTC. `attended` sólo se incluye en el evento appointment.attendance.
export function citaToAppointment(c: CitaFullRow, opts: { slug: string; clinicName?: string; serviceId?: string; attended?: boolean }) {
  const prof = c.doctor ? (conTitulo(c.doctor.titulo ?? undefined, c.doctor.name) || c.doctor.name || c.doctor.email || undefined) : undefined
  return {
    id: c.id,
    clinicId: opts.slug,
    ...(opts.clinicName ? { clinicName: opts.clinicName } : {}),
    professionalId: c.doctorId,
    ...(prof ? { professionalName: prof } : {}),
    ...(opts.serviceId ? { serviceId: opts.serviceId } : {}),
    patient: toSchedPatient(c.paciente),
    start: c.fecha.toISOString(),
    end: new Date(c.fecha.getTime() + c.duracion * 60000).toISOString(),
    status: ESTADO_A_STATUS[c.estado] ?? 'pending',
    ...(c.notas ? { notes: c.notas } : {}),
    ...(opts.attended !== undefined ? { attended: opts.attended } : {}),
  }
}

type WhCfg = { agendaWhEnabled: boolean; agendaWhConnectionId: string | null; agendaWhSecret: string | null }

// Firma y envía a TuBot (best-effort). Asume la config ya leída y con webhooks activos.
async function sendSigned(cfg: WhCfg, event: WebhookEvent, data: unknown): Promise<void> {
  const secret = decryptNullable(cfg.agendaWhSecret)
  if (!secret || !cfg.agendaWhConnectionId) return
  const body = JSON.stringify({ event, occurredAt: new Date().toISOString(), data })
  const firma = createHmac('sha256', secret).update(body).digest('hex')
  await fetch(`${env.tubotBaseUrl}/webhooks/clariva/${cfg.agendaWhConnectionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Clariva-Signature': `sha256=${firma}` },
    body,
  })
}

// Evento de cita: relee la cita (enriquecida) y arma el payload. `clinicId` = slug del
// request-context; `clinicName` de la Configuracion. Para attendance agrega `attended`.
export async function emitirEventoCita(db: TenantClient, event: WebhookEvent, citaId: string): Promise<void> {
  try {
    const cfg = await db.configuracion.findUnique({ where: { id: 'singleton' }, select: { ...CFG_SEL, nombre: true } })
    if (!cfg?.agendaWhEnabled || !cfg.agendaWhConnectionId) return // sin webhooks activos: ni leemos la cita
    const c = await db.cita.findUnique({ where: { id: citaId }, select: CITA_FULL_SEL })
    if (!c) return
    const slug = getRequestContext()?.slug ?? ''
    const attended = event === 'appointment.attendance' ? c.estado === 'ATENDIDA' : undefined
    const data = citaToAppointment(c as CitaFullRow, { slug, clinicName: cfg.nombre ?? undefined, attended })
    await sendSigned(cfg, event, data)
  } catch { /* best-effort: los webhooks nunca hacen fallar la operación primaria */ }
}

// Evento de paciente actualizado → data { firstName, lastName?, phone, email?, documentId? }.
export async function emitirEventoPaciente(db: TenantClient, pacienteId: string): Promise<void> {
  try {
    const cfg = await db.configuracion.findUnique({ where: { id: 'singleton' }, select: CFG_SEL })
    if (!cfg?.agendaWhEnabled || !cfg.agendaWhConnectionId) return
    const p = await db.paciente.findUnique({ where: { id: pacienteId }, select: { nombre: true, apellido: true, telefono: true, email: true, rut: true } })
    if (!p) return
    await sendSigned(cfg, 'patient.updated', toSchedPatient(p))
  } catch { /* best-effort */ }
}
