import { PrismaClient } from '@prisma/client'

// Singleton de Prisma (igual patrón que el monolito) para no abrir múltiples
// pools de conexión en desarrollo con hot-reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
