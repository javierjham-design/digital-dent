import { randomUUID, randomBytes } from 'node:crypto'
import type { TenantClient } from '@/db/tenant'
import { badRequest, notFound } from '@/lib/errors'
import { actorName, type JwtPayload } from '@/services/auth.service'
import { enviarEventoMeta, metaHabilitado, probarConexionMeta, type MetaConfig, type MetaSendResult,
  enviarEventoCrmMeta, crmMetaHabilitado, probarConexionCrmMeta, type MetaCrmConfig } from '@/lib/meta'
import { encryptNullable, decryptNullable } from '@/lib/crypto'
import { crearCita } from '@/services/citas.service'
import { rangoFechasUtc } from '@/lib/tz'

const ESTADOS = ['NUEVO', 'CONTACTADO', 'AGENDADO', 'CONVERTIDO', 'PERDIDO']
// Etapa del embudo (estado del lead) → nombre del evento de CRM que Meta espera.
// PERDIDO no se emite. NUEVO se emite como "Lead" al crear el lead.
const CRM_ETAPA_EVENTO: Record<string, string> = { NUEVO: 'Lead', CONTACTADO: 'Contactado', AGENDADO: 'Agendado', CONVERTIDO: 'Cliente' }
// Leads "abiertos" que requieren seguimiento; si pasan de N días sin gestión humana, alertan.
const ESTADOS_ABIERTOS = ['NUEVO', 'CONTACTADO']
const DIAS_SIN_GESTION_DEFAULT = 4
const clampDias = (n: unknown) => { const v = Math.round(Number(n)); return Number.isFinite(v) ? Math.min(90, Math.max(1, v)) : DIAS_SIN_GESTION_DEFAULT }
// Umbral de días sin gestión, configurable por clínica (Configuracion.crmDiasSinGestion).
async function getDiasSinGestion(db: TenantClient): Promise<number> {
  const c = await db.configuracion.findUnique({ where: { id: 'singleton' }, select: { crmDiasSinGestion: true } })
  return clampDias(c?.crmDiasSinGestion ?? DIAS_SIN_GESTION_DEFAULT)
}
const nuevoToken = () => randomBytes(9).toString('base64url')

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// ── Campañas ──────────────────────────────────────────────────────────────────
// Clave de campaña de un lead: campaña explícita → utm_campaign → URL de origen
// (landing, normalizada) → '' (sin campaña). Es lo que agrupa/filtra los leads.
function normalizarLanding(url: string): string {
  try { const u = new URL(url); return (u.hostname + u.pathname).replace(/\/+$/, '') || u.hostname } catch { return url.trim() }
}
export function campanaKeyDe(l: { campana?: string | null; utmCampaign?: string | null; landing?: string | null }): string {
  const explicita = clean(l.campana) || clean(l.utmCampaign)
  if (explicita) return explicita
  const land = clean(l.landing)
  return land ? normalizarLanding(land) : ''
}
// Mapa de renombres guardado en la config (JSON). clave de campaña → nombre visible.
async function getCampanasMap(db: TenantClient): Promise<Record<string, string>> {
  const c = await db.configuracion.findUnique({ where: { id: 'singleton' }, select: { crmCampanas: true } })
  if (!c?.crmCampanas) return {}
  try { const o = JSON.parse(c.crmCampanas); return o && typeof o === 'object' ? o as Record<string, string> : {} } catch { return {} }
}
// Etiqueta visible de una campaña: renombre configurado, o la clave tal cual, o
// '(Sin campaña)' cuando el lead no trae ninguna señal de origen.
function etiquetaCampana(key: string, map: Record<string, string>): string {
  if (map[key]) return map[key]
  return key || '(Sin campaña)'
}

export async function getMetaConfig(db: TenantClient): Promise<MetaConfig> {
  const c = await db.configuracion.findUnique({
    where: { id: 'singleton' },
    select: { metaEnabled: true, metaPixelId: true, metaCapiToken: true, metaTestCode: true },
  })
  return { enabled: Boolean(c?.metaEnabled), pixelId: c?.metaPixelId ?? null, capiToken: c?.metaCapiToken ?? null, testCode: c?.metaTestCode ?? null }
}

// Registra el RESULTADO real del envío a Meta en el lead: el flag queda en true
// SÓLO si Meta confirmó la recepción (events_received ≥ 1), y deja una nota de
// confirmación en el timeline (✅ recibido / ⚠️ error). Es el "confirmador".
export async function registrarEnvioMeta(
  db: TenantClient, leadId: string, evento: string, res: MetaSendResult,
  campo: 'metaEnviado' | 'scheduleCapiEnviado',
) {
  try {
    const texto = res.ok
      ? `✅ Meta: evento ${evento} recibido${res.recibidos ? ` (events_received: ${res.recibidos})` : ''}`
      : `⚠️ Meta: no se pudo enviar el evento ${evento} — ${res.error ?? 'error desconocido'}`
    await db.lead.update({
      where: { id: leadId },
      data: {
        ...(campo === 'metaEnviado' ? { metaEnviado: res.ok } : { scheduleCapiEnviado: res.ok }),
        notas: { create: { tipo: 'SISTEMA', texto } },
      },
    })
  } catch { /* best-effort: no rompe la operación */ }
}

// ── Evento "Schedule" a Meta (system_generated) ───────────────────────────────
// Se dispara cuando un lead pasa a AGENDADO (desde el CRM o marcado a mano) y en
// el backfill. Idempotente: no reenvía si scheduleCapiEnviado ya es true.
// Reutiliza EXACTAMENTE el helper/token/dataset/user_data del evento Lead.
type ScheduleLead = {
  id: string; email: string | null; telefono: string | null; nombre: string; apellido: string | null
  rut: string | null; externalId: string | null; fbp: string | null; fbc: string | null; ctwaClid: string | null
  leadgenId: string | null
  landing: string | null; ip: string | null; userAgent: string | null; tratamiento: string | null
  utmCampaign: string | null; utmTerm: string | null; utmContent: string | null
  fechaAgenda: Date | null; ultimaGestionAt: Date; updatedAt: Date
  scheduleEventId: string | null; scheduleCapiEnviado: boolean
}
export type ScheduleOutcome = 'enviado' | 'error' | 'ya' | 'sin-config'

// event_time con clamp: Meta rechaza eventos de más de 7 días → nunca antes de
// (ahora − 6 días). Usa el mayor entre (fechaAgenda ?? ultimaGestionAt ?? updatedAt) y ese piso.
function scheduleEventTime(l: ScheduleLead): number {
  const base = l.fechaAgenda ?? l.ultimaGestionAt ?? l.updatedAt ?? new Date()
  const baseSec = Math.floor(new Date(base).getTime() / 1000)
  const pisoSec = Math.floor(Date.now() / 1000) - 6 * 86400
  return Math.max(baseSec, pisoSec)
}

export async function dispararScheduleMeta(db: TenantClient, lead: ScheduleLead, cfg?: MetaConfig): Promise<ScheduleOutcome> {
  if (lead.scheduleCapiEnviado) return 'ya' // idempotencia
  const conf = cfg ?? await getMetaConfig(db)
  if (!metaHabilitado(conf)) return 'sin-config'
  // event_id estable para deduplicar reintentos (y con el Pixel si existiera).
  const eventId = lead.scheduleEventId || `sched_${lead.id}`
  if (eventId !== lead.scheduleEventId) {
    await db.lead.update({ where: { id: lead.id }, data: { scheduleEventId: eventId } }).catch(() => {})
  }
  const externalId = lead.externalId || lead.rut || lead.id
  const res = await enviarEventoMeta(conf, {
    eventName: 'Schedule', eventId, actionSource: 'system_generated', eventTime: scheduleEventTime(lead),
    eventSourceUrl: lead.landing ?? null,
    email: lead.email, telefono: lead.telefono, nombre: lead.nombre, apellido: lead.apellido,
    externalId, ctwaClid: lead.ctwaClid, pais: 'cl', fbp: lead.fbp, fbc: lead.fbc,
    // Si el lead vino del Formulario Meta, ata el Schedule a su leadgen_id
    // (habilita "Leads de conversión"). Los leads de la landing van sin esto.
    leadId: lead.leadgenId ?? undefined,
    ip: lead.ip, userAgent: lead.userAgent,
    custom: {
      tratamiento: lead.tratamiento ?? undefined, campaign_id: lead.utmCampaign ?? undefined,
      adset_id: lead.utmTerm ?? undefined, ad_id: lead.utmContent ?? undefined,
    },
  })
  // Deja el flag/nota (confirmador). Si falla, scheduleCapiEnviado queda en false para reintento.
  await registrarEnvioMeta(db, lead.id, 'Schedule', res, 'scheduleCapiEnviado')
  return res.ok ? 'enviado' : 'error'
}

// ── Integración de CRM con Meta (eventos de etapa / "Leads de conversión") ─────
// Emisor NUEVO e independiente del CAPI web. Cada clínica lo activa con su propio
// dataset + token (multi-tenant, nada hardcodeado). Emite un evento por CADA
// cambio de etapa del embudo, atado al leadgen_id cuando existe.
export async function getMetaCrmConfig(db: TenantClient): Promise<MetaCrmConfig> {
  const c = await db.configuracion.findUnique({
    where: { id: 'singleton' },
    select: { metaCrmEnabled: true, metaCrmDatasetId: true, metaCrmAccessToken: true, metaTestCode: true },
  })
  return {
    enabled: Boolean(c?.metaCrmEnabled),
    datasetId: c?.metaCrmDatasetId ?? null,
    accessToken: decryptNullable(c?.metaCrmAccessToken ?? null), // token en claro solo en memoria
    testCode: c?.metaTestCode ?? null,
  }
}

// Emite el evento de la etapa al dataset de CRM de la clínica. Idempotente por
// etapa (metaCrmEtapas: CSV de eventos ya enviados). Best-effort: nunca rompe la
// operación principal ni loguea PII. Si Meta falla, no marca la etapa → se puede
// reintentar. Se llama con `void` desde los puntos de cambio de estado.
export async function dispararEtapaCrmMeta(db: TenantClient, leadId: string, eventName: string, cfg?: MetaCrmConfig): Promise<'enviado' | 'error' | 'ya' | 'sin-config'> {
  const conf = cfg ?? await getMetaCrmConfig(db)
  if (!crmMetaHabilitado(conf)) return 'sin-config'
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: { id: true, email: true, telefono: true, leadgenId: true, metaCrmEtapas: true, ultimaGestionAt: true, updatedAt: true, createdAt: true },
  })
  if (!lead) return 'sin-config'
  const enviadas = (lead.metaCrmEtapas ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (enviadas.includes(eventName)) return 'ya' // idempotencia

  // event_time = momento del cambio de etapa, con clamp ≥ now−6d (Meta lo exige).
  const base = lead.ultimaGestionAt ?? lead.updatedAt ?? lead.createdAt ?? new Date()
  const eventTime = Math.max(Math.floor(new Date(base).getTime() / 1000), Math.floor(Date.now() / 1000) - 6 * 86400)

  const res = await enviarEventoCrmMeta(conf, { eventName, eventTime, leadId: lead.leadgenId, email: lead.email, telefono: lead.telefono })
  if (res.ok) {
    await db.lead.update({ where: { id: lead.id }, data: { metaCrmEtapas: [...enviadas, eventName].join(',') } }).catch(() => {})
    await db.leadNota.create({ data: { leadId: lead.id, tipo: 'SISTEMA', texto: `Meta CRM: etapa "${eventName}" enviada al dataset.` } }).catch(() => {})
    return 'enviado'
  }
  return 'error'
}

// ── Listado + detalle ─────────────────────────────────────────────────────────

export async function listarLeads(db: TenantClient, f: { estado?: string; origen?: string; campana?: string; q?: string; desde?: string; hasta?: string }) {
  const where: Record<string, unknown> = {}
  if (f.estado && ESTADOS.includes(f.estado)) where.estado = f.estado
  if (f.origen) where.origen = f.origen
  // Rango de fechas interpretado en hora de la clínica (America/Santiago), no en
  // UTC: un lead creado a las 22:00 hora Chile cuenta en el día correcto.
  if (f.desde || f.hasta) where.createdAt = rangoFechasUtc(f.desde, f.hasta)
  const [leads, campanasMap, dias] = await Promise.all([
    db.lead.findMany({ where, orderBy: { createdAt: 'desc' }, take: 500 }),
    getCampanasMap(db),
    getDiasSinGestion(db),
  ])
  const needle = f.q && f.q.trim().length >= 2 ? norm(f.q.trim()) : null
  const cutoff = new Date(Date.now() - dias * 86400_000)
  const conCampana = leads.map((l) => {
    const campanaKey = campanaKeyDe(l)
    return {
      ...l,
      campanaKey,
      campanaLabel: etiquetaCampana(campanaKey, campanasMap),
      sinGestionar: ESTADOS_ABIERTOS.includes(l.estado) && l.ultimaGestionAt < cutoff,
    }
  })
  // Filtro por campaña (clave exacta) + búsqueda de texto (incluye la etiqueta de campaña).
  return conCampana.filter((l) => {
    if (f.campana != null && f.campana !== '' && l.campanaKey !== f.campana) return false
    if (needle && !norm(`${l.nombre} ${l.apellido ?? ''} ${l.telefono ?? ''} ${l.email ?? ''} ${l.campana ?? ''} ${l.campanaLabel}`).includes(needle)) return false
    return true
  })
}

// Lista de campañas presentes (con su etiqueta y conteo) para el filtro y el
// panel de renombres. Escanea los leads del rango (o todos si no se pasa rango).
export async function listarCampanas(db: TenantClient, f?: { desde?: string; hasta?: string }) {
  const where: Record<string, unknown> = {}
  if (f?.desde || f?.hasta) where.createdAt = rangoFechasUtc(f?.desde, f?.hasta)
  const [leads, map] = await Promise.all([
    db.lead.findMany({ where, select: { campana: true, utmCampaign: true, landing: true }, take: 2000 }),
    getCampanasMap(db),
  ])
  const acc = new Map<string, number>()
  for (const l of leads) { const k = campanaKeyDe(l); acc.set(k, (acc.get(k) ?? 0) + 1) }
  return {
    campanas: [...acc.entries()]
      .map(([key, n]) => ({ key, label: etiquetaCampana(key, map), n }))
      .sort((a, b) => b.n - a.n),
  }
}

// Renombra (o restaura) una campaña: guarda/actualiza el mapa en la config. Una
// etiqueta vacía elimina el renombre (vuelve a mostrarse la clave/URL).
export async function renombrarCampana(db: TenantClient, key: string, label: string) {
  const k = (key ?? '').trim()
  if (!k) throw badRequest('Falta la campaña a renombrar')
  const map = await getCampanasMap(db)
  const nombre = (label ?? '').trim()
  if (nombre) map[k] = nombre
  else delete map[k]
  await db.configuracion.update({ where: { id: 'singleton' }, data: { crmCampanas: JSON.stringify(map) } })
  return listarCampanas(db)
}

export async function resumenCrm(db: TenantClient) {
  const dias = await getDiasSinGestion(db)
  const cutoff = new Date(Date.now() - dias * 86400_000)
  const [porEstado, porOrigen, sinGestionar] = await Promise.all([
    db.lead.groupBy({ by: ['estado'], _count: { _all: true } }),
    db.lead.groupBy({ by: ['origen'], _count: { _all: true } }),
    db.lead.count({ where: { estado: { in: ESTADOS_ABIERTOS }, ultimaGestionAt: { lt: cutoff } } }),
  ])
  const total = porEstado.reduce((s, r) => s + r._count._all, 0)
  return {
    total,
    estados: Object.fromEntries(porEstado.map((r) => [r.estado, r._count._all])),
    origenes: porOrigen.map((r) => ({ origen: r.origen, n: r._count._all })).sort((a, b) => b.n - a.n),
    sinGestionar,
    diasSinGestion: dias,
  }
}

export async function obtenerLead(db: TenantClient, id: string) {
  const lead = await db.lead.findUnique({ where: { id }, include: { notas: { orderBy: { createdAt: 'desc' } } } })
  if (!lead) throw notFound('Lead no encontrado')
  return lead
}

// Busca un lead existente que sea la MISMA persona (para no duplicar cuando
// alguien que ya llegó por una campaña/formulario agenda luego por el link
// online). Match por external_id → RUT → teléfono → email → cookies de Meta.
// Devuelve el más reciente no cerrado (dentro de 180 días).
export interface IdentLead { rut?: string | null; telefono?: string | null; email?: string | null; fbp?: string | null; fbc?: string | null; externalId?: string | null }
export async function buscarLeadParaReserva(db: TenantClient, ident: IdentLead) {
  const dig = (ident.telefono ?? '').replace(/\D/g, '')
  const email = ident.email?.trim().toLowerCase() || null
  const desde = new Date(Date.now() - 180 * 24 * 3600_000)
  const candidatos = await db.lead.findMany({
    where: { createdAt: { gte: desde }, estado: { not: 'CONVERTIDO' } },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })
  return candidatos.find((l) =>
    (!!ident.externalId && l.externalId === ident.externalId) ||
    (!!ident.rut && !!l.rut && l.rut === ident.rut) ||
    (!!dig && (l.telefono ?? '').replace(/\D/g, '') === dig) ||
    (!!email && (l.email ?? '').trim().toLowerCase() === email) ||
    (!!ident.fbp && !!l.fbp && l.fbp === ident.fbp) ||
    (!!ident.fbc && !!l.fbc && l.fbc === ident.fbc),
  ) ?? null
}

// ── Captación (intake público o alta manual) ─────────────────────────────────

export interface CrearLeadInput {
  nombre: string; apellido?: string; telefono?: string; email?: string; rut?: string
  motivo?: string; tratamiento?: string; piezasReemplazar?: string; tiempoDesdePerdida?: string
  origen?: string; campana?: string; externalId?: string; leadgenId?: string
  utmSource?: string; utmMedium?: string; utmCampaign?: string; utmContent?: string; utmTerm?: string
  fbclid?: string; ctwaClid?: string; gclid?: string; msclkid?: string; ttclid?: string
  twclid?: string; liFatId?: string; igclid?: string; dclid?: string
  fbp?: string; fbc?: string; referrer?: string; landing?: string; tituloPagina?: string; pantalla?: string; locale?: string
  primeraVisita?: string; ultimaVisita?: string
  eventId?: string
}

const clean = (v?: string | null) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const fecha = (v?: string | null) => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d }

export async function crearLead(
  db: TenantClient,
  input: CrearLeadInput,
  ctx?: { ip?: string; userAgent?: string; autorId?: string; autorNombre?: string; emitirMeta?: boolean },
) {
  const nombre = (input.nombre ?? '').trim()
  if (!nombre) throw badRequest('Falta el nombre del prospecto')
  const eventId = input.eventId?.trim() || randomUUID()
  const emitir = ctx?.emitirMeta !== false

  const cfg = emitir ? await getMetaConfig(db) : null

  const lead = await db.lead.create({
    data: {
      nombre, apellido: clean(input.apellido), telefono: clean(input.telefono),
      email: clean(input.email), rut: clean(input.rut), motivo: clean(input.motivo),
      tratamiento: clean(input.tratamiento), piezasReemplazar: clean(input.piezasReemplazar),
      tiempoDesdePerdida: clean(input.tiempoDesdePerdida),
      origen: (input.origen || 'FORMULARIO').toUpperCase(), campana: clean(input.campana),
      externalId: clean(input.externalId), leadgenId: clean(input.leadgenId),
      utmSource: clean(input.utmSource), utmMedium: clean(input.utmMedium), utmCampaign: clean(input.utmCampaign),
      utmContent: clean(input.utmContent), utmTerm: clean(input.utmTerm),
      fbclid: clean(input.fbclid), ctwaClid: clean(input.ctwaClid), gclid: clean(input.gclid),
      msclkid: clean(input.msclkid), ttclid: clean(input.ttclid), twclid: clean(input.twclid),
      liFatId: clean(input.liFatId), igclid: clean(input.igclid), dclid: clean(input.dclid),
      fbp: clean(input.fbp), fbc: clean(input.fbc),
      referrer: clean(input.referrer), landing: clean(input.landing), tituloPagina: clean(input.tituloPagina),
      pantalla: clean(input.pantalla), locale: clean(input.locale),
      primeraVisita: fecha(input.primeraVisita), ultimaVisita: fecha(input.ultimaVisita),
      ip: ctx?.ip || null, userAgent: ctx?.userAgent || null,
      metaEventId: eventId, metaEnviado: false, // se confirma abajo con la respuesta real de Meta
      notas: { create: { tipo: 'SISTEMA', texto: `Lead recibido · origen ${(input.origen || 'FORMULARIO').toUpperCase()}`, autorNombre: ctx?.autorNombre ?? null, autorId: ctx?.autorId ?? null } },
    },
  })

  // external_id estable para Meta: el que venga, o el RUT, o el id del lead.
  const externalId = lead.externalId || lead.rut || lead.id
  if (!lead.externalId) await db.lead.update({ where: { id: lead.id }, data: { externalId } })

  // Evento "Lead" a Meta (server-side), deduplicado con el Pixel por event_id.
  // Se registra el RESULTADO real (confirmador) sin bloquear la respuesta.
  if (cfg && metaHabilitado(cfg)) {
    void enviarEventoMeta(cfg, {
      eventName: 'Lead', eventId, eventSourceUrl: input.landing ?? null,
      email: lead.email, telefono: lead.telefono, nombre: lead.nombre, apellido: lead.apellido,
      externalId, ctwaClid: lead.ctwaClid, pais: 'cl',
      fbp: lead.fbp, fbc: lead.fbc, ip: lead.ip, userAgent: lead.userAgent,
      custom: { content_name: lead.tratamiento ?? lead.motivo ?? undefined, source: lead.origen },
    }).then((res) => registrarEnvioMeta(db, lead.id, 'Lead', res, 'metaEnviado'))
  }

  // Etapa inicial del embudo en el CRM de Meta ("Lead"). Canal aparte del CAPI web
  // (dataset propio de la clínica); si el CRM no está activo, es un no-op silencioso.
  void dispararEtapaCrmMeta(db, lead.id, 'Lead')
  return lead
}

// ── Ingesta del Formulario Instantáneo de Meta (Instant Form, vía Make) ───────
// Los IDs de campaña/adset/ad se guardan en utm* (igual que la landing). El
// leadgen_id es la llave que luego ata el Schedule → "Leads de conversión".
export interface IngestaMetaInput {
  nombre: string; apellido?: string; telefono?: string; email?: string; rut?: string
  motivo?: string; tratamiento?: string
  leadgenId: string; formId?: string; adId?: string; adsetId?: string; campaignId?: string; pageId?: string
}
export async function ingestarLeadMeta(db: TenantClient, input: IngestaMetaInput, ctx?: { ip?: string; userAgent?: string }) {
  const leadgenId = clean(input.leadgenId)
  if (!leadgenId) throw badRequest('Falta el leadgenId del formulario Meta.')
  const utmCampaign = clean(input.campaignId), utmTerm = clean(input.adsetId), utmContent = clean(input.adId)

  // Dedup/reconciliación: si la persona ya existe (WhatsApp/landing/otro canal), NO
  // se duplica; se completa el leadgenId y los datos faltantes en el lead existente.
  const existente = await buscarLeadParaReserva(db, { telefono: input.telefono, email: input.email, rut: input.rut })
  if (existente) {
    const data: Record<string, unknown> = {
      notas: { create: { tipo: 'SISTEMA', texto: `Formulario Meta reconciliado con lead existente (leadgen ${leadgenId}${input.formId ? `, form ${input.formId}` : ''}).` } },
    }
    if (!existente.leadgenId) data.leadgenId = leadgenId // atar la llave sin pisar otra existente
    if (!existente.telefono && clean(input.telefono)) data.telefono = clean(input.telefono)
    if (!existente.email && clean(input.email)) data.email = clean(input.email)
    if (!existente.rut && clean(input.rut)) data.rut = clean(input.rut)
    if (!existente.apellido && clean(input.apellido)) data.apellido = clean(input.apellido)
    if (!existente.utmCampaign && utmCampaign) data.utmCampaign = utmCampaign
    if (!existente.utmTerm && utmTerm) data.utmTerm = utmTerm
    if (!existente.utmContent && utmContent) data.utmContent = utmContent
    const lead = await db.lead.update({ where: { id: existente.id }, data })
    return { lead, reconciliado: true }
  }

  // Nuevo lead del formulario Meta. NO se emite el evento "Lead" por CAPI: Meta ya
  // lo contó al enviarse el formulario (evitar doble conteo). El evento Schedule se
  // dispara luego, al pasar a AGENDADO, ya atado al leadgen_id.
  const lead = await crearLead(db, {
    nombre: input.nombre, apellido: input.apellido, telefono: input.telefono, email: input.email, rut: input.rut,
    motivo: input.motivo, tratamiento: input.tratamiento,
    origen: 'META_FORM', leadgenId,
    utmSource: 'meta', utmMedium: 'paid',
    utmCampaign: utmCampaign ?? undefined, utmTerm: utmTerm ?? undefined, utmContent: utmContent ?? undefined,
  }, { ip: ctx?.ip, userAgent: ctx?.userAgent, emitirMeta: false })
  return { lead, reconciliado: false }
}

// ── Gestión (admin) ───────────────────────────────────────────────────────────

export async function actualizarLead(db: TenantClient, actor: JwtPayload, id: string, body: Record<string, unknown>) {
  const existing = await db.lead.findUnique({ where: { id }, select: { id: true, estado: true } })
  if (!existing) throw notFound('Lead no encontrado')
  const data: Record<string, unknown> = {}
  for (const k of ['nombre', 'apellido', 'telefono', 'email', 'rut', 'motivo', 'tratamiento', 'piezasReemplazar', 'tiempoDesdePerdida', 'campana', 'agendaFuente', 'responsableId'] as const) {
    if (body[k] !== undefined) data[k] = body[k] ? String(body[k]).trim() : null
  }
  if (body.fechaAgenda !== undefined) { const d = body.fechaAgenda ? new Date(String(body.fechaAgenda)) : null; data.fechaAgenda = d && !Number.isNaN(d.getTime()) ? d : null }
  if (body.asistio !== undefined) data.asistio = body.asistio === null ? null : Boolean(body.asistio)
  data.ultimaGestionAt = new Date() // toda edición manual cuenta como gestión
  let cambioEstado: string | null = null
  if (typeof body.estado === 'string') {
    if (!ESTADOS.includes(body.estado)) throw badRequest(`Estado inválido. Use: ${ESTADOS.join(', ')}`)
    if (body.estado !== existing.estado) { data.estado = body.estado; cambioEstado = body.estado }
  }
  const lead = await db.lead.update({ where: { id }, data })
  if (cambioEstado) {
    await db.leadNota.create({ data: { leadId: id, tipo: 'ESTADO', texto: `Estado → ${cambioEstado}`, autorId: actor.sub, autorNombre: actorName(actor) } })
  }
  // Si pasó a AGENDADO (marca manual), dispara Schedule a Meta (idempotente, no bloquea).
  if (cambioEstado === 'AGENDADO') void dispararScheduleMeta(db, lead as ScheduleLead)
  // Evento de etapa al CRM de Meta por CADA cambio de estado (Contactado/Agendado/Cliente).
  const eventoCrm = cambioEstado ? CRM_ETAPA_EVENTO[cambioEstado] : null
  if (eventoCrm) void dispararEtapaCrmMeta(db, id, eventoCrm)
  return lead
}

export async function agregarNota(db: TenantClient, actor: JwtPayload, id: string, texto: string) {
  if (!texto?.trim()) throw badRequest('La nota no puede quedar vacía')
  const existing = await db.lead.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw notFound('Lead no encontrado')
  const nota = await db.leadNota.create({ data: { leadId: id, tipo: 'NOTA', texto: texto.trim(), autorId: actor.sub, autorNombre: actorName(actor) } })
  await db.lead.update({ where: { id }, data: { ultimaGestionAt: new Date() } }) // agregar nota = gestión
  return nota
}

// Datos del lead que necesitamos para resolver/crear su paciente.
type LeadPaciente = { pacienteId: string | null; nombre: string; apellido: string | null; telefono: string | null; email: string | null; rut: string | null; motivo: string | null }

// Reutiliza el paciente del lead: por vínculo previo, por RUT o por teléfono; si
// no hay coincidencia, lo crea (numeración desde 1000). Devuelve si fue creado.
async function pacienteDesdeLead(db: TenantClient, lead: LeadPaciente): Promise<{ id: string; creado: boolean }> {
  if (lead.pacienteId) {
    const p = await db.paciente.findUnique({ where: { id: lead.pacienteId }, select: { id: true } })
    if (p) return { id: p.id, creado: false }
  }
  if (lead.rut) {
    const p = await db.paciente.findFirst({ where: { rut: lead.rut }, select: { id: true } })
    if (p) return { id: p.id, creado: false }
  }
  const dig = (lead.telefono ?? '').replace(/\D/g, '')
  if (dig) {
    const cands = await db.paciente.findMany({ where: { telefono: { not: null } }, select: { id: true, telefono: true } })
    const hit = cands.find((c) => (c.telefono ?? '').replace(/\D/g, '') === dig)
    if (hit) return { id: hit.id, creado: false }
  }
  const ultimo = await db.paciente.findFirst({ orderBy: { numero: 'desc' }, select: { numero: true } })
  const p = await db.paciente.create({
    data: {
      numero: Math.max(1000, (ultimo?.numero ?? 999) + 1),
      nombre: lead.nombre, apellido: lead.apellido || '—', telefono: lead.telefono || null,
      email: lead.email || null, rut: lead.rut || null, observaciones: lead.motivo || null, activo: true,
    },
    select: { id: true },
  })
  return { id: p.id, creado: true }
}

export async function convertirEnPaciente(db: TenantClient, actor: JwtPayload, id: string) {
  const lead = await db.lead.findUnique({ where: { id } })
  if (!lead) throw notFound('Lead no encontrado')
  const { id: pacienteId, creado } = await pacienteDesdeLead(db, lead)
  if (!creado && lead.pacienteId === pacienteId) return { pacienteId, yaExistia: true }
  await db.lead.update({ where: { id }, data: { pacienteId, estado: lead.estado === 'PERDIDO' ? lead.estado : 'CONVERTIDO', ultimaGestionAt: new Date() } })
  await db.leadNota.create({ data: { leadId: id, tipo: 'SISTEMA', texto: creado ? 'Convertido en paciente' : 'Vinculado a paciente existente', autorId: actor.sub, autorNombre: actorName(actor) } })
  // Etapa final del embudo en el CRM de Meta ("Cliente"), salvo leads perdidos.
  if (lead.estado !== 'PERDIDO') void dispararEtapaCrmMeta(db, id, 'Cliente')
  return { pacienteId, yaExistia: !creado }
}

export interface AgendarLeadInput { doctorId: string; fecha: string; duracion?: number; tipo?: string; notas?: string; sobrecupo?: boolean }

// Agenda una hora para el lead: crea/reutiliza el paciente y crea la cita (con
// control de solapamiento y bloqueos vía crearCita), y deja el lead vinculado y
// en estado AGENDADO con la fecha de la cita.
export async function agendarLead(db: TenantClient, actor: JwtPayload, id: string, input: AgendarLeadInput) {
  const lead = await db.lead.findUnique({ where: { id } })
  if (!lead) throw notFound('Lead no encontrado')
  if (!input.doctorId || !input.fecha) throw badRequest('Selecciona profesional, fecha y hora')

  const { id: pacienteId } = await pacienteDesdeLead(db, lead)
  const cita = await crearCita(db, actorName(actor), {
    pacienteId, doctorId: input.doctorId, fecha: input.fecha,
    duracion: input.duracion, tipo: input.tipo || lead.tratamiento || 'CONSULTA',
    notas: input.notas ?? (lead.motivo || null), sobrecupo: input.sobrecupo,
  })

  const cuando = new Date(cita.inicio).toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'medium', timeStyle: 'short' })
  await db.lead.update({
    where: { id },
    data: {
      pacienteId, citaId: cita.id, fechaAgenda: new Date(cita.inicio), agendaFuente: 'CRM',
      estado: lead.estado === 'CONVERTIDO' ? lead.estado : 'AGENDADO', ultimaGestionAt: new Date(),
    },
  })
  await db.leadNota.create({ data: { leadId: id, tipo: 'SISTEMA', texto: `Hora agendada: ${cuando}${cita.doctor ? ` · ${cita.doctor}` : ''}`, autorId: actor.sub, autorNombre: actorName(actor) } })

  // Evento "Schedule" a Meta (conversión: el lead agendó, aunque sea por recepción).
  // Idempotente y sin bloquear la respuesta; usa la fecha de la cita como event_time.
  void dispararScheduleMeta(db, { ...lead, fechaAgenda: new Date(cita.inicio) } as ScheduleLead)
  // Etapa "Agendado" al CRM de Meta (la de optimización). Idempotente; no bloquea.
  void dispararEtapaCrmMeta(db, id, 'Agendado')
  return { pacienteId, citaId: cita.id, inicio: cita.inicio }
}

// ── Backfill (one-off): reenvía Schedule a los AGENDADO pendientes ────────────
// Omite los que no tienen NINGUNA clave de match usable (email/teléfono/fbc/fbp/
// externalId real). Idempotente: dispararScheduleMeta salta los ya enviados.
export interface BackfillScheduleResumen {
  total: number; enviados: number; omitidos: number; errores: number
  omitidosIds: string[]
}
export async function backfillSchedule(db: TenantClient): Promise<BackfillScheduleResumen> {
  const cfg = await getMetaConfig(db)
  if (!metaHabilitado(cfg)) throw badRequest('Meta no está configurado o habilitado en esta clínica.')
  const leads = await db.lead.findMany({ where: { estado: 'AGENDADO', scheduleCapiEnviado: false } })
  let enviados = 0, omitidos = 0, errores = 0
  const omitidosIds: string[] = []
  for (const l of leads) {
    // externalId sintetizado (= id del lead) NO cuenta como clave real de match.
    const externalReal = l.externalId && l.externalId !== l.id ? l.externalId : null
    const tieneMatch = Boolean(l.email || l.telefono || l.fbc || l.fbp || externalReal)
    if (!tieneMatch) { omitidos++; omitidosIds.push(l.id); continue }
    const r = await dispararScheduleMeta(db, l as ScheduleLead, cfg)
    if (r === 'enviado') enviados++
    else if (r === 'error' || r === 'sin-config') errores++
    // 'ya' no debería ocurrir (el where filtra scheduleCapiEnviado=false), pero no suma a nada.
  }
  return { total: leads.length, enviados, omitidos, errores, omitidosIds }
}

export async function eliminarLead(db: TenantClient, id: string) {
  const existing = await db.lead.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw notFound('Lead no encontrado')
  await db.lead.delete({ where: { id } })
}

// ── Config de Meta / captación (admin) ────────────────────────────────────────

// Devuelve la config y GENERA el crmToken si falta (para el link del formulario).
export async function obtenerConfigCrm(db: TenantClient) {
  const c = await db.configuracion.findUnique({
    where: { id: 'singleton' },
    select: { metaEnabled: true, metaPixelId: true, metaCapiToken: true, metaTestCode: true,
      metaCrmEnabled: true, metaCrmDatasetId: true, metaCrmAccessToken: true, crmToken: true, crmDiasSinGestion: true },
  })
  let crmToken = c?.crmToken ?? null
  if (!crmToken) { crmToken = nuevoToken(); await db.configuracion.update({ where: { id: 'singleton' }, data: { crmToken } }) }
  const rawTok = c?.metaCapiToken ?? null
  // Token de CRM: encriptado en DB → nunca se devuelve en claro. Solo se expone si
  // existe y sus últimos 4 (descifrando en memoria) para que la UI dé feedback.
  const crmTok = decryptNullable(c?.metaCrmAccessToken ?? null)
  return {
    metaEnabled: Boolean(c?.metaEnabled), metaPixelId: c?.metaPixelId ?? null,
    hasCapiToken: Boolean(rawTok), capiTokenLen: rawTok ? rawTok.length : 0, capiTokenLast4: rawTok ? rawTok.slice(-4) : null,
    metaTestCode: c?.metaTestCode ?? null, crmToken,
    metaCrmEnabled: Boolean(c?.metaCrmEnabled), metaCrmDatasetId: c?.metaCrmDatasetId ?? null,
    hasCrmToken: Boolean(crmTok), crmTokenLast4: crmTok ? crmTok.slice(-4) : null,
    diasSinGestion: clampDias(c?.crmDiasSinGestion ?? DIAS_SIN_GESTION_DEFAULT),
  }
}

// Valida el token de Meta guardado (Pixel + Conversions API) sin enviar eventos.
export async function probarMeta(db: TenantClient) {
  return probarConexionMeta(await getMetaConfig(db))
}

// Valida la integración de CRM (dataset + token) enviando un evento de prueba.
export async function probarMetaCrm(db: TenantClient) {
  return probarConexionCrmMeta(await getMetaCrmConfig(db))
}

export async function guardarConfigCrm(db: TenantClient, body: Record<string, unknown>) {
  const data: Record<string, unknown> = {}
  if (body.metaEnabled !== undefined) data.metaEnabled = Boolean(body.metaEnabled)
  if (body.metaPixelId !== undefined) data.metaPixelId = body.metaPixelId ? String(body.metaPixelId).trim() : null
  if (typeof body.metaCapiToken === 'string' && body.metaCapiToken.trim()) data.metaCapiToken = body.metaCapiToken.trim()
  if (body.metaCapiToken === null || body.metaCapiToken === '') data.metaCapiToken = null
  if (body.metaTestCode !== undefined) data.metaTestCode = body.metaTestCode ? String(body.metaTestCode).trim() : null
  // Integración de CRM (dataset + token propios de la clínica). El token se guarda
  // ENCRIPTADO; solo se reescribe si viene un valor no vacío (write-only en la UI).
  if (body.metaCrmEnabled !== undefined) data.metaCrmEnabled = Boolean(body.metaCrmEnabled)
  if (body.metaCrmDatasetId !== undefined) data.metaCrmDatasetId = body.metaCrmDatasetId ? String(body.metaCrmDatasetId).trim() : null
  if (typeof body.metaCrmAccessToken === 'string' && body.metaCrmAccessToken.trim()) data.metaCrmAccessToken = encryptNullable(body.metaCrmAccessToken.trim())
  if (body.metaCrmAccessToken === null || body.metaCrmAccessToken === '') data.metaCrmAccessToken = null
  if (body.diasSinGestion !== undefined) data.crmDiasSinGestion = clampDias(body.diasSinGestion)
  await db.configuracion.update({ where: { id: 'singleton' }, data })
  return obtenerConfigCrm(db)
}

// Config pública del formulario hospedado (branding + Pixel ID). Valida el token.
export async function obtenerFormPublico(db: TenantClient, token: string) {
  const c = await db.configuracion.findUnique({
    where: { id: 'singleton' },
    select: { crmToken: true, nombre: true, logoUrl: true, direccion: true, telefono: true, ciudad: true, metaEnabled: true, metaPixelId: true },
  })
  if (!c || !c.crmToken || c.crmToken !== token) return null
  return {
    clinica: { nombre: c.nombre, logoUrl: c.logoUrl, direccion: c.direccion, telefono: c.telefono, ciudad: c.ciudad },
    pixelId: c.metaEnabled ? c.metaPixelId : null,
  }
}

// Valida el crmToken de una clínica (para el intake público).
export async function tokenCrmValido(db: TenantClient, token: string): Promise<boolean> {
  const c = await db.configuracion.findUnique({ where: { id: 'singleton' }, select: { crmToken: true } })
  return Boolean(c?.crmToken && c.crmToken === token)
}
