import { createHash } from 'node:crypto'
import { env } from '@/config/env'

// Base de la Graph API con la versión ÚNICA (env.metaGraphVersion) para todas las
// llamadas a Meta. Exportada para reutilizarla en el webhook de Lead Ads.
export const graphBase = () => `https://graph.facebook.com/${env.metaGraphVersion}`

// Integración con Meta Conversions API (server-side). Envía eventos (Lead,
// Schedule, etc.) con los datos del usuario hasheados (SHA-256), como exige Meta.
// El event_id permite deduplicar con el Pixel del navegador (client-side).
// Best-effort: un fallo con Meta NUNCA interrumpe la operación principal.

export interface MetaConfig { enabled: boolean; pixelId: string | null; capiToken: string | null; testCode: string | null }
export interface MetaEvent {
  eventName: string
  eventId: string
  actionSource?: string         // por defecto 'website'; 'system_generated' para eventos del servidor (Schedule)
  eventTime?: number            // Unix seconds; por defecto ahora. Para backfill se usa con clamp (Meta rechaza > 7 días)
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
  leadId?: string | null       // leadgen_id del Formulario Meta → user_data.lead_id (sin hashear)
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

// Valida el Pixel ID + token de Conversions API ENVIANDO un evento de prueba a
// /events (que es el permiso que realmente usa el token de CAPI; leer el nodo
// del pixel suele dar "#100 Missing Permission" con estos tokens). El evento va
// marcado con test_event_code, así Meta lo trata como prueba y NO afecta el
// reporte ni la optimización.
export interface MetaTestResult { ok: boolean; status: number; recibidos?: number; testCode?: string; error?: string }
export async function probarConexionMeta(cfg: MetaConfig): Promise<MetaTestResult> {
  if (!cfg.pixelId) return { ok: false, status: 0, error: 'Falta el Pixel ID.' }
  if (!cfg.capiToken) return { ok: false, status: 0, error: 'Falta el token de Conversions API.' }
  const testCode = cfg.testCode?.trim() || 'CLARIVA_PING'
  try {
    const body = {
      data: [{
        event_name: 'Lead',
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        event_id: `clariva-test-${Date.now()}`,
        user_data: { em: [shaNorm('test@clariva.cl')], client_user_agent: 'Clariva-Test/1.0' },
      }],
      test_event_code: testCode,
    }
    const url = `${graphBase()}/${encodeURIComponent(cfg.pixelId)}/events?access_token=${encodeURIComponent(cfg.capiToken)}`
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = (await r.json().catch(() => ({}))) as { events_received?: number; error?: { message?: string; code?: number }; fbtrace_id?: string }
    if (r.ok && (data.events_received ?? 0) >= 1) return { ok: true, status: r.status, recibidos: data.events_received, testCode }
    return { ok: false, status: r.status, error: data.error?.message ?? `Meta respondió ${r.status}.` }
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : 'No se pudo conectar con Meta.' }
  }
}

// Resultado real del envío a Meta (para confirmar recepción, no best-effort ciego).
export interface MetaSendResult { ok: boolean; recibidos?: number; error?: string }

// ── Integración de CRM (Conversions API para "Leads de conversión") ───────────
// Emisor SEPARADO del CAPI web: envía "eventos de etapa de CRM" al DATASET propio
// de cada clínica (otro objeto de Meta, distinto del pixel web). action_source =
// system_generated; lead_id (leadgen_id numérico) + em/ph hasheados en user_data.
// No toca el flujo Lead/Schedule web.
export interface MetaCrmConfig { enabled: boolean; datasetId: string | null; accessToken: string | null; testCode: string | null }
export function crmMetaHabilitado(cfg: MetaCrmConfig): boolean {
  return Boolean(cfg.enabled && cfg.datasetId && cfg.accessToken)
}

export interface MetaCrmEvent { eventName: string; eventId?: string; eventTime: number; leadId?: string | null; email?: string | null; telefono?: string | null; nombre?: string | null; apellido?: string | null }

// lead_id debe viajar como NÚMERO (sin comillas). Pero los leadgen_id reales superan
// Number.MAX_SAFE_INTEGER (2^53), así que Number()/JSON.stringify perderían precisión
// (ej. 37083026944645017 → …016). Se marca con un sentinel string y luego se sustituye
// por el número CRUDO en el JSON ya serializado, preservando todos los dígitos.
const LEAD_ID_SENTINEL = '__CLARIVA_LEAD_ID__'
function serializarConLeadId(body: Record<string, unknown>, leadIdDigits: string | null): string {
  const json = JSON.stringify(body)
  return leadIdDigits ? json.replace(`"${LEAD_ID_SENTINEL}"`, leadIdDigits) : json
}

// POST al endpoint de eventos del dataset. Devuelve el resultado real.
async function postEventoCrm(datasetId: string, token: string, ev: MetaCrmEvent, testCode?: string): Promise<MetaSendResult> {
  try {
    const user_data: Record<string, unknown> = {}
    // lead_id = leadgen_id del Formulario Instantáneo (NÚMERO crudo, sin hashear). Si
    // no hay, se omite y se manda solo em/ph/fn/ln hasheados.
    const leadIdDigits = ev.leadId && /^\d+$/.test(ev.leadId) ? ev.leadId : null
    if (leadIdDigits) user_data.lead_id = LEAD_ID_SENTINEL
    if (ev.email) user_data.em = [shaNorm(ev.email)]
    if (ev.telefono) { const ph = normPhone(ev.telefono); if (ph) user_data.ph = [sha(ph)] }
    // fn/ln (nombre/apellido) hasheados: suben el Event Match Quality. Solo si existen.
    if (ev.nombre) user_data.fn = [shaNorm(ev.nombre)]
    if (ev.apellido) user_data.ln = [shaNorm(ev.apellido)]
    const body: Record<string, unknown> = {
      data: [{
        action_source: 'system_generated',
        event_name: ev.eventName,
        ...(ev.eventId ? { event_id: ev.eventId } : {}),
        event_time: ev.eventTime,
        custom_data: { event_source: 'crm', lead_event_source: 'Clariva' },
        user_data,
      }],
      ...(testCode ? { test_event_code: testCode } : {}),
    }
    const url = `${graphBase()}/${encodeURIComponent(datasetId)}/events?access_token=${encodeURIComponent(token)}`
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: serializarConLeadId(body, leadIdDigits) })
    const data = (await r.json().catch(() => ({}))) as { events_received?: number; error?: { message?: string }; messages?: string[]; fbtrace_id?: string }
    // Meta puede aceptar el POST (events_received≥1) PERO devolver warnings en
    // `messages` (p. ej. "event_time is in the future") y luego DESCARTAR el evento.
    // Si hay warnings, se trata como NO ok para que se reintente/registre.
    const warnings = Array.isArray(data.messages) ? data.messages.filter(Boolean) : []
    if (r.ok && (data.events_received ?? 0) >= 1 && warnings.length === 0) return { ok: true, recibidos: data.events_received }
    const detalle = data.error?.message ?? (warnings.length ? `Meta advirtió: ${warnings.join('; ')}` : `Meta respondió ${r.status}.`)
    return { ok: false, error: detalle }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error de red con Meta' }
  }
}

export async function enviarEventoCrmMeta(cfg: MetaCrmConfig, ev: MetaCrmEvent): Promise<MetaSendResult> {
  if (!crmMetaHabilitado(cfg)) return { ok: false, error: 'Meta CRM no está configurado' }
  return postEventoCrm(cfg.datasetId!, cfg.accessToken!, ev, cfg.testCode?.trim() || undefined)
}

// Valida dataset + token del CRM enviando un evento de prueba (test_event_code),
// que Meta trata como prueba y NO afecta reporte ni optimización.
export async function probarConexionCrmMeta(cfg: MetaCrmConfig): Promise<MetaTestResult> {
  if (!cfg.datasetId) return { ok: false, status: 0, error: 'Falta el Dataset ID de CRM.' }
  if (!cfg.accessToken) return { ok: false, status: 0, error: 'Falta el token de acceso de CRM.' }
  const testCode = cfg.testCode?.trim() || 'CLARIVA_PING'
  const res = await postEventoCrm(cfg.datasetId, cfg.accessToken, { eventName: 'lead', eventTime: Math.floor(Date.now() / 1000), email: 'test@clariva.cl' }, testCode)
  return { ok: res.ok, status: res.ok ? 200 : 400, recibidos: res.recibidos, testCode, error: res.error }
}

export async function enviarEventoMeta(cfg: MetaConfig, ev: MetaEvent): Promise<MetaSendResult> {
  if (!metaHabilitado(cfg)) return { ok: false, error: 'Meta no está configurado' }
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
    // lead_id = leadgen_id del Formulario Meta (NO se hashea; ata el evento al lead
    // de Meta para optimizar por "Leads de conversión"). Se envía como NÚMERO crudo
    // (sentinel + sustitución) para no perder precisión con ids > 2^53.
    const leadIdDigits = ev.leadId && /^\d+$/.test(ev.leadId) ? ev.leadId : null
    if (leadIdDigits) user_data.lead_id = LEAD_ID_SENTINEL
    else if (ev.leadId) user_data.lead_id = ev.leadId // no numérico: se manda tal cual
    if (ev.ip) user_data.client_ip_address = ev.ip
    if (ev.userAgent) user_data.client_user_agent = ev.userAgent

    const body: Record<string, unknown> = {
      data: [{
        event_name: ev.eventName,
        event_time: ev.eventTime ?? Math.floor(Date.now() / 1000),
        action_source: ev.actionSource ?? 'website',
        event_id: ev.eventId,
        ...(ev.eventSourceUrl ? { event_source_url: ev.eventSourceUrl } : {}),
        user_data,
        ...(ev.custom ? { custom_data: ev.custom } : {}),
      }],
      ...(cfg.testCode ? { test_event_code: cfg.testCode } : {}),
    }
    const url = `${graphBase()}/${cfg.pixelId}/events?access_token=${encodeURIComponent(cfg.capiToken!)}`
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: serializarConLeadId(body, leadIdDigits) })
    const data = (await r.json().catch(() => ({}))) as { events_received?: number; error?: { message?: string } }
    if (r.ok && (data.events_received ?? 0) >= 1) return { ok: true, recibidos: data.events_received }
    return { ok: false, error: data.error?.message ?? `Meta respondió ${r.status}.` }
  } catch (e) {
    // best-effort: no rompemos la operación por un problema con Meta, pero
    // devolvemos el error para registrarlo como confirmación negativa.
    return { ok: false, error: e instanceof Error ? e.message : 'error de red con Meta' }
  }
}
