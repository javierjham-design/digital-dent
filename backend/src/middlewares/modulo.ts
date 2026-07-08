import type { Request, Response, NextFunction } from 'express'
import { forbidden } from '@/lib/errors'
import { control } from '@/db/control'
import { getClinicaModulos } from '@/middlewares/tenant'
import { parseModulos } from '@shared/constants/modulos'

// Exige que la clínica tenga habilitado un módulo (CRM / Agendamiento online /
// WhatsApp). Rutas autenticadas: usa req.auth.clinicaId. Debe ir después de
// requireAuth. El super-admin de plataforma no se limita.
export function requireModulo(code: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.auth?.isPlatformAdmin) {
        const clinicaId = req.auth?.clinicaId
        if (!clinicaId) throw forbidden('Requiere una clínica.')
        const mods = await getClinicaModulos(clinicaId)
        if (!mods.includes(code)) throw forbidden('El módulo no está habilitado para esta clínica.')
      }
      next()
    } catch (e) {
      next(e)
    }
  }
}

// Igual que requireModulo pero para rutas autenticadas por API key (ext/MCP):
// la clínica ya fue resuelta por requireApiKey en req.clinica. Debe ir después.
export function requireModuloApiKey(code: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const clinicaId = req.clinica?.id
      if (!clinicaId) throw forbidden('Requiere una clínica.')
      const mods = await getClinicaModulos(clinicaId)
      if (!mods.includes(code)) throw forbidden('El módulo no está habilitado para esta clínica.')
      next()
    } catch (e) {
      next(e)
    }
  }
}

// Para rutas PÚBLICAS por slug (intake CRM, agenda pública): valida el módulo de
// la clínica resuelta por :slug.
export async function moduloHabilitadoPorSlug(slug: string, code: string): Promise<boolean> {
  const c = await control.clinica.findUnique({ where: { slug }, select: { modulos: true } })
  return parseModulos(c?.modulos).includes(code)
}
