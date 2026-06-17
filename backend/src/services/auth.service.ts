import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '@/lib/prisma'
import { env } from '@/config/env'
import { badRequest, notFound, tooMany, unauthorized } from '@/lib/errors'
import { peekLimit, rateLimit, registerFailure, resetLimit } from '@/lib/rate-limit'
import type { LoginRequest, LoginResponse, SessionUserDTO } from '@shared/types'

const LOGIN_LIMIT = { limit: 5, windowMs: 15 * 60_000 }
const LOGIN_IP_LIMIT = { limit: 30, windowMs: 15 * 60_000 }

export interface JwtPayload {
  sub: string
  clinicaId: string | null
  role: string
  isPlatformAdmin: boolean
  name: string | null
  email: string | null
}

function sign(user: { id: string; clinicaId: string | null; role: string; isPlatformAdmin: boolean; name: string | null; email: string | null }): string {
  const payload: JwtPayload = {
    sub: user.id,
    clinicaId: user.clinicaId,
    role: user.role,
    isPlatformAdmin: user.isPlatformAdmin,
    name: user.name,
    email: user.email,
  }
  const options: jwt.SignOptions = { expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'] }
  return jwt.sign(payload, env.jwtSecret, options)
}

// Nombre legible del actor para logs y campos "creado por".
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

async function toDTO(userId: string): Promise<SessionUserDTO> {
  const u = await prisma.user.findUnique({ where: { id: userId } })
  if (!u) throw unauthorized()
  const isAdmin = u.role === 'admin'
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    clinicaId: u.clinicaId,
    isPlatformAdmin: u.isPlatformAdmin,
    requirePasswordChange: u.passwordChangedAt === null,
    permisos: {
      puedeModificarPrecio: isAdmin || u.puedeModificarPrecio,
      puedeAplicarDescuento: isAdmin || u.puedeAplicarDescuento,
      puedeRevertirCompletado: isAdmin || u.puedeRevertirCompletado,
      puedeEditarPagos: isAdmin || u.puedeEditarPagos,
      puedeGestionarLiquidaciones: isAdmin || u.puedeGestionarLiquidaciones,
    },
  }
}

// Login dual (igual semántica que el monolito): slug+username (clínica) o
// email (super-admin / legacy). Anti fuerza bruta: solo los fallos consumen
// cupo; un login correcto resetea el contador.
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

  const fail = () => {
    registerFailure(idKey)
    registerFailure(ipKey)
    throw unauthorized('Usuario o contraseña incorrectos')
  }

  let user: Awaited<ReturnType<typeof prisma.user.findFirst>> = null

  if (body.slug && body.username) {
    const clinica = await prisma.clinica.findUnique({ where: { slug: body.slug } })
    if (!clinica || !clinica.activo) return fail()
    user = await prisma.user.findFirst({
      where: { clinicaId: clinica.id, username: body.username, activo: true },
    })
  } else if (body.email) {
    user = await prisma.user.findUnique({ where: { email: body.email } })
    if (user && !user.activo) user = null
  } else {
    throw badRequest('Credenciales incompletas')
  }

  if (!user) return fail()
  const valid = await bcrypt.compare(body.password, user.password)
  if (!valid) return fail()

  resetLimit(idKey)
  return { token: sign(user), user: await toDTO(user.id) }
}

export const getSessionUser = toDTO

// Política de contraseñas para contraseñas NUEVAS (idéntica al monolito).
function validarPassword(pw: string): string | null {
  if (pw.length < 8) return 'La nueva contraseña debe tener al menos 8 caracteres.'
  if (!/[a-zA-Z]/.test(pw)) return 'La nueva contraseña debe incluir al menos una letra.'
  if (!/[0-9]/.test(pw)) return 'La nueva contraseña debe incluir al menos un número.'
  return null
}

// Cambio de contraseña self-service. Verifica la actual, aplica política y
// limita la fuerza bruta a 5 intentos / 15 min por usuario. Marca
// passwordChangedAt para limpiar el flag de "cambio requerido".
export async function cambiarPassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  const rl = rateLimit(`pwchange:${userId}`, { limit: 5, windowMs: 15 * 60_000 })
  if (!rl.ok) throw tooMany(`Demasiados intentos. Espera ${Math.ceil(rl.retryAfterSec / 60)} minutos.`)

  if (!currentPassword || !newPassword) throw badRequest('Faltan campos')
  const politicaError = validarPassword(newPassword)
  if (politicaError) throw badRequest(politicaError)

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw notFound('Usuario no existe')

  const ok = await bcrypt.compare(currentPassword, user.password)
  if (!ok) throw badRequest('La contraseña actual no es correcta')
  if (currentPassword === newPassword) throw badRequest('La nueva contraseña debe ser distinta de la actual.')

  const hash = await bcrypt.hash(newPassword, 12)
  await prisma.user.update({ where: { id: userId }, data: { password: hash, passwordChangedAt: new Date() } })
}

// Emite un token para un usuario dado (sin contraseña). Lo usa el flujo de
// demo para auto-loguear al administrador recién creado.
export async function issueTokenForUserId(userId: string): Promise<LoginResponse> {
  const u = await prisma.user.findUnique({ where: { id: userId } })
  if (!u) throw unauthorized()
  return { token: sign(u), user: await toDTO(u.id) }
}
