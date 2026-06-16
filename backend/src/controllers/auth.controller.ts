import type { Request, Response } from 'express'
import { login, getSessionUser } from '@/services/auth.service'
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
  const user = await getSessionUser(req.auth!.sub)
  res.json({ user })
}
