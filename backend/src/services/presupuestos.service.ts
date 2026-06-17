import { prisma } from '@/lib/prisma'
import { badRequest, notFound } from '@/lib/errors'

const ESTADOS = ['PENDIENTE', 'APROBADO', 'RECHAZADO', 'COMPLETADO']

export async function listarPresupuestos(clinicaId: string, pacienteId?: string) {
  return prisma.presupuesto.findMany({
    where: { clinicaId, ...(pacienteId ? { pacienteId } : {}) },
    orderBy: { numero: 'desc' },
    include: { _count: { select: { items: true } } },
  })
}

export async function obtenerPresupuesto(clinicaId: string, id: string) {
  const p = await prisma.presupuesto.findFirst({
    where: { id, clinicaId },
    include: {
      paciente: { select: { id: true, nombre: true, apellido: true, rut: true } },
      items: { include: { prestacion: { select: { id: true, nombre: true, categoria: true } } } },
    },
  })
  if (!p) throw notFound('Presupuesto no encontrado')
  return p
}

export interface ItemPresupuestoInput {
  prestacionId: string; cantidad: number; precioUnitario: number; descuento?: number; subtotal: number
}

export async function crearPresupuesto(clinicaId: string, body: { pacienteId: string; total: number; items: ItemPresupuestoInput[] }) {
  const paciente = await prisma.paciente.findFirst({ where: { id: body.pacienteId, clinicaId }, select: { id: true } })
  if (!paciente) throw notFound('Paciente no encontrado')
  if (!Array.isArray(body.items) || body.items.length === 0) throw badRequest('Agrega al menos un ítem al presupuesto')

  const last = await prisma.presupuesto.findFirst({ where: { clinicaId }, orderBy: { numero: 'desc' }, select: { numero: true } })
  const numero = (last?.numero ?? 0) + 1

  return prisma.presupuesto.create({
    data: {
      clinicaId, pacienteId: body.pacienteId, numero, total: Number(body.total),
      items: {
        create: body.items.map((it) => ({
          prestacionId: it.prestacionId,
          cantidad: it.cantidad,
          precioUnitario: it.precioUnitario,
          descuento: it.descuento ?? 0,
          subtotal: it.subtotal,
        })),
      },
    },
    include: { items: true },
  })
}

export async function actualizarPresupuesto(clinicaId: string, id: string, body: Record<string, unknown>) {
  const existing = await prisma.presupuesto.findFirst({ where: { id, clinicaId }, select: { id: true } })
  if (!existing) throw notFound('Presupuesto no encontrado')

  const data: Record<string, unknown> = {}
  if (body.estado !== undefined) {
    if (!ESTADOS.includes(String(body.estado))) throw badRequest(`estado inválido. Use: ${ESTADOS.join(', ')}`)
    data.estado = body.estado
  }
  if (body.notas !== undefined) data.notas = body.notas ? String(body.notas) : null
  if (body.vigencia !== undefined) data.vigencia = body.vigencia ? new Date(String(body.vigencia)) : null
  if (body.total !== undefined) {
    const n = Number(body.total)
    if (!Number.isFinite(n) || n < 0) throw badRequest('total inválido')
    data.total = n
  }
  return prisma.presupuesto.update({ where: { id }, data })
}
