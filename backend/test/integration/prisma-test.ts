// En integración, `@prisma/client` está aliasado al cliente sqlite de prueba
// (ver vitest.integration.config.ts), así que el singleton de @/lib/prisma ya
// apunta a la DB efímera. Reexportamos ese mismo singleton para que seed y
// services compartan una sola conexión.
export { prisma } from '@/lib/prisma'
