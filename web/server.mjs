// Servidor estático de producción del sitio web. Sirve dist/ con fallback a
// index.html (para las rutas de campaña del client-side router) y cache por tipo.
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'dist')
const app = express()
app.disable('x-powered-by')

// ── Security headers ─────────────────────────────────────────────────────────
// Landing estático: script solo del propio origen; conexiones solo al backend
// de Cláriva (precios públicos + crear demo).
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
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

app.use(express.static(dist, {
  index: false,
  setHeaders: (res, filePath) => {
    if (/[\\/]assets[\\/]/.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    else res.setHeader('Cache-Control', 'no-cache')
  },
}))

app.get('*', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache')
  res.sendFile(path.join(dist, 'index.html'))
})

const port = process.env.PORT || 4175
app.listen(port, () => console.log(`[clariva-web] sirviendo dist/ en :${port}`))
