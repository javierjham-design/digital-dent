export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { DashboardClient } from './dashboard-client'
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay } from 'date-fns'

export default async function DashboardPage() {
  const hoy = new Date()
  const inicioMes = startOfMonth(hoy)
  const finMes = endOfMonth(hoy)
  const inicioDia = startOfDay(hoy)
  const finDia = endOfDay(hoy)

  const [
    totalPacientes,
    citasHoy,
    citasMes,
    cobrosMes,
    citasPorDia,
    proximasCitas,
    distribucionEstados,
  ] = await Promise.all([
    prisma.paciente.count({ where: { activo: true } }),
    prisma.cita.count({ where: { fecha: { gte: inicioDia, lte: finDia } } }),
    prisma.cita.count({ where: { fecha: { gte: inicioMes, lte: finMes } } }),
    prisma.cobro.aggregate({
      where: { estado: 'PAGADO', fechaPago: { gte: inicioMes, lte: finMes } },
      _sum: { monto: true },
    }),
    prisma.cita.groupBy({
      by: ['fecha'],
      where: { fecha: { gte: inicioMes, lte: finMes } },
      _count: { id: true },
      orderBy: { fecha: 'asc' },
    }),
    prisma.cita.findMany({
      where: { fecha: { gte: hoy }, estado: { in: ['PENDIENTE', 'CONFIRMADA'] } },
      include: { paciente: true, doctor: true },
      orderBy: { fecha: 'asc' },
      take: 8,
    }),
    prisma.cita.groupBy({
      by: ['estado'],
      where: { fecha: { gte: inicioMes, lte: finMes } },
      _count: { id: true },
    }),
  ])

  const graficoCitas = citasPorDia.map((c) => ({
    dia: format(new Date(c.fecha), 'd'),
    citas: c._count.id,
  }))

  const estadosCitas = distribucionEstados.map((e) => ({
    name: e.estado,
    value: e._count.id,
  }))

  return (
    <DashboardClient
      stats={{
        totalPacientes,
        citasHoy,
        citasMes,
        ingresosMes: cobrosMes._sum.monto ?? 0,
      }}
      graficoCitas={graficoCitas}
      estadosCitas={estadosCitas}
      proximasCitas={proximasCitas.map((c) => ({
        id: c.id,
        paciente: `${c.paciente.nombre} ${c.paciente.apellido}`,
        doctor: c.doctor.name ?? c.doctor.email,
        fecha: c.fecha.toISOString(),
        tipo: c.tipo ?? 'Consulta',
        estado: c.estado,
      }))}
    />
  )
}
