import * as Sentry from '@sentry/node'
import { env } from '@/config/env'
import { getRequestContext } from '@/lib/request-context'

// Sentry es OPCIONAL: sin SENTRY_DSN, initSentry() no hace nada y captureError()
// es un no-op. La app funciona idéntico con o sin Sentry configurado.
let enabled = false

// Redacta PATRONES de PII de un texto libre (mensaje de error, breadcrumb): RUT
// chileno, email y montos en pesos. NO detecta nombres ni "otro documento"
// (pasaporte/DNI extranjero): esos formatos son texto libre y no se pueden regexear
// sin sobre-redactar. Se protegen ESTRUCTURALMENTE: no se manda el cuerpo del
// request (donde viven), y el mensaje de los errores Prisma se redacta ENTERO (con
// el objeto `data` completo, nombre y otroDoc incluidos).
export function redactPII(s: string): string {
  return s
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[email-redactado]')
    // RUT con puntos (12.345.678-9) o con guión (12345678-9), DV dígito o K.
    .replace(/\b(\d{1,2}\.\d{3}\.\d{3}-?[\dkK]|\d{7,8}-[\dkK])\b/gi, '[rut-redactado]')
    // Monto en pesos: $1.234.567 / $ 1,234,567.
    .replace(/\$\s?\d{1,3}(?:[.,]\d{3})+/g, '[monto-redactado]')
}

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
      // Los errores de Prisma reproducen en su mensaje los ARGUMENTOS de la query
      // (el PrismaClientValidationError es el peor: vuelca el objeto `data` con
      // nombres/RUT/montos). Se redacta el mensaje ENTERO conservando el tipo para
      // agrupar. El resto de los mensajes se pasan por el scrubber de patrones.
      for (const v of event.exception?.values ?? []) {
        if (v.type?.startsWith('PrismaClient')) {
          v.value = `[${v.type}] mensaje omitido para no filtrar datos de pacientes`
        } else if (v.value) {
          v.value = redactPII(v.value)
        }
      }
      if (typeof event.message === 'string') event.message = redactPII(event.message)
      for (const b of event.breadcrumbs ?? []) {
        if (typeof b.message === 'string') b.message = redactPII(b.message)
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
