import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

// Anular un movimiento manual de caja (motivo obligatorio).
// Los movimientos generados por cobros se anulan al anular el cobro, no por aquí.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; movId: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, movId } = await params

  const mov = await prisma.movimientoCaja.findFirst({
    where: { id: movId, cajaId: id, clinicaId: u.clinicaId },
    select: { id: true, anulado: true, cobroId: true },
  })
  if (!mov) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (mov.anulado) return NextResponse.json({ error: 'El movimiento ya está anulado' }, { status: 400 })
  if (mov.cobroId) {
    return NextResponse.json({
      error: 'Este movimiento proviene de un cobro. Para revertirlo, anula el cobro desde Cobros.',
    }, { status: 400 })
  }

  // Permisos: admin o puedeEditarPagos
  const me = await prisma.user.findUnique({
    where: { id: u.id },
    select: { role: true, puedeEditarPagos: true, name: true, email: true },
  })
  const allowed = me?.role === 'admin' || me?.puedeEditarPagos
  if (!allowed) return NextResponse.json({ error: 'No tienes permiso para anular movimientos.' }, { status: 403 })

  const body = await req.json()
  const motivo = typeof body.motivo === 'string' ? body.motivo.trim() : ''
  if (motivo.length < 4) {
    return NextResponse.json({ error: 'Debes indicar un motivo (mínimo 4 caracteres).' }, { status: 400 })
  }

  const nombre = me?.name ?? me?.email ?? 'Sistema'
  const updated = await prisma.movimientoCaja.update({
    where: { id: movId },
    data: {
      anulado: true,
      motivoAnulacion: motivo,
      anuladoAt: new Date(),
      anuladoPorId: u.id,
      anuladoPorNombre: nombre,
    },
  })
  return NextResponse.json(updated)
}
