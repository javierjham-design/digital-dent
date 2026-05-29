import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const existing = await prisma.cobro.findFirst({
    where: { id, clinicaId: u.clinicaId },
    select: { id: true, anulado: true, numero: true },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.anulado) return NextResponse.json({ error: 'El cobro ya está anulado' }, { status: 400 })

  // Permiso: admin o puedeEditarPagos
  const me = await prisma.user.findUnique({
    where: { id: u.id },
    select: { role: true, puedeEditarPagos: true, name: true, email: true },
  })
  const allowed = me?.role === 'admin' || me?.puedeEditarPagos
  if (!allowed) {
    return NextResponse.json({ error: 'No tienes permiso para anular pagos.' }, { status: 403 })
  }

  const body = await req.json()
  const motivo = typeof body.motivo === 'string' ? body.motivo.trim() : ''
  if (motivo.length < 4) {
    return NextResponse.json({ error: 'Debes indicar un motivo (mínimo 4 caracteres).' }, { status: 400 })
  }

  const nombre = me?.name ?? me?.email ?? 'Sistema'
  const cobro = await prisma.$transaction(async (tx) => {
    const updated = await tx.cobro.update({
      where: { id },
      data: {
        anulado: true,
        motivoAnulacion: motivo,
        anuladoAt: new Date(),
        anuladoPorId: u.id,
        anuladoPorNombre: nombre,
        estado: 'ANULADO',
      },
      include: {
        paciente: true,
        medioPago: true,
        reciboUsuario: { select: { id: true, name: true, email: true } },
        items: true,
      },
    })
    // Anular movimientos de caja asociados al cobro
    await tx.movimientoCaja.updateMany({
      where: { cobroId: id, anulado: false },
      data: {
        anulado: true,
        motivoAnulacion: `Cobro anulado · ${motivo}`,
        anuladoAt: new Date(),
        anuladoPorId: u.id,
        anuladoPorNombre: nombre,
      },
    })
    return updated
  })
  return NextResponse.json(cobro)
}
