import { isProd } from '@/config/env'
import { getRequestContext } from '@/lib/request-context'

// Logger mínimo: JSON de una línea en producción (parseable por Railway/Sentry) y
// texto legible en desarrollo. No usamos pino ni nada pesado. Cada log lleva
// automáticamente el request-id y el slug de la clínica del contexto de la request.
type Level = 'debug' | 'info' | 'warn' | 'error'
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }

const configured = (process.env.LOG_LEVEL ?? '').toLowerCase() as Level
const threshold = ORDER[configured] ?? ORDER.info

type Meta = Record<string, unknown>

// Serializa un error para loguearlo sin romper (el stack solo en dev, para no
// llenar los logs de producción; en prod el stack completo va a Sentry).
export function serializeError(e: unknown): Meta {
  if (e instanceof Error) return { name: e.name, message: e.message, ...(isProd ? {} : { stack: e.stack }) }
  return { message: String(e) }
}

function emit(level: Level, msg: string, meta?: Meta): void {
  if (ORDER[level] < threshold) return
  const ctx = getRequestContext()
  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log

  if (isProd) {
    sink(JSON.stringify({
      ts: new Date().toISOString(),
      level,
      msg,
      ...(ctx?.requestId ? { requestId: ctx.requestId } : {}),
      ...(ctx?.slug ? { clinica: ctx.slug } : {}),
      ...(ctx?.userId ? { userId: ctx.userId } : {}),
      ...(meta ?? {}),
    }))
    return
  }

  // Dev: una línea legible. requestId acortado; clínica entre corchetes.
  const rid = ctx?.requestId ? ` #${ctx.requestId.slice(0, 8)}` : ''
  const cli = ctx?.slug ? ` [${ctx.slug}]` : ''
  const extra = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ''
  sink(`${level.toUpperCase().padEnd(5)}${cli}${rid} ${msg}${extra}`)
}

export const log = {
  debug: (msg: string, meta?: Meta) => emit('debug', msg, meta),
  info: (msg: string, meta?: Meta) => emit('info', msg, meta),
  warn: (msg: string, meta?: Meta) => emit('warn', msg, meta),
  error: (msg: string, meta?: Meta) => emit('error', msg, meta),
}
