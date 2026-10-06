import type { TenantClient } from '@/db/tenant'
import { badRequest, conflict, notFound } from '@/lib/errors'
import { CITA_ESTADOS_KEYS, CITA_ESTADO_LABELS, ESTADOS_NO_OCUPAN } from '@shared/constants/cita-estados'
import type { CitaDTO } from '@shared/types'
import { addMinutes, intervalsOverlap } from '@/lib/overlap'
import { pushCita, deleteCitaInGoogle, swallowGoogle } from '@/lib/google-sync'
import { enviarConfirmacionHora } from '@/services/email.service'
import { assertDentroDeAtencion } from '@/lib/atencion'
import { conTitulo } from '@shared/utils/nombre'
import { emitirEventoCita } from '@/lib/tubot-webhooks'
import { CLINIC_TZ, todayYmd, rangoFechasUtc } from '@/lib/tz'
import { log, serializeError } from '@/lib/logger'

// Database-per-tenant: cada función recibe el cliente de la base de la clínica.
// La sincronización con Google es best-effort (fire-and-forget): nunca debe
// hacer fallar la operación primaria. Los tokens viven en la Configuracion de
// la base de la clínica, así que pushCita/deleteCitaInGoogle operan sobre `db`.

type CitaRow = {
  id: string; pacienteId: string; doctorId: string; fecha: Date; duracion: number
  estado: string; tipo: string | null; notas: string | null; sobrecupo: boolean; confirmadoWA: boolean
  waDeliveryStatus?: string | null; waDeliveryReason?: string | null
  boxId: string | null
  paciente: { nombre: string; apellido: string; rut: string | null; telefono: string | null }
  doctor: { name: string | null; titulo?: string; email: string | null }
  box?: { id: string; nombre: string } | null
}

function toDTO(c: CitaRow): CitaDTO {
  return {
    id: c.id,
    pacienteId: c.pacienteId,
    pacienteNombre: `${c.paciente.nombre} ${c.paciente.apellido}`,
    pacienteRut: c.paciente.rut,
    pacienteTelefono: c.paciente.telefono,
    doctorId: c.doctorId,
    doctor: conTitulo(c.doctor.titulo, c.doctor.name) || c.doctor.email,
    inicio: c.fecha.toISOString(),
    fin: new Date(c.fecha.getTime() + c.duracion * 60000).toISOString(),
    estado: c.estado,
    tipo: c.tipo ?? 'CONSULTA',
    notas: c.notas ?? '',
    sobrecupo: c.sobrecupo,
    confirmadoWA: c.confirmadoWA,
    waDeliveryStatus: c.waDeliveryStatus ?? null,
    waDeliveryReason: c.waDeliveryReason ?? null,
    boxId: c.boxId,
    box: c.box ? { id: c.box.id, nombre: c.box.nombre } : null,
  }
}

const INCLUDE = {
  paciente: { select: { nombre: true, apellido: true, rut: true, telefono: true } },
  doctor: { select: { name: true, titulo: true, email: true } },
  box: { select: { id: true, nombre: true } },
} as const

// Detección de doble reserva (misma regla que el monolito).
async function findSolapada(db: TenantClient, opts: { doctorId: string; inicio: Date; fin: Date; excluir?: string }) {
  const desde = new Date(opts.inicio.getTime() - 24 * 60 * 60 * 1000)
  const candidatas = await db.cita.findMany({
    where: {
      doctorId: opts.doctorId,
      sobrecupo: false,
      estado: { notIn: ESTADOS_NO_OCUPAN },
      fecha: { gte: desde, lt: opts.fin },
      ...(opts.excluir ? { id: { not: opts.excluir } } : {}),
    },
    select: { id: true, fecha: true, duracion: true, paciente: { select: { nombre: true, apellido: true } } },
  })
  return candidatas.find((c) =>
    intervalsOverlap(c.fecha, addMinutes(c.fecha, c.duracion), opts.inicio, opts.fin),
  ) ?? null
}

export async function listarCitas(db: TenantClient, rango?: { from?: string; to?: string; pacienteId?: string }): Promise<CitaDTO[]> {
  const citas = await db.cita.findMany({
    where: {
      ...(rango?.pacienteId ? { pacienteId: rango.pacienteId } : {}),
      ...(rango?.from && rango?.to ? { fecha: { gte: new Date(rango.from), lte: new Date(rango.to) } } : {}),
    },
    include: INCLUDE,
    orderBy: { fecha: 'asc' },
  })
  return citas.map(toDTO)
}

export interface CrearCitaInput {
  pacienteId: string; doctorId: string; fecha: string; duracion?: number
  tipo?: string; notas?: string | null; sobrecupo?: boolean; enviarCorreo?: boolean; boxId?: string | null
}

export async function crearCita(db: TenantClient, userName: string, input: CrearCitaInput): Promise<CitaDTO> {
  if (!input.pacienteId || !input.doctorId || !input.fecha) {
    throw badRequest('Faltan campos requeridos (pacienteId, doctorId, fecha)')
  }
  const [paciente, doctor] = await Promise.all([
    db.paciente.findUnique({ where: { id: input.pacienteId }, select: { id: true } }),
    db.user.findFirst({ where: { id: input.doctorId, activo: true }, select: { id: true } }),
  ])
  if (!paciente) throw notFound('Paciente no existe en esta clínica')
  if (!doctor) throw notFound('Doctor no existe en esta clínica')

  const sobrecupo = Boolean(input.sobrecupo)
  const inicio = new Date(input.fecha)
  const dur = Number(input.duracion) || 30
  const fin = addMinutes(inicio, dur)

  // Sólo se puede agendar dentro del horario de atención del profesional.
  await assertDentroDeAtencion(db, input.doctorId, inicio, fin)

  const bloqueo = await db.bloqueoAgenda.findFirst({
    where: { doctorId: input.doctorId, inicio: { lt: fin }, fin: { gt: inicio } },
    select: { motivo: true },
  })
  if (bloqueo) throw conflict(`El doctor tiene un bloqueo en ese horario${bloqueo.motivo ? ` (${bloqueo.motivo})` : ''}.`)

  if (!sobrecupo) {
    const solapada = await findSolapada(db, { doctorId: input.doctorId, inicio, fin })
    if (solapada) {
      const hora = solapada.fecha.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })
      throw conflict(`El profesional ya tiene una cita a las ${hora} (${solapada.paciente.nombre} ${solapada.paciente.apellido}). Elige otro horario o usa Sobre Agendamiento.`)
    }
  }

  const cita = await db.cita.create({
    data: {
      pacienteId: input.pacienteId, doctorId: input.doctorId,
      fecha: inicio, duracion: dur, tipo: input.tipo || 'CONSULTA', notas: input.notas || null, sobrecupo,
      boxId: input.boxId || null,
      logs: { create: { tipo: 'AGENDADA', detalle: `Cita ${sobrecupo ? 'sobrecupo ' : ''}agendada por ${userName}`, userName } },
    },
    include: INCLUDE,
  })
  void pushCita(db, cita.id).catch(swallowGoogle('pushCita'))
  void emitirEventoCita(db, 'appointment.created', cita.id)
  // Re-agenda: si el paciente venía de un no-show, su lead vuelve a AGENDADO (limpia recaptura).
  void reengancharLeadReagenda(db, input.pacienteId, cita.id, inicio)
  // Confirmación de hora por correo con archivo de calendario (best-effort; sólo si
  // el paciente tiene email y quien agenda no destildó "enviar cita al correo").
  if (input.enviarCorreo !== false) {
    void (async () => {
      const p = await db.paciente.findUnique({ where: { id: input.pacienteId }, select: { email: true, nombre: true, apellido: true } })
      await enviarConfirmacionHora(db, {
        email: p?.email, pacienteId: input.pacienteId, pacienteNombre: `${p?.nombre ?? ''} ${p?.apellido ?? ''}`.trim(),
        fecha: inicio, duracion: dur, citaId: cita.id, profesional: cita.doctor?.name ?? null, tipo: cita.tipo,
      })
    })().catch(() => {})
  }
  return toDTO(cita)
}

export interface EditarCitaInput {
  fecha?: string; duracion?: number; doctorId?: string; tipo?: string; notas?: string | null; sobrecupo?: boolean; boxId?: string | null
}

export async function editarCita(db: TenantClient, id: string, userName: string, input: EditarCitaInput): Promise<CitaDTO> {
  const current = await db.cita.findUnique({
    where: { id },
    select: { fecha: true, duracion: true, doctorId: true, sobrecupo: true, estado: true },
  })
  if (!current) throw notFound('Cita no encontrada')

  const data: Record<string, unknown> = {}
  if (input.fecha !== undefined) data.fecha = new Date(input.fecha)
  if (input.duracion !== undefined) {
    const n = Number(input.duracion)
    if (!Number.isFinite(n) || n <= 0) throw badRequest('duracion inválida')
    data.duracion = n
  }
  if (input.tipo !== undefined) data.tipo = input.tipo || null
  if (input.notas !== undefined) data.notas = input.notas || null
  if (input.sobrecupo !== undefined) data.sobrecupo = Boolean(input.sobrecupo)
  if (input.boxId !== undefined) data.boxId = input.boxId || null
  if (input.doctorId !== undefined) {
    const doctor = await db.user.findFirst({ where: { id: input.doctorId, activo: true }, select: { id: true } })
    if (!doctor) throw badRequest('Doctor no existe en esta clínica')
    data.doctorId = input.doctorId
  }

  const cambiaHorario = data.fecha !== undefined || data.duracion !== undefined || data.doctorId !== undefined
  if (cambiaHorario) {
    const nuevaFecha = (data.fecha as Date) ?? current.fecha
    const nuevaDur = (data.duracion as number) ?? current.duracion
    const nuevoDoctor = (data.doctorId as string) ?? current.doctorId
    const esSobrecupo = data.sobrecupo !== undefined ? (data.sobrecupo as boolean) : current.sobrecupo
    const fin = addMinutes(nuevaFecha, nuevaDur)

    // Reagendar/mover también debe quedar dentro del horario de atención.
    await assertDentroDeAtencion(db, nuevoDoctor, nuevaFecha, fin)

    const bloqueo = await db.bloqueoAgenda.findFirst({
      where: { doctorId: nuevoDoctor, inicio: { lt: fin }, fin: { gt: nuevaFecha } },
      select: { motivo: true },
    })
    if (bloqueo) throw conflict(`El doctor tiene un bloqueo en ese horario${bloqueo.motivo ? ` (${bloqueo.motivo})` : ''}.`)

    if (!esSobrecupo) {
      const solapada = await findSolapada(db, { doctorId: nuevoDoctor, inicio: nuevaFecha, fin, excluir: id })
      if (solapada) {
        const hora = solapada.fecha.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })
        throw conflict(`El profesional ya tiene una cita a las ${hora} (${solapada.paciente.nombre} ${solapada.paciente.apellido}).`)
      }
    }
  }

  const logs: { tipo: string; detalle: string; userName: string }[] = []
  if (data.fecha !== undefined && (data.fecha as Date).getTime() !== current.fecha.getTime()) {
    const fmt = (d: Date) => d.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
    logs.push({ tipo: 'ESTADO', detalle: `Reagendada de ${fmt(current.fecha)} a ${fmt(data.fecha as Date)}`, userName })
    // Al REAGENDAR (mover a otra fecha/hora), la cita vuelve SIEMPRE a "Agendada",
    // cualquiera sea su estado anterior (No asistió, Notificado por WhatsApp, etc.):
    // es una cita nueva por atender en el nuevo horario. El slug anterior queda libre
    // porque es el MISMO registro que se mueve (no ocupa el horario original). Se
    // resetean también las señales de WhatsApp para poder notificar la nueva hora.
    if (current.estado !== 'PENDIENTE') {
      data.estado = 'PENDIENTE'
      data.confirmadoWA = false
      data.waMessageSid = null
      logs.push({ tipo: 'ESTADO', detalle: `Estado → Agendada (por reagendamiento, desde "${CITA_ESTADO_LABELS[current.estado] ?? current.estado}")`, userName })
    }
  }

  const cita = await db.cita.update({
    where: { id },
    data: { ...data, ...(logs.length > 0 ? { logs: { create: logs } } : {}) },
    include: INCLUDE,
  })
  void pushCita(db, cita.id).catch(swallowGoogle('pushCita'))
  void emitirEventoCita(db, cita.fecha.getTime() !== current.fecha.getTime() ? 'appointment.rescheduled' : 'appointment.updated', cita.id)
  return toDTO(cita)
}

// Historial de la cita (agendamiento, notificaciones, confirmaciones y cambios de
// estado) con fecha/hora y el usuario que realizó cada acción. Del más antiguo al
// más reciente, para leerlo como una línea de tiempo.
export async function listarLogsCita(db: TenantClient, citaId: string) {
  const cita = await db.cita.findUnique({ where: { id: citaId }, select: { id: true } })
  if (!cita) throw notFound('Cita no encontrada')
  return db.citaLog.findMany({
    where: { citaId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, tipo: true, detalle: true, userName: true, createdAt: true },
  })
}

export async function eliminarCita(db: TenantClient, id: string): Promise<void> {
  const existing = await db.cita.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw notFound('Cita no encontrada')
  // Borramos el evento en Google ANTES de eliminar la fila (necesita su googleEventId).
  await deleteCitaInGoogle(db, id).catch(swallowGoogle('deleteCita'))
  await db.citaLog.deleteMany({ where: { citaId: id } })
  await db.cita.delete({ where: { id } })
}

export async function cambiarEstadoCita(db: TenantClient, id: string, estado: string, userName: string): Promise<CitaDTO> {
  if (!CITA_ESTADOS_KEYS.includes(estado)) throw badRequest('Estado inválido')
  const current = await db.cita.findUnique({ where: { id }, select: { estado: true } })
  if (!current) throw notFound('Cita no encontrada')

  const from = CITA_ESTADO_LABELS[current.estado] ?? current.estado
  const to = CITA_ESTADO_LABELS[estado] ?? estado

  const cita = await db.cita.update({
    where: { id },
    data: {
      estado,
      ...(estado !== current.estado
        ? { logs: { create: { tipo: 'ESTADO', detalle: `Estado cambiado de "${from}" a "${to}"`, userName } } }
        : {}),
    },
    include: INCLUDE,
  })
  // Cancelar → quitar de Google; cualquier otro estado → reflejar la versión nuestra.
  if (estado === 'CANCELADA') void deleteCitaInGoogle(db, cita.id).catch(swallowGoogle('deleteCita'))
  else void pushCita(db, cita.id).catch(swallowGoogle('pushCita'))
  // Webhook a TuBot según el estado destino (confirmar / cancelar / asistencia / otro).
  const evento = estado === 'CONFIRMADO' ? 'appointment.confirmed'
    : estado === 'CANCELADA' ? 'appointment.cancelled'
    : (estado === 'ATENDIDA' || estado === 'NO_ASISTIO') ? 'appointment.attendance'
    : 'appointment.updated'
  void emitirEventoCita(db, evento, cita.id)
  // Asistencia → embudo: propaga al lead vinculado (lead.asistio) y dispara recaptura si no-show.
  if (estado === 'ATENDIDA' || estado === 'NO_ASISTIO') {
    void propagarAsistenciaLead(db, { id: cita.id, pacienteId: cita.pacienteId }, estado === 'ATENDIDA')
  }
  return toDTO(cita)
}

// Reenvío MANUAL "por el bot": recepción pide que TuBot vuelva a enviar la confirmación por el
// FLUJO AUTOMÁTICO (el bot confirma/reagenda la hora y manda la insistencia si no responden),
// distinto del enlace wa.me manual que queda de respaldo. Caso típico: una cita se marcó
// Confirmada por error y se devolvió a Agendada/Notificada → así retoma el proceso. Fuerza el
// envío AHORA (sendNow): TuBot ignora la hora programada y reemplaza cualquier recordatorio previo.
export async function reenviarConfirmacionPorBot(db: TenantClient, id: string, userName: string): Promise<{ ok: true }> {
  const cita = await db.cita.findUnique({ where: { id }, select: { estado: true, paciente: { select: { telefono: true } } } })
  if (!cita) throw notFound('Cita no encontrada')
  if (['CANCELADA', 'ATENDIDA', 'NO_ASISTIO'].includes(cita.estado)) {
    throw badRequest('No se puede reenviar la confirmación de una cita cancelada, atendida o marcada como inasistencia')
  }
  if (!cita.paciente?.telefono?.trim()) throw badRequest('El paciente no tiene teléfono para enviarle la confirmación')
  const cfg = await db.configuracion.findUnique({ where: { id: 'singleton' }, select: { agendaWhEnabled: true, agendaWhConnectionId: true } })
  if (!cfg?.agendaWhEnabled || !cfg.agendaWhConnectionId) {
    throw badRequest('El bot de WhatsApp no está conectado. Actívalo en Gestor de IA para reenviar por el bot.')
  }
  await db.citaLog.create({ data: { citaId: id, tipo: 'WA_REENVIO_BOT', detalle: 'Reenvío de confirmación solicitado por recepción (flujo automático del bot)', userName } })
  await emitirEventoCita(db, 'appointment.created', id, { sendNow: true, force: true })
  return { ok: true }
}

// Estados previos a la asistencia: desde ellos una actividad que prueba que el paciente vino
// (un pago presencial) permite inferir ATENDIDA. No se tocan ATENDIDA/NO_ASISTIO/CANCELADA.
const ESTADOS_PRE_ASISTENCIA = ['PENDIENTE', 'CONFIRMADA', 'CONFIRMADO', 'EN_ESPERA', 'EN_ATENCION']

// Marca ATENDIDA (asistencia) de forma PASIVA la cita del paciente del MISMO día que una
// actividad que prueba que asistió (hoy: un pago presencial). Así el show-rate y el costo por
// paciente atendido dejan de depender de que alguien mueva el estado a mano. A diferencia de
// cambiarEstadoCita, NO dispara webhooks de TuBot ni push a Google: es una inferencia interna,
// no una acción del operador. Best-effort: nunca rompe la operación que la invoca.
export async function marcarAsistenciaPorActividad(db: TenantClient, pacienteId: string, fecha: Date, motivo: string): Promise<boolean> {
  try {
    const ymd = todayYmd(CLINIC_TZ, fecha)
    const { gte, lte } = rangoFechasUtc(ymd, ymd)
    const cita = await db.cita.findFirst({
      where: { pacienteId, estado: { in: ESTADOS_PRE_ASISTENCIA }, fecha: { gte, lte } },
      orderBy: { fecha: 'asc' }, select: { id: true },
    })
    if (!cita) return false
    await db.cita.update({
      where: { id: cita.id },
      data: { estado: 'ATENDIDA', logs: { create: { tipo: 'ESTADO', detalle: `Asistencia inferida automáticamente (${motivo})`, userName: 'Sistema' } } },
    })
    await propagarAsistenciaLead(db, { id: cita.id, pacienteId }, true)
    return true
  } catch (e) {
    log.error('citas: marcarAsistenciaPorActividad falló', { pacienteId, err: serializeError(e) })
    return false
  }
}

// Lead vinculado a una cita: preferente por citaId; si no, el lead más reciente del mismo
// paciente que no esté cerrado. Para propagar asistencia/no-show al embudo y la atribución.
async function leadDeCita(db: TenantClient, citaId: string, pacienteId: string) {
  const porCita = await db.lead.findFirst({ where: { citaId }, select: { id: true, recapturaNoShowAt: true } })
  if (porCita) return porCita
  return db.lead.findFirst({
    where: { pacienteId, estado: { notIn: ['PERDIDO', 'CONVERTIDO'] } },
    orderBy: { ultimoIngresoAt: 'desc' }, select: { id: true, recapturaNoShowAt: true },
  })
}

// Propaga la asistencia de una cita al lead vinculado (campo lead.asistio, para el embudo y la
// métrica por campaña). En un no-show marca `recapturaNoShowAt` UNA sola vez (idempotencia: el
// disparo de recaptura no se repite). Best-effort: nunca rompe la operación que la invoca.
export async function propagarAsistenciaLead(db: TenantClient, cita: { id: string; pacienteId: string }, asistio: boolean): Promise<void> {
  try {
    const lead = await leadDeCita(db, cita.id, cita.pacienteId)
    if (!lead) return
    const data: Record<string, unknown> = { asistio }
    // El sello de recaptura (recapturaNoShowAt) lo pone el envío real de la recaptura por
    // WhatsApp (lib/whatsapp.ts), no el momento de marcar el no-show. Si se reclasifica a
    // asistió, se limpia por si quedó marcado.
    if (asistio && lead.recapturaNoShowAt) data.recapturaNoShowAt = null
    await db.lead.update({ where: { id: lead.id }, data })
  } catch (e) {
    log.error('citas: propagar asistencia al lead falló', { citaId: cita.id, err: serializeError(e) })
  }
}

// Re-agenda (C7): si el paciente tenía un lead en no-show (asistio=false) y vuelve a agendar, el
// lead regresa a AGENDADO con la nueva cita y se limpia el no-show/recaptura (no queda en el aire
// ni se re-cuenta como no-show). Best-effort.
export async function reengancharLeadReagenda(db: TenantClient, pacienteId: string, citaId: string, fecha: Date): Promise<void> {
  try {
    const lead = await db.lead.findFirst({ where: { pacienteId, asistio: false, estado: { not: 'CONVERTIDO' } }, orderBy: { ultimoIngresoAt: 'desc' }, select: { id: true } })
    if (!lead) return
    await db.lead.update({ where: { id: lead.id }, data: { estado: 'AGENDADO', asistio: null, recapturaNoShowAt: null, citaId, fechaAgenda: fecha, ultimaGestionAt: new Date() } })
  } catch (e) {
    log.error('citas: reenganche de lead al re-agendar falló', { pacienteId, err: serializeError(e) })
  }
}
