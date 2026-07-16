// Suscripción vista desde la CLÍNICA (su propio plan, monto, moneda y estado de
// pago). Los datos de facturación viven en el control-plane; la clínica solo lee
// los suyos (por su clinicaId del JWT). No expone datos de otras clínicas.

import { control } from '@/db/control'
import { notFound } from '@/lib/errors'
import { getPlan, precioPlanEnMoneda, precioProfesionalExtra } from '@/lib/plans'
import { getEstadoPago, calcularProximoCobro } from '@/lib/billing'
import { monedaCobroDe, type MonedaCobro } from '@shared/constants/cobro'
import { crearEnlacePago, proveedorPara, pasarelaConfigurada, type ResultadoEnlace } from '@/lib/pagos'

async function cargarClinica(clinicaId: string) {
  const c = await control.clinica.findUnique({
    where: { id: clinicaId },
    include: { extras: { where: { activo: true } }, metodoPago: true },
  })
  if (!c) throw notFound('Clínica no encontrada')
  return c
}

// Calcula el total mensual de la suscripción en la moneda de cobro de la clínica.
// El precio del plan y del profesional extra dependen de la moneda (CLP/USD); los
// extras y el precio acordado ya vienen en la moneda de la clínica.
async function calcularTotal(c: Awaited<ReturnType<typeof cargarClinica>>, moneda: MonedaCobro) {
  const plan = await getPlan(c.plan)
  const precioPlan = c.precioAcordado ?? precioPlanEnMoneda(plan, moneda)
  const montoExtras = c.extras.reduce((s, e) => s + e.montoMensual, 0)
  const montoProfesionales = (c.profesionalesExtra ?? 0) * precioProfesionalExtra(moneda)
  return { plan, precioPlan, montoExtras, montoProfesionales, total: precioPlan + montoExtras + montoProfesionales }
}

export async function estadoSuscripcion(clinicaId: string) {
  const c = await cargarClinica(clinicaId)
  const moneda = monedaCobroDe(c.pais, c.monedaCobro)
  const proveedor = proveedorPara(moneda)
  const { plan, precioPlan, montoExtras, montoProfesionales, total } = await calcularTotal(c, moneda)
  const estado = getEstadoPago({ plan: c.plan, activo: c.activo, trialHasta: c.trialHasta, proximoCobro: c.proximoCobro, precioAcordado: c.precioAcordado, cicloFacturacion: c.cicloFacturacion })
  return {
    plan: plan?.nombre ?? c.plan,
    planId: c.plan,
    moneda,
    cicloFacturacion: c.cicloFacturacion,
    precioPlan,
    montoExtras,
    montoProfesionales,
    profesionalesExtra: c.profesionalesExtra ?? 0,
    total,
    estado,
    proximoCobro: c.proximoCobro?.toISOString() ?? null,
    trialHasta: c.trialHasta?.toISOString() ?? null,
    cobroAutomatico: c.cobroAutomatico,
    proveedor,
    pasarelaConfigurada: pasarelaConfigurada(proveedor),
    metodo: c.metodoPago ? { provider: c.metodoPago.provider, marca: c.metodoPago.marca, ultimos4: c.metodoPago.ultimos4, exp: c.metodoPago.exp } : null,
  }
}

// Genera el enlace de pago (único o recurrente) para que la clínica pague su
// suscripción. Devuelve el resultado de la pasarela (incluye el caso
// "aún no configurada" para que la UI lo muestre sin error).
export async function generarEnlacePago(clinicaId: string, recurrente: boolean): Promise<ResultadoEnlace> {
  const c = await cargarClinica(clinicaId)
  const moneda = monedaCobroDe(c.pais, c.monedaCobro)
  const { plan, total } = await calcularTotal(c, moneda)
  return crearEnlacePago({
    clinicaId,
    clinicaNombre: c.nombre,
    email: c.email || null,
    planId: c.plan,
    monto: total,
    moneda,
    concepto: `Suscripción Cláriva ${plan?.nombre ?? c.plan}`,
    recurrente,
  })
}

// Procesa un evento de PAGO de Lemon Squeezy (webhook): avanza el próximo cobro
// de la clínica y registra el pago. Idempotente por el id del pago (comprobante).
// Sólo actúa sobre `subscription_payment_success` (cubre primer pago y renovaciones).
interface LemonPayload {
  meta?: { event_name?: string; custom_data?: { clinica_id?: string } }
  data?: { id?: string | number }
}
export async function registrarPagoLemon(payload: LemonPayload): Promise<{ ok: boolean; motivo?: string }> {
  const evento = payload?.meta?.event_name ?? ''
  if (evento !== 'subscription_payment_success') return { ok: true, motivo: `evento ignorado: ${evento || 'sin evento'}` }
  const clinicaId = payload?.meta?.custom_data?.clinica_id
  if (!clinicaId) return { ok: false, motivo: 'sin clinica_id' }

  const c = await control.clinica.findUnique({ where: { id: clinicaId } })
  if (!c) return { ok: false, motivo: 'clínica no encontrada' }

  // Idempotencia: si ya registramos este pago (mismo id de Lemon), no repetir.
  const comprobante = payload?.data?.id ? `LEMON:${payload.data.id}` : null
  if (comprobante) {
    const ya = await control.pagoSuscripcion.findFirst({ where: { clinicaId, comprobante } })
    if (ya) return { ok: true, motivo: 'pago ya registrado' }
  }

  const ciclo = c.cicloFacturacion === 'ANUAL' ? 'ANUAL' : 'MENSUAL'
  const ahora = new Date()
  const proximo = calcularProximoCobro({ proximoActual: c.proximoCobro, fechaPago: ahora, ciclo })
  const plan = await getPlan(c.plan)
  const monto = c.precioAcordado ?? precioPlanEnMoneda(plan, 'USD')

  await control.$transaction([
    control.clinica.update({
      where: { id: clinicaId },
      data: {
        activo: true, cobroAutomatico: true,
        suscripcionProvider: 'LEMONSQUEEZY',
        suscripcionRef: payload?.data?.id ? String(payload.data.id) : c.suscripcionRef,
        proximoCobro: proximo,
      },
    }),
    control.pagoSuscripcion.create({
      data: {
        clinicaId, monto, moneda: 'USD', metodoPago: 'OTRO',
        periodoDesde: ahora, periodoHasta: proximo,
        comprobante, notas: 'Lemon Squeezy · subscription_payment_success', registradoPor: 'webhook',
      },
    }),
  ])
  return { ok: true }
}
