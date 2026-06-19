import type { Request, Response } from 'express'
import { tenantDb } from '@/middlewares/tenant'
import { actualizarPresupuesto, crearPresupuesto, listarPresupuestos, obtenerPresupuesto } from '@/services/presupuestos.service'
import { crearPresupuestoSchema } from '@/validators/schemas'

export async function getPresupuestos(req: Request, res: Response) {
  const pacienteId = typeof req.query.pacienteId === 'string' ? req.query.pacienteId : undefined
  res.json(await listarPresupuestos(tenantDb(req), pacienteId))
}

export async function getPresupuesto(req: Request, res: Response) {
  res.json(await obtenerPresupuesto(tenantDb(req), req.params.id))
}

export async function postPresupuesto(req: Request, res: Response) {
  const input = crearPresupuestoSchema.parse(req.body)
  res.status(201).json(await crearPresupuesto(tenantDb(req), input))
}

export async function patchPresupuesto(req: Request, res: Response) {
  res.json(await actualizarPresupuesto(tenantDb(req), req.params.id, req.body ?? {}))
}
