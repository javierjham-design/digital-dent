import type { Request, Response } from 'express'
import { clinicaId } from '@/middlewares/auth'
import * as svc from '@/services/liquidaciones.service'
import { crearContratoSchema, crearLiquidacionSchema } from '@/validators/schemas'

// ── Contratos ──
export async function getContratos(req: Request, res: Response) {
  res.json(await svc.listarContratos(clinicaId(req)))
}
export async function postContrato(req: Request, res: Response) {
  const input = crearContratoSchema.parse(req.body)
  res.status(201).json(await svc.crearContrato(clinicaId(req), input))
}
export async function patchContrato(req: Request, res: Response) {
  res.json(await svc.actualizarContrato(clinicaId(req), req.params.id, req.body ?? {}))
}
export async function deleteContrato(req: Request, res: Response) {
  await svc.eliminarContrato(clinicaId(req), req.params.id)
  res.json({ ok: true })
}

// ── Liquidaciones ──
export async function getLiquidaciones(req: Request, res: Response) {
  res.json(await svc.listarLiquidaciones(req.auth!))
}
export async function getLiquidacion(req: Request, res: Response) {
  res.json(await svc.obtenerLiquidacion(req.auth!, req.params.id))
}
export async function postLiquidacion(req: Request, res: Response) {
  const input = crearLiquidacionSchema.parse(req.body)
  res.status(201).json(await svc.crearLiquidacion(req.auth!, input))
}
export async function patchLiquidacion(req: Request, res: Response) {
  res.json(await svc.actualizarLiquidacion(req.auth!, req.params.id, req.body ?? {}))
}
