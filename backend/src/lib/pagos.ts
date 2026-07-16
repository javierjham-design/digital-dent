// Pasarelas de pago para la SUSCRIPCIÓN de las clínicas (ingreso de Cláriva).
// Regla: USD se cobra con **Lemon Squeezy** (Merchant of Record: ellos son el
// vendedor legal y manejan impuestos globales); CLP con Flow. Credenciales SOLO
// por variables de entorno. Esta capa expone qué pasarela corresponde, si está
// configurada, crea el checkout y verifica el webhook.

import crypto from 'node:crypto'
import type { MonedaCobro } from '@shared/constants/cobro'

export type ProveedorPago = 'FLOW' | 'LEMONSQUEEZY' | 'STRIPE'

// USD → Lemon Squeezy (MoR). CLP → Flow.
export function proveedorPara(moneda: MonedaCobro): ProveedorPago {
  return moneda === 'USD' ? 'LEMONSQUEEZY' : 'FLOW'
}

// ¿Están cargadas las credenciales de una pasarela? (no expone los valores)
export function pasarelaConfigurada(p: ProveedorPago): boolean {
  if (p === 'FLOW') return Boolean(process.env.FLOW_API_KEY && process.env.FLOW_SECRET_KEY)
  if (p === 'LEMONSQUEEZY') return Boolean(process.env.LEMONSQUEEZY_API_KEY && process.env.LEMONSQUEEZY_STORE_ID)
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

export interface EstadoPasarelas {
  flow: { configurada: boolean; moneda: 'CLP' }
  lemonsqueezy: { configurada: boolean; moneda: 'USD' }
}
export function estadoPasarelas(): EstadoPasarelas {
  return {
    flow: { configurada: pasarelaConfigurada('FLOW'), moneda: 'CLP' },
    lemonsqueezy: { configurada: pasarelaConfigurada('LEMONSQUEEZY'), moneda: 'USD' },
  }
}

// Variant (producto de suscripción) de Lemon Squeezy para un plan. Se crea en el
// dashboard de Lemon Squeezy y su id se carga por env: LEMONSQUEEZY_VARIANT_<PLAN>.
function lemonVariantFor(planId: string): string | undefined {
  return process.env[`LEMONSQUEEZY_VARIANT_${planId.toUpperCase()}`]
}

export interface EnlacePagoArgs {
  clinicaId: string
  clinicaNombre: string
  email: string | null
  planId: string
  monto: number
  moneda: MonedaCobro
  concepto: string
  recurrente: boolean
}

export type ResultadoEnlace =
  | { estado: 'ok'; proveedor: ProveedorPago; url: string; ref: string }
  | { estado: 'no_configurada'; proveedor: ProveedorPago; mensaje: string }
  | { estado: 'pendiente'; proveedor: ProveedorPago; mensaje: string }

// Genera el checkout/enlace de pago (o suscripción) en la pasarela.
export async function crearEnlacePago(args: EnlacePagoArgs): Promise<ResultadoEnlace> {
  const proveedor = proveedorPara(args.moneda)
  if (!pasarelaConfigurada(proveedor)) {
    return { estado: 'no_configurada', proveedor, mensaje: `La pasarela ${proveedor} (${args.moneda}) aún no está configurada: faltan las credenciales en el servidor.` }
  }
  if (proveedor === 'LEMONSQUEEZY') return crearCheckoutLemon(args)
  // Flow (CLP) para la suscripción de la plataforma: integración pendiente.
  return { estado: 'pendiente', proveedor, mensaje: `Integración con ${proveedor} en preparación.` }
}

// Crea un checkout hospedado de Lemon Squeezy para el variant del plan. El pago
// inicia una suscripción (recurrente); el mismo enlace sirve como "enlace manual".
async function crearCheckoutLemon(args: EnlacePagoArgs): Promise<ResultadoEnlace> {
  const variant = lemonVariantFor(args.planId)
  if (!variant) {
    return { estado: 'no_configurada', proveedor: 'LEMONSQUEEZY', mensaje: `Falta el variant de Lemon Squeezy para el plan ${args.planId} (env LEMONSQUEEZY_VARIANT_${args.planId.toUpperCase()}).` }
  }
  const body = {
    data: {
      type: 'checkouts',
      attributes: {
        checkout_data: {
          email: args.email ?? undefined,
          name: args.clinicaNombre,
          custom: { clinica_id: args.clinicaId, plan: args.planId },
        },
      },
      relationships: {
        store: { data: { type: 'stores', id: String(process.env.LEMONSQUEEZY_STORE_ID) } },
        variant: { data: { type: 'variants', id: String(variant) } },
      },
    },
  }
  try {
    const res = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        Authorization: `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`,
      },
      body: JSON.stringify(body),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = (await res.json().catch(() => ({}))) as any
    if (!res.ok) {
      const msg = json?.errors?.[0]?.detail ?? `Error ${res.status} al crear el checkout`
      return { estado: 'pendiente', proveedor: 'LEMONSQUEEZY', mensaje: `Lemon Squeezy: ${msg}` }
    }
    const url = json?.data?.attributes?.url
    if (!url) return { estado: 'pendiente', proveedor: 'LEMONSQUEEZY', mensaje: 'Lemon Squeezy no devolvió una URL de checkout.' }
    return { estado: 'ok', proveedor: 'LEMONSQUEEZY', url, ref: String(json?.data?.id ?? '') }
  } catch (e) {
    return { estado: 'pendiente', proveedor: 'LEMONSQUEEZY', mensaje: `No se pudo contactar a Lemon Squeezy: ${e instanceof Error ? e.message : 'error'}` }
  }
}

// Verifica la firma del webhook de Lemon Squeezy: HMAC-SHA256 del raw body con el
// LEMONSQUEEZY_WEBHOOK_SECRET, comparado con el header X-Signature (hex).
export function verifyLemonWebhook(rawBody: Buffer | string, signature: string | undefined): boolean {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET
  if (!secret || !signature) return false
  const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(signature, 'hex'))
  } catch {
    return false
  }
}
