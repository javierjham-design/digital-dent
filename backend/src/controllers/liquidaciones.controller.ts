import type { Request, Response } from 'express'
import { tenantDb } from '@/middlewares/tenant'
import { badRequest } from '@/lib/errors'
import * as svc from '@/services/liquidaciones.service'
import { crearContratoSchema } from '@/validators/schemas'

// ── Contratos ──
export async function getContratos(req: Request, res: Response) {
  res.json(await svc.listarContratos(tenantDb(req)))
}
export async function postContrato(req: Request, res: Response) {
  const input = crearContratoSchema.parse(req.body)
  res.status(201).json(await svc.crearContrato(tenantDb(req), input))
}
export async function patchContrato(req: Request, res: Response) {
  res.json(await svc.actualizarContrato(tenantDb(req), req.params.id, req.body ?? {}))
}
export async function deleteContrato(req: Request, res: Response) {
  await svc.eliminarContrato(tenantDb(req), req.params.id)
  res.json({ ok: true })
}

// ── Liquidaciones ACTIVAS (saldo corriente) ──
export async function getLiquidacionesActivas(req: Request, res: Response) {
  res.json(await svc.liquidacionesActivas(tenantDb(req), req.auth!))
}
export async function getLiquidacionActiva(req: Request, res: Response) {
  res.json(await svc.liquidacionActiva(tenantDb(req), req.auth!, req.params.doctorId))
}
export async function postFinalizarLiquidacion(req: Request, res: Response) {
  res.status(201).json(await svc.finalizarLiquidacion(tenantDb(req), req.auth!, req.params.doctorId))
}

// ── Liquidaciones FINALIZADAS ──
export async function getLiquidaciones(req: Request, res: Response) {
  res.json(await svc.listarLiquidaciones(tenantDb(req), req.auth!))
}
export async function getLiquidacion(req: Request, res: Response) {
  res.json(await svc.obtenerLiquidacion(tenantDb(req), req.auth!, req.params.id))
}
export async function patchLiquidacion(req: Request, res: Response) {
  res.json(await svc.actualizarLiquidacion(tenantDb(req), req.auth!, req.params.id, req.body ?? {}))
}

// ── Adjuntos (factura / comprobante) ──
export async function getAdjuntos(req: Request, res: Response) {
  res.json(await svc.listarAdjuntos(tenantDb(req), req.auth!, req.params.id))
}
export async function postAdjunto(req: Request, res: Response) {
  const f = req.file
  if (!f) throw badRequest('Falta el archivo')
  res.status(201).json(await svc.subirAdjunto(tenantDb(req), req.auth!, req.params.id, { tipo: String(req.body?.tipo ?? ''), nombre: f.originalname, mime: f.mimetype, buffer: f.buffer }))
}
export async function getAdjunto(req: Request, res: Response) {
  const adj = await svc.descargarAdjunto(tenantDb(req), req.auth!, req.params.id, req.params.adjId)
  res.setHeader('Content-Type', adj.mime)
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(adj.nombre)}"`)
  res.send(Buffer.from(adj.data))
}
export async function deleteAdjunto(req: Request, res: Response) {
  await svc.eliminarAdjunto(tenantDb(req), req.auth!, req.params.id, req.params.adjId)
  res.json({ ok: true })
}
