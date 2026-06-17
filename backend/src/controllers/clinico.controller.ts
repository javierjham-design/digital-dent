import type { Request, Response } from 'express'
import { clinicaId } from '@/middlewares/auth'
import * as svc from '@/services/tratamientos.service'
import { crearPlanSchema, crearSeccionSchema, crearTratamientoSchema, crearEvolucionSchema, upsertDienteSchema } from '@/validators/schemas'

// ── Planes ──
export async function getPlanes(req: Request, res: Response) {
  const pacienteId = typeof req.query.pacienteId === 'string' ? req.query.pacienteId : ''
  res.json(await svc.listarPlanes(clinicaId(req), pacienteId))
}
export async function postPlan(req: Request, res: Response) {
  const input = crearPlanSchema.parse(req.body)
  res.status(201).json(await svc.crearPlan(clinicaId(req), input))
}
export async function getPlan(req: Request, res: Response) {
  res.json(await svc.obtenerPlan(clinicaId(req), req.params.id))
}
export async function patchPlan(req: Request, res: Response) {
  res.json(await svc.actualizarPlan(clinicaId(req), req.params.id, req.body ?? {}))
}
export async function deletePlan(req: Request, res: Response) {
  await svc.eliminarPlan(clinicaId(req), req.params.id)
  res.json({ ok: true })
}

// ── Secciones ──
export async function postSeccion(req: Request, res: Response) {
  const input = crearSeccionSchema.parse(req.body ?? {})
  res.status(201).json(await svc.crearSeccion(clinicaId(req), req.params.id, input))
}
export async function patchSeccion(req: Request, res: Response) {
  res.json(await svc.actualizarSeccion(clinicaId(req), req.params.id, req.body ?? {}))
}
export async function deleteSeccion(req: Request, res: Response) {
  await svc.eliminarSeccion(clinicaId(req), req.params.id)
  res.json({ ok: true })
}

// ── Tratamientos ──
export async function postTratamiento(req: Request, res: Response) {
  const input = crearTratamientoSchema.parse(req.body)
  res.status(201).json(await svc.crearTratamiento(clinicaId(req), req.auth!.sub, input))
}
export async function patchTratamiento(req: Request, res: Response) {
  res.json(await svc.actualizarTratamiento(clinicaId(req), req.auth!.sub, req.params.id, req.body ?? {}))
}
export async function deleteTratamiento(req: Request, res: Response) {
  await svc.eliminarTratamiento(clinicaId(req), req.params.id)
  res.json({ ok: true })
}

// ── Evoluciones ──
export async function getEvoluciones(req: Request, res: Response) {
  const pacienteId = typeof req.query.pacienteId === 'string' ? req.query.pacienteId : ''
  res.json(await svc.listarEvoluciones(clinicaId(req), pacienteId))
}
export async function postEvolucion(req: Request, res: Response) {
  const input = crearEvolucionSchema.parse(req.body)
  res.status(201).json(await svc.crearEvolucion(clinicaId(req), req.auth!.sub, input))
}
export async function deleteEvolucion(req: Request, res: Response) {
  await svc.eliminarEvolucion(req.auth!, req.params.id)
  res.json({ ok: true })
}

// ── Odontograma ──
export async function postDiente(req: Request, res: Response) {
  const input = upsertDienteSchema.parse(req.body)
  res.json(await svc.upsertDiente(clinicaId(req), input))
}
