import type { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'
import { AppError } from '@/lib/errors'

// Middleware final: traduce cualquier error a JSON { error }. Nunca filtra
// stack traces ni detalles internos al cliente.
export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message })
  }
  if (err instanceof ZodError) {
    const first = err.issues[0]
    return res.status(400).json({ error: first ? `${first.path.join('.')}: ${first.message}` : 'Datos inválidos' })
  }
  console.error('[error]', err)
  return res.status(500).json({ error: 'Error interno del servidor' })
}

export function notFoundMiddleware(_req: Request, res: Response) {
  res.status(404).json({ error: 'Endpoint no encontrado' })
}
