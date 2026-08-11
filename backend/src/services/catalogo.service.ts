import type { TenantClient } from '@/db/tenant'
import { badRequest, notFound } from '@/lib/errors'
import type { ClinicaConfigDTO, PrestacionDTO } from '@shared/types'

// ─── Prestaciones ────────────────────────────────────────────────────────────

function prestacionDTO(p: {
  id: string; nombre: string; descripcion: string | null; precio: number
  duracion: number; categoria: string | null; categoriaId?: string | null; activo: boolean
}): PrestacionDTO {
  return { ...p, categoriaId: p.categoriaId ?? null }
}

// `area` opcional: filtra las prestaciones de esa área (derivada de su categoría).
// Sin parámetro devuelve todo (comportamiento previo intacto).
export async function listarPrestaciones(db: TenantClient, area?: string): Promise<PrestacionDTO[]> {
  const prestaciones = await db.prestacion.findMany({ orderBy: [{ categoria: 'asc' }, { nombre: 'asc' }] })
  if (!area) return prestaciones.map(prestacionDTO)
  const areaDe = await resolverAreaPorCategoria(db)
  const buscada = area.trim().toUpperCase()
  return prestaciones.filter((p) => areaDe(p) === buscada).map(prestacionDTO)
}

// ─── Categorías / secciones del catálogo ─────────────────────────────────────

export interface CategoriaPrestacionDTO { id: string; nombre: string; area: string; orden: number; noLiquidable: boolean }

// Lista las secciones (categorías) del catálogo, ordenadas. La primera vez las
// siembra a partir de las categorías ya usadas por las prestaciones existentes.
export async function listarCategorias(db: TenantClient, area?: string): Promise<CategoriaPrestacionDTO[]> {
  let cats = await db.categoriaPrestacion.findMany({ orderBy: [{ orden: 'asc' }, { nombre: 'asc' }] })
  if (cats.length === 0) {
    const usadas = await db.prestacion.findMany({ where: { categoria: { not: null } }, select: { categoria: true }, distinct: ['categoria'] })
    const nombres = [...new Set(usadas.map((u) => (u.categoria ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'))
    if (nombres.length) {
      await db.categoriaPrestacion.createMany({ data: nombres.map((nombre, i) => ({ nombre, orden: i })) })
      cats = await db.categoriaPrestacion.findMany({ orderBy: [{ orden: 'asc' }, { nombre: 'asc' }] })
    }
  }
  if (area) {
    const buscada = area.trim().toUpperCase()
    return cats.filter((c) => c.area === buscada)
  }
  return cats
}

// Unicidad de secciones POR ÁREA, no global: una sección "General" dental y otra
// "General" de estética son legítimas y distintas. Único punto de validación de
// duplicados de sección (respaldado por el @@unique([nombre, area]) del schema).
async function categoriaDuplicada(db: TenantClient, nombre: string, area?: string, excluirId?: string): Promise<boolean> {
  const areaBuscada = (area || AREA_DEFAULT).trim().toUpperCase()
  const dup = await db.categoriaPrestacion.findFirst({
    where: { nombre, area: areaBuscada, ...(excluirId ? { NOT: { id: excluirId } } : {}) },
    select: { id: true },
  })
  return Boolean(dup)
}

export async function crearCategoria(db: TenantClient, nombre: string, area?: string): Promise<CategoriaPrestacionDTO> {
  const n = (nombre ?? '').trim()
  if (!n) throw badRequest('Falta el nombre de la sección')
  const a = (area || AREA_DEFAULT).trim().toUpperCase()
  if (!['DENTAL', 'ESTETICA', 'MEDICO'].includes(a)) throw badRequest('Área inválida (DENTAL | ESTETICA | MEDICO)')
  if (await categoriaDuplicada(db, n, a)) throw badRequest('Ya existe una sección con ese nombre en esta área')
  const max = await db.categoriaPrestacion.aggregate({ _max: { orden: true } })
  return db.categoriaPrestacion.create({ data: { nombre: n, area: a, orden: (max._max.orden ?? -1) + 1 } })
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
      // Duplicado DENTRO del área de la sección que se renombra (ver categoriaDuplicada).
      if (await categoriaDuplicada(db, n, existing.area, id)) throw badRequest('Ya existe una sección con ese nombre en esta área')
      data.nombre = n
      // Renombrar la copia derivada `categoria` en las prestaciones de ESTA sección
      // (por FK, no por nombre: con secciones homónimas el nombre arrastraría otra área).
      await db.prestacion.updateMany({ where: { categoriaId: id }, data: { categoria: n } })
      // Filas legacy sin backfill (categoriaId null) son DENTAL por definición: si esta
      // sección es dental, las adopta (auto-sana el vínculo al renombrar).
      if (existing.area === AREA_DEFAULT) {
        await db.prestacion.updateMany({ where: { categoriaId: null, categoria: existing.nombre }, data: { categoria: n, categoriaId: id } })
      }
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
  // Las prestaciones que la usaban quedan "Sin categoría" (no se borran). Por FK;
  // las legacy sin backfill (dental por definición) se limpian por nombre solo si
  // esta sección es dental.
  await db.prestacion.updateMany({ where: { categoriaId: id }, data: { categoria: null, categoriaId: null } })
  if (existing.area === AREA_DEFAULT) {
    await db.prestacion.updateMany({ where: { categoriaId: null, categoria: existing.nombre }, data: { categoria: null } })
  }
  await db.categoriaPrestacion.delete({ where: { id } })
}

// Predicado "esta prestación es NO liquidable" (laboratorios/insumos que no se
// pagan al profesional). Por categoriaId cuando existe; por nombre SOLO para
// filas legacy sin FK (con secciones homónimas entre áreas, el nombre solo
// marcaría de más). Excluye esas acciones del cálculo de la liquidación.
export async function filtroNoLiquidable(db: TenantClient): Promise<(p: { categoriaId?: string | null; categoria?: string | null }) => boolean> {
  const cats = await db.categoriaPrestacion.findMany({ where: { noLiquidable: true }, select: { id: true, nombre: true } })
  const ids = new Set(cats.map((c) => c.id))
  const nombres = new Set(cats.map((c) => c.nombre))
  return (p) => (p.categoriaId ? ids.has(p.categoriaId) : Boolean(p.categoria && nombres.has(p.categoria)))
}

const normNombre = (s: string | null | undefined) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

// ─── Áreas clínicas: resolución de área en el catálogo ───────────────────────
// El área de una prestación se DERIVA de su categoría (CategoriaPrestacion.area).
// Este resolver es el ÚNICO punto que decide el área de una prestación:
// `categoriaId` manda (fuente de verdad; con secciones homónimas en áreas
// distintas el nombre es ambiguo); el nombre queda como fallback para filas
// legacy sin backfill, que son DENTAL por definición.
export const AREA_DEFAULT = 'DENTAL'
export type ResolverArea = (p: { categoriaId?: string | null; categoria?: string | null }) => string
export async function resolverAreaPorCategoria(db: TenantClient): Promise<ResolverArea> {
  const cats = await db.categoriaPrestacion.findMany({ select: { id: true, nombre: true, area: true } })
  const porId = new Map(cats.map((c) => [c.id, c.area || AREA_DEFAULT]))
  const porNombre = new Map(cats.map((c) => [normNombre(c.nombre), c.area || AREA_DEFAULT]))
  return (p) => (p.categoriaId ? porId.get(p.categoriaId) : undefined) ?? porNombre.get(normNombre(p.categoria ?? null)) ?? AREA_DEFAULT
}

// Clave de identidad de una prestación: ÁREA + nombre + categoría (normalizados).
// El área va en la clave a propósito: una "Consulta" dental y una "Consulta" de
// estética en secciones homónimas son prestaciones DISTINTAS y jamás deben
// fusionarse (dedupe corre solo en cada arranque, sobre todas las clínicas).
export const prestacionKey = (nombre: string | null, categoria: string | null, area: string = AREA_DEFAULT) =>
  `${(area || AREA_DEFAULT).trim().toUpperCase()}||${normNombre(nombre)}||${normNombre(categoria)}`

// PURA (testeable sin base): agrupa las prestaciones que son duplicados reales
// (misma área + nombre + categoría). Devuelve solo los grupos con más de una.
// El área se resuelve POR PRESTACIÓN (vía categoriaId): con secciones homónimas
// en áreas distintas ("General" dental y "General" estética), el nombre solo no
// alcanza para decidir el área.
export function agruparPrestacionesDuplicadas<T extends { nombre: string; categoria: string | null }>(
  prestaciones: T[], areaDe: (p: T) => string,
): T[][] {
  const grupos = new Map<string, T[]>()
  for (const p of prestaciones) {
    const key = prestacionKey(p.nombre, p.categoria, areaDe(p))
    const arr = grupos.get(key) ?? []; arr.push(p); grupos.set(key, arr)
  }
  return [...grupos.values()].filter((arr) => arr.length > 1)
}

// Deja una sola prestación por (área, nombre, categoría): fusiona las duplicadas
// repuntando los tratamientos e ítems de presupuesto a la que se conserva (la
// más referenciada, para no perder precios en uso). Idempotente y FK-safe:
// Tratamiento e ItemPresupuesto son las ÚNICAS tablas que apuntan a Prestacion.
export async function dedupePrestaciones(db: TenantClient): Promise<{ duplicados: number; eliminadas: number; restantes: number }> {
  const prestaciones = await db.prestacion.findMany({
    select: { id: true, nombre: true, categoria: true, categoriaId: true, _count: { select: { tratamientos: true, itemsPresupuesto: true } } },
  })
  const areaDe = await resolverAreaPorCategoria(db)
  const aFusionar = agruparPrestacionesDuplicadas(prestaciones, areaDe)
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

// ÚNICO punto que resuelve el par (categoriaId, categoria) de una prestación.
// `categoriaId` es la fuente de verdad; `categoria` (string) es la copia derivada
// del nombre de esa sección. Los callers legacy que mandan solo el nombre se
// resuelven contra la sección homónima (prefiriendo DENTAL si hubiera homónimas);
// si la sección no existe como fila, queda solo el string (comportamiento previo).
async function resolverCategoriaDestino(db: TenantClient, input: { categoriaId?: string | null; categoria?: string | null }): Promise<{ categoriaId: string | null; categoria: string | null }> {
  if (input.categoriaId) {
    const cat = await db.categoriaPrestacion.findUnique({ where: { id: input.categoriaId }, select: { id: true, nombre: true } })
    if (!cat) throw badRequest('La sección indicada no existe')
    return { categoriaId: cat.id, categoria: cat.nombre }
  }
  const nombre = (input.categoria ?? '').trim() || null
  if (!nombre) return { categoriaId: null, categoria: null }
  const cats = await db.categoriaPrestacion.findMany({ where: { nombre }, select: { id: true, area: true } })
  const cat = cats.find((c) => c.area === AREA_DEFAULT) ?? cats[0] ?? null
  return { categoriaId: cat?.id ?? null, categoria: nombre }
}

export async function crearPrestacion(db: TenantClient, input: { nombre: string; categoria?: string | null; categoriaId?: string | null; precio: number; descripcion?: string | null; duracion?: number }): Promise<PrestacionDTO> {
  if (!input.nombre?.trim() || input.precio == null) throw badRequest('Faltan campos requeridos')
  const nombre = input.nombre.trim()
  const destino = await resolverCategoriaDestino(db, input)
  // Idempotente: si ya existe una prestación con el mismo (área, nombre, categoría),
  // se reutiliza (reactivándola si estaba inactiva) en lugar de crear un duplicado.
  // El área se deriva de la categoría (categoriaId manda), igual que en dedupe.
  const areaDe = await resolverAreaPorCategoria(db)
  const todas = await db.prestacion.findMany({ select: { id: true, nombre: true, categoria: true, categoriaId: true, activo: true } })
  const keyNueva = prestacionKey(nombre, destino.categoria, areaDe(destino))
  const dup = todas.find((p) => prestacionKey(p.nombre, p.categoria, areaDe(p)) === keyNueva)
  if (dup) {
    const p = await db.prestacion.update({ where: { id: dup.id }, data: { activo: true, precio: Number(input.precio), ...(input.descripcion !== undefined ? { descripcion: input.descripcion || null } : {}) } })
    return prestacionDTO(p)
  }
  const p = await db.prestacion.create({
    data: {
      nombre, categoria: destino.categoria, categoriaId: destino.categoriaId,
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
  // Cambio de sección: SIEMPRE por el resolver (escribe el par categoriaId+categoria).
  if (body.categoriaId !== undefined || body.categoria !== undefined) {
    const destino = await resolverCategoriaDestino(db, {
      categoriaId: body.categoriaId != null && body.categoriaId !== '' ? String(body.categoriaId) : null,
      categoria: typeof body.categoria === 'string' ? body.categoria : null,
    })
    data.categoria = destino.categoria
    data.categoriaId = destino.categoriaId
  }
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
