export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { getPlanes } from '@/lib/plans'
import { PlanesClient } from './planes-client'

export default async function PlanesPage() {
  const planes = await getPlanes()

  // Conteo de uso (cuántas clínicas usan cada plan)
  const usoRaw = await prisma.clinica.groupBy({
    by: ['plan'],
    _count: { plan: true },
  })
  const uso: Record<string, number> = {}
  for (const r of usoRaw) uso[r.plan] = r._count.plan

  return (
    <PlanesClient
      planes={planes.map((p) => ({
        ...p,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        clinicasUsando: uso[p.id] ?? 0,
      }))}
    />
  )
}
