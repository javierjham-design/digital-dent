export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'
import { PresupuestosClient } from './presupuestos-client'

export default async function PresupuestosPage() {
  const u = await getSessionUser()
  if (!u?.clinicaId) redirect('/login')

  const [presupuestos, pacientes, prestaciones] = await Promise.all([
    prisma.presupuesto.findMany({
      where: { clinicaId: u.clinicaId },
      include: {
        paciente: true,
        items: { include: { prestacion: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.paciente.findMany({ where: { clinicaId: u.clinicaId, activo: true }, select: { id: true, nombre: true, apellido: true }, orderBy: { apellido: 'asc' } }),
    prisma.prestacion.findMany({ where: { clinicaId: u.clinicaId, activo: true }, orderBy: { nombre: 'asc' } }),
  ])

  return (
    <PresupuestosClient
      presupuestos={presupuestos.map((p) => ({
        id: p.id,
        numero: p.numero,
        estado: p.estado,
        total: p.total,
        paciente: `${p.paciente.nombre} ${p.paciente.apellido}`,
        createdAt: p.createdAt.toISOString(),
        items: p.items.map((i) => ({ prestacion: i.prestacion.nombre, cantidad: i.cantidad, subtotal: i.subtotal })),
      }))}
      pacientes={pacientes}
      prestaciones={prestaciones}
    />
  )
}
