export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { PLAN_PRICES } from '@/lib/plans'
import { ClinicaDetailClient } from './clinica-detail-client'

export default async function ClinicaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const clinica = await prisma.clinica.findUnique({ where: { id } })
  if (!clinica) notFound()

  const [
    totalUsuarios,
    totalPacientes,
    pacientesConAgenda,
    totalCitas,
    cobrosAgg,
    cobrosUltimos90Dias,
    adminInicial,
  ] = await Promise.all([
    prisma.user.count({ where: { clinicaId: id, activo: true } }),
    prisma.paciente.count({ where: { clinicaId: id, activo: true } }),
    prisma.paciente.count({ where: { clinicaId: id, activo: true, citas: { some: {} } } }),
    prisma.cita.count({ where: { clinicaId: id } }),
    prisma.cobro.aggregate({ where: { clinicaId: id }, _sum: { monto: true }, _count: true }),
    prisma.cobro.aggregate({
      where: {
        clinicaId: id,
        fechaPago: { gte: new Date(Date.now() - 90 * 86400000) },
      },
      _sum: { monto: true },
    }),
    prisma.user.findFirst({
      where: { clinicaId: id },
      orderBy: { createdAt: 'asc' },
      select: { name: true, email: true, role: true, createdAt: true, passwordChangedAt: true, username: true },
    }),
  ])

  const pacientesSinAgenda = totalPacientes - pacientesConAgenda

  // Storage placeholder: hasta que exista módulo de archivos (Fase 2)
  const storage = {
    bytesUsados: 0,
    cuotaBytes: clinica.plan === 'PRO' ? 50 * 1024 ** 3 : clinica.plan === 'BASICO' ? 10 * 1024 ** 3 : 1 * 1024 ** 3,
  }

  const precioMensual = PLAN_PRICES[clinica.plan] ?? 0
  const platformDomain = process.env.PLATFORM_DOMAIN ?? null
  const passwordPendiente = adminInicial?.username === 'Administrador' && adminInicial?.passwordChangedAt == null

  return (
    <ClinicaDetailClient
      platformDomain={platformDomain}
      passwordPendiente={passwordPendiente}
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
        precioMensual,
        stats: {
          usuarios: totalUsuarios,
          pacientes: totalPacientes,
          pacientesConAgenda,
          pacientesSinAgenda,
          citas: totalCitas,
          volumenCobrado: cobrosAgg._sum.monto ?? 0,
          totalCobros: cobrosAgg._count,
          volumen90d: cobrosUltimos90Dias._sum.monto ?? 0,
        },
        storage,
        adminInicial: adminInicial ? {
          name: adminInicial.name ?? null,
          email: adminInicial.email,
          role: adminInicial.role,
          createdAt: adminInicial.createdAt.toISOString(),
        } : null,
      }}
    />
  )
}
