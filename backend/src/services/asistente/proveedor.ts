// Frontera con el proveedor del modelo. NADA fuera de este archivo importa el
// SDK de Anthropic: el resto del asistente habla con la interfaz `ProveedorModelo`
// y tipos propios, para poder cambiar de proveedor (p.ej. a OpenAI) sin rediseñar.
import Anthropic from '@anthropic-ai/sdk'
import { env } from '@/config/env'

// ── Tipos agnósticos del proveedor ───────────────────────────────────────────

// Bloques que el orquestador ENVÍA al modelo dentro de un mensaje.
export type BloqueEntrada =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'tool_use'; id: string; nombre: string; input: unknown }
  | { tipo: 'tool_result'; toolUseId: string; contenido: string; esError?: boolean }

export interface MensajeModelo {
  rol: 'user' | 'assistant'
  contenido: BloqueEntrada[]
}

// Definición de herramienta que ve el modelo (input_schema = JSON Schema de zod).
export interface HerramientaModelo {
  nombre: string
  descripcion: string
  inputSchema: Record<string, unknown>
}

export interface SolicitudModelo {
  sistema: string
  mensajes: MensajeModelo[]
  herramientas: HerramientaModelo[]
  maxTokens: number
}

// Bloques que el modelo DEVUELVE.
export type BloqueSalida =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'tool_use'; id: string; nombre: string; input: unknown }

export interface UsoTokens {
  entrada: number // tokens de entrada NO cacheados (a precio completo)
  salida: number
  cacheLeidos: number
  cacheEscritos: number
}

export interface RespuestaModelo {
  bloques: BloqueSalida[]
  stopReason: string | null
  uso: UsoTokens
}

export interface ProveedorModelo {
  readonly modelo: string
  generar(req: SolicitudModelo): Promise<RespuestaModelo>
}

// ── Tabla de precios (USD por millón de tokens) y cálculo de costo ────────────

export interface PrecioModelo { entrada: number; salida: number; cacheLeida: number; cacheEscrita: number }

// Precios reales al 2026-09. Las claves 'claude-sonnet-5'/'claude-opus-5' son las
// del diseño original: quedan por si esos IDs existen y se setean por env, para
// que el costo se calcule sin tocar código. Sobrescribible con ASISTENTE_PRECIOS_JSON.
const PRECIOS_DEFAULT: Record<string, PrecioModelo> = {
  'claude-sonnet-4-6': { entrada: 3, salida: 15, cacheLeida: 0.30, cacheEscrita: 3.75 },
  'claude-opus-4-8': { entrada: 5, salida: 25, cacheLeida: 0.50, cacheEscrita: 6.25 },
  'claude-haiku-4-5': { entrada: 1, salida: 5, cacheLeida: 0.10, cacheEscrita: 1.25 },
  'claude-fable-5': { entrada: 10, salida: 50, cacheLeida: 1.00, cacheEscrita: 12.50 },
  'claude-sonnet-5': { entrada: 2, salida: 10, cacheLeida: 0.20, cacheEscrita: 2.50 },
  'claude-opus-5': { entrada: 5, salida: 25, cacheLeida: 0.50, cacheEscrita: 6.25 },
}

export function tablaPrecios(): Record<string, PrecioModelo> {
  if (!env.asistente.preciosJson) return PRECIOS_DEFAULT
  try {
    const extra = JSON.parse(env.asistente.preciosJson) as Record<string, PrecioModelo>
    return { ...PRECIOS_DEFAULT, ...extra }
  } catch {
    return PRECIOS_DEFAULT
  }
}

// Costo en USD del turno. Si el modelo no está en la tabla, cae al precio del
// modelo por defecto para no subreportar (nunca 0 silencioso).
export function calcularCostoUsd(modelo: string, uso: UsoTokens): number {
  const tabla = tablaPrecios()
  const p = tabla[modelo] ?? tabla[env.asistente.model] ?? PRECIOS_DEFAULT['claude-sonnet-4-6']
  const usd =
    (uso.entrada * p.entrada +
      uso.salida * p.salida +
      uso.cacheLeidos * p.cacheLeida +
      uso.cacheEscritos * p.cacheEscrita) /
    1_000_000
  return Math.round(usd * 1_000_000) / 1_000_000
}

// ── Implementación real (Anthropic) ──────────────────────────────────────────

export class ProveedorAnthropic implements ProveedorModelo {
  readonly modelo: string
  private client: Anthropic

  constructor() {
    if (!env.asistente.anthropicApiKey) {
      // Solo se construye cuando el asistente está encendido; si falta la key, es
      // un error de configuración (no debe filtrarse al usuario: el orquestador
      // lo traduce a serviceUnavailable).
      throw new Error('ANTHROPIC_API_KEY no está configurada.')
    }
    this.modelo = env.asistente.model
    this.client = new Anthropic({
      apiKey: env.asistente.anthropicApiKey,
      timeout: env.asistente.timeoutMs,
      maxRetries: 1,
    })
  }

  async generar(req: SolicitudModelo): Promise<RespuestaModelo> {
    // cache_control en el bloque de sistema y en la última definición de
    // herramienta: prefijo estable (sistema + herramientas) cacheado entre turnos.
    const system: Anthropic.TextBlockParam[] = [
      { type: 'text', text: req.sistema, cache_control: { type: 'ephemeral' } },
    ]
    const tools: Anthropic.Tool[] = req.herramientas.map((h, i) => ({
      name: h.nombre,
      description: h.descripcion,
      input_schema: h.inputSchema as Anthropic.Tool.InputSchema,
      ...(i === req.herramientas.length - 1 ? { cache_control: { type: 'ephemeral' as const } } : {}),
    }))
    const messages: Anthropic.MessageParam[] = req.mensajes.map((m) => ({
      role: m.rol,
      content: m.contenido.map(aBloqueSdk),
    }))

    const resp = await this.client.messages.create({
      model: this.modelo,
      max_tokens: req.maxTokens,
      system,
      tools,
      messages,
    })

    const bloques: BloqueSalida[] = []
    for (const b of resp.content) {
      if (b.type === 'text') bloques.push({ tipo: 'texto', texto: b.text })
      else if (b.type === 'tool_use') bloques.push({ tipo: 'tool_use', id: b.id, nombre: b.name, input: b.input })
    }
    return {
      bloques,
      stopReason: resp.stop_reason,
      uso: {
        entrada: resp.usage.input_tokens ?? 0,
        salida: resp.usage.output_tokens ?? 0,
        cacheLeidos: resp.usage.cache_read_input_tokens ?? 0,
        cacheEscritos: resp.usage.cache_creation_input_tokens ?? 0,
      },
    }
  }
}

function aBloqueSdk(b: BloqueEntrada): Anthropic.ContentBlockParam {
  switch (b.tipo) {
    case 'texto':
      return { type: 'text', text: b.texto }
    case 'tool_use':
      return { type: 'tool_use', id: b.id, name: b.nombre, input: b.input }
    case 'tool_result':
      return { type: 'tool_result', tool_use_id: b.toolUseId, content: b.contenido, is_error: b.esError ?? false }
  }
}

// ── Implementación falsa (tests) ─────────────────────────────────────────────

// Devuelve respuestas guionadas en orden. Guarda lo recibido para que los tests
// verifiquen que NINGÚN dato de paciente (nombre/RUT/teléfono/correo) llega acá.
export class ProveedorFalso implements ProveedorModelo {
  readonly modelo = 'falso'
  readonly recibidos: SolicitudModelo[] = []
  private i = 0
  constructor(private guion: RespuestaModelo[]) {}

  generar(req: SolicitudModelo): Promise<RespuestaModelo> {
    this.recibidos.push(req)
    const r = this.guion[this.i] ?? {
      bloques: [{ tipo: 'texto', texto: 'Sin más pasos.' }],
      stopReason: 'end_turn',
      uso: { entrada: 0, salida: 0, cacheLeidos: 0, cacheEscritos: 0 },
    }
    this.i += 1
    return Promise.resolve(r)
  }
}

// Helpers para construir un guion en los tests sin repetir estructura.
export function respTexto(texto: string, uso?: Partial<UsoTokens>): RespuestaModelo {
  return { bloques: [{ tipo: 'texto', texto }], stopReason: 'end_turn', uso: { entrada: 0, salida: 0, cacheLeidos: 0, cacheEscritos: 0, ...uso } }
}
export function respHerramienta(id: string, nombre: string, input: unknown, uso?: Partial<UsoTokens>): RespuestaModelo {
  return { bloques: [{ tipo: 'tool_use', id, nombre, input }], stopReason: 'tool_use', uso: { entrada: 0, salida: 0, cacheLeidos: 0, cacheEscritos: 0, ...uso } }
}
