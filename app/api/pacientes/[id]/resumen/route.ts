import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Resumen de KPIs de un paciente (tratamientos + recaudación).
// Se llama on-demand al expandir una fila en el listado.
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const paciente = await prisma.paciente.findFirst({
    where: { id, clinicaId: u.clinicaId },
    include: {
      fichaClinica: {
        select: {
          tratamientos: {
            select: { estado: true, precio: true },
          },
        },
      },
      cobros: { select: { monto: true, estado: true } },
      presupuestos: { select: { estado: true, vigencia: true } },
    },
  })
  if (!paciente) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const tratamientos = paciente.fichaClinica?.tratamientos ?? []
  const activos = tratamientos.filter((t) => t.estado === 'PLANIFICADO' || t.estado === 'EN_PROGRESO').length
  const finalizados = tratamientos.filter((t) => t.estado === 'COMPLETADO').length
  const expirados = paciente.presupuestos.filter(
    (p) => p.vigencia && new Date(p.vigencia) < new Date() && p.estado !== 'APROBADO'
  ).length

  const realizado = tratamientos.filter((t) => t.estado === 'COMPLETADO').reduce((s, t) => s + t.precio, 0)
  const abonado = paciente.cobros.filter((c) => c.estado === 'PAGADO').reduce((s, c) => s + c.monto, 0)

  return NextResponse.json({
    tratamientosCount: tratamientos.length,
    activos, finalizados, expirados,
    realizado, abonado,
    saldo: Math.max(realizado - abonado, 0),
  })
}
