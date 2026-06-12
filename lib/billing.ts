export type EstadoPago = 'TRIAL' | 'AL_DIA' | 'ATRASADO' | 'SUSPENDIDO'
export type CicloFacturacion = 'MENSUAL' | 'ANUAL'

export interface ClinicaBillingInput {
  plan: string
  activo: boolean
  trialHasta: Date | string | null
  proximoCobro: Date | string | null
  precioAcordado: number | null
  cicloFacturacion?: string | null
}

// Mapa { planId -> precioMensual } que los consumidores pasan a las funciones
// de billing. Se construye una vez desde getPlanes() en el server component.
export type PlanPriceMap = Record<string, number>

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null
  return v instanceof Date ? v : new Date(v)
}

export function getEstadoPago(c: ClinicaBillingInput, now: Date = new Date()): EstadoPago {
  if (!c.activo) return 'SUSPENDIDO'
  if (c.plan === 'TRIAL') {
    const hasta = toDate(c.trialHasta)
    if (hasta && hasta.getTime() < now.getTime()) return 'ATRASADO'
    return 'TRIAL'
  }
  const proximo = toDate(c.proximoCobro)
  if (!proximo) return 'AL_DIA' // sin vencimiento definido, asumimos al día
  return proximo.getTime() < now.getTime() ? 'ATRASADO' : 'AL_DIA'
}

export function precioMensualEfectivo(
  c: Pick<ClinicaBillingInput, 'plan' | 'precioAcordado'>,
  planPrices: PlanPriceMap,
): number {
  if (c.precioAcordado != null && c.precioAcordado >= 0) return c.precioAcordado
  return planPrices[c.plan] ?? 0
}

export function precioPeriodo(c: ClinicaBillingInput, planPrices: PlanPriceMap): number {
  const mensual = precioMensualEfectivo(c, planPrices)
  return c.cicloFacturacion === 'ANUAL' ? mensual * 12 : mensual
}

// ─── Extras (cargos adicionales recurrentes sobre el plan) ─────────────────

export interface ExtraInput {
  montoMensual: number
  activo: boolean
}

/** Suma mensual de los extras ACTIVOS de una clínica. */
export function montoExtrasMensual(extras: ExtraInput[]): number {
  return extras.filter((e) => e.activo).reduce((s, e) => s + e.montoMensual, 0)
}

/** Plan (o precio acordado) + extras activos. Es lo que la clínica paga al mes. */
export function precioMensualTotal(
  c: Pick<ClinicaBillingInput, 'plan' | 'precioAcordado'>,
  planPrices: PlanPriceMap,
  extras: ExtraInput[],
): number {
  return precioMensualEfectivo(c, planPrices) + montoExtrasMensual(extras)
}

// Calcula el nuevo "proximoCobro" después de registrar un pago.
// El pago "consume" un período (mes o año) a partir del actual `proximoCobro`
// o del momento de pago si la cuenta venía atrasada / sin fecha.
export function calcularProximoCobro(args: {
  proximoActual: Date | string | null
  fechaPago: Date
  ciclo: CicloFacturacion
}): Date {
  const proximoActual = toDate(args.proximoActual)
  const base = proximoActual && proximoActual.getTime() > args.fechaPago.getTime()
    ? new Date(proximoActual)
    : new Date(args.fechaPago)
  if (args.ciclo === 'ANUAL') {
    base.setFullYear(base.getFullYear() + 1)
  } else {
    base.setMonth(base.getMonth() + 1)
  }
  return base
}

export function diasParaCobro(c: ClinicaBillingInput, now: Date = new Date()): number | null {
  const ref = c.plan === 'TRIAL' ? toDate(c.trialHasta) : toDate(c.proximoCobro)
  if (!ref) return null
  return Math.ceil((ref.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

export const ESTADO_PAGO_LABEL: Record<EstadoPago, string> = {
  TRIAL: 'En prueba',
  AL_DIA: 'Al día',
  ATRASADO: 'Atrasado',
  SUSPENDIDO: 'Suspendido',
}

export const ESTADO_PAGO_COLOR: Record<EstadoPago, string> = {
  TRIAL: 'bg-blue-100 text-blue-700',
  AL_DIA: 'bg-emerald-100 text-emerald-700',
  ATRASADO: 'bg-rose-100 text-rose-700',
  SUSPENDIDO: 'bg-slate-200 text-slate-600',
}

export const METODO_PAGO_OPCIONES = ['TRANSFERENCIA', 'WEBPAY', 'EFECTIVO', 'OTRO'] as const
