import { createHmac } from 'node:crypto'

// Cobro online a PACIENTES vía Flow, con las credenciales de CADA clínica (el
// dinero cae en su cuenta). Flow firma cada request con HMAC-SHA256 sobre los
// parámetros ordenados alfabéticamente. Doc: https://www.flow.cl/docs/api.html
// Estados de Flow: 1=pendiente, 2=pagada, 3=rechazada, 4=anulada.

export interface FlowConfig { enabled: boolean; apiKey: string | null; secretKey: string | null; sandbox: boolean }

export function flowConfigurado(c: FlowConfig): boolean {
  return Boolean(c.enabled && c.apiKey && c.secretKey)
}

function baseUrl(sandbox: boolean): string {
  return sandbox ? 'https://sandbox.flow.cl/api' : 'https://www.flow.cl/api'
}

// Firma: concatena "clavevalor" de los params ordenados y aplica HMAC-SHA256.
function firmar(params: Record<string, string>, secretKey: string): string {
  const toSign = Object.keys(params).sort().map((k) => `${k}${params[k]}`).join('')
  return createHmac('sha256', secretKey).update(toSign).digest('hex')
}

function urlEncoded(params: Record<string, string>): string {
  return Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
}

export interface CrearPagoArgs {
  config: FlowConfig
  commerceOrder: string      // orden única nuestra (idempotencia/conciliación)
  subject: string            // concepto visible
  amount: number             // CLP entero
  email: string
  urlConfirmation: string    // webhook server-to-server
  urlReturn: string          // a dónde vuelve el paciente
  timeoutSeg?: number        // segundos hasta que Flow expire la orden (link no pagable)
}
export type FlowCrearResult =
  | { ok: true; url: string; token: string; flowOrder?: string }
  | { ok: false; error: string }

export async function flowCrearPago(a: CrearPagoArgs): Promise<FlowCrearResult> {
  if (!flowConfigurado(a.config)) return { ok: false, error: 'Flow no está configurado en esta clínica.' }
  const params: Record<string, string> = {
    apiKey: a.config.apiKey!,
    commerceOrder: a.commerceOrder,
    subject: a.subject,
    currency: 'CLP',
    amount: String(Math.round(a.amount)),
    email: a.email,
    urlConfirmation: a.urlConfirmation,
    urlReturn: a.urlReturn,
  }
  // `timeout` (opcional en Flow): segundos hasta que la orden expire. Con esto Flow
  // deja el link NO pagable pasadas las 48 h (además de nuestro control por expiraEn).
  if (a.timeoutSeg && Number.isFinite(a.timeoutSeg) && a.timeoutSeg > 0) params.timeout = String(Math.round(a.timeoutSeg))
  params.s = firmar(params, a.config.secretKey!)
  try {
    const r = await fetch(`${baseUrl(a.config.sandbox)}/payment/create`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: urlEncoded(params),
    })
    const data = (await r.json().catch(() => ({}))) as { url?: string; token?: string; flowOrder?: number; message?: string }
    if (r.ok && data.url && data.token) {
      return { ok: true, url: `${data.url}?token=${data.token}`, token: data.token, flowOrder: data.flowOrder != null ? String(data.flowOrder) : undefined }
    }
    return { ok: false, error: data.message ?? `Flow respondió ${r.status}.` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo conectar con Flow.' }
  }
}

// Consulta el estado real de un pago por su token (lo usa el webhook de confirmación).
export type FlowEstadoResult =
  | { ok: true; estado: number; commerceOrder: string; amount: number }
  | { ok: false; error: string }

export async function flowGetStatus(config: FlowConfig, token: string): Promise<FlowEstadoResult> {
  if (!flowConfigurado(config)) return { ok: false, error: 'Flow no configurado' }
  const params: Record<string, string> = { apiKey: config.apiKey!, token }
  params.s = firmar(params, config.secretKey!)
  try {
    const r = await fetch(`${baseUrl(config.sandbox)}/payment/getStatus?${urlEncoded(params)}`)
    const data = (await r.json().catch(() => ({}))) as { status?: number; commerceOrder?: string; amount?: number | string; message?: string }
    if (r.ok && data.status != null) return { ok: true, estado: Number(data.status), commerceOrder: String(data.commerceOrder ?? ''), amount: Number(data.amount ?? 0) }
    return { ok: false, error: data.message ?? `Flow respondió ${r.status}.` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error de red con Flow' }
  }
}
