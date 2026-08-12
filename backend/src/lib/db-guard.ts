// Guarda de identidad de base para SCRIPTS de producción. Antes de operar sobre una
// base (leer/escribir/migrar), verifica con `SELECT current_database()` que la conexión
// esté REALMENTE en la base esperada. Nació de un casi-accidente (2026-08-10): un error
// de quoting mandó una operación a la base `railway` (la base por defecto que crea
// Railway) en vez de la clínica objetivo. Esta guarda aborta en ese caso en vez de
// operar sobre la base equivocada.
//
// NO es para el hot-path de la API (agrega un roundtrip): es exclusiva de los scripts.
import { env } from '@/config/env'

// Bases que NUNCA son un destino válido de operación: la default de Railway, la de
// mantenimiento de Postgres, o un nombre vacío (URL sin path → cae a la default).
const BASES_PROHIBIDAS = new Set(['railway', 'postgres', 'template0', 'template1', ''])

interface RawDb {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>
}

// Nombre de base a partir de una URL de conexión (último segmento del path).
export function nombreBaseDeUrl(url: string): string {
  try { return new URL(url).pathname.replace(/^\//, '') } catch { return '' }
}

// Verifica que `db` esté conectado a `esperada`. Lanza si no coincide o si `esperada`
// es un nombre prohibido. Devuelve el nombre real para logging.
export async function assertBaseActual(db: RawDb, esperada: string): Promise<string> {
  if (BASES_PROHIBIDAS.has(esperada)) {
    throw new Error(`GUARDA DE BASE: "${esperada}" no es un destino válido (base por defecto/vacía). Revisá la URL de conexión.`)
  }
  const rows = await db.$queryRawUnsafe<{ current_database: string }[]>('SELECT current_database() AS current_database')
  const actual = rows[0]?.current_database ?? ''
  if (actual !== esperada) {
    throw new Error(
      `GUARDA DE BASE: conectado a "${actual}" pero se esperaba "${esperada}". ` +
      `Abortando para NO operar sobre la base equivocada.`,
    )
  }
  if (BASES_PROHIBIDAS.has(actual)) {
    throw new Error(`GUARDA DE BASE: la conexión resolvió a la base prohibida "${actual}". Abortando.`)
  }
  return actual
}

// Verifica que el cliente de control esté en la base de control esperada (derivada del
// env). Úsalo al inicio de un script que toca el control-plane.
export async function assertControlActual(db: RawDb): Promise<string> {
  return assertBaseActual(db, nombreBaseDeUrl(env.controlDatabaseUrl))
}
