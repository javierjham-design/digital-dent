// Provisión de bases de datos por clínica (database-per-tenant).
// Crea la base física en el servidor Postgres, aplica el DDL del schema tenant
// (prisma/tenant/init.sql) y deja la clínica lista. Requiere que la credencial
// de TENANT_DB_SERVER_URL tenga permiso de CREATE DATABASE.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { PrismaClient as TenantPrisma, Prisma } from '../../prisma/generated/tenant/index.js'
import { env } from '@/config/env'
import { control } from '@/db/control'
import { tenantClient, tenantUrl } from '@/db/tenant'
import { splitSqlStatements } from '@/lib/sql-split'
import { captureError } from '@/lib/observability'

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

// Criterio PURO de "base productiva" (testeable sin una base real). El FLAG del
// control-plane MANDA: si hay registro, `esDemo` decide (una demo NO es productiva —
// sus pacientes son del seed, es irrelevante cuántos tenga). Solo una base HUÉRFANA
// (sin registro) cae a la heurística de conteo de pacientes.
//
// (No mezclar con la heurística de pacientes cuando SÍ hay registro: eso rompía la
// limpieza de demos, porque una demo se siembra con pacientes por diseño.)
export function evaluarProductiva(args: { registro: { esDemo: boolean } | null; pacientes: number }): boolean {
  if (args.registro) return !args.registro.esDemo   // demo → false; clínica real → true
  return args.pacientes > 0                          // huérfana: si tiene pacientes, tratarla como productiva
}

// ¿Es una base PRODUCTIVA? Resuelve los datos y aplica `evaluarProductiva`. Solo cuenta
// pacientes cuando NO hay registro en el control-plane (base huérfana).
async function esBaseProductiva(dbName: string): Promise<boolean> {
  const registro = await control.clinica.findUnique({ where: { dbName }, select: { esDemo: true } }).catch(() => null)
  let pacientes = 0
  if (!registro) {
    try {
      const rows = await tenantClient(dbName).$queryRawUnsafe<{ n: number }[]>('SELECT count(*)::int AS n FROM "Paciente"')
      pacientes = rows[0]?.n ?? 0
    } catch { /* base a medio crear / sin la tabla → 0 pacientes */ }
  }
  return evaluarProductiva({ registro, pacientes })
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

// Error de provisión incompleta: el DDL se aplicó a medias y la base NO tiene todas
// las tablas/columnas que el schema declara. Lleva la lista de lo que faltó.
export class ProvisionIncompletaError extends Error {
  constructor(public dbName: string, public faltantes: string[]) {
    const muestra = faltantes.slice(0, 12).join(', ')
    super(`Provisión incompleta de "${dbName}": faltan ${faltantes.length} columna(s)/tabla(s) [${muestra}${faltantes.length > 12 ? ', …' : ''}]`)
    this.name = 'ProvisionIncompletaError'
  }
}

// PURA (testeable sin base): dado el set de "Tabla.columna" que EXISTEN en la base,
// devuelve las que el schema tenant DECLARA (vía DMMF del cliente generado — misma fuente
// que usa el código) y NO están. Las relaciones (kind 'object') no son columnas y se saltan.
// El nombre real respeta @map/@@map (dbName ?? name).
export function columnasFaltantes(existentes: Set<string>): string[] {
  const faltantes: string[] = []
  for (const model of Prisma.dmmf.datamodel.models) {
    const tabla = model.dbName ?? model.name
    for (const f of model.fields) {
      if (f.kind === 'object') continue // relación: no es una columna
      const col = f.dbName ?? f.name
      if (!existentes.has(`${tabla}.${col}`)) faltantes.push(`${tabla}.${col}`)
    }
  }
  return faltantes
}

// Self-check post-DDL: compara lo que el schema declara contra lo que REALMENTE existe en
// la base recién creada. Devuelve las faltantes ("Tabla.columna"); vacío = base completa.
// Cubre el modo de falla que la guarda anti-drift NO ve: que el DDL se aplique a medias en
// runtime (así nació la demo con 491 columnas en vez de 588).
export async function verificarSchemaTenant(dbName: string): Promise<string[]> {
  const db = tenantClient(dbName)
  const cols = await db.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`,
  )
  return columnasFaltantes(new Set(cols.map((c) => `${c.table_name}.${c.column_name}`)))
}

// Provisión completa: crea la base, aplica el schema y VERIFICA que quedó completa.
// Atómica: si el DDL falla o el self-check encuentra faltantes, borra la base que acababa
// de crear (mejor no crear la clínica que crearla rota) y relanza. La base recién creada
// (sin registro ni pacientes) cae por el camino no-productivo de dropTenantDatabase.
// Idempotente en la creación.
export async function provisionTenant(dbName: string): Promise<void> {
  await createTenantDatabase(dbName)
  try {
    await applyTenantSchema(dbName)
    const faltantes = await verificarSchemaTenant(dbName)
    if (faltantes.length > 0) throw new ProvisionIncompletaError(dbName, faltantes)
  } catch (e) {
    captureError(e instanceof Error ? e : new Error(String(e)), { route: 'provisionTenant', dbName })
    await dropTenantDatabase(dbName).catch(() => {}) // no dejar una base huérfana a medio crear
    throw e
  }
}

// Verifica conectividad/credenciales del servidor de tenants (para diagnóstico).
export async function pingTenantServer(): Promise<boolean> {
  return withAdmin(async (admin) => {
    await admin.$queryRawUnsafe('SELECT 1')
    return true
  }).catch(() => false)
}

export { tenantUrl }
