import type { TenantClient } from '@/db/tenant'
import { conTitulo } from '@shared/utils/nombre'

// Adaptadores del modelo de Cláriva al CONTRATO de TuBot (docs/TUBOT_AGENDA.md).
// Cada token = una clínica (un tenant); Cláriva no tiene "múltiples sedes", así que
// `clinicId` == el slug de la clínica. Sólo lectura de catálogo (Fase 1).

export interface SchedClinic { id: string; name: string; address?: string; timezone: string }
export interface SchedProfessional { id: string; name: string; specialty?: string; clinicIds?: string[] }
export interface SchedService { id: string; name: string; durationMin: number; price?: number; currency?: string }

// Zona horaria IANA por país (Configuracion.pais). Chile por defecto.
const TZ: Record<string, string> = {
  CL: 'America/Santiago', CR: 'America/Costa_Rica', PA: 'America/Panama',
  PE: 'America/Lima', MX: 'America/Mexico_City', AR: 'America/Argentina/Buenos_Aires', CO: 'America/Bogota',
}
const tzDe = (pais?: string | null) => TZ[(pais ?? 'CL').toUpperCase()] ?? 'America/Santiago'

const ROLES_CON_AGENDA = ['doctor', 'medico']

// GET /clinics → la clínica (tenant) como única "sede".
export async function clinics(db: TenantClient, slug: string): Promise<SchedClinic[]> {
  const c = await db.configuracion.findUnique({
    where: { id: 'singleton' },
    select: { nombre: true, direccion: true, ciudad: true, pais: true },
  })
  const address = [c?.direccion, c?.ciudad].filter(Boolean).join(', ') || undefined
  return [{ id: slug, name: c?.nombre || slug, address, timezone: tzDe(c?.pais) }]
}

// GET /professionals → profesionales con agenda (doctores/médicos activos).
export async function professionals(db: TenantClient, slug: string): Promise<SchedProfessional[]> {
  const docs = await db.user.findMany({
    where: { role: { in: ROLES_CON_AGENDA }, activo: true },
    select: { id: true, name: true, titulo: true, especialidad: true },
    orderBy: { name: 'asc' },
  })
  return docs.map((d) => ({
    id: d.id,
    name: conTitulo(d.titulo, d.name) || d.name || '',
    specialty: d.especialidad || undefined,
    clinicIds: [slug],
  }))
}

// GET /services → prestaciones activas (una prestación = un "servicio" agendable).
export async function services(db: TenantClient): Promise<SchedService[]> {
  const ps = await db.prestacion.findMany({
    where: { activo: true },
    select: { id: true, nombre: true, duracion: true, precio: true },
    orderBy: { nombre: 'asc' },
  })
  return ps.map((p) => ({ id: p.id, name: p.nombre, durationMin: p.duracion, price: p.precio, currency: 'CLP' }))
}

// GET /professionals/:id/services → prestaciones de las ÁREAS habilitadas del
// profesional (no hay tabla doctor↔prestación; se mapea por área).
export async function professionalServices(db: TenantClient, professionalId: string): Promise<SchedService[]> {
  const doc = await db.user.findUnique({
    where: { id: professionalId },
    select: { role: true, activo: true, areaDental: true, areaEstetica: true, areaMedico: true },
  })
  if (!doc || !doc.activo || !ROLES_CON_AGENDA.includes(doc.role)) return []
  const areas: string[] = []
  if (doc.areaDental) areas.push('DENTAL')
  if (doc.areaEstetica) areas.push('ESTETICA')
  if (doc.areaMedico) areas.push('MEDICO')
  if (areas.length === 0) return []
  const ps = await db.prestacion.findMany({
    where: { activo: true, categoriaRef: { area: { in: areas } } },
    select: { id: true, nombre: true, duracion: true, precio: true },
    orderBy: { nombre: 'asc' },
  })
  return ps.map((p) => ({ id: p.id, name: p.nombre, durationMin: p.duracion, price: p.precio, currency: 'CLP' }))
}
