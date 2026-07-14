import bcrypt from 'bcryptjs'
import type { TenantClient } from '@/db/tenant'
import { badRequest, conflict, forbidden, notFound } from '@/lib/errors'
import type { JwtPayload } from '@/services/auth.service'
import type { DoctorDTO, UsuarioDTO } from '@shared/types'
import { conTitulo, normalizarTitulo } from '@shared/utils/nombre'
import { getLimiteProfesionales, PROFESIONAL_EXTRA_PRECIO } from '@/lib/plans'

const ROLES_PERMITIDOS = ['admin', 'doctor', 'medico', 'staff']
const ROLES_CON_AGENDA = ['doctor', 'medico']

// Cuenta los profesionales ACTIVOS (usuarios con agenda) de la clínica.
export function contarProfesionalesActivos(db: TenantClient, exceptId?: string): Promise<number> {
  return db.user.count({ where: { role: { in: ROLES_CON_AGENDA }, activo: true, ...(exceptId ? { id: { not: exceptId } } : {}) } })
}

// Verifica que sumar un profesional con agenda no supere el tope del plan (+extras).
// clinicaId es del control-plane; si no se pasa (contextos internos) no valida.
async function assertCupoProfesional(db: TenantClient, clinicaId: string | undefined, exceptId?: string): Promise<void> {
  if (!clinicaId) return
  const { limite } = await getLimiteProfesionales(clinicaId)
  const actuales = await contarProfesionalesActivos(db, exceptId)
  if (actuales + 1 > limite) {
    throw badRequest(`Alcanzaste el cupo de profesionales con agenda de tu plan (${actuales}/${limite}). Para agregar otro profesional con agenda necesitas solicitar un cupo adicional (cada profesional extra cuesta $9.990 al mes). Los usuarios sin agenda (recepción, asistentes) no tienen límite. Escríbenos para ampliar tu cupo.`)
  }
}
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,30}$/

const SELECT = {
  id: true, name: true, titulo: true, username: true, email: true, role: true, rut: true,
  especialidad: true, telefono: true, activo: true,
  puedeRecibirPagos: true, puedeModificarPrecio: true, puedeAplicarDescuento: true,
  puedeRevertirCompletado: true, puedeEditarPagos: true, puedeGestionarLiquidaciones: true,
  puedeGestionarCrm: true, puedeEliminar: true, puedeGestionarCajas: true,
  googleCalendarId: true, createdAt: true,
} as const

function toDTO(u: {
  id: string; name: string | null; titulo?: string; username: string | null; email: string | null; role: string
  rut: string | null; especialidad: string | null; telefono: string | null; activo: boolean
  puedeRecibirPagos?: boolean; puedeModificarPrecio?: boolean; puedeAplicarDescuento?: boolean
  puedeRevertirCompletado?: boolean; puedeEditarPagos?: boolean; puedeGestionarLiquidaciones?: boolean
  puedeGestionarCrm?: boolean; puedeEliminar?: boolean; puedeGestionarCajas?: boolean
  googleCalendarId?: string | null; createdAt: Date
}): UsuarioDTO {
  return { ...u, createdAt: u.createdAt.toISOString() }
}

// Cupo de profesionales con agenda de la clínica: usados vs tope (plan + extras).
// Para mostrarlo en Equipo y avisar antes de intentar crear de más.
export async function cupoProfesionales(db: TenantClient, clinicaId?: string) {
  if (!clinicaId) return { activos: 0, limite: 0, base: 0, extra: 0, precioExtra: PROFESIONAL_EXTRA_PRECIO }
  const { limite, base, extra } = await getLimiteProfesionales(clinicaId)
  const activos = await contarProfesionalesActivos(db)
  return { activos, limite, base, extra, precioExtra: PROFESIONAL_EXTRA_PRECIO }
}

export async function listarUsuarios(db: TenantClient): Promise<UsuarioDTO[]> {
  const usuarios = await db.user.findMany({ orderBy: { name: 'asc' }, select: SELECT })
  return usuarios.map(toDTO)
}

export async function listarDoctores(db: TenantClient): Promise<DoctorDTO[]> {
  const docs = await db.user.findMany({
    where: { role: { in: ROLES_CON_AGENDA }, activo: true },
    select: { id: true, name: true, titulo: true, email: true, especialidad: true },
  })
  // Orden alfabético por apellido (última palabra del nombre, sin el título).
  const apellido = (n: string | null) => ((n ?? '').trim().split(/\s+/).pop() ?? '').toLowerCase()
  return docs
    .sort((a, b) => apellido(a.name).localeCompare(apellido(b.name), 'es'))
    // El nombre visible lleva el título delante (ej. "Dra. Ana Pérez").
    .map((d) => ({ id: d.id, name: conTitulo(d.titulo, d.name) || null, email: d.email, especialidad: d.especialidad }))
}

export interface CrearUsuarioInput {
  name: string; username: string; password: string; role?: string; titulo?: string | null
  email?: string | null; rut?: string | null; especialidad?: string | null; telefono?: string | null
}

export async function crearUsuario(db: TenantClient, input: CrearUsuarioInput, clinicaId?: string): Promise<UsuarioDTO> {
  if (!input.name?.trim()) throw badRequest('Falta el nombre')

  const username = (input.username ?? '').trim().toLowerCase()
  if (!username) throw badRequest('Falta el nombre de usuario (login)')
  if (!USERNAME_RE.test(username)) {
    throw badRequest('El nombre de usuario solo puede tener letras, números, puntos, guiones y guiones bajos (2 a 31 caracteres, sin espacios ni acentos).')
  }
  if (!input.password || input.password.length < 8) throw badRequest('Password debe tener al menos 8 caracteres')

  const role = input.role ?? 'doctor'
  if (!ROLES_PERMITIDOS.includes(role)) throw badRequest(`role inválido. Use: ${ROLES_PERMITIDOS.join(', ')}`)

  // Tope de profesionales con agenda del plan (los usuarios sin agenda no cuentan).
  if (ROLES_CON_AGENDA.includes(role)) await assertCupoProfesional(db, clinicaId)

  const email = input.email && input.email.trim() ? input.email.trim().toLowerCase() : null

  const dupUser = await db.user.findFirst({ where: { username }, select: { id: true } })
  if (dupUser) throw conflict(`Ya existe un usuario "${username}" en esta clínica`)
  if (email) {
    const dupEmail = await db.user.findUnique({ where: { email }, select: { id: true } })
    if (dupEmail) throw conflict('Ya existe un usuario con ese email')
  }

  const usuario = await db.user.create({
    data: {
      name: input.name.trim(), titulo: normalizarTitulo(input.titulo), username, email,
      password: await bcrypt.hash(input.password, 10),
      role, rut: input.rut || null, especialidad: input.especialidad || null,
      telefono: input.telefono || null,
    },
    select: SELECT,
  })
  return toDTO(usuario)
}

const CAMPOS_PROPIOS = ['name', 'titulo', 'rut', 'especialidad', 'telefono']
const CAMPOS_ADMIN = [
  'name', 'titulo', 'username', 'email', 'role', 'rut', 'especialidad', 'telefono', 'activo',
  'puedeRecibirPagos', 'puedeModificarPrecio', 'puedeAplicarDescuento', 'puedeRevertirCompletado',
  'puedeEditarPagos', 'puedeGestionarLiquidaciones', 'puedeGestionarCrm', 'puedeEliminar', 'puedeGestionarCajas', 'googleCalendarId',
]

export async function actualizarUsuario(db: TenantClient, actor: JwtPayload, targetId: string, body: Record<string, unknown>, clinicaId?: string): Promise<UsuarioDTO> {
  const existing = await db.user.findUnique({ where: { id: targetId }, select: { id: true, role: true, activo: true } })
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
  if ('titulo' in data) data.titulo = normalizarTitulo(data.titulo)

  // Si el cambio CONVIERTE al usuario en profesional con agenda activo (por rol o
  // por reactivación) y antes no lo era, valida el tope del plan (+extras).
  const rolFinal = 'role' in data ? String(data.role) : existing.role
  const activoFinal = 'activo' in data ? Boolean(data.activo) : existing.activo
  const seraProfesional = ROLES_CON_AGENDA.includes(rolFinal) && activoFinal
  const eraProfesional = ROLES_CON_AGENDA.includes(existing.role) && existing.activo
  if (seraProfesional && !eraProfesional) await assertCupoProfesional(db, clinicaId, targetId)

  if ('username' in data) {
    if (!data.username) throw badRequest('El nombre de usuario no puede quedar vacío')
    const username = String(data.username).trim().toLowerCase()
    if (!USERNAME_RE.test(username)) throw badRequest('Nombre de usuario inválido (2 a 31 caracteres, sin espacios ni acentos).')
    const otro = await db.user.findFirst({ where: { username, NOT: { id: targetId } }, select: { id: true } })
    if (otro) throw conflict(`Ya existe otro usuario "${username}" en esta clínica`)
    data.username = username
  }

  if ('email' in data) {
    if (!data.email) data.email = null
    else {
      const email = String(data.email).trim().toLowerCase()
      const otro = await db.user.findUnique({ where: { email }, select: { id: true } })
      if (otro && otro.id !== targetId) throw conflict('Ya existe otro usuario con ese email')
      data.email = email
    }
  }

  if (typeof body.password === 'string' && body.password.length > 0) {
    if (body.password.length < 8) throw badRequest('Password muy corto (mínimo 8, con letra y número)')
    data.password = await bcrypt.hash(body.password, 10)
    data.passwordChangedAt = new Date()
  }

  if (data.googleCalendarId !== undefined) {
    data.googleSyncToken = null
    data.googleSyncedAt = null
  }

  const usuario = await db.user.update({ where: { id: targetId }, data, select: SELECT })

  if ('role' in data && !ROLES_CON_AGENDA.includes(String(data.role))) {
    await db.horarioDoctor.deleteMany({ where: { doctorId: targetId } })
  }
  return toDTO(usuario)
}
