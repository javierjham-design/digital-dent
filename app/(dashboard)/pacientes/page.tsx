export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'
import { PacientesClient } from './pacientes-client'

export default async function PacientesPage() {
  const u = await getSessionUser()
  if (!u?.clinicaId) redirect('/login')

  // Query liviana: campos planos del paciente
  const pacientes = await prisma.paciente.findMany({
    where: { clinicaId: u.clinicaId },
    orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
    select: {
      id: true, numero: true, rut: true, nombre: true, apellido: true,
      telefono: true, email: true, prevision: true, activo: true,
      createdAt: true,
    },
  })

  return (
    <PacientesClient
      pacientes={pacientes.map((p) => ({
        id: p.id,
        numero: p.numero ?? 0,
        rut: p.rut,
        nombre: p.nombre,
        apellido: p.apellido,
        telefono: p.telefono,
        email: p.email,
        prevision: p.prevision,
        activo: p.activo,
        createdAt: p.createdAt.toISOString(),
      }))}
    />
  )
}
