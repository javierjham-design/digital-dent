import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'crypto'

// AES-256-GCM con una key de 32 bytes derivada de ENCRYPTION_KEY del entorno.
// Formato del ciphertext en DB: base64( iv(12) || authTag(16) || encrypted )
//
// Por qué GCM: provee integridad además de confidencialidad. Si alguien
// adultera el ciphertext en la DB, decrypt() lanza error en lugar de
// devolver basura silenciosamente.

const ALGO = 'aes-256-gcm'
const IV_LEN = 12
const TAG_LEN = 16

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw) {
    throw new Error('ENCRYPTION_KEY no está configurada en el entorno.')
  }
  // Acepta tanto base64 como hex. Si no son 32 bytes, derivamos con SHA-256
  // para tener exactamente 256 bits.
  let key: Buffer
  try {
    key = Buffer.from(raw, 'base64')
    if (key.length !== 32) {
      key = createHash('sha256').update(raw, 'utf8').digest()
    }
  } catch {
    key = createHash('sha256').update(raw, 'utf8').digest()
  }
  return key
}

export function encrypt(plain: string): string {
  const key = getKey()
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, key, iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ct]).toString('base64')
}

export function decrypt(payload: string): string {
  const key = getKey()
  const buf = Buffer.from(payload, 'base64')
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error('Payload cifrado demasiado corto.')
  }
  const iv = buf.subarray(0, IV_LEN)
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const ct = buf.subarray(IV_LEN + TAG_LEN)
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}

// Helpers nullable para no llenar el código de checks de undefined.
export function encryptNullable(plain: string | null | undefined): string | null {
  return plain ? encrypt(plain) : null
}

export function decryptNullable(payload: string | null | undefined): string | null {
  return payload ? decrypt(payload) : null
}
