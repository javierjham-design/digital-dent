// Orquestación del job de backup diario (capa 2). Descubre las bases desde el
// control-plane (nunca hardcodea la lista), y por cada una: pg_dump → cifrado →
// subida multipart, censo de filas, y una entrada en el manifiesto. Registra la
// corrida en BackupRun y alerta si termina PARCIAL/ERROR. Incluye SIEMPRE la base
// de control (sin ella no se sabe qué clínica es cuál).
import { control } from '@/db/control'
import { env } from '@/config/env'
import { tenantUrl } from '@/db/tenant'
import { log, serializeError } from '@/lib/logger'
import { loadBackupKey, encryptStream } from '@/lib/backup/crypto-stream'
import { spawnPgDump, pgDumpVersion } from '@/lib/backup/pgtools'
import { uploadStream, putBuffer, dumpKey, manifestKey, backupDestinoConfigurado } from '@/lib/backup/storage'
import { censusEnServidorTenant, censusControlVivo, TABLAS_CENSO_TENANT, type Censo } from '@/lib/backup/census'
import { serializeManifest, type BackupManifest, type BaseEntry } from '@/lib/backup/manifest'
import { alertar, verificarDeadMan } from '@/lib/backup/alerts'

function nombreBaseControl(): string {
  return new URL(env.controlDatabaseUrl).pathname.replace(/^\//, '') || 'clariva_control'
}

interface BaseObjetivo { dbName: string; slug: string; url: string; esControl?: boolean; esDemo?: boolean }

async function descubrirBases(incluirDemos: boolean, soloBases?: string[]): Promise<BaseObjetivo[]> {
  const clinicas = await control.clinica.findMany({ select: { slug: true, dbName: true, esDemo: true } })
  const bases: BaseObjetivo[] = [{ dbName: nombreBaseControl(), slug: 'control', url: env.controlDatabaseUrl, esControl: true }]
  for (const c of clinicas) {
    if (c.esDemo && !incluirDemos) continue
    bases.push({ dbName: c.dbName, slug: c.slug, url: tenantUrl(c.dbName), esDemo: c.esDemo })
  }
  return soloBases?.length ? bases.filter((b) => soloBases.includes(b.slug) || soloBases.includes(b.dbName)) : bases
}

async function censoDe(b: BaseObjetivo): Promise<Censo> {
  return b.esControl ? censusControlVivo() : censusEnServidorTenant(b.dbName, TABLAS_CENSO_TENANT)
}

// Respalda UNA base: dump → cifrado → subida. Solo se da por buena si pg_dump
// terminó con código 0 (si falla a mitad, el objeto truncado queda huérfano pero
// nunca se referencia como OK en un manifiesto).
async function respaldarBase(b: BaseObjetivo, key: Buffer, iso: string, preDrop = false): Promise<BaseEntry> {
  const t0 = Date.now()
  const objKey = dumpKey(b.dbName, iso, { preDrop })
  try {
    const { stdout, done } = spawnPgDump(b.url)
    const { output, result } = encryptStream(stdout, key)
    let uploadErr: unknown = null
    const uploadP = uploadStream(objKey, output).then(() => {}, (e) => { uploadErr = e })
    await done // pg_dump exit 0 (si no, lanza y el dump se descarta)
    await uploadP
    const { sha256, bytes } = await result
    if (uploadErr) throw uploadErr
    const censo = await censoDe(b)
    log.info('backup: base respaldada', { base: b.dbName, bytes, ms: Date.now() - t0 })
    return { dbName: b.dbName, slug: b.slug, esControl: b.esControl, esDemo: b.esDemo, key: objKey, bytes, sha256, duracionMs: Date.now() - t0, censo, ok: true }
  } catch (e) {
    log.error('backup: falló una base', { base: b.dbName, err: serializeError(e) })
    return { dbName: b.dbName, slug: b.slug, esControl: b.esControl, esDemo: b.esDemo, key: null, bytes: 0, sha256: null, duracionMs: Date.now() - t0, censo: {}, ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// Backup pre-drop de UNA base puntual (para --drop-pre-restore): deja una copia
// fresca bajo pre-drop/ antes de borrar algo irreversible.
export async function backupBaseAPreDrop(dbName: string): Promise<BaseEntry> {
  if (!backupDestinoConfigurado()) throw new Error('Backups sin configurar (BACKUP_S3_* / BACKUP_ENCRYPTION_KEY).')
  return respaldarBase({ dbName, slug: dbName, url: tenantUrl(dbName) }, loadBackupKey(), new Date().toISOString(), true)
}

export interface OpcionesBackup { incluirDemos?: boolean; disparadoPor?: 'cron' | 'manual' | 'drill'; soloBases?: string[]; preDrop?: boolean }
export interface ResultadoBackup { estado: 'OK' | 'PARCIAL' | 'ERROR'; basesTotal: number; basesOk: number; bytesTotal: number; manifestKey: string | null }

export async function ejecutarBackup(opts: OpcionesBackup = {}): Promise<ResultadoBackup> {
  if (!backupDestinoConfigurado()) throw new Error('Backups sin configurar: definí BACKUP_S3_* y BACKUP_ENCRYPTION_KEY (ver docs/BACKUPS.md).')
  const key = loadBackupKey()
  const incluirDemos = opts.incluirDemos ?? env.backup.includeDemos
  const disparadoPor = opts.disparadoPor ?? 'cron'
  const iso = new Date().toISOString()

  // Dead-man's switch al inicio (avisa si veníamos sin OK). Best-effort.
  await verificarDeadMan().catch((e) => log.warn('backup: dead-man check falló', { err: serializeError(e) }))

  log.info('backup: iniciando corrida', { disparadoPor, incluirDemos, pgDump: await pgDumpVersion() })
  const run = await control.backupRun.create({ data: { estado: 'ERROR', disparadoPor } })

  const bases = await descubrirBases(incluirDemos, opts.soloBases)
  const entradas: BaseEntry[] = []
  for (const b of bases) entradas.push(await respaldarBase(b, key, iso, opts.preDrop))

  const basesOk = entradas.filter((e) => e.ok).length
  const bytesTotal = entradas.reduce((s, e) => s + e.bytes, 0)
  const estado: ResultadoBackup['estado'] = basesOk === bases.length ? 'OK' : basesOk === 0 ? 'ERROR' : 'PARCIAL'

  const manifest: BackupManifest = { version: 1, iso, disparadoPor, incluirDemos, bases: entradas }
  const mkey = manifestKey(iso)
  await putBuffer(mkey, serializeManifest(manifest), 'application/json')

  await control.backupRun.update({
    where: { id: run.id },
    data: { terminadoAt: new Date(), estado, basesTotal: bases.length, basesOk, bytesTotal: BigInt(bytesTotal), manifiestoKey: mkey, error: estado === 'OK' ? null : `${bases.length - basesOk} base(s) fallaron` },
  })

  log.info('backup: corrida terminada', { estado, basesOk, basesTotal: bases.length, bytesTotal, manifestKey: mkey })
  if (estado !== 'OK') {
    const fallidas = entradas.filter((e) => !e.ok).map((e) => `${e.dbName}: ${e.error}`).join('<br>')
    await alertar(`Corrida ${estado}`, `<p>La corrida de backup terminó <strong>${estado}</strong> (${basesOk}/${bases.length} bases OK).</p><p>Fallaron:<br>${fallidas}</p><p>Manifiesto: ${mkey}</p>`).catch(() => {})
  }
  return { estado, basesTotal: bases.length, basesOk, bytesTotal, manifestKey: mkey }
}
