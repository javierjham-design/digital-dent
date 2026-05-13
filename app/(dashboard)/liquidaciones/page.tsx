export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'
import { LiquidacionesClient } from './liquidaciones-client'

export default async function LiquidacionesPage() {
  const u = await getSessionUser()
  if (!u?.clinicaId) redirect('/login')

  const [liquidaciones, doctores] = await Promise.all([
    prisma.liquidacion.findMany({
      where: { clinicaId: u.clinicaId },
      include: {
        doctor: { select: { id: true, name: true, email: true, especialidad: true } },
        contrato: true,
        _count: { select: { items: true } },
      },
      orderBy: [{ periodo: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.user.findMany({
      where: { clinicaId: u.clinicaId, role: 'doctor', activo: true, contratos: { some: { activo: true } } },
      select: { id: true, name: true, email: true, especialidad: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return (
    <LiquidacionesClient
      liquidaciones={liquidaciones.map((l) => ({
        ...l,
        createdAt: l.createdAt.toISOString(),
        updatedAt: l.updatedAt.toISOString(),
        fechaPago: l.fechaPago?.toISOString() ?? null,
        contrato: {
          ...l.contrato,
          fechaInicio: l.contrato.fechaInicio.toISOString(),
          fechaFin: l.contrato.fechaFin?.toISOString() ?? null,
          createdAt: l.contrato.createdAt.toISOString(),
          updatedAt: l.contrato.updatedAt.toISOString(),
        },
      }))}
      doctores={doctores}
    />
  )
}
