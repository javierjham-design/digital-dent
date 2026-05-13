export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'
import { PrestacionesClient } from './prestaciones-client'

export default async function PrestacionesPage() {
  const u = await getSessionUser()
  if (!u?.clinicaId) redirect('/login')
  const prestaciones = await prisma.prestacion.findMany({
    where: { clinicaId: u.clinicaId },
    orderBy: [{ categoria: 'asc' }, { nombre: 'asc' }],
  })
  return <PrestacionesClient initialPrestaciones={prestaciones} />
}
