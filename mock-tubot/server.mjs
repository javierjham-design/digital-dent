// Mock de TuBot (canal WhatsApp) para desarrollar la integración de Cláriva SIN
// credenciales. Implementa el contrato de docs/TUBOT_WHATSAPP.md:
//   · Enviar:  POST /public/v1/messages/template · POST /public/v1/messages/text
//              GET  /public/v1/templates/:name
//   · Recibir: un SIMULADOR (rutas /_sim/*) que FIRMA y entrega webhooks entrantes
//              (button / text / status) a la URL de Cláriva.
// Sin dependencias: sólo http + crypto + fetch nativos (Node 18+).
import { createServer } from 'node:http'
import { createHmac, randomUUID } from 'node:crypto'

const PORT = Number(process.env.PORT ?? 4020)
// Base del webhook de Cláriva; el connectionId se agrega por request.
const CLARIVA_WEBHOOK_BASE = process.env.CLARIVA_WEBHOOK_BASE ?? 'http://localhost:4000/api/v1/whatsapp/webhook'
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? 'dev-webhook-secret' // firma TuBot→Cláriva
const API_KEY = process.env.API_KEY ?? 'cnvk_dev'                          // key Cláriva→TuBot
const RATE_LIMIT_PER_MIN = Number(process.env.RATE_LIMIT_PER_MIN ?? 0)     // 0 = desactivado

// ── Estado en memoria ────────────────────────────────────────────────────────
const idempotencia = new Map()      // Idempotency-Key → messageId (dedupe del envío)
const enviados = new Map()          // messageId → { to, templateName, ... }
const estadoPlantilla = new Map()   // templateName → APPROVED | PENDING | REJECTED | DISABLED
const rate = new Map()              // apiKey → { min, count }
let seq = 0
const nuevoId = (p) => `mock_${p}_${(++seq).toString().padStart(4, '0')}_${randomUUID().slice(0, 8)}`

const firmar = (raw) => 'sha256=' + createHmac('sha256', WEBHOOK_SECRET).update(raw, 'utf8').digest('hex')

// ── Helpers HTTP ─────────────────────────────────────────────────────────────
function leerBody(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => { data += c })
    req.on('end', () => resolve(data))
  })
}
function json(res, code, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(body)
}
function autorizado(req) {
  const h = req.headers['authorization'] ?? ''
  if (!h.startsWith('Bearer cnvk_')) return false
  const key = h.slice('Bearer '.length).trim()
  return key === API_KEY || process.env.LENIENT_AUTH === '1' // en dev, cualquier cnvk_ si LENIENT
}
function rateLimitExcedido(req) {
  if (RATE_LIMIT_PER_MIN <= 0) return false
  const key = (req.headers['authorization'] ?? '').slice(7)
  const min = Math.floor(Date.now() / 60000)
  const r = rate.get(key)
  if (!r || r.min !== min) { rate.set(key, { min, count: 1 }); return false }
  r.count++
  return r.count > RATE_LIMIT_PER_MIN
}

// Entrega un webhook FIRMADO a Cláriva y devuelve el status HTTP recibido.
async function entregarWebhook(connectionId, payload) {
  const raw = JSON.stringify(payload)
  const url = `${CLARIVA_WEBHOOK_BASE}/${connectionId}`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Tubot-Signature': firmar(raw) },
      body: raw,
    })
    const texto = await res.text().catch(() => '')
    return { ok: res.ok, status: res.status, url, respuesta: texto.slice(0, 300) }
  } catch (e) {
    return { ok: false, status: 0, url, error: e instanceof Error ? e.message : String(e) }
  }
}

// ── Rutas ────────────────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? '/', `http://localhost:${PORT}`)
  const raw = ['POST', 'PUT', 'PATCH'].includes(req.method ?? '') ? await leerBody(req) : ''
  const body = raw ? safeJson(raw) : {}

  // ── ENVIAR: plantilla ──
  if (req.method === 'POST' && pathname === '/public/v1/messages/template') {
    if (!autorizado(req)) return json(res, 401, { error: 'unauthorized' })
    if (rateLimitExcedido(req)) { res.setHeader('Retry-After', '30'); return json(res, 429, { error: 'rate_limited', message: 'Demasiadas solicitudes' }) }
    const idem = req.headers['idempotency-key']
    if (!idem || typeof idem !== 'string') return json(res, 400, { error: 'missing_idempotency_key', message: 'Falta el header Idempotency-Key' })
    if (!body?.to || !body?.templateName) return json(res, 400, { error: 'invalid_body', message: 'Se requieren "to" y "templateName"' })

    const estado = estadoPlantilla.get(body.templateName) ?? 'APPROVED'
    if (estado !== 'APPROVED') return json(res, 422, { error: 'template_not_approved', message: `La plantilla "${body.templateName}" está ${estado}` })

    // Idempotencia: misma key ⇒ mismo messageId, sin reenviar.
    if (idempotencia.has(idem)) return json(res, 200, { messageId: idempotencia.get(idem), status: 'accepted', deduped: true })
    const messageId = nuevoId('out')
    idempotencia.set(idem, messageId)
    enviados.set(messageId, { to: body.to, templateName: body.templateName, variables: body.variables ?? [], idem, at: new Date().toISOString() })
    console.log(`[tubot-mock] template → ${body.to} (${body.templateName}) msg=${messageId} idem=${idem}`)
    return json(res, 202, { messageId, status: 'accepted' })
  }

  // ── ENVIAR: texto libre (acuse) ──
  if (req.method === 'POST' && pathname === '/public/v1/messages/text') {
    if (!autorizado(req)) return json(res, 401, { error: 'unauthorized' })
    if (!body?.to || !body?.text) return json(res, 400, { error: 'invalid_body', message: 'Se requieren "to" y "text"' })
    const messageId = nuevoId('out')
    console.log(`[tubot-mock] text → ${body.to}: ${String(body.text).slice(0, 60)}`)
    return json(res, 202, { messageId, status: 'accepted' })
  }

  // ── Estado de plantilla ──
  if (req.method === 'GET' && pathname.startsWith('/public/v1/templates/')) {
    if (!autorizado(req)) return json(res, 401, { error: 'unauthorized' })
    const name = decodeURIComponent(pathname.split('/').pop() ?? '')
    return json(res, 200, { name, languageCode: 'es', status: estadoPlantilla.get(name) ?? 'APPROVED' })
  }

  // ── SIMULADOR (control del mock; NO es parte del contrato) ──
  // Fija el estado de una plantilla: { name, status }
  if (req.method === 'POST' && pathname === '/_sim/template-status') {
    estadoPlantilla.set(body.name, body.status)
    return json(res, 200, { ok: true, name: body.name, status: body.status })
  }
  // Empuja una respuesta entrante a Cláriva: { connectionId, from, payload?, text?, replyTo? }
  if (req.method === 'POST' && pathname === '/_sim/inbound') {
    if (!body?.connectionId || !body?.from) return json(res, 400, { error: 'connectionId y from son requeridos' })
    const payload = body.payload
      ? { event: 'button', occurredAt: new Date().toISOString(), from: body.from, providerMsgId: nuevoId('in'), replyTo: body.replyTo ?? null, button: { payload: body.payload, text: body.payload } }
      : { event: 'text', occurredAt: new Date().toISOString(), from: body.from, providerMsgId: nuevoId('in'), replyTo: body.replyTo ?? null, text: body.text ?? '' }
    const r = await entregarWebhook(body.connectionId, payload)
    return json(res, 200, { enviado: payload, entrega: r })
  }
  // Empuja un estado de entrega a Cláriva: { connectionId, providerMsgId, status, reason? }
  if (req.method === 'POST' && pathname === '/_sim/status') {
    if (!body?.connectionId || !body?.providerMsgId || !body?.status) return json(res, 400, { error: 'connectionId, providerMsgId y status son requeridos' })
    const payload = { event: 'status', occurredAt: new Date().toISOString(), providerMsgId: body.providerMsgId, status: body.status, ...(body.reason ? { reason: body.reason } : {}) }
    const r = await entregarWebhook(body.connectionId, payload)
    return json(res, 200, { enviado: payload, entrega: r })
  }

  if (pathname === '/health') return json(res, 200, { ok: true, servicio: 'tubot-mock' })
  json(res, 404, { error: 'not_found', message: `${req.method} ${pathname}` })
})

function safeJson(s) { try { return JSON.parse(s) } catch { return {} } }

server.listen(PORT, () => {
  console.log(`[tubot-mock] escuchando en http://localhost:${PORT}`)
  console.log(`[tubot-mock] webhooks a: ${CLARIVA_WEBHOOK_BASE}/{connectionId}`)
  console.log(`[tubot-mock] API_KEY=${API_KEY}  WEBHOOK_SECRET=${WEBHOOK_SECRET}${RATE_LIMIT_PER_MIN ? `  rate=${RATE_LIMIT_PER_MIN}/min` : ''}`)
})
