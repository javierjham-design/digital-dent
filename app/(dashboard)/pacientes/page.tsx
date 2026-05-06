import { prisma } from '@/lib/prisma'
import { PacientesClient } from './pacientes-client'

export default async function PacientesPage() {
  const pacientes = await prisma.paciente.findMany({
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
