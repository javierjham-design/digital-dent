import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '@/config/env'
import { control } from '@/db/control'
import { tenantClient } from '@/db/tenant'
import { ingestarLeadMeta, getMetaLeadAdsConfig, registrarLeadAdsRecibido } from '@/services/crm.service'
import { graphBase } from '@/lib/meta'

// Recepción NATIVA de leads del Formulario Instantáneo de Meta (Lead Ads), sin
// Make/Zapier. Una sola App de Meta (plataforma) recibe el webhook `leadgen`;
// cada clínica autoriza su página y guarda su token. El page_id enruta el evento
// al tenant correcto. Multi-tenant, cero constantes de una clínica específica.


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
export interface GraphError { message: string; type?: string; code?: number; subcode?: number; status: number }
type GraphResult = { ok: true; lead: GraphLead } | { ok: false; error: GraphError }

async function traerLeadDeGraph(leadgenId: string, pageToken: string): Promise<GraphResult> {
  const fields = 'id,created_time,field_data,ad_id,adgroup_id,campaign_id,form_id'
  const url = `${graphBase()}/${encodeURIComponent(leadgenId)}?fields=${fields}&access_token=${encodeURIComponent(pageToken)}`
  try {
    const r = await fetch(url)
    const data = (await r.json().catch(() => ({}))) as GraphLead & { error?: { message?: string; type?: string; code?: number; error_subcode?: number } }
    if (!r.ok || data.error) {
      const e = data.error ?? {}
      return { ok: false, error: { message: e.message ?? `Graph respondió ${r.status}`, type: e.type, code: e.code, subcode: e.error_subcode, status: r.status } }
    }
    return { ok: true, lead: data }
  } catch (e) {
    return { ok: false, error: { message: e instanceof Error ? e.message : 'error de red con Graph', status: 0 } }
  }
}

// Normaliza el `name` de un campo: minúsculas, sin tildes/diacríticos, separadores
// (espacios, guiones) colapsados a "_". Así "Número de teléfono" → "numero_de_telefono".
function normName(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

// Tabla de alias por categoría (ES + EN). Match exacto por set, con respaldo por
// substring para robustez ante variantes.
const ALIAS: Record<'email' | 'telefono' | 'fullName' | 'nombre' | 'apellido' | 'rut' | 'motivo', string[]> = {
  email:    ['email', 'correo_electronico', 'correo', 'e_mail', 'mail'],
  telefono: ['phone_number', 'phone', 'numero_de_telefono', 'numero_telefono', 'telefono', 'celular', 'movil', 'whatsapp', 'fono', 'numero_de_celular', 'tel'],
  fullName: ['full_name', 'nombre_completo', 'nombre_y_apellido', 'nombres_y_apellidos'],
  nombre:   ['first_name', 'nombre', 'nombres', 'primer_nombre', 'name'],
  apellido: ['last_name', 'apellido', 'apellidos', 'primer_apellido', 'apellido_paterno'],
  rut:      ['rut', 'dni', 'documento', 'cedula', 'identificacion', 'run'],
  motivo:   ['motivo', 'mensaje', 'consulta', 'tratamiento', 'comentario', 'motivo_de_consulta'],
}

type Categoria = keyof typeof ALIAS | null
function categoriaDe(nn: string): Categoria {
  for (const cat of Object.keys(ALIAS) as (keyof typeof ALIAS)[]) {
    if (ALIAS[cat].includes(nn)) return cat
  }
  // Respaldo por substring (después de fallar el match exacto), en orden de prioridad.
  if (/correo|email|e_mail|mail/.test(nn)) return 'email'
  if (/telefono|phone|celular|whatsapp|movil|fono/.test(nn)) return 'telefono'
  if (/nombre_completo|full_name|nombre_y_apellido/.test(nn)) return 'fullName'
  if (/apellido/.test(nn)) return 'apellido'
  if (/nombre|first_name/.test(nn)) return 'nombre'
  if (/rut|dni|documento|cedula|^run$/.test(nn)) return 'rut'
  if (/motivo|mensaje|consulta|tratamiento|comentario/.test(nn)) return 'motivo'
  return null
}

export interface MapeoLead { nombre: string; apellido?: string; telefono?: string; email?: string; rut?: string; motivo?: string; camposExtra: Record<string, string> }

// Mapea field_data → campos conocidos de forma TOLERANTE (ES/EN, con tildes). Los
// que no matchean NO se descartan: van a `camposExtra` y se loga el name crudo.
function mapearFieldData(fd: FieldDatum[] | undefined): MapeoLead {
  const val = (d: FieldDatum) => (d.values && d.values.length ? String(d.values[0]).trim() : '')
  let nombre = '', apellido = '', fullName = '', telefono = '', email = '', rut = '', motivo = ''
  const camposExtra: Record<string, string> = {}
  const noMapeados: string[] = []
  for (const d of fd ?? []) {
    const v = val(d)
    if (!v) continue
    const raw = d.name ?? ''
    switch (categoriaDe(normName(raw))) {
      case 'email': email = email || v; break
      case 'telefono': telefono = telefono || v; break
      case 'fullName': fullName = fullName || v; break
      case 'nombre': nombre = nombre || v; break
      case 'apellido': apellido = apellido || v; break
      case 'rut': rut = rut || v; break
      case 'motivo': motivo = motivo || v; break
      default: camposExtra[raw || '(sin name)'] = v; noMapeados.push(raw || '(sin name)')
    }
  }
  // full_name → nombre + apellido cuando no vinieron por separado.
  if (!nombre && fullName) {
    const partes = fullName.split(/\s+/)
    nombre = partes.shift() ?? fullName
    if (!apellido && partes.length) apellido = partes.join(' ')
  }
  if (noMapeados.length) {
    console.warn(`[meta-leadads] Campos sin alias (guardados en camposExtra): ${noMapeados.join(', ')}`)
  }
  return { nombre: nombre || fullName || 'Lead de Meta', apellido: apellido || undefined, telefono: telefono || undefined, email: email || undefined, rut: rut || undefined, motivo: motivo || undefined, camposExtra }
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

// Pipeline compartido: fetch a Graph → mapeo → dedup/ingesta. Lo usan el webhook
// y el reproceso manual. Devuelve el field_data crudo y lo mapeado para diagnóstico.
export interface PipelineResult {
  ok: boolean
  error?: GraphError
  fieldData?: FieldDatum[]
  mapeado?: Omit<MapeoLead, 'camposExtra'>
  camposExtra?: Record<string, string>
  leadId?: string
  estado?: 'creado' | 'reconciliado' | 'duplicado'
}
async function ejecutarPipeline(
  db: ReturnType<typeof tenantClient>,
  args: { leadgenId: string; pageToken: string; pageId?: string; formId?: string; adId?: string; adsetId?: string; campaignId?: string },
): Promise<PipelineResult> {
  const g = await traerLeadDeGraph(args.leadgenId, args.pageToken)
  if (!g.ok) return { ok: false, error: g.error }
  const graph = g.lead
  const { camposExtra, ...persona } = mapearFieldData(graph.field_data)
  const extraJson = Object.keys(camposExtra).length ? JSON.stringify(camposExtra) : undefined

  const r = await ingestarLeadMeta(db, {
    nombre: persona.nombre, apellido: persona.apellido, telefono: persona.telefono, email: persona.email, rut: persona.rut,
    motivo: persona.motivo, camposExtra: extraJson,
    leadgenId: args.leadgenId,
    formId: graph.form_id ?? args.formId,
    adId: graph.ad_id ?? args.adId,
    adsetId: graph.adgroup_id ?? args.adsetId,
    campaignId: graph.campaign_id ?? args.campaignId,
    pageId: args.pageId,
  })
  const estado = (r as { duplicado?: boolean }).duplicado ? 'duplicado' : r.reconciliado ? 'reconciliado' : 'creado'
  return { ok: true, fieldData: graph.field_data, mapeado: persona, camposExtra, leadId: r.lead?.id, estado }
}

async function procesarUnLead(v: LeadgenValue): Promise<void> {
  const leadgenId = v.leadgen_id ? String(v.leadgen_id) : ''
  const pageId = v.page_id ? String(v.page_id) : ''
  // TAREA 3 (logging): dejar rastro de CADA evento recibido con sus IDs.
  console.log('[meta-leadads] Webhook leadgen recibido', { page_id: pageId || null, leadgen_id: leadgenId || null, form_id: v.form_id ?? null })
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

  // TAREA 4/5: fetch + mapeo + dedup/ingesta.
  const res = await ejecutarPipeline(db, { leadgenId, pageToken: cfg.pageToken, pageId, formId: v.form_id, adId: v.ad_id, adsetId: v.adgroup_id, campaignId: v.campaign_id })
  if (!res.ok) {
    // Antes el fallo era silencioso (Meta reportaba éxito y no aparecía nada). Ahora
    // se registra el error de Graph con code/subcode para diagnóstico.
    const e = res.error
    console.error('[meta-leadads] Graph fetch FALLÓ', { page_id: pageId, leadgen_id: leadgenId, form_id: v.form_id ?? null, clinica: clinica.slug, status: e?.status, code: e?.code, subcode: e?.subcode, message: e?.message })
    return
  }
  await registrarLeadAdsRecibido(db, { leadgenId, leadId: res.leadId, reconciliado: res.estado === 'reconciliado', duplicado: res.estado === 'duplicado' })
  console.log('[meta-leadads] Lead procesado', { leadgen_id: leadgenId, clinica: clinica.slug, lead_id: res.leadId ?? null, estado: res.estado })
}

// ── TAREA 6: "Probar recepción" (valida token+página y devuelve el último) ─────
export interface ProbarRecepcionResult { ok: boolean; enabled: boolean; pagina?: string; error?: string; ultimo: unknown | null }
export async function probarRecepcionLeadAds(db: ReturnType<typeof tenantClient>): Promise<ProbarRecepcionResult> {
  const cfg = await getMetaLeadAdsConfig(db)
  const ultimo = cfg.ultimo ? safeJson(cfg.ultimo) : null
  if (!cfg.pageId) return { ok: false, enabled: cfg.enabled, error: 'Falta el Page ID de la clínica.', ultimo }
  if (!cfg.pageToken) return { ok: false, enabled: cfg.enabled, error: 'Falta el token de página.', ultimo }
  try {
    const url = `${graphBase()}/${encodeURIComponent(cfg.pageId)}?fields=id,name&access_token=${encodeURIComponent(cfg.pageToken)}`
    const r = await fetch(url)
    const d = (await r.json().catch(() => ({}))) as { name?: string; error?: { message?: string } }
    if (!r.ok) return { ok: false, enabled: cfg.enabled, error: d.error?.message ?? `Graph respondió ${r.status}`, ultimo }
    return { ok: true, enabled: cfg.enabled, pagina: d.name ?? cfg.pageId, ultimo }
  } catch (e) {
    return { ok: false, enabled: cfg.enabled, error: e instanceof Error ? e.message : 'No se pudo conectar con Meta.', ultimo }
  }
}

// ── Reproceso manual (admin) — mismo pipeline que el webhook, sin gastar anuncios.
// Usa el token de página del TENANT actual. Devuelve el field_data crudo y lo que
// se mapeó (y qué quedó en camposExtra) para poder validar exactamente.
export interface ReprocesoResult {
  ok: boolean
  error?: string
  graphError?: GraphError
  fieldData?: FieldDatum[]
  mapeado?: Omit<MapeoLead, 'camposExtra'>
  camposExtra?: Record<string, string>
  estado?: 'creado' | 'reconciliado' | 'duplicado'
  lead?: unknown
}
export async function reprocesarLead(db: ReturnType<typeof tenantClient>, leadgenId: string): Promise<ReprocesoResult> {
  const id = String(leadgenId ?? '').trim()
  if (!id) return { ok: false, error: 'Falta el leadgenId.' }
  const cfg = await getMetaLeadAdsConfig(db)
  if (!cfg.pageToken) return { ok: false, error: 'La clínica no tiene token de página configurado.' }
  const res = await ejecutarPipeline(db, { leadgenId: id, pageToken: cfg.pageToken, pageId: cfg.pageId ?? undefined })
  if (!res.ok) return { ok: false, error: res.error?.message, graphError: res.error }
  await registrarLeadAdsRecibido(db, { leadgenId: id, leadId: res.leadId, reconciliado: res.estado === 'reconciliado', duplicado: res.estado === 'duplicado' })
  // Re-lee el lead completo para inspección (ingestarLeadMeta a veces devuelve solo el id).
  const lead = res.leadId ? await db.lead.findUnique({ where: { id: res.leadId } }) : null
  return { ok: true, fieldData: res.fieldData, mapeado: res.mapeado, camposExtra: res.camposExtra, estado: res.estado, lead }
}

function safeJson(s: string): unknown { try { return JSON.parse(s) } catch { return s } }
