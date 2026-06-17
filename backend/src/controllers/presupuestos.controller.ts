import type { Request, Response } from 'express'
import { clinicaId } from '@/middlewares/auth'
import { actualizarPresupuesto, crearPresupuesto, listarPresupuestos, obtenerPresupuesto } from '@/services/presupuestos.service'
import { crearPresupuestoSchema } from '@/validators/schemas'

export async function getPresupuestos(req: Request, res: Response) {
  const pacienteId = typeof req.query.pacienteId === 'string' ? req.query.pacienteId : undefined
  res.json(await listarPresupuestos(clinicaId(req), pacienteId))
}

export async function getPresupuesto(req: Request, res: Response) {
  res.json(await obtenerPresupuesto(clinicaId(req), req.params.id))
}

export async function postPresupuesto(req: Request, res: Response) {
  const input = crearPresupuestoSchema.parse(req.body)
  res.status(201).json(await crearPresupuesto(clinicaId(req), input))
}

export async function patchPresupuesto(req: Request, res: Response) {
  res.json(await actualizarPresupuesto(clinicaId(req), req.params.id, req.body ?? {}))
}
