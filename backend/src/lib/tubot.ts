// Frontera de proveedor del canal WhatsApp. Una sola implementación (TuBot): no
// para soportar dos proveedores, sino para que el orquestador (lib/whatsapp.ts) no
// sepa nada del transporte y el diff sea legible. Contrato: docs/TUBOT_WHATSAPP.md.
import { createHmac } from 'crypto'
import { env } from '@/config/env'

// Config por clínica ya resuelta (API key descifrada). El baseUrl es global (env).
export interface TubotConfig {
  apiKey: string
  templateName: string
  templateLang: string
}

export interface EnviarPlantillaInput {
  to: string
  variables: string[]
  botones: { payload: string }[]
  idempotencyKey: string
}

// Evento entrante ya parseado (lo que TuBot POSTea a nuestro webhook).
export type EventoEntrante =
  | { tipo: 'button'; from: string; providerMsgId: string; replyTo: string | null; payload: string; texto: string }
  | { tipo: 'text'; from: string; providerMsgId: string; replyTo: string | null; texto: string }
  | { tipo: 'status'; providerMsgId: string; status: 'sent' | 'delivered' | 'read' | 'failed'; reason: string | null }

export class PlantillaNoAprobadaError extends Error {}
export class RateLimitError extends Error {
  constructor(public retryAfterSeg: number) { super('rate_limited') }
}

export interface WhatsappProvider {
  enviarPlantilla(cfg: TubotConfig, input: EnviarPlantillaInput): Promise<{ messageId: string }>
  enviarTexto(cfg: TubotConfig, to: string, texto: string): Promise<{ messageId: string }>
  estadoPlantilla(cfg: TubotConfig): Promise<{ status: string }>
  verificarFirma(secret: string, rawBody: string, firmaHeader: string | null): boolean
  parseInbound(rawBody: string): EventoEntrante | null
}

function headers(apiKey: string, extra?: Record<string, string>) {
  return { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', ...extra }
}

export const tubotProvider: WhatsappProvider = {
  async enviarPlantilla(cfg, input) {
    const res = await fetch(`${env.tubotBaseUrl}/public/v1/messages/template`, {
      method: 'POST',
      headers: headers(cfg.apiKey, { 'Idempotency-Key': input.idempotencyKey }),
      body: JSON.stringify({
        to: input.to,
        templateName: cfg.templateName,
        languageCode: cfg.templateLang,
        variables: input.variables,
        buttons: input.botones.map((b) => ({ type: 'quick_reply', payload: b.payload })),
      }),
    })
    if (res.status === 422) throw new PlantillaNoAprobadaError('template_not_approved')
    if (res.status === 429) throw new RateLimitError(Number(res.headers.get('retry-after')) || 30)
    const data = (await res.json().catch(() => ({}))) as { messageId?: string; message?: string; error?: string }
    if (!res.ok || !data.messageId) throw new Error(`TuBot ${res.status}: ${data.message ?? data.error ?? 'error'}`)
    return { messageId: data.messageId }
  },

  async enviarTexto(cfg, to, texto) {
    const res = await fetch(`${env.tubotBaseUrl}/public/v1/messages/text`, {
      method: 'POST', headers: headers(cfg.apiKey), body: JSON.stringify({ to, text: texto }),
    })
    const data = (await res.json().catch(() => ({}))) as { messageId?: string; message?: string }
    if (!res.ok || !data.messageId) throw new Error(`TuBot ${res.status}: ${data.message ?? 'error'}`)
    return { messageId: data.messageId }
  },

  async estadoPlantilla(cfg) {
    const url = `${env.tubotBaseUrl}/public/v1/templates/${encodeURIComponent(cfg.templateName)}?languageCode=${encodeURIComponent(cfg.templateLang)}`
    const res = await fetch(url, { headers: headers(cfg.apiKey) })
    const data = (await res.json().catch(() => ({}))) as { status?: string; message?: string }
    if (!res.ok || !data.status) throw new Error(`TuBot ${res.status}: ${data.message ?? 'no se pudo leer el estado de la plantilla'}`)
    return { status: data.status }
  },

  // X-Tubot-Signature: sha256=HMAC-SHA256(secret, raw_body). Comparación en tiempo
  // constante. Sin firma o sin secreto → inválida.
  verificarFirma(secret, rawBody, firmaHeader) {
    if (!secret || !firmaHeader?.startsWith('sha256=')) return false
    const recibida = firmaHeader.slice('sha256='.length)
    const esperada = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
    if (esperada.length !== recibida.length) return false
    let diff = 0
    for (let i = 0; i < esperada.length; i++) diff |= esperada.charCodeAt(i) ^ recibida.charCodeAt(i)
    return diff === 0
  },

  parseInbound(rawBody) {
    let b: Record<string, unknown>
    try { b = JSON.parse(rawBody) } catch { return null }
    const event = b.event
    if (event === 'status') {
      const status = b.status
      if (!b.providerMsgId || !['sent', 'delivered', 'read', 'failed'].includes(String(status))) return null
      return { tipo: 'status', providerMsgId: String(b.providerMsgId), status: status as 'sent' | 'delivered' | 'read' | 'failed', reason: b.reason ? String(b.reason) : null }
    }
    if (event === 'button') {
      const btn = (b.button ?? {}) as { payload?: string; text?: string }
      if (!b.providerMsgId || !btn.payload) return null
      return { tipo: 'button', from: String(b.from ?? ''), providerMsgId: String(b.providerMsgId), replyTo: b.replyTo ? String(b.replyTo) : null, payload: String(btn.payload), texto: String(btn.text ?? btn.payload) }
    }
    if (event === 'text') {
      if (!b.providerMsgId) return null
      return { tipo: 'text', from: String(b.from ?? ''), providerMsgId: String(b.providerMsgId), replyTo: b.replyTo ? String(b.replyTo) : null, texto: String(b.text ?? '') }
    }
    return null
  },
}
