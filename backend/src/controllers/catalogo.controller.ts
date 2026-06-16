import type { Request, Response } from 'express'
import { clinicaId } from '@/middlewares/auth'
import {
  actualizarClinica, actualizarPrestacion, crearPrestacion,
  eliminarPrestacion, listarPrestaciones, obtenerClinica,
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

// ── Configuración de la clínica ──
export async function getClinica(req: Request, res: Response) {
  res.json(await obtenerClinica(clinicaId(req)))
}

export async function patchClinica(req: Request, res: Response) {
  res.json(await actualizarClinica(clinicaId(req), req.body ?? {}))
}
