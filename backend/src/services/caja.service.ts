import type { TenantClient } from '@/db/tenant'
import { badRequest, conflict, forbidden, notFound } from '@/lib/errors'
import { actorName, type JwtPayload } from '@/services/auth.service'
import {
  abrirSesion as abrirSesionCore, calcularResumenSesion, calcularSaldoSugerido, getSesionAbierta,
  getUltimaSesionCerrada,
} from '@/lib/caja'
import { rangoFechasUtc } from '@/lib/tz'
import { siguienteNumero } from '@/lib/correlativo'

const CATEGORIAS_EGRESO = ['ARRIENDO', 'INSUMOS', 'SUELDO', 'SERVICIOS', 'RETIRO', 'OTRO']

const CAJA_INCLUDE = {
  usuarios: { include: { user: { select: { id: true, name: true, email: true } } } },
} as const

// Verifica acceso de OPERACIÓN a una caja (abrir/cerrar/movimientos): su usuario
// o el administrador (que puede abrir/cerrar la caja de otros para supervisar).
// Recibir PAGOS es aparte y sí es exclusivo del usuario (ver cobros.service): los
// pagos de cada usuario no se mezclan aunque el admin opere la caja.
async function cajaConAcceso(db: TenantClient, cajaId: string, actor: JwtPayload) {
  const caja = await db.caja.findUnique({ where: { id: cajaId }, include: { usuarios: { select: { userId: true } } } })
  if (!caja) throw notFound('Caja no encontrada')
  if (actor.role !== 'admin' && !caja.usuarios.some((cu) => cu.userId === actor.sub)) {
    throw forbidden('Esta caja es de otro usuario. Sólo su usuario o un administrador pueden operarla.')
  }
  return caja
}

// Acceso de LECTURA (ver sesiones/movimientos): admin, el usuario asignado, o un
// usuario con permiso de gestión de cajas (supervisión de todas las cajas).
async function cajaAccesoLectura(db: TenantClient, cajaId: string, actor: JwtPayload) {
  const caja = await db.caja.findUnique({ where: { id: cajaId }, include: { usuarios: { select: { userId: true } } } })
  if (!caja) throw notFound('Caja no encontrada')
  if (actor.role === 'admin') return caja
  if (caja.usuarios.some((cu) => cu.userId === actor.sub)) return caja
  const u = await db.user.findUnique({ where: { id: actor.sub }, select: { puedeGestionarCajas: true } })
  if (u?.puedeGestionarCajas) return caja
  throw forbidden('No tienes acceso a esta caja.')
}

// Asigna correlativo a cajas antiguas sin número (numero = 0), por antigüedad. El
// backfill corre dentro de una transacción con el advisory lock (via siguienteNumero)
// para no colisionar con una creación de caja concurrente.
async function asegurarNumerosCaja(db: TenantClient): Promise<void> {
  const sinNumero = await db.caja.findMany({ where: { numero: 0 }, orderBy: { createdAt: 'asc' }, select: { id: true } })
  if (sinNumero.length === 0) return
  await db.$transaction(async (tx) => {
    let n = await siguienteNumero(tx, 'caja')
    for (const c of sinNumero) { await tx.caja.update({ where: { id: c.id }, data: { numero: n } }); n++ }
  })
}
// Asigna correlativo de apertura a sesiones antiguas sin número (numero = 0).
async function asegurarNumerosSesion(db: TenantClient): Promise<void> {
  const sinNumero = await db.sesionCaja.findMany({ where: { numero: 0 }, orderBy: { abiertaAt: 'asc' }, select: { id: true } })
  if (sinNumero.length === 0) return
  await db.$transaction(async (tx) => {
    let n = await siguienteNumero(tx, 'sesionCaja')
    for (const s of sinNumero) { await tx.sesionCaja.update({ where: { id: s.id }, data: { numero: n } }); n++ }
  })
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
      id: c.id, numero: c.numero, nombre: c.nombre, descripcion: c.descripcion, saldoInicial: c.saldoInicial,
      usuarios: c.usuarios,
      sesionAbierta: sesionAbierta ? { ...sesionAbierta, resumen } : null,
      ultimaCerrada,
    }
  }))
}

// Gestión de cajas (admin o usuario con puedeGestionarCajas): TODAS las cajas
// —activas e inactivas— con su número, usuarios, estado de la sesión abierta
// (quién la abrió, ingresos/egresos) y el último cierre. Independientes entre sí.
export async function gestionCajas(db: TenantClient) {
  await asegurarNumerosCaja(db)
  await asegurarNumerosSesion(db)
  const cajas = await db.caja.findMany({ include: CAJA_INCLUDE, orderBy: [{ numero: 'asc' }] })
  return Promise.all(cajas.map(async (c) => {
    const sesionAbierta = await getSesionAbierta(db, c.id)
    const resumen = sesionAbierta ? await calcularResumenSesion(db, sesionAbierta.id) : null
    const ultimaCerrada = await getUltimaSesionCerrada(db, c.id)
    const totalSesiones = await db.sesionCaja.count({ where: { cajaId: c.id } })
    return {
      id: c.id, numero: c.numero, nombre: c.nombre, descripcion: c.descripcion, saldoInicial: c.saldoInicial,
      activo: c.activo, usuarios: c.usuarios,
      sesionAbierta: sesionAbierta ? { ...sesionAbierta, resumen } : null,
      ultimaCerrada, totalSesiones,
    }
  }))
}

export async function crearCaja(db: TenantClient, actor: JwtPayload, body: { saldoInicial?: number }) {
  // Cada usuario tiene UNA caja propia (sin nombre), exclusiva. Si ya la tiene,
  // se devuelve esa misma (idempotente: "abrir mi caja").
  const existente = await db.caja.findFirst({
    where: { activo: true, usuarios: { some: { userId: actor.sub } } },
    include: CAJA_INCLUDE,
  })
  if (existente) return existente

  return db.$transaction(async (tx) => {
    const numero = await siguienteNumero(tx, 'caja')
    return tx.caja.create({
      data: {
        numero, nombre: `Caja ${numero}`, // nombre interno (no se muestra); único por correlativo
        saldoInicial: Number(body?.saldoInicial) || 0,
        usuarios: { create: [{ userId: actor.sub }] },
      },
      include: CAJA_INCLUDE,
    })
  })
}

export async function actualizarCaja(db: TenantClient, id: string, body: Record<string, unknown>) {
  const existing = await db.caja.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw notFound('Caja no encontrada')
  const data: Record<string, unknown> = {}
  if (body.saldoInicial !== undefined) {
    const n = Number(body.saldoInicial)
    if (!Number.isFinite(n)) throw badRequest('saldoInicial inválido')
    data.saldoInicial = n
  }
  if (body.activo !== undefined) data.activo = Boolean(body.activo)
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

// Usuarios que pueden ser responsables de una caja (reciben pagos u operan cajas),
// con el estado de su caja propia. Sirve para que el admin/gestor abra la caja de
// cualquiera (incluida la primera vez, aún sin caja creada).
export async function operadoresCaja(db: TenantClient) {
  const users = await db.user.findMany({
    where: { activo: true, OR: [{ role: 'admin' }, { puedeRecibirPagos: true }, { puedeGestionarCajas: true }] },
    select: { id: true, name: true, email: true },
    orderBy: [{ name: 'asc' }],
  })
  return Promise.all(users.map(async (u) => {
    const caja = await db.caja.findFirst({ where: { activo: true, usuarios: { some: { userId: u.id } } }, select: { id: true } })
    const sesionAbierta = caja ? await getSesionAbierta(db, caja.id) : null
    return { userId: u.id, nombre: u.name ?? u.email, cajaId: caja?.id ?? null, tieneAbierta: Boolean(sesionAbierta) }
  }))
}

// Abre la caja de OTRO usuario (admin/gestor). El responsable es SIEMPRE el usuario
// destino (su caja es exclusiva e intransferible); sólo queda registrado que quien
// la abrió fue el admin. Si el usuario aún no tiene caja, se le crea. El saldo de
// apertura se arrastra del último cierre de ESE usuario.
export async function abrirCajaParaUsuario(db: TenantClient, actor: JwtPayload, targetUserId: string, saldoRaw: unknown) {
  const me = await db.user.findUnique({ where: { id: actor.sub }, select: { role: true, puedeGestionarCajas: true } })
  if (!(me?.role === 'admin' || me?.puedeGestionarCajas)) throw forbidden('Sólo un administrador o gestor de cajas puede abrir la caja de otro usuario.')

  const target = await db.user.findUnique({ where: { id: targetUserId }, select: { id: true, role: true, activo: true, puedeRecibirPagos: true, puedeGestionarCajas: true } })
  if (!target || !target.activo) throw notFound('Usuario no encontrado')
  if (!(target.role === 'admin' || target.puedeRecibirPagos || target.puedeGestionarCajas)) {
    throw badRequest('Ese usuario no tiene habilitado el permiso para recibir pagos u operar cajas.')
  }

  let caja = await db.caja.findFirst({ where: { activo: true, usuarios: { some: { userId: target.id } } }, select: { id: true } })
  if (!caja) {
    caja = await db.$transaction(async (tx) => {
      const numero = await siguienteNumero(tx, 'caja')
      return tx.caja.create({ data: { numero, nombre: `Caja ${numero}`, usuarios: { create: [{ userId: target.id }] } }, select: { id: true } })
    })
  }
  if (await getSesionAbierta(db, caja.id)) throw conflict('Ese usuario ya tiene una caja abierta.')

  let saldoApertura: number
  if (saldoRaw === undefined || saldoRaw === null || saldoRaw === '') saldoApertura = await calcularSaldoSugerido(db, caja.id)
  else saldoApertura = Number(saldoRaw)
  if (!Number.isFinite(saldoApertura) || saldoApertura < 0) throw badRequest('El saldo de apertura es inválido.')

  return abrirSesionCore(db, { cajaId: caja.id, userId: actor.sub, userNombre: actorName(actor), saldoApertura })
}

export async function cerrarSesion(db: TenantClient, actor: JwtPayload, cajaId: string, body: { saldoReal: unknown; efectivoRetirado?: unknown; efectivoDejado?: unknown; observaciones?: string }) {
  await cajaConAcceso(db, cajaId, actor)
  const saldoReal = Number(body.saldoReal) // efectivo contado
  if (!Number.isFinite(saldoReal) || saldoReal < 0) throw badRequest('El efectivo contado es inválido.')
  // Retiro (depósito/entrega) y efectivo que queda para la próxima apertura.
  const retirado = body.efectivoRetirado === undefined || body.efectivoRetirado === '' ? 0 : Number(body.efectivoRetirado)
  if (!Number.isFinite(retirado) || retirado < 0) throw badRequest('El monto retirado es inválido.')
  if (retirado > saldoReal) throw badRequest('No puedes retirar más de lo contado.')
  const dejado = body.efectivoDejado === undefined || body.efectivoDejado === '' ? (saldoReal - retirado) : Number(body.efectivoDejado)
  if (!Number.isFinite(dejado) || dejado < 0) throw badRequest('El efectivo a dejar es inválido.')
  const observaciones = body.observaciones?.trim() || null

  const sesion = await getSesionAbierta(db, cajaId)
  if (!sesion) throw conflict('Esta caja no tiene una sesión abierta para cerrar.')

  const cerradaAt = new Date()
  return db.$transaction(async (tx) => {
    await tx.movimientoCaja.updateMany({
      where: { cajaId, sesionCajaId: null, fecha: { gte: sesion.abiertaAt, lte: cerradaAt } },
      data: { sesionCajaId: sesion.id },
    })
    // El cuadre es SÓLO sobre efectivo: el esperado en caja = apertura + ingresos
    // en efectivo − egresos. Los pagos con tarjeta/transferencia NO suman al efectivo.
    const resumen = await calcularResumenSesion(tx as unknown as TenantClient, sesion.id)
    const efectivoEsperado = resumen?.efectivoEsperado ?? sesion.saldoApertura
    return tx.sesionCaja.update({
      where: { id: sesion.id },
      data: {
        estado: 'CERRADA', cerradaPorId: actor.sub, cerradaPorNombre: actorName(actor), cerradaAt,
        saldoEsperado: efectivoEsperado, saldoReal, diferencia: saldoReal - efectivoEsperado,
        efectivoRetirado: retirado, efectivoDejado: dejado,
        // totalIngresos = ingresos EN EFECTIVO (para que el cuadre de caja cierre);
        // la recaudación total y el desglose por medio se ven en el detalle/reporte.
        totalIngresos: resumen?.ingresosEfectivo ?? 0, totalEgresos: resumen?.egresos ?? 0, observaciones,
      },
    })
  })
}

export async function listarSesiones(db: TenantClient, actor: JwtPayload, cajaId: string) {
  await cajaAccesoLectura(db, cajaId, actor)
  return db.sesionCaja.findMany({ where: { cajaId }, orderBy: { abiertaAt: 'desc' }, take: 50 })
}

export async function detalleSesion(db: TenantClient, actor: JwtPayload, cajaId: string, sesionId: string) {
  await cajaAccesoLectura(db, cajaId, actor)
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
  await cajaAccesoLectura(db, cajaId, actor)
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

// ── Reportes de pagos recibidos (Gestión de cajas) ────────────────────────────
// Muestran lo EXACTAMENTE cobrado (bruto), sin descontar la retención del medio
// de pago (esa retención sólo aplica a las liquidaciones). Fechas interpretadas
// en hora de la clínica (America/Santiago).

interface ReporteFiltro { desde?: string; hasta?: string }

async function cobrosDelPeriodo(db: TenantClient, f: ReporteFiltro) {
  return db.cobro.findMany({
    where: {
      estado: 'PAGADO', anulado: false,
      ...(f.desde || f.hasta ? { fechaPago: rangoFechasUtc(f.desde, f.hasta) } : {}),
    },
    select: {
      id: true, numero: true, monto: true, fechaPago: true,
      paciente: { select: { nombre: true, apellido: true } },
      medioPago: { select: { nombre: true } },
      reciboUsuario: { select: { id: true, name: true, email: true } },
      // Nº de la CAJA = correlativo del ciclo (sesión) en que se recibió el pago.
      movimientos: { where: { tipo: 'INGRESO' }, select: { sesion: { select: { numero: true } } }, orderBy: { fecha: 'asc' }, take: 1 },
    },
    orderBy: { fechaPago: 'desc' },
  })
}
type CobroPeriodo = Awaited<ReturnType<typeof cobrosDelPeriodo>>[number]

const metodoDeCobro = (c: { medioPago: { nombre: string | null } | null }) => c.medioPago?.nombre || 'Efectivo'

function agruparPorMetodo(cobros: { monto: number; medioPago: { nombre: string | null } | null }[]) {
  const map = new Map<string, { monto: number; cantidad: number }>()
  for (const c of cobros) {
    const metodo = metodoDeCobro(c)
    const e = map.get(metodo) ?? { monto: 0, cantidad: 0 }
    e.monto += c.monto; e.cantidad++; map.set(metodo, e)
  }
  return [...map.entries()].map(([metodo, v]) => ({ metodo, ...v })).sort((a, b) => b.monto - a.monto)
}

// Reporte 1: todos los pagos recibidos en el periodo, con total y desglose por medio.
export async function reportePagosPeriodo(db: TenantClient, f: ReporteFiltro) {
  const cobros = await cobrosDelPeriodo(db, f)
  return {
    desde: f.desde ?? null, hasta: f.hasta ?? null,
    total: cobros.reduce((s, c) => s + c.monto, 0),
    cantidad: cobros.length,
    porMetodo: agruparPorMetodo(cobros),
    items: cobros.map((c) => ({
      id: c.id, numero: c.numero, monto: c.monto,
      fechaPago: c.fechaPago?.toISOString() ?? null,
      paciente: `${c.paciente.nombre} ${c.paciente.apellido}`.trim(),
      metodo: metodoDeCobro(c),
      recibidoPor: c.reciboUsuario?.name ?? c.reciboUsuario?.email ?? '—',
      cajaNumero: c.movimientos[0]?.sesion?.numero ?? null,
    })),
  }
}

// Reporte 2: pagos recibidos agrupados por profesional (quien recibió el pago),
// cada uno con su total, cantidad y desglose por medio de pago.
export async function reportePorProfesional(db: TenantClient, f: ReporteFiltro) {
  const cobros = await cobrosDelPeriodo(db, f)
  const map = new Map<string, { nombre: string; cobros: CobroPeriodo[] }>()
  for (const c of cobros) {
    const key = c.reciboUsuario?.id ?? 'sin'
    const nombre = c.reciboUsuario?.name ?? c.reciboUsuario?.email ?? 'Sin asignar'
    const e = map.get(key) ?? { nombre, cobros: [] }
    e.cobros.push(c); map.set(key, e)
  }
  const profesionales = [...map.entries()].map(([profesionalId, v]) => ({
    profesionalId, nombre: v.nombre,
    total: v.cobros.reduce((s, c) => s + c.monto, 0),
    cantidad: v.cobros.length,
    porMetodo: agruparPorMetodo(v.cobros),
  })).sort((a, b) => b.total - a.total)
  return {
    desde: f.desde ?? null, hasta: f.hasta ?? null,
    total: cobros.reduce((s, c) => s + c.monto, 0),
    cantidad: cobros.length,
    porMetodo: agruparPorMetodo(cobros),
    profesionales,
  }
}
