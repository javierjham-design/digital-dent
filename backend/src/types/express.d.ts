import type { JwtPayload } from '@/services/auth.service'
import type { TenantClient } from '@/db/tenant'

// Adjunta el payload del JWT y, en rutas de clínica, el cliente del tenant.
declare global {
  namespace Express {
    interface Request {
      auth?: JwtPayload
      // Cliente Prisma de la base de la clínica (database-per-tenant).
      tenant?: TenantClient
      // Datos de la clínica desde el control-plane.
      clinica?: { id: string; slug: string; dbName: string }
    }
  }
}

export {}
