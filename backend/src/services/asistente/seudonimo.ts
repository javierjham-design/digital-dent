// Frontera de seudonimización. Los pacientes y leads salen hacia el proveedor
// como tokens PAC_n / LEAD_n; el mapa token→id vive CIFRADO en la sesión (base
// del tenant). Ningún nombre, RUT, teléfono ni correo debe cruzar esta frontera.
//
// - haciaModelo: sobre el texto del usuario. Orden: menciones explícitas →
//   RUT/correo/teléfono (redactados a [DATO_OCULTO]) → índice de nombres de la
//   clínica (a token). Lo que no calza con un paciente y es identificador, se
//   redacta; nunca se manda en claro.
// - filas de herramientas: las columnas de identidad (id de paciente/lead) se
//   convierten en token; el resto de identificadores no se incluye (la
//   herramienta solo selecciona datos no identificatorios: edad, sexo, montos…).
// - desdeModelo: al responder y al leer historial, el token vuelve a "Nombre
//   Apellido". Si el paciente ya no existe, "[paciente eliminado]".
import { encrypt, decrypt } from '@/lib/crypto'

export type TipoEntidad = 'paciente' | 'lead'
export interface EntradaMapa { tipo: TipoEntidad; id: string }

// Columna de una fila que contiene un id de identidad a tokenizar.
export interface ColumnaIdentidad { columna: string; tipo: TipoEntidad }

const PREFIJO: Record<TipoEntidad, string> = { paciente: 'PAC', lead: 'LEAD' }
// PAC_001 / LEAD_012 …  (el token de un mismo id NO se reutiliza para otro id).
const TOKEN_RE = /\b(PAC|LEAD)_(\d{3,})\b/g

// ── Mapa por sesión ──────────────────────────────────────────────────────────

interface MapaSerializado {
  tokens: Record<string, EntradaMapa>
  contadores: { paciente: number; lead: number }
}

export class MapaSeudonimos {
  private porToken = new Map<string, EntradaMapa>()
  private porClave = new Map<string, string>() // `${tipo}:${id}` → token
  private contadores = { paciente: 0, lead: 0 }

  static cargar(mapaCifrado: string | null | undefined): MapaSeudonimos {
    const m = new MapaSeudonimos()
    if (!mapaCifrado) return m
    try {
      const s = JSON.parse(decrypt(mapaCifrado)) as MapaSerializado
      for (const [token, e] of Object.entries(s.tokens ?? {})) {
        m.porToken.set(token, e)
        m.porClave.set(`${e.tipo}:${e.id}`, token)
      }
      m.contadores = { paciente: s.contadores?.paciente ?? 0, lead: s.contadores?.lead ?? 0 }
    } catch {
      // Mapa corrupto o key rotada: se empieza uno nuevo (no se filtra nada).
    }
    return m
  }

  guardar(): string {
    const tokens: Record<string, EntradaMapa> = {}
    for (const [t, e] of this.porToken) tokens[t] = e
    return encrypt(JSON.stringify({ tokens, contadores: this.contadores } satisfies MapaSerializado))
  }

  // Devuelve el token del id (reusa si ya existe en la sesión, si no crea uno).
  token(e: EntradaMapa): string {
    const clave = `${e.tipo}:${e.id}`
    const existente = this.porClave.get(clave)
    if (existente) return existente
    this.contadores[e.tipo] += 1
    const token = `${PREFIJO[e.tipo]}_${String(this.contadores[e.tipo]).padStart(3, '0')}`
    this.porToken.set(token, e)
    this.porClave.set(clave, token)
    return token
  }

  entrada(token: string): EntradaMapa | undefined {
    return this.porToken.get(token)
  }

  // Ids conocidos por tipo (para resolver nombres al rehidratar).
  idsPorTipo(tipo: TipoEntidad): string[] {
    const out: string[] = []
    for (const e of this.porToken.values()) if (e.tipo === tipo) out.push(e.id)
    return out
  }
}

// ── Normalización y tokenización de palabras ─────────────────────────────────

const DIACRITICOS = new RegExp('[\\u0300-\\u036f]', 'g')
export function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(DIACRITICOS, '')
}

interface Palabra { norm: string; start: number; end: number }
function palabras(texto: string): Palabra[] {
  const out: Palabra[] = []
  const re = /[\p{L}\p{N}]+/gu
  let m: RegExpExecArray | null
  while ((m = re.exec(texto))) out.push({ norm: normalizar(m[0]), start: m.index, end: m.index + m[0].length })
  return out
}

// ── Hacia el modelo (texto del usuario) ──────────────────────────────────────

export interface PacienteIndice { id: string; nombre: string; apellido: string }

const MENCION_RE = /@\[[^\]]+\]\((pac|lead):([^)]+)\)/gi
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi
// RUT con puntos y guion, o solo con guion, DV dígito o K.
const RUT_RE = /\b\d{1,2}(?:\.\d{3}){2}-?[\dkK]\b|\b\d{7,8}-[\dkK]\b/gi
// Teléfono chileno: +56 9 XXXX XXXX, 9 XXXX XXXX, o corridas largas de dígitos.
const TEL_RE = /\+?56\s?9\s?\d{4}\s?\d{4}\b|\b9\s?\d{4}\s?\d{4}\b|\b\+?\d[\d\s.\-]{7,}\d\b/g

// Reemplaza el texto del usuario por tokens/redacciones antes de mandarlo al
// modelo. `indice` = pacientes de la clínica (id, nombre, apellido), cargado una
// vez por turno. Idempotente respecto de tokens ya presentes (no los toca).
export function haciaModelo(texto: string, indice: PacienteIndice[], mapa: MapaSeudonimos): string {
  // 1) Menciones explícitas de la UI: @[Nombre](pac:<id>) → token.
  let t = texto.replace(MENCION_RE, (_all, tipoRaw: string, id: string) => {
    const tipo: TipoEntidad = tipoRaw.toLowerCase() === 'lead' ? 'lead' : 'paciente'
    return mapa.token({ tipo, id: id.trim() })
  })
  // 2) Identificadores directos → [DATO_OCULTO] (nunca en claro al proveedor).
  t = t.replace(EMAIL_RE, '[DATO_OCULTO]')
  t = t.replace(RUT_RE, '[DATO_OCULTO]')
  t = t.replace(TEL_RE, '[DATO_OCULTO]')
  // 3) Índice de nombres: "nombre apellido" y "apellido nombre", sin tildes ni
  //    mayúsculas, mínimo dos palabras. Coincidencia más larga primero.
  t = tokenizarNombres(t, indice, mapa)
  return t
}

function tokenizarNombres(texto: string, indice: PacienteIndice[], mapa: MapaSeudonimos): string {
  if (indice.length === 0) return texto
  const nombreMap = new Map<string, EntradaMapa>()
  let maxLen = 2
  for (const p of indice) {
    const nom = normalizar(`${p.nombre} ${p.apellido}`).split(/\s+/).filter(Boolean)
    const ape = normalizar(`${p.apellido} ${p.nombre}`).split(/\s+/).filter(Boolean)
    for (const seq of [nom, ape]) {
      if (seq.length < 2) continue
      const key = seq.join(' ')
      if (!nombreMap.has(key)) nombreMap.set(key, { tipo: 'paciente', id: p.id })
      if (seq.length > maxLen) maxLen = seq.length
    }
  }
  const ws = palabras(texto)
  const repl: Array<{ start: number; end: number; token: string }> = []
  let i = 0
  while (i < ws.length) {
    let matched = false
    for (let len = Math.min(maxLen, ws.length - i); len >= 2; len--) {
      const key = ws.slice(i, i + len).map((w) => w.norm).join(' ')
      const e = nombreMap.get(key)
      if (e) {
        repl.push({ start: ws[i].start, end: ws[i + len - 1].end, token: mapa.token(e) })
        i += len
        matched = true
        break
      }
    }
    if (!matched) i += 1
  }
  let out = texto
  for (const r of repl.sort((a, b) => b.start - a.start)) out = out.slice(0, r.start) + r.token + out.slice(r.end)
  return out
}

// ── Filas de herramientas ────────────────────────────────────────────────────

export type Fila = Record<string, unknown>

// Convierte las columnas de identidad (id) en tokens. NO toca otras columnas: la
// herramienta es responsable de no seleccionar identificadores en claro.
export function seudonimizarFilas(filas: Fila[], identidad: ColumnaIdentidad[], mapa: MapaSeudonimos): Fila[] {
  if (identidad.length === 0) return filas
  return filas.map((fila) => {
    const out: Fila = { ...fila }
    for (const { columna, tipo } of identidad) {
      const id = out[columna]
      if (typeof id === 'string' && id) out[columna] = mapa.token({ tipo, id })
      else if (id == null) out[columna] = null
      else out[columna] = String(id)
    }
    return out
  })
}

// ── Desde el modelo (rehidratación) ──────────────────────────────────────────

export type ResolverNombre = (e: EntradaMapa) => string | null

// Reemplaza tokens PAC_n/LEAD_n por "Nombre Apellido". Si el resolver devuelve
// null (entidad borrada), muestra "[paciente eliminado]" / "[lead eliminado]".
export function desdeModelo(texto: string, mapa: MapaSeudonimos, resolver: ResolverNombre): string {
  return texto.replace(TOKEN_RE, (all) => {
    const e = mapa.entrada(all)
    if (!e) return all
    const nombre = resolver(e)
    if (nombre) return nombre
    return e.tipo === 'lead' ? '[lead eliminado]' : '[paciente eliminado]'
  })
}

// Rehidrata las columnas de identidad de un resultado guardado (para la UI/Excel).
export function rehidratarFilas(filas: Fila[], identidad: ColumnaIdentidad[], mapa: MapaSeudonimos, resolver: ResolverNombre): Fila[] {
  if (identidad.length === 0) return filas
  const columnas = new Set(identidad.map((c) => c.columna))
  return filas.map((fila) => {
    const out: Fila = { ...fila }
    for (const col of columnas) {
      const token = out[col]
      if (typeof token === 'string') {
        const e = mapa.entrada(token)
        out[col] = e ? (resolver(e) ?? (e.tipo === 'lead' ? '[lead eliminado]' : '[paciente eliminado]')) : token
      }
    }
    return out
  })
}
