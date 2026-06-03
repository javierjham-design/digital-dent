export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'
import { LiquidacionesClient } from './liquidaciones-client'

export default async function LiquidacionesPage() {
  const u = await getSessionUser()
  if (!u?.clinicaId) redirect('/login')

  const canManage = u.role === 'admin' || u.puedeGestionarLiquidaciones

  const [liquidaciones, doctores] = await Promise.all([
    prisma.liquidacion.findMany({
      where: canManage
        ? { clinicaId: u.clinicaId }
        : { clinicaId: u.clinicaId, doctorId: u.id },
      include: {
        doctor: { select: { id: true, name: true, email: true, especialidad: true } },
        contrato: true,
        _count: { select: { items: true } },
      },
      orderBy: [{ periodo: 'desc' }, { createdAt: 'desc' }],
    }),
    // Solo los gestores necesitan la lista de doctores (para seleccionar
    // a quién generarle liquidación). Doctores comunes ven solo lo suyo.
    canManage
      ? prisma.user.findMany({
          where: { clinicaId: u.clinicaId, role: { in: ['doctor', 'medico'] }, activo: true, contratos: { some: { activo: true } } },
          select: { id: true, name: true, email: true, especialidad: true },
          orderBy: { name: 'asc' },
        })
      : Promise.resolve([]),
  ])

  return (
    <LiquidacionesClient
      canManage={canManage}
      currentUserId={u.id}
      liquidaciones={liquidaciones.map((l) => ({
        id: l.id,
        doctorId: l.doctorId,
        periodo: l.periodo,
        totalBruto: l.totalBruto,
        totalLiquidado: l.totalLiquidado,
        estado: l.estado,
        notas: l.notas,
        fechaPago: l.fechaPago?.toISOString() ?? null,
        createdAt: l.createdAt.toISOString(),
        updatedAt: l.updatedAt.toISOString(),
        doctor: l.doctor,
        contrato: {
          id: l.contrato.id,
          tipo: l.contrato.tipo,
          porcentaje: l.contrato.porcentaje,
          montoFijo: l.contrato.montoFijo,
        },
        _count: { items: l._count.items },
      }))}
      doctores={doctores}
    />
  )
}
