import { createHash } from 'node:crypto'

// Integración con Meta Conversions API (server-side). Envía eventos (Lead,
// Schedule, etc.) con los datos del usuario hasheados (SHA-256), como exige Meta.
// El event_id permite deduplicar con el Pixel del navegador (client-side).
// Best-effort: un fallo con Meta NUNCA interrumpe la operación principal.

export interface MetaConfig { enabled: boolean; pixelId: string | null; capiToken: string | null; testCode: string | null }
export interface MetaEvent {
  eventName: string
  eventId: string
  eventSourceUrl?: string | null
  email?: string | null
  telefono?: string | null
  nombre?: string | null
  apellido?: string | null
  fbp?: string | null
  fbc?: string | null
  ip?: string | null
  userAgent?: string | null
  custom?: Record<string, unknown>
}

const sha = (v: string) => createHash('sha256').update(v).digest('hex')

// Teléfono a dígitos con código de país (Chile). Meta hashea el número normalizado.
function normPhone(p: string): string {
  const d = p.replace(/\D/g, '')
  if (d.length === 9 && d.startsWith('9')) return `56${d}`
  return d
}

export function metaHabilitado(cfg: MetaConfig): boolean {
  return Boolean(cfg.enabled && cfg.pixelId && cfg.capiToken)
}

export async function enviarEventoMeta(cfg: MetaConfig, ev: MetaEvent): Promise<void> {
  if (!metaHabilitado(cfg)) return
  try {
    const user_data: Record<string, unknown> = {}
    if (ev.email) user_data.em = [sha(ev.email.trim().toLowerCase())]
    if (ev.telefono) { const ph = normPhone(ev.telefono); if (ph) user_data.ph = [sha(ph)] }
    if (ev.nombre) user_data.fn = [sha(ev.nombre.trim().toLowerCase())]
    if (ev.apellido) user_data.ln = [sha(ev.apellido.trim().toLowerCase())]
    if (ev.fbp) user_data.fbp = ev.fbp
    if (ev.fbc) user_data.fbc = ev.fbc
    if (ev.ip) user_data.client_ip_address = ev.ip
    if (ev.userAgent) user_data.client_user_agent = ev.userAgent

    const body: Record<string, unknown> = {
      data: [{
        event_name: ev.eventName,
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        event_id: ev.eventId,
        ...(ev.eventSourceUrl ? { event_source_url: ev.eventSourceUrl } : {}),
        user_data,
        ...(ev.custom ? { custom_data: ev.custom } : {}),
      }],
      ...(cfg.testCode ? { test_event_code: cfg.testCode } : {}),
    }
    const url = `https://graph.facebook.com/v19.0/${cfg.pixelId}/events?access_token=${encodeURIComponent(cfg.capiToken!)}`
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  } catch {
    // best-effort: no rompemos la operación por un problema con Meta.
  }
}
