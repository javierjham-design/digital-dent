import { randomUUID, randomBytes } from 'node:crypto'
import type { TenantClient } from '@/db/tenant'
import { badRequest, notFound } from '@/lib/errors'
import { actorName, type JwtPayload } from '@/services/auth.service'
import { enviarEventoMeta, metaHabilitado, probarConexionMeta, type MetaConfig } from '@/lib/meta'
import { crearCita } from '@/services/citas.service'

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
  origen?: string; campana?: string; externalId?: string
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
  const metaEnviado = Boolean(cfg && metaHabilitado(cfg))

  const lead = await db.lead.create({
    data: {
      nombre, apellido: clean(input.apellido), telefono: clean(input.telefono),
      email: clean(input.email), rut: clean(input.rut), motivo: clean(input.motivo),
      tratamiento: clean(input.tratamiento), piezasReemplazar: clean(input.piezasReemplazar),
      tiempoDesdePerdida: clean(input.tiempoDesdePerdida),
      origen: (input.origen || 'FORMULARIO').toUpperCase(), campana: clean(input.campana),
      externalId: clean(input.externalId),
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
      metaEventId: eventId, metaEnviado,
      notas: { create: { tipo: 'SISTEMA', texto: `Lead recibido · origen ${(input.origen || 'FORMULARIO').toUpperCase()}`, autorNombre: ctx?.autorNombre ?? null, autorId: ctx?.autorId ?? null } },
    },
  })

  // external_id estable para Meta: el que venga, o el RUT, o el id del lead.
  const externalId = lead.externalId || lead.rut || lead.id
  if (!lead.externalId) await db.lead.update({ where: { id: lead.id }, data: { externalId } })

  // Evento "Lead" a Meta (server-side), deduplicado con el Pixel por event_id.
  if (cfg && metaHabilitado(cfg)) {
    void enviarEventoMeta(cfg, {
      eventName: 'Lead', eventId, eventSourceUrl: input.landing ?? null,
      email: lead.email, telefono: lead.telefono, nombre: lead.nombre, apellido: lead.apellido,
      externalId, ctwaClid: lead.ctwaClid, pais: 'cl',
      fbp: lead.fbp, fbc: lead.fbc, ip: lead.ip, userAgent: lead.userAgent,
      custom: { content_name: lead.tratamiento ?? lead.motivo ?? undefined, source: lead.origen },
    })
  }
  return lead
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
  await db.lead.update({ where: { id }, data: { pacienteId, estado: lead.estado === 'PERDIDO' ? lead.estado : 'CONVERTIDO' } })
  await db.leadNota.create({ data: { leadId: id, tipo: 'SISTEMA', texto: creado ? 'Convertido en paciente' : 'Vinculado a paciente existente', autorId: actor.sub, autorNombre: actorName(actor) } })
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
      estado: lead.estado === 'CONVERTIDO' ? lead.estado : 'AGENDADO',
    },
  })
  await db.leadNota.create({ data: { leadId: id, tipo: 'SISTEMA', texto: `Hora agendada: ${cuando}${cita.doctor ? ` · ${cita.doctor}` : ''}`, autorId: actor.sub, autorNombre: actorName(actor) } })
  return { pacienteId, citaId: cita.id, inicio: cita.inicio }
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
  const rawTok = c?.metaCapiToken ?? null
  return {
    metaEnabled: Boolean(c?.metaEnabled), metaPixelId: c?.metaPixelId ?? null,
    hasCapiToken: Boolean(rawTok), capiTokenLen: rawTok ? rawTok.length : 0, capiTokenLast4: rawTok ? rawTok.slice(-4) : null,
    metaTestCode: c?.metaTestCode ?? null, crmToken,
  }
}

// Valida el token de Meta guardado (Pixel + Conversions API) sin enviar eventos.
export async function probarMeta(db: TenantClient) {
  return probarConexionMeta(await getMetaConfig(db))
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
