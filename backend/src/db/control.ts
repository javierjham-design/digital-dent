// Cliente del CONTROL-PLANE (registro de clínicas, planes, leads, facturación,
// admins de plataforma, auditoría). Singleton: una sola conexión por proceso.
import { PrismaClient } from '../../prisma/generated/control/index.js'
import { env } from '@/config/env'

const g = globalThis as unknown as { controlPrisma?: PrismaClient }

export const control =
  g.controlPrisma ??
  new PrismaClient({
    datasources: { db: { url: env.controlDatabaseUrl } },
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
  })

if (process.env.NODE_ENV !== 'production') g.controlPrisma = control
