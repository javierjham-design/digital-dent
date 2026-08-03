import * as Sentry from '@sentry/react'

// Sentry OPCIONAL: sin VITE_SENTRY_DSN no hace nada. El sitio de marketing no
// maneja datos de pacientes, pero se aplica la MISMA regla defensiva que la app:
// nada de Session Replay, ni cuerpos de request, ni breadcrumbs de consola.
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined
  if (!dsn) return
  Sentry.init({
    dsn,
    environment: (import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined) ?? import.meta.env.MODE,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request) {
        delete event.request.data
        delete event.request.query_string
        delete event.request.cookies
      }
      return event
    },
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'console') return null
      return breadcrumb
    },
  })
}
