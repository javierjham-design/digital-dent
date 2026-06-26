import type { Request, Response } from 'express'
import { tenantDb } from '@/middlewares/tenant'
import * as svc from '@/services/cobros.service'
import { crearCobroSchema, motivoSchema, derivarAbonoSchema } from '@/validators/schemas'

export async function getCobros(req: Request, res: Response) {
  const pacienteId = typeof req.query.pacienteId === 'string' ? req.query.pacienteId : undefined
  res.json(await svc.listarCobros(tenantDb(req), pacienteId))
}
export async function postDerivarAbono(req: Request, res: Response) {
  const { fromPlanId, toPlanId, monto } = derivarAbonoSchema.parse(req.body)
  res.json(await svc.derivarAbono(tenantDb(req), req.auth!, fromPlanId, { toPlanId, monto }))
}
export async function getCobro(req: Request, res: Response) {
  res.json(await svc.obtenerCobro(tenantDb(req), req.params.id))
}
export async function postCobro(req: Request, res: Response) {
  const input = crearCobroSchema.parse(req.body)
  res.status(201).json(await svc.crearCobro(tenantDb(req), req.auth!, input))
}
export async function patchCobro(req: Request, res: Response) {
  res.json(await svc.actualizarCobro(tenantDb(req), req.auth!, req.params.id, req.body ?? {}))
}
export async function postAnularCobro(req: Request, res: Response) {
  const { motivo } = motivoSchema.parse(req.body)
  res.json(await svc.anularCobro(tenantDb(req), req.auth!, req.params.id, motivo))
}
export async function deleteCobro(req: Request, res: Response) {
  await svc.eliminarCobro(tenantDb(req), req.auth!, req.params.id)
  res.json({ ok: true })
}
