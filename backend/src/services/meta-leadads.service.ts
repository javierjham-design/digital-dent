import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '@/config/env'
import { control } from '@/db/control'
import { tenantClient } from '@/db/tenant'
import { ingestarLeadMeta, getMetaLeadAdsConfig, registrarLeadAdsRecibido } from '@/services/crm.service'

// Recepción NATIVA de leads del Formulario Instantáneo de Meta (Lead Ads), sin
// Make/Zapier. Una sola App de Meta (plataforma) recibe el webhook `leadgen`;
// cada clínica autoriza su página y guarda su token. El page_id enruta el evento
// al tenant correcto. Multi-tenant, cero constantes de una clínica específica.

const GRAPH = 'https://graph.facebook.com/v25.0'

// ── TAREA 1: verificación del webhook (handshake GET) ─────────────────────────
// Devuelve el challenge (texto plano) si el verify_token coincide; null si no.
export function verificarWebhook(mode: string, verifyToken: string, challenge: string): string | null {
  if (mode === 'subscribe' && env.metaWebhookVerifyToken && verifyToken === env.metaWebhookVerifyToken) return challenge
  return null
}

// ── TAREA 2: validación de firma (obligatoria) ────────────────────────────────
// HMAC-SHA256 del body CRUDO con META_APP_SECRET. Comparación en tiempo constante.
export function firmaValida(rawBody: Buffer | undefined, header: string | undefined): boolean {
  if (!env.metaAppSecret || !rawBody || !header) return false
  const esperado = `sha256=${createHmac('sha256', env.metaAppSecret).update(rawBody).digest('hex')}`
  const a = Buffer.from(header)
  const b = Buffer.from(esperado)
  return a.length === b.length && timingSafeEqual(a, b)
}

// ── Tipos del payload del webhook ─────────────────────────────────────────────
interface LeadgenValue { leadgen_id?: string; page_id?: string; form_id?: string; ad_id?: string; adgroup_id?: string; campaign_id?: string; created_time?: number }
interface WebhookEntry { id?: string; changes?: { field?: string; value?: LeadgenValue }[] }
interface WebhookPayload { object?: string; entry?: WebhookEntry[] }

// ── TAREA 4: traer los datos del lead desde Graph API ─────────────────────────
interface FieldDatum { name?: string; values?: string[] }
interface GraphLead { id?: string; created_time?: string; field_data?: FieldDatum[]; ad_id?: string; adgroup_id?: string; campaign_id?: string; form_id?: string }

async function traerLeadDeGraph(leadgenId: string, pageToken: string): Promise<GraphLead> {
  const fields = 'id,created_time,field_data,ad_id,adgroup_id,campaign_id,form_id'
  const url = `${GRAPH}/${encodeURIComponent(leadgenId)}?fields=${fields}&access_token=${encodeURIComponent(pageToken)}`
  const r = await fetch(url)
  const data = (await r.json().catch(() => ({}))) as GraphLead & { error?: { message?: string } }
  if (!r.ok) throw new Error(data.error?.message ?? `Graph respondió ${r.status}`)
  return data
}

// Mapea field_data → nombre/apellido/telefono/email/rut de forma TOLERANTE: los
// `name` dependen de cómo la clínica armó el formulario. Loga los desconocidos
// (solo el name, NUNCA el valor) para poder mapearlos después.
function mapearFieldData(fd: FieldDatum[] | undefined): { nombre: string; apellido?: string; telefono?: string; email?: string; rut?: string; motivo?: string } {
  const val = (d: FieldDatum) => (d.values && d.values.length ? String(d.values[0]).trim() : '')
  let nombre = '', apellido = '', fullName = '', telefono = '', email = '', rut = '', motivo = ''
  const desconocidos: string[] = []
  for (const d of fd ?? []) {
    const n = (d.name ?? '').toLowerCase()
    const v = val(d)
    if (!v) continue
    if (n === 'email' || n.includes('e-mail') || n.includes('correo') || n.includes('email')) email = email || v
    else if (n.includes('phone') || n.includes('tel') || n.includes('celular') || n.includes('móvil') || n.includes('movil') || n.includes('whatsapp')) telefono = telefono || v
    else if (n === 'first_name' || n.includes('nombre') && !n.includes('apellido') && !n.includes('completo')) nombre = nombre || v
    else if (n === 'last_name' || n.includes('apellido')) apellido = apellido || v
    else if (n === 'full_name' || n.includes('nombre completo') || n.includes('nombre_completo')) fullName = fullName || v
    else if (n === 'rut' || n.includes('rut') || n.includes('dni') || n.includes('documento')) rut = rut || v
    else if (n.includes('motivo') || n.includes('mensaje') || n.includes('consulta') || n.includes('tratamiento')) motivo = motivo || v
    else desconocidos.push(d.name ?? '(sin name)')
  }
  // full_name → nombre + apellido cuando no vinieron por separado.
  if (!nombre && fullName) {
    const partes = fullName.split(/\s+/)
    nombre = partes.shift() ?? fullName
    if (!apellido && partes.length) apellido = partes.join(' ')
  }
  if (desconocidos.length) {
    console.warn(`[meta-leadads] Campos de formulario sin mapear (revisar): ${desconocidos.join(', ')}`)
  }
  return { nombre: nombre || fullName || 'Lead de Meta', apellido: apellido || undefined, telefono: telefono || undefined, email: email || undefined, rut: rut || undefined, motivo: motivo || undefined }
}

// ── TAREA 2/3/5: procesamiento asíncrono del webhook ──────────────────────────
// Se llama DESPUÉS de responder 200. Best-effort: cualquier error se loga y no
// interrumpe (Meta reintenta igual). Nunca loguea tokens ni PII.
export async function procesarWebhookLeadgen(payload: WebhookPayload): Promise<void> {
  if (!payload || payload.object !== 'page' || !Array.isArray(payload.entry)) return
  for (const entry of payload.entry) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'leadgen' || !change.value) continue
      try {
        await procesarUnLead(change.value)
      } catch (e) {
        console.error(`[meta-leadads] Error procesando leadgen: ${e instanceof Error ? e.message : 'desconocido'}`)
      }
    }
  }
}

async function procesarUnLead(v: LeadgenValue): Promise<void> {
  const leadgenId = v.leadgen_id ? String(v.leadgen_id) : ''
  const pageId = v.page_id ? String(v.page_id) : ''
  if (!leadgenId || !pageId) { console.warn('[meta-leadads] Evento sin leadgen_id o page_id; descartado.'); return }

  // TAREA 3: enrutar al tenant por page_id (denormalizado en el control-plane).
  const clinica = await control.clinica.findFirst({
    where: { metaPageId: pageId, metaLeadAdsEnabled: true, activo: true },
    select: { dbName: true, slug: true },
  })
  if (!clinica) { console.warn(`[meta-leadads] Sin clínica activa para page_id ${pageId}; descartado.`); return }

  const db = tenantClient(clinica.dbName)
  const cfg = await getMetaLeadAdsConfig(db)
  if (!cfg.enabled || !cfg.pageToken) { console.warn(`[meta-leadads] Clínica ${clinica.slug} sin token de página; descartado.`); return }

  // TAREA 4: traer los datos reales del formulario (el webhook solo trae IDs).
  const graph = await traerLeadDeGraph(leadgenId, cfg.pageToken)
  const persona = mapearFieldData(graph.field_data)

  // TAREA 5: crear el lead (dedup + idempotencia por leadgenId dentro de ingestarLeadMeta).
  const r = await ingestarLeadMeta(db, {
    nombre: persona.nombre, apellido: persona.apellido, telefono: persona.telefono, email: persona.email, rut: persona.rut,
    motivo: persona.motivo,
    leadgenId,
    formId: graph.form_id ?? v.form_id,
    adId: graph.ad_id ?? v.ad_id,
    adsetId: graph.adgroup_id ?? v.adgroup_id,
    campaignId: graph.campaign_id ?? v.campaign_id,
    pageId,
  })
  await registrarLeadAdsRecibido(db, { leadgenId, leadId: r.lead?.id, reconciliado: r.reconciliado, duplicado: (r as { duplicado?: boolean }).duplicado })
  console.log(`[meta-leadads] Lead ${leadgenId} → clínica ${clinica.slug} (lead ${r.lead?.id ?? '?'}${(r as { duplicado?: boolean }).duplicado ? ', duplicado' : r.reconciliado ? ', reconciliado' : ''}).`)
}

// ── TAREA 6: "Probar recepción" (valida token+página y devuelve el último) ─────
export interface ProbarRecepcionResult { ok: boolean; enabled: boolean; pagina?: string; error?: string; ultimo: unknown | null }
export async function probarRecepcionLeadAds(db: ReturnType<typeof tenantClient>): Promise<ProbarRecepcionResult> {
  const cfg = await getMetaLeadAdsConfig(db)
  const ultimo = cfg.ultimo ? safeJson(cfg.ultimo) : null
  if (!cfg.pageId) return { ok: false, enabled: cfg.enabled, error: 'Falta el Page ID de la clínica.', ultimo }
  if (!cfg.pageToken) return { ok: false, enabled: cfg.enabled, error: 'Falta el token de página.', ultimo }
  try {
    const url = `${GRAPH}/${encodeURIComponent(cfg.pageId)}?fields=id,name&access_token=${encodeURIComponent(cfg.pageToken)}`
    const r = await fetch(url)
    const d = (await r.json().catch(() => ({}))) as { name?: string; error?: { message?: string } }
    if (!r.ok) return { ok: false, enabled: cfg.enabled, error: d.error?.message ?? `Graph respondió ${r.status}`, ultimo }
    return { ok: true, enabled: cfg.enabled, pagina: d.name ?? cfg.pageId, ultimo }
  } catch (e) {
    return { ok: false, enabled: cfg.enabled, error: e instanceof Error ? e.message : 'No se pudo conectar con Meta.', ultimo }
  }
}

function safeJson(s: string): unknown { try { return JSON.parse(s) } catch { return s } }
