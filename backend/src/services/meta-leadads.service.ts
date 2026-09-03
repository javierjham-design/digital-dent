import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '@/config/env'
import { control } from '@/db/control'
import { tenantClient } from '@/db/tenant'
import { ingestarLeadMeta, getMetaLeadAdsConfig, registrarLeadAdsRecibido } from '@/services/crm.service'
import { graphBase } from '@/lib/meta'
import { log, serializeError } from '@/lib/logger'

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
// OJO: al consultar el NODO leadgen el conjunto de anuncios es `adset_id` (no
// `adgroup_id` como en el payload del webhook). En orgánicos/prueba vienen null.
interface GraphLead { id?: string; created_time?: string; field_data?: FieldDatum[]; ad_id?: string; adset_id?: string; campaign_id?: string; form_id?: string; is_organic?: boolean; platform?: string }
export interface GraphError { message: string; type?: string; code?: number; subcode?: number }
// Resultado del fetch a Graph. `request` es la URL SIN el access_token (para
// diagnóstico/registro seguro); nunca se expone el token.
interface GraphFetch { ok: boolean; status: number; request: string; lead?: GraphLead; error?: GraphError }

// Campos válidos del nodo leadgen. El set mínimo es el respaldo si Graph rechaza
// alguno (así un cambio futuro de la API no vuelve a tumbar la ingesta entera).
const FIELDS_LEADGEN = 'id,created_time,field_data,form_id,ad_id,adset_id,campaign_id,is_organic,platform'
const FIELDS_MINIMO = 'id,created_time,field_data,form_id'

async function fetchGraph(leadgenId: string, pageToken: string, fields: string): Promise<GraphFetch> {
  const request = `GET /${env.metaGraphVersion}/${leadgenId}?fields=${fields}` // sin access_token
  const url = `${graphBase()}/${encodeURIComponent(leadgenId)}?fields=${fields}&access_token=${encodeURIComponent(pageToken)}`
  try {
    const r = await fetch(url)
    const data = (await r.json().catch(() => ({}))) as GraphLead & { error?: { message?: string; type?: string; code?: number; error_subcode?: number } }
    if (!r.ok || data.error) {
      const e = data.error ?? {}
      return { ok: false, status: r.status, request, error: { message: e.message ?? `Graph respondió ${r.status}`, type: e.type, code: e.code, subcode: e.error_subcode } }
    }
    return { ok: true, status: r.status, request, lead: data }
  } catch (e) {
    return { ok: false, status: 0, request, error: { message: e instanceof Error ? e.message : 'error de red con Graph' } }
  }
}

// Nombre del Formulario Instantáneo (form_id → name) vía Graph, para diferenciar
// campañas en el CRM. Best-effort: si falla, se ingresa el lead igual sin nombre.
// Caché por form_id (los nombres cambian rara vez) para no llamar a Graph por cada lead.
const formNameCache = new Map<string, { name: string; at: number }>()
const FORM_NAME_TTL = 6 * 3600_000
let ultimoErrorFormulario: string | undefined // diagnóstico: último error al resolver un formulario
async function traerNombreFormulario(formId: string | undefined, pageToken: string): Promise<string | undefined> {
  if (!formId) return undefined
  const hit = formNameCache.get(formId)
  if (hit && Date.now() - hit.at < FORM_NAME_TTL) return hit.name || undefined
  try {
    const url = `${graphBase()}/${encodeURIComponent(formId)}?fields=name&access_token=${encodeURIComponent(pageToken)}`
    const r = await fetch(url)
    const d = (await r.json().catch(() => ({}))) as { name?: string; error?: { message?: string; code?: number } }
    if (!r.ok || !d.name) {
      ultimoErrorFormulario = `status=${r.status} code=${d.error?.code ?? '?'} ${d.error?.message ?? ''}`.trim()
      log.warn('meta-leadads: no se pudo resolver el nombre del formulario', { form_id: formId, status: r.status, code: d.error?.code, message: d.error?.message })
      return undefined
    }
    formNameCache.set(formId, { name: d.name, at: Date.now() })
    return d.name
  } catch (e) {
    ultimoErrorFormulario = e instanceof Error ? e.message : 'error de red'
    log.warn('meta-leadads: error resolviendo nombre del formulario', { form_id: formId, err: serializeError(e) })
    return undefined
  }
}

async function traerLeadDeGraph(leadgenId: string, pageToken: string): Promise<GraphFetch> {
  const primero = await fetchGraph(leadgenId, pageToken, FIELDS_LEADGEN)
  // Tolerancia: si Graph rechaza un campo inválido (#100 "nonexisting field"),
  // reintentar UNA vez con el set mínimo y loguear cuál campo lo causó.
  if (!primero.ok && primero.error?.code === 100 && /nonexisting field|accessing/i.test(primero.error.message)) {
    const campo = primero.error.message.match(/\(([^)]+)\)/)?.[1] ?? '¿?'
    log.warn('meta-leadads: Graph rechazó un campo; reintentando con set mínimo', { campo, setMinimo: FIELDS_MINIMO })
    return fetchGraph(leadgenId, pageToken, FIELDS_MINIMO)
  }
  return primero
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
    log.warn('meta-leadads: campos sin alias (guardados en camposExtra)', { campos: noMapeados })
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
        log.error('meta-leadads: error procesando leadgen', { err: serializeError(e) })
      }
    }
  }
}

// Pipeline compartido: fetch a Graph → mapeo → dedup/ingesta. Lo usan el webhook
// y el reproceso manual (misma ruta de código; nunca divergen). Devuelve todo el
// diagnóstico (request sin token, status, error, field_data crudo, mapeo).
export interface PipelineResult {
  graphRequest: string
  graphStatus: number
  graphError: GraphError | null
  fieldDataCrudo?: FieldDatum[]
  mapeo?: { nombre?: string; apellido?: string; telefono?: string; email?: string; rut?: string; motivo?: string; noReconocidos: string[] }
  resultado: 'creado' | 'duplicado' | 'error'
  leadId?: string
}
async function ejecutarPipeline(
  db: ReturnType<typeof tenantClient>,
  args: { leadgenId: string; pageToken: string; pageId?: string; formId?: string; adId?: string; adsetId?: string; campaignId?: string },
): Promise<PipelineResult> {
  const g = await traerLeadDeGraph(args.leadgenId, args.pageToken)
  if (!g.ok || !g.lead) {
    return { graphRequest: g.request, graphStatus: g.status, graphError: g.error ?? { message: 'Graph no devolvió datos.' }, resultado: 'error' }
  }
  const graph = g.lead
  const { camposExtra, ...persona } = mapearFieldData(graph.field_data)
  const extraJson = Object.keys(camposExtra).length ? JSON.stringify(camposExtra) : undefined
  const formId = graph.form_id ?? args.formId
  const formularioNombre = await traerNombreFormulario(formId, args.pageToken)

  const r = await ingestarLeadMeta(db, {
    nombre: persona.nombre, apellido: persona.apellido, telefono: persona.telefono, email: persona.email, rut: persona.rut,
    motivo: persona.motivo, camposExtra: extraJson,
    leadgenId: args.leadgenId,
    formId, formularioNombre,
    adId: graph.ad_id ?? args.adId,
    // Conjunto de anuncios: al leer el nodo leadgen es adset_id; el webhook lo trae
    // como adgroup_id (args.adsetId). Se guarda en utmTerm (nivel de optimización).
    adsetId: graph.adset_id ?? args.adsetId,
    campaignId: graph.campaign_id ?? args.campaignId,
    pageId: args.pageId,
  })
  // "duplicado" = ya existía un lead con ese leadgenId, o se reconció con la misma
  // persona (en ambos casos no se creó un lead nuevo). Si no, "creado".
  const dup = (r as { duplicado?: boolean }).duplicado || r.reconciliado
  const mapeo = { ...persona, noReconocidos: Object.keys(camposExtra) }
  return { graphRequest: g.request, graphStatus: g.status, graphError: null, fieldDataCrudo: graph.field_data, mapeo, resultado: dup ? 'duplicado' : 'creado', leadId: r.lead?.id }
}

async function procesarUnLead(v: LeadgenValue): Promise<void> {
  const leadgenId = v.leadgen_id ? String(v.leadgen_id) : ''
  const pageId = v.page_id ? String(v.page_id) : ''
  // TAREA 7 (logging): dejar rastro de CADA evento recibido con sus IDs.
  log.info('meta-leadads: webhook leadgen recibido', { page_id: pageId || null, leadgen_id: leadgenId || null, form_id: v.form_id ?? null })
  if (!leadgenId || !pageId) { log.warn('meta-leadads: evento sin leadgen_id o page_id; descartado'); return }

  // TAREA 3: enrutar al tenant por page_id (denormalizado en el control-plane).
  const clinica = await control.clinica.findFirst({
    where: { metaPageId: pageId, metaLeadAdsEnabled: true, activo: true },
    select: { dbName: true, slug: true },
  })
  if (!clinica) { log.warn('meta-leadads: sin clínica activa para page_id; descartado', { page_id: pageId }); return }

  const db = tenantClient(clinica.dbName)
  const cfg = await getMetaLeadAdsConfig(db)
  if (!cfg.enabled || !cfg.pageToken) { log.warn('meta-leadads: clínica sin token de página; descartado', { tenant: clinica.slug }); return }

  // TAREA 4/5: fetch + mapeo + dedup/ingesta (mismo pipeline que el reproceso).
  const res = await ejecutarPipeline(db, { leadgenId, pageToken: cfg.pageToken, pageId, formId: v.form_id, adId: v.ad_id, adsetId: v.adgroup_id, campaignId: v.campaign_id })
  if (res.resultado === 'error') {
    // Antes el fallo era silencioso (Meta reportaba éxito y no aparecía nada). Ahora
    // se registra el error de Graph con code/subcode y el tenant resuelto.
    const e = res.graphError
    log.error('meta-leadads: Graph fetch FALLÓ', { page_id: pageId, leadgen_id: leadgenId, form_id: v.form_id ?? null, tenant: clinica.slug, graphStatus: res.graphStatus, code: e?.code, subcode: e?.subcode, message: e?.message })
    return
  }
  await registrarLeadAdsRecibido(db, { leadgenId, leadId: res.leadId, duplicado: res.resultado === 'duplicado' })
  log.info('meta-leadads: lead procesado', { leadgen_id: leadgenId, tenant: clinica.slug, lead_id: res.leadId ?? null, resultado: res.resultado, noReconocidos: res.mapeo?.noReconocidos ?? [] })
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
// Usa la config Meta del TENANT actual (metaPageId/metaPageAccessToken). Devuelve
// el diagnóstico completo (request sin token, status, error con code/subcode,
// field_data crudo, mapeo con noReconocidos y el lead resultante).
export interface ReprocesoResult {
  leadgenId: string
  graphRequest: string
  graphStatus: number
  graphError: GraphError | null
  fieldDataCrudo?: FieldDatum[]
  mapeo?: PipelineResult['mapeo']
  resultado: 'creado' | 'duplicado' | 'error'
  leadId?: string
  lead?: unknown
  configError?: string // faltó page id/token en la clínica (no es error de Graph)
}
export async function reprocesarLead(db: ReturnType<typeof tenantClient>, leadgenId: string): Promise<ReprocesoResult> {
  const id = String(leadgenId ?? '').trim()
  const vacio: ReprocesoResult = { leadgenId: id, graphRequest: '', graphStatus: 0, graphError: null, resultado: 'error' }
  if (!id) return { ...vacio, configError: 'Falta el leadgenId.' }
  const cfg = await getMetaLeadAdsConfig(db)
  if (!cfg.pageToken) return { ...vacio, configError: 'La clínica no tiene token de página configurado (cargalo en esta pantalla).' }

  const p = await ejecutarPipeline(db, { leadgenId: id, pageToken: cfg.pageToken, pageId: cfg.pageId ?? undefined })
  if (p.resultado !== 'error' && p.leadId) {
    await registrarLeadAdsRecibido(db, { leadgenId: id, leadId: p.leadId, duplicado: p.resultado === 'duplicado' })
  }
  // Re-lee el lead completo para inspección (ingestarLeadMeta a veces devuelve solo el id).
  const lead = p.leadId ? await db.lead.findUnique({ where: { id: p.leadId } }) : null
  return { leadgenId: id, graphRequest: p.graphRequest, graphStatus: p.graphStatus, graphError: p.graphError, fieldDataCrudo: p.fieldDataCrudo, mapeo: p.mapeo, resultado: p.resultado, leadId: p.leadId, lead }
}

function safeJson(s: string): unknown { try { return JSON.parse(s) } catch { return s } }

// ── Backfill del nombre del formulario para leads de Meta históricos ──────────
// Para leads con leadgenId y sin formularioNombre: toma el form_id del historial de
// ingresos si está, o lo re-consulta a Graph por el leadgen_id (funciona ≤90 días;
// los más viejos Meta ya no los devuelve). Resuelve el nombre y lo guarda. Con
// `dry` no escribe: solo devuelve el conteo por formulario (los "números").
function formIdDeIngresos(raw: string | null): string | undefined {
  if (!raw) return undefined
  try {
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) for (let i = arr.length - 1; i >= 0; i--) { const f = arr[i]?.formId; if (f) return String(f) }
  } catch { /* ignore */ }
  return undefined
}

// Pool de concurrencia acotada (las llamadas a Graph son el cuello; secuencial no
// termina a tiempo para ~1000 leads).
async function pMap<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0
  const worker = async () => { while (i < items.length) { const idx = i++; await fn(items[idx]) } }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
}

export interface BackfillFormResult {
  total: number; resueltos: number; expirados: number; sinFormulario: number; dry: boolean; rateLimited: boolean
  porFormulario: { formId: string; nombre: string; count: number }[]
  errorFormulario?: string // muestra del último error de Graph al resolver un formulario (diagnóstico)
}
// Backfill best-effort del nombre del formulario. `dias` acota a leads recientes (los
// >90 días Meta ya no los devuelve, y así no se gasta el rate limit de la app). Corta
// si Graph responde rate limit (#4) — se reintenta más tarde.
export async function backfillFormularios(db: ReturnType<typeof tenantClient>, opts: { dry?: boolean; limit?: number; dias?: number } = {}): Promise<BackfillFormResult> {
  const cfg = await getMetaLeadAdsConfig(db)
  if (!cfg.pageToken) throw new Error('La clínica no tiene token de página de Meta configurado.')
  const pageToken = cfg.pageToken
  const leads = await db.lead.findMany({
    where: {
      leadgenId: { not: null }, formularioNombre: null,
      ...(opts.dias ? { createdAt: { gte: new Date(Date.now() - opts.dias * 86400_000) } } : {}),
    },
    select: { id: true, leadgenId: true, ingresos: true },
    orderBy: { createdAt: 'desc' }, // recientes primero (más chance de estar dentro de los 90 días)
    ...(opts.limit ? { take: opts.limit } : {}),
  })
  ultimoErrorFormulario = undefined
  const porForm = new Map<string, { nombre: string; count: number }>()
  let resueltos = 0, expirados = 0, sinFormulario = 0, rateLimited = false
  await pMap(leads, 3, async (l) => {
    if (rateLimited || !l.leadgenId) return
    let formId = formIdDeIngresos(l.ingresos)
    if (!formId) {
      const g = await fetchGraph(l.leadgenId, pageToken, 'form_id')
      if (!g.ok) { if (g.error?.code === 4) rateLimited = true; expirados++; return } // #4 = rate limit; resto = expiró
      if (!g.lead?.form_id) { expirados++; return }
      formId = g.lead.form_id
    }
    const nombre = await traerNombreFormulario(formId, pageToken)
    if (!nombre) { if (/code=4|request limit/i.test(ultimoErrorFormulario ?? '')) rateLimited = true; sinFormulario++; return }
    resueltos++
    const cur = porForm.get(formId) ?? { nombre, count: 0 }; cur.count++; porForm.set(formId, cur)
    if (!opts.dry) await db.lead.update({ where: { id: l.id }, data: { formularioId: formId, formularioNombre: nombre } })
  })
  return {
    total: leads.length, resueltos, expirados, sinFormulario, dry: !!opts.dry, rateLimited,
    porFormulario: [...porForm.entries()].map(([formId, v]) => ({ formId, nombre: v.nombre, count: v.count })).sort((a, b) => b.count - a.count),
    ...(sinFormulario > 0 && ultimoErrorFormulario ? { errorFormulario: ultimoErrorFormulario } : {}),
  }
}
