export const dynamic = 'force-dynamic'

import { getSessionUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ReportesClient } from './reportes-client'

export default async function ReportesPage() {
  const u = await getSessionUser()
  if (!u?.clinicaId) return null

  const doctores = await prisma.user.findMany({
    where: { clinicaId: u.clinicaId, role: 'doctor', activo: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  return <ReportesClient doctores={doctores.map((d) => ({ id: d.id, name: d.name ?? '' }))} />
}
