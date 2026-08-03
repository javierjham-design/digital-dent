import { timingSafeEqual } from 'node:crypto'
import { env } from '@/config/env'

// Compara el secreto de cron en TIEMPO CONSTANTE (evita distinguir por timing).
// Devuelve false si no está configurado o no coincide. Preferir esto a `=== `.
export function cronSecretValido(header: unknown): boolean {
  const provisto = typeof header === 'string' ? header : ''
  const esperado = env.cronSecret
  if (!esperado || !provisto) return false
  const a = Buffer.from(provisto)
  const b = Buffer.from(esperado)
  return a.length === b.length && timingSafeEqual(a, b)
}
