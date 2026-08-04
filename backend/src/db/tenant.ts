// Conexiones a las bases de datos de los TENANTS (una por clínica). Se cachea un
// PrismaClient por dbName en un LRU con tope + expiración por inactividad, para que
// a escala (decenas de clínicas) no se acumulen pools y se agote el max_connections
// del Postgres. Ver docs/architecture.md "Techo de conexiones".
import { PrismaClient } from '../../prisma/generated/tenant/index.js'
import { env } from '@/config/env'
import { AsyncLru } from '@/lib/lru'

export type TenantClient = PrismaClient

// URL CRUDA de una clínica (sin parámetros de Prisma). La usan pg_dump/pg_restore
// (backups) y `prisma db push` (migraciones) — libpq NO entiende connection_limit,
// así que ese parámetro NO va acá.
export function tenantUrl(dbName: string): string {
  const u = new URL(env.tenantDbServerUrl)
  u.pathname = `/${dbName}`
  return u.toString()
}

// URL para el PrismaClient de la clínica: acota el pool con connection_limit para
// que N clientes cacheados no agoten el servidor.
function tenantClientUrl(dbName: string): string {
  const u = new URL(tenantUrl(dbName))
  u.searchParams.set('connection_limit', String(env.tenantClientPool))
  return u.toString()
}

// Caché LRU de PrismaClient por dbName: al desalojar (por tope o por inactividad)
// llama a $disconnect() para liberar el pool.
const cache = new AsyncLru<PrismaClient>({
  maxSize: env.tenantClientMax,
  ttlMs: env.tenantClientTtlMs,
  dispose: (client) => client.$disconnect(),
})

// Barrido periódico para cerrar clientes inactivos aunque no llegue tráfico nuevo.
// unref() para no impedir que el proceso termine. No en tests (usan otro módulo).
if (!process.env.VITEST && env.tenantClientTtlMs > 0) {
  const timer = setInterval(() => cache.sweepExpired(), Math.min(env.tenantClientTtlMs, 60_000))
  timer.unref?.()
}

// Devuelve (creando y cacheando si hace falta) el cliente Prisma de una clínica.
export function tenantClient(dbName: string): PrismaClient {
  return cache.getOrCreate(dbName, () => new PrismaClient({
    datasources: { db: { url: tenantClientUrl(dbName) } },
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
  }))
}

// Cierra y descarta el cliente cacheado de una clínica (p.ej. tras borrar su base o
// reasignar conexión, o para no filtrar conexiones en jobs que recorren clínicas).
// Best-effort. Mantiene la semántica que usan provisión, restore y sync.
export async function disposeTenant(dbName: string): Promise<void> {
  await cache.delete(dbName)
}
