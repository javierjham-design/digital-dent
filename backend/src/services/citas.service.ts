import type { TenantClient } from '@/db/tenant'
import { badRequest, conflict, notFound } from '@/lib/errors'
import { CITA_ESTADOS_KEYS, CITA_ESTADO_LABELS, ESTADOS_NO_OCUPAN, MOTIVO_CANCELACION, MOTIVO_CANCELACION_LABEL, REAGENDA_ORIGEN, REAGENDA_ALERTA_DIAS, REAGENDA_RESOLUCIONES_VALIDAS } from '@shared/constants/cita-estados'
import type { CitaDTO, PendientesReagendarPagina, ReagendaResueltosPagina } from '@shared/types'
import { addMinutes, intervalsOverlap } from '@/lib/overlap'
import { pushCita, deleteCitaInGoogle, swallowGoogle } from '@/lib/google-sync'
import { enviarConfirmacionHora } from '@/services/email.service'
import { assertDentroDeAtencion } from '@/lib/atencion'
import { conTitulo } from '@shared/utils/nombre'
import { emitirEventoCita, emitirEventoCitaChecked } from '@/lib/tubot-webhooks'
import { lockAgendaDoctor } from '@/lib/agenda-lock'
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

  // Lock por profesional + revalidación de solape DENTRO de la transacción: evita la doble
  // reserva concurrente (la validación de arriba es el aviso rápido; esta es la autoritativa).
  const cita = await db.$transaction(async (tx) => {
    await lockAgendaDoctor(tx, input.doctorId)
    // Re-chequeo del bloqueo DENTRO de la tx: un bloqueo creado entre la validación de
    // arriba y este punto ya no deja pasar la cita (mismo criterio que reservarPublico).
    const bloqueoTx = await tx.bloqueoAgenda.findFirst({ where: { doctorId: input.doctorId, inicio: { lt: fin }, fin: { gt: inicio } }, select: { id: true } })
    if (bloqueoTx) throw conflict('El doctor tiene un bloqueo en ese horario.')
    if (!sobrecupo) {
      const solapada = await findSolapada(tx as unknown as TenantClient, { doctorId: input.doctorId, inicio, fin })
      if (solapada) {
        const hora = solapada.fecha.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })
        throw conflict(`El profesional ya tiene una cita a las ${hora} (${solapada.paciente.nombre} ${solapada.paciente.apellido}). Elige otro horario o usa Sobre Agendamiento.`)
      }
    }
    return tx.cita.create({
      data: {
        pacienteId: input.pacienteId, doctorId: input.doctorId,
        fecha: inicio, duracion: dur, tipo: input.tipo || 'CONSULTA', notas: input.notas || null, sobrecupo,
        boxId: input.boxId || null,
        logs: { create: { tipo: 'AGENDADA', detalle: `Cita ${sobrecupo ? 'sobrecupo ' : ''}agendada por ${userName}`, userName } },
      },
      include: INCLUDE,
    })
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
    // Al mover a otra hora, el estado de entrega del recordatorio anterior ya no aplica
    // (si falló, no debe seguir mostrando "no se pudo entregar" para la nueva hora).
    data.waDeliveryStatus = null
    data.waDeliveryReason = null
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

  // Persistencia. Si cambia el horario, va en una transacción con lock por profesional y
  // revalidación de solape DENTRO (igual que crearCita/reprogramarCita): cierra la doble
  // reserva concurrente al arrastrar/editar una cita en paralelo con una reserva pública.
  const dataFinal = { ...data, ...(logs.length > 0 ? { logs: { create: logs } } : {}) }
  let cita
  if (cambiaHorario) {
    const nuevoDoctor = (data.doctorId as string) ?? current.doctorId
    const esSobrecupo = data.sobrecupo !== undefined ? (data.sobrecupo as boolean) : current.sobrecupo
    const nuevaFecha = (data.fecha as Date) ?? current.fecha
    const fin = addMinutes(nuevaFecha, (data.duracion as number) ?? current.duracion)
    cita = await db.$transaction(async (tx) => {
      await lockAgendaDoctor(tx, nuevoDoctor)
      if (!esSobrecupo) {
        const solapada = await findSolapada(tx as unknown as TenantClient, { doctorId: nuevoDoctor, inicio: nuevaFecha, fin, excluir: id })
        if (solapada) {
          const hora = solapada.fecha.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })
          throw conflict(`El profesional ya tiene una cita a las ${hora} (${solapada.paciente.nombre} ${solapada.paciente.apellido}).`)
        }
      }
      return tx.cita.update({ where: { id }, data: dataFinal, include: INCLUDE })
    })
  } else {
    cita = await db.cita.update({ where: { id }, data: dataFinal, include: INCLUDE })
  }
  void pushCita(db, cita.id).catch(swallowGoogle('pushCita'))
  void emitirEventoCita(db, cita.fecha.getTime() !== current.fecha.getTime() ? 'appointment.rescheduled' : 'appointment.updated', cita.id)
  return toDTO(cita)
}

export interface ReprogramarCitaInput {
  fecha: string; doctorId?: string; duracion?: number; sobrecupo?: boolean; boxId?: string | null
}

// REAGENDAR preservando el historial: en vez de mover la misma cita, deja la ORIGINAL como
// CANCELADA (con nota "Reagendada para …") y crea una cita NUEVA en el nuevo horario (hereda
// paciente/tipo/notas/box). Así la ficha conserva el registro completo de citas del paciente.
// Atómico (una transacción para las dos filas); efectos (Google/webhooks/lead) best-effort después.
export async function reprogramarCita(db: TenantClient, id: string, userName: string, input: ReprogramarCitaInput): Promise<CitaDTO> {
  const orig = await db.cita.findUnique({ where: { id }, include: INCLUDE })
  if (!orig) throw notFound('Cita no encontrada')
  if (['CANCELADA', 'ATENDIDA', 'NO_ASISTIO'].includes(orig.estado)) {
    throw badRequest('No se puede reagendar una cita cancelada, atendida o marcada como inasistencia')
  }
  if (!input.fecha) throw badRequest('Falta la nueva fecha')

  const nuevoDoctorId = input.doctorId || orig.doctorId
  const inicio = new Date(input.fecha)
  const dur = Number(input.duracion) || orig.duracion
  const fin = addMinutes(inicio, dur)
  const sobrecupo = input.sobrecupo ?? orig.sobrecupo

  // Validaciones del NUEVO horario (excluyendo la propia cita original, que quedará cancelada).
  await assertDentroDeAtencion(db, nuevoDoctorId, inicio, fin)
  const bloqueo = await db.bloqueoAgenda.findFirst({
    where: { doctorId: nuevoDoctorId, inicio: { lt: fin }, fin: { gt: inicio } }, select: { motivo: true },
  })
  if (bloqueo) throw conflict(`El doctor tiene un bloqueo en ese horario${bloqueo.motivo ? ` (${bloqueo.motivo})` : ''}.`)
  if (!sobrecupo) {
    const solapada = await findSolapada(db, { doctorId: nuevoDoctorId, inicio, fin, excluir: id })
    if (solapada) {
      const hora = solapada.fecha.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })
      throw conflict(`El profesional ya tiene una cita a las ${hora} (${solapada.paciente.nombre} ${solapada.paciente.apellido}). Elige otro horario o usa Sobre Agendamiento.`)
    }
  }

  const fmt = (d: Date) => d.toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })
  const nueva = await db.$transaction(async (tx) => {
    await lockAgendaDoctor(tx, nuevoDoctorId) // serializa contra otra reserva concurrente del mismo doctor
    // 1) La original queda Cancelada (se conserva en la ficha) con la nota de reprogramación.
    await tx.cita.update({
      where: { id },
      data: { estado: 'CANCELADA', logs: { create: { tipo: 'REAGENDADA', detalle: `Reagendada para ${fmt(inicio)} por ${userName}`, userName } } },
    })
    // Re-chequeo autoritativo del solape bajo el lock (ya cancelada la original, no se cuenta).
    if (!sobrecupo) {
      const choca = await findSolapada(tx as unknown as TenantClient, { doctorId: nuevoDoctorId, inicio, fin, excluir: id })
      if (choca) {
        const hora = choca.fecha.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })
        throw conflict(`El profesional ya tiene una cita a las ${hora} (${choca.paciente.nombre} ${choca.paciente.apellido}). Elige otro horario o usa Sobre Agendamiento.`)
      }
    }
    // 2) Nueva cita en el nuevo horario, heredando los datos de la original.
    return tx.cita.create({
      data: {
        pacienteId: orig.pacienteId, doctorId: nuevoDoctorId, fecha: inicio, duracion: dur,
        tipo: orig.tipo || 'CONSULTA', notas: orig.notas, sobrecupo,
        boxId: input.boxId !== undefined ? input.boxId : orig.boxId,
        logs: { create: { tipo: 'AGENDADA', detalle: `Reagendada desde ${fmt(orig.fecha)} por ${userName}`, userName } },
      },
      include: INCLUDE,
    })
  })

  // Efectos best-effort: la original se cancela (Google/TuBot), la nueva se crea.
  void deleteCitaInGoogle(db, id).catch(swallowGoogle('deleteCita'))
  void emitirEventoCita(db, 'appointment.cancelled', id)
  void pushCita(db, nueva.id).catch(swallowGoogle('pushCita'))
  void emitirEventoCita(db, 'appointment.created', nueva.id)
  // Re-apuntar el lead vinculado a la cita ORIGINAL hacia la nueva: si no, queda referenciando la
  // cita cancelada y la fecha vieja (métricas de CRM/fechaAgenda desfasadas).
  void db.lead.updateMany({ where: { citaId: id }, data: { citaId: nueva.id, fechaAgenda: inicio } }).catch(() => {})
  // Si el paciente venía de un no-show, su lead vuelve a AGENDADO (limpia recaptura).
  void reengancharLeadReagenda(db, orig.pacienteId, nueva.id, inicio)
  return toDTO(nueva)
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
  // Avisar a TuBot ANTES de borrar (la emisión lee la cita): cancela recordatorios/confirmación
  // pendientes para que no se envíe un WhatsApp de una cita que ya no existe.
  await emitirEventoCita(db, 'appointment.cancelled', id)
  // Borramos el evento en Google ANTES de eliminar la fila (necesita su googleEventId).
  await deleteCitaInGoogle(db, id).catch(swallowGoogle('deleteCita'))
  await db.citaLog.deleteMany({ where: { citaId: id } })
  await db.cita.delete({ where: { id } })
}

// Salidas permitidas desde los estados TERMINALES de asistencia: reclasificar el par
// Atendida↔No asistió, cancelar, o devolver a "En atención" (corrección de un mal clic).
// Volver a PENDIENTE/CONFIRMADA re-expone la cita al cron de no-show y a los
// recordatorios: una cita ya atendida terminaría con recaptura de inasistencia.
const SALIDAS_DESDE_TERMINAL = ['ATENDIDA', 'NO_ASISTIO', 'CANCELADA', 'EN_ATENCION']

export async function cambiarEstadoCita(db: TenantClient, id: string, estado: string, userName: string, opts?: { soloDesde?: string[]; motivoCancelacion?: string | null }): Promise<CitaDTO> {
  if (!CITA_ESTADOS_KEYS.includes(estado)) throw badRequest('Estado inválido')
  const current = await db.cita.findUnique({ where: { id }, select: { estado: true, fecha: true, duracion: true, doctorId: true, sobrecupo: true } })
  if (!current) throw notFound('Cita no encontrada')
  // Guard para cambios AUTOMÁTICOS (cron no-show): si el estado cambió entre el snapshot
  // del job y este punto (p.ej. recepción marcó ATENDIDA), el cambio no se aplica.
  if (opts?.soloDesde && !opts.soloDesde.includes(current.estado)) {
    throw conflict('La cita cambió de estado: no se aplica el cambio automático.')
  }
  if (['ATENDIDA', 'NO_ASISTIO'].includes(current.estado) && estado !== current.estado && !SALIDAS_DESDE_TERMINAL.includes(estado)) {
    throw badRequest('La asistencia de esta cita ya quedó registrada. Puedes reclasificarla (Atendida/No asistió), devolverla a "En atención" o cancelarla.')
  }

  const from = CITA_ESTADO_LABELS[current.estado] ?? current.estado
  const to = CITA_ESTADO_LABELS[estado] ?? estado

  // H3: reabrir una cita que NO ocupaba (Cancelada/No asistió) hacia un estado que SÍ ocupa
  // debe revalidar que el cupo no lo haya retomado otra cita, o quedarían dos citas encima.
  // Con lock + re-chequeo DENTRO de la transacción (una reserva concurrente del mismo hueco
  // pasaba entre la validación y el update).
  const volviaAOcupar = ESTADOS_NO_OCUPAN.includes(current.estado) && !ESTADOS_NO_OCUPAN.includes(estado)
  // Motivo de cancelación: SOLO aplica a CANCELADA (lo informa un canal externo como TuBot en el
  // body del cancel). En cualquier otro estado se limpia, para no arrastrar un motivo viejo si la
  // cita se reabre. Una cancelación manual en el panel no trae motivo → queda null.
  const motivoCancelacion = estado === 'CANCELADA' ? (opts?.motivoCancelacion ?? null) : null
  const motivoTxt = motivoCancelacion ? MOTIVO_CANCELACION_LABEL[motivoCancelacion] : undefined
  const dataUpdate = {
    estado,
    motivoCancelacion,
    ...(estado !== current.estado
      ? { logs: { create: { tipo: 'ESTADO', detalle: `Estado cambiado de "${from}" a "${to}"${motivoTxt ? ` — ${motivoTxt}` : ''}`, userName } } }
      : {}),
  }
  const cita = volviaAOcupar && !current.sobrecupo && estado !== current.estado
    ? await db.$transaction(async (tx) => {
        await lockAgendaDoctor(tx, current.doctorId)
        const solapada = await findSolapada(tx as unknown as TenantClient, { doctorId: current.doctorId, inicio: current.fecha, fin: addMinutes(current.fecha, current.duracion), excluir: id })
        if (solapada) {
          const hora = solapada.fecha.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })
          throw conflict(`No se puede reabrir: el horario ya fue tomado por otra cita a las ${hora} (${solapada.paciente.nombre} ${solapada.paciente.apellido}). Reagenda esta cita a otro horario.`)
        }
        return tx.cita.update({ where: { id }, data: dataUpdate, include: INCLUDE })
      })
    : await db.cita.update({ where: { id }, data: dataUpdate, include: INCLUDE })
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

// ── Pendientes de reagendar ───────────────────────────────────────────────────
// Lista DERIVADA de la agenda (sin tabla propia para la detección): un paciente está pendiente
// cuando su ÚLTIMA cita (por updatedAt) es una cancelación "para reagendar" (motivo
// 'patient_reschedule') o una inasistencia (NO_ASISTIO) y NO tiene una cita futura activa. Así el
// histórico aparece solo (retroactivo) y la lista se vacía sola cuando el paciente toma una hora
// nueva (la cita la crea Cláriva, p. ej. TuBot vía POST /appointments). Recepción puede sacar a un
// paciente a mano (perdido/agendado): eso vive en ReagendaResolucion. Ver docs/TUBOT_AGENDA.md.
const PAGE_SIZES_REAGENDAR = [25, 50, 100]
const VENTANA_REAGENDAR_DIAS = 365 // sólo actividad del último año entra a la lista (más viejo = recall frío)

// True si el error es "la tabla ReagendaResolucion no existe" (Prisma P2021 / Postgres 42P01):
// cubre el intervalo entre desplegar el código y que el tenant tenga la tabla migrada. SOLO se usa
// para DEGRADAR lecturas (no hay resoluciones todavía); nunca enmascara otros errores.
function tablaReagendaFalta(e: unknown): boolean {
  const code = (e as { code?: string })?.code
  const msg = e instanceof Error ? e.message : String(e)
  return code === 'P2021' || /ReagendaResolucion.*does not exist|relation .*ReagendaResolucion.* does not exist/i.test(msg)
}

// Normaliza para buscar (sin acentos, minúsculas).
function normReag(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}
function coincideReag(it: { pacienteNombre: string; pacienteRut: string | null; pacienteTelefono: string | null }, needle: string, digitos: string): boolean {
  if (normReag(it.pacienteNombre).includes(needle)) return true
  if (it.pacienteRut && normReag(it.pacienteRut).includes(needle)) return true
  if (digitos.length >= 3 && it.pacienteTelefono && it.pacienteTelefono.replace(/\D/g, '').includes(digitos)) return true
  return false
}

export async function listarPendientesReagendar(
  db: TenantClient,
  opts?: { q?: string; page?: number; pageSize?: number; soloAlerta?: boolean },
): Promise<PendientesReagendarPagina> {
  const pageSize = PAGE_SIZES_REAGENDAR.includes(Number(opts?.pageSize)) ? Number(opts?.pageSize) : 25
  const page = Math.max(1, Number(opts?.page) || 1)
  const ahora = new Date()
  const piso = new Date(ahora.getTime() - VENTANA_REAGENDAR_DIAS * 86400_000)
  const vacio: PendientesReagendarPagina = { items: [], total: 0, conAlerta: 0, page, pageSize }

  // 1) Universo: pacientes con un evento "pendiente" reciente (cancelación para reagendar o no-show),
  //    por updatedAt (cuándo la cita quedó en ese estado).
  const conEvento = await db.cita.findMany({
    where: {
      updatedAt: { gte: piso },
      OR: [
        { estado: 'NO_ASISTIO' },
        { estado: 'CANCELADA', motivoCancelacion: MOTIVO_CANCELACION.REAGENDAR },
      ],
    },
    select: { pacienteId: true }, distinct: ['pacienteId'],
  })
  if (conEvento.length === 0) return vacio
  const ids = conEvento.map((c) => c.pacienteId)

  // 2) Quiénes ya tienen hora futura activa → ya reagendaron, fuera.
  const conFutura = await db.cita.findMany({
    where: { pacienteId: { in: ids }, fecha: { gte: ahora }, estado: { notIn: ESTADOS_NO_OCUPAN } },
    select: { pacienteId: true }, distinct: ['pacienteId'],
  })
  const yaReagendaron = new Set(conFutura.map((c) => c.pacienteId))
  const candidatos = ids.filter((id) => !yaReagendaron.has(id))
  if (candidatos.length === 0) return vacio

  // 3) La ÚLTIMA cita (por updatedAt) de cada candidato: sólo sigue pendiente si esa última cita
  //    ES el evento (si después atendió o tiene otra posterior, ya no es "pendiente de reagendar").
  const ultimas = await db.cita.findMany({
    where: { pacienteId: { in: candidatos } },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true, pacienteId: true, fecha: true, updatedAt: true, estado: true, motivoCancelacion: true,
      doctor: { select: { name: true, titulo: true, email: true } },
    },
  })
  const ultimaPorPac = new Map<string, (typeof ultimas)[number]>()
  for (const c of ultimas) if (!ultimaPorPac.has(c.pacienteId)) ultimaPorPac.set(c.pacienteId, c)
  const triggers = [...ultimaPorPac.values()].filter((c) =>
    c.updatedAt >= piso &&
    (c.estado === 'NO_ASISTIO' || (c.estado === 'CANCELADA' && c.motivoCancelacion === MOTIVO_CANCELACION.REAGENDAR)),
  )
  if (triggers.length === 0) return vacio
  const trigIds = triggers.map((t) => t.pacienteId)

  // 4) Resolución manual más reciente por paciente: lo oculta si se resolvió DESPUÉS del evento
  //    (si el evento es posterior a la resolución, reapareció solo → se muestra). Tolerante a que
  //    la tabla todavía no exista en un tenant (intervalo entre deploy y migración): sin tabla no
  //    hay resoluciones, así que degradar a "ninguna" es correcto y nunca rompe la lista.
  const resoluciones = await db.reagendaResolucion.findMany({
    where: { pacienteId: { in: trigIds } },
    orderBy: { creadoEn: 'desc' }, distinct: ['pacienteId'],
    select: { pacienteId: true, creadoEn: true },
  }).catch((e) => { if (tablaReagendaFalta(e)) return []; throw e })
  const resueltoHasta = new Map(resoluciones.map((r) => [r.pacienteId, r.creadoEn]))

  // 5) Sólo pacientes activos (no dados de baja).
  const pacientes = await db.paciente.findMany({
    where: { id: { in: trigIds }, activo: true },
    select: { id: true, nombre: true, apellido: true, rut: true, telefono: true },
  })
  const mapPac = new Map(pacientes.map((p) => [p.id, p]))

  let items = triggers
    .filter((t) => {
      if (!mapPac.has(t.pacienteId)) return false
      const res = resueltoHasta.get(t.pacienteId)
      return !(res && res >= t.updatedAt)
    })
    .map((t) => {
      const pac = mapPac.get(t.pacienteId)!
      return {
        pacienteId: t.pacienteId,
        pacienteNombre: `${pac.nombre} ${pac.apellido}`,
        pacienteRut: pac.rut,
        pacienteTelefono: pac.telefono,
        citaId: t.id,
        doctor: conTitulo(t.doctor.titulo, t.doctor.name) || t.doctor.email,
        origen: t.estado === 'NO_ASISTIO' ? REAGENDA_ORIGEN.NO_SHOW : REAGENDA_ORIGEN.REAGENDAR,
        inicioOriginal: t.fecha.toISOString(),
        desde: t.updatedAt.toISOString(),
        _desde: t.updatedAt,
      }
    })

  // Búsqueda por nombre / RUT / teléfono.
  const q = (opts?.q ?? '').trim()
  if (q.length >= 2) {
    const needle = normReag(q)
    const digitos = q.replace(/\D/g, '')
    items = items.filter((it) => coincideReag(it, needle, digitos))
  }

  // Alerta: lleva más de REAGENDA_ALERTA_DIAS sin reagendar (sobre lo que coincide con la búsqueda).
  const alertaCorte = new Date(ahora.getTime() - REAGENDA_ALERTA_DIAS * 86400_000)
  const conAlerta = items.filter((it) => it._desde < alertaCorte).length
  if (opts?.soloAlerta) items = items.filter((it) => it._desde < alertaCorte)

  items.sort((a, b) => +b._desde - +a._desde) // más reciente primero
  const total = items.length
  const start = (page - 1) * pageSize
  const pagina = items.slice(start, start + pageSize).map(({ _desde, ...rest }) => rest)
  return { items: pagina, total, conAlerta, page, pageSize }
}

// Recepción saca a un paciente de la lista de pendientes clasificándolo (AGENDADO = se le dio
// hora / ya no corresponde · PERDIDO = no se recuperó). No borra nada de la agenda: solo registra
// la resolución. Si el paciente vuelve a no-asistir/cancelar después, reaparece solo.
export async function resolverReagendar(
  db: TenantClient, pacienteId: string, estado: string, userName: string, nota?: string | null,
): Promise<{ ok: true }> {
  if (!REAGENDA_RESOLUCIONES_VALIDAS.includes(estado)) throw badRequest('Estado de resolución inválido')
  const pac = await db.paciente.findUnique({ where: { id: pacienteId }, select: { id: true } })
  if (!pac) throw notFound('Paciente no encontrado')
  await db.reagendaResolucion.create({ data: { pacienteId, estado, nota: nota?.trim() || null, resueltoPor: userName } })
  return { ok: true }
}

// Deshacer la última clasificación: borra la resolución más reciente del paciente, que vuelve a la
// lista de pendientes (si todavía corresponde por su agenda).
export async function reabrirReagendar(db: TenantClient, pacienteId: string): Promise<{ ok: true }> {
  const ultima = await db.reagendaResolucion.findFirst({ where: { pacienteId }, orderBy: { creadoEn: 'desc' }, select: { id: true } })
  if (ultima) await db.reagendaResolucion.delete({ where: { id: ultima.id } })
  return { ok: true }
}

// Pacientes que recepción resolvió a mano (perdido/agendado): su clasificación VIGENTE (la más
// reciente por paciente), para el apartado "Resueltos" con opción de reabrir.
export async function listarReagendarResueltos(
  db: TenantClient, opts?: { q?: string; page?: number; pageSize?: number },
): Promise<ReagendaResueltosPagina> {
  const pageSize = PAGE_SIZES_REAGENDAR.includes(Number(opts?.pageSize)) ? Number(opts?.pageSize) : 25
  const page = Math.max(1, Number(opts?.page) || 1)
  const todas = await db.reagendaResolucion.findMany({
    orderBy: { creadoEn: 'desc' }, distinct: ['pacienteId'],
    select: { pacienteId: true, estado: true, nota: true, resueltoPor: true, creadoEn: true },
  }).catch((e) => { if (tablaReagendaFalta(e)) return []; throw e })
  if (todas.length === 0) return { items: [], total: 0, page, pageSize }
  const pacientes = await db.paciente.findMany({
    where: { id: { in: todas.map((r) => r.pacienteId) }, activo: true },
    select: { id: true, nombre: true, apellido: true, rut: true, telefono: true },
  })
  const mapPac = new Map(pacientes.map((p) => [p.id, p]))
  let items = todas
    .filter((r) => mapPac.has(r.pacienteId))
    .map((r) => {
      const pac = mapPac.get(r.pacienteId)!
      return {
        pacienteId: r.pacienteId,
        pacienteNombre: `${pac.nombre} ${pac.apellido}`,
        pacienteRut: pac.rut,
        pacienteTelefono: pac.telefono,
        estado: r.estado, nota: r.nota, resueltoPor: r.resueltoPor,
        resueltoEn: r.creadoEn.toISOString(),
        _creadoEn: r.creadoEn,
      }
    })
  const q = (opts?.q ?? '').trim()
  if (q.length >= 2) {
    const needle = normReag(q)
    const digitos = q.replace(/\D/g, '')
    items = items.filter((it) => coincideReag(it, needle, digitos))
  }
  items.sort((a, b) => +b._creadoEn - +a._creadoEn)
  const total = items.length
  const start = (page - 1) * pageSize
  const pagina = items.slice(start, start + pageSize).map(({ _creadoEn, ...rest }) => rest)
  return { items: pagina, total, page, pageSize }
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
  // Entrega SÍNCRONA y verificada (a diferencia de los eventos automáticos best-effort): el
  // reenvío manual le dice a recepción si TuBot aceptó o no.
  const res = await emitirEventoCitaChecked(db, 'appointment.created', id, { sendNow: true, force: true })
  await db.citaLog.create({
    data: {
      citaId: id, tipo: 'WA_REENVIO_BOT', userName,
      detalle: res.ok
        ? 'Reenvío de confirmación entregado a TuBot (flujo automático)'
        : `Reenvío solicitado pero TuBot NO lo aceptó: ${res.status ? `HTTP ${res.status} ` : ''}${res.error ?? ''}`.trim(),
    },
  })
  if (!res.ok) {
    throw badRequest(
      res.status ? `TuBot rechazó el webhook (HTTP ${res.status})${res.error ? `: ${res.error}` : ''}`
        : `No se pudo entregar al bot: ${res.error ?? 'error de red'}`,
    )
  }
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

// Lead vinculado a una cita: preferente por citaId; si no, el lead ABIERTO más reciente
// del mismo paciente SIN cita propia y con actividad reciente (90 días). El fallback
// amplio atribuía la asistencia de una cita cualquiera al lead de otra campaña.
const FALLBACK_LEAD_DIAS = 90
async function leadDeCita(db: TenantClient, citaId: string, pacienteId: string) {
  const porCita = await db.lead.findFirst({ where: { citaId }, select: { id: true, recapturaNoShowAt: true } })
  if (porCita) return porCita
  return db.lead.findFirst({
    where: {
      pacienteId, estado: { notIn: ['PERDIDO', 'CONVERTIDO'] },
      citaId: null, // un lead ya atado a OTRA cita no hereda la asistencia de esta
      ultimoIngresoAt: { gte: new Date(Date.now() - FALLBACK_LEAD_DIAS * 86400_000) },
    },
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
    // Acotado a no-shows RECIENTES (90 días): re-agendar hoy no debe revivir un lead
    // perdido de hace un año (quedaría AGENDADO y contaminaría el embudo por campaña).
    const lead = await db.lead.findFirst({
      where: { pacienteId, asistio: false, estado: { not: 'CONVERTIDO' }, fechaAgenda: { gte: new Date(Date.now() - FALLBACK_LEAD_DIAS * 86400_000) } },
      orderBy: { ultimoIngresoAt: 'desc' }, select: { id: true },
    })
    if (!lead) return
    await db.lead.update({ where: { id: lead.id }, data: { estado: 'AGENDADO', asistio: null, recapturaNoShowAt: null, citaId, fechaAgenda: fecha, ultimaGestionAt: new Date() } })
  } catch (e) {
    log.error('citas: reenganche de lead al re-agendar falló', { pacienteId, err: serializeError(e) })
  }
}
