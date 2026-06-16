import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { badRequest, conflict, forbidden, notFound } from '@/lib/errors'
import type { JwtPayload } from '@/services/auth.service'
import type { DoctorDTO, UsuarioDTO } from '@shared/types'

const ROLES_PERMITIDOS = ['admin', 'doctor', 'medico', 'staff']
const ROLES_CON_AGENDA = ['doctor', 'medico']
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,30}$/

const SELECT = {
  id: true, name: true, username: true, email: true, role: true, rut: true,
  especialidad: true, telefono: true, activo: true,
  puedeRecibirPagos: true, puedeModificarPrecio: true, puedeAplicarDescuento: true,
  puedeRevertirCompletado: true, puedeEditarPagos: true, puedeGestionarLiquidaciones: true,
  googleCalendarId: true, createdAt: true,
} as const

function toDTO(u: {
  id: string; name: string | null; username: string | null; email: string | null; role: string
  rut: string | null; especialidad: string | null; telefono: string | null; activo: boolean
  puedeRecibirPagos?: boolean; puedeModificarPrecio?: boolean; puedeAplicarDescuento?: boolean
  puedeRevertirCompletado?: boolean; puedeEditarPagos?: boolean; puedeGestionarLiquidaciones?: boolean
  googleCalendarId?: string | null; createdAt: Date
}): UsuarioDTO {
  return { ...u, createdAt: u.createdAt.toISOString() }
}

export async function listarUsuarios(clinicaId: string): Promise<UsuarioDTO[]> {
  const usuarios = await prisma.user.findMany({
    where: { clinicaId }, orderBy: { name: 'asc' }, select: SELECT,
  })
  return usuarios.map(toDTO)
}

export async function listarDoctores(clinicaId: string): Promise<DoctorDTO[]> {
  const docs = await prisma.user.findMany({
    where: { clinicaId, role: { in: ROLES_CON_AGENDA }, activo: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, email: true, especialidad: true },
  })
  return docs
}

export interface CrearUsuarioInput {
  name: string; username: string; password: string; role?: string
  email?: string | null; rut?: string | null; especialidad?: string | null; telefono?: string | null
}

export async function crearUsuario(clinicaId: string, input: CrearUsuarioInput): Promise<UsuarioDTO> {
  if (!input.name?.trim()) throw badRequest('Falta el nombre')

  const username = (input.username ?? '').trim().toLowerCase()
  if (!username) throw badRequest('Falta el nombre de usuario (login)')
  if (!USERNAME_RE.test(username)) {
    throw badRequest('El nombre de usuario solo puede tener letras, números, puntos, guiones y guiones bajos (2 a 31 caracteres, sin espacios ni acentos).')
  }

  if (!input.password || input.password.length < 8) throw badRequest('Password debe tener al menos 8 caracteres')

  const role = input.role ?? 'doctor'
  if (!ROLES_PERMITIDOS.includes(role)) throw badRequest(`role inválido. Use: ${ROLES_PERMITIDOS.join(', ')}`)

  const email = input.email && input.email.trim() ? input.email.trim().toLowerCase() : null

  const dupUser = await prisma.user.findFirst({ where: { clinicaId, username }, select: { id: true } })
  if (dupUser) throw conflict(`Ya existe un usuario "${username}" en esta clínica`)
  if (email) {
    const dupEmail = await prisma.user.findUnique({ where: { email }, select: { id: true } })
    if (dupEmail) throw conflict('Ya existe un usuario con ese email')
  }

  const usuario = await prisma.user.create({
    data: {
      clinicaId, name: input.name.trim(), username, email,
      password: await bcrypt.hash(input.password, 10),
      role, rut: input.rut || null, especialidad: input.especialidad || null,
      telefono: input.telefono || null, isPlatformAdmin: false,
    },
    select: SELECT,
  })
  return toDTO(usuario)
}

const CAMPOS_PROPIOS = ['name', 'rut', 'especialidad', 'telefono']
const CAMPOS_ADMIN = [
  'name', 'username', 'email', 'role', 'rut', 'especialidad', 'telefono', 'activo',
  'puedeRecibirPagos', 'puedeModificarPrecio', 'puedeAplicarDescuento', 'puedeRevertirCompletado',
  'puedeEditarPagos', 'puedeGestionarLiquidaciones', 'googleCalendarId',
]

export async function actualizarUsuario(actor: JwtPayload, targetId: string, body: Record<string, unknown>): Promise<UsuarioDTO> {
  const clinicaId = actor.clinicaId!
  const existing = await prisma.user.findFirst({ where: { id: targetId, clinicaId }, select: { id: true } })
  if (!existing) throw notFound('Usuario no encontrado')

  const editandoOtro = actor.sub !== targetId
  const isAdmin = actor.role === 'admin'
  if (editandoOtro && !isAdmin) throw forbidden('Solo admin puede editar a otros usuarios')

  const allowed = isAdmin ? CAMPOS_ADMIN : CAMPOS_PROPIOS
  const data: Record<string, unknown> = {}
  for (const key of allowed) {
    if (body[key] !== undefined) data[key] = body[key]
  }

  if ('role' in data && !ROLES_PERMITIDOS.includes(String(data.role))) {
    throw badRequest(`role inválido. Use: ${ROLES_PERMITIDOS.join(', ')}`)
  }

  if ('username' in data) {
    if (!data.username) throw badRequest('El nombre de usuario no puede quedar vacío')
    const username = String(data.username).trim().toLowerCase()
    if (!USERNAME_RE.test(username)) throw badRequest('Nombre de usuario inválido (2 a 31 caracteres, sin espacios ni acentos).')
    const otro = await prisma.user.findFirst({ where: { clinicaId, username, NOT: { id: targetId } }, select: { id: true } })
    if (otro) throw conflict(`Ya existe otro usuario "${username}" en esta clínica`)
    data.username = username
  }

  if ('email' in data) {
    if (!data.email) data.email = null
    else {
      const email = String(data.email).trim().toLowerCase()
      const otro = await prisma.user.findUnique({ where: { email }, select: { id: true } })
      if (otro && otro.id !== targetId) throw conflict('Ya existe otro usuario con ese email')
      data.email = email
    }
  }

  if (typeof body.password === 'string' && body.password.length > 0) {
    if (body.password.length < 8) throw badRequest('Password muy corto (mínimo 8, con letra y número)')
    data.password = await bcrypt.hash(body.password, 10)
    data.passwordChangedAt = new Date()
  }

  // Cambio de calendario: reset de syncToken (el push a Google se hará en el
  // dominio de integraciones cuando se porte; acá solo se persiste el dato).
  if (data.googleCalendarId !== undefined) {
    data.googleSyncToken = null
    data.googleSyncedAt = null
  }

  const usuario = await prisma.user.update({ where: { id: targetId }, data, select: SELECT })

  if ('role' in data && !ROLES_CON_AGENDA.includes(String(data.role))) {
    await prisma.horarioDoctor.deleteMany({ where: { doctorId: targetId } })
  }
  return toDTO(usuario)
}
