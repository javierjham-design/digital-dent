export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { ClinicasListClient } from './clinicas-list-client'

export default async function ClinicasListPage() {
  const clinicas = await prisma.clinica.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: {
          users: true,
          pacientes: true,
          citas: true,
        },
      },
    },
  })

  const platformDomain = process.env.PLATFORM_DOMAIN ?? null

  return (
    <ClinicasListClient
      platformDomain={platformDomain}
      clinicas={clinicas.map((c) => ({
        id: c.id,
        slug: c.slug,
        nombre: c.nombre,
        plan: c.plan,
        activo: c.activo,
        ciudad: c.ciudad,
        email: c.email,
        telefono: c.telefono,
        trialHasta: c.trialHasta?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
        usuarios: c._count.users,
        pacientes: c._count.pacientes,
        citas: c._count.citas,
      }))}
    />
  )
}
