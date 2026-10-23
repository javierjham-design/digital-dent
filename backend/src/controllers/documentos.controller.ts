import type { Request, Response } from 'express'
import { tenantDb } from '@/middlewares/tenant'
import { badRequest } from '@/lib/errors'
import * as svc from '@/services/documentos.service'

export async function getDocumentos(req: Request, res: Response) {
  res.json(await svc.listarDocumentos(tenantDb(req), req.params.pacienteId))
}
export async function postDocumento(req: Request, res: Response) {
  const f = req.file
  if (!f) throw badRequest('Falta el archivo')
  const b = req.body ?? {}
  res.status(201).json(await svc.subirDocumento(tenantDb(req), req.auth!, req.params.pacienteId, {
    tipo: String(b.tipo ?? ''), dientes: b.dientes ? String(b.dientes) : undefined, descripcion: b.descripcion ? String(b.descripcion) : undefined,
    nombre: f.originalname, mime: f.mimetype, buffer: f.buffer,
  }))
}
export async function getDocumento(req: Request, res: Response) {
  const d = await svc.descargarDocumento(tenantDb(req), req.params.id)
  // Inline solo para formatos seguros; cualquier otro (p.ej. SVG legacy, que ejecuta
  // scripts en el origin de la API) se fuerza como descarga y sin capacidades activas.
  const inline = svc.esMimeSeguroInline(d.mime)
  res.setHeader('Content-Type', inline ? d.mime : 'application/octet-stream')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  if (!inline) res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'")
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(d.nombre)}"`)
  res.send(Buffer.from(d.data))
}
export async function deleteDocumento(req: Request, res: Response) {
  res.json(await svc.eliminarDocumento(tenantDb(req), req.auth!, req.params.id))
}
