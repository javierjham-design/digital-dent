// Cliente del CONTROL-PLANE (registro de clínicas, planes, leads, facturación,
// admins de plataforma, auditoría). Singleton: una sola conexión por proceso.
import { PrismaClient } from '../../prisma/generated/control/index.js'
import { env } from '@/config/env'

const g = globalThis as unknown as { controlPrisma?: PrismaClient }

// Acota el pool del control-plane (connection_limit) para que el techo de conexiones
// sea determinista junto con los clientes de tenant. Ver docs/architecture.md.
function controlUrl(): string {
  const u = new URL(env.controlDatabaseUrl)
  u.searchParams.set('connection_limit', String(env.controlDbPool))
  return u.toString()
}

export const control =
  g.controlPrisma ??
  new PrismaClient({
    datasources: { db: { url: controlUrl() } },
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
  })

if (process.env.NODE_ENV !== 'production') g.controlPrisma = control
