// TOTP (RFC 6238) + códigos de respaldo para el 2FA del super-admin. Usa otplib para
// la parte criptográfica (no reimplementar 2FA a mano) y qrcode para el QR. El SECRETO
// se cifra/descifra en la capa que lo persiste (auth.service, con lib/crypto); acá solo
// se generan y verifican.
import { authenticator } from 'otplib'
import qrcode from 'qrcode'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'

// Tolerancia de ±1 paso (±30 s) por desfase de reloj del teléfono.
authenticator.options = { window: 1 }

const ISSUER = 'Cláriva'

export function generarSecretoTotp(): string {
  return authenticator.generateSecret() // base32
}

export function otpauthUri(email: string, secret: string): string {
  return authenticator.keyuri(email, ISSUER, secret)
}

export async function qrDataUrl(uri: string): Promise<string> {
  return qrcode.toDataURL(uri)
}

// Verifica un código de 6 dígitos contra el secreto (ignora espacios).
export function verificarTotp(codigo: string, secret: string): boolean {
  const token = (codigo ?? '').replace(/\s/g, '')
  if (!/^\d{6}$/.test(token)) return false
  try { return authenticator.verify({ token, secret }) } catch { return false }
}

// ── Códigos de respaldo (uso único) ──────────────────────────────────────────
// Se muestran al usuario en claro UNA vez; en la base solo se guardan sus hashes.
export function generarCodigosRespaldo(n = 10): string[] {
  return Array.from({ length: n }, () => {
    const raw = randomBytes(5).toString('hex').toUpperCase() // 10 chars hex
    return `${raw.slice(0, 5)}-${raw.slice(5)}`
  })
}

// Normaliza un código de respaldo para comparar (sin espacios/guiones, mayúsculas).
export function normalizarCodigoRespaldo(c: string): string {
  return (c ?? '').replace(/[\s-]/g, '').toUpperCase()
}

export async function hashCodigosRespaldo(codigos: string[]): Promise<string[]> {
  return Promise.all(codigos.map((c) => bcrypt.hash(normalizarCodigoRespaldo(c), 10)))
}
