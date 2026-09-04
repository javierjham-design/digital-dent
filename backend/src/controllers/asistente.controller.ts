import type { Request, Response } from 'express'
import { tenantDb } from '@/middlewares/tenant'
import { mensajeAsistenteSchema } from '@/validators/schemas'
import * as svc from '@/services/asistente/sesiones'

// Controller fino: valida, resuelve el actor y delega en el service. La sesión
// siempre pertenece a req.auth.sub (nadie lee/escribe sesiones ajenas).

export async function getEstado(req: Request, res: Response) {
  const actor = await svc.construirActor(tenantDb(req), req.auth!)
  res.json(await svc.estado(tenantDb(req), actor))
}

export async function getSesiones(req: Request, res: Response) {
  res.json(await svc.listarSesiones(tenantDb(req), req.auth!.sub))
}

export async function postSesion(req: Request, res: Response) {
  res.status(201).json(await svc.crearSesion(tenantDb(req), req.auth!.sub))
}

export async function getSesion(req: Request, res: Response) {
  res.json(await svc.obtenerSesion(tenantDb(req), req.auth!.sub, req.params.id))
}

export async function deleteSesion(req: Request, res: Response) {
  await svc.eliminarSesion(tenantDb(req), req.auth!.sub, req.params.id)
  res.status(204).end()
}

export async function postMensaje(req: Request, res: Response) {
  const { texto } = mensajeAsistenteSchema.parse(req.body)
  res.json(await svc.enviarMensaje(tenantDb(req), req.auth!, req.params.id, texto))
}

export async function getResultadoXlsx(req: Request, res: Response) {
  const { buffer, filenameBase } = await svc.xlsxResultado(tenantDb(req), req.auth!.sub, req.params.id)
  const fecha = new Date().toISOString().slice(0, 10)
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}-${fecha}.xlsx"`)
  res.setHeader('Cache-Control', 'no-store')
  res.send(buffer)
}
