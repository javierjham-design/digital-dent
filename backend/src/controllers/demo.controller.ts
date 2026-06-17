import type { Request, Response } from 'express'
import { env } from '@/config/env'
import { unauthorized } from '@/lib/errors'
import { verifyToken } from '@/services/auth.service'
import { crearDemo, limpiarDemosExpiradas } from '@/services/demo.service'

function clientIp(req: Request): string {
  const xf = (req.headers['x-forwarded-for'] as string) ?? ''
  return xf.split(',')[0].trim() || req.ip || 'unknown'
}

// POST /api/v1/demo — público (rate-limited en el service).
export async function postDemo(req: Request, res: Response) {
  res.status(201).json(await crearDemo(req.body ?? {}, clientIp(req)))
}

// POST /api/v1/demo/cleanup — cron (x-cron-secret) o super-admin.
export async function postDemoCleanup(req: Request, res: Response) {
  const headerSecret = req.headers['x-cron-secret']
  const isCron = Boolean(env.cronSecret && headerSecret === env.cronSecret)
  if (!isCron) {
    const auth = req.headers.authorization
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
    if (!token) throw unauthorized()
    const payload = verifyToken(token)
    if (!payload.isPlatformAdmin) throw unauthorized('Requiere super-administrador')
  }
  res.json(await limpiarDemosExpiradas())
}
