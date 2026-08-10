import type { Request, Response } from 'express'
import { tenantDb } from '@/middlewares/tenant'
import {
  actualizarClinica, actualizarPrestacion, crearPrestacion,
  eliminarPrestacion, listarPrestaciones, dedupePrestaciones, obtenerClinica,
  listarMediosPago, crearMedioPago, actualizarMedioPago, eliminarMedioPago,
  listarCategorias, crearCategoria, actualizarCategoria, reordenarCategorias, eliminarCategoria,
} from '@/services/catalogo.service'
import { crearPrestacionSchema } from '@/validators/schemas'

// ── Prestaciones ──
export async function getPrestaciones(req: Request, res: Response) {
  res.json(await listarPrestaciones(tenantDb(req)))
}

export async function postPrestacion(req: Request, res: Response) {
  const input = crearPrestacionSchema.parse(req.body)
  res.status(201).json(await crearPrestacion(tenantDb(req), input))
}

export async function patchPrestacion(req: Request, res: Response) {
  res.json(await actualizarPrestacion(tenantDb(req), req.params.id, req.body ?? {}))
}

export async function deletePrestacion(req: Request, res: Response) {
  await eliminarPrestacion(tenantDb(req), req.params.id)
  res.json({ ok: true })
}

export async function postDedupePrestaciones(req: Request, res: Response) {
  res.json(await dedupePrestaciones(tenantDb(req)))
}

// ── Secciones / categorías del catálogo ──
export async function getCategorias(req: Request, res: Response) {
  res.json(await listarCategorias(tenantDb(req)))
}
export async function postCategoria(req: Request, res: Response) {
  const body = req.body ?? {}
  res.status(201).json(await crearCategoria(tenantDb(req), String(body.nombre ?? ''), typeof body.area === 'string' ? body.area : undefined))
}
export async function patchCategoria(req: Request, res: Response) {
  res.json(await actualizarCategoria(tenantDb(req), req.params.id, req.body ?? {}))
}
export async function postReordenarCategorias(req: Request, res: Response) {
  const ids = Array.isArray((req.body ?? {}).ids) ? (req.body.ids as string[]) : []
  await reordenarCategorias(tenantDb(req), ids)
  res.json({ ok: true })
}
export async function deleteCategoria(req: Request, res: Response) {
  await eliminarCategoria(tenantDb(req), req.params.id)
  res.json({ ok: true })
}

// ── Medios de pago ──
export async function getMediosPago(req: Request, res: Response) {
  res.json(await listarMediosPago(tenantDb(req)))
}
export async function postMedioPago(req: Request, res: Response) {
  res.status(201).json(await crearMedioPago(tenantDb(req), req.body ?? {}))
}
export async function patchMedioPago(req: Request, res: Response) {
  res.json(await actualizarMedioPago(tenantDb(req), req.params.id, req.body ?? {}))
}
export async function deleteMedioPago(req: Request, res: Response) {
  await eliminarMedioPago(tenantDb(req), req.params.id)
  res.json({ ok: true })
}

// ── Configuración de la clínica ──
export async function getClinica(req: Request, res: Response) {
  res.json(await obtenerClinica(tenantDb(req)))
}

export async function patchClinica(req: Request, res: Response) {
  res.json(await actualizarClinica(tenantDb(req), req.body ?? {}))
}
