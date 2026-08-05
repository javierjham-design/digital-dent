import type { Request, Response } from 'express'
import { login, getSessionUser, cambiarPassword, setup2FA, verify2FA } from '@/services/auth.service'
import { loginSchema } from '@/validators/schemas'
import { badRequest } from '@/lib/errors'

function clientIp(req: Request): string {
  const xf = (req.headers['x-forwarded-for'] as string) ?? ''
  return xf.split(',')[0].trim() || req.ip || 'unknown'
}

export async function postLogin(req: Request, res: Response) {
  const body = loginSchema.parse(req.body)
  const result = await login(body, clientIp(req))
  res.json(result)
}

// Alta del 2FA (paso 1): devuelve QR + secreto + códigos de respaldo (una sola vez).
// Gateado por el desafío que emitió el login (no requiere sesión).
export async function post2FASetup(req: Request, res: Response) {
  const desafio = String((req.body ?? {}).desafio ?? '')
  if (!desafio) throw badRequest('Falta el desafío 2FA.')
  res.json(await setup2FA(desafio))
}

// Segundo factor (paso 2): verifica el código y emite la sesión.
export async function post2FAVerify(req: Request, res: Response) {
  const { desafio, codigo } = req.body ?? {}
  if (!desafio) throw badRequest('Falta el desafío 2FA.')
  if (!codigo) throw badRequest('Falta el código de verificación.')
  res.json(await verify2FA(String(desafio), String(codigo), clientIp(req)))
}

export async function getMe(req: Request, res: Response) {
  const user = await getSessionUser(req.auth!)
  res.json({ user })
}

export async function postCambiarPassword(req: Request, res: Response) {
  const { currentPassword, newPassword } = req.body ?? {}
  await cambiarPassword(req.auth!, String(currentPassword ?? ''), String(newPassword ?? ''))
  res.json({ ok: true })
}
