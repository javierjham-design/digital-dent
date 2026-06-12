// ─────────────────────────────────────────────────────────────────────────────
//  Rate limiting en memoria (ventana deslizante)
// ─────────────────────────────────────────────────────────────────────────────
//
//  Sin dependencias ni servicios externos. Funciona en Node y en Edge runtime.
//
//  Limitación conocida: el estado vive en la memoria del proceso. Con UNA
//  instancia en Railway (la configuración actual) es efectivo. Si algún día
//  se escala a múltiples réplicas, migrar a Redis/Upstash — los contadores
//  serían por-réplica y el límite real se multiplicaría por N.
//
//  Uso:
//    const r = rateLimit(`login:${ip}:${user}`, { limit: 5, windowMs: 15 * 60_000 })
//    if (!r.ok) -> rechazar (r.retryAfterSec para el header Retry-After)

interface Bucket {
  hits: number[]   // timestamps (ms) de los intentos dentro de la ventana
}

const buckets = new Map<string, Bucket>()

// Limpieza perezosa: cada cierto número de llamadas barremos claves viejas
// para que el Map no crezca sin límite.
let callsSinceSweep = 0
const SWEEP_EVERY = 500
const MAX_WINDOW_MS = 60 * 60 * 1000 // nada vive más de 1 hora

function sweep(now: number) {
  for (const [key, b] of buckets) {
    if (b.hits.length === 0 || now - b.hits[b.hits.length - 1] > MAX_WINDOW_MS) {
      buckets.delete(key)
    }
  }
}

export interface RateLimitResult {
  ok: boolean
  remaining: number
  retryAfterSec: number
}

export function rateLimit(key: string, opts: { limit: number; windowMs: number }): RateLimitResult {
  const now = Date.now()

  if (++callsSinceSweep >= SWEEP_EVERY) {
    callsSinceSweep = 0
    sweep(now)
  }

  let b = buckets.get(key)
  if (!b) {
    b = { hits: [] }
    buckets.set(key, b)
  }

  // Descartar hits fuera de la ventana.
  const cutoff = now - opts.windowMs
  b.hits = b.hits.filter((t) => t > cutoff)

  if (b.hits.length >= opts.limit) {
    const oldest = b.hits[0]
    const retryAfterSec = Math.max(1, Math.ceil((oldest + opts.windowMs - now) / 1000))
    return { ok: false, remaining: 0, retryAfterSec }
  }

  b.hits.push(now)
  return { ok: true, remaining: opts.limit - b.hits.length, retryAfterSec: 0 }
}

/**
 * Registra un intento fallido SIN consumir cupo en el chequeo (para usar el
 * patrón "solo penalizar fallos": chequear con peek, registrar con esto).
 */
export function registerFailure(key: string) {
  let b = buckets.get(key)
  if (!b) {
    b = { hits: [] }
    buckets.set(key, b)
  }
  b.hits.push(Date.now())
}

/** Chequea sin consumir cupo. */
export function peekLimit(key: string, opts: { limit: number; windowMs: number }): RateLimitResult {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b) return { ok: true, remaining: opts.limit, retryAfterSec: 0 }
  const cutoff = now - opts.windowMs
  const valid = b.hits.filter((t) => t > cutoff)
  if (valid.length >= opts.limit) {
    const retryAfterSec = Math.max(1, Math.ceil((valid[0] + opts.windowMs - now) / 1000))
    return { ok: false, remaining: 0, retryAfterSec }
  }
  return { ok: true, remaining: opts.limit - valid.length, retryAfterSec: 0 }
}

/** Resetea la clave (ej: login exitoso limpia los fallos previos). */
export function resetLimit(key: string) {
  buckets.delete(key)
}
