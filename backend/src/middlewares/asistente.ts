import type { Request, Response, NextFunction } from 'express'
import { serviceUnavailable } from '@/lib/errors'
import { env } from '@/config/env'

// Interruptor GLOBAL del asistente. Con ASISTENTE_ENABLED=false responde 503,
// aunque la clínica tenga el módulo. Va después de requireModulo('asistente').
export function requireAsistenteHabilitado(_req: Request, _res: Response, next: NextFunction): void {
  if (!env.asistente.enabled) return next(serviceUnavailable('El asistente está desactivado.'))
  next()
}
