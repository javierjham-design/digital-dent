import fs from 'node:fs'
import path from 'node:path'

const base = 'C:/Users/Javier/Desktop/PROYECTOS VS Studio/Auto Trading/dental-platform'
const dir = `${base}/docs/consentimientos/extraido`
const outTs = `${base}/backend/src/data/consentimientos-default.ts`

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function toHtml(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim())
  const out = []
  let inList = false
  let titleDone = false
  const closeList = () => { if (inList) { out.push('</ul>'); inList = false } }
  for (const l of lines) {
    if (!l) { closeList(); continue }
    const safe = esc(l)
    if (!titleDone) { out.push(`<h1>${safe}</h1>`); titleDone = true; continue }
    if (/^•/.test(l)) { if (!inList) { out.push('<ul>'); inList = true } out.push(`<li>${esc(l.replace(/^•\s*/, ''))}</li>`); continue }
    closeList()
    if (/^\d+\.\s/.test(l)) { out.push(`<h3>${safe}</h3>`); continue }
    if (/^\[\s?\]/.test(l)) { out.push(`<p class="chk">☐ ${esc(l.replace(/^\[\s?\]\s*/, ''))}</p>`); continue }
    out.push(`<p>${safe}</p>`)
  }
  closeList()
  return out.join('\n')
}

const codigoMap = { '13': 'DD-CI-13', '14': 'DD-CI-14', '15': 'DD-ACT-15' }
const files = fs.readdirSync(dir).filter((f) => /^\d\d_.*\.txt$/.test(f) && !f.startsWith('00_')).sort()

const arr = files.map((f) => {
  const n = f.slice(0, 2)
  const text = fs.readFileSync(path.join(dir, f), 'utf8')
  const titulo = (text.split(/\r?\n/).map((s) => s.trim()).find(Boolean) || f).replace(/\s+/g, ' ')
  const codigo = codigoMap[n] || `DD-CI-${n}`
  return { codigo, titulo, orden: Number(n), html: toHtml(text), camposRequeridos: ['nombre', 'rut', 'fechaNacimiento'] }
})

fs.mkdirSync(path.dirname(outTs), { recursive: true })
fs.writeFileSync(outTs, `// AUTOGENERADO desde docs/consentimientos (script _toTemplates.mjs). No editar a mano.\n// Plantillas base de consentimientos informados (Chile, Ley 20.584) — sirven para toda LatAm.\nexport const CONSENTIMIENTOS_DEFAULT = ${JSON.stringify(arr, null, 2)}\n`)
console.log('Plantillas generadas:', arr.length)
for (const a of arr) console.log(' ', a.orden, a.codigo, '·', a.titulo.slice(0, 62))
