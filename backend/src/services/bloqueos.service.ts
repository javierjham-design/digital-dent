import type { TenantClient } from '@/db/tenant'
import { badRequest, forbidden, notFound } from '@/lib/errors'
import { actorName, type JwtPayload } from '@/services/auth.service'
import type { BloqueoDTO } from '@shared/types'
import { pushBloqueo, deleteBloqueoInGoogle } from '@/lib/google-sync'

// La sincronización con Google es best-effort (fire-and-forget): nunca debe
// hacer fallar la operación primaria sobre la base de la clínica.

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

export async function listarBloqueos(db: TenantClient, actor: JwtPayload, filtros: { from?: string; to?: string; doctorId?: string }): Promise<BloqueoDTO[]> {
  const isAdmin = actor.role === 'admin'
  const where: Record<string, unknown> = {}
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

  const bloqueos = await db.bloqueoAgenda.findMany({ where, include: INCLUDE, orderBy: { inicio: 'asc' } })
  return bloqueos.map(toDTO)
}

export async function crearBloqueo(db: TenantClient, actor: JwtPayload, input: { doctorId: string; inicio: string; fin: string; motivo?: string }): Promise<BloqueoDTO> {
  if (!input.doctorId) throw badRequest('Doctor requerido')
  const isAdmin = actor.role === 'admin'
  if (!isAdmin && input.doctorId !== actor.sub) throw forbidden('Solo puedes bloquear tu propio horario.')

  const inicio = new Date(input.inicio)
  const fin = new Date(input.fin)
  if (Number.isNaN(inicio.getTime())) throw badRequest('Fecha de inicio inválida.')
  if (Number.isNaN(fin.getTime())) throw badRequest('Fecha de fin inválida.')
  if (fin <= inicio) throw badRequest('La fecha de fin debe ser posterior al inicio.')

  const doctor = await db.user.findUnique({ where: { id: input.doctorId }, select: { id: true } })
  if (!doctor) throw notFound('Doctor no encontrado.')

  const motivo = input.motivo?.trim() || null
  const bloqueo = await db.bloqueoAgenda.create({
    data: { doctorId: input.doctorId, inicio, fin, motivo, createdById: actor.sub, createdByName: actorName(actor) },
    include: INCLUDE,
  })
  void pushBloqueo(db, bloqueo.id).catch(() => {})
  return toDTO(bloqueo)
}

export async function actualizarBloqueo(db: TenantClient, actor: JwtPayload, id: string, body: { inicio?: string; fin?: string; motivo?: string }): Promise<BloqueoDTO> {
  const existing = await db.bloqueoAgenda.findUnique({ where: { id }, select: { id: true, doctorId: true } })
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

  const bloqueo = await db.bloqueoAgenda.update({ where: { id }, data, include: INCLUDE })
  void pushBloqueo(db, bloqueo.id).catch(() => {})
  return toDTO(bloqueo)
}

export async function eliminarBloqueo(db: TenantClient, actor: JwtPayload, id: string): Promise<void> {
  const existing = await db.bloqueoAgenda.findUnique({ where: { id }, select: { id: true, doctorId: true } })
  if (!existing) throw notFound('Bloqueo no encontrado')
  if (actor.role !== 'admin' && existing.doctorId !== actor.sub) throw forbidden('No puedes eliminar bloqueos de otros usuarios.')
  // Borramos el evento en Google ANTES de eliminar la fila (necesita su googleEventId).
  await deleteBloqueoInGoogle(db, id).catch(() => {})
  await db.bloqueoAgenda.delete({ where: { id } })
}
