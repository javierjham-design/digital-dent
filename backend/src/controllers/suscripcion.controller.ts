import type { Request, Response } from 'express'
import * as svc from '@/services/suscripcion.service'
import { badRequest } from '@/lib/errors'

function clinicaId(req: Request): string {
  const id = req.clinica?.id ?? req.auth?.clinicaId
  if (!id) throw badRequest('Requiere una clínica.')
  return id
}

export async function getSuscripcion(req: Request, res: Response) {
  res.json(await svc.estadoSuscripcion(clinicaId(req)))
}

export async function postEnlacePago(req: Request, res: Response) {
  const recurrente = Boolean((req.body ?? {}).recurrente)
  res.json(await svc.generarEnlacePago(clinicaId(req), recurrente))
}
