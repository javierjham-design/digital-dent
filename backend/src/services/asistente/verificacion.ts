// Verificación de cifras: cada número "formateado" del texto del asistente
// ($1.234.567, 1.234, 12,5%) debe existir en alguna celda, agregado o totalFilas
// de los resultados del turno. Los que no, se devuelven en cifrasNoVerificadas y
// se envuelven con un marcador que la UI atenúa. No se corrige el texto; se marca.
import type { ResultadoEjecutado } from './tipos'

export const MARCA_ABRE = '⟦nv⟧'
export const MARCA_CIERRA = '⟦/nv⟧'

// Números con formato chileno: monto con $, miles con puntos, o porcentaje con coma.
// Se ignoran enteros "pelados" (años, conteos sueltos) para no marcar de más.
const CIFRA_RE = /\$\s?\d{1,3}(?:\.\d{3})*(?:,\d+)?|\b\d{1,3}(?:\.\d{3})+(?:,\d+)?\b|\b\d+(?:,\d+)?%/g

// "$1.234.567" → 1234567 ; "12,5%" → 12.5 ; "1.234" → 1234
function parseCifra(s: string): number {
  const limpio = s.replace(/[$%\s]/g, '').replace(/\./g, '').replace(',', '.')
  return Number(limpio)
}

const MAX_BASE = 60 // tope de cifras base para no explotar el O(n²) de las comparaciones

function numerosConocidos(resultados: ResultadoEjecutado[]): Set<number> {
  const base = new Set<number>()
  const add = (v: unknown) => {
    const n = typeof v === 'number' ? v : NaN
    if (Number.isFinite(n)) { base.add(n); base.add(Math.round(n)) }
  }
  for (const r of resultados) {
    add(r.totalFilas)
    if (r.resumen) for (const v of Object.values(r.resumen)) { add(v); if (typeof v === 'string') add(Number(v)) }
    for (const fila of r.filas) for (const v of Object.values(fila)) add(v)
  }
  // Comparaciones: diferencias y porcentajes entre pares de cifras del turno
  // (para "este período vs el anterior"). Acotado a MAX_BASE para no explotar.
  const set = new Set(base)
  const vals = [...base].slice(0, MAX_BASE)
  for (const a of vals) {
    for (const b of vals) {
      if (a === b) continue
      set.add(a - b)
      set.add(Math.round(a - b))
      if (b !== 0) {
        set.add(Math.round((a / b) * 100)) // a es % de b
        set.add(Math.round(((a - b) / b) * 100)) // variación %
      }
    }
  }
  return set
}

export interface VerificacionCifras { texto: string; cifrasNoVerificadas: string[] }

export function verificarCifras(texto: string, resultados: ResultadoEjecutado[]): VerificacionCifras {
  const conocidos = numerosConocidos(resultados)
  const noVerificadas: string[] = []
  const salida = texto.replace(CIFRA_RE, (match) => {
    const v = parseCifra(match)
    const ok = Number.isFinite(v) && (conocidos.has(v) || conocidos.has(Math.round(v)))
    if (ok) return match
    noVerificadas.push(match)
    return `${MARCA_ABRE}${match}${MARCA_CIERRA}`
  })
  return { texto: salida, cifrasNoVerificadas: noVerificadas }
}
