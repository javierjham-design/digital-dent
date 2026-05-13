export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'
import { PacientesClient } from './pacientes-client'

export default async function PacientesPage() {
  const u = await getSessionUser()
  if (!u?.clinicaId) redirect('/login')

  const pacientes = await prisma.paciente.findMany({
    where: { clinicaId: u.clinicaId },
    orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
    include: {
      _count: { select: { citas: true } },
      fichaClinica: {
        select: {
          tratamientos: {
            select: { id: true, estado: true, precio: true, fecha: true },
          },
        },
      },
      cobros: {
        select: { monto: true, estado: true },
      },
      presupuestos: {
        select: { total: true, estado: true, vigencia: true },
      },
    },
  })

  return (
    <PacientesClient
      pacientes={pacientes.map((p) => {
        const tratamientos = p.fichaClinica?.tratamientos ?? []
        const activos = tratamientos.filter((t) => t.estado === 'PLANIFICADO' || t.estado === 'EN_PROGRESO').length
        const finalizados = tratamientos.filter((t) => t.estado === 'COMPLETADO').length
        const expirados = p.presupuestos.filter(
          (pr) => pr.vigencia && new Date(pr.vigencia) < new Date() && pr.estado !== 'APROBADO'
        ).length

        const realizado = tratamientos
          .filter((t) => t.estado === 'COMPLETADO')
          .reduce((s, t) => s + t.precio, 0)
        const abonado = p.cobros
          .filter((c) => c.estado === 'PAGADO')
          .reduce((s, c) => s + c.monto, 0)

        return {
          id: p.id,
          numero: p.numero ?? 0,
          rut: p.rut,
          nombre: p.nombre,
          apellido: p.apellido,
          telefono: p.telefono,
          email: p.email,
          prevision: p.prevision,
          activo: p.activo,
          totalCitas: p._count.citas,
          createdAt: p.createdAt.toISOString(),
          // KPIs
          tratamientosCount: tratamientos.length,
          activos,
          finalizados,
          expirados,
          realizado,
          abonado,
          saldo: Math.max(realizado - abonado, 0),
        }
      })}
    />
  )
}
