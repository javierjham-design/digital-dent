// Provisión de bases de datos por clínica (database-per-tenant).
// Crea la base física en el servidor Postgres, aplica el DDL del schema tenant
// (prisma/tenant/init.sql) y deja la clínica lista. Requiere que la credencial
// de TENANT_DB_SERVER_URL tenga permiso de CREATE DATABASE.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { PrismaClient as TenantPrisma } from '../../prisma/generated/tenant/index.js'
import { env } from '@/config/env'
import { tenantClient, tenantUrl } from '@/db/tenant'

const INIT_SQL_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../prisma/tenant/init.sql')

// Nombre de base válido y determinístico a partir del slug de la clínica.
// Postgres: identificador en minúsculas, empieza por letra, [a-z0-9_], <= 63.
export function dbNameForSlug(slug: string): string {
  const norm = slug.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48)
  const name = `clariva_t_${norm || 'clinica'}`
  assertValidDbName(name)
  return name
}

export function assertValidDbName(name: string): void {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(name)) throw new Error(`Nombre de base inválido: ${name}`)
}

// Cliente admin (conecta a la base de mantenimiento del servidor) para
// CREATE/DROP DATABASE. Se crea on-demand y se desconecta al terminar.
async function withAdmin<T>(fn: (db: TenantPrisma) => Promise<T>): Promise<T> {
  const admin = new TenantPrisma({ datasources: { db: { url: env.tenantDbServerUrl } } })
  try { return await fn(admin) } finally { await admin.$disconnect().catch(() => {}) }
}

export async function createTenantDatabase(dbName: string): Promise<void> {
  assertValidDbName(dbName)
  await withAdmin(async (admin) => {
    try {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`)
    } catch (e: unknown) {
      // 42P04 = duplicate_database → idempotente, ya existe.
      if (e && typeof e === 'object' && 'code' in e && (e as { code?: string }).code === 'P2010' && String((e as { meta?: { code?: string } }).meta?.code) === '42P04') return
      if (e instanceof Error && /already exists|42P04/i.test(e.message)) return
      throw e
    }
  })
}

export async function dropTenantDatabase(dbName: string): Promise<void> {
  assertValidDbName(dbName)
  await withAdmin(async (admin) => {
    // Cortar conexiones activas antes de borrar.
    await admin.$executeRawUnsafe(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${dbName}' AND pid <> pg_backend_pid()`,
    ).catch(() => {})
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}"`)
  })
}

// Aplica el DDL del schema tenant sobre una base recién creada.
export async function applyTenantSchema(dbName: string): Promise<void> {
  const sql = readFileSync(INIT_SQL_PATH, 'utf8')
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^(--.*\s*)*$/.test(s))
  const db = tenantClient(dbName)
  for (const stmt of statements) {
    await db.$executeRawUnsafe(stmt)
  }
}

// Provisión completa: crea la base y aplica el schema. Idempotente en la
// creación; el schema se asume sobre una base nueva (vacía).
export async function provisionTenant(dbName: string): Promise<void> {
  await createTenantDatabase(dbName)
  await applyTenantSchema(dbName)
}

// Verifica conectividad/credenciales del servidor de tenants (para diagnóstico).
export async function pingTenantServer(): Promise<boolean> {
  return withAdmin(async (admin) => {
    await admin.$queryRawUnsafe('SELECT 1')
    return true
  }).catch(() => false)
}

export { tenantUrl }
