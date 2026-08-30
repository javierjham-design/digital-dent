import { createHmac } from 'crypto'
import { env } from '@/config/env'
import type { TenantClient } from '@/db/tenant'
import { decryptNullable } from '@/lib/crypto'
import { getRequestContext } from '@/lib/request-context'

// Webhooks de AGENDA salientes: Cláriva → TuBot. Se disparan desde los puntos de
// mutación de citas/pacientes (best-effort: NUNCA hacen fallar la operación). Firma
// `X-Clariva-Signature: sha256=HMAC(secret, body)`. Contrato: docs/TUBOT_AGENDA.md.
// No importa services (se usa DESDE citas/pacientes.service) para no crear ciclos.

export type WebhookEvent =
  | 'appointment.created' | 'appointment.updated' | 'appointment.confirmed'
  | 'appointment.cancelled' | 'appointment.rescheduled' | 'appointment.attendance'
  | 'patient.updated'

// Estado interno de Cláriva → estado del contrato de TuBot (igual que en tubot-agenda.service).
export const ESTADO_A_STATUS: Record<string, string> = {
  PENDIENTE: 'pending', CONFIRMADA: 'pending',
  CONFIRMADO: 'confirmed', EN_ESPERA: 'confirmed', EN_ATENCION: 'confirmed',
  ATENDIDA: 'completed', NO_ASISTIO: 'no_show', CANCELADA: 'cancelled',
}

const CFG_SEL = { agendaWhEnabled: true, agendaWhConnectionId: true, agendaWhSecret: true } as const
const CITA_SEL = {
  id: true, doctorId: true, fecha: true, duracion: true, estado: true, notas: true,
  paciente: { select: { nombre: true, apellido: true, telefono: true, email: true, rut: true } },
} as const

type PacienteRow = { nombre: string; apellido: string; telefono: string | null; email: string | null; rut: string | null }
function toSchedPatient(p: PacienteRow) {
  return { firstName: p.nombre, lastName: p.apellido || undefined, phone: p.telefono || '', email: p.email || undefined, documentId: p.rut || undefined }
}

// Firma y envía (best-effort). Sale sin ruido si la clínica no tiene webhooks activos.
async function enviar(db: TenantClient, event: WebhookEvent, data: unknown): Promise<void> {
  try {
    const c = await db.configuracion.findUnique({ where: { id: 'singleton' }, select: CFG_SEL })
    if (!c?.agendaWhEnabled || !c.agendaWhConnectionId) return
    const secret = decryptNullable(c.agendaWhSecret)
    if (!secret) return
    const body = JSON.stringify({ event, occurredAt: new Date().toISOString(), data })
    const firma = createHmac('sha256', secret).update(body).digest('hex')
    await fetch(`${env.tubotBaseUrl}/webhooks/clariva/${c.agendaWhConnectionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Clariva-Signature': `sha256=${firma}` },
      body,
    })
  } catch { /* best-effort: los webhooks nunca hacen fallar la operación primaria */ }
}

// Evento de cita: relee la cita y arma el `SchedAppointment`. El `clinicId` (= slug)
// se toma del contexto de request (lo siembra requireTenant/requireTubotApiKey).
export async function emitirEventoCita(db: TenantClient, event: WebhookEvent, citaId: string): Promise<void> {
  try {
    const c = await db.cita.findUnique({ where: { id: citaId }, select: CITA_SEL })
    if (!c) return
    const slug = getRequestContext()?.slug ?? ''
    await enviar(db, event, {
      id: c.id, clinicId: slug, professionalId: c.doctorId,
      patient: toSchedPatient(c.paciente),
      start: c.fecha.toISOString(),
      end: new Date(c.fecha.getTime() + c.duracion * 60000).toISOString(),
      status: ESTADO_A_STATUS[c.estado] ?? 'pending',
      notes: c.notas || undefined,
    })
  } catch { /* best-effort */ }
}

// Evento de paciente actualizado.
export async function emitirEventoPaciente(db: TenantClient, pacienteId: string): Promise<void> {
  try {
    const p = await db.paciente.findUnique({ where: { id: pacienteId }, select: { nombre: true, apellido: true, telefono: true, email: true, rut: true } })
    if (!p) return
    await enviar(db, 'patient.updated', toSchedPatient(p))
  } catch { /* best-effort */ }
}
