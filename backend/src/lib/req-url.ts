import type { Request } from 'express'

// Base pública del BACKEND (para webhooks server-to-server, ej. Flow) y del
// FRONTEND (retorno del usuario). Se pueden fijar por env (API_PUBLIC_URL /
// APP_PUBLIC_URL); si no, se derivan del request (respetando el proxy de Railway).
export function apiBaseDe(req: Request): string {
  if (process.env.API_PUBLIC_URL) return process.env.API_PUBLIC_URL.replace(/\/$/, '')
  const proto = (req.get('x-forwarded-proto') ?? req.protocol ?? 'https').split(',')[0]
  return `${proto}://${req.get('host')}/api/v1`
}

export function appBaseDe(req: Request): string {
  if (process.env.APP_PUBLIC_URL) return process.env.APP_PUBLIC_URL.replace(/\/$/, '')
  return (req.get('origin') ?? '').replace(/\/$/, '')
}
