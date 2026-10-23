import type { Request, Response, NextFunction } from 'express'
import { control } from '@/db/control'
import { tenantClient, type TenantClient } from '@/db/tenant'
import { unauthorized, forbidden } from '@/lib/errors'
import { parseModulos } from '@shared/constants/modulos'
import { registrarPresencia, debePersistirAcceso } from '@/lib/presence'
import { patchRequestContext } from '@/lib/request-context'

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

// Revalidación de sesión: un usuario desactivado/borrado NO debe seguir operando con su JWT
// vigente (hasta 12 h), y un usuario DEGRADADO de rol no debe conservar el rol del token
// (requireAdmin/requirePermiso confían en req.auth.role). Se chequea con un TTL corto
// (reflejo en ≤30 s sin reiniciar). Fail-open ante error de BD (no bloquear por una caída
// de infra); fail-closed si no existe o está inactivo. Clave por (dbName, userId).
const userCache = new Map<string, { activo: boolean; role: string | null; at: number }>()
async function estadoUsuario(db: TenantClient, dbName: string, userId: string): Promise<{ activo: boolean; role: string | null }> {
  const key = `${dbName}:${userId}`
  const cached = userCache.get(key)
  if (cached && Date.now() - cached.at < TTL_MS) return cached
  try {
    const u = await db.user.findUnique({ where: { id: userId }, select: { activo: true, role: true } })
    const estado = { activo: u?.activo ?? false, role: u?.role ?? null } // no encontrado (borrado) → bloquear
    userCache.set(key, { ...estado, at: Date.now() })
    return estado
  } catch {
    return { activo: true, role: null } // error de BD: no bloquear al usuario por un problema de infraestructura
  }
}

// Invalida el cache de un usuario (tras desactivarlo/reactivarlo) para lockout inmediato.
export function invalidateUserCache(dbName: string, userId: string): void {
  userCache.delete(`${dbName}:${userId}`)
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
    // Revocación de sesión: si el usuario de la clínica fue desactivado/borrado, se corta aquí
    // (no espera a que expire el JWT). Los super-admin de plataforma no son usuarios del tenant.
    if (req.auth && !req.auth.isPlatformAdmin) {
      const estado = await estadoUsuario(req.tenant, info.dbName, req.auth.sub)
      if (!estado.activo) {
        throw unauthorized('Tu usuario ya no está activo en esta clínica. Inicia sesión de nuevo.')
      }
      // Rol degradado/cambiado después de emitir el token: el claim del JWT ya no vale.
      if (estado.role !== null && estado.role !== req.auth.role) {
        throw unauthorized('Tu rol en la clínica cambió. Inicia sesión de nuevo.')
      }
    }
    // Etiqueta el contexto de logging/Sentry con la clínica de esta request.
    patchRequestContext({ slug: info.slug })
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

// Resuelve el cliente de tenant por slug (para rutas PÚBLICAS sin JWT, ej. webhooks).
export async function tenantDbPorSlug(slug: string): Promise<TenantClient | null> {
  const c = await control.clinica.findUnique({ where: { slug }, select: { dbName: true, activo: true } })
  if (!c || !c.activo) return null
  return tenantClient(c.dbName)
}

// Invalida el cache de una clínica (tras suspender/reactivar o borrar).
export function invalidateClinicaCache(clinicaId: string): void {
  cache.delete(clinicaId)
}
