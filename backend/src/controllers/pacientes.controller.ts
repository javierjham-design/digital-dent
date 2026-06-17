import type { Request, Response } from 'express'
import { clinicaId } from '@/middlewares/auth'
import {
  actualizarPaciente, crearPaciente, guardarFicha, listarPacientes, obtenerFicha, obtenerPaciente,
  listarComentarios, crearComentario, listarMensajes, crearMensaje, resumenPaciente,
  exportarPacientes, plantillaPacientes, importarPacientes,
} from '@/services/pacientes.service'
import { actorName } from '@/services/auth.service'
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

export async function patchPaciente(req: Request, res: Response) {
  res.json(await actualizarPaciente(clinicaId(req), req.params.id, req.body ?? {}))
}

export async function getFicha(req: Request, res: Response) {
  res.json(await obtenerFicha(clinicaId(req), req.params.id))
}

export async function putFicha(req: Request, res: Response) {
  res.json(await guardarFicha(clinicaId(req), req.params.id, req.body ?? {}))
}

export async function getComentarios(req: Request, res: Response) {
  res.json(await listarComentarios(clinicaId(req), req.params.id))
}

export async function postComentario(req: Request, res: Response) {
  const autor = { id: req.auth!.sub, nombre: actorName(req.auth!) }
  res.status(201).json(await crearComentario(clinicaId(req), req.params.id, autor, String((req.body ?? {}).texto ?? '')))
}

export async function getMensajes(req: Request, res: Response) {
  res.json(await listarMensajes(clinicaId(req), req.params.id))
}

export async function postMensaje(req: Request, res: Response) {
  res.status(201).json(await crearMensaje(clinicaId(req), req.params.id, req.body ?? {}))
}

export async function getResumen(req: Request, res: Response) {
  res.json(await resumenPaciente(clinicaId(req), req.params.id))
}

function enviarXlsx(res: Response, buffer: Buffer, filename: string) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.setHeader('Cache-Control', 'no-store')
  res.send(buffer)
}

export async function getExport(req: Request, res: Response) {
  enviarXlsx(res, await exportarPacientes(clinicaId(req)), `pacientes-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

export async function getTemplate(_req: Request, res: Response) {
  enviarXlsx(res, plantillaPacientes(), 'plantilla-pacientes.xlsx')
}

export async function postImport(req: Request, res: Response) {
  if (!req.file?.buffer) { res.status(400).json({ error: 'Archivo no recibido' }); return }
  res.json(await importarPacientes(clinicaId(req), req.file.buffer))
}
