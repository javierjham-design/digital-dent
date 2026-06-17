import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { badRequest, conflict, notFound } from '@/lib/errors'
import { auditAdmin } from '@/lib/audit-admin'
import { encryptNullable } from '@/lib/crypto'
import { getPlanes } from '@/lib/plans'
import {
  calcularProximoCobro, getEstadoPago, precioMensualEfectivo, type CicloFacturacion, type PlanPriceMap,
} from '@/lib/billing'

export interface AuditCtx { actorId: string; actorEmail: string; ip?: string | null; userAgent?: string | null }

const DEFAULT_ADMIN_USERNAME = 'Administrador'
const PLANES_VALIDOS = ['TRIAL', 'BASICO', 'PRO']
const CICLOS_VALIDOS = ['MENSUAL', 'ANUAL']
const METODOS_PAGO = ['TRANSFERENCIA', 'WEBPAY', 'EFECTIVO', 'OTRO']

const RESERVED_SLUGS = new Set([
  'super-admin', 'www', 'admin', 'api', 'app', 'mail', 'login', 'auth', 'panel',
  'dashboard', 'support', 'soporte', 'help', 'ayuda', 'blog', 'docs', 'status', 'cdn', 'assets', 'static',
])

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60)
}

function generarPassword(): string {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = randomBytes(12)
  let out = ''
  for (let i = 0; i < 12; i++) out += charset[bytes[i] % charset.length]
  return out
}

// ── Clínicas ─────────────────────────────────────────────────────────────────

export async function listarClinicas() {
  return prisma.clinica.findMany({
    where: { esDemo: false },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { users: true, pacientes: true, citas: true } } },
  })
}

export async function obtenerClinica(id: string) {
  const c = await prisma.clinica.findUnique({ where: { id } })
  if (!c) throw notFound('Clínica no encontrada')
  return c
}

export async function crearClinica(ctx: AuditCtx, body: {
  clinicaNombre: string; clinicaEmail?: string; clinicaTelefono?: string
  clinicaDireccion?: string; clinicaCiudad?: string; plan?: string; trialDias?: number; slug?: string
}) {
  if (!body.clinicaNombre) throw badRequest('Falta el nombre de la clínica')
  const base = (body.slug ? slugify(body.slug) : slugify(body.clinicaNombre)) || 'clinica'
  if (RESERVED_SLUGS.has(base)) throw badRequest(`El código "${base}" está reservado por la plataforma. Elige otro.`)

  let slug = base
  let i = 1
  while (await prisma.clinica.findUnique({ where: { slug } })) { i++; slug = `${base}-${i}` }

  const plantilla = await prisma.clinica.findUnique({ where: { slug: 'digital-dent' } })
  const prestacionesBase = plantilla ? await prisma.prestacion.findMany({ where: { clinicaId: plantilla.id } }) : []

  const planFinal = body.plan && PLANES_VALIDOS.includes(body.plan) ? body.plan : 'TRIAL'
  let trialHasta: Date | null = null
  if (planFinal === 'TRIAL') {
    const dias = Number(body.trialDias) > 0 ? Number(body.trialDias) : 30
    trialHasta = new Date()
    trialHasta.setDate(trialHasta.getDate() + dias)
  }

  const password = generarPassword()
  const hash = await bcrypt.hash(password, 10)

  const clinica = await prisma.$transaction(async (tx) => {
    const c = await tx.clinica.create({
      data: {
        slug, nombre: body.clinicaNombre, email: body.clinicaEmail ?? '', telefono: body.clinicaTelefono ?? '',
        direccion: body.clinicaDireccion ?? '', ciudad: body.clinicaCiudad ?? 'Temuco', plan: planFinal, trialHasta, activo: true,
      },
    })
    await tx.user.create({
      data: { clinicaId: c.id, name: 'Administrador', username: DEFAULT_ADMIN_USERNAME, email: null, password: hash, role: 'admin', activo: true, passwordChangedAt: null },
    })
    if (prestacionesBase.length > 0) {
      await tx.prestacion.createMany({
        data: prestacionesBase.map((p) => ({ clinicaId: c.id, nombre: p.nombre, descripcion: p.descripcion, precio: p.precio, duracion: p.duracion, categoria: p.categoria, activo: p.activo })),
      })
    }
    return c
  })

  await auditAdmin({ ...ctx, action: 'CREAR_CLINICA', targetType: 'CLINICA', targetId: clinica.id, details: { slug, nombre: clinica.nombre, plan: planFinal } })

  return {
    clinica: { id: clinica.id, slug: clinica.slug, nombre: clinica.nombre },
    credenciales: { usuario: DEFAULT_ADMIN_USERNAME, contrasena: password, url_fallback: `/c/${clinica.slug}/login` },
    prestacionesCopiadas: prestacionesBase.length,
  }
}

export async function actualizarClinica(id: string, body: Record<string, unknown>) {
  const data: Record<string, unknown> = {}
  for (const k of ['nombre', 'rut', 'direccion', 'ciudad', 'telefono', 'email', 'logoUrl', 'mensajeWA', 'plan', 'activo']) {
    if (k in body) data[k] = body[k]
  }
  if ('trialHasta' in body) data.trialHasta = body.trialHasta ? new Date(String(body.trialHasta)) : null
  return prisma.clinica.update({ where: { id }, data })
}

export async function cambiarPlan(ctx: AuditCtx, id: string, body: Record<string, unknown>) {
  if (!PLANES_VALIDOS.includes(String(body.plan))) throw badRequest(`Plan inválido. Use: ${PLANES_VALIDOS.join(', ')}`)
  const data: Record<string, unknown> = { plan: body.plan }
  if (body.cicloFacturacion !== undefined) {
    if (!CICLOS_VALIDOS.includes(String(body.cicloFacturacion))) throw badRequest('cicloFacturacion debe ser MENSUAL o ANUAL')
    data.cicloFacturacion = body.cicloFacturacion
  }
  if (body.precioAcordado !== undefined) {
    if (body.precioAcordado === null) data.precioAcordado = null
    else { const p = Number(body.precioAcordado); if (!Number.isFinite(p) || p < 0) throw badRequest('precioAcordado inválido'); data.precioAcordado = p }
  }
  if (body.proximoCobro !== undefined) data.proximoCobro = body.proximoCobro ? new Date(String(body.proximoCobro)) : null
  if (body.trialHasta !== undefined) data.trialHasta = body.trialHasta ? new Date(String(body.trialHasta)) : null

  if (body.plan !== 'TRIAL' && data.proximoCobro === undefined) {
    const actual = await prisma.clinica.findUnique({ where: { id }, select: { proximoCobro: true } })
    if (!actual?.proximoCobro) {
      const fecha = new Date()
      if ((data.cicloFacturacion ?? 'MENSUAL') === 'ANUAL') fecha.setFullYear(fecha.getFullYear() + 1)
      else fecha.setMonth(fecha.getMonth() + 1)
      data.proximoCobro = fecha
    }
  }
  const clinica = await prisma.clinica.update({ where: { id }, data })
  await auditAdmin({ ...ctx, action: 'CAMBIAR_PLAN', targetType: 'CLINICA', targetId: clinica.id, details: { clinicaSlug: clinica.slug, planNuevo: body.plan } })
  return clinica
}

export async function cambiarEstado(ctx: AuditCtx, id: string, body: { activo: unknown; notasInternas?: string }) {
  if (typeof body.activo !== 'boolean') throw badRequest('activo (boolean) requerido')
  const data: Record<string, unknown> = { activo: body.activo }
  if (typeof body.notasInternas === 'string') data.notasInternas = body.notasInternas
  const clinica = await prisma.clinica.update({ where: { id }, data })
  await auditAdmin({ ...ctx, action: 'CAMBIAR_ESTADO', targetType: 'CLINICA', targetId: clinica.id, details: { clinicaSlug: clinica.slug, activo: body.activo } })
  return clinica
}

export async function extenderTrial(ctx: AuditCtx, id: string, body: { dias?: number; nuevoVencimiento?: string }) {
  const clinica = await prisma.clinica.findUnique({ where: { id } })
  if (!clinica) throw notFound('Clínica no existe')
  let nuevoVencimiento: Date
  if (body.nuevoVencimiento) {
    const d = new Date(body.nuevoVencimiento)
    if (isNaN(d.getTime())) throw badRequest('Fecha inválida')
    nuevoVencimiento = d
  } else {
    const dias = Number(body.dias)
    if (!Number.isFinite(dias) || dias <= 0 || dias > 365) throw badRequest('dias debe ser entre 1 y 365')
    const baseFecha = clinica.trialHasta && clinica.trialHasta.getTime() > Date.now() ? new Date(clinica.trialHasta) : new Date()
    baseFecha.setDate(baseFecha.getDate() + dias)
    nuevoVencimiento = baseFecha
  }
  const data: Record<string, unknown> = { trialHasta: nuevoVencimiento, activo: true }
  if (clinica.plan !== 'TRIAL') data.plan = 'TRIAL'
  const actualizada = await prisma.clinica.update({ where: { id }, data })
  await auditAdmin({ ...ctx, action: 'EXTENDER_TRIAL', targetType: 'CLINICA', targetId: id, details: { clinicaSlug: actualizada.slug, nuevoVencimiento: nuevoVencimiento.toISOString() } })
  return actualizada
}

export async function resetAdminPassword(ctx: AuditCtx, id: string, body: { newPassword?: string; forceChange?: boolean; username?: string }) {
  const username = body.username?.trim() || DEFAULT_ADMIN_USERNAME
  const newPassword = body.newPassword && body.newPassword.length > 0 ? body.newPassword : generarPassword()
  const forceChange = body.forceChange === undefined ? true : Boolean(body.forceChange)
  if (newPassword.length < 8) throw badRequest('La contraseña debe tener al menos 8 caracteres')

  const clinica = await prisma.clinica.findUnique({ where: { id } })
  if (!clinica) throw notFound('Clínica no existe')
  const hash = await bcrypt.hash(newPassword, 10)
  const user = await prisma.user.findFirst({ where: { clinicaId: id, username } })
  let created = false
  if (user) {
    await prisma.user.update({ where: { id: user.id }, data: { password: hash, activo: true, passwordChangedAt: forceChange ? null : new Date() } })
  } else {
    await prisma.user.create({ data: { clinicaId: id, name: username, username, email: null, password: hash, role: 'admin', activo: true, passwordChangedAt: forceChange ? null : new Date() } })
    created = true
  }
  await auditAdmin({ ...ctx, action: 'RESET_PASSWORD', targetType: 'CLINICA', targetId: id, details: { clinicaSlug: clinica.slug, username, forceChange, createdNewUser: created } })
  return { ok: true, clinicaSlug: clinica.slug, username, nuevaPassword: newPassword, forzarCambio: forceChange, creado: created }
}

// ── Pagos de suscripción ─────────────────────────────────────────────────────

export async function listarPagos(id: string) {
  return prisma.pagoSuscripcion.findMany({ where: { clinicaId: id }, orderBy: { fechaPago: 'desc' } })
}

export async function registrarPago(ctx: AuditCtx, id: string, body: Record<string, unknown>) {
  const monto = Number(body.monto)
  if (!Number.isFinite(monto) || monto <= 0) throw badRequest('monto debe ser un número positivo')
  if (monto > 20_000_000) throw badRequest('Monto fuera de rango razonable (máximo $20.000.000)')
  const metodoPago = String(body.metodoPago ?? '')
  if (!METODOS_PAGO.includes(metodoPago)) throw badRequest(`metodoPago debe ser uno de: ${METODOS_PAGO.join(', ')}`)

  const clinica = await prisma.clinica.findUnique({ where: { id } })
  if (!clinica) throw notFound('Clínica no existe')

  const fechaPago = body.fechaPago ? new Date(String(body.fechaPago)) : new Date()
  const ciclo = (clinica.cicloFacturacion as CicloFacturacion) || 'MENSUAL'
  const periodoDesde = body.periodoDesde ? new Date(String(body.periodoDesde))
    : (clinica.proximoCobro && clinica.proximoCobro.getTime() > fechaPago.getTime() ? new Date(clinica.proximoCobro) : new Date(fechaPago))
  const periodoHasta = body.periodoHasta ? new Date(String(body.periodoHasta)) : calcularProximoCobro({ proximoActual: clinica.proximoCobro, fechaPago, ciclo })
  const nuevoProximoCobro = calcularProximoCobro({ proximoActual: clinica.proximoCobro, fechaPago, ciclo })

  const [pago, clinicaActualizada] = await prisma.$transaction([
    prisma.pagoSuscripcion.create({
      data: { clinicaId: id, fechaPago, monto, periodoDesde, periodoHasta, metodoPago, comprobante: body.comprobante ? String(body.comprobante) : null, notas: body.notas ? String(body.notas) : null, registradoPor: ctx.actorId },
    }),
    prisma.clinica.update({ where: { id }, data: { proximoCobro: nuevoProximoCobro, activo: true, plan: clinica.plan === 'TRIAL' ? 'BASICO' : clinica.plan } }),
  ])
  await auditAdmin({ ...ctx, action: 'REGISTRAR_PAGO', targetType: 'PAGO', targetId: pago.id, details: { clinicaSlug: clinicaActualizada.slug, monto, metodoPago } })
  return { ok: true, pago, clinica: clinicaActualizada }
}

export async function eliminarPago(id: string, pagoId: string) {
  const pago = await prisma.pagoSuscripcion.findUnique({ where: { id: pagoId } })
  if (!pago || pago.clinicaId !== id) throw notFound('Pago no existe')
  await prisma.$transaction(async (tx) => {
    await tx.pagoSuscripcion.delete({ where: { id: pagoId } })
    const ultimo = await tx.pagoSuscripcion.findFirst({ where: { clinicaId: id }, orderBy: { periodoHasta: 'desc' } })
    await tx.clinica.update({ where: { id }, data: { proximoCobro: ultimo ? ultimo.periodoHasta : null } })
  })
}

// ── Extras ───────────────────────────────────────────────────────────────────

export async function listarExtras(id: string) {
  return prisma.extraSuscripcion.findMany({ where: { clinicaId: id }, orderBy: { createdAt: 'asc' } })
}

export async function crearExtra(ctx: AuditCtx, id: string, body: Record<string, unknown>) {
  const nombre = String(body.nombre ?? '').trim()
  if (!nombre) throw badRequest('nombre es requerido')
  const monto = Number(body.montoMensual)
  if (!Number.isFinite(monto) || monto < 0) throw badRequest('montoMensual debe ser un número ≥ 0')
  if (monto > 5_000_000) throw badRequest('Monto fuera de rango razonable (máximo $5.000.000/mes)')
  const clinica = await prisma.clinica.findUnique({ where: { id }, select: { slug: true } })
  if (!clinica) throw notFound('Clínica no existe')
  const extra = await prisma.extraSuscripcion.create({
    data: { clinicaId: id, codigo: body.codigo ? String(body.codigo).toUpperCase() : 'OTRO', nombre, montoMensual: monto, notas: body.notas ? String(body.notas) : null },
  })
  await auditAdmin({ ...ctx, action: 'CREAR_EXTRA', targetType: 'EXTRA_SUSCRIPCION', targetId: extra.id, details: { clinicaSlug: clinica.slug, nombre, montoMensual: monto } })
  return extra
}

export async function actualizarExtra(ctx: AuditCtx, id: string, extraId: string, body: Record<string, unknown>) {
  const data: Record<string, unknown> = {}
  if (body.activo !== undefined) data.activo = Boolean(body.activo)
  if (body.nombre !== undefined) { const n = String(body.nombre).trim(); if (!n) throw badRequest('nombre no puede ser vacío'); data.nombre = n }
  if (body.montoMensual !== undefined) { const m = Number(body.montoMensual); if (!Number.isFinite(m) || m < 0 || m > 5_000_000) throw badRequest('montoMensual inválido'); data.montoMensual = m }
  if (body.notas !== undefined) data.notas = body.notas ? String(body.notas) : null
  const r = await prisma.extraSuscripcion.updateMany({ where: { id: extraId, clinicaId: id }, data })
  if (r.count === 0) throw notFound('Extra no existe')
  await auditAdmin({ ...ctx, action: 'EDITAR_EXTRA', targetType: 'EXTRA_SUSCRIPCION', targetId: extraId, details: { clinicaId: id, cambios: data } })
}

export async function eliminarExtra(ctx: AuditCtx, id: string, extraId: string) {
  const r = await prisma.extraSuscripcion.deleteMany({ where: { id: extraId, clinicaId: id } })
  if (r.count === 0) throw notFound('Extra no existe')
  await auditAdmin({ ...ctx, action: 'ELIMINAR_EXTRA', targetType: 'EXTRA_SUSCRIPCION', targetId: extraId, details: { clinicaId: id } })
}

// ── WhatsApp config ──────────────────────────────────────────────────────────

export async function getWhatsapp(id: string) {
  const c = await prisma.clinica.findUnique({
    where: { id },
    select: { waEnabled: true, waTwilioSid: true, waNumero: true, waTemplateSid: true, waHorasAntes: true, waTwilioToken: true },
  })
  if (!c) throw notFound('Clínica no existe')
  return { waEnabled: c.waEnabled, waTwilioSid: c.waTwilioSid, waNumero: c.waNumero, waTemplateSid: c.waTemplateSid, waHorasAntes: c.waHorasAntes, tokenConfigurado: Boolean(c.waTwilioToken) }
}

export async function putWhatsapp(ctx: AuditCtx, id: string, body: Record<string, unknown>) {
  const clinica = await prisma.clinica.findUnique({ where: { id }, select: { slug: true } })
  if (!clinica) throw notFound('Clínica no existe')
  const waEnabled = Boolean(body.waEnabled)
  const waNumero = body.waNumero ? String(body.waNumero).trim() : null
  if (waNumero && !/^\+\d{8,15}$/.test(waNumero)) throw badRequest('waNumero debe estar en formato E.164 (+56912345678)')
  const waTwilioSid = body.waTwilioSid ? String(body.waTwilioSid).trim() : null
  if (waTwilioSid && !/^AC[a-zA-Z0-9]{32}$/.test(waTwilioSid)) throw badRequest('waTwilioSid no parece un Account SID válido (AC...)')
  const waTemplateSid = body.waTemplateSid ? String(body.waTemplateSid).trim() : null
  if (waTemplateSid && !/^HX[a-zA-Z0-9]{32}$/.test(waTemplateSid)) throw badRequest('waTemplateSid no parece un Content SID válido (HX...)')
  const waHorasAntes = Number(body.waHorasAntes)
  if (!Number.isInteger(waHorasAntes) || waHorasAntes < 1 || waHorasAntes > 168) throw badRequest('waHorasAntes debe ser un entero entre 1 y 168')
  if (waEnabled && (!waTwilioSid || !waNumero || !waTemplateSid)) throw badRequest('Para habilitar el servicio se necesitan: Account SID, número emisor y Template SID.')

  const data: Record<string, unknown> = { waEnabled, waTwilioSid, waNumero, waTemplateSid, waHorasAntes }
  if (typeof body.waTwilioToken === 'string' && body.waTwilioToken.trim()) data.waTwilioToken = encryptNullable(body.waTwilioToken.trim())
  await prisma.clinica.update({ where: { id }, data })
  await auditAdmin({ ...ctx, action: 'CONFIGURAR_WHATSAPP', targetType: 'CLINICA', targetId: id, details: { clinicaSlug: clinica.slug, waEnabled, waNumero } })
}

// ── Planes de suscripción ────────────────────────────────────────────────────

export async function listarPlanesSuscripcion() {
  return getPlanes()
}

export async function crearPlanSuscripcion(body: Record<string, unknown>) {
  const id = typeof body.id === 'string' ? body.id.trim().toUpperCase() : ''
  if (!/^[A-Z][A-Z0-9_]{1,29}$/.test(id)) throw badRequest('id debe ser un código en mayúsculas (ej: ENTERPRISE)')
  const nombre = String(body.nombre ?? '').trim()
  if (!nombre) throw badRequest('nombre requerido')
  const precioMensual = Number(body.precioMensual)
  if (!Number.isFinite(precioMensual) || precioMensual < 0) throw badRequest('precioMensual inválido')
  let precioAnual: number | null = null
  if (body.precioAnual != null && body.precioAnual !== '') { const n = Number(body.precioAnual); if (!Number.isFinite(n) || n < 0) throw badRequest('precioAnual inválido'); precioAnual = n }
  const caracteristicas = Array.isArray(body.caracteristicas) ? body.caracteristicas.filter((s: unknown): s is string => typeof s === 'string') : []
  if (await prisma.planSuscripcion.findUnique({ where: { id } })) throw conflict(`Ya existe un plan con id "${id}"`)
  return prisma.planSuscripcion.create({
    data: { id, nombre, descripcion: typeof body.descripcion === 'string' ? body.descripcion : null, precioMensual, precioAnual, caracteristicas: JSON.stringify(caracteristicas), destacado: Boolean(body.destacado), orden: Number.isFinite(Number(body.orden)) ? Number(body.orden) : 0, activo: body.activo !== undefined ? Boolean(body.activo) : true },
  })
}

export async function actualizarPlanSuscripcion(id: string, body: Record<string, unknown>) {
  const existe = await prisma.planSuscripcion.findUnique({ where: { id } })
  if (!existe) throw notFound('Plan no existe')
  const data: Record<string, unknown> = {}
  if (typeof body.nombre === 'string') { const n = body.nombre.trim(); if (!n) throw badRequest('nombre vacío'); data.nombre = n }
  if (body.descripcion !== undefined) data.descripcion = body.descripcion ? String(body.descripcion) : null
  if (body.precioMensual !== undefined) { const n = Number(body.precioMensual); if (!Number.isFinite(n) || n < 0) throw badRequest('precioMensual inválido'); data.precioMensual = n }
  if (body.precioAnual !== undefined) {
    if (body.precioAnual === null || body.precioAnual === '') data.precioAnual = null
    else { const n = Number(body.precioAnual); if (!Number.isFinite(n) || n < 0) throw badRequest('precioAnual inválido'); data.precioAnual = n }
  }
  if (Array.isArray(body.caracteristicas)) data.caracteristicas = JSON.stringify(body.caracteristicas.filter((s: unknown): s is string => typeof s === 'string'))
  if (body.destacado !== undefined) data.destacado = Boolean(body.destacado)
  if (body.orden !== undefined && Number.isFinite(Number(body.orden))) data.orden = Number(body.orden)
  if (body.activo !== undefined) data.activo = Boolean(body.activo)
  return prisma.planSuscripcion.update({ where: { id }, data })
}

export async function eliminarPlanSuscripcion(id: string) {
  const enUso = await prisma.clinica.count({ where: { plan: id } })
  if (enUso > 0) throw conflict(`No se puede eliminar: ${enUso} clínica(s) usan este plan. Migrá esas clínicas o desactivá el plan.`)
  await prisma.planSuscripcion.delete({ where: { id } })
}

// ── Resumen / stats / leads ──────────────────────────────────────────────────

export async function dashboardStats() {
  const [activas, enTrial, suspendidas, total, demosActivas, planes] = await Promise.all([
    prisma.clinica.count({ where: { activo: true, plan: { not: 'TRIAL' }, esDemo: false } }),
    prisma.clinica.count({ where: { activo: true, plan: 'TRIAL', esDemo: false } }),
    prisma.clinica.count({ where: { activo: false, esDemo: false } }),
    prisma.clinica.count({ where: { esDemo: false } }),
    prisma.clinica.count({ where: { esDemo: true } }),
    getPlanes(),
  ])
  const priceMap: PlanPriceMap = {}
  for (const p of planes) priceMap[p.id] = p.precioMensual
  const pagantes = await prisma.clinica.findMany({
    where: { activo: true, plan: { not: 'TRIAL' }, esDemo: false },
    select: { plan: true, precioAcordado: true, extras: { where: { activo: true }, select: { montoMensual: true } } },
  })
  const mrr = pagantes.reduce((s, c) => s + (c.precioAcordado ?? priceMap[c.plan] ?? 0) + c.extras.reduce((e, x) => e + x.montoMensual, 0), 0)
  return { activas, enTrial, suspendidas, total, demosActivas, mrr }
}

export async function resumenSuscripciones() {
  const planes = await getPlanes()
  const priceMap: PlanPriceMap = {}
  for (const p of planes) priceMap[p.id] = p.precioMensual

  const clinicas = await prisma.clinica.findMany({
    where: { esDemo: false },
    select: {
      id: true, slug: true, nombre: true, plan: true, activo: true, trialHasta: true, proximoCobro: true,
      precioAcordado: true, cicloFacturacion: true, createdAt: true,
      pagosSuscripcion: { orderBy: { fechaPago: 'desc' }, take: 1, select: { fechaPago: true, monto: true } },
      extras: { where: { activo: true }, select: { montoMensual: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  const now = new Date()
  const en7dias = new Date(now.getTime() + 7 * 86400000)
  let mrr = 0, arr = 0
  const contadores = { AL_DIA: 0, ATRASADO: 0, TRIAL: 0, SUSPENDIDO: 0 }
  let trialsPorVencer = 0
  const lista = clinicas.map((c) => {
    const estado = getEstadoPago({ plan: c.plan, activo: c.activo, trialHasta: c.trialHasta, proximoCobro: c.proximoCobro, precioAcordado: c.precioAcordado, cicloFacturacion: c.cicloFacturacion }, now)
    contadores[estado]++
    const montoExtras = c.extras.reduce((s, e) => s + e.montoMensual, 0)
    const precio = precioMensualEfectivo({ plan: c.plan, precioAcordado: c.precioAcordado }, priceMap) + montoExtras
    if (estado === 'AL_DIA' && c.plan !== 'TRIAL') { mrr += precio; arr += precio * 12 }
    if (estado === 'TRIAL' && c.trialHasta && c.trialHasta.getTime() <= en7dias.getTime()) trialsPorVencer++
    return {
      id: c.id, slug: c.slug, nombre: c.nombre, plan: c.plan, activo: c.activo,
      trialHasta: c.trialHasta?.toISOString() ?? null, proximoCobro: c.proximoCobro?.toISOString() ?? null,
      precioAcordado: c.precioAcordado, precioMensual: precio, cicloFacturacion: c.cicloFacturacion, estado,
      ultimoPago: c.pagosSuscripcion[0] ? { fecha: c.pagosSuscripcion[0].fechaPago.toISOString(), monto: c.pagosSuscripcion[0].monto } : null,
      createdAt: c.createdAt.toISOString(),
    }
  })
  return {
    kpis: { totalClinicas: clinicas.length, mrr, arr, alDia: contadores.AL_DIA, atrasadas: contadores.ATRASADO, enTrial: contadores.TRIAL, suspendidas: contadores.SUSPENDIDO, trialsPorVencer },
    clinicas: lista,
  }
}

export async function listarLeads() {
  return prisma.lead.findMany({ orderBy: { createdAt: 'desc' }, take: 200 })
}
