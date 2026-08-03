import type { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'
import { AppError } from '@/lib/errors'
import { log, serializeError } from '@/lib/logger'
import { captureError } from '@/lib/observability'

// Middleware final: traduce cualquier error a JSON { error }. Nunca filtra
// stack traces ni detalles internos al cliente.
//
// Los errores ESPERADOS de dominio (AppError 4xx) y de validación (ZodError → 400)
// NO son fallas del sistema: se responden sin ruido (ni log de error ni Sentry).
// Solo los 5xx inesperados se loguean y se reportan a Sentry.
export function errorMiddleware(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message })
  }
  if (err instanceof ZodError) {
    const first = err.issues[0]
    return res.status(400).json({ error: first ? `${first.path.join('.')}: ${first.message}` : 'Datos inválidos' })
  }

  // 5xx inesperado: log estructurado (con request-id + slug del contexto) y Sentry.
  log.error('Error no controlado', { method: req.method, path: req.path, err: serializeError(err) })
  captureError(err, { route: `${req.method} ${req.path}` })
  return res.status(500).json({
    error: 'Error interno del servidor',
    ...(req.id ? { requestId: req.id } : {}),
  })
}

export function notFoundMiddleware(_req: Request, res: Response) {
  res.status(404).json({ error: 'Endpoint no encontrado' })
}
