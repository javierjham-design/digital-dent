// Wrappers de pg_dump / pg_restore. Las credenciales van por VARIABLES DE ENTORNO
// del hijo (PGHOST/PGUSER/PGPASSWORD/…), nunca en argv, para no exponer el password
// en la lista de procesos. Conectarse por la red interna de Railway
// (postgres.railway.internal) es más rápido y no consume ancho de banda facturado.
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { env } from '@/config/env'

// Traduce una URL de conexión a las env vars que entienden pg_dump/pg_restore.
export function pgEnvFromUrl(url: string): Record<string, string> {
  const u = new URL(url)
  const e: Record<string, string> = {
    PGHOST: u.hostname,
    PGPORT: u.port || '5432',
    PGUSER: decodeURIComponent(u.username),
    PGDATABASE: u.pathname.replace(/^\//, ''),
  }
  if (u.password) e.PGPASSWORD = decodeURIComponent(u.password)
  const sslmode = u.searchParams.get('sslmode')
  if (sslmode) e.PGSSLMODE = sslmode
  return e
}

function drainStderr(proc: ChildProcessWithoutNullStreams): { get: () => string } {
  let buf = ''
  proc.stderr.on('data', (d) => { buf += d.toString(); if (buf.length > 8000) buf = buf.slice(-8000) })
  return { get: () => buf.trim() }
}

// Lanza pg_dump en formato custom (-Fc). Devuelve el proceso y su stdout (el dump)
// para streamear a cifrado→subida. El caller debe esperar `done` para detectar fallos.
export function spawnPgDump(url: string): { proc: ChildProcessWithoutNullStreams; stdout: Readable; done: Promise<void> } {
  const proc = spawn(env.backup.pgDumpPath, ['-Fc', '--no-owner', '--no-privileges'], {
    env: { ...process.env, ...pgEnvFromUrl(url) },
  })
  const stderr = drainStderr(proc)
  const done = new Promise<void>((resolve, reject) => {
    proc.on('error', reject)
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`pg_dump salió con código ${code}: ${stderr.get()}`))))
  })
  return { proc, stdout: proc.stdout, done }
}

// Restaura un dump (custom) leído de `input` DENTRO de la base `dbName` (que ya debe
// existir y estar vacía). El nombre de la base va en argv (no es secreto); host/
// usuario/password por env.
export async function pgRestore(serverUrl: string, dbName: string, input: Readable): Promise<void> {
  const pgEnv = pgEnvFromUrl(serverUrl)
  const proc = spawn(env.backup.pgRestorePath, ['--no-owner', '--no-privileges', '--exit-on-error', '-d', dbName], {
    env: { ...process.env, ...pgEnv, PGDATABASE: dbName },
  })
  const stderr = drainStderr(proc)
  const exit = new Promise<void>((resolve, reject) => {
    proc.on('error', reject)
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`pg_restore salió con código ${code}: ${stderr.get()}`))))
  })
  await pipeline(input, proc.stdin)
  await exit
}

// Versión del cliente pg_dump (para logs/diagnóstico; el major debe ser >= al server).
export function pgDumpVersion(): Promise<string> {
  return new Promise((resolve) => {
    const proc = spawn(env.backup.pgDumpPath, ['--version'])
    let out = ''
    proc.stdout.on('data', (d) => { out += d.toString() })
    proc.on('error', () => resolve('desconocida'))
    proc.on('close', () => resolve(out.trim() || 'desconocida'))
  })
}
