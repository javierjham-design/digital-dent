import type { Request, Response } from 'express'
import { login, getSessionUser, cambiarPassword } from '@/services/auth.service'
import { loginSchema } from '@/validators/schemas'

function clientIp(req: Request): string {
  const xf = (req.headers['x-forwarded-for'] as string) ?? ''
  return xf.split(',')[0].trim() || req.ip || 'unknown'
}

export async function postLogin(req: Request, res: Response) {
  const body = loginSchema.parse(req.body)
  const result = await login(body, clientIp(req))
  res.json(result)
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
