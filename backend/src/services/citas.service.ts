import type { TenantClient } from '@/db/tenant'
import { badRequest, conflict, notFound } from '@/lib/errors'
import { CITA_ESTADOS_KEYS, CITA_ESTADO_LABELS, ESTADOS_NO_OCUPAN } from '@shared/constants/cita-estados'
import type { CitaDTO } from '@shared/types'
import { addMinutes, intervalsOverlap } from '@/lib/overlap'

// Database-per-tenant: cada función recibe el cliente de la base de la clínica.
// NOTA: la sincronización con Google se reconectará al convertir google-sync al
// modelo tenant (los tokens viven en Configuracion de la base de la clínica).

type CitaRow = {
  id: string; pacienteId: string; doctorId: string; fecha: Date; duracion: number
  estado: string; tipo: string | null; notas: string | null; sobrecupo: boolean; confirmadoWA: boolean
  paciente: { nombre: string; apellido: string; rut: string | null; telefono: string | null }
  doctor: { name: string | null; email: string | null }
}

function toDTO(c: CitaRow): CitaDTO {
  return {
    id: c.id,
    pacienteId: c.pacienteId,
    pacienteNombre: `${c.paciente.nombre} ${c.paciente.apellido}`,
    pacienteRut: c.paciente.rut,
    pacienteTelefono: c.paciente.telefono,
    doctorId: c.doctorId,
    doctor: c.doctor.name ?? c.doctor.email,
    inicio: c.fecha.toISOString(),
    fin: new Date(c.fecha.getTime() + c.duracion * 60000).toISOString(),
    estado: c.estado,
    tipo: c.tipo ?? 'CONSULTA',
    notas: c.notas ?? '',
    sobrecupo: c.sobrecupo,
    confirmadoWA: c.confirmadoWA,
  }
}

const INCLUDE = {
  paciente: { select: { nombre: true, apellido: true, rut: true, telefono: true } },
  doctor: { select: { name: true, email: true } },
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
  tipo?: string; notas?: string | null; sobrecupo?: boolean
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
      logs: { create: { tipo: 'AGENDADA', detalle: `Cita ${sobrecupo ? 'sobrecupo ' : ''}agendada por ${userName}`, userName } },
    },
    include: INCLUDE,
  })
  return toDTO(cita)
}

export interface EditarCitaInput {
  fecha?: string; duracion?: number; doctorId?: string; tipo?: string; notas?: string | null; sobrecupo?: boolean
}

export async function editarCita(db: TenantClient, id: string, userName: string, input: EditarCitaInput): Promise<CitaDTO> {
  const current = await db.cita.findUnique({
    where: { id },
    select: { fecha: true, duracion: true, doctorId: true, sobrecupo: true },
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
  }

  const cita = await db.cita.update({
    where: { id },
    data: { ...data, ...(logs.length > 0 ? { logs: { create: logs } } : {}) },
    include: INCLUDE,
  })
  return toDTO(cita)
}

export async function eliminarCita(db: TenantClient, id: string): Promise<void> {
  const existing = await db.cita.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw notFound('Cita no encontrada')
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
  return toDTO(cita)
}
