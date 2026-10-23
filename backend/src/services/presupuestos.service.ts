import type { TenantClient } from '@/db/tenant'
import { badRequest, notFound } from '@/lib/errors'
import { siguienteNumero } from '@/lib/correlativo'

const ESTADOS = ['PENDIENTE', 'APROBADO', 'RECHAZADO', 'COMPLETADO']

export async function listarPresupuestos(db: TenantClient, pacienteId?: string) {
  return db.presupuesto.findMany({
    where: { ...(pacienteId ? { pacienteId } : {}) },
    orderBy: { numero: 'desc' },
    include: { _count: { select: { items: true } } },
  })
}

export async function obtenerPresupuesto(db: TenantClient, id: string) {
  const p = await db.presupuesto.findUnique({
    where: { id },
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

export async function crearPresupuesto(db: TenantClient, body: { pacienteId: string; total: number; items: ItemPresupuestoInput[] }) {
  const paciente = await db.paciente.findUnique({ where: { id: body.pacienteId }, select: { id: true } })
  if (!paciente) throw notFound('Paciente no encontrado')
  if (!Array.isArray(body.items) || body.items.length === 0) throw badRequest('Agrega al menos un ítem al presupuesto')

  // El documento es informativo (no alimenta cobros), pero sale con la identidad de la
  // clínica: los subtotales y el total se RECALCULAN en el server, no se confía en el cliente.
  const items = body.items.map((it) => {
    const cantidad = Math.max(1, Math.round(Number(it.cantidad) || 1))
    const precioUnitario = Math.round(Number(it.precioUnitario))
    if (!Number.isFinite(precioUnitario) || precioUnitario < 0) throw badRequest('Precio unitario inválido en un ítem')
    const descuento = Math.max(0, Math.min(100, Number(it.descuento) || 0))
    const subtotal = Math.round(cantidad * precioUnitario * (1 - descuento / 100))
    return { prestacionId: it.prestacionId, cantidad, precioUnitario, descuento, subtotal }
  })
  const total = items.reduce((s, it) => s + it.subtotal, 0)

  // Correlativo dentro de la transacción (advisory lock) para que dos presupuestos
  // simultáneos no obtengan el mismo número (numero es @unique).
  return db.$transaction(async (tx) => {
    const numero = await siguienteNumero(tx, 'presupuesto')
    return tx.presupuesto.create({
      data: { pacienteId: body.pacienteId, numero, total, items: { create: items } },
      include: { items: true },
    })
  })
}

export async function actualizarPresupuesto(db: TenantClient, id: string, body: Record<string, unknown>) {
  const existing = await db.presupuesto.findUnique({ where: { id }, select: { id: true } })
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
  return db.presupuesto.update({ where: { id }, data })
}
