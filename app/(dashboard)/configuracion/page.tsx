export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { ConfiguracionClient } from './configuracion-client'

export default async function ConfiguracionPage() {
  const [config, mediosPago] = await Promise.all([
    prisma.configuracion.upsert({
      where: { id: 'singleton' },
      update: {},
      create: { id: 'singleton' },
    }),
    prisma.medioPago.findMany({ orderBy: { nombre: 'asc' } }),
  ])
  return <ConfiguracionClient config={config} mediosPago={mediosPago} />
}
