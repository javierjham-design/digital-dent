import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { control } from '@/db/control'
import { tenantClient } from '@/db/tenant'
import { env } from '@/config/env'
import { badRequest, notFound, tooMany, unauthorized } from '@/lib/errors'
import { peekLimit, rateLimit, registerFailure, resetLimit } from '@/lib/rate-limit'
import type { LoginRequest, LoginResponse, SessionUserDTO } from '@shared/types'
import { parseModulos, MODULOS_CODES } from '@shared/constants/modulos'

const LOGIN_LIMIT = { limit: 5, windowMs: 15 * 60_000 }
const LOGIN_IP_LIMIT = { limit: 30, windowMs: 15 * 60_000 }

// clinicaId = id de la clínica en el CONTROL-PLANE (null para super-admins).
// slug = subdominio de la clínica. sub = id del usuario (tenant) o del admin
// de plataforma (control).
export interface JwtPayload {
  sub: string
  clinicaId: string | null
  slug: string | null
  role: string
  isPlatformAdmin: boolean
  name: string | null
  email: string | null
}

function sign(payload: JwtPayload): string {
  const options: jwt.SignOptions = { expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'] }
  return jwt.sign(payload, env.jwtSecret, options)
}

export function actorName(p: JwtPayload): string {
  return p.name ?? p.email ?? 'Sistema'
}

export function verifyToken(token: string): JwtPayload {
  try {
    return jwt.verify(token, env.jwtSecret) as JwtPayload
  } catch {
    throw unauthorized('Sesión inválida o expirada')
  }
}

// DTO de un usuario de clínica (vive en la base del tenant).
type TenantUserRow = {
  id: string; name: string | null; email: string | null; role: string; passwordChangedAt: Date | null
  puedeModificarPrecio: boolean; puedeAplicarDescuento: boolean; puedeRevertirCompletado: boolean
  puedeEditarPagos: boolean; puedeGestionarLiquidaciones: boolean; puedeGestionarCrm: boolean; puedeEliminar: boolean
  puedeGestionarCajas: boolean; puedeRecibirPagos: boolean
  puedeConfigurarClinica: boolean; puedeGestionarEquipo: boolean
}
function tenantUserDTO(u: TenantUserRow, clinicaId: string, pais: string, modulos: string[]): SessionUserDTO {
  const isAdmin = u.role === 'admin'
  return {
    id: u.id, name: u.name, email: u.email, role: u.role, clinicaId, pais, modulos, isPlatformAdmin: false,
    requirePasswordChange: u.passwordChangedAt === null,
    permisos: {
      puedeModificarPrecio: isAdmin || u.puedeModificarPrecio,
      puedeAplicarDescuento: isAdmin || u.puedeAplicarDescuento,
      puedeRevertirCompletado: isAdmin || u.puedeRevertirCompletado,
      puedeEditarPagos: isAdmin || u.puedeEditarPagos,
      puedeGestionarLiquidaciones: isAdmin || u.puedeGestionarLiquidaciones,
      puedeGestionarCrm: isAdmin || u.puedeGestionarCrm,
      puedeEliminar: isAdmin || u.puedeEliminar,
      puedeGestionarCajas: isAdmin || u.puedeGestionarCajas,
      puedeRecibirPagos: isAdmin || u.puedeRecibirPagos,
      puedeConfigurarClinica: isAdmin || u.puedeConfigurarClinica,
      puedeGestionarEquipo: isAdmin || u.puedeGestionarEquipo,
    },
  }
}

function platformAdminDTO(a: { id: string; name: string | null; email: string; passwordChangedAt: Date | null }): SessionUserDTO {
  return {
    id: a.id, name: a.name, email: a.email, role: 'admin', clinicaId: null, pais: 'CL', modulos: MODULOS_CODES, isPlatformAdmin: true,
    requirePasswordChange: a.passwordChangedAt === null,
    permisos: {
      puedeModificarPrecio: true, puedeAplicarDescuento: true, puedeRevertirCompletado: true,
      puedeEditarPagos: true, puedeGestionarLiquidaciones: true, puedeGestionarCrm: true, puedeEliminar: true, puedeGestionarCajas: true, puedeRecibirPagos: true,
      puedeConfigurarClinica: true, puedeGestionarEquipo: true,
    },
  }
}

// Devuelve el SessionUser a partir del payload del JWT (rehidrata desde la base
// correcta: control-plane para plataforma, tenant para clínica).
export async function getSessionUser(payload: JwtPayload): Promise<SessionUserDTO> {
  if (payload.isPlatformAdmin) {
    const a = await control.platformAdmin.findUnique({ where: { id: payload.sub } })
    if (!a || !a.activo) throw unauthorized()
    return platformAdminDTO(a)
  }
  if (!payload.clinicaId) throw unauthorized()
  const clinica = await control.clinica.findUnique({ where: { id: payload.clinicaId }, select: { dbName: true, modulos: true } })
  if (!clinica) throw unauthorized()
  const db = tenantClient(clinica.dbName)
  const u = await db.user.findUnique({ where: { id: payload.sub } })
  if (!u || !u.activo) throw unauthorized()
  const cfg = await db.configuracion.findUnique({ where: { id: 'singleton' }, select: { pais: true } })
  return tenantUserDTO(u, payload.clinicaId, cfg?.pais ?? 'CL', parseModulos(clinica.modulos))
}

// Login dual: clínica (slug+username contra su tenant) o plataforma (email
// contra el control-plane). Anti fuerza bruta: solo los fallos consumen cupo.
export async function login(body: LoginRequest, ip: string): Promise<LoginResponse> {
  if (!body?.password) throw badRequest('Falta la contraseña')

  const ipKey = `login:ip:${ip}`
  const idKey = body.slug && body.username
    ? `login:${body.slug.toLowerCase()}:${body.username.toLowerCase()}`
    : `login:email:${(body.email ?? '').toLowerCase()}`

  const idCheck = peekLimit(idKey, LOGIN_LIMIT)
  const ipCheck = peekLimit(ipKey, LOGIN_IP_LIMIT)
  if (!idCheck.ok || !ipCheck.ok) {
    const retry = Math.max(idCheck.retryAfterSec, ipCheck.retryAfterSec)
    throw tooMany(`Demasiados intentos. Espera ${Math.ceil(retry / 60)} minutos.`)
  }
  const fail = (): never => {
    registerFailure(idKey); registerFailure(ipKey)
    throw unauthorized('Usuario o contraseña incorrectos')
  }

  // ── Clínica: slug + username contra la base del tenant ──
  if (body.slug && body.username) {
    const clinica = await control.clinica.findUnique({ where: { slug: body.slug } })
    if (!clinica || !clinica.activo) return fail()
    const db = tenantClient(clinica.dbName)
    const user = await db.user.findFirst({ where: { username: body.username, activo: true } })
    if (!user) return fail()
    const valid = await bcrypt.compare(body.password, user.password)
    if (!valid) return fail()
    resetLimit(idKey)
    const payload: JwtPayload = { sub: user.id, clinicaId: clinica.id, slug: clinica.slug, role: user.role, isPlatformAdmin: false, name: user.name, email: user.email }
    const cfg = await db.configuracion.findUnique({ where: { id: 'singleton' }, select: { pais: true } })
    return { token: sign(payload), user: tenantUserDTO(user, clinica.id, cfg?.pais ?? 'CL', parseModulos(clinica.modulos)) }
  }

  // ── Plataforma: email contra el control-plane ──
  if (body.email) {
    const admin = await control.platformAdmin.findUnique({ where: { email: body.email.toLowerCase() } })
    if (!admin || !admin.activo) return fail()
    const valid = await bcrypt.compare(body.password, admin.password)
    if (!valid) return fail()
    resetLimit(idKey)
    const payload: JwtPayload = { sub: admin.id, clinicaId: null, slug: null, role: 'admin', isPlatformAdmin: true, name: admin.name, email: admin.email }
    return { token: sign(payload), user: platformAdminDTO(admin) }
  }

  throw badRequest('Credenciales incompletas')
}

// Emite un token para un usuario de una clínica recién creada (flujo demo:
// auto-login del prospecto). clinica viene del control-plane.
export async function issueTokenForTenantUser(
  clinica: { id: string; slug: string; dbName: string },
  userId: string,
): Promise<LoginResponse> {
  const db = tenantClient(clinica.dbName)
  const u = await db.user.findUnique({ where: { id: userId } })
  if (!u) throw unauthorized()
  const payload: JwtPayload = { sub: u.id, clinicaId: clinica.id, slug: clinica.slug, role: u.role, isPlatformAdmin: false, name: u.name, email: u.email }
  const cfg = await db.configuracion.findUnique({ where: { id: 'singleton' }, select: { pais: true } })
  const cc = await control.clinica.findUnique({ where: { id: clinica.id }, select: { modulos: true } })
  return { token: sign(payload), user: tenantUserDTO(u, clinica.id, cfg?.pais ?? 'CL', parseModulos(cc?.modulos)) }
}

// Política de contraseñas (idéntica al monolito).
function validarPassword(pw: string): string | null {
  if (pw.length < 8) return 'La nueva contraseña debe tener al menos 8 caracteres.'
  if (!/[a-zA-Z]/.test(pw)) return 'La nueva contraseña debe incluir al menos una letra.'
  if (!/[0-9]/.test(pw)) return 'La nueva contraseña debe incluir al menos un número.'
  return null
}

// Cambio de contraseña self-service (clínica → tenant; plataforma → control).
export async function cambiarPassword(payload: JwtPayload, currentPassword: string, newPassword: string): Promise<void> {
  const rl = rateLimit(`pwchange:${payload.sub}`, { limit: 5, windowMs: 15 * 60_000 })
  if (!rl.ok) throw tooMany(`Demasiados intentos. Espera ${Math.ceil(rl.retryAfterSec / 60)} minutos.`)
  if (!currentPassword || !newPassword) throw badRequest('Faltan campos')
  const politicaError = validarPassword(newPassword)
  if (politicaError) throw badRequest(politicaError)

  if (payload.isPlatformAdmin) {
    const a = await control.platformAdmin.findUnique({ where: { id: payload.sub } })
    if (!a) throw notFound('Usuario no existe')
    if (!(await bcrypt.compare(currentPassword, a.password))) throw badRequest('La contraseña actual no es correcta')
    if (currentPassword === newPassword) throw badRequest('La nueva contraseña debe ser distinta de la actual.')
    await control.platformAdmin.update({ where: { id: a.id }, data: { password: await bcrypt.hash(newPassword, 12), passwordChangedAt: new Date() } })
    return
  }

  if (!payload.clinicaId) throw unauthorized()
  const clinica = await control.clinica.findUnique({ where: { id: payload.clinicaId }, select: { dbName: true } })
  if (!clinica) throw unauthorized()
  const db = tenantClient(clinica.dbName)
  const u = await db.user.findUnique({ where: { id: payload.sub } })
  if (!u) throw notFound('Usuario no existe')
  if (!(await bcrypt.compare(currentPassword, u.password))) throw badRequest('La contraseña actual no es correcta')
  if (currentPassword === newPassword) throw badRequest('La nueva contraseña debe ser distinta de la actual.')
  await db.user.update({ where: { id: u.id }, data: { password: await bcrypt.hash(newPassword, 12), passwordChangedAt: new Date() } })
}
