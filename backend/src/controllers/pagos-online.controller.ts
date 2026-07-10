import type { Request, Response } from 'express'
import { tenantDb, tenantDbPorSlug } from '@/middlewares/tenant'
import * as svc from '@/services/pagos-online.service'

// Base pública del backend (para el webhook de Flow) y del frontend (retorno del
// paciente). Se pueden fijar por env; si no, se derivan del request.
function apiBase(req: Request): string {
  if (process.env.API_PUBLIC_URL) return process.env.API_PUBLIC_URL.replace(/\/$/, '')
  const proto = (req.get('x-forwarded-proto') ?? req.protocol ?? 'https').split(',')[0]
  return `${proto}://${req.get('host')}/api/v1`
}
function appBase(req: Request): string {
  if (process.env.APP_PUBLIC_URL) return process.env.APP_PUBLIC_URL.replace(/\/$/, '')
  return (req.get('origin') ?? '').replace(/\/$/, '')
}

export async function getConfig(req: Request, res: Response) {
  res.json(await svc.obtenerConfigPagos(tenantDb(req)))
}
export async function patchConfig(req: Request, res: Response) {
  res.json(await svc.guardarConfigPagos(tenantDb(req), req.body ?? {}))
}

export async function postLinkParaCobro(req: Request, res: Response) {
  const r = await svc.crearLinkParaCobro(tenantDb(req), req.params.id, {
    apiBase: apiBase(req), appBase: appBase(req), slug: req.clinica?.slug ?? '', creadoPorId: req.auth?.sub,
  })
  res.json(r)
}
export async function getPagosDeCobro(req: Request, res: Response) {
  res.json(await svc.listarPagosDeCobro(tenantDb(req), req.params.id))
}

// Webhook público de Flow: llega por slug de la clínica. Flow envía `token` como
// form-urlencoded y espera 200. Respondemos ok salvo error irrecuperable.
export async function postWebhookFlow(req: Request, res: Response) {
  try {
    const db = await tenantDbPorSlug(req.params.slug)
    const token = String((req.body ?? {}).token ?? req.query.token ?? '')
    if (db) await svc.procesarWebhookFlow(db, token)
  } catch { /* Flow reintenta; no exponemos el error */ }
  res.status(200).send('ok')
}
