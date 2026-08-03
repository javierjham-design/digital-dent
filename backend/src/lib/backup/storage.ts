// Object storage S3-compatible para los backups (Cloudflare R2 por defecto; sirve
// igual para Backblaze B2 o S3). Dos juegos de credenciales:
//   - ESCRITURA/LECTURA (job diario): BACKUP_S3_ACCESS_KEY_ID/SECRET. SIN permiso
//     de borrado a nivel de bucket/IAM: si el backend se ve comprometido, no puede
//     borrar el histórico.
//   - PODA: BACKUP_S3_PRUNE_ACCESS_KEY_ID/SECRET. Solo las usa el servicio de poda,
//     nunca el env del backend.
import { S3Client, GetObjectCommand, ListObjectsV2Command, DeleteObjectsCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { Readable } from 'node:stream'
import { env } from '@/config/env'

export interface StoredObject { key: string; size: number; lastModified: Date }

function requireDestino(): { endpoint: string; region: string; bucket: string } {
  const { s3Endpoint, s3Region, s3Bucket } = env.backup
  if (!s3Endpoint || !s3Bucket) throw new Error('Backups sin destino: definí BACKUP_S3_ENDPOINT y BACKUP_S3_BUCKET.')
  return { endpoint: s3Endpoint, region: s3Region, bucket: s3Bucket }
}

function makeClient(accessKeyId: string, secretAccessKey: string): S3Client {
  const { endpoint, region } = requireDestino()
  // forcePathStyle: compatible con R2/B2/MinIO además de S3.
  return new S3Client({ endpoint, region, credentials: { accessKeyId, secretAccessKey }, forcePathStyle: true })
}

// Cliente de escritura/lectura (job diario y restore). No debe tener delete en IAM.
export function writeStore(): { client: S3Client; bucket: string } {
  const id = process.env.BACKUP_S3_ACCESS_KEY_ID ?? ''
  const secret = process.env.BACKUP_S3_SECRET_ACCESS_KEY ?? ''
  if (!id || !secret) throw new Error('Faltan BACKUP_S3_ACCESS_KEY_ID / BACKUP_S3_SECRET_ACCESS_KEY.')
  return { client: makeClient(id, secret), bucket: requireDestino().bucket }
}

// Cliente de PODA (credenciales separadas, con permiso de delete). Solo backup:prune.
export function pruneStore(): { client: S3Client; bucket: string } {
  const id = process.env.BACKUP_S3_PRUNE_ACCESS_KEY_ID ?? ''
  const secret = process.env.BACKUP_S3_PRUNE_SECRET_ACCESS_KEY ?? ''
  if (!id || !secret) throw new Error('Faltan BACKUP_S3_PRUNE_ACCESS_KEY_ID / BACKUP_S3_PRUNE_SECRET_ACCESS_KEY (poda con credenciales propias).')
  return { client: makeClient(id, secret), bucket: requireDestino().bucket }
}

export function backupDestinoConfigurado(): boolean {
  return Boolean(env.backup.s3Endpoint && env.backup.s3Bucket && process.env.BACKUP_S3_ACCESS_KEY_ID && process.env.BACKUP_S3_SECRET_ACCESS_KEY)
}

// ── Rutas dentro del bucket ───────────────────────────────────────────────────
// clariva/<YYYY>/<MM>/<DD>/<dbName>__<ISO8601>.dump.enc  (o pre-drop/<...>)
function fecha(iso: string): { y: string; m: string; d: string } {
  const dt = new Date(iso)
  return { y: String(dt.getUTCFullYear()), m: String(dt.getUTCMonth() + 1).padStart(2, '0'), d: String(dt.getUTCDate()).padStart(2, '0') }
}
function safeIso(iso: string): string {
  return iso.replace(/[:]/g, '-') // los ':' molestan en algunas claves de objeto
}

export function dumpKey(dbName: string, iso: string, opts?: { preDrop?: boolean }): string {
  const { y, m, d } = fecha(iso)
  const base = opts?.preDrop ? `${env.backup.s3Prefix}/pre-drop` : env.backup.s3Prefix
  return `${base}/${y}/${m}/${d}/${dbName}__${safeIso(iso)}.dump.enc`
}

export function manifestKey(iso: string): string {
  const { y, m, d } = fecha(iso)
  return `${env.backup.s3Prefix}/${y}/${m}/${d}/manifest__${safeIso(iso)}.json`
}

// ── Operaciones ───────────────────────────────────────────────────────────────
export async function uploadStream(key: string, body: Readable): Promise<void> {
  const { client, bucket } = writeStore()
  const up = new Upload({
    client,
    params: { Bucket: bucket, Key: key, Body: body },
    queueSize: 4,
    partSize: 8 * 1024 * 1024, // 8 MB por parte
  })
  await up.done()
}

export async function putBuffer(key: string, buf: Buffer, contentType = 'application/octet-stream'): Promise<void> {
  const { client, bucket } = writeStore()
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buf, ContentType: contentType }))
}

export async function getObjectStream(key: string): Promise<Readable> {
  const { client, bucket } = writeStore()
  const r = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  if (!r.Body) throw new Error(`Objeto vacío o inexistente: ${key}`)
  return r.Body as Readable
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const stream = await getObjectStream(key)
  const chunks: Buffer[] = []
  for await (const c of stream) chunks.push(c as Buffer)
  return Buffer.concat(chunks)
}

// Lista TODOS los objetos bajo un prefijo (paginado). client opcional para la poda.
export async function listObjects(prefix: string, client?: S3Client): Promise<StoredObject[]> {
  const store = client ? { client, bucket: requireDestino().bucket } : writeStore()
  const out: StoredObject[] = []
  let token: string | undefined
  do {
    const r = await store.client.send(new ListObjectsV2Command({ Bucket: store.bucket, Prefix: prefix, ContinuationToken: token }))
    for (const o of r.Contents ?? []) {
      if (o.Key) out.push({ key: o.Key, size: o.Size ?? 0, lastModified: o.LastModified ?? new Date(0) })
    }
    token = r.IsTruncated ? r.NextContinuationToken : undefined
  } while (token)
  return out
}

// Borra objetos EN LOTE. Requiere el cliente de poda (credenciales con delete).
export async function deleteObjects(keys: string[], client: S3Client): Promise<void> {
  if (keys.length === 0) return
  const { bucket } = pruneStore()
  for (let i = 0; i < keys.length; i += 1000) {
    const lote = keys.slice(i, i + 1000)
    await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: lote.map((Key) => ({ Key })) } }))
  }
}
