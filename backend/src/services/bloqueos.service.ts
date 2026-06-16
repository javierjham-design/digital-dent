import { prisma } from '@/lib/prisma'
import { badRequest, forbidden, notFound } from '@/lib/errors'
import { actorName, type JwtPayload } from '@/services/auth.service'
import type { BloqueoDTO } from '@shared/types'

type BloqueoRow = {
  id: string; doctorId: string; inicio: Date; fin: Date; motivo: string | null; createdByName: string | null
  doctor: { name: string | null; email: string | null }
}

function toDTO(b: BloqueoRow): BloqueoDTO {
  return {
    id: b.id, doctorId: b.doctorId, doctor: b.doctor.name ?? b.doctor.email,
    inicio: b.inicio.toISOString(), fin: b.fin.toISOString(),
    motivo: b.motivo, createdByName: b.createdByName,
  }
}

const INCLUDE = { doctor: { select: { name: true, email: true } } } as const

export async function listarBloqueos(actor: JwtPayload, filtros: { from?: string; to?: string; doctorId?: string }): Promise<BloqueoDTO[]> {
  const clinicaId = actor.clinicaId!
  const isAdmin = actor.role === 'admin'
  const where: Record<string, unknown> = { clinicaId }
  if (filtros.doctorId) where.doctorId = filtros.doctorId
  else if (!isAdmin) where.doctorId = actor.sub

  if (filtros.from && filtros.to) {
    const from = new Date(filtros.from), to = new Date(filtros.to)
    where.OR = [
      { inicio: { gte: from, lte: to } },
      { fin: { gte: from, lte: to } },
      { AND: [{ inicio: { lte: from } }, { fin: { gte: to } }] },
    ]
  }

  const bloqueos = await prisma.bloqueoAgenda.findMany({ where, include: INCLUDE, orderBy: { inicio: 'asc' } })
  return bloqueos.map(toDTO)
}

export async function crearBloqueo(actor: JwtPayload, input: { doctorId: string; inicio: string; fin: string; motivo?: string }): Promise<BloqueoDTO> {
  const clinicaId = actor.clinicaId!
  if (!input.doctorId) throw badRequest('Doctor requerido')
  const isAdmin = actor.role === 'admin'
  if (!isAdmin && input.doctorId !== actor.sub) throw forbidden('Solo puedes bloquear tu propio horario.')

  const inicio = new Date(input.inicio)
  const fin = new Date(input.fin)
  if (Number.isNaN(inicio.getTime())) throw badRequest('Fecha de inicio inválida.')
  if (Number.isNaN(fin.getTime())) throw badRequest('Fecha de fin inválida.')
  if (fin <= inicio) throw badRequest('La fecha de fin debe ser posterior al inicio.')

  const doctor = await prisma.user.findFirst({ where: { id: input.doctorId, clinicaId }, select: { id: true } })
  if (!doctor) throw notFound('Doctor no encontrado.')

  const motivo = input.motivo?.trim() || null
  const bloqueo = await prisma.bloqueoAgenda.create({
    data: { clinicaId, doctorId: input.doctorId, inicio, fin, motivo, createdById: actor.sub, createdByName: actorName(actor) },
    include: INCLUDE,
  })
  return toDTO(bloqueo)
}

export async function actualizarBloqueo(actor: JwtPayload, id: string, body: { inicio?: string; fin?: string; motivo?: string }): Promise<BloqueoDTO> {
  const clinicaId = actor.clinicaId!
  const existing = await prisma.bloqueoAgenda.findFirst({ where: { id, clinicaId }, select: { id: true, doctorId: true } })
  if (!existing) throw notFound('Bloqueo no encontrado')
  if (actor.role !== 'admin' && existing.doctorId !== actor.sub) throw forbidden('No puedes editar bloqueos de otros usuarios.')

  const data: Record<string, unknown> = {}
  if (body.inicio !== undefined) {
    const inicio = new Date(body.inicio)
    if (Number.isNaN(inicio.getTime())) throw badRequest('Fecha de inicio inválida.')
    data.inicio = inicio
  }
  if (body.fin !== undefined) {
    const fin = new Date(body.fin)
    if (Number.isNaN(fin.getTime())) throw badRequest('Fecha de fin inválida.')
    data.fin = fin
  }
  if (body.motivo !== undefined) data.motivo = body.motivo?.trim() || null

  const bloqueo = await prisma.bloqueoAgenda.update({ where: { id }, data, include: INCLUDE })
  return toDTO(bloqueo)
}

export async function eliminarBloqueo(actor: JwtPayload, id: string): Promise<void> {
  const clinicaId = actor.clinicaId!
  const existing = await prisma.bloqueoAgenda.findFirst({ where: { id, clinicaId }, select: { id: true, doctorId: true } })
  if (!existing) throw notFound('Bloqueo no encontrado')
  if (actor.role !== 'admin' && existing.doctorId !== actor.sub) throw forbidden('No puedes eliminar bloqueos de otros usuarios.')
  await prisma.bloqueoAgenda.delete({ where: { id } })
}
