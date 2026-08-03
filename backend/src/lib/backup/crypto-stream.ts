// Cifrado/descifrado en STREAMING para los backups. Nunca se carga el dump entero
// en memoria ni se escribe completo a disco: pg_dump → cipher → subida multipart.
//
// Formato del archivo cifrado:  IV(12 bytes) || ciphertext || authTag(16 bytes)
// Algoritmo: AES-256-GCM (node:crypto, sin dependencias externas de cripto).
// Clave: 32 bytes, en base64, desde BACKUP_ENCRYPTION_KEY.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { PassThrough, Transform, pipeline, type Readable } from 'node:stream'

const ALGO = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16

// Carga y valida la clave de 32 bytes. Falla claro si falta o no mide 32 bytes:
// una clave equivocada haría backups irrecuperables, así que se verifica temprano.
export function loadBackupKey(): Buffer {
  const b64 = process.env.BACKUP_ENCRYPTION_KEY?.trim()
  if (!b64) throw new Error('Falta BACKUP_ENCRYPTION_KEY (32 bytes en base64).')
  let key: Buffer
  try { key = Buffer.from(b64, 'base64') } catch { throw new Error('BACKUP_ENCRYPTION_KEY no es base64 válido.') }
  if (key.length !== 32) throw new Error(`BACKUP_ENCRYPTION_KEY debe ser 32 bytes en base64 (decodifica a ${key.length}).`)
  return key
}

// Genera una clave nueva lista para pegar en BACKUP_ENCRYPTION_KEY (para docs/setup).
export function generateBackupKeyB64(): string {
  return randomBytes(32).toString('base64')
}

export interface EncryptResult { sha256: string; bytes: number }

// Cifra `input` y devuelve el stream cifrado (para subir) + una promesa con el
// sha256 y el tamaño del archivo cifrado FINAL (IV+ct+tag), disponible al terminar.
// El sha256 se calcula sobre todos los bytes emitidos, sin bufferizarlos.
export function encryptStream(input: Readable, key: Buffer): { output: PassThrough; result: Promise<EncryptResult> } {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGO, key, iv)
  const hash = createHash('sha256')
  let bytes = 0
  let ivEmitido = false

  // Antepone el IV al primer chunk de ciphertext y agrega el authTag al final.
  const framer = new Transform({
    transform(chunk, _enc, cb) {
      if (!ivEmitido) { this.push(iv); ivEmitido = true }
      cb(null, chunk)
    },
    flush(cb) {
      if (!ivEmitido) { this.push(iv); ivEmitido = true } // dump vacío (borde)
      this.push(cipher.getAuthTag())
      cb()
    },
  })
  // Cuenta bytes y acumula el sha256 sin retener nada.
  const hasher = new Transform({
    transform(chunk: Buffer, _enc, cb) { hash.update(chunk); bytes += chunk.length; cb(null, chunk) },
  })

  const output = new PassThrough()
  const result = new Promise<EncryptResult>((resolve, reject) => {
    pipeline(input, cipher, framer, hasher, output, (err) => {
      if (err) reject(err)
      else resolve({ sha256: hash.digest('hex'), bytes })
    })
  })
  return { output, result }
}

// Descifra un stream con el formato IV||ct||authTag. Retiene siempre los últimos
// 16 bytes como authTag (solo se conoce al final) antes de `final()`, que además
// verifica la integridad: si el archivo fue alterado o la clave no es la correcta,
// `final()` lanza y el stream emite 'error'.
export function decryptStream(input: Readable, key: Buffer): Transform {
  let decipher: ReturnType<typeof createDecipheriv> | null = null
  let head = Buffer.alloc(0) // acumula hasta tener el IV
  let tail = Buffer.alloc(0) // retiene los últimos TAG_BYTES

  const t = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      try {
        let data = chunk
        if (!decipher) {
          head = Buffer.concat([head, data])
          if (head.length < IV_BYTES) return cb()
          const iv = head.subarray(0, IV_BYTES)
          decipher = createDecipheriv(ALGO, key, iv)
          data = head.subarray(IV_BYTES)
          head = Buffer.alloc(0)
        }
        const buf = Buffer.concat([tail, data])
        if (buf.length > TAG_BYTES) {
          const feed = buf.subarray(0, buf.length - TAG_BYTES)
          tail = buf.subarray(buf.length - TAG_BYTES)
          const out = decipher.update(feed)
          if (out.length) this.push(out)
        } else {
          tail = buf
        }
        cb()
      } catch (e) { cb(e as Error) }
    },
    flush(cb) {
      try {
        if (!decipher || tail.length !== TAG_BYTES) return cb(new Error('Backup corrupto o incompleto: falta IV o authTag.'))
        ;(decipher as ReturnType<typeof createDecipheriv> & { setAuthTag(tag: Buffer): void }).setAuthTag(tail)
        const out = decipher.final() // lanza si el authTag no valida
        if (out.length) this.push(out)
        cb()
      } catch (e) { cb(e as Error) }
    },
  })

  input.on('error', (e) => t.destroy(e))
  input.pipe(t)
  return t
}
