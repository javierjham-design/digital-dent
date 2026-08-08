import { randomUUID } from 'node:crypto'
import type { TenantClient } from '@/db/tenant'
import { badRequest, notFound } from '@/lib/errors'
import { encryptNullable, decryptNullable } from '@/lib/crypto'
import { flowConfigurado, flowCrearPago, flowGetStatus, type FlowConfig } from '@/lib/flow-cobros'

const emailValido = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

// Lee la config de Flow de la clínica (descifra las claves). Server-only.
async function leerFlowConfig(db: TenantClient): Promise<FlowConfig> {
  const c = await db.configuracion.findUnique({
    where: { id: 'singleton' },
    select: { pagoOnlineEnabled: true, flowApiKey: true, flowSecretKey: true, flowSandbox: true },
  })
  return {
    enabled: Boolean(c?.pagoOnlineEnabled),
    apiKey: decryptNullable(c?.flowApiKey ?? null),
    secretKey: decryptNullable(c?.flowSecretKey ?? null),
    sandbox: c?.flowSandbox ?? true,
  }
}

// Config para la UI: NUNCA devuelve las claves, solo si están cargadas.
export async function obtenerConfigPagos(db: TenantClient) {
  const cfg = await leerFlowConfig(db)
  return {
    enabled: cfg.enabled,
    sandbox: cfg.sandbox,
    hasApiKey: Boolean(cfg.apiKey),
    hasSecretKey: Boolean(cfg.secretKey),
    configurado: flowConfigurado(cfg),
  }
}

export async function guardarConfigPagos(db: TenantClient, body: Record<string, unknown>) {
  const data: Record<string, unknown> = {}
  if (body.enabled !== undefined) data.pagoOnlineEnabled = Boolean(body.enabled)
  if (body.sandbox !== undefined) data.flowSandbox = Boolean(body.sandbox)
  // Solo se tocan las claves si vienen no vacías (así no se borran sin querer).
  if (typeof body.apiKey === 'string' && body.apiKey.trim()) data.flowApiKey = encryptNullable(body.apiKey.trim())
  if (body.apiKey === null) data.flowApiKey = null
  if (typeof body.secretKey === 'string' && body.secretKey.trim()) data.flowSecretKey = encryptNullable(body.secretKey.trim())
  if (body.secretKey === null) data.flowSecretKey = null
  await db.configuracion.update({ where: { id: 'singleton' }, data })
  // Al habilitar Flow, deja "Flow" disponible como medio de pago para conciliar en caja.
  if (data.pagoOnlineEnabled === true) await asegurarMedioFlow(db)
  return obtenerConfigPagos(db)
}

// Crea (o reactiva) el medio de pago "Flow" para que aparezca en la caja/cobros.
async function asegurarMedioFlow(db: TenantClient) {
  const existe = await db.medioPago.findFirst({ where: { nombre: { equals: 'Flow', mode: 'insensitive' } }, select: { id: true, activo: true } })
  if (!existe) await db.medioPago.create({ data: { nombre: 'Flow', comision: 0, requiereReferencia: false } }).catch(() => {})
  else if (!existe.activo) await db.medioPago.update({ where: { id: existe.id }, data: { activo: true } }).catch(() => {})
}

// Genera un link de pago Flow para un cobro pendiente del paciente. urls: base del
// backend (webhook) y del frontend (retorno del paciente).
export interface CrearLinkOpts { apiBase: string; appBase: string; slug: string; creadoPorId?: string; urlReturn?: string; email?: string }
export type ResultadoLinkPago =
  | { estado: 'ok'; url: string; pagoId: string }
  | { estado: 'no_configurada'; mensaje: string }
  | { estado: 'error'; mensaje: string }

export async function crearLinkParaCobro(db: TenantClient, cobroId: string, opts: CrearLinkOpts): Promise<ResultadoLinkPago> {
  const cobro = await db.cobro.findUnique({
    where: { id: cobroId },
    include: { paciente: { select: { id: true, nombre: true, apellido: true, email: true } } },
  })
  if (!cobro) throw notFound('Cobro no encontrado')
  if (cobro.anulado) throw badRequest('El cobro está anulado.')
  if (cobro.estado === 'PAGADO') throw badRequest('El cobro ya está pagado.')

  const cfg = await leerFlowConfig(db)
  if (!flowConfigurado(cfg)) {
    return { estado: 'no_configurada', mensaje: 'Aún no están cargadas las credenciales de Flow de la clínica. Configúralas en Ajustes → Pagos online.' }
  }

  // Flow exige un email válido del pagador. Prioridad: el indicado (form de la
  // reserva) → el del paciente. Sin email no se puede generar el pago.
  const email = (opts.email?.trim() || cobro.paciente.email?.trim() || '').toLowerCase()
  if (!emailValido(email)) {
    return { estado: 'error', mensaje: 'Se requiere un email válido del paciente para generar el pago online.' }
  }
  const commerceOrder = `cobro-${cobro.numero}-${randomUUID().slice(0, 8)}`
  const pago = await db.pagoOnline.create({
    data: {
      cobroId: cobro.id, pacienteId: cobro.pacienteId, proveedor: 'FLOW',
      concepto: cobro.concepto || `Cobro Nº ${cobro.numero}`, monto: cobro.monto,
      estado: 'CREADO', commerceOrder, email, creadoPorId: opts.creadoPorId ?? null,
    },
  })

  const res = await flowCrearPago({
    config: cfg,
    commerceOrder,
    subject: pago.concepto,
    amount: cobro.monto,
    email,
    urlConfirmation: `${opts.apiBase}/public/pagos/flow/${opts.slug}/webhook`,
    // Retorno a una página del BACKEND (Flow vuelve por POST; el SPA no acepta POST).
    urlReturn: opts.urlReturn ?? `${opts.apiBase}/public/pagos/flow/${opts.slug}/retorno`,
  })

  if (!res.ok) {
    await db.pagoOnline.update({ where: { id: pago.id }, data: { estado: 'RECHAZADO' } }).catch(() => {})
    return { estado: 'error', mensaje: res.error }
  }
  await db.pagoOnline.update({ where: { id: pago.id }, data: { estado: 'PENDIENTE', url: res.url, flowToken: res.token } })
  return { estado: 'ok', url: res.url, pagoId: pago.id }
}

// Webhook de Flow: recibe el token, consulta el estado real y concilia el cobro.
// Flow reintenta si no recibe 200, así que respondemos ok salvo error irrecuperable.
export async function procesarWebhookFlow(db: TenantClient, token: string): Promise<void> {
  if (!token) return
  const pago = await db.pagoOnline.findFirst({ where: { flowToken: token } })
  if (!pago) return
  const cfg = await leerFlowConfig(db)
  const estado = await flowGetStatus(cfg, token)
  if (!estado.ok) return
  // 2 = pagada. El resto: pendiente/rechazada/anulada.
  const nuevoEstado = estado.estado === 2 ? 'PAGADO' : estado.estado === 3 ? 'RECHAZADO' : estado.estado === 4 ? 'ANULADO' : 'PENDIENTE'
  if (pago.estado === 'PAGADO') return // idempotencia
  await db.pagoOnline.update({ where: { id: pago.id }, data: { estado: nuevoEstado, pagadoAt: nuevoEstado === 'PAGADO' ? new Date() : null } })
  if (nuevoEstado !== 'PAGADO') return

  // Si se pagó y el cobro seguía pendiente, lo marca pagado (método FLOW). La caja
  // se concilia aparte: aquí no generamos movimiento de caja automáticamente.
  if (pago.cobroId) {
    const cobro = await db.cobro.findUnique({ where: { id: pago.cobroId }, select: { estado: true, anulado: true } })
    if (cobro && !cobro.anulado && cobro.estado !== 'PAGADO') {
      await db.cobro.update({ where: { id: pago.cobroId }, data: { estado: 'PAGADO', metodoPago: 'FLOW', fechaPago: new Date() } })
      // Conversión del embudo: el pago online cuenta como cobro pagado. El helper no lanza ni
      // bloquea con Meta. Import dinámico para evitar un ciclo de módulos (pagos ↔ crm ↔ cobros).
      const { marcarConvertidoPorCobro } = await import('@/services/crm.service')
      await marcarConvertidoPorCobro(db, pago.pacienteId, 'Sistema (pago online)')
    }
  }

  // Si el pago era el abono de una reserva online, confirma el abono en la cita y
  // envía la confirmación de hora al paciente (best-effort).
  if (pago.citaId) {
    const cita = await db.cita.findUnique({
      where: { id: pago.citaId },
      select: { id: true, fecha: true, tipo: true, abonoPagado: true, paciente: { select: { email: true, nombre: true, apellido: true } }, doctor: { select: { name: true } } },
    })
    if (cita && !cita.abonoPagado) {
      await db.cita.update({ where: { id: cita.id }, data: { abonoPagado: true, logs: { create: { tipo: 'AGENDADA', detalle: 'Abono pagado y confirmado (Flow)', userName: 'Sistema' } } } }).catch(() => {})
      // Import dinámico para evitar un ciclo de módulos (pagos ↔ email ↔ cobros).
      const { enviarConfirmacionHora } = await import('@/services/email.service')
      void enviarConfirmacionHora(db, {
        email: cita.paciente.email, pacienteNombre: `${cita.paciente.nombre} ${cita.paciente.apellido}`.trim(),
        fecha: cita.fecha, profesional: cita.doctor?.name ?? null, tipo: cita.tipo,
        nota: 'Recibimos tu abono. ¡Tu hora quedó confirmada!',
      })
    }
  }
}

// Lista los pagos online de un cobro (para mostrar el estado del link).
export async function listarPagosDeCobro(db: TenantClient, cobroId: string) {
  return db.pagoOnline.findMany({ where: { cobroId }, orderBy: { createdAt: 'desc' } })
}
