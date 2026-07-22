import type { Request, Response } from 'express'
import { tenantDb } from '@/middlewares/tenant'
import * as svc from '@/services/boxes.service'

export async function getBoxes(req: Request, res: Response) {
  res.json(await svc.listarBoxes(tenantDb(req), req.query.activas === '1'))
}
export async function postBox(req: Request, res: Response) {
  res.status(201).json(await svc.crearBox(tenantDb(req), req.body ?? {}))
}
export async function patchBox(req: Request, res: Response) {
  res.json(await svc.actualizarBox(tenantDb(req), req.params.id, req.body ?? {}))
}
export async function deleteBox(req: Request, res: Response) {
  await svc.eliminarBox(tenantDb(req), req.params.id)
  res.json({ ok: true })
}
