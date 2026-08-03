import { randomUUID } from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'
import { runWithRequestContext } from '@/lib/request-context'

// Genera (o hereda) un request-id por request, lo expone en `req.id` y en la
// respuesta (`X-Request-Id`, útil para que soporte lo relacione con Sentry), y
// abre el AsyncLocalStorage para que TODO log del request lo incluya. Va primero
// en la cadena, así incluso /health y las rutas públicas quedan trazadas.
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id']
  const requestId = typeof incoming === 'string' && incoming.trim()
    ? incoming.trim().slice(0, 200)
    : randomUUID()
  req.id = requestId
  res.setHeader('X-Request-Id', requestId)
  runWithRequestContext({ requestId }, () => next())
}
