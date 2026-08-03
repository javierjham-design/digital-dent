import * as Sentry from '@sentry/node'
import { env } from '@/config/env'
import { getRequestContext } from '@/lib/request-context'

// Sentry es OPCIONAL: sin SENTRY_DSN, initSentry() no hace nada y captureError()
// es un no-op. La app funciona idéntico con o sin Sentry configurado.
let enabled = false

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN?.trim()
  if (!dsn) return
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT?.trim() || env.nodeEnv,
    // Solo reporte de errores; no APM/tracing (evita ruido y coste).
    tracesSampleRate: 0,
    // Nunca adjuntar PII por defecto (IP, cookies, headers de auth).
    sendDefaultPii: false,
    // Manejamos nosotros los errores de proceso (ver installProcessHandlers en
    // index.ts) para controlar el logging y el exit; desactivamos los de Sentry
    // para no capturar dos veces.
    integrations: (defaults) =>
      defaults.filter((i) => i.name !== 'OnUncaughtException' && i.name !== 'OnUnhandledRejection'),
    // Defensa en profundidad: aunque capturamos manualmente (sin adjuntar el
    // request), si algún evento trajera datos de la request, se limpian aquí.
    // NUNCA deben salir datos de pacientes (nombres, RUT, diagnósticos, montos).
    beforeSend(event) {
      if (event.request) {
        delete event.request.data
        delete event.request.cookies
        delete event.request.query_string
        if (event.request.headers) {
          delete event.request.headers['authorization']
          delete event.request.headers['cookie']
        }
      }
      return event
    },
  })
  enabled = true
}

export function sentryEnabled(): boolean {
  return enabled
}

// Reporta un error a Sentry etiquetado con la clínica (slug), el usuario y el
// request-id que vienen del contexto de la request. NO envía datos de pacientes:
// solo el error y estos tags de routing/diagnóstico.
export function captureError(err: unknown, extra?: { route?: string }): void {
  if (!enabled) return
  const ctx = getRequestContext()
  Sentry.withScope((scope) => {
    if (ctx?.slug) scope.setTag('clinica', ctx.slug)
    if (ctx?.userId) scope.setTag('user_id', ctx.userId)
    if (ctx?.requestId) scope.setTag('request_id', ctx.requestId)
    if (extra?.route) scope.setTag('route', extra.route)
    Sentry.captureException(err)
  })
}

// Espera a que Sentry vacíe su cola (antes de salir en uncaughtException).
export function flushSentry(timeoutMs = 2000): Promise<boolean> {
  if (!enabled) return Promise.resolve(true)
  return Sentry.flush(timeoutMs)
}
