import type { Request, Response } from 'express'
import { clinicaId } from '@/middlewares/auth'
import { cambiarEstadoCita, crearCita, listarCitas } from '@/services/citas.service'
import { cambiarEstadoSchema, crearCitaSchema } from '@/validators/schemas'

function userName(req: Request): string {
  return req.auth?.sub ? `usuario:${req.auth.sub}` : 'Sistema'
}

export async function getCitas(req: Request, res: Response) {
  const from = typeof req.query.from === 'string' ? req.query.from : undefined
  const to = typeof req.query.to === 'string' ? req.query.to : undefined
  res.json(await listarCitas(clinicaId(req), { from, to }))
}

export async function postCita(req: Request, res: Response) {
  const input = crearCitaSchema.parse(req.body)
  res.status(201).json(await crearCita(clinicaId(req), userName(req), input))
}

export async function patchEstado(req: Request, res: Response) {
  const { estado } = cambiarEstadoSchema.parse(req.body)
  res.json(await cambiarEstadoCita(clinicaId(req), req.params.id, estado, userName(req)))
}
