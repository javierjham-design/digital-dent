import { prisma } from '@/lib/prisma'
import { badRequest, notFound } from '@/lib/errors'
import type { PacienteDTO } from '@shared/types'

function toDTO(p: {
  id: string; numero: number | null; rut: string | null; nombre: string; apellido: string
  telefono: string | null; email: string | null; prevision: string | null
  fechaNacimiento: Date | null; activo: boolean
}): PacienteDTO {
  return {
    id: p.id, numero: p.numero, rut: p.rut, nombre: p.nombre, apellido: p.apellido,
    telefono: p.telefono, email: p.email, prevision: p.prevision,
    fechaNacimiento: p.fechaNacimiento?.toISOString() ?? null, activo: p.activo,
  }
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export async function listarPacientes(clinicaId: string, q?: string): Promise<PacienteDTO[]> {
  const pacientes = await prisma.paciente.findMany({
    where: { clinicaId, activo: true },
    orderBy: { nombre: 'asc' },
    take: 500,
  })
  const dtos = pacientes.map(toDTO)
  if (!q || q.trim().length < 2) return dtos
  const needle = norm(q.trim())
  return dtos.filter((p) =>
    norm(`${p.nombre} ${p.apellido}`).includes(needle) || (p.rut ?? '').toLowerCase().includes(needle),
  )
}

export async function obtenerPaciente(clinicaId: string, id: string): Promise<PacienteDTO> {
  const p = await prisma.paciente.findFirst({ where: { id, clinicaId } })
  if (!p) throw notFound('Paciente no existe en esta clínica')
  return toDTO(p)
}

export interface CrearPacienteInput {
  nombre: string; apellido: string; rut?: string | null
  telefono?: string | null; email?: string | null; prevision?: string | null
}

export async function crearPaciente(clinicaId: string, input: CrearPacienteInput): Promise<PacienteDTO> {
  if (!input.nombre?.trim() || !input.apellido?.trim()) {
    throw badRequest('Nombre y apellido son obligatorios')
  }
  // RUT único por clínica (si viene).
  if (input.rut) {
    const dup = await prisma.paciente.findFirst({ where: { clinicaId, rut: input.rut }, select: { id: true } })
    if (dup) throw badRequest('Ya existe un paciente con ese RUT en la clínica')
  }
  const ultimo = await prisma.paciente.findFirst({
    where: { clinicaId }, orderBy: { numero: 'desc' }, select: { numero: true },
  })
  const p = await prisma.paciente.create({
    data: {
      clinicaId,
      numero: (ultimo?.numero ?? 0) + 1,
      nombre: input.nombre.trim(),
      apellido: input.apellido.trim(),
      rut: input.rut || null,
      telefono: input.telefono || null,
      email: input.email || null,
      prevision: input.prevision || null,
      activo: true,
    },
  })
  return toDTO(p)
}

// Campos editables del paciente (mismo set que el monolito).
const PACIENTE_FIELDS = [
  'rut', 'otroDocId', 'nombre', 'apellido', 'nombreSocial', 'fechaNacimiento', 'genero', 'sexo',
  'nacionalidad', 'migrante', 'puebloOriginario', 'telefono', 'telefonoFijo', 'email', 'direccion',
  'ciudad', 'comuna', 'prevision', 'actividad', 'empleador', 'apoderado', 'rutApoderado', 'referencia',
  'tipoPaciente', 'numeroInterno', 'alergias', 'antecedentes', 'observaciones', 'activo',
]

export async function actualizarPaciente(clinicaId: string, id: string, body: Record<string, unknown>): Promise<PacienteDTO> {
  const data: Record<string, unknown> = {}
  for (const k of PACIENTE_FIELDS) {
    if (!(k in body)) continue
    const v = body[k]
    if (k === 'fechaNacimiento') data[k] = v ? new Date(String(v)) : null
    else if (k === 'rut') data[k] = (v as string)?.trim() ? (v as string).trim() : null
    else if (k === 'activo') data[k] = Boolean(v)
    else if (typeof v === 'string') data[k] = v.trim() || null
    else data[k] = v
  }
  const r = await prisma.paciente.updateMany({ where: { id, clinicaId }, data })
  if (r.count === 0) throw notFound('Paciente no encontrado')
  const p = await prisma.paciente.findUnique({ where: { id } })
  return toDTO(p!)
}

// Ficha clínica (flags + odontograma) para la vista de ficha del SPA.
export async function obtenerFicha(clinicaId: string, pacienteId: string) {
  const paciente = await prisma.paciente.findFirst({ where: { id: pacienteId, clinicaId }, select: { id: true } })
  if (!paciente) throw notFound('Paciente no encontrado')
  const ficha = await prisma.fichaClinica.findUnique({
    where: { pacienteId },
    include: { odontograma: { select: { numero: true, cara: true, estado: true } } },
  })
  if (!ficha) return { ficha: null, odontograma: [] }
  const { odontograma, ...flags } = ficha
  return { ficha: flags, odontograma }
}

const FICHA_FLAGS = ['grupoSanguineo', 'fumador', 'embarazada', 'diabetico', 'hipertenso', 'cardiopatia', 'medicamentos', 'notasClinicas', 'alertasMedicas', 'enfermedadesNotas']

export async function guardarFicha(clinicaId: string, pacienteId: string, body: Record<string, unknown>) {
  const paciente = await prisma.paciente.findFirst({ where: { id: pacienteId, clinicaId }, select: { id: true } })
  if (!paciente) throw notFound('Paciente no encontrado')
  const data: Record<string, unknown> = {}
  for (const k of FICHA_FLAGS) {
    if (!(k in body)) continue
    const v = body[k]
    if (['fumador', 'embarazada', 'diabetico', 'hipertenso', 'cardiopatia'].includes(k)) data[k] = Boolean(v)
    else data[k] = v ? String(v) : null
  }
  const ficha = await prisma.fichaClinica.upsert({
    where: { pacienteId },
    update: data,
    create: { pacienteId, clinicaId, ...data },
  })
  return ficha
}
