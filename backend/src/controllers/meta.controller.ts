import type { Request, Response } from 'express'
import * as svc from '@/services/meta-leadads.service'
import { log, serializeError } from '@/lib/logger'
import { captureError } from '@/lib/observability'

// Webhook NATIVO de Meta Lead Ads (campo `leadgen` del objeto `page`). Ruta
// pública y CROSS-TENANT: no lleva slug; el tenant se resuelve por page_id.

// GET: handshake de verificación de Meta. Responde el hub.challenge en texto plano.
export function getMetaWebhook(req: Request, res: Response) {
  const mode = String(req.query['hub.mode'] ?? '')
  const token = String(req.query['hub.verify_token'] ?? '')
  const challenge = String(req.query['hub.challenge'] ?? '')
  const ch = svc.verificarWebhook(mode, token, challenge)
  if (ch === null) return res.status(403).send('Forbidden')
  return res.status(200).type('text/plain').send(ch)
}

// POST: recepción de eventos. Valida la firma HMAC del body CRUDO, responde 200
// de inmediato y procesa en segundo plano (Meta reintenta si no ve el 200 rápido).
export function postMetaWebhook(req: Request, res: Response) {
  const raw = (req as Request & { rawBody?: Buffer }).rawBody
  if (!svc.firmaValida(raw, req.get('x-hub-signature-256'))) {
    return res.status(401).send('invalid signature')
  }
  // Copiamos el body ya parseado antes de responder; el procesamiento no bloquea.
  const payload = req.body
  res.status(200).send('EVENT_RECEIVED')
  void svc.procesarWebhookLeadgen(payload).catch((e) => {
    log.error('meta-leadads: procesamiento async del webhook falló', { err: serializeError(e) })
    captureError(e, { route: 'webhook meta-leadads' })
  })
}
