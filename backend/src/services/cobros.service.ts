import type { TenantClient } from '@/db/tenant'
import { badRequest, conflict, forbidden, notFound } from '@/lib/errors'
import { actorName, type JwtPayload } from '@/services/auth.service'
import { getSesionAbierta } from '@/lib/caja'
import { audit } from '@/lib/audit'

const ESTADOS = ['PENDIENTE', 'PAGADO', 'PARCIAL', 'ANULADO']
const fmtMoney = (n: number) => '$' + new Intl.NumberFormat('es-CL').format(Math.round(n))

const COBRO_INCLUDE = {
  paciente: true,
  medioPago: true,
  reciboUsuario: { select: { id: true, name: true, email: true } },
  items: { include: { tratamiento: { include: { prestacion: true } } } },
} as const

export async function listarCobros(db: TenantClient, pacienteId?: string) {
  return db.cobro.findMany({
    where: pacienteId ? { pacienteId } : undefined,
    include: COBRO_INCLUDE,
    orderBy: { createdAt: 'desc' },
  })
}

// Pagos de un paciente para el Historial de su ficha (medio, monto, fecha/hora,
// quién lo recibió). Ordenados por fecha de pago descendente.
export async function listarCobrosPaciente(db: TenantClient, pacienteId: string) {
  if (!pacienteId) throw badRequest('Falta pacienteId')
  return db.cobro.findMany({
    where: { pacienteId },
    include: COBRO_INCLUDE,
    orderBy: [{ fechaPago: 'desc' }, { createdAt: 'desc' }],
  })
}

export async function obtenerCobro(db: TenantClient, id: string) {
  const cobro = await db.cobro.findUnique({ where: { id }, include: COBRO_INCLUDE })
  if (!cobro) throw notFound('Cobro no encontrado')
  return cobro
}

export interface CrearCobroInput {
  pacienteId: string; cajaId: string; medioPagoId?: string; reciboUsuarioId?: string
  fechaPago?: string; notas?: string
  items: { tratamientoId?: string; planId?: string; descripcion: string; monto: number }[]
}

export async function crearCobro(db: TenantClient, actor: JwtPayload, input: CrearCobroInput) {
  const me = await db.user.findUnique({ where: { id: actor.sub }, select: { role: true, puedeRecibirPagos: true } })
  if (!(me?.role === 'admin' || me?.puedeRecibirPagos)) throw forbidden('No tienes permiso para recibir pagos.')

  const paciente = await db.paciente.findUnique({ where: { id: input.pacienteId }, select: { id: true, nombre: true, apellido: true } })
  if (!paciente) throw notFound('Paciente no encontrado')

  if (!input.cajaId) throw badRequest('Debes seleccionar una caja.')
  const caja = await db.caja.findFirst({ where: { id: input.cajaId, activo: true }, include: { usuarios: { select: { userId: true } } } })
  if (!caja) throw notFound('Caja no encontrada')
  if (me?.role !== 'admin' && !caja.usuarios.some((cu) => cu.userId === actor.sub)) throw forbidden('No tienes acceso a esta caja.')

  const items = input.items ?? []
  if (items.length === 0) throw badRequest('Agrega al menos un item.')
  const monto = items.reduce((s, i) => s + Number(i.monto), 0)
  if (monto <= 0) throw badRequest('El monto debe ser mayor a 0.')

  // Regla de negocio: TODO pago debe quedar asociado a un plan de tratamiento,
  // ya sea pagando acciones del plan (tratamientoId) o como abono al plan (planId).
  const tratIds = [...new Set(items.map((i) => i.tratamientoId).filter(Boolean) as string[])]
  const planIds = [...new Set(items.map((i) => i.planId).filter(Boolean) as string[])]

  if (tratIds.length > 0) {
    const trats = await db.tratamiento.findMany({
      where: { id: { in: tratIds } },
      select: { id: true, planId: true, ficha: { select: { pacienteId: true } } },
    })
    const tratMap = new Map(trats.map((t) => [t.id, t]))
    for (const tid of tratIds) {
      const t = tratMap.get(tid)
      if (!t) throw notFound('Acción de tratamiento no encontrada')
      if (t.ficha.pacienteId !== input.pacienteId) throw badRequest('La acción no pertenece a este paciente.')
      if (!t.planId) throw badRequest('Cada pago debe estar asociado a un plan de tratamiento. Hay una acción que no pertenece a ningún plan.')
    }
  }
  if (planIds.length > 0) {
    const planes = await db.planTratamiento.findMany({ where: { id: { in: planIds } }, select: { id: true, pacienteId: true } })
    const planMap = new Map(planes.map((p) => [p.id, p]))
    for (const pid of planIds) {
      const p = planMap.get(pid)
      if (!p) throw notFound('Plan de tratamiento no encontrado')
      if (p.pacienteId !== input.pacienteId) throw badRequest('El plan no pertenece a este paciente.')
    }
  }
  for (const it of items) {
    if (!it.tratamientoId && !it.planId) {
      throw badRequest('Cada pago debe asociarse a un plan de tratamiento (paga acciones del plan o registra un abono al plan).')
    }
  }

  let comisionMonto = 0
  let montoNeto = monto
  let medioNombre = ''
  if (input.medioPagoId) {
    const medio = await db.medioPago.findUnique({ where: { id: input.medioPagoId } })
    if (medio) { comisionMonto = monto * (medio.comision / 100); montoNeto = monto - comisionMonto; medioNombre = medio.nombre }
  }

  const concepto = items.map((i) => i.descripcion).join(', ')
  const last = await db.cobro.findFirst({ orderBy: { numero: 'desc' }, select: { numero: true } })
  const numero = (last?.numero ?? 0) + 1
  const fechaPago = input.fechaPago ? new Date(input.fechaPago) : new Date()

  const sesion = await getSesionAbierta(db, caja.id)
  if (!sesion) throw conflict('La caja seleccionada no tiene una sesión abierta. Abre la caja antes de recibir pagos.')

  const nuevo = await db.$transaction(async (tx) => {
    const creado = await tx.cobro.create({
      data: {
        pacienteId: input.pacienteId, numero, concepto, monto, montoNeto, comisionMonto,
        estado: 'PAGADO', medioPagoId: input.medioPagoId || null, reciboUsuarioId: input.reciboUsuarioId || actor.sub,
        cajaId: caja.id, fechaPago, notas: input.notas || null,
        items: { create: items.map((i) => ({ tratamientoId: i.tratamientoId || null, planId: i.planId || null, descripcion: i.descripcion, monto: Number(i.monto) })) },
      },
      include: COBRO_INCLUDE,
    })
    await tx.movimientoCaja.create({
      data: {
        cajaId: caja.id, sesionCajaId: sesion.id, tipo: 'INGRESO', monto: montoNeto,
        descripcion: `Cobro #${numero} · ${paciente.nombre} ${paciente.apellido}`, categoria: 'COBRO',
        fecha: fechaPago, cobroId: creado.id, userId: actor.sub,
      },
    })
    return creado
  })
  // Queda registrado en el Historial de la ficha del paciente (trazabilidad).
  await audit(db, actor.sub, {
    accion: 'CREAR', entidad: 'Cobro', entidadId: nuevo.id, pacienteId: input.pacienteId,
    resumen: `Recibió un pago #${numero} por ${fmtMoney(monto)}${medioNombre ? ` · ${medioNombre}` : ' · Efectivo'}`,
  })
  return nuevo
}

const CAMPOS_PRIVILEGIADOS = ['monto', 'montoNeto', 'comisionMonto', 'concepto', 'notas', 'fechaPago', 'reciboUsuarioId']

export async function actualizarCobro(db: TenantClient, actor: JwtPayload, id: string, body: Record<string, unknown>) {
  const existing = await db.cobro.findUnique({ where: { id }, select: { id: true, anulado: true } })
  if (!existing) throw notFound('Cobro no encontrado')

  if (CAMPOS_PRIVILEGIADOS.some((k) => body[k] !== undefined)) {
    const me = await db.user.findUnique({ where: { id: actor.sub }, select: { role: true, puedeEditarPagos: true } })
    if (!(me?.role === 'admin' || me?.puedeEditarPagos)) throw forbidden('No tienes permiso para editar pagos.')
    if (existing.anulado) throw badRequest('Cobro anulado: no se puede editar.')
  }

  const data: Record<string, unknown> = {}
  if (body.estado !== undefined) {
    if (!ESTADOS.includes(String(body.estado))) throw badRequest(`estado inválido. Use: ${ESTADOS.join(', ')}`)
    data.estado = body.estado
  }
  if (body.notas !== undefined) data.notas = body.notas ? String(body.notas) : null
  if (body.fechaPago !== undefined) data.fechaPago = body.fechaPago ? new Date(String(body.fechaPago)) : null
  if (body.metodoPago !== undefined) data.metodoPago = body.metodoPago ? String(body.metodoPago) : null
  if (body.concepto !== undefined) data.concepto = String(body.concepto)
  if (body.medioPagoId !== undefined) {
    if (body.medioPagoId === null) data.medioPagoId = null
    else {
      const mp = await db.medioPago.findUnique({ where: { id: String(body.medioPagoId) }, select: { id: true } })
      if (!mp) throw badRequest('Medio de pago inválido')
      data.medioPagoId = body.medioPagoId
    }
  }
  for (const k of ['monto', 'montoNeto', 'comisionMonto'] as const) {
    if (body[k] !== undefined) {
      const n = Number(body[k])
      if (!Number.isFinite(n) || (k === 'monto' && n < 0)) throw badRequest(`${k} inválido`)
      data[k] = n
    }
  }
  if (body.reciboUsuarioId !== undefined) {
    if (!body.reciboUsuarioId) data.reciboUsuarioId = null
    else {
      const user = await db.user.findUnique({ where: { id: String(body.reciboUsuarioId) }, select: { id: true } })
      if (!user) throw badRequest('Usuario receptor inválido')
      data.reciboUsuarioId = user.id
    }
  }

  await db.cobro.update({ where: { id }, data })
  return db.cobro.findUnique({ where: { id }, include: COBRO_INCLUDE })
}

export async function anularCobro(db: TenantClient, actor: JwtPayload, id: string, motivo: string) {
  const existing = await db.cobro.findUnique({ where: { id }, select: { id: true, anulado: true } })
  if (!existing) throw notFound('Cobro no encontrado')
  if (existing.anulado) throw badRequest('El cobro ya está anulado')

  const me = await db.user.findUnique({ where: { id: actor.sub }, select: { role: true, puedeEditarPagos: true } })
  if (!(me?.role === 'admin' || me?.puedeEditarPagos)) throw forbidden('No tienes permiso para anular pagos.')
  if ((motivo ?? '').trim().length < 4) throw badRequest('Debes indicar un motivo (mínimo 4 caracteres).')

  const nombre = actorName(actor)
  const updated = await db.$transaction(async (tx) => {
    const u = await tx.cobro.update({
      where: { id },
      data: { anulado: true, motivoAnulacion: motivo.trim(), anuladoAt: new Date(), anuladoPorId: actor.sub, anuladoPorNombre: nombre, estado: 'ANULADO' },
      include: COBRO_INCLUDE,
    })
    await tx.movimientoCaja.updateMany({
      where: { cobroId: id, anulado: false },
      data: { anulado: true, motivoAnulacion: `Cobro anulado · ${motivo.trim()}`, anuladoAt: new Date(), anuladoPorId: actor.sub, anuladoPorNombre: nombre },
    })
    return u
  })
  await audit(db, actor.sub, {
    accion: 'ELIMINAR', entidad: 'Cobro', entidadId: id, pacienteId: updated.pacienteId,
    resumen: `Anuló el pago #${updated.numero} por ${fmtMoney(updated.monto)} · ${motivo.trim()}`,
  })
  return updated
}

// Deriva el abono libre (no asignado a una acción) de un plan a otro plan del
// mismo paciente. Reasigna los CobroItem de abono (planId origen, sin tratamiento)
// al plan destino; si un item excede el monto pedido, lo parte conservando el
// vínculo con su cobro original. Queda auditado en la ficha del paciente.
export async function derivarAbono(db: TenantClient, actor: JwtPayload, fromPlanId: string, body: { toPlanId?: string; monto?: number }) {
  const me = await db.user.findUnique({ where: { id: actor.sub }, select: { role: true, puedeRecibirPagos: true, puedeEditarPagos: true } })
  if (!(me?.role === 'admin' || me?.puedeRecibirPagos || me?.puedeEditarPagos)) throw forbidden('No tienes permiso para mover abonos.')

  const toPlanId = body.toPlanId
  if (!toPlanId) throw badRequest('Selecciona el plan de destino.')
  if (toPlanId === fromPlanId) throw badRequest('El plan de destino debe ser distinto al de origen.')

  const [from, to] = await Promise.all([
    db.planTratamiento.findUnique({ where: { id: fromPlanId }, select: { id: true, pacienteId: true, nombre: true } }),
    db.planTratamiento.findUnique({ where: { id: toPlanId }, select: { id: true, pacienteId: true, nombre: true } }),
  ])
  if (!from) throw notFound('Plan de origen no encontrado')
  if (!to) throw notFound('Plan de destino no encontrado')
  if (from.pacienteId !== to.pacienteId) throw badRequest('Solo se puede derivar entre planes del mismo paciente.')

  const itemsLibres = await db.cobroItem.findMany({
    where: { planId: fromPlanId, tratamientoId: null, cobro: { estado: 'PAGADO', anulado: false } },
    select: { id: true, monto: true, cobroId: true, descripcion: true },
    orderBy: { id: 'asc' },
  })
  const disponible = itemsLibres.reduce((s, i) => s + i.monto, 0)
  if (disponible <= 0) throw badRequest('Este plan no tiene abono libre disponible para derivar.')

  let monto = body.monto != null && Number.isFinite(Number(body.monto)) ? Math.round(Number(body.monto)) : Math.round(disponible)
  if (monto <= 0) throw badRequest('El monto a derivar debe ser mayor a 0.')
  if (monto > Math.round(disponible)) throw badRequest('El monto supera el abono libre disponible.')

  await db.$transaction(async (tx) => {
    let rem = monto
    for (const it of itemsLibres) {
      if (rem <= 0) break
      if (it.monto <= rem) {
        await tx.cobroItem.update({ where: { id: it.id }, data: { planId: toPlanId } })
        rem -= it.monto
      } else {
        await tx.cobroItem.update({ where: { id: it.id }, data: { monto: it.monto - rem } })
        await tx.cobroItem.create({ data: { cobroId: it.cobroId, planId: toPlanId, tratamientoId: null, descripcion: it.descripcion || 'Abono derivado', monto: rem } })
        rem = 0
      }
    }
  })
  await audit(db, actor.sub, {
    accion: 'EDITAR', entidad: 'PlanTratamiento', entidadId: fromPlanId, pacienteId: from.pacienteId,
    resumen: `Derivó ${fmtMoney(monto)} de abono libre del plan "${from.nombre}" al plan "${to.nombre}"`,
  })
  return { ok: true, monto, fromPlanId, toPlanId }
}

export async function eliminarCobro(db: TenantClient, actor: JwtPayload, id: string) {
  const existing = await db.cobro.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw notFound('Cobro no encontrado')
  if (actor.role !== 'admin') throw forbidden('Para borrar usa "Anular" con motivo. Solo admin puede eliminar.')
  await db.cobro.delete({ where: { id } })
}
