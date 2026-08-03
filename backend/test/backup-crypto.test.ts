import { describe, it, expect } from 'vitest'
import { Readable } from 'node:stream'
import { createHash, randomBytes } from 'node:crypto'
import { encryptStream, decryptStream, loadBackupKey, generateBackupKeyB64 } from '@/lib/backup/crypto-stream'

async function collect(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const c of stream) chunks.push(c as Buffer)
  return Buffer.concat(chunks)
}

// Simula pg_dump emitiendo en chunks irregulares (no un solo buffer).
function chunked(buf: Buffer, chunkSize: number): Readable {
  let i = 0
  return new Readable({
    read() {
      if (i >= buf.length) return this.push(null)
      const end = Math.min(i + chunkSize, buf.length)
      this.push(buf.subarray(i, end))
      i = end
    },
  })
}

describe('backup crypto-stream (AES-256-GCM)', () => {
  it('round-trip de un buffer grande (~5 MB) devuelve el original idéntico', async () => {
    const key = randomBytes(32)
    const plain = randomBytes(5 * 1024 * 1024 + 12345) // tamaño no alineado a bloque

    const { output, result } = encryptStream(chunked(plain, 64 * 1024), key)
    const enc = await collect(output)
    const { sha256, bytes } = await result

    // El sha256 y bytes del resultado describen el archivo cifrado FINAL.
    expect(bytes).toBe(enc.length)
    expect(createHash('sha256').update(enc).digest('hex')).toBe(sha256)
    // Estructura: IV(12) + ciphertext(len plano) + authTag(16).
    expect(enc.length).toBe(12 + plain.length + 16)

    const dec = await collect(decryptStream(chunked(enc, 40_000), key))
    expect(dec.length).toBe(plain.length)
    expect(dec.equals(plain)).toBe(true)
  })

  it('round-trip de un buffer chico y de uno vacío', async () => {
    const key = randomBytes(32)
    for (const plain of [Buffer.from('hola clínica'), Buffer.alloc(0)]) {
      const { output } = encryptStream(Readable.from(plain), key)
      const enc = await collect(output)
      const dec = await collect(decryptStream(Readable.from(enc), key))
      expect(dec.equals(plain)).toBe(true)
    }
  })

  it('falla al descifrar con la clave equivocada (authTag no valida)', async () => {
    const key = randomBytes(32)
    const otra = randomBytes(32)
    const { output } = encryptStream(Readable.from(randomBytes(100_000)), key)
    const enc = await collect(output)
    await expect(collect(decryptStream(Readable.from(enc), otra))).rejects.toThrow()
  })

  it('falla al descifrar un archivo alterado (un byte cambiado)', async () => {
    const key = randomBytes(32)
    const { output } = encryptStream(Readable.from(randomBytes(100_000)), key)
    const enc = await collect(output)
    enc[Math.floor(enc.length / 2)] ^= 0xff // corromper el ciphertext
    await expect(collect(decryptStream(Readable.from(enc), key))).rejects.toThrow()
  })

  it('loadBackupKey valida largo y base64; generateBackupKeyB64 produce 32 bytes', () => {
    const original = process.env.BACKUP_ENCRYPTION_KEY
    try {
      delete process.env.BACKUP_ENCRYPTION_KEY
      expect(() => loadBackupKey()).toThrow(/Falta BACKUP_ENCRYPTION_KEY/)

      process.env.BACKUP_ENCRYPTION_KEY = Buffer.alloc(16).toString('base64') // 16 bytes → inválida
      expect(() => loadBackupKey()).toThrow(/32 bytes/)

      const good = generateBackupKeyB64()
      expect(Buffer.from(good, 'base64').length).toBe(32)
      process.env.BACKUP_ENCRYPTION_KEY = good
      expect(loadBackupKey().length).toBe(32)
    } finally {
      if (original === undefined) delete process.env.BACKUP_ENCRYPTION_KEY
      else process.env.BACKUP_ENCRYPTION_KEY = original
    }
  })
})
