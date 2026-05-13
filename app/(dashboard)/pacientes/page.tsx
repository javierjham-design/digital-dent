export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'
import { PacientesClient } from './pacientes-client'

export default async function PacientesPage() {
  const u = await getSessionUser()
  if (!u?.clinicaId) redirect('/login')

  const pacientes = await prisma.paciente.findMany({
    where: { clinicaId: u.clinicaId },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { citas: true } },
    },
  })

  return (
    <PacientesClient
      pacientes={pacientes.map((p) => ({
        id: p.id,
        rut: p.rut,
        nombre: p.nombre,
        apellido: p.apellido,
        telefono: p.telefono,
        email: p.email,
        prevision: p.prevision,
        activo: p.activo,
        totalCitas: p._count.citas,
        createdAt: p.createdAt.toISOString(),
      }))}
    />
  )
}
