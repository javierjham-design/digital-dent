import type { Request, Response, NextFunction } from 'express'
import { control } from '@/db/control'
import { tenantClient, type TenantClient } from '@/db/tenant'
import { unauthorized, forbidden } from '@/lib/errors'
import { parseModulos } from '@shared/constants/modulos'
import { registrarPresencia, debePersistirAcceso } from '@/lib/presence'

// Cache id-de-clínica → { slug, dbName, activo, modulos }. dbName nunca cambia;
// activo/modulos se revalidan con un TTL corto para reflejar cambios sin reiniciar.
interface ClinicaInfo { id: string; slug: string; dbName: string; activo: boolean; modulos: string[]; at: number }
const cache = new Map<string, ClinicaInfo>()
const TTL_MS = 30_000

async function resolveClinica(clinicaId: string): Promise<ClinicaInfo | null> {
  const cached = cache.get(clinicaId)
  if (cached && Date.now() - cached.at < TTL_MS) return cached
  const c = await control.clinica.findUnique({
    where: { id: clinicaId },
    select: { id: true, slug: true, dbName: true, activo: true, modulos: true },
  })
  if (!c) return null
  const info: ClinicaInfo = { id: c.id, slug: c.slug, dbName: c.dbName, activo: c.activo, modulos: parseModulos(c.modulos), at: Date.now() }
  cache.set(clinicaId, info)
  return info
}

// Módulos habilitados de una clínica (usa el mismo cache). Para requireModulo.
export async function getClinicaModulos(clinicaId: string): Promise<string[]> {
  const info = await resolveClinica(clinicaId)
  return info?.modulos ?? []
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
    // Registro de uso (para el super-admin): presencia en memoria + último acceso
    // persistido con throttle. Best-effort: nunca bloquea ni rompe la request.
    if (req.auth && !req.auth.isPlatformAdmin) {
      const esAdmin = req.auth.role === 'admin'
      registrarPresencia(info.id, req.auth.sub, req.auth.name ?? req.auth.email ?? 'Usuario', esAdmin)
      if (debePersistirAcceso(info.id)) {
        void control.clinica.update({ where: { id: info.id }, data: { ultimoAccesoAt: new Date() } }).catch(() => {})
      }
      // El acceso de un admin de la clínica se registra aparte (dueño/administrador).
      if (esAdmin && debePersistirAcceso(`${info.id}:admin`)) {
        void control.clinica.update({ where: { id: info.id }, data: { ultimoAccesoAdminAt: new Date() } }).catch(() => {})
      }
    }
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
