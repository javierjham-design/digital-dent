import type { Request, Response } from 'express'
import { clinicaId } from '@/middlewares/auth'
import * as svc from '@/services/caja.service'
import { crearCajaSchema, abrirCajaSchema, cerrarCajaSchema, crearMovimientoSchema, motivoSchema } from '@/validators/schemas'

export async function getCajas(req: Request, res: Response) {
  res.json(await svc.listarCajas(req.auth!))
}
export async function getCaja(req: Request, res: Response) {
  res.json(await svc.obtenerCaja(req.auth!, req.params.id))
}
export async function postCaja(req: Request, res: Response) {
  const input = crearCajaSchema.parse(req.body)
  res.status(201).json(await svc.crearCaja(clinicaId(req), input))
}
export async function patchCaja(req: Request, res: Response) {
  res.json(await svc.actualizarCaja(clinicaId(req), req.params.id, req.body ?? {}))
}
export async function deleteCaja(req: Request, res: Response) {
  await svc.eliminarCaja(clinicaId(req), req.params.id)
  res.json({ ok: true })
}

// Sesiones
export async function getSaldoSugerido(req: Request, res: Response) {
  res.json(await svc.saldoSugerido(req.auth!, req.params.id))
}
export async function postAbrir(req: Request, res: Response) {
  const { saldoApertura } = abrirCajaSchema.parse(req.body ?? {})
  res.status(201).json(await svc.abrirSesion(req.auth!, req.params.id, saldoApertura))
}
export async function postCerrar(req: Request, res: Response) {
  const input = cerrarCajaSchema.parse(req.body)
  res.json(await svc.cerrarSesion(req.auth!, req.params.id, input))
}
export async function getSesiones(req: Request, res: Response) {
  res.json(await svc.listarSesiones(req.auth!, req.params.id))
}
export async function getSesion(req: Request, res: Response) {
  res.json(await svc.detalleSesion(req.auth!, req.params.id, req.params.sesionId))
}

// Movimientos
export async function getMovimientos(req: Request, res: Response) {
  const { from, to } = req.query as Record<string, string | undefined>
  res.json(await svc.listarMovimientos(req.auth!, req.params.id, { from, to }))
}
export async function postMovimiento(req: Request, res: Response) {
  crearMovimientoSchema.parse(req.body)
  res.status(201).json(await svc.crearMovimiento(req.auth!, req.params.id, req.body))
}
export async function postAnularMovimiento(req: Request, res: Response) {
  const { motivo } = motivoSchema.parse(req.body)
  res.json(await svc.anularMovimiento(req.auth!, req.params.id, req.params.movId, motivo))
}
