import type { Request, Response } from 'express'
import { tenantDb } from '@/middlewares/tenant'
import { actualizarUsuario, crearUsuario, listarDoctores, listarUsuarios } from '@/services/usuarios.service'
import { crearUsuarioSchema } from '@/validators/schemas'

export async function getUsuarios(req: Request, res: Response) {
  res.json(await listarUsuarios(tenantDb(req)))
}

export async function getDoctores(req: Request, res: Response) {
  res.json(await listarDoctores(tenantDb(req)))
}

export async function postUsuario(req: Request, res: Response) {
  const input = crearUsuarioSchema.parse(req.body)
  res.status(201).json(await crearUsuario(tenantDb(req), { ...input, email: input.email || null }))
}

export async function patchUsuario(req: Request, res: Response) {
  res.json(await actualizarUsuario(tenantDb(req), req.auth!, req.params.id, req.body ?? {}))
}
