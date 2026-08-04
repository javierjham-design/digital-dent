import * as Sentry from '@sentry/react'

// Redacta patrones de PII (RUT, email, monto) de un texto libre. Ver observability.ts.
function redactPII(s: string): string {
  return s
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[email-redactado]')
    .replace(/\b(\d{1,2}\.\d{3}\.\d{3}-?[\dkK]|\d{7,8}-[\dkK])\b/gi, '[rut-redactado]')
    .replace(/\$\s?\d{1,3}(?:[.,]\d{3})+/g, '[monto-redactado]')
}

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
      for (const v of event.exception?.values ?? []) {
        if (v.value) v.value = redactPII(v.value)
      }
      if (typeof event.message === 'string') event.message = redactPII(event.message)
      return event
    },
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'console') return null
      // fetch/xhr: quitar el querystring (una búsqueda podría llevar PII en ?q=).
      if ((breadcrumb.category === 'fetch' || breadcrumb.category === 'xhr') && breadcrumb.data?.url) {
        breadcrumb.data.url = String(breadcrumb.data.url).split('?')[0]
      }
      return breadcrumb
    },
  })
}
