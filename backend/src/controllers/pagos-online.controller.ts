import type { Request, Response } from 'express'
import { tenantDb, tenantDbPorSlug } from '@/middlewares/tenant'
import { apiBaseDe as apiBase, appBaseDe as appBase } from '@/lib/req-url'
import * as svc from '@/services/pagos-online.service'

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
