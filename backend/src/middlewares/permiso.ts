import type { Request, Response, NextFunction } from 'express'
import { forbidden, unauthorized } from '@/lib/errors'
import { tenantDb } from '@/middlewares/tenant'

type PermisoCampo = 'puedeGestionarCrm' | 'puedeGestionarLiquidaciones' | 'puedeEliminar' | 'puedeGestionarCajas' | 'puedeRecibirPagos'

// Exige un permiso booleano del usuario dentro de la clínica (el admin lo tiene
// siempre). Debe ir DESPUÉS de requireTenant (usa req.tenant + req.auth.sub).
export function requirePermiso(campo: PermisoCampo) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.auth) throw unauthorized()
      if (req.auth.role === 'admin' || req.auth.isPlatformAdmin) return next()
      const u = await tenantDb(req).user.findUnique({
        where: { id: req.auth.sub },
        select: { puedeGestionarCrm: true, puedeGestionarLiquidaciones: true, puedeEliminar: true, puedeGestionarCajas: true, puedeRecibirPagos: true },
      })
      if (!u || !u[campo]) throw forbidden('No tienes permiso para esta sección.')
      next()
    } catch (e) {
      next(e)
    }
  }
}
