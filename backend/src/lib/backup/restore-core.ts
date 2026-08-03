// Núcleo de restauración compartido por el restore quirúrgico y el ensayo semanal:
// crea la base destino, descarga+descifra el dump en streaming, lo restaura con
// pg_restore y VERIFICA el sha256 contra el del manifiesto (detecta archivo alterado
// o incompleto). No hace switch ni borra nada: solo deja el dump en `tempDb`.
import { createHash } from 'node:crypto'
import { Transform } from 'node:stream'
import { env } from '@/config/env'
import { loadBackupKey, decryptStream } from '@/lib/backup/crypto-stream'
import { getObjectStream } from '@/lib/backup/storage'
import { pgRestore } from '@/lib/backup/pgtools'
import { createTenantDatabase } from '@/lib/provision'

export async function restaurarDumpABase(entryKey: string, entrySha256: string, tempDb: string): Promise<void> {
  await createTenantDatabase(tempDb)
  const enc = await getObjectStream(entryKey)
  const hash = createHash('sha256')
  const hasher = new Transform({ transform(c: Buffer, _e, cb) { hash.update(c); cb(null, c) } })
  enc.pipe(hasher)
  await pgRestore(env.tenantDbServerUrl, tempDb, decryptStream(hasher, loadBackupKey()))
  const sha = hash.digest('hex')
  if (sha !== entrySha256) {
    throw new Error(`sha256 no coincide con el manifiesto (archivo alterado o incompleto). esperado=${entrySha256} obtenido=${sha}`)
  }
}
