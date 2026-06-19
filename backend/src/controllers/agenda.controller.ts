import type { Request, Response } from 'express'
import { tenantDb } from '@/middlewares/tenant'
import { guardarHorarios, listarHorarios } from '@/services/horarios.service'
import { actualizarBloqueo, crearBloqueo, eliminarBloqueo, listarBloqueos } from '@/services/bloqueos.service'
import { guardarHorariosSchema, crearBloqueoSchema } from '@/validators/schemas'

// ── Horarios ──
export async function getHorarios(req: Request, res: Response) {
  const doctorId = typeof req.query.doctorId === 'string' ? req.query.doctorId : undefined
  res.json(await listarHorarios(tenantDb(req), doctorId))
}

export async function postHorarios(req: Request, res: Response) {
  const { doctorId, days } = guardarHorariosSchema.parse(req.body)
  res.json(await guardarHorarios(tenantDb(req), doctorId, days))
}

// ── Bloqueos ──
export async function getBloqueos(req: Request, res: Response) {
  const { from, to, doctorId } = req.query as Record<string, string | undefined>
  res.json(await listarBloqueos(tenantDb(req), req.auth!, { from, to, doctorId }))
}

export async function postBloqueo(req: Request, res: Response) {
  const input = crearBloqueoSchema.parse(req.body)
  res.status(201).json(await crearBloqueo(tenantDb(req), req.auth!, input))
}

export async function patchBloqueo(req: Request, res: Response) {
  res.json(await actualizarBloqueo(tenantDb(req), req.auth!, req.params.id, req.body ?? {}))
}

export async function deleteBloqueo(req: Request, res: Response) {
  await eliminarBloqueo(tenantDb(req), req.auth!, req.params.id)
  res.json({ ok: true })
}
