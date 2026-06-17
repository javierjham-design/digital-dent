// Verificación de contrato FRONTEND ↔ BACKEND (Etapa 4-4).
// Extrae cada endpoint que invocan los service clients del frontend y comprueba
// que exista una ruta equivalente (método + path) en el router del backend.
// Detecta drift sin necesidad de levantar nada. No toca la red ni la DB.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { globSync } from 'node:fs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Reduce un path a su forma canónica: parámetros → :x, sin query, sin trailing.
function canon(p) {
  // 1. reemplazar ${...} balanceado por :x (maneja anidación de plantillas)
  let out = ''
  for (let i = 0; i < p.length; i++) {
    if (p[i] === '$' && p[i + 1] === '{') {
      let depth = 0, j = i + 1
      for (; j < p.length; j++) {
        if (p[j] === '{') depth++
        else if (p[j] === '}') { depth--; if (depth === 0) { j++; break } }
      }
      out += ':x'; i = j - 1
    } else out += p[i]
  }
  // 2. un ':x' pegado a un char de palabra (sin '/' antes) es un query/concat
  //    opcional, no un segmento → quitarlo.  '/citas:x' → '/citas'
  out = out.replace(/(\w):x/g, '$1')
  // 3. cortar query, normalizar params express, quitar trailing slash
  out = out.split('?')[0].replace(/:[A-Za-z_]+/g, ':x').replace(/\/$/, '')
  return out
}

// ── Backend: parsear apiRouter.METHOD('path', ...) ──
const beSrc = fs.readFileSync(path.join(root, 'backend/src/routes/index.ts'), 'utf8')
const beRoutes = new Set()
for (const m of beSrc.matchAll(/apiRouter\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)) {
  beRoutes.add(`${m[1].toUpperCase()} ${canon(m[2])}`)
}

// ── Frontend: parsear api.METHOD<...>(`path` | 'path', ...) ──
const FE_METHODS = { get: 'GET', post: 'POST', put: 'PUT', patch: 'PATCH', del: 'DELETE' }
const feFiles = globSync('frontend/src/services/*.ts', { cwd: root }).map((f) => path.join(root, f))
const feCalls = [] // { method, path, file }
for (const file of feFiles) {
  const src = fs.readFileSync(file, 'utf8')
  for (const m of src.matchAll(/api\.(get|post|put|patch|del)\s*(?:<[^>]*>)?\s*\(\s*([`'"])([^`'"]*)\2?/g)) {
    feCalls.push({ method: FE_METHODS[m[1]], path: canon(m[3]), file: path.basename(file) })
  }
}

// reportes.service usa fetch directo (blob), no api.* → añadir sus rutas conocidas
const reportes = ['pacientes', 'citas', 'cobros', 'tratamientos', 'liquidaciones', 'caja', 'morosos']
for (const r of reportes) feCalls.push({ method: 'GET', path: `/reportes/${r}`, file: 'reportes.service.ts' })

// ── Diff ──
const missing = []
for (const c of feCalls) {
  if (!beRoutes.has(`${c.method} ${c.path}`)) missing.push(c)
}

console.log(`Backend: ${beRoutes.size} rutas · Frontend: ${feCalls.length} llamadas`)
if (missing.length === 0) {
  console.log('✓ Contrato OK: toda llamada del frontend tiene ruta en el backend.')
  process.exit(0)
}
console.error(`\n✗ ${missing.length} llamada(s) del frontend SIN ruta en el backend:`)
for (const c of missing) console.error(`  - [${c.file}] ${c.method} ${c.path}`)
process.exit(1)
