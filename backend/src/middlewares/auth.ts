import type { Request, Response, NextFunction } from 'express'
import { verifyToken } from '@/services/auth.service'
import { forbidden, unauthorized } from '@/lib/errors'

function tokenFromRequest(req: Request): string | null {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) return header.slice(7)
  // Soporte de cookie httpOnly (si el frontend la usa).
  const cookie = (req as { cookies?: Record<string, string> }).cookies?.clariva_token
  return cookie ?? null
}

// Exige sesión válida; adjunta req.auth.
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = tokenFromRequest(req)
  if (!token) throw unauthorized('Falta el token de sesión')
  req.auth = verifyToken(token)
  next()
}

// Exige super-admin de plataforma.
export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) throw unauthorized()
  if (!req.auth.isPlatformAdmin) throw forbidden('Requiere super-administrador')
  next()
}

// Exige rol admin dentro de la clínica.
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) throw unauthorized()
  if (req.auth.role !== 'admin' && !req.auth.isPlatformAdmin) throw forbidden('Requiere rol administrador')
  next()
}
