// Servidor estático de producción del sitio web. Sirve dist/ con fallback a
// index.html (para las rutas de campaña del client-side router) y cache por tipo.
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'dist')
const app = express()
app.disable('x-powered-by')

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
