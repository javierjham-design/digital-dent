// Factory de clientes de TENANT de prueba (sqlite, una base/archivo por clínica).
// El config de integración aliasa @/db/tenant → este módulo, así cada clínica
// usa una BASE FÍSICAMENTE SEPARADA (archivo sqlite distinto).
// @ts-expect-error — cliente generado en globalSetup
import { PrismaClient } from '../../prisma/tenant/.test-tenant-client/index.js'
import path from 'node:path'

export type TenantClient = PrismaClient

const cache = new Map<string, PrismaClient>()

export function tenantUrl(dbName: string): string {
  return 'file:' + path.resolve('prisma/.test-tenants', `${dbName}.db`).replace(/\\/g, '/')
}

export function tenantClient(dbName: string): PrismaClient {
  let client = cache.get(dbName)
  if (!client) {
    client = new PrismaClient({ datasources: { db: { url: tenantUrl(dbName) } } })
    cache.set(dbName, client)
  }
  return client
}

export async function disposeTenant(dbName: string): Promise<void> {
  const client = cache.get(dbName)
  if (client) { cache.delete(dbName); await client.$disconnect().catch(() => {}) }
}
