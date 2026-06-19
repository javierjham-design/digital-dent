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

export async function crearPrestacion(db: TenantClient, input: { nombre: string; categoria?: string | null; precio: number; descripcion?: string | null; duracion?: number }): Promise<PrestacionDTO> {
  if (!input.nombre?.trim() || input.precio == null) throw badRequest('Faltan campos requeridos')
  const p = await db.prestacion.create({
    data: {
      nombre: input.nombre.trim(), categoria: input.categoria || null,
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
  await db.prestacion.delete({ where: { id } })
}

// ─── Configuración de la clínica (singleton en la base del tenant) ───────────

function clinicaDTO(c: {
  nombre: string; direccion: string; telefono: string
  email: string; ciudad: string; mensajeWA: string; logoUrl: string | null
}): ClinicaConfigDTO {
  return { id: 'singleton', nombre: c.nombre, direccion: c.direccion, telefono: c.telefono, email: c.email, ciudad: c.ciudad, mensajeWA: c.mensajeWA, logoUrl: c.logoUrl }
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
  if (body.email !== undefined) data.email = String(body.email)
  if (body.ciudad !== undefined) data.ciudad = String(body.ciudad)
  if (body.mensajeWA !== undefined) data.mensajeWA = String(body.mensajeWA)
  if (body.logoUrl !== undefined) data.logoUrl = body.logoUrl || null
  const c = await db.configuracion.upsert({ where: { id: 'singleton' }, update: data, create: { id: 'singleton', ...data } })
  return clinicaDTO(c)
}

// ─── Medios de pago ──────────────────────────────────────────────────────────

export async function listarMediosPago(db: TenantClient) {
  return db.medioPago.findMany({ orderBy: { nombre: 'asc' } })
}

export async function crearMedioPago(db: TenantClient, body: { nombre: string; comision?: number }) {
  const nombre = (body.nombre ?? '').trim()
  if (!nombre) throw badRequest('nombre requerido')
  const comision = body.comision != null ? Number(body.comision) : 0
  if (!Number.isFinite(comision) || comision < 0 || comision > 100) throw badRequest('comision debe estar entre 0 y 100')
  return db.medioPago.create({ data: { nombre, comision } })
}

export async function actualizarMedioPago(db: TenantClient, id: string, body: Record<string, unknown>) {
  const existing = await db.medioPago.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw notFound('Medio de pago no encontrado')
  const data: Record<string, unknown> = {}
  if (body.nombre !== undefined) data.nombre = String(body.nombre)
  if (body.comision !== undefined) data.comision = Number(body.comision)
  if (body.activo !== undefined) data.activo = Boolean(body.activo)
  return db.medioPago.update({ where: { id }, data })
}

export async function eliminarMedioPago(db: TenantClient, id: string) {
  const existing = await db.medioPago.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw notFound('Medio de pago no encontrado')
  await db.medioPago.delete({ where: { id } })
}
