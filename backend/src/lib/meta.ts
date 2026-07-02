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
  externalId?: string | null   // se hashea → external_id (mejora el Event Match Quality)
  sexo?: string | null         // → ge  (m/f)
  fechaNacimiento?: string | Date | null // → db (YYYYMMDD)
  ciudad?: string | null       // → ct
  region?: string | null       // → st
  zip?: string | null          // → zp
  pais?: string | null         // → country (código ISO, ej. cl)
  fbp?: string | null
  fbc?: string | null
  ctwaClid?: string | null     // Click-to-WhatsApp: se envía sin hashear
  ip?: string | null
  userAgent?: string | null
  custom?: Record<string, unknown>
}

const sha = (v: string) => createHash('sha256').update(v).digest('hex')
const shaNorm = (v: string) => sha(v.trim().toLowerCase())

// Teléfono a dígitos con código de país (Chile). Meta hashea el número normalizado.
function normPhone(p: string): string {
  const d = p.replace(/\D/g, '')
  if (d.length === 9 && d.startsWith('9')) return `56${d}`
  return d
}

// Género → 'm' | 'f' (Meta espera una sola letra).
function normGenero(s: string): string | null {
  const v = s.trim().toLowerCase()
  if (['m', 'masculino', 'male', 'hombre', 'h'].includes(v)) return 'm'
  if (['f', 'femenino', 'female', 'mujer'].includes(v)) return 'f'
  return null
}

// Fecha de nacimiento → 'YYYYMMDD'.
function normFechaNac(v: string | Date): string | null {
  const d = v instanceof Date ? v : new Date(v)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

export function metaHabilitado(cfg: MetaConfig): boolean {
  return Boolean(cfg.enabled && cfg.pixelId && cfg.capiToken)
}

// Valida contra Meta que el Pixel ID + token de Conversions API sean correctos y
// que el token tenga acceso a ese pixel/dataset. No envía ningún evento (no
// contamina métricas): sólo lee el nodo del pixel.
export interface MetaTestResult { ok: boolean; status: number; nombre?: string; error?: string }
export async function probarConexionMeta(cfg: MetaConfig): Promise<MetaTestResult> {
  if (!cfg.pixelId) return { ok: false, status: 0, error: 'Falta el Pixel ID.' }
  if (!cfg.capiToken) return { ok: false, status: 0, error: 'Falta el token de Conversions API.' }
  try {
    const url = `https://graph.facebook.com/v19.0/${encodeURIComponent(cfg.pixelId)}?fields=name,id&access_token=${encodeURIComponent(cfg.capiToken)}`
    const r = await fetch(url)
    const data = (await r.json().catch(() => ({}))) as { id?: string; name?: string; error?: { message?: string } }
    if (r.ok && data?.id) return { ok: true, status: r.status, nombre: data.name ?? data.id }
    return { ok: false, status: r.status, error: data?.error?.message ?? `Meta respondió ${r.status}.` }
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : 'No se pudo conectar con Meta.' }
  }
}

export async function enviarEventoMeta(cfg: MetaConfig, ev: MetaEvent): Promise<void> {
  if (!metaHabilitado(cfg)) return
  try {
    const user_data: Record<string, unknown> = {}
    if (ev.email) user_data.em = [shaNorm(ev.email)]
    if (ev.telefono) { const ph = normPhone(ev.telefono); if (ph) user_data.ph = [sha(ph)] }
    if (ev.nombre) user_data.fn = [shaNorm(ev.nombre)]
    if (ev.apellido) user_data.ln = [shaNorm(ev.apellido)]
    if (ev.externalId) user_data.external_id = [shaNorm(String(ev.externalId))]
    if (ev.sexo) { const g = normGenero(ev.sexo); if (g) user_data.ge = [sha(g)] }
    if (ev.fechaNacimiento) { const db = normFechaNac(ev.fechaNacimiento); if (db) user_data.db = [sha(db)] }
    if (ev.ciudad) user_data.ct = [sha(ev.ciudad.trim().toLowerCase().replace(/\s+/g, ''))]
    if (ev.region) user_data.st = [sha(ev.region.trim().toLowerCase().replace(/\s+/g, ''))]
    if (ev.zip) user_data.zp = [sha(ev.zip.trim().toLowerCase().replace(/\s+/g, ''))]
    if (ev.pais) user_data.country = [sha(ev.pais.trim().toLowerCase())]
    if (ev.fbp) user_data.fbp = ev.fbp
    if (ev.fbc) user_data.fbc = ev.fbc
    if (ev.ctwaClid) user_data.ctwa_clid = ev.ctwaClid
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
