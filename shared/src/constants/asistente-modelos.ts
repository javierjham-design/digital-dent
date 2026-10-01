// Modelos ofrecidos para el Asistente de IA (selector del super-admin por clínica).
// El proveedor se deriva del modelo elegido. "Default del sistema" = sin override
// (usa la env global ASISTENTE_PROVEEDOR/ASISTENTE_MODEL del backend).

export interface ModeloAsistente { id: string; nombre: string; proveedor: 'openai' | 'anthropic' }

export const MODELOS_ASISTENTE: ModeloAsistente[] = [
  { id: 'gpt-4o-mini', nombre: 'GPT-4o mini — el más económico (OpenAI)', proveedor: 'openai' },
  { id: 'gpt-4.1-mini', nombre: 'GPT-4.1 mini — intermedio (OpenAI)', proveedor: 'openai' },
  { id: 'gpt-4o', nombre: 'GPT-4o — más capaz (OpenAI)', proveedor: 'openai' },
  { id: 'claude-haiku-4-5', nombre: 'Claude Haiku 4.5 (Anthropic)', proveedor: 'anthropic' },
  { id: 'claude-sonnet-4-6', nombre: 'Claude Sonnet 4.6 (Anthropic)', proveedor: 'anthropic' },
  { id: 'claude-opus-4-8', nombre: 'Claude Opus 4.8 — el más capaz (Anthropic)', proveedor: 'anthropic' },
]

export const MODELOS_ASISTENTE_IDS = MODELOS_ASISTENTE.map((m) => m.id)
export function modeloAsistente(id?: string | null): ModeloAsistente | undefined {
  return id ? MODELOS_ASISTENTE.find((m) => m.id === id) : undefined
}
