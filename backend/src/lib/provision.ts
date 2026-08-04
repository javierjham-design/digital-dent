// Provisión de bases de datos por clínica (database-per-tenant).
// Crea la base física en el servidor Postgres, aplica el DDL del schema tenant
// (prisma/tenant/init.sql) y deja la clínica lista. Requiere que la credencial
// de TENANT_DB_SERVER_URL tenga permiso de CREATE DATABASE.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { PrismaClient as TenantPrisma } from '../../prisma/generated/tenant/index.js'
import { env } from '@/config/env'
import { control } from '@/db/control'
import { tenantClient, tenantUrl } from '@/db/tenant'
import { splitSqlStatements } from '@/lib/sql-split'

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

// ¿Es una base PRODUCTIVA? Lo es si su clínica en el control-plane NO está marcada
// esDemo, o si la base tiene filas en Paciente. Una base recién creada (rollback) o
// sin la tabla todavía cuenta como NO productiva.
async function esBaseProductiva(dbName: string): Promise<boolean> {
  const c = await control.clinica.findUnique({ where: { dbName }, select: { esDemo: true } }).catch(() => null)
  if (c && !c.esDemo) return true
  try {
    const rows = await tenantClient(dbName).$queryRawUnsafe<{ n: number }[]>('SELECT count(*)::int AS n FROM "Paciente"')
    if ((rows[0]?.n ?? 0) > 0) return true
  } catch { /* la tabla puede no existir en una base a medio crear → no productiva */ }
  return false
}

// Borra la base de una clínica. BARRERA propia (no depende solo de quien llame): se
// NIEGA a borrar una base productiva salvo que se pase confirmarBorradoProductivo Y
// exista un dump lógico reciente con prefijo pre-drop/. Los call sites actuales
// (rollback de creación fallida, limpieza de demos) caen por el camino no-productivo
// y no necesitan la confirmación.
export async function dropTenantDatabase(dbName: string, opts?: { confirmarBorradoProductivo?: boolean }): Promise<void> {
  assertValidDbName(dbName)
  if (await esBaseProductiva(dbName)) {
    if (!opts?.confirmarBorradoProductivo) {
      throw new Error(`Negado: "${dbName}" es una base productiva (clínica no-demo o con pacientes). Requiere confirmarBorradoProductivo y un dump pre-drop reciente.`)
    }
    // Carga diferida: no acoplar el SDK de S3 al camino normal de provisión.
    const { hayPreDropReciente } = await import('@/lib/backup/predrop')
    const hay = await hayPreDropReciente(dbName).catch(() => false)
    if (!hay) throw new Error(`Negado: no hay un backup pre-drop/ reciente de "${dbName}". Hacé un backup antes de borrar.`)
  }
  await withAdmin(async (admin) => {
    // Cortar conexiones activas antes de borrar.
    await admin.$executeRawUnsafe(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${dbName}' AND pid <> pg_backend_pid()`,
    ).catch(() => {})
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}"`)
  })
}

// Borra una base EFÍMERA de restore/ensayo, saltando la barrera productiva. Solo
// acepta nombres con patrón efímero (…_r<12 dígitos> o …_drill_<id>): jamás puede
// borrar una base viva de clínica (clariva_t_<slug>). Para las bases _pre_restore_
// —que contienen los datos viejos y su borrado SÍ es irreversible— usá
// dropTenantDatabase con confirmarBorradoProductivo (exige un pre-drop reciente).
const EPHEMERAL_RE = /(_r\d{12}|_drill_[a-z0-9]+)$/
export async function dropEphemeralDatabase(dbName: string): Promise<void> {
  assertValidDbName(dbName)
  if (!EPHEMERAL_RE.test(dbName)) throw new Error(`dropEphemeralDatabase solo borra bases efímeras de restore/ensayo, no "${dbName}".`)
  await withAdmin(async (admin) => {
    await admin.$executeRawUnsafe(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${dbName}' AND pid <> pg_backend_pid()`,
    ).catch(() => {})
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}"`)
  })
}

// Renombra una base (para el switch del restore: la base viva pasa a _pre_restore_).
export async function renameTenantDatabase(from: string, to: string): Promise<void> {
  assertValidDbName(from)
  assertValidDbName(to)
  await withAdmin(async (admin) => {
    await admin.$executeRawUnsafe(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${from}' AND pid <> pg_backend_pid()`,
    ).catch(() => {})
    await admin.$executeRawUnsafe(`ALTER DATABASE "${from}" RENAME TO "${to}"`)
  })
}

// Aplica el DDL del schema tenant sobre una base recién creada.
export async function applyTenantSchema(dbName: string): Promise<void> {
  const sql = readFileSync(INIT_SQL_PATH, 'utf8')
  // Split robusto (respeta strings/comentarios/dollar-quotes), no un split(';') a secas.
  const statements = splitSqlStatements(sql)
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
