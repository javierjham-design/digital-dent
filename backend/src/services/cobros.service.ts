import { prisma } from '@/lib/prisma'
import { badRequest, conflict, forbidden, notFound } from '@/lib/errors'
import { actorName, type JwtPayload } from '@/services/auth.service'
import { getSesionAbierta } from '@/lib/caja'

const ESTADOS = ['PENDIENTE', 'PAGADO', 'PARCIAL', 'ANULADO']

const COBRO_INCLUDE = {
  paciente: true,
  medioPago: true,
  reciboUsuario: { select: { id: true, name: true, email: true } },
  items: { include: { tratamiento: { include: { prestacion: true } } } },
} as const

export async function listarCobros(clinicaId: string) {
  return prisma.cobro.findMany({ where: { clinicaId }, include: COBRO_INCLUDE, orderBy: { createdAt: 'desc' } })
}

export async function obtenerCobro(clinicaId: string, id: string) {
  const cobro = await prisma.cobro.findFirst({ where: { id, clinicaId }, include: COBRO_INCLUDE })
  if (!cobro) throw notFound('Cobro no encontrado')
  return cobro
}

export interface CrearCobroInput {
  pacienteId: string; cajaId: string; medioPagoId?: string; reciboUsuarioId?: string
  fechaPago?: string; notas?: string
  items: { tratamientoId?: string; descripcion: string; monto: number }[]
}

export async function crearCobro(actor: JwtPayload, input: CrearCobroInput) {
  const clinicaId = actor.clinicaId!

  const me = await prisma.user.findUnique({ where: { id: actor.sub }, select: { role: true, puedeRecibirPagos: true } })
  if (!(me?.role === 'admin' || me?.puedeRecibirPagos)) throw forbidden('No tienes permiso para recibir pagos.')

  const paciente = await prisma.paciente.findFirst({ where: { id: input.pacienteId, clinicaId }, select: { id: true, nombre: true, apellido: true } })
  if (!paciente) throw notFound('Paciente no encontrado')

  if (!input.cajaId) throw badRequest('Debes seleccionar una caja.')
  const caja = await prisma.caja.findFirst({ where: { id: input.cajaId, clinicaId, activo: true }, include: { usuarios: { select: { userId: true } } } })
  if (!caja) throw notFound('Caja no encontrada')
  if (me?.role !== 'admin' && !caja.usuarios.some((cu) => cu.userId === actor.sub)) throw forbidden('No tienes acceso a esta caja.')

  const items = input.items ?? []
  if (items.length === 0) throw badRequest('Agrega al menos un item.')
  const monto = items.reduce((s, i) => s + Number(i.monto), 0)
  if (monto <= 0) throw badRequest('El monto debe ser mayor a 0.')

  let comisionMonto = 0
  let montoNeto = monto
  if (input.medioPagoId) {
    const medio = await prisma.medioPago.findFirst({ where: { id: input.medioPagoId, clinicaId } })
    if (medio) { comisionMonto = monto * (medio.comision / 100); montoNeto = monto - comisionMonto }
  }

  const concepto = items.map((i) => i.descripcion).join(', ')
  const last = await prisma.cobro.findFirst({ where: { clinicaId }, orderBy: { numero: 'desc' }, select: { numero: true } })
  const numero = (last?.numero ?? 0) + 1
  const fechaPago = input.fechaPago ? new Date(input.fechaPago) : new Date()

  const sesion = await getSesionAbierta(caja.id)
  if (!sesion) throw conflict('La caja seleccionada no tiene una sesión abierta. Abre la caja antes de recibir pagos.')

  return prisma.$transaction(async (tx) => {
    const nuevo = await tx.cobro.create({
      data: {
        clinicaId, pacienteId: input.pacienteId, numero, concepto, monto, montoNeto, comisionMonto,
        estado: 'PAGADO', medioPagoId: input.medioPagoId || null, reciboUsuarioId: input.reciboUsuarioId || actor.sub,
        cajaId: caja.id, fechaPago, notas: input.notas || null,
        items: { create: items.map((i) => ({ tratamientoId: i.tratamientoId || null, descripcion: i.descripcion, monto: Number(i.monto) })) },
      },
      include: COBRO_INCLUDE,
    })
    await tx.movimientoCaja.create({
      data: {
        clinicaId, cajaId: caja.id, sesionCajaId: sesion.id, tipo: 'INGRESO', monto: montoNeto,
        descripcion: `Cobro #${numero} · ${paciente.nombre} ${paciente.apellido}`, categoria: 'COBRO',
        fecha: fechaPago, cobroId: nuevo.id, userId: actor.sub,
      },
    })
    return nuevo
  })
}

const CAMPOS_PRIVILEGIADOS = ['monto', 'montoNeto', 'comisionMonto', 'concepto', 'notas', 'fechaPago', 'reciboUsuarioId']

export async function actualizarCobro(actor: JwtPayload, id: string, body: Record<string, unknown>) {
  const clinicaId = actor.clinicaId!
  const existing = await prisma.cobro.findFirst({ where: { id, clinicaId }, select: { id: true, anulado: true } })
  if (!existing) throw notFound('Cobro no encontrado')

  if (CAMPOS_PRIVILEGIADOS.some((k) => body[k] !== undefined)) {
    const me = await prisma.user.findUnique({ where: { id: actor.sub }, select: { role: true, puedeEditarPagos: true } })
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
      const mp = await prisma.medioPago.findFirst({ where: { id: String(body.medioPagoId), clinicaId }, select: { id: true } })
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
      const user = await prisma.user.findFirst({ where: { id: String(body.reciboUsuarioId), clinicaId }, select: { id: true } })
      if (!user) throw badRequest('Usuario receptor inválido')
      data.reciboUsuarioId = user.id
    }
  }

  await prisma.cobro.update({ where: { id }, data })
  return prisma.cobro.findUnique({ where: { id }, include: COBRO_INCLUDE })
}

export async function anularCobro(actor: JwtPayload, id: string, motivo: string) {
  const clinicaId = actor.clinicaId!
  const existing = await prisma.cobro.findFirst({ where: { id, clinicaId }, select: { id: true, anulado: true } })
  if (!existing) throw notFound('Cobro no encontrado')
  if (existing.anulado) throw badRequest('El cobro ya está anulado')

  const me = await prisma.user.findUnique({ where: { id: actor.sub }, select: { role: true, puedeEditarPagos: true } })
  if (!(me?.role === 'admin' || me?.puedeEditarPagos)) throw forbidden('No tienes permiso para anular pagos.')
  if ((motivo ?? '').trim().length < 4) throw badRequest('Debes indicar un motivo (mínimo 4 caracteres).')

  const nombre = actorName(actor)
  return prisma.$transaction(async (tx) => {
    const updated = await tx.cobro.update({
      where: { id },
      data: { anulado: true, motivoAnulacion: motivo.trim(), anuladoAt: new Date(), anuladoPorId: actor.sub, anuladoPorNombre: nombre, estado: 'ANULADO' },
      include: COBRO_INCLUDE,
    })
    await tx.movimientoCaja.updateMany({
      where: { cobroId: id, anulado: false },
      data: { anulado: true, motivoAnulacion: `Cobro anulado · ${motivo.trim()}`, anuladoAt: new Date(), anuladoPorId: actor.sub, anuladoPorNombre: nombre },
    })
    return updated
  })
}

export async function eliminarCobro(actor: JwtPayload, id: string) {
  const clinicaId = actor.clinicaId!
  const existing = await prisma.cobro.findFirst({ where: { id, clinicaId }, select: { id: true } })
  if (!existing) throw notFound('Cobro no encontrado')
  if (actor.role !== 'admin') throw forbidden('Para borrar usa "Anular" con motivo. Solo admin puede eliminar.')
  await prisma.cobro.delete({ where: { id } })
}
