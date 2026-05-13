export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { notFound, redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { FichaClinicaClient } from './ficha-client'

export default async function FichaPacientePage({ params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) redirect('/login')

  const { id } = await params
  const paciente = await prisma.paciente.findFirst({
    where: { id, clinicaId: u.clinicaId },
    include: {
      fichaClinica: { include: { tratamientos: { include: { prestacion: true } }, odontograma: true } },
      citas: { include: { doctor: true }, orderBy: { fecha: 'desc' }, take: 10 },
      cobros: { orderBy: { createdAt: 'desc' }, take: 10 },
      presupuestos: { include: { items: { include: { prestacion: true } } }, orderBy: { createdAt: 'desc' }, take: 5 },
    },
  })

  if (!paciente) notFound()

  const doctors = await prisma.user.findMany({ where: { clinicaId: u.clinicaId, role: { in: ['admin', 'doctor'] } }, select: { id: true, name: true, email: true } })
  const prestaciones = await prisma.prestacion.findMany({ where: { clinicaId: u.clinicaId, activo: true }, orderBy: { nombre: 'asc' } })

  return (
    <FichaClinicaClient
      paciente={{
        ...paciente,
        fechaNacimiento: paciente.fechaNacimiento?.toISOString() ?? null,
        createdAt: paciente.createdAt.toISOString(),
        updatedAt: paciente.updatedAt.toISOString(),
        fichaClinica: paciente.fichaClinica ? {
          ...paciente.fichaClinica,
          createdAt: paciente.fichaClinica.createdAt.toISOString(),
          updatedAt: paciente.fichaClinica.updatedAt.toISOString(),
          tratamientos: paciente.fichaClinica.tratamientos.map((t) => ({
            ...t,
            fecha: t.fecha.toISOString(),
          })),
        } : null,
        citas: paciente.citas.map((c) => ({ ...c, fecha: c.fecha.toISOString(), createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString() })),
        cobros: paciente.cobros.map((c) => ({ ...c, fechaPago: c.fechaPago?.toISOString() ?? null, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString() })),
        presupuestos: paciente.presupuestos.map((p) => ({ ...p, vigencia: p.vigencia?.toISOString() ?? null, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString() })),
      }}
      doctors={doctors}
      prestaciones={prestaciones}
    />
  )
}
