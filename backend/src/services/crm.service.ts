import { randomUUID, randomBytes } from 'node:crypto'
import type { TenantClient } from '@/db/tenant'
import { badRequest, notFound } from '@/lib/errors'
import { actorName, type JwtPayload } from '@/services/auth.service'
import { enviarEventoMeta, metaHabilitado, type MetaConfig } from '@/lib/meta'

const ESTADOS = ['NUEVO', 'CONTACTADO', 'AGENDADO', 'CONVERTIDO', 'PERDIDO']
const nuevoToken = () => randomBytes(9).toString('base64url')

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export async function getMetaConfig(db: TenantClient): Promise<MetaConfig> {
  const c = await db.configuracion.findUnique({
    where: { id: 'singleton' },
    select: { metaEnabled: true, metaPixelId: true, metaCapiToken: true, metaTestCode: true },
  })
  return { enabled: Boolean(c?.metaEnabled), pixelId: c?.metaPixelId ?? null, capiToken: c?.metaCapiToken ?? null, testCode: c?.metaTestCode ?? null }
}

// ── Listado + detalle ─────────────────────────────────────────────────────────

export async function listarLeads(db: TenantClient, f: { estado?: string; origen?: string; q?: string; desde?: string; hasta?: string }) {
  const where: Record<string, unknown> = {}
  if (f.estado && ESTADOS.includes(f.estado)) where.estado = f.estado
  if (f.origen) where.origen = f.origen
  if (f.desde || f.hasta) where.createdAt = { ...(f.desde ? { gte: new Date(f.desde) } : {}), ...(f.hasta ? { lte: new Date(`${f.hasta}T23:59:59`) } : {}) }
  const leads = await db.lead.findMany({ where, orderBy: { createdAt: 'desc' }, take: 500 })
  const needle = f.q && f.q.trim().length >= 2 ? norm(f.q.trim()) : null
  const filtrados = needle
    ? leads.filter((l) => norm(`${l.nombre} ${l.apellido ?? ''} ${l.telefono ?? ''} ${l.email ?? ''} ${l.campana ?? ''}`).includes(needle))
    : leads
  return filtrados
}

export async function resumenCrm(db: TenantClient) {
  const porEstado = await db.lead.groupBy({ by: ['estado'], _count: { _all: true } })
  const porOrigen = await db.lead.groupBy({ by: ['origen'], _count: { _all: true } })
  const total = porEstado.reduce((s, r) => s + r._count._all, 0)
  return {
    total,
    estados: Object.fromEntries(porEstado.map((r) => [r.estado, r._count._all])),
    origenes: porOrigen.map((r) => ({ origen: r.origen, n: r._count._all })).sort((a, b) => b.n - a.n),
  }
}

export async function obtenerLead(db: TenantClient, id: string) {
  const lead = await db.lead.findUnique({ where: { id }, include: { notas: { orderBy: { createdAt: 'desc' } } } })
  if (!lead) throw notFound('Lead no encontrado')
  return lead
}

// ── Captación (intake público o alta manual) ─────────────────────────────────

export interface CrearLeadInput {
  nombre: string; apellido?: string; telefono?: string; email?: string; rut?: string; motivo?: string
  origen?: string; campana?: string
  utmSource?: string; utmMedium?: string; utmCampaign?: string; utmContent?: string; utmTerm?: string
  fbclid?: string; fbp?: string; fbc?: string; referrer?: string; landing?: string
  eventId?: string
}

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
  const metaEnviado = Boolean(cfg && metaHabilitado(cfg))

  const lead = await db.lead.create({
    data: {
      nombre, apellido: input.apellido?.trim() || null, telefono: input.telefono?.trim() || null,
      email: input.email?.trim() || null, rut: input.rut?.trim() || null, motivo: input.motivo?.trim() || null,
      origen: (input.origen || 'FORMULARIO').toUpperCase(), campana: input.campana?.trim() || null,
      utmSource: input.utmSource || null, utmMedium: input.utmMedium || null, utmCampaign: input.utmCampaign || null,
      utmContent: input.utmContent || null, utmTerm: input.utmTerm || null,
      fbclid: input.fbclid || null, fbp: input.fbp || null, fbc: input.fbc || null,
      referrer: input.referrer || null, landing: input.landing || null,
      ip: ctx?.ip || null, userAgent: ctx?.userAgent || null,
      metaEventId: eventId, metaEnviado,
      notas: { create: { tipo: 'SISTEMA', texto: `Lead recibido · origen ${(input.origen || 'FORMULARIO').toUpperCase()}`, autorNombre: ctx?.autorNombre ?? null, autorId: ctx?.autorId ?? null } },
    },
  })

  // Evento "Lead" a Meta (server-side), deduplicado con el Pixel por event_id.
  if (cfg && metaHabilitado(cfg)) {
    void enviarEventoMeta(cfg, {
      eventName: 'Lead', eventId, eventSourceUrl: input.landing ?? null,
      email: lead.email, telefono: lead.telefono, nombre: lead.nombre, apellido: lead.apellido,
      fbp: lead.fbp, fbc: lead.fbc, ip: lead.ip, userAgent: lead.userAgent,
      custom: { content_name: lead.motivo ?? undefined, source: lead.origen },
    })
  }
  return lead
}

// ── Gestión (admin) ───────────────────────────────────────────────────────────

export async function actualizarLead(db: TenantClient, actor: JwtPayload, id: string, body: Record<string, unknown>) {
  const existing = await db.lead.findUnique({ where: { id }, select: { id: true, estado: true } })
  if (!existing) throw notFound('Lead no encontrado')
  const data: Record<string, unknown> = {}
  for (const k of ['nombre', 'apellido', 'telefono', 'email', 'rut', 'motivo', 'campana', 'responsableId'] as const) {
    if (body[k] !== undefined) data[k] = body[k] ? String(body[k]).trim() : null
  }
  let cambioEstado: string | null = null
  if (typeof body.estado === 'string') {
    if (!ESTADOS.includes(body.estado)) throw badRequest(`Estado inválido. Use: ${ESTADOS.join(', ')}`)
    if (body.estado !== existing.estado) { data.estado = body.estado; cambioEstado = body.estado }
  }
  const lead = await db.lead.update({ where: { id }, data })
  if (cambioEstado) {
    await db.leadNota.create({ data: { leadId: id, tipo: 'ESTADO', texto: `Estado → ${cambioEstado}`, autorId: actor.sub, autorNombre: actorName(actor) } })
  }
  return lead
}

export async function agregarNota(db: TenantClient, actor: JwtPayload, id: string, texto: string) {
  if (!texto?.trim()) throw badRequest('La nota no puede quedar vacía')
  const existing = await db.lead.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw notFound('Lead no encontrado')
  return db.leadNota.create({ data: { leadId: id, tipo: 'NOTA', texto: texto.trim(), autorId: actor.sub, autorNombre: actorName(actor) } })
}

export async function convertirEnPaciente(db: TenantClient, actor: JwtPayload, id: string) {
  const lead = await db.lead.findUnique({ where: { id } })
  if (!lead) throw notFound('Lead no encontrado')
  if (lead.pacienteId) {
    const p = await db.paciente.findUnique({ where: { id: lead.pacienteId }, select: { id: true } })
    if (p) return { pacienteId: p.id, yaExistia: true }
  }
  const ultimo = await db.paciente.findFirst({ orderBy: { numero: 'desc' }, select: { numero: true } })
  const paciente = await db.paciente.create({
    data: {
      numero: Math.max(1000, (ultimo?.numero ?? 999) + 1),
      nombre: lead.nombre, apellido: lead.apellido || '—', telefono: lead.telefono || null,
      email: lead.email || null, rut: lead.rut || null, observaciones: lead.motivo || null, activo: true,
    },
    select: { id: true },
  })
  await db.lead.update({ where: { id }, data: { pacienteId: paciente.id, estado: lead.estado === 'PERDIDO' ? lead.estado : 'CONVERTIDO' } })
  await db.leadNota.create({ data: { leadId: id, tipo: 'SISTEMA', texto: 'Convertido en paciente', autorId: actor.sub, autorNombre: actorName(actor) } })
  return { pacienteId: paciente.id, yaExistia: false }
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
    select: { metaEnabled: true, metaPixelId: true, metaCapiToken: true, metaTestCode: true, crmToken: true },
  })
  let crmToken = c?.crmToken ?? null
  if (!crmToken) { crmToken = nuevoToken(); await db.configuracion.update({ where: { id: 'singleton' }, data: { crmToken } }) }
  return {
    metaEnabled: Boolean(c?.metaEnabled), metaPixelId: c?.metaPixelId ?? null,
    hasCapiToken: Boolean(c?.metaCapiToken), metaTestCode: c?.metaTestCode ?? null, crmToken,
  }
}

export async function guardarConfigCrm(db: TenantClient, body: Record<string, unknown>) {
  const data: Record<string, unknown> = {}
  if (body.metaEnabled !== undefined) data.metaEnabled = Boolean(body.metaEnabled)
  if (body.metaPixelId !== undefined) data.metaPixelId = body.metaPixelId ? String(body.metaPixelId).trim() : null
  if (typeof body.metaCapiToken === 'string' && body.metaCapiToken.trim()) data.metaCapiToken = body.metaCapiToken.trim()
  if (body.metaCapiToken === null || body.metaCapiToken === '') data.metaCapiToken = null
  if (body.metaTestCode !== undefined) data.metaTestCode = body.metaTestCode ? String(body.metaTestCode).trim() : null
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
