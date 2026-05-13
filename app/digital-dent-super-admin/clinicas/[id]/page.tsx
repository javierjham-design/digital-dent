export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ClinicaDetailClient } from './clinica-detail-client'

export default async function ClinicaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const clinica = await prisma.clinica.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          users: true,
          pacientes: true,
          citas: true,
          presupuestos: true,
          cobros: true,
          prestaciones: true,
        },
      },
    },
  })

  if (!clinica) notFound()

  const [cobrosAgg, ultimoUsuario] = await Promise.all([
    prisma.cobro.aggregate({
      where: { clinicaId: id },
      _sum: { monto: true },
      _count: true,
    }),
    prisma.user.findFirst({
      where: { clinicaId: id },
      orderBy: { createdAt: 'asc' },
      select: { name: true, email: true, role: true, createdAt: true },
    }),
  ])

  return (
    <ClinicaDetailClient
      clinica={{
        id: clinica.id,
        slug: clinica.slug,
        nombre: clinica.nombre,
        rut: clinica.rut,
        direccion: clinica.direccion,
        ciudad: clinica.ciudad,
        telefono: clinica.telefono,
        email: clinica.email,
        plan: clinica.plan,
        activo: clinica.activo,
        trialHasta: clinica.trialHasta?.toISOString() ?? null,
        createdAt: clinica.createdAt.toISOString(),
        updatedAt: clinica.updatedAt.toISOString(),
        counts: clinica._count,
        volumenCobrado: cobrosAgg._sum.monto ?? 0,
        totalCobros: cobrosAgg._count,
        adminInicial: ultimoUsuario ? {
          name: ultimoUsuario.name ?? null,
          email: ultimoUsuario.email,
          role: ultimoUsuario.role,
          createdAt: ultimoUsuario.createdAt.toISOString(),
        } : null,
      }}
    />
  )
}
