import type { Request, Response } from 'express'
import { tenantDb } from '@/middlewares/tenant'
import * as svc from '@/services/reportes.service'
import type { ReporteResult } from '@/services/reportes.service'

function enviarXlsx(res: Response, { buffer, filenameBase }: ReporteResult) {
  const fecha = new Date().toISOString().slice(0, 10)
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}-${fecha}.xlsx"`)
  res.setHeader('Cache-Control', 'no-store')
  res.send(buffer)
}

const q = (req: Request) => req.query as Record<string, string | undefined>

export async function getPacientes(req: Request, res: Response) { enviarXlsx(res, await svc.reportePacientes(tenantDb(req), q(req))) }
export async function getCitas(req: Request, res: Response) { enviarXlsx(res, await svc.reporteCitas(tenantDb(req), q(req))) }
export async function getCobros(req: Request, res: Response) { enviarXlsx(res, await svc.reporteCobros(tenantDb(req), q(req))) }
export async function getTratamientos(req: Request, res: Response) { enviarXlsx(res, await svc.reporteTratamientos(tenantDb(req), q(req))) }
export async function getLiquidaciones(req: Request, res: Response) { enviarXlsx(res, await svc.reporteLiquidaciones(tenantDb(req), q(req))) }
export async function getCaja(req: Request, res: Response) { enviarXlsx(res, await svc.reporteCaja(tenantDb(req), q(req))) }
export async function getMorosos(req: Request, res: Response) { enviarXlsx(res, await svc.reporteMorosos(tenantDb(req), q(req))) }
