import { prisma } from '@/lib/prisma'
import { badRequest, notFound } from '@/lib/errors'
import type { ClinicaConfigDTO, PrestacionDTO } from '@shared/types'

// ─── Prestaciones ────────────────────────────────────────────────────────────

function prestacionDTO(p: {
  id: string; nombre: string; descripcion: string | null; precio: number
  duracion: number; categoria: string | null; activo: boolean
}): PrestacionDTO {
  return p
}

export async function listarPrestaciones(clinicaId: string): Promise<PrestacionDTO[]> {
  const prestaciones = await prisma.prestacion.findMany({
    where: { clinicaId }, orderBy: [{ categoria: 'asc' }, { nombre: 'asc' }],
  })
  return prestaciones.map(prestacionDTO)
}

export async function crearPrestacion(clinicaId: string, input: { nombre: string; categoria?: string | null; precio: number; descripcion?: string | null; duracion?: number }): Promise<PrestacionDTO> {
  if (!input.nombre?.trim() || input.precio == null) throw badRequest('Faltan campos requeridos')
  const p = await prisma.prestacion.create({
    data: {
      clinicaId, nombre: input.nombre.trim(), categoria: input.categoria || null,
      precio: Number(input.precio), descripcion: input.descripcion || null,
      duracion: input.duracion ?? 30, activo: true,
    },
  })
  return prestacionDTO(p)
}

export async function actualizarPrestacion(clinicaId: string, id: string, body: Record<string, unknown>): Promise<PrestacionDTO> {
  const existing = await prisma.prestacion.findFirst({ where: { id, clinicaId }, select: { id: true } })
  if (!existing) throw notFound('Prestación no encontrada')
  const data: Record<string, unknown> = {}
  if (body.nombre !== undefined) data.nombre = String(body.nombre)
  if (body.categoria !== undefined) data.categoria = body.categoria || null
  if (body.precio !== undefined) data.precio = Number(body.precio)
  if (body.descripcion !== undefined) data.descripcion = body.descripcion || null
  if (body.duracion !== undefined) data.duracion = Number(body.duracion)
  if (body.activo !== undefined) data.activo = Boolean(body.activo)
  const p = await prisma.prestacion.update({ where: { id }, data })
  return prestacionDTO(p)
}

export async function eliminarPrestacion(clinicaId: string, id: string): Promise<void> {
  const r = await prisma.prestacion.deleteMany({ where: { id, clinicaId } })
  if (r.count === 0) throw notFound('Prestación no encontrada')
}

// ─── Configuración de la clínica ─────────────────────────────────────────────

function clinicaDTO(c: {
  id: string; nombre: string; direccion: string; telefono: string
  email: string; ciudad: string; mensajeWA: string; logoUrl: string | null
}): ClinicaConfigDTO {
  return c
}

export async function obtenerClinica(clinicaId: string): Promise<ClinicaConfigDTO> {
  const c = await prisma.clinica.findUnique({ where: { id: clinicaId } })
  if (!c) throw notFound('Clínica no encontrada')
  return clinicaDTO(c)
}

// ─── Medios de pago ──────────────────────────────────────────────────────────

export async function listarMediosPago(clinicaId: string) {
  return prisma.medioPago.findMany({ where: { clinicaId }, orderBy: { nombre: 'asc' } })
}

export async function crearMedioPago(clinicaId: string, body: { nombre: string; comision?: number }) {
  const nombre = (body.nombre ?? '').trim()
  if (!nombre) throw badRequest('nombre requerido')
  const comision = body.comision != null ? Number(body.comision) : 0
  if (!Number.isFinite(comision) || comision < 0 || comision > 100) throw badRequest('comision debe estar entre 0 y 100')
  return prisma.medioPago.create({ data: { clinicaId, nombre, comision } })
}

export async function actualizarMedioPago(clinicaId: string, id: string, body: Record<string, unknown>) {
  const existing = await prisma.medioPago.findFirst({ where: { id, clinicaId }, select: { id: true } })
  if (!existing) throw notFound('Medio de pago no encontrado')
  const data: Record<string, unknown> = {}
  if (body.nombre !== undefined) data.nombre = String(body.nombre)
  if (body.comision !== undefined) data.comision = Number(body.comision)
  if (body.activo !== undefined) data.activo = Boolean(body.activo)
  return prisma.medioPago.update({ where: { id }, data })
}

export async function eliminarMedioPago(clinicaId: string, id: string) {
  const r = await prisma.medioPago.deleteMany({ where: { id, clinicaId } })
  if (r.count === 0) throw notFound('Medio de pago no encontrado')
}

export async function actualizarClinica(clinicaId: string, body: Record<string, unknown>): Promise<ClinicaConfigDTO> {
  const data: Record<string, unknown> = {}
  if (body.nombre !== undefined) data.nombre = String(body.nombre)
  if (body.direccion !== undefined) data.direccion = String(body.direccion)
  if (body.telefono !== undefined) data.telefono = String(body.telefono)
  if (body.email !== undefined) data.email = String(body.email)
  if (body.ciudad !== undefined) data.ciudad = String(body.ciudad)
  if (body.mensajeWA !== undefined) data.mensajeWA = String(body.mensajeWA)
  if (body.logoUrl !== undefined) data.logoUrl = body.logoUrl || null
  const c = await prisma.clinica.update({ where: { id: clinicaId }, data })
  return clinicaDTO(c)
}
