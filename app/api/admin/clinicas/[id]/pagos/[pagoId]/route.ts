import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// DELETE /api/admin/clinicas/[id]/pagos/[pagoId]
// Anula un pago. Recalcula proximoCobro a partir del pago más reciente que quede.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; pagoId: string }> },
) {
  const admin = await requireSuperAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, pagoId } = await params

  const pago = await prisma.pagoSuscripcion.findUnique({ where: { id: pagoId } })
  if (!pago || pago.clinicaId !== id) {
    return NextResponse.json({ error: 'Pago no existe' }, { status: 404 })
  }

  await prisma.$transaction(async (tx) => {
    await tx.pagoSuscripcion.delete({ where: { id: pagoId } })
    // proximoCobro = periodoHasta del pago más reciente restante (o null si no quedan)
    const ultimo = await tx.pagoSuscripcion.findFirst({
      where: { clinicaId: id },
      orderBy: { periodoHasta: 'desc' },
    })
    await tx.clinica.update({
      where: { id },
      data: { proximoCobro: ultimo ? ultimo.periodoHasta : null },
    })
  })

  return NextResponse.json({ ok: true })
}
