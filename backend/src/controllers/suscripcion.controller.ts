import type { Request, Response } from 'express'
import * as svc from '@/services/suscripcion.service'
import { badRequest, unauthorized } from '@/lib/errors'
import { verifyLemonWebhook } from '@/lib/pagos'

function clinicaId(req: Request): string {
  const id = req.clinica?.id ?? req.auth?.clinicaId
  if (!id) throw badRequest('Requiere una clínica.')
  return id
}

export async function getSuscripcion(req: Request, res: Response) {
  res.json(await svc.estadoSuscripcion(clinicaId(req)))
}

export async function postEnlacePago(req: Request, res: Response) {
  const recurrente = Boolean((req.body ?? {}).recurrente)
  res.json(await svc.generarEnlacePago(clinicaId(req), recurrente))
}

// Webhook de Lemon Squeezy (público). Verifica la firma con el raw body y procesa
// el pago. Devuelve 200 aunque el evento se ignore, para que Lemon no reintente.
export async function postWebhookLemon(req: Request, res: Response) {
  const signature = req.headers['x-signature'] as string | undefined
  const raw = (req as Request & { rawBody?: Buffer }).rawBody
  if (!raw || !verifyLemonWebhook(raw, signature)) throw unauthorized('Firma de webhook inválida.')
  const result = await svc.registrarPagoLemon(req.body ?? {})
  res.json({ ok: result.ok, motivo: result.motivo })
}
