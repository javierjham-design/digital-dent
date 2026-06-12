export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getEstadoPago, precioMensualEfectivo, type PlanPriceMap } from '@/lib/billing'
import { getPlanes } from '@/lib/plans'
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
    pagosSuscripcion,
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
    prisma.pagoSuscripcion.findMany({
      where: { clinicaId: id },
      orderBy: { fechaPago: 'desc' },
    }),
  ])

  const extras = await prisma.extraSuscripcion.findMany({
    where: { clinicaId: id },
    orderBy: { createdAt: 'asc' },
  })
  const montoExtras = extras.filter((e) => e.activo).reduce((s, e) => s + e.montoMensual, 0)

  const pacientesSinAgenda = totalPacientes - pacientesConAgenda

  // Storage placeholder: hasta que exista módulo de archivos (Fase 2)
  const storage = {
    bytesUsados: 0,
    cuotaBytes: clinica.plan === 'PRO' ? 50 * 1024 ** 3 : clinica.plan === 'BASICO' ? 10 * 1024 ** 3 : 1 * 1024 ** 3,
  }

  const planes = await getPlanes()
  const priceMap: PlanPriceMap = {}
  for (const p of planes) priceMap[p.id] = p.precioMensual

  const billingInput = {
    plan: clinica.plan,
    activo: clinica.activo,
    trialHasta: clinica.trialHasta,
    proximoCobro: clinica.proximoCobro,
    precioAcordado: clinica.precioAcordado,
    cicloFacturacion: clinica.cicloFacturacion,
  }
  const precioMensual = precioMensualEfectivo(billingInput, priceMap)
  const estadoPago = getEstadoPago(billingInput)
  const platformDomain = process.env.PLATFORM_DOMAIN ?? null
  const passwordPendiente = adminInicial?.username === 'Administrador' && adminInicial?.passwordChangedAt == null

  const planesDisponibles = planes
    .filter((p) => p.activo)
    .map((p) => ({ id: p.id, nombre: p.nombre, precioMensual: p.precioMensual }))

  return (
    <ClinicaDetailClient
      platformDomain={platformDomain}
      passwordPendiente={passwordPendiente}
      planesDisponibles={planesDisponibles}
      extras={extras.map((e) => ({
        id: e.id,
        codigo: e.codigo,
        nombre: e.nombre,
        montoMensual: e.montoMensual,
        activo: e.activo,
        notas: e.notas,
      }))}
      whatsapp={{
        waEnabled: clinica.waEnabled,
        waTwilioSid: clinica.waTwilioSid,
        waNumero: clinica.waNumero,
        waTemplateSid: clinica.waTemplateSid,
        waHorasAntes: clinica.waHorasAntes,
        tokenConfigurado: Boolean(clinica.waTwilioToken),
      }}
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
        proximoCobro: clinica.proximoCobro?.toISOString() ?? null,
        cicloFacturacion: clinica.cicloFacturacion,
        precioAcordado: clinica.precioAcordado,
        notasInternas: clinica.notasInternas,
        estadoPago,
        createdAt: clinica.createdAt.toISOString(),
        updatedAt: clinica.updatedAt.toISOString(),
        precioMensual,
        montoExtras,
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
        pagos: pagosSuscripcion.map((p) => ({
          id: p.id,
          fechaPago: p.fechaPago.toISOString(),
          monto: p.monto,
          periodoDesde: p.periodoDesde.toISOString(),
          periodoHasta: p.periodoHasta.toISOString(),
          metodoPago: p.metodoPago,
          comprobante: p.comprobante,
          notas: p.notas,
        })),
      }}
    />
  )
}
