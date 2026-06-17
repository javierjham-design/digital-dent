import type { Request, Response } from 'express'
import { clinicaId } from '@/middlewares/auth'
import {
  actualizarClinica, actualizarPrestacion, crearPrestacion,
  eliminarPrestacion, listarPrestaciones, obtenerClinica,
  listarMediosPago, crearMedioPago, actualizarMedioPago, eliminarMedioPago,
} from '@/services/catalogo.service'
import { crearPrestacionSchema } from '@/validators/schemas'

// ── Prestaciones ──
export async function getPrestaciones(req: Request, res: Response) {
  res.json(await listarPrestaciones(clinicaId(req)))
}

export async function postPrestacion(req: Request, res: Response) {
  const input = crearPrestacionSchema.parse(req.body)
  res.status(201).json(await crearPrestacion(clinicaId(req), input))
}

export async function patchPrestacion(req: Request, res: Response) {
  res.json(await actualizarPrestacion(clinicaId(req), req.params.id, req.body ?? {}))
}

export async function deletePrestacion(req: Request, res: Response) {
  await eliminarPrestacion(clinicaId(req), req.params.id)
  res.json({ ok: true })
}

// ── Medios de pago ──
export async function getMediosPago(req: Request, res: Response) {
  res.json(await listarMediosPago(clinicaId(req)))
}
export async function postMedioPago(req: Request, res: Response) {
  res.status(201).json(await crearMedioPago(clinicaId(req), req.body ?? {}))
}
export async function patchMedioPago(req: Request, res: Response) {
  res.json(await actualizarMedioPago(clinicaId(req), req.params.id, req.body ?? {}))
}
export async function deleteMedioPago(req: Request, res: Response) {
  await eliminarMedioPago(clinicaId(req), req.params.id)
  res.json({ ok: true })
}

// ── Configuración de la clínica ──
export async function getClinica(req: Request, res: Response) {
  res.json(await obtenerClinica(clinicaId(req)))
}

export async function patchClinica(req: Request, res: Response) {
  res.json(await actualizarClinica(clinicaId(req), req.body ?? {}))
}
