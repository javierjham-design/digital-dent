import type { Request, Response } from 'express'
import { tenantDb } from '@/middlewares/tenant'
import * as svc from '@/services/liquidaciones.service'
import { crearContratoSchema, crearLiquidacionSchema } from '@/validators/schemas'

// ── Contratos ──
export async function getContratos(req: Request, res: Response) {
  res.json(await svc.listarContratos(tenantDb(req)))
}
export async function postContrato(req: Request, res: Response) {
  const input = crearContratoSchema.parse(req.body)
  res.status(201).json(await svc.crearContrato(tenantDb(req), input))
}
export async function patchContrato(req: Request, res: Response) {
  res.json(await svc.actualizarContrato(tenantDb(req), req.params.id, req.body ?? {}))
}
export async function deleteContrato(req: Request, res: Response) {
  await svc.eliminarContrato(tenantDb(req), req.params.id)
  res.json({ ok: true })
}

// ── Liquidaciones ──
export async function getLiquidaciones(req: Request, res: Response) {
  res.json(await svc.listarLiquidaciones(tenantDb(req), req.auth!))
}
export async function getLiquidacion(req: Request, res: Response) {
  res.json(await svc.obtenerLiquidacion(tenantDb(req), req.auth!, req.params.id))
}
export async function postLiquidacion(req: Request, res: Response) {
  const input = crearLiquidacionSchema.parse(req.body)
  res.status(201).json(await svc.crearLiquidacion(tenantDb(req), req.auth!, input))
}
export async function patchLiquidacion(req: Request, res: Response) {
  res.json(await svc.actualizarLiquidacion(tenantDb(req), req.auth!, req.params.id, req.body ?? {}))
}
