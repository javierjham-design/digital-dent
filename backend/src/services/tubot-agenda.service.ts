import type { TenantClient } from '@/db/tenant'
import { conTitulo } from '@shared/utils/nombre'
import { slotsLibres } from '@/services/agenda-online.service'
import { todayYmd, addDaysYmd } from '@/lib/tz'

// Adaptadores del modelo de Cláriva al CONTRATO de TuBot (docs/TUBOT_AGENDA.md).
// Cada token = una clínica (un tenant); Cláriva no tiene "múltiples sedes", así que
// `clinicId` == el slug de la clínica. Lectura de catálogo (Fase 1) + disponibilidad (Fase 2).

export interface SchedClinic { id: string; name: string; address?: string; timezone: string }
export interface SchedProfessional { id: string; name: string; specialty?: string; clinicIds?: string[] }
export interface SchedService { id: string; name: string; durationMin: number; price?: number; currency?: string }
export interface SchedSlot { start: string; end: string; professionalId: string; clinicId: string; serviceId?: string }

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

const YMD = /^\d{4}-\d{2}-\d{2}$/
const MAX_DIAS = 62 // tope del rango consultable (evita barridos enormes)
const DURACION_DEFECTO = 30

// GET /availability → slots libres, según HorarioDoctor + ocupación, en pasos de la
// duración del servicio (o 30'). Sin `professionalId` devuelve los de todos los
// profesionales; el rango [from,to] son fechas civiles (hora de la clínica) y se
// acota a hoy…hoy+MAX_DIAS. `start`/`end` en ISO 8601 UTC.
export async function availability(
  db: TenantClient, slug: string, q: { professionalId?: string; serviceId?: string; from?: string; to?: string },
): Promise<SchedSlot[]> {
  const from = q.from && YMD.test(q.from) ? q.from : todayYmd()
  let to = q.to && YMD.test(q.to) ? q.to : from
  if (to < from) to = from
  const maxTo = addDaysYmd(from, MAX_DIAS)
  if (to > maxTo) to = maxTo

  let durationMin = DURACION_DEFECTO
  if (q.serviceId) {
    const p = await db.prestacion.findUnique({ where: { id: q.serviceId }, select: { duracion: true } })
    if (p?.duracion) durationMin = p.duracion
  }

  const docs = await db.user.findMany({
    where: { role: { in: ROLES_CON_AGENDA }, activo: true, ...(q.professionalId ? { id: q.professionalId } : {}) },
    select: { id: true },
  })

  const out: SchedSlot[] = []
  for (const d of docs) {
    const libres = await slotsLibres(db, d.id, durationMin, from, to)
    for (const s of libres) {
      out.push({ start: s.start.toISOString(), end: s.end.toISOString(), professionalId: d.id, clinicId: slug, ...(q.serviceId ? { serviceId: q.serviceId } : {}) })
    }
  }
  out.sort((a, b) => a.start.localeCompare(b.start))
  return out
}
