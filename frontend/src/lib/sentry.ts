import * as Sentry from '@sentry/react'

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
      return event
    },
    // Los breadcrumbs de consola pueden contener datos de pacientes logueados: fuera.
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'console') return null
      return breadcrumb
    },
  })
}
