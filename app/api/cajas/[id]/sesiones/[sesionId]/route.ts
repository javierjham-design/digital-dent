import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'
import { calcularResumenSesion } from '@/lib/caja'

// Detalle completo de una sesión específica (abierta o cerrada).
// Devuelve sesión + movimientos enriquecidos para vista read-only.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; sesionId: string }> },
) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, sesionId } = await params

  const caja = await prisma.caja.findFirst({
    where: { id, clinicaId: u.clinicaId },
    include: { usuarios: { select: { userId: true } } },
  })
  if (!caja) return NextResponse.json({ error: 'Caja no encontrada' }, { status: 404 })
  if (u.role !== 'admin' && !caja.usuarios.some(cu => cu.userId === u.id)) {
    return NextResponse.json({ error: 'No tienes acceso a esta caja.' }, { status: 403 })
  }

  const sesion = await prisma.sesionCaja.findFirst({
    where: { id: sesionId, cajaId: id, clinicaId: u.clinicaId },
  })
  if (!sesion) return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })

  const hasta = sesion.cerradaAt ?? new Date()
  const movimientos = await prisma.movimientoCaja.findMany({
    where: {
      cajaId: id,
      OR: [
        { sesionCajaId: sesionId },
        { sesionCajaId: null, fecha: { gte: sesion.abiertaAt, lte: hasta } },
      ],
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      cobro: {
        select: {
          id: true,
          numero: true,
          monto: true,
          montoNeto: true,
          comisionMonto: true,
          anulado: true,
          medioPago: { select: { id: true, nombre: true } },
          paciente: { select: { id: true, nombre: true, apellido: true } },
        },
      },
    },
    orderBy: { fecha: 'desc' },
  })

  const resumen = await calcularResumenSesion(sesionId)

  return NextResponse.json({ sesion, movimientos, resumen })
}
