// Servidor estático de producción para la SPA. Sirve dist/ con fallback a
// index.html (rutas del client-side router) y cache adecuada por tipo de
// archivo. Railway ejecuta `npm start` → este server, escuchando en $PORT.
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'dist')
const app = express()

app.disable('x-powered-by')

// ── Security headers ─────────────────────────────────────────────────────────
// CSP estricta para una SPA Vite: script solo del propio origen (+wasm para
// pdf.js); estilos inline permitidos (Tailwind / estilos en línea de React);
// imágenes y workers para las vistas de PDF; conexiones solo al backend de Cláriva.
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "worker-src 'self' blob:",
  "connect-src 'self' https://api.clariva.cl https://*.up.railway.app",
].join('; ')

app.use((_req, res, next) => {
  res.setHeader('Content-Security-Policy', CSP)
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()')
  next()
})

// Assets con hash en el nombre → cache inmutable de 1 año. El resto, sin cache.
app.use(express.static(dist, {
  index: false,
  setHeaders: (res, filePath) => {
    if (/[\\/]assets[\\/]/.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    else res.setHeader('Cache-Control', 'no-cache')
  },
}))

// Fallback SPA: cualquier ruta que no sea un archivo → index.html.
app.get('*', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache')
  res.sendFile(path.join(dist, 'index.html'))
})

const port = process.env.PORT || 4173
app.listen(port, () => console.log(`[clariva-frontend] sirviendo dist/ en :${port}`))
