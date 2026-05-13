export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'
import { UsuariosClient } from './usuarios-client'

export default async function UsuariosPage() {
  const u = await getSessionUser()
  if (!u?.clinicaId) redirect('/login')

  const [usuarios, contratos, horarios] = await Promise.all([
    prisma.user.findMany({
      where: { clinicaId: u.clinicaId },
      orderBy: { name: 'asc' },
      include: { contratos: { where: { activo: true }, take: 1 } },
    }),
    prisma.contrato.findMany({
      where: { clinicaId: u.clinicaId },
      include: { doctor: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.horarioDoctor.findMany({
      where: { clinicaId: u.clinicaId },
      orderBy: [{ doctorId: 'asc' }, { diaSemana: 'asc' }],
    }),
  ])

  return (
    <UsuariosClient
      usuarios={usuarios.map((u) => ({
        ...u,
        createdAt: u.createdAt.toISOString(),
        updatedAt: u.updatedAt.toISOString(),
        contratos: u.contratos.map((c) => ({
          ...c,
          fechaInicio: c.fechaInicio.toISOString(),
          fechaFin: c.fechaFin?.toISOString() ?? null,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
        })),
      }))}
      contratos={contratos.map((c) => ({
        ...c,
        fechaInicio: c.fechaInicio.toISOString(),
        fechaFin: c.fechaFin?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      }))}
      horarios={horarios}
    />
  )
}
