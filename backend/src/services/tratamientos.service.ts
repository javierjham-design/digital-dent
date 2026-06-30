import type { TenantClient } from '@/db/tenant'
import { badRequest, forbidden, notFound } from '@/lib/errors'
import type { JwtPayload } from '@/services/auth.service'
import { audit } from '@/lib/audit'

// Database-per-tenant: cada función recibe el cliente de la base de la clínica.

async function esAdmin(db: TenantClient, actorId: string): Promise<boolean> {
  const u = await db.user.findUnique({ where: { id: actorId }, select: { role: true } })
  return u?.role === 'admin'
}

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
  const planes = await db.planTratamiento.findMany({
    where: { pacienteId },
    orderBy: { createdAt: 'desc' },
    include: {
      doctorTitular: { select: { id: true, name: true, email: true } },
      _count: { select: { tratamientos: true, secciones: true } },
      // Datos mínimos para que las tarjetas calculen progreso y estado financiero.
      tratamientos: {
        select: {
          estado: true, precio: true, descuento: true,
          cobroItems: { select: { monto: true, cobro: { select: { estado: true } } } },
        },
      },
    },
  })
  // Abonos libres (pagos al plan sin acción específica), por plan, para que la
  // tarjeta calcule el estado financiero (abonado total = acciones + abono libre).
  const planIds = planes.map((p) => p.id)
  const itemsLibres = planIds.length
    ? await db.cobroItem.findMany({
        where: { planId: { in: planIds }, tratamientoId: null, cobro: { estado: 'PAGADO', anulado: false } },
        select: { planId: true, monto: true },
      })
    : []
  const abonoMap = new Map<string, number>()
  for (const it of itemsLibres) if (it.planId) abonoMap.set(it.planId, (abonoMap.get(it.planId) ?? 0) + it.monto)
  return planes.map((p) => ({ ...p, abonoLibre: abonoMap.get(p.id) ?? 0 }))
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
  // Abonos libres (pagos al plan sin acción específica), ya cobrados y no anulados.
  const abono = await db.cobroItem.aggregate({
    where: { planId: id, tratamientoId: null, cobro: { estado: 'PAGADO', anulado: false } },
    _sum: { monto: true },
  })
  return { ...plan, abonoLibre: abono._sum.monto ?? 0 }
}

export async function actualizarPlan(db: TenantClient, id: string, body: Record<string, unknown>) {
  const data: Record<string, unknown> = {}
  if (typeof body.nombre === 'string') data.nombre = body.nombre
  if (typeof body.notas === 'string' || body.notas === null) data.notas = body.notas
  if (typeof body.estado === 'string') data.estado = body.estado
  if (typeof body.bloqueado === 'boolean') data.bloqueado = body.bloqueado
  if (typeof body.doctorTitularId === 'string' || body.doctorTitularId === null) data.doctorTitularId = body.doctorTitularId || null
  if (body.fechaInicio === null) data.fechaInicio = null
  else if (typeof body.fechaInicio === 'string') data.fechaInicio = new Date(body.fechaInicio)

  const r = await db.planTratamiento.updateMany({ where: { id }, data })
  if (r.count === 0) throw notFound('Plan no existe')
  return db.planTratamiento.findUnique({ where: { id } })
}

// Bloqueo del presupuesto: con el plan bloqueado no se puede editar su estructura
// ni precios (sí se permite evolucionar acciones). Desbloquear para editar.
async function assertPlanDesbloqueado(db: TenantClient, planId: string | null | undefined) {
  if (!planId) return
  const p = await db.planTratamiento.findUnique({ where: { id: planId }, select: { bloqueado: true } })
  if (p?.bloqueado) throw forbidden('El plan está bloqueado. Desbloquéalo para editar el presupuesto.')
}

export async function eliminarPlan(db: TenantClient, actorId: string, id: string) {
  const plan = await db.planTratamiento.findUnique({ where: { id }, select: { id: true, nombre: true, pacienteId: true } })
  if (!plan) throw notFound('Plan no existe')
  // Eliminar un plan retira acciones de la ficha clínica: solo el administrador.
  if (!(await esAdmin(db, actorId))) throw forbidden('Solo un administrador puede eliminar un plan de tratamiento.')
  await db.planTratamiento.delete({ where: { id } })
  await audit(db, actorId, { accion: 'ELIMINAR', entidad: 'PlanTratamiento', entidadId: id, pacienteId: plan.pacienteId, resumen: `Eliminó el plan "${plan.nombre}"` })
}

// ── Secciones ──────────────────────────────────────────────────────────────

export async function crearSeccion(db: TenantClient, planId: string, body: { titulo?: string; fechaTentativa?: string; diasDesdeAnterior?: number; notas?: string }) {
  const plan = await db.planTratamiento.findUnique({ where: { id: planId }, select: { id: true } })
  if (!plan) throw notFound('Plan no existe')
  await assertPlanDesbloqueado(db, planId)
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
  const s = await db.seccionPlan.findUnique({ where: { id }, select: { planId: true } })
  if (!s) throw notFound('Sección no existe')
  await assertPlanDesbloqueado(db, s.planId)
  await db.seccionPlan.delete({ where: { id } })
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
  await assertPlanDesbloqueado(db, body.planId)

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

  const creados = (Array.isArray(body.piezas) && body.piezas.length > 0)
    ? await Promise.all(body.piezas.map((pieza) =>
        db.tratamiento.create({ data: { ...baseData, diente: pieza, cara: body.cara || null }, include: { prestacion: true } })))
    : [await db.tratamiento.create({ data: { ...baseData, diente: null, cara: body.zona || body.cara || null }, include: { prestacion: true } })]

  const piezasTxt = creados.map((t) => t.diente).filter(Boolean).join(', ')
  await audit(db, actorId, {
    accion: 'CREAR', entidad: 'Tratamiento', entidadId: creados[0]?.id, pacienteId: body.pacienteId,
    resumen: `Agregó "${creados[0]?.prestacion?.nombre ?? 'prestación'}"${piezasTxt ? ` · pieza(s) ${piezasTxt}` : ''} al plan`,
  })
  return creados
}

export async function actualizarTratamiento(db: TenantClient, actorId: string, id: string, body: Record<string, unknown>) {
  const existing = await db.tratamiento.findUnique({
    where: { id },
    select: { id: true, estado: true, planId: true, precio: true, descuento: true, ficha: { select: { pacienteId: true } }, prestacion: { select: { nombre: true } } },
  })
  if (!existing) throw notFound('Tratamiento no encontrado')

  // Editar estructura/precio requiere el plan desbloqueado; evolucionar (estado) y notas, no.
  const tocaPresupuesto = ['precio', 'descuento', 'diente', 'cara', 'seccionId', 'planId', 'prestacionId'].some((k) => k in body)
  if (tocaPresupuesto) await assertPlanDesbloqueado(db, existing.planId)

  const me = await actorPermisos(db, actorId)
  const data: Record<string, unknown> = {}

  // Una acción YA REALIZADA (COMPLETADO) tiene su precio y descuento bloqueados:
  // para corregirlos hay que "desrealizarla" primero (revertir su estado), lo que
  // exige el permiso puedeRevertirCompletado.
  if (existing.estado === 'COMPLETADO' && (typeof body.precio === 'number' || typeof body.descuento === 'number')) {
    throw forbidden('No se puede modificar el precio ni aplicar descuento a una acción ya realizada. Desrealízala primero.')
  }

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

  const updated = await db.tratamiento.update({ where: { id }, data, include: { prestacion: true } })
  if (tocaPresupuesto && Object.keys(data).length > 0) {
    await audit(db, actorId, {
      accion: 'EDITAR', entidad: 'Tratamiento', entidadId: id, pacienteId: existing.ficha.pacienteId,
      resumen: `Editó la acción "${existing.prestacion.nombre}"`,
      datosPrevios: { precio: existing.precio, descuento: existing.descuento, estado: existing.estado },
    })
  }
  return updated
}

export async function eliminarTratamiento(db: TenantClient, actorId: string, id: string) {
  const t = await db.tratamiento.findUnique({
    where: { id },
    select: { planId: true, estado: true, precio: true, descuento: true, diente: true, ficha: { select: { pacienteId: true } }, prestacion: { select: { nombre: true } } },
  })
  if (!t) throw notFound('Tratamiento no encontrado')
  // Borrar una acción YA REALIZADA altera la ficha clínica: solo el administrador.
  if (t.estado === 'COMPLETADO' && !(await esAdmin(db, actorId))) {
    throw forbidden('Solo un administrador puede eliminar una acción ya realizada (queda registrada en la ficha).')
  }
  await assertPlanDesbloqueado(db, t.planId)
  await db.tratamiento.delete({ where: { id } })
  await audit(db, actorId, {
    accion: 'ELIMINAR', entidad: 'Tratamiento', entidadId: id, pacienteId: t.ficha.pacienteId,
    resumen: `Eliminó la acción "${t.prestacion.nombre}"${t.diente ? ` · pieza ${t.diente}` : ''}`,
    datosPrevios: { estado: t.estado, precio: t.precio, descuento: t.descuento, diente: t.diente },
  })
}

// Evolucionar una acción: la marca COMPLETADA, (opcional) asigna el profesional
// que la realizó —por defecto el dueño del plan, pero se puede cambiar— y deja
// la evolución registrada en la ficha clínica del paciente. Todo atómico.
export async function evolucionarTratamiento(
  db: TenantClient, actorId: string, id: string,
  body: { texto: string; profesionalId?: string; fecha?: string },
) {
  if (!body.texto?.trim()) throw badRequest('Falta la evolución')
  const t = await db.tratamiento.findUnique({ where: { id }, select: { id: true, ficha: { select: { pacienteId: true } }, prestacion: { select: { nombre: true } } } })
  if (!t) throw notFound('Tratamiento no encontrado')
  if (body.profesionalId) {
    const doc = await db.user.findUnique({ where: { id: body.profesionalId }, select: { id: true } })
    if (!doc) throw notFound('Profesional no encontrado')
  }
  const fecha = body.fecha ? new Date(body.fecha) : new Date()
  const evo = await db.$transaction(async (tx) => {
    await tx.tratamiento.update({
      where: { id },
      data: {
        estado: 'COMPLETADO',
        fechaCompletado: fecha,
        ...(body.profesionalId ? { doctorId: body.profesionalId } : {}),
      },
    })
    return tx.evolucion.create({
      data: { pacienteId: t.ficha.pacienteId, tratamientoId: id, autorId: actorId, texto: body.texto.trim(), fecha },
      include: { autor: { select: { id: true, name: true, email: true, username: true } } },
    })
  })
  await audit(db, actorId, {
    accion: 'EVOLUCIONAR', entidad: 'Tratamiento', entidadId: id, pacienteId: t.ficha.pacienteId,
    resumen: `Evolucionó "${t.prestacion.nombre}" a realizada`,
  })
  return evo
}

// ── Evoluciones ────────────────────────────────────────────────────────────

export async function listarEvoluciones(db: TenantClient, pacienteId: string) {
  if (!pacienteId) throw badRequest('Falta pacienteId')
  return db.evolucion.findMany({
    where: { pacienteId },
    orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }],
    include: {
      autor: { select: { id: true, name: true, email: true, username: true } },
      tratamiento: {
        select: {
          id: true, diente: true, cara: true,
          prestacion: { select: { nombre: true } },
          doctor: { select: { id: true, name: true } },
        },
      },
    },
  })
}

export async function crearEvolucion(db: TenantClient, actorId: string, body: { pacienteId: string; tratamientoId?: string; texto: string; fecha?: string }) {
  if (!body.pacienteId || !body.texto?.trim()) throw badRequest('Faltan campos')
  const paciente = await db.paciente.findUnique({ where: { id: body.pacienteId }, select: { id: true } })
  if (!paciente) throw notFound('Paciente no encontrado')
  if (body.tratamientoId) {
    const t = await db.tratamiento.findUnique({ where: { id: body.tratamientoId }, select: { id: true } })
    if (!t) throw notFound('Tratamiento no encontrado')
  }
  const creada = await db.evolucion.create({
    data: {
      pacienteId: body.pacienteId, tratamientoId: body.tratamientoId || null, autorId: actorId,
      texto: body.texto.trim(), ...(body.fecha ? { fecha: new Date(body.fecha) } : {}),
    },
    include: { autor: { select: { id: true, name: true, email: true, username: true } } },
  })
  await audit(db, actorId, { accion: 'CREAR', entidad: 'Evolucion', entidadId: creada.id, pacienteId: body.pacienteId, resumen: `Registró una evolución clínica` })
  return creada
}

// Editar una evolución es modificar la ficha clínica: SOLO el administrador, y
// queda auditado con el texto anterior (trazabilidad legal).
export async function actualizarEvolucion(db: TenantClient, actor: JwtPayload, id: string, texto: string) {
  if (actor.role !== 'admin') throw forbidden('Solo un administrador puede editar una evolución de la ficha clínica.')
  if (!texto?.trim()) throw badRequest('El texto de la evolución no puede quedar vacío')
  const evo = await db.evolucion.findUnique({ where: { id }, select: { id: true, pacienteId: true, texto: true } })
  if (!evo) throw notFound('Evolución no existe')
  const updated = await db.evolucion.update({ where: { id }, data: { texto: texto.trim() }, include: { autor: { select: { id: true, name: true, email: true, username: true } } } })
  await audit(db, actor.sub, { accion: 'EDITAR', entidad: 'Evolucion', entidadId: id, pacienteId: evo.pacienteId, resumen: 'Editó una evolución clínica', datosPrevios: { texto: evo.texto } })
  return updated
}

export async function eliminarEvolucion(db: TenantClient, actor: JwtPayload, id: string) {
  // Borrar de la ficha clínica: SOLO el administrador (queda auditado).
  if (actor.role !== 'admin') throw forbidden('Solo un administrador puede eliminar una evolución de la ficha clínica.')
  const evo = await db.evolucion.findUnique({ where: { id }, select: { id: true, pacienteId: true, texto: true } })
  if (!evo) throw notFound('Evolución no existe')
  await db.evolucion.delete({ where: { id } })
  await audit(db, actor.sub, { accion: 'ELIMINAR', entidad: 'Evolucion', entidadId: id, pacienteId: evo.pacienteId, resumen: 'Eliminó una evolución clínica', datosPrevios: { texto: evo.texto } })
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
