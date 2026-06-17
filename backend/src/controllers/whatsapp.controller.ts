import type { Request, Response } from 'express'
import { prisma } from '@/lib/prisma'
import { env } from '@/config/env'
import { unauthorized } from '@/lib/errors'
import { decryptNullable } from '@/lib/crypto'
import { verifyToken } from '@/services/auth.service'
import { enviarRecordatoriosPendientes, procesarRespuestaEntrante, validarFirmaTwilio } from '@/lib/whatsapp'

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function twiml(res: Response, mensaje: string | null) {
  const inner = mensaje ? `<Message>${escapeXml(mensaje)}</Message>` : ''
  res.set('Content-Type', 'text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`)
}

// POST /api/v1/whatsapp/webhook — Twilio (form-urlencoded). Público; cada
// request se valida con la firma X-Twilio-Signature usando el token de la
// clínica dueña del número.
export async function postWebhook(req: Request, res: Response) {
  const params: Record<string, string> = {}
  for (const [k, v] of Object.entries(req.body ?? {})) if (typeof v === 'string') params[k] = v

  const to = (params.To ?? '').replace(/^whatsapp:/, '')
  const from = (params.From ?? '').replace(/^whatsapp:/, '')
  if (!to || !from) return twiml(res, null)

  const clinica = await prisma.clinica.findFirst({ where: { waNumero: to, waEnabled: true }, select: { id: true, waTwilioToken: true } })
  if (!clinica) return twiml(res, null)

  const token = decryptNullable(clinica.waTwilioToken)
  if (!token) return twiml(res, null)

  const proto = (req.headers['x-forwarded-proto'] as string) ?? 'https'
  const host = req.headers.host ?? ''
  const url = `${proto}://${host}/api/v1/whatsapp/webhook`
  const firma = (req.headers['x-twilio-signature'] as string) ?? null
  if (!validarFirmaTwilio(token, url, params, firma)) {
    res.status(403).json({ error: 'Firma inválida' })
    return
  }

  const texto = params.ButtonText || params.ButtonPayload || params.Body || ''
  if (!texto.trim()) return twiml(res, null)

  const respuesta = await procesarRespuestaEntrante({
    clinicaId: clinica.id, fromE164: from, texto, originalMessageSid: params.OriginalRepliedMessageSid || null,
  }).catch(() => null)
  twiml(res, respuesta)
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
