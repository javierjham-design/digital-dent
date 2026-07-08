// Abstracción de pasarelas de pago para el cobro de la suscripción de las clínicas.
// Regla: CLP se cobra con Flow; USD con Stripe. Las credenciales se leen SOLO de
// variables de entorno (nunca hardcodeadas). Esta capa deja la estructura lista
// para conectar: expone qué pasarela corresponde, si está configurada, y los
// puntos de integración (crear enlace de pago / crear suscripción recurrente).
// La llamada HTTP real a cada proveedor es el paso pendiente de "conectar".

import type { MonedaCobro } from '@shared/constants/cobro'

export type ProveedorPago = 'FLOW' | 'STRIPE'

// Proveedor que corresponde según la moneda de cobro.
export function proveedorPara(moneda: MonedaCobro): ProveedorPago {
  return moneda === 'USD' ? 'STRIPE' : 'FLOW'
}

// ¿Están cargadas las credenciales de una pasarela? (no expone los valores)
export function pasarelaConfigurada(p: ProveedorPago): boolean {
  if (p === 'FLOW') return Boolean(process.env.FLOW_API_KEY && process.env.FLOW_SECRET_KEY)
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

export interface EstadoPasarelas {
  flow: { configurada: boolean; moneda: 'CLP' }
  stripe: { configurada: boolean; moneda: 'USD' }
}
export function estadoPasarelas(): EstadoPasarelas {
  return {
    flow: { configurada: pasarelaConfigurada('FLOW'), moneda: 'CLP' },
    stripe: { configurada: pasarelaConfigurada('STRIPE'), moneda: 'USD' },
  }
}

export interface EnlacePagoArgs {
  clinicaId: string
  clinicaNombre: string
  email: string | null
  monto: number
  moneda: MonedaCobro
  concepto: string      // ej: "Suscripción CLÁRIVA Pro — julio 2026"
  recurrente: boolean   // true = crear suscripción; false = pago único
}

export type ResultadoEnlace =
  | { estado: 'ok'; proveedor: ProveedorPago; url: string; ref: string }
  | { estado: 'no_configurada'; proveedor: ProveedorPago; mensaje: string }
  | { estado: 'pendiente'; proveedor: ProveedorPago; mensaje: string }

// Genera el enlace/orden de pago (o suscripción) en la pasarela. Devuelve un
// estado en vez de lanzar, para que la UI muestre el caso "aún no configurada".
// TODO(conectar): implementar la llamada real a Flow (createPayment / subscription)
// y a Stripe (Checkout Session / Subscription) usando las credenciales de env.
export async function crearEnlacePago(args: EnlacePagoArgs): Promise<ResultadoEnlace> {
  const proveedor = proveedorPara(args.moneda)
  if (!pasarelaConfigurada(proveedor)) {
    return {
      estado: 'no_configurada',
      proveedor,
      mensaje: `La pasarela ${proveedor} (${args.moneda}) aún no está configurada: faltan las credenciales en el servidor.`,
    }
  }
  // Credenciales presentes, pero la integración HTTP real es el paso siguiente.
  return {
    estado: 'pendiente',
    proveedor,
    mensaje: `Integración con ${proveedor} en preparación. La estructura está lista para conectar el ${args.recurrente ? 'cobro recurrente' : 'pago'}.`,
  }
}
