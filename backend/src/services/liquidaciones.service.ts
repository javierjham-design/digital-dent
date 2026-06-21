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
//
//  Modelo "saldo corriente" (estilo Dentalink):
//   - Una acción liquidable = Tratamiento COMPLETADO aún no incluido en una
//     liquidación finalizada (sin LiquidacionItem).
//   - Solo se PAGAN las acciones completamente pagadas por el paciente (verde).
//     Las evolucionadas pero impagas se muestran en rojo y NO suman a "A pagar".
//   - Pago por acción (confirmado con el cliente):
//       PORCENTAJE:  (montoPagado × %) − comisión del medio de pago
//       MONTO_FIJO:  montoFijo − comisión proporcional
//     La comisión del medio de pago es proporcional al CobroItem dentro del Cobro.
//   - "Finalizar" toma una foto de las acciones PAGADAS en una Liquidacion y las
//     marca como liquidadas (dejan de aparecer en la activa). Las impagas quedan.

const LIQ_LIST_INCLUDE = {
  doctor: { select: { id: true, name: true, email: true, especialidad: true } },
  contrato: true,
  _count: { select: { items: true } },
} as const

const TRAT_ACTIVA_INCLUDE = {
  prestacion: { select: { nombre: true } },
  ficha: { select: { paciente: { select: { nombre: true, apellido: true } } } },
  cobroItems: {
    select: {
      monto: true,
      cobro: { select: { monto: true, comisionMonto: true, estado: true, anulado: true, medioPago: { select: { nombre: true } } } },
    },
  },
} as const

type ContratoCalc = { tipo: string; porcentaje: number | null; montoFijo: number | null }

// Cálculo del pago de UNA acción a partir de sus cobros y el contrato.
function calcAccion(
  t: { precio: number; descuento: number; cobroItems: { monto: number; cobro: { monto: number; comisionMonto: number | null; estado: string; anulado: boolean; medioPago: { nombre: string } | null } | null }[] },
  contrato: ContratoCalc,
) {
  const precio = Math.max(0, t.precio - (t.descuento ?? 0))
  const pagados = t.cobroItems.filter((ci) => ci.cobro && ci.cobro.estado === 'PAGADO' && !ci.cobro.anulado)
  const montoPagado = pagados.reduce((s, ci) => s + ci.monto, 0)
  // Comisión proporcional: cada CobroItem aporta su parte de la comisión del Cobro.
  const comision = pagados.reduce((s, ci) => {
    const c = ci.cobro!
    const rate = c.monto > 0 ? (c.comisionMonto ?? 0) / c.monto : 0
    return s + ci.monto * rate
  }, 0)
  const medios = [...new Set(pagados.map((ci) => ci.cobro!.medioPago?.nombre).filter((x): x is string => Boolean(x)))]
  const pagada = montoPagado >= precio - 0.5 // completamente pagada (tolerancia de redondeo)
  const base = pagada ? montoPagado : precio
  const bruto = contrato.tipo === 'PORCENTAJE' ? base * ((contrato.porcentaje ?? 0) / 100) : (contrato.montoFijo ?? 0)
  // La comisión solo se descuenta cuando ya está pagada (si no, aún no hay comisión real).
  const total = Math.max(0, Math.round(pagada ? bruto - comision : bruto))
  return { precio: Math.round(precio), montoPagado: Math.round(montoPagado), comision: Math.round(comision), medios, pagada, total }
}

async function accionesActivas(db: TenantClient, doctorId: string, contrato: ContratoCalc) {
  const trats = await db.tratamiento.findMany({
    where: { doctorId, estado: 'COMPLETADO', liquidacionItems: { none: {} } },
    include: TRAT_ACTIVA_INCLUDE,
    orderBy: { fechaCompletado: 'desc' },
  })
  return trats.map((t) => {
    const c = calcAccion(t, contrato)
    return {
      tratamientoId: t.id,
      pacienteNombre: `${t.ficha.paciente.nombre} ${t.ficha.paciente.apellido}`,
      accion: t.prestacion.nombre,
      pieza: t.diente ? `Pieza ${t.diente}` : (t.cara ?? null),
      fecha: (t.fechaCompletado ?? t.fecha).toISOString(),
      monto: c.precio,
      montoPagado: c.montoPagado,
      comision: c.comision,
      medioPago: c.medios.join(', ') || '—',
      total: c.total,
      pagada: c.pagada,
    }
  })
}

// Lista de liquidaciones ACTIVAS (resumen por profesional con contrato vigente).
export async function liquidacionesActivas(db: TenantClient, actor: JwtPayload) {
  const canManage = await puedeGestionar(db, actor)
  const contratos = await db.contrato.findMany({
    where: { activo: true, ...(canManage ? {} : { doctorId: actor.sub }) },
    include: { doctor: { select: { id: true, name: true, email: true, especialidad: true } } },
  })
  const out = []
  for (const c of contratos) {
    if (c.porcentaje == null && c.montoFijo == null) continue
    const items = await accionesActivas(db, c.doctorId, c)
    out.push({
      doctorId: c.doctorId,
      doctor: c.doctor.name ?? c.doctor.email ?? '—',
      especialidad: c.doctor.especialidad,
      acciones: items.length,
      pendientes: items.filter((i) => !i.pagada).length,
      realizado: items.reduce((s, i) => s + i.total, 0),
      aPagar: items.filter((i) => i.pagada).reduce((s, i) => s + i.total, 0),
    })
  }
  return out
}

// Detalle de la liquidación activa de UN profesional (acciones + totales).
export async function liquidacionActiva(db: TenantClient, actor: JwtPayload, doctorId: string) {
  if (!(await puedeGestionar(db, actor)) && actor.sub !== doctorId) throw forbidden('No puedes ver la liquidación de otro profesional.')
  const doctor = await db.user.findUnique({ where: { id: doctorId }, select: { id: true, name: true, email: true, rut: true, especialidad: true } })
  if (!doctor) throw notFound('Profesional no encontrado')
  const contrato = await db.contrato.findFirst({ where: { doctorId, activo: true } })
  if (!contrato || (contrato.porcentaje == null && contrato.montoFijo == null)) {
    return { doctor, contrato: null, items: [], realizado: 0, aPagar: 0 }
  }
  const items = await accionesActivas(db, doctorId, contrato)
  return {
    doctor,
    contrato: { tipo: contrato.tipo, porcentaje: contrato.porcentaje, montoFijo: contrato.montoFijo },
    items,
    realizado: items.reduce((s, i) => s + i.total, 0),
    aPagar: items.filter((i) => i.pagada).reduce((s, i) => s + i.total, 0),
  }
}

// Finaliza: toma una foto de las acciones PAGADAS y las marca como liquidadas.
export async function finalizarLiquidacion(db: TenantClient, actor: JwtPayload, doctorId: string) {
  if (!(await puedeGestionar(db, actor))) throw forbidden('No tienes permiso para finalizar liquidaciones.')
  const contrato = await db.contrato.findFirst({ where: { doctorId, activo: true } })
  if (!contrato) throw badRequest('El profesional no tiene contrato activo')

  const trats = await db.tratamiento.findMany({
    where: { doctorId, estado: 'COMPLETADO', liquidacionItems: { none: {} } },
    include: TRAT_ACTIVA_INCLUDE,
  })

  const itemsData = trats.flatMap((t) => {
    const c = calcAccion(t, contrato)
    if (!c.pagada) return [] // solo se finalizan las acciones completamente pagadas
    return [{
      tratamientoId: t.id,
      prestacionNombre: t.prestacion.nombre,
      pacienteNombre: `${t.ficha.paciente.nombre} ${t.ficha.paciente.apellido}`,
      diente: t.diente ? `Pieza ${t.diente}` : (t.cara ?? null),
      fechaCompletado: t.fechaCompletado ?? t.fecha,
      precioTratamiento: t.precio,
      porcentajeAplicado: contrato.tipo === 'PORCENTAJE' ? contrato.porcentaje : null,
      montoFijoAplicado: contrato.tipo === 'MONTO_FIJO' ? contrato.montoFijo : null,
      montoPagado: c.montoPagado,
      comisionAplicada: c.comision,
      medioPago: c.medios.join(', ') || null,
      montoLiquidado: c.total,
    }]
  })
  if (itemsData.length === 0) throw badRequest('No hay acciones pagadas pendientes de liquidar')

  const totalBruto = itemsData.reduce((s, i) => s + i.montoPagado, 0)
  const totalLiquidado = itemsData.reduce((s, i) => s + i.montoLiquidado, 0)
  return db.liquidacion.create({
    data: {
      doctorId, contratoId: contrato.id, periodo: new Date().toISOString().slice(0, 10),
      estado: 'APROBADA', totalBruto, totalLiquidado, items: { create: itemsData },
    },
    include: { ...LIQ_LIST_INCLUDE, items: true },
  })
}

// ── Liquidaciones FINALIZADAS (snapshots guardados) ───────────────────────────

export async function listarLiquidaciones(db: TenantClient, actor: JwtPayload) {
  const canManage = await puedeGestionar(db, actor)
  const where = canManage ? {} : { doctorId: actor.sub }
  return db.liquidacion.findMany({ where, include: LIQ_LIST_INCLUDE, orderBy: [{ createdAt: 'desc' }] })
}

export async function obtenerLiquidacion(db: TenantClient, actor: JwtPayload, id: string) {
  const canManage = await puedeGestionar(db, actor)
  const liq = await db.liquidacion.findFirst({
    where: canManage ? { id } : { id, doctorId: actor.sub },
    include: {
      doctor: { select: { id: true, name: true, email: true, rut: true, especialidad: true } },
      contrato: true,
      items: { orderBy: { fechaCompletado: 'asc' } },
      adjuntos: { select: { id: true, tipo: true, nombre: true, mime: true, size: true, subidoPorNombre: true, createdAt: true }, orderBy: { createdAt: 'desc' } },
    },
  })
  if (!liq) throw notFound('Liquidación no encontrada')
  return liq
}

// ── Adjuntos de liquidación (factura / comprobante) — guardados como bytes ─────

const TIPOS_ADJUNTO = ['FACTURA', 'COMPROBANTE']

// Verifica que la liquidación exista y que el actor pueda accederla (dueño o gestor).
async function liqAccesible(db: TenantClient, actor: JwtPayload, liqId: string) {
  const liq = await db.liquidacion.findUnique({ where: { id: liqId }, select: { id: true, doctorId: true } })
  if (!liq) throw notFound('Liquidación no encontrada')
  if (!(await puedeGestionar(db, actor)) && liq.doctorId !== actor.sub) throw forbidden('No puedes acceder a esta liquidación.')
  return liq
}

const ADJ_META = { id: true, tipo: true, nombre: true, mime: true, size: true, subidoPorNombre: true, createdAt: true } as const

export async function listarAdjuntos(db: TenantClient, actor: JwtPayload, liqId: string) {
  await liqAccesible(db, actor, liqId)
  return db.liquidacionAdjunto.findMany({ where: { liquidacionId: liqId }, select: ADJ_META, orderBy: { createdAt: 'desc' } })
}

export async function subirAdjunto(db: TenantClient, actor: JwtPayload, liqId: string, file: { tipo: string; nombre: string; mime: string; buffer: Buffer }) {
  await liqAccesible(db, actor, liqId)
  if (!TIPOS_ADJUNTO.includes(file.tipo)) throw badRequest('tipo inválido (FACTURA | COMPROBANTE)')
  return db.liquidacionAdjunto.create({
    data: {
      liquidacionId: liqId, tipo: file.tipo, nombre: file.nombre.slice(0, 200), mime: file.mime, size: file.buffer.length,
      data: file.buffer, subidoPorId: actor.sub, subidoPorNombre: actor.name ?? actor.email ?? null,
    },
    select: ADJ_META,
  })
}

export async function descargarAdjunto(db: TenantClient, actor: JwtPayload, liqId: string, adjId: string) {
  await liqAccesible(db, actor, liqId)
  const adj = await db.liquidacionAdjunto.findFirst({ where: { id: adjId, liquidacionId: liqId } })
  if (!adj) throw notFound('Adjunto no encontrado')
  return adj
}

export async function eliminarAdjunto(db: TenantClient, actor: JwtPayload, liqId: string, adjId: string) {
  await liqAccesible(db, actor, liqId)
  const r = await db.liquidacionAdjunto.deleteMany({ where: { id: adjId, liquidacionId: liqId } })
  if (r.count === 0) throw notFound('Adjunto no encontrado')
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
