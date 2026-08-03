import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '@/App'
import { initSentry } from '@/lib/sentry'
import '@/styles/index.css'

initSentry() // Observabilidad: captura errores no manejados (no-op sin VITE_SENTRY_DSN).

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
