import type { Request, Response } from 'express'
import { clinicaId } from '@/middlewares/auth'
import * as svc from '@/services/cobros.service'
import { crearCobroSchema, motivoSchema } from '@/validators/schemas'

export async function getCobros(req: Request, res: Response) {
  res.json(await svc.listarCobros(clinicaId(req)))
}
export async function getCobro(req: Request, res: Response) {
  res.json(await svc.obtenerCobro(clinicaId(req), req.params.id))
}
export async function postCobro(req: Request, res: Response) {
  const input = crearCobroSchema.parse(req.body)
  res.status(201).json(await svc.crearCobro(req.auth!, input))
}
export async function patchCobro(req: Request, res: Response) {
  res.json(await svc.actualizarCobro(req.auth!, req.params.id, req.body ?? {}))
}
export async function postAnularCobro(req: Request, res: Response) {
  const { motivo } = motivoSchema.parse(req.body)
  res.json(await svc.anularCobro(req.auth!, req.params.id, motivo))
}
export async function deleteCobro(req: Request, res: Response) {
  await svc.eliminarCobro(req.auth!, req.params.id)
  res.json({ ok: true })
}
