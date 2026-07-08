// Suscripción vista desde la CLÍNICA (su propio plan, monto, moneda y estado de
// pago). Los datos de facturación viven en el control-plane; la clínica solo lee
// los suyos (por su clinicaId del JWT). No expone datos de otras clínicas.

import { control } from '@/db/control'
import { notFound } from '@/lib/errors'
import { getPlan, PROFESIONAL_EXTRA_PRECIO } from '@/lib/plans'
import { getEstadoPago } from '@/lib/billing'
import { monedaCobroDe } from '@shared/constants/cobro'
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
async function calcularTotal(c: Awaited<ReturnType<typeof cargarClinica>>) {
  const plan = await getPlan(c.plan)
  const precioPlan = c.precioAcordado ?? plan?.precioMensual ?? 0
  const montoExtras = c.extras.reduce((s, e) => s + e.montoMensual, 0)
  const montoProfesionales = (c.profesionalesExtra ?? 0) * PROFESIONAL_EXTRA_PRECIO
  return { plan, precioPlan, montoExtras, montoProfesionales, total: precioPlan + montoExtras + montoProfesionales }
}

export async function estadoSuscripcion(clinicaId: string) {
  const c = await cargarClinica(clinicaId)
  const moneda = monedaCobroDe(c.pais, c.monedaCobro)
  const proveedor = proveedorPara(moneda)
  const { plan, precioPlan, montoExtras, montoProfesionales, total } = await calcularTotal(c)
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
  const { plan, total } = await calcularTotal(c)
  return crearEnlacePago({
    clinicaId,
    clinicaNombre: c.nombre,
    email: c.email || null,
    monto: total,
    moneda,
    concepto: `Suscripción Cláriva ${plan?.nombre ?? c.plan}`,
    recurrente,
  })
}
