// ─────────────────────────────────────────────────────────────────────────────
//  PODA de backups (retención GFS). Servicio SEPARADO con credenciales propias
//  (BACKUP_S3_PRUNE_*), nunca en el env del backend. DRY-RUN por defecto.
//
//    npm run backup:prune            # muestra qué borraría (no borra)
//    npm run backup:prune -- --apply # borra de verdad
//
//  Salvaguardas: se NIEGA a correr si no encuentra un manifiesto válido reciente
//  (señal de que los backups están rotos), y NUNCA deja una base con menos de
//  BACKUP_PRUNE_MIN_KEEP backups. Respeta los object-lock del bucket (ver BACKUPS.md):
//  las duraciones de lock son menores que la retención, así lo podable ya está
//  fuera de su ventana de lock.
// ─────────────────────────────────────────────────────────────────────────────
import 'dotenv/config'
import { env } from '@/config/env'
import { log } from '@/lib/logger'
import { listObjects, deleteObjects, pruneStore } from '@/lib/backup/storage'
import { listarManifiestos } from '@/lib/backup/locate'
import { tryParseManifest } from '@/lib/backup/manifest'
import { getObjectBuffer } from '@/lib/backup/storage'
import { podaConPiso, type ObjetoFechado } from '@/lib/backup/retention'

const APPLY = process.argv.includes('--apply')

// Extrae el dbName del nombre del objeto: <prefix>/YYYY/MM/DD/<dbName>__<iso>.dump.enc
function dbNameDeKey(key: string): string | null {
  const file = key.split('/').pop() ?? ''
  if (!file.endsWith('.dump.enc')) return null
  const i = file.indexOf('__')
  return i > 0 ? file.slice(0, i) : null
}

async function main(): Promise<void> {
  const { client } = pruneStore() // valida credenciales de poda

  // Salvaguarda 1: exigir un manifiesto válido reciente (backups sanos).
  const manifiestos = await listarManifiestos()
  if (manifiestos.length === 0) throw new Error('Poda abortada: no hay manifiestos en el bucket (¿backups rotos?).')
  let algunoValido = false
  for (const k of manifiestos.slice(-5)) { // revisar los últimos por nombre
    if (tryParseManifest((await getObjectBuffer(k)).toString('utf8'))) { algunoValido = true; break }
  }
  if (!algunoValido) throw new Error('Poda abortada: ningún manifiesto reciente es válido (¿backups rotos?).')

  // Agrupar dumps (excluye pre-drop/, que se protege aparte por lock/lifecycle).
  const objetos = await listObjects(`${env.backup.s3Prefix}/`, client)
  const porBase = new Map<string, ObjetoFechado[]>()
  for (const o of objetos) {
    if (o.key.includes('/pre-drop/') || !o.key.endsWith('.dump.enc')) continue
    const db = dbNameDeKey(o.key)
    if (!db) continue
    if (!porBase.has(db)) porBase.set(db, [])
    porBase.get(db)!.push({ key: o.key, date: o.lastModified })
  }

  const params = { retainDaily: env.backup.retainDaily, retainWeekly: env.backup.retainWeekly, retainMonthly: env.backup.retainMonthly }
  const now = new Date()
  const aBorrar: string[] = []

  for (const [db, objs] of porBase) {
    const plan = podaConPiso(objs, now, params, env.backup.pruneMinKeep)
    if (plan.abortadoPorPiso) {
      log.warn('poda: piso mínimo alcanzado, no se borra nada de esta base', { base: db, total: objs.length, minKeep: env.backup.pruneMinKeep })
      continue
    }
    if (plan.borrar.length) {
      log.info('poda: plan para base', { base: db, total: objs.length, conservar: plan.conservar.length, borrar: plan.borrar.length })
      aBorrar.push(...plan.borrar)
    }
  }

  if (aBorrar.length === 0) { log.info('poda: nada que borrar'); return }
  if (!APPLY) {
    log.info(`poda: DRY-RUN — se borrarían ${aBorrar.length} objeto(s). Reejecutá con --apply para borrar.`, { ejemplos: aBorrar.slice(0, 5) })
    return
  }
  await deleteObjects(aBorrar, client)
  log.info(`poda: ${aBorrar.length} objeto(s) borrados.`)
}

main().catch((e) => { log.error('poda: falló', { err: e instanceof Error ? e.message : String(e) }); process.exit(1) })
