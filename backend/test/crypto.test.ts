import { describe, it, expect, beforeAll } from 'vitest'

// La key debe existir ANTES de importar el módulo (lo lee on-demand igual,
// pero lo fijamos por claridad). AES-256-GCM con integridad.
beforeAll(() => { process.env.ENCRYPTION_KEY = 'test-encryption-key-para-vitest-1234567890' })

const mod = () => import('@/lib/crypto')

describe('crypto AES-256-GCM', () => {
  it('roundtrip: decrypt(encrypt(x)) === x', async () => {
    const { encrypt, decrypt } = await mod()
    const secreto = 'AC' + 'a'.repeat(32) // shape de un Twilio token
    expect(decrypt(encrypt(secreto))).toBe(secreto)
  })

  it('dos cifrados del mismo texto difieren (IV aleatorio)', async () => {
    const { encrypt } = await mod()
    expect(encrypt('hola')).not.toBe(encrypt('hola'))
  })

  it('detecta adulteración del ciphertext (authTag GCM)', async () => {
    const { encrypt, decrypt } = await mod()
    const payload = encrypt('dato sensible')
    const buf = Buffer.from(payload, 'base64')
    buf[buf.length - 1] ^= 0xff // corromper último byte
    expect(() => decrypt(buf.toString('base64'))).toThrow()
  })

  it('payload demasiado corto lanza error', async () => {
    const { decrypt } = await mod()
    expect(() => decrypt(Buffer.from('x').toString('base64'))).toThrow()
  })

  it('helpers nullable', async () => {
    const { encryptNullable, decryptNullable } = await mod()
    expect(encryptNullable(null)).toBeNull()
    expect(encryptNullable('')).toBeNull()
    expect(decryptNullable(null)).toBeNull()
    expect(decryptNullable(encryptNullable('hola'))).toBe('hola')
  })

  it('maneja unicode', async () => {
    const { encrypt, decrypt } = await mod()
    const s = 'ñandú 🦷 +56 9 1234 5678 — Temuco'
    expect(decrypt(encrypt(s))).toBe(s)
  })
})
