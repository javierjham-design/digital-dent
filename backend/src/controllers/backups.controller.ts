import type { Request, Response } from 'express'
import { cronSecretValido } from '@/lib/cron-auth'
import { verifyToken } from '@/services/auth.service'
import { forbidden, unauthorized } from '@/lib/errors'
import { ejecutarBackup } from '@/lib/backup/runner'
import { log } from '@/lib/logger'

// POST /api/v1/admin/backups/run — dispara un backup a mano ANTES de una operación
// riesgosa. Auth: x-cron-secret (timingSafeEqual) o super-admin (Bearer). Ruta sin
// requireAuth (para que el cron pueda llamarla sin sesión); valida inline.
//
// Corre el dump en el proceso del API a propósito: es una acción MANUAL y ocasional,
// y el dump es I/O-bound (el trabajo pesado lo hace el subproceso pg_dump). El job
// DIARIO —el que no debe competir con las requests— es un servicio cron aparte.
export async function postBackupRun(req: Request, res: Response) {
  if (!cronSecretValido(req.headers['x-cron-secret'])) {
    const auth = req.headers.authorization
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
    if (!token) throw unauthorized('Requiere x-cron-secret o sesión de super-admin.')
    const payload = verifyToken(token)
    if (!payload.isPlatformAdmin) throw forbidden('Requiere super-administrador.')
  }

  const incluirDemos = req.body?.incluirDemos === true
  log.info('backup manual disparado', { incluirDemos })
  const r = await ejecutarBackup({ incluirDemos, disparadoPor: 'manual' })
  res.status(r.estado === 'ERROR' ? 500 : 200).json(r)
}
