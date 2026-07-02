import type { Request, Response } from 'express'
import { tenantDb } from '@/middlewares/tenant'
import * as crmSvc from '@/services/crm.service'
import * as ext from '@/services/ext.service'

// ── Acceso externo read-only (autenticado por API key → requireApiKey) ────────
export async function getExtLeads(req: Request, res: Response) {
  const { estado, origen, q, desde, hasta } = req.query as Record<string, string | undefined>
  res.json(await crmSvc.listarLeads(tenantDb(req), { estado, origen, q, desde, hasta }))
}
export async function getExtLead(req: Request, res: Response) {
  res.json(await crmSvc.obtenerLead(tenantDb(req), req.params.id))
}
export async function getExtResumen(req: Request, res: Response) {
  res.json(await crmSvc.resumenCrm(tenantDb(req)))
}
export async function getExtStats(req: Request, res: Response) {
  res.json(await ext.estadisticasPlataforma(tenantDb(req)))
}

// ── Gestión de la API key (admin de la clínica → adminTenant, req.clinica del JWT) ──
export async function getApiKey(req: Request, res: Response) {
  res.json(await ext.estadoApiKey(req.clinica!.id))
}
export async function postRotarApiKey(req: Request, res: Response) {
  res.status(201).json(await ext.rotarApiKey(req.clinica!.id))
}
export async function deleteApiKey(req: Request, res: Response) {
  res.json(await ext.revocarApiKey(req.clinica!.id))
}
