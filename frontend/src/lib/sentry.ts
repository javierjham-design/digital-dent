import * as Sentry from '@sentry/react'

// Redacta patrones de PII (RUT chileno, email, monto) de un texto libre. Nombres y
// "otro documento" no se pueden regexear; se protegen no mandando cuerpos de request.
function redactPII(s: string): string {
  return s
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[email-redactado]')
    .replace(/\b(\d{1,2}\.\d{3}\.\d{3}-?[\dkK]|\d{7,8}-[\dkK])\b/gi, '[rut-redactado]')
    .replace(/\$\s?\d{1,3}(?:[.,]\d{3})+/g, '[monto-redactado]')
}

// Sentry OPCIONAL: sin VITE_SENTRY_DSN no hace nada. Esta SPA muestra datos de
// pacientes, así que la configuración es DEFENSIVA: nada de Session Replay (que
// capturaría el DOM), ni cuerpos de request, ni breadcrumbs de consola. Solo el
// error, su stack y el entorno. Nunca nombres, RUT, diagnósticos ni montos.
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined
  if (!dsn) return
  Sentry.init({
    dsn,
    environment: (import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined) ?? import.meta.env.MODE,
    // Solo errores; sin performance/tracing y SIN Session Replay (capturaría PII).
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend(event) {
      // Nunca enviar cuerpos ni query de requests (pueden traer datos de pacientes).
      if (event.request) {
        delete event.request.data
        delete event.request.query_string
        delete event.request.cookies
      }
      // Redacta RUT/email/monto de los mensajes de error por si un error de la SPA
      // los trae en su texto.
      for (const v of event.exception?.values ?? []) {
        if (v.value) v.value = redactPII(v.value)
      }
      if (typeof event.message === 'string') event.message = redactPII(event.message)
      return event
    },
    // Los breadcrumbs de consola pueden contener datos de pacientes logueados: fuera.
    // En los de red (fetch/xhr) se quita el querystring: una búsqueda `?q=<nombre>`
    // o `?rut=...` filtraría PII a Sentry. Nos quedamos solo con la ruta.
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'console') return null
      if ((breadcrumb.category === 'fetch' || breadcrumb.category === 'xhr') && breadcrumb.data?.url) {
        breadcrumb.data.url = String(breadcrumb.data.url).split('?')[0]
      }
      return breadcrumb
    },
  })
}
