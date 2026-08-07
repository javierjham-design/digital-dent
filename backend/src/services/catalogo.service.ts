import type { TenantClient } from '@/db/tenant'
import { badRequest, notFound } from '@/lib/errors'
import type { ClinicaConfigDTO, PrestacionDTO } from '@shared/types'

// ─── Prestaciones ────────────────────────────────────────────────────────────

function prestacionDTO(p: {
  id: string; nombre: string; descripcion: string | null; precio: number
  duracion: number; categoria: string | null; activo: boolean
}): PrestacionDTO {
  return p
}

export async function listarPrestaciones(db: TenantClient): Promise<PrestacionDTO[]> {
  const prestaciones = await db.prestacion.findMany({ orderBy: [{ categoria: 'asc' }, { nombre: 'asc' }] })
  return prestaciones.map(prestacionDTO)
}

// ─── Categorías / secciones del catálogo ─────────────────────────────────────

export interface CategoriaPrestacionDTO { id: string; nombre: string; orden: number; noLiquidable: boolean }

// Lista las secciones (categorías) del catálogo, ordenadas. La primera vez las
// siembra a partir de las categorías ya usadas por las prestaciones existentes.
export async function listarCategorias(db: TenantClient): Promise<CategoriaPrestacionDTO[]> {
  let cats = await db.categoriaPrestacion.findMany({ orderBy: [{ orden: 'asc' }, { nombre: 'asc' }] })
  if (cats.length === 0) {
    const usadas = await db.prestacion.findMany({ where: { categoria: { not: null } }, select: { categoria: true }, distinct: ['categoria'] })
    const nombres = [...new Set(usadas.map((u) => (u.categoria ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'))
    if (nombres.length) {
      await db.categoriaPrestacion.createMany({ data: nombres.map((nombre, i) => ({ nombre, orden: i })) })
      cats = await db.categoriaPrestacion.findMany({ orderBy: [{ orden: 'asc' }, { nombre: 'asc' }] })
    }
  }
  return cats
}

export async function crearCategoria(db: TenantClient, nombre: string): Promise<CategoriaPrestacionDTO> {
  const n = (nombre ?? '').trim()
  if (!n) throw badRequest('Falta el nombre de la sección')
  const dup = await db.categoriaPrestacion.findUnique({ where: { nombre: n }, select: { id: true } })
  if (dup) throw badRequest('Ya existe una sección con ese nombre')
  const max = await db.categoriaPrestacion.aggregate({ _max: { orden: true } })
  return db.categoriaPrestacion.create({ data: { nombre: n, orden: (max._max.orden ?? -1) + 1 } })
}

export async function actualizarCategoria(db: TenantClient, id: string, body: { nombre?: string; noLiquidable?: boolean }): Promise<CategoriaPrestacionDTO> {
  const existing = await db.categoriaPrestacion.findUnique({ where: { id } })
  if (!existing) throw notFound('Sección no encontrada')
  const data: Record<string, unknown> = {}
  if (typeof body.noLiquidable === 'boolean') data.noLiquidable = body.noLiquidable
  if (typeof body.nombre === 'string') {
    const n = body.nombre.trim()
    if (!n) throw badRequest('El nombre no puede quedar vacío')
    if (n !== existing.nombre) {
      const dup = await db.categoriaPrestacion.findFirst({ where: { nombre: n, NOT: { id } }, select: { id: true } })
      if (dup) throw badRequest('Ya existe una sección con ese nombre')
      data.nombre = n
      // Renombrar la categoría también en las prestaciones que la usaban.
      await db.prestacion.updateMany({ where: { categoria: existing.nombre }, data: { categoria: n } })
    }
  }
  return db.categoriaPrestacion.update({ where: { id }, data })
}

export async function reordenarCategorias(db: TenantClient, ids: string[]): Promise<void> {
  await db.$transaction(ids.map((id, i) => db.categoriaPrestacion.update({ where: { id }, data: { orden: i } })))
}

export async function eliminarCategoria(db: TenantClient, id: string): Promise<void> {
  const existing = await db.categoriaPrestacion.findUnique({ where: { id } })
  if (!existing) throw notFound('Sección no encontrada')
  // Las prestaciones que la usaban quedan "Sin categoría" (no se borran).
  await db.prestacion.updateMany({ where: { categoria: existing.nombre }, data: { categoria: null } })
  await db.categoriaPrestacion.delete({ where: { id } })
}

// Conjunto de nombres de categorías NO liquidables (laboratorios/insumos). Se usa
// para excluir esas acciones del cálculo de la liquidación del profesional.
export async function categoriasNoLiquidables(db: TenantClient): Promise<Set<string>> {
  const cats = await db.categoriaPrestacion.findMany({ where: { noLiquidable: true }, select: { nombre: true } })
  return new Set(cats.map((c) => c.nombre))
}

const normNombre = (s: string | null | undefined) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
// Clave de identidad de una prestación: nombre + categoría (ambos normalizados).
// Solo se fusionan prestaciones realmente equivalentes (mismo nombre Y categoría).
const prestacionKey = (nombre: string | null, categoria: string | null) => `${normNombre(nombre)}||${normNombre(categoria)}`

// Deja una sola prestación por (nombre, categoría): fusiona las duplicadas
// repuntando los tratamientos e ítems de presupuesto a la que se conserva (la
// más referenciada, para no perder precios en uso). Idempotente y FK-safe:
// Tratamiento e ItemPresupuesto son las ÚNICAS tablas que apuntan a Prestacion.
export async function dedupePrestaciones(db: TenantClient): Promise<{ duplicados: number; eliminadas: number; restantes: number }> {
  const prestaciones = await db.prestacion.findMany({
    select: { id: true, nombre: true, categoria: true, _count: { select: { tratamientos: true, itemsPresupuesto: true } } },
  })
  const grupos = new Map<string, typeof prestaciones>()
  for (const p of prestaciones) {
    const key = prestacionKey(p.nombre, p.categoria)
    const arr = grupos.get(key) ?? []; arr.push(p); grupos.set(key, arr)
  }
  const aFusionar = [...grupos.values()].filter((arr) => arr.length > 1)
  if (aFusionar.length === 0) return { duplicados: 0, eliminadas: 0, restantes: prestaciones.length }

  // Cada fusión son 3 operaciones (reasignar tratamiento + itemPresupuesto, borrar
  // duplicadas): DEBEN ir en una transacción para que un corte a mitad —este job
  // corre en cada arranque, incluso durante un deploy— no deje datos apuntando a una
  // prestación ya borrada.
  let eliminadas = 0
  await db.$transaction(async (tx) => {
    for (const arr of aFusionar) {
      arr.sort((a, b) => (b._count.tratamientos + b._count.itemsPresupuesto) - (a._count.tratamientos + a._count.itemsPresupuesto))
      const keep = arr[0]
      const dupIds = arr.slice(1).map((d) => d.id)
      await tx.tratamiento.updateMany({ where: { prestacionId: { in: dupIds } }, data: { prestacionId: keep.id } })
      await tx.itemPresupuesto.updateMany({ where: { prestacionId: { in: dupIds } }, data: { prestacionId: keep.id } })
      // Los montos fijos de las duplicadas se descartan (config; la canónica conserva los
      // suyos). No se repuntan para no chocar con el unique (doctorId, prestacionId).
      await tx.montoFijoPrestacion.deleteMany({ where: { prestacionId: { in: dupIds } } })
      await tx.prestacion.deleteMany({ where: { id: { in: dupIds } } })
      eliminadas += dupIds.length
    }
  })
  return { duplicados: aFusionar.length, eliminadas, restantes: prestaciones.length - eliminadas }
}

export async function crearPrestacion(db: TenantClient, input: { nombre: string; categoria?: string | null; precio: number; descripcion?: string | null; duracion?: number }): Promise<PrestacionDTO> {
  if (!input.nombre?.trim() || input.precio == null) throw badRequest('Faltan campos requeridos')
  const nombre = input.nombre.trim()
  const categoria = input.categoria || null
  // Idempotente: si ya existe una prestación con el mismo nombre y categoría, se
  // reutiliza (reactivándola si estaba inactiva) en lugar de crear un duplicado.
  const todas = await db.prestacion.findMany({ select: { id: true, nombre: true, categoria: true, activo: true } })
  const dup = todas.find((p) => prestacionKey(p.nombre, p.categoria) === prestacionKey(nombre, categoria))
  if (dup) {
    const p = await db.prestacion.update({ where: { id: dup.id }, data: { activo: true, precio: Number(input.precio), ...(input.descripcion !== undefined ? { descripcion: input.descripcion || null } : {}) } })
    return prestacionDTO(p)
  }
  const p = await db.prestacion.create({
    data: {
      nombre, categoria,
      precio: Number(input.precio), descripcion: input.descripcion || null,
      duracion: input.duracion ?? 30, activo: true,
    },
  })
  return prestacionDTO(p)
}

export async function actualizarPrestacion(db: TenantClient, id: string, body: Record<string, unknown>): Promise<PrestacionDTO> {
  const existing = await db.prestacion.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw notFound('Prestación no encontrada')
  const data: Record<string, unknown> = {}
  if (body.nombre !== undefined) data.nombre = String(body.nombre)
  if (body.categoria !== undefined) data.categoria = body.categoria || null
  if (body.precio !== undefined) data.precio = Number(body.precio)
  if (body.descripcion !== undefined) data.descripcion = body.descripcion || null
  if (body.duracion !== undefined) data.duracion = Number(body.duracion)
  if (body.activo !== undefined) data.activo = Boolean(body.activo)
  const p = await db.prestacion.update({ where: { id }, data })
  return prestacionDTO(p)
}

export async function eliminarPrestacion(db: TenantClient, id: string): Promise<void> {
  const existing = await db.prestacion.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw notFound('Prestación no encontrada')
  // Los montos fijos por prestación son config (no datos clínicos): se limpian para no
  // bloquear el borrado por la FK. Los tratamientos SÍ bloquean (RESTRICT), como antes.
  await db.montoFijoPrestacion.deleteMany({ where: { prestacionId: id } })
  await db.prestacion.delete({ where: { id } })
}

// ─── Configuración de la clínica (singleton en la base del tenant) ───────────

function clinicaDTO(c: {
  nombre: string; direccion: string; telefono: string; whatsapp?: string
  email: string; ciudad: string; mensajeWA: string; mensajeWACrm?: string; mensajeReservaWA?: string; logoUrl: string | null; pais?: string
}): ClinicaConfigDTO {
  return { id: 'singleton', nombre: c.nombre, direccion: c.direccion, telefono: c.telefono, whatsapp: c.whatsapp ?? '', email: c.email, ciudad: c.ciudad, mensajeWA: c.mensajeWA, mensajeWACrm: c.mensajeWACrm ?? '', mensajeReservaWA: c.mensajeReservaWA ?? '', logoUrl: c.logoUrl, pais: c.pais ?? 'CL' }
}

export async function obtenerClinica(db: TenantClient): Promise<ClinicaConfigDTO> {
  const c = await db.configuracion.findUnique({ where: { id: 'singleton' } })
  if (!c) throw notFound('Configuración no encontrada')
  return clinicaDTO(c)
}

export async function actualizarClinica(db: TenantClient, body: Record<string, unknown>): Promise<ClinicaConfigDTO> {
  const data: Record<string, unknown> = {}
  if (body.nombre !== undefined) data.nombre = String(body.nombre)
  if (body.direccion !== undefined) data.direccion = String(body.direccion)
  if (body.telefono !== undefined) data.telefono = String(body.telefono)
  if (body.whatsapp !== undefined) data.whatsapp = String(body.whatsapp)
  if (body.email !== undefined) data.email = String(body.email)
  if (body.ciudad !== undefined) data.ciudad = String(body.ciudad)
  if (body.mensajeWA !== undefined) data.mensajeWA = String(body.mensajeWA)
  if (body.mensajeWACrm !== undefined) data.mensajeWACrm = String(body.mensajeWACrm)
  if (body.mensajeReservaWA !== undefined) data.mensajeReservaWA = String(body.mensajeReservaWA)
  if (body.logoUrl !== undefined) data.logoUrl = body.logoUrl || null
  const c = await db.configuracion.upsert({ where: { id: 'singleton' }, update: data, create: { id: 'singleton', ...data } })
  return clinicaDTO(c)
}

// ─── Medios de pago ──────────────────────────────────────────────────────────

export async function listarMediosPago(db: TenantClient) {
  return db.medioPago.findMany({ orderBy: { nombre: 'asc' } })
}

export async function crearMedioPago(db: TenantClient, body: { nombre: string; comision?: number; requiereReferencia?: boolean }) {
  const nombre = (body.nombre ?? '').trim()
  if (!nombre) throw badRequest('nombre requerido')
  const comision = body.comision != null ? Number(body.comision) : 0
  if (!Number.isFinite(comision) || comision < 0 || comision > 100) throw badRequest('comision debe estar entre 0 y 100')
  return db.medioPago.create({ data: { nombre, comision, requiereReferencia: Boolean(body.requiereReferencia) } })
}

export async function actualizarMedioPago(db: TenantClient, id: string, body: Record<string, unknown>) {
  const existing = await db.medioPago.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw notFound('Medio de pago no encontrado')
  const data: Record<string, unknown> = {}
  if (body.nombre !== undefined) data.nombre = String(body.nombre)
  if (body.comision !== undefined) data.comision = Number(body.comision)
  if (body.activo !== undefined) data.activo = Boolean(body.activo)
  if (body.requiereReferencia !== undefined) data.requiereReferencia = Boolean(body.requiereReferencia)
  return db.medioPago.update({ where: { id }, data })
}

export async function eliminarMedioPago(db: TenantClient, id: string) {
  const existing = await db.medioPago.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw notFound('Medio de pago no encontrado')
  await db.medioPago.delete({ where: { id } })
}
