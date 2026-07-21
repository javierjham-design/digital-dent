import type { Request, Response } from 'express'
import { tenantDb } from '@/middlewares/tenant'
import * as svc from '@/services/caja.service'
import { crearCajaSchema, abrirCajaSchema, cerrarCajaSchema, crearMovimientoSchema, motivoSchema } from '@/validators/schemas'

export async function getCajas(req: Request, res: Response) {
  res.json(await svc.listarCajas(tenantDb(req), req.auth!))
}
export async function getResumenCajas(req: Request, res: Response) {
  res.json(await svc.resumenCajas(tenantDb(req), req.auth!))
}
export async function getGestionCajas(req: Request, res: Response) {
  res.json(await svc.gestionCajas(tenantDb(req)))
}
export async function getOperadores(req: Request, res: Response) {
  res.json(await svc.operadoresCaja(tenantDb(req)))
}
export async function postAbrirParaUsuario(req: Request, res: Response) {
  const { userId, saldoApertura } = (req.body ?? {}) as { userId?: string; saldoApertura?: unknown }
  if (!userId) return res.status(400).json({ message: 'Falta el usuario.' })
  res.status(201).json(await svc.abrirCajaParaUsuario(tenantDb(req), req.auth!, userId, saldoApertura))
}
function rangoReq(req: Request) {
  return {
    desde: typeof req.query.desde === 'string' ? req.query.desde : undefined,
    hasta: typeof req.query.hasta === 'string' ? req.query.hasta : undefined,
  }
}
export async function getReportePagos(req: Request, res: Response) {
  res.json(await svc.reportePagosPeriodo(tenantDb(req), rangoReq(req)))
}
export async function getReporteProfesionales(req: Request, res: Response) {
  res.json(await svc.reportePorProfesional(tenantDb(req), rangoReq(req)))
}
export async function getCaja(req: Request, res: Response) {
  res.json(await svc.obtenerCaja(tenantDb(req), req.auth!, req.params.id))
}
export async function postCaja(req: Request, res: Response) {
  const input = crearCajaSchema.parse(req.body)
  res.status(201).json(await svc.crearCaja(tenantDb(req), req.auth!, input))
}
export async function patchCaja(req: Request, res: Response) {
  res.json(await svc.actualizarCaja(tenantDb(req), req.params.id, req.body ?? {}))
}
export async function deleteCaja(req: Request, res: Response) {
  await svc.eliminarCaja(tenantDb(req), req.params.id)
  res.json({ ok: true })
}

// Sesiones
export async function getSaldoSugerido(req: Request, res: Response) {
  res.json(await svc.saldoSugerido(tenantDb(req), req.auth!, req.params.id))
}
export async function postAbrir(req: Request, res: Response) {
  const { saldoApertura } = abrirCajaSchema.parse(req.body ?? {})
  res.status(201).json(await svc.abrirSesion(tenantDb(req), req.auth!, req.params.id, saldoApertura))
}
export async function postCerrar(req: Request, res: Response) {
  const input = cerrarCajaSchema.parse(req.body)
  res.json(await svc.cerrarSesion(tenantDb(req), req.auth!, req.params.id, input))
}
export async function getSesiones(req: Request, res: Response) {
  res.json(await svc.listarSesiones(tenantDb(req), req.auth!, req.params.id))
}
export async function getSesion(req: Request, res: Response) {
  res.json(await svc.detalleSesion(tenantDb(req), req.auth!, req.params.id, req.params.sesionId))
}

// Movimientos
export async function getMovimientos(req: Request, res: Response) {
  const { from, to } = req.query as Record<string, string | undefined>
  res.json(await svc.listarMovimientos(tenantDb(req), req.auth!, req.params.id, { from, to }))
}
export async function postMovimiento(req: Request, res: Response) {
  crearMovimientoSchema.parse(req.body)
  res.status(201).json(await svc.crearMovimiento(tenantDb(req), req.auth!, req.params.id, req.body))
}
export async function postAnularMovimiento(req: Request, res: Response) {
  const { motivo } = motivoSchema.parse(req.body)
  res.json(await svc.anularMovimiento(tenantDb(req), req.auth!, req.params.id, req.params.movId, motivo))
}
