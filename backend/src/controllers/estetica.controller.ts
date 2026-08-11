import type { Request, Response } from 'express'
import { tenantDb } from '@/middlewares/tenant'
import { badRequest } from '@/lib/errors'
import { assertAreaDisponible } from '@/lib/areas'
import { listarZonas, zonasDeFicha, upsertZonaFicha, obtenerDibujo, guardarDibujo } from '@/services/estetica.service'

// Rutas del área estética. La cadena de la ruta exige el módulo de la clínica
// (requireModulo('area_estetica')); las ESCRITURAS exigen además que el usuario
// tenga el área habilitada (assertAreaDisponible: clínica ∩ usuario).

export async function getZonasFaciales(req: Request, res: Response) {
  res.json(await listarZonas(tenantDb(req)))
}

export async function getZonasFicha(req: Request, res: Response) {
  res.json(await zonasDeFicha(tenantDb(req), req.params.id))
}

export async function putZonaFicha(req: Request, res: Response) {
  await assertAreaDisponible(tenantDb(req), req.auth!, 'ESTETICA')
  const body = req.body ?? {}
  const zonaId = String(body.zonaId ?? '').trim()
  if (!zonaId) throw badRequest('Falta zonaId')
  res.json(await upsertZonaFicha(tenantDb(req), {
    pacienteId: req.params.id, zonaId,
    estado: typeof body.estado === 'string' ? body.estado : undefined,
    color: body.color === undefined ? undefined : (body.color ?? null),
    notas: body.notas === undefined ? undefined : (body.notas ?? null),
  }))
}

export async function getDibujoFacial(req: Request, res: Response) {
  res.json(await obtenerDibujo(tenantDb(req), req.params.id))
}

export async function putDibujoFacial(req: Request, res: Response) {
  await assertAreaDisponible(tenantDb(req), req.auth!, 'ESTETICA')
  res.json(await guardarDibujo(tenantDb(req), req.params.id, req.body ?? {}))
}
