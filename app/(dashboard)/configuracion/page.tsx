export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { ConfiguracionClient } from './configuracion-client'

export default async function ConfiguracionPage() {
  const config = await prisma.configuracion.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  })
  return <ConfiguracionClient config={config} />
}
