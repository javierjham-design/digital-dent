import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '@/App'
import { initSentry } from '@/lib/sentry'
import '@/styles/index.css'

initSentry() // Observabilidad: captura errores no manejados (no-op sin VITE_SENTRY_DSN).

// La PWA del monolito (activa jun-2026) registraba un service worker que puede seguir
// sirviendo la app vieja desde caché en quien la instaló. La SPA actual no usa SW:
// se desregistra cualquiera que quede, una vez por carga. Best-effort.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => { void r.unregister() })).catch(() => {})
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
