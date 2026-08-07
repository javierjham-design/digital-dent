import type { TenantClient } from '@/db/tenant'
import { badRequest, forbidden, notFound } from '@/lib/errors'
import type { JwtPayload } from '@/services/auth.service'
import { categoriasNoLiquidables } from '@/services/catalogo.service'

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

export async function crearContrato(db: TenantClient, body: { doctorId: string; tipo: string; porcentaje?: number | null; montoFijo?: number | null; descripcion?: string | null; fechaInicio?: string | null; fechaFin?: string | null }) {
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

// ── Montos fijos por prestación (override del contrato base) ───────────────────
// Configurados por profesional. Al liquidar un tratamiento de una prestación con monto
// fijo, se paga min(montoFijo, lo cobrado) − retención (ver calcAccion).

const MF_PRESTACION_SELECT = { id: true, nombre: true, precio: true, categoria: true } as const

export async function listarMontosFijos(db: TenantClient, actor: JwtPayload, doctorId: string) {
  if (!(await puedeGestionar(db, actor)) && actor.sub !== doctorId) throw forbidden('No puedes ver los montos fijos de otro profesional.')
  return db.montoFijoPrestacion.findMany({
    where: { doctorId, activo: true },
    include: { prestacion: { select: MF_PRESTACION_SELECT } },
    orderBy: { prestacion: { nombre: 'asc' } },
  })
}

export async function crearMontoFijo(db: TenantClient, actor: JwtPayload, body: { doctorId: string; prestacionId: string; montoFijo: number }) {
  if (!(await puedeGestionar(db, actor))) throw forbidden('No tienes permiso para gestionar liquidaciones.')
  const monto = Number(body.montoFijo)
  if (!Number.isFinite(monto) || monto < 0) throw badRequest('montoFijo inválido')
  const doctor = await db.user.findUnique({ where: { id: body.doctorId }, select: { id: true } })
  if (!doctor) throw notFound('Profesional no encontrado')
  const prestacion = await db.prestacion.findUnique({ where: { id: body.prestacionId }, select: { id: true } })
  if (!prestacion) throw notFound('Prestación no encontrada')
  // Upsert por (doctor, prestación): si ya existía, actualiza el monto y lo reactiva.
  return db.montoFijoPrestacion.upsert({
    where: { doctorId_prestacionId: { doctorId: body.doctorId, prestacionId: body.prestacionId } },
    create: { doctorId: body.doctorId, prestacionId: body.prestacionId, montoFijo: monto, activo: true },
    update: { montoFijo: monto, activo: true },
    include: { prestacion: { select: MF_PRESTACION_SELECT } },
  })
}

export async function eliminarMontoFijo(db: TenantClient, actor: JwtPayload, id: string) {
  if (!(await puedeGestionar(db, actor))) throw forbidden('No tienes permiso para gestionar liquidaciones.')
  const existing = await db.montoFijoPrestacion.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw notFound('Monto fijo no encontrado')
  await db.montoFijoPrestacion.delete({ where: { id } })
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
  prestacion: { select: { nombre: true, categoria: true } },
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
// `montosFijos` mapea prestacionId → monto fijo configurado para ESTE profesional
// (capa de override): si la prestación de la acción tiene uno, manda sobre el contrato base.
function calcAccion(
  t: { prestacionId: string; precio: number; descuento: number; cobroItems: { monto: number; cobro: { monto: number; comisionMonto: number | null; estado: string; anulado: boolean; medioPago: { nombre: string } | null } | null }[] },
  contrato: ContratoCalc,
  montosFijos: Map<string, number>,
) {
  // El descuento se guarda como porcentaje (0–100), igual que en el plan.
  const precio = Math.max(0, Math.round(t.precio * (1 - (t.descuento ?? 0) / 100)))
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
  // "Disponible" (máximo que se puede pagar por esta acción): lo cobrado si ya está
  // pagada; si aún no, el precio (potencial).
  const disponible = pagada ? montoPagado : precio

  const overrideFijo = montosFijos.get(t.prestacionId)
  let bruto: number
  let origenCalculo: 'PORCENTAJE' | 'MONTO_FIJO' | 'MONTO_FIJO_PRESTACION'
  if (overrideFijo != null) {
    // Monto fijo por prestación: se paga el fijo, PERO nunca más que lo disponible. Si lo
    // cobrado es menor al fijo, se otorga el máximo disponible (lo cobrado). La retención
    // se descuenta abajo (igual que los otros contratos), sólo cuando ya está pagada.
    origenCalculo = 'MONTO_FIJO_PRESTACION'
    bruto = Math.min(overrideFijo, disponible)
  } else if (contrato.tipo === 'PORCENTAJE') {
    origenCalculo = 'PORCENTAJE'
    bruto = disponible * ((contrato.porcentaje ?? 0) / 100)
  } else {
    origenCalculo = 'MONTO_FIJO'
    bruto = contrato.montoFijo ?? 0
  }
  // La comisión solo se descuenta cuando ya está pagada (si no, aún no hay comisión real).
  const total = Math.max(0, Math.round(pagada ? bruto - comision : bruto))
  return {
    precio: Math.round(precio), montoPagado: Math.round(montoPagado), comision: Math.round(comision),
    medios, pagada, total, origenCalculo, montoFijoPrestacion: overrideFijo ?? null,
  }
}

// Montos fijos por prestación configurados para un profesional (prestacionId → monto).
async function montosFijosDeDoctor(db: TenantClient, doctorId: string): Promise<Map<string, number>> {
  const rows = await db.montoFijoPrestacion.findMany({ where: { doctorId, activo: true }, select: { prestacionId: true, montoFijo: true } })
  return new Map(rows.map((r) => [r.prestacionId, r.montoFijo]))
}

async function accionesActivas(db: TenantClient, doctorId: string, contrato: ContratoCalc) {
  const noLiq = await categoriasNoLiquidables(db)
  const montosFijos = await montosFijosDeDoctor(db, doctorId)
  const trats = (await db.tratamiento.findMany({
    where: { doctorId, estado: 'COMPLETADO', liquidacionItems: { none: {} } },
    include: TRAT_ACTIVA_INCLUDE,
    orderBy: { fechaCompletado: 'desc' },
  })).filter((t) => !(t.prestacion.categoria && noLiq.has(t.prestacion.categoria))) // excluye laboratorios/insumos no liquidables
  return trats.map((t) => {
    const c = calcAccion(t, contrato, montosFijos)
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
      origenCalculo: c.origenCalculo,
      montoFijoPrestacion: c.montoFijoPrestacion,
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

  const noLiq = await categoriasNoLiquidables(db)
  const montosFijos = await montosFijosDeDoctor(db, doctorId)
  const trats = (await db.tratamiento.findMany({
    where: { doctorId, estado: 'COMPLETADO', liquidacionItems: { none: {} } },
    include: TRAT_ACTIVA_INCLUDE,
  })).filter((t) => !(t.prestacion.categoria && noLiq.has(t.prestacion.categoria)))

  const itemsData = trats.flatMap((t) => {
    const c = calcAccion(t, contrato, montosFijos)
    if (!c.pagada) return [] // solo se finalizan las acciones completamente pagadas
    return [{
      tratamientoId: t.id,
      prestacionNombre: t.prestacion.nombre,
      pacienteNombre: `${t.ficha.paciente.nombre} ${t.ficha.paciente.apellido}`,
      diente: t.diente ? `Pieza ${t.diente}` : (t.cara ?? null),
      fechaCompletado: t.fechaCompletado ?? t.fecha,
      precioTratamiento: t.precio,
      // El monto fijo por prestación (override) manda sobre el contrato base cuando aplica.
      porcentajeAplicado: c.origenCalculo === 'PORCENTAJE' ? contrato.porcentaje : null,
      montoFijoAplicado: c.origenCalculo === 'MONTO_FIJO_PRESTACION' ? c.montoFijoPrestacion
        : (c.origenCalculo === 'MONTO_FIJO' ? contrato.montoFijo : null),
      origenCalculo: c.origenCalculo,
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
