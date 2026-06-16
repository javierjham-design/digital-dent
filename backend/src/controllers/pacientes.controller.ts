import type { Request, Response } from 'express'
import { clinicaId } from '@/middlewares/auth'
import { crearPaciente, listarPacientes, obtenerPaciente } from '@/services/pacientes.service'
import { crearPacienteSchema } from '@/validators/schemas'

export async function getPacientes(req: Request, res: Response) {
  const q = typeof req.query.q === 'string' ? req.query.q : undefined
  res.json(await listarPacientes(clinicaId(req), q))
}

export async function getPaciente(req: Request, res: Response) {
  res.json(await obtenerPaciente(clinicaId(req), req.params.id))
}

export async function postPaciente(req: Request, res: Response) {
  const input = crearPacienteSchema.parse(req.body)
  const dto = await crearPaciente(clinicaId(req), { ...input, email: input.email || null })
  res.status(201).json(dto)
}
