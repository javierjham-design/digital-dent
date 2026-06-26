import type { TenantClient } from '@/db/tenant'
import { badRequest, conflict, forbidden, notFound } from '@/lib/errors'
import { actorName, type JwtPayload } from '@/services/auth.service'
import {
  abrirSesion as abrirSesionCore, calcularResumenSesion, calcularSaldoSugerido, getSesionAbierta,
  getUltimaSesionCerrada,
} from '@/lib/caja'

const CATEGORIAS_EGRESO = ['ARRIENDO', 'INSUMOS', 'SUELDO', 'SERVICIOS', 'RETIRO', 'OTRO']

const CAJA_INCLUDE = {
  usuarios: { include: { user: { select: { id: true, name: true, email: true } } } },
} as const

// Verifica acceso a una caja: admin ve todas; el resto solo las asignadas.
async function cajaConAcceso(db: TenantClient, cajaId: string, actor: JwtPayload) {
  const caja = await db.caja.findUnique({ where: { id: cajaId }, include: { usuarios: { select: { userId: true } } } })
  if (!caja) throw notFound('Caja no encontrada')
  const isAdmin = actor.role === 'admin'
  if (!isAdmin && !caja.usuarios.some((cu) => cu.userId === actor.sub)) {
    throw forbidden('No tienes acceso a esta caja.')
  }
  return caja
}

// ── Cajas ────────────────────────────────────────────────────────────────────

export async function listarCajas(db: TenantClient, actor: JwtPayload) {
  const where = actor.role === 'admin'
    ? { activo: true }
    : { activo: true, usuarios: { some: { userId: actor.sub } } }
  return db.caja.findMany({ where, include: CAJA_INCLUDE, orderBy: { nombre: 'asc' } })
}

export async function obtenerCaja(db: TenantClient, actor: JwtPayload, id: string) {
  await cajaConAcceso(db, id, actor)
  return db.caja.findUnique({ where: { id }, include: CAJA_INCLUDE })
}

// Resumen para las vistas "Cajas abiertas" / "Cajas cerradas": cada caja con su
// sesión abierta (si la hay, con ingresos/egresos/saldo) y su último cierre.
export async function resumenCajas(db: TenantClient, actor: JwtPayload) {
  const cajas = await listarCajas(db, actor)
  return Promise.all(cajas.map(async (c) => {
    const sesionAbierta = await getSesionAbierta(db, c.id)
    const resumen = sesionAbierta ? await calcularResumenSesion(db, sesionAbierta.id) : null
    const ultimaCerrada = await getUltimaSesionCerrada(db, c.id)
    return {
      id: c.id, nombre: c.nombre, descripcion: c.descripcion, saldoInicial: c.saldoInicial,
      usuarios: c.usuarios,
      sesionAbierta: sesionAbierta ? { ...sesionAbierta, resumen } : null,
      ultimaCerrada,
    }
  }))
}

export async function crearCaja(db: TenantClient, body: { nombre: string; descripcion?: string; saldoInicial?: number; usuarioIds?: string[] }) {
  const nombre = (body.nombre ?? '').trim()
  if (!nombre) throw badRequest('Falta el nombre')
  const usuarioIds = Array.isArray(body.usuarioIds) ? body.usuarioIds : []
  if (usuarioIds.length > 0) {
    const count = await db.user.count({ where: { id: { in: usuarioIds } } })
    if (count !== usuarioIds.length) throw badRequest('Usuarios inválidos')
  }
  try {
    return await db.caja.create({
      data: {
        nombre, descripcion: body.descripcion ? String(body.descripcion) : null,
        saldoInicial: Number(body.saldoInicial) || 0,
        usuarios: { create: usuarioIds.map((userId) => ({ userId })) },
      },
      include: CAJA_INCLUDE,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg.includes('Unique constraint')) throw conflict(`Ya existe una caja "${nombre}" en esta clínica`)
    throw e
  }
}

export async function actualizarCaja(db: TenantClient, id: string, body: Record<string, unknown>) {
  const existing = await db.caja.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw notFound('Caja no encontrada')
  const data: Record<string, unknown> = {}
  if (body.nombre !== undefined) data.nombre = String(body.nombre).trim()
  if (body.descripcion !== undefined) data.descripcion = body.descripcion ? String(body.descripcion) : null
  if (body.saldoInicial !== undefined) {
    const n = Number(body.saldoInicial)
    if (!Number.isFinite(n)) throw badRequest('saldoInicial inválido')
    data.saldoInicial = n
  }
  if (body.activo !== undefined) data.activo = Boolean(body.activo)

  if (Array.isArray(body.usuarioIds)) {
    const usuarioIds = body.usuarioIds as string[]
    if (usuarioIds.length > 0) {
      const count = await db.user.count({ where: { id: { in: usuarioIds } } })
      if (count !== usuarioIds.length) throw badRequest('Usuarios inválidos')
    }
    await db.cajaUsuario.deleteMany({ where: { cajaId: id } })
    if (usuarioIds.length > 0) {
      await db.cajaUsuario.createMany({ data: usuarioIds.map((userId) => ({ cajaId: id, userId })) })
    }
  }
  return db.caja.update({ where: { id }, data, include: CAJA_INCLUDE })
}

export async function eliminarCaja(db: TenantClient, id: string) {
  const existing = await db.caja.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw notFound('Caja no encontrada')
  await db.caja.update({ where: { id }, data: { activo: false } }) // soft delete (hay historial)
}

// ── Sesiones ─────────────────────────────────────────────────────────────────

export async function saldoSugerido(db: TenantClient, actor: JwtPayload, cajaId: string) {
  await cajaConAcceso(db, cajaId, actor)
  return { saldoSugerido: await calcularSaldoSugerido(db, cajaId) }
}

export async function abrirSesion(db: TenantClient, actor: JwtPayload, cajaId: string, saldoAperturaRaw: unknown) {
  const caja = await cajaConAcceso(db, cajaId, actor)
  if (!caja.activo) throw conflict('La caja está inactiva.')
  if (await getSesionAbierta(db, cajaId)) throw conflict('Ya hay una sesión abierta en esta caja.')

  let saldoApertura: number
  if (saldoAperturaRaw === undefined || saldoAperturaRaw === null || saldoAperturaRaw === '') {
    saldoApertura = await calcularSaldoSugerido(db, cajaId)
  } else {
    saldoApertura = Number(saldoAperturaRaw)
  }
  if (!Number.isFinite(saldoApertura) || saldoApertura < 0) throw badRequest('El saldo de apertura es inválido.')

  return abrirSesionCore(db, { cajaId, userId: actor.sub, userNombre: actorName(actor), saldoApertura })
}

export async function cerrarSesion(db: TenantClient, actor: JwtPayload, cajaId: string, body: { saldoReal: unknown; observaciones?: string }) {
  await cajaConAcceso(db, cajaId, actor)
  const saldoReal = Number(body.saldoReal)
  if (!Number.isFinite(saldoReal) || saldoReal < 0) throw badRequest('El conteo real es inválido.')
  const observaciones = body.observaciones?.trim() || null

  const sesion = await getSesionAbierta(db, cajaId)
  if (!sesion) throw conflict('Esta caja no tiene una sesión abierta para cerrar.')

  const cerradaAt = new Date()
  return db.$transaction(async (tx) => {
    await tx.movimientoCaja.updateMany({
      where: { cajaId, sesionCajaId: null, fecha: { gte: sesion.abiertaAt, lte: cerradaAt } },
      data: { sesionCajaId: sesion.id },
    })
    const movs = await tx.movimientoCaja.findMany({
      where: { sesionCajaId: sesion.id, anulado: false }, select: { tipo: true, monto: true },
    })
    const ingresos = movs.filter((m) => m.tipo === 'INGRESO').reduce((s, m) => s + m.monto, 0)
    const egresos = movs.filter((m) => m.tipo === 'EGRESO').reduce((s, m) => s + m.monto, 0)
    const saldoEsperado = sesion.saldoApertura + ingresos - egresos
    return tx.sesionCaja.update({
      where: { id: sesion.id },
      data: {
        estado: 'CERRADA', cerradaPorId: actor.sub, cerradaPorNombre: actorName(actor), cerradaAt,
        saldoEsperado, saldoReal, diferencia: saldoReal - saldoEsperado,
        totalIngresos: ingresos, totalEgresos: egresos, observaciones,
      },
    })
  })
}

export async function listarSesiones(db: TenantClient, actor: JwtPayload, cajaId: string) {
  await cajaConAcceso(db, cajaId, actor)
  return db.sesionCaja.findMany({ where: { cajaId }, orderBy: { abiertaAt: 'desc' }, take: 50 })
}

export async function detalleSesion(db: TenantClient, actor: JwtPayload, cajaId: string, sesionId: string) {
  await cajaConAcceso(db, cajaId, actor)
  const sesion = await db.sesionCaja.findFirst({ where: { id: sesionId, cajaId } })
  if (!sesion) throw notFound('Sesión no encontrada')
  const hasta = sesion.cerradaAt ?? new Date()
  const movimientos = await db.movimientoCaja.findMany({
    where: { cajaId, OR: [{ sesionCajaId: sesionId }, { sesionCajaId: null, fecha: { gte: sesion.abiertaAt, lte: hasta } }] },
    include: {
      user: { select: { id: true, name: true, email: true } },
      cobro: {
        select: {
          id: true, numero: true, monto: true, montoNeto: true, comisionMonto: true, anulado: true,
          medioPago: { select: { id: true, nombre: true } },
          paciente: { select: { id: true, nombre: true, apellido: true } },
        },
      },
    },
    orderBy: { fecha: 'desc' },
  })
  const resumen = await calcularResumenSesion(db, sesionId)
  return { sesion, movimientos, resumen }
}

// ── Movimientos ──────────────────────────────────────────────────────────────

export async function listarMovimientos(db: TenantClient, actor: JwtPayload, cajaId: string, rango: { from?: string; to?: string }) {
  await cajaConAcceso(db, cajaId, actor)
  return db.movimientoCaja.findMany({
    where: {
      cajaId,
      ...(rango.from && rango.to ? { fecha: { gte: new Date(rango.from), lte: new Date(rango.to + 'T23:59:59') } } : {}),
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      cobro: { select: { id: true, numero: true, paciente: { select: { nombre: true, apellido: true } } } },
    },
    orderBy: { fecha: 'desc' },
  })
}

export async function crearMovimiento(db: TenantClient, actor: JwtPayload, cajaId: string, body: Record<string, unknown>) {
  const caja = await cajaConAcceso(db, cajaId, actor)
  if (!caja.activo) throw forbidden('No tienes acceso a esta caja')

  const tipo = body.tipo === 'INGRESO' ? 'INGRESO' : 'EGRESO'
  const monto = Math.abs(Number(body.monto))
  if (!Number.isFinite(monto) || monto <= 0) throw badRequest('monto inválido')
  const descripcion = typeof body.descripcion === 'string' ? body.descripcion.trim() : ''
  if (!descripcion) throw badRequest('Falta la descripción')

  const categoria = body.categoria && typeof body.categoria === 'string'
    ? (tipo === 'EGRESO' && !CATEGORIAS_EGRESO.includes(body.categoria) ? 'OTRO' : body.categoria)
    : (tipo === 'EGRESO' ? 'OTRO' : null)
  const fecha = body.fecha ? new Date(String(body.fecha)) : new Date()

  const sesion = await getSesionAbierta(db, cajaId)
  if (!sesion) throw conflict('La caja no tiene una sesión abierta. Abre la caja antes de registrar movimientos.')

  return db.movimientoCaja.create({
    data: { cajaId, sesionCajaId: sesion.id, tipo, monto, descripcion, categoria, fecha, userId: actor.sub },
    include: { user: { select: { id: true, name: true, email: true } } },
  })
}

export async function anularMovimiento(db: TenantClient, actor: JwtPayload, cajaId: string, movId: string, motivo: string) {
  const mov = await db.movimientoCaja.findFirst({ where: { id: movId, cajaId }, select: { id: true, anulado: true, cobroId: true } })
  if (!mov) throw notFound('Movimiento no encontrado')
  if (mov.anulado) throw badRequest('El movimiento ya está anulado')
  if (mov.cobroId) throw badRequest('Este movimiento proviene de un cobro. Anula el cobro desde Cobros.')

  const me = await db.user.findUnique({ where: { id: actor.sub }, select: { role: true, puedeEditarPagos: true } })
  if (!(me?.role === 'admin' || me?.puedeEditarPagos)) throw forbidden('No tienes permiso para anular movimientos.')
  if ((motivo ?? '').trim().length < 4) throw badRequest('Debes indicar un motivo (mínimo 4 caracteres).')

  return db.movimientoCaja.update({
    where: { id: movId },
    data: { anulado: true, motivoAnulacion: motivo.trim(), anuladoAt: new Date(), anuladoPorId: actor.sub, anuladoPorNombre: actorName(actor) },
  })
}
