// Conexiones a las bases de datos de los TENANTS (una por clínica). Se cachea
// un PrismaClient por dbName para no abrir un pool por request. La base se
// resuelve a partir de TENANT_DB_SERVER_URL cambiando el nombre de la base.
import { PrismaClient } from '../../prisma/generated/tenant/index.js'
import { env } from '@/config/env'

export type TenantClient = PrismaClient

const cache = new Map<string, PrismaClient>()

// Construye la URL de conexión de una clínica a partir del servidor base,
// preservando credenciales, host y query params (sslmode, etc.).
export function tenantUrl(dbName: string): string {
  const u = new URL(env.tenantDbServerUrl)
  u.pathname = `/${dbName}`
  return u.toString()
}

// Devuelve (creando y cacheando si hace falta) el cliente Prisma de una clínica.
export function tenantClient(dbName: string): PrismaClient {
  let client = cache.get(dbName)
  if (!client) {
    client = new PrismaClient({
      datasources: { db: { url: tenantUrl(dbName) } },
      log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
    })
    cache.set(dbName, client)
  }
  return client
}

// Cierra y descarta el cliente cacheado de una clínica (p.ej. tras borrar su
// base o reasignar conexión). Best-effort.
export async function disposeTenant(dbName: string): Promise<void> {
  const client = cache.get(dbName)
  if (client) {
    cache.delete(dbName)
    await client.$disconnect().catch(() => {})
  }
}
