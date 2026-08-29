import type { Request, Response } from 'express'
import { tenantDb } from '@/middlewares/tenant'
import * as svc from '@/services/tubot-agenda.service'
import { estadoTubotApiKey, rotarTubotApiKey, revocarTubotApiKey } from '@/services/ext.service'

// API que consume TuBot para agendar (contrato docs/TUBOT_AGENDA.md). Autenticada
// por token dedicado (requireTubotApiKey), que resuelve el tenant en req.clinica/req.tenant.
// Fase 1: catálogo de lectura (clinics / professionals / services).

export async function getClinics(req: Request, res: Response) {
  res.json(await svc.clinics(tenantDb(req), req.clinica!.slug))
}

export async function getProfessionals(req: Request, res: Response) {
  res.json(await svc.professionals(tenantDb(req), req.clinica!.slug))
}

export async function getServices(req: Request, res: Response) {
  res.json(await svc.services(tenantDb(req)))
}

export async function getProfessionalServices(req: Request, res: Response) {
  res.json(await svc.professionalServices(tenantDb(req), req.params.id))
}

// ── Super-admin: gestión del token de la integración (por clínica) ────────────
export async function getTubotConfig(req: Request, res: Response) {
  res.json(await estadoTubotApiKey(req.params.id))
}
export async function postTubotToken(req: Request, res: Response) {
  res.json(await rotarTubotApiKey(req.params.id))
}
export async function deleteTubotToken(req: Request, res: Response) {
  res.json(await revocarTubotApiKey(req.params.id))
}
