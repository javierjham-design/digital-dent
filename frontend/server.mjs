// Servidor estático de producción para la SPA. Sirve dist/ con fallback a
// index.html (rutas del client-side router) y cache adecuada por tipo de
// archivo. Railway ejecuta `npm start` → este server, escuchando en $PORT.
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'dist')
const app = express()

app.disable('x-powered-by')

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
