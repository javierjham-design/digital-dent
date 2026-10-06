import type { Request, Response } from 'express'
import { tenantDb } from '@/middlewares/tenant'
import { getAutomatizaciones, putAutomatizaciones, reemitirCitasProximas } from '@/services/automatizaciones.service'

// Centro de Automatizaciones de la clínica (comportamiento de recordatorios / no-show /
// recaptura). Las credenciales de TuBot las administra el Super-Admin. configTenant.
export async function getAutomatizacionesCtrl(req: Request, res: Response) {
  res.json(await getAutomatizaciones(tenantDb(req)))
}
export async function putAutomatizacionesCtrl(req: Request, res: Response) {
  res.json(await putAutomatizaciones(tenantDb(req), req.body ?? {}))
}
// Backfill: re-emite a TuBot las citas futuras ya agendadas (programa sus recordatorios).
export async function postResyncCitas(req: Request, res: Response) {
  res.json(await reemitirCitasProximas(tenantDb(req)))
}
