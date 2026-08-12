import type { Request, Response } from 'express'
import { tenantDb } from '@/middlewares/tenant'
import { env } from '@/config/env'
import { unauthorized } from '@/lib/errors'
import { verifyToken } from '@/services/auth.service'
import { tenantClient } from '@/db/tenant'
import { tubotProvider } from '@/lib/tubot'
import {
  enviarRecordatoriosPendientes, procesarEventoEntrante, configPorConexion, reenviarRecordatorioManual,
} from '@/lib/whatsapp'

// POST /api/v1/whatsapp/webhook/:connectionId — TuBot (JSON). Público; cada request
// se valida con X-Tubot-Signature (HMAC-SHA256 sobre el body crudo) usando el
// webhookSecret de la conexión. La connectionId de la URL rutea al tenant. Se
// responde 401 UNIFORME (no se distingue firma inválida de connectionId inexistente).
export async function postWebhook(req: Request, res: Response) {
  const connectionId = req.params.connectionId ?? ''
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody?.toString('utf8') ?? JSON.stringify(req.body ?? {})
  const firma = (req.headers['x-tubot-signature'] as string) ?? null

  const resolved = await configPorConexion(connectionId).catch(() => null)
  if (!resolved || !tubotProvider.verificarFirma(resolved.wa.webhookSecret, rawBody, firma)) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }

  const evento = tubotProvider.parseInbound(rawBody)
  if (evento) {
    const db = tenantClient(resolved.dbName)
    // Idempotente y best-effort: respondemos 2xx apenas procesamos; TuBot reintenta
    // sólo ante 5xx (ver contrato). Un error interno acá NO debe dar 5xx en cascada.
    await procesarEventoEntrante(db, resolved.wa, evento).catch(() => undefined)
  }
  res.status(200).json({ ok: true })
}

// POST /api/v1/whatsapp/recordatorios — cron (x-cron-secret) o admin.
export async function postRecordatorios(req: Request, res: Response) {
  const headerSecret = req.headers['x-cron-secret']
  const isCron = Boolean(env.cronSecret && headerSecret === env.cronSecret)
  if (!isCron) {
    const auth = req.headers.authorization
    const tk = auth?.startsWith('Bearer ') ? auth.slice(7) : null
    if (!tk) throw unauthorized()
    const payload = verifyToken(tk)
    if (payload.role !== 'admin' && !payload.isPlatformAdmin) throw unauthorized('Requiere administrador')
  }
  res.json(await enviarRecordatoriosPendientes())
}

// POST /api/v1/whatsapp/reenviar/:citaId — reenvío MANUAL de una cita (recepción).
export async function postReenviar(req: Request, res: Response) {
  const messageId = await reenviarRecordatorioManual(tenantDb(req), req.params.citaId)
  res.json({ ok: true, messageId })
}
