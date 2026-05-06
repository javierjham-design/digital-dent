export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { CobrosClient } from './cobros-client'

export default async function CobrosPage() {
  const cobros = await prisma.cobro.findMany({
    include: { paciente: true },
    orderBy: { createdAt: 'desc' },
  })

  const pacientes = await prisma.paciente.findMany({
    where: { activo: true },
    select: { id: true, nombre: true, apellido: true, rut: true },
    orderBy: { apellido: 'asc' },
  })

  return (
    <CobrosClient
      cobros={cobros.map((c) => ({
        id: c.id,
        numero: c.numero,
        concepto: c.concepto,
        monto: c.monto,
        estado: c.estado,
        metodoPago: c.metodoPago,
        fechaPago: c.fechaPago?.toISOString() ?? null,
        paciente: `${c.paciente.nombre} ${c.paciente.apellido}`,
        createdAt: c.createdAt.toISOString(),
      }))}
      pacientes={pacientes}
    />
  )
}
