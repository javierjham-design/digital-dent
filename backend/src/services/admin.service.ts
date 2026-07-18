import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { control } from '@/db/control'
import { tenantClient } from '@/db/tenant'
import { badRequest, conflict, notFound } from '@/lib/errors'
import { auditAdmin } from '@/lib/audit-admin'
import { encryptNullable, decryptNullable } from '@/lib/crypto'
import { getPlanes, getPlan, getLimiteProfesionales, precioProfesionalExtra, precioPlanEnMoneda } from '@/lib/plans'
import { crearClinicaConProvision, slugify, RESERVED_SLUGS } from '@/services/clinicas-registry.service'
import { invalidateClinicaCache } from '@/middlewares/tenant'
import { esPaisValido, PAISES_LISTA } from '@shared/constants/paises'
import { parseModulos, MODULOS, MODULOS_CODES, MODULOS_DEFAULT } from '@shared/constants/modulos'
import { VERTICAL_IDS } from '@/lib/verticales'
import { conteoEnLinea, usuariosEnLinea, totalEnLinea } from '@/lib/presence'
import { monedaCobroDe, MONEDAS_COBRO } from '@shared/constants/cobro'
import { estadoPasarelas, proveedorPara, pasarelaConfigurada, configPasarelas } from '@/lib/pagos'
import {
  calcularProximoCobro, getEstadoPago, precioMensualEfectivo, type CicloFacturacion, type PlanPriceMap,
} from '@/lib/billing'

export interface AuditCtx { actorId: string; actorEmail: string; ip?: string | null; userAgent?: string | null }

const DEFAULT_ADMIN_USERNAME = 'Administrador'
const CICLOS_VALIDOS = ['MENSUAL', 'ANUAL']
const METODOS_PAGO = ['TRANSFERENCIA', 'WEBPAY', 'EFECTIVO', 'OTRO']

function generarPassword(): string {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = randomBytes(12)
  let out = ''
  for (let i = 0; i < 12; i++) out += charset[bytes[i] % charset.length]
  return out
}

// Resuelve el dbName de una clínica desde el control-plane.
async function dbNameDe(id: string): Promise<{ slug: string; dbName: string }> {
  const c = await control.clinica.findUnique({ where: { id }, select: { slug: true, dbName: true } })
  if (!c) throw notFound('Clínica no existe')
  return c
}

// ── Clínicas ─────────────────────────────────────────────────────────────────

export async function listarClinicas() {
  // Los conteos de usuarios/pacientes/citas viven en cada base de tenant; el
  // registro del control-plane no los tiene. La cartera con métricas se sirve
  // desde resumenSuscripciones.
  return control.clinica.findMany({ where: { esDemo: false }, orderBy: { createdAt: 'desc' } })
}

// Tamaño real de cada base (lo que se factura en Railway). Cada clínica es una
// base física; pg_database_size da el tamaño en disco. clariva_% cubre el control
// y todos los tenants (clariva_t_<slug>).
async function tamanosPorDb(): Promise<Map<string, number>> {
  try {
    const rows = await control.$queryRaw<{ datname: string; bytes: bigint }[]>`
      SELECT datname, pg_database_size(datname) AS bytes
      FROM pg_database WHERE datname LIKE 'clariva_%'`
    const m = new Map<string, number>()
    for (const r of rows) m.set(r.datname, Number(r.bytes))
    return m
  } catch { return new Map() }
}

export async function obtenerClinica(id: string) {
  const c = await control.clinica.findUnique({ where: { id } })
  if (!c) throw notFound('Clínica no encontrada')
  let sizeBytes: number | null = null
  try {
    const rows = await control.$queryRaw<{ bytes: bigint }[]>`SELECT pg_database_size(${c.dbName}) AS bytes`
    sizeBytes = rows[0] ? Number(rows[0].bytes) : null
  } catch { sizeBytes = null }
  const online = usuariosEnLinea(id)
  // Profesionales (usuarios con agenda) actualmente activos en la base del tenant,
  // y el tope efectivo del plan (+extras). Best-effort: si la base no responde, 0.
  const { limite, base, extra } = await getLimiteProfesionales(id)
  let profesionalesActivos = 0
  try {
    profesionalesActivos = await tenantClient(c.dbName).user.count({ where: { role: { in: ['doctor', 'medico'] }, activo: true } })
  } catch { profesionalesActivos = 0 }
  const plan = await getPlan(c.plan)
  // Cobro: moneda efectiva (override o por país), proveedor que corresponde y su
  // estado de configuración, y el medio de pago guardado (si hay).
  const monedaEfectiva = monedaCobroDe(c.pais, c.monedaCobro)
  const precioPlanMoneda = precioPlanEnMoneda(plan, monedaEfectiva)
  const proveedor = proveedorPara(monedaEfectiva)
  const metodo = await control.metodoPagoClinica.findUnique({ where: { clinicaId: id } })
  return {
    ...c,
    modulos: parseModulos(c.modulos),
    sizeBytes,
    enLinea: online.length,
    adminEnLinea: online.some((u) => u.admin),
    usuariosEnLinea: online.map((u) => ({ name: u.name, admin: u.admin, at: new Date(u.at).toISOString() })),
    profesionales: { activos: profesionalesActivos, limite, base, extra, planNombre: plan?.nombre ?? c.plan, precioExtra: precioProfesionalExtra(monedaEfectiva) },
    cobro: {
      monedaEfectiva,
      monedaAuto: c.monedaCobro == null,
      proveedor,
      pasarelaConfigurada: pasarelaConfigurada(proveedor),
      precioPlan: precioPlanMoneda,
      metodo: metodo ? { provider: metodo.provider, marca: metodo.marca, ultimos4: metodo.ultimos4, exp: metodo.exp } : null,
    },
  }
}

// Ajusta la configuración de cobro de la clínica: moneda (override o auto=null) y
// si el cobro es automático (recurrente). No dispara cobros — solo configura.
export async function cambiarCobro(ctx: AuditCtx, id: string, body: Record<string, unknown>) {
  const data: Record<string, unknown> = {}
  if ('monedaCobro' in body) {
    const m = body.monedaCobro
    if (m === null || m === '' || m === 'AUTO') data.monedaCobro = null
    else if (MONEDAS_COBRO.includes(String(m) as never)) data.monedaCobro = String(m)
    else throw badRequest('monedaCobro debe ser CLP, USD o null (auto)')
  }
  if ('cobroAutomatico' in body) data.cobroAutomatico = Boolean(body.cobroAutomatico)
  const clinica = await control.clinica.update({ where: { id }, data })
  await auditAdmin({ ...ctx, action: 'CAMBIAR_COBRO', targetType: 'CLINICA', targetId: id, details: { clinicaSlug: clinica.slug, monedaCobro: clinica.monedaCobro, cobroAutomatico: clinica.cobroAutomatico } })
  return obtenerClinica(id)
}

// Pagos recientes de TODA la plataforma + estado de las pasarelas (para la
// sección de Pagos del super-admin).
export async function pagosPlataforma() {
  const pagos = await control.pagoSuscripcion.findMany({
    orderBy: { fechaPago: 'desc' },
    take: 200,
    include: { clinica: { select: { nombre: true, slug: true } } },
  })
  const totales = { CLP: 0, USD: 0 }
  for (const p of pagos) totales[(p.moneda as 'CLP' | 'USD') in totales ? (p.moneda as 'CLP' | 'USD') : 'CLP'] += p.monto
  return {
    pagos: pagos.map((p) => ({
      id: p.id, clinica: p.clinica.nombre, slug: p.clinica.slug,
      fechaPago: p.fechaPago.toISOString(), monto: p.monto, moneda: p.moneda,
      metodoPago: p.metodoPago, periodoDesde: p.periodoDesde.toISOString(), periodoHasta: p.periodoHasta.toISOString(),
    })),
    totales,
    pasarelas: estadoPasarelas(),
    configPasarelas: configPasarelas(),
  }
}

// Ajusta la cantidad de profesionales extra (usuarios con agenda adicionales al
// tope del plan). Cada uno suma $9.990/mes a la facturación.
export async function cambiarProfesionalesExtra(ctx: AuditCtx, id: string, cantidad: unknown) {
  const n = Number(cantidad)
  if (!Number.isFinite(n) || n < 0 || n > 100) throw badRequest('Cantidad de profesionales extra inválida (0 a 100).')
  const clinica = await control.clinica.update({ where: { id }, data: { profesionalesExtra: Math.round(n) } })
  await auditAdmin({ ...ctx, action: 'CAMBIAR_PROFESIONALES_EXTRA', targetType: 'CLINICA', targetId: id, details: { clinicaSlug: clinica.slug, profesionalesExtra: Math.round(n) } })
  return obtenerClinica(id)
}

// Asigna los módulos habilitados de la clínica (CRM / Agendamiento online /
// WhatsApp). Se guardan como CSV en el control-plane; el cache de tenant se
// invalida para que el gating (requireModulo) refleje el cambio de inmediato.
export async function cambiarModulos(ctx: AuditCtx, id: string, rawModulos: unknown) {
  if (!Array.isArray(rawModulos)) throw badRequest('modulos debe ser un arreglo de códigos.')
  const validos = rawModulos.map((m) => String(m)).filter((c) => MODULOS_CODES.includes(c))
  const csv = validos.join(',')
  const clinica = await control.clinica.update({ where: { id }, data: { modulos: csv } })
  invalidateClinicaCache(id)
  await auditAdmin({ ...ctx, action: 'CAMBIAR_MODULOS', targetType: 'CLINICA', targetId: id, details: { clinicaSlug: clinica.slug, modulos: csv } })
  return { ...clinica, modulos: parseModulos(clinica.modulos) }
}

export async function crearClinica(ctx: AuditCtx, body: {
  clinicaNombre: string; clinicaEmail?: string; clinicaTelefono?: string
  clinicaDireccion?: string; clinicaCiudad?: string; plan?: string; trialDias?: number; slug?: string
}) {
  const res = await crearClinicaConProvision({
    clinicaNombre: body.clinicaNombre, clinicaEmail: body.clinicaEmail, clinicaTelefono: body.clinicaTelefono,
    clinicaDireccion: body.clinicaDireccion, clinicaCiudad: body.clinicaCiudad,
    plan: body.plan, trialDias: body.trialDias, slug: body.slug,
  })
  await auditAdmin({ ...ctx, action: 'CREAR_CLINICA', targetType: 'CLINICA', targetId: res.clinica.id, details: { slug: res.clinica.slug, nombre: res.clinica.nombre } })
  return {
    clinica: { id: res.clinica.id, slug: res.clinica.slug, nombre: res.clinica.nombre },
    credenciales: { usuario: res.credenciales.usuario, contrasena: res.credenciales.contrasena, url_fallback: `/c/${res.clinica.slug}/login` },
    prestacionesCopiadas: 0,
  }
}

export async function actualizarClinica(id: string, body: Record<string, unknown>) {
  // Solo campos del registro de control-plane (el perfil/branding vive en el tenant).
  const data: Record<string, unknown> = {}
  for (const k of ['nombre', 'rut', 'email', 'telefono', 'plan', 'activo']) {
    if (k in body) data[k] = body[k]
  }
  if ('trialHasta' in body) data.trialHasta = body.trialHasta ? new Date(String(body.trialHasta)) : null
  return control.clinica.update({ where: { id }, data })
}

export async function cambiarPlan(ctx: AuditCtx, id: string, body: Record<string, unknown>) {
  // Valida contra el catálogo REAL de planes (incluye los personalizados creados
  // en el editor). TRIAL siempre es válido (plan de sistema para pruebas).
  const nuevoPlan = String(body.plan ?? '')
  const planDef = nuevoPlan === 'TRIAL' ? null : await getPlan(nuevoPlan)
  if (nuevoPlan !== 'TRIAL' && !planDef) throw badRequest('Plan inválido: no existe en el catálogo de planes.')

  const actual = await control.clinica.findUnique({ where: { id }, select: { plan: true, proximoCobro: true } })
  const data: Record<string, unknown> = { plan: nuevoPlan }
  // Al CAMBIAR de plan, aplica los módulos incluidos en el nuevo plan como punto de
  // partida. La clínica se puede ajustar después (tarjeta "Funcionalidades/Módulos").
  if (planDef && actual && actual.plan !== nuevoPlan) data.modulos = planDef.modulos.join(',')

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

  if (nuevoPlan !== 'TRIAL' && data.proximoCobro === undefined && !actual?.proximoCobro) {
    const fecha = new Date()
    if ((data.cicloFacturacion ?? 'MENSUAL') === 'ANUAL') fecha.setFullYear(fecha.getFullYear() + 1)
    else fecha.setMonth(fecha.getMonth() + 1)
    data.proximoCobro = fecha
  }
  const clinica = await control.clinica.update({ where: { id }, data })
  if (data.modulos !== undefined) invalidateClinicaCache(id)
  await auditAdmin({ ...ctx, action: 'CAMBIAR_PLAN', targetType: 'CLINICA', targetId: clinica.id, details: { clinicaSlug: clinica.slug, planNuevo: nuevoPlan } })
  return clinica
}

// Cambia el slug (= subdominio / link definitivo). El dbName NO cambia, así que
// no se toca ningún dato de la clínica: sólo su dirección de acceso.
export async function cambiarSlug(ctx: AuditCtx, id: string, rawSlug: string) {
  const nuevo = slugify(rawSlug || '')
  if (!nuevo || nuevo.length < 3) throw badRequest('El link debe tener al menos 3 caracteres (letras, números y guiones).')
  if (RESERVED_SLUGS.has(nuevo)) throw badRequest(`El link "${nuevo}" está reservado por la plataforma. Elige otro.`)
  const clinica = await control.clinica.findUnique({ where: { id }, select: { slug: true } })
  if (!clinica) throw notFound('Clínica no existe')
  if (clinica.slug === nuevo) return control.clinica.findUnique({ where: { id } })
  const ocupado = await control.clinica.findUnique({ where: { slug: nuevo }, select: { id: true } })
  if (ocupado) throw conflict(`El link "${nuevo}" ya está en uso por otra clínica.`)
  const actualizada = await control.clinica.update({ where: { id }, data: { slug: nuevo } })
  invalidateClinicaCache(id)
  await auditAdmin({ ...ctx, action: 'CAMBIAR_SLUG', targetType: 'CLINICA', targetId: id, details: { anterior: clinica.slug, nuevo } })
  return actualizada
}

// Convierte un demo en clínica definitiva: quita las banderas de demo, opcionalmente
// asigna el link (slug) definitivo y el plan/facturación.
export async function convertirADefinitiva(ctx: AuditCtx, id: string, body: { slug?: string; plan?: string; precioAcordado?: number; cicloFacturacion?: string }) {
  const clinica = await control.clinica.findUnique({ where: { id } })
  if (!clinica) throw notFound('Clínica no existe')
  if (body.slug && slugify(body.slug) !== clinica.slug) await cambiarSlug(ctx, id, body.slug)
  if (body.plan) await cambiarPlan(ctx, id, { plan: body.plan, precioAcordado: body.precioAcordado, cicloFacturacion: body.cicloFacturacion })
  const actualizada = await control.clinica.update({ where: { id }, data: { esDemo: false, demoExpiraEn: null, activo: true } })
  invalidateClinicaCache(id)
  await auditAdmin({ ...ctx, action: 'CONVERTIR_DEMO', targetType: 'CLINICA', targetId: id, details: { slug: actualizada.slug, plan: actualizada.plan } })
  return actualizada
}

// Cambia el país de operación de la clínica (documento/teléfono/moneda). Se
// denormaliza en el control-plane (para el super-admin) y en la Configuracion del
// tenant (para que la app y el backend lo lean local).
export async function cambiarPais(ctx: AuditCtx, id: string, rawPais: string) {
  const pais = String(rawPais || '').toUpperCase()
  if (!esPaisValido(pais)) throw badRequest('País no válido')
  const { dbName } = await dbNameDe(id)
  const clinica = await control.clinica.update({ where: { id }, data: { pais } })
  await tenantClient(dbName).configuracion.update({ where: { id: 'singleton' }, data: { pais } }).catch(() => {})
  invalidateClinicaCache(id)
  await auditAdmin({ ...ctx, action: 'CAMBIAR_PAIS', targetType: 'CLINICA', targetId: id, details: { clinicaSlug: clinica.slug, pais } })
  return clinica
}

export async function cambiarEstado(ctx: AuditCtx, id: string, body: { activo: unknown; notasInternas?: string }) {
  if (typeof body.activo !== 'boolean') throw badRequest('activo (boolean) requerido')
  const data: Record<string, unknown> = { activo: body.activo }
  if (typeof body.notasInternas === 'string') data.notasInternas = body.notasInternas
  const clinica = await control.clinica.update({ where: { id }, data })
  await auditAdmin({ ...ctx, action: 'CAMBIAR_ESTADO', targetType: 'CLINICA', targetId: clinica.id, details: { clinicaSlug: clinica.slug, activo: body.activo } })
  return clinica
}

export async function extenderTrial(ctx: AuditCtx, id: string, body: { dias?: number; nuevoVencimiento?: string }) {
  const clinica = await control.clinica.findUnique({ where: { id } })
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
  const actualizada = await control.clinica.update({ where: { id }, data })
  await auditAdmin({ ...ctx, action: 'EXTENDER_TRIAL', targetType: 'CLINICA', targetId: id, details: { clinicaSlug: actualizada.slug, nuevoVencimiento: nuevoVencimiento.toISOString() } })
  return actualizada
}

// El admin de la clínica vive en SU base de tenant.
export async function resetAdminPassword(ctx: AuditCtx, id: string, body: { newPassword?: string; forceChange?: boolean; username?: string }) {
  const username = body.username?.trim() || DEFAULT_ADMIN_USERNAME
  const newPassword = body.newPassword && body.newPassword.length > 0 ? body.newPassword : generarPassword()
  const forceChange = body.forceChange === undefined ? true : Boolean(body.forceChange)
  if (newPassword.length < 8) throw badRequest('La contraseña debe tener al menos 8 caracteres')

  const { slug, dbName } = await dbNameDe(id)
  const db = tenantClient(dbName)
  const hash = await bcrypt.hash(newPassword, 10)
  const user = await db.user.findFirst({ where: { username } })
  let created = false
  if (user) {
    await db.user.update({ where: { id: user.id }, data: { password: hash, activo: true, passwordChangedAt: forceChange ? null : new Date() } })
  } else {
    await db.user.create({ data: { name: username, username, email: null, password: hash, role: 'admin', activo: true, passwordChangedAt: forceChange ? null : new Date() } })
    created = true
  }
  await auditAdmin({ ...ctx, action: 'RESET_PASSWORD', targetType: 'CLINICA', targetId: id, details: { clinicaSlug: slug, username, forceChange, createdNewUser: created } })
  return { ok: true, clinicaSlug: slug, username, nuevaPassword: newPassword, forzarCambio: forceChange, creado: created }
}

// ── Pagos de suscripción (control-plane) ──────────────────────────────────────

export async function listarPagos(id: string) {
  return control.pagoSuscripcion.findMany({ where: { clinicaId: id }, orderBy: { fechaPago: 'desc' } })
}

export async function registrarPago(ctx: AuditCtx, id: string, body: Record<string, unknown>) {
  const monto = Number(body.monto)
  if (!Number.isFinite(monto) || monto <= 0) throw badRequest('monto debe ser un número positivo')
  if (monto > 20_000_000) throw badRequest('Monto fuera de rango razonable (máximo $20.000.000)')
  const metodoPago = String(body.metodoPago ?? '')
  if (!METODOS_PAGO.includes(metodoPago)) throw badRequest(`metodoPago debe ser uno de: ${METODOS_PAGO.join(', ')}`)

  const clinica = await control.clinica.findUnique({ where: { id } })
  if (!clinica) throw notFound('Clínica no existe')

  // Moneda del pago: la enviada (si es válida) o la moneda de cobro de la clínica.
  const moneda = MONEDAS_COBRO.includes(String(body.moneda) as never)
    ? String(body.moneda)
    : monedaCobroDe(clinica.pais, clinica.monedaCobro)

  const fechaPago = body.fechaPago ? new Date(String(body.fechaPago)) : new Date()
  const ciclo = (clinica.cicloFacturacion as CicloFacturacion) || 'MENSUAL'
  const periodoDesde = body.periodoDesde ? new Date(String(body.periodoDesde))
    : (clinica.proximoCobro && clinica.proximoCobro.getTime() > fechaPago.getTime() ? new Date(clinica.proximoCobro) : new Date(fechaPago))
  const periodoHasta = body.periodoHasta ? new Date(String(body.periodoHasta)) : calcularProximoCobro({ proximoActual: clinica.proximoCobro, fechaPago, ciclo })
  const nuevoProximoCobro = calcularProximoCobro({ proximoActual: clinica.proximoCobro, fechaPago, ciclo })

  const [pago, clinicaActualizada] = await control.$transaction([
    control.pagoSuscripcion.create({
      data: { clinicaId: id, fechaPago, monto, moneda, periodoDesde, periodoHasta, metodoPago, comprobante: body.comprobante ? String(body.comprobante) : null, notas: body.notas ? String(body.notas) : null, registradoPor: ctx.actorId },
    }),
    // Un pago convierte una demo/trial en cliente permanente: deja de ser demo
    // (no se auto-elimina) y, si estaba en TRIAL, pasa a BÁSICO.
    control.clinica.update({ where: { id }, data: { proximoCobro: nuevoProximoCobro, activo: true, plan: clinica.plan === 'TRIAL' ? 'BASICO' : clinica.plan, esDemo: false, demoExpiraEn: null } }),
  ])
  await auditAdmin({ ...ctx, action: 'REGISTRAR_PAGO', targetType: 'PAGO', targetId: pago.id, details: { clinicaSlug: clinicaActualizada.slug, monto, metodoPago } })
  return { ok: true, pago, clinica: clinicaActualizada }
}

export async function eliminarPago(id: string, pagoId: string) {
  const pago = await control.pagoSuscripcion.findUnique({ where: { id: pagoId } })
  if (!pago || pago.clinicaId !== id) throw notFound('Pago no existe')
  await control.$transaction(async (tx) => {
    await tx.pagoSuscripcion.delete({ where: { id: pagoId } })
    const ultimo = await tx.pagoSuscripcion.findFirst({ where: { clinicaId: id }, orderBy: { periodoHasta: 'desc' } })
    await tx.clinica.update({ where: { id }, data: { proximoCobro: ultimo ? ultimo.periodoHasta : null } })
  })
}

// ── Extras (control-plane) ────────────────────────────────────────────────────

export async function listarExtras(id: string) {
  return control.extraSuscripcion.findMany({ where: { clinicaId: id }, orderBy: { createdAt: 'asc' } })
}

export async function crearExtra(ctx: AuditCtx, id: string, body: Record<string, unknown>) {
  const nombre = String(body.nombre ?? '').trim()
  if (!nombre) throw badRequest('nombre es requerido')
  const monto = Number(body.montoMensual)
  if (!Number.isFinite(monto) || monto < 0) throw badRequest('montoMensual debe ser un número ≥ 0')
  if (monto > 5_000_000) throw badRequest('Monto fuera de rango razonable (máximo $5.000.000/mes)')
  const clinica = await control.clinica.findUnique({ where: { id }, select: { slug: true } })
  if (!clinica) throw notFound('Clínica no existe')
  const extra = await control.extraSuscripcion.create({
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
  const r = await control.extraSuscripcion.updateMany({ where: { id: extraId, clinicaId: id }, data })
  if (r.count === 0) throw notFound('Extra no existe')
  await auditAdmin({ ...ctx, action: 'EDITAR_EXTRA', targetType: 'EXTRA_SUSCRIPCION', targetId: extraId, details: { clinicaId: id, cambios: data } })
}

export async function eliminarExtra(ctx: AuditCtx, id: string, extraId: string) {
  const r = await control.extraSuscripcion.deleteMany({ where: { id: extraId, clinicaId: id } })
  if (r.count === 0) throw notFound('Extra no existe')
  await auditAdmin({ ...ctx, action: 'ELIMINAR_EXTRA', targetType: 'EXTRA_SUSCRIPCION', targetId: extraId, details: { clinicaId: id } })
}

// ── WhatsApp config (en la Configuracion de la base del tenant) ───────────────

export async function getWhatsapp(id: string) {
  const { dbName } = await dbNameDe(id)
  const c = await tenantClient(dbName).configuracion.findUnique({
    where: { id: 'singleton' },
    select: { waEnabled: true, waTwilioSid: true, waNumero: true, waTemplateSid: true, waHorasAntes: true, waTwilioToken: true },
  })
  if (!c) return { waEnabled: false, waTwilioSid: null, waNumero: null, waTemplateSid: null, waHorasAntes: 24, tokenConfigurado: false }
  return { waEnabled: c.waEnabled, waTwilioSid: c.waTwilioSid, waNumero: c.waNumero, waTemplateSid: c.waTemplateSid, waHorasAntes: c.waHorasAntes, tokenConfigurado: Boolean(c.waTwilioToken) }
}

export async function putWhatsapp(ctx: AuditCtx, id: string, body: Record<string, unknown>) {
  const { slug, dbName } = await dbNameDe(id)
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
  await tenantClient(dbName).configuracion.update({ where: { id: 'singleton' }, data })
  // Denormalizamos el enrutamiento al control-plane: el webhook resuelve la
  // clínica por su número y el cron filtra por waEnabled sin abrir cada base.
  await control.clinica.update({ where: { id }, data: { waEnabled, waNumero } })
  await auditAdmin({ ...ctx, action: 'CONFIGURAR_WHATSAPP', targetType: 'CLINICA', targetId: id, details: { clinicaSlug: slug, waEnabled, waNumero } })
}

// Prueba de conexión con Twilio: valida el Account SID + Auth Token guardados
// contra la API de Twilio (sin enviar mensajes). Confirma que las credenciales
// funcionan antes de habilitar el servicio.
export async function probarWhatsapp(id: string): Promise<{ ok: boolean; mensaje: string }> {
  const { dbName } = await dbNameDe(id)
  const c = await tenantClient(dbName).configuracion.findUnique({ where: { id: 'singleton' }, select: { waTwilioSid: true, waTwilioToken: true } })
  const sid = c?.waTwilioSid
  const token = decryptNullable(c?.waTwilioToken ?? null)
  if (!sid || !token) return { ok: false, mensaje: 'Faltan el Account SID y/o el Auth Token de Twilio. Guárdalos y vuelve a probar.' }
  try {
    const auth = Buffer.from(`${sid}:${token}`).toString('base64')
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, { headers: { Authorization: `Basic ${auth}` } })
    const data = (await res.json().catch(() => ({}))) as { friendly_name?: string; status?: string; message?: string }
    if (res.ok) return { ok: true, mensaje: `Conexión OK · cuenta "${data.friendly_name ?? sid}" (${data.status ?? 'activa'}).` }
    return { ok: false, mensaje: data.message ?? `Twilio respondió ${res.status}. Revisa el SID y el Auth Token.` }
  } catch (e) {
    return { ok: false, mensaje: `No se pudo conectar con Twilio: ${e instanceof Error ? e.message : 'error'}` }
  }
}

// ── Configuración del sistema (integraciones + catálogos) ─────────────────────
// Estado de las integraciones (correo, pasarelas, WhatsApp) con su checklist de
// variables de entorno (sin exponer valores), y los catálogos de la plataforma.
export function configuracionSistema() {
  const hay = (k: string) => Boolean(process.env[k])
  const correo = {
    clave: 'correo', nombre: 'Correo (Resend)', configurada: hay('RESEND_API_KEY'),
    nota: 'Correos transaccionales: confirmaciones de cita, presupuestos, avisos de deuda. Carga las variables en Railway (servicio BACKEND).',
    variables: [
      { nombre: 'RESEND_API_KEY', presente: hay('RESEND_API_KEY'), requerida: true },
      { nombre: 'EMAIL_FROM_ADDRESS', presente: hay('EMAIL_FROM_ADDRESS'), requerida: false },
      { nombre: 'EMAIL_FROM_SUFFIX', presente: hay('EMAIL_FROM_SUFFIX'), requerida: false },
    ],
  }
  const pasarelas = configPasarelas().map((c) => ({
    clave: c.proveedor.toLowerCase(),
    nombre: `${c.proveedor === 'LEMONSQUEEZY' ? 'Lemon Squeezy' : c.proveedor} · ${c.moneda}`,
    configurada: c.configurada, nota: c.nota, variables: c.variables,
  }))
  const whatsapp = {
    clave: 'whatsapp', nombre: 'WhatsApp (Twilio)', configurada: null as boolean | null,
    nota: 'Se configura POR CLÍNICA en Clínicas → [clínica] → WhatsApp (Account SID, número emisor, Template SID y Auth Token). Usa el botón "Probar conexión".',
    variables: [] as { nombre: string; presente: boolean; requerida: boolean }[],
  }
  return {
    integraciones: [correo, ...pasarelas, whatsapp],
    plataforma: [
      { nombre: 'API_PUBLIC_URL', presente: hay('API_PUBLIC_URL'), requerida: false },
      { nombre: 'APP_PUBLIC_URL', presente: hay('APP_PUBLIC_URL'), requerida: false },
      { nombre: 'CRON_SECRET', presente: hay('CRON_SECRET'), requerida: false },
      { nombre: 'DATABASE_URL', presente: hay('DATABASE_URL'), requerida: true },
    ],
    catalogos: {
      modulos: MODULOS.map((m) => ({ code: m.code, nombre: m.nombre, descripcion: m.descripcion })),
      verticales: VERTICAL_IDS as readonly string[],
      paises: PAISES_LISTA.map((p) => ({ code: p.code, nombre: p.nombre, bandera: p.bandera, moneda: p.moneda.code })),
    },
  }
}

// ── Planes de suscripción (control-plane) ─────────────────────────────────────

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
  let precioAnualUSD: number | null = null
  if (body.precioAnualUSD != null && body.precioAnualUSD !== '') { const n = Number(body.precioAnualUSD); if (!Number.isFinite(n) || n < 0) throw badRequest('precioAnualUSD inválido'); precioAnualUSD = n }
  const caracteristicas = Array.isArray(body.caracteristicas) ? body.caracteristicas.filter((s: unknown): s is string => typeof s === 'string') : []
  const modulos = parseModulos(Array.isArray(body.modulos) ? body.modulos.join(',') : (typeof body.modulos === 'string' ? body.modulos : MODULOS_DEFAULT)).join(',')
  const maxProfesionales = Number.isFinite(Number(body.maxProfesionales)) ? Math.max(1, Math.round(Number(body.maxProfesionales))) : 2
  const precioMensualUSD = Number.isFinite(Number(body.precioMensualUSD)) && Number(body.precioMensualUSD) >= 0 ? Number(body.precioMensualUSD) : 0
  if (await control.planSuscripcion.findUnique({ where: { id } })) throw conflict(`Ya existe un plan con id "${id}"`)
  return control.planSuscripcion.create({
    data: { id, nombre, descripcion: typeof body.descripcion === 'string' ? body.descripcion : null, precioMensual, precioMensualUSD, precioAnual, precioAnualUSD, maxProfesionales, modulos, caracteristicas: JSON.stringify(caracteristicas), destacado: Boolean(body.destacado), orden: Number.isFinite(Number(body.orden)) ? Number(body.orden) : 0, activo: body.activo !== undefined ? Boolean(body.activo) : true },
  })
}

export async function actualizarPlanSuscripcion(id: string, body: Record<string, unknown>) {
  const existe = await control.planSuscripcion.findUnique({ where: { id } })
  if (!existe) throw notFound('Plan no existe')
  const data: Record<string, unknown> = {}
  if (typeof body.nombre === 'string') { const n = body.nombre.trim(); if (!n) throw badRequest('nombre vacío'); data.nombre = n }
  if (body.descripcion !== undefined) data.descripcion = body.descripcion ? String(body.descripcion) : null
  if (body.precioMensual !== undefined) { const n = Number(body.precioMensual); if (!Number.isFinite(n) || n < 0) throw badRequest('precioMensual inválido'); data.precioMensual = n }
  if (body.precioMensualUSD !== undefined) { const n = Number(body.precioMensualUSD); if (!Number.isFinite(n) || n < 0) throw badRequest('precioMensualUSD inválido'); data.precioMensualUSD = n }
  if (body.precioAnual !== undefined) {
    if (body.precioAnual === null || body.precioAnual === '') data.precioAnual = null
    else { const n = Number(body.precioAnual); if (!Number.isFinite(n) || n < 0) throw badRequest('precioAnual inválido'); data.precioAnual = n }
  }
  if (body.precioAnualUSD !== undefined) {
    if (body.precioAnualUSD === null || body.precioAnualUSD === '') data.precioAnualUSD = null
    else { const n = Number(body.precioAnualUSD); if (!Number.isFinite(n) || n < 0) throw badRequest('precioAnualUSD inválido'); data.precioAnualUSD = n }
  }
  if (body.maxProfesionales !== undefined) { const n = Number(body.maxProfesionales); if (!Number.isFinite(n) || n < 1) throw badRequest('maxProfesionales inválido (mínimo 1)'); data.maxProfesionales = Math.round(n) }
  if (body.modulos !== undefined) data.modulos = parseModulos(Array.isArray(body.modulos) ? body.modulos.join(',') : String(body.modulos ?? '')).join(',')
  if (Array.isArray(body.caracteristicas)) data.caracteristicas = JSON.stringify(body.caracteristicas.filter((s: unknown): s is string => typeof s === 'string'))
  if (body.destacado !== undefined) data.destacado = Boolean(body.destacado)
  if (body.orden !== undefined && Number.isFinite(Number(body.orden))) data.orden = Number(body.orden)
  if (body.activo !== undefined) data.activo = Boolean(body.activo)
  return control.planSuscripcion.update({ where: { id }, data })
}

export async function eliminarPlanSuscripcion(id: string) {
  const enUso = await control.clinica.count({ where: { plan: id } })
  if (enUso > 0) throw conflict(`No se puede eliminar: ${enUso} clínica(s) usan este plan. Migrá esas clínicas o desactivá el plan.`)
  await control.planSuscripcion.delete({ where: { id } })
}

// ── Resumen / stats / leads (control-plane) ───────────────────────────────────

export async function dashboardStats() {
  const [activas, enTrial, suspendidas, total, demosActivas, planes] = await Promise.all([
    control.clinica.count({ where: { activo: true, plan: { not: 'TRIAL' }, esDemo: false } }),
    control.clinica.count({ where: { activo: true, plan: 'TRIAL', esDemo: false } }),
    control.clinica.count({ where: { activo: false, esDemo: false } }),
    control.clinica.count({ where: { esDemo: false } }),
    control.clinica.count({ where: { esDemo: true } }),
    getPlanes(),
  ])
  const priceCLP: PlanPriceMap = {}, priceUSD: PlanPriceMap = {}
  for (const p of planes) { priceCLP[p.id] = p.precioMensual; priceUSD[p.id] = p.precioMensualUSD }
  const pagantes = await control.clinica.findMany({
    where: { activo: true, plan: { not: 'TRIAL' }, esDemo: false },
    select: { plan: true, pais: true, monedaCobro: true, precioAcordado: true, profesionalesExtra: true, extras: { where: { activo: true }, select: { montoMensual: true } } },
  })
  // MRR separado por moneda (Chile→CLP, resto→USD): no se pueden sumar monedas distintas.
  let mrrCLP = 0, mrrUSD = 0
  for (const c of pagantes) {
    const moneda = monedaCobroDe(c.pais, c.monedaCobro)
    const price = moneda === 'USD' ? priceUSD : priceCLP
    const total = (c.precioAcordado ?? price[c.plan] ?? 0) + c.extras.reduce((e, x) => e + x.montoMensual, 0) + (c.profesionalesExtra ?? 0) * precioProfesionalExtra(moneda)
    if (moneda === 'USD') mrrUSD += total; else mrrCLP += total
  }
  return { activas, enTrial, suspendidas, total, demosActivas, mrrCLP, mrrUSD }
}

export async function resumenSuscripciones() {
  const planes = await getPlanes()
  const priceCLP: PlanPriceMap = {}, priceUSD: PlanPriceMap = {}
  for (const p of planes) { priceCLP[p.id] = p.precioMensual; priceUSD[p.id] = p.precioMensualUSD }

  // Incluimos las clínicas demo/trial autogestionadas (creadas desde la web) para
  // que el dueño las vea y pueda convertirlas. Se distinguen con esDemo y NO
  // suman a los KPIs de cartera ni al MRR (son sandboxes que expiran).
  const clinicas = await control.clinica.findMany({
    select: {
      id: true, slug: true, nombre: true, dbName: true, plan: true, activo: true, trialHasta: true, proximoCobro: true,
      pais: true, monedaCobro: true,
      precioAcordado: true, cicloFacturacion: true, createdAt: true, esDemo: true, demoExpiraEn: true,
      ultimoAccesoAt: true, ultimoAccesoAdminAt: true, profesionalesExtra: true,
      pagosSuscripcion: { orderBy: { fechaPago: 'desc' }, take: 1, select: { fechaPago: true, monto: true } },
      extras: { where: { activo: true }, select: { montoMensual: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  const sizes = await tamanosPorDb()
  const online = conteoEnLinea()
  const now = new Date()
  const en7dias = new Date(now.getTime() + 7 * 86400000)
  // MRR separado por moneda: CLP y USD no se suman entre sí.
  let mrrCLP = 0, mrrUSD = 0
  const contadores = { AL_DIA: 0, ATRASADO: 0, TRIAL: 0, SUSPENDIDO: 0 }
  let trialsPorVencer = 0
  let demos = 0
  const lista = clinicas.map((c) => {
    const estado = getEstadoPago({ plan: c.plan, activo: c.activo, trialHasta: c.trialHasta, proximoCobro: c.proximoCobro, precioAcordado: c.precioAcordado, cicloFacturacion: c.cicloFacturacion }, now)
    const moneda = monedaCobroDe(c.pais, c.monedaCobro)
    const priceMap = moneda === 'USD' ? priceUSD : priceCLP
    const montoExtras = c.extras.reduce((s, e) => s + e.montoMensual, 0)
    const montoProfesionales = (c.profesionalesExtra ?? 0) * precioProfesionalExtra(moneda)
    const precio = precioMensualEfectivo({ plan: c.plan, precioAcordado: c.precioAcordado }, priceMap) + montoExtras + montoProfesionales
    if (c.esDemo) {
      demos++
    } else {
      contadores[estado]++
      if (estado === 'AL_DIA' && c.plan !== 'TRIAL') { if (moneda === 'USD') mrrUSD += precio; else mrrCLP += precio }
      if (estado === 'TRIAL' && c.trialHasta && c.trialHasta.getTime() <= en7dias.getTime()) trialsPorVencer++
    }
    return {
      moneda,
      id: c.id, slug: c.slug, nombre: c.nombre, plan: c.plan, activo: c.activo,
      trialHasta: c.trialHasta?.toISOString() ?? null, proximoCobro: c.proximoCobro?.toISOString() ?? null,
      precioAcordado: c.precioAcordado, precioMensual: precio, cicloFacturacion: c.cicloFacturacion, estado,
      esDemo: c.esDemo, demoExpiraEn: c.demoExpiraEn?.toISOString() ?? null,
      ultimoPago: c.pagosSuscripcion[0] ? { fecha: c.pagosSuscripcion[0].fechaPago.toISOString(), monto: c.pagosSuscripcion[0].monto } : null,
      createdAt: c.createdAt.toISOString(),
      sizeBytes: sizes.get(c.dbName) ?? null,
      ultimoAccesoAt: c.ultimoAccesoAt?.toISOString() ?? null,
      ultimoAccesoAdminAt: c.ultimoAccesoAdminAt?.toISOString() ?? null,
      enLinea: online.get(c.id) ?? 0,
      profesionalesExtra: c.profesionalesExtra ?? 0,
    }
  })
  // Total facturable en Railway: suma de todas las bases (control + tenants).
  let almacenamientoBytes = 0
  for (const b of sizes.values()) almacenamientoBytes += b
  return {
    kpis: { totalClinicas: clinicas.length - demos, mrrCLP, mrrUSD, arrCLP: mrrCLP * 12, arrUSD: mrrUSD * 12, alDia: contadores.AL_DIA, atrasadas: contadores.ATRASADO, enTrial: contadores.TRIAL, suspendidas: contadores.SUSPENDIDO, trialsPorVencer, demos, almacenamientoBytes, usuariosEnLinea: totalEnLinea() },
    clinicas: lista,
  }
}

export async function listarLeads() {
  return control.lead.findMany({ orderBy: { createdAt: 'desc' }, take: 500 })
}

export const LEAD_ESTADOS = ['NUEVO', 'CONTACTADO', 'DEMO_ACTIVA', 'NEGOCIACION', 'GANADO', 'PERDIDO'] as const

// Actualiza el estado del ciclo de venta y/o las notas de un lead de plataforma.
export async function actualizarLead(id: string, body: Record<string, unknown>) {
  const existe = await control.lead.findUnique({ where: { id } })
  if (!existe) throw notFound('Lead no encontrado')
  const data: Record<string, unknown> = { gestionadoAt: new Date() }
  if (body.estado !== undefined) {
    const e = String(body.estado)
    if (!(LEAD_ESTADOS as readonly string[]).includes(e)) throw badRequest('estado inválido')
    data.estado = e
  }
  if (body.notas !== undefined) data.notas = body.notas ? String(body.notas) : null
  return control.lead.update({ where: { id }, data })
}
