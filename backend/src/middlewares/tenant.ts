import type { Request, Response, NextFunction } from 'express'
import { control } from '@/db/control'
import { tenantClient, type TenantClient } from '@/db/tenant'
import { unauthorized, forbidden } from '@/lib/errors'

// Cache id-de-clínica → { slug, dbName, activo }. dbName nunca cambia; activo se
// revalida con un TTL corto para reflejar suspensiones sin reiniciar.
interface ClinicaInfo { id: string; slug: string; dbName: string; activo: boolean; at: number }
const cache = new Map<string, ClinicaInfo>()
const TTL_MS = 30_000

async function resolveClinica(clinicaId: string): Promise<ClinicaInfo | null> {
  const cached = cache.get(clinicaId)
  if (cached && Date.now() - cached.at < TTL_MS) return cached
  const c = await control.clinica.findUnique({
    where: { id: clinicaId },
    select: { id: true, slug: true, dbName: true, activo: true },
  })
  if (!c) return null
  const info: ClinicaInfo = { ...c, at: Date.now() }
  cache.set(clinicaId, info)
  return info
}

// Resuelve la clínica del JWT (control-plane) y adjunta su cliente de tenant.
// Reemplaza a requireClinica en el modelo database-per-tenant.
export async function requireTenant(req: Request, _res: Response, next: NextFunction) {
  try {
    const clinicaId = req.auth?.clinicaId
    if (!clinicaId) throw forbidden('Esta ruta requiere una sesión de clínica.')
    const info = await resolveClinica(clinicaId)
    if (!info) throw unauthorized('Clínica no encontrada.')
    if (!info.activo) throw forbidden('La cuenta de la clínica está suspendida.')
    req.clinica = { id: info.id, slug: info.slug, dbName: info.dbName }
    req.tenant = tenantClient(info.dbName)
    next()
  } catch (e) {
    next(e)
  }
}

// Accesor del cliente de tenant en controllers (análogo a clinicaId(req)).
export function tenantDb(req: Request): TenantClient {
  if (!req.tenant) throw unauthorized('Contexto de clínica no resuelto.')
  return req.tenant
}

// Invalida el cache de una clínica (tras suspender/reactivar o borrar).
export function invalidateClinicaCache(clinicaId: string): void {
  cache.delete(clinicaId)
}
