import type { TenantClient } from '@/db/tenant'
import { badRequest, forbidden, notFound } from '@/lib/errors'
import type { JwtPayload } from '@/services/auth.service'

// Database-per-tenant: cada función recibe el cliente de la base de la clínica.

async function actorPermisos(db: TenantClient, actorId: string) {
  const u = await db.user.findUnique({
    where: { id: actorId },
    select: { role: true, puedeModificarPrecio: true, puedeAplicarDescuento: true, puedeRevertirCompletado: true },
  })
  const isAdmin = u?.role === 'admin'
  return {
    permisos: {
      puedeModificarPrecio: isAdmin || Boolean(u?.puedeModificarPrecio),
      puedeAplicarDescuento: isAdmin || Boolean(u?.puedeAplicarDescuento),
      puedeRevertirCompletado: isAdmin || Boolean(u?.puedeRevertirCompletado),
    },
  }
}

const TRAT_INCLUDE = {
  prestacion: { select: { id: true, nombre: true, categoria: true, precio: true } },
  doctor: { select: { id: true, name: true } },
  cobroItems: {
    select: { id: true, monto: true, cobro: { select: { id: true, numero: true, estado: true, fechaPago: true } } },
  },
} as const

// ── Planes ───────────────────────────────────────────────────────────────────

export async function listarPlanes(db: TenantClient, pacienteId: string) {
  if (!pacienteId) throw badRequest('Falta pacienteId')
  return db.planTratamiento.findMany({
    where: { pacienteId },
    orderBy: { createdAt: 'desc' },
    include: {
      doctorTitular: { select: { id: true, name: true, email: true } },
      _count: { select: { tratamientos: true, secciones: true } },
    },
  })
}

export async function crearPlan(db: TenantClient, input: { pacienteId: string; nombre?: string; notas?: string; fechaInicio?: string; doctorTitularId?: string }) {
  if (!input.pacienteId) throw badRequest('Falta pacienteId')
  const paciente = await db.paciente.findUnique({ where: { id: input.pacienteId }, select: { id: true } })
  if (!paciente) throw notFound('Paciente no encontrado')
  return db.planTratamiento.create({
    data: {
      pacienteId: input.pacienteId,
      doctorTitularId: input.doctorTitularId || null,
      nombre: input.nombre || 'Plan de tratamiento',
      notas: input.notas || null,
      fechaInicio: input.fechaInicio ? new Date(input.fechaInicio) : null,
    },
  })
}

export async function obtenerPlan(db: TenantClient, id: string) {
  const plan = await db.planTratamiento.findUnique({
    where: { id },
    include: {
      doctorTitular: { select: { id: true, name: true, email: true } },
      secciones: { orderBy: { orden: 'asc' }, include: { tratamientos: { orderBy: { fecha: 'asc' }, include: TRAT_INCLUDE } } },
      tratamientos: { where: { seccionId: null }, orderBy: { fecha: 'asc' }, include: TRAT_INCLUDE },
    },
  })
  if (!plan) throw notFound('Plan no existe')
  return plan
}

export async function actualizarPlan(db: TenantClient, id: string, body: Record<string, unknown>) {
  const data: Record<string, unknown> = {}
  if (typeof body.nombre === 'string') data.nombre = body.nombre
  if (typeof body.notas === 'string' || body.notas === null) data.notas = body.notas
  if (typeof body.estado === 'string') data.estado = body.estado
  if (typeof body.doctorTitularId === 'string' || body.doctorTitularId === null) data.doctorTitularId = body.doctorTitularId || null
  if (body.fechaInicio === null) data.fechaInicio = null
  else if (typeof body.fechaInicio === 'string') data.fechaInicio = new Date(body.fechaInicio)

  const r = await db.planTratamiento.updateMany({ where: { id }, data })
  if (r.count === 0) throw notFound('Plan no existe')
  return db.planTratamiento.findUnique({ where: { id } })
}

export async function eliminarPlan(db: TenantClient, id: string) {
  const r = await db.planTratamiento.deleteMany({ where: { id } })
  if (r.count === 0) throw notFound('Plan no existe')
}

// ── Secciones ──────────────────────────────────────────────────────────────

export async function crearSeccion(db: TenantClient, planId: string, body: { titulo?: string; fechaTentativa?: string; diasDesdeAnterior?: number; notas?: string }) {
  const plan = await db.planTratamiento.findUnique({ where: { id: planId }, select: { id: true } })
  if (!plan) throw notFound('Plan no existe')
  const max = await db.seccionPlan.aggregate({ where: { planId }, _max: { orden: true } })
  const orden = (max._max.orden ?? -1) + 1
  return db.seccionPlan.create({
    data: {
      planId,
      titulo: body.titulo?.trim() || `Sección ${orden + 1}`,
      orden,
      fechaTentativa: body.fechaTentativa ? new Date(body.fechaTentativa) : null,
      diasDesdeAnterior: typeof body.diasDesdeAnterior === 'number' ? body.diasDesdeAnterior : null,
      notas: body.notas || null,
    },
  })
}

export async function actualizarSeccion(db: TenantClient, id: string, body: Record<string, unknown>) {
  const data: Record<string, unknown> = {}
  if (typeof body.titulo === 'string') data.titulo = body.titulo
  if (typeof body.notas === 'string' || body.notas === null) data.notas = body.notas
  if (typeof body.orden === 'number') data.orden = body.orden
  if (typeof body.diasDesdeAnterior === 'number' || body.diasDesdeAnterior === null) data.diasDesdeAnterior = body.diasDesdeAnterior
  if (body.fechaTentativa === null) data.fechaTentativa = null
  else if (typeof body.fechaTentativa === 'string') data.fechaTentativa = new Date(body.fechaTentativa)

  const r = await db.seccionPlan.updateMany({ where: { id }, data })
  if (r.count === 0) throw notFound('Sección no existe')
  return db.seccionPlan.findUnique({ where: { id } })
}

export async function eliminarSeccion(db: TenantClient, id: string) {
  const r = await db.seccionPlan.deleteMany({ where: { id } })
  if (r.count === 0) throw notFound('Sección no existe')
}

// ── Tratamientos (acciones) ──────────────────────────────────────────────────

export interface CrearTratamientoInput {
  pacienteId: string; prestacionId: string; piezas?: number[]; zona?: string; cara?: string
  precio?: number; notas?: string; planId?: string; seccionId?: string; descuento?: number
}

export async function crearTratamiento(db: TenantClient, actorId: string, body: CrearTratamientoInput) {
  const paciente = await db.paciente.findUnique({ where: { id: body.pacienteId }, select: { id: true } })
  if (!paciente) throw notFound('Paciente no encontrado')
  const prestacion = await db.prestacion.findUnique({ where: { id: body.prestacionId }, select: { id: true, precio: true } })
  if (!prestacion) throw notFound('Prestación no encontrada')

  const me = await actorPermisos(db, actorId)
  const precioFinal = me.permisos.puedeModificarPrecio ? Number(body.precio) : prestacion.precio
  const descuentoFinal = me.permisos.puedeAplicarDescuento && typeof body.descuento === 'number'
    ? Math.max(0, Math.min(100, body.descuento)) : 0

  let doctorIdDefault: string | null = null
  if (body.planId) {
    const plan = await db.planTratamiento.findUnique({ where: { id: body.planId }, select: { id: true, doctorTitularId: true } })
    if (!plan) throw notFound('Plan no encontrado')
    doctorIdDefault = plan.doctorTitularId
  }
  if (body.seccionId) {
    const seccion = await db.seccionPlan.findUnique({ where: { id: body.seccionId }, select: { id: true } })
    if (!seccion) throw notFound('Sección no encontrada')
  }

  let ficha = await db.fichaClinica.findUnique({ where: { pacienteId: body.pacienteId } })
  if (!ficha) ficha = await db.fichaClinica.create({ data: { pacienteId: body.pacienteId } })

  const baseData = {
    fichaId: ficha.id, prestacionId: body.prestacionId,
    planId: body.planId || null, seccionId: body.seccionId || null,
    doctorId: doctorIdDefault, precio: precioFinal, descuento: descuentoFinal,
    notas: body.notas || null, estado: 'PLANIFICADO',
  }

  if (Array.isArray(body.piezas) && body.piezas.length > 0) {
    return Promise.all(
      body.piezas.map((pieza) =>
        db.tratamiento.create({ data: { ...baseData, diente: pieza, cara: body.cara || null }, include: { prestacion: true } }),
      ),
    )
  }
  const t = await db.tratamiento.create({ data: { ...baseData, diente: null, cara: body.zona || body.cara || null }, include: { prestacion: true } })
  return [t]
}

export async function actualizarTratamiento(db: TenantClient, actorId: string, id: string, body: Record<string, unknown>) {
  const existing = await db.tratamiento.findUnique({ where: { id }, select: { id: true, estado: true } })
  if (!existing) throw notFound('Tratamiento no encontrado')

  const me = await actorPermisos(db, actorId)
  const data: Record<string, unknown> = {}

  if (typeof body.estado === 'string') {
    const saliendoDeCompletado = existing.estado === 'COMPLETADO' && body.estado !== 'COMPLETADO'
    if (saliendoDeCompletado && !me.permisos.puedeRevertirCompletado) {
      throw forbidden('No tienes permisos para revertir el estado de una acción completada')
    }
    data.estado = body.estado
  }
  if (typeof body.notas === 'string' || body.notas === null) data.notas = body.notas
  if (typeof body.diente === 'number' || body.diente === null) data.diente = body.diente
  if (typeof body.cara === 'string' || body.cara === null) data.cara = body.cara
  if (typeof body.doctorId === 'string' || body.doctorId === null) data.doctorId = body.doctorId
  if (typeof body.planId === 'string' || body.planId === null) data.planId = body.planId
  if (typeof body.seccionId === 'string' || body.seccionId === null) data.seccionId = body.seccionId
  if (body.fechaCompletado === null) data.fechaCompletado = null
  else if (typeof body.fechaCompletado === 'string') data.fechaCompletado = new Date(body.fechaCompletado)

  if (typeof body.precio === 'number') {
    if (!me.permisos.puedeModificarPrecio) throw forbidden('No tienes permisos para modificar el precio')
    data.precio = body.precio
  }
  if (typeof body.descuento === 'number') {
    if (!me.permisos.puedeAplicarDescuento) throw forbidden('No tienes permisos para aplicar descuentos')
    data.descuento = Math.max(0, Math.min(100, body.descuento))
  }

  return db.tratamiento.update({ where: { id }, data, include: { prestacion: true } })
}

export async function eliminarTratamiento(db: TenantClient, id: string) {
  const r = await db.tratamiento.deleteMany({ where: { id } })
  if (r.count === 0) throw notFound('Tratamiento no encontrado')
}

// ── Evoluciones ────────────────────────────────────────────────────────────

export async function listarEvoluciones(db: TenantClient, pacienteId: string) {
  if (!pacienteId) throw badRequest('Falta pacienteId')
  return db.evolucion.findMany({
    where: { pacienteId },
    orderBy: { createdAt: 'desc' },
    include: {
      autor: { select: { id: true, name: true, email: true, username: true } },
      tratamiento: { select: { id: true, diente: true, cara: true, prestacion: { select: { nombre: true } } } },
    },
  })
}

export async function crearEvolucion(db: TenantClient, actorId: string, body: { pacienteId: string; tratamientoId?: string; texto: string }) {
  if (!body.pacienteId || !body.texto?.trim()) throw badRequest('Faltan campos')
  const paciente = await db.paciente.findUnique({ where: { id: body.pacienteId }, select: { id: true } })
  if (!paciente) throw notFound('Paciente no encontrado')
  if (body.tratamientoId) {
    const t = await db.tratamiento.findUnique({ where: { id: body.tratamientoId }, select: { id: true } })
    if (!t) throw notFound('Tratamiento no encontrado')
  }
  return db.evolucion.create({
    data: { pacienteId: body.pacienteId, tratamientoId: body.tratamientoId || null, autorId: actorId, texto: body.texto.trim() },
    include: { autor: { select: { id: true, name: true, email: true, username: true } } },
  })
}

export async function eliminarEvolucion(db: TenantClient, actor: JwtPayload, id: string) {
  const evo = await db.evolucion.findUnique({ where: { id }, select: { id: true, autorId: true } })
  if (!evo) throw notFound('Evolución no existe')
  if (actor.role !== 'admin' && evo.autorId !== actor.sub) {
    throw forbidden('Sólo el autor o un admin pueden eliminar esta evolución')
  }
  await db.evolucion.delete({ where: { id } })
}

// ── Odontograma ──────────────────────────────────────────────────────────────

export async function upsertDiente(db: TenantClient, body: { pacienteId?: string; fichaId?: string; numero: number; estado: string }) {
  let fichaId = body.fichaId
  if (!fichaId) {
    if (!body.pacienteId) throw badRequest('Falta pacienteId o fichaId')
    const paciente = await db.paciente.findUnique({ where: { id: body.pacienteId }, select: { id: true } })
    if (!paciente) throw notFound('Paciente no encontrado')
    let ficha = await db.fichaClinica.findUnique({ where: { pacienteId: body.pacienteId } })
    if (!ficha) ficha = await db.fichaClinica.create({ data: { pacienteId: body.pacienteId } })
    fichaId = ficha.id
  } else {
    const ficha = await db.fichaClinica.findUnique({ where: { id: fichaId }, select: { id: true } })
    if (!ficha) throw notFound('Ficha no encontrada')
  }
  return db.diente.upsert({
    where: { fichaId_numero_cara: { fichaId, numero: body.numero, cara: '' } },
    update: { estado: body.estado },
    create: { fichaId, numero: body.numero, cara: '', estado: body.estado },
  })
}
