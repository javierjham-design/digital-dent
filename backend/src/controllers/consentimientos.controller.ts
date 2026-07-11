import type { Request, Response } from 'express'
import { tenantDb } from '@/middlewares/tenant'
import * as svc from '@/services/consentimientos.service'

// ── Plantillas ─────────────────────────────────────────────────────────────
export async function getPlantillas(req: Request, res: Response) {
  res.json(await svc.listarPlantillas(tenantDb(req), req.query.activas === '1'))
}
export async function getPlantilla(req: Request, res: Response) {
  res.json(await svc.obtenerPlantilla(tenantDb(req), req.params.id))
}
export async function postPlantilla(req: Request, res: Response) {
  res.status(201).json(await svc.crearPlantilla(tenantDb(req), req.body ?? {}))
}
export async function patchPlantilla(req: Request, res: Response) {
  res.json(await svc.actualizarPlantilla(tenantDb(req), req.params.id, req.body ?? {}))
}
export async function deletePlantilla(req: Request, res: Response) {
  await svc.eliminarPlantilla(tenantDb(req), req.params.id)
  res.json({ ok: true })
}

// ── Consentimientos del paciente ──────────────────────────────────────────
export async function getPorPaciente(req: Request, res: Response) {
  res.json(await svc.listarPorPaciente(tenantDb(req), req.params.pacienteId))
}
export async function getConsentimiento(req: Request, res: Response) {
  res.json(await svc.obtenerConsentimiento(tenantDb(req), req.params.id))
}
export async function postPrevisualizar(req: Request, res: Response) {
  const b = req.body ?? {}
  res.json(await svc.previsualizar(tenantDb(req), req.auth!, b.pacienteId, b.plantillaId, b.responsableId || undefined, b.extra ?? {}))
}
export async function postGenerar(req: Request, res: Response) {
  const b = req.body ?? {}
  res.status(201).json(await svc.generar(tenantDb(req), req.auth!, b.pacienteId, b.plantillaId, b.responsableId, b.planId, b.extra ?? {}))
}
export async function postFirmar(req: Request, res: Response) {
  res.json(await svc.firmar(tenantDb(req), req.auth!, req.params.id, req.body ?? {}))
}
export async function deleteConsentimiento(req: Request, res: Response) {
  res.json(await svc.eliminarConsentimiento(tenantDb(req), req.auth!, req.params.id))
}
