// Ubica en el bucket el backup a restaurar para una clínica: recorre los
// manifiestos del más nuevo al más viejo y devuelve el primero (o el más nuevo
// anterior a --at) que tenga una entrada OK para ese slug/dbName.
import { listObjects, getObjectBuffer } from '@/lib/backup/storage'
import { tryParseManifest, entradaDeBase, type BackupManifest, type BaseEntry } from '@/lib/backup/manifest'
import { env } from '@/config/env'

const RE_MANIFEST = /\/manifest__.*\.json$/

export async function listarManifiestos(): Promise<string[]> {
  const objs = await listObjects(`${env.backup.s3Prefix}/`)
  return objs.filter((o) => RE_MANIFEST.test(o.key)).map((o) => o.key)
}

export interface BackupEncontrado { manifest: BackupManifest; entrada: BaseEntry; manifestKey: string }

// `at` = 'latest' o un ISO8601 (restaura el estado tal como estaba a esa fecha:
// el backup más nuevo con fecha <= at).
export async function encontrarBackup(ref: string, at: string): Promise<BackupEncontrado | null> {
  const objetivo = at === 'latest' ? null : new Date(at)
  if (objetivo && Number.isNaN(objetivo.getTime())) throw new Error(`--at inválido: "${at}" (usá ISO8601 o "latest").`)

  const keys = await listarManifiestos()
  // Cargamos y ordenamos por la fecha real del manifiesto (campo iso), desc.
  const manifiestos: { key: string; m: BackupManifest }[] = []
  for (const key of keys) {
    const m = tryParseManifest((await getObjectBuffer(key)).toString('utf8'))
    if (m) manifiestos.push({ key, m })
  }
  manifiestos.sort((a, b) => new Date(b.m.iso).getTime() - new Date(a.m.iso).getTime())

  for (const { key, m } of manifiestos) {
    if (objetivo && new Date(m.iso).getTime() > objetivo.getTime()) continue
    const entrada = entradaDeBase(m, ref)
    if (entrada) return { manifest: m, entrada, manifestKey: key }
  }
  return null
}
