import type { TenantClient } from '@/db/tenant'
import { badRequest, forbidden, notFound } from '@/lib/errors'
import type { JwtPayload } from '@/services/auth.service'

const ESTADOS_LIQ = ['BORRADOR', 'APROBADA', 'PAGADA']
const TIPOS_CONTRATO = ['PORCENTAJE', 'MONTO_FIJO']

async function puedeGestionar(db: TenantClient, actor: JwtPayload): Promise<boolean> {
  if (actor.role === 'admin') return true
  const me = await db.user.findUnique({ where: { id: actor.sub }, select: { puedeGestionarLiquidaciones: true } })
  return Boolean(me?.puedeGestionarLiquidaciones)
}

// ── Contratos ────────────────────────────────────────────────────────────────

export async function listarContratos(db: TenantClient) {
  return db.contrato.findMany({
    include: { doctor: { select: { id: true, name: true, email: true, especialidad: true } } },
    orderBy: { createdAt: 'desc' },
  })
}

export async function crearContrato(db: TenantClient, body: { doctorId: string; tipo: string; porcentaje?: number; montoFijo?: number; descripcion?: string; fechaInicio?: string; fechaFin?: string }) {
  if (!TIPOS_CONTRATO.includes(body.tipo)) throw badRequest(`tipo inválido. Use: ${TIPOS_CONTRATO.join(', ')}`)
  const doctor = await db.user.findUnique({ where: { id: body.doctorId }, select: { id: true } })
  if (!doctor) throw notFound('Doctor no encontrado')
  // Solo un contrato activo por doctor: desactiva los previos.
  await db.contrato.updateMany({ where: { doctorId: body.doctorId, activo: true }, data: { activo: false } })
  return db.contrato.create({
    data: {
      doctorId: body.doctorId, tipo: body.tipo,
      porcentaje: body.porcentaje != null ? Number(body.porcentaje) : null,
      montoFijo: body.montoFijo != null ? Number(body.montoFijo) : null,
      descripcion: body.descripcion || null,
      fechaInicio: body.fechaInicio ? new Date(body.fechaInicio) : new Date(),
      fechaFin: body.fechaFin ? new Date(body.fechaFin) : null,
      activo: true,
    },
    include: { doctor: { select: { id: true, name: true, email: true } } },
  })
}

export async function actualizarContrato(db: TenantClient, id: string, body: Record<string, unknown>) {
  const existing = await db.contrato.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw notFound('Contrato no encontrado')
  const data: Record<string, unknown> = {}
  if (body.tipo !== undefined) {
    if (!TIPOS_CONTRATO.includes(String(body.tipo))) throw badRequest(`tipo inválido. Use: ${TIPOS_CONTRATO.join(', ')}`)
    data.tipo = body.tipo
  }
  if (body.porcentaje !== undefined) {
    if (body.porcentaje === null) data.porcentaje = null
    else { const n = Number(body.porcentaje); if (!Number.isFinite(n) || n < 0 || n > 100) throw badRequest('porcentaje debe estar entre 0 y 100'); data.porcentaje = n }
  }
  if (body.montoFijo !== undefined) {
    if (body.montoFijo === null) data.montoFijo = null
    else { const n = Number(body.montoFijo); if (!Number.isFinite(n) || n < 0) throw badRequest('montoFijo inválido'); data.montoFijo = n }
  }
  if (body.descripcion !== undefined) data.descripcion = body.descripcion ? String(body.descripcion) : null
  if (body.fechaInicio !== undefined) data.fechaInicio = new Date(String(body.fechaInicio))
  if (body.fechaFin !== undefined) data.fechaFin = body.fechaFin ? new Date(String(body.fechaFin)) : null
  if (body.activo !== undefined) data.activo = Boolean(body.activo)
  return db.contrato.update({ where: { id }, data })
}

export async function eliminarContrato(db: TenantClient, id: string) {
  const existing = await db.contrato.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw notFound('Contrato no encontrado')
  await db.contrato.update({ where: { id }, data: { activo: false } })
}

// ── Liquidaciones ────────────────────────────────────────────────────────────

const LIQ_LIST_INCLUDE = {
  doctor: { select: { id: true, name: true, email: true, especialidad: true } },
  contrato: true,
  _count: { select: { items: true } },
} as const

export async function listarLiquidaciones(db: TenantClient, actor: JwtPayload) {
  const canManage = await puedeGestionar(db, actor)
  const where = canManage ? {} : { doctorId: actor.sub }
  return db.liquidacion.findMany({ where, include: LIQ_LIST_INCLUDE, orderBy: [{ periodo: 'desc' }, { createdAt: 'desc' }] })
}

export async function obtenerLiquidacion(db: TenantClient, actor: JwtPayload, id: string) {
  const canManage = await puedeGestionar(db, actor)
  const liq = await db.liquidacion.findFirst({
    where: canManage ? { id } : { id, doctorId: actor.sub },
    include: {
      doctor: { select: { id: true, name: true, email: true, rut: true, especialidad: true } },
      contrato: true,
      items: { orderBy: { fechaCompletado: 'asc' } },
    },
  })
  if (!liq) throw notFound('Liquidación no encontrada')
  return liq
}

export async function crearLiquidacion(db: TenantClient, actor: JwtPayload, body: { doctorId: string; periodo: string }) {
  if (!(await puedeGestionar(db, actor))) throw forbidden('No tienes permiso para generar liquidaciones.')

  const contrato = await db.contrato.findFirst({ where: { doctorId: body.doctorId, activo: true } })
  if (!contrato) throw badRequest('El doctor no tiene contrato activo')

  const [year, month] = body.periodo.split('-').map(Number)
  if (!year || !month) throw badRequest('periodo inválido (use YYYY-MM)')
  const inicio = new Date(year, month - 1, 1)
  const fin = new Date(year, month, 0, 23, 59, 59)

  const tratamientos = await db.tratamiento.findMany({
    where: { doctorId: body.doctorId, estado: 'COMPLETADO', fechaCompletado: { gte: inicio, lte: fin }, liquidacionItems: { none: {} } },
    include: { prestacion: true, ficha: { include: { paciente: true } } },
  })
  if (tratamientos.length === 0) throw badRequest('No hay tratamientos completados en este período sin liquidar')

  const items = tratamientos.map((t) => {
    const monto = contrato.tipo === 'PORCENTAJE' ? t.precio * (contrato.porcentaje! / 100) : contrato.montoFijo!
    return {
      tratamientoId: t.id, prestacionNombre: t.prestacion.nombre,
      pacienteNombre: `${t.ficha.paciente.nombre} ${t.ficha.paciente.apellido}`,
      diente: t.diente ? `Pieza ${t.diente}` : (t.cara ?? null),
      fechaCompletado: t.fechaCompletado!, precioTratamiento: t.precio,
      porcentajeAplicado: contrato.tipo === 'PORCENTAJE' ? contrato.porcentaje : null,
      montoFijoAplicado: contrato.tipo === 'MONTO_FIJO' ? contrato.montoFijo : null,
      montoLiquidado: monto,
    }
  })
  const totalBruto = tratamientos.reduce((s, t) => s + t.precio, 0)
  const totalLiquidado = items.reduce((s, i) => s + i.montoLiquidado, 0)

  return db.liquidacion.create({
    data: { doctorId: body.doctorId, contratoId: contrato.id, periodo: body.periodo, totalBruto, totalLiquidado, items: { create: items } },
    include: { ...LIQ_LIST_INCLUDE, items: true },
  })
}

export async function actualizarLiquidacion(db: TenantClient, actor: JwtPayload, id: string, body: Record<string, unknown>) {
  if (!(await puedeGestionar(db, actor))) throw forbidden('No tienes permiso para gestionar liquidaciones.')
  const existing = await db.liquidacion.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw notFound('Liquidación no encontrada')

  const data: Record<string, unknown> = {}
  if (body.estado !== undefined) {
    if (!ESTADOS_LIQ.includes(String(body.estado))) throw badRequest(`estado inválido. Use: ${ESTADOS_LIQ.join(', ')}`)
    data.estado = body.estado
  }
  if (body.notas !== undefined) data.notas = body.notas ? String(body.notas) : null
  if (body.fechaPago !== undefined) data.fechaPago = body.fechaPago ? new Date(String(body.fechaPago)) : null
  return db.liquidacion.update({ where: { id }, data, include: LIQ_LIST_INCLUDE })
}
